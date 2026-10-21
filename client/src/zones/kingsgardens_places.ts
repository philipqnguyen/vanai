// The King's Gardens' places worth walking to (2026-10-10 revamp,
// tmp/wilds/zones/kingsgardens/PLAN.md): the Crescent Terraces and their
// Belvedere, the Grotto, the Mount, the Cleared Row and the King's Orchard.
// kingsgardens.ts owns the layout and the ground; it calls these from build()
// AFTER the roads, water and buildings, so every scatter's keep-clear check
// can read them.
//
// Cost. Almost everything here is MORE instances of pools the gardens already
// draw -- the parterres' clipped bushes and silver beds, the birch walk's
// round crowns, the statues' columns and obelisks -- so the terraces, the
// belvedere, the mount and the orchard add instances, not draw calls. The wild
// kit is kept to the two places that are allowed to be wild (the Grotto and
// the Cleared Row): one stone tint, the ruins' own ashlar, white flowers only.
import { placeExact, makePath, ground, addShadowCaster, texMat, tbox, circleColliders } from "../scene";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { rng, type Pt } from "../wild-terrain";

type Spot = { x: number; z: number; scale: number; rot: number; yOff?: number };

// the gravel every walk in the gardens is laid in (the roads' own sheet)
const GRAVEL = { tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6 } as const;
// the parterres' pools: clipped topiary and the silver beds
const TOPIARY = "nature/Bush_Large.gltf", TOPIARY_TINT = "#3d6d3a";
const BED_A = "nature/Flower_4_Group.gltf", BED_A_TINT = "#d8dce8";
const BED_B = "nature/Flower_1_Group.gltf", BED_B_TINT = "#c8d0e0";
// the birch walk's round green crowns: clipped, so the orchard and the
// terrace avenues are the same pool at a smaller scale
const CLIPPED = "nature/CommonTree_5.gltf";
const PALE = "#d8d4cc";        // the statues' pale stone
const ROCK = "#8c8ca8";        // the rim's own stone, for the Grotto's face

// a pale plinth with an urn on it (the parterres' centrepiece, repeated)
function urnOnPlinth(x: number, z: number, h: number): void {
  const stone = texMat("kg_plinth", "grey_plaster_02", { tint: "#e8e2d8" });
  const p = tbox(`kg_urnplinth${x}${z}`, 2.2, h, 2.2, stone, 1.2); p.position.set(x, ground(x, z) + h / 2, z); addShadowCaster(p);
  circleColliders.push({ x, z, r: 1.5 });
  placeExact("graveyard/urn-round.glb", [{ x, z, scale: 4.0, rot: 0, yOff: h }], 0, { tint: PALE });
}

// THE CRESCENT TERRACES. Each terrace is a level lawn with its gravel walk;
// along every brow a clipped bush every twelve metres and a silver bed
// between each pair; the middle terrace's walk is an avenue of clipped trees.
// `brows` are the brows' z, `walks` the walks (already drawn by the caller),
// `skip(x, z)` the places a brow must leave open (the ramped walks, the
// Grotto, the Great Stair's platform).
export function terraceDressing(brows: { z: number; x0: number; x1: number }[], avenue: { z: number; x0: number; x1: number }, skip: (x: number, z: number) => boolean): void {
  const rand = rng(71);
  const bush: Spot[] = [], bedA: Spot[] = [], bedB: Spot[] = [];
  for (const b of brows) {
    for (let x = b.x0; x <= b.x1; x += 12) {
      // a metre back from the brow, on the level top: the bank below stays turf
      const z = b.z + 1.5;
      if (!skip(x, z)) bush.push({ x, z, scale: 0.75, rot: rand() * 6.3 });
      const bx = x + 6;
      if (bx <= b.x1 && !skip(bx, z)) (Math.round(bx / 12) % 2 ? bedA : bedB).push({ x: bx, z: z + 0.5, scale: 1.0, rot: rand() * 6.3 });
    }
  }
  const trees: Spot[] = [];
  for (let x = avenue.x0; x <= avenue.x1; x += 20) for (const s of [-1, 1]) {
    const z = avenue.z + s * 7;
    if (!skip(x, z)) trees.push({ x, z, scale: 0.55 + rand() * 0.08, rot: rand() * 6.3 });
  }
  placeExact(TOPIARY, bush, 1.0, { tint: TOPIARY_TINT });
  placeExact(BED_A, bedA, 0, { tint: BED_A_TINT });
  placeExact(BED_B, bedB, 0, { tint: BED_B_TINT });
  placeExact(CLIPPED, trees, 0.6);
}

// THE BELVEDERE at the head of the axis, on the top terrace: a ring of eight
// pale columns round an urn, a bench facing down the axis between each pair
// on the south side, two clipped trees behind. From here the whole garden is
// laid out below: the stair, the parterres, the court, the Mount.
export function belvedere(c: Pt): void {
  const [x, z] = c;
  const R = 7;
  const cols: Spot[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    cols.push({ x: x + Math.cos(a) * R, z: z + Math.sin(a) * R, scale: 2.4, rot: -a });
  }
  placeExact("graveyard/column-large.glb", cols, 0.7, { tint: PALE });
  urnOnPlinth(x, z, 1.2);
  // benches looking south down the axis (Bench's seat faces its local -z
  // when rot = 0 at the court; same sense here: rot PI faces +z, so 0 faces -z)
  placeExact("props/Bench.gltf", [{ x: x - 3.2, z: z - 4.2, scale: 1.0, rot: Math.PI }, { x: x + 3.2, z: z - 4.2, scale: 1.0, rot: Math.PI }], 0.6);
  placeExact(CLIPPED, [{ x: x - 14, z: z + 6, scale: 0.8, rot: 1.1 }, { x: x + 14, z: z + 6, scale: 0.8, rot: 2.6 }], 0.6);
  placeExact(TOPIARY, [-1, 1].map((s) => ({ x: x + s * 10, z: z - 7, scale: 0.9, rot: 0 })), 1.2, { tint: TOPIARY_TINT });
}

// THE GROTTO. The one place in the Gardens where the stone shows: a dell cut
// back into the terraces (kingsgardens.ts `gorgeCut`), and at its head a face
// of the crescent's own rock -- two of the kit's cliff slabs in the rim's
// tint, a tor either side -- with a still pool at its foot. Even here the
// gravel is raked: the floor walk runs from the mouth to the pool, two
// obelisks stand at the mouth like a gate, a bench at the water. Ferns and
// reeds are the only planting the gardeners have not put in rows.
export function grotto(mouth: Pt, pool: Pt, floor: Pt[], head: Pt): void {
  const [mx, mz] = mouth, [px, pz] = pool, [hx, hz] = head;
  makePath({ pts: floor, half: 1.8, ...GRAVEL, fray: 0.5, name: "kg_grottowalk" });
  placeExact("graveyard/pillar-obelisk.glb", [{ x: mx - 9, z: mz, scale: 2.6, rot: 0 }, { x: mx + 9, z: mz, scale: 2.6, rot: 0 }], 0.6, { tint: PALE });
  placeExact("props/Bench.gltf", [{ x: floor[floor.length - 1][0] + 3, z: floor[floor.length - 1][1] - 1, scale: 1.0, rot: Math.PI / 2 }], 0.6);
  // the face: slabs behind the line's end, turned to look back down the dell
  // (face = local +z; rot PI faces -z), sunk a metre into the floor, at 1.4x
  // so their crowns stand over the dell's 8 m banks (at 1x they read as two
  // blocks on the lawn)
  wildPlace("cliff", [{ x: hx - 8, z: hz + 7, rot: Math.PI + 0.25, yOff: -1, scale: 1.4 }, { x: hx + 8, z: hz + 7.5, rot: Math.PI - 0.25, yOff: -1, scale: 1.5 }], { tint: ROCK });
  wildPlace("tor", [{ x: hx - 15, z: hz - 3, rot: 0.6 }, { x: hx + 14, z: hz - 2, rot: 2.3, scale: 0.9 }], { tint: ROCK });
  wildPlace("outcrop", [{ x: hx - 14, z: hz - 22, rot: 1.4 }, { x: hx + 13, z: hz - 30, rot: 4.4, scale: 0.8 }], { tint: ROCK });
  wildScatter("reeds", { circle: [px, pz, 20] }, { density: 10, nearWater: 3.5, color: "olive", seed: 81 });
  wildScatter("fern_bed", { poly: [[mx - 22, mz - 2], [mx + 22, mz - 2], [px + 24, pz + 14], [px - 24, pz + 14]] }, { density: 4, color: "dark", seed: 82, clump: { n: [3, 5], r: 5 } });
  wildScatter("wildflowers", { circle: [(mx + px) / 2, (mz + pz) / 2, 26] }, { density: 1.5, color: "white", seed: 84, clump: { n: [2, 4], r: 4 } });
}

// THE MOUNT. A Tudor garden mount: a cone of turf (kingsgardens.ts `MOUNT`)
// climbed by a spiral walk to a clipped arbour at the top -- a flowering tree,
// a bench facing back up the axis to the stair, four clipped bushes, a ring of
// silver beds round the foot.
export function mount(c: Pt, r: number, spiral: Pt[]): void {
  const [x, z] = c;
  makePath({ pts: spiral, half: 1.6, ...GRAVEL, fray: 0.4, name: "kg_mountwalk" });
  placeExact("nature/CherryBlossom_4.gltf", [{ x: x + 1, z: z - 1, scale: 0.85, rot: 2.2 }], 1.0);
  placeExact("props/Bench.gltf", [{ x, z: z + 4.5, scale: 1.0, rot: Math.PI }], 0.6);
  placeExact(TOPIARY, [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: x + sx * 5.5, z: z + sz * 5.5, scale: 0.7, rot: 0 })), 1.0, { tint: TOPIARY_TINT });
  const rand = rng(91);
  const beds: Spot[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const bx = x + Math.cos(a) * (r + 3), bz = z + Math.sin(a) * (r + 3);
    // the spiral walk leaves the foot on its own bearing: no bed across it
    if (Math.hypot(bx - spiral[0][0], bz - spiral[0][1]) < 6) continue;
    beds.push({ x: bx, z: bz, scale: 1.0, rot: rand() * 6.3 });
  }
  placeExact(BED_A, beds.filter((_, i) => i % 2 === 0), 0, { tint: BED_A_TINT });
  placeExact(BED_B, beds.filter((_, i) => i % 2 === 1), 0, { tint: BED_B_TINT });
}

// THE CLEARED ROW. The gardeners lived on the first terrace, in a row of
// cottages along the walk, until the Gardens were cleared at pike-point (the
// registry's one entry with no purpose, s_kg_6). The registry struck the row
// out, so nobody keeps it: the only ground in the Gardens left to fall --
// broken walls and corners, a fallen hearth-column, bramble in the doorways,
// wildflowers where the kitchen beds were. `homes` are the cottages' centres
// (each about 7 x 6 m, its door on the walk's side, -z).
export function clearedRow(homes: Pt[], avoid: [number, number, number][]): void {
  const rand = rng(101);
  homes.forEach(([x, z], i) => {
    const turn = (rand() - 0.5) * 0.12;
    // the corner at the back, one run along the front with the door gap,
    // one run down the far side; every second cottage is missing a wall more
    wildPlace("ruin_corner", [{ x: x - 2.2, z: z + 2.2, rot: turn }]);
    wildLine("ruin_wall", [[x + 0.5, z - 3], [x + 3.5, z - 3]], { face: "left", seed: 102 + i });
    if (i % 2 === 0) wildLine("ruin_wall", [[x + 3.6, z - 2.6], [x + 3.6, z + 3]], { face: "right", seed: 110 + i });
    if (i % 3 === 1) wildPlace("drums", [{ x: x + 1, z: z + 1, rot: rand() * 6.3 }]);
  });
  const xs = homes.map((h) => h[0]), zs = homes.map((h) => h[1]);
  const box: [number, number, number, number] = [Math.min(...xs) - 10, Math.min(...zs) - 2, Math.max(...xs) + 10, Math.max(...zs) + 8];
  wildScatter("bramble", { rect: box }, { count: 9, seed: 104, avoid, gap: 5 });
  wildScatter("wildflowers", { rect: box }, { density: 3, color: "white", seed: 105, avoid, clump: { n: [2, 5], r: 5 } });
  wildPlace("stump", [{ x: box[0] + 6, z: box[1] + 9, rot: 0.4 }]);
  wildPlace("log", [{ x: box[2] - 8, z: box[3] - 3, rot: 1.3 }], { collide: false });
}

// THE KING'S ORCHARD. A ruled grid of fruit trees along the west margin, every
// crown clipped to the same sphere; white flowers in the grass under them,
// the only drift of them in the formal gardens. `skip(x, z)` keeps the grid off
// the nodes and walks that run through it.
export function orchard(x0: number, x1: number, z0: number, z1: number, step: number, skip: (x: number, z: number) => boolean): void {
  const rand = rng(121);
  const trees: Spot[] = [];
  for (let x = x0; x <= x1 + 0.1; x += step) for (let z = z0; z <= z1 + 0.1; z += step) {
    if (skip(x, z)) continue;
    trees.push({ x, z, scale: 0.42 + rand() * 0.04, rot: rand() * 6.3 });
  }
  placeExact(CLIPPED, trees, 0.5);
  wildScatter("wildflowers", { rect: [x0 - 4, z0 - 4, x1 + 4, z1 + 4] }, { density: 2.2, color: "white", seed: 122, clump: { n: [3, 6], r: 6 } });
}

// the obelisk gate piers where a pass road comes out into the gardens
export function gatePiers(at: Pt, across: Pt, half: number): void {
  const [x, z] = at, [ax, az] = across;
  placeExact("graveyard/pillar-obelisk.glb", [-1, 1].map((s) => ({ x: x + ax * s * half, z: z + az * s * half, scale: 3.0, rot: 0 })), 0.6, { tint: PALE });
}
