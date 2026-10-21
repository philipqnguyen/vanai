// The Furnace Hall's heat, as one draw: embers rising off every fire.
//
// SCOUT.md's complaint about the old hall was "no heat: no glow from the kiln
// on the room, no embers, no smoke". The kit's flames and light pools give the
// glow; this gives the embers. A ParticleSystem per furnace would be a draw and
// a CPU update each, every frame (RULINGS.md: particles only through scene.ts's
// fxParticles, which a zone module cannot reach), so the embers are instead
// one small mesh of camera-facing sparks, thin-instanced once per plume and
// moved entirely on the GPU, the way the kit's FlamePool moves its flames: a
// plume is a translation (its seat), the x column's length (how wide it
// spreads) and the y column's length (how high the sparks climb). The pool
// follows the kit's room culler like every other pool (GroupedInstances), so a
// furnace in a room you cannot see costs nothing.
import { Color3, Constants, Effect, Mesh, ShaderMaterial, VertexData, type Scene } from '@babylonjs/core';
import { GroupedInstances, placeMatrix, type VisState } from '../dungeon-kit/index.ts';

const SPARKS = 22;

Effect.ShadersStore.fhEmberVertexShader = `
precision highp float;
attribute vec3 position;
#ifdef INSTANCES
attribute vec4 world0; attribute vec4 world1; attribute vec4 world2; attribute vec4 world3;
#endif
uniform mat4 viewProjection;
uniform vec3 eye;
uniform float time;
varying vec2 vUV;
varying float vLife;
varying float vDist;
varying float vHeat;
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main(void) {
#ifdef INSTANCES
  vec3 c = world3.xyz; float r = length(world0.xyz); float h = length(world1.xyz);
#else
  vec3 c = vec3(0.0); float r = 1.0; float h = 4.0;
#endif
  float k = position.z;
  float seed = h1(k * 7.31 + dot(c, vec3(0.173, 0.311, 0.257)));
  float s2 = h1(seed * 91.7 + 3.1), s3 = h1(seed * 53.3 + 7.7), s4 = h1(seed * 17.9 + 1.3);
  // each spark climbs on its own clock, 2.5 to 5.5 s a lift
  float life = fract(time / (2.5 + 3.0 * s2) + seed);
  float a = s3 * 6.2832 + time * (0.35 + 0.5 * s4) * (s4 > 0.5 ? 1.0 : -1.0);
  float rad = r * (0.15 + 0.85 * s4) * (0.35 + 0.65 * life);
  vec3 p = c + vec3(cos(a) * rad, life * h * (0.55 + 0.45 * s2), sin(a) * rad);
  p.x += sin(time * 1.7 + seed * 40.0) * 0.25 * life;
  p.z += cos(time * 1.3 + seed * 23.0) * 0.25 * life;
  vec3 fwd = normalize(eye - p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  float size = (0.05 + 0.07 * s3) * (1.0 - 0.45 * life);
  p += right * position.x * size + up * position.y * size;
  vUV = position.xy;
  vLife = life;
  vHeat = s2;
  vDist = length(eye - p);
  gl_Position = viewProjection * vec4(p, 1.0);
}`;

Effect.ShadersStore.fhEmberFragmentShader = `
precision highp float;
varying vec2 vUV;
varying float vLife;
varying float vDist;
varying float vHeat;
uniform float time;
uniform vec3 hotColor;
uniform vec3 coolColor;
uniform float fogDensity;
void main(void) {
  float d = length(vUV) * 2.0;
  float spot = pow(max(0.0, 1.0 - d), 1.6);
  float fade = smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  float flick = 0.75 + 0.25 * sin(time * 17.0 + vHeat * 50.0);
  float fog = exp(-pow(fogDensity * vDist, 2.0));
  vec3 col = mix(hotColor, coolColor, clamp(vLife * 1.3 + vHeat * 0.2, 0.0, 1.0)) * 1.6;
  float a = spot * fade * flick * fog;
  gl_FragColor = vec4(col * a, a);
}`;

export class EmberPool {
  readonly pool: GroupedInstances;
  private t0 = performance.now();
  constructor(readonly scene: Scene, hot: string, cool: string, name = 'fh_embers') {
    const mesh = new Mesh(name, scene), vd = new VertexData(), pos: number[] = [], idx: number[] = [];
    for (let k = 0; k < SPARKS; k++) {
      const b = k * 4;
      pos.push(-0.5, -0.5, k, 0.5, -0.5, k, 0.5, 0.5, k, -0.5, 0.5, k);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    vd.positions = pos; vd.indices = idx;
    vd.applyToMesh(mesh);
    const m = new ShaderMaterial(`${name}_m`, scene, { vertex: 'fhEmber', fragment: 'fhEmber' }, {
      attributes: ['position'], uniforms: ['viewProjection', 'eye', 'time', 'hotColor', 'coolColor', 'fogDensity'], needAlphaBlending: true,
    });
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    m.alphaMode = Constants.ALPHA_ONEONE;
    m.setColor3('hotColor', Color3.FromHexString(hot));
    m.setColor3('coolColor', Color3.FromHexString(cool));
    m.onBindObservable.add(() => {
      const eff = m.getEffect(), cam = scene.activeCamera;
      if (!eff || !cam) return;
      eff.setVector3('eye', cam.globalPosition);
      eff.setFloat('time', (performance.now() - this.t0) / 1000);
      eff.setFloat('fogDensity', scene.fogEnabled && scene.fogMode !== 0 ? scene.fogDensity : 0);
    });
    mesh.material = m;
    mesh.isPickable = false;
    mesh.isVisible = false;
    // the sparks leave the instance's box on the GPU: one draw whenever any
    // plume's room is drawn (the culler has already dropped the rest)
    mesh.alwaysSelectAsActiveMesh = true;
    this.pool = new GroupedInstances(mesh);
  }
  /** a plume at (x, y, z): sparks spread over radius r and climb about h */
  add(group: string, x: number, y: number, z: number, r = 1, h = 4): void {
    this.pool.add(group, placeMatrix(x, y, z, 0, r, h, r), true);
  }
  upload(): void { this.pool.upload(); }
  update(v: VisState | null): void { this.pool.update(v); }
}
