// The pure half of creatures.ts: a creature's measured stats as the kit
// writes them, which clip it should play, and when it drops to its LOD1.
// No Babylon and no JSON import, so the node tests read it directly.

export interface CreatureStats {
  file: string;
  plan: string;
  height: number;    // top above the feet, metres
  length: number;
  width: number;
  minY: number;      // lowest vertex in the bind pose (a held weapon may go below the feet)
  groundY: number;   // lowest vertex of everything but held weapons: the feet, about 0
  forward: number;   // mid-point of the z extent, metres
  tris: number[];
  budget: number;
  bones: number;
  atlas: number;
  emissive: boolean;
  mr?: boolean;
  clips: Record<string, number>;
  speeds: Record<string, number>;
  bytes: number;
  notes: string;
  role?: string;     // "common" (a shared look) or "unique"
  // palette variants painted on the same UVs: creatures/<key>@<id>.jpg
  variants?: Record<string, { atlas: string; emit?: string; mr?: string; bytes: number }>;
  planFile?: string;
}

export interface CreatureUse {
  creature: string;   // creature key / GLB name
  h?: number;         // world height in metres; default: as built
  variant?: string;   // a palette variant's id: its atlas replaces the GLB's
  tint?: number[];    // fallback until that atlas is painted: a small lightness shift, linear multiply
}

/** The plan's looks as tools/data/bestiary_looks.mjs writes them
 * (client/src/creature-looks.json). */
export interface CreatureLooks {
  glbs: Record<string, { look: string; plan: string; show: string; monsters: string[]; variants: Record<string, { palette: string[]; crusts: string[]; monsters: string[] }> }>;
  monsters: Record<string, { glb: string; h: number; variant?: string; tint?: number[] }>;
}

/** monster -> the creature it wears, for every monster whose GLB is built
 * (all of them: the client tests and tools/data/audit.py check it). */
export function monsterTable(looks: CreatureLooks, built: (glb: string) => boolean): Record<string, CreatureUse> {
  const table: Record<string, CreatureUse> = {};
  for (const [monster, m] of Object.entries(looks.monsters)) {
    if (built(m.glb)) table[monster] = { creature: m.glb, h: m.h, ...(m.variant ? { variant: m.variant } : {}), ...(m.tint ? { tint: m.tint } : {}) };
  }
  return table;
}

/** Beyond this many metres a creature draws its LOD1. Big ones switch later. */
export function lodDistance(heightM: number): number {
  return 14 + 9 * heightM;
}

/** The clip a creature should be playing, and its rate. Pure, so the node
 * tests can check the choice. */
export interface CreatureState {
  moving: boolean;
  speed: number;        // ground speed, m/s
  attacking: boolean;
  attackFlip: boolean;  // alternates Attack_A / Attack_B per swing
  casting: boolean;
  hit: boolean;
  special: boolean;
}

export function creatureClip(stats: Pick<CreatureStats, "clips" | "speeds">, s: CreatureState): { clip: string; loop: boolean; rate: number } {
  const has = (c: string) => c in stats.clips;
  if (s.special && has("Special")) return { clip: "Special", loop: false, rate: 1 };
  if (s.attacking) {
    const c = s.attackFlip && has("Attack_B") ? "Attack_B" : "Attack_A";
    return { clip: c, loop: false, rate: 1.1 };
  }
  if (s.casting && has("Cast")) return { clip: "Cast", loop: true, rate: 1 };
  if (s.hit && has("Hit")) return { clip: "Hit", loop: false, rate: 1 };
  if (s.moving) {
    const walk = stats.speeds.Walk || 1.5;
    const run = stats.speeds.Run || walk * 2;
    // past the midpoint the run reads better than a sped-up walk
    const clip = s.speed > (walk + run) / 2 ? "Run" : "Walk";
    const nat = clip === "Run" ? run : walk;
    const rate = Math.min(1.8, Math.max(0.55, s.speed / nat));
    return { clip, loop: true, rate };
  }
  return { clip: "Idle", loop: true, rate: 1 };
}
