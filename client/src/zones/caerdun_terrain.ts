// Caerdun's ground on paper (CAERDUN-CONTRACT.md 4.2): the levels the zone's height
// function returns, and a node emulation of the 4.667 m terrain mesh drawn from
// them, so the test can prove the drawn ground stays under every face built on
// it. No Babylon here.
//
// THE LEVELS, in priority order (ditch > wild > plateau > strip):
//   - the rock-cut ditch (CF-2): its floor at F - 8, its faces each over exactly
//     one terrain cell (x 93.333 -> 98 and 107.333 -> 112, z -130.667 -> -126 at
//     the south end), so the drawn faces and the true ones are the same planes;
//   - the wild beyond the glacis and the south glacis: F plus the field's own
//     rise, ramped in over 20 m (pines and rock, the zone glue's);
//   - the plateau at F inside the plateau edge (the walled city, the lists, the
//     glacis and the south glacis);
//   - the strip at 0.5 (the quay apron at 0.95); the zone glue keeps today's sea
//     and strand carves on top.
//
// THE GRID RULE (CITY-BUILD.md "Traps"): every axis-aligned level change starts
// and ends on a terrain grid line (x, z = -350 + 4.6667k), or the drawn ground
// pokes through the stone. The new zone module does not join fineTerrainZones,
// so the mesh is 150 cells over the zone's 700 m. The sea step is diagonal and
// cannot sit on grid lines: there the scarp's face stands 4.5 m outboard of the
// plateau edge and its 5 m apron covers the band between (caerdun_walls.ts).
import { SG } from "./caerdun_kit.ts";
import { polyTester, type P2 } from "./caerdun_frame.ts";

export interface TerrainPlan {
  ditch: { lipIn: number; floor0: number; floor1: number; lipOut: number; zSouthFace: number; zSouthFloor: number; zNorthFloor: number; floorY: number };
  /** the wild: east of x or south of z, ramped in over `ramp` m */
  wild: { x: number; z: number; ramp: number };
  /** the plateau edge's continuations beyond the sea step: south from the SW corner along x, east from the NE corner along the north cliff */
  plateauSouthX: number;
  plateauCliff: P2[];
  strip: { y: number; apron: { rect: [number, number, number, number]; y: number } };
}

export const GRID = SG.grid;
/** true when v lies on a terrain grid line (to a millimetre) */
export function onGridLine(v: number): boolean {
  const k = (v - GRID.origin) / GRID.cell;
  return Math.abs(k - Math.round(k)) * GRID.cell < 2e-3;
}

/** The closed plateau polygon: the sea step (walls.seaStep), south along x -152,
 *  round the zone's far side, and back along the north cliff to the NE corner. */
function plateauPolygon(T: TerrainPlan, edge: P2[]): P2[] {
  const far = 400, sw = edge[0];
  return [...edge, ...T.plateauCliff, [far, T.plateauCliff[T.plateauCliff.length - 1][1]], [far, -far], [T.plateauSouthX, -far], [T.plateauSouthX, sw[1] - 2]];
}

/** caerdunLevel(x, z, h): the zone's height at (x, z), h the shared field noise there. */
export function makeLevel(T: TerrainPlan, edge: P2[]): (x: number, z: number, h: number) => number {
  const F = SG.F, D = T.ditch, poly = plateauPolygon(T, edge), cell = GRID.cell, depth = F - D.floorY;
  // the plateau test's own bounding box: everything past the sea step's extent
  // to the east or south is plateau without asking the polygon
  let ex0 = Infinity, ex1 = -Infinity, ez1 = -Infinity;
  for (const [x, z] of edge) { ex0 = Math.min(ex0, x); ex1 = Math.max(ex1, x); ez1 = Math.max(ez1, z); }
  const [ax0, az0, ax1, az1] = T.strip.apron.rect, onPlateau = polyTester(poly);
  return (x: number, z: number, h: number): number => {
    // 1. the ditch: depth along x (0 at the lips, 1 on the floor) and at the south end along z
    if (x > D.lipIn && x < D.lipOut && z > D.zSouthFace && z <= D.zNorthFloor) {
      const dx = x < D.floor0 ? (x - D.lipIn) / cell : x > D.floor1 ? (D.lipOut - x) / cell : 1;
      const dz = z < D.zSouthFloor ? (z - D.zSouthFace) / cell : 1;
      return F - depth * Math.max(0, Math.min(1, Math.min(dx, dz)));
    }
    // 2. the wild beyond the glacis and the south glacis
    const w = Math.max(x - T.wild.x, T.wild.z - z);
    if (w > 0) return F + Math.max(0, h) * Math.min(1, w / T.wild.ramp);
    // 3. the plateau (fast path east of the sea step and south of it)
    if (x > ex1 + 1 && z < ez1 - 10) return F;
    if (x >= ex0 - 10 && onPlateau(x, z)) return F;
    if (x > ex0 - 10 && x < ex1 && z < -110 && x > T.plateauSouthX) return F;
    // 4. the strip, the quay apron on it
    if (x >= ax0 && x <= ax1 && z >= az0 && z <= az1) return T.strip.apron.y;
    return T.strip.y;
  };
}

/** The ground the terrain mesh DRAWS at (x, z): the level at the grid's vertices,
 *  two triangles a cell split (a, a+1, a+sub+1) / (a+1, a+sub+2, a+sub+1) -- the
 *  diagonal from (j+1, i) to (j, i+1), scene.ts terrainMeshHeight. */
export function makeDrawnGround(level: (x: number, z: number, h: number) => number): (x: number, z: number) => number {
  const step = GRID.cell, o = GRID.origin, n = GRID.n, memo = new Map<number, number>();
  const at = (i: number, j: number) => {
    const k = i * 4096 + j;
    let v = memo.get(k);
    if (v === undefined) { v = level(o + j * step, o + i * step, 0); memo.set(k, v); }
    return v;
  };
  return (x: number, z: number) => {
    const j = Math.max(0, Math.min(n - 1, Math.floor((x - o) / step)));
    const i = Math.max(0, Math.min(n - 1, Math.floor((z - o) / step)));
    const fx = Math.max(0, Math.min(1, (x - (o + j * step)) / step)), fz = Math.max(0, Math.min(1, (z - (o + i * step)) / step));
    const h00 = at(i, j), h10 = at(i, j + 1), h01 = at(i + 1, j), h11 = at(i + 1, j + 1);
    return fx + fz < 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
}
