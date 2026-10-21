// ---------- The Hunting Wood — "The King's Rides" ----------
// The emperor's hunting forest, kept for a court that left three hundred years
// ago between dinner and breakfast: tall sunlit timber, three dead-straight
// rides of light converging on the lodge, a stag meadow under the King's Seat,
// grass up to the knee. Nobody has blown a horn here since the night, and the
// first players in are trespassing on a vanished empire's day off. Awe, not
// fear — it is the first interior zone most people see.
//
// So: C major, the key a natural horn speaks, and 6/8 at a dotted-quarter 64
// (bpm 192 in eighths) — the hunt's own meter, slowed from the gallop to the
// amble of someone walking a ride and looking up. The tune is the flute's, for
// the birds that own the canopy now; the horns only call. Every call is the
// same rising c-e-g the tune opens with, and in the intro and the bridge it is
// answered by nothing but its own echo — that is the haunting, and it is all
// of it.
//
//   intro  a lone hunting call and its echo over strings — skipped on the loop
//   A      the Ride: the tune on flute over harp and a soft shaker, the horns
//          answering at each half-close and cadence. Half-close on bar 8, paid
//          in full on bar 16.
//   B      the Overgrowth: A minor, the band thins to pizzicato on tiptoe, the
//          reed takes a lower, sneakier tune, birdcalls in the flute and a
//          glass glint where the sun gets through — the quietest section
//   A'     the Ride again, the reed now a countermelody under the flute, the
//          drums come in on the dotted beats
//   C      the King's Rides: opening on F for the lift, the horns in pairs
//          take a broad theme of their own (horn fifths: thirds, fifths and
//          sixths), lute strumming the hunt rhythm, timpani, the flute as
//          descant — the loudest section, the hunt as it was, played to an
//          empty forest
//   D      the Seat: a choir bed, the call in A minor and its glass echo,
//          then the half-close back onto A's downbeat
//
// The horns are the court and the flute is the forest; only C gives the horns
// the tune, and it is the one place the wood sounds like it did.

import type { Piece } from "./kit.ts";

/** The Ride: half-close on bar 8, the answer a step higher, home on bar 16.
 *  Opens on the horn call's own c-e-g. A and A' both play it. */
const RIDE_CHORDS = `
  C | F | C   | G  | Am    | F         | Dm7     | G7sus4 G |
  C | F | C/E | Am | Fmaj7 | Em7 Am7   | Dm7 G7  | C `;
const RIDE = `
  c5:2 e5 g5:3 | f5:2 e5 d5:2 c5 | e5:2 d5 c5:2 g4 | d5:5 g4         |
  a4:2 c5 e5:2 d5 | c5:2 a4 f4:2 a4 | f4:2 a4 d5:2 c5 | c5:3 b4:3    |
  c5:2 e5 g5:3 | a5:2 g5 f5:2 e5 | g5:2 e5 c5:2 e5 | e5:3 c5:2 a4    |
  f5:2 e5 d5:2 c5 | d5:2 b4 c5:2 e5 | f5:2 d5 b4:2 d5 | c5:6 `;
/** The horns answer where the flute holds: a descending call on the half-close,
 *  a sus resolution under bar 8, the call home under the last bar. */
const RIDE_HORNS = `
  .:6 | .:6 | .:6 | b4+d5:2 g4+b4 d4+g4:3 |
  .:6 | .:6 | .:6 | g3+c4:3 g3+b3:3        |
  .:6 | .:6 | .:6 | .:6                    |
  .:6 | .:6 | .:6 | g4+c5:2 e4+g4 c4+e4:3 `;
/** A' only: the reed under the flute, moving where the tune holds and holding
 *  where it moves; the F in bar 8 is the seventh that walks down to E. */
const RIDE_REED = `
  e4:6 | f4:3 a4:3 | g4:6 | b4:2 a4 g4:2 f4 |
  e4:6 | f4:3 c4:3 | d4:2 f4 a4:3 | g4:3 f4:3 |
  e4:6 | c4:3 f4:3 | e4:3 g4:3 | a4:2 b4 c5:3 |
  a4:6 | g4:3 e4:3 | a4:3 g4:3 | g4:2 e4 c4:3 `;

/** the hunt's 6/8 on the dotted beats, light: a forest, not a parade */
const LILT = {
  kick: "x.....x.....",
  tom: "........2.2.",
  shaker: "x.xx.xx.xx.x",
};

export default {
  title: "The King's Rides",
  zones: ["huntingwood"],
  note: "6/8, C major: the flute is the forest, the horns only call until C (the Rides), where they take a tune of their own; the intro and bridge calls are answered by their own echo on purpose",
  song: {
    bpm: 192, beats: 6, space: 3.0,
    sections: [
      // 0 — intro: the call, then its echo. Skipped on the loop.
      {
        name: "intro",
        chords: "C | Fmaj7/C | C | Gsus4 G",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", n: "c4:2 e4 g4:2 c5 | g4:6 | .:6 | .:6", vel: 0.85 },
        counter: { inst: "horn", n: ".:6 | .:6 | c4:2 e4 g4:2 c5 | g4:3 .:3", vel: 0.35 },
        parts: [{ inst: "glass", n: "g5:6 | .:6 | e5:6 | .:6", vel: 0.3 }],
      },
      // 1 — A, the Ride
      {
        name: "A Ride",
        chords: RIDE_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.8 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 1, oct: 4, vel: 0.7 },
        lead: { inst: "flute", n: RIDE },
        counter: { inst: "horn", n: RIDE_HORNS, vel: 0.7 },
        drums: { shaker: LILT.shaker, vel: 0.6 },
      },
      // 2 — B, the Overgrowth: the relative minor, on tiptoe
      {
        name: "B Overgrowth",
        chords: `
          Am | Am/G | Fmaj7 | Fmaj7 | Dm7 | Em7  | F | G        |
          Am | Am/G | Fmaj7 | G/F   | Dm7 | Am/E | F | Gsus4 G `,
        pad: { inst: "strings", vel: 0.35 }, bass: { pat: "root", vel: 0.55 },
        arp: { inst: "pizz", pat: "0 2 1 2 0 2", unit: 1, oct: 3, vel: 0.75 },
        lead: { inst: "reed", vel: 0.85, n: `
          e4:3 a4:2 b4    | c5:2 b4 a4:3 | a4:2 c5 e5:3    | d5:4 .:2     |
          f4:2 a4 d5:2 c5 | b4:2 g4 e4:3 | f4:2 a4 c5:2 d5 | b4:4 .:2     |
          e5:3 c5:2 a4    | b4:2 c5 d5:3 | e5:3 d5:2 c5    | d5:2 b4 g4:3 |
          d5:2 f5 e5:2 d5 | c5:2 b4 a4:3 | f4:2 a4 c5:2 f5 | c5:3 b4:3 ` },
        // birdcalls in the canopy: answer the reed's held notes, never its moving ones
        counter: { inst: "flute", vel: 0.5, n: `
          .:6 | .:3 e6?:.5 d6?:.5 e6?:.5 c6:1.5 | .:6 | .:2 a5?:.5 b5?:.5 a5?:.5 b5?:.5 a5:2 |
          .:6 | .:3 g5?:.5 b5?:.5 d6:2          | .:6 | .:6 |
          .:6 | .:3 e6?:.5 d6?:.5 e6?:.5 c6:1.5 | .:6 | .:3 d6?:.5 b5?:.5 g5:2 |
          .:6 | .:2 c6?:.5 a5?:.5 e5:3          | .:6 | .:6 ` },
        parts: [{ inst: "glass", vel: 0.35, n: `
          a5:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 |
          c6:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 | .:6 ` }],
      },
      // 3 — C, the King's Rides: the horns' own tune, the hunt as it was
      {
        name: "C King's Rides",
        chords: `
          F | C/E | Dm7 | C   | F   | C/E | Dm7      | G7sus4 G |
          F | G/F | Em7 | Am7 | Dm7 | G/B | Fmaj7 G  | C `,
        pad: { inst: "strings", vel: 0.85 }, bass: { pat: "oct" },
        hits: { inst: "lute", pat: "X-xx-x", unit: 1, oct: 3, vel: 0.55 },
        lead: { inst: "horn", n: `
          a4+c5:3 f4+a4:2 c4+f4     | e4+g4:3 g4+c5:3            |
          f4+d5:2 f4+c5 f4+a4:2 d4+f4 | e4+g4:6                  |
          a4+c5:3 f4+a4:2 a4+c5     | c5+e5:3 g4+d5:2 e4+c5      |
          f4+d5:3 f4+a4:2 f4+d5     | g4+c5:3 g4+b4:3            |
          a4+c5:2 a4+d5 a4+f5:3     | g4+e5:2 g4+d5 g4+b4:3      |
          b4+d5:3 g4+b4:2 e4+g4     | e4+a4:2 a4+c5 c5+e5:3      |
          d5+f5:3 c5+e5:2 a4+d5     | b4+d5:2 g4+b4 d4+g4:3      |
          a4+c5:2 f4+a4 g4+b4:2 b4+d5 | e4+g4+c5:6 ` },
        counter: { inst: "flute", vel: 0.55, n: `
          a5:6 | g5:6 | f5:6 | e5:3 g5:3 | a5:6 | g5:6 | f5:3 a5:3 | g5:6 |
          c6:6 | b5:6 | g5:6 | a5:3 e5:3 | f5:6 | g5:6 | a5:3 b5:3 | c6:6 ` },
        parts: [{ inst: "timpani", vel: 0.65, n: `
          f2!:3 .:3 | .:6 | d2:3 .:3 | c2:3 c2:3 | f2!:3 .:3 | .:6 | d2:3 .:3 | g2?:.25*12 g2:3 |
          f2!:3 .:3 | .:6 | e2:3 .:3 | a2:3 .:3  | d2:3 .:3  | g2:3 .:3 | f2:3 g2:3 | c2!:6 ` }],
        drums: { ...LILT, vel: 0.8, fill: { tom: "......1.2233", every: 8 } },
      },
      // 4 — D, the Seat: the call in the minor, answered only by its echo
      {
        name: "D Seat",
        chords: "Am | Fmaj7 | C | G/B | Am | Fmaj7 | Dm7 | Gsus4 G",
        pad: { inst: "choir", vel: 0.75 }, bass: { pat: "swell", vel: 0.8 },
        lead: { inst: "horn", vel: 0.8, n: "e4:2 a4 c5:3 | c5:4 .:2 | .:6 | .:6 | e4:2 a4 c5:3 | d5:2 c5 a4:3 | f4:6 | g4:6" },
        counter: { inst: "glass", vel: 0.4, n: ".:6 | .:6 | e5:2 a5 c6:3 | b5:4 .:2 | .:6 | .:6 | .:6 | .:6" },
      },
      // 5 — A', the Ride with the reed under it and the drums in
      {
        name: "A' Ride",
        chords: RIDE_CHORDS,
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "oct", vel: 0.9 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 1, oct: 4, vel: 0.6 },
        lead: { inst: "flute", n: RIDE },
        counter: { inst: "reed", n: RIDE_REED, vel: 0.6 },
        parts: [{ inst: "horn", n: RIDE_HORNS, vel: 0.6 }],
        drums: { ...LILT, vel: 0.6 },
      },
    ],
    form: [0, 1, 2, 5, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
