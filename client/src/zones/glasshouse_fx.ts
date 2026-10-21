// The Propagating Cellars' own surfaces, the part the dungeon kit does not
// make: the glasshouse's daylight. The floor lights' panes and the office's
// glazed vault (whitewashed glass with the shadows of the fronds above it),
// the shafts of light falling through them, the cool pools they lay on the
// floor, the bark of the roots, the Regent's planting plan. And `Extras`:
// geometry in these materials, merged per ROOM and switched with the kit's
// room culler, so it costs what the kit's own rooms cost.
import { Color3, Constants, DynamicTexture, Effect, Mesh, ShaderMaterial, StandardMaterial, Texture, VertexData, type GlowLayer, type Material, type Scene } from '@babylonjs/core';
import { Geom } from '../dungeon-kit/geom.ts';
import { LightPools } from '../dungeon-kit/instances.ts';
import type { DungeonKit } from '../dungeon-kit/build.ts';
import { hash } from './glasshouse_parts';

// ---------------------------------------------------------------- extras
/** Geometry by (room group, material key), merged at finish into one mesh
 * each and shown only while the kit's culler draws that group ('*' always).
 * Extra light-pool sets follow the culler too. */
export class Extras {
  private geoms = new Map<string, { group: string; mat: string; g: Geom }>();
  readonly meshes: { group: string; mesh: Mesh }[] = [];
  readonly pools: LightPools[] = [];
  g(group: string, mat: string): Geom {
    const k = `${group}|${mat}`;
    let e = this.geoms.get(k);
    if (!e) { e = { group, mat, g: new Geom() }; this.geoms.set(k, e); }
    return e.g;
  }
  finish(scene: Scene, kit: DungeonKit, mats: Record<string, Material>, glow: GlowLayer | null, glowing: string[] = []): void {
    for (const { group, mat, g } of this.geoms.values()) {
      if (g.empty) continue;
      const m = mats[mat];
      if (!m) throw new Error(`glasshouse extras: no material ${mat}`);
      const mesh = new Mesh(`gh_x_${group}_${mat}`, scene), vd = new VertexData();
      const C = new Float32Array(g.vertexCount * 4);
      for (let k = 0; k < g.vertexCount; k++) { const c = g.c[k]; C[k * 4] = c; C[k * 4 + 1] = c; C[k * 4 + 2] = c; C[k * 4 + 3] = c; }
      vd.positions = g.p; vd.normals = g.n; vd.uvs = g.uv; vd.colors = C;
      vd.indices = g.vertexCount > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i);
      vd.applyToMesh(mesh);
      mesh.material = m;
      mesh.isPickable = mat !== 'shaft';
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      if (!glowing.includes(mat)) glow?.addExcludedMesh(mesh);
      this.meshes.push({ group, mesh });
    }
    for (const p of this.pools) { p.upload(); glow?.addExcludedMesh(p.pool.mesh); }
    let last: unknown = undefined;
    const sync = () => {
      const v = kit.vis;
      if (v === last) return;
      last = v;
      for (const { group, mesh } of this.meshes) mesh.setEnabled(group === '*' || !v || v.visible.has(group));
      for (const p of this.pools) p.update(v);
    };
    sync();
    scene.onBeforeRenderObservable.add(sync);
    // follow kit.apply at once too (the culler calls it; so does the dungeon
    // audit, apply(null), and then casts without rendering a frame)
    const apply = kit.apply.bind(kit);
    kit.apply = (v) => { apply(v); sync(); };
  }
}

// ---------------------------------------------------------------- daylight
/** Whitewashed glass seen from below: the day behind it, brighter toward the
 * middle, the glazing's own prisms as a faint grid of cells, and the shadows
 * of what grows on the other side (palm fronds, broad leaves, a vine) laid on
 * it soft. Unlit: it IS the light. One texture for every pane. */
export function paneTexture(scene: Scene, name: string, fronds: number, seed: number): DynamicTexture {
  const S = 512, tex = new DynamicTexture(name, { width: S, height: S }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, '#f4fbe6'); g.addColorStop(0.6, '#d8ecc8'); g.addColorStop(1, '#a9c9a2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // the prisms: a fine grid of slightly darker seams and brighter cells
  ctx.globalAlpha = 0.12; ctx.strokeStyle = '#6f8c6c'; ctx.lineWidth = 2;
  for (let k = 0; k <= 16; k++) { ctx.beginPath(); ctx.moveTo(k * S / 16, 0); ctx.lineTo(k * S / 16, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k * S / 16); ctx.lineTo(S, k * S / 16); ctx.stroke(); }
  // the fronds: soft dark silhouettes, blurred
  ctx.globalAlpha = 1;
  (ctx as unknown as { filter: string }).filter = 'blur(7px)';
  for (let f = 0; f < fronds; f++) {
    const x = hash(seed, f, 1) * S, y = hash(seed, f, 2) * S, ang = hash(seed, f, 3) * Math.PI * 2, len = S * (0.25 + hash(seed, f, 4) * 0.35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalAlpha = 0.12 + hash(seed, f, 5) * 0.12;
    ctx.fillStyle = '#2f4a2c'; ctx.strokeStyle = '#2f4a2c';
    if (hash(seed, f, 6) < 0.6) {
      // a palm frond: a curved rib and leaflets down both sides
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.12, len, len * 0.3); ctx.stroke();
      for (let k = 2; k < 18; k++) {
        const t = k / 18, px = len * t, py = len * 0.3 * t * t, l = len * 0.24 * Math.sin(t * Math.PI);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + l * 0.4, py + s * l * 0.5, px + l * 0.55, py + s * l); ctx.lineWidth = 7 * (1 - t) + 2; ctx.stroke(); }
      }
    } else {
      // broad leaves on a stem
      for (let k = 0; k < 4; k++) {
        ctx.beginPath(); ctx.ellipse(len * 0.25 * k, (k % 2 ? 1 : -1) * len * 0.08, len * 0.16, len * 0.07, (k % 2 ? 0.5 : -0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  (ctx as unknown as { filter: string }).filter = 'none';
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

export function paneMaterial(scene: Scene, tex: Texture, level: number, name = 'gh_pane'): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  // MEASURED (the second look rendered every pane black): with lighting off,
  // StandardMaterial's colour is (emissive + ambient) x the diffuse TEXTURE; the
  // diffuse colour drops out with the lights. So the level is the emissive.
  m.disableLighting = true;
  m.diffuseTexture = tex; m.diffuseColor = Color3.Black();
  m.emissiveColor = new Color3(level, level * 1.02, level * 0.96); m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  return m;
}

const SHAFT_VS = `precision highp float;
attribute vec3 position; attribute vec4 color; attribute vec2 uv;
uniform mat4 viewProjection;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
void main(void){ vPos=position; vColor=color; vUV=uv; gl_Position=viewProjection*vec4(position,1.0); }`;

function registerShaft(): void {
  if (Effect.ShadersStore.ghShaftVertexShader) return;
  Effect.ShadersStore.ghShaftVertexShader = SHAFT_VS;
  // Daylight falling through a pane: an additive sheet, brightest at the top
  // (vColor.a), soft at both sides (vUV.x 0..1), fading as the eye comes
  // close so a shaft never fills the screen, with dust turning slowly in it.
  Effect.ShadersStore.ghShaftFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform vec3 tint;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(void){
  float shimmer=0.7+0.3*vn(vec2(vUV.x*5.0, vPos.y*0.35-time*0.12));
  float near=smoothstep(1.2,5.5,length(vPos-eye));
  float side=pow(sin(clamp(vUV.x,0.0,1.0)*3.14159),1.8);
  vec2 m=vec2(vUV.x*40.0, vPos.y*9.0+time*0.25+vUV.x*3.0);
  float mote=step(0.975,h21(floor(m)))*smoothstep(0.4,0.0,length(fract(m)-0.5));
  float a=vColor.a*(shimmer*side+mote*0.9*side)*near;
  gl_FragColor=vec4(tint*a,1.0);
}`;
}

export function shaftMaterial(scene: Scene, tint: string, name = 'gh_shafts'): ShaderMaterial {
  registerShaft();
  const m = new ShaderMaterial(name, scene, { vertex: 'ghShaft', fragment: 'ghShaft' }, {
    attributes: ['position', 'color', 'uv'], uniforms: ['viewProjection', 'eye', 'time', 'tint'], needAlphaBlending: true,
  });
  m.setColor3('tint', Color3.FromHexString(tint));
  const t0 = performance.now();
  m.onBindObservable.add(() => {
    const e = m.getEffect(), cam = scene.activeCamera;
    if (!e || !cam) return;
    e.setVector3('eye', cam.globalPosition);
    e.setFloat('time', (performance.now() - t0) / 1000);
  });
  m.alphaMode = Constants.ALPHA_ONEONE;
  m.disableDepthWrite = true;
  m.backFaceCulling = false;
  return m;
}

/** A shaft of light from a pane (centre top, w x d) down to the floor at y0,
 * leaning along `lean` (x, z per metre of fall): three crossed sheets. The
 * vertex colour's alpha carries the strength, top to bottom. */
export function shaft(g: Geom, cx: number, top: number, cz: number, w: number, d: number, y0: number, lean: [number, number], k = 0.32): void {
  const fall = top - y0, ox = lean[0] * fall, oz = lean[1] * fall, base = g.vertexCount;
  void base;
  const sheets: [number, number, number, number][] = [[-w / 2, 0, w / 2, 0], [0, -d / 2, 0, d / 2], [-w * 0.35, -d * 0.35, w * 0.35, d * 0.35]];
  for (const [ax, az, bx, bz] of sheets) {
    const v0 = g.vertexCount;
    const P: [number, number, number, number, number][] = [
      [cx + ax, top, cz + az, 0, k], [cx + bx, top, cz + bz, 1, k],
      [cx + bx * 1.25 + ox, y0 + 0.05, cz + bz * 1.25 + oz, 1, 0], [cx + ax * 1.25 + ox, y0 + 0.05, cz + az * 1.25 + oz, 0, 0],
    ];
    for (const [x, y, z, u, a] of P) { g.p.push(x, y, z); g.n.push(0, 1, 0); g.uv.push(u, y); g.c.push(a); }
    g.i.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
}

/** Bark for the roots: the kit's timber sheet, dark and wet. */
export function barkMaterial(scene: Scene): StandardMaterial {
  const m = new StandardMaterial('gh_bark', scene);
  const d = new Texture('/tex/dungeon/timber_diff.jpg', scene), n = new Texture('/tex/dungeon/timber_nor_gl.jpg', scene);
  d.uScale = n.uScale = 1.2; d.vScale = n.vScale = 0.6; n.level = 1.1;
  m.diffuseTexture = d; m.bumpTexture = n;
  m.diffuseColor = Color3.FromHexString('#7a5c44');
  m.specularColor = new Color3(0.12, 0.11, 0.09); m.specularPower = 40;
  m.maxSimultaneousLights = 6;
  return m;
}

/** The Regent's planting plan for the capital's parks: parterres in rows,
 * avenues, the beds numbered, "PHASE III" over it. Painted once. */
export function planMaterial(scene: Scene): StandardMaterial {
  const W = 512, H = 384, tex = new DynamicTexture('gh_plan', { width: W, height: H }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = '#d9cfae'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#3c3a2c'; c.lineWidth = 3; c.strokeRect(14, 14, W - 28, H - 28);
  c.fillStyle = '#3c3a2c'; c.font = 'bold 26px serif'; c.textAlign = 'center';
  c.fillText('PHASE III', W / 2, 48);
  c.font = 'italic 15px serif'; c.fillText('Stock for the Capital’s parks · by order of the Regent', W / 2, 70);
  // the avenues and the parterres
  c.lineWidth = 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const x = 48 + i * 108, y = 94 + j * 88;
    c.strokeStyle = '#4a5a34'; c.strokeRect(x, y, 88, 70);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 88, y + 70); c.moveTo(x + 88, y); c.lineTo(x, y + 70); c.stroke();
    c.beginPath(); c.arc(x + 44, y + 35, 14, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#5d7040';
    for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(x + 6 + k * 10.8, y - 6, 3.2, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#3c3a2c'; c.font = '11px serif'; c.fillText(`${i + 1 + j * 4}`, x + 44, y + 39);
  }
  tex.update();
  const m = new StandardMaterial('gh_plan_m', scene);
  m.diffuseTexture = tex; m.specularColor = new Color3(0.04, 0.04, 0.04);
  m.emissiveColor = new Color3(0.08, 0.08, 0.07);
  m.maxSimultaneousLights = 6;
  return m;
}
