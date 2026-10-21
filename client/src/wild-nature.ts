// THE WILD NATURE KIT: the pieces a wild zone is dressed with beyond its trees
// and its meadow -- cliff faces to line a slope, outcrops and tors, boulders
// and scree, standing stones and cairns, fallen logs, stumps and root plates,
// shrubs, brambles, heather, fern beds, wildflower drifts and reed beds, and
// ruins (broken wall runs, a house corner, columns and their fallen drums, a
// half-fallen arch, a waymarker). Original, generated at load like nature.ts:
// the stone is nature.ts's triplanar rock (so a cliff and a pebble share one
// surface language), the plants are the trees' painted-sheet foliage shader
// (wind, ramp, tint, snow), the wood is the broadleaf bark.
//
// WHY IT IS CHEAP, whatever a zone places (wild-nature-plan.ts holds the
// numbers and the node tests hold them to it):
//
// - Every kind is a POOL: one near mesh at full detail and one far mesh, a
//   cheap double built by the same generator at a lower resolution and in the
//   same materials (so light and colour carry across the swap at any hour, as
//   the trees' doubles do). Each is ONE thin-instanced mesh; its buffer holds
//   whichever instances' cells are at its level now. A kind costs its near
//   sub-meshes plus its far ones in draws -- 2 for most, 3 for the plants with
//   wood in them -- for ten instances or ten thousand.
// - Instances are bucketed in 32 m cells; each cell picks near, far or culled
//   by its distance from the camera, with hysteresis, and only a pool whose
//   cells changed level rewrites its buffers (the cities' pooled LOD cells,
//   zones/city_pools.ts, without their per-cell meshes).
// - Only near pools of pieces big enough to throw a shadow feed the shadow
//   cascades; small plants and every far pool never do (scene.ts SMALL_VEG,
//   the cities' "shadows from near cells only"). Only the big stone near
//   pools stay in the glow pass as occluders.
//
// The placement API (wildPlace / wildScatter / wildLine) keeps pieces off the
// zone's roads, water, buildings, pavings, portals and landings, crystals,
// NPCs, nodes and interactables (read from zones.json and the map layers at
// call time), off ground too steep for the kind, and off each other -- so a
// zone agent says WHERE in broad strokes and the kit keeps the game playable.
import {
  Color3, Matrix, Mesh, PBRMaterial, Quaternion, Scene, Vector3, VertexData,
} from "@babylonjs/core";
import {
  scene, glow, addShadowCaster, buildApi, circleColliders, scatterBlocked, vegBlocked, waterBodies,
  zoneShape, polySignedDist, zoneMapLayers, zoneFootprints, pavingHeight, zoneModule, currentZoneKey,
} from "./scene";
import { foliageMaterial, woodMaterial, leafSheetFor, mulberry, curve, norm, cross, tube, sheet, canvasSheet, grey, type V3, type Limb } from "./trees";
import { Parts, type Part, card, uprightCard, sheetOf, drawBlades, drawFern, drawHead, drawPetals, drawBerries, stoneMaterial, logMaterial, type Head } from "./nature";
import {
  WILD_KINDS, LEAF_RAMPS, FLOWER_RAMPS, DEFAULT_COLOR, bucketCells, cellDistance, levelOf, splitLevels, poolKey,
  samplePoints, linePoints, areaSize, segDistance, dataClearings, type KindSpec, type WildArea, type WildCell, type P2,
} from "./wild-nature-plan";
import { ZONES } from "./data";

export { WILD_KINDS, LEAF_RAMPS, FLOWER_RAMPS, poolDraws, wildDrawBudget } from "./wild-nature-plan";
export type { WildArea } from "./wild-nature-plan";

// ═══════════════════════════════ geometry helpers ═══════════════════════════
// A transform for a generator's output: scale, then roll (about z), pitch
// (about x), yaw (about y, placeExact's sense: local +x -> (cos, 0, -sin)),
// then move. No mirror ever, so a generator's winding survives it.
type Xf = (v: V3) => V3;
function xf(t: V3, yaw = 0, pitch = 0, roll = 0, s: V3 = [1, 1, 1]): Xf {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  return ([x, y, z]) => {
    x *= s[0]; y *= s[1]; z *= s[2];
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
    return [x1 * cy + z2 * sy + t[0], y2 + t[1], -x1 * sy + z2 * cy + t[2]];
  };
}
const rnd = (seed: number) => { const r = mulberry(seed); return { r, rr: (a: number, b: number) => a + r() * (b - a) }; };
const noise3 = (x: number, y: number, z: number, f: number) =>
  Math.sin(x * f * 1.7 + y * f * 0.6 + 1.3) * Math.sin(y * f * 1.3 - z * f * 0.8 + 0.4) * Math.sin(z * f * 1.1 + x * f * 0.9 + 2.1);

// Welded unit icospheres: the triplanar shader needs no UVs, and a UV seam
// would split the smooth normals down a stone's side (nature.ts buildStone).
// Babylon's `subdivisions` grows linearly: 1 is the bare icosahedron (12
// vertices, angular -- scree), 2 is 42, 4 is 162, 7 is 492.
const icoCache = new Map<number, { pos: number[]; idx: number[] }>();
function ico(sub: number): { pos: number[]; idx: number[] } {
  let c = icoCache.get(sub);
  if (c) return c;
  const v = VertexData.CreateIcoSphere({ radius: 1, subdivisions: sub, flat: false });
  const map = new Map<string, number>(), pos: number[] = [], remap: number[] = [];
  const src = v.positions!;
  for (let i = 0; i < src.length / 3; i++) {
    const k = `${src[i * 3].toFixed(4)},${src[i * 3 + 1].toFixed(4)},${src[i * 3 + 2].toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]); }
    remap.push(j);
  }
  c = { pos, idx: Array.from(v.indices!).map((i) => remap[i]) };
  icoCache.set(sub, c);
  return c;
}

/** One stone: a welded icosphere pushed about by lobes and noise, settled
 * (wider at the foot), optionally terraced into ledges and split by a face,
 * clamped at its buried foot. Every random choice is drawn from `seed` before
 * the resolution matters, so the near stone and its far double are the SAME
 * stone at two resolutions. `uv` writes a wrap for bark (the triplanar stone
 * ignores it). */
interface BlobOpts {
  seed: number; sub: number; c: V3; r: V3;
  yaw?: number; pitch?: number; roll?: number;
  lumpy?: number; ledge?: number; split?: boolean; bury?: number; taper?: number; ao?: number; uv?: boolean;
}
function blob(p: Part, o: BlobOpts): void {
  const { r: rand, rr } = rnd(o.seed);
  const lumpy = o.lumpy ?? 1;
  const lobes = Array.from({ length: 6 }, () => ({ d: norm([rr(-1, 1), rr(-0.3, 0.8), rr(-1, 1)]), k: rr(-0.2, 0.28) * lumpy, w: rr(2, 6) }));
  const ph = [rr(0, 6), rr(0, 6), rr(0, 6)];
  const step = o.ledge ?? 0;
  const split = o.split && rand() < 0.7 ? { n: norm([rr(-1, 1), rr(0, 0.6), rr(-1, 1)]), d: rr(0.55, 0.75) } : null;
  const bury = o.bury ?? 0.35, taper = o.taper ?? 0.25;
  const g = ico(o.sub), base = p.pos.length / 3, X = xf(o.c, o.yaw, o.pitch, o.roll, o.r);
  for (let i = 0; i < g.pos.length; i += 3) {
    const d: V3 = [g.pos[i], g.pos[i + 1], g.pos[i + 2]];
    let rad = 1;
    for (const l of lobes) rad += l.k * Math.pow(Math.max(0, d[0] * l.d[0] + d[1] * l.d[1] + d[2] * l.d[2]), l.w);
    rad += lumpy * (0.14 * noise3(d[0] + ph[0], d[1] + ph[1], d[2] + ph[2], 1.6) + 0.06 * noise3(d[0] + ph[1], d[1], d[2] + ph[2], 3.7));
    const tp = 1 - taper * Math.max(0, d[1]);
    let q: V3 = [d[0] * rad * tp, d[1] * rad, d[2] * rad * tp];
    if (step > 0 && q[1] > 0) { const t = q[1] / step, f = t - Math.floor(t), s = f * f * (3 - 2 * f); q[1] = (Math.floor(t) + f * 0.4 + s * 0.6) * step; }
    if (split) { const e = q[0] * split.n[0] + q[1] * split.n[1] + q[2] * split.n[2] - split.d; if (e > 0) q = [q[0] - split.n[0] * e * 0.85, q[1] - split.n[1] * e * 0.85, q[2] - split.n[2] * e * 0.85]; }
    q[1] = Math.max(q[1], -bury);
    const w = X(q);
    p.pos.push(w[0], w[1], w[2]);
    if (o.uv) p.uv.push(Math.atan2(d[2], d[0]) / Math.PI * 1.5, q[1] * 0.8); else p.uv.push(0, 0);
    const hgt = (q[1] + bury) / (1 + bury);
    const ao = (o.ao ?? 1) * (0.6 + 0.4 * Math.min(1, hgt * 1.7)) * (1 + 0.06 * noise3(d[0], d[1], d[2], 2.3));
    p.col.push(ao, ao, ao * 0.98, 1);
  }
  for (const i of g.idx) p.idx.push(base + i);
}

/** A closed solid of stacked rings: `ring(a, j)` gives ring j's point at angle
 * a (radians, counter-clockwise from +x seen from above), a top fan to `top`
 * and a bottom fan to `bottom`. Cliffs, standing stones, columns, stumps.
 * The winding is the tube's (trees.ts) mirrored, since the angle runs the
 * other way round: (a, a+1, b) outward. */
function ringSolid(p: Part, S: number, rings: number, ring: (a: number, j: number) => V3, top: V3 | null, bottom: V3 | null, ao: (v: V3, j: number) => number, uv = false): void {
  const base = p.pos.length / 3;
  for (let j = 0; j < rings; j++) for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2, v = ring(a, j);
    p.pos.push(v[0], v[1], v[2]);
    p.uv.push(uv ? (i / S) * 3 : 0, uv ? v[1] * 0.7 : 0);
    const c = ao(v, j); p.col.push(c, c, c * 0.98, 1);
  }
  for (let j = 0; j + 1 < rings; j++) for (let i = 0; i < S; i++) {
    const a = base + j * S + i, a1 = base + j * S + ((i + 1) % S), b = a + S, b1 = a1 + S;
    p.idx.push(a, a1, b, a1, b1, b);
  }
  if (top) {
    const c = p.pos.length / 3, t0 = base + (rings - 1) * S;
    p.pos.push(...top); p.uv.push(0, 0); const k = ao(top, rings); p.col.push(k * 1.05, k * 1.02, k * 0.95, 1);
    for (let i = 0; i < S; i++) p.idx.push(t0 + i, t0 + ((i + 1) % S), c);
  }
  if (bottom) {
    const c = p.pos.length / 3;
    p.pos.push(...bottom); p.uv.push(0, 0); p.col.push(0.5, 0.5, 0.5, 1);
    for (let i = 0; i < S; i++) p.idx.push(c, base + ((i + 1) % S), base + i);
  }
}

/** A dressed block: Babylon's own box (24 vertices, its own winding) with its
 * corners weathered a little and the transform applied; flat faces once
 * normals are computed. */
function block(p: Part, X: Xf, hx: number, hy: number, hz: number, jit: number, tone: number, rand: () => number): void {
  const v = VertexData.CreateBox({ width: hx * 2, height: hy * 2, depth: hz * 2 });
  const corner = new Map<string, V3>();
  const base = p.pos.length / 3, src = v.positions!;
  for (let i = 0; i < src.length; i += 3) {
    const k = `${Math.sign(src[i])}${Math.sign(src[i + 1])}${Math.sign(src[i + 2])}`;
    let j = corner.get(k);
    if (!j) { j = [(rand() - 0.5) * jit, (rand() - 0.5) * jit, (rand() - 0.5) * jit]; corner.set(k, j); }
    const w = X([src[i] + j[0], src[i + 1] + j[1], src[i + 2] + j[2]]);
    p.pos.push(w[0], w[1], w[2]); p.uv.push(0, 0);
    const ao = tone * (src[i + 1] < 0 ? 0.8 : 1);
    p.col.push(ao, ao, ao * 0.97, 1);
  }
  for (const i of v.indices!) p.idx.push(base + i);
}

// ═══════════════════════════════ materials ══════════════════════════════════
// One set per pool key: the stone, the worked stone, the moss, the bark (all
// PBR; the stone ones the triplanar plugin), the plants' painted sheets on the
// trees' foliage shader. Shared across pools wherever the key matches -- the
// cache is the lower layer's (stoneMaterial, foliageMaterial).
interface MatOpts { color: string; tint: string | null; snow: boolean }
const barkMats = new WeakMap<Scene, Map<string, PBRMaterial>>();
// MEASURED in the lineup: the bare broadleaf sheet renders as pale driftwood
// on a fallen log in open sun; a weathered brown is the default multiply
const BARK = "#7a6450";
function barkMaterial(sc: Scene, tintIn: string | null): PBRMaterial {
  const tint = tintIn ?? BARK;
  let m = barkMats.get(sc);
  if (!m) { m = new Map(); barkMats.set(sc, m); }
  let mat = m.get(tint);
  if (!mat) {
    // the log's own sheet, multiplied (a zone's tint: the Burned Land's char)
    const src = logMaterial(sc);
    mat = new PBRMaterial(`wildBark_${tint}`, sc);
    mat.albedoTexture = src.albedoTexture; mat.bumpTexture = src.bumpTexture;
    mat.albedoColor = Color3.FromHexString(tint);
    mat.metallic = 0; mat.roughness = 1; mat.environmentIntensity = 0.3;
    m.set(tint, mat);
  }
  return mat;
}
const rock = (sc: Scene, o: MatOpts, scale?: number) => stoneMaterial(sc, "rock", o.tint, o.snow, false, scale);
const ashlar = (sc: Scene, o: MatOpts) => stoneMaterial(sc, "ashlar", o.tint, o.snow, false, 0.55);
const moss = (sc: Scene, o: MatOpts) => stoneMaterial(sc, "moss", null, o.snow, false, 0.9);
const leafRamp = (o: MatOpts) => LEAF_RAMPS[o.color] ?? LEAF_RAMPS.green;
const flowerRamp = (o: MatOpts) => FLOWER_RAMPS[o.color] ?? FLOWER_RAMPS.white;

// Heather: fine sprigs, dark at the base, a froth of bright florets up the top
// third; the ramp turns the dark to the shrub's green and the bright to bloom.
function drawHeather(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  for (let i = 0; i < 70; i++) {
    const x = S * (0.08 + rand() * 0.84), h = S * (0.5 + rand() * 0.48), lean = (rand() - 0.5) * 60;
    ctx.strokeStyle = grey(0.18 + rand() * 0.12); ctx.lineWidth = 2 + rand() * 2;
    ctx.beginPath(); ctx.moveTo(x, S); ctx.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h); ctx.stroke();
    for (let k = 0; k < 14; k++) {
      const t = 0.62 + rand() * 0.38, px = x + lean * t * t, py = S - h * t;
      ctx.fillStyle = grey(0.7 + rand() * 0.3);
      ctx.beginPath(); ctx.ellipse(px + (rand() - 0.5) * 10, py, 3 + rand() * 2.5, 4 + rand() * 3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
// Reeds: long straight strap blades, a few broken over at the tip.
function drawReeds(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  for (let i = 0; i < 34; i++) {
    const x = S * (0.06 + rand() * 0.88), h = S * (0.6 + rand() * 0.4), w = 4 + rand() * 5, lean = (rand() - 0.5) * 70, l = 0.6 + rand() * 0.4;
    const g = ctx.createLinearGradient(0, S, 0, S - h);
    g.addColorStop(0, grey(l * 0.45)); g.addColorStop(0.6, grey(l * 0.8)); g.addColorStop(1, grey(l));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - w / 2, S);
    ctx.quadraticCurveTo(x + lean * 0.2, S - h * 0.5, x + lean, S - h);
    ctx.quadraticCurveTo(x + lean * 0.2 + w * 0.4, S - h * 0.5, x + w / 2, S); ctx.fill();
  }
}
const HEAD_OF: Record<string, Head> = { white: "daisy", yellow: "five", blue: "star", red: "poppy", violet: "star", pink: "five", orange: "poppy" };

// ═══════════════════════════════ the pieces ═════════════════════════════════
// Each builder fills `parts` for level 0 (near) or 1 (far) and returns the
// height the plants' wind reads (0 for stone and wood). Unit: metres at scale 1.
type Builder = (sc: Scene, parts: Parts, lod: 0 | 1, o: MatOpts) => number;
const UP: V3 = [0, 1, 0];

// ── stone ───────────────────────────────────────────────────────────────────
// THE CLIFF: an escarpment slab 12 m along x, 5 m deep, 8 m high, its face
// +z. Bedded: horizontal strata, each band set back or standing proud by its
// own amount with a sharp ledge between (two rings close either side of every
// bedding plane), cut by vertical joints into columns of their own depth -- a
// face reads as a weathered scarp at 100 m and as ledges and blocks at 5.
// A boxy plan (superellipse, n = 4) so pieces butt up into a continuous wall.
const cliff: Builder = (sc, parts, lod, o) => {
  // 0.38/m: MEASURED, at 0.2 the sheet's veins read as contour lines and its
  // lichen spots as black blotches a hand across
  const p = parts.part(rock(sc, o, 0.38), true);
  const { r: rand, rr } = rnd(7311);
  const W = 6, D = 2.5, H = 8, Y0 = -1.6;
  const bands: { y0: number; y1: number; inset: number }[] = [];
  for (let y = Y0; y < H - 0.4;) { const t = Math.min(H, y + rr(0.8, 1.7)); bands.push({ y0: y, y1: t, inset: rr(0, 0.55) }); y = t; }
  bands[bands.length - 1].y1 = H;
  const cols = Array.from({ length: 13 }, () => ({ w: rr(0.6, 1.4), inset: rr(0, 0.5) }));
  const cw = cols.reduce((s, c) => s + c.w, 0);
  const colInset = (a: number) => {
    let t = (a / (Math.PI * 2)) * cw;
    for (let i = 0; i < cols.length; i++) {
      if (t < cols[i].w) {
        const e = Math.min(t, cols[i].w - t) / 0.12, n = cols[(i + 1) % cols.length], pv = cols[(i - 1 + cols.length) % cols.length];
        const nb = t < cols[i].w / 2 ? pv : n;
        return e >= 1 ? cols[i].inset : (cols[i].inset + nb.inset) / 2 + (cols[i].inset - nb.inset) / 2 * e;
      }
      t -= cols[i].w;
    }
    return cols[0].inset;
  };
  const ys: { y: number; b: number }[] = [];
  bands.forEach((b, i) => {
    if (lod === 0) { ys.push({ y: b.y0 + 0.07, b: i }, { y: (b.y0 + b.y1) / 2, b: i }, { y: b.y1 - 0.07, b: i }); }
    else ys.push({ y: b.y0 + 0.05, b: i }, { y: b.y1 - 0.05, b: i });
  });
  const ph = rr(0, 6);
  const ring = (a: number, j: number): V3 => {
    const { y, b } = ys[j], band = bands[b];
    const c = Math.cos(a), s = Math.sin(a);
    const px = W * Math.sign(c) * Math.pow(Math.abs(c), 0.5), pz = D * Math.sign(s) * Math.pow(Math.abs(s), 0.5);
    const taper = 1 - 0.035 * Math.max(0, y) - (y > H - 1 ? 0.08 : 0);
    const r0 = Math.hypot(px, pz) || 1;
    // the face (+z) carries the joints; the back, which a slope buries, less
    const jointy = s > 0 ? 1 : 0.4;
    const inset = band.inset + colInset(a) * jointy + 0.1 * noise3(px * 0.6 + ph, y * 0.5, pz * 0.6, 1.3);
    const k = Math.max(0.3, (r0 * taper - inset) / r0);
    // the crown is broken: the last ring rises and falls along the scarp
    const crown = j === ys.length - 1 ? 0.45 * noise3(px * 0.5 + ph, 0, pz * 0.5, 0.9) + 0.25 * Math.sin(px * 1.3 + ph) : 0;
    return [px * k, y + crown, pz * k];
  };
  const S = lod === 0 ? 64 : 16;
  ringSolid(p, S, ys.length, ring, [0.2, H + 0.25, -0.1], [0, Y0 - 0.2, 0], (v, j) => {
    const b = ys[Math.min(j, ys.length - 1)];
    const ao = 0.62 + 0.38 * Math.min(1, (v[1] - Y0) / (H - Y0) * 1.3);
    return ao * (1 - bands[b.b].inset * 0.35);
  });
  void rand;
  return 0;
};

// THE OUTCROP: bedrock breaking the turf -- three long stones whose ledges run
// tilted (the strata dip one way across the whole outcrop), mostly buried.
const outcrop: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o), true);
  const dip = 0.26;
  const pieces: [V3, V3, number][] = [[[-2.3, 0, 0.1], [3.1, 1.6, 1.9], 0.15], [[0.9, 0.2, -0.3], [2.9, 2.1, 1.7], -0.1], [[3.4, -0.1, 0.5], [2.0, 1.2, 1.4], 0.3]];
  pieces.forEach(([c, r, yaw], i) => blob(p, { seed: 5101 + i * 17, sub: lod === 0 ? 7 : 2, c, r, yaw, roll: dip, ledge: 0.24, split: true, bury: 0.45, taper: 0.2 }));
  return 0;
};

// THE TOR: pillow slabs stacked, each a little turned and set off the one
// below, rounding as they rise (granite weathers along its joints into this).
const tor: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o), true);
  const slabs: [V3, V3, number][] = [
    [[0, 0.35, 0], [2.7, 1.0, 2.3], 0], [[0.3, 1.75, -0.2], [2.1, 0.75, 1.8], 0.4],
    [[-0.2, 2.85, 0.15], [1.55, 0.62, 1.3], -0.3], [[0.25, 3.8, 0], [0.95, 0.55, 0.85], 0.9],
  ];
  slabs.forEach(([c, r, yaw], i) => blob(p, { seed: 6201 + i * 31, sub: lod === 0 ? 6 : 2, c, r, yaw, lumpy: 0.7, split: i === 0, bury: i === 0 ? 0.4 : 0.8, taper: 0.12, ao: 0.85 + i * 0.05 }));
  return 0;
};

const boulder: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o), true);
  blob(p, { seed: 4407, sub: lod === 0 ? 7 : 2, c: [0, 0.85, 0], r: [1.55, 1.35, 1.4], ledge: 0.28, split: true, bury: 0.5 });
  return 0;
};

// SCREE: a fan of angular stones, the big ones fewer -- the bare icosahedron
// is the angular shape; near they get one subdivision, far only the six
// biggest stay.
const scree: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o, 0.6), true);
  const { rr } = rnd(8801);
  const stones = Array.from({ length: 24 }, (_, i) => {
    const a = rr(0, 6.28), d = Math.pow(rr(0, 1), 0.8) * 3, s = 0.2 + Math.pow(rr(0, 1), 2) * 0.62;
    return { c: [Math.cos(a) * d, s * 0.25, Math.sin(a) * d] as V3, s, yaw: rr(0, 6.28), i };
  }).sort((a, b) => b.s - a.s);
  (lod === 0 ? stones : stones.slice(0, 6)).forEach((st) =>
    blob(p, { seed: 8810 + st.i, sub: lod === 0 ? 2 : 1, c: st.c, r: [st.s, st.s * 0.6, st.s * 0.85], yaw: st.yaw, lumpy: 1.3, bury: 0.4, taper: 0.1 }));
  return 0;
};

// THE STANDING STONE: a slab, broad face to +z, tapering, its top sheared on
// a slant; the lichen is the stone shader's moss on what faces up.
const standingStone: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o, 0.5), true);
  const H = 3.6, Y0 = -0.4, S = lod === 0 ? 20 : 7;
  const ys = lod === 0 ? [Y0, 0.2, 0.9, 1.7, 2.4, 3.0, 3.35] : [Y0, 1.5, 3.3];
  const ring = (a: number, j: number): V3 => {
    const y = ys[j], t = Math.max(0, y) / H, c = Math.cos(a), s = Math.sin(a);
    const w = 0.78 * (1 - 0.3 * t) * (1 + 0.04 * Math.sin(y * 3)), d = 0.34 * (1 - 0.2 * t);
    const px = w * Math.sign(c) * Math.pow(Math.abs(c), 0.7), pz = d * Math.sign(s) * Math.pow(Math.abs(s), 0.7);
    const n = 1 + 0.07 * noise3(px * 2, y * 1.3, pz * 2, 1.1);
    // the sheared top: the last ring rises toward -x
    const yy = j === ys.length - 1 ? y + 0.25 * (-px / w) : y;
    return [px * n, yy, pz * n];
  };
  ringSolid(p, S, ys.length, ring, [-0.12, H, 0], [0, Y0 - 0.1, 0], (v) => 0.62 + 0.38 * Math.min(1, (v[1] - Y0) / H * 1.5));
  return 0;
};

const cairn: Builder = (sc, parts, lod, o) => {
  const p = parts.part(rock(sc, o, 0.7), true);
  const { rr } = rnd(9301);
  let y = 0.12, r = 0.62;
  const n = lod === 0 ? 8 : 3;
  for (let i = 0; i < n; i++) {
    const rs = lod === 0 ? r : r * 1.15, h = rs * rr(0.38, 0.5) * (lod === 0 ? 1 : 1.9);
    blob(p, { seed: 9310 + i, sub: lod === 0 ? 3 : 1, c: [rr(-0.06, 0.06), y + h * 0.5, rr(-0.06, 0.06)], r: [rs, h, rs * rr(0.8, 1)], yaw: rr(0, 6.28), lumpy: 0.9, bury: 0.6, taper: 0.1 });
    y += h * 1.25; r *= lod === 0 ? 0.84 : 0.6;
  }
  if (lod === 0) for (let i = 0; i < 4; i++) {
    const a = rr(0, 6.28), d = rr(0.75, 1.1), s = rr(0.14, 0.28);
    blob(p, { seed: 9350 + i, sub: 2, c: [Math.cos(a) * d, s * 0.2, Math.sin(a) * d], r: [s, s * 0.55, s * 0.85], yaw: rr(0, 6.28), bury: 0.4 });
  }
  return 0;
};

// ── wood ────────────────────────────────────────────────────────────────────
// A FALLEN LOG along z: a tube, a little bent, broken off at both ends, two
// branch stubs, moss cushions along its back (moss is green stone, mottled
// like the moss on a boulder); far, the bare tube.
const log: Builder = (sc, parts, lod, o) => {
  const wood = parts.part(barkMaterial(sc, o.tint), true);
  const { rr } = rnd(3307);
  const pts: V3[] = [];
  const n = lod === 0 ? 8 : 3;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([Math.sin(t * 3) * 0.08, 0.4 + Math.sin(t * 2.2) * 0.04, -2.9 + t * 5.8]); }
  tube({ pts, r0: 0.44, r1: 0.36, sides: lod === 0 ? 11 : 5 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 1, 1);
  if (lod === 0) {
    for (const [z, a] of [[-0.8, 0.9], [1.3, -1.1]] as [number, number][]) {
      const s: V3 = [Math.sin(a) * 0.3, 0.55, z], e: V3 = [Math.sin(a) * 0.95, 0.85, z + 0.25];
      tube({ pts: curve(s, [(s[0] + e[0]) / 2, 0.75, z + 0.1], e, 2), r0: 0.12, r1: 0.07, sides: 5 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 1, 1);
    }
    // end grain: a pale disc at each broken end
    for (const [end, dz, r] of [[pts[0], -1, 0.44], [pts[n], 1, 0.36]] as [V3, number, number][]) {
      const b = wood.pos.length / 3;
      wood.pos.push(...end); wood.uv.push(0.5, 0.5); wood.col.push(1.4, 1.25, 1.0, 1);
      for (let i = 0; i <= 11; i++) { const a = (i / 11) * 6.28; wood.pos.push(end[0] + Math.cos(a) * r, end[1] + Math.sin(a) * r, end[2]); wood.uv.push(0.5 + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1); wood.col.push(1.2, 1.08, 0.88, 1); }
      for (let i = 0; i < 11; i++) dz < 0 ? wood.idx.push(b, b + 1 + i, b + 2 + i) : wood.idx.push(b, b + 2 + i, b + 1 + i);
    }
    const m = parts.part(moss(sc, o), true);
    for (let i = 0; i < 5; i++) {
      const z = -2.2 + i * 1.1 + rr(-0.2, 0.2);
      blob(m, { seed: 3320 + i, sub: 3, c: [rr(-0.08, 0.08), 0.74, z], r: [rr(0.3, 0.4), rr(0.1, 0.15), rr(0.45, 0.7)], lumpy: 0.8, bury: 0.2, taper: 0 });
    }
  }
  return 0;
};

// A STUMP: a short lathe with a flared foot and a broken, jagged top, five
// roots running out and down into the turf, a moss cushion on one shoulder.
const stump: Builder = (sc, parts, lod, o) => {
  const wood = parts.part(barkMaterial(sc, o.tint), true);
  const { rr } = rnd(2207);
  const ys = lod === 0 ? [-0.25, 0.05, 0.3, 0.6, 0.82] : [-0.25, 0.3, 0.8];
  const jag = Array.from({ length: 13 }, () => rr(-0.12, 0.22));
  const S = lod === 0 ? 13 : 6;
  ringSolid(wood, S, ys.length, (a, j) => {
    const y = ys[j], flare = 1 + 0.45 * Math.max(0, 0.3 - y) / 0.55;
    const r = 0.44 * flare * (1 + 0.05 * Math.sin(a * 5));
    const top = j === ys.length - 1 ? jag[Math.floor((a / 6.2832) * 13) % 13] : 0;
    return [Math.cos(a) * r, y + top, Math.sin(a) * r];
  }, [0, 0.86, 0], null, (v, j) => (j >= ys.length ? 1.25 : 0.75 + 0.25 * Math.min(1, v[1] + 0.3)), true);
  if (lod === 0) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rr(-0.3, 0.3), d = rr(0.9, 1.3);
      tube({ pts: curve([Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3], [Math.cos(a) * d * 0.6, 0.18, Math.sin(a) * d * 0.6], [Math.cos(a) * d, -0.1, Math.sin(a) * d], 3), r0: 0.15, r1: 0.04, sides: 5 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 1, 1);
    }
    blob(parts.part(moss(sc, o), true), { seed: 2230, sub: 3, c: [0.3, 0.42, 0.05], r: [0.3, 0.16, 0.36], lumpy: 0.8, bury: 0.3, taper: 0 });
  }
  return 0;
};

// WINDTHROW: a tree torn out roots and all -- the root plate standing on edge
// (a flattened mass of soil and roots, darkened), roots splaying from its rim,
// and the trunk stub running back from it along +z down to the turf.
const rootplate: Builder = (sc, parts, lod, o) => {
  const wood = parts.part(barkMaterial(sc, o.tint), true);
  const { rr } = rnd(1907);
  blob(wood, { seed: 1910, sub: lod === 0 ? 5 : 2, c: [0, 1.35, -0.1], r: [1.55, 1.5, 0.42], lumpy: 1.35, bury: 0.95, taper: 0, ao: 0.32, uv: true });
  tube({ pts: lod === 0 ? curve([0, 1.25, 0.15], [0, 1.05, 2.2], [0.15, 0.42, 4.6], 4) : [[0, 1.25, 0.15], [0.15, 0.42, 4.6]], r0: 0.46, r1: 0.4, sides: lod === 0 ? 10 : 5 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 1, 1);
  if (lod === 0) for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.28 + rr(-0.2, 0.2), R = rr(1.3, 1.6);
    const s: V3 = [Math.cos(a) * R * 0.85, 1.35 + Math.sin(a) * R * 0.85, rr(-0.1, 0.2)];
    const e: V3 = [Math.cos(a) * (R + rr(0.4, 0.9)), Math.max(0.05, 1.35 + Math.sin(a) * (R + rr(0.3, 0.8))), rr(-0.7, 0.1)];
    tube({ pts: curve(s, [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2 + 0.2, (s[2] + e[2]) / 2], e, 3), r0: rr(0.06, 0.1), r1: 0.02, sides: 4 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 1, 1);
  }
  return 0;
};

// ── plants ──────────────────────────────────────────────────────────────────
// A SHRUB: stems, then clumps of leaf cards round a dome, each card's normal
// out from the dome so it shades as one soft mass (the trees' canopy trick).
// Far: one big card per clump, leaves only.
const shrub: Builder = (sc, parts, lod, o) => {
  const { r: rand, rr } = rnd(1201);
  const wood = lod === 0 ? parts.part(woodMaterial(sc, "broadleaf", o.tint, o.snow), true) : null;
  const leaves = parts.part(foliageMaterial(sc, `wild_shrub_${o.color}`, leafSheetFor(sc, "leaf"), leafRamp(o), o.tint, o.snow));
  const C: V3 = [0, 0.78, 0], R: V3 = [1.0, 0.8, 1.0];
  if (wood) for (let i = 0; i < 5; i++) {
    const a = rr(0, 6.28), e: V3 = [Math.sin(a) * 0.4, rr(0.45, 0.7), Math.cos(a) * 0.4];
    tube({ pts: curve([Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05], [e[0] * 0.3, e[1] * 0.5, e[2] * 0.3], e, 2), r0: 0.05, r1: 0.012, sides: 4 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 0, 1);
  }
  for (let c = 0; c < 9; c++) {
    const d = norm([rr(-1, 1), c < 3 ? rr(-0.6, -0.1) : rr(-0.15, 1), rr(-1, 1)]);
    const cc: V3 = [C[0] + d[0] * R[0] * 0.55, C[1] + d[1] * R[1] * 0.55, C[2] + d[2] * R[2] * 0.55];
    const nCards = lod === 0 ? 7 : 1;
    for (let i = 0; i < nCards; i++) {
      const e = lod === 0 ? norm([rr(-1, 1), rr(-0.3, 1), rr(-1, 1)]) : d;
      const k = lod === 0 ? rr(0.2, 0.42) : 0;
      const pp: V3 = [cc[0] + e[0] * k, cc[1] + e[1] * k, cc[2] + e[2] * k];
      const face = norm([e[0] + rr(-0.5, 0.5), e[1] * 0.6 + rr(-0.1, 0.6), e[2] + rr(-0.5, 0.5)]);
      let U = norm(cross(face, UP)); if (!isFinite(U[0])) U = [1, 0, 0];
      const V = cross(U, face);
      const oc = norm([(pp[0] - C[0]) / R[0], (pp[1] - C[1]) / R[1] + 0.4, (pp[2] - C[2]) / R[2]]);
      const s = lod === 0 ? rr(0.55, 0.72) : 1.35;
      card(leaves, pp, U, V, s, s, "center", oc, Math.max(0.45, 0.45 + (pp[1] / 1.7) * 0.5));
    }
  }
  void rand;
  return 1.7;
};

// BRAMBLE: canes arching out and down to root again, small leaves along them,
// blackberries; far, a low dome of leaf cards.
const bramble: Builder = (sc, parts, lod, o) => {
  const { rr } = rnd(1301);
  const leaves = parts.part(foliageMaterial(sc, `wild_bramble_${o.color}`, leafSheetFor(sc, "smallleaf"), leafRamp(o), o.tint, o.snow));
  if (lod === 1) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28, d = i === 8 ? 0 : 0.9;
      const c: V3 = [Math.cos(a) * d, i === 8 ? 0.9 : 0.55, Math.sin(a) * d];
      const f = norm([c[0], 1.2, c[2]]);
      let U = norm(cross(f, UP)); if (!isFinite(U[0])) U = [1, 0, 0];
      card(leaves, c, U, cross(U, f), 1.3, 1.1, "center", f, 0.8);
    }
    return 1.2;
  }
  const canes = parts.part(woodMaterial(sc, "broadleaf", o.tint, o.snow), true);
  const berries = parts.part(foliageMaterial(sc, "wild_berries", sheetOf(sc, "berries", drawBerries), ["#100408", "#3a0a2a", "#9a4a7a"], o.tint, o.snow));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 6.28 + rr(-0.3, 0.3), R = rr(1.0, 1.6), h = rr(0.8, 1.25);
    const pts = curve([Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], [Math.cos(a) * R * 0.45, h * 1.6, Math.sin(a) * R * 0.45], [Math.cos(a) * R, 0.05, Math.sin(a) * R], 6);
    tube({ pts, r0: 0.022, r1: 0.012, sides: 4 } as Limb, canes.pos, canes.uv, canes.col, canes.idx, () => 0, 1);
    for (let k = 1; k < 6; k++) {
      const pp = pts[k], f = norm([Math.cos(a) * 0.5 + rr(-0.4, 0.4), 1, Math.sin(a) * 0.5 + rr(-0.4, 0.4)]);
      let U = norm(cross(f, UP)); if (!isFinite(U[0])) U = [1, 0, 0];
      card(leaves, pp, U, cross(U, f), rr(0.38, 0.5), rr(0.38, 0.5), "center", f, 0.6 + pp[1] * 0.3);
      if (k === 3 || k === 4) card(berries, [pp[0], pp[1] - 0.06, pp[2]], U, cross(U, f), 0.2, 0.2, "center", f, 1);
    }
  }
  return 1.2;
};

// HEATHER: low cushions of sprig cards, a crossed pair per cushion far.
const heather: Builder = (sc, parts, lod, o) => {
  const { rr } = rnd(1401);
  const ramp = flowerRamp(o);
  const p = parts.part(foliageMaterial(sc, `wild_heather_${o.color}`, sheetOf(sc, "wild_heather", drawHeather), ["#1b2612", ramp[1], ramp[2]], o.tint, o.snow));
  for (let m = 0; m < 7; m++) {
    const a = rr(0, 6.28), d = m === 0 ? 0 : rr(0.6, 1.6), s = rr(0.75, 1.1);
    const c: V3 = [Math.cos(a) * d, 0, Math.sin(a) * d];
    const n = lod === 0 ? 5 : 2;
    for (let i = 0; i < n; i++) uprightCard(p, c, (i / n) * Math.PI + rr(-0.2, 0.2), 1.0 * s, 0.55 * s, rr(-0.2, 0.2), norm([rr(-0.3, 0.3), 1, rr(-0.3, 0.3)]), 0.6);
  }
  return 0.55;
};

// A FERN BED: five ferns, each a rosette of arching fronds (two cards per
// frond, rising then falling away -- nature.ts buildRosette); far, each frond
// one card on the mean of its arch.
const fernBed: Builder = (sc, parts, lod, o) => {
  const { rr } = rnd(1501);
  const p = parts.part(foliageMaterial(sc, `wild_fern_${o.color}`, sheetOf(sc, "fern", drawFern), leafRamp(o), o.tint, o.snow));
  for (let f = 0; f < 5; f++) {
    const fa = (f / 5) * 6.28 + rr(-0.4, 0.4), fd = f === 0 ? 0 : rr(0.8, 1.4), s = rr(0.8, 1.15);
    const o0: V3 = [Math.cos(fa) * fd, 0.02, Math.sin(fa) * fd];
    const n = lod === 0 ? Math.round(rr(9, 12)) : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rr(-0.25, 0.25), dir: V3 = [Math.sin(a), 0, Math.cos(a)];
      const len = rr(0.85, 1.15) * s, w = len * 0.42, rise = rr(0.75, 1.1), fall = rr(-0.3, 0.1);
      const V = norm(cross([dir[0], 0.5, dir[2]], UP));
      const N = norm([dir[0], 1.6, dir[2]]);
      if (lod === 0) {
        const U1 = norm([dir[0] * Math.cos(rise), Math.sin(rise), dir[2] * Math.cos(rise)]);
        const U2 = norm([dir[0] * Math.cos(fall), Math.sin(fall), dir[2] * Math.cos(fall)]);
        const mid: V3 = [o0[0] + U1[0] * len * 0.5, o0[1] + U1[1] * len * 0.5, o0[2] + U1[2] * len * 0.5];
        card(p, o0, U1, V, len * 0.5, w, "base", N, 0.6, 0, 0.5);
        card(p, mid, U2, V, len * 0.5, w, "base", N, 0.9, 0.5, 1);
      } else {
        const m = (rise + fall) / 2 + 0.15, U = norm([dir[0] * Math.cos(m), Math.sin(m), dir[2] * Math.cos(m)]);
        card(p, o0, U, V, len, w * 1.15, "base", N, 0.8);
      }
    }
  }
  return 1.1;
};

// A WILDFLOWER DRIFT: grass blades for the green, flower heads riding on them
// (each head a face-up card and an upright one, so it reads from anywhere);
// far, a few low cards of scattered colour -- what a drift is from 60 m.
const wildflowers: Builder = (sc, parts, lod, o) => {
  const { rr } = rnd(1601);
  const ramp = flowerRamp(o), head = HEAD_OF[o.color] ?? "five";
  if (lod === 1) {
    const p = parts.part(foliageMaterial(sc, `wild_wfdrift_${o.color}`, sheetOf(sc, "petals", drawPetals), ramp, o.tint, o.snow));
    for (let i = 0; i < 6; i++) {
      const a = rr(0, 6.28), d = i === 0 ? 0 : rr(0.9, 1.7), y = rr(0.22, 0.32), t = rr(-0.15, 0.15);
      card(p, [Math.cos(a) * d, y, Math.sin(a) * d], [Math.cos(a + t), t, Math.sin(a + t)], [-Math.sin(a), 0, Math.cos(a)], 1.9, 1.9, "center", UP, 1);
    }
    return 0.6;
  }
  const blades = parts.part(foliageMaterial(sc, "wild_wfblades", sheetOf(sc, "blades_common", (c, S, r) => drawBlades(c, S, r, "common")), LEAF_RAMPS.green, o.tint, o.snow));
  const heads = parts.part(foliageMaterial(sc, `wild_wfhead_${o.color}`, sheetOf(sc, `head_${head}`, (c, S, r) => drawHead(c, S, r, head)), ramp, o.tint, o.snow));
  for (let i = 0; i < 18; i++) {
    const a = rr(0, 6.28), d = Math.sqrt(rr(0, 1)) * 2.2;
    uprightCard(blades, [Math.cos(a) * d, 0, Math.sin(a) * d], rr(0, 3.14), rr(0.5, 0.75), rr(0.35, 0.55), rr(-0.2, 0.2), UP, 0.55);
  }
  for (let i = 0; i < 46; i++) {
    const a = rr(0, 6.28), d = Math.pow(rr(0, 1), 0.65) * 2.3, y = rr(0.28, 0.58), s = rr(0.16, 0.24);
    const c: V3 = [Math.cos(a) * d, y, Math.sin(a) * d];
    card(heads, c, [1, 0, 0], [0, 0.25, 1], s, s, "center", UP, 1);
    const yaw = rr(0, 3.14), f = norm([Math.sin(yaw), 0.4, Math.cos(yaw)]), U = norm(cross(f, UP));
    card(heads, c, U, cross(U, f), s, s, "center", norm([f[0], 1, f[2]]), 1);
  }
  return 0.6;
};

// A REED BED: crossed strap-blade cards in clumps, bulrush heads on stalks
// standing out of them; far, five tall crossed pairs.
const reeds: Builder = (sc, parts, lod, o) => {
  const { rr } = rnd(1701);
  const blades = parts.part(foliageMaterial(sc, `wild_reeds_${o.color}`, sheetOf(sc, "wild_reeds", drawReeds), leafRamp(o), o.tint, o.snow));
  const clumps = lod === 0 ? 11 : 5;
  for (let c = 0; c < clumps; c++) {
    const a = rr(0, 6.28), d = c === 0 ? 0 : Math.sqrt(rr(0, 1)) * 1.6, h = rr(1.7, 2.3) * (lod === 0 ? 1 : 1.05);
    const n = lod === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) uprightCard(blades, [Math.cos(a) * d, 0, Math.sin(a) * d], (i / n) * Math.PI + rr(-0.3, 0.3), lod === 0 ? 0.75 : 1.4, h, rr(-0.1, 0.1), norm([rr(-0.4, 0.4), 1, rr(-0.4, 0.4)]), 0.55);
  }
  if (lod === 0) {
    const stalks = parts.part(woodMaterial(sc, "broadleaf", o.tint, o.snow), true);
    for (let i = 0; i < 12; i++) {
      const a = rr(0, 6.28), d = Math.sqrt(rr(0, 1)) * 1.4, h = rr(1.9, 2.35), lx = rr(-0.08, 0.08), lz = rr(-0.08, 0.08);
      const b: V3 = [Math.cos(a) * d, 0, Math.sin(a) * d], at = (t: number): V3 => [b[0] + lx * t, h * t, b[2] + lz * t];
      tube({ pts: [at(0), at(0.78)], r0: 0.012, r1: 0.009, sides: 3 } as Limb, stalks.pos, stalks.uv, stalks.col, stalks.idx, () => 0, 1);
      tube({ pts: [at(0.78), at(0.9), at(0.94)], r0: 0.04, r1: 0.032, sides: 6 } as Limb, stalks.pos, stalks.uv, stalks.col, stalks.idx, () => 0, 1);
      tube({ pts: [at(0.94), at(1)], r0: 0.006, r1: 0.003, sides: 3 } as Limb, stalks.pos, stalks.uv, stalks.col, stalks.idx, () => 0, 1);
    }
  }
  return 2.2;
};

// ── ruins ───────────────────────────────────────────────────────────────────
// A wall run in coursed blocks along local u from u0 to u1, its broken top
// following `top(u)` (blocks above it are gone, the edge ragged); far, one
// box per stretch at the course height it reaches. `place` maps (u, y, v)
// into the piece and turns the blocks to suit.
function wallRun(p: Part, lod: 0 | 1, rand: () => number, u0: number, u1: number, thick: number, top: (u: number) => number, place: (u: number, y: number, v: number) => { c: V3; yaw: number }): void {
  const C = 0.42, rr = (a: number, b: number) => a + rand() * (b - a);
  // the plinth course, a little proud of the wall and half buried
  for (let u = u0; u < u1 - 0.05;) {
    const L = Math.min(u1 - u, rr(0.9, 1.4)), pl = place(u + L / 2, 0, 0);
    block(p, xf(pl.c, pl.yaw), L / 2 - 0.015, 0.2, thick / 2 + 0.08, lod === 0 ? 0.03 : 0, 0.8, rand);
    u += L;
  }
  if (lod === 1) {
    for (let u = u0; u < u1 - 0.05;) {
      const L = Math.min(u1 - u, 1.2), h = Math.max(0.42, Math.floor(top(u + L / 2) / C) * C), pl = place(u + L / 2, 0.2 + h / 2, 0);
      block(p, xf(pl.c, pl.yaw), L / 2, h / 2, thick / 2, 0, 0.95, rand);
      u += L;
    }
    return;
  }
  for (let k = 0, y = 0.2; ; k++, y += C) {
    let u = u0 + (k % 2 ? -rr(0.15, 0.35) : 0);
    let any = false;
    while (u < u1 - 0.05) {
      const L = rr(0.5, 0.9), a = Math.max(u, u0), b = Math.min(u + L, u1);
      u += L;
      if (b - a < 0.15) continue;
      const m = (a + b) / 2;
      if (y + C > top(m) + rr(-0.15, 0.2)) continue;
      any = true;
      const pl = place(m, y + C / 2, rr(-0.03, 0.03));
      block(p, xf(pl.c, pl.yaw + rr(-0.02, 0.02)), (b - a) / 2 - 0.02, C / 2 - 0.015, thick / 2 - rr(0, 0.04), 0.05, rr(0.85, 1.08), rand);
    }
    if (!any || k > 12) break;
  }
}
// fallen blocks lying about a foot: turned, tipped, half sunk
function rubble(p: Part, rand: () => number, n: number, near: (i: number) => V3, size = 1): void {
  const rr = (a: number, b: number) => a + rand() * (b - a);
  for (let i = 0; i < n; i++) {
    const c = near(i), hx = rr(0.22, 0.42) * size, hy = rr(0.17, 0.22) * size, hz = rr(0.25, 0.42) * size;
    block(p, xf([c[0], c[1] + hy * 0.55, c[2]], rr(0, 6.28), rr(-0.35, 0.35), rr(-0.3, 0.3)), hx, hy, hz, 0.06, rr(0.8, 1), rand);
  }
}
const ruinWall: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand, rr } = rnd(2501);
  const knots = [rr(2.2, 2.8), rr(1.5, 2.4), rr(0.6, 1.1), rr(1.0, 1.7), rr(1.4, 2.0)];
  const top = (u: number) => { const t = Math.max(0, Math.min(0.9999, (u + 3) / 6)) * (knots.length - 1), i = Math.floor(t), f = t - i; return knots[i] * (1 - f) + knots[i + 1] * f; };
  wallRun(p, lod, rand, -3, 3, 0.85, top, (u, y, v) => ({ c: [u, y, v], yaw: 0 }));
  if (lod === 0) rubble(p, rand, 6, (i) => [rr(-2.6, 2.6), -0.06, (i % 2 ? 1 : -1) * rr(0.8, 1.7)]);
  return 0;
};
const ruinCorner: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand, rr } = rnd(2601);
  // the long run along x at z = -2, the short one along z at x = -2.1, meeting
  // in a corner that stands highest, as corners do (they are braced both ways)
  const knotsA = [3.1, rr(1.4, 2.2), rr(2.0, 2.6), rr(0.5, 0.9), rr(1.0, 1.5)], knotsB = [3.0, rr(2.0, 2.6), rr(0.6, 1.0), rr(1.2, 1.8)];
  const along = (k: number[], t: number) => { const f = Math.max(0, Math.min(0.9999, t)) * (k.length - 1), i = Math.floor(f), e = f - i; return k[i] * (1 - e) + k[i + 1] * e; };
  wallRun(p, lod, rand, -2.6, 2.6, 0.8, (u) => along(knotsA, (u + 2.6) / 5.2), (u, y, v) => ({ c: [u, y, -2 + v], yaw: 0 }));
  wallRun(p, lod, rand, -1.6, 2.4, 0.8, (u) => along(knotsB, (u + 1.6) / 4), (u, y, v) => ({ c: [-2.1 + v, y, u], yaw: Math.PI / 2 }));
  if (lod === 0) rubble(p, rand, 7, () => [rr(-1.2, 2.6), -0.06, rr(-1.2, 2.4)]);
  return 0;
};
// A fluted column drum (or shaft) along y from y0 to y1, radius r, its top
// ring broken if asked; `X` turns and places it.
function fluted(p: Part, lod: 0 | 1, X: Xf, y0: number, y1: number, r: number, broken: number[] | null, cap: boolean): void {
  const S = lod === 0 ? 40 : 8, flutes = 20;
  const rings = lod === 0 ? [y0, y0 + 0.03, (y0 + y1) / 2, y1 - 0.03, y1] : [y0, y1];
  ringSolid(p, S, rings.length, (a, j) => {
    const y = rings[j], edge = j === 0 || j === rings.length - 1 ? 0.97 : 1;
    const fl = lod === 0 ? 1 - 0.07 * Math.pow(Math.max(0, Math.cos(a * flutes)), 2) : 1;
    const top = broken && j === rings.length - 1 ? broken[Math.floor((a / 6.2832) * broken.length) % broken.length] : 0;
    return X([Math.cos(a) * r * fl * edge, y + top, Math.sin(a) * r * fl * edge]);
  }, cap ? X([0, y1 + (broken ? 0.05 : 0), 0]) : null, X([0, y0, 0]), (v, j) => 0.75 + 0.25 * (j / rings.length));
}
const column: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand, rr } = rnd(2701);
  block(p, xf([0, 0.05, 0]), 0.58, 0.22, 0.58, lod === 0 ? 0.04 : 0, 0.85, rand);
  block(p, xf([0, 0.33, 0]), 0.48, 0.07, 0.48, lod === 0 ? 0.02 : 0, 0.9, rand);
  const broken = Array.from({ length: 9 }, () => rr(-0.35, 0.12));
  fluted(p, lod, xf([0, 0, 0]), 0.4, 3.2, 0.36, broken, true);
  return 0;
};
const drums: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand } = rnd(2801);
  // three drums on their sides, rolled where they fell, and the capital
  const lie: [V3, number][] = [[[-1, 0.33, 0.3], 0.3], [[0.9, 0.33, -0.4], 1.9], [[0.4, 0.33, 1.4], 0.9]];
  for (const [c, yaw] of lie) fluted(p, lod, xf(c, yaw, 0, Math.PI / 2), -0.42, 0.42, 0.36, null, true);
  block(p, xf([-1.4, 0.2, -1.2], 0.6, 0.15, 0.1), 0.52, 0.2, 0.52, lod === 0 ? 0.05 : 0, 0.9, rand);
  return 0;
};
// THE ARCH, half fallen: two piers 3.6 m apart (inner faces at x = +-1.8),
// the left standing to its springing with five voussoirs still turning over
// the gap, the right broken lower; the rest of the ring in the grass.
const arch: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand, rr } = rnd(2901);
  const C = 0.45, spring = 3.15;
  for (const [x, h] of [[-2.25, spring], [2.25, 2.3]] as [number, number][]) {
    if (lod === 1) { block(p, xf([x, h / 2, 0]), 0.46, h / 2, 0.46, 0, 0.95, rand); continue; }
    for (let y = 0; y + C <= h + 0.01; y += C) block(p, xf([x + rr(-0.02, 0.02), y + C / 2, 0], rr(-0.03, 0.03)), 0.45, C / 2 - 0.015, 0.45, 0.05, rr(0.85, 1.05), rand);
  }
  // impost on the standing pier
  block(p, xf([-2.25, spring + 0.1, 0]), 0.55, 0.1, 0.52, lod === 0 ? 0.03 : 0, 0.95, rand);
  const n = 11, R = 2.25;
  const standing = lod === 0 ? 5 : 2;
  for (let i = 0; i < standing; i++) {
    // lod 1 draws the standing half as two long wedges
    const span = lod === 0 ? 1 : 2.5, th = Math.PI - (i + 0.5) * (Math.PI / n) * span;
    const c: V3 = [Math.cos(th) * R, spring + 0.2 + Math.sin(th) * R, 0];
    block(p, xf(c, 0, 0, th), 0.45, (R * Math.PI / n) / 2 * span - 0.02, 0.43, lod === 0 ? 0.04 : 0, rr(0.88, 1.05), rand);
  }
  if (lod === 0) rubble(p, rand, 6, (i) => [rr(0.2, 3.2), -0.05, (i % 2 ? 1 : -1) * rr(0.6, 1.6)], 1.1);
  return 0;
};
const waymarker: Builder = (sc, parts, lod, o) => {
  const p = parts.part(ashlar(sc, o), true);
  const { r: rand, rr } = rnd(3001);
  const j = lod === 0 ? 0.03 : 0;
  block(p, xf([0, 0.05, 0], 0.2), 0.38, 0.18, 0.36, j, 0.85, rand);
  block(p, xf([0, 0.85, 0]), 0.17, 0.66, 0.15, j, 1, rand);
  if (lod === 0) block(p, xf([0, 1.22, 0]), 0.19, 0.06, 0.17, 0.01, 0.92, rand);
  // the cap: a low pyramid (a four-sided ring to a point)
  ringSolid(p, 4, 1, (a) => [Math.cos(a + Math.PI / 4) * 0.27, 1.5, Math.sin(a + Math.PI / 4) * 0.25], [0, 1.74, 0], null, () => 1);
  if (lod === 0) for (let i = 0; i < 3; i++) {
    const a = rr(0, 6.28);
    block(p, xf([Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6], rr(0, 6.28), rr(-0.3, 0.3)), rr(0.1, 0.16), 0.08, rr(0.1, 0.15), 0.04, 0.85, rand);
  }
  return 0;
};

const BUILDERS: Record<string, Builder> = {
  cliff, outcrop, tor, boulder, scree, standing_stone: standingStone, cairn,
  log, stump, rootplate, shrub, bramble, heather, fern_bed: fernBed, wildflowers, reeds,
  ruin_wall: ruinWall, ruin_corner: ruinCorner, column, drums, arch, waymarker,
};

// ═══════════════════════════════ pools and the LOD pass ═════════════════════
interface Pool {
  key: string; kind: string; spec: KindSpec;
  near: Mesh; far: Mesh;
  mats: Float32Array; n: number;
  cells: Map<string, WildCell>;
  nearBuf: Float32Array; farBuf: Float32Array;
  nearN: number; farN: number;
  dirty: boolean;
}
interface WildState {
  owner: Scene; pools: Map<string, Pool>; lastX: number; lastZ: number; force: number | null; dirty: boolean;
  /** what is already standing (centre and footprint), so pieces do not grow
   * through each other: a coarse grid of the solid pieces placed */
  solids: Map<number, [number, number, number][]>;
}
let state: WildState | null = null;
const SOLID_CELL = 16;
const MOVE = 4;   // metres the camera moves before the cells are asked again

function wild(): WildState {
  if (state && state.owner === scene && !scene.isDisposed) return state;
  const st: WildState = { owner: scene, pools: new Map(), lastX: Infinity, lastZ: Infinity, force: null, dirty: true, solids: new Map() };
  state = st;
  scene.onBeforeRenderObservable.add(() => lodPass(st));
  scene.onDisposeObservable.addOnce(() => { if (state === st) state = null; });
  return st;
}

function buildMesh(kind: string, lod: 0 | 1, o: MatOpts, name: string): Mesh {
  const parts = new Parts();
  const swayTop = BUILDERS[kind](scene, parts, lod, o);
  const m = parts.build(name, scene, null, swayTop);
  m.isPickable = false;
  m.receiveShadows = true;
  m.isVisible = true;
  m.setEnabled(false);
  m.alwaysSelectAsActiveMesh = false;
  m.freezeWorldMatrix();
  (m as any).__paintedArt = true;
  m.metadata = { ...(m.metadata || {}), wildKind: kind, wildLod: lod };
  return m;
}

function poolFor(kind: string, o: { color?: string; tint?: string; snow?: boolean }): Pool {
  const st = wild();
  const spec = WILD_KINDS[kind];
  if (!spec || !BUILDERS[kind]) throw new Error(`wild-nature: unknown kind "${kind}" (kinds: ${Object.keys(WILD_KINDS).join(", ")})`);
  const color = spec.family === "plant" ? (o.color ?? DEFAULT_COLOR[kind] ?? "green") : "";
  const key = poolKey(kind, { color, tint: o.tint, snow: o.snow });
  let pool = st.pools.get(key);
  if (pool) return pool;
  const mo: MatOpts = { color, tint: o.tint ?? null, snow: !!o.snow };
  const near = buildMesh(kind, 0, mo, `wild_${key}_near`), far = buildMesh(kind, 1, mo, `wild_${key}_far`);
  // SHADOWS from the near pool only, and only for what is big enough to
  // throw one anyone sees; the far pool never (scene.ts SMALL_VEG's rule)
  if (spec.shadow) addShadowCaster(near);
  // the glow pass draws every mesh it holds again: only the big stone stays
  // in it as an occluder (so a portal's bloom stops at a cliff)
  if (glow) { if (!spec.glowOccluder) glow.addExcludedMesh(near); glow.addExcludedMesh(far); }
  pool = { key, kind, spec, near, far, mats: new Float32Array(64 * 16), n: 0, cells: new Map(), nearBuf: new Float32Array(16), farBuf: new Float32Array(16), nearN: -1, farN: -1, dirty: true };
  st.pools.set(key, pool);
  return pool;
}

function addToPool(pool: Pool, mats: Matrix[], pts: { x: number; z: number; reach: number }[]): void {
  if ((pool.n + mats.length) * 16 > pool.mats.length) {
    const d = new Float32Array(Math.max((pool.n + mats.length) * 16, pool.mats.length * 2));
    d.set(pool.mats.subarray(0, pool.n * 16));
    pool.mats = d;
  }
  for (const m of mats) { m.copyToArray(pool.mats, pool.n * 16); pool.n++; }
  // the new instances join their cells (a new cell has no level yet and
  // takes the plain thresholds); the pool refills on the next pass either way
  bucketCells(pts, undefined, pool.cells, pool.n - mats.length);
  pool.dirty = true;
  wild().dirty = true;
}

// THE LOD PASS: every frame the camera has moved MOVE metres (or something
// was added), each pool's cells are asked their level; a pool whose cells all
// kept theirs is left alone, the others rewrite their two buffers.
function lodPass(st: WildState): void {
  if (st.owner !== scene || scene.isDisposed) return;
  const cam = scene.activeCamera;
  const px = cam ? cam.globalPosition.x : 0, pz = cam ? cam.globalPosition.z : 0;
  if (!st.dirty && Math.abs(px - st.lastX) + Math.abs(pz - st.lastZ) < MOVE) return;
  st.lastX = px; st.lastZ = pz; st.dirty = false;
  for (const pool of st.pools.values()) {
    let changed = pool.dirty;
    for (const c of pool.cells.values()) {
      const l = st.force ?? levelOf(c.level, cellDistance(c, px, pz), pool.spec.near, pool.spec.cull);
      if (l !== c.level) { c.level = l; changed = true; }
    }
    if (changed) refill(pool);
    pool.dirty = false;
  }
}
function fillMesh(mesh: Mesh, src: Float32Array, ids: number[], cap: number, buf: Float32Array): Float32Array {
  const need = Math.max(1, cap) * 16;
  let fresh = false;
  if (buf.length < need) { buf = new Float32Array(need); fresh = true; }
  ids.forEach((id, k) => buf.set(src.subarray(id * 16, id * 16 + 16), k * 16));
  // A pool with nothing to show is DISABLED, never left at zero instances
  // (city-architecture.ts refill: at zero a thin-instanced mesh stops counting
  // as instanced and recompiles without INSTANCES).
  // The count goes in BEFORE a reused buffer's upload: thinInstanceBufferUpdated
  // uploads only the current thinInstanceCount matrices, so setting it after
  // left a pool whose count grew drawing the old count's worth (Summer Lakes,
  // 2026-10-10: one of the Belvedere's six columns, none of the colonnade's
  // fourteen when its cells went near). thinInstanceSetBuffer resets the count
  // to the buffer's capacity, so it is set again after that.
  mesh.thinInstanceCount = Math.max(1, ids.length);
  if (fresh || !mesh.hasThinInstances) mesh.thinInstanceSetBuffer("matrix", buf, 16, false);
  else mesh.thinInstanceBufferUpdated("matrix");
  mesh.thinInstanceCount = Math.max(1, ids.length);
  mesh.setEnabled(ids.length > 0);
  if (ids.length) mesh.thinInstanceRefreshBoundingInfo(false);
  return buf;
}
function refill(pool: Pool): void {
  if (pool.near.isDisposed()) return;
  const { near, far } = splitLevels(pool.cells.values());
  pool.nearBuf = fillMesh(pool.near, pool.mats, near, pool.n, pool.nearBuf);
  pool.farBuf = fillMesh(pool.far, pool.mats, far, pool.n, pool.farBuf);
  pool.nearN = near.length; pool.farN = far.length;
}

// ═══════════════════════════════ the placement API ══════════════════════════
export interface WildSpot {
  x: number; z: number;
  /** yaw, placeExact's sense: local +x -> (cos rot, 0, -sin rot) */
  rot?: number;
  scale?: number; sx?: number; sy?: number; sz?: number;
  /** metres added to the seated height (negative sinks it further) */
  yOff?: number;
  /** tip the top `lean` radians toward the world direction (leanX, leanZ) */
  lean?: number; leanX?: number; leanZ?: number;
}
export interface WildOpts {
  /** plants: a LEAF_RAMPS key (shrub, bramble, fern_bed, reeds) or a
   * FLOWER_RAMPS key (wildflowers, heather); each colour is its own pool */
  color?: string;
  /** stone, ruins, wood: the albedo (a zone's rock colour); plants: a multiply */
  tint?: string;
  snow?: boolean;
  /** add the kind's colliders (default true) */
  collide?: boolean;
  /** tilt to the ground (default: the kind's) */
  conform?: boolean;
}

const surface = (x: number, z: number) => buildApi.surface(x, z);
function seat(spec: KindSpec, s: WildSpot, conform: boolean): { y: number; q: Quaternion } {
  const sc = s.scale ?? 1, sx = s.sx ?? sc, sy = s.sy ?? sc, sz = s.sz ?? sc;
  const r = spec.foot * Math.max(sx, sz);
  let q = Quaternion.RotationAxis(Vector3.Up(), s.rot ?? 0);
  let y: number;
  if (conform) {
    const e = Math.max(0.6, r * 0.6);
    const gx = (surface(s.x + e, s.z) - surface(s.x - e, s.z)) / (2 * e), gz = (surface(s.x, s.z + e) - surface(s.x, s.z - e)) / (2 * e);
    const n = new Vector3(-gx, 1, -gz).normalize(), axis = Vector3.Cross(Vector3.Up(), n), ang = Math.acos(Math.min(1, n.y));
    if (axis.length() > 1e-5) q = Quaternion.RotationAxis(axis.normalize(), ang).multiply(q);
    y = surface(s.x, s.z) - spec.sink * sy;
  } else {
    // the lowest ground under the footprint, so a stone on a slope sits in
    // the hill on its uphill side rather than floating on its downhill one
    const k = r * 0.6;
    y = Math.min(surface(s.x, s.z), surface(s.x + k, s.z), surface(s.x - k, s.z), surface(s.x, s.z + k), surface(s.x, s.z - k)) - spec.sink * sy;
  }
  if (s.lean) {
    const dx = s.leanX ?? 1, dz = s.leanZ ?? 0, L = Math.hypot(dx, dz) || 1;
    q = Quaternion.RotationAxis(new Vector3(dz / L, 0, -dx / L), s.lean).multiply(q);
  }
  return { y: y + (s.yOff ?? 0), q };
}

/**
 * Place a kind at exact spots. Seated on the drawn ground (the lowest point
 * under its footprint, or tilted to the ground for patch kinds), colliders
 * added (unless collide: false). Returns how many were placed. No keep-clear
 * checks: exact spots are the caller's word (use wildScatter for those).
 */
export function wildPlace(kind: string, spots: WildSpot[], opts: WildOpts = {}): number {
  if (!spots.length) return 0;
  const pool = poolFor(kind, opts), spec = pool.spec;
  const conform = opts.conform ?? spec.conform;
  const mats: Matrix[] = [], pts: { x: number; z: number; reach: number }[] = [];
  const st = wild();
  for (const s of spots) {
    const sc = s.scale ?? 1, sx = s.sx ?? sc, sy = s.sy ?? sc, sz = s.sz ?? sc;
    const { y, q } = seat(spec, s, conform);
    mats.push(Matrix.Compose(new Vector3(sx, sy, sz), q, new Vector3(s.x, y, s.z)));
    const reach = spec.foot * Math.max(sx, sz);
    pts.push({ x: s.x, z: s.z, reach });
    if (spec.colliders.length) {
      const k = Math.floor(s.x / SOLID_CELL) * 1048576 + Math.floor(s.z / SOLID_CELL);
      const l = st.solids.get(k); if (l) l.push([s.x, s.z, reach]); else st.solids.set(k, [[s.x, s.z, reach]]);
    }
    if (opts.collide === false) continue;
    const rot = s.rot ?? 0, c = Math.cos(rot), sn = Math.sin(rot);
    for (const col of spec.colliders) {
      // local (lx, lz) -> world: local +x is (cos, -sin), local +z is (sin, cos)
      if ("circle" in col) {
        const [lx, lz, r] = col.circle;
        circleColliders.push({ x: s.x + lx * sx * c + lz * sz * sn, z: s.z - lx * sx * sn + lz * sz * c, r: r * Math.max(sx, sz) });
      } else {
        const [lx, lz, hx, hz] = col.box;
        buildApi.addBoxCollider(s.x + lx * sx * c + lz * sz * sn, s.z - lx * sx * sn + lz * sz * c, hx * sx, hz * sz, rot, y + spec.height * sy);
      }
    }
  }
  addToPool(pool, mats, pts);
  return spots.length;
}

export interface ScatterOpts extends WildOpts {
  /** how many; or `density` per 1000 m^2 of the area */
  count?: number; density?: number;
  seed?: number;
  /** scale range (default: the kind's) */
  scale?: [number, number];
  /** at least this far apart (m; default 1.6 x the footprint at mid scale) */
  gap?: number;
  /** in drifts: groups of n[0]..n[1] within r metres */
  clump?: { n: [number, number]; r: number };
  /** extra clearings [x, z, r] on top of the automatic ones */
  avoid?: [number, number, number][];
  /** metres kept clear beyond a road's edge (default 1.5) */
  roadPad?: number;
  /** only within this many metres of a mapped river or pond edge (reeds) */
  nearWater?: number;
  /** metres kept inside the zone's plate edge (default 25; the rim) */
  inset?: number;
  /** the steepest ground (default: the kind's) */
  maxSlope?: number;
  /** let it overlap the kit's solid pieces already placed (default false) */
  overlap?: boolean;
  /** stretch each instance up to this much per axis (default 0.15 for stone) */
  stretch?: number;
}

/** The keep-clear test a scatter of `kind` runs on each candidate point. */
function keepClear(spec: KindSpec, kind: string, o: ScatterOpts, smax: number): (x: number, z: number) => boolean {
  const key = currentZoneKey();
  const foot = spec.foot * smax;
  const shape = zoneShape(key), size = (ZONES as any)[key]?.size ?? 600;
  const inset = (o.inset ?? 25) + foot;
  const clear = [...dataClearings(ZONES as any, key), ...(zoneModule(key)?.avoid ?? []), ...(o.avoid ?? [])];
  const layers = zoneMapLayers[key] ?? { roads: [], waters: [] };
  const roadPad = (o.roadPad ?? 1.5) + foot;
  const segs: [number, number, number, number, number][] = [];
  for (const r of layers.roads) for (let i = 0; i + 1 < r.pts.length; i++) segs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], r.half]);
  const wsegs: [number, number, number, number, number][] = [], discs: [number, number, number][] = [];
  for (const w of layers.waters) {
    if (w.kind === "ribbon") for (let i = 0; i + 1 < w.pts.length; i++) wsegs.push([w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1], w.half]);
    else discs.push([w.x, w.z, w.r]);
  }
  const prints = zoneFootprints[key] ?? [];
  const maxSlope = o.maxSlope ?? spec.maxSlope;
  const st = wild();
  const reedy = o.nearWater !== undefined;
  return (x, z) => {
    if (shape ? polySignedDist(shape.pts, x, z) < inset : Math.max(Math.abs(x), Math.abs(z)) > size / 2 - inset) return false;
    for (const [cx, cz, r] of clear) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + foot) ** 2) return false;
    for (const [ax, az, bx, bz, h] of segs) if (segDistance(x, z, ax, az, bx, bz) < h + roadPad) return false;
    // water: off it (by a metre past its edge), or for reeds, ON its edge
    let edge = Infinity;
    for (const [ax, az, bx, bz, h] of wsegs) edge = Math.min(edge, segDistance(x, z, ax, az, bx, bz) - h);
    for (const [cx, cz, r] of discs) edge = Math.min(edge, Math.hypot(x - cx, z - cz) - r);
    if (reedy ? (edge < -1.5 || edge > o.nearWater!) : edge < 1 + foot) return false;
    for (const [cx, cz, sx, sz] of prints) if (Math.abs(x - cx) < sx / 2 + foot + 1 && Math.abs(z - cz) < sz / 2 + foot + 1) return false;
    if (pavingHeight(x, z) !== null) return false;
    if (scatterBlocked(x, z)) return false;
    if (spec.veg && vegBlocked(x, z)) return false;
    const g = surface(x, z);
    for (const w of waterBodies) if (Math.hypot(x - w.x, z - w.z) < w.r && g < w.level - (reedy ? 0.6 : 0.2)) return false;
    const e = 1;
    const gx = (surface(x + e, z) - surface(x - e, z)) / (2 * e), gz = (surface(x, z + e) - surface(x, z - e)) / (2 * e);
    if (Math.hypot(gx, gz) > maxSlope) return false;
    if (!o.overlap && spec.family !== "plant") {
      const i0 = Math.floor(x / SOLID_CELL), j0 = Math.floor(z / SOLID_CELL);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
        for (const [sx, sz, r] of st.solids.get(i * 1048576 + j) ?? []) if ((x - sx) ** 2 + (z - sz) ** 2 < (r + foot * 0.8) ** 2) return false;
      }
    }
    void kind;
    return true;
  };
}

/**
 * Scatter a kind over an area ("zone" = the whole plate inside its rim), kept
 * clear automatically of: roads and rivers/ponds on the zone's map layers
 * (lay them FIRST), pavings, buildings' footprints, portals and the landings
 * into this zone, crystals, NPCs, nodes, interactables, landmarks,
 * furnishings, the spawn, the zone module's `avoid`, scatter/vegetation
 * exclusions (oceans, rivers), deep water, ground steeper than the kind
 * allows, and (for solid kinds) the kit's pieces already placed. Returns the
 * spots placed.
 */
export function wildScatter(kind: string, area: WildArea | "zone", o: ScatterOpts = {}): WildSpot[] {
  const spec = WILD_KINDS[kind];
  if (!spec) throw new Error(`wild-nature: unknown kind "${kind}"`);
  const key = currentZoneKey();
  const shape = zoneShape(key), size = (ZONES as any)[key]?.size ?? 600;
  const A: WildArea = area !== "zone" ? area : shape ? { poly: shape.pts as P2[] } : { rect: [-size / 2, -size / 2, size / 2, size / 2] };
  const [s0, s1] = o.scale ?? spec.scale;
  const count = Math.round(o.count ?? (o.density ?? 1) * areaSize(A) / 1000);
  const { r: rand } = rnd(o.seed ?? 1);
  const gap = o.gap ?? spec.foot * (s0 + s1) / 2 * 1.6;
  const pts = samplePoints(A, count, rand, keepClear(spec, kind, o, s1), { gap, clump: o.clump });
  const stretch = o.stretch ?? (spec.family === "stone" ? 0.15 : 0);
  const spots: WildSpot[] = pts.map(([x, z]) => {
    const s = s0 + rand() * (s1 - s0);
    return { x, z, rot: rand() * Math.PI * 2, scale: s, sx: s * (1 + (rand() - 0.5) * stretch * 2), sy: s * (1 + (rand() - 0.5) * stretch * 2), sz: s * (1 + (rand() - 0.5) * stretch * 2) };
  });
  wildPlace(kind, spots, o);
  return spots;
}

export interface LineOpts extends WildOpts {
  /** metres between pieces (default: 1.7 x the footprint at mid scale -- cliffs overlap into one wall) */
  spacing?: number;
  /** which side of the line the piece's face (local +z) looks to */
  face?: "left" | "right";
  scale?: [number, number];
  /** metres of random sideways and along-line jitter, and radians of yaw */
  jitter?: number; yawJitter?: number;
  yOff?: number;
  seed?: number;
}
/**
 * A row along a polyline: cliffs lining a scarp (face toward the low side),
 * a broken wall's runs, standing stones down an avenue. Each piece's local +x
 * runs along the line. No keep-clear: a line is drawn on purpose.
 */
export function wildLine(kind: string, pts: P2[], o: LineOpts = {}): WildSpot[] {
  const spec = WILD_KINDS[kind];
  if (!spec) throw new Error(`wild-nature: unknown kind "${kind}"`);
  const [s0, s1] = o.scale ?? spec.scale;
  const spacing = o.spacing ?? spec.foot * 2 * (s0 + s1) / 2 * 0.85;
  const { r: rand } = rnd(o.seed ?? 7);
  const j = o.jitter ?? spacing * 0.08, yj = o.yawJitter ?? 0.12;
  const spots = linePoints(pts, spacing, o.face ?? "left").map((p) => {
    const s = s0 + rand() * (s1 - s0);
    return { x: p.x + (rand() - 0.5) * 2 * j, z: p.z + (rand() - 0.5) * 2 * j, rot: p.rot + (rand() - 0.5) * 2 * yj, scale: s, sy: s * (0.85 + rand() * 0.3), yOff: o.yOff };
  });
  wildPlace(kind, spots, o);
  return spots;
}

/** Per pool: instances, how many draw near and far now, and its draws. */
export function wildStats(): { key: string; n: number; near: number; far: number; draws: number }[] {
  if (!state || state.owner !== scene) return [];
  return [...state.pools.values()].map((p) => ({ key: p.key, n: p.n, near: Math.max(0, p.nearN), far: Math.max(0, p.farN), draws: (p.nearN > 0 ? p.spec.drawsNear : 0) + (p.farN > 0 ? p.spec.drawsFar : 0) }));
}
/** QA: force every cell to one level (0 near, 1 far, 2 culled), or null to
 * hand it back to the camera. The lineup shots use it. */
export function wildForceLevel(level: number | null): void {
  const st = wild();
  st.force = level;
  st.dirty = true;
  for (const p of st.pools.values()) { p.dirty = true; for (const c of p.cells.values()) c.level = -1; }
}

// the QA harness reaches the kit from the page (tools/qa scripts)
if (typeof window !== "undefined") (window as any).__wild = { wildPlace, wildScatter, wildLine, wildStats, wildForceLevel, kinds: WILD_KINDS };
void sheet; void canvasSheet;
