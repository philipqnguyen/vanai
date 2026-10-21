// Dungeon kit v2: the Babylon half. A DungeonKit collects geometry per GROUP
// (a room, a corridor run: rooms.ts) at two levels of detail, merges it into
// one mesh per (group x material x LOD), and runs the room culler: each frame
// it asks visibleGroups() what the camera can see, enables those groups at
// full detail within `lodDistance` and their cheap variant beyond, and tells
// the instance pools (props, flames, light pools, lamp slots) so they repack.
// Off-room geometry is disabled: it is neither drawn nor frustum-tested.
//
// It knows nothing of scene.ts: give it the scene and the glow layer. The
// game's glue is zones/dungeon-craft.ts dungeonKit(), which also registers
// colliders and camera rooms with buildApi; the kit's own demo page
// (client/dungeon-kit.html) uses it bare.
import { Camera, Color3, Mesh, StandardMaterial, Texture, Vector3, VertexData, type AbstractMesh, type GlowLayer, type Scene } from '@babylonjs/core';
import { Geom, Parts, SLOTS, type Slot, type V3 } from './geom.ts';
import { groupDistance, visibleGroups, type KitPlan, type VisibilityOpts } from './rooms.ts';
import { SHEET_PERIOD, TEX_ROOT, type SurfaceSpec, type ThemePreset } from './themes.ts';
import { buildGroupShell, shellCameraRooms, shellColliders, type CameraRoomBox, type ColliderBox, type FireSeat, type ShellOpts, type ShellResult } from './shell.ts';
import { excludeNonEmitters, glowOccluder } from './glow.ts';
import { LightPools, PropPools, type VisState } from './instances.ts';
import { FlamePool, LampSlots } from './fire.ts';

export interface KitOptions {
  /** mesh/material name prefix (a dungeon's two-letter code) */
  prefix: string;
  glow?: GlowLayer | null;
  /** build the far variant and switch to it past lodDistance (default true, 45 m) */
  lod?: boolean; lodDistance?: number;
  /** run the room culler (default true when a plan is given) */
  cull?: boolean;
  visibility?: VisibilityOpts;
  texRoot?: string;
  /** one glow-pass occluder per group (default true; the game's glue passes
   * false because scene.ts already occludes a dungeon's glow with the plan) */
  glowOccluders?: boolean;
  /** slots that make up a group's occluder (default wall, floor, ceiling) */
  occluderSlots?: Slot[];
}

export interface KitStats {
  groups: number; meshes: number; materials: number;
  verts: { near: number; far: number };
  /** main-pass draws each group costs at each tier (materials it uses) */
  drawsPerGroup: Record<string, { near: number; far: number }>;
  props: number; flames: number; pools: number; lamps: number;
}

const SHARED = '*';

export class DungeonKit {
  readonly props: PropPools;
  readonly flames: FlamePool;
  readonly pools: LightPools;
  readonly lamps: LampSlots;
  readonly meshes: Mesh[] = [];
  private near = new Map<string, Parts>();
  private far = new Map<string, Parts>();
  private mats = new Map<SurfaceSpec, StandardMaterial>();
  private groupMeshes = new Map<string, { near: Mesh[]; far: Mesh[]; occluder: Mesh | null }>();
  private sig = '';
  vis: VisState | null = null;
  private finished = false;

  constructor(readonly scene: Scene, readonly theme: ThemePreset, readonly plan: KitPlan | null, readonly opts: KitOptions) {
    this.props = new PropPools(scene, '/models/', theme.key);
    this.flames = new FlamePool(scene, { core: theme.flame.core, edge: theme.flame.edge }, { name: `${opts.prefix}_flames` });
    this.pools = new LightPools(scene, theme.pool.color, theme.pool.strength, `${opts.prefix}_lightpools`);
    this.lamps = new LampSlots(scene, theme.lamp.color, theme.lamp.intensity, theme.lamp.range, 4, `${opts.prefix}_lamp`);
    // the QA tools' handle on the zone's kit (tools/qa/dungeon_audit.mjs calls
    // apply(null) before it casts rays: the culler has the rooms the camera
    // cannot see turned off, and a ray from inside one would pass its walls)
    (globalThis as { __dungeonKit?: DungeonKit }).__dungeonKit = this;
  }

  // ------------------------------------------------------------ materials
  /** The material for a slot (or any surface spec); slots sharing a spec share it. */
  material(slotOrSpec: Slot | SurfaceSpec): StandardMaterial {
    const spec = typeof slotOrSpec === 'string' ? this.theme.surfaces[slotOrSpec] : slotOrSpec;
    let m = this.mats.get(spec);
    if (m) return m;
    const name = typeof slotOrSpec === 'string' ? slotOrSpec : `s${this.mats.size}`;
    m = new StandardMaterial(`${this.opts.prefix}_${this.theme.key}_${name}_${this.mats.size}`, this.scene);
    m.maxSimultaneousLights = 6;
    m.diffuseColor = Color3.FromHexString(spec.tint);
    const s = spec.spec ?? 0.06;
    m.specularColor = new Color3(s, s, s);
    m.specularPower = spec.power ?? 32;
    if (spec.sheet) {
      const root = this.opts.texRoot ?? TEX_ROOT, scale = (spec.scale ?? 1) / SHEET_PERIOD[spec.sheet];
      const d = new Texture(`${root}${spec.sheet}_diff.jpg`, this.scene);
      d.uScale = d.vScale = scale;
      m.diffuseTexture = d;
      const n = new Texture(`${root}${spec.sheet}_nor_gl.jpg`, this.scene);
      n.uScale = n.vScale = scale;
      n.level = spec.bump ?? 0.8;
      m.bumpTexture = n;
    }
    if (spec.emissive) m.emissiveColor = Color3.FromHexString(spec.emissive);
    if (spec.unlit) { m.disableLighting = true; m.emissiveColor = Color3.FromHexString(spec.emissive ?? spec.tint); }
    if (spec.glow) m.metadata = { ...(m.metadata ?? {}), glow: spec.glow };
    if (spec.alpha !== undefined) { m.alpha = spec.alpha; m.backFaceCulling = false; }
    this.mats.set(spec, m);
    return m;
  }

  // ------------------------------------------------------------ geometry
  /** Build into a group at both levels of detail: `fn` runs twice, once with
   * p.detail true and once false (skip the far pass with near:only). Group
   * '*' is always drawn and has no far variant. */
  build(group: string, fn: (p: Parts) => void, opts: { farToo?: boolean } = {}): void {
    if (this.finished) throw new Error('dungeon kit: build() after finish()');
    const n = this.near.get(group) ?? this.near.set(group, new Parts(true)).get(group)!;
    fn(n);
    if (group === SHARED || this.opts.lod === false || opts.farToo === false) return;
    const f = this.far.get(group) ?? this.far.set(group, new Parts(false)).get(group)!;
    fn(f);
  }
  /** Build every group's shell from the plan (shell.ts) and seat a flame, a
   * lamp and light pools on every sconce it placed. */
  shell(o: Partial<ShellOpts> = {}): ShellResult & { colliders: ColliderBox[]; cameraRooms: CameraRoomBox[] } {
    if (!this.plan) throw new Error('dungeon kit: shell() needs a plan');
    const so: ShellOpts = { style: this.theme.arch, ...o };
    const seats: FireSeat[] = [], windows: ShellResult['windows'] = [];
    for (const g of this.plan.groups) {
      let mine: ShellResult = { seats: [], windows: [] };
      this.build(g.id, (p) => { const s = buildGroupShell(p, this.plan!, g, so); if (p.detail) mine = s; });
      seats.push(...mine.seats); windows.push(...mine.windows);
    }
    for (const s of seats) this.fire(s.group, s.at, { facing: s.facing });
    return { colliders: shellColliders(this.plan, so), cameraRooms: shellCameraRooms(this.plan, so), seats, windows };
  }
  /** A flame at `at` (a brazier's or sconce's seat), its lamp, a floor pool
   * and, for a wall fitting (facing given), a wall pool behind it. */
  fire(group: string, at: V3, o: { size?: number; lamp?: boolean; floorPool?: number; facing?: [number, number] } = {}): void {
    const s = o.size ?? 1;
    this.flames.add(group, at[0], at[1], at[2], 0.3 * s, 0.6 * s);
    if (o.lamp !== false) this.lamps.add({ group, x: at[0] + (o.facing?.[0] ?? 0) * 0.6, y: at[1] + 0.2, z: at[2] + (o.facing?.[1] ?? 0) * 0.6 });
    const floorY = this.groupY(group);
    const fr = o.floorPool ?? 3.2 * s;
    if (o.facing) {
      this.pools.wall(group, at[0] - o.facing[0] * 0.38, at[1] + 0.25, at[2] - o.facing[1] * 0.38, 1.3 * s, o.facing[0], o.facing[1]);
      if (fr > 0) this.pools.floor(group, at[0] + o.facing[0] * 1.4, floorY, at[2] + o.facing[1] * 1.4, fr);
    } else if (fr > 0) this.pools.floor(group, at[0], floorY, at[2], fr);
  }
  private groupY(group: string): number { return this.plan?.byId.get(group)?.y ?? 0; }

  // ------------------------------------------------------------ finish
  /** Merge, cull, glow. Props load asynchronously; await the promise to know they are in. */
  finish(): Promise<void> {
    this.finished = true;
    const occl = new Set<Slot>(this.opts.occluderSlots ?? ['wall', 'floor', 'ceiling']);
    const groups = new Set([...this.near.keys(), ...this.far.keys()]);
    for (const g of groups) {
      const entry = { near: this.merge(g, 'near', this.near.get(g)), far: this.merge(g, 'far', this.far.get(g)), occluder: null as Mesh | null };
      // one glow-pass occluder per group, of its shell
      const parts = this.near.get(g);
      if (parts && this.opts.glow && this.opts.glowOccluders !== false) {
        const sh = new Geom();
        for (const [slot, geo] of parts.slots) if (occl.has(slot)) sh.absorb(geo);
        if (!sh.empty) entry.occluder = glowOccluder(this.scene, this.opts.glow, `${this.opts.prefix}_glowocc_${g}`, new Float32Array(sh.p), new Uint32Array(sh.i));
      }
      this.groupMeshes.set(g, entry);
    }
    this.near.clear(); this.far.clear();
    excludeNonEmitters(this.opts.glow, this.meshes);
    for (const m of [this.flames.pool.mesh, this.pools.pool.mesh]) this.opts.glow?.addExcludedMesh(m);
    this.flames.upload(); this.pools.upload();
    const cull = this.opts.cull ?? !!this.plan;
    if (cull && this.plan) this.scene.onBeforeRenderObservable.add(() => this.cullTick());
    else this.apply(null);
    return this.props.load().then(() => {
      for (const m of this.props.meshes) this.opts.glow?.addExcludedMesh(m);
      this.sig = '';
      this.props.update(this.vis);
    });
  }

  private merge(group: string, tier: 'near' | 'far', parts: Parts | undefined): Mesh[] {
    if (!parts) return [];
    const byMat = new Map<StandardMaterial, Geom[]>();
    for (const slot of SLOTS) {
      const g = parts.slots.get(slot);
      if (!g || g.empty) continue;
      const m = this.material(slot);
      (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(g);
    }
    const out: Mesh[] = [];
    for (const [mat, geos] of byMat) {
      let nv = 0, ni = 0;
      for (const g of geos) { nv += g.vertexCount; ni += g.i.length; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 4);
      const I = nv <= 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const g of geos) {
        P.set(g.p, vo * 3); N.set(g.n, vo * 3); U.set(g.uv, vo * 2);
        for (let k = 0; k < g.vertexCount; k++) { const c = g.c[k]; C[(vo + k) * 4] = c; C[(vo + k) * 4 + 1] = c; C[(vo + k) * 4 + 2] = c; C[(vo + k) * 4 + 3] = 1; }
        for (const k of g.i) I[io++] = k + vo;
        vo += g.vertexCount;
      }
      const mesh = new Mesh(`${this.opts.prefix}_${group}_${tier}_${mat.name}`, this.scene), vd = new VertexData();
      vd.positions = P; vd.normals = N; vd.uvs = U; vd.colors = C; vd.indices = I;
      vd.applyToMesh(mesh);
      mesh.material = mat;
      mesh.isPickable = !mat.metadata?.glow && mat.alpha >= 1;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      mesh.metadata = { kitGroup: group, kitTier: tier };
      out.push(mesh); this.meshes.push(mesh);
    }
    return out;
  }

  // ------------------------------------------------------------ culling
  private cullTick(): void {
    const cam = this.scene.activeCamera, plan = this.plan!;
    if (!cam) return;
    const p = cam.globalPosition, dir = cam.getDirection(Vector3.Forward());
    // A camera looking straight down (the /?zonemap= view's orthographic
    // tiles) has no heading for the cone: dirX = dirZ = 0 made atan2 face it
    // +x, and whole rooms went black under the render. Show everything.
    if (cam.mode === Camera.ORTHOGRAPHIC_CAMERA || Math.hypot(dir.x, dir.z) < 0.05) {
      if (this.sig !== 'all') { this.sig = 'all'; this.apply(null); }
      return;
    }
    const eng = this.scene.getEngine(), aspect = eng.getAspectRatio(cam);
    const hfov = 2 * Math.atan(Math.tan((cam.fov ?? 0.8) / 2) * aspect);
    const visible = visibleGroups(plan, { x: p.x, z: p.z, y: p.y, dirX: dir?.x, dirZ: dir?.z, fov: hfov }, this.opts.visibility);
    visible.add(SHARED);
    const lodD = this.opts.lodDistance ?? 45, near = new Set<string>([SHARED]);
    for (const id of visible) {
      const g = plan.byId.get(id);
      if (!g || this.opts.lod === false || groupDistance(g, p.x, p.z, p.y) < lodD) near.add(id);
    }
    const sig = [...visible].sort().join(',') + '|' + [...near].sort().join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    this.apply({ visible, near });
  }

  /** Show what `v` says (null: everything at full detail). */
  apply(v: VisState | null): void {
    this.vis = v;
    for (const [g, e] of this.groupMeshes) {
      const shown = !v || v.visible.has(g), isNear = !v || v.near.has(g) || !e.far.length;
      for (const m of e.near) m.setEnabled(shown && isNear);
      for (const m of e.far) m.setEnabled(shown && !isNear);
      e.occluder?.setEnabled(shown);
    }
    this.props.update(v); this.flames.update(v); this.pools.update(v); this.lamps.update(v);
  }

  /** Force the culler to re-evaluate (after a teleport, a camera swap). */
  invalidate(): void { this.sig = ''; }

  stats(): KitStats {
    const drawsPerGroup: KitStats['drawsPerGroup'] = {};
    let nearV = 0, farV = 0;
    for (const [g, e] of this.groupMeshes) {
      drawsPerGroup[g] = { near: e.near.length, far: e.far.length };
      for (const m of e.near) nearV += m.getTotalVertices();
      for (const m of e.far) farV += m.getTotalVertices();
    }
    return {
      groups: this.groupMeshes.size, meshes: this.meshes.length, materials: this.mats.size, verts: { near: nearV, far: farV }, drawsPerGroup,
      props: this.props.pools.size, flames: this.flames.pool.count, pools: this.pools.pool.count, lamps: this.lamps.lamps.length,
    };
  }

  /** every mesh the kit made, for a caller that tags or audits them */
  allMeshes(): AbstractMesh[] {
    return [...this.meshes, this.flames.pool.mesh, this.pools.pool.mesh, ...this.props.meshes, ...[...this.groupMeshes.values()].map((e) => e.occluder).filter((m): m is Mesh => !!m)];
  }
}
