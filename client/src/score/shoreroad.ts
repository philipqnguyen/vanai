// ---------- The Shore Road — "Sandals Off" ----------
// The southern way between Heartwood and Moonmere, levels 10-17: where the
// climate softens. Palms leaning over a gold strand, the warm sea glittering
// south-east, a coach halt at the middle of the road with a stall and a
// fisher's hut, and a wrecked imperial grain ship half-buried in the sand — the
// one dark silhouette, three hundred years from the harbour it was bound for.
// Moonmere's only land road, so everyone bound for the academy walks it. The
// card's mood is heat, salt and ease — the south's answer to the winter road.
//
// So: A major and a habanera at 92 — the lazy dotted rhythm (dotted eighth,
// sixteenth, two eighths) in the bass and the strummed lute, which is the
// sound of not hurrying in the sun. Long flute notes that land late and lean.
// The North Road is two rooms; this is one long afternoon with a cloud over it
// for eight bars.
//
//   intro  the habanera on its own — bass, lute, a shaker — skipped on the loop
//   A      the Palm Strand: the tune on flute, 8 + 8, with a minor iv (Dm6)
//          in the second half for the one wistful turn a sunny tune is allowed
//   B      the Coach Halt: D major and straight eighths, a conversation — the
//          reed and the flute trade four-bar lines like a student and a
//          coachman, over a walking bass and a light backbeat
//   C      the Grain-Ship Wreck: the band drops away; F# minor, a low horn,
//          soft timpani, a glass note where the sun catches the hull. Dread
//          only at the edge: the empire's ship that never got home.
//   A'     the strand at full sun: flute with the strings an octave under it,
//          the reed's long counter-line, the kick on the habanera
//
// Next door, the Heartwood Fields swing in F and the Moonmere Shores drift in
// a slow E-flat; this is the only Latin feel on the map.

import type { Piece } from "./kit.ts";

/** One bar of habanera bass: root, root, third, fifth, twice. */
const hab = (r: string, t: string, f: string) => `${r}:.75 ${r}:.25 ${t}:.5 ${f}:.5 ${r}:.75 ${r}:.25 ${t}:.5 ${f}:.5`;
/** half a bar of it, for a bar with two chords */
const hab2 = (r: string, t: string, f: string) => `${r}:.75 ${r}:.25 ${t}:.5 ${f}:.5`;
const bars = (...b: string[]) => b.join(" | ");

const TUNE_CHORDS = `
  A | A  | D/A | A    | F#m | D   | Bm7     | E7 |
  A | A7 | D   | Dm6  | A/E | F#m | Bm7 E7  | A `;
const TUNE = `
  e5:1.5 cs5:.5 a4 cs5 | e5:3 fs5:.5 e5:.5 | fs5:1.5 a5:.5 fs5 d5 | e5:4          |
  cs5:1.5 e5:.5 a5 fs5 | a5:1.5 fs5:.5 d5:2 | fs5:1.5 e5:.5 d5 b4 | gs4:2 b4 d5   |
  e5:1.5 cs5:.5 a4 cs5 | g5:3 fs5:.5 e5:.5  | fs5:1.5 a5:.5 d6 a5 | f5:2 e5 d5    |
  cs5:1.5 e5:.5 a5:2   | a5 gs5:.5 fs5:.5 cs5:2 | d5 fs5 e5 d5    | cs5:3 . `;
const TUNE_BASS = bars(
  hab("a2", "cs3", "e3"), hab("a2", "cs3", "e3"), hab("a2", "d3", "fs3"), hab("a2", "cs3", "e3"),
  hab("fs2", "a2", "cs3"), hab("d2", "fs2", "a2"), hab("b1", "d2", "fs2"), hab("e2", "gs2", "b2"),
  hab("a2", "cs3", "e3"), hab("a2", "cs3", "g3"), hab("d2", "fs2", "a2"), hab("d2", "f2", "b2"),
  hab("e2", "a2", "cs3"), hab("fs2", "a2", "cs3"), hab2("b1", "d2", "fs2") + " " + hab2("e2", "gs2", "b2"), hab("a2", "cs3", "e3"));
/** the lute strums the same rhythm the bass walks */
const HABANERA = "X..xX.x.";

export default {
  title: "Sandals Off",
  zones: ["shoreroad"],
  note: "a habanera at 92 in A: the dotted bass and lute are the heat; listen for the reed and flute trading lines at the coach halt in B, and the eight shaded bars at the wreck in C",
  song: {
    bpm: 92, space: 2.4,
    sections: [
      // 0 — intro: the habanera alone
      {
        name: "intro",
        chords: "A | D/A | A | E7",
        pad: { inst: "strings", vel: 0.5 }, bass: null,
        parts: [{ inst: "bass", vel: 0.7, n: bars(hab("a2", "cs3", "e3"), hab("a2", "d3", "fs3"), hab("a2", "cs3", "e3"), hab("e2", "gs2", "b2")) }],
        hits: { inst: "lute", pat: HABANERA, unit: 0.25, oct: 3, vel: 0.5 },
        counter: { inst: "glass", vel: 0.22, n: ".:4 | .:4 | e6:4 | .:4" },
        drums: { shaker: "xoxoxoxoxoxoxoxo", vel: 0.4 },
      },
      // 1 — A, the Palm Strand
      {
        name: "A Palm Strand",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.6 }, bass: null,
        lead: { inst: "flute", vel: 1.0, n: TUNE },
        parts: [{ inst: "bass", vel: 0.72, n: TUNE_BASS }],
        hits: { inst: "lute", pat: HABANERA, unit: 0.25, oct: 3, vel: 0.55 },
        drums: { shaker: "xoxoxoxoxoxoxoxo", kick: "x..x....x..x....", vel: 0.42 },
      },
      // 2 — B, the Coach Halt: straight eighths, two voices trading lines
      {
        name: "B Coach Halt",
        chords: "D | G | D | A7 | D | G | Em7 | A7 | Bm | F#m | G | D | Bm7 | E7 | Esus4 E | E7",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "walk", vel: 0.8 },
        lead: { inst: "reed", vel: 1.0, n: `
          fs5:.5 e5:.5 d5:.5 e5:.5 fs5 a5 | g5:.5 fs5:.5 e5:.5 d5:.5 b4:2 | a4:.5 b4:.5 d5:.5 e5:.5 fs5 d5 | e5:2 cs5 a4 |
          .:4 | .:4 | .:4 | .:4 |
          d5:.5 cs5:.5 b4:.5 cs5:.5 d5 fs5 | cs5:.5 d5:.5 e5:.5 fs5:.5 e5 cs5 | d5:.5 e5:.5 g5:.5 fs5:.5 e5 d5 | a4 d5 fs5:2 |
          .:4 | .:4 | .:4 | .:4 ` },
        counter: { inst: "flute", vel: 0.85, n: `
          .:4 | .:4 | .:4 | .:4 |
          fs5:.5 a5:.5 d6:.5 a5:.5 fs5 a5 | b5:.5 a5:.5 g5:.5 fs5:.5 e5:2 | e5:.5 fs5:.5 g5:.5 b5:.5 d6 b5 | a5:2 g5 e5 |
          .:4 | .:4 | .:4 | .:4 |
          b5:.5 a5:.5 fs5:.5 d5:.5 fs5 a5 | gs5:.5 fs5:.5 e5:.5 d5:.5 b4:2 | a5:2 gs5:2 | b5 gs5 e5 d5 ` },
        arp: { inst: "pizz", pat: "0 2 1 2 0 2 1 2", unit: 0.5, oct: 3, vel: 0.75 },
        drums: { kick: "x.......x.......", snare: "....o.......o...", shaker: "x.x.x.x.x.x.x.x.", vel: 0.5 },
      },
      // 3 — C, the Grain-Ship Wreck: a cloud over the sun
      {
        name: "C Grain-Ship Wreck",
        chords: "F#m | D | Bm | C#7sus4 C#7 | F#m | D | Bm7 | E7sus4 E7",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.85, n: `
          cs4:2 fs4:1.5 gs4:.5 | a4:3 fs4 | d4:1.5 fs4:.5 b4:2 | fs4:2 es4:2 |
          cs4:2 fs4:1.5 gs4:.5 | a4:2 fs4 a4 | d5:2 cs5 b4    | a4:2 gs4:2 ` },
        counter: { inst: "glass", vel: 0.26, n: ".:4 | cs6:4 | .:4 | .:4 | .:4 | a5:4 | .:4 | .:4" },
        parts: [{ inst: "timpani", vel: 0.4, n: "fs2:4 | .:4 | .:4 | cs2?:.25*8 cs2:2 | fs2:4 | .:4 | .:4 | e2?:.25*8 e2:2" }],
        arp: { inst: "harp", pat: "0 1 2 . . . . .", unit: 0.5, oct: 3, vel: 0.45 },
      },
      // 4 — A', the strand at full sun
      {
        name: "A' Palm Strand",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: null,
        lead: { inst: "flute", vel: 1.05, n: TUNE },
        counter: { inst: "reed", vel: 0.55, n: `
          a4:4 | cs5:4 | d5:4 | cs5:4 | a4:4 | a4:4 | b4:4 | b4:2 gs4:2 |
          a4:4 | g4:4  | fs4:4 | f4:4 | e4:4 | fs4:4 | fs4:2 gs4:2 | a4:4 ` },
        parts: [
          { inst: "bass", vel: 0.8, n: TUNE_BASS },
          { inst: "strings", oct: -1, vel: 1.8, n: TUNE },
        ],
        hits: { inst: "lute", pat: HABANERA, unit: 0.25, oct: 3, vel: 0.65 },
        drums: { shaker: "xoxoxoxoxoxoxoxo", kick: "x..x....x..x....", snare: "........o.......", vel: 0.45 },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
