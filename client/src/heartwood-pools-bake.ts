// Heartwood's lamp light, baked (tmp/heartwood-night PLAN.md step L3). The
// pure half: no Babylon, so the node test reads exactly what the page bakes.
// heartwood-pools.ts uploads the result and draws it.
//
// WHY A MAP AND NOT LIGHTS. Babylon binds every unscoped light to every mesh,
// and WebKit 26 fails to link a material past 10 (MEASURED, BASELINE.md §3):
// the city's home groups already bind up to 7. 300 lamps' worth of light as
// point lights is out of the question; as one texture fetch it costs nothing
// the machine can resolve (MEASURED on the pools prototype).
//
// ONE RGBA8 TEXEL PER 1.13 x 0.94 m of world XZ (POOL_RES), two layers in it,
// because the city has two floors at one XZ (a lane under a ring walk, a
// trunk's foot under its deck): R the ground layer's irradiance and G the
// height of the lamps that lit it (weighted by their contribution), B and A
// the same for the upper layer. The shader windows each layer by height
// against its G or A, so a deck's pool never falls on the lane under it.
//
// THE SPLAT is a broad soft pool with a hot centre, a point light over a
// plane:  f = (1 - (d/R)^2)^2 * (0.55 + 0.45 (h^2 / (h^2 + d^2))^1.5)
// times a soft 2D visibility. A trunk (a circle collider the lamp is not
// inside) throws a wedge of shadow out of the pool; a home's wall keeps an
// outside lamp off its floor except through the door gap, and lets only
// DOOR_THROAT of it in there.

export interface PoolSource {
  /** where the light hangs, and the floor under it (h = y - floor) */
  x: number; z: number; y: number; floor: number;
  /** the pool's reach (m) and its strength (1 = a lane crook) */
  R: number; I: number;
  layer: 0 | 1;
}
/** A round occluder: a trunk, a post, a planter (circleColliders, r >= 0.8).
 * `trunk`: one of the great trunks, the only thing that stands at an upper
 * deck's height. */
export interface PoolCircle { x: number; z: number; r: number; trunk: boolean }
/** A home's wall: a ring of radius r with one gap, the door, centred on
 * `door` (Babylon's yaw: the gap faces (sin door, cos door)) and `doorHalf`
 * metres to each side. `y` is its floor: it shadows only lamps near it.
 * `throat`: DOOR_THROAT unless given (the test bakes the uncut room with 1). */
export interface PoolHome { x: number; z: number; r: number; y: number; door: number; doorHalf: number; throat?: number;
  /** more gaps beside the door: the auction house's arcade (heartwood-auction-plan.ts hallGaps) */
  gaps?: readonly { a: number; half: number }[] }

export const POOL_BOUNDS = { x0: -330, z0: -240, wx: 580, wz: 480 };
/** 512 texels over 580 x 480 m: 1.13 x 0.94 m each, plenty for 5-14 m
 * pools. The plan's 1024 cost more than this machine resolves (one 4 MB
 * texture fetched by every walk and wall fragment, the meadow's overdraw
 * deepest of all): in-page in WebKit, the pool at 1024 cost 9.4% at
 * k_forecourt_palace and 7.3% at l_stair_avenue, at 512 -1.1% and 2.2%
 * (MEASURED, steps/L3/perf/ab-webkit-*.json; noise about 3%). A quarter of
 * the memory and of the bake too. */
export const POOL_RES = 512;

/** The stored irradiance's full scale, in lamp units (above POOL_CEIL, so
 * the knee below decides the top, not the byte). */
export const POOL_STORE = 1.25;
/** The height channels hold (y - y0) / POOL_SPAN, y0 the map's own base. */
export const POOL_SPAN = 64;
/** Where pools overlap, the light saturates instead of adding up: linear to
 * KNEE, then easing toward CEIL. Two door lamps and the hearth's spill on one
 * doorstep summed to 2.2 lamps and burned the threshold to daylight orange
 * (MEASURED, n_courtyard_garden walk luma 97 at night against 107 by day). */
export const POOL_KNEE = .7, POOL_CEIL = 1;
export function poolKnee(I: number): number {
  return I <= POOL_KNEE ? I : POOL_KNEE + (POOL_CEIL - POOL_KNEE) * (1 - Math.exp(-(I - POOL_KNEE) / (POOL_CEIL - POOL_KNEE)));
}
/** The soft edge of a shadow, metres either side of the occluder's rim. */
const SOFT = .35;
/** What an outside lamp puts on a home's floor through its door: a fraction,
 * not its full pool. The map is 2D, so in the door gap it is level across the
 * wall line (lit outside, lit just inside), and the shader's wall test reads
 * the light's direction from the map's slope: where the slope is flat it
 * cannot tell the wall's inner face over the arch from its outer face, and
 * the inner face took the plain wall share. In the large civic homes (door
 * 2.3 m each side, R 9 door lamps) that was a hard amber band over the door
 * seen from inside (MEASURED, review-L3fix1 h2 36.2 -> 57.1 luma, h0 35.1 ->
 * 49.8). Cut to this fraction the map steps down across the ring in the gap
 * as it does across solid wall, so its slope points out of the room there
 * too. The room's own light is its hearth's (a real light on its own
 * meshes); a lamp beside the arch, outside the wall plane, would only graze
 * the threshold anyway. */
export const DOOR_THROAT = .3;

/** The pool's shape: a lamp `h` m over its floor, at `d` m across it. */
export function poolFalloff(d: number, R: number, h: number): number {
  const q = 1 - (d * d) / (R * R);
  if (q <= 0) return 0;
  const c = (h * h) / (h * h + d * d);
  return q * q * (.55 + .45 * c * Math.sqrt(c));
}

/** How much of the lamp at (lx, lz) reaches (x, z) past the occluders. */
export function poolVisibility(lx: number, lz: number, x: number, z: number, circles: readonly PoolCircle[], homes: readonly PoolHome[]): number {
  const dx = x - lx, dz = z - lz, L2 = dx * dx + dz * dz || 1e-9;
  let vis = 1;
  for (const c of circles) {
    let t = ((c.x - lx) * dx + (c.z - lz) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = lx + dx * t - c.x, pz = lz + dz * t - c.z;
    const s = (Math.sqrt(px * px + pz * pz) - c.r + SOFT) / (2 * SOFT);
    if (s <= 0) return 0;
    if (s < 1) vis *= s;
  }
  for (const h of homes) {
    vis *= homeVisibility(h, lx, lz, dx, dz);
    if (vis <= 0) return 0;
  }
  return vis;
}

/** The wall of home h along the segment from (lx, lz) by (dx, dz): 1 where
 * the segment does not cross the ring or crosses it inside the door gap, 0
 * through solid wall, soft over SOFT m at the gap's edges; DOOR_THROAT of
 * that where it ends inside the ring of a home the lamp is outside. */
function homeVisibility(h: PoolHome, lx: number, lz: number, dx: number, dz: number): number {
  // |l + t d - c|^2 = r^2
  const ox = lx - h.x, oz = lz - h.z, a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - h.r * h.r;
  const disc = b * b - 4 * a * c;
  if (disc <= 0 || a === 0) return 1;
  const sq = Math.sqrt(disc);
  const vis = wallCrossing(h, ox, oz, dx, dz, (-b - sq) / (2 * a));
  if (vis <= 0) return 0;
  // ends inside (|o + d| < r) from outside (c > 0): in through the door
  const ex = ox + dx, ez = oz + dz, inside = c > 0 && ex * ex + ez * ez < h.r * h.r;
  return vis * wallCrossing(h, ox, oz, dx, dz, (-b + sq) / (2 * a)) * (inside ? h.throat ?? DOOR_THROAT : 1);
}
function wallCrossing(h: PoolHome, ox: number, oz: number, dx: number, dz: number, t: number): number {
  if (t <= 0 || t >= 1) return 1;
  // where it crosses the wall, as metres of arc from the door's centre
  const at = Math.atan2(ox + dx * t, oz + dz * t), gap = (a: number, half: number) => {
    const ang = at - a, off = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) * h.r;
    return (half - off + SOFT) / (2 * SOFT);
  };
  let s = gap(h.door, h.doorHalf);
  if (h.gaps) for (const g of h.gaps) s = Math.max(s, gap(g.a, g.half));
  return s <= 0 ? 0 : s < 1 ? s : 1;
}

/** One lamp's light at (x, z) on its own layer, before the map's clamp. */
export function poolAt(s: PoolSource, x: number, z: number, circles: readonly PoolCircle[], homes: readonly PoolHome[]): number {
  const d = Math.hypot(x - s.x, z - s.z), f = poolFalloff(d, s.R, s.y - s.floor);
  if (!(f > 0)) return 0;
  const occ = occludersFor(s, circles, homes);
  return f * s.I * poolVisibility(s.x, s.z, x, z, occ.circles, occ.homes);
}

/** What can shadow lamp s: circles near it that it is not inside (on an
 * upper deck only the great trunks), and the homes whose floor is near its
 * own. */
export function occludersFor(s: PoolSource, circles: readonly PoolCircle[], homes: readonly PoolHome[]) {
  const reach = s.R + 1.5;
  return {
    circles: circles.filter((c) => {
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      return d < reach + c.r && d > c.r + .05 && (s.layer === 0 || c.trunk);
    }),
    homes: homes.filter((h) => Math.abs(h.y - s.floor) < 3 && Math.hypot(h.x - s.x, h.z - s.z) < reach + h.r),
  };
}

export interface PoolBake { data: Uint8Array; res: number; y0: number; splats: number; ms: number }

/** The map: res x res RGBA8, row j at world z0 + (j + .5) * wz / res. */
export function bakePoolLayers(sources: readonly PoolSource[], circles: readonly PoolCircle[], homes: readonly PoolHome[], res = POOL_RES, bounds = POOL_BOUNDS): PoolBake {
  const t0 = typeof performance === 'undefined' ? Date.now() : performance.now();
  const { x0, z0, wx, wz } = bounds, sx = wx / res, sz = wz / res, n = res * res;
  let y0 = Infinity;
  for (const s of sources) y0 = Math.min(y0, s.floor);
  y0 = Number.isFinite(y0) ? Math.floor(y0 - 8) : 0;
  // per layer: irradiance, height x weight, weight
  const I = [new Float32Array(n), new Float32Array(n)], HW = [new Float32Array(n), new Float32Array(n)], W = [new Float32Array(n), new Float32Array(n)];
  let splats = 0;
  for (const s of sources) {
    const reach = s.R + 1.5, reach2 = reach * reach, R2 = s.R * s.R, h = s.y - s.floor, h2 = h * h;
    const occ = occludersFor(s, circles, homes), oc = occ.circles, oh = occ.homes;
    const i0 = Math.max(0, Math.floor((s.x - reach - x0) / sx)), i1 = Math.min(res - 1, Math.ceil((s.x + reach - x0) / sx));
    const j0 = Math.max(0, Math.floor((s.z - reach - z0) / sz)), j1 = Math.min(res - 1, Math.ceil((s.z + reach - z0) / sz));
    const Il = I[s.layer], Hl = HW[s.layer], Wl = W[s.layer];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + .5) * sz, dz = z - s.z, dz2 = dz * dz;
      if (dz2 > reach2) continue;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + .5) * sx, dx = x - s.x, d2 = dx * dx + dz2;
        if (d2 > reach2) continue;
        let f = 0;
        const q = 1 - d2 / R2;
        if (q > 0) {
          const c = h2 / (h2 + d2);
          f = q * q * (.55 + .45 * c * Math.sqrt(c)) * s.I;
          if (oc.length || oh.length) f *= poolVisibility(s.x, s.z, x, z, oc, oh);
        }
        const k = j * res + i, w = Math.max(f, 1e-3 * (1 - Math.sqrt(d2) / reach));
        Il[k] += f; Hl[k] += s.y * w; Wl[k] += w; splats++;
      }
    }
  }
  const data = new Uint8Array(n * 4), toI = 255 / POOL_STORE, toH = 255 / POOL_SPAN;
  for (let k = 0; k < n; k++) {
    for (let L = 0; L < 2; L++) {
      const w = W[L][k];
      if (!w) continue;
      data[k * 4 + L * 2] = Math.min(255, Math.round(poolKnee(I[L][k]) * toI));
      data[k * 4 + L * 2 + 1] = Math.max(0, Math.min(255, Math.round((HW[L][k] / w - y0) * toH)));
    }
  }
  const t1 = typeof performance === 'undefined' ? Date.now() : performance.now();
  return { data, res, y0, splats, ms: t1 - t0 };
}

/** The map's value at (x, z) on a layer, nearest texel, decoded (after the
 * knee): what the
 * shader reads before its height window. For the test and the QA tools. */
export function poolSample(bake: PoolBake, x: number, z: number, layer: 0 | 1, bounds = POOL_BOUNDS): { I: number; y: number } {
  const i = Math.floor((x - bounds.x0) / bounds.wx * bake.res), j = Math.floor((z - bounds.z0) / bounds.wz * bake.res);
  if (i < 0 || j < 0 || i >= bake.res || j >= bake.res) return { I: 0, y: bake.y0 };
  const k = (j * bake.res + i) * 4 + layer * 2;
  return { I: bake.data[k] / 255 * POOL_STORE, y: bake.y0 + bake.data[k + 1] / 255 * POOL_SPAN };
}
