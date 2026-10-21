// The Great Granary: "Forty filled towers, oak hoppers and working loading
// lanes for the Restoration." The empire's granary on the Granary Plains,
// still filling for a city that is not there: the harvester sentinels reap,
// the mill grinds, the count sentinels count, and the Granary-Master keeps the
// provisioning ledger. Rebuilt 2026-10-11 on the dungeon kit
// (tmp/dungeons/kit/KIT.md, HANDBOOK.md); the plan is
// tools/data/dungeon_plans/greatgranary.json (tmp/dungeons/greatgranary/
// make_plan.py writes it, dungeon_plan.py writes zones.json from it).
//
// THE ROUTE: the Wagon Dock (the great doors shut behind you, the rune home,
// the last wagon never unloaded) -> the Weighbridge Gate, a triple arcade ->
// the Tally Hall, the great steelyard over the weighbridge (granary rats), its
// north gate shut -> west through the Mill (millstones on their hurst, the
// crown wheel; mill hounds) or east through the Winnowing Floor (drum
// winnowers, chaff; chaff sprites) -> the Forty Towers: a basilica of grain,
// four columns of ten towers either side of the loading lane, aisle roofs on
// the outer walls, the arcade plates on stone piers, a clerestory whose sun
// falls in shafts on the lane (rats) -> the Count Floor at the crossing (the
// mid set-piece): the Counting Engine under the lantern, its tally wheel and
// count drums, conveyors out to the galleries over the towers (count
// sentinels) -> the north lane (chaff sprites) -> the Ledger Hall (count
// sentinels) -> the Granary-Master's Office: a coffered hall, the dais across
// its rear with the master's desk, the provisioning ledger, the painted plan
// of the forty towers and the plains in the windows behind (the boss).
//
// ENCLOSED throughout: a building on the plains; daylight only through its
// windows, painted (greatgranary_paint.ts) and falling as shafts
// (greatgranary_light.ts). Fire is the kit's: sconces, lantern posts, the
// engine's lanterns, braziers by the dais; four lamp slots, no other lights.
//
// SERVER TRUTH: walls on cell edges (the kit shell). The forty towers, the
// engine, the hurst and the threshing floor stand on obstacle cells; the
// arcade piers on the towers' foundation corners. The galleries and chutes
// overhead are visual (the server is 2D). Props stay out of camp discs.
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, stairFlight, pier, windowBay, doorway,
  trussRoof, flatCeiling, floorRect, box, beam, lathe,
  type KitPlan, type Edge, type ShellOpts, type ThemePreset, type V3, type RoomStyle, type ArchStyle, type WindowOpts, type BackdropSlot,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import {
  silo, countingEngine, lanternPost, gallery, chute, millstones, winnower, heap, steelyard, tallyDesk, ledgerPress,
  greatDoors, boardFrame, masterDesk, archRing, hash, hangingLantern, candleRing,
} from './greatgranary_parts';
import { granaryAtlas, PaintedQuads, REGION } from './greatgranary_paint';
import { lightShafts, landing, type Shaft } from './greatgranary_light';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { decks: { cx: number; cz: number; hx: number; hz: number; y: number }[]; ramps: { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }[] } } };
const ZONE = zones.greatgranary as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;

// ------------------------------------------------------------------ the look
// The kit's granary preset, re-slotted for a building of stone, oak and grain:
// honey ashlar walls and towers, a finer limestone trim, limestone flags with
// setts at the borders and in the lane, oak framing, boarded ceilings and
// hoppers, iron, shingled tower cones (`dark`), grain and meal (`accent`), a
// dark walnut-and-brass inlay, and `glass` an opaque warm pane (never white).
const BASE = THEMES.granary;
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    // MEASURED (first look): #cfb68a ashlar read lemon-green under the warm
    // lamps, and #7a5836 oak read brick red; both are greyed toward stone and wood
    wall: { sheet: 'ashlar', tint: '#b3a091', bump: 0.9 },
    trim: { sheet: 'ashlar', tint: '#ccbca8', scale: 2, bump: 0.6, spec: 0.06 },
    floor: { sheet: 'flags', tint: '#ad977f', spec: 0.08 },
    floorTrim: { sheet: 'setts', tint: '#8a7a5e', spec: 0.1 },
    inlay: { sheet: 'marble', tint: '#5a4230', spec: 0.35, power: 60 },
    // roof boards and framing carry a small emissive floor, the sunlit
    // floors' bounce (MEASURED polish pass: the Mill's and the Winnowing
    // Floor's roofs and the silo hall's upper walls read 20-27 of 255)
    ceiling: { sheet: 'planks', tint: '#94785a', emissive: '#2a2218' },
    timber: { sheet: 'timber', tint: '#6a5846', bump: 0.8, emissive: '#1c160e' },
    metal: { sheet: 'iron', tint: '#55504a', spec: 0.35, power: 40 },
    accent: { sheet: 'plaster', tint: '#d2ac5e', scale: 3 },
    glass: { tint: '#d8c08e', emissive: '#c8ac78', unlit: true },
    dark: { sheet: 'tiles', tint: '#6a4634', spec: 0.08, scale: 2 },
  },
  arch: { ...BASE.arch, wallHeight: 8, corridorHeight: 5.6, pilasterEvery: 1 },
};
// the silo hall's walls are 24 m of ashlar: stone pilasters, a string course
// and a cornice instead of the timber framing the working rooms have
const SILO_STYLE: ArchStyle = { ...THEME.arch, framed: false, pilasterEvery: 3, stringCourse: 9, cornice: true, plinth: true };
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 7, ceiling: 'truss', sconceEvery: 2, door: 'arch' },
  tally: { height: 8, ceiling: 'truss', sconceEvery: 2, door: 'arch' },
  mill: { height: 9, ceiling: 'truss', sconceEvery: 2 },
  winnow: { height: 9, ceiling: 'truss', sconceEvery: 2 },
  silos: { height: 24, ceiling: 'open', sconceEvery: 3, border: 0.9, inlay: 'none', door: 'arch' },
  ledger: { height: 7, ceiling: 'flat', sconceEvery: 2, door: 'arch' },
  office: { height: 10, ceiling: 'coffered', sconceEvery: 2, inlay: 'none', border: 1.0, door: 'arch' },
};

const INSET = 0.85;
// the silo hall's section (metres): the walls' top, the arcade line and its
// plate, the clerestory's top (the nave roof's eaves), the crossing lantern
const HALL = { x0: -37.15, x1: 37.15, z0: -1.15, z1: 137.15 };
const WALL_H = 24, ARC_X = 14.6, ARC_Y = 29.5, CLER = 36, LANTERN = 46;
const CROSS = { z0: 57.4, z1: 78.6 };
// the forty towers: four columns, ten rows (their foundations are the plan's obstacles)
const COLS = [-30, -18, 18, 30];
const ROWS = [6, 18, 30, 42, 54, 82, 94, 106, 118, 130];
// the sun: from the south-east, through the east clerestory, down onto the lane
const SUN: V3 = [-0.5, -0.82, 0.28];

// the towers' hoods (the conveyors' drops), collected as the towers are built
const towerHoods: { x: number; y: number; z: number; col: number }[] = [];
// the sun pools where the shafts land (scene.ts reads `lighting.pools` after build)
const dayPools: { x: number; z: number; r: number; color?: string; strength?: number }[] = [];

// ------------------------------------------------------------------ the zone
function buildGranary(): void {
  towerHoods.length = 0; dayPools.length = 0;
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'gg', glow, glowOccluders: false });
  const atlas = granaryAtlas(scene);
  const day = new PaintedQuads(), boards = new PaintedQuads();
  const shafts: Shaft[] = [];

  // --- painted windows: the plains through low windows, the sky through high ones
  const WIN: Record<string, (e: Edge) => Partial<WindowOpts> | null> = {
    silos: (e) => e.dx && e.j % 3 === 0 ? { kind: 'arch', sill: 13, spring: 18.6, half: 1.1 } : null,
    // the rear wall's runs stand on the dais (y 2): its sill and spring are over the dais
    office: (e) => (e.dz === 1 && Math.abs(e.i) === 3) ? { kind: 'arch', sill: 2.4, spring: 6.2, half: 1.3 }
      : (e.dx && (e.j === 43 || e.j === 45)) ? { kind: 'arch', sill: 4.2, spring: 7.6, half: 1.0 } : null,
    tally: (e) => e.dz === -1 && Math.abs(e.i) === 4 ? { kind: 'arch', sill: 3.2, spring: 5.8, half: 0.9 } : null,
    mill: (e) => e.dx === -1 && (e.j === -8 || e.j === -4) ? { kind: 'arch', sill: 3.4, spring: 6.4, half: 0.95 } : null,
    winnow: (e) => e.dx === 1 && (e.j === -8 || e.j === -4) ? { kind: 'arch', sill: 3.4, spring: 6.4, half: 0.95 } : null,
  };
  const so: ShellOpts = { style: THEME.arch, inset: INSET, rooms: ROOMS, corridorSconceEvery: 2, windows: (e, g) => WIN[g.id]?.(e) ?? null };
  const soSilo: ShellOpts = { ...so, style: SILO_STYLE };
  const paintWindow = (w: BackdropSlot) => {
    const high = w.center[1] > 10, n: [number, number] = [-w.normal[0], -w.normal[2]];
    // the sun stands south-east: windows looking east (normal +x) see the bright sky
    day.add([w.center[0] + w.normal[0] * 0.02, w.center[1], w.center[2] + w.normal[2] * 0.02], n, w.w + 0.1, w.h + 0.1, high ? (w.normal[0] > 0.5 ? REGION.sky : REGION.skyShade) : REGION.plains);
  };

  // --- fire: a brazier is a flame, a lamp slot and a floor pool
  const brazierAt = (group: string, x: number, y: number, z: number, size = 1) => {
    let seat: V3 = [x, y + 1.15, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r: 0.55, h: 1.05 }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size });
    buildApi.addCircleCollider(x, z, 0.55);
  };

  // =================================================== 1. THE SHELL
  for (const g of plan.groups) {
    let r: ReturnType<typeof buildGroupShell> = { seats: [], windows: [] };
    kit.build(g.id, (p) => { const s = buildGroupShell(p, plan, g, g.id === 'silos' ? soSilo : so); if (p.detail) r = s; });
    for (const s of r.seats) kit.fire(s.group, s.at, { facing: s.facing });
    for (const w of r.windows) paintWindow(w);
  }
  for (const c of shellColliders(plan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // =================================================== 2. THE FORTY TOWERS
  let n = 0;
  for (const zc of ROWS) for (const xc of COLS) {
    const k = n++;
    // every tower turns its board and spout to the lane, its ladder to the aisle
    const yaw = xc < 0 ? Math.PI / 2 : -Math.PI / 2;
    let out = { board: [0, 0, 0] as V3, hood: [0, 0, 0] as V3 };
    kit.build('silos', (p) => p.at(xc, 0, zc, yaw, () => { const o = silo(p, { ladder: k % 3 !== 1, fill: 0.55 + 0.45 * hash(k) }); if (p.detail) out = o; }));
    boards.add(out.board, [xc < 0 ? 1 : -1, 0], 2.1, 1.05, REGION.number(k));
    buildApi.addBoxCollider(xc, zc, 3.9, 3.9, 0, 30, -1);
    towerHoods.push({ x: out.hood[0], y: out.hood[1], z: out.hood[2], col: xc });
  }

  // =================================================== 3. THE HALL'S SECTION
  // stone piers on the inner towers' foundation corners carry oak arcade
  // plates; lean-to aisle roofs from the outer walls up to them; a clerestory
  // of arched windows over the plates; king-post trusses over the lane; at the
  // crossing four great arches and a lantern with a coffered ceiling.
  kit.build('silos', (p) => {
    const tb = p.g('timber'), w = p.g('wall'), t = p.g('trim');
    for (const s of [-1, 1]) {
      const x = s * ARC_X;
      for (const zc of ROWS) for (const dz of [-3.4, 3.4]) {
        const z = zc + dz;
        p.at(x, 0.58, z, 0, () => pier(p, { kind: 'square', w: 1.0, h: ARC_Y - 0.58 - 0.8 }));
        // knee braces from the pier up to the plate, along the lane
        if (p.detail && !(z > CROSS.z0 - 1 && z < CROSS.z1 + 1)) for (const sz of [-1, 1]) beam(tb, [x, ARC_Y - 3.6, z + sz * 0.5], [x, ARC_Y - 0.85, z + sz * 2.4], 0.3, 0.34, 0.03);
      }
      // the arcade plates, south and north of the crossing
      for (const [z0, z1] of [[HALL.z0, CROSS.z0 + 0.5], [CROSS.z1 - 0.5, HALL.z1]]) beam(tb, [x, ARC_Y - 0.4, z0], [x, ARC_Y - 0.4, z1], 0.9, 0.8, p.detail ? 0.04 : 0);
      // the outer wall plate and its corbels
      const xw = s * HALL.x1;
      beam(tb, [xw - s * 0.3, WALL_H + 0.15, HALL.z0], [xw - s * 0.3, WALL_H + 0.15, HALL.z1], 0.6, 0.5, p.detail ? 0.03 : 0);
      if (p.detail) for (let z = HALL.z0 + 2; z < HALL.z1; z += 4) box(t, xw - s * 0.55, WALL_H - 0.9, z - 0.25, xw, WALL_H - 0.1, z + 0.25, 0.04);
      // the lean-to: boards, rafters, two purlins
      const xa = s * (ARC_X + 0.45), ya = ARC_Y - 0.8, yw = WALL_H + 0.4;
      const ln = Math.hypot(ya - yw, xa - xw), nn: V3 = [-s * (ya - yw) / ln, -Math.abs(xa - xw) / ln, 0];
      p.g('ceiling').quad([xw, yw + 0.3, HALL.z0], [xa, ya + 0.3, HALL.z0], [xa, ya + 0.3, HALL.z1], [xw, yw + 0.3, HALL.z1], [-nn[0], nn[1], 0]);
      for (let z = HALL.z0 + 0.3; z < HALL.z1; z += 4.18) beam(tb, [xw - s * 0.2, yw, z], [xa, ya + 0.1, z], 0.26, 0.32, p.detail ? 0.03 : 0);
      if (p.detail) for (const f of [0.33, 0.66]) {
        const x0 = xw + (xa - xw) * f, y0 = yw + (ya - yw) * f;
        beam(tb, [x0, y0 - 0.05, HALL.z0], [x0, y0 - 0.05, HALL.z1], 0.24, 0.26, 0.02);
      }
      // the upper end walls over the aisle (the lean-to's triangle)
      for (const [z, nz] of [[HALL.z0, 1], [HALL.z1, -1]] as [number, number][]) w.poly([[xw, WALL_H, z], [xa, WALL_H, z], [xa, ya + 0.4, z], [xw, yw + 0.3, z]], [0, 0, nz]);
    }
    // the upper end walls over the lane, up to the trusses' gables, and a
    // round window ring high in each gable
    for (const [z, nz] of [[HALL.z0, 1], [HALL.z1, -1]] as [number, number][]) {
      w.quad([-ARC_X - 0.45, WALL_H, z], [ARC_X + 0.45, WALL_H, z], [ARC_X + 0.45, CLER, z], [-ARC_X - 0.45, CLER, z], [0, 0, nz]);
      if (p.detail) p.at(0, 0, z, nz > 0 ? 0 : Math.PI, () => archRing(p, 2.2, CLER - 6, 2.2, 0.02, 0.3, 0.5, 24));
    }
    // the nave roof, south and north of the lantern
    trussRoof(p, { span: 2 * (ARC_X - 0.45), z0: HALL.z0, z1: CROSS.z0, eaves: CLER, rise: 8, bay: 4.18, gables: [true, false] });
    trussRoof(p, { span: 2 * (ARC_X - 0.45), z0: CROSS.z1, z1: HALL.z1, eaves: CLER, rise: 8, bay: 4.18, gables: [false, true] });
    // the crossing: the east and west arches into the transepts
    for (const s of [-1, 1]) p.at(s * ARC_X, 0, (CROSS.z0 + CROSS.z1) / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
      const half = (CROSS.z1 - CROSS.z0) / 2 - 0.5;
      p.at(0, 0, 0.45, 0, () => doorway(p, { h: CLER, thick: 0.9, half, spring: 20, rise: 9, edge: half + 0.02, kind: 'arch' }));
      if (p.detail) archRing(p, half, 20, 9, 0.47, 0.35, 0.9, 25);
    });
    // the north and south arches across the lane, the lantern's walls over them
    for (const [z, yaw] of [[CROSS.z0, 0], [CROSS.z1, Math.PI]] as [number, number][]) p.at(0, 0, z, yaw, () => {
      p.at(0, 0, 0.45, 0, () => doorway(p, { h: LANTERN, thick: 0.9, half: ARC_X - 0.5, spring: 20, rise: 9.5, edge: ARC_X + 0.45, kind: 'arch' }));
      if (p.detail) { archRing(p, ARC_X - 0.5, 20, 9.5, 0.47, 0.4, 1.0, 29); archRing(p, ARC_X - 0.5, 20, 9.5, -0.87, 0.4, 1.0, 29); }
    });
  });
  // the clerestory (over the plates) and the lantern's upper walls: arched
  // windows, the sun's side painted bright and the shade's cooler
  kit.build('silos', (p) => {
    for (const s of [-1, 1]) {
      const yaw = s < 0 ? Math.PI / 2 : -Math.PI / 2, x = s * (ARC_X - 0.45);
      for (const [z0, z1] of [[HALL.z0, CROSS.z0], [CROSS.z1, HALL.z1]]) {
        const bays = 14, bl = (z1 - z0) / bays;
        for (let k = 0; k < bays; k++) {
          const zc = z0 + (k + 0.5) * bl;
          p.at(x, ARC_Y, zc, yaw, () => {
            const slot = windowBay(p, { h: CLER - ARC_Y, thick: 0.9, edge: bl / 2, half: 1.0, sill: 1.1, spring: 4.6, kind: 'arch' });
            if (p.detail) { paintWindow(slot); if (s > 0 && k % 2 === 0) shafts.push({ from: [x - 0.4, ARC_Y + 3.2, zc], w: 2.0, h: 4.2, strength: 0.9 }); }
          });
        }
      }
      // the lantern's walls: three tall windows a side, from the clerestory's top up
      const lz = (CROSS.z1 - CROSS.z0) / 3;
      for (let k = 0; k < 3; k++) {
        const zc = CROSS.z0 + (k + 0.5) * lz;
        p.at(x, CLER, zc, yaw, () => {
          const slot = windowBay(p, { h: LANTERN - CLER, thick: 0.9, edge: lz / 2, half: 1.5, sill: 1.6, spring: 7.2, kind: 'arch' });
          if (p.detail) { paintWindow(slot); if (s > 0) shafts.push({ from: [x - 0.4, CLER + 5.5, zc], w: 3.0, h: 7.0, strength: 1.1 }); }
        });
      }
    }
    // the lantern's coffered ceiling
    flatCeiling(p, { x0: -ARC_X + 0.45, z0: CROSS.z0 + 0.45, x1: ARC_X - 0.45, z1: CROSS.z1 - 0.45, h: LANTERN, coffer: 4.2 });
    // the clerestory's top plate, under the trusses' wall plates
    for (const s of [-1, 1]) beam(p.g('timber'), [s * (ARC_X - 0.2), CLER - 0.2, HALL.z0], [s * (ARC_X - 0.2), CLER - 0.2, HALL.z1], 0.6, 0.4, p.detail ? 0.03 : 0);
  });

  // =================================================== 4. THE LANE AND THE GALLERIES
  kit.build('silos', (p) => {
    // the loading lane: setts down the middle, a rail track either side
    const ft = p.g('floorTrim'), m = p.g('metal');
    for (const [z0, z1] of [[HALL.z0 + 0.9, 57.6], [66.4, HALL.z1 - 0.9]]) {
      ft.quad([-4, 0.006, z0], [4, 0.006, z0], [4, 0.006, z1], [-4, 0.006, z1], [0, 1, 0]);
      for (const x of [-8.6, -7.4, 7.4, 8.6]) box(m, x - 0.05, 0, z0, x + 0.05, 0.07, z1, 0, ['ny']);
      if (p.detail) for (const x of [-8, 8]) for (let z = z0 + 0.4; z < z1; z += 1.2) box(p.g('timber'), x - 1.0, 0, z - 0.12, x + 1.0, 0.04, z + 0.12, 0, ['ny']);
    }
    // the Count Floor's inlay: a compass of the count, the landmark's ground
    p.at(0, 0.008, 0, 0, () => floorRect(p, { x0: -9, z0: 66.6, x1: 9, z1: 78.4, border: 0.4, inlay: 'medallion' }));
    // the galleries over the inner columns
    for (const s of [-1, 1]) for (const [z0, z1] of [[1.0, 57.0], [79.0, 135.0]]) p.at(s * 16.7, 0, 0, 0, () => gallery(p, z0, z1, 24.2, 28.0));
  });
  kit.build('silos', (p) => {
    for (const h of towerHoods) {
      // the inner towers drop straight from the gallery; the outer ones are fed by chutes across the aisle
      if (Math.abs(h.col) === 18) { box(p.g('timber'), h.x - 0.3, h.y, h.z - 0.3, h.x + 0.3, 24.1, h.z + 0.3, p.detail ? 0.02 : 0); continue; }
      const s = Math.sign(h.col);
      chute(p, [s * 16.7, 24.35, h.z + 2.5], [h.x, h.y + 0.25, h.z], 0.6);
    }
    // the engine's conveyors up to the galleries' ends
    for (const s of [-1, 1]) for (const [ez, gz] of [[58.6, 57.0], [65.4, 79.0]]) chute(p, [s * 5.6, 19.6, ez], [s * 16.7, 24.35, gz], 0.8);
  });

  // =================================================== 5. THE COUNT FLOOR: the Counting Engine
  let eng = { seats: [] as V3[], board: [0, 0, 0] as V3, top: [0, 0, 0] as V3 };
  kit.build('silos', (p) => p.at(0, 0, 62, 0, () => { const o = countingEngine(p); if (p.detail) eng = o; }));
  buildApi.addBoxCollider(0, 62, 6, 4, 0, 30, -1);
  for (const s of eng.seats) kit.fire('silos', s, { size: 0.75, floorPool: 3.4 });
  boards.add(eng.board, [0, -1], 7.0, 2.1, REGION.count);

  // the lantern posts down both sides of the lane: the warm light that leads on
  for (const z of [4, 16, 28, 40, 52, 86, 98, 110, 122, 134]) for (const s of [-1, 1]) {
    const x = s * 12.4;
    let seat: V3 = [x, 3.6, z];
    kit.build('silos', (p) => p.at(x, 0, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => { const v = lanternPost(p); if (p.detail) seat = v; }));
    kit.fire('silos', seat, { size: 0.7, floorPool: 3.6 });
    buildApi.addCircleCollider(x, z, 0.4);
  }

  // =================================================== 6. THE WAGON DOCK and THE GATE
  kit.build('entry', (p) => p.at(0, 0, -46 + INSET, 0, () => greatDoors(p, 2.7, 5.6)));
  kit.build('entry', (p) => p.at(0, 0, -34 - INSET, Math.PI, () => boardFrame(p, 4.6, 0.9, 5.3)));
  boards.add([0, 5.3, -34 - INSET - 0.03], [0, -1], 4.6, 0.9, REGION.sign(4));
  // the weighbridge plates in the gate's floor
  for (const g of plan.groups) if (g.kind === 'corridor' && g.cells.some(([, j]) => j === -8)) kit.build(g.id, (p) => {
    for (const [i, j] of g.cells) {
      const x = i * 4, z = j * 4;
      p.g('metal').quad([x - 1.5, 0.008, z - 1.5], [x + 1.5, 0.008, z - 1.5], [x + 1.5, 0.008, z + 1.5], [x - 1.5, 0.008, z + 1.5], [0, 1, 0]);
      if (p.detail) box(p.g('timber'), x - 1.65, 0, z - 1.65, x + 1.65, 0.02, z - 1.5, 0, ['ny']);
    }
  });

  // =================================================== 7. THE TALLY HALL
  // the steelyard over the weighbridge (west of the hall's centre; the rats run east)
  kit.build('tally', (p) => p.at(-9, 0, -16, 0, () => {
    p.g('metal').quad([-3.2, 0.008, -2.2], [3.2, 0.008, -2.2], [3.2, 0.008, 2.2], [-3.2, 0.008, 2.2], [0, 1, 0]);
    if (p.detail) for (const [x0, z0, x1, z1] of [[-3.4, -2.4, 3.4, -2.2], [-3.4, 2.2, 3.4, 2.4], [-3.4, -2.2, -3.2, 2.2], [3.2, -2.2, 3.4, 2.2]]) box(p.g('trim'), x0, 0, z0, x1, 0.03, z1, 0, ['ny']);
    steelyard(p, 5, 6.6);
  }));
  for (const x of [-14, -4]) for (const z of [-17.6, -14.4]) buildApi.addCircleCollider(x, z, 0.35);
  // the Hopper Gate, shut: the tally hall's north wall onto the towers
  kit.build('tally', (p) => p.at(0, 0, -6 - INSET, Math.PI, () => { greatDoors(p, 3.2, 6.0); boardFrame(p, 6.0, 0.9, 7.3); }));
  boards.add([0, 7.3, -6 - INSET - 0.03], [0, -1], 6.0, 0.9, REGION.sign(2));
  for (const x of [-12, 12]) {
    kit.build('tally', (p) => p.at(x, 0, -6 - INSET, Math.PI, () => boardFrame(p, 5.6, 1.4, 4.4)));
    boards.add([x, 4.4, -6 - INSET - 0.03], [0, -1], 5.6, 1.4, REGION.tally);
  }
  for (const x of [-18, -15.5, 8.5, 11, 15.5, 18]) kit.build('tally', (p) => p.at(x, 0, -6 - INSET - 0.95, 0, () => tallyDesk(p)));
  brazierAt('tally', -18, 0, -22, 0.9);
  brazierAt('tally', 18, 0, -22, 0.9);

  // =================================================== 8. THE MILL and THE WINNOWING FLOOR
  let spouts: V3[] = [];
  kit.build('mill', (p) => p.at(-50, 0, -26, Math.PI / 2, () => { const s = millstones(p, 15); if (p.detail) spouts = s; }));
  buildApi.addBoxCollider(-50, -26, 3.95, 3.95, 0, 16, -1);
  kit.build('mill', (p) => {
    for (const s of spouts) {
      box(p.g('timber'), s[0] - 0.6, 0, s[2] - 0.7, s[0] + 0.6, 0.85, s[2] + 0.7, p.detail ? 0.03 : 0, ['ny']);
      box(p.g('accent'), s[0] - 0.5, 0.6, s[2] - 0.6, s[0] + 0.5, 0.8, s[2] + 0.6, 0, ['ny']);
    }
    // spare stones, flat on the boards by the west wall
    for (const [x, z] of [[-55, -14.5], [-55, -35]]) for (let k = 0; k < 2; k++) lathe(p.g('trim'), [[0.15, k * 0.36], [1.15, k * 0.36], [1.15, k * 0.36 + 0.34], [0.15, k * 0.36 + 0.34]], p.detail ? 18 : 8, x, z, { caps: true });
  });
  for (const s of spouts) buildApi.addBoxCollider(s[0], s[2], 0.6, 0.7, 0, 1.2, -1);
  kit.build('mill', (p) => p.at(-44, 0, -10 - INSET, Math.PI, () => boardFrame(p, 4.6, 0.85, 5.6)));
  boards.add([-44, 5.6, -10 - INSET - 0.03], [0, -1], 4.6, 0.85, REGION.sign(0));
  brazierAt('mill', -33, 0, -36, 0.9);

  // the threshing floor (raised boards on the obstacle cells) and its winnowers
  kit.build('winnow', (p) => {
    box(p.g('trim'), 46.1, 0, -29.9, 53.9, 0.35, -22.1, p.detail ? 0.04 : 0, ['ny']);
    box(p.g('ceiling'), 46.3, 0.35, -29.7, 53.7, 0.4, -22.3, 0, ['ny']);
    p.at(50, 0.4, -28, Math.PI, () => winnower(p));
    p.at(50, 0.4, -24, Math.PI, () => winnower(p));
    for (const [x, z, r, h, sd] of [[36, -12.5, 1.8, 0.9, 1], [56, -13, 2.0, 1.1, 2], [56.2, -35, 1.6, 0.8, 3], [33, -35.5, 1.4, 0.7, 4], [44.5, -33.5, 1.2, 0.5, 5]]) p.at(x, 0, z, 0, () => heap(p, r, h, sd));
  });
  buildApi.addBoxCollider(50, -26, 3.95, 3.95, 0, 4, -1);
  kit.build('winnow', (p) => p.at(44, 0, -10 - INSET, Math.PI, () => boardFrame(p, 4.6, 0.85, 5.6)));
  boards.add([44, 5.6, -10 - INSET - 0.03], [0, -1], 4.6, 0.85, REGION.sign(1));
  brazierAt('winnow', 33, 0, -16, 0.9);

  // =================================================== 9. THE LEDGER HALL
  for (const s of [-1, 1]) for (const z of [145.5, 150, 154.5]) kit.build('ledger', (p) => p.at(s * (14 - INSET - 0.62), 0, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => ledgerPress(p, 3.6)));
  for (const s of [-1, 1]) {
    kit.build('ledger', (p) => p.at(s * 7.5, 0, 158 - INSET, Math.PI, () => boardFrame(p, 5.0, 1.6, 3.9)));
    boards.add([s * 7.5, 3.9, 158 - INSET - 0.03], [0, -1], 5.0, 1.6, s < 0 ? REGION.count : REGION.tally);
  }

  // =================================================== 10. THE OFFICE (the boss)
  const deck = SITE.decks[0], ramp = SITE.ramps[0];
  const DAIS = { x0: -18 + INSET, x1: 18 - INSET, z0: deck.cz - deck.hz, z1: 190 - INSET, y: deck.y };
  kit.build('office', (p) => {
    p.g('ceiling').quad([DAIS.x0, DAIS.y, DAIS.z0], [DAIS.x1, DAIS.y, DAIS.z0], [DAIS.x1, DAIS.y, DAIS.z1], [DAIS.x0, DAIS.y, DAIS.z1], [0, 1, 0]);
    box(p.g('trim'), DAIS.x0, 0, DAIS.z0, DAIS.x1, DAIS.y, DAIS.z0 + 0.4, 0, ['ny', 'py']);
    box(p.g('trim'), DAIS.x0, DAIS.y - 0.14, DAIS.z0 - 0.14, DAIS.x1, DAIS.y + 0.03, DAIS.z0 + 0.3, p.detail ? 0.03 : 0);
    if (p.detail) for (let x = DAIS.x0 + 1.2; x < DAIS.x1 - 1; x += 2.4) if (Math.abs(x) > 3.6) box(p.g('timber'), x - 1.0, 0.25, DAIS.z0 - 0.05, x + 1.0, DAIS.y - 0.35, DAIS.z0, 0.02);
    for (const [a, b] of [[DAIS.x0, -3.3], [3.3, DAIS.x1]]) p.at((a + b) / 2, DAIS.y, DAIS.z0 + 0.3, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.3 }));
    p.at(0, 0, ramp.z0, 0, () => stairFlight(p, { w: 2 * ramp.half, run: ramp.z1 - ramp.z0, rise: ramp.y1 - ramp.y0, rails: 'both' }));
    // the boss's floor: the count's compass inlaid where the master comes down to meet you
    p.at(0, 0.008, 0, 0, () => floorRect(p, { x0: -6.5, z0: 163.5, x1: 6.5, z1: 174.2, border: 0.4, inlay: 'medallion' }));
    p.at(0, DAIS.y, 186.2, 0, () => masterDesk(p));
    // the painted plan's frame on the rear wall, ledger presses either side
    p.at(0, DAIS.y, 190 - INSET, Math.PI, () => boardFrame(p, 9.2, 5.6, 4.6));
    for (const s of [-1, 1]) p.at(s * 15.6, DAIS.y, 190 - INSET - 0.62, Math.PI, () => ledgerPress(p, 4.2));
  });
  boards.add([0, DAIS.y + 4.6, 190 - INSET - 0.03], [0, -1], 9.2, 5.6, REGION.plan);
  boards.add([0, 8.4, 162 + INSET + 0.03], [0, 1], 6.0, 0.9, REGION.sign(3));
  kit.build('office', (p) => p.at(0, 0, 162 + INSET, 0, () => boardFrame(p, 6.0, 0.9, 8.4)));
  buildApi.addDeck(deck.cx, deck.cz, deck.hx, deck.hz, 0, deck.y);
  buildApi.addBoxCollider(deck.cx, deck.cz, deck.hx, deck.hz, 0, deck.y - 0.25);
  buildApi.addRamp(ramp.x0, ramp.z0, ramp.y0, ramp.x1, ramp.z1, ramp.y1, ramp.half);
  buildApi.addBoxCollider(0, 186.2, 2.55, 0.72, 0, 4, 1.5);
  for (const s of [-1, 1]) buildApi.addBoxCollider(s * 15.6, 190 - INSET - 0.32, 1.3, 0.4, 0, 8, 1.5);
  brazierAt('office', -5.2, 0, 173.6, 1.1);
  brazierAt('office', 5.2, 0, 173.6, 1.1);

  // =================================================== 10b. HUNG LIGHT
  // MEASURED (first look): the tall rooms' upper halves were black and the
  // dock showed nothing at the spawn but a wall: lanterns hung from the trusses,
  // candle rings over the office floor and one great ring in the crossing's
  // lantern, which the lane sees from the south door on
  const hang = (group: string, x: number, y: number, z: number, top: number, size = 0.75) => {
    let seat: V3 = [x, y, z];
    kit.build(group, (p) => { const v = hangingLantern(p, x, y, z, top); if (p.detail) seat = v; });
    kit.fire(group, seat, { size, floorPool: 3.8 });
  };
  // (each chain rises to a truss's tie beam: the kit's trusses fall every room length / round(length / 4))
  for (const x of [-5.49, 5.49]) hang('entry', x, 4.6, -40, 7.1);
  for (const [x, z] of [[-13.46, -18], [-1.92, -12], [13.46, -18]]) hang('tally', x, 5.2, z, 8.1);
  hang('mill', -40, 5.8, -25.9, 9.1); hang('winnow', 40, 5.8, -25.9, 9.1);
  for (const z of [146, 154]) hang('ledger', 0, 4.8, z, 7.0, 0.7);
  const ring = (group: string, x: number, y: number, z: number, r: number, n: number, top: number, size: number) => {
    let seats: V3[] = [];
    kit.build(group, (p) => { const s = candleRing(p, x, y, z, r, n, top); if (p.detail) seats = s; });
    seats.forEach((s, k) => kit.fire(group, s, { size, lamp: k === 0, floorPool: k === 0 ? 6 : 0 }));
  };
  ring('office', 0, 6.6, 168.5, 2.2, 12, 10.5, 0.4);
  ring('office', 0, 7.2, 178.5, 1.8, 10, 10.5, 0.4);
  ring('silos', 0, 31, 72, 4.2, 18, LANTERN, 0.5);

  // =================================================== 11. PROPS (CC0, pooled)
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, y = 0, far = false) => kit.props.place({ file, group, x, y, z, yaw, scale, far });
  const sacks = (group: string, x: number, z: number, count: number, seed: number, y = 0) => {
    for (let k = 0; k < count; k++) {
      const a = hash(seed * 13 + k) * Math.PI * 2, r = k < 3 ? 0.35 * k : 0.6 + 0.4 * hash(seed + k * 7);
      P(k % 2 ? 'props/Bag.gltf' : 'props/Bag_2.gltf', group, x + Math.cos(a) * r, z + Math.sin(a) * r, a * 1.7, 1.25, y);
    }
  };
  // the dock: the last wagon, never unloaded; sacks and crates
  P('props/Wagon.gltf', 'entry', -5.4, -40.5, 0.12, 1, 0, true);
  for (let k = 0; k < 5; k++) P('props/Bag.gltf', 'entry', -5.4 + (k % 2) * 0.5 - 0.25, -41.8 + k * 0.6, 1.4 + k, 1.2, 1.25);
  sacks('entry', 6.6, -43, 6, 1); sacks('entry', 7.4, -37, 5, 2);
  P('dungeon/crates_stacked.glb', 'entry', 7.2, -40.2, 0.3, 0.75);
  P('props/Stall_Cart_Empty.gltf', 'entry', 5.6, -36.2, -0.4, 0.9);
  // the tally hall: sacks waiting by the weighbridge
  sacks('tally', -12.5, -21.5, 7, 3); sacks('tally', -5.5, -10.5, 5, 4);
  P('props/Page_Stack_Large.gltf', 'tally', 11, -7.6, 0.2, 1, 1.05); P('props/Book_Open.gltf', 'tally', 15.5, -7.5, 0.1, 1.2, 1.05);
  P('props/Barrel.gltf', 'tally', 20.3, -24, 0.4); P('props/Barrel.gltf', 'tally', 19.6, -23.1, 1.4);
  P('props/Bench.gltf', 'tally', 13.5, -9.6, 0, 1);
  // the mill: sacks filling, the millwright's bench, tools
  sacks('mill', -45.2, -33.5, 6, 5); sacks('mill', -33.5, -13.5, 5, 6); sacks('mill', -56, -24.5, 4, 7);
  P('props/Workbench.gltf', 'mill', -56.5, -19, Math.PI / 2); P('props/Shovel_Bronze.gltf', 'mill', -45.2, -21.6, 0.3);
  P('props/Barrel.gltf', 'mill', -33, -24.5, 0.2); P('dungeon/crates_stacked.glb', 'mill', -33.5, -33.5, 0.9, 0.7);
  P('props/Stall_Cart_Empty.gltf', 'mill', -46, -12.6, 0, 0.9);
  // the winnowing floor: sacks, shovels, the barrows
  sacks('winnow', 56, -18.5, 5, 8); sacks('winnow', 40, -36, 6, 9); sacks('winnow', 33.5, -24, 4, 10);
  P('props/Shovel_Steel.gltf', 'winnow', 45.2, -21.2, 1.1); P('props/Hoe_Bronze.gltf', 'winnow', 45.4, -31.2, 0.4);
  P('props/Stall_Cart_Empty.gltf', 'winnow', 44, -12.6, 0, 0.9); P('props/Barrel.gltf', 'winnow', 57, -27, 0.4);
  // the silo hall: sacks under the inner towers' spouts, carts on the lane, wagons in the transepts
  for (let k = 0; k < 40; k++) {
    if (k % 4 === 1 || k % 4 === 2) {
      const xc = COLS[k % 4], zc = ROWS[Math.floor(k / 4)], s = xc < 0 ? 1 : -1;
      sacks('silos', xc + s * 4.6, zc + 1.6, 3 + (k % 3), 20 + k);
    }
  }
  P('props/Wagon.gltf', 'silos', -28, 68, Math.PI / 2, 1, 0, true);
  P('props/Wagon.gltf', 'silos', 27, 72, -Math.PI / 2 + 0.15, 1, 0, true);
  sacks('silos', -24, 61, 8, 60); sacks('silos', 31, 61, 6, 61); sacks('silos', -33, 76, 6, 62); sacks('silos', 24, 76.5, 7, 63);
  for (const [x, z, y] of [[-6.2, 12, 0.3], [6.3, 44, -0.2], [-6.4, 92, 0.1], [6.2, 120, 0.4]]) P('props/Stall_Cart_Empty.gltf', 'silos', x, z, y, 1);
  P('dungeon/crates_stacked.glb', 'silos', 9.5, 0.9, 0.2, 0.75); P('dungeon/crates_stacked.glb', 'silos', -9.5, 135.5, 1.1, 0.75);
  P('props/Ladder.gltf', 'silos', -10.8, 58.4, 0, 1.2);
  // the ledger hall: desks and stools, pages
  P('props/Desk.gltf', 'ledger', -6.5, 144.2, 0); P('props/Desk.gltf', 'ledger', 6.5, 144.2, 0);
  P('props/Stool.gltf', 'ledger', -6.5, 145.3, 0); P('props/Stool.gltf', 'ledger', 6.5, 145.3, 0);
  P('props/Page_Stack_Large.gltf', 'ledger', -6.8, 144.2, 0.3, 1, 0.85); P('props/Book_Stack_2.gltf', 'ledger', 6.2, 144.2, 0.1, 1, 0.85);
  // the office: the master's chair, candelabra, banners, books, chests on the dais
  P('props/Chair_3.gltf', 'office', 0, 187.7, Math.PI, 1.15, DAIS.y);
  for (const s of [-1, 1]) {
    P('props/CandleStick_Stand.gltf', 'office', s * 3.9, 181.2, 0, 1.25);
    P('props/CandleStick_Stand.gltf', 'office', s * 8.5, 187.6, 0, 1.25, DAIS.y);
    P('dungeon/banner_patternA_yellow.glb', 'office', s * 7.6, 189.0, Math.PI, 1.3, DAIS.y + 2.6);
    P('props/Bookcase_2.gltf', 'office', s * 17.0, 184.2, s < 0 ? Math.PI / 2 : -Math.PI / 2, 1.2, DAIS.y);
    P('props/Chest_Wood.gltf', 'office', s * 11.5, 188.4, Math.PI, 1.1, DAIS.y);
  }
  P('props/Book_Stack_3.gltf', 'office', -1.6, 186.2, 0.4, 1.4, DAIS.y + 1.06);

  // =================================================== 12. LIGHT, CAMERA, FINISH
  for (const s of shafts) { const l = landing(s.from, SUN, 0); dayPools.push({ x: l[0], z: l[2], r: s.w > 2.5 ? 3.2 : 2.3, color: '#ffe0a0', strength: 0.32 }); }
  lightShafts(scene, glow, 'gg_sunshafts', SUN, shafts);
  day.mesh('gg_windows', scene, atlas.unlit);
  boards.mesh('gg_boards', scene, atlas.lit);
  for (const c of dp.cameraRooms(0.35)) {
    const big = c.hx > 14 || c.hz > 14;
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: big ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

registerZone({
  key: 'greatgranary',
  terrain: { tex: 'dry_ground_01', tint: ['#7a6a50', '#7a6a50'], tile: 6 },
  // MEASURED (first look): with #5a4630 every ceiling, roof board and soffit
  // read black; the hemisphere's ground term is what lights a face looking down
  // Polish pass: a warm sky (the default is a cool blue) and a lighter ground
  // for the Mill, the Tally Hall and the silo lane (medians 21-38 of 255)
  hemi: 0.95, light: { hemiGround: '#a08c70' },
  lighting: {
    hemi: 0.95, hemiSky: '#d8d0c0', hemiGround: '#a08c70', sun: 0.32, sunColor: '#ffe2b0', sunDir: SUN,
    fog: { density: 0.0062, color: '#2c2418' }, exposure: 1.1, contrast: 1.05,
    pools: dayPools, poolColor: '#ffe0a0', poolStrength: 0.32,
  },
  // the boss rune's column and the lantern posts are taller than the plan
  // occluder's default 3.2 m walls (the Lodge measured the halo through them)
  glow: { occluder: { height: 9 } },
  build: buildGranary,
});
