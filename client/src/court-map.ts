// The controlling court's banner on the three maps (COURTS.md "Benefits for
// the controlling court's members": "the court's banner on the zone map,
// minimap and world map"). Babylon- and DOM-free: everything draws on a 2D
// context it is handed, and the placement maths are plain functions the node
// tests read (test/court_map.test.mjs). court-hud.ts wraps these with the live
// control map and courts.json for map.ts and hud.ts.
//
// A banner is the court's colour hung from a crossbar, its trim along the
// edges and its seal (courts.json `banner.glyph`: Caerdun's tower, Heartwood's
// oak, Moonmere's moon) in the middle -- procedural like every other icon here.

export interface Banner { color: string; trim: string; glyph: string; }
export type Control = Record<string, string>;
export interface Spot { x: number; y: number; size: number; }

/** courts.json's banner for a court, or null. */
export function bannerOf(courts: any, court: string | null | undefined): Banner | null {
  const b = court ? courts?.courts?.[court]?.banner : null;
  return b ? { color: b.color, trim: b.trim, glyph: b.glyph } : null;
}

// ---------- placement ----------

/** A box on the map canvas: [x0, y0, x1, y1]. */
export type Box = [number, number, number, number];

/** What a world-map banner covers: the staff from just below the crossbar's
 *  spot down past the dot's top, and the cloth hanging right of it. */
export function bannerBox(s: Spot): Box {
  return [s.x - 1.5, s.y - s.size - 2, s.x + s.size * 0.66 + 1.5, s.y + 3];
}

const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** The world map: one banner per controlled region, its staff rising beside
 *  the region's dot so the dot and its name below stay clear. Only regions the
 *  map draws (and, with `seen`, has unfogged: a banner over fog would name a
 *  place the player has not walked). With `avoid` (the boxes of every name and
 *  dot the map drew), a banner that would sit on a neighbour's name moves to
 *  the first clear place of: up-right, up-left, higher up on either side; where
 *  none is clear, the least covered (the Doorsteps are dense). */
export function worldBannerSpots(
  regions: { key: string; x: number; y: number }[], control: Control,
  T: (x: number, y: number) => [number, number], seen?: (key: string) => boolean, avoid: Box[] = [],
): (Spot & { key: string; court: string })[] {
  const out: (Spot & { key: string; court: string })[] = [];
  const size = 13;
  for (const r of regions) {
    const court = control[r.key];
    if (!court || (seen && !seen(r.key))) continue;
    if (out.some((o) => o.key === r.key)) continue;
    const [x, y] = T(r.x, r.y);
    const tries: [number, number][] = [[6, -3], [-6 - size * 0.66, -3], [6, -10], [-6 - size * 0.66, -10]];
    const blocked = [...avoid, ...out.map(bannerBox)];
    // the least covered of the tries (the first, when they tie): in the dense
    // middle the names already overlap each other, so clear is not always there
    let spot: Spot = { x: x + tries[0][0], y: y + tries[0][1], size }, least = Infinity;
    for (const [dx, dy] of tries) {
      const sp = { x: x + dx, y: y + dy, size }, b = bannerBox(sp);
      const cover = blocked.reduce((n, a) => n + overlapArea(a, b), 0);
      if (cover < least - 1e-9) { least = cover; spot = sp; }
    }
    out.push({ key: r.key, court, ...spot });
  }
  return out;
}

/** The zone map: the frame's top-left, below the header gap, inside the box. */
export function zoneBannerSpot(boxTop: number): Spot {
  return { x: 14, y: boxTop + 6, size: 22 };
}

/** The minimap (a disc of radius S/2 on an S-square canvas whose corners the
 *  CSS clips): the top-left of the ring, just inside the rim, clear of the
 *  north tab (top centre) and the zoom buttons (bottom left). */
export function minimapBannerSpot(S: number): Spot {
  const C = S / 2, size = 18;
  const a = (-135 * Math.PI) / 180, r = C - size * 0.95;
  return { x: C + Math.cos(a) * r - size * 0.3, y: C + Math.sin(a) * r - size * 0.5, size };
}

// ---------- drawing ----------

/** A banner hung from a crossbar at (x, y): `size` is its height, the cloth
 *  two thirds as wide, with a swallowtail. (x, y) is the crossbar's left end. */
export function drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, b: Banner, size: number): void {
  const w = size * 0.66, h = size, notch = size * 0.2;
  ctx.save();
  ctx.translate(x, y);
  // a dark outline first, so a green court reads on green ground
  ctx.lineJoin = "round";
  ctx.beginPath();
  cloth(ctx, w, h, notch);
  ctx.strokeStyle = "rgba(10,12,18,0.9)";
  ctx.lineWidth = Math.max(2.5, size * 0.16);
  ctx.stroke();
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = b.trim;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.stroke();
  // the crossbar, a little wider than the cloth
  ctx.strokeStyle = b.trim;
  ctx.lineWidth = Math.max(1.4, size * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.08, 0);
  ctx.lineTo(w + size * 0.08, 0);
  ctx.stroke();
  drawGlyph(ctx, b.glyph, w / 2, h * 0.42, size * 0.42, b.trim);
  ctx.restore();
}

function cloth(ctx: CanvasRenderingContext2D, w: number, h: number, notch: number): void {
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(w / 2, h - notch);
  ctx.lineTo(0, h);
  ctx.closePath();
}

/** A court's seal, `s` across, centred on (cx, cy). */
export function drawGlyph(ctx: CanvasRenderingContext2D, glyph: string, cx: number, cy: number, s: number, ink: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  const u = s / 2;
  ctx.beginPath();
  if (glyph === "tower") {
    // a keep with two crenels
    ctx.moveTo(-u * 0.7, u);
    ctx.lineTo(-u * 0.7, -u * 0.55);
    ctx.lineTo(-u * 0.7, -u);
    ctx.lineTo(-u * 0.25, -u);
    ctx.lineTo(-u * 0.25, -u * 0.6);
    ctx.lineTo(u * 0.25, -u * 0.6);
    ctx.lineTo(u * 0.25, -u);
    ctx.lineTo(u * 0.7, -u);
    ctx.lineTo(u * 0.7, u);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === "oak") {
    // a crown of three leaves on a trunk
    ctx.arc(0, -u * 0.25, u * 0.55, 0, Math.PI * 2);
    ctx.moveTo(-u * 0.35, u * 0.05);
    ctx.arc(-u * 0.5, u * 0.05, u * 0.38, 0, Math.PI * 2);
    ctx.moveTo(u * 0.85, u * 0.05);
    ctx.arc(u * 0.5, u * 0.05, u * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-u * 0.14, u * 0.2, u * 0.28, u * 0.8);
  } else {
    // a crescent moon: a disc less a disc
    ctx.arc(0, 0, u * 0.85, 0, Math.PI * 2);
    ctx.arc(u * 0.38, -u * 0.18, u * 0.7, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }
  ctx.restore();
}

/** The world map's banners (map.ts drawWorld, after the regions). */
export function drawWorldBanners(
  ctx: CanvasRenderingContext2D, regions: { key: string; x: number; y: number }[], control: Control, courts: any,
  T: (x: number, y: number) => [number, number], seen?: (key: string) => boolean, names?: Record<string, string>,
): void {
  // map.ts draws each unfogged region's dot and, 19 px below it, its name in
  // 11px sans-serif, centred: the banners keep off all of them
  const avoid: Box[] = [];
  if (names) {
    ctx.save();
    ctx.font = "11px sans-serif";
    for (const r of regions) {
      if ((seen && !seen(r.key)) || !names[r.key]) continue;
      const [x, y] = T(r.x, r.y);
      const w = ctx.measureText(names[r.key]).width;
      avoid.push([x - w / 2 - 1, y + 19 - 10, x + w / 2 + 1, y + 19 + 3], [x - 4, y - 4, x + 4, y + 4]);
    }
    ctx.restore();
  }
  for (const s of worldBannerSpots(regions, control, T, seen, avoid)) {
    const b = bannerOf(courts, s.court);
    if (!b) continue;
    // a staff from the dot up to the crossbar
    ctx.save();
    ctx.strokeStyle = "rgba(10,12,18,0.85)";
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x, s.y - s.size - 2); ctx.stroke();
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x, s.y - s.size - 2); ctx.stroke();
    ctx.restore();
    drawBanner(ctx, s.x, s.y - s.size, b, s.size);
  }
}

/** The zone map's banner and the court's name (map.ts drawZone), on a
 *  controlled zone only. */
export function drawZoneBanner(ctx: CanvasRenderingContext2D, key: string, boxTop: number, control: Control, courts: any): void {
  const court = control[key];
  const b = bannerOf(courts, court);
  if (!b) return;
  const s = zoneBannerSpot(boxTop);
  const name = courts.courts?.[court]?.name ?? court;
  ctx.save();
  // measured in the fonts they are drawn in (Cinzel's capitals run wide)
  const line1 = "Held by", line2 = name;
  ctx.font = "italic 10px serif";
  const w1 = ctx.measureText(line1).width;
  ctx.font = "11px Cinzel, serif";
  const tw = Math.max(w1, ctx.measureText(line2).width);
  const w = s.size * 0.66 + 14 + tw + 10;
  // a plate under it, so the base layer's ink never runs through the words
  ctx.fillStyle = "rgba(10,12,18,0.72)";
  ctx.strokeStyle = b.trim;
  ctx.lineWidth = 1;
  roundRect(ctx, s.x - 6, s.y - 4, w, s.size + 8, 5);
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  drawBanner(ctx, s.x, s.y, b, s.size);
  ctx.save();
  ctx.textAlign = "left";
  ctx.fillStyle = "#a9a39a";
  ctx.font = "italic 10px serif";
  ctx.fillText(line1, s.x + s.size * 0.66 + 8, s.y + 8);
  ctx.fillStyle = "#e8d9b0";
  ctx.font = "11px Cinzel, serif";
  ctx.fillText(line2, s.x + s.size * 0.66 + 8, s.y + 20);
  ctx.restore();
}

/** The minimap's pennant (hud.ts drawMinimap) when the zone is controlled. */
export function drawMinimapBanner(ctx: CanvasRenderingContext2D, zone: string, S: number, control: Control, courts: any): void {
  const b = bannerOf(courts, control[zone]);
  if (!b) return;
  const s = minimapBannerSpot(S);
  drawBanner(ctx, s.x, s.y, b, s.size);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
