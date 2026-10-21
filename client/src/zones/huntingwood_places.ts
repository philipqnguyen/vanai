// The Hunting Wood's places worth walking to, and its forest floor, laid with
// the wild nature kit (wild-nature.ts). huntingwood.ts owns the layout and the
// ground; it calls these from build() AFTER the roads, water and buildings, so
// every scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are kept few on purpose -- one stone tint, the ruins' own ashlar,
// two flower colours (yellow in the rides, white under the trees) and violet
// heather. ~20 pools, ~50 main-pass draws at worst whatever the counts.
import { placeExact } from "../scene";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { rng, type Pt } from "../wild-terrain";

// the kit stones' one tint: the rim's green-grey, a shade lighter so a
// boulder reads against the cliff dressing behind it
const STONE = "#7c8470";
// the kit's violet heather came out a loud blue-purple on the downs (look 1);
// a grey-mauve multiply takes it back to heather
const HEATHER = "#b8a8b0";

// THE KING'S SEAT. A hunting stand the old court built on the scarp's
// promontory, so the king could watch the stag meadow and the rides from
// above: an arch framing the view south, a back wall against the wind, two
// columns (one fallen to drums), a cairn where the path arrives. Laid round
// `c`; the path from the Stag Stair ends at c + (-6, 2), inside it.
export function kingsSeat(c: Pt): void {
  const [x, z] = c;
  wildPlace("arch", [{ x: x - 1, z: z - 7, rot: 0 }]);
  wildLine("ruin_wall", [[x - 10, z + 10], [x + 8, z + 11]], { face: "right", seed: 31 });
  wildPlace("ruin_corner", [{ x: x + 12, z: z + 8, rot: -0.1 }]);
  wildPlace("column", [{ x: x - 10, z: z - 4, rot: 0.3 }, { x: x + 9, z: z - 3, rot: 1.1, lean: 0.06, leanX: 1, leanZ: -0.4 }]);
  wildPlace("drums", [{ x: x + 5, z: z + 2, rot: 0.7 }, { x: x - 4, z: z + 5, rot: 2.1, scale: 0.8 }]);
  wildPlace("cairn", [{ x: x - 16, z: z - 2, rot: 0.4 }]);
  wildScatter("heather", { circle: [x, z, 22] }, { density: 4, color: "violet", tint: HEATHER, seed: 32, clump: { n: [2, 4], r: 4 } });
}

// THE HART'S POOL, in the dell under the Seat: reeds round the water, ferns
// and white flowers on the banks, a fallen trunk lying out into the shallows
// where the stags come down to drink, and two boulders off the scarp's foot.
export function hartsPool(c: Pt, level: number): void {
  const [x, z] = c;
  void level;
  wildScatter("reeds", { circle: [x, z, 24] }, { density: 9, nearWater: 3.5, color: "olive", seed: 41 });
  wildScatter("fern_bed", { circle: [x, z, 34] }, { density: 5, color: "dark", seed: 42, clump: { n: [3, 5], r: 5 } });
  wildScatter("wildflowers", { circle: [x, z, 30] }, { density: 2.5, color: "white", seed: 43, clump: { n: [3, 6], r: 5 } });
  wildPlace("log", [{ x: x - 15, z: z - 5, rot: 1.2, scale: 1.1 }], { collide: false });
  wildPlace("boulder", [{ x: x + 12, z: z + 17, rot: 0.6, scale: 1.4 }, { x: x - 6, z: z + 19, rot: 2.2, scale: 1.1 }], { tint: STONE });
}

// THE OLD HOLLOWAY. Centuries of carts sank the garrison road between its
// banks (the terrain's cut through the Garrison Rise): tree roots break out of
// the banks, broadleaves lean over from the tops so the way runs in shade,
// ferns line the floor. `pts` is the holloway's centreline.
export function holloway(pts: Pt[]): void {
  const rand = rng(51);
  const roots: { x: number; z: number; rot: number; scale: number }[] = [];
  const trees: { x: number; z: number; scale: number; rot: number }[] = [];
  const ferns: { x: number; z: number; rot: number; scale: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    for (let t = 4; t < L; t += 7) {
      const px = ax + ux * t, pz = az + uz * t;
      for (const s of [-1, 1]) {
        // a root plate in the bank face, its trunk running up into the bank
        // (local +z along the trunk -> (sin rot, cos rot) = outward)
        if (rand() < 0.45) roots.push({ x: px + nx * s * 6.2, z: pz + nz * s * 6.2, rot: Math.atan2(nx * s, nz * s), scale: 0.8 + rand() * 0.4 });
        if (rand() < 0.6) ferns.push({ x: px + nx * s * (3.6 + rand() * 0.8) + ux * rand() * 3, z: pz + nz * s * (3.6 + rand() * 0.8) + uz * rand() * 3, rot: rand() * 6.3, scale: 0.8 + rand() * 0.4 });
      }
      // a tree on alternate tops, leaning out over the way
      const s = (Math.floor(t / 7) + i) % 2 ? 1 : -1;
      trees.push({ x: px + nx * s * 11, z: pz + nz * s * 11, scale: 1.6 + rand() * 0.5, rot: rand() * 6.3 });
    }
  }
  wildPlace("rootplate", roots, { collide: false });
  wildPlace("fern_bed", ferns, { color: "dark" });
  placeExact("nature/CommonTree_1.gltf", trees.filter((_, i) => i % 2 === 0), 0.9);
  placeExact("nature/CommonTree_3.gltf", trees.filter((_, i) => i % 2 === 1), 0.9);
}

// THE SURVEY STONES. The empire surveyed this border before it walled it:
// a ruled line of stones down the West Downs, parallel to the wall, a stone
// every 26 m and a waymarker at each end. None stands on a road.
export function surveyStones(ends: [Pt, Pt], roadDist: (x: number, z: number) => number): void {
  const [[ax, az], [bx, bz]] = ends, L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L, uz = (bz - az) / L;
  const rand = rng(61);
  const stones: { x: number; z: number; rot: number; scale: number; lean: number; leanX: number; leanZ: number }[] = [];
  for (let t = 0; t <= L + 0.1; t += 26) {
    const x = ax + ux * t, z = az + uz * t;
    if (roadDist(x, z) < 8) continue;
    // faces along the line, as a surveyor sets them; a few have leaned with
    // three centuries of frost
    stones.push({ x, z, rot: -Math.atan2(uz, ux), scale: 1.35 + rand() * 0.25, lean: rand() < 0.4 ? 0.05 + rand() * 0.08 : 0, leanX: rand() - 0.5, leanZ: rand() - 0.5 });
  }
  wildPlace("standing_stone", stones, { tint: STONE });
  wildPlace("waymarker", [{ x: ax - ux * 8, z: az - uz * 8, rot: -Math.atan2(uz, ux) }, { x: bx + ux * 8, z: bz + uz * 8, rot: -Math.atan2(uz, ux) }]);
  wildScatter("heather", { circle: [-215, 40, 70] }, { density: 2.2, color: "violet", tint: HEATHER, seed: 62, clump: { n: [3, 6], r: 6 } });
  // a few boulders on the downs, but not on the line: they hid the stones
  wildScatter("boulder", { circle: [-205, 40, 60] }, { count: 6, tint: STONE, seed: 63, avoid: stones.map((s) => [s.x, s.z, 14] as [number, number, number]) });
}

// THE WINDFALL. A storm out of the west laid a stand of the wood flat: the
// trunks all lie east, root plates torn up at their west ends, the stumps of
// the ones that snapped, bramble come up in the light, two dead trees left
// standing. The glade it made is the one place north of the lodge open to sky.
export function windfall(c: Pt): void {
  const [cx, cz] = c;
  const rand = rng(71);
  const logs: { x: number; z: number; rot: number; scale: number }[] = [];
  const plates: { x: number; z: number; rot: number; scale: number }[] = [];
  const stumps: { x: number; z: number; rot: number; scale: number }[] = [];
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 20;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    // local +z along the trunk -> (sin rot, cos rot); east is rot ~ pi/2
    const rot = Math.PI / 2 + (rand() - 0.5) * 0.5, s = 1.0 + rand() * 0.4;
    logs.push({ x, z, rot, scale: s });
    if (i % 2 === 0) plates.push({ x: x - Math.sin(rot) * 3.4 * s, z: z - Math.cos(rot) * 3.4 * s, rot: rot + Math.PI, scale: s * 0.9 });
  }
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, d = 6 + rand() * 18;
    stumps.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, rot: rand() * 6.3, scale: 0.9 + rand() * 0.5 });
  }
  wildPlace("log", logs);
  wildPlace("rootplate", plates);
  wildPlace("stump", stumps);
  wildScatter("bramble", { circle: [cx, cz, 26] }, { density: 3, color: "green", seed: 72, clump: { n: [2, 4], r: 4 }, overlap: true });
  placeExact("nature/DeadTree_2.gltf", [{ x: cx + 14, z: cz - 9, scale: 1.2, rot: 0.8 }, { x: cx - 12, z: cz + 13, scale: 1.1, rot: 2.6 }], 0.6, { tint: "#6a6660" });
}

// THE SCARP'S TOP: heather on the open ground above the cliff, and the odd
// outcrop and tor breaking it -- the skyline you see from the rides.
export function scarpTop(spots: Pt[]): void {
  const rand = rng(81);
  wildPlace("outcrop", spots.map(([x, z]) => ({ x, z, rot: rand() * 6.3, scale: 1.2 + rand() * 0.5 })), { tint: STONE });
  wildPlace("tor", [{ x: spots[1][0] + 18, z: spots[1][1] + 6, rot: 0.5, scale: 1.3 }, { x: spots[3][0] - 26, z: spots[3][1] + 12, rot: 2.0, scale: 1.1 }], { tint: STONE });
  wildScatter("heather", { poly: [[-110, 150], [170, 150], [150, 200], [-100, 215]] }, { density: 1.8, color: "violet", tint: HEATHER, seed: 82, clump: { n: [3, 6], r: 6 } });
}

// THE RIDES IN FLOWER: the avenues are the one place the sun reaches the
// floor, so they carry the flowers -- yellow drifts down each ride's grass.
export function ridesInFlower(rides: [Pt, Pt][]): void {
  rides.forEach(([[ax, az], [bx, bz]], i) => {
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L * 10, nz = (bx - ax) / L * 10;
    const poly: Pt[] = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
    wildScatter("wildflowers", { poly }, { density: 1.6, color: "yellow", seed: 90 + i, clump: { n: [3, 7], r: 6 } });
  });
}

// THE FOREST FLOOR, zone-wide: ferns in the shade, shrubs and bramble in the
// gaps, mossy boulders, fallen logs and stumps. `camps` are kept clear of
// solid pieces (wildScatter keeps off every zones.json spot but camps).
export function woodFloor(camps: [number, number, number][]): void {
  wildScatter("fern_bed", "zone", { density: 0.9, color: "dark", seed: 101, clump: { n: [2, 5], r: 6 } });
  wildScatter("shrub", "zone", { density: 0.32, color: "green", seed: 102, clump: { n: [2, 3], r: 4 } });
  wildScatter("bramble", "zone", { density: 0.12, color: "green", seed: 103 });
  wildScatter("boulder", "zone", { count: 70, tint: STONE, seed: 104, avoid: camps, clump: { n: [1, 3], r: 5 } });
  wildScatter("log", "zone", { count: 45, seed: 105, avoid: camps });
  wildScatter("stump", "zone", { count: 60, seed: 106, avoid: camps });
  wildScatter("wildflowers", "zone", { density: 0.12, color: "white", seed: 107, clump: { n: [2, 4], r: 4 } });
}
