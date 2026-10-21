// The Overseer's Lodge: "The plantation still records every absent shift. Its
// branching timber house distinguishes daily administrative work from the
// Mausoleum's stone ceremony." Heartwood's doorstep trial (L20-22), rebuilt
// 2026-10-11 on the dungeon kit (tmp/dungeons/HANDBOOK.md; the record is
// tmp/dungeons/overseerslodge/RESULT.md).
//
// It is always the night the household left. Moonlight at every window,
// lamplight inside, every desk laid out for a shift that never came.
//
// THE ROUTE (tools/data/dungeon_plans/overseerslodge.json is the plan; the
// generator writes zones.json from it). One timber house on a north axis:
//   the Porch (spawn, the rune home, the front door shut behind you)
//   -> the Clerks' Hall: two rows of writing desks under a tall king-post roof,
//      the duty lecterns at the far end (shift clerks, two packs)
//   -> the Tally Room: low and close, racks of tally sticks, counting frames
//      (tally sentinels)
//   -> THE ROTA HALL, the mid set-piece: the tallest room, a gallery round
//      three sides on timber posts, a stair up the west wall, the Rota itself
//      -- three hundred years of shifts, every one absent -- across the north
//      wall over the clerks' desks upstairs, an iron ring of candles (clerks)
//   -> the Private Counting Room: a coffered strongroom, chests, the balances
//      (a sentinel)
//   -> Centuries of Ledgers: a nave of ledger stacks with ladders, clerestory
//      windows, "By appointment" over the far door (clerks)
//   -> THE OVERSEER'S OFFICE: coffered, the desk platform across the back wall
//      with its balustrade and stair, the Sealed Notice on the desk, the
//      Estates' survey on the wall behind it, the household's green standards.
// The wings off it (both loop back to the Tally Room): west, the First Shift
// Dormitory (clerks) and the Empty Mess Hall with its hearth; east, the Second
// Shift Dormitory, where the hounds sleep in the shift's bunks, and the Hound
// Court's stalls. Off the Rota Hall's east side, the quests' "side chamber":
// the Rootbound Lock-up, its cells barred, a heartwood tree grown up through
// its floor into the roof (the Rootbound Warden).
//
// ENCLOSED. A house: walls, floors and roofs everywhere, no bake. The windows
// are opaque panes painted with the estate at night (overseerslodge_paint.ts)
// and lay a cool pool of moonlight on the boards in front of them.
//
// SERVER TRUTH. Every wall that blocks stands on a 4 m cell edge (the kit's
// shell). The tree stands on the obstacle cells; furniture with colliders stays
// out of the camp discs; the galleries and the desk platform are the site
// decks the server tracks (rota_gallery, raised_chamber).
import { Mesh, VertexData } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, Parts, SLOTS, planGroups, THEMES, buildGroupShell, shellColliders, runFrame, galleryEdge, stairFlight, pier, trussRoof, sconce, box, beam, LightPools,
  type KitPlan, type Group, type Edge, type ShellOpts, type ThemePreset, type V3, type RoomStyle, type SurfaceSpec, type Slot,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData, type SiteDeck, type SiteRamp } from '../dungeon-plan';
import {
  hash, candle, clerkDesk, lectern, chandelier, candelabrum, tallyRack, abacus, ledgerStack, ladder, cellBars, doorLeaf, hearth, kennelStalls,
  rootTree, runner, standard, balance, coatPegs,
} from './overseerslodge_dress';
import { lodgeAtlas, PaintedQuads, REGION, SIGNS } from './overseerslodge_paint';

type Zone = DungeonZoneData & { layout: any; sites: Record<string, { decks: SiteDeck[]; ramps: SiteRamp[] }> };
const ZONE = zones.overseerslodge as unknown as Zone;
const LAYOUT = ZONE.layout;

// ------------------------------------------------------------------ the look
// The kit's lodge preset, with every slot given work: limewash over oak
// framing, oak boards, and for the set pieces leather (inlay: the ledgers'
// bindings), paper and wax (dark), the household's green baize (accent), brass
// (glass: the lodge paints its own window panes and never uses kit glass) and
// stone flags (floorTrim: thresholds and the mess hall's hearth).
const BASE = THEMES.lodge;
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    wall: { sheet: 'plaster', tint: '#cbbc9a', bump: 0.6 },
    // the roof and the framing carry a small emissive floor: bounce off the
    // lit boards and limewash, which the hemisphere's ground colour alone
    // could not give a dark stained oak (MEASURED polish pass: roof bays
    // read black, upper third of a hall median 2-10 of 255)
    timber: { sheet: 'timber', tint: '#5c3e27', bump: 0.85, emissive: '#302418' },
    trim: { sheet: 'timber', tint: '#7a5638', bump: 0.7 },
    floor: { sheet: 'planks', tint: '#9c7650', spec: 0.14, power: 40 },
    ceiling: { sheet: 'planks', tint: '#6a4c34', emissive: '#4a3c30' },
    floorTrim: { sheet: 'flags', tint: '#8a8274', scale: 2 },
    inlay: { sheet: 'timber', tint: '#6a3424', scale: 3, spec: 0.12 } as SurfaceSpec,
    dark: { tint: '#d8c8a0', spec: 0.03 },
    // cloth: the plaster sheet's mottle reads as a worn weave under the green
    accent: { sheet: 'plaster', tint: '#3a5434', scale: 3, spec: 0.03 },
    glass: { tint: '#b48a3c', spec: 0.7, power: 60 },
    metal: { tint: '#3a3632', spec: 0.35, power: 40 },
  },
  arch: { ...BASE.arch, wallHeight: 5.2, corridorHeight: 4.2, ceiling: 'truss', corridorCeiling: 'flat', door: 'lintel', pilasterEvery: 1, plinth: false, stringCourse: 1.1, cornice: false, framed: true },
  lamp: { ...BASE.lamp, intensity: 1.15, range: 18 },
  pool: { ...BASE.pool, strength: 0.3 },
};
const MOON = { color: '#7f9fd0', strength: 0.2 };

const INSET = 0.85, OUTER = 0.35, THICK = INSET + OUTER, CELL = 4;
// rooms: wall height to the eaves and the ceiling; the halls the route walks
// down get their trusses across the view (built here: OWN_ROOF)
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 5, ceiling: 'truss', sconceEvery: 2 },
  clerks: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  dormwest: { height: 4.6, ceiling: 'truss', sconceEvery: 2 },
  dormeast: { height: 4.6, ceiling: 'truss', sconceEvery: 2 },
  mess: { height: 5.2, ceiling: 'truss', sconceEvery: 2 },
  kennels: { height: 5.2, ceiling: 'truss', sconceEvery: 2 },
  tally: { height: 4.4, ceiling: 'flat', sconceEvery: 0 },
  rota: { height: 9, ceiling: 'truss', sconceEvery: 2 },
  lockup: { height: 5.5, ceiling: 'truss', sconceEvery: 2 },
  counting: { height: 5, ceiling: 'coffered', sconceEvery: 2 },
  archive: { height: 8, ceiling: 'truss', sconceEvery: 2 },
  office: { height: 8, ceiling: 'coffered', sconceEvery: 2 },
};
const OWN_ROOF = ['clerks', 'rota', 'archive'];

// windows: which walls, and the opening (sill, top, clear half-width)
type Win = { on: (e: Edge) => boolean; sill: number; top: number; half: number; wide?: boolean };
const WIN: Record<string, Win> = {
  entry: { on: (e) => e.dz === -1, sill: 1.3, top: 3.8, half: 0.8 },
  clerks: { on: (e) => e.dx !== 0, sill: 1.5, top: 4.9, half: 1.0 },
  dormwest: { on: (e) => e.dx === -1, sill: 1.4, top: 3.6, half: 0.8 },
  dormeast: { on: (e) => e.dx === 1, sill: 1.4, top: 3.6, half: 0.8 },
  mess: { on: (e) => e.dz === 1, sill: 1.6, top: 4.0, half: 0.9 },
  kennels: { on: (e) => e.dx === 1, sill: 2.2, top: 4.0, half: 0.9, wide: true },
  rota: { on: (e) => e.dx !== 0 || e.dz === -1, sill: 5.4, top: 8.2, half: 0.9 },
  lockup: { on: (e) => e.dz === -1, sill: 2.6, top: 3.8, half: 0.45 },
  archive: { on: (e) => e.dx !== 0, sill: 5.6, top: 7.4, half: 0.8 },
  office: { on: (e) => e.dx !== 0, sill: 2.8, top: 6.8, half: 1.0 },
};

// ------------------------------------------------------------------ the zone
function buildLodge(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'ol', glow, glowOccluders: false });
  const moon = new LightPools(scene, MOON.color, MOON.strength, 'ol_moonpools');
  const atlas = lodgeAtlas(scene);
  const panes = new PaintedQuads(), boards = new PaintedQuads();

  // --- which wall bays get a window: every other bay along the walls WIN
  // names, never a corner bay, never beside a door
  const doors = new Set(plan.edges.filter((e) => e.kind === 'door').map((e) => `${e.i},${e.j},${e.dx},${e.dz}`));
  const isWindow = (e: Edge, g: Group): boolean => {
    const w = g.room && WIN[g.room.id];
    if (!w || e.kind !== 'wall' || !w.on(e) || e.y !== g.y) return false;
    const r = g.room!, along = e.dx !== 0 ? e.j - r.z : e.i - r.x, n = e.dx !== 0 ? r.d : r.w;
    if (along % 2 !== 1 || along === n - 1) return false;
    const [ai, aj] = e.dx !== 0 ? [0, 1] : [1, 0];
    return !doors.has(`${e.i + ai},${e.j + aj},${e.dx},${e.dz}`) && !doors.has(`${e.i - ai},${e.j - aj},${e.dx},${e.dz}`);
  };
  const so: ShellOpts = {
    style: THEME.arch, inset: INSET, outer: OUTER, rooms: ROOMS, corridorSconceEvery: 3, skipCeiling: OWN_ROOF,
    windows: (e, g) => isWindow(e, g) ? { kind: 'rect', sill: WIN[g.room!.id].sill, spring: WIN[g.room!.id].top, half: WIN[g.room!.id].half, glass: false } : null,
  };

  // =================================================== 1. THE SHELL
  // floors, framed limewash walls (posts and braces at every bay, the wall
  // plate, the skirting, the dado rail), lintel doorways, windows, trusses,
  // beamed or coffered ceilings, sconces (each a flame, a lamp and its pools)
  const windows: { group: string; c: V3; n: V3 }[] = [];
  for (const g of plan.groups) {
    let r: ReturnType<typeof buildGroupShell> = { seats: [], windows: [] };
    kit.build(g.id, (p) => { const s = buildGroupShell(p, plan, g, so); if (p.detail) r = s; });
    for (const s of r.seats) kit.fire(s.group, s.at, { facing: s.facing });
    for (const w of r.windows) windows.push({ group: w.group, c: w.center, n: w.normal });
  }
  for (const c of shellColliders(plan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // the halls' own roofs: king-post trusses ACROSS the route, so walking in
  // you look up at a row of tie beams, not along one
  for (const id of OWN_ROOF) {
    const g = plan.byId.get(id)!, h = ROOMS[id].height!;
    kit.build(id, (p) => p.at((g.x0 + g.x1) / 2, g.y, 0, 0, () => trussRoof(p, { span: g.x1 - g.x0 - 2 * INSET, z0: g.z0 + INSET, z1: g.z1 - INSET, eaves: h, bay: 4 })));
  }

  // --- panelling to the dado and the door leaves standing open, run by run
  for (const run of plan.runs) {
    const g = plan.byId.get(run.group)!, f = runFrame(plan, run, INSET), L = f.len, n = run.edges.length;
    const special = (k: number) => k < 0 || k >= n || run.edges[k].kind === 'door' || isWindow(run.edges[k], g);
    const lo = -L / 2 + (run.start === 'inner' ? INSET : 0), hi = L / 2 - (run.end === 'inner' ? INSET : 0);
    kit.build(run.group, (p) => p.at(f.x, run.y, f.z, f.yaw, () => {
      run.edges.forEach((e, k) => {
        const x0 = Math.max(lo, -L / 2 + k * CELL), x1 = Math.min(hi, -L / 2 + (k + 1) * CELL), cx = -L / 2 + (k + 0.5) * CELL;
        if (e.kind === 'door') {
          if (g.kind !== 'room') return;
          // the leaves, swung back flat against the wall either side
          if (!special(k - 1)) p.at(cx - 2.38, 0, 0.02, 0, () => doorLeaf(p, 1.15, 3.1));
          if (!special(k + 1)) p.at(cx + 1.23, 0, 0.02, 0, () => doorLeaf(p, 1.15, 3.1));
          return;
        }
        if (!p.detail) return;
        const c = p.g('ceiling'), t = p.g('timber');
        const spans = isWindow(e, g) ? [[x0, cx - 1.3], [cx + 1.3, x1]] : [[x0, x1]];
        for (const [u0, u1] of spans) {
          if (u1 - u0 < 0.3) continue;
          box(c, u0, 0.24, 0, u1, 1.04, 0.025, 0, ['nz']);
          for (let x = u0 + 0.6; x < u1 - 0.3; x += 0.9) box(t, x - 0.035, 0.24, 0.02, x + 0.035, 1.04, 0.05, 0.008);
        }
      });
    }));
  }

  // --- the windows: a timber casement in each opening, the painted night
  // behind it, and the moon's pool on the boards
  for (const w of windows) {
    const g = plan.byId.get(w.group)!, spec = WIN[w.group], nx = w.n[0], nz = w.n[2];
    const inner: V3 = [w.c[0] - nx * THICK, g.y, w.c[2] - nz * THICK], yaw = Math.atan2(-nx, -nz), hw = spec.half;
    kit.build(w.group, (p) => p.at(inner[0], inner[1], inner[2], yaw, () => {
      const t = p.g('timber'), tr = p.g('trim');
      // the reveal lined with boards, an architrave on the room face
      for (const s of [-1, 1]) box(tr, s * hw - (s > 0 ? 0 : 0.06), spec.sill, -0.55, s * hw + (s > 0 ? 0.06 : 0), spec.top, 0.02, 0.005);
      box(tr, -hw, spec.top - 0.06, -0.55, hw, spec.top, 0.02, 0.005);
      box(t, -hw - 0.16, spec.sill - 0.14, -0.55, hw + 0.16, spec.sill, 0.22, 0.02);
      for (const s of [-1, 1]) box(t, s * hw - (s > 0 ? 0 : 0.2), spec.sill - 0.1, 0, s * hw + (s > 0 ? 0.2 : 0), spec.top + 0.22, 0.09, 0.02);
      box(t, -hw - 0.3, spec.top, 0, hw + 0.3, spec.top + 0.28, 0.12, 0.02);
      // the casement: a mullion and a transom
      if (p.detail) {
        box(t, -0.045, spec.sill, -0.52, 0.045, spec.top, -0.44, 0.01);
        const ty = spec.sill + (spec.top - spec.sill) * 0.68;
        box(t, -hw, ty - 0.045, -0.52, hw, ty + 0.045, -0.44, 0.01);
      }
    }));
    const pane: V3 = [w.c[0] - nx * (THICK - 0.5), g.y + (spec.sill + spec.top) / 2, w.c[2] - nz * (THICK - 0.5)];
    panes.add(pane, [-nx, -nz], hw * 2 + 0.02, spec.top - spec.sill + 0.02, spec.wide ? REGION.windowWide : REGION.window, hash(pane[0], pane[2]) > 0.5);
    const reach = spec.sill > 4 ? 4.2 : 2.4;
    moon.floor(w.group, inner[0] - nx * reach, g.y, inner[2] - nz * reach, spec.sill > 4 ? 2.4 : 1.9);
  }

  // ---------------------------------------------------------- helpers
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, y = 0, far = false) =>
    kit.props.place({ file, group, x, y, z, yaw, scale, far });
  const lightAt = (group: string, seats: V3[], lamp: V3 | null, floorY: number, poolR: number) => {
    for (const s of seats) kit.flames.add(group, s[0], s[1], s[2], 0.09, 0.2);
    if (lamp) { kit.lamps.add({ group, x: lamp[0], y: lamp[1], z: lamp[2] }); kit.pools.floor(group, lamp[0], floorY, lamp[2], poolR); }
  };
  /** an iron ring of candles hung at (x, y, z) from `ceil` */
  const ring = (group: string, x: number, y: number, z: number, ceil: number, r: number, n: number, poolR: number) => {
    let seats: V3[] = [];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = chandelier(p, r, n, ceil - y); if (p.detail) seats = s; }));
    lightAt(group, seats, [x, y + 0.2, z], plan.byId.get(group)!.y, poolR);
  };
  const stand = (group: string, x: number, y: number, z: number, h = 1.7) => {
    let seats: V3[] = [];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = candelabrum(p, h); if (p.detail) seats = s; }));
    lightAt(group, seats, null, y, 0);
    kit.pools.floor(group, x, y, z, 2.4);
    buildApi.addCircleCollider(x, z, 0.35);
  };
  /** a painted board on a wall: the picture, a timber frame round it */
  const sign = (group: string, n: number, x: number, y: number, z: number, nx: number, nz: number, w: number, h: number) => {
    boards.add([x + nx * 0.1, y, z + nz * 0.1], [nx, nz], w, h, REGION.sign(n));
    kit.build(group, (p) => p.at(x, y, z, Math.atan2(nx, nz), () => box(p.g('timber'), -w / 2 - 0.1, -h / 2 - 0.1, 0, w / 2 + 0.1, h / 2 + 0.1, 0.08, 0.02)));
  };
  const deskAt = (group: string, x: number, z: number, yaw: number, seed: number, lit: boolean, y = 0) => {
    let seat: V3 | null = null;
    kit.build(group, (p) => p.at(x, y, z, yaw, () => { const s = clerkDesk(p, seed, lit); if (p.detail) seat = s; }));
    if (seat) { const s = seat as V3; kit.flames.add(group, s[0], s[1], s[2], 0.08, 0.17); kit.pools.floor(group, s[0], y + 1.37, s[2], 0.7); }
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    buildApi.addBoxCollider(x - 0.3 * sn, z - 0.3 * c, 0.6, 0.72, yaw, y + 1.4, y - 0.5);
  };
  /** a wall-frame placement: on the inner face of the wall facing (nx, nz) into the room */
  const onWall = (p: Parts, x: number, y: number, z: number, nx: number, nz: number, fn: () => void) => p.at(x, y, z, Math.atan2(nx, nz), fn);
  /** geometry in materials the theme has no slot for: merged here, one mesh
   * per material, shown and hidden with its room by the kit's culler */
  const extras: { group: string; mesh: Mesh }[] = [];
  const own = (group: string, name: string, parts: Parts, specs: Partial<Record<Slot, SurfaceSpec>>) => {
    for (const slot of SLOTS) {
      const g = parts.slots.get(slot), spec = specs[slot];
      if (!g || g.empty || !spec) continue;
      const m = new Mesh(`${name}_${slot}`, scene), vd = new VertexData();
      vd.positions = g.p; vd.normals = g.n; vd.uvs = g.uv; vd.indices = g.i;
      vd.colors = g.c.flatMap((c) => [c, c, c, 1]);
      vd.applyToMesh(m); m.material = kit.material(spec); m.isPickable = !spec.glow; m.freezeWorldMatrix();
      extras.push({ group, mesh: m });
    }
  };

  // ================================================== 2. THE ROOMS
  // --- The Porch: the front door shut behind the rune, coats, the boot bench
  kit.build('entry', (p) => {
    onWall(p, 0, 0, -45.15, 0, 1, () => {
      const t = p.g('timber');
      for (const s of [-1, 1]) box(t, s * 1.62 - 0.18, 0, -0.1, s * 1.62 + 0.18, 4.3, 0.22, 0.03, ['ny']);
      box(t, -2.05, 4.3, -0.1, 2.05, 4.75, 0.26, 0.03);
      box(p.g('floorTrim'), -1.9, 0, -0.1, 1.9, 0.06, 0.5, 0.02, ['ny']);
      p.at(-1.6, 0, 0, 0, () => doorLeaf(p, 1.6, 4.25));
      p.at(0.02, 0, 0, 0, () => doorLeaf(p, 1.58, 4.25));
      if (p.detail) box(p.g('metal'), -0.04, 1.2, 0.08, 0.04, 2.4, 0.16, 0.01);    // the bar's staple
    });
    onWall(p, -9.15, 0, -40.2, 1, 0, () => coatPegs(p, 6));
    runner(p, 1.1, -45.0, -34.9);
  });
  P('props/Bench.gltf', 'entry', -8.55, -40.2, Math.PI / 2);
  P('props/Bag.gltf', 'entry', -8.3, -37.6, 0.6); P('props/Bag_2.gltf', 'entry', -8.6, -42.6, 1.8);
  P('props/Cabinet.gltf', 'entry', 8.95, -39.5, -Math.PI / 2);
  P('props/Chest_Wood.gltf', 'entry', 8.4, -43.6, -Math.PI / 2);
  P('dungeon/barrel_small.glb', 'entry', 8.4, -36.0, 0.4, 0.7);
  sign('entry', SIGNS.indexOf('Keep well'), 0, 3.95, -34.87, 0, -1, 3.0, 0.38);
  stand('entry', -6.5, 0, -44, 1.6); stand('entry', 6.5, 0, -44, 1.6);

  // --- The Clerks' Hall: two rows of desks a side, lit candles on every
  // other one, the duty lecterns at the north end, lanterns down the aisle
  {
    let n = 0;
    for (const s of [-1, 1]) for (const col of [9.2, 13.4]) for (const z of [-26, -22, -18, -14, -10, -6]) {
      if (col > 10 && (z === -18 || z === -14)) continue;
      n++;
      deskAt('clerks', s * col, z, 0, n, n % 2 === 0);
    }
    for (const s of [-1, 1]) {
      let seat: V3 = [0, 0, 0];
      kit.build('clerks', (p) => p.at(s * 4.6, 0, -1.0, Math.PI, () => { const c = lectern(p); if (p.detail) seat = c; }));
      kit.flames.add('clerks', seat[0], seat[1], seat[2], 0.09, 0.2); kit.pools.floor('clerks', seat[0], 0, seat[2], 1.6);
      buildApi.addBoxCollider(s * 4.6, -1.0, 0.6, 0.5, 0, 1.6);
    }
    kit.build('clerks', (p) => runner(p, 1.2, -29.1, 1.1));
    for (const z of [-21.6, -14, -6.4]) ring('clerks', 0, 4.3, z, 6.15, 1.1, 8, 5.5);
    for (const s of [-1, 1]) {
      P('props/Cabinet.gltf', 'clerks', s * 16.75, -28.0, -s * Math.PI / 2);
      P('props/Bookcase_2.gltf', 'clerks', s * 16.85, -0.6, -s * Math.PI / 2);
      P('props/Bookcase_2.gltf', 'clerks', s * 16.85, -2.3, -s * Math.PI / 2);
    }
    for (let k = 0; k < 8; k++) {
      const s = k % 2 ? 1 : -1, col = k % 4 < 2 ? 9.2 : 13.4, z = [-26, -22, -10, -6][k % 4];
      P(k % 3 ? 'props/Page_Stack_Large.gltf' : 'props/Book_Stack_2.gltf', 'clerks', s * col - 0.25, z + 0.3, k, 1, 1.36);
    }
    sign('clerks', SIGNS.indexOf('Clerks’ Hall'), 0, 3.95, -29.13, 0, 1, 3.4, 0.42);
  }

  // --- The Tally Room: racks of tally sticks round the walls, four counting
  // frames, the beams low overhead
  const FRAMES: [number, number][] = [[-9, 14.5], [9, 14.5], [-9, 25.5], [9, 25.5]];
  kit.build('tally', (p) => {
    for (const s of [-1, 1]) {
      onWall(p, s * 9.5, 0, 29.15, 0, -1, () => tallyRack(p, -5.8, 5.8, 0.5, 3.5, 3 + s));
      onWall(p, s * 9.5, 0, 10.85, 0, 1, () => tallyRack(p, -5.8, 5.8, 0.5, 3.5, 5 + s));
      for (const z of [14.2, 25.8]) onWall(p, s * 17.15, 0, z, -s, 0, () => tallyRack(p, -1.9, 1.9, 0.5, 3.5, 9 + s + z));
    }
    for (const [x, z] of FRAMES) p.at(x, 0, z, 0, () => abacus(p, 3.2, 2.6, x * 3 + z));
  });
  for (const [x, z] of FRAMES) buildApi.addBoxCollider(x, z, 1.75, 0.6, 0, 2.7);
  for (const z of [15, 25]) ring('tally', 0, 3.1, z, 4.4, 0.8, 6, 4.5);
  P('props/Page_Stack_Large.gltf', 'tally', -16.2, 18.2, 0.4); P('dungeon/box_small.glb', 'tally', 16.3, 17.6, 0.2, 0.7);
  P('dungeon/barrel_small.glb', 'tally', 16.2, 22.6, 0, 0.7); P('props/Crate_Wooden.gltf', 'tally', -16.2, 22.4, 0.3);

  // --- THE ROTA HALL: the gallery, its stair, the Rota, the ring of candles
  {
    const Y = 4, UNDER = 3.72;
    const POSTS: [number, number][] = [[16, 41], [16, 47], [16, 53.5], [16, 60], [8, 60], [-8, 60], [-16, 60], [-16, 53.5]];
    kit.build('rota', (p) => {
      const f = p.g('floor'), c = p.g('ceiling'), t = p.g('timber');
      const slab = (x0: number, z0: number, x1: number, z1: number) => {
        f.quad([x0, Y, z0], [x1, Y, z0], [x1, Y, z1], [x0, Y, z1], [0, 1, 0]);
        c.quad([x0, UNDER, z0], [x1, UNDER, z0], [x1, UNDER, z1], [x0, UNDER, z1], [0, -1, 0]);
      };
      slab(-21.15, 53, -16, 60); slab(16, 38.85, 21.15, 60); slab(-21.15, 60, 21.15, 69.15);
      // the bearers along the open edges, the joists under the boards
      box(t, -16.2, UNDER - 0.42, 53, -15.8, Y, 60.2, 0.03);
      box(t, 15.8, UNDER - 0.42, 38.85, 16.2, Y, 60.2, 0.03);
      box(t, -16.2, UNDER - 0.42, 59.8, 16.2, Y, 60.2, 0.03);
      if (p.detail) {
        for (let z = 40; z < 60; z += 1.2) box(t, 16.2, UNDER - 0.26, z - 0.09, 21.15, UNDER, z + 0.09, 0.01);
        for (let z = 54; z < 60; z += 1.2) box(t, -21.15, UNDER - 0.26, z - 0.09, -16.2, UNDER, z + 0.09, 0.01);
        for (let x = -20.4; x < 21; x += 1.2) box(t, x - 0.09, UNDER - 0.26, 60.2, x + 0.09, UNDER, 69.15, 0.01);
      }
      // the posts on stone pads, braced up to the bearers
      for (const [x, z] of POSTS) p.at(x, 0, z, 0, () => pier(p, { kind: 'timber', w: 0.42, h: UNDER - 0.42 }));
      // the balustrades
      p.at(0, Y, 60, Math.PI, () => galleryEdge(p, { len: 32, fascia: 0.45 }));
      p.at(16, Y, (38.85 + 60) / 2, -Math.PI / 2, () => galleryEdge(p, { len: 60 - 38.85, fascia: 0.45 }));
      p.at(-16, Y, 56.5, Math.PI / 2, () => galleryEdge(p, { len: 7, fascia: 0.45 }));
      // the stair up the west side, standing off the wall (the strip behind it
      // keeps every cell's floor walkable), balustraded both sides; the
      // gallery's rail closes the strip's end at the top
      p.at(-17.8, 0, 40, 0, () => stairFlight(p, { w: 3.2, run: 13, rise: 4, rails: 'both' }));
      p.at(-20.28, Y, 53, Math.PI, () => galleryEdge(p, { len: 1.75, fascia: 0.45 }));
      // the Rota's frame on the north wall, the roll's rollers at its ends
      onWall(p, 0, 0, 69.15, 0, -1, () => {
        box(t, -17.4, 4.75, 0, 17.4, 4.95, 0.14, 0.02); box(t, -17.4, 8.55, 0, 17.4, 8.8, 0.16, 0.02);
        for (const x of [-17.3, -8.65, 0, 8.65, 17.3]) box(t, x - 0.12, 4.75, 0, x + 0.12, 8.8, 0.14, 0.02);
        if (p.detail) for (const x of [-17.0, 17.0]) beam(p.g('trim'), [x, 4.9, 0.18], [x, 8.6, 0.18], 0.22, 0.22, 0.05);
      });
    });
    boards.add([0, 6.75, 69.13], [0, -1], 34, 3.6, REGION.rota);
    // the clerks' desks upstairs, behind the rail, facing the Rota
    [-12, -6, 6, 12].forEach((x, k) => deskAt('rota', x, 64.5, 0, 40 + k, k % 2 === 0, Y));
    // walk surfaces and their edges: the site's decks and stair (the server's)
    for (const d of ZONE.sites.rota_gallery.decks) buildApi.addDeck(d.cx, d.cz, d.hx!, d.hz!, 0, d.y);
    for (const r of ZONE.sites.rota_gallery.ramps) { buildApi.addRamp(r.x0, r.z0, r.y0, r.x1, r.z1, r.y1, r.half); buildApi.addStairBody(r.x0, r.z0, r.y0, r.x1, r.z1, r.y1, r.half); }
    buildApi.addBoxCollider(0, 59.95, 16.1, 0.15, 0, Y + 1.25, Y);
    buildApi.addBoxCollider(15.95, (38.85 + 60) / 2, 0.15, (60 - 38.85) / 2, 0, Y + 1.25, Y);
    buildApi.addBoxCollider(-15.95, 56.5, 0.15, 3.6, 0, Y + 1.25, Y);
    buildApi.addBoxCollider(-16.0, 47.6, 0.12, 5.4, 0, 5.3, 0.3);
    // the strip side: only where the treads are a metre up (a walker in the
    // strip passes under it, one on the stair cannot step off)
    buildApi.addBoxCollider(-19.6, 48.3, 0.12, 4.7, 0, 5.3, 1.3);
    buildApi.addBoxCollider(-20.28, 53.05, 0.9, 0.15, 0, Y + 1.25, Y);
    for (const [x, z] of POSTS) buildApi.addCircleCollider(x, z, 0.35);
    ring('rota', 0, 6.0, 54.0, 9.15, 2.4, 12, 7.5);
    // sconces at the gallery's own level, between the clerestory windows
    for (const s of [-1, 1]) for (const z of [48, 56, 64]) {
      let seat: V3 = [0, 0, 0];
      kit.build('rota', (p) => onWall(p, s * 21.15, Y, z, -s, 0, () => { const a = sconce(p, { h: 2.4 }); if (p.detail) seat = a; }));
      kit.fire('rota', seat, { facing: [-s, 0], floorPool: 0 });
      kit.pools.floor('rota', s * 19.6, Y, z, 2.4);
    }
    P('props/Bench.gltf', 'rota', 20.5, 44, Math.PI / 2); P('props/Bench.gltf', 'rota', 20.5, 64.5, Math.PI / 2);
    P('props/Cabinet.gltf', 'rota', -20.8, 62.5, Math.PI / 2); P('props/Cabinet.gltf', 'rota', -20.8, 66.5, Math.PI / 2);
    P('props/Bookcase_1.gltf', 'rota', -19.5, 68.9, Math.PI, 1, Y); P('props/Bookcase_1.gltf', 'rota', 19.5, 68.9, Math.PI, 1, Y);
    stand('rota', -5, 0, 39.6, 1.7); stand('rota', 5, 0, 39.6, 1.7);
  }

  // --- The Rootbound Lock-up: barred cells, and the heartwood tree grown up
  // through the boards into the roof
  kit.build('lockup', (p) => {
    p.at(35.0, 0, 45.9, 0, () => cellBars(p, 18, 3.0, [8.6, 10.4]));
    if (p.detail) for (const x of [41, 47]) box(p.g('metal'), x - 0.04, 0, 42.85, x + 0.04, 3.05, 45.9, 0);
  });
  // the tree in materials of its own (the lodge's slots are all oak, paper and
  // cloth): rough grey-brown bark, moss, and sap that still glows
  {
    const tp = new Parts(true);
    tp.at(58, 0, 62, 0, () => rootTree(tp, 13,
      [[Math.PI, 9], [Math.PI + 0.5, 7], [Math.PI - 0.45, 5.5], [-Math.PI / 2 - 0.2, 8], [-Math.PI / 2 + 0.5, 4.5], [Math.PI / 2, 1.8], [0.15, 1.8]],
      [[-Math.PI / 2, 5, 8], [-Math.PI / 2 - 0.6, 3.5, 7], [Math.PI, 0.2, 6.5], [-Math.PI / 2 + 0.7, 3, 3.5], [Math.PI * 0.75, 0.2, 3]]));
    own('lockup', 'ol_heartwood', tp, {
      timber: { sheet: 'rubble', tint: '#6e5c4a', bump: 1.0, scale: 0.5 },
      accent: { sheet: 'plaster', tint: '#4a6a34', scale: 2 },
      emit: { tint: '#9cf08a', emissive: '#6ad070', glow: 0.55, unlit: true },
    });
  }
  buildApi.addBoxCollider(44, 45.9, 9.0, 0.12, 0, 3.2);
  buildApi.addCircleCollider(58, 62, 2.5);
  P('props/Cage_Large.gltf', 'lockup', 37.2, 44.2, 0.3, 1.4); P('props/Chain_Coil.gltf', 'lockup', 49.8, 44.4, 0.8);
  P('props/Bucket_Wooden_1.gltf', 'lockup', 52.5, 43.6, 0); P('dungeon/bed_floor.glb', 'lockup', 38.6, 43.6, Math.PI / 2, 0.55);
  P('props/Chain_Coil.gltf', 'lockup', 40.5, 63.8, 2.2); P('props/Barrel.gltf', 'lockup', 36.2, 63.8, 0.2);

  // --- The Private Counting Room: tables with balances, the chests
  kit.build('counting', (p) => { for (const s of [-1, 1]) p.at(s * 10 + 0.6, 0.81, 86.1, 0, () => balance(p)); });
  for (const s of [-1, 1]) {
    P('props/Table_Large.gltf', 'counting', s * 10, 86);
    buildApi.addBoxCollider(s * 10, 86, 1.5, 0.6, 0, 1.0);
    P('dungeon/coin_stack_medium.glb', 'counting', s * 10 - 0.7, 86.1, 0.3, 0.45, 0.81);
    P('dungeon/coin_stack_small.glb', 'counting', s * 10 - 0.1, 85.8, 1.1, 0.4, 0.81);
    P('props/Book_Open.gltf', 'counting', s * 10 + 0.1, 86.3, 0.1, 1.4, 0.81);
    for (const z of [81.6, 90.4]) P('props/Chest_Legendary.gltf', 'counting', s * 16.5, z, -s * Math.PI / 2);
    P('props/Chest_Wood.gltf', 'counting', s * 16.6, 86, -s * Math.PI / 2);
    P('props/Cabinet.gltf', 'counting', s * 6.5, 79.1, 0);
    P('dungeon/coin_stack_large.glb', 'counting', s * 15.6, 83.6, 0.6, 0.5);
    let seats: V3[] = [];
    kit.build('counting', (p) => { const a = candle(p, s * 10 + 1.1, 0.81, 85.7, 0.2, 0.04); if (p.detail) seats = [a]; });
    lightAt('counting', seats, null, 0, 0); kit.pools.floor('counting', s * 10 + 1.1, 0.82, 85.7, 1.4);
  }
  ring('counting', 0, 3.7, 86, 5.0, 1.0, 6, 4.5);

  // --- Centuries of Ledgers: the stacks, the ladders, the lecterns
  const STACKS = [106, 110, 114, 118, 122];
  kit.build('archive', (p) => {
    for (const s of [-1, 1]) STACKS.forEach((z, k) => {
      p.at(s > 0 ? 7.4 : -13.15, 0, z, 0, () => ledgerStack(p, 5.75, 5.0, 0.8, k * 2 + s));
      if (k % 2 === (s > 0 ? 0 : 1)) p.at(s * 10.2, 0, z + 0.42, 0, () => ladder(p, 4.7, 1.1));
    });
    runner(p, 1.0, 102.9, 125.1);
  });
  for (const s of [-1, 1]) for (const z of STACKS) buildApi.addBoxCollider(s * 10.275, z, 2.95, 0.46, 0, 5.3);
  for (const s of [-1, 1]) for (const z of [105, 123]) P('props/BookStand.gltf', 'archive', s * 5.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  for (const z of [106.57, 121.43]) ring('archive', 0, 5.4, z, 8.15, 0.9, 6, 5);
  P('props/Book_Stack_3.gltf', 'archive', -7.0, 108.4, 0.3); P('props/Book_Stack_1.gltf', 'archive', 6.9, 119.7, 1.2);
  sign('archive', SIGNS.indexOf('By appointment'), 0, 3.95, 125.13, 0, -1, 3.6, 0.45);

  // --- THE OVERSEER'S OFFICE: the platform, its stair and balustrade, the
  // desk (the Sealed Notice is the game's own desk at (0, 158)), the survey
  // and the standards behind it, candles leading up to it
  {
    const Y = 2, FRONT = 154, REAR = 161.15, W = 17.15;
    kit.build('office', (p) => {
      p.g('floor').quad([-W, Y, FRONT], [W, Y, FRONT], [W, Y, REAR], [-W, Y, REAR], [0, 1, 0]);
      for (const [a, b] of [[-W, -4.1], [4.1, W]]) {
        box(p.g('timber'), a, 0, FRONT, b, Y - 0.08, FRONT + 0.3, 0, ['ny']);
        box(p.g('trim'), a, Y - 0.12, FRONT - 0.08, b, Y + 0.02, FRONT + 0.32, 0.02);
        if (p.detail) for (let x = a + 0.5; x < b - 1.8; x += 2.1) box(p.g('trim'), x, 0.25, FRONT - 0.04, x + 1.6, Y - 0.35, FRONT, 0.01);
        p.at((a + b) / 2, Y, FRONT, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.3 }));
      }
      p.at(0, 0, 149, 0, () => stairFlight(p, { w: 8.2, run: 5, rise: Y, rails: 'both' }));
      for (const s of [-1, 1]) p.at(s * 6.6, 7.7, REAR, Math.PI, () => standard(p, 1.5, 4.4));
      // the survey's frame
      onWall(p, 0, 0, REAR, 0, -1, () => {
        const t = p.g('timber');
        box(t, -4.35, 3.4, 0, 4.35, 3.65, 0.16, 0.02); box(t, -4.35, 7.6, 0, 4.35, 7.85, 0.16, 0.02);
        for (const x of [-4.35, 4.1]) box(t, x, 3.4, 0, x + 0.25, 7.85, 0.16, 0.02);
      });
      runner(p, 1.5, 134.9, 148.8);
    });
    boards.add([0, 5.62, REAR - 0.02], [0, -1], 8.2, 4.0, REGION.survey);
    for (const d of ZONE.sites.raised_chamber.decks) buildApi.addDeck(d.cx, d.cz, d.hx!, d.hz!, 0, d.y);
    for (const r of ZONE.sites.raised_chamber.ramps) buildApi.addRamp(r.x0, r.z0, r.y0, r.x1, r.z1, r.y1, r.half);
    const deck = ZONE.sites.raised_chamber.decks[0];
    buildApi.addBoxCollider(deck.cx, deck.cz, deck.hx!, deck.hz!, 0, 1.6);
    for (const s of [-1, 1]) buildApi.addBoxCollider(s * 10.6, FRONT + 0.05, 6.5, 0.15, 0, Y + 1.25, Y);
    P('props/Chair_3.gltf', 'office', 0, 159.5, Math.PI, 1.25, Y);
    for (const s of [-1, 1]) {
      for (const x of [9.6, 11.5, 13.4, 15.3]) P('props/Bookcase_1.gltf', 'office', s * x, 160.92, Math.PI, 1.05, Y);
      P('props/Cabinet.gltf', 'office', s * 4.2, 160.95, Math.PI, 1, Y);
      P('props/Cabinet.gltf', 'office', s * 16.75, 137.5, -s * Math.PI / 2);
      P('props/Cabinet.gltf', 'office', s * 16.75, 151.5, -s * Math.PI / 2);
    }
    P('props/Page_Stack_Large.gltf', 'office', 4.2, 160.95, 0.5, 1.2, Y + 1.0); P('props/Book_Stack_3.gltf', 'office', -4.2, 160.95, 0.2, 1.2, Y + 1.0);
    for (const s of [-1, 1]) { stand('office', s * 6.2, 0, 148.0, 1.8); stand('office', s * 16.0, Y, 155.3, 1.8); stand('office', s * 3.0, Y, 160.6, 1.8); }
    ring('office', 0, 5.4, 140.0, 8.0, 1.8, 10, 7);
    ring('office', 0, 5.4, 150.5, 8.0, 1.4, 8, 5);
  }

  // --- The dormitories: bunks along the long walls, foot lockers, pegs
  // bunks centred on the cell lines, so every cell keeps a gap a body fits
  // (the audit walks each cell's floor)
  const dorm = (id: string, xs: number[], door: number) => {
    for (const x of xs) {
      P('props/Bed_Bunk.gltf', id, x, -23.85, 0); buildApi.addBoxCollider(x, -23.85, 0.95, 1.22, 0, 2.2);
      P('dungeon/trunk_small_A.glb', id, x, -22.15, Math.PI, 0.9);
      // a night candle on every other foot locker: the bunk row's own lamp
      // and pool (polish pass: the pine bunks read low at floor level under
      // the wall sconces and the hanging rings alone)
      if (xs.indexOf(x) % 2 === 1) {
        let seats: V3[] = [];
        kit.build(id, (p) => { const a = candle(p, x + 0.2, 0.44, -22.1, 0.14); if (p.detail) seats = [a]; });
        lightAt(id, seats, [x + 0.2, 1.1, -21.4], 0, 2.6);
      }
      if (Math.abs(x - door) < 3.4) continue;
      P('props/Bed_Bunk.gltf', id, x, -8.15, Math.PI); buildApi.addBoxCollider(x, -8.15, 0.95, 1.22, 0, 2.2);
    }
  };
  dorm('dormwest', [-46, -42, -38, -34, -30], -40);
  dorm('dormeast', [46, 42, 38, 34, 30], 40);
  kit.build('dormwest', (p) => onWall(p, -26.85, 0, -22.6, -1, 0, () => coatPegs(p, 5)));
  for (const id of ['dormwest', 'dormeast']) {
    const s = id === 'dormwest' ? -1 : 1;
    P('props/Table_Large.gltf', id, s * 46.3, -16, Math.PI / 2, 0.8); buildApi.addBoxCollider(s * 46.3, -16, 0.5, 1.2, 0, 1);
    let seats: V3[] = [];
    kit.build(id, (p) => { const a = candle(p, s * 46.3, 0.66, -15.4, 0.18); if (p.detail) seats = [a]; });
    lightAt(id, seats, null, 0, 0);
    P('props/Bucket_Wooden_2.gltf', id, s * 46.0, -12.0, 0.2); P('props/Nightstand_Shelf.gltf', id, s * 48.7, -9.8, -s * Math.PI / 2);
  }
  // the hounds have the second shift's bunks: bones, a dragged mattress, chain
  P('halloween/bone_A.gltf', 'dormeast', 36.5, -18.2, 0.4); P('halloween/bone_C.gltf', 'dormeast', 40.2, -14.0, 2.0); P('halloween/bone_B.gltf', 'dormeast', 34.4, -13.2, 1.1);
  P('dungeon/bed_floor.glb', 'dormeast', 41.5, -19.6, 0.5, 0.6); P('props/Chain_Coil.gltf', 'dormeast', 33.0, -20.0, 0.3);

  // --- The Empty Mess Hall: the hearth, two long tables laid for a meal
  {
    let seat: V3 = [0, 0, 0];
    kit.build('mess', (p) => onWall(p, -49.15, 0, 16, 1, 0, () => { const s = hearth(p, 3.4, 5.0); if (p.detail) seat = s; }));
    kit.fire('mess', seat, { size: 2.0, floorPool: 4.5 });
    for (let k = 0; k < 4; k++) kit.flames.add('mess', seat[0] + (k % 2) * 0.15, seat[1] - 0.2, seat[2] + (k - 1.5) * 0.3, 0.32, 0.75);
    buildApi.addBoxCollider(-49.15 + 0.7, 16, 0.7, 2.1, 0, 2.4);
    for (const z of [12.5, 20]) {
      for (const x of [-42, -39.15, -36.3]) P('props/Table_Large.gltf', 'mess', x, z);
      for (const dz of [-0.95, 0.95]) for (const x of [-41.0, -37.5]) P('props/Bench.gltf', 'mess', x, z + dz, 0, 1.2);
      buildApi.addBoxCollider(-39.15, z, 4.35, 1.3, 0, 1.0);
      for (let k = 0; k < 8; k++) P('props/Table_Plate.gltf', 'mess', -43 + k * 1.1, z + (k % 2 ? 0.3 : -0.3), 0, 1.2, 0.81);
      for (let k = 0; k < 5; k++) P('props/Mug.gltf', 'mess', -42.4 + k * 1.9, z + (k % 2 ? -0.32 : 0.32), k, 1.3, 0.81);
      let seats: V3[] = [];
      kit.build('mess', (p) => { const a = [candle(p, -40.6, 0.81, z, 0.2, 0.04), candle(p, -37.7, 0.81, z, 0.2, 0.04)]; if (p.detail) seats = a; });
      lightAt('mess', seats, null, 0, 0);
      for (const s of seats) kit.pools.floor('mess', s[0], 0.82, s[2], 1.2);
    }
    P('props/Dresser_1.gltf', 'mess', -44, 24.7, Math.PI); P('props/Dresser_1.gltf', 'mess', -32, 24.7, Math.PI);
    P('props/Barrel_Apples.gltf', 'mess', -47.8, 22.6, 0.3); P('props/FarmCrate_Leek.gltf', 'mess', -47.4, 9.0, 0.2); P('props/Barrel.gltf', 'mess', -48.2, 8.0, 1.0);
    P('props/Pot_2_Lid.gltf', 'mess', -47.2, 18.6, 0, 1.3);
  }

  // --- The Hound Court: the stalls, straw, the troughs
  kit.build('kennels', (p) => onWall(p, 52.8, 0, 29.15, 0, -1, () => kennelStalls(p, 25.6, 4.27, 3.4)));
  for (let k = 0; k <= 6; k++) buildApi.addBoxCollider(52.8 - k * 25.6 / 6, 27.45, 0.12, 1.75, 0, 1.6);
  for (let k = 0; k < 6; k++) P(k % 2 ? 'dungeon/floor_dirt_small_A.glb' : 'dungeon/floor_dirt_small_C.glb', 'kennels', 50.7 - k * 4.27, 27.0, k, 1.0, -0.06);
  ring('kennels', 38.1, 3.4, 14, 5.35, 0.9, 6, 4.5); ring('kennels', 41.9, 3.4, 22, 5.35, 0.9, 6, 4.5);
  ring('dormwest', -38.0, 3.1, -16, 4.75, 0.8, 6, 4.5); ring('dormeast', 38.0, 3.1, -16, 4.75, 0.8, 6, 4.5);
  ring('lockup', 46.1, 3.7, 52, 5.65, 1.0, 6, 5);
  P('props/Bucket_Wooden_1.gltf', 'kennels', 52.4, 9.0, 0); P('props/Barrel.gltf', 'kennels', 52.3, 7.8, 0.4); P('props/Chain_Coil.gltf', 'kennels', 31.0, 9.4, 1.0);
  P('halloween/bone_A.gltf', 'kennels', 43.4, 13.6, 2.2); P('halloween/bone_B.gltf', 'kennels', 36.6, 21.5, 0.5);

  // ================================================== 3. PAINT, MOON, CAMERA
  const night = panes.mesh('ol_window_panes', scene, atlas.unlit);
  const painted = boards.mesh('ol_painted_boards', scene, atlas.lit);
  for (const m of [night, painted, moon.pool.mesh]) glow?.addExcludedMesh(m);
  moon.upload();
  for (const c of dp.cameraRooms(0.35)) {
    const stairCam = c.id.startsWith('stair:'), room = c.id.startsWith('room:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1,
      cameraRadius: stairCam ? 7 : room ? Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) : 4 });
  }
  void kit.finish();
  // the moon's pools follow the kit's room culler
  let seen: unknown;
  scene.onBeforeRenderObservable.add(() => {
    if (kit.vis === seen) return;
    seen = kit.vis; moon.update(kit.vis);
    for (const e of extras) e.mesh.setEnabled(!kit.vis || kit.vis.visible.has(e.group));
  });
}

registerZone({
  key: 'overseerslodge',
  terrain: { tex: 'wood_floor_worn', tint: ['#6a5840', '#6a5840'], tile: 5 },
  hemi: 1.15, light: { hemiGround: '#b0a28c' },
  // warm dark air; the directional is a faint cool moon fill. Candle-lit
  // limewash throws warm light back: a warm sky and a light ground colour
  // (walls get half of each, the roof all of the ground), and a softer
  // contrast so the oak's darks do not crush (MEASURED polish pass: room
  // medians 11-47 of 255 -> 37-93, roof third 2-10 -> 28-39)
  lighting: { hemi: 1.15, hemiSky: '#d6ccb8', hemiGround: '#b0a28c', sun: 0.16, sunColor: '#9fb4d8', fog: { density: 0.0095, color: '#1e1912' }, exposure: 1.1, contrast: 1.06 },
  // MEASURED (first look): the plan occluder's 3.2 m walls let the boss-room
  // rune's 5.5 m column halo through the archive's far wall
  glow: { occluder: { height: 9 } },
  build: buildLodge,
});
