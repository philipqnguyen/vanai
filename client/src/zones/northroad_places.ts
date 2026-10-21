// The North Road's places worth walking to, and the dressing that turns a
// white sheet with pines on it into an upland, laid with the wild nature kit
// (wild-nature.ts). northroad.ts owns the layout and the ground; it calls
// these from build() AFTER the roads, the inn and the yards, so every
// scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind, colour, tint and
// snow, so the variants are few on purpose -- ONE stone tint (the card's peak
// stone) for every kit stone, the ruins' own ashlar, one ice albedo for the
// frozen fall, one scrub colour each. About 17 pools, ~40
// main-pass draws at worst whatever the counts.
import { placeExact, polySignedDist, ground } from "../scene";
import { wildPlace, wildScatter, type WildSpot } from "../wild-nature";
import { line, rng, type Pt } from "../wild-terrain";

// the card's peak stone (#8e9aac): the theme's rockTint, so a kit boulder and
// the rim's crags are the one rock under the one snow
export const STONE = "#8e9aac";
// (no heather: the kit's heather, even pulled grey, read as violet bars on
// the snow -- look 1 -- and a winter upland shows none)
// the frozen fall: the kit's cliff slab in a pale blue-white albedo. A tint
// is a multiply and the slab's stone is mid-grey, so this is near white on
// purpose: it renders as blue-grey ice against the snow, not as white rock
const ICE = "#e4f0f8";

type Circle = [number, number, number];

// a windthrown pine: the root plate standing up out of the snow, the trunk
// lying away from it along the plate's +z (both kinds run their length on
// local z), the crown long since gone to the snow
function windthrow(spots: { x: number; z: number; rot: number }[]): void {
  const plates: WildSpot[] = [], logs: WildSpot[] = [];
  for (const s of spots) {
    plates.push({ x: s.x, z: s.z, rot: s.rot, scale: 1.0 });
    // local +z is (sin rot, cos rot): the trunk's middle 4.2 m out from the plate
    logs.push({ x: s.x + Math.sin(s.rot) * 4.2, z: s.z + Math.cos(s.rot) * 4.2, rot: s.rot, scale: 1.15 });
  }
  wildPlace("rootplate", plates, { snow: true });
  wildPlace("log", logs, { snow: true });
}

// THE RIME CUT. A ravine down which a stream used to come off the cliff
// coast; it froze one winter and never quite thawed. `cut` is the ravine's
// own polyline and `f(s)` its floor half-width at arc length s (the
// ravine()'s own wander, so pieces stand at the real wall foot). The frozen
// stream runs its floor; at the outside of the bend, where the water came
// over the lip, the fall hangs as ice against the wall.
export function rimeCut(cut: Pt[], floorHalf: (s: number) => number, fall: [number, number]): void {
  const l = line(cut);
  // walk the rounded centreline once, keeping (point, tangent) per metre
  const pts = l.pts, run: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    for (let t = 0; t < L; t += 2) run.push({ x: ax + (bx - ax) * t / L, z: az + (bz - az) * t / L, tx: (bx - ax) / L, tz: (bz - az) / L, s: s + t });
    s += L;
  }
  // THE FROZEN FALL: the kit's cliff slabs in ice on the bend's OUTSIDE
  // wall, faces in, the front of each on the floor's edge and its depth in
  // the bank, each as tall as its wall's measured drop. (The rest of the
  // walls are the rim's own rock, northroad.ts dressCliffs: kit slabs in the
  // peak stone down both walls read as pale sheets the same white as the
  // faceted terrain -- look 1 -- where the rim's crags read as rock.) Left of
  // travel is (-tz, tx); the bend turns left (north, then west), so the
  // outside is on the right, (tz, -tx).
  const ice: WildSpot[] = [];
  let lastS = -Infinity;
  for (const p of run) {
    if (p.s - lastS < 9 || Math.hypot(p.x - fall[0], p.z - fall[1]) > 16) continue;
    const nx = p.tz, nz = -p.tx;
    const f = floorHalf(p.s), off = f + 2.0;
    const drop = ground(p.x + nx * (f + 7), p.z + nz * (f + 7)) - ground(p.x, p.z);
    if (drop < 2.5) continue;
    lastS = p.s;
    // local +z (the face) = (sin rot, cos rot) = -(nx, nz); the slab is 8 m
    // tall and sinks 1.2 of it, so it stands (drop + 0.6) / 6.8 to the brow
    const sy = Math.min(1.5, (drop + 0.6) / 6.8);
    ice.push({ x: p.x + nx * off, z: p.z + nz * off, rot: Math.atan2(-nx, -nz), scale: 1.0, sy, sz: Math.min(1, sy) });
  }
  wildPlace("cliff", ice, { tint: ICE });
  // scree down the walls, and fallen pines along the floor's edge (laid along
  // the ravine, so the floor stays open down the middle)
  const along = run.filter((p) => p.s > 30 && p.s < l.len - 30 && Math.hypot(p.x - fall[0], p.z - fall[1]) > 20);
  const pick = (k: number) => along[Math.floor(k * (along.length - 1))];
  const throws: { x: number; z: number; rot: number }[] = [];
  // (not near the mouth: the first, at 0.12, lay across the view up the Cut
  // from its mouth -- look 1)
  for (const [k, side] of [[0.32, 1], [0.6, -1], [0.85, 1]] as [number, number][]) {
    const p = pick(k), off = floorHalf(p.s) - 2.2;
    // the trunk runs along the ravine: local +z along the tangent
    throws.push({ x: p.x + p.tz * off * side, z: p.z - p.tx * off * side, rot: Math.atan2(p.tx, p.tz) });
  }
  windthrow(throws);
  const rand = rng(62);
  const scree: WildSpot[] = [];
  for (let i = 0; i < 9; i++) {
    const p = pick(rand()), side = rand() < 0.5 ? 1 : -1, off = floorHalf(p.s) + 0.5;
    scree.push({ x: p.x + p.tz * off * side, z: p.z - p.tx * off * side, rot: rand() * 6.3, scale: 0.9 + rand() * 0.5 });
  }
  wildPlace("scree", scree, { tint: STONE, snow: true });
}

// THE COAST WATCH. The empire watched the cold sea from the headland: a post
// of two walls against the sea wind, its door an arch, a corner where the
// stair was, the column that held the roof fallen to drums, and the beacon's
// cairn on the brow above the cliff. `c` is the post's middle; the sea is
// north. The landmark itself (the brow, 20 m on) is kept bare.
export function coastWatch(c: Pt): void {
  const [x, z] = c;
  // the north wall, to the sea, broken in the middle by the arch; the west wall
  // (at 1.3-1.4x: at the kit's own size the post read as rubble from 40 m)
  wildPlace("ruin_wall", [{ x: x - 7.5, z: z + 5, rot: 0.08, scale: 1.3 }, { x: x + 8, z: z + 5.6, rot: 0.08, scale: 1.3 }]);
  wildPlace("arch", [{ x: x + 0.3, z: z + 5.3, rot: 0.08, scale: 1.4 }]);
  wildPlace("ruin_wall", [{ x: x - 12, z: z - 1.5, rot: Math.PI / 2 + 0.08, scale: 1.3 }]);
  wildPlace("ruin_corner", [{ x: x + 11, z: z - 3, rot: -0.3, scale: 1.3 }]);
  wildPlace("column", [{ x: x - 3, z: z - 4, rot: 0.6 }]);
  wildPlace("drums", [{ x: x + 3, z: z - 1, rot: 1.4 }, { x: x + 5.5, z: z - 6, rot: 0.2, scale: 0.85 }]);
  // the beacon cairn on the brow, seaward of the arch
  wildPlace("cairn", [{ x: x + 2, z: z + 14, rot: 0.3, scale: 1.4 }], { tint: STONE, snow: true });
  // three stones that marked the way up from the road, leaning with the frost
  wildPlace("standing_stone", [
    { x: x + 16, z: z - 14, rot: 0.4, lean: 0.1, leanX: 1, leanZ: 0.4 },
    { x: x + 24, z: z - 22, rot: 1.1 },
    { x: x + 32, z: z - 27, rot: 0.7, lean: 0.16, leanX: -0.3, leanZ: 1 },
  ], { tint: STONE, snow: true });
  wildPlace("outcrop", [{ x: x - 24, z: z + 4, rot: 2.1, scale: 1.2 }, { x: x + 22, z: z + 9, rot: 0.6 }], { tint: STONE, snow: true });
  wildScatter("scree", { circle: [x, z, 34] }, { count: 5, tint: STONE, snow: true, seed: 71, avoid: [[x, z, 14]] });
}

// THE MILESTONE RISE. The empire's road ran along this crest before the road
// was moved down to the valley; its bed is a ribbon (northroad.ts), its
// stones are in a row on it, and the moor round them is open, its rock showing.
export function milestoneRise(stones: Pt[]): void {
  const [x0] = stones[0], [x1] = stones[stones.length - 1];
  const mx = (x0 + x1) / 2, mz = stones.reduce((a, s) => a + s[1], 0) / stones.length;
  // a cairn at the west end, where the old road came up from the inn
  wildPlace("cairn", [{ x: x0 - 14, z: mz - 4, rot: 0.9, scale: 1.1 }], { tint: STONE, snow: true });
  wildPlace("tor", [{ x: mx + 6, z: mz + 22, rot: 0.5, scale: 1.1 }, { x: x1 + 12, z: mz + 16, rot: 2.2, scale: 0.9 }], { tint: STONE, snow: true });
  wildScatter("boulder", { rect: [x0 - 20, mz - 20, x1 + 20, mz + 26] }, { count: 9, tint: STONE, snow: true, seed: 82, clump: { n: [2, 3], r: 4 },
    avoid: stones.map(([sx, sz]) => [sx, sz, 6] as Circle) });
}

// THE WOLD. Philip's table south of the road (northroad.ts PLATEAU): high
// enough to keep its own weather. Tors break its rim where the cliff is, a
// dark stand of pines grows in its lee, the wind has thrown a few of them,
// and the gloamwolves den in the roots of the biggest. `keep` are the camps'
// hearts, the ramps and the nodes, kept open.
export function theWold(poly: Pt[], den: Pt, keep: Circle[]): void {
  // the tors: hand-placed 6-10 m in from the cliff edge, never at a ramp
  wildPlace("tor", [
    { x: -192, z: -86, rot: 0.4, scale: 1.25 }, { x: -166, z: -142, rot: 1.9, scale: 1.05 },
    { x: -145, z: -162, rot: 2.6, scale: 1.15 }, { x: -62, z: -190, rot: 0.9, scale: 1.0 },
    { x: 8, z: -205, rot: 1.6, scale: 1.2 }, { x: 46, z: -150, rot: 0.2, scale: 1.0 },
    { x: 18, z: -95, rot: 2.9, scale: 0.9 },
  ], { tint: STONE, snow: true });
  wildPlace("outcrop", [
    { x: -60, z: -120, rot: 0.7, scale: 1.2 }, { x: -20, z: -152, rot: 2.0, scale: 1.0 }, { x: -150, z: -95, rot: 1.2, scale: 1.1 },
  ], { tint: STONE, snow: true });
  // the stand: dark pines in the table's middle, on the scatter's own
  // templates and tint (northroad.ts's second scatter), so no new pool
  const rand = rng(91), pines: { x: number; z: number; scale: number; rot: number }[] = [];
  const clear = (x: number, z: number) => keep.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r);
  for (let i = 0; i < 400 && pines.length < 34; i++) {
    const x = -150 + rand() * 170, z = -200 + rand() * 120;
    // a stand, not a sprinkle: thickest round (-60, -150), thinning out
    if (rand() > 1 - Math.hypot(x + 60, z + 150) / 110) continue;
    if (polySignedDist(poly, x, z) < 14 || !clear(x, z)) continue;
    if (pines.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
    pines.push({ x, z, scale: 1.4 + rand() * 0.7, rot: rand() * 6.3 });
  }
  placeExact("nature/Pine_2.gltf", pines.filter((_, i) => i % 2 === 0), 0.8, { tint: "#94a8a0", snowCaps: "abs" });
  placeExact("nature/Pine_4.gltf", pines.filter((_, i) => i % 2 === 1), 0.8, { tint: "#94a8a0", snowCaps: "abs" });
  // the den: the biggest windthrow, two more beside it, bramble in the roots
  const [dx, dz] = den;
  windthrow([{ x: dx, z: dz, rot: 0.6 }, { x: dx - 9, z: dz + 6, rot: 2.3 }, { x: dx + 7, z: dz - 8, rot: 4.4 },
    { x: -40, z: -175, rot: 1.0 }, { x: -130, z: -150, rot: 5.2 }]);
  wildScatter("bramble", { circle: [dx, dz, 12] }, { count: 7, color: "ash", seed: 92, avoid: [[dx, dz, 3]] });
  wildScatter("stump", { circle: [-60, -150, 60] }, { count: 10, seed: 93, snow: true, avoid: keep });
}

// THE UPLAND'S DRESSING. Rock in snow-capped clumps (the theme's generic
// boulders are mostly gone: from the overview they read as snowballs on a
// sheet), logs and stumps where the pines are, winter scrub at the stands'
// edges. `camps` keep their hearts.
export function upland(camps: Circle[], clearings: Circle[]): void {
  const avoid = [...camps, ...clearings];
  wildScatter("boulder", "zone", { count: 80, tint: STONE, snow: true, seed: 101, clump: { n: [2, 4], r: 6 }, avoid });
  wildScatter("log", "zone", { count: 22, snow: true, seed: 102, avoid });
  wildScatter("stump", "zone", { count: 26, snow: true, seed: 103, clump: { n: [2, 4], r: 7 }, avoid });
  wildScatter("shrub", "zone", { count: 50, color: "dark", seed: 104, clump: { n: [2, 4], r: 5 }, avoid });
  wildScatter("bramble", "zone", { count: 28, color: "ash", seed: 105, clump: { n: [2, 3], r: 4 }, avoid });
  // the tarn's south bank, under the crescent: rock falls off the slope
  wildScatter("boulder", { circle: [150, -150, 40] }, { count: 10, tint: STONE, snow: true, seed: 107, clump: { n: [2, 3], r: 5 }, avoid });
}

