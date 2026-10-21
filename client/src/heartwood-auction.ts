// Heartwood's auction house, drawn: the fittings grown into the hall's shell
// (heartwood-auction-plan.ts is the plan; grownHome in heartwood-neighborhood.ts
// grows the shell from the plan's openings and calls this inside its own
// window, so every piece here is one of the hall's meshes: lit by its hearth,
// merged by material with its walls, cast and culled with them).
//
// NO NEW SHADER. Every piece is in a material the city already has: the bark
// (counter bodies, the board's panel, the roundels' field, the sapling), the
// honey wood (counter tops, the board's frame, the roundels' ring) and the
// amber resin of the windows (the emblem's balance, so by night the balance
// is lit like every window and joins the one window-glow copy), plus the leaf
// colours of the crowns; the notices are the one new material, plain paper.
import { Mesh, VertexData, type StandardMaterial } from '@babylonjs/core';
import { scene, buildApi, addShadowCaster } from './scene';
import { grownBranch, leafCloud, type Home, type P } from './heartwood-neighborhood';
import { HALL, hallCounters, hallWallPieces, hallSign, counterGeometry, boardGeometry, emblemGeometry, placeGeom, type Geom, type EmblemData } from './heartwood-auction-plan';
import EMBLEM from './auction-emblem.json' with { type: 'json' };

export type HallMaterials = { bark: StandardMaterial; wood: StandardMaterial; glass: StandardMaterial; leaves: StandardMaterial[]; paper: StandardMaterial };

/** One mesh per material: the plan's pieces concatenated, normals computed
 * where a piece has none (two-sided city materials light either winding). */
function emit(name: string, parts: Geom[], mat: StandardMaterial): void {
  const g: Geom = { positions: [], indices: [], uvs: [], normals: [] };
  for (const p of parts) {
    const b = g.positions.length / 3;
    g.positions.push(...p.positions); g.uvs.push(...p.uvs);
    for (const i of p.indices) g.indices.push(i + b);
    if (p.normals) g.normals!.push(...p.normals);
    else { const n: number[] = []; VertexData.ComputeNormals(p.positions, p.indices, n); g.normals!.push(...n); }
  }
  if (!g.indices.length) return;
  const vd = new VertexData(); Object.assign(vd, g);
  const m = new Mesh(`hw_${name}`, scene); vd.applyToMesh(m);
  m.material = mat; m.isPickable = false; addShadowCaster(m);
}

/** The hall's counters, board, roundels and sign, on its floor `h.y`. */
export function buildAuctionFittings(h: Home, M: HallMaterials): void {
  const y = h.y, by: Record<'bark' | 'wood' | 'glass' | 'paper', Geom[]> = { bark: [], wood: [], glass: [], paper: [] };
  const put = (g: Record<string, Geom>, map: Record<string, keyof typeof by>, x: number, yy: number, z: number, yaw: number) => {
    for (const [part, mat] of Object.entries(map)) by[mat].push(placeGeom(g[part], x, yy, z, yaw));
  };
  // ── the four counters, each a collider on its chord ──
  const counter = counterGeometry(), { radius: R, halfSpan: S, height: CH, depth: D } = HALL.counters;
  for (const c of hallCounters()) {
    put(counter, { top: 'wood', body: 'wood', plinth: 'bark' }, c.x, y, c.z, c.yaw);
    buildApi.addBoxCollider(c.box.x, c.box.z, c.box.hx, c.box.hz, c.box.yaw, y + CH + .05, y);
    // a living lip along the top's front edge, and three roots at its foot
    const arc = (rr: number, yy: number, n: number): P[] => Array.from({ length: n + 1 }, (_, i) => { const a = c.a - S + 2 * S * i / n; return [HALL.x + Math.sin(a) * rr, yy, HALL.z + Math.cos(a) * rr]; });
    grownBranch('counter_lip', arc(R - D / 2 - .09, y + CH - .04, 8), .055, .055, M.wood);
    for (const t of [-.75, 0, .75]) {
      const a = c.a + t * S, o = (rr: number, yy: number): P => [HALL.x + Math.sin(a) * rr, y + yy, HALL.z + Math.cos(a) * rr];
      grownBranch('counter_root', [o(R - D / 2 + .02, .55), o(R - D / 2 - .12, .2), o(R - D / 2 - .32, -.02)], .09, .05, M.bark);
    }
  }
  // ── the board, its roundel and the plaques over the brokers ──
  const W = hallWallPieces(), E = EMBLEM as unknown as EmblemData;
  put(boardGeometry(), { frame: 'wood', panel: 'bark', notes: 'paper' }, W.board.x, y + W.board.y, W.board.z, W.board.yaw);
  const roundel = { field: 'bark', ring: 'wood', device: 'glass' } as const;
  put(emblemGeometry(E, 'plaque', W.boardRoundel.r), roundel, W.boardRoundel.x, y + W.boardRoundel.y, W.boardRoundel.z, W.boardRoundel.yaw);
  for (const p of W.plaques) put(emblemGeometry(E, 'plaque', p.r), roundel, p.x, y + p.y, p.z, p.yaw);
  // ── the sign: the roundel both ways, in a hoop the sapling grew ──
  const sg = hallSign(), sy = y + sg.y;
  put(emblemGeometry(E, 'sign', sg.r, true), roundel, sg.x, sy, sg.z, sg.yaw);
  for (const [k, list] of Object.entries(by)) emit(`auction_${k}`, list, M[k as keyof typeof by]);
  // In the sign's plane: right along (cos yaw, -sin yaw), up y.
  const tx = Math.cos(sg.yaw), tz = -Math.sin(sg.yaw), inPlane = (u: number, v: number, n = 0): P => [sg.x + tx * u + Math.sin(sg.yaw) * n, sy + v, sg.z + tz * u + Math.cos(sg.yaw) * n];
  const crown = y + HALL.height + HALL.rise, foot = sy - sg.hoop;
  // the sapling: out of the dome's crown with a slow turn, into the hoop's foot
  grownBranch('sign_bough', [[sg.x, crown - .6, sg.z], [sg.x + tz * .35, crown + 1.2, sg.z - tx * .35], [sg.x - tz * .25, crown + 2.8, sg.z + tx * .25], [sg.x, foot + .15, sg.z]], .75, .36, M.bark);
  // three roots over the dome, where the sapling took hold
  for (let i = 0; i < 3; i++) {
    const a = sg.yaw + .5 + i * TAU3, dr = 2.3, dy = HALL.rise * Math.sin(Math.acos(Math.min(1, dr / (HALL.r + .65))));
    grownBranch('sign_root', [[sg.x + Math.sin(a) * dr, y + HALL.height + dy - .05, sg.z + Math.cos(a) * dr], [sg.x + Math.sin(a) * 1, crown + .2, sg.z + Math.cos(a) * 1], [sg.x, crown + 1.3, sg.z]], .22, .14, M.bark);
  }
  // the hoop, a closed ring round the roundel, and four stays to its rim
  const hoop: P[] = Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI * 2; return inPlane(Math.sin(a) * sg.hoop, -Math.cos(a) * sg.hoop); });
  // in the honey wood of the rails and ribs: a bark hoop was lost against the
  // great trunks standing behind it from the Grove Ring (LOOKED, after1/plaza)
  grownBranch('sign_hoop', hoop, sg.tube, sg.tube, M.wood);
  for (const a of [.785, 2.356, 3.927, 5.498]) grownBranch('sign_stay', [inPlane(Math.sin(a) * (sg.r - .05), Math.cos(a) * (sg.r - .05)), inPlane(Math.sin(a) * (sg.hoop - .1), Math.cos(a) * (sg.hoop - .1))], .08, .08, M.wood);
  // and over the hoop the sapling's own crown: a sprout and a tuft of leaves.
  // Leaf colours 1 and 3 only: a home's ivy takes 0 and 2 (grownHome, i even),
  // and a leaf cloud (vertex colours) cannot merge with ivy cards (none).
  grownBranch('sign_sprout', [inPlane(0, sg.hoop - .05), inPlane(.25, sg.hoop + .7), inPlane(-.1, sg.hoop + 1.35)], .16, .06, M.bark);
  leafCloud(inPlane(0, sg.hoop + 1.7), 1.5, M.leaves[1], 9551, 140, .55);
  leafCloud(inPlane(.9, sg.hoop + 1.05, .2), .9, M.leaves[3], 9552, 70, .5);
  leafCloud(inPlane(-.85, sg.hoop + 1.15, -.2), .9, M.leaves[3], 9553, 70, .5);
}
const TAU3 = Math.PI * 2 / 3;
