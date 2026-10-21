// The Keep's own materials and per-room extras (the Babylon half of the
// rebuild; keep.ts is the zone, keep_parts.ts the Babylon-free set pieces).
//
// The kit merges one mesh per (room x slot) in twelve slots. The Keep needs a
// few surfaces the slots cannot be: painted portraits, the household's woven
// heraldry, the chapel's stained glass, the windows onto the Capital (the
// `keep` bake through backdropWindowMaterial), the shafts of late sun from
// them, and the cold light of the king's chamber. Each is a Geom per (room x
// material), merged at finish into one mesh and switched with the room by the
// kit's culler (followGroup), so they cost a draw only where they are seen.
//
// The textures are drawn here on 2D canvases (no image files): portraits as a
// painter's dark ground, a lit face and a costume; the heraldry as a crimson
// field, a gold border and the household's crowned sun; the glass as leaded
// panes. Original work, nothing imported.
import { Color3, Constants, DynamicTexture, Mesh, RawTexture, StandardMaterial, Texture, VertexData, type AbstractMesh, type Material, type Scene, type TransformNode } from '@babylonjs/core';
import { Geom, type DungeonKit, type LightPools, type V3, type VisState } from '../dungeon-kit/index.ts';
import { glow } from '../scene';
import { backdropWindowMaterial } from '../dungeon-backdrop';

// ------------------------------------------------------------------ the culler hook
const followers = new WeakMap<DungeonKit, { node: AbstractMesh | TransformNode; group: string }[]>();
/** Show `node` only while the kit draws `group` (the kit's own rooms do the same). */
export function followGroup(kit: DungeonKit, node: AbstractMesh | TransformNode, group: string): void {
  let list = followers.get(kit);
  if (!list) {
    const mine: { node: AbstractMesh | TransformNode; group: string }[] = [];
    followers.set(kit, list = mine);
    const apply = kit.apply.bind(kit);
    kit.apply = (v) => { apply(v); for (const f of mine) f.node.setEnabled(!v || v.visible.has(f.group) || f.group === '*'); };
  }
  list.push({ node, group });
  node.setEnabled(!kit.vis || kit.vis.visible.has(group) || group === '*');
}

/** Run `fn` whenever the kit's culler applies a visibility (pools of our own). */
export function onApply(kit: DungeonKit, fn: (v: VisState | null) => void): void {
  const apply = kit.apply.bind(kit);
  kit.apply = (v) => { apply(v); fn(v); };
  fn(kit.vis);
}

/** The kit's LightPools draw unlit diffuse, which Babylon's StandardMaterial
 * zeroes when lighting is disabled (no lights: diffuseBase 0), so every pool is
 * black, and additive black is nothing. MEASURED in the Keep (a magenta pool
 * colour showed nothing). Put the colour in the emissive, which the falloff
 * texture multiplies (helper-requests.md 1). */
export function fixPools(pools: LightPools, color: string, strength: number): void {
  const m = pools.pool.mesh.material as StandardMaterial;
  m.emissiveColor = Color3.FromHexString(color).scale(strength);
  m.diffuseColor = Color3.Black();
}

// ------------------------------------------------------------------ extras
export type ExtraMat = 'painting' | 'heraldry' | 'stained' | 'window' | 'shaft' | 'linen' | 'velvet';

/** Geometry per (room x material) outside the kit's slots, merged at finish. */
export class Extras {
  private geo = new Map<string, Geom>();
  constructor(readonly scene: Scene, readonly kit: DungeonKit) {}
  g(group: string, mat: ExtraMat): Geom {
    const k = `${group}|${mat}`;
    let g = this.geo.get(k);
    if (!g) { g = new Geom(); this.geo.set(k, g); }
    return g;
  }
  finish(): void {
    for (const [k, g] of this.geo) {
      if (g.empty) continue;
      const [group, mat] = k.split('|') as [string, ExtraMat];
      const m = this.material(mat);
      if (!m) continue;
      const mesh = new Mesh(`kp_extra_${group}_${mat}`, this.scene), vd = new VertexData();
      const C = new Float32Array(g.vertexCount * 4);
      for (let i = 0; i < g.vertexCount; i++) { const c = g.c[i]; C[i * 4] = c; C[i * 4 + 1] = c; C[i * 4 + 2] = c; C[i * 4 + 3] = 1; }
      vd.positions = g.p; vd.normals = g.n; vd.uvs = g.uv; vd.indices = g.i; vd.colors = C;
      vd.applyToMesh(mesh);
      mesh.material = m;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      // the window panes are the Capital at infinity: the dungeon audit's backdrop
      if (mat === 'window') mesh.metadata = { backdrop: true };
      if (mat !== 'stained') glow?.addExcludedMesh(mesh);
      followGroup(this.kit, mesh, group);
    }
    this.geo.clear();
  }

  private mats = new Map<ExtraMat, Material | null>();
  private material(k: ExtraMat): Material | null {
    if (this.mats.has(k)) return this.mats.get(k)!;
    const s = this.scene;
    let m: Material | null = null;
    if (k === 'window') m = backdropWindowMaterial('kp_window_view', { bright: 1.05 });
    else if (k === 'shaft') m = shaftMaterial(s);
    else {
      const sm = new StandardMaterial(`kp_${k}`, s);
      sm.maxSimultaneousLights = 6;
      sm.specularColor = new Color3(0.04, 0.04, 0.04);
      if (k === 'painting') { sm.diffuseTexture = portraitAtlas(s); sm.specularColor = new Color3(0.14, 0.13, 0.12); sm.specularPower = 24; }
      if (k === 'heraldry') { sm.diffuseTexture = heraldryTexture(s); }
      if (k === 'linen') { sm.diffuseColor = Color3.FromHexString('#e8e0d0'); }
      if (k === 'velvet') { sm.diffuseColor = Color3.FromHexString('#7a1a24'); sm.specularColor = new Color3(0.12, 0.05, 0.06); sm.specularPower = 8; }
      if (k === 'stained') {
        // lit from behind by the afternoon: unlit, its own colours, and a soft glow
        const t = stainedTexture(s);
        sm.disableLighting = true; sm.emissiveTexture = t; sm.diffuseColor = Color3.Black(); sm.emissiveColor = Color3.Black();
        sm.metadata = { glow: 0.35 };
      }
      if (k === 'painting' || k === 'heraldry') (sm.diffuseTexture as Texture).anisotropicFilteringLevel = 4;
      m = sm;
    }
    this.mats.set(k, m);
    return m;
  }
}

// ------------------------------------------------------------------ light shafts
/** Additive, unlit, fogless, no depth write: a shaft of late sun. The texture
 * is soft across the shaft with faint streaks; the vertex colour fades it
 * along its length. */
function shaftMaterial(scene: Scene): Material {
  const N = 64, M = 8, px = new Uint8Array(N * M * 4);
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, streak = 0.78 + 0.22 * Math.sin(u * 37.0 + Math.sin(u * 11.0) * 2.0);
    const v = Math.round(255 * Math.pow(Math.sin(Math.PI * u), 1.6) * streak), k = (y * N + x) * 4;
    px[k] = px[k + 1] = px[k + 2] = v; px[k + 3] = 255;
  }
  const tex = RawTexture.CreateRGBATexture(px, N, M, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const m = new StandardMaterial('kp_shaft', scene);
  m.disableLighting = true;
  // MEASURED: with disableLighting a StandardMaterial has no diffuse term at
  // all (no lights, diffuseBase 0): the colour must be the EMISSIVE, which the
  // diffuse texture and the vertex colour then multiply (the falloff, the fade)
  m.diffuseTexture = tex; m.diffuseColor = Color3.Black(); m.emissiveColor = Color3.FromHexString('#ffd9a0').scale(0.3);
  m.specularColor = Color3.Black();
  m.alpha = 0.999; m.alphaMode = Constants.ALPHA_ONEONE;
  m.disableDepthWrite = true; m.fogEnabled = false; m.backFaceCulling = false;
  return m;
}

/** A shaft from a window: the opening's rectangle (centre, outward normal,
 * width, height) swept along the light's direction `d` (into the room and
 * down) to the floor at `floorY`, as four soft faces; strength 1 at the glass,
 * nothing at the floor. Returns the landing point (for a floor pool). */
export function shaft(g: Geom, w: { center: V3; normal: V3; w: number; h: number }, d: V3, floorY: number, spread = 1.12): V3 | null {
  const [cx, cy, cz] = w.center, [nx, , nz] = w.normal;
  // the opening's frame: a along the wall, up
  const ax = -nz, az = nx, hw = w.w / 2 * 0.92, hh = w.h / 2 * 0.9;
  if (d[0] * -nx + d[2] * -nz < 0.25 || d[1] >= -0.05) return null;
  const L = (cy - floorY) / -d[1];
  const corners: V3[] = [[cx - ax * hw, cy - hh, cz - az * hw], [cx + ax * hw, cy - hh, cz + az * hw], [cx + ax * hw, cy + hh, cz + az * hw], [cx - ax * hw, cy + hh, cz - az * hw]];
  // start a little inside the glass so the shaft never shows outside the wall
  const start = corners.map(([x, y, z]) => [x - nx * 1.4 + d[0] * 0.2, y + d[1] * 0.2, z - nz * 1.4 + d[2] * 0.2] as V3);
  const mid: V3 = [cx - nx * 1.4 + d[0] * L, cy + d[1] * L, cz - nz * 1.4 + d[2] * L];
  const end = start.map(([x, y, z]) => {
    const ex = x + d[0] * L, ey = y + d[1] * L, ez = z + d[2] * L;
    return [mid[0] + (ex - mid[0]) * spread, ey, mid[2] + (ez - mid[2]) * spread] as V3;
  });
  for (let k = 0; k < 4; k++) {
    const a0 = start[k], a1 = start[(k + 1) % 4], b0 = end[k], b1 = end[(k + 1) % 4];
    const base = g.vertexCount;
    const push = (p: V3, u: number, fade: number) => {
      g.p.push(p[0], p[1], p[2]); g.n.push(0, 1, 0); g.uv.push(u, 0); g.c.push(fade);
    };
    push(a0, 0, 1); push(a1, 1, 1); push(b1, 1, 0); push(b0, 0, 0);
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return mid;
}

/** A flat window pane over a slot's opening, a hair outside the glass line. */
export function pane(g: Geom, w: { center: V3; normal: V3; w: number; h: number }, inset = 0.02): void {
  const [cx, cy, cz] = w.center, [nx, , nz] = w.normal, ax = -nz, az = nx, hw = w.w / 2 + 0.05, hh = w.h / 2 + 0.05;
  const q: V3[] = [[cx - ax * hw, cy - hh, cz - az * hw], [cx + ax * hw, cy - hh, cz + az * hw], [cx + ax * hw, cy + hh, cz + az * hw], [cx - ax * hw, cy + hh, cz - az * hw]]
    .map(([x, y, z]) => [x + nx * inset, y, z + nz * inset] as V3);
  // faces back into the room (against the outward normal)
  g.poly(q, [-nx, 0, -nz], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// ------------------------------------------------------------------ painted textures
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Eight portraits of the household, 4 x 2 on a 1024 x 512 atlas: a painter's
 * dark ground, a figure in court dress, a lit face, the varnish gone amber. */
let portraitTex: DynamicTexture | null = null;
export function portraitAtlas(scene: Scene): DynamicTexture {
  if (portraitTex && portraitTex.getScene() === scene) return portraitTex;
  const W = 1024, H = 512, t = new DynamicTexture('kp_portraits', { width: W, height: H }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D, R = rng(4711);
  const robes = ['#5a1820', '#1e2c4a', '#24402e', '#3a2a48', '#6a4a1a', '#2a2a2a', '#4a1a3a', '#1a3a40'];
  for (let k = 0; k < 8; k++) {
    const x0 = (k % 4) * 256, y0 = Math.floor(k / 4) * 256, cx = x0 + 128;
    const bg = c.createLinearGradient(x0, y0, x0 + 256, y0 + 256);
    bg.addColorStop(0, '#3a2c1c'); bg.addColorStop(0.6, '#1c140c'); bg.addColorStop(1, '#0e0a06');
    c.fillStyle = bg; c.fillRect(x0, y0, 256, 256);
    // a drape or a column behind some sitters
    if (k % 3 === 0) { c.fillStyle = 'rgba(110,24,30,0.55)'; c.fillRect(x0, y0, 70, 256); }
    if (k % 3 === 1) { c.fillStyle = 'rgba(150,130,100,0.25)'; c.fillRect(x0 + 196, y0, 36, 256); }
    // shoulders and robe
    c.fillStyle = robes[k];
    c.beginPath(); c.moveTo(cx - 92, y0 + 256); c.quadraticCurveTo(cx - 84, y0 + 150, cx, y0 + 146); c.quadraticCurveTo(cx + 84, y0 + 150, cx + 92, y0 + 256); c.fill();
    // a collar or a chain of office
    c.strokeStyle = k % 2 ? '#d8c890' : '#b89a4a'; c.lineWidth = 6;
    c.beginPath(); c.arc(cx, y0 + 150, 34, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    if (k % 2 === 0) { c.fillStyle = '#e8e0cc'; c.beginPath(); c.ellipse(cx, y0 + 150, 26, 9, 0, 0, Math.PI * 2); c.fill(); }
    // the face: lit from the left, as the old painters did
    const face = c.createRadialGradient(cx - 10, y0 + 100, 4, cx, y0 + 108, 40);
    face.addColorStop(0, '#e8c8a4'); face.addColorStop(0.7, '#b08868'); face.addColorStop(1, '#5a4030');
    c.fillStyle = face; c.beginPath(); c.ellipse(cx, y0 + 106, 25 + R() * 4, 33, 0, 0, Math.PI * 2); c.fill();
    // hair or a cap
    c.fillStyle = ['#2a1c10', '#4a3420', '#7a6a50', '#1a1410'][k % 4];
    c.beginPath(); c.ellipse(cx, y0 + 84, 28, 18, 0, Math.PI, Math.PI * 2); c.fill();
    if (k === 0 || k === 5) { c.fillStyle = '#c8a050'; for (let j = -2; j <= 2; j++) c.fillRect(cx + j * 10 - 3, y0 + 58 - (j % 2 ? 0 : 8), 6, 14); c.fillRect(cx - 26, y0 + 68, 52, 6); }
    // eyes and mouth, barely
    c.fillStyle = 'rgba(40,24,16,0.7)'; c.fillRect(cx - 12, y0 + 100, 7, 3); c.fillRect(cx + 5, y0 + 100, 7, 3); c.fillRect(cx - 7, y0 + 122, 14, 2);
    // varnish: an amber vignette and a little craquelure
    const v = c.createRadialGradient(cx, y0 + 110, 40, cx, y0 + 128, 180);
    v.addColorStop(0, 'rgba(255,200,120,0.05)'); v.addColorStop(1, 'rgba(10,6,2,0.65)');
    c.fillStyle = v; c.fillRect(x0, y0, 256, 256);
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
    for (let j = 0; j < 30; j++) { c.beginPath(); const sx = x0 + R() * 256, sy = y0 + R() * 256; c.moveTo(sx, sy); c.lineTo(sx + (R() - 0.5) * 30, sy + (R() - 0.5) * 30); c.stroke(); }
  }
  t.update(true);
  return (portraitTex = t);
}
/** UV rect of portrait k on the atlas (u0, v0, u1, v1). */
export function portraitUV(k: number): [number, number, number, number] {
  const i = ((k % 8) + 8) % 8, u0 = (i % 4) / 4, row = Math.floor(i / 4);
  // DynamicTexture rows run top-down; v = 1 is the top
  const v1 = 1 - row / 2, v0 = v1 - 0.5;
  return [u0 + 0.004, v0 + 0.008, u0 + 0.25 - 0.004, v1 - 0.008];
}

/** The household's arms, woven: a crimson field, a gold border with a running
 * key, the crowned sun in the middle. One texture for banners and the cloth of estate. */
let heraldTex: DynamicTexture | null = null;
export function heraldryTexture(scene: Scene): DynamicTexture {
  if (heraldTex && heraldTex.getScene() === scene) return heraldTex;
  const W = 256, H = 512, t = new DynamicTexture('kp_heraldry', { width: W, height: H }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  const field = c.createLinearGradient(0, 0, W, 0);
  field.addColorStop(0, '#5a1018'); field.addColorStop(0.5, '#7a1a24'); field.addColorStop(1, '#5a1018');
  c.fillStyle = field; c.fillRect(0, 0, W, H);
  // the weave: faint horizontal and vertical threads
  c.globalAlpha = 0.08; c.fillStyle = '#000';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  for (let x = 0; x < W; x += 4) c.fillRect(x, 0, 1, H);
  c.globalAlpha = 1;
  // the gold border and its running key
  c.strokeStyle = '#c8a050'; c.lineWidth = 14; c.strokeRect(12, 12, W - 24, H - 24);
  c.strokeStyle = '#8a6a2a'; c.lineWidth = 3; c.strokeRect(26, 26, W - 52, H - 52);
  c.fillStyle = '#c8a050';
  for (let y = 40; y < H - 40; y += 24) { c.fillRect(30, y, 8, 3); c.fillRect(W - 38, y, 8, 3); }
  // the crowned sun
  const cx = W / 2, cy = H * 0.46;
  c.fillStyle = '#d8b060';
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, r0 = 44, r1 = k % 2 ? 66 : 80;
    c.beginPath(); c.moveTo(cx + Math.cos(a - 0.12) * r0, cy + Math.sin(a - 0.12) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a + 0.12) * r0, cy + Math.sin(a + 0.12) * r0); c.fill();
  }
  c.beginPath(); c.arc(cx, cy, 44, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#7a1a24'; c.beginPath(); c.arc(cx, cy, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8b060'; c.beginPath(); c.arc(cx, cy, 18, 0, Math.PI * 2); c.fill();
  // the crown over it
  const cy2 = cy - 104;
  c.beginPath(); c.moveTo(cx - 46, cy2 + 30); c.lineTo(cx - 46, cy2 - 4); c.lineTo(cx - 26, cy2 + 12); c.lineTo(cx - 12, cy2 - 16); c.lineTo(cx, cy2 + 8);
  c.lineTo(cx + 12, cy2 - 16); c.lineTo(cx + 26, cy2 + 12); c.lineTo(cx + 46, cy2 - 4); c.lineTo(cx + 46, cy2 + 30); c.closePath(); c.fill();
  c.fillStyle = '#7a1a24'; for (const dx of [-24, 0, 24]) { c.beginPath(); c.arc(cx + dx, cy2 + 22, 4, 0, Math.PI * 2); c.fill(); }
  // a motto band below
  c.fillStyle = '#c8a050'; c.fillRect(48, cy + 112, W - 96, 18);
  c.fillStyle = '#5a1018'; for (let x = 58; x < W - 58; x += 10) c.fillRect(x, cy + 117, 5, 8);
  t.update(true);
  return (heraldTex = t);
}

/** Leaded glass for the chapel's three lancets: deep blues and reds, a gold
 * sun at the head of the middle light, the lead lines dark. */
let stainedTex: DynamicTexture | null = null;
export function stainedTexture(scene: Scene): DynamicTexture {
  if (stainedTex && stainedTex.getScene() === scene) return stainedTex;
  const W = 256, H = 512, t = new DynamicTexture('kp_stained', { width: W, height: H }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D, R = rng(99);
  const cols = ['#1c3a8a', '#2a52b0', '#8a1a28', '#b02a30', '#c89a2a', '#2a6a4a', '#5a2a7a', '#d8c070'];
  c.fillStyle = '#101018'; c.fillRect(0, 0, W, H);
  const cell = 28;
  for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
    const dy = Math.abs(y - H * 0.3) / H, dx = Math.abs(x + cell / 2 - W / 2) / W;
    let col = cols[Math.floor(R() * 4)];
    if (dx < 0.18 && dy < 0.12) col = cols[R() < 0.6 ? 4 : 7];
    else if (R() < 0.15) col = cols[5 + Math.floor(R() * 2)];
    c.fillStyle = col;
    c.beginPath(); c.moveTo(x + 2 + R() * 3, y + 2); c.lineTo(x + cell - 2, y + 2 + R() * 3); c.lineTo(x + cell - 2 - R() * 3, y + cell - 2); c.lineTo(x + 2, y + cell - 2 - R() * 3); c.fill();
  }
  // the sun in the head
  c.fillStyle = '#ffe08a'; c.beginPath(); c.arc(W / 2, H * 0.3, 34, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#101018'; c.lineWidth = 4;
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 34, H * 0.3 + Math.sin(a) * 34); c.lineTo(W / 2 + Math.cos(a) * 70, H * 0.3 + Math.sin(a) * 70); c.stroke(); }
  // brighter toward the top, where the sky is
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  t.update(true);
  return (stainedTex = t);
}
