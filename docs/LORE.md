# The Lore of Vanai — Ardenfell and the Empty Throne

*The canonical lore reference. Quest text, NPC dialog, and zone design draw from this
document; anything shipped in `shared/data/` is the playable expression of what is
written here. The full design pitch (with the world map, zone maps, and the complete
main-story scripts) lives in `design/the-empty-throne.html` — this file is the
condensed canon.*

---

## The Premise: the night everyone left

The **Empire of Vanai** ruled the whole continent of **Ardenfell** for a thousand
years, and then one night it didn't. No war, no plague, no bodies. Every citizen of
the imperial heartland — gone between dusk and dawn, dinner still on the tables,
gates barred from the inside. Around the emptied interior stood a border no one
could cross: the mountain crescent, and walls closing the gaps the mountains left.

The people left outside — frontier garrisons, unconquered folk, an academy saved by
a hundred yards of water — grew into three free cities over three centuries. A
treaty older than anyone alive said nobody goes in.

**Now the border is failing.** On one morning, the three gates open — one at each
city's doorstep, as if on schedule. Behind them: provinces preserved like a held
breath, vaults still locked, and everything inside worth a fortune to somebody. The
treaty dies the moment the first door opens. What replaces it is a race.

## The Truth (spoilers — the shape of the whole story)

- **They left on purpose.** The empire's last order, written in a calm hand the
  night before: *"Seal it behind us."* Nobody outside was told.
- **They fled forward through time.** The whole population jumped in a single
  night; for them it has been one evening. The border was the mechanism holding
  their place; the fire ring around the capital (the **Burned Land**) is the
  departure's outward-facing scar.
- **They scheduled the return.** The palace calendar names a **landing date**. The
  gates were *timed* to open ahead of it — you air a house out before the family
  comes home. The sentinels have spent three centuries keeping, and lately,
  *readying*: gardens as nursery stock, glass panes crated for the capital,
  granaries provisioning a homecoming.
- **Everyone outside is on the household rolls.** The capital's census has tracked
  the free cities' births and deaths all along. The outside was never abandoned;
  it was *kept* — which is either a comfort or an outrage, and the story refuses
  to pick for the player.
- **Why they fled is the guarded secret.** It is never explained in this game.
  The returned defer it ("Not yet. Let us have this morning first"), with one
  glance at the empty point of sky every telescope in Moonmere still watches.
  That glance is the next expansion. **Never write content that answers the
  why.**

## A Style Law: plain words only

The old canon drowned in invented vocabulary. This world bans it. Every system
concept is named with ordinary English a new player already knows:

| Word | Means |
| --- | --- |
| the Empire | the vanished civilization; its name was Vanai — the game's title is the mystery |
| the border | the seal around the heartland, now failing gate by gate |
| a province | one region of the interior, each a former imperial industry or estate |
| a charter | a license from a court to explore, dig, and fight in its name |
| an explorer | the holder of a charter: the players, never called charters, lamps or lamplighters |
| a claim | a court's stake in a province, earned by its explorers' work |
| a relic | anything recovered from the interior — sell it, or register it with a court |
| a sentinel | the empire's left-behind caretakers, still enforcing the law of a country that isn't here |
| the Regent | the caretaker on the borrowed throne, issuing the sentinels' orders |
| the Restoration | the sentinels' word for the return; outsiders say "the landing date" |

Place names stay proper nouns. Provinces are named for what they *were*: the
King's Gardens, the Glassworks, the Granary Plains. If a new concept can't be
named with a common word, redesign the concept.

## The People

Character creation offers five peoples. **Aedri** are humankind, descendants of whoever stood outside the border on the night, three centuries of frontier stock mixed into one people. **Valdren** are the tall folk of Heartwood: silver-eyed, long-lived, keen of mind. **Karrog** are the stone-patient: they outwaited the border, and they will outwait the Return. **Nym** are small deerfolk: oversized heads, rounded blunt lower ears, delicate antlers and short brown-and-white deer tails. **Rasha** are the foxfolk exiles, sharp-sensed hunters who heard the gates before anyone saw them. Every people can begin in any of the three cities and learn every job. Civic identity—city, court and guild—still shapes their place in the world.

Each people's stat modifiers are in `shared/data/jobs.json` (`races`); gender and hair do not affect stats. Every player character has hair (Philip, 2026-10-15). The bodies, faces and hair each people offers are in [CHARACTERS.md](CHARACTERS.md).

## The Three Cities

Each city has a claim on the interior, a temperament its AI patron speaks in, and
two job guilds (a stat boost for a job that matches its city's guilds, city
alignment, is planned and unbuilt).

| City | Claim | Temperament | Guilds (job heritage) |
| --- | --- | --- | --- |
| **Caerdun** (NW, on the fjord) | **Service** — built by the border garrison locked outside on the night; three centuries of unpaid wages, and the ledgers to prove it | Contracts and precedent; honors terms to the letter | **Paladin** (the shield line) · **Samurai** (the dueling code) |
| **Heartwood** (E, on the bay) | **Grievance** — the never-conquered, and the displaced whose groves the empire took; holds a writ reading *"Restitution upon Return"* | Grievance with receipts; pays best for what the empire took | **Monk** (the battle-chanters; the banned songs) · **Dark Knight** (the grudge-keepers) |
| **Moonmere** (S, an island in the sea, on its causeway) | **Inheritance** — the imperial academy in exile; the only people who can read the interior's records, and the ones who hid the date | Precise, evasive, footnoted; the court with a secret | **White Mage** (the mending college) · **Black Mage** (the burned shelf) |

There is no neutral fourth town. The auction house lives in all three cities,
which is what keeps the courts' tax race honest; the living Capital's Exchange
reopens only after the Return, and charges the rate of the court that holds the
most ground.

## Geography

Continent: **Ardenfell** (map: the World Map tab of the pitch; generators in
`tools/design/`). The interior sits inside a mountain crescent; the wall closes
only the gaps. Level equals depth: danger grows inward from your gate.

**The free lands** (outside the border):
- Each city opens onto its own fields zone (levels 1–10): **the Caerdun Fields**
  (watch farms, milestone zero, the fjord), **the Heartwood Fields** (wild
  orchards, charcoal camps, between city and gate), **the Moonmere Shores** (the
  shore of Moonmere Bay, ferry piers, the head of the causeway out to the
  island city). Each fields zone holds its city's border gate — shut until the
  main quest grants your charter.
- Two road zones (10–17) connect the fields: **the North Road**
  (Caerdun↔Heartwood — a snowbound winterland, beautiful not bleak, with **the
  halfway inn**, the one lit window in a hundred white miles) and **the Shore
  Road** (Heartwood↔Moonmere — palms, a wrecked grain ship, the warm sea;
  Moonmere's only land road).
- The Western Gulf blocks any Caerdun–Moonmere land route. **The gulf ferry**
  crosses it, pier to pier, on a fixed timetable for a small fare
  ([FERRY.md](FERRY.md)).

**The interior** (story-gated; opens with the main quest):
- Doorsteps (16–22; each city's border gate opens for a character with the
  letters of passage, `inn2`): **the Hunting
  Wood** (Caerdun's — the king's rides, the Mausoleum), **the Timber Estates** (Heartwood's — plantation ranks,
  ruler-straight surveyed borders), **the Summer Lakes** (Moonmere's — the
  beautiful one: villa lakes, the promenade, the sunken ballroom).
- Middle provinces (20–34): **the Reservoir** (20–26; drowned valley, the great
  dam, the Bell Tower — the first shared dungeon, and the only interior zone
  within two hops of every doorstep), **the King's Gardens** (21–28; still
  pruned, and you are trespassing), **the Glassworks** (20–30; rain-shadow glass
  desert, furnaces still burning), **the Canal Works** (20–32; the fen — the
  gloomy one, elective, never a doorstep), **the Granary Plains** (22–34;
  harvester sentinels still reaping), **the Border Wall** (25–36; a rampart-road
  zone along the crescent's spine).
- **The Burned Land** (32–45): the fire line, exactly as ragged as the night left
  it, ringing the capital whose walls did not burn. Emmer's farmhouse and grave
  stand at the last camp.
- **The Capital of Vanai** (44+): the whole city is the final dungeon; the Regent
  holds the palace. Warden Morrow, at the gate in the Burned Land, takes a party
  into the empty city of the main quest whenever its leader asks and every
  member agrees; for a character who has witnessed the Return, the gate itself
  opens onto the living capital.

Real-border rules govern every zone edge: rivers, ridgelines, coasts, and the
empire's ruled survey lines with chain-ticks; the fire line is the one border no
surveyor drew. Portals sit on the compass side their neighbor occupies on the
continent.

## The Sentinels and the Regent

Sentinels are the empire's caretakers: polite, implacable, enforcing dead law.
("You are trespassing. This notice is the four hundred and eleventh I have
issued… *please*.") They never stopped working; lately they prepare — the
Restoration has phases, work orders, a signature: **the Regent**, the last
servant, given the keys and one command: *deliver the city whole.* The Regent is
the final boss and not a villain: beaten, it yields the keeping and asks the
first question it has ever asked for itself — *"Was it long, for you?"*

Enemies elsewhere are beasts (the empire's stock gone feral, and the looters
among them: jackdaws, diggers, rummagers, vultures, whatever carries things
off), sentinels pushed past politeness, and the hollowed (husks and shades of
the household that did not leave). Freebooters, the unchartered, are people:
they trade at the camps and argue with the courts, and are never fought.

## A Short History

- **The imperial millennium** — Vanai rules all Ardenfell. Frontier garrisons,
  timber plantations, the academy founded on its island in the Southern Sea.
- **The Night** (300 years ago) — every window lit, families dressed as if for an
  unannounced festival; lamplight leaned all one way, "a way that was not north
  or south or up"; then empty streets and the fire running outward. The border
  sealed. One man, Emmer, missed it, and spent a long life knocking.
- **The three centuries** — Caerdun keeps the wage book; Heartwood scatters a
  counting-song, one verse a family, and bans its ending; Moonmere seals the
  telescope room and calls concealment mercy. The bell in the drowned valley
  strikes a changed peal every year, intervals shortening.
- **The openings** (now) — the mourning trees bud all at once; the wage schedule
  ends in a dated settlement-in-full; the Provost rescinds the mercy. Three
  envoys meet at the halfway inn, and the three gates open on one morning.

## The Main Story — "The Settlement of All Debts" (levels 1–50)

Full scripts in the pitch's Main Story tab. The spine:

1. **Three city stories** (1–15, parallel; genuinely different per city — the
   replay value three doors buy): Caerdun's audit-turned-prophecy, Heartwood's
   song with no ending, Moonmere's room that isn't.
2. **The merge** (~16, at the halfway inn): three testimonies become one truth;
   the courts countersign **letters of passage**; the gates open; you witness
   yours at dawn.
3. **Secure your doorstep** (15–22): one chapter, three targets — recover your
   province's founding writ from its trial (the Mausoleum / the overseer's lodge
   / the sunken ballroom). Every writ says the same thing: *"The household
   departs this night and will return. Keep out. Keep well."*
4. **The Drowned Valley** (20–26): convergence at the Reservoir; the Bell Tower
   is the first dungeon everyone runs together; *"Seal it behind us"*; the bell
   is counting.
5. **The Race** (26–34): the courts bid for provinces and players; every province
   shows the house being readied; the Embassy on the Border Wall is answered —
   "the caretaker governments… prepare to yield custody upon the Restoration."
6. **The Burned Land** (34–45): the fire that faced outward; Emmer's letters
   (*"It wasn't your fault either"*); the Regent speaks from the walls.
7. **The Capital** (45–50): the empty city and the census reveal; the Regent's
   audience and verification; the last door; **the Morning** — the Return,
   witnessed per player at the end of their own story. Afterward the capital is
   alive for that character. The why is deferred. Epilogue at the halfway inn;
   the charter comes back stamped *Fulfilled*.

The MSQ deliberately does not visit the two foreign doorsteps — the Race,
letters of passage, and alts own those.

**Recurring field cast:** Duelist-Master Sabel (Caerdun), Grudge-Keeper Morrow
(Heartwood), Archivist Junn (Moonmere), and Auntie Wren of the halfway inn. City
casts: Ottey, Vail, Grett, the Lord Marshal (Caerdun); Ives, Petta, the Speaker,
Mother Alder (Heartwood); Liss, Corvo, Provost Selk (Moonmere).

## The Courts (the AI component)

The three courts are model-driven patrons ([COURTS.md](COURTS.md) has how they
work). Treasuries fed by each city's market tax (3% is only the starting
rate); a clamped verb surface (taxes, bounties, awards, defection
offers, province war-chests, proclamations); a roster of real players with
ledgered histories; **simultaneous blind council turns** informed only by the
world ledger. They compete over *claims* on the wild zones, the home fields
included — reclamation scoring, not PvP — and every relic a player recovers is
a choice: sell at auction, or register with a court for its gold and its claim,
and, for a named relic, the finder's name in the hall's book.

## Random Events

Server-dropped, unscheduled, anywhere — happenings, not places, so firsts never
run out. Two flavors: **the interior misbehaving** (a clock-vault opens for one
day, a sentinel patrol marches off-script, a furnace run, a collapse into an
uncharted cellar) and **the jump fraying** (things the empire sent forward
falling out early: a mail cart three centuries late with the horses still warm, a
confused imperial patrol — frequency rising as the landing date nears). Whoever
answers first or completes the event is written into the permanent record, and
events that mark the world put the name on the map. The courts react with
bounties but don't run them.

## Style Notes (for all future content)

**Tone: sunlit, greedy, wondrous — in that order, with the haunting underneath.**
The tone in one image: a party eating lunch on the steps of an abandoned palace,
arguing about which court pays better this week, while a three-hundred-year-old
groundskeeper trims the hedge and politely asks if they have an appointment.

- Gloom is elective and mid-ring (the fen); it never greets a new player. Every
  doorstep is the most beautiful thing they've seen yet.
- The haunting is homesickness, not horror: beds made, table set. Never leaned
  on; just there when a player stops running.
- The threat is the unknown itself — whatever the empire fled is never shown and
  never named. Dread lives at the story's edge; the game never cashes it in for
  a monster.
- Humor lives in mouths, never in narration. The dark is always polite.
- **Quest dialogue law:** every task is motivated in dialogue (what's needed, why
  now, why you); depth is welcome — multiple windows per quest; and **the ask is
  always in bold** — a plain instruction in the giver's voice, naming where to
  go and what to do, as the last thing said before the task line.
