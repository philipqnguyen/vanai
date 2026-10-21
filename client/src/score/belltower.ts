// ---------- The Bell Tower — "The Bell Is Counting" ----------
// The Drowned Valley's tower and the first dungeon the whole world runs
// together: an archive climbing four real flights round the clock's open
// shaft, from the flooded originals at the waterline to the dry cabinet and
// the bell chamber at the top. In the shaft a 19 m pendulum swings over the
// water, a 9 m escape wheel ticks round in its alcove, the back of the great
// dial glows on the north wall, and the valley's bell hangs under the open
// roof. Here the players find the empire's last order — "Seal it behind us" —
// and learn the bell that has rung a changed peal every year was never broken.
// It is counting.
//
// So the clock is the drum. A pizzicato tick and tock (G and C, fixed pitches,
// the way a clock does not change its note for the harmony) runs under the
// whole piece at 112, and the bell's own note is C. C minor for the water and
// the gravity, E-flat and A-flat for the climb and the top, and the last
// chord before the loop is a C major one: the count is toward a homecoming.
//
//   intro  the great bell strikes over the water — skipped on the loop
//   A      the Flooded Archive: the reed's tune in C minor over the tick and
//          tock, harp ripples, low strings. Half-close on G at bar 8.
//   B      the Climb: E-flat, the four flights — the strings' tune climbs a
//          step a phrase, the horn holds under it, spiccato eighths, and a
//          tom run up each flight
//   C      the Escapement: the ticking brought to the front — spiccato
//          sixteenths, stab chords on the escape wheel's beats, taiko under
//          the horn's low line, a timpani roll on the dominant. The edge.
//   D      the Bell Chamber: A-flat, the brass's broad theme over choir and
//          horns, timpani, and the bell striking with every gap shorter than
//          the last (12 beats, 10, 8, 7, 6, 5, 4, 3, 2, 1...) — the count, out
//          loud — closing on C major and the dominant back into A
//
// The tower is the story's turn, so it is the grandest piece of the doorstep
// dungeons; the counting is the only dread in it, and it ends in a major chord.

import type { Piece } from "./kit.ts";

/** the clock: tick (G) and tock (C), a bar of quarters, fixed whatever the chord */
const TICK = "g4! c4 g4 c4";
const ticks = (n: number) => Array(n).fill(TICK).join(" | ");

export default {
  title: "The Bell Is Counting",
  zones: ["belltower"],
  note: "the clock is the drum: a pizzicato tick-tock under everything, and the bell's note is C. Listen for the Climb rising a step a phrase, the Escapement's ticking up front, and the bell in the Bell Chamber striking with every gap shorter than the last",
  song: {
    bpm: 112, space: 3.4,
    sections: [
      // 0 — intro: the great bell over the water
      {
        name: "intro",
        chords: "Cm | Cm | Ab | G",
        pad: { inst: "strings", vel: 0.6, oct: 2 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "bell", vel: 0.9, n: "c4+c5:4 | c4+c5:4 | c4+c5:4 | .:4" },
        arp: { inst: "harp", pat: "0 . 2 . 1 . 3 .", unit: 0.5, oct: 3, vel: 0.45 },
        parts: [
          { inst: "timpani", vel: 0.5, n: "c2:4 | c2:4 | c2:4 | g1?:.25*16" },
          { inst: "pizz", vel: 1.0, n: ".:4 | .:4 | .:4 | " + TICK },
        ],
      },
      // 1 — A, the Flooded Archive: the reed over the tick and tock
      {
        name: "A Flooded Archive",
        chords: `
          Cm | Ab    | Fm | G  | Cm   | Ab | Fm6   | G |
          Cm | Eb/Bb | Ab | Fm | Cm/G | Ab | Dm7b5 | G `,
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "root", vel: 0.6 },
        lead: { inst: "reed", vel: 1.1, n: `
          g4:2 c5 d5  | ef5:3 c5    | f5:2 af5 g5 | d5:3 b4     |
          c5:2 ef5 g5 | af5:3 g5    | f5 ef5 d5 c5 | b4:4       |
          g4:2 c5 d5  | ef5:2 g5 bf5 | c6:2 bf5 af5 | af5:2 g5 f5 |
          g5:2 ef5 c5 | ef5:2 c5 af4 | af4 c5 d5 f5 | d5:2 b4:2 ` },
        arp: { inst: "harp", pat: "0 1 2 3 2 1 2 3", unit: 0.5, oct: 3, vel: 0.55 },
        parts: [{ inst: "pizz", vel: 0.95, n: ticks(16) }],
      },
      // 2 — B, the Climb: E-flat, a step higher every phrase, a flight a phrase
      {
        name: "B Climb",
        chords: `
          Eb   | Bb/D | Cm | Ab |
          Fm   | Cm/Eb | Dm7b5 | Bb |
          Eb/G | Bb7  | Cm | Eb |
          Ab   | Bb   | Fm/Ab | G `,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.85 },
        lead: { inst: "strings", vel: 2.6, n: `
          ef5:2 f5 g5  | f5:2 d5 bf4  | c5:2 d5 ef5  | ef5 d5 c5:2  |
          f5:2 g5 af5  | g5:2 ef5 c5  | d5:2 ef5 f5  | f5 ef5 d5:2  |
          g5:2 af5 bf5 | af5:2 f5 d5  | ef5:2 f5 g5  | g5 f5 ef5:2  |
          af5:2 bf5 c6 | d6:2 c6 bf5  | c6:2 af5 f5  | g5:4         ` },
        counter: { inst: "horn", vel: 0.9, n: `
          g4:4 | f4:4 | ef4:4 | ef4:4 | af4:4 | g4:4 | af4:4 | f4:4 |
          bf4:4 | af4:4 | g4:4 | g4:4 | c5:4 | bf4:4 | af4:4 | g4:4 ` },
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 3, vel: 0.7 },
        parts: [{ inst: "pizz", vel: 0.85, n: ticks(16) }],
        // a tom run up each flight: low to high into every fourth bar line
        drums: { kick: "x.......x.......", vel: 0.5, fill: { tom: "........3.3.2.1.", every: 4 } },
      },
      // 3 — C, the Escapement: the ticking up front, the edge of the piece
      {
        name: "C Escapement",
        chords: "Cm | Cm | Fm/C | Cm | Ab | Fm | Dm7b5 | G",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "pedal", vel: 0.7 },
        lead: { inst: "horn", vel: 1.0, n: `
          c4:2 b3 c4  | ef4:2 d4 c4 | f4:2 ef4 c4 | g4:4 |
          af4:2 g4 f4 | af4:2 c5 af4 | f4 af4 d4 f4 | g4:2 b3:2 ` },
        hits: { inst: "stab", pat: "X.x.X.x.", unit: 0.5, oct: 3, vel: 0.27 },
        arp: { inst: "spiccato", pat: "0 1 2 1", unit: 0.25, oct: 3, vel: 0.55 },
        parts: [
          { inst: "pizz", vel: 0.85, n: ticks(8) },
          { inst: "timpani", vel: 0.42, n: "c2:4 | .:4 | c2:4 | .:4 | af1:4 | f1:4 | d2:4 | g1?:.25*16" },
        ],
        drums: { taiko: "3.......2.......", vel: 0.45 },
      },
      // 4 — D, the Bell Chamber: A-flat, the brass theme, the bell counting
      {
        name: "D Bell Chamber",
        chords: `
          Ab | Eb/G | Fm | Db | Ab/C  | Bbm7 | Eb       | Eb |
          Ab | Eb/G | Fm | Db | Bbm7  | Bb   | Csus4 C  | G7 `,
        pad: { inst: "choir", vel: 1.05 }, bass: { pat: "oct", vel: 0.95 },
        lead: { inst: "brass", vel: 1.0, n: `
          ef4:2 af4 c5 | bf4:3 g4    | af4:2 c5 f5 | f5:3 ef5    |
          ef5:2 c5 af4 | df5:2 c5 bf4 | bf4:2 af4 g4 | bf4:4      |
          ef4:2 af4 c5 | bf4:3 ef5   | af5:2 g5 f5 | f5:2 ef5 df5 |
          df5:2 c5 bf4 | d5:3 f5     | f5:2 e5:2   | d5:2 b4:2  ` },
        counter: { inst: "horn", vel: 0.9, n: `
          c4:4 | ef4:4 | c4:4 | df4:4 | c4:4 | df4:4 | ef4:4 | ef4:4 |
          c4:4 | ef4:4 | c4:4 | af4:4 | f4:4 | f4:4  | c4:4  | b3:4 ` },
        // the count: every gap shorter than the last
        parts: [
          { inst: "bell", vel: 0.75, n: `
            c4+c5 .:3 | .:4 | .:4 | c4+c5 .:3 | .:4 | .:2 c4+c5 .:1 | .:4 | .:2 c4+c5 .:1 |
            .:4 | .:1 c4+c5 .:2 | .:3 c4+c5 | .:4 | c4+c5 .:3 | c4+c5 .:2 c4+c5 | .:1 c4+c5 c4+c5 c4+c5 | c4+c5 .:3 ` },
          { inst: "timpani", vel: 0.55, n: "af1!:4 | g1:4 | f1:4 | df2:4 | c2:4 | bf1:4 | ef2:4 | ef2:2 ef2:2 | af1!:4 | g1:4 | f1:4 | df2:4 | bf1:4 | bf1:4 | c2!:4 | g1?:.25*16" },
          { inst: "pizz", vel: 0.75, n: ticks(16) },
        ],
        arp: { inst: "harp", pat: "0 1 2 3 4 3 2 1", unit: 0.5, oct: 3, vel: 0.5 },
        drums: {
          kick: "x.......x.......", taiko: "3...............",
          crash: "X..............." + " | ................".repeat(7),
          vel: 0.5, fill: { tom: "........3.3.2.1." },
        },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
