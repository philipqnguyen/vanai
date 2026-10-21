// The Empty Throne score's plumbing: what a piece file looks like, how the four
// battle groups divide the world, and a drum library so every composer is not
// re-deriving a backbeat. Pure and DOM-free; index.ts does the Vite-only part
// (finding the piece files) and the node tests import this directly.
//
// ---- writing a piece ----
//
// One file per piece in client/src/score/, default-exporting a Piece:
//
//   // score/caerdun.ts
//   import { GROOVES, FILLS, type Piece } from "./kit.ts";   // the .ts: node --test imports pieces directly
//   export default {
//     title: "Salt on the Gate",
//     zones: ["caerdun"],
//     note: "the bells are the harbour clock; listen for the horn answer in B",
//     song: { bpm: 112, sections: [...], form: [0, 1, 1, 2], loopFrom: 1 },
//   } satisfies Piece;
//
// A battle piece names its group instead of zones: `battle: "field"`. That is
// the whole registration — index.ts picks up every file here except itself and
// this one, and a piece scores exactly the zones (or group) it claims. A zone
// no piece claims plays no music (the tests fail on one), and two files
// claiming one zone is an error, not a coin toss.

import type { Drums, DrumGrid, Song } from "../music";

/** Philip's four battle groups (2026-10-11): one theme per region group. */
export type BattleGroup = "field" | "dungeon" | "capital" | "boss";

export const BATTLE_GROUPS: { key: BattleGroup; label: string; covers: string }[] = [
  { key: "field", label: "Field battle", covers: "every wild zone, road and city, and the ferry's two crossings" },
  { key: "dungeon", label: "Dungeon battle", covers: "the eleven dungeons" },
  { key: "capital", label: "Capital battle", covers: "the Burned Land and the empty Capital" },
  { key: "boss", label: "Boss", covers: "every named encounter, anywhere" },
];

export interface Piece {
  /** the name Philip sees in the jukebox */
  title: string;
  /** zone keys (zones.json) whose field theme this is */
  zones?: string[];
  /** or: the battle group this scores */
  battle?: BattleGroup;
  /** or: the cutscenes (cutscenes/*.json keys) written for it, e.g. the intro's overture */
  scenes?: string[];
  song: Song;
  /** one line for the listening pass: what to listen for, what is deliberate */
  note?: string;
}

/**
 * Which battle group a zone fights in. Dungeons by kind wherever they are —
 * the Keep and the Beacon Fort included — and the Burned Land and the empty
 * Capital as their own group; everything else, cities and the returned Capital
 * among them, is the field — the voyage zones too, though nothing fights on
 * the ferry. The old score (retired 2026-10-11) split the world the same way.
 */
export function battleGroupOf(zone: { kind?: string; region?: string } | undefined): Exclude<BattleGroup, "boss"> {
  if (!zone) return "field";
  if (zone.kind === "dungeon") return "dungeon";
  if (zone.kind !== "city" && (zone.region === "The Burned Land" || zone.region === "The Capital of Vanai")) return "capital";
  return "field";
}

export interface Entry { title: string; song: Song; file: string; note?: string }
export interface Score {
  zones: Record<string, Entry>;
  battle: Partial<Record<BattleGroup, Entry>>;
  scenes: Record<string, Entry>;
}

/** Fold the piece files into lookup tables, refusing anything ambiguous. */
export function buildScore(files: { file: string; piece: Piece }[]): Score {
  const score: Score = { zones: {}, battle: {}, scenes: {} };
  for (const { file, piece } of files) {
    if (!piece || !piece.song || !piece.title) throw new Error(`${file}: default export is not a Piece`);
    const zones = piece.zones ?? [];
    if (!zones.length && !piece.battle && !piece.scenes?.length) throw new Error(`${file}: claims no zones, no battle group and no scene`);
    const entry: Entry = { title: piece.title, song: piece.song, file, note: piece.note };
    for (const z of zones) {
      const had = score.zones[z];
      if (had) throw new Error(`${file}: zone ${z} is already scored by ${had.file}`);
      score.zones[z] = entry;
    }
    for (const s of piece.scenes ?? []) {
      const had = score.scenes[s];
      if (had) throw new Error(`${file}: scene ${s} is already scored by ${had.file}`);
      score.scenes[s] = entry;
    }
    if (piece.battle) {
      const had = score.battle[piece.battle];
      if (had) throw new Error(`${file}: battle group ${piece.battle} is already scored by ${had.file}`);
      score.battle[piece.battle] = entry;
    }
  }
  return score;
}

// ---- drums ----
//
// Ready grooves for `drums:`. Spread one and override a lane or add a fill:
//
//   drums: { ...GROOVES.drive, fill: FILLS.toms }
//   drums: { ...GROOVES.halftime, crash: onFirst("X...............", 8) }
//
// All 4/4 at 16 steps unless named for 6/8 (12 steps: sixteenths in a 6-eighth
// bar). The tempos are where each groove sits naturally, not limits.

export const GROOVES = {
  /** straight rock eighths, 100-140 */
  rock: {
    kick: "x.......x.x.....",
    snare: "....x.......x...",
    hat: "x.x.x.x.x.x.x.x.",
  },
  /** the battle default, 150-175: syncopated kick, hard backbeat, sixteenth hats */
  drive: {
    kick: "x.....x.x.....x. | x.....x.x..x..x.",
    snare: "....X.......X... | ....X.......X..o",
    hat: "xoxoxoxoxoxoxoxo",
  },
  /** the backbeat on 3 only — the same tempo feels twice as heavy; for B sections */
  halftime: {
    kick: "x.........x.....",
    snare: "........X.......",
    hat: "x.x.x.x.x.x.x.x.",
  },
  /** snare on every off-beat, 160-185: the fastest-feeling thing a kit does */
  twostep: {
    kick: "x...x...x...x...",
    snare: "..x...x...x...x.",
    hat: "x.x.x.x.x.x.x.x.",
  },
  /** kick gallop under a backbeat, 150-170: the cavalry charge */
  gallop: {
    kick: "x.xxx.xxx.xxx.xx",
    snare: "....X.......X...",
    hat: "x...x...x...x...",
  },
  /** a field march, snare-led, 96-124: towns, parades, the guard */
  march: {
    kick: "x.......x.......",
    snare: "X..ox.o.X..ox.oo",
  },
  /** taiko ensemble, 120-170: the big drums alone, no kit */
  taiko: {
    taiko: "3..2..2.3.2.1111 | 3..2..2.3..3.222",
  },
  /** 6/8 lilt for towns and fields, dotted-quarter 60-80 (song bpm 180-240) */
  lilt68: {
    kick: "x.....x.....",
    tom: "........2.2.",
    shaker: "x.xx.xx.xx.x",
  },
  /** 6/8 at a gallop for battle (song bpm 300+): kick on the dotted beats */
  jig68: {
    kick: "x.....x.....",
    snare: "...X.....X..",
    hat: "x.xx.xx.xx.x",
  },
} satisfies Record<string, Drums>;

/** One-bar fills, written over the groove's last bar (see Drums.fill). */
export const FILLS = {
  /** sixteenth snare build into the downbeat */
  snare: { snare: "x.x.x.x.xxxxXXXX", hat: "................" },
  /** down the toms */
  toms: { snare: "X.x.............", tom: "....11.12.22.333", hat: "................" },
  /** a two-stroke roll that thickens */
  roll: { snare: "rrrrrrrrrrrrRRRR", hat: "................" },
  /** everything stops on one: the breath before a section */
  stop: { kick: "X...............", snare: "X...............", hat: "................", crash: "X..............." },
  /** just the last beat */
  pickup: { snare: "............XXXX" },
} satisfies Record<string, DrumGrid>;

/** A lane that plays `cells` in the first bar of `bars` and rests after — a
 *  crash on the downbeat of a section, a single taiko hit. */
export function onFirst(cells: string, bars: number): string {
  const rest = ".".repeat(cells.replace(/[\s|]+/g, "").length || 16);
  return [cells, ...Array(Math.max(0, bars - 1)).fill(rest)].join(" | ");
}

// ---- the game's view ----

export interface Cue {
  title: string;
  song: Song;
  /** where it lives: `score/caerdun.ts` */
  file: string;
  note?: string;
}

/** The lookups the game and the jukebox use, over a built score. Pure, so the
 *  mapping is tested rather than trusted. */
export function makeCues(score: Score, zones: Record<string, { kind?: string; region?: string }>) {
  const fromEntry = (e: Entry): Cue => ({ title: e.title, song: e.song, file: e.file, note: e.note });
  /** A zone's field theme, or null for a zone no piece claims (silence, not a crash). */
  const fieldCue = (zone: string): Cue | null => (score.zones[zone] ? fromEntry(score.zones[zone]) : null);
  /** A group's battle theme; null only for a score with no piece for it. */
  const battleCue = (group: BattleGroup): Cue | null => (score.battle[group] ? fromEntry(score.battle[group]!) : null);
  const zoneGroup = (zone: string) => battleGroupOf(zones[zone]);
  /** A cutscene's own piece (the intro's overture), or null for one scored by its zone. */
  const sceneCue = (id: string): Cue | null => (score.scenes[id] ? fromEntry(score.scenes[id]) : null);
  /** The three pieces a zone hands the engine (audio.ts -> setZoneMusic). */
  const zoneMusic = (zone: string): { field: Song | null; battle: Song | null; boss: Song | null } => ({
    field: fieldCue(zone)?.song ?? null,
    battle: battleCue(zoneGroup(zone))?.song ?? null,
    boss: battleCue("boss")?.song ?? null,
  });
  return { fieldCue, battleCue, zoneGroup, zoneMusic, sceneCue };
}
