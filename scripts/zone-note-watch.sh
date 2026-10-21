#!/usr/bin/env bash
#
# Vanai — zone-note watcher.
#
# Blocks until the ?zone annotation tool (client/src/annotate.ts) saves a new
# batch into tmp/zone-notes/, prints what landed, and exits. Claude arms it with
# a backgrounded Bash call; the harness re-invokes Claude when it exits, so
# pressing [S] in the browser is what brings the notes into the conversation.
#
# It is NOT started automatically, and nothing in the repo starts it: the Vite
# plugin that writes the batch is a plain Node process with no way to reach a
# Claude session, and hooks fire on tool calls rather than on file writes. Ask
# for it, once, at the start of an annotation session.
#
# Re-arming matters more than it looks. A watcher fires once and dies, so Claude
# restarts it while handling the wake-up — and passes --since pointing at the
# batch it just read, NOT the current time. Arming at "now" would silently skip
# any batch saved while Claude was still working through the previous one.
#
#   scripts/zone-note-watch.sh                       # anything newer than now
#   scripts/zone-note-watch.sh --since <notes.md>    # anything newer than that batch
#
# Env: WATCH_INTERVAL (seconds between checks, default 15)
#      WATCH_MAX_SECONDS (give up after this, default 14400 = 4h) so a watcher
#      forgotten overnight ends rather than lingering for days.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTES_DIR="$ROOT/tmp/zone-notes"
INTERVAL="${WATCH_INTERVAL:-15}"
MAX="${WATCH_MAX_SECONDS:-14400}"

REF=""
if [ "${1:-}" = "--since" ] && [ -n "${2:-}" ]; then
  REF="$2"
  if [ ! -e "$REF" ]; then
    echo "zone-note-watch: --since file does not exist: $REF" >&2
    exit 2
  fi
fi

mkdir -p "$NOTES_DIR"

# No reference given: stamp one at "now" so the batches already on disk do not
# fire the watcher the instant it starts.
if [ -z "$REF" ]; then
  REF="$ROOT/tmp/.zone-note-mark"
  : > "$REF"
fi

echo "zone-note-watch: watching $NOTES_DIR for batches newer than $(basename "$REF")"

waited=0
while :; do
  # Report EVERY new batch, not just the newest: several saves can pile up while
  # Claude is busy, and each one is a separate set of notes.
  found="$(find "$NOTES_DIR" -name notes.md -newer "$REF" 2>/dev/null | sort)"
  if [ -n "$found" ]; then
    count="$(printf '%s\n' "$found" | wc -l | tr -d ' ')"
    echo "zone-note-watch: $count new batch(es):"
    printf '%s\n' "$found" | sed "s|^$ROOT/||"
    exit 0
  fi

  # Checked before sleeping, so WATCH_MAX_SECONDS=0 returns at once.
  if [ "$waited" -ge "$MAX" ]; then
    echo "zone-note-watch: nothing after ${MAX}s — giving up (re-arm if still needed)"
    exit 0
  fi
  sleep "$INTERVAL"
  waited=$(( waited + INTERVAL ))
done
