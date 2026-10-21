// ---------- The Moonmere Shores — "Heard Before It's Seen" ----------
// Moonmere's home shore, levels 1-10: reed beds and ferry piers around a
// sheltered bay, and the academy out in the Mere — violet-grey towers doubled
// in still water, the causeway walking out to them. The calmest of the three
// starts; the card says the water does the talking, and that a rowboat is
// heard before it's seen. The Provost says a shore is a clock if you read it
// slowly enough. Mereth, the ferryman's granddaughter, will tell you the far
// shore went quiet one night and never said why.
//
// So: 4/4 at a slow 80, E-flat major, the harp rippling in eighths like light
// on water and a bell every four bars for the Provost's clock. The tune is on
// the piano, because the city across the water plays its theme on one
// ("Deciding When", score/moonmere.ts), and its phrases end long and let the
// water finish them. The city's footnotes come too, but only twice: two glass
// notes after a phrase closes, the last of them the lydian A natural stepping
// up to B-flat, the way Moonmere's own last footnote steps B natural to C.
// The gulf ferry next door is the barcarolle (6/8, G); the shore stays on dry
// land and in four.
//
//   intro  the ripple, the bell, and very faintly the ferryman's song from B
//          — the rowboat, heard before it's seen — skipped on the loop
//   A      the Mere: the tune on piano, rising 5-1-3 like a hull lifting in
//          long-short pairs, a half-close on bar 8, home on bar 16; harp,
//          strings, the bell, two footnotes
//   B      the Ferry Piers: C minor, the ferryman's rowing song on the reed,
//          lute, a tom on each oar-stroke (one and three) and a shaker for the
//          creak after it; the flute answers across the water in the gaps,
//          then holds a descant
//   C      the Far Shore: the quietest bars in the zone — a choir bed, the
//          tune's rising head in the minor on a low flute, and then two bars
//          of nothing but water where an answer should be. Twice. That is the
//          far shore going quiet, and it is homesickness, not dread.
//   A'     the strings take the tune from the piano, the flute a descant,
//          the reed a low counter, pizzicato and a soft kick — the bay at
//          its fullest, which is still not loud
//
// The Shore Road is a habanera in A; the halfway inn on the North Road quotes
// this tune's first two bars.

import type { Piece } from "./kit.ts";

/** The tune: long-short pairs, phrases that end held. */
const TUNE = `
  bf4:1.5 ef5:.5 g5:2      | af5:1.5 g5:.5 f5 ef5   | g5:1.5 bf5:.5 g5 ef5 | f5:2 d5:2           |
  ef5:1.5 g5:.5 c6:2       | c6:1.5 bf5:.5 af5 ef5  | f5:1.5 af5:.5 c6 af5 | d5:1.5 ef5:.5 f5:2  |
  bf4:1.5 ef5:.5 g5:2      | c6:1.5 bf5:.5 af5:2    | g5:1.5 f5:.5 d5 bf4  | ef5:1.5 d5:.5 c5:2  |
  c5:1.5 ef5:.5 af5:2      | af5:1.5 g5:.5 f5 d5    | c5:1.5 ef5:.5 d5:1.5 f5:.5 | ef5:4 `;
const TUNE_CHORDS = `
  Eb | Ab/Eb | Eb  | Bb7sus4 Bb7 | Cm | Ab    | Fm7     | Bb7 |
  Eb | Ab    | Gm7 | Cm          | Ab | Bb/Ab | Fm7 Bb7 | Eb `;
/** the ferryman's song: rowing time, the oar dipping on one and three */
const FERRY = `
  g4:1.5 c5:.5 ef5:1.5 d5:.5 | c5:2 g4:2         | af4:1.5 c5:.5 f5:1.5 ef5:.5 | d5:2 b4:2     |
  g4:1.5 c5:.5 ef5:1.5 g5:.5 | af5:1.5 g5:.5 ef5:2 | f5:1.5 d5:.5 c5:1.5 af4:.5 | b4:1.5 c5:.5 d5:2 |
  ef5:1.5 c5:.5 af4:2        | f5:1.5 d5:.5 bf4:2 | g5:1.5 f5:.5 ef5:1.5 bf4:.5 | c5:1.5 d5:.5 ef5:2 |
  af5:1.5 g5:.5 f5:1.5 ef5:.5 | f5:1.5 ef5:.5 c5:2 | c5:2 b4:2                 | d5:1.5 f5:.5 af5:2 `;
/** the Provost's clock: one bell stroke a phrase */
const CLOCK = `
  bf5:4 | .:4 | .:4 | .:4 | g5:4 | .:4 | .:4 | .:4 |
  bf5:4 | .:4 | .:4 | .:4 | c6:4 | .:4 | .:4 | .:4 `;

export default {
  title: "Heard Before It's Seen",
  zones: ["moonmereshores"],
  note: "slow 4/4 in E-flat: the harp is the water, the bell the Provost's clock, the piano the city across the bay; listen for the ferryman's song arriving faintly in the intro before B, and the unanswered bars in C (the far shore)",
  song: {
    bpm: 80, space: 3.2,
    sections: [
      // 0 — intro: water, the clock, a rowing song far off
      {
        name: "intro",
        chords: "Eb | Cm/Eb | Eb | Bb7sus4 Bb7",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "swell", vel: 0.65 },
        arp: { inst: "harp", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 4, vel: 0.5 },
        lead: { inst: "reed", vel: 0.4, n: ".:4 | g4:1.5 c5:.5 ef5:1.5 d5:.5 | c5:2 .:2 | .:4" },
        counter: { inst: "bell", vel: 0.35, n: "bf5:4 | .:4 | .:4 | .:4" },
      },
      // 1 — A, the Mere: the piano across the water
      {
        name: "A the Mere",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.8 },
        arp: { inst: "harp", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 4, vel: 0.5 },
        lead: { inst: "piano", vel: 1.0, n: TUNE },
        counter: { inst: "bell", vel: 0.28, n: CLOCK },
        // the city's footnotes, twice: the last is the lydian A natural up to B-flat
        parts: [{ inst: "glass", vel: 0.3, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:2 af5 d6 |
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:2 a5 bf5 ` }],
      },
      // 2 — B, the Ferry Piers: the rowing song
      {
        name: "B Ferry Piers",
        chords: `
          Cm | Cm | Fm | G7 | Cm | Ab  | Fm6       | G   |
          Ab | Bb | Eb | Cm | Ab | Fm7 | G7sus4 G7 | Bb7 `,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "oct", vel: 0.85 },
        lead: { inst: "reed", vel: 1.1, n: FERRY },
        counter: { inst: "flute", vel: 0.5, n: `
          .:4 | .:2 ef6?:.5 d6?:.5 c6 | .:4 | .:2 d6?:.5 b5?:.5 g5 | .:4 | .:2 c6?:.5 bf5?:.5 af5 | .:4 | .:2 g5?:.5 b5?:.5 d6 |
          c6:4 | bf5:4 | bf5:4 | g5:4 | c6:4 | af5:4 | g5:4 | af5:4 ` },
        arp: { inst: "lute", pat: "0 2 1 2 0 2 1 2", unit: 0.5, oct: 3, vel: 0.7 },
        drums: { tom: "2.......2.......", shaker: "....x.......x...", vel: 0.45 },
      },
      // 3 — C, the Far Shore: the call in the minor, and no answer
      {
        name: "C Far Shore",
        chords: "Cm | Gm | Abmaj7 | Abmaj7 | Fm7 | Cm | Abmaj7 | Bb7sus4 Bb7",
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "swell", vel: 0.6 },
        arp: { inst: "harp", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 4, vel: 0.38 },
        lead: { inst: "flute", vel: 0.7, n: "g4:1.5 c5:.5 ef5:2 | d5:1.5 c5:.5 g4:2 | .:4 | .:4 | af4:1.5 c5:.5 ef5:2 | f5:1.5 ef5:.5 c5:2 | .:4 | .:4" },
        counter: { inst: "bell", vel: 0.25, n: "g5:4 | .:4 | .:4 | .:4 | c6:4 | .:4 | .:4 | .:4" },
      },
      // 4 — A', the bay at its fullest: strings on the tune
      {
        name: "A' the Mere",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "oct", vel: 0.9 },
        arp: { inst: "harp", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 4, vel: 0.45 },
        lead: { inst: "strings", vel: 3.2, n: TUNE },
        counter: { inst: "flute", vel: 0.5, n: `
          ef6:4 | c6:4  | bf5:4 | bf5:2 af5:2 | g5:4 | af5:4 | af5:4 | f5:4 |
          g5:4  | af5:4 | bf5:4 | g5:4        | c6:4 | bf5:4 | af5:2 af5:2 | g5:4 ` },
        parts: [
          { inst: "reed", vel: 0.45, n: `
            g4:4  | af4:4 | g4:4 | af4:2 af4:2 | g4:4 | ef4:4 | f4:4 | d4:4 |
            ef4:4 | ef4:4 | d4:4 | ef4:4       | ef4:4 | d4:4 | c4:2 d4:2 | ef4:4 ` },
        ],
        hits: { inst: "pizz", pat: "x..ox..o", unit: 0.5, oct: 3, vel: 0.6 },
        drums: { kick: "x.......x.......", shaker: "x.x.x.x.x.x.x.x.", vel: 0.35 },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
