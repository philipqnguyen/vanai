# The Courts

> **Status: built, reviewed and merged** (2026-10-12). The 12 migrations
> `20261012100001`..`100051` add the court tables and swear every existing
> character to a court. All
> six build phases below are in: allegiance, treasuries and the ledger, the
> council loop and dormant mode, the halls and the court window, bounties,
> claims and member benefits, relics and the book, letters and war chests, the
> full ledger read. Two departures wait on Philip:
> the dock folds below 1460px, not 1400px (nine keys meet the hotbar below
> ~1453px), and bounties keep their own counter rather than the quest
> objective machinery.
> **The auction is wired** (2026-10-12, after the auction rework merged into
> empty-throne-lore first): the old 3% `CUT` is gone; the buyer pays the price
> plus the house's tax (`Courts.quote`), sends back the total they were shown,
> and the tax goes to the house's court (`Courts.record_tax!`) in the same
> transaction; every broker shows its rate and the other houses'. Phase 7
> (tuning from the ledger and the gold log) needs play to tune from.

The AI in Vanai is the three city courts and nothing else (LORE.md "The
Courts", `design/the-empty-throne.html` "Three patrons, one race"). Caerdun's
court wants the interior administered, Heartwood's wants things returned,
Moonmere's wants everything read before it is sold. Each court is a
model-driven patron with a treasury, a clamped set of verbs and a ledger, and
the three compete over claims on the wild zones.

**The courts are never seen.** No ruler model, no throne-room boss. A court is
heard through its proclamations, letters and offers, delivered in its city's
audience hall by a herald and in the court window.

## Global state, on purpose

Quest and world-object state is per character (Discovery rows). The courts are
the exception, deliberately: treasuries, tax rates, claims, bounties and named
relics are one shared world state. Do not "fix" them into per-character rows.

## Out of scope

- **Companies.** A company's members may be sworn to different courts. The
  courts do not see, court or credit companies; companies get their own work
  later.
- **Alts.** Allegiance and caps are per character. One account feeding several
  courts is left alone until it becomes a problem.
- **City alignment** (LORE.md: each city's two guild jobs get a stat boost) is
  about a character's starting job matching a city that has its guild. It is
  unrelated to court allegiance; defecting never changes stats. Unbuilt.
- **Standing.** There is none. The ledger and each player's loyalty record are
  what the courts read.

## Allegiance

- Every character is sworn to exactly one court, always. New characters are
  sworn to their starting city's court; a migration swears existing ones from
  `home_zone`.
- A character may switch at any time at another court's audience hall (the
  swearing desk), **at most once per council cycle**. Accepting a defection
  letter switches on the spot, anywhere, and uses that cycle's switch; the
  accept button is disabled once the switch is spent.
- No home-turf advantage anywhere.
- Claim a character earned stays with the court it was earned for.

### The loyalty record

Built from the ledger and shown to the councils for every named player, and to
the player in the court window: the courts sworn to and cycles spent in each,
every defection offer taken, declined or left to lapse, and how soon a paid
switch was followed by another. A court also sees how its own past offers paid
off ("paid Aldo 300, he left two cycles later"). There is no mechanical lock on
paid switches: judging who is likely to be disloyal is the court's job.

**Bounded** (Philip, 2026-10-12): its totals (sittings with each court,
changes of court, offers by outcome, purses and their gold) count the whole
history; its lists hold only the newest entries, 10 in a council's roster
(`record_recent`) and 20 a page in the window, which pages back with Older.

## Council cycle

- One cycle a day by default, set by `VANAI_COUNCIL_INTERVAL` (e.g. `24h`).
- **Everything counted per cycle is per cycle, not per day**: claim decay,
  contribution caps, named relic slots, relic budgets, the switch. Only the
  named relic's 24-hour crumble is real clock time. A short dev interval stays
  consistent.
- Model: `claude-sonnet-5-5` (courts.json `council.model`; `VANAI_COURT_MODEL`
  overrides it). The three courts' turns run **simultaneously and
  blind**, in parallel, off the world thread. Each reads only the world ledger:
  last cycle's moves and consequences, prices, treasuries, claims and a
  summarised roster of named players with their loyalty records.
- **The prompt does not grow with the player count** (Philip, 2026-10-12).
  Everything but the roster is per court or per zone. The roster is the 20
  most active players sworn to each court (`roster_per_court`; claim points
  last sitting, then anyone the ledger named, then the highest levels), so
  each court reads 60 players, its own and its rivals', each with a bounded
  record. The rules and tools are the cached system prompt; they tell each
  court the players are explorers, and it addresses them so, never as
  charters, lamps or lamplighters (Philip, 2026-10-18).
- A turn returns verbs as structured tool calls. The server validates and
  clamps them, checks the treasury, and applies the result through
  `World.enqueue`. Every turn is logged.
- **Where it runs.** The world tick checks the cycle's due time in the
  database and queues a Sidekiq job (Sidekiq is deployed and never boots the
  world). The job makes the three model calls and stores the turns; the world
  thread applies them. A restart mid-turn re-runs that cycle rather than
  skipping or repeating it. The schedule, the named relic slots and the
  switch-once rule live in the database for the same reason. The model is
  called through the official `anthropic` gem.
- Dev gets a manual "run the council now" trigger (`bin/rails
  courts:council_now`), and `VANAI_COURTS_STUB=1` wakes the courts with a
  stand-in that makes random but valid moves (`courts/stub_client.rb`; never
  in production). Tests use a stub, never the API.
- Player names and chat are a prompt-injection surface. The verb clamp limits
  the damage; proclamation and letter text is length-clamped and every player
  name in it is checked against the real roster before it is shown.

### Dormant courts

- **No `ANTHROPIC_API_KEY`: the courts are dormant.** No council runs, every
  court's tax reverts to 3%, and no new bounties, proclamations or letters
  appear. Open bounties run to their expiry. When the key returns the courts
  resume from 3%.
- Everything mechanical keeps working while dormant: allegiance and switching,
  claims, control and member benefits, relics and the registry desk, the book,
  treasury income and the stipend, and the scripted news (below).
- Going dormant and waking each post one notice: *"The courts have adjourned.
  Market rates return to the standing three parts in a hundred."*
- **An API failure, or a turn that does not validate:** that court skips the
  cycle and stays silent. There is no scripted stand-in turn.

## Verbs

| Verb | What it does | Clamp |
| --- | --- | --- |
| `set_tax` | the court's auction rate in its city | 1–15%, at most ±2 points per cycle; starts at 3% |
| `proclaim` | the court's voice: credit, doubt on a rival's claim, a find, a tax change | length cap; names validated |
| `offer_bounty` | a paid task from the treasury | see Bounties |
| `award_purse` | a personal gold reward to a named player, delivered as a letter, reason proclaimed | treasury |
| `offer_defection` | gold to a named player of a rival court to switch, delivered as a letter | treasury; the switch counts as that cycle's one switch |
| `fund_push` | a war chest doubling the court's claim gains in one zone for a few cycles | treasury |
| `set_relic_prices` | registration price per relic kind, and the cycle's relic budget | clamped range |
| `hold` | nothing this sitting, with a private note never shown to players | length cap |

("Charter" is the court's licence, never a reward and never the player who
holds it, who is an "explorer" (Philip, 2026-10-18); hence `award_purse`.)

## Taxes and the auction house

- **One listing pool shared by every city's house.**
- **The buyer pays the listed price plus the tax of the house where they
  buy**, at that city's court's rate, and the tax goes into that court's
  treasury. The seller receives the full listed price. Buyers therefore prefer
  the cheapest house; teleport fares keep it from being a straight race to the
  floor.
- The buy request carries the total the buyer was shown; if the rate has
  changed since, the server refuses rather than charging a different amount.
- **The returned Capital's house** charges the rate of the court that
  **controls the most wild zones**, which is that court's home-city rate, not a
  separate rate, and its tax income goes to that court's treasury. **On a tie**
  (or with no zone held) it charges the standing 3% and that tax goes to no
  court: a plain gold sink (Philip, 2026-10-12).
- **Where it lives:** `Api::AuctionController#buy` takes `expected_total`,
  charges `Courts.quote(zone, price)` and calls `Courts.record_tax!` inside the
  sale's transaction; `index` returns `tax` (this house's rate and payee, and
  every house's rate); `list_item` refuses a named relic. The broker screen
  (auction-hud.ts `renderAuctionHouse`, court-hud.ts `courtAuctionTaxHtml`)
  shows them.
- The auction is mostly no longer a gold sink: the old 3% cut was destroyed,
  while the courts' tax goes to treasuries and comes back out as payouts (only
  a leaderless Capital's tax still burns). The gold log watches for the
  inflation this causes.

## Treasuries and solvency

Income: auction tax (own city, plus the Capital's when leading), and a daily
stipend per court, `VANAI_COURT_STIPEND` (gold per cycle, created from
nothing, so a court can act at low population).

Spending: bounties, relic registrations, `award_purse`, `offer_defection`,
`fund_push`.

- A treasury is a database row changed only by atomic increments, each with
  its ledger entry in the same transaction. Auction purchases (request
  handlers) and payouts (the world thread) both write it, so it is never an
  in-memory number.
- Every movement is a ledger entry; the ledger is also what the councils read.
- A council may not commit more than ~70% of its treasury in one cycle.
- Each court sets its own relic prices and a relic budget per cycle. When the
  budget is spent the desk keeps registering at a reduced rate until the next
  cycle; claim credit and the name in the book still count. A treasury never
  goes below zero and registration never closes.
- A per-character cap on common relic registrations per cycle.
- A daily log of gold in circulation: the 50% discounts remove sinks while the
  stipend and payouts add gold, so the economy is tuned from data.
- Dropped: a share of vendor purchases and teleport fares in controlled zones.

## Bounties

- Launch with two kinds: **kill N of a monster in a zone** (its dungeons count
  too) and **collect N of an item** (delivered to the hall). Both keep their
  own counter (`bounty_progresses`), not the quest objective machinery.
  Reach and relic bounties come later.
- Only a court's sworn members may take its bounties: the finisher's claim
  credit goes to their own court, so an open bounty would pay a rival.
- A bounty has paid places (e.g. 5 × 100 gold). The full amount is held from
  the treasury when posted; the first players to finish are paid; an
  unclaimed remainder returns to the treasury on expiry.
- The server checks the target exists and the reward fits the treasury.
- Shown on the hall's board, as map pins, and in the quest log once accepted.

## Claims

- **Contested: all 15 wild zones**, the starting fields included. The empty
  Capital (`capital`) is the Regent's ground and is out of the race.
- Work in a dungeon credits its parent wild zone, the one zone its portals
  lead to (`Courts.claim_zone`). **The Keep earns nothing**: its parent is
  the Capital.
- A court's claim in a zone grows from its sworn members' work there:
  level-weighted kills, gathering, quests, bounties, relics registered from
  there. **Discoveries do not count** (for now). Points are capped per character
  per cycle (500) and decay each cycle (10%); both are in courts.json
  `tuning.claims`.
- In a party, each member's share credits that member's own court.
- Control goes to the highest claim in a zone, recalculated at the cycle
  boundary.
- **Runaway control is left to the courts** (ruling A): the losing courts
  answer with bounties, war chests and defection offers. No mechanical brake;
  watch the standings and revisit only if one court runs away with the map.

### Benefits for the controlling court's members, in that zone

| Benefit | Value |
| --- | --- |
| Teleport fare to the zone's crystal | 50% off |
| The zone's vendor | 50% off |
| Monster drop chance | +50% (capped at certain; never applies to named relic rolls) |
| Gathering nodes | +1 item on a 25% roll |
| Banner | the court's banner on the zone map, minimap and world map |

Every wild zone has exactly one crystal and one vendor, so each benefit
applies cleanly.

**The drop bonus in shared loot.** Loot keeps one roll per drop
(`combat.rb` `award_loot`), widened into two bands. Under the drop chance, the
item drops as it does now and the usual recipient rule picks who gets it.
Between the chance and 1.5× the chance (capped at certain), it drops only if a
member's court controls the zone, and only a qualifying member can receive it.
Non-members get exactly what they would without the bonus, and the bonus does
not stack: one qualifying member or six is still 1.5×.

## Relics

Three kinds, each wanted by one court:

| Kind | Wanted by |
| --- | --- |
| documents | Moonmere |
| goods the empire took | Heartwood |
| surveys and maps | Caerdun |

A relic is registered **only at the registering character's own court's hall**.

### Common relics

Stackable, tradeable drops from the wild zones and their dungeons, tagged with
a zone and a kind, with a small vendor price as a floor. Registering pays the
registrant (not the finder) gold from the court's treasury, plus claim for the
relic's zone. Their real value is the market: a player who doesn't care about
the race sells at auction to one sworn to the court that wants that kind.

### Named relics

- **1 per wild zone per council cycle**, a setting
  (`VANAI_NAMED_RELICS_PER_ZONE`, default 1). Once a zone's slots are found, no
  more turn up there until the next cycle. Raise it only when the population
  grows enough that players never find one: at 50 active players, 1 per zone is
  a find about every 3 days each; 3 per zone would make them routine.
- Names are generated from parts by zone and kind (e.g. *Steward Aldo's Tally of
  the East Furnaces*, a Glassworks document): no AI call, no catalogue to
  repeat.
- Found by a roll on kills and gathering nodes in the zone while slots remain,
  tuned to about the slot count per zone per cycle at normal population. The
  +50% drop benefit does not apply. In a party the finder is a random member.
- A world-unique row with a status (held, registered, crumbled), locked on the
  world thread so two players cannot both get the same slot.
- It sits in the finder's inventory as a row linked to that world row (not a
  plain `item_key` stack), bound to the finder: blocked from trade, auction,
  vendors and discarding.
- Crumbles 24 hours after it is found if not registered, worked out from
  `found_at` so it crumbles while the finder is offline too (not at the cycle
  boundary, so a late find is still worth carrying home).
- The finder registers it at their **current** court's hall. Switching court
  before registering is allowed (defection bait).
- Registering pays the treasury reward, gives that court claim credit in the
  relic's zone, and writes the finder's name in the book. The book stores the
  name as text, so it survives a deleted character.

## The court window and its news

Nothing from the courts goes in chat.

- **The court button**: the dock's Court key (shortcut **L**, seventh of its
  nine), with an unread badge like the chat's tell count. Below 1460px wide
  the dock folds to 5×2 (238px; one row of nine keys would reach the hotbar
  below ~1453px); the gold readout and right column move to suit, measured
  at 1280×720 (style.css).
- **The court window**, three tabs:
  - **Allegiance**: the character's court, whether this cycle's switch is used,
    and their loyalty record.
  - **News**: the digests and announcements, newest first.
  - **Letters**: defection offers (accept, decline, expiry) and purses.
  - All three page: News and Letters 20 at a time, the Allegiance record as
    its totals and newest entries; Older loads the next page back.
- **The notice card** uses the existing prompt card (the Capital's gate, party
  invite and raise offer). **A sitting pops it only when a court wrote the
  player a letter** (Philip, 2026-10-12); the digest itself goes to News and
  the dock badge, never to a card. It is held during combat and while a
  cutscene plays or waits to (it hides the HUD), and shown when it ends.
  - **One card, however many letters.** One letter reads as itself ("A purse
    from Caerdun"); more read "You have N court letters." A letter that
    arrives while it is up joins it. Open opens Letters, or close. Closing
    loses nothing.
- A player who was offline gets the card at login for letters still unread;
  digests wait in News.
- The character panel also shows the character's court.

### The scripted news

Templated, not AI, so it keeps running while the courts are dormant. Each
event has a few templates per court in that court's voice, held in
`shared/data`, with names filled in. A herald speaks them.

| Event | Goes to |
| --- | --- |
| **The daily digest**: control changes at the cycle boundary, and every named relic registered that cycle with its finder | everyone |
| A bounty filled, with the paid names | the posting court's members, and its board |
| A zone's named relic found for the cycle | players in that zone |
| A court's relic budget spent (reduced rate until the next sitting) | the hall board |
| A paid defection ("Tamsin has gone over to Heartwood") | the old court's members |
| The courts adjourning or resuming | everyone |

Example voices, a named relic registered: Caerdun *"Entered into the record:
Steward Aldo's Tally of the East Furnaces, surveyed from the Glassworks,
delivered by Tamsin. The terms are met."*; Heartwood *"Returned: the
Orchard-Wife's Pruning Knife, taken from the King's Gardens. One more thing
they took, back where it belongs."*; Moonmere *"Received for reading: a ledger
fragment from the Glassworks, by Tamsin's hand. Its contents will be noted in
due course."*

### Letters

- `offer_defection` and `award_purse` write a letter row (court, character,
  amount, expiry), so an offline player gets it at their next login.
- The model writes the text in the court's voice, length-clamped with names
  validated. The amount and terms are shown on their own line from the verb,
  never from the prose, so a letter cannot misstate its offer.
- A defection offer is accepted on the spot from the letter, or lapses at the
  end of the cycle; declining and lapsing both go into the loyalty record.
- Offers are private. A rival court learns of one only when it is accepted,
  from the switch in the next cycle's ledger.

## The audience hall

One per city, injected from courts.json `halls` into the city zones at load
(`court-data.ts` `injectCourtHalls`), not written into zones.json: Caerdun's
Court Hall (the council floor), Heartwood's Woodwrights' Guild hall, and
Moonmere's Bursar's lodge (the upper room). None is an auction house. A herald speaks for the unseen court and, like a sanctuary NPC, never
offers quests. The hall holds:

- **the board**: proclamations and open bounties, paginated on the server (~20 a
  page, indexed by court and time)
- **the registry desk**: relic registration
- **the swearing desk**: switching allegiance
- **a plaque with the book of names**: every player who has delivered a named
  relic, with the relic and the date; paginated, filterable by zone. Named
  relics only, no common relic totals. No physical relics are displayed.

## UI

- the court button, window and notice cards (above)
- the hall panels: board, bounties, registry, swearing, the book
- the tax rate at every broker, compared with the other houses
- the controlling court's banner on the zone map, minimap and world map
- the character's court in the character panel

## Data model (sketch)

`server/db/schema.rb` is the full record; the tables in short:

- `characters.court`, `characters.court_switched_cycle`
- `courts`: key, treasury, `tax_bp` (basis points, 100–1500), relic prices and
  budget
- `council_cycles`: number, due/started/closed, dormant, the turn's status and
  attempts (so a restart re-runs); `court_turns`: each court's turn, its
  prompt, response, verbs and outcome
- `court_ledger_entries`: court, cycle, kind, amount, balance after,
  character, zone, meta
- `allegiance_changes`: every switch, from whom to whom, how, and for how much
- `proclamations`: court, cycle, text, created_at
- `court_news`: the scripted announcements and digests, with their audience
- `court_letters`: court, character, kind (defection, purse), text, amount,
  expires, status (unread, read, accepted, declined, lapsed)
- `bounties`, `bounty_progresses`
- `zone_claims`: zone, court, points; `zone_controls`: the control snapshot
  per cycle
- `claim_contributions`: character, zone, court, cycle, points (for the caps)
- `court_pushes`: the war chests
- `named_relics`: cycle, zone, slot, name, kind, finder, finder_name, found_at,
  status, registered_at, court; `relic_registrations`: every registration,
  common or named
- `inventory_items.named_relic_id` for a held named relic
- `gold_circulations`: a daily total
- `court_flags`: small world switches (dormant, the Capital's leading court,
  the gold log's last day)
- common relics: ordinary `material` items in `shared/data/items.json` tagged
  `relic: {zone, kind}`, three per wild zone (courts.json `relics.zones`)

## Build phases

1. Allegiance, treasuries, the ledger, `set_tax` and `Courts.tax_rate(zone)`
   (the auction was wired once its rework had merged), the stipend, the council
   loop through Sidekiq, dormant mode.
2. The audience halls, `proclaim`, the paginated board; the court button,
   window, notice cards and the scripted news.
3. Bounties: kill N in a zone, collect N.
4. Claims, control, member benefits, banners on the three maps.
5. Relics: common, then named, the registry desk and the book.
6. Letters: `award_purse`, `offer_defection`; then `fund_push`.
7. Tuning from the ledger and the gold-in-circulation log.

## Open items

- Tuning (phase 7): the starting values are in courts.json `tuning` (the
  stipend 400 a cycle, decay 10%, 500 claim points a character a cycle, relic
  prices 5–300 and a budget of 1,200, bounty sizes) and `VANAI_COURT_STIPEND`
  and `VANAI_COUNCIL_INTERVAL` override two of them; they wait to be tuned
  from the ledger and the gold log.
