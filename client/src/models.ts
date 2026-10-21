// glTF model loading + instancing: the generated creatures (creatures.ts), the
// production bodies, CC0 props and nature. Cached per scene as AssetContainers.
import "@babylonjs/loaders/glTF";
import "./ktx2"; // the creatures' KTX2 atlases: the vendored decoder
import {
  Scene, LoadAssetContainerAsync, AssetContainer, TransformNode, AnimationGroup,
  Mesh, AbstractMesh, Vector3, Matrix, Quaternion, Material, MultiMaterial,
} from "@babylonjs/core";
import { scene, addShadowCaster } from "./scene";
import { isGeneratedTree, buildGeneratedTree, addTreeInstances, setTreeFinish } from "./trees";
// importing nature.ts also registers its plants with trees.ts
import { isGeneratedProp, buildGeneratedProp } from "./nature";
setTreeFinish((m) => addShadowCaster(m));

import {prepareCharacterTemplate,PRODUCTION_BODIES} from './sword-motion';
import {runtimePath} from './asset-index';

const containerCache = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();

// The glTF loader hands every vertex buffer, index buffer and embedded image a
// view into the one file it read, so any view a cache keeps keeps the whole
// file: measured at ~30 MB of a dressed actor's heap. Geometry data gets its
// own bytes (nothing it draws changes); a texture's copy is dropped outright,
// since only Babylon's context-loss recovery, which the engine does not do
// (scene.ts initEngine), would read it again.
//
// A bounds refresh with the skeleton applied -- the loader's on every mesh,
// and Mesh.clone's on every clone, so on every actor's body, hair and gear --
// leaves the mesh a Vector3 per vertex, a picking cache Babylon rebuilds from
// the geometry when a pick needs it: ~5 MB a 60k-vertex garment, kept per
// actor. dropPointCache lets it go once the bounds are in.
export function dropPointCache(meshes: Iterable<AbstractMesh>): void {
  for (const m of meshes) (m as any)._internalAbstractMeshDataInfo._positions = null;
}
function ownBytes<T extends ArrayBufferView>(view: T): T { return view.byteLength < view.buffer.byteLength ? (view as any).slice() : view; }
export function ownContainerBytes(pack: AssetContainer): AssetContainer {
  const buffers = new Set<any>();
  for (const g of pack.geometries) {
    for (const kind of g.getVerticesDataKinds()) { const b = (g.getVertexBuffer(kind) as any)?._buffer; if (b && !buffers.has(b)) { buffers.add(b); const d = b._data; if (ArrayBuffer.isView(d)) b._data = ownBytes(d); } }
    const indices = (g as any)._indices; if (ArrayBuffer.isView(indices)) (g as any)._indices = ownBytes(indices);
  }
  for (const t of pack.textures as any[]) t._buffer = null;
  dropPointCache(pack.meshes);
  return pack;
}

async function getContainer(file: string): Promise<AssetContainer> {
  const owner = scene;
  if (owner.isDisposed) throw new Error('Model scene was disposed');
  let perScene = containerCache.get(owner);
  if (!perScene) {
    perScene = new Map();
    containerCache.set(owner, perScene);
  }
  let p = perScene.get(file);
  if (!p) {
    // Character models are the maker's: the one folder, by the index (its packed
    // copy, KTX2 images and all else identical, where the maker made one).
    const url = file.startsWith('characters/') ? runtimePath(`models/${file}`).url : `/models/${file}`;
    p = LoadAssetContainerAsync(url, owner).then(ownContainerBytes).then(async container => {
      const body = PRODUCTION_BODIES.find(b => file === `characters/${b}/body.glb`);
      try {
        // A container completed after disposal misses the scene's disposal event.
        if (owner.isDisposed) throw new Error('Model scene was disposed');
        if (body) await prepareCharacterTemplate(container, body);
        if (owner.isDisposed) throw new Error('Model scene was disposed');
        return container;
      } catch (error) { container.dispose(); throw error; }
    }).catch(error => { perScene!.delete(file); throw error; });
    perScene.set(file, p);
  }
  return p;
}

export interface ModelInstance {
  root: TransformNode;
  groups: Map<string, AnimationGroup>;
  height: number;  // full vertical extent of the model (max - min)
  baseY: number;   // lowest point in model space; offset by -baseY*scale to ground it
}

// Instantiate an animated character/creature. Meshes get entityId metadata for picking.
export async function instantiateModel(file: string, entityId: string | null, cloneMeshes = false): Promise<ModelInstance | null> {
  try {
    const container = await getContainer(file);
    const sceneNow = scene; // guard against zone change during await
    if (container.scene !== sceneNow || sceneNow.isDisposed) return null;
    const result = container.instantiateModelsToScene((name) => name, false, {doNotInstantiate:cloneMeshes});
    const root = new TransformNode(`mi_${file}_${entityId}`, scene);
    result.rootNodes.forEach((n) => (n.parent = root));
    const groups = new Map<string, AnimationGroup>();
    result.animationGroups.forEach((g) => { g.stop(); groups.set(g.name, g); });
    // measure vertical bounds for scaling + grounding
    let maxY = 0.001, minY = 0;
    root.getChildMeshes().forEach((m: AbstractMesh) => {
      addShadowCaster(m);
      if (entityId) { m.isPickable = true; m.metadata = { ...m.metadata, entityId }; }
      // skinned meshes keep their bind-pose bounds, which can sit far from the
      // animated body (center-pivot exports) and get wrongly frustum-culled
      if (m.skeleton) m.alwaysSelectAsActiveMesh = true;
      const bb = m.getBoundingInfo().boundingBox;
      maxY = Math.max(maxY, bb.maximumWorld.y);
      minY = Math.min(minY, bb.minimumWorld.y);
    });
    dropPointCache(root.getChildMeshes());
    root.onDisposeObservable.add(() => { result.skeletons.forEach(s => s.dispose()); });
    return { root, groups, height: Math.max(0.001, maxY - minY), baseY: minY };
  } catch {
    return null;
  }
}

// Play an animation by trying several names; returns the group that played.
export function playAnim(mi: ModelInstance, names: string[], loop: boolean, speed = 1.0): AnimationGroup | null {
  for (const n of names) {
    let g = mi.groups.get(n) || mi.groups.get(`AnimalArmature|${n}`) || mi.groups.get(`MonsterArmature|${n}`);
    if (!g) { // any armature prefix (e.g. "CharacterArmature|Idle", "Armature|Walk")
      for (const [k, cand] of mi.groups) if (k.endsWith(`|${n}`)) { g = cand; break; }
    }
    if (g) {
      mi.groups.forEach((other) => { if (other !== g && other.isPlaying) other.stop(); });
      if (!g.isPlaying) g.start(loop, speed);
      return g;
    }
  }
  return null;
}

// Merge a static model (tree/rock) into one mesh usable for thin instances.
// Cached per scene+file: clones share vertex buffers with the container, so the
// scale bake below must run exactly once per file — a second instantiation of
// the same file would bake the node scale into the shared buffer twice
// (the 100x-giant-bush bug). Callers all just thinInstanceAdd onto the result.
const templateCache = new WeakMap<Scene, Map<string, Promise<Mesh | null>>>();

// The one sanctioned way to add thin instances to a template (or a tinted
// clone of one): templates start invisible so empty ones cannot ghost-render
// at the origin, and the flip to visible belongs with the matrices.
export function addInstances(t: Mesh, mats: Matrix[]): void {
  // a generated tree keeps its own instance list and splits it near/far
  // (trees.ts LOD); it has no colour buffer to grow
  if ((t as any).__treeLod) { addTreeInstances(t, mats); return; }
  t.thinInstanceAdd(mats);
  t.isVisible = true;
  // A per-instance colour buffer (tintInstances) is sized to the count it saw.
  // A later add on the same template leaves it short, and the draw then fails
  // silently ("vertex buffer is not big enough" -- the Canal Works' willows,
  // and everything after them in the frame). Grow it to fit, white for the
  // newcomers.
  const col = (t as any).__instColor as Float32Array | undefined;
  if (col && col.length < t.thinInstanceCount * 4) {
    const d = new Float32Array(t.thinInstanceCount * 4).fill(1);
    d.set(col);
    (t as any).__instColor = d;
    t.thinInstanceSetBuffer("color", d, 4);
  }
}

export async function staticTemplate(file: string): Promise<Mesh | null> {
  if (scene.isDisposed) return null;
  let perScene = templateCache.get(scene);
  if (!perScene) {
    perScene = new Map();
    templateCache.set(scene, perScene);
  }
  let cached = perScene.get(file);
  if (!cached) {
    cached = buildStaticTemplate(file);
    perScene.set(file, cached);
  }
  return cached;
}

/**
 * A second template of the same file with its materials RESTYLED -- a roof
 * drawn from a different tile sheet, a wall from a different brick. Cached per
 * scene, file and `key` like staticTemplate, and instanced the same way.
 *
 * Built FRESH from the cached container rather than cloned off the base
 * template: Mesh.clone copies the source's thin-instance buffers (MEASURED,
 * Babylon 9.22 mesh.pure.js:493), and a clone that inherits a city's worth of
 * roof matrices plus a colour buffer sized to them is exactly the "vertex
 * buffer is not big enough" failure the __paintedArt note above records.
 *
 * `restyle` is given each material the merged mesh uses and returns the one to
 * use instead. The container's materials are SHARED with the base template
 * (instantiateModelsToScene clones nothing), so a restyle that changes
 * anything must clone first and never mutate what it was handed.
 */
export async function staticTemplateVariant(file: string, key: string, restyle: (m: Material) => Material): Promise<Mesh | null> {
  const owner = scene;
  if (owner.isDisposed) return null;
  let perScene = templateCache.get(scene);
  if (!perScene) {
    perScene = new Map();
    templateCache.set(scene, perScene);
  }
  const ck = `${file}#${key}`;
  let cached = perScene.get(ck);
  if (!cached) {
    cached = buildStaticTemplate(file).then((t) => {
      if (!t || t.isDisposed() || owner.isDisposed || owner !== scene) return null;
      const mm = t.material;
      if (mm instanceof MultiMaterial) {
        const out = new MultiMaterial(`${mm.name}#${key}`, owner);
        out.subMaterials = mm.subMaterials.map((m) => (m ? restyle(m) : m));
        t.material = out;
      } else if (mm) {
        t.material = restyle(mm);
      }
      return t;
    });
    perScene.set(ck, cached);
  }
  return cached;
}

async function buildStaticTemplate(file: string): Promise<Mesh | null> {
  // A kit tree with a generated stand-in (trees.ts) is built here instead of
  // loaded, under the kit path, so every caller gets it unchanged. It takes
  // the same finishing a loaded template does below.
  if (isGeneratedTree(file)) {
    const tree = buildGeneratedTree(file, scene);
    if (tree) return tree;
  }
  // generated stone and wood (nature.ts): plain PBR, finished as a loaded
  // kit template is below, so the scene's tint and snow clone it as before
  if (isGeneratedProp(file)) {
    const prop = buildGeneratedProp(file, scene);
    if (prop) {
      prop.isVisible = false;
      (prop as any).__paintedArt = true;
      addShadowCaster(prop);
      const bb0 = prop.getBoundingInfo().boundingBox;
      prop.metadata = { ...(prop.metadata || {}), generatedProp: file, baseCenter: bb0.center.clone(), baseExtend: bb0.extendSize.clone() };
      return prop;
    }
  }
  try {
    const container = await getContainer(file);
    if (container.scene !== scene || scene.isDisposed) return null;
    const result = container.instantiateModelsToScene((name) => `st_${file}_${name}`, false);
    const meshes = result.rootNodes.flatMap((n) => n.getChildMeshes()).filter((m) => m.getTotalVertices() > 0) as Mesh[];
    if (!meshes.length) return null;
    meshes.forEach((m) => {
      // bake the full transform relative to the model root (some exports keep a
      // 0.01 normalization scale on a parent node; local-only baking misses it
      // and the template comes out 100x too large). The glTF __root__ handedness
      // flip stays excluded so triangle winding is preserved.
      let top: TransformNode = m;
      while (top.parent) top = top.parent as TransformNode;
      const rel = m.computeWorldMatrix(true).multiply(Matrix.Invert(top.computeWorldMatrix(true)));
      // Spatial palette variants must not bake into the container's shared
      // geometry: another batch may still need its original local pivot.
      m.makeGeometryUnique();
      m.bakeTransformIntoVertices(rel);
      m.position.setAll(0);
      m.rotationQuaternion = null;
      m.rotation.setAll(0);
      m.scaling.setAll(1);
      m.parent = null;
    });
    const merged = meshes.length === 1 ? meshes[0]
      : Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
    if (!merged) return null;
    // ITS OWN GEOMETRY. instantiateModelsToScene hands every instantiation
    // of a one-mesh file the container's shared geometry, and Babylon keeps
    // thin-instance buffers ON the geometry -- so a file's base template and
    // its palette variants (staticTemplateVariant builds one per palette)
    // overwrote each other's world/colour buffers, and whichever had the
    // most instances drew past the end of another's buffer: GL_INVALID_
    // OPERATION on every frame of every city (the Capital's Lantern_Wall,
    // Floor_WoodDark, the corner pieces ... 22 files), WebGL giving up on
    // the context. MergeMeshes returns fresh geometry; the single-mesh path
    // has to copy.
    if (meshes.length === 1) merged.makeGeometryUnique();
    result.rootNodes.forEach((n) => n.dispose());
    merged.isPickable = false;
    merged.setEnabled(true);
    // A template with ZERO thin instances renders ITSELF at the origin --
    // Babylon only suppresses the base draw once instances exist. A file used
    // exclusively through tinted clones leaves its base template empty, and the
    // ghost stack of every such model materialises at (0,0) (found in the
    // v_northroad vignette: a boulder pile and a 17m pine squatting at the inn
    // door). Templates therefore start invisible; addInstances() below flips
    // whichever mesh actually receives matrices.
    merged.isVisible = false;
    // Packs whose sheets are ALREADY painted by the artist opt out of the
    // colour pipeline meant for flat-coloured kit foliage: the per-instance
    // random multiply in tintInstances and the albedo crush in styleFoliage
    // both assume a material carrying no colour of its own. Flagged here
    // rather than at the call sites because staticTemplate caches one Mesh per
    // file and every scatter path shares it.
    // Every CC0 kit dir. Two reasons: their sheets are all
    // painted, and tintInstances writes a thin-instance COLOUR buffer sized to
    // the instance count it saw. A template shared by a scatter and a later
    // placeExact then grows its matrix buffer past that colour buffer, and the
    // draw fails with "vertex buffer is not big enough" -- which is exactly
    // what the crystals did, being used by both the wold scatter and the glade.
    if (/^(graveyard|crystal|props|town|dungeon|hex|halloween)\//.test(file)) (merged as any).__paintedArt = true;
    addShadowCaster(merged);
    // Snapshot the GEOMETRY bounds now: thinInstanceAdd later expands the
    // mesh's bounding box to cover every instance, so anyone recentering
    // pieces by bbox after that reads a city-sized box (the ±95m phantom bug).
    const bb0 = merged.getBoundingInfo().boundingBox;
    merged.metadata = { ...(merged.metadata || {}), baseCenter: bb0.center.clone(), baseExtend: bb0.extendSize.clone() };
    return merged;
  } catch {
    return null;
  }
}

// `sx`/`sy`/`sz` override `scale` per axis, and the rim mountains are what they
// are for: one rock model repeated along a ridge reads as wallpaper however the
// scale and yaw vary, and stretching an instance changes its SILHOUETTE rather
// than just its size. Everything else passes `scale` alone and is unaffected.
export function scatterMatrices(
  positions: { x: number; z: number; y: number; scale: number; rot: number;
               sx?: number; sy?: number; sz?: number;
               // a lean: the top tips `lean` radians toward the world direction
               // (leanX, leanZ) -- the Burned Land's glassed trunks, every one
               // bent away from the capital
               lean?: number; leanX?: number; leanZ?: number }[]
): Matrix[] {
  return positions.map((p) => {
    let q = Quaternion.RotationAxis(Vector3.Up(), p.rot);
    if (p.lean) {
      const dx = p.leanX ?? 1, dz = p.leanZ ?? 0, L = Math.hypot(dx, dz) || 1;
      // the axis a top tips about to move toward (dx, dz) is (dz, 0, -dx)
      q = Quaternion.RotationAxis(new Vector3(dz / L, 0, -dx / L), p.lean).multiply(q);
    }
    return Matrix.Compose(
      new Vector3(p.sx ?? p.scale, p.sy ?? p.scale, p.sz ?? p.scale),
      q,
      new Vector3(p.x, p.y, p.z)
    );
  });
}
