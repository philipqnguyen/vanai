# Deploying Vanai

Vanai deploys to a single VPS with [Kamal](https://kamal-deploy.org). One modest
box comfortably holds a few hundred concurrent players. Everything — the Rails
app, the game client, Postgres, three Valkey instances, and optionally a
Cloudflare tunnel in front — is containers on that one host.

Nothing in the repository names a server: the host, domain, registry and every
secret come from `.env.production` at the repository root (template:
`.env.production.example`), so the same files deploy anyone's copy.

Every Kamal command names its destination — `bin/kamal deploy -d production` —
and a bare `bin/kamal deploy` refuses. A destination is a pair:
`server/config/deploy.<name>.yml` (what it does differently from
`config/deploy.yml`; production's is empty) and `.env.<name>` (its host and
secrets). Don't rename one that is running: Kamal puts the destination into
container and proxy service names (`vanai-web-production`), so a new name boots a
second web container — a second world — beside the first.

## The one architectural rule

**Run exactly ONE Rails web process.** The game world (monsters, parties,
positions) lives in that process's memory, and the world loop is
a thread inside it (`lib/vanai/world.rb`). Multiple Puma *threads* are fine;
multiple Puma *workers* or multiple app servers would each spawn their own copy
of the world, and players in the same zone would start seeing different monsters.

Two things enforce this, and both should be left alone:

- `workers 0` in `config/puma.rb` keeps Puma in single mode. It wins over
  `WEB_CONCURRENCY`, which some hosts set for every app; a value above 0 is
  ignored and logged as a warning at boot. (`config/deploy.yml` still sets it
  to 0.)
- `config/initializers/vanai.rb` boots the world only when `Rails::Server` is
  defined — i.e. only under `bin/rails server`. Sidekiq, `bin/rails console`,
  `kamal app exec "bin/rails db:migrate"`, rake tasks, and the `assets:precompile`
  run inside the Docker build all load the full app but start no world. If the app
  is ever launched some other way (bare `puma`, `rackup`), that guard needs to
  learn about it or the world will silently never boot.

Characters, inventory, XP, quests, and discoveries all persist in PostgreSQL, so
a restart only resets the live world (monster positions, active parties) —
nobody loses progress.

## What's on the host

`config/deploy.yml` describes all of it:

| Container | What it is |
| --- | --- |
| `vanai-web` | Rails via Thruster on port 80. The world lives here. |
| `vanai-sidekiq` | Same image, `bundle exec sidekiq`. Never boots the world, never migrates. |
| `vanai-db` | `postgres:18`, data on a `data:/var/lib/postgresql` volume (pg18 moved the data dir — this path is correct, don't "fix" it). |
| `vanai-redis_sidekiq` | Valkey, `appendonly yes` + `noeviction`. The only Redis holding state you'd miss. |
| `vanai-redis_cable` | Valkey, `allkeys-lru`. Action Cable's own pub/sub (remote disconnects); the game's broadcasts stay in process. Disposable. |
| `vanai-redis_cache` | Valkey, `allkeys-lru`. `Rails.cache`, disposable. |
| `cloudflared` | Only with `VANAI_HTTPS=tunnel`. Cloudflare tunnel; terminates TLS, so `proxy: ssl: false`. |
| `kamal-proxy` | Kamal's own proxy, routes `VANAI_DOMAIN` to web. Without the tunnel it also terminates TLS with a Let's Encrypt certificate. |

Accessories share Kamal's `kamal` Docker network, so the tunnel reaches the app
at **`http://kamal-proxy:80`** — that's what the tunnel's public hostname should
point at in the Cloudflare dashboard.

### HTTPS: Let's Encrypt or a Cloudflare tunnel

`VANAI_HTTPS` in `.env.production` decides, and must be set; the command is the
same either way.

| | `VANAI_HTTPS=letsencrypt` | `VANAI_HTTPS=tunnel` |
| --- | --- | --- |
| TLS | kamal-proxy, Let's Encrypt | the Cloudflare tunnel |
| The host needs | DNS for `VANAI_DOMAIN` pointing at it, ports 80/443 open | no open web ports; its address stays out of DNS |
| Extra secret | — | `TUNNEL_TOKEN` |

vanaiworld.com runs the tunnel. It is chosen by name, not read off whether
`TUNNEL_TOKEN` is set, because a tunnelled host switched to Let's Encrypt by a
missing token would loop on kamal-proxy's HTTPS redirect and go down.

## Requirements

- **VPS**: 2 vCPU / 2–4 GB RAM, any Linux, reachable over SSH with your key
  (`VANAI_SSH_USER`, `VANAI_SSH_PORT`). Kamal installs Docker on the first
  `setup`. A firewall and fail2ban are worth adding; note that Docker publishes
  kamal-proxy's ports 80/443 past ufw.
- **Locally**: Docker (to build the image) and Ruby (to run `bin/kamal`).
  Nothing else — Node and Postgres are only needed for development.
- A container registry token (GitHub: a classic PAT with `write:packages`), and
  optionally a Cloudflare tunnel.

## Settings and secrets

```sh
cp .env.production.example .env.production   # at the repository root; then fill it in
```

`config/deploy.yml` loads that file before anything else (values already in the
shell win, so CI can export the same names), and `.kamal/secrets-common` passes
the secrets on by name. Both deploy files and the secrets file hold names only and
are safe for git; `.env.production` is gitignored and excluded from the Docker
build context by the root `.dockerignore`. A missing setting or required secret stops the
deploy with its name, before anything is built or touched.

A value can be a command, run at deploy time, so a secret can stay in a password
manager: `POSTGRES_PASSWORD=$(security find-generic-password -a "$USER" -s vanai-postgres -w)`
for the macOS keychain, `$(bw get password "Vanai Postgres")` for Bitwarden.

To keep the file outside the checkout — a clean worktree has no ignored files —
point at it: `VANAI_ENV_FILE=~/.config/vanai/production.env bin/kamal deploy -d production`
(a relative path is read from the repository root).

The secrets: `KAMAL_REGISTRY_PASSWORD`, `SECRET_KEY_BASE` (`bin/rails secret`;
changing it signs every player out), `POSTGRES_PASSWORD` (fixed at the first
`kamal setup`: the database keeps the one it was created with), `TUNNEL_TOKEN`
(`VANAI_HTTPS=tunnel` only; see "HTTPS" above), and `ANTHROPIC_API_KEY`, the AI courts' switch (COURTS.md
"Dormant courts"). Without it `ANTHROPIC_API_KEY` reaches the containers empty and
the courts are dormant: every auction house charges 3% and no council sits. Add it
and redeploy to wake them; remove it and redeploy to put them back to sleep. Web
and Sidekiq both read it, and a deploy restarts both.

Production uses no Rails credentials: Rails reads `SECRET_KEY_BASE` from the
environment, and nothing reads `Rails.application.credentials`.

## Deploying

From the repository root, or from `server/` — either works:

```sh
bin/kamal setup  -d production   # first time: bootstrap Docker, boot accessories, deploy
bin/kamal deploy -d production   # every time after
```

The root `bin/kamal` is a two-line wrapper that `cd`s into `server/` and hands off
to the Rails binstub, because Kamal resolves the config, the secrets, `--file`,
relative to the working directory; the config then finds `.env.<destination>`
one level up. The command it ends up running is the same from either place. One
wrinkle: a relative path passed as an argument (`-c`, mainly) is read from
`server/`.

Both build the image locally and push it to `KAMAL_REGISTRY_SERVER/KAMAL_IMAGE`.

Useful aliases (also `-d production`): `console`, `shell`, `logs`, `dbc`.

Migrations run from the web container's entrypoint (`bin/docker-entrypoint` calls
`db:prepare`, but only for `bin/rails server`), so a deploy migrates itself and
the Sidekiq container never races to do it.

### The build

The image is built from the **repository root**, not `server/`, because it needs
three trees:

- `server/` — the Rails app
- `client/` — built in-image by a Node stage (`npm ci && npm run build`)
- `shared/` — the JSON game data both sides read, copied to `/shared` because
  `lib/vanai/data.rb` resolves it as `../shared` relative to `Rails.root`

`builder: context: ..` in `config/deploy.yml` handles that, and the repo-root
`.dockerignore` keeps screenshots, `design/`, and `node_modules` out of the
context. There is no separate client deploy step and nothing to copy by hand.

Builds target `amd64`. On Apple Silicon that means QEMU emulation for both the
Ruby and Node stages, which is slow; `builder: remote:` is the escape hatch if it
starts to hurt.

## How the client is served

The Dockerfile's client stage builds into `client/dist/` and copies it over the
Rails `public/` root: `index.html` at the top, the fingerprinted bundles in
`public/client/`, and `client/public/` as it stands (models, textures, backdrops,
the KTX2 decoder) at the paths the client already requests. Rails' static file
server picks up `/` → `public/index.html` on its own, so there is no route and
no controller involved.

Thruster compresses responses with gzip by default (`GZIP_COMPRESSION_ENABLED`,
left unset in `config/deploy.yml`). Keep it on.

## The maker's assets

Gear, character models and animations are not in the image. They are the maker's
prepared folder of hash-named files (ASSETS.md), and the client fetches them from
`VANAI_ASSET_BASE` in `.env.production` as `<VANAI_ASSET_BASE>/files/<sha256>.<ext>`.
The client is built against that address (`server/Dockerfile`'s client stage takes
it as `VITE_ASSET_BASE`, and the build fails without it). The game's own generated
assets (creatures, cities, props) stay in the image.

A file's name is its content, so a published file never changes: upload only adds,
never overwrites or deletes, and a client from the previous deploy still finds its
files. Before a deploy whose `client/src/asset-index.json` changed, upload what is
new. The first upload is the whole folder, about 5 GB. Pick one of two places:

### On this server (`VANAI_ASSET_BASE=/runtime`)

The simplest: no bucket, no CORS, no second domain. `config/deploy.yml` mounts
`VANAI_RUNTIME_DIR` on the host (default `/var/lib/vanai/runtime`) read-only at
`/rails/public/runtime`, and Rails' static file server sends it with a year-long
cache header (`config/environments/production.rb`). Put the runtime there before
deploying: fetch the release this checkout pins straight onto the host (a clone
of the repository and Node are all it needs), or copy a folder you already have:

```sh
ssh <user>@<host> 'sudo mkdir -p /var/lib/vanai/runtime && sudo chown "$USER" /var/lib/vanai/runtime'
ssh <user>@<host> 'cd vanai && bin/fetch-runtime --dest /var/lib/vanai/runtime'   # or:
rsync -a <runtime>/files <user>@<host>:/var/lib/vanai/runtime/
```

After a deploy whose `asset-index.json` pins a newer release, run the fetch
again: it downloads only the archives that changed.

Every byte goes out through your server's bandwidth, so put a CDN in front of the
domain if you expect many players.

### In object storage (`VANAI_ASSET_BASE=https://assets.<your domain>`)

Any S3-compatible bucket with a public custom domain works: Cloudflare R2,
Backblaze B2, AWS S3, MinIO. Set it up once:

1. Create a bucket and give it a public custom domain, e.g. `assets.<your domain>`.
2. Set its CORS policy: the client fetches across origins.
   ```json
   [{"AllowedOrigins": ["https://<VANAI_DOMAIN>"], "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}]
   ```
   Add `http://localhost:5173` while testing a local build against the bucket.
3. Make a read-write key for that bucket only, for your upload tool.
4. On Cloudflare, add a Cache Rule for the asset hostname (*Eligible for cache*,
   Edge TTL *use cache-control header if present*). Without it the edge does not
   cache `.glb`, `.ktx2` or `.json` (`cf-cache-status: DYNAMIC`) and every request
   reads the bucket.

Upload with the immutable cache header, so the CDN and the browser keep each file
for good:

```sh
rclone copy <runtime>/files <remote>:<bucket>/files --ignore-existing \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
# or
aws s3 sync <runtime>/files s3://<bucket>/files --endpoint-url <S3 endpoint> \
  --cache-control "public, max-age=31536000, immutable"
```

(With the maker checkout, `node tools/runtime/publish.mjs` does the same for R2,
reading `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from the
maker's `.env`; `--dry-run` counts what it would send.)

Check a file with `curl -sI https://assets.<your domain>/files/<name>` twice: behind
Cloudflare, `cf-cache-status: HIT` the second time. No cookies go to the asset
domain: same-origin stays the rule for `/api` and `/cable` only.

The client uses **same-origin** URLs in production (`/api`, `wss://…/cable`), so
there is no CORS to configure and nothing to point at a different host. Keep it
that way: session cookies are `SameSite`, and a client served from another origin
would fail to authenticate.

Caching is split. `config.public_file_server.headers` gives everything in
`public/` a year-long `cache-control`, which is right for the hashed bundles under
`/client/`. `Vanai::NoCacheHtml` (`lib/vanai/no_cache_html.rb`) walks that back to
`no-cache` for HTML, so returning players aren't pinned to a stale shell pointing
at bundles the last deploy deleted. `assetsDir: "client"` in `vite.config.ts`
keeps the client out of `public/assets`, which belongs to Propshaft.

## Environment

Set in `config/deploy.yml`:

| Var | Value |
| --- | --- |
| `RAILS_ENV` | `production` |
| `APP_ORIGIN` | `https://` + `VANAI_DOMAIN` — the Action Cable origin allowlist, and the hostnames Rails answers (`config.hosts`; any other `Host` gets a 403, `/up` excepted). Several may be given, separated by commas. Empty means every WebSocket handshake is rejected, which takes the whole game down; the app logs a warning at boot. |
| `DB_HOST` | `vanai-db` |
| `REDIS_CABLE_URL` / `REDIS_SIDEKIQ_URL` / `REDIS_CACHE_URL` | the three Valkey accessories |
| `WEB_CONCURRENCY` | `0`; ignored by `puma.rb`'s `workers 0` — see the rule at the top |
| `RAILS_MAX_THREADS` | `5`. Puma threads and Sidekiq concurrency. The Active Record pool is this **+9**: ActionCable's worker pool (4), the world's position writer and two join loaders (3), the world thread and one spare check out connections alongside the request threads (`config/database.yml`). |
| `RUBY_THREAD_TIMESLICE` | `10`. Ruby's time slice in ms (default 100), so the world thread waking for its tick waits a few ms for the GVL rather than a whole slice behind each busy thread; the world thread's own priority keeps its slice long (SERVER-PERF.md rule 10). |

`SECRET_KEY_BASE`, `POSTGRES_PASSWORD` and `ANTHROPIC_API_KEY` (empty unless
the courts are on; see Settings and secrets) come in as secrets.

`VANAI_FORCE_SSL` is not set, so it is on: Rails assumes TLS ended at the proxy,
redirects to HTTPS, sends HSTS and marks cookies Secure. Both Kamal front doors
(Let's Encrypt and the tunnel) serve HTTPS, so leave it alone there.

### Plain HTTP (a LAN game, no TLS)

Run the image with `VANAI_FORCE_SSL=false` and `APP_ORIGIN` set to the address
players type, e.g. `APP_ORIGIN=http://192.168.1.20:3000`. With SSL forced, a
browser on plain HTTP drops the Secure session cookie and no login sticks. Never
turn it off on a server reachable from the internet.

## Moderation and accounts

Bans and mutes are per account, so they cover every character on it, and they
are columns on `users` (`banned_at`, `muted_at`). The rake tasks only touch the
database, so they run beside the live server, by the account's email:

```sh
bin/kamal app exec -d production --reuse "bin/rails 'accounts:ban[someone@example.com]'"
bin/kamal app exec -d production --reuse "bin/rails 'accounts:unban[someone@example.com]'"
bin/kamal app exec -d production --reuse "bin/rails 'accounts:mute[someone@example.com]'"
bin/kamal app exec -d production --reuse "bin/rails 'accounts:unmute[someone@example.com]'"
bin/kamal app exec -d production --reuse "bin/rails 'accounts:delete[someone@example.com]'"
```

- **Ban**: refused at sign-in ("This account has been banned.", told only to
  the right password), on every API request even with a session cookie, and at
  the WebSocket; the task closes their open sockets at once (the Redis cable
  adapter carries it to the web process), and the client's reconnect is refused.
- **Mute**: they play on, but their say, party, company and `/tell` lines reach
  no one, and the game tells them they are muted. The world keeps it in memory
  (`World::MUTE_TTL`, 5 s): a mute made in the web process lands on the next
  line, one from this rake task or a console within 5 s. Mail is not covered.
- **Delete**: bans and disconnects first, then removes the account, every
  character and everything that hangs off them; their auction listings go too
  (live ones with their goods), their companies' lead passes to a remaining
  member, or the company is furled if no one is left. It cannot be undone.

The same from `bin/kamal console -d production`:

```ruby
u = User.find_by_email("someone@example.com")
u.ban!            # u.unban!
u.mute!           # u.unmute!
u.delete_account!
u.update!(password: "a-new-password")   # password reset: 8 characters or more
```

There is no emailed password reset: a player who forgot theirs asks, and the
console line above sets a new one. A reset signs the account out everywhere: the
cookie session carries the account's session token, which a new password
replaces, and its open sockets are closed. Signing out in the game does the
same, so a copied cookie dies with it. The migration that added the token
(2026-10-19) signs every player out once.

Sign-in and sign-up each allow 10 attempts per IP address in 3 minutes
(`Api::BaseController::AUTH_ATTEMPTS`/`AUTH_WINDOW`), counted in the Redis cache;
the 11th gets a 429 and "Too many attempts". The limit keys on `request.remote_ip`,
which is the player's address behind kamal-proxy and the Cloudflare tunnel (both
are private addresses Rails skips); if a proxy that Rails does not trust is ever
put in front, every player would share one count. Sign-in also allows 20
attempts per email address an hour (`AUTH_ATTEMPTS_PER_EMAIL`/`AUTH_EMAIL_WINDOW`),
so guesses from many addresses still meet a limit; anyone who knows an address
can spend that hour's attempts, which is why it is generous. Character creation
is limited per account too, and an account holds at most 8 characters. The
cache failing open means no limit while Redis is down, not refused logins.

The server also holds each player to the speed they can run (8 m/s, client
`world.ts`; `server/lib/vanai/move_check.rb`): a distance budget refills at that
speed plus 25% and holds at most two seconds of it for a stalled connection; a
reported position past the budget is cut short and the rest walked at the
speed limit, and the log says
`[vanai] fast move clamped char=<id> name=<name>` (at most once per 10 s a player).
`World::MOVE_POLICY = :reject` drops such moves instead.

## Production notes

- **Cable**: `adapter: vanai` (`lib/vanai/cable_adapter.rb`). The game's `zone:`
  and `char:` broadcasts are delivered in process, since the world that sends
  them lives there; only ActionCable's own channels, the remote disconnects that
  bans and sign-outs use, go through Redis. Nothing outside the web process
  (Sidekiq, a console) can reach a player through a game stream: the council job
  stores its turns and the world thread sends them. See SERVER-PERF.md.
- **Cache**: `:redis_cache_store`, namespaced `vanai:cache`. Failures are logged
  and swallowed — a cache outage costs latency, not uptime.
- **Sidekiq**: its Redis is the only one holding state you'd miss. Back it up or
  accept losing enqueued jobs.
- **Dev commands** (`/tp`, `/tpgive`, `/warp`, `/council`) are guarded by
  `Rails.env.development?` and are dead in production.
- **Dev views** (`/?zone=`, `/?lineup`, `/?bestiary`, `/?cutscene=`, ...) are
  left out of a production build; only `/?character-preview`, the pre-game
  screens' own iframe, runs. A client built with `VITE_DEV_VIEWS=1` keeps them
  (`client/src/main.ts`); the Dockerfile does not set it, and should not, since
  they hand anyone the whole map and story.
- **Backups**: `pg_dump vanai_production` on a cron covers everything players care
  about.
- **Restart etiquette**: restarts drop live sessions (players just refresh) and
  in-memory parties disband. Announce them in /say like it's 2004.
- **Scaling later**: if one process ever isn't enough, the path is AnyCable plus
  extracting the world loop into a dedicated process — a known evolution, not a
  rewrite.
