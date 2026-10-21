// The map's services: the auction house, the vendors, the trainers and the
// inns, drawn on the zone map and the minimap for everyone, always -- never
// behind discovery the way landmarks are (Philip, 2026-10-11: a player looking
// for the auction house should find it on the map, not stumble on it). The
// teleport crystal is the fifth service and keeps its own lozenge
// (map_frame.ts crystalIcon), which every map already draws ungated.
//
// Babylon-free so the node tests hold it (test/map_services.test.mjs): what a
// zone's services are, the icons' look, the legend's rows and where a label
// goes. map.ts draws with it; zonemapview.ts (/?zonemap=) shows it for audit.
//
// WHERE A SERVICE STANDS. Two sources, one list:
//   * zones.json `services`: [{ kind, name, x, z, npcs? }] -- a building, marked
//     at its centre: the auction house, an inn. `npcs` names the zone's NPCs it
//     covers (the broker, the innkeeper), whose own icons it replaces. Validated
//     by server/lib/vanai/data.rb (zone_problems) and tools/data/audit.py.
//   * the NPCs themselves, for what is one person rather than a building: a
//     `vendor` NPC is a vendor, a `sanctuary` NPC the trainer, and an `auction`
//     NPC the auction house when no `services` entry covers it.
// An innkeeper is a `vendor` NPC (they sell the inn's own goods); there is no
// inn kind. The inn is a `services` entry naming its innkeeper, so the map
// shows the inn where a vendor's bag would have been.

export const SERVICE_KINDS = ["auction", "inn", "trainer", "vendor"] as const;
export type ServiceKind = typeof SERVICE_KINDS[number];

export interface ServiceDef { kind: string; name: string; x: number; z: number; npcs?: string[] }
export interface ServiceMark {
  kind: ServiceKind;
  name: string;
  x: number;
  z: number;
  npcs: string[];
  from: "data" | "npc";          // a zones.json `services` entry, or derived from an NPC's kind
}

// NPC kind -> the service it is on its own (no building entry covering it)
export const NPC_SERVICE: Record<string, ServiceKind> = { vendor: "vendor", sanctuary: "trainer", auction: "auction" };

interface DefLike { services?: ServiceDef[]; npcs?: { id: string; name: string; kind?: string; x: number; z: number }[] }

export function isServiceKind(k: unknown): k is ServiceKind {
  return typeof k === "string" && (SERVICE_KINDS as readonly string[]).includes(k);
}

// Every service mark a zone's maps draw, highest priority first (the auction
// house, then inns, trainers, vendors): labels are placed in this order, and
// icons drawn in the reverse so the auction house sits on top of any overlap.
export function zoneServices(def: DefLike | null | undefined): ServiceMark[] {
  if (!def) return [];
  const out: ServiceMark[] = [];
  const covered = new Set<string>();
  for (const s of def.services || []) {
    if (!isServiceKind(s.kind) || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const npcs = Array.isArray(s.npcs) ? s.npcs.slice() : [];
    npcs.forEach((id) => covered.add(id));
    out.push({ kind: s.kind, name: s.name, x: s.x, z: s.z, npcs, from: "data" });
  }
  for (const n of def.npcs || []) {
    const kind = n.kind ? NPC_SERVICE[n.kind] : undefined;
    if (!kind || covered.has(n.id)) continue;
    out.push({ kind, name: n.name, x: n.x, z: n.z, npcs: [n.id], from: "npc" });
  }
  return out.sort((a, b) => SERVICE_KINDS.indexOf(a.kind) - SERVICE_KINDS.indexOf(b.kind));
}

// the NPC ids a zone's service marks stand for: their folk square is not drawn
// (the service icon is), though a quest marker still is
export function serviceNpcIds(marks: ServiceMark[]): Set<string> {
  const s = new Set<string>();
  marks.forEach((m) => m.npcs.forEach((id) => s.add(id)));
  return s;
}

// ---------- the icons ----------
// A round badge with a stroked glyph: round, because every other map mark is a
// diamond (duties, crossings), a lozenge (crystals) or a dot (folk, players),
// so a disc reads as "a service" before its colour or glyph is made out. The
// auction house is the one FILLED badge, a size up, so it is the first thing
// a city's map shows. Glyphs are 24-unit stroke paths in icons.ts's manner
// (the vendor's is its `bags`), stroked through Path2D on the canvas and
// through icons.ts strokeIcon in the DOM.
//   auction  the balance -- the Capital's auction house sign (capital-layout.json `signs`)
//   inn      a tankard -- the Capital's inn sign is a cup
//   trainer  crossed blades: the sanctuary NPC is where a job is changed
//   vendor   a shopping bag
export const SERVICE_INK = "#0b0e15";
export interface ServiceStyle { color: string; label: string; glyph: string; filled: boolean; scale: number }
export const SERVICE_STYLE: Record<ServiceKind, ServiceStyle> = {
  auction: {
    color: "#f0c75e", label: "auction house", filled: true, scale: 1.3,
    glyph: "M12 3.5v16M8 19.5h8M4.5 7h15M4.5 7 2 13a2.5 2.5 0 0 0 5 0zM19.5 7 17 13a2.5 2.5 0 0 0 5 0z",
  },
  inn: {
    color: "#eaa6c6", label: "inn", filled: false, scale: 1,
    glyph: "M5.5 7h9v11.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2zM14.5 10h2a2.5 2.5 0 0 1 0 5h-2M5.5 4.5h9",
  },
  trainer: {
    color: "#f3a86a", label: "trainer", filled: false, scale: 1,
    glyph: "M5 4l13 13M19 4 6 17M15.5 19.5l4-4M8.5 19.5l-4-4",
  },
  vendor: {
    color: "#9fd48f", label: "vendor", filled: false, scale: 1,
    glyph: "M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2",
  },
};

// Path2D off a glyph string, made once. Path2D is the browser's; the node
// tests stand in a recorder for it.
const pathCache = new Map<string, Path2D>();
function glyphPath(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
}

// The badge's drawn radius for a nominal radius r (the auction house's is larger).
export function serviceRadius(kind: ServiceKind, r: number): number { return r * SERVICE_STYLE[kind].scale; }

// One service icon centred on (x, y), nominal radius r in canvas pixels. The
// zone map draws at r 6.5, the minimap at r 5 (the auction house 8.5 / 6.5):
// at the minimap's size the glyph is a hint and the badge's colour carries it.
export function drawServiceIcon(ctx: CanvasRenderingContext2D, kind: ServiceKind, x: number, y: number, r: number): void {
  const st = SERVICE_STYLE[kind];
  const R = serviceRadius(kind, r);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = st.filled ? st.color : "rgba(11, 14, 21, 0.92)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.2);
  ctx.strokeStyle = st.filled ? SERVICE_INK : st.color;
  ctx.stroke();
  if (st.filled) {
    // a thin halo outside the ink ring, so the gold disc stands off a gold-lit plate
    ctx.beginPath();
    ctx.arc(x, y, R + ctx.lineWidth, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = st.color;
    ctx.stroke();
  }
  // the glyph's 24 units span 1.3 R, centred
  const k = (R * 1.3) / 24;
  ctx.translate(x - 12 * k, y - 12 * k);
  ctx.scale(k, k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, R * 0.17) / k;
  ctx.strokeStyle = st.filled ? SERVICE_INK : st.color;
  ctx.stroke(glyphPath(st.glyph));
  ctx.restore();
}

// ---------- the legend ----------
// The zone map's legend runs in up to two rows under the map box (map_frame.ts
// MAP_LEGEND): each entry an icon and a word, flowed left to right and wrapped
// when the next would cross the canvas. A zone lists only what it has -- a
// dungeon has no vendors, a city no hunting grounds -- so the city's ten
// entries fit and a dungeon's legend is short.
export interface LegendEntry { key: string; label: string }
export interface LegendSlot { key: string; label: string; x: number; row: number }
export const LEGEND_ICON = 14, LEGEND_GAP = 12, LEGEND_PAD = 10;
export function legendRows(entries: LegendEntry[], width: number, measure: (text: string) => number, rows = 2): LegendSlot[] {
  const out: LegendSlot[] = [];
  let x = LEGEND_PAD, row = 0;
  for (const e of entries) {
    const w = LEGEND_ICON + measure(e.label);
    if (x > LEGEND_PAD && x + w > width - LEGEND_PAD) {
      if (row + 1 >= rows) break;      // out of rows: the rest are dropped, not overprinted
      row++;
      x = LEGEND_PAD;
    }
    out.push({ key: e.key, label: e.label, x, row });
    x += w + LEGEND_GAP;
  }
  return out;
}

// ---------- labels ----------
// A label goes below its mark, else above, right, left, then off the four
// corners: the first of those that overlaps no label already placed and no
// mark, and stays on the canvas. Items arrive highest priority first and keep
// their spot. A `must` label (the auction house, an inn) is placed at its
// first on-canvas candidate even when all collide; any other label that fits
// nowhere is left off rather than printed over another, so a crowded market
// square keeps the names that matter.
export interface LabelItem { x: number; y: number; r: number; w: number; h: number; must?: boolean }
export interface LabelSpot { x: number; y: number; align: "center" | "left" | "right" }
export type Rect = [number, number, number, number];
const hit = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// the candidates in order, each a text anchor and the rect [left, top, right,
// bottom] its text covers (the baseline sits at 0.8 of the height)
export function labelCandidates(it: LabelItem): { spot: LabelSpot; rect: Rect }[] {
  const { x, y, r, w, h } = it, g = 2, d = r * 0.75 + g;
  const box = (left: number, top: number, align: LabelSpot["align"]) => ({
    spot: { x: align === "center" ? left + w / 2 : align === "left" ? left : left + w, y: top + h * 0.8, align },
    rect: [left, top, left + w, top + h] as Rect,
  });
  return [
    box(x - w / 2, y + r + g, "center"),          // below
    box(x - w / 2, y - r - g - h, "center"),      // above
    box(x + r + g, y - h / 2, "left"),            // right
    box(x - r - g - w, y - h / 2, "right"),       // left
    box(x + d, y - d - h, "left"),                // above right
    box(x + d, y + d, "left"),                    // below right
    box(x - d - w, y - d - h, "right"),           // above left
    box(x - d - w, y + d, "right"),               // below left
  ];
}
export function placeLabels(items: LabelItem[], width: number, height: number, obstacles: Rect[] = []): (LabelSpot | null)[] {
  const taken: Rect[] = obstacles.slice();
  const onCanvas = (r: Rect) => r[0] >= 0 && r[1] >= 0 && r[2] <= width && r[3] <= height;
  return items.map((it) => {
    const cands = labelCandidates(it);
    let pick = cands.find((c) => onCanvas(c.rect) && !taken.some((t) => hit(c.rect, t)));
    if (!pick && it.must) pick = cands.find((c) => onCanvas(c.rect)) || cands[0];
    if (!pick) return null;
    taken.push(pick.rect);
    return pick.spot;
  });
}
