// Dungeon props: CC0 NATURE files (trees, plants, ferns, flowers) in the
// dungeons drawn as the open world's generated stand-ins (Philip,
// 2026-10-11: "replace cc0 props in the dungeons that look cartoonish with
// your own creations"; DUNGEON-PROPS.md, package C).
//
// The world already replaces the kit's nature with its own (trees.ts,
// nature.ts: painted alpha-tested cards on the tree shader, the nature remake
// Philip approved, 2026-09-28), built to each kit model's MEASURED bounds, but
// only through models.ts; the dungeon kit's PropPools loads glTF itself, so
// the Glasshouse still drew the kit's plastic foliage. This routes those files
// to the same generators: the same plants as the fields outside, one pool per
// file as before (each template is built fresh and owns its geometry, so the
// pool's thin-instance buffers are its own).
//
// Not here: the palms, the vines and the log, which have no world stand-in fit
// for a glasshouse or a woodpile; they are original atlas props in
// tools/assets/dprops/fam_plants.mjs and reach the dungeons through the swap
// index like every other original.
import { Matrix, type Mesh, type Scene } from '@babylonjs/core';
import { buildGeneratedTree } from '../trees.ts';
import '../nature.ts';            // registers the generated plants with trees.ts

type V3 = [number, number, number];
/** a root-folder kit file drawn as the generated tree of another kit path,
 * fitted to its own measured bounds (env_manifest_cc0.json min, max) */
const FITTED: Record<string, { as: string; min: V3; max: V3 }> = {
  // the nursery's saplings in their tubs (1.6 m at 0.48): the broadleaf
  'CommonTree_3.glb': { as: 'nature/CommonTree_3.gltf', min: [-0.704, -0.072, -0.792], max: [0.571, 3.384, 0.77] },
  // the root gallery's dead stems: the bare grey tree
  'CommonTree_Dead_1.glb': { as: 'nature/DeadTree_1.gltf', min: [-0.549, -0.042, -0.965], max: [0.495, 2.178, 1.155] },
};
/** kit paths the world's generators already build at the kit model's size */
const DIRECT = new Set([
  'nature/Fern_2.gltf', 'nature/Flower_3_Group.gltf', 'nature/Plant_1.gltf', 'nature/Plant_5.gltf',
  'nature/CommonTree_1.gltf', 'nature/CommonTree_5.gltf',
]);

export function natureTemplate(scene: Scene, file: string): Mesh | null {
  const fit = FITTED[file];
  if (!fit && !DIRECT.has(file)) return null;
  const t = buildGeneratedTree(fit?.as ?? file, scene);
  if (!t) return null;
  // a kit tree comes with its far double for trees.ts's distance split, which
  // the dungeon's room culler replaces
  (t as any).__treeLod?.dispose();
  delete (t as any).__treeLod;
  // the world's finishing made it a shadow caster; the dungeons cast none
  for (const l of scene.lights) (l.getShadowGenerator() as any)?.removeShadowCaster?.(t);
  t.receiveShadows = false;
  if (fit) {
    // uniform scale to the kit file's height, its base and plan centre where the kit model's were
    t.refreshBoundingInfo();
    const b = t.getBoundingInfo().boundingBox, mn = b.minimum, mx = b.maximum;
    const k = (fit.max[1] - fit.min[1]) / Math.max(1e-4, mx.y - mn.y);
    t.bakeTransformIntoVertices(Matrix.Translation(-(mn.x + mx.x) / 2, -mn.y, -(mn.z + mx.z) / 2)
      .multiply(Matrix.Scaling(k, k, k))
      .multiply(Matrix.Translation((fit.min[0] + fit.max[0]) / 2, fit.min[1], (fit.min[2] + fit.max[2]) / 2)));
    t.refreshBoundingInfo();
  }
  t.name = `kitprop_${file}`;
  t.isPickable = false;
  t.isVisible = false;
  return t;
}
