// The Canal Works' places worth walking to, and the fen's floor, laid with the
// wild nature kit (wild-nature.ts). canalworks.ts owns the layout and the
// ground; it calls these from build() AFTER the roads, water and buildings,
// so every scatter's keep-clear check can read them.
//
// Cost (wild-nature-plan.ts poolDraws): one pool per kind and colour, so the
// variants are kept few on purpose -- one stone tint (the rim's green-grey, a
// shade lighter), the ruins' own pale ashlar, two flower colours (white
// meadowsweet, yellow flag) and the fen's olive and dark leaves. ~20 pools.
import { placeExact } from "../scene";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { rng, type Pt } from "../wild-terrain";

// the kit stones' one tint: the rim's #6e7a68 lifted a little, so a boulder
// reads against the cliff dressing behind it in the pewter light
const STONE = "#7e8878";
// the alders' and the scrub's one leaf multiply: the generated broadleaf's
// green taken toward the fen's silver-green (the kit's birch is autumn orange
// and its twisted tree red -- both read as the wrong season here, look 1)
const LEAF = "#c4d2bc";

type Spot = { x: number; z: number; rot: number; scale: number };

// THE LOCK STAIR. The lock line climbs onto the Granary Shelf through a
// cutting; the canal company never finished it, and the cut ends in a blind
// head with the facing stones they cut and never laid stacked on its floor.
// Scree has come down the walls onto the floor, a birch or two has fallen
// in from the lip. `pts` is the cutting's centreline, mouth to head.
export function lockStair(pts: Pt[], camps: [number, number, number][]): void {
  const [hx, hz] = pts[pts.length - 1];
  const [px, pz] = pts[pts.length - 2];
  const L = Math.hypot(hx - px, hz - pz), ux = (hx - px) / L, uz = (hz - pz) / L, nx = -uz, nz = ux;
  // the blind head: a run of facing laid on the head wall's foot, its corner,
  // the uncut drums and a waymarker the surveyors left
  const yaw = -Math.atan2(uz, ux) + Math.PI / 2;     // local +x across the cut
  wildLine("ruin_wall", [[hx + ux * 6 - nx * 9, hz + uz * 6 - nz * 9], [hx + ux * 6 + nx * 9, hz + uz * 6 + nz * 9]], { face: "right", seed: 81 });
  wildPlace("ruin_corner", [{ x: hx + ux * 5 + nx * 11, z: hz + uz * 5 + nz * 11, rot: yaw }]);
  wildPlace("drums", [{ x: hx - nx * 6, z: hz - nz * 6, rot: 0.4 }, { x: hx - nx * 3 - ux * 4, z: hz - nz * 3 - uz * 4, rot: 1.9, scale: 0.85 }, { x: hx + nx * 7 - ux * 2, z: hz + nz * 7 - uz * 2, rot: 2.8 }]);
  wildPlace("waymarker", [{ x: hx + nx * 4 + ux * 2, z: hz + nz * 4 + uz * 2, rot: yaw }]);
  // THE WALLS: the kit's cliff slabs, a U from the mouth round the blind head
  // and back, faces inward (one stone language: dressCliffs is kept out of
  // the cut). 15.5 m off the centreline, so their faces stand at the cut's
  // floor edge (the floor is 13 m either side) and their backs in the bank.
  wildLine("cliff", cutWalls(pts, 15.5), { face: "right", tint: STONE, seed: 85, yOff: -0.6, scale: [0.9, 1.1] });
  // scree fans at the walls' feet the length of the cut
  const rand = rng(82);
  const scree: Spot[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], Ls = Math.hypot(bx - ax, bz - az);
    const sx = (bx - ax) / Ls, sz = (bz - az) / Ls, mx = -sz, mz = sx;
    for (let t = 6; t < Ls; t += 13) for (const s of [-1, 1]) {
      if (rand() < 0.35) continue;
      const off = 11.5 + rand() * 1.5;
      scree.push({ x: ax + sx * t + mx * s * off, z: az + sz * t + mz * s * off, rot: rand() * 6.3, scale: 1.0 + rand() * 0.5 });
    }
  }
  wildPlace("scree", scree, { tint: STONE });
  wildScatter("fern_bed", { poly: corridorPoly(pts, 12) }, { density: 2.2, color: "dark", seed: 83, clump: { n: [2, 4], r: 4 }, avoid: camps });
  wildScatter("wildflowers", { poly: corridorPoly(pts, 12) }, { density: 1.2, color: "white", seed: 84, clump: { n: [3, 5], r: 4 } });
}

// THE ENGINEER'S LOOKOUT. The canal company's survey station on the shelf's
// lip above the cutting's mouth, where the engineer stood to rule the lock line
// across the fen: an arch framing the view west over the whole works, the
// station's back wall and corner against the plains wind, a column the
// sighting instrument stood on, its drums fallen, a cairn where the path
// arrives. `c` is the station's centre; the path ends at c + (8, 6).
export function engineersLookout(c: Pt): void {
  const [x, z] = c;
  // piers along local x = along z (rot pi/2): the opening looks west and east
  wildPlace("arch", [{ x: x - 7, z, rot: Math.PI / 2 }]);
  wildLine("ruin_wall", [[x + 6, z - 9], [x + 7, z + 3]], { face: "left", seed: 91 });
  wildPlace("ruin_corner", [{ x: x + 6, z: z - 11, rot: 0.1 }]);
  wildPlace("column", [{ x: x - 2, z: z + 6, rot: 0.3 }]);
  wildPlace("drums", [{ x: x - 1, z: z - 6, rot: 1.2 }, { x: x + 2, z: z - 2, rot: 2.6, scale: 0.8 }]);
  wildPlace("cairn", [{ x: x + 12, z: z + 9, rot: 0.4 }]);
  wildPlace("boulder", [{ x: x + 14, z: z - 6, rot: 0.6, scale: 1.3 }, { x: x - 2, z: z + 14, rot: 2.2, scale: 1.0 }], { tint: STONE });
  wildScatter("shrub", { circle: [x + 6, z + 2, 24] }, { density: 1.6, color: "olive", seed: 92, clump: { n: [2, 4], r: 4 }, avoid: [[x, z, 10]] });
  wildScatter("wildflowers", { circle: [x + 4, z, 26] }, { density: 2, color: "yellow", seed: 93, clump: { n: [3, 6], r: 5 }, avoid: [[x, z, 8]] });
}

// THE SPOIL BANKS. Three centuries ago the great canal was dredged and the
// mud was heaped here in a long bank; it dried, grassed and took birch. The
// crest path runs its length (`crest`), a waymarker where it leaves the camp
// road and a cairn at its western end looking back over the fen and the canal.
export function spoilBanks(crest: Pt[], camps: [number, number, number][]): void {
  const rand = rng(101);
  const [ex, ez] = crest[crest.length - 1], [sx, sz] = crest[0];
  wildPlace("cairn", [{ x: ex - 4, z: ez + 2, rot: 0.8, scale: 1.2 }]);
  wildPlace("waymarker", [{ x: sx - 2, z: sz - 3, rot: 0.2 }]);
  // alder and birch scrub either side of the crest, never on it
  const birch: Spot[] = [];
  for (let i = 0; i + 1 < crest.length; i++) {
    const [ax, az] = crest[i], [bx, bz] = crest[i + 1], L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    for (let t = 8; t < L; t += 11) {
      if (rand() < 0.3) continue;
      const s = rand() < 0.5 ? -1 : 1, off = 7 + rand() * 9;
      birch.push({ x: ax + ux * t + nx * s * off, z: az + uz * t + nz * s * off, rot: rand() * 6.3, scale: 0.9 + rand() * 0.35 });
    }
  }
  placeExact("nature/CommonTree_1.gltf", birch.filter((_, i) => i % 2 === 0), 0.5, { tint: LEAF });
  placeExact("nature/CommonTree_3.gltf", birch.filter((_, i) => i % 2 === 1), 0.5, { tint: LEAF });
  const band: Pt[] = corridorPoly(crest, 20);
  const keep = crest.map(([x, z]) => [x, z, 3] as [number, number, number]);
  wildScatter("scree", { poly: band }, { count: 14, tint: STONE, seed: 102, avoid: keep });
  wildScatter("boulder", { poly: band }, { count: 10, tint: STONE, seed: 103, avoid: [...keep, ...camps] });
  wildScatter("shrub", { poly: band }, { density: 1.2, color: "olive", seed: 104, clump: { n: [2, 5], r: 5 } });
  wildScatter("bramble", { poly: band }, { density: 0.5, color: "dark", seed: 105, clump: { n: [2, 3], r: 4 } });
  wildScatter("wildflowers", { poly: band }, { density: 1.4, color: "white", seed: 106, clump: { n: [3, 6], r: 6 } });
}

// THE KEEPER'S TERP. Before the canal the fen people lived on mounds out of
// the water; the lock-keepers kept one, and built their chapel on it. The roof
// is three centuries gone: the nave's walls stand to shoulder height with
// gaps, the door arch faces the path in from the east, one column of the
// porch stands and its fellow lies in drums. Two dead alders, bramble in the
// nave. `c` is the mound's top.
export function keepersTerp(c: Pt): void {
  const [x, z] = c;
  // the nave, 12 x 7 m, long axis east-west; the walls along local x
  wildLine("ruin_wall", [[x - 7, z - 4], [x + 5, z - 4]], { face: "left", seed: 111 });
  wildLine("ruin_wall", [[x - 7, z + 4], [x - 1, z + 4]], { face: "right", seed: 112 });
  wildPlace("ruin_corner", [{ x: x - 7, z: z + 4, rot: 0 }, { x: x + 5, z: z + 4, rot: -Math.PI / 2 }]);
  wildLine("ruin_wall", [[x - 8, z - 3], [x - 8, z + 3]], { face: "left", seed: 113 });
  // the door arch at the east end, opening east (piers along z)
  wildPlace("arch", [{ x: x + 7, z, rot: Math.PI / 2 }]);
  wildPlace("column", [{ x: x + 11, z: z - 3, rot: 0.2 }]);
  wildPlace("drums", [{ x: x + 11, z: z + 4, rot: 1.4 }]);
  wildPlace("waymarker", [{ x: x + 16, z: z + 1.5, rot: 0 }]);
  placeExact("nature/DeadTree_3.gltf", [{ x: x - 12, z: z + 9, scale: 0.75, rot: 0.6 }, { x: x + 3, z: z - 12, scale: 0.6, rot: 2.4 }], 0.6, { tint: "#6a6e64" });
  wildScatter("bramble", { circle: [x - 2, z, 6] }, { count: 3, color: "dark", seed: 114, overlap: true });
  wildScatter("bramble", { circle: [x, z, 22] }, { density: 2, color: "dark", seed: 115, avoid: [[x, z, 11], [x + 14, z, 5]] });
  wildPlace("stump", [{ x: x - 14, z: z - 6, rot: 0.3 }, { x: x + 9, z: z + 12, rot: 1.8, scale: 1.2 }]);
  // the flanks: scrub and fern, so the mound reads green and not as bare
  // earth (look 1), kept off the path up the east side
  wildScatter("shrub", { circle: [x, z, 32] }, { density: 2.4, color: "olive", seed: 116, clump: { n: [2, 4], r: 4 }, avoid: [[x, z, 15]], maxSlope: 1.0 });
  wildScatter("fern_bed", { circle: [x, z, 32] }, { density: 3, color: "dark", seed: 117, clump: { n: [2, 4], r: 4 }, avoid: [[x, z, 14]], maxSlope: 1.0 });
}

// THE DROWNED CARR. The barge basin flooded the alder carr round it: dead
// trees stand out in the shallows among the hulls, the living ones lean over
// the bank, wind-thrown trunks lie with their roots in the air. `c` the basin
// centre, `r` its radius, `hulls` the sunken barges' spots to keep clear of.
export function drownedCarr(c: Pt, r: number, hulls: Pt[]): void {
  const [cx, cz] = c;
  const rand = rng(121);
  const dead: Spot[] = [], live: Spot[] = [], logs: Spot[] = [], plates: Spot[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = r * (0.62 + rand() * 0.3);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (hulls.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 14)) continue;
    dead.push({ x, z, rot: rand() * 6.3, scale: 0.5 + rand() * 0.3 });
  }
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2, d = r + 8 + rand() * 18;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (hulls.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 14)) continue;
    live.push({ x, z, rot: rand() * 6.3, scale: 0.9 + rand() * 0.4 });
    if (i % 3 === 0) {
      // a wind-thrown alder at the bank: trunk lying out toward the water
      const rot = Math.atan2(cx - x, cz - z);
      logs.push({ x: x + Math.sin(rot) * 6, z: z + Math.cos(rot) * 6, rot, scale: 1.1 + rand() * 0.3 });
      plates.push({ x, z, rot: rot + Math.PI, scale: 0.9 });
    }
  }
  placeExact("nature/DeadTree_2.gltf", dead.filter((_, i) => i % 2 === 0), 0, { tint: "#6a6e64" });
  placeExact("nature/DeadTree_4.gltf", dead.filter((_, i) => i % 2 === 1), 0, { tint: "#6a6e64" });
  placeExact("nature/CommonTree_4.gltf", live.filter((_, i) => i % 2 === 0), 0.8, { tint: LEAF });
  placeExact("nature/CommonTree_2.gltf", live.filter((_, i) => i % 2 === 1), 0.8, { tint: LEAF });
  wildPlace("log", logs, { collide: false });
  wildPlace("rootplate", plates, { collide: false });
}

// THE FEN FLOOR, zone-wide: reed beds along every bank and round every pool,
// yellow flag and white meadowsweet in drifts, fern beds and olive scrub on
// the drier ground, a few boulders and logs. Camps' hearts are kept clear of
// the solid pieces (wildScatter keeps off spots but not camps).
export function fenFloor(camps: [number, number, number][], avoid: [number, number, number][]): void {
  wildScatter("reeds", "zone", { density: 30, nearWater: 5, color: "olive", seed: 131, clump: { n: [3, 6], r: 4 }, avoid });
  wildScatter("wildflowers", "zone", { density: 0.35, color: "yellow", seed: 132, clump: { n: [4, 8], r: 7 }, avoid });
  wildScatter("wildflowers", "zone", { density: 0.3, color: "white", seed: 133, clump: { n: [4, 8], r: 7 }, avoid });
  wildScatter("fern_bed", "zone", { density: 0.35, color: "dark", seed: 134, clump: { n: [2, 5], r: 5 }, avoid });
  wildScatter("shrub", "zone", { density: 0.25, color: "olive", seed: 135, clump: { n: [2, 4], r: 5 }, avoid });
  wildScatter("boulder", "zone", { count: 26, tint: STONE, seed: 136, avoid: [...avoid, ...camps] });
  wildScatter("log", "zone", { count: 18, seed: 137, collide: false, avoid: [...avoid, ...camps] });
  wildScatter("stump", "zone", { count: 16, seed: 138, avoid: [...avoid, ...camps] });
}

// The cutting's walls as one polyline: offset `off` to the left of the
// centreline from mouth to head, round the head in a half circle, and back
// down the right side -- the cut's floor is on the polyline's right throughout.
function cutWalls(pts: Pt[], off: number): Pt[] {
  const norm = (i: number): Pt => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  };
  const left: Pt[] = pts.map((p, i) => { const [nx, nz] = norm(i); return [p[0] + nx * off, p[1] + nz * off]; });
  const right: Pt[] = pts.map((p, i) => { const [nx, nz] = norm(i); return [p[0] - nx * off, p[1] - nz * off]; });
  const [hx, hz] = pts[pts.length - 1], [nx, nz] = norm(pts.length - 1), a0 = Math.atan2(nz, nx);
  const arc: Pt[] = [];
  // n is u turned +90 degrees, so the arc from +n through u to -n runs clockwise
  for (let k = 1; k < 6; k++) { const a = a0 - (k / 6) * Math.PI; arc.push([hx + Math.cos(a) * off, hz + Math.sin(a) * off]); }
  return [...left, ...arc, ...right.reverse()];
}

// a polyline widened into a polygon (a band `half` metres either side), for
// scatters confined to a corridor
function corridorPoly(pts: Pt[], half: number): Pt[] {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    left.push([pts[i][0] + nx * half, pts[i][1] + nz * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - nz * half]);
  }
  return [...left, ...right.reverse()];
}
