# Gulf Ferry

The ferrymasters at Moonmere Shores and Caerdun Fields replace the two instant
ferry portals. Both boats depart on the same UTC ten-minute boundaries, spend
seven minutes at sea, and remain docked for three minutes. They exchange shores
each cycle. `shared/data/ferry.json` owns the schedule, fare, measured dock
footprints, passenger deck and cannon collision bounds.

Talk to the ferrymaster for the next arrival. Registration is available only
while a boat is docked. Confirming keeps the character on shore; a persistent
panel counts down and provides cancellation. Leaving the dock, dying, entering
combat or disconnecting cancels an unpaid registration. Moving along the dock
outside the NPC's talk radius does not cancel it.

At departure, eligible passengers pay exactly 10 gold from their current locked
database balance. The balance change and durable voyage assignment commit in
one transaction before any client changes zone. A character who spent/traded
away the fare stays ashore with an explanation and must register again. Cancel,
reconnect, arrival and retried departure commits never charge another fare.
Existing ferrymaster quests, rewards and subsidy dialogue remain available;
there is no fare exemption or new subsidy mechanic.

Passengers share a walkable ship deck and ordinary local chat. The opposite
boat has a separate zone. Cannon carriages block movement on client and server;
the lower deck uses the existing ship model's measured floor. End ropes mark
the passenger area. Higher ship decks are scenery. The docked model approaches
and leaves with one transform update, using the synchronized server clock.
There are no moving-platform physics or extra lights/wake effects.

A disconnected passenger keeps the voyage and arrives automatically, including
while offline. On restart, committed voyages are recovered from PostgreSQL;
unpaid dock registrations are discarded. An expired voyage is resolved before
a returning player joins the world. A world stall that misses the entire
crossing cancels unpaid registrations without charging. Existing Home travel
remains available at sea and clears the voyage; paid fares are not refunded.

## Integration

A committed voyage is the nullable `characters.ferry_voyage` JSONB column. A
change to `ferry.json` reaches play after a restart of the single Rails world.
The normal client uses port 3000 in development; `VITE_API_ORIGIN`
(`client/src/net.ts`) points it at an explicitly isolated review server.

The server half is `server/lib/vanai/ferry.rb` (the timetable, docks and deck
collision) and `ferry_world.rb` (registration, departure, arrival, recovery);
the client half is `ferry-clock.ts` (the synchronized clock and the boat's
pose), `ferry-deck.ts` (the deck's floor and obstacles, mirroring the
server's), `ferry-hud.ts` (the boarding panel) and `ferry-visual.ts` (the
ship). `client/test/ferry_clock.test.mjs` and `ferry_deck.test.mjs` read the
same data.

## Verification

- `cd client && npm test && npm run build`
- `python3 tools/data/audit.py`
- `cd server && RAILS_ENV=test bundle exec ruby test/integration/ferry_test.rb`
- `server/bin/ci` includes the ferry integration suite.

The integration suite covers exact schedule boundaries, both directions,
whole-dock cancellation, stale confirmations, death/combat, exact/insufficient
balances, an actual trade after registration, concurrent spending, atomic
rollback, idempotence, reconnect, offline arrival, restart and chat isolation.

For real browser review, create/migrate a separate local database whose name
starts `vanai_ferry_review_`. From `server`, run
`DATABASE_URL=postgresql:///vanai_ferry_review_20260924 bundle exec ruby ../tools/qa/ferry_live_server.rb`.
The guarded review-only launcher binds 127.0.0.1:3013, creates three fixture
characters and controls the clock without changing production durations.
From `client`, run
`VITE_API_ORIGIN=http://127.0.0.1:3013 npx vite --host 127.0.0.1 --port 5194 --strictPort`.
Then run `node tools/qa/ferry_multiplayer.mjs` from the repository root. Start a
fresh review server before repeating the test; it resets only its fixture
characters in the dedicated database. Stop this test server when finished.

`node tools/qa/ferry_visual.mjs` uses the dev client (`VANAI_QA_BASE`, default
http://localhost:5173, or `FERRY_QA_URL`) to check both dock animations, deck collision and repeated docked/moving render samples.
It saves screenshots and JSON under `.playwright-mcp/ferry/` (ignored). These are
local render timings, not a claim about other hardware or production latency.

Useful no-account views on the preview server:

- `/?zone=gulf_to_caerdun&walk&at=2,-3&look=3,0&looky=5.7`
- `/?zone=moonmereshores&at=-162,-224&eye=14&look=-190,-258&looky=7&ferrytime=500`
- `/?zone=caerdunfields&at=-25,250&eye=14&look=-53,282&looky=7&ferrytime=500`

`ferrytime` pins only development preview animation: 500 docked, 610 departing,
700 away, 1010 approaching, 1020 docked. It does not change server boarding.

## Verified checkpoint — 2026-09-24

Client build and 195 client tests pass. The full server suite passes 73 tests
and 116,908 assertions; after the final stern-boundary correction, all 21 ferry
tests and 88 assertions pass again. Shared-data and dependency audits are clean.
The three-browser test passes through both departures, same-sailing chat and
visibility, opposite-sailing isolation, keyboard walking, reconnect, offline
arrival and balances of 40/0/40 from 50/10/50. Its server clock is advanced at
boundaries; it does not wait seven wall-clock minutes.

Actual screenshots revealed and corrected the deck overlay, stern overlap,
boarding camera position and old NPC dialogue remaining open at sea.

Local Chrome/Metal, 1500×1000, two samples per mode/port, 60 frames each with the
first ten discarded:

| Port | Docked median render CPU | Moving median render CPU | Draws/frame | Total scene meshes |
| --- | --- | --- | --- | --- |
| Moonmere Shores | 4.3–4.4 ms | 4.3–4.4 ms | 787–789 | 274 |
| Caerdun Fields | 5.9–6.2 ms | 5.9–6.1 ms | 1535 | 372 |

No consistent render CPU increase appeared in these samples. Total frame-time
medians were 53–75 ms at Moonmere and 24–27 ms at Caerdun, so this is not a 60 FPS
claim. The animation adds no scene meshes between docked and moving states.
