// The Beacon Fort: "three centuries after the fire: cold vitrified terrain and
// a maintained signal." The empire's signal fort in the Melt Ridge saddle of
// the Burned Land, rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md)
// as the reference for the dungeon revamp (tmp/dungeons/HANDBOOK.md).
//
// THE ROUTE (tools/data/dungeon_plans/beaconfort.json is the plan; the
// generator writes zones.json from it): the Gate Yard (spawn, the rune home)
// -> the Gatehouse -> the Ash-Dusted Court, the bailey, where the char hounds
// run -> west through the Guard Hall and the Oil Stores (the wisps) -> up the
// walled Oil Stair onto the ridge -> the Wardens' Cells (the cinder chorus) ->
// the Wall Walk -> the Beacon Stair Terrace and its COLD beacon, the one that
// burned the night of the fire and glassed (the mid set-piece; sentinels) ->
// the Great Stair -> the Beacon Chamber, the Beacon-Keeper, and the LIVE
// beacon on its tower behind the dais, kept lit for three hundred years. The
// east wing (Ash Cellar, Signal Room) is a side branch. The live beacon is in
// sight from the gate on: it is the light that leads you up.
//
// OPEN AIR AND ENCLOSED. The yards, terraces, the wall walk and the stairs are
// open to the sky by nature (`open` in the plan): they get the burnedland
// panorama, the game's sky at a fixed late-afternoon hour and the terrain
// skirt (`outdoor: true`, dungeon-backdrops.json), and the fort stands on a
// rock spur (ridgeMassif) so nothing floats. Halls, stores, cells and passages
// are enclosed: the kit's shell (walls, vaults or trusses, sconces) inside,
// and outside, where the open spaces look at them, an exterior of their own
// (attic walls, battlemented flat roofs, slate gables) in the always-drawn
// group, because the room culler turns an interior off when you cannot see
// into it and its outside must not vanish with it.
//
// SERVER TRUTH. Every wall that blocks stands on a 4 m cell edge the layout
// leaves open (the shell's 0.85 m inset is the server's clear? line). Set
// pieces that stand inside the floor (the cold beacon, the live beacon's
// tower) are on obstacle cells. Props stay out of the camp discs.
import { Color3, Mesh, StandardMaterial, Texture, VertexData } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, doorway, barrelVault, box, beam, lathe,
  openAirShell, abutStrip, enclosedExterior, openStair, merlons,
  type KitPlan, type Group, type Edge, type ShellOpts, type ThemePreset, type V3, type SurfaceSpec, type RoomStyle, type OpenAirResult,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import { noise2 } from '../wild-terrain';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[] } } };
const ZONE = zones.beaconfort as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// The kit's beaconfort preset (dark basalt rubble, ashlar trim, setts, iron,
// ember) with two slots given work here: `dark` is the slate of the hall
// gables and `accent` the vitrified glass (the cold beacon).
const BASE = THEMES.beaconfort;
const SLATE: SurfaceSpec = { sheet: 'tiles', tint: '#5e6068', spec: 0.14, power: 40, scale: 2 };
const GLASSED: SurfaceSpec = { tint: '#1c2228', spec: 0.9, power: 110 };
// MEASURED (first look): under a real sun the preset's #5a5654 basalt went
// black on every shaded face and the ashlar read orange; the stone is lifted
// and greyed for open air, and the lamps and pools, tuned for black interiors,
// burned the sunlit floors white, so they are cut to about half.
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces, dark: SLATE, accent: GLASSED,
    // the roofs and vaults of the enclosed rooms carry a small emissive floor:
    // the Guard Hall's and the Signal Room's trusses read black (MEASURED
    // polish pass: upper third median 10-12 of 255)
    wall: { ...BASE.surfaces.wall, tint: '#77726e' }, ceiling: { ...BASE.surfaces.ceiling, tint: '#5a5653', emissive: '#2c2622' },
    timber: { ...BASE.surfaces.timber, emissive: '#221c18' },
    trim: { ...BASE.surfaces.trim, tint: '#7c7873' },
    // the beacon's coals: hot and unlit, but OUT of the glow pass -- a 7 m disc of
    // glow haloed into an orange blob (first look); the flames carry the halo
    glass: { tint: '#ff8a3c', emissive: '#ff8a3c', unlit: true },
  },
  arch: { ...BASE.arch, wallHeight: 5.5, corridorHeight: 4.6, plinth: true, cornice: true },
  lamp: { ...BASE.lamp, intensity: 0.85, range: 18 },
  pool: { ...BASE.pool, strength: 0.2 },
};

const INSET = 0.85, OUTER = 1.15, THICK = INSET + OUTER, CELL = 4;
// an enclosed room's shell walls stop just past the cell edge; the exterior
// (section 3) is the rest of the 2 m of masonry, in the always-drawn group
const ENC_OUTER = 0.05, DOOR_SPRING = 2.9;
// open spaces: the curtain wall's (yards) or the parapet's (terraces, walks) height
const OPEN_H: Record<string, number> = { entry: 7, court: 9, ridge: 1.3, beacon: 1.3 };
const PARAPET = 1.3;
// enclosed rooms: wall height to the springing and the ceiling kind
const ROOMS: Record<string, Partial<RoomStyle>> = {
  gatehouse: { height: 5.5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  guard: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  oil: { height: 5, ceiling: 'barrel', sconceEvery: 2 },
  ash: { height: 5, ceiling: 'barrel', sconceEvery: 2 },
  signal: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  cells: { height: 4.5, ceiling: 'barrel', sconceEvery: 2 },
};
const GATE_TOP = 12.5;

// ------------------------------------------------------------------ the zone
function buildBeacon(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const meta: ({ open?: boolean } | null)[] = LAYOUT.corridor_meta ?? [];
  const cellOf = (i: number, j: number) => dp.cells.get(`${i},${j}`);
  const isStair = (g: Group) => g.kind === 'corridor' && g.cells.every(([i, j]) => !!cellOf(i, j)?.stair);
  const isOpen = (g: Group) => g.room ? !!(g.room as { open?: boolean }).open
    : g.cells.some(([i, j]) => { const c = cellOf(i, j); return c?.corridor != null && !!meta[c.corridor]?.open; });
  const openIds = plan.groups.filter(isOpen).map((g) => g.id);
  const OPEN = new Set(openIds);

  const kit = new DungeonKit(scene, THEME, plan, {
    prefix: 'bf', glow, glowOccluders: false,
    // open air is seen over walls from everywhere: always drawn (far LOD past
    // 45 m); interiors only through their doorways
    visibility: { always: openIds },
  });
  const so: ShellOpts = { style: THEME.arch, inset: INSET, outer: ENC_OUTER, rooms: ROOMS, corridorSconceEvery: 3, skipCeiling: ['gatehouse'] };

  // --- fire: a standing brazier is a flame, a lamp slot and a floor pool
  const brazierAt = (group: string, x: number, y: number, z: number, size = 1, r = 0.55, h = 1.05) => {
    let seat: V3 = [x, y + h, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r, h }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size });
    buildApi.addCircleCollider(x, z, r * 0.9);
  };

  // =================================================== 1. ENCLOSED interiors
  // the kit's shell: floors, walls with plinth and cornice, doorways, vaults
  // or trusses, sconces (each a flame, a lamp and its light pools)
  for (const g of plan.groups) {
    if (OPEN.has(g.id)) continue;
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
  }
  // their colliders: the shell's, for the enclosed groups' runs only
  const enclosedPlan: KitPlan = { ...plan, runs: plan.runs.filter((r) => !OPEN.has(r.group)) };
  for (const c of shellColliders(enclosedPlan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // the gatehouse vault runs right through to its arches (the shell's barrel
  // would close its ends with lunettes, and both ends are open)
  const gh = plan.byId.get('gatehouse')!;
  kit.build('gatehouse', (p) => {
    p.at(0, 0, 0, 0, () => barrelVault(p, { span: 12 - 2 * INSET, z0: gh.z0 - 0.4, z1: gh.z1 + 0.4, spring: 5.5, rise: 5.15, ribEvery: 3, ends: [false, false] }));
    // the portcullis, raised into its slot under the north arch
    if (p.detail) for (let x = -4.6; x <= 4.61; x += 0.66) box(p.g('metal'), x - 0.05, 5.0, gh.z1 - 1.1, x + 0.05, 7.6, gh.z1 - 0.98, 0.01);
    for (const y of [5.2, 6.1, 7.0]) box(p.g('metal'), -4.8, y, gh.z1 - 1.12, 4.8, y + 0.1, gh.z1 - 0.96, 0.01);
  });

  // ==================================================== 2. OPEN-AIR spaces
  // floors, curtain walls (battlemented) or parapets (coped, merlons), the
  // masonry down to the rock under every raised edge, doorways where an
  // enclosed passage leaves, and open gaps (newels with fire bowls) where an
  // open stair or walk meets the space
  const newelFires: { group: string; seat: V3 }[] = [];
  // where the live beacon's tower stands in the rear parapet
  const towerGap = (e: Edge) => e.z > 125 && Math.abs(e.x) < 6;
  for (const g of plan.groups) {
    if (!OPEN.has(g.id) || isStair(g)) continue;
    const id = g.room?.id ?? '';
    let res: OpenAirResult = { colliders: [], fires: [] };
    kit.build(g.id, (p) => {
      const r = openAirShell(p, plan, g, {
        height: OPEN_H[id] ?? PARAPET, isOpen: (gid) => OPEN.has(gid), inset: INSET, outer: OUTER, skipEdge: towerGap,
        floor: { border: id === 'court' ? 1.2 : 0.7, inlay: id === 'ridge' || id === 'beacon' ? 'grid' : 'none' },
      });
      if (p.detail) res = r;
    });
    for (const c of res.colliders) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
    for (const s of res.fires) newelFires.push({ group: g.id, seat: s });
  }
  for (const f of newelFires) kit.fire(f.group, f.seat, { size: 0.8, floorPool: 2.6 });

  // the floor where two rooms abut (the gatehouse's ends)
  for (const pt of plan.portals) {
    if (plan.byId.get(pt.a)!.kind !== 'room' || plan.byId.get(pt.b)!.kind !== 'room') continue;
    kit.build(OPEN.has(pt.a) ? pt.a : pt.b, (p) => abutStrip(p, pt, INSET));
  }

  // --- the stairs: open flights between parapets that slope with them; the
  // dais's twin flights get balustrades
  for (const r of SITE.ramps) {
    const mid = plan.cellGroup.get(`${Math.round((r.x0 + r.x1) / 2 / CELL)},${Math.round((r.z0 + r.z1) / 2 / CELL)}`);
    const group = mid ?? (r.y0 >= 16 ? 'beacon' : 'ridge');
    let cols: ReturnType<typeof openStair> = [];
    kit.build(group, (p) => { const c = openStair(p, r, { thick: THICK, parapet: PARAPET, balustrade: r.half < 2.5 }); if (p.detail) cols = c; });
    for (const c of cols) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
  }

  // ============================================ 3. EXTERIORS of the interiors
  // In the always-drawn group: what the open air sees of an enclosed room,
  // whether or not the culler has its inside on. MEASURED (first audit): with
  // the room's own wall slabs as its outside, a culled hall lost its walls up to
  // the springing and its roof floated. So the shell's walls are thin
  // (ENC_OUTER past the cell edge) and the exterior is the rest of the masonry,
  // from the rock to the roof, an arch at every doorway, and the roof itself.
  for (const g of plan.groups) {
    if (OPEN.has(g.id)) continue;
    kit.build('*', (p) => enclosedExterior(p, plan, g, so, { inset: INSET, outer: OUTER, shellOuter: ENC_OUTER, doorSpring: DOOR_SPRING, top: g.id === 'gatehouse' ? GATE_TOP : undefined }));
  }
  // the gatehouse: two great arches through the tower, up to its battlements
  kit.build('*', (p) => {
    for (const [z, yaw] of [[gh.z0, Math.PI], [gh.z1, 0]] as [number, number][]) {
      p.at(0, 0, z + (yaw === 0 ? -INSET : INSET), yaw, () => {
        doorway(p, { h: GATE_TOP, thick: THICK, half: 6 - INSET, spring: 4.4, rise: 3.0, kind: 'arch', edge: 6 + OUTER });
        box(p.g('wall'), -6 - OUTER, GATE_TOP, -THICK, 6 + OUTER, GATE_TOP + 0.9, -THICK + 0.55, 0, ['ny']);
        merlons(p, -6 - OUTER, 6 + OUTER, GATE_TOP + 0.9, THICK, 0.55, 0.85);
      });
    }
  });

  // ================================================== 4. THE SET PIECES
  // --- The Gate Yard: the outer gate the household left by, shut behind the rune
  kit.build('entry', (p) => p.at(0, 0, -46 + INSET, 0, () => {
    const t = p.g('timber');
    box(t, -2.3, 0, 0.02, 0.0, 4.6, 0.22, 0.03); box(t, 0.0, 0, 0.02, 2.3, 4.6, 0.22, 0.03);
    if (p.detail) for (const y of [0.7, 2.0, 3.3]) box(p.g('metal'), -2.4, y, 0.2, 2.4, y + 0.16, 0.28, 0.01);
    box(p.g('trim'), -3.3, 0, 0, -2.3, 5.4, 0.42, 0.05); box(p.g('trim'), 2.3, 0, 0, 3.3, 5.4, 0.42, 0.05);
    box(p.g('trim'), -3.5, 4.6, 0, 3.5, 5.6, 0.48, 0.05);
  }));
  brazierAt('entry', -7.6, 0, -36.4, 1.1);
  brazierAt('entry', 7.6, 0, -36.4, 1.1);

  // --- The Ash-Dusted Court: the bailey's well, its forge lean-to, braziers to the doors
  kit.build('court', (p) => p.at(14, 0, -12, 0, () => {
    lathe(p.g('trim'), [[1.5, 0], [1.55, 0.2], [1.5, 0.95], [1.62, 1.05], [1.62, 1.15], [1.2, 1.15], [1.2, 0.2]], p.detail ? 20 : 10, 0, 0);
    p.g('dark').poly(Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * Math.PI * 2) * 1.2, 0.5, Math.sin(k / 16 * Math.PI * 2) * 1.2] as V3), [0, 1, 0]);
    for (const s of [-1, 1]) beam(p.g('timber'), [s * 1.35, 0.9, 0], [s * 1.35, 3.4, 0], 0.22, 0.22);
    beam(p.g('timber'), [-1.6, 3.3, 0], [1.6, 3.3, 0], 0.26, 0.26);
    if (p.detail) beam(p.g('timber'), [-1.2, 2.3, 0], [1.2, 2.3, 0], 0.3, 0.3, 0.12);
  }));
  buildApi.addCircleCollider(14, -12, 1.7);
  // the forge lean-to against the east curtain, north of the east door
  kit.build('court', (p) => p.at(24.3, 0, 12, -Math.PI / 2, () => {
    for (const x of [-4, 0, 4]) beam(p.g('timber'), [x, 0, -3.2], [x, 3.0, -3.2], 0.26, 0.26);
    beam(p.g('timber'), [-4.4, 3.0, -3.2], [4.4, 3.0, -3.2], 0.28, 0.3);
    p.g('dark').quad([-4.8, 3.25, -3.6], [4.8, 3.25, -3.6], [4.8, 4.6, 0.2], [-4.8, 4.6, 0.2], [0, 1, -0.35]);
    box(p.g('trim'), -2.4, 0, -2.3, -0.4, 0.95, -0.6, 0.05);  // the hearth
    box(p.g('emit'), -2.1, 0.95, -2.0, -0.7, 1.03, -0.9, 0.02);
  }));
  buildApi.addBoxCollider(21.5, 10.4, 1.0, 1.0, 0, 3, -1);
  for (const [x, z] of [[-23, -8.6], [-23, 0.6], [23, -8.6], [23, 0.6], [-8.6, -18.8], [8.6, -18.8], [-12, 18.6], [12, 18.6]]) brazierAt('court', x, 0, z, 1.05);

  // --- The Beacon Stair Terrace: the COLD beacon, glassed the night of the fire
  kit.build('ridge', (p) => p.at(0, 8, 44, 0, () => {
    box(p.g('trim'), -2.3, 0, -2.3, 2.3, 0.6, 2.3, 0.05, ['ny']);
    box(p.g('wall'), -1.9, 0.6, -1.9, 1.9, 1.5, 1.9, 0.05, ['ny']);
    // four iron legs leaning in to a ring, the great basket on it
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) beam(p.g('metal'), [sx * 1.5, 1.5, sz * 1.5], [sx * 0.7, 7.2, sz * 0.7], 0.3, 0.3, 0.04);
    lathe(p.g('metal'), [[0.9, 7.0], [2.6, 7.6], [3.4, 8.8], [3.6, 9.6], [3.3, 9.5], [2.4, 8.6], [0.8, 7.2]], p.detail ? 20 : 10, 0, 0, { caps: false });
    // the fused, glassed charge in the basket, cracked and faintly warm still
    lathe(p.g('accent'), [[0, 9.9], [1.4, 9.85], [2.6, 9.55], [3.3, 9.3], [3.15, 9.0], [0, 8.9]], p.detail ? 16 : 8, 0, 0);
    if (p.detail) for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.3, r0 = 0.4 + (k % 3) * 0.5;
      beam(p.g('emit'), [Math.cos(a) * r0, 9.93 - r0 * 0.06, Math.sin(a) * r0], [Math.cos(a + 0.4) * (r0 + 1.1), 9.75 - r0 * 0.1, Math.sin(a + 0.4) * (r0 + 1.1)], 0.07, 0.02, 0);
    }
    // glass that ran down the legs and pooled on the plinth
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.4, r0 = 1.6 + (k % 2) * 0.35, hgt = 0.7 + (k % 3) * 0.45;
      beam(p.g('accent'), [Math.cos(a) * r0, 1.45, Math.sin(a) * r0], [Math.cos(a) * (r0 - 0.4), 1.5 + hgt, Math.sin(a) * (r0 - 0.4)], 0.32, 0.22, 0.05);
    }
  }));
  buildApi.addBoxCollider(0, 44, 2.3, 2.3, 0, 10, 7);
  for (const [x, z] of [[-14.8, 32.6], [14.8, 32.6], [-14.8, 60.2], [14.8, 60.2]]) brazierAt('ridge', x, 8, z, 1.05);

  // --- The Beacon Chamber: the dais, and the live beacon's tower behind it
  const DAIS = { x0: -14 + INSET, x1: 14 - INSET, z0: 118, z1: 126 - INSET, y: 16, top: 18 };
  kit.build('beacon', (p) => {
    // the dais: an ashlar face, a moulded nosing, a balustrade but where the stairs come up
    p.g('floor').quad([DAIS.x0, DAIS.top, DAIS.z0], [DAIS.x1, DAIS.top, DAIS.z0], [DAIS.x1, DAIS.top, DAIS.z1], [DAIS.x0, DAIS.top, DAIS.z1], [0, 1, 0]);
    box(p.g('trim'), DAIS.x0, DAIS.y, DAIS.z0, DAIS.x1, DAIS.top, DAIS.z0 + 0.5, 0, ['ny', 'py']);
    box(p.g('trim'), DAIS.x0, DAIS.top - 0.12, DAIS.z0 - 0.12, DAIS.x1, DAIS.top + 0.02, DAIS.z0 + 0.3, p.detail ? 0.03 : 0);
    for (const [a, b] of [[DAIS.x0, -6.1], [-1.9, 1.9], [6.1, DAIS.x1]]) p.at((a + b) / 2, DAIS.top, DAIS.z0 + 0.3, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.3 }));
  });
  // the tower: on the obstacle cells and out over the rock behind the rear wall
  const TOWER = { x0: -5.2, x1: 5.2, z0: 122.6, z1: 134.5 };
  let beaconSeat: V3 = [0, 34, 128];
  kit.build('beacon', (p) => {
    const w = p.g('wall'), t = p.g('trim');
    box(w, TOWER.x0, 8, TOWER.z0, TOWER.x1, 30, TOWER.z1, 0, ['ny']);
    box(t, TOWER.x0 - 0.3, 18, TOWER.z0 - 0.3, TOWER.x1 + 0.3, 19.1, TOWER.z1 + 0.3, p.detail ? 0.06 : 0);
    if (p.detail) for (const y of [23.5, 27.5]) box(t, TOWER.x0 - 0.15, y, TOWER.z0 - 0.15, TOWER.x1 + 0.15, y + 0.35, TOWER.z1 + 0.15, 0.04);
    // a corbelled crown and the iron fire basket on it
    box(t, TOWER.x0 - 0.9, 29.4, TOWER.z0 - 0.9, TOWER.x1 + 0.9, 30.6, TOWER.z1 + 0.9, p.detail ? 0.06 : 0);
    if (p.detail) for (let x = TOWER.x0; x <= TOWER.x1 + 0.01; x += 1.3) box(t, x - 0.2, 28.4, TOWER.z0 - 0.85, x + 0.2, 29.4, TOWER.z0, 0.03, ['py']);
    const cz = (TOWER.z0 + TOWER.z1) / 2;
    p.at(0, 30.6, cz, 0, () => {
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; beam(p.g('metal'), [Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4], [Math.cos(a) * 3.6, 2.6, Math.sin(a) * 3.6], 0.28, 0.28, 0.03); }
      lathe(p.g('metal'), [[1.0, 0.2], [3.2, 1.3], [4.2, 2.6], [4.4, 3.3], [4.1, 3.25], [3.1, 2.2], [0.9, 0.5]], p.detail ? 24 : 12, 0, 0, { caps: false });
      // the coals sit a hand below the rim, so the rim, not a disc of glow, is the silhouette
      lathe(p.g('glass'), [[0, 2.75], [2.4, 2.7], [3.7, 2.6], [3.0, 2.0], [0, 1.6]], p.detail ? 18 : 10, 0, 0);
      if (p.detail) beaconSeat = p.world(0, 3.6, 0);
      // MEASURED: the flame cards are additive, and additive fire on a bright
      // daytime sky is white on white: nothing. A solid core of unlit tongues
      // stands above the rim so the beacon reads against the sky from the
      // arena floor and from the gate; the cards flicker over it.
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4, rr = k ? 1.1 + (k % 3) * 0.55 : 0, h = k ? 2.6 + (k % 3) * 0.9 : 5.2, w = k ? 0.75 + (k % 2) * 0.3 : 1.25;
        lathe(p.g('glass'), [[w * 0.9, 2.5], [w, 2.5 + h * 0.22], [w * 0.62, 2.5 + h * 0.55], [w * 0.22, 2.5 + h * 0.85], [0, 2.5 + h]], p.detail ? 10 : 6, Math.cos(a) * rr, Math.sin(a) * rr, { caps: false });
      }
    });
    // ashlar quoins up the corners, slit windows, the keeper's door on the dais
    for (const x of [TOWER.x0, TOWER.x1]) box(t, x - 0.45, 19.1, TOWER.z0 - 0.45, x + 0.45, 29.4, TOWER.z0 + 0.6, p.detail ? 0.05 : 0);
    if (p.detail) for (const [x, y] of [[-2.6, 22.2], [2.6, 22.2], [0, 26]] as [number, number][]) {
      box(p.g('dark'), x - 0.22, y, TOWER.z0 - 0.03, x + 0.22, y + 1.9, TOWER.z0 + 0.2, 0);
      box(t, x - 0.5, y - 0.25, TOWER.z0 - 0.2, x + 0.5, y, TOWER.z0 + 0.05, 0.03);
    }
    p.at(0, 18, TOWER.z0, Math.PI, () => {
      box(p.g('timber'), -1.1, 0, -0.05, 1.1, 3.2, 0.15, 0.03);
      if (p.detail) for (const y of [0.6, 1.6, 2.6]) box(p.g('metal'), -1.15, y, 0.12, 1.15, y + 0.12, 0.2, 0.01);
      box(p.g('trim'), -1.6, 0, -0.2, -1.1, 3.6, 0.3, 0.04); box(p.g('trim'), 1.1, 0, -0.2, 1.6, 3.6, 0.3, 0.04);
      box(p.g('trim'), -1.8, 3.2, -0.2, 1.8, 3.9, 0.35, 0.04);
    });
    // the keeper's iron rungs up the tower's back
    if (p.detail) for (let k = 0; k < 9; k++) box(p.g('metal'), -1.2, 19.5 + k * 1.2, TOWER.z1, 1.2, 19.62 + k * 1.2, TOWER.z1 + 0.9, 0.01);
  });
  buildApi.addBoxCollider(0, (TOWER.z0 + 126) / 2, (TOWER.x1 - TOWER.x0) / 2, (126 - TOWER.z0) / 2, 0, 40, 15);
  // the live fire: a crown of flames, the basket's lamp, the dais in its pool
  kit.fire('beacon', beaconSeat, { size: 9, floorPool: 0 });
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + 0.3, r = k % 2 ? 2.7 : 1.6;
    kit.flames.add('beacon', beaconSeat[0] + Math.cos(a) * r, beaconSeat[1] + 0.8, beaconSeat[2] + Math.sin(a) * r, 1.5 + (k % 3) * 0.3, 3.6 + (k % 3) * 0.8, true);
  }
  kit.pools.floor('beacon', 0, 18, 120.5, 9);
  kit.pools.floor('beacon', 0, 16, 108, 11);
  for (const [x, z] of [[-11.6, 93.6], [11.6, 93.6], [-11.6, 114.8], [11.6, 114.8]]) brazierAt('beacon', x, 16, z, 1.15, 0.6, 1.1);

  // ================================================== 5. PROPS (CC0, pooled)
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, far = false) =>
    kit.props.place({ file, group, x, y: floorAt(x, z), z, yaw, scale, far });
  const PY = (file: string, group: string, x: number, y: number, z: number, yaw = 0, scale = 1, far = false) =>
    kit.props.place({ file, group, x, y, z, yaw, scale, far });
  // the yard: the last wagon, never unloaded
  P('props/Wagon.gltf', 'entry', -5.6, -42.2, 1.75, 1, true);
  P('dungeon/crates_stacked.glb', 'entry', 6.6, -43.6, 0.3, 0.75);
  P('props/Barrel_Dark.gltf', 'entry', 8.3, -41.2, 0.2); P('props/Barrel_Dark.gltf', 'entry', 7.6, -40.3, 1.4);
  // the court: stores and arms where the household left them
  P('dungeon/crates_stacked.glb', 'court', -22.8, 18.3, 0.2, 0.8, true);
  P('dungeon/barrel_large.glb', 'court', -19.8, 19.2, 0.6, 0.65);
  P('props/Crate_Wooden.gltf', 'court', -22.9, 15.6, 0.4); P('props/Crate_Wooden.gltf', 'court', -21.8, 14.9, 1.1);
  P('props/WeaponStand.gltf', 'court', -24.2, -14.5, Math.PI / 2); P('props/WeaponStand.gltf', 'court', -24.2, -18, Math.PI / 2);
  P('props/Anvil.gltf', 'court', 22.6, 9.4, 1.4); P('props/Workbench.gltf', 'court', 23.8, 14.6, -Math.PI / 2);
  P('props/Barrel.gltf', 'court', 23.6, 17.2, 0.3); P('props/Bucket_Metal.gltf', 'court', 21.9, 8.3, 0.7);
  P('dungeon/rubble_half.glb', 'court', 18.5, 19.4, 3.0, 0.7, true);
  P('props/Wagon.gltf', 'court', 17.5, -17.6, 2.6, 1, true);
  P('dungeon/sword_shield_broken.glb', 'court', 4.2, -20.3, 0, 0.8);
  // the guard hall: tables, benches, beds, arms
  for (const z of [-12, 0]) { P('dungeon/table_long.glb', 'guard', -56, z, Math.PI / 2, 0.8); P('props/Bench.gltf', 'guard', -56, z - 1.6, 0); P('props/Bench.gltf', 'guard', -56, z + 1.6, Math.PI); }
  for (const z of [-15, -11.5, 2.5]) P('dungeon/bed_frame.glb', 'guard', -63.4, z, Math.PI / 2, 0.85);
  P('props/WeaponStand.gltf', 'guard', -40.3, -14, -Math.PI / 2); P('props/Chest_Wood.gltf', 'guard', -64.2, -2.5, Math.PI / 2);
  P('dungeon/barrel_small_stack.glb', 'guard', -40.6, 3.6, -Math.PI / 2, 0.85);
  // the oil stores: rows of casks and jars
  for (const z of [16.3, 32]) for (let x = -63; x <= -41; x += 2.2) if (Math.abs(x + 54) > 3.2) P(z < 20 ? 'props/Barrel_Dark.gltf' : 'dungeon/keg.glb', 'oil', x, z, (x * 7) % 3, z < 20 ? 1.1 : 0.55);
  for (const z of [18.5, 23, 27.5]) P('dungeon/barrel_large.glb', 'oil', -64.3, z, 0.4, 0.7);
  P('props/Pot_2_Lid.gltf', 'oil', -40.5, 18.2, 0, 1.6); P('props/Pot_2_Lid.gltf', 'oil', -40.8, 19.2, 1, 1.4); P('props/Cauldron.gltf', 'oil', -41, 23.5, 0.3);
  // the ash cellar: what the ash buried
  P('dungeon/rubble_large.glb', 'ash', 60.5, -15.3, 0.1, 0.7); P('dungeon/rubble_half.glb', 'ash', 40.8, 2.5, 1.8, 0.6);
  P('props/Bucket_Metal.gltf', 'ash', 40.5, -15.6, 0); P('props/Cauldron.gltf', 'ash', 64, 3.7, 0.4);
  // the signal room: the orders, the pages, the log copies
  P('dungeon/table_long_decorated_A.glb', 'signal', 52, 24, 0, 0.8); P('props/BookStand.gltf', 'signal', 52, 30.5, Math.PI);
  P('props/Page_Stack_Large.gltf', 'signal', 51.6, 22.4, 0.3); P('props/Book_Open.gltf', 'signal', 52.4, 25.4, 0.1);
  P('props/Bookcase_1.gltf', 'signal', 64.6, 24, -Math.PI / 2); P('props/Bookcase_2.gltf', 'signal', 64.6, 20, -Math.PI / 2);
  P('props/Chest_Legendary.gltf', 'signal', 39.6, 30.8, Math.PI / 2);
  // the wardens' cells: cages, chains, the straw
  for (const x of [-62, -58, -46, -42]) P('props/Cage_Large.gltf', 'cells', x, 72.3, Math.PI, 1.5);
  P('dungeon/bed_floor.glb', 'cells', -64.3, 58, Math.PI / 2, 0.8); P('props/Chain_Coil.gltf', 'cells', -60, 56.5, 0.4);
  P('props/Bucket_Wooden_1.gltf', 'cells', -64.5, 61.5, 0); P('halloween/bone_A.gltf', 'cells', -45.5, 70.5, 0.7);
  // the terrace: the empire's banners still up, the old charge's debris
  P('dungeon/rubble_half.glb', 'ridge', -6.2, 37.2, 0.8, 0.45); P('dungeon/rubble_half.glb', 'ridge', 5.5, 38.4, 2.4, 0.4);
  // the beacon chamber: cut fuel stacked for the keeper's fire, oil in the dark casks
  for (let k = 0; k < 4; k++) PY('WoodLog.glb', 'beacon', -12 + (k % 2) * 0.7, 16 + Math.floor(k / 2) * 0.62, 104 + (k % 2) * 0.3, Math.PI / 2, 1.2);
  for (let k = 0; k < 4; k++) PY('WoodLog.glb', 'beacon', 12 - (k % 2) * 0.7, 16 + Math.floor(k / 2) * 0.62, 104 - (k % 2) * 0.3, Math.PI / 2, 1.2);
  PY('props/Barrel_Dark.gltf', 'beacon', -12.4, 18, 124.4, 0.3); PY('props/Barrel_Dark.gltf', 'beacon', -11.5, 18, 124.8, 1.2);

  // ================================================== 6. THE ROCK, the camera, finish
  ridgeMassif(dp);
  for (const c of dp.cameraRooms(0.35)) {
    const open = c.y1 - c.y0 > 20 || c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: open ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

// ------------------------------------------------------------------ the rock
// The spur the fort climbs: rock under every raised floor, falling away from
// it at about 30 degrees to the burned plain, where the terrain skirt
// (dungeon-backdrop.ts) carries it on into the panorama. It never comes up
// through a floor (clamped under each floor cell), and its foot is below the
// skirt, so the join is the skirt's. One mesh, one draw; a backdrop to the
// dungeon audit (metadata.backdrop).
function ridgeMassif(dp: ReturnType<typeof dungeonPlan>): void {
  const raised: { x: number; z: number; y: number }[] = [];
  for (const c of dp.cells.values()) if (c.y > 0.5) raised.push({ x: c.x, z: c.z, y: c.y });
  // the beacon tower's rock, out behind the rear wall
  for (let x = -8; x <= 8; x += 4) for (let z = 128; z <= 136; z += 4) raised.push({ x, z, y: 15 });
  const H = (x: number, z: number): number => {
    let h = -3;
    for (const c of raised) {
      const d = Math.hypot(Math.max(0, Math.abs(x - c.x) - 2), Math.max(0, Math.abs(z - c.z) - 2));
      const v = c.y - 0.9 - 0.62 * d - 0.004 * d * d;
      if (v > h) h = v;
    }
    const s = Math.max(0, Math.min(1, (h + 0.6) / 4));
    h += ((noise2(x / 11, z / 11, 7) - 0.5) * 3.2 + (noise2(x / 3.7, z / 3.7, 8) - 0.5) * 0.9) * s;
    const cell = dp.cellAt(x, z);
    if (cell) h = Math.min(h, cell.y - 0.5);
    return h;
  };
  const x0 = -96, x1 = 96, z0 = -40, z1 = 186, step = 2;
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, y = H(x, z);
    pos.push(x, y, z); uv.push(x / 9, z / 9 + y / 9);
    // scorched dark low down, the glassed crest a little lighter
    const k = 0.68 + 0.28 * Math.max(0, Math.min(1, (y + 1) / 14)) + (noise2(x / 6, z / 6, 9) - 0.5) * 0.2;
    col.push(k, k * 0.98, k * 0.96, 1);
  }
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // skip quads wholly under the skirt
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -0.9) continue;
    // wound to Babylon's front-face convention for an upward face: (a, b, c)
    // with b = +x and c = +z. MEASURED (greatwatchtower, which copied this):
    // (a, c, b) faced the rock down, so from above it was culled and showed
    // only as thin dark wings
    idx.push(a, b, c, b, d, c);
  }
  const mesh = new Mesh('bf_ridge_rock_backdrop', scene), vd = new VertexData(), nrm: number[] = [];
  VertexData.ComputeNormals(pos, idx, nrm);
  vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv; vd.colors = col;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial('bf_ridge_rock', scene);
  const d = new Texture('/tex/dry_riverbed_rock_diff.jpg', scene), n = new Texture('/tex/dry_riverbed_rock_nor.jpg', scene);
  n.level = 0.8;
  m.diffuseTexture = d; m.bumpTexture = n;
  m.diffuseColor = Color3.FromHexString('#8a8e94').scale(1.5);
  m.specularColor = new Color3(0.05, 0.05, 0.06);
  m.maxSimultaneousLights = 6;
  mesh.material = m; mesh.isPickable = false; mesh.metadata = { backdrop: true };
  mesh.freezeWorldMatrix();
  glow?.addExcludedMesh(mesh);
}

registerZone({
  key: 'beaconfort', height: floorAt, hemi: THEME.hemi,
  // MEASURED: `light.hemiGround` wins over `lighting.hemiGround` (scene.ts reads
  // it after the lighting preset), and with the late sun ahead of the route,
  // every face the climb looks at is lit by the hemisphere's ground term: the
  // preset's #3a2a22 turned them black. A warm ash ground, in both places.
  light: { hemiGround: '#a49482' },
  terrain: { tex: 'dry_ground_01', tint: ['#63686b', '#63686b'], tile: 6 },
  // the burnedland panorama from the fort in the saddle, its sky at the hour
  outdoor: true,
  lighting: { hemi: 1.25, hemiGround: '#a49482', sun: 1.25, exposure: 1.12, contrast: 1.1, fog: { density: 0.0022, color: '#8a8682' } },
  build: buildBeacon,
});
