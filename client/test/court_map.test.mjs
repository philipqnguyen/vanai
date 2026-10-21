// The controlling court's banner on the maps (court-map.ts): where each one
// goes, on the world map one per controlled region the map shows, on the zone
// map inside the frame below the header gap, on the minimap inside the disc
// and clear of its north tab and zoom buttons; and that drawing them touches
// only the context it is handed.
//   node --test          (from client/ -- Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  worldBannerSpots, bannerBox, zoneBannerSpot, minimapBannerSpot, bannerOf, drawWorldBanners, drawZoneBanner, drawMinimapBanner,
} from "../src/court-map.ts";
import { contested } from "../src/court-data.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const COURTS = read("../../shared/data/courts.json");
const ZONES = read("../../shared/data/zones.json");

// map.ts's world map: 560 x 430, T scales the design's points
const W = 560, H = 430;
const WS = 430 / 800, WOX = (W - 910 * WS) / 2;
const T = (x, y) => [WOX + x * WS, y * WS];
const REGIONS = Object.keys(ZONES).map((key, i) => ({ key, x: 120 + (i % 8) * 90, y: 120 + Math.floor(i / 8) * 140 }));

// a canvas context that records what is drawn where, in canvas pixels (it
// follows translate, save and restore: the banners draw in their own frame)
function recorder() {
  const calls = [];
  const pts = [];
  let off = [0, 0];
  const stack = [];
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === "measureText") return (s) => ({ width: String(s).length * 6 });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
      return (...a) => {
        calls.push(k);
        if (k === "save") stack.push(off);
        else if (k === "restore") off = stack.pop() ?? [0, 0];
        else if (k === "translate") off = [off[0] + a[0], off[1] + a[1]];
        else if (["moveTo", "lineTo", "fillText", "fillRect", "arc", "arcTo"].includes(k)) {
          const [x, y] = k === "fillText" ? [a[1], a[2]] : [a[0], a[1]];
          pts.push([x + off[0], y + off[1]]);
        }
      };
    },
    set() { return true; },
  });
  return { ctx, calls, pts };
}

test("courts.json gives every court a banner", () => {
  for (const k of ["caerdun", "heartwood", "moonmere"]) {
    const b = bannerOf(COURTS, k);
    assert.ok(b && /^#[0-9a-f]{6}$/i.test(b.color) && /^#[0-9a-f]{6}$/i.test(b.trim) && b.glyph, k);
  }
  assert.equal(bannerOf(COURTS, "regent"), null);
  assert.equal(bannerOf(COURTS, null), null);
});

test("the world map: one banner per controlled region, beside its dot, inside the map", () => {
  const field = Object.keys(ZONES).filter((k) => contested(ZONES, k));
  const control = { [field[0]]: "caerdun", [field[1]]: "heartwood", [field[2]]: "moonmere" };
  const spots = worldBannerSpots(REGIONS, control, T);
  assert.deepEqual(spots.map((s) => s.key).sort(), field.slice(0, 3).sort());
  for (const s of spots) {
    const r = REGIONS.find((g) => g.key === s.key);
    const [dx, dy] = T(r.x, r.y);
    assert.equal(s.court, control[s.key]);
    assert.ok(Math.hypot(s.x - dx, s.y - dy) < 10, "beside the dot");
    assert.ok(s.y - s.size > 0 && s.x + s.size < W, "inside the canvas");
    assert.ok(s.y < dy + 10, "above the region's name, which sits 19 px below the dot");
  }
  // a region listed twice draws one banner, and a fogged one none
  assert.equal(worldBannerSpots([...REGIONS, REGIONS.find((r) => r.key === field[0])], control, T).length, 3);
  assert.equal(worldBannerSpots(REGIONS, control, T, (k) => k !== field[1]).length, 2);
  assert.equal(worldBannerSpots(REGIONS, {}, T).length, 0);
});

test("the zone map: the banner sits in the frame's top-left, below the header gap", () => {
  const top = 10;
  const s = zoneBannerSpot(top);
  assert.ok(s.x > 0 && s.y > top && s.y + s.size < H - 26, "inside the map box, above the legend");
  const { ctx, pts, calls } = recorder();
  drawZoneBanner(ctx, "glassworks", top, { glassworks: "moonmere" }, COURTS);
  assert.ok(calls.includes("fillText"));
  assert.ok(pts.every(([x, y]) => x >= 0 && x <= 260 && y >= top && y <= top + 40), "drawn in the corner");
  const none = recorder();
  drawZoneBanner(none.ctx, "reservoir", top, { glassworks: "moonmere" }, COURTS);
  assert.equal(none.calls.length, 0, "an uncontrolled zone draws nothing");
});

test("the minimap: the pennant is inside the disc, at its top-left", () => {
  const S = 172, C = S / 2;
  const s = minimapBannerSpot(S);
  const corners = [[s.x, s.y], [s.x + s.size * 0.66, s.y], [s.x, s.y + s.size], [s.x + s.size * 0.66, s.y + s.size]];
  for (const [x, y] of corners) assert.ok(Math.hypot(x - C, y - C) < C - 2, `corner ${x},${y} inside the ring`);
  assert.ok(s.x < C - 30 && s.y < C - 30, "top-left");
  assert.ok(Math.abs(s.x + s.size * 0.33 - C) > 25, "clear of the north tab");
  assert.ok(s.y + s.size < S - 50, "clear of the zoom buttons at the bottom left");
  const { ctx, pts } = recorder();
  drawMinimapBanner(ctx, "northroad", S, { northroad: "heartwood" }, COURTS);
  assert.ok(pts.length > 0 && pts.every(([x, y]) => Math.hypot(x - C, y - C) < C), "drawn inside the ring");
});

test("the drawing only touches the context and draws one banner per held region", () => {
  const { ctx, calls } = recorder();
  drawWorldBanners(ctx, REGIONS, { northroad: "caerdun", glassworks: "heartwood" }, COURTS, T);
  const crossbars = calls.filter((c) => c === "save").length;
  assert.ok(crossbars >= 2, "both banners drawn");
  const none = recorder();
  drawWorldBanners(none.ctx, REGIONS, {}, COURTS, T);
  assert.equal(none.calls.length, 0);
});

test("a world banner that would sit on a neighbour's name moves to a clear place", () => {
  const field = Object.keys(ZONES).filter((k) => contested(ZONES, k)).sort();
  const one = [{ key: field[0], x: 300, y: 300 }];
  const control = { [field[0]]: "heartwood" };
  const [dx, dy] = T(300, 300);
  const first = worldBannerSpots(one, control, T)[0];
  assert.deepEqual([first.x, first.y], [dx + 6, dy - 3], "up-right by default");
  // a neighbour's name right where the default banner hangs
  const name = [dx + 2, dy - 20, dx + 40, dy - 8];
  const moved = worldBannerSpots(one, control, T, undefined, [name])[0];
  const b = bannerBox(moved);
  assert.ok(!(b[0] < name[2] && name[0] < b[2] && b[1] < name[3] && name[1] < b[3]), "clear of the name");
  assert.ok(moved.x < dx, "to the left of the dot");
  assert.ok(Math.hypot(moved.x - dx, moved.y - dy) < 20, "still beside its dot");
  // nowhere clear: the default stays when every try is as covered
  const wall = [dx - 60, dy - 60, dx + 60, dy - 1];
  const kept = worldBannerSpots(one, control, T, undefined, [wall])[0];
  assert.deepEqual([kept.x, kept.y], [dx + 6, dy - 3]);
});
