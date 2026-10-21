// THE CAUSEWAY IN THE CLOISTERS' STONE (MM-15, Philip 2026-10-07: "rebuild BOTH causeway ends and
// the gate in the Cloisters style", in original modules; MOONMERE.md A-14). One road across the Mere
// (ruling 13), so ONE planner draws it at both of its ends -- Moonmere's (the Landing) and the Shores'
// (the strand) -- in the library's own modules: cw_bay (8 m of deck on one broad arch, its parapets
// banded and coped, cutwaters on its piers), cw_head (the banded lantern pylons where the road meets
// the land), cw_steps (the Shores' three steps down to the strand), lamp_post along the deck and, on
// the Shores, the Landing's own Causeway Gate (cg_shell) where the kit gatehouse stood: the road
// passes the same gate at both ends.
//
// WHAT IT DOES NOT CHANGE: the walk. scene.ts makeCauseway still lays the deck's flat zone (x +-4.5 at
// 0.8), the parapets' colliders (4.4..4.8), the barrier past the portal and the landward ramp, as it
// always has, with `draw: false` -- only the town kit's stones, masonry, parapet blocks, torches and
// gatehouse are gone. MM-3: the portal (8, 300), the spawn (8, 288) and the crate (5.4, 268) do not
// move. No Babylon: the node tests (test/moonmere_causeway.test.mjs) read exactly this.
import { localToWorld, type Box, type Piece } from "./moonmere_types.ts";
import { MM } from "./moonmere_kit.ts";

/** cw_bay's length (the module's z -4..4) */
export const CW_BAY = 8;
/** the pylons' footprint in cw_head's frame (the builder's x +-(4.25..5.45), z 0.1..1.3) and top */
export const CW_PYLON = { x0: 4.25, x1: 5.45, z0: 0.1, z1: 1.3, top: 4.3 };
/** the pylons' colliders reach this far off the centre line (the ramp's 5.2 + a walker's 0.45) */
const PYLON_OUT = 5.7;
/** lamp_post along the deck: one every LAMP_EVERY m, alternating sides, LAMP_X off the centre line
 * (its plinth's 0.2 m clear of the parapet's inner face at 4.4) */
export const LAMP_EVERY = 16, LAMP_X = 4.05;
/** makeCauseway's flush landward ramp (`landY`): 2.1 m long; its cheeks stand from RAMP_CHEEK off the line */
const RAMP_RUN = 2.1, RAMP_CHEEK = 4.95;
/** cg_shell's footprint, passage half-width and the head's foot over its floor (moonmere_civic.ts's
 * causewayGate: 14 x 6, 3.0, the gate datum's 4.4 + 0.6) */
export const GATE = { w: 14, d: 6, half: 3.0, head: (MM.gate as number[])[1] + 0.6, top: 10 };

export interface CausewaySpec { x: number; zLand: number; zSea: number; deck: number }
/** the sea's level at both ends (Moonmere's waterline; the Shores' deck stands the same 2.05 m over it) */
export const CW_SEA = -1.25;
/** cw_bay's arch: its half-span (the builder's CW span) */
const ARCH_HALF = 2.7;
/** MOONMERE'S LAND END (S4 review): the spit's DRAWN ground (the ocean's carve, not the plan's, which
 * stops at the coast) stands over the sea to z 263.6 under the first bay's arch and falls to -2.06 by
 * the second's springing at 272.7 (MEASURED, S4-fix probe_ground.mjs): one solid bay. The Shores count
 * theirs off their own drawn strand (solidBays); the browser QA checks both */
export const MM_SOLID_BAYS = 1;

/**
 * How many bays from the land end must be solid (cw_abut): while the drawn ground anywhere under a
 * bay's arch opening (x +-5 off the line, the opening's span) stands over the sea, its arch would dive
 * into the sand (S4 review: "the arch opening dives into the strand with a dark void, and the
 * voussoirs are cut off by the sand"). Under the water the arch's foot is the sea's to hide.
 */
export function solidBays(c: CausewaySpec, ground: (x: number, z: number) => number, sea = CW_SEA): number {
  const dir = Math.sign(c.zSea - c.zLand) || 1, len = Math.abs(c.zSea - c.zLand);
  const n = Math.max(1, Math.round(len / CW_BAY)), bay = len / n, half = ARCH_HALF * bay / CW_BAY;
  let k = 0;
  for (; k < n - 1; k++) {
    const zc = c.zLand + dir * bay * (k + 0.5);
    let top = -Infinity;
    for (let t = -half; t <= half + 1e-6; t += half / 4) for (const dx of [-5, 0, 5]) top = Math.max(top, ground(c.x + dx, zc + t));
    if (top <= sea) break;
  }
  return k;
}
export interface CausewayPlan {
  pieces: Piece[];
  boxes: Box[];
  /** where a lamp burns (its lantern): the Shores' gate keeps its four point lights there */
  lights: [number, number, number][];
}

/**
 * The causeway's drawn stone from `zLand` out to `zSea` along x = c.x, at its deck c.deck (world):
 * bays of 8 m (stretched to fit the length exactly), the land end's pylons, the lamps; with `steps`,
 * the Shores' three steps down off the deck's land end. Every piece in `cw:<n>` cells of six bays
 * (48 m, D-3); pieces carry world coordinates.
 */
export function planCauseway(c: CausewaySpec, opts: { steps?: boolean; ramp?: boolean; solid?: number; seaEnd?: boolean } = {}): CausewayPlan {
  const dir = Math.sign(c.zSea - c.zLand) || 1, len = Math.abs(c.zSea - c.zLand);
  const n = Math.max(1, Math.round(len / CW_BAY)), bay = len / n, stretch = +(bay / CW_BAY).toFixed(4);
  const out: CausewayPlan = { pieces: [], boxes: [], lights: [] };
  const cell = (z: number) => `cw:${Math.floor(Math.abs(z - c.zLand) / (6 * CW_BAY))}`;
  // the bays: each one's cutwaters on its SEAWARD pier (cw_bay's local -z end), so the first pier,
  // on the land, carries none
  // (S4 review) the first `solid` bays from the land are cw_abut, their closed end on the land, and
  // with `seaEnd` the last one too, its closed end on the sea: the run ends on a whole pier-head, never
  // a cut section and a hanging cutwater in open water
  const solid = Math.min(opts.solid ?? 0, n - 1);
  for (let k = 0; k < n; k++) {
    const z = c.zLand + dir * bay * (k + 0.5);
    const land = k < solid, end = !!opts.seaEnd && k === n - 1 && n > solid + 1;
    out.pieces.push({ file: land || end ? "cw_abut" : "cw_bay", cell: cell(z), x: c.x, y: c.deck, z,
      // (cw_bay's cutwater and cw_abut's closed end are both its local -z: to the sea, or to the land)
      yaw: (dir > 0) !== land ? Math.PI : 0,
      ...(stretch !== 1 ? { axes: [1, 1, stretch] as [number, number, number] } : {}), reach: 7 });
  }
  // the land end: its pylons, facing the land (cw_head's +z onto the causeway)
  const yawEnd = dir > 0 ? 0 : Math.PI;
  out.pieces.push({ file: "cw_head", cell: cell(c.zLand), x: c.x, y: c.deck, z: c.zLand, yaw: yawEnd, reach: 7, height: 5 });
  // (their colliders run out to PYLON_OUT: makeCauseway's landward ramp is 5.2 m a side, wider than
  // the deck, and the S1-S3 floods stepped off its corners beside the deck's end into the sea, 1.7 m
  // -- MM-15's six falls, at x 8 +-5.5, z 262.25. A walker's 0.45 m body against the pylon's face
  // closes them)
  for (const s of [-1, 1]) {
    const [x, z] = localToWorld(c.x, c.zLand, yawEnd, s * (CW_PYLON.x0 + PYLON_OUT) / 2, (CW_PYLON.z0 + CW_PYLON.z1) / 2);
    out.boxes.push({ cx: x, cz: z, hx: (PYLON_OUT - CW_PYLON.x0) / 2, hz: (CW_PYLON.z1 - CW_PYLON.z0) / 2, yaw: yawEnd, y0: c.deck - 1, y1: c.deck + CW_PYLON.top, what: "causeway pylon", cell: cell(c.zLand) });
  }
  if (opts.ramp) {
    // MOONMERE'S FLUSH END (landY): makeCauseway's ramp down to the Landing is 5.2 m a side, wider
    // than the deck, and its sides stood up to 0.74 m over the spit's ground beside it (S4's walk,
    // MEASURED at x 8 - 5.25, z 261) -- a ledge with nothing drawn. A cheek either side carries the
    // parapet's line from the pylons down to the Landing (cheek_landing: its coping 0.9 over the
    // ramp, its flank to the ground), solid
    const z0 = c.zLand - dir * RAMP_RUN;
    for (const s of [-1, 1]) {
      const xo = s > 0 ? c.x + RAMP_CHEEK : c.x - RAMP_CHEEK - 0.4;
      out.pieces.push({ file: "cheek_landing", near: true, cell: cell(c.zLand), x: xo, y: c.deck + 0.1, z: Math.min(z0, c.zLand), yaw: 0,
        axes: [1, 1, +(RAMP_RUN / 2).toFixed(4)], reach: 4 });
      out.boxes.push({ cx: c.x + s * (RAMP_CHEEK + 0.2), cz: (z0 + c.zLand) / 2, hx: 0.2, hz: RAMP_RUN / 2, yaw: 0, y0: c.deck - 1, y1: c.deck + 1.1, what: "causeway ramp cheek", cell: cell(c.zLand) });
    }
  }
  if (opts.steps) {
    // the steps: a flight_seg climbs +z from its foot to (2.08, +1.0), 5 m wide; two side by side,
    // stretched to the deck's 9.9 m, from the strand (deck - 1) up to the deck's end, between cheeks
    const foot = c.zLand - dir * 2.08, yawUp = dir > 0 ? 0 : Math.PI, sx = +(9.9 / 10).toFixed(4);
    for (const s of [-1, 1]) {
      const [x, z] = localToWorld(c.x, foot, yawUp, s * 2.5 * sx, 0);
      out.pieces.push({ file: "flight_seg", lods: ["flight_seg", "flight_seg_l1", "flight_seg_l1"], cell: cell(c.zLand), x, y: c.deck - 1, z, yaw: yawUp, axes: [sx, 1, 1], reach: 4 });
      // cheek_wall: x 0..0.4 outward from the flight's edge (its frame turned with the flight)
      const [cx, cz] = localToWorld(c.x, foot, yawUp, s > 0 ? 4.95 : -5.35, 0);
      out.pieces.push({ file: "cheek_wall", near: true, cell: cell(c.zLand), x: cx, y: c.deck - 1, z: cz, yaw: yawUp, reach: 4 });
      // (S4 review: the cheeks were drawn and not solid -- makeCauseway's ramp is 5.2 m a side, so a
      // walker climbed its outer 0.25 m inside the drawn stone up to the parapet. The ramp's own
      // cheek box, as Moonmere's end has: x 4.95..5.35 off the line, from the steps' foot to the deck)
      out.boxes.push({ cx: c.x + s * (RAMP_CHEEK + 0.2), cz: (foot + c.zLand) / 2, hx: 0.2, hz: Math.abs(c.zLand - foot) / 2, yaw: 0, y0: c.deck - 1, y1: c.deck + 1, what: "causeway steps cheek", cell: cell(c.zLand) });
    }
  }
  // the lamps along the deck, alternating sides, from 10 m off the land to the last full bay
  let side = -1;
  for (let d = 10; d < len - 4; d += LAMP_EVERY) {
    const z = c.zLand + dir * d, x = c.x + side * LAMP_X;
    out.pieces.push({ file: "lamp_post", near: true, cell: cell(z), x, y: c.deck, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, reach: 3 });
    out.boxes.push({ cx: x, cz: z, hx: 0.2, hz: 0.2, yaw: 0, y0: c.deck - 0.5, y1: c.deck + 3.2, what: "causeway lamp", cell: cell(z) });
    out.lights.push([x, c.deck + 3.3, z]);
    side = -side;
  }
  return out;
}

/**
 * The Shores' gate (MM-15): cg_shell standing over the road at (x, z) on its ground `y`, its passage
 * along the road (yaw 0: the causeway runs along z), with a lamp at each of its four lamp mounts
 * (`mounts`: the layout's copy of the module's, cg_shell's (+-3.0, 3.9, +-3.0)) and its colliders
 * as the Landing's gate has them (moonmere_civic.ts: two piers either side of the 6 m passage and the
 * head over it). The lamps are the Shores' four lit lamps (the kit gatehouse's torches' point lights).
 */
export function planShoresGate(x: number, z: number, y: number, mounts: { kind: string; x: number; y: number; z: number; yaw: number }[]): CausewayPlan {
  const out: CausewayPlan = { pieces: [], boxes: [], lights: [] };
  out.pieces.push({ file: "cg_shell", cell: "cw:gate", x, y, z, yaw: 0, reach: Math.hypot(GATE.w, GATE.d) / 2 + 2 });
  for (const m of mounts) {
    if (m.kind !== "lamp") continue;
    out.pieces.push({ file: "lamp_bracket", near: true, cell: "cw:gate", x: x + m.x, y: y + m.y, z: z + m.z, yaw: m.yaw, reach: 3 });
    // the lantern hangs about 0.5 m out from its bracket's mount and 0.3 m under it
    out.lights.push([x + m.x, y + m.y + 0.2, z + m.z + Math.sign(m.z) * 0.5]);
  }
  for (const [u0, u1] of [[-GATE.w / 2, -GATE.half], [GATE.half, GATE.w / 2]]) {
    out.boxes.push({ cx: x + (u0 + u1) / 2, cz: z, hx: (u1 - u0) / 2, hz: GATE.d / 2, yaw: 0, y0: y - 1, y1: y + GATE.top, what: "gate pier causewayGate (the Shores)", cell: "cw:gate" });
  }
  out.boxes.push({ cx: x, cz: z, hx: GATE.half, hz: GATE.d / 2, yaw: 0, y0: y + GATE.head, y1: y + GATE.top, what: "gate head causewayGate (the Shores)", cell: "cw:gate" });
  return out;
}
