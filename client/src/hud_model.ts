// The HUD's small pure rules: TP segments, countdown text, buff tone, cast
// progress, live effect filtering and the interact verb. They live here, with
// no imports, because hud.ts imports Babylon and cannot load under node --test;
// keeping them apart is what lets the test suite pin them down.

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** TP caps at 300, drawn as three segments of 100 each, filled in order. */
export function tpSegments(tp: number): [number, number, number] {
  return [0, 1, 2].map((i) => clamp01((tp - 100 * i) / 100)) as [number, number, number];
}

/** Countdown text for a buff tile: "0:18" and "1:04" under ten minutes,
 *  "14m" under an hour, "2h" beyond. Seconds round up so a live effect never
 *  reads 0:00 before it has actually gone. */
export function fmtRemain(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** What is left of a `remain` the server sent at `receivedAt` (both in
 *  seconds), counted down locally between self updates. */
export function liveRemain(remain: number, receivedAt: number, now: number): number {
  return Math.max(0, remain - (now - receivedAt));
}

export type BuffTone = "debuff" | "def" | "benefit";

/** How a buff tile is coloured, from what the server says the effect is
 *  (self_payload's kind and harm): ailments red, defensive buffs brass, the
 *  rest green. */
export function buffTone(kind: string, harm = false): BuffTone {
  if (harm) return "debuff";
  if (kind === "buff_def" || kind === "evade_charges") return "def";
  return "benefit";
}

/** The tile's tooltip: the effect's name and, when the server sent one, its
 *  full length, so a countdown reading 0:12 says out of what. */
export function buffTitle(name: string, duration?: number): string {
  return duration && duration > 0 ? `${name} (${fmtRemain(duration)})` : name;
}

/** How far through a cast is, 0..1, or null once it has ended (or never had a length). */
export function castFrac(endsAt: number, ms: number, now: number): number | null {
  if (!(ms > 0) || now >= endsAt) return null;
  return clamp01(1 - (endsAt - now) / (ms / 1000));
}

/** The entries of an effect list still running at `now`. */
export function liveEffects<T extends { until: number }>(list: readonly T[] | undefined, now: number): T[] {
  return (list || []).filter((e) => e.until > now);
}

/** The verb on the interact prompt for each interactable kind. */
export function interactVerb(kind: string, lit = false): string {
  switch (kind) {
    case "npc": return "Talk";
    case "node": return "Gather";
    case "milestone": return lit ? "Teleport" : "Attune";
    case "portal": return "Enter";
    case "interactable": return "Examine";
    default: return "Use";
  }
}

/** How much a party row matters when the frame cannot show them all: lower
 *  keeps its row. Members here with you come first, alive or fallen (the
 *  fallen are the ones a healer is looking for); then those in another zone;
 *  then a seat mid-crossing, whose bars would be a stale snapshot anyway. */
export function partyRank(m: { away?: boolean; zone?: string | null }, zone: string): number {
  if (m.away) return 2;
  return m.zone && m.zone !== zone ? 1 : 0;
}

/** Which rows stay when `heights` (in display order) must fit in `room` with
 *  `gap` between rows: whole rows are taken in rank order (ties keep display
 *  order) until the next would not fit, and every later-ranked row goes too,
 *  so a short low-ranked row never jumps ahead of a taller one that matters
 *  more. Returns the kept indices' flags, in display order. */
export function fitPartyRows(heights: readonly number[], ranks: readonly number[], room: number, gap: number): boolean[] {
  const order = heights.map((_, i) => i).sort((a, b) => ranks[a] - ranks[b] || a - b);
  const keep = heights.map(() => false);
  let used = 0;
  for (const i of order) {
    const need = heights[i] + (used > 0 ? gap : 0);
    if (used + need > room + 0.5) break;
    used += need;
    keep[i] = true;
  }
  return keep;
}

/** A reward list with repeats folded into one entry and its count, in the
 *  order each first appears — two of a potion is one chip that says ×2. */
export function stackRewards(keys: readonly string[]): { key: string; n: number }[] {
  const out: { key: string; n: number }[] = [];
  const at = new Map<string, number>();
  for (const k of keys) {
    const i = at.get(k);
    if (i === undefined) { at.set(k, out.length); out.push({ key: k, n: 1 }); } else out[i].n++;
  }
  return out;
}
