// The zone map's framing and its over-water roads (client/src/map_frame.ts;
// MOONMERE.md O-16). A shaped zone's map is framed on what it has, not on its
// square def.size plate; a square zone's map is framed exactly as before; the
// minimap's crop keeps the plate frame, so its metres per pixel never move;
// and a shaped zone's roads are not cut at the coast, so a pier reaches the
// building at its end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  framePx, plateFrame, boundsFrame, contentBounds, zoneFrame, fillFraction, frameWorldRect,
  drawBaseLayers, minimapBase, leavesByWater, frameContent, zoneMapBox, zoneMapPx, MAP_MARGIN, REACH,
  layoutFrame, FP_YARD, FP_HIDDEN, WATER_FILL,
} from '../src/map_frame.ts';

const L = JSON.parse(fs.readFileSync(new URL('../src/moonmere-layout.json', import.meta.url), 'utf8'));
const ZONES = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url), 'utf8'));
const MM = ZONES.moonmere;
const SHAPE = L.shape.pts;
// the zone map window's canvas: 560 x 430, less the 10 px header gap and the
// legend's two rows below the box (MAP_LEGEND 40)
const W = 560, H = 390;

function pip(pts, x, z) {
  let inside = false;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside;
}
const bbox = (pts) => pts.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);

// Moonmere's records from the plan rather than a build: every mapped street
// and the causeway (makeCauseway maps it from the landing to the sea end),
// gathered by the same frameContent map.ts zoneMapFrame calls, with the
// zone's real def (portal, crystal, folk, landmarks, camps). The Shelf Inn's
// footprint stands at the Inn Pier's end, off the coast.
function moonmereContent() {
  const cw = L.causeway;
  const roads = [...L.streets.filter((s) => s.map !== false).map((s) => ({ pts: s.pts, half: s.half })),
    { pts: [[cw.x, cw.zLand], [cw.x, cw.zSea]], half: 4.5 }];
  const pier = L.streets.find((s) => s.id === 'inn_pier');
  const [ex, ez] = pier.pts.at(-1);
  const footprints = [[ex, ez + 6, 14, 12]];
  return { roads, footprints, content: frameContent(MM, L.shape, roads, footprints) };
}

test('a square zone is framed on its plate exactly as before', () => {
  for (const size of [700, 340, 140]) {
    const f = zoneFrame(size, W, H, null);
    assert.deepEqual(f, plateFrame(size, W, H));
    // the old drawZoneBase: S = min(w, h) / size, px = (w/2 + x S, h/2 - z S)
    const S = Math.min(W, H) / size;
    assert.equal(f.S, S);
    for (const [x, z] of [[0, 0], [size / 2, size / 2], [-size / 2, size / 3], [12.5, -88]]) {
      assert.deepEqual(framePx(f, x, z), [W / 2 + x * S, H / 2 - z * S]);
    }
  }
  // a "shape" too small to be one falls back to the plate too
  assert.deepEqual(zoneFrame(700, W, H, { shape: [[0, 0], [1, 1]], marks: [], runs: [] }), plateFrame(700, W, H));
});

test('boundsFrame fits bounds at one scale, centred, with the margin on the tight side', () => {
  const b = [-100, 0, 300, 100];      // 400 x 100: the width is tight on a 560 x 390 canvas
  const f = boundsFrame(b, W, H, 10);
  assert.equal(f.S, (W - 20) / 400);
  const [ax, ay] = framePx(f, b[0], b[3]), [bx, by] = framePx(f, b[2], b[1]);
  assert.ok(Math.abs(ax - 10) < 1e-9 && Math.abs(bx - (W - 10)) < 1e-9);
  assert.ok(Math.abs((ay + by) / 2 - H / 2) < 1e-9, 'centred on the loose axis');
  assert.ok(Math.abs((by - ay) / (bx - ax) - 100 / 400) < 1e-9, 'aspect kept');
  // and frameWorldRect inverts it
  const r = frameWorldRect(f, W, H);
  assert.deepEqual(framePx(f, r[0], r[3]).map((v) => Math.round(v * 1e6) / 1e6), [0, 0]);
  assert.deepEqual(framePx(f, r[2], r[1]).map((v) => Math.round(v * 1e6) / 1e6), [W, H]);
});

test('contentBounds holds a shaped zone to its plate, and its runs to REACH', () => {
  const tri = [[-10, -10], [10, -10], [0, 10]];
  assert.deepEqual(contentBounds(700, { shape: tri, marks: [[0, 900, 4], [-500, 0, 0]], runs: [] }), [-350, -10, 10, 350]);
  // a pier 20 m out is framed whole; a causeway 300 m out is framed REACH past the coast
  assert.deepEqual(contentBounds(700, { shape: tri, marks: [], runs: [[0, 30, 2]] }), [-10, -10, 10, 32]);
  assert.deepEqual(contentBounds(700, { shape: tri, marks: [], runs: [[0, 300, 2]] }), [-10, -10, 10, 10 + REACH]);
  // the reach is the SHAPE's: a portal out on the causeway is framed, the
  // causeway past it is not (Moonmere's island sat low with 30 m of open
  // causeway framed beyond its portal)
  assert.deepEqual(contentBounds(700, { shape: tri, marks: [[0, 50, 8]], runs: [[0, 300, 2]] }), [-10, -10, 10, 58]);
  assert.deepEqual(contentBounds(700, { shape: tri, marks: [[0, 20, 8]], runs: [[0, 300, 2]] }), [-10, -10, 10, 10 + REACH]);
});

test('frameContent gathers what map.ts frames on: marks, by-water roads, footprints', () => {
  assert.equal(frameContent(MM, null, [], []), null, 'a square zone has no content');
  assert.equal(frameContent(null, L.shape, [], []), null);
  const sq = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const def = { camps: [{ x: 10, z: 20, radius: 15 }], milestones: [{ x: 1, z: 2 }], portals: [{ x: 0, z: 130 }], npcs: [{ x: 3, z: 4 }], landmarks: [{ x: 5, z: 6 }] };
  const pier = { pts: [[0, 60], [0, 140]], half: 2 }, lane = { pts: [[-50, 0], [50, 0]], half: 3 };
  const c = frameContent(def, { pts: sq, coast: [false, false, true, false] }, [pier, lane], [[0, 170, 10, 20]]);
  assert.equal(c.shape, sq);
  assert.deepEqual(c.marks, [[10, 20, 15], [1, 2, 8], [0, 130, 8], [3, 4, 4], [5, 6, 4]]);
  // the pier's points (it leaves by water), not the lane's; the footprint's four corners
  assert.deepEqual(c.runs, [[0, 60, 2], [0, 140, 2], [-5, 160, 0], [5, 160, 0], [5, 180, 0], [-5, 180, 0]]);
  // the footprint far out is held to the reach; the portal mark is framed whole
  assert.deepEqual(contentBounds(400, c), [-100, -100, 100, 138]);
});

test("the zone map's live layers land where the base layer drew the ground", () => {
  // the window's canvas: the box is 10 px down, the legend's two rows below it
  const box = zoneMapBox(560, 430);
  assert.deepEqual(box, { top: 10, w: 560, h: 390 });
  const { content } = moonmereContent();
  const f = zoneFrame(700, box.w, box.h, content);
  for (const [x, z] of [[8, 300], [-18, 246], [0, 0]]) {
    const [a, b] = framePx(f, x, z);
    assert.deepEqual(zoneMapPx(f, x, z), [a, b + box.top]);
  }
  // and map.ts uses exactly these: one frame on the box for the base and the
  // live layers, the minimap crop on minimapBase's plate frame (map.ts imports
  // Babylon through scene.ts, so its wiring is read from the source)
  const src = fs.readFileSync(new URL('../src/map.ts', import.meta.url), 'utf8');
  const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));
  const dz = fn('drawZone');
  assert.match(dz, /const box = zoneMapBox\(W, H\)/);
  assert.match(dz, /const frame = (opts\.frame \|\| )?zoneMapFrame\(key, box\.w, box\.h\)/);
  assert.match(dz, /zoneMapPx\(frame, /);
  assert.match(dz, /ctx\.translate\(0, box\.top\);\s*drawZoneBase\(ctx, key, box\.w, box\.h, frame\)/);
  const zb = fn('zoneBaseCanvas');
  assert.match(zb, /const mb = minimapBase\(/);
  assert.match(zb, /drawZoneBase\(.*, zone, mb\.side, mb\.side, mb\.frame\)/);
  assert.match(zb, /ppu: mb\.ppu/);
  // a shaped zone framed on what it draws (keep-offs and the map's own); a
  // dungeon on its layout, a voyage on its deck (layoutFrame)
  assert.match(fn('zoneMapFrame'), /frameContent\(def, shape, d\.roads, d\.footprints\)/);
  assert.match(fn('zoneMapFrame'), /layoutFrame\(def\.size as number, w, h, \[b\.minX, b\.minZ, b\.maxX, b\.maxZ\], marksOf\(def\)\)/);
});

test("Moonmere's map is framed on its island, centred, and fills the frame", () => {
  const { content } = moonmereContent();
  const before = plateFrame(700, W, H);
  const f = zoneFrame(700, W, H, content);
  const isle = bbox(SHAPE);
  const [ix0, iy0] = framePx(f, isle[0], isle[3]), [ix1, iy1] = framePx(f, isle[2], isle[1]);
  // the whole island is on the canvas, clear of the margin
  assert.ok(ix0 >= MAP_MARGIN - 1e-6 && ix1 <= W - MAP_MARGIN + 1e-6, `x ${ix0}..${ix1}`);
  assert.ok(iy0 >= MAP_MARGIN - 1e-6 && iy1 <= H - MAP_MARGIN + 1e-6, `y ${iy0}..${iy1}`);
  // centred across; along z the causeway's portal 40 m off the north coast is in the frame too
  assert.ok(Math.abs((ix0 + ix1) / 2 - W / 2) < 3, `island centre x ${(ix0 + ix1) / 2}`);
  const cb = contentBounds(700, content);
  const [cx0, cy0] = framePx(f, cb[0], cb[3]), [cx1, cy1] = framePx(f, cb[2], cb[1]);
  assert.ok(Math.abs((cy0 + cy1) / 2 - H / 2) < 1e-6 && Math.abs((cx0 + cx1) / 2 - W / 2) < 1e-6, 'content centred');
  // the content fills the tight axis to the margin
  assert.ok(Math.abs(Math.max((cx1 - cx0) / (W - 2 * MAP_MARGIN), (cy1 - cy0) / (H - 2 * MAP_MARGIN)) - 1) < 1e-9);
  // and the island is drawn much larger than on the plate: it used to fill the
  // upper half of a 700 m square, open sea below
  const fb = fillFraction(before, SHAPE, W, H), fa = fillFraction(f, SHAPE, W, H);
  assert.ok(fa > 2.2 * fb, `fill ${fb.toFixed(3)} -> ${fa.toFixed(3)}`);
  assert.ok((iy1 - iy0) / H > 0.7, `island height ${((iy1 - iy0) / H).toFixed(2)} of the map`);
  // every portal, crystal and resident is on the canvas
  for (const p of [...MM.portals, ...MM.milestones, ...MM.npcs]) {
    const [x, y] = framePx(f, p.x, p.z);
    assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `${p.id || p.name} at ${x},${y}`);
  }
  // along z the frame ends at the causeway portal (z 300 + its 8 m pin), not
  // 30 m of open causeway past it: the sea above the island is the portal's
  // 47 m off the coast and no more (it was 71 px with the reach measured from
  // the portal)
  const top = iy0 - MAP_MARGIN, bottom = H - MAP_MARGIN - iy1;
  assert.ok(top < 55 && bottom < 5, `sea above ${top.toFixed(1)} px, below ${bottom.toFixed(1)} px`);
  assert.ok(Math.abs(cb[3] - (MM.portals.reduce((m, p) => Math.max(m, p.z), -Infinity) + 8)) < 1e-9, `frame top z ${cb[3]}`);
  // the Shelf Inn at the Inn Pier's end is framed
  const [fx, fz, fw, fd] = moonmereContent().footprints[0];
  const [sx0, sy0] = framePx(f, fx - fw / 2, fz + fd / 2), [sx1, sy1] = framePx(f, fx + fw / 2, fz - fd / 2);
  assert.ok(sx0 >= 0 && sx1 <= W && sy0 >= 0 && sy1 <= H, 'the Shelf Inn is on the map');
});

test("the minimap's scale and crop are unchanged", () => {
  for (const size of [700, 340, 140]) {
    const mb = minimapBase(size);
    // the old zoneBaseCanvas: side = clamp(round(size * 2), 256, 1400), ppu = side / size
    const side = Math.min(1400, Math.max(256, Math.round(size * 2)));
    assert.equal(mb.side, side);
    assert.equal(mb.ppu, side / size);
    assert.equal(mb.frame.S, mb.ppu);
    // hud.ts drawMinimap reads a world point at (side/2 + x ppu, side/2 - z ppu)
    for (const [x, z] of [[0, 0], [-18, 246], [8, 300], [-size / 2, size / 2]]) {
      assert.deepEqual(framePx(mb.frame, x, z), [side / 2 + x * mb.ppu, side / 2 - z * mb.ppu]);
    }
  }
  // the zone map's own framing does not reach it: Moonmere's island frame differs, the crop does not
  const { content } = moonmereContent();
  assert.notEqual(zoneFrame(700, 1400, 1400, content).S, minimapBase(700).ppu);
  assert.deepEqual(minimapBase(700).frame, plateFrame(700, 1400, 1400));
});

// A recording 2D context: enough to see which clip each stroke is drawn under.
function recorder() {
  const log = [];
  let path = [], kind = 'path';
  let clips = [];
  const stack = [];
  const ctx = {
    log,
    save() { stack.push(clips.slice()); },
    restore() { clips = stack.pop() || []; },
    beginPath() { path = []; kind = 'path'; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    closePath() { kind = 'poly'; },
    rect(x, y, w, h) { kind = 'rect'; path = [[x, y], [x + w, y + h]]; },
    roundRect(x, y, w, h) { kind = 'roundRect'; path = [[x, y], [x + w, y + h]]; },
    arc() {}, fill() {}, fillRect() {}, strokeRect() {}, drawImage() {}, translate() {}, rotate() {}, fillText() {},
    clip() { clips.push({ kind, path: path.slice() }); },
    stroke() { log.push({ path: path.slice(), kind, clips: clips.slice(), style: ctx.strokeStyle }); },
  };
  return ctx;
}
const ROAD_STYLE = 'rgba(190, 180, 150, 0.22)';

test("a shaped zone's roads run past the coast: the Inn Pier reaches the Shelf Inn", () => {
  const { roads, content } = moonmereContent();
  const pier = L.streets.find((s) => s.id === 'inn_pier');
  const jetty = L.streets.find((s) => s.id === 'jetty');
  // both decks really do leave the coast
  assert.ok(!pip(SHAPE, ...pier.pts.at(-1)), 'the Inn Pier ends off the coast');
  assert.ok(!pip(SHAPE, ...jetty.pts.at(-1)), 'the Harbour Jetty ends off the coast');
  const f = zoneFrame(700, W, H, content);
  const ctx = recorder();
  drawBaseLayers(ctx, {
    size: 700, shape: SHAPE, coast: L.shape.coast, tint: '#252a40', relief: null, roads, waters: [],
    footprints: [], camps: [], milestones: [], portals: [],
  }, f, W, H);
  for (const deck of [pier, jetty]) {
    const end = framePx(f, ...deck.pts.at(-1));
    const s = ctx.log.find((e) => e.style === ROAD_STYLE && e.path.some(([x, y]) => Math.abs(x - end[0]) < 1e-6 && Math.abs(y - end[1]) < 1e-6));
    assert.ok(s, `${deck.id} is stroked`);
    // not under the coast's clip: only the box and the plate's rectangle bound it, and its end is inside both
    assert.deepEqual(s.clips.map((c) => c.kind), ['rect', 'rect'], `${deck.id} clips: ${s.clips.map((c) => c.kind)}`);
    for (const c of s.clips) {
      const [[rx0, ry0], [rx1, ry1]] = c.path;
      assert.ok(end[0] > rx0 && end[0] < rx1 && end[1] > ry0 && end[1] < ry1);
    }
  }
  // a street that stays ashore is still drawn under the coast's clip
  const street = framePx(f, ...L.streets.find((x) => x.id === 'landing_lane').pts[0]);
  const st = ctx.log.find((e) => e.style === ROAD_STYLE && e.path.some(([x, y]) => Math.abs(x - street[0]) < 1e-6 && Math.abs(y - street[1]) < 1e-6));
  assert.deepEqual(st.clips.map((c) => c.kind), ['rect', 'poly']);
  // the square plate outline is not drawn round a shaped zone
  assert.ok(!ctx.log.some((e) => e.kind === 'roundRect'));
  // and every stroke of the base layer is held to the w x h box, so the
  // causeway running off the frame does not run on into the legend row
  assert.ok(ctx.log.length > 0 && ctx.log.every((e) => e.clips[0]?.kind === 'rect'
    && JSON.stringify(e.clips[0].path) === JSON.stringify([[-1, -1], [W + 1, H + 1]])), 'the base layer is clipped to its box (and its pixel of slack)');
});

test('a road that leaves across a land border stays cut there; one that leaves by water does not', () => {
  // a 200 m square whose north edge (pts[2] -> pts[3]) is coast, the rest land
  const sq = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const coast = [false, false, true, false];
  const pier = { pts: [[0, 60], [0, 140]], half: 2 };          // out over the north coast
  const gate = { pts: [[60, 0], [160, 0]], half: 3 };          // out across the east border
  const lane = { pts: [[-50, 0], [50, 0]], half: 3 };          // ashore
  const dip = { pts: [[90, 90], [90, -90]], half: 2 };         // ashore at both ends
  assert.equal(leavesByWater(pier, sq, coast), true);
  assert.equal(leavesByWater(gate, sq, coast), false);
  assert.equal(leavesByWater(lane, sq, coast), false);
  assert.equal(leavesByWater(dip, sq, coast), false);
  assert.equal(leavesByWater(pier, sq, null), false, 'no coast, no water');
  // a road that leaves by the coast but ALSO crosses a land border is cut
  assert.equal(leavesByWater({ pts: [[0, 140], [0, 0], [160, 0]], half: 2 }, sq, coast), false);
  const f = plateFrame(400, W, H), ctx = recorder();
  drawBaseLayers(ctx, { size: 400, shape: sq, coast, tint: '#000', relief: null, roads: [pier, gate, lane], waters: [], footprints: [], camps: [], milestones: [], portals: [] }, f, W, H);
  const clipOf = (r) => ctx.log.find((e) => e.style === ROAD_STYLE && Math.abs(e.path.at(-1)[0] - framePx(f, ...r.pts.at(-1))[0]) < 1e-6 && Math.abs(e.path.at(-1)[1] - framePx(f, ...r.pts.at(-1))[1]) < 1e-6).clips.map((c) => c.kind);
  assert.deepEqual(clipOf(pier), ['rect', 'rect']);
  assert.deepEqual(clipOf(gate), ['rect', 'poly']);
  assert.deepEqual(clipOf(lane), ['rect', 'poly']);
});

test("a square zone's roads are still drawn inside its plate, its rim drawn", () => {
  const roads = [{ pts: [[-400, 0], [0, 0]], half: 3 }];
  const ctx = recorder();
  drawBaseLayers(ctx, {
    size: 340, shape: null, coast: null, tint: '#242a32', relief: null, roads, waters: [],
    footprints: [], camps: [], milestones: [], portals: [],
  }, plateFrame(340, W, H), W, H);
  const s = ctx.log.find((e) => e.style === ROAD_STYLE);
  assert.deepEqual(s.clips.map((c) => c.kind), ['rect', 'roundRect']);
  assert.ok(ctx.log.some((e) => e.kind === 'roundRect' && e.clips.length === 1), 'the plate rim, held only to the box');
});

// ---------- the map audit's base-layer records (2026-10-11) ----------
// A canvas that logs every fill and stroke with the style it was drawn in.
function painter() {
  const log = [];
  let path = [], dash = [];
  const ctx = {
    log, lineCap: 'round', lineJoin: 'round', fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() {}, restore() {}, clip() {}, translate() {}, rotate() {}, drawImage() {}, fillText() {}, arc(x, y, r) { path.push(['arc', x, y, r]); },
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, closePath() {},
    rect() {}, roundRect() {}, setLineDash(d) { dash = d; },
    fill() { log.push({ op: 'fill', style: ctx.fillStyle, path: path.slice() }); },
    stroke() { log.push({ op: 'stroke', style: ctx.strokeStyle, cap: ctx.lineCap, width: ctx.lineWidth, path: path.slice(), dash: dash.slice() }); },
    fillRect(x, y, w, h) { log.push({ op: 'fillRect', style: ctx.fillStyle, r: [x, y, w, h] }); },
    strokeRect(x, y, w, h) { log.push({ op: 'strokeRect', style: ctx.strokeStyle, r: [x, y, w, h], dash: dash.slice() }); },
  };
  return ctx;
}
const base = (o) => ({ size: 400, shape: null, coast: null, tint: '#000', relief: null, roads: [], waters: [], footprints: [], camps: [], milestones: [], portals: [], ...o });

test('a dungeon or a ship is framed on what is walked and its marks, held to the plate', () => {
  // the Mausoleum's layout runs x -110..110, z -118..134 on a 340 m plate
  const f = layoutFrame(340, W, H, [-110, -118, 110, 134], [[56.5, 130.5, 8], [0, -108, 8]]);
  const [x0, y0] = framePx(f, -114, 138), [x1, y1] = framePx(f, 114, -122);
  assert.ok(x0 >= MAP_MARGIN - 1e-6 && x1 <= W - MAP_MARGIN + 1e-6 && y0 >= MAP_MARGIN - 1e-6 && y1 <= H - MAP_MARGIN + 1e-6, 'the floor fits');
  assert.ok(f.S > plateFrame(340, W, H).S * 1.15, `drawn larger than on the plate (${f.S.toFixed(2)} px/m)`);
  // a mark past the plate is held to it
  const g = layoutFrame(340, W, H, [-20, -20, 20, 20], [[0, 400, 8]]);
  assert.ok(Math.abs(g.cz - (-24 + 170) / 2) < 1e-6, 'framed on the floor up to the plate edge, 170 m');
});

test('square-ended paved rectangles, the built spine of a rounded path, walls with their walks', () => {
  const ctx = painter(), f = plateFrame(400, W, H);
  const square = { pts: [[-40, 0], [40, 0]], half: 20, rect: true };
  const path = { pts: [[0, -100], [50, -100], [50, -50]], half: 2, spine: [[0, -100], [40, -96], [50, -50]] };
  drawBaseLayers(ctx, base({ roads: [square, path], walls: [{ pts: [[-100, 100], [100, 100]], half: 3, walk: 2 }] }), f, W, H);
  const roads = ctx.log.filter((e) => e.op === 'stroke' && e.style === ROAD_STYLE);
  assert.equal(roads[0].cap, 'butt', 'a plaza is square-ended');
  assert.equal(roads[1].cap, 'round');
  assert.deepEqual(roads[1].path[1], framePx(f, 40, -96), 'the path is drawn along its spine, not its control polyline');
  const wall = ctx.log.filter((e) => e.op === 'stroke' && e.path.length === 2 && e.path[0][1] === framePx(f, 0, 100)[1]);
  assert.equal(wall.length, 3, 'a wall: its edge, its body, its walk');
  assert.ok(wall[0].width > wall[1].width && wall[1].width > wall[2].width);
});

test('yards are outlines, hidden keep-offs are not drawn, and frameContent ignores them', () => {
  const ctx = painter(), f = plateFrame(400, W, H);
  drawBaseLayers(ctx, base({ footprints: [[0, 0, 10, 10], [50, 0, 30, 30, FP_YARD], [-50, 0, 40, 20, FP_HIDDEN]] }), f, W, H);
  const fills = ctx.log.filter((e) => e.op === 'fillRect' && e.style.startsWith('rgba(30, 34, 46'));
  const outlines = ctx.log.filter((e) => e.op === 'strokeRect');
  assert.equal(fills.length, 1, 'only the building is filled');
  assert.equal(outlines.length, 2, "the building's edge and the yard's outline");
  assert.ok(outlines.some((o) => o.dash.length), 'the yard is dashed');
  const c = frameContent({ camps: [] }, { pts: [[-100, -100], [100, -100], [100, 100], [-100, 100]] }, [], [[0, 0, 4, 4], [90, 90, 200, 200, FP_HIDDEN]]);
  assert.equal(c.runs.length, 4, 'a hidden keep-off frames nothing');
});

test("ice, melt and a sheet's flooded runs in their own colours", () => {
  const ctx = painter(), f = plateFrame(400, W, H);
  drawBaseLayers(ctx, base({ waters: [
    { kind: 'disc', x: 0, z: 0, r: 20, tone: 'ice' },
    { kind: 'ribbon', pts: [[0, 0], [50, 0]], half: 3, tone: 'melt' },
    { kind: 'runs', x0: -100, z0: -50, step: 4, rows: [[0, 9], [2, 4, 7, 9]] },
  ] }), f, W, H);
  assert.ok(ctx.log.some((e) => e.op === 'fill' && e.style === WATER_FILL.ice));
  assert.ok(ctx.log.some((e) => e.op === 'stroke' && e.style === WATER_FILL.melt));
  const runs = ctx.log.filter((e) => e.op === 'fillRect' && e.style === WATER_FILL.water);
  assert.equal(runs.length, 3, 'one rect a run');
  const [x, y, w, h] = runs[0].r, st = 4 * f.S;
  assert.ok(Math.abs(w - (10 * st + 0.6)) < 1e-6 && Math.abs(h - (st + 0.6)) < 1e-6, 'ten cells wide, a cell deep');
  const [ex] = framePx(f, -100 - 2, 0);
  assert.ok(Math.abs(x - (ex - 0.3)) < 1e-6, "the run starts at its first cell's west edge");
  void y;
});

test('a dungeon floor and a deck are filled under everything, with their walls stroked', () => {
  const ctx = painter(), f = plateFrame(400, W, H);
  drawBaseLayers(ctx, base({ floors: [{ pts: [[-2, -2], [2, -2], [2, 2], [-2, 2]], fill: 'rgb(1,2,3)' }], edges: [[-2, 2, 2, 2]] }), f, W, H);
  const i = ctx.log.findIndex((e) => e.op === 'fill' && e.style === 'rgb(1,2,3)');
  assert.ok(i > 0, 'the floor is filled (after the plate)');
  assert.ok(ctx.log.some((e) => e.op === 'stroke' && e.path.length === 2), 'its wall edge');
});
