// The Great Granary's painted surfaces, all on ONE canvas (2048 x 2048), so
// every picture in the building costs two draws in all: the windows (unlit:
// the day outside, which no lamp warms) and the boards (lit: the forty tower
// numbers, the plan of the towers, the count, the signs). Painted at build
// time; no image files (the project paints what it can, as the Lodge does).
//
// - THE NUMBERS: I to XL, one oak board per tower. The old build made forty
//   DynamicTextures and forty materials for them; this is one region.
// - THE SKY: the clerestory and lantern panes. High windows see only sky, a
//   warm afternoon with cloud, painted at a level the tone map keeps below
//   white (the old panes were emissive white and blew out).
// - THE PLAINS: the low windows (the office, the mill, the winnowing floor):
//   the Granary Plains in harvest, wheat to a low horizon under the same sky,
//   the harvester sentinels still reaping far off.
// - THE PLAN: the forty towers as the Restoration drew them, numbered, the
//   lane and the engine, "Phase five", behind the Granary-Master's desk.
// - THE COUNT: columns of tally gates under "The Count", in the Count Floor and
//   the Ledger Hall. THE SIGNS: painted boards over doors.
import { Color3, DynamicTexture, Mesh, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';
import { craftLettering } from './craft-lettering';
import { hash } from './greatgranary_parts';

export const ATLAS = 2048;
export interface Rect { x: number; y: number; w: number; h: number }
export const REGION = {
  number: (k: number): Rect => ({ x: (k % 8) * 128, y: Math.floor(k / 8) * 64, w: 128, h: 64 }),
  sky: { x: 1024, y: 0, w: 256, h: 512 } as Rect,
  skyShade: { x: 1280, y: 0, w: 256, h: 512 } as Rect,
  plains: { x: 1536, y: 0, w: 512, h: 1024 } as Rect,
  plan: { x: 0, y: 336, w: 1024, h: 640 } as Rect,
  count: { x: 0, y: 992, w: 1024, h: 320 } as Rect,
  tally: { x: 0, y: 1328, w: 1024, h: 256 } as Rect,
  sign: (n: number): Rect => ({ x: 1024, y: 1040 + n * 104, w: 1024, h: 96 }),
};
export const SIGNS = ['The Mill', 'Winnowing', 'The Count is kept', 'By order of the Master', 'Phase five', 'Weighbridge', 'The Ledgers'];

export function roman(n: number): string {
  let s = '';
  for (const [v, t] of [[40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) while (n >= v) { s += t; n -= v; }
  return s;
}
function rng(seed: number): () => number { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function board(ctx: CanvasRenderingContext2D, r: Rect, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * k / 4 + hash(r.x + k) * 3); ctx.lineTo(r.x + r.w, r.y + r.h * k / 4 + hash(r.y + k) * 3); ctx.stroke(); }
}

function paintSky(ctx: CanvasRenderingContext2D, r: Rect, seed: number, shade: boolean): void {
  const { x, y, w, h } = r, R = rng(seed);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  // the sun side is warm and bright; the shade side a cooler, deeper blue
  if (shade) { g.addColorStop(0, '#5f86a8'); g.addColorStop(0.7, '#8eaec0'); g.addColorStop(1, '#b6c4c4'); }
  else { g.addColorStop(0, '#86a8c0'); g.addColorStop(0.55, '#c8d4cc'); g.addColorStop(1, '#efdcb0'); }
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  for (let k = 0; k < 9; k++) {
    const cy = y + h * (0.12 + R() * 0.7), cx = x + R() * w, cw = w * (0.4 + R() * 0.6);
    ctx.fillStyle = shade ? `rgba(214,222,226,${0.22 + R() * 0.25})` : `rgba(255,246,226,${0.3 + R() * 0.35})`;
    for (let b = 0; b < 5; b++) { ctx.beginPath(); ctx.ellipse(cx + (R() - 0.5) * cw * 0.6, cy + (R() - 0.5) * 14, cw * (0.2 + R() * 0.2), 10 + R() * 14, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function paintPlains(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, w, h } = r, R = rng(7);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  paintSky(ctx, { x, y, w, h: h * 0.6 }, 11, false);
  const hy = y + h * 0.56;
  // the far rise, blue with distance, then the gold of the plains
  ctx.fillStyle = '#9aa69c'; ctx.beginPath(); ctx.moveTo(x, hy);
  for (let k = 0; k <= 12; k++) ctx.lineTo(x + w * k / 12, hy - 10 - 14 * Math.sin(k * 0.9 + 1) * Math.sin(k * 0.37));
  ctx.lineTo(x + w, hy + 4); ctx.lineTo(x, hy + 4); ctx.fill();
  const field = ctx.createLinearGradient(0, hy, 0, y + h);
  field.addColorStop(0, '#d8bc72'); field.addColorStop(0.3, '#c99e4c'); field.addColorStop(1, '#8e6a2c');
  ctx.fillStyle = field; ctx.fillRect(x, hy, w, y + h - hy);
  // field strips running to the horizon, and the rows within them
  for (let k = -8; k <= 8; k++) {
    ctx.strokeStyle = `rgba(120,86,34,${0.25 + R() * 0.2})`; ctx.lineWidth = 1 + Math.abs(k) * 0.4;
    ctx.beginPath(); ctx.moveTo(x + w / 2 + k * 6, hy); ctx.lineTo(x + w / 2 + k * w * 0.22, y + h); ctx.stroke();
  }
  for (let k = 0; k < 18; k++) {
    const t = (k / 18) ** 1.8, yy = hy + t * (y + h - hy);
    ctx.strokeStyle = `rgba(248,226,150,${0.12 + 0.2 * t})`; ctx.lineWidth = 1 + t * 3;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + (R() - 0.5) * 4); ctx.stroke();
  }
  // the harvester sentinels, far off, still reaping: dark figures and their swaths
  for (let k = 0; k < 4; k++) {
    const sx = x + w * (0.15 + 0.22 * k + R() * 0.05), sy = hy + 10 + R() * 26, s = 5 + (sy - hy) * 0.18;
    ctx.fillStyle = 'rgba(70,58,44,0.85)';
    ctx.fillRect(sx - s * 0.35, sy - s * 2.2, s * 0.7, s * 1.6); ctx.fillRect(sx - s * 0.2, sy - s * 2.7, s * 0.4, s * 0.5);
    ctx.strokeStyle = 'rgba(70,58,44,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx + s * 0.35, sy - s * 1.6); ctx.lineTo(sx + s * 1.6, sy - s * 0.4); ctx.stroke();
    ctx.fillStyle = 'rgba(176,140,70,0.6)'; ctx.fillRect(sx - s * 6, sy - 1, s * 6, 3);
  }
  // a stook or two in the foreground
  for (let k = 0; k < 6; k++) {
    const sx = x + R() * w, sy = y + h * (0.72 + R() * 0.22), s = 10 + (sy - hy) * 0.1;
    ctx.fillStyle = 'rgba(150,108,44,0.9)'; ctx.beginPath(); ctx.moveTo(sx - s, sy); ctx.lineTo(sx, sy - s * 2); ctx.lineTo(sx + s, sy); ctx.fill();
    ctx.fillStyle = 'rgba(232,200,120,0.6)'; ctx.beginPath(); ctx.moveTo(sx - s * 0.2, sy); ctx.lineTo(sx, sy - s * 2); ctx.lineTo(sx + s * 0.5, sy); ctx.fill();
  }
  ctx.restore();
}

function paintPlan(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, w, h } = r;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#e2d2a8'); g.addColorStop(1, '#cdb88a');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const R = rng(5);
  for (let k = 0; k < 300; k++) { ctx.fillStyle = `rgba(120,90,50,${R() * 0.08})`; ctx.fillRect(x + R() * w, y + R() * h, 2 + R() * 8, 2 + R() * 8); }
  ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 6; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24); ctx.lineWidth = 2; ctx.strokeRect(x + 26, y + 26, w - 52, h - 52);
  // the hall laid on its side: south (the doors) at the left, the office at the right
  const hx0 = x + 90, hx1 = x + w - 90, hy0 = y + 150, hy1 = y + h - 90, sx = (hx1 - hx0) / 140, sz = (hy1 - hy0) / 76;
  ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 4; ctx.strokeRect(hx0, hy0, hx1 - hx0, hy1 - hy0);
  ctx.fillStyle = 'rgba(180,140,70,0.35)'; ctx.fillRect(hx0, hy0 + (38 - 14) * sz, hx1 - hx0, 28 * sz);
  const rows = [6, 18, 30, 42, 54, 82, 94, 106, 118, 130], cols = [-30, -18, 18, 30];
  let n = 0;
  for (const zc of rows) for (const xc of cols) {
    const px = hx0 + (zc + 2) * sx, py = hy0 + (38 - xc) * sz;
    n++;
    ctx.fillStyle = '#c8a050'; ctx.beginPath(); ctx.arc(px, py, 3.3 * sz, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(px - 26, py - 12); craftLettering(ctx, roman(n), 52, 24, '#2a1c10'); ctx.restore();
  }
  // the engine at the crossing, its spokes out to the towers
  const ex = hx0 + 64 * sx, ey = hy0 + 38 * sz;
  ctx.fillStyle = '#7a2a1c'; ctx.fillRect(ex - 4 * sx, ey - 6 * sz, 8 * sx, 12 * sz);
  ctx.strokeStyle = 'rgba(122,42,28,0.6)'; ctx.lineWidth = 2;
  for (const xc of [-18, 18]) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx0 + 2 * sx, hy0 + (38 - xc) * sz); ctx.moveTo(ex, ey); ctx.lineTo(hx1 - 2 * sx, hy0 + (38 - xc) * sz); ctx.stroke(); }
  ctx.fillStyle = 'rgba(214,200,160,0.95)'; ctx.fillRect(x + w * 0.18, y + 40, w * 0.64, 54);
  ctx.save(); ctx.translate(x + w * 0.18, y + 40); craftLettering(ctx, 'The Forty Towers · Phase Five', w * 0.64, 54, '#3a2a18'); ctx.restore();
  ctx.save(); ctx.translate(x + w * 0.3, y + 98); craftLettering(ctx, 'Flour for the Capital', w * 0.4, 34, '#6a4a28'); ctx.restore();
  ctx.restore();
}

function paintCount(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, w } = r;
  board(ctx, r, '#4a3624', '#33241a');
  ctx.save(); ctx.translate(x, y + 6); craftLettering(ctx, 'The Count', w, 70, '#e6cf96'); ctx.restore();
  // columns of tally gates: four strokes and the bar, in chalk
  ctx.strokeStyle = 'rgba(238,226,196,0.85)'; ctx.lineWidth = 3;
  const R = rng(13);
  for (let c = 0; c < 9; c++) for (let row = 0; row < 5; row++) {
    const gx = x + 40 + c * 106, gy = y + 96 + row * 42;
    if (R() < 0.08) continue;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 12, gy); ctx.lineTo(gx + k * 12 + 2, gy + 30); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(gx - 6, gy + 26); ctx.lineTo(gx + 46, gy + 4); ctx.stroke();
  }
}

function paintTally(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, h } = r;
  board(ctx, r, '#3e2c1e', '#2e2016');
  const R = rng(17);
  ctx.strokeStyle = 'rgba(232,220,190,0.8)'; ctx.lineWidth = 2.5;
  for (let row = 0; row < 5; row++) {
    const gy = y + 20 + row * 46;
    ctx.save(); ctx.translate(x + 8, gy); craftLettering(ctx, roman(row * 8 + 1) + '-' + roman(row * 8 + 8), 120, 30, '#d8c08a'); ctx.restore();
    for (let c = 0; c < 14; c++) {
      if (R() < 0.15) continue;
      const gx = x + 150 + c * 61;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 9, gy); ctx.lineTo(gx + k * 9 + 1, gy + 28); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(gx - 4, gy + 24); ctx.lineTo(gx + 34, gy + 4); ctx.stroke();
    }
  }
  void h;
}

export interface GranaryAtlas { tex: DynamicTexture; lit: StandardMaterial; unlit: StandardMaterial }

export function granaryAtlas(scene: Scene): GranaryAtlas {
  const tex = new DynamicTexture('gg_painted_atlas', { width: ATLAS, height: ATLAS }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#2a2018'; ctx.fillRect(0, 0, ATLAS, ATLAS);
  for (let k = 0; k < 40; k++) {
    const r = REGION.number(k);
    board(ctx, r, '#5a3a24', '#432a1a');
    ctx.save(); ctx.translate(r.x, r.y); craftLettering(ctx, roman(k + 1), r.w, r.h, '#ecd6a2'); ctx.restore();
  }
  paintSky(ctx, REGION.sky, 3, false);
  paintSky(ctx, REGION.skyShade, 9, true);
  paintPlains(ctx, REGION.plains);
  paintPlan(ctx, REGION.plan);
  paintCount(ctx, REGION.count);
  paintTally(ctx, REGION.tally);
  SIGNS.forEach((s, n) => {
    const r = REGION.sign(n);
    board(ctx, r, '#3a2a1c', '#2a1d12');
    ctx.save(); ctx.translate(r.x, r.y); craftLettering(ctx, s, r.w, r.h, '#dcbf86'); ctx.restore();
  });
  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  const lit = new StandardMaterial('gg_painted_lit', scene);
  lit.diffuseTexture = tex; lit.specularColor = new Color3(0.04, 0.04, 0.04); lit.backFaceCulling = false;
  lit.maxSimultaneousLights = 6;
  // the day outside: unlit. MEASURED (the Lodge's first look): a diffuseTexture
  // under disableLighting draws black; the texture as the emissive term is the
  // picture. `level` keeps the brightest sky under the tone map's white.
  const unlit = new StandardMaterial('gg_painted_day', scene);
  unlit.emissiveTexture = tex; unlit.disableLighting = true; unlit.diffuseColor = Color3.Black();
  unlit.emissiveColor = Color3.Black(); unlit.specularColor = Color3.Black(); unlit.backFaceCulling = false;
  return { tex, lit, unlit };
}

/** Quads collected into one mesh: each a picture from the atlas, hung at a
 * centre, facing `n` (toward the viewer, on the ground plane), w x h metres. */
export class PaintedQuads {
  private p: number[] = []; private nrm: number[] = []; private uv: number[] = []; private idx: number[] = [];
  add(c: [number, number, number], n: [number, number], w: number, h: number, r: Rect): void {
    // the viewer looks along -n; their right is (-n.z, n.x)... as the Lodge's
    const rx = -n[1], rz = n[0], base = this.p.length / 3;
    const u0 = r.x / ATLAS, u1 = (r.x + r.w) / ATLAS, vT = 1 - r.y / ATLAS, vB = 1 - (r.y + r.h) / ATLAS;
    const corners: [number, number, number, number][] = [[-1, -1, u0, vB], [1, -1, u1, vB], [1, 1, u1, vT], [-1, 1, u0, vT]];
    for (const [sx, sy, u, v] of corners) {
      this.p.push(c[0] + rx * sx * w / 2, c[1] + sy * h / 2, c[2] + rz * sx * w / 2);
      this.nrm.push(n[0], 0, n[1]); this.uv.push(u, v);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  get empty(): boolean { return this.idx.length === 0; }
  mesh(name: string, scene: Scene, mat: StandardMaterial): Mesh {
    const m = new Mesh(name, scene), vd = new VertexData();
    vd.positions = this.p; vd.normals = this.nrm; vd.uvs = this.uv; vd.indices = this.idx;
    vd.applyToMesh(m); m.material = mat; m.freezeWorldMatrix();
    // pickable: the audit's rays must stop at a pane, not pass through the hole
    m.isPickable = true;
    return m;
  }
}
