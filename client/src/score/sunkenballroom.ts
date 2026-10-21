// ---------- The Sunken Ballroom — "Reserved, upon Our Return" ----------
// Moonmere's doorstep trial, under the west mere of the Summer Lakes: a
// leisure palace gone shallow-flooded, its last ball still in progress. The
// guests' cloaks are on their hooks, the supper is laid and uneaten, the dance
// cards are filled in, every chandelier hangs tilted the one way the household
// went, and at the heart of it, on the flooded dance floor under the oval
// dome, a music box is still mid-waltz, one bar repeating under the water.
// The last card reads: final dance — reserved, upon our Return.
//
// So it is a waltz, and the music box is its seed: the box's one bar (bell,
// high and small) is the first bar of the tune, and the band dreams the whole
// ball out of it. 3/4 at 144, F major, a chain of waltz tunes the way a ball
// has them, and the interruption written into the music: a bar where the
// whole room stops after one step and the next step does not come.
//
//   intro  the music box alone, three bars and a stop; the strings breathe in
//          on the dominant — skipped on the loop
//   A      the Last Waltz: the box's bar grown into a tune on the flute, harp
//          on the dance's two and three, the oom of a plain bass
//   A'     the same waltz danced: strings with the tune, the horn turning a
//          countermelody, pizzicato on two and three
//   B      the Card Salon: B-flat, the salon piano with a playful staccato
//          tune and a flute answering — the dance cards, filled in
//   C      the Rose Salon: D minor, where the lake has broken the wall and
//          pours in. The strings low and legato, harp cascading in eighths,
//          glass where the cold light gets in — the one dark turn
//   D      the Interrupted: the box again, over held string chords, and every
//          fourth bar the whole room stops after one beat — "between one step
//          and the next" — then the timpani gather the ball up again
//   A''    Upon Our Return: the waltz as it would be with the household home —
//          strings, choir, horn, flute descant, timpani, the full cadence
//   coda   the box alone, three bars and the stop, and the flute takes its bar
//          back up into A
//
// The ballroom is the one dungeon the lore says is beautiful first, so it is
// beautiful first. The ache is all in the stops.

import type { Piece } from "./kit.ts";

/** the music box: one bar, the tune's own first bar, two octaves up */
const BOX = "c6 a6:.5 g6:.5 f6";

const WALTZ_CHORDS = `
  F | F  | Dm | Dm    | Gm7 | C7 | F  | C7 |
  F | F7 | Bb | Bdim7 | F/C | D7 | Gm7 | C7 `;
/** the waltz: the box's bar, then up through the subdominant to a half-close */
const WALTZ = `
  c5 a5:.5 g5:.5 f5 | f5:2 c5 | d5 a5:.5 g5:.5 f5 | e5:2 d5  |
  d5 bf5:.5 a5:.5 g5 | e5:2 c5 | f5 a5 c6        | bf5:2 g5 |
  c5 a5:.5 g5:.5 f5 | ef5:2 c5 | d5 f5 bf5       | af5:2 f5 |
  a5:2 c6           | c6:2 fs5 | g5 bf5:.5 a5:.5 g5 | e5:2 c5 `;
/** the horn's turning line under A' */
const WALTZ_COUNTER = `
  a4:3 | c5:2 a4 | f4:3 | a4:2 f4 | bf4:3 | g4:2 bf4 | a4:3 | g4:3 |
  a4:3 | a4:2 c5 | bf4:3 | b4:3   | c5:3  | c5:2 a4  | bf4:3 | bf4:3 `;

export default {
  title: "Reserved, upon Our Return",
  zones: ["sunkenballroom"],
  note: "a chain of waltzes grown from the music box's one bar (bell, high). Listen for the box bar opening every waltz tune, the Rose Salon's dark D minor, and the Interrupted, where the whole room stops after one beat every four bars",
  song: {
    bpm: 144, beats: 3, space: 3.4,
    sections: [
      // 0 — intro: the music box alone, interrupted; the strings breathe in
      {
        name: "intro",
        chords: "F | F | F | F | C7 | C7 | C7 | C7",
        pad: null, bass: null,
        lead: { inst: "bell", vel: 1.25, n: `${BOX} | ${BOX} | ${BOX} | c6 .:2 | .:3 | .:3 | .:3 | .:3` },
        parts: [
          { inst: "strings", vel: 0.9, n: ".:3 | .:3 | .:3 | .:3 | bf3+e4+g4:3 | ~:3 | bf3+e4+g4+c5:3 | ~:3" },
          { inst: "harp", vel: 0.5, n: ".:3 | .:3 | .:3 | .:3 | .:3 | .:3 | c4 e4 g4 | bf4 c5 e5" },
        ],
      },
      // 1 — A, the Last Waltz: the box's bar grown into a tune on the flute
      {
        name: "A Last Waltz",
        chords: WALTZ_CHORDS,
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "root", vel: 0.62 },
        lead: { inst: "flute", vel: 1.2, n: WALTZ },
        hits: { inst: "harp", pat: ".xx", unit: 1, oct: 4, vel: 0.75 },
      },
      // 2 — A', the waltz danced: strings with the tune, the horn turning
      {
        name: "A' Danced",
        chords: WALTZ_CHORDS,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.9 },
        lead: { inst: "strings", vel: 3.3, n: WALTZ },
        counter: { inst: "horn", vel: 0.95, n: WALTZ_COUNTER },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 3, vel: 1.1 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.45 },
      },
      // 3 — B, the Card Salon: B-flat, the salon piano, staccato and pleased
      {
        name: "B Card Salon",
        chords: `
          Bb | Bb  | F7 | F7    | F7   | F7 | Bb    | Bb |
          Bb | Bb7 | Eb | Edim7 | Bb/F | Gm | Em7b5 | A7 `,
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "root", vel: 0.7 },
        lead: { inst: "piano", vel: 0.95, n: `
          f5 bf5 d6          | c6:.5 bf5:.5 a5 bf5 | c6 a5 f5           | ef5 .:2  |
          ef5 a5 c6          | bf5:.5 a5:.5 g5 a5  | bf5 f5 d5          | bf4 .:2  |
          f5 bf5 d6          | c6:.5 bf5:.5 af5 f5 | g5 bf5 ef6         | d6:.5 cs6:.5 bf5 g5 |
          f5 bf5 d6          | d6 bf5 g5           | bf5 g5 e5          | cs5:2 e5 ` },
        // the flute fills the two bars the piano leaves open in each half
        counter: { inst: "flute", vel: 0.6, n: `
          .:3 | .:3 | .:3 | .:1 g5:.5 f5:.5 ef5 | .:3 | .:3 | .:3 | .:1 c5:.5 d5:.5 f5 |
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:1 g5:.5 f5:.5 e5 ` },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 3, vel: 1.1 },
      },
      // 4 — C, the Rose Salon: D minor, the lake pouring in
      {
        name: "C Rose Salon",
        chords: `
          Dm | Dm/C | Bb | A  | Gm   | Dm/F | E7    | A  |
          Dm | Dm/C | Bb | Gm | Dm/A | Bb   | Em7b5 | A7 `,
        pad: { inst: "pad", vel: 0.85 }, bass: { pat: "root", vel: 0.85 },
        lead: { inst: "strings", oct: -1, vel: 3.0, n: `
          a4 d5 f5  | a5:2 g5  | f5:2 d5 | cs5:2 e5 |
          d5 g5 bf5 | a5:2 f5  | d5 b4 gs4 | a4:3   |
          a4 d5 f5  | c6:2 a5  | d6:2 bf5 | g5 bf5:.5 a5:.5 g5 |
          f5:2 d5   | bf4 d5 f5 | e5:2 g5 | cs5:2 a4 ` },
        counter: { inst: "flute", vel: 0.5, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          f5:3 | e5:3 | f5:3 | d5:3 | d5:3 | f5:3 | g5:3 | e5:3 ` },
        arp: { inst: "harp", pat: "0 1 2 3 4 3", unit: 0.5, oct: 3, vel: 0.7 },
        parts: [
          { inst: "glass", vel: 0.32, n: "a5:3 | .:3 | .:3 | .:3 | g5:3 | .:3 | .:3 | .:3 | a5:3 | .:3 | .:3 | .:3 | f5:3 | .:3 | .:3 | .:3" },
          { inst: "timpani", vel: 0.45, n: ".:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | a1?:.25*12 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | a1?:.25*12" },
        ],
      },
      // 5 — D, the Interrupted: the box over held chords, the room stopping
      // after one beat every fourth bar; written out so the stops are silent
      {
        name: "D Interrupted",
        chords: `
          F  | F     | Dm  | Dm  | Gm7 | C7  | F  | F  |
          Bb | Bdim7 | F/C | D7  | Gm7 | Gm7 | C7 | C7 `,
        pad: null, bass: null,
        lead: { inst: "bell", vel: 1.25, n: `
          ${BOX}             | ${BOX}             | d6 a6:.5 g6:.5 f6  | d6 .:2  |
          d6 bf6:.5 a6:.5 g6 | e6 bf6:.5 g6:.5 e6 | ${BOX}             | c6 .:2  |
          d6 bf6:.5 a6:.5 f6 | d6 af6:.5 f6:.5 d6 | ${BOX}             | c6 .:2  |
          d6 bf6:.5 a6:.5 g6 | d6 bf6:.5 a6:.5 g6 | e6 bf6:.5 g6:.5 e6 | e6:3    ` },
        parts: [
          { inst: "strings", vel: 1.1, n: `
            a3+c4+f4:3  | a3+c4+f4:3  | a3+d4+f4:3 | a3+d4+f4 .:2  |
            bf3+d4+f4:3 | bf3+e4+g4:3 | a3+c4+f4:3 | a3+c4+f4 .:2  |
            bf3+d4+f4:3 | b3+d4+af4:3 | a3+c4+f4:3 | a3+c4+fs4 .:2 |
            bf3+d4+g4:3 | bf3+d4+g4:3 | bf3+e4+g4:3 | bf3+e4+g4+c5:3 ` },
          { inst: "bass", vel: 0.6, n: "f2:3 | c2:3 | d2:3 | d2 .:2 | g1:3 | c2:3 | f2:3 | f2 .:2 | bf1:3 | b1:3 | c2:3 | d2 .:2 | g1:3 | g1:3 | c2:3 | c2:3" },
          { inst: "timpani", vel: 0.5, n: ".:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | g1:3 | g1?:.25*12 | c2?:.25*12 | c2:.25*8 c2!:1" },
        ],
      },
      // 6 — A'', Upon Our Return: the ball with the household home
      {
        name: "A'' Upon Our Return",
        chords: `
          F | F  | Dm | Dm    | Gm7 | C7 | F   | C7 |
          F | F7 | Bb | Bdim7 | F/C | D7 | C7  | F  `,
        pad: { inst: "choir", vel: 1.1 }, bass: { pat: "root", vel: 1.1 },
        lead: { inst: "strings", vel: 3.6, n: `
          c5 a5:.5 g5:.5 f5 | f5:2 c5 | d5 a5:.5 g5:.5 f5 | e5:2 d5  |
          d5 bf5:.5 a5:.5 g5 | e5:2 c5 | f5 a5 c6        | bf5:2 g5 |
          c5 a5:.5 g5:.5 f5 | ef5:2 c5 | d5 f5 bf5       | af5:2 f5 |
          a5:2 c6           | c6:2 fs5 | g5:2 e5         | f5:3     ` },
        counter: { inst: "horn", vel: 1.2, n: `
          a4:3 | c5:2 a4 | f4:3 | a4:2 f4 | bf4:3 | g4:2 bf4 | a4:3 | g4:3 |
          a4:3 | a4:2 c5 | bf4:3 | b4:3   | c5:3  | c5:2 a4  | bf4:3 | a4:3 ` },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 3, vel: 1.2 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.55 },
        parts: [
          // the flute descant: the box's bar, an octave over the strings
          { inst: "flute", vel: 0.6, n: `
            c6 a6:.5 g6:.5 f6 | .:3 | d6 a6:.5 g6:.5 f6 | .:3 | d6 bf6:.5 a6:.5 g6 | .:3 | f6:3 | .:3 |
            c6 a6:.5 g6:.5 f6 | .:3 | d6:3 | .:3 | c6:3 | a5:3 | bf5:3 | a5:3 ` },
          { inst: "timpani", vel: 0.65, n: "f2!:3 | .:3 | d2:3 | .:3 | g1:3 | c2:3 | f2:3 | c2:3 | f2!:3 | .:3 | bf1:3 | .:3 | c2:3 | d2:3 | c2:1.5 c2:1.5 | f2!:3" },
        ],
      },
      // 7 — coda: the box alone again, and its stop; the flute picks it up (A)
      {
        name: "coda",
        chords: "F | F | F | C7",
        pad: { inst: "strings", vel: 0.4 }, bass: { pat: "swell", vel: 0.6 },
        lead: { inst: "bell", vel: 1.25, n: `${BOX} | ${BOX} | ${BOX} | c6 .:2` },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6, 7], loopFrom: 1,
  },
} satisfies Piece;
