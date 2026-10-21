// The capital as the Burned Land sees it from outside: the mound it stands on,
// the field's margins round its walls, and (M3, decisions 12) the city itself --
// the Colonnade city's bastioned octagon, its 15 m limestone curtain, the
// triumphal arch facing the ash with bl_capital in its mouth, and the skyline of
// copper domes and the palace's great dome with the gold crown on its lantern,
// at the Burned Land's own scale (zones/capital_view.ts plans it; the Capital's
// own instancer builds it, capital-architecture.ts buildCapitalView). The
// Capital itself builds its walls from the same modules (zones/capital_walls.ts).
//
// Until M3 this was a bastioned square of the village kit's ramparts under
// caerdun's granite with five kit towers and a torus crown behind it; the
// field round it is exactly what it was -- the mound, the square margins the
// roads, the scatter and the trunks keep (CAP_HALF, insideCapital), the gate's
// pad -- and tools/qa/zone_fingerprint.mjs on burnedland shows only the view
// moved.
import { makePath, mergePavings, scene, glow, ground } from "../scene";
import { buildCapitalView as instanceView } from "../capital-architecture";
import { planCapitalView, VIEW_FLOOR, type ViewPlan, type CapitalView } from "./capital_view";
import { PAVE_SHEETS } from "./capital_paving";
import PLAN from "../capital-layout.json";
import { CAP_HALF } from "./capitalwalls_geom";
import { Mesh, VertexData, StandardMaterial, Texture, Color3, MaterialPluginBase, Material, type Scene, type Light, type DirectionalLight } from "@babylonjs/core";
import { CL_WALL } from "./capital_walls";

// the field's square margins, its mound and the gate on it (Babylon-free, for the view's test)
export { CAP_HALF, CAP_GATE, capitalMound } from "./capitalwalls_geom";

// true inside the walls' square margins, with a margin
export function insideCapital(x: number, z: number, pad = 0): boolean {
  return Math.abs(x) < CAP_HALF - pad && Math.abs(z) < CAP_HALF - pad;
}

// The city's own paving sheets, as the Capital lays them (one table: capital_paving.ts)
const PAVE = PAVE_SHEETS;
// the ramp before the gate: the passage's 8 m and a metre each side, out past the
// pad's level 14 m into its blend (gatePad), where the road takes over
const APPROACH = { half: 5, length: 21 };

// THE CITY. Built after the roads (the gate's road ends in the arch's mouth)
// and before everything else of the field's, which never looked at it.
export function buildCapitalView(): void {
  const v = planCapitalView(PLAN as unknown as ViewPlan, (x, z) => ground(x, z));
  shadeOf(v);
  instanceView(v, VIEW_FLOOR);
  // THE STONE ON THE GROUND, seen through the arch and from the air: one ribbon a
  // rectangle (PATH.md), hard-edged, off the map (the map draws the city's
  // footprints, not its courtyards), merged a stone a mesh
  v.paving.forEach((p, i) => {
    const [x0, z0, x1, z1] = p.rect, alongX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const L = alongX ? x1 - x0 : z1 - z0, Wd = alongX ? z1 - z0 : x1 - x0, m = PAVE[p.mat];
    const broad = Wd >= 8 && L >= 8;
    makePath({ pts: alongX ? [[x0, cz], [x1, cz]] : [[cx, z0], [cx, z1]], half: Wd / 2, tex: m.tex, tint: "#ffffff", uv: m.uv, fray: 0, soft: 0,
      step: broad ? Math.min(3, L / 2.5) : Math.min(0.9, L / 2.5), ...(broad ? { colStep: 3 } : {}), map: false, name: `cv_pave_${p.mat}_${i}` });
  });
  // THE APPROACH. The gate stands on its pad (capitalwalls_geom.ts gatePad), a
  // level 6 m the road climbs to, and the ash heaped up to the threshold as a
  // dirt bank (the N1 look pass, from Morrow). A gate on a rise has a paved
  // ramp: the flags from the arch's mouth, under the grille, down the pad to
  // where the road runs off it, as wide as the passage and a margin, its foot
  // ending on the road. The ground is the field's -- nothing walks differently.
  // Opaque, unlike every other ribbon (a clone of the flags' material): the dirt
  // road, which ends 6 m short of the arch, is a vertex-alpha ribbon drawn after
  // the city's paving, so a blended ramp let the road paint over its flags;
  // drawn in the opaque pass, a few centimetres over the road's own lift (0.05),
  // the ramp's depth keeps the road under it
  const ramp = makePath({ pts: [[v.gate.x, v.gate.z - 0.2], [v.gate.x, v.gate.z - APPROACH.length]], half: APPROACH.half, tex: PAVE.flags.tex, tint: "#ffffff",
    uv: PAVE.flags.uv, fray: 0, soft: 0, step: 0.9, lift: 0.09, map: false, name: "cv_approach" });
  if (ramp?.material) {
    const m = ramp.material.clone("cv_approach_m") as StandardMaterial;
    m.transparencyMode = Material.MATERIAL_OPAQUE;
    ramp.material = m;
    ramp.hasVertexAlpha = false;
    ramp.freezeWorldMatrix();
  }
  mergePavings("cv_paving", (m) => m.name.startsWith("cv_pave"));
  terraceFloor(v.terrace.y, v.terrace.poly, PAVE.gravel.tex);
  // nothing on the ground glows or hides a glow (capital.ts glowDiet's rule)
  if (glow && scene.effectLayers.includes(glow)) {
    for (const m of scene.meshes) if (/^cv_(pave|paving|terrace|approach)/.test(m.name)) glow.addExcludedMesh(m as Mesh);
  }
}

// THE PALACE TERRACE'S FLOOR: the gravel of its gardens, five metres over the
// mound inside the curtain (the field under it is the mound: nothing walks here)
function terraceFloor(y: number, poly: [number, number][], tex: string): void {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [x, z] of poly) { positions.push(x, y + 0.02, z); uvs.push(x / 2, z / 2); }
  for (let i = 1; i + 1 < poly.length; i++) indices.push(0, i + 1, i);
  const mesh = new Mesh("cv_terrace", scene), vd = new VertexData(), normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  for (let i = 1; i < normals.length; i += 3) if (normals[i] < 0) { normals[i - 1] *= -1; normals[i] *= -1; normals[i + 1] *= -1; }
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs; vd.normals = normals;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial("cv_terrace_m", scene);
  const d = new Texture(`${tex}_diff.jpg`, scene), n = new Texture(`${tex}_nor.jpg`, scene);
  m.diffuseTexture = d; m.bumpTexture = n; n.level = 0.7;
  m.specularColor = new Color3(0.03, 0.03, 0.03);
  m.backFaceCulling = false;
  mesh.material = m;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
}

// THE SHADE AT THE WALLS' FOOT (N1). The field's sun casts at full darkness (the
// hemi the only fill: scene.ts), which suits what it was made for -- a dead
// trunk's shadow is a hand's breadth -- but the curtain is 15 m of pale stone,
// the only big caster on the ash, and at full darkness its shadow read as a void
// at the foot of the east and south-east walls (the look pass; worse by night,
// the moon's shadow being the same light's). A generator has one darkness, and a
// darkness would not do it anyway: the sun is 2.1 strong on a StandardMaterial
// ground whose light clamps at 1, so MEASURED, keeping 38% of it (the Capital's
// own 0.38, capital.ts `light`) lit the shade as bright as the sun and the
// shadow vanished, while 0 is the void. So the ground and its glazed ripples
// take the walls' shade by its RESULT: there it is never darker than `keep` of
// what the same ground would be lit (clamped, as the material clamps it). The
// pale stone's light thrown back into its own shade is what the lift stands for.
//
// BY CASTER, not by place (the N1 review): lifted by place, every shadow within
// `near` of the line was lifted with the wall's, and that band holds bl_capital's
// pad, where players gather to go in, and the gate camps (glass_drake, the three
// gate NMs) -- a player's, an NPC's or a monster's own shadow there all but
// vanished. The shadow map cannot say who cast a shade, so the shader asks the
// walls themselves: the ray from the ground to the sun or moon (wsSun) against
// the walls' solids, the same boxes the colliders are (the curtain's runs to the
// parapet, the arch's piers and the head over its passage, so a ray down the
// open passage is no wall's) and the drums as circles, each a little proud of the
// stone so the shadow map's soft edge is inside them. Only where that ray hits
// stone is the shade lifted; a body's shadow beside the wall's keeps its full
// darkness, and inside the wall's it is the wall's shade already. Inside the
// survey line (the view's own city, which nobody walks) every shade lifts, as
// before. The lift still fades by place, from `near` off the line (the curtain's
// 6.2 m footprint and a high sun's shadow past it) to the field's own darkness by
// `far`, where the trunks and rocks begin (the scatter keeps off the old 216 m
// square): a low sun's long wall shadow reaches them, and a lifted ground round a
// full-dark trunk would read as a hole. Only the shade changes -- no mesh, height
// or collider (zone_fingerprint).
const WALL_SHADE = { keep: 0.8, near: CL_WALL.outer + 14, far: CL_WALL.outer + 40, proud: 0.4, soft: 0.5 };
interface ShadeBox { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
let shade: { vertices: [number, number][]; boxes: ShadeBox[]; drums: { x: number; z: number; r: number; y1: number }[] } | null = null;

// what casts the walls' shade, from the view's own plan: its collider boxes (but
// the grille, whose bars throw a grille's shadow) raised from the walk to the
// parapet, the head of the arch over the passage, and the drums to their parapets
function shadeOf(v: CapitalView): void {
  const W = CL_WALL, G = W.gate, B = W.bastion, P = WALL_SHADE.proud;
  const boxes: ShadeBox[] = [];
  const piers = v.boxes.filter((b) => b.what === "gate");
  for (const b of v.boxes) {
    if (b.what === "grille") continue;
    boxes.push({ ...b, hx: b.hx + P, hz: b.hz + P, y1: (b.what === "curtain" ? b.y1 - W.walk + W.parapet : b.y1) + P });
  }
  if (piers.length === 2) {
    // the passage's head: from the arch's haunch (half way up its semicircle) to
    // the attic's top, between the piers and as deep as they are
    const [a, b] = piers;
    boxes.push({ cx: (a.cx + b.cx) / 2, cz: (a.cz + b.cz) / 2, hx: G.passHalf + P, hz: a.hz + P, yaw: a.yaw,
      y0: v.bases.gate + G.springing + G.passHalf / 2, y1: v.bases.gate + G.top + P });
  }
  // the drum's outer rim: its sixteen-sided apothem out to the corners
  const R = B.apothemOut / Math.cos(Math.PI / B.sides) + P;
  const drums = v.circles.map((c, i) => ({ x: c.x, z: c.z, r: Math.max(R, c.r), y1: v.bases.bastions[i] + B.parapet + P }));
  shade = { vertices: v.vertices, boxes, drums };
}

class WallShadePlugin extends MaterialPluginBase {
  private code: string;
  private sun: DirectionalLight | null = null;
  constructor(material: Material, code: string) {
    // CUSTOMUSERLIGHTING routes every light's term through the two functions
    // below (lightFragment.fx); WALLSHADE keeps the program out of the cache
    // bucket of the same material without it
    super(material, "WallShade", 220, { WALLSHADE: false, CUSTOMUSERLIGHTING: false });
    this.code = code;
    // hardBindForSubMesh runs only for plugins registered for the extra events
    // (grass.ts), and the sun moves every frame
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getClassName(): string { return "WallShadePlugin"; }
  prepareDefines(defines: any): void { defines.WALLSHADE = true; defines.CUSTOMUSERLIGHTING = true; }
  getUniforms() {
    return { ubo: [{ name: "wsSun", size: 4, type: "vec4" }], fragment: `uniform vec4 wsSun;` };
  }
  // toward the sun or the moon: the one shadow-casting light, `celestial` (scene.ts)
  hardBindForSubMesh(ubo: any, scene: Scene): void {
    if (!this.sun || this.sun.getScene() !== scene) this.sun = (scene.lights.find((l: Light) => l.name === "celestial") as DirectionalLight) ?? null;
    const d = this.sun?.direction;
    if (d) ubo.updateFloat4("wsSun", -d.x, -d.y, -d.z, 0); else ubo.updateFloat4("wsSun", 0, 1, 0, 0);
  }
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    return shaderType === "fragment" ? { CUSTOM_FRAGMENT_DEFINITIONS: this.code } : null;
  }
}

// the octagon's survey line as its eight outward half-planes, and the walls'
// solids, baked into the shader (one program for every receiver): the distance
// out of a convex polygon is the largest of its edges' signed distances
function wallShadeCode(S: NonNullable<typeof shade>): string {
  const V = S.vertices;
  let area = 0;
  for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const f = (n: number) => n.toFixed(4);
  const lines = V.map((a, i) => {
    const b = V[(i + 1) % V.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // outward normal: right of the edge on a counter-clockwise ring (x right, z up)
    const s = area > 0 ? 1 : -1, nx = s * (b[1] - a[1]) / L, nz = -s * (b[0] - a[0]) / L;
    return `wsD = max(wsD, dot(vPositionW.xz - vec2(${f(a[0])}, ${f(a[1])}), vec2(${f(nx)}, ${f(nz)})));`;
  });
  // a box's local axes as the colliders take them (scene.ts boxColliders)
  const casts = [
    ...S.boxes.map((b) => {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      return `w = max(w, wsBox(P, L, vec2(${f(b.cx)}, ${f(b.cz)}), vec2(${f(c)}, ${f(-s)}), vec2(${f(s)}, ${f(c)}), vec2(${f(b.hx)}, ${f(b.hz)}), ${f(Math.max(b.y0, -1e4))}, ${f(b.y1)}));`;
    }),
    ...S.drums.map((d) => `w = max(w, wsDrum(P, L, vec2(${f(d.x)}, ${f(d.z)}), ${f(d.r)}, ${f(d.y1)}));`),
  ];
  const soft = f(WALL_SHADE.soft);
  return `
#ifdef WALLSHADE
// the ray from P toward the light (L, its xz never zero: scene.ts keeps the sun's
// z) against an oriented box: the slabs give where it is over the footprint, and
// it is stone if it is between the box's floor and top there
float wsBox(vec3 P, vec3 L, vec2 c, vec2 ex, vec2 ez, vec2 h, float y0, float y1) {
  vec2 d = P.xz - c, q = vec2(dot(d, ex), dot(d, ez));
  vec2 r = vec2(dot(L.xz, ex), dot(L.xz, ez));
  r = mix(vec2(1e-5), r, step(1e-5, abs(r)));
  vec2 t1 = (-h - q) / r, t2 = (h - q) / r;
  vec2 tlo = min(t1, t2), thi = max(t1, t2);
  float tn = max(max(tlo.x, tlo.y), 0.0), tf = min(thi.x, thi.y);
  if (tf < tn) return 0.0;
  return smoothstep(-${soft}, ${soft}, y1 - (P.y + tn * L.y)) * smoothstep(-${soft}, ${soft}, P.y + tf * L.y - y0);
}
// and against a drum: where it meets the rim, under the parapet or not
float wsDrum(vec3 P, vec3 L, vec2 c, float R, float y1) {
  vec2 d = P.xz - c;
  float a = max(dot(L.xz, L.xz), 1e-6), b = dot(d, L.xz), k = dot(d, d) - R * R;
  if (k < 0.0) return 1.0;
  float disc = b * b - a * k;
  if (b > 0.0 || disc < 0.0) return 0.0;
  return smoothstep(-${soft}, ${soft}, y1 - (P.y + (-b - sqrt(disc)) / a * L.y));
}
// how much of this fragment's shade is the walls': the place's fade, and outside
// the line, whether the ray to the light meets their stone
float wallShadeWeight() {
  float wsD = -1e9;
  ${lines.join("\n  ")}
  float place = 1.0 - smoothstep(${f(WALL_SHADE.near)}, ${f(WALL_SHADE.far)}, wsD);
  if (place <= 0.0 || wsD < 0.0) return place;
  vec3 P = vPositionW, L = normalize(wsSun.xyz);
  float w = 0.0;
  ${casts.join("\n  ")}
  return place * w;
}
// diffuseBase is what the lights before this one gave (the hemi is the first):
// the shaded result is lifted to at least \`keep\` of the clamped lit one; an
// unshadowed light (every light but the celestial) is left as it is
vec3 computeCustomDiffuseLighting(lightingInfo info, vec3 diffuseBase, float shadow) {
  if (shadow >= 1.0) return info.diffuse;
  vec3 shaded = diffuseBase + info.diffuse * shadow;
  vec3 lifted = max(shaded, ${f(WALL_SHADE.keep)} * min(diffuseBase + info.diffuse, vec3(1.0)));
  return mix(shaded, lifted, wallShadeWeight()) - diffuseBase;
}
#ifdef SPECULARTERM
vec3 computeCustomSpecularLighting(lightingInfo info, vec3 specularBase, float shadow) {
  return info.specular * shadow;
}
#endif
#endif
`;
}

/** The shade by the walls on what lies on the field round them: the ground, its
 * glazed ripples, the roads and the view's own paving (after buildCapitalView
 * and the ripples) -- every mesh `which` names, a material once. */
export function liftWallShade(which: (name: string) => boolean): void {
  if (!shade) return;
  const code = wallShadeCode(shade);
  for (const mesh of scene.meshes) {
    const m = mesh.material as (Material & { __wallShade?: unknown }) | null;
    if (m && which(mesh.name) && !m.__wallShade && m.getClassName() === "StandardMaterial") m.__wallShade = new WallShadePlugin(m, code);
  }
}
