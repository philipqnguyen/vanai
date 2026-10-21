// The Border Wall's places worth the walk, and its nature (the wilds revamp,
// 2026-10-10; tmp/wilds/zones/borderwall/PLAN.md). borderwall.ts lays the
// roads, the snow, the rampart, the tower, the stairs and the camp first, so
// every keep-clear test here reads them; this runs last in its build.
//
//   the Breach          the rampart thrown down mid-way to the east stair:
//                       its stones in the gap, the path through onto the snow
//   the Frozen Tarn     a cirque on the outer face under the peaks: the pond's
//                       basin under ice, frozen reeds, a headwall of rock
//   the Signal Crag     the western spur's cliffed end, a ruined watch post
//                       older than the wall on top, looking for the gold point
//   the Herald's Way    the King's Gardens road to the camp, marked in stone
//   the spurs, hollows  stone on the spurs' noses, heather on their crests,
//                       pines gathered into the hollows with fern under them
//
// Cost (RULINGS "Performance", by counting): every piece here is a pooled
// thin instance -- the wild kit's kinds (one pool per kind and colour; two
// flower colours, one leaf colour, the rim's stone tint with its snow) and
// the trees' own templates with their far doubles -- so the count of draws
// is the count of pools, never of instances. The cliff dressing takes the
// rim's tint and snow and joins the rim's own pools. No lights.
import { placeExact, ground, segDist, polySignedDist, zoneShape, scatterBlocked, flatZones, mat, scene, addMapOnlyWater } from "../scene";
import type { Road } from "../scene";
import { MeshBuilder } from "@babylonjs/core";
import { wildPlace, wildScatter } from "../wild-nature";
import type { WildSpot } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import { rng, noise2, slopeAt } from "../wild-terrain";
import {
  KEY, RIM_TINT, U, N, across, onCrest, GREAT, CAMP, HERALD_FOOT, BREACH_T, BREACH_HALF,
  TARN, TARN_R, CRAG, CRAG_C, CRAG_POST, CRAG_RAMP, SPURS, HOLLOWS, HERALD_WAY,
} from "./borderwall_plan";
import type { P } from "./borderwall_plan";

interface Ctx { roads: Road[]; paths: Road[]; stairs: [P, P][]; tarnLevel: number }

// the rampart's own stone (the Caerdun palette's), for what fell off it
const WALL_STONE = "#9a958a";
// the ruin kit's pale ashlar, weathered: older than the wall
const OLD_STONE = "#b4ae9f";

const slope = (x: number, z: number) => slopeAt(ground, x, z);
function lineDist(x: number, z: number, list: Road[]): number {
  let best = Infinity;
  for (const r of list) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d - r.half < best) best = d - r.half;
  }
  return best;
}
function inPlate(x: number, z: number, margin: number): boolean {
  const sh = zoneShape(KEY);
  return sh ? polySignedDist(sh.pts, x, z) > margin : true;
}
// a yaw whose local +z (a cliff's face) looks along (dx, dz):
// placeExact's sense, local +z -> (sin rot, cos rot)
const faceTo = (dx: number, dz: number) => Math.atan2(dx, dz);
// a yaw whose local +x runs along (dx, dz): local +x -> (cos rot, -sin rot)
const runAlong = (dx: number, dz: number) => Math.atan2(-dz, dx);
// spots along a polyline every `step` metres, local +x along it
function alongLine(pts: P[], step: number, start = step / 2): { x: number; z: number; rot: number }[] {
  const out: { x: number; z: number; rot: number }[] = [];
  let carry = start;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, rot = runAlong(ux, uz);
    let d = carry;
    for (; d <= L; d += step) out.push({ x: ax + ux * d, z: az + uz * d, rot });
    carry = d - L;
  }
  return out;
}

export function buildWilds(size: number, ctx: Ctx): void {
  const all = [...ctx.roads, ...ctx.paths];
  breach();
  frozenTarn(ctx.tarnLevel);
  signalCrag();
  heraldWay();
  spurs();
  pines(all);
  nature();
  // last: the steep faces the landforms made (the spurs' noses, the hollows'
  // banks, the crest's interior fall), dressed in the rim's own rock; the
  // crag's cliffs are its own slabs (one stone language per face)
  dressCliffs(KEY, size, { roads: all, tint: RIM_TINT, snow: true, avoid: [[CRAG_C[0], CRAG_C[1], CRAG.rx + 10], [TARN[0], TARN[1], TARN_R + 16]] });
}

// THE BREACH. Eighteen metres of the rampart came down here (makeRampart's
// skip leaves the gap, each end capped): its blocks lie where they fell,
// mostly outward, down the snow side -- a wall pushed over from within --
// with lengths of facing still upright at the broken ends, drums of a
// fallen merlon, scree, and the path walking through between them.
function breach(): void {
  const at = (t: number, d: number) => { const [x, z] = onCrest(BREACH_T + t, d); return { x, z }; };
  const wallRot = runAlong(U[0], U[1]);
  // the stubs of facing standing at the two broken ends, a little leant
  wildPlace("ruin_wall", [
    { ...at(-BREACH_HALF + 1.5, 2.5), rot: wallRot, sy: 0.85, scale: 1.05, lean: 0.06, leanX: N[0], leanZ: N[1] },
    { ...at(BREACH_HALF - 1.5, 2.6), rot: wallRot, sy: 0.7, scale: 1.05, lean: 0.1, leanX: N[0], leanZ: N[1] },
  ], { tint: WALL_STONE });
  // lengths thrown down the outer face, lying near flat
  wildPlace("ruin_wall", [
    { ...at(-5, 11), rot: wallRot + 0.35, sy: 0.4, lean: 1.25, leanX: N[0], leanZ: N[1] },
    { ...at(6, 13), rot: wallRot - 0.5, sy: 0.4, lean: 1.3, leanX: N[0], leanZ: N[1] },
    { ...at(-12, 18), rot: wallRot + 0.9, sy: 0.35, lean: 1.4, leanX: N[0] + U[0] * 0.4, leanZ: N[1] + U[1] * 0.4 },
  ], { tint: WALL_STONE, collide: false });
  wildPlace("drums", [{ ...at(-3, 7), rot: 0.4 }, { ...at(9, 6), rot: 2.1 }, { ...at(2, 19), rot: 1.2 }], { tint: WALL_STONE, collide: false });
  wildPlace("boulder", [{ ...at(-7, 5), rot: 0.3, scale: 0.9 }, { ...at(11, 9), rot: 1.4, scale: 0.8 }, { ...at(-14, 10), rot: 2.6, scale: 1.1 }], { tint: RIM_TINT, snow: true });
  wildPlace("scree", [at(0, 9), at(-8, 14), at(8, 16), at(-2, 24), at(5, -6)].map((p, i) => ({ ...p, rot: i * 1.3, scale: 1.1 })), { tint: WALL_STONE });
}

// THE FROZEN TARN. The pond's basin under a sheet of ice (the North Road's
// method: no water body, so the depth rule never bites and a character can
// cross it; a flat platform at the sheet's height), reeds frozen in at its
// edge, a headwall of the kit's cliffs and tors on the rim side with scree
// fans under it, and the path's last cairns on the near shore.
function frozenTarn(level: number): void {
  const [tx, tz] = TARN;
  const ice = MeshBuilder.CreateDisc("bw_ice", { radius: TARN_R * 1.15, tessellation: 40 }, scene);
  ice.rotation.x = Math.PI / 2;
  ice.position.set(tx, level + 0.04, tz);
  const im = mat("bw_icem", "#dfe8ef", { alpha: 0.96, spec: 0.5 });
  im.specularColor.set(0.5, 0.55, 0.6);
  ice.material = im;
  ice.receiveShadows = false;   // a flat receiver under snow shadows draws its own acne (the North Road's)
  ice.isPickable = false;
  // on the map as ice: TARN_POND only carves the basin, its build (which maps
  // its water) never runs. Map only, so the reeds and the headwall stay put
  addMapOnlyWater({ kind: "disc", x: tx, z: tz, r: TARN_R * 1.15, tone: "ice" });
  flatZones.push({ x0: tx - TARN_R, x1: tx + TARN_R, z0: tz - TARN_R, z1: tz + TARN_R, y: level + 0.04 });
  // frozen reeds round the shore, in clumps, ash-pale
  const r = rng(6101), reeds: WildSpot[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    if (r() < 0.35) continue;
    const rr = TARN_R * (1.05 + r() * 0.2);
    for (let k = 0; k < 3; k++) reeds.push({ x: tx + Math.cos(a) * rr + (r() - 0.5) * 2.5, z: tz + Math.sin(a) * rr + (r() - 0.5) * 2.5, rot: r() * 6.28, scale: 0.7 + r() * 0.4 });
  }
  wildPlace("reeds", reeds, { color: "ash" });
  // the headwall on the rim side: cliffs facing the ice, tors on their brow
  const head: WildSpot[] = [];
  for (let i = -2; i <= 2; i++) {
    const t = i * 0.32, dirx = N[0] * Math.cos(t) + U[0] * Math.sin(t), dirz = N[1] * Math.cos(t) + U[1] * Math.sin(t);
    const x = tx + dirx * (TARN_R + 17), z = tz + dirz * (TARN_R + 17);
    head.push({ x, z, rot: faceTo(-dirx, -dirz), scale: 1.05 + (i % 2 ? 0.2 : 0), yOff: -1.2 });
  }
  wildPlace("cliff", head, { tint: RIM_TINT, snow: true });
  wildPlace("tor", [-0.5, 0.15, 0.7].map((t, i) => {
    const dirx = N[0] * Math.cos(t) + U[0] * Math.sin(t), dirz = N[1] * Math.cos(t) + U[1] * Math.sin(t);
    return { x: tx + dirx * (TARN_R + 25), z: tz + dirz * (TARN_R + 25), rot: i * 2.2, scale: 1.2 + i * 0.15 };
  }), { tint: RIM_TINT, snow: true });
  wildPlace("scree", [-0.6, -0.15, 0.3, 0.65].map((t, i) => {
    const dirx = N[0] * Math.cos(t) + U[0] * Math.sin(t), dirz = N[1] * Math.cos(t) + U[1] * Math.sin(t);
    return { x: tx + dirx * (TARN_R + 8), z: tz + dirz * (TARN_R + 8), rot: i * 1.7, scale: 1.3 };
  }), { tint: RIM_TINT, snow: true });
  // the path's cairns across the snowfield, the last one on the shore
  wildPlace("cairn", [onCrest(BREACH_T + 12, 22), onCrest(500, 36), onCrest(560, 38), onCrest(606, 44)].map(([x, z], i) => ({ x: x + N[0] * 3, z: z + N[1] * 3, rot: i * 1.1 })), { tint: RIM_TINT, snow: true });
}

// THE SIGNAL CRAG. Its sides are the kit's cliff slabs stood round the
// table's rim with their faces out, each as tall as the drop it fronts (the
// Reservoir's Watch Crag found dressCliffs' rocks leave a mesa's 5 m edge
// band showing as stretched facets between them); the ramp's arc on the
// crest side is left open. On top, the watch post that kept the line
// before the wall did: two walls and their corner on the weather side, the
// gate arch where the ramp comes up, a column and its fallen drums, and a
// cairn at the lookout edge over the interior.
function signalCrag(): void {
  const spots: WildSpot[] = [];
  const [cx, cz] = CRAG_C;
  const rampAt = Math.atan2(CRAG_RAMP[1][1] - cz, CRAG_RAMP[1][0] - cx);
  const rot0 = Math.atan2(U[1], U[0]), c = Math.cos(rot0), s = Math.sin(rot0);
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * Math.PI * 2;
    // the ellipse in the crag's own frame, local x along the crest
    const lx = (CRAG.rx + 1.5) * Math.cos(t), lz = (CRAG.rz + 1.5) * Math.sin(t);
    const x = cx + lx * c - lz * s, z = cz + lx * s + lz * c;
    let d = Math.abs(Math.atan2(z - cz, x - cx) - rampAt); d = Math.min(d, Math.PI * 2 - d);
    if (d < 0.55) continue;
    const ox = x - cx, oz = z - cz, oL = Math.hypot(ox, oz);
    const low = Math.min(...[0, 3, 6, 10].map((e) => ground(x + ox / oL * e, z + oz / oL * e)));
    const sc = Math.max(0.6, Math.min(1.9, (CRAG.top - low + 0.6) / 8));
    if (CRAG.top - low < 3) continue;   // where the spur meets the table there is no drop to front
    spots.push({ x, z, rot: faceTo(ox / oL, oz / oL), scale: sc, sx: Math.max(0.95, sc) * 0.95, sz: Math.min(1.2, sc) });
  }
  wildPlace("cliff", spots, { tint: RIM_TINT, snow: true });
  const [px, pz] = CRAG_POST;
  const A = { tint: OLD_STONE };
  const wr = runAlong(U[0], U[1]), nr = runAlong(N[0], N[1]);
  const off = (a: number, b: number): { x: number; z: number } => ({ x: px + U[0] * a + N[0] * b, z: pz + U[1] * a + N[1] * b });
  wildPlace("ruin_corner", [{ ...off(-4.5, -4.5), rot: wr, scale: 1.1 }], A);
  wildPlace("ruin_wall", [{ ...off(0, -4.7), rot: wr, scale: 1.1 }, { ...off(-4.7, 0.2), rot: nr, scale: 1.1, sy: 0.8 }], A);
  wildPlace("arch", [{ ...off(1, 5.4), rot: wr, scale: 1.1 }], A);
  wildPlace("column", [{ ...off(4.6, 3.8), rot: 0.3, scale: 1.1 }], A);
  wildPlace("drums", [{ ...off(3.8, -1.5), rot: 1.1 }], { ...A, collide: false });
  wildPlace("cairn", [{ ...off(3, -9), rot: 0.4 }], { tint: RIM_TINT, snow: true });
  wildScatter("scree", { circle: [cx, cz, CRAG.rx + 16] }, { count: 6, seed: 6201, tint: RIM_TINT, snow: true });
}

// THE HERALD'S WAY. Waymarkers on the uphill verge every so often from the
// King's Gardens road to the camp: the road the embassy climbed.
function heraldWay(): void {
  const marks = alongLine(HERALD_WAY, 13, 6).map((p, i) => {
    // the verge: 3 m off the line, on the side away from the drop
    const k = i % 2 ? 1 : -1, [ux, uz] = [Math.cos(p.rot), -Math.sin(p.rot)];
    return { x: p.x - uz * 3.2 * k, z: p.z + ux * 3.2 * k, rot: p.rot };
  });
  wildPlace("waymarker", marks, { tint: OLD_STONE });
  // and its foot: two old piers either side of the road from the Gardens
  wildPlace("column", [{ x: HERALD_FOOT[0] - 6, z: HERALD_FOOT[1] + 2, rot: 0.2, sy: 0.7 }, { x: HERALD_FOOT[0] + 6, z: HERALD_FOOT[1] + 2, rot: 1.0, sy: 0.75 }], { tint: OLD_STONE });
}

// THE SPURS. Stone where each one ends (outcrops on the nose, a tor), heather
// along the crests, scree on their flanks.
function spurs(): void {
  const tors: WildSpot[] = [], outcrops: WildSpot[] = [];
  SPURS.slice(1).forEach((s, i) => {
    const [ex, ez] = s.pts[s.pts.length - 1], [mx, mz] = s.pts[1];
    tors.push({ x: mx + U[0] * (i % 2 ? 5 : -5), z: mz + U[1] * (i % 2 ? 5 : -5), rot: i * 1.3, scale: 0.9 + i * 0.1 });
    outcrops.push({ x: ex, z: ez, rot: runAlong(U[0], U[1]) + i * 0.4, scale: 1.2 }, { x: (ex + mx) / 2 + U[0] * 7, z: (ez + mz) / 2 + U[1] * 7, rot: i * 0.9 });
  });
  wildPlace("tor", tors, { tint: RIM_TINT, snow: true });
  wildPlace("outcrop", outcrops, { tint: RIM_TINT, snow: true });
  for (const [i, s] of SPURS.entries()) {
    const [ax, az] = s.pts[0], [bx, bz] = s.pts[s.pts.length - 1];
    wildScatter("heather", { poly: [[ax - U[0] * 14, az - U[1] * 14], [ax + U[0] * 14, az + U[1] * 14], [bx + U[0] * 18, bz + U[1] * 18], [bx - U[0] * 18, bz - U[1] * 18]] },
      { density: 2.4, color: "violet", seed: 6301 + i, clump: { n: [3, 6], r: 5 } });
    wildScatter("scree", { circle: [bx, bz, 26] }, { count: 3, seed: 6311 + i, tint: RIM_TINT, snow: true });
  }
}

// THE PINES. Gathered into stands by a slow noise, thickest in the hollows
// and on the lower slope (the old scatter put 140 evenly along one band
// under the road); a few wind-cut dwarfs out on the snow side. Not a
// treeline (RIM.md): nothing within 42 m of the plate's edge.
function pines(all: Road[]): void {
  const r = rng(6401), out: { x: number; z: number; scale: number; rot: number }[] = [];
  const keep: [number, number, number][] = [[GREAT[0], GREAT[1], 26], [CAMP[0], CAMP[1], 26], [HERALD_FOOT[0], HERALD_FOOT[1], 16], [CRAG_C[0], CRAG_C[1], CRAG.rx + 6], [TARN[0], TARN[1], TARN_R + 14],
    // the west stair's head, where the view runs along the wall to the tower
    [-262, -196, 12]];
  const hollow = (x: number, z: number) => HOLLOWS.some((h) => h.pts.some(([hx, hz], i) => i > 0 && Math.hypot(x - hx, z - hz) < 40));
  for (let i = 0; i < 9000 && out.length < 190; i++) {
    const x = (r() - 0.5) * 680, z = (r() - 0.5) * 680;
    const d = across(x, z);
    if (d > -30 || !inPlate(x, z, 42)) continue;
    const n = noise2(x / 60, z / 60, 47) + (hollow(x, z) ? 0.22 : 0) + (d < -110 ? 0.08 : 0);
    if (n < 0.58) continue;
    if (slope(x, z) > 0.55 || lineDist(x, z, all) < 5 || scatterBlocked(x, z)) continue;
    if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 6.5)) continue;
    out.push({ x, z, scale: 1.0 + r() * 0.75, rot: r() * 6.28 });
  }
  // the snow side: a handful of low, wind-cut ones in the lee of the drifts
  for (let i = 0; i < 4000 && out.length < 214; i++) {
    const x = (r() - 0.5) * 680, z = (r() - 0.5) * 680;
    const d = across(x, z);
    if (d < 24 || !inPlate(x, z, 42) || noise2(x / 40, z / 40, 49) < 0.62) continue;
    if (slope(x, z) > 0.5 || lineDist(x, z, all) < 5 || scatterBlocked(x, z)) continue;
    if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    out.push({ x, z, scale: 0.6 + r() * 0.3, rot: r() * 6.28 });
  }
  placeExact("nature/Pine_4.gltf", out.filter((_, i) => i % 2 === 0), 0.8, { snowCaps: "up" });
  placeExact("nature/Pine_5.gltf", out.filter((_, i) => i % 2 === 1), 0.8, { snowCaps: "up" });
}

// THE NATURE. Stone in the rim's tint and snow everywhere it belongs; on the
// interior, fern under the pines in the hollows, shrubs and fallen wood,
// white and blue alpine flowers in drifts over the open turf; heather is the
// spurs'. The outer face stays snow and stone.
function nature(): void {
  const avoidCore: [number, number, number][] = [[CAMP[0], CAMP[1], 28], [GREAT[0], GREAT[1], 22], [CRAG_C[0], CRAG_C[1], CRAG.rx + 4], [TARN[0], TARN[1], TARN_R + 6]];
  const interior: P[] = [onCrest(30, -30), onCrest(720, -30), onCrest(720, -260), onCrest(30, -260)];
  const outer: P[] = [onCrest(30, 22), onCrest(730, 22), onCrest(730, 140), onCrest(30, 140)];
  wildScatter("boulder", { poly: interior }, { count: 55, seed: 6501, tint: RIM_TINT, snow: true, scale: [0.8, 1.9], avoid: avoidCore, inset: 35 });
  wildScatter("boulder", { poly: outer }, { count: 26, seed: 6503, tint: RIM_TINT, snow: true, scale: [0.9, 2.0], avoid: avoidCore, inset: 35 });
  wildScatter("tor", { poly: outer }, { count: 5, seed: 6505, tint: RIM_TINT, snow: true, avoid: avoidCore, inset: 40 });
  wildScatter("outcrop", { poly: interior }, { count: 8, seed: 6507, tint: RIM_TINT, snow: true, avoid: avoidCore, inset: 40 });
  wildScatter("scree", { poly: outer }, { count: 10, seed: 6509, tint: RIM_TINT, snow: true, avoid: avoidCore, inset: 35 });
  // the hollows: fern and fallen wood under the pines, the dry beds' stones
  for (const [i, h] of HOLLOWS.entries()) {
    const [ax, az] = h.pts[0], [bx, bz] = h.pts[h.pts.length - 1];
    const poly: P[] = [[ax - U[0] * 26, az - U[1] * 26], [ax + U[0] * 26, az + U[1] * 26], [bx + U[0] * 26, bz + U[1] * 26], [bx - U[0] * 26, bz - U[1] * 26]];
    wildScatter("fern_bed", { poly }, { density: 1.6, seed: 6601 + i, clump: { n: [2, 5], r: 5 } });
    wildScatter("log", { poly }, { count: 4, seed: 6611 + i, tint: "#7e7062" });
    wildScatter("stump", { poly }, { count: 4, seed: 6621 + i, tint: "#7e7062" });
    wildScatter("rootplate", { poly }, { count: 1, seed: 6631 + i, tint: "#7e7062" });
    // the meltwater bed's stones, down its line
    wildPlace("boulder", alongLine(h.pts, 17, 10).map((p, k) => ({ x: p.x + (k % 2 ? 1.5 : -1.5), z: p.z, rot: k * 1.9, scale: 0.6 + (k % 3) * 0.2 })), { tint: RIM_TINT, snow: true, collide: false });
  }
  wildScatter("shrub", { poly: interior }, { density: 0.3, color: "dark", seed: 6701, clump: { n: [2, 4], r: 5 }, avoid: avoidCore });
  wildScatter("wildflowers", { poly: interior }, { density: 0.4, color: "white", seed: 6703, clump: { n: [3, 7], r: 7 }, avoid: avoidCore });
  wildScatter("wildflowers", { poly: interior }, { density: 0.22, color: "blue", seed: 6705, clump: { n: [3, 6], r: 6 }, avoid: avoidCore });
}
