// ---------- The Gulf Ferry — "Ten Gold, Fair Weather" ----------
// The paid crossing of the Western Gulf, pier to pier between the Moonmere
// Shores and the Caerdun Fields: seven minutes at sea on a broad-beamed ship
// with striped sails, a green-blue gulf to every horizon and nothing to fight.
// Passengers stand at the rail and talk, and the fare has already been paid.
// Philip asked for something soothing — the rest between adventures — so this
// is the one piece in the score with nowhere to be.
//
// So: a barcarolle, the boat song, in 6/8 at a dotted-quarter 48 (bpm 144 in
// eighths) — slower than the Hunting Wood's amble, rocking rather than
// walking: long-short in the tune, the bass on the two dotted beats like the
// ship riding a swell, the harp rolling up and back over every bar. G major,
// a neighbour to Caerdun's D, with no drums but a shaker in the one bar group
// where the passengers get chatty. The ship's bell opens it and rings it
// back round, so the loop comes home the way the ship does.
//
//   intro  the ship's bell twice and the harp's swell — skipped on the loop
//   A      Cast Off: the tune on flute over the rolling harp and a strings bed;
//          half-close on bar 8, home on bar 16
//   B      Open Water: E minor, the long breath — the horn takes a broad tune
//          over a choir bed (the size of the sea), glass catching the sun on
//          the water, a B7 that leans and lets go
//   C      Midgulf: D major, a small tune on the reed over a picking lute while
//          the passengers talk, a shaker on the dotted beats, a gull in the flute
//   A'     Landfall: the tune again with the reed under it in long tones and
//          the horn holding the bass line; the ship's bell on the last bar
//          rocks it back to A
//
// Nothing here pushes: no drums but that shaker, and no note shorter than an
// eighth anywhere in the piece.

import type { Piece } from "./kit.ts";

const SWELL_CHORDS = `
  G | C/G | G | D/F# | Em | C   | Am7 | D7sus4 D |
  G | C/G | G | Em   | C  | G/D | D7  | G `;
/** The tune: long-short, rocking. Half-close on bar 8, home on bar 16. */
const SWELL = `
  d5:3 b4:2 d5   | e5:3 g5:2 e5   | d5:2 b4 g4:3   | a4:6         |
  b4:3 e5:2 fs5  | g5:3 e5:2 c5   | e5:2 d5 c5:2 a4 | c5:3 a4:3   |
  d5:3 b4:2 d5   | e5:3 g5:2 e5   | d5:2 g5 b5:3   | g5:2 fs5 e5:3 |
  c5:2 e5 g5:3   | b5:3 g5:2 b5   | a5:2 fs5 d5:2 c5 | b4:6 `;
/** the harp's swell: up the chord and back over one bar */
const ROLL = { inst: "harp" as const, pat: "0 1 2 3 2 1", unit: 1, oct: 3, vel: 0.7 };

export default {
  title: "Ten Gold, Fair Weather",
  zones: ["gulf_to_caerdun", "gulf_to_moonmere"],
  note: "a barcarolle (6/8 at a dotted-quarter 48, G major) for the crossing: nothing pushes, the bass rides the two dotted beats like a swell, and the ship's bell closes the loop the way it opened",
  song: {
    bpm: 144, beats: 6, space: 3.4,
    sections: [
      // 0 — intro: the ship's bell, the harp's swell. Skipped on the loop.
      {
        name: "intro",
        chords: "G | Cmaj7/G | G | D7sus4 D",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "swell", vel: 0.6 },
        arp: ROLL,
        lead: { inst: "bell", vel: 0.4, n: "g5:3 g5:3 | .:6 | .:6 | .:6" },
        counter: { inst: "flute", vel: 0.4, n: ".:6 | .:6 | d6?:1 b5:2 .:3 | a5:6" },
      },
      // 1 — A, Cast Off
      {
        name: "A Cast Off",
        chords: SWELL_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.75 },
        arp: ROLL,
        lead: { inst: "flute", vel: 1.0, n: SWELL },
        parts: [{ inst: "glass", vel: 0.25, n: ".:6 | .:6 | .:6 | d6:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | b5:6 | .:6 | .:6 | .:6 | .:6" }],
      },
      // 2 — B, Open Water: the horn's long breath over the choir
      {
        name: "B Open Water",
        chords: `
          Em | C | G | D | Em | C | Am | B7 |
          C | G/B | Am7 | D | C | G/B | Am7 | D7sus4 D `,
        pad: { inst: "choir", vel: 0.85 }, bass: { pat: "oct", vel: 0.85 },
        arp: { inst: "harp", pat: "0 2 1 3 2 1", unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "horn", vel: 1.15, n: `
          b4:3 e5:3     | e5:2 d5 c5:3  | b4:2 a4 g4:2 b4 | a4:6         |
          b4:3 e5:3     | g5:2 fs5 e5:3 | e5:3 c5:2 a4    | b4:3 a4:3    |
          g4:3 c5:3     | d5:2 c5 b4:3  | c5:3 e5:2 g5    | fs5:6        |
          e5:3 c5:3     | d5:2 b4 g4:3  | a4:2 c5 e5:3    | c5:3 a4:3 ` },
        // sun on the water: one glint where the horn holds
        counter: { inst: "glass", vel: 0.35, n: `
          .:6 | .:6 | .:6 | fs5:3 a5:3 | .:6 | .:6 | .:6 | ds6:6 |
          .:6 | .:6 | .:6 | a5:3 d6:3  | .:6 | .:6 | .:6 | .:6 ` },
        // the strings swell under the horn: the one section that breathes in
        parts: [{ inst: "strings", vel: 2.2, n: `
          g4:6 | g4:6 | g4:6 | fs4:6 | g4:6 | e4:6 | e4:6 | ds4:6 |
          e4:6 | d4:6 | e4:6 | fs4:6 | e4:6 | d4:6 | c4:6 | d4:6 ` }],
      },
      // 3 — C, Midgulf: reed and lute pass a small tune, the passengers talk
      {
        name: "C Midgulf",
        chords: "D | G/D | D | A | Bm | G Em | Em7 A7 | Dsus4 D7",
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "oct", vel: 0.65 },
        arp: { inst: "lute", pat: "0 1 2 1 2 1", unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "reed", vel: 0.8, n: `
          a4:2 d5 fs5:2 e5 | g5:2 d5 b4:2 d5 | fs5:3 a5:2 fs5 | e5:6 |
          fs5:2 d5 b4:2 d5 | g5:2 fs5 e5:2 d5 | e5:3 cs5:3     | d5:3 c5:3 ` },
        // a gull, where the reed holds
        counter: { inst: "flute", vel: 0.4, n: ".:6 | .:6 | .:6 | cs6:2 b5 a5:3 | .:6 | .:6 | .:6 | .:6" },
        drums: { shaker: "x.o...x.o...", vel: 0.4 },
      },
      // 4 — A', Landfall: the reed under the tune, the bell to close
      {
        name: "A' Landfall",
        chords: SWELL_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "oct", vel: 0.8 },
        arp: ROLL,
        lead: { inst: "flute", vel: 1.05, n: SWELL },
        counter: { inst: "reed", vel: 0.7, n: `
          g4:6 | g4:3 e4:3 | d4:6 | fs4:6 | g4:6 | e4:3 g4:3 | e4:6 | g4:3 fs4:3 |
          b3:3 d4:3 | c4:3 e4:3 | d4:6 | e4:3 g4:3 | e4:6 | d4:6 | c4:3 fs4:3 | d4:6 ` },
        parts: [
          { inst: "horn", vel: 0.55, n: `
            .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 |
            g3:6 | e3:6 | d3:6 | e3:6 | c3:6 | d3:6 | d3:6 | g3:6 ` },
          { inst: "bell", vel: 0.35, n: ".:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | g5:3 g5:3" },
        ],
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
