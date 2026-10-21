// The Glassworks' places worth walking to (2026-10-10 revamp;
// tmp/wilds/zones/glassworks/PLAN.md), laid with the wild nature kit
// (wild-nature.ts) and the crystal pack. glassworks.ts owns the layout and the
// ground; it calls these from build() AFTER the roads, water and buildings, so
// every scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are kept few on purpose -- one stone tint (the rim's sandstone, a
// shade lighter), the ruins' ashlar warmed to the sand, two plant colours (ash
// scrub in the dry, olive round the water) and white flowers at the spring.
// The crest crystals use the theme scatter's own file + tint + flat, so they
// join its pools rather than opening new ones.
import { placeExact } from "../scene";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { rng, line, type Pt } from "../wild-terrain";

// the kit stones' one tint: the rim's sandstone (#c2a26a), a shade lighter so a
// tor reads against the dressed scarp behind it
export const STONE = "#cbb07c";
// the ruins' pale ashlar is a cold grey against amber sand; warm it
const ASHLAR = "#e2cfaa";
// the theme scatter's crystal tint (glassworks.ts glassDunes): same file +
// tint + flat = the same pool
const AMBER = "#d8b060";

type Spot = { x: number; z: number; scale: number; rot: number };

// THE DUNE SEA. Long wind-laid ridges of glass sand west of the Granary road;
// where the wind scours a crest bare the glass shows through, so each crest
// is picked out in amber crystal, and the troughs between hold the scree the
// dunes walked over and thorn scrub in the lee.
export function duneSea(ridges: Pt[][], camps: [number, number, number][], skip: (x: number, z: number) => boolean): void {
  const rand = rng(101);
  const small: Spot[] = [], big: Spot[] = [];
  for (const pts of ridges) {
    const l = line(pts);
    for (let s = 6; s < l.len - 6; s += 7 + rand() * 6) {
      // walk the smoothed crest: the nearest point query from a crest sample
      // is the sample itself, so step along the line's own vertices instead
      const [x, z] = pointAt(l.pts, s);
      const jx = x + (rand() - 0.5) * 3, jz = z + (rand() - 0.5) * 3;
      if (skip(jx, jz)) continue;
      if (rand() < 0.22) big.push({ x: jx, z: jz, scale: 1.6 + rand() * 1.2, rot: rand() * 6.3 });
      else small.push({ x: jx, z: jz, scale: 0.8 + rand() * 0.7, rot: rand() * 6.3 });
    }
  }
  placeExact("crystal/crystal.glb", small.filter((_, i) => i % 2 === 0), 0.3, { tint: AMBER, flat: true });
  placeExact("crystal/mineral.glb", small.filter((_, i) => i % 2 === 1), 0.3, { tint: AMBER, flat: true });
  placeExact("crystal/big_crystal.glb", big, 0.8, { tint: AMBER, flat: true });
  const box: [number, number, number, number] = [-300, -215, -140, 100];
  wildScatter("scree", { rect: box }, { density: 0.35, tint: STONE, seed: 102, avoid: camps });
  wildScatter("bramble", { rect: box }, { density: 0.5, color: "ash", seed: 103, clump: { n: [2, 4], r: 5 }, avoid: camps });
  wildScatter("shrub", { rect: box }, { density: 0.25, color: "ash", seed: 104, clump: { n: [1, 3], r: 4 }, avoid: camps });
  wildScatter("boulder", { rect: box }, { count: 10, tint: STONE, seed: 105, avoid: camps });
}

// THE ANVILS. Three sandstone buttes the wind left standing out of the sand.
// Their feet are broken rock -- outcrops fallen off the walls, scree fans --
// and the trail from the Granary road threads between them.
export function anvils(buttes: [number, number, number][]): void {
  const rand = rng(111);
  const outcrops: Spot[] = [], fans: Spot[] = [];
  for (const [x, z, r] of buttes) {
    const n = Math.max(4, Math.round(r / 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.6, d = r + 5 + rand() * 4;
      (i % 2 ? fans : outcrops).push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, scale: 1.0 + rand() * 0.6, rot: rand() * 6.3 });
    }
  }
  wildPlace("outcrop", outcrops, { tint: STONE });
  wildPlace("scree", fans, { tint: STONE });
  for (const [x, z, r] of buttes) wildScatter("bramble", { circle: [x, z, r + 22] }, { density: 0.6, color: "ash", seed: 112 + Math.round(x), clump: { n: [2, 3], r: 4 } });
}

// THE KILN-WATCH. The works' old watch post on the tallest Anvil, where a
// sentry once counted the smoke columns: an arch looking north to the row,
// a wall against the west wind, one column standing and one in drums, a cairn
// where the ramp arrives, and a waymarker. `c` is the butte's top.
export function kilnWatch(c: Pt, rampTop: Pt): void {
  const [x, z] = c;
  wildPlace("arch", [{ x: x + 1, z: z + 6, rot: 0.15 }], { tint: ASHLAR });
  wildLine("ruin_wall", [[x - 9, z - 6], [x - 8, z + 7]], { face: "right", seed: 121, tint: ASHLAR });
  wildPlace("ruin_corner", [{ x: x - 8, z: z - 8, rot: 0.2 }], { tint: ASHLAR });
  wildPlace("column", [{ x: x + 7, z: z - 4, rot: 0.4 }], { tint: ASHLAR });
  wildPlace("drums", [{ x: x + 4, z: z - 7, rot: 1.3 }], { tint: ASHLAR });
  wildPlace("cairn", [{ x: rampTop[0] - 2, z: rampTop[1] - 3, rot: 0.6 }], { tint: STONE });
  wildPlace("waymarker", [{ x: x + 2, z: z - 1, rot: 2.2 }], { tint: ASHLAR });
}

// THE QUENCH. A spring in a hollow off the Granary road where the first
// blowers carried their glass to cool: the one green in the province -- reeds
// in the water, olive scrub and white flowers on the banks -- with a waymarker
// on the path down and the stones they set the hot panes on.
export function quench(c: Pt, r: number): void {
  const [x, z] = c;
  wildScatter("reeds", { circle: [x, z, r + 8] }, { density: 8, nearWater: 3.5, color: "olive", seed: 131 });
  wildScatter("shrub", { circle: [x, z, r + 20] }, { density: 2.2, color: "olive", seed: 132, clump: { n: [2, 4], r: 4 } });
  wildScatter("wildflowers", { circle: [x, z, r + 18] }, { density: 2.5, color: "white", seed: 133, clump: { n: [3, 5], r: 4 } });
  wildPlace("boulder", [{ x: x + r + 5, z: z - 4, rot: 0.6, scale: 1.3 }, { x: x - r - 4, z: z + 6, rot: 2.1, scale: 1.1 }, { x: x + 3, z: z - r - 6, rot: 1.4, scale: 0.9 }], { tint: STONE });
  wildPlace("drums", [{ x: x + r + 3, z: z + 8, rot: 0.9 }], { tint: ASHLAR });
}

// THE GLASS GARDEN. Under the crescent's rise in the north-east the wind has
// cut the sandstone into hoodoos -- tors stretched tall, standing stones leaning
// where the sand went out from under them -- and the glass grew in between, so
// a walk through it is a walk among amber crystals the size of a house.
export function glassGarden(c: Pt, r: number, camps: [number, number, number][]): void {
  const [cx, cz] = c;
  const rand = rng(141);
  const tors: (Spot & { sy: number })[] = [], stones: (Spot & { lean: number; leanX: number; leanZ: number })[] = [], crystals: Spot[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (i % 3 === 0) stones.push({ x, z, scale: 1.4 + rand() * 0.6, rot: rand() * 6.3, lean: 0.06 + rand() * 0.14, leanX: rand() - 0.5, leanZ: rand() - 0.5 });
    else tors.push({ x, z, scale: 1.0 + rand() * 0.5, rot: rand() * 6.3, sy: 1.3 + rand() * 0.9 });
  }
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, d = 8 + Math.sqrt(rand()) * (r - 8);
    crystals.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, scale: 2.2 + rand() * 1.6, rot: rand() * 6.3 });
  }
  wildPlace("tor", tors.map((t) => ({ ...t, sx: t.scale, sz: t.scale, sy: t.scale * t.sy })), { tint: STONE });
  wildPlace("standing_stone", stones, { tint: STONE });
  placeExact("crystal/big_crystal.glb", crystals, 1.4, { tint: AMBER, flat: true });
  wildPlace("cairn", [{ x: cx - r + 6, z: cz - r * 0.4, rot: 0.3 }], { tint: STONE });
  wildScatter("scree", { circle: [cx, cz, r] }, { density: 0.6, tint: STONE, seed: 142, avoid: camps.map(([x, z, rr]) => [x, z, Math.min(rr, 12)] as [number, number, number]) });
  wildScatter("bramble", { circle: [cx, cz, r + 10] }, { density: 0.5, color: "ash", seed: 143, clump: { n: [2, 3], r: 4 } });
}

// THE SCARP. The table's top: outcrops breaking the skyline you see from the
// pond, a cairn at the stair's head and a waymarker at its foot.
export function scarpTop(spots: Pt[], stairFoot: Pt, stairHead: Pt): void {
  const rand = rng(151);
  wildPlace("outcrop", spots.map(([x, z]) => ({ x, z, rot: rand() * 6.3, scale: 1.2 + rand() * 0.5 })), { tint: STONE });
  wildPlace("cairn", [{ x: stairHead[0] + 2, z: stairHead[1] + 9, rot: 0.4 }], { tint: STONE });
  wildPlace("waymarker", [{ x: stairFoot[0] - 6, z: stairFoot[1] - 9, rot: 1.57 }], { tint: ASHLAR });
}

// the point `s` metres along a polyline
function pointAt(pts: Pt[], s: number): Pt {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (s <= L) return [ax + (bx - ax) * s / L, az + (bz - az) * s / L];
    s -= L;
  }
  return pts[pts.length - 1];
}
