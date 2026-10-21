// The Sunken Ballroom's own surfaces, the half the dungeon kit does not make:
// the lake seen through the palace's glass, the moonlight falling through the
// dome, the caustics it throws on the flooded floor, the water pouring through
// the Rose Salon's breach, the household's portraits, the guests' silk
// damask, silt. And `Extras`: geometry in materials of its own, merged per
// ROOM and switched with the kit's room culler, so it costs what the kit's own
// rooms cost (one draw per room and material in view).
//
// The shaders write display colours, like the kit's flames: a ShaderMaterial
// skips the scene's tone mapping.
import { Color3, Constants, DynamicTexture, Effect, Mesh, ShaderMaterial, StandardMaterial, Texture, VertexData, type GlowLayer, type Material, type Scene } from '@babylonjs/core';
import { Geom } from '../dungeon-kit/geom.ts';
import type { DungeonKit } from '../dungeon-kit/build.ts';

// ---------------------------------------------------------------- extras
/** Geometry by (room group, material key), merged at finish into one mesh
 * each and shown only while the kit's culler draws that group. Group '*' is
 * always shown. */
export class Extras {
  private geoms = new Map<string, { group: string; mat: string; g: Geom }>();
  readonly meshes: { group: string; mesh: Mesh }[] = [];
  g(group: string, mat: string): Geom {
    const k = `${group}|${mat}`;
    let e = this.geoms.get(k);
    if (!e) { e = { group, mat, g: new Geom() }; this.geoms.set(k, e); }
    return e.g;
  }
  finish(scene: Scene, kit: DungeonKit, mats: Record<string, Material>, glow: GlowLayer | null, opts: { pickable?: (mat: string) => boolean; glowing?: (mat: string) => boolean } = {}): void {
    for (const { group, mat, g } of this.geoms.values()) {
      if (g.empty) continue;
      const m = mats[mat];
      if (!m) throw new Error(`sunkenballroom extras: no material ${mat}`);
      const mesh = new Mesh(`sb_x_${group}_${mat}`, scene), vd = new VertexData();
      const C = new Float32Array(g.vertexCount * 4);
      for (let k = 0; k < g.vertexCount; k++) { const c = g.c[k]; C[k * 4] = c; C[k * 4 + 1] = c; C[k * 4 + 2] = c; C[k * 4 + 3] = c; }
      vd.positions = g.p; vd.normals = g.n; vd.uvs = g.uv; vd.colors = C;
      vd.indices = g.vertexCount > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i);
      vd.applyToMesh(mesh);
      mesh.material = m;
      mesh.isPickable = opts.pickable ? opts.pickable(mat) : true;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      if (!opts.glowing?.(mat)) glow?.addExcludedMesh(mesh);
      this.meshes.push({ group, mesh });
    }
    let last: unknown = undefined;
    const sync = () => {
      const v = kit.vis;
      if (v === last) return;
      last = v;
      for (const { group, mesh } of this.meshes) mesh.setEnabled(group === '*' || !v || v.visible.has(group));
    };
    sync();
    scene.onBeforeRenderObservable.add(sync);
  }
}

// ---------------------------------------------------------------- shaders
const COMMON_VS = `precision highp float;
attribute vec3 position; attribute vec4 color; attribute vec2 uv;
uniform mat4 viewProjection;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
void main(void){ vPos=position; vColor=color; vUV=uv; gl_Position=viewProjection*vec4(position,1.0); }`;

const NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int k=0;k<4;k++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
// a caustic web: the bright seams between two moving cell fields
float caust(vec2 p, float t){
  vec2 q=p+vec2(fbm(p*0.6+t*0.11), fbm(p*0.6-t*0.09))*1.6;
  float a=abs(sin(q.x*2.1+t*0.7)+sin(q.y*2.3-t*0.6)+sin((q.x+q.y)*1.6+t*0.5));
  return pow(clamp(1.0-a*0.42,0.0,1.0),5.0);
}`;

function register(): void {
  if (Effect.ShadersStore.sbLakeVertexShader) return;
  // The lake behind the glass: each pixel looks along the eye's line through
  // the pane, so the water has depth and moves as you walk. Up is the
  // moonlit surface, rippling; down is silt and weed in the dark; between,
  // shafts of light lean through slowly turning motes.
  Effect.ShadersStore.sbLakeVertexShader = COMMON_VS;
  Effect.ShadersStore.sbLakeFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time;
${NOISE}
void main(void){
  vec3 d=normalize(vPos-eye);
  float up=d.y;
  vec3 deep=vec3(0.010,0.045,0.055), mid=vec3(0.035,0.135,0.150), high=vec3(0.16,0.34,0.36);
  vec3 c=mix(deep, mid, smoothstep(-0.55,0.25,up));
  c=mix(c, high, smoothstep(0.15,0.85,up));
  // the surface overhead: a bright rippling sheet with the moon's glitter
  if(up>0.05){
    vec2 s=d.xz/max(up,0.05)*3.0;
    float r=caust(s+vec2(time*0.05,time*0.03), time*0.8);
    c+=vec3(0.30,0.48,0.46)*r*smoothstep(0.05,0.6,up);
  }
  // shafts of light leaning down through the water
  float ang=atan(d.x,d.z);
  float shafts=pow(vn(vec2(ang*7.0+up*2.5, time*0.05)),3.0)*smoothstep(-0.4,0.5,up)*(1.0-smoothstep(0.6,0.95,up));
  c+=vec3(0.12,0.24,0.24)*shafts;
  // drifting motes
  vec2 m=vec2(ang*30.0, up*30.0+time*0.15);
  float mote=step(0.985,h21(floor(m)))*smoothstep(0.35,0.0,length(fract(m)-0.5));
  c+=vec3(0.18,0.26,0.24)*mote;
  // weed and silt along the bed
  if(up<-0.05){
    float w=fbm(vec2(ang*9.0+sin(time*0.4+ang*3.0)*0.15, up*3.0));
    c*=mix(1.0, 0.35, smoothstep(0.45,0.7,w)*smoothstep(-0.05,-0.35,up));
  }
  // a pane's edge darkens a little toward the frame (vColor.r: 1 in the middle)
  c*=mix(0.7,1.0,vColor.r);
  gl_FragColor=vec4(c,1.0);
}`;

  // Moonlight falling through the water and the dome's lantern: additive
  // sheets, brightest at the top (vColor.a), a slow shimmer down their
  // length, fading as the eye comes close so a shaft never fills the screen.
  Effect.ShadersStore.sbShaftVertexShader = COMMON_VS;
  Effect.ShadersStore.sbShaftFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform vec3 tint;
${NOISE}
void main(void){
  float shimmer=0.65+0.35*vn(vec2(vUV.x*6.0, vPos.y*0.4-time*0.25));
  float near=smoothstep(1.5,6.0,length(vPos-eye));
  // soft sides: a sheet of light has no edge (vUV.x runs 0..1 across it)
  float side=pow(sin(clamp(vUV.x,0.0,1.0)*3.14159),1.6);
  float a=vColor.a*shimmer*near*side;
  gl_FragColor=vec4(tint*a,1.0);
}`;

  // Caustics on the flooded floor: the light through the water above drawn
  // as a moving web, added; vColor.a masks where the light falls.
  Effect.ShadersStore.sbCausticVertexShader = COMMON_VS;
  Effect.ShadersStore.sbCausticFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform float time; uniform vec3 tint; uniform vec3 eye; uniform float fogDensity;
${NOISE}
void main(void){
  float t=time*0.6;
  float c=caust(vPos.xz*0.55, t)*0.75+caust(vPos.xz*0.9+vec2(3.1,1.7), t*1.3)*0.45;
  float f=exp(-pow(fogDensity*length(vPos-eye),2.0));
  gl_FragColor=vec4(tint*c*vColor.a*f,1.0);
}`;

  // The lake pouring through the breach: streaks running down a sheet,
  // foaming white where it lands (low vUV.y).
  Effect.ShadersStore.sbFallVertexShader = COMMON_VS;
  Effect.ShadersStore.sbFallFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform float time;
${NOISE}
void main(void){
  float s=vn(vec2(vUV.x*26.0, vUV.y*3.0+time*2.6))*0.6+vn(vec2(vUV.x*60.0, vUV.y*7.0+time*3.6))*0.4;
  float streak=smoothstep(0.5,0.8,s);
  float side=pow(sin(clamp(vUV.x,0.0,1.0)*3.14159),0.8);
  float foam=smoothstep(0.3,0.0,vUV.y)*(0.5+0.5*vn(vec2(vUV.x*25.0,time*4.0)));
  vec3 c=vec3(0.42,0.60,0.62)*streak*0.75+vec3(0.6,0.75,0.75)*foam*0.7+vec3(0.05,0.10,0.11);
  gl_FragColor=vec4(c*vColor.a*side,1.0);
}`;
}

function shader(scene: Scene, name: string, kind: string, uniforms: string[], additive: boolean): ShaderMaterial {
  register();
  const m = new ShaderMaterial(name, scene, { vertex: kind, fragment: kind }, {
    attributes: ['position', 'color', 'uv'], uniforms: ['viewProjection', 'eye', 'time', ...uniforms], needAlphaBlending: additive,
  });
  const t0 = performance.now();
  m.onBindObservable.add(() => {
    const e = m.getEffect(), cam = scene.activeCamera;
    if (!e || !cam) return;
    e.setVector3('eye', cam.globalPosition);
    e.setFloat('time', (performance.now() - t0) / 1000);
    if (uniforms.includes('fogDensity')) e.setFloat('fogDensity', scene.fogEnabled && scene.fogMode !== 0 ? scene.fogDensity : 0);
  });
  if (additive) {
    m.alphaMode = Constants.ALPHA_ONEONE;
    m.disableDepthWrite = true;
    m.backFaceCulling = false;
  }
  return m;
}

export function lakeMaterial(scene: Scene): ShaderMaterial { return shader(scene, 'sb_lake', 'sbLake', [], false); }
export function shaftMaterial(scene: Scene, tint: string): ShaderMaterial {
  const m = shader(scene, 'sb_shafts', 'sbShaft', ['tint'], true);
  m.setColor3('tint', Color3.FromHexString(tint));
  return m;
}
export function causticMaterial(scene: Scene, tint: string): ShaderMaterial {
  const m = shader(scene, 'sb_caustics', 'sbCaustic', ['tint', 'fogDensity'], true);
  m.setColor3('tint', Color3.FromHexString(tint));
  return m;
}
export function fallMaterial(scene: Scene): ShaderMaterial { return shader(scene, 'sb_fall', 'sbFall', [], true); }

// ---------------------------------------------------------------- painted textures
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/**
 * The household's portraits: eight oils in one atlas (4 x 2 cells of
 * 256 x 384), dark varnished grounds, three-quarter figures in their finery,
 * each with a background of its own (a column, a curtain, a lake window),
 * craquelure, and a water line across the lower third where the lake reached
 * them. u 0..1 across the atlas; `portraitUV(k)` gives cell k's rectangle.
 */
export function portraitAtlas(scene: Scene): DynamicTexture {
  const W = 1024, H = 768, tex = new DynamicTexture('sb_portraits', { width: W, height: H }, scene, true);
  const g = tex.getContext() as CanvasRenderingContext2D;
  seed = 4711;
  const gowns = ['#5a2430', '#1f3a4a', '#3d2a4e', '#2c4a3a', '#6a4a22', '#4a1e22', '#22344e', '#58303e'];
  const grounds = ['#2a2418', '#1c2220', '#262019', '#20241e', '#29211a', '#1e1c1a', '#232620', '#2a221c'];
  for (let k = 0; k < 8; k++) {
    const x0 = (k % 4) * 256, y0 = Math.floor(k / 4) * 384;
    g.save(); g.beginPath(); g.rect(x0, y0, 256, 384); g.clip();
    const bg = g.createLinearGradient(x0, y0, x0 + 256, y0 + 384);
    bg.addColorStop(0, grounds[k]); bg.addColorStop(0.6, '#14110d'); bg.addColorStop(1, '#0c0a08');
    g.fillStyle = bg; g.fillRect(x0, y0, 256, 384);
    // the setting
    if (k % 3 === 0) { g.fillStyle = 'rgba(120,100,70,0.35)'; g.fillRect(x0 + 18, y0 + 30, 34, 300); g.fillStyle = 'rgba(150,130,95,0.3)'; g.fillRect(x0 + 12, y0 + 30, 46, 16); }
    else if (k % 3 === 1) { const cg = g.createLinearGradient(x0 + 150, 0, x0 + 256, 0); cg.addColorStop(0, 'rgba(90,20,30,0)'); cg.addColorStop(1, 'rgba(110,30,40,0.7)'); g.fillStyle = cg; g.fillRect(x0 + 150, y0, 106, 384); }
    else { const lg = g.createLinearGradient(0, y0 + 40, 0, y0 + 170); lg.addColorStop(0, 'rgba(110,150,160,0.5)'); lg.addColorStop(1, 'rgba(40,70,80,0.2)'); g.fillStyle = lg; g.fillRect(x0 + 170, y0 + 40, 60, 130); }
    // the figure: gown, shoulders, a lace collar, the head, the hair
    const cx = x0 + 128 + (rnd() - 0.5) * 20, sh = y0 + 190;
    g.fillStyle = gowns[k];
    g.beginPath(); g.moveTo(cx - 70, y0 + 384); g.quadraticCurveTo(cx - 78, sh + 20, cx - 40, sh); g.lineTo(cx + 40, sh); g.quadraticCurveTo(cx + 78, sh + 20, cx + 70, y0 + 384); g.closePath(); g.fill();
    const sheen = g.createLinearGradient(cx - 60, 0, cx + 60, 0); sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.35, 'rgba(255,240,220,0.12)'); sheen.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = sheen; g.fill();
    g.fillStyle = 'rgba(230,220,200,0.85)';
    g.beginPath(); g.ellipse(cx, sh + 4, 34, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a07e'; g.fillRect(cx - 11, sh - 26, 22, 26);
    const face = g.createRadialGradient(cx - 8, sh - 62, 4, cx, sh - 55, 34); face.addColorStop(0, '#e6c4a2'); face.addColorStop(1, '#9a6e50');
    g.fillStyle = face; g.beginPath(); g.ellipse(cx, sh - 56, 24, 31, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = ['#2a1a10', '#5a4028', '#8a7050', '#1a1410'][k % 4];
    g.beginPath(); g.ellipse(cx, sh - 74, 28, 22, 0, Math.PI, Math.PI * 2); g.fill();
    if (k % 2) { g.beginPath(); g.ellipse(cx - 22, sh - 46, 9, 26, 0.2, 0, Math.PI * 2); g.ellipse(cx + 22, sh - 46, 9, 26, -0.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(40,25,15,0.6)'; g.fillRect(cx - 9, sh - 60, 5, 3); g.fillRect(cx + 4, sh - 60, 5, 3);
    // a jewel, an order's sash, a fan: one per sitter
    g.fillStyle = 'rgba(200,170,90,0.8)';
    if (k % 4 === 0) { g.beginPath(); g.arc(cx, sh + 26, 6, 0, Math.PI * 2); g.fill(); }
    if (k % 4 === 1) { g.save(); g.translate(cx, sh + 60); g.rotate(-0.6); g.fillRect(-60, -6, 120, 12); g.restore(); }
    if (k % 4 === 2) { g.beginPath(); g.moveTo(cx + 30, sh + 110); g.arc(cx + 30, sh + 110, 40, -2.6, -1.2); g.closePath(); g.fill(); }
    // varnish, craquelure, the water line
    const vg = g.createRadialGradient(x0 + 128, y0 + 170, 40, x0 + 128, y0 + 192, 240); vg.addColorStop(0, 'rgba(255,200,120,0.08)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(x0, y0, 256, 384);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 60; i++) { g.beginPath(); let px = x0 + rnd() * 256, py = y0 + rnd() * 384; g.moveTo(px, py); for (let s = 0; s < 4; s++) { px += (rnd() - 0.5) * 30; py += (rnd() - 0.5) * 30; g.lineTo(px, py); } g.stroke(); }
    const wl = y0 + 250 + rnd() * 40, wg = g.createLinearGradient(0, wl - 10, 0, y0 + 384);
    wg.addColorStop(0, 'rgba(60,80,60,0)'); wg.addColorStop(0.05, 'rgba(70,90,70,0.45)'); wg.addColorStop(0.15, 'rgba(40,55,45,0.35)'); wg.addColorStop(1, 'rgba(25,35,28,0.6)');
    g.fillStyle = wg; g.fillRect(x0, wl - 10, 256, y0 + 384 - wl + 10);
    g.restore();
  }
  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
export const portraitUV = (k: number): [number, number, number, number] => {
  const c = k % 4, r = Math.floor(k / 4) % 2;
  return [c / 4 + 0.004, 1 - (r + 1) / 2 + 0.004, (c + 1) / 4 - 0.004, 1 - r / 2 - 0.004];
};

/** A silk damask, teal on teal: a repeat of a lily-and-scroll motif, one
 * repeat per metre (the kit's UVs are metres). */
export function damask(scene: Scene, ground: string, figure: string): DynamicTexture {
  const S = 256, tex = new DynamicTexture('sb_damask', { width: S, height: S }, scene, true);
  const g = tex.getContext() as CanvasRenderingContext2D;
  g.fillStyle = ground; g.fillRect(0, 0, S, S);
  // fine vertical rib of the weave
  for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + 0.03 * ((x / 2) % 2)})`; g.fillRect(x, 0, 1, S); }
  const motif = (cx: number, cy: number, s: number) => {
    g.save(); g.translate(cx, cy); g.scale(s, s);
    g.fillStyle = figure;
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(side * 30, -40, side * 34, -6, side * 10, 6); g.bezierCurveTo(side * 26, 14, side * 30, 40, 0, 50);
      g.bezierCurveTo(side * 12, 30, side * 8, 12, 0, 8); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(side * 34, -24, 9, 16, side * 0.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(side * 30, 30, 8, 13, -side * 0.5, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.moveTo(0, -60); g.lineTo(6, -48); g.lineTo(0, -40); g.lineTo(-6, -48); g.closePath(); g.fill();
    g.restore();
  };
  motif(S / 2, S / 2, 1.2);
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) motif(x, y, 0.75);
  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Silt: grey-green lake mud over the marble, from a CC0 sand sheet. */
export function siltMaterial(scene: Scene): StandardMaterial {
  const m = new StandardMaterial('sb_silt', scene);
  const d = new Texture('/tex/aerial_beach_01_diff.jpg', scene), n = new Texture('/tex/aerial_beach_01_nor.jpg', scene);
  d.uScale = d.vScale = 0.35; n.uScale = n.vScale = 0.35; n.level = 0.7;
  m.diffuseTexture = d; m.bumpTexture = n;
  m.diffuseColor = Color3.FromHexString('#6f7a68');
  m.specularColor = new Color3(0.08, 0.09, 0.08);
  m.maxSimultaneousLights = 6;
  return m;
}

/** A painted-canvas material for the portraits. */
export function portraitMaterial(scene: Scene, atlas: DynamicTexture): StandardMaterial {
  const m = new StandardMaterial('sb_portrait', scene);
  m.diffuseTexture = atlas;
  m.specularColor = new Color3(0.12, 0.11, 0.1); m.specularPower = 40;
  m.emissiveColor = new Color3(0.1, 0.09, 0.08);
  m.maxSimultaneousLights = 6;
  return m;
}
