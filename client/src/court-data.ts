// The courts' data on the client: the Babylon-free half the node tests read.
// shared/data/courts.json is passed in (data.ts imports it through @data and
// calls injectCourtHalls once, right after ZONES), so nothing here needs Vite.
//
// The audience halls live in courts.json, not zones.json (COURTS.md "The
// audience hall"; tmp/courts/PLAN.md 7): Caerdun's and Moonmere's NPCs and
// interactables are written into zones.json by their city plans' data moves,
// and another session is rewriting those plans, so both loaders inject the
// halls into the zone definitions at load instead -- the server in
// Courts::Halls.inject!, the client here, the same records on both sides. The
// scene then draws the herald through the NPC pipeline and the stations as
// interactables with existing props (notice_post, stamp_desk, document_desk);
// scene.ts needs no edit.

export const COURT_KEYS = ["caerdun", "heartwood", "moonmere"] as const;
export type CourtKey = typeof COURT_KEYS[number];
export const HALL_STATIONS = ["board", "registry", "swearing", "book"] as const;

/** A hall on an upper floor carries its site and floor (the server judges
 *  reach by them); a ground-level hall at most a height. */
function place(rec: any, hall: any): any {
  if (hall.y !== undefined) rec.y = hall.y;
  if (hall.site) { rec.site = hall.site; rec.floor = hall.floor; }
  for (const k of Object.keys(rec)) if (rec[k] === undefined || rec[k] === null) delete rec[k];
  return rec;
}

export function heraldRecord(court: string, hall: any): any {
  const h = hall.herald;
  return place({ id: h.id, name: h.name, title: h.title, kind: "herald", court, body: h.body,
    x: h.x, z: h.z, h: h.h, dialog: h.dialog ?? [] }, hall);
}

export function stationRecord(court: string, hall: any, s: any): any {
  const rec: any = { id: s.id, name: s.name, prop: s.prop, x: s.x, z: s.z, yaw: s.yaw,
    court_station: s.station, court };
  if (s.label) rec.label = s.label;
  if (s.next_label) rec.next_label = s.next_label;
  return place(rec, hall);
}

/** Adds each hall's herald to its city's npcs and its stations to its
 *  interactables. Idempotent, like the server's. */
export function injectCourtHalls(zones: Record<string, any>, courts: any): Record<string, any> {
  for (const [court, hall] of Object.entries<any>(courts.halls ?? {})) {
    const zone = zones[hall.zone];
    if (!zone) throw new Error(`court hall ${court}: no zone ${hall.zone}`);
    const npcs: any[] = (zone.npcs ??= []);
    const its: any[] = (zone.interactables ??= []);
    const herald = heraldRecord(court, hall);
    if (!npcs.some((n) => n.id === herald.id)) npcs.push(herald);
    for (const s of hall.stations ?? []) {
      const rec = stationRecord(court, hall, s);
      if (!its.some((i) => i.id === rec.id)) its.push(rec);
    }
  }
  return zones;
}

/** A hall station is always something to touch (the quest relics are only
 *  while a quest wants them). */
export const isCourtStation = (rec: any): boolean => !!rec?.court_station;

export const courtName = (courts: any, key: string | null | undefined): string =>
  (key && courts.courts?.[key]?.name) || "no court";
export const courtShort = (courts: any, key: string | null | undefined): string =>
  (key && courts.courts?.[key]?.short) || "";
export const courtColor = (courts: any, key: string | null | undefined): string =>
  (key && courts.courts?.[key]?.banner?.color) || "#8f897c";
export const courtTrim = (courts: any, key: string | null | undefined): string =>
  (key && courts.courts?.[key]?.banner?.trim) || "#c9a35c";

// The claims race (S4 reads these; the server's Courts.contested? and
// claim_zone): every field zone but the empty Capital is contested, and a
// dungeon's work credits the one zone its portals lead to.
const UNCONTESTED = ["capital"];
export function contested(zones: Record<string, any>, zone: string): boolean {
  const z = zones[zone];
  return !!z && z.kind === "field" && !UNCONTESTED.includes(zone);
}
export function claimZone(zones: Record<string, any>, zone: string): string | null {
  if (contested(zones, zone)) return zone;
  const z = zones[zone];
  if (!z || z.kind !== "dungeon") return null;
  const parents = [...new Set((z.portals ?? []).map((p: any) => p.to))] as string[];
  return parents.length === 1 && contested(zones, parents[0]) ? parents[0] : null;
}

// ---------- bounty pins (S3) ----------
// Where a bounty in hand points on the zone map (COURTS.md "Bounties": shown
// on the board, as map pins and in the quest log): a kill bounty at the camps
// of its monster in the zone and its dungeons, a collect bounty at the board
// of the court that posted it, where it is delivered.
export interface BountyPin { zone: string; x: number; z: number; y?: number; label: string; }

export function bountyPins(zones: Record<string, any>, courts: any, b: any): BountyPin[] {
  if (b.kind === "collect") {
    const hall = courts.halls?.[b.court];
    const board = hall?.stations?.find((s: any) => s.station === "board");
    return board ? [{ zone: hall.zone, x: board.x, z: board.z, y: hall.y, label: `Deliver ${b.target_name ?? b.target}` }] : [];
  }
  const out: BountyPin[] = [];
  for (const [key, z] of Object.entries<any>(zones)) {
    if (claimZone(zones, key) !== b.zone) continue;
    for (const c of z.camps ?? []) {
      if (c.monster !== b.target) continue;
      if (out.some((p) => p.zone === key && Math.hypot(p.x - c.x, p.z - c.z) < 1)) continue;
      out.push({ zone: key, x: c.x, z: c.z, label: b.target_name ?? b.target });
    }
  }
  return out;
}
