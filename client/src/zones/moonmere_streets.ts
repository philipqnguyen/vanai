// Moonmere's streets on paper (MOONMERE.md sections 2 and 7): every stair
// street's flights and landings, the graded corridors they are cut into the
// ground along, and the stone along the risers -- the parapets on every walking
// edge over a bare riser, the bare basalt face laid along every bare city riser
// (riser_rock, D-16), the garden walls flanking flight 2. No Babylon.
//
// THE STREET FLIGHT (flight_seg, section 5): 4 risers of 0.25 and treads of
// 0.52 -- a run of 2.08 a metre of rise, scene.ts's ROAD_GRADE. One module a metre
// of rise, origin on the centreline at its FOOT (the first riser's face), at the
// foot's level, +z UPHILL, the way it climbs (the module's own frame; A-5),
// stretched across to the street's width (5.0 m built).
//
// RULING 2's NOTE. A free-standing retaining wall along a bare riser is never
// built; a riser is bare rock (riser_rock) or the back of a house (MM-6). A
// parapet on a walking surface is not a retaining wall, and a flight crossing a
// riser is flanked by its blocks' end walls or garden walls.
import { MM } from "./moonmere_kit.ts";
import { landingRock, streetCut, type Cut, type Riser, type Terrain } from "./moonmere_terrain.ts";
import { planMereStair } from "./moonmere_merestair.ts";
import { nearestOnLine, pointAt, polyLen, type Box, type Deck, type Flight, type Layout, type P2, type Piece, type StreetRec } from "./moonmere_types.ts";

const SF = MM.streetFlight;
const CHORD = 4.0;
/** the parapet's top over its walking surface (datums) */
const PARAPET = MM.parapet;

export interface StreetsOut {
  pieces: Piece[];
  flights: Flight[];
  /** the landings between flights */
  decks: Deck[];
  /** parapets and garden walls */
  boxes: Box[];
  cuts: Cut[];
  /** the walking edges carrying a parapet: where nobody falls off a level */
  parapets: { riser: string; pts: P2[]; y: number }[];
  /** THE LANDINGS' FLOORS (S1 review): with flight bodies, a landing's level is the deck's alone
   * -- the ground under it only cuts, so it lies at the street's lower level (LOOKED: flight 2's
   * half-landing and the Mere Stair's lower landing were 3 m pits of lawn between their cheeks,
   * walked over on an invisible deck). zones/moonmere.ts lays each as a flat ribbon of flags at
   * its level, cheek to cheek. */
  floors: { id: string; pts: P2[]; half: number; y: number }[];
}

/** the flights and landings of one stair street, from its profile */
export function streetFlights(s: StreetRec): { flights: { s0: number; s1: number; y0: number; y1: number }[]; landings: { s0: number; s1: number; y: number }[] } {
  const flights: { s0: number; s1: number; y0: number; y1: number }[] = [], landings: { s0: number; s1: number; y: number }[] = [];
  const p = s.profile ?? [];
  for (let i = 1; i < p.length; i++) {
    const [s0, y0] = p[i - 1], [s1, y1] = p[i];
    if (s1 - s0 < 1e-6) continue;
    if (Math.abs(y1 - y0) > 1e-6) flights.push({ s0, s1, y0, y1 });
    else landings.push({ s0, s1, y: y0 });
  }
  return { flights, landings };
}

/** `flightBodies`: the flights stand on their own masonry, not on the ground
 * (mmTerrain `fill: false`; zones/moonmere.ts FLIGHT_BODIES). Then a landing is
 * the only floor between two flights, and a deck that only touches the ramp
 * leaves a seam a walker falls through (CITY-BUILD "Colliders and walking"), so
 * each landing's deck runs LAND_LAP over the flights either side. */
const LAND_LAP = 0.25;
export function planStreets(L: Layout, T: Terrain, opts: { flightBodies?: boolean } = {}): StreetsOut {
  const out: StreetsOut = { pieces: [], flights: [], decks: [], boxes: [], cuts: [], parapets: [], floors: [] };
  // the level streets a landing may cross (S2): every street drawn at one level, with its line
  const levelStreets = L.streets.filter((o) => o.kind !== "stair" && o.kind !== "deck" && typeof o.y === "number" && o.pts.length > 1)
    .map((o) => ({ id: o.id, y: o.y as number, half: o.half, pts: o.pts as P2[] }));
  for (const s of L.streets) {
    const c = streetCut(s);
    if (c) out.cuts.push(c);
    if (s.kind !== "stair" || !s.profile) continue;
    const { flights, landings } = streetFlights(s);
    const half = s.half;
    const sx = +((2 * half) / SF.width).toFixed(4);
    for (const f of flights) {
      const a = pointAt(s.pts, f.s0), b = pointAt(s.pts, f.s1);
      out.flights.push({
        street: s.id,
        ramp: { x0: a.x, z0: a.z, y0: f.y0, x1: b.x, z1: b.z, y1: f.y1, half, pad: 0.05 },
        body: { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, hx: half, hz: Math.hypot(b.x - a.x, b.z - a.z) / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z), y0: Math.min(f.y0, f.y1) - 0.4, y1: Math.max(f.y0, f.y1), what: `flight ${s.id}` },
      });
      // one flight_seg a metre of rise, from the foot up
      const up = f.y1 > f.y0;
      const rise = Math.abs(f.y1 - f.y0), n = Math.round(rise);
      const sFoot = up ? f.s0 : f.s1, dir = up ? 1 : -1;
      const run = (f.s1 - f.s0) / Math.max(1, n);
      for (let k = 0; k < n; k++) {
        const pk = pointAt(s.pts, sFoot + dir * k * run);
        // +z UPHILL, the direction of climb: flight_seg's own frame (Track M: "it climbs
        // along +z to (z 2.08, y 1.0)"). K1 (A-5) found every flight laid +z downhill
        // -- each 1 m segment's four risers faced up the stair, and its treads stood a
        // metre over the ramp at their foot (LOOKED: flight 2 from its head showed
        // riser faces, from its foot only treads)
        const yaw = Math.atan2(dir * pk.ux, dir * pk.uz);
        const y = Math.min(f.y0, f.y1) + k * rise / n;
        const sz = +(run / SF.run).toFixed(4);
        out.pieces.push({ file: "flight_seg", lods: ["flight_seg", "flight_seg_l1", "flight_seg_l1"], cell: `st_${s.id}`, x: pk.x, y, z: pk.z, yaw, axes: [sx, 1, sz], reach: 5 });
        // the cheeks hug the flight's two edges (cheek_wall is x 0..0.4 in its frame:
        // on the -x edge it stands at -(half + 0.4)); with FLIGHT_BODIES the flank
        // carries each down to the ground in the same frame
        const ex = Math.cos(yaw), ez = -Math.sin(yaw);
        const ux = Math.sin(yaw), uz = Math.cos(yaw);
        for (const lx of [half, -(half + 0.4)]) {
          const cx = pk.x + ex * lx, cz = pk.z + ez * lx;
          if (s.well !== undefined) {
            // MM-13: A FLIGHT IN A WELL (the Mere Stair's upper flight, between the
            // lodges): its cheeks are the well's walls, holding the court's level
            // either side and coped a parapet over it -- cheek_landing set at the
            // well's level, flat, its face carried down to the flight (no trench of
            // lawn beside it: the street's `trench`)
            out.pieces.push({ file: "cheek_landing", cell: `st_${s.id}`, x: cx, y: s.well, z: cz, yaw, axes: [1, 1, +(run / 2.0).toFixed(4)], reach: 4 });
            const mx = cx + ex * 0.2 + ux * run / 2, mz = cz + ez * 0.2 + uz * run / 2;
            out.boxes.push({ cx: mx, cz: mz, hx: 0.2, hz: run / 2 + 0.05, yaw, y0: y - 0.4, y1: s.well + 0.9, what: `well ${s.id}`, cell: `st_${s.id}` });
            continue;
          }
          out.pieces.push({ file: "cheek_wall", cell: `st_${s.id}`, x: cx, y, z: cz, yaw, axes: [1, 1, sz], reach: 4 });
          if (opts.flightBodies) out.pieces.push({ file: "flight_flank", lods: ["flight_flank", "flight_flank", "flight_flank"], cell: `rk_flank`, x: cx, y, z: cz, yaw, axes: [1, 1, sz], reach: 4 });
          // THE CHEEK IS SOLID (A-7; the walk review): drawn as a parapet a metre
          // high, it had no collider, and a walker stepped sideways off the Mere
          // Stair, flight 2 and the Observatory Stair onto the street 2.4-3.2 m
          // below. One box a segment, following the slope, the cheek's 0.4 m
          // thickness, from under the tread to a parapet over its head
          const mx = cx + ex * 0.2 + ux * run / 2, mz = cz + ez * 0.2 + uz * run / 2;
          out.boxes.push({ cx: mx, cz: mz, hx: 0.2, hz: run / 2 + 0.05, yaw, y0: y - 0.4, y1: y + rise / n + 0.9, what: `cheek ${s.id}`, cell: `st_${s.id}` });
        }
      }
    }
    for (const l of landings) {
      const a = pointAt(s.pts, l.s0), b = pointAt(s.pts, l.s1);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.3) continue;
      const lap = opts.flightBodies ? LAND_LAP : 0;
      const lyaw = Math.atan2(b.x - a.x, b.z - a.z);
      out.decks.push({ cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, hx: half, hz: len / 2 + lap, yaw: lyaw, y: l.y, holes: [], what: `landing ${s.id}`, cell: `st_${s.id}` });
      // (a landing between two flights; the level lanes at a stair's ends are planPaving's)
      if (opts.flightBodies && flights.some((f) => Math.abs(f.s1 - l.s0) < 1e-6) && flights.some((f) => Math.abs(f.s0 - l.s1) < 1e-6)) out.floors.push({ id: `landing_${s.id}_${out.floors.length}`, pts: [[a.x, a.z], [b.x, b.z]], half, y: l.y });
      // THE LANDING'S CHEEKS (A-7; the walk and look reviews): the flights had cheek
      // walls and flanks, the landings between them nothing -- an open side to step
      // off, and from the street a slab floating over the cut. cheek_landing in
      // cheek_wall's frame either side, stretched to the landing, and its collider
      if (opts.flightBodies) {
        const ex = Math.cos(lyaw), ez = -Math.sin(lyaw);
        // (S1 review: lapped 5 cm into the flights' cheeks either end -- the abutting faces left a
        // hairline seam down the Mere Stair's east cheek, LOOKED)
        const lux = Math.sin(lyaw), luz = Math.cos(lyaw), CL = 0.05;
        for (const lx of [half, -(half + 0.4)]) {
          // S2 (walked: the Mere Walk was cut at every cross stair): a landing that CROSSES another
          // street at its own level -- the Kiln's and the Herb Stair's runs over the Mere Walk, the
          // Ropewalk's head on the East Terrace -- has no cheek across that street: the cheek stood
          // as a 1.3 m wall over the promenade's width either side of the stair. Its runs are the
          // stretches whose cheek line lies outside every such street's corridor
          const side = lx + 0.2;
          const runs: [number, number][] = [];
          const N = Math.max(1, Math.ceil(len / 0.25));
          let r0: number | null = null;
          for (let k = 0; k <= N; k++) {
            const t = (k / N) * len, x = a.x + lux * t + ex * side, z = a.z + luz * t + ez * side;
            const open = levelStreets.some((o) => o.id !== s.id && Math.abs(o.y - l.y) < 0.05 && nearestOnLine(o.pts, x, z).d < o.half - 0.05);
            if (!open && r0 === null) r0 = t;
            if ((open || k === N) && r0 !== null) { const t1 = open ? t - 0.25 : t; if (t1 - r0 > 0.3) runs.push([r0, t1]); r0 = null; }
          }
          for (const [t0, t1] of runs) {
            const rl = t1 - t0, c0 = t0 === 0 ? CL : 0, c1 = t1 >= len - 1e-6 ? CL : 0;
            const px = a.x + lux * t0 + ex * lx - lux * c0, pz = a.z + luz * t0 + ez * lx - luz * c0;
            out.pieces.push({ file: "cheek_landing", cell: `st_${s.id}`, x: px, y: l.y, z: pz, yaw: lyaw, axes: [1, 1, +((rl + c0 + c1) / 2.0).toFixed(4)], reach: Math.max(4, rl / 2 + 1) });
            const tm = (t0 + t1) / 2;
            out.boxes.push({ cx: a.x + lux * tm + ex * (lx + 0.2), cz: a.z + luz * tm + ez * (lx + 0.2), hx: 0.2, hz: rl / 2 + 0.05, yaw: lyaw, y0: l.y - 0.4, y1: l.y + 0.9, what: `cheek ${s.id}`, cell: `st_${s.id}` });
          }
        }
      }
    }
  }
  // the garden walls either side of flight 2, from the Precinct backs to the
  // riser's foot (section 2, "The Precinct Gate")
  const f2 = L.streets.find((s) => s.id === "flight2");
  if (f2) {
    const x = f2.pts[0][0];
    for (const side of [-1, 1]) {
      const wx = x + side * (f2.half + 0.25), z0 = 194, z1 = 197.6;
      out.pieces.push({ file: "lane_wall", cell: "st_flight2", x: wx, y: L.terrain.levels.l2, z: (z0 + z1) / 2, yaw: side * Math.PI / 2, axes: [+((z1 - z0) / CHORD).toFixed(4), 1, 1], reach: 3 });
      out.boxes.push({ cx: wx, cz: (z0 + z1) / 2, hx: 0.25, hz: (z1 - z0) / 2, yaw: 0, y0: L.terrain.levels.l2 - 1, y1: L.terrain.levels.l2 + 2.2, what: "garden wall flight2", cell: "st_flight2" });
    }
  }
  // MM-13: the Mere Stair's fountain terrace -- its walls, the Moon Fountain, its lemons
  { const m = planMereStair(L); out.pieces.push(...m.pieces); out.boxes.push(...m.boxes); out.decks.push(...m.decks); }
  // along the risers: bare rock on every bare city riser, a parapet on every
  // walking edge above one (the outer coast's risers stay terrain, D-16)
  for (const r of [...T.risers(), ...landingRock(T)]) {
    if (!r.bare || r.outer) continue;
    rockAlong(out, r, T);
  }
  return out;
}

/** chords of about CHORD metres along a polyline */
function chords(pts: P2[]): { a: P2; b: P2 }[] {
  const L = polyLen(pts);
  const n = Math.max(1, Math.round(L / CHORD));
  const out: { a: P2; b: P2 }[] = [];
  for (let k = 0; k < n; k++) {
    const a = pointAt(pts, (k / n) * L), b = pointAt(pts, ((k + 1) / n) * L);
    out.push({ a: [a.x, a.z], b: [b.x, b.z] });
  }
  return out;
}

function rockAlong(out: StreetsOut, r: Riser, T: Terrain): void {
  const rise = r.y1 - r.y0;
  const top: P2[] = [];
  for (const { a, b } of chords(r.pts)) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    // which side is low: the module's +z faces it (the face is seen from below)
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    const gp = T.ground(mx + nx * 2.5, mz + nz * 2.5) ?? r.y0, gm = T.ground(mx - nx * 2.5, mz - nz * 2.5) ?? r.y0;
    const s = gp < gm ? 1 : -1;
    const yaw = Math.atan2(s * nx, s * nz);
    out.pieces.push({ file: "riser_rock", lods: ["riser_rock", "riser_rock_l1", "riser_rock_l1"], cell: `rk_${r.kind}`, x: mx, y: r.y0 - 0.3, z: mz,
      yaw, axes: [+(len / CHORD).toFixed(4), +((rise + 0.3) / 7.2).toFixed(4), 1], reach: 5 });
    // the walking edge at the top, one riser-run up the slope
    const tx = mx - s * nx * 1.4, tz = mz - s * nz * 1.4;
    top.push([tx, tz]);
    out.pieces.push({ file: "parapet_run", cell: `rk_${r.kind}`, x: tx, y: r.y1, z: tz, yaw, axes: [+(len / CHORD).toFixed(4), 1, 1], reach: 4 });
    out.boxes.push({ cx: tx, cz: tz, hx: len / 2, hz: 0.25, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), y0: r.y1 - 0.4, y1: r.y1 + PARAPET, what: `parapet ${r.id}`, cell: `rk_${r.kind}` });
  }
  if (top.length) out.parapets.push({ riser: r.id, pts: top, y: r.y1 });
}
