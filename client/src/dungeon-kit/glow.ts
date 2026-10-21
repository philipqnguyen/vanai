// Dungeon kit v2: the glow pass, emitters only.
//
// The game's GlowLayer (scene.ts setupGlow) draws every active mesh a second
// time, black unless its material has metadata.glow -- which is why every
// dungeon baseline shows drawsByPass.glow == main (SCOUT.md). The kit keeps
// ONLY emitters in that pass. What the black copies were for is occlusion (an
// ember behind a wall must not bloom through it), so each room group gets one
// positions-only occluder of its shell (walls, floor, ceiling) drawn in the
// glow pass alone, enabled with its room: one cheap glow draw per visible room
// instead of one per mesh. Same mechanism as scene.ts glowOccluderMesh (see
// its comment, and CITY-BUILD.md), parameterised by layer so the kit's own
// demo page can use it without the game's scene.
//
// In the game, scene.ts already runs a dungeon's glow pass on emitters only
// (dungeon-backdrop.ts glowOnlyEmitters) behind ONE coarse occluder of the
// plan's walls (layoutOccluder), so the glue (zones/dungeon-craft.ts
// dungeonKit) turns the kit's per-room occluders off; they are for a page or
// scene without that pass.
import { Color3, Mesh, StandardMaterial, VertexData, type AbstractMesh, type GlowLayer, type Material, type Scene } from '@babylonjs/core';

export function isEmitter(m: Material | null | undefined): boolean {
  return !!(m?.metadata as { glow?: number } | null | undefined)?.glow;
}

/** Take every mesh that does not glow out of the glow pass. Returns how many left it. */
export function excludeNonEmitters(layer: GlowLayer | null | undefined, meshes: readonly AbstractMesh[]): number {
  if (!layer) return 0;
  let n = 0;
  for (const m of meshes) if (!isEmitter(m.material)) { layer.addExcludedMesh(m as Mesh); n++; }
  return n;
}

/** A glow-pass-only occluder: positions only, drawn black with depth by the
 * layer and skipped by every other pass (render() is a no-op; the layer binds
 * and draws the geometry itself). */
export function glowOccluder(scene: Scene, layer: GlowLayer | null | undefined, name: string, positions: Float32Array, indices: Uint32Array | Uint16Array): Mesh | null {
  if (!layer || !scene.effectLayers.includes(layer) || !indices.length) return null;
  const mesh = new Mesh(name, scene), vd = new VertexData();
  vd.positions = positions; vd.indices = indices;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial(`${name}_m`, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.emissiveColor = Color3.Black();
  m.backFaceCulling = false;
  m.disableColorWrite = true; m.disableDepthWrite = true;
  mesh.material = m;
  mesh.isPickable = false;
  // scene.ts glowOnlyEmitters (dungeon-backdrop.ts) keeps emitters and meshes flagged so in a dungeon's glow pass
  mesh.metadata = { glowOccluder: true };
  mesh.freezeWorldMatrix();
  mesh.render = () => mesh;
  const on = layer.onBeforeRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = false; m.disableDepthWrite = false; } });
  const off = layer.onAfterRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = true; m.disableDepthWrite = true; } });
  mesh.onDisposeObservable.addOnce(() => { layer.onBeforeRenderMeshToEffect.remove(on); layer.onAfterRenderMeshToEffect.remove(off); m.dispose(); });
  return mesh;
}

/** The selector scene.ts setupGlow installs: emitters by metadata.glow x
 * emissive, everything else black. For pages that make their own layer. */
export function emitterSelector(layer: GlowLayer): void {
  layer.customEmissiveColorSelector = (_mesh, _sub, material, result) => {
    const s = (material?.metadata as { glow?: number } | undefined)?.glow, e = (material as StandardMaterial | null)?.emissiveColor;
    if (!s || !e) { result.set(0, 0, 0, 1); return; }
    result.set(e.r * s, e.g * s, e.b * s, 1);
  };
}
