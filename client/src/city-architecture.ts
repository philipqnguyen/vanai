// THE CITY INSTANCER: a planner's pieces (zones/city_pools.ts Piece) into the
// scene as original merged modules, drawn fast. Lifted from
// capital-architecture.ts for the second city (CITY-BUILD.md "Applying it to
// another city" step 4) -- CF-13: lifted, not copied, and the Capital
// byte-identical by zone_fingerprint on both Capital keys and the Burned Land.
// A city configures it with a KIT (createCity): its module directory, its
// material table, its facade sheet(s), LOD distances, cell box, the pools that
// never cast, which glow, and its night. capital-architecture.ts is the
// Capital's kit and keeps every export it had; zones/caerdun_kit.ts holds
// Caerdun's.
//
// PERFORMANCE BY DESIGN (the gate: 600 draws at any camera, every pass
// counted -- main, glow layer, three shadow cascades):
//   * one thin-instanced template per module FILE (a pool), its buffer the
//     pieces whose cells show it now: a file is one draw a pass however many
//     cells hold it, so the city's draws are bounded by its module library;
//   * a bay is one submesh (the facade sheet), not three;
//   * LOD per culling cell by distance, from the camera to the cell's box
//     (the kit's lod1/lod2, or a piece's own; past a piece's `cull`, nothing);
//   * the switch runs in ONE before-render observer per scene over a flat
//     array of every kit's cells, every few frames or once the camera has
//     moved a metre, and re-packs only the pools a changed cell holds;
//   * shadows from the facade (and what the kit lets cast) only, the glow
//     pass only for what glows or hides something that does.
// The modules carry no textures of their own: their materials are bound here
// by name to the kit's sheets, one shared material each per scene and kit --
// except the facade parts, which are ONE material per facade sheet (see "the
// facade"). Everything is a template of models.ts's per-scene cache, disposed
// with the scene; the LOD state and the shared materials forget their scene on
// its disposal (SCENE-LIFETIME.md "Application owners").
import { PBRMaterial, StandardMaterial, MultiMaterial, SubMesh, VertexBuffer, Texture, Color3, Matrix, Quaternion, Vector3, ShadowGenerator, Constants, type Mesh, type Scene, type Material, type GlowLayer } from "@babylonjs/core";
import { scene, buildApi, removeShadowCaster, makeClearWaterMat, dayFrac, glowOccluder } from "./scene";
import { staticTemplateVariant } from "./models";
import { planPools, DEFAULT_SKY, levelFor, glowMembership, mayJoinAtNight, facadeDisagreements, type LodCell, type Piece, type State, type SkyGrid, type Box, type Rect } from "./zones/city_pools";

// ── the kit ─────────────────────────────────────────────────────────────────
/** One library material, bound by name (the manifest's `materials`). */
export interface CityMaterial {
  albedo?: string; color?: string; roughness: number; metallic: number;
  emissive?: string;
  /** a flat night colour: the kit's `night.lamplitFrom` material lights to it */
  emissiveNight?: string;
  /** an emissive sheet, multiplied by the material's emissive colour. Only the
   * kit's `lamplitFrom` material (and a `nightScaled` one) has that colour
   * stepped by the night; on any other the sheet multiplies a constant
   * `emissive` -- black when omitted (never lit), or lit day and night. */
  emissiveTexture?: string;
  /** its emissive colour (`emissive`, white when omitted) scaled by the night
   * amount every night, in every state: a lamp that burns whether or not the
   * city is lived in (Caerdun's lighthouse beam, SG_NIGHT.beam) */
  nightScaled?: boolean;
  /** the facade part it joins (FacadeSpec.parts is what toFacade reads) */
  facade?: string;
  /** false: never in a shadow map (joins the kit's shadowSkip) */
  casts?: boolean;
  /** THE ONE WATER MATERIAL (WATER.md): makeClearWaterMat, opaque, its sky
   * reflection halved -- a basin is a small, shaded surface, not a lake */
  water?: boolean;
  /** blended additively, depth write off (a beam, a lamp core) */
  additive?: boolean;
  unlit?: boolean;
  /** metadata.glow: its bloom strength in the glow layer (scene.ts setupGlow) */
  glow?: number;
  /** the albedo sheet's alpha cuts at this value (leaf cards, Moonmere's
   * MC_Leaf); the shadow maps cut with it. Opaque when omitted, as every
   * Capital and Caerdun material is. */
  alphaTest?: number;
}
/** A stacked facade sheet: the parts it holds and where each lands on it --
 * u' = u su + ou, v' = v sv + ov in glTF UVs (v down). */
export interface FacadeSpec {
  name: string; file: string; rough: string;
  glow: Partial<Record<State, string>>;
  uv: Record<string, [number, number, number, number]>;
  /** library material name -> its part key in `uv` */
  parts: Record<string, string>;
}
/** A material of one file's own (the Capital's crown): made once per scene and
 * kit in place of `material` on that file, and stepped by the night amount. */
export interface CitySpecial { file: string; material: string; make(owner: Scene): Material; night?(n: number, owner: Scene): void }
export interface CityKit {
  /** the material suffix (`CL_Stone#capital`) and the cityStats key */
  id: string;
  /** the template cache key's prefix (`cl:blocks:bay`) */
  prefix: string;
  /** under /models/: the modules and the sheets */
  dir: string;
  /** metadata[metaKey] = the set's tag on every template (the QA cost split); metadata.city = id */
  metaKey: string;
  materials: Record<string, CityMaterial>;
  facades: FacadeSpec[];
  /** metres from the camera to a culling cell's box; stored on each cell, so
   * two kits share one LOD pass (a piece's own `lod` overrides) */
  lod: { lod1: number; lod2: number };
  /** a cell box's height above the floor, and a piece's reach, when it gives none */
  cellHeight: number; reach: number;
  /** how far a piece that gives its own `reach` stands above its origin, when
   * it gives no `height`: the top of its cell's box (default 21, the Capital's
   * walls) */
  reachHeight?: number;
  /** the skyline's batching grid (zones/city_pools.ts); default {96, 0}, the Capital's */
  grid?: SkyGrid;
  /** pool files that never cast (with whatever shows only at LOD2) */
  shadowless: RegExp;
  /** material names (with the #id suffix) that never cast */
  shadowSkip: string[];
  /** template names whose shadows are dropped unless instance() says otherwise */
  rimRock?: RegExp;
  /** of the shadowless files, those kept in the glow pass, per state */
  glows: Partial<Record<State, RegExp | null>>;
  /** the glow pass by set: tags whose casting templates are out of it, and the
   * tags that join it at night in the given states. Ignored when the kit rules
   * by file (glowAlways / glowNightOnly). */
  glowTags: { out: string[]; nightIn: { tag: string; states: State[] }[] };
  /** the glow pass by file: always in / in at night only; everything else out */
  glowAlways?: RegExp; glowNightOnly?: RegExp;
  night: {
    /** the facade's bloom strength per state */
    facadeGlow: Partial<Record<State, number>>;
    /** the material lit to its emissiveNight in `litStates` */
    lamplitFrom?: string;
    litStates: State[];
    /** the night amount from the day fraction; default 1 - clamp(sin(2 pi d) * 2.2) */
    curve?: (dayFrac: number) => number;
  };
  special?: CitySpecial[];
  /** give a tinted pool's template a white COLOR attribute if it has none */
  tintWhite?: boolean;
  /** the kit's own counters (templates and facades are counted here) */
  stats: Record<string, number>;
}
export interface InstanceOpts {
  /** false: the rim rocks keep their shadows (the Burned Land's view of the Capital) */
  rimShadowless?: boolean;
  /** this set's skyline grid, over the kit's */
  grid?: SkyGrid;
}
export interface City {
  readonly kit: CityKit;
  instance(owner: Scene, pieces: Piece[], floor: number, tag: string, state: State, opts?: InstanceOpts): { batches: number; cells: number };
  nightGlow(owner: Scene, state: State): void;
  material(owner: Scene, name: string): Material | null;
  readonly stats: Record<string, number>;
  resetStats(): void;
}
/** Every city's counters by kit id, for the QA harness (zoneview.ts __zv.cityStats). */
export const cityStats: Record<string, Record<string, number>> = {};

// below this a camera move does not re-run the LOD pass; the timer catches
// the rest (the camera can turn without moving, but LOD is by distance only)
const MOVE = 1.0, EVERY = 20;

// ── the LOD state ───────────────────────────────────────────────────────────
// One entry per culling cell: its box, its distances, its level, and the pools
// that hold pieces in it. A POOL is one module file of one set (blocks,
// civic): ONE template, thin-instanced with every piece of that file the city
// holds, whose instance buffer carries only the pieces whose cell shows that
// file now.
//
// It was one template per (file, cell), switched on and off with its cell:
// every variant a cell held was a mesh, and every mesh is a draw in the main
// pass, again in the glow layer's and again per shadow cascade -- 2,031 draws
// at the Capital's gate court against a 600 budget, a third of them the
// blocks, for 22 of the city's ~120 houses (MEASURED, the perf gate). Pooled,
// a file costs one draw whatever number of cells show it, so the district's
// draws are bounded by its module library, not by its size: the rest of the
// city adds instances, not draws. What it gives up is per-cell frustum
// culling, which in a walled city mostly culled nothing; a pool's box is what
// it shows (a LOD0 pool's is the few cells near the camera), so cascades and
// the camera still cull it.
//
// ONE state per scene, whatever kits build in it: the cells carry their own
// distances, so the pass needs no kit, and a scene has one observer for all.
interface Cell extends LodCell { key: string; level: number; pools: Pool[] }
interface Pool {
  file: string;
  /** per piece: its cell's index in lod.cells, -1 for the skyline (always shown) */
  cell: Int32Array;
  /** per piece: the LOD levels it shows at (bit 0 = LOD0 ...) */
  mask: Uint8Array;
  /** per piece: world matrix and instance colour (null when nothing is tinted) */
  mats: Float32Array; cols: Float32Array | null;
  /** the instance buffers, at capacity: the shown pieces packed at the front */
  buf: Float32Array; cbuf: Float32Array | null;
  mesh: Mesh | null; dirty: boolean;
}
let lod: { owner: Scene; cells: Cell[]; dirty: Pool[]; lastX: number; lastZ: number; frame: number } | null = null;

// (levelFor, the level a cell shows from a camera, is zones/city_pools.ts's,
// where the node test holds it)
// Pack the pieces a pool shows now to the front of its buffers, upload them and
// fit its box to them. Runs only for the pools a level change touched.
function refill(p: Pool, cells: Cell[]): void {
  p.dirty = false;
  const m = p.mesh;
  if (!m || m.isDisposed()) return;
  let k = 0;
  for (let i = 0; i < p.mask.length; i++) {
    const ci = p.cell[i];
    // a cell with no level yet (no camera at build) shows its nearest
    if (ci >= 0 && !(p.mask[i] & (1 << Math.max(0, cells[ci].level)))) continue;
    p.buf.set(p.mats.subarray(i * 16, i * 16 + 16), k * 16);
    if (p.cbuf && p.cols) p.cbuf.set(p.cols.subarray(i * 4, i * 4 + 4), k * 4);
    k++;
  }
  // A pool with nothing to show is DISABLED, never left at zero instances. At
  // zero a thin-instanced mesh stops counting as instanced (hasThinInstances is
  // the count), so its material compiles without INSTANCES -- but Babylon's
  // INSTANCESCOLOR define is only ever set, never cleared (materialHelper
  // PrepareDefinesForAttributes), and a tinted pool then compiled
  // `vColor *= instanceColor` with no instanceColor attribute: "undeclared
  // identifier", and scene.isReady() -- which checks disabled meshes too --
  // false for good (MEASURED, m1/fly.mjs: every lod2_* card and LOD1 bay pool
  // emptied by a camera 60 m up). One stale instance kept and the mesh off
  // draws nothing and keeps the one instanced effect it always had.
  m.thinInstanceCount = Math.max(1, k);
  m.setEnabled(k > 0);
  if (!k) return;
  m.thinInstanceBufferUpdated("matrix");
  if (p.cbuf) m.thinInstanceBufferUpdated("color");
  m.thinInstanceRefreshBoundingInfo(false);
}
function lodPass(force: boolean): void {
  if (!lod || lod.owner !== scene) return;
  const cam = scene.activeCamera;
  if (!cam) return;
  const p = cam.globalPosition;
  lod.frame++;
  const moved = Math.abs(p.x - lod.lastX) + Math.abs(p.z - lod.lastZ) > MOVE;
  if (!force && !moved && lod.frame % EVERY !== 0) return;
  lod.lastX = p.x; lod.lastZ = p.z;
  for (const c of lod.cells) {
    const l = levelFor(c, p.x, p.y, p.z);
    if (l === c.level) continue;
    c.level = l;
    for (const pool of c.pools) if (!pool.dirty) { pool.dirty = true; lod.dirty.push(pool); }
  }
  for (const pool of lod.dirty) refill(pool, lod.cells);
  lod.dirty.length = 0;
}
function lodState(owner: Scene): NonNullable<typeof lod> {
  if (lod && lod.owner === owner) return lod;
  const state = { owner, cells: [] as Cell[], dirty: [] as Pool[], lastX: Infinity, lastZ: Infinity, frame: 0 };
  lod = state;
  owner.onBeforeRenderObservable.add(() => lodPass(false));
  owner.onDisposeObservable.addOnce(() => { if (lod === state) lod = null; });
  return state;
}

// ── the glow layer ──────────────────────────────────────────────────────────
function glowLayerOf(owner: Scene): GlowLayer | null {
  for (const layer of owner.effectLayers) if (layer.name === "glow") return layer as GlowLayer;
  return null;
}
function setGlowMember(owner: Scene, t: Mesh, member: boolean): void {
  const layer = glowLayerOf(owner);
  if (!layer) return;
  if (member) layer.removeExcludedMesh(t); else layer.addExcludedMesh(t);
}

/** A city's instancer over its kit. Every cache below is this kit's, per scene. */
export function createCity(kit: CityKit): City {
  const S = kit.stats, ID = kit.id;
  cityStats[ID] = S;
  // the facade part is named twice (CityMaterial.facade, FacadeSpec.parts) and
  // the merge reads only the second: a drift between them is a material that
  // silently keeps its own sheet, so a dev build refuses the kit
  if (import.meta.env.DEV) {
    const bad = facadeDisagreements(kit.materials, kit.facades);
    if (bad.length) throw new Error(`${ID}: the kit's facade parts disagree: ${bad.join("; ")}`);
  }

  // ── materials ─────────────────────────────────────────────────────────────
  const materialCache = new WeakMap<Scene, Map<string, Material>>();
  const sheet = (owner: Scene, file: string): Texture => {
    // glTF's UV origin is top-left: the sheets load unflipped (manifest "uv")
    const t = new Texture(`/models/${kit.dir}/${file}`, owner, false, false);
    t.anisotropicFilteringLevel = 8;
    return t;
  };
  function material(owner: Scene, name: string): Material | null {
    const spec = kit.materials[name];
    if (!spec) return null;
    let perScene = materialCache.get(owner);
    if (!perScene) { perScene = new Map(); materialCache.set(owner, perScene); }
    const had = perScene.get(name);
    if (had) return had;
    if (spec.water) {
      const w = makeClearWaterMat(`${name}#${ID}`, spec.color!, 1, 0.5);
      perScene.set(name, w);
      return w;
    }
    const m = new PBRMaterial(`${name}#${ID}`, owner);
    if (spec.albedo) {
      m.albedoTexture = sheet(owner, spec.albedo);
      m.albedoColor = Color3.White();
      if (spec.alphaTest !== undefined) {
        m.albedoTexture.hasAlpha = true;
        m.useAlphaFromAlbedoTexture = true;
        m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
        m.alphaCutOff = spec.alphaTest;
      }
    } else {
      m.albedoColor = Color3.FromHexString(spec.color!).toLinearSpace();
    }
    if (spec.emissive) m.emissiveColor = Color3.FromHexString(spec.emissive);
    if (spec.emissiveTexture) m.emissiveTexture = sheet(owner, spec.emissiveTexture);
    m.roughness = spec.roughness;
    m.metallic = spec.metallic;
    // single-sided by design (manifest "backFaceCulling"): two-sided parts carry their own backs
    m.backFaceCulling = true;
    if (spec.unlit) m.unlit = true;
    if (spec.additive) {
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.alphaMode = Constants.ALPHA_ADD;
      m.disableDepthWrite = true;
    }
    if (spec.glow !== undefined) m.metadata = { ...(m.metadata ?? {}), glow: spec.glow };
    perScene.set(name, m);
    return m;
  }

  // ── the facade ────────────────────────────────────────────────────────────
  // THE ONE FACADE MATERIAL. A bay is stone, glass and joinery, and as three
  // materials it was three submeshes: three draws in the main pass and three
  // in the glow layer's, per template, whatever else was done (MEASURED, the
  // Capital's perf gate: 75 of the blocks' 93 main-pass draws at the gate
  // court, pooled). The painter stacks the part sheets into one; here each
  // part's UVs move into its place on it when its template loads, its
  // triangles join one submesh, and the one material draws them all. Their
  // roughness is the facade's roughness sheet, so nothing about a surface but
  // its draw changes. The modules keep their own UVs and materials: the
  // builder is untouched. A kit may stack more than one sheet (Moonmere's
  // request 5): a module's parts then group by sheet, one submesh each.
  //
  // Until a template is converted its parts wear PLACEHOLDERS (one plain
  // material per part, never drawn: a template is hidden until its instances
  // arrive). The part sheets exist only on the facade.
  const partOf: Record<string, { f: number; code: number; uv: [number, number, number, number] }> = {};
  let codeCount = 0;
  kit.facades.forEach((fs, f) => {
    for (const [mat, part] of Object.entries(fs.parts)) partOf[mat] = { f, code: codeCount++, uv: fs.uv[part] };
  });
  const partCache = new WeakMap<Scene, Map<string, Material>>();
  function partMarker(owner: Scene, base: string): Material {
    let perScene = partCache.get(owner);
    if (!perScene) { perScene = new Map(); partCache.set(owner, perScene); }
    let m = perScene.get(base);
    if (!m) { m = new StandardMaterial(`${base}#part`, owner); perScene.set(base, m); }
    return m;
  }
  const facadeCache = new WeakMap<Scene, PBRMaterial[]>();
  function facadeMaterial(owner: Scene, f: number): PBRMaterial {
    let perScene = facadeCache.get(owner);
    if (!perScene) { perScene = []; facadeCache.set(owner, perScene); }
    let m = perScene[f];
    if (m) return m;
    const spec = kit.facades[f];
    m = new PBRMaterial(`${spec.name}#${ID}`, owner);
    m.albedoTexture = sheet(owner, spec.file);
    m.albedoColor = Color3.White();
    // the roughness sheet (G), every part's own value; nothing is metal
    m.metallicTexture = sheet(owner, spec.rough);
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = false;
    m.useAmbientOcclusionFromMetallicTextureRed = false;
    m.roughness = 1;
    m.metallic = 0;
    m.backFaceCulling = true;
    perScene[f] = m;
    return m;
  }
  /** A loaded template's facade parts into their facade(s): UVs moved,
   * triangles regrouped (each facade's in sheet order, then each other part's),
   * one submesh per facade. False, with each part in its flat ground colour
   * (the material's `color`) and a warning, if the parts share vertices (they
   * never do: the loader merges one mesh per material). */
  function toFacade(owner: Scene, t: Mesh): boolean {
    const subs = t.material instanceof MultiMaterial ? t.material.subMaterials : [t.material];
    const nameOf = (m: Material | null | undefined) => (m?.name ?? "").split("#")[0];
    const part = (i: number) => partOf[nameOf(subs[i] ?? subs[0])];
    const sms = t.subMeshes.slice();
    if (!sms.some((sm) => part(sm.materialIndex))) return true;
    const uv = t.getVerticesData(VertexBuffer.UVKind), idx = t.getIndices();
    const putBack = () => {
      if (t.material instanceof MultiMaterial) t.material.subMaterials = subs.map((m) => (m && partOf[nameOf(m)] ? material(owner, nameOf(m)) : m));
      else if (t.material && partOf[nameOf(t.material)]) t.material = material(owner, nameOf(t.material));
      console.warn(`${ID}: ${t.name} kept its facade parts' own materials, flat (its parts share vertices)`);
      return false;
    };
    if (!uv || !idx) return putBack();
    // per vertex: the part code it belongs to, codeCount for a non-facade part
    const owned = new Int16Array(t.getTotalVertices()).fill(-1);
    for (const sm of sms) {
      const p = part(sm.materialIndex), code = p ? p.code : codeCount;
      for (let v = sm.verticesStart; v < sm.verticesStart + sm.verticesCount; v++) {
        if (owned[v] !== -1 && owned[v] !== code) return putBack();
        owned[v] = code;
      }
    }
    const map: [number, number, number, number][] = [];
    for (const p of Object.values(partOf)) map[p.code] = p.uv;
    for (let v = 0; v < owned.length; v++) {
      if (owned[v] < 0 || owned[v] >= codeCount) continue;
      const [su, ou, sv, ov] = map[owned[v]];
      uv[2 * v] = uv[2 * v] * su + ou;
      uv[2 * v + 1] = uv[2 * v + 1] * sv + ov;
    }
    t.setVerticesData(VertexBuffer.UVKind, uv, false);
    const fronts: number[][] = kit.facades.map(() => []), rest: { mat: Material | null; vs: number; vc: number; tris: number[] }[] = [];
    for (const sm of sms) {
      const tris = Array.from(idx.slice(sm.indexStart, sm.indexStart + sm.indexCount) as ArrayLike<number>);
      const p = part(sm.materialIndex);
      // (a loop, not push(...tris): the Capital palace's shell is ~330k
      // indices, past what a spread can pass as arguments -- MEASURED, a stack
      // overflow)
      if (p) { const front = fronts[p.f]; for (const i of tris) front.push(i); }
      else rest.push({ mat: subs[sm.materialIndex] ?? null, vs: sm.verticesStart, vc: sm.verticesCount, tris });
    }
    const used = fronts.map((tris, f) => ({ f, tris })).filter((g) => g.tris.length);
    const all = ([] as number[]).concat(...used.map((g) => g.tris), ...rest.map((r) => r.tris));
    t.setIndices(all, t.getTotalVertices());
    t.releaseSubMeshes();
    let at = 0;
    used.forEach((g, i) => { new SubMesh(i, 0, t.getTotalVertices(), at, g.tris.length, t); at += g.tris.length; });
    if (used.length === 1 && !rest.length) { t.material = facadeMaterial(owner, used[0].f); return true; }
    const mm = new MultiMaterial(`${t.name}#facade`, owner);
    mm.subMaterials = [...used.map((g) => facadeMaterial(owner, g.f)), ...rest.map((r) => r.mat)];
    rest.forEach((r, i) => { new SubMesh(used.length + i, r.vs, r.vc, at, r.tris.length, t); at += r.tris.length; });
    t.material = mm;
    return true;
  }

  // ── shadows ───────────────────────────────────────────────────────────────
  // Only the facade (and whatever else the kit lets cast) casts: a material
  // in shadowSkip is skipped per submesh by ShadowGenerator's hook, chained
  // onto whatever the scene's generator already allows, once each per kit.
  const stoneOnly = new WeakSet<object>();
  const skip = new Set([...kit.shadowSkip, ...Object.entries(kit.materials).filter(([, m]) => m.casts === false).map(([n]) => `${n}#${ID}`)]);
  // the hook runs per submesh, per cascade, per frame: the name is tested once a mesh
  const rimMesh = new WeakMap<object, boolean>();
  const isRim = (m: { name: string }) => {
    let r = rimMesh.get(m);
    if (r === undefined) rimMesh.set(m, r = !!kit.rimRock?.test(m.name));
    return r;
  };
  function stoneShadowsOnly(owner: Scene, rim: boolean): void {
    for (const light of owner.lights) {
      const gens = (light as { getShadowGenerators?: () => Map<unknown, ShadowGenerator> | null }).getShadowGenerators?.();
      if (!gens) continue;
      for (const g of gens.values()) {
        if (!(g instanceof ShadowGenerator) || stoneOnly.has(g)) continue;
        stoneOnly.add(g);
        const prev = g.customAllowRendering;
        g.customAllowRendering = rim && kit.rimRock
          ? (sm: SubMesh) => !skip.has(sm.getMaterial()?.name ?? "") && !isRim(sm.getMesh()) && (!prev || prev(sm))
          : (sm: SubMesh) => !skip.has(sm.getMaterial()?.name ?? "") && (!prev || prev(sm));
      }
    }
  }

  // ── night ─────────────────────────────────────────────────────────────────
  // NIGHT IS MATERIALS, NOT LIGHTS (the Safari budget): one emissive sheet per
  // facade per state, the lamplit material's flat night colour in the lit
  // states, the night-scaled lamps in every state, and the kit's special
  // materials, all from one night amount, every
  // frame but only on a change. The glow layer blooms it (metadata.glow,
  // scene.ts setupGlow). The templates that glow only at night (by tag or by
  // file) join the glow pass while it is lit.
  const lamplit = kit.night.lamplitFrom ? kit.materials[kit.night.lamplitFrom] : undefined;
  const LAMPLIT = lamplit?.emissiveNight ? Color3.FromHexString(lamplit.emissiveNight) : null;
  const curve = kit.night.curve ?? ((d: number) => 1 - Math.min(1, Math.max(0, Math.sin(d * Math.PI * 2) * 2.2)));
  let night: { owner: Scene; living: boolean; last: number; lit: boolean; nightOnly: Mesh[] } | null = null;
  function nightGlow(owner: Scene, state: State): void {
    const living = kit.night.litStates.includes(state);
    if (night && night.owner === owner) { night.living = living; night.last = -1; return; }
    const st = { owner, living, last: -1, lit: false, nightOnly: [] as Mesh[] };
    night = st;
    const facades = kit.facades.map((_, f) => facadeMaterial(owner, f));
    const glow = kit.night.lamplitFrom ? (material(owner, kit.night.lamplitFrom) as PBRMaterial | null) : null;
    facades.forEach((facade, f) => {
      const file = kit.facades[f].glow[state];
      if (file) facade.emissiveTexture = sheet(owner, file);
      facade.emissiveColor.set(0, 0, 0);
      facade.metadata = { ...(facade.metadata ?? {}), glow: kit.night.facadeGlow[state] };
    });
    if (glow) glow.metadata = { ...(glow.metadata ?? {}), glow: lamplit?.glow ?? 1.0 };
    // the night-scaled lamps (none in the Capital): their full colour, stepped below
    const scaled: { m: PBRMaterial; c: Color3 }[] = [];
    for (const [name, spec] of Object.entries(kit.materials)) {
      const m = spec.nightScaled ? material(owner, name) : null;
      if (m instanceof PBRMaterial) scaled.push({ m, c: Color3.FromHexString(spec.emissive ?? "#ffffff") });
    }
    owner.onBeforeRenderObservable.add(() => {
      if (night !== st) return;
      const n = curve(dayFrac());
      if (Math.abs(n - st.last) < 0.01 && (n > 0 || st.last === 0)) return;
      st.last = n;
      for (const facade of facades) facade.emissiveColor.set(n, n, n);
      for (const s of scaled) s.m.emissiveColor.set(s.c.r * n, s.c.g * n, s.c.b * n);
      for (const sp of kit.special ?? []) sp.night?.(n, owner);
      const g = st.living ? n : 0;
      if (glow && LAMPLIT) glow.emissiveColor.set(LAMPLIT.r * g, LAMPLIT.g * g, LAMPLIT.b * g);
      if ((g > 0) !== st.lit) {
        st.lit = g > 0;
        for (const t of st.nightOnly) if (!t.isDisposed()) setGlowMember(owner, t, st.lit);
      }
    });
    owner.onDisposeObservable.addOnce(() => { if (night === st) night = null; });
  }

  // ── special materials ─────────────────────────────────────────────────────
  const specialCache = new WeakMap<Scene, Map<string, Material>>();
  function special(owner: Scene, sp: CitySpecial): Material {
    let perScene = specialCache.get(owner);
    if (!perScene) { perScene = new Map(); specialCache.set(owner, perScene); }
    let m = perScene.get(sp.file);
    if (m) return m;
    m = sp.make(owner);
    perScene.set(sp.file, m);
    // made after the night pass last ran (a later set holds it): run it again
    if (night && night.owner === owner) night.last = -1;
    return m;
  }

  // ── the instancer ─────────────────────────────────────────────────────────
  // A set of pieces into the scene: one LOD cell per culling cell (its box the
  // reach of what it holds), one pooled template per module file (planPools),
  // shadows and the glow pass only for what earns them. Returns the template
  // and cell counts.
  function instance(owner: Scene, pieces: Piece[], floor: number, tag: string, state: State, opts: InstanceOpts = {}): { batches: number; cells: number } {
    const rimShadowless = opts.rimShadowless ?? true;
    // a set that can join the glow pass at night needs the night state before
    // its templates land (they join it as they arrive): a glue that never
    // called nightGlow, or called it after an await, would otherwise lose every
    // lit window from the pass without a word. The Capital always calls it
    // first (buildCapitalBlocks), so this never runs there.
    if (mayJoinAtNight(kit, tag, state) && !(night && night.owner === owner)) nightGlow(owner, state);
    const L = lodState(owner);
    // a piece with distances of its own is in a cell of its own distances
    const keyOf = (p: Piece) => (p.lod ? `${p.cell}@${p.lod.lod1}/${p.lod.lod2}/${p.lod.cull ?? ""}` : p.cell);
    const cells = new Map<string, number>();
    for (const p of pieces) {
      if (!p.lods && !p.near && !p.mask && !p.lod) continue;   // the skyline: in no cell
      const key = keyOf(p);
      let ci = cells.get(key);
      if (ci === undefined) {
        ci = L.cells.length;
        const own = p.lod ?? kit.lod;
        L.cells.push({ key: p.cell, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: floor, y1: floor + kit.cellHeight, level: -1, pools: [],
          lod1: own.lod1, lod2: own.lod2, cull: p.lod?.cull ?? Infinity });
        cells.set(key, ci);
      }
      // the box the LOD distance is measured to: the piece's own reach, a bay
      // being at most 14 m deep from its origin (a bastion, the gate: their own)
      const c = L.cells[ci], r = p.reach ?? kit.reach;
      c.x0 = Math.min(c.x0, p.x - r); c.x1 = Math.max(c.x1, p.x + r);
      c.z0 = Math.min(c.z0, p.z - r); c.z1 = Math.max(c.z1, p.z + r);
      // a wall on a terrace stands up off the floor; the houses' cells keep their box
      if (p.reach !== undefined) { c.y0 = Math.min(c.y0, floor + p.y); c.y1 = Math.max(c.y1, floor + p.y + (p.height ?? kit.reachHeight ?? 21)); }
    }
    const plan = planPools({ pieces }, opts.grid ?? kit.grid ?? DEFAULT_SKY);
    stoneShadowsOnly(owner, rimShadowless);
    const restyle = (m: Material): Material => {
      const base = m.name.split("#")[0].split(".")[0];
      return partOf[base] ? partMarker(owner, base) : material(owner, base) ?? m;
    };
    for (const pp of plan) {
      const n = pp.pieces.length;
      const pool: Pool = {
        file: pp.file, cell: new Int32Array(n), mask: new Uint8Array(n),
        mats: new Float32Array(n * 16), cols: null, buf: new Float32Array(n * 16), cbuf: null, mesh: null, dirty: false,
      };
      const tinted = pp.pieces.some((x) => x.piece.tint);
      if (tinted) { pool.cols = new Float32Array(n * 4).fill(1); pool.cbuf = new Float32Array(n * 4).fill(1); }
      const tmp = new Matrix();
      pp.pieces.forEach(({ piece: p, mask, lod: switches }, i) => {
        Matrix.ComposeToRef(p.axes ? new Vector3(p.axes[0], p.axes[1], p.axes[2]) : Vector3.One(),
          Quaternion.RotationYawPitchRoll(p.yaw, 0, 0), new Vector3(p.x, floor + p.y, p.z), tmp);
        tmp.copyToArray(pool.mats, i * 16);
        if (p.tint && pool.cols) pool.cols.set([p.tint[0], p.tint[1], p.tint[2], 1], i * 4);
        pool.mask[i] = mask;
        const ci = switches ? cells.get(keyOf(p)) : undefined;
        pool.cell[i] = ci ?? -1;
        if (ci !== undefined && !L.cells[ci].pools.includes(pool)) L.cells[ci].pools.push(pool);
      });
      // the set's tag in the key: a file two sets place (a skyline piece, a
      // bay the Hall reuses) is one template per set, each with its own buffers;
      // a special file's named material is its own (the Capital's crown)
      const sp = kit.special?.find((s) => s.file === pp.file);
      const styleOf = sp
        ? (m: Material) => (m.name.split("#")[0].split(".")[0] === sp.material ? special(owner, sp) : restyle(m))
        : restyle;
      staticTemplateVariant(`${kit.dir}/${pp.file}.glb`, `${kit.prefix}:${tag}:${pp.file}`, styleOf).then((t) => {
        if (!t || owner !== scene || owner.isDisposed || t.isDisposed()) return;
        if (toFacade(owner, t)) S.facades++;
        // a tinted pool multiplies its instance colour into the vertex colour:
        // with no COLOR attribute Babylon drops it (Moonmere's request 1)
        if (kit.tintWhite && pool.cbuf && !t.getVerticesData(VertexBuffer.ColorKind)) {
          t.setVerticesData(VertexBuffer.ColorKind, new Float32Array(t.getTotalVertices() * 4).fill(1), false);
        }
        // baked occlusion in the vertex colour (manifest "vertexColor")
        t.useVertexColors = true;
        t.hasVertexAlpha = false;
        // which set it is, for the QA harness's cost split (blocks, civic), and whose
        t.metadata = { ...(t.metadata ?? {}), [kit.metaKey]: tag, city: ID };
        // at capacity, updatable; the box is refill's, over what is shown
        t.doNotSyncBoundingInfo = true;
        t.thinInstanceSetBuffer("matrix", pool.buf, 16, false);
        if (pool.cbuf) t.thinInstanceSetBuffer("color", pool.cbuf, 4, false);
        t.doNotSyncBoundingInfo = false;
        t.isVisible = true;
        t.freezeWorldMatrix();
        pool.mesh = t;
        refill(pool, L.cells);
        // SHADOWS: three cascades draw every caster again, so only what casts
        // a shadow anyone sees does: not what shows only at LOD2 (past 140 m,
        // beyond the cascades' 150 m reach once its box is counted), and not
        // the kit's shadowless files (the dressing, the small returns, what
        // stands in another's shade).
        const shadowless = !(pp.mask & 0b011) || kit.shadowless.test(pp.file);
        if (shadowless) removeShadowCaster(t);
        // THE GLOW PASS: what casts no shadow hides nothing worth a draw there
        // either -- but what glows itself stays to bloom. By set (the
        // Capital) or by file (Caerdun): zones/city_pools.ts glowMembership.
        const { member, nightOnly } = glowMembership(kit, pp.file, tag, state, shadowless);
        setGlowMember(owner, t, member);
        if (nightOnly && night && night.owner === owner) {
          night.nightOnly.push(t);
          if (night.lit) setGlowMember(owner, t, true);
        }
        S.templates++;
      });
    }
    // the cells' first levels, from wherever the camera stands now
    L.lastX = Infinity;
    lodPass(true);
    return { batches: plan.length, cells: cells.size };
  }

  return {
    kit, instance, nightGlow, material, stats: S,
    // a zone's build starts it from nothing: a Capital -> Burned Land trip kept
    // the Capital's houses, tables and kerbs on the view's count, which the QA
    // scripts read (the M3 review)
    resetStats() { for (const k of Object.keys(S)) S[k] = 0; },
  };
}

// ── solids ──────────────────────────────────────────────────────────────────
// The planner-output shapes buildSolids takes (the Capital's walls' shapes,
// zones/capital_walls.ts): a deck or disc is a walkable floor at world height
// y with holes cut through it, a flight walks from (x0, z0, y0) up to
// (x1, z1, y1), a room keeps the follow camera inside it, an occluder is a box
// in the glow pass.
export interface Obb { cx: number; cz: number; hx: number; hz: number; yaw: number }
export interface Deck { cx: number; cz: number; hx: number; hz: number; yaw: number; y: number; holes?: Obb[] }
export interface Disc { cx: number; cz: number; r: number; y: number; holes?: Obb[] }
/** `thickness` undefined is solid to the ground */
export interface Flight { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number; thickness?: number }
export interface Room { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export interface Occluder { cx: number; cz: number; hx: number; hz: number; yaw?: number; y0: number; y1: number }
/**
 * The planner-output half of a city's build: colliders (Box heights above
 * `floor`, as the pieces'), decks, discs, flights (a ramp to walk and a stair
 * body to be solid beside, and with no thickness under, it -- MEASURED in the
 * Capital: with the body alone a flight was a wall to a walker), camera rooms,
 * footprints (the meadow kept off, the map drawn) and one glow occluder mesh
 * for the lot, named `occluderName`. Decks', discs', flights', rooms' and
 * occluders' heights are world heights. The Capital's walls build through it
 * (capital-architecture.ts buildCapitalWalls), so the fingerprint holds it.
 */
export function buildSolids(s: { boxes?: Box[]; decks?: Deck[]; discs?: Disc[]; flights?: Flight[]; rooms?: Room[]; footprints?: Rect[]; occluders?: Occluder[] },
  floor: number, occluderName?: string): void {
  for (const bx of s.boxes ?? []) buildApi.addBoxCollider(bx.cx, bx.cz, bx.hx, bx.hz, bx.yaw ?? 0, floor + bx.y1, bx.y0 === undefined ? -1e9 : floor + bx.y0);
  const obbs = (hs: Obb[] = []) => hs.map((h) => buildApi.obb(h.cx, h.cz, h.hx, h.hz, h.yaw));
  for (const d of s.decks ?? []) buildApi.addDeck(d.cx, d.cz, d.hx, d.hz, d.yaw, d.y, obbs(d.holes));
  for (const d of s.discs ?? []) buildApi.addDisc(d.cx, d.cz, d.r, d.y, obbs(d.holes));
  for (const f of s.flights ?? []) {
    buildApi.addRamp(f.x0, f.z0, f.y0, f.x1, f.z1, f.y1, f.half);
    buildApi.addStairBody(f.x0, f.z0, f.y0, f.x1, f.z1, f.y1, f.half, f.thickness);
  }
  for (const r of s.rooms ?? []) buildApi.addCameraRoom({ ...buildApi.obb(r.cx, r.cz, r.hx, r.hz, r.yaw), y0: r.y0, y1: r.y1 });
  for (const [x0, z0, x1, z1] of s.footprints ?? []) buildApi.footprint((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  if (occluderName) glowOccluder(occluderName, s.occluders ?? []);
}
