// The capital walls' plan on paper: where the bastions, the gate and the
// curtain's outward faces go for a survey polygon. No Babylon here, so the
// node tests import it as is (test/capital_layout.test.mjs holds wallPlan and
// WALL_COLS/WALL_MID to capital-layout.json's walls). Both the Capital
// (zones/capital_walls.ts) and, since M3, the Burned Land's view of it
// (zones/capital_view.ts, the same octagon at the view's scale) build on
// wallPlan; their walls are the Colonnade's -- a 15 m walk and a triumphal arch.
// BASTION and GATE below are the old kit gatehouse's and drums' sizes, kept as
// wallPlan's clearance check (the gate never within a gatehouse's reach of a
// vertex) and the gatehouse room the plan's tests still read.

// the rampart's three columns of blocks, outside the survey line
export const WALL_COLS: [number, number, number] = [5.2, 3.0, 0.6];
export const WALL_MID = (WALL_COLS[0] + WALL_COLS[2]) / 2;   // the curtain's centre line
export const BASTION = { r: 9.0, storeys: 6 };
// the old kit gatehouse: a 14 m room, drums of r 5 on the curtain's centre line
// (drumZ -WALL_MID, the wall's outside being local -z)
export const GATE = { modules: 7, towerR: 5.0, storeys: 5, passage: 2, drumZ: -WALL_MID };

export interface WallPlan {
  normals: [number, number][];      // edge i (V[i] -> V[i+1]) faces this way
  gate: { x: number; z: number; yaw: number; edge: number };
  bastions: [number, number][];     // one per vertex, same order
}

// The `+ 0`s turn the -0 a negated axis-aligned component makes back into +0
// (a yaw of -0 rotates nothing but changes an instance matrix's bits): until M3
// the Burned Land's square was fingerprinted on that, and the gate's yaw is
// still held to +0 (test/capital_layout.test.mjs).
export function wallPlan(V: [number, number][]): WallPlan {
  const N = V.length;
  // each edge's outward normal: the left-hand perpendicular, flipped if it
  // points at the middle (a convex polygon's edges all face away from it)
  let ox = 0, oz = 0;
  for (const [x, z] of V) { ox += x / N; oz += z / N; }
  const normals = V.map(([ax, az], i): [number, number] => {
    const [bx, bz] = V[(i + 1) % N];
    const L = Math.hypot(bx - ax, bz - az);
    let nx = -(bz - az) / L + 0, nz = (bx - ax) / L + 0;
    if (nx * ((ax + bx) / 2 - ox) + nz * ((az + bz) / 2 - oz) < 0) { nx = -nx + 0; nz = -nz + 0; }
    return [nx, nz];
  });
  // the gate: on the southernmost edge that crosses x = 0, its road square
  // to that edge (local +z inward)
  let gx = 0, gz = Infinity, edge = -1;
  for (let i = 0; i < N; i++) {
    const [ax, az] = V[i], [bx, bz] = V[(i + 1) % N];
    if (ax === bx || Math.min(ax, bx) > 0 || Math.max(ax, bx) < 0) continue;
    const z = az + (bz - az) * ((0 - ax) / (bx - ax));
    if (z < gz) { gz = z; edge = i; }
  }
  if (edge < 0) throw new Error("capital walls: no edge crosses x = 0, so there is nowhere for the gate");
  // the gatehouse needs its room and both drums clear of the bastion: on or
  // near a vertex it would stand inside one
  const reach = BASTION.r + GATE.modules + GATE.towerR * 2;
  for (const [vx, vz] of V) {
    if (Math.hypot(vx - gx, vz - gz) < reach) throw new Error(`capital walls: the gate at (${gx}, ${gz}) is within ${reach} m of the vertex (${vx}, ${vz})`);
  }
  const gn = normals[edge];
  const yaw = Math.atan2(-gn[0], -gn[1]) + 0;
  // the bastions: where the two curtain centre lines cross, WALL_MID out
  // along the bisector by 1/cos(half the turn) (on the square, WALL_MID out
  // on both axes)
  const bastions = V.map(([sx, sz], i): [number, number] => {
    const [ax, az] = normals[(i + N - 1) % N], [bx, bz] = normals[i];
    const k = WALL_MID / (1 + (ax * bx + az * bz));
    return [sx + (ax + bx) * k, sz + (az + bz) * k];
  });
  return { normals, gate: { x: gx, z: gz, yaw, edge }, bastions };
}

// The gatehouse's room in the gate's own frame (the same rotation as the
// retired kit gatehouse builder's local frame, which these sizes were derived
// from): the curtain skips it, and the drums, as anchors,
// block the rest. 7.5 across the road, 8 along it either side of the line.
export function inGateRoom(plan: WallPlan, x: number, z: number): boolean {
  const c = Math.cos(plan.gate.yaw), s = Math.sin(plan.gate.yaw);
  const dx = x - plan.gate.x, dz = z - plan.gate.z;
  return Math.abs(dx * c - dz * s) < 7.5 && Math.abs(dx * s + dz * c) < 8;
}

// THE MOUND AND THE GATE'S PAD the Burned Land stands its view of the city on
// (burnedland.ts's height applies both; zones/capitalwalls.ts re-exports the
// mound for it). Here, Babylon-free, so test/capital_view.test.mjs stands the
// view's walls on the field's own deterministic ground and not on a hand copy
// that could drift from it (the M3 review) -- only the field's noise and the
// road's dip are the test's to bound.
export const CAP_HALF = 100;                 // half a side of the field's square margins, as the Burned Land sees it
export const CAP_GATE: [number, number] = [0, -CAP_HALF];
/** the level the gate stands on: the mound's height at its foot */
export const GATE_PAD = 6.0;
const smooth = (t: number) => t * t * (3 - 2 * t);
// the mound the city stands on, for a zone's height function
export function capitalMound(x: number, z: number, y: number, top: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const t = Math.max(0, Math.min(1, (CAP_HALF + 30 - d) / 40));
  const s = t * t * (3 - 2 * t);
  return y * (1 - s) + top * s;
}
// the level pad under the gate, blended out from 14 m to 26 m off it (burnedland.ts
// applies it after its road cut, which otherwise halved the ground under the gate)
export function gatePad(x: number, z: number, y: number): number {
  const gd = Math.hypot(x - CAP_GATE[0], z - CAP_GATE[1]);
  const gt = smooth(Math.max(0, Math.min(1, (26 - gd) / 12)));
  return y * (1 - gt) + GATE_PAD * gt;
}
