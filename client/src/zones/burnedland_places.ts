// The Burned Land's places worth walking to, and its ash floor, laid with the
// wild nature kit (wild-nature.ts) and the crystal pack's amber glass.
// burnedland.ts owns the layout and the ground; it calls these from build()
// AFTER the roads and buildings, so every scatter's keep-clear check can read
// them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are kept few on purpose -- one stone tint (the rim's ash grey), one
// char tint for the wood, the ruins' own ashlar, dead "ash" scrub inside the
// fire line and "autumn" scrub and pink fireweed past it. ~18 pools, ~45
// main-pass draws at worst whatever the counts. The amber glass is the same
// file + tint as the trunks' shards and the orchard's sheets, so it joins
// their templates.
import { placeExact, ground, scatterBlocked, polySignedDist } from "../scene";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { rng, type Pt } from "../wild-terrain";

const STONE = "#8e8a84";     // the rim's ash grey: the boulders read as the rim's own stone
const CHAR = "#3e3a36";      // the stumps' wood, charred
const AMBER = "#c8a860";     // the melt's glass (the same tint as every other shard: one template)
const GLASS = "crystal/big_crystal.glb";

type Spot = { x: number; z: number; scale: number; rot: number; yOff?: number; lean?: number; leanX?: number; leanZ?: number };

// walk a polyline every `step` metres, handing the point and the unit
// direction there
function along(pts: Pt[], step: number, cb: (x: number, z: number, ux: number, uz: number, s: number) => void): void {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let t = i === 0 ? 0 : step - (s % step); t < L; t += step) cb(ax + ux * t, az + uz * t, ux, uz, s + t);
    s += L;
  }
}
const slope = (x: number, z: number): number => {
  const g = ground(x, z);
  return Math.max(Math.abs(ground(x + 1.2, z) - g), Math.abs(ground(x, z + 1.2) - g)) / 1.2;
};

// THE MELT RIDGE'S GLASS. The melt ran out from the city and piled against
// the ridge: upright amber along the crest, and down the west flank (the
// side that faced the flash) half-sunk shards like a flow that set as it
// ran. Kept out of the saddle, where the road and the fort are.
export function glassFlows(crest: Pt[], saddle: [number, number, number]): void {
  const rand = rng(301);
  const top: Spot[] = [], flank: Spot[] = [];
  along(crest, 7, (x, z, ux, uz) => {
    if (Math.hypot(x - saddle[0], z - saddle[1]) < saddle[2]) return;
    // the flank's side: the normal that points back toward the city
    let nx = -uz, nz = ux;
    if (nx * -x + nz * -z < 0) { nx = -nx; nz = -nz; }
    if (rand() < 0.7) top.push({ x: x + (rand() - 0.5) * 4, z: z + (rand() - 0.5) * 4, scale: 1.2 + rand() * 1.6, rot: rand() * 6.3 });
    for (let k = 0; k < 2; k++) {
      const d = 6 + rand() * 12;
      flank.push({ x: x + nx * d + ux * (rand() - 0.5) * 5, z: z + nz * d + uz * (rand() - 0.5) * 5, scale: 0.9 + rand() * 1.3, rot: rand() * 6.3, yOff: -0.6,
        lean: 0.5, leanX: nx, leanZ: nz });
    }
  });
  placeExact(GLASS, top, 1.2, { tint: AMBER, flat: true });
  placeExact(GLASS, flank, 0.9, { tint: AMBER, flat: true });
  // scree where the flank is steepest, and a few boulders at its foot
  const box = crest.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
  const area = { rect: [box[0] - 26, box[1], box[2] + 22, box[3]] as [number, number, number, number] };
  const avoid: [number, number, number][] = [saddle];
  wildScatter("scree", area, { count: 16, seed: 302, tint: STONE, avoid });
  wildScatter("boulder", area, { count: 18, seed: 303, tint: STONE, avoid, scale: [0.8, 1.6] });
  wildScatter("tor", area, { count: 4, seed: 304, tint: STONE, avoid, maxSlope: 0.5 });
}

// THE BEACON OUTWORK. The fort's outwork on the crag at the ridge's south
// end, where the night's watch stood: an arch on the north-west edge framing
// the capital, its broken curtain round the south and east, a column still
// up and one in drums, a waymarker where the crest path arrives. The table
// is level (burnedland.ts OUTWORK_TOP); `c` is its centre.
export function outwork(c: Pt): void {
  const [x, z] = c;
  // toward the walls: the arch's opening faces along it, its piers across it
  const L = Math.hypot(x, z), dx = -x / L, dz = -z / L;
  const rot = Math.atan2(-dx, -dz);     // local +x -> (cos rot, -sin rot) = across the view
  wildPlace("arch", [{ x: x + dx * 8, z: z + dz * 8, rot }]);
  wildLine("ruin_wall", [[x - 10, z - 7], [x - 1, z - 11], [x + 9, z - 8], [x + 12, z + 1]], { face: "left", seed: 311 });
  wildPlace("ruin_corner", [{ x: x - 12, z: z - 3, rot: 0.6 }]);
  wildPlace("column", [{ x: x + 5, z: z + 4, rot: 0.2 }, { x: x - 6, z: z + 6, rot: 1.0, lean: 0.07, leanX: dx, leanZ: dz }]);
  wildPlace("drums", [{ x: x + 2, z: z - 4, rot: 0.9 }, { x: x - 3, z: z - 2, rot: 2.4, scale: 0.8 }]);
  wildPlace("waymarker", [{ x: x + 4, z: z + 11, rot: 0.3 }]);
  wildPlace("cairn", [{ x: x - 4, z: z + 12, rot: 1.1 }]);
  // the melt reached even here: a few shards in the outwork's lee
  placeExact(GLASS, [{ x: x + 9, z: z - 4, scale: 1.1, rot: 0.4 }, { x: x - 8, z: z - 9, scale: 0.9, rot: 2.0 }], 0.8, { tint: AMBER, flat: true });
}

// THE SCAR. The ground split in the heat: a ravine with glass seams in its
// walls, boulders on its floor, scree at the walls' feet,
// a cairn at each end and a lookout of standing stones on its east lip. The
// glimmer ore lies bared on the floor at `ore` (zones.json node_bl_ore2).
export function scarDressing(pts: Pt[], ore: Pt): void {
  const rand = rng(321);
  const seams: Spot[] = [];
  along(pts, 9, (x, z, ux, uz, s) => {
    if (s < 18) return;
    const nx = -uz, nz = ux;
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const d = 9 + rand() * 2;
      seams.push({ x: x + nx * side * d, z: z + nz * side * d, scale: 1.0 + rand() * 1.2, rot: rand() * 6.3, yOff: -1.2, lean: 0.6, leanX: -nx * side, leanZ: -nz * side });
    }
  });
  placeExact(GLASS, seams, 0, { tint: AMBER, flat: true });
  const floor = pts.slice(1, -1).map(([x, z]) => [x, z, 7] as [number, number, number]);
  const avoid: [number, number, number][] = [[ore[0], ore[1], 6]];
  for (const [i, [x, z, r]] of floor.entries()) {
    wildScatter("boulder", { circle: [x, z, r] }, { count: 3, seed: 330 + i, tint: STONE, avoid, scale: [0.7, 1.3] });
    wildScatter("scree", { circle: [x, z, r + 4] }, { count: 2, seed: 340 + i, tint: STONE, avoid, maxSlope: 0.9 });
  }
  // a cairn at each end, where the path goes in
  const [a0, a1] = [pts[0], pts[pts.length - 1]];
  wildPlace("cairn", [{ x: a0[0] + 8, z: a0[1] + 6, rot: 0.3 }, { x: a1[0] + 9, z: a1[1] - 2, rot: 1.7 }]);
  // the lookout: three standing stones on the east lip, over the middle
  const [mx, mz] = pts[2], [px, pz] = pts[1];
  let nx = -(mz - pz), nz = mx - px; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
  if (nx < 0) { nx = -nx; nz = -nz; }   // east
  const lx = mx + nx * 19, lz = mz + nz * 19;
  wildPlace("standing_stone", [
    { x: lx, z: lz, rot: 0.2, scale: 1.2 },
    { x: lx + nz * 4, z: lz - nx * 4, rot: 1.4, lean: 0.12, leanX: -nx, leanZ: -nz },
    { x: lx - nz * 4.5, z: lz + nx * 4.5, rot: 2.6, scale: 0.9 },
  ], { tint: STONE });
}

// THE ASH DRIFTS. The wind off the flash laid the ash in dunes: amber glass
// breaking out of the crests, dead scrub and scree in the troughs between.
export function drifts(lines: Pt[][]): void {
  const rand = rng(351);
  const glass: Spot[] = [];
  for (const l of lines) along(l, 11, (x, z) => {
    if (rand() < 0.55) glass.push({ x: x + (rand() - 0.5) * 3, z: z + (rand() - 0.5) * 3, scale: 0.7 + rand() * 0.9, rot: rand() * 6.3, yOff: -0.3 });
  });
  placeExact(GLASS, glass, 0.8, { tint: AMBER, flat: true });
  lines.forEach((l, i) => {
    const [x, z] = l[1];
    wildScatter("shrub", { circle: [x, z, 34] }, { count: 14, seed: 360 + i, color: "ash", clump: { n: [2, 4], r: 5 }, maxSlope: 0.5 });
    wildScatter("scree", { circle: [x, z, 30] }, { count: 3, seed: 370 + i, tint: STONE });
  });
}

// THE FIRE LINE. The band under the rim where the burn stopped, `reach(x,z)`
// metres in from the plate's edge and as ragged: past it the land survived
// -- fireweed (the pink wildflowers) in drifts, scorched autumn scrub, and a
// few birches still in leaf, leaning outward like everything else here.
// Laid as one quad per edge of the plate's outline, from the rim's reach
// (28 m in) to the line, so wildScatter's keep-clear does the rest.
export function fireLine(shape: Pt[], reach: (x: number, z: number) => number, roadDist: (x: number, z: number) => number, camps: [number, number, number][]): void {
  const n = shape.length;
  // inward normal at each vertex: the mean of its two edges', turned to the centre
  const normals = shape.map((p, i) => {
    const a = shape[(i + n - 1) % n], b = shape[(i + 1) % n];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0];
    const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    if (nx * -p[0] + nz * -p[1] < 0) { nx = -nx; nz = -nz; }
    return [nx, nz] as Pt;
  });
  const avoid = camps;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [ax, az] = shape[i], [bx, bz] = shape[j], [anx, anz] = normals[i], [bnx, bnz] = normals[j];
    const ra = reach(ax, az), rb = reach(bx, bz);
    const poly: Pt[] = [[ax + anx * 28, az + anz * 28], [bx + bnx * 28, bz + bnz * 28], [bx + bnx * rb, bz + bnz * rb], [ax + anx * ra, az + anz * ra]];
    wildScatter("wildflowers", { poly }, { density: 3.2, seed: 400 + i, color: "pink", clump: { n: [3, 7], r: 6 }, avoid, inset: 28 });
    wildScatter("shrub", { poly }, { density: 0.5, seed: 450 + i, color: "autumn", clump: { n: [2, 3], r: 4 }, avoid, inset: 28 });
  }
  // the birches: own sampling (placeExact has no keep-clear), kept off the
  // ways, the passes, steep ground and the camps' hearts
  const rand = rng(481), birches: Spot[] = [];
  for (let t = 0; t < 900 && birches.length < 46; t++) {
    const x = (rand() - 0.5) * 660, z = (rand() - 0.5) * 660;
    const e = polySignedDist(shape, x, z);
    if (e < 32 || e > reach(x, z) - 4) continue;
    if (roadDist(x, z) < 8 || scatterBlocked(x, z) || slope(x, z) > 0.45) continue;
    if (camps.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (birches.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
    const r = Math.hypot(x, z);
    birches.push({ x, z, scale: 0.75 + rand() * 0.35, rot: rand() * 6.3, lean: 0.08 + rand() * 0.06, leanX: x / r, leanZ: z / r });
  }
  placeExact("nature/Birch_2.gltf", birches.filter((_, i) => i % 2 === 0), 0.5);
  placeExact("nature/Birch_4.gltf", birches.filter((_, i) => i % 2 === 1), 0.5);
}

// THE ASH FLOOR. Over the whole burn: boulders of the rim's stone, charred
// stumps, dead scrub -- sparse, so the ash stays the ground and
// the trunks stay the forest. Kept off the camps' hearts and the walls.
export function ashFloor(camps: [number, number, number][]): void {
  const avoid: [number, number, number][] = [[0, 0, 150], ...camps];
  wildScatter("boulder", "zone", { count: 70, seed: 501, tint: STONE, avoid, scale: [0.7, 1.8], clump: { n: [1, 3], r: 6 } });
  wildScatter("outcrop", "zone", { count: 10, seed: 502, tint: STONE, avoid, maxSlope: 0.35 });
  // (no kit logs: their moss stays green under any tint -- green lumps on a
  // charred trunk, look 1)
  wildScatter("stump", "zone", { count: 60, seed: 504, tint: CHAR, avoid });
  wildScatter("shrub", "zone", { count: 110, seed: 505, color: "ash", avoid, clump: { n: [1, 3], r: 4 } });
}

// THE OLD ROAD CUT's banks: glass seams set into them where the cut laid the
// melt bare, boulders fallen to their feet, and a waymarker at the cut's
// north mouth where the road comes out toward the gates.
export function roadCutDressing(cut: Pt): void {
  const [cx, cz] = cut, rand = rng(521);
  const seams: Spot[] = [];
  for (let z = cz + 26; z >= cz - 6; z -= 6) for (const s of [-1, 1]) {
    if (rand() < 0.3) continue;
    const x = cx - 3 + s * (10 + rand() * 3);
    seams.push({ x, z: z + (rand() - 0.5) * 3, scale: 0.9 + rand() * 0.9, rot: rand() * 6.3, yOff: -0.9, lean: 0.5, leanX: -s, leanZ: 0 });
  }
  placeExact(GLASS, seams, 0, { tint: AMBER, flat: true });
  wildScatter("boulder", { rect: [cx - 22, cz - 4, cx + 22, cz + 30] }, { count: 7, seed: 522, tint: STONE, roadPad: 2.5, scale: [0.6, 1.2] });
  wildPlace("waymarker", [{ x: cx - 12, z: cz + 22, rot: 0.1 }]);
}
