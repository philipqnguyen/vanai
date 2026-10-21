// Moonmere's houses, named buildings, harbour stone and dressing in the scene:
// the planners' pieces (zones/moonmere_plan.ts) through THE SHARED CITY
// INSTANCER (client/src/city-architecture.ts, the Caerdun session's lift of the
// Capital's, copied byte for byte at G0 and never edited here) with Moonmere's
// kit (MOONMERE.md section 6), and their colliders, floors, stairs, camera
// rooms, footprints and glow occluders.
//
// THE KIT (section 6, with A-4's departures):
//   * the library's 8 materials bound by name; MC_Stone, MC_Timber, MC_Glass,
//     MC_Roof and MC_Joinery are ONE facade material on mc_facade.jpg (the
//     painter put every part on the one sheet, mc_facade.json: scale 1, offset
//     0). The contract split them into two groups, mc_facade and mc_trim, so the
//     roofs and joinery carried no night sheet -- but the night sheet is black on
//     every pantile, timber and stone strip (MEASURED, all six strips 0), so one
//     group lights exactly what two did, and the 12 civic shells that hold both
//     are one draw a pass instead of two (A-4);
//   * LOD 45 / 140 m by culling cell; the pools' own distances and masks are
//     moonmere_kit.ts mmCellPlan (towers 60 / 220, the Long Tower 140 / never,
//     its louvres gone past 140, the ground runs 60 / 140 on the 48 m grounds
//     grid, the returns' _l1 for ever, the brackets and small dressing LOD0
//     only to 45, the interiors LOD0 only);
//   * shadows: only the facade and the metal cast, and of the pools only what
//     the kit does not call shadowless (dressing, returns, cards, joinery,
//     interiors, flights and kerbs never);
//   * the glow pass BY FILE: nothing of Moonmere is in it by day (one occluder
//     mesh per district stands in for the bodies, so the crystal's bloom stays
//     behind the houses); at night the lamps, the bays with lit panes, the
//     towers and the civic shells join it;
//   * night is materials: the facade's night sheet stepped by the night amount
//     (bloom 0.55), the lamps' glass lit to its night colour (MC_Glow, bloom 1.0).
//     Moonmere is lived in: one state, "r". No point light (the crystal's only).
import { PBRMaterial, type Scene } from "@babylonjs/core";
import { scene, buildApi, glowOccluder } from "../scene";
import { createCity, type CityKit, type CityMaterial } from "../city-architecture";
import { MM_LOD, MM_SHADOWLESS, MM_SKY, MM_SKY_ORIGIN, mmCellPlan } from "./moonmere_kit";
import type { MoonmerePlan } from "./moonmere_plan";
import { localToWorld, walkHalf, type Body, type Box, type Deck, type Piece, type Ramp } from "./moonmere_types";
import { paintLampPools } from "./moonmere_night";

/** What the last build made, for the QA scripts (window.__zv.cityStats.mm) */
export const moonmereCityStats: Record<string, number> = {
  pieces: 0, batches: 0, cells: 0, templates: 0, facades: 0, boxes: 0, decks: 0, ramps: 0, rooms: 0, houses: 0, footprints: 0, occluders: 0, buildMs: 0,
};

const PART: Record<string, string> = { MC_Stone: "stone", MC_Timber: "timber", MC_Glass: "glass", MC_Roof: "roof", MC_Joinery: "joinery" };
const MATERIALS: Record<string, CityMaterial> = {
  MC_Stone: { facade: "stone", color: "#e6d3a2", roughness: 0.9, metallic: 0 },
  MC_Timber: { facade: "timber", color: "#6a4a30", roughness: 0.7, metallic: 0 },
  MC_Glass: { facade: "glass", color: "#20363e", roughness: 0.12, metallic: 0 },
  MC_Roof: { facade: "roof", color: "#9a8a9e", roughness: 0.35, metallic: 0 },
  MC_Joinery: { facade: "joinery", color: "#8a6440", roughness: 0.7, metallic: 0 },
  MC_Metal: { color: "#b08a3a", roughness: 0.35, metallic: 0.85 },
  // the lamps' glass: its albedo by day, lit to its night colour by the night amount
  MC_Glow: { color: "#f2dcae", emissiveNight: "#ffd38a", roughness: 0.4, metallic: 0, glow: 1.0, casts: false },
  MC_Water: { color: "#2c5e60", roughness: 0.06, metallic: 0.1, water: true },
  // A-7: the trees' own RGBA sheet (mc_leaf.png); alpha tested below (leafMaterial)
  MC_Leaf: { albedo: "mc_leaf.png", roughness: 0.75, metallic: 0 },
};
const IDENT: [number, number, number, number] = [1, 0, 1, 0];

const KIT: CityKit = {
  id: "mm", prefix: "mm", dir: "moonmere-cloister", metaKey: "moonmere",
  materials: MATERIALS,
  facades: [{
    name: "mc_facade", file: "mc_facade.jpg", rough: "mc_facade_rough.png", glow: { r: "mc_facade_night.png" },
    uv: { stone: IDENT, timber: IDENT, glass: IDENT, roof: IDENT, joinery: IDENT }, parts: PART,
  }],
  lod: MM_LOD,
  // a house's eave stands 12 m over its ground; the Long Tower and the towers pass their own
  cellHeight: 26, reach: 7, reachHeight: 14,
  grid: { sky: MM_SKY, originX: MM_SKY_ORIGIN[0], originZ: MM_SKY_ORIGIN[1] },
  shadowless: MM_SHADOWLESS,
  shadowSkip: ["MC_Glow#mm", "MC_Water#mm"],
  glows: {}, glowTags: { out: [], nightIn: [] },
  // by file (city_pools.ts glowMembership): nothing always; at night what has lit panes or lamps
  // (S2 review: and the boathouses' lit oculi and niches, bh_bay, which never bloomed)
  // (S4, L3's glow diet, A-14: NOT the houses' bays -- each house now keeps its own hours, lit room by
  // room (moonmere_night.ts lightByHouse), and the glow pass, which cannot read that, bloomed the dark
  // rooms' panes too; their lit panes burn in the main pass. The lamps, the study towers and the public
  // buildings still bloom, and the causeway's pylons with their lanterns)
  // (2026-10-11: and the Exchange's shell -- its lit panes and its sign's lit balance, ex_shell)
  glowNightOnly: /^(lamp_|tower_(a|b)|(lt|ar|lodge|pg|ch|mc|inn|sl|cg|ex)_shell$|lodge_shell_b$|bh_bay$|cw_head$)/,
  night: { facadeGlow: { r: 0.55 }, lamplitFrom: "MC_Glow", litStates: ["r"] },
  tintWhite: true,
  stats: moonmereCityStats,
};
const CITY = createCity(KIT);
export { KIT as MM_CITY_KIT };

/**
 * THE KIT IN ANOTHER ZONE (MM-15, A-14): the Shores' end of the causeway and its gate, in the
 * city's own pools and materials, its night (the lamps lit, the gate's panes) with it. Pieces at
 * world coordinates; their cells and pool distances as the city's (mmCellPlan).
 */
export function instanceOutside(pieces: Piece[], tag: string): { batches: number; cells: number } {
  const owner: Scene = scene;
  CITY.resetStats();
  CITY.nightGlow(owner, "r");
  return CITY.instance(owner, mmCellPlan(pieces) as Parameters<typeof CITY.instance>[1], 0, tag, "r");
}

/** MC_Leaf ALPHA TESTED (A-7). The shared instancer binds a sheet as albedo and
 * knows nothing of alpha (city-architecture.ts is read-only here), so the caller
 * finishes the one material it makes for the trees: the sprays' clear texels cut
 * at 0.45 -- in the shadow map too, which reads the albedo's alpha when a
 * material tests it. */
function leafMaterial(owner: Scene): void {
  const m = CITY.material(owner, "MC_Leaf");
  if (!(m instanceof PBRMaterial) || m.metadata?.mmLeaf) return;
  const t = m.albedoTexture;
  if (t) t.hasAlpha = true;
  m.useAlphaFromAlbedoTexture = true;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  m.alphaCutOff = 0.45;
  m.metadata = { ...(m.metadata ?? {}), mmLeaf: true };
}

/** which part of the city a build takes: by its cell, or (the ground runs and
 * the streets, which are city-wide) by where the piece stands */
export interface Part {
  name: string; cells: Set<string>; box: { x0: number; x1: number; z0: number; z1: number };
  /** (S2) more of the city-wide ground runs than the box holds: a run's piece taken by its run and place */
  ground?: (run: string, x: number, z: number) => boolean;
}
/**
 * THE CROWN (MOONMERE.md section 8, "The gate district"): Academy Court, the
 * Precinct Gate, PW and the Exchange (PE until 2026-10-11), the Archive, the two lodges, blocks N1 and
 * N2 (with N2's study tower), the quay rows QN and QNW, the Customs House, the
 * Mere Stair and flight 2, the Harbour Jetty, the north quay walls and the bare
 * risers there, and the Long Tower (shell, louvres -- and, A-4, its interior
 * and the Provost's loggia, so the annex door the story needs is walked to).
 */
export const CROWN: Part = {
  name: "crown",
  // (2026-10-11: PE's plot is the Exchange's)
  cells: new Set(["N1", "N2", "QN", "QNW", "PW", "exchange", "precinctGate", "archive", "registry", "bursar", "customs", "longTower", "loggia", "jetty", "academy"]),
  box: { x0: -75, x1: 70, z0: 80, z1: 215 },
};
/**
 * L1 (S2, MOONMERE.md section 8's step L1): THE CROWN, AND THE COLLEGE ARM AND THE MERE -- blocks
 * E1-E4 with E2's study tower, the East Terrace's outer rows ER1 and ER2, the Mending College with
 * its tower, the quay rows QE and QW (the Crown holds QN and QNW), the boathouses on the east horn
 * and the Sea Lamp on the west, the boats; the ground runs of the Mere (the whole of riser R1 under
 * the Mere Walk, round the mere) and of the College Arm (riser R2 east of the Mere Stair).
 */
const L1_CELLS = ["E1", "E2", "E3", "E4", "ER1", "ER2", "QE1", "QE2", "QW1", "QW2", "college", "tower_college", "tower_E2", "boathouses", "seaLamp"];
export const L1: Part = {
  name: "l1",
  cells: new Set([...CROWN.cells, ...L1_CELLS]),
  box: CROWN.box,
  // (R1 is the Mere's whole ring; R2's east arm is the College Arm's, from the mouth's east side
  // round to the Crown's box -- the West Arm's R2 stays unbuilt until L2)
  ground: (run, x, z) => run === "rk_R1" || (run === "rk_R2" && x > 20 && z < 150),
};
/**
 * L2 (S3, MOONMERE.md section 8's step L2): THE WHOLE CITY -- L1, and the West Arm (blocks W1-W4
 * with the Lemon Court's study tower, the Scriveners' Row WR1/WR2 and the Long Garden behind it),
 * the Landing (the Causeway Gate, the Landing Row with Ada's and Quill's shops, the Shelf Inn on
 * its piles and its pier, the spit's strand) and the knoll (Observatory Close, the Burned Shelf,
 * the Alchemists, beside the Long Tower the Crown already built); every ground run of the island.
 * Every cell the planners make is in it: what `&mmall` projected since GATE-1 is now play.
 */
export const L2: Part = {
  name: "l2",
  cells: { has: () => true } as unknown as Set<string>,
  box: { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 },
};
const base = (cell: string) => cell.split("@")[0].split("/")[0];
/** the ground runs and the street flights are cut by place, everything else by its cell */
export function inPart(part: Part, cell: string | undefined, x: number, z: number): boolean {
  if (!cell) return false;
  const b = base(cell);
  if (part.cells.has(b)) return true;
  // THE STREET FLIGHTS ARE EVERY PART'S (FLIGHT_BODIES): the terrain under a
  // flight only cuts now, so a flight not drawn would be a ramp over a trench
  if (b.startsWith("st_") || b === "rk_flank") return true;
  // THE QUAY RING IS EVERY PART'S TOO (A-7): the mere's edge is one wall, and
  // the ground shader drops the terrain's bank inside the quay line (zones/
  // moonmere.ts MoonmereLawnPlugin) -- a stretch of ring left unbuilt showed
  // the sky through the water where the bank had stood. One pool either way
  if (b === "quay") return true;
  // THE CAUSEWAY IS EVERY PART'S (MM-15, A-14): the arrival's road, whatever part of the city is built
  if (b.startsWith("cw:")) return true;
  if (part.ground?.(b, x, z)) return true;
  if (b === "quay" || b.startsWith("rk_") || b.startsWith("gr:")) {
    return x >= part.box.x0 && x <= part.box.x1 && z >= part.box.z0 && z <= part.box.z1;
  }
  return false;
}

/** the part's pieces, as the instancer is handed them */
export function partPieces(P: MoonmerePlan, part: Part): Piece[] {
  const all = [...P.B.pieces, ...P.C.pieces, ...P.S.pieces, ...P.H.pieces, ...P.D.pieces].filter((p) => inPart(part, p.cell, p.x, p.z));
  return mmCellPlan(all);
}

const centre = (b: { cx: number; cz: number }) => [b.cx, b.cz] as const;
/**
 * Build a part of the city: its modules through the instancer, then everything
 * that makes them solid and walkable. Pieces stand at their own (world)
 * heights: the floor handed to the instancer is 0.
 */
export function buildMoonmereCity(P: MoonmerePlan, part: Part): void {
  const t0 = performance.now();
  const owner: Scene = scene;
  CITY.resetStats();
  CITY.nightGlow(owner, "r");
  leafMaterial(owner);
  const pieces = partPieces(P, part);
  const made = CITY.instance(owner, pieces as Parameters<typeof CITY.instance>[1], 0, "city", "r");
  // the lamps' pools on the ground at night (moonmere_night.ts, A-7)
  paintLampPools(pieces.filter((p) => p.file.startsWith("lamp_")));
  const keep = <T extends { cell?: string }>(xs: T[], at: (x: T) => readonly [number, number]) => xs.filter((x) => { const [a, b] = at(x); return inPart(part, x.cell, a, b); });

  // SOLID: every house body (open where it is walked into), wall, pier, gate
  // jamb, parapet, quay ledge, garden wall and the dressing that stands on the
  // ground
  const boxes: Box[] = [...keep(P.B.boxes, centre), ...keep(P.C.boxes, centre), ...keep(P.S.boxes, centre), ...keep(P.H.boxes, centre), ...keep(P.D.boxes, centre)];
  for (const b of boxes) buildApi.addBoxCollider(b.cx, b.cz, b.hx, b.hz, b.yaw, b.y1, b.y0 ?? -1e9);
  // WALKABLE: the floors walked into (a roof terrace is drawn, never walked: its
  // parapet keeps the walker off), the jetty; the street landings are flights()'s
  const decks: Deck[] = [...keep(P.B.decks, centre), ...keep(P.C.decks, centre), ...keep(P.H.decks, centre)].filter((d) => d.walk !== false);
  for (const d of decks) buildApi.addDeck(d.cx, d.cz, d.hx, d.hz, d.yaw, d.y, d.holes.map((h) => buildApi.obb(h.cx, h.cz, h.hx, h.hz, h.yaw)));
  // the stairs: a ramp along the nosing line, and for an interior flight a body
  // solid beside and under it (CITY-BUILD "Colliders": a ramp alone is walked
  // under, and through from the side)
  const ramps: Ramp[] = [...keep(P.B.ramps, (r) => [r.x0, r.z0]), ...keep(P.C.ramps, (r) => [r.x0, r.z0]), ...keep(P.H.ramps, (r) => [r.x0, r.z0])];
  for (const r of ramps) {
    // (an interior flight walks wider than it is drawn: walkHalf, which the site records share; and
    // at the site records' own 0.1 mm rounding, S5 -- at the raw ends a walker on a flight's exact
    // edge was on the client's stair and 3e-15 m off the server's, which then kept them a floor down)
    const q = (v: number) => Math.round(v * 1e4) / 1e4;
    buildApi.addRamp(q(r.x0), q(r.z0), q(r.y0), q(r.x1), q(r.z1), q(r.y1), q(walkHalf(r)), r.pad);
    // (its own depth, not solid to the ground: an upper flight's body solid down to
    // the ground walled off the floors under it -- MEASURED, the Long Tower's F2
    // stopped a walker on floor 0 at its door)
    if (r.stair) {
      buildApi.addStairBody(r.x0, r.z0, r.y0, r.x1, r.z1, r.y1, r.half, Math.abs(r.y1 - r.y0) + 0.3);
      stairRails(r);
    }
  }
  // THE FOLLOW CAMERA stays inside a room walked into: the civic rooms, and each
  // house interior's room from its floor 0 to its eave
  const rooms = keep(P.C.rooms, centre);
  for (const r of rooms) buildApi.addCameraRoom({ ...buildApi.obb(r.cx, r.cz, r.hx, r.hz, r.yaw), y0: r.y0, y1: r.y1 });
  const houses = new Map(P.B.houses.map((h) => [h.id, h]));
  let nRooms = rooms.length;
  for (const it of P.B.interiors) {
    const h = houses.get(it.house)!;
    if (!inPart(part, h.block, it.rect.cx, it.rect.cz)) continue;
    buildApi.addCameraRoom({ ...buildApi.obb(it.rect.cx, it.rect.cz, it.rect.hx - 0.3, it.rect.hz - 0.3, it.rect.yaw), y0: it.floors[0], y1: h.eaveY });
    nRooms++;
  }
  // FOOTPRINTS (the meadow kept off, the houses on the zone map): recordFootprint
  // takes axis-aligned boxes, so a turned body is laid as a run of 3 m squares
  const fps = [...P.B.footprints, ...P.C.footprints].filter((f) => f.body && inPart(part, f.cell ?? f.id, f.body.cx, f.body.cz));
  let nfp = 0;
  for (const f of fps) nfp += turnedFootprint(f.body!);
  // THE GLOW PASS: the bodies as one occluder mesh, 0.8 m inside every face and
  // under the eave, so a lit pane or a lamp on a facade is never behind it
  const occ = [] as { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }[];
  for (const h of P.B.houses) {
    if (!inPart(part, h.block, h.body.cx, h.body.cz)) continue;
    occ.push({ ...h.body, hx: h.body.hx - 0.8, hz: h.body.hz - 0.8, y0: h.groundY - 1, y1: h.eaveY - 0.8 });
  }
  for (const f of P.C.footprints) {
    if (!f.body || !inPart(part, f.cell ?? f.id, f.body.cx, f.body.cz)) continue;
    const top = f.id === "longTower" ? 36 : f.id === "archive" || f.id === "college" ? 12 : 8;
    if (f.id === "college") {
      // THE COLLEGE IS A RING ROUND ITS GARTH (S2 review, LOOKED at night on floor 1 of the ward: a
      // blurred lit window on the plain plaster beside the real one). One box over the whole
      // footprint held the garth's own faces inside it -- their lit panes 0.8 m behind the ward's
      // court wall, with nothing between them and a camera in the ward. Four boxes, one a range,
      // 0.8 inside its outer face and its court face (the side and back ranges behind their
      // ambulatories, whose lamps light the garth), so every pane of the garth is outside them and
      // the ward's court wall is an occluder's face
      const b = f.body, ring: [number, number, number, number][] = [
        [-b.hx + 0.8, 6.8, b.hx - 0.8, b.hz - 0.8], [-b.hx + 0.8, -b.hz + 0.8, b.hx - 0.8, -8.9],
        [10.9, -8.9, b.hx - 0.8, 6.8], [-b.hx + 0.8, -8.9, -10.9, 6.8],
      ];
      for (const [u0, v0, u1, v1] of ring) {
        const [x, z] = localToWorld(b.cx, b.cz, b.yaw, (u0 + u1) / 2, (v0 + v1) / 2);
        occ.push({ cx: x, cz: z, hx: (u1 - u0) / 2, hz: (v1 - v0) / 2, yaw: b.yaw, y0: f.level - 1, y1: f.level + top - 0.8 });
      }
      continue;
    }
    occ.push({ ...f.body, hx: f.body.hx - 0.8, hz: f.body.hz - 0.8, y0: f.level - 1, y1: f.level + top - 0.8 });
  }
  // S1 review: THE MERE STAIR'S MASONRY. Its well's walls, the terrace's walls and the Moon
  // Fountain's bastion stand 3.6-4.5 m over their floors, and the crystal's halo and the court
  // lamps' bloomed through them, by day and at night, in both engines (LOOKED, the review's w07
  // and n3: a pick through the "wisp" hit the paving behind the wall, then the crystal 38 m
  // off). Each is its own box in the occluder: a 0.4 m wall 0.08 either side of its middle, up
  // to its coping's top (its collider stops 0.12 under it); the bastion 0.8 inside its faces
  for (const b of keep(P.S.boxes, centre)) {
    if (!/^(well mere_stair_upper|terrace (wall|parapet)|the Moon Fountain)$/.test(b.what)) continue;
    const wallish = Math.min(b.hx, b.hz) <= 0.25;
    // (a wall's run carried 0.2 m past its ends, so two walls' occluders meet in the corner pier
    // between them -- the bloom showed through the terrace's north-west corner, LOOKED)
    const shrink = (h: number) => (h <= 0.25 ? 0.08 : wallish ? h + 0.2 : Math.max(0.1, h - 0.8));
    occ.push({ cx: b.cx, cz: b.cz, yaw: b.yaw, hx: shrink(b.hx), hz: shrink(b.hz), y0: (b.y0 ?? b.y1 - 4) + 0.3, y1: wallish ? b.y1 + 0.1 : b.y1 - 0.2 });
  }
  glowOccluder(`mm_glow_${part.name}`, occ.filter((o) => o.hx > 0 && o.hz > 0));

  const S = moonmereCityStats;
  S.pieces = pieces.length; S.batches = made.batches; S.cells = made.cells; S.boxes = boxes.length; S.decks = decks.length;
  S.ramps = ramps.length; S.rooms = nRooms; S.houses = [...houses.values()].filter((h) => inPart(part, h.block, h.body.cx, h.body.cz)).length;
  S.footprints = nfp; S.occluders = occ.length; S.buildMs = Math.round(performance.now() - t0);
}

/**
 * THE INTERIOR FLIGHTS RAILED (S1; the Crown report's "76 falls of 1.5-1.7 m off stair sides
 * near their heads"). MEASURED with the flood (now tools/qa/moonmere_flood.mjs): every one was an
 * interior flight -- the Archive's, the lodges', the Precinct houses', the Long Tower's well
 * stair -- or the Jetty's root over its water stair. The stair body is solid BESIDE and under a
 * flight, so nobody walks into it from the floor below; but a walker high on the flight could
 * step off its open side into the well, 1.5-3.5 m down. A balustrade's worth of collider along
 * both sides, in three runs following the rise, from where the flight stands 1.45 m over its foot
 * to its head (where it is walked off forward, never sideways).
 */
function stairRails(r: Ramp): void {
  const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
  const rise = Math.abs(r.y1 - r.y0);
  if (len < 1 || rise < 1.6) return;
  const ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len, yaw = Math.atan2(ux, uz);
  const up = r.y1 >= r.y0, foot = Math.min(r.y0, r.y1);
  // (only where the flight stands 1.45 m over its foot: below that a step off its side is no
  // fall worth a rail, and the rail's foot (1.25 over the floor) stays over the head of anyone
  // walking the floor beside the flight -- resolveCollision turns a body away from a box whose
  // foot is within 1.2 m over its feet, and the routes walk round the flights' feet)
  const s1 = len * 1.45 / rise;
  // (and only to where it is within 0.9 m of the floor it arrives at: from there up, what lies
  // beside a flight in its well is that floor -- a step up, never a fall -- and the routes that
  // turn off a head along the floor above are not caught on them)
  const s2h = len * 0.9 / rise;
  const [sa, sb] = up ? [s1, len - s2h] : [s2h, len - s1];
  if (sb - sa < 0.5) return;
  const N = 3;
  for (let k = 0; k < N; k++) {
    const s0 = sa + (sb - sa) * k / N, s2 = sa + (sb - sa) * (k + 1) / N, sm = (s0 + s2) / 2;
    const top = Math.max(r.y0 + (r.y1 - r.y0) * s0 / len, r.y0 + (r.y1 - r.y0) * s2 / len);
    // (its top never reaches the floor the flight arrives at: anyone standing on that floor beside
    // the flight's head walks on -- resolveCollision lets a body over a box's top pass -- while
    // anyone still on the flight, under the floor's level, is turned back onto it)
    const y1 = Math.min(top + 1.0, Math.max(r.y0, r.y1) - 0.05);
    for (const side of [-1, 1]) {
      // (its inner face 0.42 m clear of the flight's edge: the walker's body is 0.45 m round
      // (resolveCollision's R), so one walking the flight's middle never brushes it, and one
      // stepping off sideways is held with its centre still over the stair)
      const o = side * (r.half + 0.5);
      buildApi.addBoxCollider(r.x0 + ux * sm + uz * o, r.z0 + uz * sm - ux * o, 0.08, (s2 - s0) / 2, yaw, y1, foot + 1.25);
    }
  }
}

function turnedFootprint(b: Body): number {
  const nu = Math.max(1, Math.round((2 * b.hx) / 3)), nv = Math.max(1, Math.round((2 * b.hz) / 3));
  const su = (2 * b.hx) / nu, sv = (2 * b.hz) / nv, side = Math.max(su, sv);
  let n = 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const [x, z] = localToWorld(b.cx, b.cz, b.yaw, -b.hx + (i + 0.5) * su, -b.hz + (j + 0.5) * sv);
    buildApi.footprint(x, z, side, side);
    n++;
  }
  return n;
}
