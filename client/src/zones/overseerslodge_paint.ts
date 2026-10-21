// The Overseer's Lodge: everything painted, on ONE canvas (2048 x 2048), so
// every painted surface in the house costs two draws in all -- the windows
// (unlit: the night outside) and the boards (lit by the lamps: the Rota, the
// plantation survey, the signs). Painted at build time on a 2D canvas; no
// image files (the project paints what it can: icons.ts, the lettering).
//
// - THE WINDOWS: the plantation at night through leaded glass. The house is
//   enclosed and there is no bake of the Timber Estates for it (BACKDROP.md),
//   so a window is an opaque pane painted with what the household would have
//   seen the night it left: the moon up behind the clouds, the far ridge, and
//   the felled estate's replanted imperial rows, every crown in its line.
// - THE ROTA: three hundred years of shifts across the Rota Hall's north wall,
//   every column marked absent, the header in the household's green.
// - THE SURVEY: the Estates as the empire drew them, plots in rows, the lodge
//   in red at the middle; it hangs behind the Overseer's desk.
// - THE SIGNS: painted boards over the doors, in craft-lettering's capitals.
import { Color3, DynamicTexture, Mesh, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';
import { craftLettering } from './craft-lettering';
import { hash } from './overseerslodge_dress';

export const ATLAS = 2048;
export interface Rect { x: number; y: number; w: number; h: number }
export const REGION = {
  rota: { x: 0, y: 0, w: 2048, h: 224 } as Rect,
  survey: { x: 0, y: 240, w: 1024, h: 512 } as Rect,
  window: { x: 1040, y: 240, w: 512, h: 768 } as Rect,
  windowWide: { x: 1568, y: 240, w: 480, h: 480 } as Rect,
  sign: (n: number): Rect => ({ x: 0, y: 768 + n * 136, w: 1024, h: 128 }),
};
export const SIGNS = ['Keep well', 'Clerks’ Hall', 'The Tally', 'By appointment', 'Absent · Excused', 'Lock-up', 'Second shift'];

function rng(seed: number): () => number { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function paintWindow(ctx: CanvasRenderingContext2D, r: Rect, seed: number): void {
  const { x, y, w, h } = r, R = rng(seed);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const sky = ctx.createLinearGradient(0, y, 0, y + h * 0.66);
  sky.addColorStop(0, '#0e1a30'); sky.addColorStop(0.5, '#25406a'); sky.addColorStop(1, '#6f97aa');
  ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);
  // a moon behind thin cloud, high in one corner, its glow wide
  const mx = x + w * (seed % 2 ? 0.72 : 0.28), my = y + h * 0.2;
  const glow = ctx.createRadialGradient(mx, my, 4, mx, my, w * 0.6);
  glow.addColorStop(0, 'rgba(220,232,240,0.85)'); glow.addColorStop(0.08, 'rgba(170,196,214,0.45)'); glow.addColorStop(1, 'rgba(60,90,120,0)');
  ctx.fillStyle = glow; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e8eef0'; ctx.beginPath(); ctx.arc(mx, my, w * 0.045, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(20,34,52,${0.25 + R() * 0.3})`;
    const cy = y + h * (0.1 + R() * 0.35), cw = w * (0.5 + R() * 0.8);
    ctx.beginPath(); ctx.ellipse(x + R() * w, cy, cw / 2, h * 0.018 + R() * h * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let k = 0; k < 70; k++) { ctx.fillStyle = `rgba(220,230,255,${0.3 + R() * 0.6})`; ctx.fillRect(x + R() * w, y + R() * h * 0.45, 1.5, 1.5); }
  // the far ridge, then the mist over the estate
  ctx.fillStyle = '#1c2e3c'; ctx.beginPath(); ctx.moveTo(x, y + h * 0.66);
  for (let k = 0; k <= 16; k++) ctx.lineTo(x + w * k / 16, y + h * (0.6 + 0.04 * Math.sin(k * 1.3 + seed) + R() * 0.02));
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
  const mist = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h * 0.74);
  mist.addColorStop(0, 'rgba(90,120,134,0)'); mist.addColorStop(0.5, 'rgba(90,120,134,0.45)'); mist.addColorStop(1, 'rgba(90,120,134,0)');
  ctx.fillStyle = mist; ctx.fillRect(x, y + h * 0.58, w, h * 0.18);
  // the replanted rows: crowns in lines, nearer rows larger and darker, a
  // moonlit rim on each crown's upper side
  for (let row = 0; row < 7; row++) {
    const t = row / 6, ry = y + h * (0.68 + 0.3 * t * t), size = w * (0.012 + 0.06 * t * t), gap = size * 2.4;
    const off = (row * 37 + seed * 11) % gap;
    for (let cx = x - gap + off; cx < x + w + gap; cx += gap) {
      ctx.fillStyle = `rgb(${14 + 22 * (1 - t)},${24 + 30 * (1 - t)},${26 + 36 * (1 - t)})`;
      ctx.beginPath(); ctx.ellipse(cx, ry - size * 0.8, size, size * 1.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - size * 0.12, ry - size * 0.2, size * 0.24, size * 0.6);
      ctx.strokeStyle = `rgba(170,200,210,${0.25 + 0.3 * (1 - t)})`; ctx.lineWidth = Math.max(1, size * 0.12);
      ctx.beginPath(); ctx.arc(cx, ry - size * 0.8, size * 0.92, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
    }
  }
  // the leading: diamond quarries, a little irregular, a sheen down the glass
  ctx.strokeStyle = 'rgba(14,14,12,0.92)'; ctx.lineWidth = 3.2;
  const q = w / 6;
  for (let k = -12; k <= 12; k++) {
    ctx.beginPath(); ctx.moveTo(x + k * q, y); ctx.lineTo(x + k * q + h * 0.75, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - k * q, y); ctx.lineTo(x + w - k * q - h * 0.75, y + h); ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.0)'); sheen.addColorStop(0.42, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
  // the window's own frame shadow round the edge
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 10; ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  ctx.restore();
}

function paintRota(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, w, h } = r, R = rng(77);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // aged paper, darker toward the ends of the roll
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#9c8a62'); g.addColorStop(0.06, '#d4c49a'); g.addColorStop(0.94, '#d4c49a'); g.addColorStop(1, '#9c8a62');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  for (let k = 0; k < 400; k++) { ctx.fillStyle = `rgba(110,80,40,${R() * 0.08})`; ctx.fillRect(x + R() * w, y + R() * h, 2 + R() * 30, 1 + R() * 6); }
  // the header band in green with the title
  ctx.fillStyle = '#2c4430'; ctx.fillRect(x, y, w, 46);
  ctx.save(); ctx.translate(x + w * 0.3, y); craftLettering(ctx, 'The Rota · Absent · Excused', w * 0.4, 46, '#d6b46a'); ctx.restore();
  // ruled columns, one per year; in each, the shifts, every one marked absent
  const cols = 150, cw = w / cols, top = y + 56, rows = 9, rh = (h - 64) / rows;
  ctx.strokeStyle = 'rgba(70,50,30,0.55)'; ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(x + c * cw, top - 6); ctx.lineTo(x + c * cw, y + h - 4); ctx.stroke(); }
  for (let rr = 0; rr <= rows; rr++) { ctx.beginPath(); ctx.moveTo(x, top + rr * rh); ctx.lineTo(x + w, top + rr * rh); ctx.stroke(); }
  for (let c = 0; c < cols; c++) for (let rr = 0; rr < rows; rr++) {
    const cx = x + c * cw + cw / 2, cy = top + rr * rh + rh / 2;
    ctx.strokeStyle = R() > 0.97 ? 'rgba(120,30,24,0.85)' : 'rgba(40,30,22,0.75)'; ctx.lineWidth = 1.4;
    // "absent": a stroke and a bar, written the same way three hundred years running
    ctx.beginPath(); ctx.moveTo(cx - cw * 0.28, cy + rh * 0.25); ctx.lineTo(cx + cw * 0.28, cy - rh * 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - cw * 0.2, cy - rh * 0.05); ctx.lineTo(cx + cw * 0.2, cy - rh * 0.05); ctx.stroke();
  }
  ctx.restore();
}

function paintSurvey(ctx: CanvasRenderingContext2D, r: Rect): void {
  const { x, y, w, h } = r, R = rng(31);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 40, x + w / 2, y + h / 2, w * 0.62);
  g.addColorStop(0, '#dccc9e'); g.addColorStop(1, '#a48e60');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // the river, the roads
  ctx.strokeStyle = '#5a7a86'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x - 10, y + h * 0.78);
  for (let k = 0; k <= 10; k++) ctx.lineTo(x + w * k / 10, y + h * (0.78 - 0.18 * Math.sin(k * 0.7)) + R() * 6);
  ctx.stroke();
  // plots in imperial rows, every crown a dot
  const px0 = x + 60, py0 = y + 70, pw = 104, ph = 74;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
    const X = px0 + i * (pw + 10), Y = py0 + j * (ph + 10);
    if (X + pw > x + w - 40 || Y + ph > y + h - 30) continue;
    ctx.strokeStyle = 'rgba(70,48,26,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(X, Y, pw, ph);
    const felled = R() < 0.35;
    ctx.fillStyle = felled ? 'rgba(120,80,40,0.65)' : 'rgba(46,70,40,0.8)';
    for (let a = 8; a < pw - 4; a += 9) for (let b = 8; b < ph - 4; b += 9) { ctx.beginPath(); ctx.arc(X + a, Y + b, felled ? 1.4 : 2.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.52, y + h); ctx.stroke();
  // the lodge at the crossing, in red
  ctx.fillStyle = '#9a2a20'; ctx.fillRect(x + w * 0.5 - 12, y + h * 0.48 - 10, 26, 20);
  // a compass rose
  ctx.save(); ctx.translate(x + w - 90, y + h - 90); ctx.fillStyle = '#4a3420';
  for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 6; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24); ctx.lineWidth = 2; ctx.strokeRect(x + 24, y + 24, w - 48, h - 48);
  ctx.fillStyle = 'rgba(214,200,160,0.92)'; ctx.fillRect(x + w * 0.25, y + 26, w * 0.5, 40);
  ctx.save(); ctx.translate(x + w * 0.25, y + 26); craftLettering(ctx, 'The Estates · Survey', w * 0.5, 40, '#3a2a18'); ctx.restore();
  ctx.restore();
}

function paintSign(ctx: CanvasRenderingContext2D, r: Rect, text: string): void {
  const { x, y, w, h } = r;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3a2a1c'); g.addColorStop(1, '#2a1d12');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x, y + h * k / 4 + hash(k) * 4); ctx.lineTo(x + w, y + h * k / 4); ctx.stroke(); }
  ctx.save(); ctx.translate(x, y); craftLettering(ctx, text, w, h, '#dcbf86'); ctx.restore();
}

export interface LodgeAtlas { tex: DynamicTexture; lit: StandardMaterial; unlit: StandardMaterial }

export function lodgeAtlas(scene: Scene): LodgeAtlas {
  const tex = new DynamicTexture('ol_painted_atlas', { width: ATLAS, height: ATLAS }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, ATLAS, ATLAS);
  paintRota(ctx, REGION.rota);
  paintSurvey(ctx, REGION.survey);
  paintWindow(ctx, REGION.window, 3);
  paintWindow(ctx, REGION.windowWide, 8);
  SIGNS.forEach((s, n) => paintSign(ctx, REGION.sign(n), s));
  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  const lit = new StandardMaterial('ol_painted_lit', scene);
  lit.diffuseTexture = tex; lit.specularColor = new Color3(0.04, 0.04, 0.04); lit.backFaceCulling = false;
  lit.maxSimultaneousLights = 6;
  // the night outside: unlit (texture x colour), so the lamps never warm it
  const unlit = new StandardMaterial('ol_painted_night', scene);
  // MEASURED (first look): diffuseTexture under disableLighting drew the panes
  // black; the texture as the emissive term is the picture, lamps or no lamps
  unlit.emissiveTexture = tex; unlit.disableLighting = true; unlit.diffuseColor = Color3.Black();
  unlit.emissiveColor = Color3.Black(); unlit.specularColor = Color3.Black(); unlit.backFaceCulling = false;
  return { tex, lit, unlit };
}

/** Quads collected into one mesh: each a picture from the atlas, hung at a
 * centre, facing `n` (toward the viewer), w x h metres. */
export class PaintedQuads {
  private p: number[] = []; private nrm: number[] = []; private uv: number[] = []; private idx: number[] = [];
  add(c: [number, number, number], n: [number, number], w: number, h: number, r: Rect, flip = false): void {
    // the viewer looks along -n; their right is (-n.z, n.x) on the ground
    const rx = -n[1], rz = n[0], base = this.p.length / 3;
    const u0 = r.x / ATLAS, u1 = (r.x + r.w) / ATLAS, vT = 1 - r.y / ATLAS, vB = 1 - (r.y + r.h) / ATLAS;
    const [ua, ub] = flip ? [u1, u0] : [u0, u1];
    const corners: [number, number, number, number][] = [[-1, -1, ua, vB], [1, -1, ub, vB], [1, 1, ub, vT], [-1, 1, ua, vT]];
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
    // pickable: the audit's rays (and the camera's) must stop at a pane, not
    // pass through the window's hole in the wall
    m.isPickable = true;
    return m;
  }
}
