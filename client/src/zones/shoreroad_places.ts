// The Shore Road's places worth leaving the road for, and the dressing that
// makes the coast's hinterland read as downs rather than a lawn, laid with the
// wild nature kit (wild-nature.ts). shoreroad.ts owns the layout and the
// ground; it calls these from build() AFTER the roads, the brook and the
// buildings, so every scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are few on purpose -- one sandstone tint for every stone, the
// ruins' own ashlar, two flower colours (yellow on the downs, white on the
// combe's banks), one heather (sea pinks), olive leaves. About 17 pools,
// ~40 main-pass draws at worst whatever the counts.
import { wildPlace, wildScatter } from "../wild-nature";
import { polySignedDist } from "../scene";
import { rng, type Pt } from "../wild-terrain";

// the kit stones' one tint: the theme's warm sandstone (rockTint), so a
// boulder on the downs and a stack in the bay are the coast's own stone
const STONE = "#b0a284";

type Circle = [number, number, number];

// THE SALT COMBE's banks: reed beds at the waterline, white flowers and fern
// on the banks, olive scrub where it bends, and in the ravine a log the
// brook brought down, lodged across it. `brook` is the WOUND course.
export function combeBanks(brook: Pt[], camps: Circle[]): void {
  const xs = brook.map((p) => p[0]), zs = brook.map((p) => p[1]);
  const rect: [number, number, number, number] = [Math.min(...xs) - 30, Math.min(...zs) - 10, Math.max(...xs) + 30, Math.max(...zs) + 10];
  wildScatter("reeds", { rect }, { density: 60, nearWater: 3.5, color: "olive", seed: 11, clump: { n: [3, 6], r: 4 } });
  wildScatter("wildflowers", { rect }, { density: 1.4, nearWater: 12, color: "white", seed: 12, clump: { n: [3, 6], r: 5 }, avoid: camps });
  wildScatter("fern_bed", { rect }, { density: 0.9, nearWater: 9, color: "olive", seed: 13, clump: { n: [2, 3], r: 4 } });
  wildScatter("shrub", { rect }, { density: 0.25, nearWater: 16, color: "olive", seed: 14, avoid: camps });
  // the lodged log, a third of the way down the ravine, square across the water
  const i = Math.floor(brook.length * 0.12);
  const [ax, az] = brook[i], [bx, bz] = brook[i + 1];
  const along = Math.atan2(bz - az, bx - ax);
  // the log lies along its local z: rot turns local +x to (cos t, -sin t), so
  // local +z goes to (sin t, cos t); square across the water is the course's
  // own direction rotated a quarter turn
  wildPlace("log", [{ x: ax, z: az, rot: -along, scale: 1.3, yOff: 0.3 }], { collide: false });
}

// GULL TOR. A granite knoll on the downs above the halt: tors breaking its
// crown, the gulls' white on them, and a cairn on the south brow where the
// footpath arrives, looking down on the halt and across the bay to the wreck.
export function gullTor(c: Pt): void {
  const [x, z] = c;
  wildPlace("tor", [
    // 1.4x read as boulders from the halt (look 1): the crown wants 6-9 m
    { x: x + 7, z: z + 9, rot: 0.6, scale: 1.95 },
    { x: x - 9, z: z + 5, rot: 2.2, scale: 1.6 },
    { x: x + 1, z: z + 17, rot: 1.3, scale: 1.3 },
  ], { tint: STONE });
  wildPlace("outcrop", [{ x: x + 20, z: z - 4, rot: 0.9, scale: 1.2 }, { x: x - 22, z: z + 12, rot: 2.6, scale: 1.0 }], { tint: STONE });
  wildPlace("cairn", [{ x: x - 4, z: z - 6, rot: 0.4, scale: 1.25 }], { tint: STONE });
  wildScatter("scree", { circle: [x, z, 40] }, { count: 6, tint: STONE, seed: 21, avoid: [[x, z, 24]] });
  wildScatter("heather", { circle: [x, z, 34] }, { density: 2.2, color: "pink", seed: 22, clump: { n: [2, 4], r: 4 }, avoid: [[x, z, 10]] });
}

// THE WATCH'S CURTAIN. The old watch stood in a ring wall on the headland;
// the sea wind has had most of it. Broken runs on a 16 m ring, a corner where
// the store stood, and the gate arch still standing over the lane where it
// comes in from the north, a column and its fallen drums inside. `fork` is
// where the lane leaves the road, so the gate faces down it.
export function watchCurtain(c: Pt, fork: Pt): void {
  const [x, z] = c;
  const R = 16;
  // the lane's bearing from the watch: the gate stands on it
  const gate = Math.atan2(fork[1] - z, fork[0] - x);
  const runs: { x: number; z: number; rot: number; scale: number }[] = [];
  const rand = rng(71);
  // the ring's runs, their gaps where the wall fell; none within 0.5 rad of the gate
  for (const off of [0.75, 1.15, 1.95, 2.35, 2.75, 3.6, 4.0, 4.9, 5.3]) {
    const a = gate + off;
    runs.push({ x: x + Math.cos(a) * R, z: z + Math.sin(a) * R, rot: -(a + Math.PI / 2), scale: 0.95 + rand() * 0.25 });
  }
  wildPlace("ruin_wall", runs);
  const ac = gate + 3.15;
  wildPlace("ruin_corner", [{ x: x + Math.cos(ac) * (R - 2), z: z + Math.sin(ac) * (R - 2), rot: -(ac + Math.PI / 2) }]);
  // the gate arch: its piers along local x, square across the lane
  const gx = x + Math.cos(gate) * R, gz = z + Math.sin(gate) * R;
  wildPlace("arch", [{ x: gx, z: gz, rot: -(gate + Math.PI / 2), scale: 1.6 }]);
  const cc = gate - 0.9;
  wildPlace("column", [{ x: x + Math.cos(cc) * 10, z: z + Math.sin(cc) * 10, rot: 0.3 }]);
  wildPlace("drums", [{ x: x + Math.cos(cc + 0.5) * 11, z: z + Math.sin(cc + 0.5) * 11, rot: 1.2 }]);
}

// THE OLD MEN. Three sandstone stacks standing off the headland's sea cliff,
// the stone the sea took the land from: the kit's tor at 2.2-2.8x (10-13 m),
// stood on the sea floor where the water is already deep. `seaward` is the
// ocean's one coastline definition: each stack walks out from its mark on the
// cliff until it stands 16 m+ out to sea.
export function oldMen(seaward: (x: number, z: number) => number): void {
  const marks: [number, number, number, number][] = [
    // [x, z on the cliff, outward bearing x, z]
    [236, -112, 0.35, -0.94], [272, -88, 0.55, -0.83], [306, -50, 0.8, -0.6],
  ];
  const spots: { x: number; z: number; rot: number; scale: number }[] = [];
  marks.forEach(([x0, z0, dx, dz], i) => {
    let x = x0, z = z0;
    for (let k = 0; k < 80 && seaward(x, z) < 16 + i * 6; k++) { x += dx; z += dz; }
    // 2.2-2.8x read as one more boulder on the horizon (look 1): 12-16 m now
    spots.push({ x, z, rot: 0.7 + i * 1.9, scale: 3.4 - i * 0.4 });
  });
  wildPlace("tor", spots, { tint: STONE, collide: false });
}

// THE STRAND'S WRACK: driftwood along the lower beach of the bays, where the
// tide leaves it. `ring` and `centre` are the beach's waterline by bearing;
// `ok(x, z)` vetoes a spot (roads, the wreck, the hut).
export function wrack(ring: (number | null)[], centre: [number, number], ok: (x: number, z: number) => boolean): void {
  const rand = rng(81);
  const [cx, cz] = centre;
  const logs: { x: number; z: number; rot: number; scale: number }[] = [];
  for (let deg = 0; deg < 360; deg += 7) {
    const r0 = ring[deg];
    if (r0 == null || rand() < 0.45) continue;
    const a = (deg * Math.PI) / 180, r = r0 - 3 - rand() * 7;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.abs(x) > 330 || Math.abs(z) > 330 || !ok(x, z)) continue;
    logs.push({ x, z, rot: rand() * 6.3, scale: 0.8 + rand() * 0.4 });
  }
  wildPlace("log", logs, { collide: false, tint: "#b8ac98" });
}

// THE DOWNS: drifts of yellow through the hinterland, sandstone boulders in
// clumps (in place of the theme's generic grey ones), olive scrub, and sea
// pinks on the headland's table.
export function downs(camps: Circle[], keep: Circle[], headland: Pt[]): void {
  const avoid = [...camps, ...keep];
  wildScatter("wildflowers", "zone", { density: 0.28, color: "yellow", seed: 61, clump: { n: [3, 7], r: 9 }, avoid });
  wildScatter("boulder", "zone", { count: 30, tint: STONE, seed: 62, clump: { n: [1, 3], r: 6 }, avoid, inset: 40 });
  wildScatter("shrub", "zone", { count: 36, color: "olive", seed: 64, clump: { n: [1, 3], r: 5 }, avoid });
  wildScatter("heather", { poly: headland }, { density: 0.9, color: "pink", seed: 63, clump: { n: [3, 6], r: 7 }, avoid });
  // the headland's seaward brow breaks in outcrops
  const brow: { x: number; z: number; rot: number; scale: number }[] = [];
  for (const [x, z, rot] of [[178, -96, 0.4], [250, -80, 2.1], [292, -40, 1.2]] as [number, number, number][]) {
    if (polySignedDist(headland, x, z) > 8) brow.push({ x, z, rot, scale: 1.2 });
  }
  wildPlace("outcrop", brow, { tint: STONE });
}
