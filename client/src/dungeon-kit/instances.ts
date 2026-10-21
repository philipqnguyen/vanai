// Dungeon kit v2: thin-instanced pools that follow the room culler.
//
// One mesh per pool (a prop file, the flame cards, the light pools) is ONE
// draw however many rooms it dresses. Each instance belongs to a group; when
// the culler's visible set changes, the pool repacks only the visible
// instances to the front of its buffer, sets the count, and re-uploads, so a
// prop in a room you cannot see is never drawn and the pool's bounding box
// shrinks to what is drawn (frustum culling still works on it). Repacking
// happens only on a visibility change, never per frame.
//
// Babylon traps (RULINGS.md): thin-instance buffers live on the GEOMETRY, so
// each pool owns its geometry (makeGeometryUnique when a template could be
// shared); thinInstanceCount is set BEFORE the reused buffer is re-uploaded.
import '@babylonjs/loaders/glTF';
import { Color3, Constants, RawTexture, Texture, LoadAssetContainerAsync, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { hexRgb, resolveSwap, type DPropIndex, type SwapResult, type V3 } from './props-swap.ts';
import dpropIndexJson from './dprops-index.json';
import { natureTemplate } from './props-nature.ts';

export interface PoolInstance { group: string; m: Float32Array; far: boolean; c?: [number, number, number] }

/** The visibility a pool is told about: which groups are drawn, and which of
 * those are at full detail (near). Props marked `small` vanish in far rooms. */
export interface VisState { visible: ReadonlySet<string>; near: ReadonlySet<string> }

/** Which rooms a pool draws its instances in: 'both' (near rooms, and far rooms
 * for `far` instances), 'near' only, or 'far' only (`far` instances in rooms
 * drawn at the far LOD): a prop with a far mesh is two pools, 'near' + 'far'. */
export type PoolMode = 'both' | 'near' | 'far';

export class GroupedInstances {
  private list: PoolInstance[] = [];
  private buf: Float32Array | null = null;
  private cbuf: Float32Array | null = null;
  constructor(readonly mesh: Mesh, readonly mode: PoolMode = 'both') {}
  get count(): number { return this.list.length; }
  /** `far` true keeps the instance in far (LOD) rooms too: big pieces only.
   * `c` an instance colour (multiplies the material); pools with none upload none */
  add(group: string, m: Matrix | Float32Array, far = false, c?: [number, number, number]): void {
    const a = m instanceof Matrix ? new Float32Array(m.asArray()) : m;
    this.list.push({ group, m: a, far, c });
  }
  /** first upload, everything; then update() decides */
  upload(): void {
    if (!this.list.length) { this.mesh.setEnabled(false); return; }
    this.buf = new Float32Array(this.list.length * 16);
    this.list.forEach((x, i) => this.buf!.set(x.m, i * 16));
    this.mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
    if (this.list.some((x) => x.c)) {
      this.cbuf = new Float32Array(this.list.length * 4);
      this.list.forEach((x, i) => this.cbuf!.set([...(x.c ?? [1, 1, 1]), 1], i * 4));
      this.mesh.thinInstanceSetBuffer('color', this.cbuf, 4, false);
    }
    this.mesh.isVisible = true;
    this.mesh.thinInstanceRefreshBoundingInfo(false);
  }
  private shown(x: PoolInstance, v: VisState): boolean {
    if (!v.visible.has(x.group)) return false;
    const near = v.near.has(x.group);
    return this.mode === 'near' ? near : this.mode === 'far' ? !near && x.far : near || x.far;
  }
  update(v: VisState | null): number {
    if (!this.buf) return 0;
    let k = 0;
    for (const x of this.list) {
      if (v ? !this.shown(x, v) : this.mode === 'far') continue;
      this.buf.set(x.m, k * 16);
      if (this.cbuf) { const c = x.c ?? [1, 1, 1]; this.cbuf[k * 4] = c[0]; this.cbuf[k * 4 + 1] = c[1]; this.cbuf[k * 4 + 2] = c[2]; this.cbuf[k * 4 + 3] = 1; }
      k++;
    }
    if (!k) { this.mesh.setEnabled(false); return 0; }
    this.mesh.setEnabled(true);
    this.mesh.thinInstanceCount = k;        // before the re-upload (trap)
    this.mesh.thinInstanceBufferUpdated('matrix');
    if (this.cbuf) this.mesh.thinInstanceBufferUpdated('color');
    this.mesh.thinInstanceRefreshBoundingInfo(false);
    return k;
  }
}

/** Compose a world matrix: position, yaw (Babylon rotation.y), uniform or per-axis scale. */
export function placeMatrix(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx): Matrix {
  return Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(x, y, z));
}

// ---------------------------------------------------------------- props
export interface PropPlacement {
  file: string; group: string; x: number; y: number; z: number; yaw?: number; scale?: number; far?: boolean;
  /** draw this CC0 file as itself even when the swap table replaces it (the prop sheet's "old" column) */
  raw?: boolean;
}

/**
 * Props as thin-instanced pools, one draw per file (or per original prop).
 *
 * CC0 templates are built the way models.ts buildStaticTemplate builds the
 * game's (every mesh's transform baked relative to the glTF root, the root's
 * handedness flip left out so winding holds, merged, own geometry), but from
 * the scene it is given, so the kit's demo page needs no game scene.
 *
 * ORIGINAL props (DUNGEON-PROPS.md): a placement whose
 * file the swap index names (props-swap.ts) draws the original prop instead,
 * from its family's pack GLB (/models/dprops/<pack>.glb, read here, not
 * through the glTF loader) on the ONE shared atlas material. A prop with a far
 * mesh is two pools: the near mesh in near rooms, the far mesh for `far`
 * placements in far rooms. `dp:<id>` as a file places an original by id.
 */
export class PropPools {
  readonly pools = new Map<string, GroupedInstances>();
  private pending: PropPlacement[] = [];
  /** `theme` is the ThemePreset key: it picks the per-theme instance tints */
  constructor(readonly scene: Scene, readonly root = '/models/', readonly theme = '') {}
  place(p: PropPlacement): void { this.pending.push(p); }
  get files(): string[] { return [...new Set(this.pending.map((p) => p.file))]; }
  async load(): Promise<void> {
    const byFile = new Map<string, PropPlacement[]>();
    const byProp = new Map<string, { group: string; m: Matrix; far: boolean; c: V3 | null }[]>();
    for (const p of this.pending) {
      const s = p.raw ? null : p.file.startsWith('dp:') ? placeById(p) : resolveSwap(DPROP_INDEX, p, this.theme);
      if (s) {
        (byProp.get(s.id) ?? byProp.set(s.id, []).get(s.id)!).push({ group: p.group, m: placeMatrix(s.x, s.y, s.z, s.yaw, s.scale), far: s.far, c: s.color });
        continue;
      }
      (byFile.get(p.file) ?? byFile.set(p.file, []).get(p.file)!).push(p);
    }
    const packs = new Map<string, Promise<Map<string, DPropMesh> | null>>();
    const pack = (name: string) => packs.get(name) ?? packs.set(name, loadPack(this.root + 'dprops/' + DPROP_INDEX.packs[name])).get(name)!;
    await Promise.all([
      ...[...byFile].map(async ([file, list]) => {
        const t = natureTemplate(this.scene, file) ?? await loadTemplate(this.scene, this.root + file, `kitprop_${file}`);
        if (!t) { console.warn(`dungeon kit: prop ${file} did not load`); return; }
        const pool = new GroupedInstances(t);
        for (const p of list) pool.add(p.group, placeMatrix(p.x, p.y, p.z, p.yaw ?? 0, p.scale ?? 1), p.far ?? false);
        pool.upload();
        this.pools.set(file, pool);
      }),
      ...[...byProp].map(async ([id, list]) => {
        const info = DPROP_INDEX.props[id], meshes = await pack(info.pack);
        if (this.scene.isDisposed) return;
        const near = meshes?.get(id), far = info.far ? meshes?.get(id + '__far') : undefined;
        if (!near) { console.warn(`dungeon kit: original prop ${id} did not load`); return; }
        const mat = dpropMaterial(this.scene, this.root + 'dprops/');
        const make = (src: DPropMesh, name: string, mode: PoolMode) => {
          const pool = new GroupedInstances(dpropMesh(this.scene, src, name, mat), mode);
          for (const x of list) pool.add(x.group, x.m, x.far, x.c ?? undefined);
          pool.upload();
          this.pools.set(name, pool);
        };
        make(near, `dp:${id}`, far ? 'near' : 'both');
        if (far && list.some((x) => x.far)) make(far, `dp:${id}__far`, 'far');
      }),
    ]);
  }
  update(v: VisState | null): number { let n = 0; for (const p of this.pools.values()) n += p.update(v) ? 1 : 0; return n; }
  get meshes(): Mesh[] { return [...this.pools.values()].map((p) => p.mesh); }
}

async function loadTemplate(scene: Scene, url: string, name: string): Promise<Mesh | null> {
  try {
    const container = await LoadAssetContainerAsync(url, scene);
    if (scene.isDisposed) { container.dispose(); return null; }
    const result = container.instantiateModelsToScene((n) => `${name}_${n}`, false);
    const meshes = result.rootNodes.flatMap((n) => n.getChildMeshes()).filter((m) => m.getTotalVertices() > 0) as Mesh[];
    if (!meshes.length) { result.rootNodes.forEach((n) => n.dispose()); container.dispose(); return null; }
    for (const m of meshes) {
      let top: TransformNode = m;
      while (top.parent) top = top.parent as TransformNode;
      const rel = m.computeWorldMatrix(true).multiply(Matrix.Invert(top.computeWorldMatrix(true)));
      m.makeGeometryUnique();
      m.bakeTransformIntoVertices(rel);
      m.position.setAll(0); m.rotationQuaternion = null; m.rotation.setAll(0); m.scaling.setAll(1); m.parent = null;
    }
    const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
    if (!merged) return null;
    if (meshes.length === 1) merged.makeGeometryUnique();
    result.rootNodes.forEach((n) => n.dispose());
    merged.name = name;
    merged.isPickable = false;
    merged.isVisible = false;      // no ghost at the origin before instances exist
    merged.freezeWorldMatrix();
    return merged;
  } catch (e) {
    console.warn('dungeon kit: template', url, e);
    return null;
  }
}

// ---------------------------------------------------------------- original props
const DPROP_INDEX = dpropIndexJson as unknown as DPropIndex;

/** `dp:<id>` placed directly: the prop at its authored size times `scale` */
function placeById(p: PropPlacement): SwapResult | null {
  const id = p.file.slice(3), d = DPROP_INDEX.props[id];
  if (!d) { console.warn(`dungeon kit: no original prop ${id}`); return null; }
  const t = d.tint?.['*'];
  return { id, x: p.x, y: p.y, z: p.z, yaw: p.yaw ?? 0, scale: p.scale ?? 1, far: d.small ? false : (p.far ?? false), color: t ? hexRgb(t) : null };
}

interface DPropMesh { positions: Float32Array; normals: Float32Array; uvs: Float32Array; colors: Float32Array | null; indices: Uint16Array | Uint32Array }

/** A pack GLB's meshes by node name, back in Babylon's space. The pack is
 * standard glTF (tools/assets/build_dungeon_props.mjs SPACE): the generator
 * negated x, which is the whole conversion, so this negates it back and
 * leaves the winding alone. */
async function loadPack(url: string): Promise<Map<string, DPropMesh> | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const buf = await r.arrayBuffer();
    const dv = new DataView(buf), jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    const bin = 20 + jsonLen + 8;
    const read = (i: number) => {
      const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
      const o = bin + v.byteOffset;
      if (a.componentType === 5121) return Float32Array.from(new Uint8Array(buf, o, n), (b) => b / 255);   // COLOR_0, normalised bytes
      if (a.normalized && a.componentType === 5123) return Float32Array.from(new Uint16Array(buf.slice(o, o + n * 2)), (b) => b / 65535);   // TEXCOORD_0
      return a.componentType === 5123 ? new Uint16Array(buf.slice(o, o + n * 2)) : a.componentType === 5125 ? new Uint32Array(buf.slice(o, o + n * 4)) : new Float32Array(buf.slice(o, o + n * 4));
    };
    const out = new Map<string, DPropMesh>();
    for (const node of json.nodes) {
      const prim = json.meshes[node.mesh].primitives[0], at = prim.attributes;
      const positions = read(at.POSITION) as Float32Array, normals = read(at.NORMAL) as Float32Array, indices = read(prim.indices) as Uint16Array | Uint32Array;
      // back to Babylon's space: undo the generator's x mirror. That mirror is
      // the whole glTF conversion, so the winding needs nothing
      // (build_dungeon_props.mjs SPACE)
      for (let i = 0; i < positions.length; i += 3) { positions[i] = -positions[i]; normals[i] = -normals[i]; }
      out.set(node.name, { positions, normals, indices, uvs: read(at.TEXCOORD_0) as Float32Array, colors: at.COLOR_0 === undefined ? null : read(at.COLOR_0) as Float32Array });
    }
    return out;
  } catch (e) {
    console.warn('dungeon kit: original prop pack', url, e);
    return null;
  }
}

/** One template mesh per pool: thin-instance buffers live on the geometry, so
 * every pool gets its own VertexData (never a shared geometry). */
function dpropMesh(scene: Scene, src: DPropMesh, name: string, mat: StandardMaterial): Mesh {
  const m = new Mesh(name, scene), vd = new VertexData();
  vd.positions = src.positions; vd.normals = src.normals; vd.uvs = src.uvs; vd.indices = src.indices;
  if (src.colors) vd.colors = src.colors;
  vd.applyToMesh(m, false);
  m.hasVertexAlpha = false;   // COLOR_0 is shade and dye, never transparency
  m.material = mat;
  m.isPickable = false;
  m.isVisible = false;        // no ghost at the origin before instances exist
  m.freezeWorldMatrix();
  return m;
}

/** The ONE material every original prop draws with: the shared atlas
 * (diffuse, OpenGL normal, specular with gloss in alpha, emissive), vertex
 * colour for dye and shade, instance colour for the theme's tint. One per scene. */
const DPROP_MATS = new WeakMap<Scene, StandardMaterial>();
function dpropMaterial(scene: Scene, root: string): StandardMaterial {
  let m = DPROP_MATS.get(scene);
  if (m) return m;
  const a = DPROP_INDEX.atlas, tex = (f: string) => { const t = new Texture(root + f, scene, false, false); t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE; return t; };
  m = new StandardMaterial('dprops_atlas', scene);
  m.maxSimultaneousLights = 6;
  m.diffuseTexture = tex(a.diffuse);
  m.bumpTexture = tex(a.normal); m.bumpTexture.level = 0.9;
  m.specularTexture = tex(a.specular); m.useGlossinessFromSpecularMapAlpha = true; m.specularPower = 64;
  m.emissiveTexture = tex(a.emissive);
  m.diffuseColor = Color3.White(); m.specularColor = Color3.White(); m.emissiveColor = Color3.White();
  DPROP_MATS.set(scene, m);
  scene.onDisposeObservable.addOnce(() => DPROP_MATS.delete(scene));
  return m;
}

// ---------------------------------------------------------------- light pools
/**
 * Baked-looking light without a light: soft additive discs on the floor under
 * each fire and on the wall behind each sconce, one draw for all of them,
 * culled with their rooms. Additive (ONE, ONE), no depth write, pulled
 * toward the camera a hair so they never fight the floor; fog off, since an
 * added colour would brighten distant fog rather than fade (a far room hides
 * its pools anyway: they are near-only).
 */
export class LightPools {
  readonly pool: GroupedInstances;
  constructor(readonly scene: Scene, color: string, strength: number, name = 'kit_lightpools') {
    const mesh = MeshBuilder.CreateGround(name, { width: 1, height: 1 }, scene);
    // the falloff as raw bytes (a canvas gradient proved unreliable here):
    // a smooth quadratic bump to zero at the rim, so the quad's square never shows
    const N = 64, px = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2)), v = Math.round(255 * (1 - r * r) ** 2.2), k = (y * N + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = v; px[k + 3] = 255;
    }
    const tex = RawTexture.CreateRGBATexture(px, N, N, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const m = new StandardMaterial(`${name}_m`, scene);
    // MEASURED (beaconfort pilot): StandardMaterial ADDS emissiveTexture to
    // emissiveColor, so the falloff must not be the emissive texture or every
    // pool shows as a square. MEASURED (keep, mausoleum, glasshouse): unlit,
    // the shader has no diffuse light term at all, so diffuseColor drops out
    // and the result is (emissiveColor + ambient) x diffuseTexture. The colour
    // therefore goes in the emissive and the falloff in the DIFFUSE texture,
    // which multiplies it: the rim is truly zero. diffuseColor carries the
    // same colour only so modules that copy it (mausoleum) stay idempotent.
    m.disableLighting = true;
    const c = Color3.FromHexString(color).scale(strength);
    m.diffuseTexture = tex; m.diffuseColor = c.clone();
    m.specularColor = Color3.Black(); m.emissiveColor = c;
    m.alpha = 0.999; m.alphaMode = Constants.ALPHA_ONEONE;
    m.disableDepthWrite = true; m.zOffset = -2; m.fogEnabled = false; m.backFaceCulling = false;
    mesh.material = m;
    mesh.isPickable = false;
    mesh.isVisible = false;
    this.pool = new GroupedInstances(mesh);
  }
  /** a floor pool of radius r at (x, y, z) */
  floor(group: string, x: number, y: number, z: number, r: number): void {
    this.pool.add(group, placeMatrix(x, y + 0.025, z, 0, r * 2, 1, r * 2));
  }
  /** a wall pool of radius r centred at (x, y, z) on a wall facing (fx, fz) */
  wall(group: string, x: number, y: number, z: number, r: number, fx: number, fz: number): void {
    // the ground quad faces +y: tip it up to face (fx, 0, fz)
    const yaw = Math.atan2(fx, fz);
    const q = Quaternion.RotationYawPitchRoll(yaw, Math.PI / 2, 0);
    this.pool.add(group, Matrix.Compose(new Vector3(r * 2, 1, r * 2), q, new Vector3(x + fx * 0.03, y, z + fz * 0.03)));
  }
  upload(): void { this.pool.upload(); }
  update(v: VisState | null): void { this.pool.update(v); }
}
