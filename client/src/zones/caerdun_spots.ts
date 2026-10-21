// Caerdun's story spots on paper (CAERDUN-CONTRACT.md 4.8): all 81 ids -- the spawn,
// the portal, the crystal, 7 landmarks, 44 NPCs, 9 interactables, 6
// furnishings and 12 sites (6 kept, 6 dropped) -- and the checks that tie each
// one to what the planners build: on its floor, inside its site, standing on a
// deck where it is up a storey, and clear of every collider and footprint. The
// plan's `spots` are the source of truth for the data move into zones.json
// (CITY-BUILD.md "The data move"). No Babylon here.
//
// THE RULINGS THEY KEEP: CF-9, the crystal does not move (25, -18), so no
// stored home point moves with it; CF-6, all 43 NPCs are kept, at street level
// or on upper floors where their quests and text put them, and CF-18 adds the
// 44th, the lighthouse keeper cd1 names; CF-7, cd1's four watch posts stand on
// the walkable wall in walk order, the crown terrace the highest; CF-16, the guild
// masters stand in their halls' lit vestibules (`room`: the hall); CF-22, the exit
// portal stands in the barbican's arch on the city side of the drawbridge, and the
// spawn and the caerdunfields landing (cf_caerdun tx/tz) inside, in the barbican
// court, facing the city (CF-5 had them out on the glacis road).
import { local, toLocal, polyDist, type P2 } from "./caerdun_frame.ts";

export type Region = "city" | "harbour" | "wall" | "outside";
export interface Spot {
  x: number; z: number; y?: number; region: Region;
  kind?: "portal" | "landmark" | "milestone" | "interactable" | "npc" | "furnishing";
  site?: string; floor?: number; home?: string; yaw?: number; why: string;
  /** at street level inside a house's open room (sg_house_open): the house's id (CF-6);
   *  or inside a guild hall's vestibule (sg_guild_hall): the hall's id (CF-16);
   *  or in the barbican's passage (the exit portal, CF-22): "barbican" */
  room?: string;
}
export interface Site {
  cx: number; cz: number; yaw?: number; span?: number; len?: number; r?: number;
  floors: number[]; shell: string; name: string; groundCells?: boolean;
}

/** true when (x, z) is inside the site's box (or circle) -- a sited NPC answers
 *  only a player inside its site (SiteLevels.reachable?), so a box must cover
 *  the whole room (the CITY-BUILD trap) */
export function inSite(s: Site, x: number, z: number, pad = 0): boolean {
  if (s.r !== undefined) return Math.hypot(x - s.cx, z - s.cz) < s.r + pad;
  const [u, v] = toLocal(s.cx, s.cz, s.yaw ?? 0, x, z);
  return Math.abs(u) < s.span! / 2 + pad && Math.abs(v) < s.len! / 2 + pad;
}
/** the site's box as a polygon (span along its local x, len along its local z) */
export function sitePoly(s: Site): P2[] {
  if (s.r !== undefined) return Array.from({ length: 16 }, (_, k) => [s.cx + s.r! * Math.cos((k * Math.PI) / 8), s.cz + s.r! * Math.sin((k * Math.PI) / 8)] as P2);
  const hx = s.span! / 2, hz = s.len! / 2;
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as P2[]).map(([u, v]) => local(s.cx, s.cz, s.yaw ?? 0, u, v));
}

/** the contract's counts (CF-6), the lighthouse keeper CF-18 added, and the auction
 *  house's three more brokers (2026-10-11: four counters, Broker Ashby at one) */
export const NPCS = 47, RESIDENTS = 29;

/** How far a ground spot stands clear of a set of footprints (negative: inside one). */
export function clearOf(x: number, z: number, polys: P2[][]): number {
  let d = Infinity;
  for (const p of polys) d = Math.min(d, polyDist(x, z, p));
  return d;
}
