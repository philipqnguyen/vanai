// The zone map's framing: where on a canvas a world point lands. Babylon-free so
// the node tests can hold the map to it (test/map_frame.test.mjs).
//
// A square zone (every zone from the old world, the dungeons) is drawn on its
// def.size plate, centred on the origin: that framing is unchanged. A SHAPED
// zone (ZONE_SHAPES in scene.ts) is framed on what it actually has -- its
// coast plus whatever the map draws past it (the piers and causeways that run
// out over the water, footprints standing on them, portals, crystals and camp
// rings at the edge) -- at one uniform scale with a small margin, so an island
// that fills half its plate no longer draws small and off-centre in a field of
// sea (MOONMERE.md O-16: Moonmere's island z -68..261 sat in the upper half of
// its 700 m plate). The minimap does NOT use this: its offscreen crop stays on
// the plate frame, so its metres per pixel are what they always were.

export type P2 = [number, number];
// [minX, minZ, maxX, maxZ] in world metres
export type Bounds = [number, number, number, number];

// (scene.ts MapRoadRec / MapWaterRec are these, as the build records them)
export type MapWaterTone = "ice" | "melt";
export type MapWater =
  | { kind: "ribbon"; pts: P2[]; half: number; tone?: MapWaterTone }
  | { kind: "disc"; x: number; z: number; r: number; tone?: MapWaterTone }
  | { kind: "runs"; x0: number; z0: number; step: number; rows: number[][]; tone?: MapWaterTone };
// `spine`: the line as built, when it is not `pts` (makePath's rounded
// corners); `rect`: a paved rectangle, drawn with square ends
export interface MapRoad { pts: P2[]; half: number; spine?: P2[]; rect?: true }
// a wall along its line, drawn as the buildings are; `walk` a walk on its top
export interface MapWall { pts: P2[]; half: number; walk?: number }
// [cx, cz, w, d] -- or with a fifth element FP_YARD (1): open ground the build
// keeps clear, drawn as an outline rather than a building; FP_HIDDEN (2): a
// keep-off the map does not draw (scene.ts recordFootprint)
export type MapFootprint = [number, number, number, number] | [number, number, number, number, number];
export const FP_YARD = 1, FP_HIDDEN = 2;
export const WATER_FILL: Record<MapWaterTone | "water", string> = { water: "#1a2334", ice: "#56657a", melt: "#6e2a12" };

// world (x, z) -> canvas (ox + (x - cx) S, oy - (z - cz) S); north is up
export interface MapFrame { S: number; cx: number; cz: number; ox: number; oy: number }

export function framePx(f: MapFrame, x: number, z: number): P2 {
  return [f.ox + (x - f.cx) * f.S, f.oy - (z - f.cz) * f.S];
}

// the world rectangle a frame shows on a w x h canvas
export function frameWorldRect(f: MapFrame, w: number, h: number): Bounds {
  return [f.cx - f.ox / f.S, f.cz - (h - f.oy) / f.S, f.cx + (w - f.ox) / f.S, f.cz + f.oy / f.S];
}

// The old framing, kept exactly: the def.size plate's square, fitted to the
// short side and centred on the world origin.
export function plateFrame(size: number, w: number, h: number): MapFrame {
  return { S: Math.min(w, h) / size, cx: 0, cz: 0, ox: w / 2, oy: h / 2 };
}

// A bounds rectangle fitted to the canvas at one scale (aspect kept), centred,
// with `margin` pixels clear on the tight side.
export function boundsFrame(b: Bounds, w: number, h: number, margin: number): MapFrame {
  const bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const S = Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh);
  return { S, cx: (b[0] + b[2]) / 2, cz: (b[1] + b[3]) / 2, ox: w / 2, oy: h / 2 };
}

// What a shaped zone's map has to show, gathered by the caller from the same
// lists drawZoneBase/drawZone draw, each a point with the radius it is drawn
// at. `marks` are the things a player looks for -- portals, crystals, camp
// rings, folk, landmarks -- and always fit. `runs` are the roads and the
// footprints on them, which may leave the coast (piers, jetties, causeways):
// they fit up to REACH metres past the SHAPE, so the Inn Pier and the Shelf
// Inn at its end are framed, while a causeway that runs on out of the zone
// past its portal is drawn running off the edge instead of shrinking the whole
// map to show the open sea it crosses. The reach is the shape's alone, not the
// marks': measured from Moonmere's causeway portal (40 m off the north coast)
// it framed 30 m of open causeway past the portal, and the island sat low in
// its frame with 70 px of sea above it.
export interface FrameContent { shape: P2[]; marks: [number, number, number][]; runs: [number, number, number][] }
export const REACH = 30;

// The bounds of the shape, the marks and the runs (within REACH), clamped to
// the plate: nothing outside the plate is ever built.
export function contentBounds(size: number, c: FrameContent): Bounds {
  let b: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, z: number, r: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    b = [Math.min(b[0], x - r), Math.min(b[1], z - r), Math.max(b[2], x + r), Math.max(b[3], z + r)];
  };
  for (const [x, z] of c.shape) add(x, z, 0);
  const h = size / 2;
  if (!Number.isFinite(b[0])) return [-h, -h, h, h];
  const lim: Bounds = [b[0] - REACH, b[1] - REACH, b[2] + REACH, b[3] + REACH];
  for (const [x, z, r] of c.marks) add(x, z, r);
  for (const [x, z, r] of c.runs) {
    add(Math.max(lim[0] + r, Math.min(lim[2] - r, x)), Math.max(lim[1] + r, Math.min(lim[3] - r, z)), r);
  }
  return [Math.max(-h, b[0]), Math.max(-h, b[1]), Math.min(h, b[2]), Math.min(h, b[3])];
}

// the zone map's margin, in canvas pixels, on the tight side
export const MAP_MARGIN = 14;

// The zone map window's canvas (map.ts drawZone) holds the map box 10 px down
// from its top, and the legend's two 13 px rows below it (40 px with their
// padding: one row was 26 px until the service icons and their legend entries
// came, map_services.ts, and a city's legend no longer fit). The base layer is drawn
// into the box (translated by `top`), and every live layer -- labels, folk,
// duties, party, the player's arrow -- must land where the base layer put the
// ground, so both go through zoneMapBox / zoneMapPx.
export const MAP_BOX_TOP = 10, MAP_LEGEND = 40;
export function zoneMapBox(cw: number, ch: number): { top: number; w: number; h: number } {
  return { top: MAP_BOX_TOP, w: cw, h: ch - MAP_LEGEND };
}
export function zoneMapPx(f: MapFrame, x: number, z: number): P2 {
  const [a, b] = framePx(f, x, z);
  return [a, b + MAP_BOX_TOP];
}

// What a shaped zone's map must show, gathered from the zone's data (its
// zones.json def), its shape and its build records (the mapped roads, the
// footprints): the marks a player looks for -- camp rings, crystals, portals,
// folk, landmarks -- and the runs that can leave the coast: the roads that
// leave by water (the rest are cut at the shape) and every footprint's
// corners, so a long one (a causeway's deck) is held to the reach like a road.
// Null for a square zone, which keeps its plate framing. map.ts and the tests
// both call this, so the tests hold the real gathering.
export interface ZoneDefLike {
  camps?: { x: number; z: number; radius: number }[];
  milestones?: { x: number; z: number }[];
  portals?: { x: number; z: number }[];
  npcs?: { x: number; z: number }[];
  landmarks?: { x: number; z: number }[];
}
export function frameContent(
  def: ZoneDefLike | null | undefined,
  shape: { pts: P2[]; coast?: boolean[] | null } | null | undefined,
  roads: MapRoad[],
  footprints: MapFootprint[],
): FrameContent | null {
  if (!def || !shape) return null;
  const marks: [number, number, number][] = [], runs: [number, number, number][] = [];
  for (const c of def.camps || []) marks.push([c.x, c.z, c.radius]);
  for (const p of def.milestones || []) marks.push([p.x, p.z, 8]);
  for (const p of def.portals || []) marks.push([p.x, p.z, 8]);
  for (const n of def.npcs || []) marks.push([n.x, n.z, 4]);
  for (const l of def.landmarks || []) marks.push([l.x, l.z, 4]);
  for (const r of roads) if (leavesByWater(r, shape.pts, shape.coast)) for (const [x, z] of r.pts) runs.push([x, z, r.half]);
  for (const [x, z, w, d, style] of footprints) {
    if (style === FP_HIDDEN) continue;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) runs.push([x + sx * w / 2, z + sz * d / 2, 0]);
  }
  return { shape: shape.pts, marks, runs };
}

// The zone map's frame: the plate for a square zone, the content for a shaped one.
export function zoneFrame(size: number, w: number, h: number, content: FrameContent | null): MapFrame {
  if (!content || content.shape.length < 3) return plateFrame(size, w, h);
  return boundsFrame(contentBounds(size, content), w, h, MAP_MARGIN);
}

// A dungeon's frame (its layout's cell bounds, `floor`) or a ship's (its
// deck's): what is walked, `pad` metres round it, and every mark, clamped to
// the plate -- on the plate frame a dungeon drew small in the middle of its
// 340 m square. The minimap keeps the plate (minimapBase).
export function layoutFrame(size: number, w: number, h: number, floor: Bounds, marks: [number, number, number][], pad = 4): MapFrame {
  let b: Bounds = [floor[0] - pad, floor[1] - pad, floor[2] + pad, floor[3] + pad];
  for (const [x, z, r] of marks) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    b = [Math.min(b[0], x - r), Math.min(b[1], z - r), Math.max(b[2], x + r), Math.max(b[3], z + r)];
  }
  const half = size / 2;
  return boundsFrame([Math.max(-half, b[0]), Math.max(-half, b[1]), Math.min(half, b[2]), Math.min(half, b[3])], w, h, MAP_MARGIN);
}

// the share of a w x h canvas a polygon covers under a frame (the fill
// fraction MAP.md reports, and the test holds the island to)
export function fillFraction(f: MapFrame, pts: P2[], w: number, h: number): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return (Math.abs(a) / 2) * f.S * f.S / (w * h);
}

// ---------- roads that leave the coast ----------
// Nothing about a mapped road says it is a deck (addMapRoad records points and
// a half-width), so it is derived from the shape: a road leaves by water when
// some stretch of it lies outside the shape and every such stretch is nearest
// a COAST edge (ZoneShape.coast[i]: the edge pts[i] -> pts[i+1] is water). A
// pier, a jetty, a causeway does; a road that runs out across a land border
// into the rim (the Canal Works' towpath, Heartwood's west road at its gate)
// does not, and stays cut at the border as it always was.
export function pointInPoly(pts: P2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside;
}

function nearestEdge(pts: P2[], x: number, z: number): number {
  let best = Infinity, at = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
    if (d < best) { best = d; at = i; }
  }
  return at;
}

// sampled every few metres along the road, so a stretch that dips outside
// between two inside points is seen too. A zone's roads and shape are the same
// objects every redraw (the live layers, ZONE_SHAPES), and Moonmere's ring
// streets against its 275-edge coast cost ~10 ms a pass, so the answer is kept
// per road object for the shape it was asked about.
const byWaterMemo = new WeakMap<MapRoad, { shape: P2[]; v: boolean }>();
export function leavesByWater(road: MapRoad, shape: P2[], coast: boolean[] | null | undefined): boolean {
  if (!coast || !coast.some(Boolean)) return false;
  const m = byWaterMemo.get(road);
  if (m && m.shape === shape) return m.v;
  const v = leavesByWaterNow(road, shape, coast);
  byWaterMemo.set(road, { shape, v });
  return v;
}
function leavesByWaterNow(road: MapRoad, shape: P2[], coast: boolean[]): boolean {
  let out = false;
  for (let k = 0; k < road.pts.length; k++) {
    const [ax, az] = road.pts[k];
    const [bx, bz] = road.pts[Math.min(k + 1, road.pts.length - 1)];
    const steps = k === road.pts.length - 1 ? 0 : Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (pointInPoly(shape, x, z)) continue;
      if (!coast[nearestEdge(shape, x, z)]) return false;
      out = true;
    }
  }
  return out;
}

// ---------- the static base layer ----------
// The map glyph for a crossing (a portal this character may see): a diamond
// like the duties', so it is drawn in the one colour no other mark wears --
// near-white, inked so it holds on snow and ice. It was lilac (#a58fd8) until
// 2026-10-12, which sat beside the guild duty's lilac in the legend (Philip:
// change the colour); the guild keeps its lilac because the GUILD tag wears it
// across the HUD (quest_rules.ts GUILD_COLOR). Every map draws it from here.
export const CROSSING_COLOR = "#f2f4f8";
export function crossingIcon(ctx: CanvasRenderingContext2D, x: number, y: number, half: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = CROSSING_COLOR;
  ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.strokeStyle = "rgba(10,12,18,0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-half, -half, half * 2, half * 2);
  ctx.restore();
}

// The map glyph for a teleport crystal: a tall blue lozenge with a lit core,
// shared by the world map, the zone maps and the minimap so they agree.
export function crystalIcon(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const w = h * 0.55;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y); ctx.closePath();
  ctx.fillStyle = "#5c8fe6";
  ctx.fill();
  ctx.strokeStyle = "#dbe8ff";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.2, h * 0.28), 0, Math.PI * 2);
  ctx.fillStyle = "#eaf2ff";
  ctx.fill();
  ctx.restore();
}


// Everything the base layer draws, gathered by map.ts from the zone's data,
// its build records and the quest state, so the drawing itself needs none of them.
export interface BaseContent {
  size: number;
  // a dungeon's floor (its layout's cells) or a ship's deck: filled over the
  // plate, under everything else, with `edges` (wall lines) stroked round it
  floors?: { pts: P2[]; fill: string }[];
  edges?: [number, number, number, number][];
  shape: P2[] | null;
  coast: boolean[] | null;                                 // per shape edge: water (see leavesByWater)
  tint: string;
  relief: { cv: CanvasImageSource; rect: Bounds } | null;   // a height shading sampled over `rect` (the plate)
  roads: MapRoad[];
  waters: MapWater[];
  footprints: MapFootprint[];
  walls?: MapWall[];
  camps: [number, number, number][];
  milestones: P2[];
  portals: P2[];
}

function polyPath(ctx: CanvasRenderingContext2D, f: MapFrame, pts: P2[]): void {
  ctx.beginPath();
  pts.forEach(([x, z], i) => { const [a, b] = framePx(f, x, z); if (i === 0) ctx.moveTo(a, b); else ctx.lineTo(a, b); });
  ctx.closePath();
}

function strokeRoads(ctx: CanvasRenderingContext2D, f: MapFrame, roads: MapRoad[]): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(190, 180, 150, 0.22)";
  roads.forEach((rd) => {
    ctx.lineWidth = Math.max(1.5, rd.half * 2 * f.S);
    // a paved rectangle keeps its square ends: a round cap reached its
    // half-width past each end (the Capital's square over the gate's houses)
    ctx.lineCap = rd.rect ? "butt" : "round";
    ctx.lineJoin = rd.rect ? "miter" : "round";
    ctx.beginPath();
    (rd.spine || rd.pts).forEach(([rx, rz], i) => { const [a, b] = framePx(f, rx, rz); if (i === 0) ctx.moveTo(a, b); else ctx.lineTo(a, b); });
    ctx.stroke();
  });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

// Plate, water, roads, building footprints, camp rings, milestones, portals,
// drawn under frame `f` into a w x h box at the context's origin.
// Nothing is drawn outside the box: a shaped zone's causeway now runs off the
// frame's edge on purpose, and unclipped it ran on down through the zone map's
// legend row (the Shores' causeway across "hunting grounds"). The clip has a
// pixel's slack: a square plate fills the box's height exactly, and its 1 px
// rim straddles the box edge -- clipped flush, half of it went, and the
// dungeons' maps were no longer the pixels they were.
export const BOX_SLACK = 1;
export function drawBaseLayers(ctx: CanvasRenderingContext2D, c: BaseContent, f: MapFrame, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-BOX_SLACK, -BOX_SLACK, w + 2 * BOX_SLACK, h + 2 * BOX_SLACK);
  ctx.clip();
  drawBaseLayersInBox(ctx, c, f, w, h);
  ctx.restore();
}
function drawBaseLayersInBox(ctx: CanvasRenderingContext2D, c: BaseContent, f: MapFrame, w: number, h: number): void {
  const size = c.size;
  ctx.fillStyle = "#0c1018";
  ctx.fillRect(0, 0, w, h);
  const [x0, y0] = framePx(f, -size / 2, size / 2);
  const [x1, y1] = framePx(f, size / 2, -size / 2);
  const shape = c.shape && c.shape.length >= 3 ? c.shape : null;
  ctx.save();
  // A zone with a SHAPE is drawn as that shape -- the map has to agree with the
  // ground about where the zone stops, and the new zones are not squares
  // (ZONE_SHAPES in scene.ts, off the cards in design/the-empty-throne.html).
  if (shape) polyPath(ctx, f, shape);
  else { ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 14); }
  ctx.fillStyle = c.tint;
  ctx.fill();
  ctx.clip();
  // terrain relief, blended over the tint
  if (c.relief) {
    const [r0x, r0y] = framePx(f, c.relief.rect[0], c.relief.rect[3]);
    const [r1x, r1y] = framePx(f, c.relief.rect[2], c.relief.rect[1]);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(c.relief.cv, r0x, r0y, r1x - r0x, r1y - r0y);
    ctx.restore();
  }
  // a dungeon's floor or a ship's deck, then the walls round it
  if (c.floors?.length) {
    for (const fl of c.floors) {
      ctx.beginPath();
      fl.pts.forEach(([x, z], i) => { const [a, b] = framePx(f, x, z); if (i === 0) ctx.moveTo(a, b); else ctx.lineTo(a, b); });
      ctx.closePath();
      ctx.fillStyle = fl.fill;
      ctx.fill();
    }
  }
  if (c.edges?.length) {
    ctx.strokeStyle = "rgba(200, 204, 222, 0.55)";
    ctx.lineWidth = Math.max(1, 0.35 * f.S);
    ctx.lineCap = "square";
    ctx.beginPath();
    for (const [x0, z0, x1, z1] of c.edges) {
      const [a0, b0] = framePx(f, x0, z0), [a1, b1] = framePx(f, x1, z1);
      ctx.moveTo(a0, b0); ctx.lineTo(a1, b1);
    }
    ctx.stroke();
  }
  // water: rivers as ribbons along their wound centreline, ponds as discs, a
  // sheet's flooded cells as runs; ice and melt in their own colours
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  c.waters.forEach((wa) => {
    ctx.fillStyle = ctx.strokeStyle = WATER_FILL[wa.tone || "water"];
    if (wa.kind === "runs") {
      // a hair over a cell, so neighbouring rows meet without a seam
      const st = wa.step * f.S, pad = 0.6;
      wa.rows.forEach((row, j) => {
        for (let k = 0; k + 1 < row.length; k += 2) {
          const [a, b] = framePx(f, wa.x0 + (row[k] - 0.5) * wa.step, wa.z0 + (j + 0.5) * wa.step);
          ctx.fillRect(a - pad / 2, b - pad / 2, (row[k + 1] - row[k] + 1) * st + pad, st + pad);
        }
      });
    } else if (wa.kind === "disc") {
      const [wx, wy] = framePx(f, wa.x, wa.z);
      ctx.beginPath();
      ctx.arc(wx, wy, Math.max(2, wa.r * f.S), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(2, wa.half * 2 * f.S);
      ctx.beginPath();
      wa.pts.forEach(([wx, wz], i) => { const [a, b] = framePx(f, wx, wz); if (i === 0) ctx.moveTo(a, b); else ctx.lineTo(a, b); });
      ctx.stroke();
    }
  });
  // roads, as the ribbons the ground has, inside the plate or the shape --
  // except a shaped zone's roads that leave by water, drawn below
  const byWater = shape ? c.roads.filter((r) => leavesByWater(r, shape, c.coast)) : [];
  strokeRoads(ctx, f, byWater.length ? c.roads.filter((r) => !byWater.includes(r)) : c.roads);
  ctx.restore();
  if (shape) {
    // The decks, piers and causeways a zone lays out over the water (Moonmere's
    // Inn Pier to the Shelf Inn, its Harbour Jetty, the causeway) are roads
    // too, and cutting them at the shore left the buildings they reach --
    // drawn unclipped -- standing adrift in the sea (O-16). They are drawn past
    // the coast, bounded only by the plate: nothing is built past it.
    if (byWater.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      strokeRoads(ctx, f, byWater);
      ctx.restore();
    }
    polyPath(ctx, f, shape);
    ctx.strokeStyle = "#3a4258";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // the square plate's rim; a shaped zone's edge is its coast, and the plate
    // square around it is no edge anyone can reach, so it is not drawn
    ctx.strokeStyle = "#3a4258";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 14);
    ctx.stroke();
  }
  // walls along their lines, in the buildings' colours, and the walk on top
  if (c.walls?.length) {
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    const line = (pts: P2[]) => {
      ctx.beginPath();
      pts.forEach(([x, z], i) => { const [a, b] = framePx(f, x, z); if (i === 0) ctx.moveTo(a, b); else ctx.lineTo(a, b); });
      ctx.stroke();
    };
    for (const wl of c.walls) {
      const lw = Math.max(2, wl.half * 2 * f.S);
      ctx.strokeStyle = "rgba(150, 155, 175, 0.45)";
      ctx.lineWidth = lw + 2;
      line(wl.pts);
      ctx.strokeStyle = "rgba(30, 34, 46, 0.95)";
      ctx.lineWidth = lw;
      line(wl.pts);
      if (wl.walk) {
        ctx.strokeStyle = "rgba(190, 180, 150, 0.3)";
        ctx.lineWidth = Math.max(1, Math.min(lw - 1, wl.walk * 2 * f.S));
        line(wl.pts);
      }
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  // buildings + walls (footprints recorded when the zone was built); a yard
  // -- open ground kept clear -- as a dashed outline, so it covers nothing
  c.footprints.forEach(([fx, fz, fw, fd, style]) => {
    const [bx, by] = framePx(f, fx, fz);
    if (style === FP_HIDDEN) return;
    const bw = Math.max(2, fw * f.S), bh = Math.max(2, fd * f.S);
    ctx.lineWidth = 1;
    if (style === FP_YARD) {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = "rgba(170, 160, 130, 0.5)";
      ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
      ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = "rgba(30, 34, 46, 0.9)";
    ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    ctx.strokeStyle = "rgba(150, 155, 175, 0.45)";
    ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
  });
  // camps as faint threat rings
  c.camps.forEach(([x, z, r]) => {
    const [cx, cy] = framePx(f, x, z);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(6, r * f.S), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(200,90,74,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // teleport crystals
  c.milestones.forEach(([x, z]) => {
    const [wx, wy] = framePx(f, x, z);
    crystalIcon(ctx, wx, wy, 6);
  });
  // portals (the caller passes only those this character may see)
  c.portals.forEach(([x, z]) => {
    const [pxx, pyy] = framePx(f, x, z);
    crossingIcon(ctx, pxx, pyy, 4);
  });
}

// ---------- the minimap's crop ----------
// The minimap blits from one offscreen render of the base per zone load, at
// about 2 px per metre, on the PLATE frame: hud.ts drawMinimap reads a point at
// (side / 2 + x ppu, side / 2 - z ppu), so this framing is the minimap's
// contract and the zone map's own framing never touches it.
export function minimapBase(size: number): { side: number; ppu: number; frame: MapFrame } {
  const side = Math.min(1400, Math.max(256, Math.round(size * 2)));
  return { side, ppu: side / size, frame: plateFrame(size, side, side) };
}
