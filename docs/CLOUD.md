# Vanai in Claude Code cloud sessions

A cloud session gets a fresh Ubuntu 24.04 VM with the repo cloned and common
toolchains preinstalled. Vanai needs three things that aren't in the base image —
Ruby 4.0.6 (the image ships 3.1–3.3), Node 25 (it ships 20–22), and a running
PostgreSQL with a role the app can connect as — so the pieces below exist.

| File | When it runs | What it does |
| --- | --- | --- |
| `scripts/cloud-setup.sh` | Once per environment build, as root, before Claude starts | Installs Ruby, Node, apt build deps, creates the Postgres cluster and roles, bundles gems and node_modules |
| `scripts/cloud-session-start.sh` | Every session start and resume (SessionStart hook) | Starts Postgres, reconciles gems / node_modules / migrations with the checked-out branch, briefs Claude |
| `scripts/playwright-mcp.sh` | Whenever Claude connects the `playwright` MCP server (`.mcp.json`) | Installs the pinned Playwright MCP server if it isn't already there, then launches it against a browser the environment actually has |

The split follows the cloud environment's caching model: after the setup script
finishes, Anthropic snapshots the **filesystem** and reuses it, so installed
things carry over but running things don't. Anything that has to be *started*
belongs in the session-start hook.

## One-time setup

1. Open [claude.ai/code](https://claude.ai/code) → environment settings → **Setup script**.
2. Paste the entire contents of `scripts/cloud-setup.sh` into the field.
3. Leave network access at **Trusted**. Everything the setup script fetches is on
   the default allowlist: Docker Hub, `nodejs.org`, `github.com` release assets,
   `rubygems.org`, `registry.npmjs.org`, and the Ubuntu archives.
4. No environment variables are required. Development mode uses the async Action
   Cable adapter and an in-memory cache, so no Redis, and `config/database.yml`
   connects over the local socket as the OS user.

The hook needs no dashboard configuration — `.claude/settings.json` is committed
and cloud sessions read the repo's settings.

## Why the setup script is shaped the way it is

Two hard constraints, both from the platform:

- **It must exit 0.** A non-zero exit fails the whole session, so every step is
  best-effort and logs a warning instead of aborting.
- **It must finish in about five minutes**, or the environment cache never builds
  and every session pays the full install cost. Hence apt, Node and Postgres run
  in parallel, and Ruby is *copied* rather than built.

Where Ruby comes from is the one part worth knowing. The VM image ships 3.1-3.3
and `ruby/ruby-builder` publishes no prebuilt 4.0.6 for Ubuntu 24.04, so the
script pulls `ruby:$RUBY_VERSION-slim-bookworm` — the same official image
`server/Dockerfile` builds on — and copies its `/usr/local` onto the host. That
works because the image compiles Ruby for exactly that prefix, and its default
gem directory already carries bundler 4.0.16, the version `Gemfile.lock` pins.
The bookworm variant is deliberate: its glibc is older than Ubuntu 24.04's, so
the binaries run on the host. If the pull fails the script tries the
`ruby-builder` tarball, then a `ruby-build` source compile — which will likely
blow the five-minute budget, so a first session that feels slow is the signal
that the Docker path broke.

Versions are read from the repo (`server/.ruby-version`, the `NODE_VERSION` arg in
`server/Dockerfile`) rather than hardcoded, so the cloud VM tracks production.
Changing either file means the environment cache should be rebuilt — editing the
setup script field, even trivially, forces that.

## Working in a cloud session

```sh
cd client && npm run test:no-runtime   # the node tests that do not read the character runtime
cd client && npm run build             # tsc typecheck + vite build
cd server && bin/ci                    # bin/setup --skip-server, bundler-audit, the data audit, the server tests
cd server && bin/rails server          # boots the world; confirms the app comes up
bin/dev                                # both halves at once, for browsing the real client
```

The VM starts with no character runtime ([ASSETS.md](ASSETS.md)): the full
`npm test` fails and the Vite dev server refuses to start
(`scripts/runtime-root.mjs`) until `bin/fetch-runtime` has installed the pinned
release into `runtime/` (about 5 GB; `bin/dev` runs it on its own). The
session-start briefing still lists `npm test`.

The single-web-process rule from `DEPLOY.md` applies here too: the authoritative
world lives in one Rails process's memory. `bin/dev` refuses to start if port 3000
(or Vite's 5173) is already answering, which is the failure mode worth guarding
against — a second Rails would boot a second world and quietly serve a different one.

## Driving the browser (Playwright MCP)

`.mcp.json` at the repo root registers Microsoft's
[Playwright MCP](https://github.com/microsoft/playwright-mcp) as a project-scoped
server, so every Claude Code session in this repo — cloud, local, or headless —
gets the `browser_*` tools. The file is committed; project-scoped servers are
loaded automatically in cloud and `claude -p` sessions, and a local interactive
session approves it once (`.claude/settings.json` lists it under
`enabledMcpjsonServers` so a trusted checkout doesn't have to).

To use it, boot both servers and point Claude at `http://localhost:5173`. A cloud
session has no display, so the browser runs headless; screenshots, snapshots and
console logs land in `.playwright-mcp/`, which is gitignored.

Claude never talks to the server directly — `.mcp.json` runs
`scripts/playwright-mcp.sh`, which absorbs the differences between environments:

- **Which browser.** Playwright wants a specific Chromium build and downloads it
  from `cdn.playwright.dev`, which is *not* on the cloud allowlist. The VM image
  ships one under `$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers` today) — a
  release or two behind, still CDP-compatible — so the launcher passes
  `--executable-path` when that binary exists and otherwise lets Playwright
  resolve its own.
- **Headless or not.** Headless on Linux with no `DISPLAY`, headed everywhere
  else, because on a workstation the point of driving the client is usually to
  watch it.
- **Where the server comes from.** `@playwright/mcp` is pinned in the launcher and
  installed once into `/opt/vanai-playwright-mcp` (a user cache off a workstation).
  The setup script primes it so it lands in the environment snapshot and sessions
  start it offline; the SessionStart hook re-checks in case the snapshot predates
  this file. Bumping the version means editing `VERSION` in the launcher and
  rebuilding the environment cache.

Environment variables override each decision: `VANAI_PLAYWRIGHT_MCP_VERSION`,
`VANAI_PLAYWRIGHT_MCP_HOME`, `VANAI_PLAYWRIGHT_MCP_HEADED`,
`VANAI_PLAYWRIGHT_EXECUTABLE`, `VANAI_PLAYWRIGHT_VIEWPORT`,
`VANAI_PLAYWRIGHT_ACTION_TIMEOUT` and `VANAI_PLAYWRIGHT_MCP_ARGS` (extra flags,
e.g. `--device "iPhone 15"`).

WebGL works in the cloud, but through SwiftShader on the CPU: Babylon renders the
scene and the UI, slowly, and colour and timing are close rather than exact. That
is enough to confirm a zone loads, a mesh is where it should be, or a panel opens.
Judging lighting, fog and frame pacing still belongs in a local session on a GPU.

Slowly is the operative word. Signing in, entering a zone and painting the first
frame of Caerdun takes tens of seconds, and screenshotting that canvas took ~21s
against Playwright's 5s default action timeout — so the launcher raises the
timeout to 45s. Give the client time to settle (`browser_wait_for`) before asking
for a screenshot, and read a slow call as slow rather than broken.

SwiftShader's uniform-buffer budget is also far below a real GPU's. A scene with
many point lights plus the cascaded shadow generator can push the character
shaders past it:

```
BJS - Unable to compile effect
Error: VERTEX shader uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS
```

Those materials never become ready, so their meshes are never drawn, the
player's included. For screenshots only, disable the point lights and let the
shaders build:

```js
scene.lights.forEach(l => { if (l.getClassName() === 'PointLight') l.setEnabled(false); });
```

Expect well under 1 fps afterwards and allow ten or twenty seconds per frame.
`?daytime=0.25` pins the hour to noon rather than waiting on the real-hour day.
