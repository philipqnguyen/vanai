// Draw-call cuts that move no triangle (tmp/heartwood-perf PLAN.md). Opt-in:
// only Heartwood calls it, at the end of its build.
import { BoundingInfo, Color3, Mesh, StandardMaterial, Vector3, VertexData, type AbstractMesh, type Light, type Material, type Scene, type ShadowGenerator } from "@babylonjs/core";
import { glow, glowOccluderMesh } from "./scene";

function clipped(mat: Material): boolean {
  const m = mat as Material & { clipPlane?: unknown; clipPlane2?: unknown; clipPlane3?: unknown; clipPlane4?: unknown; clipPlane5?: unknown; clipPlane6?: unknown };
  return !!(m.clipPlane || m.clipPlane2 || m.clipPlane3 || m.clipPlane4 || m.clipPlane5 || m.clipPlane6);
}

// What the glow layer draws for a mesh whose material does not glow is black
// with depth (setupGlow's selector gives it 0,0,0,1), and the shader varies it
// only by what is tested here: an alpha test or blend, an opacity or emissive
// texture, alpha from a texture or the vertices (glowMapGeneration.fragment),
// the culling, depth and colour state (thinEffectLayer _renderSubMesh), and a
// per-mesh intensity. A material that sets none of them draws the very texels
// a black copy of its triangles draws. Every hw material is two-sided, and the
// copy is too, so a one-sided one is left alone rather than matched.
function drawsBlack(mat: Material | null, mesh: AbstractMesh): boolean {
  if (!mat || !/^(StandardMaterial|PBRMaterial)$/.test(mat.getClassName())) return false;
  const m = mat as Material & { opacityTexture?: unknown; emissiveTexture?: unknown; useAlphaFromDiffuseTexture?: boolean; _useAlphaFromAlbedoTexture?: boolean };
  if ((m.metadata as { glow?: number } | null)?.glow) return false;
  if (m.needAlphaBlendingForMesh(mesh) || m.needAlphaTestingForMesh(mesh) || m.opacityTexture || m.emissiveTexture) return false;
  const alphaTex = m.getAlphaTestTexture();
  if (alphaTex?.hasAlpha && (m.useAlphaFromDiffuseTexture || m._useAlphaFromAlbedoTexture)) return false;
  if (m.backFaceCulling || m.zOffset || m.zOffsetUnits || m.depthFunction || m.disableDepthWrite || m.forceDepthWrite || m.disableColorWrite || m.fillMode !== 0) return false;
  if (clipped(m)) return false;
  if (mesh.useVertexColors && mesh.hasVertexAlpha && mesh.isVerticesDataPresent("color") && m.transparencyMode !== 0) return false;
  return true;
}

// A mesh whose glow-pass draw a copy can stand in for (emitterCopy): drawn
// now, in the default group and mask, one plain draw per submesh, and placed by an
// identity world matrix -- so its own float32 positions ARE what the GPU drew
// (1*x + 0*y + 0*z + 0 is exact), where baking any other transform on the CPU
// moves edge texels (MEASURED in step 1 on the stall canvases).
function copyableShape(m: AbstractMesh): m is Mesh {
  if (m.getClassName() !== "Mesh" || !m.isEnabled() || !m.isVisible || m.visibility !== 1) return false;
  const mesh = m as Mesh;
  if (mesh.hasThinInstances || mesh.instances.length || mesh.skeleton || mesh.morphTargetManager || mesh.bakedVertexAnimationManager || mesh.isUnIndexed) return false;
  if (mesh.renderingGroupId !== 0 || mesh.layerMask !== 0x0fffffff || mesh.infiniteDistance || mesh.billboardMode) return false;
  return mesh.computeWorldMatrix(true).isIdentity();
}

/**
 * EMITTER COPY. Meshes that glow alike -- one material with metadata.glow,
 * one plain submesh each, identity world matrices, in the layer at intensity
 * 1 -- leave the glow pass, and one positions-only copy of their triangles, in
 * scene order, drawn with that material stands in for them there: the layer
 * colours an emitter by its material alone (setupGlow), and the glow shader of
 * a plain material reads no other attribute. Like glowOccluderMesh the copy's
 * render() does nothing, so the camera and every other target skip it while
 * the layer draws it itself. The glow pass draws in scene order, so make it
 * where the originals stood relative to whatever they meet at one depth (in
 * Heartwood: before the occluder copies). Returns the copy, or null.
 */
export function emitterCopy(name: string, meshes: readonly Mesh[]): Mesh | null {
  const layer = glow, scene = meshes[0]?.getScene();
  if (!layer || !scene || !scene.effectLayers.includes(layer)) return null;
  const order = new Map(scene.meshes.map((m, i) => [m, i])), src = [...meshes].sort((a, b) => order.get(a)! - order.get(b)!);
  const mat = src[0]?.subMeshes?.[0]?.getMaterial();
  if (!mat || !(mat.metadata as { glow?: number } | null)?.glow) return null;
  if (src.some((m) => m.subMeshes.length !== 1 || m.subMeshes[0].getMaterial() !== mat || !copyableShape(m) || !layer.hasMesh(m) || layer.getEffectIntensity(m) !== 1)) return null;
  let nv = 0, ni = 0;
  for (const m of src) { nv += m.getTotalVertices(); ni += m.subMeshes[0].indexCount; }
  const P = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const m of src) {
    const s = m.subMeshes[0], ix = m.getIndices()!;
    P.set(m.getVerticesData("position")!, vo * 3);
    for (let i = s.indexStart, end = s.indexStart + s.indexCount; i < end; i++) I[io++] = ix[i] + vo;
    vo += m.getTotalVertices();
  }
  const mesh = new Mesh(name, scene), vd = new VertexData();
  vd.positions = P; vd.indices = I;
  vd.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false; mesh.receiveShadows = false;
  mesh.freezeWorldMatrix();
  mesh.render = () => mesh;
  mesh.geometry?.clearCachedData();
  for (const m of src) layer.addExcludedMesh(m);
  return mesh;
}

// A mesh whose vertex data can be copied into another as it is: one plain
// mesh, one submesh over all of it, drawn now, placed by an identity world
// matrix (its own float32 positions are what the GPU drew) and on no light's
// exclusion list (only include lists are carried over). A caster may merge:
// the output casts on the same generators, its box the union of theirs.
function mergeable(m: AbstractMesh, excluded: Set<AbstractMesh>): m is Mesh {
  if (m.getClassName() !== "Mesh" || m.isDisposed() || !m.isEnabled() || !m.isVisible || m.visibility !== 1 || excluded.has(m)) return false;
  const mesh = m as Mesh, s = mesh.subMeshes;
  if (mesh.hasThinInstances || mesh.instances.length || mesh.skeleton || mesh.morphTargetManager || mesh.bakedVertexAnimationManager || mesh.isUnIndexed) return false;
  if (mesh.billboardMode || mesh.infiniteDistance || (glow && glow.getEffectIntensity(mesh) !== 1)) return false;
  if (s?.length !== 1 || !s[0].getMaterial() || s[0].indexStart || s[0].indexCount !== mesh.getTotalIndices() || s[0].verticesStart || s[0].verticesCount !== mesh.getTotalVertices()) return false;
  return mesh.computeWorldMatrix(true).isIdentity();
}

// Everything but the material that decides how a mergeable mesh draws: its
// lights apart from `zero`, pickability, receiving, glow membership, group,
// alphaIndex, mask, side, vertex-colour flags and attribute set.
function drawState(m: Mesh, zero: ReadonlySet<Light>): string {
  const kinds = m.getVerticesDataKinds().slice().sort().map((k) => k + m.getVertexBuffer(k)!.getSize());
  return [m.lightSources.filter((l) => !zero.has(l)).map((l) => l.uniqueId), m.isPickable, m.receiveShadows, !!glow?.hasMesh(m),
    m.renderingGroupId, m.alphaIndex, m.layerMask, m.sideOrientation, m.useVertexColors, m.hasVertexAlpha, m.checkCollisions, m.applyFog, kinds].join("|");
}

// One mesh of `src`'s vertex data in order (identity world matrices, so no
// transform) as Float32Array, named after and flagged like the first source,
// drawn with `material`, frozen, out of the glow pass if the first source was.
// Indices go 16-bit where the vertices allow, as MergeMeshes' plain arrays did:
// Babylon keeps a Uint32Array 32-bit whatever it holds (thinEngine
// _normalizeIndexData); the home groups drew no slower with 16 (+0.9 ms
// summed over the 11 perf cameras, a null pair +1.9, MEASURED
// 2026-10-06, in page, Chromium).
function concat(src: readonly Mesh[], material: Material | null): Mesh {
  const first = src[0], vd = new VertexData();
  let nv = 0, ni = 0;
  for (const m of src) { nv += m.getTotalVertices(); ni += m.getTotalIndices(); }
  for (const kind of first.getVerticesDataKinds()) {
    const size = first.getVertexBuffer(kind)!.getSize(), data = new Float32Array(nv * size);
    let o = 0;
    for (const m of src) { const d = m.getVerticesData(kind)!; data.set(d, o); o += d.length; }
    vd.set(data, kind);
  }
  const idx = nv <= 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
  let base = 0, n = 0;
  for (const m of src) { for (const i of m.getIndices()!) idx[n++] = i + base; base += m.getTotalVertices(); }
  vd.indices = idx;
  const mesh = new Mesh(first.name, first.getScene());
  vd.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = first.isPickable; mesh.receiveShadows = first.receiveShadows;
  mesh.renderingGroupId = first.renderingGroupId; mesh.alphaIndex = first.alphaIndex; mesh.layerMask = first.layerMask;
  mesh.sideOrientation = first.sideOrientation; mesh.useVertexColors = first.useVertexColors; mesh.hasVertexAlpha = first.hasVertexAlpha;
  mesh.checkCollisions = first.checkCollisions; mesh.applyFog = first.applyFog;
  if (glow && !glow.hasMesh(first)) glow.addExcludedMesh(mesh);
  mesh.freezeWorldMatrix();
  return mesh;
}

/**
 * MERGE BY KEY. Concatenates meshes that draw with the same state into one
 * mesh per key: the same material, the same lights apart from `zero`, the
 * same shadow generators, pickability, receiving, glow membership, group,
 * alphaIndex, mask, side, vertex-colour flags and attribute set. Positions,
 * normals, uvs and colours are copied as they are (identity world matrices, so
 * no transform), in scene order: each output is one mesh with one submesh,
 * frozen, named after its first source, drawn with its first source's material
 * (a MergeMeshes MultiMaterial wrapper included), casting where its sources
 * cast. The sources and their now unused wrappers go.
 *
 * `zero` are point lights each on some sources' include lists (Heartwood's
 * hearths): an output is lit by every one its sources were. The caller keeps
 * that set within the WebKit cap (planHearthGroups, at most HEARTH_CAP), and
 * keeps apart the homes a hearth would reach. Where crossing surfaces of two
 * sources meet at exactly one depth, the queue order between them can change
 * (a pixel or two; Philip's 2026-10-07 ruling keeps the look, not the pixels).
 * Returns the outputs; meshes it cannot merge are left as they were.
 */
export function mergeByKey(meshes: readonly AbstractMesh[], zero: readonly Light[] = []): Mesh[] {
  const scene = meshes[0]?.getScene();
  if (!scene) return [];
  const gens = scene.lights.flatMap((l) => [...(l.getShadowGenerators?.()?.values() ?? [])]) as ShadowGenerator[];
  const castBy = (m: Mesh) => gens.filter((g) => g.getShadowMap()?.renderList?.includes(m));
  const excluded = new Set<AbstractMesh>(scene.lights.flatMap((l) => l.excludedMeshes)), order = new Map(scene.meshes.map((m, i) => [m, i])), zeroSet = new Set(zero);
  const buckets = new Map<string, { src: Mesh[]; casts: ShadowGenerator[] }>();
  for (const m of [...new Set(meshes)].sort((a, b) => order.get(a)! - order.get(b)!)) {
    if (!mergeable(m, excluded)) continue;
    const casts = castBy(m), key = `${m.subMeshes[0].getMaterial()!.uniqueId}|${drawState(m, zeroSet)}|${casts.map((g) => gens.indexOf(g))}`;
    (buckets.get(key) ?? buckets.set(key, { src: [], casts }).get(key)!).src.push(m);
  }
  const out: Mesh[] = [];
  for (const { src, casts } of buckets.values()) {
    if (src.length < 2) continue;
    const mesh = concat(src, src[0].material);
    const lights = new Set<Light>(); for (const m of src) for (const l of m.lightSources) if (l.includedOnlyMeshes.length) lights.add(l);
    for (const l of scene.lights) if (lights.has(l)) l.includedOnlyMeshes.push(mesh);
    for (const g of casts) { for (const m of src) g.removeShadowCaster(m, false); g.addShadowCaster(mesh, false); }
    for (const m of src) {
      const wrap = m.material !== mesh.material ? m.material : null;
      m.dispose();
      if (wrap?.getClassName() === "MultiMaterial" && !scene.meshes.some((x) => x.material === wrap)) wrap.dispose();
    }
    out.push(mesh);
  }
  return out;
}

// A thin-instanced kit template the passes that ignore its material can draw
// from baked world positions: drawn now, placed by an identity world matrix
// (each instance matrix is then the whole transform the GPU applies), in the
// default group and mask, with normals, and plain opaque in every submesh --
// no blend, no alpha test (the shadow pass would sample its texture), no depth
// wrapper, no glow. A generated tree and its LOD pool hand their instances
// back and forth as the camera moves (trees.ts), so they are never kit here;
// a generated prop (nature.ts's rocks, ferns, grass: metadata.generatedTree.prop)
// is placed once like any kit piece, and the two passes draw it with their
// own shaders, as they draw the kit (its plugins reach neither).
type KitTemplate = Mesh & { __treeLod?: Mesh; __generatedTree?: boolean };
function flattenable(m: AbstractMesh, pools: ReadonlySet<AbstractMesh>): m is Mesh {
  const mesh = m as KitTemplate;
  if (!(mesh.thinInstanceCount > 0) || m.getClassName() !== "Mesh" || pools.has(m) || mesh.__treeLod || (mesh.__generatedTree && !mesh.metadata?.generatedTree?.prop)) return false;
  if (!m.isEnabled() || !m.isVisible || m.visibility !== 1 || mesh.instances.length || mesh.skeleton || mesh.morphTargetManager || mesh.bakedVertexAnimationManager || mesh.isUnIndexed) return false;
  if (mesh.renderingGroupId !== 0 || mesh.layerMask !== 0x0fffffff || mesh.billboardMode || mesh.infiniteDistance || mesh.onBeforeRenderObservable.hasObservers()) return false;
  if (!mesh.isVerticesDataPresent("normal") || !mesh.computeWorldMatrix(true).isIdentity()) return false;
  return mesh.subMeshes.every((s) => {
    const mt = s.getMaterial();
    return !!mt && /^(StandardMaterial|PBRMaterial)$/.test(mt.getClassName()) && !mt.needAlphaBlendingForMesh(mesh) && !mt.needAlphaTestingForMesh(mesh)
      && !mt.shadowDepthWrapper && !(mt.metadata as { glow?: number } | null)?.glow && mt.fillMode === 0 && !clipped(mt);
  });
}

// The cull state a submesh casts with (ShadowGenerator._renderSubMeshForShadowMap
// sets backFaceCulling, the effective orientation and cullBackFaces, and
// nothing else of the material reaches an opaque draw); "" is two-sided, where
// the orientation decides nothing.
function cullKey(mt: Material, mesh: Mesh): string {
  return mt.backFaceCulling ? `${(mt as Material & { _getEffectiveOrientation(m: Mesh): number })._getEffectiveOrientation(mesh)}|${mt.cullBackFaces}` : "";
}

// The instances and vertices as the GPU has them. The matrices come from the
// float32 buffer the draw binds, not thinInstanceGetWorldMatrices(), which
// keeps whatever Matrix objects the caller handed thinInstanceSetMatrixAt.
// The vertex data is rounded to float32 first: a generated template can keep
// plain float64 arrays on the CPU (the WoodLog does: baked from the doubles,
// 908 of its 11,664 triangles came out an ulp off, up to 3e-5 m, MEASURED).
const f = Math.fround;
function instanceMatrices(m: Mesh): Float32Array {
  return (m as Mesh & { _thinInstanceDataStorage: { matrixData: Float32Array } })._thinInstanceDataStorage.matrixData.subarray(0, m.thinInstanceCount * 16);
}

/**
 * FLATTEN THE KIT. The kit is one thin-instanced template per file, and each
 * spans the city, so every one of them was a draw per submesh in all three
 * shadow cascades and again in the glow pass, at every camera (MEASURED in
 * Heartwood: 59-155 shadow and 42-72 glow draws a camera). Neither pass reads
 * the material beyond what flattenable() and cullKey() test, so both get the
 * instances baked into world space instead, while the originals go on drawing
 * the visible kit exactly as before and go on receiving shadows:
 * - SHADOW-ONLY CASTERS, one per cull mode: positions and the normal the
 *   shadow shader's normal bias uses, as its thin-instance path takes it (the
 *   normal divided by the squared column lengths, turned, normalised), from the
 *   float32 instance matrices in float64, rounded once. layerMask 0x10000000:
 *   the camera (0x0fffffff) and so the glow layer never see it, while a shadow
 *   map with a render list checks no mask (ObjectRenderer, forceLayerMaskCheck
 *   off). Its box is the union of its sources' boxes, so the casters' bounds the
 *   cascades fit their depth range to are unchanged. The originals leave the
 *   caster list.
 * - GLOW COPIES, positions only, one glowOccluderMesh (scene.ts) per `cell` m
 *   square by instance position, for the templates drawsBlack() passes in
 *   every submesh; those originals leave the glow pass. A template `inside`
 *   says is furniture in a roofed room leaves it with no copy: the room's own
 *   occluder stands in.
 * The pass waits for `settled` (Heartwood's flushTown) and then for nothing to
 * be loading, so a later flush in the zone (scene.ts flushes the quay and the
 * border wall after the city) lands first. Afterwards a template whose
 * instance count changes, or a mesh coming or going, runs the pass again,
 * which rebuilds every caster and copy from the templates as they are then.
 * The new meshes need only the effects the hw glow occluders and the hw casters
 * already use (a lit-off StandardMaterial, the non-instanced depth shader). In
 * Heartwood it is one pass, after the border wall and before the first
 * isReady(), which does not drop afterwards (MEASURED 2026-10-06).
 * Everything made belongs to the scene and goes with it.
 */
export function flattenKit(scene: Scene, settled: Promise<void>, opts: { cell?: number; inside?: (m: Mesh) => boolean; tag?: (m: Mesh, role: "shadow" | "glow") => void } = {}): void {
  const cell = opts.cell ?? 96, layer = glow;
  const cast = new Map<Mesh, ShadowGenerator[]>(), dark = new Set<Mesh>(), counts = new Map<Mesh, number>();
  let made: Mesh[] = [], seen = "", armed = false, due = false, building = false;
  const pass = () => {
    const pools = new Set(scene.meshes.map((m) => (m as KitTemplate).__treeLod).filter((m): m is Mesh => !!m));
    const kit = scene.meshes.filter((m): m is Mesh => flattenable(m, pools));
    const sig = kit.map((m) => `${m.uniqueId}:${m.thinInstanceCount}`).join(",");
    if (sig === seen) return;
    seen = sig; building = true;
    for (const m of made) { const mat = m.material; m.dispose(); if (m.name.startsWith("kitshadow_")) mat?.dispose(); }
    made = [];
    // a template that is no longer kit (gone, hidden) gets back what it lost
    for (const [m, gens] of cast) if (!kit.includes(m)) { if (!m.isDisposed()) for (const g of gens) g.addShadowCaster(m, false); cast.delete(m); }
    for (const m of dark) if (!kit.includes(m)) { if (!m.isDisposed()) layer?.removeExcludedMesh(m); dark.delete(m); }
    counts.clear();
    for (const m of kit) counts.set(m, m.thinInstanceCount);
    const gens = scene.lights.flatMap((l) => [...(l.getShadowGenerators?.()?.values() ?? [])]) as ShadowGenerator[];
    // the casters: one per generator and cull mode
    const groups = new Map<string, { gen: ShadowGenerator; key: string; src: Mesh[] }>();
    for (const m of kit) {
      let gs = cast.get(m);
      if (!gs) { gs = gens.filter((g) => g.getShadowMap()?.renderList?.includes(m)); if (gs.length) cast.set(m, gs); }
      for (const gen of gs) for (const key of new Set(m.subMeshes.map((s) => cullKey(s.getMaterial()!, m)))) {
        const k = `${gens.indexOf(gen)}/${key}`;
        (groups.get(k) ?? groups.set(k, { gen, key, src: [] }).get(k)!).src.push(m);
      }
    }
    for (const [k, { gen, key, src }] of groups) {
      let nv = 0, ni = 0;
      for (const m of src) { nv += m.getTotalVertices() * m.thinInstanceCount; for (const s of m.subMeshes) if (cullKey(s.getMaterial()!, m) === key) ni += s.indexCount * m.thinInstanceCount; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
      const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
      let vo = 0, io = 0;
      for (const m of src) {
        const M = instanceMatrices(m), p = m.getVerticesData("position")!, q = m.getVerticesData("normal")!, ix = m.getIndices()!, mv = m.getTotalVertices();
        const subs = m.subMeshes.filter((s) => cullKey(s.getMaterial()!, m) === key), bb = m.getBoundingInfo().boundingBox;
        lo.minimizeInPlace(bb.minimumWorld); hi.maximizeInPlace(bb.maximumWorld);
        for (let o = 0; o < M.length; o += 16) {
          const a = M.subarray(o, o + 16), s0 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2], s1 = a[4] * a[4] + a[5] * a[5] + a[6] * a[6], s2 = a[8] * a[8] + a[9] * a[9] + a[10] * a[10];
          for (let v = 0, w = vo * 3; v < mv; v++, w += 3) {
            const x = f(p[v * 3]), y = f(p[v * 3 + 1]), z = f(p[v * 3 + 2]), u = f(q[v * 3]) / s0, t = f(q[v * 3 + 1]) / s1, r = f(q[v * 3 + 2]) / s2;
            P[w] = x * a[0] + y * a[4] + z * a[8] + a[12]; P[w + 1] = x * a[1] + y * a[5] + z * a[9] + a[13]; P[w + 2] = x * a[2] + y * a[6] + z * a[10] + a[14];
            const nx = u * a[0] + t * a[4] + r * a[8], ny = u * a[1] + t * a[5] + r * a[9], nz = u * a[2] + t * a[6] + r * a[10], l = Math.hypot(nx, ny, nz) || 1;
            N[w] = nx / l; N[w + 1] = ny / l; N[w + 2] = nz / l;
          }
          for (const s of subs) for (let i = s.indexStart, end = s.indexStart + s.indexCount; i < end; i++) I[io++] = ix[i] + vo;
          vo += mv;
        }
      }
      const name = `kitshadow_${k.replace("/", "_")}`, mesh = new Mesh(name, scene), vd = new VertexData();
      vd.positions = P; vd.normals = N; vd.indices = I;
      vd.applyToMesh(mesh);
      const mat = new StandardMaterial(`${name}_m`, scene);
      mat.disableLighting = true;
      mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.Black();
      mat.backFaceCulling = !!key;
      if (key) { const [side, back] = key.split("|"); mat.sideOrientation = +side; mat.cullBackFaces = back === "true"; }
      mesh.material = mat;
      mesh.isPickable = false; mesh.receiveShadows = false;
      mesh.layerMask = 0x10000000;
      mesh.setBoundingInfo(new BoundingInfo(lo, hi));
      mesh.freezeWorldMatrix();
      layer?.addExcludedMesh(mesh);
      gen.addShadowCaster(mesh, false);
      mesh.geometry?.clearCachedData();
      opts.tag?.(mesh, "shadow");
      made.push(mesh);
    }
    for (const [m, gs] of cast) for (const g of gs) g.removeShadowCaster(m, false);
    // the glow stand-ins: positions only, one glowOccluderMesh per cell by
    // instance position. A source `inside` a roofed room (opts.inside) leaves
    // the pass with none: the room's own occluder hides what is behind it.
    if (layer && layer === glow && scene.effectLayers.includes(layer)) {
      const cells = new Map<string, [Mesh, ArrayLike<number>][]>();
      for (const m of kit) {
        if (!dark.has(m) && !(layer.hasMesh(m) && layer.getEffectIntensity(m) === 1 && m.subMeshes.every((s) => drawsBlack(s.getMaterial(), m)))) continue;
        dark.add(m);
        if (opts.inside?.(m)) continue;
        const M = instanceMatrices(m);
        for (let o = 0; o < M.length; o += 16) {
          const a = M.subarray(o, o + 16), k = `${Math.floor(a[12] / cell + 0.5)}_${Math.floor(a[14] / cell + 0.5)}`;
          (cells.get(k) ?? cells.set(k, []).get(k)!).push([m, a]);
        }
      }
      for (const [k, list] of cells) {
        let nv = 0, ni = 0;
        for (const [m] of list) { nv += m.getTotalVertices(); for (const s of m.subMeshes) ni += s.indexCount; }
        const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni);
        let n = 0, w = 0;
        for (const [m, a] of list) {
          const p = m.getVerticesData("position")!, ix = m.getIndices()!, at = new Int32Array(m.getTotalVertices()).fill(-1);
          for (const s of m.subMeshes) for (let i = s.indexStart, end = s.indexStart + s.indexCount; i < end; i++) {
            const v = ix[i];
            if (at[v] < 0) { const x = f(p[v * 3]), y = f(p[v * 3 + 1]), z = f(p[v * 3 + 2]); pos[w * 3] = x * a[0] + y * a[4] + z * a[8] + a[12]; pos[w * 3 + 1] = x * a[1] + y * a[5] + z * a[9] + a[13]; pos[w * 3 + 2] = x * a[2] + y * a[6] + z * a[10] + a[14]; at[v] = w++; }
            idx[n++] = at[v];
          }
        }
        const copy = ni ? glowOccluderMesh(`kitglow_${k}`, pos.slice(0, w * 3), idx) : null;
        if (copy) { opts.tag?.(copy, "glow"); made.push(copy); }
      }
      for (const m of dark) layer.addExcludedMesh(m);
    }
    building = false;
  };
  const touched = () => { if (!building) due = true; };
  scene.onNewMeshAddedObservable.add(touched);
  scene.onMeshRemovedObservable.add(touched);
  scene.onBeforeRenderObservable.add(() => {
    if (!armed) return;
    if (!due) for (const [m, n] of counts) if (m.thinInstanceCount !== n) { due = true; break; }
    if (!due || scene.getWaitingItemsCount()) return;
    due = false;
    pass();
  });
  settled.then(() => { armed = due = true; });
}
