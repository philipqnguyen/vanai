// THE CELLAR STAIR (2026-10-10 doors pass, AUDIT.md section 4): the way down
// to the Propagating Cellars, under the glasshouse. The veil used to stand in
// the glasshouse's open west end among the potting benches, with no door and
// no way down -- it read as walking into a greenhouse. Now the cellars have
// their own door: a stair court sunk at the glasshouse's east end, going down
// west toward it, a low arched door in its end wall under the gable. Half of
// it is the gardeners' cart way (race1 follows "the gardeners' carts to the
// Propagating Cellars under the glasshouse"), so the court is broad: 9.3 m
// between its walls, a stair and a cart ramp side by side.
//
// Laid on the terrain grid (dungeon_doors.ts): the head at a grid crossing on
// the glasshouse's axis, three cells to the door, the end wall's back 1.3 m
// off the gable. kingsgardens.ts registers CELLARS.carve and its keep-clears
// and calls cellars() from build().
import { makePath, placeExact, ground } from "../scene";
import { stairCourt, gridLine, CELL } from "./dungeon_doors";

export const CELLARS = stairCourt({
  key: "kg_cellars", head: [gridLine(252), gridLine(-163.3)], dir: [-1, 0],
  hw: CELL, flight: 10, land: 3 * CELL - 10, drop: 3.4,
  door: { w: 3.2, spring: 2.2 }, parapet: 1.0, tint: "#d8d4cc", rail: true,
  // the glasshouse pad's own level (kingsgardens.ts: GLASS, 1.6): the lawn
  // falls away east of the pad, so the head is eased up to it
  level: 1.6,
});

export function cellars(): void {
  const { yh } = CELLARS.build();
  // the gravel walk from the glasshouse road's end, round the glasshouse's
  // south side, to the stair's head -- the carts' way
  makePath({ pts: [[201, -165], [206, -177], [232, -178.5], [254, -177], [258, -169], [254.4, CELLARS.spec.head[1]]], half: 1.8, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: "kg_cellarwalk" });
  // the head's lanterns, on the walls' tops
  const top = yh + 0.12;
  placeExact("halloween/post_lantern.gltf", [-1, 1].map((side) => {
    const [x, z] = CELLARS.at(side * (CELLARS.spec.hw + 1.4), 1.6);
    return { x, z, scale: 1.1, rot: side > 0 ? Math.PI / 2 : -Math.PI / 2, yOff: top - ground(x, z) };
  }), 0.3);
}
