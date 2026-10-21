// What every skill and spell looks like, as data (Philip, 2026-10-12: "FFXIV
// flashy", every job, projectiles that are only visuals, a rune style per job
// with the element choosing the colour). Babylon-free, so the node tests read
// it (client/test/spell_fx_plan.test.mjs); spell-fx.ts draws it.
//
// Why a family per ability and not the element: abilities.json has three
// elements for 94 abilities. Stone, Aero and the steel swords are all
// "steel"; Blizzard, Thunder, Bio and Sleep are all "shadow"; Fire, Banish and
// Holy are all "radiance". The look is the ability's `fx` field (one of
// FX_FAMILIES below), the tier is its key's numeral, and the colour is the
// family's -- for a weapon skill, the element's, because there the element
// IS what the blade carries.
//
// Sizes are metres around a 1.8 m body; spell-fx.ts scales a target's effects
// by the monster's measured height (a wyrm is not a rabbit).

export type FxKind = "spell" | "ws" | "ja";

/** A palette: [deep, main, highlight]. Additive light, so `deep` is the edge
 *  and the haze, `main` the body, `highlight` the hot core. */
export type Palette = readonly [string, string, string];

/** The projectile a spell throws from the caster's hands (none: it lands on
 *  the target out of the air -- Thunder from the sky, Holy from above). */
export type Projectile = "rock" | "fireball" | "ice" | "wind" | "lance" | "orb" | "miasma" | null;

export interface FamilySpec {
  kind: FxKind;
  colours: Palette;
  projectile?: Projectile;
  /** big moment: a wider circle, a second ring, the screen-filling impact */
  grand?: boolean;
  /** an aura that stays on the target while the status lasts */
  lasting?: boolean;
}

export const ELEMENT_COLOURS: Record<string, Palette> = {
  // steel is a cold blue, not white: over a sunlit meadow white is all a pale steel showed
  steel: ["#2a4a8c", "#7aa8ff", "#e8f0ff"],
  shadow: ["#3a1a6a", "#a07cff", "#ece2ff"],
  radiance: ["#a0661e", "#ffc46a", "#fff6dc"],
};

export const FX_FAMILIES: Record<string, FamilySpec> = {
  // ---- black magic
  stone: { kind: "spell", colours: ["#6b4318", "#e0a250", "#ffe6b0"], projectile: "rock" },
  fire: { kind: "spell", colours: ["#9a2205", "#ff6a1a", "#ffd88a"], projectile: "fireball" },
  flare: { kind: "spell", colours: ["#a82c00", "#ff8a2a", "#fff4c8"], projectile: "fireball", grand: true },
  blizzard: { kind: "spell", colours: ["#1d4f8a", "#7fd4ff", "#ecfcff"], projectile: "ice" },
  freeze: { kind: "spell", colours: ["#2a50a8", "#9adcff", "#ffffff"], projectile: null, grand: true },
  thunder: { kind: "spell", colours: ["#3c2092", "#a88cff", "#fff8c8"], projectile: null },
  aero: { kind: "spell", colours: ["#1a6a48", "#6cffc0", "#e8fff6"], projectile: "wind" },
  sleep: { kind: "spell", colours: ["#2c1c60", "#a080ff", "#ece0ff"], projectile: "orb", lasting: true },
  aspir: { kind: "spell", colours: ["#0e2c70", "#4c8cff", "#cce2ff"], projectile: "orb" },
  // ---- dark knight
  bio: { kind: "spell", colours: ["#3c1a52", "#86cc3a", "#dcff96"], projectile: "miasma" },
  drain: { kind: "spell", colours: ["#4c0814", "#e8304c", "#ffb6bc"], projectile: "orb" },
  // ---- white magic
  banish: { kind: "spell", colours: ["#a4741e", "#ffd46c", "#fffbe8"], projectile: "lance" },
  holy: { kind: "spell", colours: ["#b08c3c", "#fff0b4", "#ffffff"], projectile: null, grand: true },
  cure: { kind: "spell", colours: ["#2a7c40", "#8cffb0", "#f2fff4"] },
  benediction: { kind: "spell", colours: ["#8c7c2c", "#fff2a4", "#ffffff"], grand: true },
  esuna: { kind: "spell", colours: ["#5c88a4", "#d8f6ff", "#ffffff"] },
  raise: { kind: "spell", colours: ["#a47a2c", "#ffd88c", "#fffaf0"], grand: true },
  protect: { kind: "spell", colours: ["#7c5c1e", "#ffd06c", "#fff6d4"], lasting: true },
  regen: { kind: "spell", colours: ["#1e6c3c", "#7cffa4", "#e2ffea"], lasting: true },
  lamp: { kind: "spell", colours: ["#1e3c8c", "#6cb6ff", "#e2f2ff"], lasting: true },
  // ---- job abilities
  enmity: { kind: "ja", colours: ["#7c0a0a", "#ff3c2a", "#ffc4a4"] },
  flash: { kind: "ja", colours: ["#8c8a6a", "#fff8dc", "#ffffff"] },
  stun: { kind: "ja", colours: ["#7c6c1a", "#ffe66c", "#ffffff"], lasting: true },
  guard: { kind: "ja", colours: ["#6c4c1a", "#ffc862", "#fff2cc"], lasting: true },
  circle: { kind: "ja", colours: ["#7c1c1c", "#ff8a6c", "#fff2e4"], lasting: true },
  blood: { kind: "ja", colours: ["#520012", "#ff2444", "#ffb4a4"], lasting: true },
  dread: { kind: "ja", colours: ["#20082c", "#a63cff", "#ffb8ff"], lasting: true },
  ki: { kind: "ja", colours: ["#8c5c10", "#ffbe3c", "#fff4cc"], lasting: true },
  stance: { kind: "ja", colours: ["#6c1010", "#ff5a4a", "#fff0ea"], lasting: true },
  evade: { kind: "ja", colours: ["#1a4c6c", "#8ce2ff", "#ffffff"], lasting: true },
  focus: { kind: "ja", colours: ["#8c6c1a", "#ffd86c", "#fffbe2"] },
  // ---- weapon skills: the job's form, the element's colour
  blade: { kind: "ws", colours: ELEMENT_COLOURS.steel },
  iai: { kind: "ws", colours: ELEMENT_COLOURS.steel },
  reap: { kind: "ws", colours: ELEMENT_COLOURS.shadow },
  fists: { kind: "ws", colours: ELEMENT_COLOURS.radiance },
  smite: { kind: "ws", colours: ELEMENT_COLOURS.radiance },
};

/** The rune each job draws under its feet while it casts (and flashes on an
 *  instant ability). The number is the rune shader's uStyle. */
export const JOB_RUNES: Record<string, { style: number; name: string }> = {
  BLM: { style: 0, name: "arcane: a heptagram, angular sigils, ticks" },
  WHM: { style: 1, name: "floral: petals, a halo, a soft script" },
  DRK: { style: 2, name: "thorned: a sawtooth rim, inverted triangles, a hollow core" },
  MNK: { style: 3, name: "mandala: prayer beads, twelve spokes, a chant band" },
  PLD: { style: 4, name: "crest: a cross in a square, a sword at each quarter" },
  SAM: { style: 5, name: "enso: one brushed circle, open at the top, brush strokes" },
};
/** a monster's cast (mcast): red, jagged, unmistakably hostile */
export const ENEMY_RUNE = 6;
export const ENEMY_COLOURS: Palette = ["#5c0606", "#ff3a28", "#ffc0a0"];

/** the numeral on an ability's key: stone_iii is tier 3 */
export function tierOf(key: string): number {
  const m = /_(i{1,3}|iv|v)$/.exec(key);
  if (!m) return 1;
  return ({ i: 1, ii: 2, iii: 3, iv: 4, v: 5 } as Record<string, number>)[m[1]];
}

export interface AbilityLike {
  job?: string; name?: string; kind?: string; fx?: string; element?: string;
  power?: number; cast?: number; duration?: number; effect?: string; target?: string;
}

export interface ResolvedFx {
  key: string;
  family: string;
  kind: FxKind;
  job: string;
  /** 1 small .. 4 the biggest the family has; grand families count as 4 */
  tier: number;
  colours: Palette;
  projectile: Projectile;
  grand: boolean;
  lasting: boolean;
  /** the job's rune (uStyle) */
  rune: number;
  /** the caster's circle radius in metres */
  runeRadius: number;
  /** a lasting aura's seconds, when the ability says */
  duration?: number;
}

/** A weapon skill's tier comes from its power, the only measure the data has
 *  of an opener (1.8-2.2) against a finisher (3.0+). */
export function wsTier(power = 2): number {
  return power >= 3.0 ? 3 : power >= 2.4 ? 2 : 1;
}

export function resolveFx(key: string, ab: AbilityLike): ResolvedFx | null {
  const family = ab.fx;
  if (!family || !FX_FAMILIES[family]) return null;
  const spec = FX_FAMILIES[family];
  const kind = spec.kind;
  const grand = !!spec.grand;
  const tier = grand ? 4 : kind === "ws" ? wsTier(ab.power) : tierOf(key);
  const colours = kind === "ws" ? (ELEMENT_COLOURS[ab.element ?? ""] ?? spec.colours) : spec.colours;
  const job = ab.job ?? "BLM";
  return {
    key, family, kind, job, tier, colours, grand,
    projectile: spec.projectile ?? null,
    lasting: !!spec.lasting,
    rune: (JOB_RUNES[job] ?? JOB_RUNES.BLM).style,
    runeRadius: runeRadius(tier, grand),
    duration: ab.duration,
  };
}

/** the caster's circle: 1.5 m for a first-tier spell, 2.4 m for the grand ones */
export function runeRadius(tier: number, grand = false): number {
  if (grand) return 2.4;
  return 1.5 + (Math.min(tier, 4) - 1) * 0.22;
}

/** A projectile's flight: quick enough that the number it trails is not
 *  stale (the damage shows at once; the bolt is only light, Philip
 *  2026-10-12), long enough to be seen to travel. */
export function flightTime(distance: number, projectile: Projectile): number {
  const speed = projectile === "rock" ? 24 : projectile === "lance" ? 40 : projectile === "miasma" ? 18 : 30;
  return Math.max(0.18, Math.min(0.55, distance / speed));
}

/** How many of a thing an impact throws, by tier: Stone's rocks, Blizzard's
 *  crystals, Fists' blows. */
export function countFor(family: string, tier: number): number {
  switch (family) {
    case "stone": return [0, 3, 5, 7, 9][Math.min(tier, 4)];
    case "blizzard": return [0, 4, 6, 8, 8][Math.min(tier, 4)];
    case "freeze": return 12;
    case "fists": return [0, 3, 4, 5][Math.min(tier, 3)];
    case "blade": case "iai": case "reap": case "smite": return [0, 1, 2, 3][Math.min(tier, 3)];
    default: return tier;
  }
}

/** A point along a projectile's path at t in [0, 1]: a quadratic arc that
 *  rises `lift` metres at its middle, from a to b (which may move: the
 *  caller passes the target's position this frame, so the bolt homes). */
export function arcPoint(a: readonly [number, number, number], b: readonly [number, number, number], t: number, lift: number): [number, number, number] {
  const u = 1 - t;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + lift, mz = (a[2] + b[2]) / 2;
  return [
    u * u * a[0] + 2 * u * t * mx + t * t * b[0],
    u * u * a[1] + 2 * u * t * my + t * t * b[1],
    u * u * a[2] + 2 * u * t * mz + t * t * b[2],
  ];
}

/** A jagged bolt from the sky to (0,0,0): `n` points from `height` down,
 *  each pushed sideways by up to `spread`, with a seeded hash so a bolt is
 *  the same in a test and different every cast in play. */
export function boltPath(height: number, n: number, spread: number, seed: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = height * (1 - t);
    // fully sideways in the middle, pinned at the strike point
    const k = i === n ? 0 : spread * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    pts.push([(rnd() - 0.5) * 2 * k, y, (rnd() - 0.5) * 2 * k]);
  }
  return pts;
}

/** The impact's fade: up fast, a hold, and a long tail, as a [0, 1] gain. */
export function envelope(t: number, attack = 0.08, hold = 0.25): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < attack) return t / attack;
  if (t < attack + hold) return 1;
  const r = (t - attack - hold) / (1 - attack - hold);
  return (1 - r) * (1 - r);
}

/** A cast's charge, 0 at its start to 1 at release: the circle tightens and
 *  brightens toward the end the way FFXIV's does, so a long cast is seen to
 *  build rather than sit. */
export function charge(elapsed: number, total: number): number {
  if (total <= 0) return 1;
  const t = Math.max(0, Math.min(1, elapsed / total));
  return t * t * (3 - 2 * t);
}
