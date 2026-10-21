# Server performance: the world thread's budget

How many explorers one Vanai server can hold is set by one thread. Every zone
ticks on the world thread every 0.25 s (`World::TICK`), and every move, chat
line, attack and join reaches it through `World.enqueue`. There is only ever one
web process ([DEPLOY.md](DEPLOY.md)), so nothing can be scaled out. A tick that
runs long holds back every zone for every player.

This record exists because a 2026-10-19 audit found the same handful of mistakes
throughout the server, each one cheap with ten players and a wall at a few hundred.
Read it before changing anything the tick, a cable action or a REST mutation
reaches. The rules below are what those mistakes taught; each one names the code
that keeps it and the test that fails if it is broken again.

## The budget

- **A tick has 250 ms, and the target is under 25 ms with 500 explorers.** After
  the 2026-10-19 fixes, 500 spread over the world measure 18 ms mean and 25 ms
  p95. 500 in one city measure 14 ms, and 30 walking the Keep measure 2.2 ms.
  Measure with `server/script/tick_harness.rb` (below) before and after a change
  to anything the tick reaches, and put the numbers in the change.
- **Steady play asks the database nothing.** Players walking, monsters wandering,
  chat, `/tell`, `/c`, Player Search and pos frames all run with no SQL. The only
  database work on the world thread is the work that must be durable: periodic
  position saves, joins, kills (XP, gold, drops), quest steps and deaths. Each of
  those is counted by a test.
- **A REST request never makes the world do unbounded work.** Whatever a request
  queues for the world thread is coalesced per character and rate-limited per
  character.
- **The process has one core of Ruby, and the world thread is only one of its
  users.** Ruby runs one thread at a time (the GVL): cable messages coming in,
  frames going out, requests and the tick all take turns. At 2000 explorers
  walking, the moves coming in used more of it than the tick did until they
  skipped the worker pool (rule 10). Count a change's cost on every thread, not
  only the world's.

## The rules

### 1. No SQL, Redis or file I/O per tick, per move or per chat line

A query on the world thread costs its own time and a GVL hand-off. Each query
stalls every zone, and 500 players times a query a line is a frozen world.

- The mute and silence check used to query the database on every line. It is now
  read from memory with `World::MUTE_TTL` (5 s). A mute made in the web process
  lands at once (`User` `after_update_commit` → `World.forget_mutes`). A mute
  from another process, such as the rake task or a console, lands within the TTL.
- Company chat used to pluck every member id from the database. It now reads
  `World.company_online`, kept in join, leave and `company_cmd`.
- Examine still reads the target's equipment from the database. It is rare, so
  it stays.
- *Guards:*
  - `test/integration/world_thread_budget_test.rb`: steady play in a city, in a
    dungeon and in an empty world asks the database nothing.
  - `social_index_test.rb`: a chat line and a company line ask nothing.

### 2. Durable writes are batched and spread, never one statement per row in one tick

- Position saves are due every `ZoneState::SAVE_EVERY` (15 s). Each character
  saves on a phase of its own (`save_phase`, from the character id), so 500
  players who join together do not save together forever. The worst tick went
  from 142-242 ms to about 30 ms.
- The saves are the one durable write that leaves the world thread
  (`lib/vanai/position_writer.rb`). The tick copies the rows due; at its end
  `World.positions.commit` hands every zone's to the writer's thread, which
  writes all that is waiting in one statement. They were one statement a zone on
  the world thread: 17 round trips a tick at 2000 explorers, 9 of a 12 ms player
  phase on a quiet machine and 52 of 57 ms on a busy one.
- **Any synchronous write of a character's `zone`, `x`, `z`, `heading` or
  `dead_at` goes through `World.pos_db`, never `db`.** It flushes the writer
  first; otherwise a queued save lands after the crossing, release or leave and
  puts the character back where they stood. The flush never gives up: past
  `PositionWriter::SLOW_FLUSH` (5 s) it logs and goes on waiting, because a
  write that went ahead of a stalled batch would be undone by it (a fall
  cleared, a player up again after a restart). The batch also writes a row only
  while its zone is still the character's, so a crossing that forgot is not
  undone, but it would still lose a same-zone teleport.
- A fall or a Raise (`World.persist_death`) is queued on the writer behind the
  saves before it (`PositionWriter#later`) rather than waited for: it happens
  mid-tick, and nothing reads `dead_at` back before a leave or a release, which
  flush. Nothing else may move to a thread: XP, gold and quests are read back
  by the next action and must be on the row when it runs.
- A kill's gold for the whole party is one statement (`Combat.credit_gold`), and
  so is its XP (`World.persist_jobs`). A member who levels saves their own row
  first, because `recompute!` reads it back. Both lock rows in character id order,
  the order every multi-character transaction takes (trade, mail, the auction
  house, the council). A new multi-row write must take that order too, or it can
  deadlock and hold the tick for the deadlock timeout.
- A drop reads the party's bags only when a quest could change who gets it
  (`Combat.pick_recipient`).
- Never move these writes to another thread to save time. The world's state and
  the rows must agree when the next action reads them.
- *Guards:*
  - `zone_tick_perf_test.rb`: batched saves equal single saves, and staggered
    phases.
  - `world_offload_test.rb`: the tick writes no save itself, two zones' saves go
    in one statement on the writer's thread, a synchronous write lands after
    every queued save, a flush waits out a database slower than its patience, a
    death is queued behind the saves and the tick does not wait for it, and a
    save for a zone left writes nothing.
  - `kill_path_db_test.rb`: statements per kill, the lock order, and shares
    unchanged.

### 3. No scan over everything in a hot path: index it when the data loads

The worst bottleneck found was `SiteLevels.move`. It tested every deck of a site
at every 0.15 m of every move, so one step in the Keep cost 1.3 ms. 80 players
walking the big dungeons would have filled the world thread on their own.

- `SiteLevels.index!` (run by `Data.load!`) now builds a 4 m cell grid of each
  site's decks and ramps. The grid lives in a side table keyed by the site's
  identity, never written into the data. A move in the Keep now costs about 20 µs.
- `DungeonNavigation` packs cells as integers, allocates nothing per sample, and
  grows each goal's breadth-first search only as far as the asking pursuer needs.
  It resumes that search for the next pursuer.
- Online players by name (`World.online_by_name`), the company members online,
  and Player Search's sorted roster are kept as indexes. They are updated in join
  and leave, never rebuilt by walking `@online` per request.
- The pattern: anything looked up per move, per tick or per message gets a hash
  or a grid built once, either at `Data.load!` or on join and leave. Keep the old
  linear version in a test as the oracle, and compare the two on random walks.
  If the index lives in a side table and someone edits a site at runtime, call
  `index!` again.
- *Guards:*
  - `site_levels_index_test.rb` and `dungeon_navigation_equivalence_test.rb`:
    the old code verbatim against the new, over every zone.
  - `social_index_test.rb`.

### 4. Encode a broadcast once; never decode or re-encode it per subscriber

ActionCable's `stream_from ... coder: ActiveSupport::JSON do |msg| transmit(msg)
end` decodes every published message and re-encodes it, once for every
subscriber. With 500 in one zone at 4 Hz, that was more CPU than the GVL could
give.

- `ApplicationCable::Channel#stream_raw` splices the published JSON into the
  frame unchanged (`Connection#transmit_raw`), with the session gate kept.
- A new stream uses `stream_raw`, never a decoding block.
- *Guards:* `cable_stream_test.rb` (frames are byte-identical to ActionCable's,
  and stale sessions hear nothing).

### 5. The game's broadcasts stay in the process

Production's cable adapter is `adapter: vanai` (`lib/vanai/cable_adapter.rb`).
`zone:` and `char:` streams are delivered in process, because the world that
broadcasts them lives here. Only ActionCable's own channels go through Redis;
those are the remote disconnects used by bans, password changes and signing out
everywhere. Through Redis, every broadcast had been a blocking PUBLISH on the
world thread.

- The consequence: nothing outside the web process (Sidekiq, a console, a rake
  task) can reach a player through `zone:` or `char:`. To tell players something
  from there, write it down for the world thread to send.
- *Guards:* `cable_adapter_test.rb`.

### 6. Send what changed, not the world

Pos frames are deltas (`ZoneState#broadcast_positions`):

- a row only when it changed;
- once more as an entity stops;
- a resting row restamped ahead of a move, in the frame's `r` block, so
  interpolation has the stop point;
- a full keyframe every `KEYFRAME` ticks (2 s) and after a join;
- no frame at all over a still zone;
- no rows built in a zone nobody is in.

Monster AI still runs in empty zones, because that is gameplay.

- A new per-tick broadcast must answer two questions before it lands: does it go
  out when nothing changed, and does its size grow with everyone in the zone?
- Interest management, sending each player only what is near them, is the
  remaining bandwidth fix. It is not built: it conflicts with the nearest-20
  ruling (`actor_stream_plan.ts`), the maps and the party UI, so it waits for
  Philip's ruling.
- *Guards:* `zone_tick_perf_test.rb` (applying the deltas rebuilds the full
  snapshot every tick, and a still zone sends only keyframes).

### 7. Joins have a budget per tick, and read their rows off the world thread

A join is real database work: about 20 queries and 5-10 ms. A reconnect storm
after a deploy once ran every join in one tick, about 4 s with 500 players.

- `World::JOIN_BUDGET` (40 ms) caps the joins a tick runs. The rest wait in
  order, and the budget is checked before a join token is spent.
- A join loads only what it reads: no bag eager-load, and quests and discoveries
  plucked.
- The rows are read on two loader threads (`lib/vanai/join_loader.rb`), up to
  `World::LOADS_IN_FLIGHT` (32) at once. The loader builds the PlayerState, and
  the world thread installs it a tick later (`install_loaded_joins`). The world
  thread reads the rows again itself (`join_load_current?`) when the character
  joined or left meanwhile (`presence_gen`), or anything changed them
  (`touch_gen`). A character still online when their join comes (a refresh) is
  read on the world thread after their leave, as before, and never waits for a
  load slot. A loader thread that dies still hands its ticket back, and is
  replaced. Outside a running world (tests, the console) every join is inline.
- **Every write to a character's rows that the world's copy does not follow
  calls `World.touch(char_id)` once it commits** (or `request_recompute`, which
  counts too): a sale's proceeds to the seller, a court's purse or accepted
  offer, a scene watched. The character may be offline with a load in flight;
  without the touch they arrive with what the rows held before the write. A new
  writer of gold, court, job, gear, quests or discoveries for a character other
  than the one asking, or from the world thread for someone not online, needs
  one.
- What every arrival is told last, the mail badge and the courts' state, is read
  for all of a tick's joins at once (`World.finish_joins`, `Courts.on_joins`,
  `Mail.push_unread_many`): about 13 queries a tick, not 14 a join. Those were
  3.4 of a join's 4.4 ms after the loader. Each court part is built before any of
  it is sent; one that fails for the tick is built again for each arrival alone
  (`Courts.join_part`), so a bad row costs only its own character. Cut per
  character in the query (the letters' `ROW_NUMBER`), never in Ruby.
- A 1000-player storm now takes 8.7 s, against 28 s joining inline with the
  batching, and its worst tick is 63 ms, not 113 ms (`script/join_storm.rb`).
- Anything new added to a join adds to every zone crossing, ferry landing and
  reconnect. A read belongs in `JoinLoader#read` if it is the character's own
  rows, in a batched `finish_joins` step if it can be read for many at once, and
  on the world thread only if it must see the world as it is. Count its queries.
- *Guards:*
  - `world_load_test.rb`.
  - `world_offload_test.rb`: the world thread does not read the rows the loader
    read, the player is the same whichever thread read them, a cancelled
    subscription never joins, a load a request changed is read again, so is one
    a purse was paid during, a load that dies still joins, and a rejoin while
    online reads after the leave and never waits for full loads.
  - `mail_auction_test.rb`, `cutscene_opening_test.rb`: a sale touches the
    seller, a scene watched touches the watcher.
  - `courts_join_batch_test.rb`: the batch sends each character what one join at
    a time did, in the same order, in the same number of queries for 2 or 8, and
    one bad row costs only its own character.

### 8. Work a request queues is coalesced and paced

REST mutations (equip, unequip, vendor, craft, auction, mail collect) used to
queue an uncoalesced `World.recompute` each: five queries and a zone-wide
broadcast. One script could fill the tick.

- `World.request_recompute(char_id)` queues at most one recompute per character.
  The pending set is cleared before the read, so no commit is missed.
- `player_update` goes to the zone only when what the zone sees changed. A
  gold-only change tells only the player.
- `unequip` refuses an unknown slot and queues nothing when no row changed.
- Every mutating endpoint has a per-character `rate_limit` sized well above
  human click rates.
- A new endpoint that enqueues world work needs all three: coalescing, a rate
  limit, and a broadcast only on a visible change.
- *Guards:* `world_load_test.rb`.

### 9. Size the database pool from the threads

The pool is `RAILS_MAX_THREADS + 4 + 3 + 2` (`config/database.yml`): the Puma
threads, the cable worker pool, the position writer and the two join loaders,
the world thread and one spare. A thread waiting for a connection is a stalled
request, or a stalled world. If you raise `config.action_cable.worker_pool_size`,
`JoinLoader::THREADS` or the Puma threads, raise the pool with it.
`cable_adapter_test.rb` checks that the production pool covers every thread.

### 10. The GVL: high-rate messages skip the worker pool, and the world gets its turn

Every explorer walking sends ten moves a second. Through ActionCable's worker
pool a move cost about 57 us of CPU in all: a task posted to the pool, a thread
hand-off, the executor and connection callbacks round it, the subscription
looked up, a debug line built and dropped, the perform_action notification. At
2000 walking that is more than one core, so the moves alone would have filled
the GVL.

- `ApplicationCable::Connection#receive` takes a move for a confirmed ZoneChannel
  subscription on the thread that read the frame, through the same bucket and
  `ZoneChannel#move` (`ZoneChannel#fast_move`): 7.8 us. Anything else, or a move
  it cannot place, goes the usual way. Only while none of that connection's
  messages wait in the pool (`@in_pool`): the pool takes them in order and runs
  behind under load, so a move going round it would reach the world before an
  interact sent first and walk the player out of its reach.
- A new action sent many times a second per player (more than a few a second)
  takes the same way in, or is measured first.
- The world thread waits its turn for the GVL like any other thread: waking for
  a tick behind two busy threads it came in up to 249 ms late at Ruby's default
  100 ms slice. Production sets `RUBY_THREAD_TIMESLICE=10` (`config/deploy.yml`)
  and the world thread's priority (`World::WORLD_PRIORITY`, 3: eight slices), so
  it waits a few ms and its tick is not cut up. Never lower that priority, and
  keep CPU-heavy work (a big export, a report) out of the web process.
- `ApplicationCable::Channel.action_methods` is kept, not rebuilt per message.
- *Guards:* `cable_fast_move_test.rb` (a move queues without the pool, the same
  moves for odd input either way, the bucket holds, a move waits behind its
  connection's messages in the pool, everything else goes the usual way).

## Measuring

```sh
cd server
createdb vanai_bench && RAILS_ENV=test DATABASE_URL=postgresql:///vanai_bench bin/rails db:schema:load
export RAILS_ENV=test DATABASE_URL=postgresql:///vanai_bench   # never the test suite's database
bin/rails runner script/tick_harness.rb spread 500         # 500 over the world
bin/rails runner script/tick_harness.rb packed_city 500    # 500 in Caerdun
bin/rails runner script/tick_harness.rb dungeon:keep 30    # 30 walking the Keep
bin/rails runner script/tick_harness.rb combat_spread 200  # everyone fighting
bin/rails runner script/join_storm.rb 1000                 # 1000 reconnecting at once
```

The harness boots the world without its thread on fake players (no rows of
theirs) and drives 10 Hz moves on a simulated clock. It prints mean, p95 and max
tick ms, the time per phase, allocations, GC, SQL per tick, and the bytes
published and delivered per tick. Its header lists the options. The courts' tick
commits rows, so give the harness a database of its own. `join_storm.rb` makes
real characters, asks them all to join at once and runs the ticks at the world's
pace; `inline` joins on the world thread, as before the loader.

Postgres round trips on a loaded machine are several times slower: a harness
run while other work is going on can read 136 ms where a quiet one reads 50.
Compare runs made one after the other, and say how loaded the machine was.

For a single path, count statements with
`ActiveSupport::Notifications.subscribe("sql.active_record")`, skipping `SCHEMA`
and the transaction bookkeeping, as the guard tests do. For a query, run
`EXPLAIN ANALYZE` on seeded volumes. Report what you measured and what you did
not.

The 2026-10-19 numbers, before → after (median of 3 runs, 120 ticks):

| Scenario | Mean tick ms | p95 ms | Worst tick ms | SQL a tick |
| --- | --- | --- | --- | --- |
| 500 spread | 25.2 → 18.2 | 41.9 → 24.7 | 139 → 57 | 8.9 → 7.5 |
| 500 in Caerdun | 21.0 → 13.9 | 49.8 → 21.1 | 66 → 49 | 8.3 → 1.1 |
| 30 walking the Keep | 10.4 → 2.2 | 38.9 → 3.1 | 79 → 11 | 0.6 → 0.5 |
| 500 reconnecting at once | one 4,000 ms tick | — | 4,185 → 71 | — |

The 2026-10-20 numbers (quiet machine, load average about 2):

| Scenario | Before | After |
| --- | --- | --- |
| 2000 spread, mean / p95 tick | 50 / 66 ms | 44 / 59 ms |
| 2000 spread, SQL a tick | 19 | 2.5 |
| 300 reconnecting at once, last one in | 12.1-12.3 s | 2.8 s |
| 1000 reconnecting at once, last one in / worst tick | 28.1 s / 113 ms (inline, already batched) | 8.7 s / 63 ms |
| One move, CPU from the socket to the world's queue | 57 us + 4.3 parse | 7.8 us + 4.3 parse |
| The world thread waking behind two busy threads | up to 249 ms late | about 25 ms |

## Still open

- **Interest management.** Pos frames go to the whole zone, about 12 MB a tick
  delivered with 500 in one field zone. This waits on Philip's ruling (rule 6).
- **Unbounded write buffers.** ActionCable queues frames for a slow client
  without a limit.
- **The client's inventory refetch.** After `inventory_dirty`, the client fetches
  the whole of `/api/game/state` to read the bags and gold.
- **The cable's own Ruby.** Parsing a websocket frame is 4.3 us and framing one
  out 5.3 us, all in Ruby on the GVL. Past a few thousand explorers, the next
  step is a websocket server outside Ruby (AnyCable-style), with the world
  staying in this process.
- **The auction's counts.** The per-category counts are full passes over the live
  listings. This is fine at today's `AuctionListing::LIMIT` (7 a seller).
