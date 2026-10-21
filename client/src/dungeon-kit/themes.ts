// Dungeon kit v2: the eleven theme presets as data, Babylon-free.
//
// A preset is the look of one dungeon (SCOUT.md quotes each theme): which
// generated sheet and tint every material slot uses, the architecture style
// the shell builder follows, the atmosphere (fog, clear colour, ambient), and
// the fire (flame, ember, lamp and light-pool colours). Sheets are made by
// tools/assets/gen_dungeon_textures.py into /tex/dungeon/; their periods
// below MUST match its PERIOD table (test/dungeon_kit_themes.test.mjs reads
// both). A tint multiplies the near-neutral sheet, so one ashlar sheet is
// the tomb's limestone, the watchtower's granite and the Keep's royal stone;
// what the tint cannot do (structure, wear, grain) is in the sheet.
//
// Slots that share a SurfaceSpec object share one material and one draw per
// room (build.ts merges by material, not by slot): reuse a surface wherever
// a separate one would not read differently.
import type { Slot } from './geom.ts';

export type SheetKey = 'ashlar' | 'rubble' | 'brick' | 'flags' | 'marble' | 'planks' | 'timber' | 'plaster' | 'iron' | 'setts' | 'tiles';
/** metres per sheet; gen_dungeon_textures.py PERIOD */
export const SHEET_PERIOD: Record<SheetKey, number> = {
  ashlar: 4, rubble: 4, brick: 2, flags: 4, marble: 2, planks: 4, timber: 2, plaster: 4, iron: 2, setts: 2, tiles: 2,
};
export const TEX_ROOT = '/tex/dungeon/';

export interface SurfaceSpec {
  /** a generated sheet, or none for a flat colour (metal fittings, glass) */
  sheet?: SheetKey;
  /** multiplies the sheet (hex) */
  tint: string;
  /** specular grey level (0..1) and power: polish and wet stone read here */
  spec?: number; power?: number;
  /** normal map strength (default 0.8) */
  bump?: number;
  /** repeats per sheet period (default 1); 2 halves the pattern's size */
  scale?: number;
  /** self-illumination (hex) and glow-layer strength (only emitters glow) */
  emissive?: string; glow?: number;
  alpha?: number;
  /** ignore scene lights (an emitter, a painted void) */
  unlit?: boolean;
}

export type CeilingKind = 'barrel' | 'groin' | 'flat' | 'coffered' | 'truss' | 'open';
export type DoorKind = 'arch' | 'pointed' | 'lintel';
export type InlayKind = 'none' | 'grid' | 'diamond' | 'medallion';
export interface ArchStyle {
  /** room wall height to the springing / eaves (m) */
  wallHeight: number;
  corridorHeight: number;
  ceiling: CeilingKind;
  corridorCeiling: CeilingKind;
  door: DoorKind;
  /** a pilaster at every n-th bay joint along a room wall (0 = none) */
  pilasterEvery: number;
  plinth: boolean; stringCourse: number | null; cornice: boolean;
  /** timber framing on the walls: posts at bay joints and a top plate */
  framed: boolean;
  floorBorder: boolean;
  inlay: InlayKind;
  /** vault rib spacing (m, 0 = none) */
  ribEvery: number;
}

export interface ThemePreset {
  key: string;
  name: string;
  /** the dungeon it was made for (zones.json key) */
  dungeon: string;
  surfaces: Record<Slot, SurfaceSpec>;
  arch: ArchStyle;
  /** scene clear colour behind everything; enclosed dungeons never show it */
  clear: string;
  fog: { color: string; density: number };
  /** ZoneModule.hemi and the hemisphere's ground colour */
  hemi: number; hemiGround: string;
  /** fire: flame core and edge, embers, the lamp slots' light, floor pools */
  flame: { core: string; edge: string; ember: string };
  lamp: { color: string; intensity: number; range: number };
  pool: { color: string; strength: number };
  /** curated CC0 props that suit it (paths under /models/, env_manifest_cc0.json keys) */
  props: string[];
}

// shared non-masonry surfaces
const S = (sheet: SheetKey | undefined, tint: string, o: Partial<SurfaceSpec> = {}): SurfaceSpec => ({ sheet, tint, ...o });
const emitter = (hex: string, glow = 0.9): SurfaceSpec => ({ tint: hex, emissive: hex, glow, unlit: true });
const voidDark = (hex: string): SurfaceSpec => ({ tint: hex, emissive: hex, unlit: true });

function preset(p: Omit<ThemePreset, 'surfaces'> & { surfaces: Partial<Record<Slot, SurfaceSpec>> & Pick<Record<Slot, SurfaceSpec>, 'wall' | 'floor'> }): ThemePreset {
  const s = p.surfaces;
  const trim = s.trim ?? s.wall;
  const surfaces: Record<Slot, SurfaceSpec> = {
    wall: s.wall, trim, floor: s.floor, floorTrim: s.floorTrim ?? trim, inlay: s.inlay ?? trim,
    ceiling: s.ceiling ?? s.wall, timber: s.timber ?? S('timber', '#8a6a4c'), metal: s.metal ?? S('iron', '#5a5650', { spec: .35, power: 40 }),
    accent: s.accent ?? trim, glass: s.glass ?? { tint: '#9fb8c4', alpha: .35, spec: .8, power: 90 },
    emit: s.emit ?? emitter(p.flame.core), dark: s.dark ?? voidDark('#0b0d10'),
  };
  return { ...p, surfaces };
}

const BASE_ARCH: ArchStyle = {
  wallHeight: 7, corridorHeight: 4.8, ceiling: 'barrel', corridorCeiling: 'barrel', door: 'arch', pilasterEvery: 2,
  plinth: true, stringCourse: 3.2, cornice: true, framed: false, floorBorder: true, inlay: 'grid', ribEvery: 4,
};

export const THEMES: Record<string, ThemePreset> = {
  // 1. An inhabited imperial tomb: ordered masonry, fresh vigil lamps.
  tomb: preset({
    key: 'tomb', name: 'Imperial tomb limestone', dungeon: 'mausoleum',
    surfaces: {
      wall: S('ashlar', '#d8d2c2', { bump: .9 }), trim: S('ashlar', '#ece6d6', { scale: 2, bump: .6, spec: .08 }),
      floor: S('flags', '#b8b4a8', { spec: .22, power: 60 }), floorTrim: S('marble', '#4e5a66', { spec: .5, power: 80 }),
      inlay: S('marble', '#c9b27a', { spec: .5, power: 80 }), ceiling: S('ashlar', '#c4beae', { scale: 2 }),
      metal: S(undefined, '#a8884a', { spec: .55, power: 50 }), accent: S(undefined, '#1d3352', { spec: .3 }),
    },
    arch: { ...BASE_ARCH, wallHeight: 7.5, ceiling: 'barrel', inlay: 'medallion' },
    clear: '#07090c', fog: { color: '#151a20', density: .012 }, hemi: .55, hemiGround: '#2a2620',
    flame: { core: '#fff1c8', edge: '#ffb24a', ember: '#ff8a2a' }, lamp: { color: '#ffd9a0', intensity: 1.08, range: 20 }, pool: { color: '#ffcf8a', strength: 0.3 },
    props: ['halloween/coffin_decorated.gltf', 'graveyard/urn-round.glb', 'graveyard/altar-stone.glb', 'dungeon/banner_patternA_blue.glb', 'props/CandleStick_Stand.gltf', 'props/Vase_2.gltf', 'halloween/plaque_candles.gltf', 'graveyard/pillar-obelisk.glb'],
  }),
  // 2. The plantation still records every absent shift: a branching timber house.
  lodge: preset({
    key: 'lodge', name: 'Plantation timber lodge', dungeon: 'overseerslodge',
    surfaces: {
      wall: S('plaster', '#e2d8c2'), trim: S('timber', '#7a5638', { bump: .7 }), floor: S('planks', '#a88462', { spec: .12 }),
      floorTrim: S('planks', '#6e5038'), inlay: S('timber', '#5e432c'), ceiling: S('planks', '#8e6a4a'),
      timber: S('timber', '#6e4c30', { bump: .8 }), metal: S(undefined, '#4a4640', { spec: .3 }), accent: S(undefined, '#5f6e3a'),
    },
    arch: { ...BASE_ARCH, wallHeight: 5.2, corridorHeight: 4.2, ceiling: 'truss', corridorCeiling: 'flat', door: 'lintel', pilasterEvery: 1, plinth: false, stringCourse: 1.1, cornice: false, framed: true, floorBorder: false, inlay: 'none', ribEvery: 0 },
    clear: '#0c0a08', fog: { color: '#1e1912', density: .011 }, hemi: .62, hemiGround: '#3a2c1c',
    flame: { core: '#fff0c0', edge: '#ffa640', ember: '#ff7a20' }, lamp: { color: '#ffd29a', intensity: 1.14, range: 20 }, pool: { color: '#ffc77e', strength: 0.28 },
    props: ['props/Desk.gltf', 'props/Chair_1.gltf', 'props/Bookcase_2.gltf', 'props/BookGroup_Medium_1.gltf', 'props/Page_Stack_Large.gltf', 'props/Crate_Wooden.gltf', 'props/Bed_Bunk.gltf', 'props/Lantern_Wall.gltf', 'props/Cabinet.gltf', 'props/Barrel.gltf', 'props/Table_Large.gltf'],
  }),
  // 3. A shallow-flooded leisure palace, its last waltz held for the Return.
  ballroom: preset({
    key: 'ballroom', name: 'Drowned ballroom marble and gilt', dungeon: 'sunkenballroom',
    surfaces: {
      wall: S('plaster', '#c9cbbf'), trim: S('marble', '#e8e2d4', { spec: .45, power: 70 }), floor: S('marble', '#cfcac0', { spec: .6, power: 90 }),
      floorTrim: S('marble', '#3c4a50', { spec: .6, power: 90 }), inlay: S('marble', '#7a6a8a', { spec: .6, power: 90 }), ceiling: S('plaster', '#d8d6cc'),
      metal: S(undefined, '#b8964e', { spec: .7, power: 60 }), accent: S(undefined, '#6a3a4a', { spec: .2 }), timber: S('timber', '#4e3424'),
    },
    arch: { ...BASE_ARCH, wallHeight: 8, ceiling: 'coffered', corridorCeiling: 'flat', pilasterEvery: 1, stringCourse: 1.0, inlay: 'diamond', ribEvery: 0 },
    clear: '#060a0c', fog: { color: '#18262a', density: .013 }, hemi: .6, hemiGround: '#24343a',
    flame: { core: '#f4f8ff', edge: '#ffd27a', ember: '#ffb860' }, lamp: { color: '#ffe6bc', intensity: 1.02, range: 22 }, pool: { color: '#ffe0a8', strength: 0.25 },
    props: ['props/Chandelier_Large.gltf', 'props/Chair_2.gltf', 'props/Table_Large.gltf', 'props/Vase_4.gltf', 'props/Chalice_Golden.gltf', 'props/Rug_Round.gltf', 'dungeon/table_long_tablecloth_decorated_A.glb', 'props/CandleStick_Triple.gltf', 'props/Vase_Rubble_Medium.gltf'],
  }),
  // 4. An archive climbing round the clock's open shaft.
  belltower: preset({
    key: 'belltower', name: 'Bell tower stone and oak', dungeon: 'belltower',
    surfaces: {
      wall: S('rubble', '#a8a698'), trim: S('ashlar', '#bcb8a8', { scale: 2 }), floor: S('planks', '#8a6c50', { spec: .1 }),
      floorTrim: S('flags', '#8e8a80'), ceiling: S('planks', '#6c5038'), timber: S('timber', '#5e4430'),
      metal: S(undefined, '#8a6e3c', { spec: .6, power: 50 }), accent: S(undefined, '#7a6a48'),
    },
    arch: { ...BASE_ARCH, wallHeight: 6, corridorHeight: 4.6, ceiling: 'truss', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: null, inlay: 'none', ribEvery: 0 },
    clear: '#0a0e12', fog: { color: '#1a2228', density: .011 }, hemi: .58, hemiGround: '#28302e',
    flame: { core: '#fff3d0', edge: '#ffb050', ember: '#ff8a30' }, lamp: { color: '#ffd8a4', intensity: 1.08, range: 20 }, pool: { color: '#ffcf8c', strength: 0.28 },
    props: ['props/Bookcase_1.gltf', 'props/BookGroup_Large_2.gltf', 'props/Book_Stack_3.gltf', 'props/BookStand.gltf', 'props/Scroll_1.gltf', 'props/Chain_Coil.gltf', 'props/Candle_3.gltf', 'dungeon/trunk_medium_B.glb'],
  }),
  // 5. Ordered production under low forcing vaults; root horror in one branch.
  cellars: preset({
    key: 'cellars', name: 'Glasshouse brick cellars', dungeon: 'glasshouse',
    surfaces: {
      wall: S('brick', '#d8c4a4'), trim: S('ashlar', '#d6cfbc', { scale: 2 }), floor: S('tiles', '#b0a48e', { spec: .12 }),
      floorTrim: S('brick', '#a08a6c'), ceiling: S('brick', '#c8b494'), timber: S('timber', '#7a5a3e'),
      metal: S(undefined, '#4e5a4a', { spec: .4 }), accent: S(undefined, '#4a6a3a'), glass: { tint: '#a8d0b0', alpha: .4, spec: .9, power: 100, emissive: '#2a4a32' },
    },
    arch: { ...BASE_ARCH, wallHeight: 3.8, corridorHeight: 3.8, ceiling: 'barrel', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: null, cornice: false, inlay: 'none', ribEvery: 4 },
    clear: '#080a07', fog: { color: '#1a2218', density: .012 }, hemi: .6, hemiGround: '#2c3424',
    flame: { core: '#f8ffe8', edge: '#ffd070', ember: '#ffa040' }, lamp: { color: '#f4e8b8', intensity: 1.02, range: 18 }, pool: { color: '#e8f0b0', strength: 0.25 },
    props: ['props/Pot_1.gltf', 'props/Pot_2.gltf', 'props/Bucket_Wooden_1.gltf', 'props/Shovel_Steel.gltf', 'props/Hoe_Bronze.gltf', 'props/Workbench.gltf', 'props/FarmCrate_Empty.gltf', 'props/Bag.gltf', 'town/Prop_Vine3.gltf', 'props/Shelf_Small_Bottles.gltf'],
  }),
  // 6. Glass manufacture: a bottle kiln, annealing routes and cool pane racks.
  furnace: preset({
    key: 'furnace', name: 'Furnace brick, iron and slag', dungeon: 'furnacehall',
    surfaces: {
      wall: S('brick', '#8a6a58'), trim: S('iron', '#6a625a', { spec: .35, power: 40 }), floor: S('flags', '#6e665e', { spec: .1 }),
      floorTrim: S('iron', '#4a4440'), inlay: S('setts', '#5a524a'), ceiling: S('brick', '#5e4a40'), timber: S('timber', '#3e2e22'),
      metal: S('iron', '#4c4844', { spec: .4, power: 40 }), accent: S(undefined, '#8ab0c8', { spec: .9, power: 100, alpha: .6 }),
      emit: emitter('#ff7a28', 1.1),
    },
    arch: { ...BASE_ARCH, wallHeight: 9, corridorHeight: 5, ceiling: 'truss', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: 4, cornice: false, inlay: 'grid', ribEvery: 0 },
    clear: '#0a0604', fog: { color: '#22140c', density: .012 }, hemi: .55, hemiGround: '#3a2416',
    flame: { core: '#fff2c0', edge: '#ff8a2a', ember: '#ff5a10' }, lamp: { color: '#ffb070', intensity: 1.26, range: 22 }, pool: { color: '#ff9a50', strength: 0.36 },
    props: ['props/Anvil.gltf', 'props/Bellows.gltf', 'props/Bucket_Metal.gltf', 'props/Hammer_Rack.gltf', 'props/Crate_Metal.gltf', 'props/Workbench_Vice.gltf', 'props/Cauldron.gltf', 'dungeon/barrel_large.glb', 'props/Chain_Coil.gltf', 'props/Shovel_Bronze.gltf'],
  }),
  // 7. Dry maintenance circuits round an impassable recessed wheel channel.
  sluice: preset({
    key: 'sluice', name: 'Sluice stone, iron and wet', dungeon: 'greatsluice',
    surfaces: {
      wall: S('rubble', '#8a948e', { spec: .25, power: 40 }), trim: S('ashlar', '#a2aaa2', { scale: 2, spec: .2 }), floor: S('flags', '#7e8682', { spec: .35, power: 50 }),
      floorTrim: S('iron', '#4e5652', { spec: .4 }), inlay: S('iron', '#4e5652', { spec: .4 }), ceiling: S('rubble', '#6e7672'), timber: S('timber', '#4a3e30'),
      metal: S('iron', '#5a605c', { spec: .45, power: 50 }), accent: S(undefined, '#8a6a3a', { spec: .6 }),
    },
    arch: { ...BASE_ARCH, wallHeight: 8, corridorHeight: 4.8, ceiling: 'barrel', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: 2.6, cornice: true, inlay: 'grid', ribEvery: 4 },
    clear: '#060a0a', fog: { color: '#142022', density: .013 }, hemi: .56, hemiGround: '#203034',
    flame: { core: '#fff6d8', edge: '#ffbc5a', ember: '#ff9440' }, lamp: { color: '#ffe2b0', intensity: 1.08, range: 20 }, pool: { color: '#ffd598', strength: 0.25 },
    props: ['props/Chain_Coil.gltf', 'props/Rope_2.gltf', 'dungeon/barrel_small_stack.glb', 'props/Bucket_Wooden_2.gltf', 'props/Crate_Metal.gltf', 'dungeon/keg.glb', 'props/Ladder.gltf', 'props/Shovel_Steel.gltf'],
  }),
  // 8. Forty filled towers, oak hoppers and working loading lanes.
  granary: preset({
    key: 'granary', name: 'Granary timber and stone', dungeon: 'greatgranary',
    surfaces: {
      wall: S('ashlar', '#d6c29c'), trim: S('timber', '#8a6a44'), floor: S('planks', '#b4946a', { spec: .1 }),
      floorTrim: S('flags', '#a8987c'), inlay: S('timber', '#6e5034'), ceiling: S('planks', '#9a7a54'), timber: S('timber', '#7e5e3c'),
      metal: S('iron', '#5e5850', { spec: .35 }), accent: S(undefined, '#c8b890'),
    },
    arch: { ...BASE_ARCH, wallHeight: 9, corridorHeight: 4.8, ceiling: 'truss', corridorCeiling: 'flat', door: 'lintel', pilasterEvery: 2, stringCourse: 3.6, cornice: false, framed: true, inlay: 'none', ribEvery: 0 },
    clear: '#0c0a06', fog: { color: '#241e14', density: .009 }, hemi: .66, hemiGround: '#3e3220',
    flame: { core: '#fff2c4', edge: '#ffae48', ember: '#ff8428' }, lamp: { color: '#ffd8a0', intensity: 1.14, range: 22 }, pool: { color: '#ffcc84', strength: 0.28 },
    props: ['props/Bag.gltf', 'props/Bag_2.gltf', 'props/FarmCrate_Empty.gltf', 'props/Barrel.gltf', 'dungeon/crates_stacked.glb', 'props/Stall_Cart_Empty.gltf', 'props/Shovel_Bronze.gltf', 'props/Page_Stack_Small.gltf', 'props/Desk.gltf'],
  }),
  // 9. An angular border bastion: broad flights, military rooms, the prepared reply.
  watchtower: preset({
    key: 'watchtower', name: 'Alpine watchtower stone', dungeon: 'greatwatchtower',
    surfaces: {
      wall: S('ashlar', '#b8bcbc', { bump: 1 }), trim: S('ashlar', '#d0d2ce', { scale: 2 }), floor: S('setts', '#9a9c98', { spec: .1 }),
      floorTrim: S('flags', '#8a8c88'), inlay: S('flags', '#7a7c78'), ceiling: S('planks', '#6a5a48'), timber: S('timber', '#5e4a36'),
      metal: S('iron', '#55585a', { spec: .4 }), accent: S(undefined, '#284a86', { spec: .25 }),
    },
    arch: { ...BASE_ARCH, wallHeight: 6.5, corridorHeight: 4.6, ceiling: 'groin', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: null, cornice: true, inlay: 'none', ribEvery: 0 },
    clear: '#8ea8b4', fog: { color: '#6e8692', density: .006 }, hemi: .8, hemiGround: '#46504e',
    flame: { core: '#fff4d0', edge: '#ffb24c', ember: '#ff8c2c' }, lamp: { color: '#ffdcaa', intensity: 1.02, range: 20 }, pool: { color: '#ffd090', strength: 0.25 },
    props: ['props/WeaponStand.gltf', 'props/Shield_Metal.gltf', 'props/Sword_Steel.gltf', 'dungeon/banner_shield_blue.glb', 'props/Barrel_Holder.gltf', 'props/Bench.gltf', 'dungeon/trunk_large_A.glb', 'props/Dummy.gltf', 'props/Table_Large.gltf'],
  }),
  // 10. Three centuries after the fire: cold vitrified terrain and a maintained signal.
  beaconfort: preset({
    key: 'beaconfort', name: 'Beacon fort dark basalt and ember', dungeon: 'beaconfort',
    surfaces: {
      wall: S('rubble', '#5a5654', { spec: .3, power: 60 }), trim: S('ashlar', '#6e6862', { scale: 2, spec: .25 }), floor: S('setts', '#5e5a56', { spec: .2 }),
      floorTrim: S('flags', '#4a4644'), inlay: S('flags', '#4a4644'), ceiling: S('rubble', '#3e3a38'), timber: S('timber', '#2e2620'),
      metal: S('iron', '#3a3836', { spec: .4 }), accent: S(undefined, '#3a4a5a', { spec: .8, power: 90 }), emit: emitter('#ff6a20', 1.2),
    },
    arch: { ...BASE_ARCH, wallHeight: 6, corridorHeight: 4.6, ceiling: 'barrel', corridorCeiling: 'barrel', pilasterEvery: 2, stringCourse: null, cornice: true, inlay: 'none', ribEvery: 4 },
    clear: '#3a3e44', fog: { color: '#2a2a2e', density: .008 }, hemi: .6, hemiGround: '#3a2a22',
    flame: { core: '#fff0b8', edge: '#ff7a24', ember: '#ff4a10' }, lamp: { color: '#ffa864', intensity: 1.32, range: 22 }, pool: { color: '#ff9048', strength: 0.39 },
    props: ['props/FirePit.gltf', 'props/Torch_Metal.gltf', 'dungeon/barrel_small.glb', 'props/Pot_1_Lid.gltf', 'props/Page_Stack_Small.gltf', 'dungeon/rubble_half.glb', 'props/Chain_Coil.gltf', 'props/WeaponStand.gltf'],
  }),
  // 11. Inside the Capital's castle keep: the empty throne, made up and never slept in.
  keep: preset({
    key: 'keep', name: "The Keep's royal stone", dungeon: 'keep',
    surfaces: {
      wall: S('ashlar', '#cfc8bc', { bump: .85 }), trim: S('marble', '#e4dccc', { spec: .4, power: 70 }), floor: S('marble', '#b4aca0', { spec: .5, power: 80 }),
      floorTrim: S('marble', '#5a2a2e', { spec: .5, power: 80 }), inlay: S('marble', '#c8a860', { spec: .6, power: 80 }), ceiling: S('plaster', '#bfb6a6'),
      timber: S('timber', '#4a3022'), metal: S(undefined, '#c09a4e', { spec: .7, power: 60 }), accent: S(undefined, '#6a1e26', { spec: .2 }),
    },
    arch: { ...BASE_ARCH, wallHeight: 8.5, corridorHeight: 5.2, ceiling: 'coffered', corridorCeiling: 'barrel', pilasterEvery: 1, stringCourse: 1.1, inlay: 'medallion', ribEvery: 4 },
    clear: '#06070a', fog: { color: '#14141a', density: .011 }, hemi: .58, hemiGround: '#2c2420',
    flame: { core: '#fff2cc', edge: '#ffb04a', ember: '#ff862c' }, lamp: { color: '#ffd8a4', intensity: 1.14, range: 22 }, pool: { color: '#ffcc88', strength: 0.3 },
    props: ['props/Chair_3.gltf', 'props/Table_Large.gltf', 'props/Banner_Vertical_1.gltf', 'props/Chest_Legendary.gltf', 'props/Bookcase_2.gltf', 'props/Rug_1.gltf', 'props/CandleStick_Stand.gltf', 'props/Shelf_Arch.gltf'],
  }),
};

/** zones.json dungeon key -> theme key */
export const THEME_FOR_DUNGEON: Record<string, string> = Object.fromEntries(Object.values(THEMES).map((t) => [t.dungeon, t.key]));

export function themeFor(keyOrDungeon: string): ThemePreset {
  const t = THEMES[keyOrDungeon] ?? THEMES[THEME_FOR_DUNGEON[keyOrDungeon]];
  if (!t) throw new Error(`no dungeon kit theme for ${keyOrDungeon}`);
  return t;
}
