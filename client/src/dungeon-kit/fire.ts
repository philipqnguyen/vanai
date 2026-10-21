// Dungeon kit v2: fire without lights.
//
// - FlamePool: every flame in the dungeon is one thin instance of a two-card
//   mesh (a flame card and a soft halo), drawn by one small shader in ONE
//   additive draw, turned to the camera on the GPU, flickering on the GPU,
//   faded by the scene's fog, culled with its room. It replaces makeFlame's
//   one particle system per torch (the Keep's 96 and the Beacon Fort's 82
//   were ~100 draws and a CPU update each, every frame: SCOUT.md). It is out
//   of the glow pass: the halo IS the bloom.
// - LampSlots: the existing pattern (dungeon-craft.ts) of at most four real
//   PointLights that follow the lamps nearest the camera, here limited to the
//   rooms the culler draws and given a slow flicker. RULINGS.md: never more.
//
// Instance encoding: translation = the flame's seat, the x column's length =
// card width, the y column's length = flame height; the shader reads only
// those, so no extra buffer is needed.
import { Color3, Constants, Effect, Mesh, PointLight, ShaderMaterial, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { GroupedInstances, placeMatrix, type VisState } from './instances.ts';

Effect.ShadersStore.kitFlameVertexShader = `
precision highp float;
attribute vec3 position;
#ifdef INSTANCES
attribute vec4 world0; attribute vec4 world1; attribute vec4 world2; attribute vec4 world3;
#endif
uniform mat4 viewProjection;
uniform vec3 eye;
uniform float time;
varying vec2 vUV;
varying float vHalo;
varying float vPhase;
varying float vDist;
void main(void) {
#ifdef INSTANCES
  vec3 c = world3.xyz; float w = length(world0.xyz); float h = length(world1.xyz);
#else
  vec3 c = vec3(0.0); float w = 0.3; float h = 0.6;
#endif
  vec3 toEye = eye - c;
  vec3 level = normalize(vec3(toEye.x, 0.0, toEye.z) + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(level.z, 0.0, -level.x);
  float phase = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float halo = position.z;
  vec3 p;
  if (halo > 0.5) {
    // the halo: a camera-facing disc round the flame's middle
    vec3 fwd = normalize(toEye);
    vec3 r2 = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 u2 = cross(fwd, r2);
    float s = h * 2.6;
    p = c + vec3(0.0, h * 0.35, 0.0) + r2 * position.x * s + u2 * (position.y - 0.5) * s + fwd * 0.05;
  } else {
    float flick = 1.0 + 0.10 * sin(time * 8.7 + phase * 31.0) + 0.06 * sin(time * 14.3 + phase * 7.0);
    p = c + right * position.x * w + vec3(0.0, position.y * h * flick, 0.0);
    p += right * sin(time * 2.9 + phase * 6.3 + position.y * 2.0) * 0.07 * position.y * h;
  }
  vUV = vec2(position.x + 0.5, position.y);
  vHalo = halo;
  vPhase = phase;
  vDist = length(eye - p);
  gl_Position = viewProjection * vec4(p, 1.0);
}`;

Effect.ShadersStore.kitFlameFragmentShader = `
precision highp float;
varying vec2 vUV;
varying float vHalo;
varying float vPhase;
varying float vDist;
uniform float time;
uniform vec3 coreColor;
uniform vec3 edgeColor;
uniform float fogDensity;
uniform float haloStrength;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(void) {
  float fog = exp(-pow(fogDensity * vDist, 2.0));
  if (vHalo > 0.5) {
    float r = length(vUV - vec2(0.5)) * 2.0;
    float a = pow(max(0.0, 1.0 - r), 2.2) * haloStrength * fog;
    gl_FragColor = vec4(edgeColor * a, a);
    return;
  }
  float y = vUV.y, x = vUV.x - 0.5;
  float n = vnoise(vec2(vUV.x * 4.0 + vPhase * 9.0, y * 3.5 - time * 3.2));
  float n2 = vnoise(vec2(vUV.x * 9.0 - vPhase * 4.0, y * 7.0 - time * 5.1));
  // a teardrop: widest a quarter up, a tongue to the tip, torn by the noise
  float width = 0.46 * pow(max(0.0, 1.0 - y), 0.75) * smoothstep(0.0, 0.22, y + 0.06);
  float d = abs(x + (n - 0.5) * 0.22 * y) - width * (0.75 + 0.5 * n2);
  float body = smoothstep(0.06, -0.04, d);
  float core = smoothstep(0.0, -0.16, d) * smoothstep(0.85, 0.15, y);
  vec3 col = mix(edgeColor, coreColor, core) * (1.4 - y * 0.6);
  float a = body * (1.0 - smoothstep(0.7, 1.0, y)) * fog;
  gl_FragColor = vec4(col * a, a);
}`;

export interface FlameColors { core: string; edge: string }

export class FlamePool {
  readonly pool: GroupedInstances;
  readonly material: ShaderMaterial;
  private t0 = performance.now();
  constructor(readonly scene: Scene, colors: FlameColors, opts: { name?: string; haloStrength?: number } = {}) {
    const name = opts.name ?? 'kit_flames';
    const mesh = new Mesh(name, scene), vd = new VertexData();
    // two quads: z = 0 the flame card (x -0.5..0.5, y 0..1), z = 1 the halo
    vd.positions = [-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0, -.5, 0, 1, .5, 0, 1, .5, 1, 1, -.5, 1, 1];
    vd.indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    vd.applyToMesh(mesh);
    const m = new ShaderMaterial(`${name}_m`, scene, { vertex: 'kitFlame', fragment: 'kitFlame' }, {
      attributes: ['position'], uniforms: ['viewProjection', 'eye', 'time', 'coreColor', 'edgeColor', 'fogDensity', 'haloStrength'], needAlphaBlending: true,
    });
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    m.alphaMode = Constants.ALPHA_ONEONE;
    m.setColor3('coreColor', Color3.FromHexString(colors.core));
    m.setColor3('edgeColor', Color3.FromHexString(colors.edge));
    m.setFloat('haloStrength', opts.haloStrength ?? 0.32);
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
    // one draw when any flame is drawn: its box would need padding for the
    // halo every repack, and the culler has already dropped unseen rooms
    mesh.alwaysSelectAsActiveMesh = true;
    this.material = m;
    this.pool = new GroupedInstances(mesh);
  }
  /** a flame of width w and height h seated at (x, y, z) */
  add(group: string, x: number, y: number, z: number, w = 0.32, h = 0.62, far = true): void {
    this.pool.add(group, placeMatrix(x, y, z, 0, w, h, w), far);
  }
  upload(): void { this.pool.upload(); }
  update(v: VisState | null): void { this.pool.update(v); }
}

export interface LampSpot { group: string; x: number; y: number; z: number }
/** At most `n` PointLights (default 4) on the lamps nearest the camera among
 * the rooms drawn, with a slow two-sine flicker. */
export class LampSlots {
  readonly lights: PointLight[] = [];
  readonly lamps: LampSpot[] = [];
  private visible: ReadonlySet<string> | null = null;
  constructor(readonly scene: Scene, color: string, intensity: number, range: number, n = 4, name = 'kit_lamp') {
    for (let i = 0; i < Math.min(4, n); i++) {
      const l = new PointLight(`${name}_${i}`, Vector3.Zero(), scene);
      l.diffuse = Color3.FromHexString(color); l.specular = Color3.FromHexString(color).scale(0.3);
      l.intensity = intensity; l.range = range;
      l.setEnabled(false);
      this.lights.push(l);
    }
    const base = intensity, t0 = performance.now();
    scene.onBeforeRenderObservable.add(() => {
      const cam = scene.activeCamera;
      if (!cam) return;
      const p = cam.globalPosition, t = (performance.now() - t0) / 1000;
      const near = this.lamps.filter((l) => !this.visible || this.visible.has(l.group))
        .map((l) => ({ l, d: (l.x - p.x) ** 2 + (l.y - p.y) ** 2 + (l.z - p.z) ** 2 })).sort((a, b) => a.d - b.d);
      this.lights.forEach((light, i) => {
        const hit = near[i];
        if (!hit) { light.setEnabled(false); return; }
        light.setEnabled(true);
        light.position.set(hit.l.x, hit.l.y, hit.l.z);
        light.intensity = base * (0.92 + 0.05 * Math.sin(t * 7.1 + i * 1.7) + 0.03 * Math.sin(t * 12.7 + i));
      });
    });
  }
  add(l: LampSpot): void { this.lamps.push(l); }
  update(v: VisState | null): void { this.visible = v?.visible ?? null; }
}
