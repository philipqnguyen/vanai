// World map + zone maps. The world map shows Ardenfell with fog over regions
// the character has not visited; clicking a visited region opens its zone map.
import { state } from "./state";
import { ZONES, MONSTERS, QUESTS } from "./data";
import { zoneFootprints, zoneMapLayers, groundHeight, zoneShape, type MapLayers } from "./scene";
import { dungeonPlan, type DungeonPlan, type DungeonZoneData } from "./dungeon-plan";
import FERRY from "@data/ferry.json";
import { activeQuestDestinations, focusDestinations, npcMarkerFor, portalVisible, questDestinations, shutCrossings, visiblePortals, MAIN_COLOR, SIDE_COLOR, GUILD_COLOR } from "./quest_index";
import { questColor } from "./quest_rules";
import { focusPulse, pulseSpots, type PulseSpot } from "./map_focus";
import { drawCourtBountyPins, drawCourtWorldBanners, drawCourtZoneBanner } from "./court-hud";
import {
  crystalIcon, crossingIcon, CROSSING_COLOR, drawBaseLayers, frameContent, framePx, layoutFrame, minimapBase, zoneFrame, zoneMapBox, zoneMapPx, WATER_FILL,
  type Bounds, type MapFrame, type MapRoad, type MapWater, type MapWall, type MapFootprint, type P2,
} from "./map_frame";
import {
  drawServiceIcon, isServiceKind, legendRows, placeLabels, serviceNpcIds, serviceRadius, zoneServices,
  LEGEND_ICON, SERVICE_KINDS, SERVICE_STYLE, type LegendEntry, type ServiceMark,
} from "./map_services";

// Labels placed one by one, highest priority first (map_services.ts
// placeLabels' spots): each tried hard by its mark, then a step and two
// further out -- a crowded square or the middle provinces have no room in the
// eight spots hard by -- and only a `must` label, finding none, printed at its
// first spot whatever it meets. Returns each label's spot or null.
type LabelSpotT = ReturnType<typeof placeLabels>[number];
function placeOut(items: { x: number; y: number; r: number; w: number; h: number; must?: boolean }[], W: number, H: number, obstacles: [number, number, number, number][], taken?: [number, number, number, number][]): LabelSpotT[] {
  const occupied = taken || obstacles.slice();
  if (taken) occupied.push(...obstacles);
  return items.map((it) => {
    for (const extra of [0, 6, 12]) {
      const [at] = placeLabels([{ ...it, r: it.r + extra, must: false }], W, H, occupied);
      if (at) {
        const x0 = at.align === "center" ? at.x - it.w / 2 : at.align === "left" ? at.x : at.x - it.w;
        occupied.push([x0, at.y - it.h * 0.8, x0 + it.w, at.y + it.h * 0.2]);
        return at;
      }
    }
    return it.must ? placeLabels([it], W, H, [])[0] : null;
  });
}

// The crystal glyph lives with the base layer (map_frame.ts); the minimap
// (hud.ts) takes it from here, as it always has.
export { crystalIcon };

// The world map is the design's continent (tools/design/gen_worldmap.py, the
// 900x800 Ardenfell in design/the-empty-throne.html) scaled uniformly onto the
// 560x430 canvas: the same coast, the same crescent, the same places, so the
// map a player opens is the map the world was built to. Positions below are in
// the design's coordinates; T() carries them onto the canvas.
const DESIGN_W = 900, DESIGN_H = 800;
const WS = 430 / DESIGN_H;                 // uniform scale (0.5375), the height is the tight side
const WOX = (560 - DESIGN_W * WS) / 2;     // centred horizontally
function T(x: number, y: number): [number, number] { return [WOX + x * WS, y * WS]; }
const COAST: [number, number][] = [
  [300, 150], [380, 120], [470, 135], [560, 118], [640, 150], [700, 195], [722, 260], [684, 306], [664, 352],
  [735, 395], [712, 465], [640, 520], [600, 590], [548, 648], [492, 688], [470, 730], [416, 656], [372, 722],
  [292, 566], [240, 532], [322, 478], [316, 424], [198, 398], [174, 340], [212, 284], [244, 262], [204, 246], [246, 226], [268, 172],
];
// the design's CX, CY (gen_worldmap.py): at (455, 380) the whole ring sat 15
// units north of the design's, and the Border Wall's point fell on its line
const CRESCENT_C: [number, number] = [450, 395];
const crescentR = (a: number) => 152 + 20 * Math.sin(a * 2.3 + 1.2) + 10 * Math.sin(a * 4.7);
const CRESCENT_GAPS: [number, number][] = [[207, 223], [340, 356], [88, 114]]; // the three doors, in degrees
// A dungeon's diamond stands off its field zone's point toward the door it is
// entered by (the portal's bearing in the field zone): the Mausoleum's door is
// north-west in the Hunting Wood, the Furnace Hall's north in the Glassworks,
// the Beacon Fort's east in the Burned Land, the Bell Tower's north-east in the
// Reservoir, the Overseer's Lodge's north-east in the Timber Estates -- the map
// had each on the far side (map audit; the design's Mausoleum, at 376,330 in
// gen_worldmap.py, is on the wrong side too). The two Capitals share a point:
// drawWorld draws the one this character goes to (capitalShown).
export const REGIONS: { key: string; x: number; y: number; kind: "city" | "town" | "field" | "dungeon" }[] = [
  // the free lands
  { key: "caerdun", x: 258, y: 242, kind: "city" },
  { key: "caerdunfields", x: 306, y: 274, kind: "field" },
  { key: "northroad", x: 452, y: 200, kind: "field" },
  { key: "heartwoodfields", x: 642, y: 420, kind: "field" },
  { key: "heartwood", x: 694, y: 386, kind: "city" },
  { key: "shoreroad", x: 596, y: 526, kind: "field" },
  { key: "moonmereshores", x: 452, y: 640, kind: "field" },
  { key: "moonmere", x: 418, y: 744, kind: "city" },
  // the doorsteps
  { key: "huntingwood", x: 352, y: 302, kind: "field" },
  { key: "mausoleum", x: 338, y: 290, kind: "dungeon" },
  { key: "timberestates", x: 560, y: 330, kind: "field" },
  { key: "overseerslodge", x: 578, y: 316, kind: "dungeon" },
  { key: "summerlakes", x: 452, y: 522, kind: "field" },
  { key: "sunkenballroom", x: 434, y: 508, kind: "dungeon" },
  // the middle provinces
  { key: "reservoir", x: 346, y: 388, kind: "field" },
  { key: "belltower", x: 360, y: 376, kind: "dungeon" },
  { key: "kingsgardens", x: 484, y: 292, kind: "field" },
  { key: "glasshouse", x: 506, y: 304, kind: "dungeon" },
  { key: "glassworks", x: 556, y: 456, kind: "field" },
  { key: "furnacehall", x: 556, y: 438, kind: "dungeon" },
  { key: "canalworks", x: 382, y: 494, kind: "field" },
  { key: "greatsluice", x: 366, y: 508, kind: "dungeon" },
  { key: "granaryplains", x: 466, y: 482, kind: "field" },
  { key: "greatgranary", x: 484, y: 494, kind: "dungeon" },
  { key: "borderwall", x: 455, y: 240, kind: "field" },
  { key: "greatwatchtower", x: 474, y: 246, kind: "dungeon" },
  // the fire line and what it rings
  { key: "burnedland", x: 455, y: 340, kind: "field" },
  { key: "beaconfort", x: 478, y: 344, kind: "dungeon" },
  { key: "capital", x: 455, y: 384, kind: "field" },
  { key: "keep", x: 455, y: 368, kind: "dungeon" },
  { key: "capitalreturned", x: 455, y: 384, kind: "city" },
];

// A zone's records as the build cached them in localStorage (scene.ts writes
// vanai_map_<key> / vanai_fp_<key>), parsed once per stored string. The open
// map redraws four times a second, and a zone read from the cache -- one the
// player is not standing in: a pinned view, the Journal's "Show on map", a
// world-map click -- used to be parsed into new objects every time, so the
// per-road by-water memo (map_frame.ts leavesByWater) and the frame memo below
// never hit and Moonmere's roads were classified against its 275-edge coast
// twice a redraw (~25 ms). Keeping the parse keeps the objects.
const lsCache = new Map<string, { raw: string | null; v: unknown }>();
function cachedRecord<T>(name: string, parse: (raw: string | null) => T): T {
  let raw: string | null = null;
  try { raw = localStorage.getItem(name); } catch { /* no storage: parse(null) */ }
  const hit = lsCache.get(name);
  if (hit && hit.raw === raw) return hit.v as T;
  const v = parse(raw);
  lsCache.set(name, { raw, v });
  return v;
}

// The roads and water a zone map draws come from the zone's own builders
// (scene.ts zoneMapLayers, registered by makePath / makeRiver / makePond as
// the zone is built) -- live for the zone you stand in, from the cache the
// build wrote for any zone you have walked before.
function layersFor(key: string): MapLayers {
  const live = zoneMapLayers[key];
  if (live && (live.roads.length || live.waters.length)) return live;
  return cachedRecord(`vanai_map_${key}`, (raw) => {
    try { return JSON.parse(raw || "") || { roads: [], waters: [] }; } catch { return { roads: [], waters: [] }; }
  });
}

const visited = (key: string) => state.discoveries.has(`zone_${key}`);

// The two Capitals stand on one point. The returned city is this character's
// once cap3 opens the Burned Land's gate to it (quest_rules portalShown, the
// gate's own rule); the empty one otherwise, and whenever they stand in it
// (Warden Morrow takes a party there at any time).
function capitalShown(): "capital" | "capitalreturned" {
  if (state.zone === "capital") return "capital";
  if (state.zone === "capitalreturned") return "capitalreturned";
  const gate = ((ZONES.burnedland?.portals as any[]) || []).find((p) => p.id === "bl_capital");
  return gate && portalVisible(gate) ? "capitalreturned" : "capital";
}

// The gulf ferry's crossing, in the design's coordinates: from the Caerdun
// Fields' north coast (the ship berths at (-53, 282) there) out of the fjord,
// down the Western Gulf, and in to the Moonmere Shores' south-west shore
// (ship at (-190, -258)) -- the old line, copied from the design, joined
// neither port. The voyage zones are drawn at its middle.
// (round the Shores' south-west lobe by its cape, into the bay the causeway
// leaves from: the straight run crossed the lobe's land)
const FERRY_ROUTE: [number, number][] = [[240, 260], [214, 254], [186, 264], [160, 320], [148, 400], [184, 476], [232, 552], [280, 640], [326, 706], [370, 724], [398, 700], [404, 676]];

let view: { mode: "world" } | { mode: "zone"; key: string } = { mode: "world" };
// true while the player is deliberately reading some other zone's map, which
// stops the open window from snapping back to them when they cross a border
let viewPinned = false;
let getPos: (() => { x: number; z: number; h: number }) | null = null;

// (null: no arrow -- the /?zonemap= view, where world.ts's provider, loaded
// with main.ts, would put a player at the origin who is not there)
export function setPosProvider(fn: (() => { x: number; z: number; h: number }) | null): void { getPos = fn; }

// opening the map should always land on where the character is standing
export function resetMapView(): void {
  viewPinned = false;
  focusQuest = null;
  if (state.zone && ZONES[state.zone]) view = { mode: "zone", key: state.zone };
  else view = { mode: "world" };
}

// The Journal's "Show on map": reading some other zone's map is on purpose,
// so it is pinned and crossing a border does not snap it back — but the zone
// you stand in stays unpinned and follows you, as the world-map click does.
// A zone not yet walked is still fog, so it opens the world map instead of
// revealing it. The caller opens the window first (toggleWindow resets the
// view on open); an open window is redrawn here. With a quest, its
// destinations pulse on the map (map_focus.ts) until the map is next opened
// afresh: a diamond among a dozen others is easy to lose.
export function showZoneOnMap(key: string, quest: string | null = null): void {
  const zoneView = !!ZONES[key] && (visited(key) || key === state.zone);
  viewPinned = zoneView && key !== state.zone;
  view = zoneView ? { mode: "zone", key } : { mode: "world" };
  focusQuest = quest && QUESTS[quest] ? { quest, zone: key } : null;
  const w = document.getElementById("win-map");
  const body = w?.querySelector(".wbody") as HTMLElement | null;
  if (w?.classList.contains("on") && body) renderMapWindow(body);
}

// the zone map is live while the window is open — party, monsters and the
// player's own arrow all move, so redraw the canvas a few times a second
let lastLive = 0;
export function tickMapWindow(): void {
  const w = document.getElementById("win-map");
  if (!w || !w.classList.contains("on") || view.mode !== "zone") return;
  // crossing into a new zone with the map open: follow the character, header
  // and all, unless they went off browsing another region on purpose
  if (!viewPinned && view.key !== state.zone && state.zone && ZONES[state.zone]) {
    view = { mode: "zone", key: state.zone };
    const body = w.querySelector(".wbody") as HTMLElement | null;
    if (body) { renderMapWindow(body); return; }
  }
  const now = performance.now();
  if (now - lastLive < 250) return;
  lastLive = now;
  const cv = w.querySelector("canvas.mapcv") as HTMLCanvasElement | null;
  if (cv) drawZone(cv, view.key, { scale: mapScale });
}

// The map is drawn in the 560x430 units every layout below was tuned in, and
// scaled up to whatever the window gives it (style.css #win-map): the backing
// store matches the canvas's on-screen size times the device's pixel ratio,
// so a bigger map is a sharper one, not a blurred stretch.
const MAP_W = 560, MAP_H = 430;
let mapScale = 1;
// the quest whose destinations pulse, and the zone the Journal sent it to
let focusQuest: { quest: string; zone: string } | null = null;
let pulseRaf = 0;

export function renderMapWindow(body: HTMLElement): void {
  if (view.mode === "zone" && !ZONES[view.key]) view = { mode: "world" };
  body.innerHTML = "";
  const head = document.createElement("div");
  head.className = "maphead";
  if (view.mode === "zone") {
    const back = document.createElement("button");
    back.className = "btn";
    back.textContent = "◂ Ardenfell";
    back.addEventListener("click", () => { view = { mode: "world" }; renderMapWindow(body); });
    head.appendChild(back);
    const title = document.createElement("span");
    title.className = "maptitle";
    title.textContent = ZONES[view.key]?.name || view.key;
    head.appendChild(title);
  } else {
    head.innerHTML = `<span class="maptitle">Ardenfell</span>
      <span class="mapnote">— fogged regions are places you have not yet walked</span>`;
  }
  if (focusQuest) {
    // what the pulsing mark is for, in the duty's colour; × stops the pulse
    const chip = document.createElement("span");
    chip.className = "mapfocus";
    chip.style.setProperty("--qc", questColor(focusQuest.quest));
    const name = document.createElement("span");
    name.className = "mapfocus-name";
    name.textContent = QUESTS[focusQuest.quest]?.name || focusQuest.quest;
    const x = document.createElement("button");
    x.className = "mapfocus-x";
    x.type = "button";
    x.setAttribute("aria-label", "Stop marking this duty");
    x.textContent = "×";
    x.addEventListener("click", () => { focusQuest = null; renderMapWindow(body); });
    chip.append(name, x);
    head.appendChild(chip);
  }
  body.appendChild(head);
  const wrap = document.createElement("div");
  wrap.className = "mapwrap";
  const cv = document.createElement("canvas");
  cv.className = "mapcv";
  wrap.appendChild(cv);
  body.appendChild(wrap);
  // measured once in place: the window is already showing when this runs
  const cssW = cv.clientWidth || MAP_W;
  mapScale = (cssW / MAP_W) * (window.devicePixelRatio || 1);
  cv.width = Math.round(MAP_W * mapScale);
  cv.height = Math.round(MAP_H * mapScale);
  if (view.mode === "world") drawWorld(cv, body, { scale: mapScale });
  else drawZone(cv, view.key, { scale: mapScale });
  startPulse(wrap);
}

// Redraw at the new size when the window is resized with the map open: the
// window's width follows the viewport (style.css), the canvas follows it.
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const w = document.getElementById("win-map");
    const body = w?.querySelector(".wbody") as HTMLElement | null;
    if (w?.classList.contains("on") && body) renderMapWindow(body);
  }, 120);
});

// Where the focused quest's marks sit on this view, in map units: each of its
// destinations in the zone shown, or on the world map the region it is in.
function focusSpots(): PulseSpot[] {
  if (!focusQuest) return [];
  const { quest, zone } = focusQuest;
  if (view.mode === "world") {
    const r = REGIONS.find((g) => g.key === zone);
    if (!r) return [];
    const [x, y] = T(r.x, r.y);
    return [{ x, y, r: 9 }];
  }
  const key = view.key;
  const box = zoneMapBox(MAP_W, MAP_H);
  const frame = zoneMapFrame(key, box.w, box.h);
  return pulseSpots(focusDestinations(quest)
    .filter((d) => d.zone === key)
    .map((d) => { const [x, y] = zoneMapPx(frame, d.x, d.z); return { x, y, r: d.kind === "camp" ? 7 : 5 }; }));
}

// The pulse is its own canvas over the map, redrawn every frame on its own:
// the map under it redraws four times a second at most, and a whole zone map
// at sixty would be a waste for one ring.
function startPulse(wrap: HTMLElement): void {
  cancelAnimationFrame(pulseRaf);
  pulseRaf = 0;
  const spots = focusSpots();
  if (!focusQuest || !spots.length) return;
  const color = questColor(focusQuest.quest);
  const ov = document.createElement("canvas");
  ov.className = "mappulse";
  ov.width = Math.round(MAP_W * mapScale);
  ov.height = Math.round(MAP_H * mapScale);
  wrap.appendChild(ov);
  const ctx = ov.getContext("2d")!;
  const t0 = performance.now();
  const frame = (now: number) => {
    // a redraw replaced the overlay, or the window closed: let the loop end
    if (!ov.isConnected || !document.getElementById("win-map")?.classList.contains("on")) { pulseRaf = 0; return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.setTransform(mapScale, 0, 0, mapScale, 0, 0);
    focusPulse(ctx, spots, color, (now - t0) / 1000);
    pulseRaf = requestAnimationFrame(frame);
  };
  pulseRaf = requestAnimationFrame(frame);
}

// The world map's dev-view knobs (zonemapview.ts, /?zonemap=world): who counts
// as visited (every region, for an audit, instead of this character's walk),
// what a click on a region does, and the backing scale of a crisp shot.
export interface WorldMapOpts { visited?: (key: string) => boolean; onPick?: (key: string) => void; scale?: number }
export function drawWorld(cv: HTMLCanvasElement, body: HTMLElement | null, opts: WorldMapOpts = {}): void {
  const ctx = cv.getContext("2d")!;
  const k = opts.scale || 1;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const W = cv.width / k, H = cv.height / k;
  const isSeen = opts.visited || visited;
  // dusk sea
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#0c1220");
  sea.addColorStop(1, "#101828");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, H);
  // Ardenfell, the design's coast: a smooth closed curve through its points
  const smoothPath = (pts: [number, number][]) => {
    const P = pts.map(([x, y]) => T(x, y));
    ctx.beginPath();
    const n = P.length;
    let [mx, my] = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2];
    ctx.moveTo(mx, my);
    for (let k = 0; k < n; k++) {
      const [cx, cy] = P[k], [nx, ny] = P[(k + 1) % n];
      mx = (cx + nx) / 2; my = (cy + ny) / 2;
      ctx.quadraticCurveTo(cx, cy, mx, my);
    }
    ctx.closePath();
  };
  smoothPath(COAST);
  ctx.fillStyle = "#232a1f";
  ctx.fill();
  ctx.strokeStyle = "#3a4438";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Moonmere's island and the causeway to it; the Stray Isles
  const isle = (cx: number, cy: number, r: number, n = 8) =>
    smoothPath([...Array(n)].map((_, k) => [cx + Math.cos(k / n * Math.PI * 2) * r * (1 + 0.16 * Math.sin(k * 2.7)), cy + Math.sin(k / n * Math.PI * 2) * r * (1 + 0.16 * Math.cos(k * 1.9))] as [number, number]));
  [[418, 744, 20], [672, 660, 26], [730, 610, 15], [636, 712, 12]].forEach(([cx, cy, r]) => { isle(cx, cy, r); ctx.fillStyle = "#232a1f"; ctx.fill(); ctx.stroke(); });
  ctx.strokeStyle = "rgba(200,190,160,0.6)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(...T(416, 662)); ctx.lineTo(...T(418, 726)); ctx.stroke();  // the causeway
  // the gulf ferry, port to port (FERRY_ROUTE), a smooth curve through its points
  ctx.strokeStyle = "rgba(170,190,220,0.55)";
  ctx.beginPath();
  {
    const P = FERRY_ROUTE.map(([x, y]) => T(x, y));
    ctx.moveTo(...P[0]);
    for (let k = 1; k < P.length - 1; k++) ctx.quadraticCurveTo(P[k][0], P[k][1], (P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2);
    ctx.lineTo(...P[P.length - 1]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // rivers and lakes
  ctx.strokeStyle = "#1a2334";
  ctx.lineCap = "round";
  ([[[468, 262], [462, 320], [447, 380], [440, 442], [444, 500], [448, 538]], [[330, 300], [344, 368]], [[360, 404], [398, 452], [430, 478]], [[438, 546], [432, 578], [424, 612], [430, 648], [440, 688]]] as [number, number][][]).forEach((r, k) => {
    ctx.lineWidth = k === 0 ? 2.2 : 1.6;
    ctx.beginPath();
    r.forEach(([x, y], q) => { const [a2, b2] = T(x, y); if (q === 0) ctx.moveTo(a2, b2); else ctx.lineTo(a2, b2); });
    ctx.stroke();
  });
  ctx.fillStyle = "#1a2334";
  [[352, 388, 17], [438, 512, 12], [470, 528, 8]].forEach(([cx, cy, r]) => { const [a2, b2] = T(cx, cy); ctx.beginPath(); ctx.arc(a2, b2, r * WS, 0, Math.PI * 2); ctx.fill(); });
  // the border crescent: a dashed line with peaks on it, open at the three doors
  const [ccx, ccy] = CRESCENT_C;
  ctx.strokeStyle = "rgba(180,186,200,0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let k = 0; k <= 72; k++) { const a2 = k / 72 * Math.PI * 2, r = crescentR(a2); const [px2, py2] = T(ccx + r * Math.cos(a2), ccy + r * Math.sin(a2)); if (k === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2); }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#3d4148";
  for (let k = 0; k < 150; k++) {
    const deg = k * 2.4;
    if (CRESCENT_GAPS.some(([lo, hi]) => deg >= lo && deg <= hi)) continue;
    const a2 = deg * Math.PI / 180, r = crescentR(a2) + Math.sin(k * 1.7) * 5;
    const [px2, py2] = T(ccx + r * Math.cos(a2), ccy + r * Math.sin(a2));
    const sz = 3 + 1.5 * Math.abs(Math.sin(k * 0.9));
    ctx.beginPath(); ctx.moveTo(px2 - sz, py2 + sz * 0.8); ctx.lineTo(px2, py2 - sz); ctx.lineTo(px2 + sz, py2 + sz * 0.8); ctx.closePath(); ctx.fill();
  }
  // the north-west highlands behind Caerdun, south-west to north-east
  // parallel to the fjord coast, as the design lays them
  for (let k = 0; k < 16; k++) {
    const t = k / 15;
    const [px2, py2] = T(236 + 60 * t + Math.sin(k * 2.1) * 6, 300 - 95 * t + Math.cos(k * 1.7) * 5);
    ctx.beginPath(); ctx.moveTo(px2 - 4, py2 + 3); ctx.lineTo(px2, py2 - 4); ctx.lineTo(px2 + 4, py2 + 3); ctx.closePath(); ctx.fill();
  }
  // the seas and the waters' names; the region names below keep off them
  ctx.fillStyle = "rgba(150,160,200,0.35)";
  ctx.font = "italic 11px serif";
  ctx.textAlign = "center";
  const seaRects: [number, number, number, number][] = [];
  for (const [text, x, y] of [["the Western Gulf", 120, 548], ["Heartwood Bay", 800, 300], ["the Southern Sea", 640, 776], ["the fjords", 196, 212],
    ["the Stray Isles", 705, 655], ["the ferry", 112, 446]] as [string, number, number][]) {
    const [tx, ty] = T(x, y), w = ctx.measureText(text).width;
    ctx.fillText(text, tx, ty);
    seaRects.push([tx - w / 2, ty - 9, tx + w / 2, ty + 2]);
  }
  // the crossings between the provinces walked: a faint line for each zones.json
  // portal pair between two visited, non-dungeon regions -- but none through a
  // gate still shut for this character (a Border Gate before inn2), from
  // either side (quest_rules closedCrossings, portalShown's own rule)
  const regionAt = new Map(REGIONS.map((r) => [r.key, r]));
  const shut = shutCrossings();
  const shownRegion = (key: string) => (key === "capital" || key === "capitalreturned") ? capitalShown() === key : true;
  ctx.strokeStyle = "rgba(200,190,160,0.16)";
  ctx.lineWidth = 1;
  const drawnLinks = new Set<string>();
  for (const r of REGIONS) {
    if (r.kind === "dungeon" || !shownRegion(r.key) || !isSeen(r.key)) continue;
    for (const p of (ZONES[r.key]?.portals as any[]) || []) {
      const o = regionAt.get(p.to);
      if (!o || o.kind === "dungeon" || !shownRegion(o.key) || !isSeen(o.key)) continue;
      const id = [r.key, o.key].sort().join("|");
      if (drawnLinks.has(id) || shut.has(id)) continue;
      drawnLinks.add(id);
      ctx.beginPath(); ctx.moveTo(...T(r.x, r.y)); ctx.lineTo(...T(o.x, o.y)); ctx.stroke();
    }
  }
  // regions: the marks, then every name placed at once (map_services.ts
  // placeLabels) so none prints over another -- 31 names used to pile up in
  // the middle provinces. Fields and cities keep theirs; a dungeon's, in a
  // smaller hand, is left off where it fits nowhere.
  ctx.textAlign = "center";
  const names: { text: string; font: string; color: string; x: number; y: number; r: number; must: boolean }[] = [];
  const markRects: [number, number, number, number][] = [...seaRects];
  const atSea = state.zone && isVoyage(state.zone);
  REGIONS.forEach((rg) => {
    if (!ZONES[rg.key] || !shownRegion(rg.key)) return;
    const [rx, ry] = T(rg.x, rg.y);
    const kind = rg.key === "capital" ? "field" : rg.kind;
    const seen = isSeen(rg.key);
    markRects.push([rx - 5, ry - 5, rx + 5, ry + 5]);
    if (!seen) {
      const fog = ctx.createRadialGradient(rx, ry, 4, rx, ry, 30);
      fog.addColorStop(0, "rgba(24,28,40,0.95)");
      fog.addColorStop(1, "rgba(24,28,40,0)");
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(rx, ry, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6a7288";
      ctx.font = "13px serif";
      ctx.fillText("?", rx, ry + 4);
      return;
    }
    ctx.fillStyle = kind === "city" ? "#c9a35c" : kind === "town" ? "#d8c48a" : kind === "dungeon" ? "#a58fd8" : "#9ab48e";
    if (kind === "dungeon") {
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(rx, ry, kind === "field" ? 4 : 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.zone === rg.key) {
      ctx.strokeStyle = "#c9a35c";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    names.push(kind === "dungeon"
      ? { text: ZONES[rg.key].name, font: "9.5px sans-serif", color: "#b9b0d8", x: rx, y: ry, r: 5, must: false }
      : { text: ZONES[rg.key].name, font: "11px sans-serif", color: "#d8dce8", x: rx, y: ry, r: 6, must: true });
  });
  // aboard the ferry: where on the crossing you are -- its middle, there
  // being no more to say -- named for the voyage
  if (atSea) {
    const mid = FERRY_ROUTE[Math.floor(FERRY_ROUTE.length / 2)];
    const [mx, my] = T(mid[0], mid[1]);
    ctx.strokeStyle = "#c9a35c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, Math.PI * 2);
    ctx.stroke();
    const to = voyageDestination(state.zone);
    names.unshift({ text: to ? `aboard, bound for ${ZONES[to]?.name || to}` : ZONES[state.zone]?.name || state.zone, font: "11px sans-serif", color: "#e8d6a8", x: mx, y: my, r: 9, must: true });
  }
  // fields and cities before dungeons, whatever REGIONS' order (placeOut)
  const order = names.map((_, i) => i).sort((p, q) => Number(names[q].must) - Number(names[p].must));
  const spotsW = placeOut(order.map((i) => { ctx.font = names[i].font; return { x: names[i].x, y: names[i].y, r: names[i].r, w: ctx.measureText(names[i].text).width, h: 11, must: names[i].must }; }), W, H, markRects);
  order.forEach((i, k) => {
    const at = spotsW[k];
    if (!at) return;
    const n = names[i];
    ctx.font = n.font;
    ctx.textAlign = at.align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(12,16,26,0.85)";
    ctx.strokeText(n.text, at.x, at.y);
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, at.x, at.y);
  });
  ctx.textAlign = "center";
  drawCourtWorldBanners(ctx, REGIONS, T, isSeen); // the controlling courts' banners (court-hud.ts)
  // click → zone map
  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect();
    const sx = W / rect.width, sy = H / rect.height;
    const mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy;
    for (const r of REGIONS) {
      if (!ZONES[r.key] || !isSeen(r.key) || !shownRegion(r.key)) continue;
      const [rx, ry] = T(r.x, r.y);
      if (Math.hypot(mx - rx, my - ry) < 16) {
        if (opts.onPick || !body) { opts.onPick?.(r.key); return; }
        viewPinned = r.key !== state.zone;
        view = { mode: "zone", key: r.key };
        renderMapWindow(body);
        return;
      }
    }
  };
}

const TINTS: Record<string, string> = {
  caerdun: "#2a3040", heartwood: "#22301e", moonmere: "#252a40",
  caerdunfields: "#243222", heartwoodfields: "#26321e", moonmereshores: "#223430",
  northroad: "#2c3340", shoreroad: "#34322a",
  huntingwood: "#1f2c1c", timberestates: "#28301f", summerlakes: "#213229",
  reservoir: "#20303a", kingsgardens: "#2a3230", glassworks: "#3a3424",
  canalworks: "#26301f", granaryplains: "#383420", borderwall: "#28303c",
  burnedland: "#332a26", capital: "#2c2a30", capitalreturned: "#3a3426",
  mausoleum: "#26222e", overseerslodge: "#2a2620", sunkenballroom: "#1c2836",
  belltower: "#1c2a34", glasshouse: "#28303a", furnacehall: "#3a2a20",
  greatsluice: "#20302a", greatgranary: "#332c1e", greatwatchtower: "#2a2e3a",
  beaconfort: "#301f1c", keep: "#2c2630",
};

// ---------- terrain relief ----------
// groundHeight only knows the zone currently loaded in the engine, so relief is
// sampled when that zone is first drawn and cached until the zone changes. It
// is sampled once, over the whole plate (the old sampling, exactly), and drawn
// under whatever frame the map uses: the box's clip shows the part it frames.
// Not per framed rectangle -- a shaped zone's frame moves while the zone is
// still building, and each new rectangle would cost 3,136 groundHeight calls.
const RELIEF_N = 56;
let relief: { key: string; cv: HTMLCanvasElement } | null = null;

function reliefFor(key: string, rect: Bounds): HTMLCanvasElement | null {
  if (key !== state.zone || !ZONES[key]) return null;
  if (relief && relief.key === key) return relief.cv;
  const n = RELIEF_N;
  const sx = (rect[2] - rect[0]) / (n - 1), sz = (rect[3] - rect[1]) / (n - 1);
  const hs = new Float32Array(n * n);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < n; j++) {
    const wz = rect[3] - j * sz;
    for (let i = 0; i < n; i++) {
      const h = groundHeight(rect[0] + i * sx, wz);
      hs[j * n + i] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const span = Math.max(1, hi - lo);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = hs[j * n + i];
      // light from the north-west, plus a touch of plain elevation
      const slope = (h - hs[j * n + Math.max(0, i - 1)]) + (h - hs[Math.max(0, j - 1) * n + i]);
      const v = Math.max(0, Math.min(1, 0.5 + slope * 0.09 + ((h - lo) / span - 0.5) * 0.45));
      const o = (j * n + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  relief = { key, cv };
  return cv;
}

// ---------- shared static layers ----------
function footprintsFor(key: string): MapFootprint[] {
  const live = zoneFootprints[key];
  if (live && live.length) return live;
  return cachedRecord(`vanai_fp_${key}`, (raw) => { try { return JSON.parse(raw || "[]"); } catch { return []; } });
}

// What the map draws: the keep-off records (roads, waters, footprints) and the
// map's own (MapLayers.extra: wall walks, ice, flumes, sheets, structures the
// zone keeps clear by other means) in one list each. Kept while the records
// are the same objects at the same lengths, so the frame memo below and the
// by-water memo (map_frame.ts) see the same road objects every redraw.
interface Drawn { roads: MapRoad[]; waters: MapWater[]; footprints: MapFootprint[]; walls: MapWall[] }
let drawnMemo: { sig: string; layers: MapLayers; fps: MapFootprint[]; d: Drawn } | null = null;
function drawnFor(key: string): Drawn {
  const layers = layersFor(key), fps = footprintsFor(key), ex = layers.extra;
  const sig = `${key}|${layers.roads.length}|${layers.waters.length}|${fps.length}|${ex?.roads.length}|${ex?.waters.length}|${ex?.footprints.length}|${ex?.walls?.length}`;
  if (drawnMemo && drawnMemo.sig === sig && drawnMemo.layers === layers && drawnMemo.fps === fps) return drawnMemo.d;
  const d: Drawn = ex
    ? { roads: [...layers.roads, ...ex.roads], waters: [...layers.waters, ...ex.waters], footprints: [...fps, ...ex.footprints], walls: ex.walls || [] }
    : { roads: layers.roads, waters: layers.waters, footprints: fps, walls: [] };
  drawnMemo = { sig, layers, fps, d };
  return d;
}

// ---------- a dungeon's floor, a ship's deck ----------
// A dungeon has no roads or footprints: its rooms are its zones.json layout
// (tools/data/dungeon_plans/<key>.json through dungeon_plan.py), read back by
// dungeon-plan.ts as the server reads it -- every room and corridor cell, its
// floor height, the obstacle cells and the wall edges. That data is static, so
// the map draws it for any dungeon, walked or not, with no build record.
const planMemo = new Map<string, { def: unknown; plan: DungeonPlan | null }>();
function planFor(key: string): DungeonPlan | null {
  const def = ZONES[key];
  const hit = planMemo.get(key);
  if (hit && hit.def === def) return hit.plan;
  let plan: DungeonPlan | null = null;
  try { plan = def?.layout ? dungeonPlan(def as DungeonZoneData) : null; } catch { plan = null; }
  planMemo.set(key, { def, plan });
  return plan;
}
// the floor's shades: the lowest floor darkest, each higher one lighter, so a
// tower's stacked levels read as levels (the Bell Tower runs y -0.8..32)
const FLOOR_LO = [58, 66, 84], FLOOR_HI = [118, 128, 150];
function floorShade(t: number, corridor: boolean): string {
  const c = FLOOR_LO.map((lo, i) => Math.round(lo + (FLOOR_HI[i] - lo) * t - (corridor ? 8 : 0)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// a plan's level span, and whether it has more than one level worth shading
function planLevels(plan: DungeonPlan): { lo: number; hi: number; multi: boolean } {
  let lo = Infinity, hi = -Infinity;
  for (const c of plan.cells.values()) { if (c.obstacle) continue; lo = Math.min(lo, c.y); hi = Math.max(hi, c.y); }
  return { lo, hi, multi: hi - lo > 2.5 };
}
const floorMemo = new Map<string, { plan: DungeonPlan; floors: { pts: P2[]; fill: string }[]; edges: [number, number, number, number][] }>();
function dungeonFloor(key: string): { floors: { pts: P2[]; fill: string }[]; edges: [number, number, number, number][] } | null {
  const plan = planFor(key);
  if (!plan) return null;
  const hit = floorMemo.get(key);
  if (hit && hit.plan === plan) return hit;
  const cs = plan.cell, h = cs / 2, { lo, hi, multi } = planLevels(plan);
  const floors: { pts: P2[]; fill: string }[] = [];
  for (const c of plan.cells.values()) {
    const fill = c.obstacle ? "rgb(30,33,42)" : floorShade(multi ? (c.y - lo) / (hi - lo) : 0.35, !c.room);
    // a hair over the cell, so neighbours meet without a hairline seam
    floors.push({ pts: [[c.x - h - 0.15, c.z - h - 0.15], [c.x + h + 0.15, c.z - h - 0.15], [c.x + h + 0.15, c.z + h + 0.15], [c.x - h - 0.15, c.z + h + 0.15]], fill });
  }
  // the walls (nothing beyond the edge) and the ledges (a floor too far up or
  // down to step to), as lines on the cell edges
  const edges: [number, number, number, number][] = [];
  for (const w of plan.walls) {
    if (w.kind === "obstacle") continue;
    const ax = w.dz * w.length / 2, az = w.dx * w.length / 2;
    edges.push([w.x - ax, w.z - az, w.x + ax, w.z + az]);
  }
  const out = { plan, floors, edges };
  floorMemo.set(key, out);
  return out;
}

// The gulf ferry's deck (shared/data/ferry.json `surfaces`: each a run from x0
// to x1 along the hull, half0..half1 either side of z), a voyage zone's whole
// ground: the ship is moored at the origin, bow +x, on open sea.
const DECKS = ((FERRY as any).surfaces as { x0: number; x1: number; half0: number; half1: number; y0: number; y1: number; z: number }[])
  .slice().sort((a, b) => Math.max(a.y0, a.y1) - Math.max(b.y0, b.y1));
const DECK_Y = DECKS.reduce((m, d) => [Math.min(m[0], d.y0, d.y1), Math.max(m[1], d.y0, d.y1)], [Infinity, -Infinity]);
const deckFloors = (): { pts: P2[]; fill: string }[] => DECKS.map((d) => ({
  pts: [[d.x0, d.z - d.half0], [d.x1, d.z - d.half1], [d.x1, d.z + d.half1], [d.x0, d.z + d.half0]] as P2[],
  fill: `rgb(${[120, 92, 66].map((c, i) => Math.round(c + ([158, 124, 92][i] - c) * ((Math.max(d.y0, d.y1) - DECK_Y[0]) / Math.max(1, DECK_Y[1] - DECK_Y[0])))).join(",")})`,
}));
const DECK_BOUNDS: Bounds = DECKS.reduce((b, d) => [Math.min(b[0], d.x0), Math.min(b[1], d.z - Math.max(d.half0, d.half1)), Math.max(b[2], d.x1), Math.max(b[3], d.z + Math.max(d.half0, d.half1))], [Infinity, Infinity, -Infinity, -Infinity] as Bounds);
const OBSTACLES = ((FERRY as any).obstacles as { x0: number; x1: number; z0: number; z1: number }[]);
// where a voyage zone's ship is bound: the port whose sea_zone it is sails to its destination
export function voyageDestination(key: string): string | null {
  for (const p of Object.values((FERRY as any).ports || {}) as any[]) if (p.sea_zone === key) return p.destination || null;
  return null;
}
const isVoyage = (key: string) => ZONES[key]?.kind === "voyage";

// The zone map's world -> canvas transform for a w x h map box. Everything the
// zone map draws -- the base layer, portal labels, folk, landmarks, duties,
// the party and the player's arrow -- goes through this one frame. A shaped
// zone is framed on map_frame.ts frameContent (its coast, its marks, the runs
// that leave by water); a square zone on its plate.
// Kept while the zone's records are the same objects -- live, or the parsed
// localStorage cache above: the live map redraws four times a second, and
// Moonmere's 1,198 footprints need not be walked each time to find the same
// frame. The live records grow in place while a zone builds, so their lengths
// are part of the key.
// A dungeon is framed on its layout's cells and its marks (layoutFrame): on
// the 340 m plate a 220 m layout drew small in the middle of the box. A voyage
// on its ship's deck: the plate is open sea.
let frameMemo: { sig: string; roads: unknown; fps: unknown; shape: unknown; f: MapFrame } | null = null;
function marksOf(def: any): [number, number, number][] {
  const m: [number, number, number][] = [];
  for (const c of def.camps || []) m.push([c.x, c.z, c.radius]);
  for (const p of [...(def.portals || []), ...(def.milestones || [])]) m.push([p.x, p.z, 8]);
  for (const p of [...(def.npcs || []), ...(def.landmarks || []), ...(def.interactables || [])]) m.push([p.x, p.z, 4]);
  if (def.spawn) m.push([def.spawn.x, def.spawn.z, 4]);
  return m;
}
export function zoneMapFrame(key: string, w: number, h: number): MapFrame {
  const def = ZONES[key];
  const plan = planFor(key);
  if (plan) {
    const b = plan.bounds;
    return layoutFrame(def.size as number, w, h, [b.minX, b.minZ, b.maxX, b.maxZ], marksOf(def));
  }
  if (isVoyage(key)) return layoutFrame(def.size as number, w, h, DECK_BOUNDS, [], 6);
  const d = drawnFor(key), shape = zoneShape(key);
  const sig = `${key}|${w}|${h}|${d.roads.length}|${d.footprints.length}`;
  if (frameMemo && frameMemo.sig === sig && frameMemo.roads === d.roads && frameMemo.fps === d.footprints && frameMemo.shape === shape) return frameMemo.f;
  const f = zoneFrame(def?.size as number, w, h, frameContent(def, shape, d.roads, d.footprints));
  frameMemo = { sig, roads: d.roads, fps: d.footprints, shape, f };
  return f;
}

// Everything that only changes when the zone is rebuilt: plate, water, roads,
// building footprints, camp rings, milestones, portals. Drawn into whatever
// (w, h) box the caller has translated the context to, under frame `f` (the
// zone map's own framing unless the caller -- the minimap's crop -- says).
export function drawZoneBase(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, f?: MapFrame): void {
  const def = ZONES[key];
  if (!def) return;
  const size = def.size as number;
  const frame = f || zoneMapFrame(key, w, h);
  // relief over the plate; the box's clip shows the part the frame does. Not
  // for a dungeon or a ship: an enclosed floor's height, or a deck's, is no
  // landscape, and it ghosted only the floors that were not at y 0
  const rect: Bounds = [-size / 2, -size / 2, size / 2, size / 2];
  const enclosed = def.kind === "dungeon" || isVoyage(key);
  const rel = enclosed ? null : reliefFor(key, rect);
  const d = drawnFor(key);
  const floor = dungeonFloor(key);
  const voyage = isVoyage(key);
  drawBaseLayers(ctx, {
    size,
    shape: zoneShape(key)?.pts || null,
    coast: zoneShape(key)?.coast || null,
    tint: TINTS[key] || (voyage ? WATER_FILL.water : "#242a32"),
    relief: rel ? { cv: rel, rect } : null,
    floors: floor ? floor.floors : voyage ? deckFloors() : undefined,
    edges: floor ? floor.edges : undefined,
    roads: d.roads,
    waters: d.waters,
    footprints: voyage ? OBSTACLES.map((o) => [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, o.x1 - o.x0, o.z1 - o.z0] as MapFootprint) : d.footprints,
    walls: d.walls,
    camps: (def.camps || []).map((c: any) => [c.x, c.z, c.radius] as [number, number, number]),
    milestones: (def.milestones || []).map((m: any) => [m.x, m.z] as [number, number]),
    // a gated portal only once this character may use it
    portals: visiblePortals(key).map((p: any) => [p.x, p.z] as [number, number]),
  }, frame, w, h);
}

// ---------- offscreen zone crop for the minimap ----------
// One render per zone load at ~2px per world unit; the minimap blits from it.
// The crop carries the portal pins, and a gated portal appears when its quest
// is handed in, so the cache is keyed on which portals show as well. It is
// drawn on the PLATE frame (minimapBase), never the zone map's: hud.ts reads a
// point at (side / 2 + x ppu, side / 2 - z ppu), and the minimap's metres per
// pixel are its zoom steps' (MM_STEPS), whatever the zone map frames.
let base: { key: string; cv: HTMLCanvasElement; ppu: number } | null = null;

// The dev view (zonemapview.ts) draws the minimap once the zone has finished
// recording its roads and footprints, which a crop cached mid-build would miss.
export function invalidateZoneBase(): void { base = null; }

export function zoneBaseCanvas(zone: string): { cv: HTMLCanvasElement; ppu: number } | null {
  if (!ZONES[zone]) return null;
  const key = `${zone}|${visiblePortals(zone).map((p: any) => p.id).join(",")}`;
  if (base && base.key === key) return base;
  const mb = minimapBase(ZONES[zone].size as number);
  const cv = document.createElement("canvas");
  cv.width = mb.side;
  cv.height = mb.side;
  drawZoneBase(cv.getContext("2d")!, zone, mb.side, mb.side, mb.frame);
  base = { key, cv, ppu: mb.ppu };
  return base;
}

// ---------- the minimap's static marks ----------
// The minimap's colours in the Lamplight palette (a canvas cannot read the CSS
// tokens): players and foes as the Main artboard draws them, the party
// --lp-party, folk --lp-npc, an idle foe the dark end of --lp-foe-grad.
export const MM_INK = "rgba(10,12,18,0.9)";
export const MM = { player: "#7fb7ef", party: "#c3b1f0", folk: "#a9dca0", foe: "#e0705c", foeIdle: "#b5503f" };
// a service badge's nominal radius on the minimap and on the zone map
export const SERVICE_R_MINIMAP = 5, SERVICE_R_MAP = 6.5;

// Everything on the minimap that is not alive: the ground disc, the crop of the
// zone base, crystals and crossings again on top (the blit is too coarse to
// read), the service icons, and folk with their quest diamonds. Centred on
// (cx, cz), `range` metres from centre to edge, on a `side`-pixel square in
// the context's current units. hud.ts drawMinimap calls it every frame and
// draws the living things over it; zonemapview.ts calls it for the crop at a
// chosen point. Returns the world -> minimap transform and the disc test.
export function drawMinimapStatic(
  ctx: CanvasRenderingContext2D, zone: string, cx: number, cz: number, range: number, side: number,
): { px: (wx: number, wz: number) => [number, number]; inR: (x: number, y: number) => boolean } {
  const C = side / 2, R = C;
  const px = (wx: number, wz: number): [number, number] =>
    [C + ((wx - cx) / range) * R, C - ((wz - cz) / range) * R];
  const inR = (x: number, y: number) => Math.hypot(x - C, y - C) < R - 2;
  // ground disc -- also what shows through where the zone runs out
  ctx.beginPath();
  ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.fillStyle = "#0b0e15";
  ctx.fill();
  // the crop of the zone base, clipped to the disc
  const zb = zoneBaseCanvas(zone);
  if (zb) {
    const half = range * zb.ppu;
    const bx = zb.cv.width / 2 + cx * zb.ppu;
    const by = zb.cv.height / 2 - cz * zb.ppu;
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(zb.cv, bx - half, by - half, half * 2, half * 2, C - R, C - R, R * 2, R * 2);
    ctx.restore();
  }
  const zdef = ZONES[zone] || {};
  (zdef.milestones || []).forEach((wl: any) => {
    const [x, y] = px(wl.x, wl.z);
    if (!inR(x, y)) return;
    crystalIcon(ctx, x, y, 5);
  });
  visiblePortals(zone).forEach((p: any) => {
    const [x, y] = px(p.x, p.z);
    if (!inR(x, y)) return;
    crossingIcon(ctx, x, y, 3);
  });
  // services, always (map_services.ts): a badge stands for its NPCs, so they
  // get no folk dot, though a quest diamond is still drawn over the badge.
  // Drawn lowest priority first, so the auction house lies on top.
  const services = zoneServices(zdef);
  const serviceNpcs = serviceNpcIds(services);
  for (let i = services.length - 1; i >= 0; i--) {
    const s = services[i];
    const [x, y] = px(s.x, s.z);
    if (!inR(x, y)) continue;
    drawServiceIcon(ctx, s.kind, x, y, SERVICE_R_MINIMAP);
  }
  // folk, with the nameplate's diamond (.qmark) when they want something of
  // you: filled for an offer, hollow for a turn-in or a talk target
  (zdef.npcs || []).forEach((n: any) => {
    const [x, y] = px(n.x, n.z);
    if (!inR(x, y)) return;
    const marker = npcMarkerFor(n.id);
    if (!marker) {
      if (serviceNpcs.has(n.id)) return;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = MM.folk;
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.lineWidth = 1.6;
    if (marker.glyph === "!") {
      ctx.fillStyle = marker.color;
      ctx.strokeStyle = MM_INK;
      ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
      ctx.strokeRect(-3.4, -3.4, 6.8, 6.8);
    } else {
      ctx.fillStyle = MM_INK;
      ctx.strokeStyle = marker.color;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.strokeRect(-3, -3, 6, 6);
    }
    ctx.restore();
  });
  return { px, inR };
}

// ---------- the zone map ----------
// The dev view's layers (zonemapview.ts, /?zonemap=<key>): everything the data
// places in a zone whether or not this character has found it, so an auditor
// can see whether each label sits on the thing it names. Never on in play.
export interface AuditLayers {
  landmarks?: boolean; npcs?: boolean; portals?: boolean; crystals?: boolean;
  camps?: boolean; quests?: boolean; sites?: boolean;
}
export interface ZoneMapOpts {
  scale?: number;           // backing pixels per map pixel, for a crisp shot
  marksOnly?: boolean;      // no base layer: the marks over a clear box (the compare overlay)
  allDiscovered?: boolean;  // every landmark drawn as if found
  audit?: AuditLayers;
  frame?: MapFrame;         // a frame of the caller's (the dev view's zoom), in place of the zone's own
}

// A crystal and a crossing are drawn by the base layer; over a render (the
// compare overlay, which draws no base) they are drawn here, at the same size.
function drawBaseMarks(ctx: CanvasRenderingContext2D, key: string, f: MapFrame): void {
  ((ZONES[key]?.milestones as any[]) || []).forEach((m: any) => {
    const [x, y] = framePx(f, m.x, m.z);
    crystalIcon(ctx, x, y, 6);
  });
  visiblePortals(key).forEach((p: any) => {
    const [x, y] = framePx(f, p.x, p.z);
    crossingIcon(ctx, x, y, 4);
  });
}

export function drawZone(cv: HTMLCanvasElement, key: string, opts: ZoneMapOpts = {}): void {
  const ctx = cv.getContext("2d")!;
  const def = ZONES[key];
  const k = opts.scale || 1;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const W = cv.width / k, H = cv.height / k;
  // The map box is the canvas less the legend's rows, below the header gap
  // (map_frame.ts zoneMapBox). One frame for the base layer and every live
  // layer drawn over it; drawBaseLayers clips to the box, so nothing of the
  // base reaches the header gap or the legend.
  const box = zoneMapBox(W, H);
  const frame = opts.frame || zoneMapFrame(key, box.w, box.h);
  const px = (wx: number, wz: number) => zoneMapPx(frame, wx, wz);
  const legendTop = box.top + box.h;
  if (opts.marksOnly) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0c1018";
    ctx.fillRect(0, legendTop, W, H - legendTop);
    ctx.save();
    ctx.translate(0, box.top);
    drawBaseMarks(ctx, key, frame);
    ctx.restore();
  } else {
    ctx.fillStyle = "#0c1018";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, box.top);
    drawZoneBase(ctx, key, box.w, box.h, frame);
    ctx.restore();
  }
  // a voyage's map says where the ship is bound
  if (isVoyage(key)) {
    const to = voyageDestination(key);
    if (to) {
      ctx.textAlign = "left";
      ctx.font = "italic 11px serif";
      ctx.fillStyle = "rgba(200,210,230,0.75)";
      ctx.fillText(`the gulf ferry, bound for ${ZONES[to]?.name || to}`, 12, box.top + 16);
    }
  }
  ctx.textAlign = "center";
  // A label kept on the canvas: a shaped zone is framed to its edge now, and a
  // portal at the coast would otherwise have half its name cut off.
  const label = (text: string, x: number, y: number) => {
    const half = ctx.measureText(text).width / 2 + 3;
    ctx.fillText(text, Math.max(half, Math.min(W - half, x)), y);
  };
  // NPCs -- quest givers wear their marker's colour; one a service icon stands
  // for (below) gets no square of its own
  const services = zoneServices(def);
  const serviceNpcs = serviceNpcIds(services);
  (def.npcs || []).forEach((n: any) => {
    if (serviceNpcs.has(n.id)) return;
    const [nx, ny] = px(n.x, n.z);
    const marker = npcMarkerFor(n.id);
    if (marker) {
      ctx.fillStyle = marker.color;
      ctx.font = "bold 12px Cinzel, serif";
      ctx.fillText(marker.glyph, nx, ny - 4);
      ctx.fillRect(nx - 2, ny - 2, 4, 4);
      return;
    }
    ctx.fillStyle = n.stock ? "#d8c48a" : "#9aa4c0";
    ctx.fillRect(nx - 2, ny - 2, 4, 4);
  });
  // the services, always (map_services.ts): icons drawn lowest priority first
  // so the auction house is on top
  const spots = services.map((s) => px(s.x, s.z));
  for (let i = services.length - 1; i >= 0; i--) drawServiceIcon(ctx, services[i].kind, spots[i][0], spots[i][1], SERVICE_R_MAP);
  services.forEach((s, i) => {
    const marker = s.npcs.map((id) => npcMarkerFor(id)).find(Boolean);
    if (!marker) return;
    ctx.fillStyle = marker.color;
    ctx.font = "bold 12px Cinzel, serif";
    ctx.fillText(marker.glyph, spots[i][0], spots[i][1] - serviceRadius(s.kind, SERVICE_R_MAP) - 2);
  });
  // discovered landmarks' dots, and where the duties point
  const landmarks = ((def.landmarks || []) as any[]).filter((l) => opts.allDiscovered || state.discoveries.has(l.id));
  const lmSpots = landmarks.map((l) => px(l.x, l.z));
  lmSpots.forEach(([lx, ly]) => {
    ctx.fillStyle = "#8a94b0";
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  });
  const duties = activeQuestDestinations(key);
  const dutySpots = duties.map((d) => px(d.x, d.z));
  duties.forEach((d, i) => {
    const [dx, dy] = dutySpots[i];
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = d.color;
    ctx.strokeStyle = "rgba(10,12,18,0.85)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
  });

  // EVERY NAME ON THE MAP, placed together (map_services.ts placeLabels), so
  // none prints over another or over a mark: the always-on service names
  // used to dodge only the icons, and landmark and portal names went down
  // bare -- "The Auction House" over "The Returns Desk", a portal's name
  // through Heartwood's West Gate Crystal (map audit). Highest priority
  // first: the auction house and the inns, the crossings and the duties
  // always keep theirs (`must`: at their best spot even when all collide);
  // a landmark's name, then a vendor's or trainer's, is left off when it
  // fits nowhere, rather than overprinting.
  const iconRects = services.map((s, i): [number, number, number, number] => {
    const r = serviceRadius(s.kind, SERVICE_R_MAP);
    return [spots[i][0] - r, spots[i][1] - r, spots[i][0] + r, spots[i][1] + r];
  });
  const marks: [number, number, number, number][] = [...iconRects];
  const portals = visiblePortals(key);
  const portalSpots = portals.map((p: any) => px(p.x, p.z));
  for (const [x, y] of portalSpots) marks.push([x - 5.5, y - 5.5, x + 5.5, y + 5.5]);
  for (const m of (def.milestones || []) as any[]) { const [x, y] = px(m.x, m.z); marks.push([x - 4, y - 7, x + 4, y + 7]); }
  for (const [x, y] of dutySpots) marks.push([x - 5.5, y - 5.5, x + 5.5, y + 5.5]);
  for (const [x, y] of lmSpots) marks.push([x - 2.5, y - 2.5, x + 2.5, y + 2.5]);
  type Name = { text: string; font: string; color: string; x: number; y: number; r: number; must: boolean; halo: boolean };
  const names: Name[] = [];
  const serviceFont = (s: ServiceMark) => (s.kind === "auction" ? "bold 10.5px sans-serif" : "9.5px sans-serif");
  const serviceText = (s: ServiceMark) => (s.kind === "auction" && s.from === "npc" ? "Auction House" : s.name);
  services.forEach((s, i) => { if (s.kind === "auction" || s.kind === "inn") names.push({ text: serviceText(s), font: serviceFont(s), color: SERVICE_STYLE[s.kind].color, x: spots[i][0], y: spots[i][1], r: serviceRadius(s.kind, SERVICE_R_MAP), must: true, halo: true }); });
  // a dungeon's two portals both lead to the same field zone: named by their
  // own names (the door in, the way out past the boss), not "to X" twice
  const dungeon = def.kind === "dungeon";
  portals.forEach((p: any, i: number) => names.push({ text: dungeon && p.name ? p.name : `to ${ZONES[p.to]?.name || p.to}`, font: "10px sans-serif", color: "#b8a8e0", x: portalSpots[i][0], y: portalSpots[i][1], r: 5, must: true, halo: true }));
  duties.forEach((d, i) => names.push({ text: d.label, font: "9.5px sans-serif", color: d.color, x: dutySpots[i][0], y: dutySpots[i][1], r: 6, must: true, halo: true }));
  // a landmark whose name a service already prints beside it (the North
  // Road's Halfway Inn, landmark and inn 16 m apart) is not named twice
  landmarks.forEach((l, i) => {
    if (services.some((s) => s.name === l.name && Math.hypot(s.x - l.x, s.z - l.z) < 25)) return;
    names.push({ text: l.name, font: "10px serif", color: "#c9d2e4", x: lmSpots[i][0], y: lmSpots[i][1], r: 3, must: false, halo: true });
  });
  services.forEach((s, i) => { if (s.kind !== "auction" && s.kind !== "inn") names.push({ text: serviceText(s), font: serviceFont(s), color: SERVICE_STYLE[s.kind].color, x: spots[i][0], y: spots[i][1], r: serviceRadius(s.kind, SERVICE_R_MAP), must: false, halo: true }); });
  const placed = placeOut(names.map((n) => {
    ctx.font = n.font;
    return { x: n.x, y: n.y, r: n.r, w: ctx.measureText(n.text).width, h: 10, must: n.must };
  }), W, legendTop, marks);
  namesDropped = names.filter((_, i) => !placed[i]).map((n) => n.text);
  const labelRects: [number, number, number, number][] = [...marks];
  names.forEach((n, i) => {
    const at = placed[i];
    if (!at) return;
    ctx.font = n.font;
    const w = ctx.measureText(n.text).width, x0 = at.align === "center" ? at.x - w / 2 : at.align === "left" ? at.x : at.x - w;
    labelRects.push([x0, at.y - 8, x0 + w, at.y + 2]);
    ctx.textAlign = at.align;
    if (n.halo) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(10,12,18,0.85)";
      ctx.strokeText(n.text, at.x, at.y);
    }
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, at.x, at.y);
  });
  ctx.textAlign = "center";
  drawCourtBountyPins(ctx, key, px, label); // the court bounties in hand (court-hud.ts)
  // party members abroad in this zone
  if (key === state.zone) {
    state.party.forEach((m: any) => {
      if (m.char_id === state.self?.charId) return;
      const rp = state.players.get(`p${m.char_id}`);
      if (!rp) return;
      const [mx, my] = px(rp.x, rp.z);
      ctx.fillStyle = "#4fe3ff";
      ctx.beginPath();
      ctx.arc(mx, my, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#bdeeff";
      ctx.font = "9px sans-serif";
      label(m.name, mx, my - 6);
    });
  }
  // the player, facing where they face
  if (state.zone === key && getPos) {
    const p = getPos();
    const [mx, my] = px(p.x, p.z);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(p.h);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5.5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-5, 5.5);
    ctx.closePath();
    ctx.fillStyle = "#c9a35c";
    ctx.fill();
    ctx.strokeStyle = "#fff2d8";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  drawCourtZoneBanner(ctx, key, box.top); // the controlling court's banner (court-hud.ts)
  if (opts.audit) drawAudit(ctx, key, px, frame.S, W, legendTop, opts.audit, labelRects);
  drawLegend(ctx, key, services, W, legendTop, H);
}

// ---------- the legend ----------
// Only what this zone has (map_services.ts legendRows), in two rows: the
// places first -- crystal, the services, crossings, folk -- then hunting
// grounds and the three duty colours, which can appear anywhere.
function drawLegend(ctx: CanvasRenderingContext2D, key: string, services: ServiceMark[], W: number, top: number, H: number): void {
  const def = ZONES[key];
  const entries: LegendEntry[] = [];
  if ((def.milestones || []).length) entries.push({ key: "crystal", label: "teleport crystal" });
  for (const k of SERVICE_KINDS) if (services.some((s) => s.kind === k)) entries.push({ key: k, label: SERVICE_STYLE[k].label });
  if (visiblePortals(key).length) entries.push({ key: "crossing", label: "crossing" });
  const plan = planFor(key);
  if (plan && planLevels(plan).multi) entries.push({ key: "levels", label: "higher floors lighter" });
  const svc = serviceNpcIds(services);
  if ((def.npcs || []).some((n: any) => !svc.has(n.id))) entries.push({ key: "folk", label: "folk" });
  if ((def.camps || []).length) entries.push({ key: "camps", label: "hunting grounds" });
  entries.push({ key: "main", label: "main duty" }, { key: "side", label: "side duty" }, { key: "guild", label: "guild duty" });
  ctx.font = "10px sans-serif";
  const slots = legendRows(entries, W, (t) => ctx.measureText(t).width);
  const rowY = [top + (H - top) * 0.3, top + (H - top) * 0.74];
  ctx.textAlign = "left";
  for (const s of slots) {
    const cy = rowY[s.row], ix = s.x + 5;
    let color = "#c9d2e4";
    if (s.key === "crystal") crystalIcon(ctx, ix, cy, 5);
    else if (isServiceKind(s.key)) { drawServiceIcon(ctx, s.key, ix, cy, 4.4); color = SERVICE_STYLE[s.key].color; }
    else if (s.key === "camps") {
      ctx.beginPath(); ctx.arc(ix, cy, 4, 0, Math.PI * 2);
      ctx.strokeStyle = color = "rgba(200,90,74,0.8)"; ctx.lineWidth = 1; ctx.stroke();
    } else if (s.key === "levels") {
      // the floor shades, low to high
      ctx.fillStyle = floorShade(0, false); ctx.fillRect(ix - 5, cy - 4, 5, 8);
      ctx.fillStyle = floorShade(1, false); ctx.fillRect(ix, cy - 4, 5, 8);
    } else if (s.key === "folk") {
      ctx.fillStyle = color = "#9aa4c0"; ctx.fillRect(ix - 2, cy - 2, 4, 4);
    } else if (s.key === "crossing") {
      crossingIcon(ctx, ix, cy, 3); color = CROSSING_COLOR;
    } else {
      color = s.key === "main" ? MAIN_COLOR : s.key === "side" ? SIDE_COLOR : GUILD_COLOR;
      ctx.save(); ctx.translate(ix, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = color; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.font = "10px sans-serif";
    ctx.fillText(s.label, s.x + LEGEND_ICON, cy + 3.5);
  }
}

// ---------- the audit layers (dev view only) ----------
// Drawn in their own colours so they never pass for something a player sees:
// cyan rings and names for what the data places, gold dashes for sites.
const AUDIT = "#7fe0ff", AUDIT_SITE = "#ffd479";
// how many audit names the last drawZone could not place without overprinting
export let auditDropped = 0;
// the player's own names (landmarks, vendors, trainers) the last drawZone left
// off for want of room: the map audit's "&disc=all" asks whether a new
// landmark costs a name
export let namesDropped: string[] = [];
const NPC_KIND_COLOR: Record<string, string> = {
  quest: "#c9a35c", vendor: SERVICE_STYLE.vendor.color, auction: SERVICE_STYLE.auction.color,
  sanctuary: SERVICE_STYLE.trainer.color, flavor: "#9aa4c0",
};
function drawAudit(
  ctx: CanvasRenderingContext2D, key: string, px: (x: number, z: number) => [number, number], S: number, W: number, H: number,
  a: AuditLayers, taken: [number, number, number, number][],
): void {
  const def = ZONES[key];
  const labels: { text: string; color: string; x: number; y: number; r: number }[] = [];
  ctx.save();
  if (a.sites) {
    Object.entries((def.sites || {}) as Record<string, any>).forEach(([id, s]) => {
      if (!Number.isFinite(s.cx) || !Number.isFinite(s.cz)) return;
      const [x, y] = px(s.cx, s.cz);
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = AUDIT_SITE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (s.r) ctx.arc(x, y, Math.max(3, s.r * S), 0, Math.PI * 2);
      else {
        // span runs along the site's own x, len along its z, turned by yaw
        // (Babylon's rotation.y: local (u, v) -> world (u cos + v sin, -u sin + v cos))
        const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0), hu = (s.span || 4) / 2, hv = (s.len || 4) / 2;
        [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].forEach(([u, v], i) => {
          const [qx, qy] = px(s.cx + u * c + v * sn, s.cz - u * sn + v * c);
          if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
        });
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      labels.push({ text: `${s.name || id} [site]`, color: AUDIT_SITE, x, y, r: 3 });
    });
  }
  if (a.camps) {
    (def.camps || []).forEach((c: any) => {
      const [x, y] = px(c.x, c.z);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, c.radius * S), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(240,120,100,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      labels.push({ text: `${MONSTERS[c.monster]?.name || c.monster} ${c.min_lvl}-${c.max_lvl}`, color: "#f3a08e", x, y, r: 3 });
    });
  }
  if (a.quests) {
    // every spot a quest sends a player to in this zone (not the giver, whom
    // the NPC layer names), keys joined where several share a spot; and every
    // quest interactable, used or not
    const at = new Map<string, { x: number; z: number; keys: string[] }>();
    Object.keys(QUESTS).forEach((qk) => questDestinations(qk, false).forEach((d) => {
      if (d.zone !== key || d.kind === "npc") return;
      const id = `${Math.round(d.x)},${Math.round(d.z)}`;
      const e = at.get(id) || { x: d.x, z: d.z, keys: [] };
      if (!e.keys.includes(qk)) e.keys.push(qk);
      at.set(id, e);
    }));
    (def.interactables || []).forEach((o: any) => {
      const [x, y] = px(o.x, o.z);
      ctx.strokeStyle = AUDIT;
      ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
      labels.push({ text: o.name || o.id, color: AUDIT, x, y, r: 3 });
    });
    at.forEach((e) => {
      const [x, y] = px(e.x, e.z);
      ctx.fillStyle = "#ff9ff0";
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7); ctx.lineTo(x + 3, y - 7); ctx.closePath();
      ctx.fill();
      labels.push({ text: e.keys.length > 3 ? `${e.keys.slice(0, 3).join(" ")} +${e.keys.length - 3}` : e.keys.join(" "), color: "#ff9ff0", x, y: y - 4, r: 4 });
    });
  }
  if (a.crystals) {
    (def.milestones || []).forEach((m: any) => {
      const [x, y] = px(m.x, m.z);
      labels.push({ text: m.name || m.id, color: "#9fc0ff", x, y, r: 7 });
    });
  }
  if (a.portals) {
    (def.portals || []).forEach((p: any) => {
      const [x, y] = px(p.x, p.z);
      const shown = visiblePortals(key).includes(p);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "#d6c8ff";
      ctx.lineWidth = 1.2;
      if (!shown) ctx.setLineDash([2, 2]);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
      labels.push({ text: `${p.id} > ${p.to || "?"}${p.gate_quest ? ` (${p.gate_quest})` : ""}`, color: "#d6c8ff", x, y, r: 7 });
    });
  }
  if (a.landmarks) {
    (def.landmarks || []).forEach((l: any) => {
      const [x, y] = px(l.x, l.z);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = AUDIT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      labels.push({ text: l.name, color: AUDIT, x, y, r: 4 });
    });
  }
  if (a.npcs) {
    (def.npcs || []).forEach((n: any) => {
      const [x, y] = px(n.x, n.z);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = NPC_KIND_COLOR[n.kind] || "#ffffff";
      ctx.fill();
      labels.push({ text: `${n.name} (${n.kind})`, color: NPC_KIND_COLOR[n.kind] || "#ffffff", x, y, r: 2.5 });
    });
  }
  // no audit name is printed over another, nor over the service icons and
  // names the HUD drew: one that fits nowhere is left off and counted (the
  // dev view says how many, and &focus= zooms in on them). A mark outside the
  // frame (a focus square cuts most of a zone away) has no name to place.
  ctx.font = "8.5px sans-serif";
  const shown = labels.filter((l) => l.x >= 0 && l.x <= W && l.y >= 0 && l.y <= H);
  const spots = placeLabels(shown.map((l) => ({ x: l.x, y: l.y, r: l.r, w: ctx.measureText(l.text).width, h: 9 })), W, H, taken);
  auditDropped = spots.filter((s) => !s).length;
  shown.forEach((l, i) => {
    const s = spots[i];
    if (!s) return;
    ctx.textAlign = s.align;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(6,8,12,0.9)";
    ctx.strokeText(l.text, s.x, s.y);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, s.x, s.y);
  });
  ctx.restore();
}
