// The Sunken Ballroom: "a shallow-flooded leisure palace, its last waltz held
// for the Return." Moonmere's doorstep trial, under the west mere of the
// Summer Lakes. Rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md,
// tmp/dungeons/HANDBOOK.md; the plan and its reasons in
// tmp/dungeons/sunkenballroom/PLAN.md).
//
// THE ROUTE (tools/data/dungeon_plans/sunkenballroom.json is the plan; the
// generator writes zones.json from it): the Ballroom Stair (spawn, the rune
// home, the lake doors shut behind you, the Cloakroom off it, the guests'
// cloaks still on their hooks) -> DOWN the Grand Stair into the palace, three
// metres under the entry -> the Long Portrait Gallery (the household on the
// north wall, the lake pressing on the windows of the south; the grand doors
// to the ballroom fallen in, so you go round; guests) -> two wings, each a
// loop to the Mirror Foyer: WEST the Supper Salon (the dinner nobody ate,
// stewards), the Wine Vault (a flooded brick cellar, stewards) and its side
// room the Musicians' Antechamber; EAST the Card Salon (the dance cards on the
// sideboard, guests), the Rose Salon (the mid set-piece: the lake has broken
// the wall and pours in; the Undertow) and its side room the Choristers'
// Gallery (the household chapel's choir: choristers at the stalls, shrine
// wights at the shrine) -> the Mirror Foyer (the last guests in line to be
// announced) -> the Grand Doors -> the Interrupted Waltz: the flooded dance
// floor under a coffered oval dome on paired columns, the lake's moonlight
// falling through its lantern, the bandstand, the music box mid-waltz, the
// Master of Ceremonies. "Every lamp leaned one way": every chandelier in the
// palace hangs tilted toward the lake doors, the way the household went.
//
// ENCLOSED throughout: walls, vaults and coffered ceilings everywhere; the lake
// is seen only through glass (sunkenballroom_fx.ts lakeMaterial: the view
// along the eye's line, so the water has depth). No light but the kit's four
// lamp slots: every other light is candle fire (flame cards), baked pools,
// and the lake's cold glow (shafts, caustics, cold pools).
//
// SERVER TRUTH. Walls stand on the cell edges the layout leaves open (the
// shell's 0.85 m inset). The Grand Stair, the Grand Doors and the breach are
// built here, not by the shell, because each is one wide opening where the
// shell would make three doors (cutRuns). The breach's rubble stands on the
// one obstacle cell. Columns and furniture are client colliders only and
// stand out of the camp discs.
import { Color3, StandardMaterial, Texture } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow, makeClearWaterMat } from '../scene';
import {
  DungeonKit, LightPools, Parts, planGroups, THEMES, buildGroupShell, shellColliders, runFrame, doorway, wallSegment, barrelVault, stairFlight, galleryEdge, floodLevels, FLOOD,
  pilaster, box, beam, lathe, sweep, moulding, arc, PROFILES, norm, add, mul, sub, cross,
  type KitPlan, type Group, type Edge, type Run, type ShellOpts, type ThemePreset, type V3, type V2, type SurfaceSpec, type RoomStyle, type Geom,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import * as S from './sunkenballroom_parts';
import { Extras, lakeMaterial, shaftMaterial, causticMaterial, fallMaterial, portraitAtlas, portraitUV, portraitMaterial, damask, siltMaterial } from './sunkenballroom_fx';

type Deck = { cx: number; cz: number; hx: number; hz: number; y: number };
type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[]; decks: Deck[] } } };
const ZONE = zones.sunkenballroom as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// The kit's ballroom preset darkened and made wet: the old build was a white
// showroom (SCOUT.md). Sea-grey plaster, a verdigris marble dado, teal silk
// damask (the texture is painted in sunkenballroom_fx.ts), gilt, walnut, wet
// marble floors that catch the lamps; `dark` is the wine vault's brick.
const BASE = THEMES.ballroom;
const SF = (sheet: SurfaceSpec['sheet'], tint: string, o: Partial<SurfaceSpec> = {}): SurfaceSpec => ({ sheet, tint, ...o });
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    wall: SF('plaster', '#8f9a92', { bump: 0.7 }),
    trim: SF('marble', '#d4ccb8', { spec: 0.4, power: 70 }),
    floor: SF('marble', '#a9a69c', { spec: 0.7, power: 110 }),
    floorTrim: SF('marble', '#2e4844', { spec: 0.65, power: 100 }),
    inlay: SF('marble', '#6e5a58', { spec: 0.65, power: 100 }),
    // a faint emissive floor on the plaster ceilings: the marble's bounce
    ceiling: SF('plaster', '#aeb0a4', { emissive: '#1e201e' }),
    timber: SF('timber', '#5a3a26', { spec: 0.25, power: 50 }),
    metal: SF(undefined, '#b38c48', { spec: 0.8, power: 60 }),
    accent: SF(undefined, '#ffffff', { spec: 0.18, power: 30 }),
    glass: SF(undefined, '#8c9ea0', { spec: 1.0, power: 160, emissive: '#121a1c' }),
    emit: { tint: '#ffd9a0', emissive: '#ffd9a0', glow: 0.8, unlit: true },
    dark: SF('brick', '#7a6656', { bump: 0.9 }),
  },
  arch: { ...BASE.arch, wallHeight: 7, corridorHeight: 4.6, ceiling: 'coffered', corridorCeiling: 'barrel', pilasterEvery: 1, stringCourse: null, plinth: true, cornice: true, inlay: 'diamond', ribEvery: 4, floorBorder: true },
  fog: { color: '#0e1d20', density: 0.013 },
  // the ground colour is the pale marble's bounce, still lake-green
  // (MEASURED polish pass: #24312f at 0.66 left the choir, the portrait
  // gallery and the wine vault at medians 26-28 of 255, their upper thirds 14-23)
  hemi: 0.72, hemiGround: '#6e7c76',
  lamp: { color: '#ffd8a4', intensity: 1.1, range: 21 },
  pool: { color: '#ffd29a', strength: 0.3 },
};

const INSET = 0.85, OUTER = 0.35, THICK = INSET + OUTER, CELL = 4;
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 7, ceiling: 'coffered', sconceEvery: 2, inlay: 'medallion' },
  cloak: { height: 5, ceiling: 'flat', sconceEvery: 2, inlay: 'none' },
  gallery: { height: 7, ceiling: 'barrel', sconceEvery: 0, inlay: 'diamond' },
  supper: { height: 6.5, ceiling: 'coffered', sconceEvery: 2 },
  wine: { height: 4.2, ceiling: 'open', sconceEvery: 2, inlay: 'none', border: 0 },
  music: { height: 6, ceiling: 'coffered', sconceEvery: 2 },
  cards: { height: 6.5, ceiling: 'coffered', sconceEvery: 2 },
  rose: { height: 7, ceiling: 'groin', sconceEvery: 0 },
  choir: { height: 8, ceiling: 'groin', sconceEvery: 2, inlay: 'grid' },
  foyer: { height: 8.5, ceiling: 'barrel', sconceEvery: 0, inlay: 'grid' },
  ballroom: { height: 8.4, ceiling: 'open', sconceEvery: 2, inlay: 'none' },
};
const wallH = (id: string) => ROOMS[id]?.height ?? THEME.arch.wallHeight;
// the lake doors' way: every chandelier leans this far toward the entry (-z)
const LEAN = 0.2;
const Y = -3;            // the palace floor
// The Wine Vault, the Rose Salon and the ballroom are flooded: SUNKEN BASINS
// (DUNGEONS.md "Water in a dungeon"). Their floor, the plan's y and the walk
// floor, lies FLOOD.depth under the palace's doorways, the water
// FLOOD.freeboard under them; the shell stands their walls on the threshold
// and lines the basin (a coped kerb, steps down in every doorway). MEASURED
// (2026-10-11, Philip's note at x -37 z 3): a sheet laid level with the
// doorways over a dry floor read as a layer floating on the floor.
const { floor: BASIN, water: FLOOD_Y } = floodLevels(Y);
const FLOODED = new Set(['wine', 'rose', 'ballroom']);
/** a wall run's base (a flooded room's walls stand on its threshold) and the level a floor light pool lies at */
const wallBase = (group: string, y: number) => FLOODED.has(group) ? Y : y;
const poolY = (group: string, y: number) => FLOODED.has(group) ? FLOOD_Y : y;
const BR = { x0: -26 + INSET, x1: 26 - INSET, z0: 18 + INSET, z1: 62 - INSET };
const OVAL = { cx: 0, cz: 37.5, rx: 21, rz: 15.5 };
const ENT = { top: 5.4, colTop: 4.0 };   // the ballroom's springing and the columns' tops (world y)

// windows onto the lake: (group|i,j,dx,dz) of outer wall edges
const WINDOWS = new Set([
  'gallery|-6,-6,0,-1', 'gallery|-4,-6,0,-1', 'gallery|4,-6,0,-1', 'gallery|6,-6,0,-1',
  'supper|-14,-6,-1,0', 'supper|-14,-4,-1,0', 'cards|14,-6,1,0', 'cards|14,-4,1,0',
  'music|-15,8,-1,0', 'music|-15,10,-1,0', 'choir|15,8,1,0', 'choir|15,10,1,0',
  'ballroom|-6,7,-1,0', 'ballroom|-6,9,-1,0', 'ballroom|-6,11,-1,0', 'ballroom|6,7,1,0', 'ballroom|6,9,1,0', 'ballroom|6,11,1,0',
]);
const edgeKey = (g: string, e: Edge) => `${g}|${e.i},${e.j},${e.dx},${e.dz}`;
const WIN = { half: 1.2, sill: 1.1, spring: 4.3, rise: 1.2 };

/** A plan whose wall runs skip the edges `drop` names: the shell then leaves a
 * gap there for an opening built by hand (a run splits; the cut ends are flat). */
function cutRuns(plan: KitPlan, drop: (e: Edge, r: Run) => boolean): KitPlan {
  const runs: Run[] = [];
  for (const r of plan.runs) {
    let cur: Edge[] = [], start = r.start;
    for (const e of r.edges) {
      if (drop(e, r)) { if (cur.length) runs.push({ ...r, edges: cur, start, end: 'flat' }); cur = []; start = 'flat'; continue; }
      cur.push(e);
    }
    if (cur.length) runs.push({ ...r, edges: cur, start, end: r.end });
  }
  return { ...plan, runs };
}

let rseed = 1;
const rnd = () => { rseed = (rseed * 16807) % 2147483647; return (rseed % 10000) / 10000; };

/** An arch surround standing out of a wall face (z = 0, the room on +z):
 * jambs, imposts and a voussoir ring round an opening of half-width `half`. */
function archSurround(p: Parts, half: number, spring: number, rise: number): void {
  const tr = p.g('trim');
  for (const s of [-1, 1]) {
    box(tr, s > 0 ? half : -half - 0.6, 0, 0, s > 0 ? half + 0.6 : -half, spring, 0.22, 0.03, ['ny']);
    box(tr, s > 0 ? half - 0.1 : -half - 0.75, spring - 0.05, 0, s > 0 ? half + 0.75 : -half + 0.1, spring + 0.25, 0.35, 0.03);
  }
  const n = 15, pts = arc(0, spring, 0.12, half + 0.3, Math.PI, 0, n, rise + 0.3);
  const sides: V3[] = pts.map(([x, y]) => norm([x / (half + 0.3) ** 2, (y - spring) / (rise + 0.3) ** 2, 0]));
  for (let k = 0; k < n; k++) sweep(tr, [[-0.28, 0], [0.28, 0], [0.28, 0.22], [-0.28, 0.22]], [pts[k], pts[k + 1]], [sides[k], sides[k + 1]], [[0, 0, 1], [0, 0, 1]], { closedProfile: true, caps: true });
  box(tr, -0.3, spring + rise + 0.1, 0.0, 0.3, spring + rise + 0.75, 0.42, 0.03);
}

// ------------------------------------------------------------------ the zone
function buildBallroom(): void {
  rseed = 4242;
  const plan0: KitPlan = planGroups(LAYOUT, { corridorRun: 9 });
  const dp = dungeonPlan(ZONE);
  const stairG = plan0.cellGroup.get('0,-8')!, doorsG = plan0.cellGroup.get('0,3')!;
  const own = new Set([stairG, doorsG]);
  const wide = (gid: string, j: number, dz: number) => (e: Edge, r: Run) => r.group === gid && e.j === j && e.dz === dz && Math.abs(e.i) <= 1;
  const cuts = [wide('entry', -10, 1), wide('gallery', -6, -1), wide('foyer', 2, 1), wide('ballroom', 5, -1)];
  const plan = cutRuns(plan0, (e, r) => own.has(r.group) || cuts.some((f) => f(e, r)) || (r.group === 'rose' && e.i === 15 && e.j === 2 && e.dx === 1));
  const roomById = (id: string) => plan.byId.get(id)!;

  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'sb', glow, glowOccluders: false });
  const X = new Extras();
  const cold = new LightPools(scene, '#6fb4bc', 0.24, 'sb_coldpools');
  const so: ShellOpts = {
    style: THEME.arch, inset: INSET, outer: OUTER, rooms: ROOMS, corridorSconceEvery: 2, skipCeiling: ['wine', 'ballroom'],
    basins: Object.fromEntries([...FLOODED].map((id) => [id, Y])),
    windows: (e, g) => WINDOWS.has(edgeKey(g.id, e)) ? { kind: 'arch', half: WIN.half, sill: WIN.sill, spring: WIN.spring, rise: WIN.rise } : null,
  };

  // =================================================== 1. the shell
  for (const g of plan.groups) {
    if (own.has(g.id)) continue;
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    if (g.id === 'wine') {
      // the cellar: the shell's walls in the brick of the `dark` slot
      kit.build(g.id, (p) => {
        const q = new Parts(p.detail);
        const r = buildGroupShell(q, plan, g, so);
        if (p.detail) seats = r.seats;
        for (const [slot, geo] of q.slots) p.g(slot === 'wall' || slot === 'ceiling' || slot === 'trim' ? 'dark' : slot).absorb(geo);
      });
    } else kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing, size: 0.8 });
  }
  const shellPlan: KitPlan = { ...plan, runs: plan.runs.filter((r) => !own.has(r.group)) };
  for (const c of shellColliders(shellPlan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // ------------------------------------------------- the wall dress
  // Every plain wall bay: a verdigris marble dado and rail, and above it a
  // panel of silk damask in a gilt frame -- or a portrait, a mirror. Windows
  // get the lake behind their glass.
  type Dress = 'silk' | 'portrait' | 'mirror' | 'plain';
  const dress = (g: Group): ((e: Edge) => Dress) => {
    switch (g.id) {
      case 'gallery': return (e) => e.dz === 1 ? (Math.abs(e.i) <= 1 ? 'plain' : 'portrait') : 'silk';
      case 'foyer': return (e) => e.dz === -1 && Math.abs(e.i) <= 1 ? 'plain' : e.dz !== 0 ? 'mirror' : 'silk';
      case 'entry': return (e) => e.dx === 1 ? 'mirror' : e.dz === -1 && Math.abs(e.i) <= 1 ? 'plain' : 'silk';
      case 'ballroom': return (e) => e.dz === 1 && Math.abs(e.i) <= 2 ? 'plain' : e.dx !== 0 && [6, 8, 10, 12].includes(e.j) ? 'mirror' : e.dz === -1 && Math.abs(e.i) % 2 === 0 ? 'mirror' : 'silk';
      case 'supper': case 'cards': case 'music': return (e) => ((e.i + e.j) % 3 + 3) % 3 === 0 ? 'portrait' : 'silk';
      case 'choir': return (e) => e.dz === 1 && Math.abs(e.i - 12.5) < 1 ? 'plain' : 'silk';
      case 'wine': return () => 'plain';
      default: return () => 'silk';
    }
  };
  const portraits: { group: string; at: V3; yaw: number; w: number; h: number; k: number }[] = [];
  let pk = 0;
  for (const run of plan.runs) {
    const g = plan.byId.get(run.group)!;
    if (own.has(g.id) || g.kind !== 'room') continue;
    const h = wallH(g.id), f = runFrame(plan, run, INSET), L = f.len, choose = dress(g);
    kit.build(g.id, (p) => p.at(f.x, wallBase(g.id, run.y), f.z, f.yaw, () => {
      run.edges.forEach((e, k) => {
        if (e.kind === 'door') return;
        const x0 = -L / 2 + k * CELL, x1 = x0 + CELL, win = WINDOWS.has(edgeKey(g.id, e));
        const a = x0 + (k === 0 && run.start === 'inner' ? 0.1 : 0.55), b = x1 - (k === run.edges.length - 1 && run.end === 'inner' ? 0.1 : 0.55);
        if (g.id !== 'wine' && g.id !== 'cloak') {
          // the dado: a sunk marble band under a moulded rail (below the sills)
          box(p.g('floorTrim'), a, 0.5, 0.0, b, 1.02, 0.035, p.detail ? 0.01 : 0);
          if (p.detail) moulding(p.g('trim'), PROFILES.string(0.12, 0.07), [[a, 0], [b, 0]], 1.02, { caps: true });
        }
        if (win) return;
        const kind = choose(e);
        if (kind === 'plain' || h < 4.5) return;
        const top = Math.min(h - 1.0, 6.2), lo = 1.35;
        if (kind === 'mirror') { p.at((a + b) / 2, 1.2, 0, 0, () => S.archedMirror(p, Math.min(2.7, b - a - 0.2), Math.max(2.0, top - 1.2 - 1.45))); return; }
        // the silk panel and its gilt frame (the Rose Salon's is rose)
        if (g.id === 'rose') {
          if (p.detail) {
            const w0 = p.world(a + 0.08, lo + 0.08, 0.026), w1 = p.world(b - 0.08, lo + 0.08, 0.026), w2 = p.world(b - 0.08, top - 0.08, 0.026), w3 = p.world(a + 0.08, top - 0.08, 0.026);
            X.g('rose', 'rose').quad(w0, w1, w2, w3, sub(p.world(0, 0, 1), p.world(0, 0, 0)), [[a, lo], [b, lo], [b, top], [a, top]]);
          }
        } else box(p.g('accent'), a + 0.08, lo + 0.08, 0.0, b - 0.08, top - 0.08, 0.026, 0);
        const m = p.g('metal');
        box(m, a, lo, 0, b, lo + 0.08, 0.06, 0.01); box(m, a, top - 0.08, 0, b, top, 0.06, 0.01);
        box(m, a, lo + 0.08, 0, a + 0.08, top - 0.08, 0.06, 0.01); box(m, b - 0.08, lo + 0.08, 0, b, top - 0.08, 0.06, 0.01);
        if (kind === 'portrait' && p.detail) {
          const w = Math.min(2.2, b - a - 0.5), ph = Math.min(3.1, top - lo - 0.6), y0 = lo + (top - lo - ph) / 2 - 0.1, cx = (a + b) / 2;
          p.at(cx, y0, 0.03, 0, () => S.giltFrame(p, w, ph, 0.17));
          portraits.push({ group: g.id, at: p.world(cx, y0, 0.06), yaw: f.yaw, w: w - 0.34, h: ph - 0.34, k: pk++ % 8 });
        }
      });
    }));
  }
  // the canvases (one material, merged per room)
  for (const pt of portraits) {
    const g = X.g(pt.group, 'portrait'), cs = Math.cos(pt.yaw), sn = Math.sin(pt.yaw);
    // the viewer faces the wall; the picture's u runs to the viewer's right
    const right: V3 = [-cs, 0, sn], fw: V3 = [sn, 0, cs];
    const o = add(pt.at, [0, 0.17, 0]);
    const [u0, v0, u1, v1] = portraitUV(pt.k);
    const P = (x: number, y: number): V3 => add(o, add(mul(right, x), [0, y, 0]));
    g.quad(P(-pt.w / 2, 0), P(pt.w / 2, 0), P(pt.w / 2, pt.h), P(-pt.w / 2, pt.h), fw, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  // the lake behind every window: a pane on the wall's outer face, its cold light
  for (const run of plan.runs) for (const e of run.edges) {
    if (!WINDOWS.has(edgeKey(run.group, e))) continue;
    const n: V3 = [e.dx, 0, e.dz], t: V3 = [-e.dz, 0, e.dx], c: V3 = [e.x + e.dx * (OUTER - 0.03), wallBase(run.group, e.y), e.z + e.dz * (OUTER - 0.03)];
    const pts: V3[] = [add(c, add(mul(t, -WIN.half - 0.05), [0, WIN.sill - 0.05, 0])), add(c, add(mul(t, WIN.half + 0.05), [0, WIN.sill - 0.05, 0]))];
    for (const [x, yy] of arc(0, WIN.spring, 0, WIN.half + 0.05, 0, Math.PI, 12, WIN.rise + 0.05)) pts.push(add(c, add(mul(t, x), [0, yy, 0])));
    const lg = X.g('*', 'lake');
    lg.shade = () => 1;
    lg.poly(pts, mul(n, -1));
    cold.floor(run.group, e.x - e.dx * 3.2, poolY(run.group, e.y), e.z - e.dz * 3.2, 3.0);
    cold.wall(run.group, e.x - e.dx * (INSET + 0.05), wallBase(run.group, e.y) + 2.6, e.z - e.dz * (INSET + 0.05), 1.5, -e.dx, -e.dz);
  }

  // ------------------------------------------------- fittings
  /** A tilted chandelier hanging from (x, ceil, z): its flames, its lamp slot,
   * a warm pool on the floor under it (the floor at floorY). */
  const chand: Chand = (group, x, ceil, z, o, floorY, lamp = true, lean = LEAN) => {
    let seats: V3[] = [], hubAt: V3 = [x, ceil - o.drop, z];
    kit.build(group, (p) => p.at(x, ceil, z, 0, () => {
      let local: V3[] = [];
      const map = S.mapped(p, S.rotX(lean), [0, 0, 0], (q) => { local = S.chandelier(q, o); });
      if (p.detail) { seats = local.map(map); hubAt = map([0, -o.drop, 0]); }
    }));
    for (const s of seats) kit.flames.add(group, s[0], s[1], s[2], 0.1, 0.2, true);
    if (lamp) kit.lamps.add({ group, x: hubAt[0], y: hubAt[1] - 0.3, z: hubAt[2] });
    kit.pools.floor(group, hubAt[0], floorY, hubAt[2], Math.min(7, o.r * 2.6 + 1.5));
  };
  const torch: Torch = (group, x, y, z, h = 1.9, lamp = false) => {
    let seats: V3[] = [];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = S.torchere(p, h); if (p.detail) seats = s.map((v) => p.world(v[0], v[1], v[2])); }));
    for (const s of seats) kit.flames.add(group, s[0], s[1], s[2], 0.1, 0.2, true);
    if (lamp) kit.lamps.add({ group, x, y: y + h + 0.3, z });
    kit.pools.floor(group, x, y, z, 2.4);
    buildApi.addCircleCollider(x, z, 0.38);
  };
  const urn = (group: string, x: number, z: number, y: number) => {
    kit.build(group, (p) => p.at(x, y, z, 0, () => S.urnPedestal(p)));
    buildApi.addBoxCollider(x, z, 0.4, 0.4, 0, y + 2.2, y - 0.5);
  };
  /** Standing water over a flooded room's clear rectangle. ONLY in a basin
   * room (FLOODED, `basins` in the shell options) and only at FLOOD_Y: water
   * must lie below every threshold, held by the kerb at every edge, never
   * level with a doorway or under a wall (DUNGEONS.md "Water in a dungeon").
   * Water seeping onto a dry floor is a `puddle`, not a sheet. */
  const water = (group: string, x0: number, z0: number, x1: number, z1: number, y: number) => {
    if (!FLOODED.has(group) || y !== FLOOD_Y) throw new Error(`sunkenballroom: water in ${group} at ${y} is not a basin's (DUNGEONS.md "Water in a dungeon")`);
    X.g(group, 'water').quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
  };
  /** Water seeped onto a dry floor: a film with a ragged edge hugging the
   * floor (a few millimetres proud, never a sheet with a height of its own). */
  const puddle = (group: string, cx: number, cz: number, rx: number, rz: number, y: number) => {
    const g = X.g(group, 'water'), n = 22, c: V3 = [cx, y + 0.012, cz];
    const rim = Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2, j = 0.7 + rnd() * 0.45; return [cx + Math.cos(a) * rx * j, y + 0.012, cz + Math.sin(a) * rz * j] as V3; });
    for (let k = 0; k < n; k++) g.poly([c, rim[(k + 1) % n], rim[k]], [0, 1, 0]);
  };
  const silt = (group: string, cx: number, cz: number, rx: number, rz: number, y: number, hgt = 0.18) => {
    const g = X.g(group, 'silt'), n = 18, rings = 4;
    const jitter = Array.from({ length: n }, () => 0.75 + rnd() * 0.5);
    const P = (k: number, r: number): V3 => { const a = k / n * Math.PI * 2, j = 1 + (jitter[k % n] - 1) * r; return [cx + Math.cos(a) * rx * r * j, y + 0.01 + hgt * (1 - r * r), cz + Math.sin(a) * rz * r * j]; };
    for (let r = 0; r < rings; r++) for (let k = 0; k < n; k++) {
      const r0 = r / rings, r1 = (r + 1) / rings;
      g.quad(P(k, r0), P(k + 1, r0), P(k + 1, r1), P(k, r1), [0, 1, 0]);
    }
  };
  /** The light through the water drawn on a flooded floor (the caustic
   * shader), strongest at (cx, cz), gone at the ellipse's rim. MEASURED (first
   * look): standing water with nothing moving on it read as a tinted floor. */
  const caustics = (group: string, cx: number, cz: number, rx: number, rz: number, y: number, k = 0.9) => {
    const cg = X.g(group, 'caustic'), rings = 5, seg = 32;
    cg.shade = (x, _y, z) => { const r = Math.hypot((x - cx) / rx, (z - cz) / rz); return Math.max(0, 1 - r * r) * k; };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const r0 = j / rings, r1 = (j + 1) / rings, a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const P = (a: number, r: number): V3 => [cx + Math.cos(a) * rx * r, y + 0.015, cz + Math.sin(a) * rz * r];
      cg.quad(P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), [0, 1, 0]);
    }
  };
  /** Masonry tumbled over the floor in a fan from a wall (local frame: the
   * wall face on z = 0, the room on +z). */
  const tumble = (p: Parts, count: number, spread: number, hz: number) => {
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI, r = rnd() * spread, bx = Math.cos(a) * r * 1.2, bz = 0.35 + Math.sin(a) * r * hz;
      const sz = 0.3 + rnd() * 0.5, slot = rnd() < 0.7 ? 'trim' : 'wall';
      S.mapped(p, S.mulM(S.rotY(rnd() * 3), S.mulM(S.rotX((rnd() - 0.5) * 0.8), S.rotZ((rnd() - 0.5) * 0.8))), [bx, sz * 0.3 + Math.max(0, 0.9 - r * 0.35), bz], (q) => box(q.g(slot), -sz, -sz * 0.45, -sz * 0.6, sz, sz * 0.45, sz * 0.6, 0.05));
    }
  };

  // =================================================== 2. THE BALLROOM STAIR (entry)
  const entry = roomById('entry');
  // the lake doors the household left by, shut, the lake seeping under them
  kit.build('entry', (p) => p.at(0, 0, entry.z0 + INSET, 0, () => {
    archSurround(p, 2.6, 3.6, 2.4);
    const t = p.g('timber'), m = p.g('metal');
    box(t, -2.6, 0, 0.0, -0.02, 3.6, 0.2, 0.03, ['nz']); box(t, 0.02, 0, 0.0, 2.6, 3.6, 0.2, 0.03, ['nz']);
    t.poly(arc(0, 3.6, 0.1, 2.6, 0, Math.PI, 12, 2.4).map(([x, y]) => [x, y, 0.1] as V3), [0, 0, 1]);
    if (p.detail) {
      for (const x of [-1.95, -0.65, 0.65, 1.95]) for (const y of [0.4, 1.9]) box(t, x - 0.5, y, 0.19, x + 0.5, y + 1.3, 0.25, 0.02);
      for (const y of [0.9, 2.9]) box(m, -2.55, y, 0.24, 2.55, y + 0.1, 0.28, 0.01);
      for (let k = 0; k < 9; k++) beam(m, [-2.4 + k * 0.6, 3.6, 0.12], [Math.cos(Math.PI * (1 - k / 8)) * 2.4, 3.6 + Math.sin(Math.PI * (1 - k / 8)) * 2.2, 0.12], 0.05, 0.05, 0.01);
      for (const x of [-0.25, 0.25]) lathe(m, [[0.0, 1.85], [0.09, 1.9], [0.1, 2.0], [0.0, 2.05]], 8, x, 0.3);
    }
  }));
  silt('entry', 0, entry.z0 + INSET + 1.4, 3.2, 1.3, 0, 0.06);
  puddle('entry', 0, entry.z0 + INSET + 1.3, 2.6, 1.2, 0);
  for (const s of [-1, 1]) {
    urn('entry', s * 7.4, entry.z0 + 1.7, 0);
    torch('entry', s * 6.8, 0, -40.6, 1.9, true);
  }
  chand('entry', 0, 7.5, -46.5, { r: 1.5, drop: 2.6, tiers: 2, arms: 10 }, 0, false);
  // the opening onto the Grand Stair
  kit.build('entry', (p) => p.at(0, 0, -38 - INSET, Math.PI, () => doorway(p, { h: 7, thick: THICK, half: 6 - INSET, spring: 3.4, rise: 2.6, kind: 'arch', edge: 6 })));

  // ------------------------------------------------- the Cloakroom
  const cloakR = roomById('cloak'), CLZ = (cloakR.z0 + cloakR.z1) / 2, CLX = (cloakR.x0 + cloakR.x1) / 2;
  // MEASURED (first audit): a rail along the east wall shut the room's door
  const rails: [number, number, number, number][] = [
    [cloakR.x0 + INSET + 0.55, CLZ, Math.PI / 2, 12.6],          // west wall, along z
    [CLX - 0.4, cloakR.z1 - INSET - 0.55, Math.PI, 6.4],          // north wall, along x
    [CLX - 0.4, cloakR.z0 + INSET + 0.55, 0, 6.4],                // south wall
  ];
  for (const [x, z, yaw, len] of rails) {
    kit.build('cloak', (p) => p.at(x, 0, z, yaw, () => {
      const t = p.g('timber'), m = p.g('metal');
      // in the rail's frame: x along the rail, the room on +z
      for (const u of [-len / 2, 0, len / 2]) lathe(t, [[0.05, 0], [0.07, 0.1], [0.04, 1.8], [0.06, 2.05]], 8, u, 0);
      beam(m, [-len / 2, 1.95, 0], [len / 2, 1.95, 0], 0.05, 0.05, 0.01);
      const n = Math.round(len / 0.78);
      for (let k = 0; k < n; k++) {
        const u = -len / 2 + 0.45 + k * (len - 0.9) / (n - 1);
        p.at(u, 1.95, 0, Math.PI / 2 + ((k * 7) % 5 - 2) * 0.06, () => {
          beam(t, [-0.22, -0.06, 0], [0.22, -0.06, 0], 0.03, 0.04, 0.01);
          S.cloak(p, 1.2 + (k % 4) * 0.09, k);
        });
      }
    }));
    const along = Math.abs(Math.sin(yaw)) > 0.5;
    buildApi.addBoxCollider(x, z, along ? 0.45 : len / 2, along ? len / 2 : 0.45, 0, 2.2, -0.5);
  }
  // the attendants' counter across the room, the tickets still on it
  kit.build('cloak', (p) => p.at(CLX, 0, -42.5, 0, () => {
    const t = p.g('timber');
    box(t, -2.4, 0, -0.35, 2.4, 1.0, 0.35, 0.03, ['ny']);
    box(p.g('trim'), -2.5, 1.0, -0.42, 2.5, 1.08, 0.42, 0.02);
    if (p.detail) {
      for (let x = -1.95; x < 2.0; x += 1.3) box(t, x - 0.5, 0.15, -0.38, x + 0.5, 0.85, -0.35, 0.01);
      for (let k = 0; k < 10; k++) box(p.g('ceiling'), -2.0 + k * 0.4, 1.08, -0.1 + (k % 3) * 0.08, -2.0 + k * 0.4 + 0.08, 1.085, -0.1 + (k % 3) * 0.08 + 0.12, 0);
    }
  }));
  buildApi.addBoxCollider(CLX, -42.5, 2.5, 0.42, 0, 1.2, -0.5);
  chand('cloak', CLX, 5, -48.5, { r: 0.8, drop: 1.6, tiers: 1, arms: 6 }, 0, false);

  // =================================================== 3. THE GRAND STAIR
  // 12 m wide, 3 m down over 12 m, a sloping ribbed vault over it (the level
  // build sheared along the slope), balustrades, newel lamps, the runner.
  const SLOPE = 3 / 12;
  kit.build(stairG, (p) => {
    p.at(0, Y, -26, Math.PI, () => {
      stairFlight(p, { w: 2 * (6 - INSET) - 0.5, run: 12, rise: 3, steps: 18, rails: 'both', railHeight: 0.95 });
      // the runner: a strip of silk carpet on every tread and riser
      if (p.detail) for (let i = 1; i <= 18; i++) {
        const z0 = (i - 1) * 12 / 18, z1 = i * 12 / 18, yy = i * 3 / 18;
        box(p.g('accent'), -1.5, yy, z0 - 0.01, 1.5, yy + 0.012, z1, 0);
        box(p.g('accent'), -1.5, yy - 3 / 18, z0 - 0.012, 1.5, yy, z0, 0);
      }
      // the hall: walls and vault, built level and sheared onto the slope
      S.mapped(p, [1, 0, 0, 0, 1, SLOPE, 0, 0, 1], [0, 0, 0], (q) => {
        for (const s of [-1, 1]) q.at(s * (6 - INSET), 0, 6, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          wallSegment(q, { x0: -6, x1: 6, h: 3.4, thick: THICK, plinth: true, cornice: true });
          for (const x of [-4, 0, 4]) pilaster(q, { x, h: 3.4 });
        });
        barrelVault(q, { span: 2 * (6 - INSET), z0: 0, z1: 12, spring: 3.4, rise: 2.6, ribEvery: 3, ends: [false, false] });
      });
    });
  });
  for (const s of [-1, 1]) buildApi.addBoxCollider(s * (6 - INSET + 0.6), -32, 0.6, 6.2, 0, 8, -4);
  // newel lamps at the head and foot of both balustrades
  for (const [x, y, z] of [[-4.95, 0, -37.7], [4.95, 0, -37.7], [-4.95, Y, -26.4], [4.95, Y, -26.4]] as V3[]) {
    let seat: V3 = [x, y + 1.85, z];
    kit.build(stairG, (p) => p.at(x, y, z, 0, () => {
      lathe(p.g('metal'), [[0.12, 1.15], [0.06, 1.3], [0.04, 1.55], [0.09, 1.62]], p.detail ? 10 : 6, 0, 0);
      lathe(p.g('emit'), [[0, 1.6], [0.13, 1.7], [0.14, 1.82], [0.08, 1.92], [0, 1.95]], 10, 0, 0);
      if (p.detail) seat = p.world(0, 1.85, 0);
    }));
    kit.flames.add(stairG, seat[0], seat[1], seat[2], 0.16, 0.26, true);
    kit.pools.floor(stairG, x * 0.85, y, z + (z < -30 ? 1.4 : -1.4), 2.6);
  }
  kit.lamps.add({ group: stairG, x: 0, y: 2.2, z: -31 });
  // the gallery's side of the opening
  kit.build('gallery', (p) => p.at(0, Y, -26 + INSET, 0, () => doorway(p, { h: 7, thick: THICK, half: 6 - INSET, spring: 3.4, rise: 2.6, kind: 'arch', edge: 6 })));

  // =================================================== 4. THE LONG PORTRAIT GALLERY
  const gal = roomById('gallery'), GZ = (gal.z0 + gal.z1) / 2;
  // from the crown of the barrel (wall 7 + rise 7)
  for (const x of [-21, -7, 7, 21]) chand('gallery', x, Y + 7 + 6.9, GZ, { r: 1.7, drop: 6.2, tiers: 2, arms: 10 }, Y, Math.abs(x) < 10);
  // the runner down the gallery's length
  kit.build('gallery', (p) => {
    box(p.g('accent'), gal.x0 + 2.2, Y, GZ - 1.5, gal.x1 - 2.2, Y + 0.012, GZ + 1.5, 0);
    if (p.detail) for (const z of [GZ - 1.5, GZ + 1.4]) box(p.g('metal'), gal.x0 + 2.2, Y, z, gal.x1 - 2.2, Y + 0.016, z + 0.1, 0);
  });
  for (const x of [-20, -8, 8, 20]) urn('gallery', x, gal.z0 + INSET + 0.6, Y);
  // the fallen grand doors: the arch to the ballroom, choked
  const blocked = (group: string, z: number, yaw: number) => {
    kit.build(group, (p) => p.at(0, Y, z, yaw, () => {
      const half = 3.4, spring = 3.8, rise = 3.0;
      archSurround(p, half, spring, rise);
      // the infill: blocks fallen and wedged in the opening
      for (let y = 0.0; y < spring + rise - 0.3; y += 0.55) {
        const w = Math.sqrt(Math.max(0, 1 - Math.max(0, (y + 0.3 - spring) / rise) ** 2)) * half;
        for (let x = -w + 0.1; x < w - 0.2; x += 0.6 + rnd() * 0.5) {
          const bw = 0.5 + rnd() * 0.5, slot = rnd() < 0.7 ? 'trim' : 'wall';
          S.mapped(p, S.mulM(S.rotY((rnd() - 0.5) * 0.4), S.rotX((rnd() - 0.5) * 0.3)), [x + bw / 2, y + 0.25, 0.18 + rnd() * 0.25], (q) => box(q.g(slot), -bw / 2, -0.27, -0.25, bw / 2, 0.27, 0.25, 0.05));
        }
      }
      tumble(p, p.detail ? 22 : 8, 3.6, 0.7);
    }));
    // MEASURED (audit): deeper than 1.2 m it filled the cell in front, which the walk could not reach
    buildApi.addBoxCollider(0, z + Math.cos(yaw) * 0.6, 4.0, 0.6, 0, Y + 2, Y - 1);
    silt(group, 0, z + Math.cos(yaw) * 2.6, 6.2, 3.2, Y, 0.28);
    // the seep spreading past the silt's toe (under the mound it was hidden)
    puddle(group, 0, z + Math.cos(yaw) * 5.6, 7.6, 1.9, Y);
  };
  blocked('gallery', gal.z1 - INSET, Math.PI);

  // =================================================== 5. THE WEST WING
  // --- the Supper Salon: the dinner nobody ate, still laid
  const sup = roomById('supper'), SX = -52, SZ = (sup.z0 + sup.z1) / 2;
  for (const z of [-23.4, -20, -16.6]) kit.props.place({ file: 'dungeon/table_long_tablecloth_decorated_A.glb', group: 'supper', x: SX, y: Y, z, yaw: 0, scale: 0.8 });
  buildApi.addBoxCollider(SX, SZ, 0.9, 5.2, 0, Y + 1.1, Y - 0.5);
  for (let k = 0; k < 9; k++) {
    const z = -24.6 + k * 1.15;
    for (const s of [-1, 1]) kit.build('supper', (p) => p.at(SX + s * 1.45, Y, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => S.salonChair(p)));
  }
  for (const s of [-1, 1]) kit.build('supper', (p) => p.at(SX, Y, SZ + s * 6.3, s < 0 ? 0 : Math.PI, () => S.salonChair(p)));
  kit.build('supper', (p) => p.at(sup.x0 + INSET, Y, -20, Math.PI / 2, () => S.sideboard(p, 2.6)));
  buildApi.addBoxCollider(sup.x0 + INSET + 0.3, -20, 0.35, 1.35, 0, Y + 1.2, Y - 0.5);
  kit.props.place({ file: 'dungeon/plate_stack.glb', group: 'supper', x: sup.x0 + INSET + 0.3, y: Y + 0.95, z: -20.6, yaw: 0.3, scale: 0.5 });
  kit.props.place({ file: 'props/CandleStick_Triple.gltf', group: 'supper', x: sup.x0 + INSET + 0.3, y: Y + 0.95, z: -19.2, yaw: Math.PI / 2, scale: 1.4 });
  // the stewards' dropped trays by the door
  kit.props.place({ file: 'dungeon/plate.glb', group: 'supper', x: -41.2, y: Y, z: -23.8, yaw: 0.4, scale: 0.55 });
  kit.props.place({ file: 'props/Vase_Rubble_Medium.gltf', group: 'supper', x: -40.6, y: Y, z: -16.4, yaw: 1.1, scale: 1 });
  for (const z of [-23.5, -16.5]) chand('supper', SX, Y + 6.5 + 0.5, z, { r: 1.1, drop: 2.2, tiers: 2, arms: 8 }, Y, z < -20);
  silt('supper', sup.x0 + 3, sup.z1 - 3, 3, 2, Y, 0.12);

  // --- the Wine Vault: two brick barrel vaults on a spine of piers, knee-deep
  const wine = roomById('wine'), WZ = 8, WS = 4.2;
  kit.build('wine', (p) => {
    const d = p.g('dark'), tr = p.g('trim');
    const xa = wine.x0 + INSET, xb = wine.x1 - INSET, za = wine.z0 + INSET, zb = wine.z1 - INSET;
    // MEASURED (first audit): built in scratch parts, the vaults need the
    // scratch's own placement -- p.at does not reach a new Parts
    for (const [z0, z1] of [[za, WZ - 0.45], [WZ + 0.45, zb]]) {
      const q = new Parts(p.detail);
      q.at((xa + xb) / 2, Y, (z0 + z1) / 2, Math.PI / 2, () => barrelVault(q, { span: z1 - z0, z0: -(xb - xa) / 2, z1: (xb - xa) / 2, spring: WS, rise: 2.6, ribEvery: 3, ends: [true, true] }));
      for (const [slot, geo] of q.slots) p.g(slot === 'ceiling' || slot === 'wall' ? 'dark' : slot).absorb(geo);
    }
    // the spine: piers and the arches between them, walled up to the crowns
    const piers = [-56, -50, -44];
    for (const x of piers) {
      box(tr, x - 0.45, BASIN, WZ - 0.45, x + 0.45, Y + WS, WZ + 0.45, p.detail ? 0.04 : 0, ['ny']);
      // the pier's base, coped above the water like the basin's kerb
      box(tr, x - 0.62, BASIN, WZ - 0.62, x + 0.62, Y - 0.09, WZ + 0.62, 0, ['ny']);
      box(tr, x - 0.68, Y - 0.11, WZ - 0.68, x + 0.68, Y, WZ + 0.68, p.detail ? 0.025 : 0, ['ny']);
    }
    const stops = [xa, ...piers.flatMap((x) => [x - 0.45, x + 0.45]), xb];
    for (let k = 0; k < stops.length; k += 2) {
      const a = stops[k], b = stops[k + 1], half = (b - a) / 2, mx = (a + b) / 2;
      p.at(mx, Y, WZ, 0, () => {
        const pts = arc(0, WS - 1.2, 0, half, Math.PI, 0, 12, Math.min(half, 1.2));
        for (let i = 0; i < 12; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          d.quad([x0, y0, -0.45], [x1, y1, -0.45], [x1, y1, 0.45], [x0, y0, 0.45], [0, -1, 0]);
          for (const s of [-1, 1]) d.poly([[x0, y0, s * 0.45], [x1, y1, s * 0.45], [x1, WS + 2.7, s * 0.45], [x0, WS + 2.7, s * 0.45]], [0, 0, s]);
        }
      });
    }
  });
  for (const x of [-56, -50, -44]) buildApi.addBoxCollider(x, WZ, 0.68, 0.68, 0, Y + 4, BASIN - 1);
  water('wine', wine.x0 + INSET, wine.z0 + INSET, wine.x1 - INSET, wine.z1 - INSET, FLOOD_Y);
  // casks racked along the walls, bottles, a fallen stack
  // MEASURED (first audit): one long collider per wall shut both cellar doors
  for (let x = -59.4; x <= -40; x += 2.6) {
    // standing in the flood, clear of the basin's kerb
    const zn = wine.z1 - INSET - 1.05, zs = wine.z0 + INSET + 1.05;
    if (Math.abs(x + 52) > 2.2) { kit.props.place({ file: 'dungeon/keg.glb', group: 'wine', x, y: BASIN, z: zn, yaw: 0, scale: 0.62 }); buildApi.addBoxCollider(x, zn, 0.65, 0.65, 0, Y + 1.4, BASIN - 0.5); }
    // MEASURED (flood audit): a cask in the south-west corner, pushed off the kerb, shut the corner cell
    if (Math.abs(x + 48) > 2.2 && x < -41 && x > -59) { kit.props.place({ file: 'dungeon/keg.glb', group: 'wine', x, y: BASIN, z: zs, yaw: Math.PI, scale: 0.62 }); buildApi.addBoxCollider(x, zs, 0.65, 0.65, 0, Y + 1.4, BASIN - 0.5); }
  }
  for (const z of [1.6, 5.2, 10.8, 14.4]) kit.props.place({ file: 'props/Shelf_Small_Bottles.gltf', group: 'wine', x: wine.x0 + INSET + 0.18, y: Y + 1.2, z, yaw: Math.PI / 2, scale: 1.3 });
  kit.props.place({ file: 'dungeon/barrel_small_stack.glb', group: 'wine', x: -40.8, y: BASIN, z: 13.4, yaw: -Math.PI / 2, scale: 0.8 });
  kit.props.place({ file: 'dungeon/barrel_large.glb', group: 'wine', x: -45.5, y: BASIN, z: 1.3, yaw: 0.6, scale: 0.55 });
  silt('wine', -58, 12, 3.2, 3.6, BASIN, 0.22);
  // the light through the water on the drowned floor
  caustics('wine', -50, 8, 10.5, 8.5, BASIN, 0.45);

  // --- the Musicians' Antechamber
  const mus = roomById('music'), MZ = (mus.z0 + mus.z1) / 2;
  kit.build('music', (p) => p.at(-57.2, Y, 39, 0.4, () => S.harp(p)));
  buildApi.addCircleCollider(-57.2, 39, 0.6);
  kit.build('music', (p) => p.at(-46.6, Y, 37.2, Math.PI * 0.85, () => S.harpsichord(p)));
  buildApi.addBoxCollider(-46.4, 38.0, 1.1, 1.1, Math.PI * 0.85, Y + 1.1, Y - 0.5);
  {
    const ccx = -52, ccz = 36.5;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (1.12 + k * 0.152), x = ccx + Math.cos(a) * 3.6, z = ccz + Math.sin(a) * 3.0;
      const yaw = Math.atan2(ccx - x, ccz - z);
      kit.build('music', (p) => p.at(x, Y, z, yaw, () => S.salonChair(p)));
      kit.build('music', (p) => p.at(x + Math.sin(yaw) * 0.85, Y, z + Math.cos(yaw) * 0.85, yaw + Math.PI, () => S.musicStand(p)));
    }
  }
  kit.build('music', (p) => p.at(-44.4, Y, 28.6, 0.5, () => S.instrumentCase(p, 1.1)));
  kit.build('music', (p) => p.at(-59.5, Y, 28.4, 2.2, () => S.instrumentCase(p, 1.4)));
  chand('music', -52, Y + 6 + 0.5, MZ, { r: 1.2, drop: 2.4, tiers: 2, arms: 8 }, Y);
  kit.props.place({ file: 'props/Rug_Round.gltf', group: 'music', x: -52, y: Y + 0.005, z: MZ, yaw: 0, scale: 2.4 });

  // =================================================== 6. THE EAST WING
  // --- the Card Salon: the game still on the tables, the dance cards on the sideboard
  const crd = roomById('cards'), CZ = (crd.z0 + crd.z1) / 2;
  for (const [x, z, sd] of [[41.8, -26.2, 3], [54.2, -26.2, 5], [41.8, -13.8, 7]] as [number, number, number][]) {
    kit.build('cards', (p) => p.at(x, Y, z, sd, () => { S.cardTable(p); S.cards(p, 0.79, sd); }));
    buildApi.addCircleCollider(x, z, 0.75);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + sd, ex = x + Math.cos(a) * 1.05, ez = z + Math.sin(a) * 1.05;
      kit.build('cards', (p) => p.at(ex, Y, ez, Math.atan2(x - ex, z - ez), () => S.salonChair(p)));
    }
  }
  kit.build('cards', (p) => p.at(43.4, Y, crd.z1 - INSET, Math.PI, () => S.sideboard(p, 2.6)));
  buildApi.addBoxCollider(43.4, crd.z1 - INSET - 0.3, 1.35, 0.35, 0, Y + 1.2, Y - 0.5);
  kit.props.place({ file: 'props/CandleStick_Triple.gltf', group: 'cards', x: 42.6, y: Y + 0.95, z: crd.z1 - INSET - 0.3, yaw: 0, scale: 1.4 });
  chand('cards', 48, Y + 6.5 + 0.5, CZ, { r: 1.3, drop: 2.4, tiers: 2, arms: 8 }, Y);

  // --- the Rose Salon: the lake has broken the east wall
  const rose = roomById('rose'), RZ = (rose.z0 + rose.z1) / 2;
  water('rose', rose.x0 + INSET, rose.z0 + INSET, rose.x1 - INSET, rose.z1 - INSET, FLOOD_Y);
  const BX = rose.x1 - INSET;          // the east wall's inner face
  kit.build('rose', (p) => p.at(BX, Y, RZ, -Math.PI / 2, () => {
    // the wall across the breached cell (local x along the wall, -2..2), round the hole
    const w = p.g('wall');
    box(w, -2.05, 0, -THICK, 2.05, 1.4, 0, 0, ['ny']);
    box(w, -2.05, 5.6, -THICK, 2.05, 7, 0, 0, ['ny']);
    for (let y = 1.4; y < 5.6; y += 0.5) {
      const inL = 0.25 + rnd() * 0.5, inR = 0.25 + rnd() * 0.5;
      box(w, -2.05, y, -THICK, -2.05 + inL + 0.3, y + 0.5, 0, 0.03);
      box(w, 2.05 - inR - 0.3, y, -THICK, 2.05, y + 0.5, 0, 0.03);
    }
    // the masonry broken out round the lip
    for (let k = 0; k < (p.detail ? 14 : 5); k++) {
      const a = k / 14 * Math.PI * 2, rr = 1.6 + rnd() * 0.4, bx = Math.cos(a) * rr, by = 3.5 + Math.sin(a) * 2.1;
      S.mapped(p, S.mulM(S.rotZ(rnd() * 2), S.rotX(rnd() - 0.5)), [bx, by, -0.2 - rnd() * 0.6], (q) => box(q.g(rnd() < 0.5 ? 'trim' : 'wall'), -0.3, -0.22, -0.3, 0.3, 0.22, 0.3, 0.04));
    }
    if (p.detail) moulding(p.g('trim'), PROFILES.cornice(0.62, 0.36), [[-2.05, 0], [2.05, 0]], 7 - 0.62, { caps: true });
    // the basin's kerb across the cut bay, the lake pouring over it
    const tr = p.g('trim'), d = BASIN - Y;
    box(tr, -2.05, d, -0.05, 2.05, -0.09, FLOOD.kerb, 0, ['ny']);
    box(tr, -2.05, -0.11, -0.05, 2.05, 0, FLOOD.kerb + 0.07, p.detail ? 0.025 : 0, ['ny']);
  }));
  // the masonry fanned over the drowned floor of the obstacle cell
  kit.build('rose', (p) => p.at(BX, BASIN, RZ, -Math.PI / 2, () => tumble(p, p.detail ? 26 : 9, 3.4, 0.95)));
  buildApi.addBoxCollider(BX - 1.8, RZ, 2.0, 2.2, 0, Y + 3, Y - 1);
  buildApi.addBoxCollider(BX + 0.6, RZ, 0.6, 2.2, 0, Y + 9, Y - 1);
  // the lake's silt banked up under the breach, breaking the surface
  silt('rose', BX - 2.6, RZ, 3.2, 3.6, BASIN + 0.1, 0.62);
  caustics('rose', BX - 6, RZ, 9, 7.5, BASIN, 1.0);
  {
    // the lake beyond the hole
    const lg = X.g('*', 'lake'); lg.shade = () => 1;
    lg.quad([BX + 1.6, Y + 1.0, RZ - 2.4], [BX + 1.6, Y + 1.0, RZ + 2.4], [BX + 1.6, Y + 6.2, RZ + 2.4], [BX + 1.6, Y + 6.2, RZ - 2.4], [-1, 0, 0]);
    for (const zz of [RZ - 2.05, RZ + 2.05]) lg.quad([BX, Y + 1.0, zz], [BX + 1.6, Y + 1.0, zz], [BX + 1.6, Y + 6.2, zz], [BX, Y + 6.2, zz], [0, 0, zz < RZ ? 1 : -1]);
    // the water pouring through: two sheets falling from the lip to the pool
    const fg = X.g('rose', 'fall');
    for (const [half, push, top] of [[1.1, 0, 2.9], [0.6, 0.3, 3.5]] as [number, number, number][]) {
      fg.shade = (_x, y) => Math.min(1, 0.4 + (y - Y) / 4);
      const n = 10, prof: V3[] = [];
      const foot = FLOOD_Y - Y;
      for (let k = 0; k <= n; k++) { const u = k / n; prof.push([BX + 0.4 - push - u * u * 2.6, Y + foot + (1 - u) * (top - foot), 0]); }
      for (let k = 0; k < n; k++) {
        const a = prof[k], b = prof[k + 1], va = 1 - k / n, vb = 1 - (k + 1) / n;
        fg.quad([a[0], a[1], RZ - half], [a[0], a[1], RZ + half], [b[0], b[1], RZ + half], [b[0], b[1], RZ - half], [-1, 0.3, 0], [[0, va], [1, va], [1, vb], [0, vb]]);
      }
    }
    // cold light leaning in through the breach
    const sg = X.g('rose', 'shaft');
    sg.shade = (_x, y) => Math.max(0, Math.min(1, (y - Y) / 6)) * 0.5;
    sg.quad([BX + 0.5, Y + 5.6, RZ - 1.4], [BX + 0.5, Y + 5.6, RZ + 1.4], [BX - 7.5, FLOOD_Y, RZ + 2.6], [BX - 7.5, FLOOD_Y, RZ - 2.6], [-0.5, -1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    cold.floor('rose', BX - 5, FLOOD_Y, RZ, 4.5);
    cold.floor('rose', BX - 1.5, FLOOD_Y, RZ, 3.0);
    kit.lamps.add({ group: 'rose', x: BX - 3, y: Y + 4, z: RZ });
  }
  // the chandelier the undertow pulled down, half under the water; one still hanging
  kit.build('rose', (p) => p.at(43.5, BASIN + 0.25, 14.2, 0.6, () => { S.mapped(p, S.rotZ(1.35), [0, 0, 0], (q) => { S.chandelier(q, { r: 1.4, drop: 0.2, tiers: 2, arms: 8 }); }); }));
  buildApi.addCircleCollider(43.5, 14.2, 1.1);
  chand('rose', 50, Y + 7 + 3.6, RZ, { r: 1.4, drop: 3.9, tiers: 2, arms: 8 }, FLOOD_Y, true, LEAN + 0.12);

  // --- the Choristers' Gallery: the household chapel's choir and its shrine
  const ch = roomById('choir'), HZ = (ch.z0 + ch.z1) / 2;
  kit.build('choir', (p) => p.at(ch.x0 + INSET, Y, HZ - 1, Math.PI / 2, () => {
    S.choirStall(p, 12);
    if (p.detail) for (let z = -5.5; z <= 5.5; z += 2.2) p.at(z, 0.97, 0.95, 0, () => box(p.g('ceiling'), -0.2, 0, -0.12, 0.2, 0.02, 0.12, 0.004));
  }));
  buildApi.addBoxCollider(ch.x0 + INSET + 0.6, HZ - 1, 0.6, 6.0, 0, Y + 2.6, Y - 0.5);
  // the shrine at the head of the chapel: an altar, the household's picture over it
  const AZ = ch.z1 - INSET;
  kit.build('choir', (p) => p.at(50, Y, AZ, Math.PI, () => {
    const tr = p.g('trim'), m = p.g('metal');
    box(tr, -2.6, 0, 0.0, 2.6, 0.3, 2.2, 0.03, ['ny']);
    box(tr, -1.8, 0.3, 0.3, 1.8, 1.25, 1.3, 0.03);
    box(tr, -1.95, 1.25, 0.2, 1.95, 1.37, 1.42, 0.02);
    if (p.detail) {
      box(p.g('accent'), -1.6, 0.42, 1.3, 1.6, 1.15, 1.33, 0);
      for (const x of [-1.62, 1.62]) box(m, x - 0.06, 0.4, 1.28, x + 0.06, 1.18, 1.36, 0.01);
    }
    p.at(0, 1.6, 0, 0, () => S.giltFrame(p, 3.4, 4.3, 0.22));
  }));
  {
    const g = X.g('choir', 'portrait'), [u0, v0, u1, v1] = portraitUV(5), zc = AZ - 0.03, ya = Y + 1.82, yb = Y + 5.68;
    g.quad([48.52, ya, zc], [51.48, ya, zc], [51.48, yb, zc], [48.52, yb, zc], [0, 0, -1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  kit.props.place({ file: 'halloween/shrine_candles.gltf', group: 'choir', x: 47.2, y: Y, z: AZ - 1.0, yaw: Math.PI, scale: 1 });
  kit.props.place({ file: 'halloween/shrine_candles.gltf', group: 'choir', x: 52.8, y: Y, z: AZ - 1.0, yaw: Math.PI, scale: 1 });
  kit.props.place({ file: 'props/BookStand.gltf', group: 'choir', x: 45.5, y: Y, z: HZ - 1, yaw: -Math.PI / 2, scale: 1.25 });
  buildApi.addBoxCollider(50, AZ - 1.1, 2.6, 1.1, 0, Y + 1.5, Y - 0.5);
  for (const x of [47.2, 52.8]) { kit.flames.add('choir', x, Y + 1.55, AZ - 1.0, 0.1, 0.2, true); kit.pools.floor('choir', x, Y, AZ - 1.6, 2.2); }
  kit.lamps.add({ group: 'choir', x: 50, y: Y + 2.4, z: AZ - 2 });
  // the groin vault's bays centre on x 42.6, 50, 57.4; its crowns at wall + 3.7
  for (const x of [42.6, 57.4]) chand('choir', x, Y + 8 + 3.6, HZ, { r: 1.2, drop: 4.6, tiers: 2, arms: 8 }, Y, false);

  // =================================================== 7. THE MIRROR FOYER, THE GRAND DOORS
  const foy = roomById('foyer'), FZ = (foy.z0 + foy.z1) / 2;
  blocked('foyer', foy.z0 + INSET, 0);
  for (const x of [-16, 0, 16]) chand('foyer', x, Y + 8.5 + 5.1, FZ, { r: 1.4, drop: 6.0, tiers: 2, arms: 10 }, Y, x === 0);
  for (const x of [-20, -12, 12, 20]) for (const z of [foy.z0 + INSET + 0.7, foy.z1 - INSET - 0.7]) torch('foyer', x, Y, z, 1.9, false);
  {
    const z0 = 10 - INSET, z1 = 18 + INSET, half = 6 - INSET, L = z1 - z0;
    kit.build(doorsG, (p) => p.at(0, Y, 0, 0, () => {
      // the floor to the cell edge (z 18), where the flight down into the flooded ballroom begins
      p.g('floor').quad([-half, 0, z0], [half, 0, z0], [half, 0, 18], [-half, 0, 18], [0, 1, 0]);
      if (p.detail) for (const x of [-1.5, 1.5]) box(p.g('floorTrim'), x - 0.08, 0, z0, x + 0.08, 0.006, 18, 0);
      for (const s of [-1, 1]) p.at(s * half, 0, (z0 + z1) / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
        wallSegment(p, { x0: -L / 2, x1: L / 2, h: 4.8, thick: THICK, plinth: true, cornice: true });
        // a leaf of the great doors, thrown open against the side: walnut, panelled, gilt
        const t = p.g('timber');
        box(t, -L / 2 + 0.5, 0.05, 0.05, -L / 2 + 0.5 + half - 0.1, 4.7, 0.28, 0.03);
        if (p.detail) for (let k = 0; k < 2; k++) for (const y of [0.5, 2.6]) {
          const xa = -L / 2 + 0.9 + k * 2.45;
          box(t, xa, y, 0.28, xa + 2.0, y + 1.8, 0.33, 0.02);
          box(p.g('metal'), xa + 0.15, y + 0.15, 0.33, xa + 1.85, y + 0.22, 0.35, 0.005);
        }
      });
      p.at(0, 0, (z0 + z1) / 2, 0, () => barrelVault(p, { span: 2 * half, z0: -L / 2, z1: L / 2, spring: 4.8, rise: 2.4, ribEvery: 2.4, ends: [false, false] }));
    }));
    for (const s of [-1, 1]) buildApi.addBoxCollider(s * (half + 0.6), 14, 0.6, 4.9, 0, Y + 8, Y - 1);
    kit.build('foyer', (p) => p.at(0, Y, z0, Math.PI, () => doorway(p, { h: 8.5, thick: THICK, half, spring: 4.8, rise: 2.4, kind: 'arch', edge: 6 })));
    kit.build('ballroom', (p) => p.at(0, Y, z1, 0, () => doorway(p, { h: 8.4, thick: THICK, half, spring: 4.8, rise: 2.4, kind: 'arch', edge: 6 })));
    // the flight down into the flood (the plan's, z 18 -> 20) and the basin's
    // kerb between its cheeks and the shell's runs, which stop at x +-6
    kit.build('ballroom', (p) => {
      p.at(0, BASIN, 18 + FLOOD.stairRun, Math.PI, () => stairFlight(p, { w: 2 * half, run: FLOOD.stairRun, rise: Y - BASIN, steps: FLOOD.steps, rails: 'none' }));
      const tr = p.g('trim');
      for (const s of [-1, 1]) {
        const a = s * (half + 0.22), b = s * 6;
        box(tr, a, BASIN, z1 - 0.05, b, Y - 0.09, z1 + FLOOD.kerb, 0, ['ny']);
        box(tr, a, Y - 0.11, z1 - 0.05, b, Y, z1 + FLOOD.kerb + 0.07, p.detail ? 0.025 : 0, ['ny']);
      }
    });
    kit.pools.floor(doorsG, 0, Y, 14, 4.5);
    kit.lamps.add({ group: doorsG, x: 0, y: Y + 4, z: 14 });
  }

  // =================================================== 8. THE INTERRUPTED WALTZ
  buildBallroomHall(kit, X, cold, chand, torch);

  // =================================================== 9. the extras' materials, the camera, finish
  const atlas = portraitAtlas(scene);
  const roseSilk = new StandardMaterial('sb_rose_silk', scene);
  const rt = damask(scene, '#5e2632', '#7e3c4a'); rt.uScale = rt.vScale = 1.25;
  roseSilk.diffuseTexture = rt;
  roseSilk.specularColor = new Color3(0.12, 0.1, 0.1); roseSilk.maxSimultaneousLights = 6;
  const accent = kit.material('accent');
  const at: Texture = damask(scene, '#1f4245', '#305d61'); at.uScale = at.vScale = 1.25;
  accent.diffuseTexture = at;
  // MEASURED (first look): at the shared defaults the flood read as a lit
  // swimming pool -- the emissive lift and the grazing sky reflection are
  // for open water under a sky; standing water in a dark palace keeps neither.
  // MEASURED (flood pass): at alpha 0.46 the drowned floor's tiles showed
  // through as sharp as a dry floor's; 0.64 lets the water read as water
  // over the sunk floor
  const waterM = makeClearWaterMat('sb_flood', '#1c464a', 0.64, 0.4);
  waterM.emissiveColor = Color3.FromHexString('#1c464a').scale(0.06);
  if (waterM.reflectionFresnelParameters) waterM.reflectionFresnelParameters.leftColor = new Color3(0.2, 0.27, 0.28);
  X.finish(scene, kit, {
    lake: lakeMaterial(scene), portrait: portraitMaterial(scene, atlas), silt: siltMaterial(scene), water: waterM,
    shaft: shaftMaterial(scene, '#9fd6dc'), caustic: causticMaterial(scene, '#7fc4c8'), fall: fallMaterial(scene), rose: roseSilk,
  }, glow, { pickable: (m) => m === 'lake' || m === 'portrait' || m === 'silt' || m === 'rose' });
  cold.upload();
  glow?.addExcludedMesh(cold.pool.mesh);
  let lastVis: unknown;
  scene.onBeforeRenderObservable.add(() => { if (kit.vis !== lastVis) { lastVis = kit.vis; cold.update(kit.vis); } });
  for (const c of dp.cameraRooms(0.35)) {
    const stair = c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: stair ? 6 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

type Chand = (group: string, x: number, ceil: number, z: number, o: S.ChandelierOpts, floorY: number, lamp?: boolean, lean?: number) => void;
type Torch = (group: string, x: number, y: number, z: number, h?: number, lamp?: boolean) => void;

// ------------------------------------------------------------------ the ballroom
// The arena. The rectangle the server knows (52 x 44 m) holds an oval: paired
// fluted columns on an ellipse carry a gilt entablature, and on it a coffered
// dome with a glazed lantern at its crown, the lake's moonlit surface above
// it. The ambulatory between the columns and the walls has a flat soffit at
// the springing; the walls carry mirrors and the lake windows. The floor is a
// mosaic sunk under knee-deep water (a basin, FLOOD: the colonnade stands
// on plinths that break the surface); the bandstand fills the north end.
function buildBallroomHall(kit: DungeonKit, X: Extras, cold: LightPools, chand: Chand, torch: Torch): void {
  // y: the palace level (the doorways, the column plinths' tops); fy: the drowned floor
  const G = 'ballroom', y = Y, fy = BASIN, { cx, cz, rx, rz } = OVAL;
  // --- the floor: a compass mosaic in the oval
  kit.build(G, (p) => {
    const inl = p.g('inlay'), ft = p.g('floorTrim'), n = p.detail ? 96 : 48;
    const ring = (r0: number, r1: number, g: Geom) => {
      for (let k = 0; k < n; k++) {
        const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, P = (a: number, r: number): V3 => [cx + Math.cos(a) * rx * r, fy + 0.006, cz + Math.sin(a) * rz * r];
        g.quad(P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), [0, 1, 0]);
      }
    };
    ring(0.86, 0.9, ft); ring(0.6, 0.62, inl); ring(0.3, 0.33, ft);
    if (!p.detail) return;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, r = k % 2 ? 0.45 : 0.6, w = 0.045;
      const tip: V3 = [cx + Math.cos(a) * rx * r, fy + 0.008, cz + Math.sin(a) * rz * r];
      const l: V3 = [cx + Math.cos(a + w * 3) * rx * 0.33, fy + 0.008, cz + Math.sin(a + w * 3) * rz * 0.33], rr: V3 = [cx + Math.cos(a - w * 3) * rx * 0.33, fy + 0.008, cz + Math.sin(a - w * 3) * rz * 0.33];
      (k % 2 ? ft : inl).poly([l, tip, rr], [0, 1, 0]);
    }
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2, b = a + 0.05;
      inl.poly([[cx + Math.cos(a) * rx * 0.7, fy + 0.007, cz + Math.sin(a) * rz * 0.7], [cx + Math.cos(b) * rx * 0.8, fy + 0.007, cz + Math.sin(b) * rz * 0.8], [cx + Math.cos(a + 0.1) * rx * 0.7, fy + 0.007, cz + Math.sin(a + 0.1) * rz * 0.7]], [0, 1, 0]);
    }
  });
  // the flood over all of it, under the doorway's threshold, held by the kerb
  X.g(G, 'water').quad([BR.x0, FLOOD_Y, BR.z0], [BR.x1, FLOOD_Y, BR.z0], [BR.x1, FLOOD_Y, BR.z1], [BR.x0, FLOOD_Y, BR.z1], [0, 1, 0]);

  // --- the colonnade: paired columns round the oval, gaps at the doors and the stage
  const N = 20, colH = ENT.colTop - y;
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2;
    const dS = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))), dN = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (dS < 0.3 || dN < 0.6) continue;
    const px = cx + Math.cos(a) * rx, pz = cz + Math.sin(a) * rz, tx = -Math.sin(a) * rx, tz = Math.cos(a) * rz, tl = Math.hypot(tx, tz);
    // the pair's plinth: from the drowned floor to the palace level, coped
    // above the water, the columns on it (local x along the oval)
    const yaw = Math.atan2(-tz, tx);
    kit.build(G, (p) => p.at(px, fy, pz, yaw, () => {
      const tr = p.g('trim');
      box(tr, -1.4, 0, -0.66, 1.4, y - fy - 0.09, 0.66, 0, ['ny']);
      box(tr, -1.47, y - fy - 0.11, -0.73, 1.47, y - fy, 0.73, p.detail ? 0.025 : 0, ['ny']);
    }));
    buildApi.addBoxCollider(px, pz, 1.47, 0.73, yaw, y + 0.5, fy - 0.5);
    for (const s of [-1, 1]) {
      const qx = px + tx / tl * s * 0.72, qz = pz + tz / tl * s * 0.72;
      kit.build(G, (p) => p.at(qx, y, qz, 0, () => S.column(p, { h: colH, r: 0.4 })));
      buildApi.addCircleCollider(qx, qz, 0.55);
    }
  }
  // --- the entablature: an elliptical ring beam, a gilt frieze, a cornice
  kit.build(G, (p) => {
    const tr = p.g('trim'), m = p.g('metal'), n = p.detail ? 120 : 60;
    const E = (a: number, d: number, yy: number): V3 => [cx + Math.cos(a) * (rx + d), yy, cz + Math.sin(a) * (rz + d)];
    const nin = (a: number): V3 => norm([-Math.cos(a) / rx, 0, -Math.sin(a) / rz]);
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      tr.quad(E(a0, -0.55, ENT.colTop), E(a1, -0.55, ENT.colTop), E(a1, -0.55, ENT.top), E(a0, -0.55, ENT.top), nin(am), null, [nin(a0), nin(a1), nin(a1), nin(a0)]);
      tr.quad(E(a0, 0.55, ENT.colTop), E(a1, 0.55, ENT.colTop), E(a1, 0.55, ENT.top), E(a0, 0.55, ENT.top), mul(nin(am), -1));
      tr.quad(E(a0, -0.55, ENT.colTop), E(a1, -0.55, ENT.colTop), E(a1, 0.55, ENT.colTop), E(a0, 0.55, ENT.colTop), [0, -1, 0]);
      if (p.detail) m.quad(E(a0, -0.6, ENT.colTop + 0.55), E(a1, -0.6, ENT.colTop + 0.55), E(a1, -0.6, ENT.colTop + 0.85), E(a0, -0.6, ENT.colTop + 0.85), nin(am));
    }
    if (p.detail) {
      const path = (d: number): V2[] => Array.from({ length: n + 1 }, (_, k) => { const a = k / n * Math.PI * 2; return [cx + Math.cos(a) * (rx + d), cz + Math.sin(a) * (rz + d)] as V2; });
      moulding(tr, PROFILES.cornice(0.5, 0.42), path(-0.55), ENT.top - 0.5);
      moulding(tr, PROFILES.string(0.2, 0.08), path(-0.55), ENT.colTop);
    }
  });
  // --- the ambulatory's soffit, from the walls to the ring beam, at the springing
  kit.build(G, (p) => {
    const g = p.g('ceiling'), erx = rx + 0.55, erz = rz + 0.55;
    const angs: number[] = [];
    for (let k = 0; k < 96; k++) angs.push(k / 96 * Math.PI * 2);
    for (const [qx, qz] of [[BR.x1, BR.z1], [BR.x0, BR.z1], [BR.x0, BR.z0], [BR.x1, BR.z0]]) { let a = Math.atan2((qz - cz) / erz, (qx - cx) / erx); if (a < 0) a += Math.PI * 2; angs.push(a); }
    angs.sort((a, b) => a - b);
    const onRect = (a: number): V3 => {
      const dx = Math.cos(a) * erx, dz = Math.sin(a) * erz;
      const tX = dx > 1e-9 ? (BR.x1 - cx) / dx : dx < -1e-9 ? (BR.x0 - cx) / dx : Infinity, tZ = dz > 1e-9 ? (BR.z1 - cz) / dz : dz < -1e-9 ? (BR.z0 - cz) / dz : Infinity;
      const t = Math.min(tX, tZ);
      return [cx + dx * t, ENT.top, cz + dz * t];
    };
    for (let k = 0; k < angs.length; k++) {
      const a0 = angs[k], a1 = k + 1 === angs.length ? angs[0] + Math.PI * 2 : angs[k + 1];
      const e0: V3 = [cx + Math.cos(a0) * erx, ENT.top, cz + Math.sin(a0) * erz], e1: V3 = [cx + Math.cos(a1) * erx, ENT.top, cz + Math.sin(a1) * erz];
      g.quad(e0, e1, onRect(a1), onRect(a0), [0, -1, 0]);
    }
  });
  // --- the dome and its lantern
  const D: S.DomeOpts = { rx: rx - 0.55, rz: rz - 0.55, spring: ENT.top, rise: 8.4, sectors: 40, rings: 6, phiMax: 1.2, depth: 0.3, ribEvery: 4 };
  kit.build(G, (p) => p.at(cx, 0, cz, 0, () => S.cofferedDome(p, D)));
  const orx = D.rx * Math.cos(D.phiMax), orz = D.rz * Math.cos(D.phiMax), oy = D.spring + D.rise * Math.sin(D.phiMax), top = oy + 2.4;
  {
    const lg = X.g('*', 'lake'); lg.shade = () => 1;
    const n = 32;
    const ringP = (k: number, yy: number, s = 1): V3 => [cx + Math.cos(k / n * Math.PI * 2) * orx * s, yy, cz + Math.sin(k / n * Math.PI * 2) * orz * s];
    for (let k = 0; k < n; k++) lg.quad(ringP(k, oy - 0.05), ringP(k + 1, oy - 0.05), ringP(k + 1, top), ringP(k, top), norm([-Math.cos((k + 0.5) / n * Math.PI * 2) / orx, 0, -Math.sin((k + 0.5) / n * Math.PI * 2) / orz]));
    lg.poly(Array.from({ length: n }, (_, k) => ringP(k, top)), [0, -1, 0]);
    kit.build(G, (p) => {
      const m = p.g('metal');
      for (let k = 0; k < 16; k++) { const q = ringP(k * 2, oy, 0.985); beam(m, q, [q[0], top, q[2]], 0.14, 0.14, 0.02); }
      if (p.detail) for (const yy of [oy + 0.9, top - 0.08]) for (let k = 0; k < n; k++) beam(m, ringP(k, yy, 0.98), ringP(k + 1, yy, 0.98), 0.08, 0.08, 0.01);
    });
    // the moonlight through the lantern: shafts leaning down to the floor
    const sg = X.g(G, 'shaft');
    sg.shade = (_x, yy) => Math.max(0, Math.min(1, (yy - y) / (top - y))) * 0.3;
    const shafts: [number, number, number, number][] = [[-2.5, -1.5, 2.6, 1.0], [2.8, 0.8, 2.0, 0.8], [0.2, 2.2, 3.2, 1.2], [-4.0, 1.5, 1.6, 0.7], [3.5, -2.2, 1.8, 0.7]];
    for (const [ox, oz, w, k] of shafts) {
      const t: V3 = [cx + ox, top - 0.3, cz + oz], b: V3 = [cx + ox * 1.25 + 1.6, FLOOD_Y + 0.03, cz + oz * 1.15 - 3.2];
      for (const [ax, az] of [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]]) {
        const hw = w * 0.5, hb = w * 0.5 * (1 + k * 0.5);
        sg.quad(add(t, [-ax * hw, 0, -az * hw]), add(t, [ax * hw, 0, az * hw]), add(b, [ax * hb, 0, az * hb]), add(b, [-ax * hb, 0, -az * hb]), norm([az, 0, -ax]), [[0, 1], [1, 1], [1, 0], [0, 0]]);
      }
      cold.floor(G, b[0], FLOOD_Y, b[2], w * 1.4);
    }
    // the caustics on the drowned floor under the lantern
    const cg = X.g(G, 'caustic'), rings = 6, seg = 40;
    cg.shade = (x, _y, z) => { const r = Math.hypot((x - cx) / (rx * 0.85), (z - cz) / (rz * 0.85)); return Math.max(0, 1 - r * r) * 0.9; };
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) {
      const r0 = j / rings, r1 = (j + 1) / rings, a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const P = (a: number, r: number): V3 => [cx + Math.cos(a) * rx * 0.85 * r, fy + 0.015, cz + Math.sin(a) * rz * 0.85 * r];
      cg.quad(P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), [0, 1, 0]);
    }
  }
  // the great chandelier, from the lantern's crown, leaning with the rest
  chand(G, cx, top, cz + 1.0, { r: 3.0, drop: 9.0, tiers: 3, arms: 16 }, FLOOD_Y, true);
  for (const [x, z] of [[-23.2, 24], [23.2, 24], [-23.2, 46], [23.2, 46]]) chand(G, x, ENT.top, z, { r: 0.8, drop: 1.5, tiers: 1, arms: 6 }, FLOOD_Y, z < 30);

  // --- the bandstand
  const d = SITE.decks.find((q) => Math.abs(q.y - (y + 1.2)) < 0.01 && q.hx > 10)!, dy = d.y, dx0 = d.cx - d.hx, dx1 = d.cx + d.hx, dz0 = d.cz - d.hz, dz1 = BR.z1;
  kit.build(G, (p) => {
    const t = p.g('timber'), tr = p.g('trim'), ft = p.g('floorTrim');
    t.quad([dx0, dy, dz0], [dx1, dy, dz0], [dx1, dy, dz1], [dx0, dy, dz1], [0, 1, 0]);
    box(tr, dx0, fy, dz0, dx1, dy - 0.02, dz0 + 0.4, 0, ['ny', 'py']);
    for (const x of [dx0, dx1]) box(tr, x < 0 ? x : x - 0.4, fy, dz0, x < 0 ? x + 0.4 : x, dy - 0.02, dz1, 0, ['ny', 'py']);
    box(tr, dx0 - 0.1, dy - 0.14, dz0 - 0.12, dx1 + 0.1, dy + 0.02, dz0 + 0.3, p.detail ? 0.03 : 0);
    if (p.detail) for (let x = dx0 + 1; x < dx1 - 1.5; x += 2.5) {
      if (x + 1.9 > -4.3 && x < 4.3) continue;
      box(ft, x, y + 0.25, dz0 - 0.03, x + 1.9, dy - 0.3, dz0, 0.01);
    }
    for (const [a, b] of [[dx0 + 0.2, -4.3], [4.3, dx1 - 0.2]]) p.at((a + b) / 2, dy, dz0 + 0.3, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.25, rail: 0.9 }));
    for (const s of [-1, 1]) p.at(s * (d.hx - 0.3), dy, (dz0 + dz1) / 2 + 0.3, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => galleryEdge(p, { len: dz1 - dz0 - 0.9, fascia: 0.25, rail: 0.9 }));
    p.at(0, fy, dz0 - 6, 0, () => stairFlight(p, { w: 8, run: 6, rise: dy - fy, steps: 10, rails: 'both', railHeight: 0.9 }));
  });
  for (const [a, b] of [[dx0, -4.3], [4.3, dx1]]) buildApi.addBoxCollider((a + b) / 2, dz0 + 0.3, (b - a) / 2, 0.15, 0, dy + 1.0, dy - 0.2);
  for (const s of [-1, 1]) buildApi.addBoxCollider(s * (d.hx - 0.3), (dz0 + dz1) / 2, 0.15, (dz1 - dz0) / 2, 0, dy + 1.0, dy - 0.2);
  // the bandshell: a fluted conch against the north wall, gilt on its ridges
  kit.build(G, (p) => {
    const g = p.g('trim'), m = p.g('metal'), Rx = 9.5, Ry = 6.6, Dp = 2.2, nA = p.detail ? 26 : 13, nR = p.detail ? 8 : 4, fl = 13;
    const P = (th: number, s: number): V3 => {
      const flute = Math.abs(Math.sin(th * fl)) * 0.35 * s;
      return [Math.cos(th) * Rx * s, dy + Math.sin(th) * Ry * s, dz1 - Dp * s * s + flute];
    };
    for (let i = 0; i < nA; i++) for (let j = 0; j < nR; j++) {
      const t0 = Math.PI * i / nA, t1 = Math.PI * (i + 1) / nA, s0 = j / nR, s1 = (j + 1) / nR;
      const A = P(t0, s0), B = P(t1, s0), C = P(t1, s1), Dd = P(t0, s1);
      const n = norm(cross(sub(C, A), sub(Dd, B)));
      g.quad(A, B, C, Dd, n[2] > 0 ? mul(n, -1) : n);
    }
    if (p.detail) for (let i = 0; i <= fl; i++) {
      const th = Math.PI * (i + 0.5) / (fl + 1), path: V3[] = [];
      for (let j = 1; j <= 8; j++) path.push(add(P(th, j / 8), [0, 0, -0.06]));
      S.tube(m, path, 0.05, 4);
    }
    const rim: V3[] = []; for (let i = 0; i <= 26; i++) rim.push(add(P(Math.PI * i / 26, 1), [0, 0, -0.05]));
    S.tube(m, rim, 0.12, 6);
  });
  // the orchestra's chairs and stands, the music box, the notice's console
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * (1.12 + k * 0.108), x = Math.cos(a) * 7.5, z = 57.5 + Math.sin(a) * 2.8;
    if (Math.abs(x) < 5.5) continue;
    kit.build(G, (p) => p.at(x, dy, z, Math.PI + (k % 2 ? 0.2 : -0.15), () => S.salonChair(p)));
    kit.build(G, (p) => p.at(x * 0.94, dy, z - 1.0, Math.PI, () => S.musicStand(p)));
  }
  const consoleT = (x: number, z: number, h: number) => kit.build(G, (p) => p.at(x, dy, z, 0, () => {
    const m = p.g('metal');
    for (const [lx, lz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) S.tube(m, [[lx, h - 0.1, lz], [lx * 1.05, h * 0.6, lz * 1.1], [lx * 0.92, 0.12, lz], [lx, 0.0, lz]], 0.04, 5);
    box(m, -0.72, h - 0.18, -0.42, 0.72, h - 0.06, 0.42, 0.02);
    box(p.g('trim'), -0.8, h - 0.06, -0.48, 0.8, h, 0.48, 0.02);
  }));
  consoleT(-3, 58, 0.87); consoleT(4, 58, 1.1);
  buildApi.addBoxCollider(-3, 58, 0.8, 0.5, 0, dy + 1.4, dy - 0.2);
  kit.props.place({ file: 'moonmere/music_box.glb', group: G, x: -3, y: dy + 0.87, z: 58, yaw: Math.PI, scale: 1.8 });
  torch(G, -15.6, dy, 56, 2.0, true);
  kit.pools.wall(G, 0, dy + 2.6, dz1 - 1.6, 5.5, 0, -1);
  kit.pools.floor(G, 0, dy, 57.5, 6);
  torch(G, 15.6, dy, 56, 2.0, false);
  // the waltz interrupted: chairs knocked over at the floor's edge, cards on the water
  for (const [x, z, a] of [[-14, 27, 0.4], [12.5, 26, 2.1], [-16.5, 44, 4.0], [17, 41, 1.3], [8, 23.5, 5.2]] as V3[]) {
    kit.build(G, (p) => p.at(x, fy + 0.3, z, a, () => { S.mapped(p, S.rotX(-Math.PI / 2 + 0.15), [0, 0, 0], (q) => S.salonChair(q)); }));
  }
  kit.build(G, (p) => {
    if (!p.detail) return;
    let s = 5;
    const r = () => { s = (s * 16807) % 2147483647; return (s % 10000) / 10000; };
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2, rr = 0.2 + r() * 0.9, x = cx + Math.cos(a) * rx * rr, z = cz + Math.sin(a) * rz * rr, yaw = r() * 3;
      p.at(x, FLOOD_Y + 0.006, z, yaw, () => box(p.g('ceiling'), -0.06, 0, -0.09, 0.06, 0.004, 0.09, 0));
    }
  });
}

registerZone({
  key: 'sunkenballroom', height: floorAt, hemi: THEME.hemi,
  light: { hemiGround: THEME.hemiGround },
  terrain: { tex: 'cobblestone_floor_08', tint: ['#5a6670', '#5a6670'], tile: 6 },
  // a cold lake light from above, warm fire within: the hemisphere's sky is the
  // lake's green-blue, the "sun" a faint moonlight down through the water
  lighting: { hemi: THEME.hemi, hemiSky: '#9cbcc0', hemiGround: THEME.hemiGround, sun: 0.2, sunColor: '#8fc0c8', sunDir: [0.25, -1, 0.4], fog: THEME.fog, exposure: 1.32, contrast: 1.05 },
  build: buildBallroom,
});
