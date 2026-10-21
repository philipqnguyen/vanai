#!/usr/bin/env bash
#
# Vanai — Claude Code cloud environment SETUP SCRIPT.
#
# Paste the contents of this file into the "Setup script" field of your cloud
# environment at claude.ai/code. It runs as root on Ubuntu 24.04 once per
# environment build, before Claude Code launches. Anthropic then snapshots the
# filesystem, so later sessions start with Ruby, Node, gems, node_modules and a
# Postgres cluster already on disk and skip this script entirely.
#
# A snapshot keeps files, not processes — nothing this script *starts* survives.
# Per-session work (booting Postgres, migrating for the branch at hand) lives in
# scripts/cloud-session-start.sh, wired as a SessionStart hook in
# .claude/settings.json.
#
# Two constraints this is written around:
#   * It must exit 0. A non-zero exit fails the session, so every step is
#     best-effort and failures are logged, not fatal.
#   * It must finish in roughly five minutes or the environment cache never
#     builds and every session pays the full cost. Independent installs run in
#     parallel, and Ruby is copied out of the official Docker image rather than
#     built from source.
#
# It is also safe to run by hand on a fresh Ubuntu box: sudo bash scripts/cloud-setup.sh
#
set -uo pipefail

log()  { printf '\n[vanai-setup] %s\n' "$*"; }
warn() { printf '\n[vanai-setup] WARNING: %s\n' "$*" >&2; }

START_TS=$SECONDS
elapsed() { printf '%dm%02ds' $(( (SECONDS - START_TS) / 60 )) $(( (SECONDS - START_TS) % 60 )); }

# Versions used when the repository can't be located (see find_repo). The real
# values are read from server/.ruby-version and the Dockerfile's NODE_VERSION arg
# so this script never drifts from what production builds.
RUBY_VERSION_DEFAULT=4.0.6
NODE_VERSION_DEFAULT=25.9.0

# --------------------------------------------------------------------------- #
# Locate the checkout                                                          #
# --------------------------------------------------------------------------- #
# The VM clones the repo before this runs, but the path isn't contractual, so
# look for the shape of *this* repo rather than a hardcoded directory. If it
# isn't found we still provision the toolchain; the SessionStart hook installs
# gems and packages later, just without the snapshot's speed.

find_repo() {
  local c
  for c in "${CLAUDE_PROJECT_DIR:-}" "$PWD" /workspace /workspace/* /repo /repos/* /src /home/*/* /root/*; do
    [ -n "$c" ] && [ -f "$c/server/Gemfile" ] && [ -f "$c/client/package.json" ] && { echo "$c"; return 0; }
  done
  c=$(timeout 30 find / -xdev -maxdepth 6 -type f -path '*/server/Gemfile' \
        -not -path '*/node_modules/*' -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null | head -1)
  [ -n "$c" ] && [ -f "$(dirname "$(dirname "$c")")/client/package.json" ] && dirname "$(dirname "$c")"
}

REPO=$(find_repo)
if [ -n "$REPO" ]; then
  log "repository at $REPO"
  [ -f "$REPO/server/.ruby-version" ] && RUBY_VERSION_DEFAULT=$(tr -d '[:space:]' < "$REPO/server/.ruby-version")
  NODE_ARG=$(grep -m1 '^ARG NODE_VERSION=' "$REPO/server/Dockerfile" 2>/dev/null | cut -d= -f2)
  [ -n "${NODE_ARG:-}" ] && NODE_VERSION_DEFAULT=$NODE_ARG
else
  warn "repository not found; provisioning the toolchain only"
fi

RUBY_VERSION=$RUBY_VERSION_DEFAULT
NODE_VERSION=$NODE_VERSION_DEFAULT
log "targeting Ruby $RUBY_VERSION and Node $NODE_VERSION"

# --------------------------------------------------------------------------- #
# System packages                                                              #
# --------------------------------------------------------------------------- #
# Mirrors server/Dockerfile: libpq-dev + build-essential for the pg gem's native
# extension, libvips for image_processing, libyaml-dev for psych. postgresql-client
# gives psql/pg_dump against the local cluster.

install_apt() {
  log "apt: installing build and runtime dependencies"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq \
    && apt-get install --no-install-recommends -qq -y \
         build-essential git curl xz-utils pkg-config \
         libpq-dev libyaml-dev libvips libjemalloc2 \
         libssl-dev zlib1g-dev libffi-dev libgmp-dev libreadline-dev \
         postgresql-client \
    || warn "apt install failed; a later step may fail because of it"
}

# --------------------------------------------------------------------------- #
# Node                                                                         #
# --------------------------------------------------------------------------- #
# The image ships Node 20/21/22. The client is built against 25.x in production,
# so install the pinned version rather than trusting 22 to behave the same.

NODE_PREFIX=/opt/node-vanai

install_node() {
  if [ -x "$NODE_PREFIX/bin/node" ] && [ "v$NODE_VERSION" = "$("$NODE_PREFIX/bin/node" -v 2>/dev/null)" ]; then
    log "node: v$NODE_VERSION already installed"
  else
    local url=https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz
    log "node: fetching $url"
    rm -rf "$NODE_PREFIX.tmp" && mkdir -p "$NODE_PREFIX.tmp"
    if curl -fsSL --retry 3 --retry-delay 2 "$url" | tar -xJ -C "$NODE_PREFIX.tmp" --strip-components=1; then
      rm -rf "$NODE_PREFIX" && mv "$NODE_PREFIX.tmp" "$NODE_PREFIX"
    else
      warn "node $NODE_VERSION download failed; falling back to the preinstalled $(node -v 2>/dev/null || echo 'none')"
      rm -rf "$NODE_PREFIX.tmp"
      return 0
    fi
  fi
  local b
  for b in node npm npx; do ln -sfn "$NODE_PREFIX/bin/$b" "/usr/local/bin/$b"; done
  log "node: $("$NODE_PREFIX/bin/node" -v)"
}

# --------------------------------------------------------------------------- #
# Ruby                                                                         #
# --------------------------------------------------------------------------- #
# The image ships Ruby 3.1-3.3; this app needs 4.0.x, and ruby/ruby-builder has
# no prebuilt 4.0.6 for ubuntu-24.04, so the fast path is the official Docker
# image — the very artifact production is built on (server/Dockerfile starts
# FROM ruby:$RUBY_VERSION-slim). It installs into /usr/local, so its contents can
# be copied onto the host at the prefix they were compiled for, and its default
# gem directory already carries the bundler the lockfile pins.
#
# Copying takes seconds; a source build takes minutes, which is most of the
# five-minute budget for building the environment cache. The source build is kept
# as the last resort.

RUBY_PREFIX=""   # where the target Ruby ended up, set by install_ruby

ruby_prefix() { echo "/opt/hostedtoolcache/Ruby/$1/x64"; }
ruby_version_at() { "$1/bin/ruby" -e 'print RUBY_VERSION' 2>/dev/null; }

ensure_dockerd() {
  docker info >/dev/null 2>&1 && return 0
  if ! service docker start >/dev/null 2>&1; then
    nohup dockerd >/var/log/dockerd.log 2>&1 &
  fi
  local i
  for i in $(seq 1 30); do docker info >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

install_ruby_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  ensure_dockerd || { warn "ruby: no Docker daemon"; return 1; }
  local tag
  # bookworm first, deliberately: its glibc is older than Ubuntu 24.04's, so the
  # binaries run on the host. A trixie-based image could link against a newer one.
  for tag in "ruby:$RUBY_VERSION-slim-bookworm" "ruby:$RUBY_VERSION-slim"; do
    log "ruby: extracting /usr/local from $tag"
    docker pull -q "$tag" >/dev/null 2>&1 || continue
    # /usr/local/bundle is skipped so gems land in Ruby's own default gem dir and
    # nothing on the host needs GEM_HOME or BUNDLE_APP_CONFIG set to find them.
    docker run --rm "$tag" tar -cf - -C /usr/local --exclude=./bundle . | tar -xf - -C /usr/local || continue
    ldconfig 2>/dev/null   # libruby.so.4.0 now lives in /usr/local/lib
    if [ "$(ruby_version_at /usr/local)" = "$RUBY_VERSION" ]; then
      RUBY_PREFIX=/usr/local
      return 0
    fi
  done
  return 1
}

install_ruby_prebuilt() {
  local prefix; prefix=$(ruby_prefix "$RUBY_VERSION")
  local url=https://github.com/ruby/ruby-builder/releases/download/toolcache/ruby-$RUBY_VERSION-ubuntu-24.04.tar.gz
  log "ruby: trying prebuilt $url"
  rm -rf "$prefix" && mkdir -p "$prefix"
  curl -fsSL --retry 2 --retry-delay 2 "$url" | tar -xz -C "$prefix" || return 1
  # Some tarballs carry a top-level ruby-x.y.z/ directory, some don't.
  if [ ! -x "$prefix/bin/ruby" ]; then
    local inner; inner=$(find "$prefix" -maxdepth 3 -type f -path '*/bin/ruby' -print -quit 2>/dev/null)
    if [ -n "$inner" ]; then
      inner=$(dirname "$(dirname "$inner")")
      mv "$inner"/* "$prefix"/ 2>/dev/null && rmdir "$inner" 2>/dev/null
    fi
  fi
  [ "$(ruby_version_at "$prefix")" = "$RUBY_VERSION" ] || return 1
  RUBY_PREFIX=$prefix
}

install_ruby_from_source() {
  log "ruby: building $RUBY_VERSION from source (the slow path — expect several minutes)"
  wait_for_apt
  local prefix; prefix=$(ruby_prefix "$RUBY_VERSION")
  rm -rf /tmp/ruby-build
  git clone --depth 1 https://github.com/rbenv/ruby-build.git /tmp/ruby-build >/dev/null 2>&1 || return 1
  PREFIX=/usr/local /tmp/ruby-build/install.sh >/dev/null 2>&1 || return 1
  RUBY_CONFIGURE_OPTS="--disable-install-doc --enable-shared" \
    MAKE_OPTS="-j$(nproc)" \
    ruby-build "$RUBY_VERSION" "$prefix" || return 1
  [ "$(ruby_version_at "$prefix")" = "$RUBY_VERSION" ] || return 1
  RUBY_PREFIX=$prefix
}

# Match the bundler the lockfile was written with, so bundle neither re-resolves
# nor warns on every run. The Docker path usually satisfies this already.
ensure_bundler() {
  local want="" have=""
  [ -n "$REPO" ] && want=$(awk '/^BUNDLED WITH/{getline; gsub(/[[:space:]]/,"",$0); print; exit}' "$REPO/server/Gemfile.lock" 2>/dev/null)
  have=$("$RUBY_PREFIX/bin/bundle" --version 2>/dev/null | awk '{print $3}')
  if [ -n "$have" ] && { [ -z "$want" ] || [ "$want" = "$have" ]; }; then
    log "ruby: bundler $have"
    return 0
  fi
  log "ruby: installing bundler ${want:-latest}"
  if [ -n "$want" ]; then
    "$RUBY_PREFIX/bin/gem" install bundler -v "$want" --no-document >/dev/null 2>&1 \
      || "$RUBY_PREFIX/bin/gem" install bundler --no-document >/dev/null 2>&1 \
      || warn "bundler install failed"
  else
    "$RUBY_PREFIX/bin/gem" install bundler --no-document >/dev/null 2>&1 || warn "bundler install failed"
  fi
}

install_ruby() {
  local cached; cached=$(ruby_prefix "$RUBY_VERSION")
  if [ "$(ruby_version_at /usr/local)" = "$RUBY_VERSION" ]; then
    RUBY_PREFIX=/usr/local
    log "ruby: $RUBY_VERSION already installed"
  elif [ "$(ruby_version_at "$cached")" = "$RUBY_VERSION" ]; then
    RUBY_PREFIX=$cached
    log "ruby: $RUBY_VERSION already installed"
  elif ! install_ruby_docker && ! install_ruby_prebuilt && ! install_ruby_from_source; then
    warn "could not install Ruby $RUBY_VERSION; the session falls back to $(ruby -v 2>/dev/null || echo 'no ruby')"
    warn "bundle install will fail, since the app needs $RUBY_VERSION"
    return 0
  fi

  # /usr/local/bin is already ahead of /usr/bin in the default PATH; anywhere else
  # needs symlinking, since Claude's Bash tool does not always read a login shell.
  if [ "$RUBY_PREFIX" != "/usr/local" ]; then
    local b
    for b in ruby gem bundle bundler rake irb erb rdoc ri racc; do
      [ -x "$RUBY_PREFIX/bin/$b" ] && ln -sfn "$RUBY_PREFIX/bin/$b" "/usr/local/bin/$b"
    done
  fi
  chmod -R a+rX "$RUBY_PREFIX" 2>/dev/null
  log "ruby: $("$RUBY_PREFIX/bin/ruby" -v) at $RUBY_PREFIX"
  ensure_bundler
}

# --------------------------------------------------------------------------- #
# PostgreSQL                                                                   #
# --------------------------------------------------------------------------- #
# PG 16 is preinstalled but nothing is running and no role exists for the session
# user. config/database.yml sets no username in development, so Rails connects
# over the local socket as the OS user — peer auth means the role name has to
# match. The cluster's data directory is part of the snapshot, so the roles
# created here survive; the running postmaster does not, which is why
# cloud-session-start.sh starts it again every session.

pg_version() { ls /usr/lib/postgresql 2>/dev/null | sort -V | tail -1; }

setup_postgres() {
  local ver; ver=$(pg_version)
  if [ -z "$ver" ]; then
    warn "no PostgreSQL installation found"
    return 0
  fi
  log "postgres: preparing cluster $ver/main"
  pg_lsclusters -h 2>/dev/null | grep -q . || pg_createcluster "$ver" main >/dev/null 2>&1
  pg_ctlcluster "$ver" main start >/dev/null 2>&1
  local i
  for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
  if ! pg_isready -q; then
    warn "postgres did not come up; see /var/log/postgresql/"
    return 0
  fi
  local u
  for u in root "$(id -un)"; do
    su postgres -c "createuser --superuser --createdb $u" >/dev/null 2>&1
  done
  log "postgres: $(psql --version 2>/dev/null), roles ready"
}

# --------------------------------------------------------------------------- #
# Playwright MCP                                                               #
# --------------------------------------------------------------------------- #
# .mcp.json gives every session a "playwright" MCP server so Claude can drive the
# client in a real browser. Install it here rather than on first use: the package
# lands in the snapshot, so a session starts it offline and instantly.
#
# No browser is downloaded — cdn.playwright.dev is not on the cloud allowlist. The
# VM image already carries a Chromium under $PLAYWRIGHT_BROWSERS_PATH, and
# scripts/playwright-mcp.sh points the server at it.

PLAYWRIGHT_MCP_HOME=/opt/vanai-playwright-mcp

install_playwright_mcp() {
  [ -z "$REPO" ] && return 0
  [ -x "$REPO/scripts/playwright-mcp.sh" ] || { warn "scripts/playwright-mcp.sh missing; skipping the Playwright MCP server"; return 0; }
  log "playwright: installing the MCP server into $PLAYWRIGHT_MCP_HOME"
  VANAI_PLAYWRIGHT_MCP_HOME=$PLAYWRIGHT_MCP_HOME \
    bash "$REPO/scripts/playwright-mcp.sh" --install-only \
    || warn "playwright MCP install failed; the first session installs it instead"
  # This script runs outside Claude's session, which is where
  # PLAYWRIGHT_BROWSERS_PATH is exported, so fall back to the image's location.
  local browsers="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
  if [ -x "$browsers/chromium" ]; then
    log "playwright: browser at $browsers/chromium"
  else
    warn "playwright: no preinstalled Chromium at $browsers; the MCP server will look for a Playwright download"
  fi
}

# --------------------------------------------------------------------------- #
# Project dependencies                                                         #
# --------------------------------------------------------------------------- #
# Installed here rather than only in the SessionStart hook so they land in the
# snapshot: gems and node_modules are by far the slowest per-session step, and
# baking them in is the whole point of the cache.

install_project_deps() {
  [ -z "$REPO" ] && return 0

  log "bundle install (server/)"
  ( cd "$REPO/server" && bundle install --jobs "$(nproc)" --retry 2 ) || warn "bundle install failed"

  log "npm ci (client/)"
  ( cd "$REPO/client" && npm ci --no-audit --no-fund ) || warn "npm ci failed"

  # If the session runs as a non-root user, it still has to be able to write here.
  chmod -R a+rwX "$REPO/client/node_modules" "$REPO/server/tmp" "$REPO/server/log" 2>/dev/null

  log "rails db:prepare"
  ( cd "$REPO/server" && bin/rails db:prepare ) || warn "db:prepare failed (the SessionStart hook retries it)"
}

# --------------------------------------------------------------------------- #
# Run                                                                          #
# --------------------------------------------------------------------------- #

APT_PID=""
wait_for_apt() { [ -n "$APT_PID" ] && wait "$APT_PID" 2>/dev/null; APT_PID=""; }

install_apt & APT_PID=$!
install_node &
NODE_PID=$!
setup_postgres &
PG_PID=$!

install_ruby            # the Docker path needs no apt, so it overlaps the above
wait_for_apt
wait "$NODE_PID" "$PG_PID" 2>/dev/null

install_playwright_mcp
install_project_deps

# PATH for anything that reads a login shell's profile. The /usr/local/bin
# symlinks above cover non-login shells, which is what Claude's Bash tool uses.
cat > /etc/profile.d/00-vanai.sh <<PROFILE
export PATH="${RUBY_PREFIX:-/usr/local}/bin:$NODE_PREFIX/bin:\$PATH"
export BUNDLE_SILENCE_ROOT_WARNING=1
PROFILE

log "done in $(elapsed)"
log "ruby: $(ruby -v 2>/dev/null || echo missing)"
log "node: $(node -v 2>/dev/null || echo missing)"
log "postgres: $(pg_isready 2>/dev/null || echo 'not running (started per session)')"
log "playwright mcp: $([ -f "$PLAYWRIGHT_MCP_HOME/node_modules/@playwright/mcp/cli.js" ] && echo "ready at $PLAYWRIGHT_MCP_HOME" || echo missing)"

exit 0
