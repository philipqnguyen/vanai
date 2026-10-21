// The Mausoleum: "an inhabited imperial tomb: ordered masonry, fresh vigil
// lamps and an empty place kept ready for a household that promised to
// return." Caerdun's doorstep trial under the Hunting Wood, rebuilt
// 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md, the Beacon Fort's
// pattern: tmp/dungeons/HANDBOOK.md). The plan is tools/data/dungeon_plans/
// mausoleum.json; the generator writes zones.json (layout, camps) from it.
//
// THE ROUTE. The Hall of Names (the landing, the rune home, the Visitors'
// Register; an 18 m domical vault over walls of inscribed names) -> the
// Processional, three cells wide under one ribbed barrel, vigil lamps down
// both sides -> the Crossing Hall, cross-in-square on four clustered piers,
// a corona of candles in its tall central bay, the memorial altar against
// its shut north wall (attendants) -> EAST: the Blue Gallery (shades; low
// groin bays, enamelled coffins, loculi) -> the Root Gallery (wights; the
// forest's roots through its vault) -> the bent passage -> THE COURT OF THE
// UNRETURNED, the mid set piece: a column of forest light through the oculus
// onto the medallion, and round it the PLACE KEPT READY, four biers made up
// with folded linen and fresh candles; veiled effigies keep vigil in its
// corners (attendants) -> the Mourners' Way -> the Long Vigil, a basilica of
// six piers, clerestory over the arcades, lamps in every aisle niche
// (wardens) -> east to the Vigil of Banners (the Hollow Warder) -> the
// Folded Standard (attendants) -> the EMPERORS' VAULT: a 15 m nave on piers,
// crowned emperors in niches all round, the oculus's shaft on the arena, and
// on the dais under a blue-domed baldachin the empty imperial bier, made up,
// the writ on it; the Bier's Way Out beside it. The West wing (Ivory Gallery,
// Lantern Gallery, the Three Sisters and the Warden's Echo) mirrors the east;
// the Keepers' Stair loop returns to the nave; the side rooms keep their
// names and their furniture.
//
// ENCLOSED. Underground: every space has its vault, walls and floor. The only
// outside is forest light through three oculi (court, nave, vault): unlit
// cool glass in a moulded ring, an additive shaft and a cool pool on the
// floor. Never a hole.
//
// SERVER TRUTH. Every wall that blocks stands on a 4 m cell edge (the kit's
// shell, 0.85 m in: the server's clear? line). Piers stand on cell corners,
// 1.4 m or more from every cell-centre line, so the server's corner-free
// pursuit never runs through one; the court's four biers stand on obstacle
// cells. Wall furniture keeps out of the doorways and the camp discs.
import { Color3, Constants, FresnelParameters, Mesh, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, stairFlight, Parts, box, beam, lathe, LightPools,
  type KitPlan, type Group, type ShellOpts, type ThemePreset, type V3, type SurfaceSpec, type RoomStyle, type Slot, type VisState,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import {
  bayHall, passageVault, effigy, sarcophagus, madeBier, candleStand, vigilLamp, corona, hangingLantern, loculi, nameTablets, wallNiche,
  baldachin, imperialBier, roots,
} from './mausoleum_pieces';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { decks: { cx: number; cz: number; hx: number; hz: number; y: number }[]; ramps: { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }[] } } };
const ZONE = zones.mausoleum as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;

// ------------------------------------------------------------------ the look
// The kit's tomb preset (ashlar limestone, fine ashlar trim, flags with a
// blue-marble border and gold inlay, brass, midnight enamel) with the free
// slots given work: `timber` is POLISHED PALE MARBLE (the grand halls' floors,
// statues, the bier, column shafts), `glass` the oculi's forest light.
const BASE = THEMES.tomb;
const MARBLE: SurfaceSpec = { sheet: 'marble', tint: '#d6cfc0', spec: 0.4, power: 80, scale: 0.5, bump: 0.3 };
const SKY: SurfaceSpec = { tint: '#c4dcee', emissive: '#a8c6de', glow: 0.55, unlit: true };
const THEME: ThemePreset = {
  ...BASE,
  // the vaults carry a faint emissive floor (the pale floors' bounce)
  surfaces: { ...BASE.surfaces, timber: MARBLE, glass: SKY, accent: { tint: '#1d3150', spec: 0.25, power: 30 }, ceiling: { ...BASE.surfaces.ceiling, emissive: '#24221e' } },
  arch: { ...BASE.arch, wallHeight: 6, corridorHeight: 4.8, pilasterEvery: 2, stringCourse: 3.2 },
  // limestone throws light back: a light ground colour lifts the tall halls'
  // upper walls and vaults (MEASURED polish pass: hemi 0.55 over #2a2620 left
  // the Crossing, the halls and the crypts at medians 26-39 of 255, their
  // upper thirds 11-18; the small limestone rooms already read at 80-130)
  hemi: 0.62, hemiGround: '#7a7468',
  lamp: { ...BASE.lamp, intensity: 1.0, range: 19 },
  pool: { ...BASE.pool, strength: 0.38 },
};

const INSET = 0.85;
// the vaulted halls: their springing, pier, and the rises of tall (12 m) and low bays
interface HallSpec { spring: number; tall: number; low: number; pier: number; floor?: 'marble' | 'flags'; inlay?: RoomStyle['inlay'] }
const HALLS: Record<string, HallSpec> = {
  entry: { spring: 7, tall: 6.5, low: 6.5, pier: 1.2, floor: 'marble', inlay: 'medallion' },
  crossing: { spring: 8, tall: 6, low: 3.6, pier: 1.3, floor: 'marble', inlay: 'medallion' },
  cloister: { spring: 8, tall: 6, low: 3.6, pier: 1.3, floor: 'marble', inlay: 'medallion' },
  nave: { spring: 8, tall: 6, low: 3.6, pier: 1.3, inlay: 'diamond' },
  vault: { spring: 9, tall: 6, low: 3.6, pier: 1.5, floor: 'marble', inlay: 'grid' },
  easthall: { spring: 7.5, tall: 6, low: 3.6, pier: 1.3, inlay: 'grid' },
  westhall: { spring: 7.5, tall: 6, low: 3.6, pier: 1.3, inlay: 'grid' },
  westcrypt: { spring: 5.5, tall: 4.2, low: 3.6, pier: 1.0, inlay: 'none' },
  eastcrypt: { spring: 5.5, tall: 4.2, low: 3.6, pier: 1.0, inlay: 'none' },
  westgallery: { spring: 5.5, tall: 4.2, low: 3.6, pier: 1.0, inlay: 'none' },
  eastgallery: { spring: 5.5, tall: 4.2, low: 3.6, pier: 1.0, inlay: 'none' },
};
// the plain rooms: barrel-vaulted shells
const ROOMS: Record<string, Partial<RoomStyle>> = {
  linen: { height: 5, sconceEvery: 2, inlay: 'none' }, register: { height: 5.5, sconceEvery: 2, inlay: 'grid' },
  offering: { height: 5, sconceEvery: 2, inlay: 'medallion' }, tomb: { height: 4.6, sconceEvery: 0, inlay: 'none' },
  archive: { height: 5.5, sconceEvery: 2, inlay: 'grid' }, vestibule: { height: 5.5, sconceEvery: 2, inlay: 'diamond' },
  return: { height: 5, sconceEvery: 2, inlay: 'none' }, westshrine: { height: 5.5, sconceEvery: 0, inlay: 'diamond' },
  eastshrine: { height: 5.5, sconceEvery: 0, inlay: 'diamond' },
};
// rooms whose walls carry tablets, loculi or niches light themselves (no wall sconces)
const NO_SCONCES = new Set(['entry', 'westcrypt', 'eastcrypt', 'westgallery', 'eastgallery', 'nave', 'vault']);

type Side = 'n' | 's' | 'e' | 'w';
const SIDE: Record<Side, { dx: number; dz: number; yaw: number }> = {
  n: { dx: 0, dz: 1, yaw: Math.PI }, s: { dx: 0, dz: -1, yaw: 0 }, e: { dx: 1, dz: 0, yaw: -Math.PI / 2 }, w: { dx: -1, dz: 0, yaw: Math.PI / 2 },
};
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

// ------------------------------------------------------------------ the zone
function buildMausoleum(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const G = (id: string): Group => plan.byId.get(id)!;
  const groupOfCell = (i: number, j: number) => plan.cellGroup.get(`${i},${j}`)!;

  // the two processionals are three cells wide: their corridor groups, linked
  // so one barrel over each never shows half
  const wideGroups = (j0: number, j1: number) => [...new Set([-1, 0, 1].flatMap((i) => Array.from({ length: j1 - j0 + 1 }, (_, k) => groupOfCell(i, j0 + k))))];
  const PROC = wideGroups(-24, -21), MOURN = wideGroups(7, 11);
  const links: [string, string][] = [];
  for (const w of [PROC, MOURN]) for (let k = 1; k < w.length; k++) links.push([w[0], w[k]]);

  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'ms', glow, glowOccluders: false, visibility: { links } });
  const roomStyles: Record<string, Partial<RoomStyle>> = { ...ROOMS };
  for (const [id, h] of Object.entries(HALLS)) roomStyles[id] = { height: h.spring, pilasterEvery: 0, sconceEvery: NO_SCONCES.has(id) ? 0 : 2, inlay: h.inlay ?? 'grid' };
  for (const id of NO_SCONCES) roomStyles[id] = { ...roomStyles[id], sconceEvery: 0 };
  const so: ShellOpts = { style: THEME.arch, inset: INSET, rooms: roomStyles, corridorSconceEvery: 3, skipCeiling: [...Object.keys(HALLS), ...PROC, ...MOURN] };

  // ---- building helpers
  /** build into a group with some slots redirected (a room's floor to marble) */
  const buildAs = (group: string, map: Partial<Record<Slot, Slot>>, fn: (p: Parts) => void) => kit.build(group, (p) => {
    const t = new Parts(p.detail);
    fn(t);
    for (const [slot, geo] of t.slots) p.g(map[slot] ?? slot).absorb(geo);
  });
  /** build a fitting; its flame seats (detail pass) become fires */
  const fires = (group: string, fn: (p: Parts) => V3 | V3[] | null, o: { size?: number; lamp?: boolean; floorPool?: number; small?: boolean } = {}) => {
    let seats: V3[] = [];
    kit.build(group, (p) => {
      const r = fn(p);
      if (p.detail) seats = !r ? [] : typeof r[0] === 'number' ? [r as V3] : (r as V3[]);
    });
    if (o.small) {
      // candles: a flame each, one lamp and one pool for the cluster
      for (const s of seats) kit.flames.add(group, s[0], s[1], s[2], 0.13, 0.26);
      if (seats.length && o.lamp !== false) {
        const c = seats.reduce((a, s) => [a[0] + s[0] / seats.length, a[1] + s[1] / seats.length, a[2] + s[2] / seats.length] as V3, [0, 0, 0] as V3);
        kit.lamps.add({ group, x: c[0], y: c[1] + 0.3, z: c[2] });
        if ((o.floorPool ?? 2.6) > 0) kit.pools.floor(group, c[0], plan.byId.get(group)?.y ?? 0, c[2], o.floorPool ?? 2.6);
      }
    } else for (const s of seats) kit.fire(group, s, { size: o.size ?? 1, lamp: o.lamp, floorPool: o.floorPool });
    return seats;
  };
  const faceAt = (g: Group, side: Side, t: number): [number, number] =>
    side === 'n' ? [t, g.z1 - INSET] : side === 's' ? [t, g.z0 + INSET] : side === 'e' ? [g.x1 - INSET, t] : [g.x0 + INSET, t];
  const wallRange = (g: Group, side: Side): [number, number] => side === 'n' || side === 's' ? [g.x0 + INSET, g.x1 - INSET] : [g.z0 + INSET, g.z1 - INSET];
  const doorTs = (g: Group, side: Side) => plan.edges.filter((e) => e.group === g.id && e.kind === 'door' && e.dx === SIDE[side].dx && e.dz === SIDE[side].dz).map((e) => (side === 'n' || side === 's' ? e.x : e.z));
  /** the free stretches of a wall: clear of doorways, corners and the given cuts (responds) */
  const spans = (g: Group, side: Side, o: { pad?: number; corner?: number; cuts?: number[]; cutPad?: number } = {}): [number, number][] => {
    const [a, b] = wallRange(g, side);
    let segs: [number, number][] = [[a + (o.corner ?? 0.5), b - (o.corner ?? 0.5)]];
    const cuts = [...doorTs(g, side).map((t) => [t - (o.pad ?? 1.8), t + (o.pad ?? 1.8)]), ...(o.cuts ?? []).map((t) => [t - (o.cutPad ?? 0.6), t + (o.cutPad ?? 0.6)])];
    for (const [c0, c1] of cuts) segs = segs.flatMap(([s0, s1]) => (c1 <= s0 || c0 >= s1 ? [[s0, s1]] : [[s0, c0], [c1, s1]].filter(([u, v]) => v - u > 0.6)) as [number, number][]);
    return segs;
  };
  const onWall = (p: Parts, g: Group, side: Side, t: number, y: number, fn: () => void) => { const [x, z] = faceAt(g, side, t); p.at(x, y, z, SIDE[side].yaw, fn); };
  const SIDES: Side[] = ['n', 's', 'e', 'w'];
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, y = 0, far = false) => kit.props.place({ file, group, x, y, z, yaw, scale, far });
  const circle = (x: number, z: number, r: number) => buildApi.addCircleCollider(x, z, r);
  const boxCol = (x: number, z: number, hx: number, hz: number, yaw: number, y1: number, y0 = -1) => buildApi.addBoxCollider(x, z, hx, hz, yaw, y1, y0);

  // =================================================== 1. THE SHELLS
  // floors, walls with plinth, string course and cornice, doorways, the plain
  // rooms' barrels and the passages' vaults, sconces (flame, lamp, pools)
  const FLOOR_MAP: Partial<Record<Slot, Slot>> = { floor: 'timber' };
  for (const g of plan.groups) {
    const marble = g.room && HALLS[g.room.id]?.floor === 'marble';
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    buildAs(g.id, marble ? FLOOR_MAP : {}, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
  }
  for (const c of shellColliders(plan, so)) boxCol(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // =================================================== 2. THE VAULTED HALLS
  const bands = (lo: number, hi: number, inner: number[]) => [lo + INSET, ...inner, hi - INSET];
  const hallBands: Record<string, { xs: number[]; zs: number[] }> = {};
  for (const id of Object.keys(HALLS)) {
    const g = G(id), cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, w = g.x1 - g.x0, d = g.z1 - g.z0;
    const across = (lo: number, hi: number, c: number, n: number) => n >= 28 ? bands(lo, hi, [c - 6, c + 6]) : n >= 20 ? bands(lo, hi, [lo + 8]) : bands(lo, hi, []);
    const xs = id === 'entry' ? bands(g.x0, g.x1, []) : across(g.x0, g.x1, cx, w);
    const zs = id === 'entry' ? bands(g.z0, g.z1, []) : d >= 36 ? bands(g.z0, g.z1, [g.z0 + 8, g.z0 + 16, g.z0 + 24]) : d >= 28 ? bands(g.z0, g.z1, [cz - 6, cz + 6]) : bands(g.z0, g.z1, [g.z0 + 8]);
    hallBands[id] = { xs, zs };
    const h = HALLS[id];
    let piers: [number, number][] = [];
    kit.build(id, (p) => p.at(0, g.y, 0, 0, () => {
      const r = bayHall(p, { xs, zs, spring: h.spring, rise: (_i, _j, bw, bd) => (Math.max(bw, bd) >= 11.9 ? h.tall : h.low), pier: { kind: 'cluster', w: h.pier } });
      if (p.detail) piers = r;
    }));
    for (const [x, z] of piers) circle(x, z, h.pier / 2 + 0.22);
  }
  /** a hall's respond positions along a wall (where its transverse arches land) */
  const respondCuts = (id: string, side: Side) => { const b = hallBands[id]; return b ? (side === 'n' || side === 's' ? b.xs.slice(1, -1) : b.zs.slice(1, -1)) : []; };

  // the processionals: one ribbed barrel over the three cells, the impost on their walls
  const passage = (group: string, z0: number, z1: number) => kit.build(group, (p) => passageVault(p, { span: 12 - 2 * INSET, z0, z1, spring: 4.3, rise: 4.0, ribEvery: 3.9, wallFrom: 3.65 }));
  // z0/z1: the back faces of the room walls they run between (0.35 m past the edge)
  passage(PROC[0], -98 + 0.35, -82 - 0.35);
  passage(MOURN[0], 26 + 0.35, 46 - 0.35);

  // the oculi: forest light through the crown of a tall bay, never a hole
  const shafts: { x: number; z: number; top: number; group: string }[] = [];
  const oculus = (group: string, x: number, z: number, crown: number) => {
    const y = crown - 0.42;
    kit.build(group, (p) => p.at(x, 0, z, 0, () => {
      p.g('glass').poly(Array.from({ length: 24 }, (_, k) => [Math.cos(k / 24 * Math.PI * 2) * 1.75, y, Math.sin(k / 24 * Math.PI * 2) * 1.75] as V3), [0, -1, 0]);
      lathe(p.g('trim'), [[1.7, y - 0.05], [2.05, y - 0.12], [2.35, y - 0.02], [2.45, y + 0.25], [1.7, y + 0.25]], p.detail ? 32 : 14, 0, 0);
      if (p.detail) lathe(p.g('metal'), [[1.68, y - 0.08], [1.78, y - 0.1], [1.8, y + 0.02]], 32, 0, 0, { caps: false });
    }));
    shafts.push({ x, z, top: y, group });
  };
  oculus('cloister', 0, 12, 8 + 6);
  oculus('nave', 0, 75.6, 8 + 6);
  oculus('vault', 64, 110, 9 + 6);

  // =================================================== 3. THE ROOMS
  const entry = G('entry'), crossing = G('crossing'), nave = G('nave'), vault = G('vault');

  // --- The Hall of Names: inscribed names on every wall, the register, a corona
  kit.build('entry', (p) => {
    for (const side of ['s', 'e', 'w'] as Side[]) for (const [a, b] of spans(entry, side, { corner: 0.9 })) {
      onWall(p, entry, side, (a + b) / 2, 0, () => nameTablets(p, { x0: -(b - a) / 2, x1: (b - a) / 2, y0: 1.05, rows: 3, seed: Math.round(a * 13) }));
    }
  });
  // the household's effigies either side of the triple arch, facing the landing
  for (const x of [-7.3, 7.3]) {
    fires('entry', (p) => { let s: V3 | null = null; p.at(x, 0, -100.3, Math.PI, () => { s = effigy(p, { holds: 'lamp', scale: 1.05 }); }); return s; }, { size: 0.55, floorPool: 2.2 });
    boxCol(x, -100.3, 0.85, 0.8, 0, 3.5);
  }
  fires('entry', (p) => corona(p, { y: 7.6, top: 7 + 6.5, r: 1.9, candles: 14 }), { small: true, floorPool: 5.5 });
  for (const [x, z] of [[-4.5, -115.6], [4.5, -115.6], [-8, -109.6], [8, -110.4]]) {
    fires('entry', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.75); }); return s; }, { size: 0.9 });
    circle(x, z, 0.36);
  }
  // the visitors' register on its reading desk (the interactable's table: top 1.2)
  kit.build('entry', (p) => p.at(8, 0, -107, Math.PI / 2, () => {
    const t = p.g('trim');
    box(t, -0.55, 0, -0.38, 0.55, 0.16, 0.38, p.detail ? 0.03 : 0, ['ny']);
    box(p.g('timber'), -0.32, 0.16, -0.2, 0.32, 1.0, 0.2, p.detail ? 0.04 : 0);
    box(t, -0.62, 1.0, -0.42, 0.62, 1.2, 0.42, p.detail ? 0.03 : 0);
    if (p.detail) { box(p.g('trim'), -0.42, 1.2, -0.28, 0.42, 1.24, 0.28, 0.01); box(p.g('metal'), 0.45, 1.2, 0.2, 0.52, 1.36, 0.27, 0.01); }
  }));
  boxCol(8, -107, 0.45, 0.65, 0, 1.25);

  // --- The Processional: lamps on stands down both sides, a runner of blue marble
  for (const z of [-94.5, -90, -85.5]) for (const x of [-4.6, 4.6]) {
    fires(PROC[0], (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.6, 0.28); }); return s; }, { size: 0.8, floorPool: 2.4 });
    circle(x, z, 0.34);
  }
  const runner = (group: string, z0: number, z1: number) => kit.build(group, (p) => {
    p.g('floorTrim').quad([-1.4, 0.004, z0], [1.4, 0.004, z0], [1.4, 0.004, z1], [-1.4, 0.004, z1], [0, 1, 0]);
    if (p.detail) for (const x of [-1.5, 1.5]) p.g('inlay').quad([x - 0.08, 0.006, z0], [x + 0.08, 0.006, z0], [x + 0.08, 0.006, z1], [x - 0.08, 0.006, z1], [0, 1, 0]);
  });
  runner(PROC[0], -97.6, -82.4);
  runner(MOURN[0], 26.4, 45.6);
  const hangBanner = (group: string, x: number, z: number, yaw: number, file = 'dungeon/banner_patternA_blue.glb', scale = 1, y = 0.55) => {
    P(file, group, x, z, yaw, scale, y);
    // the rod it hangs from, on two brass brackets back to the wall
    const top = y + 3.2 * scale + 0.08, half = 0.85 * scale;
    kit.build(group, (p) => p.at(x, top, z, yaw, () => {
      const m = p.g('metal');
      beam(m, [-half, 0, 0], [half, 0, 0], 0.07, 0.07, 0.01);
      for (const s of [-1, 1]) beam(m, [s * half * 0.8, 0, 0], [s * half * 0.8, 0.12, -0.4], 0.05, 0.05, 0);
      lathe(m, [[0, -0.06], [0.06, 0], [0, 0.06]], 6, -half - 0.04, 0); lathe(m, [[0, -0.06], [0.06, 0], [0, 0.06]], 6, half + 0.04, 0);
    }));
  };
  for (const z of [-92.25, -87.75]) { hangBanner(PROC[0], -5.0, z, Math.PI / 2); hangBanner(PROC[0], 5.0, z, -Math.PI / 2); }

  // --- The Crossing Hall: the corona, the memorial altar, its keepers
  fires('crossing', (p) => { let s: V3[] = []; p.at(0, 0, -68, 0, () => { s = corona(p, { y: 8.8, top: 14, r: 2.1, candles: 16 }); }); return s; }, { small: true, floorPool: 6 });
  kit.build('crossing', (p) => p.at(0, 0, crossing.z1 - INSET, Math.PI, () => {
    // the memorial altar: a moulded table of marble under the names of the household
    const t = p.g('trim'), m = p.g('timber');
    box(t, -2.6, 0, 0, 2.6, 0.25, 1.9, p.detail ? 0.04 : 0, ['ny']);
    box(m, -2.3, 0.25, 0.15, 2.3, 1.0, 1.55, p.detail ? 0.04 : 0, ['ny']);
    box(t, -2.5, 1.0, 0.05, 2.5, 1.14, 1.7, p.detail ? 0.03 : 0);
    box(p.g('accent'), -2.0, 1.14, 0.3, 2.0, 1.17, 1.45, 0.01);
    if (p.detail) for (const s of [-1, 1]) box(p.g('accent'), s * 1.1 - 0.85, 0.4, 1.54, s * 1.1 + 0.85, 0.85, 1.58, 0);
  }));
  boxCol(0, crossing.z1 - INSET - 0.95, 2.6, 0.95, 0, 1.3);
  fires('crossing', (p) => { const s: V3[] = []; p.at(0, 1.14, crossing.z1 - INSET - 0.9, 0, () => { for (let k = 0; k < 7; k++) s.push(candleStand(p, -1.5 + k * 0.5, 0, 0.3 + (k % 2) * 0.12)); }); return s; }, { small: true, floorPool: 3 });
  for (const x of [-4.6, 4.6]) {
    fires('crossing', (p) => { let s: V3 | null = null; p.at(x, 0, crossing.z1 - INSET - 1.1, Math.PI, () => { s = effigy(p, { holds: 'lamp', scale: 1.1 }); }); return s; }, { size: 0.55, floorPool: 2.4 });
    boxCol(x, crossing.z1 - INSET - 1.1, 0.9, 0.85, 0, 3.6);
  }
  kit.build('crossing', (p) => {
    for (const [a, b] of spans(crossing, 'n', { cuts: [-6, 6], cutPad: 0.75, corner: 0.8 })) if (Math.abs((a + b) / 2) > 7) onWall(p, crossing, 'n', (a + b) / 2, 0, () => nameTablets(p, { x0: -(b - a) / 2, x1: (b - a) / 2, y0: 1.2, rows: 3, seed: 5 }));
  });
  for (const [x, z] of [[-12.3, -80.3], [12.3, -80.3], [-12.3, -55.7], [12.3, -55.7]]) {
    fires('crossing', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.8); }); return s; }, { size: 0.9 });
    circle(x, z, 0.36);
  }

  // --- The four crypts: loculi on the walls, each its own dead
  for (const id of ['westcrypt', 'eastcrypt', 'westgallery', 'eastgallery']) {
    const g = G(id), urns: V3[] = [];
    kit.build(id, (p) => {
      for (const side of SIDES) for (const [a, b] of spans(g, side, { cuts: respondCuts(id, side), cutPad: 0.7, corner: 0.6 })) {
        if (b - a < 1.4) continue;
        onWall(p, g, side, (a + b) / 2, 0, () => {
          const open = loculi(p, { x0: -(b - a) / 2, x1: (b - a) / 2, y0: 0.7, rows: 3, rowH: 1.15, seed: Math.round(a * 7 + b) });
          if (p.detail) urns.push(...open);
        });
      }
    });
    urns.forEach(([x, y, z], k) => P(k % 3 ? 'graveyard/urn-round.glb' : 'props/Vase_4.gltf', id, x, z, k, k % 3 ? 1.7 : 0.9, y));
  }
  // the low vaults' light: a lantern hung in each corner bay, vigil lamps by the doors
  const bayCentres = (id: string) => { const { xs, zs } = hallBands[id], out: [number, number, number, number][] = []; for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) out.push([(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2, i, j]); return out; };
  // The Ivory Gallery: sarcophagi of pale marble in the corner bays
  for (const [x, z, i, j] of bayCentres('westcrypt')) if (i !== 1 && j !== 1) {
    kit.build('westcrypt', (p) => p.at(x, 0, z, 0, () => sarcophagus(p, { lid: (i + j) % 4 ? 'gabled' : 'effigy', chest: 'timber', panel: 'floorTrim' })));
    boxCol(x, z, 0.95, 1.6, 0, 1.5);
  }
  // The Blue Gallery: enamelled coffins on biers in the corner bays, blue bands on the walls
  for (const [x, z, i, j] of bayCentres('eastcrypt')) if (i !== 1 && j !== 1) {
    kit.build('eastcrypt', (p) => p.at(x, 0, z, 0, () => sarcophagus(p, { lid: 'flat', chest: 'accent', panel: 'metal', h: 0.75, w: 1.9, l: 3.3 })));
    P('halloween/coffin_decorated.gltf', 'eastcrypt', x, z, 0, 0.75, 0.75);
    boxCol(x, z, 1.1, 1.75, 0, 1.4);
  }
  for (const [x, z] of [[57, -62.6], [71, -62.6]]) hangBanner('eastcrypt', x, z, Math.PI, 'dungeon/banner_patternB_blue.glb', 0.9, 0.3);
  // The Lantern Gallery: a lantern in every bay
  for (const [x, z, i, j] of bayCentres('westgallery')) {
    const crown = 5.5 + (i === 1 || j === 1 ? 4.2 : 3.6);
    fires('westgallery', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = hangingLantern(p, 3.6, crown - 0.1); }); return s; }, { size: 0.45, floorPool: 2.8 });
  }
  // The Root Gallery: the forest's roots through the vault, a fallen corner
  kit.build('eastgallery', (p) => { roots(p, { cx: 64, cz: -16, top: 9.2, r: 5, n: 14, seed: 23 }); roots(p, { cx: 73.5, cz: -25.5, top: 8.6, r: 2.5, n: 6, seed: 5 }); });
  P('dungeon/rubble_large.glb', 'eastgallery', 73.2, -26.6, 0.4, 0.6, 0, true);
  P('dungeon/rubble_half.glb', 'eastgallery', 70.6, -27.4, 2.2, 0.5);
  P('Rock_Moss_2.glb', 'eastgallery', 75.3, -22.4, 1.1, 1.6); P('Rock_Moss_1.glb', 'eastgallery', 68.9, -25.6, 0.3, 1.3);
  kit.build('eastgallery', (p) => p.at(54.4, 0, -6.4, 0.3, () => sarcophagus(p, { lid: 'flat', chest: 'timber' })));
  boxCol(54.4, -6.4, 1.0, 1.6, 0.3, 1.5);
  P('props/Vase_Rubble_Large.gltf', 'eastgallery', 56.2, -9.4, 0.8, 1.2); P('props/Vase_Rubble_Medium.gltf', 'eastgallery', 52.3, -9.0, 2.0, 1.2);
  for (const id of ['westcrypt', 'eastcrypt', 'eastgallery']) for (const [x, z, i, j] of bayCentres(id)) if (i === 1 && j !== 1) {
    // a vigil lamp either side of the north and south doors' approach
    for (const dx of [-3.4, 3.4]) {
      fires(id, (p) => { let s: V3 = [0, 0, 0]; p.at(x + dx, 0, z, 0, () => { s = vigilLamp(p, 1.55, 0.26); }); return s; }, { size: 0.75, floorPool: 2.4 });
      circle(x + dx, z, 0.32);
    }
  }

  // --- The Court of the Unreturned: THE PLACE KEPT READY
  for (const [x, z] of [[-4, 8], [4, 8], [-4, 16], [4, 16]]) {
    fires('cloister', (p) => { let s: V3[] = []; p.at(x, 0, z, 0, () => { s = madeBier(p, { w: 1.6, l: 2.7 }); }); return s; }, { small: true, floorPool: 2.4 });
    boxCol(x, z, 1.55, 1.95, 0, 1.4);
  }
  for (const [x, z] of [[-10.1, 2.6], [10.1, 2.6], [-10.1, 21.4], [10.1, 21.4]]) {
    const yaw = yawTo(x, z, 0, 12);
    fires('cloister', (p) => { let s: V3 | null = null; p.at(x, 0, z, yaw, () => { s = effigy(p, { holds: 'lamp' }); }); return s; }, { size: 0.55, floorPool: 2.4 });
    boxCol(x, z, 0.85, 0.8, yaw, 3.4);
  }

  // --- The Mourners' Way
  for (const z of [30, 36, 42]) for (const x of [-4.6, 4.6]) {
    fires(MOURN[0], (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.6, 0.28); }); return s; }, { size: 0.8, floorPool: 2.4 });
    circle(x, z, 0.34);
  }
  for (const z of [33, 39]) { hangBanner(MOURN[0], -5.0, z, Math.PI / 2, 'dungeon/banner_patternC_blue.glb'); hangBanner(MOURN[0], 5.0, z, -Math.PI / 2, 'dungeon/banner_patternC_blue.glb'); }

  // --- The Long Vigil: a lamp in every aisle niche, lamps on the arcade, the high altar
  for (const side of ['e', 'w'] as Side[]) for (const [a, b] of spans(nave, side, { cuts: respondCuts('nave', side), cutPad: 0.7 })) {
    for (let t = a + 1.6; t <= b - 1.6 + 1e-6; t += Math.max(3.2, (b - a - 3.2) / Math.max(1, Math.round((b - a - 3.2) / 3.6)))) {
      fires('nave', (p) => { let s: V3 = [0, 0, 0]; onWall(p, nave, side, t, 0, () => { wallNiche(p, { half: 0.8, sill: 1.0, spring: 3.4, depth: 0.45 }); p.at(0, 1.0, 0.22, 0, () => { s = candleStand(p, 0, 0, 0.55); }); }); return s; }, { size: 0.5, floorPool: 2.0 });
    }
  }
  for (const z of [50, 58, 66]) for (const x of [-6, 6]) {
    fires('nave', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.9, 0.34); }); return s; }, { size: 1.0, floorPool: 2.8 });
    circle(x, z, 0.38);
  }
  kit.build('nave', (p) => p.at(0, 0, nave.z1 - INSET, Math.PI, () => {
    const t = p.g('trim'), m = p.g('timber');
    box(t, -3.4, 0, 0, 3.4, 0.3, 2.6, p.detail ? 0.04 : 0, ['ny']);
    box(t, -2.8, 0.3, 0, 2.8, 0.6, 2.2, p.detail ? 0.04 : 0, ['ny']);
    box(m, -2.2, 0.6, 0.3, 2.2, 1.45, 1.7, p.detail ? 0.04 : 0, ['ny']);
    box(t, -2.4, 1.45, 0.2, 2.4, 1.6, 1.85, p.detail ? 0.03 : 0);
    box(p.g('accent'), -2.0, 1.6, 0.4, 2.0, 1.63, 1.6, 0.01);
  }));
  boxCol(0, nave.z1 - INSET - 1.3, 3.4, 1.3, 0, 1.7);
  fires('nave', (p) => { let s: V3 | null = null; p.at(0, 0.6, nave.z1 - INSET - 0.5, Math.PI, () => { s = effigy(p, { holds: 'book', scale: 1.2, plinth: 1.1 }); }); return s; });
  fires('nave', (p) => { const s: V3[] = []; p.at(0, 1.6, nave.z1 - INSET - 1.4, 0, () => { for (const x of [-1.6, 1.6]) s.push(candleStand(p, x, 0, 0.75)); }); return s; }, { small: true, floorPool: 3.2 });
  for (const x of [-2.6, 2.6]) hangBanner('nave', x * 2.2, nave.z1 - INSET - 0.25, Math.PI, 'dungeon/banner_patternA_blue.glb', 1.2, 2.2);

  // --- The halls: the Vigil of Banners, the Three Sisters
  const east = G('easthall'), west = G('westhall');
  for (const side of SIDES) for (const [a, b] of spans(east, side, { cuts: respondCuts('easthall', side), cutPad: 1.0 })) {
    const n = Math.max(1, Math.floor((b - a) / 4.2));
    for (let k = 0; k < n; k++) {
      const t = a + (b - a) * (k + 0.5) / n, [x, z] = faceAt(east, side, t);
      hangBanner('easthall', x + SIDE[side].dx * -0.22, z + SIDE[side].dz * -0.22, SIDE[side].yaw, (k + (side === 'n' ? 1 : 0)) % 2 ? 'dungeon/banner_shield_blue.glb' : 'dungeon/banner_patternA_blue.glb', 1.15, 1.6);
    }
  }
  for (const [x, z] of [[57.6, 41.6], [70.4, 41.6], [57.6, 29.6], [70.4, 29.6]]) {
    fires('easthall', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = brazier(p, { r: 0.55, h: 1.05 }); }); return s; }, { size: 1.2 });
    circle(x, z, 0.5);
  }
  P('props/WeaponStand.gltf', 'easthall', 52.0, 38.8, Math.PI / 2, 1.1); P('props/WeaponStand.gltf', 'easthall', 52.0, 41.4, Math.PI / 2, 1.1);
  for (const [k, z] of [[0, 30.4], [1, 36.6], [2, 41.8]] as [number, number][]) {
    const x = west.x1 - INSET - 1.05;
    fires('westhall', (p) => { let s: V3 | null = null; p.at(x, 0, z, -Math.PI / 2, () => { s = effigy(p, { holds: k === 1 ? 'book' : 'lamp', scale: 1.3, plinth: 1.1 }); }); return s; }, { size: 0.6, floorPool: 2.6 });
    boxCol(x, z, 1.05, 1.0, 0, 4.5);
    fires('westhall', (p) => { const s: V3[] = []; p.at(x - 1.7, 0, z, 0, () => { s.push(candleStand(p, 0, -0.55, 1.0), candleStand(p, 0, 0.55, 1.15)); }); return s; }, { small: true, floorPool: 2.0 });
  }
  for (const [x, z] of [[-70.4, 29.6], [-57.6, 29.6]]) {
    fires('westhall', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.8); }); return s; }, { size: 0.9 });
    circle(x, z, 0.36);
  }

  // --- The Emperors' Vault: the arena, the emperors, the dais, the baldachin, the bier
  const DAIS = { x0: vault.x0 + INSET, x1: vault.x1 - INSET, z0: 120.5, z1: vault.z1 - INSET, y: 1.2 };
  buildAs('vault', { floor: 'timber' }, (p) => {
    // the dais: an ashlar face with a moulded nosing, a marble top, the broad stair, balustrades
    p.g('floor').quad([DAIS.x0, DAIS.y, DAIS.z0], [DAIS.x1, DAIS.y, DAIS.z0], [DAIS.x1, DAIS.y, DAIS.z1], [DAIS.x0, DAIS.y, DAIS.z1], [0, 1, 0]);
    box(p.g('trim'), DAIS.x0, 0, DAIS.z0, DAIS.x1, DAIS.y - 0.12, DAIS.z0 + 0.4, 0, ['ny', 'py']);
    box(p.g('trim'), DAIS.x0, DAIS.y - 0.14, DAIS.z0 - 0.1, DAIS.x1, DAIS.y + 0.01, DAIS.z0 + 0.35, p.detail ? 0.03 : 0);
    p.at(64, 0, 116, 0, () => stairFlight(p, { w: 10, run: 4.5, rise: 1.2, steps: 8, rails: 'none' }));
  });
  kit.build('vault', (p) => {
    for (const [a, b] of [[DAIS.x0, 58.7], [69.3, DAIS.x1]]) p.at((a + b) / 2, DAIS.y, DAIS.z0 + 0.3, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.3 }));
  });
  for (const [a, b] of [[DAIS.x0, 58.7], [69.3, DAIS.x1]]) boxCol((a + b) / 2, DAIS.z0 + 0.25, (b - a) / 2, 0.16, 0, DAIS.y + 1.1, DAIS.y - 0.2);
  buildApi.addDeck(SITE.decks[0].cx, SITE.decks[0].cz, SITE.decks[0].hx, SITE.decks[0].hz, 0, SITE.decks[0].y);
  for (const r of SITE.ramps) buildApi.addRamp(r.x0, r.z0, r.y0, r.x1, r.z1, r.y1, r.half);
  // the baldachin and the empty imperial bier, the writ on its crown (top 2.7)
  kit.build('vault', (p) => p.at(64, DAIS.y, 130.4, 0, () => baldachin(p, { hx: 3.4, hz: 2.0, h: 6.2 })));
  for (const [x, z] of [[60.6, 128.4], [67.4, 128.4], [60.6, 132.4], [67.4, 132.4]]) boxCol(x, z, 0.55, 0.55, 0, DAIS.y + 7, DAIS.y - 0.2);
  kit.build('vault', (p) => p.at(64, DAIS.y, 130.2, 0, () => imperialBier(p, { top: 1.5, w: 3.0, l: 2.2 })));
  boxCol(64, 130.2, 1.55, 1.12, 0, DAIS.y + 1.6, DAIS.y - 0.2);
  fires('vault', (p) => { const s: V3[] = []; p.at(64, DAIS.y, 128.6, 0, () => { s.push(candleStand(p, -2.3, 0, 1.5), candleStand(p, 2.3, 0, 1.5)); }); return s; }, { small: true, floorPool: 4.5 });
  kit.pools.floor('vault', 64, DAIS.y, 130.4, 5.5);
  // the emperors, crowned, in their niches round the walls
  const emperors: [Side, number, number][] = [['w', 102.4, 0], ['w', 118, 0], ['w', 127.6, DAIS.y], ['e', 102.4, 0], ['e', 118, 0], ['e', 127.6, DAIS.y]];
  for (const [side, t, y] of emperors) {
    kit.build('vault', (p) => onWall(p, vault, side, t, y, () => { wallNiche(p, { half: 1.15, sill: 0.02, spring: 4.6, depth: 0.55 }); p.at(0, 0, 1.45, 0, () => effigy(p, { holds: 'sword', crown: true, scale: 1.15, plinth: 1.0 })); }));
    const [x, z] = faceAt(vault, side, t);
    boxCol(x - SIDE[side].dx * 1.4, z, 0.95, 1.0, 0, y + 4);
  }
  for (const [x, z] of [[56.0, 117.4], [72.0, 117.4]]) {
    fires('vault', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = brazier(p, { r: 0.65, h: 1.15 }); }); return s; }, { size: 1.35 });
    circle(x, z, 0.6);
  }
  for (const x of [56.6, 71.4]) hangBanner('vault', x, DAIS.z1 - 0.25, Math.PI, 'dungeon/banner_patternA_blue.glb', 1.55, DAIS.y + 1.2);
  for (const [x, z] of [[53.4, 101.2], [74.6, 101.2]]) {
    fires('vault', (p) => { let s: V3 = [0, 0, 0]; p.at(x, 0, z, 0, () => { s = vigilLamp(p, 1.9); }); return s; }, { size: 0.9 });
    circle(x, z, 0.36);
  }

  // --- The side rooms
  // The Linen Room: the household's linen, laundered and folded for their return
  const linen = G('linen');
  for (const [x, z, yaw] of [[-43.6, linen.z0 + INSET + 0.3, 0], [-39.4, linen.z0 + INSET + 0.3, 0], [-43.6, linen.z1 - INSET - 0.3, Math.PI], [-36.4, linen.z1 - INSET - 0.3, Math.PI]] as [number, number, number][]) {
    P('dungeon/shelves.glb', 'linen', x, z, yaw, 1);
    kit.build('linen', (p) => p.at(x, 0, z, yaw, () => { for (const y of [0.62, 1.22]) for (const dx of [-0.55, 0, 0.55]) box(p.g('trim'), dx - 0.22, y, 0.05, dx + 0.22, y + 0.18 + (dx ? 0 : 0.06), 0.42, 0.04); }));
  }
  P('dungeon/table_medium_tablecloth.glb', 'linen', -40, -109.5, 0, 0.8);
  kit.build('linen', (p) => p.at(-40, 0.8, -109.5, 0.2, () => { for (let k = 0; k < 4; k++) box(p.g('trim'), -0.35, k * 0.09, -0.25, 0.35, k * 0.09 + 0.085, 0.25, 0.03); }));
  P('dungeon/trunk_large_A.glb', 'linen', -44.4, -107.2, Math.PI / 2, 0.9); P('dungeon/trunk_medium_B.glb', 'linen', -44.5, -110.4, Math.PI / 2, 0.9);
  boxCol(-40, -109.5, 0.85, 0.85, 0, 1.0);
  // The Visitors' Register: three centuries of visitors' books
  const reg = G('register');
  for (let x = reg.x0 + INSET + 1.2; x < reg.x1 - INSET - 1; x += 1.8) {
    P(x < 34 || x > 38 ? 'props/Bookcase_1.gltf' : 'props/Bookcase_2.gltf', 'register', x, reg.z1 - INSET - 0.22, Math.PI);
    P('props/Bookcase_2.gltf', 'register', x, reg.z0 + INSET + 0.22, 0);
  }
  P('dungeon/table_long.glb', 'register', 36, -108, Math.PI / 2, 0.8);
  boxCol(36, -108, 1.65, 0.85, 0, 0.9);
  P('props/Book_Open.gltf', 'register', 35.2, -108.1, 0.2, 1, 0.8); P('props/Book_Stack_2.gltf', 'register', 37.3, -107.9, 1.1, 1.2, 0.8); P('props/Page_Stack_Large.gltf', 'register', 36.4, -108.3, 0.5, 1, 0.8);
  fires('register', (p) => [candleStand(p, 34.2, -108, 0.8 + 0.3)], { small: true, floorPool: 2.6 });
  // The Silent Offering: a meal laid for the household, every night
  P('dungeon/table_medium_tablecloth_decorated_B.glb', 'offering', -37.8, 15.4, 0, 0.85);
  for (const [x, z] of [[-38.4, 15.0], [-37.2, 15.8]]) P('dungeon/plate.glb', 'offering', x, z, 0, 0.35, 0.85);
  P('props/Chalice_Golden.gltf', 'offering', -37.7, 14.8, 0, 2.2, 0.85);
  boxCol(-37.8, 15.4, 0.9, 0.9, 0, 1.0);
  kit.build('offering', (p) => p.at(G('offering').x0 + INSET, 0, 10.4, Math.PI / 2, () => {
    const t = p.g('trim'); box(t, -1.3, 0, 0, 1.3, 1.05, 0.9, p.detail ? 0.04 : 0, ['ny']); box(t, -1.4, 1.05, -0.02, 1.4, 1.15, 1.0, p.detail ? 0.03 : 0);
  }));
  boxCol(G('offering').x0 + INSET + 0.45, 10.4, 0.5, 1.3, 0, 1.2);
  fires('offering', (p) => { const s: V3[] = []; p.at(G('offering').x0 + INSET + 0.45, 1.15, 10.4, 0, () => { for (const z of [-0.8, 0, 0.8]) s.push(candleStand(p, 0, z, 0.35)); }); return s; }, { small: true, floorPool: 2.4 });
  P('props/Pot_1_Lid.gltf', 'offering', G('offering').x0 + INSET + 0.5, 9.7, 0, 1.3, 1.15); P('props/Pot_2.gltf', 'offering', G('offering').x0 + INSET + 0.5, 11.1, 0.4, 1.0, 1.15);
  // The Unnamed Tomb: one sarcophagus, its lid left blank
  kit.build('tomb', (p) => p.at(-102, 0, 26, Math.PI / 2, () => sarcophagus(p, { lid: 'flat', chest: 'trim', panel: 'trim' })));
  boxCol(-102, 26, 0.95, 1.6, Math.PI / 2, 1.4);
  fires('tomb', (p) => [candleStand(p, -104.4, 24.9, 1.2), candleStand(p, -99.6, 24.9, 1.2)], { small: true, floorPool: 2.6 });
  // The Unfinished Ledger: the archive, the ledger on its desk (the interactable's table: top 1.1)
  const arc = G('archive');
  kit.build('archive', (p) => p.at(108, 0, 32, -Math.PI / 2, () => {
    const t = p.g('trim'), m = p.g('timber');
    for (const s of [-1, 1]) box(t, s * 0.9 - 0.18, 0, -0.38, s * 0.9 + 0.18, 0.98, 0.38, p.detail ? 0.03 : 0, ['ny']);
    box(m, -1.1, 0.98, -0.48, 1.1, 1.1, 0.48, p.detail ? 0.03 : 0);
  }));
  boxCol(108, 32, 0.5, 1.1, 0, 1.15);
  P('props/Chair_1.gltf', 'archive', 106.7, 32, Math.PI / 2); P('props/Book_Stack_1.gltf', 'archive', 108.2, 31.0, 0.4, 1.2, 1.1);
  fires('archive', (p) => [candleStand(p, 108.2, 33.2, 1.1 + 0.3)], { small: true, floorPool: 2.6 });
  for (const z of [25, 28.6, 35.4, 39]) {
    P(z < 32 ? 'props/Bookcase_1.gltf' : 'props/Bookcase_2.gltf', 'archive', arc.x1 - INSET - 0.22, z, -Math.PI / 2);
    P('props/Bookcase_1.gltf', 'archive', arc.x0 + INSET + 0.22, z, Math.PI / 2);
  }
  P('props/Scroll_2.gltf', 'archive', 103.8, 24.0, 0.3, 1.4); P('props/Page_Stack_Small.gltf', 'archive', 104.4, 40.4, 1.0, 1.2);
  // The shrines: the First Vigil (a lamp held up) and the Last Letter (a book)
  for (const id of ['westshrine', 'eastshrine']) {
    const g = G(id), cx = (g.x0 + g.x1) / 2, zt = g.z1 - INSET - 1.1;
    fires(id, (p) => { let s: V3 | null = null; p.at(cx, 0, zt, Math.PI, () => { s = effigy(p, { holds: id === 'westshrine' ? 'lamp' : 'book', scale: 1.15, plinth: 1.0 }); }); return s; }, { size: 0.6, floorPool: 2.6 });
    boxCol(cx, zt, 0.95, 0.9, 0, 4);
    kit.build(id, (p) => p.at(cx, 0, zt - 2.0, 0, () => { const t = p.g('trim'); box(t, -1.1, 0, -0.45, 1.1, 0.95, 0.45, p.detail ? 0.04 : 0, ['ny']); box(t, -1.2, 0.95, -0.52, 1.2, 1.05, 0.52, p.detail ? 0.03 : 0); }));
    boxCol(cx, zt - 2.0, 1.15, 0.5, 0, 1.1);
    fires(id, (p) => [candleStand(p, cx - 0.8, zt - 2.0, 1.05 + 0.25), candleStand(p, cx + 0.8, zt - 2.0, 1.05 + 0.25)], { small: true, floorPool: 2.4 });
    if (id === 'eastshrine') P('props/Parchment.gltf', id, cx, zt - 2.0, 0.2, 2, 1.05);
    for (const dx of [-3.6, 3.6]) {
      fires(id, (p) => { let s: V3 = [0, 0, 0]; p.at(cx + dx, 0, g.z0 + INSET + 2.2, 0, () => { s = vigilLamp(p, 1.6, 0.26); }); return s; }, { size: 0.75 });
      circle(cx + dx, g.z0 + INSET + 2.2, 0.32);
    }
  }
  // The Folded Standard: the empire's standard folded on its table, the others furled
  const ves = G('vestibule');
  kit.build('vestibule', (p) => p.at(ves.x0 + INSET + 1.0, 0, 72, Math.PI / 2, () => {
    const t = p.g('trim');
    for (const s of [-1, 1]) box(t, s * 1.4 - 0.2, 0, -0.4, s * 1.4 + 0.2, 0.9, 0.4, p.detail ? 0.03 : 0, ['ny']);
    box(p.g('timber'), -1.8, 0.9, -0.55, 1.8, 1.02, 0.55, p.detail ? 0.03 : 0);
    // the standard, folded in a long triangle, its gold edge showing
    for (let k = 0; k < 4; k++) box(p.g('accent'), -0.9 + k * 0.1, 1.02 + k * 0.06, -0.38 + k * 0.03, 0.9 - k * 0.1, 1.08 + k * 0.06, 0.38 - k * 0.03, 0.02);
    box(p.g('inlay'), -0.62, 1.26, -0.3, 0.62, 1.27, 0.3, 0);
    beam(p.g('metal'), [-1.6, 1.08, 0.4], [1.6, 1.08, 0.4], 0.06, 0.06, 0.01);
  }));
  boxCol(ves.x0 + INSET + 1.0, 72, 0.6, 1.85, 0, 1.2);
  kit.build('vestibule', (p) => { for (let k = 0; k < 5; k++) p.at(52.4 + k * 1.0, 0, ves.z0 + INSET + 0.35, 0, () => {
    beam(p.g('metal'), [0, 0, 0], [0.12, 4.0, -0.1], 0.06, 0.06, 0.01);
    lathe(p.g('accent'), [[0.0, 1.9], [0.16, 2.1], [0.2, 2.8], [0.14, 3.5], [0.0, 3.7]], 8, 0.08, -0.06);
    lathe(p.g('metal'), [[0.0, 4.0], [0.06, 4.05], [0.0, 4.3]], 6, 0.12, -0.1);
  }); });
  boxCol(54.4, ves.z0 + INSET + 0.35, 2.5, 0.35, 0, 4);
  // The Keepers' Stair: the keepers' spiral up to the surface, barred
  const ret = G('return'), sx = ret.x1 - INSET - 1.55, sz = ret.z1 - INSET - 1.55;
  kit.build('return', (p) => p.at(sx, 0, sz, 0, () => {
    lathe(p.g('trim'), [[0.2, 0], [0.2, 9.5]], 10, 0, 0);
    const steps = p.detail ? 26 : 13, rise = 9.0 / steps;
    for (let k = 0; k < steps; k++) p.at(0, (k + 1) * rise * (p.detail ? 1 : 1), 0, k * (p.detail ? 0.42 : 0.84), () => box(p.g('floor'), 0.15, -0.16, -0.32, 1.45, 0, 0.32, p.detail ? 0.02 : 0));
    // the iron grille shut across its foot
    if (p.detail) for (let k = 0; k <= 10; k++) { const a = -0.3 + k * 0.17; beam(p.g('metal'), [Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55], [Math.cos(a) * 1.55, 2.5, Math.sin(a) * 1.55], 0.05, 0.05, 0); }
    lathe(p.g('metal'), [[1.52, 2.45], [1.6, 2.5], [1.52, 2.6]], 16, 0, 0, { caps: false, a0: -0.35, a1: 1.45 });
  }));
  circle(sx, sz, 1.6);
  P('dungeon/keyring_hanging.glb', 'return', ret.x0 + INSET + 0.1, 97.2, Math.PI / 2, 1.0, 1.6);

  // =================================================== 4. LIGHT FROM ABOVE
  // the oculi's shafts (one additive mesh) and cool pools on the floor
  const skyPools = new LightPools(scene, '#9cc3e4', 0.3, 'ms_oculuspools');
  const shaftMeshes: Mesh[] = [];
  for (const s of shafts) {
    const floorY = 0;
    for (const [rt, rb, k] of [[1.65, 2.6, 0], [1.2, 1.9, 1]] as [number, number, number][]) {
      const m = MeshBuilder.CreateCylinder(`ms_shaft_${k}`, { height: s.top - floorY, diameterTop: rt * 2, diameterBottom: rb * 2, tessellation: 28, cap: Mesh.NO_CAP }, scene);
      m.position.set(s.x, (s.top + floorY) / 2, s.z);
      shaftMeshes.push(m);
    }
    skyPools.floor(s.group, s.x, floorY, s.z, 4.4);
  }
  const shaft = Mesh.MergeMeshes(shaftMeshes, true, true)!;
  shaft.name = 'ms_forest_light_shafts';
  const sm = new StandardMaterial('ms_forest_light', scene);
  // MEASURED (first look): a flat additive cone read as a glass tube, its rims
  // brightest; and an unlit DIFFUSE colour drew nothing here at all. Emissive
  // only, added, with a fresnel falloff so the silhouette goes to nothing and
  // the middle of the beam carries the light.
  sm.disableLighting = true; sm.emissiveColor = Color3.FromHexString('#7d9ab4').scale(0.3);
  sm.diffuseColor = Color3.Black(); sm.specularColor = Color3.Black();
  sm.emissiveFresnelParameters = new FresnelParameters({ leftColor: Color3.Black(), rightColor: Color3.White(), bias: 0, power: 1.8 });
  sm.alpha = 0.999; sm.alphaMode = Constants.ALPHA_ADD; sm.disableDepthWrite = true; sm.backFaceCulling = false; sm.fogEnabled = true;
  shaft.material = sm; shaft.isPickable = false; shaft.freezeWorldMatrix();
  glow?.addExcludedMesh(shaft); glow?.addExcludedMesh(skyPools.pool.mesh);
  // MEASURED: the kit's LightPools draw nothing -- an unlit StandardMaterial's
  // DIFFUSE is black (no light term), only emissive x the falloff texture shows.
  // Local workaround (tmp/dungeons/mausoleum/helper-requests.md): the colour as emissive.
  for (const m of [kit.pools.pool.mesh.material, skyPools.pool.mesh.material] as StandardMaterial[]) m.emissiveColor = m.diffuseColor.clone();
  skyPools.upload();
  // the sky pools cull with their rooms, as the kit's own pools do
  const apply = kit.apply.bind(kit);
  kit.apply = (v: VisState | null) => { apply(v); skyPools.update(v); };

  // =================================================== 5. CAMERA, finish
  for (const c of dp.cameraRooms(0.35)) {
    const big = c.hx > 8 && c.hz > 8;
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: big ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

registerZone({
  key: 'mausoleum', hemi: THEME.hemi,
  light: { hemiGround: THEME.hemiGround },
  terrain: { tex: 'cobblestone_floor_08', tint: ['#555d65', '#555d65'], tile: 6 },
  lighting: { hemi: THEME.hemi, hemiGround: THEME.hemiGround, fog: { density: 0.011, color: '#131920' }, contrast: 1.12 },
  build: buildMausoleum,
});
