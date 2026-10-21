// ---------- The Glassworks — "The Furnaces Never Banked" ----------
// The rain-shadow desert behind the crescent, where the imperial furnaces were
// never banked on the night and three centuries of heat vitrified a province
// into dunes of glass: perpetual golden hour, shimmer over the furnace row,
// panes still crated in the racking yard for a capital that stopped ordering
// them, the melt canal running out to the mirror flat. "The desert that
// glitters instead of glowers." Levels 20-30, and the most beautiful place
// anyone has been paid to loot.
//
// So: 7/8 at an eighth of 210, grouped 2+2+3 — a work rhythm with a limp in
// it, the bellows and the blowpipe, and the one wild zone in the score that
// walks in sevens (its neighbour's dungeon, the Great Granary, counts the same
// 2+2+3, in F and quicker). A mixolydian (A major with G natural): bright,
// but the flat seventh keeps it dry and sun-struck rather than heroic, and the
// tune comes home G -> A, bVII to I, not the march's V -> I (that is saved for
// the one bar that needs it). The C-major bar in A (the flat third) is the
// furnace glow. The glitter is literal: glass answers every phrase the reed
// leaves open.
//
//   intro  heat shimmer: a pad, the lute's 2+2+3 starting, the tune's opening
//          as glass glints, the taiko breathing once a bar — skipped on loop
//   A      Furnace Row: the tune on the reed over the lute ostinato, a soft
//          taiko breath on every downbeat. Half-close on Em in bar 8, the C
//          glow in bar 12, home on the bVII-I in bar 16.
//   A'     Racking Yard: the flute takes the tune, the reed a countermelody
//          below, a glass pedal clinking like crated panes, kick and tom in
//          on the groups
//   B      Mirror Flat: F# minor, the band stops working — choir, strings,
//          the horn in long lines with its own echo a bar later in glass (the
//          mirror), the flute in contrary motion in the second half. The
//          quietest section; the homesick one.
//   C      The Melt: the works at full heat — the brass takes a broad tune
//          that leans on the flat side (C, F, G), lute struck in the 2+2+3,
//          taiko and kick, flute descant; it ends on E and drops straight back
//          into A's downbeat, the one V-I in the piece
//
// Neighbours: the Granary Plains (3/4, F) and the Border Wall (5/4, Eb) share
// the house sound — strings, reed, flute, horn — but no key, meter or groove.

import { onFirst, type Piece } from "./kit.ts";

/** The tune. 2+2+3 in most bars, broken where the line needs to move. */
const TUNE = `
  e4:2 a4:2 cs5:3 | d5 cs5 b4:2 g4:3 | a4:2 cs5:2 e5:3 | fs5:2 e5 d5 a4:3 |
  cs5:2 a4:2 fs4:3 | a4:2 b4:2 d5:3 | e5:2 d5:2 b4 g4:2 | b4:5 .:2 |
  e4:2 a4:2 cs5:3 | d5:2 cs5:2 b4:3 | cs5:2 e5:2 a5:3 | g5:2 e5 d5 c5:3 |
  fs5:2 e5:2 d5:3 | d5:2 a4:2 fs4:3 | g4:2 b4:2 d5 b4:2 | a4:5 .:2 `;
const TUNE_CHORDS = `
  A | G/A | A   | D/A    | F#m | D     | Em | Em7 |
  A | G/A | A   | C      | D   | D/F#  | G  | A `;
/** glass answers in the gaps the tune leaves at bars 4, 8, 12 and 16 */
const GLINTS = `
  .:7 | .:7 | .:7 | .:4 a5:3 | .:7 | .:7 | .:7 | .:5 e6:2 |
  .:7 | .:7 | .:7 | .:4 e6:3 | .:7 | .:7 | .:7 | .:5 a5:2 `;
/** A' only: the reed under the flute, holding where the tune moves */
const REED_COUNTER = `
  a3:4 cs4:3 | d4:7 | cs4:4 e4:3 | fs4:4 a4:3 | e4:7 | fs4:4 e4:3 | g4:7 | d4:4 e4:3 |
  cs4:7 | d4:4 e4:3 | e4:7 | e4:4 g4:3 | fs4:4 a4:3 | fs4:4 d4:3 | b3:4 d4:3 | cs4:7 `;
const bars = (n: number, s: string) => Array(n).fill(s).join(" | ");
/** The bass written out, root then octave on the 2+2+3's long group. The
 *  engine's `oct` pattern used to split the bar in half, which in 7/8 put the
 *  octave a sixteenth before the third group (music.ts bassSteps now steps 7/8
 *  as 2+2+3, the same as this). Roots are pitch classes; all sit in the C2
 *  octave. */
const bass223 = (roots: string) =>
  roots.trim().split(/\s*\|\s*/).map((r) => `${r}2:4 ${r}3:3`).join(" | ");
const TUNE_BASS = bass223("a | a | a | a | fs | d | e | e | a | a | a | c | d | fs | g | a");

// 14 steps a bar (sixteenths of 7/8); the groups start on steps 0, 4 and 8
const SHAKER = "x.o.x.o.x.o.o.";

export default {
  title: "The Furnaces Never Banked",
  zones: ["glassworks"],
  note: "7/8 grouped 2+2+3, A mixolydian: the reed's tune, the glass glinting in its gaps, the Mirror Flat's horn echoed a bar later, and the brass Melt that drops back to A on the piece's one V-I",
  song: {
    bpm: 210, beats: 7, space: 2.8,
    sections: [
      // 0 — intro: heat shimmer and the tune's first bar as glass. Skipped on the loop.
      {
        name: "intro",
        chords: "A | G/A | D/A | E",
        pad: { inst: "pad", vel: 0.7 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "lute", pat: "0 3 1 3 0 2 3", unit: 1, oct: 3, vel: 0.45 },
        lead: { inst: "glass", vel: 0.45, n: "e5:2 a5:2 cs6:3 | .:7 | d5:2 fs5:2 a5:3 | b5:4 gs5:3" },
        parts: [{ inst: "taiko", vel: 0.35, n: "d2:7 | d2:7 | d2:7 | d2:4 d2?:1 d2?:2" }],
      },
      // 1 — A, Furnace Row: the reed's tune over the lute
      {
        name: "A Furnace Row",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.55 }, bass: null,
        arp: { inst: "lute", pat: "0 3 1 3 0 2 3", unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "reed", vel: 0.95, n: TUNE },
        counter: { inst: "glass", vel: 0.4, n: GLINTS },
        parts: [{ inst: "bass", vel: 0.72, n: TUNE_BASS }],
        drums: { shaker: SHAKER, taiko: "3.............", vel: 0.55 },
      },
      // 2 — A', Racking Yard: flute tune, reed counter, the panes clinking
      {
        name: "A' Racking Yard",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: null,
        arp: { inst: "lute", pat: "0 3 1 3 0 2 3", unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "flute", vel: 0.95, n: TUNE },
        counter: { inst: "reed", vel: 0.6, n: REED_COUNTER },
        // the panes knock every other bar: every bar was 32 clinks in a row
        parts: [
          { inst: "glass", vel: 0.22, n: bars(8, "a5:2 e6:2 .:3 | .:7") },
          { inst: "bass", vel: 0.81, n: TUNE_BASS },
        ],
        drums: {
          kick: "x.......x.....", tom: "....2.......2.", shaker: SHAKER, taiko: "3.............", vel: 0.6,
          fill: { tom: "....2...1.2.33", every: 8 },
        },
      },
      // 3 — B, Mirror Flat: the horn and its glass reflection, the flute contrary
      {
        name: "B Mirror Flat",
        chords: `
          F#m | Dmaj7 | Bm7 | F#m   | D | A/C#  | Bm7 | Esus4 |
          F#m | Dmaj7 | Bm7 | F#m/A | G | D/F#  | Em7 | E `,
        pad: { inst: "choir", vel: 0.5 }, bass: { pat: "swell", vel: 0.65 },
        arp: { inst: "harp", pat: "0 . 2 . 1 . 3", unit: 1, oct: 4, vel: 0.45 },
        lead: { inst: "horn", vel: 0.8, n: `
          fs4:4 a4:3 | cs5:7 | d5:4 cs5:3 | a4:7 | fs4:4 a4:3 | e5:7 | d5:4 fs5:3 | e5:7 |
          cs5:4 e5:3 | fs5:4 e5:3 | d5:4 b4:3 | cs5:7 | b4:4 d5:3 | a4:7 | g4:4 b4:3 | a4:4 gs4:3 ` },
        // the mirror: each horn bar comes back a bar later, an octave up, in glass
        counter: { inst: "glass", vel: 0.3, n: `
          .:7 | fs5:4 a5:3 | cs6:7 | d6:4 cs6:3 | a5:7 | fs5:4 a5:3 | e6:7 | d6:4 fs6:3 |
          .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 ` },
        parts: [{ inst: "flute", vel: 0.5, n: `
          .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 |
          e6:4 cs6:3 | a5:4 b5:3 | fs5:4 a5:3 | e5:7 | d6:4 b5:3 | a5:4 fs5:3 | e5:4 g5:3 | b5:7 ` }],
        drums: { shaker: "x.....o.x.....", vel: 0.35 },
      },
      // 4 — C, The Melt: the brass tune on the flat side, the works at full heat
      {
        name: "C The Melt",
        chords: `
          D | C   | G/B | A | D | C     | Em7 | A |
          F | C/E | D   | A | F | G     | Esus4 | E `,
        pad: { inst: "strings", vel: 0.8 }, bass: null,
        hits: { inst: "lute", pat: "X.x.Xx.", unit: 1, oct: 3, vel: 0.5 },
        lead: { inst: "brass", vel: 0.85, n: `
          a4:2 d5:2 fs5:3 | e5:2 g5:2 e5 c5:2 | d5:4 b4:3 | cs5:2 e5:2 a4:3 |
          a4:2 d5:2 fs5:3 | g5:2 a5:2 g5 e5:2 | fs5:2 e5:2 d5:3 | e5:7 |
          f5:2 e5:2 c5:3 | e5:2 d5:2 c5 g4:2 | a4:2 d5:2 fs5:3 | e5:4 cs5:3 |
          a4:2 c5:2 f5:3 | g5:2 f5:2 d5:3 | e5:2 a4:2 b4:3 | b4:3 gs4:2 e4:2 ` },
        counter: { inst: "flute", vel: 0.5, n: `
          a5:7 | g5:7 | b5:7 | cs6:7 | a5:7 | c6:4 b5:3 | b5:7 | cs6:4 e6:3 |
          c6:7 | g5:7 | a5:4 fs5:3 | e5:7 | c6:7 | d6:4 b5:3 | b5:7 | gs5:7 ` },
        parts: [
          { inst: "timpani", vel: 0.5, n: `
            d2:7 | .:7 | .:7 | a1:4 a1:3 | d2:7 | .:7 | .:7 | a1:.5*14 |
            f2:7 | .:7 | d2:7 | a1:4 a1:3 | f2:7 | g2:7 | e2:7 | e2:.5*10 e2!:2 ` },
          { inst: "bass", vel: 0.72, n: bass223("d | c | b | a | d | c | e | a | f | e | d | a | f | g | e | e") },
        ],
        drums: {
          kick: "x.......x.....", tom: "....2.......2.", taiko: "3...2...3.2.1.", shaker: SHAKER,
          crash: onFirst("x.............", 8), vel: 0.6,
          fill: { tom: "1.1.2.2.3.3333", every: 8 },
        },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
