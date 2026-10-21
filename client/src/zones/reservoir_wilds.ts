// The Reservoir's places worth the walk, and its nature (the wilds revamp,
// 2026-10-10; tmp/wilds/zones/reservoir/PLAN.md). reservoir.ts lays the
// roads, the water, the dam, the village, the tower and the camp first, so
// every keep-clear test here reads them; this runs last in its build.
//
//   the Watch Crag      a ruined watch post on the cliffed crag at the toe of
//                       the west wall's middle spur, over the drowned village
//   the Orchard         the old orchard on soft terraces down the east wall,
//                       low dry-stone walls with gaps, fruit trees in rows
//   the Holms           willow islands in the north-west shallows
//   the Drowned Lane    the village's old road going down into the water:
//                       waymarkers, a gate arch and its posts in the shallows
//   the drowned wood    dead trees standing in the water, each one doubled
//
// Cost (RULINGS "Performance", by counting): every piece here is a pooled
// thin instance -- the wild kit's kinds (one pool per kind and colour; two
// flower colours, one leaf colour, one stone tint) and the trees' own
// templates with their far doubles -- so the count of draws is the count of
// pools, never of instances. The cliff dressing takes the rim's tint and
// joins the rim's pools: no extra draws. No lights.
import { placeExact, ground, segDist, polySignedDist, zoneShape, scatterBlocked } from "../scene";
import type { Road } from "../scene";
import { wildPlace, wildScatter } from "../wild-nature";
import type { WildSpot } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import { rng, noise2, slopeAt } from "../wild-terrain";
import {
  KEY, LEVEL, damZ, CAMP, TOWER, VILLAGE, BOARD_A, BOARD_B, CRAG, CRAG_RAMP, POST, ORCHARD, TERRACE_STEP,
  HOLMS, HOLMS_S, SPURS,
} from "./reservoir_plan";

/** The rim's tint: the cliff dressing and the kit's stone share it, so the
 *  cliff bodies join the rim's own pools (FOUNDATION per-zone table). */
export const RIM_TINT = "#8a9296";

type P = [number, number];
interface Ctx { roads: Road[]; paths: Road[] }

const slope = (x: number, z: number) => slopeAt(ground, x, z);
function lineDist(x: number, z: number, list: Road[]): number {
  let best = Infinity;
  for (const r of list) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d - r.half < best) best = d - r.half;
  }
  return best;
}
const BOARD: Road[] = [{ pts: [BOARD_A, BOARD_B], half: 1.7 }];
function inPlate(x: number, z: number, margin: number): boolean {
  const sh = zoneShape(KEY);
  return sh ? polySignedDist(sh.pts, x, z) > margin : true;
}
function inPoly(poly: P[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// spots along a polyline every `step` metres, each turned so local +x runs
// along it (placeExact's sense: local +x -> (cos rot, -sin rot))
function along(pts: P[], step: number, start = step / 2): { x: number; z: number; rot: number }[] {
  const out: { x: number; z: number; rot: number }[] = [];
  let carry = start;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, rot = Math.atan2(-uz, ux);
    let d = carry;
    for (; d <= L; d += step) out.push({ x: ax + ux * d, z: az + uz * d, rot });
    carry = d - L;
  }
  return out;
}

export function buildWilds(size: number, ctx: Ctx): void {
  const all = [...ctx.roads, ...ctx.paths];
  watchCrag();
  orchard(all);
  holms(all);
  drownedLane();
  drownedWood(all);
  nature(all);
  // last: the steep faces the landforms made (the crag's cliffs, the spurs'
  // noses, the walls' steepest pitches), dressed in the rim's own rock
  dressCliffs(KEY, size, { roads: all, tint: RIM_TINT, avoid: [[CRAG.x, CRAG.z, Math.max(CRAG.rx, CRAG.rz) + 8]] });
}

// THE WATCH CRAG. Its sides are the nature kit's cliff slabs, stood round
// the table's rim with their faces out, each as tall as the drop it fronts
// (the lake side ~13 m, the spur side ~8): dressCliffs' rim rocks left the
// table's 5 m edge band -- grade 2.7 on a 4.7 m mesh -- showing as stretched
// facets between them (the first look, after1/new-crag.jpg). The ramp's arc
// on the north-west is left open. One stone language per face: dressCliffs
// is told to keep off the crag.
// On top, a square watch post of pale ashlar: two walls and their corner on
// the weather side, the gate arch on the north where the ramp comes up, a
// column and its fallen drums, and a cairn at the lookout edge over the
// drowned village and the tower.
function watchCrag(): void {
  const spots: WildSpot[] = [];
  const ra = CRAG.rx + 1.5, rb = CRAG.rz + 1.5;
  const rampAt = Math.atan2(CRAG_RAMP[1][1] - CRAG.z, CRAG_RAMP[1][0] - CRAG.x);
  for (let k = 0; k < 15; k++) {
    const t = (k / 15) * Math.PI * 2;
    let d = Math.abs(t - rampAt); d = Math.min(d, Math.PI * 2 - d);
    if (d < 0.5) continue;
    const x = CRAG.x + ra * Math.cos(t), z = CRAG.z + rb * Math.sin(t);
    const dx = -ra * Math.sin(t), dz = rb * Math.cos(t), L = Math.hypot(dx, dz);
    // the drop it fronts: from the crag's top to the lowest ground a few
    // metres out (8 m is the slab's height at scale 1)
    const low = Math.min(...[0, 3, 6, 10].map((e) => ground(x + Math.cos(t) * e, z + Math.sin(t) * e)));
    const sc = Math.max(0.7, Math.min(1.9, (CRAG.top - low + 0.6) / 8));
    spots.push({ x, z, rot: Math.atan2(-dz / L, dx / L) + Math.PI, scale: sc, sx: Math.max(0.95, sc) * 0.95, sz: Math.min(1.2, sc) });
  }
  wildPlace("cliff", spots, { tint: RIM_TINT });
  const [px, pz] = POST;
  const A = { tint: "#b8b2a4" };
  wildPlace("ruin_corner", [{ x: px - 4.5, z: pz - 4.5, rot: 0, scale: 1.15 }], A);
  // the south wall along +x and the west wall along +z (local +x along each)
  wildPlace("ruin_wall", [{ x: px - 0.2, z: pz - 4.6, rot: 0, scale: 1.15 }, { x: px - 4.6, z: pz + 0.4, rot: -Math.PI / 2, scale: 1.15, sy: 0.9 }], A);
  // the gate: piers along local x, so the passage runs north-south
  wildPlace("arch", [{ x: px - 0.5, z: pz + 5.2, rot: 0, scale: 1.15 }], A);
  wildPlace("column", [{ x: px + 4.6, z: pz + 4.4, rot: 0.3, scale: 1.15 }], A);
  wildPlace("drums", [{ x: px + 4, z: pz - 1.5, rot: 1.1 }], { ...A, collide: false });
  wildPlace("cairn", [{ x: CRAG.x + 9, z: CRAG.z - 2, rot: 0.4 }], { tint: RIM_TINT });
}

// THE ORCHARD TERRACES. Low retaining walls along the risers -- the
// terraces' own contours, found on the finished ground -- broken every few
// lengths where the slope was walked; fruit trees in rows on the treads;
// white blossom drifts under them; the orchard-keeper's house a ruined corner
// at the top by the road.
function orchard(all: Road[]): void {
  // the riser's middle is half a step above each tread (terraces(): a tread
  // holds the ground at k * step and the riser climbs over the upper half)
  const walls: WildSpot[] = [];
  for (let k = 1; k <= 7; k++) {
    const L = k * TERRACE_STEP + TERRACE_STEP / 2;
    let run: P[] = [];
    const flush = () => {
      if (run.length >= 3) along(run, 5.6).forEach((s, i) => {
        if (i % 4 === 3) return;                                       // a gap every fourth length
        if (lineDist(s.x, s.z, all) < 3.5) return;                     // never across the path or road
        walls.push({ x: s.x, z: s.z, rot: s.rot, scale: 0.95, sy: 0.42 });
      });
      run = [];
    };
    for (let z = 4; z <= 78; z += 3) {
      let hit: P | null = null;
      for (let x = 148; x <= 194; x += 0.5) {
        if (!inPoly(ORCHARD, x, z)) continue;
        if (ground(x, z) >= L) { hit = [x, z]; break; }
      }
      if (hit && hit[0] > 149) run.push(hit); else flush();
    }
    flush();
  }
  wildPlace("ruin_wall", walls, { tint: "#a8a294" });
  // the trees: rows across the treads, on level ground only
  const r = rng(5101), trees: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let z = 8; z <= 74; z += 9) for (let x = 151; x <= 190; x += 7.5) {
    const tx = x + (r() - 0.5) * 2.5, tz = z + (r() - 0.5) * 2.5;
    if (!inPoly(ORCHARD, tx, tz) || slope(tx, tz) > 0.3 || ground(tx, tz) < LEVEL + 1.2) continue;
    if (lineDist(tx, tz, all) < 4.5 || walls.some((w) => Math.hypot(w.x - tx, w.z - tz) < 3.6)) continue;
    trees.push({ x: tx, z: tz, scale: 0.78 + r() * 0.2, rot: r() * 6.28 });
  }
  // CommonTree_5, as the Burned Land's ash orchard: a round green crown is an
  // orchard in fruit (every blossom in the pack is a mauve)
  placeExact("nature/CommonTree_5.gltf", trees, 0.7);
  wildScatter("wildflowers", { poly: ORCHARD }, { density: 8, color: "white", seed: 5103, clump: { n: [3, 6], r: 5 }, avoid: trees.map((t) => [t.x, t.z, 1.5] as [number, number, number]) });
  // the keeper's house: its corner and a wall length at the orchard's head
  wildPlace("ruin_corner", [{ x: 184, z: 70, rot: Math.PI }], { tint: "#a8a294" });
  wildPlace("ruin_wall", [{ x: 178.5, z: 70.4, rot: 0, sy: 0.7 }], { tint: "#a8a294" });
}

// THE HOLMS. Their crowns carry the valley's willows (the round crowns of the
// kit's common trees), their flanks shrubs and drift logs; the reeds round
// their shores come with the valley's (nature()).
function holms(all: Road[]): void {
  const r = rng(5201);
  const trees: { x: number; z: number; scale: number; rot: number }[] = [];
  for (const [h, n] of [[HOLMS, 60], [HOLMS_S, 22]] as [{ x: number; z: number; r: number }, number][]) {
    for (let i = 0, made = 0; i < n * 12 && made < n / 3; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * (h.r + 10), x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (ground(x, z) < LEVEL + 1.1 || slope(x, z) > 0.45 || lineDist(x, z, [...all, ...BOARD]) < 6) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
      trees.push({ x, z, scale: 1.0 + r() * 0.45, rot: r() * 6.28 }); made++;
    }
  }
  placeExact("nature/CommonTree_3.gltf", trees.filter((_, i) => i % 3 !== 2), 0.6);
  placeExact("nature/CommonTree_4.gltf", trees.filter((_, i) => i % 3 === 2), 0.6);
  wildScatter("shrub", { circle: [HOLMS.x, HOLMS.z, HOLMS.r + 12] }, { density: 1.4, color: "olive", seed: 5203, clump: { n: [2, 4], r: 4 } });
  wildScatter("log", { circle: [HOLMS.x, HOLMS.z, HOLMS.r + 12] }, { count: 7, seed: 5205, tint: "#8a7a64" });
}

// THE DROWNED LANE. Off the west road the old lane runs down to the water;
// its waymarkers go on into the shallows, two gateposts and the village's
// gate arch stand in the water where the street began, a column's drums lie
// beside it, and the walls of the drowned fields break the surface south of
// it, a hand above the water.
function drownedLane(): void {
  // on the lane's south verge, then on into the water past its end
  const marks: WildSpot[] = [-180, -164, -146, -133, -121].map((x, i) => ({ x, z: -8.5 + i * 0.6, rot: 0.3 * i }));
  wildPlace("waymarker", marks, { tint: "#b0aa9c" });
  wildPlace("arch", [{ x: -110, z: -2, rot: -Math.PI / 2, lean: 0.05, leanX: 1 }], { tint: "#a8a294" });
  wildPlace("column", [{ x: -103, z: -8, rot: 0.2 }, { x: -103, z: 4, rot: 1.0, sy: 0.6 }], { tint: "#a8a294" });
  wildPlace("drums", [{ x: -112, z: 9, rot: 0.6 }], { tint: "#a8a294", collide: false });
  const fields: WildSpot[] = [];
  for (const run of [[[-152, -24], [-131, -28], [-110, -31]], [[-131, -28], [-128, -50]], [[-110, -31], [-92, -36]]] as P[][])
    along(run, 6.2).forEach((s, i) => { if (i % 3 !== 2) fields.push({ ...s, scale: 1, sy: 0.45 }); });
  wildPlace("ruin_wall", fields, { tint: "#a8a294" });
}

// THE DROWNED WOOD. Dead trees standing in the shallows round the village and
// out on the southern flats: the valley's hedgerow oaks, drowned where they
// stood. Bare branches are what the still water doubles best.
function drownedWood(all: Road[]): void {
  const r = rng(5301);
  const out: { x: number; z: number; scale: number; rot: number }[] = [];
  // (gathered where the village's lanes were, not sown over the whole lake:
  // the first look had two dozen spread evenly across the mirror)
  const zones: [number, number, number, number][] = [[VILLAGE[0], VILLAGE[1] + 6, 62, 8], [-150, -40, 30, 3], [-10, -60, 40, 2]];
  for (const [cx, cz, rad, n] of zones) {
    for (let i = 0, made = 0; i < n * 20 && made < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (ground(x, z) > LEVEL - 0.2 || z < damZ(x) + 14) continue;                 // in the water, off the dam
      if (Math.hypot(x - VILLAGE[0], z - VILLAGE[1]) < 16 || Math.hypot(x - TOWER[0], z - TOWER[1]) < 22) continue;
      if (lineDist(x, z, [...all, ...BOARD]) < 6 || out.some((t) => Math.hypot(t.x - x, t.z - z) < 12)) continue;
      out.push({ x, z, scale: 1.1 + r() * 0.5, rot: r() * 6.28 }); made++;
    }
  }
  placeExact("nature/DeadTree_2.gltf", out.filter((_, i) => i % 2 === 0), 0.4);
  placeExact("nature/DeadTree_4.gltf", out.filter((_, i) => i % 2 === 1), 0.4);
}

// THE VALLEY'S NATURE. Stone on the walls (the rim's tint), pine stands on
// the upper walls where a slow noise gathers them, heather up high, shrubs
// and yellow flowers over the shores, fern under the north-west pines, drift
// wood along the waterline, and reeds on the measured shore -- the lake is a
// sheet, not a mapped water, so the kit's `nearWater` cannot find its edge.
function nature(all: Road[]): void {
  const avoidCamp: [number, number, number][] = [[CAMP[0], CAMP[1], 42], [TOWER[0], TOWER[1], 20]];
  // stone
  wildScatter("boulder", "zone", { count: 70, seed: 5401, tint: RIM_TINT, scale: [0.8, 1.8], avoid: avoidCamp, inset: 35 });
  wildScatter("outcrop", { poly: [[-250, -95], [-150, -95], [-150, 200], [-215, 200]] }, { count: 8, seed: 5403, tint: RIM_TINT, avoid: avoidCamp });
  wildScatter("outcrop", { poly: [[175, -95], [285, -95], [235, 200], [165, 200]] }, { count: 8, seed: 5405, tint: RIM_TINT, avoid: avoidCamp });
  wildPlace("tor", SPURS.map((s, i) => ({ x: s.pts[1][0] + (i % 2 ? 4 : -4), z: s.pts[1][1] + 6, rot: i * 1.3 })), { tint: RIM_TINT });
  wildScatter("scree", { circle: [CRAG.x, CRAG.z, 34] }, { count: 7, seed: 5407, tint: RIM_TINT });
  // the pine stands: the upper walls, gathered by a slow noise into stands
  // with clearings between (not a treeline: RIM.md)
  const r = rng(5409), pines: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 6000 && pines.length < 110; i++) {
    const x = (r() - 0.5) * 640, z = (r() - 0.5) * 640;
    if (z < damZ(x) + 10 || !inPlate(x, z, 42) || noise2(x / 55, z / 55, 77) < 0.52) continue;
    if (ground(x, z) < LEVEL + 7 || slope(x, z) > 0.6 || lineDist(x, z, all) < 6 || scatterBlocked(x, z)) continue;
    if (inPoly(ORCHARD, x, z) || pines.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    pines.push({ x, z, scale: 1.1 + r() * 0.6, rot: r() * 6.28 });
  }
  placeExact("nature/Pine_2.gltf", pines.filter((_, i) => i % 2 === 0), 0.6);
  placeExact("nature/Pine_4.gltf", pines.filter((_, i) => i % 2 === 1), 0.6);
  // plants
  wildScatter("heather", { poly: [[-260, -95], [-165, -95], [-165, 205], [-215, 205]] }, { density: 1.2, color: "violet", seed: 5411, clump: { n: [3, 6], r: 6 } });
  wildScatter("heather", { poly: [[190, -95], [295, -95], [240, 205], [180, 205]] }, { density: 1.2, color: "violet", seed: 5413, clump: { n: [3, 6], r: 6 } });
  wildScatter("shrub", "zone", { density: 0.35, color: "olive", seed: 5415, clump: { n: [2, 5], r: 6 }, avoid: avoidCamp });
  wildScatter("wildflowers", "zone", { density: 0.45, color: "yellow", seed: 5417, clump: { n: [3, 7], r: 7 }, avoid: avoidCamp });
  wildScatter("fern_bed", { poly: [[-240, 60], [-140, 60], [-120, 200], [-200, 200]] }, { density: 0.9, seed: 5419, clump: { n: [2, 4], r: 5 } });
  wildScatter("stump", "zone", { count: 16, seed: 5421, tint: "#8a7a64", avoid: avoidCamp });
  // the waterline: reeds in clumps on the measured shore, drift wood on it
  const rr = rng(5423), reeds: WildSpot[] = [], drift: P[] = [];
  const shore = (x: number, z: number, lo: number, hi: number) => {
    const g = ground(x, z);
    return g > LEVEL + lo && g < LEVEL + hi && z > damZ(x) + 10 && inPlate(x, z, 30) && slope(x, z) < 0.35
      && lineDist(x, z, [...all, ...BOARD]) > 3 && Math.hypot(x - CAMP[0], z - CAMP[1]) > 34;
  };
  for (let i = 0; i < 9000 && reeds.length < 260; i++) {
    const x = (r() - 0.5) * 520, z = (r() - 0.5) * 560;
    if (!shore(x, z, -0.55, 0.15)) continue;
    const n = 2 + Math.floor(rr() * 4);
    for (let k = 0; k < n; k++) {
      const qx = x + (rr() - 0.5) * 6, qz = z + (rr() - 0.5) * 6;
      if (shore(qx, qz, -0.55, 0.2)) reeds.push({ x: qx, z: qz, rot: rr() * 6.28, scale: 0.8 + rr() * 0.5 });
    }
  }
  wildPlace("reeds", reeds, { color: "olive" });
  for (let i = 0; i < 6000 && drift.length < 18; i++) {
    const x = (r() - 0.5) * 520, z = (r() - 0.5) * 560;
    if (shore(x, z, 0.1, 0.8) && !drift.some(([a, b]) => Math.hypot(a - x, b - z) < 18)) drift.push([x, z]);
  }
  wildPlace("log", drift.slice(0, 12).map(([x, z], i) => ({ x, z, rot: i * 2.1, scale: 0.9 + (i % 3) * 0.15 })), { tint: "#8a7a64" });
  wildPlace("rootplate", drift.slice(12).map(([x, z], i) => ({ x, z, rot: i * 1.7 })), { tint: "#8a7a64" });
}
