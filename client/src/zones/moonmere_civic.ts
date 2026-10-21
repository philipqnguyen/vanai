// Moonmere's named buildings on paper (MOONMERE.md sections 2 and 3): their
// shells, the rooms that are walked into (MM-4), their floors, stairs and
// walls, and the 11 site records site_levels.rb replays -- the 8 regenerated,
// plus burned_shelf, alchemists and shelf_inn (D-6). No Babylon.
//
// Every interior is in the layout's `interiors`, in its own local frame (the
// shells: origin at the footprint centre on the ground, +z the front); this
// file only places them. The Long Tower's (lt_in) is section 2 exactly: five
// straight flights round the inside of its walls, one hole a floor, the lobby
// with the star globe at the head of F0, and the annex behind the partition
// whose one gap is pinned to questDoor's 2.0 m opening (D-14).
import { MM, MM_FILES, lodsOf } from "./moonmere_kit.ts";
import { stamp, type BlocksOut } from "./moonmere_blocks.ts";
import type { Terrain } from "./moonmere_terrain.ts";
import {
  localToWorld, bodyCorners, wellRails, WELL_RAIL_Y0, walkHalf,
  type Body, type Box, type CameraRoom, type CivicRec, type Deck, type ExchangeArcade, type Footprint, type Interior, type Layout, type P2,
  type Piece, type Ramp, type SiteDeck, type SiteRamp, type SiteRecord,
} from "./moonmere_types.ts";

/** the interior each enterable civic building takes */
export const CIVIC_INTERIOR: Record<string, string> = {
  archive: "ar_in", registry: "lodge_in", bursar: "lodge_in", customs: "ch_in", college: "mc_in",
  longTower: "lt_in", burnedShelf: "bs_in", alchemists: "al_in", inn: "inn_in",
  // the Exchange's trading floor (2026-10-11): its counters and benches; the hall's linings, floor,
  // ceiling and board are its shell's, drawn at every distance through the open arches
  exchange: "ex_in",
  // the Provost's loggia is the Long Tower's floor 0 carried out under its arcade
  // (planOne's loggia branch reads lt_in's floor 0). K1's walk found it missing
  // here: the loggia then had no deck, no step and no camera room, and a walker
  // went at the ground's 21.6 through a floor drawn at 22.2
  loggia: "lt_in",
};
/** the site box of each sited building, in its own frame: centre (u, v) and extents */
const SITE_BOX: Record<string, (c: CivicRec) => { u: number; v: number; span: number; len: number; world?: { cx: number; cz: number; yaw: number } }> = {
  // the observatory's box takes in the Provost's loggia and every flight (section 2)
  longTower: () => ({ u: 0, v: 0, span: 19, len: 12, world: { cx: -57.5, cz: 178, yaw: 0 } }),
  // the College's floor 0 is its front range, the infirmary hall, with the wards over it
  college: () => ({ u: 0, v: 10.0, span: 31.2, len: 7.0 }),
  // the Exchange's hall (2026-10-11): the floor between the back wall's lining (v -4.9) and the
  // arcade's inner face (v 4.7), wall to wall -- the arches' depth is the court's, outside it
  exchange: (c) => ({ u: 0, v: -0.1, span: c.w - 2 * WALL_T, len: 9.6 }),
};
const SITE_NAMES: Record<string, string> = {
  returns_archive: "Returns Archive", registry_office: "Registry Office", bursars_office: "Bursar Office", observatory: "The Long Tower",
  mending_college: "The Mending College", burned_shelf: "The Burned Shelf", alchemists: "The Alchemists' Guild", shelf_inn: "The Shelf Inn",
  exchange: "The Exchange",
};
const SITE_SEEDS: Record<string, number> = {
  returns_archive: 729850, registry_office: 936010, bursars_office: 204317, mending_college: 501, shelf_inn: 61204, burned_shelf: 40961, alchemists: 77213,
};
const WALL_T = 0.6;
/** bh_bay's own width (build_moonmere_cloister_modules.py bh_bay: hw 2.3) */
const BH_BAY_W = 4.6;
const DOOR_GAP = 2.0;

export interface CivicOut {
  pieces: Piece[];
  boxes: Box[];
  decks: Deck[];
  ramps: Ramp[];
  rooms: CameraRoom[];
  sites: Record<string, SiteRecord>;
  footprints: Footprint[];
  occluders: Box[];
  entrances: { id: string; x: number; z: number; y: number }[];
  /** each civic building's base level (its "ground" datum) */
  base: Record<string, number>;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const siteDeck = (d: Deck): SiteDeck => ({
  cx: r4(d.cx), cz: r4(d.cz), hx: r4(d.hx), hz: r4(d.hz), sin: r4(Math.sin(d.yaw)), cos: r4(Math.cos(d.yaw)), y: r4(d.y),
  holes: d.holes.map((h) => ({ cx: r4(h.cx), cz: r4(h.cz), hx: r4(h.hx), hz: r4(h.hz), sin: r4(Math.sin(h.yaw)), cos: r4(Math.cos(h.yaw)) })),
});
// a stair's ramp already runs 0.05 past its nosings at both ends (CITY-BUILD
// "Colliders"; Track M's interior records carry the pad)
const siteRamp = (r: Ramp): SiteRamp => ({ x0: r4(r.x0), z0: r4(r.z0), y0: r4(r.y0), x1: r4(r.x1), z1: r4(r.z1), y1: r4(r.y1), half: r4(walkHalf(r)) });

export function planCivic(L: Layout, T: Terrain, B?: BlocksOut): CivicOut {
  const out: CivicOut = { pieces: [], boxes: [], decks: [], ramps: [], rooms: [], sites: {}, footprints: [], occluders: [], entrances: [], base: {} };
  for (const c of L.civic) stamp(out, c.id, () => planOne(L, c, out));
  // the three sited homes keep their old keys (D-7)
  if (B) {
    for (const [houseId, key] of Object.entries(L.homeSites)) {
      const it = B.interiors.find((i) => i.house === houseId);
      const h = B.houses.find((x) => x.id === houseId);
      if (!it || !h) throw new Error(`moonmere: no interior for the home ${houseId}`);
      // (the box starts at the room's front, the front wall's inner face, S5: from the facade plane
      // it took in the door's reveal, where the client walks the plinth's risers -- 0.7 m under the
      // floor 0 the server reads there, past SAME_FLOOR)
      const front = -(L.interiors[it.file]?.rooms[0]?.[3] ?? 0);
      const r = { ...it.rect, cx: it.rect.cx - Math.sin(it.rect.yaw) * front / 2, cz: it.rect.cz - Math.cos(it.rect.yaw) * front / 2, hz: it.rect.hz - front / 2 };
      const door = h.door!;
      const [ex, ez] = [door[0] + Math.sin(h.body.yaw) * 1.2, door[1] + Math.cos(h.body.yaw) * 1.2];
      out.sites[key] = {
        name: h.label ?? houseId, house_seed: +key.replace(/\D/g, ""), domestic: true,
        cx: r4(r.cx), cz: r4(r.cz), yaw: r4(r.yaw), span: r4(2 * r.hx), len: r4(2 * r.hz),
        floors: it.floors.map(r4), decks: it.decks.map(siteDeck), ramps: it.ramps.map(siteRamp), entrance: { x: r4(ex), z: r4(ez), y: r4(h.groundY) },
      };
    }
  }
  for (const p of out.pieces) if (!MM_FILES.has(p.file)) throw new Error(`moonmere: ${p.file} is not in the template list`);
  void T;
  return out;
}

/**
 * THE EXCHANGE'S WALLS (2026-10-11): the back and the two ends solid; the court face an ARCADE, solid
 * only at its piers -- the wall's 0.8 m (the drawn reveals' depth, so a walker stops on the jambs it
 * sees), and the pavilion's two piers carried out to its face 1.2 m proud. Every arch is open at the
 * court's level: the floor inside is the court's (ex_in floor 0 at 0.02, no step), so nothing is a
 * door, nothing needs a head (no floor above), and the hall needs no site (D-6: one level).
 */
function exchangeWalls(c: CivicRec, A: ExchangeArcade, wall: (u0: number, u1: number, v0: number, v1: number) => void): void {
  const hx = c.w / 2, hz = c.d / 2;
  wall(-hx, hx, -hz, -hz + WALL_T);
  wall(-hx, -hx + WALL_T, -hz + WALL_T, hz - A.wall);
  wall(hx - WALL_T, hx, -hz + WALL_T, hz - A.wall);
  const open = [...A.centres.map((x) => [x - A.half, x + A.half]), [-A.mid, A.mid]].sort((a, b) => a[0] - b[0]);
  let u = -hx;
  for (const [a, b] of open) { if (a - u > 0.05) wall(u, a, hz - A.wall, hz); u = b; }
  if (hx - u > 0.05) wall(u, hx, hz - A.wall, hz);
  const P = A.pavilion;
  for (const s of [-1, 1]) wall(s > 0 ? A.mid : -P.half, s > 0 ? P.half : -A.mid, hz, P.face);
}

function planOne(L: Layout, c: CivicRec, out: CivicOut): void {
  const base = c.id === "inn" ? L.terrain.levels.quay : c.level;
  out.base[c.id] = base;
  const at = (u: number, v: number) => localToWorld(c.x, c.z, c.yaw, u, v);
  const body: Body = { cx: c.x, cz: c.z, hx: c.w / 2, hz: c.d / 2, yaw: c.yaw };
  const top = base + (c.id === "longTower" ? 36 : c.id === "seaLamp" ? 16 : c.id === "college" || c.id === "archive" ? 12 : c.arcade ? c.arcade.eave + 1 : 9);
  if (c.id !== "loggia") out.footprints.push({ pts: bodyCorners(body), kind: "civic", id: c.id, level: base, body });
  if (c.shell === "bh_bay") {
    // three boat arches along the hard, on the water. (S2 review: each bay was stretched to its
    // third of the row over MM.bay, 4.0, but bh_bay is 4.6 wide -- so the bays overlapped 0.7 m,
    // each roof's eave and fascia standing inside the next bay's roof and poking past its gable
    // as floating timber, LOOKED. A bay is stretched over its own width: the three abut, their
    // party lines the shared valley gutters)
    for (const k of [-1, 0, 1]) {
      const [x, z] = at(k * c.w / 3, c.d / 2);
      out.pieces.push({ file: "bh_bay", cell: c.id, x, y: base, z, yaw: c.yaw, axes: [+(c.w / 3 / BH_BAY_W).toFixed(4), 1, 1], reach: 8 });
    }
    out.boxes.push({ ...body, y0: base - 1, y1: base + 7, what: `civic ${c.id}` });
    return;
  }
  if (c.shell) {
    const lods = lodsOf(c.shell);
    out.pieces.push({ file: c.shell, ...(lods ? { lods } : {}), cell: c.id, x: c.x, y: base, z: c.z, yaw: c.yaw, reach: Math.hypot(c.w, c.d) / 2 + 2 });
    if (c.shell === "lt_shell") out.pieces.push({ file: "lt_louvres", cell: c.id, x: c.x, y: base, z: c.z, yaw: c.yaw, reach: 10 });
  }
  const tplName = CIVIC_INTERIOR[c.id];
  if (!c.enter || !tplName) {
    // a gate: two piers either side of its passage, the head above it
    if (c.id === "causewayGate" || c.id === "precinctGate") {
      const half = c.id === "causewayGate" ? 3.0 : 2.0;
      for (const [u0, u1] of [[-c.w / 2, -half], [half, c.w / 2]]) {
        const [x, z] = at((u0 + u1) / 2, 0);
        out.boxes.push({ cx: x, cz: z, hx: (u1 - u0) / 2, hz: c.d / 2, yaw: c.yaw, y0: base - 1, y1: base + 10, what: `gate pier ${c.id}` });
      }
      const [x, z] = at(0, 0);
      out.boxes.push({ cx: x, cz: z, hx: half, hz: c.d / 2, yaw: c.yaw, y0: base + MM.gate[1] + 0.6, y1: base + 10, what: `gate head ${c.id}` });
    } else if (c.id !== "loggia") {
      out.boxes.push({ ...body, y0: base - 1, y1: top, what: `civic ${c.id}` });
    }
    return;
  }
  const tpl: Interior = L.interiors[tplName];
  const tOrigin: P2 = tpl.origin ?? [c.x, c.z];
  const tYaw = tpl.yaw ?? c.yaw;
  const to = (u: number, v: number) => localToWorld(tOrigin[0], tOrigin[1], tYaw, u, v);
  if (c.id !== "loggia") {
    out.pieces.push({ file: tplName, cell: `${c.id}/in`, x: tOrigin[0], y: base, z: tOrigin[1], yaw: tYaw, reach: Math.hypot(c.w, c.d) / 2 + 2 });
    // the shell's walls, the door left open
    const door = c.door!;
    const dl = [(door[0] - c.x) * Math.cos(c.yaw) - (door[1] - c.z) * Math.sin(c.yaw), (door[0] - c.x) * Math.sin(c.yaw) + (door[1] - c.z) * Math.cos(c.yaw)];
    const hx = c.w / 2, hz = c.d / 2;
    const wall = (u0: number, u1: number, v0: number, v1: number) => {
      const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2);
      out.boxes.push({ cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw, y0: base - 1, y1: top, what: `wall ${c.id}` });
    };
    // the front wall stands behind a forward loggia where there is one (the
    // Customs House's five arches stand open on the apron in front of it)
    const vf = hz - (c.loggiaDepth ?? 0);
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    // THE DOOR'S HEAD (A-7; the walk review): a box over the gap from 2.4 m
    // above floor 0 to the top. Without it every upper floor walked out through
    // the wall over the door -- the Long Tower's F5 an 18 m fall onto the
    // Provost's loggia, the Archive's and the lodges' floor 1 onto the court
    const headY = base + tpl.floors[0] + 2.4;
    const head = (u0: number, u1: number, v0: number, v1: number) => {
      const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2);
      out.boxes.push({ cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw, y0: headY, y1: top, what: `door head ${c.id}` });
    };
    const frontWall = (side: "front" | "back" | "left" | "right") => {
      if (side === "front" || side === "back") {
        const v0 = side === "front" ? vf - WALL_T : -hz, v1 = side === "front" ? vf : -hz + WALL_T;
        if ((side === "front" && near(dl[1], vf)) || (side === "back" && near(dl[1], -hz))) {
          wall(-hx, dl[0] - DOOR_GAP / 2, v0, v1); wall(dl[0] + DOOR_GAP / 2, hx, v0, v1); head(dl[0] - DOOR_GAP / 2, dl[0] + DOOR_GAP / 2, v0, v1);
        } else wall(-hx, hx, v0, v1);
      } else {
        const u0 = side === "left" ? -hx : hx - WALL_T, u1 = side === "left" ? -hx + WALL_T : hx;
        const vTop = c.loggiaDepth ? hz : hz - WALL_T;
        if ((side === "left" && near(dl[0], -hx)) || (side === "right" && near(dl[0], hx))) {
          wall(u0, u1, -hz + WALL_T, dl[1] - DOOR_GAP / 2); wall(u0, u1, dl[1] + DOOR_GAP / 2, vTop); head(u0, u1, dl[1] - DOOR_GAP / 2, dl[1] + DOOR_GAP / 2);
        } else wall(u0, u1, -hz + WALL_T, vTop);
      }
    };
    if (c.arcade) exchangeWalls(c, c.arcade, wall);
    else for (const s of ["front", "back", "left", "right"] as const) frontWall(s);
  } else {
    // the Provost's loggia: an arcade open to the stair, closed at its two ends
    const lw = (u0: number, u1: number, v0: number, v1: number) => {
      const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2);
      out.boxes.push({ cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw, y0: base - 1, y1: base + 7, what: "wall loggia" });
    };
    lw(-c.w / 2, -c.w / 2 + 0.5, -c.d / 2, c.d / 2);
    lw(c.w / 2 - 0.5, c.w / 2, -c.d / 2, c.d / 2);
  }
  // floors, holes and stairs, in the interior's frame (Track M's record: rooms
  // [x0, z0, x1, z1, floor, ceiling], holes [floor, x0, z0, x1, z1])
  const floors = tpl.floors.map((f) => base + f);
  const decks: Deck[] = [];
  const ramps: Ramp[] = [];
  const rect = (r: number[]) => {
    const [x, z] = to((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
    return { cx: x, cz: z, hx: (r[2] - r[0]) / 2, hz: (r[3] - r[1]) / 2 };
  };
  if (c.id === "loggia") {
    // the Provost's loggia: the Long Tower's floor 0 carried out under its arcade
    // (lt_shell builds its floor at 0.6)
    // (lapping 0.8 m back into the tower's door, whose floor is the tower's: met
    // edge to edge, the threshold was a 0.6 m dip to the knoll's ground -- K1's walk)
    const [lx, lz] = at(0, -0.4);
    decks.push({ cx: lx, cz: lz, hx: c.w / 2 - 0.5, hz: c.d / 2 + 0.4, yaw: c.yaw, y: base + tpl.floors[0], holes: [], what: "longTower loggia" });
    // (its camera room laps the door as its deck does, S5: met edge to edge with the tower's room, the
    // door's 0.8 m reveal was outdoors, and the follow camera, let out there, snapped to 0.05 m on the
    // tower's side -- moonmere_camera.mjs)
    out.rooms.push({ cx: lx, cz: lz, hx: c.w / 2, hz: c.d / 2 + 0.4, yaw: c.yaw, y0: base + tpl.floors[0], y1: base + tpl.floors[0] + MM.storey });
  } else {
    for (const r of tpl.rooms) {
      const k = tpl.floors.indexOf(r[4]);
      if (k < 0) continue;
      const holes = tpl.holes.filter((h) => h[0] === k).map((h) => ({ ...rect(h.slice(1)), yaw: tYaw }));
      decks.push({ ...rect(r), yaw: tYaw, y: base + r[4], holes, what: `${c.id} floor ${k}` });
      out.rooms.push({ ...rect(r), yaw: tYaw, y0: base + r[4], y1: base + r[5] });
    }
    // the stair wells railed (A-7): every hole's edges but the one its stair arrives by
    for (const h of tpl.holes) {
      const k = h[0], fy = base + tpl.floors[k];
      const st = tpl.stairs.find((q) => Math.abs(base + q.y1 - fy) < 0.05 && q.x1 >= h[1] - 0.6 && q.x1 <= h[3] + 0.6 && q.z1 >= h[2] - 0.6 && q.z1 <= h[4] + 0.6);
      if (!st) continue;
      for (const r of wellRails([h[1], h[2], h[3], h[4]], [st.x1, st.z1], st.half)) {
        out.boxes.push({ ...rect(r), yaw: tYaw, y0: fy + WELL_RAIL_Y0, y1: fy + 1.0, what: `${c.id} well rail` });
      }
    }
    for (const s of tpl.stairs) {
      const [x0, z0] = to(s.x0, s.z0), [x1, z1] = to(s.x1, s.z1);
      // (the flight itself is drawn by the interior template's flight_rec: NO int_stair piece over
      // it -- until 2026-10-09 one was placed here as well, so every civic and tower flight was
      // drawn twice: the treads Z-fought, and its dark stringer dived into the floor at the foot;
      // moonmere_stair_feet.test.mjs)
      ramps.push({ x0, z0, y0: base + s.y0, x1, z1, y1: base + s.y1, half: s.half, stair: true });
    }
    // AN UPPER ROOM'S OPEN EDGES (A-7; the walk review): where a floor's room is
    // smaller than the room under it, its edge over the floor below is a wall
    // in the module (the Archive's floor 2, Sorrel Quire's room, over the gallery)
    // and had no collider -- walking west from Quire went through the plaster
    // and 3.6 m down. Each such edge is a wall box at that floor, open only
    // where a stair arrives through it
    const r0 = tpl.rooms[0];
    for (const r of tpl.rooms) {
      const k = tpl.floors.indexOf(r[4]);
      if (k < 1) continue;
      const edges: [number, number, number, number][] = [];
      if (r[0] > r0[0] + 0.3) edges.push([r[0] - 0.3, r[1], r[0], r[3]]);
      if (r[2] < r0[2] - 0.3) edges.push([r[2], r[1], r[2] + 0.3, r[3]]);
      if (r[1] > r0[1] + 0.3) edges.push([r[0], r[1] - 0.3, r[2], r[1]]);
      if (r[3] < r0[3] - 0.3) edges.push([r[0], r[3], r[2], r[3] + 0.3]);
      for (const e of edges) {
        const through = tpl.stairs.some((st) => [[st.x0, st.z0], [st.x1, st.z1]].some(([sx, sz]) => sx >= e[0] - st.half - 0.3 && sx <= e[2] + st.half + 0.3 && sz >= e[1] - st.half - 0.3 && sz <= e[3] + st.half + 0.3));
        if (through) continue;
        out.boxes.push({ ...rect(e), yaw: tYaw, y0: base + r[4] - 0.2, y1: base + r[5], what: `${c.id} floor ${k} edge` });
      }
    }
    // S2 (walked: from the Mending College's ward and library a walker went through the range's
    // court-side wall and fell 4.2 and 7.8 m into the cloister garth). The front range's rooms end
    // at its court face, z 6.8, deep inside the shell, whose colliders are its outer walls only: that
    // face is a wall on every floor, open on floor 0 at its door through to the garth (mc_in's
    // lining gap, x -1..1, its head 2.6 m up)
    if (c.id === "college") {
      const r0 = tpl.rooms[0], zc = r0[1], T = 0.3, gap = 1.0;
      for (const [u0, u1] of [[r0[0], -gap], [gap, r0[2]]]) out.boxes.push({ ...rect([u0, zc - T, u1, zc]), yaw: tYaw, y0: base - 1, y1: top, what: "college court wall" });
      out.boxes.push({ ...rect([-gap, zc - T, gap, zc]), yaw: tYaw, y0: base + tpl.floors[0] + 2.6, y1: top, what: "college court door head" });
      // the step down from floor 0 to the garth through that door (the porter keeps the garth)
      const [x0, z0] = to(0, zc + 0.6), [x1, z1] = to(0, zc - 1.0);
      out.ramps.push({ x0, z0, y0: base + tpl.floors[0], x1, z1, y1: base, half: gap - 0.1, cell: c.id });
      // THE GARTH'S WALLS AND ITS AMBULATORY (S2 review: the shell's colliders were its outer walls
      // only, so from the garth a walker passed through the arcade's piers into the hollow ranges
      // -- the sky through their single-sided walls, LOOKED). In the shell's frame (mc_shell: the
      // garth |x| < 8, |z| < 6; the walks 2.4 m deep behind the three other faces' arcades): the
      // arcade's piers either side of each arch, the walk's back wall and its two end walls; the
      // hall's face, its one arch the court door, blind either side
      const sh = (u0: number, v0: number, u1: number, v1: number, what: string) => {
        const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2);
        out.boxes.push({ cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw, y0: base - 1, y1: top, what: `college ${what}` });
      };
      const GX = 8, GZ = 6, AMB = 2.4, FACE = 0.55;
      sh(-GX, GZ, -1.0, GZ + 0.45, "hall arcade"); sh(1.0, GZ, GX, GZ + 0.45, "hall arcade");
      // each of the other faces in its own (along, out) frame: the arcade's arches 3 m wide on 4 m centres
      const faces: { half: number; pt: (s: number, d: number) => [number, number] }[] = [
        { half: GZ, pt: (s, d) => [GX + d, s] },        // +x
        { half: GX, pt: (s, d) => [s, -GZ - d] },       // the back
        { half: GZ, pt: (s, d) => [-GX - d, s] },       // -x
      ];
      for (const f of faces) {
        const box = (s0: number, d0: number, s1: number, d1: number, what: string) => {
          const [ua, va] = f.pt(s0, d0), [ub, vb] = f.pt(s1, d1);
          sh(Math.min(ua, ub), Math.min(va, vb), Math.max(ua, ub), Math.max(va, vb), what);
        };
        const n = Math.round((2 * f.half) / 4), xs = Array.from({ length: n }, (_, i) => -f.half + (i + 0.5) * (2 * f.half) / n);
        let s = -f.half;
        for (const x of xs) { if (x - 1.5 - s > 0.05) box(s, 0, x - 1.5, FACE, "arcade pier"); s = x + 1.5; }
        if (f.half - s > 0.05) box(s, 0, f.half, FACE, "arcade pier");
        box(-f.half - 0.3, AMB, f.half + 0.3, AMB + 0.3, "walk wall");
        for (const e of [-1, 1]) box(e * f.half, FACE, e * (f.half + 0.3), AMB, "walk end");
      }
    }
    // the inner walls, on the floor the record names (`wallFloor`: the Long Tower's partition and
    // annex wall stand on floor 1; a hall's inner back wall on its floor 0, the default). The
    // generator's foot_check and moonmere_stair_feet.test.mjs read the same field
    const wallFloor = (tpl as Interior & { wallFloor?: number }).wallFloor ?? 0;
    for (const w of tpl.walls ?? []) {
      const fy = base + tpl.floors[wallFloor];
      out.boxes.push({ ...rect(w), yaw: tYaw, y0: fy - 0.2, y1: fy + MM.storey - 0.3, what: `${c.id} inner wall` });
    }
  }
  // the step up from the ground to floor 0 at the door: the client's to walk,
  // not the site's (it starts outside the site's box, where the site is not asked)
  if (c.id === "loggia") {
    const [x0, z0] = at(0, c.d / 2 + 1.2), [x1, z1] = at(0, c.d / 2 - 0.8);
    out.ramps.push({ x0, z0, y0: c.level, x1, z1, y1: base + tpl.floors[0], half: 3.0 });
  } else if (tpl.floors[0] > 0.05 && c.door && c.id !== "inn" && c.id !== "longTower") {
    const dl = (c.door[0] - c.x) * Math.cos(c.yaw) - (c.door[1] - c.z) * Math.sin(c.yaw);
    const [x0, z0] = at(dl, c.d / 2 + 1.0), [x1, z1] = at(dl, c.d / 2 - 0.6);
    out.ramps.push({ x0, z0, y0: base, x1, z1, y1: base + tpl.floors[0], half: 0.9 });
  }
  // S3 (walked: the Inn Pier's deck ends at the Shelf Inn's door, the inn's floor at its front wall's
  // inner face -- between them the wall's 0.6 m and the reveal, over the water, unwalkable). A
  // threshold through the door at floor 0, from inside the room to over the pier's end
  if (c.id === "inn" && c.door) {
    const dl = (c.door[0] - c.x) * Math.cos(c.yaw) - (c.door[1] - c.z) * Math.sin(c.yaw);
    const [tx, tz] = at(dl, c.d / 2 - 0.2);
    out.decks.push({ cx: tx, cz: tz, hx: DOOR_GAP / 2, hz: 1.2, yaw: c.yaw, y: base + tpl.floors[0], holes: [], what: "inn threshold" });
  }
  out.decks.push(...decks);
  out.ramps.push(...ramps);
  if (c.door) {
    const [ex, ez] = c.id === "loggia" ? at(0, c.d / 2 + 1.5) : [c.door[0] + Math.sin(c.yaw) * 1.5, c.door[1] + Math.cos(c.yaw) * 1.5];
    // (y, S5: the walk height outside the door, as every other zone's entrance carries -- the
    // street's level, or for the inn its pier's deck at the floor's height. quest_routes starts its
    // walk there; with no y it started on the sea bed under the Inn Pier, inside the pier's body)
    out.entrances.push({ id: c.id, x: ex, z: ez, y: c.id === "inn" ? base + tpl.floors[0] : base });
  }
  if (!c.site) return;
  // one site record a building; the loggia is the Long Tower's floor 0
  const key = c.site;
  // (the default box is the room inside the walls, S5: as the body, the box took in the door's
  // reveal, where the client walks the last of the step up to floor 0 -- the server, which reads
  // a site's ground as its floor 0, stood the walker up to 0.13 m above the client there, and
  // check_quest_routes.rb failed every civic route on it. Every floor and every story spot stands
  // inside the walls; nothing walks above floor 0 within WALL_T of a wall)
  const sb = SITE_BOX[c.id]?.(c) ?? { u: 0, v: 0, span: c.w - 2 * WALL_T, len: c.d - 2 * WALL_T };
  const [scx, scz] = sb.world ? [sb.world.cx, sb.world.cz] : at(sb.u, sb.v);
  const syaw = sb.world ? sb.world.yaw : c.yaw;
  const prev = out.sites[key];
  if (prev) {
    prev.decks.push(...decks.map(siteDeck));
    prev.ramps.push(...ramps.map(siteRamp));
    return;
  }
  const entrance = out.entrances.find((x) => x.id === c.id);
  out.sites[key] = {
    name: SITE_NAMES[key] ?? c.name, ...(SITE_SEEDS[key] ? { house_seed: SITE_SEEDS[key] } : {}),
    cx: r4(scx), cz: r4(scz), yaw: r4(syaw), span: sb.span, len: sb.len, floors: floors.map(r4),
    decks: decks.map(siteDeck), ramps: ramps.map(siteRamp), ...(entrance ? { entrance: { x: r4(entrance.x), z: r4(entrance.z), y: r4(entrance.y) } } : {}),
  };
}
