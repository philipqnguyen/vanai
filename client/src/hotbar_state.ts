// The hotbar's pure rules: the sparse ten-slot layout (migration from the old
// name list, auto-fill, swap, place) and the one state a slot shows. No
// imports, for the same reason as hud_model.ts: hud.ts pulls in Babylon and
// cannot load under node --test, so the rules live apart to be pinned down.

/** A slot holds an ability id, `item:<key>` for a consumable, or nothing. */
export type Entry = string | null;

export const SLOTS = 10;

// Copied from server/lib/vanai/combat.rb (MELEE_RANGE, SPELL_RANGE and
// resolve_target): a weapon skill reaches MELEE_RANGE 2.8 + 0.6, every other
// targeted ability SPELL_RANGE 30.0, and against a monster both are measured
// to its edge (edgeDistance, its monsters.json radius_m) -- a 6 m boss is
// fought at its flank. Keep in step with the server, which is the judge --
// this only decides when a slot is washed red and the target frame reads
// "far". Line of sight is not modelled.
export const MELEE_RANGE = 2.8;
export const RANGE = { ws: MELEE_RANGE + 0.6, other: 30.0 };

/** From (x, z) to the edge of a monster of footprint `radius` standing at
 *  (mx, mz): MonsterState#edge_dist_to on the server. 0 inside it. */
export function edgeDistance(x: number, z: number, mx: number, mz: number, radius: number): number {
  return Math.max(0, Math.hypot(mx - x, mz - z) - radius);
}
// the client draws interpolated positions a little behind the server's, so a
// target right at the edge is given the benefit of the doubt
export const MARGIN = 0.3;

export const isItemEntry = (e: Entry): e is string => typeof e === "string" && e.startsWith("item:");
export const itemKeyOf = (e: string): string => e.slice(5);

const blank = (): Entry[] => Array.from({ length: SLOTS }, () => null);

/** Read a saved layout in either format: the current ten-entry array (ids,
 *  `item:` entries and nulls) or the old dense list of ability NAMES that
 *  vanai_hotbar_<char>_<job> held. Names resolve to ids; an unresolved string
 *  is kept, because the ability list may not have arrived yet — fillLayout
 *  drops it once the list is known. Duplicates keep their first place. */
export function migrateLayout(saved: unknown, abilities: readonly { id: string; name: string }[]): Entry[] {
  const out = blank();
  if (!Array.isArray(saved)) return out;
  const ids = new Set(abilities.map((a) => a.id));
  const byName = new Map(abilities.map((a) => [a.name, a.id]));
  const seen = new Set<string>();
  saved.slice(0, SLOTS).forEach((v, i) => {
    if (typeof v !== "string" || !v) return;
    const e = isItemEntry(v) || ids.has(v) ? v : (byName.get(v) ?? v);
    if (seen.has(e)) return;
    seen.add(e);
    out[i] = e;
  });
  return out;
}

/** The layout against the abilities the character has now: an ability id no
 *  longer known is dropped (item entries stay), and each known ability not yet
 *  on the bar takes the first empty slot, in the order given. Abilities that
 *  find no empty slot stay off the bar (the Character window lists them). */
export function fillLayout(layout: readonly Entry[], abilityIds: readonly string[]): Entry[] {
  const known = new Set(abilityIds);
  const out = blank();
  const seen = new Set<string>();
  for (let i = 0; i < SLOTS; i++) {
    const e = layout[i] ?? null;
    if (e === null || seen.has(e)) continue;
    if (!isItemEntry(e) && !known.has(e)) continue;
    seen.add(e);
    out[i] = e;
  }
  for (const id of abilityIds) {
    if (seen.has(id)) continue;
    const free = out.indexOf(null);
    if (free < 0) break;
    out[free] = id;
    seen.add(id);
  }
  return out;
}

/** Swap two slots; an index off the bar leaves the layout as it was. */
export function swap(layout: readonly Entry[], a: number, b: number): Entry[] {
  const out = layout.slice(0, SLOTS);
  while (out.length < SLOTS) out.push(null);
  if (a === b || a < 0 || b < 0 || a >= SLOTS || b >= SLOTS) return out;
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** Put an entry in slot i. One already elsewhere on the bar swaps with what
 *  is in i, so an entry is never on the bar twice. */
export function place(layout: readonly Entry[], i: number, entry: Entry): Entry[] {
  if (i < 0 || i >= SLOTS) return swap(layout, 0, 0);
  const at = entry === null ? -1 : layout.indexOf(entry);
  if (at >= 0 && at !== i) return swap(layout, at, i);
  const out = swap(layout, 0, 0);
  out[i] = entry;
  return out;
}

/** Take a consumable off slot i. Only items come off: fillLayout puts every
 *  known ability back into the first empty slot, so clearing one would just
 *  move it somewhere else on the bar. */
export function removeItem(layout: readonly Entry[], i: number): Entry[] {
  const out = swap(layout, 0, 0);
  if (i >= 0 && i < SLOTS && isItemEntry(out[i])) out[i] = null;
  return out;
}

export interface SlotAbility {
  name: string;
  kind?: string;
  target?: string;
  mp?: number;
  tp?: number;
  cd?: number;
  hp_cost_pct?: number;
}

export interface SlotInput {
  ability?: SlotAbility | null;
  /** how many of a slotted consumable are carried; set only for item entries */
  itemQty?: number | null;
  dead: boolean;
  tp: number;
  mp: number;
  now: number;
  /** when this ability's cooldown ends, on the same clock as `now` */
  cdUntil?: number;
  /** names of the effects live on you; a buff shares its ability's name */
  buffs?: readonly string[];
  /** what the current target is, and how far, in metres */
  targetKind?: "monster" | "player" | null;
  targetDist?: number | null;
}

export type SlotClass = "empty" | "dim" | "active" | "cd" | "far" | "short" | "tpready" | "ready";
export type CostTone = "" | "tp" | "mp" | "hp" | "item" | "short";
/** what the cost is paid in; "short" is a tone, so the label reads this */
export type CostRes = "" | "tp" | "mp" | "hp" | "item";

export interface SlotFlags {
  cls: SlotClass;
  cost: string;
  costTone: CostTone;
  costRes: CostRes;
  /** whole seconds left on the cooldown, "" when not cooling */
  cdText: string;
  /** how much of the cooldown has run, 0..100, for the conic sweep */
  cdDone: number;
}

/** The one state a slot shows, by precedence: empty, dead (dim), buff running
 *  (active), cooling, target out of reach (far), short of MP, weapon skill
 *  with the TP for it (tpready), else ready. A consumable is dim at 0. */
export function slotFlags(input: SlotInput): SlotFlags {
  const flags: SlotFlags = { cls: "ready", cost: "", costTone: "", costRes: "", cdText: "", cdDone: 0 };
  const ab = input.ability;
  if (input.itemQty !== undefined && input.itemQty !== null) {
    flags.cost = String(input.itemQty);
    flags.costTone = flags.costRes = "item";
    if (input.dead || input.itemQty <= 0) flags.cls = "dim";
    return flags;
  }
  if (!ab) { flags.cls = "empty"; return flags; }
  const ws = ab.kind === "ws";
  const tpCost = ws ? (ab.tp || 100) : (ab.tp || 0);
  const mpShort = !!ab.mp && input.mp < ab.mp;
  // Below its TP a weapon skill is a plain slot with a gold cost (Main and
  // Kit artboards), not a red one: TP 0 is the resting state, and red would
  // mark every weapon skill broken. Reaching the TP lights it (tpready).
  const tpShort = !!tpCost && input.tp < tpCost;
  if (tpCost) { flags.cost = String(tpCost); flags.costTone = flags.costRes = "tp"; }
  else if (ab.mp) { flags.cost = String(ab.mp); flags.costRes = "mp"; flags.costTone = mpShort ? "short" : "mp"; }
  else if (ab.hp_cost_pct) { flags.cost = `${ab.hp_cost_pct}%`; flags.costTone = flags.costRes = "hp"; }

  if (input.dead) { flags.cls = "dim"; return flags; }
  if (input.buffs?.includes(ab.name)) { flags.cls = "active"; return flags; }
  const left = (input.cdUntil ?? 0) - input.now;
  if (left > 0) {
    const total = ab.cd || 1;
    flags.cls = "cd";
    flags.cdText = String(Math.ceil(left));
    flags.cdDone = Math.min(100, Math.max(0, (1 - left / total) * 100));
    return flags;
  }
  const wants = ab.target === "enemy" ? "monster"
    : ab.target === "ally" || ab.target === "dead_ally" ? "player" : null;
  if (wants && input.targetKind === wants && input.targetDist != null
      && input.targetDist > (ws ? RANGE.ws : RANGE.other) + MARGIN) {
    flags.cls = "far";
    return flags;
  }
  if (mpShort) { flags.cls = "short"; return flags; }
  if (ws && !tpShort) { flags.cls = "tpready"; return flags; }
  return flags;
}
