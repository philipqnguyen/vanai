// Light-safe groups for Heartwood's homes (tmp/heartwood-perf PLAN.md step 3).
// Babylon-free, so the node test reads the same planner the city uses.
//
// Every home has a hearth: a PointLight HEARTH_LIFT over its floor, range
// r + HEARTH_REACH, that lights only that home's meshes (includedOnlyMeshes).
// Merging several homes' meshes binds every hearth of the group to every merged
// triangle. That is exact only where a hearth does not reach: StandardMaterial's
// point falloff is max(0, 1 - d/range), an exact +0 beyond the range, so the
// sum of the other lights is unchanged. Hence two rules:
// - a group never holds two homes where either hearth may reach the other
//   home, tested against a cylinder that holds every triangle grownHome makes
//   (draw-merge.ts mergeByKey merges a group's meshes as the planner groups them);
// - at most HEARTH_CAP hearths a group. With hemi, sun and crystal that is 7
//   lights. WebKit 26 links at most 10 lights a mesh (12 uniform blocks a
//   stage); the 11th fails to link with "Unable to compile effect" console
//   errors and Babylon's fallback drops lights (MEASURED 2026-10-09,
//   tmp/heartwood-night BASELINE.md §3). The cap keeps 3 in hand.
export const HEARTH_LIFT = 3.4, HEARTH_REACH = 2, HEARTH_CAP = 4;

export type GroupHome = { name: string; x: number; z: number; r: number; y: number; height?: number };
export type HearthGroup = { name: string; homes: number[] };

// The cylinder every triangle of a home lies in: the planters by the door
// reach r+1.82 at the smallest home (r 6.6), the arches, ribs and ivy less;
// the floor slab hangs 0.28 under the floor and the roof dome tops out 2 m
// over the walls (plus a rib's 0.09). PAD keeps a test from riding the edge.
const OUT = 2, BELOW = .5, ABOVE = 2.5, PAD = .5;
// A home without a pocket joins another pocket's group only within this
// distance of its centre (planHearthGroups), so a group still culls as one
// neighbourhood.
const FOLD = 64;

/** Whether a's hearth may light any part of home b (conservative: never a false "no"). */
export function hearthReaches(a: GroupHome, b: GroupHome): boolean {
  const hy = a.y + HEARTH_LIFT, range = a.r + HEARTH_REACH;
  const dr = Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - (b.r + OUT));
  const dy = Math.max(0, b.y - BELOW - hy, hy - (b.y + (b.height ?? 4.7) + ABOVE));
  return Math.hypot(dr, dy) < range + PAD;
}

/**
 * Homes go by pocket first (`pocket[i]`: one tree's ground homes, one upper
 * ring's homes), in home order, a pocket splitting only where the cap or a
 * reaching pair forces it. A home with no pocket (the civic halls, the canopy
 * homes off the lanes) joins the nearest group within FOLD that it fits, or
 * starts one.
 */
export function planHearthGroups(homes: readonly GroupHome[], pocket: readonly (string | undefined)[]): HearthGroup[] {
  const groups: (HearthGroup & { key: string })[] = [];
  const clash = (i: number, j: number) => hearthReaches(homes[i], homes[j]) || hearthReaches(homes[j], homes[i]);
  const fits = (g: HearthGroup, i: number) => g.homes.length < HEARTH_CAP && g.homes.every((j) => !clash(i, j));
  const centre = (g: HearthGroup) => {
    if (!g.homes.length) return null;
    let x = 0, z = 0; for (const i of g.homes) { x += homes[i].x; z += homes[i].z; }
    return { x: x / g.homes.length, z: z / g.homes.length };
  };
  const open = (key: string, name: string) => { const g = { key, name, homes: [] as number[] }; groups.push(g); return g; };
  homes.forEach((_, i) => {
    const key = pocket[i]; if (!key) return;
    const g = groups.find((g) => g.key === key && fits(g, i)) ?? open(key, groups.some((g) => g.key === key) ? `${key}#${groups.filter((g) => g.key === key).length + 1}` : key);
    g.homes.push(i);
  });
  homes.forEach((h, i) => {
    if (pocket[i]) return;
    let best: HearthGroup | undefined, bd = FOLD;
    for (const g of groups) { const c = centre(g); if (!c || !fits(g, i)) continue; const d = Math.hypot(h.x - c.x, h.z - c.z); if (d < bd) { bd = d; best = g; } }
    (best ?? open('home:' + h.name, 'home:' + h.name)).homes.push(i);
  });
  return groups.map(({ name, homes }) => ({ name, homes }));
}
