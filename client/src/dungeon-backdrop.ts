// A dungeon's outside, its light, and what its glow pass draws (BACKDROP.md).
//
// Philip (dungeon revamp, 2026-10-11): "some dungeons today, the player can see
// the outside, but the outside is emptiness and floating structures." So:
//
// - ENCLOSED is the default. buildZone hides the 340 m ground plane in every
//   dungeon and clears to the fog's own on-screen colour, so a gap in a wall
//   reads as dark rather than as a lit plane running to a coloured void.
// - OPEN-AIR parts (fort yards, tower tops) get a REAL outside, declared by the
//   module's `outdoor` option: the game's own sky at a fixed hour, the parent
//   field zone's landscape BAKED offline into one panorama
//   (tools/assets/bake_backdrop.mjs -> client/public/backdrops/<key>.jpg) and
//   drawn on a band at infinity, and a low-poly terrain skirt that carries the
//   ground from under the foundations out to where the panorama's land begins.
// - WINDOWS in an enclosed room may look at the same panorama
//   (backdropWindowMaterial): one material, no geometry behind the glass.
//
// Nothing here imports scene.ts: buildZone hands in what it owns (the scene,
// its lights, glowOccluderMesh), so the two never form an evaluation cycle.
import {
  Scene, Mesh, VertexData, ShaderMaterial, Texture, Color3, Effect, Vector4,
  Constants, MultiMaterial, ImageProcessingConfiguration,
  type AbstractMesh, type GlowLayer, type HemisphericLight, type DirectionalLight, type Material,
} from "@babylonjs/core";
import BACKDROPS from "./dungeon-backdrops.json";
import { tombCells, tombEntrances, type TombLayout } from "./zones/mausoleum-layout";

// ---------- the options a dungeon module may declare (registerZone) ----------

/** The ground that runs from under a dungeon's foundations out to the panorama. */
export interface DungeonSkirt {
  /** its height under the dungeon (default -0.6: just under a floor at 0) */
  y?: number;
  /** how far it runs, metres from the centre (default 520) */
  radius?: number;
  /** flat out to here (default: the plan's half-diagonal + 12) */
  inner?: number;
  /** metres it drops (negative) or rises toward the far edge (default -12: a
   *  fort or a tower stands on a height, and its land falls away from it) */
  fall?: number;
  /** relief past the inner ring, metres (default 6) */
  relief?: number;
  /** multiplies the colour the skirt takes from the panorama (default white) */
  color?: string;
  /** the sheet whose grain lies over that colour, /tex/<tex>_diff.jpg (default: the parent's ground) */
  tex?: string;
  /** a lake instead: this hex through the one water material, flat at y */
  water?: string;
  /** the centre in dungeon metres (default: the middle of the plan) */
  centre?: [number, number];
}

/** An open-air dungeon's outside, baked from its parent field zone. */
export interface DungeonOutdoor {
  /** the field zone the panorama is baked from */
  parent: string;
  /** the vantage in the PARENT zone: x, z, and y in absolute metres */
  from: [number, number, number];
  /** the parent azimuth the dungeon's +z looks toward (radians, 0 = +z, pi/2 = +x) */
  dir?: number;
  /** the fixed hour: dayFrac, 0 sunrise, 0.25 noon, 0.5 sunset (default 0.3) */
  time?: number;
  /** the bake's near clip, metres from the vantage (default 40) */
  near?: number;
  /** "open" (default): sky, panorama band and skirt. "windows": none of them,
   *  only the panorama for backdropWindowMaterial; the dungeon stays enclosed */
  mode?: "open" | "windows";
  skirt?: DungeonSkirt | false;
  /** metres of the dungeon's fog the panorama stands behind (default: the skirt's radius) */
  haze?: number;
  /** multiplies the baked pixels (default 1) */
  bright?: number;
  /** default /backdrops/<dungeon key>.jpg */
  file?: string;
  /** the air the bake reads best in (fog, exposure); the module's own
   *  `lighting` is laid over it */
  lighting?: DungeonLighting;
}

/** A warm light pool on the floor: additive, no light, one draw for all of them. */
export interface PoolSpec { x: number; z: number; y?: number; r?: number; color?: string; strength?: number }

/** A dungeon's light, applied after its build (so it wins over setZoneFog there). */
export interface DungeonLighting {
  hemi?: number; hemiSky?: string; hemiGround?: string;
  sun?: number; sunColor?: string; sunDir?: [number, number, number];
  fog?: { density: number; color: string };
  exposure?: number; contrast?: number;
  /** the clear colour (default: the fog's on-screen colour) */
  clear?: string;
  /** light pools: a list, or "doors" for a pool at every room's doorway */
  pools?: PoolSpec[] | "doors";
  poolColor?: string; poolStrength?: number; poolRadius?: number;
}

/** What the dungeon's glow pass draws besides emitters. */
export interface DungeonGlow {
  /** a black stand-in for the plan's outer walls in the glow pass only (default
   *  height 3.2 m over each floor), so a lamp behind a wall does not halo through
   *  it; false for none */
  occluder?: false | { height?: number };
}

// ---------- the bake registry ----------

type Registry = { band: [number, number]; width: number; specs: Record<string, DungeonOutdoor> };
const REG = BACKDROPS as unknown as Registry;
/** the elevations (radians) a baked panorama covers: colour above, sky mask below */
export const BACKDROP_BAND: [number, number] = [REG.band[0] * Math.PI / 180, REG.band[1] * Math.PI / 180];
export const BACKDROP_SPECS: Record<string, DungeonOutdoor> = REG.specs;

/** A module's `outdoor` (true = its registry entry; an object is laid over the
 *  registry's entry of the same key), or, in dev with ?outdoor, the registry's
 *  entry for a module that has not opted in yet (QA of a bake before its rebuild). */
export function resolveOutdoor(key: string, opt: Partial<DungeonOutdoor> | true | undefined, devForce: boolean): DungeonOutdoor | null {
  const reg = BACKDROP_SPECS[key];
  const o = opt === true ? reg : opt ? { ...reg, ...opt } : devForce ? reg : undefined;
  if (!o || !o.parent || !o.from) return null;
  return o as DungeonOutdoor;
}

// The zone being built's backdrop, for backdropWindowMaterial (set by buildZone
// before the module builds; cleared for every other zone).
let current: { scene: Scene; key: string; o: DungeonOutdoor; url: string } | null = null;
export function setCurrentBackdrop(scene: Scene, key: string, o: DungeonOutdoor | null): void {
  current = o ? { scene, key, o, url: o.file ?? `/backdrops/${key}.jpg` } : null;
}

// ---------- the image pipeline, on the CPU ----------

// What a colour becomes on screen once a StandardMaterial has run it through
// the scene's image processing (Babylon's applyImageProcessing: exposure, ACES,
// gamma, contrast). Colour curves are left out: a few per cent on a grey.
// The clear colour and the panorama are NOT processed (the clear colour never
// is; the panorama is already a processed picture), so anything that must meet
// fogged geometry on screen -- the clear colour, the panorama's haze -- is put
// through this first.
export function screenColor(c: Color3, ipc: ImageProcessingConfiguration, out = new Color3()): Color3 {
  const ex = ipc.exposure;
  let r = Math.pow(Math.max(c.r, 0), 2.2) * ex, g = Math.pow(Math.max(c.g, 0), 2.2) * ex, b = Math.pow(Math.max(c.b, 0), 2.2) * ex;
  if (ipc.toneMappingEnabled && ipc.toneMappingType === ImageProcessingConfiguration.TONEMAPPING_ACES) {
    const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b, ig = 0.07600 * r + 0.90834 * g + 0.01566 * b, ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;
    const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
    const fr = fit(ir), fg = fit(ig), fb = fit(ib);
    r = 1.60475 * fr - 0.53108 * fg - 0.07367 * fb;
    g = -0.10208 * fr + 1.10813 * fg - 0.00605 * fb;
    b = -0.00327 * fr - 0.07276 * fg + 1.07602 * fb;
  }
  const sat = (v: number) => Math.min(1, Math.max(0, v));
  r = sat(Math.pow(sat(r), 1 / 2.2)); g = sat(Math.pow(sat(g), 1 / 2.2)); b = sat(Math.pow(sat(b), 1 / 2.2));
  const k = ipc.contrast;
  if (k !== 1) {
    const ct = (v: number) => k < 1 ? 0.5 + (v - 0.5) * k : v + (v * v * (3 - 2 * v) - v) * (k - 1);
    r = Math.max(0, ct(r)); g = Math.max(0, ct(g)); b = Math.max(0, ct(b));
  }
  return out.set(r, g, b);
}

/** how much of the scene's fog lies between the eye and `dist` metres */
export function fogAmount(scene: Scene, dist: number): number {
  switch (scene.fogMode) {
    case Scene.FOGMODE_EXP2: return 1 - Math.exp(-Math.pow(scene.fogDensity * dist, 2));
    case Scene.FOGMODE_EXP: return 1 - Math.exp(-scene.fogDensity * dist);
    case Scene.FOGMODE_LINEAR: return Math.min(1, Math.max(0, (dist - scene.fogStart) / Math.max(1e-3, scene.fogEnd - scene.fogStart)));
    default: return 0;
  }
}

// ---------- the panorama shader (the band at infinity, and windows) ----------

// One shader for both. The direction it looks up is the fragment's, from the
// eye: on the band (infiniteDistance) that is the band's own vertex; on a
// window it is the line through the glass, so a pane shows what lies behind it
// at infinity and moves with the eye as a real window does.
//
// The picture is a processed frame of the parent zone, so the shader writes it
// as it is -- no lighting, no tone mapping. Two things are put back on top: the
// dungeon's haze (its fog's on-screen colour, mixed by the fog `haze` metres
// deep, so the land meets the fogged skirt in the same air) and the scene's
// vignette (the bake turns the parent's off; everything else on screen has it).
//
// The texture is two bands of one width: the colour on top, the sky mask under
// it, each spanning BACKDROP_BAND. Below the band is land (the skirt hides it);
// above it is sky -- transparent on the band, the game's sky gradient
// (coastal-sky.ts, without clouds) through a window.
function registerPanoShader(): void {
  if (Effect.ShadersStore.dungeonPanoVertexShader) return;
  Effect.ShadersStore.dungeonPanoVertexShader = `precision highp float;
attribute vec3 position;
#include<instancesDeclaration>
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
varying vec3 vDir;
void main(void){
#include<instancesVertex>
  vec4 wp=finalWorld*vec4(position,1.0);
  vDir=wp.xyz-cameraPosition;
  gl_Position=viewProjection*wp;
}`;
  Effect.ShadersStore.dungeonPanoFragmentShader = `precision highp float;
varying vec3 vDir;
uniform sampler2D pano;
uniform vec4 band;
uniform vec4 haze;
uniform vec4 look;
uniform vec2 vInverseScreenSize;
uniform vec4 vignetteSettings1;
uniform vec4 vignetteSettings2;
uniform float vignetteOn;
void main(void){
  vec3 d=normalize(vDir);
  float el=asin(clamp(d.y,-1.0,1.0));
  float u=fract((atan(d.x,d.z)+band.w)*0.15915494);
  float t=(el-band.x)/(band.y-band.x);
  float tc=clamp(t,band.z,1.0-band.z);
  vec3 col=texture2D(pano,vec2(u,0.5+0.5*tc)).rgb*look.x;
  float a=t<0.0?1.0:(t>1.0?0.0:texture2D(pano,vec2(u,0.5*tc)).r);
  col=mix(col,haze.rgb,haze.a);
  if(look.y>0.5){
    float h=max(d.y,0.0);
    vec3 day=mix(vec3(.70,.82,.86),vec3(.18,.42,.64),pow(h,.43));
    day=mix(day,vec3(.76,.48,.32),look.w*pow(1.0-h,4.0)*.45);
    col=mix(mix(vec3(.024,.037,.071),day,look.z),col,a);
    a=1.0;
  }
  if(vignetteOn>0.5){
    vec2 xy=gl_FragCoord.xy*vInverseScreenSize*2.0-1.0;
    vec3 v1=vec3(xy*vignetteSettings1.xy+vignetteSettings1.zw,1.0);
    float vig=pow(dot(v1,v1),vignetteSettings2.w);
    col*=pow(mix(vignetteSettings2.rgb,vec3(1.0),vig),vec3(0.4545));
  }
  gl_FragColor=vec4(col,a);
}`;
}

function panoTexture(scene: Scene, url: string): Texture {
  const found = scene.textures.find((t) => t.name === url) as Texture | undefined;
  if (found) return found;
  // no mips: the band is always seen at about the magnification it was baked
  // for, and a mip chain on a 6k sheet is a third more memory for nothing
  const tex = new Texture(url, scene, true, true, Texture.BILINEAR_SAMPLINGMODE);
  tex.name = url;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;   // the seam at u = 0/1 is one picture
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

// the sun's height through the day (updateDayNight's), for the window's sky
function skyState(time: number): { daylight: number; dusk: number } {
  const el = Math.sin(time * Math.PI * 2);
  return { daylight: Math.min(1, Math.max(0, el * 2.2)), dusk: el >= 0 ? Math.max(0, 1 - el * 2.1) : 0 };
}

function panoMaterial(scene: Scene, name: string, o: DungeonOutdoor, url: string, window: boolean, hazeDist: number): ShaderMaterial {
  registerPanoShader();
  const m = new ShaderMaterial(name, scene, { vertex: "dungeonPano", fragment: "dungeonPano" }, {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "cameraPosition", "band", "haze", "look", "vInverseScreenSize", "vignetteSettings1", "vignetteSettings2", "vignetteOn"],
    samplers: ["pano"],
    needAlphaBlending: !window,
  });
  const tex = panoTexture(scene, url);
  m.setTexture("pano", tex);
  m.backFaceCulling = false;
  const sky = skyState(o.time ?? 0.3);
  const hc = new Color3();
  m.onBindObservable.add(() => {
    const e = m.getEffect();
    if (!e) return;
    // half a texel of one band, in band units, so the colour band never
    // samples the mask under it (or the reverse)
    const bandRows = Math.max(1, (tex.getSize().height || 1024) / 2);
    e.setFloat4("band", BACKDROP_BAND[0], BACKDROP_BAND[1], 0.5 / bandRows, o.dir ?? 0);
    const ipc = scene.imageProcessingConfiguration;
    screenColor(scene.fogColor, ipc, hc);
    e.setFloat4("haze", hc.r, hc.g, hc.b, fogAmount(scene, hazeDist));
    e.setFloat4("look", o.bright ?? 1, window ? 1 : 0, sky.daylight, sky.dusk);
    e.setFloat("vignetteOn", ipc.vignetteEnabled ? 1 : 0);
    if (ipc.vignetteEnabled) ipc.bind(e);
  });
  return m;
}

/** The panorama band at infinity: one draw, no depth write, behind everything
 *  opaque, after the sky domes and the sun (alphaIndex 2; buildZone puts the
 *  sky's discs at 1 so the land hides a setting sun). */
export function buildBackdropBand(scene: Scene, key: string, o: DungeonOutdoor, hazeDist: number): Mesh {
  const url = o.file ?? `/backdrops/${key}.jpg`;
  const R = 1000, SEG = 96, ROWS = 12;
  // a little past the picture on both sides: below it the shader holds the
  // bottom row (land), above it the band is transparent
  const e0 = BACKDROP_BAND[0] - 0.14, e1 = BACKDROP_BAND[1] + 0.06;
  const pos: number[] = [], idx: number[] = [];
  for (let r = 0; r <= ROWS; r++) {
    const el = e0 + (e1 - e0) * r / ROWS, c = Math.cos(el), y = Math.sin(el) * R;
    for (let s = 0; s <= SEG; s++) { const a = s / SEG * Math.PI * 2; pos.push(Math.sin(a) * c * R, y, Math.cos(a) * c * R); }
  }
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < SEG; s++) {
    const a = r * (SEG + 1) + s, b = a + SEG + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const mesh = new Mesh("dungeon_backdrop", scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.applyToMesh(mesh);
  const m = panoMaterial(scene, "dungeon_backdrop_m", o, url, false, hazeDist);
  m.disableDepthWrite = true;
  mesh.material = m;
  mesh.infiniteDistance = true;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.alphaIndex = 2;
  mesh.metadata = { backdrop: true };
  return mesh;
}

/** A WINDOW onto the dungeon's backdrop: give the glass (or a slit's back face)
 *  this material and it shows the parent's land at infinity, with the sky of the
 *  dungeon's hour above it. Opaque, unlit, out of the glow pass, one draw per
 *  mesh that wears it (merge a room's panes, or thin-instance them: the shader
 *  takes instances). Needs `outdoor` on the module (mode "windows" keeps the
 *  dungeon enclosed and only loads the picture). Null when it has none. */
export function backdropWindowMaterial(name = "dungeon_window", opts: { bright?: number; haze?: number } = {}): ShaderMaterial | null {
  if (!current) return null;
  const { scene, o, url } = current;
  const found = scene.getMaterialByName(name);
  if (found instanceof ShaderMaterial) return found;
  return panoMaterial(scene, name, { ...o, bright: opts.bright ?? o.bright }, url, true, opts.haze ?? o.haze ?? 400);
}

// ---------- the terrain skirt ----------

// value noise, enough for a skirt's swells
function hash(i: number, j: number, seed: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, z: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The ground a dungeon stands on, out to where the panorama's land begins.
 *  Not walkable (it is not in the height function; the dungeon's colliders keep
 *  the player in), not pickable, fogged like the dungeon, lit by its hemi and
 *  sun. A polar grid, dense near the walls and coarse far out: about 1,300
 *  vertices, one draw. */
export function buildTerrainSkirt(scene: Scene, s: Required<Pick<DungeonSkirt, "y" | "radius" | "inner" | "fall" | "relief" | "centre">> & { seed?: number }, material: Material): Mesh {
  const [cx, cz] = s.centre, R = s.radius, inner = Math.min(s.inner, R * 0.8), SEG = 72;
  const radii: number[] = [0, inner * 0.5, inner];
  // geometric rings outward: the far ring is ~70 m deep, the first ~8 m
  for (let k = 1, n = 16; k <= n; k++) radii.push(inner + (R - inner) * (Math.pow(1.22, k) - 1) / (Math.pow(1.22, n) - 1));
  const pos: number[] = [], idx: number[] = [], uvs: number[] = [];
  const tile = 12, seed = s.seed ?? 7;
  for (let r = 0; r < radii.length; r++) {
    const rad = radii[r], t = Math.min(1, Math.max(0, (rad - inner) / Math.max(1, R - inner))), sm = t * t * (3 - 2 * t);
    const n = r === 0 ? 1 : SEG;
    for (let k = 0; k <= (r === 0 ? 0 : SEG); k++) {
      const a = (k % n) / n * Math.PI * 2, x = cx + Math.sin(a) * rad, z = cz + Math.cos(a) * rad;
      const h = s.y + sm * s.fall + sm * s.relief * (noise2(x / 90, z / 90, seed) * 1.4 + noise2(x / 31, z / 31, seed + 3) * 0.6 - 1);
      pos.push(x, h, z); uvs.push(x / tile, z / tile);
    }
  }
  // the centre fan, then quads between rings (each ring holds SEG + 1 vertices)
  for (let k = 0; k < SEG; k++) idx.push(0, 1 + k + 1, 1 + k);
  for (let r = 1; r < radii.length - 1; r++) {
    const a0 = 1 + (r - 1) * (SEG + 1), b0 = a0 + SEG + 1;
    for (let k = 0; k < SEG; k++) idx.push(a0 + k, b0 + k + 1, b0 + k, a0 + k, a0 + k + 1, b0 + k + 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  const mesh = new Mesh("dungeon_skirt", scene);
  const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uvs; vd.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.freezeWorldMatrix();
  mesh.metadata = { backdrop: true };
  return mesh;
}

// The skirt's colour is the PANORAMA's: each fragment takes the land the picture
// shows just under the horizon in its own direction from the eye (an average of
// 15 taps, 2.5-7 degrees down, so a tree or a post does not stripe it), so where
// the skirt runs out into the picture there is no seam to see, whatever the
// parent's ground is made of. Like the band it is written as a picture (no tone
// mapping; the land in it already was), with the parent's ground sheet over it
// for grain, the dungeon's sun on its slopes (flat ground is exactly the
// picture), its haze by distance, and the vignette.
// (The first pass lit the parent's sheet and tint as the field does, and it came
// out a saturated yellow under the Keep: the Capital's tint is for lawns that
// its grass and paving cover, not for bare ground.)
function registerSkirtShader(): void {
  if (Effect.ShadersStore.dungeonSkirtVertexShader) return;
  Effect.ShadersStore.dungeonSkirtVertexShader = `precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec3 vPos; varying vec3 vNormal; varying vec2 vUV;
void main(void){ vPos=position; vNormal=normal; vUV=uv; gl_Position=worldViewProjection*vec4(position,1.0); }`;
  Effect.ShadersStore.dungeonSkirtFragmentShader = `precision highp float;
varying vec3 vPos; varying vec3 vNormal; varying vec2 vUV;
uniform sampler2D pano; uniform sampler2D grain;
uniform vec3 cameraPosition;
uniform vec4 band; uniform vec4 haze; uniform vec4 sun; uniform vec3 tint; uniform vec4 ring;
uniform vec2 vInverseScreenSize; uniform vec4 vignetteSettings1; uniform vec4 vignetteSettings2; uniform float vignetteOn;
void main(void){
  vec3 d=vPos-cameraPosition;
  vec2 q=vPos.xz-ring.xy;
  float r=length(q);
  // the bearing from the dungeon's middle, averaged widely near the walls and
  // narrowly at the far edge, where it must be the picture's own colour: from
  // above, a bearing sampled from the EYE striped the ground like a sunburst
  float u=(atan(q.x,q.y)+band.w)*0.15915494;
  float k=smoothstep(ring.z,ring.w,r);
  float w=mix(0.03,0.008,k*k);
  vec3 c=vec3(0.0);
  for(int i=0;i<9;i++) for(int j=0;j<3;j++){
    float e=(-0.044-0.035*float(j));
    float t=clamp((e-band.x)/(band.y-band.x),band.z,1.0-band.z);
    c+=texture2D(pano,vec2(fract(u+(float(i)-4.0)*w),0.5+0.5*t)).rgb;
  }
  c/=27.0;
  float g=dot(texture2D(grain,vUV).rgb,vec3(0.299,0.587,0.114));
  c*=tint*(0.72+0.56*g);
  vec3 n=normalize(vNormal);
  c*=(0.72+0.28*max(dot(n,sun.xyz),0.0))/(0.72+0.28*max(sun.y,0.0));
  float dist=length(d);
  float f=haze.a>0.5?1.0-exp(-pow(sun.w*dist,2.0)):0.0;
  c=mix(c,haze.rgb,f);
  if(vignetteOn>0.5){
    vec2 xy=gl_FragCoord.xy*vInverseScreenSize*2.0-1.0;
    vec3 v1=vec3(xy*vignetteSettings1.xy+vignetteSettings1.zw,1.0);
    c*=pow(mix(vignetteSettings2.rgb,vec3(1.0),pow(dot(v1,v1),vignetteSettings2.w)),vec3(0.4545));
  }
  gl_FragColor=vec4(c,1.0);
}`;
}

/** The skirt's material: the panorama's own land colour (see above). `sunDir`
 *  is the direction light travels (the dungeon's directional light); `ring` the
 *  skirt's centre x, z, its flat inner radius and its full radius. */
export function skirtMaterial(scene: Scene, key: string, o: DungeonOutdoor, grainTex: string, sunDir: () => { x: number; y: number; z: number }, ring: [number, number, number, number], tint?: Color3): ShaderMaterial {
  registerSkirtShader();
  const url = o.file ?? `/backdrops/${key}.jpg`;
  const m = new ShaderMaterial("dungeon_skirt_m", scene, { vertex: "dungeonSkirt", fragment: "dungeonSkirt" }, {
    attributes: ["position", "normal", "uv"],
    uniforms: ["worldViewProjection", "cameraPosition", "band", "haze", "sun", "tint", "ring", "vInverseScreenSize", "vignetteSettings1", "vignetteSettings2", "vignetteOn"],
    samplers: ["pano", "grain"],
  });
  const pano = panoTexture(scene, url);
  m.setTexture("pano", pano);
  const grain = new Texture(`/tex/${grainTex}_diff.jpg`, scene);
  m.setTexture("grain", grain);
  const t = tint ?? new Color3(1, 1, 1);
  m.setColor3("tint", t);
  m.setVector4("ring", new Vector4(...ring));   // centre x, z, inner, radius
  const hc = new Color3();
  m.onBindObservable.add(() => {
    const e = m.getEffect();
    if (!e) return;
    const rows = Math.max(1, (pano.getSize().height || 1024) / 2);
    e.setFloat4("band", BACKDROP_BAND[0], BACKDROP_BAND[1], 0.5 / rows, o.dir ?? 0);
    const ipc = scene.imageProcessingConfiguration;
    screenColor(scene.fogColor, ipc, hc);
    e.setFloat4("haze", hc.r, hc.g, hc.b, scene.fogMode === Scene.FOGMODE_EXP2 ? 1 : 0);
    const s = sunDir(), l = Math.hypot(s.x, s.y, s.z) || 1;
    e.setFloat4("sun", -s.x / l, -s.y / l, -s.z / l, scene.fogDensity);
    e.setFloat("vignetteOn", ipc.vignetteEnabled ? 1 : 0);
    if (ipc.vignetteEnabled) ipc.bind(e);
  });
  return m;
}

// ---------- light ----------

/** A lighting preset over what buildZone set up. Every field optional. */
export function applyDungeonLighting(scene: Scene, hemi: HemisphericLight | null, sun: DirectionalLight | null, p: DungeonLighting): void {
  if (hemi) {
    if (p.hemi !== undefined) hemi.intensity = p.hemi;
    if (p.hemiSky) hemi.diffuse = Color3.FromHexString(p.hemiSky);
    if (p.hemiGround) hemi.groundColor = Color3.FromHexString(p.hemiGround);
  }
  if (sun) {
    if (p.sun !== undefined) sun.intensity = p.sun;
    if (p.sunColor) sun.diffuse = Color3.FromHexString(p.sunColor);
    if (p.sunDir) sun.direction.set(...p.sunDir).normalize();
  }
  if (p.fog) {
    scene.fogMode = p.fog.density > 0 ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    scene.fogDensity = p.fog.density;
    scene.fogColor = Color3.FromHexString(p.fog.color);
  }
  const ipc = scene.imageProcessingConfiguration;
  if (p.exposure !== undefined) ipc.exposure = p.exposure;
  if (p.contrast !== undefined) ipc.contrast = p.contrast;
  if (p.clear) scene.clearColor = Color3.FromHexString(p.clear).toColor4(1);
}

/** The clear colour that meets the fog on screen. */
export function fogClear(scene: Scene): void {
  scene.clearColor = screenColor(scene.fogColor, scene.imageProcessingConfiguration).toColor4(1);
}

// Light pools: a soft warm disc on the floor, ADDED to what is there (a lamp's
// light on flagstones, without a light). One merged mesh, one draw, whatever the
// count; no depth write; faded by the fog toward nothing, not toward the fog
// colour (an additive surface that fogged to the fog colour would brighten the
// far dark). Not in the glow pass.
function registerPoolShader(): void {
  if (Effect.ShadersStore.dungeonPoolVertexShader) return;
  Effect.ShadersStore.dungeonPoolVertexShader = `precision highp float;
attribute vec3 position; attribute vec2 uv; attribute vec4 color;
uniform mat4 worldViewProjection; uniform vec3 cameraPosition;
varying vec2 vUV; varying vec4 vColor; varying float vDist;
void main(void){ vUV=uv; vColor=color; vDist=length(position-cameraPosition); gl_Position=worldViewProjection*vec4(position,1.0); }`;
  Effect.ShadersStore.dungeonPoolFragmentShader = `precision highp float;
varying vec2 vUV; varying vec4 vColor; varying float vDist;
uniform vec2 fog;
void main(void){
  float r=length(vUV*2.0-1.0);
  float a=1.0-smoothstep(0.0,1.0,r); a*=a;
  float f=fog.y>0.5?exp(-pow(fog.x*vDist,2.0)):1.0;
  gl_FragColor=vec4(vColor.rgb*a*f,1.0);
}`;
}

export function lightPools(scene: Scene, pools: { x: number; y: number; z: number; r: number; c: Color3 }[]): Mesh | null {
  if (!pools.length) return null;
  registerPoolShader();
  const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
  for (const p of pools) {
    const b = pos.length / 3, y = p.y + 0.035;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(p.x + (u * 2 - 1) * p.r, y, p.z + (v * 2 - 1) * p.r); uvs.push(u, v); col.push(p.c.r, p.c.g, p.c.b, 1);
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const mesh = new Mesh("dungeon_pools", scene);
  const vd = new VertexData(); vd.positions = pos; vd.uvs = uvs; vd.colors = col; vd.indices = idx; vd.applyToMesh(mesh);
  const m = new ShaderMaterial("dungeon_pools_m", scene, { vertex: "dungeonPool", fragment: "dungeonPool" }, {
    attributes: ["position", "uv", "color"], uniforms: ["worldViewProjection", "cameraPosition", "fog"], needAlphaBlending: true,
  });
  m.alphaMode = Constants.ALPHA_ADD;
  m.disableDepthWrite = true;
  m.backFaceCulling = false;
  m.zOffset = -2;
  m.onBindObservable.add(() => { m.getEffect()?.setFloat2("fog", scene.fogDensity, scene.fogMode === Scene.FOGMODE_EXP2 ? 1 : 0); });
  mesh.material = m;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** A pool at every doorway of the plan (where a room meets a corridor): the
 *  warm light at each threshold is what leads the eye on through the route. */
export function doorPools(layout: TombLayout, floorAt: (x: number, z: number) => number, color: Color3, r: number): { x: number; y: number; z: number; r: number; c: Color3 }[] {
  const seen = new Set<string>(), out: { x: number; y: number; z: number; r: number; c: Color3 }[] = [];
  for (const e of tombEntrances(layout)) {
    // the room side of the threshold, a metre in, so the pool lies on the floor
    // the doorway opens onto rather than in the corridor's mouth
    const x = e.x - e.dx * 1.2, z = e.z - e.dz * 1.2, k = `${Math.round(x)},${Math.round(z)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ x, z, y: floorAt(x, z), r, c: color });
  }
  return out;
}

// ---------- the glow pass ----------

function emits(m: AbstractMesh): boolean {
  const md = m.metadata as { glowOccluder?: boolean; glowPass?: boolean } | null;
  if (md?.glowOccluder || md?.glowPass) return true;
  const mt = m.material;
  if (!mt) return false;
  if ((mt.metadata as { glow?: number } | null)?.glow) return true;
  if (mt instanceof MultiMaterial) return mt.subMaterials.some((s) => !!(s?.metadata as { glow?: number } | null)?.glow);
  return false;
}

/** In a dungeon the glow pass draws ONLY emitters (a material with
 *  `metadata.glow`), glow occluders (`metadata.glowOccluder`) and anything a
 *  module flags with `mesh.metadata.glowPass`. The layer otherwise redraws every
 *  mesh in view black just to hide what glows behind it (the scout measured glow
 *  draws == main draws in every dungeon). The hiding is done instead by one
 *  coarse occluder of the plan's walls (layoutOccluder). Decided per draw from
 *  the material, so meshes made after the build (monsters, spells, portals)
 *  follow the same rule. */
export function glowOnlyEmitters(layer: GlowLayer): void {
  const thin = (layer as unknown as { _thinEffectLayer?: { hasMesh(m: AbstractMesh): boolean } })._thinEffectLayer;
  if (!thin) return;
  const base = thin.hasMesh.bind(thin);
  thin.hasMesh = (m: AbstractMesh) => base(m) && emits(m);
}

/** A black wall in the glow pass only, a slab just OUTSIDE every floor cell
 *  edge that has no floor (or machinery: an obstacle cell) beyond it -- where
 *  the plan's walls stand -- from just under the floor to `height` over it, and
 *  a slab under every floor cell. Outside, so it never covers a lamp or a lit
 *  pane on a wall's inner face; doorways are floor on both sides, so they stay
 *  open. There is no ceiling (rooms' heights are not in the plan, and a cap
 *  would hide a chandelier): from ABOVE a roof, a lamp under it still haloes,
 *  which only the ?zone overhead camera ever sees. */
export function layoutOccluder(layout: TombLayout, floorAt: (x: number, z: number) => number, height: number): { positions: Float32Array; indices: Uint32Array } {
  const cells = tombCells(layout), C = layout.cell, H = C / 2;
  const solid = new Set<string>();
  for (const o of layout.obstacles ?? []) for (let i = o.x; i < o.x + o.w; i++) for (let j = o.z; j < o.z + o.d; j++) solid.add(`${i},${j}`);
  const pos: number[] = [], idx: number[] = [];
  const FACES = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
    const b = pos.length / 3;
    for (const y of [y0, y1]) for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) pos.push(x, y, z);
    for (const f of FACES) idx.push(b + f);
  };
  for (const [k, room] of cells) {
    const [i, j] = k.split(",").map(Number), cx = i * C, cz = j * C;
    const y = room?.y ?? floorAt(cx, cz);
    // and the floor, from under it: a lamp in an upper room does not halo
    // through the ceiling of the room below (stacked floors, galleries)
    box(cx - H, cx + H, cz - H, cz + H, y - 0.35, y - 0.15);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = `${i + dx},${j + dz}`;
      if (cells.has(n) || solid.has(n)) continue;
      if (dx) { const x = cx + dx * H; box(Math.min(x, x + dx * 0.2), Math.max(x, x + dx * 0.2), cz - H, cz + H, y - 0.3, y + height); }
      else { const z = cz + dz * H; box(cx - H, cx + H, Math.min(z, z + dz * 0.2), Math.max(z, z + dz * 0.2), y - 0.3, y + height); }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** The plan's middle and half-diagonal, for the skirt. */
export function layoutExtent(layout: TombLayout): { cx: number; cz: number; half: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const k of tombCells(layout).keys()) {
    const [i, j] = k.split(",").map(Number);
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); z0 = Math.min(z0, j); z1 = Math.max(z1, j);
  }
  const C = layout.cell;
  if (!Number.isFinite(x0)) return { cx: 0, cz: 0, half: 60 };
  return { cx: (x0 + x1) / 2 * C, cz: (z0 + z1) / 2 * C, half: Math.hypot(x1 - x0 + 1, z1 - z0 + 1) * C / 2 };
}
