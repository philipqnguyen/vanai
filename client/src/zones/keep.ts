// The Keep -- inside the Capital's castle keep, levels 47-50, the main
// story's last door. Rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/
// HANDBOOK.md; the plan and its reasons: tmp/dungeons/keep/PLAN.md). Until
// then it was KayKit pieces through buildDungeon, roofless, with no layout:
// the server could not see its walls and its monsters chased through them.
//
// THE ROUTE (tools/data/dungeon_plans/keep.json is the plan; the generator
// writes zones.json from it, so the server's sight and pursuit follow these
// walls). The Gate Hall's great doors into the Great Hall are shut and barred
// -- "the last door does not open" -- so the household's back way runs round:
// the Gate Hall (spawn, the rune home) -> the Guard Passage and the Guardroom
// (household guards) -> the Kitchen Passage (guards) -> the Kitchens (ward
// hounds, the great hearth banked) -> the Armoury (pale watchers) -> the Cells
// (unlit keepers) -> THE LONG GALLERY, the mid set piece: a hundred metres of
// portraits under tall windows on the Capital in the late sun (palace
// sentinels) -> the Council Chamber (house stewards) -> the Chapel (silence
// haunts) -> the Library (archive wisps), with the Treasury off it (hushed
// keepers) -> the Sentinels' Walk -> the Presence Chamber (the Regent's guard
// of sentinels) -> the Great Doors -> THE GREAT HALL, the boss arena: a
// basilica, a 20 m nave on two arcades, a clerestory streaming light, the
// dais and the empty throne under its baldachin, and the Regent before it.
// Behind the throne, the King's Doors -> the King's Chamber: the bed made and
// never slept in, cold light, the Unlit King.
//
// ENCLOSED throughout. The windows look out on the Capital through the `keep`
// bake (outdoor mode "windows": backdropWindowMaterial), and their light
// falls in shafts (keep_fx.ts). Every lamp in the city leaned one way the
// night they went: the chandeliers hang out of true, all the same way.
//
// SERVER TRUTH. Every wall that blocks stands on a 4 m cell edge (the kit's
// shell); the throne and the king's bed stand on obstacle cells; the arcade
// piers are client-solid only and stand off the camps and the route's line.
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, Parts, planGroups, THEMES, buildGroupShell, shellColliders, brazier, sconce, doorway, windowBay, barrelVault, flatCeiling, galleryEdge, stairFlight, box, lathe, moulding, PROFILES,
  FlamePool, LightPools,
  type KitPlan, type Group, type ShellOpts, type ThemePreset, type V3, type SurfaceSpec, type RoomStyle, type BackdropSlot,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import { Extras, onApply, pane, shaft, portraitUV, fixPools } from './keep_fx';
import {
  tilted, chandelier, throne, baldachin, greatDoors, hearth, longTable, pew, altar, bookPress, bed, armour, cellDoor, spearRack, portrait, banner, candleStand, regaliaCase, stateChair,
  type Ex,
} from './keep_parts';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[] } } };
const ZONE = zones.keep as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// The kit's keep preset (royal ashlar, marble trim and floors, an oxblood
// border, gold inlay, gilt fittings, crimson cloth) with the two free slots
// put to work: `glass` is the flagged floor of the service rooms (a kitchen
// is not marble), `dark` the blackened iron of doors, grilles and armour.
const BASE = THEMES.keep;
const FLAGS: SurfaceSpec = { sheet: 'flags', tint: '#a49c90', spec: 0.12, power: 40 };
const IRON: SurfaceSpec = { sheet: 'iron', tint: '#625e5a', spec: 0.45, power: 50 };
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces, glass: FLAGS, dark: IRON,
    // MEASURED (first look): under the warm lamps the preset's stone went
    // sandy orange, the gilt read as yellow paint and the crimson as a red
    // carpet in a shop; the stone is cooled, the gold deepened, the cloth darkened
    wall: { ...BASE.surfaces.wall, tint: '#bdb8b0' }, trim: { ...BASE.surfaces.trim, tint: '#d6d0c6' },
    floor: { ...BASE.surfaces.floor, tint: '#a29e98' }, inlay: { ...BASE.surfaces.inlay, tint: '#9a8250' },
    floorTrim: { ...BASE.surfaces.floorTrim, tint: '#4e2228' },
    metal: { tint: '#94733a', spec: 0.6, power: 64 },
    accent: { tint: '#561820', spec: 0.06, power: 10 },
    // the vaults and coffers carry a small emissive floor (the lit floors'
    // bounce): without it the nave vault crushed to black above the
    // clerestory (MEASURED polish pass: the nave looking up, median 13 of 255)
    ceiling: { ...BASE.surfaces.ceiling, tint: '#b4ada2', emissive: '#2a2622' },
  },
  arch: { ...BASE.arch, wallHeight: 8, corridorHeight: 5.2, plinth: true, cornice: true, stringCourse: 1.1 },
  lamp: { ...BASE.lamp, intensity: 1.25, range: 18 },
  pool: { ...BASE.pool, strength: 0.28 },
};

const INSET = 0.85;
// the light that leans in at the windows: from the north-west, late, low
const SUN: V3 = (() => { const v: V3 = [0.5, -0.72, -0.48], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const ROOMS: Record<string, Partial<RoomStyle>> = {
  gate: { height: 8, ceiling: 'groin', sconceEvery: 0, pilasterEvery: 1 },
  guard: { height: 5.5, ceiling: 'flat', sconceEvery: 2, pilasterEvery: 2, border: 0, inlay: 'none' },
  kitchen: { height: 5.5, ceiling: 'barrel', sconceEvery: 3, pilasterEvery: 0, border: 0, inlay: 'none' },
  armoury: { height: 6, ceiling: 'groin', sconceEvery: 2, pilasterEvery: 1, border: 0, inlay: 'grid' },
  cells: { height: 4.2, ceiling: 'flat', sconceEvery: 3, pilasterEvery: 0, border: 0, inlay: 'none' },
  gallery: { height: 7.5, ceiling: 'coffered', sconceEvery: 0, pilasterEvery: 1, inlay: 'diamond' },
  council: { height: 7.5, ceiling: 'coffered', sconceEvery: 2, pilasterEvery: 1 },
  chapel: { height: 9, sconceEvery: 0, pilasterEvery: 1, inlay: 'diamond' },
  library: { height: 7.5, ceiling: 'coffered', sconceEvery: 0, pilasterEvery: 0, inlay: 'grid' },
  treasury: { height: 5, ceiling: 'groin', sconceEvery: 2, pilasterEvery: 1, border: 0, inlay: 'none' },
  ante: { height: 8.5, ceiling: 'coffered', sconceEvery: 0, pilasterEvery: 1 },
  hall: { height: 10, sconceEvery: 0, pilasterEvery: 2 },
  king: { height: 8, ceiling: 'coffered', sconceEvery: 0, pilasterEvery: 1 },
};
const SERVICE = new Set(['guard', 'kitchen', 'armoury', 'cells', 'treasury']);
// the west range's passages (layout corridor indices 0..4) are service too
const SERVICE_CORRIDORS = new Set([0, 1, 2, 3, 4]);
// windows: [room, outward side, cells along that side]
const WINDOWS: { room: string; dx: number; dz: number; at: number[]; o: { half: number; sill: number; spring: number } }[] = [
  { room: 'gallery', dx: 0, dz: 1, at: [-11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11], o: { half: 1.15, sill: 1.1, spring: 5.0 } },
  { room: 'king', dx: -1, dz: 0, at: [10, 12], o: { half: 1.0, sill: 1.5, spring: 5.2 } },
  { room: 'king', dx: 1, dz: 0, at: [10, 12], o: { half: 1.0, sill: 1.5, spring: 5.2 } },
  { room: 'council', dx: 1, dz: 0, at: [8, 10], o: { half: 1.0, sill: 1.5, spring: 5.0 } },
  { room: 'library', dx: 1, dz: 0, at: [-5, -3], o: { half: 0.95, sill: 2.6, spring: 5.2 } },
  { room: 'chapel', dx: 1, dz: 0, at: [0, 5], o: { half: 0.9, sill: 2.4, spring: 6.4 } },
  { room: 'hall', dx: -1, dz: 0, at: [-2, 0, 2, 4], o: { half: 1.0, sill: 2.4, spring: 7.0 } },
  { room: 'hall', dx: 1, dz: 0, at: [-2, 0, 2, 4], o: { half: 1.0, sill: 2.4, spring: 7.0 } },
  { room: 'gate', dx: 0, dz: -1, at: [-2, 2], o: { half: 1.0, sill: 3.2, spring: 6.4 } },
];
// the great hall: the nave between two arcades, the aisles outside them
const HALL = { x0: -17.15, x1: 17.15, z0: -13.15, z1: 29.15, nave: 9.4, arcade: 1.2, aisleH: 10, clerestory: 20, crown: 26, dais: 22, daisY: 2 };
const BAY = (HALL.z1 - HALL.z0) / 6;

function buildKeep(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'kp', glow, glowOccluders: false });
  fixPools(kit.pools, THEME.pool.color, THEME.pool.strength);
  const extras = new Extras(scene, kit);
  const exFor = (group: string): Ex => (kind) => extras.g(group, kind);
  const so: ShellOpts = {
    style: THEME.arch, inset: INSET, rooms: ROOMS, corridorSconceEvery: 3, skipCeiling: ['hall', 'chapel'],
    windows: (e, g) => {
      const w = WINDOWS.find((w) => w.room === g.room?.id && w.dx === e.dx && w.dz === e.dz && w.at.includes(w.dx ? e.j : e.i));
      return w ? { kind: 'arch', ...w.o } : null;
    },
  };
  const cellOf = (i: number, j: number) => dp.cells.get(`${i},${j}`);
  const isService = (g: Group) => g.room ? SERVICE.has(g.room.id) : g.cells.some(([i, j]) => SERVICE_CORRIDORS.has(cellOf(i, j)?.corridor ?? -1));
  const colliders: { cx: number; cz: number; hx: number; hz: number; y0: number; y1: number }[] = [];
  const col = (cx: number, cz: number, hx: number, hz: number, y1 = 6, y0 = -1) => colliders.push({ cx, cz, hx, hz, y0, y1 });

  // =================================================== 1. THE SHELL
  // floors, walls with plinth, string course and cornice, doorways, windows,
  // pilasters, vaults and coffers, sconces (each a flame, a lamp and its pools).
  // The service rooms' floors are flags, not marble: their shell is laid in a
  // scratch Parts and its floor slot moved to `glass` (the flags).
  const windows: (BackdropSlot & { group: string; stained?: boolean })[] = [];
  for (const g of plan.groups) {
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [], wins: ReturnType<typeof buildGroupShell>['windows'] = [];
    const service = isService(g);
    kit.build(g.id, (p) => {
      const q = service ? new Parts(p.detail) : p;
      const r = buildGroupShell(q, plan, g, so);
      if (service) for (const [slot, geo] of q.slots) p.g(slot === 'floor' ? 'glass' : slot).absorb(geo);
      if (p.detail) { seats = r.seats; wins = r.windows; }
    });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
    for (const w of wins) windows.push({ ...w, stained: w.group === 'chapel' });
  }
  for (const c of shellColliders(plan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // --- fire helpers
  const brazierAt = (group: string, x: number, y: number, z: number, size = 1, r = 0.5, h = 1.05) => {
    let seat: V3 = [x, y + h, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r, h }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size, floorPool: y > 0.5 ? 0 : undefined });
    if (y > 0.5) kit.pools.floor(group, x, y, z, 3.2 * size);
    buildApi.addCircleCollider(x, z, r * 0.9);
  };
  // a chandelier from its hook, leaning the household's way; one lamp, one pool
  const LEAN: [number, number] = [0.8, 0.6], LEAN_A = 0.1;
  const chandelierAt = (group: string, x: number, hookY: number, z: number, o: { drop: number; r: number; arms: number; tiers?: 1 | 2 }, floorY = 0, cold?: FlamePool) => {
    let seats: V3[] = [];
    kit.build(group, (p) => { const s = tilted(p, [x, hookY, z], LEAN, LEAN_A, (q) => chandelier(q, o)); if (p.detail) seats = s; });
    for (const s of seats) (cold ?? kit.flames).add(group, s[0], s[1], s[2], 0.11, 0.24, true);
    if (cold) return;
    const c = seats.reduce((a, s) => [a[0] + s[0] / seats.length, a[1] + s[1] / seats.length, a[2] + s[2] / seats.length] as V3, [0, 0, 0] as V3);
    kit.lamps.add({ group, x: c[0], y: c[1] - 0.4, z: c[2] });
    kit.pools.floor(group, c[0], floorY, c[2], Math.min(5.5, 2.2 + o.r * 1.6));
  };
  const standAt = (group: string, x: number, z: number, h = 1.6, y = 0) => {
    let seat: V3 = [x, y + h + 0.38, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = candleStand(p, h); if (p.detail) seat = s; }));
    kit.flames.add(group, seat[0], seat[1], seat[2], 0.14, 0.3, true);
    kit.pools.floor(group, x, y, z, 1.8);
    buildApi.addCircleCollider(x, z, 0.3);
  };

  // a wall sconce placed by hand where the shell's rhythm would hang one on a door
  const sconceAt = (group: string, x: number, z: number, fx: number, fz: number, h = 2.9) => {
    let seat: V3 = [x, h, z];
    kit.build(group, (p) => p.at(x, 0, z, Math.atan2(fx, fz), () => { const s = sconce(p, { h }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { facing: [fx, fz] });
  };

  // =================================================== 2. THE GREAT HALL
  // A basilica in the hall's rectangle: two arcades of six bays carry a
  // clerestory to 20 m and a ribbed barrel vault to 26; the aisles have
  // coffered ceilings at 10. The dais fills the last bay at 2 m.
  const hallWins: (BackdropSlot & { group: string; stained?: boolean })[] = [];
  kit.build('hall', (p) => {
    const t = HALL.arcade;
    for (const side of [-1, 1]) {
      const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2, xf = side * HALL.nave;
      for (let k = 0; k < 6; k++) {
        const zc = HALL.z0 + BAY * (k + 0.5), base = zc > HALL.dais ? HALL.daisY : 0, half = BAY / 2 - 0.8;
        // the arcade: one arch per bay, piers shared between bays
        p.at(xf, base, zc, yaw, () => doorway(p, { h: HALL.aisleH + 0.2 - base, thick: t, half, spring: base ? 5.0 : 6.8, rise: half, kind: 'arch', edge: BAY / 2 }));
        // the clerestory over it: a tall round-headed window per bay
        p.at(xf, HALL.aisleH + 0.2, zc, yaw, () => {
          const s = windowBay(p, { h: HALL.clerestory - HALL.aisleH - 0.2, thick: t, edge: BAY / 2, half: 1.15, sill: 1.6, spring: 7.0, rise: 1.15, kind: 'arch' });
          if (p.detail) hallWins.push({ ...s, group: 'hall' });
          if (p.detail) moulding(p.g('trim'), PROFILES.string(0.3, 0.16), [[-BAY / 2, 0], [BAY / 2, 0]], 0.0);
        });
      }
      // vaulting shafts on the piers' nave faces, up to the vault's springing
      for (let k = 1; k < 6; k++) {
        const z = HALL.z0 + BAY * k, base = z > HALL.dais + 0.2 ? HALL.daisY : 0, x = side * (HALL.nave - 0.12);
        lathe(p.g('trim'), [[0.42, base], [0.42, base + 0.6], [0.3, base + 0.75]], p.detail ? 12 : 6, x, z);
        lathe(p.g('trim'), [[0.26, base + 0.75], [0.27, (base + HALL.clerestory) / 2], [0.24, HALL.clerestory - 0.7]], p.detail ? 12 : 6, x, z);
        if (p.detail) lathe(p.g('trim'), [[0.24, HALL.clerestory - 0.7], [0.32, HALL.clerestory - 0.45], [0.44, HALL.clerestory - 0.1], [0.44, HALL.clerestory + 0.1]], 12, x, z);
      }
    }
    // the aisles' coffered ceilings
    flatCeiling(p, { x0: HALL.x0, z0: HALL.z0, x1: -HALL.nave - t, z1: HALL.z1, h: HALL.aisleH, coffer: 3.3 });
    flatCeiling(p, { x0: HALL.nave + t, z0: HALL.z0, x1: HALL.x1, z1: HALL.z1, h: HALL.aisleH, coffer: 3.3 });
    // the nave's end walls above the aisles, each with a great window
    for (const [z, yaw] of [[HALL.z0, 0], [HALL.z1, Math.PI]] as [number, number][]) {
      p.at(0, HALL.aisleH, z, yaw, () => {
        const s = windowBay(p, { h: HALL.clerestory - HALL.aisleH, thick: t, edge: HALL.nave + t, half: 2.3, sill: 1.6, spring: 6.8, rise: 2.3, kind: 'arch' });
        if (p.detail) hallWins.push({ ...s, group: 'hall' });
      });
    }
    // the nave vault: ribbed, a gilt boss where each rib crosses the crown
    barrelVault(p, { span: 2 * HALL.nave, z0: HALL.z0, z1: HALL.z1, spring: HALL.clerestory, rise: HALL.crown - HALL.clerestory, ribEvery: BAY });
    if (p.detail) {
      moulding(p.g('trim'), PROFILES.cornice(0.7, 0.4), [[-HALL.nave, HALL.z1], [-HALL.nave, HALL.z0]], HALL.clerestory - 0.7);
      moulding(p.g('trim'), PROFILES.cornice(0.7, 0.4), [[HALL.nave, HALL.z0], [HALL.nave, HALL.z1]], HALL.clerestory - 0.7);
      for (let k = 0; k <= 6; k++) lathe(p.g('metal'), [[0, HALL.crown - 0.55], [0.4, HALL.crown - 0.42], [0.55, HALL.crown - 0.2], [0.5, HALL.crown]], 12, 0, HALL.z0 + BAY * k + (k === 0 ? 0.4 : k === 6 ? -0.4 : 0));
    }
    // the runner up the nave to the dais, gold-edged
    box(p.g('accent'), -1.5, 0.006, HALL.z0 + 0.2, 1.5, 0.016, 18, 0);
    if (p.detail) for (const s of [-1, 1]) box(p.g('inlay'), s * 1.5 - 0.08, 0.008, HALL.z0 + 0.2, s * 1.5 + 0.08, 0.018, 18, 0);
  });
  // the arcade piers, client-solid (the server sees the nave floor round them)
  for (const side of [-1, 1]) for (let k = 1; k < 6; k++) col(side * (HALL.nave + HALL.arcade / 2), HALL.z0 + BAY * k, HALL.arcade / 2 + 0.3, 0.95, 12);
  for (const side of [-1, 1]) for (const z of [HALL.z0 + 0.4, HALL.z1 - 0.4]) col(side * (HALL.nave + HALL.arcade / 2), z, HALL.arcade / 2 + 0.3, 0.45, 12);

  // --- the dais: an ashlar body, a moulded nosing, balustrades; one wide flight
  const D = { x0: -14, x1: 14, z0: HALL.dais, z1: HALL.z1, y: HALL.daisY };
  kit.build('hall', (p) => {
    const tr = p.g('trim');
    box(tr, D.x0, 0, D.z0, D.x1, D.y - 0.1, D.z0 + 0.6, 0, ['ny', 'py']);
    for (const x of [D.x0, D.x1]) box(tr, x - 0.3, 0, D.z0, x + 0.3, D.y - 0.1, D.z1, 0, ['ny', 'py']);
    box(tr, D.x0 - 0.12, D.y - 0.12, D.z0 - 0.12, D.x1 + 0.12, D.y + 0.02, D.z0 + 0.5, p.detail ? 0.03 : 0);
    for (const x of [D.x0, D.x1]) box(tr, x - 0.42, D.y - 0.12, D.z0 - 0.12, x + 0.42, D.y + 0.02, D.z1, p.detail ? 0.03 : 0);
    p.g('floor').quad([D.x0 + 0.3, D.y, D.z0 + 0.5], [D.x1 - 0.3, D.y, D.z0 + 0.5], [D.x1 - 0.3, D.y, D.z1], [D.x0 + 0.3, D.y, D.z1], [0, 1, 0]);
    // the carpet up the flight and across the dais to the throne
    box(p.g('accent'), -1.5, D.y + 0.006, D.z0 + 0.5, 1.5, D.y + 0.016, 25.8, 0);
    if (p.detail) {
      // balustrades: the front either side of the flight, and both sides
      for (const [a, b] of [[D.x0 + 0.4, -4.85], [4.85, D.x1 - 0.4]]) p.at((a + b) / 2, D.y, D.z0 + 0.25, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.25 }));
      for (const s of [-1, 1]) p.at(s * D.x1, D.y, (D.z0 + D.z1) / 2, s * Math.PI / 2, () => galleryEdge(p, { len: D.z1 - D.z0 - 0.4, fascia: 0.25 }));
    }
    // the flight
    p.at(0, 0, D.z0 - 4, 0, () => stairFlight(p, { w: 9.2, run: 4, rise: D.y, rails: 'both' }));
  });
  for (const [a, b] of [[D.x0, -4.8], [4.8, D.x1]]) col((a + b) / 2, D.z0 + 0.25, (b - a) / 2, 0.15, D.y + 1.2, D.y - 0.05);
  for (const s of [-1, 1]) col(s * D.x1, (D.z0 + D.z1) / 2, 0.15, (D.z1 - D.z0) / 2, D.y + 1.2, D.y - 0.05);

  // --- the empty throne under its baldachin, the cloth of estate, the banners
  const TZ = 27.2;
  kit.build('hall', (p) => {
    p.at(0, D.y, TZ, Math.PI, () => { throne(p); baldachin(p, { hw: 2.0, d0: 1.5, d1: 2.1, h: 6.6 }); });
  });
  buildApi.addBoxCollider(0, TZ, 1.2, 1.0, 0, D.y + 3.5, D.y - 0.1);
  for (const [x, z] of [[-2, TZ - 2.1], [2, TZ - 2.1], [-2, TZ + 1.5], [2, TZ + 1.5]]) buildApi.addCircleCollider(x, z, 0.3);
  kit.build('hall', (p) => {
    if (!p.detail) return;
    const ex = exFor('hall');
    // the cloth of estate on the wall behind
    p.at(0, 9.6, HALL.z1 - 0.06, Math.PI, () => banner(p, ex, { w: 4.6, h: 7.0, wave: 0.02 }));
    // the household's banners on the north wall and down the aisles
    for (const x of [-7.2, 7.2]) p.at(x, 9.4, HALL.z1 - 0.15, Math.PI, () => banner(p, ex, { w: 2.2, h: 6.2 }));
    for (const s of [-1, 1]) for (const j of [-1, 1, 3]) p.at(s * (HALL.x1 - 0.15), 8.8, j * 4, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => banner(p, ex, { w: 1.8, h: 4.8 }));
  });
  // sconces under the aisle banners and at the aisles' ends (by hand: the
  // shell's rhythm would hang them on the dais at knee height)
  for (const s of [-1, 1]) {
    for (const z of [-4, 4, 12, 20]) sconceAt('hall', s * HALL.x1, z, -s, 0, 3.1);
    sconceAt('hall', s * 12, HALL.z0, 0, 1, 3.1);
    sconceAt('hall', s * 12, HALL.z1, 0, -1, 3.1);
  }
  // fire: braziers flanking the flight and the doors, candle stands at the throne
  for (const s of [-1, 1]) { brazierAt('hall', s * 6.4, 0, 16.4, 1.25, 0.6, 1.15); brazierAt('hall', s * 6.6, 0, -9.5, 1.15, 0.55, 1.1); }
  for (const s of [-1, 1]) for (const z of [24.2, 28.2]) standAt('hall', s * 3.6, z, 1.7, D.y);
  // the throne in its own light: a broad warm pool on the dais, another on the flight
  kit.pools.floor('hall', 0, D.y, 25.5, 7.5);
  kit.pools.floor('hall', 0, D.y, 25.5, 3.5);
  kit.pools.floor('hall', 0, 0, 17, 6);
  // the nave's two great chandeliers, from the vault
  chandelierAt('hall', 0, HALL.crown - 0.6, -2.6, { drop: 14.5, r: 2.1, arms: 12, tiers: 2 });
  chandelierAt('hall', 0, HALL.crown - 0.6, 11.4, { drop: 14.5, r: 2.1, arms: 12, tiers: 2 });
  // the great doors' surround on the hall side: an entablature over the three arches
  kit.build('hall', (p) => p.at(0, 0, HALL.z0, 0, () => {
    const tr = p.g('trim');
    for (const x of [-6.6, 6.6]) { box(tr, x - 0.5, 0, 0, x + 0.5, 6.4, 0.45, 0.03, ['ny']); if (p.detail) box(tr, x - 0.62, 0, 0, x + 0.62, 0.7, 0.55, 0.03, ['ny']); }
    box(tr, -7.2, 6.4, 0, 7.2, 7.3, 0.55, 0.04);
    if (p.detail) moulding(tr, PROFILES.cornice(0.6, 0.32), [[-7.3, 0.55], [7.3, 0.55]], 7.3, { caps: true });
    box(p.g('metal'), -2.4, 6.6, 0.55, 2.4, 7.1, 0.6, 0.01);
  }));

  // =================================================== 3. THE GATE HALL
  kit.build('gate', (p) => {
    // the outer doors, shut on the Capital behind the rune
    p.at(0, 0, -50 + INSET, 0, () => greatDoors(p, { half: 2.6, spring: 5.0 }));
    // the great doors into the hall: shut ("the last door does not open")
    p.at(0, 0, -34 - INSET, Math.PI, () => greatDoors(p, { half: 3.0, spring: 5.4 }));
  });
  for (const s of [-1, 1]) brazierAt('gate', s * 6.2, 0, -37.4, 1.15, 0.55, 1.1);
  for (const s of [-1, 1]) {
    sconceAt('gate', s * 13.15, -42, -s, 0);
    sconceAt('gate', s * 4.6, -49.15, 0, 1);
    sconceAt('gate', s * 10, -34.85, 0, -1);
  }
  for (const x of [-8.8, 0, 8.8]) chandelierAt('gate', x, 11.6, -42, { drop: 5.2, r: 1.3, arms: 8, tiers: 2 });
  kit.build('gate', (p) => {
    if (!p.detail) return;
    const ex = exFor('gate');
    for (const s of [-1, 1]) for (const z of [-46, -38]) p.at(s * 13.0, 7.2, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => banner(p, ex, { w: 1.9, h: 5.0 }));
  });

  // =================================================== 4. THE WEST RANGE
  // --- the Guardroom: bunks, the mess tables, the spears
  kit.build('guard', (p) => {
    for (const x of [-46.5, -42]) p.at(x, 0, -50 + INSET, 0, () => spearRack(p, 3.2));
    p.at(-31, 0, -38.2, 0, () => longTable(p, { len: 5, w: 1.1, runner: false }));
    p.at(-31, 0, -46, 0, () => longTable(p, { len: 5, w: 1.1, runner: false }));
  });
  // --- the Kitchens: the great hearth, banked; the scrubbed tables
  let hearthSeats: V3[] = [];
  kit.build('kitchen', (p) => {
    p.at(-50 + INSET, 0, -16, Math.PI / 2, () => { const s = hearth(p, { half: 3.0, top: 5.5 }); if (p.detail) hearthSeats = s; });
    p.at(-34.5, 0, -19.5, Math.PI / 2, () => longTable(p, { len: 6, w: 1.3, runner: false }));
    p.at(-29, 0, -22.5, 0, () => longTable(p, { len: 3.6, w: 1.1, runner: false }));
  });
  buildApi.addBoxCollider(-48.35, -16, 0.8, 3.9, 0, 4, -1);
  for (const [k, s] of hearthSeats.entries()) kit.flames.add('kitchen', s[0], s[1] - 0.15, s[2], k === 1 ? 1.0 : 0.8, k === 1 ? 1.7 : 1.3, true);
  for (const dz of [-1.6, -0.5, 0.6, 1.7]) kit.flames.add('kitchen', -48.2, 0.5, -16 + dz, 0.4, 0.7, true);
  kit.lamps.add({ group: 'kitchen', x: -46.8, y: 1.2, z: -16 });
  kit.pools.floor('kitchen', -45.5, 0, -16, 6.5);
  chandelierAt('kitchen', -38, 11, -16, { drop: 6.5, r: 1.0, arms: 6 });
  // --- the Armoury: suits along the walls, the spear racks, the vaulted hall
  kit.build('armoury', (p) => {
    for (const z of [2.5, 7, 11.5, 16]) {
      p.at(-48.2, 0, z, Math.PI / 2, () => armour(p));
      p.at(-27.8, 0, z, -Math.PI / 2, () => armour(p));
    }
    p.at(-34, 0, 18 - INSET, Math.PI, () => spearRack(p, 3.6));
    p.at(-46, 0, 18 - INSET, Math.PI, () => spearRack(p, 3.6));
    // two ranks of harness either side of the walk between the doors
    for (const x of [-46, -43.4, -36.6, -34]) { p.at(x, 0, 1.6, 0, () => armour(p)); p.at(x, 0, 14.6, Math.PI, () => armour(p)); }
  });
  for (const z of [2.5, 7, 11.5, 16]) { buildApi.addCircleCollider(-48.2, z, 0.45); buildApi.addCircleCollider(-27.8, z, 0.45); }
  for (const x of [-46, -43.4, -36.6, -34]) { buildApi.addCircleCollider(x, 1.6, 0.45); buildApi.addCircleCollider(x, 14.6, 0.45); }
  // --- the Cells: grilles in both walls, shut on nothing
  kit.build('cells', (p) => {
    for (const z of [26, 31, 36, 41]) {
      p.at(-50 + INSET, 0, z, Math.PI / 2, () => cellDoor(p, { half: 0.75, h: 2.6 }));
      p.at(-30 - INSET, 0, z, -Math.PI / 2, () => cellDoor(p, { half: 0.75, h: 2.6 }));
    }
  });

  // =================================================== 5. THE LONG GALLERY
  // A hundred metres under twelve windows, cut into five bays by diaphragm
  // arches (each a screen of two leaves back to back, so both faces carry
  // their voussoirs); the household's portraits down the inner wall, a
  // chandelier in every bay.
  const ARCHES = [-24, -8, 8, 24], GZ0 = 58 + INSET, GZ1 = 70 - INSET, GW = (GZ1 - GZ0) / 2, GC = (GZ0 + GZ1) / 2;
  kit.build('gallery', (p) => {
    for (const x of ARCHES) for (const s of [-1, 1]) {
      p.at(x + s * 0.4, 0, GC, s * Math.PI / 2, () => doorway(p, { h: 7.5, thick: 0.4, half: GW - 0.9, spring: 4.4, rise: 2.5, kind: 'arch', edge: GW }));
      if (p.detail) for (const z of [GZ0, GZ1]) box(p.g('trim'), x - 0.6, 0, z === GZ0 ? z : z - 0.3, x + 0.6, 7.5, z === GZ0 ? z + 0.3 : z, 0.03, ['ny']);
    }
    // pedestals for the urns between the windows, clear of the arches
    for (let x = -40; x <= 40; x += 8) if (!ARCHES.includes(x)) p.at(x, 0, 68.4, 0, () => lathe(p.g('trim'), [[0.4, 0], [0.4, 0.2], [0.3, 0.3], [0.26, 1.0], [0.36, 1.1], [0.36, 1.2]], p.detail ? 12 : 6, 0, 0, { caps: true }));
  });
  for (const x of ARCHES) for (const z of [GZ0 + 0.45, GZ1 - 0.45]) col(x, z, 0.45, 0.5, 8);
  for (let x = -40; x <= 40; x += 8) if (!ARCHES.includes(x)) buildApi.addCircleCollider(x, 68.4, 0.45);
  kit.build('gallery', (p) => {
    if (!p.detail) return;
    const ex = exFor('gallery');
    const hung: [number, boolean][] = [[-46, false], [-31, true], [-19.5, false], [-12.5, false], [-3.5, true], [3.5, true], [12.5, false], [19.5, false], [31, true], [46, false]];
    hung.forEach(([x, big], k) => p.at(x, big ? 4.0 : 3.7, GZ0, 0, () => portrait(p, ex, { w: big ? 2.6 : 2.0, h: big ? 3.4 : 2.7, uv: portraitUV(k) })));
  });
  for (const x of [-32, -16, 0, 16, 32]) chandelierAt('gallery', x, 8.0, 64, { drop: 2.6, r: 1.1, arms: 8 });

  // =================================================== 6. THE EAST RANGE
  // --- the Council Chamber: the long table, the chairs pushed back
  kit.build('council', (p) => {
    p.at(32, 0, 36, Math.PI / 2, () => longTable(p, { len: 11, w: 2.0 }));
    const R = (k: number) => Math.sin(k * 12.9898) * 0.5;
    for (let k = 0; k < 5; k++) {
      const z = 31.4 + k * 2.3;
      p.at(30.0 - 0.3 + R(k) * 0.6, 0, z, Math.PI / 2 + R(k) * 0.6, () => stateChair(p));
      p.at(34.0 + 0.3 + R(k + 7) * 0.6, 0, z, -Math.PI / 2 + R(k + 7) * 0.6, () => stateChair(p));
    }
    p.at(32, 0, 43.2, Math.PI, () => stateChair(p, 2.6));
  });
  buildApi.addBoxCollider(32, 36, 1.0, 5.5, 0, 1.2, -1);
  chandelierAt('council', 32, 8.0, 36, { drop: 3.0, r: 1.4, arms: 10, tiers: 2 });
  // --- the Chapel: a ribbed barrel vault running to the altar; pews; the glass
  const chapel = plan.byId.get('chapel')!;
  const CH = { x0: chapel.x0 + INSET, x1: chapel.x1 - INSET, z0: chapel.z0 + INSET, z1: chapel.z1 - INSET };
  let altarSeats: V3[] = [];
  kit.build('chapel', (p) => {
    p.at((CH.x0 + CH.x1) / 2, 0, (CH.z0 + CH.z1) / 2, Math.PI / 2, () => barrelVault(p, { span: CH.z1 - CH.z0, z0: -(CH.x1 - CH.x0) / 2, z1: (CH.x1 - CH.x0) / 2, spring: 9, rise: 6.5, ribEvery: 3.7 }));
    p.at(CH.x1, 0, 10, -Math.PI / 2, () => { const s = altar(p); if (p.detail) altarSeats = s; });
    for (const zb of [[1, 7.2], [12.8, 19]]) for (let x = 29; x <= 38; x += 2.2) p.at(x, 0, (zb[0] + zb[1]) / 2, -Math.PI / 2, () => pew(p, zb[1] - zb[0]));
  });
  buildApi.addBoxCollider(CH.x1 - 1.2, 10, 1.2, 2.6, 0, 3, -1);
  for (const s of altarSeats) kit.flames.add('chapel', s[0], s[1], s[2], 0.1, 0.22, true);
  for (const z of [5.5, 14.5]) standAt('chapel', 46.2, z, 1.7);
  kit.pools.floor('chapel', 45, 0, 10, 4.5);
  chandelierAt('chapel', 34, 15.2, 10, { drop: 7, r: 1.8, arms: 12 });
  // --- the Library: book presses round the walls, the reading tables
  kit.build('library', (p) => {
    const L = plan.byId.get('library')!, x0 = L.x0 + INSET, x1 = L.x1 - INSET, z0 = L.z0 + INSET, z1 = L.z1 - INSET;
    let seed = 1;
    // the west wall (clear of the Sentinels' Walk door), the east wall between
    // the windows, the ends (clear of the doors on x 40)
    for (let z = z0 + 1.4; z < z1 - 1.2; z += 2.6) if (Math.abs(z + 24) > 2.4) p.at(x0, 0, z, Math.PI / 2, () => bookPress(p, { w: 2.4, h: 4.6, seed: seed++ }));
    for (const z of [-27.8, -24, -16, -12.4, -8.6]) p.at(x1, 0, z, -Math.PI / 2, () => bookPress(p, { w: 2.4, h: 4.6, seed: seed++ }));
    for (let x = x0 + 1.4; x < x1 - 1.2; x += 2.6) if (Math.abs(x - 40) > 2.6) { p.at(x, 0, z0, 0, () => bookPress(p, { w: 2.4, h: 4.6, seed: seed++ })); p.at(x, 0, z1, Math.PI, () => bookPress(p, { w: 2.4, h: 4.6, seed: seed++ })); }
    p.at(44, 0, -22.5, 0, () => longTable(p, { len: 4.2, w: 1.3 }));
    p.at(31.5, 0, -12.5, Math.PI / 2, () => longTable(p, { len: 4.2, w: 1.3 }));
  });
  buildApi.addBoxCollider(44, -22.5, 2.1, 0.65, 0, 1.2, -1);
  buildApi.addBoxCollider(31.5, -12.5, 0.65, 2.1, 0, 1.2, -1);
  for (const [x, z] of [[36, -20], [36, -14]]) chandelierAt('library', x, 8.0, z, { drop: 2.8, r: 1.0, arms: 8 });
  for (const [x, z] of [[46.5, -20], [29.5, -16]]) standAt('library', x, z, 1.5);
  // --- the Treasury: cases for regalia that are not there, the chests
  kit.build('treasury', (p) => {
    const ex = p.detail ? exFor('treasury') : null;
    for (const x of [34, 38, 42]) p.at(x, 0, -36.6, Math.PI, () => regaliaCase(p, ex, 1.8));
  });
  for (const x of [34, 38, 42]) buildApi.addBoxCollider(x, -36.6, 0.95, 0.5, 0, 1.2, -1);

  // =================================================== 7. THE PRESENCE CHAMBER
  kit.build('ante', (p) => {
    // the inside of the barred doors to the gate hall
    p.at(0, 0, -30 + INSET, 0, () => greatDoors(p, { half: 3.0, spring: 5.4, barred: true }));
    for (const x of [-9, 9]) p.at(x, 0, -28.6, 0, () => stateChair(p, 2.2));
  });
  kit.build('ante', (p) => {
    if (!p.detail) return;
    const ex = exFor('ante');
    for (const x of [-10.5, -5.5, 5.5, 10.5]) p.at(x, 7.6, -30 + INSET + 0.15, 0, () => banner(p, ex, { w: 1.7, h: 4.6 }));
  });
  chandelierAt('ante', 0, 9.0, -24, { drop: 3.2, r: 1.5, arms: 10, tiers: 2 });
  for (const s of [-1, 1]) { sconceAt('ante', s * 8, -29.15, 0, 1); sconceAt('ante', s * 10, -18.85, 0, -1); }
  sconceAt('ante', -13.15, -24, 1, 0);

  // =================================================== 8. THE KING'S CHAMBER
  // The bed made and never slept in, on the obstacle cell at the back wall.
  // The household's warm light stops at the door: the candles here burn cold.
  const cold = new FlamePool(scene, { core: '#eef6ff', edge: '#5c8ee0' }, { name: 'kp_coldflames', haloStrength: 0.4 });
  const coldPools = new LightPools(scene, '#8fb4ff', 0.34, 'kp_coldpools');
  fixPools(coldPools, '#9cbcff', 0.42);
  kit.build('king', (p) => {
    // the bed on a stepped platform of marble with an oxblood border
    box(p.g('floorTrim'), -2.9, 0, 47.6, 2.9, 0.16, 54 - INSET, 0.02, ['ny']);
    box(p.g('trim'), -2.6, 0.16, 47.9, 2.6, 0.32, 54 - INSET, 0.02, ['ny']);
    p.at(0, 0.32, 54 - INSET, Math.PI, () => bed(p, p.detail ? exFor('king') : null, { w: 3.4, l: 3.7, h: 4.8 }));
    for (const x of [-14.5, 14.5]) p.at(x, 0, 52.6, Math.PI, () => armour(p));
  });
  const kingCandles: V3[] = [];
  for (const [x, z] of [[-4.5, 46.6], [4.5, 46.6], [-9, 37], [9, 37], [-13, 46], [13, 46]]) {
    kit.build('king', (p) => p.at(x, 0, z, 0, () => { const s = candleStand(p, 1.8); if (p.detail) kingCandles.push(s); }));
    buildApi.addCircleCollider(x, z, 0.3);
    coldPools.floor('king', x, 0, z, 3.2);
  }
  for (const s of kingCandles) cold.add('king', s[0], s[1], s[2], 0.16, 0.36, true);
  chandelierAt('king', 0, 8.2, 41, { drop: 3.0, r: 1.5, arms: 10, tiers: 2 }, 0, cold);
  coldPools.floor('king', 0, 0, 41, 8);
  coldPools.floor('king', 0, 0.35, 49.5, 4.5);
  kit.build('king', (p) => {
    if (!p.detail) return;
    const ex = exFor('king');
    for (const x of [-9, 9]) p.at(x, 3.8, 54 - INSET, Math.PI, () => portrait(p, ex, { w: 2.0, h: 2.8, uv: portraitUV(x < 0 ? 0 : 5) }));
  });
  buildApi.addBoxCollider(0, 50.6, 2.9, 2.6, 0, 0.6, -1);

  // =================================================== 9. WINDOWS, LIGHT, PROPS
  // the Capital through every window; the chapel's are stained glass. The
  // late light falls in shafts from the windows that face it, onto pools.
  for (const w of [...windows, ...hallWins]) {
    if (w.stained) { pane(extras.g(w.group, 'stained'), w, 0.4); continue; }
    pane(extras.g(w.group, 'window'), w);
    const land = shaft(extras.g(w.group, 'shaft'), w, SUN, 0, w.h > 6 ? 1.18 : 1.1);
    if (land) kit.pools.floor(w.group, land[0], 0, land[2], Math.min(4.5, w.w * 1.6));
  }
  // the great window behind the throne lets one shaft fall on the dais before
  // the empty throne, where the Regent will not let anyone stand
  const north = hallWins.find((w) => w.normal[2] > 0.9);
  if (north) {
    const d: V3 = (() => { const v: V3 = [0, -13.5, -9.5], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
    const land = shaft(extras.g('hall', 'shaft'), { ...north, w: north.w * 0.8 }, d, D.y, 1.25);
    if (land) { kit.pools.floor('hall', land[0], D.y, land[2], 4.2); kit.pools.floor('hall', land[0], D.y, land[2], 2.2); }
  }
  dressProps(kit);

  // =================================================== 10. CAMERA, COLLIDERS, FINISH
  for (const c of colliders) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, 0, c.y1, c.y0);
  for (const c of dp.cameraRooms(0.35)) {
    const flight = c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1,
      cameraRadius: flight || c.id === 'room:hall' ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  extras.finish();
  cold.upload(); coldPools.upload();
  for (const m of [cold.pool.mesh, coldPools.pool.mesh]) glow?.addExcludedMesh(m);
  onApply(kit, (v) => { cold.update(v); coldPools.update(v); });
  kit.finish();
}

// ------------------------------------------------------------------ props (CC0, pooled)
function dressProps(kit: DungeonKit): void {
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, y = 0, far = false) =>
    kit.props.place({ file, group, x, y, z, yaw, scale, far });
  // the Gate Hall: the guards' benches, the racks by the doors. The west
  // wall's -44 bay is the Guard Passage's arch, the way out of the hall, so
  // that side's second bench stands a bay north instead.
  for (const s of [-1, 1]) { P('props/Bench.gltf', 'gate', s * 12.6, s < 0 ? -36 : -44, s * Math.PI / 2); P('props/Bench.gltf', 'gate', s * 12.6, -40, s * Math.PI / 2); }
  P('props/WeaponStand.gltf', 'gate', -9.5, -48.6, 0); P('props/WeaponStand.gltf', 'gate', 9.5, -48.6, 0);
  // the Guardroom
  for (const z of [-46.5, -43, -39.5]) P('props/Bed_Bunk.gltf', 'guard', -48.1, z, Math.PI / 2);
  for (const z of [-38.2, -46]) for (const s of [-1, 1]) P('props/Bench.gltf', 'guard', -31, z + s * 1.1, s > 0 ? Math.PI : 0);
  P('props/Mug.gltf', 'guard', -32, -38.1, 0.4, 1, 0.8); P('props/Mug.gltf', 'guard', -30.2, -38.4, 1.2, 1, 0.8); P('props/Table_Plate.gltf', 'guard', -31.1, -37.9, 0, 1, 0.8);
  P('props/CandleStick_Triple.gltf', 'guard', -29.8, -45.9, 0, 1, 0.8); P('props/Table_Plate.gltf', 'guard', -32.3, -46.1, 0.3, 1, 0.8);
  P('dungeon/keyring_hanging.glb', 'guard', -27.1, -41, -Math.PI / 2, 1, 1.9);
  P('props/Chest_Wood.gltf', 'guard', -35.5, -48.5, 0); P('props/Chest_Wood.gltf', 'guard', -38.6, -48.5, 0.1);
  P('props/WeaponStand.gltf', 'guard', -27.6, -46.5, -Math.PI / 2); P('props/Barrel.gltf', 'guard', -27.6, -36.2, 0.4);
  // the Kitchens
  P('props/Cauldron.gltf', 'kitchen', -46.2, -14.2, 0.3); P('props/Pot_1_Lid.gltf', 'kitchen', -47.0, -19.2, 0.4);
  P('props/Pan_1.gltf', 'kitchen', -34.2, -21.4, 0.5, 1, 0.8); P('props/Pot_2_Lid.gltf', 'kitchen', -34.8, -17.8, 0, 1, 0.8);
  P('dungeon/plate_stack.glb', 'kitchen', -34.3, -19.6, 0, 0.5, 0.8); P('props/FarmCrate_Carrot.gltf', 'kitchen', -29.4, -22.4, 0.2, 1, 0.8); P('props/FarmCrate_Leek.gltf', 'kitchen', -28.2, -22.6, -0.3, 1, 0.8);
  for (const [x, z] of [[-27.8, -7.8], [-28.6, -8.6], [-27.6, -9.6], [-48.4, -7.8], [-48.4, -24.2]]) P('props/Barrel.gltf', 'kitchen', x, z, x + z);
  P('props/Barrel_Apples.gltf', 'kitchen', -47.4, -8.6, 0.6); P('props/Bag.gltf', 'kitchen', -44.6, -7.6, 0.4); P('props/Bag_2.gltf', 'kitchen', -43.6, -7.8, 1.3);
  P('props/Shelf_Small_Bottles.gltf', 'kitchen', -26.9, -18, -Math.PI / 2, 1.2, 1.7); P('props/Shelf_Small_Bottles.gltf', 'kitchen', -26.9, -14, -Math.PI / 2, 1.2, 1.7);
  P('props/Bucket_Wooden_1.gltf', 'kitchen', -45.6, -22.8, 0); P('props/Stool.gltf', 'kitchen', -32.6, -16.4, 0.3);
  // the Armoury
  for (const x of [-37.5, -42.5]) P('props/WeaponStand.gltf', 'armoury', x, -0.3, 0);
  for (const [x, z, yaw] of [[-48.9, 4.8, Math.PI / 2], [-48.9, 9.3, Math.PI / 2], [-48.9, 13.8, Math.PI / 2], [-27.1, 4.8, -Math.PI / 2], [-27.1, 9.3, -Math.PI / 2], [-27.1, 13.8, -Math.PI / 2]]) P('dungeon/sword_shield.glb', 'armoury', x, z, yaw, 0.7, 2.6);
  P('props/Whetstone.gltf', 'armoury', -31.5, -0.2, 0.2); P('props/Chest_Wood.gltf', 'armoury', -29, -0.3, 0);
  // the Cells
  P('props/Chain_Coil.gltf', 'cells', -35, 28, 0.6); P('props/Bucket_Wooden_1.gltf', 'cells', -32.2, 44.2, 0); P('props/Stool.gltf', 'cells', -46.5, 44, 0.4);
  P('dungeon/keyring_hanging.glb', 'cells', -30.9, 33.5, -Math.PI / 2, 1, 1.9);
  // the Long Gallery: urns on the pedestals, benches under the windows
  for (let x = -40; x <= 40; x += 8) if (![-24, -8, 8, 24].includes(x)) P(Math.round(x / 8) % 2 ? 'props/Vase_3.gltf' : 'props/Vase_1.gltf', 'gallery', x, 68.4, x * 0.1, 1.15, 1.2);
  for (let x = -44; x <= 44; x += 8) P('props/Bench.gltf', 'gallery', x, 68.1, Math.PI, 0.9);
  // the Council Chamber: the papers left on the table
  for (const [x, z, f] of [[32, 33, 'props/Page_Stack_Large.gltf'], [32.4, 37.6, 'props/Book_Open.gltf'], [31.6, 40.5, 'props/Parchment.gltf'], [32.2, 35, 'props/CandleStick_Triple.gltf'], [31.8, 39, 'props/CandleStick_Triple.gltf']] as [number, number, string][]) P(f, 'council', x, z, 0.3, 1, 0.81);
  P('props/Chalice_Golden.gltf', 'council', 32.5, 42.4, 0, 1.2, 0.81);
  // the Library: books open on the tables, the stands
  for (const [x, z, f] of [[43.2, -22.5, 'props/Book_Open.gltf'], [44.9, -22.6, 'props/Book_Stack_1.gltf'], [45.6, -22.3, 'props/Page_Stack_Large.gltf'], [31.5, -13.6, 'props/Book_Open.gltf'], [31.4, -11.4, 'props/Book_Stack_2.gltf'], [31.7, -12.6, 'props/CandleStick_Triple.gltf'], [42.6, -22.8, 'props/Scroll_1.gltf']] as [number, number, string][]) P(f, 'library', x, z, 0.4, 1, 0.81);
  P('props/BookStand.gltf', 'library', 38.5, -27.5, 0.2); P('props/BookStand.gltf', 'library', 29.2, -27.6, 0.6);
  // the Treasury
  for (const [x, z, yaw] of [[31.8, -47.8, 0.2], [44.2, -47.8, -0.2]]) P('props/Chest_Legendary.gltf', 'treasury', x, z, yaw, 1.3);
  for (const [x, z] of [[31.6, -42], [44.4, -42]]) P('dungeon/chest_gold.glb', 'treasury', x, z, x < 38 ? Math.PI / 2 : -Math.PI / 2, 0.6);
  P('dungeon/coin_stack_large.glb', 'treasury', 34.5, -48.2, 0.4, 0.6); P('dungeon/coin_stack_medium.glb', 'treasury', 41.4, -48.4, 1.1, 0.6);
  for (const x of [34, 38, 42]) P('props/Chalice_Golden.gltf', 'treasury', x + 0.5, -36.5, 0, 1.3, 1.06);
  // the Presence Chamber: benches for the petitioners
  for (const x of [-4.5, 4.5]) P('props/Bench.gltf', 'ante', x, -28.6, 0);
  // the King's Chamber
  P('props/Dresser_1.gltf', 'king', -16.6, 44, Math.PI / 2, 1.2); P('props/Nightstand_Drawer.gltf', 'king', -2.6, 52.4, Math.PI); P('props/Nightstand_Drawer.gltf', 'king', 2.6, 52.4, Math.PI);
  P('props/Desk.gltf', 'king', 16.2, 44, -Math.PI / 2, 1.1); P('props/Book_Open.gltf', 'king', 16.1, 44.2, -1.4, 1, 0.92); P('props/Chair_3.gltf', 'king', 14.8, 44, Math.PI / 2);
  P('props/Rug_Round.gltf', 'king', 0, 44, 0, 2.4, 0.01);
  P('props/Chalice_Golden.gltf', 'king', 2.6, 52.3, 0, 1.2, 0.9);
}

registerZone({
  key: 'keep', height: floorAt, hemi: 0.8,
  light: { hemiGround: '#a49888' },
  terrain: { tex: 'aerial_rocks_02', tint: ['#6a665e', '#8a867e'], tile: 6 },
  // the Capital through the windows; the keep stays enclosed
  outdoor: { mode: 'windows' },
  lighting: {
    // cool daylight from the windows against warm candlelight: the sky stays
    // low so the marble floors do not wash out and the lamps' pools and the
    // shafts still read, while a light ground colour (the pale stone's
    // bounce) carries the walls and vaults (MEASURED polish pass: hemi 0.58,
    // ground #3a302a and contrast 1.16 left the Great Hall at a median 22 of
    // 255 and its vault at 13; now 43 and 38)
    hemi: 0.8, hemiSky: '#b4b8c2', hemiGround: '#a49888', sun: 0.2, sunColor: '#ffd8a8', sunDir: SUN,
    fog: { density: 0.0085, color: '#121116' }, exposure: 1.05, contrast: 1.1,
  },
  build: buildKeep,
});
