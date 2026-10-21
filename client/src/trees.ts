// GENERATED TREES, standing in for the CC0 kit's (Philip, 2026-09-27: "replace
// all the nature assets with your own design ... FFXIV style ... performance
// is important"). The kit's files are gone (2026-10-18) but its paths stay
// as the keys: staticTemplate asks isGeneratedTree() first, so every scatter,
// canopy, rim and placeExact that names a kit tree gets one of these, at the
// kit file's MEASURED height -- the zones' scale multipliers were tuned
// against those heights and stay right. Each species also keeps its kit species' colour ROLE
// (birch orange, twisted red, cherry purple, the tall-thick blue; Philip
// approved keeping them), because zones chose species for their colour.
//
// Why they are cheaper as well as better:
//
// - MEASURED, the kit's common trees are 4,900-9,500 vertices each, and a
//   thin-instanced template is drawn whole every frame (one bounding box for
//   every instance) and again in each shadow cascade -- Heartwood Fields drew
//   ~2.5M tree vertices a frame and its common trees cost ~11.5ms at 720p.
//   These are ~1,000: low-sided tapered tubes for the wood, and the canopy's
//   density painted into a sheet on a few dozen cards, not modelled. Same
//   view, same measure: ~1.5ms.
// - Past LOD_NEAR metres each tree is swapped for its own cut-down double
//   (~100 vertices: the trunk, the main limbs, a few big cards) in the SAME
//   materials, so light and colour carry across the swap at any hour. Not an
//   image impostor: a picture baked once would keep one time of day's light
//   while the day cycle moves on.
// - The canopy's look is the lighting, not the geometry: every card's normal
//   points out from the crown (and a little up), so the crown shades as one
//   soft rounded mass -- lit on top, falling off round the sides, dark under.
//   The underside and the inside are darkened again in vertex colour.
// - Wind is in the vertex shader: the tree sways about its root in proportion
//   to height squared, and the canopy flutters on top of that.
//
// Tint and snow are the tree's own too (a kit tint is a material multiply and
// SnowCapPlugin is PBR-only; the canopy is not PBR): tintedTemplate and
// addSnowCaps hand a generated tree to generatedTreeVariant / snowGeneratedTree
// here. Textures are painted on canvases at load, as the grass blades are.
import {
  Color3, DynamicTexture, Material, MaterialPluginBase, Matrix, Mesh, MultiMaterial,
  PBRMaterial, Scene, StandardMaterial, SubMesh, Texture, Vector3, VertexData,
} from "@babylonjs/core";

type Sheet = "leaf" | "smallleaf" | "blossom" | "needle";
export interface TreeSpecies {
  key: string;
  form: "broad" | "conifer" | "bare";
  trunkFrac: number;              // where the trunk divides, as a fraction of height
  crownBase: number;              // the crown's underside, as a fraction of height
  limbs: [number, number];        // primary limbs (broad, bare) / arms per tier (conifer)
  cardsPerClump: [number, number];
  cardSize: [number, number];     // leaf card edge, as a fraction of height
  trunkRadius: number;            // trunk base radius, as a fraction of height
  bark: [string, string];         // bark ridge (light) and fissure (dark)
  barkStyle?: "birch";
  leaf: [string, string, string]; // leaf shade, mid, lit
  sheet: Sheet;
  twist?: number;                 // trunk wander, as a fraction of height (twisted)
  rise?: number;                  // how far limbs climb before they spread (0.35 broadleaf)
  tiers?: number;                 // conifer branch whorls
}

// The common broadleaf: a clear trunk dividing at a third of its height into
// four to six limbs, a rounded crown of leaf clumps -- the Shroud's oaks
// rather than a lollipop. (Approved by Philip 2026-09-28; its random draws
// must not change, so every newer species' extra randomness uses a second
// generator.)
const BROADLEAF: TreeSpecies = {
  key: "broadleaf", form: "broad",
  trunkFrac: 0.36, crownBase: 0.3,
  limbs: [4, 6], cardsPerClump: [5, 7], cardSize: [0.2, 0.28], trunkRadius: 0.032,
  bark: ["#c9b9a0", "#6f5e4c"],
  leaf: ["#1d3517", "#4c7a2a", "#b3cf5e"], sheet: "leaf",
};
// Birch: slender, white-barked, the crown a tall oval of small leaves -- the
// kit's birch is autumn orange, and zones use it for exactly that.
const BIRCH: TreeSpecies = {
  key: "birch", form: "broad",
  trunkFrac: 0.42, crownBase: 0.34,
  limbs: [5, 7], cardsPerClump: [4, 6], cardSize: [0.13, 0.18], trunkRadius: 0.016,
  bark: ["#ece8df", "#2c2826"], barkStyle: "birch",
  leaf: ["#5a1e06", "#c4580f", "#f4b04a"], sheet: "smallleaf", rise: 0.55,
};
// Twisted: a wandering, heavy trunk and long reaching limbs; red crown (the
// kit's Leaves_TwistedTree role).
const TWISTED: TreeSpecies = {
  key: "twisted", form: "broad",
  trunkFrac: 0.4, crownBase: 0.38,
  limbs: [3, 5], cardsPerClump: [6, 8], cardSize: [0.15, 0.2], trunkRadius: 0.038,
  bark: ["#8f8680", "#3a3330"],
  leaf: ["#3e0a0a", "#a3201c", "#e8603c"], sheet: "leaf", twist: 0.07, rise: 0.25,
};
// Cherry: low, wide and spreading, a flat-topped cloud of blossom in the
// kit's purple-pink.
const CHERRY: TreeSpecies = {
  key: "cherry", form: "broad",
  trunkFrac: 0.3, crownBase: 0.4,
  limbs: [5, 7], cardsPerClump: [7, 9], cardSize: [0.16, 0.22], trunkRadius: 0.03,
  bark: ["#9a7a6e", "#3d2a26"],
  leaf: ["#5e3068", "#bb6fdc", "#f6cdf6"], sheet: "blossom", twist: 0.03, rise: 0.18,
};
// Tall-thick: a big trunk carrying its crown high -- the kit's blue.
const TALLTHICK: TreeSpecies = {
  key: "tallthick", form: "broad",
  trunkFrac: 0.48, crownBase: 0.42,
  limbs: [5, 7], cardsPerClump: [6, 8], cardSize: [0.13, 0.18], trunkRadius: 0.042,
  bark: ["#8a6f58", "#33241a"],
  leaf: ["#16244e", "#4463c2", "#a4b8f2"], sheet: "leaf", rise: 0.4,
};
// Pine: a straight trunk to the tip and whorls of drooping sprays narrowing
// to a point -- the La Noscea/Coerthas conifer.
const PINE: TreeSpecies = {
  key: "pine", form: "conifer",
  trunkFrac: 1, crownBase: 0.16,
  limbs: [6, 8], cardsPerClump: [3, 4], cardSize: [0.14, 0.2], trunkRadius: 0.026,
  bark: ["#9a6e56", "#3b2519"],
  leaf: ["#1a3a1c", "#34622c", "#86ab5e"], sheet: "needle", tiers: 10,
};
// Giant pine: broader and darker, more whorls, bigger sprays.
const GIANTPINE: TreeSpecies = {
  key: "giantpine", form: "conifer",
  trunkFrac: 1, crownBase: 0.12,
  limbs: [7, 9], cardsPerClump: [4, 5], cardSize: [0.1, 0.15], trunkRadius: 0.03,
  bark: ["#7a5236", "#2a1a10"],
  leaf: ["#173519", "#2f5d2c", "#78a255"], sheet: "needle", tiers: 13,
};
// Dead: bare, grey, branching down to twigs.
const DEAD: TreeSpecies = {
  key: "dead", form: "bare",
  trunkFrac: 0.42, crownBase: 0.4,
  limbs: [4, 5], cardsPerClump: [0, 0], cardSize: [0, 0], trunkRadius: 0.028,
  bark: ["#9a9296", "#3a3437"],
  leaf: ["#000000", "#000000", "#000000"], sheet: "leaf", twist: 0.035, rise: 0.3,
};

// Kit file -> the generated tree that stands in for it. Heights and crown
// widths are the kit's own (env_manifest_cc0.json: max y, and x/z extent),
// so every scale already chosen for them in the zones still gives the size
// it was chosen for. The manifest keeps these rows though the kit's files
// are deleted (tools/assets/gen_cc0_manifest.py keep_retired).
type KitTree = { species: TreeSpecies; height: number; width: number; seed: number };
const KIT: Record<string, KitTree> = {};
const kit = (prefix: string, species: TreeSpecies, rows: [number, number][], seed: number) =>
  rows.forEach(([height, width], i) => { KIT[`nature/${prefix}_${i + 1}.gltf`] = { species, height, width, seed: seed + i * 101 }; });
kit("CommonTree", BROADLEAF, [[7.03, 4.4], [7.4, 4.4], [9.2, 4.2], [9.2, 3.9], [6.8, 4.0]], 0);
KIT["nature/CommonTree_1.gltf"].seed = 101; KIT["nature/CommonTree_2.gltf"].seed = 202;
KIT["nature/CommonTree_3.gltf"].seed = 303; KIT["nature/CommonTree_4.gltf"].seed = 404;
KIT["nature/CommonTree_5.gltf"].seed = 505;
kit("Pine", PINE, [[7.08, 4.7], [7.14, 5.5], [7.16, 3.8], [10.0, 5.6], [8.49, 6.3]], 1101);
kit("GiantPine", GIANTPINE, [[16.87, 9.5], [16.61, 12.6], [12.82, 12.4], [16.39, 12.9], [15.64, 15.8]], 2101);
kit("DeadTree", DEAD, [[9.16, 6.0], [11.15, 6.6], [12.95, 6.4], [12.44, 7.8], [16.1, 8.4]], 3101);
kit("Birch", BIRCH, [[13.29, 6.5], [13.1, 5.9], [12.93, 7.3], [11.19, 6.4], [13.29, 6.5]], 4101);
kit("TwistedTree", TWISTED, [[16.52, 12.5], [18.75, 9.9], [15.87, 11.4], [18.54, 10.8], [15.46, 9.4]], 5101);
kit("CherryBlossom", CHERRY, [[13.17, 13.4], [11.35, 12.3], [14.28, 14.8], [12.88, 12.9], [13.17, 12.7]], 6101);
kit("TallThick", TALLTHICK, [[14.73, 9.2], [14.93, 7.5], [15.05, 8.8], [15.03, 9.4], [18.61, 8.7]], 7101);

// Other generated plants (nature.ts: bushes, flowers, grass tufts, ferns,
// plants) share this module's tint/snow variant path and materials, so they
// register here; `build` makes a template for a tint (or none) and snow.
type FoliageBuild = (scene: Scene, tint: string | null, snow: boolean) => Mesh | null;
const FOLIAGE: Record<string, FoliageBuild> = {};
export function registerGeneratedFoliage(file: string, build: FoliageBuild): void { FOLIAGE[file] = build; }

export function isGeneratedTree(file: string): boolean {
  return !!KIT[file] || !!FOLIAGE[file];
}

// ---------- the painted sheets ----------
const sheets = new WeakMap<Scene, Map<string, Texture>>();
function sheet(scene: Scene, key: string, make: () => Texture): Texture {
  let m = sheets.get(scene);
  if (!m) { m = new Map(); sheets.set(scene, m); }
  let t = m.get(key);
  if (!t) { t = make(); m.set(key, t); }
  return t;
}

function canvasSheet(scene: Scene, name: string, draw: (ctx: CanvasRenderingContext2D, S: number, rand: () => number) => void, seed: number): Texture {
  const S = 512;
  const tex = new DynamicTexture(name, { width: S, height: S }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, S, S);
  draw(ctx, S, mulberry(seed));
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}
const grey = (v: number) => { const c = Math.round(255 * Math.max(0, Math.min(1, v))); return `rgb(${c},${c},${c})`; };

// A ball of leaves: pointed leaves inside a circle, each turned roughly
// outward from the centre, the upper ones lighter (a card's own top half
// should read as the lit side of its clump). Greyscale: the colour is the
// species' shade-mid-lit ramp in the shader, so one sheet serves every species.
function drawLeaves(ctx: CanvasRenderingContext2D, S: number, rand: () => number, count: number, size: number): void {
  const leaves: { x: number; y: number; a: number; len: number; w: number; l: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rand()) * S * 0.42, th = rand() * Math.PI * 2;
    const x = S / 2 + Math.cos(th) * r, y = S / 2 + Math.sin(th) * r * 0.92;
    const out = Math.atan2(y - S / 2, x - S / 2);
    const len = S * (size + rand() * size * 0.66);
    const up = 1 - y / S;
    leaves.push({ x, y, a: out + (rand() - 0.5) * 1.3, len, w: len * (0.38 + rand() * 0.14), l: 0.34 + up * 0.42 + rand() * 0.24 });
  }
  leaves.sort((p, q) => q.y - p.y);
  for (const f of leaves) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    const g = ctx.createLinearGradient(-f.len * 0.5, 0, f.len * 0.5, 0);
    g.addColorStop(0, grey(f.l * 0.78));
    g.addColorStop(1, grey(f.l * 1.05));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-f.len * 0.5, 0);
    ctx.quadraticCurveTo(0, -f.w, f.len * 0.5, 0);
    ctx.quadraticCurveTo(0, f.w, -f.len * 0.5, 0);
    ctx.fill();
    ctx.strokeStyle = grey(f.l * 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-f.len * 0.45, 0);
    ctx.lineTo(f.len * 0.4, 0);
    ctx.stroke();
    ctx.restore();
  }
}

// Blossom: five-petalled flowers packed into a ball, a few leaves showing
// underneath, the petals pale at the tips.
function drawBlossom(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  drawLeaves(ctx, S, rand, 30, 0.07);   // the green under the flowers reads as the shade end of the ramp
  const flowers: { x: number; y: number; r: number; l: number; a: number }[] = [];
  for (let i = 0; i < 150; i++) {
    const rr = Math.sqrt(rand()) * S * 0.41, th = rand() * Math.PI * 2;
    const x = S / 2 + Math.cos(th) * rr, y = S / 2 + Math.sin(th) * rr * 0.9;
    flowers.push({ x, y, r: S * (0.022 + rand() * 0.014), l: 0.55 + (1 - y / S) * 0.3 + rand() * 0.15, a: rand() * 6.28 });
  }
  flowers.sort((p, q) => q.y - p.y);
  for (const f of flowers) {
    for (let k = 0; k < 5; k++) {
      const a = f.a + (k / 5) * Math.PI * 2;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.6);
      g.addColorStop(0, grey(f.l * 0.75));
      g.addColorStop(1, grey(f.l * 1.08));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(f.x + Math.cos(a) * f.r * 0.8, f.y + Math.sin(a) * f.r * 0.8, f.r * 0.75, f.r * 0.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = grey(f.l * 0.6);
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A fir spray, laid along the card's U axis: a twig out from the left edge
// and a flat fan of side-shoots off both sides of it, every shoot fringed
// with needles, the upper edge lighter. It has to FILL the card -- MEASURED,
// a lone twig covered about a third of it, and seen from the ground each tier
// read as a few dark streaks.
function drawNeedles(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  const needles = (x0: number, y0: number, a: number, len: number, nl: number) => {
    const steps = Math.max(2, Math.round(len / 4));
    for (let i = 0; i < steps; i++) {
      const t = i / steps, x = x0 + Math.cos(a) * len * t, y = y0 + Math.sin(a) * len * t;
      const l = nl * (1 - t * 0.5);
      const lit = 0.42 + (1 - y / S) * 0.38 + rand() * 0.15;
      for (const [side, k] of [[-1, 1.05], [1, 0.72]] as [number, number][]) {
        const na = a + side * (0.85 + rand() * 0.35);
        ctx.strokeStyle = grey(lit * k);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(na) * l, y + Math.sin(na) * l);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = grey(0.28);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    ctx.stroke();
  };
  const x0 = S * 0.03, y0 = S * 0.5, L = S * 0.94;
  // side shoots first, so the twig and its own needles lie over them
  for (let t = 0.06; t < 0.9; t += 0.075) {
    for (const side of [-1, 1]) {
      const bx = x0 + L * t, spread = (1 - t) * 0.85 + 0.2;
      const len = S * 0.42 * spread * (0.8 + rand() * 0.35);
      needles(bx, y0, side * (0.75 + rand() * 0.25), len, S * 0.05);
    }
  }
  needles(x0, y0, 0, L, S * 0.055);
}

function leafSheetFor(scene: Scene, kind: Sheet): Texture {
  return sheet(scene, `sheet_${kind}`, () => canvasSheet(scene, `gtSheet_${kind}`, (ctx, S, rand) => {
    if (kind === "leaf") drawLeaves(ctx, S, rand, 115, 0.075);
    else if (kind === "smallleaf") drawLeaves(ctx, S, rand, 190, 0.05);
    else if (kind === "blossom") drawBlossom(ctx, S, rand);
    else drawNeedles(ctx, S, rand);
  }, 11));
}

// Bark: long vertical ridges split by dark fissures that wander, in the
// species' two colours, and a normal map from the same height field. Birch
// is its own pattern: pale, with short dark horizontal marks.
function barkSheets(scene: Scene, sp: TreeSpecies, seed: number): { diffuse: Texture; normal: Texture } {
  const W = 256, H = 512;
  const height = new Float32Array(W * H);
  const rand = mulberry(seed);
  if (sp.barkStyle === "birch") {
    height.fill(0.92);
    const marks = Array.from({ length: 70 }, () => ({ x: rand() * W, y: rand() * H, w: 8 + rand() * 30, h: 1.5 + rand() * 3.5 }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let h = 0.9 + (rand() - 0.5) * 0.06;
      for (const m of marks) {
        let dx = Math.abs(x - m.x); dx = Math.min(dx, W - dx);
        let dy = Math.abs(y - m.y); dy = Math.min(dy, H - dy);   // wrap: marks cross the sheet's edge
        if (dx < m.w / 2 && dy < m.h) h = Math.min(h, 0.12 + (dy / m.h) * 0.3);
      }
      height[y * W + x] = h;
    }
  } else {
    // The groove wander must repeat over the sheet's height: the sheet tiles
    // every 1.4m up a trunk, and MEASURED, free frequencies (0.01-0.05/px)
    // left a horizontal seam at every repeat (Philip saw them). Whole
    // numbers of cycles per sheet only.
    const TAU = Math.PI * 2;
    const grooves = Array.from({ length: 22 }, () => ({ x: rand() * W, amp: 4 + rand() * 7, f1: TAU * (1 + Math.floor(rand() * 2)) / H, f2: TAU * (3 + Math.floor(rand() * 4)) / H, ph: rand() * 6.28, w: 2 + rand() * 3.5 }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let h = 0.72;
      for (const g of grooves) {
        const gx = g.x + Math.sin(y * g.f1 + g.ph) * g.amp + Math.sin(y * g.f2 + g.ph * 2) * g.amp * 0.4;
        let d = Math.abs(x - gx); d = Math.min(d, W - d);   // wrap in x: the sheet tiles round the trunk
        h -= 0.38 * Math.exp(-(d * d) / (g.w * g.w));
      }
      h += (rand() - 0.5) * 0.08;
      height[y * W + x] = Math.max(0, Math.min(1, h));
    }
  }
  const light = Color3.FromHexString(sp.bark[0]), dark = Color3.FromHexString(sp.bark[1]);
  const diffuse = new DynamicTexture(`gtBark_${sp.key}`, { width: W, height: H }, scene, true);
  const normal = new DynamicTexture(`gtBarkNormal_${sp.key}`, { width: W, height: H }, scene, true);
  const dc = diffuse.getContext() as unknown as CanvasRenderingContext2D;
  const nc = normal.getContext() as unknown as CanvasRenderingContext2D;
  const dimg = dc.createImageData(W, H), nimg = nc.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, h = height[i];
    const c = Color3.Lerp(dark, light, h);
    dimg.data[i * 4] = c.r * 255; dimg.data[i * 4 + 1] = c.g * 255; dimg.data[i * 4 + 2] = c.b * 255; dimg.data[i * 4 + 3] = 255;
    const hx = height[y * W + ((x + 1) % W)] - height[y * W + ((x - 1 + W) % W)];
    const hy = height[((y + 1) % H) * W + x] - height[((y - 1 + H) % H) * W + x];
    const n = new Vector3(-hx * 3, -hy * 3, 1).normalize();
    nimg.data[i * 4] = (n.x * 0.5 + 0.5) * 255; nimg.data[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; nimg.data[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255; nimg.data[i * 4 + 3] = 255;
  }
  dc.putImageData(dimg, 0, 0); diffuse.update(true);
  nc.putImageData(nimg, 0, 0); normal.update(true);
  for (const t of [diffuse, normal]) { t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; }
  return { diffuse, normal };
}

// ---------- the shader ----------
// Shared by the wood (PBR) and the canopy (Standard): the wood must sway with
// its leaves. The height fraction rides in the vertex colour's alpha, which
// the fragment never reads (hasVertexAlpha is off). Tint and snow live here
// too, so a tinted snowy pine does not need the kit's material cloning.
class TreePlugin extends MaterialPluginBase {
  time = 0;
  leaf: boolean;
  snow = false;
  shade = new Color3(); mid = new Color3(); lit = new Color3(); tint = new Color3(1, 1, 1);
  constructor(material: Material, leaf: boolean, snow: boolean) {
    super(material, "GenTree", 210, { GTREE: false, GTREE_LEAF: false, GTREE_PBR: false, GTREE_SNOW: false });
    this.leaf = leaf;
    this.snow = snow;
    // hardBindForSubMesh only fires for plugins registered for the extra
    // events (the grass learned this the hard way)
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getClassName(): string { return "TreePlugin"; }
  prepareDefines(defines: any): void {
    defines.GTREE = true;
    defines.GTREE_LEAF = this.leaf;
    defines.GTREE_PBR = !this.leaf;
    defines.GTREE_SNOW = this.snow;
  }
  getUniforms() {
    return {
      ubo: [
        { name: "gtMisc", size: 4, type: "vec4" },     // time, wind x, wind z, sway (m at the top)
        { name: "gtShade", size: 4, type: "vec4" },
        { name: "gtMid", size: 4, type: "vec4" },
        { name: "gtLit", size: 4, type: "vec4" },
        { name: "gtTint", size: 4, type: "vec4" },
      ],
      vertex: `uniform vec4 gtMisc;`,
      fragment: `uniform vec4 gtShade; uniform vec4 gtMid; uniform vec4 gtLit; uniform vec4 gtTint;`,
    };
  }
  hardBindForSubMesh(ubo: any): void {
    ubo.updateFloat4("gtMisc", this.time, 0.8, 0.6, 0.18);
    ubo.updateColor4("gtShade", this.shade, 1);
    ubo.updateColor4("gtMid", this.mid, 1);
    ubo.updateColor4("gtLit", this.lit, 1);
    ubo.updateColor4("gtTint", this.tint, 1);
  }
  // Every code point is returned whatever this instance is: Babylon collects
  // a plugin's code INSIDE the base constructor, before this.leaf is set
  // (MEASURED: a canopy once rendered its bare grey sheet). Defines select.
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#if defined(GTREE) && defined(VERTEXCOLOR)
{
  vec3 gtRoot = finalWorld[3].xyz;
  float gtUp = color.a;                               // 0 at the root, 1 at the crown top
  float gtPhase = fract(sin(dot(gtRoot.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  float gtT = gtMisc.x;
  // slow sway of the whole tree, two incommensurate periods so it never
  // settles into a visible beat; a big tree bends further at the top
  float gtSway = sin(gtT * 0.8 + gtPhase + gtRoot.x * 0.015) * 0.7 + sin(gtT * 1.9 + gtPhase * 1.7) * 0.3;
  float gtScale = length(finalWorld[1].xyz);
  worldPos.xz += gtMisc.yz * gtSway * gtUp * gtUp * gtMisc.w * gtScale;
#ifdef GTREE_LEAF
  // and the leaves flutter on top of it, each card a little out of step
  worldPos.xyz += vec3(1.0, 0.4, 1.0) * sin(gtT * 4.3 + dot(positionUpdated, vec3(2.1, 3.3, 1.7))) * 0.035 * gtUp * gtScale;
#endif
}
#endif
`,
    };
    if (shaderType === "fragment") return {
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#ifdef GTREE_LEAF
{
  // the sheet's clear pixels are black, so the mips average black into
  // every leaf edge; dividing alpha back out recovers the leaf's own shade
  float gtLum = clamp(baseColor.r / max(baseColor.a, 0.02), 0.0, 1.0);
  baseColor.rgb = (gtLum < 0.5 ? mix(gtShade.rgb, gtMid.rgb, gtLum * 2.0) : mix(gtMid.rgb, gtLit.rgb, gtLum * 2.0 - 1.0)) * gtTint.rgb;
#ifdef GTREE_SNOW
  // snow lies on what faces up -- the canopy's normals are the crown's, so
  // the tops of the crown and of each tier -- broken by a world-space
  // wobble so it lies in patches, and not in the sheet's gaps
  // Either normal will do: the crown's (the lighting normal) or the card's
  // own face, recovered from the screen-space derivatives. A conifer's sprays
  // lie nearly flat, so their faces hold snow all down the sides of the cone,
  // where the crown normal points sideways and alone left only the edges white.
  vec3 gtFace = normalize(cross(dFdx(vPositionW), dFdy(vPositionW)));
  float gtWob = 0.14 * (sin(vPositionW.x * 1.7 + vPositionW.z * 0.9) + sin(vPositionW.x * 0.6 - vPositionW.z * 1.9 + vPositionW.y * 1.3));
  float gtSnowUp = max(normalize(vNormalW).y, abs(gtFace.y) * 0.95) + gtWob;
  // lit needles take the snow, the shadowed underside of each spray keeps it green
  float gtSnowAmt = smoothstep(0.6, 0.88, gtSnowUp) * smoothstep(0.08, 0.4, gtLum) * 0.92;
  baseColor.rgb = mix(baseColor.rgb, vec3(0.97, 0.98, 1.0) * (0.88 + 0.14 * gtLum), gtSnowAmt);
#endif
  // keep the canopy's coverage at distance (the grass's coverage boost)
  vec2 gtTx = vDiffuseUV * 512.0;
  vec2 gtDx = dFdx(gtTx), gtDy = dFdy(gtTx);
  float gtMip = max(0.0, 0.5 * log2(max(dot(gtDx, gtDx), dot(gtDy, gtDy))));
  alpha = baseColor.a * (1.0 + gtMip * 0.35);
  // a card turned edge-on to the eye shows as a sliver of streaked texture;
  // thin it out as it turns (the card's own face, from the derivatives)
  vec3 gtCard = normalize(cross(dFdx(vPositionW), dFdy(vPositionW)));
  alpha *= smoothstep(0.06, 0.28, abs(dot(gtCard, viewDirectionW)));
}
#endif
`,
      // the wood's snow: PBR only (surfaceAlbedo), on the tops of the limbs
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#if defined(GTREE_PBR) && defined(GTREE_SNOW) && defined(NORMAL)
{
  float gtSnowUp = normalize(vNormalW).y;
  surfaceAlbedo = mix(surfaceAlbedo, vec3(0.62, 0.66, 0.72), smoothstep(0.35, 0.7, gtSnowUp) * 0.9);
}
#endif
`,
    };
    return null;
  }
}

// Materials per species, tint and snow. A tint is a multiply of the leaf
// ramp and of the bark, as a kit tint was; snow sits on top of it, as the
// kit's SnowCapPlugin did, so it stays white under a blue-grey frost tint.
type Pair = { bark: PBRMaterial; canopy: StandardMaterial | null };
const materials = new WeakMap<Scene, Map<string, Pair>>();
const plugins = new WeakMap<Scene, TreePlugin[]>();
function speciesMaterials(scene: Scene, sp: TreeSpecies, tint: string | null, snow: boolean): Pair {
  let m = materials.get(scene);
  if (!m) { m = new Map(); materials.set(scene, m); }
  const key = `${sp.key}|${tint ?? ""}|${snow ? "snow" : ""}`;
  let pair = m.get(key);
  if (pair) return pair;
  const list = clockFor(scene);
  const tc = tint ? Color3.FromHexString(tint) : new Color3(1, 1, 1);
  // The wood is PBR, like every other prop in the scene: a trunk is a
  // VERTICAL surface, and the simple material the canopy and the grass use
  // lights one from the sun and the hemisphere alone -- MEASURED, the first
  // trunks rendered near-black (rgb 15,11,9) beside kit props lit by the sky
  // image. The canopy's normals point up and out, so it keeps the cheaper
  // material. Names avoid "leaf/leaves/crown/plant": styleFoliage restyles
  // KIT materials by name, and these are not kit materials.
  const bark = new PBRMaterial(`gtBark_${key}`, scene);
  const bs = sheet(scene, `bark_${sp.key}`, () => { const b = barkSheets(scene, sp, 7); (b.diffuse as any).__normal = b.normal; return b.diffuse; });
  bark.albedoTexture = bs;
  bark.albedoColor = tc;
  bark.bumpTexture = (bs as any).__normal;
  bark.bumpTexture!.level = 0.8;
  bark.metallic = 0;
  bark.roughness = 1;
  if (treeIPC) bark.imageProcessingConfiguration = treeIPC;
  list.push(new TreePlugin(bark, false, snow));
  let canopy: StandardMaterial | null = null;
  if (sp.form !== "bare") {
    canopy = new StandardMaterial(`gtCanopy_${key}`, scene);
    canopy.diffuseTexture = leafSheetFor(scene, sp.sheet);
    canopy.useAlphaFromDiffuseTexture = true;
    canopy.transparencyMode = Material.MATERIAL_ALPHATEST;   // and the test after the coverage boost
    // 0.35, as foliageSolid set it on the approved broadleaf: a fuller crown
    canopy.alphaCutOff = 0.35;
    if (treeIPC) canopy.imageProcessingConfiguration = treeIPC;
    canopy.backFaceCulling = false;
    canopy.specularColor = Color3.Black();
    const cp = new TreePlugin(canopy, true, snow);
    cp.shade = Color3.FromHexString(sp.leaf[0]);
    cp.mid = Color3.FromHexString(sp.leaf[1]);
    cp.lit = Color3.FromHexString(sp.leaf[2]);
    cp.tint = tc;
    list.push(cp);
  }
  pair = { bark, canopy };
  m.set(key, pair);
  return pair;
}

// A foliage material for any generated plant: a painted greyscale sheet
// coloured by a shade-mid-lit ramp, wind, flutter, tint and snow -- the
// canopy material, for a bush, a flower head or a fern frond.
const foliageMats = new WeakMap<Scene, Map<string, StandardMaterial>>();
export function foliageMaterial(scene: Scene, key: string, tex: Texture, ramp: [string, string, string], tint: string | null, snow: boolean): StandardMaterial {
  let m = foliageMats.get(scene);
  if (!m) { m = new Map(); foliageMats.set(scene, m); }
  const k = `${key}|${tint ?? ""}|${snow ? "snow" : ""}`;
  const found = m.get(k);
  if (found) return found;
  const list = clockFor(scene);
  const mat = new StandardMaterial(`gtFoliage_${k}`, scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.alphaCutOff = 0.35;
  mat.backFaceCulling = false;
  mat.specularColor = Color3.Black();
  if (treeIPC) mat.imageProcessingConfiguration = treeIPC;
  const p = new TreePlugin(mat, true, snow);
  p.shade = Color3.FromHexString(ramp[0]); p.mid = Color3.FromHexString(ramp[1]); p.lit = Color3.FromHexString(ramp[2]);
  if (tint) p.tint = Color3.FromHexString(tint);
  list.push(p);
  m.set(k, mat);
  return mat;
}
// The wood of a generated plant (a bush's stems, a flower's stalks): the
// tree bark material, swaying with its leaves.
export function woodMaterial(scene: Scene, species: "broadleaf" | "stem", tint: string | null, snow: boolean): PBRMaterial {
  const sp = species === "stem" ? STEM : BROADLEAF;
  return speciesMaterials(scene, sp, tint, snow).bark;
}
// Green stalk "bark" for flowers and plants: pale fibres on a green ground.
const STEM: TreeSpecies = { ...BROADLEAF, key: "stem", bark: ["#8fb45a", "#3f6a26"] };
export { canvasSheet, drawLeaves, grey, leafSheetFor, sheet, mulberry, curve, norm, cross, dot, sub, rotateAbout, tube, barkSheets };
export type { V3, Limb, TreeSpecies as NatureSpecies };

function clockFor(scene: Scene): TreePlugin[] {
  let list = plugins.get(scene);
  if (!list) {
    const l: TreePlugin[] = [];
    list = l;
    plugins.set(scene, l);
    const t0 = performance.now();
    scene.onBeforeRenderObservable.add(() => { const t = (performance.now() - t0) / 1000; for (const p of l) p.time = t; });
  }
  return list;
}

function applyMaterials(mesh: Mesh, pair: Pair, key: string, scene: Scene): void {
  if (!pair.canopy) { mesh.material = pair.bark; return; }
  const multi = new MultiMaterial(`gtMulti_${key}`, scene);
  multi.subMaterials = [pair.bark, pair.canopy];
  mesh.material = multi;
}

// ---------- the tree ----------
type V3 = [number, number, number];
interface Limb { pts: V3[]; r0: number; r1: number; sides: number }
interface Card { p: V3; size: number; face: V3; spin: number; along?: V3; clumpC: V3; clumpR: number }

// The skeleton and the cards for one tree. `lod` builds its distant double:
// the trunk and main limbs on fewer sides, one card per clump at twice the
// size -- same silhouette and colour, a tenth of the vertices.
function plan(k: KitTree, lod: boolean): { limbs: Limb[]; cards: Card[]; crownC: V3; crownR: V3 } {
  const { species: sp, height: Ht, width: Wd, seed } = k;
  const rand = mulberry(seed);
  const rand2 = mulberry(seed * 7 + 13);   // the newer species' draws (see BROADLEAF)
  const rr = (a: number, b: number) => a + rand() * (b - a);
  const r2 = (a: number, b: number) => a + rand2() * (b - a);
  const limbs: Limb[] = [];
  const cards: Card[] = [];
  const R0 = sp.trunkRadius * Ht;
  const sides = (n: number) => (lod ? Math.max(3, n - 2) : n);

  if (sp.form === "conifer") {
    // A straight trunk to the tip, whorls of drooping arms narrowing to it.
    const lean = [r2(-0.02, 0.02) * Ht, r2(-0.02, 0.02) * Ht];
    const trunk: V3[] = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; trunk.push([lean[0] * t * t, t * Ht * 0.98 - 0.2, lean[1] * t * t]); }
    limbs.push({ pts: trunk, r0: R0 * 1.25, r1: R0 * 0.1, sides: sides(7) });
    const tiers = sp.tiers ?? 8;
    const crownC: V3 = [0, Ht * (sp.crownBase + 1) / 2, 0];
    const crownR: V3 = [Wd / 2, Ht * (1 - sp.crownBase) / 2, Wd / 2];
    for (let i = 0; i < tiers; i++) {
      // (the distant double keeps every tier: MEASURED, dropping every other
      // one left distant pines as bare poles with a few flat sprays)
      const t = (i + r2(0, 0.4)) / tiers;
      const y = Ht * (sp.crownBase + (0.97 - sp.crownBase) * t);
      const reach = (Wd / 2) * Math.pow(1 - t, 0.85) * r2(0.85, 1.05) + 0.35;
      const arms = lod ? Math.max(3, Math.round(5 * (1 - t * 0.35))) : Math.round(r2(sp.limbs[0], sp.limbs[1] + 0.99) * (1 - t * 0.45));
      const az0 = r2(0, Math.PI * 2);
      for (let a = 0; a < arms; a++) {
        const az = az0 + (a / arms) * Math.PI * 2 + r2(-0.25, 0.25);
        const dir: V3 = [Math.sin(az), 0, Math.cos(az)];
        const at = trunk[0];
        const from: V3 = [at[0] + lean[0] * (y / Ht) ** 2, y, at[2] + lean[1] * (y / Ht) ** 2];
        const droop = reach * r2(0.18, 0.32);
        const end: V3 = [from[0] + dir[0] * reach, y - droop, from[2] + dir[2] * reach];
        if (!lod || i % 4 === 0) limbs.push({ pts: curve(from, [from[0] + dir[0] * reach * 0.5, y + droop * 0.1, from[2] + dir[2] * reach * 0.5], end, lod ? 1 : 2), r0: R0 * 0.28 * (1 - t * 0.6), r1: R0 * 0.05, sides: 3 });
        // sprays along the arm, drooping with it; U runs out along the arm so
        // the painted twig does too. They ROLL about the arm, alternately
        // either way, and one more stands on edge along it: a tier of sprays
        // all lying flat read, from the side, as a stack of thin shelves
        // (Philip: "the pine branches seem too flat").
        const along = norm([dir[0], -droop / reach, dir[2]]);
        const clumpC: V3 = [from[0] + dir[0] * reach * 0.5, y, from[2] + dir[2] * reach * 0.5];
        // the distant double: two sprays from the trunk out, rolled opposite
        // ways, so a tier has thickness from any side
        const sprays = lod ? (a % 2 ? 1 : 2) : Math.round(r2(sp.cardsPerClump[0], sp.cardsPerClump[1] + 0.99));
        for (let s = 0; s < sprays; s++) {
          const f = lod ? 0.1 : (s + 0.6) / (sprays + 0.2);
          const p: V3 = [from[0] + dir[0] * reach * f, y - droop * f * f + r2(-0.1, 0.15), from[2] + dir[2] * reach * f];
          const size = Math.max(reach * (lod ? 1.05 : 0.85), Ht * r2(sp.cardSize[0], sp.cardSize[1]) * (1 - t * 0.35));
          const tilt = r2(0.15, 0.45);
          const flat = norm([dir[0] * tilt + r2(-0.15, 0.15), 1, dir[2] * tilt + r2(-0.15, 0.15)]);
          const roll = (s % 2 ? 1 : -1) * r2(0.35, 0.6);
          cards.push({ p, size, face: rotateAbout(flat, along, roll), spin: 0, along, clumpC, clumpR: reach * 0.6 + 0.3 });
        }
        if (!lod) {
          const p: V3 = [from[0] + dir[0] * reach * 0.12, y - droop * 0.05, from[2] + dir[2] * reach * 0.12];
          const up = norm([dir[0] * 0.3, 1, dir[2] * 0.3]);
          cards.push({ p, size: reach * 0.95, face: rotateAbout(up, along, Math.PI / 2 + r2(-0.25, 0.25)), spin: 0, along, clumpC, clumpR: reach * 0.6 + 0.3 });
        }
      }
      // an inner ring between the arms, short and rolled at random, so the
      // core of the tree is foliage and not a view through to the trunk
      if (!lod) {
        const inner = Math.max(2, Math.round(arms * 0.6));
        for (let a = 0; a < inner; a++) {
          const az = az0 + ((a + 0.5) / inner) * Math.PI * 2 + r2(-0.3, 0.3);
          const dir: V3 = [Math.sin(az), 0, Math.cos(az)];
          const r = reach * r2(0.45, 0.6);
          const along = norm([dir[0], -0.25, dir[2]]);
          const from: V3 = [lean[0] * (y / Ht) ** 2, y - Ht * 0.02, lean[1] * (y / Ht) ** 2];
          const flat = norm([dir[0] * 0.3, 1, dir[2] * 0.3]);
          cards.push({ p: from, size: r, face: rotateAbout(flat, along, r2(-0.8, 0.8)), spin: 0, along, clumpC: [from[0] + dir[0] * r * 0.5, y, from[2] + dir[2] * r * 0.5], clumpR: r * 0.6 + 0.3 });
        }
      }
    }
    // the tip: two crossed upright sprays
    for (let c = 0; c < 2; c++) {
      const az = c * Math.PI / 2 + r2(0, 0.5);
      cards.push({ p: [trunk[6][0], Ht * 0.93, trunk[6][2]], size: Ht * 0.12, face: [Math.sin(az), 0, Math.cos(az)], spin: 0, along: [0, 1, 0], clumpC: crownC, clumpR: Ht * 0.08 });
    }
    return { limbs, cards, crownC, crownR };
  }

  // BROAD and BARE: a trunk with a slight lean (or a wander, for the twisted),
  // dividing at trunkFrac into limbs that reach out and up, each carrying two
  // or three sprays; a leader carries on up the middle.
  const lean = [rr(-0.04, 0.04) * Ht, rr(-0.04, 0.04) * Ht];
  const split = sp.trunkFrac * Ht;
  const tw = (sp.twist ?? 0) * Ht, twPh = r2(0, 6.28);
  const trunkAt = (t: number): V3 => [lean[0] * t * t + Math.sin(t * 5 + twPh) * tw * t, t * split - 0.2, lean[1] * t * t + Math.cos(t * 4 + twPh) * tw * t];
  const trunkPts: V3[] = [];
  for (let i = 0; i <= 6; i++) trunkPts.push(trunkAt(i / 6));
  limbs.push({ pts: trunkPts, r0: R0 * 1.25, r1: R0 * 0.72, sides: sides(8) });
  const top = trunkPts[trunkPts.length - 1];
  const leaderTop: V3 = [top[0] + rr(-0.3, 0.3), Ht * 0.86, top[2] + rr(-0.3, 0.3)];
  limbs.push({ pts: curve(top, [top[0], (top[1] + leaderTop[1]) / 2, top[2]], leaderTop, lod ? 2 : 4), r0: R0 * 0.62, r1: R0 * 0.12, sides: sides(6) });

  const crownC: V3 = [top[0], Ht * (sp.crownBase + 1) / 2, top[2]];
  const crownR: V3 = [Wd / 2, Ht * (1 - sp.crownBase) / 2, Wd / 2];
  const clumps: { c: V3; r: number }[] = [{ c: [leaderTop[0], leaderTop[1] - Ht * 0.05, leaderTop[2]], r: Wd * 0.26 }];
  const n = Math.round(rr(sp.limbs[0], sp.limbs[1] + 0.99));
  const az0 = rand() * Math.PI * 2;
  const rise = sp.rise ?? 0.35;
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * Math.PI * 2 + rr(-0.3, 0.3);
    const dir = [Math.sin(az), Math.cos(az)];
    const at = trunkAt(rr(0.75, 1.0));
    const reach = crownR[0] * rr(0.75, 0.95);
    const endY = rr(crownC[1] - crownR[1] * 0.25, crownC[1] + crownR[1] * 0.45);
    const end: V3 = [at[0] + dir[0] * reach, endY, at[2] + dir[1] * reach];
    const mid: V3 = [at[0] + dir[0] * reach * 0.55, at[1] + (endY - at[1]) * rise, at[2] + dir[1] * reach * 0.55];
    const pts = curve(at, mid, end, lod ? 2 : 5);
    limbs.push({ pts, r0: R0 * 0.55, r1: R0 * 0.1, sides: sides(5) });
    clumps.push({ c: end, r: Wd * rr(0.2, 0.26) });
    const sprays = rand() < 0.5 ? 2 : 3;
    for (let s = 0; s < sprays; s++) {
      const from = pts[Math.min(pts.length - 2, lod ? 1 : 2 + s)];
      const saz = az + rr(-0.9, 0.9);
      const sEnd = onShell(crownC, crownR, [Math.sin(saz), rr(-0.1, 0.8), Math.cos(saz)], rr(0.72, 0.92));
      const sMid: V3 = [(from[0] + sEnd[0]) / 2, (from[1] + sEnd[1]) / 2 + 0.2, (from[2] + sEnd[2]) / 2];
      const sprayPts = curve(from, sMid, sEnd, lod ? 1 : 3);
      if (!lod) limbs.push({ pts: sprayPts, r0: R0 * 0.24, r1: R0 * 0.06, sides: 4 });
      clumps.push({ c: sEnd, r: Wd * rr(0.16, 0.22) });
      // a bare tree carries its twigs where the leaves would have been
      if (sp.form === "bare" && !lod) {
        for (let t = 0; t < 3; t++) {
          const ta = saz + r2(-1.2, 1.2), tl = Wd * r2(0.08, 0.16);
          const tEnd: V3 = [sEnd[0] + Math.sin(ta) * tl, sEnd[1] + r2(0.2, 1.0) * tl, sEnd[2] + Math.cos(ta) * tl];
          limbs.push({ pts: [sprayPts[Math.max(0, sprayPts.length - 2)], sEnd, tEnd], r0: R0 * 0.07, r1: R0 * 0.02, sides: 3 });
        }
      }
    }
  }

  if (sp.form === "broad") for (const cl of clumps) {
    const count = lod ? 2 + (cl.r > Wd * 0.21 ? 1 : 0) : Math.round(rr(sp.cardsPerClump[0], sp.cardsPerClump[1] + 0.99));
    for (let i = 0; i < count; i++) {
      const d = norm([rr(-1, 1), rr(-0.4, 1), rr(-1, 1)]);
      // the distant double: a few big crossed cards per clump instead of one
      // flat one, so the crown has no see-through side
      const k = lod ? 0.45 : 1;
      const p: V3 = [cl.c[0] + d[0] * cl.r * rr(0.35, 1) * k, cl.c[1] + d[1] * cl.r * rr(0.35, 1) * k, cl.c[2] + d[2] * cl.r * rr(0.35, 1) * k];
      const size = Ht * rr(sp.cardSize[0], sp.cardSize[1]) * (lod ? 1.65 : 1);
      // face roughly out of the clump, tipped at random so neighbours cross
      const face = lod ? norm([d[0] * (i ? 1 : 0.3), i ? 0.5 : 1, d[2] * (i ? 1 : 0.3)]) : norm([d[0] + rr(-0.6, 0.6), d[1] * 0.6 + rr(-0.3, 0.6), d[2] + rr(-0.6, 0.6)]);
      cards.push({ p, size, face, spin: rr(0, Math.PI * 2), clumpC: cl.c, clumpR: cl.r });
    }
  }
  // a distant broad tree also needs some cards standing up, or seen from the
  // side its few flat cards vanish edge-on
  if (lod && sp.form === "broad") for (let i = 0; i < 5; i++) {
    const az = (i / 5) * Math.PI;
    cards.push({ p: crownC, size: Math.max(crownR[0], crownR[1]) * 1.9, face: [Math.sin(az), 0.25, Math.cos(az)], spin: 0, clumpC: crownC, clumpR: crownR[0] });
  }
  return { limbs, cards, crownC, crownR };
}

function buildMesh(file: string, scene: Scene, lod: boolean, tint: string | null, snow: boolean): Mesh | null {
  const k = KIT[file];
  if (!k) return null;
  const { species: sp, height: Ht } = k;
  const { limbs, cards, crownC, crownR } = plan(k, lod);

  // THE WOOD: tubes with parallel-transported rings. UVs tile the bark about
  // every 1.4m along and twice round.
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const upOf = (y: number) => Math.max(0, Math.min(1, y / Ht));
  for (const L of limbs) tube(L, pos, uv, col, idx, upOf, Ht);
  const barkVerts = pos.length / 3;
  const woodNormals: number[] = [];
  VertexData.ComputeNormals(pos, idx, woodNormals);
  nrm.push(...woodNormals);
  const barkIdx = idx.length;

  // THE CANOPY: each card's lighting normal out of the crown, out of its
  // clump, and up; occlusion under and inside the crown in vertex colour.
  for (const c of cards) {
    let U: V3, V: V3;
    if (c.along) {
      // a conifer spray: U along its arm, so the painted twig runs out along it
      U = norm(c.along);
      V = norm(cross(c.face, U));
      if (!isFinite(V[0])) V = [0, 0, 1];
    } else {
      let u = norm(cross(c.face, [0, 1, 0]));
      if (!isFinite(u[0]) || Math.hypot(...u) < 0.5) u = [1, 0, 0];
      const v = cross(u, c.face);
      const cs = Math.cos(c.spin), sn = Math.sin(c.spin);
      U = [u[0] * cs + v[0] * sn, u[1] * cs + v[1] * sn, u[2] * cs + v[2] * sn];
      V = [v[0] * cs - u[0] * sn, v[1] * cs - u[1] * sn, v[2] * cs - u[2] * sn];
    }
    const base = pos.length / 3;
    // a conifer spray starts at its arm (u from 0), a broadleaf card is centred
    const corners: [number, number][] = c.along ? [[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]] : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (const [a, b] of corners) {
      const q: V3 = [c.p[0] + (U[0] * a + V[0] * b) * c.size, c.p[1] + (U[1] * a + V[1] * b) * c.size, c.p[2] + (U[2] * a + V[2] * b) * c.size];
      pos.push(q[0], q[1], q[2]);
      const oc: V3 = [(q[0] - crownC[0]) / crownR[0], (q[1] - crownC[1]) / crownR[1], (q[2] - crownC[2]) / crownR[2]];
      const ol: V3 = [(q[0] - c.clumpC[0]) / c.clumpR, (q[1] - c.clumpC[1]) / c.clumpR, (q[2] - c.clumpC[2]) / c.clumpR];
      const N = norm([oc[0] * 0.8 + ol[0] * 0.45, oc[1] * 0.8 + ol[1] * 0.45 + 0.55, oc[2] * 0.8 + ol[2] * 0.45]);
      nrm.push(N[0], N[1], N[2]);
      uv.push(c.along ? a : a + 0.5, b + 0.5);
      const yRel = Math.max(0, Math.min(1, (q[1] - (crownC[1] - crownR[1])) / (2 * crownR[1])));
      const outward = Math.min(1, Math.hypot(oc[0], oc[1], oc[2]));
      const ao = Math.max(c.along ? 0.6 : 0.42, Math.min(1.05, 0.38 + yRel * 0.42 + outward * 0.3));
      col.push(ao, ao, ao, upOf(q[1]));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const name = `gt${lod ? "lod" : ""}_${file}${tint ? `|${tint}` : ""}${snow ? "|snow" : ""}`;
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.colors = col; vd.indices = idx;
  vd.applyToMesh(mesh);
  mesh.hasVertexAlpha = false;   // the alpha channel is the sway's height fraction
  const total = pos.length / 3;
  const pair = speciesMaterials(scene, sp, tint, snow);
  if (pair.canopy) {
    mesh.subMeshes = [];
    new SubMesh(0, 0, total, 0, barkIdx, mesh);
    new SubMesh(1, 0, total, barkIdx, idx.length - barkIdx, mesh);
  }
  applyMaterials(mesh, pair, `${sp.key}|${tint ?? ""}|${snow}`, scene);
  mesh.isPickable = false;
  mesh.metadata = { generatedTree: { file, species: sp.key, lod, tint, snow, vertices: total, barkVertices: barkVerts, cards: cards.length } };
  return mesh;
}

// ---------- the public face: templates, variants, LOD ----------
// The finishing a loaded kit template gets (models.ts does the same): hidden
// until it has instances, a shadow caster, flagged painted so the kit colour
// pipeline (tintInstances, styleFoliage) leaves it alone.
let finishHook: ((m: Mesh) => void) | null = null;
export function setTreeFinish(f: (m: Mesh) => void): void { finishHook = f; }
// The scene's foliage image processing (scene.ts neutralIPC: neutral exposure
// and contrast, the scene's tone curve and saturation). The approved
// broadleaf was rendered with it -- it reached the trees through styleFoliage,
// by name -- so every generated tree now takes it deliberately instead.
let treeIPC: any = null;
export function setTreeImageProcessing(ipc: any): void { treeIPC = ipc; }

export function buildGeneratedTree(file: string, scene: Scene): Mesh | null {
  return buildVariant(file, scene, null, false);
}

// A tinted (and/or later snowed) template of a generated tree: its own
// geometry and its own materials, built fresh rather than cloned -- a clone
// would share the plugin's colours and wind clock by accident or lose them.
export function generatedTreeVariant(file: string, scene: Scene, key: string): Mesh | null {
  // tintedTemplate keys: "#rrggbb", "#rrggbb|flat", or "plain" (a snowy
  // placement with no tint, which only needs a template of its own)
  const hex = key.split("|")[0];
  return buildVariant(file, scene, hex.startsWith("#") ? hex : null, false);
}

function buildVariant(file: string, scene: Scene, tint: string | null, snow: boolean): Mesh | null {
  if (FOLIAGE[file]) {
    const m = FOLIAGE[file](scene, tint, snow);
    if (!m) return null;
    m.isVisible = false;
    (m as any).__paintedArt = true;
    (m as any).__generatedTree = true;
    finishHook?.(m);
    const bb0 = m.getBoundingInfo().boundingBox;
    m.metadata = { ...(m.metadata || {}), generatedTree: { file, tint, snow, prop: true }, baseCenter: bb0.center.clone(), baseExtend: bb0.extendSize.clone() };
    return m;
  }
  const full = buildMesh(file, scene, false, tint, snow);
  if (!full) return null;
  const lod = buildMesh(file, scene, true, tint, snow)!;
  for (const m of [full, lod]) {
    m.isVisible = false;
    (m as any).__paintedArt = true;
    (m as any).__generatedTree = true;
    finishHook?.(m);
    const bb0 = m.getBoundingInfo().boundingBox;
    m.metadata = { ...(m.metadata || {}), baseCenter: bb0.center.clone(), baseExtend: bb0.extendSize.clone() };
  }
  (full as any).__treeLod = lod;
  return full;
}

// addSnowCaps on a generated tree: swap its (and its double's) materials for
// the snowy set. Every generated template here is already its own (a snowy
// placement always goes through tintedTemplate first), so nothing shared is
// touched.
export function snowGeneratedTree(template: Mesh): void {
  const meta = template.metadata?.generatedTree;
  if (!meta || meta.snow) return;
  if (meta.prop) {
    // a registered plant: build its snowy twin (same seed, same geometry and
    // submesh layout) and take its materials
    const twin = FOLIAGE[meta.file]?.(template.getScene(), meta.tint, true);
    if (twin) { template.material = twin.material; twin.dispose(false, false); meta.snow = true; }
    return;
  }
  const k = KIT[meta.file];
  const scene = template.getScene();
  const pair = speciesMaterials(scene, k.species, meta.tint, true);
  for (const m of [template, (template as any).__treeLod as Mesh | undefined]) {
    if (!m) continue;
    applyMaterials(m, pair, `${k.species.key}|${meta.tint ?? ""}|true`, scene);
    m.metadata.generatedTree.snow = true;
  }
}

// THE LOD SPLIT. A generated template keeps the full list of its instances
// here; every LOD_STEP metres the player moves, each list is split into the
// near ones (the full tree) and the far ones (its double), and the two
// buffers rewritten. A zone holds a few hundred trees, so the split is a few
// hundred distance tests.
const LOD_NEAR = 70, LOD_STEP = 10;
interface TreeSet { full: Mesh; lod: Mesh; data: Float32Array; n: number }
interface LodState { scene: Scene; sets: TreeSet[]; byMesh: Map<Mesh, TreeSet>; px: number; pz: number; dirty: boolean }
let lodState: LodState | null = null;
function stateFor(scene: Scene): LodState {
  if (!lodState || lodState.scene !== scene) {
    const state: LodState = { scene, sets: [], byMesh: new Map(), px: 1e9, pz: 1e9, dirty: true };
    lodState = state;
    scene.onDisposeObservable.addOnce(() => { if (lodState === state) lodState = null; });
  }
  return lodState;
}

// models.ts addInstances routes a generated tree here instead of adding to
// its thin instances directly.
export function addTreeInstances(t: Mesh, mats: Matrix[]): void {
  // A late model load must not recreate the LOD owner after zone teardown.
  if (t.getScene().isDisposed) return;
  const st = stateFor(t.getScene());
  let set = st.byMesh.get(t);
  if (!set) {
    set = { full: t, lod: (t as any).__treeLod, data: new Float32Array(Math.max(16, mats.length) * 16), n: 0 };
    st.byMesh.set(t, set);
    st.sets.push(set);
  }
  if ((set.n + mats.length) * 16 > set.data.length) {
    const d = new Float32Array(Math.max((set.n + mats.length) * 16, set.data.length * 2));
    d.set(set.data.subarray(0, set.n * 16));
    set.data = d;
  }
  for (const m of mats) { m.copyToArray(set.data, set.n * 16); set.n++; }
  st.dirty = true;
  // a first split at once, around wherever the player was last seen, so the
  // trees are never missing for a frame
  splitSet(set, st.px === 1e9 ? 0 : st.px, st.pz === 1e9 ? 0 : st.pz);
}

export function updateTrees(scene: Scene, px: number, pz: number): void {
  const st = lodState;
  if (!st || st.scene !== scene) return;
  if (!st.dirty && Math.hypot(px - st.px, pz - st.pz) < LOD_STEP) return;
  st.px = px; st.pz = pz; st.dirty = false;
  for (const s of st.sets) splitSet(s, px, pz);
}

function splitSet(s: TreeSet, px: number, pz: number): void {
  if (s.full.isDisposed()) return;
  const near: number[] = [], far: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const x = s.data[i * 16 + 12], z = s.data[i * 16 + 14];
    ((x - px) ** 2 + (z - pz) ** 2 < LOD_NEAR * LOD_NEAR ? near : far).push(i);
  }
  write(s.full, s.data, near);
  if (s.lod) write(s.lod, s.data, far);
}
function write(mesh: Mesh, data: Float32Array, which: number[]): void {
  if (!which.length) { mesh.isVisible = false; mesh.thinInstanceCount = 0; return; }
  const buf = new Float32Array(which.length * 16);
  which.forEach((i, j) => buf.set(data.subarray(i * 16, i * 16 + 16), j * 16));
  mesh.thinInstanceSetBuffer("matrix", buf, 16, false);
  mesh.isVisible = true;
}

// Test hook: what the generator makes for a kit file (no scene needed).
export function treeStats(file: string): { species: string; limbs: number; cards: number; lodCards: number } | null {
  const k = KIT[file];
  if (!k) return null;
  return { species: k.species.key, limbs: plan(k, false).limbs.length, cards: plan(k, false).cards.length, lodCards: plan(k, true).cards.length };
}

// ---------- geometry helpers ----------
function tube(L: Limb, pos: number[], uv: number[], col: number[], idx: number[], upOf: (y: number) => number, Ht: number): void {
  const pts = L.pts, n = pts.length;
  if (n < 2) return;
  let along = 0;
  let t0 = norm(sub(pts[1], pts[0]));
  let nA = norm(cross(t0, Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const base = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    // parallel transport: remove the component of the old normal along the new tangent
    const dp = dot(nA, t);
    nA = norm([nA[0] - t[0] * dp, nA[1] - t[1] * dp, nA[2] - t[2] * dp]);
    const bA = cross(t, nA);
    const f = i / (n - 1);
    // the trunk's foot flares a little into the ground
    const flare = L.sides >= 6 && i === 0 && pts[0][1] < 0 ? 1.35 : 1;
    const r = (L.r0 + (L.r1 - L.r0) * Math.pow(f, 0.8)) * flare;
    if (i > 0) along += Math.hypot(...(sub(pts[i], pts[i - 1]) as [number, number, number]));
    for (let s = 0; s <= L.sides; s++) {
      const a = (s / L.sides) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pos.push(pts[i][0] + (nA[0] * c + bA[0] * sn) * r, pts[i][1] + (nA[1] * c + bA[1] * sn) * r, pts[i][2] + (nA[2] * c + bA[2] * sn) * r);
      uv.push((s / L.sides) * 2, along / 1.4);
      const y = pts[i][1];
      const ao = 0.85 + 0.15 * Math.min(1, Math.max(0, y / (Ht * 0.25)));
      col.push(ao, ao, ao, upOf(y));
    }
  }
  const ring = L.sides + 1;
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < L.sides; s++) {
    const a = base + i * ring + s, b = a + ring;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}

function curve(a: V3, b: V3, c: V3, steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]);
  }
  return out;
}
function onShell(c: V3, r: V3, d: V3, k: number): V3 {
  const n = norm(d);
  return [c[0] + n[0] * r[0] * k, c[1] + n[1] * r[1] * k, c[2] + n[2] * r[2] * k];
}
// Rodrigues: v turned by `ang` about the unit axis k
function rotateAbout(v: V3, k: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(k, v), x = cross(k, v);
  return norm([v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]);
}
function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: V3): V3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
