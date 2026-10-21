// The bestiary's generated creatures (tools/assets/creatures/, built in
// Blender from parametric body plans into public/models/creatures/<key>.glb).
// BESTIARY.md is the guide.
//
// There is no hand-kept table here. Which GLB a monster wears, how tall it
// stands and how it is recoloured come from the bestiary plan, generated into
// creature-looks.json (tools/data/bestiary_looks.mjs). The kit writes one
// creatures/<key>.json per GLB it builds -- clips and their lengths, the ground
// speed its Walk and Run cover, tris per LOD, bones, atlas -- and this module
// gathers whatever files exist, so body plans were built in parallel without
// anyone editing a shared file. Every monster wears one: the KayKit and
// Quaternius monster models and entities.ts's MONSTER_MODEL / FAMILY_MODEL
// tables that stood in until they were built are gone (2026-10-13).
//
// A creature GLB is authored at its true size in metres, feet at y = 0, facing
// +z; the monster's height (the plan's height_m, also monsters.json's
// height_m) scales it.
import type { AbstractMesh, AnimationGroup, Mesh } from "@babylonjs/core";
import type { ModelInstance } from "./models";
import looksJson from "./creature-looks.json";
import { lodDistance, monsterTable, type CreatureLooks, type CreatureStats, type CreatureUse } from "./creature_rules";
export { creatureClip, lodDistance, type CreatureStats, type CreatureState, type CreatureUse } from "./creature_rules";

export const CREATURE_LOOKS = looksJson as unknown as CreatureLooks;

const files = import.meta.glob<CreatureStats>("./creatures/*.json", { eager: true, import: "default" });

/** creature key -> its stats, one per creatures/<key>.json */
export const CREATURE_INDEX: Record<string, CreatureStats> = Object.fromEntries(
  Object.entries(files).map(([path, st]) => [path.replace(/^.*\/|\.json$/g, ""), st]));

/** monster key -> the creature it wears, for every monster whose GLB is built */
export const CREATURE_MODEL: Record<string, CreatureUse> = monsterTable(CREATURE_LOOKS, (glb) => glb in CREATURE_INDEX);

/** The creature a monster wears, if its GLB has been built. */
export function creatureFor(monsterKey: string): { use: CreatureUse; stats: CreatureStats } | null {
  const use = CREATURE_MODEL[monsterKey];
  const stats = use && CREATURE_INDEX[use.creature];
  return use && stats ? { use, stats } : null;
}

/**
 * Finish an instantiated creature: LOD1 becomes LOD0's distant level (one
 * draw either way, never both), only LOD0 is picked, and clips cross-fade.
 */
export function prepareCreature(mi: ModelInstance, heightM: number): void {
  const meshes = mi.root.getChildMeshes(false) as AbstractMesh[];
  const lod0 = meshes.find((m) => m.name.endsWith("_LOD0")) as Mesh | undefined;
  const lod1 = meshes.find((m) => m.name.endsWith("_LOD1")) as Mesh | undefined;
  if (lod0 && lod1) {
    lod0.addLODLevel(lodDistance(heightM), lod1);
    lod1.isPickable = false;
  }
  mi.groups.forEach((g: AnimationGroup) => {
    g.enableBlending = true;
    g.blendingSpeed = 0.12;
  });
}

