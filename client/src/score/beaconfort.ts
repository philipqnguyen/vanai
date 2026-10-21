// ---------- The Beacon Fort — "Kept Lit" ----------
// The empire's signal fort in the Melt Ridge saddle of the Burned Land, three
// centuries after the fire: an ash-dusted bailey where the char hounds run,
// oil stores where the wisps drift, cells where a cinder chorus sings, a wall
// walk along the ridge, and halfway up, the cold beacon — the one that burned
// the night of the fire and turned to glass. At the top, behind the
// Beacon-Keeper's dais, the live beacon on its tower, kept lit for three
// hundred years. It is in sight from the gate on; it is the light that leads
// you up. The late-game edge of the world, the one place the score lets the
// dark come closer — and what it finds there is somebody keeping a fire in.
//
// So the piece is a climb toward one note. 5/4, grouped 3+2 — a march with a
// step too many, the gait of someone going up a stair that does not end — at
// 104, in F-sharp minor. Its flame is C-sharp: one note, held by somebody in
// almost every bar of the loop (high strings, then the flute, then the
// strings again), chosen because it sits well over every chord the piece
// uses: a chord tone of most, the major seventh over D, the ninth over B
// minor, the sixth over E.
// The theme climbs a step at a time toward it, and only reaches it at the
// top, in A major, where the melody's peak is the flame itself.
//
//   intro  the flame alone (glass), the timpani's heartbeat on the 3+2, the
//          horn finds the first steps — skipped on the loop
//   A      the Ash-Dusted Court: the climbing theme on the horn, pizzicato on
//          the groups, taiko far off, the choir as the wind, the flame held
//          high in the strings
//   B      the Cinder Chorus: B minor, the choir sings the chant itself over
//          the harp; the flame passes to the flute
//   C      the Cold Beacon: the beacon that glassed. The flame goes out — C
//          natural instead of C-sharp, in every chord — and the theme plays in
//          glass and bell, as if frozen in it. On its last bar the C-sharp
//          comes back: someone relit it. The darkest and quietest place.
//   D      the Great Stair: the climb in earnest — spiccato, the taiko and
//          the kit on the groups, brass and horn taking the theme up a
//          sequence, the flame in the strings above
//   E      the Live Beacon: A major. The theme in the major on the brass, the
//          horns under it, the choir, timpani and a crash; at bar 13 the
//          melody reaches the flame's C-sharp, and the last bar holds it,
//          handing it back to the court below. The loudest place.
//
// The dread is one section wide and ends with a relit note; the rest is
// devotion. The fort is not haunted. It is staffed.

import type { Piece } from "./kit.ts";

/** A bar on the groups: root for the three, the fifth for the two. */
const groups = (...bars: [string, string][]) => bars.map(([r, f]) => `${r}:3 ${f}:2`).join(" | ");
/** The flame, held across `bars` bars by one voice: four bars to a breath. */
const flame = (bars: number, note = "cs6") => `${note}:20*${bars / 4}`;

/** The climbing theme: a step at a time, half-close on C# major (bar 8), the
 *  answer over E and A, home on F#. */
const CLIMB_CHORDS = `
  F#m | D | Bm | C#m | F#m | D | Bm7 | C# |
  F#m | D | E  | A   | D   | Bm | C#7 | F#m `;
const CLIMB = `
  cs4:2 fs4 gs4:2 | a4:2 b4 a4:2   | fs4:2 a4 b4:2    | cs5:3 b4:2        |
  cs5:2 b4 a4:2   | fs4:2 a4 d5:2  | cs5:2 b4 a4 gs4  | gs4:3 .:2         |
  cs4:2 fs4 gs4:2 | a4:2 b4 cs5:2  | b4:2 cs5 e5:2    | e5:3 cs5:2        |
  fs5:2 e5 d5:2   | cs5:2 b4 a4:2  | gs4:2 es4 gs4 b4 | fs4:5             `;

export default {
  title: "Kept Lit",
  zones: ["beaconfort"],
  note: "5/4 in 3+2, a climb toward one note: the C-sharp is the beacon, held in nearly every bar; it goes out in the Cold Beacon (C natural, glass and bell) and is relit on its last bar, and the melody only reaches it at the top, in A major",
  song: {
    bpm: 104, beats: 5, space: 3.4,
    sections: [
      // 0 — intro: the flame alone, the heartbeat, the first steps
      {
        name: "intro",
        chords: "F#m | D | Bm | C#",
        pad: { inst: "choir", vel: 0.55 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.8, n: ".:5 | .:5 | cs4:2 fs4 gs4:2 | gs4:3 .:2" },
        counter: { inst: "glass", vel: 0.32, n: "cs6:5 | .:5 | cs6:5 | .:5" },
        parts: [{ inst: "timpani", vel: 0.45, n: "fs2:3 cs2:2 | d2:3 a1:2 | b1:3 fs2:2 | cs2:3 cs2:.5*4" }],
      },
      // 1 — A, the Ash-Dusted Court: the climb on the horn, the flame in the strings
      {
        name: "A Ash Court",
        chords: CLIMB_CHORDS,
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "root", vel: 0.6 },
        lead: { inst: "horn", vel: 1.5, n: CLIMB },
        counter: { inst: "strings", vel: 1.7, n: flame(16) },
        parts: [
          { inst: "pizz", vel: 1.5, n: groups(
            ["fs2", "cs3"], ["d2", "a2"], ["b1", "fs2"], ["cs2", "gs2"], ["fs2", "cs3"], ["d2", "a2"], ["b1", "fs2"], ["cs2", "gs2"],
            ["fs2", "cs3"], ["d2", "a2"], ["e2", "b2"], ["a1", "e2"], ["d2", "a2"], ["b1", "fs2"], ["cs2", "gs2"], ["fs2", "cs3"]) },
          { inst: "timpani", vel: 0.35, n: "fs2:5 | .:5 | .:5 | cs2:3 cs2:2 | fs2:5 | .:5 | .:5 | cs2:.5*6 cs2:2 | fs2:5 | .:5 | e2:5 | a1:5 | d2:5 | .:5 | cs2:3 cs2:2 | fs2:5" },
        ],
        drums: { taiko: "3...........2.......", vel: 0.38 },
      },
      // 2 — B, the Cinder Chorus: the choir sings the chant; the flame to the flute
      {
        name: "B Cinder Chorus",
        chords: "Bm | F#m | D | A | Bm | E | D | C#",
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "root", vel: 0.65 },
        arp: { inst: "harp", pat: "0 1 2 1 0 2 1 2 3 2", unit: 0.5, oct: 3, vel: 0.75 },
        lead: { inst: "choir", vel: 3.6, n: `
          d4:2 fs4 b4:2 | a4:2 fs4 cs4:2 | d4:2 fs4 a4:2 | cs5:3 b4 a4 |
          b4:2 a4 fs4:2 | gs4:2 b4 e5:2  | fs4:2 a4 d5:2 | cs5:3 es4:2 ` },
        counter: { inst: "flute", vel: 0.3, n: flame(8) },
        parts: [{ inst: "horn", vel: 0.75, n: "b3:5 | a3:5 | a3:5 | a3:5 | b3:5 | b3:5 | a3:5 | gs3:5" }],
        drums: { taiko: "3...........2.......", vel: 0.32 },
      },
      // 3 — C, the Cold Beacon: the flame goes out (C natural), the theme in glass
      {
        name: "C Cold Beacon",
        chords: "F#m7b5 | D7 | Am/E | B7 | F#m7b5 | D7 | Am | C#",
        pad: { inst: "choir", vel: 0.45 }, bass: { pat: "swell", vel: 0.55 },
        lead: { inst: "glass", vel: 0.6, n: `
          fs5:2 a5 c6:2 | a5:2 fs5 d5:2 | e5:2 a5 c6:2 | b5:3 a5 ds5 |
          fs5:2 a5 c6:2 | a5:2 c6 d6:2  | e6:2 c6 a5:2 | cs6:5 ` },
        counter: { inst: "bell", vel: 0.22, n: "fs4:5 | .:5 | e4:5 | .:5 | fs4:5 | .:5 | a4:5 | cs5:5" },
        parts: [{ inst: "reed", vel: 0.3, n: "a3:5 | fs3:5 | e3:5 | ds3:5 | c4:5 | c4:5 | c4:5 | cs4:5" }],
      },
      // 4 — D, the Great Stair: the climb in earnest
      {
        name: "D Great Stair",
        chords: "F#m | D | E | F#m | Bm | D | E | C#",
        pad: { inst: "strings", vel: 1 }, bass: { pat: "root", vel: 0.85 },
        arp: { inst: "spiccato", pat: "0 1 2 0 1 2 0 1 0 2", unit: 0.5, oct: 3, vel: 1 },
        lead: { inst: "brass", oct: -1, vel: 1.25, n: `
          cs5:2 fs5 gs5:2 | a5:2 fs5 d5:2 | e5:2 gs5 b5:2 | a5:3 cs6:2 |
          d6:2 cs6 b5:2   | a5:2 fs5 a5:2 | b5:2 gs5 e5:2 | es5:3 gs5:2 ` },
        counter: { inst: "horn", vel: 1.05, n: "a3:5 | a3:5 | b3:5 | cs4:5 | d4:5 | fs4:5 | e4:5 | es4:5" },
        parts: [
          { inst: "strings", vel: 1.5, n: flame(8) },
          { inst: "timpani", vel: 0.45, n: "fs2:3 cs2:2 | d2:3 a1:2 | e2:3 b1:2 | fs2:3 cs2:2 | b1:3 fs2:2 | d2:3 a1:2 | e2:3 b1:2 | cs2:.25*20" },
        ],
        drums: {
          taiko: "3...2...2...3...2...",
          kick: "x...........x.......",
          snare: "....o...o.......o...",
          vel: 0.48,
          fill: { snare: "x.x.x.x.x.x.xxxxXXXX", taiko: "3...........3...3..." },
        },
      },
      // 5 — E, the Live Beacon: A major; the melody reaches the flame
      {
        name: "E Live Beacon",
        chords: `
          A | E/G# | F#m | D  | A/C# | Bm7 | E   | E  |
          D | A/C# | Bm  | F#m | D   | A/C# | Bm7 | C# `,
        pad: { inst: "choir", vel: 1.9 }, bass: { pat: "root", vel: 0.9 },
        arp: { inst: "harp", pat: "0 1 2 0 1 2 0 1 2 3", unit: 0.5, oct: 4, vel: 0.7 },
        lead: { inst: "brass", vel: 1.4, n: `
          cs5:2 e5 a5:2  | gs5:2 fs5 e5:2 | fs5:2 e5 cs5:2 | d5:3 e5 fs5 |
          e5:2 cs5 a4:2  | d5:2 cs5 b4:2  | b4:2 cs5 e5:2  | e5:5        |
          fs5:2 a5 fs5:2 | e5:2 cs5 e5:2  | d5:2 fs5 b5:2  | a5:3 gs5 fs5 |
          a5:2 cs6 b5:2  | a5:2 e5 cs5:2  | d5:2 cs5 b4 a4 | cs5:5       ` },
        counter: { inst: "horn", vel: 1.25, n: `
          a4:5 | e4:5 | fs4:5 | fs4:3 a4:2 | a4:5 | fs4:5 | gs4:5 | gs4:3 b4:2 |
          a4:5 | a4:5 | b4:5  | cs5:5      | a4:5 | e4:5  | fs4:5 | es4:5 ` },
        parts: [
          { inst: "strings", vel: 3, n: `
            e4:5 | e4:5 | cs4:5 | a3:5 | cs4:5 | d4:5 | e4:5 | d4:5 |
            fs4:5 | e4:5 | d4:5 | cs4:5 | fs4:5 | e4:5 | d4:5 | cs4:5 ` },
          { inst: "bell", vel: 0.25, n: "cs6:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | cs6:5 | .:5 | .:5 | .:5 | cs6:5 | .:5 | .:5 | cs6:5" },
          { inst: "timpani", vel: 0.5, n: "a1!:5 | .:5 | fs2:5 | d2:5 | .:5 | b1:5 | e2:5 | e2:.25*12 e2:2 | d2!:5 | .:5 | b1:5 | fs2:5 | d2:5 | .:5 | b1:5 | cs2:.25*16 cs2:1" },
        ],
        drums: {
          taiko: "3...........2.......",
          kick: "x...........x.......",
          crash: "X................... | .................... | .................... | .................... | .................... | .................... | .................... | ....................",
          vel: 0.45,
        },
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
