import { installBabylonEffectOwnershipFix } from './babylon-effect-ownership';
import {isFerryZone, ferryDeckHeight, ferryBlockedMove} from './ferry-deck';
import {buildDockedFerry} from './ferry-visual';
import { prepareHeartwoodCity, buildHeartwoodCity, inspectHeartwoodCity } from "./heartwood-city-build";
import { boxBlocksMove } from "./movement_collision";
import { CellIndex, SegmentTree } from "./spatial";
import { cameraBoxRay, cameraRoomHas, type CameraRoom } from "./camera_geometry";
import {
  Engine, Scene, Color3, Color4, Vector3, HemisphericLight, DirectionalLight, VertexBuffer,
  MeshBuilder, StandardMaterial, Mesh, PointLight, DynamicTexture, ParticleSystem,
  VertexData, GlowLayer, Matrix, Texture, Vector4,
  CascadedShadowGenerator, AbstractMesh, TransformNode, ImageProcessingConfiguration, MaterialPluginBase,
  FresnelParameters,
  HDRCubeTexture, ColorCurves, Frustum, Plane, type Material, type Nullable,
} from "@babylonjs/core";
import { buildCoastalSky } from "./coastal-sky";
import {
  resolveOutdoor, setCurrentBackdrop, buildBackdropBand, buildTerrainSkirt, skirtMaterial, applyDungeonLighting,
  fogClear, lightPools, doorPools, glowOnlyEmitters, layoutOccluder, layoutExtent,
  type DungeonOutdoor, type DungeonLighting, type DungeonGlow, type PoolSpec,
} from "./dungeon-backdrop";
import type { TombLayout } from "./zones/mausoleum-layout";
import { makeDawnVeil, makeRuneCircle } from "./portal-fx";
import { portalFx, veilSpec, runeSpec } from "./portal_plan";
import type { VeilCard } from "./portal_touch";
import { ZONES } from "./data";
import { buildGrass, disposeGrass, updateGrass, setGrassColors, type GrassSpec } from "./grass";
import { generatedTreeVariant, snowGeneratedTree, updateTrees, setTreeImageProcessing } from "./trees";
import { mountainRock } from "./nature";
import { staticTemplate, scatterMatrices, instantiateModel, addInstances } from "./models";
import { makeHouse, makeTower, makeFlight, makeMasonry, doorFoot, place, flushTown, setTownSnow, setPalette, setPlaceGroup, setGroupShown, resetPlaceGroups, registerPalette, ROOF_LENS, resetTowerProbes, STOREY, MOD, type HouseSpec, type Skin, inspectHouses } from "./town";

export let engine: Engine;
export let scene: Scene;
export let glow: GlowLayer;

let currentZone = "";
// the zone being built or played, for builders outside this file that read its
// data (wild-nature.ts keeps its scatters off the zone's NPCs and landings)
export const currentZoneKey = (): string => currentZone;
let heightFn: (x: number, z: number) => number = () => 0;


// ---------- deterministic noise ----------
function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 1442695;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.65 + vnoise(x * 2.7 + 40, z * 2.7 + 40) * 0.35;
}
export function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

// The last ground lookup's base, so standHeight -- always asked right after
// groundHeight at the same point -- does not evaluate the field a second time.
// Keyed on the field function and the flat count, which change with the zone.
// One object, rewritten in place: groundHeight runs in every collision substep.
const lastBase = { x: NaN, z: NaN, fn: null as ((x: number, z: number) => number) | null, flats: -1, flat: false, base: 0 };
export function groundHeight(x: number, z: number, prevY?: number): number {
  if (isFerryZone(currentZone)) return ferryDeckHeight(x,z) ?? -8;
  // A built flat overrides terrain completely. Avoid evaluating every road
  // and house pad first during the many substeps of indoor movement.
  const flat = flatZones.find(f=>x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1);
  const base = flat ? flat.y : heightFn(x,z);
  lastBase.x = x; lastBase.z = z; lastBase.fn = heightFn; lastBase.flats = flatZones.length; lastBase.flat = !!flat; lastBase.base = base;
  if (prevY === undefined || (!decks.length && !ramps.length)) return base;
  // LEVELS. The world is 2D -- the server carries x,z and heightFn is
  // single-valued -- so a first floor and the room under it cannot both be
  // "the ground" at one (x,z). What makes upper floors walkable anyway is that a
  // walking character does not teleport between floors: of every surface under
  // (x,z), it is standing on the one nearest to where its feet were a frame
  // ago. So the lookup is stateful through prevY, and only through that.
  //
  // A candidate above prevY + STEP_UP is a ceiling, not a floor: you cannot
  // step onto it. Of the rest, the HIGHEST wins -- not the nearest. MEASURED:
  // nearest-wins could never climb a stair, because the floor the stair rises
  // from is still there underneath it and is always nearer to where the feet
  // were than the next tread up. If everything is above (the caller's prevY
  // was stale), fall to the lowest.
  let best: number | null = null, lowest = base;
  const consider = (y: number) => {
    lowest = Math.min(lowest, y);
    if (y > prevY + STEP_UP) return;
    if (best === null || y > best) best = y;
  };
  consider(base);
  for (const d of nearDecks(x, z)) if (deckHas(d, x, z)) consider(d.y);
  const connected=new Map<string,{distance:number;y:number}>();
  for (const r of nearRamps(x, z)) {
    const t = rampT(r, x, z);if(t===null)continue;
    const y=r.y0+(r.y1-r.y0)*t;
    if(!r.surfaceGroup){consider(y);continue;}
    // A connected bend has one surface, not the highest padded rectangle
    // from every neighboring tread. Use the nearest segment of its centreline.
    const distance=(x-r.x0-(r.x1-r.x0)*t)**2+(z-r.z0-(r.z1-r.z0)*t)**2;
    if(distance<(connected.get(r.surfaceGroup)?.distance??Infinity))connected.set(r.surfaceGroup,{distance,y});
  }
  for(const p of connected.values())consider(p.y);
  return best ?? lowest;
}

// ── levels: built surfaces above the ground ────────────────────────────────
// A deck is an ORIENTED rectangle (a building's upper floor at any street
// angle) or a disc (a tower room), at one height, with optional holes -- the
// stairwell -- cut out of it. A ramp is a stair: height interpolates along it.
// See groundHeight for how a character ends up on one.
const STEP_UP = 0.9;      // the tallest thing a character steps up onto
interface Obb { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number }
interface Deck { cutouts?:{x:number;z:number;r:number}[]; cx: number; cz: number; y: number; hx?: number; hz?: number; sin?: number; cos?: number; r?: number; holes: Obb[] }
interface Ramp { surfaceGroup?:string; endPad?:number; thickness?:number; x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number; ux: number; uz: number; len: number }
const decks: Deck[] = [];
const ramps: Ramp[] = [];
const stairBodies: Ramp[]=[];

// THE LEVELS, INDEXED. groundHeight, onLevel, ceilingAbove and stairBodyHit
// ask which decks, ramps and stair bodies lie under (x, z) for every movement
// substep, collision probe and wall-join search. Caerdun has ~1,100 decks and
// ~1,500 of each stair kind, and testing all of them for every question was
// ~3.5 s of its build (MEASURED 2026-09-30). Each item is filed under the
// cells its footprint touches -- a box holding every point its own test can
// accept, plus a centimetre -- and the tests themselves are unchanged. The
// lists only grow during a build and are emptied with length = 0 between
// zones, so the index follows them by count and by the identity of the first
// item: a list emptied and refilled is never mistaken for the old one.
const LEVEL_CELL = 8, LEVEL_MARGIN = .01;
// stairBodyHit's pad is filed into the box; a caller wanting a wider pad than
// movement's default gets the full scan.
const STAIR_PAD_MAX = .45;
interface LevelIndex<T> { list: T[]; first: T | undefined; count: number; cells: CellIndex }
type Box = [number, number, number, number];
function levelIndex<T>(idx: LevelIndex<T> | null, list: T[], box: (item: T) => Box): LevelIndex<T> {
  if (!idx || list.length < idx.count || list[0] !== idx.first) idx = { list, first: list[0], count: 0, cells: new CellIndex(LEVEL_CELL) };
  for (; idx.count < list.length; idx.count++) {
    const [x0, x1, z0, z1] = box(list[idx.count]);
    idx.cells.add(idx.count, x0, x1, z0, z1);
  }
  return idx;
}
const NONE: readonly never[] = [];
function nearItems<T>(idx: LevelIndex<T>, x: number, z: number): readonly T[] {
  const ids = idx.cells.query(x, z);
  if (!ids) return idx.list;   // a non-finite point keeps the full scan
  return ids.length ? ids.map((i) => idx.list[i]) : NONE;
}
function deckBox(d: Deck): Box {
  const m = LEVEL_MARGIN;
  if (d.r !== undefined) return [d.cx - d.r - m, d.cx + d.r + m, d.cz - d.r - m, d.cz + d.r + m];
  const c = Math.abs(d.cos!), s = Math.abs(d.sin!), ex = c * d.hx! + s * d.hz! + m, ez = s * d.hx! + c * d.hz! + m;
  return [d.cx - ex, d.cx + ex, d.cz - ez, d.cz + ez];
}
// The rectangle a ramp or stair body accepts: `back`/`fwd` metres past its ends
// along it, `side` either side of it. Only for a unit direction -- a
// zero-length one accepts points nowhere (NaN) or everywhere, so it is filed
// with the items tested on every query.
function stripBox(r: Ramp, back: number, fwd: number, side: number): Box {
  if (!(Math.abs(r.ux * r.ux + r.uz * r.uz - 1) < 1e-9)) return [NaN, NaN, NaN, NaN];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const a of [-back, r.len + fwd]) for (const c of [-side, side]) {
    const x = r.x0 + r.ux * a - r.uz * c, z = r.z0 + r.uz * a + r.ux * c;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const m = LEVEL_MARGIN;
  return [x0 - m, x1 + m, z0 - m, z1 + m];
}
let deckIdx: LevelIndex<Deck> | null = null, rampIdx: LevelIndex<Ramp> | null = null, stairIdx: LevelIndex<Ramp> | null = null;
function nearDecks(x: number, z: number): readonly Deck[] { return nearItems(deckIdx = levelIndex(deckIdx, decks, deckBox), x, z); }
function nearRamps(x: number, z: number): readonly Ramp[] {
  return nearItems(rampIdx = levelIndex(rampIdx, ramps, (r) => stripBox(r, r.endPad ?? .3, r.endPad ?? .3, r.half)), x, z);
}
function nearStairBodies(x: number, z: number): readonly Ramp[] {
  return nearItems(stairIdx = levelIndex(stairIdx, stairBodies, (r) => stripBox(r, .05, .05, r.half + STAIR_PAD_MAX)), x, z);
}

function stairBodyHit(x:number,z:number,y:number,pad=.45):boolean {
  const groups=new Map<string,boolean>();
  for(const r of pad <= STAIR_PAD_MAX ? nearStairBodies(x, z) : stairBodies){
    const dx=x-r.x0,dz=z-r.z0,along=dx*r.ux+dz*r.uz,across=dx*r.uz-dz*r.ux;
    if(along<-.05||along>r.len+.05||Math.abs(across)>r.half+pad)continue;
    const top=r.y0+(r.y1-r.y0)*Math.max(0,Math.min(1,along/r.len));
    const blocked=y+.28<top && (r.thickness===undefined || y+1.2>=top-r.thickness);
    // Adjacent pieces of one curved flight meet at shared treads. Padding
    // their inner corners must not turn the next riser into a wall above
    // a character already standing on this connected surface.
    if(r.surfaceGroup)groups.set(r.surfaceGroup,(groups.get(r.surfaceGroup)??true)&&blocked);
    else if(blocked)return true;
  }
  return [...groups.values()].some(Boolean);
}
export function inspectStairBodies():readonly Ramp[]{return stairBodies;}
/** Read-only dev inspection of the same surfaces used by movement. */
export function inspectLevels(): { decks: readonly Deck[]; ramps: readonly Ramp[] } { return { decks, ramps }; }
function obbHas(b: Obb, x: number, z: number): boolean {
  const dx = x - b.cx, dz = z - b.cz;
  return Math.abs(dx * b.cos - dz * b.sin) < b.hx && Math.abs(dx * b.sin + dz * b.cos) < b.hz;
}
function deckHas(d: Deck, x: number, z: number): boolean {
  if(d.cutouts?.some(c=>Math.hypot(x-c.x,z-c.z)<c.r))return false;
  if (d.r !== undefined) { if (Math.hypot(x - d.cx, z - d.cz) > d.r) return false; }
  else if (!obbHas(d as Obb, x, z)) return false;
  return !d.holes.some((h) => obbHas(h, x, z));
}
/** 0..1 along the ramp when (x,z) is on it, else null. */
function rampT(r: Ramp, x: number, z: number): number | null {
  const dx = x - r.x0, dz = z - r.z0;
  const along = dx * r.ux + dz * r.uz;
  if (along < -(r.endPad??.3) || along > r.len + (r.endPad??.3)) return null;
  if (Math.abs(dx * -r.uz + dz * r.ux) > r.half) return null;
  return Math.max(0, Math.min(1, along / r.len));
}
/** The lowest built floor above `y` at (x, z) -- the ceiling -- or null outdoors. */
export function ceilingAbove(x: number, z: number, y: number): number | null {
  let best: number | null = null;
  for (const d of nearDecks(x, z)) {
    if (d.y <= y + 0.5) continue;
    const inside = d.r !== undefined ? Math.hypot(x - d.cx, z - d.cz) <= d.r : obbHas(d as Obb, x, z);
    // a floor's stairwell is not a ceiling: a walker climbing a flight through it
    // has open air overhead, and the follow camera clamped its target 0.22 m under
    // the floor the well was cut from -- 0.35 m over the feet at the head of
    // Caerdun's Crown Gate F2 (the walk review, MEASURED). deckHas's own hole test.
    if (inside && !d.cutouts?.some(c=>Math.hypot(x-c.x,z-c.z)<c.r) && !d.holes.some((h) => obbHas(h, x, z)) && (best === null || d.y < best)) best = d.y;
  }
  return best;
}
function onLevel(x: number, z: number): boolean {
  return nearDecks(x, z).some((d) => deckHas(d, x, z)) || nearRamps(x, z).some((r) => rampT(r, x, z) !== null);
}

// ---------- buildings: collision, flat interior floors, roof fade ----------
// y1 = top of the obstacle in world y (used by the camera de-clip ray)
const colliders: { x0: number; x1: number; z0: number; z1: number; y1: number }[] = [];
// round obstacles (tree trunks, boulders) — movement only, camera ignores them
const circleColliders: { x: number; z: number; r: number }[] = [];
// ORIENTED boxes: a wall that does not run north-south.
//
// The axis-aligned list above cannot express one, and a building's four walls
// are the commonest thing in the game that needs to be solid on its own axis.
// Approximating a slanted wall with a chain of axis-aligned boxes was the
// alternative and it costs ~28 boxes per house, which at city scale is
// thousands of tests per movement step; one oriented box is four numbers and a
// rotate. This is what lets a house be a SHELL you can walk into rather than a
// solid block, at any street angle.
// `y0` is the collider's BOTTOM: a rail round a stairwell exists only on the
// floor it guards, and must not fence the room underneath it.
const boxColliders: { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number; y1: number; y0: number }[] = [];
// building/wall footprints recorded at build time, cached for the zone map.
// A footprint is also a keep-off: the meadow (buildMeadow) and the wild
// scatter (wild-nature.ts keepClear) stay off every one. A fifth element 1
// marks a YARD: open ground the build keeps clear (a camp, a racking yard, an
// orchard's rows) that the map draws as an outline, not as a solid building.
// A fifth element 2 (FP_HIDDEN) is a keep-off the map does not draw: where
// the ground a build keeps clear is not the shape of what stands on it (the
// map draws that from MapLayers.extra instead).
export type MapFootprint = [number, number, number, number] | [number, number, number, number, number];
export const FP_YARD = 1, FP_HIDDEN = 2;
export const zoneFootprints: Record<string, MapFootprint[]> = {};
let fpZone = "";
// THE MAP LAYERS. Every road ribbon, river, pond and causeway a zone builds
// registers itself here as it is built, so the zone map and the minimap draw
// what the ground actually has instead of a hand-authored sketch (the old
// MAP_HINTS table, which covered one zone). Persisted per zone in
// localStorage like the footprints, so another zone's map can still be read
// from the world map once it has been walked.
//
// `roads` and `waters` are keep-offs as well (the meadow and wild-nature.ts
// read them), so they hold only what the ground has. `extra` is the MAP'S
// OWN: what a zone draws for the player but must not move a blade of grass --
// a wall walk in the sky, ice laid over a carved basin, a flume on trestles,
// the water of a sheet that floods a valley, a structure whose ground the
// zone already keeps clear by other means. Nothing but map.ts reads it, so
// adding to it leaves the world as it was (tools/qa/zone_fingerprint.mjs).
export interface MapRoadRec {
  pts: [number, number][]; half: number;
  // what the ground has, when it is not the control polyline: makePath
  // rounds its corners (pathSpine) and the keep-offs still read `pts`
  spine?: [number, number][];
  // a paved rectangle, not a road: square ends (a round cap overran a plaza's
  // ends by its half-width, over the houses and wings around it)
  rect?: true;
}
// "ice" a frozen tarn, "melt" molten glass: drawn in their own colours, not
// the water's navy. "runs" is a sheet's flooded cells, row by row: each row
// j (at z0 + j step) a list of [i0, i1] cell spans at x0 + i step.
export type MapWaterTone = "ice" | "melt";
export type MapWaterRec =
  | { kind: "ribbon"; pts: [number, number][]; half: number; tone?: MapWaterTone }
  | { kind: "disc"; x: number; z: number; r: number; tone?: MapWaterTone }
  | { kind: "runs"; x0: number; z0: number; step: number; rows: number[][]; tone?: MapWaterTone };
export interface MapLayers {
  roads: MapRoadRec[];
  waters: (Extract<MapWaterRec, { kind: "ribbon" | "disc" }>)[];
  // walls: a curtain, a rampart, a dam drawn as the buildings are, along its
  // line (a footprint is axis-aligned and a wall rarely is); `walk` the half
  // width of a walk along its top, drawn over it as a road
  extra?: { roads: MapRoadRec[]; waters: MapWaterRec[]; footprints: [number, number, number, number][]; walls?: MapWallRec[] };
}
export interface MapWallRec { pts: [number, number][]; half: number; walk?: number }
export const zoneMapLayers: Record<string, MapLayers> = {};
const R1 = (v: number) => Math.round(v * 10) / 10;
const layersHere = (): MapLayers => (zoneMapLayers[fpZone] ||= { roads: [], waters: [] });
const extraHere = (): NonNullable<MapLayers["extra"]> => (layersHere().extra ||= { roads: [], waters: [], footprints: [] });
const ptsR1 = (pts: { x: number; z: number }[] | [number, number][]): [number, number][] =>
  pts.map((p) => (Array.isArray(p) ? [R1(p[0]), R1(p[1])] : [R1(p.x), R1(p.z)]) as [number, number]);
function mapRoad(pts: { x: number; z: number }[] | [number, number][], half: number): MapRoadRec | null {
  if (!fpZone || pts.length < 2) return null;
  const rec: MapRoadRec = { pts: ptsR1(pts), half: R1(half) };
  layersHere().roads.push(rec);
  return rec;
}
// a road on the zone map that is not one makePath ribbon: a street laid as
// many hard-edged rectangles (zones/capital.ts), mapped once down its middle;
// `rect` for a paved rectangle (a square, a forecourt) drawn with square ends
export const addMapRoad = (pts: [number, number][], half: number, opts: { rect?: boolean } = {}): void => {
  const rec = mapRoad(pts, half);
  if (rec && opts.rect) rec.rect = true;
};
// THE MAP'S OWN (MapLayers.extra above): drawn, never a keep-off
export const addMapOnlyRoad = (pts: [number, number][], half: number): void => {
  if (fpZone && pts.length >= 2) extraHere().roads.push({ pts: ptsR1(pts), half: R1(half) });
};
export const addMapOnlyWater = (w: MapWaterRec): void => {
  if (!fpZone) return;
  if (w.kind === "disc") extraHere().waters.push({ ...w, x: R1(w.x), z: R1(w.z), r: R1(w.r) });
  else if (w.kind === "ribbon") { if (w.pts.length >= 2) extraHere().waters.push({ ...w, pts: ptsR1(w.pts), half: R1(w.half) }); }
  else if (w.rows.some((r) => r.length)) extraHere().waters.push(w);
};
export const addMapOnlyFootprint = (cx: number, cz: number, sx: number, sz: number): void => {
  if (fpZone) extraHere().footprints.push([R1(cx), R1(cz), R1(sx), R1(sz)]);
};
export const addMapOnlyWall = (pts: [number, number][], half: number, walk?: number): void => {
  if (!fpZone || pts.length < 2) return;
  (extraHere().walls ||= []).push({ pts: ptsR1(pts), half: R1(half), ...(walk ? { walk: R1(walk) } : {}) });
};
// Douglas-Peucker to `tol` metres: a makePath spine is a point every 0.9 m,
// and the map needs only its bends
function simplifyLine(pts: { x: number; z: number }[], tol: number): [number, number][] {
  if (pts.length < 3) return ptsR1(pts);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a].x, az = pts[a].z, dx = pts[b].x - ax, dz = pts[b].z - az, l = Math.hypot(dx, dz) || 1;
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i].x - ax) * dz - (pts[i].z - az) * dx) / l;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return ptsR1(pts.filter((_, i) => keep[i]));
}
function mapWaterRibbon(pts: { x: number; z: number }[], half: number, tone?: MapWaterTone): void {
  if (!fpZone || pts.length < 2) return;
  layersHere().waters.push({ kind: "ribbon", pts: ptsR1(pts), half: R1(half), ...(tone ? { tone } : {}) });
}
function mapWaterDisc(x: number, z: number, r: number, tone?: MapWaterTone): void {
  if (!fpZone) return;
  layersHere().waters.push({ kind: "disc", x: R1(x), z: R1(z), r: R1(r), ...(tone ? { tone } : {}) });
}
// `style`: true or FP_YARD for a yard, FP_HIDDEN for a keep-off the map skips
function recordFootprint(cx: number, cz: number, sx: number, sz: number, style: boolean | number = false): void {
  if (!fpZone) return;
  const fp: MapFootprint = [R1(cx), R1(cz), R1(sx), R1(sz)];
  if (style) fp.push(style === true ? FP_YARD : style);
  (zoneFootprints[fpZone] ||= []).push(fp);
}
// water bodies: terrain deeper than ~waist below the surface is unwalkable
let waterBodies: { x: number; z: number; r: number; level: number }[] = [];
// Opt-in hazardous liquids block even their shallow fringe. Built crossings
// take precedence, just as they do over the ordinary deep-water test.
let liquidBarriers: ((x: number, z: number) => boolean)[] = [];
// ground vegetation must not stand in rivers (Philip: "no vegetation in any
// rivers by default unless specifically overriden"). Rivers register their
// channel testers at build(); the scatter generators consult this the way
// they consult avoid lists. Rocks and the like are exempt on purpose —
// stones in a riverbed are set dressing, plants in one are a bug.
let vegExclusions: ((x: number, z: number) => boolean)[] = [];
let vegGen = 0; // bumped per zone build, so rivers re-register on revisits
function vegBlocked(x: number, z: number): boolean {
  return vegExclusions.some((f) => f(x, z)) || scatterBlocked(x, z);
}
// The blanket version: unlike vegExclusions these keep MINERAL dressing out
// too. Stones in a riverbed are set dressing and stay exempt — but a boulder
// a hundred metres out in an open bay is a hazard buoy, so an ocean registers
// its water here and everything the scatters place respects it.
let scatterExclusions: ((x: number, z: number) => boolean)[] = [];
function scatterBlocked(x: number, z: number): boolean {
  return scatterExclusions.some((f) => f(x, z));
}
// The depth at which walking stops. isWalkable's rule and makeOcean's guarantee
// about its own bed are the same number, so it is written once.
export const WADE_DEPTH = 0.9;
// spots exempt from the steep-slope rule (portals, carved paths)
let slopeExempt: { x: number; z: number; r: number }[] = [];
const flatZones: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
const cameraRooms: CameraRoom[] = [];
export function cameraDungeon(): boolean { return ZONES[currentZone]?.kind === "dungeon"; }
export function inspectCameraRooms(): readonly CameraRoom[] { return cameraRooms; }
export function cameraRoomAt(x: number, z: number, y: number, pad = 0): CameraRoom | undefined {
  // (a room may ask for a shorter approach than the caller's pad: CameraRoom.approach)
  return cameraRooms.find(room => cameraRoomHas(room, { x, y, z }, pad > 0 && room.approach !== undefined ? Math.min(pad, room.approach) : pad));
}

// Build-time hooks for external zone builders (town.ts): terrain sampling plus
// registration into the private collision / camera-room / footprint stores above.
export const buildApi = {
  ground: (x: number, z: number) => heightFn(x, z),
  // The height of the ground you can SEE, which is not the same number.
  //
  // heightFn is the true field; the terrain mesh samples it on a ~4.7m grid and
  // interpolates between, so wherever the field curves faster than the grid can
  // follow -- a road cut climbing a terrace is the standard case -- the drawn
  // surface rides ABOVE the function. Anything seated on heightFn there ends up
  // under the ground, which is exactly how Moonmere's lanes came to vanish into
  // the hillside every time they changed level.
  //
  // max() of the two, because the mesh can also cut BELOW the field on a convex
  // brow, and there the field is the surface. This is the same expression the
  // beach sand has used since the Moonmere Shores strand had green wedges
  // poking through it; it is now shared rather than copied a third time.
  surface: (x: number, z: number) => Math.max(heightFn(x, z), terrainMeshHeight(x, z)),
  addCollider: (x0: number, x1: number, z0: number, z1: number, y1: number) => colliders.push({ x0, x1, z0, z1, y1 }),
  addCircleCollider: (x: number, z: number, r: number) => circleColliders.push({ x, z, r }),
  addBoxCollider: (cx: number, cz: number, hx: number, hz: number, yaw: number, y1: number, y0 = -1e9) =>
    boxColliders.push({ cx, cz, hx, hz, sin: Math.sin(yaw), cos: Math.cos(yaw), y1, y0 }),
  addFlatZone: (x0: number, x1: number, z0: number, z1: number, y: number) => flatZones.push({ x0, x1, z0, z1, y }),
  // the levels (see groundHeight): an oriented floor, a round one, and a stair
  addDeck: (cx: number, cz: number, hx: number, hz: number, yaw: number, y: number, holes: Obb[] = [], cutouts:{x:number;z:number;r:number}[] = []) =>
    decks.push({ cx, cz, hx, hz, sin: Math.sin(yaw), cos: Math.cos(yaw), y, holes, cutouts }),
  addDisc: (cx: number, cz: number, r: number, y: number, holes: Obb[] = []) => decks.push({ cx, cz, r, y, holes }),
  addRamp: (x0: number, z0: number, y0: number, x1: number, z1: number, y1: number, half: number, endPad?:number, surfaceGroup?:string) => {
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    ramps.push({ x0, z0, y0, x1, z1, y1, half, endPad, surfaceGroup, ux: (x1 - x0) / len, uz: (z1 - z0) / len, len });
  },
  addStairBody:(x0:number,z0:number,y0:number,x1:number,z1:number,y1:number,half:number,thickness?:number,surfaceGroup?:string)=>{
    const len=Math.hypot(x1-x0,z1-z0);stairBodies.push({x0,z0,y0,x1,z1,y1,half,thickness,surfaceGroup,len,ux:(x1-x0)/len,uz:(z1-z0)/len});
  },
  obb: (cx: number, cz: number, hx: number, hz: number, yaw: number): Obb =>
    ({ cx, cz, hx, hz, sin: Math.sin(yaw), cos: Math.cos(yaw) }),
  addCameraRoom: (room: CameraRoom) => cameraRooms.push(room),
  footprint: (cx: number, cz: number, sx: number, sz: number, style: boolean | number = false) => recordFootprint(cx, cz, sx, sz, style),
};

// True when terrain at (x,z) can be stood on: not deep water, not a cliff face.
export function isWalkable(x: number, z: number): boolean {
  if (isFerryZone(currentZone)) return ferryDeckHeight(x,z) !== null;
  for (const f of flatZones) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return true; // built platforms override terrain
  }
  if (onLevel(x, z)) return true;
  return fieldWalkable(x, z);
}
// isWalkable without the built levels: the ground itself (water, cliffs). A deck
// overhead makes (x, z) walkable for whoever is up there, not for a body arriving
// on the ground under it (entryHeight).
function fieldWalkable(x: number, z: number): boolean {
  if (liquidBarriers.some(blocked => blocked(x, z))) return false;
  for (const w of waterBodies) {
    if (Math.hypot(x - w.x, z - w.z) < w.r && heightFn(x, z) < w.level - WADE_DEPTH) return false;
  }
  // steep-slope check (cliffs, mountain faces) with exemptions for paths/portals
  if (!slopeExempt.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) {
    const s = 0.6;
    const gx = (heightFn(x + s, z) - heightFn(x - s, z)) / (2 * s);
    const gz = (heightFn(x, z + s) - heightFn(x, z - s)) / (2 * s);
    if (Math.hypot(gx, gz) > 1.1) return false;
  }
  return true;
}

// MOVEMENT'S BOX COLLIDERS BY GROUND CELL, in every city-scale zone: a city
// holds thousands of boxes (rooms, railings, piers, courses -- the Capital
// ~3,300, Caerdun ~8,900) and every movement substep asked all of them. Each
// box is filed in a spatial.ts CellIndex over its turned extent plus BOX_PAD,
// more than the body's 0.45 m radius, so a body touching a box's fattened
// outline is always in one of its cells; the box's own test is unchanged and
// candidates come in list order (CITY-LOADING.md "Keeping it fast"). It was
// Caerdun's alone (a string-keyed rebuild on every change); now any zone in
// CITY_SCALE, filed incrementally as the list grows (quest doors join late),
// and started afresh when the list is emptied for the next zone. Elsewhere,
// and for a non-finite point, the full scan -- still the reference.
const BOX_CELL = 16, BOX_PAD = .6;
const CITY_SCALE = new Set(["caerdun", "moonmere", "heartwood", "capital", "capitalreturned"]);
let boxIndex: { scene: Scene; first: (typeof boxColliders)[number] | undefined; count: number; cells: CellIndex } | null = null;
function nearbyBoxes(x: number, z: number): readonly number[] | null {
  if (!CITY_SCALE.has(currentZone)) return null;
  if (!boxIndex || boxIndex.scene !== scene || boxIndex.count > boxColliders.length || boxIndex.first !== boxColliders[0]) {
    boxIndex = { scene, first: boxColliders[0], count: 0, cells: new CellIndex(BOX_CELL) };
  }
  for (; boxIndex.count < boxColliders.length; boxIndex.count++) {
    const b = boxColliders[boxIndex.count];
    const ex = Math.abs(b.cos) * b.hx + Math.abs(b.sin) * b.hz + BOX_PAD, ez = Math.abs(b.sin) * b.hx + Math.abs(b.cos) * b.hz + BOX_PAD;
    boxIndex.cells.add(boxIndex.count, b.cx - ex, b.cx + ex, b.cz - ez, b.cz + ez);
  }
  return boxIndex.cells.query(x, z);
}
// the boxes a probe at (x, z) must test: no array is made per probe
function anyNearbyBox(x: number, z: number, hit: (b: (typeof boxColliders)[number]) => boolean): boolean {
  const ids = nearbyBoxes(x, z);
  if (!ids) return boxColliders.some(hit);
  for (let i = 0; i < ids.length; i++) if (hit(boxColliders[ids[i]])) return true;
  return false;
}
export function resolveCollision(ox: number, oz: number, nx: number, nz: number, y = -1e9): [number, number] {
  const R = 0.45; // body radius
  const hit = (x: number, z: number) =>
    (isFerryZone(currentZone) && ferryBlockedMove(ox,oz,x,z)) ||
    (y > -1e8 && stairBodyHit(x,z,y) && !stairBodyHit(ox,oz,y)) ||
    colliders.some((c) => {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      return boxBlocksMove(ox-cx, oz-cz, x-cx, z-cz, (c.x1-c.x0)/2+R, (c.z1-c.z0)/2+R);
    }) ||
    circleColliders.some((c) => {
      const before = Math.hypot(ox-c.x, oz-c.z), after = Math.hypot(x-c.x, z-c.z);
      return before < c.r+R ? after < before-1e-10 : after < c.r+R;
    }) ||
    anyNearbyBox(x, z, (b) => {
      // a collider with a bottom only exists on its own floor
      if (y > -1e8 && (y + 1.2 < b.y0 || y > b.y1)) return false;
      // into the box's own frame, then the same fattened-AABB test as above
      const dx = x - b.cx, dz = z - b.cz;
      const oldX = ox - b.cx, oldZ = oz - b.cz;
      return boxBlocksMove(oldX*b.cos-oldZ*b.sin, oldX*b.sin+oldZ*b.cos,
        dx*b.cos-dz*b.sin, dx*b.sin+dz*b.cos, b.hx+R, b.hz+R);
    }) ||
    (!isWalkable(x, z) && isWalkable(ox, oz));
  if (!hit(nx, nz)) return [nx, nz];
  if (!hit(ox, nz)) return [ox, nz]; // slide along x-facing wall
  if (!hit(nx, oz)) return [nx, oz]; // slide along z-facing wall
  return [ox, oz];
}

/** Dev: what stops a character of radius R at (x, z, y), if anything. */
export function debugHit(x: number, z: number, y: number): string {
  const R = 0.45;
  const out: string[] = [];
  if(stairBodyHit(x,z,y))out.push('solid stair body');
  colliders.forEach((c, i) => { if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) out.push(`aabb${i}`); });
  circleColliders.forEach((c, i) => { if (Math.hypot(x - c.x, z - c.z) < c.r + R) out.push(`circle${i}`); });
  (nearbyBoxes(x, z) ?? boxColliders.map((_, i) => i)).forEach(i => {
    const b=boxColliders[i];
    if (y + 1.2 < b.y0 || y > b.y1) return;
    const dx = x - b.cx, dz = z - b.cz;
    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
    if (Math.abs(lx) < b.hx + R && Math.abs(lz) < b.hz + R) out.push(`box${i}@${b.cx.toFixed(1)},${b.cz.toFixed(1)} h${b.hx}x${b.hz} y${b.y0 > -1e8 ? b.y0.toFixed(1) : "-"}..${b.y1.toFixed(1)}`);
  });
  if (!isWalkable(x, z)) out.push("unwalkable");
  return out.join("; ") || "clear";
}

/** A body of radius R standing at (x, z, y) overlaps nothing solid on its floor:
 *  debugHit's tests (a stair body, the boxes, the circles) without the strings. */
export function bodyClearAt(x: number, z: number, y: number): boolean {
  const R = 0.45;
  if (stairBodyHit(x, z, y)) return false;
  if (colliders.some((c) => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R)) return false;
  if (circleColliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + R)) return false;
  return !anyNearbyBox(x, z, (b) => {
    if (y + 1.2 < b.y0 || y > b.y1) return false;
    const dx = x - b.cx, dz = z - b.cz;
    return Math.abs(dx * b.cos - dz * b.sin) < b.hx + R && Math.abs(dx * b.sin + dz * b.cos) < b.hz + R;
  });
}
/**
 * THE ENTRY HEIGHT: the level a body ARRIVING at (x, z) stands on -- a login, a
 * refresh, a zone change, a remote player first seen -- when there is no height
 * a frame ago to say which floor it is on (groundHeight's prevY). The server
 * holds x and z only, so groundHeight(x, z) alone answered the base ground under
 * every upper floor: anyone who logged out on a wall walk, a tower room or a
 * hall's floor came back inside the masonry under it, and most could not walk
 * out (Caerdun's walk review, MEASURED: 305 of 365 such entries inside a
 * collider, 122 unable to reach the spawn's network).
 *   - `hint`, a height the caller remembers for this very spot (the client's own
 *     last height, world.ts), picks its floor when a body fits there;
 *   - else the ground, when a body fits there and it is not water or a cliff --
 *     so every entry that was right before is unchanged (a street under a walk,
 *     a gate passage under its chamber);
 *   - else the LOWEST built level above the ground where a body fits: the walk
 *     over a curtain's solid mass, a tower's walk room, a hall's ground floor
 *     over its plinth -- a floor the building's own stairs lead on from.
 * Only where nothing fits does it fall back to the ground, as before.
 */
export function entryHeight(x: number, z: number, hint?: number): number {
  const base = groundHeight(x, z);
  if (isFerryZone(currentZone) || (!decks.length && !ramps.length)) return base;
  if (hint !== undefined && Number.isFinite(hint)) {
    const y = groundHeight(x, z, hint);
    if (Math.abs(y - hint) < 0.6 && bodyClearAt(x, z, y)) return y;
  }
  if (bodyClearAt(x, z, base) && fieldWalkable(x, z)) return base;
  const levels: number[] = [];
  for (const d of nearDecks(x, z)) if (deckHas(d, x, z)) levels.push(d.y);
  for (const r of nearRamps(x, z)) { const t = rampT(r, x, z); if (t !== null) levels.push(r.y0 + (r.y1 - r.y0) * t); }
  levels.sort((a, b) => a - b);
  for (const y of levels) if (y > base + 0.05 && bodyClearAt(x, z, y)) return y;
  return base;
}

// Exact ray tests avoid stepping over thin walls or skipping nearby indoor obstacles.
export function cameraObstruction(tx: number, ty: number, tz: number, cx: number, cy: number, cz: number, indoor = false): number | null {
  const dx = cx - tx, dy = cy - ty, dz = cz - tz, len = Math.hypot(dx, dy, dz);
  if (len < .001) return null;
  const pad = .18, ignore = indoor ? .02 : 2.4;
  let nearest = Infinity;
  const box = (o: number[], d: number[], low: number[], high: number[]) => {
    const hit = cameraBoxRay(o, d, low, high);
    if (hit && hit[1] * len >= ignore) nearest = Math.min(nearest, Math.max(0, hit[0] * len - .02));
  };
  for (const c of colliders) box([tx, ty, tz], [dx, dy, dz], [c.x0-pad, -1e9, c.z0-pad], [c.x1+pad, c.y1+pad, c.z1+pad]);
  for (const b of boxColliders) {
    const x = tx-b.cx, z = tz-b.cz;
    box([x*b.cos-z*b.sin, ty, x*b.sin+z*b.cos], [dx*b.cos-dz*b.sin, dy, dx*b.sin+dz*b.cos], [-b.hx-pad, b.y0-pad, -b.hz-pad], [b.hx+pad, b.y1+pad, b.hz+pad]);
  }
  if (indoor && Math.abs(dy) > 1e-6) for (const floor of decks) {
    const t = (floor.y - Math.sign(dy)*pad - ty) / dy;
    if (t >= 0 && t <= 1 && deckHas(floor, tx+dx*t, tz+dz*t)) nearest = Math.min(nearest, t*len);
  }
  // Sloping stair bodies and terrain use the same height rules as movement.
  const count = Math.ceil(len/.1);
  for (let i = 1; i <= count; i++) {
    const t = i/count, x = tx+dx*t, y = ty+dy*t, z = tz+dz*t;
    if (t*len >= ignore && stairBodyHit(x,z,y,pad)) { nearest = Math.min(nearest, Math.max(0, (i-1)/count*len)); break; }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

// ---------- height functions per zone ----------
// Sink a pond/lake basin into the terrain so water sits IN the ground:
// inside the rim the terrain is capped below the waterline, and a shore lip
// rises to just above it right at the water's edge, so no part of the water
// disc can hang over lower ground. `level` is the waterline (the disc's y).
function basin(h: number, d: number, r: number, level: number, depth = 1.2): number {
  const u = d / r;
  if (u >= 1.4) return h;
  if (u < 1) {
    // override toward a flat bowl floor: sinks high ground AND raises deep
    // ground, so the bed depth under the water is known. Wadeable waters use
    // depth ≤ 0.85, which stays inside isWalkable's deep-water allowance.
    const t = u < 0.8 ? 1 : 1 - smooth((u - 0.8) / 0.2);
    h = h * (1 - t) + (level - depth) * t;
    if (depth <= 0.9) h = Math.max(h, level - depth); // no drowned dips in the blend band
  }
  // shore lip: raise any dipping ground at the rim to close the waterline,
  // fading back to natural terrain outside
  const bermT = u < 1.02
    ? smooth(Math.min(1, Math.max(0, (u - 0.78) / 0.22)))
    : smooth(Math.min(1, Math.max(0, (1.4 - u) / 0.38)));
  return h * (1 - bermT) + Math.max(h, level + 0.55) * bermT;
}

// A WADING SHELF: lift a basin's bed back toward the surface across its outer
// `w` metres. Depth-driven transparency can only be as wide as the shallow
// ground beneath it, and basin()'s own blend is short -- MEASURED, it takes the
// Mere from dry to its floor in 18m and the Summer Lakes in FOUR. Without this
// the clear band is a couple of metres and the rest of the water is opaque.
//
// max(), so it can only ever raise: the floor further in is untouched, the lip
// at the rim still wins, and basin() -- which every water body in the game
// shares -- is not modified. `r` is the MEASURED crossing radius rather than
// the nominal basin radius, because that is where the shelf has to arrive at
// the waterline.
function shelf(h: number, d: number, r: number, level: number, floor: number, w: number): number {
  return Math.max(h, floor + (level - floor) * smooth(Math.min(1, Math.max(0, (d - (r - w)) / w))));
}

// ---------- zone shapes ----------
//
// NO ZONE IS A SQUARE (Philip, 2026-08-31). The zone cards in
// design/the-empty-throne.html draw irregular plates -- coasts on some edges,
// survey lines and ridges on others -- and the built zone is that plate, not
// the 700m square the terrain mesh happens to be laid on. The old zones were
// squares; they are not the model for anything now.
//
// A shape is the card's own polygon in world metres, plus one flag per EDGE:
//
//   coast[i] === true   the edge from pts[i] to pts[i+1] is WATER. The sea
//                       starts there (makeOcean's `shore` mode measures from
//                       it) and the rim chain keeps out.
//   coast[i] === false  a land border. The rim chain runs along it, and that
//                       chain IS the zone's visible edge on that side.
//
// The terrain mesh still covers the whole square, and that is fine: seaward of
// a coast edge the ocean carve replaces it with seabed, and behind a land edge
// it is hidden by the mountains standing on it.
export interface ZoneShape { pts: [number, number][]; coast: boolean[] }

// Subdivided and wandered ONCE per shape, so no edge of a zone is a ruled line
// (the cards' own boundaries are drawn with the same treatment). Deterministic:
// the offsets are fbm of the midpoint, so the same shape comes back every build
// and the coast, the rim and the map all agree about where the edge is.
// `amp` is how far the middle of an edge may wander, metres (26 by default):
// a zone whose content is laid out to the card line -- the King's Gardens'
// parterres -- passes less, because the rim walks the wandered line and its
// rocks reached the hedges (Philip: "mountain over garden").
function shapeDetail(sh: ZoneShape, seed: number, amp = 26): ZoneShape {
  const pts: [number, number][] = [];
  const coast: boolean[] = [];
  const n = sh.pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.round(len / 60));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
      // ends stay pinned so the corners of the card survive; the middle wanders
      const w = Math.sin(t * Math.PI) * amp * (fbm(mx / 90 + seed, mz / 90 + seed) - 0.5) * 2;
      pts.push([mx + nx * w, mz + nz * w]);
      coast.push(sh.coast[i]);
    }
  }
  return { pts, coast };
}

// the Moonmere Shores, off its card: a plate with two LAND borders -- the
// northern one, which the shut border gate stands on, and the EASTERN one,
// which the shore road leaves through at the corner where the two meet
// (Philip's correction: the card's east edge is a border, not a coast, and a
// road cannot leave over water). South and west are the academy's water, which
// is what lets the causeway run south and the gulf ferry leave westward from
// the same plate.
const MS_SHAPE = shapeDetail({
  pts: [
    // the west coast is pulled 35m off the terrain edge: at x = -335 there was
    // only 15m of sea inside the zone, and 15m of this shelf is 0.5m deep, so
    // the depth rule never bit and the west side was walkable to the boundary
    [-298.0, 200.6], [7.1, 252.5], [323.3, 195.9],
    [338.0, -244.0], [-2.4, -252.5], [-302.0, -160.0],
  ],
  coast: [false, false, false, true, true, true],
}, 3);

// Which shape a zone has, if any. A zone with no entry is still built the old
// square way -- every zone from the previous world is, and none of them is a
// model for a new one.
const ZONE_SHAPES: Record<string, ZoneShape> = {
  moonmereshores: MS_SHAPE,
};

// ---------- zone modules ----------
// The Empty Throne's provinces each live in their own file under zones/ and
// register here at import time, so this file stops growing a thousand lines
// per zone. A module hands over the pieces this file used to hold per zone:
// the card's plate, the biome theme, the ground sheet, a height shaping step
// that runs on the shared field noise, the rivers and ponds to carve with the
// smoothing pre-function, the rim, and the signature build. buildZone,
// fieldHeight, buildZoneEdge and buildGenericWilds consult the registry at
// the same points where the hand-written branches used to be.
export interface ZoneModule {
  key: string;
  shape?: ZoneShape;                                   // the card's plate, already shapeDetail'd
  theme?: WildsTheme;                                  // base scatter + fog (counts per 240m slice)
  terrain?: { tex: string; tint: [string, string]; tile: number };
  carpet?: { files: string[]; count: number; tint?: string; scale?: [number, number] };
  avoid?: [number, number, number][];                  // hand-declared clearings for the scatters
  height?: (x: number, z: number, h: number) => number; // shapes the shared field noise
  carves?: { carve: (x: number, z: number, h: number, pre?: (px: number, pz: number) => number) => number }[];
  exclusions?: () => void;                             // pushes veg/scatter exclusions (runs from fieldHeight)
  edge?: (size: number) => void;                       // the rim chain
  passes?: RimPass[];                                  // exits cut through the rim (makeRimPass): floor, exclusions, gorge
  build?: (size: number) => void;                      // the signature build, after the generic scatters
  hemi?: number;                                       // a dungeon's ambient level (default 0.62)
  // A zone's own daylight, where the shared one is wrong for what it is built
  // of: `shadow` the sun's shadow darkness (0 = black, the default: the hemi is
  // the only fill) and `hemiGround` the hemisphere's ground colour, the light
  // that comes UP off the ground onto soffits and the undersides of things
  // (default #4a4258, a violet dusk under a wild sky). The Capital's limestone
  // streets throw warm light back, and its arcades are mostly shade.
  light?: { shadow?: number; hemiGround?: string };
  // The terrain's vertex tint at (x, z), given the one buildTerrain worked out
  // (the tint pair across the noise, then steep-is-rock). One ground sheet per
  // zone, so a zone whose ground changes kind -- the Capital's lawns inside its
  // walls, the Burned Land's ash outside them -- says so here. Vertex colour
  // multiplies the sheet, so it can only darken it (TERRAIN_TEX).
  groundTint?: (x: number, z: number, c: Color3) => Color3;
  // A DUNGEON's outside, light and glow (dungeon-backdrop.ts, BACKDROP.md).
  // `outdoor`: the parent zone's baked panorama, the sky at a fixed hour and a
  // terrain skirt (true = its dungeon-backdrops.json entry; an object is laid
  // over that entry). Without it a dungeon is enclosed: no ground plane, the
  // clear colour the fog's. `lighting`: hemi, sun, fog, exposure and the light
  // pools, applied after `build`. `glow`: the plan's glow occluder.
  outdoor?: Partial<DungeonOutdoor> | true;
  lighting?: DungeonLighting;
  glow?: DungeonGlow;
}
const ZONE_MODULES: Record<string, ZoneModule> = {};
export function registerZone(m: ZoneModule): void {
  ZONE_MODULES[m.key] = m;
  if (m.shape) ZONE_SHAPES[m.key] = m.shape;
  if (m.theme) WILDS_THEMES[m.key] = m.theme;
  if (m.terrain) TERRAIN_TEX[m.key] = m.terrain;
  if (m.carpet) CARPETS[m.key] = m.carpet;
  if (m.avoid) VIG_AVOID[m.key] = m.avoid;
}
export function zoneModule(key: string): ZoneModule | undefined { return ZONE_MODULES[key]; }

// The Moonmere Shores' plateau: a flat table at the north-east corner's own
// height with cliff sides (Philip's lasso). Points are his, in world metres.
export const MS_PLATEAU: [number, number][] = [
  [108, -8], [109, -12], [119, -19], [144, -28], [209, -31], [225, -31],
  [244, -24], [255, -17], [255, -12], [236, 5], [232, 15], [241, 26],
  [280, 58], [294, 72], [298, 92], [350, 140], [400, 172], [400, 190],
  [350, 166], [310, 144], [234, 102], [116, 6], [109, -4], [108, -14],
];
// 11.5, fifteen metres under the corner (Philip). The east end runs out past the
// terrain edge and INTO the rim, so the table's far cliff dies inside the
// mountains instead of ending in mid-field where it can be seen.
export const MS_PLATEAU_Y = 11.5;
// bounding box with a margin, so the height function pays for the 24 edges
// only where it might matter -- it is called a few hundred thousand times a
// build and the table covers a fifth of the zone
const MS_PLAT_BB = MS_PLATEAU.reduce(
  (b, [x, z]) => [Math.min(b[0], x - 30), Math.min(b[1], z - 30), Math.max(b[2], x + 30), Math.max(b[3], z + 30)],
  [1e9, 1e9, -1e9, -1e9]);

// distance to a polygon's edge, POSITIVE inside it
function polySignedDist(poly: [number, number][], x: number, z: number): number {
  let d = Infinity, inside = false;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    d = Math.min(d, segDist(x, z, ax, az, bx, bz)[0]);
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside ? d : -d;
}

// the map draws the same outline the ground is built to
export function zoneShape(zoneKey: string): ZoneShape | undefined { return ZONE_SHAPES[zoneKey]; }

// Point-in-polygon, and the nearest edge with its style. One pass, because
// every caller wants both: the coast needs the sign and the distance, the rim
// needs to know whether the edge it is walking is land or water.
// How far a coast runs ON past the corner where a land border takes over. The
// water otherwise stops dead on the line where the rim chain begins, and the
// two edges line up into a seam you can see from anywhere on the shore
// (Philip: "where the ocean ends line up with the mountain rims, I want the
// ocean to be extended past and slightly around the rim mountains"). 70m puts
// the sea behind the end of the chain, so the chain reads as a headland with
// water round its foot instead of as a wall the sea is afraid of.
const COAST_RUN_ON = 70;

// The two distances a coastline question needs, kept apart: how far this point
// is from the WATER, and how far it is from the boundary. Conflating them put a
// beach ramp along the northern land border and let the sand ring accept
// crossings up against the wall.
// The point-independent half of shapeNear, once per shape: the coast segments
// as extended past their land corners, the land segments, a tree over each,
// and the edges filed by the z band they span, for the inside test. Shapes are
// built once and never edited; the length check is a guard, not a mechanism.
interface ShapeInfo { n: number; coast: SegmentTree; land: SegmentTree; bands: Map<number, number[]> }
const SHAPE_BAND = 8;
const shapeInfos = new WeakMap<ZoneShape, ShapeInfo>();
function shapeInfo(sh: ZoneShape): ShapeInfo {
  const cached = shapeInfos.get(sh);
  if (cached && cached.n === sh.pts.length) return cached;
  const n = sh.pts.length, coast: number[] = [], land: number[] = [];
  const bands = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n];
    if (sh.coast[i]) {
      // exactly shapeNearScan's extension
      let sx = ax, sz = az, ex = bx, ez = bz;
      const prevLand = !sh.coast[(i - 1 + n) % n], nextLand = !sh.coast[(i + 1) % n];
      if (prevLand || nextLand) {
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        if (prevLand) { sx -= ux * COAST_RUN_ON; sz -= uz * COAST_RUN_ON; }
        if (nextLand) { ex += ux * COAST_RUN_ON; ez += uz * COAST_RUN_ON; }
      }
      coast.push(sx, sz, ex, ez);
    } else {
      land.push(ax, az, bx, bz);
    }
    // an edge flips the ray test only where exactly one end is above z, so
    // only for z in [min, max) -- file it under every band that range touches
    for (let k = Math.floor(Math.min(az, bz) / SHAPE_BAND); k <= Math.floor(Math.max(az, bz) / SHAPE_BAND); k++) {
      const list = bands.get(k); if (list) list.push(i); else bands.set(k, [i]);
    }
  }
  const info = { n, coast: new SegmentTree(coast), land: new SegmentTree(land), bands };
  shapeInfos.set(sh, info);
  return info;
}
// A height query asks this of one point several times over -- the city's
// base, its natural ground and the ocean's seaward each ask for themselves --
// so the last answer is kept. Callers read the result and never write to it.
let shapeLast: { sh: ZoneShape; x: number; z: number; q: { dCoast: number; dLand: number; inside: boolean } } | null = null;
function shapeNear(sh: ZoneShape, x: number, z: number):
    { dCoast: number; dLand: number; inside: boolean } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return shapeNearScan(sh, x, z);
  if (shapeLast && shapeLast.sh === sh && shapeLast.x === x && shapeLast.z === z) return shapeLast.q;
  const q = shapeNearIndexed(sh, x, z);
  shapeLast = { sh, x, z, q };
  return q;
}
function shapeNearIndexed(sh: ZoneShape, x: number, z: number):
    { dCoast: number; dLand: number; inside: boolean } {
  const c = shapeInfo(sh);
  c.coast.nearest(x, z); c.land.nearest(x, z);
  const dCoast = c.coast.d, dLand = c.land.d;
  let inside = false;
  const n = sh.pts.length;
  for (const i of c.bands.get(Math.floor(z / SHAPE_BAND)) ?? []) {
    const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return { dCoast, dLand, inside };
}
/** The definition shapeNear must keep agreeing with: every edge, every time. */
function shapeNearScan(sh: ZoneShape, x: number, z: number):
    { dCoast: number; dLand: number; inside: boolean } {
  let dCoast = Infinity, dLand = Infinity, inside = false;
  const n = sh.pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n];
    if (sh.coast[i]) {
      // a coast segment whose neighbour is land is extended past that corner,
      // along its own direction, so the water carries on around the headland
      let sx = ax, sz = az, ex = bx, ez = bz;
      const prevLand = !sh.coast[(i - 1 + n) % n], nextLand = !sh.coast[(i + 1) % n];
      if (prevLand || nextLand) {
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        if (prevLand) { sx -= ux * COAST_RUN_ON; sz -= uz * COAST_RUN_ON; }
        if (nextLand) { ex += ux * COAST_RUN_ON; ez += uz * COAST_RUN_ON; }
      }
      dCoast = Math.min(dCoast, segDist(x, z, sx, sz, ex, ez)[0]);
    } else {
      dLand = Math.min(dLand, segDist(x, z, ax, az, bx, bz)[0]);
    }
    // ray cast to the +x side, same loop
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return { dCoast, dLand, inside };
}

// Moonmere Shores' coast: an ocean, and the beach it lands on. THE REFERENCE
// CONSUMERS of makeOcean / makeBeach -- see WATER.md.
//
// The zone is its CARD'S SHAPE, not a square, so the coast is not an arc
// facing one way. MS_SHAPE's east, south and west edges are all water -- the
// plate is a headland reaching into the academy's Mere, which is what lets the
// gulf ferry leave westward and the causeway run south from the same ground.
//
// (0, 0) is therefore not "out to sea" here and 300 is not the coastline's
// radius: in `shore` mode they only place the sheet and give the beach its scan
// centre, and the coastline is the shape. reach 780 carries the sheet ~430m
// past the far corners of the terrain, which is well past anything the fog
// leaves visible.
// reach 1100, not 780: from the south-east shore you could see where the sheet
// ended (Philip: "ensure the ocean wraps behind the rim mountains so that
// players cannot see the end of the ocean"). At 1100 the edge is ~900m from
// anywhere anyone stands, which the zone's haze closes long before.
export const MS_MERE = makeOcean(0, 0, 300, { shore: MS_SHAPE, reach: 1100, seed: 9,
  // A STEEPER SHELF than the default 1.55m over 40m: this is a lake shore with
  // the zone edge close behind it, and the wading band has to reach 0.9m well
  // inside the terrain. 2.0m over 26m crosses 0.9m about 12m out -- still a
  // clear turquoise band you can stand in, and half the run to get there.
  floor: 2.0, shelf: 26,
  // 0.95, not the default 0.82: out past the sand the bed stops being drawn at
  // all, and at 0.82 you could see the water stop with it. Deep water this far
  // out has nothing to show through it anyway -- the clear shallows are the
  // part that has to stay see-through, and those are nowhere near this alpha.
  maxAlpha: 0.95 });
// half 400, not the zone's 350: the shape's south-west corner stands 375m from
// the scan centre, so a 350 cap dropped that whole corner's waterline and left
// it without sand. cells 200 keeps the sand grid near 4m across an 850m square.
const MS_STRAND = makeBeach(MS_MERE, { half: 400, cells: 200 });

// The reed flats: the card's marsh stipple west of the road, as two shallow
// ponds on the universal default (WATER.md). No `vegetation` opt -- the reeds
// that make this read as a marsh are placed by hand at the measured waterline
// below, which is the rule; a scatter left loose in the water would stand
// meadow flowers in it too.
const MS_POND1 = makePond(-168, 46, 44, { seed: 31 });
const MS_POND2 = makePond(-96, 122, 26, { seed: 32 });

// distance from p to the segment a-b, and how far along it that lands (0..1)
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 < 1e-6 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (pz - az) * vz) / len2));
  return [Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t];
}



function fieldHeight(zoneKey: string) {
  const def = ZONES[zoneKey];
  const size = def.size;
  const mod = ZONE_MODULES[zoneKey];
  const base = (x: number, z: number): number => {
    let h = fbm(x / 60, z / 60) * 7 - 3.5;
    h += (fbm(x / 240 + 9, z / 240 + 9) - 0.5) * 9;      // broad rolling swells
    h += (vnoise(x / 9 + 50, z / 9 + 50) - 0.5) * 2.2;   // fine surface detail
    // Gentle bowl toward the edges so the world reads as vast, ringed by hills
    // -- but ONLY for a zone that is still a square. A shaped zone's edge is
    // its polygon, and this term is measured off the square, so it raised a
    // ridge across the middle of the water on one side and left nothing on the
    // other. The shape's own borders carry the rim; its coasts carry the sea.
    if (!ZONE_SHAPES[zoneKey]) {
      const edge = Math.max(Math.abs(x), Math.abs(z)) / (size / 2);
      h += Math.max(0, edge - 0.82) * 40;
    }
    if (mod?.height) h = mod.height(x, z, h);
    if (zoneKey === "moonmereshores") {
      // Gentler country than the default field: this is a lakeshore ring, and
      // the swells the base function draws for the Greywold put 12m hills
      // between the causeway and the ferry. Same two carves as the vignette,
      // same order and for the same reason -- the beach blends the FIELD into
      // its ramp, so it must see the sea's bed first.
      h *= 0.62;
      // THE WOOD STANDS ON RISING GROUND. The shore road climbs through it to
      // the north-east corner, which stands 10m over the rest of the plate
      // (Philip) -- so the pass out of the zone is a pass, and the wood reads
      // as a shoulder of high ground rather than more of the same meadow.
      // One dome centred on the corner: 25m at the corner, ~12m through the
      // middle of the wood, nothing by the time it reaches the gate or the
      // south coast, and an 8% grade the whole way, which walks like a slope
      // and never like a hill you have to climb.
      h += 25 * smooth(Math.max(0, Math.min(1, (320 - Math.hypot(x - 318, z - 192)) / 320)));
      // THE PLATEAU. Flat at the corner's height, and its sides are a CLIFF --
      // the whole climb happens in 8m, which is a grade of ~3 and so far past
      // isWalkable's 1.1 limit that the only ways up are the ends where the
      // table meets ground already at its own height.
      if (x > MS_PLAT_BB[0] && z > MS_PLAT_BB[1] && x < MS_PLAT_BB[2] && z < MS_PLAT_BB[3]) {
        const pd = polySignedDist(MS_PLATEAU, x, z);
        if (pd > -6) {
          const t = smooth(Math.max(0, Math.min(1, (pd + 4) / 8)));
          // max, not a straight blend: the corner's dome already stands higher
          // than the table at the north-east end, and blending there would have
          // cut a seven-metre trench along the top of the hill. A plateau only
          // ever raises ground -- where the hill is already above it, the table
          // simply merges into the hill.
          h = Math.max(h, h * (1 - t) + MS_PLATEAU_Y * t);
        }
      }
      // FLOOR THE LAND ABOVE THE WATERLINE. The square zones got this for free
      // from their edge bowl, which a shaped zone does not have: without it the
      // field's own noise dips below the sea's level hundreds of metres inland,
      // and every one of those hollows is a place the depth rule refuses to let
      // anyone walk (the sheet is masked by the coast, so they are invisible
      // too). Only the beach ramp may cross the waterline -- the same rule the
      // Shore Road's dunes follow.
      h = Math.max(h, -0.2);
      h = MS_MERE.carve(x, z, h);
      h = MS_STRAND.carve(x, z, h);
    }
    // The canal's channel is CANAL.carve's job now, in fieldHeight over this
    // finished ground -- carving it here would cut into the noise instead of
    // replacing it (WATER.md's two-phase wiring).
    return h;
  };
  // Rivers are applied OVER the finished pre-river terrain, and are handed
  // the pre-river function itself so the carve can average it and lay a
  // SMOOTH channel — see makeRiver. A zone that grows a river adds itself
  // here; carving inside `base` instead loses the smoothing and brings the
  // sawtooth waterline back.
  if (zoneKey === "moonmereshores") {
    // The sea has ONE definition of where the land stops (WATER.md), so the
    // vegetation scatters are told about it here rather than through an avoid
    // circle: a circle big enough to cover a 240m bay would also strip the
    // headlands. Registered from the height function because the scatters run
    // before any builder does, and buildZone clears vegExclusions immediately
    // before fieldHeight is called. Reeds at the waterline are placed by hand.
    // -12, not 0: the beach lays 16m of DRY sand past the waterline, and a
    // meadow blade standing on it reads as grass growing out of the strand.
    vegExclusions.push((x, z) => MS_MERE.seaward(x, z) > -12);
    // and 5m out for everything else: boulders at the waterline are what a
    // shore looks like, boulders a hundred metres out in the bay are not.
    scatterExclusions.push((x, z) => MS_MERE.seaward(x, z) > 5);
    // nothing stands on the plateau's cliff face either -- a tree rooted in a
    // vertical wall grows sideways out of it
    scatterExclusions.push((x, z) =>
      x > MS_PLAT_BB[0] && z > MS_PLAT_BB[1] && x < MS_PLAT_BB[2] && z < MS_PLAT_BB[3]
      && Math.abs(polySignedDist(MS_PLATEAU, x, z)) < 7);
  }
  if (mod?.exclusions) mod.exclusions();
  // a rim pass is a carve (its floor) and a clearing (nothing grows in a gorge)
  for (const p of mod?.passes ?? []) scatterExclusions.push((x, z) => p.blocks(x, z));
  // The Shores' two ponds are built here, not in a module, so they lead the
  // chain: they used to be the fallback for "no module carves", and the
  // moment zones/moonmereshores.ts declared a pass or a carve of its own the
  // ponds would have silently drained.
  const carves = [
    ...(zoneKey === "moonmereshores" ? [MS_POND1, MS_POND2] : []),
    ...(mod?.carves ?? []), ...(mod?.passes ?? []),
  ];
  return carves.length
    ? (x: number, z: number) => carves.reduce((h, c) => c.carve(x, z, h, base), base(x, z))
    : base;
}








// THE CITY ROADS: graded cuttings in a city's own ground. Each is a polyline;
// along it the natural ground is replaced by the road's profile, relaxed to
// ROAD_GRADE, and blended back into the ground over ROAD_BLEND metres either
// side -- the road's cutting (gradeRoads below; Caerdun's and Heartwood's
// streets).
interface Road { pts: [number, number][]; half: number }
const ROAD_BLEND = 14;     // metres the cut blends back into the natural ground

// The steepest a road is allowed to be: the kit's exterior stair rises 1.000m
// per 2.078m of run (MEASURED). About as steep as a street can be and still
// read as walked rather than climbed, and the network was laid out against it.
const ROAD_GRADE = 1.0 / 2.078;
const ROAD_STEP = 4;   // metres between road profile samples

/**
 * A road's height profile: the NATURAL ground under it (whatever the city's
 * own terrain is -- terraces, a dome, a forest floor), relaxed to ROAD_GRADE.
 * Shared by every city; Caerdun passes its terraces.
 */
function sampleRoad(r: Road, natural: (x: number, z: number) => number, pinStart?: number, pinEnd?: number): number[] {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const l = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    lens.push(l); total += l;
  }
  const n = Math.max(2, Math.round(total / ROAD_STEP));
  const ys: number[] = [];
  for (let k = 0; k <= n; k++) {
    const [x, z] = roadPoint(r, lens, total, k / n);
    ys.push(natural(x, z));
  }
  // Relax until every step is inside the grade limit. NOT a straight line
  // between the ends: the main road runs spit-to-harbour and both are at sea
  // level with the hill between, so a straight grade cut a canyon through the
  // middle of the city.
  const cap = ROAD_GRADE * (total / n);
  for (let pass = 0; pass < 3000; pass++) {
    // A JUNCTION IS ONE HEIGHT, not two. Each road relaxes its own profile, so
    // a branch and the road it leaves arrive at the shared point with
    // different answers -- and the ground between the two cuts then has to
    // make up the difference in a few metres. Philip measured 1.61 gradient on
    // what is supposed to be a graded street, and it was two cuts disagreeing.
    // Pinning the branch's first sample to the parent's height there, inside
    // the relaxation loop, spreads the correction along the branch instead.
    // And a road that ENDS on another (or on open ground) is pinned there too:
    // a loop's far end meeting its parent a metre off is a step in the middle
    // of a junction. The pins go on BEFORE the pass is measured -- applied
    // after, the loop broke on a clean measurement and left the step the pin
    // had just re-introduced (MEASURED: a 0.77 grade at the observatory door).
    if (pinStart !== undefined) ys[0] = pinStart;
    if (pinEnd !== undefined) ys[ys.length - 1] = pinEnd;
    let worst = 0;
    for (let k = 0; k < ys.length - 1; k++) {
      const d = ys[k + 1] - ys[k];
      if (Math.abs(d) <= cap) continue;
      const fix = (Math.abs(d) - cap) * 0.5 * Math.sign(d);
      ys[k] += fix; ys[k + 1] -= fix;
      worst = Math.max(worst, Math.abs(d) - cap);
    }
    if (worst < 0.01) break;
  }
  if (pinStart !== undefined) ys[0] = pinStart;
  if (pinEnd !== undefined) ys[ys.length - 1] = pinEnd;
  return ys;
}

function roadPoint(r: Road, lens: number[], total: number, u: number): [number, number] {
  let want = u * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const t = Math.max(0, Math.min(1, want / lens[i]));
      return [r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t,
              r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t];
    }
    want -= lens[i];
  }
  return r.pts[0];
}

function profileAt(ys: number[], u: number): number {
  const f = Math.max(0, Math.min(1, u)) * (ys.length - 1);
  const i = Math.min(ys.length - 2, Math.floor(f));
  return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
}

/** 1 on the carriageway, easing to 0 at the far edge of the cutting. */
function roadT(d: number, half: number): number {
  return d <= half ? 1 : smooth(1 - Math.min(1, (d - half) / ROAD_BLEND));
}

// What roadNear needs about a road that does not depend on the point: its run
// lengths (recomputed on EVERY call before, a fresh array each time) and a tree
// over its segments. Road point lists are never edited in place; the length
// check still drops a cache entry if one ever grows or shrinks.
interface RoadInfo {
  n: number; lens: number[]; runs: number[]; total: number; tree: SegmentTree;
  x0: number; x1: number; z0: number; z1: number;
}
const roadInfos = new WeakMap<[number, number][], RoadInfo>();
function roadInfo(r: Road): RoadInfo {
  const cached = roadInfos.get(r.pts);
  if (cached && cached.n === r.pts.length) return cached;
  const lens: number[] = [], runs: number[] = [], segs: number[] = [];
  let total = 0, run = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  // the same accumulations, in the same order, as roadNearScan
  for (let i = 0; i < r.pts.length - 1; i++) {
    const l = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    lens.push(l); total += l;
  }
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    runs.push(run); run += lens[i];
    segs.push(ax, az, bx, bz);
  }
  for (const [px, pz] of r.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
  const info = { n: r.pts.length, lens, runs, total, tree: new SegmentTree(segs), x0, x1, z0, z1 };
  roadInfos.set(r.pts, info);
  return info;
}
/** True when no point of the road can be within `reach` of (x, z) -- its bounding box is farther. */
function roadBeyond(r: Road, x: number, z: number, reach: number): boolean {
  const c = roadInfo(r), m = reach + 1e-6;
  return c.x0 - x > m || x - c.x1 > m || c.z0 - z > m || z - c.z1 > m;
}

/** Nearest point on a road: distance, and the 0..1 parameter along the whole run. */
function roadNear(r: Road, x: number, z: number): { d: number; u: number } {
  const c = roadInfo(r), pts = r.pts, i = c.tree.nearest(x, z);
  if (i === null) return roadNearScan(r, x, z);
  if (i < 0) return { d: Infinity, u: 0 };
  const [d, t] = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  return { d, u: (c.runs[i] + t * c.lens[i]) / c.total };
}
/** The definition roadNear must keep agreeing with: every segment, first nearest wins. */
function roadNearScan(r: Road, x: number, z: number): { d: number; u: number } {
  let best = Infinity, bu = 0, run = 0;
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const l = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    lens.push(l); total += l;
  }
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const [d, t] = segDist(x, z, ax, az, bx, bz);
    if (d < best) { best = d; bu = (run + t * lens[i]) / total; }
    run += lens[i];
  }
  return { d: best, u: bu };
}

// The NPCs a layout planner may reserve room around. A resident (resident:true)
// lives in the finished city -- on a doorstep, a quay, a bench -- so keeping a
// clearing for one would move or remove the very house or seat they were put
// beside. Planners reserve only the NPCs players are sent to find. Heartwood's
// protectedSpots makes the same cut.
function layoutNpcs(def: any): any[] { return (def?.npcs ?? []).filter((n: any) => !n.resident); }

/**
 * THE ROAD CUTTINGS of a city, as one thing: every road's profile relaxed to
 * grade and pinned to the roads it leaves and joins, and `cut`, which replaces
 * the natural ground with the nearer road's profile inside its corridor.
 * Shared by every city -- `natural` is whatever the city's own ground is
 * (Caerdun's terraces, Heartwood's floor).
 *
 * Parents before branches in `roads`, so a branch can be pinned to the height
 * its parent already settled on. An end that meets no road is pinned to the
 * NATURAL ground there: the relaxation moves samples in pairs, so a free end
 * drifts as the climb behind it is spread out -- MEASURED, the observatory
 * climb arrived at the tower 8m below the hilltop it was built on, in a
 * trench. Pinned, the approach is raised instead, which is what a road up a
 * hill does.
 *
 * `cut` returns `t`, how much of the point is road (1 on the carriageway, 0
 * clear of every cutting); house pads read it so a pad never flattens the
 * lane its house fronts.
 */
function gradeRoads(roads: Road[], natural: (x: number, z: number) => number) {
  const profiles: number[][] = [];
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    let pin: number | undefined, pinEnd: number | undefined;
    const last = r.pts[r.pts.length - 1];
    for (let j = 0; j < i; j++) {
      const q = roadNear(roads[j], r.pts[0][0], r.pts[0][1]);
      if (q.d < 3 && pin === undefined) pin = profileAt(profiles[j], q.u);
      const e = roadNear(roads[j], last[0], last[1]);
      if (e.d < 3 && pinEnd === undefined) pinEnd = profileAt(profiles[j], e.u);
    }
    profiles.push(sampleRoad(r, natural, pin ?? natural(r.pts[0][0], r.pts[0][1]), pinEnd ?? natural(last[0], last[1])));
  }
  // The roads cut through the ground, and win over it where they run. Where
  // two cuttings overlap, the NEARER road's profile wins, crossfaded over 4m
  // where they are about equally near. They used to be applied in list
  // order, each overriding the last -- so a lane leaving a climb steamrolled
  // the climb's last ten metres flat with its own corridor (MEASURED: the
  // observatory climb arrived at the tower 0.8 steep and six metres low,
  // under the west lane's cutting).
  // Each road's box, grown by its cutting, so a road nowhere near the point is
  // passed over without a lookup (every terrain sample asks this of every road).
  const reach = roads.map((r) => { const c = roadInfo(r), m = r.half + ROAD_BLEND + 1e-6; return { n: c.n, x0: c.x0 - m, x1: c.x1 + m, z0: c.z0 - m, z1: c.z1 + m }; });
  const cut = (x: number, z: number, h: number): { h: number; t: number; edge: number } => {
    let s1 = Infinity, s2 = Infinity, p1 = 0, p2 = 0, tMax = 0;
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i], b = reach[i];
      if (b.n === r.pts.length ? x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 : roadBeyond(r, x, z, r.half + ROAD_BLEND)) continue;
      const { d, u } = roadNear(r, x, z);
      if (d > r.half + ROAD_BLEND) continue;
      tMax = Math.max(tMax, roadT(d, r.half));
      const sd = d - r.half, p = profileAt(profiles[i], u);
      if (sd < s1) { s2 = s1; p2 = p1; s1 = sd; p1 = p; }
      else if (sd < s2) { s2 = sd; p2 = p; }
    }
    if (tMax > 0) {
      const mix = s2 === Infinity ? 1 : smooth(Math.max(0, Math.min(1, (s2 - s1) / 4)));
      const p = p1 + (p2 - p1) * (1 - mix) * 0.5;
      h = h * (1 - tMax) + p * tMax;
    }
    return { h, t: tMax, edge: s1 };
  };
  return { profiles, cut };
}

// Moonmere's ground is its zone module's (zones/moonmere.ts), on the field path, sampled on
// the fine terrain grid (fineTerrainZones below; MOONMERE.md section 7). The old city's body
// is gone; the name stays so the heightFn dispatch line merges clean with Caerdun's branch.
function mere2Height() {
  fineTerrainZones.add("moonmere"); return fieldHeight("moonmere");
}


// ---------- day & night ----------
// One in-game day = one real hour, shared by every client via the wall clock.
const DAY_MS = 3600000;

// Dev: ?daytime=0..1 pins the cycle instead of riding the clock, so a look can
// be judged at a chosen hour rather than waiting out a real hour of wall time.
// 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight (dayFrac feeds sin() below,
// where elevation 0 is the horizon). Same spirit as ?lineup: a dev view, not a
// game feature, and it does not touch the world clock the server keeps.
const DAYTIME_PIN = (() => {
  const raw = new URLSearchParams(location.search).get("daytime");
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? ((v % 1) + 1) % 1 : null;
})();

// An open-air dungeon's sky stands at one hour (its `outdoor.time`, the hour
// its panorama was baked at), whatever the clock or ?daytime says: the land in
// the picture is lit by that sun. Set by buildZone, null everywhere else.
let zoneDayPin: number | null = null;
// A cutscene lit at its own hour (cutscenes/*.json `daytime`) holds the sky there
// while it plays, and lets go under black at the end (cutscene.ts). An
// open-air dungeon's pin still wins: its panorama only has the one sun.
let cutsceneDayPin: number | null = null;
export function pinCutsceneDaytime(v: number | null): void { cutsceneDayPin = v; }
export function dayFrac(): number {
  return zoneDayPin ?? cutsceneDayPin ?? DAYTIME_PIN ?? (Date.now() % DAY_MS) / DAY_MS;
}

let hemiLight: HemisphericLight | null = null;
let celestial: DirectionalLight | null = null;
let shadowGen: CascadedShadowGenerator | null = null;
let nightDome: Mesh | null = null;
let dayDome: Mesh | null = null;
let sunDisc: Mesh | null = null;
let moonDisc: Mesh | null = null;
let afterglowMesh: Mesh | null = null;
let nightLights: { light: PointLight; base: number }[] = [];
let fogNight = Color3.FromHexString("#2a3358");
// deep enough not to read as a white film over the now-dark canopies
let fogDay = Color3.FromHexString("#a8cdf0");
let hemiBase = 0.85;
// an overcast zone's sky is weather, not sky: no sun, no stars, no blue --
// set per zone from WILDS_THEMES, consumed by updateDayNight
let overcastSky = false;

// How far into night the sky is: 0 by day, 1 from the moment the sun is down.
// The one value every night curve reads (updateDayNight's 1 - dayAmt; the
// Capital's nightGlow computes the same), taken from dayFrac() so it holds
// before the zone's first frame too.
export function nightAmount(): number {
  return 1 - Math.min(1, Math.max(0, Math.sin(dayFrac() * Math.PI * 2) * 2.2));
}

// A ZONE'S OWN NIGHT (Heartwood's, heartwood-night.ts). The shared night is a
// flat 0.25 hemi and the moon, with moon shadows pure black and the moon at
// its weakest for the hour after sunset, which leaves a city under crowns
// black wherever the moon does not reach. A profile adds, scaled by N:
//  - `hemiAdd` to the hemi's intensity and turns its sky colour toward
//    `hemiSky`;
//  - turns the hemi's ground colour (the light that comes UP onto soffits,
//    deck undersides and bough bellies) from the zone's own toward
//    `hemiGround`;
//  - `shadow` to the moon shadows' darkness, so they keep that much moon;
//  - brings the moon to its height `moonRamp` times sooner after sunset (the
//    same value at the horizon, so it stays continuous with the setting sun),
//    peaking at `moonPeak`, in `moonTint`.
// No fog: turning fog on for a zone that has none recompiles every material.
// Registered by the zone's build, applied every frame in updateDayNight on
// top of the shared values; at N = 0 it is exactly identity.
export interface NightProfile {
  hemiAdd: number; hemiSky: string; hemiGround: string; shadow: number;
  moonRamp: number; moonPeak: number; moonTint: string;
}
type NightProfileC = Omit<NightProfile, "hemiSky" | "hemiGround" | "moonTint"> & { hemiSky: Color3; hemiGround: Color3; moonTint: Color3 };
const nightProfiles: Record<string, NightProfileC> = {};
export function registerNightProfile(zoneKey: string, p: NightProfile): void {
  nightProfiles[zoneKey] = { ...p, hemiSky: Color3.FromHexString(p.hemiSky), hemiGround: Color3.FromHexString(p.hemiGround), moonTint: Color3.FromHexString(p.moonTint) };
}
// The zone's own day values the profile leans away from (the ones buildZone
// set after the zone's module spoke), taken once the build is done.
let nightBase: { ground: Color3; shadow: number } | null = null;
function applyNightProfile(el: number, n: number): void {
  const p = nightProfiles[currentZone];
  if (!p || !nightBase || !hemiLight || !celestial) return;
  hemiLight.intensity += p.hemiAdd * n;
  Color3.LerpToRef(hemiLight.diffuse, p.hemiSky, n, hemiLight.diffuse);
  Color3.LerpToRef(nightBase.ground, p.hemiGround, n, hemiLight.groundColor);
  if (shadowGen) { const d = nightBase.shadow + p.shadow * n; if (shadowGen.darkness !== d) shadowGen.darkness = d; }
  if (el < 0) {
    celestial.intensity = 0.16 + Math.min(1, -el * 1.4 * p.moonRamp) * (p.moonPeak - 0.16);
    celestial.diffuse.copyFrom(p.moonTint);
  }
}

// A material that follows the night: its emissive colour, and its glow-pass
// strength (`metadata.glow`, see setupGlow) when given, lerp from the day
// value to the night one by N. Written only when N has moved by more than
// 0.002 (and at exactly 0 and 1), like the exposure step below: at one real
// hour a day N moves by about 1e-5 a frame. The day values are the
// material's own, so by day nothing changes.
type NightRamp = { m: StandardMaterial; eDay: Color3; eNight: Color3; gDay?: number; gNight?: number; n: number };
let nightRamps: NightRamp[] = [];
export function registerNightRamp(m: StandardMaterial, o: { emissiveDay?: Color3; emissiveNight: Color3; glowDay?: number; glowNight?: number }): void {
  const gDay = o.glowNight === undefined ? undefined : o.glowDay ?? (m.metadata as { glow?: number } | null)?.glow ?? 0;
  nightRamps.push({ m, eDay: (o.emissiveDay ?? m.emissiveColor).clone(), eNight: o.emissiveNight.clone(), gDay, gNight: o.glowNight, n: NaN });
}
function applyNightRamp(r: NightRamp, n: number): void {
  if (!(Math.abs(n - r.n) > 0.002) && !((n === 0 || n === 1) && n !== r.n)) return;
  r.n = n;
  Color3.LerpToRef(r.eDay, r.eNight, n, r.m.emissiveColor);
  if (r.gNight === undefined) return;
  const glowNow = r.gDay! + (r.gNight - r.gDay!) * n;
  if (r.m.metadata) (r.m.metadata as { glow?: number }).glow = glowNow; else r.m.metadata = { glow: glowNow };
}

// A light that burns stronger at night but is NOT put out by day (unlike
// registerNightLight, which scales by N and so zeroes it): base x (1 + k N).
let nightBoosts: { light: PointLight; base: number; k: number }[] = [];
export function registerNightBoost(light: PointLight, base: number, k: number): void {
  nightBoosts.push({ light, base, k });
}

// golden, not merely pale-warm: this is the colour the whole dusk reads by
const SUN_WARM = Color3.FromHexString("#ffbe74");
const SUN_NOON = Color3.FromHexString("#fff3e0");
const MOON_COOL = Color3.FromHexString("#a9b8e6");
// warm rose, but not luminous: distant geometry saturates to the fog colour
// almost exactly, so anything bright here becomes a glowing horizon
const DUSK_FOG = Color3.FromHexString("#c17a63");

function updateDayNight(dtMs: number): void {
  if (!celestial || !hemiLight) return;
  const a = dayFrac() * Math.PI * 2; // 0 = sunrise
  const el = Math.sin(a);            // celestial elevation: + day, - night
  const dayAmt = Math.min(1, Math.max(0, el * 2.2));
  const duskAmt = Math.min(1, Math.max(0, 1 - Math.abs(el) * 2.1));
  const az = Math.cos(a);
  if (el >= 0) { // the sun holds the sky
    celestial.direction.set(-az * 0.85, -Math.max(el, 0.06), 0.3).normalize();
    celestial.intensity = 0.14 + Math.min(1, el * 1.4) * 1.95;
    Color3.LerpToRef(SUN_WARM, SUN_NOON, Math.min(1, el * 1.05), celestial.diffuse);
  } else {       // the moon keeps the watch
    celestial.direction.set(az * 0.85, -Math.max(-el, 0.06), -0.3).normalize();
    celestial.intensity = 0.16 + Math.min(1, -el * 1.4) * 0.54;
    celestial.diffuse.copyFrom(MOON_COOL);
  }
  // The neighborhood's clearing opens southward: let daylight enter its door faces.
  if (currentZone === "heartwood" && el >= 0) {
    celestial.direction.z = -.65; celestial.direction.normalize();
  }
  hemiLight.intensity = hemiBase * (0.42 + dayAmt * 0.55);
  Color3.LerpToRef(Color3.FromHexString("#a9bce0"), Color3.FromHexString("#eaf2fb"), dayAmt, hemiLight.diffuse);
  // fog breathes with the light
  const fog = Color3.Lerp(fogNight, fogDay, dayAmt);
  // The warm tint is scattered SUNLIGHT, so it must not outlive the sun.
  // duskAmt is symmetric about the horizon, so without this the fog stayed at
  // full sunset colour while dayAmt had already clamped to 0 and the world had
  // gone night-dark. The mountain ring is deliberately read through fog (see
  // makeMountainRing) and sits far enough out to be near-pure fog colour, so
  // it lit up salmon-pink against a midnight sky.
  // Steep on purpose: dayAmt clamps to 0 the instant the sun is down, so the
  // world snaps to night lighting at el=0 and any lingering warm fog disagrees
  // with it. The golden window lives entirely BEFORE sunset (el >= 0, roughly
  // two in-game hours), and the tail after it is minutes, not hours.
  const afterglow = el >= 0 ? 1 : Math.max(0, 1 + el * 40);
  // under full overcast the sunset barely reaches the fog: a grey vault dims
  // warm, it does not go salmon
  Color3.LerpToRef(fog, DUSK_FOG, duskAmt * afterglow * (overcastSky ? 0.22 : 0.72), fog);
  scene.fogColor.copyFrom(fog);
  scene.clearColor = Color4.FromColor3(Color3.Lerp(Color3.FromHexString("#2b3560"), Color3.FromHexString("#9fd0f5"), dayAmt), 1);
  // sky: stars yield to blue, sun and moon cross the dome
  if (nightDome) nightDome.visibility = Math.max(0, 1 - dayAmt * 1.4);
  if (dayDome) dayDome.visibility = dayAmt;
  const sd = celestial.direction;
  if (sunDisc) {
    sunDisc.position.set(az * 0.85 * 1050, Math.max(el, -0.2) * 1050, -0.3 * 1050);
    sunDisc.visibility = el > -0.08 ? 1 : 0;
  }
  if (moonDisc) {
    moonDisc.position.set(-az * 0.85 * 1050, Math.max(-el, -0.2) * 1050, 0.3 * 1050);
    moonDisc.visibility = el < 0.08 ? 1 : 0;
  }
  void sd;
  if (afterglowMesh) afterglowMesh.visibility = duskAmt;
  // Completely fogged-out sky for a zone where it snows all day (Philip):
  // stars, sun, moon and afterglow all yield, and the day dome
  // becomes a uniform vault of the CURRENT fog colour. Through the dome's
  // material, not scene.clearColor -- the clear colour skips tone mapping,
  // so it would seam against fogged geometry at the horizon; the emissive
  // dome runs the same image pipeline and blends into the fog exactly.
  if (overcastSky) {
    if (nightDome) nightDome.visibility = 0;
    if (sunDisc) sunDisc.visibility = 0;
    if (moonDisc) moonDisc.visibility = 0;
    if (afterglowMesh) afterglowMesh.visibility = 0;
    if (dayDome) {
      dayDome.visibility = 1;
      const dm = dayDome.material as StandardMaterial;
      if (dm.emissiveTexture) dm.emissiveTexture = null;
      dm.emissiveColor.copyFrom(fog);
    }
  }
  nightLights.forEach((nl) => { nl.light.intensity = nl.base * (1 - dayAmt); });
  // The zone's own night, on top of everything above and scaled by the night
  // amount, so by day (N = 0) every value is exactly the shared one.
  const night = 1 - dayAmt;
  applyNightProfile(el, night);
  for (const b of nightBoosts) b.light.intensity = b.base * (1 + b.k * night);
  for (const r of nightRamps) applyNightRamp(r, night);
  for (const cw of clearWaterMats) {
    // a little emissive survives the night so the water does not go to a flat
    // black hole, but the daytime glow and the sky reflection both go with the
    // sun that produced them
    cw.base.scaleToRef((0.03 + dayAmt * 0.17) * cw.refl, cw.m.emissiveColor);
    if (cw.m.reflectionTexture) cw.m.reflectionTexture.level = (0.04 + dayAmt * 0.18) * cw.refl;
  }
  // Every material in the scene subscribes to this configuration, and assigning
  // either value notifies all of them — each listener then rescans every mesh in
  // the scene marking submeshes dirty. That is O(materials x meshes), and at one
  // real hour per day these two move by about 1e-5 per frame, so the sky paid
  // for a full sweep every frame to change nothing anyone could see. Step them
  // instead: ~85 steps across the whole dawn ramp is still smooth.
  const ipc = scene.imageProcessingConfiguration;
  const exposure = 1.32 + dayAmt * 0.2;
  const contrast = 1.05 + dayAmt * 0.08; // saturated stylized daylight
  if (Math.abs(ipc.exposure - exposure) >= 0.004) ipc.exposure = exposure;
  if (Math.abs(ipc.contrast - contrast) >= 0.004) ipc.contrast = contrast;
}

// There is ONE water material: makeClearWaterMat. The bump-sheet, scrolling-
// normal makeWaterMat it replaced is deleted on purpose (Philip), so that no
// new water can be built on it by reflex -- see WATER.md. Its `sheen` control
// survives as makeClearWaterMat's `refl`, which is what the fen's black pools
// need: dark water must not be handed the sky by the Fresnel term.
// The shore wash: foam that runs UP a beach and retreats. It has its own
// registry because it is a SWEEP, not a scroll -- a scroll is a current and only
// ever goes one way, and "waves moving back and forth towards the banks"
// (Philip, v_moonmereshores) is the one thing a scroll cannot show. See
// makeShoreWash for how the sweep is built.
const washMats: { tex: Texture; t: number; rate: number }[] = [];
// Clear water has to be told about the day, and the reason is specific: its
// look is carried by an emissive tint and a reflection of a FIXED daylight
// HDRI, neither of which the lighting rig can dim. Left alone the Mere was a
// luminous cyan sheet at midnight in an otherwise dark zone, reflecting a sun
// that had set. Both terms are driven off dayAmt below.
const clearWaterMats: { m: StandardMaterial; base: Color3; refl: number }[] = [];
// how far, in strip-V, the foam band travels each way. The band occupies the
// middle third of its strip, so this walks it from the waterline to the top of
// the beach without ever reaching the (transparent, CLAMPed) ends.
//
// 0.27 rather than 0.3, and the 0.03 is not fussiness. The texture being
// transparent at v=0 and v=1 only protects the sweep's ENDS; at full throw the
// mesh's own edge samples v = 1 - THROW, and the foam gradient still has a tail
// there. MEASURED at 0.3: alpha 0.145 landward, 0.096 waterward -- cut off flat
// at the strip boundary, which is the outline Philip photographed. The real
// guard is the vertex fade on the wash's stops (see the shoreBand call); this
// just buys it margin.
const WASH_THROW = 0.27;


// CLEAR water: the Costa del Sol read (Philip's reference) rather than the
// churned-surface one. THE ONLY WATER MATERIAL IN THE GAME -- see WATER.md.
// Three deliberate differences from the makeWaterMat it replaced:
//
//   no bump sheet -- "remove the current water texture". The ripple normal map
//     is what made the Mere read as an agitated surface, and it also scattered
//     any reflection into noise. Smooth water is what lets the reflection hold
//     together, and it is why specularPower goes up: a smooth surface returns a
//     tight sun glint, not a broad sheen over half the lake.
//
//   a FRESNEL reflection. Looking straight down you see through water; at a
//     grazing angle you see the sky standing on it. That angle dependence is
//     the whole reason the reference reads as water rather than as tinted
//     glass, and it is what turns the far half of the lake to sky without a
//     second material or a horizon fudge.
//
//   a light turquoise diffuse instead of the old near-navy. The colour only
//     shows where the depth ramp lets it, so it is the DEEP water's colour, and
//     #1e3448 made deep water read as ink.
//
// Nothing crawls: there is no texture left to scroll, and losing that motion is
// deliberate. Philip: "I'm ok if it doesn't move for now."
// `alpha` is 1 for the depth-ramped sheets, whose whole opacity curve lives in
// their vertex alpha. A plain disc or ground plane has no vertex alpha, and at
// alpha 1 StandardMaterial reports needAlphaBlending() false and renders the
// pond OPAQUE -- so those pass a real alpha instead.
// `refl` scales BOTH the sky reflection and the emissive lift. It exists
// because those two are what make clear water read as clear, and open water is
// not the only thing this material has to serve: at refl 1 a stagnant canal
// came out mint green, because at a grazing angle the Fresnel hands even a
// near-black body the sky. Water that should look dead needs less of both.
function makeClearWaterMat(name: string, hex: string, alpha = 1, refl = 1): StandardMaterial {
  const found = scene.getMaterialByName(name);
  if (found) return found as StandardMaterial;
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(0.20);   // updateDayNight drives this; see clearWaterMats
  m.specularColor = new Color3(0.62, 0.66, 0.64);
  m.specularPower = 256;
  m.alpha = alpha;
  m.maxSimultaneousLights = 8;
  if (scene.environmentTexture) {
    m.reflectionTexture = scene.environmentTexture;
    // Babylon mixes leftColor at fresnelTerm 0 and rightColor at 1, and the
    // term is pow(bias + |dot(view, normal)|, power) -- so on a horizontal
    // sheet LEFT is the grazing angle and RIGHT is straight down. White then
    // black, in that order, is "sky at the horizon, clear at your feet".
    // level and leftColor both came down hard from the obvious values. At
    // level 1 with a white leftColor this was physically the right answer and
    // visually a white sheet: at a 6m eye height almost the whole lake IS a
    // grazing angle, so "full reflection at grazing" meant full reflection
    // everywhere, and the sky HDRI is bright enough to erase the water colour
    // underneath it. A dim reflection of a pale grey-blue is what leaves the
    // turquoise visible while still turning the far water to sky.
    m.reflectionTexture.level = 0.22;
    const rf = new FresnelParameters();
    rf.bias = 0.03;
    rf.power = 3.0;
    rf.leftColor = new Color3(0.55, 0.62, 0.68);   // grazing
    rf.rightColor = Color3.Black();                // straight down
    m.reflectionFresnelParameters = rf;
  }
  clearWaterMats.push({ m, base: c, refl });
  return m;
}

// One continuous water surface following a centerline — no overlapping segment seams.
// `halfW` may be a function of t (0 at the first point, 1 at the last), which
// is how a river is given a tapered END. It matters more than it sounds: the
// strip is capped with a straight edge at full width, so a 15m-wide river
// terminates in a 15m blue wedge. Rock can cover a channel; it cannot
// discreetly cover a 15m cap. Narrowed to a point first, one boulder hides it.
export function makeWaterRibbon(
  name: string,
  ptsIn: { x: number; z: number; y: number }[],
  halfW: number | ((t: number) => number),
  material: StandardMaterial
): Mesh {
  let pts = ptsIn;
  // round the corners (Chaikin) so sharp bends cannot fold the strip into gaps
  for (let round = 0; round < 2; round++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  // smooth the surface height so the ribbon does not staircase with the bed
  const ys = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)].y, b = p.y, c = pts[Math.min(pts.length - 1, i + 1)].y;
    return (a + b * 2 + c) / 4;
  });
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], normals: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const px = -dz, pz = dx; // perpendicular
    const hw = typeof halfW === "function" ? halfW(i / (pts.length - 1)) : halfW;
    positions.push(pts[i].x + px * hw, ys[i], pts[i].z + pz * hw);
    positions.push(pts[i].x - px * hw, ys[i], pts[i].z - pz * hw);
    uvs.push(0, i * 0.6, 1.6, i * 0.6);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs; vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

// ── paths ────────────────────────────────────────────────────────────────────
//
// THE path builder for the whole game. Read PATH.md before changing it.
//
// A path is ONE RIBBON MESH, never a run of tiles. That is the entire lesson of
// how this got written: six rounds of laying discrete 2m paving stones, and
// every one of them failed the same way. Rigid pieces on ground that is uneven,
// curving AND branching give you exactly one knob -- how far they overlap --
// and no setting of it is right everywhere. Tight enough that stones do not lie
// across each other opens gaps on the outside of every bend; loose enough to
// close those piles them up on the inside and at every junction. A ribbon has
// no pieces, so it has no such knob:
//
//   * nothing overlaps, there being nothing to overlap
//   * nothing gaps, the strip being continuous by construction
//   * nothing floats or buries -- every vertex sits on the terrain surface,
//     rather than a rigid plane averaged over it
//   * bends are smooth (Chaikin rounding, the same trick makeWaterRibbon uses
//     and for the same stated reason: sharp bends fold a strip into gaps)
//   * junctions MERGE, because two ribbons share one world-space UV grid and
//     both fade out at their banks
export interface PathSpec {
  /** The centreline, in world metres. Corners are rounded, so waypoints are hints. */
  pts: [number, number][];
  /** Kerb to kerb / 2. Default 3.0 -- about a cart and a half. */
  half?: number;
  /** Sheet under /tex: `<tex>_diff.jpg` and `<tex>_nor.jpg`. Default cobblestone_floor_08. */
  tex?: string;
  /** Multiplied onto the sheet. Vertex colour can only DARKEN -- see TERRAIN_TEX. */
  tint?: string;
  /** Metres of ground per texture tile. Default 2.3. */
  uv?: number;
  /** Metres the bank wanders either way, and over what wavelength. */
  fray?: number;
  frayScale?: number;
  /** Fraction of the half-width the alpha fades over at each bank. */
  soft?: number;
  /** Fade exposed start/end edges over these metres; zero keeps a connected end solid. */
  endFade?: [number,number];
  /** Keep this central half-width solid at the last end, where paving sits under stairs. */
  endSolidHalf?: number;
  /** Clear of the terrain. Beats z-fighting, too little to trip on. */
  lift?: number;
  /** Metres between the strip's rings (default 0.9): a ribbon shorter than two
   * rings draws nothing, so a short one -- a paving rectangle a metre long --
   * passes its own */
  step?: number;
  /** Metres between the strip's columns across it (default 0.85; Moonmere 0.55).
   * Only for ground that is truly flat under the whole strip (the Capital's
   * levelled floor, its lawns 100 m across): every vertex still sits on the
   * terrain, there are just fewer of them */
  colStep?: number;
  /** false: no road on the map (and so none to the meadow, which keeps off
   * mapped roads: the caller excludes it itself) -- a lawn laid as a ribbon */
  map?: boolean;
  name?: string;
}

const PATH_HALF = 3.0, PATH_FRAY = 1.15, PATH_FRAY_SCALE = 11;
const PATH_UV = 2.3, PATH_SOFT = 0.34, PATH_LIFT = 0.05;
const PATH_STEP = 0.9;      // metres between rings of the strip

/**
 * Where a path's paving gives out, on one side of it. `sgn` picks the bank --
 * each gets its own noise offset, so the two are never parallel.
 *
 * ONE definition, because makePath shapes the ribbon to it from both banks (it
 * once also fed town.ts's verge planter, dressPath, retired 2026-10-10). Two
 * copies of this drifted apart the first time the formula changed and grass
 * started growing where the stones were.
 */
function pathEdge(x: number, z: number, half: number, sgn: number,
                         fray = PATH_FRAY, scale = PATH_FRAY_SCALE): number {
  const o = sgn >= 0 ? 0 : 37;
  return half + (fbm((x + o) / scale, (z + o) / scale) - 0.5) * 2 * fray;
}

const pathMats = new Map<string, StandardMaterial>();
function pathMaterial(tex: string, tint?: string): StandardMaterial {
  const key = `${tex}|${tint || ""}`;
  const found = pathMats.get(key);
  if (found && found.getScene() === scene) return found;
  const m = new StandardMaterial(`path_${key}`, scene);
  m.maxSimultaneousLights = 8;
  m.diffuseColor = Color3.FromHexString(tint || "#ffffff");
  // a sheet named by its own path ("/models/capital/pave_flags") is a city's
  // own, kept with its other assets; a bare name is a /tex ground sheet
  const at = tex.startsWith("/") ? tex : `/tex/${tex}`;
  // ...and one named WITH its extension ("/models/seagate/pave_setts.jpg") is
  // a single painted sheet with no normal map: Caerdun's generated pave sheets
  // (tools/assets/paint_caerdun_textures.py) carry their joints in the colour
  const single = /\.(jpg|png)$/.test(tex);
  const d = new Texture(single ? at : `${at}_diff.jpg`, scene);
  d.wrapU = Texture.WRAP_ADDRESSMODE; d.wrapV = Texture.WRAP_ADDRESSMODE;
  m.diffuseTexture = d;
  if (!single) {
    const n = new Texture(`${at}_nor.jpg`, scene);
    n.wrapU = Texture.WRAP_ADDRESSMODE; n.wrapV = Texture.WRAP_ADDRESSMODE;
    n.level = .7;
    m.bumpTexture = n;
  }
  m.specularColor = new Color3(0.03, 0.03, 0.03);
  m.transparencyMode = 2;               // the strip fades out at its banks
  // NO CULLING. A ground strip has no underside anyone can see, and the winding
  // that reads as correct when reasoned about in a right-handed system is
  // backwards in Babylon's left-handed one. MEASURED the hard way: the meshes
  // were built, enabled, in frustum, with correct bounds and vertex alpha --
  // and drew nothing at all.
  m.backFaceCulling = false;
  pathMats.set(key, m);
  return m;
}

/** The same rounded centreline is used by paving and its connecting approaches. */
export function pathSpine(waypoints: [number,number][], pathStep=.9): {spine:{x:number;z:number}[];total:number;rings:number} {
  if(waypoints.length<2)return {spine:[],total:0,rings:0};
  // Chaikin twice: a polyline's corners are where a strip folds, and rounding
  // them is cheaper and far more robust than mitering the fold.
  let pts = waypoints.map(([x, z]) => ({ x, z }));
  for (let round = 0; round < 2; round++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }

  // resample by arc length, so the rings are evenly spaced however the caller's
  // waypoints happened to be distributed
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const total = lens[lens.length - 1];
  if (total < pathStep * 2) return {spine: [],total,rings:0};
  const rings = Math.max(2, Math.round(total / pathStep));
  const spine: { x: number; z: number }[] = [];
  for (let r = 0; r <= rings; r++) {
    const u = (r / rings) * total;
    let i = 1;
    while (i < pts.length - 1 && lens[i] < u) i++;
    const t = (u - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    spine.push({
      x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
      z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t,
    });
  }

  return {spine,total,rings};
}

// THE PAVING, AS A FLOOR. Paths, junctions and the lifted sand and glass
// sheets lay their surface a few centimetres above the ground (a path 0.05,
// Moonmere's lanes 0.09, the Burned Land's glass 0.10, a pond or beach bed
// 0.15), and nothing in groundHeight knows they are there: a walker's feet
// sink that far into them, unseen in motion. A standing NPC is looked at from
// a metre away, so placeNpcAvatar asks this instead. MEASURED 2026-10-01:
// seated on the drawn terrain alone, NPCs on Shore Road, Moonmere's lanes, a
// Granary Plains junction, the Burned Land's glass and a Summer Lakes pond
// bed read 0.09-0.15 m sunk.
//
// The answer is read off the DRAWN mesh -- a vertical ray, and the vertex
// alpha interpolated at the hit -- not modelled from the builders' formulas.
// A formula version was tried first and was wrong by 5-7 cm wherever a coarse
// mesh (a junction has five rings, the glass sheet 6 m cells) interpolates
// across a curve the formula follows exactly.
const pavings: Mesh[] = [];
// A vertical ray against a sheet is a point-in-triangle test in plan, so each
// sheet's triangles are bucketed on a PAVE_BUCKET grid in world x/z the first
// time it is asked about. MEASURED 2026-10-02: Babylon's mesh.intersects walks
// every triangle of the sheet -- 0.35 ms a lookup on the Heartwood Fields
// roads and brook bed, which a walker crossing new ground pays several times a
// frame. The answer is the same one the ray gave: the highest triangle over
// (x, z), and its vertex alpha at the hit -- weighted by the true barycentric
// coordinates. The ray version read Babylon's bu/bv as the weights of vertices
// 1 and 2; they belong to vertices 0 and 1 (Ray.intersectsTriangle), so its
// alpha at a fading edge was the wrong blend of the three corners.
const PAVE_BUCKET = 2;
interface PaveTris { x0: number; z0: number; nx: number; nz: number; buckets: (number[] | undefined)[]; p: Float32Array; a: Float32Array | null; idx: ArrayLike<number> }
const paveTris = new WeakMap<Mesh, PaveTris>();
function paveTrisOf(m: Mesh): PaveTris | null {
  let t = paveTris.get(m);
  if (t) return t;
  const local = m.getVerticesData(VertexBuffer.PositionKind), idx = m.getIndices();
  if (!local || !idx) return null;
  const col = m.hasVertexAlpha ? m.getVerticesData(VertexBuffer.ColorKind) : null;
  const wm = m.computeWorldMatrix(true), p = new Float32Array(local.length), v = new Vector3();
  for (let i = 0; i < local.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(local[i], local[i + 1], local[i + 2], wm, v);
    p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z;
  }
  let a: Float32Array | null = null;
  if (col) { a = new Float32Array(local.length / 3); for (let i = 0; i < a.length; i++) a[i] = col[i * 4 + 3]; }
  const bb = m.getBoundingInfo().boundingBox, lo = bb.minimumWorld, hi = bb.maximumWorld;
  const x0 = lo.x, z0 = lo.z, nx = Math.max(1, Math.ceil((hi.x - lo.x) / PAVE_BUCKET)), nz = Math.max(1, Math.ceil((hi.z - lo.z) / PAVE_BUCKET));
  const buckets: (number[] | undefined)[] = new Array(nx * nz);
  const cl = (q: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(q)));
  for (let f = 0; f < idx.length; f += 3) {
    const i0 = idx[f] * 3, i1 = idx[f + 1] * 3, i2 = idx[f + 2] * 3;
    const bx0 = cl((Math.min(p[i0], p[i1], p[i2]) - x0) / PAVE_BUCKET, nx), bx1 = cl((Math.max(p[i0], p[i1], p[i2]) - x0) / PAVE_BUCKET, nx);
    const bz0 = cl((Math.min(p[i0 + 2], p[i1 + 2], p[i2 + 2]) - z0) / PAVE_BUCKET, nz), bz1 = cl((Math.max(p[i0 + 2], p[i1 + 2], p[i2 + 2]) - z0) / PAVE_BUCKET, nz);
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) (buckets[bz * nx + bx] ??= []).push(f);
  }
  t = { x0, z0, nx, nz, buckets, p, a, idx };
  paveTris.set(m, t);
  return t;
}
function pavingHit(m: Mesh, x: number, z: number): { y: number; alpha: number } | null {
  if (m.isDisposed() || !m.isEnabled() || !m.isVisible) return null;
  const bb = m.getBoundingInfo().boundingBox, lo = bb.minimumWorld, hi = bb.maximumWorld;
  if (x < lo.x || x > hi.x || z < lo.z || z > hi.z) return null;
  const t = paveTrisOf(m);
  if (!t) return null;
  const bx = Math.max(0, Math.min(t.nx - 1, Math.floor((x - t.x0) / PAVE_BUCKET)));
  const bz = Math.max(0, Math.min(t.nz - 1, Math.floor((z - t.z0) / PAVE_BUCKET)));
  const list = t.buckets[bz * t.nx + bx];
  if (!list) return null;
  const { p, a, idx } = t;
  let best: { y: number; alpha: number } | null = null;
  for (const f of list) {
    const i0 = idx[f], i1 = idx[f + 1], i2 = idx[f + 2];
    const ax = p[i0 * 3], az = p[i0 * 3 + 2], ux = p[i1 * 3] - ax, uz = p[i1 * 3 + 2] - az, vx = p[i2 * 3] - ax, vz = p[i2 * 3 + 2] - az;
    const det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-12) continue;           // seen edge-on from above
    const wx = x - ax, wz = z - az;
    const bu = (wx * vz - wz * vx) / det, bv = (ux * wz - uz * wx) / det, b0 = 1 - bu - bv, e = -1e-6;
    if (bu < e || bv < e || b0 < e) continue;
    const y = p[i0 * 3 + 1] * b0 + p[i1 * 3 + 1] * bu + p[i2 * 3 + 1] * bv;
    const alpha = a ? a[i0] * b0 + a[i1] * bu + a[i2] * bv : 1;
    // a ribbon overlapping itself (a bend, a fork) draws both layers at one
    // height; together they are at least as opaque as the more opaque one
    if (best && Math.abs(y - best.y) < 1e-3) best.alpha = Math.max(best.alpha, alpha);
    else if (!best || y > best.y) best = { y, alpha };
  }
  return best;
}
/** The lifted surface drawn at (x, z), or null where none shows. Across a
 * fading edge the surface is half there, so the seat eases from the drawn
 * terrain up to it as its alpha rises from 0.3 to 0.7: a few centimetres
 * either way at a blended edge, never a body hanging over grass or sunk into
 * opaque stone or sand. */
export function pavingHeight(x: number, z: number): number | null {
  let y: number | null = null;
  if (!pavings.length) return null;
  const ground = terrainMeshHeight(x, z);
  for (const m of pavingsNear(x, z)) {
    const h = pavingHit(m, x, z);
    if (!h || h.alpha <= 0.3 || h.y <= ground) continue;
    y = Math.max(y ?? -Infinity, ground + (h.y - ground) * Math.min(1, (h.alpha - 0.3) / 0.4));
  }
  return y;
}
/** Read-only dev inspection: which lifted surfaces are drawn at (x, z). */
export function inspectPavings(x: number, z: number): { name: string; y: number; alpha: number }[] {
  return pavings.flatMap((m) => { const h = pavingHit(m, x, z); return h ? [{ name: m.name, ...h }] : []; });
}

// Which sheets can be under (x, z): their bounding boxes bucketed on a coarse
// grid, rebuilt whenever the set of sheets changes. A city has a hundred-odd
// path and junction meshes, and testing every one's box was most of a lookup.
const PAVE_INDEX_CELL = 16;
let paveIndex: { scene: Scene | null; zone: string; count: number; cells: Map<number, Mesh[]> } | null = null;
function pavingsNear(x: number, z: number): readonly Mesh[] {
  if (!paveIndex || paveIndex.scene !== scene || paveIndex.zone !== currentZone || paveIndex.count !== pavings.length) {
    const cells = new Map<number, Mesh[]>();
    for (const m of pavings) {
      if (m.isDisposed()) continue;
      const bb = m.getBoundingInfo().boundingBox, lo = bb.minimumWorld, hi = bb.maximumWorld;
      for (let i = Math.floor(lo.x / PAVE_INDEX_CELL); i <= Math.floor(hi.x / PAVE_INDEX_CELL); i++)
        for (let j = Math.floor(lo.z / PAVE_INDEX_CELL); j <= Math.floor(hi.z / PAVE_INDEX_CELL); j++) {
          const key = (i + 32768) * 65536 + (j + 32768);
          let list = cells.get(key);
          if (!list) cells.set(key, list = []);
          list.push(m);
        }
    }
    paveIndex = { scene, zone: currentZone, count: pavings.length, cells };
  }
  return paveIndex.cells.get((Math.floor(x / PAVE_INDEX_CELL) + 32768) * 65536 + (Math.floor(z / PAVE_INDEX_CELL) + 32768)) ?? [];
}
// THE STAND HEIGHT: where the feet go, for the player, remote players, NPCs
// and monsters alike. groundHeight(x, z, prevY) is the LEVEL -- which floor a
// walker is on, what collision, the camera and the same-floor checks reason
// with -- and it stays exactly that. But off the built levels its answer is
// the height FIELD, and the field is not what is drawn: the terrain mesh cuts
// up to 0.28 m under it on a convex brow (players floated there), and paths,
// junctions and sand/glass sheets are drawn 0.05-0.15 m above it (players
// sank into them). So, given the level a walker is on:
//   - a built flat, the ferry, or a level BELOW the field (a floor under the
//     terrain) is drawn where it is: the level itself;
//   - on the field: the drawn ground -- a path, junction or lifted sheet
//     where one shows (pavingHeight, eased across its fading edge), else the
//     terrain mesh;
//   - on a deck or ramp above the field: the level, or the drawn ground where
//     that pokes through it -- max() keeps a stair's foot continuous where
//     its first treads are still under a path.
// Pass the level groundHeight just returned for this same (x, z).
//
// The mesh wins even where it parts from the field by metres -- a terrace
// edge or a road cutting sharper than its ~4.7 m cells. MEASURED 2026-10-02
// on 1200 reachable cells where the two part by more than 0.8 m (Caerdun,
// Moonmere, Moonmere Shores, the King's Gardens): the first surface drawn
// there was the terrain mesh at its own height in 92%, a tower floor or quay
// overhead in most of the rest, the field height in 3%. Fading back to the
// field there sank the King's Gardens' cutting_thief 0.22 m into the bank.
// And max() on a level is safe: over every deck and ramp in six zones the
// drawn ground rises above the level by more than 0.15 m at 0.01% of samples,
// never by 0.3 m.
export function standHeight(x: number, z: number, level: number): number {
  if (isFerryZone(currentZone)) return level;
  const memo = lastBase.x === x && lastBase.z === z && lastBase.fn === heightFn && lastBase.flats === flatZones.length;
  if (memo ? lastBase.flat : flatZones.some(f=>x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1)) return level;
  const field = memo ? lastBase.base : heightFn(x, z);
  if (level < field - 0.01) return level;
  const drawn = pavingHeight(x, z) ?? terrainMeshHeight(x, z);
  return level > field + 0.01 ? Math.max(level, drawn) : drawn;
}

export function makePath(sp: PathSpec): Mesh | null {
  const half = sp.half ?? PATH_HALF;
  const pathStep = sp.step ?? PATH_STEP;
  const fray = sp.fray ?? PATH_FRAY, frayScale = sp.frayScale ?? PATH_FRAY_SCALE;
  const soft = sp.soft ?? PATH_SOFT, uv = sp.uv ?? PATH_UV, lift = sp.lift ?? PATH_LIFT;
  if (sp.pts.length < 2) return null;
  const mapped = sp.map !== false ? mapRoad(sp.pts, half) : null;

  const {spine,total,rings}=pathSpine(sp.pts,pathStep);
  if(!rings)return null;
  // the map draws the ribbon as built (Chaikin cuts every corner: the control
  // polyline ran ~11 m off the Glassworks' Anvils loop); the keep-offs keep `pts`
  if (mapped) mapped.spine = simplifyLine(spine, 0.4);

  const cols = Math.max(4, Math.ceil((half * 2) / (sp.colStep ?? .85)));
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const a = spine[Math.max(0, r - 1)], b = spine[Math.min(rings, r + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m; dz /= m;
    const nx = -dz, nz = dx;
    const c = spine[r];
    const eL = pathEdge(c.x, c.z, half, 1, fray, frayScale);
    const eR = pathEdge(c.x, c.z, half, -1, fray, frayScale);
    for (let j = 0; j <= cols; j++) {
      const f = j / cols;                       // 0 at the right bank, 1 at the left
      const off = -eR + (eL + eR) * f;
      const x = c.x + nx * off, z = c.z + nz * off;
      // THE SURFACE, not heightFn: the mesh rides above the field wherever the
      // field curves faster than the terrain grid can follow, and a path seated
      // on the field alone sinks into the ground you can see.
      positions.push(x, Math.max(heightFn(x, z), terrainMeshHeight(x, z)) + lift, z);
      // world-space UVs, so the stones line up across a junction and a bend
      // cannot stretch them
      uvs.push(x / uv, z / uv);
      // opaque through the middle, dissolving over the last `soft` of each
      // side: this is what makes a bank fade into grass instead of ending on a
      // line, and what lets two ribbons merge where they cross
      const e = Math.min(f, 1 - f) * 2;         // 0 at either bank, 1 at the centre
      // soft 0: a hard edge, opaque to the bank (a ruled city's paving laid
      // edge to edge, zones/capital_paving.ts) -- not 0/0 at the bank itself
      const al = soft > 0 ? Math.min(1, e / soft) : 1;
      let endAlpha=1;
      if(sp.endFade){
        const along=r/rings*total;
        for(const [distance,fade,isLast] of [[along,sp.endFade[0],false],[total-along,sp.endFade[1],true]] as const){
          if(fade<=0)continue;
          const protect=isLast&&sp.endSolidHalf!==undefined
            ? 1-smooth(Math.max(0,Math.min(1,(Math.abs(off)-sp.endSolidHalf)/.35))) : 0;
          const ragged=fade*(.75+.5*fbm(x*.8+17,z*.8));
          const edge=smooth(Math.max(0,Math.min(1,distance/ragged)));
          endAlpha*=Math.max(protect,edge);
        }
      }
      colors.push(1, 1, 1, al * al * (3 - 2 * al)*endAlpha);
      if (r > 0 && j > 0) {
        const q = r * (cols + 1) + j, pv = (r - 1) * (cols + 1) + j;
        indices.push(pv - 1, pv, q - 1, q - 1, pv, q);
      }
    }
  }
  const mesh = new Mesh(sp.name || `path_${Math.round(total)}_${Math.round(spine[0].x)}`, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs; vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // point them UP whatever the winding decided: this is ground, and a downward
  // normal lights it as though the sun were under the island.
  for (let i = 1; i < normals.length; i += 3) {
    if (normals[i] < 0) { normals[i - 1] *= -1; normals[i] *= -1; normals[i + 1] *= -1; }
  }
  vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.metadata={pathSpine:spine};
  pavings.push(mesh);
  mesh.material = pathMaterial(sp.tex || "cobblestone_floor_08", sp.tint);
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/**
 * A CONVEX POLYGON OF PAVING, hard-edged, for the surfaces a ribbon cannot lay
 * exactly: a mitred lane quad, a yard cut on the diagonal (Caerdun's Lantern
 * Yard and Rampart Lane, zones/caerdun_paving.ts). The polygon is fanned from
 * its centroid and subdivided on a `step` grid of rings, every vertex seated on
 * the surface as makePath's are, with makePath's material, lift, world UVs and
 * opaque vertex alpha, so mergePavings folds it into the ribbons of its stone.
 */
// `y`: laid FLAT at that height instead of on the ground (Caerdun's quay apron, which
// bridges where the 4.7 m terrain mesh dips behind the quay's masonry); unset, every
// vertex sits on the ground as before.
export function makePavePoly(sp: { poly: [number, number][]; tex: string; uv?: number; lift?: number; name: string; y?: number }): Mesh | null {
  const n = sp.poly.length;
  if (n < 3) return null;
  // CONVEX ONLY: the fan from the centroid overdraws a concave polygon's notch
  // (a stone laid twice, z-fighting, outside the shape) -- refuse it loudly
  // rather than draw it wrong (the review; caerdun_fortress_layout.test.mjs
  // holds every planned polygon convex)
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = sp.poly[i], [bx, bz] = sp.poly[(i + 1) % n], [qx, qz] = sp.poly[(i + 2) % n];
    const cr = (bx - ax) * (qz - bz) - (bz - az) * (qx - bx);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign && Math.sign(cr) !== sign) throw new Error(`makePavePoly ${sp.name}: the polygon is not convex`);
    sign = Math.sign(cr);
  }
  const uv = sp.uv ?? PATH_UV, lift = sp.lift ?? PATH_LIFT, step = 3;
  const cx = sp.poly.reduce((a, p) => a + p[0], 0) / n, cz = sp.poly.reduce((a, p) => a + p[1], 0) / n;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  // ONE VERTEX A POINT: neighbouring fans share their spoke (and every fan the
  // centroid), so the normals average across it -- a vertex per fan left a
  // lighting seam down every spoke on uneven ground (the review)
  const seen = new Map<string, number>();
  const at = (x: number, z: number) => {
    const key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`, had = seen.get(key);
    if (had !== undefined) return had;
    positions.push(x, sp.y ?? Math.max(heightFn(x, z), terrainMeshHeight(x, z)) + lift, z);
    uvs.push(x / uv, z / uv); colors.push(1, 1, 1, 1);
    const i = positions.length / 3 - 1;
    seen.set(key, i);
    return i;
  };
  // rings from the centroid out to each edge: enough that no triangle is wider than `step`
  let rings = 1;
  for (const [x, z] of sp.poly) rings = Math.max(rings, Math.ceil(Math.hypot(x - cx, z - cz) / step));
  for (let i = 0; i < n; i++) {
    const [ax, az] = sp.poly[i], [bx, bz] = sp.poly[(i + 1) % n];
    const cols = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    // a triangle (centroid, a, b) as a grid of rings x cols
    const row: number[][] = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings, k = r === 0 ? 0 : cols;
      const line: number[] = [];
      for (let c = 0; c <= k; c++) {
        const u = k ? c / k : 0;
        const ex = ax + (bx - ax) * u, ez = az + (bz - az) * u;
        line.push(at(cx + (ex - cx) * t, cz + (ez - cz) * t));
      }
      row.push(line);
    }
    for (let r = 1; r <= rings; r++) {
      const inner = row[r - 1], outer = row[r];
      for (let c = 0; c < cols; c++) {
        const i0 = inner[Math.min(inner.length - 1, Math.round((c * (inner.length - 1)) / cols))];
        const i1 = inner[Math.min(inner.length - 1, Math.round(((c + 1) * (inner.length - 1)) / cols))];
        indices.push(i0, outer[c], outer[c + 1]);
        if (i0 !== i1) indices.push(i0, outer[c + 1], i1);
      }
    }
  }
  const mesh = new Mesh(sp.name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs; vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  for (let i = 1; i < normals.length; i += 3) {
    if (normals[i] < 0) { normals[i - 1] *= -1; normals[i] *= -1; normals[i + 1] *= -1; }
  }
  vd.normals = normals;
  vd.applyToMesh(mesh);
  // a (spineless) path to mergePavings: one batch with the ribbons of its stone
  mesh.metadata = { pathSpine: [] };
  pavings.push(mesh);
  mesh.material = pathMaterial(sp.tex);
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/**
 * THE APRON WHERE PATHS MEET. Philip's ask, and he is right that it wants to be
 * a helper: "maybe you can create a makeForkRoad or mergeRoad global helper
 * function or something to prevent this from happening again."
 *
 * Two ribbons crossing leave the inside corners of the T or Y unpaved -- a
 * green notch in the crotch of every fork, because a strip only covers its own
 * width and nothing covers the fillet between them. Real junctions are rounded
 * out; this is that rounding, as a disc of the same paving laid over the
 * meeting point, fading at its rim exactly as a path's banks do so it merges
 * with both.
 *
 * Radius should reach past BOTH paths' half-widths -- the notch is as deep as
 * the wider of them.
 */
export function makeJunction(sp: {
  x: number; z: number; r?: number;
  tex?: string; tint?: string; uv?: number; lift?: number; soft?: number; name?: string;
}): Mesh {
  const r = sp.r ?? 6, uv = sp.uv ?? PATH_UV, lift = sp.lift ?? PATH_LIFT;
  const soft = sp.soft ?? PATH_SOFT;
  const RINGS = 5, SEG = 28;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const push = (x: number, z: number, a: number) => {
    positions.push(x, Math.max(heightFn(x, z), terrainMeshHeight(x, z)) + lift, z);
    uvs.push(x / uv, z / uv);
    colors.push(1, 1, 1, a);
  };
  push(sp.x, sp.z, 1);                      // hub
  for (let ring = 1; ring <= RINGS; ring++) {
    const f = ring / RINGS;
    for (let k = 0; k < SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      // the rim wanders, so an apron never reads as a drawn circle
      const rr = r * (0.86 + (fbm(Math.cos(th) * 3 + sp.x, Math.sin(th) * 3 + sp.z) - 0.5) * 0.34) * f;
      const a = Math.min(1, (1 - f) / soft);
      push(sp.x + Math.cos(th) * rr, sp.z + Math.sin(th) * rr, a * a * (3 - 2 * a));
    }
  }
  for (let k = 0; k < SEG; k++) indices.push(0, 1 + k, 1 + ((k + 1) % SEG));
  for (let ring = 1; ring < RINGS; ring++) {
    const a0 = 1 + (ring - 1) * SEG, b0 = 1 + ring * SEG;
    for (let k = 0; k < SEG; k++) {
      const k2 = (k + 1) % SEG;
      indices.push(a0 + k, b0 + k, a0 + k2, a0 + k2, b0 + k, b0 + k2);
    }
  }
  const mesh = new Mesh(sp.name || `junction_${Math.round(sp.x)}_${Math.round(sp.z)}`, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs; vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  for (let i = 1; i < normals.length; i += 3) {
    if (normals[i] < 0) { normals[i - 1] *= -1; normals[i] *= -1; normals[i + 1] *= -1; }
  }
  vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = pathMaterial(sp.tex || "cobblestone_floor_08", sp.tint);
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  pavings.push(mesh);
  return mesh;
}

/**
 * ONE MESH PER PAVING MATERIAL. A city lays a ribbon per street, walk, passage
 * and apron and a disc per junction -- the Capital's district was 55 meshes,
 * 35 to 55 draws at every camera, for six materials (MEASURED, the perf gate).
 * This merges a zone's pavings that `which` picks into one mesh per material,
 * ribbons and discs apart: the discs are laid OVER the ribbons (makeJunction),
 * and where each was its own transparent mesh the sort by distance put the
 * nearer disc last. Merged, their order inside a mesh is the order they were
 * made, so the discs go in their own meshes, drawn after every ribbon
 * (alphaIndex). The merged meshes take the sources' place in `pavings`, so
 * pavingHeight reads the same triangles. Returns the meshes made.
 */
export function mergePavings(name: string, which: (m: Mesh) => boolean): Mesh[] {
  const groups = new Map<string, { mat: Material; disc: boolean; ms: Mesh[] }>();
  for (const m of pavings) {
    if (m.isDisposed() || !m.material || !which(m)) continue;
    const disc = !m.metadata?.pathSpine;           // makeJunction's: no spine
    const key = `${m.material.uniqueId}|${disc}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { mat: m.material, disc, ms: [] });
    g.ms.push(m);
  }
  const made: Mesh[] = [];
  for (const g of groups.values()) {
    if (g.ms.length < 2) continue;
    const merged = Mesh.MergeMeshes(g.ms, true, true);
    if (!merged) continue;
    merged.name = `${name}_${made.length}`;
    merged.material = g.mat;
    merged.useVertexColors = true;
    merged.hasVertexAlpha = true;
    merged.isPickable = false;
    merged.receiveShadows = true;
    merged.alphaIndex = g.disc ? 1 : 0;
    merged.freezeWorldMatrix();
    for (const m of g.ms) { const i = pavings.indexOf(m); if (i >= 0) pavings.splice(i, 1); }
    pavings.push(merged);
    made.push(merged);
  }
  return made;
}

// ---------- rivers ----------
// The standing river treatment (WATER.md — read it before building one).
// Every river gets:
//   * a bed CARVED below grade, so the water sits between banks, never on top
//   * the Mere's clear turquoise water (makeClearWaterMat); colour and alpha
//     overridable per river, and no shore wash — foam belongs to beaches
//   * a sand-sediment bed (aerial_beach_01, the strand sheet)
//   * a water sheet cut WIDER than the waterline, edges buried in the banks,
//     with per-vertex depth alpha putting the visible waterline exactly where
//     the bank crosses the surface. This is the fix for the floating-river
//     fault: a fixed-width ribbon can never meet a waterline that terrain
//     noise moves around (MEASURED on the Veilfall: 5.6–7.4m out).
//   * a winding course with slightly varying width — makeRiver adds both even
//     to a straight pair of waypoints; hand-built courses supply their own.
const RIVER_WATER = "#1f9aa6";           // the Mere's turquoise (v_moonmereshores)
const RIVER_SAND: [string, string] = ["#b4bcae", "#dcdcca"];  // the Mere strand's tint pair

// The height of the RENDERED terrain at (x, z): heightFn interpolated exactly
// as buildTerrain triangulates its grid, diagonal included (terrainSub gives
// the resolution, and the two must not drift). Inside a carved channel the
// mesh rides ABOVE the true function (its ~3.5m cells
// cannot follow the cut), so anything placed against heightFn alone sits
// under the ground the player actually sees, and the mesh's bumps poke
// through it. Sampling the mesh's own surface is the only way to win that
// fight deterministically — every lift-based guess before this lost it.
let tmhZone = "";
const tmhCorners = new Map<number, [number, number, number, number]>();
// buildTerrain's own heightFn samples, one per mesh vertex. A cell corner here
// IS one of those vertices, so it is read back rather than evaluated again --
// four full height evaluations per cell were ~0.6-1.1 s of a city build
// (MEASURED 2026-09-30). Only a corner whose coordinates equal the vertex's to
// the last bit is read; the rest are evaluated as before.
let terrainSamples: { scene: Scene; zone: string; size: number; sub: number; h: Float64Array } | null = null;
function terrainCorner(x: number, z: number, i: number, j: number, size: number, sub: number): number {
  const g = terrainSamples;
  // (Moonmere, S1: within a micron, not ===: terrainMeshHeight asks the cell's far corners as
  // x0 + step, which is not always bit-equal to -size/2 + (j+1) * step, and those corners fell
  // back to heightFn -- the same number, until a zone holds its mesh down under masonry. Only
  // the new Moonmere does; every other zone keeps the exact test, so nothing else changes)
  if (g && g.scene === scene && g.zone === currentZone && g.size === size && g.sub === sub && i <= sub && j <= sub) {
    const gx = -size / 2 + j * (size / sub), gz = -size / 2 + i * (size / sub);
    if (currentZone === "moonmere" ? Math.abs(gx - x) < 1e-6 && Math.abs(gz - z) < 1e-6 : gx === x && gz === z) return g.h[i * (sub + 1) + j];
  }
  return heightFn(x, z);
}
/** Moonmere (S1, MM-13): the drawn terrain's corner samples, so a zone can hold its mesh down
 * under its own masonry BEFORE its paving is laid (zones/moonmere_risers.ts holdDown); the
 * per-cell cache is dropped, as the samples are about to change. */
export function terrainSampleGrid(): { size: number; sub: number; h: Float64Array } | null {
  tmhCorners.clear();
  return terrainSamples && terrainSamples.scene === scene && terrainSamples.zone === currentZone ? terrainSamples : null;
}
function terrainMeshHeight(x: number, z: number): number {
  if (tmhZone !== currentZone) { tmhZone = currentZone; tmhCorners.clear(); }
  const size = ZONES[currentZone]?.size ?? 520;
  const sub = terrainSub(size, currentZone), step = size / sub;
  const j = Math.max(0, Math.min(sub - 1, Math.floor((x + size / 2) / step)));
  const i = Math.max(0, Math.min(sub - 1, Math.floor((z + size / 2) / step)));
  const x0 = -size / 2 + j * step, z0 = -size / 2 + i * step;
  const fx = Math.max(0, Math.min(1, (x - x0) / step));
  const fz = Math.max(0, Math.min(1, (z - z0) / step));
  // corner heights cached per cell: the waterline texture samples this tens
  // of thousands of times per build, and neighbours share corners
  const key = i * 4096 + j;
  let c = tmhCorners.get(key);
  if (!c) {
    c = [terrainCorner(x0, z0, i, j, size, sub), terrainCorner(x0 + step, z0, i, j + 1, size, sub),
      terrainCorner(x0, z0 + step, i + 1, j, size, sub), terrainCorner(x0 + step, z0 + step, i + 1, j + 1, size, sub)];
    tmhCorners.set(key, c);
  }
  const [h00, h10, h01, h11] = c;
  // buildTerrain splits each cell (a, a+1, a+sub+1) / (a+1, a+sub+2, a+sub+1):
  // the diagonal runs from (j+1, i) to (j, i+1)
  return fx + fz < 1
    ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
    : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

// The water sheet and the sand bed for a river whose CHANNEL ALREADY EXISTS —
// carved by makeRiver().carve or by a zone's own height function (the
// Veilfall). `rows` is the centreline with y at the intended SURFACE;
// `waterHalf` must reach past the worst-case waterline into the banks (the
// depth alpha erases whatever overshoots, so err wide).
// `deepRef` is the depth at which the water reaches full colour and wants to
// be a little under the real bed depth (the Mere's lesson: run the ramp to the
// exact floor and the whole river sits at half alpha, which reads as bare sand
// rather than water over sand).
// `endFade` fades both sheets in over the first/last metres; pass [0, 0] when
// the ends die in rock or open water and a fade would read as running dry.
function riverWaterAndBed(
  name: string,
  rowsIn: { x: number; z: number; y: number }[],
  waterHalf: (t: number) => number,
  opts: {
    color?: string; maxAlpha?: number; deepRef?: number;
    // reflectivity, straight through to makeClearWaterMat. Clear water is
    // fully reflective by default, which is right for a river running in the
    // open; STILL water that is meant to read as stagnant needs it turned
    // down, or the sky it mirrors washes its colour back to turquoise.
    refl?: number;
    sandHalf?: (t: number) => number; sandTints?: [string, string];
    endFade?: [number, number]; order?: number;
    // analytic water depth d metres out from the centreline (makeRiver's own
    // cross-section): when present, the waterline is drawn from THIS smooth
    // curve, and sampled ground only clamps coverage. Hand-carved callers
    // without one fall back to the sampled threshold alone.
    profileClear?: (t: number, d: number) => number;
    // with profileClear: evaluate its coverage clamp on a lattice of every
    // clampStep-th texel and interpolate between (see the opacity loop).
    // Absent, every texel samples the ground itself, as it always has.
    clampStep?: number;
    // when present, banks turn to ROCK from this many metres out (deep
    // rivers): a dry_riverbed_rock strip fades in over the sand there
    rockFrom?: (t: number) => number;
    // where the sand lets go of the ground, as |f| fractions of sandHalf:
    // [start, end] of the fade. Shallow rivers pass a long gentle ramp so
    // the banks' sand blends into the surrounding grass at the bank top.
    sandFade?: [number, number];
  } = {},
): void {
  // the same Chaikin rounding and y-smoothing makeWaterRibbon does, for the
  // same reasons: sharp bends fold a strip into gaps, and an unsmoothed
  // surface staircases with the bed
  let rows = rowsIn;
  for (let round = 0; round < 2; round++) {
    const out = [rows[0]];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(rows[rows.length - 1]);
    rows = out;
  }
  const ys = rows.map((r, i) => {
    const a = rows[Math.max(0, i - 1)].y, b = r.y, c = rows[Math.min(rows.length - 1, i + 1)].y;
    return (a + b * 2 + c) / 4;
  });
  const arc: number[] = [0];
  for (let i = 1; i < rows.length; i++)
    arc.push(arc[i - 1] + Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z));
  const total = arc[arc.length - 1] || 1;
  const [fadeIn, fadeOut] = opts.endFade ?? [4, 4];
  const endsAt = (s: number) =>
    Math.min(1, fadeIn > 0 ? s / fadeIn : 1, fadeOut > 0 ? (total - s) / fadeOut : 1);
  const perp = (i: number): [number, number] => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return [-dz / len, dx / len];
  };

  // one grid builder for both sheets: rows down the course, `cols` fractions
  // of the local half-width across it, everything else per-vertex
  const strip = (
    meshName: string, halfW: (t: number) => number, cols: number[],
    vert: (x: number, z: number, i: number, f: number) => { y: number; a: number; c?: Color3 },
    material: StandardMaterial, order: number, tile = 0,
  ): Mesh => {
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
    const normals: number[] = [], indices: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const [px, pz] = perp(i);
      const hw = halfW(arc[i] / total);
      for (const f of cols) {
        const x = rows[i].x + px * hw * f, z = rows[i].z + pz * hw * f;
        const v = vert(x, z, i, f);
        positions.push(x, v.y, z);
        normals.push(0, 1, 0);
        // world-grid uvs for the textured bed (vigSandBed's lesson: sand has
        // to sit in the same grid as the ground or it reads as a sticker);
        // the water gets NORMALIZED strip uvs, which is what its per-pixel
        // waterline texture is drawn in
        uvs.push(tile ? x / tile : (f + 1) / 2, tile ? z / tile : i / (rows.length - 1));
        colors.push(v.c ? v.c.r : 1, v.c ? v.c.g : 1, v.c ? v.c.b : 1, v.a);
      }
    }
    const n = cols.length;
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      // wound to match makeWaterRibbon's faces: cols run from -perp to +perp,
      // which mirrors its vertex order, so the naive winding faced DOWN and
      // both sheets were backface-culled out of the zone
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
    const mesh = new Mesh(meshName, scene);
    const vd = new VertexData();
    vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
    vd.colors = colors; vd.normals = normals;
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;
    mesh.alphaIndex = order;
    return mesh;
  };

  // the sand bed: conforms to the carved channel, climbs past the waterline
  // (a bed that stops at the water's edge reopens the floating-river gap),
  // fades out up the banks and at the course's ends
  const order = opts.order ?? 1;
  const [s1, s2] = opts.sandTints ?? RIVER_SAND;
  const c1 = Color3.FromHexString(s1), c2 = Color3.FromHexString(s2);
  const sandHalf = opts.sandHalf ?? ((t: number) => waterHalf(t) + 2.5);
  // Lifted 0.3, not vigSandBed's 0.06. The terrain mesh renders heightFn on a
  // ~3.5m grid, and inside a concave channel the interpolated triangles ride
  // ABOVE the true function -- at 0.06 the whole bed sat under the ground and
  // the river ran over bare grass. 0.3 stays well below the shallowest
  // waterline (0.55 over the bed floor).
  // 17 columns across so the sheets bend with the channel and the sand's
  // per-vertex fade resolves. The WATERLINE does not rely on this lattice —
  // per-vertex alpha aliased it into a sawtooth at every density tried, and
  // it is drawn per-pixel by the opacity texture below instead.
  const COLS = Array.from({ length: 17 }, (_, i) => i / 8 - 1);
  // ONE unbroken sand sheet from bank to bank (Philip: "the bed should be
  // sand sediment, which starts from the sandy banks"): solid out to |f| 0.85.
  // It rides 0.15 above the RENDERED terrain — max of the true function and
  // the mesh's interpolated surface — so no terrain bump can stick out of
  // the sand anywhere under the sheet. (Philip: "the banks have bumps
  // sticking out of the sand, revealing green patches".)
  const bedY = (x: number, z: number) =>
    Math.max(heightFn(x, z), terrainMeshHeight(x, z)) + 0.15;
  // The bank-top edge wanders (±~0.6m of noise on the fade threshold) and,
  // when sandFade opens the ramp up, lets go over metres rather than a
  // strip-edge band — sand thinning into grass, not a cut line (Philip:
  // "gently blend into the surrounding texture at the top of the banks").
  const [sf0, sf1] = opts.sandFade ?? [0.85, 1];
  const sand = strip(name + "_bed", sandHalf, COLS,
    (x, z, i, f) => {
      const wob = (fbm(x / 5.3 + 4, z / 5.3 + 4) - 0.5) * 0.14;
      return {
        y: bedY(x, z),
        a: (1 - smooth(Math.min(1, Math.max(0, (Math.abs(f) + wob - sf0) / (sf1 - sf0)))))
          * endsAt(arc[i]),
        c: Color3.Lerp(c1, c2, fbm(x / 17 + 5, z / 17 + 5)),
      };
    },
    vigGroundSheet("riversand", "aerial_beach_01"), order, 9);
  sand.receiveShadows = true;
  pavings.push(sand); // its dry bank is a floor where it shows (see pavingHeight)

  // rocky banks (deep rivers): a rock sheet over the sand from `rockFrom`
  // metres out — the bed stays sand sediment (the spec), the climb out of
  // the water reads as rock (Philip: "rocky texture on the deep river
  // banks"). Starts below the waterline so the rock fades in through the
  // water instead of ringing the river with a dry rim.
  const rockFrom = opts.rockFrom;
  if (rockFrom) {
    const [r1c, r2c] = [Color3.FromHexString("#9a968c"), Color3.FromHexString("#c2beb2")];
    const rock = strip(name + "_rock", sandHalf, COLS,
      (x, z, i, f) => {
        const dM = Math.abs(f) * sandHalf(arc[i] / total);
        return {
          y: bedY(x, z) + 0.02,
          a: smooth(Math.min(1, Math.max(0, (dM - rockFrom(arc[i] / total)) / 1.2)))
            * (1 - smooth(Math.min(1, Math.max(0, (Math.abs(f) - 0.85) / 0.15))))
            * endsAt(arc[i]),
          c: Color3.Lerp(r1c, r2c, fbm(x / 13 + 3, z / 13 + 3)),
        };
      },
      vigGroundSheet("riverrock", "dry_riverbed_rock"), order + 1, 7);
    rock.receiveShadows = true;
  }

  // the water: one flat sheet at the smoothed surface height, opacity driven
  // by the depth of the bed under each vertex exactly as vigShallowWater does
  // it — including the last-25cm fade that keeps the waterline from drawing
  // itself as a hard polygon edge
  // The waterline itself, PER-PIXEL. Per-vertex alpha cannot draw it: the
  // fade band on a bank is ~0.5m wide and the strip's columns are ~1m apart,
  // so the zero-crossing aliased against the vertex lattice as a sawtooth
  // however the fade was tuned (Philip flagged it three times). This little
  // opacity texture in strip space resolves the band at ~0.3m/texel, fading
  // against the SAND SHEET the viewer actually sees (bedY): the water goes
  // to nothing before the sand crosses the surface, so the geometric cut is
  // invisible whatever shape it has, and a terrain bump tall enough to break
  // the surface fades the water out around itself and reads as a sandbar.
  const maxA = opts.maxAlpha ?? 0.82, deepRef = opts.deepRef ?? 0.5;
  // the coverage clamp's smoothing radius scales with the ZONE's terrain
  // cell (size/150): fixed ±0.9m taps smoothed a 240m vignette's 1.6m
  // creases perfectly and could not touch a 520m zone's 3.5m ones — the
  // same river was clean in one zone and toothy in the other
  const tap = Math.max(0.9, ((ZONES[currentZone]?.size ?? 520) / 150) * 0.6);
  const TW = 48, TH = Math.min(1024, Math.max(128, rows.length));
  const op = new DynamicTexture(name + "_op", { width: TW, height: TH }, scene, false);
  op.wrapU = Texture.CLAMP_ADDRESSMODE;
  op.wrapV = Texture.CLAMP_ADDRESSMODE;
  const octx = op.getContext() as unknown as CanvasRenderingContext2D;
  const img = octx.createImageData(TW, TH);
  // The coverage clamp on a LATTICE (opts.clampStep). Its 5-tap bedY average
  // was the dearest loop in Heartwood's build (MEASURED 1.68-1.80 s in three
  // CPU profiles: 48 x 548 texels x 5 ground samples). Along the course the
  // bank changes over metres, so the clamp is taken at every clampStep-th row
  // (the last always included) and interpolated between; ACROSS the course it
  // stays per-texel, because the wet band is only ~14 texels wide and a
  // coarser step there cut the curved bank by its chord and pulled the
  // waterline in by a texel (MEASURED: 888 texels off by > 32/255 at 4 x 4).
  // Nodes are filled on demand, so columns the analytic line leaves dry,
  // which skip the clamp, never sample the ground at all.
  const cs = opts.profileClear && (opts.clampStep ?? 1) > 1 ? Math.floor(opts.clampStep!) : 0;
  let latBs: ((tx: number, ty: number) => number) | null = null;
  if (cs) {
    const ly: number[] = [];
    for (let y = 0; y < TH - 1; y += cs) ly.push(y);
    ly.push(TH - 1);
    const LY = ly.length;
    // the same row, perpendicular and width the opacity loop below takes
    const lrow = ly.map((y) => {
      const rF = (y / (TH - 1)) * (rows.length - 1);
      const r0 = Math.floor(rF), r1i = Math.min(rows.length - 1, r0 + 1), rt = rF - r0;
      return {
        rx: rows[r0].x + (rows[r1i].x - rows[r0].x) * rt,
        rz: rows[r0].z + (rows[r1i].z - rows[r0].z) * rt,
        p: perp(r0),
        hw: waterHalf((arc[r0] + (arc[r1i] - arc[r0]) * rt) / total),
      };
    });
    const lat = new Float32Array(TW * LY).fill(NaN);
    const node = (tx: number, j: number) => {
      const k = j * TW + tx;
      let v = lat[k];
      if (v !== v) {
        const { rx, rz, p: [px, pz], hw } = lrow[j];
        const f = (tx / (TW - 1)) * 2 - 1;
        const wx = rx + px * hw * f, wz = rz + pz * hw * f;
        v = lat[k] = (bedY(wx, wz) + bedY(wx + px * tap, wz + pz * tap)
          + bedY(wx - px * tap, wz - pz * tap)
          + bedY(wx + pz * tap, wz - px * tap)
          + bedY(wx - pz * tap, wz + px * tap)) / 5;
      }
      return v;
    };
    latBs = (tx, ty) => {
      const j = Math.min(LY - 2, Math.floor(ty / cs));
      const v = (ty - ly[j]) / (ly[j + 1] - ly[j]);
      const b0 = node(tx, j);
      return v === 0 ? b0 : b0 + (node(tx, j + 1) - b0) * v;
    };
  }
  for (let ty = 0; ty < TH; ty++) {
    // update(false) below uploads WITHOUT the Y flip, so canvas row ty maps
    // straight to v = ty/(TH-1). MEASURED the hard way: a manual pre-flip on
    // top of that upload cancelled itself, the whole map applied reversed
    // along the course, and every stretch of river wore another stretch's
    // waterline — mid-channel fades, hard z-cuts at the real banks (Philip's
    // "the waterline has straight edges" lasso).
    const rF = (ty / (TH - 1)) * (rows.length - 1);
    const r0 = Math.floor(rF), r1i = Math.min(rows.length - 1, r0 + 1), rt = rF - r0;
    const rx = rows[r0].x + (rows[r1i].x - rows[r0].x) * rt;
    const rz = rows[r0].z + (rows[r1i].z - rows[r0].z) * rt;
    const ry = ys[r0] + (ys[r1i] - ys[r0]) * rt;
    const [px, pz] = perp(r0);
    const hw = waterHalf((arc[r0] + (arc[r1i] - arc[r0]) * rt) / total);
    const t = (arc[r0] + (arc[r1i] - arc[r0]) * rt) / total;
    for (let tx = 0; tx < TW; tx++) {
      const f = (tx / (TW - 1)) * 2 - 1;
      const wx = rx + px * hw * f, wz = rz + pz * hw * f;
      let a: number;
      if (opts.profileClear) {
        // the waterline from the ANALYTIC cross-section, its distance wobbled
        // ±0.6m at a few metres' wavelength so the mathematically smooth
        // curve does not read as drawn (the coastline lesson)
        const dM = Math.abs(f) * hw + (fbm(wx / 3.7 + 9, wz / 3.7 + 9) - 0.5) * 1.2;
        a = smooth(Math.min(1, Math.max(0, opts.profileClear(t, dM) / 0.3)));
        // ...clamped by real coverage so a genuinely tall bump still surfaces
        // as a sandbar and no crossing ever z-cuts visibly. With the channel
        // ground now SMOOTHED by the carve this clamp normally agrees with
        // the analytic line and never shapes the edge itself — no offset, so
        // it cannot thin the river the way an earlier tuning did.
        if (latBs) {
          if (a > 0) a *= smooth(Math.min(1, Math.max(0, (ry - latBs(tx, ty)) / 0.3)));
        } else {
          const bs = (bedY(wx, wz) + bedY(wx + px * tap, wz + pz * tap)
            + bedY(wx - px * tap, wz - pz * tap)
            + bedY(wx + pz * tap, wz - px * tap)
            + bedY(wx - pz * tap, wz + px * tap)) / 5;
          a *= smooth(Math.min(1, Math.max(0, (ry - bs) / 0.3)));
        }
      } else {
        a = smooth(Math.min(1, Math.max(0, (ry - bedY(wx, wz)) / 0.35)));
      }
      const v = Math.round(255 * a);
      const o = (ty * TW + tx) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  op.update(false);
  const wmat = makeClearWaterMat(name + "wm", opts.color ?? RIVER_WATER, 1, opts.refl ?? 1);
  wmat.opacityTexture = op;
  (wmat.opacityTexture as Texture).getAlphaFromRGB = true;
  strip(name, waterHalf, COLS,
    (x, z, i) => {
      // vertex alpha carries only the LOW-frequency terms — the colour ramp
      // by true depth and the course-end fade. The edge lives in the texture.
      const depth = Math.max(0, ys[i] - heightFn(x, z));
      return {
        y: ys[i],
        a: (0.12 + (maxA - 0.12) * smooth(Math.min(1, depth / deepRef))) * endsAt(arc[i]),
      };
    },
    wmat, order + 2);
}

// A whole river from waypoints: winds the course, varies the width, carves
// the channel, then builds the water and the bed over it. Two-phase because
// the terrain has to exist between those steps:
//
//   const river = makeRiver([[x0, z0], [x1, z1], ...], { depth: "shallow" });
//   ...inside the zone's height function:   h = river.carve(x, z, h);
//   ...inside the zone's builder:           river.build("myriver");
//
// `points()` hands the wound centreline back for avoid lists and bridges —
// the course is NOT the waypoint polyline, so never place against that.
export function makeRiver(
  waypoints: [number, number][],
  opts: {
    half?: number;               // nominal waterline half-width, default 4.5
    depth?: "shallow" | "deep";  // wadeable banks, or banks that refuse
    impassable?: boolean;        // also block the shallow fringe (molten glass, tar, etc.)
    seed?: number;
    meander?: number;            // added winding amplitude in metres; 0 pins the line
    fall?: number;               // extra carve depth at the far end (rivers that end at a fall)
    endBack?: [number, number];  // metres of dry carved channel at each end, no water
    vegetation?: boolean;        // true lets scatter vegetation into the channel (default: none)
    color?: string; maxAlpha?: number;
    refl?: number;              // water reflectivity; turn down for stagnant water
    sandTints?: [string, string];
    endFade?: [number, number];
    clampStep?: number;          // waterline coverage clamp on a lattice (riverWaterAndBed); build-time lever
    mapTone?: MapWaterTone;      // the map's colour when it is not water (molten glass: "melt")
  } = {},
): {
  carve: (x: number, z: number, h: number, pre?: (px: number, pz: number) => number) => number;
  build: (name: string) => void;
  points: () => { x: number; z: number }[];
} {
  const half = opts.half ?? 4.5;
  const shallow = (opts.depth ?? "shallow") === "shallow";
  // Solved against isWalkable, not styled. Shallow: 0.65m of water stays
  // under the 0.9 deep-water limit; the inner rise peaks around 0.73, so a
  // shallow river can be waded anywhere (build() slope-exempts the channel
  // as a belt-and-braces guarantee — wadeable BY CONTRACT). Deep is the
  // opposite ON PURPOSE, and its impassability is dual (Philip: "the
  // purpose of the deep river is to create impassability, not to actually
  // make it very low"): 1.4m of water fails the depth rule, and its bank
  // bench stands a full 1.0 above the waterline so the rise's peak grade is
  // 1.38 — past the 1.1 cliff limit, the banks refuse on their own.
  // The FREEBOARD (carveDepth - surface: how far the bank top stands above
  // the waterline) is most of what the carve buys: at 0.55m of it the river
  // looked about to overflow (Philip), so the shallow cut is deeper than
  // the water needs and the waterline sits ~1.05m (deep: 1.5m) below the
  // banks. A deep preset with 2.2m of freeboard was rejected as "too low" —
  // depth and grade block the crossing, not distance down to the water.
  // 0.65 of shallow water rather than 0.5, and not for looks: the terrain
  // mesh interpolates its grid across the carved channel and rides above
  // the true bed, and at 0.5 those errors broke the surface as green shards
  // on the Veilfall's noisy plateau.
  const carveDepth = shallow ? 1.7 : 2.9;
  const surface = shallow ? 0.65 : 1.4;  // waterline height above the bed floor
  const bankRun = shallow ? 4.0 : 4.2;
  const rnd = seededRand(opts.seed ?? 9);
  const ph = [rnd() * 7, rnd() * 7, rnd() * 7, rnd() * 7];
  const amp = opts.meander ?? 5;

  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++)
    total += Math.hypot(waypoints[i + 1][0] - waypoints[i][0], waypoints[i + 1][1] - waypoints[i][1]);

  // resample the waypoint polyline at 3m and push each sample sideways by two
  // incommensurate sines — winding by construction, even from two waypoints.
  // The offset pins to zero over the last 12m at both ends so the source and
  // the mouth stay exactly where the zone put them.
  const pts: { x: number; z: number; s: number }[] = [];
  let sAcc = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, az] = waypoints[i], [bx, bz] = waypoints[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const px = -(bz - az) / len, pz = (bx - ax) / len;
    const segs = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < segs; k++) {
      const t = k / segs;
      const ss = sAcc + len * t;
      const endW = Math.min(1, ss / 12, (total - ss) / 12);
      const off = amp * endW * (0.65 * Math.sin(ss / 26 + ph[0]) + 0.35 * Math.sin(ss / 9.7 + ph[1]));
      pts.push({ x: ax + (bx - ax) * t + px * off, z: az + (bz - az) * t + pz * off, s: ss });
    }
    sAcc += len;
  }
  pts.push({ x: waypoints[waypoints.length - 1][0], z: waypoints[waypoints.length - 1][1], s: sAcc });

  // width varies slightly along the course; the bed floor is what is derived
  // from it, so the waterline lands back near the nominal half (the surface
  // sits about halfway up the bank at both depth presets)
  const halfAt = (ss: number) => half * (1 + 0.16 * Math.sin(ss / 31 + ph[2]) + 0.10 * Math.sin(ss / 12.3 + ph[3]));
  // the waterline lands ~0.75m up the steep inner rise (see carve), so the
  // flat bed floor ends this far inside the nominal waterline
  const bedAt = (ss: number) => Math.max(1.5, halfAt(ss) - 0.75);

  // carve runs once per heightFn call, so reject cheaply before the segment scan
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const reach = half * 1.3 + bankRun + 2;

  // `fall` deepens the carve linearly toward the last waypoint. The Veilfall's
  // lesson: its last leg ran 0.3m uphill on plateau noise and the river pooled
  // at its own lip — the surface follows the bed, so a bed that only ever
  // descends is what makes the river fall the whole way instead of ponding.
  const fall = opts.fall ?? 0;
  const depthAt = (ss: number) => carveDepth + fall * (ss / (total || 1));

  const nearest = (x: number, z: number): [number, number] | null => {
    if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) return null;
    let best = 1e9, bestS = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [d, t] = segDist(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
      if (d < best) { best = d; bestS = pts[i].s + (pts[i + 1].s - pts[i].s) * t; }
    }
    return [best, bestS];
  };

  // How high the bank bench stands above the bed floor: the inner rise
  // climbs this far. Shallow rivers put the bench a sandy 0.42 above the
  // waterline; deep rivers a rocky 1.0 — that height over the same run is
  // what pushes their bank grade past the cliff limit. The run is sized
  // against the COARSEST terrain grid in play, not against style: at 1.3m
  // the rise fit inside a single 3.5m cell of a 520m zone and the mesh cut
  // the corner — the river read clean in a 240m vignette (1.6m cells) and
  // toothy in the Lochveil, same code (Philip caught the split).
  const rise = surface + (shallow ? 0.42 : 1.0);
  const r1 = shallow ? 2.2 : 2.6;   // run of the inner rise

  // height of the bank profile above the bed floor, d metres from the
  // centreline: flat bed, a short steep rise out of the water (r1), then a
  // gentle climb the rest of the way to grade
  const profileAt = (d: number, bed: number, depth: number): number => {
    if (d <= bed) return 0;
    if (d <= bed + r1) return rise * smooth((d - bed) / r1);
    // clamped: smooth() is an unclamped smoothstep and goes negative past
    // t=1.5 — the river's spans only ever reached ~1.55 and survived by
    // luck; the pond's did not (see makePond's profile)
    return rise + (depth - rise) * smooth(Math.min(1, (d - bed - r1) / (bankRun - r1)));
  };

  // `pre` is the zone's own height function WITHOUT this river (the zone
  // passes it — see fieldHeight). When it is given, the channel is not cut
  // into the noisy ground: it REPLACES it, with a wide-area average of the
  // surrounding terrain minus the analytic profile. This is the fix for the
  // sawtooth waterline at its actual root (Philip: "the banks have uneven
  // height poking up above the waterline... smooth out the banks' height").
  // Every attempt to hide noisy banks downstream of the carve — steeper
  // rises, lifted sand, smoothed coverage clamps — either kept the teeth or
  // thinned the river, because the sand sheet must ride ABOVE the bumpy
  // ground and therefore always crossed the water along a bumpy line. Banks
  // that are actually smooth need no hiding.
  const TAPS: [number, number][] = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]];
  // no vegetation in rivers BY DEFAULT (Philip) — the channel registers with
  // the scatter generators out to the bank top; reeds at a waterline are
  // placed deliberately, never minted by a scatter. Registered lazily from
  // carve, NOT from build(): the carve runs while the terrain builds, before
  // every scatter, while build() runs after some of them (the Lochveil's
  // wildflowers scatter before its river builds). Pass `vegetation: true`
  // to opt a river out.
  let vegRegGen = -1;
  const carve = (x: number, z: number, h: number, pre?: (px: number, pz: number) => number): number => {
    if (!opts.vegetation && vegRegGen !== vegGen) {
      vegRegGen = vegGen;
      vegExclusions.push((vx, vz) => {
        const vn = nearest(vx, vz);
        return !!vn && vn[0] < bedAt(vn[1]) + bankRun;
      });
    }
    const n = nearest(x, z);
    if (!n) return h;
    const [best, bestS] = n;
    const bed = bedAt(bestS), bankW = bed + bankRun;
    if (best >= bankW) return h;
    const depth = depthAt(bestS);
    const A = profileAt(best, bed, depth);
    if (!pre) return h - (depth - A); // legacy subtract, for zones that cannot pass one
    // the smooth reference level: the pre-river terrain averaged over a 12m
    // footprint, wide enough to swallow the ~9m fine-noise wavelength
    let L = 0;
    for (const [tx, tz] of TAPS) L += pre(x + tx, z + tz);
    L /= TAPS.length;
    // full override in the channel, blending back to natural ground over the
    // last 1.5m of bank so the edge of the carve leaves no crease
    const w = 1 - smooth(Math.min(1, Math.max(0, (best - (bankW - 1.5)) / 1.5)));
    return h * (1 - w) + (L - depth + A) * w;
  };


  const build = (name: string): void => {
    mapWaterRibbon(pts, half, opts.mapTone);
    if (opts.impassable) liquidBarriers.push((x, z) => {
      const n = nearest(x, z);
      // Cover the profile's visible edge, including its 0.6m opacity wobble
      // and half-metre sampling margin. No chain of circles can leave gaps.
      return !!n && profileAt(Math.max(0, n[0] - 1.1), bedAt(n[1]), depthAt(n[1])) < surface;
    });
    // `endBack` trims the WATER short of an end while the carve runs the full
    // course — for a river that ends at a fall: the dry channel carries on
    // over the crest and a boulder row hides the sheet's straight end cap
    // (the Veilfall's design, see its lip rocks).
    const [backIn, backOut] = opts.endBack ?? [0, 0];
    const rows: { x: number; z: number; y: number }[] = [];
    for (const p of pts) {
      // a shallow river is wadeable BY CONTRACT, and the bank grade alone
      // does not guarantee it: where the cut lands on ground with its own
      // slope the two stack past the 1.1 cliff limit. Exempt the channel the
      // way the Greyrun's fords are exempted.
      if (shallow) slopeExempt.push({ x: p.x, z: p.z, r: bedAt(p.s) + bankRun + 1 });
      if (p.s < backIn || p.s > total - backOut) continue;
      const y = heightFn(p.x, p.z) + surface;
      // ONLY deep rivers register water bodies. A shallow river's 0.65m can
      // never legitimately fail the 0.9m depth rule, but its circles still
      // produced false "deep water" cells on along-course slopes — a row's
      // radius reaches ~4.5m downstream, where the bed sits under an
      // upstream row's higher waterline. Wadeable by contract means no
      // depth blockers at all.
      if (!shallow) waterBodies.push({ x: p.x, z: p.z, r: halfAt(p.s), level: y });
      rows.push({ x: p.x, z: p.z, y });
    }
    // the water sheet runs PAST the bank crest (bankW + 1), buried in rising
    // ground (Philip's rule: wider than the banks, never just meeting them).
    // The sand-relative edge fade in riverWaterAndBed zeroes it before any of
    // the overshoot can show, so burying deep costs nothing.
    //
    // profileClear hands the waterline its ANALYTIC water depth at d metres
    // from the centreline — the carve's own noise-free cross-section. The
    // waterline is drawn from this, not from sampled ground: a sampled
    // threshold traces the terrain mesh's triangle creases, and over the
    // gentle parts of the profile those creases displaced the contour by
    // metres as a repeating ~3m scallop (Philip's third lasso: "why is it
    // still jagged? Is this a problem with the bank's height?"). It was.
    const profileClear = (t: number, d: number): number => {
      const ss = t * total;
      return surface - profileAt(d, bedAt(ss), depthAt(ss));
    };
    riverWaterAndBed(name, rows, (t) => bedAt(t * total) + bankRun + 1, {
      profileClear, clampStep: opts.clampStep,
      // deep banks are rock: the strip fades in just up the rise, under the
      // waterline, so the rock reads as the climb out of the water
      rockFrom: shallow ? undefined : (t) => bedAt(t * total) + 0.8,
      // shallow banks blend their sand into the grass over the whole upper
      // bank (solid just past the bench, gone at the sheet edge)
      sandFade: shallow ? [0.62, 1] : undefined,
      color: opts.color, maxAlpha: opts.maxAlpha, refl: opts.refl,
      // 1.6x the real depth: the river never reaches full colour, so the sand
      // bed stays readable through the water the way the Mere's shallows do
      deepRef: surface * 1.6,
      sandHalf: (t) => bedAt(t * total) + bankRun + 1.5,
      sandTints: opts.sandTints, endFade: opts.endFade,
    });
  };

  return { carve, build, points: () => pts.map((p) => ({ x: p.x, z: p.z })) };
}

// A pond / small lake: the shallow river's cross-section wrapped into an
// irregular closed loop (WATER.md — every rule and every measured constraint
// carries over). Ponds are SHALLOW AND WALKABLE by default (Philip): 0.65m
// of water, a slope-exempted shore, no depth blockers registered. The shore
// is never a circle — low integer harmonics with seeded phases wobble the
// radius ±~20%, which cannot seam at the angle wrap the way world-noise can.
// A small sand beach rings the whole pond and blends into the surrounding
// ground at the top exactly like a shallow river bank; the bed is the same
// sand. Same two-phase wiring as makeRiver:
//
//   const POND = makePond(cx, cz, r, { seed });
//   ...height function:  h = POND.carve(x, z, h, base);
//   ...zone builder:     POND.build("mypond");
//   ...set dressing:     y = POND.level()  (the water surface height)
export function makePond(
  cx: number, cz: number, r: number,
  opts: {
    seed?: number;
    depth?: "shallow" | "deep"; // shallow by default; deep uses the river preset
    impassable?: boolean;       // refuse even shallow edge water, with no wading band
    color?: string; maxAlpha?: number;
    refl?: number;               // makeClearWaterMat's sheen; 0 for melt, tar, anything that is not water
    sandTints?: [string, string];
    vegetation?: boolean;        // true lets scatter vegetation in (default: none)
    mapTone?: MapWaterTone;      // the map's colour when it is not water (molten glass: "melt")
  } = {},
): {
  carve: (x: number, z: number, h: number, pre?: (px: number, pz: number) => number) => number;
  build: (name: string) => void;
  level: () => number;
  /** The waterline's radius at a bearing (radians from +x toward +z): where a river has to END to meet the water. */
  shore: (ang: number) => number;
} {
  // Both depth presets use the river's cross-section numbers.
  const shallow = (opts.depth ?? "shallow") === "shallow";
  const CARVE = shallow ? 1.7 : 2.9, WATER = shallow ? .65 : 1.4;
  const R1 = shallow ? 2.2 : 2.6, RUN = shallow ? 4 : 4.2;
  const rise = WATER + (shallow ? .42 : 1); // bench above the waterline
  const rnd = seededRand(opts.seed ?? 5);
  const ph = [rnd() * 7, rnd() * 7, rnd() * 7];
  // waterline radius per bearing: irregular by construction
  const rAt = (ang: number): number =>
    r * (1 + 0.10 * Math.sin(2 * ang + ph[0]) + 0.07 * Math.sin(3 * ang + ph[1])
           + 0.05 * Math.sin(5 * ang + ph[2]));
  const bedR = (ang: number): number => Math.max(1.5, rAt(ang) - 0.75);
  const reach = r * 1.25 + 14 + 3;   // 14 = the longest adaptive bank climb
  // smoothing footprint for the outer climb's ground reference
  const PTAPS: [number, number][] = [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]];

  // height of the cross-section above the bed floor, d metres from centre —
  // the river's profileAt with the pond's shore ring as its bed edge
  const profile = (d: number, bed: number): number => {
    if (d <= bed) return 0;
    if (d <= bed + R1) return rise * smooth((d - bed) / R1);
    // CLAMPED, and it matters: smooth() is an unclamped smoothstep, and the
    // waterline texture evaluates this far past the bank where t reaches ~6
    // — smooth(6) is hugely NEGATIVE, the profile collapsed below the
    // waterline, and every terrain dip within the sheet radius filled with
    // phantom water (Philip's "water spilling outside of pond" circles).
    return rise + (CARVE - rise) * smooth(Math.min(1, (d - bed - R1) / (RUN - R1)));
  };

  // the pond's reference level: pre-river ground averaged around the basin,
  // ONE value for the whole pond — a pond's surface is flat, unlike a
  // river's, so the smoothing cannot be local
  let L0 = 0, l0Gen = -1;
  const solveL0 = (pre: (px: number, pz: number) => number): void => {
    let sum = pre(cx, cz);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      sum += pre(cx + Math.cos(a) * r * 0.55, cz + Math.sin(a) * r * 0.55);
    }
    L0 = sum / 7;
  };

  let vegRegGen = -1;
  const carve = (x: number, z: number, h: number, pre?: (px: number, pz: number) => number): number => {
    const dx = x - cx, dz = z - cz;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) return h;
    const d = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const bed = bedR(ang);
    if (d >= bed + R1 + 15.5) return h; // past the longest possible bank climb
    // no vegetation in ponds by default, same registration as rivers: from
    // carve, before any scatter runs
    if (!opts.vegetation && vegRegGen !== vegGen) {
      vegRegGen = vegGen;
      vegExclusions.push((vx, vz) => {
        const vd = Math.hypot(vx - cx, vz - cz);
        return vd < bedR(Math.atan2(vz - cz, vx - cx)) + RUN;
      });
    }
    const A = profile(d, bed);
    if (!pre) return h - (CARVE - A); // legacy subtract, no smoothing
    if (l0Gen !== vegGen) { l0Gen = vegGen; solveL0(pre); }
    // bed and inner rise: full analytic override, flat pond level
    if (d <= bed + R1) return (L0 - CARVE) + A;
    // Outer climb: from the bench up to the SMOOTHED natural ground at a
    // capped ~0.4 grade, taking as much run as that needs. The first version
    // climbed a FIXED 1.8m run to the pond's averaged level and then jumped
    // to true ground over 1.5m — level ground made that invisible, but the
    // meadow slopes, so the uphill shores had to bridge ~2m in 1.5m and the
    // ponds sat in craters (Philip: "too deep and too steep"). Downhill
    // shores get the same treatment in reverse: the bench holds and the
    // ground falls away gently beyond it, which is the berm that stops the
    // pond leaking out of its own low side.
    const benchY = L0 - CARVE + rise;
    let Lloc = 0;
    for (const [tx, tz] of PTAPS) Lloc += pre(x + tx, z + tz);
    Lloc /= PTAPS.length;
    const gap = Lloc - benchY;
    const run = Math.min(14, Math.max(RUN - R1, Math.abs(gap) / 0.4));
    const target = benchY + gap * smooth(Math.min(1, (d - bed - R1) / run));
    // hand back to true ground once the climb is done
    const w = 1 - smooth(Math.min(1, Math.max(0, (d - (bed + R1 + run - 1.5)) / 1.5)));
    return h * (1 - w) + target * w;
  };

  const level = (): number => L0 - CARVE + WATER;

  const build = (name: string): void => {
    mapWaterDisc(cx, cz, r, opts.mapTone);
    const lv = level();
    const [s1, s2] = opts.sandTints ?? RIVER_SAND;
    const c1 = Color3.FromHexString(s1), c2 = Color3.FromHexString(s2);
    const DMAX = r * 1.25 + RUN + 1.5;
    // wadeable BY CONTRACT, like the shallow river: exempt the shore ring.
    // 32 circles at r = RUN + 2, not 24 at RUN — the smaller ring left gaps
    // between circles on the outer blend and the G-paint showed lone blocked
    // cells on the beach.
    if (!shallow || opts.impassable) liquidBarriers.push((x, z) => {
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d > reach) return false;
      const bed = bedR(Math.atan2(dz, dx));
      return opts.impassable
        ? profile(Math.max(0, d - 1.1), bed) < WATER
        : profile(d, bed) < WATER - WADE_DEPTH;
    });
    if (shallow && !opts.impassable) for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const sr = bedR(a) + RUN * 0.5;
      slopeExempt.push({ x: cx + Math.cos(a) * sr, z: cz + Math.sin(a) * sr, r: RUN + 2 });
    }

    // one polar grid builder for both sheets (the river's strip(), bent round)
    const SEGS = 160, RINGS = Math.max(24, Math.ceil(DMAX));
    const polar = (
      meshName: string,
      vert: (x: number, z: number, d: number, ang: number) => { y: number; a: number; c?: Color3 },
      material: StandardMaterial, order: number, tile = 0,
    ): Mesh => {
      const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
      const normals: number[] = [], indices: number[] = [];
      for (let i = 0; i <= RINGS; i++) {
        for (let j = 0; j <= SEGS; j++) {   // seam column duplicated so uvs can wrap
          const ang = (j / SEGS) * Math.PI * 2;
          const d = (i / RINGS) * DMAX;
          const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
          const v = vert(x, z, d, ang);
          positions.push(x, v.y, z);
          normals.push(0, 1, 0);
          uvs.push(tile ? x / tile : j / SEGS, tile ? z / tile : i / RINGS);
          colors.push(v.c ? v.c.r : 1, v.c ? v.c.g : 1, v.c ? v.c.b : 1, v.a);
        }
      }
      const n = SEGS + 1;
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) {
        const a = i * n + j;
        indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
      const mesh = new Mesh(meshName, scene);
      const vd = new VertexData();
      vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
      vd.colors = colors; vd.normals = normals;
      vd.applyToMesh(mesh);
      mesh.material = material;
      mesh.hasVertexAlpha = true;
      mesh.isPickable = false;
      mesh.alphaIndex = order;
      return mesh;
    };

    const bedY = (x: number, z: number) =>
      Math.max(heightFn(x, z), terrainMeshHeight(x, z)) + 0.15;

    // the sand: bed and beach in one sheet, riding the RENDERED terrain,
    // solid through the beach band and blending into the ground at the top
    // with a noise-wandered edge — the shallow river's sandFade, radially
    const sand = polar(name + "_bed",
      (x, z, d, ang) => {
        const bed = bedR(ang);
        const wob = (fbm(x / 5.3 + 4, z / 5.3 + 4) - 0.5) * 1.2;
        return {
          y: bedY(x, z),
          a: 1 - smooth(Math.min(1, Math.max(0, (d + wob - (bed + 3.0)) / (RUN - 1.5)))),
          c: Color3.Lerp(c1, c2, fbm(x / 17 + 5, z / 17 + 5)),
        };
      },
      vigGroundSheet("riversand", "aerial_beach_01"), 1, 9);
    sand.receiveShadows = true;
    pavings.push(sand); // its beach is a floor where it shows (see pavingHeight)

    // the waterline, PER-PIXEL in polar strip space — the river's opacity
    // texture bent into a ring (angular U wraps, radial V clamps): analytic
    // profile clearance wobbled so the harmonic shore does not read as
    // drawn, times the soft 5-tap coverage clamp that turns real bumps into
    // sandbars instead of z-cuts
    const tap = Math.max(0.9, ((ZONES[currentZone]?.size ?? 520) / 150) * 0.6);
    const TW = 512, TH = 128;
    const op = new DynamicTexture(name + "_op", { width: TW, height: TH }, scene, false);
    op.wrapU = Texture.WRAP_ADDRESSMODE;
    op.wrapV = Texture.CLAMP_ADDRESSMODE;
    const octx = op.getContext() as unknown as CanvasRenderingContext2D;
    const img = octx.createImageData(TW, TH);
    for (let ty = 0; ty < TH; ty++) {
      const d = (ty / (TH - 1)) * DMAX;
      for (let tx = 0; tx < TW; tx++) {
        const ang = (tx / TW) * Math.PI * 2;
        const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
        const wob = (fbm(x / 3.7 + 9, z / 3.7 + 9) - 0.5) * 1.2;
        const aProf = smooth(Math.min(1, Math.max(0,
          (WATER - profile(d + wob, bedR(ang))) / 0.3)));
        const bs = (bedY(x, z)
          + bedY(x + tap, z) + bedY(x - tap, z)
          + bedY(x, z + tap) + bedY(x, z - tap)) / 5;
        const a = aProf * smooth(Math.min(1, Math.max(0, (lv - bs) / 0.3)));
        const o = (ty * TW + tx) * 4;
        const v = Math.round(255 * a);
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
        img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    op.update(false);
    const wmat = makeClearWaterMat(name + "wm", opts.color ?? RIVER_WATER, 1, opts.refl ?? 1);
    wmat.opacityTexture = op;
    (wmat.opacityTexture as Texture).getAlphaFromRGB = true;
    const maxA = opts.maxAlpha ?? 0.82;
    polar(name,
      (x, z) => {
        const depth = Math.max(0, lv - heightFn(x, z));
        return {
          y: lv,
          // full colour a little before full depth, the Mere's measurement
          a: 0.12 + (maxA - 0.12) * smooth(Math.min(1, depth / (WATER * 1.6))),
        };
      },
      wmat, 2);
  };

  return { carve, build, level , shore: rAt };
}

// Philip uses "pond" and "small lake" interchangeably; so does the code.
export const makeSmallLake = makePond;

// ---------- bridges ----------

// The small bridge: ONE builder for every footbridge over a river or canal,
// the way makeRiver is one builder for every river. Philip's standing spec,
// settled on the Canalworks crossing (WATER.md) -- every small bridge is
// built by this and looks like that one.
//
// The shape is not stylistic; each part of it is a fault that was found and
// fixed on that bridge, in this order:
//
//   * It STANDS PROUD of the ground and reaches grade by STEPS. A deck seated
//     on the higher bank left its other end hanging over its own ground; a
//     deck seated on the lower bank buried both ends but sank the walking
//     surface below the field. Raised-plus-steps needs neither compromise.
//   * Each end sits on an ABUTMENT in the deck's own timber. Without one the
//     deck's last few metres run from the outermost post to the end with
//     nothing under them, so the end juts over a void and the top step meets
//     it at a corner only (Philip: "connected by a tiny touch").
//   * The RAILS stop at the span. Run to the ends of the steps they read as
//     two fences walking away from the bridge rather than as its handrails.
//   * The deck AND every step tread get their own flatZone. This is the
//     load-bearing part and the one with nothing to see: a deep river
//     registers water bodies that fail the depth rule, so a deck the
//     walkability grid has not been told about is scenery and the player
//     still cannot cross -- and an unregistered 0.32m tread is a cliff to
//     that same grid, so the crossing would refuse at the kerb for a reason
//     nothing on screen explains.
//   * Timber is dark_wooden_planks, not the Moonmere piers' wood_floor_worn:
//     on a 0.4m-thick box the side faces sample a 0.24-high strip of that
//     sheet and come back bright orange.
//
// `length` must carry the deck PAST both bank crests onto solid ground -- for
// a makeRiver channel that is 2*(half + bankRun) plus a margin, so a default
// deep river (half 6, bank run 4.2) wants ~26. Landing on the bank slope
// instead is what the abutments cannot save.
//
// axis, not a free rotation, and deliberately: flatZones are axis-aligned
// rectangles, so a bridge at 30 degrees could not be made walkable at all.
// The Moonmere piers pick their long axis the same way.
export function makeSmallBridge(
  name: string,
  cx: number, cz: number,
  opts: {
    length?: number;    // end to end, across the channel (default 26)
    width?: number;     // deck width (default 4.4)
    axis?: "x" | "z";   // which way the deck RUNS (default "x")
    lift?: number;      // deck height above the higher bank (default 1.2)
    material?: StandardMaterial;
    structure?: "timber" | "grown"; // grown bridges supply their own root supports and rails
  } = {},
): void {
  const len = opts.length ?? 26, wid = opts.width ?? 4.4;
  const half = len / 2;
  const axis = opts.axis ?? "x";
  const m = opts.material ?? texMat("smbridge", "dark_wooden_planks");

  // along = across the channel, across = the deck's width. One mapping, so
  // every piece below is written once instead of twice.
  const at = (along: number, across: number): [number, number] =>
    axis === "x" ? [cx + along, cz + across] : [cx + across, cz + along];
  const dim = (along: number, across: number): [number, number] =>
    axis === "x" ? [along, across] : [across, along];
  const zone = (a0: number, a1: number) => {
    const [x0, z0] = at(Math.min(a0, a1), -wid / 2);
    const [x1, z1] = at(Math.max(a0, a1), wid / 2);
    return { x0, x1, z0, z1 };
  };

  const [ax, az] = at(-half, 0), [bx, bz] = at(half, 0);
  const gA = heightFn(ax, az), gB = heightFn(bx, bz);
  // above the HIGHER bank, so the deck stands over the ground from both
  // approaches rather than level with one and sunk into the other
  const y = Math.max(gA, gB) + (opts.lift ?? 1.2);
  const top = y + 0.2;                       // the walking surface

  const [dw, dd] = dim(len, wid);
  const deck = tbox(name, dw, 0.4, dd, m, 1.7);
  deck.position.set(cx, y, cz);
  flatZones.push({ ...zone(-half, half), y: top + 0.05 });
  recordFootprint(cx, cz, dw, dd);

  // posts into the channel. Fractions of the half-span, not fixed metres, so
  // they stay spread across the water at any length.
  if (opts.structure !== "grown") ([-0.58, -0.23, 0.23, 0.58]).forEach((f, i) => {
    [-1, 1].forEach((side) => {
      // long enough that the surplus buries in the bed rather than ending in
      // mid-water, the way the piers' posts do
      const post = MeshBuilder.CreateCylinder(`${name}p${i}_${side}`, { height: 11, diameter: 0.5 }, scene);
      const [px, pz] = at(half * f, side * (wid / 2 - 0.4));
      post.position.set(px, y - 5.6, pz);
      post.material = m;
      post.isPickable = false;
    });
  });

  // the abutment under each end, carrying the deck into the bank
  if (opts.structure !== "grown") ([-1, 1] as number[]).forEach((side) => {
    const [abw, abd] = dim(4.0, wid);
    const [px, pz] = at(side * (half - 2.0), 0);
    vigBoxAt(`${name}ab${side}`, abw, 6.0, abd, m, px, y - 3.2, pz);
  });

  // a rail down each side, over the span only
  if (opts.structure !== "grown") ([-1, 1] as number[]).forEach((side) => {
    const [rw, rd] = dim(len, 0.25);
    const [px, pz] = at(0, side * (wid / 2 - 0.1));
    vigBoxAt(`${name}r${side}`, rw, 0.9, rd, m, px, y + 0.65, pz);
  });

  // The steps down to grade. Each tread is a DEEP box whose TOP face is the
  // step: the surplus below it buries in the bank, so a flight on sloping
  // ground never shows daylight under its treads.
  ([-1, 1] as number[]).forEach((side) => {
    const g = side < 0 ? gA : gB;
    const n = Math.max(2, Math.round((top - g) / 0.32));
    for (let i = 1; i <= n; i++) {
      const ty = top - (top - g) * (i / n);            // this tread's top
      const a0 = side * (half + (i - 1) * 1.1), a1 = side * (half + i * 1.1);
      const [sw, sd] = dim(1.1, wid);
      const [px, pz] = at((a0 + a1) / 2, 0);
      vigBoxAt(`${name}s${side}_${i}`, sw, 2.6, sd, m, px, ty - 1.3, pz);
      flatZones.push({ ...zone(a0, a1), y: ty + 0.05 });
    }
  });
  // the map draws the bridge end to end, its steps down to grade included
  // (the deck's footprint alone drew a 34 m bridge 26 m long on the Canal
  // Works' map). Map only: the deck's footprint is the keep-off it always was
  const steps = (g: number) => Math.max(2, Math.round((top - g) / 0.32)) * 1.1;
  const a0 = -half - steps(gA), a1 = half + steps(gB);
  const [ex, ez] = at((a0 + a1) / 2, 0), [ew, ed] = dim(a1 - a0, wid);
  addMapOnlyFootprint(ex, ez, ew, ed);
}

// A road that crosses water keeps its Road whole (the height function and
// roadDist want the crossing) but is DRAWN in two ribbons that stop at the
// banks, or a sand path runs under the deck (Philip, Heartwood Fields:
// "under the bridge, there is a sand path instead of a river"). `axis` is
// the deck's, the road's direction at the crossing; `gap` is how far from
// the bridge's centre each ribbon ends, 11 = just short of a 26m deck's
// steps. Returns [near, far] in the road's own order, each ending or
// beginning on the bridge's line so the ribbon meets the deck square.
export function splitRoadAtBridge(
  pts: [number, number][], bx: number, bz: number, axis: "x" | "z", gap = 11,
): [[number, number][], [number, number][]] {
  const i = axis === "x" ? 0 : 1, c = axis === "x" ? bx : bz;
  const end = (a: number): [number, number] => axis === "x" ? [a, bz] : [bx, a];
  const lo = pts.filter((p) => p[i] < c - gap), hi = pts.filter((p) => p[i] > c + gap);
  // the road may run either way along the axis; keep its order
  const first = pts[0][i] < c ? lo : hi, second = first === lo ? hi : lo;
  const s = first === lo ? -1 : 1;
  return [[...first, end(c + s * gap)], [end(c - s * gap), ...second]];
}

/**
 * A GLOW OCCLUDER: solid boxes the glow layer draws black, and nothing else
 * does. The glow layer draws every mesh in view a second time only so that what
 * glows behind it stays hidden (thinEffectLayer: the non-glowing are drawn
 * black, with depth), and a city's houses and walls were most of that pass --
 * in the Capital 290 of its 372 draws at the gate, by day, when nothing in the
 * street glows at all (MEASURED). A zone that takes such meshes out of the pass
 * (GlowLayer.addExcludedMesh) puts their volume back here as one merged mesh:
 * one draw for a whole district. The boxes must stand INSIDE what they stand
 * for, so the proxy never hides a lit window or a lamp on its surface.
 *
 * In the main pass it writes neither colour nor depth (one empty draw); the
 * glow layer's per-mesh hook turns both back on for its own draw only. No
 * shadow, no picking, no meadow footprint: it is not there.
 */
export interface OccluderBox { cx: number; cz: number; hx: number; hz: number; y0: number; y1: number; yaw?: number }
export function glowOccluder(name: string, boxes: OccluderBox[]): Mesh | null {
  const layer = glow;
  if (!layer || !scene.effectLayers.includes(layer) || !boxes.length) return null;
  const positions: number[] = [], indices: number[] = [];
  // the twelve triangles of a box, outward-wound over its eight corners
  const FACES = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  for (const b of boxes) {
    if (b.hx <= 0 || b.hz <= 0 || b.y1 <= b.y0) continue;
    const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0), base = positions.length / 3;
    for (const y of [b.y0, b.y1]) for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = u * b.hx, lz = v * b.hz;
      positions.push(b.cx + lx * c + lz * s, y, b.cz - lx * s + lz * c);
    }
    for (const f of FACES) indices.push(base + f);
  }
  if (!indices.length) return null;
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial(`${name}_m`, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.emissiveColor = Color3.Black();
  // both faces: a box seen from inside (the camera pushed into a wall) still hides
  m.backFaceCulling = false;
  m.disableColorWrite = true; m.disableDepthWrite = true;
  mesh.material = m;
  // a dungeon's glow pass draws emitters and these only (glowOnlyEmitters)
  mesh.metadata = { glowOccluder: true };
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.freezeWorldMatrix();
  const on = layer.onBeforeRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = false; m.disableDepthWrite = false; } });
  const off = layer.onAfterRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = true; m.disableDepthWrite = true; } });
  mesh.onDisposeObservable.addOnce(() => {
    layer.onBeforeRenderMeshToEffect.remove(on);
    layer.onAfterRenderMeshToEffect.remove(off);
    m.dispose();
  });
  return mesh;
}

/**
 * A GLOW OCCLUDER of the triangles the caller supplies (draw-merge.ts
 * flattenKit's kitglow_ copies, heartwood-city-build.ts glowProxies): where
 * the sun and the moon glow, a box proxy would hide or leak their bloom
 * wherever it is not the surface, so flattenKit hands it the excluded meshes'
 * own float32 world positions and glowProxies coarse stand-ins inside the
 * surfaces they replace, drawn black with depth as the glow layer drew them. Same
 * material, hooks and lifetime as glowOccluder.
 *
 * Unlike glowOccluder it is never drawn outside the glow layer. Its render()
 * is what the main pass (and any other target) calls; the glow layer binds and
 * draws the geometry itself (thinEffectLayer _renderSubMesh), so a no-op there
 * leaves its draw alone. An "empty" main-pass draw with colour and depth writes
 * off still transforms and rasterizes every triangle at full resolution: 1-2.5
 * ms of synced frame per Heartwood camera (MEASURED 2026-10-06, in page,
 * Chromium) for six million triangles, where glowOccluder's boxes cost nothing.
 *
 * The CPU copy of its data is released after upload: nothing picks, collides
 * with or re-reads it.
 */
export function glowOccluderMesh(name: string, positions: Float32Array, indices: Uint32Array): Mesh | null {
  const layer = glow;
  if (!layer || !scene.effectLayers.includes(layer) || !indices.length) return null;
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial(`${name}_m`, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.emissiveColor = Color3.Black();
  m.backFaceCulling = false;
  m.disableColorWrite = true; m.disableDepthWrite = true;
  mesh.material = m;
  // a dungeon's glow pass draws emitters and these only (glowOnlyEmitters)
  mesh.metadata = { glowOccluder: true };
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.freezeWorldMatrix();
  mesh.render = () => mesh;
  const on = layer.onBeforeRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = false; m.disableDepthWrite = false; } });
  const off = layer.onAfterRenderMeshToEffect.add((x) => { if (x === mesh) { m.disableColorWrite = true; m.disableDepthWrite = true; } });
  mesh.onDisposeObservable.addOnce(() => {
    layer.onBeforeRenderMeshToEffect.remove(on);
    layer.onAfterRenderMeshToEffect.remove(off);
    m.dispose();
  });
  mesh.geometry?.clearCachedData();
  return mesh;
}

export function removeShadowCaster(m: AbstractMesh | null): void {
  if (m && shadowGen) shadowGen.removeShadowCaster(m as any);
}

// Dev-only inspection hook: the client is ES modules, so there is no BABYLON
// global to poke at from the console or a driven browser. Gated on DEV, so it
// never reaches a build.
export function __debugState(): unknown {
  const g = shadowGen as any;
  const ground = scene?.meshes.find((m) => m.name === "ground") as any;
  return {
    zone: currentZone,
    fogMode: scene?.fogMode,
    lights: scene?.lights.map((l: any) => ({
      name: l.name, kind: l.getClassName(), intensity: +l.intensity.toFixed(2),
      shadowGens: l.getShadowGenerators ? (l.getShadowGenerators()?.size ?? 0) : 0,
    })),
    ground: ground ? { receiveShadows: ground.receiveShadows, mat: ground.material?.getClassName() } : null,
    shadowGen: g ? {
      mapSize: g.mapSize, darkness: g.darkness, numCascades: g.numCascades,
      shadowMaxZ: g.shadowMaxZ, bias: g.bias, normalBias: g.normalBias,
      autoCalcDepthBounds: g.autoCalcDepthBounds,
      casters: g.getShadowMap?.()?.renderList?.length ?? -1,
    } : null,
  };
}

export function addShadowCaster(m: AbstractMesh | null): void {
  if (!m || !shadowGen) return;
  try { shadowGen.addShadowCaster(m, true); m.receiveShadows = true; } catch { /* disposed */ }
}

function registerNightLight(light: PointLight, base: number): void {
  nightLights.push({ light, base });
}

// ---------- materials ----------
// `glow` is the opt-in into the GlowLayer (see setupGlow). It is deliberately
// separate from `emissive`: emissive is a SHADING term (self-illumination on
// the surface itself), glow is a BLOOM term (light bleeding past the
// silhouette). Most emissives here are neither — they lift a surface out of
// shadow, which is the environment map's job, not the glow layer's.
function mat(name: string, hex: string, opts: { emissive?: string; alpha?: number; spec?: number; glow?: number } = {}): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.maxSimultaneousLights = 8;
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(opts.spec ?? 0.03, opts.spec ?? 0.03, opts.spec ?? 0.03);
  if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  if (opts.glow) m.metadata = { ...(m.metadata || {}), glow: opts.glow };
  return m;
}


// ---------- shared look setup ----------
// Image-based lighting. Babylon's PBRMaterial (which is what every glTF in
// models/ loads as) has NO ambient term without an environment texture: with
// only the hemi + one directional it renders as flat plastic, because the
// whole indirect half of the BRDF evaluates to black. One CC0 equirect,
// prefiltered on load, is what makes the KayKit bodies read as lit objects.
//
// The HDR is 1k on disk but only ever prefiltered to a 128px cube — this feeds
// lighting, not the sky (the dome in buildSky owns what you actually see), so
// resolution past that buys nothing. Scenes are rebuilt per zone, so this runs
// again on every zone change; the file comes from the browser cache and the
// prefilter is a single small GPU pass.
function setupEnvironment(intensity: number): void {
  const hdr = new HDRCubeTexture("/env/sky_1k.hdr", scene, 128, false, true, false, true);
  scene.environmentTexture = hdr;
  scene.environmentIntensity = intensity;
}

// ACES filmic tone mapping. Without it the renderer writes linear radiance
// straight to an 8-bit display: anything above 1.0 clips flat, which is why
// lit surfaces lose their highlight rolloff and read as posterized. ACES is
// also what makes the glow layer's untonemapped contribution legible as
// light rather than as a white blob.
function setupToneMapping(ipc: ImageProcessingConfiguration): void {
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  // ACES desaturates as it compresses — that is correct for photographic
  // footage and wrong for a stylized world, so the curve buys the colour back.
  // Ardenfell in the lamplight is meant to read saturated and warm (LORE.md).
  const curves = new ColorCurves();
  // 62 was too hot: it pushed Caerdun's neutral-grey cobbles to violet, because
  // saturation amplifies whatever tint the blue sky IBL leaves on a grey. Keep
  // the lift modest and let the warm highlight tint do the mood work instead.
  curves.globalSaturation = 34;
  curves.highlightsHue = 30;
  curves.highlightsDensity = 18;
  ipc.colorCurves = curves;
  ipc.colorCurvesEnabled = true;
}

// The GlowLayer's membership is OPT-IN, via `metadata.glow` (see mat()).
//
// Babylon enrolls every mesh whose material has a non-black emissiveColor,
// which silently swept in ~a dozen materials that set a near-black emissive as
// fake ambient (moss, unlit windows, sap, dead braziers). Those cost a full
// pass through the glow RTT every frame and contributed nothing. Worse, the
// layer reads material.emissiveColor RAW — no exposure, no tone mapping (see
// thinGlowLayer's _emissiveTextureAndColor) — so once ACES landed they would
// have been the only thing in frame not rolled off.
//
// The selector also gives per-emitter strength, which glow.intensity alone
// cannot: a lantern can push hard while a window pane stays subtle.
function setupGlow(intensity: number): void {
  glow = new GlowLayer("glow", scene);
  glow.intensity = intensity;
  glow.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => {
    const strength = (material?.metadata as { glow?: number } | undefined)?.glow;
    if (!strength) { result.set(0, 0, 0, 1); return; }
    const e = (material as StandardMaterial).emissiveColor;
    if (!e) { result.set(0, 0, 0, 1); return; }
    result.set(e.r * strength, e.g * strength, e.b * strength, 1);
  };
}

// PER-CASCADE CULLING. Babylon draws every shadow caster into every cascade:
// a render target's render list is never frustum-culled (ObjectRenderer.
// _prepareRenderingManager tests readiness and visibility only), so a city's
// walls 300 m behind the camera still went into the first cascade's 20 m map
// (MEASURED in the Capital's gate: 876 of its 1,233 shadow draws were the
// kit's 290 wall submeshes three times over, at every camera). Each cascade
// keeps only the casters whose world box reaches its light-space rectangle:
// the four SIDE planes of the cascade's own view-projection, which are exact
// (a caster outside them cannot write a texel of that map). Not the near and
// far planes -- with depth clamping on, a caster between the light and the
// cascade still shadows it. A metre of margin for boxes that lag their mesh
// (skinned bodies keep their bind-pose box), and what the main camera always
// selects (moving buffers, rigs) always casts. One reused list per cascade:
// this runs three times a frame and allocates nothing.
function cullCascades(gen: CascadedShadowGenerator): void {
  const planes: Plane[] = Frustum.GetPlanes(Matrix.Identity());
  const lists: AbstractMesh[][] = [];
  const MARGIN = 1;
  const reaches = (mesh: AbstractMesh): boolean => {
    if (mesh.alwaysSelectAsActiveMesh || mesh.infiniteDistance) return true;
    const v = mesh.getBoundingInfo().boundingBox.vectorsWorld;
    for (let p = 2; p < 6; p++) {
      const pl = planes[p];
      let k = 0;
      for (; k < 8; k++) if (pl.dotCoordinate(v[k]) > -MARGIN) break;
      if (k === 8) return false;   // every corner behind this side: not in the map
    }
    return true;
  };
  const cull = (layer: number, list: Nullable<readonly AbstractMesh[]>, len: number): AbstractMesh[] | null => {
    const m = gen.getCascadeTransformMatrix(layer);
    // before the first cascade matrices (a readiness check), the whole list
    if (!m || !list || m.m[15] === 0) return null;
    Frustum.GetPlanesToRef(m, planes);
    const out = lists[layer] ?? (lists[layer] = []);
    out.length = 0;
    for (let i = 0; i < len; i++) { const mesh = list[i]; if (mesh && reaches(mesh)) out.push(mesh); }
    return out;
  };
  // a zone that sets numCascades (Caerdun, Moonmere: two) makes the generator
  // build a new shadow map, which would arrive without the hook: re-attach it
  // whenever the map is not the one that has it
  const light = gen.getLight(), owner = light.getScene();
  const attach = () => {
    const map = gen.getShadowMap();
    if (map && map.getCustomRenderList !== cull) map.getCustomRenderList = cull;
  };
  attach();
  const o = owner.onBeforeRenderObservable.add(attach);
  light.onDisposeObservable.addOnce(() => owner.onBeforeRenderObservable.remove(o));
}

// These are reusable only inside their owning scene. Disposing a scene must
// release the lazy caches even when its successor never uses that feature.
function ownSceneCaches(owner: Scene): void {
  owner.onDisposeObservable.addOnce(() => {
    if (boxIndex?.scene === owner) boxIndex = null;
    if (fxGroupFor === owner) fxGroupFor = null;
    if (shimmerTickFor === owner) { shimmerTickFor = null; shimmers = []; }
    for (const [key, material] of pathMats) if (material.getScene() === owner) pathMats.delete(key);
    for (const [key, mesh] of tintedTemplates) if (mesh.getScene() === owner) tintedTemplates.delete(key);
    if (flakeTexCache?.getScene() === owner) flakeTexCache = null;
    if (snowSheetCache?.getScene() === owner) snowSheetCache = null;
    if (cliffSheetCache?.getScene() === owner) cliffSheetCache = null;
    if (flameTexCache?.getScene() === owner) flameTexCache = null;
    for (const [key, crystal] of crystals) if (crystal.body.getScene() === owner) crystals.delete(key);
    for (const [key, door] of questDoors) if (door.root?.getScene() === owner) questDoors.delete(key);
    for (let i = worldObjects.length - 1; i >= 0; i--) if (worldObjects[i].mesh?.getScene() === owner) worldObjects.splice(i, 1);
    for (let i = washMats.length - 1; i >= 0; i--) if (washMats[i].tex.getScene() === owner) washMats.splice(i, 1);
    for (let i = clearWaterMats.length - 1; i >= 0; i--) if (clearWaterMats[i].m.getScene() === owner) clearWaterMats.splice(i, 1);
    for (let i = nightLights.length - 1; i >= 0; i--) if (nightLights[i].light.getScene() === owner) nightLights.splice(i, 1);
    for (let i = nightBoosts.length - 1; i >= 0; i--) if (nightBoosts[i].light.getScene() === owner) nightBoosts.splice(i, 1);
    for (let i = nightRamps.length - 1; i >= 0; i--) if (nightRamps[i].m.getScene() === owner) nightRamps.splice(i, 1);
    if (hemiLight?.getScene() === owner) hemiLight = null;
    if (celestial?.getScene() === owner) celestial = null;
    if (shadowGen?.getLight().getScene() === owner) shadowGen = null;
    if (nightDome?.getScene() === owner) nightDome = null;
    if (dayDome?.getScene() === owner) dayDome = null;
    if (sunDisc?.getScene() === owner) sunDisc = null;
    if (moonDisc?.getScene() === owner) moonDisc = null;
    if (afterglowMesh?.getScene() === owner) afterglowMesh = null;
    // the build-time lookups: the terrain's samples name their scene, and the
    // level indexes would otherwise hold the departed zone's decks
    if (terrainSamples?.scene === owner) terrainSamples = null;
    deckIdx = rampIdx = stairIdx = null;
  });
}

// ---------- engine ----------
// screenshots: preserveDrawingBuffer keeps the colour buffer readable after a
// frame, which canvas.toDataURL needs. Off in the game (it costs a copy per
// frame) and on in ?zone, where annotate.ts grabs the view for each note.
//
// A lost WebGL context rebuilds the scene; Babylon does not restore it in
// place. Its own recovery re-uploads every texture from a CPU copy it keeps of
// each (Texture/InternalTexture._buffer), ~13 MB per dressed character and
// ~170 MB with Caerdun's first ten residents (MEASURED 2026-10-13); Philip
// ruled that a zone rebuild on the rare lost context is worth that
// (2026-10-13), so doNotHandleContextLost stops the copies. The live game
// registers its zone entry (onGpuReset); every other page reloads.
let gpuReset: () => Promise<unknown> | void = () => location.reload();
export function onGpuReset(rebuild: () => Promise<unknown> | void): void { gpuReset = rebuild; }
export function initEngine(canvas: HTMLCanvasElement, screenshots = false): void {
  installBabylonEffectOwnershipFix();
  engine = new Engine(canvas, true, { adaptToDeviceRatio: true, preserveDrawingBuffer: screenshots, doNotHandleContextLost: true });
  const gl = engine as unknown as { _contextWasLost: boolean; _initGLContext(): void; _clearEmptyResources(): void; _rebuildGraphicsResources(): void };
  // preventDefault is what lets the browser restore the context at all; the
  // flag stops the render loop until the scene is rebuilt. The old scenes'
  // buffers and textures have nothing to restore from, so they go now, while
  // their GL objects still belong to the context being deleted.
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault(); gl._contextWasLost = true;
    [...engine.scenes].forEach((s) => s.dispose());
  });
  canvas.addEventListener("webglcontextrestored", () => {
    // the engine rebuilds only its own state (shaders recompile from source)
    // before the page builds a new scene on it
    gl._clearEmptyResources(); gl._initGLContext(); gl._rebuildGraphicsResources();
    void Promise.resolve(gpuReset()).finally(() => { gl._contextWasLost = false; });
  });
  window.addEventListener("resize", () => engine.resize());
}

// A bare scene for the race lineup (see lineup.ts): flat grey ground, even
// light, no fog, no vignette, no zone. Everything that makes the game look
// like the game also makes it a bad place to judge a silhouette, so none of
// it is here.
// A coastal art study can provide its depth field; the normal lineup stays flat.
export function buildLineupScene(studyHeight: (x: number, z: number) => number = () => 0): void {
  currentZone = "";
  heightFn = studyHeight;
  flatZones.length = 0;
  resetTowerProbes();
  colliders.length = 0;
  circleColliders.length = 0;
  boxColliders.length = 0;
  decks.length = 0; ramps.length = 0; stairBodies.length=0;
  pavings.length = 0;
  if (scene) scene.dispose();
  scene = new Scene(engine);
  ownSceneCaches(scene);
  scene.clearColor = Color4.FromHexString("#20242eff");
  setupGlow(0.3);
  // The lineup judges how a body reads, so it must shade it the way the game
  // does — same env map, same tone curve. It still drops fog, vignette and
  // zone dressing, which are what actually hide a silhouette.
  setupEnvironment(0.45);
  setupToneMapping(scene.imageProcessingConfiguration);

  hemiLight = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemiLight.intensity = 0.45;
  hemiLight.diffuse = Color3.FromHexString("#ffffff");
  hemiLight.groundColor = Color3.FromHexString("#5a5f70");

  // one key light, high and to the side, so the forms read in relief instead
  // of flattening out the way pure ambient would
  const key = new DirectionalLight("key", new Vector3(-0.45, -1, 0.35), scene);
  key.intensity = 1.5;
  key.position = new Vector3(14, 26, -12);
  shadowGen = new CascadedShadowGenerator(1024, key);
  shadowGen.numCascades = 2;
  shadowGen.bias = 0.01;
  shadowGen.normalBias = 0.02;
  shadowGen.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
  shadowGen.usePercentageCloserFiltering = true;

  const ground = MeshBuilder.CreateGround("lineup_ground", { width: 90, height: 90 }, scene);
  const gm = new StandardMaterial("lineup_gm", scene);
  gm.diffuseColor = Color3.FromHexString("#3a3f4b");
  gm.specularColor = new Color3(0.02, 0.02, 0.02);
  ground.material = gm;
  ground.receiveShadows = true;
  ground.isPickable = false;
}

export function buildZone(zoneKey: string): void {
  questDoors.clear();
  borderGates.clear();
  resetPlaceGroups();
  currentZone = zoneKey;
  worldObjects.length = 0;
  washMats.length = 0;
  clearWaterMats.length = 0;
  tintedTemplates.clear(); // cloned templates belong to the disposed scene
  colliders.length = 0;
  circleColliders.length = 0;
  boxColliders.length = 0;
  decks.length = 0; ramps.length = 0; stairBodies.length=0;
  pavings.length = 0;
  fpZone = zoneKey;
  zoneFootprints[zoneKey] = [];
  zoneMapLayers[zoneKey] = { roads: [], waters: [] };
  flatZones.length = 0;
  lastCauseway = null;   // (MOONMERE.md A-14: the Shores' module reads only this build's causeway)
  resetTowerProbes();
  cameraRooms.length = 0;
  waterBodies = [];
  liquidBarriers = [];
  vegExclusions = [];
  scatterExclusions = [];
  disposeGrass();
  // a crystal's shrine is a built platform: nothing grows through it or is
  // scattered onto it, whichever scatter runs
  crystalSpots = ((ZONES[zoneKey].milestones as any[]) || []).map((m: any) => ({ x: m.x, z: m.z }));
  vegExclusions.push((x, z) => nearCrystal(x, z));
  scatterExclusions.push((x, z) => nearCrystal(x, z));
  vegGen++;
  // portals must stay reachable even on steep ground
  slopeExempt = ((ZONES[zoneKey].portals as any[]) || []).map((p: any) => ({ x: p.x, z: p.z, r: 16 }));
  if (scene) scene.dispose();
  scene = new Scene(engine);
  ownSceneCaches(scene);
  scene.clearColor = Color4.FromHexString("#1a2340ff");
  setupGlow(0.5);
  setupEnvironment(0.45);

  // filmic touch: gentle contrast + cool vignette
  const ipc = scene.imageProcessingConfiguration;
  setupToneMapping(ipc);
  ipc.contrast = 1.18;
  ipc.exposure = 1.06;
  ipc.vignetteEnabled = true;
  ipc.vignetteWeight = 1.05;
  ipc.vignetteColor = Color4.FromHexString("#141a2eff");

  const def = ZONES[zoneKey];
  const size = def.size;
  const isCity = def.kind === "city";
  const isDungeon = def.kind === "dungeon";
  // A dungeon is ENCLOSED unless its module declares `outdoor`: then the parts
  // open to the air see the parent zone's baked land under the game's sky at a
  // fixed hour (dungeon-backdrop.ts). In dev, ?outdoor shows a dungeon's
  // dungeon-backdrops.json bake before its module opts in.
  const dmod = isDungeon ? ZONE_MODULES[zoneKey] : undefined;
  // (?outdoor=windows: the same bake, but only for windows; the dungeon stays enclosed)
  const devOutdoor = import.meta.env.DEV ? new URLSearchParams(location.search).get("outdoor") : null;
  const resolved = isDungeon ? resolveOutdoor(zoneKey, dmod?.outdoor, devOutdoor !== null) : null;
  const outdoor = resolved && devOutdoor === "windows" ? { ...resolved, mode: "windows" as const } : resolved;
  const openAir = !!outdoor && outdoor.mode !== "windows";
  zoneDayPin = openAir ? outdoor!.time ?? 0.3 : null;
  setCurrentBackdrop(scene, zoneKey, outdoor);

  heightFn = isDungeon ? (x,z) => ZONE_MODULES[zoneKey]?.height?.(x,z,0)??0
    : zoneKey === "moonmere" ? mere2Height()
    : zoneKey === "heartwood" ? heartwood2Height()
    : fieldHeight(zoneKey);

  // fog: thinner outdoors now, so mountains and vistas read at distance
  // Outdoors runs UNFOGGED: the wold is meant to read clear and colourful, and
  // fog was flattening every distant tree and the whole mountain ring to one
  // wash (it is why the ranges went pink at dusk). Dungeons keep their fog --
  // that is what makes them read as enclosed.
  scene.fogMode = isDungeon ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
  // thin: at 0.0030 the mid-field tree line sat ~45% blended into light fog,
  // which reads as a white overlay on dark foliage
  // (an open-air dungeon's air is a field's, thinner than a hall's: its land is
  // the panorama, hazed by this fog to the skirt's far edge)
  scene.fogDensity = isDungeon && !openAir ? 0.015 : openAir ? 0.0016 : isCity ? 0.0022 : 0.0016;
  fogNight = Color3.FromHexString(
    isDungeon && !openAir ? "#0d0c13" : "#262c42");
  // deep enough not to read as a white film over the now-dark canopies
  fogDay = Color3.Lerp(fogNight, Color3.FromHexString("#93a9ce"), 0.82);
  scene.fogColor = fogNight.clone();

  hemiBase = isDungeon && !openAir ? 0.42 : .6;
  hemiLight = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemiLight.intensity = isDungeon ? 0.62 : 0.6; // kit PBR stone needs more ambient than the old flat primitives
  hemiLight.diffuse = Color3.FromHexString("#aab2d4");
  hemiLight.groundColor = Color3.FromHexString("#4a4258");

  celestial = new DirectionalLight("celestial", new Vector3(-0.4, -1, 0.3), scene);
  celestial.intensity = isDungeon ? 0.32 : 0.75;
  celestial.diffuse = Color3.FromHexString("#bcc6e8");

  nightDome = dayDome = sunDisc = moonDisc = afterglowMesh = null;
  // an open-air dungeon has its parent's weather: the panorama was baked under it
  overcastSky = !!WILDS_THEMES[openAir ? outdoor!.parent : zoneKey]?.overcast;
  nightLights = [];
  nightBoosts = [];
  nightRamps = [];
  nightBase = null;
  shadowGen = null;
  if (!isDungeon) {
    // the sun (and moon) cast true shadows
    // 2048 and three cascades: the tier-on-tier self-shadow that gives a
    // Quaternius conifer its layered read is roughly a metre of separation, and
    // 1024 over two cascades put barely a dozen texels on that. Bias comes down
    // hard for the same reason -- normalBias 0.02 pushes the sample far enough
    // along the normal to erase contact shadows on thin leaf cards entirely,
    // which is exactly why the canopies were reading as flat green blobs.
    shadowGen = new CascadedShadowGenerator(2048, celestial);
    shadowGen.numCascades = 3;
    shadowGen.lambda = 0.8;
    shadowGen.shadowMaxZ = 150;
    shadowGen.autoCalcDepthBounds = true;
    shadowGen.bias = 0.002;
    shadowGen.normalBias = 0.004;
    shadowGen.darkness = 0.0; // full shadow; ambient below is the fill
    shadowGen.transparencyShadow = true; // foliage cards shadow by their leaf alpha, not their quad
    shadowGen.stabilizeCascades = true;
    shadowGen.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
    shadowGen.usePercentageCloserFiltering = true;
    cullCascades(shadowGen);
    scene.onBeforeRenderObservable.add(() => updateDayNight(scene.getEngine().getDeltaTime()));
    updateDayNight(16);
  }

  scene.onBeforeRenderObservable.add(() => {
    if (!washMats.length) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (const w of washMats) {
      w.t += dt;
      // sin, not a saw: the wash decelerates as it runs out and again at the
      // bottom of the draw-back, which is what makes it read as water rather
      // than as a texture on a conveyor
      w.tex.vOffset = Math.sin(w.t * w.rate) * WASH_THROW;
      // and a slow lateral drift, so the foam does not break in the same
      // places on every stroke
      w.tex.uOffset = (w.tex.uOffset + dt * 0.011) % 1;
    }
  });

  buildSky(isDungeon && !openAir);
  // a fixed hour: the day/night step runs once, here, not every frame
  if (openAir) { updateDayNight(16); turnDungeonSky(outdoor!.dir ?? 0); }
  buildTerrain(zoneKey, size, isDungeon);
  // the 340 m ground plane is never part of a dungeon: an enclosed one is its
  // own floors, an open-air one stands on its skirt. Hidden, not disabled, so
  // the ?zone annotator can still pick it.
  const dclear = isDungeon ? enclosedDungeonView() : null;

  // NOT inside buildGenericWilds with the Shores' signature: that function
  // returns immediately for a zone with no WILDS_THEMES entry, and Moonmere is
  // a city with none, so a hook in there never runs and the island builds with
  // no sea around it.
  if (zoneKey === "heartwood") buildHeartwood2();
  if (WILDS_THEMES[zoneKey]) buildGenericWilds(zoneKey, size);
  // a module with no biome theme (a dungeon, a city) builds straight from here
  else ZONE_MODULES[zoneKey]?.build?.(size);
  if (isDungeon && ZONE_MODULES[zoneKey]?.hemi && hemiLight) { hemiLight.intensity = ZONE_MODULES[zoneKey]!.hemi!; hemiBase = ZONE_MODULES[zoneKey]!.hemi!; }
  if (isDungeon) finishDungeon(zoneKey, dmod, outdoor, openAir, dclear);
  const zl = ZONE_MODULES[zoneKey]?.light;
  if (zl?.shadow !== undefined && shadowGen) shadowGen.darkness = zl.shadow;
  if (zl?.hemiGround && hemiLight) hemiLight.groundColor = Color3.FromHexString(zl.hemiGround);
  // what a night profile (registered by the build above) leans away from
  if (hemiLight) nightBase = { ground: hemiLight.groundColor.clone(), shadow: shadowGen?.darkness ?? 0 };

  if (!isDungeon && def.kind !== "voyage") buildZoneEdge(zoneKey, size);
  if (hasMeadow(zoneKey)) buildMeadow(zoneKey, size);

  buildMilestones(def);
  buildPortals(def);
  buildLandmarkProps(zoneKey, def);
  buildNodes(zoneKey, def);
  try {
    localStorage.setItem(`vanai_fp_${zoneKey}`, JSON.stringify(zoneFootprints[zoneKey] || []));
    localStorage.setItem(`vanai_map_${zoneKey}`, JSON.stringify(zoneMapLayers[zoneKey] || { roads: [], waters: [] }));
  } catch { /* full */ }
}

// ---------- a dungeon's outside, light and glow (dungeon-backdrop.ts) ----------

// The panorama's land was lit by the PARENT's sun; the dungeon faces the parent
// turned by `dir` (its +z looks toward parent azimuth dir), so the sun, the
// moons and the afterglow turn with it. They sort before the panorama band
// (alphaIndex 2), so a low sun sets behind the land instead of over it.
function turnDungeonSky(dir: number): void {
  const c = Math.cos(-dir), s = Math.sin(-dir);
  const turn = (v: Vector3) => v.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  if (celestial) turn(celestial.direction);
  for (const m of [sunDisc, moonDisc, afterglowMesh, scene.getMeshByName("moon2")]) if (m) { turn(m.position); m.alphaIndex = 1; }
}

// No ground plane, and a clear colour that is the fog's own on screen (the
// clear colour skips tone mapping, the fog does not). Returns the colour set, so
// finishDungeon can tell whether the module chose its own.
function enclosedDungeonView(): Color4 {
  const g = scene.getMeshByName("ground");
  if (g) g.isVisible = false;
  fogClear(scene);
  return scene.clearColor;
}

// After the module's build: its lighting preset, the outside (skirt and band),
// the glow pass's wall occluder and the light pools.
function finishDungeon(zoneKey: string, mod: ZoneModule | undefined, outdoor: DungeonOutdoor | null, openAir: boolean, dclear: Color4 | null): void {
  const layout = (ZONES[zoneKey] as { layout?: TombLayout }).layout;
  // the bake's recommended air (open air only) under the module's own choices
  const air = openAir ? outdoor?.lighting : undefined;
  const L: DungeonLighting | undefined = air || mod?.lighting ? { ...air, ...mod?.lighting } : undefined;
  if (L) applyDungeonLighting(scene, hemiLight, celestial, L);
  // a module that set its fog but not its clear colour gets that fog's on screen
  if (!openAir && dclear && scene.clearColor === dclear && !L?.clear) fogClear(scene);
  if (openAir && outdoor) {
    const ext = layout ? layoutExtent(layout) : { cx: 0, cz: 0, half: 60 };
    const sk = outdoor.skirt === false ? null : outdoor.skirt ?? {};
    const radius = sk?.radius ?? 520;
    if (sk) {
      const ground = TERRAIN_TEX[outdoor.parent] ?? TERRAIN_TEX.moonmereshores;
      // the land is the panorama's own colour (skirtMaterial); a lake is the one water material
      const centre = sk.centre ?? [ext.cx, ext.cz], inner = sk.inner ?? ext.half + 12;
      const mat: Material = sk.water ? makeClearWaterMat("dungeon_skirt_water", sk.water, 1, 0.6)
        : skirtMaterial(scene, zoneKey, outdoor, sk.tex ?? ground.tex, () => celestial?.direction ?? { x: -0.4, y: -1, z: 0.3 },
          [centre[0], centre[1], inner, radius], sk.color ? Color3.FromHexString(sk.color) : undefined);
      buildTerrainSkirt(scene, {
        y: sk.y ?? -0.6, radius, inner,
        fall: sk.water ? 0 : sk.fall ?? -12, relief: sk.water ? 0 : sk.relief ?? 6,
        centre,
      }, mat);
    }
    buildBackdropBand(scene, zoneKey, outdoor, outdoor.haze ?? radius);
  }
  // The glow pass draws what glows and the occluders, not every mesh again;
  // the plan's walls stand in for the rest. A dungeon with no plan in zones.json
  // (the Keep, today) has nothing to stand in, so it keeps the full pass unless
  // its module says `glow` (MEASURED: without, the Keep's torches haloed
  // through its walls)
  if (layout || mod?.glow) glowOnlyEmitters(glow);
  if (layout && mod?.glow?.occluder !== false) {
    const o = layoutOccluder(layout, (x, z) => heightFn(x, z), (mod?.glow?.occluder || undefined)?.height ?? 3.2);
    if (o.indices.length) glowOccluderMesh(`${zoneKey}_glow_walls`, o.positions, o.indices);
  }
  if (L?.pools) {
    const strength = L.poolStrength ?? 0.35, r = L.poolRadius ?? 3.4;
    const warm = Color3.FromHexString(L.poolColor ?? "#ffb070");
    const pools = L.pools === "doors"
      ? (layout ? doorPools(layout, (x, z) => heightFn(x, z), warm.scale(strength), r) : [])
      : L.pools.map((p: PoolSpec) => ({
        x: p.x, z: p.z, y: p.y ?? heightFn(p.x, p.z), r: p.r ?? r,
        c: (p.color ? Color3.FromHexString(p.color) : warm).scale(p.strength ?? strength),
      }));
    lightPools(scene, pools);
  }
  // RULINGS: no more than the four nearest-lamp slots
  if (import.meta.env.DEV) {
    const n = scene.lights.filter((l) => l instanceof PointLight).length;
    if (n > 4) console.warn(`${zoneKey}: ${n} PointLights (dungeons keep to 4; use emissive and light pools)`);
  }
}

function buildSky(isDungeon: boolean): void {
  if (isDungeon) return;
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 2400, sideOrientation: Mesh.BACKSIDE }, scene);
  // Gradient + starfield baked into one texture, 4096x2048.
  //
  // The 2:1 is not arbitrary: a sphere's UV is equirectangular, 360 degrees
  // across against 180 down, so a SQUARE sheet was being stretched to twice its
  // proper width and every star smeared into a horizontal oval before the
  // filter even touched it. Half the softness was that, not resolution.
  //
  // The rest is magnification. At 4096 across, a texel spans 0.088 degrees,
  // which at this fov lands near 1.8 screen pixels -- so a 1-2px star stays a
  // point instead of being blurred over seven. Stars are also drawn as hard
  // squares rather than anti-aliased circles: an anti-aliased 1px dot is mostly
  // partial coverage, and bilinear magnification turns that into a smudge.
  const SZW = 4096, SZH = 2048;
  const tex = new DynamicTexture("skytex", { width: SZW, height: SZH }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const grad = ctx.createLinearGradient(0, 0, 0, SZH);
  grad.addColorStop(0, "#06070c");
  grad.addColorStop(0.45, "#10131f");
  grad.addColorStop(0.72, "#1c1e30");
  grad.addColorStop(0.86, "#2c2a40");
  grad.addColorStop(1, "#1a1a28");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SZW, SZH);
  // stars in the upper sky, fading toward the horizon
  // Star colour by rough spectral class, weighted the way a real sky is: mostly
  // white and blue-white, with gold and orange common enough to notice and a
  // few red giants. The cyan and violet at the end are not astronomy -- they
  // are for a world with a Gloam in it, and they land on the brightest stars
  // where the halo carries them.
  const STAR_HUES: [number, number, number][] = [
    [168, 200, 255], // blue-white
    [214, 232, 255], // white-blue
    [255, 250, 242], // white
    [255, 238, 190], // pale gold
    [255, 212, 132], // gold
    [255, 172, 112], // orange
    [255, 134, 112], // red giant
    [150, 240, 255], // ice
    [206, 168, 255], // violet
  ];
  const STAR_MIX = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7, 8];
  const srand = seededRand(20260820);
  for (let i = 0; i < 11500; i++) {
    const sx = srand() * SZW;
    const sy = Math.pow(srand(), 1.3) * SZH * 0.8;
    const fade = 1 - sy / (SZH * 0.92);
    const bright = srand();
    const r = bright > 0.985 ? 3 : bright > 0.93 ? 2 : 1;
    const [hr, hg2, hb] = STAR_HUES[STAR_MIX[Math.floor(srand() * STAR_MIX.length)]];
    // the dimmer a star, the more the eye washes it toward white -- so pull the
    // faint ones back to grey and let the bright ones carry their full colour
    const sat = 0.35 + bright * 0.65;
    const cr = Math.round(238 + (hr - 238) * sat);
    const cg = Math.round(240 + (hg2 - 240) * sat);
    const cb = Math.round(245 + (hb - 245) * sat);
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.66 + bright * 0.34) * fade})`;
    // whole-texel rect, not an anti-aliased arc: partial coverage is exactly
    // what magnification turns into a smudge
    ctx.fillRect(Math.round(sx), Math.round(sy), r, r);
    // the brightest few get a soft halo, so the sky has a handful of real
    // standouts instead of 3200 identical specks
    if (bright > 0.985) {
      const hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4.5);
      hg.addColorStop(0, `rgba(${hr}, ${hg2}, ${hb}, ${0.5 * fade})`);
      hg.addColorStop(1, `rgba(${hr}, ${hg2}, ${hb}, 0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tex.update();
  const m = new StandardMaterial("skymat", scene);
  m.emissiveTexture = tex;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  m.fogEnabled = false;
  sky.material = m;
  sky.isPickable = false;
  sky.alphaIndex = 0; // draw before every other transparent mesh (see below)
  nightDome = sky;

  // the day sky: a second dome that fades in with the sun
  const dsky = MeshBuilder.CreateSphere("daysky", { diameter: 2380, sideOrientation: Mesh.BACKSIDE }, scene);
  const dtex = new DynamicTexture("dayskytex", { width: 64, height: 512 }, scene, false);
  const dctx = dtex.getContext() as CanvasRenderingContext2D;
  // Orientation, measured by scene.pick against the live dome: canvas y=0 is
  // the BOTTOM pole, y=512 the zenith, y=256 the horizon. The old gradient
  // assumed y=0 was the zenith, which put saturated #2f7ad8 blue on the
  // below-horizon bowl -- invisible behind terrain except through gaps in a
  // rim, where it read as patches of floating water. Everything below the
  // horizon must stay haze-coloured.
  const dgrad = dctx.createLinearGradient(0, 0, 0, 512);
  dgrad.addColorStop(0, "#cfc9b2");
  dgrad.addColorStop(0.44, "#cfc9b2");
  dgrad.addColorStop(0.51, "#e8e2c4");
  dgrad.addColorStop(0.58, "#a6cdf2");
  dgrad.addColorStop(0.74, "#5ea0e6");
  dgrad.addColorStop(1, "#2f7ad8");
  dctx.fillStyle = dgrad;
  dctx.fillRect(0, 0, 64, 512);
  dtex.update();
  const dm = new StandardMaterial("dayskymat", scene);
  dm.emissiveTexture = dtex;
  dm.diffuseColor = Color3.Black();
  dm.specularColor = Color3.Black();
  dm.disableLighting = true;
  dm.fogEnabled = false;
  dm.alpha = 0.999; // alpha-blended so visibility fades work
  dsky.material = dm;
  dsky.isPickable = false;
  dsky.visibility = 0;
  // Keep the background behind the coastal atmosphere and celestial discs.
  dsky.alphaIndex = 0;
  dayDome = dsky;

  // the sun
  const sunTex = new DynamicTexture("suntex", { width: 256, height: 256 }, scene, false);
  const sctx = sunTex.getContext() as CanvasRenderingContext2D;
  const sg = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  sg.addColorStop(0, "rgba(255, 248, 224, 1)");
  sg.addColorStop(0.28, "rgba(255, 232, 170, 0.95)");
  sg.addColorStop(0.6, "rgba(255, 205, 120, 0.35)");
  sg.addColorStop(1, "rgba(255, 190, 100, 0)");
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 256, 256);
  sunTex.update();
  sunTex.hasAlpha = true;
  const sun = MeshBuilder.CreatePlane("sundisc", { size: 190 }, scene);
  sun.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const sm = new StandardMaterial("sunmat", scene);
  sm.emissiveTexture = sunTex;
  sm.opacityTexture = sunTex;
  sm.disableLighting = true;
  sm.fogEnabled = false;
  // The disc's own pixels top out at 1.0, and ACES then compresses that to a
  // pale patch -- measured brightest pixel (222,221,221), which is why the
  // daylight read as diffused with no source in it. The sun is the one thing in
  // the sky that should blow out, so it opts into the glow layer: the disc is
  // the shape, the bloom is what makes it read as the sun.
  sm.emissiveColor = Color3.FromHexString("#fff0c4");
  sm.metadata = { glow: 1.0 };
  sun.material = sm;
  sun.isPickable = false;
  sunDisc = sun;

  // sunset afterglow low on the western horizon
  const glowTex = new DynamicTexture("aftergl", { width: 256, height: 256 }, scene, false);
  const gctx = glowTex.getContext() as CanvasRenderingContext2D;
  const rg = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  rg.addColorStop(0, "rgba(226, 149, 90, 0.55)");
  rg.addColorStop(0.4, "rgba(180, 110, 80, 0.28)");
  rg.addColorStop(1, "rgba(120, 70, 70, 0)");
  gctx.fillStyle = rg;
  gctx.fillRect(0, 0, 256, 256);
  glowTex.update();
  glowTex.hasAlpha = true;
  const afterglow = MeshBuilder.CreatePlane("afterglow", { width: 900, height: 420 }, scene);
  afterglow.position = new Vector3(-1050, 60, -180);
  afterglow.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const am = new StandardMaterial("afterglowm", scene);
  am.emissiveTexture = glowTex;
  am.opacityTexture = glowTex;
  am.disableLighting = true;
  am.fogEnabled = false;
  afterglow.material = am;
  afterglow.isPickable = false;
  afterglowMesh = afterglow;

  // twin moons
  const moonTex = new DynamicTexture("moontex", { width: 256, height: 256 }, scene, false);
  const mctx = moonTex.getContext() as CanvasRenderingContext2D;
  const mg = mctx.createRadialGradient(110, 100, 20, 128, 128, 128);
  mg.addColorStop(0, "#f2f4fc");
  mg.addColorStop(0.75, "#cfd6ec");
  mg.addColorStop(0.98, "#aeb6d4");
  mg.addColorStop(1, "rgba(174,182,212,0)");
  mctx.fillStyle = mg;
  mctx.beginPath(); mctx.arc(128, 128, 127, 0, Math.PI * 2); mctx.fill();
  const crand = seededRand(77);
  for (let i = 0; i < 14; i++) {
    const a = crand() * Math.PI * 2, r = crand() * 90;
    const cx = 128 + Math.cos(a) * r, cy = 128 + Math.sin(a) * r;
    mctx.beginPath();
    mctx.arc(cx, cy, 4 + crand() * 12, 0, Math.PI * 2);
    mctx.fillStyle = `rgba(150, 158, 190, ${0.18 + crand() * 0.2})`;
    mctx.fill();
  }
  moonTex.update();
  moonTex.hasAlpha = true;
  const moonPlane = MeshBuilder.CreatePlane("moondisc", { size: 84 }, scene);
  moonPlane.position = new Vector3(-420, 400, 620);
  moonPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const mm = new StandardMaterial("moonmat", scene);
  mm.emissiveTexture = moonTex;
  mm.opacityTexture = moonTex;
  mm.disableLighting = true;
  mm.fogEnabled = false;
  moonPlane.material = mm;
  moonPlane.isPickable = false;
  moonDisc = moonPlane;
  // the second, smaller gloam-violet moon — low in the east
  const moon2 = MeshBuilder.CreateDisc("moon2", { radius: 13 }, scene);
  moon2.position = new Vector3(760, 210, -420);
  moon2.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const m2m = mat("moon2m", "#9a8fd0", { emissive: "#8a7fc0", glow: 0.6 });
  m2m.disableLighting = true;
  m2m.fogEnabled = false;
  moon2.material = m2m;
  moon2.isPickable = false;

  // Overcast zones keep their fog-coloured vault. Ordinary zone fog and
  // precipitation remain owned by the zone builders, independent of this sky.
  if (!overcastSky) buildCoastalSky(scene, dayFrac);
}

// Ground sheets, all CC0 (Poly Haven, client/public/tex). Vertex colour
// MULTIPLIES the sheet, so a tint can only darken a channel, never lift one:
// a sheet with a colour cast keeps it under a near-neutral tint.
const TERRAIN_TEX: Record<string, { tex: string; tint: [string, string]; tile: number }> = {
  // Every tint here is SOLVED, not picked: tools/assets/solve_tint.py takes the
  // sheet's measured average and the colour the zone should read as, and
  // returns tint = target / base. That matters because vertex colour MULTIPLIES
  // the sheet and so can only ever DARKEN it -- the two bugs CC0-ASSETS.md
  // records (Caerdun's lavender streets, the dead green wold) were both a tint
  // chosen to look like the target rather than to produce it. The solver also
  // refuses targets a sheet cannot reach, which is why the flooded dungeons are
  // on cobblestone_floor_08 and not mossy_cobblestone: the mossy sheet averages
  // rgb(118,107,76) and simply has no blue to give.
  //
  // The pair is a lerp across the terrain's fbm noise, so the second must be
  // the lighter of the two.
  //
  // MEASURED: leafy_grass averages rgb(151,131,89) -- a warm khaki, not a
  // green. Vertex colour multiplies, so a green-grey tint drives it to a dead
  // rgb(65,66,34); these are solved backwards from the wold reading lush instead.
  // --- wilderness, CC0 ---
  // the real zone takes the vignette's approved sheet and tint pair unchanged
  moonmereshores: { tex: "leafy_grass", tint: ["#79ab8a", "#a8d8ba"], tile: 11 },
  // --- dungeons, CC0. Dark ON PURPOSE: the tone change brightened the outdoors
  // and these draw their power from the contrast with it. Do not lift them. ---
  // --- settlements ---
  // The island's own ground: turf on the shelves the city is not standing on,
  // pulled toward the kit's warm stone so the terrace faces and the ground they
  // cut through are the same rock. Not the city sheet -- most of Moonmere's
  // area is terrace, headland and academy lawn, and cobbles everywhere read as
  // one enormous courtyard.
  // the same CC0 sward as the other two cities
  moonmere: { tex: "leafy_grass", tint: ["#d4dcc9", "#edf0dd"], tile: 6 },
  // Heartwood: the Hunting Wood vignette's grove green, the Fields postcard's
  // #6f9a4e orchard warmed a touch. NOT forrest_ground_03: under a green tint
  // that sheet's brown litter came out straw-yellow from the air, a dry field
  // inside a green ring
  heartwood: { tex: "leafy_grass", tint: ["#8aa668", "#bcd898"], tile: 11 },
};

// Bare stone, for terrain too steep to hold soil. Multiplied against whatever
// ground sheet the zone uses, so it is a DARKENER like every other tint here --
// see the tint notes above scatterModels before changing it.
const ROCK_FACE = Color3.FromHexString("#6f6a60");

// buildTerrain's grid resolution, and terrainMeshHeight MUST agree with it --
// that function interpolates the cell the mesh actually drew, and reading the
// wrong cell puts every waterline sample in the wrong triangle.
//
// 150 was a constant while no zone was bigger than the Shores' 700m, where it
// is a 4.7m cell. Moonmere's plate is 1000m: held at 150 the cell stretches to
// 6.7m, which is coarse enough that a terrace edge smears into a ramp. Scaling
// past 700m holds the cell at 4.7m instead and leaves every existing zone --
// all of them 700m or under -- on exactly the 150 they were tuned against.
// Moonmere and Heartwood are finer still: 300 on a 700m plate is a 2.33m cell.
// The old cities' levelled house pads (housePads, retired 2026-10-10) were what
// first needed it -- a pad edge is a 1.2m step blended over a few metres, and a
// 4.7m cell smeared that across the wall line, so the terrain rode up the
// foundations in a wedge under every house (MEASURED: the pad was flat at 34.9
// and the drawn ground was not).
const fineTerrainZones = new Set<string>();
function terrainSub(size: number, zoneKey?: string): number {
  if (zoneKey && fineTerrainZones.has(zoneKey)) return 300;
  return Math.max(150, Math.min(256, Math.round(size / 4.667 / 2) * 2));
}

function buildTerrain(zoneKey: string, size: number, isDungeon: boolean): void {
  const sub = terrainSub(size, zoneKey);
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const step = size / sub;
  const cfg = TERRAIN_TEX[zoneKey] || TERRAIN_TEX.moonmereshores;
  const c1 = Color3.FromHexString(cfg.tint[0]);
  const c2 = Color3.FromHexString(cfg.tint[1]);
  const samples = new Float64Array((sub + 1) * (sub + 1));
  const groundTint = ZONE_MODULES[zoneKey]?.groundTint;
  for (let i = 0; i <= sub; i++) {
    for (let j = 0; j <= sub; j++) {
      const x = -size / 2 + j * step;
      const z = -size / 2 + i * step;
      const y = heightFn(x, z);
      samples[i * (sub + 1) + j] = y;
      positions.push(x, y, z);
      uvs.push(x / cfg.tile, z / cfg.tile);
      const n = fbm(x / 22 + 7, z / 22 + 7);
      let c = Color3.Lerp(c1, c2, n);
      // Steep ground is ROCK. There is one ground texture per zone, so the
      // sheet cannot change with the slope -- but the vertex colour can, and
      // that is enough: a cliff face tinted to bare stone reads as rock even
      // though it is still sampling the grass sheet. Without this the Veilfall
      // massif was a 32m GRASSY cliff, and every steep face in the game had the
      // same problem more quietly.
      // Same gradient the walkability rule uses, so what looks unclimbable and
      // what IS unclimbable are the same surfaces.
      const gs = 1.2;
      const gx = (heightFn(x + gs, z) - heightFn(x - gs, z)) / (2 * gs);
      const gz = (heightFn(x, z + gs) - heightFn(x, z - gs)) / (2 * gs);
      const steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - 0.45) / 0.65));
      if (steep > 0) c = Color3.Lerp(c, ROCK_FACE, smooth(steep));
      if (groundTint) c = groundTint(x, z, c);
      // river channels are sand IN THE TERRAIN, same trick as steep-is-rock:
      // the mesh interpolates this grid across the carve and pokes through
      // the river's sheets in places no lift can anticipate, and a poke that
      // is already sand-coloured reads as the bed rather than as a glitch.
      // Applied after the rock tint so the channel floor wins over it.
      colors.push(c.r, c.g, c.b, 1);
    }
  }
  terrainSamples = { scene, zone: zoneKey, size, sub, h: samples };
  for (let i = 0; i < sub; i++) {
    for (let j = 0; j < sub; j++) {
      const a = i * (sub + 1) + j;
      indices.push(a, a + 1, a + sub + 1, a + 1, a + sub + 2, a + sub + 1);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.colors = colors;
  vd.uvs = uvs;
  const ground = new Mesh("ground", scene);
  vd.applyToMesh(ground);
  const gm = new StandardMaterial("groundmat", scene);
  gm.specularColor = Color3.Black();
  gm.diffuseColor = Color3.White();
  const diff = new Texture(`/tex/${cfg.tex}_diff.jpg`, scene);
  diff.wrapU = Texture.WRAP_ADDRESSMODE;
  diff.wrapV = Texture.WRAP_ADDRESSMODE;
  gm.diffuseTexture = diff;
  const nor = new Texture(`/tex/${cfg.tex}_nor.jpg`, scene);
  nor.wrapU = Texture.WRAP_ADDRESSMODE;
  nor.wrapV = Texture.WRAP_ADDRESSMODE;
  nor.level = 0.75;
  gm.bumpTexture = nor;
  // Steep faces get the rock sheet. Scoped to the SHAPED zones for now -- it is
  // a global improvement (every steep face in the game samples its ground sheet
  // sideways) but the old zones are mid-review and this changes how their
  // cliffs read.
  if (ZONE_SHAPES[zoneKey]) new CliffRockPlugin(gm);
  ground.hasVertexAlpha = false;   // vertex colour is a TINT here, never a mask
  ground.material = gm;
  ground.isPickable = true;
  ground.receiveShadows = true;
  gm.maxSimultaneousLights = 8;
  ground.metadata = { ground: true };
}

// Kenney kit tints, SOLVED. MEASURED with tools/assets/atlas_color.py: every
// "stone" piece in the graveyard kit lands on the shared colormap's lavender
// swatches -- #adb5d9 and #8d93b1, averaging rgb(157,164,197). That is
// BLUE-DOMINANT, so
// a grey tint multiplies a lavender base and gives a lavender wall. Every tint
// below neutralises DOWN to the smallest channel first, then darkens.
//
// Two pieces are painted rather than stone and a tint cannot rescue them:
//   column-large  14% #d07b56 (an orange band -- it banded the fen's shrine)
//   pillar-large  a painted band too (it made the Hush's nave six red posts);
//                 pillar-square is the plain shaft, 90% stone
//   candle/lantern/lightpost  green and peach swatches, by design
//
// Solving these FORWARDS does not work, and it is worth knowing why before
// trying again. Between the tint and the pixel sit: the albedo atlas, two BLUE
// lights (hemi #aab2d4, sun #bcc6e8), a blue sky HDRI arriving through
// environmentIntensity, an exposure the day cycle drives to 1.52 at noon,
// contrast 1.18 and an ACES curve. The lights being blue is the part that
// catches people out -- neutralising the TEXTURE still leaves blue stone,
// because the light is blue too.
//
// So these are closed-loop: render, sample a LIT face, and run
//   solve_tint.py --correct <current tint> <measured rgb> <target>
// which scales the tint by target/measured per channel. Two passes is exact.
// MEASURED here: tint #807a70 rendered rgb(133,136,166) against a target of
// rgb(110,110,112), giving #6a634c.
//
// placeExact additionally drops environmentIntensity to 0.3 on any tinted kit
// piece; at full strength the blue sky fill swamps the tint outright.

// MEASURED heights of the CC0 nature MegaKit, and the multipliers that turn
// each into a canopy of the intended size. This table exists because the
// species are NOT the same height, and reusing one multiplier across them --
// which the first Greywold pass did -- silently makes birch nearly twice the
// height of pine. Derive from here rather than copying a number sideways.
//
//   species          base h    x for 16-26m canopy    x for a 34-50m emergent
//   Pine_1..5          7.32       2.2 - 3.5
//   CommonTree_1..5    7.27       2.2 - 3.6
//   CherryBlossom      13.38      1.2 - 1.9
//   Birch_1..5         13.72      1.2 - 1.9
//   TallThick_1..5     14.98      1.1 - 1.7
//   TwistedTree_1..5   16.73      1.0 - 1.6
//   GiantPine_1..5     17.17                                 2.0 - 2.9
//   DeadTree_1         9.50       1.4 - 2.4  (understory)
//   DeadTree_4         12.77      1.1 - 1.8
//   Bush_Large         3.25       1.2 - 2.2  ->  3.9-7.2m
//   Bush_Common        1.58       1.6 - 3.0  ->  2.5-4.7m
//   Rock_Big_1/2       4.58       0.8 - 1.5
//   Rock_Medium_1..4   2.26       0.7 - 1.5
//   Grass_* tufts   1.07-1.87     0.3 - 0.8  (see CARPETS)
//
// And the leaf sheets, measured, because species choice IS colour choice here:
//   Leaves_NormalTree_C   rgb(88,123,0)    green
//   Leaves_GiantPine_C    rgb(61,109,0)    deep green
//   Leaves_Birch_C        rgb(184,71,0)    AUTUMN ORANGE
//   Leaves_TwistedTree_C  rgb(169,23,23)   RED   (Bush_Common shares this)
//   Leaves_CherryBlossom_C rgb(190,109,228) PURPLE BLOSSOM
//   Leaves_TallThick_C    rgb(70,100,199)  BLUE
// A green zone that scatters birch or twisted tree turns orange; a pale or
// otherworldly zone should reach for TallThick and CherryBlossom on purpose.

// ---------- model scatter (async: instances pop in as templates load) ----------
function scatterModels(
  files: string[], count: number, size: number, seed: number,
  avoid: [number, number, number][], minScale: number, maxScale: number, collideR = 0,
  tint?: string, snowCap?: "abs" | "up", flat = false
): void {
  const rand = seededRand(seed);
  // a rock scatter may stand in a river; a plant scatter may not (see
  // vegExclusions). Decided per CALL from the file list — scatter calls are
  // homogeneous, either mineral set dressing or vegetation.
  const isVeg = !files.every((f) => /rock|pebble|stone|crystal|mineral|gem/i.test(f));
  const positions: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  let tries = 0;
  while (positions.length < count && tries < count * 8) {
    tries++;
    const x = (rand() - 0.5) * (size - 20);
    const z = (rand() - 0.5) * (size - 20);
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (scatterBlocked(x, z)) continue;   // blanket: minerals included
    if (isVeg && vegBlocked(x, z)) continue;
    const sc = minScale + rand() * (maxScale - minScale);
    positions.push({ x, z, y: heightFn(x, z) - 0.05, scale: sc, rot: rand() * Math.PI * 2 });
    if (collideR > 0) circleColliders.push({ x, z, r: collideR * sc });
  }
  // split positions among the file variants
  const buckets: typeof positions[] = files.map(() => []);
  positions.forEach((p, i) => buckets[i % files.length].push(p));
  const sceneAtCall = scene;
  files.forEach((file, fi) => {
    if (!buckets[fi].length) return;
    staticTemplate(file).then((base) => {
      if (!base || sceneAtCall !== scene) return;
      // a biome may recolour the kit's own rock or wood -- desert rock should
      // not be the same grey-green as forest rock. Goes through the same
      // per-(file,tint) clone placeExact uses, so a tinted scatter and an
      // untinted one of the same model can coexist. An untinted snowy scatter
      // still clones ("plain" key): the plugin must never touch shared bases.
      const template = tint ? tintedTemplate(base, file, tint + (flat ? "|flat" : ""))
        : snowCap ? tintedTemplate(base, file, "plain") : base;
      if (tint && !(template as any).__generatedTree) for (const m of subMaterials(template)) {
        const c = Color3.FromHexString(tint);
        if (m.albedoColor) m.albedoColor = c; else if (m.diffuseColor) m.diffuseColor = c;
        if (m.environmentIntensity !== undefined) m.environmentIntensity = 0.3;
        if (flat) { flattenMaterial(m); if (m.roughness !== undefined) m.roughness = 0.35; }
      }
      addInstances(template, scatterMatrices(buckets[fi]));
      tintInstances(template, seed * 3 + fi);
      // small vegetation must not feed the shadow cascades (Philip's lag fix)
      if (shadowGen && SMALL_VEG.test(file)) shadowGen.removeShadowCaster(template);
      if (!flat) styleFoliage(template, file);
      if (snowCap) addSnowCaps(template, snowCap);
    });
  });
}

// everything smaller than a tree stays out of the shadow cascades
const SMALL_VEG = /Grass|Flower|Plant|Mushroom|Leaf|Lian|Bush|Stump|Log|Rock_0|Rocks_0|Pot|Candle|Food/i;
// the old card-pine needle green — Philip's anchor colour for canopies
// Chosen as a DISPLAY colour (#2c4a30, the card-pine needle tone) converted to
// linear — picking "dark" values directly in linear space renders ~2 stops
// brighter than intended (that's why earlier darkening passes barely showed).
const PINE_GREEN = new Color3(0.022, 0.068, 0.026);
// One styling pass for any foliage-bearing template, whatever path loaded it.
export function styleFoliage(template: Mesh, file: string): void {
  // generated trees style themselves (trees.ts); their material names are not
  // kit names, and "broadleaf" once matched /leaf/ here by accident
  if ((template as any).__generatedTree) return;
  if (!/Tree|Bush|Plant|Leaf|Grass|Flower|Lian|Willow|Fern|Clover|Petal/i.test(file)) return;
  const ms = template.material && (template.material as any).subMaterials ? (template.material as any).subMaterials : [template.material];
  for (const m of ms) {
    if (!m) continue;
    if (/leaf|leaves|bush|crown|plant|grass/i.test(m.name)) {
      foliageSolid(m);
      if ((m as any).albedoColor && !(m as any).__desat) {
        const a = (m as any).albedoColor;
        if (a.r > 0.9 && a.g > 0.9 && a.b > 0.9) {
          // white factor over an artist-colored sheet (village trees, pot
          // plants): darken with a green bias so the olive sheets read as
          // deep leaf green instead of washed grey
          (m as any).albedoColor = new Color3(0.34, 0.46, 0.32);
        } else {
          // flat-color foliage: pull to pine and darken — broad canopy quads
          // face the sun square-on while pine needle cards self-shadow
          (m as any).albedoColor = Color3.Lerp(a, PINE_GREEN, 0.9).scale(0.38);
        }
        (m as any).__desat = true;
      }
    }
  }
}

// A continuous carpet of grass-blade tufts over the terrain (the bundle's
// look: blades everywhere, not a flat green sheet). Tens of thousands of
// 24-vert card crosses per zone — cheap as thin instances, but they must NOT
// cast shadows (that would put millions of verts into the cascade each frame).
// Per-instance colour variation for nature scatter: each instance gets its own
// brightness and a slight hue drift, with green pulled down a touch so foliage
// reads textured rather than uniformly acid-saturated.
export function tintInstances(t: Mesh, seed: number): void {
  const n = t.thinInstanceCount;
  if (!n) return;
  // A random per-instance multiply (green down to 0.55, red and blue skewed
  // below it) is variety for a flat-coloured kit and vandalism on a painted
  // one -- it was the main reason the Quaternius canopies read as washed out
  // and textureless. See __paintedArt in models.ts.
  if ((t as any).__paintedArt) return;
  const rand = seededRand(seed);
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // green-preserving variation: red/blue stay BELOW green so the tint never
    // desaturates the foliage (the old skew read as a gray wash)
    const g = 0.55 + rand() * 0.40;
    let r = g * (0.72 + rand() * 0.24);
    let bl = g * (0.66 + rand() * 0.24);
    if (rand() < 0.14) { r = g * 1.05; bl = g * 0.55; } // dry olive patches
    data[i * 4] = Math.min(1.0, r);
    data[i * 4 + 1] = Math.min(1.0, g);
    data[i * 4 + 2] = Math.min(1.0, bl);
    data[i * 4 + 3] = 1;
  }
  (t as any).__instColor = data;   // addInstances grows it if more instances arrive
  t.thinInstanceSetBuffer("color", data, 4);
}

export function updateCarpet(px: number, pz: number): void {
  updateGrass(scene, px, pz);
  updateTrees(scene, px, pz);
}

// force cutout rendering on a foliage material — alpha-BLEND leaves read as
// ghost canopies; alpha-TEST makes them solid
// PBR shaders apply the scene's image processing (noon exposure 1.4 + contrast)
// in-shader; StandardMaterial does not. That mismatch is why kit canopies sat
// ~40% brighter than the card pines whatever their albedo said. Foliage gets a
// neutral processing config so both families read the same.
const neutralIPC = new ImageProcessingConfiguration();
// Neutral EXPOSURE and CONTRAST (that is the PBR/Standard mismatch this exists
// to fix), but the same tone curve and colour curves as the scene. Without
// these two lines foliage is the only thing in frame not tone mapped and not
// saturated, which reads exactly as "the canopies look washed out".
neutralIPC.toneMappingEnabled = true;
neutralIPC.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
{
  const c = new ColorCurves();
  c.globalSaturation = 34;
  neutralIPC.colorCurves = c;
  neutralIPC.colorCurvesEnabled = true;
}
setTreeImageProcessing(neutralIPC);

function foliageSolid(m: any): void {
  if (!m || m.__solid) return;
  m.__solid = true;
  if (typeof m.transparencyMode !== "undefined") m.transparencyMode = 1; // ALPHATEST
  m.alphaCutOff = 0.35;
  if (m.albedoTexture) m.albedoTexture.hasAlpha = true;
  m.backFaceCulling = false;
  // kill the PBR specular sheen: on dark albedo the white highlight film reads
  // as a washed-out gray overlay across the whole canopy
  m.metallic = 0;
  m.roughness = 1;
  if (typeof m.specularIntensity !== "undefined") m.specularIntensity = 0;
  if (m.metallicF0Factor !== undefined) m.metallicF0Factor = 0;
  if (m.imageProcessingConfiguration !== undefined) m.imageProcessingConfiguration = neutralIPC;
}

// biome blade-carpet recipes, applied after each outdoor zone builds.
//
// The kit tufts these named are no longer laid: the meadow (grass.ts, below)
// reads its density off `count` (46000, the lushest, is four clumps a square
// metre) and its colours off the zone's ground. MEASURED, for the files: the
// Quaternius tufts are 153-1530 verts and 1.07-1.87m.
//
// Tints are solved against the sheet, not picked. MEASURED: Grass.jpg averages
// rgb(227,229,200) -- nearly white, which is why these tufts take a biome
// colour so well where a leaf sheet would not. Green zones pass no tint at all
// and keep the artist's own colour.
const CARPETS: Record<string, { files: string[]; count: number; tint?: string; scale?: [number, number] }> = {
  // under a closed canopy the sward is short and sparse, not meadow-deep
  // the shore ring's meadow: the vignette's own green, at the density the real
  // zone needs to read as grazed lakeside pasture rather than a mown lawn
  moonmereshores: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf", "nature/Grass_Wispy_Short.gltf"], count: 46000, scale: [0.42, 0.80] },
  // Heartwood's is a grove floor under canopy -- short and sparse, as under
  // the Thornwild (Caerdun's turf is zones/caerdun.ts's own carpet)
  heartwood: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wispy_Short.gltf", "nature/Grass_Wide_Short.gltf"], count: 40000, scale: [0.34, 0.62] },
  // reeds, so the fen's tall wispy form and an olive cast off the black water
  // wheat is the kit's dry-stalk form, which is what a waste wants
};


// THE MEADOW (grass.ts) in place of the kit-tuft carpet, on every zone that
// had one. Density is read off the carpet's count (46000, the lushest, is four
// clumps a square metre). The COLOURS are the zone's own ground: each zone's
// sheet and tint pair were tuned and approved on their own, so the sward is
// derived from them rather than picked -- the ground's albedo (the sheet's
// average times the tint pair's mean, which is what the terrain shader
// multiplies) is the colour the ring's edge fades into, a darker cut of it is
// the root, and the tip is the same hue lifted toward the sun and pushed a
// little greener, which is the luminous top of the reference's sward.
const sheetAverage = new Map<string, Promise<Color3>>();
function groundSheetAverage(tex: string): Promise<Color3> {
  let p = sheetAverage.get(tex);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0, 32, 32);
        const d = g.getImageData(0, 0, 32, 32).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4 * 255;
        res(new Color3(r / n, gg / n, b / n));
      };
      img.onerror = () => res(new Color3(0.55, 0.5, 0.35));
      img.src = `/tex/${tex}_diff.jpg`;
    });
    sheetAverage.set(tex, p);
  }
  return p;
}
function meadowColors(albedo: Color3): { root: Color3; tip: Color3; far: Color3 } {
  const lift = (c: Color3, k: number) => new Color3(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
  // the sheets carry brown leaf litter, which pulls a lifted average toward
  // ochre; the tip trades a little red for green to stay a living sward
  const greener = (c: Color3, k: number) => new Color3(c.r * (2 - k) ** 0.5, Math.min(1, c.g * k), c.b);
  return { root: greener(lift(albedo, 0.7), 1.05), tip: greener(lift(albedo, 1.8), 1.12), far: albedo };
}
// A grassy city has no carpet, so it carries its own recipe. Heartwood is a
// grove floor under the tree ring -- short and thinner than the open meadows.
// (The new Moonmere grows none: its lawns are its own, zones/moonmere_*.ts.)
const CITY_MEADOWS: Record<string, { height: [number, number]; density: number }> = {
  heartwood: { height: [0.28, 0.6], density: 4.2 },
  // (the Capital grows none since N1: every foot of its ground inside the walls is
  // mown lawn, the ground sheet itself -- zones/capital.ts keptLawn -- and the card
  // meadow on it stood knee-high against the lawns' ruled edges)
};

function hasMeadow(zoneKey: string): boolean {
  return !!CITY_MEADOWS[zoneKey] || !!CARPETS[zoneKey]?.count;
}
function meadowSpec(zoneKey: string): GrassSpec {
  const cols = meadowColors(new Color3(0.43, 0.44, 0.2));   // replaced once the sheet is read
  const city = CITY_MEADOWS[zoneKey];
  if (city) return { ...city, ...cols };
  const c = CARPETS[zoneKey];
  const density = Math.min(4.5, (c.count / 46000) * 4.0);
  return c.tint ? { height: [0.3, 0.62], density, ...cols } : { height: [0.38, 0.8], density, ...cols };
}

function buildMeadow(zoneKey: string, size: number): void {
  // Roads as segments in 16m buckets: a clump asks only the few segments
  // near it, not every road in the zone.
  const B = 16, buckets = new Map<string, [number, number, number, number, number][]>();
  for (const r of zoneMapLayers[zoneKey]?.roads || []) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const pad = r.half + 2;
      for (let gx = Math.floor((Math.min(ax, bx) - pad) / B); gx <= Math.floor((Math.max(ax, bx) + pad) / B); gx++)
        for (let gz = Math.floor((Math.min(az, bz) - pad) / B); gz <= Math.floor((Math.max(az, bz) + pad) / B); gz++) {
          const k = `${gx},${gz}`;
          (buckets.get(k) || buckets.set(k, []).get(k)!).push([ax, az, bx, bz, r.half]);
        }
    }
  }
  // how far outside the nearest road's edge (x, z) is; negative = on it
  const roadEdge = (x: number, z: number): number => {
    let best = 1e9;
    for (const [ax, az, bx, bz, half] of buckets.get(`${Math.floor(x / B)},${Math.floor(z / B)}`) || []) {
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - half);
    }
    return best;
  };
  // Built surfaces (decks, piers, plazas) and building footprints, bucketed on
  // the same grid: MEASURED, scanning every one of them for every clump made
  // a cell cost ~2ms to lay.
  const rects = new Map<string, [number, number, number, number, number][]>();   // x0, x1, z0, z1, deck y (-inf = footprint)
  const addRect = (x0: number, x1: number, z0: number, z1: number, y: number) => {
    for (let gx = Math.floor(x0 / B); gx <= Math.floor(x1 / B); gx++)
      for (let gz = Math.floor(z0 / B); gz <= Math.floor(z1 / B); gz++) {
        const k = `${gx},${gz}`;
        (rects.get(k) || rects.set(k, []).get(k)!).push([x0, x1, z0, z1, y]);
      }
  };
  for (const f of flatZones) addRect(f.x0, f.x1, f.z0, f.z1, f.y);
  // FLOORS. A house's footprint is recorded axis-aligned (span x len, yaw
  // ignored), so a turned house kept grass in its corners and a quarter-
  // turned one had it growing up through half its floor (Philip: "the grass
  // is extending into building floors"). The walkable decks carry the yaw --
  // every house, hall and landing lays one -- so a floor near the ground is
  // tested as the oriented box it is, grown by 0.6m because a house's deck
  // stops 0.3m inside its walls.
  const PAD = 0.6;
  const floors = new Map<string, Deck[]>();
  for (const d of decks) {
    const R = (d.r ?? Math.hypot(d.hx ?? 0, d.hz ?? 0)) + PAD;
    for (let gx = Math.floor((d.cx - R) / B); gx <= Math.floor((d.cx + R) / B); gx++)
      for (let gz = Math.floor((d.cz - R) / B); gz <= Math.floor((d.cz + R) / B); gz++) {
        const k = `${gx},${gz}`;
        (floors.get(k) || floors.set(k, []).get(k)!).push(d);
      }
  }
  const onFloor = (x: number, z: number, h: number): boolean => {
    for (const d of floors.get(`${Math.floor(x / B)},${Math.floor(z / B)}`) || []) {
      // a floor at ground level; a bridge or balcony well overhead shades
      // grass rather than replacing it
      if (d.y < h - 1 || d.y > h + 3) continue;
      const dx = x - d.cx, dz = z - d.cz;
      if (d.r !== undefined ? Math.hypot(dx, dz) < d.r + PAD
        : Math.abs(dx * d.cos! - dz * d.sin!) < d.hx! + PAD && Math.abs(dx * d.sin! + dz * d.cos!) < d.hz! + PAD) return true;
    }
    // an interior the indoor camera knows about is a room, whatever built it
    for (const r of cameraRooms) {
      if (r.y0 > h + 3 || r.y1 < h) continue;
      const dx = x - r.cx, dz = z - r.cz;
      if (r.r !== undefined ? Math.hypot(dx, dz) < r.r + PAD
        : Math.abs(dx * r.cos - dz * r.sin) < r.hx + PAD && Math.abs(dx * r.sin + dz * r.cos) < r.hz + PAD) return true;
    }
    return false;
  };
  // HEARTWOOD'S HALLS are hollows in the elder trees and grown homes, floored
  // with the terrain itself: no deck, no footprint, so the meadow grew right
  // across the floors inside them. The city's own plan has each trunk (its
  // outer wall stands at 11.8 x scale, heartwood-city-build) and each home's
  // radius; nothing grows inside either.
  const hollows: [number, number, number][] = zoneKey === "heartwood"
    ? [...inspectHeartwoodCity().trees.map((t) => [t.x, t.z, t.scale * 11.8 + PAD] as [number, number, number]),
       ...inspectHeartwoodCity().homes.map((m) => [m.x, m.z, m.r + PAD] as [number, number, number])]
    : [];
  for (const [cx, cz, sx, sz] of zoneFootprints[zoneKey] || []) addRect(cx - sx / 2 - 0.5, cx + sx / 2 + 0.5, cz - sz / 2 - 0.5, cz + sz / 2 + 0.5, -Infinity);
  const grows = (x: number, z: number, out: { y: number }): number => {
    if (Math.abs(x) > size / 2 - 7 || Math.abs(z) > size / 2 - 7) return 0;
    const h = heightFn(x, z);
    out.y = h;
    if (waterBodies.some((w) => Math.hypot(x - w.x, z - w.z) < w.r && h < w.level + 0.2)) return 0;
    // vegetation's exclusions (rivers, shores, walls) -- but not the mineral
    // scatter's, which keep ROCKS 5-6m off every road centreline and would
    // hold the sward back from the road edge; the taper below does that job
    if (vegExclusions.some((f) => f(x, z))) return 0;
    // a built surface over the terrain is not ground; a house is not either
    for (const [x0, x1, z0, z1, y] of rects.get(`${Math.floor(x / B)},${Math.floor(z / B)}`) || [])
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && y > h - 0.3) return 0;
    if (onFloor(x, z, h)) return 0;
    for (const [hx, hz, hr] of hollows) if ((x - hx) ** 2 + (z - hz) ** 2 < hr * hr) return 0;
    // steep ground is rock (the terrain tints it so from 0.45): no sward
    // there. Forward differences: two samples, not four, per clump.
    const gx = (heightFn(x + 1.2, z) - h) / 1.2, gz = (heightFn(x, z + 1.2) - h) / 1.2;
    const steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - 0.3) / 0.25));
    // the lip of a road: short grass over the first two metres off the edge
    const edge = roadEdge(x, z);
    if (edge <= 0) return 0;
    let g = (1 - smooth(steep)) * (edge < 2 ? 0.25 + 0.375 * edge : 1);
    return g;
  };
  buildGrass(scene, meadowSpec(zoneKey), { grows }, zseed(zoneKey) + 777);
  const cfg = TERRAIN_TEX[zoneKey] || TERRAIN_TEX.moonmereshores, sc = scene;
  const t0 = Color3.FromHexString(cfg.tint[0]), t1 = Color3.FromHexString(cfg.tint[1]);
  groundSheetAverage(cfg.tex).then((base) => {
    const albedo = new Color3(base.r * (t0.r + t1.r) / 2, base.g * (t0.g + t1.g) / 2, base.b * (t0.b + t1.b) / 2);
    const { root, tip, far } = meadowColors(albedo);
    setGrassColors(sc, root, tip, far);
  });
}

function avoidPoints(zoneKey: string): [number, number, number][] {
  const def = ZONES[zoneKey];
  const pts: [number, number, number][] = [];
  (def.portals || []).forEach((p: any) => pts.push([p.x, p.z, 14]));
  (def.milestones || []).forEach((w: any) => pts.push([w.x, w.z, 10]));
  layoutNpcs(def).forEach((n: any) => pts.push([n.x, n.z, 10]));
  (def.landmarks || []).forEach((l: any) => pts.push([l.x, l.z, 12]));
  return pts;
}

// ---------- the zone rim ----------
//
// THE RIM IS ONE CHAIN OF MOUNTAINS STANDING ON THE ZONE'S OWN TERRAIN.
// See RIM.md. Every outdoor zone gets it from here; nothing else may build a
// second range behind it or a treeline in front of it.
//
// It used to be three things stacked, and each of the three was a mistake
// Philip could see from anywhere in the zone:
//
//   1. a TREELINE of two to four ranks just inside the playable edge,
//   2. a CRAG chain 30m OUTSIDE the edge, sunk 9-14m,
//   3. makeMountainRingCC0's two rings of 150-330m rock, 150-380m further out.
//
// "There are two kinds of mountains, the super big one behind and the smaller
// ones in front. We only need the smaller ones in front." So (3) is gone
// entirely -- the giant range behind reads as a separate, unreachable world and
// was the thing that made the horizon look painted on. "We also do not need the
// extra tree lines in front of the rim mountains": (1) is gone too. What is
// left is (2), promoted to BE the rim, and moved onto the ground.
//
// The placement is DERIVED, not picked, and that is the whole fix for the gaps:
//
//   reach = the rock's MEASURED inward half-extent x its scale
//   off   = half - bite + reach          (half = size / 2, the terrain edge)
//
// so the rock's inner face lands `bite` metres INSIDE the terrain edge whatever
// scale it drew -- every instance is rooted in real ground, and the void past
// the edge is hidden behind the rock that stands on it. The old chain used a
// fixed `size / 2 + 30` CENTRE, which is only correct for one scale: a big
// instance floated with a band of sky between the grass and its base, a small
// one stood clear of the ground altogether. That band is the "empty space
// between the edge of the terrain and the rim mountains".
//
// Two more things follow from the same derivation:
//
//   * The rocks are YAWED ALONG the rim, not randomly. A random yaw makes the
//     inward reach depend on the rotation as well as the scale, so the inner
//     face wanders by tens of metres and the alignment above stops meaning
//     anything. Aligned, the reach is the rock's depth and nothing else -- and
//     a ridge of rock lying along its own line reads better than a boulder pile.
//   * The walk STEPS BY THE ROCK'S OWN LENGTH, not by a constant. A fixed step
//     overlaps the big instances and leaves holes between the small ones, and
//     the holes are sky: there is nothing behind the rim any more to fill them.
//
// The ground height comes from the INNER contact point, which is on the real
// terrain mesh, rather than from the rock's centre, which is not.

// MEASURED at scale 1 (env_manifest_cc0.json, via tools/assets/measure_gltf.py):
//   inward  = the -z half-extent, the side that faces the interior when the
//             walk lays the rock along the rim unturned
//   outward = the +z half-extent, which faces the interior instead when the
//             walk gives the rock its half-turn
//   along   = the larger |x| half-extent, which sets the step
//   height  = full height, which sets how deep the base is buried
// The origins are NOT centred: Rock_Medium_3 is 0.89 deep on one side of its
// pivot and 2.59 on the other. The table used to hold only the smaller side,
// so a half-turned rock reached up to three times further inland than the
// derivation allowed for -- at scale 21 that was 54m past its centre, and a
// rim rock lay across the Canal Works' canal with the boundary 60m off
// (Philip: "mountain covering the river, move mountain back"). The reach now
// takes whichever side the turn puts inward.
// A file missing here falls back to Rock_Big_1's numbers, which is the right
// shape of wrong: it over-reaches rather than leaving a hole.
const RIM_ROCK: Record<string, { inward: number; outward: number; along: number; height: number }> = {
  "nature/Rock_Big_1.gltf":    { inward: 2.000, outward: 2.447, along: 2.814, height: 4.576 },
  "nature/Rock_Big_2.gltf":    { inward: 3.005, outward: 2.811, along: 2.932, height: 3.806 },
  "nature/Rock_Medium_1.gltf": { inward: 1.150, outward: 1.839, along: 1.727, height: 2.260 },
  "nature/Rock_Medium_2.gltf": { inward: 1.159, outward: 1.320, along: 1.714, height: 1.899 },
  "nature/Rock_Medium_3.gltf": { inward: 0.890, outward: 2.586, along: 1.824, height: 2.316 },
  "nature/Rock_Medium_4.gltf": { inward: 1.709, outward: 1.897, along: 2.321, height: 2.483 },
};
const RIM_ROCK_FALLBACK = RIM_ROCK["nature/Rock_Big_1.gltf"];

// ---------- rim passes: an exit is a cut through the chain ----------
//
// Philip, 2026-10-10: "the road runs into a cut through the chain, walls
// either side, for a stretch, before reaching the veil". A field-to-field exit
// used to stand ~50m inside the plate at the foot of an unbroken chain (RIM.md
// "It breaks only for a reason") -- a doorway painted on a mountain. A pass is
// the reason: the road walks into a gorge, rock both sides, and the Dawn Veil
// stands across its far end with rock closing the view behind it.
//
// The pass is made ONCE at module load from the zone's data and its shape, so
// the three things that must agree about where the gorge is -- the height
// function's floor, the scatters' exclusion and the rim's rocks -- all read one
// object. The PORTAL'S x, z IS the veil (the data stays the single source of
// truth for where you leave); the pass only builds the gorge round it.
//
// Its frame: `u` is the axis INTO the zone (the nearest land edge's inward
// normal, averaged over 60m so one wander of shapeDetail does not tilt it).
// Along the centreline, from the field inward to out:
//   R  run-in end   the floor blends back into the field over RUN metres
//   M  mouth        where the walls begin (the stretch is `depth` long)
//   K  knee         halfway; the mouth half may turn off the axis by `bend`
//   V  the veil     `width` across, wall to wall
//   B  back         CAP metres behind the veil, where the cap rock's face is
export interface RimPassSpec {
  portal?: string;              // the zones.json portal id whose x, z is the veil
  x?: number; z?: number;       // or the veil's point directly
  width?: number;               // the corridor's design width at the veil (default 14; built, ~20 -- see the veil)
  depth?: number;               // the walled stretch in front of the veil (default 45)
  flare?: number;               // mouth width / veil width (default 1.35)
  bend?: number;                // radians the mouth half turns off the axis (default 0)
  dir?: [number, number];       // the axis INTO the zone, if the edge's normal is wrong
}
/** Where the Dawn Veil stands in a pass. `yaw` is a Babylon rotation.y that
 *  turns local +z to (nx, nz), the way INTO the zone; local x spans `width`. */
export interface RimVeil { x: number; z: number; yaw: number; width: number; nx: number; nz: number }
export interface RimPass {
  portal?: string;
  veil: RimVeil;
  /** the road's centreline from just in front of the veil out to the mouth */
  road: [number, number][];
  /** a landing `ahead` metres in front of the veil (default 10), on the axis */
  landing(ahead?: number): [number, number];
  /** the floor, as a carve (registerZone `passes` applies it; see fieldHeight) */
  carve(x: number, z: number, h: number, pre?: (px: number, pz: number) => number): number;
  /** true inside the gorge and its run-in: nothing is scattered there */
  blocks(x: number, z: number): boolean;
  /** inside the walled corridor, mouth to back, widened by `pad` (and by
   *  `past` beyond either end, `pad` unless given) */
  inside(x: number, z: number, pad: number, past?: number): boolean;
  /** the centreline B..M (back to mouth) and its half widths, for the walls */
  spine: { pts: [number, number][]; half: number[] };
  /** what the last build stood in the gorge, for QA (tmp audits read it) */
  placed: { file: string; x: number; z: number; rot: number; crown: number; inward: number; along: number; part: string }[];
}
// How far behind the veil the cap rock's face stands. Enough that the rock's
// mid-height bulge (a fifth of its reach) clears the veil's head.
const PASS_CAP = 8;
// How far past the mouth the floor blends back into the field.
const PASS_RUN = 24;
// How far the floor's edge blends into the ground under the walls.
const PASS_BLEND = 14;

// a polyline's nearest point: distance, segment, t, and how far PAST either end
// the point lies along that end's direction (0 when it projects inside)
function polyLocate(pts: [number, number][], x: number, z: number): { d: number; i: number; t: number; past: number } {
  let best = { d: Infinity, i: 0, t: 0, past: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [d, t] = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best.d) best = { d, i, t, past: 0 };
  }
  const n = pts.length;
  if (best.i === 0 && best.t === 0) {
    const [ax, az] = pts[0], [bx, bz] = pts[1], L = Math.hypot(bx - ax, bz - az) || 1;
    best.past = Math.max(0, -((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L);
  } else if (best.i === n - 2 && best.t === 1) {
    const [ax, az] = pts[n - 2], [bx, bz] = pts[n - 1], L = Math.hypot(bx - ax, bz - az) || 1;
    best.past = Math.max(0, ((x - bx) * (bx - ax) + (z - bz) * (bz - az)) / L);
  }
  return best;
}

export function makeRimPass(zoneKey: string, shape: ZoneShape | undefined, spec: RimPassSpec): RimPass {
  const def = ZONES[zoneKey] || {};
  const half = (def.size ?? 700) / 2;
  const portal = spec.portal ? ((def.portals as any[]) || []).find((p: any) => p.id === spec.portal) : undefined;
  if (spec.portal && !portal) throw new Error(`makeRimPass: no portal ${spec.portal} in ${zoneKey}`);
  const vx = portal ? portal.x : spec.x!, vz = portal ? portal.z : spec.z!;
  const width = spec.width ?? 14, depth = spec.depth ?? 45, flare = spec.flare ?? 1.35, bend = spec.bend ?? 0;
  // the axis: the land edges' inward normal near the veil, each weighted by
  // its length over its distance (a square zone's sides are its land edges)
  let ux = 0, uz = 0;
  if (spec.dir) [ux, uz] = spec.dir;
  else {
    const pts = shape ? shape.pts : [[-half, -half], [half, -half], [half, half], [-half, half]] as [number, number][];
    const land = shape ? shape.coast.map((c) => !c) : [true, true, true, true];
    // a square's corners above run counter-clockwise; flip so interior is RIGHT
    // of travel for both, as buildRimMountains' runs assume
    const sgn = shape ? 1 : -1;
    for (let i = 0; i < pts.length; i++) {
      if (!land[i]) continue;
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const [d] = segDist(vx, vz, ax, az, bx, bz);
      if (d > 60) continue;
      const w = L / (1 + d);
      ux += sgn * (bz - az) / L * w; uz += sgn * -(bx - ax) / L * w;
    }
    if (!ux && !uz) { ux = -vx; uz = -vz; }   // no land edge near: face the zone's heart
  }
  const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
  const B: [number, number] = [vx - ux * PASS_CAP, vz - uz * PASS_CAP];
  // The terrain mesh stops at the square: a back end past it would show the
  // void under the cap rock's skirt. Warn rather than move the veil -- the data
  // says where the exit is, and silently disagreeing with it is worse.
  if (Math.max(Math.abs(B[0]), Math.abs(B[1])) > half - 4) {
    console.warn(`makeRimPass ${zoneKey}/${spec.portal ?? ""}: the cap stands ${Math.max(Math.abs(B[0]), Math.abs(B[1])).toFixed(0)}m out, past the terrain (${half - 4}); move the veil inward`);
  }
  const K: [number, number] = [vx + ux * depth * 0.5, vz + uz * depth * 0.5];
  const cb = Math.cos(bend), sb = Math.sin(bend);
  const bx = ux * cb - uz * sb, bz = ux * sb + uz * cb;   // the mouth half's direction, turned
  const M: [number, number] = [K[0] + bx * depth * 0.5, K[1] + bz * depth * 0.5];
  const R: [number, number] = [M[0] + bx * PASS_RUN, M[1] + bz * PASS_RUN];
  const hv = width / 2, hm = hv * flare;
  // from the field inward: R, M, K, V, B. The back NARROWS -- the gorge closes
  // into rock behind the veil rather than ending on a flat wall.
  const line: [number, number][] = [R, M, K, [vx, vz], B];
  const halves = [hm + 6, hm, (hm + hv) / 2, hv, hv * 0.8];
  const reach = Math.max(...halves) + PASS_BLEND;
  const bb = line.reduce((b, [x, z]) => [Math.min(b[0], x - reach), Math.min(b[1], z - reach), Math.max(b[2], x + reach), Math.max(b[3], z + reach)], [1e9, 1e9, -1e9, -1e9]);
  const segLen = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
  // the floor: level with the field at the mouth, a gentle ramp to the veil
  // (never steeper than 1 in 10, however the field rolls under the rim), flat
  // behind it. Measured off `pre`, the height before any carve, once per build.
  let floorFor: unknown = null, hM = 0, hV = 0;
  const floorAt = (i: number, t: number): number => {
    if (i === 0) return hM;
    if (i >= 3) return hV;
    const s = (i === 1 ? t * segLen[1] : segLen[1] + t * segLen[2]) / (segLen[1] + segLen[2]);
    return hM + (hV - hM) * smooth(s);
  };
  // The veil spans the gorge as BUILT, not as designed: the walls stand on
  // their furthest bulge, so the faces recede behind the design line wherever
  // the rock is cut back -- MEASURED on the North Road's two passes, 3m each
  // side on average at the veil. A veil sized to `width` left a strip of bare
  // rock at both sides; its soft edges take up the variation.
  const veil: RimVeil = { x: vx, z: vz, yaw: Math.atan2(ux, uz), width: width + 6, nx: ux, nz: uz };
  return {
    portal: spec.portal,
    veil,
    placed: [],
    road: [[vx + ux * 2.5, vz + uz * 2.5], K, M],
    landing: (ahead = 10) => [Math.round((vx + ux * ahead) * 10) / 10, Math.round((vz + uz * ahead) * 10) / 10],
    spine: { pts: [B, [vx, vz], K, M], half: [halves[4], halves[3], halves[2], halves[1]] },
    carve(x, z, h, pre) {
      if (x < bb[0] || z < bb[1] || x > bb[2] || z > bb[3]) return h;
      const q = polyLocate(line, x, z);
      const hw = halves[q.i] + (halves[q.i + 1] - halves[q.i]) * q.t;
      const wl = q.d <= hw ? 1 : smooth(Math.max(0, 1 - (q.d - hw) / PASS_BLEND));
      // the run-in fades the floor out into the field, and nothing past R
      const wa = q.i === 0 ? smooth(q.past > 0 ? 0 : q.t) : 1;
      const w = wl * wa;
      if (w <= 0) return h;
      if (floorFor !== pre) {
        floorFor = pre;
        const H = pre ?? heightFn;
        hM = H(M[0], M[1]);
        const run = segLen[1] + segLen[2];
        hV = Math.max(hM - run * 0.1, Math.min(hM + run * 0.1, H(vx, vz)));
      }
      return h + (floorAt(q.i, q.t) - h) * w;
    },
    blocks(x, z) {
      if (x < bb[0] || z < bb[1] || x > bb[2] || z > bb[3]) return false;
      const q = polyLocate(line, x, z);
      if (q.i === 0 && q.t < 0.55) return false;   // only the first half of the run-in
      return q.d < halves[q.i] + (halves[q.i + 1] - halves[q.i]) * q.t + 5;
    },
    inside(x, z, pad, past = pad) {
      const q = polyLocate(line.slice(1), x, z);
      const hs = halves.slice(1);
      return q.past <= past && q.d < hs[q.i] + (hs[q.i + 1] - hs[q.i]) * q.t + pad;
    },
  };
}
/** the veil of the pass a portal stands in, if its zone built one (buildPortals) */
export function rimVeil(zoneKey: string, portal: { id?: string; x: number; z: number }): RimVeil | undefined {
  return ZONE_MODULES[zoneKey]?.passes?.find((p) =>
    (p.portal && p.portal === portal.id) || Math.hypot(p.veil.x - portal.x, p.veil.z - portal.z) < 3)?.veil;
}

interface RimOpts {
  rocks?: string[];       // the chain's species, dealt at random along the walk
  scale?: [number, number];
  tint?: string;
  snow?: boolean;         // SnowCapPlugin on the crowns (a winter rim goes UNTINTED)
  // How close a rock's FACE may come to a plain portal, in metres. The chain
  // does NOT break for a portal any more: it used to drop every rock within
  // 80m of one, and that hole was the horizon -- "cover with rim mountains so
  // players don't see the end of the zone" (Philip, four zones running). A
  // plain exit now stands ~50m inside the plate at the foot of an unbroken
  // chain, and this keeps the nearest faces off it. A `built` or `crossing`
  // portal gets nothing automatic and its zone says what it needs (faceClear,
  // extraClear, clearWhere). (The old 80m centre clear for an unbuilt gate into
  // a city went with buildPortals' generic gate wall and skyline: no such
  // portal exists, and the veil has no masonry behind it to make room for.)
  gateClear?: number;
  // How far inside the terrain edge the inner face lands. Bounded above by the
  // SERVER's own clamp: world.rb holds the player at size / 2 - 2, so a bite
  // much past that puts a rock face where someone can stand inside it.
  bite?: [number, number];
  extraClear?: [number, number, number][]; // a landmark the rim must not stand in
  // Like extraClear, but the radius is measured to the rock's FACE rather than
  // to its centre -- "no mountain within r of this" instead of "no mountain's
  // midpoint within r of this". A gate wants this and a hole in the chain does
  // not: at a centre-based radius the break has to be as wide as a mountain is
  // long before the gate stops being buried, and then it is a hole. Opt-in,
  // because widening every break by a rock's length would open the chain up
  // everywhere it is allowed to break at all.
  // A fourth number SETS THE ROCKS BACK instead of dropping them: each chain
  // rock in the break stands with its furthest bulge (measured, like the
  // passes') that many metres OUTSIDE the land edge, behind the gate's wall. A gate in a wall lower than the rim
  // otherwise shows the end of the zone over its wall (MEASURED 2026-10-10,
  // the Caerdun Fields' Landward Gate: 64 rays saw the void either side of it).
  faceClear?: [number, number, number, number?][];
  // Where the rim may not stand, when circles cannot say it. An OCEAN is the
  // case that needs this: it is not a disc, it leaves the zone, and the only
  // honest test for "this rock would be standing in the sea" is to ask the
  // height function.
  clearWhere?: (x: number, z: number) => boolean;
  yaw?: number;           // how far off the rim line a rock may turn, radians
  // The exits that are cuts through the chain (makeRimPass). Defaults to the
  // zone module's own `passes`, which is where a zone should declare them: the
  // height function needs the same objects for the gorge's floor.
  passes?: RimPass[];
}

// The one rim builder. Call it once per outdoor zone and never twice.
function buildRimMountains(zoneKey: string, size: number, seed: number, o: RimOpts = {}): void {
  const rand = seededRand(seed);
  const portals = (((ZONES[zoneKey] || {}).portals as any[]) || []).filter((pt: any) => !pt.built && !pt.crossing);
  const passes = o.passes ?? ZONE_MODULES[zoneKey]?.passes ?? [];
  const inPass = (pt: any) => passes.some((p) => (p.portal && p.portal === pt.id) || Math.hypot(p.veil.x - pt.x, p.veil.z - pt.z) < 3);
  // a portal in a pass needs no face clearance: the gorge IS its clearance,
  // and a 16m face break round a veil at the plate edge would open the chain
  // beside the gorge's walls
  const plainGates = portals.filter((pt: any) => !inPass(pt));
  const clear = o.extraClear || [];
  const faceClear: [number, number, number, number?][] = (o.faceClear || []).concat(plainGates.map((pt: any) => [pt.x, pt.z, o.gateClear ?? 16] as [number, number, number]));
  // SIX species by default, not two, and no rock may follow itself. Philip:
  // "the rim mounts are highly repetitive, using the same mountains next to
  // each other is a no-no". Two files dealt at random put the same silhouette
  // beside itself a quarter of the time, and a ridge is exactly where that
  // reads as wallpaper -- the eye follows a horizon line and finds the repeat.
  const files = o.rocks ?? [
    "nature/Rock_Big_1.gltf", "nature/Rock_Big_2.gltf", "nature/Rock_Medium_1.gltf",
    "nature/Rock_Medium_2.gltf", "nature/Rock_Medium_3.gltf", "nature/Rock_Medium_4.gltf",
  ];
  const [s0, s1] = o.scale ?? [9, 14];
  // The walk is in METRES OF CROWN, not in scale factor, and that is what lets
  // the species vary at all: Rock_Medium_2 is 1.9m tall and Rock_Big_1 4.58m,
  // so one shared scale sequence would step 40m up and down the skyline every
  // time the deal changed file. Walking the HEIGHT keeps neighbours the same
  // mountain (RIM.md's rule, and the reason the scale walks rather than being
  // redrawn) while leaving the silhouette free. The range is stated in the old
  // units so `scale: [9, 14]` still means the 41-64m ridge RIM.md documents.
  const REF_H = RIM_ROCK["nature/Rock_Big_1.gltf"].height;
  const [h0, h1] = [s0 * REF_H, s1 * REF_H];
  const [b0, b1] = o.bite ?? [8, 16];
  const yawMax = o.yaw ?? 0.5;
  const half = size / 2;
  const shape = ZONE_SHAPES[zoneKey];
  const spots: Record<string, { x: number; z: number; scale: number; rot: number; yOff?: number;
                                sx?: number; sy?: number; sz?: number }[]> = {};
  for (const f of files) spots[f] = [];

  // (the BURY / GRIP derivation is unchanged -- see RIM.md)
  const BURY = 0.2;
  const GRIP = Math.sqrt(Math.max(0.05, 1 - (1 - 2 * BURY) ** 2)) * Math.sqrt(1 - 0.55 ** 2);
  // One dealer per walk, each on its own random stream: the chain deals exactly
  // as it always did, and a pass's walls (their own stream) never reshuffle it.
  // kx / kz stretch the deal along / across (a gorge wall is long and steep).
  const dealer = (rand: () => number) => {
    let lastFile = "";
    return (crown: number, kx = 1, kz = 1, yaw = yawMax) => {
      // never the same rock twice running
      const pool = files.length > 1 ? files.filter((f) => f !== lastFile) : files;
      const file = pool[Math.floor(rand() * pool.length)];
      lastFile = file;
      const m = RIM_ROCK[file] ?? RIM_ROCK_FALLBACK;
      const scale = crown / m.height;
      // Per-axis STRETCH, which is the second half of the anti-repetition fix: a
      // stretched instance of a rock is a different mountain, and a squashed one
      // is another again. Kept modest -- past ~1.3 the faceting reads as a
      // scaling artefact rather than as a landform.
      const sy = scale * (0.9 + rand() * 0.28);
      const sx = scale * (0.9 + rand() * 0.34) * kx;
      const sz = scale * (0.9 + rand() * 0.34) * kz;
      // A HALF-TURN as well as the wander. The same mesh presents a different
      // profile from behind, so the flip doubles the vocabulary for free.
      // (two draws in this order, so every zone's chain deals as it did)
      const wobble = (rand() - 0.5) * yaw;
      const flipped = rand() < 0.5;
      const dr = wobble + (flipped ? Math.PI : 0);
      const c = Math.abs(Math.cos(dr)), sn = Math.abs(Math.sin(dr));
      // Each reach takes ITS OWN axis's scale. RIM_ROCK's `along` is the model's
      // larger (local X) half-extent and `inward` the smaller (local Z) one, and
      // scatterMatrices applies sx to X and sz to Z -- so a single "larger of the
      // two" was wrong in the direction that matters: it OVERSTATED `along`,
      // which is what sizes the step, and the walk spread the chain out until a
      // wedge of sky opened between two rocks on the east border.
      // unturned, local -z faces the interior (rot = atan2(-uz, ux) maps local
      // +z onto the OUTWARD normal); the half-turn swaps which side reaches in
      const alongL = m.along * sx, inwardL = (flipped ? m.outward : m.inward) * sz;
      return {
        file, m, scale, dr, sx, sy, sz, flipped,
        inward: inwardL * c + alongL * sn,
        along: alongL * c + inwardL * sn,
        crownH: m.height * sy,
      };
    };
  };
  const draw = dealer(rand);
  let crown = h0 + rand() * (h1 - h0);
  const step = () => (crown = Math.min(h1, Math.max(h0, crown + (rand() - 0.5) * (h1 - h0) * 0.5)));

  // The runs the chain walks. A zone with a SHAPE walks its land edges -- the
  // coast edges are where the water leaves and a chain standing in the sea is
  // worse than a fogged horizon (RIM.md). A zone without one still walks the
  // four sides of its square, which is what every old zone is.
  type Run = { ax: number; az: number; bx: number; bz: number };
  const runs: Run[] = [];
  if (shape) {
    const n = shape.pts.length;
    for (let i = 0; i < n; i++) {
      if (shape.coast[i]) continue;
      const [ax, az] = shape.pts[i], [bx, bz] = shape.pts[(i + 1) % n];
      runs.push({ ax, az, bx, bz });
    }
  } else {
    runs.push({ ax: -half, az: -half, bx: half, bz: -half });
    runs.push({ ax: half, az: half, bx: -half, bz: half });
    runs.push({ ax: -half, az: half, bx: -half, bz: -half });
    runs.push({ ax: half, az: -half, bx: half, bz: half });
  }

  // A PASS'S GORGE (makeRimPass): two walls of the chain's own rocks lining
  // the corridor from the back to the mouth, and a cap across the back. Same
  // files and the same placeExact options, so the templates are the chain's
  // own (tinted, snowed) and a gorge adds instances to the rim's thin-instance
  // buffers and no draw call of its own.
  //
  // A wall rock is a chain rock turned through a right angle: its long axis
  // runs WITH the corridor and its inner face is the gorge wall. Stretched
  // longer (kx) and thinner (kz) than a chain rock so its face stands steep,
  // and its crown falls from the chain's height at the back to ~0.7 of it at
  // the mouth -- the walls read as spurs of the chain running down into the
  // field, not as a second range. Colliders are oriented boxes, not the
  // chain's circles: a circle big enough for the rock would stand in the
  // corridor.
  //
  // The gorge is placed off the rocks' MEASURED footprints, not RIM_ROCK's
  // boxes, and that is why it waits for the templates. MEASURED 2026-10-10:
  // the generated mountain stones are not the kit rocks the table was measured
  // on -- Rock_Medium_3 reaches 1.74 toward -z, not 0.89 -- and they are widest
  // at the FOOT, so the bury's ellipsoid ground cut (RIM.md's GRIP) does not
  // apply: a wall placed by the box stood 6m into the corridor on one side and
  // 9m off it on the other, and the east cap's cliff cuts left a 90m view out
  // of the back at ground level. A 20m corridor has no room for either.
  type Deal = ReturnType<ReturnType<typeof dealer>>;
  // The footprint at the ground cut (local y from BURY to BURY + 15% of the
  // height): how far the rock reaches toward -z and +z across its middle, the
  // most (a wall must never stand in the corridor) and the least (a cap must
  // never leave a window), and its half length.
  type Foot = { negMax: number; negMin: number; posMax: number; posMin: number; half: number; h: number };
  const footOf = (t: Mesh | null): Foot | null => {
    const pos = t?.getVerticesData("position");
    if (!t || !pos) return null;
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]);
      x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]);
    }
    const h = y1 - y0, lo = y0 + h * BURY, hi = lo + h * 0.15, half = Math.max(-x0, x1);
    // the middle of the face in eight strips: per strip the furthest vertex
    // each way, then the most and least of those
    const N = 8, neg = new Array(N).fill(0), pos2 = new Array(N).fill(0);
    let ex = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (y < lo || y > hi) continue;
      ex = Math.max(ex, Math.abs(x));
      const k = Math.floor(((x / half) * 0.5 + 0.5) * N);
      if (k < 1 || k > N - 2) continue;              // the rounded ends are not the face
      neg[k] = Math.max(neg[k], -z); pos2[k] = Math.max(pos2[k], z);
    }
    const mid = (a: number[]) => a.slice(1, N - 1);
    return { negMax: Math.max(...mid(neg)), negMin: Math.min(...mid(neg)), posMax: Math.max(...mid(pos2)), posMin: Math.min(...mid(pos2)), half: ex || half, h };
  };
  // A rock stood off its template's MEASURED footprint (footOf): its reach,
  // and standing it with a face on a line. The passes' gorges use it, and so
  // do the rocks a gate's break sets back (faceClear's fourth number).
  const stander = (foot: Record<string, Foot | null>, out: Record<string, typeof spots[string]>,
                   placed: RimPass["placed"] | null) => {
    // a deal's measured reach toward the corridor (most / least) and along
    // it, in metres, its turn included
    const reach = (r: Deal) => {
      const f = foot[r.file];
      const c = Math.abs(Math.cos(r.dr)), sn = Math.abs(Math.sin(r.dr));
      const nMax = f ? (r.flipped ? f.posMax : f.negMax) : (r.flipped ? r.m.outward : r.m.inward);
      const nMin = f ? (r.flipped ? f.posMin : f.negMin) : nMax * 0.6;
      const al = (f ? f.half : r.m.along) * r.sx;
      return { most: nMax * r.sz * c + al * sn, least: nMin * r.sz * c, along: al * c + nMax * r.sz * sn, crown: (f ? f.h : r.m.height) * r.sy,
               // the same, in the rock's own (turned) frame, for its collider
               own: { most: nMax * r.sz, least: nMin * r.sz, along: al } };
    };
    // stand rock r with its face on (fx, fz), facing the corridor along
    // (cx, cz): the run direction is the one that keeps the corridor on its
    // RIGHT (the chain's convention). `by` is which reach lands on the face.
    // `lift`: as much taller as the ground at its face stands over its seat,
    // like a chain rock (the chain loop below says why)
    const stand = (part: string, r: Deal, fx: number, fz: number, cx: number, cz: number, by: "most" | "least", lift = false) => {
      const R = reach(r), off = R[by];
      const dx = -cz, dz = cx;
      const x = fx - cx * off, z = fz - cz * off, rot = Math.atan2(-dz, dx) + r.dr;
      // lowest ground under the footprint, face to back (RIM.md)
      let gy = Infinity, gIn = 0;
      for (let a = -0.8; a <= 0.81; a += 0.4) {
        for (const b of [-0.6, 0, 0.6, 1]) gy = Math.min(gy, heightFn(x + dx * a * R.along + cx * b * off, z + dz * a * R.along + cz * b * off));
        gIn += heightFn(fx + dx * a * R.along, fz + dz * a * R.along) / 5;
      }
      const ky = lift ? Math.min(1.6, 1 + Math.max(0, gIn - gy) / ((1 - BURY) * R.crown)) : 1;
      out[r.file].push({ x, z, scale: r.scale, rot, sx: r.sx, sy: r.sy * ky, sz: r.sz, yOff: gy - heightFn(x, z) - R.crown * ky * BURY });
      // The box turns WITH the rock and reaches its furthest bulge, the line
      // it was stood on: where the face recedes it stands a few metres off
      // the rock, which RIM.md prefers to a mountain anyone can walk into.
      // (An unturned box sized to the turned reach stood the corner of a 60m
      // rock's turn -- ~5m -- out in the corridor along its whole length.)
      boxColliders.push({ cx: x, cz: z, hx: R.own.along * 0.75, hz: by === "most" ? R.own.most : R.own.least, sin: Math.sin(rot), cos: Math.cos(rot), y1: 1e6, y0: -1e9 });
      placed?.push({ file: r.file, x, z, rot, crown: R.crown, inward: off, along: R.along, part });
      return R;
    };
    return { reach, stand };
  };
  const passRocks = (p: RimPass, prand: () => number, foot: Record<string, Foot | null>,
                     out: Record<string, typeof spots[string]>) => {
    const deal = dealer(prand);
    p.placed.length = 0;
    const { reach, stand } = stander(foot, out, p.placed);
    const { pts, half: hw } = p.spine;            // back, veil, knee, mouth
    let wc = h0 + prand() * (h1 - h0);
    for (const side of [1, -1]) {
      // the wall line: the spine offset by its half width, vertex by vertex
      // (each vertex takes the mean of its segments' normals)
      const wall: [number, number][] = [], toC: [number, number][] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
        const lx = (ez / el) * side, lz = (-ex / el) * side;     // out from the spine
        wall.push([pts[i][0] + lx * hw[i], pts[i][1] + lz * hw[i]]);
        toC.push([-lx, -lz]);
      }
      const cum = [0];
      for (let i = 1; i < wall.length; i++) cum.push(cum[i - 1] + Math.hypot(wall[i][0] - wall[i - 1][0], wall[i][1] - wall[i - 1][1]));
      const Lw = cum[cum.length - 1];
      const at = (t: number): [number, number, number, number] => {
        let i = 0;
        while (i < wall.length - 2 && cum[i + 1] < t) i++;
        const f = Math.max(0, Math.min(1, (t - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
        const cx = toC[i][0] + (toC[i + 1][0] - toC[i][0]) * f, cz = toC[i][1] + (toC[i + 1][1] - toC[i][1]) * f;
        const cl = Math.hypot(cx, cz) || 1;
        return [wall[i][0] + (wall[i + 1][0] - wall[i][0]) * f, wall[i][1] + (wall[i + 1][1] - wall[i][1]) * f, cx / cl, cz / cl];
      };
      // the crown walks like the chain's, and falls toward the mouth
      const crownAt = (t: number) => {
        wc = Math.min(h1, Math.max(h0, wc + (prand() - 0.5) * (h1 - h0) * 0.5));
        return wc * (1 - 0.3 * Math.min(1, t / Lw));
      };
      // the mouth rock first, so the walk from the back can close on it: its
      // rounded end stands a quarter of its length past the mouth
      const mouth = deal(h0 * 0.85, 1.15, 0.8, 0.24);
      const mAlong = reach(mouth).along;
      const tM = Lw - mAlong * 0.75;
      let t = 0, cur = deal(crownAt(0), 1.15, 0.8, 0.24);
      while (tM > 0) {
        const [fx, fz, cx, cz] = at(t);
        const R = stand(`wall${side}`, cur, fx, fz, cx, cz, "most");
        if (tM - t <= (R.along + mAlong) * 0.55) break;
        const nxt = deal(crownAt(t), 1.15, 0.8, 0.24);
        t += (R.along + reach(nxt).along) * 0.55;
        cur = nxt;
      }
      const [fx, fz, cx, cz] = at(Math.max(0, tM));
      stand(`mouth${side}`, mouth, fx, fz, cx, cz, "most");
    }
    // THE CAP: three rocks across the back, so the gorge ends in rock and the
    // eye never finds the void. Each stands on its MOST reach -- no bulge
    // comes forward of B, which is what keeps the veil clear (stood on its
    // least, a cap's bulge came out in front of the veil and cut it in half).
    // Three, not one, because the face then recedes where the rock's cliff
    // cuts are, and one rock alone left a window at its foot (the east cap
    // above); and each is the FLATTEST face of three deals (least spread
    // between most and least), turned whichever way presents it, so the
    // recess is small. LOWER than the walls -- a pass's saddle, sky
    // above it -- or from the field the cap filled the slot with the same rock
    // and the cut read as one more stretch of chain. The outer two overlap the
    // walls' back ends.
    const [bx, bz] = pts[0], [vx, vz] = pts[1];
    const bl = Math.hypot(vx - bx, vz - bz) || 1;
    const ux = (vx - bx) / bl, uz = (vz - bz) / bl;
    const flattest = (crown: number): Deal => {
      let best: Deal | null = null, spread = Infinity;
      for (let i = 0; i < 3; i++) {
        const d = deal(crown, 1, 1, 0.2), f = foot[d.file];
        if (!f) return d;
        for (const flip of [false, true]) {
          const sp = (flip ? f.posMax - f.posMin : f.negMax - f.negMin) / (flip ? f.posMax : f.negMax);
          if (sp < spread) { spread = sp; best = { ...d, flipped: flip, dr: (d.dr + (d.flipped !== flip ? Math.PI : 0)) }; }
        }
      }
      return best!;
    };
    for (const [lat, k, back] of [[0, 0.72, 0], [1, 0.82, 4], [-1, 0.82, 4]] as [number, number, number][]) {
      const cap = flattest(h1 * k);
      const ox = -uz * lat * hw[0] * 1.6 - ux * back, oz = ux * lat * hw[0] * 1.6 - uz * back;
      stand(lat ? "capside" : "cap", cap, bx + ox, bz + oz, ux, uz, "most");
    }
    // THE SHOULDERS: the chain rocks the corridor test dropped (above) left
    // the rim line open between each wall's outer flank and the first chain
    // rock still standing -- MEASURED 2026-10-10, 30-60m either side of every
    // pass, open to the void from above and from a pulled-back camera
    // (Philip, Moonmere Shores: "this rim mountain is not fully enclosed,
    // players can see and walk to the end of the zone"). So from each flank
    // chain-sized rocks walk ALONG THE LAND EDGE, faces on their most reach
    // `bite` inside it, until one meets a chain rock the walk kept. Chain
    // rocks in the chain's place, in the chain's buffers: still one chain, and
    // no draw call. Last in the pass's stream, so the walls and caps deal as
    // they did.
    const U = alongEdge(vx, vz, 0, 1);
    if (!U) return;
    let sc = (h0 + h1) / 2;
    for (const dir of [1, -1]) {
      const ex = -U.nz * dir, ez = U.nx * dir;               // along the rim, away from the axis
      const lat = (x: number, z: number) => (x - vx) * ex + (z - vz) * ez;
      const dep = (x: number, z: number) => (x - vx) * U.nx + (z - vz) * U.nz;
      // the flank: how far this side's gorge rocks reach along the rim line --
      // a wall by its thickness where its length crosses the line, a cap by
      // its length
      let s = 0;
      for (const q of p.placed) {
        const l = lat(q.x, q.z);
        if (l <= 0) continue;
        if (q.part.startsWith("cap")) s = Math.max(s, l + q.along);
        else if (Math.abs(dep(q.x, q.z)) < q.along * 0.8) s = Math.max(s, l + q.inward);
      }
      // a chain rock covers the rim line at s: near the line, and its
      // overlap span (0.55 of its reach, the walk's own) takes s in
      const covered = (s: number) => chainKept.some((k) => {
        const l = lat(k.x, k.z), w = dep(k.x, k.z);
        return w > -70 && w < 30 && l - k.along * 0.55 <= s && l + k.along * 0.55 > s;
      });
      for (let n = 0, tries = 0; n < 5 && tries < 9; tries++) {
        if (covered(s)) break;
        sc = Math.min(h1, Math.max(h0, sc + (prand() - 0.5) * (h1 - h0) * 0.5));
        let r = deal(sc);
        let R = reach(r);
        const c = s + R.along * 0.55;
        const at = alongEdge(vx, vz, c, dir);
        if (!at) break;                                       // the land edge ends at a coast
        const bite = Math.max(4, b0 + prand() * (b1 - b0));
        const fx = at.x + at.nx * bite, fz = at.z + at.nz * bite;
        const tx = -at.nz, tz = at.nx;                        // the run there
        // the chain's own breaks hold for a shoulder too: a gate, a
        // landmark, the sea
        const cx = fx - at.nx * R.most, cz = fz - at.nz * R.most;
        if (clear.some(([qx, qz, qr]) => Math.hypot(cx - qx, cz - qz) < qr)) break;
        if (faceClear.some(([qx, qz, qr]) => Math.hypot(cx - qx, cz - qz) - R.along * 0.55 < qr)) break;
        if (o.clearWhere?.(cx, cz)) break;
        // never into a corridor, its own or a neighbour's -- neither its body
        // (round its footprint) nor its collider (the turned box stand() gives
        // it, corners and all: a box's corner stood in the next pass's veil,
        // MEASURED, King's Gardens): smaller first, then a little further along
        const inAny = (rr: Deal, RR: ReturnType<typeof reach>) => {
          const x = fx - at.nx * RR.most, z = fz - at.nz * RR.most;
          const rot = Math.atan2(-tz, tx) + rr.dr, cs = Math.cos(rot), sn = Math.sin(rot);
          const hx = RR.own.along * 0.75, hz = RR.own.most;
          const box = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].map(([a, b]) =>
            [x + a * hx * cs + b * hz * sn, z - a * hx * sn + b * hz * cs]);
          return passes.some((pp) => pp.inside(x, z, 1.5) || box.some(([bx, bz]) => pp.inside(bx, bz, 1.5)) || FOOT_RING.some(([a, b]) =>
            pp.inside(x + tx * a * RR.along + at.nx * b * RR.most, z + tz * a * RR.along + at.nz * b * RR.most, 1.5)));
        };
        if (inAny(r, R)) {
          const small = [0.8, 0.65].map((f) => shrinkDeal(r, f)).find((rr) => !inAny(rr, reach(rr)));
          if (!small) { s += R.along * 0.25; continue; }
          r = small; R = reach(r);
        }
        stand(`shoulder${dir}`, r, fx, fz, at.nx, at.nz, "most", true);
        s = c + R.along * 0.55;
        n++;
      }
    }
  };
  // The land edge as one loop, walked from the point nearest (x0, z0): the
  // point `dist` metres along it (dir +1 with the runs, -1 against) and the
  // inward normal there, or null where the walk reaches a coast.
  const loopPts: [number, number][] = shape ? shape.pts : [[-half, -half], [half, -half], [half, half], [-half, half]];
  const loopLand = (i: number) => !shape || !shape.coast[i];
  const alongEdge = (x0: number, z0: number, dist: number, dir: number): { x: number; z: number; nx: number; nz: number } | null => {
    const n = loopPts.length;
    const seg = (i: number) => { const [ax, az] = loopPts[i], [bx, bz] = loopPts[(i + 1) % n]; return { ax, az, L: Math.hypot(bx - ax, bz - az) || 1e-6, ex: bx - ax, ez: bz - az }; };
    let i = -1, s = 0, bd = Infinity;
    for (let k = 0; k < n; k++) {
      if (!loopLand(k)) continue;
      const [ax, az] = loopPts[k], [bx, bz] = loopPts[(k + 1) % n];
      const [d, t] = segDist(x0, z0, ax, az, bx, bz);
      if (d < bd) { bd = d; i = k; s = t * seg(k).L; }
    }
    if (i < 0) return null;
    let left = dist, g = seg(i);
    for (let guard = 0; guard <= n; guard++) {
      if (dir > 0 ? left <= g.L - s : left <= s) { s += dir > 0 ? left : -left; break; }
      left -= dir > 0 ? g.L - s : s;
      i = (i + dir + n) % n;
      if (!loopLand(i)) return null;
      g = seg(i); s = dir > 0 ? 0 : g.L;
    }
    const ex = g.ex / g.L, ez = g.ez / g.L;
    // interior to the RIGHT of travel, as the runs below
    return { x: g.ax + ex * s, z: g.az + ez * s, nx: ez, nz: -ex };
  };
  // the same deal at a fraction f of its size (the chain's retry beside a pass)
  const shrinkDeal = (r: Deal, f: number): Deal => ({ ...r, scale: r.scale * f, sx: r.sx * f, sy: r.sy * f, sz: r.sz * f,
    inward: r.inward * f, along: r.along * f, crownH: r.crownH * f });
  // Does deal r, centred at (x, z) on a run (ux, uz) with inward normal
  // (nx, nz), reach into pass p's corridor? Its collider -- a circle of its
  // inward reach -- must not, and nor may its body, sampled round the outline
  // of its footprint: a superellipse (|a|^3 + |b|^3 = 1, 0.79 of the box out on
  // the diagonals), between the stone's rounded plan and its bounding box.
  const FOOT_RING = Array.from({ length: 12 }, (_, i) => {
    const c = Math.cos(i * Math.PI / 6), s = Math.sin(i * Math.PI / 6);
    return [Math.sign(c) * Math.abs(c) ** (2 / 3), Math.sign(s) * Math.abs(s) ** (2 / 3)];
  });
  const inPassFoot = (p: RimPass, r: Deal, x: number, z: number, ux: number, uz: number, nx: number, nz: number) => {
    if (p.inside(x, z, r.inward + 0.5)) return true;
    const wide = Math.max(r.inward, (r.flipped ? r.m.inward : r.m.outward) * r.sz);
    return FOOT_RING.some(([a, b]) => p.inside(x + ux * a * r.along + nx * b * wide, z + uz * a * r.along + nz * b * wide, 1.5));
  };
  // the chain rocks the walk actually stood, for the passes' shoulders; and
  // the slots a gate's break sets back, each with its face point and the
  // inward normal there
  const chainKept: { x: number; z: number; along: number }[] = [];
  const backed: { r: Deal; fx: number; fz: number; nx: number; nz: number }[] = [];
  for (const run of runs) {
    const len = Math.hypot(run.bx - run.ax, run.bz - run.az);
    if (len < 1) continue;
    const ux = (run.bx - run.ax) / len, uz = (run.bz - run.az) / len;
    // interior is to the RIGHT of travel (the shapes and the square runs above
    // are both clockwise seen from above), so the inward normal is (uz, -ux)
    const nx = uz, nz = -ux;
    // overshoot both ends so two runs meeting at a corner interleave rather
    // than leaving a notch open on the diagonal
    const over = 70;
    let cur = draw(step());
    for (let t = -over; t <= len + over; ) {
      const nxt = draw(step());
      const advance = (cur.along + nxt.along) * 0.55;
      const at = t;
      t += advance;
      let bite = b0 + rand() * (b1 - b0);
      // ...and never past the terrain's end. A plate whose edge wanders out
      // past the square stood its rocks' faces over the void and left the
      // field walkable to within 8m of the end (MEASURED 2026-10-10, the
      // Border Wall's east corner, 6m out): on the edge proper, the face
      // lands at least 8m inside the square.
      if (at >= 0 && at <= len) {
        const ex = run.ax + ux * at, ez = run.az + uz * at, lim = half - 8;
        for (const [e, n] of [[ex, nx], [ez, nz]]) {
          if (Math.abs(e) > lim && Math.abs(n) > 0.3 && Math.sign(n) === -Math.sign(e)) bite = Math.min(b1 + 24, Math.max(bite, (Math.abs(e) - lim) / Math.abs(n)));
        }
      }
      // the effective inner face lands `bite` inside the boundary whatever the
      // scale drew; the centre sits outward of it by the reach it can bank on
      // -- and the rock's FULL half-extent never reaches more than 14m past
      // that face. MEASURED: a scale-20 rock turned by the walk's yaw reached
      // ~60m inside the plate and stood over a shore road, a garden, a portal
      // (Philip, Reservoir and King's Gardens: "this rim mountain is too far
      // inland", "mountains reaching into garden, pull mountains back").
      const dealt = cur;
      cur = nxt;
      // the centre for deal r on this slot: its effective inner face `bite`
      // inside the boundary whatever the scale drew (above)
      const centre = (r: Deal): [number, number] => {
        const d = Math.min(bite - r.inward * GRIP, bite + 14 - r.inward);
        return [run.ax + ux * at + nx * d, run.az + uz * at + nz * d];
      };
      let placed = dealt;
      let [x, z] = centre(placed);
      if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
      // 0.55 of the box's reach, the same fraction the walk uses for real
      // overlap: a bounding box overstates a faceted rock, and at the full
      // reach the chain stood ~25m further off the gate than asked for.
      const gate = faceClear.find(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) - placed.along * 0.55 < cr);
      if (gate) {
        // set back behind the gate's wall (faceClear's fourth number): stood
        // once the templates are measured, its most reach `back` outside the
        // edge -- by RIM_ROCK's table a stone stood 15-25m off where it was
        // asked to (the table is the kit's, the stones are generated)
        if (gate[3] !== undefined) backed.push({ r: dealt, fx: run.ax + ux * at - nx * gate[3], fz: run.az + uz * at - nz * gate[3], nx, nz });
        continue;
      }
      if (o.clearWhere?.(x, z)) continue;
      // A pass's corridor: no chain rock whose body or collider reaches into
      // it (the walls and the cap stand where these stood). The body is
      // sampled on its footprint's OUTLINE, not its bounding box: the box's
      // corners stand 1.41x the rock's reach out, in the empty corner of a
      // rounded stone, and a pass dropped chain rocks whose centres stood
      // 50-90m along the rim from its axis (MEASURED 2026-10-10, Moonmere
      // Shores: the hole Philip shot from above). And a rock that does not
      // fit is tried again smaller before it is given up -- the walk's step
      // is unchanged, so its neighbours still overlap it.
      if (passes.length) {
        let fits = false;
        for (const f of [1, 0.8, 0.65]) {
          const r = f === 1 ? dealt : shrinkDeal(dealt, f);
          const [cx, cz] = centre(r);
          if (!passes.some((p) => inPassFoot(p, r, cx, cz, ux, uz, nx, nz))) { placed = r; x = cx; z = cz; fits = true; break; }
        }
        if (!fits) continue;
      }
      const rot = Math.atan2(-uz, ux) + placed.dr;
      // seated on the LOWEST ground under the footprint (see RIM.md): a rock
      // this size spans tens of metres and the ground under it rolls
      let gy = Infinity, gIn = 0, nIn = 0;
      for (let a = -0.8; a <= 0.81; a += 0.4) {
        const ta = at + a * placed.along;
        for (let b = 0; b <= 1.01; b += 0.5) {
          const td = bite * b;
          gy = Math.min(gy, heightFn(run.ax + ux * ta + nx * td, run.az + uz * ta + nz * td));
        }
        gIn += heightFn(run.ax + ux * ta + nx * bite, run.az + uz * ta + nz * bite); nIn++;
      }
      // ...and as much TALLER as the ground at its inner face stands over that
      // seat, so its crown stands as high over the field a player is on as it
      // would on the flat. Where a zone lifts its field toward the rim the
      // lowest seat is out past the edge, and the crowns stood only 10-20m
      // over the raised ground (MEASURED 2026-10-10, the Summer Lakes' bowl:
      // a 20m eye saw over the saddles). Stretched in y only, so it stays
      // seated and the walk's reaches do not change; capped at 1.6x.
      const ky = Math.min(1.6, 1 + Math.max(0, gIn / nIn - gy) / ((1 - BURY) * placed.crownH));
      spots[placed.file].push({
        x, z, scale: placed.scale, rot,
        sx: placed.sx, sy: placed.sy * ky, sz: placed.sz,
        yOff: gy - heightFn(x, z) - placed.crownH * ky * BURY,
      });
      circleColliders.push({ x, z, r: placed.inward });
      chainKept.push({ x, z, along: placed.along });
    }
  }
  for (const f of files) {
    if (!spots[f].length) continue;
    placeExact(mountainRock(f), spots[f], 0, { tint: o.tint, snowCaps: o.snow ? "up" : undefined });
  }
  // the passes wait for the templates, whose footprints place them (above);
  // the same placeExact options land them in the chain's own tinted buffers
  if (passes.length || backed.length) {
    const sceneAt = scene;
    Promise.all(files.map((f) => staticTemplate(mountainRock(f)))).then((ts) => {
      if (sceneAt !== scene) return;
      const foot: Record<string, Foot | null> = {}, out: Record<string, typeof spots[string]> = {};
      files.forEach((f, i) => { foot[f] = footOf(ts[i]); out[f] = []; });
      passes.forEach((p, k) => passRocks(p, seededRand(seed * 31 + 7 * k + 1), foot, out));
      const { stand } = stander(foot, out, null);
      for (const b of backed) stand("backed", b.r, b.fx, b.fz, b.nx, b.nz, "most");
      for (const f of files) if (out[f].length) placeExact(mountainRock(f), out[f], 0, { tint: o.tint, snowCaps: o.snow ? "up" : undefined });
    });
  }
}

function setZoneFog(density: number, nightHex: string, dayHex?: string): void {
  scene.fogMode = density > 0 ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
  scene.fogDensity = density;
  fogNight = Color3.FromHexString(nightHex);
  fogDay = dayHex ? Color3.FromHexString(dayHex)
    : Color3.Lerp(fogNight, Color3.FromHexString("#c8ccc4"), 0.45);
  scene.fogColor.copyFrom(fogNight);
}

// Every particle effect goes through here. Babylon draws a rendering group's
// particles BEFORE its transparent meshes (renderingGroup.ts: opaque, alpha
// test, sprites, particles, then transparent), and the strand, the water and
// the shore wash are all transparent meshes -- so on any beach or bank the
// sand painted straight over the flames and the motes behind it, and the
// only place a fire showed was where an opaque thing stood behind it. Group 1
// renders after the whole of group 0; with its depth clear turned off it still
// depth-tests against group 0's geometry, so a flame behind a wall stays
// behind the wall and in front of the sand it stands on.
const FX_GROUP = 1;
let fxGroupFor: Scene | null = null;
function fxGroupReady(): void {
  if (fxGroupFor !== scene) {
    scene.setRenderingAutoClearDepthStencil(FX_GROUP, false, false, false);
    fxGroupFor = scene;
  }
}
export function fxParticles(ps: ParticleSystem): ParticleSystem {
  fxGroupReady();
  ps.renderingGroupId = FX_GROUP;
  return ps;
}
/** The same group for an effect's light cards (spell-fx.ts): drawn after the
 *  water and the sand as the particles are, and depth-tested against them. */
export function fxMesh<T extends AbstractMesh>(m: T): T {
  fxGroupReady();
  m.renderingGroupId = FX_GROUP;
  return m;
}

// Snowfall. Weather, not a prop: Babylon's stock ParticleSystem under a
// procedurally drawn flake, same house rules as the synthesized audio and the
// SVG icons -- no asset, so no CC0 question either.
let flakeTexCache: DynamicTexture | null = null;
function flakeTexture(): DynamicTexture {
  if (flakeTexCache && flakeTexCache.getScene() === scene) return flakeTexCache;
  const SZ = 64;
  const tex = new DynamicTexture("snowflake", { width: SZ, height: SZ }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, SZ, SZ);
  const g = ctx.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SZ, SZ);
  tex.hasAlpha = true;
  tex.update();
  flakeTexCache = tex;
  return tex;
}

function makeSnowfall(): void {
  const ps = fxParticles(new ParticleSystem("snowfall", 6000, scene));
  ps.particleTexture = flakeTexture();
  // the emit box rides above the camera each frame, so snow exists only where
  // someone is looking and the whole zone never pays for it
  const emitter = new Vector3(0, 16, 0);
  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-30, 12, -30);
  ps.maxEmitBox = new Vector3(30, 20, 30);
  ps.emitRate = 430;
  ps.minLifeTime = 8;
  ps.maxLifeTime = 13;
  ps.updateSpeed = 0.016;                       // particle units ~= seconds
  ps.minSize = 0.09;
  ps.maxSize = 0.2;
  // a shared drift, so the fall reads as weather rather than static
  ps.direction1 = new Vector3(-0.2, -1, -0.2);
  ps.direction2 = new Vector3(0.5, -1, 0.2);
  ps.minEmitPower = 0.8;
  ps.maxEmitPower = 1.6;
  ps.gravity = new Vector3(0, -0.12, 0);
  // STANDARD blend, and the colour tracks the zone fog lifted toward white:
  // additive flakes glow like sparks at dusk, and a fixed white does the same
  // at night. Riding fogColor gets day/night dimming for free.
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.colorDead = new Color4(1, 1, 1, 0);
  const sc = scene;
  // NO SNOW INDOORS (Philip: "ensure snow does not fall through into the
  // houses"): a flake that drifts into an interior -- the rooms the indoor
  // camera knows, floor to ridge -- is retired where it is. Only rooms near
  // the camera are tested, gathered once a frame.
  let near: CameraRoom[] = [];
  const baseUpdate = ps.updateFunction;
  ps.updateFunction = (particles) => {
    baseUpdate(particles);
    if (!near.length) return;
    for (const p of particles) {
      const q = p.position;
      for (const r of near) {
        if (q.y < r.y0 - 0.5 || q.y > r.y1 + 5) continue;
        const dx = q.x - r.cx, dz = q.z - r.cz;
        if (r.r !== undefined ? Math.hypot(dx, dz) < r.r + 0.4
          : Math.abs(dx * r.cos - dz * r.sin) < r.hx + 0.4 && Math.abs(dx * r.sin + dz * r.cos) < r.hz + 0.4) { p.age = p.lifeTime; break; }
      }
    }
  };
  sc.onBeforeRenderObservable.add(() => {
    const cam = sc.activeCamera;
    if (cam) emitter.copyFrom(cam.globalPosition);
    near = cam ? cameraRooms.filter((r) => Math.hypot(r.cx - cam.globalPosition.x, r.cz - cam.globalPosition.z) < 45 + Math.max(r.hx, r.hz, r.r ?? 0)) : [];
    const f = sc.fogColor;
    ps.color1.set(f.r + (1 - f.r) * 0.55, f.g + (1 - f.g) * 0.55, f.b + (1 - f.b) * 0.55, 0.9);
    ps.color2.set(f.r + (1 - f.r) * 0.4, f.g + (1 - f.g) * 0.4, f.b + (1 - f.b) * 0.4, 0.75);
  });
  ps.preWarmCycles = 220;                       // the zone opens mid-snowfall
  ps.preWarmStepOffset = 4;
  ps.start();
}

// Snow-covered foliage. The kit sheets are flat painted colours, so there is
// no texel that means "the top of this branch" to overlay -- but the GEOMETRY
// knows: snow sits where surfaces face up. A material plugin blends the albedo
// toward snow by world-normal Y, with a low-frequency world-space wobble on
// the threshold so the caps come out patchy (per-pixel hash noise shimmers).
// The blend tops out below 1 so green always survives underneath.
// the ground sheet itself, for rock-mode snow: sampling the SAME texture the
// terrain tiles is what makes rock snow match the drifts by construction
// (Philip's call, after two rounds of constants that didn't)
let snowSheetCache: Texture | null = null;
function snowSheetTexture(): Texture {
  if (snowSheetCache && snowSheetCache.getScene() === scene) return snowSheetCache;
  const t = new Texture("/tex/snow_02_diff.jpg", scene);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  snowSheetCache = t;
  return t;
}

class SnowCapPlugin extends MaterialPluginBase {
  // "abs" frosts both faces of a card (foliage, whose authored normals cannot
  // be trusted -- see the shader comment); "up" is for solid geometry like
  // rock, where abs() would hang snow under the overhangs.
  private _mode: "abs" | "up";
  constructor(material: any, mode: "abs" | "up") {
    // the defines keep snow-capped materials out of the shader-cache bucket of
    // identical materials WITHOUT the plugin (same defines = same program)
    super(material, "SnowCap", 200, { SNOWCAP: false, SNOWCAP_ABS: false });
    this._mode = mode;
    this._enable(true);
  }
  getClassName(): string { return "SnowCapPlugin"; }
  prepareDefines(defines: any): void {
    defines.SNOWCAP = true;
    defines.SNOWCAP_ABS = this._mode === "abs";
  }
  getSamplers(samplers: string[]): void { samplers.push("snowSheet"); }
  bindForSubMesh(uniformBuffer: any): void {
    if (this._mode === "up") uniformBuffer.setTexture("snowSheet", snowSheetTexture());
  }
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    // CUSTOM_FRAGMENT_BEFORE_LIGHTS: the one hook in main() that runs after
    // `surfaceAlbedo` is declared. The lighting normal (normalW) is not
    // computed yet there, so the blend reads the vNormalW varying itself.
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#if defined(SNOWCAP) && !defined(SNOWCAP_ABS)
uniform sampler2D snowSheet;
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#if defined(SNOWCAP) && defined(NORMAL)
vec3 snowN = normalize(vNormalW);
// SUMMED angled plane waves, never sin(x)*sin(z): a product of axis-aligned
// waves is a literal checkerboard, and the 100m+ rim crowns display it like
// wallpaper (Philip). Angled waves at irrational-ish frequency ratios
// interfere irregularly instead.
float snowWob = 0.5 * (sin(vPositionW.x * 1.3 + vPositionW.z * 0.7 + vPositionW.y * 1.1)
                     + sin(vPositionW.x * 0.4 - vPositionW.z * 1.5 - vPositionW.y * 0.6));
#ifdef SNOWCAP_ABS
// abs(): MEASURED, Leaves_GiantPine is authored with 0% up-facing normals
// (52% point straight DOWN) -- its fronds are cards facing downward, so
// keying on +Y alone left the giant pines green while Leaves_Pine (90% up)
// frosted. A horizontal card catches snow whichever way it was authored.
float snowUp = abs(snowN.y);
vec3 snowCol = vec3(0.80, 0.84, 0.89);
float snowAmt = smoothstep(0.38, 0.95, snowUp + 0.3 * snowWob) * 0.8;
#else
// solid rock: the low-poly facets already vary the surface, and the ~4m
// world-space wobble reads as golf-ball speckle on a 40x mountain crown
float snowUp = max(snowN.y, 0.0);
// Rock snow IS the ground snow (Philip's call, after two rounds of flat
// constants read as sheen): sample the terrain's own snow_02 sheet at the
// terrain's world-XZ tiling and tint pair (TERRAIN_TEX.northroad -- tile
// 9, #dce4ee..#ffffff over ~22m drift noise), converted to linear because
// PBR albedo is linear while the sheet is sRGB. The drifts and the rock
// tops then match by construction, texture included.
vec3 snowTex = toLinearSpace(texture2D(snowSheet, vPositionW.xz / 9.0).rgb);
// Rock variation comes from the SHEET, not from waves: every closed-form
// wave is periodic, and a 100m+ crown is a big enough canvas to display
// the period -- sin(x)*sin(z) as a checkerboard, summed angled waves as
// diagonal stripes (Philip, twice). The sheet resampled at low frequency
// is aperiodic across the whole ring.
float snowN1 = texture2D(snowSheet, vPositionW.xz * 0.0041).g;  // ~240m drift shading
float snowN2 = texture2D(snowSheet, vPositionW.xz * 0.021).g;   // ~50m coverage variation
vec3 snowCol = snowTex * mix(vec3(0.72, 0.78, 0.86), vec3(1.0), snowN1);
// fuller coverage than foliage: a rock top HOLDS snow, and moderately
// sloped facets carry it too
float snowAmt = smoothstep(0.25, 0.75, snowUp + 0.3 * (snowN2 - 0.5)) * 0.95;
#endif
surfaceAlbedo = mix(surfaceAlbedo, snowCol, snowAmt);
#endif
`,
    };
  }
}

// ---------- cliffs: the rock sheet on steep terrain ----------
//
// buildTerrain already tints steep ground toward ROCK_FACE by vertex colour,
// and a tint is all a single ground sheet could do -- but a tint cannot fix the
// STRETCH. On a near-vertical face the grass sheet is sampled in world XZ, so
// it smears into vertical streaks and the plateau's cliffs read as a dirt bank
// (Philip: "add the rim mountain texture to the side of the cliffs").
//
// So the same trick the snow uses: a material plugin that blends a second sheet
// by the surface normal. Two differences from snow -- it keys on the sideways
// component rather than the up one, and it samples in a VERTICAL projection
// (horizontal distance across the face, world Y down it), which is what stops
// the smear. The tint is the rim chain's own #8c96a0, so a cliff and the
// mountains above it are the same rock.
let cliffSheetCache: Texture | null = null;
function cliffSheetTexture(): Texture {
  if (cliffSheetCache && cliffSheetCache.getScene() === scene) return cliffSheetCache;
  // MEASURED averages: aerial_rocks_02 is (110,92,52), an olive that stays
  // dirt whatever you multiply it by; dry_riverbed_rock is (102,85,74) and
  // neutralises to grey.
  const t = new Texture("/tex/dry_riverbed_rock_diff.jpg", scene);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  cliffSheetCache = t;
  return t;
}

class CliffRockPlugin extends MaterialPluginBase {
  constructor(material: any) {
    super(material, "CliffRock", 210, { CLIFFROCK: false });
    this._enable(true);
  }
  getClassName(): string { return "CliffRockPlugin"; }
  prepareDefines(defines: any): void { defines.CLIFFROCK = true; }
  getSamplers(samplers: string[]): void { samplers.push("cliffSheet"); }
  bindForSubMesh(uniformBuffer: any): void {
    uniformBuffer.setTexture("cliffSheet", cliffSheetTexture());
  }
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef CLIFFROCK
uniform sampler2D cliffSheet;
#endif
`,
      // UPDATE_DIFFUSE, not BEFORE_LIGHTS: this is a StandardMaterial, and the
      // hook that owns baseColor is this one.
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#if defined(CLIFFROCK) && defined(NORMAL)
vec3 cliffN = normalize(vNormalW);
// 0 on ground you could walk, 1 on a wall. The band matches the gradient the
// vertex colour already calls rock, so the sheet arrives where the tint does.
float cliffAmt = 1.0 - smoothstep(0.45, 0.85, abs(cliffN.y));
if (cliffAmt > 0.001) {
  // horizontal distance ACROSS the face against world Y DOWN it: the sheet
  // then runs with the cliff instead of being projected through it
  vec2 cliffUv = vec2(vPositionW.x * abs(cliffN.z) + vPositionW.z * abs(cliffN.x),
                      vPositionW.y) / 7.0;
  // the tint kills the sheet's red and lets its blue through, which is what
  // turns brown riverbed rock into the chain's cool grey
  // MEASURED: the sheet averages (102,85,74). The tint both neutralises it and
  // LIFTS it -- a multiply above 1 is legal here and necessary, because the rim
  // chain it has to match renders around (140,150,160) and no darkening of a
  // brown sheet ever gets there.
  vec3 cliffCol = texture2D(cliffSheet, cliffUv).rgb * vec3(0.98, 1.23, 1.49);
  baseColor.rgb = mix(baseColor.rgb, cliffCol, cliffAmt);
}
#endif
`,
    };
  }
}

// attach to a template's (already-cloned) materials, once each
function addSnowCaps(template: Mesh, mode: "abs" | "up"): void {
  // a generated tree carries its own snow (SnowCapPlugin is PBR-only and the
  // canopy is not PBR): either mode means "snow on what faces up" there
  if ((template as any).__generatedTree) { snowGeneratedTree(template); return; }
  for (const m of subMaterials(template)) {
    if (!(m as any).__snowCap) (m as any).__snowCap = new SnowCapPlugin(m, mode);
  }
}

// Per-zone rim, so no boundary ends suddenly. ONE call per zone, always
// buildRimMountains -- see RIM.md and the note above it. A zone tunes only the
// chain's tint, its scale range and what the chain has to break for; it does
// not get a range of its own behind this one, and it does not get a treeline in
// front of it.
function buildZoneEdge(zoneKey: string, size: number): void {
  switch (zoneKey) {
    case "moonmereshores":
      // Same chain as its vignette, one edge round: the Mere leaves through
      // the SOUTH edge here, so the rim runs the other three sides and stops
      // at the headlands (RIM.md's clearWhere case). gateClear covers the
      // causeway gate on its own; the north gate's own wall stands inside the
      // chain, so the chain breaks for it too.
      // The chain walks the shape's LAND edges -- north and east -- and stops
      // where they meet the water at the north-west and south-east corners. It
      // breaks twice: for the shut gate at the northern apex, and for the shore
      // road leaving through the north-east corner.
      buildRimMountains(zoneKey, size, 9223, {
        scale: [9, 16], tint: "#8c96a0",
        // The east chain RUNS ON INTO THE WATER past the south-east corner
        // (Philip: "have the rim mountains on this side stretch further out to
        // sea"), which is what hides the strip of open ground beyond the plate
        // there and closes the sightline to the sheet's far edge. Everywhere
        // else a rock standing in the sea is still worse than a fogged horizon.
        // 25, not -6: with the sea now running on around both headlands, a
        // chain that refused to touch water pulled back off its own corners
        // and left the seam this was meant to hide. The ends stand their toes
        // in the shallows instead; only rocks properly out to sea are dropped.
        clearWhere: (x, z) => x < 250 && MS_MERE.seaward(x, z) > 25,
        // No break for the shore road: it leaves through a PASS in the east
        // chain (zones/moonmereshores.ts PASS_E, picked up from the module's
        // `passes`), a walled gorge to the veil, so the corner stays closed
        // (Philip: "completely cover the gaps with rim mountains please!").
        // The gate's break is measured to the rock FACES: Philip wants the
        // chain in to ~34m either side ("bring the rim mountains to at least
        // here. Wall is too long"), and a centre-based radius that small would
        // simply bury the gate under the next mountain along. The rocks in
        // the break stand set back behind the wall (their furthest bulge 3m
        // outside the edge) rather than dropped: the four backdrop rocks stand
        // 56-74m out and from above the strip between them and the wall was a
        // 36m notch of open ground (MEASURED 2026-10-10).
        faceClear: [[7, 246, 34, 3]],
      });
      break;
    case "heartwood":
      // land on three sides, the bay east; the west exit is a pass in the
      // chain (HW2_PASS, the module's), and the trees run right up to it
      buildRimMountains(zoneKey, size, 9232, {
        scale: [9, 16], tint: "#7e8a72",
        clearWhere: (x, z) => HW2_SEA.seaward(x, z) > 25,
      });
      break;
    default:
      ZONE_MODULES[zoneKey]?.edge?.(size);
  }
}


// ---------- zone dressings ----------
// Place specific CC0 models at exact spots, thin-instanced like the scatters.
// Every material on a template, whether it carries one or a MultiMaterial.
// staticTemplate merges with multiMultiMaterials on, so any model built from
// more than one atlas -- which is most of the props MegaKit -- arrives here as
// a MultiMaterial whose own colour properties are undefined.
function subMaterials(template: Mesh): any[] {
  const m = template.material as any;
  if (!m) return [];
  return m.subMaterials ? m.subMaterials.filter(Boolean) : [m];
}

// One file is ONE cached template with ONE material, so two placeExact calls on
// the same model with different tints do not give you two colours -- the second
// silently repaints the first, everywhere it was already used. That is why the
// Amberwastes' mesas, its scattered rock and its horizon ring all came out the
// same grey despite three different tints being asked for.
//
// So a tinted placement gets its own template: cloned once per (file, tint),
// cached, with a cloned material. The clone shares vertex buffers with the
// original, so this costs a draw call, not memory.
const tintedTemplates = new Map<string, Mesh>();

// see placeExact's `flat`: the tint becomes the colour, the sheet goes
function flattenMaterial(m: any): void {
  if (m.albedoTexture) m.albedoTexture = null;
  if (m.diffuseTexture) m.diffuseTexture = null;
}

function tintedTemplate(base: Mesh, file: string, tint: string): Mesh {
  const key = `${file}|${tint}`;
  const found = tintedTemplates.get(key);
  if (found && !found.isDisposed() && found.getScene() === scene) return found;
  // A generated tree builds its own tinted template (trees.ts): the tint goes
  // into its shader, where the snow can sit on top of it, and nothing is
  // cloned -- a cloned plugin would lose its colours and its wind clock.
  if ((base as any).__generatedTree) {
    const v = generatedTreeVariant(file, scene, tint);
    if (v) { tintedTemplates.set(key, v); return v; }
  }
  const clone = base.clone(`tint_${key}`);
  // MUST have its own geometry. Mesh.clone() SHARES geometry, and thin-instance
  // matrices are stored as a vertex buffer ON THE GEOMETRY -- so every tinted
  // clone of a file was writing into the same buffer, the last writer won, and
  // the rest silently rendered nothing at all.
  //
  // It fails in the most misleading way possible: thinInstanceCount is per-mesh
  // so it still reads correctly, the bounding box is per-mesh so it still looks
  // right, isEnabled/isReady/isInFrustum all pass, and the mesh appears in
  // getActiveMeshes. Every diagnostic says the mesh is fine and nothing is
  // drawn. The Veilfall's 250m rim mountains were invisible for exactly this
  // reason, and so was every earlier "one file, two tints" case this was
  // introduced to fix.
  clone.makeGeometryUnique();
  if (clone.thinInstanceCount > 0) clone.thinInstanceCount = 0;
  const src = base.material as any;
  if (src) {
    clone.material = src.subMaterials
      ? (() => { const mm = src.clone(`mm_${key}`); mm.subMaterials = src.subMaterials.map(
          (sm: any, i: number) => (sm ? sm.clone(`sm_${key}_${i}`) : sm)); return mm; })()
      : src.clone(`m_${key}`);
  }
  (clone as any).__paintedArt = (base as any).__paintedArt;
  addShadowCaster(clone);
  tintedTemplates.set(key, clone);
  return clone;
}

function placeExact(
  file: string,
  spots: { x: number; z: number; scale: number; rot: number; yOff?: number;
           sx?: number; sy?: number; sz?: number;
           lean?: number; leanX?: number; leanZ?: number }[],
  collideR = 0,
  // flat: drop the model's texture so the tint IS its colour. A tint is a
  // multiply and cannot change a hue -- the crystal pack's one purple swatch
  // times any amber is still magenta -- so a single-swatch model that has to
  // read as a different material (amber glass, not purple crystal) loses the
  // sheet and keeps the colour. Only right for models whose sheet is one flat
  // swatch per material; a painted sheet would lose its detail.
  opts: { tint?: string; emissive?: string; glow?: number; snowCaps?: "abs" | "up"; flat?: boolean } = {},
): void {
  const sceneAtCall = scene;
  staticTemplate(file).then((base) => {
    if (!base || sceneAtCall !== scene) return;
    // snowCaps without a tint still needs its own clone -- the plugin must
    // never land on the shared base material (it would frost the file in
    // every zone), so an untinted snowy placement clones under a "plain" key
    const template = opts.tint ? tintedTemplate(base, file, opts.tint + (opts.flat ? "|flat" : ""))
      : opts.snowCaps ? tintedTemplate(base, file, "plain") : base;
    addInstances(template, scatterMatrices(spots.map((p) => ({
      x: p.x, z: p.z, y: heightFn(p.x, p.z) + (p.yOff ?? 0), scale: p.scale, rot: p.rot,
      sx: p.sx, sy: p.sy, sz: p.sz, lean: p.lean, leanX: p.leanX, leanZ: p.leanZ,
    }))));
    // Kenney's kits share one pastel colormap atlas, which reads as painted
    // plastic next to the Quaternius foliage. A tint multiply is the whole fix:
    // the atlas is shared, so this is per-file and cannot be done in the asset.
    // Walk subMaterials, not just .material: the props MegaKit models carry two
    // or three trim atlases each, so staticTemplate merges them under a
    // MultiMaterial -- which has neither albedoColor nor diffuseColor, and a
    // tint aimed at it lands on nothing at all and fails silently.
    for (const m of subMaterials(template)) {
      if (opts.tint && !(template as any).__generatedTree) {
        const c = Color3.FromHexString(opts.tint);
        if (m.albedoColor) m.albedoColor = c; else if (m.diffuseColor) m.diffuseColor = c;
        // A tint alone could not make Kenney stone read grey, and the reason is
        // not the tint: these are PBRMaterials, the scene's environment is the
        // BLUE sky HDRI, and at the default environmentIntensity the irradiance
        // it adds swamps the albedo. Measured: albedo x texture worked out to
        // rgb(121,121,123) while the wall rendered near rgb(185,190,210). So a
        // tinted kit piece also gets its sky fill cut and its specular killed --
        // otherwise every tint in this file is fighting the sky and losing.
        if (m.environmentIntensity !== undefined) m.environmentIntensity = 0.3;
        if (m.metallic !== undefined) m.metallic = 0;
        if (m.roughness !== undefined) m.roughness = opts.flat ? 0.35 : 1;
        if (m.specularIntensity !== undefined) m.specularIntensity = opts.flat ? 0.5 : 0;
        if (opts.flat) flattenMaterial(m);
      }
      if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
      if (opts.glow) m.metadata = { ...(m.metadata || {}), glow: opts.glow };
    }
    // flat means the tint IS the colour: the foliage pass would crush a gold
    // wheat to a near-black pine (MEASURED: albedo 0.04 after it)
    if (!opts.flat) styleFoliage(template, file);
    if (opts.snowCaps) addSnowCaps(template, opts.snowCaps);
  });
  if (collideR > 0) spots.forEach((p) => circleColliders.push({ x: p.x, z: p.z, r: collideR * p.scale }));
}

// Batch every spot per file and hand each file to placeExact once, so a cluster field is still one draw per
// model rather than one per rock.
function scatterClustersCC0(
  size: number, seed: number, anchors: string[], satellites: string[], count: number,
  avoid: [number, number, number][], anchorScale: [number, number] = [1.0, 1.8],
  opts: { tint?: string; snowCaps?: "abs" | "up" } = {},
): void {
  const rand = seededRand(seed);
  const spots = new Map<string, { x: number; z: number; scale: number; rot: number }[]>();
  const push = (f: string, p: { x: number; z: number; scale: number; rot: number }) => {
    const list = spots.get(f); if (list) list.push(p); else spots.set(f, [p]);
  };
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * (size - 30);
    const z = (rand() - 0.5) * (size - 30);
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (waterBodies.some((w) => Math.hypot(x - w.x, z - w.z) < w.r && heightFn(x, z) < w.level + 0.3)) continue;
    if (vegBlocked(x, z)) continue; // clusters are plants/mushrooms, never riverbed dressing
    const asc = anchorScale[0] + rand() * (anchorScale[1] - anchorScale[0]);
    push(anchors[i % anchors.length], { x, z, scale: asc, rot: rand() * Math.PI * 2 });
    circleColliders.push({ x, z, r: 1.1 * asc });
    const n = 3 + Math.floor(rand() * 5);
    for (let sI = 0; sI < n; sI++) {
      const a = rand() * Math.PI * 2, r = 1.2 * asc + rand() * 2.2;
      push(satellites[Math.floor(rand() * satellites.length)], {
        x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, scale: 0.9 + rand() * 0.7, rot: rand() * Math.PI * 2,
      });
    }
  }
  spots.forEach((list, file) => placeExact(file, list, 0, opts));
}

// ---------- building kit: timber-framed, textured, enterable ----------
function texMat(name: string, file: string, opts: { tint?: string; level?: number; spec?: number; noCull?: boolean } = {}): StandardMaterial {
  const found = scene.getMaterialByName(name);
  if (found) return found as StandardMaterial;
  const m = new StandardMaterial(name, scene);
  m.maxSimultaneousLights = 8;
  m.diffuseColor = Color3.FromHexString(opts.tint || "#ffffff");
  const s = opts.spec ?? 0.04;
  m.specularColor = new Color3(s, s, s);
  const d = new Texture(`/tex/build/${file}_diff.jpg`, scene);
  d.wrapU = Texture.WRAP_ADDRESSMODE;
  d.wrapV = Texture.WRAP_ADDRESSMODE;
  m.diffuseTexture = d;
  const n = new Texture(`/tex/build/${file}_nor_gl.jpg`, scene);
  n.wrapU = Texture.WRAP_ADDRESSMODE;
  n.wrapV = Texture.WRAP_ADDRESSMODE;
  n.level = opts.level ?? 0.8;
  m.bumpTexture = n;
  if (opts.noCull) m.backFaceCulling = false;
  return m;
}

// Box with world-scale texture tiling on every face.
function tbox(name: string, w: number, h: number, d: number, material: StandardMaterial, tile: number): Mesh {
  const f = (u: number, v: number) => new Vector4(0, 0, u / tile, v / tile);
  const faceUV = [f(w, h), f(w, h), f(d, h), f(d, h), f(w, d), f(w, d)];
  const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d, faceUV, wrap: true }, scene);
  b.material = material;
  b.isPickable = false;
  return b;
}

// Triangle filling the gable under a pitched roof.
function gableTri(span: number, rise: number, material: StandardMaterial): Mesh {
  const m = new Mesh("gable", scene);
  const s = span / 2;
  const pos = [-s, 0, 0, s, 0, 0, 0, rise, 0];
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, [0, 1, 2], nrm);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = [0, 1, 2];
  vd.normals = nrm;
  vd.uvs = [0, 0, span / 3, 0, span / 6, rise / 3];
  vd.applyToMesh(m);
  m.material = material;
  m.isPickable = false;
  return m;
}

function shopSign(glyph: string, id: string): Mesh {
  const tex = new DynamicTexture(`signtex_${id}`, { width: 128, height: 128 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#241f2e";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#a8834e";
  ctx.lineWidth = 6;
  ctx.strokeRect(7, 7, 114, 114);
  ctx.font = "72px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e2b063";
  ctx.fillText(glyph, 64, 70);
  tex.update();
  const m = new StandardMaterial(`signm_${id}`, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.emissiveColor = new Color3(0.55, 0.5, 0.4);
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  const p = MeshBuilder.CreatePlane(`sign_${id}`, { width: 1.15, height: 1.15 }, scene);
  p.material = m;
  p.isPickable = false;
  return p;
}

interface BuildingOpts {
  w: number; d: number; h: number;
  face?: "N" | "S" | "E" | "W";
  seed?: number;
  tint?: string;              // plaster tint
  stone?: boolean;            // stone walls instead of plaster (cathedral, halls)
  enterable?: boolean;
  shop?: "weapons" | "armor" | "goods" | "tavern" | "hall" | "chapel";
  sign?: string;              // hanging sign glyph
  chimney?: boolean;
  doorW?: number; doorH?: number;
  riseMul?: number;           // roof pitch multiplier
  stories?: number;           // 2 = tall townhouse: extra window row + floor band
  collect?: Mesh[];           // for non-enterable: parts go here for one global merge
  cc0?: boolean;              // legacy caller flag; all building materials are now CC0
  roofTint?: string;          // roof slate tint (terracotta villas want #b06a4a)
}

// snap a length to the kit's 2m modules, within [lo, hi]
const snapMod = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, 2 * Math.round(v / 2)));

function kitBuilding(cx: number, cz: number, o: BuildingOpts): void {
  const face = o.face || "S";
  const th = { S: 0, W: Math.PI / 2, N: Math.PI, E: -Math.PI / 2 }[face];
  // The old house's ridge ran along its width and its door was in the -z
  // (front) wall; turned by th. A kit house's ridge is its local +z and its
  // interior stair always climbs against its local +x wall -- so the door
  // goes in the OTHER long wall (-x), the house turned to put that wall at
  // the old front. MEASURED: with the door in the +x wall the stair's foot
  // stood 0.7m from the doorway and half blocked it (Philip).
  const yaw = th - Math.PI / 2;
  const tone = o.tint ? Color3.FromHexString(o.tint) : new Color3(0.9, 0.88, 0.84);
  const lum = tone.r * 0.3 + tone.g * 0.59 + tone.b * 0.11;
  const darkRoof = !!o.roofTint && Color3.FromHexString(o.roofTint).toLuminance() < 0.45;

  // THE GREAT GRANARY (26 x 22 x 12, and the only one that big): beyond any
  // village house, so it is two parallel stone halls in Caerdun's own kit,
  // side by side, one block between its corner towers. The west hall carries
  // the great doors on the road.
  if (o.w > 16 || o.d > 16) {
    // round each hall DOWN (13 -> 12): rounding up made the block 2m wider
    // than the old one, into its corner towers
    const halves = 2, span = Math.max(6, Math.min(14, 2 * Math.floor(o.w / halves / 2))), len = snapMod(o.d, 8, 24);
    setPalette("caerdun");
    for (let i = 0; i < halves; i++) {
      // side by side across the old width: the old local x, turned by th
      const off = (i - (halves - 1) / 2) * span;
      const hx = cx + off * Math.cos(th), hz = cz - off * Math.sin(th);
      makeHouse({ cx: hx, cz: hz, yaw: th, span: span as HouseSpec["span"], len: len as HouseSpec["len"], storeys: 3,
        door: i === 0 ? "nz" : false, chimney: false, seed: (o.seed ?? 1) + i });
    }
    setPalette(null);
    flushTown();
    return;
  }

  // everything else: one village house. Its size must be a roof the VILLAGE
  // kit actually ships -- MEASURED off public/models/town: spans 4-8 only,
  // lengths to 14. ROOF_LENS also lists 10m spans and 16-18m lengths, but
  // those are Moonmere's own roofs; asked of the village kit they drew
  // nothing, and the first remade inn stood open to the sky (Philip).
  const VILLAGE_ROOFS: Record<number, number[]> = { 4: [4, 6, 8], 6: [4, 6, 8, 10, 12, 14], 8: [8, 10, 12, 14] };
  const span = snapMod(o.d, 4, 8) as HouseSpec["span"];
  const lens = VILLAGE_ROOFS[span] || [];
  const wantLen = snapMod(o.w, 4, 18);
  const len = lens.reduce((b, l) => (Math.abs(l - wantLen) < Math.abs(b - wantLen) ? l : b), lens[0]) as HouseSpec["len"];
  const storeys = (o.stories ?? (o.h >= 4.6 ? 2 : 1)) as HouseSpec["storeys"];
  // walls: stone stays stone; a dark timber tint is a barn or stable; the
  // pale plasters are plaster
  const base: Skin = "UnevenBrick";
  const skin: Skin = o.stone ? "UnevenBrick" : lum < 0.5 ? "WoodWear" : "Plaster";
  const spec: HouseSpec = {
    cx, cz, yaw, span, len, storeys, base, skin, tile: darkRoof ? "FlatTiles" : "RoundTiles",
    door: "nx", chimney: !!o.chimney, seed: o.seed ?? 1,
    // the inn is the only enterable one; its door stands open and its floors
    // are levels. The rest are closed houses.
    walkable: !!o.enterable,
  };
  setPalette(o.stone || darkRoof ? "fieldstone" : null);
  // a snowbound zone (the North Road) lays snow on the roofs, sills and
  // steps, as it does on every other thing standing in it
  const snowy = !!(WILDS_THEMES[currentZone] as any)?.snow;
  // (outside pieces only: MEASURED, capping every piece whitened the
  // interior floorboards too)
  if (snowy) setTownSnow((t) => { if (/Roof_|Prop_Chimney|Stairs_Exterior|Prop_ExteriorBorder|Floor_RoundRocks/.test(t.name)) addSnowCaps(t, "up"); });
  makeHouse(spec);
  setPalette(null);
  flushTown();
  setTownSnow(null);
  const rec = inspectHouses()[inspectHouses().length - 1];

  const [dfx, dfz] = doorFoot(spec);
  const ux = -Math.cos(yaw), uz = Math.sin(yaw);          // the house's local -x: out of the door
  const vx = Math.sin(yaw), vz = Math.cos(yaw);           // local +z: along the ridge
  if (o.sign) {
    const sg = shopSign(o.sign, `${Math.round(cx)}_${Math.round(cz)}`);
    sg.position.set(dfx - ux * 1.6 + vx * 1.9, groundHeight(dfx, dfz) + 3.1, dfz - uz * 1.6 + vz * 1.9);
    sg.rotation.y = yaw - Math.PI / 2;
  }
  if (!o.enterable) return;

  // THE ENTERABLE INTERIOR. The floor, the open door, the stair and the
  // interior camera come from makeHouse; here, what the old inn had inside,
  // from the props kit rather than primitives -- and a warm light. Every
  // piece stands on the RECORDED ground floor (the house has an upper one,
  // so the ground here is ambiguous) and none within 1.6m of the stair.
  const y = rec.y0;
  // The whole ground floor is a floor to the level-less lookups (NPCs stand
  // by groundHeight without a previous height): makeHouse flattens only a
  // central square, and MEASURED, an inn NPC 4.6m off centre stood on the
  // terrain a metre under the boards. The house is square to the grid (its
  // yaw is a multiple of a quarter turn), so an axis-aligned box is exact.
  {
    const ax = Math.abs(Math.round(Math.cos(yaw))) ? span : len, az = Math.abs(Math.round(Math.cos(yaw))) ? len : span;
    const ex = ax / 2 - 0.4, ez = az / 2 - 0.4;
    flatZones.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, y });
  }
  const nearStair = (x: number, z: number) => rec.stairs.some(([x0, z0, , x1, z1]) => {
    const dx = x1 - x0, dz = z1 - z0, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L)) : 0;
    return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < 1.6;
  });
  const hw = span / 2, hl = len / 2;
  const at = (lx: number, lz: number): [number, number] => [cx + lx * ux + lz * vx, cz + lx * uz + lz * vz];
  const inside = (lx: number, lz: number, yawAdd: number, scale = 1) => { const [x, z] = at(lx, lz); return { x, z, rot: yaw + yawAdd, scale, yOff: y - heightFn(x, z) }; };
  const clear = <T extends { x: number; z: number }>(list: T[]) => list.filter((q) => !nearStair(q.x, q.z));
  if (o.shop === "tavern" || o.shop === "hall") {
    // two tables with their chairs, a barrel rack by the back wall, a rug
    const tables = clear([inside(hw * 0.2, -hl * 0.45, 0), inside(hw * 0.2, hl * 0.3, 0.2)]);
    placeExact("props/Table_Large.gltf", tables, 0);
    const chairs: ReturnType<typeof inside>[] = [];
    for (const t of [-hl * 0.45, hl * 0.3]) for (const [dl, dz, a] of [[1.3, 0, -Math.PI / 2], [-1.1, 0, Math.PI / 2], [0.1, 1.2, Math.PI], [0.1, -1.2, 0]] as [number, number, number][])
      chairs.push(inside(hw * 0.2 + dl, t + dz, a));
    placeExact("props/Chair_1.gltf", clear(chairs), 0);
    placeExact("props/Barrel.gltf", clear([inside(-hw + 1.2, hl - 1.2, 0), inside(-hw + 1.2, hl - 2.2, 1.2), inside(-hw + 2.1, hl - 1.2, 2.1)]), 0);
    placeExact("props/Shelf_Small_Bottles.gltf", clear([inside(-hw + 0.55, -hl * 0.05, Math.PI / 2)]), 0);
    placeExact("props/Rug_1.gltf", [inside(hw * 0.2, 0, 0, 1.2)], 0);
    // colliders held to THIS storey (a flat circle would block the same spot
    // on the floor above as well)
    for (const t of tables) buildApi.addBoxCollider(t.x, t.z, 0.9, 0.9, t.rot, y + 1.2, y - 0.2);
    // THE UPPER ROOM (Philip: "add some tables/chairs on the second floor
    // too"): two more tables and their chairs, a bench along the back wall
    // and a shelf, on the upper floor -- clear of the stair and its well
    if (storeys > 1) {
      const y1 = y + STOREY;
      const up = (lx: number, lz: number, yawAdd: number, scale = 1) => { const q = inside(lx, lz, yawAdd, scale); return { ...q, yOff: y1 - heightFn(q.x, q.z) }; };
      const upTables: ReturnType<typeof up>[] = [], upChairs: ReturnType<typeof up>[] = [];
      for (const [tz, ty] of [[-hl * 0.35, 0.1], [hl * 0.35, -0.1]] as [number, number][]) {
        const t = up(hw * 0.15, tz, ty);
        if (nearStair(t.x, t.z)) continue;   // a table and its chairs go together or not at all
        upTables.push(t);
        for (const [dl, dz, a] of [[1.3, 0, -Math.PI / 2], [-1.1, 0, Math.PI / 2], [0.1, 1.2, Math.PI], [0.1, -1.2, 0]] as [number, number, number][]) upChairs.push(up(hw * 0.15 + dl, tz + dz, a));
      }
      placeExact("props/Table_Large.gltf", upTables, 0);
      for (const t of upTables) buildApi.addBoxCollider(t.x, t.z, 0.9, 0.9, t.rot, y1 + 1.2, y1 - 0.2);
      placeExact("props/Chair_1.gltf", clear(upChairs), 0);
      placeExact("props/Bench.gltf", clear([up(-hw + 0.7, 0, Math.PI / 2)]), 0);
      placeExact("props/Shelf_Small_Bottles.gltf", clear([up(-hw + 0.55, hl * 0.6, Math.PI / 2)]), 0);
      placeExact("props/Barrel.gltf", clear([up(hw - 1.0, hl - 1.0, 0.4)]), 0);
    }
  }
  const [lx, lz] = at(hw * 0.2, 0);
  const light = new PointLight(`bl_${Math.round(cx)}_${Math.round(cz)}`, new Vector3(lx, y + 2.6, lz), scene);
  light.diffuse = Color3.FromHexString("#e2b063");
  light.intensity = 0.55;
  light.range = Math.max(span, len) * 0.9;
  registerNightLight(light, 0.55);
}

// THE OLD BUILDINGS, REMADE (Philip, 2026-09-29: "these old ones are super
// ugly, can you remake them"). makeBuilding drew a house from textured boxes
// and triangles; every caller now gets a village-kit house instead -- the
// kit Philip is happy with -- at the same centre, size and facing, through
// the same makeHouse every village uses. What an old building WAS is kept:
// the inn stays enterable (walkable floor, door standing open, interior
// camera, a warm light, a tavern furnished from the props kit), everything
// else stays closed. ?oldbuildings brings the box houses back for comparison.
const OLD_BUILDINGS = typeof location !== "undefined" && new URLSearchParams(location.search).has("oldbuildings");
registerPalette("fieldstone", {
  MI_UnevenBrick: "T_UnevenBrick_BaseColor_granite.jpg",
  MI_RoundTiles: "T_RoundTiles_BaseColor_slate.jpg", MI_FlatTiles: "T_FlatTiles_BaseColor_slate.jpg",
});
function makeBuilding(cx: number, cz: number, o: BuildingOpts): void {
  if (!OLD_BUILDINGS) { kitBuilding(cx, cz, o); return; }
  const face = o.face || "S";
  const th = { S: 0, W: Math.PI / 2, N: Math.PI, E: -Math.PI / 2 }[face];
  const cosT = Math.round(Math.cos(th)), sinT = Math.round(Math.sin(th));
  const rotP = (lx: number, lz: number): [number, number] =>
    [cx + lx * cosT + lz * sinT, cz - lx * sinT + lz * cosT];
  const swap = face === "E" || face === "W";
  const szW = (sx: number, sz: number): [number, number] => (swap ? [sz, sx] : [sx, sz]);
  const rand = seededRand(o.seed ?? 1);
  const { w, d, h } = o;
  // seat the building at the highest point under its footprint so no corner floats
  const y = Math.max(...([[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as [number, number][])
    .map(([lx, lz]) => { const [wx, wz] = rotP(lx, lz); return heightFn(wx, wz); }));
  const wallT = 0.4;
  const doorW = o.doorW ?? 2.2, doorH = o.doorH ?? 2.9;
  const rise = d * (o.riseMul ?? 0.36);

  const plaster = texMat(`bplaster_${o.tint || "w"}`, "grey_plaster_02", { tint: o.tint || "#e8e4da" });
  const stone = texMat("bstone_cc0", "medieval_blocks_02");
  const roofM = texMat(`broof_${o.roofTint || "d"}`, "roof_slates_02", { tint: o.roofTint || "#b8c0d0" });
  const beamM = texMat("bbeam", "dark_wooden_planks");
  const floorM = texMat("bfloor", "wood_floor_worn");
  const gablePl = texMat(`bgable_${o.tint || "w"}`, "grey_plaster_02", { tint: o.tint || "#e8e4da", noCull: true });
  const winLit = mat("bwinlit", "#c9985a", { emissive: "#3d3020", glow: 0.4 });
  const winDark = mat("bwindark", "#232b3c", { emissive: "#0e1420" });
  const wallM = o.stone ? stone : plaster;

  const shell: Mesh[] = [];
  const props: Mesh[] = [];
  const put = (m: Mesh, lx: number, ly: number, lz: number, list: Mesh[], yaw = 0): Mesh => {
    const [wx, wz] = rotP(lx, lz);
    m.position.set(wx, y + ly, wz);
    m.rotation.y = th + yaw;
    list.push(m);
    return m;
  };
  {
    const [wx, wz] = rotP(0, 0);
    const [ax, az] = szW(w, d);
    recordFootprint(wx, wz, ax, az);
  }
  const addCol = (lx: number, lz: number, sx: number, sz: number, top?: number) => {
    const [wx, wz] = rotP(lx, lz);
    const [ax, az] = szW(sx, sz);
    colliders.push({ x0: wx - ax / 2, x1: wx + ax / 2, z0: wz - az / 2, z1: wz + az / 2, y1: top ?? y + 0.6 + h });
  };

  // deep plinth sunk into the slope + interior floor
  put(tbox("bplinth", w + 0.6, 2.6, d + 0.6, stone, 2.4), 0, -0.7, 0, props);
  put(tbox("bflr", w - wallT, 0.3, d - wallT, o.shop === "chapel" ? stone : floorM, o.shop === "chapel" ? 2.6 : 1.7), 0, 0.5, 0, props);
  // doorstep outside (tall enough to reach downhill ground)
  put(tbox("bstep", doorW + 0.8, 1.4, 1.4, stone, 1.6), 0, -0.15, -(d / 2 + 0.6), props);

  // walls: door centered on the -z (front) wall
  const wallY = 0.6 + h / 2;
  const innerW = w - 2 * wallT;
  put(tbox("bwallB", innerW, h, wallT, wallM, 3), 0, wallY, d / 2 - wallT / 2, shell);
  put(tbox("bwallL", wallT, h, d, wallM, 3), -(w / 2 - wallT / 2), wallY, 0, shell);
  put(tbox("bwallR", wallT, h, d, wallM, 3), w / 2 - wallT / 2, wallY, 0, shell);
  const segW = (innerW - doorW) / 2;
  put(tbox("bwallFL", segW, h, wallT, wallM, 3), -(doorW / 2 + segW / 2), wallY, -(d / 2 - wallT / 2), shell);
  put(tbox("bwallFR", segW, h, wallT, wallM, 3), doorW / 2 + segW / 2, wallY, -(d / 2 - wallT / 2), shell);
  put(tbox("bwallFT", doorW, h - doorH, wallT, wallM, 3), 0, 0.6 + doorH + (h - doorH) / 2, -(d / 2 - wallT / 2), shell);
  // colliders per solid wall (door gap stays open)
  addCol(0, d / 2 - wallT / 2, w, wallT);
  addCol(-(w / 2 - wallT / 2), 0, wallT, d);
  addCol(w / 2 - wallT / 2, 0, wallT, d);
  addCol(-(doorW / 2 + segW / 2), -(d / 2 - wallT / 2), segW, wallT);
  addCol(doorW / 2 + segW / 2, -(d / 2 - wallT / 2), segW, wallT);

  // timber frame: corner posts, eave beams, door frame
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([px, pz]) => {
    put(tbox("bpost", 0.5, h + 0.5, 0.5, beamM, 1.4), px * (w / 2 - 0.12), 0.6 + (h + 0.3) / 2, pz * (d / 2 - 0.12), shell);
  });
  put(tbox("beaveF", w + 0.5, 0.35, 0.55, beamM, 2), 0, 0.6 + h - 0.05, -(d / 2 - 0.1), shell);
  put(tbox("beaveB", w + 0.5, 0.35, 0.55, beamM, 2), 0, 0.6 + h - 0.05, d / 2 - 0.1, shell);
  put(tbox("bjambL", 0.32, doorH, 0.55, beamM, 1.4), -(doorW / 2 + 0.16), 0.6 + doorH / 2, -(d / 2 - wallT / 2), shell);
  put(tbox("bjambR", 0.32, doorH, 0.55, beamM, 1.4), doorW / 2 + 0.16, 0.6 + doorH / 2, -(d / 2 - wallT / 2), shell);
  put(tbox("bhead", doorW + 1.0, 0.36, 0.6, beamM, 1.4), 0, 0.6 + doorH + 0.18, -(d / 2 - wallT / 2), shell);
  // a plain plank leaf in the timber material, no swing
  put(tbox("bdoorleaf", doorW - 0.08, doorH - 0.06, 0.12, beamM, 1.0), 0, 0.6 + doorH / 2 - 0.02, -(d / 2 - wallT / 2) - 0.1, shell);

  // windows: lit emissive panes with dark frames on side + back walls
  const winAt = (lx: number, ly: number, lz: number, sideYaw: number) => {
    const lit = rand() > 0.3;
    put(tbox("bwinf", 1.35, 1.55, 0.14, beamM, 1.2), lx, ly, lz, shell, sideYaw);
    // pane thicker than the frame so it shows through as glass
    put(tbox("bwinp", 1.05, 1.25, 0.24, lit ? winLit : winDark, 1.2), lx, ly, lz, shell, sideYaw);
  };
  const tall = (o.stories || 1) >= 2;
  const rowYs = tall ? [0.6 + h * 0.34, 0.6 + h * 0.74] : [0.6 + h * 0.55];
  const nSide = d > 9 ? 2 : 1;
  rowYs.forEach((wy) => {
    for (let i = 0; i < nSide; i++) {
      const lz = nSide === 1 ? 0 : (i === 0 ? -d / 5 : d / 5);
      winAt(-(w / 2 - 0.02), wy, lz, Math.PI / 2);
      winAt(w / 2 - 0.02, wy, lz, Math.PI / 2);
    }
    if (innerW > 7) winAt(0, wy, d / 2 - 0.02, 0);
  });
  if (segW > 2.4) { // windows beside the door (ground floor)
    winAt(-(doorW / 2 + segW / 2), 0.6 + h * (tall ? 0.34 : 0.55), -(d / 2 - 0.02), 0);
    winAt(doorW / 2 + segW / 2, 0.6 + h * (tall ? 0.34 : 0.55), -(d / 2 - 0.02), 0);
  }
  // upper-floor windows over the door on tall houses
  if (tall) winAt(0, 0.6 + h * 0.74, -(d / 2 - 0.02), 0);
  if (tall) { // floor band between stories
    put(tbox("bband", w + 0.3, 0.32, 0.52, beamM, 2), 0, 0.6 + h * 0.54, -(d / 2 - 0.1), shell);
    put(tbox("bband2", w + 0.3, 0.32, 0.52, beamM, 2), 0, 0.6 + h * 0.54, d / 2 - 0.1, shell);
  }

  // gable ends + pitched slate roof. The ridge runs along x, so the open
  // triangles are on the x-end walls: close those, not the front and back.
  put(gableTri(d - 0.2, rise, gablePl), -(w / 2 - wallT / 2), 0.6 + h, 0, shell, Math.PI / 2);
  put(gableTri(d - 0.2, rise, gablePl), w / 2 - wallT / 2, 0.6 + h, 0, shell, Math.PI / 2);
  const s2 = d / 2 + 0.55;
  const pitch = Math.atan2(rise, s2);
  const slabL = Math.hypot(s2, rise) + 0.35;
  const slabF = tbox("broofF", w + 1.5, 0.22, slabL, roofM, 2.3);
  put(slabF, 0, 0.6 + h + rise / 2 + 0.05, -s2 / 2, shell);
  slabF.rotation.x = -pitch;
  const slabB = tbox("broofB", w + 1.5, 0.22, slabL, roofM, 2.3);
  put(slabB, 0, 0.6 + h + rise / 2 + 0.05, s2 / 2, shell);
  slabB.rotation.x = pitch;
  put(tbox("bridge", w + 1.7, 0.3, 0.5, beamM, 2), 0, 0.6 + h + rise + 0.08, 0, shell);
  if (o.chimney) {
    put(tbox("bchim", 1.0, rise + 2.4, 1.0, stone, 1.2), w * 0.27, 0.6 + h + (rise + 2.4) / 2 - 0.4, d * 0.15, shell);
  }

  // hanging sign by the door
  if (o.sign) {
    put(tbox("bbrk", 0.14, 0.14, 1.2, beamM, 1), doorW / 2 + 1.15, 0.6 + doorH + 0.75, -(d / 2 + 0.35), props);
    const sg = shopSign(o.sign, `${Math.round(cx)}_${Math.round(cz)}`);
    put(sg, doorW / 2 + 1.15, 0.6 + doorH + 0.05, -(d / 2 + 0.75), props, 0);
  }

  if (!o.enterable) {
    // closed door + whole-footprint collider; parts merge globally via o.collect
    put(tbox("bdoor", doorW - 0.1, doorH - 0.1, 0.24, beamM, 1.2), 0, 0.6 + doorH / 2 - 0.05, -(d / 2 - wallT / 2), shell);
    {
      const [wx, wz] = rotP(0, 0);
      const [ax, az] = szW(w, d);
      colliders.push({ x0: wx - ax / 2, x1: wx + ax / 2, z0: wz - az / 2, z1: wz + az / 2, y1: y + 0.6 + h });
    }
    const all = [...shell, ...props];
    if (o.collect) o.collect.push(...all);
    else addShadowCaster(Mesh.MergeMeshes(all, true, true, undefined, false, true));
    return;
  }

  // ---- enterable: flat walkable floor, warm light, furnishings ----
  {
    const [fx0, fz0] = rotP(-(w / 2 - wallT), -(d / 2 - wallT));
    const [fx1, fz1] = rotP(w / 2 - wallT, d / 2 - wallT);
    flatZones.push({ x0: Math.min(fx0, fx1), x1: Math.max(fx0, fx1), z0: Math.min(fz0, fz1), z1: Math.max(fz0, fz1), y: y + 0.66 });
  }

  // hanging lantern
  put(tbox("blcord", 0.06, 0.9, 0.06, beamM, 1), 0, 0.6 + h - 0.45, 0, props);
  const lamp = MeshBuilder.CreateSphere("blamp", { diameter: 0.45 }, scene);
  lamp.material = mat("blampm", "#e2b063", { emissive: "#e2b063", glow: 1.0 });
  lamp.isPickable = false;
  put(lamp, 0, 0.6 + h - 1.0, 0, props);

  const goods = ["#7a5a3a", "#5a6a7a", "#8a4a42", "#c9a15a", "#4a5a44", "#6a5a78"];
  const goodM = (i: number) => mat(`bgood${i}`, goods[i % goods.length]);

  if (o.shop !== "chapel") {
    // sales counter with the vendor behind it
    put(tbox("bcounter", Math.min(w * 0.55, 6), 0.85, 0.8, beamM, 1.5), 0, 0.6 + 0.45, d / 2 - 2.4, props);
    addCol(0, d / 2 - 2.4, Math.min(w * 0.55, 6), 0.8, y + 1.5);
    // back-wall shelves stocked with goods
    for (let row = 0; row < 3; row++) {
      const sy = 1.55 + row * 0.75;
      put(tbox("bshelf", w * 0.6, 0.12, 0.42, beamM, 1.5), 0, sy, d / 2 - wallT - 0.25, props);
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const gx = (i / (n - 1) - 0.5) * w * 0.5;
        const g = tbox("bgood", 0.28 + rand() * 0.22, 0.3 + rand() * 0.25, 0.3, goodM(Math.floor(rand() * 6)), 1);
        put(g, gx, sy + 0.28, d / 2 - wallT - 0.25, props, rand() * 0.6 - 0.3);
      }
    }
    // rug between door and counter
    put(tbox("brug", 2.4, 0.05, 3.2, mat("brugm", o.shop === "tavern" ? "#5a3a3a" : "#3a4456"), 2), 0, 0.69, -d / 8, props);
  }

  if (o.shop === "weapons") {
    for (let i = 0; i < 3; i++) {
      const blade = tbox("bblade", 0.14, 1.7, 0.06, mat("bbladem", "#9aa4b8", { spec: 0.5 }), 1);
      put(blade, -(w / 2 - 0.75), 0.6 + 0.95, -d / 6 + i * 1.0, props, 0);
      blade.rotation.z = 0.18;
    }
    put(tbox("brack", 0.2, 1.9, 3.0, beamM, 1.5), -(w / 2 - 0.55), 0.6 + 0.95, -d / 6 + 1.0, props);
  } else if (o.shop === "armor") {
    const stand = put(tbox("bastand", 0.18, 1.6, 0.18, beamM, 1), w / 2 - 1.2, 0.6 + 0.8, -d / 6, props);
    void stand;
    put(tbox("btorso", 0.9, 1.0, 0.5, mat("btorsom", "#6a7284", { spec: 0.4 }), 1), w / 2 - 1.2, 0.6 + 1.5, -d / 6, props);
    const shield = MeshBuilder.CreateDisc("bshield", { radius: 0.55 }, scene);
    shield.material = mat("bshieldm", "#3a4a63", { spec: 0.3 });
    (shield.material as StandardMaterial).backFaceCulling = false;
    put(shield, -(w / 2 - wallT - 0.06), 2.2, d / 6, props, Math.PI / 2);
  } else if (o.shop === "goods") {
    put(tbox("bcrate1", 0.9, 0.9, 0.9, beamM, 1), w / 2 - 1.1, 0.6 + 0.45, -d / 5, props, 0.3);
    put(tbox("bcrate2", 0.75, 0.75, 0.75, beamM, 1), w / 2 - 1.15, 0.6 + 1.27, -d / 5, props, 0.7);
    for (let i = 0; i < 3; i++) {
      const sack = MeshBuilder.CreateSphere("bsack", { diameter: 0.75 }, scene);
      sack.scaling.y = 0.62;
      sack.material = mat("bsackm", "#b0a183");
      sack.isPickable = false;
      put(sack, -(w / 2 - 1.0), 0.6 + 0.25, -d / 6 + i * 0.75, props);
    }
  } else if (o.shop === "tavern" || o.shop === "hall") {
    for (let t = 0; t < 2; t++) {
      const tx = (t === 0 ? -1 : 1) * w / 5;
      put(MeshBuilder.CreateCylinder("btleg", { height: 0.9, diameter: 0.25 }, scene), tx, 0.6 + 0.45, -d / 8, props).material = beamM;
      put(MeshBuilder.CreateCylinder("bttop", { height: 0.1, diameter: 1.7 }, scene), tx, 0.6 + 0.95, -d / 8, props).material = beamM;
      const candle = MeshBuilder.CreateSphere("bcandle", { diameter: 0.16 }, scene);
      candle.material = mat("bcandlem", "#ffd9a0", { emissive: "#e8b878", glow: 1.0 });
      candle.isPickable = false;
      put(candle, tx, 0.6 + 1.08, -d / 8, props);
      for (let st = 0; st < 3; st++) {
        const a = (st / 3) * Math.PI * 2 + t;
        put(MeshBuilder.CreateCylinder("bstool", { height: 0.55, diameter: 0.45 }, scene),
          tx + Math.cos(a) * 1.35, 0.6 + 0.27, -d / 8 + Math.sin(a) * 1.35, props).material = beamM;
      }
      addCol(tx, -d / 8, 1.8, 1.8, y + 1.6);
    }
    if (o.shop === "hall") {
      const banner = MeshBuilder.CreatePlane("bbanner", { width: 1.3, height: 2.4 }, scene);
      banner.material = mat("bbannerm", "#3a4a63", { emissive: "#1a2438" });
      (banner.material as StandardMaterial).backFaceCulling = false;
      banner.isPickable = false;
      put(banner, 0, 0.6 + h - 1.6, d / 2 - wallT - 0.08, props, 0);
    }
  } else if (o.shop === "chapel") {
    // columns, pews, altar
    for (let i = 0; i < 4; i++) {
      const lz = -d / 2 + 6 + i * ((d - 14) / 3);
      [-1, 1].forEach((sx) => {
        const col = MeshBuilder.CreateCylinder("bcol", { height: h - 0.4, diameter: 1.5 }, scene);
        col.material = stone;
        col.isPickable = false;
        put(col, sx * (w / 2 - 4.5), 0.6 + (h - 0.4) / 2, lz, props);
        addCol(sx * (w / 2 - 4.5), lz, 1.5, 1.5);
      });
    }
    for (let r = 0; r < 5; r++) {
      const lz = -d / 2 + 8 + r * 3.2;
      [-1, 1].forEach((sx) => {
        put(tbox("bpew", w / 4 - 1.5, 0.55, 1.0, beamM, 1.6), sx * (w / 6 + 0.6), 0.6 + 0.28, lz, props);
        addCol(sx * (w / 6 + 0.6), lz, w / 4 - 1.5, 1.0, y + 1.2);
      });
    }
    put(tbox("baltar", 4.2, 1.3, 1.6, stone, 1.4), 0, 0.6 + 0.65, d / 2 - 3.5, props);
    addCol(0, d / 2 - 3.5, 4.2, 1.6, y + 2.0);
    for (let i = 0; i < 3; i++) {
      const c = MeshBuilder.CreateSphere("bcand", { diameter: 0.18 }, scene);
      c.material = mat("bcandm", "#ffd9a0", { emissive: "#e8b878", glow: 1.0 });
      c.isPickable = false;
      put(c, -0.9 + i * 0.9, 0.6 + 1.45, d / 2 - 3.5, props);
    }
    const roseIn = MeshBuilder.CreateDisc("brosein", { radius: 3 }, scene);
    roseIn.material = mat("broseinm", "#e2b063", { emissive: "#b98a4a", glow: 0.6 });
    (roseIn.material as StandardMaterial).backFaceCulling = false;
    roseIn.isPickable = false;
    put(roseIn, 0, 0.6 + h - 4, d / 2 - wallT - 0.1, props, 0);
  }

  // warm interior light confined to this building's meshes
  const shellMerged = Mesh.MergeMeshes(shell, true, true, undefined, false, true);
  const propsMerged = Mesh.MergeMeshes(props.filter((p) => p.getTotalVertices() > 0), true, true, undefined, false, true);
  addShadowCaster(shellMerged);
  addShadowCaster(propsMerged);
  const [lx, lz] = rotP(0, 0);
  const light = new PointLight(`bl_${Math.round(cx)}_${Math.round(cz)}`, new Vector3(lx, y + h * 0.55, lz), scene);
  light.diffuse = Color3.FromHexString("#e2b063");
  light.intensity = 0.55;
  light.range = Math.max(w, d) * 0.85;
  const included = [shellMerged, propsMerged].filter(Boolean) as Mesh[];
  light.includedOnlyMeshes = included;

  buildApi.addCameraRoom({ cx, cz, hx: w/2-wallT, hz: d/2-wallT, sin: Math.sin(th), cos: Math.cos(th), y0: y+.65, y1: y+.6+h });
}










// ---------- generic builders for the expansion zones ----------
interface WildsTheme {
  dead: number; rocks: number; grass: number; flowers: number; rockTint?: string;
  dry?: boolean;                 // a desert: the filler clusters are stone and dry grass, no mushrooms, no logs, in rockTint
  canopy?: [string[], number, number, number];  // files, count, minScale, maxScale
  // fogNight/fogDay are the zone's horizon COLOURS and drive scene.fogColor and
  // the overcast sky dome whether or not there is any haze. fogDensity is the
  // haze itself, and EVERY VIGNETTE CARRIES NONE (Philip): a new v_ zone gets
  // `fogDensity: 0`, not a small number. Set it explicitly rather than omitting
  // it, so the intent is greppable and a zero cannot read as an oversight.
  fogNight?: string; fogDay?: string; fogDensity?: number;
  // the flower species, when the shared four are wrong for the zone. MEASURED
  // (env_manifest_cc0.json): the default set carries Flower_7's #e75030 and
  // Bush_Large_Flowers' #de7778, which are loud reds -- fine in a summer
  // meadow, wrong on a shore whose whole palette is turquoise and violet-grey.
  flowerFiles?: string[];
  snow?: boolean;      // falling weather, not ground cover -- see makeSnowfall
  overcast?: boolean;  // fully fogged-out sky: no sun, stars or blue -- see updateDayNight
}

// Themed recipes for the expansion zones, all CC0. Each is a biome stated as
// counts, plus a signature block below that is what makes the zone ITSELF.
const WILDS_THEMES: Record<string, WildsTheme> = {
  // The REAL Moonmere Shores. The vignette's counts scaled by area (a 700m
  // zone is 8.5x a 240m slice) and rounded down where the slice was already
  // generous, plus a canopy the vignette had none of -- the zone card carries
  // a wood in its north-east, which the signature block thickens on the spot.
  // The postcard's fog colours come over unchanged; the density does NOT stay
  // at the vignette's zero, because the card's whole promise is the mist
  // ribbon at the far shore, and a 620m sheet of open water has to end in it.
  // No BIRCH, and it is measured rather than felt: Leaves_Birch is #b74700, a
  // burnt orange that lit half the shore up as autumn. The postcard's palette
  // is turquoise water, violet-grey towers and #a8b06a reeds, and the postcard
  // wins -- so the canopy is Leaves_NormalTree (#587a00) and Leaves_Pine
  // (#335800), and the flowers are the violet and cream groups rather than the
  // default set's #e75030.
  // stated per 240m slice like every other theme (buildGenericWilds scales by
  // area): these are its old 700m counts divided by (700/240)^2 = 8.5
  // rocks 26 -> 6, dead 5 -> 3 (2026-10-10 revamp): the generic grey boulders
  // dotted the lawn evenly; the module's kit stone, in clumps, does that now
  moonmereshores: { dead: 3, rocks: 6, grass: 165, flowers: 28,
                    canopy: [["nature/CommonTree_2.gltf", "nature/CommonTree_5.gltf", "nature/Pine_2.gltf"], 11, 1.0, 1.7],
                    flowerFiles: ["nature/Flower_2_Group.gltf", "nature/Flower_1_Group.gltf", "nature/Flower_4_Group.gltf"],
                    fogNight: "#2c3444", fogDay: "#e6e0d4", fogDensity: 0.0011 },
};

// small builders shared by the lookdev vignettes
function vigWater(name: string, x: number, z: number, r: number, hex: string, level: number,
                 opts: { alpha?: number } = {}): Mesh {
  const w = MeshBuilder.CreateDisc(name, { radius: r, tessellation: 48 }, scene);
  w.rotation.x = Math.PI / 2;
  w.position.set(x, level, z);
  w.material = makeClearWaterMat(name + "m", hex, opts.alpha ?? 0.6);
  w.isPickable = false;
  return w;
}
// Water with a BED under it: alpha per vertex, driven by how deep the ground
// is beneath that vertex. Shallows are see-through, the middle is not.
//
// vigWater's flat disc cannot do this and it is not a tuning problem -- it is
// 50 vertices and one alpha for the whole sheet. This lays a polar grid over
// the same ellipse and reads the terrain at every vertex, which is also what
// CLIPS it: where the ground stands above the waterline the alpha goes to zero,
// so the sheet ends at the real shoreline rather than at the disc's rim, and
// the two no longer have to be talked into agreeing.
//
// `deep` is the depth at which the water becomes fully opaque and wants to be
// MEASURED against the bed rather than guessed -- the Mere bottoms out at
// 1.55m, so a ramp built for 3m of water would have left the whole lake
// half-transparent with grass showing through it.
function vigShallowWater(
  name: string, cx: number, cz: number, rx: number, rz: number,
  hex: string, level: number,
  opts: { deep?: number; edgeA?: number; maxA?: number;
          rings?: number; segs?: number; order?: number;
          refl?: number;      // makeClearWaterMat's sheen; 0 for melt, tar, anything that is not water
          mask?: (x: number, z: number) => number;
          // put the sheet on the map: its flooded cells, sampled on this grid
          // (metres). Map only (MapLayers.extra): the sheet keeps nothing off.
          mapStep?: number } = {},
): Mesh {
  const rings = opts.rings ?? 46, segs = opts.segs ?? 128;
  if (opts.mapStep) {
    // where the sheet shows: deeper than its faded last 0.25 m and inside the
    // mask, within the ellipse -- the same test the vertex alpha makes
    const st = opts.mapStep, x0 = cx - rx, z0 = cz - rz;
    const ni = Math.ceil((2 * rx) / st), nj = Math.ceil((2 * rz) / st);
    const rows: number[][] = [];
    for (let j = 0; j <= nj; j++) {
      const z = z0 + j * st, row: number[] = [];
      let open = -1;
      for (let i = 0; i <= ni + 1; i++) {
        const x = x0 + i * st;
        const wet = i <= ni && ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1
          && level - heightFn(x, z) > 0.12 && (!opts.mask || opts.mask(x, z) > 0.5);
        if (wet && open < 0) open = i;
        if (!wet && open >= 0) { row.push(open, i - 1); open = -1; }
      }
      rows.push(row);
    }
    addMapOnlyWater({ kind: "runs", x0, z0, step: st, rows });
  }
  const deep = opts.deep ?? 1.5;
  const edgeA = opts.edgeA ?? 0.05;   // alpha in the last centimetres of water
  const maxA = opts.maxA ?? 0.9;
  // An extra 0..1 gate on top of the depth clip, for water whose edge is not
  // the ground. Depth alone only removes the sheet where the bed rises ABOVE
  // the waterline -- so a reservoir, whose tailrace lies 28m BELOW its own
  // surface, cheerfully poured itself over the dam and down the gorge. The
  // mask is what tells it that a wall is also an edge.
  const mask = opts.mask;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
  const normals: number[] = [], indices: number[] = [];
  const push = (x: number, z: number) => {
    const depth = level - heightFn(x, z);
    // The last 25cm of depth fades the sheet out to nothing. Without it the
    // ramp STEPS from 0 to edgeA between one vertex and the next, and that step
    // draws a hard polygon edge along the whole waterline -- invisible on the
    // Mere, where a sand band and a long shelf sat under it, and obvious on the
    // open sea, where neither does.
    let a = depth <= 0 ? 0
      : (edgeA + (maxA - edgeA) * smooth(Math.min(1, depth / deep)))
        * smooth(Math.min(1, depth / 0.25));
    if (mask && a > 0) a *= mask(x, z);
    positions.push(x, level, z);
    normals.push(0, 1, 0);
    // normalized over the ellipse, so V still runs with world +Z and the flow
    // sign below means what it says
    uvs.push((x - cx) / (2 * rx) + 0.5, (z - cz) / (2 * rz) + 0.5);
    colors.push(1, 1, 1, a);   // colour is the material's; only alpha varies
  };
  push(cx, cz);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      push(cx + Math.cos(ang) * rx * t, cz + Math.sin(ang) * rz * t);
    }
  }
  for (let j = 0; j < segs; j++) indices.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs;
      indices.push(a0 + j, b0 + j, a0 + jn, a0 + jn, b0 + j, b0 + jn);
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  vd.colors = colors; vd.normals = normals;
  vd.applyToMesh(mesh);
  // alpha 1 on the material: the whole opacity curve lives in the vertex alpha,
  // and hasVertexAlpha is what puts the mesh in the blended pass at all
  mesh.material = makeClearWaterMat(name + "m", hex, 1, opts.refl ?? 1);
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  if (opts.order !== undefined) mesh.alphaIndex = opts.order;
  return mesh;
}

function vigBoxAt(name: string, w: number, hgt: number, d: number, m: StandardMaterial, x: number, y: number, z: number, rotY = 0): Mesh {
  const b = MeshBuilder.CreateBox(name, { width: w, height: hgt, depth: d }, scene);
  b.position.set(x, y, z);
  b.rotation.y = rotY;
  b.material = m;
  b.isPickable = false;
  addShadowCaster(b);
  return b;
}
// One kit model placed with a FULL rotation. placeExact is the right tool for
// four hundred trees -- instanced, Y-rotation only -- and the wrong one for a
// single wreck, whose whole read is that it is lying on its side.
function vigModel(
  file: string, x: number, z: number,
  opts: { scale?: number; rotX?: number; rotY?: number; rotZ?: number; yOff?: number } = {},
): void {
  const sceneAtCall = scene;
  instantiateModel(file, null).then((mi) => {
    if (!mi || sceneAtCall !== scene) return;
    mi.root.position.set(x, heightFn(x, z) + (opts.yOff ?? 0), z);
    mi.root.rotation.set(opts.rotX ?? 0, opts.rotY ?? 0, opts.rotZ ?? 0);
    mi.root.scaling.setAll(opts.scale ?? 1);
  });
}

// ---------- the strand: where a basin's water meets its bank ----------
//
// Both of these exist because Philip asked for sand on the Mere's banks and for
// waves that move against them, and both need the same thing first: to know
// where the waterline actually IS.
//
// It is tempting to draw the shoreline as a circle at the basin radius. That is
// wrong, and quietly so. basin() caps the bed flat, raises a lip across
// u = 0.78..1.02, then blends back to open terrain by u = 1.4, and the fbm noise
// rides through all of it -- so the ground crosses the waterline at a different
// radius on every bearing. Assume the radius and the sand sits in the water on
// one side of the lake and up the field on the other. So: march the ray and
// measure the crossing, once, and let both bands share the answer.
//
// null for a bearing whose crossing is off the zone square. That is the normal
// case here rather than an edge case: the Mere's basin is centred 130m north of
// the origin, so most of its ring is outside the 240m ground and only the
// southern arc is bank anyone can stand on.
function shoreRing(
  cx: number, cz: number, level: number,
  steps = 360, rFrom = 60, rTo = 140, half = 116,
  // A crossing the caller does not accept is not the shore: the march carries
  // on past it. An OCEAN needs this and it is the same rule WATER.md states for
  // the sheet -- the coastline has ONE definition, `seaward()`, and a hollow in
  // a field three hundred metres inland is under the waterline too. Without it
  // the sand and the foam bloomed across the middle of the zone.
  accept?: (x: number, z: number) => boolean,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let prev = heightFn(cx + ux * rFrom, cz + uz * rFrom);
    let hit: number | null = null;
    for (let r = rFrom + 0.5; r <= rTo; r += 0.5) {
      const h = heightFn(cx + ux * r, cz + uz * r);
      // EITHER transition counts. This used to look only for below->above,
      // which is what a march OUTWARD from a centre at sea finds: it starts in
      // the water and comes up onto the beach. A PLATE's scan centre is dry
      // land, so the same march crosses the other way -- above->below -- and
      // the ring came back with twenty spurious bearings out of three hundred
      // and sixty, which is why its beach had no foam on it at all.
      if ((prev < level) !== (h < level)) {
        // interpolate between the two samples. Half-metre steps would scallop
        // the inner edge of a 15m band visibly without this.
        const at = r - 0.5 + ((level - prev) / (h - prev)) * 0.5;
        if (!accept || accept(cx + ux * at, cz + uz * at)) { hit = at; break; }
      }
      prev = h;
    }
    if (hit !== null && (Math.abs(cx + ux * hit) > half || Math.abs(cz + uz * hit) > half)) hit = null;
    out.push(hit);
  }
  return out;
}

// A patch of seabed continuing PAST the zone square.
//
// buildTerrain covers exactly `size` and no more, so the ground stops dead at
// the 240m boundary. That was invisible while the water above it was opaque;
// with a see-through sea it shows as a ruled line of sand ending in mid-water,
// which reads as the bank being straight (Philip). heightFn is a pure function
// of x and z and keeps describing the ramp out there, so the bed can simply be
// continued -- same function, same sheet, same tint pair and the same 22m
// vertex-colour noise buildTerrain uses, so the join is not a join.
//
// It only has to reach as far as the water is still see-through, which is where
// the depth ramp tops out; past that the water hides everything anyway.
function vigBedSkirt(
  name: string, x0: number, x1: number, z0: number, z1: number,
  mat: StandardMaterial, tile: number, c1hex: string, c2hex: string, level?: number,
  // mask: extra 0..1 coverage, multiplied into the clip alpha. The `level`
  // clip alone assumes every piece of ground below the waterline is bed,
  // which a DAM makes false -- the tailwater is 28m below the lake and would
  // take a full-strength sheet of lake bed across its dry grass.
  opts: { lift?: number; cells?: [number, number]; mask?: (x: number, z: number) => number } = {},
): Mesh {
  // lift is NEGATIVE for a skirt continuing terrain past the zone edge (the
  // real ground must win where both exist) and POSITIVE for a bed that has to
  // REPLACE what is under the water.
  const lift = opts.lift ?? -0.05;
  const [nx, nz] = opts.cells ?? [64, 28];
  const c1 = Color3.FromHexString(c1hex), c2 = Color3.FromHexString(c2hex);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let i = 0; i <= nz; i++) {
    for (let j = 0; j <= nx; j++) {
      const x = x0 + (x1 - x0) * (j / nx);
      const z = z0 + (z1 - z0) * (i / nz);
      // a hair below the real terrain, so where the two overlap the terrain
      // wins outright rather than z-fighting with it
      const y = heightFn(x, z);
      positions.push(x, y + lift, z);
      uvs.push(x / tile, z / tile);
      const c = Color3.Lerp(c1, c2, fbm(x / 22 + 7, z / 22 + 7));
      // Clipped to actual SEABED. The patch is a rectangle and a lake is not,
      // so without this its corners climb whatever dry ground they land on and
      // hang there past the zone edge -- MEASURED on the Mere, the corners
      // reached y = 17 up the mountain rim. Fading out just above the waterline
      // leaves only the part that is genuinely under water, which is the only
      // part anything can see through to.
      const a = (level === undefined ? 1
        : 1 - smooth(Math.min(1, Math.max(0, (y - level) / 0.4))))
        * (opts.mask ? opts.mask(x, z) : 1);
      colors.push(c.r, c.g, c.b, a);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * (nx + 1) + j;
    indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  vd.colors = colors; vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  // a mask is a vertex alpha too: without this the Granary Plains' ash band
  // drew opaque over the whole rectangle, mask or no mask
  if (level !== undefined || opts.mask) {
    mesh.hasVertexAlpha = true;
    // alphaIndex 0, below the strand (1), the water (2) and the wash (3).
    // Clipping the skirt puts it in the BLENDED pass, where the default index
    // is the maximum -- so it drew last, on top of the water it is supposed to
    // lie under, and painted a band of dry sand across the sea.
    mesh.alphaIndex = 0;
  }
  // a bed lifted over the ground is a floor where it shows (see pavingHeight)
  if (lift > 0) pavings.push(mesh);
  return mesh;
}

// The bed and the beach as ONE region, masked by the SHORE rather than by
// depth or by a single radius.
//
// Philip: "You can see various green terrain revealing through the water. Once
// the sand banks begin, it should just be sand all the way." The strip this
// replaces was one radius per bearing, which was fine while the shoreline was
// a circle. It is not one any more -- the coastline noise leaves rises poking
// up through the shallows and pockets of water behind them, and a single radius
// cannot describe either, so the zone's green field sheet showed through the
// water wherever the strip had guessed wrong.
//
// A grid masked on distance-from-the-ring has no such blind spot: everything
// inside the shoreline is sand, submerged or standing out of the water, and the
// mask runs `outset` metres further so the dry beach is the same sheet.
//
// Lifted ABOVE the terrain, not below it. This has to REPLACE the grass on the
// rises, and a bed tucked under the ground would let exactly the thing being
// fixed draw straight over it.
function vigSandBed(
  name: string, cx: number, cz: number, ring: (number | null)[],
  outset: number, fade: number,
  mat: StandardMaterial, tile: number, c1hex: string, c2hex: string,
  opts: { cells?: number; order?: number; lift?: number; fillNulls?: boolean;
          // Coverage stated directly, for a coast that is not a ring around a
          // centre. The polar mask below assumes the centre is OUT TO SEA, so
          // "inside the ring" means water -- true for a bay, upside down for a
          // PLATE, whose scan centre is dry land and whose whole interior the
          // mask would therefore call beach. A shaped coast passes its own
          // seaward() instead, which is the one definition it already owns.
          alphaAt?: (x: number, z: number) => number } = {},
): Mesh | null {
  // Null bearings are the ones whose crossing left the zone. Fill them from the
  // widest real reading: out there the sand is under water deep enough to be
  // opaque, so erring wide costs nothing and erring short reopens the hole.
  //
  // `fillNulls: false` for a coast that does not go all the way round -- a
  // plate with land borders has bearings with NO shore on them, and filling
  // those laid a beach across the inland half of the zone.
  const known = ring.filter((r): r is number => r !== null);
  if (!known.length) return null;
  const rMax = Math.max(...known);
  const filled = ring.map((r) => (r === null ? (opts.fillNulls === false ? -1e6 : rMax) : r));
  const steps = filled.length;
  const ringAt = (ang: number): number => {
    const t = ((ang / (Math.PI * 2)) % 1 + 1) % 1 * steps;
    const i = Math.floor(t), f = t - i;
    return filled[i % steps] * (1 - f) + filled[(i + 1) % steps] * f;
  };

  const reach = rMax + outset + fade;
  const n = opts.cells ?? 128;
  const lift = opts.lift ?? 0.15;
  const c1 = Color3.FromHexString(c1hex), c2 = Color3.FromHexString(c2hex);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
  const normals: number[] = [], indices: number[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = cx - reach + (2 * reach) * (j / n);
      const z = cz - reach + (2 * reach) * (i / n);
      // the RENDERED mesh, not the height function: buildTerrain triangulates
      // on terrainSub's grid and rides up to half a metre above heightFn between
      // samples, and every one of those bumps came through the sand as a wedge
      // of green (Philip: "a lot of green grassy terrain sticking out of the
      // sand"). WATER.md records the same fix for the river bed.
      positions.push(x, terrainMeshHeight(x, z) + lift, z);
      normals.push(0, 1, 0);
      uvs.push(x / tile, z / tile);
      let a: number;
      if (opts.alphaAt) {
        a = opts.alphaAt(x, z);
      } else {
        const d = Math.hypot(x - cx, z - cz);
        const edge = ringAt(Math.atan2(z - cz, x - cx)) + outset;
        a = 1 - smooth(Math.min(1, Math.max(0, (d - edge) / fade)));
      }
      const c = Color3.Lerp(c1, c2, fbm(x / 17 + 5, z / 17 + 5));
      colors.push(c.r, c.g, c.b, a);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j;
    indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  vd.colors = colors; vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = true;
  mesh.receiveShadows = true;
  if (opts.order !== undefined) mesh.alphaIndex = opts.order;
  // the sand is a floor where it shows (see pavingHeight)
  if (lift > 0) pavings.push(mesh);
  return mesh;
}

// A strip following that ring, conforming to the ground.
//
// `stops` is the strip's CROSS-SECTION: [metres from the waterline, alpha],
// waterward first. Two stops give a linear ramp, which is what the first pass
// used and why the sand read as a narrow ribbon -- a beach that starts fading
// the moment it leaves the water is 25% beach and 75% haze. Three or four stops
// let it stay solid for a few metres and only then let go.
//
// Negative offsets reach INTO the water, and that matters: the band has to pass
// under the water disc, or the disc's edge and the band's leave a seam between
// them that opens and closes as the camera moves.
//
// `uv: "world"` tiles the sheet in world XZ exactly as buildTerrain does, which
// is what sand wants -- it has to sit in the same grid as the ground it lies on
// or it reads as a sticker. `uv: "band"` runs V ACROSS the strip instead, which
// is what the wash needs so that a vOffset sweep walks foam up the beach.
//
// `jitter` varies the landward stops per bearing. Without it the band is a
// constant-width ribbon following a curve, which is the silhouette of a road,
// not of a shore. The waterward stops are left alone -- those are pinned to the
// measured waterline and wobbling them would unpin them from the water.
function shoreBand(
  name: string, cx: number, cz: number, ring: (number | null)[],
  stops: [number, number][], mat: StandardMaterial,
  opts: { uv?: "world" | "band"; tile?: number; c1?: string; c2?: string; level?: number;
          lift?: number; uRepeat?: number; jitter?: number; order?: number;
          // `mirror` flips which radial direction is SEAWARD. The stops are
          // written for a scan centre out at sea (negative = into the water);
          // a PLATE's centre is dry land, so the same stops have to be applied
          // the other way round. Mirroring the stop LIST instead is what broke
          // the foam: the clamp below is keyed to the offset's sign, so the
          // seaward stops stopped following the bed and were pinned flat at the
          // waterline, where the water sheet drew straight over them.
          mirror?: boolean } = {},
): Mesh | null {
  // the polar ring, as a list of samples: a point on the waterline and the
  // INLAND direction at it. bandMesh does the rest, and the same builder draws
  // a band along a polygon coast (see shapeShoreSamples).
  const steps = ring.length;
  const samples: ShoreSample[] = [];
  for (let i = 0; i < steps; i++) {
    const r0 = ring[i];
    if (r0 === null) { samples.push(null); continue; }
    const ang = (i / steps) * Math.PI * 2;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    // a scan centre out at sea looks INLAND going outward; a plate's centre is
    // dry land and looks inland going back toward itself (`mirror`)
    const m = opts.mirror ? -1 : 1;
    samples.push({ x: cx + ux * r0, z: cz + uz * r0, ix: ux * m, iz: uz * m });
  }
  return bandMesh(name, samples, true, stops, mat, opts);
}

type ShoreSample = { x: number; z: number; ix: number; iz: number } | null;

/**
 * The waterline walked along a zone SHAPE's coast edges rather than scanned
 * from a centre. A polar ring can only hold one crossing per bearing, so a
 * bay -- the harbour, the west cove -- and the horn outside it were foam-less:
 * the scan from the island's centre either hit the bay head and stopped or
 * started past the cove altogether (Philip: "not all coast lines have foam
 * waves... they should all have it"). Walking the polygon and dropping a
 * probe across each edge finds the crossing whatever shape the coast is.
 */
function shapeShoreSamples(sh: ZoneShape, level: number, accept: (x: number, z: number) => boolean): ShoreSample[] {
  const out: ShoreSample[] = [];
  const n = sh.pts.length;
  // the polygon's winding decides which side is out
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n]; area += ax * bz - bx * az; }
  const wind = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    if (!sh.coast[i]) { out.push(null); continue; }
    const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // outward normal: left of the edge for a clockwise polygon in (x, z)
    const ox = -uz * wind, oz = ux * wind;
    const steps = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
      // probe from 34m inland to 40m seaward for the first drop under the waterline
      let hit: [number, number] | null = null;
      let prev = heightFn(mx - ox * 34, mz - oz * 34);
      for (let d = -33.5; d <= 40; d += 0.5) {
        const px = mx + ox * d, pz = mz + oz * d;
        const h = heightFn(px, pz);
        if (prev >= level && h < level) {
          const at = d - 0.5 + ((level - prev) / (h - prev)) * 0.5;
          const hx = mx + ox * at, hz = mz + oz * at;
          if (accept(hx, hz)) { hit = [hx, hz]; break; }
        }
        prev = h;
      }
      out.push(hit ? { x: hit[0], z: hit[1], ix: -ox, iz: -oz } : null);
    }
  }
  return out;
}

/** A strip along a run of shore samples: `stops` are (metres inland, alpha). */
function bandMesh(
  name: string, samples: ShoreSample[], closed: boolean,
  stops: [number, number][], mat: StandardMaterial,
  opts: { uv?: "world" | "band"; tile?: number; c1?: string; c2?: string; level?: number;
          lift?: number; uRepeat?: number; jitter?: number; order?: number },
): Mesh | null {
  const tile = opts.tile ?? 9, lift = opts.lift ?? 0.06;
  const floorY = opts.level ?? -1e9;
  const jit = opts.jitter ?? 0;
  const uRep = opts.uRepeat ?? 7;
  const span = stops[stops.length - 1][0] - stops[0][0];
  const c1 = Color3.FromHexString(opts.c1 ?? "#ffffff");
  const c2 = Color3.FromHexString(opts.c2 ?? opts.c1 ?? "#ffffff");
  const steps = samples.length;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
  const normals: number[] = [], indices: number[] = [];
  let col = 0, prevCol = -1, arc = 0;
  let lastX = 0, lastZ = 0;
  const count = closed ? steps + 1 : steps;
  for (let i = 0; i < count; i++) {
    const sm = samples[i % steps];           // wraps, so a full ring closes
    if (!sm) { prevCol = -1; continue; }
    const mx = sm.x, mz = sm.z;
    // a gap of more than a few metres between neighbours is a break in the
    // shore, not a long quad across a bay
    if (prevCol >= 0 && Math.hypot(mx - lastX, mz - lastZ) > 14) prevCol = -1;
    if (prevCol >= 0) arc += Math.hypot(mx - lastX, mz - lastZ);
    lastX = mx; lastZ = mz;
    // one width multiplier per sample, low-frequency so the beach broadens and
    // narrows over tens of metres rather than shimmering vertex to vertex
    const wob = jit ? 1 + (fbm(mx / 26 + 11, mz / 26 + 11) - 0.5) * 2 * jit : 1;
    for (let e = 0; e < stops.length; e++) {
      const [off0, al] = stops[e];
      const d = off0 > 0 ? off0 * wob : off0;
      const x = mx + sm.ix * d, z = mz + sm.iz * d;
      // Clamp UP to the waterline only within a couple of metres of the edge,
      // which is the seam this was for: the band has to meet the water sheet
      // exactly there or a hairline of terrain shows between them. Stops
      // further out are the BED and must follow the ground down -- lifting
      // those would float the sand at the surface, which is visible now that
      // the shallows are transparent and was not before.
      const y = (d > -2.5 ? Math.max(heightFn(x, z), floorY) : heightFn(x, z)) + lift;
      positions.push(x, y, z);
      normals.push(0, 1, 0);  // near-horizontal, like makeWaterRibbon's strip
      if (opts.uv === "band") uvs.push(arc / uRep, (off0 - stops[0][0]) / span);
      else uvs.push(x / tile, z / tile);
      const c = Color3.Lerp(c1, c2, fbm(x / 17 + 5, z / 17 + 5));
      colors.push(c.r, c.g, c.b, al);
    }
    if (prevCol >= 0) {
      const a = prevCol * stops.length, b = col * stops.length;
      for (let e = 0; e < stops.length - 1; e++)
        indices.push(a + e, a + e + 1, b + e, b + e, a + e + 1, b + e + 1);
    }
    prevCol = col;
    col++;
  }
  if (!indices.length) return null;
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  vd.colors = colors; vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = true;   // the landward fade lives in the vertex alpha
  mesh.receiveShadows = true;
  // MEASURED the hard way: the wash was drawing and binding correctly and was
  // still invisible. Two transparent bands over the same arc have almost the
  // same bounding-sphere centre, so the back-to-front sort between them is a
  // coin flip -- and blended geometry still writes depth, so on the flips where
  // the (opaque-cored) sand drew second it painted the foam out entirely.
  // alphaIndex is checked before distance, so it settles the pair outright.
  if (opts.order !== undefined) mesh.alphaIndex = opts.order;
  return mesh;
}

// A ground sheet from /tex, tiled and vertex-tinted the way buildTerrain tiles
// and tints the terrain itself -- so a band laid on the ground samples its
// neighbour's grid rather than a second, disagreeing one.
function vigGroundSheet(name: string, tex: string, norLevel = 0.75): StandardMaterial {
  const found = scene.getMaterialByName(name);
  if (found) return found as StandardMaterial;
  const m = new StandardMaterial(name, scene);
  m.specularColor = Color3.Black();
  m.diffuseColor = Color3.White();
  const d = new Texture(`/tex/${tex}_diff.jpg`, scene);
  d.wrapU = Texture.WRAP_ADDRESSMODE; d.wrapV = Texture.WRAP_ADDRESSMODE;
  m.diffuseTexture = d;
  const n = new Texture(`/tex/${tex}_nor.jpg`, scene);
  n.wrapU = Texture.WRAP_ADDRESSMODE; n.wrapV = Texture.WRAP_ADDRESSMODE;
  n.level = norLevel;
  m.bumpTexture = n;
  m.maxSimultaneousLights = 8;
  return m;
}

// The foam strip, DRAWN rather than shipped -- one canvas, like the icons and
// the score, instead of a texture asset for a single 200m arc.
//
// V runs across the beach and the foam lives in the middle third, with both
// ends fully transparent. That layout is the whole trick: with wrapV CLAMPed, a
// vOffset sweep of +-0.3 walks the band from the waterline to the top of the
// beach and back, and at each extreme the clamp repeats an empty row instead of
// wrapping the foam around to the far side of the strip. A WRAPped scroll would
// give a conveyor belt of foam always travelling one way.
function makeShoreWash(name: string, rate: number, phase = 0): StandardMaterial {
  const found = scene.getMaterialByName(name);
  if (found) return found as StandardMaterial;
  const W = 512, H = 128;
  const dt = new DynamicTexture(name + "tex", { width: W, height: H }, scene, false);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  // a hard leading edge with a long trail behind it: foam piles at the front of
  // a wash and thins out toward the water it came from
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, "rgba(255,255,255,0)");
  g.addColorStop(0.18, "rgba(255,255,255,0)");
  g.addColorStop(0.32, "rgba(255,255,255,0.30)");
  g.addColorStop(0.46, "rgba(255,255,255,0.92)");
  g.addColorStop(0.54, "rgba(255,255,255,0.92)");
  g.addColorStop(0.66, "rgba(255,255,255,0.40)");
  g.addColorStop(0.82, "rgba(255,255,255,0)");
  g.addColorStop(1.00, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Break the line up. A gradient alone is a drawn arc, and an arc of foam of
  // even width is the thing that gives a decal away.
  const rnd = seededRand(4711);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W, y = H * (0.16 + rnd() * 0.68), r = 4 + rnd() * 16;
    ctx.fillStyle = `rgba(0,0,0,${(0.2 + rnd() * 0.4).toFixed(3)})`;
    // drawn three times so the holes match across the seam -- U WRAPs, and a
    // 512px strip repeats often enough along a 200m shore to show a seam
    for (const ox of [-W, 0, W]) {
      ctx.beginPath();
      ctx.arc(x + ox, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  dt.update();
  dt.hasAlpha = true;
  dt.getAlphaFromRGB = false;     // opacity is the canvas alpha, not luminance
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.CLAMP_ADDRESSMODE;   // see the note above: this is load-bearing
  const m = new StandardMaterial(name, scene);
  // Foam has to out-read pale sand in daylight, which the first pass did not:
  // #e2eaf0 lit by this zone's blue hemi landed within a few values of the
  // strand under it and vanished. White diffuse plus a real emissive lift is
  // what separates them -- and the emissive is also what keeps the wash legible
  // at night, when the sand goes to nothing.
  m.diffuseColor = Color3.White();
  m.emissiveColor = Color3.FromHexString("#71818e");
  m.specularColor = new Color3(0.35, 0.35, 0.35);
  m.specularPower = 64;
  m.opacityTexture = dt;
  m.backFaceCulling = false;
  m.maxSimultaneousLights = 8;
  washMats.push({ tex: dt, t: phase, rate });
  return m;
}

// ---------- oceans and beaches ----------
//
// The pair that makes a coast, and the standing spec is WATER.md. `makeOcean`
// owns the water and the coastline; `makeBeach` owns the sand and the foam, and
// takes the ocean so that the two cannot disagree about where the land stops.
//
// AN OCEAN IS NOT A LAKE, and the whole design follows from that. The Mere was
// a basin() -- a bowl 98m across -- and a bowl has a FAR SIDE: its far shore
// came back up out of the water and stood a sand wall across the horizon behind
// the pier (Philip: "do not block the end of the ocean with sand or sand dune
// mountain, it's not a lake -- allow the ocean to fall off into the horizon").
// So:
//
//   * the coast is an ARC that OPENS seaward, not a closed rim. Past the width
//     of the bay it runs away as headlands, so the corners of a zone stay land
//     and the water leaves through the middle of one edge. A straight coast is
//     the same construction with a large `r`.
//   * the bed is FLAT seaward -- the wading shelf down to `floor`, then flat
//     forever. A bed that keeps falling has to be modelled, lit and covered all
//     the way out; a flat one needs none of that, and at eye height the far
//     edge of a flat sheet IS the horizon.
//   * ONE sheet, running `reach` metres -- well past the terrain -- so the fog
//     takes it long before you could see that it ends.
//
// The coastline has exactly ONE definition, `seaward()`. It has to: the sheet
// is hundreds of metres across and covers the whole zone, so anything that
// disagrees with the coast about where land is puts sea water in an inland
// hollow (Philip: "the ocean has seeped into deep land"). heightFn cuts the bed
// from it, the sheet is masked by it, the beach measures from it and the rim
// keeps out of it -- see the `clearWhere` note in RIM.md. Same lesson WATER.md
// records for the Reservoir's dam: four places free to disagree is how the dam
// ended up across the map from its water.
//
// Two-phase, like makeRiver and makePond:
//
//   const SEA = makeOcean(0, 130, 98, { facing: "N" });
//   ...height function:  h = SEA.carve(x, z, h);
//   ...zone builder:     SEA.build("mysea");
export interface Ocean {
  carve: (x: number, z: number, h: number) => number;
  build: (name: string) => void;
  seaward: (x: number, z: number) => number;   // metres seaward of the coast; NEGATIVE on land
  level: () => number;
  centre: () => [number, number];
  radius: () => number;
  shaped: () => boolean;   // true when the coast is a zone SHAPE, not an arc
  shape: () => ZoneShape | null;
}

export function makeOcean(
  cx: number, cz: number, r: number,
  opts: {
    facing?: "N" | "S" | "E" | "W";  // which way the open water lies; default "N"
    level?: number;                  // the waterline, default -1.25
    floor?: number;                  // how far the bed sits below the waterline out at sea
    shelf?: number;                  // metres from the waterline to reach that floor
    headland?: number;               // grade the coast runs off at past the bay's width
    wobble?: [number, number];       // the two coastline noise amplitudes
    reach?: number;                  // how far the sheet runs out, default 400
    // A SHAPED coast: the zone's own outline instead of an arc. `facing`, `cx`,
    // `cz` and `r` stop describing the coastline (they still position the sheet
    // and give makeBeach its scan centre) and the water starts at whichever of
    // the shape's edges is flagged `coast`. This is what a zone that is not a
    // square needs -- a peninsula has water on three sides and no single
    // facing, and an arc cannot say that.
    shore?: ZoneShape;
    // 0..1 on the coastline's wobble at (x, z), 1 when omitted: 0 where the
    // coast is BUILT -- a quay's face, a harbour wall -- so the waterline is the
    // shore polygon's own line there, not up to ~20 m either side of it
    // (Caerdun's harbour, zones/caerdun.ts)
    calm?: (x: number, z: number) => number;
    color?: string; maxAlpha?: number; refl?: number;
    deep?: number; edgeA?: number; order?: number;
    seed?: number;
  } = {},
): Ocean {
  const level = opts.level ?? -1.25;
  // MEASURED on the Mere, and the wading shelf is what these two are for: the
  // reference Philip sent (FFXIV, Costa del Sol) is clear water "for quite a
  // distance", and depth-driven transparency can only be as wide as the shallow
  // ground under it. 1.55m over 40m puts wadeable ground (depth <= 0.85) about
  // 21m out; a shorter shelf makes the whole clear band a few metres wide.
  // TWO THINGS EVERY OCEAN GUARANTEES, by construction rather than by per-zone
  // tuning (Philip). Both are about the same failure -- an ocean that runs out
  // before it becomes an ocean:
  //
  //   1. THE BED PASSES THE WADING DEPTH. A shelf that bottoms out above
  //      WADE_DEPTH is walkable all the way across, so the far side of the sea
  //      is somewhere a player can stand. The floor is raised to clear it.
  //   2. AND THEN 50m MORE OPEN WATER. Past the point where wading stops there
  //      has to be enough sheet left to read as a horizon rather than as an
  //      edge, whatever `reach` the caller asked for.
  const HORIZON_RUN = 50;
  const floor = Math.max(opts.floor ?? 1.55, WADE_DEPTH + 0.35);
  const shelfW = opts.shelf ?? 40;
  const headland = opts.headland ?? 1.6;
  const [wob0, wob1] = opts.wobble ?? [34, 11];
  // Where the shelf crosses WADE_DEPTH, from the closed-form inverse of the
  // smoothstep the bed is eased with: t = 0.5 - sin(asin(1 - 2y) / 3).
  const yBlock = Math.min(0.999, WADE_DEPTH / floor);
  const dBlock = shelfW * (0.5 - Math.sin(Math.asin(1 - 2 * yBlock) / 3));
  // how far the coastline itself gets from the sheet's centre: a shaped coast
  // says so exactly, an arc runs away as headlands past its own width
  const shoreMax = opts.shore
    ? Math.max(...opts.shore.pts.filter((_, i) => opts.shore!.coast[i])
        .map(([px, pz]) => Math.hypot(px - cx, pz - cz)))
    : r * 1.6;
  const reach = Math.max(opts.reach ?? 400, shoreMax + dBlock + HORIZON_RUN);
  const face = opts.facing ?? "N";
  const sd0 = opts.seed ?? 5;

  // Seaward distance, in the coast's own frame. `u` runs ALONG the shore and
  // `v` toward the open water, so one construction serves all four facings.
  const frame = (x: number, z: number): [number, number] =>
    face === "N" ? [x - cx, z - cz]
    : face === "S" ? [x - cx, cz - z]
    : face === "E" ? [z - cz, x - cx]
    : [z - cz, cx - x];

  const shore = opts.shore;
  const seaward = (x: number, z: number): number => {
    // Same two-octave world-space wobble either way: it is what keeps the
    // waterline from reading as drawn, and a polygon edge needs it more than
    // an arc does.
    if (shore) {
      let wob = (fbm(x / 42 + sd0, z / 42 + sd0) - 0.5) * wob0
                + (fbm(x / 13 + sd0 * 14, z / 13 + sd0 * 14) - 0.5) * wob1;
      if (opts.calm) wob *= opts.calm(x, z);
      const near = shapeNear(shore, x, z);
      // Distance to the SEA, signed. A land edge is never a shore, whichever
      // side of the polygon the point is on -- past the northern boundary of a
      // plate there is more land (the rim stands on it), not water -- so the
      // magnitude is always the distance to the nearest COAST edge, and a point
      // is only at sea if it left the plate and the water is what it left it
      // across.
      const atSea = !near.inside && near.dCoast <= near.dLand;
      return (atSea ? near.dCoast : -near.dCoast) - wob;
    }
    const [u, v] = frame(x, z);
    // Two-octave WORLD-SPACE wobble. A bearing term would seam where the angle
    // wraps; this cannot. It is what stops the arc reading as drawn with a
    // compass -- MEASURED on the basin this replaced, the shore moved only
    // 88.5..98m over its whole visible span without it.
    const wob = (fbm(x / 42 + sd0, z / 42 + sd0) - 0.5) * wob0
              + (fbm(x / 13 + sd0 * 14, z / 13 + sd0 * 14) - 0.5) * wob1;
    const au = Math.abs(u);
    // the bay's own arc for the width of the bay, then running away as
    // headlands, so the corners of the zone stay land
    const coast = au <= r ? -Math.sqrt(r * r - au * au) : (au - r) * headland;
    return v - coast - wob;
  };

  // FLAT seaward. Landward it leaves the field alone -- a bare ocean has a rock
  // coast, and makeBeach is what turns that into sand and a gradual rise.
  const carve = (x: number, z: number, h: number): number => {
    const sd = seaward(x, z);
    return sd <= 0 ? h : level - floor * smooth(Math.min(1, sd / shelfW));
  };

  const build = (name: string): void => {
    // WADEABLE ONLY AS FAR AS THE SHELF, and the DEPTH RULE is what says so
    // (Philip: players walk out until the water is 0.9m deep, and that is the
    // rule he wants). A river or a pond is wadeable by contract and registers
    // no depth blockers; an ocean is the opposite case -- its bed keeps falling
    // to `floor` and then runs flat to the horizon. One body covering the whole
    // sheet is enough because isWalkable tests the depth too: dry land inside
    // the circle is above the waterline and stays walkable.
    //
    // WHAT THIS DEMANDS OF A COAST: the shelf has to reach 0.9m INSIDE the
    // zone. MEASURED on the defaults (1.55m over 40m, eased) that is ~22m of
    // water, so a coastline running within ~22m of the terrain edge is
    // walkable to the edge and out of the world -- which is exactly what the
    // Moonmere Shores' west side did. Give a coast either room or a steeper
    // shelf; `floor` and `shelf` are the levers.
    waterBodies.push({ x: cx, z: cz, r: reach, level });
    // Masked to SEAWARD of the coast. The sheet's own depth clip is not enough
    // once it is this big: that clip says "water wherever the ground is under
    // the waterline", and hundreds of metres of disc reach inland hollows and
    // open field past the zone that legitimately are. The mask fades in over
    // the 8m the roughened waterline can actually wander, so it never cuts
    // before the depth ramp does.
    //
    // `rings` scales WITH the reach: the sheet's own clip draws the waterline,
    // and at vigShallowWater's default 46 a 400m sheet steps 8.7m per ring,
    // which scallops the edge exactly the way WATER.md records for rivers.
    vigShallowWater(name, cx, cz, reach, reach, opts.color ?? RIVER_WATER, level,
      { deep: opts.deep ?? 1.1, edgeA: opts.edgeA ?? 0.12,
        maxA: opts.maxAlpha ?? 0.82, order: opts.order ?? 2,
        rings: Math.max(46, Math.round(reach / 2)), segs: 144,
        mask: (x, z) => smooth(Math.min(1, Math.max(0, (seaward(x, z) + 6) / 8))) });
  };

  return { carve, build, seaward, level: () => level, centre: () => [cx, cz], radius: () => r,
           shaped: () => !!shore, shape: () => shore ?? null };
}

// The beach: the shore an ocean lands on. Complementary to makeOcean and always
// built against one, so the coastline stays single-sourced.
//
// Four things, and they are the four Philip asked for on the Mere:
//
//   * it GRADUALLY LEVELS UP to the dry land. Over the last `blend` metres the
//     field noise gives way to a straight beach plane at `grade`. Past the
//     blend the ground is deterministic, which is the point: it is what makes
//     the waterline one clean curve, and what stops the noise minting lagoons
//     behind the beach. Same treatment as the Shore Road's coast.
//   * a SAND BEACH BLENDING INTO THE TERRAIN'S MATERIAL on top. The sheet runs
//     `outset` metres of dry sand past the waterline and then fades out over
//     `fade` more, so it thins into the zone's own ground instead of ending on
//     a line -- the same rule shallow river banks follow.
//   * the BED under the shallow water IS THAT SAME SAND, one sheet, so there is
//     no join between the wet bed and the dry strand to get wrong.
//   * WAVE FOAM. A sweep, not a scroll: "waves moving back and forth towards
//     the banks" (Philip) is the one thing a scroll cannot show.
//
// The sand and the foam share ONE MEASURED waterline (`shoreRing`, ~90k
// heightFn calls) rather than assuming a radius. They have to: the roughness
// below wanders the crossing by several metres on every bearing, so a drawn
// circle sits in the water on one side of the bay and up the field on the other.
//
//   const BEACH = makeBeach(SEA);
//   ...height function:  h = BEACH.carve(x, z, h);   // AFTER SEA.carve
//   ...zone builder:     BEACH.build("mybeach");
//   ...reeds etc:        BEACH.ring()   (the measured crossing, per bearing)
export function makeBeach(
  ocean: Ocean,
  opts: {
    grade?: number;              // the dry beach's slope, default 4.5cm/m
    blend?: number;              // metres of land the ramp blends across
    rough?: number;              // roughness on the profile; this raggeds the waterline
    outset?: number;             // metres of DRY sand past the waterline
    fade?: number;               // metres the sand thins into the zone's ground over
    sheet?: string;              // ground sheet, default the Mere strand's aerial_beach_01
    tile?: number;
    tints?: [string, string];
    wash?: boolean;              // the foam, default true
    washRate?: number;
    half?: number;               // crossings beyond this |x| or |z| are off the zone
    cells?: number;
    order?: number;              // sand alphaIndex; the wash rides one above it
    // where the DRY sand is not laid (the bed under the water still is): a
    // built shore -- Caerdun's harbour ward, quay walls to the water -- has no
    // strand above its waterline. Undefined everywhere else, so no other
    // coast changes.
    noDrySand?: (x: number, z: number) => boolean;
    // where no sand is laid at all, bed or strand: a face standing out of the water
    // seaward of the coast line (Caerdun's plateau where the sea's carve cuts it),
    // asked only within 30 m of the waterline (`seaward` is the ocean's own)
    bare?: (x: number, z: number, seaward: number) => boolean;
    // A SHAPED ocean's sand bed takes only the ring's widest crossing from the shore
    // march (its mesh's extent; the alpha is seaward()'s), and the march is 360 rays
    // of half-metre height samples -- Caerdun's ~120 ms of its zone build, MEASURED
    // by its CPU profile. A zone that has measured that radius passes it and skips the
    // march; unset (every other coast), the march runs as before.
    ringMax?: number;
    skip?: (x: number, z: number) => boolean;   // no sand and no wash here, and the carve passes h through (a quay-walled harbour)
  } = {},
): { carve: (x: number, z: number, h: number) => number; build: (name: string) => void;
     ring: () => (number | null)[] } {
  const grade = opts.grade ?? 0.045;
  const blend = opts.blend ?? 55;
  // +-0.18m of roughness on a 4.5cm/m beach moves the waterline +-4m locally,
  // which is what makes the edge ragged at arm's length rather than only at map
  // scale. It fades out seaward so the open water stays FLAT -- a wobbling far
  // sheet is a wobbling horizon.
  const rough = opts.rough ?? 0.36;
  const outset = opts.outset ?? 16;
  const fade = opts.fade ?? 11;
  const level = ocean.level();
  const [cx, cz] = ocean.centre();
  const r = ocean.radius();
  const half = opts.half ?? r * 1.45;
  const order = opts.order ?? 1;
  let ring: (number | null)[] | null = null;

  const skip = opts.skip;
  const carve = (x: number, z: number, h: number): number => {
    if (skip?.(x, z)) return h;
    const sd = ocean.seaward(x, z);
    const near = smooth(Math.min(1, Math.max(0, (blend - Math.abs(sd)) / blend)));
    if (sd <= 0) {
      const t = smooth(Math.min(1, Math.max(0, (sd + blend) / blend)));
      h = h * (1 - t) + (level - sd * grade) * t;
    }
    return h + (fbm(x / 9 + 21, z / 9 + 21) - 0.5) * rough * near;
  };

  const build = (name: string): void => {
    // the ocean's own coastline is the filter: a crossing 25m or more inland of
    // it is a hollow in a field, not the shore (see shoreRing's `accept`)
    ring = opts.ringMax !== undefined && ocean.shaped() ? [opts.ringMax] : shoreRing(cx, cz, level, 360, r * 0.6, half, half,
      (x, z) => ocean.seaward(x, z) > -25 && !skip?.(x, z));
    const mat = vigGroundSheet(name + "sand", opts.sheet ?? "aerial_beach_01");
    const [t1, t2] = opts.tints ?? ["#b4bcae", "#dcdcca"];
    // Everything inside the shoreline is sand -- the bed, the rises standing
    // out of the shallows, and the dry strand past the waterline, all one
    // sheet. It also carries the bed PAST the zone square, which buildTerrain
    // does not: the ground stops dead at the boundary, and under see-through
    // water that shows as a ruled line of sand ending in mid-water.
    vigSandBed(name, cx, cz, ring, outset, fade, mat, opts.tile ?? 9, t1, t2,
      { cells: opts.cells ?? 132, order, fillNulls: !ocean.shaped(),
        alphaAt: ocean.shaped()
          ? (x, z) => {
              if (skip?.(x, z)) return 0;
              // seaward of the shore it is all bed; landward it is `outset` of
              // dry strand and then a fade into the zone's own ground
              const sd = ocean.seaward(x, z);
              if (opts.bare && Math.abs(sd) < 30 && opts.bare(x, z, sd)) return 0;
              const a = sd >= 0 ? 1 : 1 - smooth(Math.min(1, Math.max(0, (-sd - outset) / fade)));
              // (asked only where there would be sand: Caerdun's test samples the height)
              if (sd < 0 && a > 0 && opts.noDrySand?.(x, z)) return 0;
              return a;
            }
          : undefined });
    if (opts.wash === false) return;
    // Only 8m of it, straddling the waterline and weighted to the WATER side:
    // foam the full width of the sand reads as a second beach, and foam pushed
    // onto dry sand reads as a rope lying on it. The 0 alpha at BOTH outer
    // stops is what kills the visible strip boundary -- an end at full alpha
    // gets cut off flat wherever the sweep pushes it against the mesh edge,
    // which outlines the wash's own geometry the moment the wave reaches it.
    // 8m of foam straddling the waterline, weighted to the water side. `mirror`
    // is what makes the same cross-section work on a plate, whose scan centre
    // is inland: the offsets are applied outward instead of inward, and the
    // stops keep meaning what they say.
    const washOpts = { uv: "band" as const, level, lift: 0.11, uRepeat: 9, order: order + 2 };
    const washMat = makeShoreWash(name + "washm", opts.washRate ?? 0.42);
    const stops: [number, number][] = [[-11, 0], [-7, 1], [0, 1], [4, 0]];
    const shape = ocean.shape();
    if (shape) {
      // every coast edge of the shape, bays and horns included -- the polar
      // ring above cannot see into a bay (see shapeShoreSamples)
      bandMesh(name + "wash", shapeShoreSamples(shape, level, (x, z) => ocean.seaward(x, z) > -25 && !skip?.(x, z)),
        true, stops, washMat, washOpts);
    } else {
      shoreBand(name + "wash", cx, cz, ring, stops, washMat, { ...washOpts, mirror: false });
    }
  };

  return { carve, build, ring: () => ring ?? [] };
}

// hand-declared clearings for zones with no NPC/portal data to derive them from
const VIG_AVOID: Record<string, [number, number, number][]> = {
  // The real zone derives most of its clearings from its own data (avoidPoints
  // reads the portals, NPCs and landmarks), so these are only what the data
  // cannot say: the built corridors. The Mere itself is NOT here -- it is a
  // 240m arc, not a circle, and it speaks for itself through vegExclusions.
  moonmereshores: [
    [0, -290, 26], [0, -250, 22],                                  // the causeway
    [-190, -272, 30], [-190, -230, 26], [-160, -222, 22],          // the ferry berths and their yard
    [150, -214, 26], [150, -152, 34],                              // the reed harvest and its beds
    [0, -170, 16], [0, -80, 14], [0, 10, 14], [0, 110, 14], [0, 200, 16], [0, 240, 18],  // the north road
    [76, -10, 13], [148, 50, 13], [220, 110, 13], [276, 154, 18],                      // the shore road
    [0, -200, 16],                                                 // the causeway gate
    [-70, -172, 13], [-140, -182, 13],                             // the west road to the berths
    // the 2026-10-10 revamp (zones/moonmereshores.ts): the shore road's new
    // end into the east pass, the footpaths, and the places they lead to
    [262, 148, 12], [290, 166, 14],
    [-30, -38, 9], [-80, -52, 18], [-140, -28, 9], [-200, -6, 9], [-226, 34, 9],   // the dial, the Point path
    [-250, 62, 22],                                                // the Point and its lamp
    [142, -44, 12], [166, -30, 10], [132, -4, 18],                 // the lookout ramp and ruin
  ],
  // 20 at the origin, not 12: that circle is the BRIDGE corridor now, and the
  // deck alone reaches 13m either side of the centreline. At 12 the scatter
  // put a dead tree on the west landing, right in the mouth of the crossing
  // (Philip). The radius has to clear the deck plus its approach, not just the
  // canal.
};

function zseed(zoneKey: string): number {
  let h = 7;
  for (let i = 0; i < zoneKey.length; i++) h = (h * 31 + zoneKey.charCodeAt(i)) % 100000;
  return h;
}

// The zone's road network: the north road from the causeway gate to the shut
// border gate, the shore road leaving north-east, and the two shore tracks to
// the ferry berths and the reed harvest. Kept as one table because the tiles
// that draw a road and the wood that must not grow across it have to agree
// about where it runs -- the same reason a river is one makeRiver polyline.
export const MS_ROADS: [number, number][][] = [
  // the causeway gate north to the shut border gate at the plate's apex
  [[0, -224], [4, -160], [0, -70], [6, 30], [0, 130], [0, 200], [0, 240]],
  // the shore road, up through the wood to the pass in the east chain
  // (zones/moonmereshores.ts PASS_E: its last three points are the pass's own
  // road, veil-front, knee and mouth, MEASURED off makeRimPass -- copied here
  // because this table is read before any module is)
  [[4, -70], [76, -10], [148, 50], [220, 110], [262, 148], [279.8, 162.3], [300.5, 170.9], [320.5, 171.9]],
  // the west track down to the ferry berths on the south-west shore: it ends
  // at the pier's ROOT on the sand (MEASURED: the deck starts at z ~ -180 at
  // x -190); the old end at (-188,-216) was 32m out over the water
  [[0, -150], [-60, -170], [-130, -180], [-190, -176]],
  // and the east track to the reed harvest
  [[0, -166], [60, -176], [116, -180], [150, -184]],
];
// The footpaths (2026-10-10 revamp, zones/moonmereshores.ts): out past the
// Shore Dial to the Point's lamp, and up the ramp onto the plateau's west tip
// to the Mere Lookout. Here, not in the module, for the same reason as the
// roads: the wood below is planted off this table, and it must not stand a
// tree on a path.
export const MS_PATHS: [number, number][][] = [
  [[2, -40], [-62, -35], [-110, -33], [-160, -22], [-200, -6], [-222, 22], [-234, 50]],
  [[40, -40], [90, -50], [118, -46], [164, -42], [168, -20], [150, -10]],
];
// The generic scatters (buildGenericWilds) keep off VIG_AVOID's circles and
// nothing else -- scatterModels does not read the mapped roads -- and the
// hand list above has gaps a tree can stand in (one stood in the middle of
// the north road at z -56, in the arrival view). So every road and path gets
// a chain of circles along it, 12 m apart, as wide as the road plus a crown.
for (const line of [...MS_ROADS, ...MS_PATHS])
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= L; t += 12) VIG_AVOID.moonmereshores.push([ax + (bx - ax) * t / L, az + (bz - az) * t / L, 8]);
  }
function msRoadDist(x: number, z: number): number {
  let best = Infinity;
  for (const line of [...MS_ROADS, ...MS_PATHS])
    for (let i = 0; i < line.length - 1; i++)
      best = Math.min(best, segDist(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1])[0]);
  return best;
}

// ---------- the Moonmere Shores ----------
//
// The first Empty Throne wilderness zone built for real, promoted out of the
// v_moonmereshores lookdev slice. Everything the vignette settled comes over
// unchanged -- the ocean/beach pair and their treatment, the leafy_grass sheet
// and its tint pair, the postcard's fog colours, the pier's timber and its
// proportions -- and the LAYOUT is the zone card in design/the-empty-throne.html:
//
//   the Mere across the south, leaving through the middle of that edge
//   the causeway out of the middle of the bay, south to the academy's island
//   the ferry piers on the south-west shore -- the paid crossing over the gulf
//   the reed harvest on the south-east shore
//   the reed flats (the card's marsh stipple) west of the road
//   a wood in the north-east
//   the shut border gate due north, and the shore road leaving north-east
//
// Three of those four exits have no zone behind them yet -- the Shore Road and
// the Summer Lakes are still vignettes, and the gulf ferry's far landing is the
// Caerdun Fields -- so they are built as PLACES rather than as portals: a shut
// gate with a watch on it, a ferry at its berth, a road that leaves. Only the
// causeway is wired, and it is wired both ways (Moonmere grew the north
// causeway this zone lands on). A portal to a zone that does not exist would
// not fail visibly: World#travel would simply move the character into nowhere.
// THE ONE CAUSEWAY. Moonmere's and the Shores' are the two ends of the same
// road across the Mere, so they are the same build (Philip: "they are the same
// causeway"): a deck out from `zLand` toward `zSea`, either way along z, with
// the zone's portal standing on it. makeCauseway lays the WALK only -- the road,
// the deck's flat zone and footprint, the parapets' colliders, the barrier and
// the landward ramp; the stone is drawn by zones/moonmere_causeway.ts (the city's
// end) and zones/moonmere_shores.ts (the Shores'), MOONMERE.md A-14, MM-15. (Its
// village-kit deck, torches, stair course and gatehouse went 2026-10-10.)
interface CausewaySpec {
  x: number;              // the deck's centreline
  zLand: number;          // landward end, the road's first point
  zSea: number;           // past the plate edge, so it does not end in mid-water
  deck: number;           // deck top
  barrierZ: number;       // nothing walks PAST the portal: a collider across the deck here
  gateZ: number;          // the gate on the road at the landward end (moonmere_shores.ts draws the Shores' there)
  landY?: number;         // set: the landward end is a flush ramp down to this level (else a step of 1 m below the deck)
  draw?: boolean;         // false: moonmere_shores.ts draws the Shores' stone (makeCauseway itself draws none)
}
// the last causeway laid this build (MOONMERE.md A-14: the Shores' module draws what makeCauseway walked)
let lastCauseway: CausewaySpec | null = null;
function makeCauseway(s: CausewaySpec): void {
  lastCauseway = s;
  const X = s.x, DECK = s.deck, dir = Math.sign(s.zSea - s.zLand);
  mapRoad([[X, s.zLand], [X, s.zSea]], 4.5); // the causeway is a road across the water
  // (the deck's metre past its land end stood over the kit's stair course; with that course drawn by
  // the Shores' steps instead, MOONMERE.md A-14, the walk meets their flight at the deck's end)
  const landPad = s.landY === undefined ? 0 : 1;
  const z0 = Math.min(s.zLand, s.zSea) - (dir > 0 ? landPad : 0), z1 = Math.max(s.zLand, s.zSea) + (dir > 0 ? 0 : landPad);
  flatZones.push({ x0: X - 4.5, x1: X + 4.5, z0, z1, y: DECK + 0.02 });
  recordFootprint(X, (z0 + z1) / 2, 10, z1 - z0);
  for (const side of [-1, 1]) colliders.push({ x0: X + side * 4.6 - 0.2, x1: X + side * 4.6 + 0.2, z0, z1, y1: DECK + 2 });
  // Nothing walks PAST the portal (Philip). The deck runs on as scenery -- it
  // has to, or the causeway would end in mid-water where the zone does -- so
  // the barrier is a collider across the deck rather than a shortened deck.
  colliders.push({ x0: X - 5, x1: X + 5, z0: s.barrierZ - 1, z1: s.barrierZ + 1, y1: DECK + 3 });
  // the landward end: a ramp a metre down onto the head of the road (the
  // Shores' steps draw it) -- or, with `landY`, a flush ramp onto a landing that
  // stands at that level (MOONMERE.md section 7)
  buildApi.addRamp(X, s.zLand, DECK, X, s.zLand - dir * 2.1, s.landY ?? DECK - 1, 5.2);
  slopeExempt.push({ x: X, z: s.zLand - dir * 2, r: 8 });
}

// THE HARBOUR, in the bay bitten out of the south-east coast. A stone quay
// along the head of it, two moles reaching out, and what is tied up alongside.
//
// A MOLE rather than a timber jetty on posts: the whole city is masonry on a
// rock island, and the kit's Stairs_Exterior_Platform is a solid 2x2x1m block
// that stacks into exactly this. It also means the harbour needs no primitives
// -- the piers the Shores use are boxes and cylinders, which is the thing
// [[no-procedural-props]] exists to stop spreading.
// A STONE QUAY on any shore: an apron along the water, moles reaching out,
// ships moored where the bed is deep enough, and the working clutter. Every
// city harbour is one of these; the old Moonmere's was the first (retired,
// MOONMERE.md "The old city, retired").
//
// Built in the SHORE'S OWN FRAME. The first version laid the quay on world
// axes -- rows along +x, moles running +z -- which only faces the water if the
// coast happens to run north-south, and at the head of Moonmere's bay it does
// not (Philip: "the harbour is not properly placed facing into the water").
// `inland` is the shape's own signed distance, so its gradient points away
// from the sea; negate it and you have seaward, and its perpendicular is the
// shoreline. Everything is placed in (along-shore, seaward) metres.
//
// It walks out from `start` -- a point inside the bay head -- along that
// point's own seaward bearing rather than a hand-picked one, until the BED is
// a fathom under the waterline. Not to the waterline: the strand carves a wide
// shallow shelf past it, and a quay stopped at the shoreline stood on wet sand
// with its moles running out over the shallows and the ships beached
// alongside (Philip: "harbor's piers are not all in the water").
interface QuayOpts {
  shape: ZoneShape; sea: Ocean;
  start: [number, number];
  width?: number; depth?: number;                    // the apron, along-shore and inland
  moles?: [number, number, number][];                // [along-shore offset, length, half-width]
  // [along, seaward, keel depth needed, file, scale, extra turn]
  ships?: [number, number, number, string, number, number][];
  clutter?: number;
  /** The stone way from the apron's back to `start`; on unless a zone builds its own. */
  hard?: boolean;
  seed: string;
}
interface Quay {
  at: (a: number, o: number) => [number, number];    // (along-shore, seaward) -> world
  mass: (px: number, pz: number, exposed?: ("pz" | "nz")[]) => void;
  yaw: number; DECK: number; LEVEL: number; QW: number; QD: number;
  qx: number; qz: number; sx: number; sz: number; tx: number; tz: number;
}
function makeQuay(o: QuayOpts): Quay {
  const rnd = seededRand(zseed(o.seed));
  const LEVEL = o.sea.level();
  const DECK = LEVEL + 1.9;              // freeboard: a cart's axle over the water
  const inland = (x: number, z: number) => {
    const q = shapeNear(o.shape, x, z);
    return q.inside ? q.dCoast : -q.dCoast;
  };
  const frame = (x: number, z: number) => {
    const e = 4;
    const gx = (inland(x + e, z) - inland(x - e, z)) / (2 * e);
    const gz = (inland(x, z + e) - inland(x, z - e)) / (2 * e);
    const m = Math.hypot(gx, gz) || 1;
    const sx = -gx / m, sz = -gz / m;    // seaward
    return { sx, sz, tx: -sz, tz: sx };  // and the shoreline tangent
  };
  let [hx, hz] = o.start;
  for (let step = 0; step < 80; step++) {
    const f = frame(hx, hz);
    if (heightFn(hx, hz) < LEVEL - 1.4) break;
    hx += f.sx * 1.5; hz += f.sz * 1.5;
  }
  const { sx, sz, tx, tz } = frame(hx, hz);
  // the quay's FACE (o = 3, below) stands at that depth
  const qx = hx - sx * 3, qz = hz - sz * 3;
  const at = (a: number, ofs: number) => [qx + tx * a + sx * ofs, qz + tz * a + sz * ofs] as [number, number];
  const yaw = Math.atan2(sx, sz);        // a piece's local +z points out to sea

  // masonry from the deck down to whatever the bed does under it -- the deep
  // end of a mole is several courses, the back of the apron is one
  // (the block's open faces are +-z; here local +z is seaward, so a face that
  // meets the water is named `exposed` and skinned -- see makeMasonry)
  const mass = (px: number, pz: number, exposed: ("pz" | "nz")[] = []) =>
    makeMasonry(px, pz, DECK, yaw, { exposed, floor: DECK - 9 });
  // the apron: walkable, sea on the seaward side
  const QW = o.width ?? 38, QD = o.depth ?? 12;
  for (let a = -QW / 2; a <= QW / 2; a += 2) {
    for (let ofs = -QD; ofs <= 2; ofs += 2) {
      const [px, pz] = at(a, ofs);
      mass(px, pz, ofs === 2 ? ["pz"] : ofs === -QD ? ["nz"] : []);
      place("Floor_RoundRocks", px, DECK, pz, yaw);
    }
    const [ex, ez] = at(a, 2.9);
    place("Prop_ExteriorBorder_Straight1", ex, DECK, ez, yaw);
  }
  // and a stair at each end of the apron, down onto the strand
  for (const a of [-QW / 2 - 1, QW / 2 + 1]) {
    const [px, pz] = at(a, -QD + 3);
    const g = heightFn(px, pz);
    if (g < DECK - 0.4) makeFlight(px, pz, yaw + (a < 0 ? -Math.PI / 2 : Math.PI / 2), DECK, 3);
  }
  buildApi.addFlatZone(Math.min(qx - QW / 2, qx + QW / 2) - 6, Math.max(qx - QW / 2, qx + QW / 2) + 6,
    Math.min(qz - QW / 2, qz + QW / 2) - 6, Math.max(qz - QW / 2, qz + QW / 2) + 6, DECK);

  // THE HARD: a stone way from the back of the apron to `start`, where the
  // road ends, so the road reaches the quay over stone rather than across
  // the wash. The apron stands where the BED is deep enough, which can be
  // thirty metres of strand and shallows past the road's end (Heartwood,
  // MEASURED; Philip: "need a bridge connection to the harbor"). Six metres
  // wide, on the same masonry, kerbed; a tread down onto the road where the
  // road is lower, a kerb-step ramp where it is higher. A caller that lays its
  // own hard passes `hard: false`.
  if (o.hard !== false) {
    const [bx, bz] = at(0, -QD - 1);
    const [ex, ez] = o.start;
    const L0 = Math.hypot(ex - bx, ez - bz);
    const ux = (ex - bx) / (L0 || 1), uz = (ez - bz) / (L0 || 1);
    // only when the road's end is landward of the apron
    if (L0 > 2 && ux * sx + uz * sz < 0) {
      const hy = Math.atan2(ux, uz);
      for (let d = 1; d < L0 + 1; d += 2) {
        for (const w of [-2, 0, 2]) {
          const px = bx + ux * d - uz * w, pz = bz + uz * d + ux * w;
          mass(px, pz);
          place("Floor_RoundRocks", px, DECK, pz, hy);
        }
        if (d % 4 === 1) for (const w of [-3, 3]) {
          place("Prop_ExteriorBorder_Straight1", bx + ux * d - uz * w, DECK, bz + uz * d + ux * w, hy + (w < 0 ? Math.PI / 2 : -Math.PI / 2));
        }
      }
      buildApi.addDeck((bx + ex) / 2, (bz + ez) / 2, 3.2, L0 / 2 + 0.6, hy, DECK + 0.02);
      const g = heightFn(ex, ez);
      if (g < DECK - 0.4) makeFlight(ex, ez, hy, DECK, 3);
      else buildApi.addRamp(ex - ux * 2, ez - uz * 2, DECK, ex + ux * 2, ez + uz * 2, g, 3.2);
    }
  }

  // the moles, reaching OUT TO SEA -- along +seaward, which is the point
  const moles = o.moles ?? [[-12, 30, 2], [13, 20, 2]];
  for (const [a0, len, wide] of moles) {
    for (let ofs = 3; ofs < len; ofs += 2) {
      for (let w = -wide; w <= wide; w += 2) {
        const [px, pz] = at(a0 + w, ofs);
        mass(px, pz, ofs + 2 >= len ? ["pz"] : []);
        place("Floor_RoundRocks", px, DECK, pz, yaw);
      }
      if (ofs % 6 === 3) {
        const [kx, kz] = at(a0 - wide - 1, ofs);
        place("Prop_ExteriorBorder_Straight1", kx, DECK, kz, yaw + Math.PI / 2);
      }
    }
    // the mole is walkable to its end
    const [ex, ez] = at(a0, len / 2 + 1);
    const half = Math.abs(tx) > Math.abs(tz) ? [len / 2 + 2, 3.5] : [3.5, len / 2 + 2];
    buildApi.addFlatZone(ex - half[0], ex + half[0], ez - half[1], ez + half[1], DECK + 0.02);
  }

  // moored alongside, sitting IN the water. A hull's long axis is its local x
  // (MEASURED: Ship_Large runs x -9.5..5.9), so lying PARALLEL to a mole means
  // a quarter turn from the seaward yaw -- without it every ship lay across
  // its berth (Philip). Each only where the bed is actually under it: a hull
  // over a shallow reads as beached, and the bay's floor is measured, not
  // assumed -- scanning out along the berth from where it was asked for to
  // the first point with water enough under the keel.
  const ships = o.ships ?? [[-25, 12, 2.0, "pirate/Ship_Large.gltf", 2.4, 0],
    [0, 10, 0.9, "pirate/Ship_Small.gltf", 1.5, 0], [19, 8, 0.9, "pirate/Ship_Small.gltf", 1.4, 0.15]];
  for (const [a, o0, need, file, sc, turn] of ships) {
    for (let ofs = o0; ofs < o0 + 60; ofs += 1.5) {
      if (heightFn(...at(a, ofs)) < LEVEL - need) {
        const [px, pz] = at(a, ofs);
        place(file, px, LEVEL - 0.3, pz, yaw + Math.PI / 2 + turn, 0, 0, sc);
        break;
      }
    }
  }

  // the working clutter of a quay, kept on the apron rather than the moles
  for (let i = 0; i < (o.clutter ?? 34); i++) {
    const [px, pz] = at((rnd() - 0.5) * QW * 0.9, 1.5 - rnd() * (QD - 2));
    const r = rnd();
    place(r < 0.4 ? "props/Barrel.gltf" : r < 0.7 ? "props/Crate_Wooden.gltf"
      : r < 0.85 ? "town/Prop_Crate.gltf" : "props/Bucket_Wooden_1.gltf",
      px, DECK, pz, rnd() * 6.3);
  }
  const [wgx, wgz] = at(10, -5);
  place("town/Prop_Wagon.gltf", wgx, DECK, wgz, yaw + 1.4);
  return { at, mass, yaw, DECK, LEVEL, QW, QD, qx, qz, sx, sz, tx, tz };
}


// which side of a shaped coast a point is on, and how far (Heartwood's sea floor)
function offshore(sh:ZoneShape,x:number,z:number):{sea:boolean;d:number} {const q=shapeNear(sh,x,z);return{sea:!q.inside&&q.dCoast<q.dLand,d:q.dCoast};}

// ── ramparts ─────────────────────────────────────────────────────────────────
//
// A RAMPART along a line of points: `columns` of cut stone at the given
// outward offsets from each point (outward = toward the enemy), from `top`
// down to `foot`, a walk along the top course registered as a level, merlons
// on the outer edge, a drum tower every `towerEvery` metres and a flight down
// to the ground behind every `stairEvery`. `skip` says where the line is
// broken (a gate's passage, a quay).
//
// It stands ON ITS OWN GROUND. The first Caerdun ramparts were masonry
// facings on the terrace risers -- columns at the foot of the cliff, the walk
// flush with the terrace above -- and Philip ruled that out: "the ramparts
// should be placed on top of the cliff on the terrace it is guarding... the
// cliff face acts as an additional defensive wall." So a rampart is a
// free-standing wall now: `foot` is the ground it stands on, `top` its top
// course, and the masonry fills down to whichever is lower, the foot or the
// drawn surface, so a wall across a road's cutting keeps its footing.
//
// Blocks are yawed so their SOLID faces look out and in; open faces are
// buried against the neighbours along the run.
//
// TWO PASSES. The drums are planned first, on the run's own spacing, so no
// block is ever laid inside one; then the blocks. `anchors` are drums the run
// must MEET -- a gatehouse's towers -- and the run stops at their faces with
// a CLOSING SECTION bisected onto the boundary rather than at whichever 2m
// step fell last: a run skipped by distance-from-the-road stopped up to
// fifteen metres short of the gate where it met the road at an angle
// (Philip: "please connect the ramparts to the gate"). The closing section
// is lifted 4mm so its top course cannot flicker against the block it
// overlaps.
//
// THE STAIRS RUN ALONG THE WALL, not out from it (Philip: "all rampart stairs
// should run parallel to the wall"): a flight hugging the inner face, its
// top at the walk, running back the way the wall came, and only where the
// wall behind it is built -- never across a gate, into a drum or off the
// run's end.
//
// Colliders by height (resolveCollision blocks a character whose feet are
// within 1.2m below a box's bottom up to its top): the outer face from the
// foot to the top, so the lower ground cannot walk into it; a step on the
// walk's inner edge that stops the upper ground but not the walk; and the
// parapet, on every outer block, so nobody walks off between merlons.
interface RampartSpec {
  pts: [number, number][]; out: [number, number][];
  top: (i: number) => number; foot: (i: number) => number;
  columns?: number[];
  walk?: boolean;
  towerEvery?: number; stairEvery?: number;
  towerR?: number;
  skip?: (x: number, z: number) => boolean;
  /** Drums the run must meet face to face (a gatehouse's towers). */
  anchors?: { x: number; z: number; r: number }[];
  /** false: the columns between the outer and inner faces lay only their top
   * course, under the walk. Hidden behind both faces and sealed at the ends
   * by drums, the core is over a quarter of a three-column wall's blocks
   * and none of its look -- the Capital's octagon curtain (1,564 m of
   * perimeter) is 34.8k blocks solid, 25.4k hollow, 27% off (MEASURED).
   * Only for runs whose ends all land in drums or anchors: an open end, or
   * a bend's fan, would show the hollow. */
  solidCore?: boolean;
  seed: number;
}
function makeRampart(s: RampartSpec): void {
  const cols = s.columns ?? [4.6, 2.6, 0.6];
  const outer = cols[0], inner = cols[cols.length - 1], mid = (outer + inner) / 2;
  const walk = s.walk !== false;
  const towerEvery = s.towerEvery ?? 80, stairEvery = s.stairEvery ?? 40;
  const towerR = s.towerR ?? 5;
  const nMod = Math.max(8, Math.round((2 * Math.PI * towerR) / MOD));
  const R = (nMod * MOD) / (2 * Math.PI);             // the radius makeTower will actually close at
  const n = s.pts.length;
  const at = (i: number, o: number): [number, number] => [s.pts[i][0] + s.out[i][0] * o, s.pts[i][1] + s.out[i][1] * o];
  const seg = (i: number) => (i > 0 ? Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]) : 0);

  // pass 1: the drums, straddling the middle column, a spacing apart along
  // the unbroken run, never overlapping an anchor
  const anchors = (s.anchors ?? []).map((a) => ({ ...a }));
  const blockedAt = (x: number, z: number) =>
    (s.skip !== undefined && s.skip(x, z)) || anchors.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + 0.8);
  const drums: { x: number; z: number; door: number; seed: number }[] = [];
  let since = towerEvery / 2;
  for (let i = 0; i < n; i++) {
    const [mx, mz] = at(i, mid);
    if (blockedAt(mx, mz) || s.top(i) - s.foot(i) < 0.5) { since = towerEvery / 2; continue; }
    since += seg(i);
    if (since < towerEvery) continue;
    if (anchors.some((a) => Math.hypot(mx - a.x, mz - a.z) < a.r + R + 3)) continue;
    since = 0;
    drums.push({ x: mx, z: mz, door: Math.atan2(-s.out[i][0], -s.out[i][1]), seed: s.seed + i });
    anchors.push({ x: mx, z: mz, r: R });
  }

  const joinLandings:{x:number;z:number;y:number;half:number}[]=[];
  // pass 2: the blocks
  // `cap` names the section's open along-face to skin (makeMasonry's
  // `exposed`): a run's first and last sections show their hollow blocks
  // otherwise (Philip: "cover this rawness").
  const section = (x: number, z: number, ox: number, oz: number, i: number, lift: number, full = true, cap?: "pz" | "nz") => {
    const top = s.top(i) + lift, foot = s.foot(i);
    // A block's SOLID faces are its local +-x (makeMasonry), so local +x
    // points outward: local +x maps to (cos yaw, -sin yaw). Yawed with local
    // +z outward instead, every block showed its open side to the harbour and
    // the whole rampart read as stacked shelves (MEASURED, first walk view).
    // Local z then runs along the wall, so the decks' and colliders' extents
    // are (across, along).
    const yaw = Math.atan2(-oz, ox);
    const ground = (bx: number, bz: number) => {
      return Math.min(foot,buildApi.surface(bx,bz));
    };
    const exposed: ("pz" | "nz")[] = cap ? [cap] : [];
    // the same slab makeMasonry hangs on an exposed face, for the courses
    // placed here directly (the top course, the merlons)
    const slab = (px: number, pz: number, yy: number) => {
      if (!cap) return;
      const d = cap === "pz" ? 0.8 : -0.8;
      place("Stairs_Exterior_SingleSideThick", px + Math.sin(yaw) * d, yy, pz + Math.cos(yaw) * d, yaw + Math.PI / 2);
    };
    const kept = cols;
    for (const o of kept) makeMasonry(x + ox * o, z + oz * o, top, yaw,
      s.solidCore === false && o !== outer && o !== inner ? { ground, exposed, floor: top - 1.5 } : { ground, exposed });
    if (walk) {
      // the walk: the top course across all columns, a deck over it
      for (const o of kept) { place("Stairs_Exterior_Platform", x + ox * o, top, z + oz * o, yaw); slab(x + ox * o, z + oz * o, top); }
      for(let a=0;a<kept.length;){let b=a;while(b+1<kept.length&&Math.abs(kept[b+1]-kept[b])<2.1)b++;
        const lo=Math.min(kept[a],kept[b]),hi=Math.max(kept[a],kept[b]),centre=(lo+hi)/2;
        buildApi.addDeck(x+ox*centre,z+oz*centre,(hi-lo)/2+1,1.05,yaw,top+1);
        if(full)joinLandings.push({x:x+ox*centre,z:z+oz*centre,y:top+1,half:(hi-lo)/2+1});a=b+1;
      }
      // the inner step: stops the ground behind, not the walk
      if(kept.includes(inner))buildApi.addBoxCollider(x + ox * (inner - 0.6), z + oz * (inner - 0.6), 0.5, 1.0, yaw, top + 0.5, top - 0.3);
    }
    // the parapet on the outer edge: a merlon every other block, and a
    // barrier on every one
    if (full && kept.includes(outer) && i % 2 === 0) {
      place("Stairs_Exterior_Platform", x + ox * outer, top + (walk ? 1 : 0), z + oz * outer, yaw);
      slab(x + ox * outer, z + oz * outer, top + (walk ? 1 : 0));
    }
    if (!full) return;
    if(kept.includes(outer))buildApi.addBoxCollider(x + ox * outer, z + oz * outer, 1.0, 1.0, yaw, top + 3, top + (walk ? 1 : 0));
    // the outer face, for whoever stands below it, and the inner face for
    // whoever stands behind it: a free-standing wall has two
    if(kept.includes(outer))buildApi.addBoxCollider(x + ox * outer, z + oz * outer, 1.0, 1.0, yaw, top, foot - 2);
    if(kept.includes(inner))buildApi.addBoxCollider(x + ox * inner, z + oz * inner, 1.0, 1.0, yaw, top, foot - 2);
  };
  // ON A BEND the 2m blocks fan: the outer column's steps are longer than
  // the line's, and past a few degrees a wedge of daylight opens between
  // neighbours (Philip: "gaps on the walls... in many other parts of the
  // walls too") -- and the walk's decks open the same wedge, which a
  // character on the outer edge could fall through. So between two sections
  // whose yaws differ, enough intermediate sections are laid to keep the
  // outer column's step under 0.4m, each a few millimetres higher than the
  // last so their top faces cannot flicker; no merlons or colliders on them.
  let last: { x: number; z: number; ox: number; oz: number } | null = null;
  const fillBend = (x: number, z: number, ox: number, oz: number, i: number) => {
    if (last) {
      const d = Math.atan2(last.ox * oz - last.oz * ox, last.ox * ox + last.oz * oz);
      const step = Math.abs(d) * (outer + 1);
      if (step > 0.15) {
        const k = Math.ceil(step / 0.4);
        for (let j = 1; j < k; j++) {
          const t = j / k;
          let bx = last.ox + (ox - last.ox) * t, bz = last.oz + (oz - last.oz) * t;
          const m = Math.hypot(bx, bz) || 1; bx /= m; bz /= m;
          section(last.x + (x - last.x) * t, last.z + (z - last.z) * t, bx, bz, i, 0.003 * j, false);
        }
      }
    }
    last = { x, z, ox, oz };
  };
  const built: boolean[] = new Array(n).fill(false);
  let prevBlocked = true;
  let sinceStair = stairEvery/2;
  // which of a section's open faces looks FORWARD along the run: its local +z
  // is (-oz, ox), which is along the line one way or the other
  const fwdFace = (i: number, ox: number, oz: number): "pz" | "nz" => {
    const j = Math.min(n - 1, Math.max(1, i));
    const ax = s.pts[j][0] - s.pts[j - 1][0], az = s.pts[j][1] - s.pts[j - 1][1];
    return -oz * ax + ox * az > 0 ? "pz" : "nz";
  };
  const backFace = (i: number, ox: number, oz: number): "pz" | "nz" => (fwdFace(i, ox, oz) === "pz" ? "nz" : "pz");
  for (let i = 0; i < n; i++) {
    const [x, z] = s.pts[i], [ox, oz] = s.out[i];
    const [mx, mz] = at(i, mid);
    const blocked = blockedAt(mx, mz) || s.top(i) - s.foot(i) < 0.5;
    if (i > 0 && blocked !== prevBlocked) {
      // the run starts or stops between the last point and this one: close
      // it exactly where the boundary is
      const [px, pz] = s.pts[i - 1], [pox, poz] = s.out[i - 1];
      let lo = blocked ? 0 : 1, hi = blocked ? 1 : 0;   // lo is the open side
      for (let k = 0; k < 14; k++) {
        const t = (lo + hi) / 2;
        const bx = px + (x - px) * t, bz = pz + (z - pz) * t;
        const bxo = pox + (ox - pox) * t, bzo = poz + (oz - poz) * t;
        if (blockedAt(bx + bxo * mid, bz + bzo * mid)) hi = t; else lo = t;
      }
      const bx = px + (x - px) * lo, bz = pz + (z - pz) * lo;
      let bxo = pox + (ox - pox) * lo, bzo = poz + (oz - poz) * lo;
      const m = Math.hypot(bxo, bzo) || 1; bxo /= m; bzo /= m;
      if (blocked) fillBend(bx, bz, bxo, bzo, i - 1); else last = null;
      // the run's last section shows its forward face, its first its back
      section(bx, bz, bxo, bzo, blocked ? i - 1 : i, 0.004, true, blocked ? fwdFace(i, bxo, bzo) : backFace(i, bxo, bzo));
      if (!blocked) last = { x: bx, z: bz, ox: bxo, oz: bzo };
    }
    prevBlocked = blocked;
    if (blocked) { sinceStair = stairEvery/2; last = null; continue; }
    fillBend(x, z, ox, oz, i);
    const cap = i === 0 ? backFace(i, ox, oz) : i === n - 1 ? fwdFace(i, ox, oz) : undefined;
    section(x, z, ox, oz, i, 0, true, cap);
    built[i] = true;
    sinceStair += seg(i);
    if (!walk || sinceStair < stairEvery || i === 0) continue;
    // the flight: back along the wall from here, against the inner face,
    // and only if the wall it leans on is built the whole way
    const top = s.top(i), foot = s.foot(i);
    const courses = Math.max(1, Math.min(8, Math.round(top + 1 - foot)));
    const len = 1.08 + (courses - 1) * 2.08 + 1.0 + 2.0;
    let ok = true, back = 0;
    for (let j = i; j > 0 && back < len + 1.5; j--) { if (!built[j]) { ok = false; break; } back += seg(j); }
    if (!ok || back < len + 1.5) continue;
    sinceStair = 0;
    const ax = x - s.pts[i - 1][0], az = z - s.pts[i - 1][1];
    const al = Math.hypot(ax, az) || 1;
    // THE LANDING: a block against the inner face at the walk's height, so a
    // character steps off the flight, turns, and walks onto the walk
    // (Philip: "a flat clearance here at the top of the stairs"); then the
    // flight, from the landing's far edge. (x, z) is the top tread's edge at
    // the landing; yaw points DOWN the flight, back the way the wall came.
    const lx = x + ox * (inner - 2.02), lz = z + oz * (inner - 2.02);
    const yawW = Math.atan2(-oz, ox);
    // both of the landing's open faces are skinned: the one toward the
    // flight meets the flight's top block a hand's breadth off, and the
    // other stands in the open -- a column of hollow shelves, seen from
    // along the wall (Philip: "I can see into the staircase")
    makeMasonry(lx, lz, top + 1, yawW, { ground: (bx, bz) => Math.min(foot, buildApi.surface(bx, bz)), exposed: ["pz", "nz"] });
    buildApi.addDeck(lx, lz, 1.05, 1.05, yawW, top + 1);
    buildApi.addBoxCollider(lx, lz, 1.0, 1.0, yawW, top, foot - 2);
    makeFlight(lx - (ax / al) * 1.0, lz - (az / al) * 1.0, Math.atan2(-ax / al, -az / al), top + 1, 1);
  }

  // pass 3: the drums, their doors onto the ground behind
  for (const d of drums) {
    makeTower({ cx: d.x, cz: d.z, r: towerR, storeys: 3, parapet: true, door: d.door, seed: d.seed });
  }
  // the map: each built stretch as a wall down its middle column, with its
  // walk -- the Border Wall's road in the sky drew as its drums alone. Map
  // only: the wall's own colliders and the zone's keep-offs hold its ground.
  let run: [number, number][] = [];
  const flushRun = () => { if (run.length > 1) addMapOnlyWall(run, (outer - inner) / 2 + 1, walk ? (outer - inner) / 2 + 1 : undefined); run = []; };
  for (let i = 0; i < n; i++) { if (built[i]) run.push(at(i, mid)); else flushRun(); }
  flushRun();
}

// A BORDER WALL: the wall a zone ends in where its road leaves. Not a
// rampart -- nobody walks it -- but an occluder as tall as the rim mountains
// it stands between, so the pass reads as a gate and not as a gap with the
// terrain's edge showing through (Philip, Heartwood's west exit: "a massive
// wall here, as high as the rim mountains... keep the gate closed").
//
// Cyclopean: the kit's platform block at twice its size (4m courses, 4m
// thick), stacked from the ground to one level top, along a straight line
// from `a` to `b`. Where `road` crosses the line the wall opens for a gate:
// an 8m slot, the kit's round-door wall module at four times its size in it
// -- one facing out, one facing in, back to back, so the slot is closed from
// both sides and nothing of the blocks' open faces shows -- with its door
// SHUT, and a plain drum either side of it. Scaled kit pieces, not
// primitives ([[no-procedural-props]]): the gate is the same door a house
// has, at a size a house has not.
//
// One box collider the length of the wall; the shut gate is part of it. The
// portal, when the zone beyond exists, stands at the gate, and a portal is
// a proximity, not a doorway.
interface BorderWallSpec {
  a: [number, number]; b: [number, number];
  height: number;                 // over the ground at the gate
  road?: Road;                    // the road that leaves through it
  seed: number;
  open?: boolean;                 // the gate stands open: no leaves, and the passage is walkable
  // The rim's tint: three of its rocks stand BEHIND the gate, on the strip
  // between the wall and the terrain's end. The chain itself keeps its faces
  // 44m off a gate, so from above that strip was open ground to the void
  // (Philip, Hunting Wood: "put a mountain here to close the gap").
  backdrop?: string;
  // An OPEN gate whose far side is not a place: a collider 6m beyond the
  // passage, so the gate can be walked into (the portal stands in it) but
  // not through -- a city gate on a field zone opens onto the strip before
  // the terrain's end, and the audit found that strip reachable
  barrier?: boolean;
  // The gated portal this SHUT gate carries (a Border Gate, gate_quest inn2):
  // its leaves and the collider across its slot are built to switch, and
  // world.ts opens them for a character whose journal opens the portal
  // (setBorderGateOpen) -- shut is the default for everyone else
  portal?: string;
}
// The Border Gates that switch, by portal id: each sets its leaves, slot and
// barrier for one state. Per character and live -- world.ts calls it after the
// build and on every journal message (restoreGatedPortals), so handing in the
// quest swings the gate without a zone reload.
const borderGates = new Map<string, (open: boolean) => void>();
export function setBorderGateOpen(id: string, open: boolean): void { borderGates.get(id)?.(open); }
function makeBorderWall(s: BorderWallSpec): void {
  const [ax, az] = s.a, [bx, bz] = s.b;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L, uz = (bz - az) / L;      // along the wall
  let nx = -uz, nz = ux;                             // across it, made to point OUT of the zone
  if (nx * ((ax + bx) / 2) + nz * ((az + bz) / 2) < 0) { nx = -nx; nz = -nz; }
  const yaw = Math.atan2(-nz, nx);                   // a block's solid +-x faces look in and out
  const S = 2;
  // the gate: the slot boundary nearest to where the road crosses the line
  let gate: number | null = null;
  if (s.road) {
    let best = Infinity;
    for (let d = 0; d <= L; d += 0.5) {
      const q = roadNear(s.road, ax + ux * d, az + uz * d);
      if (q.d < best) { best = q.d; gate = d; }
    }
    gate = best < 6 && gate !== null ? Math.round(gate / 4) * 4 : null;
  }
  const gx = ax + ux * (gate ?? L / 2), gz = az + uz * (gate ?? L / 2);
  const gy = buildApi.surface(gx, gz);
  const topY = gy + s.height;
  const GATE_H = 12;                                 // six courses clear over the door module (12.5m at x4)
  for (let d = 2; d < L; d += 4) {
    const x = ax + ux * d, z = az + uz * d;
    const inGate = gate !== null && Math.abs(d - gate) < 4;
    const g = buildApi.surface(x, z);
    for (let yy = topY - 2; yy + 2 > g - 0.1; yy -= 2) {
      if (inGate && yy < gy + GATE_H - 0.01) continue;
      place("Stairs_Exterior_Platform", x, yy, z, yaw, 0, 0, S);
    }
  }
  // the map: the wall either side of its gate (the drums record themselves),
  // map only -- its collider and the rim keep its ground already
  for (const [d0, d1] of gate !== null ? [[0, gate - 4], [gate + 4, L]] : [[0, L]]) {
    if (d1 - d0 > 1) addMapOnlyWall([[ax + ux * d0, az + uz * d0], [ax + ux * d1, az + uz * d1]], 2);
  }
  // a switching gate is built as the open one's colliders plus the two it
  // trades: the slot's, which stands while it is shut, and a pane across the
  // passage's OUTER mouth, which stands while it is open -- the far side is
  // the strip before the terrain's end, not a place, so an open gate is an
  // alcove you can walk into, the veil in its arch, and no further. The pane
  // butts onto both wall segments, so nothing slips round its ends; the slot
  // shut, it stands unreachable behind the leaves.
  const switching = !!s.portal && !s.open && gate !== null;
  if ((s.open || switching) && gate !== null) {
    // two colliders with the passage between them, so an open gate is a gate
    const segs: [number, number][] = [[0, gate - 4], [gate + 4, L]];
    for (const [d0, d1] of segs) {
      if (d1 - d0 < 1) continue;
      const m = (d0 + d1) / 2;
      buildApi.addBoxCollider(ax + ux * m, az + uz * m, 2.2, (d1 - d0) / 2, yaw, topY);
    }
  } else {
    buildApi.addBoxCollider((ax + bx) / 2, (az + bz) / 2, 2.2, L / 2, yaw, topY);
  }
  if (switching) {
    const gx0 = ax + ux * gate!, gz0 = az + uz * gate!;
    const box = (cx: number, cz: number, hx: number, hz: number) => {
      const c = { cx, cz, hx, hz, sin: Math.sin(yaw), cos: Math.cos(yaw), y1: topY, y0: -1e9 };
      boxColliders.push(c);
      return c;
    };
    const slot = box(gx0, gz0, 2.2, 4.2);
    const pane = box(gx0 + nx * 2.5, gz0 + nz * 2.5, 0.3, 4.6);
    // the door module's jambs, which stand either way: its opening is the
    // leaf's 4.4 m (1.1 m at x4), not the 8 m slot, and open, the passage
    // walked wider than the arch drawn
    for (const side of [-1, 1]) box(gx0 + ux * side * 3.1, gz0 + uz * side * 3.1, 2.2, 0.9);
    const leaves = `gate_${s.portal}`;
    borderGates.set(s.portal!, (open) => {
      // y1 -Infinity takes a box out of movement and the camera both (openQuestDoor)
      slot.y1 = open ? -Infinity : topY;
      pane.y1 = open ? topY : -Infinity;
      setGroupShown(leaves, !open);
    });
    borderGates.get(s.portal!)!(false);
  }
  if (gate !== null) {
    const rnd = seededRand(s.seed);
    const door = 1 + Math.floor(rnd() * 8) % 8;
    // the door module's faces are z -0.314..0.092 (x4: -1.26..0.37); its
    // outer face goes flush with the wall's
    for (const side of [1, -1]) {
      const fy = side > 0 ? Math.atan2(nx, nz) : Math.atan2(-nx, -nz);   // local +z faces out / in
      const px = gx + nx * side * (2 - 0.37), pz = gz + nz * side * (2 - 0.37);
      place("Wall_UnevenBrick_Door_Round", px, gy, pz, fy, 0, 0, 4);
      place("DoorFrame_Round_Brick", px, gy, pz, fy, 0, 0, 4);
      // the leaf, shut: hinged at its local x 0, so it hangs from -0.55 (x4) to sit in the opening
      const lx = Math.cos(fy), lz = -Math.sin(fy);
      if (switching) setPlaceGroup(`gate_${s.portal}`);
      if (!s.open) place(`Door_${door}_Round`, px - lx * 2.2, gy, pz - lz * 2.2, fy, 0, 0, 4);
      if (switching) setPlaceGroup(null);
    }
    // the drums either side, as tall as the wall
    const storeys = Math.max(3, Math.round(s.height / STOREY));
    for (const side of [-1, 1]) {
      const d = gate + side * (4 + 4.5 + 1.2);
      makeTower({ cx: ax + ux * d, cz: az + uz * d, r: 4.5, storeys, plain: true, parapet: true, seed: s.seed + side });
    }
  }
  if (s.barrier && gate !== null) {
    const gx0 = ax + ux * gate, gz0 = az + uz * gate;
    buildApi.addBoxCollider(gx0 + nx * 6, gz0 + nz * 6, 0.5, 8, yaw, s.height);   // local x is across the wall (yaw above), so the 8m runs ALONG it
  }
  if (s.backdrop) {
    // A SHORT CHAIN behind the gate, not three rocks: seven rim rocks at the
    // rim's own size (scale 11-15, 50-70m crowns), 32m apart so they overlap,
    // 40m out behind the wall, no species twice running, a fifth of each
    // crown buried the way the chain seats its own. Three at scale 10 were
    // "a really small mountain" that left the terrain's edge in view from
    // above (Philip); this is the rim continuing behind the gate.
    const rnd = seededRand(s.seed + 7);
    const files = ["nature/Rock_Big_1.gltf", "nature/Rock_Big_2.gltf", "nature/Rock_Medium_4.gltf", "nature/Rock_Medium_1.gltf"];
    let last = "";
    for (let i = -3; i <= 3; i++) {
      const pool = files.filter((f) => f !== last);
      const file = pool[Math.floor(rnd() * pool.length)];
      last = file;
      const d = (gate ?? L / 2) + i * 32 + (rnd() - 0.5) * 8;
      const out = 40 + (rnd() - 0.5) * 10;
      const m = RIM_ROCK[file] ?? RIM_ROCK_FALLBACK;
      const scale = 11 + rnd() * 4;
      placeExact(mountainRock(file), [{ x: ax + ux * d + nx * out, z: az + uz * d + nz * out, scale, rot: yaw + (rnd() - 0.5) * 0.8 + (rnd() < 0.5 ? Math.PI : 0),
                          yOff: -m.height * scale * 0.2 }], 0, { tint: s.backdrop });
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEARTWOOD V2 -- the city inside the ring (zone key heartwood).
//
// The city itself -- the grove ring, the lanes, the homes, the halls and the
// song-steps -- is heartwood-city-build.ts (CITY-BUILD.md "Heartwood"). This
// file keeps the plate, the forest floor and the bay, the road from the west
// exit through the ring to the shore, the quay, the camps and orchards west
// of the ring, and the West Gate, the cleft through the rim.
//
// What it is: the people the empire never conquered, in a city its survey
// chains stopped at ("the empire's chains stopped where the grove began").
// The town lives inside a ring of living trees, with paths curving round
// trunks. The way out west is a cleft in the rim, the West Gate, with the
// Fields portal in it. Timber homes, tiles gone to moss.
//
// Card polygon at k = 2.15, centred on its own middle (svg 193, 151). Coast
// on the east -- Heartwood Bay -- wild everywhere else.
const HW2_SHAPE = shapeDetail({
  pts: [[-294.6, 118.3], [15.1, 243.0], [230.0, 182.8], [311.8, -19.4],
        [221.5, -217.2], [-178.5, -243.0], [-311.8, -83.9]],
  coast: [false, false, true, true, false, false, false],
}, 9);
ZONE_SHAPES.heartwood = HW2_SHAPE;
// a bay, calm and shallow, but with 38m of sea inside the east edge the
// shelf is steepened a little so the depth rule closes it before the boundary
const HW2_SEA = makeOcean(0, 0, 320, { shore: HW2_SHAPE, reach: 1200, seed: 27, maxAlpha: 0.95, shelf: 30 });
const HW2_STRAND = makeBeach(HW2_SEA, { half: 520, cells: 260 });
// the ring: centre, radius to the middle of the two rows, and the rows' spread
// 170, up from 150: at 150 the inside held under half of Moonmere's dry
// land; a third more room, and the ring still reads as one ring
const HW2_RING = { x: 0, z: 0, r: 170, band: 16 };
const HW2_STEPS: [number, number] = [118, -62];   // the song-steps' stage, inside the east of the ring
// THE WEST GATE, to the Heartwood Fields: a cleft through the rim, the way
// every field exit leaves (RIM.md "Passes"). It was a 30 m masonry wall with
// a brick gate and two towers, the one cut stone in a grown city; a city that
// keeps nothing ruled leaves by a crevice in the mountains (Philip,
// 2026-10-21). The Fields' end of it is the same cleft. The veil stands where
// the wall's gate stood, 10 m out past the plate's wandered edge, and the
// gorge is 30 m, not 45: a longer one reached the crystal and the arrival.
// Its axis is the road's own line (HW2_WEST_ROAD), not the edge's normal,
// 6 degrees apart: the road keeps its first point, and the lamp planner
// spaces the road's crooks from that point, so a road started up the cleft
// instead moved every lamp along it through the city.
const HW2_PORTAL = ZONES.heartwood.portals.find((p: any) => p.id === "hw_fields");
const HW2_EXIT: [number, number] = [HW2_PORTAL.x, HW2_PORTAL.z];
const HW2_WEST_ROAD: [[number, number], [number, number]] = [[-340, 2], [-250, 6]];
const HW2_PASS = makeRimPass("heartwood", HW2_SHAPE, { portal: "hw_fields", depth: 30,
  dir: [HW2_WEST_ROAD[1][0] - HW2_WEST_ROAD[0][0], HW2_WEST_ROAD[1][1] - HW2_WEST_ROAD[0][1]] });
// The city is built here and not in a zones/ module, so it registers only
// its pass: buildRimMountains cuts the gorge from it and buildPortals finds
// the veil by it (rimVeil). The floor and the clearing are heartwood2Height's.
registerZone({ key: "heartwood", passes: [HW2_PASS] });

// THE FLOOR: soft, rolling, a low dome under the ring so the city sits on a
// rise and the ground falls away to the bay -- a grove, not a lawn. No
// terraces, no cut, nothing ruled.
function hw2Raw(x: number, z: number): number {
  const d = Math.hypot(x - HW2_RING.x, z - HW2_RING.z);
  // FOUR METRES UP before anything else: the noise alone sat the whole outer
  // plate on the -0.2 floor (MEASURED: -0.20 from the west exit to the ring),
  // a marsh at the waterline rather than a wood above a bay. The beach's own
  // ramp takes the shore down to the water from here.
  let h = 4 + (fbm(x / 70 + 5, z / 70 + 5) - 0.5) * 2.6 + (fbm(x / 210 + 2, z / 210 + 2) - 0.5) * 4;
  h += 9 * smooth(Math.max(0, Math.min(1, (260 - d) / 260)));
  return h;
}
// the song-steps' floor: one level cut into the slope for the tiers to stand
// on, a little below the natural ground so the top tier meets the hill
const HW2_STAGE_Y = hw2Raw(HW2_STEPS[0], HW2_STEPS[1]) - 0.6;
function hw2Natural(x: number, z: number): number {
  let h = hw2Raw(x, z);
  const ds = Math.hypot(x - HW2_STEPS[0], z - HW2_STEPS[1]);
  if (ds < 22) {
    const t = ds <= 17 ? 1 : smooth(1 - (ds - 17) / 5);
    h = h * (1 - t) + HW2_STAGE_Y * t;
  }
  return h;
}
// the shore road ends 18m from the WATER, measured, at the bay's z
const HW2_SHORE_Z = 40;
const HW2_ROAD_X1 = (() => {
  for (let x = 180; x < 340; x += 1) if (HW2_SEA.seaward(x, HW2_SHORE_Z) > -18) return x;
  return 250;
})();
// the shore lane's points, measured off the water: the coast wobbles +-20m
const HW2_SHORE_PTS: [number, number][] = [100, 70, 40, 10, -20].map((z) => {
  for (let x = 180; x < 340; x += 1) if (HW2_SEA.seaward(x, z) > -22) return [x, z] as [number, number];
  return [250, z] as [number, number];
});
// THE LANES. The road in and out, and inside the ring a web of curving lanes
// that fork and rejoin so no walk through the grove is the same lane twice:
// every one begins on a point of an earlier one and most end on one. Then
// the waterfront's lane along the shore outside the east gap.
const HW2_ROADS: Road[] = [
  // west exit, through the ring's west gap, across the middle, out through the
  // east gap and down to the shore. It never runs straight for long.
  // (it starts behind the West Gate's veil, under the cleft's cap rocks, and
  // runs out down the cleft's axis)
  { pts: [...HW2_WEST_ROAD, [-206, -4], [-166, 0], [-126, 8], [-84, -6], [-40, 4], [0, 0],
          [40, 4], [65, 4], [90, 4], [100, 0], [124, 6], [164, 0], [200, 14], [232, 32], [HW2_ROAD_X1, HW2_SHORE_Z]], half: 4.2 },
  // north-east, curving round the inside of the ring toward the steps' side
  { pts: [[0, 0], [6, 30], [24, 58], [40, 94], [65, 94], [90, 94], [120, 84]], half: 3.4 },
  // south-west, out to the grudge hall's side
  { pts: [[0, 0], [-8, -30], [-26, -58], [-54, -80], [-88, -92]], half: 3.4 },
  // north, off the road west of the middle
  { pts: [[-40, 4], [-46, 36], [-38, 66], [-20, 92], [10, 108]], half: 3.2 },
  // south, off the road east of the middle, toward the song-steps
  { pts: [[90, 4], [90, -34], [84, -66]], half: 3.2 },
  // the loops that close it: north-east, south, north-west
  { pts: [[10, 108], [40, 94], [65, 94], [90, 94], [120, 84]], half: 3.0 },
  { pts: [[-88, -92], [-60, -118], [-20, -130], [20, -124], [40, -94], [65, -94], [90, -94], [84, -66]], half: 3.2 },
  { pts: [[-46, 36], [-84, 40], [-110, 20], [-118, -20], [-104, -60], [-88, -92]], half: 3.2 },
  // the waterfront: along the shore either way from the road's end
  { pts: [HW2_SHORE_PTS[2], HW2_SHORE_PTS[1], HW2_SHORE_PTS[0]], half: 3.0 },
  { pts: [HW2_SHORE_PTS[2], HW2_SHORE_PTS[3], HW2_SHORE_PTS[4]], half: 3.0 },
];
const HW2_CAMPS: [number, number][] = [[-236, -34], [-268, 38], [-206, 52]];   // the charcoal burners, on the road west
const HW2_ORCHARDS: { x: number; z: number; cols: number; rows: number; yaw: number }[] = [
  { x: -246, z: -74, cols: 5, rows: 4, yaw: 0.1 }, { x: -230, z: 86, cols: 4, rows: 4, yaw: -0.15 },
];

function heartwood2Height() {
  const roads = gradeRoads(HW2_ROADS, hw2Natural);
  const pre = (x: number, z: number) => {
    const o = offshore(HW2_SHAPE, x, z);
    if (o.sea) return Math.max(-9, -1.1 - o.d * 0.09);
    let h = hw2Natural(x, z);
    const c = roads.cut(x, z, h);
    h = c.h;
    h += (vnoise(x / 9 + 29, z / 9 + 29) - 0.5) * 0.2;
    h = Math.max(h, -0.2);
    h = HW2_SEA.carve(x, z, h);
    h = HW2_STRAND.carve(x, z, h);
    return h;
  };
  // the West Gate's floor over the finished ground, and nothing grows in it
  // (fieldHeight's two lines for a module's passes)
  const base = (x: number, z: number) => HW2_PASS.carve(x, z, pre(x, z), pre);
  scatterExclusions.push((x, z) => HW2_PASS.blocks(x, z));
  fineTerrainZones.add("heartwood");
  return prepareHeartwoodCity(HW2_ROADS, base);
}

function buildHeartwood2(): void {
  HW2_SEA.build("hw2_sea");
  HW2_STRAND.build("hw2_strand");
  buildHeartwoodCity();
  makeQuay({
    shape: HW2_SHAPE, sea: HW2_SEA, start: [HW2_ROAD_X1, HW2_SHORE_Z], width: 26, depth: 14, clutter: 20, seed: "hw2quay",
    moles: [[-6, 18, 2]],
    ships: [[4, 8, 0.9, "pirate/Ship_Small.gltf", 1.4, 0], [-16, 7, 0.9, "pirate/Ship_Small.gltf", 1.3, 0.2]],
  });
  hw2West();
  flushTown();
}

// WEST OF THE RING, on the road to the Fields: the charcoal burners' camps
// (log piles round a tripod fire, crates, a wagon) and two orchards in rows,
// the one ruled thing Heartwood permits itself. The card names both.
function hw2West(): void {
  const rnd = seededRand(zseed("hw2west"));
  for (const [cx, cz] of HW2_CAMPS) {
    const y = buildApi.surface(cx, cz);
    campfire(`hw2fire_${Math.round(cx)}`, cx, cz, rnd() * 6.3, 1.0);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = 3 + rnd() * 7;
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      place("nature/WoodLog.gltf", px, buildApi.surface(px, pz), pz, rnd() * 6.3, 0, 0, 0.9 + rnd() * 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, d = 5 + rnd() * 5;
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      place(i % 2 ? "props/Crate_Wooden.gltf" : "props/Barrel.gltf", px, buildApi.surface(px, pz), pz, rnd() * 6.3);
    }
    place("town/Prop_Wagon.gltf", cx + 9, buildApi.surface(cx + 9, cz - 4), cz - 4, rnd() * 6.3);
  }
  for (const o of HW2_ORCHARDS) {
    const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
    for (let i = 0; i < o.cols; i++) for (let j = 0; j < o.rows; j++) {
      const lx = (i - (o.cols - 1) / 2) * 8, lz = (j - (o.rows - 1) / 2) * 8;
      const px = o.x + lx * c + lz * sn, pz = o.z - lx * sn + lz * c;
      place("nature/CommonTree_5.gltf", px, buildApi.surface(px, pz) - 0.2, pz, rnd() * 6.3, 0, 0, 0.75 + rnd() * 0.15);
      buildApi.addCircleCollider(px, pz, 0.4);
    }
  }
}

function buildMoonmereShores(): void {
  const s = zseed("moonmereshores");
  const rnd = seededRand(s + 11);
  const timber = texMat("mstimber", "dark_wooden_planks");
  // the neutralising tint the old generic city gate used on this sheet: a multiply can
  // only pull a channel down, so grey stone is reached by suppressing red
  const stone = texMat("msstone", "medieval_blocks_02", { tint: "#a8c4e8" });
  const LEVEL = MS_MERE.level();

  MS_MERE.build("ms_mere");
  MS_STRAND.build("ms_strand");
  MS_POND1.build("ms_pond1");
  MS_POND2.build("ms_pond2");

  // Where the water actually starts, per x. The coastline wobbles +-15m on
  // noise, so every piece of built shore below asks rather than assumes -- the
  // same rule the strand's measured ring follows, in the one dimension the
  // piers and the causeway care about.
  const waterlineZ = (x: number): number => {
    for (let z = -120; z > -360; z -= 0.5) if (MS_MERE.seaward(x, z) >= 0) return z;
    return -360;
  };

  // ---- the causeway ----------------------------------------------------
  // THE SAME CAUSEWAY AS MOONMERE'S -- "they are the same causeway" (Philip):
  // one imperial road across the Mere, makeCauseway's walk at both ends and the
  // Cloisters' stone over it (zones/moonmere_shores.ts, MOONMERE.md A-14). It
  // stands PROUD of the water and reaches the sand by the Shores' steps, and
  // every walking surface carries its own flatZone (a deck
  // the walkability grid has not been told about is scenery -- WATER.md).
  // MEASURED, not assumed: the coastline wobbles +-20m on noise, so the deck
  // starts from wherever the water actually starts at x = 0 and runs past
  // the zone edge. Assuming a z put the landward ramp in the shallows.
  const cwRoot = Math.min(-150, waterlineZ(0) + 16);
  // The checkpoint at the causeway head is the gate (moonmere_shores.ts draws
  // it, its lamps lit at night where the kit gatehouse's torches burned): a charter is checked here (the Proctor stands at this gate), and the
  // gate's LANDWARD face is the one nothing lights -- the sun in this engine
  // always sits south of the zone (updateDayNight pins z = +0.3), so a
  // north-facing wall is lit by nothing but sky. Fire is the honest answer,
  // and torches are the proper fire (Philip, of the fire-baskets that stood
  // here: "this weird chandelier thing... use a proper torch please").
  makeCauseway({ x: 0, zLand: cwRoot, zSea: -380, deck: 0.8, barrierZ: -272, gateZ: cwRoot + 18, draw: false });
  placeExact("props/Crate_Wooden.gltf", [{ x: 13, z: -214, scale: 1, rot: 0.5 }], 0.5);
  placeExact("props/Barrel.gltf", [{ x: -13.4, z: -213, scale: 1, rot: 2.7 }], 0.4);

  // ---- the ferry piers -------------------------------------------------
  // Philip's note on the vignette's pier is the spec for both of these: it must
  // connect to dry land, and the ferry alongside is large. Same construction,
  // same numbers -- 7m deck, posts every 8m, a broad head to tie up against.
  // The walking height IS the planking's top: a 0.4 m box centred at 0.6.
  // It was 0.85, so everyone on the pier -- players, the ferrymaster and his
  // granddaughter -- stood 5 cm above the boards (MEASURED 2026-10-01).
  const PIER_DECK = 0.6 + 0.4 / 2;
  const pier = (name: string, px: number, len: number, headW: number): number => {
    const zRoot = waterlineZ(px) + 4;        // start on the dry sand
    const zHead = zRoot - len;
    vigBoxAt(name, 7, 0.4, len, timber, px, 0.6, (zRoot + zHead) / 2);
    flatZones.push({ x0: px - 3.5, x1: px + 3.5, z0: zHead, z1: zRoot, y: PIER_DECK });
    recordFootprint(px, (zRoot + zHead) / 2, 7, len);
    for (let pz = zRoot - 6; pz > zHead; pz -= 8)
      [-3.6, 3.6].forEach((o) => vigBoxAt(`${name}post`, 0.5, 6, 0.5, timber, px + o, -0.2, pz));
    if (headW) {
      vigBoxAt(`${name}head`, headW, 0.4, 14, timber, px, 0.6, zHead - 5);
      flatZones.push({ x0: px - headW / 2, x1: px + headW / 2, z0: zHead - 12, z1: zHead, y: PIER_DECK });
      // the head on the map, where the ferrymaster and the landing stand; map
      // only (it is over the gulf)
      addMapOnlyFootprint(px, zHead - 5, headW, 14);
      for (const [hx, hz] of [[-headW / 2 + 1.4, -1], [headW / 2 - 1.4, -1], [-headW / 2 + 1.4, -11], [headW / 2 - 1.4, -11]])
        vigBoxAt(`${name}headpost`, 0.6, 7, 0.6, timber, px + hx, 0, zHead + hz);
    }
    const ramp = vigBoxAt(`${name}ramp`, 7, 0.3, 12, timber, px, 0.05, zRoot + 5);
    ramp.rotation.x = 0.1;
    // Three even 0.5 m steps down from the deck to the sand. They hang off
    // PIER_DECK, not a literal: when the deck dropped from 0.85 to 0.80 the
    // old literal left a 0.45 m first step under two 0.5 m ones.
    for (let i = 0; i < 3; i++)
      flatZones.push({ x0: px - 3.5, x1: px + 3.5, z0: zRoot + i * 3.7, z1: zRoot + (i + 1) * 3.7,
                       y: PIER_DECK - (i + 1) * 0.5 });
    return zHead;
  };
  const BERTH_X = -190;
  const berthShore = waterlineZ(BERTH_X);
  const ferryHead = pier("mspier", BERTH_X, 56, 18);
  pier("mspier2", BERTH_X + 30, 34, 0);      // the second berth, empty
  // The ferry itself, at its berth. Ship_Large, not Ship_Small: the crossing
  // is a paid public passage over a gulf (5.15m of Ship_Small is a dinghy),
  // and its origin sits AT the waterline, so the lift below is measured from
  // the bed the placer would otherwise seat it on.
  // Three times the size (Philip), and docked at the END of the pier rather
  // than alongside it: the hull's length runs along local X, so rotY 0 puts it
  // across the pier's axis with the head's seaward face against its side.
  // MEASURED: Ship_Large is 15.4m long and 5.3m in the beam, so 3.9x is a 60m
  // ferry with a 21m beam -- hence the 22m standoff from the deck's end.
  // MEASURED: at 3.9x the hull is 20.7m in the beam, so its side sits 10.3m
  // off centre; the pier head's seaward face is 12m past `ferryHead`. Centred
  // 23m out, the hull lies about a metre off the planking -- alongside, which
  // is what "closer to the pier" means for a ship (Philip). 30 left it moored
  // in open water with a gap you could row through.
  buildDockedFerry("moonmereshores");
  placeExact("props/Crate_Wooden.gltf", [
    { x: BERTH_X + 5, z: ferryHead - 3, scale: 1, rot: 0.7, yOff: PIER_DECK - heightFn(BERTH_X + 5, ferryHead - 3) },
    { x: BERTH_X + 6.4, z: ferryHead - 6, scale: 0.9, rot: 1.9, yOff: PIER_DECK - heightFn(BERTH_X + 6.4, ferryHead - 6) },
  ], 0);
  placeExact("props/Barrel.gltf", [
    { x: BERTH_X - 6, z: ferryHead - 4, scale: 1, rot: 2.2, yOff: PIER_DECK - heightFn(BERTH_X - 6, ferryHead - 4) },
  ], 0);
  // the fare house and the chain store, above the tideline: village-kit
  // houses, the same the cities are built from (Philip, of the makeBuilding
  // boxes that stood here: "what assets are they? Do we have better homes?")
  makeHouse({ cx: BERTH_X - 26, cz: berthShore + 34, yaw: Math.PI / 2, span: 6, len: 10, storeys: 2, door: "px", chimney: true, seed: 61 });
  makeHouse({ cx: BERTH_X + 26, cz: berthShore + 30, yaw: 0, span: 6, len: 6, storeys: 1, door: "nz", seed: 62 });
  flushTown();
  placeExact("props/Barrel.gltf", [
    { x: BERTH_X - 16, z: berthShore + 26, scale: 1, rot: 0.4 }, { x: BERTH_X - 14, z: berthShore + 29, scale: 1, rot: 2.1 },
  ], 0.4);
  placeExact("props/Crate_Wooden.gltf", [
    { x: BERTH_X + 18, z: berthShore + 24, scale: 1.1, rot: 1.2 }, { x: BERTH_X + 15.6, z: berthShore + 22, scale: 0.9, rot: 0.3 },
  ], 0.4);
  placeExact("props/Chain_Coil.gltf", [{ x: BERTH_X - 10, z: berthShore + 18, scale: 1.4, rot: 0.9 }], 0);

  // ---- the reed harvest -------------------------------------------------
  // The empire did everything in rows (Cutter Bram), so the beds are drilled
  // in them and every third row is standing water -- cut. That contrast is
  // what makes this read as worked ground rather than as more marsh.
  // ON THE LAND SIDE OF THE SHED, and dry. Drilled in rows out in the water
  // they read as a submerged crop field rather than as a reed harvest (Philip:
  // "are the farm crops? If so they should be on the other side of the house
  // and not submerged under water"). The waterline keeps the loose reeds the
  // shore ring places; these are the worked beds, and they are inland of the
  // building, above the tide.
  const harvest: { x: number; z: number; scale: number; rot: number }[] = [];
  const HARV_X = 150;
  const harvShore = waterlineZ(HARV_X);
  makeBuilding(HARV_X + 12, harvShore + 36, { w: 10, d: 7, h: 3.8, face: "W", seed: 63, tint: "#e0dcc8", cc0: true });
  // The beds, on ONE straight line off the shed rather than following the
  // waterline: a bed that wanders with the coast is not a bed, it is more
  // marsh, and rows are the whole read here.
  for (let bx = HARV_X - 46; bx <= HARV_X + 40; bx += 3.4) {
    if (Math.round((bx - (HARV_X - 46)) / 3.4) % 3 === 2) continue;   // a cut row
    for (let n = 0; n < 6; n++) {
      harvest.push({ x: bx + (rnd() - 0.5) * 1.2, z: harvShore + 48 + n * 2.6 + (rnd() - 0.5) * 1.0,
                     scale: 0.85 + rnd() * 0.5, rot: rnd() * 6.3 });
    }
  }
  placeExact("props/Wagon.gltf", [{ x: HARV_X - 2, z: harvShore + 30, scale: 1.1, rot: 1.9 }], 1.6);
  placeExact("props/Crate_Wooden.gltf", [
    { x: HARV_X + 4, z: harvShore + 24, scale: 1.1, rot: 0.6 }, { x: HARV_X + 6.6, z: harvShore + 22, scale: 0.9, rot: 2.4 },
    { x: HARV_X + 3.2, z: harvShore + 20, scale: 1, rot: 1.5 },
  ], 0.4);
  placeExact("props/Ladder.gltf", [{ x: HARV_X + 17, z: harvShore + 31, scale: 1.2, rot: 1.2 }], 0);
  // the bundles: cut reed stacked to dry. WoodLog, laid in the same rows the
  // beds are drilled in
  const bundles: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let bi = 0; bi < 14; bi++)
    bundles.push({ x: HARV_X - 14 + (bi % 7) * 3.2, z: harvShore + 38 - Math.floor(bi / 7) * 2.6, scale: 1.3, rot: 1.57 });
  placeExact("WoodLog.glb", bundles, 0);
  placeExact("nature/Grass_Wispy_Tall.gltf", harvest.filter((_, i) => i % 2 === 0));
  placeExact("nature/Grass_Common_Tall.gltf", harvest.filter((_, i) => i % 2 === 1));

  // ---- reeds at the Mere's waterline ------------------------------------
  // The one MEASURED shoreline the sand and the foam already share, read the
  // way the vignette reads it: reeds a couple of metres inland of wherever the
  // water actually stops, never out in open water.
  const ring = MS_STRAND.ring();
  const [mcx, mcz] = MS_MERE.centre();
  const reeds: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let k = 0; k < ring.length; k++) {
    const r0 = ring[k];
    if (r0 === null) continue;
    const a = (k / ring.length) * Math.PI * 2;
    for (let n = 0; n < 2; n++) {
      const rr = r0 + 1 + rnd() * 11;
      const x = mcx + Math.cos(a) * rr, z = mcz + Math.sin(a) * rr;
      if (Math.abs(x) > 346 || Math.abs(z) > 346) continue;
      if (Math.abs(x) < 15 && z < 0) continue;              // the causeway corridor
      if ((Math.abs(x + 190) < 22 || Math.abs(x + 160) < 12) && z < 0) continue;  // the two berths
      reeds.push({ x: x + (rnd() - 0.5) * 3, z: z + (rnd() - 0.5) * 3,
                   scale: 0.8 + rnd() * 0.5, rot: rnd() * 6.3 });
    }
  }
  placeExact("nature/Grass_Wispy_Tall.gltf", reeds.filter((_, i) => i % 2 === 0));
  placeExact("nature/Grass_Common_Tall.gltf", reeds.filter((_, i) => i % 2 === 1));

  // ---- the reed flats ----------------------------------------------------
  // The ponds' own waterlines, measured the same way rather than drawn: a pond
  // radius wobbles +-20% by construction, so an assumed circle would stand
  // half these reeds in the water and half up the field.
  ([[MS_POND1, -168, 46, 44], [MS_POND2, -96, 122, 26]] as [{ level: () => number }, number, number, number][])
    .forEach(([pond, px, pz, pr], pi) => {
      const pring = shoreRing(px, pz, pond.level(), 180, pr * 0.5, pr * 1.7, 344);
      const marsh: { x: number; z: number; scale: number; rot: number }[] = [];
      pring.forEach((r0, k) => {
        if (r0 === null) return;
        const a = (k / pring.length) * Math.PI * 2;
        const rr = r0 - 1 + rnd() * 5;
        marsh.push({ x: px + Math.cos(a) * rr, z: pz + Math.sin(a) * rr,
                     scale: 0.8 + rnd() * 0.6, rot: rnd() * 6.3 });
      });
      placeExact("nature/Grass_Wispy_Tall.gltf", marsh.filter((_, i) => i % 2 === 0));
      placeExact("nature/Grass_Common_Tall.gltf", marsh.filter((_, i) => i % 2 === 1));
      placeExact("nature/Bush_Long_1.gltf", marsh.filter((_, i) => i % 9 === pi), 0.6);
    });

  // ---- the wood ----------------------------------------------------------
  // The card's tree symbols, north-east, thickened on the spot rather than by
  // raising the zone-wide canopy count -- a shore ring with a wood in one
  // corner is the shape on the card, and an even scatter is not.
  const wood: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 340; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 124;
    const x = 175 + Math.cos(a) * rr, z = 85 + Math.sin(a) * rr;
    if (Math.abs(x) > 330 || Math.abs(z) > 330) continue;
    if (msRoadDist(x, z) < 9) continue;
    // the wood is placed by hand, so it has to ask what the scatters are asked
    // automatically -- otherwise it roots trees in the plateau's cliff face
    // (Philip: "remove this tree") and along the waterline
    if (vegBlocked(x, z)) continue;
    wood.push({ x, z, scale: 1.0 + rnd() * 0.8, rot: rnd() * 6.3 });
  }
  placeExact("nature/CommonTree_1.gltf", wood.filter((_, i) => i % 4 === 0), 1.0);
  placeExact("nature/CommonTree_3.gltf", wood.filter((_, i) => i % 4 === 1), 1.0);
  placeExact("nature/CommonTree_4.gltf", wood.filter((_, i) => i % 4 === 2), 1.0);
  placeExact("nature/Pine_4.gltf", wood.filter((_, i) => i % 4 === 3), 1.0);
  const understorey: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 130; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 124;
    const x = 175 + Math.cos(a) * rr, z = 85 + Math.sin(a) * rr;
    if (Math.abs(x) > 330 || Math.abs(z) > 330 || msRoadDist(x, z) < 9) continue;
    if (vegBlocked(x, z)) continue;
    understorey.push({ x, z, scale: 0.9 + rnd() * 0.7, rot: rnd() * 6.3 });
  }
  placeExact("nature/Fern_1.gltf", understorey.filter((_, i) => i % 3 === 0));
  // Bush_Long_1, not Bush_Common: MEASURED, Bush_Common is painted with the
  // TwistedTree sheet and is #a71717 -- a red bush, in a wood that is meant to
  // be the quiet green edge of the card
  placeExact("nature/Bush_Long_1.gltf", understorey.filter((_, i) => i % 3 === 1), 0.5);
  placeExact("nature/Bush_Large.gltf", understorey.filter((_, i) => i % 3 === 2), 0.6);

  // ---- the roads ---------------------------------------------------------
  // (laid by zones/moonmereshores.ts now, as makePath ribbons off MS_ROADS:
  // the three-tile RockPath scatter read as dotted lines from any height,
  // and PATH.md's rule is one ribbon, never a run of tiles)

  // ---- the north gate ----------------------------------------------------
  // Shut, and it stays shut until the main quest grants the charter -- inn2,
  // "Letters of Passage" (Philip, 2026-10-12) -- so it is built as a WALL with
  // a closed leaf in it rather than as a portal frame. The leaf, and the
  // collider it carries, switch per character: setBorderGateOpen("ms_gate")
  // takes them away for one who has handed inn2 in, and stands a pen behind
  // the opening instead (below).
  //
  // It stands ON the plate's northern land border, which is a line the card
  // drew and not an axis: the wall walks that border out from the apex, each
  // segment yawed to it, and the rim chain breaks around the same point
  // (buildZoneEdge's extraClear) so the wall IS the boundary there.
  const apex = MS_SHAPE.pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const GATE_X = apex[0], GATE_Z = apex[1] - 6;
  // the border's local direction at the apex, from the two points either side
  const iApex = MS_SHAPE.pts.indexOf(apex);
  const pPrev = MS_SHAPE.pts[(iApex - 1 + MS_SHAPE.pts.length) % MS_SHAPE.pts.length];
  const pNext = MS_SHAPE.pts[(iApex + 1) % MS_SHAPE.pts.length];
  const bLen = Math.hypot(pNext[0] - pPrev[0], pNext[1] - pPrev[1]);
  const bx = (pNext[0] - pPrev[0]) / bLen, bz = (pNext[1] - pPrev[1]) / bLen;
  const bRot = Math.atan2(-bz, bx);
  const onBorder = (t: number): [number, number] => [GATE_X + bx * t, GATE_Z + bz * t];
  // 44m either way, not 100: the chain now closes in to ~34m from the gate, so
  // the wall only has to reach behind its first rock (Philip: "wall is too
  // long"). Longer than the break and it runs out into open ground.
  for (let t = -44; t <= 44; t += 8) {
    if (Math.abs(t) < 8) continue;                       // the opening
    const [wx, wz] = onBorder(t);
    const wy = heightFn(wx, wz);
    const seg = tbox("msgatewall", 8.2, 9, 3, stone, 3);
    seg.position.set(wx, wy + 3.6, wz);
    seg.rotation.y = bRot;
    circleColliders.push({ x: wx, z: wz, r: 4.2 });
  }
  recordFootprint(GATE_X, GATE_Z, 88, 3);
  for (const t of [-8.6, 8.6]) {
    const [tx, tz] = onBorder(t);
    const ty = heightFn(tx, tz);
    const tower = tbox("msgatetower", 5.4, 15, 5.4, stone, 3);
    tower.position.set(tx, ty + 6.5, tz);
    tower.rotation.y = bRot;
    const cap = tbox("msgatecap", 6.4, 0.8, 6.4, stone, 2);
    cap.position.set(tx, ty + 14.3, tz);
    cap.rotation.y = bRot;
    circleColliders.push({ x: tx, z: tz, r: 3.4 });
  }
  const gy = heightFn(GATE_X, GATE_Z);
  const leaf = tbox("msgateleaf", 11.6, 8, 1, timber, 2.4);   // the closed leaf
  leaf.position.set(GATE_X, gy + 4, GATE_Z);
  leaf.rotation.y = bRot;
  const leafStop = { x: GATE_X, z: GATE_Z, r: 5.6 };
  circleColliders.push(leafStop);
  // OPEN, the gate is not a way out: past it is the strip before the
  // terrain's end, 6m in from the apex. Three boxes pen it -- a back 4.5m
  // out, short of the border, and a side from inside each tower out to it,
  // so nothing slips round along the wall's outer face.
  // Laid along the border (local x, as the wall's own segments) and out of
  // the plate; standing only while the gate is open.
  const outX = -bz, outZ = bx;                              // out of the plate
  const pen = ([[0, 4.5, 8.8, 0.4], [-8.4, 2.25, 0.4, 2.25], [8.4, 2.25, 0.4, 2.25]] as [number, number, number, number][])
    .map(([t, out, hx, hz]) => {
      const c = { cx: GATE_X + bx * t + outX * out, cz: GATE_Z + bz * t + outZ * out, hx, hz,
                  sin: Math.sin(bRot), cos: Math.cos(bRot), y1: -Infinity, y0: -1e9 };
      boxColliders.push(c);
      return c;
    });
  borderGates.set("ms_gate", (open) => {
    leaf.setEnabled(!open);
    leafStop.r = open ? -Infinity : 5.6;   // not 0: a circle still stops a body within its 0.45 m radius
    for (const c of pen) c.y1 = open ? gy + 14 : -Infinity;
  });
  const lintel = tbox("msgatelintel", 13, 2.4, 3.4, stone, 2.4);
  lintel.position.set(GATE_X, gy + 9.2, GATE_Z);
  lintel.rotation.y = bRot;
  // the watch's own fire and its billet, inside the wall
  // BEHIND the gate. The chain breaks for 34m either side of it, and through
  // that break you could see the ground north of the wall run out at the edge
  // of the world (Philip: "add rim mountains back here so players cannot see
  // the end of the zone"). This is not a second range -- it is the same chain,
  // stepped back around the one place it has to open, so the break shows
  // mountain behind it instead of a horizon.
  const backdrop: Record<string, { x: number; z: number; scale: number; rot: number; yOff: number }[]> = {};
  ([[-62, 58, "nature/Rock_Big_2.gltf", 11.6], [-18, 74, "nature/Rock_Big_1.gltf", 9.6],
    [26, 68, "nature/Rock_Medium_4.gltf", 17.5], [70, 56, "nature/Rock_Big_1.gltf", 10.4]] as [number, number, string, number][])
    .forEach(([t, out, file, sc], i) => {
      const [px, pz] = onBorder(t);
      // the inward normal points into the plate, so stepping OUT is negative
      const nx = bz, nz = -bx;
      const x = px - nx * out, z = pz - nz * out;
      const m = RIM_ROCK[file] ?? RIM_ROCK_FALLBACK;
      (backdrop[file] ||= []).push({
        x, z, scale: sc, rot: bRot + (i % 2 ? 0.4 : Math.PI - 0.3),
        yOff: -m.height * sc * 0.2,
      });
      circleColliders.push({ x, z, r: m.inward * sc });
    });
  for (const [file, spots] of Object.entries(backdrop)) placeExact(mountainRock(file), spots, 0, { tint: "#8c96a0" });

  // pulled in off the border: with the chain closing to 34m the old spot was
  // under the first rock east of the gate (Philip: "be careful to not clip the
  // house")
  makeBuilding(GATE_X + 24, GATE_Z - 42, { w: 9, d: 7, h: 3.6, face: "S", seed: 64, tint: "#dcdcd2", chimney: true, cc0: true });
  campfire("mms_gatefire", GATE_X + 10, GATE_Z - 45, 0.4, 1.2);
  placeExact("props/Crate_Wooden.gltf", [{ x: GATE_X + 14, z: GATE_Z - 48, scale: 1, rot: 0.9 }], 0.5);
  placeExact("props/Barrel.gltf", [{ x: GATE_X + 6, z: GATE_Z - 49, scale: 1, rot: 2.4 }], 0.4);
}
function buildGenericWilds(zoneKey: string, size: number): void {
  const t = WILDS_THEMES[zoneKey];
  if (!t) return;
  // COUNTS ARE PER 240m SLICE, and scaled by area from there. They were
  // authored against the vignettes when every vignette was 240m, so when the
  // slices grew to 350 the same numbers spread over 2.1x the ground and the
  // dressing halved in density -- which reads as "the props are gone" (Philip)
  // even though every one of them is still standing. Density is the thing a
  // theme is actually stating; the count was only ever a proxy for it.
  const dens = (size / 240) ** 2;
  const per = (n: number) => Math.round(n * dens);
  const avoid = avoidPoints(zoneKey);
  // vignettes have no NPCs or portals to derive an avoid list from, so their
  // clearings (buildings, roads, water, landmark courts) are declared by hand
  if (VIG_AVOID[zoneKey]) avoid.push(...VIG_AVOID[zoneKey]);
  const s = zseed(zoneKey);
  if (t.canopy) {
    const [files, n, lo, hi] = t.canopy;
    scatterModels(files, per(n), size, s + 2, avoid, lo, hi, 0.8);
  }
  // MEASURED: DeadTree_1 is 9.50m and DeadTree_4 12.77m, so these multipliers
  // are a 12-22m stand rather than the one number the old table used across
  // species of quite different height.
  if (t.dead) scatterModels(["nature/DeadTree_1.gltf", "nature/DeadTree_2.gltf", "nature/DeadTree_3.gltf", "nature/DeadTree_5.gltf"], per(t.dead), size, s + 3, avoid, 1.1, 2.0, 0.6,
    undefined, t.snow ? "up" : undefined);
  if (t.rocks) scatterModels(["nature/Rock_Medium_1.gltf", "nature/Rock_Medium_2.gltf", "nature/Rock_Medium_3.gltf", "nature/Rock_Big_1.gltf"], per(t.rocks), size, s + 4, avoid, 0.7, 1.8, 1.1, t.rockTint,
    t.snow && t.rockTint ? "up" : undefined);
  if (t.grass) scatterModels(["nature/Grass_Common_Short.gltf", "nature/Grass_Wispy_Short.gltf", "nature/Grass_Wheat.gltf"], per(t.grass), size, s + 5, avoid, 0.5, 1.1);
  if (t.flowers) scatterModels(t.flowerFiles ?? ["nature/Flower_2_Group.gltf", "nature/Flower_4_Group.gltf", "nature/Flower_7_Group.gltf", "nature/Bush_Large_Flowers.gltf"], per(t.flowers), size, s + 6, avoid, 0.9, 1.7);
  // every generic wild gets vignette clusters so no stretch reads empty --
  // but a winterland gets winter ones: no stumps shaped like chess rooks and
  // no pink oyster mushrooms picnicking in the snow (Philip's note)
  if (t.snow) {
    scatterClustersCC0(size, s + 9,
      ["nature/Rock_Big_2.gltf", "nature/Rock_Medium_4.gltf"],
      ["nature/Pebble_Round_2.gltf", "nature/Grass_Wispy_Short.gltf"],
      per(14), avoid, undefined, { snowCaps: "up" });
  } else if (t.dry) {
    // Rock_Big_1 / Rock_Medium_2, not Rock_Big_2 / Rock_Medium_4: those two
    // are painted with moss, and a tint only darkens the green
    scatterClustersCC0(size, s + 9,
      ["nature/Rock_Big_1.gltf", "nature/Rock_Medium_2.gltf"],
      ["nature/Pebble_Round_2.gltf", "nature/Grass_Wispy_Short.gltf", "nature/Grass_Wheat.gltf"],
      per(14), avoid, undefined, { tint: t.rockTint });
  } else {
    scatterClustersCC0(size, s + 9,
      // WoodLog, not graveyard/trunk-long: the Kenney stump is painted salmon
      // (#d6815b) and the cluster path has no tint plumbing, so it lands as a
      // "what is this orange thing" in every zone (Philip, twice)
      ["nature/Rock_Big_2.gltf", "nature/Rock_Medium_4.gltf", "WoodLog.glb"],
      ["nature/Pebble_Round_2.gltf", "nature/Plant_6.gltf", "nature/Grass_Wispy_Short.gltf", "nature/Mushroom_Oyster.gltf"],
      per(18), avoid);
  }

  // ---- biome signatures ----
  // The real zones' signatures are whole builds rather than a block, so they
  // live in their own functions; the theme table above still owns their biome.
  if (zoneKey === "moonmereshores") buildMoonmereShores();
  ZONE_MODULES[zoneKey]?.build?.(size);
  // fogDensity 0 is a real value here, not a missing one: the vignettes keep
  // their fog COLOURS and carry no haze.
  if (t.fogDensity !== undefined) setZoneFog(t.fogDensity, t.fogNight || "#262c42", t.fogDay);
  if (t.snow) makeSnowfall();
}

// Fire. An effect, not a prop, on the same rule as the snowfall: no kit ships a
// flame that would sit in a basket (the KayKit torch flames are baked into
// their torches), so the flame is a particle system under a procedurally drawn
// sprite, and there is no asset to ask a licence of. Per brazier: one small
// additive flame (~50 live sprites rising 0.9 m and dying through yellow ->
// the zone's ember colour), a sparser spark system, and a coal core in the
// bowl that the glow layer blooms so the basket's ribs read lit from inside at
// night. The flame sprites do NOT go through the glow layer: additive already
// saturates on their own, and bloom on top turned the fire into a lantern.
let flameTexCache: DynamicTexture | null = null;
function flameTexture(): DynamicTexture {
  if (flameTexCache && flameTexCache.getScene() === scene) return flameTexCache;
  const SZ = 64;
  const tex = new DynamicTexture("flame", { width: SZ, height: SZ }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, SZ, SZ);
  // a tighter core than the snowflake: fire is a bright heart with a soft
  // skirt, and the gradients below supply the colour, so the sprite is white
  const g = ctx.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.7)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SZ, SZ);
  tex.hasAlpha = true;
  tex.update();
  flameTexCache = tex;
  return tex;
}

// `glow` is the flame's body colour and `ember` what it dies through -- the
// same pair every caller already hands brazier(). `size` scales the whole fire
// (1 = a basket 0.9 m across; a wall torch is 0.4). The particle budget scales
// with it, and sparks only come off a fire big enough to throw them -- a
// dungeon with a sconce every other wall segment runs fifty of these, and each
// system is a draw call, so a torch is one system of ~30 sprites, not two.
function makeFlame(name: string, x: number, y: number, z: number, glow: string, ember: string, size = 1): ParticleSystem {
  const g = Color3.FromHexString(glow);
  const e = Color3.FromHexString(ember);
  const budget = Math.max(0.35, Math.min(1.6, size));
  const ps = fxParticles(new ParticleSystem(name, Math.round(90 * budget), scene));
  ps.particleTexture = flameTexture();
  ps.emitter = new Vector3(x, y, z);
  ps.minEmitBox = new Vector3(-0.16 * size, 0, -0.16 * size);
  ps.maxEmitBox = new Vector3(0.16 * size, 0.1 * size, 0.16 * size);
  ps.emitRate = 62 * budget;
  ps.minLifeTime = 0.45;
  ps.maxLifeTime = 0.8;
  ps.updateSpeed = 0.016;                       // particle units ~= seconds
  // born wide at the coals, thinning to a tongue as it rises and dies
  ps.addSizeGradient(0, 0.6 * size);
  ps.addSizeGradient(0.4, 0.5 * size);
  ps.addSizeGradient(1, 0.06 * size);
  // additive saturates fast, so the white heart is brief and the body is the
  // caller's colour from a quarter-life on -- a longer yellow read as a torch
  ps.addColorGradient(0, new Color4(1, 0.85, 0.45, 0.8));
  ps.addColorGradient(0.25, new Color4(g.r, g.g, g.b, 0.85));
  ps.addColorGradient(0.65, new Color4(e.r, e.g, e.b, 0.5));
  ps.addColorGradient(1, new Color4(e.r * 0.3, e.g * 0.15, 0, 0));
  ps.direction1 = new Vector3(-0.22, 1, -0.22);
  ps.direction2 = new Vector3(0.22, 1, 0.22);
  ps.minEmitPower = 0.6 * size;
  ps.maxEmitPower = 1.1 * size;
  ps.gravity = new Vector3(0, 0.9, 0);          // hot air: the tongues accelerate upward
  ps.minAngularSpeed = -0.8;
  ps.maxAngularSpeed = 0.8;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.preWarmCycles = 60;                        // the zone opens with the fire already burning
  ps.preWarmStepOffset = 2;
  ps.start();
  if (size < 0.6) return ps;

  const sp = fxParticles(new ParticleSystem(`${name}_sparks`, 14, scene));
  sp.particleTexture = flameTexture();
  sp.emitter = new Vector3(x, y + 0.2 * size, z);
  sp.minEmitBox = new Vector3(-0.1 * size, 0, -0.1 * size);
  sp.maxEmitBox = new Vector3(0.1 * size, 0, 0.1 * size);
  sp.emitRate = 5;
  sp.minLifeTime = 0.9;
  sp.maxLifeTime = 1.8;
  sp.updateSpeed = 0.016;
  sp.minSize = 0.05 * size;
  sp.maxSize = 0.09 * size;
  sp.color1 = new Color4(1, 0.85, 0.5, 1);
  sp.color2 = new Color4(g.r, g.g, g.b, 1);
  sp.colorDead = new Color4(e.r, e.g * 0.5, 0, 0);
  sp.direction1 = new Vector3(-0.6, 1, -0.6);
  sp.direction2 = new Vector3(0.6, 1.4, 0.6);
  sp.minEmitPower = 1.2 * size;
  sp.maxEmitPower = 2.2 * size;
  sp.gravity = new Vector3(0, -0.6, 0);         // sparks arc over and fall back
  sp.blendMode = ParticleSystem.BLENDMODE_ADD;
  sp.preWarmCycles = 60;
  sp.preWarmStepOffset = 2;
  sp.start();
  return ps;
}

// A flicker in [0.78, 1]: three incommensurate sines, so it never settles into
// a beat. Runs AFTER updateDayNight's night-light pass (that observer was
// registered at scene setup, this one at build time), so multiplying the
// intensity it just set is safe.
function flickerAt(t: number): number {
  return 0.89 + 0.11 * (0.5 * Math.sin(t * 0.011) + 0.3 * Math.sin(t * 0.0237 + 1.7) + 0.2 * Math.sin(t * 0.0409 + 0.4));
}

// A campfire: the props kit's CampfireTripod (MEASURED: the three legs span
// x -0.6..1.14, z +-1.0, so their centroid -- where the fire is -- is the
// origin) with the flame at ground level under the pot, and a coal core so it
// reads at a distance. Every tripod in the world goes through here so none is
// left cold; the tripod is 1.5 m tall, so the pot sits above the flame's reach.
function campfire(name: string, x: number, z: number, rot: number, scale = 1.1, glow = "#e08a3a", ember = "#8a4a1c",
                  opts: { snowCaps?: "abs" | "up" } = {}): void {
  const y = heightFn(x, z);
  placeExact("props/CampfireTripod.gltf", [{ x, z, scale, rot }], 0.8, opts);
  const coals = MeshBuilder.CreateSphere(name, { diameter: 0.5 * scale, segments: 6 }, scene);
  coals.position.set(x, y + 0.08, z);
  coals.scaling.y = 0.35;
  coals.material = mat(`${name}_m`, ember, { emissive: glow, glow: 0.7 });
  coals.isPickable = false;
  makeFlame(`${name}_fire`, x, y + 0.12, z, glow, ember, 0.9 * scale);
}

// A brazier: the props kit's iron fire pit with a particle flame (makeFlame)
// and a coal core in the bowl for the glow layer.
// `light` is OFF by default and should stay that way for a row of them. Each
// PointLight is a real cost and Babylon caps how many affect one material
// (maxSimultaneousLights, 8 here) -- fourteen brazier lights down a nave took
// the generic dungeons to 23 lights, most of which could not reach the
// stonework anyway. The flames are glow-layer emitters, so they read as lit
// whether or not they cast; use the nave's own lights to actually light it.
function brazier(name: string, x: number, z: number, y: number, glow: string, ember: string,
                 light = false, size = 1): void {
  // props/FirePit, not graveyard/fire-basket. MEASURED with atlas_color.py:
  // the Kenney basket sits on the colormap's GREEN swatches (#2e9872), whose
  // red channel maxes at 46 -- so an iron-grey brazier is not merely hard from
  // it, it is unreachable, and a grey tint just gives a dark green one.
  // FirePit is 1.09m of actual metal at scale 1, so it needs no scaling either.
  // `y` is an ABSOLUTE height (dungeon floors are heightFn 0, which is where
  // this was written), but placeExact seats models at heightFn + yOff -- so
  // outdoors the two stacked and the pit sank a metre into the beach, leaving
  // its flame hovering over nothing. Subtracting the ground makes the same
  // call work in both places.
  placeExact("props/FirePit.gltf", [{ x, z, scale: 1.15, rot: (x + z) * 0.3, yOff: y - heightFn(x, z) }], 0);
  // the coals: a flattened ball sitting in the bowl (FirePit's rim is at
  // 1.09 x 1.15 = 1.25 m), dark-ember lit so the ribs read from inside
  const fl = MeshBuilder.CreateSphere(name, { diameter: 0.55, segments: 6 }, scene);
  fl.position.set(x, y + 0.98, z);
  fl.scaling.y = 0.5;
  fl.material = mat(`${name}_m`, ember, { emissive: glow, glow: 0.7 });
  fl.isPickable = false;
  makeFlame(`${name}_fire`, x, y + 1.0, z, glow, ember, size);
  if (light) {
    const pl = new PointLight(`${name}_l`, new Vector3(x, y + 2.0, z), scene);
    pl.diffuse = Color3.FromHexString(glow);
    pl.intensity = 0.35;
    pl.range = 18;
    registerNightLight(pl, 0.35);
    scene.onBeforeRenderObservable.add(() => { pl.intensity *= flickerAt(performance.now() + x * 37 + z * 91); });
  }
}

// `veil`: a Dawn Veil portal's card as drawn, which walking into takes you
// through (world.ts, portal_touch.ts); a Rune Circle has none and is used
export const worldObjects: { id: string; kind: string; x: number; z: number; y?: number; mesh?: Mesh; name: string; veil?: VeilCard }[] = [];

// Anything a player can touch is clickable, so a pick can target it. The
// pointer handler reads metadata.entityId; "obj_" marks a world object, the
// way "npc_" marks an NPC.
export function tagWorldObject(mesh: AbstractMesh | Mesh | undefined, id: string): void {
  if (!mesh) return;
  mesh.metadata = { ...(mesh.metadata || {}), entityId: `obj_${id}` };
  mesh.isPickable = true;
}

// A teleport crystal -- FFXIV's aetheryte in this world's dress, one per city
// and per field zone (Philip's ruling; dungeons get none). Attune by touching,
// teleport crystal to crystal, set one as home point. The data record is still
// a `milestones` entry -- the server's attune/travel/home-point machinery was
// written for the old road markers and is exactly the crystal system.
//
// Rebuilt 2026-09-24 against the aetheryte reference: the old one was five
// flat-topped big_crystal prisms on a 6.6 m slab and read as an ore node
// painted toy blue. An aetheryte is ONE tall double-pointed spire that floats,
// turns and gives off light, so the body is the crystal pack's gem_pink -- the
// only kit piece pointed at both ends -- stretched into a spire with four
// shorter gems grown off its lower half, the jagged cluster the reference has.
// Philip ruled out the gilded ring ("just make a nice crystal"): what sells it
// is the float, the slow turn, the see-through body with lit edges, a heart
// that pulses behind the facets, and aether motes rising off it.
//
// The body is kit geometry under its own material, not placeExact instances:
// it has to move, and a thin instance cannot be animated on its own. The heart,
// the halo and the motes are light rather than props (the brazier-flame rule).
// The heart is the mesh setMilestoneLit reads -- dim until this character
// attunes, and the whole crystal dims with it.
// how far the shrine's clearing reaches: the terrace corner (3.3 m half-width
// on the diagonal) plus a margin, so nothing grows up through or against it
const CRYSTAL_CLEAR = 5.2;
// where a teleport or respawn lands: World.teleport_to_crystal puts the player
// at (x + 5, z + 3), beside the terrace. The clearing covers it too, or a
// scattered rock can stand on the arrival spot (audited: Hunting Wood).
const CRYSTAL_ARRIVAL = [5, 3], ARRIVAL_CLEAR = 1.8;
let crystalSpots: { x: number; z: number }[] = [];
export function nearCrystal(x: number, z: number): boolean {
  return crystalSpots.some((c) => Math.hypot(x - c.x, z - c.z) < CRYSTAL_CLEAR
    || Math.hypot(x - c.x - CRYSTAL_ARRIVAL[0], z - c.z - CRYSTAL_ARRIVAL[1]) < ARRIVAL_CLEAR);
}
// the flight's own facing: which way a kit stair climbs, found by looking
const STAIR_ROT = 0;
const CRYSTAL_LIT = { body: "#4fbef5", edge: "#c9f3ff", core: "#8fe0ff", emissive: 0.5, motes: 18, halo: 0.42 };
const CRYSTAL_DARK = { body: "#56657a", edge: "#9fb0c4", core: "#5d6b80", emissive: 0.16, motes: 3, halo: 0.1 };
type CrystalLook = typeof CRYSTAL_LIT;
const crystals = new Map<string, { body: StandardMaterial; heart: StandardMaterial; halo: StandardMaterial;
                                   motes: ParticleSystem; look: CrystalLook }>();

function applyCrystalLook(id: string, look: CrystalLook): void {
  const c = crystals.get(id);
  if (!c) return;
  c.look = look;
  c.body.diffuseColor = Color3.FromHexString(look.body);
  // the fresnel colours multiply emissiveColor, which is also what the glow
  // layer blooms -- so this one term is how bright the whole body burns
  c.body.emissiveColor = Color3.FromHexString(look.body).scale(look.emissive * 1.5);
  c.body.emissiveFresnelParameters!.leftColor = Color3.FromHexString(look.edge);
  c.body.emissiveFresnelParameters!.rightColor = Color3.FromHexString(look.body).scale(look.emissive);
  c.heart.diffuseColor = c.heart.emissiveColor = Color3.FromHexString(look.core);
  c.halo.emissiveColor = Color3.FromHexString(look.core);
  c.motes.emitRate = look.motes;
}

export function makeTeleportCrystal(id: string, name: string, x: number, z: number): void {
  // the dais: a stone block with a flight of the town kit's steps up each
  // face, a carved post in each corner between the flights, all on a stone
  // terrace. MEASURED (env_manifest_cc0): Stairs_Exterior_Straight is
  // 2.0 x 1.204 x 2.078 m, so the block is cut to the flight's 1.2 m rise and
  // the flights sit flush against its faces; fence_pillar is 0.5 x 2.2 x 0.5.
  //
  // The terrace is level at the HIGHEST ground under it and runs down into
  // the lowest: a thin slab laid at the centre's height floated a corner off
  // every hillside (audited 2026-09-24: Timber Estates drops 2 m across the
  // square). Every piece is seated on the terrace top, not on the terrain
  // under its own spot -- placeExact seats on heightFn per spot, so each yOff
  // is taken from that spot's own height.
  const BASE_H = 1.2, BLOCK = 2.4, FLIGHT_D = 2.078, HALF = 3.3;
  let lo = Infinity, hi = -Infinity;
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const g = groundHeight(x + i * HALF / 4, z + j * HALF / 4);
    lo = Math.min(lo, g); hi = Math.max(hi, g);
  }
  const top = hi + 0.12;
  const seat = (px: number, pz: number) => top - heightFn(px, pz);
  const terraceH = top - lo + 0.4; // its foot 0.4 m under the lowest ground
  placeExact("dungeon/floor_foundation_allsides.glb",
    [{ x, z, scale: 1, rot: 0, sx: HALF / 1.1, sy: terraceH / 2, sz: HALF / 1.1, yOff: seat(x, z) - terraceH }], 0, { tint: "#26282c", flat: true });
  placeExact("dungeon/floor_foundation_allsides.glb",
    [{ x, z, scale: 1, rot: 0, sx: BLOCK / 2.2, sy: BASE_H / 2, sz: BLOCK / 2.2, yOff: seat(x, z) }], 0, { tint: "#4a4e55", flat: true });
  const flights = [0, 1, 2, 3].map((i) => {
    const a = i * Math.PI / 2, r = BLOCK / 2 + FLIGHT_D / 2;
    const fx = x + Math.sin(a) * r, fz = z + Math.cos(a) * r;
    return { x: fx, z: fz, scale: 1, rot: a + STAIR_ROT, yOff: seat(fx, fz) };
  });
  // the kit flight has sandstone stringers; a cool grey pulls it to the block
  placeExact("town/Stairs_Exterior_Straight.gltf", flights, 0, { tint: "#a4a8ae" });
  placeExact("halloween/fence_pillar.gltf", [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
    const px = x + sx * (BLOCK / 2 + 0.25), pz = z + sz * (BLOCK / 2 + 0.25);
    return { x: px, z: pz, scale: 0.85, rot: 0, yOff: seat(px, pz) };
  }));
  const y = top; // everything above is measured from the terrace top
  const SPIRE_H = 6.2, HOVER = 0.45;
  const cy = y + BASE_H + HOVER + SPIRE_H / 2; // the spire's centre

  const body = new StandardMaterial(`crystal_body_m_${id}`, scene);
  body.maxSimultaneousLights = 8;
  body.alpha = 0.78;
  body.specularColor = new Color3(0.9, 0.95, 1);
  body.specularPower = 96;
  // the edge-lit, hollow-centred look: facets turned away from the eye light up
  // and go opaque, facets facing it stay dim and let the heart show through
  body.emissiveFresnelParameters = new FresnelParameters();
  body.emissiveFresnelParameters.bias = 0.15;
  body.emissiveFresnelParameters.power = 1.6;
  body.opacityFresnelParameters = new FresnelParameters();
  body.opacityFresnelParameters.leftColor = Color3.White();
  body.opacityFresnelParameters.rightColor = new Color3(0.45, 0.45, 0.45);
  body.opacityFresnelParameters.power = 1.4;
  body.metadata = { glow: 0.5 };

  const heartM = mat(`crystal_heart_m_${id}`, "#8fe0ff", { emissive: "#8fe0ff", glow: 0.9 });
  const heart = MeshBuilder.CreateSphere(`crystal_heart_${id}`, { diameter: 0.5, segments: 12 }, scene);
  heart.material = heartM;
  heart.position.set(x, cy - 0.6, z);
  heart.metadata = { milestoneFlame: id };
  tagWorldObject(heart, id);

  // the halo: a soft disc of light behind the spire, always facing the camera
  const haloM = new StandardMaterial(`crystal_halo_m_${id}`, scene);
  haloM.disableLighting = true;
  haloM.diffuseTexture = flameTexture();
  haloM.opacityTexture = flameTexture();
  haloM.alphaMode = Engine.ALPHA_ADD;
  haloM.alpha = CRYSTAL_LIT.halo;
  const halo = MeshBuilder.CreatePlane(`crystal_halo_${id}`, { size: 7 }, scene);
  halo.material = haloM;
  halo.position.set(x, cy - 0.4, z);
  halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
  halo.isPickable = false;

  // aether rising off the spire's foot, the gathering shimmer's rule scaled up
  const motes = fxParticles(new ParticleSystem(`crystal_motes_${id}`, 90, scene));
  motes.particleTexture = flameTexture();
  motes.emitter = new Vector3(x, y + BASE_H + 0.2, z);
  motes.minEmitBox = new Vector3(-1.6, 0, -1.6);
  motes.maxEmitBox = new Vector3(1.6, 0.4, 1.6);
  motes.minLifeTime = 3;
  motes.maxLifeTime = 5.5;
  motes.minSize = 0.1;
  motes.maxSize = 0.26;
  // saturated on purpose: small additive sprites over sunlit grass read
  // YELLOW-green (MEASURED, first shot) unless the blue carries them
  motes.color1 = new Color4(0.25, 0.65, 1, 1);
  motes.color2 = new Color4(0.5, 0.85, 1, 0.8);
  motes.colorDead = new Color4(0.2, 0.5, 1, 0);
  motes.direction1 = new Vector3(-0.15, 1, -0.15);
  motes.direction2 = new Vector3(0.15, 1, 0.15);
  motes.minEmitPower = 0.5;
  motes.maxEmitPower = 1.1;
  motes.gravity = new Vector3(0, 0.08, 0);
  motes.blendMode = ParticleSystem.BLENDMODE_ADD;
  motes.start();

  crystals.set(id, { body, heart: heartM, halo: haloM, motes, look: CRYSTAL_LIT });
  applyCrystalLook(id, CRYSTAL_LIT);

  // the floating body: a node that turns and bobs, with the orbiting shards on
  // a second node turning the other way
  const spin = new TransformNode(`crystal_spin_${id}`, scene);
  spin.position.set(x, cy, z);
  const orbit = new TransformNode(`crystal_orbit_${id}`, scene);
  orbit.position.set(x, cy - 0.8, z);
  const sceneAtCall = scene;
  staticTemplate("crystal/gem_pink.glb").then((base) => {
    if (!base || sceneAtCall !== scene) return;
    // fresh geometry: the template may already carry thin instances, and
    // Mesh.clone would share or copy them (see tintedTemplate)
    const vd = VertexData.ExtractFromMesh(base, true, true);
    const bb = base.getBoundingInfo().boundingBox;
    const gw = bb.extendSize.x * 2, gh = bb.extendSize.y * 2, gc = bb.center;
    const gem = (nm: string, parent: TransformNode, w: number, h: number): Mesh => {
      const m = new Mesh(nm, scene);
      vd.applyToMesh(m);
      m.bakeTransformIntoVertices(Matrix.Translation(-gc.x, -gc.y, -gc.z));
      m.scaling.set(w / gw, h / gh, w / gw);
      m.material = body;
      m.parent = parent;
      tagWorldObject(m, id);
      return m;
    };
    gem(`crystal_spire_${id}`, spin, 1.35, SPIRE_H);
    // four shorter gems grown off the spire's lower half, leaning out
    [[0.4, 3.0, 0.62, -0.9], [2.0, 2.3, 0.5, -1.4], [3.5, 3.4, 0.7, -0.4], [5.1, 2.0, 0.45, -1.7]]
      .forEach(([a, h, w, dy], i) => {
        const g = gem(`crystal_spur_${id}_${i}`, spin, w, h);
        g.position.set(Math.cos(a) * 0.42, dy, Math.sin(a) * 0.42);
        g.rotation.set(Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38);
      });
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const g = gem(`crystal_shard_${id}_${i}`, orbit, 0.3, 0.95 - (i % 2) * 0.25);
      g.position.set(Math.cos(a) * 2.3, (i % 3 - 1) * 0.9, Math.sin(a) * 2.3);
    }
  });
  const t0 = (x * 13 + z * 7) % 10; // crystals in view never move in step
  sceneAtCall.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000 + t0;
    spin.rotation.y = t * 0.22;
    spin.position.y = cy + Math.sin(t * 0.8) * 0.14;
    orbit.rotation.y = -t * 0.35;
    orbit.position.y = cy - 0.8 + Math.sin(t * 0.6 + 1) * 0.2;
    heart.position.y = spin.position.y - 0.6;
    const c = crystals.get(id);
    if (!c) return;
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.4);
    heart.scaling.setAll(0.9 + 0.12 * Math.sin(t * 1.4));
    c.halo.alpha = c.look.halo * pulse;
  });

  // a wide invisible collar so the whole crystal is clickable from any side
  const grab = MeshBuilder.CreateCylinder(`crystal_grab_${id}`, { height: 9, diameter: 4.8 }, scene);
  grab.position.set(x, y + 4.5, z);
  grab.isVisible = false;
  tagWorldObject(grab, id);
  const pl = new PointLight(`crystal_l_${id}`, new Vector3(x, cy - 1, z), scene);
  pl.diffuse = Color3.FromHexString("#7fc8ff");
  pl.intensity = 0.6;
  pl.range = 22;
  registerNightLight(pl, 0.6);
  // square, like the terrace: a circle left its corners walkable, to a player
  // wading knee-deep into the stone
  colliders.push({ x0: x - 3.3, x1: x + 3.3, z0: z - 3.3, z1: z + 3.3, y1: y + BASE_H + 0.5 });
  worldObjects.push({ id, kind: "milestone", x, z, mesh: heart, name });
}

function buildMilestones(def: any): void {
  crystals.clear();
  (def.milestones || []).forEach((w: any) => makeTeleportCrystal(w.id, w.name, w.x, w.z));
}

// attuned = the crystal burns pale blue for this character; unattuned it is a
// dull grey-blue with barely any aether coming off it, the state every crystal
// is in when a new character first sees it
export function setMilestoneLit(id: string, lit: boolean): void {
  applyCrystalLook(id, lit ? CRYSTAL_LIT : CRYSTAL_DARK);
}

// Every portal is one of two lights (portal-fx.ts, portal_plan.ts): the Dawn
// Veil wherever you pass THROUGH something -- a door, a gate, a causeway, a
// zone's edge -- and the Rune Circle on open ground. Neither builds a frame:
// a veil is framed only by what its zone built (`built: true`), and the
// generic pillar-and-lintel and the stand-in city wall it used to draw here
// are gone (Philip: "the generic pillar+lintel frame must NOT exist anywhere").
// The pickable mesh is the world object: world.ts hides a gated portal by
// disabling it (restoreGatedPortals) and the rest of the portal follows.
function buildPortals(def: any): void {
  const ctx = { scene, glow, particles: fxParticles, ground: groundHeight };
  (def.portals || []).forEach((p: any) => {
    // groundHeight, not heightFn: a portal may stand on a BUILT surface (the
    // Moonmere causeway carries one out over the water), and the height
    // function under that is the seabed.
    const y = p.y ?? groundHeight(p.x, p.z);
    let made, card: VeilCard | undefined;
    if (portalFx(p, def) === "rune") {
      const r = runeSpec(p);
      const ry = r.at[0] === p.x && r.at[1] === p.z ? y : groundHeight(r.at[0], r.at[1]);
      made = makeRuneCircle(ctx, { id: p.id, x: r.at[0], z: r.at[1], y: ry, radius: r.radius });
    } else {
      const v = veilSpec(p);
      // A veil in a rim pass faces along the gorge the pass built, whatever
      // yaw the data carries: the pass's axis is measured off the plate's
      // edge, and a hand-rounded yaw a few degrees off it stands the card
      // skewed between the walls (the card is two-sided, so only the angle
      // matters, never its sign)
      const pass = rimVeil(currentZone, p);
      if (pass) v.yaw = pass.yaw;
      const [vx, vz] = v.at;
      // the threshold: the veil's own `y`, else the portal's, else the lowest
      // surface across the span -- a free veil on a slope stands in the ground
      // at its low side rather than hanging in the air there
      let vy = v.y ?? (vx === p.x && vz === p.z ? y : groundHeight(vx, vz));
      if (v.y === undefined && p.y === undefined && v.frame === "free") {
        const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
        for (const u of [-0.45, 0.45]) vy = Math.min(vy, groundHeight(vx + c * v.width * u, vz - s * v.width * u) - 0.1);
      }
      made = makeDawnVeil(ctx, { id: p.id, x: vx, z: vz, y: vy, width: v.width, height: v.height, yaw: v.yaw, frame: v.frame });
      card = { at: [vx, vz], yaw: v.yaw, width: v.width };
    }
    tagWorldObject(made.pick, p.id);
    worldObjects.push({ id: p.id, kind: "portal", x: p.x, z: p.z, y, mesh: made.pick, name: p.name, veil: card });
  });
}

// The gathering shimmer: what says "this can be gathered" up close, for every
// node kind alike. A handful of pale motes drifting up off the thing itself,
// on the snowfall's rule (an effect, drawn sprite, no asset), with the emit
// rate driven by the camera's distance so it is a whisper inside twelve
// metres and nothing at all past twenty. That distance falloff is the whole
// point: a node is a THING, and should read as one only when you are near it.
// "Come here" is the quest overlay's job (marker.ts showObjectiveMarkers and
// the HUD's beacons), which exists only while a quest of yours names the
// node -- the old always-on glow spheres were beacons for everyone, and read
// as lit balls from across a beach.
const SHIMMER_NEAR = 12, SHIMMER_FAR = 20;
let shimmers: { ps: ParticleSystem; x: number; z: number; rate: number }[] = [];
let shimmerTickFor: Scene | null = null;
function nodeShimmer(id: string, x: number, y: number, z: number, hex: string, r = 0.35): void {
  const c = Color3.FromHexString(hex);
  const ps = fxParticles(new ParticleSystem(`shimmer_${id}`, 14, scene));
  ps.particleTexture = flameTexture();
  ps.emitter = new Vector3(x, y, z);
  ps.minEmitBox = new Vector3(-r, 0, -r);
  ps.maxEmitBox = new Vector3(r, 0.2, r);
  ps.emitRate = 0;
  ps.minLifeTime = 1.4;
  ps.maxLifeTime = 2.4;
  ps.updateSpeed = 0.016;
  ps.minSize = 0.1;
  ps.maxSize = 0.18;
  ps.color1 = new Color4(c.r, c.g, c.b, 0.9);
  ps.color2 = new Color4(1, 1, 1, 0.7);
  ps.colorDead = new Color4(c.r, c.g, c.b, 0);
  ps.direction1 = new Vector3(-0.15, 0.5, -0.15);
  ps.direction2 = new Vector3(0.15, 0.9, 0.15);
  ps.minEmitPower = 0.35;
  ps.maxEmitPower = 0.6;
  ps.gravity = new Vector3(0, 0.05, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.start();
  if (shimmerTickFor !== scene) {
    shimmers = [];
    shimmerTickFor = scene;
    const sc = scene;
    sc.onBeforeRenderObservable.add(() => {
      const cam = sc.activeCamera;
      if (!cam) return;
      const cx = cam.globalPosition.x, cz = cam.globalPosition.z;
      for (const sh of shimmers) {
        const d = Math.hypot(sh.x - cx, sh.z - cz);
        const t = d <= SHIMMER_NEAR ? 1 : d >= SHIMMER_FAR ? 0 : 1 - (d - SHIMMER_NEAR) / (SHIMMER_FAR - SHIMMER_NEAR);
        sh.ps.emitRate = sh.rate * t;
      }
    });
  }
  shimmers.push({ ps, x, z, rate: 9 });
}

// an invisible pick collar over a node whose visible part is a kit model or a
// cluster: what E and the target ring find, the same as the notices use
function nodeCollar(id: string, x: number, y: number, z: number, h = 1.2, d = 1.4): Mesh {
  const grab = MeshBuilder.CreateCylinder(`node_${id}`, { height: h, diameter: d }, scene);
  grab.position.set(x, y + h / 2, z);
  grab.isVisible = false;
  tagWorldObject(grab, id);
  return grab;
}

// gathering nodes: herbs, ore veins, reeds — E to gather. Each one is the
// object itself plus the shimmer; nothing here is a beacon.
function buildNodes(_zoneKey: string, def: any): void {
  (def.nodes || []).forEach((n: any) => {
    const y = n.y ?? groundHeight(n.x, n.z);
    if (n.kind === "ore") {
      const rock = MeshBuilder.CreatePolyhedron(`node_${n.id}`, { type: 1, size: 0.9 }, scene);
      rock.position.set(n.x, y + 0.6, n.z);
      rock.material = mat(`nodeorem`, "#3f4450", { emissive: "#1a3440" });
      const vein = MeshBuilder.CreateSphere(`nodev_${n.id}`, { diameter: 0.4, segments: 5 }, scene);
      vein.position.set(n.x + 0.3, y + 0.9, n.z + 0.2);
      vein.material = mat("nodeveinm", "#7ac0d8", { emissive: "#2a5060" });
      vein.isPickable = false;
      tagWorldObject(rock, n.id);
      nodeShimmer(n.id, n.x, y + 0.9, n.z, "#9ad0e8", 0.5);
      worldObjects.push({ id: n.id, kind: "node", x: n.x, z: n.z, y, mesh: rock, name: "Glimmer Ore (gather)" });
    } else if (n.kind === "reed") {
      for (let i = 0; i < 5; i++) {
        const reed = MeshBuilder.CreateCylinder(`node_${n.id}_${i}`, { height: 1.6 + (i % 3) * 0.3, diameterBottom: 0.07, diameterTop: 0.02 }, scene);
        reed.position.set(n.x + Math.cos(i * 1.3) * 0.35, y + 0.8, n.z + Math.sin(i * 1.3) * 0.35);
        reed.rotation.z = (i - 2) * 0.06;
        reed.material = mat("nodereedm", "#5a7a4e", { emissive: "#22301a" });
        reed.isPickable = false;
      }
      const grab = nodeCollar(n.id, n.x, y, n.z, 2.0, 1.2);
      nodeShimmer(n.id, n.x, y + 1.2, n.z, "#d8d8a0", 0.3);
      worldObjects.push({ id: n.id, kind: "node", x: n.x, z: n.z, y, mesh: grab, name: "Mere Reeds (gather)" });
    } else if (n.kind === "windfall") {
      // fallen fruit under the orchard trees: the props kit's apple crate, a
      // basket's worth on the ground, with the same pick collar the notices use
      placeExact("props/FarmCrate_Apple.gltf", [{ x: n.x, z: n.z, scale: 1.4, rot: (n.x + n.z) * 0.7, yOff: y-heightFn(n.x,n.z) }], 0);
      const grab = nodeCollar(n.id, n.x, y, n.z);
      nodeShimmer(n.id, n.x, y + 0.5, n.z, "#e0c890", 0.5);
      worldObjects.push({ id: n.id, kind: "node", x: n.x, z: n.z, y, mesh: grab, name: "Windfall (gather)" });
    } else if (n.kind === "spines") {
      // the burned shelf's drowned books, a stack on the strand
      placeExact("props/Book_Stack_3.gltf", [{ x: n.x, z: n.z, scale: 1.6, rot: (n.x - n.z) * 0.5, yOff: y-heightFn(n.x,n.z)-0.05 }], 0);
      const grab = nodeCollar(n.id, n.x, y, n.z, 1.0, 1.4);
      nodeShimmer(n.id, n.x, y + 0.4, n.z, "#d8c8a0", 0.4);
      worldObjects.push({ id: n.id, kind: "node", x: n.x, z: n.z, y, mesh: grab, name: "Drowned Books (gather)" });
    } else { // lamproot herb
      const bulb = MeshBuilder.CreateSphere(`node_${n.id}`, { diameter: 0.5, segments: 6 }, scene);
      bulb.position.set(n.x, y + 0.35, n.z);
      bulb.material = mat("nodeherbm", "#b8c96a", { emissive: "#4a5a28" });
      nodeShimmer(n.id, n.x, y + 0.5, n.z, "#cfe090", 0.4);
      for (let i = 0; i < 4; i++) {
        const leaf = MeshBuilder.CreateCylinder(`nodel_${n.id}_${i}`, { height: 0.7, diameterBottom: 0.12, diameterTop: 0.01 }, scene);
        leaf.position.set(n.x + Math.cos(i * 1.6) * 0.3, y + 0.45, n.z + Math.sin(i * 1.6) * 0.3);
        leaf.rotation.z = Math.cos(i * 1.6) * 0.5;
        leaf.rotation.x = -Math.sin(i * 1.6) * 0.5;
        leaf.material = mat("nodeleafm", "#4e6a3a");
        leaf.isPickable = false;
      }
      tagWorldObject(bulb, n.id);
      worldObjects.push({ id: n.id, kind: "node", x: n.x, z: n.z, y, mesh: bulb, name: "Lamproot (gather)" });
    }
  });
}

const questDoors=new Map<string,{root:TransformNode|null;collider:(typeof boxColliders)[number];yaw:number;open:boolean}>();
export function openQuestDoor(id:string):void {
  const door=questDoors.get(id);if(!door)return;
  door.open=true;door.collider.y1=-Infinity;
  if(door.root)door.root.rotation.y=door.yaw+Math.PI/2;
}
function questDoor(it:any):void {
  const {x,z,y,yaw}=it,c=Math.cos(yaw),sn=Math.sin(yaw),sy=3.6/3.125;
  // the zone builds the door's frame itself (Moonmere's Long Tower, MOONMERE.md A-7):
  // only the leaf and the colliders are placed here
  for(const side of [-1,1])buildApi.addBoxCollider(x+side*.8*c,z-side*.8*sn,.2,.24,yaw,y+3.6,y);
  buildApi.addBoxCollider(x,z,.6,.24,yaw,y+3.6,y+2.92);
  const collider={cx:x,cz:z,hx:.62,hz:.16,sin:sn,cos:c,y0:y,y1:y+2.92};boxColliders.push(collider);
  const entry={root:null as TransformNode|null,collider,yaw,open:false};questDoors.set(it.id,entry);
  const owner=scene;
  instantiateModel('moonmere/door.glb','obj_'+it.id).then(model=>{
    if(!model||scene!==owner)return;entry.root=model.root;
    model.root.position.set(x-.62*c,y,z+.62*sn);model.root.scaling.y=sy;
    // Animated-model loading retains glTF's X reflection. Undo it so the
    // authored hinge's positive-X leaf fills the same opening as static kit doors.
    model.root.scaling.x=-1;
    model.root.rotation.y=yaw+(entry.open?Math.PI/2:0);
  });
  const grab=MeshBuilder.CreateBox('relic_'+it.id,{width:1.25,height:2.9,depth:.3},scene);
  grab.position.set(x,y+1.45,z);grab.rotation.y=yaw;grab.visibility=0;tagWorldObject(grab,it.id);
  worldObjects.push({id:it.id,kind:'interactable',x,z,y,mesh:grab,name:it.name});
}

// Contents and elevations belong to zones.json; these are shared prop recipes.
// Where a piece of furniture's collider starts. resolveCollision holds a box
// solid from 1.2 m under its bottom, so a shelf or a globe on an UPPER floor,
// standing beside the stairwell, turned solid round a climber still 1.3 m down
// the flight (Philip 2026-10-12: blocked part way up the Archive's stair, 0.3 m
// off its centre line). On an upper floor it holds only for a body on that floor,
// as the well rails do (moonmere_types.ts WELL_RAIL_Y0); on the ground, where
// a slope can stand a body a little below it, from its feet as before.
function furnitureY0(x:number,z:number,y:number):number {
  return y>buildApi.surface(x,z)+1.5?y+.95:y-.1;
}
function questFurniture(it:any):boolean {
  if(it.prop==='drying_rack'){
    const y=buildApi.surface(it.x,it.z),wood=mat('rack_wood','#6b5843'),linen=mat('rack_linen','#e4ddc6');
    for(const side of [-1,1]){
      const post=tbox('drying_post',.15,2.1,.15,wood,1);post.position.set(it.x+side*3,y+1.05,it.z);addShadowCaster(post);
      buildApi.addBoxCollider(it.x+side*3,it.z,.1,.1,0,y+2.1,y);
    }
    const line=tbox('drying_line',6,.035,.035,wood,1);line.position.set(it.x,y+1.95,it.z);
    for(let i=0;i<9;i++){
      const cloth=tbox('college_bandage',.28,.85+(i%3)*.15,.025,linen,1);cloth.position.set(it.x-2.5+i*.62,y+1.4,it.z);addShadowCaster(cloth);
    }
    return true;
  }
  if(it.prop==='old_graves'){
    for(let i=0;i<4;i++){
      const x=it.x+(i%2)*3,z=it.z+Math.floor(i/2)*4;
      placeExact(i%2?'graveyard/gravestone-broken.glb':'graveyard/gravestone-round.glb',[{x,z,scale:2.2,rot:.1*i}],0);
      const earth=MeshBuilder.CreateSphere('opened_family_grave',{diameter:1,segments:8},scene);
      earth.scaling.set(1.2,.15,2.3);earth.position.set(x,buildApi.surface(x,z-1.2),z-1.2);earth.material=mat('grave_earth','#5b4936');earth.isPickable=false;
    }
    return true;
  }
  if(['craft_bench','alchemy_bench','healing_bench','council_table','archive_rails'].includes(it.prop)){
    const x=it.x,z=it.z,y=it.y??buildApi.surface(x,z),yaw=it.yaw??0,c=Math.cos(yaw),sn=Math.sin(yaw);
    const put=(file:string,lx:number,lz:number,dy:number,scale=1)=>{
      const px=x+lx*c+lz*sn,pz=z-lx*sn+lz*c;
      placeExact(file,[{x:px,z:pz,scale,rot:yaw,yOff:y+dy-heightFn(px,pz)}],0);
    };
    if(it.prop==='archive_rails'){
      for(const lx of [-.7,.7]){
        const rail=tbox('vault_shelf_rail',.045,.035,2.1,mat('vault_rail_iron','#454d50'),1);
        rail.position.set(x+lx*c,y+.028,z-lx*sn);rail.rotation.y=yaw;
      }
      return true;
    }
    const council=it.prop==='council_table';
    put(council?'props/Table_Large.gltf':'props/Workbench.gltf',0,0,0);
    if(it.prop==='craft_bench'){put('props/Workbench_Vice.gltf',0,0,0);put('props/Hammer_Small_Bronze.gltf',.4,-.1,.895);}
    if(it.prop==='alchemy_bench'){put('props/SmallBottles_1.gltf',-.4,0,.9);put('props/SmallBottles_2.gltf',.4,0,.9);put('props/Book_Stack_2.gltf',0,0,.9,.7);}
    if(it.prop==='healing_bench'){put('props/SmallBottles_2.gltf',-.4,0,.9);put('props/Scroll_1.gltf',.3,0,.9,2);}
    if(council){put('props/Scroll_1.gltf',0,0,.82,3);put('props/Chair_1.gltf',0,-1.2,0);}
    buildApi.addBoxCollider(x,z,council?1.45:1.02,council?.56:.53,yaw,y+1.1,furnitureY0(x,z,y));
    return true;
  }
  if(it.prop==='annex_door'){questDoor(it);return true;}
  if(['star_globe','telescope','water_clock'].includes(it.prop)){
    placeExact('moonmere/'+it.prop+'.glb',[{x:it.x,z:it.z,scale:1,rot:it.yaw??0,yOff:it.y-heightFn(it.x,it.z)}],0);
    buildApi.addBoxCollider(it.x,it.z,it.prop==='telescope'?.48:it.prop==='water_clock'?.44:.6,it.prop==='water_clock'?.44:.75,it.yaw??0,it.y+2.3,furnitureY0(it.x,it.z,it.y));
    if(it.prop==='water_clock'){
      const drops=Array.from({length:5},(_,i)=>{
        const drop=MeshBuilder.CreateSphere('clock_drop_'+i,{diameter:.045,segments:6},scene);
        drop.position.set(it.x,it.y+.5,it.z+.025);drop.scaling.y=1.7;
        drop.material=mat('clock_drops','#a6dde1',{alpha:.8,spec:1});drop.isPickable=false;return drop;
      });
      let elapsed=0;const sc=scene;
      sc.onBeforeRenderObservable.add(()=>{elapsed+=sc.getEngine().getDeltaTime()/1000;
        drops.forEach((drop,i)=>{drop.position.y=it.y+1.55-((elapsed*1.3+i/5)%1)*1.08;});});
    }
    return true;
  }
  if(!['return_shelf','book_cargo','returns_desk','stamp_desk'].includes(it.prop))return false;
  const x=it.x,z=it.z,y=it.y??buildApi.surface(x,z),yaw=it.yaw??0,c=Math.cos(yaw),sn=Math.sin(yaw);
  const put=(file:string,lx:number,lz:number,dy:number,scale=1)=>{
    const px=x+lx*c+lz*sn,pz=z-lx*sn+lz*c;
    placeExact(file,[{x:px,z:pz,rot:yaw,scale,yOff:y+dy-heightFn(px,pz)}],0);
  };
  let label=it.label??'',front=.13,labelY=1.75,hx=.85,hz=.38,height=2.24;
  if(it.prop==='return_shelf'){
    put('moonmere/bookcase.glb',0,0,0);label=it.moons===1?'☾  UPPER RETURNS':'☾ ☾  LOWER RETURNS';
  }else if(it.prop==='book_cargo'){
    put('props/Crate_Wooden.gltf',0,0,.052,1.35);put('props/Book_Stack_3.gltf',0,0,1.24,1.4);
    put('props/Crate_Wooden.gltf',1.45,.25,.052);put('props/Book_Stack_2.gltf',1.45,.25,.94,1.2);
    buildApi.addBoxCollider(x+1.45*c+.25*sn,z-1.45*sn+.25*c,.45,.46,yaw,y+1.25,furnitureY0(x,z,y));
    label='☾ ☾ ☾  FERRY RETURNS';front=.62;labelY=.68;hx=.6;hz=.64;height=1.55;
  }else{
    put('moonmere/desk.glb',0,0,0);
    if(it.prop==='stamp_desk'){put('moonmere/seal_press.glb',.3,0,.86);put('props/Scroll_1.gltf',-.15,.12,.87,2);}
    front=.39;labelY=.59;hx=.8;hz=.4;height=.91;
  }
  buildApi.addBoxCollider(x,z,hx,hz,yaw,y+height,furnitureY0(x,z,y));
  if(it.prop==='returns_desk'&&!label)return true; // (Moonmere A-13: a desk with no label carries no plaque)
  const plaque=MeshBuilder.CreatePlane('quest_label_'+it.id,{width:1.35,height:.28,sideOrientation:Mesh.DOUBLESIDE},scene);
  plaque.position.set(x+sn*front,y+labelY,z+c*front);plaque.rotation.y=yaw+Math.PI;
  const tex=new DynamicTexture('quest_label_'+it.id,{width:1024,height:212},scene,false),ctx=tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle='#173c49';ctx.fillRect(0,0,1024,212);ctx.strokeStyle='#c7af72';ctx.lineWidth=9;ctx.strokeRect(8,8,1008,196);
  ctx.fillStyle='#eee1bf';ctx.font='bold 65px Georgia';ctx.textAlign='center';ctx.fillText(label,512,132);tex.update();
  const material=new StandardMaterial('quest_label_'+it.id,scene);material.diffuseTexture=tex;material.emissiveTexture=tex;material.emissiveColor=new Color3(.55,.55,.55);material.specularColor=Color3.Black();plaque.material=material;
  if(it.prop==='returns_desk')return true;
  const grab=MeshBuilder.CreateBox('relic_'+it.id,{width:hx*2,height,depth:hz*2},scene);
  grab.position.set(x,y+height/2,z);grab.rotation.y=yaw;grab.visibility=0;tagWorldObject(grab,it.id);
  worldObjects.push({id:it.id,kind:'interactable',x,z,y,mesh:plaque,name:it.name});
  return true;
}

function buildLandmarkProps(_zoneKey: string, def: any): void {
  (def.furnishings??[]).forEach(questFurniture);
  for (const it of def.interactables ?? []) {
    if (questFurniture(it)) continue;
    const x=it.x,z=it.z,y=it.y??buildApi.surface(x,z),yaw=it.yaw??Math.PI;
    const put=(file:string,dy=0,scale=1)=>placeExact(file,[{x,z,scale,rot:yaw,yOff:y+dy-heightFn(x,z)}],0);
    const timber=mat('quest_post_wood','#635344'),paper=mat('quest_paper','#dbcfad'),ink=mat('quest_ink','#28383c');
    let height=1.6,hx=.65,hz=.4;
    const box=(name:string,w:number,h:number,d:number,dy:number,material:StandardMaterial)=>{
      const m=MeshBuilder.CreateBox(name+'_'+it.id,{width:w,height:h,depth:d},scene);
      m.position.set(x,y+dy,z);m.rotation.y=yaw;m.material=material;m.isPickable=false;addShadowCaster(m);return m;
    };
    switch(it.prop){
      case 'book_shelf':
        put('props/Bookcase_1.gltf');for(const dy of [.32,.92,1.52,2.12])put('props/BookGroup_Large_1.gltf',dy);height=2.44;hx=.9;hz=.23;break;
      case 'cabinet':
        put('props/Cabinet.gltf');put('props/Scroll_1.gltf',1.01,2.5);height=1.08;hx=.71;hz=.22;
        box('cabinet_wax_seal',.13,.13,.38,.58,mat('quest_wax','#923a36'));break;
      case 'document_desk':
      case 'document_table':
      case 'sideboard':
        put(it.prop==='sideboard'?'props/Cabinet.gltf':'props/Table_Large.gltf');
        put('props/Scroll_1.gltf',it.prop==='sideboard'?1.01:.83,3);put('props/Book_Stack_2.gltf',it.prop==='sideboard'?1.01:.83,.8);
        height=it.prop==='sideboard'?1.2:1.05;hx=it.prop==='sideboard'?.72:1.45;hz=it.prop==='sideboard'?.23:.58;break;
      case 'existing_table':
        // The zone already builds Emmer's table. Add only its quest paper.
        put('props/Scroll_1.gltf',it.table_height??.75,3);height=1.1;hx=1.35;hz=.55;break;
      case 'existing_throne':
        height=2.5;hx=1.3;hz=.9;break;
      case 'zone_board':
        // The zone builds the board itself (the Capital's bakery board, a module
        // of its own: zones/capital_civic.ts tenants); this stands only its
        // collider and grab box round it, faced as the board is.
        height=1.15;hx=.4;hz=.36;break;
      case 'zone_desk':
        // The zone builds the desk AND its collider (the Capital's Archive reading
        // desk: zones/capital_civic.ts archive); this stands only the grab box,
        // document_desk's size, so the desk is clicked as it always was. As a
        // furnishing (returned_archive_desk) it draws nothing here at all.
        height=1.05;hx=1.45;hz=.58;break;
      case 'dais_notice':
        // Optional support height is visual; y remains the interaction floor.
        put('props/Scroll_1.gltf',it.table_height??.06,4);height=(it.table_height??.06)+.3;hx=.6;hz=.4;break;
      case 'duel_marker': {
        const ring=MeshBuilder.CreateTorus('dueling_ring',{diameter:8,thickness:.12,tessellation:64},scene);
        // (dark wet granite, not pale: at #8b9194 the ring read as white plastic on
        // Caerdun's parade, the only duel_marker -- the look review, fix round 1;
        // flattened to a kerb lying in the earth, not a hoop standing on it.
        // FIX ROUND 2: #4f5559 still rendered (200, 204, 201) -- the zone's sun (2.09)
        // and sky light multiply a lit diffuse ~2.5 times on a face turned up to them,
        // and the specular played no part (MEASURED, pixel probes with it on, its
        // specular off, unlit and off). The diffuse is the colour wanted over that gain.)
        ring.scaling.y=.45;ring.position.set(x,y+.04,z);ring.material=mat('quest_duel_granite','#1f2224');ring.isPickable=false;
        height=.2;hx=2;hz=2;break;
      }
      case 'clock_face': {
        const housing=box('clock_housing',2.15,2.85,.24,1.425,timber);housing.position.x-=Math.sin(yaw)*.21;housing.position.z-=Math.cos(yaw)*.21;
        const dial=MeshBuilder.CreateCylinder('imperial_clock',{diameter:1.65,height:.14,tessellation:48},scene);
        dial.rotation.x=Math.PI/2;dial.rotation.y=yaw;dial.position.set(x,y+1.7,z);dial.material=mat('clock_ivory','#ded4b9',{emissive:'#302b22'});dial.isPickable=false;
        // the ticks and the grate's bars each ONE mesh: twelve and seven boxes were
        // nineteen draws in every pass the clock is in view (Caerdun's Sea Gate
        // stands it beside Crown Square: ~100 of the forecourt camera's draws,
        // MEASURED by the perf pass; Caerdun's cd_gate_clock is its only use)
        const ticks:Mesh[]=[];
        for(let i=0;i<12;i++){
          const a=i*Math.PI/6,m=box('clock_tick',.045,.15,.19,1.7+Math.cos(a)*.68,ink);
          m.position.x+=Math.sin(a)*.68*Math.cos(yaw);m.position.z-=Math.sin(a)*.68*Math.sin(yaw);m.rotation.z=-a;ticks.push(m);
        }
        const one=(parts:Mesh[],name:string)=>{const m=Mesh.MergeMeshes(parts,true);if(m){m.name=name+'_'+it.id;m.isPickable=false;addShadowCaster(m);}};
        one(ticks,'clock_tick');
        const pivot=new TransformNode('clock_mechanism',scene);pivot.position.set(x,y+1.7,z);pivot.rotation.y=yaw;
        const hand=box('clock_hand',.045,.72,.04,0,ink);hand.parent=pivot;hand.position.set(0,.29,.15);hand.rotation.y=0;
        const sweep=new TransformNode('clock_sweep',scene);sweep.parent=pivot;
        const needle=box('clock_second',.025,1.2,.03,0,mat('clock_second','#8c433b'));needle.parent=sweep;needle.position.set(0,.18,.18);needle.rotation.y=0;
        scene.onBeforeRenderObservable.add(()=>{sweep.rotation.z=-Date.now()/60000*Math.PI*2;});
        const bars:Mesh[]=[];
        for(let i=-3;i<=3;i++){
          const m=box('clock_grate',.035,2.85,.045,1.425,timber);m.position.x+=i*.3*Math.cos(yaw)+.2*Math.sin(yaw);m.position.z-=i*.3*Math.sin(yaw)-.2*Math.cos(yaw);bars.push(m);
        }
        one(bars,'clock_grate');
        height=2.7;hx=1.1;hz=.27;break;
      }
      case 'watch_post':
      case 'notice_post':
      case 'survey_post':
        box('notice_upright',.14,it.next_label?2.25:1.8,.14,it.next_label?1.125:.9,timber);
        box('notice_board',it.next_label?1.8:it.prop==='survey_post'?.55:1.1,it.next_label?.95:.65,.09,it.next_label?1.9:1.5,it.prop==='watch_post'?ink:paper);
        if(it.prop==='survey_post')box('survey_sighting_bar',.8,.08,.12,1.88,timber);
        else {
          const face=MeshBuilder.CreatePlane('posted_text_'+it.id,{width:it.next_label?1.74:1.04,height:it.next_label?.9:.6,sideOrientation:Mesh.DOUBLESIDE},scene);
          face.position.set(x+Math.sin(yaw)*.08,y+(it.next_label?1.9:1.5),z+Math.cos(yaw)*.08);face.rotation.y=yaw+Math.PI;face.isPickable=false;
          const sheet=new DynamicTexture('posted_text_'+it.id,{width:768,height:448},scene,false),ctx=sheet.getContext() as CanvasRenderingContext2D;
          ctx.fillStyle=it.prop==='watch_post'?'#28383c':'#dbcfad';ctx.fillRect(0,0,768,448);
          ctx.fillStyle=it.prop==='watch_post'?'#e9e5cb':'#334047';ctx.font=it.next_label?'bold 60px Georgia':'bold 36px Georgia';ctx.textAlign='center';
          const words=(it.label??it.name).split(' '),lines:string[]=[];let line='';for(const word of words){if((line+' '+word).length>25){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);
          lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,384,(it.next_label?145:74)+i*48));ctx.fillRect(90,225,588,3);ctx.font=it.next_label?'bold 44px Georgia':'26px Georgia';
          ctx.fillText(it.next_label??(it.prop==='watch_post'?'NIGHT MUSTER — SIGNED':'Filed for the courts'),384,296);sheet.update();
          const fm=new StandardMaterial('posted_text_'+it.id,scene);fm.diffuseTexture=sheet;fm.specularColor=Color3.Black();
          // The tally directions must remain legible beneath the elder's low crown.
          if(it.next_label){fm.emissiveTexture=sheet;fm.emissiveColor=new Color3(.45,.45,.45);}
          face.material=fm;
        }
        height=it.next_label?2.4:1.94;hx=it.next_label?.92:.18;hz=.18;break;
      default:
        // Ledger stands and the herald's lectern really are reading stands.
        put('props/BookStand.gltf',0,1.25);put('props/Scroll_1.gltf',1.16,1.3);
        height=1.82;hx=.35;hz=.36;
    }
    if(!['existing_table','existing_throne','duel_marker','dais_notice','zone_desk'].includes(it.prop))
      buildApi.addBoxCollider(x,z,hx,hz,yaw,y+height,furnitureY0(x,z,y));
    const grab=MeshBuilder.CreateBox('relic_'+it.id,{width:Math.max(hx*2,1),height:Math.max(height,.5),depth:Math.max(hz*2,1)},scene);
    grab.position.set(x,y+Math.max(height,.5)/2,z);grab.rotation.y=yaw;grab.visibility=0;tagWorldObject(grab,it.id);
    worldObjects.push({id:it.id,kind:'interactable',x,z,y,mesh:grab,name:it.name});
  }
}

// ---------- the builder API for zones/ ----------
// Everything a zone module may reach for. Exported in one place so the list
// of what a zone is allowed to touch stays readable; the arrays are live
// bindings and are reset by buildZone before any module runs.
export {
  smooth, basin, shelf, shapeDetail, polySignedDist, shapeNear, sampleRoad, gradeRoads,
  terrainMeshHeight, registerNightLight, mat, scatterModels,
  avoidPoints, buildRimMountains, setZoneFog, makeSnowfall, addSnowCaps, tintedTemplate,
  placeExact, scatterClustersCC0, texMat, tbox, gableTri, makeBuilding, vigWater,
  vigShallowWater, vigBoxAt, vigModel, shoreRing, vigBedSkirt, vigSandBed,
  shoreBand, shapeShoreSamples, bandMesh, vigGroundSheet, makeShoreWash, zseed,
  makeQuay, makeRampart, makeBorderWall,
  brazier, campfire, makeFlame, recordFootprint, vegBlocked, scatterBlocked,
  makeClearWaterMat, subMaterials,
  colliders, circleColliders, boxColliders, flatZones, waterBodies, slopeExempt,
  vegExclusions, scatterExclusions, decks, ramps,
};
export type { Road, RimOpts, BuildingOpts, WildsTheme, QuayOpts, Quay, RampartSpec, BorderWallSpec, Obb };
export { makeCauseway, type CausewaySpec };   // MOONMERE.md section 7: the new landward end
export const causewayLaid = (): CausewaySpec | null => lastCauseway;   // MOONMERE.md A-14 (MM-15)
export const ground = (x: number, z: number): number => heightFn(x, z);
// where each city's road leaves for its fields zone, for zones.json's portals
// and the dev view (the gates are placed off the wandered plate at build time)
// (Caerdun's: in the barbican's arch on the city side of the drawbridge,
// caerdun-fortress-layout.json landward.portal -- CF-22)
export const CITY_EXITS: Record<string, [number, number]> = { caerdun: [92, -18], heartwood: HW2_EXIT };
