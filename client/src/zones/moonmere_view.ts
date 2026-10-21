// THE CITY SEEN FROM THE SHORES, ON PAPER (MM-16, MOONMERE.md A-14): which of the city's pieces the
// Moonmere Shores draw across the water, and where. No Babylon: zones/moonmere_shores.ts builds
// exactly this and test/moonmere_causeway.test.mjs reads it.
import { mmCellPlan } from "./moonmere_kit.ts";
import { segDist, type P2, type Piece } from "./moonmere_types.ts";
import type { MoonmerePlan } from "./moonmere_plan.ts";

/** Moonmere's frame into the Shores': the causeway's land end (8, 262) on the Shores' deck end (0, -380)
 * (makeCauseway's zSea there): the city stands where the Shores' causeway walks onto its Landing */
export const SHORES_FROM_MOONMERE = { dx: -8, dz: -642 };

/** what the view keeps: no interior, nothing LOD0-only or drawn to 140 m only, nothing culled near,
 * none of the causeway's own bays and lamps (the Shores draws its own deck over the same water) and
 * none of the shells that stand inside the mere or behind the island (the Customs House, the
 * boathouses, the Sea Lamp: behind the island from every Shores camera, LOOKED in S4) */
// (S4 review: the view's 44 main-pass draws at every Shores camera that sees it, a pool a draw: the
// three smallest of its pools -- the stair flights' flank masonry, the chimneys and the pergolas, each
// a few pixels at the view's 110-500 m and the flanks hidden by the stairs they carry -- are dropped)
const VIEW_DROP = /^(ch_shell|bh_bay|sl_shell|lt_louvres|cw_bay|cw_abut|lamp_post|door_leaf|shutters_pair|flight_flank|chimney|pergola)$/;
export function viewPieces(all: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of mmCellPlan(all)) {
    if (p.cell.endsWith("/in") || p.mask === 0b001 || p.near || VIEW_DROP.test(p.file)) continue;
    if (p.lod?.cull !== undefined && Number.isFinite(p.lod.cull)) continue;
    const q: Piece = { ...p, x: p.x + SHORES_FROM_MOONMERE.dx, z: p.z + SHORES_FROM_MOONMERE.dz, cell: `v:${p.cell}` };
    // a bay at its LOD1 however near: nobody stands within its 45 m (the barrier at -272 is 108 m off)
    if (p.lods) q.lods = [p.lods[1], p.lods[1], p.lods[2]];
    out.push(q);
  }
  return out;
}

// THE VIEW BAKED (S4 review: "MM-16's view is cheap in draws but not in main-thread time" -- the
// Shores ran the whole of planMoonmere and painted the island's ground in one task a tick after
// their own build, 2.1 s on WebKit, 0.4-1.9 s on Chromium under load). What the Shores draw of the
// city is a pure function of the layout, so it is made ONCE, here, by tools/data/moonmere_view_bake.mjs
// into client/src/moonmere-view.json, and test/moonmere_causeway.test.mjs holds the file to a fresh
// bake (a layout, a planner or a module list that moves without a re-bake fails the test). The
// Shores load the file as their own chunk and build it a step a frame (moonmere_shores.ts).

/** the island's ground seen from across the water: a 3 m grid over the plan's exact ground, painted
 * once onto a 1024 px sheet; `shelf`: the sea within this of the coast is the island's sandy shelf */
export const VIEW_GROUND = { x0: -210, z0: -170, size: 470, cell: 3, px: 1024, shelf: 45 };
/** the sheet's cell classes: 0 nothing (the sheet's sand shows), then lawn, rock, sand, the mere's bed */
export const VIEW_COL = ["#c9b892", "#7d8a5a", "#4a5262", "#c9b892", "#3f5654"];
export const VIEW_STONE = { setts: "#c4b08a", flags: "#d2c29c" };

export interface ViewBake {
  /** the pieces, in the Shores' frame (viewPieces) */
  pieces: Piece[];
  /** the houses' bodies for their hours (moonmere_night.ts paintLitHouses), in Moonmere's frame */
  houses: { id: string; body: { cx: number; cz: number; hx: number; hz: number; yaw: number } }[];
  ground: {
    n: number;
    /** heights, cm, Int16 little-endian, base64; row j (z) by column i (x) */
    h: string;
    /** 0 the deep (no mesh), 1 the shelf, 2 land, 3 the mere; base64 */
    kind: string;
    /** per cell ((n-1) x (n-1)), VIEW_COL's class; base64 */
    col: string;
    /** the city's stone over the cells: [flags? 1 : 0, half-width (0: a filled polygon), x, z, x, z, ...] */
    stone: number[][];
  };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r2 = (v: number) => Math.round(v * 100) / 100;
const b64 = (u8: Uint8Array): string => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s: string): Uint8Array => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

/** the city's pieces the Shores take: every piece the whole city (L2) builds, by its cells */
export function viewSource(P: MoonmerePlan): Piece[] {
  return mmCellPlan([...P.B.pieces, ...P.C.pieces, ...P.S.pieces, ...P.H.pieces, ...P.D.pieces].filter((p) => !!p.cell));
}

export function bakeView(P: MoonmerePlan): ViewBake {
  const pieces = viewPieces(viewSource(P)).map((p) => {
    const q: Piece = { ...p, x: r4(p.x), y: r4(p.y), z: r4(p.z), yaw: r4(p.yaw) };
    if (p.axes) q.axes = p.axes.map(r4) as [number, number, number];
    return q;
  });
  const houses = P.B.houses.map((h) => ({ id: h.id, body: { cx: r4(h.body.cx), cz: r4(h.body.cz), hx: r4(h.body.hx), hz: r4(h.body.hz), yaw: r4(h.body.yaw) } }));
  return { pieces, houses, ground: bakeGround(P) };
}

function bakeGround(P: MoonmerePlan): ViewBake["ground"] {
  const G = VIEW_GROUND, T = P.T, L = P.L, n = Math.round(G.size / G.cell) + 1, sea = L.terrain.levels.waterline ?? -1.25;
  const hs = new Int16Array(n * n), kind = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = G.x0 + i * G.cell, z = G.z0 + j * G.cell, g = T.ground(x, z), k = j * n + i;
    let h: number;
    if (g !== null) { kind[k] = 2; h = g; }
    else if (T.inWater(x, z)) { kind[k] = 3; h = T.mereBed(x, z, -4); }
    else { const dc = T.dc(x, z); kind[k] = dc > -G.shelf ? 1 : 0; h = Math.max(-8, sea - 0.25 + dc * 0.14); }
    hs[k] = Math.round(h * 100);
  }
  // (S4 review: the risers read flat blue blotched with lawn green -- a cell classed off three of its
  // corners, so a riser's face half in a cell kept its lawn. All four corners now, and every cell a
  // riser's line crosses is rock, whatever its slope)
  const risers = T.risers().filter((r) => r.pts.length >= 2).map((r) => r.pts as P2[]);
  const onRiser = (x: number, z: number) => risers.some((pts) => {
    for (let k = 1; k < pts.length; k++) if (segDist(x, z, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]) < G.cell * 0.75) return true;
    return false;
  });
  const beachTop = L.terrain.coast.beachTop, col = new Uint8Array((n - 1) * (n - 1));
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const q = [j * n + i, j * n + i + 1, (j + 1) * n + i, (j + 1) * n + i + 1];
    const land = q.filter((v) => kind[v] === 2).length, mere = q.some((v) => kind[v] === 3);
    let c = 0;
    if (mere) c = 4;
    else if (land) {
      const h = q.map((v) => hs[v] / 100), lo = Math.min(...h), hi = Math.max(...h);
      const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell;
      c = hi < beachTop + 0.3 ? 3 : land < 4 || (hi - lo) / G.cell > 0.6 || onRiser(x, z) ? 2 : 1;
    }
    col[j * (n - 1) + i] = c;
  }
  const flat = (pts: readonly (readonly [number, number])[]) => pts.flatMap(([x, z]) => [r2(x), r2(z)]);
  const stone: number[][] = [
    ...P.paving.map((r) => [r.tex === "pave_flags" ? 1 : 0, r2(r.half), ...flat(r.pts)]),
    ...P.S.floors.map((f) => [1, r2(f.half), ...flat(f.pts)]),
    ...[...P.B.footprints, ...P.C.footprints].map((f) => [0, 0, ...flat(f.pts)]),
  ];
  return { n, h: b64(new Uint8Array(hs.buffer)), kind: b64(kind), col: b64(col), stone };
}
