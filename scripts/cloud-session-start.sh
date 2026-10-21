#!/usr/bin/env bash
#
# Vanai — Claude Code SessionStart hook.
#
# Wired up in .claude/settings.json, so it runs every time a session starts or
# resumes. It exits immediately outside cloud sessions: on your own machine
# nothing here should touch your Postgres or reinstall your gems.
#
# The cloud environment snapshot (built by scripts/cloud-setup.sh) restores files
# but no processes, and it was taken against whatever branch built it. This
# script covers the difference: start Postgres, then reconcile gems, packages and
# migrations with the branch actually checked out.
#
# Everything is best-effort — a hook that exits non-zero blocks the session, and
# a missing dependency is better reported to Claude in the transcript than fatal.
# Verbose output goes to the log file; stdout is the summary Claude reads.
#
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG=/tmp/vanai-session-start.log
: > "$LOG"

run() { echo "\$ $*" >> "$LOG"; "$@" >> "$LOG" 2>&1; }

notes=()
note() { notes+=("$1"); }

# Ruby and Node live outside the default PATH when the setup script installed
# them; /usr/local/bin symlinks normally cover it, but source the profile too in
# case only one of the two landed.
[ -f /etc/profile.d/00-vanai.sh ] && . /etc/profile.d/00-vanai.sh

# --------------------------------------------------------------------------- #
# Postgres                                                                     #
# --------------------------------------------------------------------------- #
start_postgres() {
  pg_isready -q 2>/dev/null && return 0
  local ver; ver=$(ls /usr/lib/postgresql 2>/dev/null | sort -V | tail -1)
  [ -z "$ver" ] && { note "postgres: not installed — run scripts/cloud-setup.sh as the environment setup script"; return 1; }
  run pg_ctlcluster "$ver" main start
  local i
  for i in $(seq 1 30); do pg_isready -q 2>/dev/null && return 0; sleep 1; done
  note "postgres: failed to start (see $LOG)"
  return 1
}

# su needs a tty to ask for a password, so only reach for it as root; otherwise
# use non-interactive sudo, which fails fast instead of hanging the hook.
as_postgres() {
  if [ "$(id -u)" = 0 ]; then
    su postgres -c "$1"
  else
    sudo -n -u postgres bash -c "$1"
  fi
}

ensure_role() {
  # database.yml names no user in development, so Rails connects as the OS user
  # over the local socket and peer auth requires a role of the same name.
  local u; u=$(id -un)
  as_postgres "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$u'\"" 2>/dev/null | grep -q 1 && return 0
  run as_postgres "createuser --superuser --createdb $u" || note "postgres: could not create the role $u (see $LOG)"
}

# --------------------------------------------------------------------------- #
# Server                                                                       #
# --------------------------------------------------------------------------- #
prepare_server() {
  cd "$ROOT/server" || return 1

  if ! command -v ruby >/dev/null 2>&1; then
    note "ruby: missing — the environment's setup script is not configured; paste scripts/cloud-setup.sh into it"
    return 1
  fi

  local want; want=$(tr -d '[:space:]' < .ruby-version 2>/dev/null)
  local have; have=$(ruby -e 'print RUBY_VERSION' 2>/dev/null)
  [ -n "$want" ] && [ "$want" != "$have" ] && note "ruby: $have on PATH but .ruby-version asks for $want"

  if ! run bundle check; then
    echo "installing gems..." >> "$LOG"
    run bundle install --jobs "$(nproc 2>/dev/null || echo 2)" --retry 2 \
      || { note "bundle install failed (see $LOG)"; return 1; }
    note "gems: installed for this branch"
  fi

  run bin/rails db:prepare || { note "db:prepare failed (see $LOG)"; return 1; }
  return 0
}

# --------------------------------------------------------------------------- #
# Client                                                                       #
# --------------------------------------------------------------------------- #
prepare_client() {
  cd "$ROOT/client" || return 1
  if ! command -v npm >/dev/null 2>&1; then
    note "node: missing — see scripts/cloud-setup.sh"
    return 1
  fi
  # package-lock.json newer than the install marker means the branch moved.
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    run npm ci --no-audit --no-fund || { note "npm ci failed (see $LOG)"; return 1; }
    note "npm: node_modules installed for this branch"
  fi
  return 0
}

# --------------------------------------------------------------------------- #
# Playwright MCP                                                               #
# --------------------------------------------------------------------------- #
# .mcp.json wires Claude's "playwright" MCP server to scripts/playwright-mcp.sh.
# The server package normally comes out of the environment snapshot; this is a
# no-op then, and installs it if the snapshot predates .mcp.json.
prepare_playwright_mcp() {
  [ -x "$ROOT/scripts/playwright-mcp.sh" ] || return 1
  export VANAI_PLAYWRIGHT_MCP_HOME="${VANAI_PLAYWRIGHT_MCP_HOME:-/opt/vanai-playwright-mcp}"
  run bash "$ROOT/scripts/playwright-mcp.sh" --install-only \
    || { note "playwright mcp: not installed (see $LOG) — browser tools will be unavailable"; return 1; }
  return 0
}

start_postgres && ensure_role
prepare_server
prepare_client
prepare_playwright_mcp && playwright_ready=1

# --------------------------------------------------------------------------- #
# Report                                                                       #
# --------------------------------------------------------------------------- #
# stdout from a SessionStart hook is added to Claude's context, so this is the
# briefing for the session rather than a log dump.

ruby_line=$(ruby -v 2>/dev/null | cut -d' ' -f1-2)
node_line=$(node -v 2>/dev/null)
pg_line=$(pg_isready -q 2>/dev/null && echo "running (vanai_development ready)")
if [ "${playwright_ready:-0}" = 1 ]; then
  playwright_line="Playwright MCP drives headless Chromium — run bin/dev, then browse http://localhost:5173.
         Screenshots and snapshots land in .playwright-mcp/ (gitignored). WebGL runs on SwiftShader,
         so the scene renders but colour and timing are approximate; judge fine visuals locally."
else
  playwright_line="unavailable — the Playwright MCP server did not install (see CLOUD.md)."
fi

cat <<EOF
Vanai cloud session — environment prepared by scripts/cloud-session-start.sh
(full log: $LOG)

  ruby     ${ruby_line:-MISSING}
  node     ${node_line:-MISSING}
  postgres ${pg_line:-NOT running}

Running the game here:
  both     bin/dev                              # from the repo root: Rails + Vite, Ctrl-C stops both
  server   cd server && bin/rails server        # port 3000, boots the in-memory world
  client   cd client && npx vite                # port 5173, dev client
  Exactly one Rails web process — the authoritative world lives in its memory (see DEPLOY.md).

Checks that work here:
  cd client && npm test        # node --test over test/*.test.mjs
  cd client && npm run build   # tsc typecheck + vite build
  cd server && bin/ci          # bin/setup --skip-server + bundler-audit

Browser: ${playwright_line}
EOF

for n in "${notes[@]:-}"; do [ -n "$n" ] && echo "! $n"; done

exit 0
