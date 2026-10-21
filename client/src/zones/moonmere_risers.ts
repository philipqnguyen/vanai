// THE BARE RISERS, DRAWN AS THEY ARE WALKED (A-7; the look review's "raw lawn
// embankments 5-8 m tall flank the Crown's two central climbs ... stretched
// grey cliff-rock strips with jagged bottoms"). The plan's risers are exact:
// 7.2 m up over a 2.4 m run, bare basalt (ruling 2) faced by riser_rock. But the
// terrain MESH is a 2.33 m grid (700 m over 300 cells), so it smears each riser
// over a cell either side, and the smear BULGES in front of the rock: a 45-60
// degree bank whose averaged normals took the lawn, which buried riser_rock's
// lower half and left only its top showing as a ragged grey strip. MEASURED,
// the plan's ground at the Mere Stair crossing is 7.2 to z 134 and 14.4 from
// 137.6; the drawn bank started 12 m short of it.
//
// The walk is the plan's (heightFn, exact); only the DRAWN ground changes here:
//   * every mesh vertex in a bare riser's run, or one cell behind its top, is
//     dropped to the riser's foot, so nothing of the mesh stands in front of
//     the rock face (riser_rock leans back over exactly the plan's run);
//   * the trough that leaves behind the rock's top is lidded by a SKIN, a strip
//     of the same ground material at the upper level from the rock's top back
//     past the mesh's own climb -- under the parapet and any paving, which
//     follow the exact ground.
// One merged mesh, one draw (the ground's material, not a caster). The outer
// coast's risers stay terrain (D-16).
import { Mesh, VertexBuffer, VertexData, type StandardMaterial } from "@babylonjs/core";
import { scene, terrainSampleGrid } from "../scene";
import type { MoonmerePlan } from "./moonmere_plan";
import { landingRock } from "./moonmere_terrain";

/** the plan's riser run, and how far behind its top the mesh is held down (one cell and a margin) */
const RUN = 2.4, BEHIND = 2.6;
/** the skin: from this far in front of the run's top, to this far behind it */
const SKIN_FRONT = 0.3, SKIN_BACK = 5.2;

export function dressRisers(P: MoonmerePlan, size: number, sub: number, tile: number, tint: [number, number, number]): { lowered: number; skinQuads: number; ms: number } {
  const t0 = performance.now();
  const ground = scene.getMeshByName("ground") as Mesh | null;
  if (!ground) return { lowered: 0, skinQuads: 0, ms: 0 };
  const T = P.T;
  const pos = ground.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return { lowered: 0, skinQuads: 0, ms: 0 };
  const step = size / sub;
  const vIdx = (i: number, j: number) => i * (sub + 1) + j;
  const skin = { p: [] as number[], n: [] as number[], uv: [] as number[], c: [] as number[], i: [] as number[] };
  let lowered = 0, quads = 0;
  // (A-13: and the coast's C2 along the Landing's terrace, faced as a city riser -- landingRock)
  for (const r of [...T.risers(), ...landingRock(T)]) {
    if (!r.bare || r.outer) continue;
    for (let k = 1; k < r.pts.length; k++) {
      const [ax, az] = r.pts[k - 1], [bx, bz] = r.pts[k];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // the high side: the normal pointing up the riser
      let nx = -uz, nz = ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const hp = T.ground(mx + nx * 2.5, mz + nz * 2.5) ?? r.y0, hm = T.ground(mx - nx * 2.5, mz - nz * 2.5) ?? r.y0;
      if (hp < hm) { nx = -nx; nz = -nz; }
      // (the samples are the run's middle; a segment is the span between two of them, half a metre each side)
      const ext = 0.5;
      // ── the mesh held down in the run and one cell behind it
      const s0 = -RUN / 2, s1 = RUN / 2 + BEHIND;
      const xs = [ax, bx].flatMap((x) => [x + nx * s0, x + nx * s1]), zs = [az, bz].flatMap((z) => [z + nz * s0, z + nz * s1]);
      const j0 = Math.max(0, Math.floor((Math.min(...xs) - ext + size / 2) / step)), j1 = Math.min(sub, Math.ceil((Math.max(...xs) + ext + size / 2) / step));
      const i0 = Math.max(0, Math.floor((Math.min(...zs) - ext + size / 2) / step)), i1 = Math.min(sub, Math.ceil((Math.max(...zs) + ext + size / 2) / step));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const v = vIdx(i, j), x = pos[v * 3], z = pos[v * 3 + 2], y = pos[v * 3 + 1];
        const dx = x - ax, dz = z - az;
        const along = dx * ux + dz * uz, across = dx * nx + dz * nz;
        // (S1 review: not past the riser's own two ends -- where a bare riser meets a building-
        // backed one, a vertex half a metre past its end is the next riser's, at the upper level;
        // dropped, it opened a pit beside tower_N2 that the skin did not lid, and the court's setts
        // ran down into it over the tower's window, LOOKED)
        const lo = k === 1 ? 0 : -ext, hi = k === r.pts.length - 1 ? len : len + ext;
        if (along < lo || along > hi || across < s0 || across > s1) continue;
        if (y <= r.y0 + 0.05 || y > r.y1 + 0.05) continue;
        pos[v * 3 + 1] = r.y0 - 0.15;
        lowered++;
      }
      // ── the skin over the trough behind the rock's top
      const f = RUN / 2 - SKIN_FRONT, b = RUN / 2 + SKIN_BACK;
      const base = skin.p.length / 3;
      // (S1 review: at the riser's two ends the lid runs on a cell and a hand -- an oblique end
      // segment lowers vertices behind its top that lie past its end across the riser's run, and
      // the trough they left beside tower_N2 showed as a pit the court's setts ran down into)
      const ea = k === 1 ? step + 0.2 : ext, eb = k === r.pts.length - 1 ? step + 0.2 : ext;
      const corners: [number, number][] = [
        [ax - ux * ea + nx * f, az - uz * ea + nz * f], [bx + ux * eb + nx * f, bz + uz * eb + nz * f],
        [bx + ux * eb + nx * b, bz + uz * eb + nz * b], [ax - ux * ea + nx * b, az - uz * ea + nz * b],
      ];
      for (const [x, z] of corners) {
        skin.p.push(x, r.y1 + 0.012, z);
        skin.n.push(0, 1, 0);
        skin.uv.push(x / tile, z / tile);
        skin.c.push(tint[0], tint[1], tint[2], 1);
      }
      // wound so its face is up (a box face seen from above)
      const cross = (corners[1][0] - corners[0][0]) * (corners[3][1] - corners[0][1]) - (corners[1][1] - corners[0][1]) * (corners[3][0] - corners[0][0]);
      if (cross > 0) skin.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else skin.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      quads++;
    }
  }
  if (lowered) {
    // (set, not update: the terrain's buffers were made static)
    ground.setVerticesData(VertexBuffer.PositionKind, pos, false);
    const idx = ground.getIndices();
    if (idx) {
      const normals = new Float32Array(pos.length);
      VertexData.ComputeNormals(pos, idx, normals);
      ground.setVerticesData(VertexBuffer.NormalKind, normals, false);
    }
    ground.refreshBoundingInfo();
  }
  if (quads) {
    const m = new Mesh("mm_riser_skin", scene);
    const vd = new VertexData();
    vd.positions = skin.p; vd.normals = skin.n; vd.uvs = skin.uv; vd.colors = skin.c; vd.indices = skin.i;
    vd.applyToMesh(m);
    m.material = ground.material as StandardMaterial;
    m.hasVertexAlpha = false;
    m.receiveShadows = true;
    m.isPickable = false;
  }
  return { lowered, skinQuads: quads, ms: Math.round(performance.now() - t0) };
}

/** A region of the drawn ground held down under masonry (S1, MM-13): every mesh vertex in
 * the oriented box whose height is over `y(x, z)` is set to it, in the mesh AND in the
 * terrain's sample model (scene.ts terrainSampleGrid), so the paving laid after it rides the
 * plan's exact ground rather than the mesh's smear. */
export interface Hold { x0: number; x1: number; z0: number; z1: number; y: (x: number, z: number) => number }
/**
 * THE MESH HELD DOWN UNDER MASONRY (S1; MM-13). The terrain mesh is a 2.33 m grid, so where
 * a stair well or a terrace is cut 3.6 m into a level, the triangles spanning its walls smear
 * the upper ground INTO it: the terrace's paving rode the smear up into its corners as pale
 * stone ramps, and lawn mounds stood inside its walls (LOOKED, the head and the terrace's
 * corners). The walk is the plan's (heightFn, exact); only what is DRAWN changes: inside the
 * hold and one cell beyond its walls the mesh is never higher than the floor, and what that
 * leaves behind a wall is under the paving laid next (which follows the plan's ground where
 * the drawn ground is lower). Call BEFORE the paving.
 */
export function holdDown(holds: Hold[], size: number, sub: number): number {
  const ground = scene.getMeshByName("ground") as Mesh | null;
  const grid = terrainSampleGrid();
  if (!ground || !grid || !holds.length) return 0;
  const pos = ground.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return 0;
  const step = size / sub;
  let n = 0;
  for (const h of holds) {
    const j0 = Math.max(0, Math.floor((h.x0 + size / 2) / step)), j1 = Math.min(sub, Math.ceil((h.x1 + size / 2) / step));
    const i0 = Math.max(0, Math.floor((h.z0 + size / 2) / step)), i1 = Math.min(sub, Math.ceil((h.z1 + size / 2) / step));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = -size / 2 + j * step, z = -size / 2 + i * step;
      if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue;
      const v = i * (sub + 1) + j, y = h.y(x, z);
      if (pos[v * 3 + 1] <= y) continue;
      pos[v * 3 + 1] = y;
      grid.h[v] = y;
      n++;
    }
  }
  if (n) {
    ground.setVerticesData(VertexBuffer.PositionKind, pos, false);
    const idx = ground.getIndices();
    if (idx) {
      const normals = new Float32Array(pos.length);
      VertexData.ComputeNormals(pos, idx, normals);
      ground.setVerticesData(VertexBuffer.NormalKind, normals, false);
    }
    ground.refreshBoundingInfo();
  }
  return n;
}

/**
 * S1 REVIEW: A TOWER BACKED INTO A RISER. A study tower stands at its level against the riser
 * behind it, the plan's ground ramping up through its footprint to the level above; the 2.33 m
 * mesh carries that ramp a cell OUT of the tower's back face, so the upper level's setts sloped
 * down into the wall and half buried a window (LOOKED, tower_N2's north face from the Registry's
 * side, the review's v15). A tower has no room at its foot (its shell is closed; no interior,
 * no deck), so every mesh vertex inside its footprint whose plan ground is on that ramp is lifted
 * to the level the ramp climbs to: the cliff is inside the tower, the level outside stays level.
 * The walk is the plan's (heightFn); call BEFORE the paving.
 */
export function liftTowers(P: MoonmerePlan, size: number, sub: number): number {
  const ground = scene.getMeshByName("ground") as Mesh | null;
  const grid = terrainSampleGrid();
  if (!ground || !grid) return 0;
  const pos = ground.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return 0;
  const step = size / sub, levels = Object.values(P.L.terrain.levels).filter((v) => v > 0).sort((a, b) => a - b);
  const interiors = new Set(P.B.interiors.map((i) => i.house));
  let n = 0;
  for (const f of P.B.footprints) {
    if (f.kind !== "tower" || !f.body || interiors.has(f.id)) continue;
    const b = f.body, r = Math.hypot(b.hx, b.hz);
    const j0 = Math.max(0, Math.floor((b.cx - r + size / 2) / step)), j1 = Math.min(sub, Math.ceil((b.cx + r + size / 2) / step));
    const i0 = Math.max(0, Math.floor((b.cz - r + size / 2) / step)), i1 = Math.min(sub, Math.ceil((b.cz + r + size / 2) / step));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = -size / 2 + j * step, z = -size / 2 + i * step;
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.cx, dz = z - b.cz;
      if (Math.abs(dx * c - dz * s) > b.hx - 0.3 || Math.abs(dx * s + dz * c) > b.hz - 0.3) continue;
      const g = P.T.ground(x, z);
      if (g === null || g < f.level + 0.5) continue;
      const top = levels.find((l) => l >= g - 0.01) ?? g;
      const v = i * (sub + 1) + j;
      if (pos[v * 3 + 1] >= top) continue;
      pos[v * 3 + 1] = top;
      grid.h[v] = top;
      n++;
    }
  }
  if (n) {
    ground.setVerticesData(VertexBuffer.PositionKind, pos, false);
    const idx = ground.getIndices();
    if (idx) {
      const normals = new Float32Array(pos.length);
      VertexData.ComputeNormals(pos, idx, normals);
      ground.setVerticesData(VertexBuffer.NormalKind, normals, false);
    }
    ground.refreshBoundingInfo();
  }
  return n;
}
