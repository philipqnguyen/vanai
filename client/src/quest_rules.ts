// The quest rules that need no world: which category a quest key belongs to,
// its colour and tag, and whether an offer is open to a character. Kept free
// of the bundled data (and of `state`) so node --test can import it directly;
// quest_index.ts re-exports these and feeds them the live journal.

// Lamplight palette: the main story wears the HUD's own brass, so the eye
// reads "story" before "side"; side and guild stay cool and distinct from it
export const MAIN_COLOR = "#c9a35c"; // brass — the main story
export const SIDE_COLOR = "#8fd0c2"; // sea-green — side quests
export const GUILD_COLOR = "#c9a3e3"; // lilac — a job guild's own quests

export type QuestCategory = "main" | "guild" | "side";

// the main story's chapters: the three city books, the inn, the doorsteps,
// the Reservoir, the race, the ash and the capital
export function isMainQuest(key: string): boolean { return /^(cd|hw|mm|inn|ds|rv|race|ash|cap)\d/.test(key); }
// a job guild's quests are keyed g_<...>; everything else is a side quest
export function isGuildQuest(key: string): boolean { return key.startsWith("g_"); }

export function questCategory(key: string): QuestCategory {
  if (isMainQuest(key)) return "main";
  if (isGuildQuest(key)) return "guild";
  return "side";
}

const COLOR: Record<QuestCategory, string> = { main: MAIN_COLOR, guild: GUILD_COLOR, side: SIDE_COLOR };
const TAG: Record<QuestCategory, string> = { main: "MAIN", guild: "GUILD", side: "SIDE" };
// at equal marker priority the story outranks a guild, and a guild a side quest
export const CATEGORY_RANK: Record<QuestCategory, number> = { main: 2, guild: 1, side: 0 };

export function questColor(key: string): string { return COLOR[questCategory(key)]; }
export function questTag(key: string): string { return TAG[questCategory(key)]; }

// A quest naming a `job` is offered, progressed and handed in only while that
// is the active job (the server's Quests.job_ok?). Switching job pauses it.
export function questJobOk(q: { job?: string } | null | undefined, job: string | null | undefined): boolean {
  if (!q) return false;
  return !q.job || q.job === job;
}

export interface OfferSelf { level: number; job: string; }
export interface JournalEntry { status: number; }

// True when the quest has never been taken and is open to this character:
// the right job, a completed prerequisite (any one of them) and near enough
// in level — a mirror of the server's Quests.available?.
export function offerOpen(
  key: string,
  q: { min_lvl?: number; job?: string } | null | undefined,
  self: OfferSelf | null | undefined,
  journal: Map<string, JournalEntry>,
  prereqs: string[] | undefined,
): boolean {
  if (!self || !q || journal.has(key)) return false;
  if (!questJobOk(q, self.job)) return false;
  if (prereqs && prereqs.length && !prereqs.some((pk) => journal.get(pk)?.status === 2)) return false;
  return self.level >= (q.min_lvl || 1) - 2;
}

// A portal with a `gate_quest` exists only for a character who has completed
// that quest: before it there is no glow, target, prompt or map pin, and the
// server refuses it (World.gated_portal). Two kinds carry one: the Capital's
// gate (cap3, with a `to_done`) and the three Border Gates out of the cities'
// field zones (inn2, Philip 2026-10-12), whose leaves the scene also swings
// open for that character (scene.ts setBorderGateOpen). Per character, from
// their own journal -- never the party's or the world's.
export function portalShown(p: { gate_quest?: string } | null | undefined, journal: Map<string, JournalEntry>): boolean {
  if (!p) return false;
  return !p.gate_quest || journal.get(p.gate_quest)?.status === 2;
}

// The zone pairs a character's world map must not join with a crossing line:
// a plain gated portal (a Border Gate) still shut for them closes its pair
// BOTH ways, so the ungated return gate on the far side cannot draw the line
// back in. A two-city gate (a `to_done`, the Capital's) is left to its own
// rule: Warden Morrow opens its `to` at any time, so its pair is never shut.
// Keys are the two zone keys sorted and joined by "|".
export function closedCrossings(
  zones: Record<string, { portals?: { to?: string; gate_quest?: string; to_done?: string }[] } | undefined>,
  journal: Map<string, JournalEntry>,
): Set<string> {
  const shut = new Set<string>();
  for (const [key, def] of Object.entries(zones)) {
    for (const p of def?.portals || []) {
      if (!p.gate_quest || p.to_done || !p.to || portalShown(p, journal)) continue;
      shut.add([key, p.to].sort().join("|"));
    }
  }
  return shut;
}

// Which zone a duty is "in" when its destinations span several (sunroot grows
// in three zones' herb patches, and the first one found was not the one the
// giver meant). The objective's own words win: a zone named in its label,
// the longest name when one contains another ("Caerdun" inside "the Caerdun
// Fields"). A name only counts where no longer zone name containing it is
// what the label says, destination or not, so "the Moonmere Shores" never
// reads as the city of Moonmere. Otherwise the fewest border crossings from
// where the player stands; ties keep destination order. `hops` lacks
// unreachable zones.
export function pickQuestZone(
  destZones: string[],
  label: string,
  zoneNames: Record<string, string>,
  hops: Record<string, number>,
): string | null {
  const zones = [...new Set(destZones)];
  if (!zones.length) return null;
  const text = label.toLowerCase();
  const bare = (z: string) => (zoneNames[z] || "").replace(/^the /i, "").toLowerCase();
  const said = Object.keys(zoneNames).map(bare).filter((n) => n && text.includes(n));
  let named: string | null = null, namedLen = 0;
  zones.forEach((z) => {
    const name = bare(z);
    if (!name || !said.includes(name) || name.length <= namedLen) return;
    if (said.some((n) => n.length > name.length && n.includes(name))) return;
    named = z; namedLen = name.length;
  });
  if (named) return named;
  let best = zones[0], bestHops = hops[best] ?? Infinity;
  zones.forEach((z) => {
    const h = hops[z] ?? Infinity;
    if (h < bestHops) { best = z; bestHops = h; }
  });
  return best;
}

// Border crossings from `from` to every zone reachable through `links`.
export function zoneHops(from: string, links: Record<string, string[]>): Record<string, number> {
  const out: Record<string, number> = { [from]: 0 };
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const z = queue[i];
    (links[z] || []).forEach((n) => {
      if (out[n] === undefined) { out[n] = out[z] + 1; queue.push(n); }
    });
  }
  return out;
}

// ---------- the main story's next step ----------
// The story is one chain through `next`, but its giver changes almost every
// step and the next chapter is often still a few levels off when the last is
// handed in, so the Journal and the Duties tracker always name what comes
// next. Worked out from the data and the journal alone: nothing new is stored.
//
// Three city books open it (cd, hw, mm), and each city has its own doorstep
// chapter after inn2 (ds1_cd, ds1_hw, ds1_mm). A character follows one: the
// book they have the most of in their journal (counting its doorstep), else
// `fallbackBook`, the city nearest where they stand -- a new character stands
// in their own city. Other books' chapters are never named, though they can
// still be taken. A chapter that only leads somewhere already reached is never
// named either: once another city's doorstep has opened rv1, the followed
// book's own doorstep goes nowhere new (`deadEnd`).
export type StoryState = "active" | "ready" | "level";
export interface StoryStep { key: string; state: StoryState; opensAt: number; }

export function storyBook(key: string): string | null {
  const m = /^(cd|hw|mm)\d+$/.exec(key) || /^ds\d+_(cd|hw|mm)$/.exec(key);
  return m ? m[1] : null;
}

// the book a character follows: the one with the most chapters taken, ties
// and an empty journal going to the fallback
export function followedBook(journal: Map<string, JournalEntry>, fallbackBook: string): string {
  const count: Record<string, number> = {};
  journal.forEach((_, key) => {
    const b = storyBook(key);
    if (b) count[b] = (count[b] || 0) + 1;
  });
  let best = fallbackBook, bestN = count[fallbackBook] || 0;
  Object.entries(count).forEach(([b, n]) => { if (n > bestN) { best = b; bestN = n; } });
  return best;
}

// The step to show: a main chapter in hand (`active`), else the next one to
// take -- `ready` when the level allows it (the server's min_lvl - 2), `level`
// with the level it opens at when not yet. Null once the story is told.
export function mainStoryStep(
  quests: Record<string, { min_lvl?: number; next?: string | string[] } | undefined>,
  journal: Map<string, JournalEntry>,
  prereq: Record<string, string[] | undefined>,
  level: number,
  fallbackBook: string,
): StoryStep | null {
  const book = followedBook(journal, fallbackBook);
  const lvl = (k: string) => quests[k]?.min_lvl || 1;
  const mine = (k: string) => { const b = storyBook(k); return !b || b === book; };
  const keys = Object.keys(quests).filter(isMainQuest);
  // a chapter in hand is the step; the followed book's first, then the lowest
  const active = keys.filter((k) => journal.get(k)?.status === 1)
    .sort((a, b) => Number(!mine(a)) - Number(!mine(b)) || lvl(a) - lvl(b));
  if (active.length) return { key: active[0], state: "active", opensAt: Math.max(1, lvl(active[0]) - 2) };
  const open = (k: string) => (prereq[k] || []).some((pk) => journal.get(pk)?.status === 2);
  // A chapter is a dead end when everything it leads to is taken, open
  // already by another road, or a dead end itself: ds1_cd after ds2_hw (rv1
  // is open) would otherwise sort ahead of every later chapter for good. The
  // story's last chapter leads nowhere and is not one.
  const dead = new Map<string, boolean>();
  const deadEnd = (k: string): boolean => {
    const known = dead.get(k);
    if (known !== undefined) return known;
    dead.set(k, false); // a loop in the data leads nowhere new
    const after = ([] as string[]).concat(quests[k]?.next ?? []).filter(isMainQuest);
    const d = after.length > 0 && after.every((n) => journal.has(n) || open(n) || deadEnd(n));
    dead.set(k, d);
    return d;
  };
  const next = keys.filter((k) => {
    if (journal.has(k) || !mine(k)) return false;
    // a chapter with no prerequisite opens a book (cd1, hw1, mm1)
    return (!(prereq[k] || []).length || open(k)) && !deadEnd(k);
  }).sort((a, b) => lvl(a) - lvl(b));
  if (!next.length) return null;
  const opensAt = Math.max(1, lvl(next[0]) - 2);
  return { key: next[0], state: level >= opensAt ? "ready" : "level", opensAt };
}
