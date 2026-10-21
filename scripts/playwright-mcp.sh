#!/usr/bin/env bash
#
# Vanai — Playwright MCP launcher.
#
# .mcp.json points Claude Code's "playwright" MCP server at this script instead
# of at `npx @playwright/mcp` directly, because the three environments Vanai is
# developed in disagree about two things: where a Chromium lives, and whether
# there is a screen to put it on.
#
#   * A cloud session (claude.ai/code) has no display and no route to
#     cdn.playwright.dev, so Playwright cannot download the browser build it
#     would prefer. It does ship a Chromium under $PLAYWRIGHT_BROWSERS_PATH —
#     one Playwright release behind, but CDP-compatible — so point the server at
#     that binary and run headless.
#   * A workstation has a display and its own Playwright browsers, so let
#     Playwright resolve the browser itself and keep the window visible: seeing
#     the scene is usually the reason to drive it.
#   * A headless Linux box (CI, a remote shell) looks like the first case
#     without the preinstalled browser, and falls back to whatever Playwright
#     has downloaded locally.
#
# The server package is installed once into a fixed directory rather than
# fetched per launch, so a session starts offline and instantly. Pass
# --install-only to do that step alone; scripts/cloud-setup.sh calls it that way
# so the package lands in the environment snapshot.
#
# stdout belongs to the MCP protocol — every message here goes to stderr.
#
# Overrides, all optional:
#   VANAI_PLAYWRIGHT_MCP_VERSION    @playwright/mcp version to run
#   VANAI_PLAYWRIGHT_MCP_HOME       where that package is installed
#   VANAI_PLAYWRIGHT_MCP_HEADED     1 to force a window, 0 to force headless
#   VANAI_PLAYWRIGHT_EXECUTABLE     browser binary to launch
#   VANAI_PLAYWRIGHT_VIEWPORT       viewport size, e.g. 1920x1080
#   VANAI_PLAYWRIGHT_ACTION_TIMEOUT per-action timeout in milliseconds
#   VANAI_PLAYWRIGHT_MCP_ARGS       extra flags appended to the server
#
set -uo pipefail

VERSION="${VANAI_PLAYWRIGHT_MCP_VERSION:-0.0.79}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

log() { printf '[vanai-playwright-mcp] %s\n' "$*" >&2; }

# Claude Code launches MCP servers from a non-login shell, which on a cloud VM
# misses the toolchain the setup script installed.
command -v node >/dev/null 2>&1 || { [ -f /etc/profile.d/00-vanai.sh ] && . /etc/profile.d/00-vanai.sh; }
if ! command -v node >/dev/null 2>&1; then
  log "node is not on PATH; cannot start the Playwright MCP server"
  exit 1
fi

# --------------------------------------------------------------------------- #
# The server package                                                           #
# --------------------------------------------------------------------------- #
# /opt is shared by every user of a cloud VM and survives into the environment
# snapshot; a workstation keeps it in the user cache, where no sudo is needed.

default_home() {
  if [ -d /opt/vanai-playwright-mcp ] || [ -w /opt ]; then
    echo /opt/vanai-playwright-mcp
  else
    echo "${XDG_CACHE_HOME:-$HOME/.cache}/vanai/playwright-mcp"
  fi
}

MCP_HOME="${VANAI_PLAYWRIGHT_MCP_HOME:-$(default_home)}"
CLI="$MCP_HOME/node_modules/@playwright/mcp/cli.js"

installed_version() {
  [ -f "$CLI" ] || return 1
  node -e 'console.log(require(process.argv[1]).version)' \
    "$MCP_HOME/node_modules/@playwright/mcp/package.json" 2>/dev/null
}

ensure_installed() {
  [ "$(installed_version)" = "$VERSION" ] && return 0
  log "installing @playwright/mcp@$VERSION into $MCP_HOME"
  mkdir -p "$MCP_HOME" || { log "cannot create $MCP_HOME"; return 1; }
  # A private package.json keeps npm from walking up and adopting a parent one.
  printf '{"name":"vanai-playwright-mcp","private":true}\n' > "$MCP_HOME/package.json"
  npm install --prefix "$MCP_HOME" --no-audit --no-fund --loglevel=error \
      "@playwright/mcp@$VERSION" >&2 \
    || { log "npm install failed — is the npm registry reachable?"; return 1; }
  chmod -R a+rX "$MCP_HOME" 2>/dev/null
  [ -f "$CLI" ]
}

ensure_installed || exit 1

if [ "${1:-}" = "--install-only" ]; then
  log "@playwright/mcp@$(installed_version) ready at $MCP_HOME"
  exit 0
fi

# --------------------------------------------------------------------------- #
# How to launch the browser                                                    #
# --------------------------------------------------------------------------- #

OUTPUT_DIR="$ROOT/.playwright-mcp"      # gitignored; see .gitignore

args=(
  --isolated                             # profile in memory: no lock file to fight over
  --output-dir "$OUTPUT_DIR"
  --viewport-size "${VANAI_PLAYWRIGHT_VIEWPORT:-1280x720}"
  # Software-rendered WebGL is slow: screenshotting Caerdun on a cloud VM takes
  # about twenty seconds, four times Playwright's default, with nothing wrong.
  --timeout-action "${VANAI_PLAYWRIGHT_ACTION_TIMEOUT:-45000}"
)

# PLAYWRIGHT_BROWSERS_PATH is exported into Claude's session, which MCP servers
# inherit, but not into a plain login shell — hence the literal fallback.
executable="${VANAI_PLAYWRIGHT_EXECUTABLE:-}"
browsers="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
[ -z "$executable" ] && [ -x "$browsers/chromium" ] && executable="$browsers/chromium"
[ -n "$executable" ] && args+=(--executable-path "$executable")

headed=1
[ "$(uname -s)" = Linux ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && headed=0
case "${VANAI_PLAYWRIGHT_MCP_HEADED:-}" in
  1|true|yes) headed=1 ;;
  0|false|no) headed=0 ;;
esac
[ "$headed" = 0 ] && args+=(--headless)

# shellcheck disable=SC2206  # deliberate word splitting: these are flags
[ -n "${VANAI_PLAYWRIGHT_MCP_ARGS:-}" ] && args+=(${VANAI_PLAYWRIGHT_MCP_ARGS})

log "@playwright/mcp@$VERSION, $([ "$headed" = 0 ] && echo headless || echo headed), browser: ${executable:-playwright default}"

# The server writes a screenshot named by the caller relative to its working
# directory, not to --output-dir, so start it in the output directory and every
# stray file lands somewhere already ignored.
mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" || exit 1

exec node "$CLI" "${args[@]}"
