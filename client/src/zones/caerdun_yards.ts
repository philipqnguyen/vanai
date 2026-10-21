// Caerdun's walled yards and kitchen gardens on paper (the close-out pass,
// 2026-10-06). No Babylon here, so the plan test reads exactly what is built.
//
// WHY: the contract's first yard rule ("back yards between rows at most 12 m
// deep", CAERDUN-CONTRACT.md 4.7) needs ~84 houses at this walled area; Philip kept the
// 44-52 (CF-5 via VERDICT Q2). So the yards stay deep and become what a granite
// garrison town makes of a deep yard: a WALLED YARD with a gate onto the street
// and a kitchen garden in it. The rule the plan keeps instead (4.7, and the plan
// test holds both halves):
//   - EVERY YARD IS ENCLOSED: wherever a yard (the earth the rows leave, planned
//     by caerdun_paving.ts) meets a street, a lane or a square, a low granite
//     wall (sg_low_wall, 1.1 m) stands on the yard's side of the line, with a
//     gate (sg_yard_gate, open, 2.3 m clear) in every run of 4.5 m or more; a
//     verge under 3 m deep (before a building's face) is not a yard and stays open;
//   - NO UNDRESSED OPEN LOT IS WIDER THAN 12 M: inside the walls, outside every
//     footprint, street and square, no 12 m square is free of building or
//     dressing. The dressing is the kitchen-garden plot (sg_yard_dress: raised
//     beds, a bean wigwam, a water butt, a log stack) and, one in four, a yard
//     well (sg_well), placed greedily at the centre of the largest open square
//     until none is wider than 10 m on a 1 m raster (12 m on the test's 0.5 m:
//     a raster square under-reads the true one by at most two cells).
// Nothing here is random: the order and the centres are the raster's.
import { Frame, F, r3, solids, inPoly, rectPoly, padPoly, type Solids, type P2, type Rect } from "./caerdun_frame.ts";
import type { Pave } from "./caerdun_paving.ts";

export interface YardsInput {
  paving: Pave[];
  /** every footprint already standing (houses, civic, walls, lean-tos, turrets) */
  polys: P2[][];
  /** the walled polygon (the curtain centrelines) */
  region: P2[];
  /** ground story spots the dressing keeps clear of (by `pad` m) */
  spots: P2[];
  /** the yard rule's numbers */
  rule: { wallOffset: number; gateMin: number; rasterTarget: number; spotPad: number; wellEvery: number; verge: number };
}
export interface YardWallRun { a: P2; b: P2; gate: boolean }
export interface Yards { solids: Solids; runs: YardWallRun[]; gardens: number; wells: number; walls: number; gates: number; rasterMax: number }

const PUBLIC = new Set(["street", "square", "lane", "passage"]);
const WALL_T = 0.5, WALL_H = 1.1, GATE_HALF = 1.15;
/** the plot and the well, as placed (yaw 0: the plot's long side along x) */
const PLOT: [number, number] = [6.0, 4.0], WELL: [number, number] = [2.2, 2.0];

/** a coarse bucket index over convex polygons by their bounding boxes */
function bucketIndex(polys: P2[][], C = 16) {
  const m = new Map<number, number[]>(), bbs = polys.map((p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]);
  bbs.forEach((b, i) => {
    for (let x = Math.floor(b[0] / C); x <= Math.floor(b[2] / C); x++) for (let z = Math.floor(b[1] / C); z <= Math.floor(b[3] / C); z++) {
      const k = x * 4096 + z;
      let l = m.get(k);
      if (!l) m.set(k, (l = []));
      l.push(i);
    }
  });
  return (x: number, z: number) => (m.get(Math.floor(x / C) * 4096 + Math.floor(z / C)) ?? []).some((i) => {
    const b = bbs[i];
    return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inPoly(x, z, polys[i]);
  });
}

export function planYards(I: YardsInput): Yards {
  const out = solids(), R = I.rule;
  const yards = I.paving.filter((p) => p.what === "yard" && p.rect).map((p) => p.rect as Rect);
  const isPublic = bucketIndex(I.paving.filter((p) => PUBLIC.has(p.what)).map((p) => p.poly));
  const isYard = bucketIndex(yards.map(rectPoly));
  const isSliver = bucketIndex(yards.filter(([a0, b0, a1, b1]) => Math.min(a1 - a0, b1 - b0) < WALL_T + 0.25).map(rectPoly));
  const isBuilt = bucketIndex(I.polys);

  // ── the walls: every yard edge a street, lane or square lies beyond ───────
  // sampled every 0.5 m: public when public paving lies within 2 m outside the
  // edge with no yard between (a yard trimmed against a diagonal lane leaves a
  // sliver of bare ground before the lane), and the wall's own strip, 0.25 m
  // in, is free of every footprint (a lean-to or turret already closes it)
  const runs: YardWallRun[] = [];
  const S = 0.5;
  for (const [x0, z0, x1, z1] of yards) {
    const edges: { p: (t: number) => P2; n: P2; len: number }[] = [
      { p: (t) => [x0 + t, z0], n: [0, -1], len: x1 - x0 },
      { p: (t) => [x0 + t, z1], n: [0, 1], len: x1 - x0 },
      { p: (t) => [x0, z0 + t], n: [-1, 0], len: z1 - z0 },
      { p: (t) => [x1, z0 + t], n: [1, 0], len: z1 - z0 },
    ];
    for (const e of edges) {
      // a sliver thinner than the wall (the fill's leftovers between a rect and a
      // street) holds none: the yard behind it walls its own edge, through it
      if ((e.n[0] !== 0 ? x1 - x0 : z1 - z0) < WALL_T + 0.25) continue;
      const n = Math.max(1, Math.round(e.len / S)), marks: boolean[] = [];
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * (e.len / n), [px, pz] = e.p(t);
        let pub = false;
        for (const d of [0.3, 1.0, 2.0]) {
          const qx = px + e.n[0] * d, qz = pz + e.n[1] * d;
          if (isPublic(qx, qz)) { pub = true; break; }
          if (isYard(qx, qz) && !isSliver(qx, qz)) break;
          if (isBuilt(qx, qz)) break;
        }
        const inner: P2 = [px - e.n[0] * R.wallOffset, pz - e.n[1] * R.wallOffset];
        // a VERGE is not a yard: a strip less than `verge` m deep between a street and
        // a building (the guild halls' fronts on the parade, the Crown Gate's town face
        // on the square) stays open to the street -- walling it shut a great door
        const deep = isYard(px - e.n[0] * R.verge, pz - e.n[1] * R.verge);
        marks.push(pub && deep && !isBuilt(inner[0], inner[1]) && !isBuilt(inner[0] - e.n[0] * 0.2, inner[1] - e.n[1] * 0.2));
      }
      // runs of marked samples, as wall lines on the yard's side
      let k = 0;
      while (k < n) {
        if (!marks[k]) { k++; continue; }
        let j = k;
        while (j + 1 < n && marks[j + 1]) j++;
        const ta = (k * e.len) / n, tb = ((j + 1) * e.len) / n;
        // (a run of one sample is a stub closing a sliver between a building and a lane)
        if (tb - ta >= 0.4) {
          const a = e.p(ta), b = e.p(tb);
          runs.push({ a: [r3(a[0] - e.n[0] * R.wallOffset), r3(a[1] - e.n[1] * R.wallOffset)], b: [r3(b[0] - e.n[0] * R.wallOffset), r3(b[1] - e.n[1] * R.wallOffset)], gate: false });
        }
        k = j + 1;
      }
    }
  }
  // two runs meeting at a yard's corner would share its 0.5 m square: the run
  // along z gives way to the one along x
  const alongX = runs.filter((r) => r.a[1] === r.b[1]);
  for (const r of runs.filter((q) => q.a[0] === q.b[0])) {
    for (const end of ["a", "b"] as const) {
      const p = r[end], other = end === "a" ? r.b : r.a, dir = Math.sign(other[1] - p[1]);
      if (alongX.some((q) => Math.abs(q.a[1] - p[1]) < WALL_T && Math.min(q.a[0], q.b[0]) - 0.01 <= p[0] + WALL_T / 2 && Math.max(q.a[0], q.b[0]) + 0.01 >= p[0] - WALL_T / 2))
        r[end] = [p[0], r3(p[1] + dir * WALL_T)];
    }
  }
  let walls = 0, gates = 0;
  const wallPolys: P2[][] = [];
  runs.forEach((run, i) => {
    const [ax, az] = run.a, [bx, bz] = run.b, L = Math.hypot(bx - ax, bz - az);
    if (L < 0.4) return;
    // the wall's front (+z) faces out of the yard: its line runs so the yard is on the right
    const yaw = Math.atan2(-(bz - az), bx - ax), fr = new Frame(out, `yard:${i}`, ax, az, yaw, F);
    const n = Math.max(1, Math.round(L / 4)), w = L / n, gateAt = L >= R.gateMin ? Math.floor(n / 2) : -1;
    run.gate = gateAt >= 0;
    // which side is the yard? sample a metre to the module's -z (local v -1)
    const [tx, tz] = fr.at(L / 2, -1.0), flip = !(isYard(tx, tz) || !isPublic(tx, tz)) ? Math.PI : 0;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) * w, file = k === gateAt ? "sg_yard_gate" : "sg_low_wall";
      fr.piece(file, u, 0, 0, flip, "yards", { axes: [r3(w / 4), 1, 1] });
      if (k === gateAt) {
        for (const s of [-1, 1]) fr.box(u + s * GATE_HALF * (w / 4), u + s * (w / 2), -WALL_T / 2, WALL_T / 2, WALL_H, undefined, "yard wall");
        gates++;
      } else {
        fr.box(u - w / 2, u + w / 2, -WALL_T / 2, WALL_T / 2, WALL_H, undefined, "yard wall");
        walls++;
      }
    }
    // (no glow occluder: a 1.1 m wall hides no lit window)
    wallPolys.push(fr.rectFoot(0, L, -WALL_T / 2, WALL_T / 2, "yardwall", `yard wall:${i}`));
  });

  // ── the dressing: the largest open square, until none is wider than the target
  const xs = I.region.map((p) => p[0]), zs = I.region.map((p) => p[1]);
  const X0 = Math.floor(Math.min(...xs)), Z0 = Math.floor(Math.min(...zs)), NX = Math.ceil(Math.max(...xs)) - X0, NZ = Math.ceil(Math.max(...zs)) - Z0;
  // the raster by shapes, not by cells: the walled polygon by scanlines, then every
  // footprint, public surface and wall closes the cells whose centres it holds
  // (each over its own bounding box: a cell asks no index)
  const open = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    const z = Z0 + j + 0.5, xs: number[] = [];
    for (let a = 0, b = I.region.length - 1; a < I.region.length; b = a++) {
      const [ax, az] = I.region[a], [bx, bz] = I.region[b];
      if ((az > z) !== (bz > z)) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2)
      for (let i = Math.max(0, Math.ceil(xs[q] - X0 - 0.5)); i <= Math.min(NX - 1, Math.floor(xs[q + 1] - X0 - 0.5)); i++) open[i * NZ + j] = 1;
  }
  const shut = (poly: P2[]) => {
    const x0 = Math.min(...poly.map((p) => p[0])), x1 = Math.max(...poly.map((p) => p[0])), z0 = Math.min(...poly.map((p) => p[1])), z1 = Math.max(...poly.map((p) => p[1]));
    for (let i = Math.max(0, Math.ceil(x0 - X0 - 0.5)); i <= Math.min(NX - 1, Math.floor(x1 - X0 - 0.5)); i++)
      for (let j = Math.max(0, Math.ceil(z0 - Z0 - 0.5)); j <= Math.min(NZ - 1, Math.floor(z1 - Z0 - 0.5)); j++)
        if (open[i * NZ + j] && inPoly(X0 + i + 0.5, Z0 + j + 0.5, poly)) open[i * NZ + j] = 0;
  };
  for (const p of I.polys) shut(p);
  for (const p of I.paving) if (PUBLIC.has(p.what)) shut(p.poly);
  // (a yard wall is 0.3 m thick, thinner than a cell: it holds no cell centre, so it
  // is shut half a metre wide -- with the denser dressing of fix round 1 a garden
  // stood on one)
  for (const p of wallPolys) shut(padPoly(p, 0.5));
  for (const [sx, sz] of I.spots) shut(rectPoly([sx - R.spotPad, sz - R.spotPad, sx + R.spotPad, sz + R.spotPad]));
  const D = new Int32Array(NX * NZ);
  const largest = (): { side: number; i: number; j: number } => {
    let best = 0, bi = 0, bj = 0;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const k = i * NZ + j;
      D[k] = open[k] ? (i && j ? Math.min(D[k - NZ], D[k - 1], D[k - NZ - 1]) + 1 : 1) : 0;
      if (D[k] > best) { best = D[k]; bi = i; bj = j; }
    }
    return { side: best, i: bi, j: bj };
  };
  let gardens = 0, wells = 0, sq = largest();
  const close = (x0: number, z0: number, x1: number, z1: number) => {
    for (let i = Math.max(0, Math.floor(x0 - X0)); i < Math.min(NX, Math.ceil(x1 - X0)); i++)
      for (let j = Math.max(0, Math.floor(z0 - Z0)); j < Math.min(NZ, Math.ceil(z1 - Z0)); j++) open[i * NZ + j] = 0;
  };
  for (let guard = 0; sq.side > R.rasterTarget && guard < 400; guard++) {
    // the square's centre (D is its bottom-right corner, in cells)
    const cx = X0 + sq.i + 1 - sq.side / 2, cz = Z0 + sq.j + 1 - sq.side / 2;
    const k = gardens + wells, well = (k + 1) % R.wellEvery === 0, turn = (Math.round(cx) + Math.round(cz)) % 2 !== 0;
    const [w, d] = well ? WELL : PLOT, [hx, hz] = turn ? [d / 2, w / 2] : [w / 2, d / 2];
    const fr = new Frame(out, well ? `well:${wells}` : `garden:${gardens}`, r3(cx), r3(cz), turn ? Math.PI / 2 : 0, F);
    // near only, in 48 m culling cells of their own (a cell is at most 48 m)
    fr.piece(well ? "sg_well" : "sg_yard_dress", 0, 0, 0, 0, `yards:${Math.floor(cx / 48)},${Math.floor(cz / 48)}`, { near: true });
    fr.box(-w / 2, w / 2, -d / 2, d / 2, well ? 2.9 : 2.2, undefined, well ? "well" : "garden");
    fr.rectFoot(-w / 2, w / 2, -d / 2, d / 2, "yard dress", well ? `well:${wells}` : `garden:${gardens}`);
    // its footprint and a 0.5 m walk round it are no longer open
    close(cx - hx - 0.5, cz - hz - 0.5, cx + hx + 0.5, cz + hz + 0.5);
    if (well) wells++; else gardens++;
    sq = largest();
  }
  return { solids: out, runs, gardens, wells, walls, gates, rasterMax: sq.side };
}
