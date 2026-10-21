// The Caerdun Fields' places worth walking to, and the dressing that makes the
// farm country read as a countryside rather than a lawn, laid with the wild
// nature kit (wild-nature.ts). caerdunfields.ts owns the layout and the
// ground; it calls these from build() AFTER the roads, the brook and the
// buildings, so every scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are few on purpose -- one granite tint for every stone, the ruins'
// own ashlar, two flower colours (yellow in the meadows, white on the brook's
// banks) and one heather. About 19 pools, ~45 main-pass draws at worst
// whatever the counts.
import { placeExact } from "../scene";
import { wildPlace, wildScatter } from "../wild-nature";
import { rng, type Pt } from "../wild-terrain";

// the kit stones' one tint: the card's granite (#8b8f96) pulled a shade warm,
// so a boulder sits in a warm morning field rather than reading blue
const STONE = "#8f948c";
// the kit's violet heather reads loud blue-purple on a green field (the
// Hunting Wood's look 1); a grey-mauve multiply takes it back to heather
const HEATHER = "#b8a8b0";

type Circle = [number, number, number];

// THE MILE STONES. The empire measured every road from Milestone Zero, and
// set a stone at every hundred metres of it: a waymarker beside each of the
// three imperial roads out of zero, on the right of the traveller leaving it,
// facing the road. `clear(x, z)` vetoes a spot (the brook, a junction).
export function mileStones(roads: Pt[][], clear: (x: number, z: number) => boolean): void {
  const spots: { x: number; z: number; rot: number }[] = [];
  for (const pts of roads) {
    let run = 0, next = 100;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      while (next <= run + L) {
        const t = next - run;
        // right of travel is (uz, -ux) with +x east and +z north; 5.2 m
        // clears a 3.4 m road with the stone's footprint
        const x = ax + ux * t + uz * 5.2, z = az + uz * t - ux * 5.2;
        if (clear(x, z)) spots.push({ x, z, rot: -Math.atan2(uz, ux) });
        next += 100;
      }
      run += L;
    }
  }
  wildPlace("waymarker", spots);
}

// THE REED BROOK's banks: reed beds at the waterline, white flowers and fern
// on the banks, a few shrubs where it bends. `rect` bounds the brook.
export function reedBrook(rect: [number, number, number, number], camps: Circle[]): void {
  wildScatter("reeds", { rect }, { density: 9, nearWater: 3.5, color: "olive", seed: 11, clump: { n: [3, 6], r: 4 } });
  wildScatter("wildflowers", { rect }, { density: 1.6, nearWater: 12, color: "white", seed: 12, clump: { n: [3, 6], r: 5 }, avoid: camps });
  wildScatter("fern_bed", { rect }, { density: 0.7, nearWater: 9, color: "dark", seed: 13, clump: { n: [2, 3], r: 4 } });
  wildScatter("shrub", { rect }, { density: 0.25, nearWater: 14, color: "green", seed: 14, avoid: camps });
}

// BEACON KNOLL. The imperial watch kept a beacon on the granite crag under the
// crescent, to signal the city when the North Road was cut: a post of two
// walls against the north wind, a corner, a column (its fellow fallen to
// drums), and the beacon's cairn at the brow facing the city. The freebooter
// scouts squat in it now. `c` is the knoll top's centre; the path from the
// ramp arrives at its south brow.
export function beaconKnoll(c: Pt): void {
  const [x, z] = c;
  wildPlace("ruin_wall", [
    { x: x - 3, z: z + 12, rot: 0.15 },
    { x: x + 3, z: z + 13, rot: 0.15 },
  ]);
  wildPlace("ruin_corner", [{ x: x + 8.5, z: z + 11, rot: -0.2 }]);
  wildPlace("ruin_wall", [{ x: x - 9.5, z: z + 7, rot: Math.PI / 2 + 0.2 }]);
  wildPlace("column", [{ x: x + 7, z: z + 3, rot: 0.4 }]);
  wildPlace("drums", [{ x: x + 2, z: z - 2, rot: 1.1 }, { x: x - 2, z: z + 4, rot: 2.6, scale: 0.8 }]);
  // the beacon cairn on the western brow, toward Caerdun
  wildPlace("cairn", [{ x: x - 18, z: z - 2, rot: 0.6, scale: 1.3 }]);
  // the crag breaks the top in outcrops, and scree lies at the cliff foot
  wildPlace("outcrop", [{ x: x + 22, z: z + 6, rot: 0.9, scale: 1.3 }, { x: x - 22, z: z + 10, rot: 2.3, scale: 1.1 }], { tint: STONE });
  wildScatter("scree", { circle: [x, z, 44] }, { count: 7, tint: STONE, seed: 21, avoid: [[x, z, 30]] });
  wildScatter("heather", { circle: [x, z, 26] }, { density: 3, color: "violet", tint: HEATHER, seed: 22, clump: { n: [2, 4], r: 4 }, avoid: [[x, z, 12]] });
}

// THE STONE RING on the South Downs: older than the empire, older than the
// roads it measured. Nine stones on the crown of the highest down, a gap to
// the north where the way in was, two leaning with the frost; heather all
// round it.
export function stoneRing(c: Pt): void {
  const [x, z] = c;
  const rand = rng(31);
  const stones: { x: number; z: number; rot: number; scale: number; lean?: number; leanX?: number; leanZ?: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i + 0.5) * (Math.PI * 2 / 11);   // eleven places, the one due north left empty
    const sx = x + Math.cos(a) * 10, sz = z + Math.sin(a) * 10;
    // each faces the centre, as a ring's stones do: local +x along the circle
    const s: typeof stones[number] = { x: sx, z: sz, rot: -Math.atan2(Math.cos(a), -Math.sin(a)), scale: 1.15 + rand() * 0.35 };
    if (i === 2 || i === 7) Object.assign(s, { lean: 0.16, leanX: Math.cos(a), leanZ: Math.sin(a) });
    stones.push(s);
  }
  wildPlace("standing_stone", stones, { tint: STONE });
  wildScatter("heather", { circle: [x, z, 48] }, { density: 2.4, color: "violet", tint: HEATHER, seed: 32, clump: { n: [3, 6], r: 6 }, avoid: [[x, z, 13]] });
  wildPlace("boulder", [{ x: x + 24, z: z - 8, rot: 0.4, scale: 1.3 }, { x: x - 21, z: z + 15, rot: 1.9, scale: 1.0 }], { tint: STONE });
}

// BRISTLE'S COPSE: the stand of pines at the south-east meadow's edge where
// Old Bristle beds, its floor fern and bramble, a fallen pine across it. The
// camp's heart (`camp`) stays open ground; the copse closes behind it, to the
// south and east, so the meadow "meets the pines" there.
export function bristlesCopse(c: Pt, camp: Circle): void {
  const [x, z] = c;
  const rand = rng(41);
  const pines: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 40 && pines.length < 16; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 30;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (Math.hypot(px - camp[0], pz - camp[1]) < camp[2]) continue;
    if (pines.some((p) => Math.hypot(p.x - px, p.z - pz) < 6.5)) continue;
    pines.push({ x: px, z: pz, scale: 1.3 + rand() * 0.6, rot: rand() * 6.3 });
  }
  placeExact("nature/Pine_3.gltf", pines.filter((_, i) => i % 2 === 0), 0.8);
  placeExact("nature/Pine_1.gltf", pines.filter((_, i) => i % 2 === 1), 0.8);
  const avoid: Circle[] = [[camp[0], camp[1], camp[2] - 4], ...pines.map((p) => [p.x, p.z, 1.6] as Circle)];
  wildScatter("fern_bed", { circle: [x, z, 32] }, { density: 4, color: "dark", seed: 42, clump: { n: [2, 4], r: 5 }, avoid });
  wildScatter("bramble", { circle: [x, z, 32] }, { count: 7, color: "green", seed: 43, avoid });
  wildPlace("log", [{ x: x + 9, z: z - 6, rot: 0.9, scale: 1.2 }], { collide: false });
  wildPlace("rootplate", [{ x: x + 9 - Math.sin(0.9) * 4, z: z - 6 - Math.cos(0.9) * 4, rot: 0.9 + Math.PI, scale: 1.0 }], { collide: false });
}

// THE PINE BREAKS' FLOOR: shrubs and bramble along each windbreak row, so a
// break reads as a hedge with pines in it, and one stretch of the south break
// felled for the farms' winter -- stumps in the line, the logs stacked off it.
export function breaksFloor(rows: [number, number, number, number][], felled: Pt, camps: Circle[]): void {
  const rand = rng(51);
  const shrubs: { x: number; z: number; rot: number; scale: number }[] = [];
  for (const [x0, z0, x1, z1] of rows) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    for (let t = 5; t < L; t += 9 + rand() * 5) {
      const s = rand() < 0.5 ? -1 : 1;
      shrubs.push({ x: x0 + ux * t - uz * s * 3.4, z: z0 + uz * t + ux * s * 3.4, rot: rand() * 6.3, scale: 0.9 + rand() * 0.4 });
    }
  }
  // a shrub is a plant (no collider); the scatter's checks are skipped for
  // exact spots, so drop the ones that landed in a camp's heart or a road
  wildPlace("shrub", shrubs.filter((p) => !camps.some(([cx, cz, r]) => Math.hypot(p.x - cx, p.z - cz) < r)), { color: "green" });
  for (const [x0, z0, x1, z1] of rows) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.hypot(x1 - x0, z1 - z0) / 2 + 6;
    wildScatter("bramble", { circle: [cx, cz, r] }, { count: 5, color: "green", seed: 52 + Math.round(cx), avoid: camps });
  }
  const [fx, fz] = felled;
  wildPlace("stump", [
    { x: fx, z: fz, rot: 0.3 }, { x: fx + 7, z: fz - 2.6, rot: 1.4, scale: 1.1 }, { x: fx + 14, z: fz - 5.4, rot: 2.2, scale: 0.9 },
    { x: fx + 21, z: fz - 8.1, rot: 0.8 },
  ]);
  // the logs stacked three and two, along the break
  wildPlace("log", [
    { x: fx + 6, z: fz + 6, rot: 1.95, scale: 1.0 }, { x: fx + 7.2, z: fz + 8.6, rot: 1.95, scale: 1.0 }, { x: fx + 8.4, z: fz + 11.2, rot: 1.95, scale: 1.0 },
    { x: fx + 6.6, z: fz + 7.3, rot: 1.95, scale: 0.95, yOff: 0.7 }, { x: fx + 7.8, z: fz + 9.9, rot: 1.95, scale: 0.95, yOff: 0.7 },
  ]);
}

// THE MEADOWS: drifts of yellow through the whole field, the odd granite
// boulder in clumps (the kit's, in the card's granite, in place of the
// theme's generic grey ones), heather on the higher ground in the east.
export function meadows(camps: Circle[], keep: Circle[]): void {
  const avoid = [...camps, ...keep];
  wildScatter("wildflowers", "zone", { density: 0.32, color: "yellow", seed: 61, clump: { n: [3, 7], r: 9 }, avoid });
  wildScatter("boulder", "zone", { count: 34, tint: STONE, seed: 62, clump: { n: [1, 3], r: 6 }, avoid, inset: 40 });
  wildScatter("heather", { rect: [150, -170, 300, 100] }, { density: 0.5, color: "violet", tint: HEATHER, seed: 63, clump: { n: [3, 6], r: 7 }, avoid });
  wildScatter("shrub", "zone", { count: 40, color: "green", seed: 64, clump: { n: [1, 3], r: 5 }, avoid });
}
