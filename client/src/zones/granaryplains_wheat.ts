// The Granary Plains' wheat: an original generated tuft, gold.
//
// WHY its own plant: the kit's Grass_Wheat is now a generated tuft (nature.ts
// buildGrassTuft) coloured by a ramp built off its swatch, #bb5700 -- an
// orange-brown -- and a placement tint is a MULTIPLY on that ramp. No tint can
// take orange to gold (gold needs green ~0.83 of red; the swatch has 0.46), so
// the province's "wheat to every horizon" rendered as a field of red reeds
// (tmp/wilds/before/granaryplains/vista.jpg). This builds the same kind of
// tuft from the same painted wheat sheet (blades with ears) through the same
// foliage material (wind, ramp, the trees' image processing), with a ramp that
// IS the card's wheat: shade -> deep #c49a44 -> light #ddb75e, lit up.
//
// Registered as generated foliage under a file key of its own, so placeExact,
// staticTemplate and the shadow/instancing path treat it exactly like a kit
// plant: one thin-instanced pool per key, whatever the count.
import type { Mesh, Scene } from "@babylonjs/core";
import { registerGeneratedFoliage, foliageMaterial } from "../trees";
import { Parts, uprightCard, sheetOf, drawBlades, seedOf } from "../nature";

export const WHEAT = "granary/Wheat_Gold.gltf";
export const STUBBLE = "granary/Wheat_Stubble.gltf";

// The kit wheat's measured box (nature.ts NATURE_KIT "nature/Grass_Wheat.gltf"),
// so a scale that suited the old tuft suits this one.
const FIT = ["grass", -0.542, -0.045, -0.522, 0.570, 1.738, 0.491, []] as any;
// the stubble is a cut tuft: the same footprint, a third of the height
const FIT_STUB = ["grass", -0.56, -0.03, -0.54, 0.58, 0.55, 0.52, []] as any;

// shade, mid, lit. Gold standing wheat, and straw for the cut rows. MEASURED
// in the first look: a lit of #f6e3a0 over the sheet's pale ears read as
// cream, not gold, against the straw ground -- the ramp sits a step deeper.
const GOLD: [string, string, string] = ["#5a3a10", "#b8862c", "#e6bc58"];
const STRAW: [string, string, string] = ["#5e4a26", "#b89a5c", "#dcc48a"];

function build(file: string, fit: any, ramp: [string, string, string], scene: Scene, tint: string | null, snow: boolean): Mesh {
  // a little seeded jitter, the way nature.ts makes its tufts
  let s = seedOf(file);
  const rr = (a: number, b: number) => { s = (s * 1664525 + 1013904223) >>> 0; return a + (s / 4294967296) * (b - a); };
  const parts = new Parts();
  // the same sheet key as the kit wheat, so the painted sheet is shared
  const tex = sheetOf(scene, "blades_wheat", (c, S, r) => drawBlades(c, S, r, "wheat"));
  const mat = parts.part(foliageMaterial(scene, `granary_${file}`, tex, ramp, tint, snow));
  // four crossed cards, not the kit tuft's three: a rank of wheat is seen
  // edge-on from the road, and the fourth fills the gap a third leaves
  for (let i = 0; i < 4; i++) uprightCard(mat, [0, 0, 0], (i / 4) * Math.PI + rr(-0.15, 0.15), 1, 1, rr(-0.12, 0.12), [0, 1, 0], 0.55);
  return parts.build(`gtn_${file}`, scene, fit, 0);
}

registerGeneratedFoliage(WHEAT, (sc, t, sn) => build(WHEAT, FIT, GOLD, sc, t, sn));
registerGeneratedFoliage(STUBBLE, (sc, t, sn) => build(STUBBLE, FIT_STUB, STRAW, sc, t, sn));
