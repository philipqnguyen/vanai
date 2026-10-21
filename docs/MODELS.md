# Character models

[Playable appearance and runtime integration](CHARACTERS.md) owns creation,
persisted choices, loading and motion behavior for Aedri, Nym, Rasha, Valdren
and Karrog. `/?character-preview` uses the gameplay avatar factory.

[ASSETS.md](ASSETS.md) documents how the maker's files reach this game. The
maker's `CHARACTERS.md` owns production identity, source provenance, fitting and
rebuild records; its `MODELS.md` indexes authoring tools. The character runtime
manifest is `models/characters/manifest.json` in the asset index.
Equipment is fitted and approved in the maker too; ASSETS.md "New or revised
assets" has the steps.

Every character body in the game is a production body: the five playable
races load from the maker's runtime folder through the asset index
(`models.ts` resolves `characters/…` with `runtimePath`) by their own loaders
(`aedri.ts`, `valdren.ts`, `karrog.ts`, `nym.ts`, `rasha.ts`), and every NPC is
assigned one of those bodies by `npc-appearance.ts`. The KayKit adventurer
avatar, with its per-race recipe over one shared rig (bone scales, stretched
ears, horns and tails bolted to joints, atlas skin recolours), is gone from
the code; an unknown race now throws instead of falling back to it. No KayKit
character glb is used by the game any more: every monster is a generated
creature of the bestiary ([BESTIARY.md](BESTIARY.md), 2026-10-13), which
deleted the KayKit Skeletons, Rogues and Barbarian and the Quaternius animals
and Ultimate Monsters they wore, and the KayKit donor props that stood in for
a weapon key the weapon manifest did not know went with them (every weapon in
`items.json` is approved; a stale key draws bare hands, except a cudgel, which
gets the procedural `buildMace`, and hand wraps, which are always fitted bands).

`RACE_LOOK` in `entities.ts` now only shapes the procedural placeholder. It is
never drawn while a body loads (`actor-reveal.ts` keeps the actor hidden until
it is dressed and posed); a player whose body fails to load is shown it
instead. Its `h` is each production body's height, so the nameplate and the
lineup label are right from the first frame.

## Seeing them

### The race lineup — `/?lineup`

A dev-only view that stands every race side by side on flat ground under even
light. It needs no account, no Rails server and no world: only the Vite dev
server, the client's own model code and the maker's runtime folder the bodies
come from (`VANAI_RUNTIME`, ASSETS.md). A production build runs it only when
built with `VITE_DEV_VIEWS=1` (`main.ts`).

```sh
cd client && npx vite        # then open the URLs below
```

| URL | What you get |
| --- | --- |
| `/?lineup` | all five races, PLD in its level-50 guild set, idling, front-on, weapons sheathed |
| `/?lineup&job=BLM` | another job — any of PLD SAM DRK BLM WHM MNK |
| `/?lineup&gear=20` | the job's guild set at another level; `gear=none` undresses |
| `/?lineup&look=b:<item>,l:<item>,f:<item>` | everyone in the named items instead of a guild set |
| `/?lineup&anim=walk` | idle / walk / run / rest / dead |
| `/?lineup&view=three` | front / three / side / back |
| `/?lineup&race=nym` | one race alone, filling the frame |
| `/?lineup&drawn=1` | weapons in hand, as in combat |

The on-screen bar switches job, gear, motion, view and race without editing the
URL, and the name plates
are drawn into the scene rather than the DOM, so a screenshot of the canvas
alone is self-describing.

**This view exists because character work fails in a particular way.** Someone
describes a silhouette in words, someone else writes numbers for it, and nobody
looks at the result until it is in the game behind fog, buildings and night
lighting. The lineup is the short path from a change to a production body (its
loader, fit or equipment) to a picture of what that change did. Change it,
reload, look. Production appearance, fitting and motion are documented in
[CHARACTERS.md](CHARACTERS.md); `/?npc-preview` shows the NPC bodies the same
way, and `/?npc-preview&npc-zone=<key>` stands a zone's NPCs where gameplay
places them.

## Seeing them in the actual game

The lineup uses the same `buildAvatar` path the world does, so what it shows is
what the game shows. To check in-world anyway: start Rails and Vite (see the
[README](../README.md)), register, create a character, and walk around.

In a cloud session WebGL runs on SwiftShader, which is slow and can fail to
compile the character shaders under heavy lighting; [CLOUD.md](CLOUD.md) has
the caveat and the workaround. Judge colour and fine detail locally, on a real
GPU. `?daytime=0.25` pins the hour to noon (0 is sunrise, 0.5 sunset) instead of
the real-hour day.
