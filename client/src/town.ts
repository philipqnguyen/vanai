// Modular building assembler for the Quaternius Medieval Village MegaKit (CC0).
//
// MEASURED off all 304 models (tools/assets/measure_gltf.py, and recorded in
// env_manifest_cc0.json), this kit's origins are exact and uniform:
//
//   Wall_*      x in [-1, 1]      2m wide, centred on x
//               y in [0, 3.123]   sits ON the floor, so y is the storey base
//               z in [-0.314, 0.092]  local +z is OUTWARD; the wall thickens inward
//   Floor_*     x,z in [-1, 1], y in [-0.01, 0.01]   2x2 tile centred on its origin
//   Roof_<t>_WxL   centred on x AND z, y from -0.78 (it laps down over the
//               wall head) to the ridge. W is the SPAN in metres, L the length.
//   Roof_Front_*   the gable triangle for a span, sitting at z ~ 0
//   Window_*    already carries its own sill height (y from 1.016), so it is
//               placed at the STOREY BASE, not at the sill
//   Door_*      hinged: x in [-0.046, 1.074], origin AT THE HINGE, not centred
//
// So placement here is by PIVOT, with no bbox correction anywhere. That is the
// whole reason this file is short.
//
// What it builds, and the rules it builds by -- raised floors on stone, a
// flight at every door, only roofs that exist, walkable interiors and the
// LEVELS that make a first floor standable in a 2D world -- is in BUILDINGS.md.
//
// Two numbers govern everything and neither is a choice:
//   MOD    2.000m   the wall module's width
//   STOREY 3.125m   the wall module's height
// Roofs exist for spans of 4, 6 and 8 metres and no others, and for lengths of
// 4..14 in even steps, so a building's footprint is not free — see SPANS/LENS.
// PBRMaterial from the package ROOT, as every other file takes it. MEASURED
// (2026-10-04): the deep path "@babylonjs/core/Materials/PBR/pbrMaterial" is a
// separate entry in Vite's dev dependency bundle with its OWN copy of the
// class, so the glTF loader's materials failed `instanceof PBRMaterial` here
// and every palette swap (and glowGlass's night windows) silently did nothing in
// dev: canalworks' heartwood houses kept the kit's red sheet. One import path
// is one class whatever the bundler does with deep entries.
import { Matrix, Quaternion, Vector3, Mesh, Color3, StandardMaterial, Texture, VertexData, PBRMaterial } from "@babylonjs/core";
import { scene, buildApi, dayFrac, seededRand, addShadowCaster, removeShadowCaster, fbm } from "./scene";
import { caerdunModule, caerdunDoorFoot, makeCaerdunHouse, makeCaerdunTower } from './caerdun-architecture';
import { staticTemplate, staticTemplateVariant, addInstances } from "./models";

export const MOD = 2.0;       // wall module width, measured
export const STOREY = 3.125;  // wall module height, measured

// The spans a roof exists for. A building cannot be 5m or 7m wide; asking for
// one silently gets the next size down, which is how a roof ends up floating
// half a metre proud of the wall it is supposed to sit on.
export const SPANS = [4, 6, 8] as const;
export const LENS = [4, 6, 8, 10, 12, 14] as const;

export type Skin = "Plaster" | "UnevenBrick" | "WoodBrick" | "WoodWear";
export type Tile = "RoundTiles" | "FlatTiles";

// A bare name is a village-kit piece; anything with a slash is a full path into
// public/models, so the same batcher places nature and the prop kit too.
const P = (f: string) => (f.includes("/") ? f : `town/${f}.gltf`);

interface Place {
  x: number; y: number; z: number; yaw: number; pitch?: number; roll?: number; scale?: number; tint?: [number, number, number];
  axes?: [number, number, number];   // per-axis scale, over `scale` (a roof stretched to a keep)
}
// keyed by "<file> <palette>": one thin-instance batch per model AND
// per palette, since a granite wall and a tan one are different templates
let batch = new Map<string, Place[]>();

// ── palettes ─────────────────────────────────────────────────────────────────
//
// The kit ships one red tile sheet and one tan brick sheet, and a per-instance
// tint is a multiply that can only darken them: a "slate" tint on the red roof
// is a darker red. So a city whose roofs are not red draws them from its OWN
// sheet (tools/assets/recolor_kit_tex.py makes one, keeping the tile detail
// and replacing the colour), and this is the switch. A palette maps a kit
// material NAME to the base-colour file to use instead; while one is set,
// every piece placed goes through a variant template whose matching materials
// are cloned with that sheet. Everything else -- trim, glass, rock -- stays
// the kit's own. Moonmere sets none and keeps its red.
//
//   setPalette("caerdun");  ...place pieces...  setPalette(null);
export type Palette = Record<string, string>;
const PALETTES: Record<string, Palette> = {
  // granite walls under cold slate: the garrison city
  caerdun: { MI_UnevenBrick: "T_UnevenBrick_BaseColor_granite.jpg", MI_FlatTiles: "T_FlatTiles_BaseColor_slate.jpg",
    MI_RoundTiles: "T_RoundTiles_BaseColor_slate.jpg" },
  // the round tile gone to moss under the grove
  heartwood: { MI_RoundTiles: "T_RoundTiles_BaseColor_moss.jpg", MI_FlatTiles: "T_FlatTiles_BaseColor_moss.jpg" },
};
let palette: string | null = null;
export function setPalette(key: string | null): void {
  if (key && !PALETTES[key]) throw new Error(`no palette ${key}`);
  palette = key;
}
// A palette's spatial cell, in metres, for place()'s culling batches: a city
// built under it gets one thin-instance mesh per cell per piece instead of
// one city-wide mesh nothing can cull. caerdun's is 96; a palette registered
// without one batches city-wide, as heartwood's always has.
const PALETTE_CELL: Record<string, number> = { caerdun: 96 };
export function registerPalette(key: string, p: Palette, cell?: number): void {
  PALETTES[key] = p;
  if (cell) PALETTE_CELL[key] = cell; else delete PALETTE_CELL[key];
}

// ── switchable groups ────────────────────────────────────────────────────────
//
// Pieces placed while a group is set batch apart from every other piece --
// their own template variant, keyed by the group in place of the spatial cell
// -- so the group can be hidden or shown whole without touching the rest of
// the kit: a Border Gate's leaves, shut for one character and open for the
// next (scene.ts setBorderGateOpen). The palette still applies. One draw per
// piece type in the group, so keep groups to the few pieces that must switch.
//
//   setPlaceGroup("gate_cf_gate");  ...place leaves...  setPlaceGroup(null);
let group: string | null = null;
const groupMeshes = new Map<string, Mesh[]>();
const groupShown = new Map<string, boolean>();
export function setPlaceGroup(key: string | null): void {
  if (key && /\s/.test(key)) throw new Error(`place group "${key}" has a space`);   // the batch key splits on spaces
  group = key;
}
// remembered, so a template still loading when the state changes takes it on arrival
export function setGroupShown(key: string, shown: boolean): void {
  groupShown.set(key, shown);
  for (const m of groupMeshes.get(key) || []) if (!m.isDisposed()) m.setEnabled(shown);
}
/** A new zone's groups start empty (scene.ts buildZone). */
export function resetPlaceGroups(): void { group = null; groupMeshes.clear(); groupShown.clear(); }

/** The base template, or the palette's variant of it. */
function templateFor(file: string, pal: string, cell = ""): Promise<Mesh | null> {
  if (!pal) return cell ? staticTemplateVariant(P(file), `cell:${cell}`, m => m) : staticTemplate(P(file));
  const map = PALETTES[pal];
  return staticTemplateVariant(P(file), `${pal}/${cell}`, (m) => {
    const sheet = map[m.name];
    if (!sheet || !(m instanceof PBRMaterial)) return m;
    const c = m.clone(`${m.name}#${pal}`);
    const old = m.albedoTexture as Texture | null;
    // the same sampling as the sheet it replaces: the glTF loader's textures
    // are NOT y-flipped, and a swap that took Texture's default flipped every
    // tile row on the roof
    const t = new Texture(`/models/town/${sheet}`, scene, old?.noMipmap ?? false, old?.invertY ?? false, old?.samplingMode);
    if (old) {
      t.wrapU = old.wrapU; t.wrapV = old.wrapV;
      t.coordinatesIndex = old.coordinatesIndex;
      t.uScale = old.uScale; t.vScale = old.vScale;
    }
    c.albedoTexture = t;
    return c;
  });
}

/**
 * Queue one kit piece at its own pivot. Flushed by flushTown().
 * `pitch` and `roll` tilt about the piece's own X and Z, which is what lays a
 * flat paving tile flush on a slope instead of leaving its corners in the air.
 * With yaw 0 the pair is just the surface gradient: pitch -atan(dy/dz),
 * roll atan(dy/dx).
 */
export function place(file: string, x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0, scale = 1, tint?: [number, number, number], axes?: [number, number, number]): void {
  let pal = palette ?? "";
  if (palette === 'caerdun') {
    if (file === 'Stairs_Exterior_SingleSideThick') yaw -= Math.PI / 2;
    const mapped = caerdunModule(file);
    if (!mapped) return;
    file = mapped;
  }
  // A city-wide thin-instance bound submits every house to every shadow
  // cascade. Spatial batches let the camera and shadow frusta cull districts.
  const cs = (palette && PALETTE_CELL[palette]) || 0;
  const cell = group ? `grp:${group}` : cs ? `${Math.floor(x/cs)},${Math.floor(z/cs)}` : "";
  const key = `${file} ${pal} ${cell}`;
  let l = batch.get(key);
  if (!l) { l = []; batch.set(key, l); }
  l.push({ x, y, z, yaw, pitch, roll, scale, tint, axes });
}

/** Resolve every queued piece into one thin-instance draw per model file. */
// A hook every flushed template is handed to while it is set: scene.ts sets
// it to lay snow on the kit pieces of a building raised in a snow zone.
let townSnow: ((t: Mesh) => void) | null = null;
export function setTownSnow(hook: ((t: Mesh) => void) | null): void { townSnow = hook; }

// The promise settles once every template this flush queued has been handled
// (instanced, skipped or failed), so a caller can work on the finished kit;
// the other callers ignore it. It never rejects: a template's own failure
// still surfaces as an uncaught rejection, as before, through `.finally`.
export function flushTown(): Promise<void> {
  const sceneAtCall = scene;
  const snow = townSnow;
  let left = batch.size, settle!: () => void;
  const settled = new Promise<void>((r) => (settle = r));
  const tick = () => { if (--left === 0) settle(); };
  if (!left) settle();
  for (const [key, list] of batch) {
    const [file, pal, cell] = key.split(" ");
    templateFor(file, pal, cell).then((t) => {
      if (!t || sceneAtCall !== scene) return;
      addInstances(t, list.map((p) => Matrix.Compose(
        p.axes ? new Vector3(p.axes[0], p.axes[1], p.axes[2]) : p.scale && p.scale !== 1 ? new Vector3(p.scale, p.scale, p.scale) : Vector3.OneReadOnly,
        Quaternion.RotationYawPitchRoll(p.yaw, p.pitch ?? 0, p.roll ?? 0),
        new Vector3(p.x, p.y, p.z))));
      // Paving is flat on the ground: it can never cast a shadow anyone would
      // see, and there are tens of thousands of tiles once the upper terraces
      // are surfaced. Putting them in the cascade pass costs the whole city's
      // frame time for nothing. They still RECEIVE shadows, which is the half
      // that matters -- a house has to darken the stones in front of it.
      // PER-INSTANCE COLOUR, which is how one roof in a batch is weathered and
      // the next is not. RGB only -- no alpha, so the mesh stays opaque and out
      // of the transparent pass.
      //
      // The trap: thinInstanceSetBuffer("color") binds as `instanceColor` and
      // sets #define INSTANCESCOLOR, but Babylon only defines VERTEXCOLOR when
      // the GEOMETRY carries a colour attribute -- and a thin-instance buffer is
      // not geometry. Without a white base attribute the instance colour is
      // computed and then discarded. MEASURED in the live scene.
      if (list.some((p) => p.tint)) {
        const col = new Float32Array(list.length * 4);
        for (let i = 0; i < list.length; i++) {
          const c = list[i].tint ?? [1, 1, 1];
          col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = 1;
        }
        if (!t.isVerticesDataPresent("color")) {
          t.setVerticesData("color", new Float32Array(t.getTotalVertices() * 4).fill(1), false, 4);
        }
        // The buffer covers EVERY instance the template holds, not just this
        // batch: a second flush onto the same template (a zone that flushes
        // per building) otherwise left the colour buffer one batch short of
        // the matrices, and the draw failed -- "vertex buffer is not big
        // enough", MEASURED on the remade North Road inn. Earlier colours are
        // kept; this batch's go at the end, where addInstances put them.
        const all = new Float32Array(t.thinInstanceCount * 4).fill(1);
        const prev = (t as any).__instColor as Float32Array | undefined;
        if (prev) all.set(prev.subarray(0, Math.min(prev.length, all.length - col.length)));
        all.set(col, all.length - col.length);
        (t as any).__instColor = all;
        t.thinInstanceSetBuffer("color", all, 4);
        t.useVertexColors = true;
      }
      if (cell.startsWith("grp:")) {
        const g = cell.slice(4);
        let list = groupMeshes.get(g);
        if (!list) { list = []; groupMeshes.set(g, list); }
        list.push(t);
        if (groupShown.has(g)) t.setEnabled(groupShown.get(g)!);
      }
      if (snow) snow(t);
      if (/^Floor_/.test(file)) t.receiveShadows = true;
      else if (/Grass|Flower|Plant|Clover|Pebble|RockPath/i.test(file)) removeShadowCaster(t);
      else addShadowCaster(t);
      glowGlass(t);
    }).finally(tick);
  }
  batch = new Map();
  return settled;
}

// The kit ships one MI_WindowGlass material across every window and door pane.
// Lighting it is what makes a night city read as inhabited rather than as a
// model of one, and it has to happen on the template because every window in
// the zone is an instance of the same few meshes.
const caerdunLitGlass=new WeakSet<PBRMaterial>();
function glowGlass(t: Mesh): void {
  const ms = (t.material as any)?.subMaterials ?? [t.material];
  for (const m of ms) {
    if (m instanceof PBRMaterial && /WindowGlass/i.test(m.name)) {
      if (m.name.startsWith("CD_")) {
        if(!caerdunLitGlass.has(m)){
          caerdunLitGlass.add(m);
          scene.onBeforeRenderObservable.add(()=>{
            const night=1-Math.min(1,Math.max(0,Math.sin(dayFrac()*Math.PI*2)*2.2));
            m.emissiveColor.set(.008+night*.22,.012+night*.095,.01+night*.023);
          });
        }
        continue;
      }
      m.emissiveColor = new Color3(0.42, 0.30, 0.11);
    }
  }
}

// ── one building ─────────────────────────────────────────────────────────────

// The face a door is cut into: the +z gable end by default, or a long side for
// a building whose ridge runs along the street.
export type Face = "pz" | "nz" | "px" | "nx";
// Per face: its outward normal `n` and the direction a wall module's local +x
// runs along it, both in HOUSE coordinates, and the yaw added to the house's
// so that the module's local +z is that normal. Local +z maps to
// (sin yaw, cos yaw), local +x to (cos yaw, -sin yaw) -- so a quarter turn
// sends +x to -z, which is why the long faces' `u` point the way they do.
const FACES: Record<Face, { n: [number, number]; u: [number, number]; add: number }> = {
  pz: { n: [0, 1], u: [1, 0], add: 0 },
  nz: { n: [0, -1], u: [-1, 0], add: Math.PI },
  px: { n: [1, 0], u: [0, -1], add: Math.PI / 2 },
  nx: { n: [-1, 0], u: [0, 1], add: -Math.PI / 2 },
};

export interface HouseSpec {
  kit?: "caerdun";
  cx: number; cz: number;      // footprint centre, world metres
  yaw: number;                 // 0 puts the RIDGE along +z and the gable ends on +/-z
  span: 4 | 6 | 8 | 10 | 12 | 14;             // across the ridge
  len: 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18;  // along it -- see ROOF_LENS, not every pair exists
  storeys: 1 | 2 | 3;
  base?: Skin;                 // ground floor; masonry by default, as in the reference
  skin?: Skin;                 // storeys above it
  tile?: Tile;
  y?: number;                  // floor height; defaults to the ground at the door plus RAISE
  door?: boolean | Face;       // false for none; true is the +z gable end
  raise?: number;              // how far the floor stands above the doorstep, default RAISE
  steps?: "narrow" | "wide" | "none";
  interior?: "civic";
  walkable?: boolean;          // a real interior: the stair and the floors above are levels
  balcony?: boolean;
  chimney?: boolean;
  seed?: number;
}

// THE FLOOR IS RAISED. Every house in the reference village stands on a course
// of cut stone with a stair up to its door, and a house whose floor is the
// ground reads as a shed (Philip: "the current buildings are too low to the
// ground, they need to be lifted"). One metre because Stairs_Exterior_Platform
// is a 2x2x1m block and Stairs_Exterior_Straight climbs exactly 1.000m
// (MEASURED): the foundation and the doorstep are the same course.
export const RAISE = 1.0;
// The jetty: how far the upper storeys stand proud of the ground floor. 0.25m,
// and it is the single most valuable quarter metre in the kit -- it is what
// stops a building reading as an extruded rectangle, and it is what every
// upper floor in the reference village does. ONE step, the same for every
// upper storey, not a step per storey: a wall module is 2m and cannot be
// stretched, so a face pushed out 0.5m no longer reached the face round the
// corner and every upper corner had a slit you could see daylight through
// (Philip: "the corners are not fully closed"). At 0.25 the two faces still
// overlap by 6cm and the wide quoin covers the outer notch.
const JETTY = 0.25;
// Wall modules thicken INWARD from their line: z in [-0.314, 0.092] local, +z
// out. So the outer face is 0.09 proud of the wall line and the inner face
// 0.31 behind it, and everything that has to meet a wall uses one of these.
const WALL_OUT = 0.09, WALL_IN = 0.31;

// The solid roofs that exist, by span (MEASURED off the pack: Roof_<tile>_WxL).
// A 4m span stops at 8m long and an 8m span starts there. Asking for a pair
// that is not here used to place nothing, which is how a street came to have
// roofless houses on it (Philip: "some buildings do not have roofs... why?").
export const ROOF_LENS: Record<number, number[]> = { 4: [4, 6, 8], 6: [4, 6, 8, 10, 12, 14, 16, 18], 8: [8, 10, 12, 14, 16, 18], 10: [8, 10, 12, 14, 16, 18] };
// The roof SURFACE, across the span: how far above the eave line (the roof
// piece's origin) the tiles are at |x| metres from the ridge. MEASURED off the
// Roof_* meshes (max vertex y per 0.25m bin, mid-length, both tile types --
// the rows make it a sawtooth, so this is a line through them) -- and the
// pitch is NOT one number: 1.30/m on the 4m roofs, 1.33 on the 6m, 1.05 on
// the 8m. Anything that has to stand on a roof (the chimney) asks this.
const ROOF_RISE: Record<number, [number, number]> = { 4: [1.83, 1.30], 6: [3.40, 1.33], 8: [3.81, 1.05] };
export function roofRise(span: number, ax: number): number {
  const [at1, pitch] = ROOF_RISE[span] ?? ROOF_RISE[8];
  return at1 - pitch * (Math.abs(ax) - 1);
}
export function roofFits(span: number, len: number): boolean {
  return (ROOF_LENS[span] || []).includes(len);
}
/** The nearest length a roof exists for, never longer than asked. */
export function fitLen(span: number, len: number): HouseSpec["len"] {
  const ok = ROOF_LENS[span] || [8];
  let best = ok[0];
  for (const l of ok) if (l <= len) best = l;
  return best as HouseSpec["len"];
}

/** Local -> world, about the house's own centre. */
function xf(s: { cx: number; cz: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return [s.cx + lx * c + lz * sn, s.cz - lx * sn + lz * c];
}

/** The ground you can see, at a house-local point. */
function groundAt(s: { cx: number; cz: number; yaw: number }, lx: number, lz: number): number {
  const [px, pz] = xf(s, lx, lz);
  return buildApi.surface(px, pz);
}

export interface HouseRecord { spec: HouseSpec; y0: number; walkable: boolean; door: [number, number, number, number] | null; stairs: [number, number, number, number, number, number][] }
const houseRecords: HouseRecord[] = [];
export function inspectHouses(): readonly HouseRecord[] { return houseRecords; }

export function makeHouse(spec: HouseSpec): void {
  if (palette === "caerdun") { houseRecords.push(makeCaerdunHouse(spec)); return; }
  const storey = STOREY;
  const s = { ...spec, len: fitLen(spec.span, spec.len) };
  const rnd = seededRand(s.seed ?? 1);
  const base: Skin = s.base ?? "UnevenBrick";
  const skin: Skin = s.skin ?? "WoodWear";
  const tile: Tile = s.tile ?? "RoundTiles";
  const hw = s.span / 2, hl = s.len / 2;
  const nSide = s.len / MOD, nEnd = s.span / MOD;
  const doorFace: Face | null = s.door === false ? null : (s.door === true || s.door === undefined ? "pz" : s.door);
  // Ten metres long at least: the flight is 4.35m of run and wants a landing
  // row behind it and a hall in front (Philip: "all the stairs end right into
  // the wall... lengthen each home with stairs, so that the top of the stairs
  // has some clearance")
  const walkable = s.walkable ?? (s.storeys > 1 && s.len >= 10 && s.span >= 6);

  // Every wall module: which face, its centre on the wall line, and whether it
  // is the door. The door is the middle module of its face, ground floor only.
  const modules = (face: Face): { lx: number; lz: number; door: boolean }[] => {
    const out: { lx: number; lz: number; door: boolean }[] = [];
    const end = face === "pz" || face === "nz";
    const n = end ? nEnd : nSide, h = end ? hw : hl, at = end ? hl : hw;
    const sign = face === "pz" || face === "px" ? 1 : -1;
    const mid = Math.floor(n / 2);
    for (let k = 0; k < n; k++) {
      const a = -h + 1 + k * MOD;
      out.push(end ? { lx: a, lz: sign * at, door: k === mid } : { lx: sign * at, lz: a, door: k === mid });
    }
    return out;
  };

  // THE FLOOR HEIGHT. Raised RAISE above the ground at the doorstep, and never
  // below the highest ground under the footprint plus a hand: a house on a
  // slope keeps its floor level and grows a taller foundation and a longer
  // stair on the low side, which is the reference village's left-hand house
  // exactly. The old rule seated the floor on the centre and let the corners
  // fall where they may, which is how a house came to float over its shadow.
  // sampled across the whole footprint, not just its edge: the ground under
  // the middle of the room has to stay under the floor too
  let gmax = -Infinity;
  for (let lx = -hw; lx <= hw + 0.01; lx += 2) for (let lz = -hl; lz <= hl + 0.01; lz += 2) {
    gmax = Math.max(gmax, groundAt(s, lx, lz));
  }
  let gDoor = gmax;
  if (doorFace) {
    const f = FACES[doorFace];
    const m = modules(doorFace).find((q) => q.door)!;
    gDoor = groundAt(s, m.lx + f.n[0] * 2.6, m.lz + f.n[1] * 2.6);
  }
  const y0 = s.y ?? Math.max(gDoor + (s.raise ?? RAISE), gmax + 0.15);
  const record: HouseRecord = { spec: s, y0, walkable, door: null, stairs: [] };
  houseRecords.push(record);

  // THE FOUNDATION: courses of cut stone under every wall module, from the
  // floor down to whatever the ground does there, so the walls stand on
  // masonry however the site falls. The piece is Stairs_Exterior_SingleSideThick
  // -- a solid 2 x 1 x 0.4m box, exactly a wall's thickness, long axis local z
  // -- laid under the wall line. NOT Stairs_Exterior_Platform: MEASURED, that
  // "block" is a hollow shell open on its two z sides (a top slab on two side
  // walls, made to have stairs hung on it), and under a wall seen from the
  // street it showed its own inside as a row of dark wedges.
  for (const face of ["pz", "nz", "px", "nx"] as Face[]) {
    const f = FACES[face];
    for (const m of modules(face)) {
      const push = (WALL_IN - WALL_OUT) / 2;                 // centred in the wall's thickness
      const lx = m.lx - f.n[0] * push, lz = m.lz - f.n[1] * push;
      const [bx, bz] = xf(s, lx, lz);
      const g = buildApi.surface(bx, bz);
      for (let yy = y0 - 1; yy + 1 > g - 0.05; yy -= 1) place("Stairs_Exterior_SingleSideThick", bx, yy, bz, s.yaw + f.add + Math.PI / 2);
    }
  }

  // THE WALLS, storey by storey. Every storey above the ground floor overhangs
  // the one below by the jetty.
  for (let st = 0; st < s.storeys; st++) {
    const y = y0 + st * storey;
    const w: Skin = st === 0 ? base : skin;
    const out = st === 0 ? 0 : JETTY;
    for (const face of ["pz", "nz", "px", "nx"] as Face[]) {
      const f = FACES[face];
      const yaw = s.yaw + f.add;
      for (const m of modules(face)) {
        const [wx, wz] = xf(s, m.lx + f.n[0] * out, m.lz + f.n[1] * out);
        if (st === 0 && face === doorFace && m.door) {
          place(`Wall_${w}_Door_Round`, wx, y, wz, yaw);
          place(w === "UnevenBrick" ? "DoorFrame_Round_Brick" : "DoorFrame_Round_WoodDark", wx, y, wz, yaw);
          // The leaf hangs on its HINGE, which is this model's origin -- it
          // measures x in [-0.046, 1.074], so it is not centred like everything
          // else in the kit and centring it swings the door through the jamb.
          // A walkable house stands its door OPEN, swung inward: the leaf is a
          // thin instance and cannot animate, and walking through a shut door
          // is worse than an open one.
          const hinge = .52;
          const [dx, dz] = xf(s, m.lx - f.u[0] * hinge + f.n[0] * 0.06, m.lz - f.u[1] * hinge + f.n[1] * 0.06);
          place(`Door_${1 + Math.floor(rnd() * 8) % 8}_Round`, dx, y, dz, yaw + (walkable ? 1.45 : 0));
          // and a lantern on a bracket beside most doors: the props kit's
          // Lantern_Wall (MEASURED: origin on the wall plane, y 0.08..1.42,
          // arm 1.25 out), hung at head height on the next module along
          if (rnd() < 0.65) {
            const [lx2, lz2] = xf(s, m.lx + f.u[0] * 1.3 + f.n[0] * WALL_OUT, m.lz + f.u[1] * 1.3 + f.n[1] * WALL_OUT);
            place("props/Lantern_Wall.gltf", lx2, y + 1.3, lz2, yaw, 0, 0, 0.85);
          }
          continue;
        }
        const p = wallPiece(w, st, rnd);
        place(p.wall, wx, y, wz, yaw);
        if (p.fill) place(p.fill, wx, y, wz, yaw);
      }
    }
    // corner quoins, which are what actually hide the jetty's step -- and an
    // interior post in every corner, because two 2m modules meeting at right
    // angles leave their open ends showing at the inside corner
    // (Corner_Interior_Big is an L-post filling its own +x/-z quadrant, so a
    // quarter turn per corner points it into the room)
    const ex = hw + out, ez = hl + out;
    for (const [lx, lz, add] of [[ex, ez, 0], [-ex, ez, Math.PI / 2], [-ex, -ez, Math.PI], [ex, -ez, -Math.PI / 2]] as [number, number, number][]) {
      const [wx, wz] = xf(s, lx, lz);
      place(st === 0 ? "Corner_Exterior_Brick" : "Corner_ExteriorWide_Wood", wx, y, wz, s.yaw + add);
      const sx = Math.sign(lx), sz = Math.sign(lz);
      const [ix, iz] = xf(s, lx - sx * WALL_IN, lz - sz * WALL_IN);
      place("Corner_Interior_Big", ix, y, iz, s.yaw + add + Math.PI / 2);
    }
  }

  // THE INTERIOR: a floor per storey, and for a walkable house the stair up
  // out of each one and the hole it rises through. Stair_Interior_Solid is the
  // TREADS (4.35m of run, 3.03m of rise) and Stair_Interior_Rails is the rail
  // that sits on it -- MEASURED, and the first pass placed the rail alone,
  // which is a banister climbing over nothing (Philip: "do not actually have
  // any steps, just hand rails"). Both run along the length of the building
  // against the +x wall, climbing toward the back, origin at the LOW end. The
  // high end stops a whole tile row short of the back wall: that row is the
  // landing you step off onto.
  const stairX = hw - WALL_IN - 0.9;                 // 0.86 half-width, against the inner face
  const stairHighZ = -hl + 2.0, stairLowZ = stairHighZ + 4.35;
  const hasStair = walkable && s.storeys > 1;
  // the stairwell, in tiles: the last column (+x) of rows 1 and 2 (-z), so row
  // 0 stays as the landing
  const holeTile = (i: number, j: number) => hasStair && j === nEnd - 1 && i >= 1 && i < 3;
  for (let st = 0; st < s.storeys; st++) {
    const y = y0 + st * storey;
    for (let i = 0; i < nSide; i++) {
      for (let j = 0; j < nEnd; j++) {
        if (st > 0 && holeTile(i, j)) continue;
        const [fx, fz] = xf(s, -hw + 1 + j * MOD, -hl + 1 + i * MOD);
        place(st === 0 ? "Floor_Brick" : "Floor_WoodDark", fx, y + (st === 0 ? 0.012 : 0), fz, s.yaw);
      }
    }
    if (hasStair && st < s.storeys - 1) {
      const [sx, sz] = xf(s, stairX, stairLowZ);
      place("Stair_Interior_Solid", sx, y + 0.02, sz, s.yaw);
      place("Stair_Interior_Rails", sx, y + .04, sz, s.yaw);
      const [tx, tz] = xf(s, stairX, stairHighZ);
      buildApi.addRamp(sx, sz, y, tx, tz, y + storey, 0.95);
      record.stairs.push([sx, sz, y, tx, tz, y + storey]);
      // and the rail down its open side, so nobody steps off it into the room
      // (the wall is the other side). Only on this flight's own levels.
      // It stops 1.3m short of the top: that is the landing, and the way off
      // the stair onto the floor is sideways there.
      const [rx, rz] = xf(s, stairX - 0.95, (stairLowZ + stairHighZ + 1.3) / 2);
      buildApi.addBoxCollider(rx, rz, 0.1, (stairLowZ - stairHighZ - 1.3) / 2, s.yaw, y + storey + 1.0, y - 0.2);
      // the rail round the stairwell on the floor above: along the well's inner
      // long edge (leaving the head of the stair open) and across its low end.
      // HoleCover_Straight's rail lies at its own local z = -1 (MEASURED).
      const yUp = y + storey;
      const [r1x, r1z] = xf(s, hw - 1, -hl + 7);
      place("HoleCover_Straight", r1x, yUp, r1z, s.yaw);
      const [r2x, r2z] = xf(s, hw - 1, -hl + 4.9);
      place("HoleCover_Straight", r2x, yUp, r2z, s.yaw + Math.PI / 2);
      const [c1x, c1z] = xf(s, hw - 1, -hl + 6);
      buildApi.addBoxCollider(c1x, c1z, 1.0, 0.12, s.yaw, yUp + 1.6, yUp - 0.6);
      const [c2x, c2z] = xf(s, hw - 2, -hl + 4.9);
      buildApi.addBoxCollider(c2x, c2z, 0.12, 1.1, s.yaw, yUp + 1.6, yUp - 0.6);
    }
    // the level itself: the whole floor, minus the well the stair comes up
    if (walkable && st > 0) {
      const [hx, hz] = xf(s, hw - 1, -hl + 4);
      buildApi.addDeck(s.cx, s.cz, hw - 0.3, hl - 0.3, s.yaw, y,
        hasStair ? [buildApi.obb(hx, hz, 1.0, 2.0, s.yaw)] : []);
    }
  }

  const eaveY = y0 + s.storeys * storey;
  const outT = s.storeys > 1 ? JETTY : 0;
  // One solid roof rather than the modular slices: the spans and lengths this
  // assembler allows are exactly the ones a solid roof exists for, and it is
  // one draw instead of len/2 of them.
  // WEATHERING, per building. Every roof in the kit is the same red sheet, so a
  // street of them reads as one material repeated rather than as a town whose
  // roofs were laid in different decades. A per-instance multiply is the whole
  // fix: it can only darken (see TERRAIN_TEX's note), which is exactly right
  // for tile that has sat under weather -- some roofs stay bright, some go to
  // a dull brick, a few to near-brown, and the mossy ones lose a little red.
  const wr = .62 + rnd() * .38;
  const roofTint: [number, number, number] = rnd() < 0.22
    ? [wr * 0.88, wr * 0.96, wr * 0.82]   // moss has crept over this one
    : [wr, wr * (0.9 + rnd() * 0.12), wr * (0.86 + rnd() * 0.16)];
  place(`Roof_${tile}_${s.span}x${s.len}`, s.cx, eaveY, s.cz, s.yaw, 0, 0, 1, roofTint);
  // and the gable triangle at each end, which the roof planes do not close
  for (const [lz, add] of [[hl + outT, 0], [-hl - outT, Math.PI]] as [number, number][]) {
    const [gx, gz] = xf(s, 0, lz);
    place(`Roof_Front_${s.storeys > 1 ? "Wood" : "Brick"}${s.span}`, gx, eaveY, gz, s.yaw + add, 0, 0, 1, roofTint);
  }

  // THE BALCONY. Balcony_Simple_Straight is a RAIL and nothing else
  // (MEASURED: z 0.9..1.1, no deck), and the first pass hung it a metre off
  // the wall over nothing (Philip: "unfinished balconies. Missing floor and
  // side rails"). A balcony is a floor tile per module projecting 2m off the
  // top storey's front, the rail along its outer edge, a rail across each end
  // (the same piece a quarter turn round), and a bracket under each tile.
  if (s.balcony && s.storeys > 1) {
    const y = y0 + (s.storeys - 1) * storey;
    const ez = hl + JETTY;
    for (let j = 0; j < nEnd; j++) {
      const lx = -hw + 1 + j * MOD;
      const [bx, bz] = xf(s, lx, ez + 1.0);
      place("Floor_WoodDark", bx, y, bz, s.yaw);
      place("Balcony_Simple_Straight", bx, y, bz, s.yaw);
      if (j === nEnd - 1) place("Balcony_Simple_Straight", bx, y, bz, s.yaw + Math.PI / 2);
      if (j === 0) place("Balcony_Simple_Straight", bx, y, bz, s.yaw - Math.PI / 2);
      // Prop_Support: a strut from the wall (z 0, y 1.21) up and out to
      // (z 1.92, y 2.92) -- so its origin sits 2.92 under the floor
      const [px, pz] = xf(s, lx, ez);
      place("Prop_Support", px, y - 2.92, pz, s.yaw);
    }
  }
  // VINES. The reference village has them up half its walls and they are what
  // stops a timber gable reading as a flat panel. Hung on the gable ends only:
  // the long faces are the street frontages and carry the windows.
  if ((s.seed ?? 0) % 3 !== 0) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const st = 1 + Math.floor(rnd() * Math.max(1, s.storeys - 1));
      const lx = -hw + 0.6 + rnd() * (s.span - 1.2);
      const front = rnd() < 0.5;
      const [vx, vz] = xf(s, lx, (front ? 1 : -1) * (hl + outT + 0.08));
      // Prop_Vine* hang DOWN from their origin (y in [-2.12, 0.48] measured),
      // so the origin goes at the storey they hang from, not at their foot.
      place(`Prop_Vine${1 + Math.floor(rnd() * 9) % 9}`, vx, y0 + st * storey + 2.6, vz,
        s.yaw + (front ? 0 : Math.PI));
    }
  }
  // THE CHIMNEY sits ON THE ROOF SLOPE, and the kit's Prop_Chimney knows it:
  // its foot is cut at the roof's pitch (MEASURED: the base is at local -x
  // and y 0, the +x side starts 1.21m up -- a 1.27 slope, the kit's roofs').
  // So the low foot must face DOWNHILL (the eave, house +x for a chimney on
  // the +x slope), which is a half-turn from the house's own yaw, and the
  // foot goes at the roof surface where the foot lands. Placed the other way
  // round and sunk to hide the notch, the whole lower body hung inside the
  // attic (Philip: "chimney is poking through the interior of the house").
  if (s.chimney) {
    const lx = hw - 0.9;
    const [px, pz] = xf(s, lx, -hl + 1.4);
    place("Prop_Chimney", px, eaveY + roofRise(s.span, lx + 0.5) - 0.35, pz, s.yaw + Math.PI);
  }

  // COLLISION: four walls, not one block, so the building is a shell you can
  // walk into. Only enterable houses leave a gap in the door face: shell
  // houses render a permanently shut leaf, so their wall must block entry.
  //
  // Oriented boxes, because a street at an angle puts the house at an angle and
  // an axis-aligned box around a diagonal wall either seals the doorway or
  // leaves the corners open. See boxColliders in scene.ts.
  const top = y0 + s.storeys * storey;
  if (walkable) buildApi.addCameraRoom({ ...buildApi.obb(s.cx,s.cz,hw-WALL_IN,hl-WALL_IN,s.yaw), y0, y1: top });
  const T = 0.4;                                   // half-thickness of a wall
  const wall = (lx: number, lz: number, hx: number, hz: number, bottom = -1e9) => {
    const [wx, wz] = xf(s, lx, lz);
    buildApi.addBoxCollider(wx, wz, hx, hz, s.yaw, top, bottom);
  };
  for (const face of ["pz", "nz", "px", "nx"] as Face[]) {
    const end = face === "pz" || face === "nz";
    const sign = face === "pz" || face === "px" ? 1 : -1;
    const h = end ? hw : hl, at = end ? hl : hw;
    const seg = (a0: number, a1: number) => {
      const c = (a0 + a1) / 2, half = (a1 - a0) / 2;
      if (half < 0.05) return;
      if (end) wall(c, sign * at, half, T); else wall(sign * at, c, T, half);
    };
    if (face === doorFace && walkable) {
      const m = modules(face).find((q) => q.door)!;
      const dc = end ? m.lx : m.lz;
      seg(-h, dc - 1.05); seg(dc + 1.05, h);
      // The opening belongs to the ground-floor arch, not every storey above.
      // Measured crown: 2.473m in the kit.
      const doorTop = y0 + 2.473;
      if (end) wall(dc,sign*at,1.05,T,doorTop); else wall(sign*at,dc,T,1.05,doorTop);
    } else {
      seg(-h, h);
    }
  }

  // THE DOORSTEP. A flight of the kit's exterior stair from the threshold down
  // to the ground, and the ramp that makes it walkable.
  if (doorFace && s.steps !== "none") {
    const f = FACES[doorFace];
    const m = modules(doorFace).find((q) => q.door)!;
    const [tx, tz] = xf(s, m.lx + f.n[0] * WALL_OUT, m.lz + f.n[1] * WALL_OUT);
    record.door = [tx, tz, y0, s.yaw + f.add];
    makeFlight(tx, tz, s.yaw + f.add, y0, s.steps === "wide" ? 3 : 1);
  }
  // Standing room: a flat floor at the ground storey, so the inside is walkable
  // even where the terrain under the foundation is a terrace riser. Axis-
  // aligned, which for an interior is close enough -- it only has to cover the
  // floor -- and it is what the level-less lookups (NPCs, the camera) see.
  const fi = Math.min(hw, hl) - 0.7;
  buildApi.addFlatZone(s.cx - fi, s.cx + fi, s.cz - fi, s.cz + fi, y0);
  buildApi.addDeck(s.cx, s.cz, hw - 0.3, hl - 0.3, s.yaw, y0);
  // The footprint is axis-aligned, so a turned house records the box round its
  // turned walls: (span, len) as given drew every yawed house the wrong way
  // round on the map (the North Road inn, the Hunting Lodge, a barn at 1.4 rad)
  // and kept the meadow off the wrong strip.
  const c = Math.abs(Math.cos(s.yaw)), sn = Math.abs(Math.sin(s.yaw));
  buildApi.footprint(s.cx, s.cz, s.span * c + s.len * sn, s.span * sn + s.len * c);
}

// ── a garden ─────────────────────────────────────────────────────────────────
//
// The yard of a house whose owner keeps it: flower beds along the walls, a
// hedge or two at the corners, a small tree, petals on the ground, and now
// and then a picket fence round the lot. Everything stays ON THE HOUSE'S PAD
// (within 2.2m of the wall line, where the city levelled the ground), off
// the door face (the flight and the lantern live there) and off whatever the
// caller's `avoid` names, roads and neighbours -- a hedge in a doorway or a
// tree growing out of a lane is worse than no garden.
//
// Picked by measured colour, like the verge: the Flower_*_Group models are
// green foliage with blooms on top (#87ac24, #80a21b, #919829), Flower_4 is
// yellow, Bush_Common_Flowers is a flowering shrub, Bush_Long_* are the green
// hedges, and the Petal_* are exactly the fallen petals a flower bed drops.
// Everything is scaled to garden size: the groups stand 1.5-2.5m in the pack.
const GARDEN_BED: [string, number][] = [
  ["nature/Flower_1_Group.gltf", 0.5], ["nature/Flower_3_Group.gltf", 0.42], ["nature/Flower_7_Group.gltf", 0.5],
  ["nature/Flower_4_Group.gltf", 0.36], ["nature/Bush_Common_Flowers.gltf", 0.55], ["nature/Plant_5.gltf", 0.6],
  ["nature/Clover_2.gltf", 0.5],
];
const GARDEN_PETALS = ["nature/Petal_1.gltf", "nature/Petal_2.gltf", "nature/Petal_5.gltf", "nature/Petal_3.gltf"];
const GARDEN_TREES = ["nature/CommonTree_1.gltf", "nature/CommonTree_5.gltf", "nature/CommonTree_3.gltf"];

export function makeGarden(h: HouseSpec, opts: { seed?: number; avoid?: (x: number, z: number) => boolean } = {}): void {
  const rnd = seededRand((opts.seed ?? h.seed ?? 1) * 31 + 7);
  const len = fitLen(h.span, h.len);
  const hw = h.span / 2, hl = len / 2;
  const doorFace: Face = h.door === false || h.door === undefined || h.door === true ? "pz" : h.door;
  // a spot is good when it is off the roads and on ground flat enough that a
  // bed does not hang off a bank
  const ok = (x: number, z: number): boolean => {
    if (opts.avoid && opts.avoid(x, z)) return false;
    const g = buildApi.surface(x, z);
    return Math.abs(buildApi.surface(x + 0.8, z) - g) < 0.45 && Math.abs(buildApi.surface(x, z + 0.8) - g) < 0.45;
  };
  const put = (file: string, lx: number, lz: number, sc: number, yOff = -0.04): boolean => {
    const [x, z] = xf(h, lx, lz);
    if (!ok(x, z)) return false;
    place(file, x, buildApi.surface(x, z) + yOff, z, rnd() * Math.PI * 2, 0, 0, sc);
    return true;
  };
  // the three faces that are not the door: beds along each, at 0.6-1.1 out
  const faces = (["pz", "nz", "px", "nx"] as Face[]).filter((f) => f !== doorFace);
  for (const face of faces) {
    const f = FACES[face];
    const end = face === "pz" || face === "nz";
    const half = end ? hw : hl, at = end ? hl : hw;
    const sign = face === "pz" || face === "px" ? 1 : -1;
    for (let a = -half + 0.7; a <= half - 0.7; a += 1.4) {
      if (rnd() > 0.7) continue;
      const out = 0.6 + rnd() * 0.5;
      const lx = end ? a : sign * (at + out), lz = end ? sign * (at + out) : a;
      const [file, sc] = GARDEN_BED[Math.floor(rnd() * GARDEN_BED.length) % GARDEN_BED.length];
      if (put(file, lx, lz, sc * (0.85 + rnd() * 0.3)) && rnd() < 0.5) {
        // and a few petals fallen in front of the bed
        put(GARDEN_PETALS[Math.floor(rnd() * GARDEN_PETALS.length) % GARDEN_PETALS.length],
          lx + f.n[0] * 0.7, lz + f.n[1] * 0.7, 0.8 + rnd() * 0.4, -0.02);
      }
    }
  }
  // a hedge at one or two back corners, and a small tree at one of them
  const back: Face = doorFace === "pz" ? "nz" : doorFace === "nz" ? "pz" : doorFace === "px" ? "nx" : "px";
  const bn = FACES[back].n;
  const corners: [number, number][] = back === "pz" || back === "nz"
    ? [[hw + 1.3, bn[1] * (hl + 1.3)], [-(hw + 1.3), bn[1] * (hl + 1.3)]]
    : [[bn[0] * (hw + 1.3), hl + 1.3], [bn[0] * (hw + 1.3), -(hl + 1.3)]];
  const treeAt = Math.floor(rnd() * 2);
  corners.forEach(([lx, lz], i) => {
    if (i === treeAt) {
      const [x, z] = xf(h, lx * 1.15, lz * 1.15);
      if (ok(x, z)) {
        const sc = 0.5 + rnd() * 0.18;
        place(GARDEN_TREES[Math.floor(rnd() * GARDEN_TREES.length) % GARDEN_TREES.length], x, buildApi.surface(x, z) - 0.1, z, rnd() * 6.3, 0, 0, sc);
        buildApi.addCircleCollider(x, z, 0.35);
      }
    } else if (rnd() < 0.7) {
      put(rnd() < 0.5 ? "nature/Bush_Long_1.gltf" : "nature/Bush_Long_2.gltf", lx, lz, 0.5 + rnd() * 0.15);
    }
  });
  // a picket fence along the back of the lot, one house in three
  if (rnd() < 0.35) {
    const f = FACES[back];
    const end = back === "pz" || back === "nz";
    const half = end ? hw : hl, at = end ? hl : hw;
    const sign = back === "pz" || back === "px" ? 1 : -1;
    const [sx, sz] = end ? xf(h, -half + 1, sign * (at + 2.0)) : xf(h, sign * (at + 2.0), -half + 1);
    const u = end ? [f.u[0], f.u[1]] : [f.u[0], f.u[1]];
    const [ux, uz] = end ? xf({ cx: 0, cz: 0, yaw: h.yaw }, u[0], u[1]) : xf({ cx: 0, cz: 0, yaw: h.yaw }, u[0], u[1]);
    const m = Math.hypot(ux, uz) || 1;
    makeFenceRun(sx, sz, ux / m, uz / m, Math.floor(half), "fence", { blocked: (x, z) => !ok(x, z) });
  }
}

// ── masonry ──────────────────────────────────────────────────────────────────
//
// A column of the kit's 2x2x1 stone block from `top` down to the ground: the
// mass under a quay, a mole, a causeway, a flight of steps. MEASURED:
// Stairs_Exterior_Platform is NOT a solid block. It is a top slab on two side
// walls -- solid on its +-x faces, OPEN on its +-z faces (it is made to have
// stairs hung on it). Stacked with the open side toward a viewer it shows its
// own inside as a row of dark wedges, which is how every house foundation
// looked before the foundation moved to SingleSideThick. So: a block's yaw
// puts its solid faces on +-x, and any +-z face that will be SEEN is named in
// `exposed` and gets a skin of Stairs_Exterior_SingleSideThick (a solid
// 2 x 1 x 0.4 box) flush over it. Faces buried against a neighbour need none.
export function makeMasonry(x: number, z: number, top: number, yaw: number,
  opts: { exposed?: ("pz" | "nz")[]; exposedAt?: number; floor?: number; ground?: (x: number, z: number) => number } = {}): void {
  const ground = (opts.ground ?? buildApi.ground)(x, z);
  const floor = opts.floor ?? -1e9;
  const sx = Math.sin(yaw), cz = Math.cos(yaw);         // local +z in world
  // where the skin hangs: 0.8 puts a 0.4 slab flush inside the block's own
  // face; a caller whose blocks stand a little apart (a flight's, at the
  // tread pitch of 2.08) pushes it out to cover the slit
  const at = opts.exposedAt ?? 0.8;
  for (let yy = top - 1; yy + 1 > ground - 0.05 && yy > floor; yy -= 1) {
    place("Stairs_Exterior_Platform", x, yy, z, yaw);
    for (const f of opts.exposed ?? []) {
      const d = f === "pz" ? at : -at;
      place("Stairs_Exterior_SingleSideThick", x + sx * d, yy, z + cz * d, yaw + Math.PI / 2);
    }
  }
}

// ── a run of fence or wall ───────────────────────────────────────────────────
//
// Panels 2m long from (x, z) along (ux, uz), each tilted to the ground at ITS
// OWN TWO ENDS, so a run up a hill is a chain of panels meeting at the ground
// rather than level pieces with one end buried and the other in the air. The
// run ENDS where it cannot go on (a plot, a road, a cliff); it never skips a
// panel and carries on, which leaves a run with a tooth missing.
//
//   fence   Prop_WoodenFence_* (long axis local x, so the tilt is a ROLL)
//   wall    Stairs_Exterior_SingleSideThick buried to its waist (long axis
//           local z, so the tilt is a PITCH of the opposite sign)
//   walled  the wall with a fence run on top
export function makeFenceRun(x: number, z: number, ux: number, uz: number, panels: number,
  kind: "fence" | "wall" | "walled" = "fence",
  opts: { blocked?: (x: number, z: number) => boolean; ground?: (x: number, z: number) => number } = {}): number {
  const ground = opts.ground ?? buildApi.surface;
  const alongYaw = Math.atan2(ux, uz);
  const nx = -uz, nz = ux;
  let laid = 0;
  for (let q = 0; q < panels; q++) {
    const px = x + ux * (q * 2.0), pz = z + uz * (q * 2.0);
    const g0 = ground(px - ux, pz - uz), g1 = ground(px + ux, pz + uz);
    const g = (g0 + g1) / 2;
    if (Math.abs(g1 - g0) > 1.4 || Math.abs(ground(px + nx, pz + nz) - g) > 0.9) break;
    if (opts.blocked && opts.blocked(px, pz)) break;
    const rise = (g1 - g0) / 2;
    if (kind !== "fence") {
      place("Stairs_Exterior_SingleSideThick", px, g - 0.42, pz, alongYaw, -Math.atan(rise), 0);
      if (kind === "walled") place("Prop_WoodenFence_Extension1", px, g + 0.56, pz, alongYaw + Math.PI / 2, 0, Math.atan(-rise));
    } else {
      place(q === 0 || q === panels - 1 ? "Prop_WoodenFence_Single"
        : (q % 2 ? "Prop_WoodenFence_Extension1" : "Prop_WoodenFence_Extension2"),
        px, g - 0.05, pz, alongYaw + Math.PI / 2, 0, Math.atan(-rise));
    }
    laid++;
  }
  return laid;
}

// ── a flight of steps ────────────────────────────────────────────────────────
//
// Stairs_Exterior_Straight is a 2m-wide tread block that climbs 1.000m over its
// 2.08m of run, HIGH END AT LOCAL -z (MEASURED: the -z edge tops out at 1.0,
// the +z edge sits at -0.2..0). So a flight descends along the piece's +z, and
// a piece placed with its -z end at the threshold, one metre down, is the top
// step. Every piece below the top one stands on stone blocks down to the
// ground: the kit's stairs are a facing, not a mass, and hung in the air on a
// slope they are the floating steps Philip flagged.
//
// (x, z) is the top of the flight -- where the top tread meets the wall or the
// platform edge -- at height yTop; `yaw` points DOWN the flight (local +z), and
// `wide` is the number of 2m treads across. Returns where the flight reaches
// the ground.
export function makeFlight(x: number, z: number, yaw: number, yTop: number, wide: 1 | 3 | 4 | 6 = 1): { x: number; z: number; y: number } {
  const nx = Math.sin(yaw), nz = Math.cos(yaw);      // down the flight
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);     // across it (local +x)
  // how many courses: the ground at the foot decides, and the foot depends on
  // the count, so ask twice
  let n = 1;
  for (let pass = 0; pass < 4; pass++) {
    const fd = 1.08 + (n - 1) * 2.08 + 1.0;
    const g = buildApi.surface(x + nx * fd, z + nz * fd);
    n = Math.max(1, Math.min(8, Math.round(yTop - g)));
  }
  for (let k = 0; k < n; k++) {
    const d = 1.08 + k * 2.08;
    const y = yTop - (k + 1);
    for (let w = -(wide - 1); w <= wide - 1; w += 2) {
      const px = x + nx * d + tx * w, pz = z + nz * d + tz * w;
      // The kit's plain tread is a top surface with OPEN SIDES (MEASURED: 7
      // vertices on each side, at two heights); Straight_L closes its +x
      // side and Straight_R its -x with the stepped profile. So the outer
      // columns get the closed side that faces out, and a one-wide flight
      // gets both, the second a few millimetres up so the two identical
      // treads cannot flicker. Seen from beside a wall's flight, the open
      // side was a wedge of hollow under every tread (Philip: "I can see into
      // the staircase... cover this rawness").
      const edgeL = w === wide - 1, edgeR = w === -(wide - 1);
      if (palette === "caerdun") { place("caerdun/exterior_stairs.glb",px,y,pz,yaw); }
      else if (edgeL && edgeR) {
        place("Stairs_Exterior_Straight_L", px, y, pz, yaw);
        place("Stairs_Exterior_Straight_R", px, y + 0.004, pz, yaw);
      } else {
        place(edgeL ? "Stairs_Exterior_Straight_L" : edgeR ? "Stairs_Exterior_Straight_R" : "Stairs_Exterior_Straight", px, y, pz, yaw);
      }
      // the mass under it: solid on the flight's sides, its open ends behind
      // the tread above and the tread below -- and the BOTTOM tread's down
      // face skinned, since nothing stands in front of it (Philip: "I can see
      // into the staircase... cover this rawness")
      // (the bottom block is always laid, buried or not, so the skin is too;
      // the others skin their down face a little proud, over the 8cm slit
      // the 2.08 tread pitch leaves between 2m blocks)
      makeMasonry(px, pz, y, yaw, k === n - 1
        ? { ground: (bx, bz) => Math.min(buildApi.surface(bx, bz), y - 0.1), exposed: ["pz"] }
        : { ground: buildApi.surface, exposed: ["pz"], exposedAt: 1.04 });
    }
  }
  const fd = 1.08 + (n - 1) * 2.08 + 1.0;
  // The ramp meets the GROUND at the foot, whatever the bottom tread does: a
  // ramp ending a whole step above the grass is one a character cannot get
  // onto (STEP_UP), and it walked up the hill under the stair instead.
  const foot = { x: x + nx * fd, z: z + nz * fd, y: buildApi.surface(x + nx * fd, z + nz * fd) };
  buildApi.addRamp(x, z, yTop, foot.x, foot.z, foot.y, wide + 0.15);
  // Exterior flights stand on solid masonry all the way to ground.
  if(palette === "caerdun")buildApi.addStairBody(x,z,yTop,foot.x,foot.z,foot.y,wide);
  return foot;
}

// ── a round tower ────────────────────────────────────────────────────────────
//
// Wall modules around a circle, floors at every storey, and a spiral of the
// kit's interior flights between them: each flight hugs the wall, and the next
// starts a quarter turn on, so climbing the tower is climb, cross the room,
// climb. The kit has no curved stair and this is the honest way to a spiral
// with what it has.
export interface TowerSpec {
  stairInset?: number; // additional landing clearance inside a curved drum
  cx: number; cz: number;
  r: number;                   // wall-line radius asked for; snapped to a whole number of modules
  storeys: number;
  skin?: Skin;
  door?: number;               // bearing of the door (yaw of that wall's outward normal)
  y?: number;
  parapet?: boolean;           // a crenellated ring under the roof
  cone?: boolean;              // the kit's tower roof, scaled to the drum; default true
  plain?: boolean;             // a solid drum: no door, no floors, no flights (a gate tower)
  seed?: number;
}

// ── the floor probe ──────────────────────────────────────────────────────────
//
// Every upper floor a tower lays is recorded here -- its tiles as the squares
// they cover, and its stairwell -- so `probeFloors()` can MEASURE the floor
// instead of anyone looking for a hole with the camera: it samples each floor
// on a 0.1m grid out to the wall's inner face, skips the well, and reports
// every point no tile covers. The tower-well gap took four note batches to
// close by eye and one probe to find (a rejected quarter cell, 0.4 by 0.8 of
// bare air beside the flight's top); this is that probe, kept. Dev only:
// `window.__vanai.probeFloors()` in the client, `__zv.probeFloors()` in
// `?zone=`. Reset with the zone.
interface FloorRecord {
  tower: string; cx: number; cz: number; inner: number; y: number;
  tiles: { x: number; z: number; yaw: number; half: number }[];
  well: { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number };
}
const floorRecords: FloorRecord[] = [];
const towerRecords: {spec:TowerSpec;y0:number;top:number;R:number}[] = [];
export function inspectTowers() { return towerRecords.map(t=>({...t,spec:{...t.spec}})); }
export function resetTowerProbes(): void { floorRecords.length = 0; towerRecords.length = 0; houseRecords.length = 0; }
export function probeFloors(step = 0.1): { tower: string; y: number; bare: number; worst: [number, number][] }[] {
  const out: { tower: string; y: number; bare: number; worst: [number, number][] }[] = [];
  for (const f of floorRecords) {
    const covered = (x: number, z: number) => f.tiles.some((t) => {
      const dx = x - t.x, dz = z - t.z, c = Math.cos(t.yaw), s = Math.sin(t.yaw);
      return Math.abs(dx * c - dz * s) <= t.half + 0.005 && Math.abs(dx * s + dz * c) <= t.half + 0.005;
    });
    const worst: [number, number][] = [];
    let bare = 0;
    for (let x = f.cx - f.inner; x <= f.cx + f.inner; x += step) {
      for (let z = f.cz - f.inner; z <= f.cz + f.inner; z += step) {
        if (Math.hypot(x - f.cx, z - f.cz) > f.inner || obbNear(f.well, x, z) || covered(x, z)) continue;
        bare++;
        if (worst.length < 8) worst.push([+x.toFixed(2), +z.toFixed(2)]);
      }
    }
    out.push({ tower: f.tower, y: +f.y.toFixed(2), bare, worst });
  }
  return out;
}

export function makeTower(spec: TowerSpec): { top: number; R: number; y0: number } {
  if (palette === "caerdun") { const t=makeCaerdunTower(spec);towerRecords.push({spec:{...spec},...t});return t; }
  const storey = STOREY;
  const s = spec;
  const rnd = seededRand(s.seed ?? 7);
  const skin: Skin = s.skin ?? "UnevenBrick";
  const n = Math.max(8, Math.round((2 * Math.PI * s.r) / MOD));
  const R = (n * MOD) / (2 * Math.PI);               // the radius n modules actually close at
  const at = (th: number, rad: number): [number, number] => [s.cx + Math.sin(th) * rad, s.cz + Math.cos(th) * rad];
  const door = s.door ?? 0;
  const doorIdx = s.plain ? -1 : ((Math.round((door / (2 * Math.PI)) * n) % n) + n) % n;

  // floor height: above the highest ground under the ring, and a course above
  // the doorstep
  // over the whole disc: a tower on a hilltop has its highest ground in the
  // MIDDLE, and a floor seated on the ring alone had the hill inside the room
  let gmax = -Infinity;
  for (let gx = -R; gx <= R; gx += 2) for (let gz = -R; gz <= R; gz += 2) {
    if (Math.hypot(gx, gz) > R + 0.5) continue;
    gmax = Math.max(gmax, buildApi.surface(s.cx + gx, s.cz + gz));
  }
  const [ddx, ddz] = at((Math.max(0, doorIdx) / n) * Math.PI * 2, R + 2.6);
  const y0 = s.y ?? Math.max(buildApi.surface(ddx, ddz) + RAISE, gmax + 0.15);
  const top = y0 + s.storeys * storey;
  if (!s.plain) buildApi.addCameraRoom({ ...buildApi.obb(s.cx,s.cz,R-WALL_IN,R-WALL_IN,0), r: R-WALL_IN, y0, y1: top });

  // the drum, and the foundation under it
  for (let a = 0; a < n; a++) {
    const th = (a / n) * Math.PI * 2;
    const [bx, bz] = at(th, R - (WALL_IN - WALL_OUT) / 2);
    const g = buildApi.surface(bx, bz);
    for (let yy = y0 - 1; yy + 1 > g - 0.05; yy -= 1) place("Stairs_Exterior_SingleSideThick", bx, yy, bz, th + Math.PI / 2);
    // THE FOUNDATION: the drum's own wall carried on DOWN the slope, a
    // storey at a time, until it is in the ground. The floor sits over the
    // highest ground under the ring, so on a slope the downhill side hung
    // in the air with the sky under it (Philip, of the Capital's bastions
    // and gate: "all towers are floating"); the step stack above is a
    // course, not a wall
    const [wx, wz] = at(th, R);
    const gw = buildApi.surface(wx, wz);
    for (let yy = y0 - storey; yy + storey > gw - 0.05; yy -= storey) place(`Wall_${skin}_Straight`, wx, yy, wz, th);
    for (let st = 0; st < s.storeys; st++) {
      const y = y0 + st * storey;
      if (st === 0 && a === doorIdx) {
        place(`Wall_${skin}_Door_Round`, wx, y, wz, th);
        place(skin === "UnevenBrick" ? "DoorFrame_Round_Brick" : "DoorFrame_Round_WoodDark", wx, y, wz, th);
        const [hx, hz] = at(th, R + 0.06);
        const ux = Math.cos(th), uz = -Math.sin(th), hinge = palette === "caerdun" ? .945 : .52;
        place(`Door_${1 + Math.floor(rnd() * 8) % 8}_Round`, hx - ux * hinge, y, hz - uz * hinge, th + 1.45);
        buildApi.addBoxCollider(wx,wz,1,.25,th,top,y0+2.473);
        continue;
      }
      // windows spiral up with the stair; the ground floor keeps its walls
      const win = st > 0 && (a + st) % 3 === 1;
      place(win ? `Wall_${skin}_Window_Thin_Round` : `Wall_${skin}_Straight`, wx, y, wz, th);
      if (win) place(`Window_Thin_Round${1 + Math.floor(rnd() * 3) % 3}`, wx, y, wz, th);
      if (st === 0) buildApi.addBoxCollider(wx, wz, 1.0, 0.25, th, top);
    }
    // Below the arch the door module stays clear: the neighbours leave the 2m
    // module clear, and jambs either side of a 1.2m opening left a 0.3m slot
    // once the body radius was taken off -- MEASURED, the test character
    // walked up the flight and stopped dead at the threshold.
  }

  // THE FLIGHTS. Stair_Interior_Solid: 4.35m of run for 3.03m of rise, 1.76m
  // wide, origin at the LOW end, climbing toward local -z. Yaw th + PI/2 lays
  // its width radially and its run along the wall.
  const flights: { a0: number; obb: ReturnType<typeof buildApi.obb>; wx: number; wz: number; yaw: number; ux: number; uz: number }[] = [];
  for (let k = 0; k < (s.plain ? 0 : s.storeys - 1); k++) {
    const phi = door + Math.PI + k * (Math.PI / 2);
    // CENTRED on the tangent point, not started from it: the flight is a
    // chord, and a chord's ends sit further out than its middle. Run from the
    // tangent point it ended inside the wall (MEASURED, the test character
    // stopped two treads from the top against the wall's collider).
    const rad = R - WALL_IN - 1.1 - (s.stairInset ?? 0);
    const yaw = phi + Math.PI / 2;
    const cx2 = Math.sin(yaw), cz2 = Math.cos(yaw);     // local +z; the climb runs along -z
    const [mx, mz] = at(phi, rad);
    const ox = mx + cx2 * 2.175, oz = mz + cz2 * 2.175; // the low end
    const y = y0 + k * storey;
    place("Stair_Interior_Solid", ox, y + 0.02, oz, yaw);
    const hx = ox - cx2 * 4.35, hz = oz - cz2 * 4.35;   // the high end
    buildApi.addRamp(ox, oz, y, hx, hz, y + storey, 0.9);
    // the rail down the flight's open (inward) side; the wall is the other
    const ix = -Math.sin(phi), iz = -Math.cos(phi);       // toward the centre
    buildApi.addBoxCollider((ox + hx) / 2 + ix * 0.95, (oz + hz) / 2 + iz * 0.95, 0.1, 2.2, yaw, y + storey + 1.0, y - 0.2);
    // The well above it runs from a step before the low end to the HIGH END
    // and no further: past the top tread the floor has to be there to step
    // onto (MEASURED: a well that overran the top by a metre dropped the
    // climber back to the floor below).
    // Only a tenth wider than the flight itself: the rail on one side and the
    // wall on the other keep a climber on it, so a body-radius margin bought
    // nothing -- and it was the metre-wide slot of bare air beside every
    // flight that Philip flagged ("gap between top of staircase and the
    // floor").
    // ...and along it from the high end (the mesh's -4.352) to a hand past
    // the bottom step's nose (its +0.358), not a whole step past the low
    // end: that margin was a strip of open well beside the flight's foot,
    // looked down on from the floor above (Philip: "gap where stairs and
    // floor is"). A flight is entered from the floor BELOW, so the floor
    // above needs no clearance there.
    // The high end is drawn a quarter short of the mesh's own end and the
    // sides a few centimetres inside the treads' edges, so the floor LIPS
    // the top tread rather than meeting it edge to edge: edge to edge left a
    // sliver at the top inner corner beside the rail (Philip: "so close,
    // just cover a bit more").
    const wx = (ox + hx) / 2 + cx2 * 0.33, wz = (oz + hz) / 2 + cz2 * 0.33;
    flights.push({ a0: phi, obb: buildApi.obb(wx, wz, 0.85, 2.255, yaw), wx, wz, yaw, ux: cx2, uz: cz2 });
  }

  // THE FLOORS. Square tiles do not fill a circle: two rings of tiles hugging
  // the wall (one per module, so they overlap a little at their inner corners
  // and are stepped 3mm apart to keep the overlap from flickering) and a grid
  // for the middle, seated under the rings. The ground floor is stone on a
  // solid disc of blocks, so wherever a tile does not reach, block shows and
  // reads as a stone floor.
  // A tile is dropped when it could REACH the well at all (its centre within a
  // tile's diagonal of it), never by where its centre falls: a 2m tile whose
  // centre was just outside the old fat well still hung a metre over the
  // treads, and one just inside left a metre of floor missing beside them.
  // The exact edge is then drawn by the fill below.
  const ringHas = (x: number, z: number, th: number, k: number) => flights.some((f, i) => i === k - 1 && tileHitsWell(x, z, th, f.obb));
  for (let st = 0; st < (s.plain ? 0 : s.storeys); st++) {
    const y = y0 + st * storey;
    const floor = st === 0 ? "Floor_Brick" : "Floor_WoodDark";
    const holes = st > 0 ? [flights[st - 1].obb] : [];
    // what this floor lays, for probeFloors
    const laid: { x: number; z: number; yaw: number; half: number }[] = [];
    const lay = (px: number, pz: number, yaw: number, half: number) => { if (st > 0) laid.push({ x: px, z: pz, yaw, half }); };
    if (st === 0) {
      for (let gx = -R; gx <= R; gx += 2) for (let gz = -R; gz <= R; gz += 2) {
        if (Math.hypot(gx, gz) > R - 0.6) continue;
        place("Stairs_Exterior_Platform", s.cx + gx, y - 1, s.cz + gz, 0);
      }
    }
    for (const [rad, lift] of [[R - WALL_IN - 1.0, 0.012], [R - WALL_IN - 3.0, 0.006]] as [number, number][]) {
      for (let a = 0; a < n; a++) {
        const th = (a / n) * Math.PI * 2;
        const [px, pz] = at(th, rad);
        if (st > 0 && ringHas(px, pz, th, st)) continue;
        place(floor, px, y + lift + (a % 2 ? 0.003 : 0), pz, th);
        lay(px, pz, th, 1);
      }
    }
    const inner = R - WALL_IN - 4.0;
    for (let gx = -R; gx <= R; gx += 2) for (let gz = -R; gz <= R; gz += 2) {
      if (Math.hypot(gx, gz) > inner + 1.2) continue;
      if (st > 0 && ringHas(s.cx + gx, s.cz + gz, 0, st)) continue;
      place(floor, s.cx + gx, y, s.cz + gz, 0);
      lay(s.cx + gx, s.cz + gz, 0, 1);
    }
    // THE WELL'S EDGE: metre tiles (the same tile at half scale) laid in the
    // flight's own frame, so their edges fall exactly on the well's -- the
    // hole is 0.98 half-wide by 2.65 half-long, and a metre cell centred
    // 1.48 out or 3.15 along ends dead on that line. Kept a corner's reach
    // inside the drum's outer face so none pokes out through the wall.
    // A cell goes down whole if all four corners stay inside the drum's
    // outer face; one that would poke out is quartered and the quarters that
    // fit go down instead. Clipping cells by their centre left the cell at
    // the flight's top inner corner out (its centre was a hand past the
    // radius) and that corner open (Philip, three times).
    if (st > 0) {
      const f = flights[st - 1];
      const tx = Math.cos(f.yaw), tz = -Math.sin(f.yaw);          // across the flight
      const rOut = R + WALL_OUT - 0.02;
      const cell = (al: number, lat: number, half: number): boolean => {
        const px = f.wx + f.ux * al + tx * lat, pz = f.wz + f.uz * al + tz * lat;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const qx = px + f.ux * a * half + tx * b * half, qz = pz + f.uz * a * half + tz * b * half;
          if (Math.hypot(qx - s.cx, qz - s.cz) > rOut) return false;
        }
        place(floor, px, y + 0.02, pz, f.yaw, 0, 0, half);
        lay(px, pz, f.yaw, half);
        return true;
      };
      // ...and a rejected quarter is quartered again, down to a hand's
      // breadth: rejecting a quarter whole left a 0.4 by 0.8 patch of bare
      // air beside the flight's top where the drum's curve cut its far
      // corner (MEASURED with a coverage probe over the floor: 95 bare
      // samples, all in that patch -- the gap Philip reported four times)
      const fit = (al: number, lat: number, half: number) => {
        if (cell(al, lat, half)) return;
        const q = half / 2;
        if (q < 0.1) return;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fit(al + a * q, lat + b * q, q);
      };
      // the sides: metre cells from the well's edge (0.90) outward
      for (const lat of [-2.35, -1.35, 1.35, 2.35]) for (let k = 0; k < 11; k++) fit(-5.15 + k, lat, 0.5);
      // the ends: cells the well's own width, from its ends outward
      for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) fit(sgn * (2.255 + 0.85 + k * 1.7), 0, 0.85);
      floorRecords.push({ tower: `${Math.round(s.cx)},${Math.round(s.cz)}`, cx: s.cx, cz: s.cz, inner: R - WALL_IN - 0.04, y, tiles: laid, well: f.obb });
    }
    // the deck runs out past the wall line: the walls are colliders, and a
    // deck that stopped short of them left a ring of bare terrain at the
    // threshold that isWalkable refused as a cliff
    if (st === 0) {
      buildApi.addFlatZone(s.cx - R * 0.6, s.cx + R * 0.6, s.cz - R * 0.6, s.cz + R * 0.6, y);
      buildApi.addDisc(s.cx, s.cz, R + 0.6, y);
    } else {
      buildApi.addDisc(s.cx, s.cz, R + 0.6, y, holes);
    }
  }

  // THE TOP: a parapet walk and its merlons, then the cone. Roof_Tower_RoundTiles
  // measures 2.83m to its eave, so it is scaled to the drum it has to cover.
  let capY = top;
  if (s.parapet) {
    for (let a = 0; a < n; a++) {
      const th = (a / n) * Math.PI * 2;
      const [px, pz] = at(th, R - (1 - WALL_OUT));
      place("Stairs_Exterior_Platform", px, top, pz, th);
      if (a % 2 === 0) place("Stairs_Exterior_Platform", px, top + 1, pz, th);
    }
    capY = top + 2;
  }
  if (s.cone !== false) {
    const sc = (R + 0.5) / 2.83;
    place("Roof_Tower_RoundTiles", s.cx, capY - 0.3 + 0.57 * sc, s.cz, 0, 0, 0, sc, [0.86, 0.8, 0.74]);
  } else {
    // A FLAT TOP is floored: brick over the whole disc a metre under the
    // parapet's walk, the reference castle's tower tops. Open, a plain drum
    // showed its hollow to anyone above it (the Capital's keep from the
    // rim, the bastions from the wall walk).
    for (const rad of [R - WALL_IN - 1.0, R - WALL_IN - 3.0]) {
      for (let a = 0; a < n; a++) {
        const th = (a / n) * Math.PI * 2;
        const [px, pz] = at(th, rad);
        place("Floor_Brick", px, top + 0.012 + (a % 2 ? 0.003 : 0), pz, th);
      }
    }
    const inner = R - WALL_IN - 4.0;
    for (let gx = -R; gx <= R; gx += 2) for (let gz = -R; gz <= R; gz += 2) {
      if (Math.hypot(gx, gz) > inner + 1.2) continue;
      place("Floor_Brick", s.cx + gx, top, s.cz + gz, 0);
    }
  }
  // the doorstep
  if (!s.plain) {
    const [tx, tz] = at((doorIdx / n) * Math.PI * 2, R + WALL_OUT);
    makeFlight(tx, tz, (doorIdx / n) * Math.PI * 2, y0, 3);
  }
  buildApi.footprint(s.cx, s.cz, R * 2, R * 2);
  towerRecords.push({spec:{...s},y0,top:capY,R});
  return { top: capY, R, y0 };
}

function obbNear(b: { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number }, x: number, z: number, pad = 0): boolean {
  const dx = x - b.cx, dz = z - b.cz;
  return Math.abs(dx * b.cos - dz * b.sin) < b.hx + pad && Math.abs(dx * b.sin + dz * b.cos) < b.hz + pad;
}
// Does a 2m floor tile at (x, z, yaw) reach into a stairwell? The real
// rectangles, not a padded centre test: a tile is dropped only if a corner
// of it is in the well or a corner of the well is in it, and the well is
// tested 0.3m smaller than it is, because a tile lipping the top tread by a
// hand's breadth sits a tenth above it and looks like the floor it is --
// while dropping it left a wedge of air between the flight's top and the
// wall (Philip: "gap here where the top of staircase meets the floors").
function tileHitsWell(x: number, z: number, yaw: number, w: { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number }): boolean {
  const inner = { ...w, hx: w.hx - 0.3, hz: w.hz - 0.3 };
  if (obbNear(inner, x, z)) return true;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (obbNear(inner, x + lx * c + lz * s, z - lx * s + lz * c)) return true;
  }
  const tile = { cx: x, cz: z, hx: 1, hz: 1, sin: s, cos: c };
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const wx = w.cx + lx * inner.hx * w.cos + lz * inner.hz * w.sin, wz = w.cz - lx * inner.hx * w.sin + lz * inner.hz * w.cos;
    if (obbNear(tile, wx, wz)) return true;
  }
  return false;
}

/** The door-side point a house is levelled to: 2.6m out from its threshold. */
export function doorFoot(h: HouseSpec): [number, number] {
  if(h.kit==="caerdun")return caerdunDoorFoot(h);
  const face: Face = h.door === false || h.door === undefined || h.door === true ? "pz" : h.door;
  const f = FACES[face];
  const len = fitLen(h.span, h.len);
  const hw = h.span / 2, hl = len / 2;
  const end = face === "pz" || face === "nz";
  const n = end ? h.span / MOD : len / MOD, hh = end ? hw : hl, at = end ? hl : hw;
  const sign = face === "pz" || face === "px" ? 1 : -1;
  const a = -hh + 1 + Math.floor(n / 2) * MOD;
  const lx = end ? a : sign * at, lz = end ? sign * at : a;
  return xf(h, lx + f.n[0] * 2.6, lz + f.n[1] * 2.6);
}

// A Wall_*_Window_* module is a HOLE and nothing else -- MEASURED: it carries
// MI_WoodTrim / MI_Plaster / the skin and no MI_WindowGlass anywhere. The frame
// and its pane are separate models that drop into the opening, and a wall
// placed without one is a hole you can see the far wall through.
//
// The inserts need no offset of their own. Window_Wide_Round1 measures
// y in [1.016, 2.742] and x in [-0.682, 0.682], so it carries its own sill
// height and centring: placed at the module's origin and the storey base, it
// lands in the opening.
const WINDOWS: Record<string, string[]> = {
  Wide_Round: ["Window_Wide_Round1", "Window_Wide_Round2", "Window_Wide_Round3"],
  Wide_Flat: ["Window_Wide_Flat1", "Window_Wide_Flat2", "Window_Wide_Flat3"],
  Thin_Round: ["Window_Thin_Round1", "Window_Thin_Round2", "Window_Thin_Round3"],
};

/** Which opening this module has, and what fills it. */
function wallPiece(skin: Skin, storey: number, rnd: () => number): { wall: string; fill?: string } {
  const r = rnd();
  const kind = storey === 0
    ? (r < 0.45 ? "Wide_Round" : "")
    : (r < 0.30 ? "Wide_Flat" : r < 0.55 ? "Thin_Round" : "");
  if (!kind) return { wall: `Wall_${skin}_Straight` };
  const opts = WINDOWS[kind];
  return {
    wall: `Wall_${skin}_Window_${kind}`,
    fill: opts[Math.floor(rnd() * opts.length) % opts.length],
  };
}
