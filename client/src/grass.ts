// THE MEADOW: dense, knee-high card grass around the player (Philip's
// reference is Xenoblade's Gaur Plain), built to cost less than the kit tufts
// it replaces.
//
// Where the cost goes, and what this does about each:
//
// - Geometry. Every clump is ONE shared 24-vertex mesh (three crossed cards,
//   bent in two rows) drawn as thin instances: the whole meadow is a single
//   draw call. The density on screen is blades PAINTED into a generated
//   texture, not triangles -- sixty-odd blades per card. The Quaternius tufts
//   it replaces were 153-559 verts each for one tuft of eight blades.
// - CPU. Clumps live on a fixed world grid of CELL-metre cells, each laid
//   once (seeded by its coordinates) and cached, so nothing re-randomises as
//   the player moves and nothing pops; crossing a cell edge only re-packs the
//   cached arrays into the instance buffer. Wind, the lean away from the
//   player and the distance fade all run in the vertex shader off two
//   uniforms -- zero per-frame CPU work.
// - Fill. Alpha-tested cards overlap, so overdraw is the real price of grass.
//   Far clumps shrink into the ground by a per-clump rank (the tallest ranks
//   go first), which keeps the ring's outer half sparse where each clump is a
//   few pixels anyway, and the ground sheet carries the colour out past it.
//
// Normals point straight UP on every vertex. That is the old trick that makes
// card grass sit in the terrain rather than on it: the blades take exactly the
// light the ground under them takes, so where the meadow thins out at the
// ring's edge there is no seam in brightness, whatever the sun is doing.
import {
  Color3, Matrix, Mesh, MaterialPluginBase, Quaternion, Scene, StandardMaterial,
  Texture, DynamicTexture, Vector3, VertexData, Material,
} from "@babylonjs/core";

export interface GrassSpec {
  height: [number, number];   // clump height range, metres, before the road taper
  density: number;            // clumps per square metre at full cover
  root: Color3;               // albedo at the blade root (sits in the ground's shade)
  tip: Color3;                // albedo at the tip (the sunlit top of the sward)
  far: Color3;                // the ground's own albedo, which the ring's edge fades to
  radius?: number;            // how far the meadow reaches, metres
}

// the terrain questions the meadow asks, answered by scene.ts
export interface GrassGround {
  // 0 = nothing grows here, 1 = full height; values between shorten the sward
  // (the lip of a road, the edge of a bank). Writes the ground height to
  // out.y whenever it returns more than 0 -- it has sampled it anyway.
  grows(x: number, z: number, out: { y: number }): number;
}

const CELL = 8;              // metres; the grid the clumps are laid and cached on
const TEX_W = 1024, TEX_H = 512;

interface GrassState {
  scene: Scene; mesh: Mesh; mat: StandardMaterial; plugin: GrassPlugin;
  spec: Required<GrassSpec>; ground: GrassGround; seed: number;
  cells: Map<string, { m: Float32Array; c: Float32Array; n: number }>;
  cx: number; cz: number;    // the cell the ring was last worked out around
  want: { key: string; gx: number; gz: number; d: number }[];   // the ring's cells, nearest first
  dirty: boolean;            // cells arrived or the ring moved: re-pack
  mBuf: Float32Array; cBuf: Float32Array; cap: number;          // the persistent instance buffer
  t0: number;
}
let st: GrassState | null = null;

// ---------- the blade sheet ----------
// Painted once per scene: grey blades on a clear ground. The luminance is
// detail only (a darker spine, darker overlaps toward the root); the COLOUR
// comes from the zone's root/tip pair in the shader, so one sheet serves a
// green meadow and a dry one alike -- a tint can only darken a sheet, which is
// why this is not a green texture multiplied by something.
function bladeSheet(scene: Scene, seed: number): DynamicTexture {
  const tex = new DynamicTexture("grassBlades", { width: TEX_W, height: TEX_H }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  const rand = mulberry(seed);
  // back to front: the short blades last, so the base of the clump is dense
  // and the silhouette is the long blades' tips
  const blades: { x: number; h: number; w: number; lean: number; l: number }[] = [];
  // the long blades that make the silhouette...
  for (let i = 0; i < 70; i++) {
    blades.push({
      x: 12 + rand() * (TEX_W - 24),
      h: TEX_H * (0.5 + Math.pow(rand(), 0.7) * 0.48),
      w: 9 + rand() * 9,
      lean: (rand() - 0.5) * 150,
      l: 0.8 + rand() * 0.2,
    });
  }
  // ...and an understorey of short ones, so the foot of a card is a thicket
  // rather than a row of stalks with daylight between them -- seen from
  // walking height, a clear strip along the bottom of every card is what
  // makes crossed-card grass read as a line of fences
  for (let i = 0; i < 90; i++) {
    blades.push({
      x: 6 + rand() * (TEX_W - 12),
      h: TEX_H * (0.16 + rand() * 0.3),
      w: 8 + rand() * 8,
      lean: (rand() - 0.5) * 90,
      l: 0.72 + rand() * 0.2,
    });
  }
  blades.sort((a, b) => b.h - a.h);
  for (const b of blades) {
    const y0 = TEX_H, y1 = TEX_H - b.h;
    const tipX = b.x + b.lean;
    // a quadratic blade: the lean grows toward the tip, the way a blade bows
    const ctrlX = b.x + b.lean * 0.25, ctrlY = y0 - b.h * 0.55;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const lum = (k: number) => { const v = Math.round(255 * b.l * k); return `rgb(${v},${v},${v})`; };
    g.addColorStop(0, lum(0.7));
    g.addColorStop(0.5, lum(0.9));
    g.addColorStop(1, lum(1.0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x - b.w / 2, y0);
    ctx.quadraticCurveTo(ctrlX - b.w * 0.35, ctrlY, tipX, y1);
    ctx.quadraticCurveTo(ctrlX + b.w * 0.35, ctrlY, b.x + b.w / 2, y0);
    ctx.closePath();
    ctx.fill();
  }
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

// ---------- the clump ----------
// Three cards crossed at 60 degrees, 1m wide and 1m tall (the instance matrix
// scales them), two rows each so the wind can bow the upper half. Each card
// reads a different half of the sheet so the three are not the same blades
// rotated. Tops lean outward a little: seen from a third-person camera above
// the sward, upright crossed cards show their gaps.
function clumpGeometry(mesh: Mesh): void {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const ROWS = [0, 0.45, 1];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3 + 0.3;
    const ax = Math.cos(a), az = Math.sin(a);
    const ox = -az, oz = ax;               // the card's normal, for the lean
    const u0 = k * 0.25, u1 = u0 + 0.5;
    const base = pos.length / 3;
    for (const v of ROWS) {
      const lean = 0.12 * v * v;
      for (const s of [-1, 1]) {
        pos.push(ax * 0.5 * s + ox * lean * (k % 2 ? 1 : -1), v, az * 0.5 * s + oz * lean * (k % 2 ? 1 : -1));
        nrm.push(0, 1, 0);
        uv.push(s < 0 ? u0 : u1, v);
      }
    }
    for (let r = 0; r < ROWS.length - 1; r++) {
      const i = base + r * 2;
      idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(mesh);
}

// ---------- the shader ----------
class GrassPlugin extends MaterialPluginBase {
  center = { x: 0, z: 0 };
  time = 0;
  fade: [number, number] = [20, 40];
  root = new Color3(0.2, 0.3, 0.1);
  tip = new Color3(0.8, 0.9, 0.4);
  far = new Color3(0.4, 0.45, 0.2);
  constructor(material: Material) {
    super(material, "Grass", 210, { GRASS: false });
    // hardBindForSubMesh is only called for plugins registered for the extra
    // events -- without this the uniforms are never uploaded, the fade reads
    // zero and every clump collapses to nothing (MEASURED, the hard way)
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getClassName(): string { return "GrassPlugin"; }
  prepareDefines(defines: any): void { defines.GRASS = true; }
  getUniforms() {
    return {
      // vec4s only: std140 pads mixed vec2/float/vec3 runs, and four-float
      // slots leave no padding for the CPU layout and the shader to disagree on
      ubo: [
        { name: "grassPos", size: 4, type: "vec4" },    // centre x, centre z, fade start, fade end
        { name: "grassMisc", size: 4, type: "vec4" },   // time, -, -, -
        { name: "grassRoot", size: 4, type: "vec4" },
        { name: "grassTip", size: 4, type: "vec4" },
        { name: "grassFar", size: 4, type: "vec4" },
      ],
      vertex: `uniform vec4 grassPos; uniform vec4 grassMisc;`,
      fragment: `uniform vec4 grassPos; uniform vec4 grassRoot; uniform vec4 grassTip; uniform vec4 grassFar;`,
    };
  }
  // the hard bind, not bindForSubMesh: bindForSubMesh only runs when the
  // material must rebind, and the time and the player's position change every
  // frame whether or not anything else did (the gear drape plugin updates its
  // sway here for the same reason)
  hardBindForSubMesh(ubo: any): void {
    ubo.updateFloat4("grassPos", this.center.x, this.center.z, this.fade[0], this.fade[1]);
    ubo.updateFloat4("grassMisc", this.time, 0, 0, 0);
    ubo.updateColor4("grassRoot", this.root, 1);
    ubo.updateColor4("grassTip", this.tip, 1);
    ubo.updateColor4("grassFar", this.far, 1);
  }
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef GRASS
{
  // the clump's root is the instance translation; everything bends about it
  vec3 gRoot = finalWorld[3].xyz;
  float gUp = uv.y;                       // 0 at the root, 1 at the tip
  // a stable per-clump random, from where it stands (no extra attribute)
  float gRank = fract(sin(dot(gRoot.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 grassCenter = grassPos.xy; vec2 grassFade = grassPos.zw; float grassTime = grassMisc.x;
  vec2 gRel = gRoot.xz - grassCenter;
  float gDist = length(gRel);
  // FADE: past fade.x the clumps shrink into the ground, highest rank first,
  // gone by fade.y. A shrunk clump is degenerate triangles -- no fragments.
  float gT = clamp((gDist - grassFade.x) / max(grassFade.y - grassFade.x, 0.01), 0.0, 1.0);
  float gKeep = smoothstep(0.0, 0.25, (1.0 - gT) - gRank * 0.75);
  worldPos.xyz = gRoot + (worldPos.xyz - gRoot) * gKeep;
  // WIND: two slow travelling waves across the meadow, so gusts roll over
  // it rather than every clump nodding in step; the bow is quadratic up the
  // blade so the roots stay planted
  float gBow = gUp * gUp;
  float gGust = sin(grassTime * 1.3 + dot(gRoot.xz, vec2(0.11, 0.07)))
              + 0.5 * sin(grassTime * 2.7 + dot(gRoot.xz, vec2(-0.23, 0.31)) + gRank * 6.2831);
  worldPos.xz += vec2(0.8, 0.6) * gGust * 0.07 * gBow;
  // THE PLAYER parts the grass: within 1.3m the blades lean away and down
  float gNear = max(0.0, 1.3 - gDist) / 1.3;
  vec2 gAway = gDist > 0.001 ? gRel / gDist : vec2(0.0);
  worldPos.xz += gAway * gNear * 0.55 * gBow;
  worldPos.y -= gNear * 0.35 * gBow;
}
#endif
`,
    };
    if (shaderType === "fragment") return {
      // inside the DIFFUSE block, after the sheet is read and before the
      // (late) alpha test. Colour: the zone's root-to-tip ramp, the sheet's
      // luminance as blade detail. Alpha: the coverage-preserving boost --
      // a mip level averages a blade's alpha down with the clear gaps around
      // it, so without this the meadow thins to nothing a few metres out
      // (Ben Golus's fix: scale alpha up by the mip level being sampled).
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#ifdef GRASS
{
  float gUp = clamp(vDiffuseUV.y, 0.0, 1.0);
  // the sheet's clear pixels are black, so every mip level averages black
  // into the blade edges -- which is premultiplied alpha by accident, and
  // dividing it back out recovers the blade's own shade exactly. Without it
  // every blade carries a dark outline that thickens with distance.
  float gLum = baseColor.r / max(baseColor.a, 0.02);
  baseColor.rgb = mix(grassRoot.rgb, grassTip.rgb, smoothstep(0.0, 0.95, gUp)) * gLum;
  // Out toward the ring's edge the sward takes the GROUND's albedo, so the
  // last clumps are the colour of the terrain they shrink into and the edge
  // of the meadow has no seam. The blades are lit exactly as the ground is
  // (normals up), so matching albedo is matching the rendered colour.
  float gFar = clamp((length(vPositionW.xz - grassPos.xy) - grassPos.z) / max(grassPos.w - grassPos.z, 0.01), 0.0, 1.0);
  baseColor.rgb = mix(baseColor.rgb, grassFar.rgb * mix(0.85, 1.1, gLum), smoothstep(0.0, 1.0, gFar));
  vec2 gTx = vDiffuseUV * vec2(${TEX_W}.0, ${TEX_H}.0);
  vec2 gDx = dFdx(gTx), gDy = dFdy(gTx);
  float gMip = max(0.0, 0.5 * log2(max(dot(gDx, gDx), dot(gDy, gDy))));
  alpha = baseColor.a * (1.0 + gMip * 0.3);
}
#endif
`,
    };
    return null;
  }
}

// ---------- building and moving ----------
export function buildGrass(scene: Scene, spec: GrassSpec, ground: GrassGround, seed: number): void {
  disposeGrass();
  const full: Required<GrassSpec> = { radius: 46, ...spec };
  const mesh = new Mesh("meadow", scene);
  clumpGeometry(mesh);
  const mat = new StandardMaterial("meadowmat", scene);
  mat.diffuseTexture = bladeSheet(scene, seed);
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;   // also moves the test after the boost
  mat.alphaCutOff = 0.5;
  mat.backFaceCulling = false;
  mat.specularColor = Color3.Black();
  mat.maxSimultaneousLights = 4;
  const plugin = new GrassPlugin(mat);
  plugin.fade = [full.radius * 0.45, full.radius];
  plugin.root = full.root; plugin.tip = full.tip; plugin.far = full.far;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.alwaysSelectAsActiveMesh = true;   // its bounds are the unit clump; the buffer is the meadow
  mesh.doNotSyncBoundingInfo = true;
  st = { scene, mesh, mat, plugin, spec: full, ground, seed, cells: new Map(), cx: 1e9, cz: 1e9, t0: performance.now(),
    want: [], dirty: false, mBuf: new Float32Array(16), cBuf: new Float32Array(4), cap: 0 };
  scene.onDisposeObservable.addOnce(() => { if (st?.scene === scene) st = null; });
  scene.onBeforeRenderObservable.add(() => {
    if (st && st.scene === scene) st.plugin.time = (performance.now() - st.t0) / 1000;
  });
}

// the colours can arrive after the build (they are read off the ground sheet)
export function setGrassColors(scene: Scene, root: Color3, tip: Color3, far: Color3): void {
  if (!st || st.scene !== scene) return;
  st.plugin.root = root; st.plugin.tip = tip; st.plugin.far = far;
}

export function disposeGrass(): void {
  if (!st) return;
  if (!st.mesh.isDisposed()) { st.mat.diffuseTexture?.dispose(); st.mat.dispose(); st.mesh.dispose(); }
  st = null;
}

// Called every frame with the player's position.
//
// MEASURED: laying and packing a whole ring in one go on each cell crossing
// cost 27-32ms -- a visible hitch every eight metres of walking. So the work
// is split: a crossing only recomputes WHICH cells the ring wants (nearest
// first); missing cells are then laid a few per frame under a time budget,
// and the instance buffer is re-packed into one persistent array and
// uploaded in place. The ring carries a cell of slack past the fade, so a far
// cell arriving a few frames late lands where clumps are shrinking anyway.
const LAY_BUDGET_MS = 1;   // a cell costs ~1ms to lay (MEASURED), so this is about one a frame
// dev-only timing of the last few updates, for QA scripts (window.__grass)
const stats: { ring: number; lay: number; laid: number; pack: number; grew: boolean }[] = [];
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__grass = { stats, state: () => st };
export function updateGrass(scene: Scene, px: number, pz: number): void {
  const s = st;
  if (!s || s.scene !== scene) return;
  s.plugin.center.x = px; s.plugin.center.z = pz;
  const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
  const tr = performance.now();
  let ring = 0, laid = 0, packT = 0, grew = false;
  if (cx !== s.cx || cz !== s.cz) {
    s.cx = cx; s.cz = cz;
    s.want = ringCells(s, px, pz);
    s.dirty = true;
    // the cache only needs what could come back soon; drop the far ones
    const reach = Math.ceil((s.spec.radius + CELL) / CELL);
    if (s.cells.size > s.want.length * 3) {
      for (const key of s.cells.keys()) {
        const [gx, gz] = key.split(",").map(Number);
        if (Math.abs(gx - cx) > reach * 2 || Math.abs(gz - cz) > reach * 2) s.cells.delete(key);
      }
    }
  }
  const t0 = performance.now();
  ring = t0 - tr;
  for (const w of s.want) {
    if (s.cells.has(w.key)) continue;
    s.cells.set(w.key, layCell(s, w.gx, w.gz));
    s.dirty = true; laid++;
    if (performance.now() - t0 > LAY_BUDGET_MS) break;
  }
  const t1 = performance.now();
  if (s.dirty) { s.dirty = false; grew = pack(s); packT = performance.now() - t1; }
  if (import.meta.env.DEV && (laid || packT)) {
    stats.push({ ring, lay: t1 - t0, laid, pack: packT, grew });
    if (stats.length > 64) stats.shift();
  }
}

interface Want { key: string; gx: number; gz: number; d: number }
function ringCells(s: GrassState, px: number, pz: number): Want[] {
  const R = s.spec.radius + CELL;       // a cell of slack so the fade never shows a cut
  const reach = Math.ceil(R / CELL);
  const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
  const out: Want[] = [];
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const gx = cx + i, gz = cz + j;
    // nearest point of the cell to the player, so a cell half in range counts
    const nx = Math.max(gx * CELL, Math.min(px, (gx + 1) * CELL));
    const nz = Math.max(gz * CELL, Math.min(pz, (gz + 1) * CELL));
    const d = Math.hypot(nx - px, nz - pz);
    if (d <= R) out.push({ key: `${gx},${gz}`, gx, gz, d });
  }
  return out.sort((a, b) => a.d - b.d);
}

function pack(s: GrassState): boolean {
  const R = s.spec.radius + CELL, f0 = s.plugin.fade[0];
  let n = 0;
  const take: [{ m: Float32Array; c: Float32Array }, number][] = [];
  for (const w of s.want) {
    const cell = s.cells.get(w.key);
    if (!cell || !cell.n) continue;
    // Past the fade's start a cell contributes a prefix of its clumps -- they
    // were laid in random order, so a prefix is a fair random thinning --
    // down to a third at the rim. The shader's per-clump fade finishes the
    // job smoothly; this just stops the GPU transforming clumps it would
    // shrink to nothing anyway.
    const f = w.d <= f0 ? 1 : 1 - 0.65 * Math.min(1, (w.d - f0) / (R - f0));
    const k = Math.round(cell.n * f);
    if (k) { take.push([cell, k]); n += k; }
  }
  // one persistent buffer, grown (with headroom) only when the ring outgrows
  // it; otherwise refilled and uploaded in place, no new GPU buffers
  const grow = n > s.cap;
  if (grow) {
    s.cap = Math.ceil(Math.max(n, 1) * 1.25);
    s.mBuf = new Float32Array(s.cap * 16);
    s.cBuf = new Float32Array(s.cap * 4);
  }
  let o = 0;
  for (const [cell, k] of take) {
    s.mBuf.set(cell.m.subarray(0, k * 16), o * 16);
    s.cBuf.set(cell.c.subarray(0, k * 4), o * 4);
    o += k;
  }
  // An empty ring keeps ONE (stale) instance and the mesh off, never zero: at
  // zero a thin-instanced mesh stops counting as instanced, and Babylon's
  // INSTANCESCOLOR define, only ever set, then compiles `vColor *= instanceColor`
  // with no instanceColor attribute -- the shader error the Capital's pools
  // threw (capital-architecture.ts refill; the M1 review found the same pattern here)
  const count = Math.max(1, n);
  if (grow) {
    s.mesh.thinInstanceSetBuffer("matrix", s.mBuf, 16, false);
    s.mesh.thinInstanceSetBuffer("color", s.cBuf, 4, false);
    s.mesh.thinInstanceCount = count;
  } else {
    // the count first: the matrix upload sends exactly instancesCount matrices
    s.mesh.thinInstanceCount = count;
    s.mesh.thinInstanceBufferUpdated("matrix");
    s.mesh.thinInstanceBufferUpdated("color");
  }
  s.mesh.setEnabled(n > 0);
  return grow;
}

const _q = new Quaternion(), _s = new Vector3(), _t = new Vector3(), _m = new Matrix(), _ground = { y: 0 };
function layCell(s: GrassState, gx: number, gz: number): { m: Float32Array; c: Float32Array; n: number } {
  const rand = mulberry((s.seed * 73856093) ^ (gx * 19349663) ^ (gz * 83492791));
  const want = Math.round(s.spec.density * CELL * CELL);
  const m = new Float32Array(want * 16), c = new Float32Array(want * 4);
  let n = 0;
  const [h0, h1] = s.spec.height;
  for (let k = 0; k < want; k++) {
    const x = (gx + rand()) * CELL, z = (gz + rand()) * CELL;
    const hr = rand(), wr = rand(), yaw = rand() * Math.PI * 2, tone = rand();
    const g = s.ground.grows(x, z, _ground);
    if (g <= 0.05) continue;
    const h = (h0 + hr * (h1 - h0)) * g;
    // width follows height: the sheet's half is square, so a card as wide as
    // it is tall shows the blades at their painted proportions. A 1m-wide
    // card at 0.4m tall stretched every blade to twice its width.
    const w = Math.max(0.3, h0 + hr * (h1 - h0)) * (0.9 + wr * 0.4);
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, _q);
    _s.set(w, h, w);
    _t.set(x, _ground.y - 0.04, z);
    Matrix.ComposeToRef(_s, _q, _t, _m);
    _m.copyToArray(m, n * 16);
    // a clump-to-clump shade so the sward is not one flat colour
    const v = 0.86 + tone * 0.22;
    c[n * 4] = v; c[n * 4 + 1] = v; c[n * 4 + 2] = v * (0.94 + tone * 0.08); c[n * 4 + 3] = 1;
    n++;
  }
  return { m: m.subarray(0, n * 16), c: c.subarray(0, n * 4), n };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
