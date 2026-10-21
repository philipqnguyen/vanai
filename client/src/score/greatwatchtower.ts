// ---------- The Great Watchtower — "The Prepared Reply" ----------
// The empire's great bastion on the Border Wall's crest, in snow and morning
// sun: a twelve-metre stair up the crag between battlements, the Signal Mast
// with its semaphore arms and the court's standard, springalds pointed at the
// border, a signal room with a brass glass, and at the top the Herald's
// Chamber, open to the sky, where a canopy shelters a lectern and on it the
// prepared reply — the empire's courteous answer to an embassy, written three
// hundred years before anyone came to ask. The Wall-Warden still stands
// guard over it.
//
// So: ceremony, in the cold. A polonaise — the court's processional dance,
// 3/4 at 96, every accompaniment bar in its rhythm (an eighth, two
// sixteenths, four eighths) and the cadences landing on the second beat — is
// a herald's music: formal, proud, a little pompous, and it walks up a stair
// beautifully. B-flat major, the brass's home key, bright rather than grim;
// the cold is in the open fifths, the glass and the lydian E over B-flat.
// The signal is the motif: short-short-long, the semaphore's call, thrown
// from the horn on the right to the brass on the left and back.
//
//   intro  the snare starts the polonaise; the signal call and its echo off
//          the crag — skipped on the loop
//   A      the Great Stair: the strings take the polonaise tune, spiccato
//          chords in the dance rhythm, the horn answering each half-close
//   B      the Signal Mast: up to F, the signal itself becomes the tune —
//          the brass calls, the horn echoes a bar later from the other side,
//          spiccato running eighths, timpani for the springalds
//   C      the Wardens' Cells: G minor, the frost got in. The dance stops;
//          pizzicato on tiptoe, the reed, glass glints. The quietest place.
//   A'     the Herald's Walk: the tune in the brass, the horn holding the line
//          under it, the full polonaise in the drums, a crash at the top
//   D      the Reply: E-flat, the horns in pairs read the prepared reply as a
//          chorale over the choir, the flute high above it — courteous,
//          warm, three hundred years early — then F7 back to the Stair
//
// The homesickness is only the reply itself: kind words kept ready for
// visitors who took three centuries to arrive.

import type { Piece } from "./kit.ts";

/** The polonaise tune: dotted pickups to each strong beat, half-close on F
 *  (bar 8), the answer climbing to the high D and home on bar 16. Both
 *  cadences are the dance's own: an appoggiatura on the downbeat and the
 *  arrival on beat 2. */
const TUNE_CHORDS = `
  Bb | Bb/D | Eb | F  | Gm   | Eb | Cm7 | F  |
  Bb | Bb/D | Eb | Cm | Bb/F | Eb | F7  | Bb `;
const TUNE = `
  f4 bf4:.75 c5:.25 d5     | f5:1.5 ef5:.5 d5:.5 c5:.5  | bf4 g5:.75 f5:.25 ef5   | a4:.5 bf4:.5 c5:2 |
  d5 g5:.75 a5:.25 bf5     | g5:1.5 f5:.5 ef5:.5 d5:.5  | c5:.5 d5:.5 ef5 g5      | e5 f5:2           |
  f4 bf4:.75 c5:.25 d5     | f5:1.5 g5:.5 a5:.5 bf5:.5  | c6 bf5:.75 g5:.25 ef5   | g5:1.5 f5:.5 ef5:.5 c5:.5 |
  d5 f5:.75 bf5:.25 d6     | c6:1.5 bf5:.5 g5:.5 ef5:.5 | d5:.5 ef5:.5 c5:1.5 a4:.5 | c5 bf4:2        `;
/** the horn holding the line under the brass in A' */
const TUNE_FLOOR = `
  d4:3 | f4:3 | g4:3 | f4:1.5 ef4:1.5 | d4:3 | ef4:3 | ef4:1.5 g4:1.5 | a4:3 |
  d4:3 | d4:3 | ef4:3 | ef4:3         | f4:3 | g4:3  | f4:1.5 ef4:1.5 | d4:3 `;

/** The polonaise rhythm in sixteenths: an eighth, two sixteenths, four eighths. */
const POLONAISE = "x.xxx.x.x.x.";

export default {
  title: "The Prepared Reply",
  zones: ["greatwatchtower"],
  note: "a polonaise, the herald's dance, in the snow: listen for the short-short-long signal call thrown between the horn (right) and the brass (left) at the Signal Mast, the frost in the G-minor cells, and the horns reading the reply as a chorale in E-flat",
  song: {
    bpm: 96, beats: 3, space: 2.8,
    sections: [
      // 0 — intro: the dance rhythm alone, the call and its echo off the crag
      {
        name: "intro",
        chords: "Bb | Bb | Eb/Bb | F",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.9, n: "f4:.25 f4:.25 f4:.5 bf4:2 | .:3 | g4:.25 g4:.25 g4:.5 ef5:2 | c5:3" },
        counter: { inst: "glass", vel: 0.3, n: ".:3 | f5:.25 f5:.25 f5:.5 bf5:2 | .:3 | .:3" },
        drums: { snare: "X.xxo.o.o.o.", vel: 0.4 },
      },
      // 1 — A, the Great Stair: the tune on the strings, the dance in spiccato
      {
        name: "A Great Stair",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "root", vel: 0.75 },
        hits: { inst: "spiccato", pat: POLONAISE, unit: 0.25, oct: 3, vel: 0.55 },
        lead: { inst: "strings", vel: 3.6, n: TUNE },
        // the horn's signal answers each half-close
        counter: { inst: "horn", vel: 0.75, n: `
          .:3 | .:3 | .:3 | .:1 f4:.25 f4:.25 f4:.5 c4 | .:3 | .:3 | .:3 | .:1 c4:.25 c4:.25 c4:.5 f4 |
          .:3 | .:3 | .:3 | .:3                          | .:3 | .:3 | .:3 | .:1 f4:.25 f4:.25 f4:.5 bf3 ` },
        drums: { snare: "x.ooo.o.o.o.", kick: "x...........", vel: 0.38 },
      },
      // 2 — B, the Signal Mast: the call is the tune; the horn echoes a bar later
      {
        name: "B Signal Mast",
        chords: `
          F | F   | Bb/F | F  | Dm | Gm7 | C7sus4 | C7 |
          F | F/A | Bb   | Gm | Dm | Bb  | Gm7    | C7 `,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "oct", vel: 0.8 },
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1", unit: 0.5, oct: 3, vel: 0.75 },
        lead: { inst: "brass", vel: 0.85, n: `
          c5:.25 c5:.25 c5:.5 f5:2   | .:1 a5:.5 g5:.5 f5     | d5:.25 d5:.25 d5:.5 bf5:2 | .:1 a5:.5 g5:.5 a5 |
          a5:.25 a5:.25 a5:.5 d6:1.5 c6:.5 | bf5 a5:.5 g5:.5 f5 | f5:1.5 g5:.5 f5      | e5:2 .             |
          c5:.25 c5:.25 c5:.5 f5:2   | .:1 c6:.5 bf5:.5 a5    | f5:.25 f5:.25 f5:.5 d6:2  | .:1 bf5:.5 a5:.5 g5 |
          f5 a5:.75 g5:.25 f5        | d5:1.5 e5:.5 f5        | g5:.5 f5:.5 e5 d5    | c5:2 .             ` },
        // the echo from the other side of the mast, an octave and a half lower
        counter: { inst: "horn", vel: 0.95, n: `
          .:3 | c4:.25 c4:.25 c4:.5 f4:2 | .:3 | d4:.25 d4:.25 d4:.5 f4:2 |
          .:3 | d4:.25 d4:.25 d4:.5 g4:2 | .:3 | e4:.25 e4:.25 e4:.5 c4:2 |
          .:3 | c4:.25 c4:.25 c4:.5 a4:2 | .:3 | d4:.25 d4:.25 d4:.5 bf4:2 |
          .:3 | f4:.25 f4:.25 f4:.5 d4:2 | .:3 | g4:.25 g4:.25 g4:.5 e4:2 ` },
        parts: [{ inst: "timpani", vel: 0.5, n: `
          f2!:3 | .:3 | f2:3 | .:3 | d2:3 | g1:3 | c2:3 | c2:.25*8 c2:1 |
          f2!:3 | .:3 | bf1:3 | g1:3 | d2:3 | bf1:3 | g1:3 | c2:.25*8 c2:1 ` }],
        drums: { snare: "X.xxx.o.x.o.", kick: "x.......x...", vel: 0.45 },
      },
      // 3 — C, the Wardens' Cells: the frost got in
      {
        name: "C Wardens' Cells",
        chords: "Gm | Gm/F | Ebmaj7 | D7 | Cm | Gm/Bb | Cm7 | F7",
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "root", vel: 0.5 },
        arp: { inst: "pizz", pat: "0 . 2 . 1 .", unit: 0.5, oct: 3, vel: 0.85 },
        lead: { inst: "reed", vel: 0.75, n: `
          d5 bf4:.5 g4:.5 d4 | f4:.5 g4:.5 a4 bf4 | g4:2 ef5 | d5:1.5 c5:.5 a4 |
          ef5 c5:.5 g4:.5 ef4 | d4:.5 ef4:.5 f4 g4 | bf4:2 g4 | a4:2 . ` },
        counter: { inst: "glass", vel: 0.3, n: "d6:3 | .:3 | g5:3 | fs5:3 | g5:3 | .:3 | ef6:3 | c6:3" },
      },
      // 4 — A', the Herald's Walk: the tune in the brass, the full dance
      {
        name: "A' Herald's Walk",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "oct", vel: 0.85 },
        hits: { inst: "spiccato", pat: POLONAISE, unit: 0.25, oct: 3, vel: 0.6 },
        lead: { inst: "brass", vel: 0.95, n: TUNE },
        counter: { inst: "horn", vel: 0.8, n: TUNE_FLOOR },
        parts: [
          { inst: "strings", vel: 2, n: TUNE },
          { inst: "timpani", vel: 0.45, n: "bf1!:3 | .:3 | ef2:3 | f2:3 | g1:3 | ef2:3 | c2:3 | f2:.25*8 f2:1 | bf1!:3 | .:3 | ef2:3 | c2:3 | f2:3 | ef2:3 | f2:3 | bf1:3" },
        ],
        drums: { snare: "X.xxx.x.x.x.", kick: "x.......x...", crash: "X........... | ............ | ............ | ............ | ............ | ............ | ............ | ............", vel: 0.45 },
      },
      // 5 — D, the Reply: the horns read it as a chorale over the choir
      {
        name: "D Reply",
        chords: "Eb | Bb/D | Cm | Ab | Eb/G | Fm7 | Cm7 | F7",
        pad: { inst: "choir", vel: 1.3 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.95, n: `
          g4+bf4:2 bf4+ef5 | f4+bf4:2 f4+d5 | g4+c5:1.5 g4+d5:.5 g4+ef5 | af4+c5:3 |
          g4+bf4:2 bf4+ef5 | af4+c5:2 af4+f5 | g4+ef5:2 g4+c5 | a4+c5:2 a4+ef5 ` },
        counter: { inst: "flute", vel: 0.5, n: "bf5:3 | d6:3 | c6:3 | ef6:3 | bf5:3 | af5:3 | g5:3 | a5:3" },
        parts: [{ inst: "timpani", vel: 0.4, n: "ef2:3 | .:3 | .:3 | af1:3 | .:3 | .:3 | .:3 | f2:.25*8 f2:1" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
