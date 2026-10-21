// Which way a body faces, and how the camera looks, when it enters a zone. The
// server keeps x and z only, so the client decides from the zone's data. Three
// kinds of arrival may say so, tried in this order:
//   - the zone's `start`: where a brand-new character of that city first stands
//     (Character::START_CITIES);
//   - its `spawn`: where a zone change or a fields landing puts you;
//   - a crystal (a `milestones` entry) with `arrive_h`: teleport_to_crystal,
//     teleport_home and a release to a crystal home point all land a body BESIDE
//     the plinth, at (crystal.x + 5, crystal.z + 3) -- server/lib/vanai/world.rb,
//     where the server picks that offset so nobody lands on the plinth's collider
//     (scene.ts CRYSTAL_ARRIVAL keeps that spot clear on the client);
//     test/arrival.test.mjs reads world.rb and holds the two equal.
//   - a PORTAL landing: the (tx, tz) of any zone's portal that leads here
//     (its `to`, or the `to_done` it takes once its quest is done).
// A `start` or `spawn` says `h`; a crystal says `arrive_h`; a portal may say `th`.
// Each heading is world.ts myH -- atan2(dx, dz), so 0 faces north (+z) -- and a
// start, spawn or crystal may add `camera_beta`. A crystal without `arrive_h` and a
// portal landing without `th` face the zone's CENTRE (Philip, 2026-10-10: "arrivals
// face INWARD toward the zone centre, never outward" -- the north default stood
// people at an east or south exit staring at the rim they had just come through).
// An entry within ARRIVAL_SNAP of one of those points takes its facing; any other
// entry keeps the camera looking north, as it always has. The snap is a metre: the
// server sends the landing's exact x, z, so an arrival is on its point; a metre
// still never reaches a neighbouring arrival.
// (Philip's rulings: Caerdun's new characters look up the Wall Stair at the Sea
// Gate (CF-23, CF-24), its arrivals from the Fields face the city from the
// barbican court (CF-22); arrivals face the city, crystal arrivals included.)
export interface Stand { x: number; z: number; h?: number;
  /** the camera's polar angle on arrival (ArcRotateCamera beta; 1.15, the game's,
   *  when omitted): Caerdun's start on the quay looks UP the Wall Stair at the Sea
   *  Gate and the city over the sea wall (CF-24), which 1.15's downward look,
   *  14 m back, keeps out of frame */
  camera_beta?: number }
/** a crystal's arrival: its plinth at (x, z), the body landing at the offset below */
export interface Crystal { x: number; z: number; arrive_h?: number; camera_beta?: number }
/** where a portal from another zone puts you down here, and its explicit heading if it has one */
export interface Landing { x: number; z: number; th?: number }
export interface ArrivalDef { start?: Stand; spawn?: Stand; milestones?: Crystal[]; landings?: Landing[] }

/** the heading from (x, z) toward the zone's centre (0, 0) */
export const towardCentre = (x: number, z: number): number => Math.atan2(-x, -z);

/**
 * Every portal landing in zone `key`: each portal in any zone whose `to` (or
 * `to_done`) is `key`, at its (tx, tz), with its `th` when it says one.
 */
export function portalLandings(zones: Record<string, { portals?: { to?: string; to_done?: string; tx?: number; tz?: number; th?: number }[] }>, key: string): Landing[] {
  const out: Landing[] = [];
  for (const z of Object.values(zones)) for (const p of z.portals ?? []) {
    if ((p.to !== key && p.to_done !== key) || typeof p.tx !== "number" || typeof p.tz !== "number") continue;
    out.push(p.th === undefined ? { x: p.tx, z: p.tz } : { x: p.tx, z: p.tz, th: p.th });
  }
  return out;
}

export const ARRIVAL_SNAP = 1.0;
/** where a crystal arrival lands, from the plinth: world.rb teleport_to_crystal and release */
export const CRYSTAL_LANDING: readonly [number, number] = [5, 3];

/** every point an arrival may face from, with its heading and camera pitch */
function arrivals(def: ArrivalDef | undefined): { x: number; z: number; h?: number; beta?: number }[] {
  const out: { x: number; z: number; h?: number; beta?: number }[] = [];
  for (const s of [def?.start, def?.spawn]) if (s) out.push({ x: s.x, z: s.z, h: s.h, beta: s.camera_beta });
  for (const m of def?.milestones ?? []) {
    const x = m.x + CRYSTAL_LANDING[0], z = m.z + CRYSTAL_LANDING[1];
    out.push({ x, z, h: m.arrive_h ?? towardCentre(x, z), beta: m.camera_beta });
  }
  for (const l of def?.landings ?? []) out.push({ x: l.x, z: l.z, h: l.th ?? towardCentre(l.x, l.z) });
  return out;
}

/** the heading an entry at (x, z) takes from the zone's start, spawn, a crystal or a portal landing, or undefined (keep north) */
export function arrivalHeading(def: ArrivalDef | undefined, x: number, z: number): number | undefined {
  for (const a of arrivals(def)) if (a.h !== undefined && Math.hypot(x - a.x, z - a.z) < ARRIVAL_SNAP) return a.h;
  return undefined;
}

/** the game camera's polar angle on entry: an arrival's own, or 1.15 */
export const DEFAULT_BETA = 1.15;
export function arrivalBeta(def: ArrivalDef | undefined, x: number, z: number): number {
  for (const a of arrivals(def)) if (a.beta !== undefined && Math.hypot(x - a.x, z - a.z) < ARRIVAL_SNAP) return a.beta;
  return DEFAULT_BETA;
}

/** the ArcRotateCamera alpha that looks along heading h (world.ts: camYaw = -alpha - pi/2) */
export const alphaFor = (h: number): number => -h - Math.PI / 2;
