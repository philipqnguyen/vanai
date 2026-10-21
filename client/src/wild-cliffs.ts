// DRESSING THE STEEP GROUND: rock bodies on every face wild-terrain.ts's
// landforms (or the field itself) made too steep to walk. The plan is
// wild-terrain.ts planCliffDressing (pure, tested); this places it.
//
// Why a zone wants it: buildTerrain already tints steep ground to bare stone
// (scene.ts, "Steep ground is ROCK"), but the mesh is drawn on a ~4.7 m grid,
// so a ravine wall or a mesa's side renders as a band of stretched, faceted
// triangles. Rock bodies standing in that band, turned along the face and as
// tall as its drop, are what make it read as a cliff rather than as a fold in
// a sheet.
//
// The cost is bounded and counted, not measured (RULINGS, "Performance"): the
// bodies are the rim's own mountain-scale rocks (nature.ts mountainRock),
// thin-instanced through placeExact, so the whole dressing is ONE draw per
// rock file -- and NONE extra when `tint` is the rim's, because the instances
// then join the rim's own template. `max` caps the instance count and with it
// the vertices (a generated rock is ~500-800 vertices; 140 bodies is ~100k).
//
//   build: (size) => { ...; dressCliffs(KEY, size, { roads: ROADS, tint: "#a09880" }); }
//
// Call it from the zone's `build` (after the terrain exists; heightFn is the
// finished field by then, carves included). It keeps off every road you pass,
// every NPC / portal / crystal / node / landing in zones.json (zoneKeepClear),
// the scatter exclusions (water, crystals, whatever the zone excluded), and
// the outer `margin` metres of the plate, where the rim stands.
import { placeExact, ground, scatterBlocked, zoneShape, polySignedDist } from "./scene";
import { mountainRock } from "./nature";
import { ZONES } from "./data";
import { planCliffDressing, zoneKeepClear, type CliffPlanOpts, type CliffSpot, type Pt } from "./wild-terrain";

// The rocks' own heights, MEASURED (the same numbers as scene.ts RIM_ROCK,
// which sizes the rim by crown height the same way): a body's scale is its
// face's drop over the rock's height, never a guessed factor. Medium_3 and
// Medium_2 are left out -- the thinnest of the six, they read as slabs leaning
// on the slope rather than as the slope's own stone.
const CLIFF_ROCK: Record<string, { height: number; along: number; depth: number }> = {
  "nature/Rock_Big_1.gltf":    { height: 4.576, along: 2.814, depth: 2.447 },
  "nature/Rock_Big_2.gltf":    { height: 3.806, along: 2.932, depth: 3.005 },
  "nature/Rock_Medium_1.gltf": { height: 2.260, along: 1.727, depth: 1.839 },
  "nature/Rock_Medium_4.gltf": { height: 2.483, along: 2.321, depth: 1.897 },
};

export interface DressCliffOpts extends Partial<Omit<CliffPlanOpts, "bounds" | "inside">> {
  roads?: { pts: Pt[]; half: number }[];
  tint?: string;          // the rim's tint, to share its templates (and draws)
  snow?: boolean;         // snow caps, as the rim's
  margin?: number;        // metres inside the plate's edge kept bare (default 45: the rim's reach)
  files?: string[];       // rock files to deal from (default the four in CLIFF_ROCK)
  keepClearR?: number;    // radius kept bare round each zones.json spot (default 8)
  useExclusions?: boolean;// honour the zone's scatter exclusions (default true)
  stretch?: number;       // how much longer than tall a body is laid along its face (default 1.6)
  thin?: number;          // its depth into the bank against its height (default 0.5)
}

/** Dress a zone's steep faces with rock. Returns what it placed, for counts. */
export function dressCliffs(zoneKey: string, size: number, o: DressCliffOpts = {}): { spots: CliffSpot[]; files: Record<string, number> } {
  const margin = o.margin ?? 45, half = size / 2;
  const shape = zoneShape(zoneKey);
  const inside = shape
    ? (x: number, z: number) => polySignedDist(shape.pts, x, z) > margin
    : (x: number, z: number) => Math.abs(x) < half - margin && Math.abs(z) < half - margin;
  const avoid = zoneKeepClear(ZONES, zoneKey, o.keepClearR ?? 8).concat(o.avoid ?? []);
  const blocked = o.useExclusions === false ? o.blocked
    : (x: number, z: number) => scatterBlocked(x, z) || !!o.blocked?.(x, z);
  const spots = planCliffDressing(ground, {
    ...o, bounds: { x0: -half, x1: half, z0: -half, z1: half }, inside, avoid, blocked,
    seed: o.seed ?? (zoneKey.length * 7919 + 13),
  });

  const files = (o.files ?? Object.keys(CLIFF_ROCK)).filter((f) => CLIFF_ROCK[f]);
  const stretch = o.stretch ?? 1.6, thin = o.thin ?? 0.5;
  const byFile: Record<string, { x: number; z: number; scale: number; rot: number; yOff: number; sx: number; sy: number; sz: number }[]> = {};
  let last = -1;
  spots.forEach((s, i) => {
    // never the same rock twice running (RIM.md's anti-wallpaper rule), dealt
    // off the spot's own position so a re-plan keeps its rocks
    let k = Math.floor(Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453) % files.length);
    if (k === last && files.length > 1) k = (k + 1 + (i % (files.length - 1))) % files.length;
    last = k;
    const file = files[k], m = CLIFF_ROCK[file];
    const sc = s.crown / m.height, sz = sc * thin;
    // INTO THE BANK, not standing off it. First look (tmp/wilds/foundation/
    // terrain/demo1): bodies centred on the face, as deep as they were tall,
    // stood out as a ring of boulders round the mesa and filled the ravine's
    // floor. Laid long along the face, thin across it, and pushed uphill by
    // half their own depth, only the outer half of each shows: a run of them
    // reads as the face's stone breaking through, and the floor stays open.
    const push = m.depth * sz * 0.5;
    const x = s.x + s.ux * push, z = s.z + s.uz * push;
    (byFile[file] ??= []).push({
      x, z, rot: s.yaw + (i % 2 ? Math.PI : 0), scale: sc,
      sx: sc * stretch * (0.85 + (i * 0.37 % 0.3)), sy: sc, sz,
      // seated at the face's foot, a fifth of the crown buried, as the rim seats its own
      yOff: s.y - ground(x, z) - s.crown * 0.2,
    });
  });
  const counts: Record<string, number> = {};
  for (const [file, list] of Object.entries(byFile)) {
    placeExact(mountainRock(file), list, 0, { tint: o.tint, snowCaps: o.snow ? "up" : undefined });
    counts[file] = list.length;
  }
  return { spots, files: counts };
}
