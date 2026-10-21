// Skill and spell effects (Philip, 2026-10-12): "larger effects, more glows
// and colours ... they should surround the player or surround the enemies.
// Magic spells especially should have runes or auras that surround the player
// when conjuring" -- FFXIV flashy, every job, a rune style per job with the
// spell's colour, projectiles that are only light (the damage number does not
// wait for them), and something on the target that says WHICH spell: Stone's
// rocks gather and slam in, Blizzard's crystals grow and shatter, Thunder
// falls out of the sky.
//
// What each ability looks like is data: its `fx` family in abilities.json and
// spell-fx-plan.ts (Babylon-free, node-tested). This file draws it.
//
// The house rules, the same as portal-fx.ts:
//   - No lights. WebKit's ten per mesh, and adding or removing one recompiles
//     every lit material in the zone. Glow is additive shader cards and
//     particles; the one exception is the parked flash light the skillchain
//     already had, lent to the few grand moments (Flare, Holy, Thunder).
//   - No asset files: every sprite is drawn on a canvas, every card is a
//     shader, rocks and crystals are polyhedra (an effect, not a prop).
//   - Additive cards write no depth and sit in the effects' render group
//     (scene.ts fxMesh, group 1): drawn after water and sand, still behind walls.
//   - Glow is opt-in: only the rune discs and the orbs render into the glow
//     layer, with their own material, and only outdoors; every other card is
//     EXCLUDED, since a card left in is drawn there as a black occluder
//     (portal-fx.ts glowSkip).
//   - Nothing is made per cast. Cards, particle systems, rocks and crystals
//     come from per-scene pools and go back when their effect ends, and every
//     running effect is stepped by ONE observer per scene. A StandardMaterial
//     per cast was the old vfx.ts's cost (one image-processing listener each).
//
// Lifetime (SCENE-LIFETIME.md): every pool lives in a WeakMap keyed by its
// scene and dies with it; a zone change abandons the old scene's effects
// mid-flight, which is what disposing them would do anyway.
import {
  Scene, Mesh, MeshBuilder, ShaderMaterial, Effect, Constants, Vector3, Color3, Color4,
  ParticleSystem, DynamicTexture, StandardMaterial, VertexData, VertexBuffer, TransformNode,
  PointLight, AbstractMesh, Texture, Matrix, Quaternion, GlowLayer,
} from "@babylonjs/core";
import { scene, groundHeight, fxParticles, fxMesh } from "./scene";
import { ABILITIES } from "./data";
import {
  resolveFx, flightTime, countFor, arcPoint, boltPath, envelope, charge,
  ENEMY_RUNE, ENEMY_COLOURS, JOB_RUNES, FX_FAMILIES, ELEMENT_COLOURS,
  type ResolvedFx, type Palette, type Projectile,
} from "./spell-fx-plan";
import * as sfx from "./spell-sfx";
import type { Hum } from "./audio";

// ---------------------------------------------------------------- the world it reads

/** What an effect needs of a body: where its feet are, how tall it is, and
 *  where its hands are when it has a rig. */
export interface FxActor {
  node: TransformNode;
  height: number;
  /** world positions of the hands, right first; empty when unknown */
  hands?: () => Vector3[];
}

export interface FxWorld {
  actor(id: string): FxActor | null;
  /** a monster still asleep / stunned (world.ts mobEffects) */
  status(id: string, kind: "sleep" | "stun"): boolean;
  /** whether a player still has a buff: known for yourself (self_payload),
   *  undefined for others, whose auras run out on the ability's duration */
  hasBuff(id: string, name: string): boolean | undefined;
  /** where the ears are (your own body), for how loud a sound is */
  listener?(): Vector3 | null;
  /** your own doing: played at full, everyone else's softer */
  mine?(id: string): boolean;
}

// How loud a sound is: full within twelve metres, nothing past fifty, and
// another player's at a little over half (FFXIV's "other players' effects"),
// so six people casting is a fight and not a wall.
function loud(w: FxWorld, owner: string, at: string = owner): number {
  const a = actorOf(w, at), l = w.listener?.();
  let fall = 1;
  if (a && l) fall = Math.max(0, Math.min(1, 1 - (Vector3.Distance(feet(a), l) - 12) / 38));
  return fall * (w.mine?.(owner) ? 1 : 0.55);
}
// A party spell lands on everyone at once, an event each: one sound, not six.
const heard = new Map<string, number>();
function once(key: string, window = 0.2): boolean {
  const t = NOW(), last = heard.get(key);
  if (last !== undefined && t - last < window) return false;
  heard.set(key, t);
  return true;
}

const NOW = () => performance.now() / 1000;

// A body seen a moment ago. The killing blow's event arrives in the same batch
// as the monster's "mdie", and world.ts removes the monster at once: without
// this the finishing Stone would have nothing to land on. A stand-in node holds
// the last place for a few seconds, which is longer than any impact runs.
const seen = new Map<string, { a: FxActor; at: number; ghost?: FxActor }>();
function actorOf(w: FxWorld, id: string): FxActor | null {
  const a = w.actor(id);
  const now = NOW();
  if (a) {
    const was = seen.get(id);
    if (was && was.a.node === a.node) was.at = now;
    else seen.set(id, { a, at: now });
    return a;
  }
  const was = seen.get(id);
  if (!was || now - was.at > 4) { if (was) seen.delete(id); return null; }
  if (!was.ghost) {
    const node = new TransformNode(`sfx_ghost_${id}`, scene);
    if (!was.a.node.isDisposed()) node.position.copyFrom(was.a.node.getAbsolutePosition());
    else node.position.copyFrom(was.a.node.position);
    node.rotation.y = was.a.node.rotation.y;
    was.ghost = { node, height: was.a.height };
    run(4, () => {}, () => { node.dispose(); if (seen.get(id) === was) seen.delete(id); });
  }
  return was.ghost;
}

// A monster's height, measured from its drawn hierarchy rather than guessed
// from its family (a boss at scale 2 is twice the wolf it is built from), and
// re-measured now and then: the model arrives after the node does.
const heights = new WeakMap<TransformNode, { h: number; at: number }>();
export function bodyHeight(root: TransformNode, fallback: number): number {
  const now = NOW();
  const have = heights.get(root);
  if (have && now - have.at < 2) return have.h;
  let h = fallback;
  try {
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const span = max.y - min.y;
    if (Number.isFinite(span) && span > 0.3 && span < 40) h = span;
  } catch { /* not drawn yet */ }
  heights.set(root, { h, at: now });
  return h;
}

// The hands of a rigged body: the production rigs' hand_r/hand_l (or the
// older hand.r/hand.l), found once per model root.
const handNodes = new WeakMap<TransformNode, TransformNode[]>();
export function handsOf(root: TransformNode | null | undefined): Vector3[] {
  if (!root) return [];
  let found = handNodes.get(root);
  if (!found) {
    found = [];
    for (const name of ["hand_r", "hand.r", "hand_l", "hand.l"]) {
      const n = root.getDescendants(false).find((d) => d.name === name) as TransformNode | undefined;
      if (n) found.push(n);
    }
    if (!found.length) return [];
    handNodes.set(root, found);
  }
  return found.map((n) => n.getAbsolutePosition());
}
const ABILITY_BY_NAME = new Map<string, { key: string; ab: any }>(
  Object.entries(ABILITIES).map(([key, ab]: [string, any]) => [ab.name, { key, ab }]),
);
/** an event names its ability by its display name */
export function fxByName(name: string | undefined): ResolvedFx | null {
  const hit = name ? ABILITY_BY_NAME.get(name) : undefined;
  return hit ? resolveFx(hit.key, hit.ab) : null;
}
export function fxByKey(key: string): ResolvedFx | null {
  const ab = (ABILITIES as Record<string, any>)[key];
  return ab ? resolveFx(key, ab) : null;
}

// ---------------------------------------------------------------- shaders

const VERT = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
uniform mat4 world; uniform mat4 worldViewProjection; uniform vec3 uEye; uniform float uRoll;
varying vec2 vUV; varying float vDist; varying vec3 vNW; varying vec3 vPW; varying vec3 vLocal;
void main(){
  vec3 p = position;
  // a roll in the card's own plane: a slash's angle on a billboard
  float c = cos(uRoll), s = sin(uRoll);
  p.xy = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  vec4 wp = world * vec4(p, 1.);
  vUV = uv; vPW = wp.xyz; vLocal = position;
  vDist = length(wp.xyz - uEye);
  vNW = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(p, 1.);
}
`;

const COMMON = `
precision highp float;
varying vec2 vUV; varying float vDist; varying vec3 vNW; varying vec3 vPW; varying vec3 vLocal;
uniform float uTime; uniform float uT; uniform float uGain; uniform float uFog;
uniform float uStyle; uniform float uSeed; uniform float uCharge; uniform float uFlash;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uEye;
#define TAU 6.2831853
#define PI 3.1415927
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float fogK(){ float f = vDist * uFog; return exp(-f*f); }
// every falloff is fall(), never smoothstep(w, 0., x): GLSL leaves reversed edges undefined
float fall(float w, float x){ return 1. - smoothstep(0., w, x); }
float ring(float r, float at, float w){ return fall(w, abs(r - at)); }
float seg(vec2 p, vec2 a, vec2 b, float w){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return fall(w, length(pa - ba*h)); }
vec2 polar(float r, float a){ return r * vec2(cos(a), sin(a)); }
float fresnel(float k){ vec3 V = normalize(uEye - vPW); return pow(1. - abs(dot(normalize(vNW), V)), k); }
float facing(float k){ vec3 V = normalize(uEye - vPW); return pow(abs(dot(normalize(vNW), V)), k); }
`;

// The glyph band every rune shares: n cells round the circle between r0 and
// r1, each a hashed handful of strokes (portal-fx.ts's, with a style's seed).
const GLYPHS = `
float glyphs(float r, float a, float r0, float r1, float n, float seed, float lw){
  float g = (r - r0) / (r1 - r0);
  if (g < 0. || g > 1.) return 0.;
  float u = a / TAU * n; float id = floor(u); float cx = fract(u);
  float h1 = hash(vec2(id, seed)), h2 = hash(vec2(id, seed + 1.)), h3 = hash(vec2(id, seed + 2.)), h4 = hash(vec2(id, seed + 3.));
  float v = 0.;
  v += step(.35, h1) * fall(lw, abs(cx - .5)) * step(.15, g) * step(g, .85);
  v += step(.5, h2) * fall(lw, abs(g - .5)) * step(.22, cx) * step(cx, .78);
  v += step(.5, h3) * fall(lw, abs((cx - .5) - (g - .5)*(h4 > .5 ? .8 : -.8))) * step(abs(cx - .5), .3) * step(abs(g - .5), .36);
  v += step(.72, h4) * fall(lw*.8, abs(length(vec2(cx - .5, g - .5)) - .22));
  return min(v, 1.);
}
float starPoly(vec2 p, float n, float k, float rad, float rot, float w){
  float v = 0.;
  for (int i = 0; i < 12; i++){
    if (float(i) >= n) break;
    float a1 = rot + TAU*float(i)/n, a2 = rot + TAU*(float(i) + k)/n;
    v = max(v, seg(p, polar(rad, a1), polar(rad, a2), w));
  }
  return v;
}
`;

const FRAG: Record<string, string> = {
  // The caster's circle, one style per job (spell-fx-plan JOB_RUNES), and the
  // floating halo bands (uStyle + 10: the glyph band and its rims alone).
  // uCharge builds it (lines brighten, the turn quickens); uFlash is release.
  rune: GLYPHS + `
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p);
  if (r > 1.) discard;
  float a = atan(p.y, p.x);
  float st = uStyle, band = 0.;
  if (st >= 9.5) { band = 1.; st -= 10.; }
  float spin = uTime * (.12 + .35*uCharge);
  float w = .010 + .006*uCharge;
  float v = 0.;
  if (band > .5) {
    v = ring(r, .97, w) + ring(r, .80, w*.8) + glyphs(r, a + spin*1.6, .82, .95, 36., st*7. + 3., .12);
  } else if (st < .5) {            // BLM arcane: heptagram, angular script, ticks
    v = ring(r, .97, w) + ring(r, .90, w*.7) + ring(r, .64, w) + ring(r, .22, w);
    v += glyphs(r, a + spin, .905, .965, 64., 1., .11);
    v += starPoly(p, 7., 3., .64, -spin*.6, w);
    v += starPoly(p, 3., 1., .22, spin*2., w*.8);
    float tick = fract((a + spin*.5) / TAU * 72.);
    v += fall(.08, abs(tick - .5)) * step(.975, r) * step(r, 1.);
  } else if (st < 1.5) {           // WHM floral: petals, halo, soft script
    v = ring(r, .96, w) + ring(r, .86, w*.6);
    v += glyphs(r, a - spin, .865, .955, 48., 11., .09) * .8;
    float rose = .74 * abs(cos(4. * (a + spin*.4)));
    v += fall(w*1.6, abs(r - rose)) * step(r, .76);
    float rose2 = .46 * abs(cos(4. * (a - spin*.6) + PI/4.));
    v += fall(w*1.4, abs(r - rose2)) * step(r, .48) * .9;
    float dotA = floor((a + PI) / TAU * 16. + .5) / 16. * TAU - PI;
    v += fall(.03, length(p - polar(.80, dotA))) ;
    v += exp(-r*r*18.) * .6;
  } else if (st < 2.5) {           // DRK thorned: sawtooth rim, inverted triangles, hollow core
    float saw = fract((a + spin*.3) / TAU * 24.);
    float edge = .86 + .10 * (1. - saw);
    v = fall(w*1.4, abs(r - edge)) + ring(r, .80, w) + ring(r, .30, w*1.6);
    v += starPoly(p, 3., 1., .78, PI/2. + spin*.5, w);
    v += starPoly(p, 3., 1., .78, -PI/2. - spin*.5, w) * .7;
    for (int i = 0; i < 9; i++){
      float da = TAU*float(i)/9. - spin;
      v += seg(p, polar(.31, da), polar(.46 + .06*hash(vec2(float(i), 4.)), da), w*1.2);
    }
    v += glyphs(r, a + spin*1.4, .62, .76, 30., 21., .12) * .6;
  } else if (st < 3.5) {           // MNK mandala: beads, twelve spokes, chant band
    v = ring(r, .97, w) + ring(r, .84, w) + ring(r, .52, w) + ring(r, .30, w);
    float ba = floor((a + spin*.5 + PI) / TAU * 40. + .5) / 40. * TAU - PI - spin*.5;
    v += fall(.028, abs(length(p - polar(.905, ba)) - .025));
    for (int i = 0; i < 12; i++){
      float da = TAU*float(i)/12. + spin*.3;
      v += seg(p, polar(.30, da), polar(.84, da), w*.8) * .8;
    }
    float lotus = .52 + .1 * abs(sin(6. * (a - spin*.3)));
    v += fall(w*1.4, abs(r - lotus)) * step(.5, r) * step(r, .64);
    v += glyphs(r, a - spin, .32, .5, 24., 31., .12) * .7;
  } else if (st < 4.5) {           // PLD crest: square, cross, a sword at each quarter
    v = ring(r, .96, w) + ring(r, .89, w*.7) + ring(r, .32, w);
    vec2 q = p; float cr = cos(spin*.25), sr = sin(spin*.25);
    q = vec2(cr*q.x - sr*q.y, sr*q.x + cr*q.y);
    float sq = max(abs(q.x), abs(q.y));
    v += fall(w, abs(sq - .63)) * step(r, .9);
    vec2 d = abs(vec2(q.x + q.y, q.x - q.y)) * .7071;
    v += fall(w, abs(max(d.x, d.y) - .63)) * step(r, .9) * .6;
    float arm = min(abs(q.x), abs(q.y));
    v += fall(w*1.2, abs(arm - .07)) * step(max(abs(q.x), abs(q.y)), .55) * step(.32, r);
    for (int i = 0; i < 4; i++){
      float da = TAU*float(i)/4. + spin*.25;
      vec2 c = polar(.75, da), t = polar(1., da), n = vec2(-t.y, t.x);
      v += seg(p, c - t*.1, c + t*.1, w) + seg(p, c - t*.04 - n*.05, c - t*.04 + n*.05, w);
    }
    v += glyphs(r, a + spin*.6, .895, .955, 40., 41., .1) * .7;
  } else if (st < 5.5) {           // SAM enso: one brushed circle, open at the top
    float brush = .018 + .03 * noise(vec2(a*3. + uSeed, 1.)) + .02*sin(a*2.);
    float gap = smoothstep(.15, .5, abs(mod(a - PI/2. + spin*.2 + PI, TAU) - PI));
    v = fall(brush, abs(r - .84)) * gap * 1.3;
    v += ring(r, .97, w*.7) * .5;
    for (int i = 0; i < 3; i++){
      float da = TAU*float(i)/3. + .4 - spin*.3;
      v += seg(p, polar(.18, da), polar(.6, da + .5), w*1.6) * .8;
    }
  } else {                         // enemy: double jagged rim, three turning triangles
    float saw = abs(fract((a - spin) / TAU * 30.) - .5) * 2.;
    v = fall(w*1.4, abs(r - (.88 + .08*saw))) + ring(r, .78, w) + ring(r, .4, w*1.2);
    v += starPoly(p, 3., 1., .76, spin, w) + starPoly(p, 3., 1., .76, spin + PI/3., w);
    v += glyphs(r, a + spin*2., .42, .74, 30., 51., .1) * .5;
  }
  v = min(v, 1.6);
  float core = exp(-r*2.6) * (.18 + .3*uCharge) + uFlash * exp(-r*r*2.) * .9;
  float pulse = pow(.5 + .5*sin(r*10. - uTime*3.), 10.) * (1. - r) * .25 * uCharge;
  vec3 col = mix(uB, uC, clamp(v*.35 + uFlash*.5, 0., 1.)) * v * 1.15 + uA * (core + pulse) * 1.4 + uC * uFlash * .4;
  float I = clamp(v*(.7 + .5*uCharge + uFlash) + core + pulse, 0., 1.) * fogK() * uGain;
  gl_FragColor = vec4(col, I);
}`,
  // a shockwave: a bright band out to the disc's edge as uT runs, a haze inside
  ring: `
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p);
  if (r > 1.) discard;
  float e = 1. - pow(1. - uT, 2.6);
  float R = mix(.08, .97, e), W = .035 + .05*(1. - uT);
  float band = exp(-pow((r - R)/W, 2.));
  float inner = step(r, R) * smoothstep(0., R, r) * .25;
  float n = .75 + .5*noise(vec2(atan(p.y, p.x)*6., uTime*2. + uSeed));
  float I = (band*n + inner) * pow(1. - uT, 1.4) * fogK() * uGain;
  gl_FragColor = vec4(mix(uB, uC, band*.6) * 1.3, clamp(I, 0., 1.));
}`,
  // a soft pool of light on the ground; style 1 rays, 2 a scorch of embers
  pool: `
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p);
  if (r > 1.) discard;
  float I = exp(-r*r*3.2);
  if (uStyle > .5 && uStyle < 1.5) I *= .6 + .4*pow(abs(cos(atan(p.y, p.x)*6. + uTime*.6)), 6.);
  if (uStyle > 1.5) I = (exp(-r*r*2.) * .4 + smoothstep(.55, .9, fbm(p*5. + uSeed)) * (1. - r)) ;
  gl_FragColor = vec4(mix(uA, uB, .7) * 1.2, clamp(I * fogK() * uGain, 0., 1.));
}`,
  // the column over a circle and the beams from the sky. 0 streaks rising,
  // 1 a solid beam (brightest facing the eye), 2 a spiral (a heal climbing)
  column: `
void main(){
  float u = vUV.x, y = vUV.y;
  float I;
  if (uStyle < .5) {
    float s = .5 + .5*sin(u*TAU*9. + sin(y*6. - uTime*1.6)*.9);
    float n = noise(vec2(cos(u*TAU)*2.5 + y*3. - uTime*1.4, sin(u*TAU)*2.5));
    I = pow(1. - y, 1.6) * (.22 + .65*pow(s, 3.) * n) * smoothstep(0., .06, y);
  } else if (uStyle < 1.5) {
    // both faces of the beam add: its edges must fall to nothing or it is a white post
    float n = fbm(vec2(u*TAU*1.5, y*4. - uTime*3.));
    I = pow(facing(1.), 3.) * .5 * (.6 + .6*n) * smoothstep(0., .04, y) * smoothstep(1., .7, y);
  } else {
    float s = fract(u*3. + y*2.2 - uTime*1.3);
    I = (fall(.12, abs(s - .5)) * .9 + .12) * pow(1. - y, 1.2) * smoothstep(0., .05, y);
  }
  vec3 col = mix(uB, uC, clamp(I*.6, 0., 1.)) * 1.1;
  gl_FragColor = vec4(col, clamp(I * fogK() * uGain, 0., 1.));
}`,
  // a shell round a body: 0 fresnel, 1 hex ward, 2 flame aura, 3 wind,
  // 5 a sun (brightest at its centre), 6 ice
  shell: `
void main(){
  float I; vec3 col;
  float y = vLocal.y * .5 + .5;
  if (uStyle < .5) {
    // a glow round a body, broken by drifting noise so it never reads as glass
    float n = fbm(vec2(atan(vLocal.z, vLocal.x)*2. + uSeed, y*2.5 - uTime*1.5));
    I = fresnel(1.6) * smoothstep(.3, .75, n) * 1.2; col = mix(uA, uB, n);
  } else if (uStyle < 1.5) {
    vec2 g = vec2(vUV.x * 30., vUV.y * 15.);
    vec2 h = vec2(g.x + mod(floor(g.y), 2.) * .5, g.y);
    vec2 f = abs(fract(h) - .5);
    float hexEdge = fall(.08, .5 - max(f.x, f.y));
    float sweep = exp(-pow((y - fract(uTime*.6)) * 6., 2.));
    I = fresnel(1.8) * .9 + hexEdge * (.25 + .8*sweep) * (.4 + fresnel(1.)) ;
    col = mix(uB, uC, sweep);
  } else if (uStyle < 2.5) {
    float n = fbm(vec2(atan(vLocal.z, vLocal.x)*2.5 + uSeed, y*3. - uTime*2.4));
    float flame = smoothstep(.35, .8, n + (1. - y)*.45 - .15);
    I = flame * (.35 + fresnel(1.2)) * smoothstep(1., .55, y);
    col = mix(uB, uC, flame*flame);
  } else if (uStyle < 3.5) {
    float s = .5 + .5*sin(atan(vLocal.z, vLocal.x)*3. + y*7. - uTime*9.);
    I = pow(s, 6.) * (.3 + fresnel(1.)) * smoothstep(1., .7, y) * smoothstep(0., .2, y);
    col = mix(uB, uC, s);
  } else if (uStyle < 5.5) {
    float n = fbm(vNW.xy*3. + vNW.z*2. + uTime*.8);
    I = facing(1.2) * (.7 + .5*n) + fresnel(3.) * .5;
    col = mix(uB, uC, facing(2.));
  } else {
    float n = noise(vec2(atan(vLocal.z, vLocal.x)*4., y*6.));
    float facet = step(.55, fract(n*5.));
    I = fresnel(1.6) * .8 + facet * .14;
    col = mix(uA, uB, .4 + facet*.4 + fresnel(2.)*.2);
  }
  gl_FragColor = vec4(col, clamp(I * fogK() * uGain, 0., 1.));
}`,
  // a camera-facing sprite: 0 an orb, 1 a starburst, 2 a flare ring,
  // 3 a radiant cross, 4 the enmity mark, 5 a star, 6 a crescent moon
  sprite: `
void main(){
  vec2 p = (vUV - .5) * 2.;
  float r = length(p), a = atan(p.y, p.x);
  float I;
  if (uStyle < .5) {
    I = exp(-r*r*9.) * 1.2 + exp(-r*3.2) * .35;
  } else if (uStyle < 1.5) {
    float rays = pow(abs(cos(a*3. + uSeed)), 30.) + pow(abs(cos(a*2. + uSeed + .7)), 50.)*.7;
    I = exp(-r*r*14.) * 1.2 + rays * (1. - smoothstep(0., 1., r)) * .9 + exp(-r*4.) * .3;
  } else if (uStyle < 2.5) {
    float R = mix(.15, .9, uT);
    I = exp(-pow((r - R)/.07, 2.)) * (1. - uT) + exp(-r*r*20.) * (1. - uT);
  } else if (uStyle < 3.5) {
    float bar = fall(.07, abs(p.x)) * (1. - abs(p.y)) + fall(.07, abs(p.y + .2)) * (1. - abs(p.x)) * step(abs(p.x), .6);
    I = bar * 1.2 + ring(r, .62, .03) * .8 + exp(-r*r*8.) * .5;
  } else if (uStyle < 4.5) {
    float d = abs(p.x) + abs(p.y + .05);
    I = fall(.05, abs(d - .62)) + fall(.05, abs(d - .4)) * .7 + step(d, .2) * .9
      + seg(p, vec2(0., .85), vec2(0., 1.), .05) + seg(p, vec2(0., -.85), vec2(0., -1.), .05);
  } else if (uStyle < 5.5) {
    float k = cos(PI/5.) / cos(mod(a + PI/2., TAU/5.) - PI/5.);
    float star = r / (.55 + .4*k*(.5 + .5*cos(5.*(a + PI/2.))));
    I = fall(.12, star - .78) + exp(-r*r*6.) * .4;
  } else {
    float moon = step(r, .55) * step(.5, length(p - vec2(.22, .14)));
    I = moon + exp(-r*r*5.) * .3;
  }
  gl_FragColor = vec4(mix(uB, uC, clamp(I*.5, 0., 1.)) * 1.1, clamp(I * fogK() * uGain, 0., 1.));
}`,
  // a slash: the arc's length runs along vUV.x, its width across vUV.y (1 the
  // edge). uT sweeps the head through; the crescent thins to both tips.
  slash: `
void main(){
  float x = vUV.x, y = vUV.y;
  float head = uT * 1.4;
  float tail = head - .75;
  if (x > head || x < tail) discard;
  float k = (x - tail) / .75;
  float thick = pow(sin(PI * clamp(x, 0., 1.)), .7);
  float across = 1. - y;
  if (across > thick) discard;
  float a = across / max(thick, .001);
  // a hot blade edge, a body of colour behind it thinning inward, streaked
  float edge = exp(-pow(a / .13, 2.));
  float body = (1. - a) * (1. - a);
  float streak = .55 + .45 * fbm(vec2(x*26. - uTime*6., a*4. + uSeed));
  float I = (edge * 1.4 + body * .85 * streak) * pow(k, 1.3) * smoothstep(0., .04, x) * smoothstep(1., .92, x);
  vec3 col = mix(uA, uB, clamp(body*1.3, 0., 1.));
  col = mix(col, uC, edge);
  gl_FragColor = vec4(col * 1.15, clamp(I * fogK() * uGain, 0., 1.));
}`,
  // a lightning bolt's strip: a white core and a coloured halo across it
  bolt: `
void main(){
  float y = vUV.y;
  float core = exp(-pow((y - .5) * 9., 2.));
  float halo = exp(-pow((y - .5) * 3., 2.)) * .45;
  float flick = .7 + .3*sin(uTime*90. + vUV.x*20.);
  float I = (core * 1.4 + halo) * flick;
  gl_FragColor = vec4(mix(uB, uC, core), clamp(I * fogK() * uGain, 0., 1.));
}`,
  // a column of fire: fbm tongues rising off the base, thinning upward
  flame: `
void main(){
  float u = vUV.x, y = vUV.y;
  float n = fbm(vec2(u*9. + uSeed, y*2.4 - uTime*3.4));
  float n2 = noise(vec2(u*22. - uSeed, y*5. - uTime*5.));
  float shape = smoothstep(.42, .72, n + .4 - y*.95 + n2*.12);
  // the cylinder's own edges fade, so it is tongues of flame and never a can
  float I = shape * smoothstep(0., .1, y) * pow(facing(1.), .9);
  vec3 col = mix(uA, uB, smoothstep(.1, .55, shape));
  col = mix(col, uC, smoothstep(.75, 1., shape) * (1. - y) * .7);
  gl_FragColor = vec4(col, clamp(I * fogK() * uGain, 0., 1.));
}`,
};

let registered = false;
function registerShaders(): void {
  if (registered) return;
  registered = true;
  for (const k of Object.keys(FRAG)) {
    Effect.ShadersStore[`sfx_${k}VertexShader`] = VERT;
    Effect.ShadersStore[`sfx_${k}FragmentShader`] = COMMON + FRAG[k];
  }
}

const colours = new Map<string, Color3>();
function hex(h: string): Color3 {
  let c = colours.get(h);
  if (!c) { c = Color3.FromHexString(h); colours.set(h, c); }
  return c;
}

// ---------------------------------------------------------------- per-scene state

type Shape = "disc" | "plane" | "cyl" | "sphere" | "arc" | "sweep" | "bolt";
const GLOWS = new Set(["rune", "sprite"]);

interface Card {
  mesh: Mesh;
  mat: ShaderMaterial;
  key: string;
  /** the disc's last hugged spot, so a follower re-hugs only when it moves */
  hugAt?: [number, number, number, number];
}

interface Run { t0: number; dur: number; step: (t: number, now: number) => void; done?: () => void }

interface Lasting {
  id: string;
  family: string;
  name: string;
  until: number;
  started: number;
  tick: (now: number, a: FxActor) => void;
  end: () => void;
}

interface CastFx {
  src: string;
  fx: ResolvedFx | null;
  started: number;
  total: number;
  released: boolean;
  /** the hand orbs, kept until the spell's event launches the bolt from them */
  hold: () => Vector3;
  end: (flash: boolean) => void;
  endHands: () => void;
}

interface FxState {
  scene: Scene;
  cards: Map<string, Card[]>;
  systems: ParticleSystem[];
  rocks: Mesh[];
  crystals: Mesh[];
  rockMat: StandardMaterial;
  iceMat: StandardMaterial;
  tex: Record<string, Texture>;
  runs: Run[];
  lasting: Lasting[];
  casts: Map<string, CastFx>;
  light: PointLight | null;
}

const states = new WeakMap<Scene, FxState>();

function S(): FxState {
  let s = states.get(scene);
  if (s) return s;
  const sc = scene;
  const rockMat = new StandardMaterial("sfx_rock", sc);
  // earth, not amber: lit stone with a faint ember in it, the glow left to the halo behind
  rockMat.diffuseColor = new Color3(0.3, 0.25, 0.2);
  rockMat.emissiveColor = new Color3(0.12, 0.07, 0.02);
  rockMat.specularColor = new Color3(0.06, 0.05, 0.04);
  const iceMat = new StandardMaterial("sfx_ice", sc);
  // blue glass, not white: under a midday sun the first one read as a white tent
  iceMat.diffuseColor = new Color3(0.26, 0.5, 0.82);
  iceMat.emissiveColor = new Color3(0.1, 0.3, 0.6);
  iceMat.specularColor = new Color3(0.9, 0.95, 1);
  iceMat.specularPower = 96;
  iceMat.alpha = 0.8;
  s = {
    scene: sc, cards: new Map(), systems: [], rocks: [], crystals: [], rockMat, iceMat,
    tex: makeTextures(sc), runs: [], lasting: [], casts: new Map(), light: null,
  };
  states.set(sc, s);
  const st = s;
  sc.onBeforeRenderObservable.add(() => tick(st));
  return s;
}

function tick(s: FxState): void {
  const now = NOW();
  // a run may start another; iterate over what was there when the frame began
  const runs = s.runs;
  let w = 0;
  const n = runs.length;
  for (let i = 0; i < n; i++) {
    const r = runs[i];
    const t = (now - r.t0) / r.dur;
    if (t >= 1) { r.done?.(); continue; }
    if (t >= 0) r.step(t, now);
    runs[w++] = r;
  }
  // keep any added during the loop
  for (let i = n; i < runs.length; i++) runs[w++] = runs[i];
  runs.length = w;
  if (world) {
    for (let i = s.lasting.length - 1; i >= 0; i--) {
      const l = s.lasting[i];
      const a = world.actor(l.id);
      const known = world.hasBuff(l.id, l.name);
      // the self payload trails the event: trust a missing buff after a moment
      const gone = !a || now > l.until || (known === false && now - l.started > 1.5)
        || (l.family === "sleep" && now - l.started > 0.6 && !world.status(l.id, "sleep"))
        || (l.family === "stun" && now - l.started > 0.3 && !world.status(l.id, "stun"));
      if (gone) { l.end(); s.lasting.splice(i, 1); continue; }
      l.tick(now, a!);
    }
  }
}

function run(dur: number, step: (t: number, now: number) => void, done?: () => void, delay = 0): void {
  S().runs.push({ t0: NOW() + delay, dur, step, done });
}
function after(sec: number, fn: () => void): void {
  S().runs.push({ t0: NOW(), dur: Math.max(0.001, sec), step: () => {}, done: fn });
}

// ---------------------------------------------------------------- textures

function canvasTex(sc: Scene, name: string, size: number, draw: (c: CanvasRenderingContext2D, S: number) => void): DynamicTexture {
  const t = new DynamicTexture(name, { width: size, height: size }, sc, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, size, size);
  draw(c, size);
  t.hasAlpha = true;
  t.update();
  return t;
}

function makeTextures(sc: Scene): Record<string, Texture> {
  const radial = (c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  return {
    dot: canvasTex(sc, "sfx_dot", 64, (c, S) => radial(c, S / 2, S / 2, S / 2, [[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,.7)"], [1, "rgba(255,255,255,0)"]])),
    // a four-point sparkle: two thin bright bars and a hot core
    star: canvasTex(sc, "sfx_star", 64, (c, S) => {
      for (const [w, h] of [[S, S * 0.09], [S * 0.09, S]]) {
        const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect((S - w) / 2, (S - h) / 2, w, h);
      }
      radial(c, S / 2, S / 2, S * 0.22, [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]);
    }),
    // smoke: a lumpy soft blob, many overlapping puffs
    smoke: canvasTex(sc, "sfx_smoke", 128, (c, S) => {
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 22; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * S * 0.22, r = S * (0.14 + rnd() * 0.16);
        radial(c, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, [[0, "rgba(255,255,255,.22)"], [1, "rgba(255,255,255,0)"]]);
      }
    }),
    // a shard: a long thin diamond, for ice glitter and rock chips
    shard: canvasTex(sc, "sfx_shard", 64, (c, S) => {
      const g = c.createLinearGradient(0, 0, S, 0);
      g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,.5)");
      c.fillStyle = g;
      c.beginPath(); c.moveTo(S / 2, 2); c.lineTo(S * 0.68, S / 2); c.lineTo(S / 2, S - 2); c.lineTo(S * 0.32, S / 2); c.closePath(); c.fill();
    }),
    // a feather: a vane either side of a spine, for Raise and Benediction
    feather: canvasTex(sc, "sfx_feather", 64, (c, S) => {
      c.fillStyle = "rgba(255,255,255,.85)";
      c.beginPath(); c.ellipse(S / 2, S / 2, S * 0.16, S * 0.44, 0.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255,255,255,1)"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(S / 2 - 6, S - 4); c.lineTo(S / 2 + 6, 4); c.stroke();
    }),
  };
}

// ---------------------------------------------------------------- cards

function newMesh(sc: Scene, shape: Shape, name: string): Mesh {
  switch (shape) {
    case "disc": return MeshBuilder.CreateGround(name, { width: 2, height: 2, subdivisions: 12, updatable: true }, sc);
    case "plane": return MeshBuilder.CreatePlane(name, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, sc);
    case "cyl": return MeshBuilder.CreateCylinder(name, { height: 1, diameter: 2, tessellation: 36, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, sc);
    case "sphere": return MeshBuilder.CreateSphere(name, { diameter: 2, segments: 20, sideOrientation: Mesh.DOUBLESIDE }, sc);
    case "arc": return arcMesh(sc, name);
    case "sweep": return sweepMesh(sc, name);
    case "bolt": return boltMesh(sc, name);
  }
}

/** a flat crescent in the XY plane, radius 1, 200 degrees; uv.x along, uv.y across (1 the outer edge) */
function arcMesh(sc: Scene, name: string): Mesh {
  const N = 48, span = (200 * Math.PI) / 180, r0 = 0.46, r1 = 1;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = Math.PI / 2 + span / 2 - t * span;
    // centred so the crescent's middle passes through the origin: the slash
    // cuts THROUGH the target rather than hanging beside it (the first look)
    for (const [r, v] of [[r0, 0], [r1, 1]] as const) { pos.push(Math.cos(a) * r, Math.sin(a) * r - 0.74, 0); uv.push(t, v); }
    if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  return customMesh(sc, name, pos, uv, idx, false);
}

/** a band of a cylinder, radius 1, 1 tall, 240 degrees round; uv.x round, uv.y up */
function sweepMesh(sc: Scene, name: string): Mesh {
  const N = 48, span = (240 * Math.PI) / 180;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = span / 2 - t * span;
    for (const v of [0, 1]) { pos.push(Math.sin(a), v - 0.5, Math.cos(a)); uv.push(t, v); }
    if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  return customMesh(sc, name, pos, uv, idx, false);
}

const BOLT_N = 14;
function boltMesh(sc: Scene, name: string): Mesh {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= BOLT_N; i++) {
    pos.push(0, 0, 0, 0, 0, 0); uv.push(i / BOLT_N, 0, i / BOLT_N, 1);
    if (i < BOLT_N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  return customMesh(sc, name, pos, uv, idx, true);
}

function customMesh(sc: Scene, name: string, pos: number[], uv: number[], idx: number[], updatable: boolean): Mesh {
  const m = new Mesh(name, sc);
  const vd = new VertexData();
  // Float32Array, so getVerticesData hands back an array with .set (bolt)
  vd.positions = new Float32Array(pos); vd.uvs = uv; vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  vd.normals = normals;
  vd.applyToMesh(m, updatable);
  return m;
}

type Blend = "add" | "combine";
function newMat(sc: Scene, frag: string, name: string, blend: Blend): ShaderMaterial {
  registerShaders();
  const m = new ShaderMaterial(name, sc, { vertex: `sfx_${frag}`, fragment: `sfx_${frag}` }, {
    attributes: ["position", "normal", "uv"],
    uniforms: ["world", "worldViewProjection", "uEye", "uRoll", "uTime", "uT", "uGain", "uFog", "uStyle", "uSeed",
      "uCharge", "uFlash", "uA", "uB", "uC"],
    needAlphaBlending: true,
  });
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  // Additive light is right at night and in a dungeon, and saturates to white
  // over a sunlit meadow: fire and a sun are COMBINED (blended by their alpha)
  // so they keep their orange in daylight (the first Fire was a white can).
  m.alphaMode = blend === "add" ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
  m.setFloat("uRoll", 0);
  m.onBindObservable.add(() => {
    const e = m.getEffect();
    if (!e) return;
    e.setFloat("uTime", (performance.now() / 1000) % 3600);
    const cam = sc.activeCamera;
    if (cam) e.setVector3("uEye", cam.globalPosition);
    e.setFloat("uFog", sc.fogMode === Scene.FOGMODE_EXP2 ? sc.fogDensity : 0);
  });
  return m;
}

// the zone's glow layer, found on the scene (city-architecture.ts glowLayerOf):
// scene.ts's `glow` is the last zone's until the new one sets it up
function glowOf(sc: Scene): GlowLayer | null {
  for (const layer of sc.effectLayers) if (layer.name === "glow") return layer as GlowLayer;
  return null;
}

let cardSerial = 0;
function card(shape: Shape, frag: string, blend: Blend = "add"): Card {
  const s = S();
  const key = `${shape}|${frag}|${blend}`;
  const free = s.cards.get(key);
  const c = free?.pop();
  if (c) {
    c.mesh.setEnabled(true);
    c.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE;
    c.mesh.rotation.setAll(0);
    c.mesh.scaling.setAll(1);
    c.mat.setFloat("uRoll", 0);
    return c;
  }
  const id = cardSerial++;
  const mesh = fxMesh(newMesh(s.scene, shape, `sfx_${frag}_${id}`));
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = shape === "disc" || shape === "bolt"; // their buffers move under a fixed box
  const mat = newMat(s.scene, frag, `sfxm_${frag}_${id}`, blend);
  mesh.material = mat;
  const g = glowOf(s.scene);
  if (g) {
    // NOT flagged glowPass: a dungeon's glow pass occludes with the plan's walls
    // only, and a rune's bloom shone through a parapet in front of it (the
    // mausoleum look). Unflagged, a dungeon leaves it out (glowOnlyEmitters).
    if (GLOWS.has(frag)) g.referenceMeshToUseItsOwnMaterial(mesh);
    else g.addExcludedMesh(mesh);
  }
  return { mesh, mat, key };
}

function release(c: Card): void {
  const s = states.get(c.mesh.getScene());
  if (!s || c.mesh.isDisposed()) return;
  c.mesh.setEnabled(false);
  c.mesh.parent = null;
  let list = s.cards.get(c.key);
  if (!list) { list = []; s.cards.set(c.key, list); }
  list.push(c);
}

interface Look { colours: Palette; style?: number; seed?: number; gain?: number }
function look(c: Card, l: Look): Card {
  c.mat.setColor3("uA", hex(l.colours[0]));
  c.mat.setColor3("uB", hex(l.colours[1]));
  c.mat.setColor3("uC", hex(l.colours[2]));
  c.mat.setFloat("uStyle", l.style ?? 0);
  c.mat.setFloat("uSeed", l.seed ?? Math.random() * 100);
  c.mat.setFloat("uGain", l.gain ?? 1);
  c.mat.setFloat("uT", 0);
  c.mat.setFloat("uCharge", 0);
  c.mat.setFloat("uFlash", 0);
  return c;
}
const setT = (c: Card, t: number) => c.mat.setFloat("uT", t);
const setGain = (c: Card, g: number) => c.mat.setFloat("uGain", g);

/** a disc of radius r lying on the ground at (x, z), each vertex on the
 *  surface under it (within a metre of y: a ledge does not lift it up a wall) */
function hug(c: Card, x: number, y: number, z: number, r: number, follow = false): void {
  const h = c.hugAt;
  // a follower re-hugs when it has moved or grown a step, and otherwise only rescales
  if (follow && h && Math.abs(h[0] - x) < 0.25 && Math.abs(h[2] - z) < 0.25 && Math.abs(h[1] - y) < 0.25 && Math.abs(h[3] - r) < 0.2) {
    c.mesh.scaling.set(r, 1, r);
    return;
  }
  c.hugAt = [x, y, z, r];
  const m = c.mesh;
  m.position.set(x, y, z);
  m.scaling.set(r, 1, r);
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) {
    const gy = groundHeight(x + pos[i] * r, z + pos[i + 2] * r, y);
    pos[i + 1] = Math.max(-1, Math.min(1, gy - y)) + 0.06;
  }
  m.updateVerticesData(VertexBuffer.PositionKind, pos);
}
/** the same disc lying flat (a halo floating at the waist) */
function flat(c: Card, x: number, y: number, z: number, r: number): void {
  if (c.hugAt) {
    const pos = c.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 1; i < pos.length; i += 3) pos[i] = 0;
    c.mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    c.hugAt = undefined;
  }
  c.mesh.position.set(x, y, z);
  c.mesh.scaling.set(r, 1, r);
}

// ---------------------------------------------------------------- particles

type Tex = "dot" | "star" | "smoke" | "shard" | "feather";
interface Spray {
  at: Vector3;
  tex?: Tex;
  /** a burst of this many at once; or `rate` a second for `dur` */
  count?: number;
  rate?: number;
  dur?: number;
  shape?: { sphere: number; inward?: boolean } | { cyl: number; h: number } | { box: [Vector3, Vector3] } | { cone: number; angle: number };
  dir?: [Vector3, Vector3];
  power?: [number, number];
  gravity?: number;
  size?: [number, number];
  life?: [number, number];
  c1: string; c2: string;
  blend?: "add" | "std";
  stretch?: boolean;
  spin?: [number, number];
  /** a fade to a dark colour instead of to nothing (smoke) */
  dead?: string;
}

const CAPACITY = 500;
let psSerial = 0;
function spray(o: Spray): ParticleSystem {
  const s = S();
  let ps = s.systems.pop();
  if (!ps) {
    ps = fxParticles(new ParticleSystem(`sfx_ps_${psSerial++}`, CAPACITY, s.scene));
  }
  ps.reset();
  ps.particleTexture = s.tex[o.tex ?? "dot"];
  ps.emitter = o.at;
  const sh = o.shape;
  if (sh && "sphere" in sh) {
    // converging motes start on the surface; a burst fills the ball
    ps.createSphereEmitter(sh.sphere, sh.inward ? 0 : 1);
  } else if (sh && "cyl" in sh) {
    ps.createDirectedCylinderEmitter(sh.cyl, sh.h, 0.15, o.dir?.[0] ?? new Vector3(0, 1, 0), o.dir?.[1] ?? new Vector3(0, 1, 0));
  } else if (sh && "cone" in sh) {
    ps.createConeEmitter(sh.cone, sh.angle);
  } else {
    const box = sh && "box" in sh ? sh.box : [new Vector3(-0.1, 0, -0.1), new Vector3(0.1, 0.1, 0.1)];
    ps.createBoxEmitter(o.dir?.[0] ?? new Vector3(-1, 1, -1), o.dir?.[1] ?? new Vector3(1, 1, 1), box[0], box[1]);
  }
  const inward = !!(sh && "sphere" in sh && sh.inward);
  ps.color1 = Color4.FromHexString(o.c1 + "ff");
  ps.color2 = Color4.FromHexString(o.c2 + "ff");
  ps.colorDead = o.dead ? Color4.FromHexString(o.dead + "00") : new Color4(0, 0, 0, 0);
  ps.minSize = o.size?.[0] ?? 0.06; ps.maxSize = o.size?.[1] ?? 0.16;
  ps.minLifeTime = o.life?.[0] ?? 0.4; ps.maxLifeTime = o.life?.[1] ?? 0.9;
  const pw = o.power ?? [1, 3];
  ps.minEmitPower = inward ? -pw[1] : pw[0]; ps.maxEmitPower = inward ? -pw[0] : pw[1];
  ps.gravity.set(0, -(o.gravity ?? 0), 0);
  ps.blendMode = o.blend === "std" ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
  ps.billboardMode = o.stretch ? ParticleSystem.BILLBOARDMODE_STRETCHED : ParticleSystem.BILLBOARDMODE_ALL;
  ps.minAngularSpeed = o.spin?.[0] ?? 0; ps.maxAngularSpeed = o.spin?.[1] ?? 0;
  ps.minInitialRotation = 0; ps.maxInitialRotation = o.spin ? Math.PI * 2 : 0;
  ps.preWarmCycles = 0;
  ps.updateSpeed = 1 / 60;
  ps.targetStopDuration = 0;
  if (o.count) { ps.emitRate = 0; ps.manualEmitCount = Math.min(CAPACITY, o.count); }
  else { ps.manualEmitCount = -1; ps.emitRate = o.rate ?? 20; }
  ps.start();
  const sys = ps;
  const lifeMax = ps.maxLifeTime;
  if (o.count) after(lifeMax + 0.1, () => giveBack(sys));
  else if (o.dur !== undefined) after(o.dur, () => { sys.stop(); after(lifeMax + 0.1, () => giveBack(sys)); });
  return ps;
}
/** stop a continuous spray and return it once its last particle has died */
function stopSpray(ps: ParticleSystem): void {
  ps.stop();
  const life = ps.maxLifeTime;
  after(life + 0.1, () => giveBack(ps));
}
function giveBack(ps: ParticleSystem): void {
  const s = states.get(ps.getScene() as Scene);
  if (!s) return;
  ps.stop();
  ps.reset();
  if (!s.systems.includes(ps)) s.systems.push(ps);
}

// ---------------------------------------------------------------- solid bits: rocks, crystals

let solidSerial = 0;
const UP = new Vector3(0, 1, 0);
/** turn a mesh so its local +y points along d (a spike, a lance) */
function pointAlong(m: AbstractMesh, d: Vector3): void {
  if (!m.rotationQuaternion) m.rotationQuaternion = new Quaternion();
  Quaternion.FromUnitVectorsToRef(UP, d.normalizeToNew(), m.rotationQuaternion);
}
function rock(): Mesh {
  const s = S();
  const r = s.rocks.pop();
  if (r && !r.isDisposed()) { r.setEnabled(true); r.rotationQuaternion = null; r.rotation.setAll(0); return r; }
  const id = solidSerial++;
  // a lumpy chunk: an icosphere pushed in and out at every vertex, then faceted
  const m = fxMesh(MeshBuilder.CreateIcoSphere(`sfx_rock_${id}`, { radius: 0.5, subdivisions: 1 }, s.scene));
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  let seed = id * 7919 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const moved = new Map<string, number>();
  for (let i = 0; i < pos.length; i += 3) {
    // the same corner shared by several faces moves the same way, or the chunk cracks
    const key = `${pos[i].toFixed(3)},${pos[i + 1].toFixed(3)},${pos[i + 2].toFixed(3)}`;
    let k = moved.get(key);
    if (k === undefined) { k = 0.7 + rnd() * 0.55; moved.set(key, k); }
    pos[i] *= k; pos[i + 1] *= k * 0.85; pos[i + 2] *= k;
  }
  m.updateVerticesData(VertexBuffer.PositionKind, pos);
  m.material = s.rockMat;
  m.isPickable = false;
  m.convertToFlatShadedMesh();
  glowOf(s.scene)?.addExcludedMesh(m);
  return m;
}
function crystal(): Mesh {
  const s = S();
  const r = s.crystals.pop();
  if (r && !r.isDisposed()) { r.setEnabled(true); r.rotationQuaternion = null; r.rotation.setAll(0); return r; }
  // a hexagonal spike, its base at the origin, 1 m tall
  const m = fxMesh(MeshBuilder.CreateCylinder(`sfx_ice_${solidSerial++}`, { height: 1, diameterTop: 0, diameterBottom: 0.36, tessellation: 6 }, s.scene));
  m.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  m.material = s.iceMat;
  m.isPickable = false;
  m.convertToFlatShadedMesh();
  glowOf(s.scene)?.addExcludedMesh(m);
  return m;
}
function putBack(list: "rocks" | "crystals", m: Mesh): void {
  const s = states.get(m.getScene());
  if (!s || m.isDisposed()) return;
  m.setEnabled(false);
  s[list].push(m);
}

// ---------------------------------------------------------------- light

// The one light, parked at zero between uses, reused for the life of the
// zone: creating or disposing a light marks every mesh light-dirty and
// recompiles (old vfx.ts's reasoning, kept). Grand moments only.
function flashLight(at: Vector3, colour: string, peak: number, dur: number): void {
  const s = S();
  if (!s.light || s.light.isDisposed()) {
    const l = new PointLight("sfx_light", Vector3.Zero(), s.scene);
    l.range = 20;
    l.intensity = 0;
    s.light = l;
  }
  const l = s.light;
  l.position.set(at.x, at.y + 2, at.z);
  l.diffuse = hex(colour);
  run(dur, (t) => { l.intensity = peak * envelope(t, 0.05, 0.1); }, () => { l.intensity = 0; });
}

// ---------------------------------------------------------------- helpers over actors

const V = () => new Vector3();
function feet(a: FxActor): Vector3 { return a.node.getAbsolutePosition().clone(); }
function chest(a: FxActor): Vector3 { const p = feet(a); p.y += a.height * 0.58; return p; }
function scaleOf(a: FxActor): number { return Math.max(1, a.height / 1.8); }
function handPoint(a: FxActor): Vector3 {
  const hs = a.hands?.() ?? [];
  if (hs.length) {
    const p = V();
    for (const h of hs) p.addInPlace(h);
    return p.scaleInPlace(1 / hs.length);
  }
  const p = chest(a);
  const yaw = a.node.rotation.y;
  // the avatars' forward is local -z turned by yaw (entities.ts castOrb's z 0.45 sits in front)
  p.x += Math.sin(yaw) * 0.45; p.z += Math.cos(yaw) * 0.45;
  return p;
}
function cameraDir(from: Vector3): Vector3 {
  const cam = S().scene.activeCamera;
  if (!cam) return new Vector3(0, 0, -1);
  return cam.globalPosition.subtract(from).normalize();
}

// ---------------------------------------------------------------- primitives

/** a shockwave on the ground at p, out to radius r in dur seconds */
function shock(p: Vector3, r: number, colours: Palette, dur = 0.6, gain = 1, delay = 0): void {
  const go = () => {
    const c = look(card("disc", "ring"), { colours, gain });
    hug(c, p.x, p.y, p.z, r);
    run(dur, (t) => setT(c, t), () => release(c));
  };
  if (delay > 0) after(delay, go); else go();
}
/** a pool of light under p that rises fast and fades */
function pool(p: Vector3, r: number, colours: Palette, dur = 0.9, gain = 0.8, style = 0): void {
  const c = look(card("disc", "pool"), { colours, gain: 0, style });
  hug(c, p.x, p.y, p.z, r);
  run(dur, (t) => setGain(c, gain * envelope(t, 0.1, 0.2)), () => release(c));
}
/** a camera-facing sprite at p (style: 0 orb .. 6 moon), size metres */
function sprite(p: Vector3, size: number, colours: Palette, style: number, dur: number, grow = 1, gain = 1): Card {
  const c = look(card("plane", "sprite"), { colours, style, gain: 0 });
  c.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
  c.mesh.position.copyFrom(p);
  c.mesh.scaling.setAll(size);
  run(dur, (t) => {
    setT(c, t);
    setGain(c, gain * envelope(t, 0.08, 0.2));
    c.mesh.scaling.setAll(size * (1 + (grow - 1) * t));
  }, () => release(c));
  return c;
}
/** a column: base at p, radius r, height h; style 0 streaks, 1 beam, 2 spiral */
function column(p: Vector3, r: number, h: number, colours: Palette, style: number, dur: number, gain = 1): Card {
  const c = look(card("cyl", "column"), { colours, style, gain: 0 });
  c.mesh.position.set(p.x, p.y + h / 2, p.z);
  c.mesh.scaling.set(r, h, r);
  run(dur, (t) => setGain(c, gain * envelope(t, 0.1, 0.3)), () => release(c));
  return c;
}
/** a shell round p: radius r0 to r1 over dur; style per the shell shader */
function shell(p: Vector3, r0: number, r1: number, colours: Palette, style: number, dur: number, gain = 1, squash = 1): Card {
  // a sun and a flame aura keep their colour in daylight (newMat)
  const c = look(card("sphere", "shell", style === 2 || style === 5 ? "combine" : "add"), { colours, style, gain: 0 });
  c.mesh.position.copyFrom(p);
  run(dur, (t) => {
    const e = 1 - Math.pow(1 - t, 3);
    const r = r0 + (r1 - r0) * e;
    c.mesh.scaling.set(r, r * squash, r);
    setGain(c, gain * envelope(t, 0.1, 0.25));
  }, () => release(c));
  return c;
}
/** a slash: a billboarded crescent at p, radius r, rolled `roll` radians, swept in dur */
function slash(p: Vector3, r: number, roll: number, colours: Palette, dur: number, delay = 0, gain = 1.2): void {
  const go = () => {
    const c = look(card("arc", "slash"), { colours, gain });
    c.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    c.mesh.position.copyFrom(p);
    c.mesh.scaling.setAll(r);
    c.mat.setFloat("uRoll", roll);
    // and a wider, softer copy behind it: the slash's glow
    const g = look(card("arc", "slash"), { colours, gain: gain * 0.4 });
    g.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    g.mesh.position.copyFrom(p);
    g.mesh.scaling.setAll(r * 1.18);
    g.mat.setFloat("uRoll", roll);
    run(dur, (t) => {
      const f = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      setT(c, t); setGain(c, gain * f);
      setT(g, t * 0.97); setGain(g, gain * 0.4 * f);
    }, () => { release(c); release(g); });
  };
  if (delay > 0) after(delay, go); else go();
}
/** a horizontal sweep round p: a band of a cylinder, radius r, height h, facing yaw */
function sweep(p: Vector3, r: number, h: number, yaw: number, tilt: number, colours: Palette, dur: number, delay = 0, gain = 1.2): void {
  const go = () => {
    const c = look(card("sweep", "slash"), { colours, gain });
    c.mesh.position.copyFrom(p);
    c.mesh.scaling.set(r, h, r);
    c.mesh.rotation.set(0, yaw, tilt);
    run(dur, (t) => { setT(c, t); setGain(c, gain * (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25)); }, () => release(c));
  };
  if (delay > 0) after(delay, go); else go();
}
/** a fire column: base p, radius r, height h */
function flames(p: Vector3, r: number, h: number, colours: Palette, dur: number, gain = 1): void {
  const c = look(card("cyl", "flame", "combine"), { colours, gain: 0 });
  c.mesh.position.set(p.x, p.y + h / 2, p.z);
  c.mesh.scaling.set(r, h, r);
  run(dur, (t) => {
    setGain(c, gain * envelope(t, 0.12, 0.3));
    c.mesh.scaling.set(r * (1 + t * 0.3), h * (0.6 + 0.4 * Math.min(1, t * 4)), r * (1 + t * 0.3));
    c.mesh.position.y = p.y + c.mesh.scaling.y / 2;
  }, () => release(c));
}
/** a lightning bolt from `height` above p down to p, facing the camera */
function bolt(p: Vector3, height: number, width: number, colours: Palette, dur: number, delay = 0): void {
  const go = () => {
    const c = look(card("bolt", "bolt"), { colours, gain: 0 });
    const pts = boltPath(height, BOLT_N, 1.1, (Math.random() * 1e9) | 0);
    const cam = cameraDir(p);
    const pos = c.mesh.getVerticesData(VertexBuffer.PositionKind) as Float32Array;
    for (let i = 0; i <= BOLT_N; i++) {
      const a = pts[i], b = pts[Math.min(BOLT_N, i + 1)], z = pts[Math.max(0, i - 1)];
      const along = new Vector3(b[0] - z[0], b[1] - z[1], b[2] - z[2]).normalize();
      const side = Vector3.Cross(along, cam).normalize().scaleInPlace(width * (i === BOLT_N ? 0.6 : 1));
      pos.set([a[0] - side.x, a[1] - side.y, a[2] - side.z, a[0] + side.x, a[1] + side.y, a[2] + side.z], i * 6);
    }
    c.mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    c.mesh.position.copyFrom(p);
    run(dur, (t) => setGain(c, (t < 0.15 ? 1.3 : 1) * (1 - t) * (0.6 + 0.4 * Math.sin(t * 60))), () => release(c));
  };
  if (delay > 0) after(delay, go); else go();
}

// ---------------------------------------------------------------- casting

/** cast_start: the job's circle under the caster for the whole cast bar, a
 *  halo turning at the waist (two for a grand spell), a column of streaks,
 *  motes spiralling up, a light gathering in the hands. */
function castBegin(w: FxWorld, src: string, fx: ResolvedFx | null, ms: number, enemy = false): void {
  const s = S();
  const prev = s.casts.get(src);
  if (prev) { prev.end(false); prev.endHands(); }
  const a = actorOf(w, src);
  if (!a) return;
  const total = Math.max(0.3, ms / 1000);
  const colours = enemy ? ENEMY_COLOURS : fx?.colours ?? FX_FAMILIES.cure.colours;
  const style = enemy ? ENEMY_RUNE : fx?.rune ?? 0;
  const grand = !!fx?.grand;
  const R = (enemy ? 1.8 : fx?.runeRadius ?? 1.6) * scaleOf(a);
  const H = a.height;
  const started = NOW();
  const vol = loud(w, src);
  const voiceHum: Hum = sfx.castBegin(style, grand, total, vol);

  const disc = look(card("disc", "rune"), { colours, style, gain: 0 });
  const halos: { c: Card; y: number; r: number }[] = [
    { c: look(card("disc", "rune"), { colours, style: style + 10, gain: 0 }), y: H * 0.45, r: R * 0.62 },
  ];
  if (grand) halos.push({ c: look(card("disc", "rune"), { colours, style: style + 10, gain: 0 }), y: H * 1.12, r: R * 0.42 });
  const col = look(card("cyl", "column"), { colours, style: 0, gain: 0 });
  const p0 = feet(a);
  const emitAt = p0.clone();
  const motes = spray({
    at: emitAt, tex: "dot", rate: grand ? 70 : 42, shape: { cyl: R * 0.85, h: 0.1 },
    dir: [new Vector3(-0.15, 1, -0.15), new Vector3(0.15, 1, 0.15)], power: [0.9, 2.2],
    size: [0.05, 0.14], life: [0.8, 1.5], c1: colours[1], c2: colours[2],
  });
  const sparkAt = p0.clone();
  const handSparks = enemy ? null : spray({
    at: sparkAt, tex: "star", rate: 18, shape: { sphere: 0.12 }, power: [0.2, 0.6],
    size: [0.06, 0.16], life: [0.3, 0.6], c1: colours[2], c2: colours[1], spin: [-3, 3],
  });
  const orb = enemy ? null : look(card("plane", "sprite"), { colours, style: 0, gain: 0 });
  if (orb) orb.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
  let handAt = handPoint(a);

  let done = false;
  let flashFrom = -1;
  const handsLive = { on: !!orb };
  const stepAll = (now: number) => {
    const act = actorOf(w, src);
    if (!act) return;
    const p = feet(act);
    const elapsed = now - started;
    const k = charge(elapsed, total);
    const fade = flashFrom < 0 ? Math.min(1, elapsed / 0.25) : Math.max(0, 1 - (now - flashFrom) / 0.45);
    const flash = flashFrom < 0 ? 0 : Math.max(0, 1 - (now - flashFrom) / 0.3);
    const rNow = R * (1.12 - 0.12 * k) * (1 + flash * 0.25);
    hug(disc, p.x, p.y, p.z, rNow, true);
    setGain(disc, fade * (grand ? 1.15 : 1));
    disc.mat.setFloat("uCharge", k);
    disc.mat.setFloat("uFlash", flash);
    for (const h of halos) {
      flat(h.c, p.x, p.y + h.y + Math.sin(now * 2) * 0.05, p.z, h.r * (1 + flash * 0.4));
      setGain(h.c, fade * (0.55 + 0.45 * k));
      h.c.mat.setFloat("uCharge", k);
    }
    col.mesh.position.set(p.x, p.y + (H * 1.5) / 2, p.z);
    col.mesh.scaling.set(R * 0.72, H * 1.5, R * 0.72);
    setGain(col, fade * (0.35 + 0.4 * k));
    emitAt.copyFrom(p);
    if (orb && handsLive.on) {
      handAt = handPoint(act);
      orb.mesh.position.copyFrom(handAt);
      orb.mesh.scaling.setAll((0.32 + 0.4 * k) * (1 + Math.sin(now * 14) * 0.08) * (1 + flash));
      setGain(orb, Math.min(1, elapsed / 0.2));
      sparkAt.copyFrom(handAt);
    }
  };

  const cast: CastFx = {
    src, fx, started, total, released: false,
    hold: () => handAt.clone(),
    end: (withFlash: boolean) => {
      if (done) return;
      done = true;
      cast.released = true;
      stopSpray(motes);
      voiceHum.stop(withFlash ? 0.15 : 0.25);
      if (withFlash) {
        sfx.castRelease(style, grand, vol);
        flashFrom = NOW();
        const p = actorOf(w, src) ? feet(actorOf(w, src)!) : p0;
        shock(p, R * 2.1, colours, 0.55, 1.1);
        spray({
          at: p.clone(), tex: "star", count: grand ? 60 : 30, shape: { cyl: R * 0.7, h: 0.1 },
          dir: [new Vector3(-0.3, 1, -0.3), new Vector3(0.3, 1, 0.3)], power: [3, 6], size: [0.08, 0.2],
          life: [0.4, 0.8], c1: colours[1], c2: colours[2], gravity: 2,
        });
      } else flashFrom = NOW();
    },
    endHands: () => {
      // the cast is the caster's until its hands let go: the bolt leaves from them
      if (s.casts.get(src) === cast) s.casts.delete(src);
      if (!handsLive.on) return;
      handsLive.on = false;
      if (handSparks) stopSpray(handSparks);
      if (orb) {
        const o = orb;
        run(0.18, (t) => { o.mesh.scaling.setAll(0.7 * (1 + t)); setGain(o, 1 - t); }, () => release(o));
      }
    },
  };
  s.casts.set(src, cast);
  // one run drives the whole cast, through the release flash's fade
  const life = total + 1.0;
  run(life, (_t, now) => {
    stepAll(now);
    if (!done && now - started >= total) cast.end(true);
    // the spell's event normally takes the hands; if it never comes (a
    // fizzle, a Raise waiting on its answer), let them go
    if (now - started >= total + 0.9) cast.endHands();
  }, () => {
    if (!done) cast.end(false);
    cast.endHands();
    release(disc); for (const h of halos) release(h.c); release(col);
  });
}

/** an instant job ability's circle: the job's rune flashing out under the user */
function jaCircle(w: FxWorld, src: string, fx: ResolvedFx): void {
  const a = actorOf(w, src);
  if (!a) return;
  const k = scaleOf(a);
  const c = look(card("disc", "rune"), { colours: fx.colours, style: fx.rune, gain: 0 });
  c.mat.setFloat("uCharge", 1);
  run(0.75, (t) => {
    const act = actorOf(w, src);
    if (!act) return;
    const p = feet(act);
    hug(c, p.x, p.y, p.z, 1.5 * k * (0.7 + 0.5 * Math.min(1, t * 3)), true);
    setGain(c, envelope(t, 0.12, 0.25) * 1.1);
    c.mat.setFloat("uFlash", Math.max(0, 1 - t * 4));
  }, () => release(c));
  shock(feet(a), 2.6 * k, fx.colours, 0.5);
  sfx.jaFlash(fx.rune, loud(w, src));
}

// ---------------------------------------------------------------- projectiles

const PROJ_STYLE: Record<NonNullable<Projectile>, { size: number; lift: number; tex: Tex; rate: number }> = {
  rock: { size: 0.55, lift: 1.4, tex: "smoke", rate: 50 },
  fireball: { size: 0.9, lift: 0.8, tex: "dot", rate: 140 },
  ice: { size: 0.6, lift: 0.5, tex: "shard", rate: 90 },
  wind: { size: 0.7, lift: 0.3, tex: "dot", rate: 90 },
  lance: { size: 0.7, lift: 0.1, tex: "star", rate: 120 },
  orb: { size: 0.65, lift: 0.9, tex: "dot", rate: 90 },
  miasma: { size: 0.85, lift: 1.0, tex: "smoke", rate: 70 },
};

/** from the caster's hands to the target's chest, homing; `land` at arrival */
function projectile(w: FxWorld, src: string, tgt: string, fx: ResolvedFx, land: () => void): void {
  const sa = actorOf(w, src), ta = actorOf(w, tgt);
  if (!sa || !ta || !fx.projectile) { land(); return; }
  const kind = fx.projectile;
  const st = PROJ_STYLE[kind];
  const cast = S().casts.get(src);
  const from = cast ? cast.hold() : handPoint(sa);
  cast?.endHands();
  const to0 = chest(ta);
  const dur = flightTime(Vector3.Distance(from, to0), kind);
  sfx.launch(kind, dur, loud(w, src));
  const tier = fx.tier;
  const big = 1 + (tier - 1) * 0.18;
  const c = fx.colours;
  const core = look(card("plane", "sprite"), { colours: c, style: kind === "lance" ? 1 : 0, gain: 1.2 });
  core.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
  core.mesh.scaling.setAll(st.size * big);
  const at = from.clone();
  const trail = spray({
    at, tex: st.tex, rate: st.rate, shape: { sphere: 0.08 * big }, power: [0.05, 0.4],
    size: kind === "miasma" ? [0.3, 0.6] : kind === "rock" ? [0.18, 0.4] : [0.1, 0.28],
    life: [0.2, 0.45], c1: kind === "rock" ? "#8a6a48" : c[1], c2: c[2],
    blend: kind === "rock" || kind === "miasma" ? "std" : "add", dead: kind === "miasma" ? "#1a0a20" : undefined,
    spin: kind === "ice" || kind === "rock" ? [-4, 4] : undefined,
  });
  let solid: Mesh | null = null;
  let streak: Card | null = null;
  if (kind === "rock") { solid = rock(); solid.scaling.setAll(0.75 * big); }
  if (kind === "ice") { solid = crystal(); solid.scaling.set(0.8 * big, 1.6 * big, 0.8 * big); }
  if (kind === "lance") {
    streak = look(card("cyl", "column"), { colours: c, style: 1, gain: 1 });
  }
  const spinAxis = new Vector3(Math.random(), Math.random(), Math.random()).normalize();
  const prev = from.clone();
  run(dur, (t) => {
    const ta2 = actorOf(w, tgt);
    const to = ta2 ? chest(ta2) : to0;
    const p = arcPoint([from.x, from.y, from.z], [to.x, to.y, to.z], t, st.lift);
    prev.copyFrom(at);
    at.set(p[0], p[1], p[2]);
    core.mesh.position.copyFrom(at);
    core.mesh.scaling.setAll(st.size * big * (1 + Math.sin(t * 40) * 0.1));
    const dir = at.subtract(prev);
    if (solid) {
      solid.position.copyFrom(at);
      if (kind === "rock") solid.rotate(spinAxis, 0.35);
      else if (dir.lengthSquared() > 1e-6) pointAlong(solid, dir);   // the spike flies point first
    }
    if (streak && dir.lengthSquared() > 1e-6) {
      const d = dir.normalize();
      const len = 2.4 * big;
      streak.mesh.position.copyFrom(at.subtract(d.scale(len / 2)));
      streak.mesh.scaling.set(0.12 * big, len, 0.12 * big);
      pointAlong(streak.mesh, d);
    }
  }, () => {
    release(core);
    stopSpray(trail);
    if (solid) putBack(kind === "rock" ? "rocks" : "crystals", solid);
    if (streak) { streak.mesh.rotationQuaternion = null; release(streak); }
    land();
  });
}

// ---------------------------------------------------------------- spell impacts

function impact(w: FxWorld, src: string, tgt: string, fx: ResolvedFx): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const k = scaleOf(a);
  const base = feet(a), mid = chest(a);
  const c = fx.colours, tier = fx.tier;
  const T = 1 + (tier - 1) * 0.25;
  const vol = loud(w, src, tgt);
  sfx.spellLands(fx, vol);
  switch (fx.family) {
    case "stone": return stoneImpact(w, tgt, a, fx, vol);
    case "fire": {
      shell(mid, 0.4 * k, 1.4 * k * T, c, 2, 0.7, 0.6, 1.15);
      flames(base, 0.8 * k * T, 3.2 * k * T, c, 1.0, 1.0);
      sprite(mid, 1.8 * k * T, c, 1, 0.3, 1.4, 0.8);
      spray({ at: mid.clone(), tex: "dot", count: Math.round(50 * T), shape: { sphere: 0.4 * k }, power: [2, 6], gravity: -1.5, size: [0.08, 0.22], life: [0.5, 1.1], c1: c[1], c2: c[2] });
      spray({ at: base.clone(), tex: "smoke", count: 18, shape: { cyl: 0.6 * k, h: 0.2 }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [0.8, 1.8], size: [0.8, 1.6], life: [0.9, 1.6], c1: "#3a2418", c2: "#1e140e", blend: "std", spin: [-1, 1] });
      shock(base, 3.2 * k * T, c, 0.6);
      pool(base, 2.4 * k * T, c, 1.0, 0.9, 2);
      return;
    }
    case "flare": {
      // the sun gathers, then goes off
      spray({ at: mid.clone(), tex: "star", count: 80, shape: { sphere: 3.2 * k, inward: true }, power: [6, 9], size: [0.1, 0.25], life: [0.32, 0.4], c1: c[1], c2: c[2] });
      shell(mid, 0.3 * k, 0.9 * k, c, 5, 0.4, 1.2);
      sfx.flareDraw(vol);
      after(0.32, () => {
        sfx.flareBoom(vol);
        const m2 = a.node.isDisposed() ? mid : chest(a);
        shell(m2, 0.6 * k, 2.8 * k, c, 5, 1.1, 0.75);
        flames(base, 1.6 * k, 5 * k, c, 1.2, 0.9);
        sprite(m2, 4 * k, c, 1, 0.5, 1.6, 0.9);
        column(base, 1.4 * k, 9 * k, c, 1, 0.8, 0.5);
        shock(base, 7 * k, c, 0.9, 1.2);
        shock(base, 5 * k, c, 0.7, 1, 0.12);
        pool(base, 4.5 * k, c, 2.2, 1, 2);
        spray({ at: m2.clone(), tex: "dot", count: 260, shape: { sphere: 0.8 * k }, power: [5, 12], gravity: 2, size: [0.1, 0.3], life: [0.6, 1.4], c1: c[1], c2: c[2] });
        spray({ at: base.clone(), tex: "smoke", count: 30, shape: { cyl: 1.6 * k, h: 0.3 }, dir: [new Vector3(-0.4, 1, -0.4), new Vector3(0.4, 1, 0.4)], power: [1, 3], size: [1.4, 2.6], life: [1.2, 2.2], c1: "#3a2216", c2: "#140c08", blend: "std", spin: [-1, 1] });
        flashLight(m2, c[1], 3, 0.8);
      });
      return;
    }
    case "blizzard": return iceImpact(a, fx, false, vol);
    case "freeze": return iceImpact(a, fx, true, vol);
    case "thunder": {
      const n = tier >= 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const d = i * 0.09;
        const off = new Vector3((Math.random() - 0.5) * 0.4 * k, 0, (Math.random() - 0.5) * 0.4 * k);
        bolt(base.add(off), 16, (0.22 + 0.06 * tier) * k, c, 0.32, d);
      }
      sprite(mid, 3.2 * k, c, 1, 0.4, 1.3, 1.3);
      spray({ at: base.clone(), tex: "dot", count: 70, shape: { sphere: 0.3 * k }, power: [4, 9], gravity: 9, size: [0.05, 0.12], life: [0.3, 0.7], c1: c[2], c2: c[1], stretch: true });
      shock(base, 3.6 * k * T, c, 0.45, 1.3);
      pool(base, 2.6 * k, c, 0.7, 1.2, 1);
      column(base, 1 * k, 16, c, 1, 0.35, 0.8);
      flashLight(mid, c[2], 4, 0.4);
      return;
    }
    case "aero": {
      for (let i = 0; i < 3; i++) {
        const y = base.y + a.height * (0.2 + i * 0.35);
        const r = (1.0 + i * 0.25) * k;
        const ring = look(card("sweep", "slash"), { colours: c, gain: 1.1 });
        ring.mesh.position.set(base.x, y, base.z);
        ring.mesh.scaling.set(r, 0.35 * k, r);
        const y0 = Math.random() * Math.PI * 2;
        run(0.9, (t) => {
          ring.mesh.rotation.y = y0 + t * 9 + i;
          ring.mesh.position.y = y + t * 0.6;
          setT(ring, 0.55 + 0.25 * Math.sin(t * Math.PI));
          setGain(ring, 1.1 * envelope(t, 0.1, 0.4));
        }, () => release(ring));
      }
      shell(mid, 0.9 * k, 1.5 * k * T, c, 3, 0.9, 1, 1.4);
      spray({ at: base.clone(), tex: "shard", count: 50, shape: { cyl: 1.2 * k, h: 0.4 }, dir: [new Vector3(-1, 1.5, -1), new Vector3(1, 3, 1)], power: [1.5, 3.5], size: [0.08, 0.2], life: [0.6, 1.1], c1: c[1], c2: c[2], spin: [-8, 8] });
      shock(base, 3 * k, c, 0.6);
      return;
    }
    case "banish": {
      sprite(mid, 2.4 * k * T, c, 3, 0.7, 1.25, 1.2);
      sprite(mid, 3 * k * T, c, 1, 0.35, 1.5, 1.1);
      spray({ at: mid.clone(), tex: "star", count: Math.round(40 * T), shape: { sphere: 0.5 * k }, power: [2, 5], size: [0.1, 0.24], life: [0.5, 1], c1: c[1], c2: c[2], spin: [-3, 3] });
      shock(base, 3 * k * T, c, 0.6);
      if (tier >= 3) column(base, 1.1 * k, 10, c, 1, 0.7, 0.7);
      return;
    }
    case "holy": {
      const rr = 2.4 * k;
      const glyph = look(card("disc", "rune"), { colours: c, style: JOB_RUNES.WHM.style, gain: 0 });
      hug(glyph, base.x, base.y, base.z, rr);
      run(1.6, (t) => { setGain(glyph, envelope(t, 0.1, 0.3) * 1.2); glyph.mat.setFloat("uCharge", 1); glyph.mat.setFloat("uFlash", Math.max(0, 1 - t * 3)); }, () => release(glyph));
      column(base, 1.3 * k, 22, c, 1, 1.1, 0.8);
      after(0.15, () => {
        shell(mid, 0.5 * k, 2 * k, c, 5, 0.9, 0.45);
        sprite(mid, 3.2 * k, c, 1, 0.5, 1.5, 0.9);
        shock(base, 6.5 * k, c, 0.8, 1.2);
        shock(base, 4.5 * k, c, 0.6, 1, 0.1);
        spray({ at: new Vector3(base.x, base.y + 6, base.z), tex: "feather", count: 40, shape: { cyl: 2 * k, h: 0.5 }, dir: [new Vector3(-0.3, -1, -0.3), new Vector3(0.3, -0.6, 0.3)], power: [0.8, 1.6], size: [0.15, 0.3], life: [1.5, 2.6], c1: c[1], c2: c[2], spin: [-2, 2] });
        spray({ at: mid.clone(), tex: "star", count: 120, shape: { sphere: 0.6 * k }, power: [4, 10], gravity: 1, size: [0.1, 0.28], life: [0.6, 1.3], c1: c[1], c2: c[2] });
        flashLight(mid, c[1], 5, 0.7);
      });
      return;
    }
    case "bio": {
      spray({ at: mid.clone(), tex: "smoke", count: 44, shape: { sphere: 0.7 * k }, power: [0.3, 1.2], size: [0.9 * k, 1.8 * k], life: [1, 1.8], c1: "#4a2a5c", c2: "#2a3a14", dead: "#10081a", blend: "std", spin: [-1, 1] });
      spray({ at: base.clone(), tex: "dot", count: Math.round(60 * T), shape: { cyl: 0.9 * k, h: a.height }, dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)], power: [0.4, 1.2], size: [0.08, 0.2], life: [0.8, 1.6], c1: c[1], c2: c[2] });
      shell(mid, 0.8 * k, 1.4 * k, ["#2a1038", "#6a3a9a", c[1]], 0, 1.1, 0.6);
      pool(base, 2.2 * k, ["#1a0a20", "#5a8a2a", c[1]], 1.4, 0.7, 2);
      return;
    }
    case "drain": case "aspir": {
      sprite(mid, 2 * k, c, 1, 0.35, 1.4);
      sprite(mid, 2.4 * k, c, 2, 0.5, 1);
      spray({ at: mid.clone(), tex: "smoke", count: 20, shape: { sphere: 0.5 * k }, power: [0.3, 1], size: [0.6, 1.2], life: [0.6, 1.1], c1: fx.family === "drain" ? "#3a0610" : "#06123a", c2: "#100810", blend: "std", spin: [-1, 1] });
      siphon(w, tgt, src, c);
      return;
    }
    case "sleep": {
      sprite(mid, 2 * k, c, 6, 0.9, 1.2);
      sprite(mid, 3 * k, c, 2, 0.8, 1);
      pool(base, 2.4 * k, c, 1.4, 0.8, 1);
      spray({ at: base.clone(), tex: "star", count: 40, shape: { cyl: 1 * k, h: a.height }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [0.2, 0.7], size: [0.08, 0.18], life: [1.2, 2], c1: c[1], c2: c[2], spin: [-1, 1] });
      return;
    }
  }
}

/** Stone: rocks gather in the air round the target, glowing, then slam in;
 *  dust and chips; at IV the ground spikes up round it as well. */
function stoneImpact(w: FxWorld, tgt: string, a: FxActor, fx: ResolvedFx, vol: number): void {
  const k = scaleOf(a), c = fx.colours, tier = fx.tier;
  sfx.stoneGather(tier, vol);
  const n = countFor("stone", tier);
  const base = feet(a);
  const gather = 0.22, fall = 0.2;
  for (let i = 0; i < n; i++) {
    const r = rock();
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const rad = (1.3 + Math.random() * 0.6) * k;
    const hgt = (2.2 + Math.random() * 1.6) * k;
    const size = (0.55 + Math.random() * 0.35 + tier * 0.08) * k;
    const sc = new Vector3(size * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.4), size * (0.8 + Math.random() * 0.4));
    const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const delay = i * 0.04;
    const glowAt = new Vector3();
    const halo = look(card("plane", "sprite"), { colours: c, style: 0, gain: 0 });
    halo.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    r.setEnabled(false);
    run(gather + fall + 0.06, (t, now) => {
      const act = actorOf(w, tgt);
      const b = act ? feet(act) : base;
      const centre = new Vector3(b.x, b.y + (act?.height ?? 1.6) * 0.5, b.z);
      const T = t * (gather + fall + 0.06);
      r.setEnabled(true);
      const hangAt = new Vector3(b.x + Math.cos(ang) * rad, b.y + hgt, b.z + Math.sin(ang) * rad);
      if (T < gather) {
        const e = T / gather;
        r.position.copyFrom(hangAt);
        r.position.y -= (1 - e) * 0.8;
        r.scaling.copyFrom(sc).scaleInPlace(Math.min(1, e * 1.4));
      } else {
        const e = Math.min(1, (T - gather) / fall);
        Vector3.LerpToRef(hangAt, centre, e * e, r.position);
        r.scaling.copyFrom(sc);
      }
      r.rotate(spin, 0.18);
      glowAt.copyFrom(r.position);
      halo.mesh.position.copyFrom(glowAt);
      halo.mesh.scaling.setAll(size * 1.6);
      setGain(halo, 0.3);
      void now;
    }, () => {
      putBack("rocks", r);
      release(halo);
      sfx.rockThud(vol * 0.8);
      const act = actorOf(w, tgt);
      const ctr = act ? chest(act) : base;
      spray({ at: ctr.clone(), tex: "shard", count: 14, shape: { sphere: 0.3 * k }, power: [3, 7], gravity: 12, size: [0.08, 0.2], life: [0.4, 0.8], c1: "#a07a50", c2: "#6a4a30", blend: "std", spin: [-10, 10] });
    }, delay);
  }
  const hit = gather + fall + (n - 1) * 0.04;
  after(hit, () => {
    sfx.stoneCrash(tier, vol);
    if (tier >= 4) sfx.earthSpikes(vol);
    const act = actorOf(w, tgt);
    const b = act ? feet(act) : base, m = act ? chest(act) : base;
    sprite(m, 2.6 * k, c, 1, 0.35, 1.3);
    spray({ at: b.clone(), tex: "smoke", count: 26 + tier * 6, shape: { cyl: 1 * k, h: 0.2 }, dir: [new Vector3(-1, 0.4, -1), new Vector3(1, 1, 1)], power: [1.5, 3.5], size: [0.9 * k, 1.8 * k], life: [0.8, 1.5], c1: "#8a7254", c2: "#5a4a38", dead: "#3a3026", blend: "std", spin: [-1, 1] });
    spray({ at: m.clone(), tex: "dot", count: 30 + tier * 10, shape: { sphere: 0.4 * k }, power: [3, 7], gravity: 6, size: [0.06, 0.16], life: [0.4, 0.9], c1: c[1], c2: c[2], stretch: true });
    shock(b, (3 + tier * 0.6) * k, c, 0.6, 1.1);
    pool(b, 2.4 * k, c, 0.9, 0.8);
    if (tier >= 4) earthSpikes(b, k, c);
  });
}

/** Stone IV: a ring of rock spikes punching up out of the ground and sinking back */
function earthSpikes(b: Vector3, k: number, c: Palette): void {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const r = rock();
    const ang = (i / n) * Math.PI * 2;
    const rad = 1.4 * k;
    const p = new Vector3(b.x + Math.cos(ang) * rad, groundHeight(b.x + Math.cos(ang) * rad, b.z + Math.sin(ang) * rad, b.y), b.z + Math.sin(ang) * rad);
    const tall = (1.6 + Math.random() * 0.8) * k;
    // leaning out, away from what they burst round
    pointAlong(r, new Vector3(Math.cos(ang) * 0.35, 1, Math.sin(ang) * 0.35));
    run(1.1, (t) => {
      const up = t < 0.12 ? t / 0.12 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      r.scaling.set(0.7 * k, tall * up + 0.01, 0.7 * k);
      r.position.set(p.x, p.y + (tall * up) / 4 - 0.2, p.z);
    }, () => putBack("rocks", r));
  }
  shock(b, 5 * k, c, 0.7, 1.2, 0.05);
}

/** Blizzard: crystals sprout round the target leaning in, hold, and shatter.
 *  Freeze: a taller cage of them and an ice shell, held longer. */
function iceImpact(a: FxActor, fx: ResolvedFx, freeze: boolean, vol: number): void {
  const k = scaleOf(a), c = fx.colours, tier = fx.tier;
  sfx.iceGrow(freeze, vol);
  const n = countFor(freeze ? "freeze" : "blizzard", tier);
  const b = feet(a), m = chest(a);
  const grow = 0.18, hold = freeze ? 0.85 : 0.32;
  for (let i = 0; i < n; i++) {
    const cr = crystal();
    // a bloom of spikes bursting out of the ground round the target, leaning
    // OUT (all leaning in, they met over its head as a tent: the first look)
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const rad = (freeze ? 0.5 + Math.random() * 0.8 : 0.7 + Math.random() * 0.5) * k;
    const x = b.x + Math.cos(ang) * rad, z = b.z + Math.sin(ang) * rad;
    const y = groundHeight(x, z, b.y) - 0.15;
    const tall = (freeze ? 1.6 + Math.random() * 1.4 : 0.9 + Math.random() * 0.6 + tier * 0.15) * k;
    const thick = (freeze ? 1.4 + Math.random() * 0.6 : 0.9 + Math.random() * 0.4) * k;
    const lean = (freeze ? 0.25 : 0.35) + Math.random() * 0.35;
    pointAlong(cr, new Vector3(Math.cos(ang) * lean, 1, Math.sin(ang) * lean));
    cr.position.set(x, y, z);
    const delay = i * (freeze ? 0.025 : 0.035);
    run(grow + hold + 0.05 - delay, (t) => {
      const T = t * (grow + hold + 0.05 - delay);
      const e = Math.min(1, T / grow);
      const sgrow = 1 - Math.pow(1 - e, 3);
      cr.scaling.set(thick * (0.5 + 0.5 * sgrow), tall * sgrow + 0.01, thick * (0.5 + 0.5 * sgrow));
    }, () => {
      putBack("crystals", cr);
      spray({ at: new Vector3(x, y + tall * 0.5, z), tex: "shard", count: freeze ? 16 : 10, shape: { sphere: 0.3 * k }, power: [2, 5], gravity: 9, size: [0.08, 0.2], life: [0.5, 1], c1: c[2], c2: c[1], spin: [-10, 10] });
    }, delay);
  }
  pool(b, 2.6 * k, c, grow + hold + 0.9, 0.9, 1);
  if (freeze) {
    shell(m, 0.6 * k, 1.5 * k, c, 6, grow + hold + 0.25, 0.5, 1.35);
    flashLight(m, c[1], 2.5, grow + hold + 0.3);
  }
  after(grow + hold, () => {
    sfx.iceShatter(freeze, vol);
    sprite(m, (freeze ? 4.5 : 2.6) * k, c, 1, 0.4, 1.4, 1.2);
    shock(b, (freeze ? 6 : 3.4 + tier * 0.4) * k, c, 0.65, 1.2);
    spray({ at: m.clone(), tex: "star", count: freeze ? 140 : 60, shape: { sphere: 0.6 * k }, power: [3, 8], gravity: 4, size: [0.08, 0.2], life: [0.6, 1.3], c1: c[2], c2: c[1], spin: [-4, 4] });
    spray({ at: b.clone(), tex: "smoke", count: freeze ? 24 : 12, shape: { cyl: 1.2 * k, h: 0.2 }, dir: [new Vector3(-1, 0.3, -1), new Vector3(1, 0.8, 1)], power: [0.8, 2], size: [0.9, 1.8], life: [0.8, 1.6], c1: "#cfe8ff", c2: "#9ac4ee", blend: "add", spin: [-1, 1] });
  });
}

/** Drain and Aspir: motes carried back from the target to the caster */
function siphon(w: FxWorld, from: string, to: string, c: Palette): void {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const mote = look(card("plane", "sprite"), { colours: c, style: 0, gain: 0 });
    mote.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    const lift = 0.6 + Math.random() * 1.4, side = (Math.random() - 0.5) * 2;
    run(0.65, (t) => {
      const fa = actorOf(w, from), ta = actorOf(w, to);
      if (!fa || !ta) return;
      const a0 = chest(fa), b0 = chest(ta);
      const p = arcPoint([a0.x, a0.y, a0.z], [b0.x, b0.y, b0.z], t, lift);
      const d = b0.subtract(a0);
      const perp = new Vector3(-d.z, 0, d.x).normalize().scaleInPlace(Math.sin(t * Math.PI) * side);
      mote.mesh.position.set(p[0] + perp.x, p[1], p[2] + perp.z);
      mote.mesh.scaling.setAll(0.4 * (1 - t * 0.5));
      setGain(mote, envelope(t, 0.1, 0.6) * 1.2);
    }, () => release(mote), 0.05 + i * 0.05);
  }
  after(0.7, () => {
    const ta = actorOf(w, to);
    if (!ta) return;
    const m = chest(ta);
    sprite(m, 2.2, c, 2, 0.45, 1);
    spray({ at: feet(ta), tex: "star", count: 24, shape: { cyl: 0.6, h: ta.height }, dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)], power: [0.5, 1.5], size: [0.08, 0.18], life: [0.6, 1], c1: c[1], c2: c[2] });
  });
}

// ---------------------------------------------------------------- heals, buffs, raises

function healOn(w: FxWorld, src: string, tgt: string, fx: ResolvedFx): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const k = scaleOf(a), c = fx.colours, tier = fx.tier, H = a.height;
  const vol = loud(w, src, tgt);
  if (once(`heal|${src}|${fx.family}`)) {
    if (fx.family === "benediction") sfx.benediction(vol);
    else if (fx.family === "esuna") sfx.esuna(vol);
    else sfx.cureChime(tier, vol);
  }
  const b = feet(a);
  const T = 1 + (tier - 1) * 0.3;
  switch (fx.family) {
    case "benediction": {
      column(b, 1.2 * k, 18, c, 1, 1.3, 0.75);
      column(b, 1.1 * k, H * 1.6, c, 2, 1.3, 1);
      shock(b, 5 * k, c, 0.8, 1.2);
      shell(chest(a), 0.4, 2 * k, c, 5, 0.8, 0.6);
      spray({ at: new Vector3(b.x, b.y + 5, b.z), tex: "feather", count: 36, shape: { cyl: 1.6 * k, h: 0.5 }, dir: [new Vector3(-0.3, -1, -0.3), new Vector3(0.3, -0.6, 0.3)], power: [0.6, 1.4], size: [0.14, 0.28], life: [1.4, 2.4], c1: c[1], c2: c[2], spin: [-2, 2] });
      spray({ at: b.clone(), tex: "star", count: 90, shape: { cyl: 1 * k, h: 0.2 }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [2, 5], size: [0.1, 0.26], life: [0.8, 1.4], c1: c[1], c2: c[2], spin: [-3, 3] });
      flashLight(chest(a), c[1], 4, 0.9);
      return;
    }
    case "esuna": {
      spray({ at: b.clone(), tex: "star", count: 50, shape: { cyl: 0.7 * k, h: 0.2 }, dir: [new Vector3(-0.6, 1, -0.6), new Vector3(0.6, 1.4, 0.6)], power: [1, 2.5], size: [0.1, 0.22], life: [0.8, 1.4], c1: c[1], c2: c[2], spin: [-4, 4] });
      sprite(chest(a), 2.4 * k, c, 2, 0.6, 1);
      column(b, 0.8 * k, H * 1.3, c, 2, 0.9, 0.9);
      return;
    }
    default: {
      // the cures: a ring of light climbing the body, a spiral, sparkles
      const ringC = look(card("disc", "ring"), { colours: c, gain: 1.2 });
      run(0.9, (t, now) => {
        const act = actorOf(w, tgt);
        const p = act ? feet(act) : b;
        flat(ringC, p.x, p.y + 0.1 + H * 1.1 * t, p.z, 1.1 * k * T);
        setT(ringC, 0.55 + 0.1 * t);
        setGain(ringC, 1.3 * envelope(t, 0.1, 0.5));
        void now;
      }, () => release(ringC));
      column(b, 0.85 * k * T, H * 1.4, c, 2, 1.0, 1);
      pool(b, 1.8 * k * T, c, 1.1, 0.9, 1);
      spray({ at: b.clone(), tex: "star", count: Math.round(30 * T), shape: { cyl: 0.7 * k, h: H * 0.6 }, dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)], power: [0.8, 2], size: [0.1, 0.22], life: [0.7, 1.3], c1: c[1], c2: c[2], spin: [-3, 3] });
      if (tier >= 3) { shock(b, 3.2 * k, c, 0.6); sprite(chest(a), 2.2 * k, c, 1, 0.4, 1.3); }
      if (tier >= 4) column(b, 1.2 * k, 12, c, 1, 0.8, 0.8);
    }
  }
}

function raiseOn(w: FxWorld, tgt: string): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const fx = fxByKey("raise");
  const c = fx?.colours ?? FX_FAMILIES.raise.colours;
  const b = feet(a);
  sfx.raise(loud(w, tgt));
  column(b, 1.3, 22, c, 1, 1.8, 0.75);
  const glyph = look(card("disc", "rune"), { colours: c, style: JOB_RUNES.WHM.style, gain: 0 });
  hug(glyph, b.x, b.y, b.z, 2.4);
  run(2.2, (t) => { setGain(glyph, envelope(t, 0.1, 0.4)); glyph.mat.setFloat("uCharge", 1); }, () => release(glyph));
  spray({ at: new Vector3(b.x, b.y + 7, b.z), tex: "feather", count: 50, shape: { cyl: 2, h: 0.5 }, dir: [new Vector3(-0.3, -1, -0.3), new Vector3(0.3, -0.6, 0.3)], power: [0.6, 1.3], size: [0.15, 0.3], life: [2, 3], c1: c[1], c2: c[2], spin: [-2, 2] });
  shock(b, 5, c, 1, 1.1, 0.3);
  flashLight(chest(a), c[1], 4, 1.4);
}

/** the moment a buff lands, then its lasting aura */
function buffOn(w: FxWorld, tgt: string, name: string, fx: ResolvedFx, src = tgt): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  if (once(`buff|${src}|${name}`)) sfx.buffOn(fx.family, loud(w, src, tgt));
  const k = scaleOf(a), c = fx.colours, H = a.height;
  const b = feet(a), m = chest(a);
  switch (fx.family) {
    case "protect": case "guard": {
      // the ward closes onto the body from outside
      const sh = look(card("sphere", "shell"), { colours: c, style: 1, gain: 0 });
      run(0.8, (t) => {
        const act = actorOf(w, tgt);
        const p = act ? chest(act) : m;
        const r = (2.4 - 1.3 * (1 - Math.pow(1 - t, 3))) * k;
        sh.mesh.position.copyFrom(p);
        sh.mesh.scaling.set(r * 0.8, r, r * 0.8);
        setGain(sh, 1.1 * envelope(t, 0.15, 0.4));
      }, () => release(sh));
      shock(b, 3 * k, c, 0.6);
      spray({ at: m.clone(), tex: "star", count: 30, shape: { sphere: 1.2 * k, inward: true }, power: [2, 3], size: [0.08, 0.18], life: [0.35, 0.45], c1: c[1], c2: c[2] });
      break;
    }
    case "regen": case "lamp": {
      column(b, 0.9 * k, H * 1.4, c, 2, 1, 1);
      spray({ at: b.clone(), tex: "dot", count: 36, shape: { cyl: 0.8 * k, h: 0.2 }, dir: [new Vector3(-0.3, 1, -0.3), new Vector3(0.3, 1, 0.3)], power: [1, 2.2], size: [0.08, 0.18], life: [0.8, 1.4], c1: c[1], c2: c[2] });
      pool(b, 1.8 * k, c, 1, 0.8, 1);
      break;
    }
    case "blood": case "dread": case "ki": case "stance": {
      shell(new Vector3(b.x, b.y + H * 0.5, b.z), 0.6 * k, 1.1 * k, c, 2, 0.9, 1.4, 1.5);
      column(b, 1.1 * k, H * 1.8, c, 0, 0.8, 1);
      shock(b, 3.4 * k, c, 0.55, 1.2);
      spray({ at: b.clone(), tex: fx.family === "ki" ? "star" : "dot", count: 60, shape: { cyl: 0.7 * k, h: 0.2 }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [2, 5], size: [0.08, 0.22], life: [0.5, 1], c1: c[1], c2: c[2] });
      if (fx.family === "blood" || fx.family === "dread") spray({ at: b.clone(), tex: "smoke", count: 16, shape: { cyl: 0.7 * k, h: 0.2 }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [0.8, 1.6], size: [0.8, 1.4], life: [0.8, 1.3], c1: "#1a0610", c2: "#0a0408", blend: "std", spin: [-1, 1] });
      break;
    }
    case "evade": {
      shell(m, 0.6 * k, 1.4 * k, c, 3, 0.6, 1.1, 1.4);
      spray({ at: b.clone(), tex: "shard", count: 30, shape: { cyl: 0.9 * k, h: H }, dir: [new Vector3(-1, 0, -1), new Vector3(1, 0.2, 1)], power: [2, 4], size: [0.06, 0.14], life: [0.3, 0.6], c1: c[1], c2: c[2], stretch: true });
      break;
    }
    case "circle": {
      shock(b, 3 * k, c, 0.6);
      break;
    }
  }
  if (fx.lasting) startLasting(w, tgt, name, fx);
}

/** an aura for as long as the status lasts: subtle enough to live with for
 *  five minutes on six people, plain enough to read across a fight */
function startLasting(w: FxWorld, id: string, name: string, fx: ResolvedFx): void {
  const s = S();
  for (let i = s.lasting.length - 1; i >= 0; i--) {
    const l = s.lasting[i];
    if (l.id === id && (l.name === name || l.family === fx.family)) { l.end(); s.lasting.splice(i, 1); }
  }
  const a = actorOf(w, id);
  if (!a) return;
  const c = fx.colours;
  const now0 = NOW();
  const dur = fx.duration ?? (fx.family === "sleep" ? 20 : fx.family === "stun" ? 3 : 30);
  const parts: Card[] = [];
  const systems: ParticleSystem[] = [];
  const at = feet(a);
  const k = scaleOf(a), H = a.height;
  let tickFn: (now: number, a: FxActor) => void = () => {};
  switch (fx.family) {
    case "protect": case "guard": {
      // a faint ward that pulses now and then, and for a guard a crest at the feet
      const sh = look(card("sphere", "shell"), { colours: c, style: 1, gain: 0 });
      parts.push(sh);
      const crest = fx.family === "guard" ? look(card("disc", "rune"), { colours: c, style: fx.rune, gain: 0 }) : null;
      if (crest) parts.push(crest);
      tickFn = (now, act) => {
        const p = feet(act);
        sh.mesh.position.set(p.x, p.y + act.height * 0.55, p.z);
        sh.mesh.scaling.set(0.9 * k, 1.15 * k, 0.9 * k);
        // nothing between shimmers: a ward lasts five minutes on everyone in the party
        const ph = ((now - now0 + 2.5) % 5) / 5;
        setGain(sh, 0.3 * Math.max(0, Math.sin(Math.min(1, ph * 6) * Math.PI)));
        if (crest) { hug(crest, p.x, p.y, p.z, 1.1 * k, true); setGain(crest, 0.32); crest.mat.setFloat("uCharge", 0.2); }
      };
      break;
    }
    case "circle": {
      const disc = look(card("disc", "rune"), { colours: c, style: fx.rune, gain: 0 });
      parts.push(disc);
      tickFn = (_now, act) => { const p = feet(act); hug(disc, p.x, p.y, p.z, 1.7 * k, true); setGain(disc, 0.55); disc.mat.setFloat("uCharge", 0.4); };
      break;
    }
    case "regen": case "lamp": {
      systems.push(spray({ at, tex: "dot", rate: 7, shape: { cyl: 0.5 * k, h: H * 0.8 }, dir: [new Vector3(-0.05, 1, -0.05), new Vector3(0.05, 1, 0.05)], power: [0.3, 0.7], size: [0.06, 0.12], life: [1, 1.6], c1: c[1], c2: c[2] }));
      tickFn = (_now, act) => at.copyFrom(feet(act));
      break;
    }
    case "blood": case "dread": case "ki": case "stance": {
      // tongues of the stance's colour licking up off the body, and embers;
      // a shell round it read as an egg (the first look)
      systems.push(spray({ at, tex: "smoke", rate: 26, shape: { cyl: 0.32 * k, h: H * 0.5 }, dir: [new Vector3(-0.05, 1, -0.05), new Vector3(0.05, 1, 0.05)], power: [0.9, 1.7], size: [0.45 * k, 0.8 * k], life: [0.45, 0.75], c1: c[1], c2: c[0], spin: [-1.5, 1.5] }));
      systems.push(spray({ at, tex: "dot", rate: 12, shape: { cyl: 0.45 * k, h: 0.3 }, dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)], power: [1, 2], size: [0.05, 0.12], life: [0.5, 0.9], c1: c[1], c2: c[2] }));
      tickFn = (_now, act) => at.copyFrom(feet(act));
      break;
    }
    case "evade": {
      const wisps = [0, 1, 2].map(() => {
        const s2 = look(card("plane", "sprite"), { colours: c, style: 0, gain: 0 });
        s2.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
        parts.push(s2);
        return s2;
      });
      tickFn = (now, act) => {
        const p = feet(act);
        wisps.forEach((s2, i) => {
          const ang = now * 2.6 + (i * Math.PI * 2) / 3;
          s2.mesh.position.set(p.x + Math.cos(ang) * 0.7 * k, p.y + act.height * (0.45 + 0.1 * Math.sin(now * 3 + i)), p.z + Math.sin(ang) * 0.7 * k);
          s2.mesh.scaling.setAll(0.3);
          setGain(s2, 0.9);
        });
      };
      break;
    }
    case "stun": {
      const stars = [0, 1, 2].map(() => {
        const s2 = look(card("plane", "sprite"), { colours: c, style: 5, gain: 0 });
        s2.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
        parts.push(s2);
        return s2;
      });
      tickFn = (now, act) => {
        const p = feet(act);
        stars.forEach((s2, i) => {
          const ang = now * 4 + (i * Math.PI * 2) / 3;
          s2.mesh.position.set(p.x + Math.cos(ang) * 0.45 * k, p.y + act.height * 1.05, p.z + Math.sin(ang) * 0.45 * k);
          s2.mesh.scaling.setAll(0.32 * k);
          setGain(s2, 1);
        });
      };
      break;
    }
    case "sleep": {
      const moon = look(card("plane", "sprite"), { colours: c, style: 6, gain: 0 });
      moon.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
      parts.push(moon);
      systems.push(spray({ at, tex: "star", rate: 5, shape: { cyl: 0.4 * k, h: 0.2 }, dir: [new Vector3(-0.1, 1, -0.1), new Vector3(0.2, 1, 0.1)], power: [0.3, 0.6], size: [0.1, 0.2], life: [1.4, 2.2], c1: c[1], c2: c[2] }));
      tickFn = (now, act) => {
        const p = feet(act);
        at.set(p.x, p.y + act.height, p.z);
        moon.mesh.position.set(p.x + 0.3 * k, p.y + act.height * 1.15 + Math.sin(now * 1.5) * 0.1, p.z);
        moon.mesh.scaling.setAll(0.45 * k);
        setGain(moon, 0.85);
      };
      break;
    }
    default: return;
  }
  s.lasting.push({
    id, family: fx.family, name, started: now0, until: now0 + dur,
    tick: tickFn,
    end: () => { for (const p of parts) release(p); for (const ps of systems) stopSpray(ps); },
  });
}

/** world.ts: a player died or left; their auras go with them */
export function fxClear(id: string): void {
  const s = states.get(scene);
  if (!s) return;
  for (let i = s.lasting.length - 1; i >= 0; i--) if (s.lasting[i].id === id) { s.lasting[i].end(); s.lasting.splice(i, 1); }
  s.casts.get(id)?.end(false);
}

// ---------------------------------------------------------------- job abilities

function jaOn(w: FxWorld, src: string, tgt: string, name: string, fx: ResolvedFx): void {
  const sa = actorOf(w, src), ta = actorOf(w, tgt);
  const c = fx.colours;
  sfx.jaOn(fx.family, name, loud(w, src));
  switch (fx.family) {
    case "enmity": case "flash": {
      if (sa) {
        const b = feet(sa), k = scaleOf(sa);
        const big = name === "Palisade";
        shock(b, (big ? 9 : 5) * k, c, big ? 0.8 : 0.55, 1.3);
        if (big) shock(b, 6 * k, c, 0.6, 1, 0.12);
        sprite(chest(sa), (fx.family === "flash" ? 4 : 2) * k, c, 1, fx.family === "flash" ? 0.3 : 0.4, 1.5, 1.4);
      }
      if (ta && tgt !== src) {
        const k = scaleOf(ta);
        const over = feet(ta); over.y += ta.height + 0.7 * k;
        const mark = look(card("plane", "sprite"), { colours: c, style: fx.family === "flash" ? 1 : 4, gain: 0 });
        mark.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
        run(1.3, (t) => {
          const act = actorOf(w, tgt);
          if (act) { const p = feet(act); mark.mesh.position.set(p.x, p.y + act.height + 0.7 * k + t * 0.3, p.z); }
          mark.mesh.scaling.setAll(0.9 * k * (1 + 0.3 * Math.max(0, 1 - t * 5)));
          setGain(mark, envelope(t, 0.08, 0.5) * 1.2);
        }, () => release(mark));
        sprite(chest(ta), 2.2 * k, c, 1, 0.35, 1.3);
        spray({ at: chest(ta), tex: "dot", count: 30, shape: { sphere: 0.4 * k }, power: [2, 5], size: [0.06, 0.14], life: [0.3, 0.6], c1: c[1], c2: c[2], stretch: true });
      }
      return;
    }
    case "stun": {
      if (ta) {
        const k = scaleOf(ta), m = chest(ta);
        sprite(m, 2.6 * k, c, 1, 0.3, 1.4, 1.3);
        sprite(m, 2 * k, c, 2, 0.35, 1);
        spray({ at: m.clone(), tex: "star", count: 30, shape: { sphere: 0.3 * k }, power: [3, 7], gravity: 4, size: [0.08, 0.2], life: [0.3, 0.6], c1: c[2], c2: c[1], spin: [-6, 6] });
        startLasting(w, tgt, name, fx);
      }
      return;
    }
    case "focus": {
      if (sa) {
        const b = feet(sa), m = chest(sa), k = scaleOf(sa);
        spray({ at: m.clone(), tex: "star", count: 50, shape: { sphere: 2.2 * k, inward: true }, power: [4.5, 6], size: [0.08, 0.2], life: [0.36, 0.42], c1: c[1], c2: c[2] });
        after(0.38, () => {
          const act = actorOf(w, src);
          const bb = act ? feet(act) : b;
          column(bb, 0.9 * k, sa.height * 2, c, 0, 0.7, 1.2);
          shock(bb, 3 * k, c, 0.5, 1.2);
          sprite(act ? chest(act) : m, 2 * k, c, 1, 0.35, 1.4);
        });
      }
      return;
    }
  }
}

// ---------------------------------------------------------------- weapon skills

function wsOn(w: FxWorld, src: string, tgt: string, fx: ResolvedFx): void {
  const ta = actorOf(w, tgt), sa = actorOf(w, src);
  if (!ta) return;
  const k = scaleOf(ta), c = fx.colours, tier = fx.tier;
  const m = chest(ta), b = feet(ta);
  const n = countFor(fx.family, tier);
  const yawTo = sa ? Math.atan2(sa.node.position.x - b.x, sa.node.position.z - b.z) : 0;
  const hitSpark = (p: Vector3, count = 30) => spray({ at: p.clone(), tex: "dot", count, shape: { sphere: 0.25 * k }, power: [3, 8], gravity: 6, size: [0.05, 0.13], life: [0.25, 0.55], c1: c[2], c2: c[1], stretch: true });
  // each cut's sound starts on its swing and lands with its sparks (spell-sfx wsHit)
  const vol = loud(w, src, tgt), element = fx.colours === ELEMENT_COLOURS.shadow ? "shadow" : fx.colours === ELEMENT_COLOURS.radiance ? "radiance" : "steel";
  const hits: number[] =
    fx.family === "blade" ? Array.from({ length: Math.max(2, n) }, (_, i) => i * 0.12 + 0.06)
    : fx.family === "iai" ? Array.from({ length: n }, (_, i) => 0.1 + i * 0.12)
    : fx.family === "reap" ? Array.from({ length: n }, (_, i) => i * 0.14 + 0.04)
    : fx.family === "fists" ? Array.from({ length: n }, (_, i) => i * 0.08)
    : [0.02];
  for (const t of hits) after(t, () => sfx.wsHit(fx.family, element, tier, vol));
  switch (fx.family) {
    case "blade": {
      const rolls = [0.75, -0.75, 0.05];
      for (let i = 0; i < Math.max(2, n); i++) {
        slash(m, (2 + tier * 0.3) * k, rolls[i % 3] + (Math.random() - 0.5) * 0.2, c, 0.3, i * 0.12, 1.4);
        after(i * 0.12 + 0.12, () => { hitSpark(m, 40); sprite(m, 2.2 * k, c, 1, 0.25, 1.4, 1.1); });
      }
      break;
    }
    case "iai": {
      // the draw: a beat of nothing, then one thin crescent and the line it leaves
      for (let i = 0; i < n; i++) {
        slash(m, (2.5 + tier * 0.3) * k, Math.PI / 2 + (i - (n - 1) / 2) * 0.35, c, 0.2, 0.1 + i * 0.12, 1.6);
        after(0.16 + i * 0.12, () => { hitSpark(m, 40); sprite(m, 2.4 * k, c, 1, 0.25, 1.5, 1.3); });
      }
      spray({ at: m.clone(), tex: "shard", count: 24, shape: { sphere: 0.4 * k }, power: [1, 3], gravity: -0.5, size: [0.06, 0.14], life: [0.6, 1.1], c1: c[1], c2: c[2], spin: [-4, 4] });
      break;
    }
    case "reap": {
      for (let i = 0; i < n; i++) {
        sweep(new Vector3(b.x, b.y + ta.height * (0.4 + 0.15 * i), b.z), (1.4 + 0.2 * i) * k, (0.9 + tier * 0.15) * k, yawTo + (i % 2 ? 1 : -1) * 0.3, (i % 2 ? 1 : -1) * 0.25, c, 0.32, i * 0.14);
        after(i * 0.14 + 0.14, () => hitSpark(m, 36));
      }
      spray({ at: m.clone(), tex: "smoke", count: 20, shape: { sphere: 0.6 * k }, power: [0.5, 1.6], size: [0.8, 1.5], life: [0.7, 1.2], c1: "#1a0a26", c2: "#0a040e", blend: "std", spin: [-1, 1] });
      break;
    }
    case "fists": {
      for (let i = 0; i < n; i++) {
        after(i * 0.08, () => {
          const act = actorOf(w, tgt);
          const mm = act ? chest(act) : m;
          const p = mm.add(new Vector3((Math.random() - 0.5) * 0.6 * k, (Math.random() - 0.5) * 0.6 * k, (Math.random() - 0.5) * 0.6 * k));
          sprite(p, 2.3 * k, c, 2, 0.3, 1, 1.2);
          sprite(p, 1.8 * k, c, 1, 0.2, 1.3, 1.1);
          hitSpark(p, 26);
        });
      }
      break;
    }
    case "smite": {
      slash(m, (2.2 + tier * 0.25) * k, Math.PI / 2 + 0.15, c, 0.28, 0, 1.4);
      after(0.14, () => { hitSpark(m, 40); sprite(m, 2.4 * k, c, 1, 0.3, 1.4, 1.3); shock(b, 3 * k, c, 0.5); pool(b, 2 * k, c, 0.7, 0.9, 1); });
      break;
    }
  }
  const last = (n - 1) * 0.12 + 0.18;
  if (tier >= 3) {
    after(last, () => {
      sfx.wsFinisher(element, vol);
      shock(b, 5 * k, c, 0.7, 1.3);
      column(b, 1.2 * k, 7 * k, c, 1, 0.55, 0.6);
      sprite(m, 3.4 * k, c, 1, 0.4, 1.5, 1.1);
    });
  }
  // the user's own moment: the form's colour flaring at their feet
  if (sa) shock(feet(sa), 2.2 * scaleOf(sa), c, 0.4, 0.9);
}

// ---------------------------------------------------------------- the big moments

export function fxSkillchain(w: FxWorld, tgt: string, element: string): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const c = ELEMENT_COLOURS[element] ?? ELEMENT_COLOURS.radiance;
  const k = scaleOf(a), b = feet(a), m = chest(a);
  column(b, 1.8 * k, 14, c, 1, 1, 1.2);
  shock(b, 8 * k, c, 0.9, 1.3);
  shock(b, 5.5 * k, c, 0.7, 1.1, 0.12);
  shell(m, 0.5 * k, 2.6 * k, c, 0, 0.8, 0.8);
  sprite(m, 4 * k, c, 1, 0.5, 1.5, 1.1);
  pool(b, 4 * k, c, 1.4, 1, 1);
  spray({ at: m.clone(), tex: "star", count: 150, shape: { sphere: 0.6 * k }, power: [5, 11], gravity: 3, size: [0.1, 0.26], life: [0.6, 1.3], c1: c[1], c2: c[2], spin: [-4, 4] });
  flashLight(m, c[1], 5, 0.9);
}

export function fxMagicBurst(w: FxWorld, tgt: string, element: string): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const c = ELEMENT_COLOURS[element] ?? ELEMENT_COLOURS.radiance;
  const k = scaleOf(a), b = feet(a);
  column(b, 1.3 * k, 16, c, 1, 0.8, 1.3);
  shock(b, 6 * k, c, 0.7, 1.3);
  sprite(chest(a), 4 * k, c, 1, 0.4, 1.6, 1.3);
}

export function fxLevelUp(w: FxWorld, tgt: string): void {
  const a = actorOf(w, tgt);
  if (!a) return;
  const c: Palette = ["#a0661e", "#ffd26a", "#fff6dc"];
  const b = feet(a);
  column(b, 1.1, 8, c, 0, 1.8, 1.2);
  column(b, 0.9, a.height * 1.6, c, 2, 1.6, 1);
  const r = look(card("disc", "ring"), { colours: c, gain: 1.2 });
  run(1.4, (t) => {
    const act = actorOf(w, tgt);
    const p = act ? feet(act) : b;
    flat(r, p.x, p.y + 0.1 + t * 3.4, p.z, 1.4 * (1 + t));
    setT(r, 0.6);
    setGain(r, 1.2 * (1 - t));
  }, () => release(r));
  shock(b, 4, c, 0.8);
  spray({ at: b.clone(), tex: "star", count: 80, shape: { cyl: 0.8, h: 0.2 }, dir: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], power: [2, 5], size: [0.1, 0.24], life: [0.9, 1.6], c1: c[1], c2: c[2], spin: [-3, 3] });
}

// ---------------------------------------------------------------- the event entry

let world: FxWorld | null = null;

/** Every combat event goes through here (world.ts handleCombatEvent, and the
 *  /?vfx view's stand-in events): the same server events every client in the
 *  zone receives, so everyone sees everyone's effects. */
export function fxEvent(w: FxWorld, ev: any): void {
  world = w;
  const s = S();
  switch (ev.k) {
    case "cast_start": {
      castBegin(w, ev.src, fxByName(ev.name), ev.ms || 1500);
      return;
    }
    case "mcast": {
      castBegin(w, ev.src, null, ev.ms || 1600, true);
      return;
    }
    case "spell": {
      const fx = fxByName(ev.name);
      if (!fx) return;
      const land = () => impact(w, ev.src, ev.tgt, fx);
      if (fx.projectile) projectile(w, ev.src, ev.tgt, fx, () => {
        land();
        if (ev.burst) fxMagicBurst(w, ev.tgt, ev.element || "radiance");
      });
      else {
        s.casts.get(ev.src)?.endHands();
        land();
        if (ev.burst) fxMagicBurst(w, ev.tgt, ev.element || "radiance");
      }
      if (ev.sleep && fx.family === "sleep") after(fx.projectile ? 0.3 : 0, () => startLasting(w, ev.tgt, ev.name, fx));
      return;
    }
    case "ws": {
      const fx = fxByName(ev.name);
      if (fx) wsOn(w, ev.src, ev.tgt, fx);
      return;
    }
    case "heal": {
      const fx = fxByName(ev.name);
      s.casts.get(ev.src)?.endHands();
      // Drain's heal back is the siphon arriving (impact draws it); an item is a small cure
      if (fx && (fx.family === "drain" || fx.family === "aspir")) return;
      const use = fx && (fx.family === "cure" || fx.family === "benediction" || fx.family === "esuna") ? fx : fxByKey("cure")!;
      if (!fx && !(ev.amount > 0)) return;
      healOn(w, ev.src, ev.tgt, use);
      return;
    }
    case "buff": {
      const fx = fxByName(ev.name);
      s.casts.get(ev.src)?.endHands();
      if (!fx) return;
      // a stance or a ward taken as a job ability flashes the job's circle as well
      if (fx.kind === "ja") jaCircle(w, ev.src, fx);
      buffOn(w, ev.tgt, ev.name, fx, ev.src);
      return;
    }
    case "ja": {
      const fx = fxByName(ev.name);
      if (!fx) return;
      jaCircle(w, ev.src, fx);
      // Third Eye and Counterstance arrive as a "ja" (combat.rb evade_charges), not a "buff"
      if (fx.family === "evade") buffOn(w, ev.src, ev.name, fx);
      else jaOn(w, ev.src, ev.tgt, ev.name, fx);
      return;
    }
    case "sc": {
      fxSkillchain(w, ev.tgt, ev.element);
      return;
    }
    case "revive": {
      raiseOn(w, ev.tgt);
      return;
    }
    case "levelup": {
      fxLevelUp(w, ev.tgt);
      return;
    }
    case "die": case "mdie": {
      fxClear(ev.tgt);
      return;
    }
  }
}

/** world.ts calls this as a zone's scene comes up: compile every effect
 *  shader once, off the first fight's critical frame (Safari compiles on the
 *  main thread; a first Flare should not hitch). */
export function fxPrewarm(): void {
  const s = S();
  const shapes: [Shape, string][] = [["disc", "rune"], ["disc", "ring"], ["disc", "pool"], ["cyl", "column"], ["cyl", "flame"],
    ["sphere", "shell"], ["plane", "sprite"], ["arc", "slash"], ["sweep", "slash"], ["bolt", "bolt"]];
  for (const [shape, frag] of shapes) {
    const c = look(card(shape, frag), { colours: ELEMENT_COLOURS.steel, gain: 0 });
    c.mat.forceCompilation(c.mesh, () => release(c));
  }
  void s;
}

/** a frame's worth of counts, for the /?vfx view's readout and a perf check */
export function fxStats(): { cards: number; free: number; systems: number; runs: number; lasting: number } {
  const s = states.get(scene);
  if (!s) return { cards: 0, free: 0, systems: 0, runs: 0, lasting: 0 };
  let free = 0;
  for (const l of s.cards.values()) free += l.length;
  return { cards: cardSerial, free, systems: psSerial, runs: s.runs.length, lasting: s.lasting.length };
}
