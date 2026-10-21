// The Capital's Colonnade assembler: zones/capital_blocks.ts says which
// module stands where; this instances them, makes them solid and walkable,
// and keeps the draw count down (Philip's performance gate, decisions 10).
//
// The modules are ORIGINAL (tools/assets/build_capital_modules.py, out to
// client/public/models/capital/) and carry no textures of their own: their
// eight materials are bound here by name to the sheets manifest.json lists
// (zones/capital_blocks.ts CL_MATERIALS, held to the manifest by the node
// test), one shared PBR material each per scene -- except stone, glass and
// joinery, which are ONE material on the painter's stacked facade sheet (see
// "the facade").
//
// PERFORMANCE BY DESIGN (the gate: 600 draws at any camera, every pass
// counted -- main, glow layer, three shadow cascades):
//   * one thin-instanced template per module FILE (a pool), its buffer the
//     pieces whose cells show it now: a file is one draw a pass however many
//     cells hold it, so the city's draws are bounded by its module library;
//   * a bay is one submesh (the facade sheet), not three;
//   * LOD per culling cell by distance, from the camera to the cell's box: LOD0
//     within 45 m, the LOD1 bays (painted mouldings, a quarter of the
//     triangles) to 140 m, beyond that one quad per bay carrying its rank's
//     painted elevation (manifest.json lodDistances). A cell is one block or
//     free row (zones/capital_blocks.ts CL_CELL). The corner mitres and returns
//     go with LOD2; roofs, belvederes and pediments stay -- the skyline;
//   * the switch runs in one before-render observer over a flat array, every
//     few frames or once the camera has moved a metre, and re-packs only the
//     pools a changed cell holds;
//   * the houses are out of the glow layer's pass but for the returned city's
//     nights, one occluder box set standing in for them (see "night").
// WHERE IT STANDS (M1): the worst camera is the returned city's night on the
// Great Stair looking back down the avenue, 535 draws (446 before M1's civic
// ranges and grounds) -- 65 under the gate, so a later step budgets against
// 535. Left to claw back: the returned keep portal's stones (~46 draws for
// under 1k triangles) and the house templates in the night glow pass.
// The civic set (zones/capital_civic.ts: the Hall, the square, the street and
// courtyard dressing, the two cities' tables and goods) goes through the same
// instancer in cells of its own, and NIGHT is materials, not lights: the
// returned city's glass lights from its lamplit sheet, the chapel's lamps and
// dome burn in both cities, the other dome lanterns, the lamp standards and
// braziers in the returned one (the empty city's braziers are cold:
// hall_shell_e carries brazier_cold) -- no point
// light is added (the Safari budget: the bare city already spends five).
// Everything is a template of models.ts's per-scene cache, disposed with the
// scene; the LOD state and the shared materials forget their scene on its
// disposal (SCENE-LIFETIME.md "Application owners").
//
// THE INSTANCER ITSELF is city-architecture.ts since Caerdun became the second
// city drawn this way (CF-13: lifted, not copied; the Capital byte-identical by
// zone_fingerprint on both Capital keys and the Burned Land). This file is the
// Capital's KIT over it -- its directory, materials, facade, LOD, shadow and
// glow rules, its night and its crown -- and the Capital's build functions,
// every export as it was.
import { PBRMaterial, Color3, VertexBuffer, type Scene } from "@babylonjs/core";
import { scene, buildApi, placeExact, glowOccluder } from "./scene";
import { staticTemplate } from "./models";
import { createCity, buildSolids, type CitySpecial } from "./city-architecture";
import { planDistrict, CL_LOD, CL_MATERIALS, CL_FACADE, type BlocksPlan, type District, type Piece, type State } from "./zones/capital_blocks";
import { planCivic, CROWN as TREE_CROWN, type Civic, type CivicPlan } from "./zones/capital_civic";
import { planWalls, type Walls, type WallsInput } from "./zones/capital_walls";
import type { CapitalView } from "./zones/capital_view";

const SHADOWLESS = /^(cnr_|pc_return|walk_return|bal_end|roof_deck|lod2_|lamp|planter|bench|feast_table|market|stall|well|brazier|banner|coffers|cent_cnr|hall_stack|hall_table|archive_desk|hall_floor|hall_portico_floor|hall_panel|bal_lod1|curtain_cap|bastion_in|kerb|hedge|parterre|washline|archive_floor|sign_|bakery_board|childs_game|urn$|basin$|exch_counter|exch_board)/;
// ...and of those, what stays in the glow layer's pass because it glows itself:
// the lamp standards and braziers, in the returned city only -- the empty
// city's never light, and in its glow pass they were only draws (the Hall's
// braziers are in its shell, which casts and so is in the pass anyway)
const GLOWS: Record<State, RegExp | null> = { e: null, r: /^(lamp|brazier)/ };

// THE FACADE (city-architecture.ts "the facade"): the painter stacks the stone,
// fabric and glass sheets into cl_facade.jpg (capital_atlas.py FACADE); their
// roughness (stone 0.9, joinery 0.7, glass 0.12: the panes' sky) is its
// roughness sheet. The three sheets exist only on the facade: the painter
// writes no sheet of its own for any of them (2026-10-05, the unused files
// pruned).
const FACADE_PART: Record<string, "stone" | "fabric" | "glass"> = { CL_Stone: "stone", CL_Fabric: "fabric", CL_Glass: "glass" };

// Only the facade casts. The gilt (keystones, rosettes, finials: a hand's
// breadth), the glow (lamp glass, flames) and the water (the basins' surfaces,
// under their own rims) were two draws in five of a fountain in each cascade
// for no shadow anyone could see. (The glass and joinery were skipped too
// while they were submeshes of their own; on the facade they cast with the
// stone they sit in, the one draw it already was -- an open awning now shades
// the walk under it, as it should.)
const SHADOW_SKIP = ["CL_Glass#capital", "CL_Fabric#capital", "CL_Gilt#capital", "CL_Glow#capital", "CL_Water#capital"];
// (M1) and not the rim chain: its rocks stand 75 m and more beyond the curtain, their
// shadows fall on the ash outside it, and its six files in three cascades were 18
// draws at every camera for a shadow no street sees (the L perf hotspots, 4th).
// The Burned Land's view (M3) passes rimShadowless false: the field's own rocks
// are the same files and stand round its players, so they keep their shadows.
const RIM_ROCK = /^gtn_nature\/Rock_/;

// ── night ───────────────────────────────────────────────────────────────────
// The brief's section 4 (decisions 7): in the empty city all glass stays dark and
// only the chapel (its lamps, drum and lantern) and the crown glow; in the
// returned one every dome lantern lights and the glass swaps to its
// lamplit sheet, so the avenue becomes a lit grid (the Night's "every window
// lit"), and the lamp standards and braziers burn. All emissive, so the glow
// layer blooms it (metadata.glow, scene.ts setupGlow) and no light is spent.
// The stone's part of the glow sheets is black but for the returned city's LOD2 windows and
// the chapel's lamp core ('Dark'), so it serves both cities: an empty city's
// cards have no lit windows to show. (The other dome lanterns are 'dark_r',
// lit in the returned city's facade night sheet only.) Stepped like Caerdun's glass (town.ts
// glowGlass), from the same night amount, every frame but only on a change.
// THE FACADE AT NIGHT: one emissive sheet per city (cl_facade_glow_e/_r):
// the stone's glow sheet in both, the glass's lamplit panes in the returned
// city's only, so one night amount drives the lot. The bloom strength was
// 0.6 for the stone (the lanterns, the cards' windows) and 0.45 for the
// glass; one material has one, so the empty city, where only the stone
// glows, keeps 0.6 exactly, and the returned one takes 0.5 for both -- a
// window now blooms alike near (glass) and far (its card).
// THE GLOW PASS. The houses glow only in the returned city, and only at night
// (their glass and their cards' windows); the rest of the time they were in the
// glow layer's pass only as black occluders, a draw per template -- by day in
// either city nothing in the street glows at all. So the blocks' templates are
// out of the pass unless the returned city's windows are lit, and their volume
// stands in for them as one glow occluder (buildCapitalBlocks), so the crystal,
// the Hall's lantern and the gate's braziers stay hidden behind the houses. The
// walls are out always (their occluder boxes stand in: nothing on them glows);
// the civic set keeps the Hall and the fountain in it, the biggest things in
// the square.

// THE CROWN (L4): the gold crown on the palace lantern burns at night in BOTH
// cities, the brightest point of the skyline ("the brightest thing in any
// frame", the brief) -- its own material, not CL_Gilt, which every civic
// keystone, rosette and dome finial shares and which must stay cold. By day it
// is that gilt (its faint emissive the same); at night the night amount takes
// it to a warm gold the glow layer blooms harder than any lantern (1.6 against
// the facade's 0.6). Emissive, so no light is spent (the Safari budget).
const CROWN_NIGHT = Color3.FromHexString("#ffc35c");
const crownCache = new WeakMap<Scene, PBRMaterial>();
const CROWN: CitySpecial = {
  file: "palace_crown", material: "CL_Gilt",
  make(owner) {
    const g = CL_MATERIALS.CL_Gilt;
    const m = new PBRMaterial("CL_Crown#capital", owner);
    m.albedoColor = Color3.FromHexString(g.color!).toLinearSpace();
    m.emissiveColor = Color3.FromHexString(g.emissive!);
    m.roughness = g.roughness;
    m.metallic = g.metallic;
    m.backFaceCulling = true;
    m.metadata = { glow: 1.6 };
    crownCache.set(owner, m);
    return m;
  },
  night(n, owner) {
    const crown = crownCache.get(owner);
    if (crown) Color3.LerpToRef(Color3.FromHexString(CL_MATERIALS.CL_Gilt.emissive!), CROWN_NIGHT, n, crown.emissiveColor);
  },
};

/** What the last build made, for the QA harness (zoneview.ts puts it on window.__zv). */
export const capitalStats = { pieces: 0, batches: 0, templates: 0, facades: 0, cells: 0, boxes: 0, houses: 0,
  civicPieces: 0, civicBatches: 0, civicBoxes: 0, trees: 0, tables: 0, wallPieces: 0, wallBatches: 0, wallBoxes: 0, kerbs: 0 };

const CAPITAL = createCity({
  id: "capital", prefix: "cl", dir: "capital", metaKey: "capital",
  // THE ONE WATER MATERIAL (WATER.md): the fountain's basins and the wells
  materials: { ...CL_MATERIALS, CL_Water: { ...CL_MATERIALS.CL_Water, water: true } },
  facades: [{ name: "CL_Facade", ...CL_FACADE, parts: FACADE_PART }],
  lod: CL_LOD, cellHeight: 19, reach: 7,
  shadowless: SHADOWLESS, shadowSkip: SHADOW_SKIP, rimRock: RIM_ROCK,
  glows: GLOWS,
  glowTags: { out: ["blocks", "walls"], nightIn: [{ tag: "blocks", states: ["r"] }] },
  night: { facadeGlow: { e: 0.6, r: 0.5 }, lamplitFrom: "CL_Glow", litStates: ["r"] },
  special: [CROWN],
  stats: capitalStats,
});
const instance = CAPITAL.instance, nightGlow = CAPITAL.nightGlow;
const resetCapitalStats = (): void => CAPITAL.resetStats();

/**
 * Build the planned blocks and rows: modules, colliders, footprints. `floor`
 * is the city floor the pavement stands on. Their paving (walks, passages,
 * footways, aprons) is the paving planner's, with the streets'
 * (zones/capital_paving.ts, capital.ts streets).
 */
export function buildCapitalBlocks(plan: BlocksPlan, state: State, floor: number): District {
  const owner = scene;
  const d = planDistrict(plan, state);
  capitalStats.templates = 0; capitalStats.facades = 0;
  nightGlow(owner, state);
  const made = instance(owner, d.pieces, floor, "blocks", state);
  // SOLID AND WALKABLE: a box per house body (open where a carriage passage
  // runs through), per pier and per walk-end jamb; the walks, passages and
  // courtyards stay on the ground. No collider over the walk above the piers:
  // the follow camera would take the arcade's upper storeys for a ceiling and
  // crowd in on the player (the direction's risk 6).
  for (const bx of d.boxes) buildApi.addBoxCollider(bx.cx, bx.cz, bx.hx, bx.hz, 0, floor + bx.y1, bx.y0 === undefined ? -1e9 : floor + bx.y0);
  // THE HOUSES IN THE GLOW PASS (see nightGlow): their bodies and wings as one
  // occluder, drawn in 0.8 m from every face -- behind the window reveals, which
  // reach 0.4-0.6 m behind a facade's plane (manifest.json bounds) -- and stopped
  // under the coping, so a lit pane or a lamp on a facade is never behind it.
  // Open where a carriage passage runs through, as the bodies are.
  glowOccluder("cap_glow_houses", d.boxes.filter((bx) => bx.what === "body" || bx.what === "wing")
    .map((bx) => ({ cx: bx.cx, cz: bx.cz, hx: bx.hx - 0.8, hz: bx.hz - 0.8, y0: floor - 1, y1: floor + bx.y1 - 0.8 })));
  // footprints keep the meadow off the floors and draw the houses on the map
  for (const h of [...d.houses, ...d.ranges]) { const [x0, z0, x1, z1] = h.footprint; buildApi.footprint((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0); }
  for (const [x0, z0, x1, z1] of d.wings) buildApi.footprint((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  capitalStats.pieces = d.pieces.length; capitalStats.batches = made.batches; capitalStats.cells = made.cells; capitalStats.boxes = d.boxes.length; capitalStats.houses = d.houses.length;
  return d;
}

/**
 * Build the civic set over a built district: the Hall of the Household (its
 * census room the site's floor 0), the square, the street and courtyard
 * dressing, the state's tables or goods, and (L4) the Great Stair, the palace
 * and its gardens -- modules, colliders, decks, flights, the Hall's camera room,
 * the keep door's plinth, footprints, the paved aprons and the trees.
 */
export function buildCapitalCivic(plan: CivicPlan, district: District, state: State, floor: number): Civic {
  const owner = scene;
  const c = planCivic(plan, district, state);
  const made = instance(owner, c.pieces, floor, "civic", state);
  for (const bx of c.boxes) buildApi.addBoxCollider(bx.cx, bx.cz, bx.hx, bx.hz, bx.yaw ?? 0, floor + bx.y1, bx.y0 === undefined ? -1e9 : floor + bx.y0);
  for (const ci of c.circles) buildApi.addCircleCollider(ci.x, ci.z, ci.r);
  for (const dk of c.decks) {
    const [x0, z0, x1, z1] = dk.rect;
    buildApi.addDeck((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, floor + dk.y);
  }
  // a flight is a ramp to walk and a stair body to be solid beside and under it
  // (MEASURED: with the body alone the Hall's flight was a wall to a walker from
  // the square). The ramp is the treads' NOSING line, from the first tread's
  // nosing a riser up at the foot to the last's one tread short of the top (that
  // tread is level with the deck, which reaches back over it): laid foot to top,
  // it ran through the treads' back corners and every nosing stood a riser proud
  // of it, feet sunk 0.19-0.25 m into the stone (the L4 review). Its end pad is a
  // hair, so the first riser is a step at its own face, not 0.3 m before it. The
  // body keeps the foot-to-top line under the treads.
  for (const st of c.stairs) {
    const dx = (st.top[0] - st.foot[0]) / st.treads, dz = (st.top[1] - st.foot[1]) / st.treads, rise = (st.y0 - st.y1) / st.treads;
    buildApi.addRamp(st.foot[0], st.foot[1], floor + st.y1 + rise, st.top[0] - dx, st.top[1] - dz, floor + st.y0, st.half, 0.05);
    buildApi.addStairBody(st.top[0], st.top[1], floor + st.y0, st.foot[0], st.foot[1], floor + st.y1, st.half);
  }
  // the follow camera stays inside the census room (an arcade's walk is no
  // room: its upper storeys would read as a ceiling, capital_blocks says why)
  for (const r of c.rooms) {
    const [x0, z0, x1, z1] = r.rect;
    buildApi.addCameraRoom({ ...buildApi.obb((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0), y0: floor + r.y0, y1: floor + r.y1 });
  }
  for (const [x0, z0, x1, z1] of c.footprints) buildApi.footprint((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  // the keep door's plinth (L4): the portico's floor as a flat, so the portal's
  // groundHeight is the podium's top, not the terrace under it
  for (const fl of c.flats) buildApi.addFlatZone(fl.rect[0], fl.rect[2], fl.rect[1], fl.rect[3], floor + fl.y);
  // the trees: the project's generated broadleaf, thin-instanced per variant
  // with its own LOD and wind (trees.ts), standing in their boxes (y)
  const byFile = new Map<string, Civic["trees"]>();
  for (const t of c.trees) (byFile.get(t.file) ?? byFile.set(t.file, []).get(t.file)!).push(t);
  for (const [file, ts] of byFile) placeExact(file, ts.map((t) => ({ x: t.x, z: t.z, scale: t.scale, rot: t.rot, yOff: t.y })), 0);
  if (import.meta.env.DEV) checkTreeCrowns();
  capitalStats.civicPieces = c.pieces.length; capitalStats.civicBatches = made.batches; capitalStats.civicBoxes = c.boxes.length;
  capitalStats.trees = c.trees.length; capitalStats.tables = c.tables.length;
  return c;
}

// THE KERB TREES' CROWNS (capital_civic.ts CROWN) are numbers measured off the
// generated templates, which turn each kerb tree's short side to its facade; if
// trees.ts changes the broadleaf they go stale silently and a branch is back
// through an arcade pier (the M1 review). In a dev build, measure the live
// templates once and say so -- an error, so the fly-through
// (tools/qa/capital_flythrough.mjs) fails on it.
let crownsChecked = false;
export function checkTreeCrowns(): void {
  if (crownsChecked) return;
  crownsChecked = true;
  for (const [file, want] of Object.entries(TREE_CROWN)) {
    void staticTemplate(file).then((t) => {
      const p = t?.getVerticesData(VertexBuffer.PositionKind);
      if (!p) return;
      const got = [-Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        got[0] = Math.max(got[0], p[i]); got[1] = Math.max(got[1], -p[i]);
        got[2] = Math.max(got[2], p[i + 2]); got[3] = Math.max(got[3], -p[i + 2]);
      }
      if (got.some((g, k) => Math.abs(g - want[k]) > 0.1)) {
        console.error(`capital_civic.ts CROWN is stale for ${file}: measured ${got.map((g) => g.toFixed(2)).join(", ")}, the table has ${want.join(", ")}`);
      }
    });
  }
}

/**
 * The streets' kerbstones (zones/capital_paving.ts): one pooled module, near
 * and mid-distance only, in the dressing's coarse cells, casting nothing.
 */
export function buildCapitalKerbs(pieces: Piece[], state: State, floor: number): void {
  instance(scene, pieces, floor, "kerbs", state);
  capitalStats.kerbs = pieces.length;
}

/**
 * THE BURNED LAND'S VIEW OF THE CITY (M3, zones/capital_view.ts): the walls, the
 * houses and the civic set as the ash sees them, through this instancer -- a
 * module file a draw a pass, LOD by cell, the facade one material, the crown its
 * own and lit at night -- the empty city's (nightGlow: the chapel's lamps and the
 * crown burn, nothing else). Only the walls are solid (nothing inside is
 * reached: the arch's grille shuts it); their masonry and the houses' bodies
 * stand in for them in the glow pass. Pieces stand on `floor`.
 */
export function buildCapitalView(v: CapitalView, floor: number): void {
  const owner = scene;
  resetCapitalStats();
  nightGlow(owner, "e");
  // (the field's rocks keep their shadows: they are the rim chain only in the Capital)
  const walls = instance(owner, v.walls, floor, "walls", "e", { rimShadowless: false });
  const blocks = instance(owner, v.blocks, floor, "blocks", "e", { rimShadowless: false });
  const civic = instance(owner, v.civic, floor, "civic", "e", { rimShadowless: false });
  for (const b of v.boxes) buildApi.addBoxCollider(b.cx, b.cz, b.hx, b.hz, b.yaw, b.y1, b.y0);
  for (const c of v.circles) buildApi.addCircleCollider(c.x, c.z, c.r);
  for (const [x0, z0, x1, z1] of v.footprints) buildApi.footprint((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  glowOccluder("cap_glow_view", v.occluders);
  // the courtyards', the square's and the avenue's trees: the generated broadleaf
  const byFile = new Map<string, CapitalView["trees"]>();
  for (const t of v.trees) (byFile.get(t.file) ?? byFile.set(t.file, []).get(t.file)!).push(t);
  for (const [file, ts] of byFile) placeExact(file, ts.map((t) => ({ x: t.x, z: t.z, scale: t.scale, rot: t.rot, yOff: t.y })), 0);
  capitalStats.wallPieces = v.walls.length; capitalStats.wallBatches = walls.batches; capitalStats.wallBoxes = v.boxes.length;
  capitalStats.pieces = v.blocks.length; capitalStats.batches = blocks.batches; capitalStats.cells = walls.cells + blocks.cells + civic.cells;
  capitalStats.civicPieces = v.civic.length; capitalStats.civicBatches = civic.batches; capitalStats.trees = v.trees.length;
}

/**
 * Build the city's walls (zones/capital_walls.ts): the curtain, the bastions with
 * their stairs to the walk, the gate, the palace terrace's retaining wall and the
 * Great Stair's cheeks -- modules, colliders, the walks and the bastions' floors
 * and flights, their camera rooms, footprints and one glow occluder for the lot.
 */
export function buildCapitalWalls(input: WallsInput, state: State): Walls {
  const owner = scene, F = input.floor;
  resetCapitalStats();                      // the walls are the Capital's first build
  const w = planWalls(input);
  const made = instance(owner, w.pieces, F, "walls", state);
  // colliders, the walks and the bastions' floors, their flights (a ramp to walk
  // and a body to be solid beside -- and, on the lower two, under -- it, the
  // Hall's pairing, buildCapitalCivic), camera rooms, footprints, and THE GLOW
  // PASS: the walls are out of it (instance); their masonry stands in
  buildSolids(w, F, "cap_glow_walls");
  capitalStats.wallPieces = w.pieces.length; capitalStats.wallBatches = made.batches; capitalStats.wallBoxes = w.boxes.length;
  return w;
}
