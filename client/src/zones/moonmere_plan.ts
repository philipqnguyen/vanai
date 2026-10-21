// The whole of Moonmere's plan, every planner in its order (MOONMERE.md
// section 4): the riser bodies first (the ground ramps inside them, MM-6), the
// ground with them, then the houses, the named buildings, the streets, the
// harbour, the story spots and the paving. No Babylon: zones/moonmere.ts builds
// from exactly this, and the node tests read exactly this.
import { mmRiserBodies, planBlocks, planTowers, type BlocksOut, type Mounts } from "./moonmere_blocks.ts";
import { planCivic, type CivicOut } from "./moonmere_civic.ts";
import { planDressing, type DressOut } from "./moonmere_dress.ts";
import { planHarbour, type HarbourOut } from "./moonmere_harbour.ts";
import { planCauseway, MM_SOLID_BAYS } from "./moonmere_causeway.ts";
import { planOrchards } from "./moonmere_orchards.ts";
import { planPaving, type MmPaving } from "./moonmere_paving.ts";
import { planSpots, type SpotsOut } from "./moonmere_spots.ts";
import { planStreets, type StreetsOut } from "./moonmere_streets.ts";
import { mmTerrain, type Terrain } from "./moonmere_terrain.ts";
import type { Layout } from "./moonmere_types.ts";

export interface MoonmerePlan {
  L: Layout; T: Terrain; B: BlocksOut; C: CivicOut; S: StreetsOut; H: HarbourOut; paving: MmPaving[];
  /** the dressing at the bays' mounts and on the roofs (moonmere_dress.ts) */
  D: DressOut;
  /** the story spots and the residents' seats: planned on demand (the reach model samples the whole city) */
  spots: () => SpotsOut;
}

/** `mounts`: the manifest's mounts by file (manifest.json files.<name>.mounts) --
 * the joinery, the caps and the dressing stand at them; the layout carries a copy
 * (`L.mounts`, the generator's), which is the default.
 * `flightBodies`: the street flights stand on their own masonry rather than on
 * an embankment of terrain (zones/moonmere.ts FLIGHT_BODIES; MOONMERE.md A-3) */
export function planMoonmere(L: Layout, opts: { mounts?: Mounts | null; flightBodies?: boolean } = {}): MoonmerePlan {
  const flightBodies = !!opts.flightBodies;
  const mounts = (opts.mounts ?? L.mounts ?? null) as Mounts | null;
  const T = mmTerrain(L, mmRiserBodies(L), undefined, { fill: !flightBodies });
  const B = planBlocks(L, T, mounts);
  planTowers(L, B, mounts);
  const C = planCivic(L, T, B);
  const S = planStreets(L, T, { flightBodies });
  const H = planHarbour(L, T);
  // MM-15 (A-14): the causeway's own stone, Moonmere's end of it (moonmere_causeway.ts); the walk is
  // still scene.ts makeCauseway's. Its pieces and pylons ride the harbour's lists (cells `cw:*`)
  { const cw = planCauseway(L.causeway, { ramp: true, solid: MM_SOLID_BAYS, seaEnd: true }); H.pieces.push(...cw.pieces); H.boxes.push(...cw.boxes); }
  const D = planDressing({ ...L, mounts: mounts ?? undefined }, B, C, S, T);
  const paving = planPaving(L, S, B, C, { flightBodies, T, beds: D.beds });
  // L3 (S4, A-14): the outer lawns planted, clear of everything above (moonmere_orchards.ts)
  { const O = planOrchards(L, T, [...B.footprints, ...C.footprints], S, D, paving); D.pieces.push(...O.pieces); D.boxes.push(...O.boxes); }
  let spots: SpotsOut | null = null;
  return { L, T, B, C, S, H, D, paving, spots: () => spots ??= planSpots(L, B, C, H, T, S) };
}
