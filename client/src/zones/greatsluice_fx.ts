// The Great Sluice's moving water and light, the half the dungeon kit does not
// make: the race (a flowing surface, streaks running downstream, foam where
// the falls come in and where the wheel's buckets dip), caustics thrown up on
// the channel's walls, the falls and sprays (streaked additive sheets), and
// the daylight leaning in from the clerestory (soft additive sheets). Plus the
// glue for meshes the kit does not merge: `Tracked` switches a mesh with the
// kit's room culler (a mesh belongs to a group; '*' is always on).
//
// The shaders write display colours, like the kit's flames: a ShaderMaterial
// skips the scene's tone mapping, so the colours here are picked on screen.
// Every mesh here is out of the glow pass and not pickable; the additive ones
// carry alpha < 0.6 so the dungeon audit sees through them as it does glass.
import { Color3, Constants, Effect, Mesh, ShaderMaterial, Vector2, VertexData, type GlowLayer, type Scene } from '@babylonjs/core';
import type { Geom } from '../dungeon-kit/geom.ts';
import type { DungeonKit } from '../dungeon-kit/build.ts';

// ------------------------------------------------------------------ tracking
/** Meshes outside the kit, switched with its room culler. */
export class Tracked {
  readonly list: { group: string; mesh: Mesh }[] = [];
  add(group: string, mesh: Mesh): Mesh { this.list.push({ group, mesh }); return mesh; }
  attach(scene: Scene, kit: DungeonKit, glow: GlowLayer | null): void {
    for (const { mesh } of this.list) glow?.addExcludedMesh(mesh);
    let last: unknown = undefined;
    const sync = () => {
      const v = kit.vis;
      if (v === last) return;
      last = v;
      for (const { group, mesh } of this.list) mesh.setEnabled(group === '*' || !v || v.visible.has(group));
    };
    sync();
    scene.onBeforeRenderObservable.add(sync);
  }
}

/** A kit Geom as a mesh (the grime colour, metre UVs), as build.ts merges a slot. */
export function geomMesh(scene: Scene, name: string, g: Geom, alphaFromColour = false): Mesh {
  const n = g.vertexCount, C = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) { const c = g.c[k]; C[k * 4] = C[k * 4 + 1] = C[k * 4 + 2] = c; C[k * 4 + 3] = alphaFromColour ? c : 1; }
  const vd = new VertexData();
  vd.positions = new Float32Array(g.p); vd.normals = new Float32Array(g.n); vd.uvs = new Float32Array(g.uv); vd.colors = C;
  vd.indices = n <= 65535 ? new Uint16Array(g.i) : new Uint32Array(g.i);
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

/** A flat water sheet over a rectangle at y, gridded every `step` m; the
 * vertex colour's red is the foam mask `foam(x, z)` (0..1). Over a floor it
 * belongs in a basin room at floodLevels(threshold).water, below every
 * doorway and held by the kerb (DUNGEONS.md "Water in a dungeon"). */
export function waterSheet(scene: Scene, name: string, x0: number, z0: number, x1: number, z1: number, y: number, step: number, foam: (x: number, z: number) => number): Mesh {
  const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  const P: number[] = [], N: number[] = [], U: number[] = [], C: number[] = [], I: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
    P.push(x, y, z); N.push(0, 1, 0); U.push(x, z); C.push(Math.max(0, Math.min(1, foam(x, z))), 0, 0, 1);
  }
  // face up whichever way the corners are given (front faces wind
  // cross(b - a, c - a) . n < 0). MEASURED (flood pass, 2026-10-11): wound one
  // way for every rectangle, the race and the West Sump, both given x0 < x1 and
  // z0 < z1, faced down and were culled: the sump read as a dry floor and the
  // race as its dark bed.
  const up = (x1 - x0) * (z1 - z0) > 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (up) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
  }
  const vd = new VertexData();
  vd.positions = P; vd.normals = N; vd.uvs = U; vd.colors = C; vd.indices = I;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** A vertical sheet (a fall, a shaft of light) from a to b (the top edge's
 * ends) hanging `h` metres along `down` (default straight down); uv.x across
 * 0..1, uv.y 0 at the bottom, 1 at the top; vertex alpha `a` at the top
 * fading to `a1` at the bottom. */
export function sheet(scene: Scene, name: string, quads: { a: [number, number, number]; b: [number, number, number]; down: [number, number, number]; a0?: number; a1?: number; u1?: number }[]): Mesh {
  const P: number[] = [], N: number[] = [], U: number[] = [], C: number[] = [], I: number[] = [];
  for (const q of quads) {
    const base = P.length / 3, a0 = q.a0 ?? 1, a1 = q.a1 ?? 1, rows = 6;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      for (const [k, e] of [[0, q.a], [1, q.b]] as [number, [number, number, number]][]) {
        P.push(e[0] + q.down[0] * t, e[1] + q.down[1] * t, e[2] + q.down[2] * t);
        N.push(0, 0, 1); U.push(k * (q.u1 ?? 1), 1 - t);
        const al = a0 + (a1 - a0) * t;
        C.push(1, 1, 1, al);
      }
    }
    for (let r = 0; r < rows; r++) { const a = base + r * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const vd = new VertexData();
  vd.positions = P; vd.normals = N; vd.uvs = U; vd.colors = C; vd.indices = I;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

// ------------------------------------------------------------------ shaders
const VS = `precision highp float;
attribute vec3 position; attribute vec4 color; attribute vec2 uv;
uniform mat4 viewProjection;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
void main(void){ vPos=position; vColor=color; vUV=uv; gl_Position=viewProjection*vec4(position,1.0); }`;

const NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int k=0;k<4;k++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
float caust(vec2 p, float t){
  vec2 q=p+vec2(fbm(p*0.6+t*0.11), fbm(p*0.6-t*0.09))*1.6;
  float a=abs(sin(q.x*2.1+t*0.7)+sin(q.y*2.3-t*0.6)+sin((q.x+q.y)*1.6+t*0.5));
  return pow(clamp(1.0-a*0.42,0.0,1.0),5.0);
}`;

function register(): void {
  if (Effect.ShadersStore.gsWaterVertexShader) return;
  // The race: deep green-grey water running downstream. Two noise layers
  // advected at different speeds make the surface move with the flow, streaks
  // drawn out along it, a fresnel sheen of the lamplit vault at grazing
  // angles, a lamp glint, and foam where the vertex colour asks for it,
  // broken up and carried downstream.
  Effect.ShadersStore.gsWaterVertexShader = VS;
  Effect.ShadersStore.gsWaterFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform float fogDensity; uniform vec3 fogColor;
uniform vec3 deep; uniform vec3 shallow; uniform vec3 sheen; uniform vec2 flow; uniform float foamAmt;
${NOISE}
void main(void){
  vec2 p=vPos.xz, f=flow; float t=time, sp=length(f)+0.001;
  vec2 fd=f/sp, ac=vec2(fd.y,-fd.x);
  float n1=fbm(p*0.30-f*t*0.32);
  float n2=fbm(p*0.80-f*t*0.80+vec2(4.1,7.3));
  float st=vn(vec2(dot(p,ac)*1.3, dot(p,fd)*0.14-t*sp*0.5));
  vec3 N=normalize(vec3((n1-0.5)*0.8+(n2-0.5)*0.5, 1.0, (n2-0.5)*0.8-(n1-0.5)*0.4));
  vec3 V=normalize(eye-vPos);
  float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  vec3 col=mix(deep, shallow, smoothstep(0.25,0.8,n1));
  col+=sheen*fres;
  col+=shallow*0.35*smoothstep(0.6,0.95,st);
  vec3 H=normalize(normalize(vec3(0.25,1.0,-0.3))+V);
  col+=vec3(0.55,0.48,0.36)*pow(max(dot(N,H),0.0),140.0)*0.7;
  float fm=vColor.r*foamAmt;
  float fn=fbm(p*1.5-f*t*1.3)*0.65+vn(p*4.5-f*t*1.9)*0.35;
  float foam=smoothstep(0.42,0.82,fm*(0.55+fn));
  col=mix(col, vec3(0.60,0.68,0.66), foam*0.9);
  float fogf=exp(-pow(fogDensity*length(vPos-eye),2.0));
  gl_FragColor=vec4(mix(fogColor,col,fogf),1.0);
}`;

  // Caustics: the race's light thrown up on the channel walls, a moving web,
  // added; vColor.a fades it away from the water.
  Effect.ShadersStore.gsCausticVertexShader = VS;
  Effect.ShadersStore.gsCausticFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform vec3 tint; uniform float fogDensity;
${NOISE}
void main(void){
  float t=time*0.7;
  vec2 q=vec2(vUV.x*0.9, vPos.y*1.6-t*0.25);
  float c=caust(q,t)*0.8+caust(q*1.7+vec2(3.1,1.7),t*1.3)*0.4;
  float f=exp(-pow(fogDensity*length(vPos-eye),2.0));
  gl_FragColor=vec4(tint*c*vColor.a*f,1.0);
}`;

  // A fall or a spray: streaks running down a sheet, white water where it
  // lands (low vUV.y), soft at its sides.
  Effect.ShadersStore.gsFallVertexShader = VS;
  Effect.ShadersStore.gsFallFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform vec3 tint; uniform float speed; uniform float fogDensity;
${NOISE}
void main(void){
  float s=vn(vec2(vUV.x*22.0, vUV.y*3.0+time*speed))*0.6+vn(vec2(vUV.x*55.0, vUV.y*7.0+time*speed*1.4))*0.4;
  float streak=smoothstep(0.42,0.8,s);
  float side=pow(sin(clamp(vUV.x,0.0,1.0)*3.14159),0.7);
  float foam=smoothstep(0.35,0.0,vUV.y)*(0.5+0.5*vn(vec2(vUV.x*25.0,time*4.0)));
  vec3 c=tint*(streak*0.8+0.18)+vec3(0.55,0.62,0.6)*foam*0.7;
  float f=exp(-pow(fogDensity*length(vPos-eye),2.0));
  gl_FragColor=vec4(c*vColor.a*side*f,1.0);
}`;

  // Daylight leaning in through the windows: soft-sided additive sheets,
  // brightest at the window (vColor.a), dust drifting through them, fading
  // as the eye comes close so a shaft never fills the screen.
  Effect.ShadersStore.gsShaftVertexShader = VS;
  Effect.ShadersStore.gsShaftFragmentShader = `precision highp float;
varying vec3 vPos; varying vec4 vColor; varying vec2 vUV;
uniform vec3 eye; uniform float time; uniform vec3 tint;
${NOISE}
void main(void){
  float shimmer=0.7+0.3*vn(vec2(vUV.x*5.0, vPos.y*0.35-time*0.12));
  float mote=step(0.988,h21(floor(vec2(vUV.x*40.0, vPos.y*9.0+time*0.4))))*0.8;
  float near=smoothstep(2.0,9.0,length(vPos-eye));
  float side=pow(sin(clamp(vUV.x,0.0,1.0)*3.14159),1.8);
  float a=vColor.a*(shimmer+mote)*near*side;
  gl_FragColor=vec4(tint*a,1.0);
}`;
}

function shader(scene: Scene, name: string, kind: string, uniforms: string[], additive: boolean): ShaderMaterial {
  register();
  const m = new ShaderMaterial(name, scene, { vertex: kind, fragment: kind }, {
    attributes: ['position', 'color', 'uv'], uniforms: ['viewProjection', 'eye', 'time', 'fogDensity', 'fogColor', ...uniforms], needAlphaBlending: additive,
  });
  const t0 = performance.now();
  m.onBindObservable.add(() => {
    const e = m.getEffect(), cam = scene.activeCamera;
    if (!e || !cam) return;
    e.setVector3('eye', cam.globalPosition);
    e.setFloat('time', (performance.now() - t0) / 1000);
    e.setFloat('fogDensity', scene.fogEnabled && scene.fogMode !== 0 ? scene.fogDensity : 0);
    const c = scene.clearColor;
    e.setFloat3('fogColor', c.r, c.g, c.b);
  });
  if (additive) {
    m.alphaMode = Constants.ALPHA_ONEONE;
    m.disableDepthWrite = true;
    m.backFaceCulling = false;
    m.alpha = 0.5;
  }
  return m;
}

export interface WaterLook { deep: string; shallow: string; sheen: string; flow: [number, number]; foam: number }
export function waterMaterial(scene: Scene, name: string, o: WaterLook): ShaderMaterial {
  const m = shader(scene, name, 'gsWater', ['deep', 'shallow', 'sheen', 'flow', 'foamAmt'], false);
  m.setColor3('deep', Color3.FromHexString(o.deep));
  m.setColor3('shallow', Color3.FromHexString(o.shallow));
  m.setColor3('sheen', Color3.FromHexString(o.sheen));
  m.setVector2('flow', new Vector2(o.flow[0], o.flow[1]));
  m.setFloat('foamAmt', o.foam);
  return m;
}
export function causticMaterial(scene: Scene, tint: string): ShaderMaterial {
  const m = shader(scene, 'gs_caustics', 'gsCaustic', ['tint'], true);
  m.setColor3('tint', Color3.FromHexString(tint));
  return m;
}
export function fallMaterial(scene: Scene, name: string, tint: string, speed = 2.6): ShaderMaterial {
  const m = shader(scene, name, 'gsFall', ['tint', 'speed'], true);
  m.setColor3('tint', Color3.FromHexString(tint));
  m.setFloat('speed', speed);
  return m;
}
export function shaftMaterial(scene: Scene, tint: string): ShaderMaterial {
  const m = shader(scene, 'gs_shafts', 'gsShaft', ['tint'], true);
  m.setColor3('tint', Color3.FromHexString(tint));
  return m;
}
