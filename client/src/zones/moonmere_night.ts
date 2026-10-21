// THE LAMPS LIGHT THE GROUND (A-7; the look review: "At night the lamps glow
// but light no ground ... streets light no ground anywhere"). Night in Moonmere
// is materials, not lights (ruling 16: the crystal is the city's one point
// light, the Safari limit): the lamps' glass glows, and now the ground under
// each lamp warms with it. Every lamp the dressing planner placed is painted
// ONCE, at build, as a soft radial pool into one map over the island (1024²
// over 360 m, 0.35 m a texel), and the paving's and the ground's materials add
// that pool, warm, scaled by the night amount. One texture lookup a fragment,
// no lights, no draws.
import { DynamicTexture, MaterialPluginBase, Texture, type Material, type Scene } from "@babylonjs/core";
import { dayFrac, scene } from "../scene";

/** the map's square on the plate: x0, z0 and its side (m) */
const MAP = { x0: -170, z0: -60, size: 360, px: 1024 };
/** a pool's radius and strength by lamp file */
const POOL: Record<string, [number, number]> = {
  lamp_post: [6.5, 1.0], lamp_lantern: [5.0, 0.8], lamp_bracket: [4.6, 0.75], lamp_sconce: [4.0, 0.65],
};
/** the warm of a lamp's pool on the stone (linear-ish, before the night amount) */
const WARM = [1.0, 0.62, 0.28];
const night = (d: number) => 1 - Math.min(1, Math.max(0, Math.sin(d * Math.PI * 2) * 2.2));

let poolTex: DynamicTexture | null = null;
let poolScene: Scene | null = null;
let nightNow = 0;

/** Paint the pools of these lamps (the dressing's lamp pieces, at their world places;
 * a wall lamp's pool is centred a metre out from its wall, along its yaw). */
export function paintLampPools(lamps0: { file: string; x: number; y: number; z: number; yaw?: number }[]): DynamicTexture {
  const lamps = lamps0.map((l) => l.file === "lamp_post" ? l : { ...l, x: l.x + Math.sin(l.yaw ?? 0) * 1.0, z: l.z + Math.cos(l.yaw ?? 0) * 1.0 });
  const owner = scene;
  const t = new DynamicTexture("mm_lamp_pools", { width: MAP.px, height: MAP.px }, owner, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, MAP.px, MAP.px);
  ctx.globalCompositeOperation = "lighter";
  const k = MAP.px / MAP.size;
  for (const l of lamps) {
    const p = POOL[l.file];
    if (!p) continue;
    const [r, s] = p;
    // u along +x, v along +z: uploaded unflipped (update(false)), so canvas row = v
    const cx = (l.x - MAP.x0) * k, cy = (l.z - MAP.z0) * k, rr = r * k;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    const a = Math.round(255 * s);
    g.addColorStop(0, `rgba(${a},${a},${a},1)`);
    g.addColorStop(0.35, `rgba(${Math.round(a * 0.55)},${Math.round(a * 0.55)},${Math.round(a * 0.55)},1)`);
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
  }
  t.update(false);
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  poolTex?.dispose();
  poolTex = t; poolScene = owner;
  const obs = owner.onBeforeRenderObservable.add(() => { nightNow = night(dayFrac()); });
  owner.onDisposeObservable.addOnce(() => { owner.onBeforeRenderObservable.remove(obs); if (poolScene === owner) { poolTex = null; poolScene = null; } });
  return t;
}

class MoonmerePoolPlugin extends MaterialPluginBase {
  private tex: Texture;
  constructor(material: Material, tex: Texture) {
    super(material, "MoonmerePools", 240, { MMPOOLS: false });
    this.tex = tex;
    this._enable(true);
  }
  getClassName(): string { return "MoonmerePoolPlugin"; }
  prepareDefines(defines: Record<string, unknown>): void { defines.MMPOOLS = true; }
  getSamplers(samplers: string[]): void { samplers.push("mmPools"); }
  getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return { ubo: [{ name: "mmNight", size: 1, type: "float" }], fragment: "#ifdef MMPOOLS\nuniform float mmNight;\n#endif\n" };
  }
  bindForSubMesh(uniformBuffer: { setTexture: (n: string, t: Texture) => void; updateFloat: (n: string, v: number) => void }): void {
    uniformBuffer.setTexture("mmPools", this.tex);
    uniformBuffer.updateFloat("mmNight", nightNow);
  }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    const f = (n: number) => n.toFixed(4);
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef MMPOOLS\nuniform sampler2D mmPools;\n#endif\n",
      CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef MMPOOLS
if (mmNight > 0.01) {
  vec2 mmPu = vec2((vPositionW.x - ${f(MAP.x0)}) / ${f(MAP.size)}, (vPositionW.z - ${f(MAP.z0)}) / ${f(MAP.size)});
  float mmPool = texture2D(mmPools, mmPu).r;
  color.rgb += baseColor.rgb * vec3(${WARM.map(f).join(", ")}) * (mmPool * mmNight * 0.85);
}
#endif
`,
    };
  }
}

const done = new WeakSet<Material>();
/** Give these materials the pools (once each). */
export function lightWithPools(mats: (Material | null | undefined)[]): number {
  if (!poolTex) return 0;
  let n = 0;
  for (const m of mats) {
    if (!m || done.has(m)) continue;
    done.add(m);
    new MoonmerePoolPlugin(m, poolTex);
    n++;
  }
  return n;
}

// LIT WINDOWS BY HOUSE (L3, S4; MOONMERE.md A-14). The facade's night sheet lit every pane of every
// house at once: from the air and across the water the whole city was one even lamp-lit grid
// (LOOKED, S3's night aerials). Now each house keeps its own hours. A house's share of lit rooms is
// painted once into a map over the island (its body, 0.6 m proud so its facade planes are inside);
// the facade's fragment finds its BAY -- the instance's own origin, every vertex of a thin instance
// carries it -- and its storey, hashes the pair, and lights that room's panes only if the hash falls
// under the house's share. Everything not a house (the civic shells, the study towers, the Long
// Tower, whose sealed room is black on the sheet anyway) reads the map's white and stays lit.
// One texture lookup and a hash a fragment, on the one facade material: no draw. The glow pass
// cannot read the mask, so the houses' bays leave it (moonmere_city.ts KIT.glowNightOnly, the
// "glow diet"): their lit panes still burn in the main pass; the lamps and the public buildings bloom.
const LIT = { x0: -200, z0: -140, size: 440, px: 512 };
/** each house's share of lit rooms, by its seeded draw: some asleep, most half-lit, some all lit */
export function houseLitShare(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const r = (h % 1000) / 1000;
  return r < 0.1 ? 0.0 : r < 0.35 ? 0.3 : r < 0.7 ? 0.55 : 0.85;
}
export function paintLitHouses(houses: { id: string; body: { cx: number; cz: number; hx: number; hz: number; yaw: number } }[], owner: Scene = scene): DynamicTexture {
  const t = new DynamicTexture("mm_lit_houses", { width: LIT.px, height: LIT.px }, owner, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, LIT.px, LIT.px);
  const k = LIT.px / LIT.size;
  for (const h of houses) {
    const b = h.body, c = Math.cos(b.yaw), s = Math.sin(b.yaw), hx = b.hx + 0.6, hz = b.hz + 0.6;
    const v = Math.round(255 * houseLitShare(h.id));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, w], i) => {
      const x = b.cx + u * hx * c + w * hz * s, z = b.cz - u * hx * s + w * hz * c;
      const px = (x - LIT.x0) * k, py = (z - LIT.z0) * k;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.closePath(); ctx.fill();
  }
  t.update(false);
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  // nearest: a texel is a house's share, never a blend of two houses' shares
  t.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  return t;
}
// (the offset is read while the base class's constructor asks for the code -- before a field could be set)
let litOff: [number, number] = [0, 0];
class MoonmereLitPlugin extends MaterialPluginBase {
  private tex: Texture;
  private off: [number, number];
  constructor(material: Material, tex: Texture, off: [number, number]) {
    litOff = off;
    super(material, "MoonmereLit", 250, { MMLIT: false });
    this.tex = tex; this.off = off;
    this._enable(true);
  }
  getClassName(): string { return "MoonmereLitPlugin"; }
  prepareDefines(defines: Record<string, unknown>): void { defines.MMLIT = true; }
  getSamplers(samplers: string[]): void { samplers.push("mmLit"); }
  bindForSubMesh(uniformBuffer: { setTexture: (n: string, t: Texture) => void }): void { uniformBuffer.setTexture("mmLit", this.tex); }
  getCustomCode(shaderType: string): Record<string, string> | null {
    const f = (n: number) => n.toFixed(4);
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: "#ifdef MMLIT\nvarying vec3 vMmBay;\n#endif\n",
        // the bay's origin (the instance's translation) and the fragment's height in the bay's frame
        CUSTOM_VERTEX_MAIN_END: "#ifdef MMLIT\nvMmBay = vec3(finalWorld[3].x, finalWorld[3].z, positionUpdated.y);\n#endif\n",
      };
    }
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef MMLIT\nuniform sampler2D mmLit;\nvarying vec3 vMmBay;\n#endif\n",
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifdef MMLIT
{
  // (the view in the Shores stands translated: its bays' origins are moved back into the map's frame)
  vec2 mmB = vMmBay.xy - vec2(${f((this.off ?? litOff)[0])}, ${f((this.off ?? litOff)[1])});
  float mmShare = texture2D(mmLit, vec2((mmB.x - ${f(LIT.x0)}) / ${f(LIT.size)}, (mmB.y - ${f(LIT.z0)}) / ${f(LIT.size)})).r;
  if (mmShare < 0.99) {
    float mmStorey = floor((vMmBay.z - 1.2) / 3.6);
    float mmH = fract(sin(dot(vec3(floor(mmB * 4.0 + 0.5), mmStorey), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    finalEmissive *= step(mmH, mmShare - 0.001);
  }
}
#endif
`,
    };
  }
}
const litDone = new WeakSet<Material>();
/** Give the facade material(s) the houses' hours (once each). `off`: where the map's frame stands in this scene. */
export function lightByHouse(mats: (Material | null | undefined)[], tex: Texture, off: [number, number] = [0, 0]): number {
  let n = 0;
  for (const m of mats) {
    if (!m || litDone.has(m)) continue;
    litDone.add(m);
    new MoonmereLitPlugin(m, tex, off);
    n++;
  }
  return n;
}

// THE CAUSEWAY'S DECK UNDER ITS LAMPS (S4 review: "its 16 m lamp posts light no ground, so the deck at
// the spawn is evenly lit at night with a lamp beside it casting nothing"). The island's pool map
// stops at z 300 and lights only the ground's and the paving's materials, and the deck is the city
// kit's own stone (cw_bay's flags: MC_Roof's primitives, which the kit draws with its one facade
// material, mc_facade -- LOOKED: a plugin on MC_Roof lit nothing). So the causeway has its own strip of
// pools, painted from its lamps, and the facade material adds them -- only on the deck: inside the strip, at
// the deck's height, on a face looking up (the pylons' cornices and every roof elsewhere are not
// touched). Its box and height are uniforms (one effect serves both zones' strips). No light, no draw.
const DECK_PX = { u: 64, v: 512 };
let deckNight = 0;
class MoonmereDeckPlugin extends MaterialPluginBase {
  private tex: Texture;
  private box: [number, number, number, number];
  private y: number;
  constructor(material: Material, tex: Texture, box: [number, number, number, number], y: number) {
    super(material, "MoonmereDeckPools", 245, { MMDECK: false });
    this.tex = tex; this.box = box; this.y = y;
    this._enable(true);
  }
  getClassName(): string { return "MoonmereDeckPlugin"; }
  prepareDefines(defines: Record<string, unknown>): void { defines.MMDECK = true; }
  getSamplers(samplers: string[]): void { samplers.push("mmDeckPools"); }
  getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [{ name: "mmDeckBox", size: 4, type: "vec4" }, { name: "mmDeckY", size: 1, type: "float" }, { name: "mmDeckNight", size: 1, type: "float" }],
      fragment: "#ifdef MMDECK\nuniform vec4 mmDeckBox;\nuniform float mmDeckY;\nuniform float mmDeckNight;\n#endif\n",
    };
  }
  bindForSubMesh(ub: { setTexture: (n: string, t: Texture) => void; updateFloat: (n: string, v: number) => void; updateFloat4: (n: string, x: number, y: number, z: number, w: number) => void }): void {
    ub.setTexture("mmDeckPools", this.tex);
    ub.updateFloat4("mmDeckBox", ...this.box);
    ub.updateFloat("mmDeckY", this.y);
    ub.updateFloat("mmDeckNight", deckNight);
  }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef MMDECK\nuniform sampler2D mmDeckPools;\n#endif\n",
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifdef MMDECK
if (mmDeckNight > 0.01) {
  vec2 mmDu = (vPositionW.xz - mmDeckBox.xy) / mmDeckBox.zw;
  if (mmDu.x > 0.0 && mmDu.x < 1.0 && mmDu.y > 0.0 && mmDu.y < 1.0 && abs(vPositionW.y - mmDeckY) < 0.25 && normalW.y > 0.9) {
    finalEmissive += surfaceAlbedo.rgb * vec3(${WARM.map((n) => n.toFixed(4)).join(", ")}) * (texture2D(mmDeckPools, mmDu).r * mmDeckNight * 0.85);
  }
}
#endif
`,
    };
  }
}
const deckDone = new WeakSet<Material>();
/**
 * Pools on the causeway's deck: `lamps` (lamp_post pieces, world places), the strip `box`
 * [x0, z0, width, length] they light, the deck's top `y`. `mat`: the material the deck draws with (mc_facade).
 */
export function lightDeck(mat: Material | null | undefined, lamps: { x: number; z: number }[], box: [number, number, number, number], y: number, owner: Scene = scene): void {
  if (!mat || deckDone.has(mat)) return;
  deckDone.add(mat);
  const t = new DynamicTexture("mm_deck_pools", { width: DECK_PX.u, height: DECK_PX.v }, owner, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, DECK_PX.u, DECK_PX.v);
  ctx.globalCompositeOperation = "lighter";
  const [r, s] = POOL.lamp_post, ku = DECK_PX.u / box[2], kv = DECK_PX.v / box[3];
  for (const l of lamps) {
    // (a texel is not square here: the pool drawn as an ellipse in the canvas is a circle on the deck)
    ctx.save();
    ctx.translate((l.x - box[0]) * ku, (l.z - box[1]) * kv);
    ctx.scale(ku, kv);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const a = Math.round(255 * s);
    g.addColorStop(0, `rgba(${a},${a},${a},1)`);
    g.addColorStop(0.35, `rgba(${Math.round(a * 0.55)},${Math.round(a * 0.55)},${Math.round(a * 0.55)},1)`);
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  t.update(false);
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  new MoonmereDeckPlugin(mat, t, box, y);
  const obs = owner.onBeforeRenderObservable.add(() => { deckNight = night(dayFrac()); });
  owner.onDisposeObservable.addOnce(() => owner.onBeforeRenderObservable.remove(obs));
}
