// ---------- The North Road — "The One Lit Window" ----------
// The cold way between Caerdun and Heartwood, levels 10-17: a snowbound upland
// under the cliff coast, drifts to the eaves, snow-hooded pines, a frozen tarn,
// and at the middle of the road the halfway inn — the one warm room in a
// hundred miles of snow, where the three cities' stories finally sit down at
// one table. The card is firm about it: beautiful, not bleak; winter as a
// postcard, never as a punishment, and the whole zone composed around the
// inn's amber window.
//
// So the piece is two rooms. Outside: B minor, 4/4 at a patient 84, footsteps
// in pizzicato quarters, a horn walking the road tune, and the snow as glass —
// single high notes that ring and never hurry. Inside: the door opens a half
// step up, from the road's F#7 straight onto G major (the surprise of warmth),
// and the same tempo turns busy — the reed's inn tune in eighths, a strummed
// lute, a walking bass, a kit with a shaker, a slight swing.
//
//   intro  snow: a cold flute line in fifths, glass, a long string swell —
//          skipped on the loop
//   A      the Road: the horn's tune, 4 + 4 + 4 + 4, over pizzicato footsteps
//          and glass snowfall; it ends on F#7, the door
//   B      the Halfway Inn: G major, the inn tune on reed, the flute answering
//          and then harmonising, the lute and the kit — the loudest section
//   C      Three Tables: the merge, at the inn. Each doorstep's tune in turn,
//          on its own instrument and in G: Caerdun's muster call on the horn
//          (from "Milestone Zero"), Heartwood's counting-song on the reed (from
//          "The Counting-Song"), the Moonmere Shores' tune on the piano (from
//          "Heard Before It's Seen"), and then all three at once on the cadence
//   A'     back out into the snow: the strings take the road tune, the flute
//          holds over it, and in bar 9 the reed remembers the inn tune's first
//          bar — the warmth carried out of the door. F#7 home to B minor on the loop.
//
// The Caerdun Fields next door are a 3/4 waltz in G; the Heartwood Fields a
// swung 4/4 in F. Both are in this piece, by name, at the table.

import type { Piece } from "./kit.ts";

const ROAD_CHORDS = `
  Bm | G      | D  | A    | Bm    | G   | Em7 | F#7sus4 F#7 |
  G  | D/F#   | Em | Bm/D | Cmaj7 | G/B | Em7 | F#7 `;
/** The road: a held step and a sigh down, four phrases, the last one on the
 *  dominant so the door (or the loop) can open. */
const ROAD = `
  b4:3 cs5:.5 d5:.5 | e5:2 d5 b4     | a4:3 fs4         | e4:1.5 fs4:.5 a4:2 |
  b4:3 cs5:.5 d5:.5 | g5:2 fs5 e5    | d5:1.5 cs5:.5 b4:2 | b4:2 as4:2       |
  d5:3 e5:.5 fs5:.5 | fs5:2 e5 d5    | e5:2 g5:2        | fs5:4              |
  e5:3 d5:.5 c5:.5  | b4:2 d5:2      | g4:1.5 a4:.5 b4 d5 | cs5:2 as4:2 `;
/** snow: single glass notes off the beat, each a chord tone, never two at once */
const SNOW = `
  b5:2 .:2 | . d6 .:2 | .:4 | .:2 cs6:2 | fs5:2 .:2 | . b5 .:2 | .:4 | .:2 as5:2 |
  d6:2 .:2 | . a5 .:2 | .:4 | .:2 fs5:2 | e6:2 .:2  | . d6 .:2 | .:4 | .:2 cs6:2 `;
/** the inn tune: eighths, round the G chord and back, the reed's bar-1 motif
 *  is the one A' remembers outside */
const INN = `
  d5:.5 g5:.5 b5:.5 a5:.5 g5 d5     | e5:.5 g5:.5 c6:.5 b5:.5 a5:2 | b5:.5 a5:.5 g5:.5 d5:.5 b4 d5 | e5:.5 fs5:.5 a5 fs5:2 |
  g5:.5 fs5:.5 e5:.5 b4:.5 e5 g5    | e5:.5 d5:.5 c5:.5 e5:.5 g5:2 | a5:.5 g5:.5 e5:.5 c5:.5 e5 g5 | fs5:1.5 e5:.5 d5:2   |
  d5:.5 g5:.5 b5:.5 a5:.5 g5 d5     | e5:.5 g5:.5 c6:.5 b5:.5 a5 g5 | g5:.5 b5:.5 g5:.5 d5:.5 b4:2  | e5:.5 fs5:.5 g5:.5 a5:.5 b5:2 |
  g5 e5:.5 g5:.5 c6 b5              | a5:1.5 fs5:.5 d5:2           | b4 d5 c5 a4                   | g4:2 .:2 `;

export default {
  title: "The One Lit Window",
  zones: ["northroad"],
  note: "two rooms: the snow road in B minor (horn, pizzicato footsteps, glass) and the inn in G (reed, lute, kit), entered by a half-step jump; in C the three doorstep tunes meet at one table",
  song: {
    bpm: 84, swing: 0.12, space: 3.0,
    sections: [
      // 0 — intro: snow
      {
        name: "intro",
        chords: "Bm | G | Em7 | F#7sus4 F#7",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "swell", vel: 0.6 },
        lead: { inst: "flute", vel: 0.7, n: "b4:2 fs5:2 | e5:2 d5:2 | e5:4 | cs5:2 as4:2" },
        counter: { inst: "glass", vel: 0.25, n: "fs6:2 .:2 | .:2 d6:2 | b5:4 | .:4" },
      },
      // 1 — A, the Road: horn, footsteps, snow
      {
        name: "A the Road",
        chords: ROAD_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "root", vel: 0.8 },
        lead: { inst: "horn", vel: 1.05, n: ROAD },
        counter: { inst: "glass", vel: 0.26, n: SNOW },
        arp: { inst: "pizz", pat: "0 . 1 . 2 . 1 .", unit: 0.5, oct: 3, vel: 0.8 },
      },
      // 2 — B, the Halfway Inn: the door opens a half step up
      {
        name: "B Halfway Inn",
        chords: "G | C | G | D | Em | C | Am7 | D7 | G | C | G/B | Em | C | D | G/D D7 | G",
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "walk", vel: 0.95 },
        lead: { inst: "reed", vel: 1.15, n: INN },
        // the second half harmonises a third over the reed's top notes (it sat
        // on them in unison, and its C rubbed the reed's passing B up high),
        // then drops under the tune for the cadence, where d5 c5 doubled it
        counter: { inst: "flute", vel: 0.6, n: `
          .:4 | .:4 | .:4 | .:2 a5?:.5 b5?:.5 d6 | .:4 | .:4 | .:4 | .:2 c6?:.5 b5?:.5 a5 |
          d6:4 | e6:4 | d6:4 | g5:4 | e5:4 | fs5:4 | g4:2 fs4:2 | b4:4 ` },
        hits: { inst: "lute", pat: "X.xoX.xo", unit: 0.5, oct: 3, vel: 0.7 },
        drums: {
          kick: "x.......x.x.....", snare: "....o.......o...", shaker: "x.x.x.x.x.x.x.x.", vel: 0.6,
          fill: { tom: "..........1.2.3.", every: 8 },
        },
      },
      // 3 — C, Three Tables: each doorstep's tune, then all three together
      {
        name: "C Three Tables",
        chords: "G | Em | G | Em7 | Cmaj7 | Am7 | C D7 | G",
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.8 },
        // Caerdun's muster call, then the cadence's tenor
        lead: { inst: "horn", vel: 1.0, n: "d4:.75 d4:.25 g4:1.5 a4:.5 b4 | b4:1.5 a4:.5 g4:2 | .:4 | .:4 | .:4 | .:4 | e4:2 fs4:2 | g4:4" },
        // Heartwood's counting-song, then the cadence's alto
        counter: { inst: "reed", vel: 0.95, n: ".:4 | .:4 | d5 g5:.5 g5:.5 a5 b5 | d6:1.5 b5:.5 g5:2 | .:4 | .:4 | c5:2 c5:2 | b4:4" },
        parts: [
          // the Moonmere Shores' tune, then the top of the cadence
          { inst: "piano", vel: 0.9, n: ".:4 | .:4 | .:4 | .:4 | d5:1.5 g5:.5 b5:2 | c6:1.5 b5:.5 a5 g5 | e5 g5 fs5 a5 | g5:4" },
        ],
        hits: { inst: "lute", pat: "x.xox.xo", unit: 0.5, oct: 3, vel: 0.45 },
        drums: { kick: "x.......x.......", shaker: "x.x.x.x.x.x.x.x.", vel: 0.4 },
      },
      // 4 — A', back into the snow, the inn's warmth carried out
      {
        name: "A' the Road",
        chords: ROAD_CHORDS,
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "root", vel: 0.85 },
        lead: { inst: "strings", vel: 3.0, n: ROAD },
        counter: { inst: "flute", vel: 0.45, n: `
          fs5:4 | g5:4 | fs5:4 | e5:4 | fs5:4 | b5:4 | g5:4 | b5:2 as5:2 |
          b5:4  | a5:4 | g5:4  | fs5:4 | g5:4 | g5:4 | g5:4 | fs5:2 e5:2 ` },
        parts: [
          { inst: "glass", vel: 0.22, n: SNOW },
          { inst: "reed", vel: 0.5, n: ".:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | d5:.5 g5:.5 b5:.5 a5:.5 g5 d5 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4" },
          { inst: "horn", vel: 0.5, n: "b3:4 | b3:4 | a3:4 | a3:4 | b3:4 | b3:4 | b3:4 | b3:2 as3:2 | b3:4 | a3:4 | b3:4 | b3:4 | c4:4 | b3:4 | b3:4 | as3:4" },
        ],
        arp: { inst: "pizz", pat: "0 . 1 . 2 . 1 .", unit: 0.5, oct: 3, vel: 0.8 },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
