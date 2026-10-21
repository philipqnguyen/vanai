// ---------- The Caerdun Fields — "Milestone Zero" ----------
// Caerdun's home countryside, levels 1-10: the first field outside any
// hometown. Watch farms and pine breaks in first light, the granite city and
// its lighthouse behind your shoulder, one gold road running east to milestone
// zero, where the empire's two roads part. Safe, early, worth defending — the
// garrison's own farms, so the soldiers' music has come out here too, but it
// has taken its boots off.
//
// So: G major, the city's D major moved down a fifth, and 3/4 at a strolling
// 116 — the same muster call Caerdun's march opens with (the dotted rise to
// the fourth, then up the scale), relaxed into a country waltz. The city
// keeps time to the letter; the fields keep it to the bar. Strings and pizzicato
// oom-pah-pah instead of a snare, the flute instead of brass; the horn mostly
// answers, in the gaps, with the call's own first three notes, which is how
// you know where these farms belong.
//
//   intro  the city's clock bell on its own D (now the fifth of the key), and
//          a horn giving the muster call softly in G — skipped on the loop
//   A      First Light: the tune on flute over harp and pizzicato, the horn
//          answering at each half-close. 8 + 8, half-close on D, home on G.
//   B      the Watch Farms: E minor, the working day — the reed has the tune,
//          lute picking eighths, kick and tom on the downbeat and the third
//          beat, a shaker; the flute answers bar 4 and bar 8, then floats a
//          descant over the second half
//   A'     the Gold Road: the tune again with the horn under it in long tones,
//          the reed doubling an octave down, light kit, timpani on the phrases
//   C1     Milestone Zero: the band drops out where the roads part. A choir
//          bed, the horn alone with the call in long notes over Cmaj7 and Bm7,
//          a bell — the empire's road, older than anyone here. The one
//          homesick passage, and it is only eight bars.
//   C2     the Roads Part: the strings take a rising line out of it, the
//          timpani walks up to D7 and back onto the tune's downbeat
//
// Next door, the Hunting Wood is 6/8 in C, the North Road a slow 4/4 in B
// minor, and the gulf ferry a barcarolle in this same G (so the crossing lands
// without a key change). The cut from the city's march in four to the fields'
// three is the first thing a new player hears change.

import type { Piece } from "./kit.ts";

/** The tune. Bar 1 is the muster call (Caerdun's theme opens with it) in 3/4;
 *  bar 5 is the same call a step higher in the relative minor, as the city does
 *  it. Half-close on bar 8, home on bar 16. A and A' play it. */
const TUNE = `
  d5:.75 d5:.25 g5:1.5 a5:.5 | b5:1.5 a5:.5 g5 | e5 g5 c6      | a5:2 .      |
  b4:.75 b4:.25 e5:1.5 fs5:.5 | g5:1.5 fs5:.5 e5 | a5:1.5 g5:.5 e5 | fs5:2 a4 |
  d5:.75 d5:.25 g5:1.5 a5:.5 | c6:1.5 b5:.5 a5 | g5:2 b5        | a5:1.5 g5:.5 e5 |
  c5 e5 a5                   | g5:1.5 a5:.5 b5 | c6 a5 fs5      | g5:2 . `;
const TUNE_CHORDS = "G | Em | C | D | Em | C | Am7 | D7 | G | C | G/B | Em | Am7 | C | D7 | G";
/** The horn answers where the tune rests: the call's first three notes. */
const ANSWER = `
  .:3 | .:3 | .:3 | . fs4:.75 fs4:.25 a4 | .:3 | .:3 | .:3 | . d4:.75 d4:.25 fs4 |
  .:3 | .:3 | .:3 | .:3                  | .:3 | .:3 | .:3 | . d4:.75 d4:.25 g4 `;
/** A' only: long horn tones moving against the tune. */
const HORN_LONG = `
  d4:3 | e4:3 | e4:3 | fs4:3 | g4:3 | e4:3 | e4:3 | d4:3 |
  d4:3 | e4:3 | d4:3 | b3:3  | c4:3 | e4:3 | d4:1.5 c4:1.5 | b3:3 `;

export default {
  title: "Milestone Zero",
  zones: ["caerdunfields"],
  note: "3/4, G major: Caerdun's muster call relaxed into a country waltz — listen for the horn answering with the call's first three notes, the reed's working tune in B, and the eight quiet bars at the milestone",
  song: {
    bpm: 116, beats: 3, space: 2.6,
    sections: [
      // 0 — intro: the city clock behind you, the call in the new key
      {
        name: "intro",
        chords: "G | Em/G | G | Dsus4 D",
        pad: { inst: "strings", vel: 0.68 }, bass: { pat: "swell", vel: 0.79 },
        lead: { inst: "horn", vel: 0.85, n: "d4:.75 d4:.25 g4:1.5 a4:.5 | b4:2 a4 | g4:1.5 e4:.5 d4 | d4:3" },
        counter: { inst: "bell", vel: 0.4, n: "d5:3 | .:3 | d5:3 | .:3" },
        parts: [{ inst: "glass", vel: 0.25, n: ".:3 | g5:3 | .:3 | a5:3" }],
      },
      // 1 — A, First Light
      {
        name: "A First Light",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.68 }, bass: { pat: "root", vel: 0.9 },
        lead: { inst: "flute", vel: 1.02, n: TUNE },
        counter: { inst: "horn", vel: 0.62, n: ANSWER },
        arp: { inst: "harp", pat: "0 2 1 2 3 2", unit: 0.5, oct: 4, vel: 0.62 },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 4, vel: 0.85 },
      },
      // 2 — B, the Watch Farms: the reed's working tune, lute, a plain beat
      {
        name: "B Watch Farms",
        chords: "Em | C | G | D | Em | C | Am | B7 | C | D | G | Em | C | Am7 | Dsus4 D | D7",
        pad: { inst: "strings", vel: 0.56 }, bass: null,
        lead: { inst: "reed", vel: 1.02, n: `
          e4 g4:.5 a4:.5 b4 | c5:1.5 b4:.5 a4 | g4 b4 d5     | a4:1.5 g4:.5 fs4 |
          e4 g4:.5 a4:.5 b4 | e5:1.5 d5:.5 c5 | a4:.5 b4:.5 c5 e5 | ds5:2 b4   |
          e5:1.5 g5:.5 e5   | d5:1.5 c5:.5 a4 | b4 d5 g5     | e5:2 b4          |
          c5 e5 g5          | e5:1.5 d5:.5 c5 | g5:1.5 fs5:1.5 | fs4 a4 c5 ` },
        counter: { inst: "flute", vel: 0.51, n: `
          .:3 | .:3 | .:3 | d6?:.5 c6?:.5 a5:2 | .:3 | .:3 | .:3 | fs5?:.5 a5?:.5 b5:2 |
          c6:3 | a5:3 | b5:3 | b5:3 | c6:3 | c6:3 | a5:3 | fs5:3 ` },
        // root on one, fifth on three: the farm cart's gait
        parts: [{ inst: "bass", vel: 0.9, n: `
          e2:2 b2 | c2:2 g2 | g2:2 d2 | d2:2 a2 | e2:2 b2 | c2:2 g2 | a2:2 e2 | b1:2 fs2 |
          c2:2 g2 | d2:2 a2 | g2:2 d2 | e2:2 b2 | c2:2 g2 | a2:2 e2 | d2:1.5 d2:1.5 | d2 fs2 a2 ` }],
        arp: { inst: "lute", pat: "0 1 2 1 2 1", unit: 0.5, oct: 3, vel: 0.9 },
        drums: { kick: "x...........", tom: "........2...", shaker: "x.o.x.o.x.o.", vel: 0.56 },
      },
      // 3 — A', the Gold Road: the tune with the horn under it and the kit in
      {
        name: "A' Gold Road",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.79 }, bass: { pat: "root", vel: 1.02 },
        lead: { inst: "flute", vel: 1.07, n: TUNE },
        counter: { inst: "horn", vel: 0.68, n: HORN_LONG },
        parts: [
          { inst: "reed", oct: -1, vel: 0.51, n: TUNE },
          { inst: "timpani", vel: 0.51, n: `
            g1:3 | .:3 | .:3 | d2:3 | e2:3 | .:3 | .:3 | d2:3 |
            g1:3 | .:3 | .:3 | e2:3 | a1:3 | .:3 | d2:1.5 d2:1.5 | g1:3 ` },
        ],
        arp: { inst: "harp", pat: "0 2 1 2 3 2", unit: 0.5, oct: 4, vel: 0.56 },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 4, vel: 0.9 },
        drums: { kick: "x...........", snare: "....o...o...", shaker: "x.o.x.o.x.o.", vel: 0.56, fill: { tom: "....2...1.1.", every: 8 } },
      },
      // 4 — C1, Milestone Zero: the band drops out where the roads part
      {
        name: "C1 Milestone Zero",
        chords: "Cmaj7 | Bm7 | Am7 | Em | Cmaj7 | Bm7 | Am7 | D",
        pad: { inst: "choir", vel: 0.68 }, bass: { pat: "swell", vel: 0.73 },
        lead: { inst: "horn", vel: 0.85, n: `
          g4:1.5 g4:.5 c5 | d5:3 | c5:1.5 b4:.5 a4 | b4:3 |
          g4:1.5 g4:.5 e5 | d5:2 a4 | e5:1.5 d5:.5 c5 | a4:3 ` },
        counter: { inst: "bell", vel: 0.32, n: "g5:3 | .:3 | .:3 | .:3 | e5:3 | .:3 | .:3 | .:3" },
        arp: { inst: "harp", pat: "0 1 2 3 . .", unit: 0.5, oct: 4, vel: 0.45 },
      },
      // 5 — C2, the Roads Part: the strings climb out, the timpani walks to D7
      {
        name: "C2 Roads Part",
        chords: "Em | D/F# | G | C | Am7 | Bm7 | C | D7",
        pad: { inst: "strings", vel: 0.73 }, bass: { pat: "root", vel: 0.9 },
        lead: { inst: "strings", vel: 2.49, n: `
          b4:2 e5 | d5:2 a4 | b4:1.5 d5:.5 g5 | e5:3 |
          e5:1.5 fs5:.5 g5 | fs5:1.5 e5:.5 d5 | e5 g5 c6 | a5:2 fs5 ` },
        counter: { inst: "reed", vel: 0.56, n: "g4:3 | fs4:3 | g4:3 | g4:3 | a4:3 | b4:3 | c5:3 | c5:1.5 a4:1.5" },
        arp: { inst: "harp", pat: "0 2 1 2 3 2", unit: 0.5, oct: 4, vel: 0.56 },
        parts: [{ inst: "timpani", vel: 0.51, n: "e2:3 | .:3 | .:3 | .:3 | a1:3 | b1:3 | c2:3 | d2?:.25*8 d2:1" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
