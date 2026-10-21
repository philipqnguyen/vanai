// L3's DRESSING DENSITY (S4; MOONMERE.md A-14, O-14): THE ISLAND'S OUTER LAWNS PLANTED. From every
// aerial and from the sea the city stood on bare sward -- the L1 and L2 belts round the outer coast
// (section 7: "orchards and physic gardens"), the wedges of lawn between the blocks' ends and the
// cross stairs -- with trees only in the Long Garden, the knoll's garden and the courts (LOOKED, S3's
// and S4's aerials). Here the flat lawn that nothing else claims takes the gardens' own trees in
// loose rows: orchard lemons by the Crown and the Landing, olives on the College Arm, cypresses and
// olives on the West Arm and the knoll -- each its own size and turn -- with no new module, no new
// pool and no new draw where those trees were already in view (the pools exist; this adds
// instances). They are the dressing's `far` trees: drawn to 140 m, their trunks solid.
// No Babylon: planMoonmere runs it after the paving, and the layout test reads it.
import { insideBody, segDist, type Box, type Footprint, type P2, type Piece, type Layout } from "./moonmere_types.ts";
import type { Terrain } from "./moonmere_terrain.ts";
import type { StreetsOut } from "./moonmere_streets.ts";
import type { DressOut } from "./moonmere_dress.ts";
import type { MmPaving } from "./moonmere_paving.ts";
import { rng } from "./city_pools.ts";

/** the grid the candidates stand on (jittered) and the clearances a tree keeps (m) */
const O = { step: 7.0, jitter: 1.6, building: 3.2, paving: 1.6, flight: 2.6, tree: 4.2, spot: 3.5, riser: 2.6, slope: 0.12, coast: 9.0, max: 320 };
const TRUNK: Record<string, [number, number]> = { orchard_lemon_a: [0.3, 2.0], orchard_lemon_b: [0.3, 2.0], olive_tree: [0.4, 2.0], cypress: [0.5, 3.0] };

export interface OrchardOut { pieces: Piece[]; boxes: Box[] }

export function planOrchards(L: Layout, T: Terrain, footprints: Footprint[], S: StreetsOut, D: DressOut, paving: MmPaving[]): OrchardOut {
  const out: OrchardOut = { pieces: [], boxes: [] };
  const r = rng(L.dressing.seed * 31 + 7);
  // THE CLEARANCES ON A GRID (S4 review: clear() scanned every body, flight, tree and spot for each
  // of ~3,300 candidates). Everything a candidate must keep clear of is filed once in GRID m buckets
  // by its padded box, and a candidate asks only its own bucket -- the same answers (the
  // layout test's 232 trees, at the same places), in a fraction of the time
  const GRID = 16, grid = new Map<number, ((x: number, z: number) => boolean)[]>();
  const key = (i: number, j: number) => (i + 1000) * 4096 + (j + 1000);
  const file = (x0: number, x1: number, z0: number, z1: number, hit: (x: number, z: number) => boolean) => {
    for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
      const k = key(i, j);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(hit);
    }
  };
  const fileBody = (b: { cx: number; cz: number; hx: number; hz: number }, pad: number, hit: (x: number, z: number) => boolean) => {
    const r = Math.hypot(b.hx, b.hz) + pad;
    file(b.cx - r, b.cx + r, b.cz - r, b.cz + r, hit);
  };
  for (const f of footprints) if (f.body) { const b = f.body; fileBody(b, O.building, (x, z) => insideBody(b, x, z, O.building)); }
  for (const f of S.flights) { const b = f.body; fileBody(b, O.flight, (x, z) => insideBody(b, x, z, O.flight)); }
  for (const p of [...paving.map((p) => ({ pts: p.pts as P2[], half: p.half })), ...S.floors.map((f) => ({ pts: f.pts as P2[], half: f.half }))]) {
    if (p.pts.length < 2) continue;
    const pad = p.half + O.paving;
    // (each segment on its own: a long street's box would file it into every bucket it bounds)
    for (let k = 1; k < p.pts.length; k++) {
      const [ax, az] = p.pts[k - 1], [bx, bz] = p.pts[k];
      file(Math.min(ax, bx) - pad, Math.max(ax, bx) + pad, Math.min(az, bz) - pad, Math.max(az, bz) + pad, (x, z) => segDist(x, z, ax, az, bx, bz) < pad);
    }
  }
  for (const rs of T.risers()) for (let k = 1; k < rs.pts.length; k++) {
    const [ax, az] = rs.pts[k - 1], [bx, bz] = rs.pts[k], pad = O.riser + 1.2;
    file(Math.min(ax, bx) - pad, Math.max(ax, bx) + pad, Math.min(az, bz) - pad, Math.max(az, bz) + pad, (x, z) => segDist(x, z, ax, az, bx, bz) < pad);
  }
  const point = (px: number, pz: number, r: number) => file(px - r, px + r, pz - r, pz + r, (x, z) => Math.hypot(px - x, pz - z) < r);
  for (const p of D.pieces) if (/^(orchard_|olive_tree|cypress|oleander|lemon_|well_head|bench_|herb_bed|kerb|pergola|cafe_|stall|market_|court_|mere_)/.test(p.file)) point(p.x, p.z, O.tree);
  for (const s of Object.values(L.spots)) if (s.x !== undefined && s.z !== undefined) point(s.x, s.z, O.spot);
  for (const s of L.residentSeats) point(s.x, s.z, O.spot);
  const clear = (x: number, z: number): boolean => !(grid.get(key(Math.floor(x / GRID), Math.floor(z / GRID))) ?? []).some((hit) => hit(x, z));
  const xs = [-200, 200], zs = [-130, 280];
  for (let gz = zs[0]; gz <= zs[1]; gz += O.step) for (let gx = xs[0]; gx <= xs[1]; gx += O.step) {
    if (out.pieces.length >= O.max) break;
    const x = gx + (r() - 0.5) * 2 * O.jitter, z = gz + (r() - 0.5) * 2 * O.jitter;
    const g = T.ground(x, z);
    if (g === null || T.inWater(x, z) || T.dc(x, z) < O.coast || T.level(x, z) < 1) continue;
    // (the grid's answer first: it is cheaper than the four ground samples, and both must pass)
    if (!clear(x, z)) continue;
    // flat lawn only: the four points 1.5 m round it within the slope of a kept sward
    const hs = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([dx, dz]) => T.ground(x + dx, z + dz));
    if (hs.some((h) => h === null || Math.abs(h - g) > O.slope * 1.5)) continue;
    // by district: the College Arm olives, the West Arm and the knoll cypress and olive, the Crown's
    // and the Landing's side orchard lemons
    const roll = r();
    const file = x > 45 ? (roll < 0.75 ? "olive_tree" : "orchard_lemon_b")
      : x < -45 ? (roll < 0.35 ? "cypress" : roll < 0.8 ? "olive_tree" : "orchard_lemon_a")
      : (roll < 0.5 ? "orchard_lemon_a" : roll < 0.85 ? "orchard_lemon_b" : "olive_tree");
    const k = +(0.85 + r() * 0.3).toFixed(3);
    const cell = `or:${Math.floor((x + 200) / 48)},${Math.floor((z + 130) / 48)}`;
    out.pieces.push({ file, cell, x, y: g, z, yaw: r() * Math.PI * 2, axes: [k, +(k * (0.92 + r() * 0.16)).toFixed(3), k], reach: 4, far: true } as Piece);
    const [h, top] = TRUNK[file];
    out.boxes.push({ cx: x, cz: z, hx: h * k, hz: h * k, yaw: 0, y0: g - 0.5, y1: g + top, what: `orchard ${file}`, cell });
    point(x, z, O.tree);
  }
  return out;
}
