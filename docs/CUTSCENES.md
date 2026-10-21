# Cutscenes

In-engine scenes, played over the live zone with the watcher's own character.
Built 2026-10-11. The first three are the home-city openings a new character
sees on arrival.

## The intro

Every new character sees **"The Empty Throne"** first. It runs 1:38 and is
shared by everyone, then the character's city opens with its own opening. It
plays before the character joins the world (`main.ts` `startGame`), so nobody
else sees them and no server state changes until it ends. Watched or skipped,
the client reports it seen over REST (`POST /api/game/scene_seen`,
`GameController#scene_seen`). Character select has a **Watch the intro** link
that replays it.

**Re-cut 2026-10-12** (Philip: "make the intro more exciting ... the flybys are
also really slow", then "do all"). It was 2:39, 42% of it narration cards on
black, with cameras at 1.5-12 m/s 250-470 m from what they looked at. Now:

- the black is only as long as a build needs, and a card's words stay over
  the first shot (`card.hold`);
- shots are 2-4 s, flown close, and cut on the beat of a faster overture
  (120 in 4/4: a bar is 2.0 s);
- the living Capital is lit for its last night and has people in its streets
  (`crowd`);
- the music stops dead under "Then, one night...";
- the climax opens a real Border Gate on a cut (`gates`) and pushes through
  its veil into the title's hit;
- the King's Gardens chapter is gone.

It is told in **chapters** (`chapters` in cutscenes/*.json; `cutscene-cinema.ts`)
because the client holds one zone at a time:

| Bar | Card (on black, then over the picture) | Zone, hour | Shots |
| --- | --- | --- | --- |
| 0 | For a thousand years, the Empire of Vanai ruled all of Ardenfell. | capitalreturned, night (0.53) | over the walls; down the avenue among its people; up to the palace |
| 8 | Then, one night, between dusk and dawn, everyone was gone. *No war. No plague. Not one body.* (in silence) | capital, dawn | the same flight up to the palace, empty; the square |
| 15 | Around the heartland closed a border that no one could cross. | borderwall | along the rampart road; under the outer face; the wall into the peaks |
| 21 | Those left outside built three free cities: *one around a garrison that kept the watch,* | caerdun | from landward over the rooftops to the sea; along the sea ramparts to the lighthouse |
| 26 | one in a wood the empire never took, | heartwood | low between the giant trunks; rising to the ring |
| 32 | and one on an island the sea had saved. | moonmere | the island alone from the open sea; climbing over the harbour ring |
| 37 | Now, after three hundred years, the border is failing. | caerdunfields, morning | Caerdun's Border Gate, shut; the cut at bar 42 opens it; through the veil |
| 45 | **VANAI**, *The Empty Throne* | — | the title, on the hit |

The three cities are not named here and are filmed from other sides than
their openings, which follow at once and carry the names and the titles
(Philip, 2026-10-12: the intro repeated the openings' shots and titles).

The Capital is shown in both of its states: alive on its last night (the
returned city), then empty at dawn along the same flight path.

**The music leads.** The overture (`score/intro.ts`, "The Empty Throne", 120
in 4/4 in F, built on the Household theme, with the three cities' themes
quoted in their own sections) has a section starting on every chapter's bar. A
chapter's card comes in on its `bar`, its shots start `cardBars` later, and
the shots run to the next chapter's bar. `cinemaProblems` and the client test
check the shots add up to those bars, and that each chapter opens a section of
the piece.

**Keeping the cuts on the beat.** A card is as short as its zone's build
allows. MEASURED headless 2026-10-12, from the card to the first frame:

| Chapter | Card to first frame | Card |
| --- | --- | --- |
| Heartwood | 6.8 s | 3 bars |
| Caerdun's fields | 6.6 s | 3 bars |
| the Border Wall | 3.8 s | 2 bars |
| the empty Capital | 3.5 s | 2 bars |
| Moonmere | 3.1 s | 1 bar |
| Caerdun | 2.8 s | 1 bar |

- **The first chapter** is built and warmed, its townsfolk dressed, before
  the overture starts at all. That is 7.4 s on black, with a slow brass glint
  low on the screen.
- **A chapter late from its warm-up** rolls the moment it is ready and skips
  ahead by its lateness (`CutscenePlayer.skipAhead`). The cuts never drift
  off the music, and the first shot is a moment shorter. The last full run
  had every chapter within 1.2 s, with each first shot a straight move that
  absorbs it.
- **The cinema's warm-up is lighter** than a scene's (`warmLight`):
  - it visits only each shot's two ends;
  - it settles after 300 ms of quiet;
  - it does not wait on the meadow, which grass.ts lays a cell a frame
    around the camera. Waiting on the meadow had cost 2-4 s a chapter.
- `window.__cinLog` has each chapter's build, ready, roll, lateness and
  crowd.

**The crowd.** The intro builds no NPCs (world.ts places a zone's own for
play), so a busy street brings its own: `crowd` is townsfolk spread along a
line, most of them strolling. Each is a production avatar, so they are few (12
on the avenue and round the fountain; `CROWD_MAX` 60) and on three bodies
between them. Each body compiles its own shaders: eight bodies kept the first
chapter waiting 11 s, three 7.4 s.

**The gate.** `gates: [{at, open}]` opens a gated portal's Border Gate `at`
seconds into the chapter's shots (scene.ts `setBorderGateOpen`, and its veil
shown). Until then the cinema keeps it shut with no veil. The leaves do not
swing; they go, so the cue sits on a cut.

**The music through a build.** Building a zone holds the page for 0.5–4 s,
and the music engine only schedules 0.22 s ahead. Before each build, the cinema
hands the audio clock the next 6 s (`music.ts musicPrefill`), so the overture
plays through. At the end it fades out (`fadeOutSong`).

**Look at it.** `/?cutscene=intro` (a Play-with-sound button, `&nosound`,
`&chapter=N` to start at chapter N with the music there). `/?music` lists the
overture under Cutscenes; `node tools/music/render.mjs --scene intro` measures
it (2026-10-12): −15.9 LUFS, peak −1.6 dBFS, nothing clipped. Bar 8 is silence (−53.5
dBFS RMS, digital silence by its third beat), the music box sits near −25 and
the title's hit on bar 45 is the loudest bar.

## Philip's rulings (2026-10-11)

- **A cutscene plays for the current player.** If someone else in the party
  triggers it, the current player is still the subject. Every copy stars its
  own viewer. `"self"` in the data is always whoever is watching, and the
  server never sends who set a scene off.
- **Everyone else sees the watcher standing still**, with a film
  (clapperboard) icon over their head and beside their name on the party bar.
- **The first scene is the opening in each home city**: Caerdun, Heartwood,
  Moonmere.
- **Before it, an intro shared by every new character**: the world, the empire,
  majestic views and a fly-by of the Capital, with a new piece of music. The
  other scenes (the gates at dawn, the Morning, province fly-overs, dungeon
  reveals, the story beats, a second job, the first crystal) follow, each
  scored with its area's music.
- **No boss reveals; a dungeon reveal instead** (2026-10-12): the first time a
  character walks into a dungeon they see the place, not its boss. A dungeon's
  entry room holds no monsters (the audit checks it, with the landing out of
  attack range of every camp).

## Files

| File | What it holds |
| --- | --- |
| `shared/data/cutscenes/*.json` | the scenes, read by both halves |
| `client/src/cutscene_plan.ts` | Babylon-free: the data format (its header is the guide), the timeline, camera curves, fades, lines, cues, and `sceneProblems` |
| `client/src/cutscene-cinema.ts` | the intro: a scene told in chapters, one zone built behind each card, the crowd, the gates, the music prefill |
| `client/src/cutscene.ts` | `CutscenePlayer`: the warm-up, the scene's own camera, letterbox, subtitles, title card, score, skip, the actors, and the hand-back to play under black |
| `client/src/world.ts` ("cutscenes") | the queue, when a scene may start, the `CutsceneStage` over the live world, `/cutscene` |
| `client/src/cutscene-view.ts` | `/?cutscene=<id>`, the dev view |
| `server/lib/vanai/cutscenes.rb` | who is shown what, and when a scene may start |
| `server/lib/vanai/world.rb` ("cutscenes") | `cutscene_trigger`, `cutscene_begin`, `cutscene_end`, `cutscene_expire` |
| `tools/qa/cutscene_shots.mjs` | frames of every shot from the dev view, for a contact sheet |

## How it works

1. **Owed.** `Character.provision!` writes `scene_due_<opening>` for the new
   character's city. Quest triggers (`quest_accept`, `quest_complete`) write
   the same row for every member they reach.
2. **Sent.** `World.join` sends `{t: "cutscene", id}` for each owed scene
   filmed in the zone being joined. A trigger sends it at once.
3. **Started.** The client waits until the zone, your avatar and the scene's
   NPCs are drawn, you are alive, and nothing is fighting you. Then it sends
   `cutscene_begin`. The server checks `Cutscenes.refusal`: owed or seen, the
   right zone, alive, out of combat. If that passes it sets `ps.cutscene` and
   broadcasts `player_update` with `cs: true`, and the party payload gets
   `cutscene: true`. A refusal over a fight or a fall carries `retry`, and
   the client tries again after 5 s.
4. **Playing.** The world ignores the watcher's movement (`apply_move`), and
   monsters never pick them as an aggro target. It also refuses the watcher's
   attacks, casts, items and interactions (Philip, 2026-10-19). The client hides the HUD and
   every nameplate, takes the keyboard, and drives the avatar itself.
5. **Ended.** Watched or skipped, the client sends `cutscene_end`. The server
   swaps `scene_due_` for `scene_seen_`, clears the flag, and the icon goes.
   Only a first viewing leaves the watcher on the scene's `mark` (the server
   places them there, `place_on_mark`); a replay ends where it began (Philip,
   2026-10-19), and the server sends the position back. The client then
   sends one move from where it stands.
6. **Never stuck.** A client that never reports the end is let go after the
   scene's running time plus 60 s (`Cutscenes.hold_limit`). A refresh or zone
   change mid-scene leaves it owed, so it plays again on the next join.

**The warm-up.** A scene holds on black before its first frame. It looks once
from every shot's start, middle and end, so their shaders compile and their LOD
cells load unseen. It then waits until nothing new has arrived for 1 s (15 s at
most). Without it, an opening started while the city was still streaming in. In
Caerdun's first two seconds about 270 meshes, 140 textures and 140 shaders
arrived, and frames took 200–900 ms. With it, the worst frame in the first 12 s
is 83 ms (headless Chrome, which runs about 67 ms a frame here). A seek in the
dev view skips the warm-up.

**The score.** A scene plays a zone's field theme from its first bar (the new
score in `client/src/score/`). By default that is the scene's own zone, so each
city's opening plays the city's piece: Caerdun "The Sea Gate Muster", Heartwood
"Where the Old Trees Can Hear", Moonmere "Deciding When". The zone's music fades
out when the warm-up begins, and the piece starts as the picture fades in. It
then carries on into play: it is the same piece the zone plays. `"music": "<zone>"`
scores a scene with another zone's piece, which hands the zone's own back at
the end, and `"none"` leaves whatever is playing (`audio.ts scoreCutscene`,
`hushForCutscene`, `endCutsceneScore`).

A browser plays no sound before a click or keypress. The game takes that
gesture from the click on a character or on "Begin in …" (`main.ts`), and the
scene also takes one from any key or click while it plays. Sound unlocked
mid-scene joins the piece at the scene's own time. The dev view shows a "Play
with sound" button once the cast is dressed; `&nosound`, `&pause` and `&t` skip it.

The scene borrows the world rather than building one. It sets
`scene.activeCamera` to its own `TargetCamera`, and every LOD cell, shadow
cascade and light pool already follows the active camera. `daytime` pins the
sky (`scene.ts pinCutsceneDaytime`; an open-air dungeon's own pin still wins).
The end happens under black: the hour is released, the play camera comes back
looking from where the last shot stood, and the picture fades up into play.

**Replays.** `/cutscene` lists the scenes you have seen in this zone, and
`/cutscene <name>` (any part of the name) plays one again. The server only
allows a scene you are owed or have seen, in the zone it was filmed in, and a
replay hands you back where you stood when it began.

**Skipping.** Press Esc twice within 2.5 s, or click Skip in the corner.

## Triggers

A scene's `trigger` says what sets it off (`server/lib/vanai/cutscenes.rb`
`Cutscenes.triggered`, called from `world.rb` and `quests.rb`). Except for the
intro, a scene fires only in the zone it is filmed in, and only once for each
character: it is owed (`scene_due_`), then seen (`scene_seen_`).

| `type` | Fields | Fires |
| --- | --- | --- |
| `intro` | — | owed to every new character; plays before the world (see "The intro") |
| `opening` | `city` | owed to a new character of that city; plays on their first join |
| `zone_first_visit` | — | the first time a character enters the scene's zone (`World.record_zone_visit`): the province fly-overs and the dungeon reveals |
| `quest_accept` / `quest_complete` | `quest` | when that quest is taken or handed in. Film it where that happens: the giver's zone, or a single talk target's (the audit checks) |
| `interact` | `object` | when the interactable is used for an active quest (a founding writ, the wax-sealed cabinet) |
| `landmark` | `landmark` | when the landmark is first discovered (the Census Hall) |
| `job_change` | — | when a character takes up a job at the trainer in the scene's zone |
| `attune` | — | when a character attunes a crystal they had not attuned. The scene has `"zone": "*"`, so it plays in any zone and its shots may point only at the watcher and `{crystal: true}` |

`"party": true` sends the scene to everyone in the party in that zone, each as
its own subject (Philip's ruling). The gates at dawn and the writs are party
scenes.

**Music** (`music`): absent is the scene's own zone's field theme from its
first bar, which is "the music of the associated area". `"boss"` is the boss
theme (`score/` battle group `boss`). `"*"` (a scene
that plays anywhere) is the zone it plays in, `"none"` leaves what is playing,
and any zone key plays that zone's piece.

**Data:** `shared/data/cutscenes/*.json`, one file per group of scenes
(`openings.json`, `intro.json`, ...). Each maps scene ids to scenes, and an id
in two files is an error. The server (`Data.read_cutscenes`), the client
(`data.ts`, a Vite glob), the audit and the tests all merge them.

## Writing a scene

The header of `cutscene_plan.ts` is the reference. In short:

- A scene is `shots` played end to end. Each shot has a `dur`, a `cam`
  (`from`, optional `to` and `via`, `ease`), optional `fade`, `title`,
  `lines` and `cues`.
- Points are `[x, up, z]` (up = metres above the ground), `{self: [right, up,
  fwd]}` from the watcher, or `{npc: id, off: [right, up, fwd]}` from an NPC
  in their own facing. `{camp: monster, off}` is the middle of that monster's
  camp (a dungeon's next hall), and `{crystal: true, off}` the crystal nearest the
  watcher; both use the scene's frame. The "self" frame is fixed when the scene
  begins. A scene that plays anywhere turns the watcher to the crystal under
  the opening black, so its frame always runs from them to the crystal.
- The dev view draws one monster at the middle of each camp in a dungeon, so a
  look down its halls can be framed; in play they wander their camps.
- `mark: [x, z, h]` puts the watcher on a spot first. Absolute two-shots need
  it, so a replay from elsewhere still frames them. A new character is already
  standing on it.
- Lines: `who` is `npc:<id>`, `self`, or absent for narration. `{name}` is
  the watcher's name and `**bold**` is the ask. The tone law applies: humour
  in mouths, plain narration, the ask in the giver's voice.
- Cues: `walk` (watcher only; NPCs keep their marks), `face`, and `anim` with
  an optional `for`. The anims are the avatar's: `idle`, `walk`, `run`,
  `rest`, `emote:Cheer`, `emote:Wave`.

**Look at it.** `/?cutscene=<id>` plays a scene with a stand-in watcher
(`&race=nym&face=female&hair=bun&job=WHM&name=Wren`). Space pauses,
Left/Right steps a shot, R restarts, and `&t=21&pause` freezes 21 s in. For a
contact sheet of every shot:

```sh
VANAI_PLAYWRIGHT_PATH=... node tools/qa/cutscene_shots.mjs opening_caerdun \
  --base http://localhost:5173 --out tmp/cutscenes/caerdun --at 0.1,0.9
```

Measure a speaker's height before framing them. A Nym stands about a metre
tall, so a camera at 1.7 m with the usual 1.5 m look-at shows only the top of
Chanter Ives' head.

## Checks

- `client/test/cutscene_plan.test.mjs`: the timeline maths, and that every
  scene's insides resolve. Each line must be readable: at least 2 s, and at
  about 15 characters a second.
- `tools/data/audit.py`: zones, triggers, quests and every named NPC resolve;
  exactly one opening per home city.
- `server/test/vanai/cutscenes_test.rb` (party fan-out, refusals, begin, end,
  expiry, the party-bar flag) and `server/test/integration/cutscene_opening_test.rb`
  (the owed opening through the database). Both are in `bin/ci`.

## Open items

- A party or trade invite that arrives during a scene is hidden with the
  HUD, and an invite's 60 s timer (world.rb `PARTY_INVITE_TTL`) can run out
  before a long scene ends.
- Scene time advances by the frame's `dt`, capped at 0.1 s, as everything
  else is. Below 10 fps the scene slows down rather than skipping cues.
- Asked for by the scene authors (2026-10-12), unbuilt: a daytime ramp (the
  Morning is lit at dawn throughout), a gentle-wave NPC anim (`emote:Wave` is a
  two-arm cheer on Rasha and Valdren bodies, so the gate scouts don't wave), a
  speaker name for a voice with no NPC (the Regent's lines are quoted
  narration), deck-aware absolute points (`groundHeight` has no `prevY`; use
  `{npc, off}` in raised rooms), and `/?cutscene=&at=<portal>` to check a
  hand-back from each way in.
- Data, not scene matters: the First Minister, the Stone-Player and the Herald
  Sentinel have no `body` pin, so their body is picked by a hash of their id
  (`npc-appearance.ts`); Drillmaster Hal, Chantmaster
  Wynn and Proctor Elm face walls (their scenes turn them); the Border Wall's
  gold point reads as a pale sun.
- The scene groups were first written by one-off scripts, which are not kept;
  the review edited the JSON after them, so the JSON is the source.
