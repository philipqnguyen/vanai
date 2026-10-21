// The two portal looks (Philip, 2026-10-10, ported from tmp/wilds/portal-studies.html):
//
//   DAWN VEIL  -- strands of warm light rising off a threshold, gold at the floor
//                 to pale teal at the head, sparks lifting off it. Wherever you
//                 pass THROUGH something: a door, a gate, a causeway, a zone's edge.
//   RUNE CIRCLE -- a glyph disc on the ground, a light column out of it, five
//                 crystal shards circling at head height, motes. Where you
//                 enter from open ground, with nothing to pass through, and as
//                 a dungeon's way back out, in its entry room -- where the
//                 column stops short of the ceiling (its `column` height).
//
// What replaced them was a billboarded blue card -- "a flat sheet, not a portal".
// Both are light, not surfaces: additive shader cards with no depth write, a
// soft pool on the ground in place of a lamp (no real lights -- WebKit's ten per
// mesh), and one emitter. Per portal that is a veil card + a pool + an emitter;
// a rune is a disc + a column + one thin-instanced shard mesh (5) + a pool + an
// emitter. The sizes and the classification are Babylon-free (portal_plan.ts).
//
// The shaders' noise runs in METRES (the card's uv times its size), so a 9 m
// causeway veil has more strands than a 4 m door rather than the same strands
// stretched -- which is what made the old card read as a printed sheet.
//
// Not image-processed: a ShaderMaterial skips the material-level ACES the
// Standard/PBR materials get (scene.ts setupToneMapping), exactly as in the
// studies these colours were judged in, so the look carries over unchanged.
// Fog is applied by hand (the zone's EXP2 density), fading the light toward
// nothing with distance: additive light fogged toward the fog colour would be a
// bright smear in the haze, not a distant glow.
//
// Glow: OPT-IN as everywhere (scene.ts setupGlow). Only the rune's disc renders
// into the glow layer, with its OWN material (referenceMeshToUseItsOwnMaterial),
// so its thin glyph lines bloom; the veil stays out (it is already light, and
// bloomed it washed the opening white); the shards stay out too: at head height
// their bloom shone through pillars and walls, because a dungeon's glow pass has
// only emitters and the plan's walls in it to occlude (dungeon-kit/glow.ts), so
// the halo of a shard behind a column hung on the column's face (Philip,
// 2026-10-11). Lit, with their emissive raised, their facets read without it. Every
// other portal mesh is EXCLUDED from the glow layer
// (glowSkip), not merely left dark: left in, it is drawn there as a black
// occluder.
//
// Lifetime (SCENE-LIFETIME.md): everything here is created in, and disposed
// with, the scene it is given. The only module state is the global shader
// store (scene-independent) and a WeakMap of one sprite per scene, which
// cannot keep a departed scene alive. Time reaches the shaders through each
// material's own onBind, and the shards' orbit observer is removed when their
// mesh is disposed.
import {
  Scene, Mesh, MeshBuilder, ShaderMaterial, Effect, Constants, Vector2, Vector3, Color3, Color4,
  ParticleSystem, DynamicTexture, StandardMaterial, Matrix, Quaternion, GlowLayer, VertexBuffer,
  BoundingInfo, AbstractMesh,
} from "@babylonjs/core";
import { VEIL_COLOURS, RUNE_COLOURS, veilFeather, veilShapeCode, VeilFrame, runeColumn, runeHead, runeSpec, PortalData, RuneSpec } from "./portal_plan";
import { ZONES } from "./data";

export interface PortalFxContext {
  scene: Scene;
  /** the zone's glow layer (scene.ts `glow`), when there is one */
  glow?: GlowLayer | null;
  /** scene.ts fxParticles: every particle effect goes through it (render group 1) */
  particles: (ps: ParticleSystem) => ParticleSystem;
  /** the walkable surface, built floors included (scene.ts groundHeight) */
  ground: (x: number, z: number) => number;
}

export interface VeilOpts {
  id: string;
  /** the middle of the threshold */
  x: number; z: number;
  /** the floor the strands rise off */
  y: number;
  width: number; height: number;
  /** the card's normal is (sin yaw, 0, cos yaw): it faces ALONG the passage, so it spans across it */
  yaw: number;
  frame: VeilFrame;
}

export interface RuneOpts {
  id: string; x: number; z: number; y: number; radius: number;
  /** the column's height (portal_plan runeSpec); under a ceiling, short of it */
  column?: number;
  /** a built floor's top above the ground the disc follows (runeSpec) */
  floor?: number;
}

// scene.ts buildPortals hands makeRuneCircle the radius but not yet the column
// or the floor (tmp/wilds/audit/rune-requests.md): until it does, the portal's
// own data is read by its id, so a dungeon's rune fits its room either way.
function specFor(id: string): RuneSpec | undefined {
  for (const z of Object.values(ZONES as Record<string, { portals?: PortalData[] }>)) {
    const p = z.portals?.find((q) => q.id === id);
    if (p) return runeSpec(p);
  }
  return undefined;
}

/** what a portal leaves in the scene: the pickable mesh the world object hangs on, and a show/hide */
export interface PortalFx {
  /** pickable; world.ts toggles it (restoreGatedPortals) and the rest follows it */
  pick: Mesh;
  parts: AbstractMesh[];
  emitter: ParticleSystem;
}

// ---------------------------------------------------------------- shaders
const COMMON = `
precision highp float;
varying vec2 vUV;
varying float vDist;
uniform float uTime;
uniform vec2 uSize;
uniform float uShape;
uniform float uFeather;
uniform float uGain;
uniform float uFog;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
#define TAU 6.2831853
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
// EXP2, as the zone's own fog; the light fades out rather than toward a colour
float fogK(){ float f = vDist * uFog; return exp(-f*f); }
`;

const VERT = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 world; uniform mat4 worldViewProjection; uniform vec3 uEye;
varying vec2 vUV; varying float vDist;
void main(){
  vUV = uv;
  vDist = length((world * vec4(position, 1.)).xyz - uEye);
  gl_Position = worldViewProjection * vec4(position, 1.);
}
`;

const FRAG: Record<string, string> = {
  // Additive strands rising off the threshold; nothing flat, every pixel moves.
  // uShape: 0 a round-headed opening, 1 a rectangle (both feathered uFeather in
  // from their outline), 2 free (soft sides, the head fading into air), 3 span
  // (sides that meet what flanks them -- parapets -- and a head fading into air).
  veil: `
float sdShape(vec2 p){
  vec2 h = uSize * .5;
  if (uShape < .5) { float r = h.x, cy = h.y - r;
    if (p.y > cy) return r - length(p - vec2(0., cy));
    return min(h.x - abs(p.x), p.y + h.y); }
  if (uShape < 1.5) return min(h.x - abs(p.x), h.y - abs(p.y));
  return h.x - abs(p.x);
}
void main(){
  vec2 p = (vUV - .5) * uSize;
  float d = sdShape(p);
  if (d < 0.) discard;
  float y = vUV.y;
  float sway = sin(p.y*.7 - uTime*1.3)*.25 + (fbm(vec2(p.y*.3, uTime*.2)) - .5)*.8;
  float x = p.x + sway;
  float cols = fbm(vec2(x*1.4, p.y*.16 - uTime*.32));
  float strands = pow(noise(vec2(x*5.5, uTime*.12)), 4.) * 3.;
  float rise = fbm(vec2(x*2.6, p.y*.7 - uTime*1.2));
  float body = cols*.55*smoothstep(.25, .75, cols) + strands*rise;
  float floorGlow = exp(-(p.y + uSize.y*.5)*1.1);
  float fadeUp = mix(1., .18, smoothstep(.0, 1., y));
  float edge = smoothstep(0., uFeather, d);
  float head = uShape > 1.5 ? 1. - smoothstep(.35, 1., y) : 1.;
  vec3 col = mix(uA, uB, smoothstep(.05, .95, y));
  col = mix(col, uC, clamp(pow(body, 2.)*.8, 0., 1.));
  // The studies' 1.5x colour and full strength were judged at dusk on a dark
  // stage; over a lit zone they burned white and hid what is behind (the first
  // look). Less of both keeps the gold-to-teal and lets the far side through.
  float I = (body*fadeUp*1.25 + floorGlow*(.25 + .45*rise)) * edge * head * fogK() * uGain * .55;
  gl_FragColor = vec4(col * 1.1, clamp(I, 0., 1.));
}`,
  // a ground disc: rings, two bands of turning glyphs, a hexagram, a pulse.
  // Every line's falloff is fall(), never smoothstep(w, 0., x): GLSL leaves a
  // smoothstep with its edges reversed undefined, so a driver may draw nothing.
  rune: `
float fall(float w, float x){ return 1. - smoothstep(0., w, x); }
float ring(float r, float at, float w){ return fall(w, abs(r - at)); }
float glyphs(float r, float a, float r0, float r1, float n, float seed){
  float g = (r - r0) / (r1 - r0);
  if (g < 0. || g > 1.) return 0.;
  float u = a / TAU * n; float id = floor(u); float cx = fract(u);
  float h1 = hash(vec2(id, seed)), h2 = hash(vec2(id, seed + 1.)), h3 = hash(vec2(id, seed + 2.)), h4 = hash(vec2(id, seed + 3.));
  float lw = .11, v = 0.;
  v += step(.35, h1) * fall(lw, abs(cx - .5)) * step(.15, g) * step(g, .85);
  v += step(.5, h2) * fall(lw, abs(g - .5)) * step(.22, cx) * step(cx, .78);
  v += step(.5, h3) * fall(lw, abs((cx - .5) - (g - .5)*(h4 > .5 ? .8 : -.8))) * step(abs(cx - .5), .3) * step(abs(g - .5), .36);
  v += step(.72, h4) * fall(lw*.8, abs(length(vec2(cx - .5, g - .5)) - .22));
  return min(v, 1.);
}
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p);
  if (r > 1.) discard;
  float a = atan(p.y, p.x);
  float v = ring(r, .97, .012) + ring(r, .875, .008) + ring(r, .63, .01) + ring(r, .545, .007) + ring(r, .27, .009);
  v += glyphs(r, a + uTime*.10, .885, .962, 72., 1.);
  v += glyphs(r, a - uTime*.16, .555, .62, 40., 9.) * .9;
  float rb = uTime*.07;
  for (int k = 0; k < 6; k++){
    float m = rb + float(k) * TAU / 6.;
    v += fall(.009, abs(dot(p, vec2(cos(m), sin(m))) - .2725)) * step(r, .545);
  }
  float pulse = pow(.5 + .5*sin(r*9. - uTime*2.4), 8.) * (1. - smoothstep(.2, 1., r));
  vec3 col = mix(uB, uC, .55) * v * 1.4 + uB * (exp(-r*2.5)*.25 + pulse*.25);
  float I = clamp(v + exp(-r*2.5)*.3 + pulse*.25, 0., 1.) * fogK() * uGain;
  gl_FragColor = vec4(col, I);
}`,
  // the column over the rune circle: streaks rising, thinning upward
  column: `
void main(){
  float u = vUV.x, y = vUV.y;
  float s = .5 + .5*sin(u*TAU*9. + sin(y*6. - uTime*1.6)*.9);
  float n = noise(vec2(cos(u*TAU)*2.5 + y*3. - uTime*.9, sin(u*TAU)*2.5));
  float I = pow(1. - y, 1.8) * (.18 + .55*pow(s, 3.) * n) * smoothstep(0., .06, y) * fogK() * uGain;
  gl_FragColor = vec4(mix(uB, uC, .4) * 1.4, I);
}`,
  // a soft light pool on the ground at the threshold, in place of a light
  pool: `
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p * vec2(1., 1.25));
  float I = exp(-r*r*3.2) * uGain * fogK();
  gl_FragColor = vec4(uB, I);
}`,
};

let registered = false;
function registerShaders(): void {
  if (registered) return;
  registered = true;
  for (const k of Object.keys(FRAG)) {
    Effect.ShadersStore[`portal_${k}VertexShader`] = VERT;
    Effect.ShadersStore[`portal_${k}FragmentShader`] = COMMON + FRAG[k];
  }
}

const hex = (h: string) => Color3.FromHexString(h);

interface MatOpts { size?: [number, number]; shape?: number; feather?: number; gain?: number; cols: readonly string[] }
function portalMat(scene: Scene, kind: string, name: string, o: MatOpts): ShaderMaterial {
  registerShaders();
  const m = new ShaderMaterial(name, scene, { vertex: `portal_${kind}`, fragment: `portal_${kind}` }, {
    attributes: ["position", "uv"],
    uniforms: ["world", "worldViewProjection", "uEye", "uTime", "uSize", "uShape", "uFeather", "uGain", "uFog", "uA", "uB", "uC"],
    needAlphaBlending: true,
  });
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alphaMode = Constants.ALPHA_ADD;
  m.setVector2("uSize", new Vector2(o.size?.[0] ?? 1, o.size?.[1] ?? 1));
  m.setFloat("uShape", o.shape ?? 0);
  m.setFloat("uFeather", o.feather ?? 1);
  m.setFloat("uGain", o.gain ?? 1);
  m.setColor3("uA", hex(o.cols[0]));
  m.setColor3("uB", hex(o.cols[1]));
  m.setColor3("uC", hex(o.cols[2]));
  // Time, the eye and the fog are read at bind: no per-portal observer on the
  // scene, and nothing to unhook -- the callback dies with the material.
  m.onBindObservable.add(() => {
    const e = m.getEffect();
    if (!e) return;
    e.setFloat("uTime", (performance.now() / 1000) % 3600);
    const cam = scene.activeCamera;
    if (cam) e.setVector3("uEye", cam.globalPosition);
    e.setFloat("uFog", scene.fogMode === Scene.FOGMODE_EXP2 ? scene.fogDensity : 0);
  });
  return m;
}

// one soft round sprite per scene; a WeakMap, so it cannot outlive its scene
const dots = new WeakMap<Scene, DynamicTexture>();
function dotTexture(scene: Scene): DynamicTexture {
  const have = dots.get(scene);
  if (have) return have;
  const S = 64;
  const t = new DynamicTexture("portal_dot", { width: S, height: S }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, S, S);
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  t.hasAlpha = true;
  t.update();
  dots.set(scene, t);
  return t;
}

// A ground-hugging sheet (a pool, the rune disc): a small grid whose vertices
// take the surface under them, so a slope or a step does not cut it in half.
// `hug` false lays it flat at y: a deck the ground function does not see (a
// dais, an office platform) is flat, and following the ground under it would
// sink the sheet into the platform.
function groundSheet(ctx: PortalFxContext, name: string, x: number, z: number, y: number, w: number, d: number, yaw: number, lift: number, hug = true): Mesh {
  const g = MeshBuilder.CreateGround(name, { width: w, height: d, subdivisions: 10, updatable: false }, ctx.scene);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  const pos = g.getVerticesData(VertexBuffer.PositionKind)!;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < pos.length; i += 3) {
    const lx = pos[i], lz = pos[i + 2];
    // rotation.y: local +x -> (cos, 0, -sin), local +z -> (sin, 0, cos)
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    const gy = hug ? ctx.ground(wx, wz) : y;
    // never more than a metre off the threshold: a pool reaching a parapet's
    // foot or a ditch should not climb the wall or dive under the water
    pos[i + 1] = Math.max(-1, Math.min(1, gy - y)) + lift;
  }
  // SET, not update: the ground's buffer is not updatable, and updating one
  // changes the CPU copy only -- the GPU kept the flat sheet at the threshold's
  // height, under any built floor and half under a slope
  g.setVerticesData(VertexBuffer.PositionKind, pos, false);
  // The world matrix BEFORE the bounds: refreshBoundingInfo places the box with
  // the cached world matrix, which is still the identity until one is computed,
  // and doNotSyncBoundingInfo then keeps it at the origin for good -- every
  // pool and rune disc away from (0, 0) was culled and never drawn (found
  // 2026-10-10 by the dungeon runes' look).
  g.freezeWorldMatrix();
  g.refreshBoundingInfo();
  g.isPickable = false;
  g.doNotSyncBoundingInfo = true;
  return g;
}

function glowOwn(ctx: PortalFxContext, m: Mesh): void {
  if (!ctx.glow) return;
  ctx.glow.referenceMeshToUseItsOwnMaterial(m);
}

// Out of the glow pass altogether. setupGlow's selector draws every mesh it is
// given there, a mesh with no `glow` as a BLACK occluder: a see-through card
// drawn black masks the bloom of whatever stands behind it (a lit window
// through a gate), and costs a glow draw per mesh for it (measured
// 2026-10-10, tmp/wilds/foundation-counts: glow draws rose one for one with
// the main pass's portal meshes). An excluded mesh is skipped before its draw.
function glowSkip(ctx: PortalFxContext, ...ms: Mesh[]): void {
  if (!ctx.glow) return;
  for (const m of ms) ctx.glow.addExcludedMesh(m);
}

// The gated portals (bl_capital) are hidden and shown by toggling the pickable
// mesh (world.ts restoreGatedPortals); the rest of the portal follows it.
function follow(pick: Mesh, parts: AbstractMesh[], ps: ParticleSystem): void {
  pick.onEnabledStateChangedObservable.add((on) => {
    for (const p of parts) p.setEnabled(on);
    if (on) ps.start(); else ps.stop();
  });
}

/** sparks / motes: one emitter, its box in the emitter mesh's own frame when given one */
function motes(ctx: PortalFxContext, name: string, o: {
  cap: number; rate: number; emitter: AbstractMesh | Vector3; box: [Vector3, Vector3]; c1: string; c2: string;
  size: [number, number]; life: [number, number]; dir: [Vector3, Vector3]; power: [number, number];
}): ParticleSystem {
  const ps = ctx.particles(new ParticleSystem(name, o.cap, ctx.scene));
  ps.particleTexture = dotTexture(ctx.scene);
  ps.emitter = o.emitter;
  ps.minEmitBox = o.box[0]; ps.maxEmitBox = o.box[1];
  ps.color1 = Color4.FromHexString(o.c1 + "ff");
  ps.color2 = Color4.FromHexString(o.c2 + "ff");
  ps.colorDead = new Color4(0, 0, 0, 0);
  ps.minSize = o.size[0]; ps.maxSize = o.size[1];
  ps.minLifeTime = o.life[0]; ps.maxLifeTime = o.life[1];
  ps.emitRate = o.rate;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.gravity = Vector3.Zero();
  ps.direction1 = o.dir[0]; ps.direction2 = o.dir[1];
  ps.minEmitPower = o.power[0]; ps.maxEmitPower = o.power[1];
  // start part-way through, so a zone does not open on an empty threshold
  ps.preWarmCycles = 60; ps.preWarmStepOffset = 4;
  ps.start();
  return ps;
}

/**
 * The Dawn Veil, standing on (x, y, z), spanning `width` across the passage and
 * rising `height`. A `framed` veil ("arch"/"rect") fills a built opening; a
 * "free" one stands on its own with soft sides and a head that fades into the
 * air; a "span" meets what flanks it (a causeway's parapets) and fades upward.
 */
export function makeDawnVeil(ctx: PortalFxContext, o: VeilOpts): PortalFx {
  const { scene } = ctx;
  const card = MeshBuilder.CreatePlane(`ptg_${o.id}`, { width: o.width, height: o.height }, scene);
  card.position.set(o.x, o.y + o.height / 2, o.z);
  card.rotation.y = o.yaw;
  card.material = portalMat(scene, "veil", `ptgm_${o.id}`, {
    size: [o.width, o.height], shape: veilShapeCode(o.frame, o.width, o.height), feather: veilFeather(o.width, o.frame), cols: VEIL_COLOURS,
  });
  card.alphaIndex = 10;
  // NOT in the glow layer: rendered there with its own material the card
  // doubled itself as a blur and the whole opening went white (the first look)
  card.freezeWorldMatrix();

  // the pool: across the threshold and a few metres each way along the passage;
  // a span keeps to its own width (it would otherwise lie out over the water)
  const poolW = o.frame === "span" ? o.width : o.width + Math.min(4, o.width * 0.35);
  const pool = groundSheet(ctx, `ptp_${o.id}`, o.x, o.z, o.y, poolW, 8, o.yaw, 0.04);
  pool.material = portalMat(scene, "pool", `ptpm_${o.id}`, { gain: 0.35, cols: VEIL_COLOURS });

  // sparks rise off the threshold, across the card's width, in its own frame
  const cap = Math.round(Math.max(50, Math.min(160, o.width * 12)));
  const ps = motes(ctx, `pts_${o.id}`, {
    cap, rate: cap * 0.3, emitter: card,
    box: [new Vector3(-o.width * 0.45, -o.height / 2, -0.3), new Vector3(o.width * 0.45, -o.height / 2 + 0.2, 0.3)],
    c1: "#ffd27a", c2: "#fff2d0", size: [0.04, 0.1], life: [2, 3.5],
    dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)], power: [0.9, 1.7],
  });
  glowSkip(ctx, card, pool);
  const parts: AbstractMesh[] = [pool];
  follow(card, parts, ps);
  return { pick: card, parts, emitter: ps };
}

/**
 * The Rune Circle on open ground at (x, y, z): a glyph disc `radius` across,
 * a column of light out of it, five shards circling at head height.
 */
export function makeRuneCircle(ctx: PortalFxContext, o: RuneOpts): PortalFx {
  const { scene } = ctx;
  const r = o.radius;
  const spec = o.column === undefined || o.floor === undefined ? specFor(o.id) : undefined;
  // a dungeon's floor is built a few cm proud of its ground: the disc and the
  // pool lie on its top, not under it, and everything else stands on it
  const floor = o.floor ?? spec?.floor ?? 0, y = o.y + floor;
  // standing on a platform the ground function does not know (its data `y`
  // above that ground: the mausoleum's dais), the sheets lie flat on it
  const hug = Math.abs(ctx.ground(o.x, o.z) - o.y) < 0.5;
  const disc = groundSheet(ctx, `ptr_${o.id}`, o.x, o.z, o.y, r * 2, r * 2, 0, floor + 0.05, hug);
  disc.material = portalMat(scene, "rune", `ptrm_${o.id}`, { cols: RUNE_COLOURS });
  glowOwn(ctx, disc);

  // the column is what a click finds: the disc lies flat under the feet. In a
  // dungeon it stops short of the ceiling, and the shards and motes keep under it
  const colD = r * 1.06, colH = o.column ?? spec?.column ?? runeColumn(r);
  const col = MeshBuilder.CreateCylinder(`ptg_${o.id}`, { diameter: colD, height: colH, tessellation: 40, cap: Mesh.NO_CAP }, scene);
  col.position.set(o.x, y + colH / 2, o.z);
  col.material = portalMat(scene, "column", `ptcm_${o.id}`, { gain: 0.8, cols: RUNE_COLOURS });
  col.alphaIndex = 10;
  col.freezeWorldMatrix();

  const pool = groundSheet(ctx, `ptp_${o.id}`, o.x, o.z, o.y, r * 3.6, r * 3.6, 0, floor + 0.03, hug);
  pool.material = portalMat(scene, "pool", `ptpm_${o.id}`, { gain: 0.55, cols: RUNE_COLOURS });

  // five shards, ONE mesh: thin instances whose matrices the orbit rewrites
  const shard = MeshBuilder.CreatePolyhedron(`ptk_${o.id}`, { type: 1, size: 0.32 }, scene);
  const sm = new StandardMaterial(`ptkm_${o.id}`, scene);
  sm.diffuseColor = hex(RUNE_COLOURS[0]);
  sm.emissiveColor = hex("#5fe8c2");
  sm.specularColor = new Color3(1, 1, 1);
  sm.alpha = 0.92;
  shard.material = sm;
  shard.isPickable = false;
  const N = 5, orbit = r * 0.8, head = runeHead(colH);
  const buf = new Float32Array(16 * N);
  shard.thinInstanceSetBuffer("matrix", buf, 16, false);
  // the orbit's whole reach, once: refreshing the box every frame would cost
  // more than the five matrices it bounds
  const ext = new Vector3(orbit + 0.6, 1.4, orbit + 0.6);
  shard.setBoundingInfo(new BoundingInfo(new Vector3(o.x, y + head, o.z).subtract(ext), new Vector3(o.x, y + head, o.z).add(ext)));
  shard.doNotSyncBoundingInfo = true;
  const mtx = new Matrix(), q = new Quaternion(), sc = new Vector3(1, 2.6, 1), at = new Vector3();
  const spin = () => {
    if (!shard.isEnabled()) return;
    const t = performance.now() / 1000;
    for (let k = 0; k < N; k++) {
      const a = t * 0.5 + k * Math.PI * 2 / N;
      at.set(o.x + Math.cos(a) * orbit, y + head + Math.sin(t * 1.3 + k) * 0.35, o.z + Math.sin(a) * orbit);
      Quaternion.RotationYawPitchRollToRef(t * 1.2 + k, 0, 0, q);
      Matrix.ComposeToRef(sc, q, at, mtx);
      mtx.copyToArray(buf, k * 16);
    }
    shard.thinInstanceBufferUpdated("matrix");
  };
  spin();
  const obs = scene.onBeforeRenderObservable.add(spin);
  shard.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(obs));

  const ps = motes(ctx, `pts_${o.id}`, {
    cap: 140, rate: 40, emitter: new Vector3(o.x, y + 0.3, o.z),
    box: [new Vector3(-r * 0.47, 0, -r * 0.47), new Vector3(r * 0.47, 0, r * 0.47)],
    // rising at up to 1.6 m/s, a mote's life is what keeps it under the column's head
    c1: "#7affd8", c2: "#d2fff2", size: [0.05, 0.13], life: [Math.min(2.5, colH / 2.2), Math.min(4.5, colH / 1.6)],
    dir: [new Vector3(-0.05, 1, -0.05), new Vector3(0.05, 1, 0.05)], power: [0.8, 1.6],
  });
  // the disc glows on purpose; the column and the pool are additive light
  // already and would only occlude; the shards would bloom through what
  // stands in front of them (above)
  glowSkip(ctx, col, pool, shard);
  const parts: AbstractMesh[] = [disc, pool, shard];
  follow(col, parts, ps);
  return { pick: col, parts, emitter: ps };
}
