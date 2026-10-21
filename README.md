# Vanai

*The lights are going out, and no one believes it.*

A browser MMORPG in the spirit of FFXI's social combat and FFXIV's
one-character-every-job freedom. Combat is slow enough to talk during, and one
character can learn every job. A Rails 8 server runs the world, a Babylon.js
client draws it, and PostgreSQL keeps it.

## The game

- **The world**: three starting cities (Caerdun, Heartwood and Moonmere), the
  field zones between them, eleven dungeons, a ferry across the gulf, and the
  Capital at the end of the main story. Teleport crystals in every city and field
  zone set your home point and carry you between the ones you have touched.
- **Characters**: five races (Aedri, Valdren, Karrog, Nym, Rasha) and six jobs.
  Paladin and Samurai tank, Dark Knight and Black Mage deal damage, White Mage and
  Monk heal. Change job at a city's sanctuary; levels run to 50.
- **Combat**: auto-attack builds TP, 100 TP unlocks weaponskills, and weaponskills
  chain into skillchains that open a window for magic bursts. Solo play is tuned
  to about level 10, and parties of up to six do the rest.
- **Quests**: the main story, side quests in every zone, and a guild questline
  for each job.
- **Living in it**: crafting, vendors, an auction house, mail with parcels,
  friends, companies, and cutscenes you can watch again with `/cutscene`.
- **The courts**: three AI-run courts that tax, post bounties, write letters and
  remember who served them ([COURTS.md](docs/COURTS.md)). They need an Anthropic API
  key and stay dormant without one; the game plays fine either way.

The music, sound, icons, terrain, cities, dungeons and monsters are made by code
in this repository. The character, gear and animation files come from a
separate runtime folder, published as GitHub Releases of this repository and
fetched for you (see below).

## What you need

| | Version | Why |
| --- | --- | --- |
| Ruby | 4.0.6 (`server/.ruby-version`) | the server |
| Node.js | 25.9.0 or newer, as production builds use (`.node-version`) | the client and its tools |
| PostgreSQL | a current release (production runs 18) | the database |
| Python 3 | any current release | `tools/data/audit.py`, which `bin/ci` runs |
| Google Chrome | current | the game plays in Chrome; other browsers are told so |

Development needs no Redis or Valkey: Action Cable and the cache run in-process.

## Getting started

1. **Give PostgreSQL a role for your user.** In development Rails connects as
   your operating-system user over the local socket. Homebrew's PostgreSQL
   creates that role for you; a stock Linux install has only `postgres`:

   ```sh
   sudo -u postgres createuser -s "$USER"
   ```

   To use another role or server, export `PGHOST`, `PGUSER` and `PGPASSWORD`
   instead (`.env.example` has the example).

2. **Boot it** from the repository root:

   ```sh
   bin/dev
   ```

   `bin/dev` first sets up whatever is missing, in this order, then runs both
   halves and streams their logs side by side:

   - gems (`bundle install`) and npm packages (`npm install`);
   - the character runtime: about 5 GB, fetched once into `runtime/` by
     `bin/fetch-runtime` ([below](#the-character-runtime)); later boots only
     check it, and a newer pinned release downloads only what changed;
   - the database (`bin/rails db:prepare`).

   Then:

   - `server`: Rails on port 3000, the authoritative world
   - `client`: Vite on port 5173, **the one you open**

   Ctrl-C stops both, and if either half falls over the other stops with it.
   `bin/dev --skip-setup` skips all of the setup and goes straight to booting;
   `bin/dev --help` lists the options.

3. Open **http://localhost:5173** in Chrome, in as many windows as you have
   friends. Register, make a character, and pick which of the three cities to
   start in.

To run the halves on their own (for a `binding.b` breakpoint, say, since
`bin/dev` gives its children no stdin):

```sh
cd server && bin/rails server   # port 3000; exactly one of these, ever
cd client && npx vite           # port 5173
```

### The character runtime

Character bodies, hair, gear, weapons and animations are produced in a separate
Vanai Assets Maker workspace, which is not public yet; I plan to open-source it
soon. Its output reaches this game as one folder of hash-named files plus one
index, published as [GitHub Releases of this repository](../../releases) tagged
`runtime-YYYY.MM.DD.N`. Each checkout pins the release it was tested against in
`client/src/asset-index.json`, so a clone at any commit fetches the runtime that
commit was tested with.

`bin/fetch-runtime` installs that release into `runtime/` (gitignored). It
downloads the release's manifest, then only the archives whose checksums the
folder does not already have, verifies each before unpacking it, and checks
every file the index names. It needs only Node and a network connection, and a
run that is interrupted resumes where it stopped. `bin/dev` runs it for you
whenever the folder is missing or on another release.

```sh
bin/fetch-runtime                         # the pinned release, into runtime/ (or VANAI_RUNTIME)
bin/fetch-runtime --check                 # what is pinned, what is installed; exit 1 if they differ
bin/fetch-runtime --if-needed             # fetch only when missing or stale (what bin/dev runs)
bin/fetch-runtime --latest                # the newest runtime release instead of the pinned one
bin/fetch-runtime --tag runtime-2026.10.20.1
bin/fetch-runtime --dest /var/lib/vanai/runtime   # elsewhere, e.g. on a server (DEPLOY.md)
```

To use another folder, such as the maker's own prepared one, set `VANAI_RUNTIME`
in `.env` (copy `.env.example`); `fetch-runtime` never writes into a maker's
folder. Set `GITHUB_TOKEN` to fetch from a private fork. [ASSETS.md](docs/ASSETS.md)
has the release format and how a release is made; the runtime's own README,
CREDITS and LICENSE come with it, and the licence line below covers it.

A runtime release is never deleted: a later release refers back to the archives
of an earlier one that did not change.

## Checks

```sh
cd client && npm test        # the client's node tests
cd client && npm run build   # typecheck + production build
cd server && bin/ci          # setup, bundler-audit, the data audit, the server tests
python3 tools/data/audit.py  # every reference in shared/data resolves
```

Run the data audit after any change to `shared/data/`. The world boots once per
server start, so a change there or in `server/lib/vanai/` needs a Rails restart.

### Tooling prerequisites

The checks above need only what [What you need](#what-you-need) lists. The
generators and QA scripts under `tools/` need more:

- **Python packages**: `pip install -r tools/requirements.txt` (numpy, Pillow,
  scipy, shapely).
- **Blender 5.2** as `blender` on your PATH, for the module and creature
  builders (`blender -b --python <script>`).
- **basisu 2.x** on your PATH (or `$BASISU`), for the creatures' KTX2 textures.
- **Chrome** for the browser QA scripts in `tools/qa/`, which load Playwright
  from the client's dev dependencies and pick the GL backend per platform
  (`tools/qa/lib/playwright.mjs`). Without Chrome, run
  `cd client && npx playwright install chromium`. They expect the dev client
  at `VANAI_QA_BASE` (default `http://localhost:5173`) and Rails at
  `VANAI_API_BASE` (default `http://localhost:3000`).

## Looking at the world without playing

These dev views need only the Vite dev server: no account and no Rails.
A production build leaves them out (only the pre-game `?character-preview` runs) unless it is built with `VITE_DEV_VIEWS=1`.

| URL | What it shows |
| --- | --- |
| `/?lineup` | every race side by side; `&job=BLM&anim=walk` and an on-screen bar drive job, motion and view ([MODELS.md](docs/MODELS.md)) |
| `/?zone=caerdunfields` | any zone with a free camera (WASD, Q/E for height, Shift to sprint), a metre stick at the drop point, and a zone switcher; `&at=40,-110`, `&look=0,0`, `&eye=14`, `&tour` |
| `/?zonemap=caerdunfields` | the zone's map, for checking it against the ground |
| `/?bestiary` | every monster; `&crowd=30` or `&zone=<key>` is the performance check ([BESTIARY.md](docs/BESTIARY.md)) |
| `/?vfx` | plays any ability's effect on a caster, an ally and a monster |
| `/?music` | the jukebox: every zone's score and the battle themes |
| `/?cutscene=<id>` | plays one cutscene ([CUTSCENES.md](docs/CUTSCENES.md)) |
| `&daytime=0.47` | pins the time of day on any view: `0` sunrise, `0.25` noon, `0.5` sunset, `0.75` midnight. Display only |

Zone keys are the keys of `shared/data/zones.json` (`caerdun`, `heartwood`,
`moonmere`, `huntingwood`, `mausoleum` and so on); an unknown key lists them
all. `/?zone=` also has annotation tools (circle, box or draw an area, say what
is wrong, save the batch to `tmp/zone-notes/`); [ZONE-NOTES.md](docs/ZONE-NOTES.md)
covers them.

### Dev chat commands

In development only, typed into chat:

- `/tp <zone> <x> <z>`: teleport, using a `zones.json` key
- `/tpgive`: fill TP to 300
- `/council`: bring the courts' next sitting forward

## Controls

| Key | Action |
| --- | --- |
| WASD | Move (camera-relative) |
| Mouse drag / wheel, arrow keys | Orbit and zoom the camera |
| Space | Jump |
| Click | Target a monster or player, talk to an NPC |
| Tab / \` | Cycle nearby enemies / players |
| F | Engage (auto-attack) the target |
| 1–9 | Hotbar abilities (weaponskills glow gold at 100 TP) |
| E | Interact: NPCs, crystals, portals; on a targeted player, the trade/invite/tell menu |
| R | Autorun (W, S, chat or R again stops it) |
| Ctrl/Cmd + R | Reply to the last tell |
| Enter | Chat: `>> Name` tell, `/p` party, `/invite Name`, `/leave`, `/rest`, `/cutscene` |
| Alt + Enter | Fullscreen |
| I / C / J / M | Bags / character sheet / journal / map |
| K / L / O | Crafting / the courts / friends |
| Esc | Clear target, close windows; twice during a cutscene, skip it |

## Self-hosting

The one rule: **run exactly one Rails web process.** The world lives in that
process's memory, so a second process or a forked Puma worker would be a second,
divergent world. `server/config/puma.rb` pins Puma to a single process.

[DEPLOY.md](docs/DEPLOY.md) deploys the whole stack (Rails and the built client,
PostgreSQL, Valkey, and optionally a Cloudflare tunnel) to one server with
[Kamal](https://kamal-deploy.org). Nothing in the repository names a server.
Your host, domain, registry and secrets go in `.env.production` at the root,
copied from `.env.production.example`. `VANAI_HTTPS` picks `letsencrypt` or
`tunnel`, `VANAI_ASSET_BASE` says where the character runtime is served from
(`bin/fetch-runtime --dest` puts it on your server, or upload it to a bucket),
and `ANTHROPIC_API_KEY` is optional (it wakes the courts).

## Layout

```
bin/           dev boots both halves from the repository root; fetch-runtime installs the character runtime; kamal deploys
shared/data/   the game's data, read by both halves: jobs, items, abilities, monsters, zones, quests, cutscenes
server/        Rails 8: auth, persistence, and the authoritative world loop (server/lib/vanai/)
client/        Vite + TypeScript + Babylon.js: renderer, UI, input, the zones as code
tools/         data audits and generators, asset builders, QA scripts, the music renderer
docs/          the design records: the architecture, each city and system, the maintainer's rulings
scripts/       the asset-index import, the runtime check, cloud-session and zone-note helpers
design/        the Empty Throne design document, the compendium and design sources
```

[ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the code file by file, and links the design
records for each part of the world; [docs/README.md](docs/README.md) lists them all. [CONTRIBUTING.md](CONTRIBUTING.md) has the
conventions, the checks and how to add content.

## Optional: AI coding tools

The repository is set up for [Claude Code](https://claude.com/claude-code), and
nothing here needs it. `CLAUDE.md` and `AGENTS.md` are its instructions
(`CLAUDE.md` also pulls in ARCHITECTURE.md and CONTRIBUTING.md).
`.mcp.json` registers Microsoft's
[Playwright MCP](https://github.com/microsoft/playwright-mcp) server so a session
can drive the client in a real browser. Run `bin/dev` first; screenshots land in
`.playwright-mcp/`. [CLOUD.md](docs/CLOUD.md) covers running it in the cloud.

## Licence and credits

Vanai is MIT ([LICENSE](LICENSE)): the code, the original art and music, and
the game data. The third-party models, textures, fonts and vendored decoder keep
their own licences, listed with their authors in [CREDITS.md](CREDITS.md). The
character runtime from the releases is MIT too, except the Quaternius animation
clips and the animations derived from them, which are CC0; its own CREDITS.md
and LICENSE travel with it.
