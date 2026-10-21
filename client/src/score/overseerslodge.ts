// ---------- The Overseer's Lodge — "Nobody Is on the Rota" ----------
// Heartwood's doorstep trial: the plantation office, one branching timber
// house where it is always the night the household left. Moonlight at every
// window, lamplight on two rows of writing desks, tally sticks racked by the
// thousand, and in the tallest room the Rota itself: three hundred years of
// shifts, every one absent, kept anyway. "Are you the relief crew? You are not
// on the rota. Nobody is on the rota. I have kept the rota anyway. One must."
// The Mausoleum is the empire's ceremony; this is its paperwork, and paperwork
// is funny before it is sad.
//
// So: 5/4, because a tally is counted in fives — four strokes and the gate
// across them. Under almost everything the pizzicato counts four repeated
// notes and leaps on the fifth (written `tally()` below), the clerk's pen
// ticking off another empty shift. The bars group 3+2, a gait with a hitch in
// it, at 132: brisk office hours. A dorian, so the minor has a raised sixth
// (the F#) and a dry smile rather than a frown.
//
//   intro  the tally alone, then the lute and a shaker — skipped on the loop
//   A      the Clerks' Hall: the reed's dry tune over the tally, a light 3+2
//          kit. Half-close on E at bar 8, home at 16.
//   B      the Tally Room and the counting room behind it: low and close, the
//          reed down an octave, spiccato counting eighths, timpani ticking —
//          the quietest room
//   A'     the Clerks' Hall again, the tune on the piano (the lodge's own
//          instrument, out of tune with nobody), the reed answering below
//   C      the Rota Hall: up to C major and the tallest room. The strings play
//          the long tune in dotted halves and halves (the 3+2 slowed into a
//          hymn), the horn below, the lute strummed, timpani. The borrowed F
//          minor in bar 14 is the one homesick chord: every name on the wall.
//   D      the Rootbound Lock-up: the heartwood tree grown up through the
//          floor. Harp and glass over the choir, no count at all — until the
//          pen starts ticking again in the last two bars, back onto A
//
// The count is the joke and the haunting both: it never stops, and nobody
// ever turns up to be counted.

import type { Piece } from "./kit.ts";

/** The tally: four strokes and the gate, the gate leaned on. */
const tally = (r: string, gate: string) => `${r} ${r} ${r} ${r} ${gate}!`;
const bars = (...b: string[]) => b.join(" | ");

const A_CHORDS = `
  Am | D/A | Am | Em7 | Am  | D  | G | Esus4 E |
  Am | D/A | F  | G   | Em7 | D  | E | Am `;
const A_TALLY = bars(
  tally("a3", "e4"), tally("a3", "d4"), tally("a3", "e4"), tally("g3", "e4"),
  tally("a3", "e4"), tally("a3", "d4"), tally("g3", "d4"), tally("b3", "e4"),
  tally("a3", "e4"), tally("a3", "d4"), tally("a3", "f4"), tally("g3", "d4"),
  tally("g3", "e4"), tally("a3", "d4"), tally("gs3", "e4"), tally("a3", "e4"));
/** The clerk's tune: a dotted three and a plain two in every bar; the F# in
 *  bar 10 is the dorian smile. Half-close on the leading tone at bar 8. */
const A_TUNE = `
  e5:1.5 d5:.5 c5 b4 a4  | fs4 a4 d5 c5:2        | e5:1.5 d5:.5 c5 e5 a5  | g5:3 fs5 e5          |
  a5:1.5 g5:.5 e5 c5 e5  | fs5:1.5 e5:.5 d5 a4 d5 | b4 d5 g5 fs5 d5        | b4:1.5 a4:1 gs4:2.5  |
  e5:1.5 d5:.5 c5 b4 a4  | fs4 a4 d5 e5 fs5      | a5:1.5 g5:.5 f5 e5 c5  | d5:3 b4 d5           |
  e5:1.5 fs5:.5 g5 b5 g5 | a5:1.5 fs5:.5 d5 e5 fs5 | gs5:1.5 fs5:.5 e5 d5 b4 | a4:3 .:2 `;
/** A' only: the reed under the piano, holding where the tune moves */
const A_REED = `
  c4:3 e4:2 | d4:3 fs4:2 | e4:3 c4:2 | b3:3 d4:2 | c4:3 e4:2 | d4:3 a3:2 | d4:3 b3:2 | b3:2.5 b3:2.5 |
  c4:3 e4:2 | d4:3 a4:2  | a4:3 f4:2 | g4:3 d4:2 | e4:3 g4:2 | fs4:3 a4:2 | gs4:3 b4:2 | a4:3 .:2 `;

/** the 3+2 on a light kit: kick on the two group heads, a wood tom on the
 *  last eighth, the shaker counting */
const OFFICE = {
  kick: "x.....x...",
  tom: ".........2",
  shaker: "x.xox.x.xo",
};

export default {
  title: "Nobody Is on the Rota",
  zones: ["overseerslodge"],
  note: "5/4 because a tally counts in fives: the pizzicato ticks four and leans on the fifth under nearly everything. Listen for the tune moving reed → piano, the Rota Hall's hymn in C, and its one borrowed F-minor chord",
  song: {
    bpm: 132, beats: 5, space: 2.2,
    sections: [
      // 0 — intro: the pen starts counting
      {
        name: "intro",
        chords: "Am | Am | D/A | Esus4 E",
        pad: null, bass: { pat: "root", vel: 0.6 },
        parts: [
          { inst: "pizz", vel: 1.1, n: bars(tally("a3", "e4"), tally("a3", "e4"), tally("a3", "d4"), tally("b3", "e4")) },
          { inst: "lute", vel: 0.5, n: ".:5 | .:5 | a3+d4+fs4:3 a3+d4+fs4:2 | b3+e4+a4:2.5 gs3+b3+e4:2.5" },
        ],
        drums: { shaker: ".......... | .......... | x.xox.x.xo | x.xox.x.xo", vel: 0.5 },
      },
      // 1 — A, the Clerks' Hall: the reed's dry tune over the tally
      {
        name: "A Clerks' Hall",
        chords: A_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "oct", vel: 0.7 },
        lead: { inst: "reed", vel: 1.25, n: A_TUNE },
        hits: { inst: "lute", pat: "X.....x...", unit: 0.5, oct: 3, vel: 0.5 },
        parts: [{ inst: "pizz", vel: 1.2, n: A_TALLY }],
        drums: { ...OFFICE, vel: 0.5 },
      },
      // 2 — B, the Tally Room: low and close, counting in eighths
      {
        name: "B Tally Room",
        chords: "Am | G | Fmaj7 | E | Am | G | Dm/F | E7",
        pad: { inst: "strings", vel: 0.4 }, bass: { pat: "root", vel: 0.7 },
        lead: { inst: "reed", vel: 0.85, n: `
          a3:.5 b3:.5 c4 e4:1.5 d4:.5 c4 | b3 g3 b3:1.5 c4:.5 d4       | c4:.5 d4:.5 e4 a4:1.5 g4:.5 f4 | e4:3 gs3 b3 |
          a3:.5 b3:.5 c4 e4:1.5 d4:.5 c4 | b3 d4 g4:1.5 f4:.5 e4       | d4:.5 e4:.5 f4 a4:1.5 gs4:.5 f4 | e4:2.5 .:2.5 ` },
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1 2 1 0 2", unit: 0.5, oct: 3, vel: 0.7 },
        // a counting frame's beads: the flute clicks where the reed holds
        counter: { inst: "flute", vel: 0.35, n: ".:5 | .:3 d6?:.5 c6?:.5 b5:1 | .:5 | .:3 b5?:.5 d6?:.5 e6:1 | .:5 | .:3 g5?:.5 b5?:.5 d6:1 | .:5 | .:5" },
        parts: [{ inst: "timpani", vel: 0.35, n: "a1:3 e2:2 | g1:3 e2:2 | f1:3 c2:2 | e2:3 b1:2 | a1:3 e2:2 | g1:3 e2:2 | f1:3 d2:2 | e2:2.5 e2?:.5*5" }],
      },
      // 3 — A', the Clerks' Hall on the piano, the reed below
      {
        name: "A' Clerks' Hall",
        chords: A_CHORDS,
        pad: { inst: "strings", vel: 0.85 }, bass: { pat: "oct", vel: 0.72 },
        lead: { inst: "piano", vel: 0.85, n: A_TUNE },
        counter: { inst: "reed", vel: 0.85, n: A_REED },
        hits: { inst: "lute", pat: "X.x...x.x.", unit: 0.5, oct: 3, vel: 0.45 },
        parts: [{ inst: "pizz", vel: 1.1, n: A_TALLY }],
        drums: { ...OFFICE, vel: 0.65, fill: { tom: "......1122", kick: "x........." } },
      },
      // 4 — C, the Rota Hall: the long tune, C major, the homesick F minor
      {
        name: "C Rota Hall",
        chords: `
          C | G/B   | Am | Em/G | F | C/E | Dm7  | G          |
          C | E7/B  | Am | C/G  | F | Fm  | C/G  | G7sus4 G `,
        pad: { inst: "strings", vel: 1.0 }, bass: { pat: "oct", vel: 0.9 },
        lead: { inst: "strings", vel: 3.3, n: `
          e5:3 g5:2  | d5:3 g5:2  | c6:3 b5 a5   | g5:5          |
          f5:3 a5:2  | g5:3 e5:2  | f5:3 e5 d5   | d5:5          |
          e5:3 g5:2  | gs5:3 b5:2 | c6:3 a5:2    | e6:3 d6 c6    |
          c6:3 a5:2  | af5:3 f5:2 | g5:3 e5 c5   | d5:2.5 b4:2.5 ` },
        counter: { inst: "horn", vel: 1.1, n: `
          g4:3 e4:2 | g4:3 b4:2 | a4:3 e4:2 | b4:3 g4:2 | a4:3 f4:2 | e4:3 g4:2 | a4:3 f4:2 | g4:3 f4:2 |
          g4:3 e4:2 | e4:3 d4:2 | e4:3 a4:2 | g4:3 c5:2 | a4:3 c5:2 | c5:3 af4:2 | c5:3 g4:2 | g4:2.5 f4:2.5 ` },
        hits: { inst: "lute", pat: "X.x.x.X.x.", unit: 0.5, oct: 3, vel: 0.6 },
        parts: [{ inst: "timpani", vel: 0.55, n: `
          c2!:3 .:2 | b1:3 .:2 | a1:3 .:2 | g1:3 .:2 | f1:3 .:2 | e2:3 .:2 | d2:3 .:2 | g1:3 g1:1 g1:1 |
          c2!:3 .:2 | b1:3 .:2 | a1:3 .:2 | g1:3 .:2 | f1:3 .:2 | f1:3 .:2 | g1:3 .:2 | g1?:.25*20 ` }],
        drums: { ...OFFICE, tom: "........22", vel: 0.6 },
      },
      // 5 — D, the Rootbound Lock-up: the tree through the floor, no count —
      // until the pen picks up again
      {
        name: "D Lock-up",
        chords: "Am | Fmaj7 | C | G | Am | Fmaj7 | Dm7 | Esus4 E",
        pad: { inst: "choir", vel: 0.75 }, bass: { pat: "swell", vel: 0.65 },
        lead: { inst: "glass", vel: 0.7, n: "e5:3 a5:2 | c6:5 | g5:3 e5:2 | d5:5 | e5:3 a5:2 | c6:3 b5:2 | a5:5 | b5:2.5 gs5:2.5" },
        arp: { inst: "harp", pat: "0 1 2 3 4 3 2 1 2 3", unit: 0.5, oct: 3, vel: 0.6 },
        parts: [{ inst: "pizz", vel: 0.9, n: bars(".:5", ".:5", ".:5", ".:5", ".:5", ".:5", tally("d3", "a3"), tally("e3", "b3")) }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
