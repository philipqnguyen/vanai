// THE WILD TERRAIN TOOLKIT: landforms a zone module composes into its height
// function -- hills, ridges, valleys, ravines, gullies, stream beds, plateaus,
// mesas, terraces -- and the one road-safe way to level ground under a road.
// Pure and Babylon-free, so the node tests read it (test/wild_terrain.test.mjs).
// The Babylon half, which dresses the steep faces these make with rock, is
// wild-cliffs.ts.
//
// ── How a zone composes features ────────────────────────────────────────────
//
// Every feature is a `Feature`: (x, z, h) => the DELTA in metres to add to the
// height h the field has at (x, z) so far. `terrain(...)` chains them, each one
// seeing the height the ones before it left, and returns exactly the signature
// registerZone's `height` hook takes:
//
//   const ROADS = [{ pts: [[-270, -22], [0, 20], [212, 90]], half: 3.2 }];
//   const LAND = terrain(
//     hills({ x: -150, z: 60, r: 90, count: 7, height: [4, 9], seed: 3 }),
//     protect(ravine({ pts: [[-60, 200], [-20, 120], [40, 60]], depth: 9 }), roadsClear(ROADS, 8)),
//     mesa({ x: 140, z: -120, r: 40, rise: 12, ramps: [{ pts: [[140, -90], [140, -50]], half: 4 }] }),
//   );
//   registerZone({ ..., height: (x, z, h) => LAND(x, z, h * 0.6),
//                  carves: [roadBed(ROADS), RIVER] });
//
// Additive features (hills, mound, ridge, valley, ravine, gully, streamBed)
// ignore h and return a shape; levelling ones (plateau, mesa, terraces) pull h
// toward a level, so ORDER matters: put the levellers after the bumps they
// should flatten. Anything that changes height near a road, an NPC, a portal,
// a landing, a node or a quest spot goes through `protect(f, mask)` with
// `roadsClear` / `keepClear` (zoneKeepClear lists a zone's spots from
// zones.json), so a feature fades out there rather than burying or tilting it.
//
// ── Keeping it walkable ────────────────────────────────────────────────────
//
// isWalkable (scene.ts) refuses any ground whose gradient over +-0.6 m is
// steeper than WALK_SLOPE = 1.1 (48 degrees). Each feature notes its steepest
// flank: a smoothstep falloff of height H over run R peaks at 1.5 H / R, a
// bump (mound, ridge) at 1.54 H / R. So a ridge 12 m high and 30 m wide (16 at
// the flank) is walkable all over; a ravine wall of 9 m over 3 m is a cliff,
// which is the point of a ravine -- but then the way IN must be somewhere:
// a ravine's tapered ends, a plateau's `ramps`, a mesa's gap. `slopeAt` is
// isWalkable's exact rule and `unwalkableNear` audits a set of spots against
// it; run it over the zone's NPCs, portals and landings after a reshape.
// The terrain mesh is drawn on a ~4.7 m grid, so a wall narrower than that
// renders as one faceted cell: give cliffs `wall >= 4` or dress them
// (wild-cliffs.ts dressCliffs), which is what hides the facet anyway.
//
// ── THE TRENCH TRAP ────────────────────────────────────────────────────────
//
// Never level a road by SCALING the height (`h *= 0.4` near the road). The
// field's height is not a deviation from zero: on a slope 30 m up, `h * 0.6`
// near a road is a 12 m cut, and the Border Wall's foot road dug exactly that
// -- a fourteen-metre trench down the whole interior slope, cliffs both sides,
// the stairs dropping into it (borderwall.ts, `height`). The same pattern
// still sits under the Granary Plains' roads, harmless only because that
// ground is low. Level a road with `roadBed` instead: it follows the ground's
// OWN height along the centreline (smoothed, grade-capped), levels only the
// cross-slope, clamps every cut and fill to a metre or two, and widens its
// banks with the cut so they stay walkable. And keep features OFF roads with
// `protect(..., roadsClear(roads))` rather than cutting the road through them.
// roadBed is a carve (it needs the field at other points), so it goes in the
// zone's `carves` list FIRST: the rivers then cut their fords through the
// levelled ground, rather than the road filling the ford back in.

export type Pt = [number, number];
/** A landform: the delta in metres to add to height h at (x, z). */
export type Feature = (x: number, z: number, h: number) => number;
/** A weight in 0..1 over the ground. */
export type Mask = (x: number, z: number) => number;
export type HeightField = (x: number, z: number) => number;

/** isWalkable's gradient limit (scene.ts fieldWalkable). */
export const WALK_SLOPE = 1.1;

// ── small maths ─────────────────────────────────────────────────────────────

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Hermite 0..1 between e0 and e1 (C1: no crease where a feature starts). */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 === e0) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** Smooth minimum: min(a, b) with the corner rounded over k metres. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const t = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, t) - k * t * (1 - t);
}
/** Smooth maximum: max(a, b) with the corner rounded over k metres. */
export function smax(a: number, b: number, k: number): number { return -smin(-a, -b, k); }
// A dome falling to zero WITH zero slope at u = 1, so a bump never starts on a
// visible crease. Steepest at u = 0.577: 1.54 per unit of u.
const bump = (u: number): number => (u >= 1 ? 0 : (1 - u * u) * (1 - u * u));

// A seeded value noise, 0..1. Not the field's noise (scene.ts fbm) and not
// meant to be: this only wobbles a feature's own outline and crest, so two
// ridges with different seeds do not wobble in step.
function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** A deterministic 0..1 stream (the same LCG as scene.ts seededRand). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967295; };
}

// ── polylines and polygons ──────────────────────────────────────────────────

/** Chaikin corner-cutting, endpoints kept: a ridge or ravine laid on a raw
 *  polyline has a crease at every vertex where two straight runs meet. */
export function rounded(pts: Pt[], passes = 2): Pt[] {
  let p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out: Pt[] = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i + 2 < p.length) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export interface Near { d: number; s: number; len: number; tx: number; tz: number; side: number }
/** A polyline that answers "how far, and how far along" -- with a bounding-box
 *  reject first, because a feature is asked a few hundred thousand times a
 *  build and is nowhere near most of them. */
export interface Line { pts: Pt[]; len: number; near(x: number, z: number, reach: number): Near | null }
export function line(input: Pt[], passes = 2): Line {
  const pts = rounded(input, passes);
  const segs: { ax: number; az: number; dx: number; dz: number; l2: number; l: number; s0: number }[] = [];
  let len = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    if (l < 1e-9) continue;
    segs.push({ ax, az, dx, dz, l2, l, s0: len });
    len += l;
  }
  const single = pts[0] ?? [0, 0];
  return {
    pts, len,
    near(x, z, reach) {
      if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) return null;
      if (!segs.length) {
        const d = Math.hypot(x - single[0], z - single[1]);
        return d > reach ? null : { d, s: 0, len: 0, tx: 1, tz: 0, side: 0 };
      }
      let best = Infinity, bs = 0, btx = 1, btz = 0, bside = 0;
      for (const g of segs) {
        let t = ((x - g.ax) * g.dx + (z - g.az) * g.dz) / g.l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = g.ax + g.dx * t - x, pz = g.az + g.dz * t - z, d2 = px * px + pz * pz;
        if (d2 < best) {
          best = d2; bs = g.s0 + g.l * t; btx = g.dx / g.l; btz = g.dz / g.l;
          bside = Math.sign(g.dx * (z - g.az) - g.dz * (x - g.ax));
        }
      }
      const d = Math.sqrt(best);
      return d > reach ? null : { d, s: bs, len, tx: btx, tz: btz, side: bside };
    },
  };
}

/** Signed distance to a polygon's edge, POSITIVE inside (as scene.ts
 *  polySignedDist), with a bounding-box shortcut outside `reach`. */
export function polygon(pts: Pt[]): { pts: Pt[]; sd(x: number, z: number, reach: number): number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const n = pts.length;
  return {
    pts,
    sd(x, z, reach) {
      if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) return -Infinity;
      let d2 = Infinity, inside = false;
      for (let i = 0; i < n; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12;
        const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
        const px = ax + dx * t - x, pz = az + dz * t - z;
        d2 = Math.min(d2, px * px + pz * pz);
        if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * dx) inside = !inside;
      }
      const d = Math.sqrt(d2);
      return inside ? d : -d;
    },
  };
}

// ── composition ────────────────────────────────────────────────────────────

/** Chain features into a zone's `height` hook: each sees the height the
 *  previous ones left. */
export function terrain(...features: Feature[]): (x: number, z: number, h: number) => number {
  return (x, z, h) => {
    for (const f of features) h += f(x, z, h);
    return h;
  };
}
/** The sum of several features as one (each sees the same incoming h). */
export function sum(...features: Feature[]): Feature {
  return (x, z, h) => { let d = 0; for (const f of features) d += f(x, z, h); return d; };
}
/** A feature at k times its strength. */
export const scaled = (f: Feature, k: number): Feature => (x, z, h) => f(x, z, h) * k;
/** A feature only where the mask is (a hill cluster confined to a valley). */
export const within = (f: Feature, m: Mask): Feature => (x, z, h) => { const w = m(x, z); return w > 0 ? f(x, z, h) * w : 0; };
/** A feature everywhere EXCEPT where the mask is: roads, landings, NPCs. The
 *  ground there keeps whatever height it had before this feature. */
export const protect = (f: Feature, m: Mask): Feature => (x, z, h) => { const w = m(x, z); return w < 1 ? f(x, z, h) * (1 - w) : 0; };

// ── masks ──────────────────────────────────────────────────────────────────

/** 1 inside r, falling to 0 over `feather` metres. */
export function circleMask(cx: number, cz: number, r: number, feather = 8): Mask {
  const R = r + feather;
  return (x, z) => {
    const dx = x - cx, dz = z - cz;
    if (dx > R || dx < -R || dz > R || dz < -R) return 0;
    return 1 - smoothstep(r, R, Math.hypot(dx, dz));
  };
}
/** 1 inside the polygon, falling to 0 over `feather` metres outside it. */
export function polyMask(pts: Pt[], feather = 8): Mask {
  const p = polygon(pts);
  return (x, z) => { const sd = p.sd(x, z, feather); return sd === -Infinity ? 0 : smoothstep(-feather, 0, sd); };
}
/** 1 within `half` of the polyline, falling to 0 over `feather` metres. Not
 *  rounded: a road's corridor is the road's own waypoints. */
export function corridorMask(pts: Pt[], half: number, feather = 8): Mask {
  const l = line(pts, 0);
  return (x, z) => { const q = l.near(x, z, half + feather); return q ? 1 - smoothstep(half, half + feather, q.d) : 0; };
}
export function union(...masks: Mask[]): Mask {
  return (x, z) => { let w = 0; for (const m of masks) { w = Math.max(w, m(x, z)); if (w >= 1) return 1; } return w; };
}
/** Every road's corridor, its half-width plus `pad`, feathered: hand this to
 *  `protect` so no feature tilts or buries a road. */
export function roadsClear(roads: { pts: Pt[]; half: number }[], feather = 10, pad = 2): Mask {
  return union(...roads.map((r) => corridorMask(r.pts, r.half + pad, feather)));
}
/** Circles [x, z, r] kept at their own height (NPCs, portals, landings). */
export function keepClear(spots: [number, number, number][], feather = 10): Mask {
  return union(...spots.map(([x, z, r]) => circleMask(x, z, r, feather)));
}

/** Everything in a zone's zones.json entry that must keep its ground: NPCs,
 *  portals, crystals, nodes, interactables, landmarks, the spawn and start,
 *  and every OTHER zone's landing into this one. [x, z, r] circles.
 *
 *  A landmark with `"keep_ground": false` is left out. A landmark is a reach
 *  target (discovered within 20 m), so it needs no ground of its own, and one
 *  that names a knoll, a crag or a ravine sits ON the feature: kept, it would
 *  hold its circle at the pre-feature height and punch a crater in the knoll
 *  or a mound in the ravine (MEASURED 2026-10-12: 10-19 m on the Stone Ring,
 *  the Verse Ring, Gull Tor, the Signal Crag). The landmarks older than the
 *  flag still count -- leaving them all out moves the Glassworks' Western
 *  Dunes by 7 m -- so the land they were built round stays as it is. */
export function zoneKeepClear(zones: Record<string, any>, key: string, r = 6): [number, number, number][] {
  const z = zones[key] || {};
  const out: [number, number, number][] = [];
  const add = (p: any, rr = r) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push([p.x, p.z, rr]); };
  for (const k of ["npcs", "nodes", "interactables"]) for (const p of (z[k] || [])) add(p);
  for (const p of (z.landmarks || [])) if (p.keep_ground !== false) add(p);
  for (const p of (z.portals || [])) add(p, r + 6);
  for (const p of (z.milestones || [])) add(p, r + 6);
  add(z.spawn, r + 4); add(z.start, r + 4);
  for (const [k, other] of Object.entries(zones)) {
    if (k === key) continue;
    for (const p of ((other as any).portals || [])) if (p.to === key) add({ x: p.tx, z: p.tz }, r + 4);
  }
  return out;
}

// ── the landforms ──────────────────────────────────────────────────────────

/** One smooth dome. Steepest flank 1.54 * height / r: walkable while
 *  height < 0.7 r. */
export function mound(o: { x: number; z: number; r: number; height: number }): Feature {
  const { x: cx, z: cz, r, height } = o;
  return (x, z) => {
    const dx = x - cx, dz = z - cz;
    if (dx > r || dx < -r || dz > r || dz < -r) return 0;
    return height * bump(Math.hypot(dx, dz) / r);
  };
}

/** A cluster of rolling hills inside a circle of radius r: `count` domes of
 *  random height and size, joined by a smooth max so overlapping ones read as
 *  one hill with knolls rather than stacking into a spike. */
export function hills(o: { x: number; z: number; r: number; count?: number; height?: [number, number]; size?: [number, number]; seed?: number; blend?: number }): Feature {
  const rand = rng(o.seed ?? 1);
  const [h0, h1] = o.height ?? [3, 8], [s0, s1] = o.size ?? [o.r * 0.25, o.r * 0.5];
  const blend = o.blend ?? 3;
  const domes: { x: number; z: number; r: number; h: number }[] = [];
  for (let i = 0; i < (o.count ?? 6); i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * o.r * 0.75;
    domes.push({ x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d, r: s0 + rand() * (s1 - s0), h: h0 + rand() * (h1 - h0) });
  }
  const R = o.r + s1;
  return (x, z) => {
    if (Math.abs(x - o.x) > R || Math.abs(z - o.z) > R) return 0;
    let v = 0;
    for (const m of domes) {
      const dx = x - m.x, dz = z - m.z;
      if (dx > m.r || dx < -m.r || dz > m.r || dz < -m.r) continue;
      const b = m.h * bump(Math.hypot(dx, dz) / m.r);
      v = v === 0 ? b : smax(v, b, blend * Math.min(1, b / blend, v / blend));
    }
    return v;
  };
}

// The along-line envelope every linear feature shares: fades in over `taper`
// metres at each end, so a ridge or ravine ends as a slope, not a wall.
const ends = (q: Near, taper: number): number =>
  taper <= 0 ? 1 : smoothstep(0, taper, q.s) * smoothstep(0, taper, q.len - q.s);

/** A ridge along a polyline: a crest `height` high, `width` metres from crest
 *  to foot each side, the crest wandering +-jitter in height and the flanks in
 *  width. `sharp` 0..1 trades the rounded crest for a knife edge. Steepest
 *  flank ~1.54 * height / width (rounded) or ~1.6 * height / width (sharp). */
export function ridge(o: { pts: Pt[]; height: number; width: number; sharp?: number; jitter?: number; wavelength?: number; taper?: number; seed?: number }): Feature {
  const l = line(o.pts);
  const jit = o.jitter ?? 0.25, wl = o.wavelength ?? 70, seed = o.seed ?? 1, sharp = o.sharp ?? 0;
  const taper = o.taper ?? o.width;
  const reach = o.width * (1 + jit);
  return (x, z) => {
    const q = l.near(x, z, reach);
    if (!q) return 0;
    // (the width noise reads arc length only, never the side: past an open end
    // the side flips across the line's extension, and so would the height)
    const w = o.width * (1 + jit * (noise2(q.s / wl + 17, 0.5, seed) - 0.5) * 2);
    const u = q.d / w;
    if (u >= 1) return 0;
    const prof = (1 - sharp) * bump(u) + sharp * Math.pow(1 - u, 1.6);
    const crest = o.height * (1 + jit * (noise2(q.s / wl, 0, seed) - 0.5) * 2);
    return crest * prof * ends(q, taper);
  };
}

/** A broad valley: `depth` deep along the polyline, a flat `floor` wide, the
 *  sides falling over the rest of `width` (the full top width). Steepest side
 *  1.5 * depth / ((width - floor) / 2). Open-ended by default (taper 0): a
 *  valley usually runs on out of the zone or into a lake. */
export function valley(o: { pts: Pt[]; depth: number; width: number; floor?: number; jitter?: number; wavelength?: number; taper?: number; seed?: number }): Feature {
  const l = line(o.pts);
  const fh = (o.floor ?? 0) / 2, wh = o.width / 2, jit = o.jitter ?? 0.15, wl = o.wavelength ?? 60, seed = o.seed ?? 2;
  const reach = wh * (1 + jit);
  return (x, z) => {
    const q = l.near(x, z, reach);
    if (!q) return 0;
    const k = 1 + jit * (noise2(q.s / wl + 5, 0.5, seed) - 0.5) * 2;
    const prof = 1 - smoothstep(fh * k, wh * k, q.d);
    return prof > 0 ? -o.depth * prof * ends(q, o.taper ?? 0) : 0;
  };
}

/** A ravine: a cut `depth` deep with a walkable flat `floor` and near-vertical
 *  walls each `wall` metres of run (a 9 m cut over 3 m is grade 4.5 -- a
 *  cliff, unwalkable, which is the point). Its ends taper over `taper` metres
 *  (default 2.2 * depth, a 0.7 grade ramp out of the bed), so a ravine you can
 *  get into is one whose end you can walk up. The walls wander in width. */
export function ravine(o: { pts: Pt[]; depth: number; floor?: number; wall?: number; jitter?: number; wavelength?: number; taper?: number; seed?: number }): Feature {
  const l = line(o.pts);
  const fh = (o.floor ?? 6) / 2, wall = o.wall ?? 4, jit = o.jitter ?? 0.35, wl = o.wavelength ?? 30, seed = o.seed ?? 3;
  const taper = o.taper ?? Math.max(12, o.depth * 2.2);
  const reach = fh * (1 + jit) + wall + 1;
  return (x, z) => {
    const q = l.near(x, z, reach);
    if (!q) return 0;
    const f = fh * (1 + jit * (noise2(q.s / wl, 0.5, seed) - 0.5) * 2);
    const prof = 1 - smoothstep(f, f + wall, q.d);
    return prof > 0 ? -o.depth * prof * ends(q, taper) : 0;
  };
}

/** A gully: a small V-shaped wash `depth` deep and `width` across, rounded in
 *  the bed. Steepest side 2 * depth / (width / 2): the defaults (1.5 m, 10 m)
 *  are 0.6, walkable; deepen it past ~2.5 m at 10 m and it is not. */
export function gully(o: { pts: Pt[]; depth?: number; width?: number; taper?: number; seed?: number }): Feature {
  const l = line(o.pts);
  const depth = o.depth ?? 1.5, wh = (o.width ?? 10) / 2, seed = o.seed ?? 4;
  const taper = o.taper ?? wh * 3;
  return (x, z) => {
    const q = l.near(x, z, wh * 1.2);
    if (!q) return 0;
    const w = wh * (1 + 0.2 * (noise2(q.s / 20, 0.5, seed) - 0.5) * 2);
    const u = q.d / w;
    if (u >= 1) return 0;
    // (1-u)^2, softened at the bed so the V has no knife crease to snag on
    const v = (1 - u) * (1 - u) - 0.15 * bump(u / 0.25);
    return -depth * (v / 0.85) * ends(q, taper);
  };
}

/** A dry stream bed: a flat sandy bed `bed` wide, `depth` down, gentle banks
 *  `bank` wide each side (grade 1.5 * depth / bank: the defaults are 0.3).
 *  For a bed with WATER in it use makeRiver (WATER.md), which carves its own
 *  channel; this is for the washes and dry courses between. */
export function streamBed(o: { pts: Pt[]; depth?: number; bed?: number; bank?: number; taper?: number; seed?: number }): Feature {
  const bed = o.bed ?? 4, bank = o.bank ?? 4;
  return valley({ pts: o.pts, depth: o.depth ?? 0.8, floor: bed, width: bed + 2 * bank, jitter: 0.2, wavelength: 25, taper: o.taper ?? 10, seed: o.seed ?? 5 });
}

/** A ramp across a cliff edge: from `pts[0]` (on the high ground) to `pts[1]`
 *  (on the low ground), `half` wide, its sides blending out over `blend`.
 *  The grade is (top - foot) / length: keep it under ~0.6 for a path. Keep
 *  `half` >= 4 and `blend` >= 6 (the default): the terrain mesh is a 4.7 m
 *  grid, and narrower embankment sides render as faceted spikes (MEASURED on
 *  the demo mesa, tmp/wilds/foundation/terrain/demo2/mesa.jpg). */
export interface Ramp { pts: [Pt, Pt]; half: number; blend?: number }

// A level table's shared core: pull h up (or to) `top` where sd > 0, across an
// edge band `edge` metres wide, then lay the ramps through the edge.
function table(sd: (x: number, z: number) => number, reach: number, o: { top?: number; rise?: number; edge?: number; mode?: "raise" | "set"; ramps?: Ramp[] }): Feature {
  const edge = o.edge ?? 6, raise = (o.mode ?? "raise") === "raise";
  const ramps = (o.ramps ?? []).map((r) => {
    const [[ax, az], [bx, bz]] = r.pts, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    return { ax, az, ux: dx / L, uz: dz / L, L, half: r.half, blend: r.blend ?? 6 };
  });
  return (x, z, h) => {
    const d = sd(x, z);
    const off = d < -edge / 2 - reach;
    if (off && !ramps.length) return 0;
    const target = o.top ?? h + (o.rise ?? 8);
    const t = off ? 0 : smoothstep(-edge / 2, edge / 2, d);
    let y = t > 0 ? lerp(h, target, t) : h;
    if (raise) y = Math.max(h, y);
    for (const r of ramps) {
      const px = x - r.ax, pz = z - r.az;
      const u = (px * r.ux + pz * r.uz) / r.L;
      if (u < -0.1 || u > 1.1) continue;
      const lat = Math.abs(px * r.uz - pz * r.ux);
      if (lat > r.half + r.blend) continue;
      // the ramp runs from the table's top to whatever the ground does at the
      // foot, so it lands on the slope it meets with no step at either end
      const ry = lerp(target, h, clamp01(u));
      const w = (1 - smoothstep(r.half, r.half + r.blend, lat)) * (1 - smoothstep(1, 1.1, u)) * (1 - smoothstep(-0.1, 0, -u));
      // both ways: inside the edge the ramp is a cut down through the table,
      // past it an embankment down to its foot (with `rise`, the ground under
      // a raised table IS the foot's level, so the cut lands where it should)
      if (w > 0) y = lerp(y, ry, w);
    }
    return y - h;
  };
}

/** A plateau over a polygon: level at `top` (absolute) or `rise` metres above
 *  the incoming ground, its edge a cliff `edge` metres wide (default 6: an
 *  8 m rise is grade 2, a cliff). `mode: "raise"` (default) only ever lifts --
 *  where the hill is already higher the table merges into it, rather than
 *  cutting a trench along its top (the Shores' plateau rule). `wobble` metres
 *  of noise on the outline keep a hand-drawn polygon from reading as one.
 *  The only ways up are its `ramps` and where the ground meets its height. */
export function plateau(o: { poly: Pt[]; top?: number; rise?: number; edge?: number; wobble?: number; mode?: "raise" | "set"; ramps?: Ramp[]; seed?: number }): Feature {
  const p = polygon(o.poly), wob = o.wobble ?? 5, seed = o.seed ?? 6, edge = o.edge ?? 6;
  const reach = edge + wob;
  const sd = (x: number, z: number) => {
    const d = p.sd(x, z, reach);
    return d === -Infinity ? d : d + (noise2(x / 22, z / 22, seed) - 0.5) * 2 * wob;
  };
  return table(sd, wob, o);
}

/** A mesa: a free-standing table on an ellipse (r, or rx/rz turned by `rot`),
 *  `rise` above the ground or flat at `top`, cliff-sided over `edge` metres.
 *  Without a ramp it is a landmark nobody climbs, which is fine for a mesa. */
export function mesa(o: { x: number; z: number; r?: number; rx?: number; rz?: number; rot?: number; top?: number; rise?: number; edge?: number; wobble?: number; ramps?: Ramp[]; seed?: number }): Feature {
  const rx = o.rx ?? o.r ?? 30, rz = o.rz ?? o.r ?? 30, c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0);
  const wob = o.wobble ?? 4, seed = o.seed ?? 7, edge = o.edge ?? 5, R = Math.max(rx, rz) + edge + wob;
  const sd = (x: number, z: number) => {
    const dx = x - o.x, dz = z - o.z;
    if (dx > R || dx < -R || dz > R || dz < -R) return -Infinity;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    // ellipse signed distance, approximated: exact on the axes and within a
    // few percent elsewhere for the modest aspect ratios a mesa has
    const k = Math.hypot(lx / rx, lz / rz);
    const ang = Math.atan2(lz, lx);
    return (1 - k) * Math.min(rx, rz) + (noise2(Math.cos(ang) * 2.5 + 9, Math.sin(ang) * 2.5, seed) - 0.5) * 2 * wob;
  };
  return table(sd, 0, { top: o.top, rise: o.rise ?? 10, edge, mode: "raise", ramps: o.ramps });
}

/** Terraces: quantise the ground into level steps `step` metres apart, each
 *  riser taking `riser` (0..1) of the run between steps. On ground of grade g
 *  a riser is about g * 1.5 / riser steep: a 0.3 hillside with riser 0.35 is
 *  1.3, a low wall of earth nobody walks up -- put a ramp or a road (with
 *  roadsClear) through it. Confined to `where` (a mask), softened at its edge. */
export function terraces(o: { where: Mask; step?: number; riser?: number; base?: number }): Feature {
  const step = o.step ?? 2.5, riser = clamp01(o.riser ?? 0.35), base = o.base ?? 0;
  return (x, z, h) => {
    const w = o.where(x, z);
    if (w <= 0) return 0;
    const q = (h - base) / step, k = Math.floor(q), f = q - k;
    const y = base + (k + smoothstep(1 - riser, 1, f)) * step;
    return (y - h) * w;
  };
}

// ── roads ──────────────────────────────────────────────────────────────────

export interface RoadBedOpts {
  window?: number;   // metres of centreline the profile is averaged over (default 24)
  grade?: number;    // the steepest the road may run along its length (default 0.22)
  maxCut?: number;   // never cut more than this below the ground (default 1.2)
  maxFill?: number;  // never build up more than this above it (default 1.5)
  blend?: number;    // the least bank width either side of the road (default 6)
}
/** THE ROAD-SAFE LEVELLER (see "The trench trap" above): a carve that levels
 *  the cross-slope under each road to the ground's own height along its
 *  centreline, averaged over `window` and capped at `grade`, cuts and fills
 *  clamped, the banks widened to 1.9x the cut so they stay walkable. The
 *  clamps win over the grade: a road over ground rougher than maxCut/maxFill
 *  can level keeps some of its roll rather than becoming a cutting. Put it
 *  FIRST in `carves`. Where two roads overlap, the nearer wins, crossfaded.
 *  `pre` is the pre-carve field fieldHeight hands every carve. */
export function roadBed(roads: { pts: Pt[]; half: number }[], opts: RoadBedOpts = {}): { carve: (x: number, z: number, h: number, pre?: HeightField) => number } {
  const win = opts.window ?? 24, grade = opts.grade ?? 0.22, maxCut = opts.maxCut ?? 1.2, maxFill = opts.maxFill ?? 1.5;
  const blend = Math.max(opts.blend ?? 6, 1.9 * Math.max(maxCut, maxFill));
  const lines = roads.map((r) => ({ l: line(r.pts, 0), half: r.half }));
  const STEP = 3;
  // One profile set per pre-field: a zone rebuild hands a new closure, and the
  // profile has to follow it rather than the last zone's ground.
  let forPre: HeightField | null = null, profiles: Float64Array[] = [];
  const build = (pre: HeightField) => {
    profiles = lines.map(({ l }) => {
      const n = Math.max(2, Math.ceil(l.len / STEP) + 1);
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) { const [x, z] = pointAt(l, (i / (n - 1)) * l.len); raw[i] = pre(x, z); }
      // a moving average, then a grade cap relaxed both ways: the profile
      // FOLLOWS the ground and only shaves its bumps -- it is never a straight
      // line between the ends, which is what cut a canyon through Caerdun
      const k = Math.max(1, Math.round(win / STEP / 2)), out = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { s += raw[j]; c++; }
        out[i] = s / c;
      }
      const cap = grade * (l.len / (n - 1));
      for (let pass = 0; pass < 200; pass++) {
        let moved = false;
        for (let i = 1; i < n; i++) {
          const d = out[i] - out[i - 1];
          if (Math.abs(d) > cap + 1e-9) { const fix = (Math.abs(d) - cap) / 2 * Math.sign(d); out[i] -= fix; out[i - 1] += fix; moved = true; }
        }
        if (!moved) break;
      }
      return out;
    });
    forPre = pre;
  };
  return {
    carve(x, z, h, pre) {
      // the profile is the ground ELSEWHERE along the road, so without the
      // pre-carve field (fieldHeight always hands it) there is nothing to level to
      if (!pre) return h;
      const field = pre;
      let wSum = 0, ySum = 0, wMax = 0;
      for (let i = 0; i < lines.length; i++) {
        const { l, half } = lines[i];
        const reachMax = half + blend + 1.9 * Math.max(maxCut, maxFill);
        const q = l.near(x, z, reachMax);
        if (!q) continue;
        if (forPre !== field) build(field);
        const prof = profiles[i], n = prof.length, f = (q.s / (l.len || 1)) * (n - 1), i0 = Math.min(n - 2, Math.floor(f));
        const target = n < 2 ? h : lerp(prof[i0], prof[i0 + 1], f - i0);
        const delta = Math.max(-maxCut, Math.min(maxFill, target - h));
        const bank = Math.max(blend, 1.9 * Math.abs(delta));
        const w = 1 - smoothstep(half, half + bank, q.d);
        if (w <= 0) continue;
        // nearer roads dominate where cuttings overlap (weights squared)
        ySum += (h + delta) * w * w; wSum += w * w; wMax = Math.max(wMax, w);
      }
      if (wSum <= 0) return h;
      return lerp(h, ySum / wSum, wMax);
    },
  };
}
function pointAt(l: Line, s: number): Pt {
  const p = l.pts;
  let acc = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const seg = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    if (seg <= 0) continue;
    if (acc + seg >= s || i + 2 === p.length) {
      const t = clamp01((s - acc) / seg);
      return [lerp(p[i][0], p[i + 1][0], t), lerp(p[i][1], p[i + 1][1], t)];
    }
    acc += seg;
  }
  return p[p.length - 1] ?? [0, 0];
}

// ── analysis ───────────────────────────────────────────────────────────────

/** isWalkable's gradient: central differences over +-s (0.6 m there). */
export function slopeAt(f: HeightField, x: number, z: number, s = 0.6): number {
  const gx = (f(x + s, z) - f(x - s, z)) / (2 * s), gz = (f(x, z + s) - f(x, z - s)) / (2 * s);
  return Math.hypot(gx, gz);
}
/** The spots [x, z, r] with unwalkable ground within r of them (sampled on a
 *  ring and a cross): run after a reshape over zoneKeepClear's list. */
export function unwalkableNear(f: HeightField, spots: [number, number, number][], limit = WALK_SLOPE): { x: number; z: number; slope: number }[] {
  const bad: { x: number; z: number; slope: number }[] = [];
  for (const [x, z, r] of spots) {
    let worst = 0;
    for (const [dx, dz] of [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r]), ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * r * 0.5, Math.sin(i * Math.PI / 4) * r * 0.5])])
      worst = Math.max(worst, slopeAt(f, x + dx, z + dz));
    if (worst > limit) bad.push({ x, z, slope: worst });
  }
  return bad;
}

// ── dressing the steep faces (the plan; wild-cliffs.ts places it) ──────────

export interface CliffSpot {
  x: number; z: number;
  y: number;      // the ground at the face's foot -- seat the body here
  ux: number; uz: number;   // uphill, unit: which way the face's bank lies
  crown: number;  // how tall the body should stand: the face's own drop
  yaw: number;    // turns local +x ALONG the face (placeExact: +x -> (cos t, 0, -sin t))
  slope: number;  // the measured gradient there
}
export interface CliffPlanOpts {
  bounds: { x0: number; x1: number; z0: number; z1: number };
  cell?: number;       // metres between samples (default 4: a cliff band is only a few metres wide)
  minSlope?: number;   // the gradient that counts as a face (default 1.0, near isWalkable's 1.1)
  minDrop?: number;    // metres a face must fall across 2*probe to be worth a body (default 2.5)
  probe?: number;      // metres up and down the fall line the drop is measured over (default 6)
  spacing?: number;    // the least distance between two bodies (default 9)
  max?: number;        // the cap, and so the vertex budget (default 140)
  crown?: [number, number];   // the body's height range in metres (default [2.5, 30])
  avoid?: [number, number, number][];          // circles kept bare (NPCs, portals, landings)
  roads?: { pts: Pt[]; half: number }[];       // corridors kept bare
  roadPad?: number;    // metres past each road's half-width (default 5)
  inside?: (x: number, z: number) => boolean;  // the plate, less its rim reach
  blocked?: (x: number, z: number) => boolean; // anything else (water, scatter exclusions)
  seed?: number;
}
/** Where a zone's steep ground needs rock: every cell steeper than minSlope
 *  that falls at least minDrop, kept off roads and spots, steepest-and-tallest
 *  first, thinned to `spacing`, capped at `max`. Deterministic. */
export function planCliffDressing(f: HeightField, o: CliffPlanOpts): CliffSpot[] {
  const cell = o.cell ?? 4, minSlope = o.minSlope ?? 1.0, minDrop = o.minDrop ?? 2.5, probe = o.probe ?? 6;
  const spacing = o.spacing ?? 9, max = o.max ?? 140, [c0, c1] = o.crown ?? [2.5, 30], pad = o.roadPad ?? 5;
  const rand = rng(o.seed ?? 77);
  const roadLines = (o.roads ?? []).map((r) => ({ l: line(r.pts, 0), r: r.half + pad }));
  const cands: (CliffSpot & { score: number })[] = [];
  const { x0, x1, z0, z1 } = o.bounds;
  for (let z = z0 + cell / 2; z < z1; z += cell) {
    for (let x = x0 + cell / 2; x < x1; x += cell) {
      // jittered inside the cell, so the bodies never stand on a visible grid
      const px = x + (rand() - 0.5) * cell * 0.8, pz = z + (rand() - 0.5) * cell * 0.8;
      const s = 1.2, gx = (f(px + s, pz) - f(px - s, pz)) / (2 * s), gz = (f(px, pz + s) - f(px, pz - s)) / (2 * s);
      const slope = Math.hypot(gx, gz);
      if (!(slope >= minSlope)) continue;
      if (o.inside && !o.inside(px, pz)) continue;
      if (o.avoid && o.avoid.some(([ax, az, ar]) => Math.hypot(px - ax, pz - az) < ar)) continue;
      if (roadLines.some(({ l, r }) => l.near(px, pz, r) !== null)) continue;
      if (o.blocked && o.blocked(px, pz)) continue;
      const ux = gx / slope, uz = gz / slope;   // uphill
      const hi = f(px + ux * probe, pz + uz * probe), lo = f(px - ux * probe, pz - uz * probe);
      const drop = hi - lo;
      if (!(drop >= minDrop)) continue;
      // the spot is ON the face; how far into the bank the body sits is the
      // placer's call (it knows how deep the rock is), so the uphill way goes
      // with it. Seated at the foot: a body seated mid-face floats at its toe.
      const tx = -uz, tz = ux;   // along the contour
      cands.push({ x: px, z: pz, y: Math.min(f(px, pz), lo), ux, uz, crown: Math.max(c0, Math.min(c1, drop * (0.8 + rand() * 0.3))),
        yaw: Math.atan2(-tz, tx), slope, score: slope * drop });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
  // greedy thinning on a hash grid: the steepest, tallest faces claim first
  const grid = new Map<string, CliffSpot[]>(), out: CliffSpot[] = [];
  const key = (gx: number, gz: number) => `${gx},${gz}`;
  for (const c of cands) {
    if (out.length >= max) break;
    const gx = Math.floor(c.x / spacing), gz = Math.floor(c.z / spacing);
    let ok = true;
    for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++)
      for (const p of grid.get(key(gx + i, gz + j)) ?? []) if (Math.hypot(p.x - c.x, p.z - c.z) < spacing) { ok = false; break; }
    if (!ok) continue;
    const { score, ...spot } = c;
    out.push(spot);
    const k = key(gx, gz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(spot);
  }
  return out;
}
