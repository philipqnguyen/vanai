// ---------- The Capital of Vanai — "The Table Is Set" ----------
// The empty city of the main quest, levels 44-50: a bastioned octagon on the
// empire's own survey lines, limestone arcades under one cornice, verdigris
// domes, the gold crown on the palace lantern. Intact, immaculate and empty —
// a whole city set like a table for a festival nobody came to, bread queues
// chalked on the bakery board, a child's game abandoned mid-move in the
// square, and no dust anywhere, because someone has been dusting. The whole
// city is the last dungeon, its household guard polite and implacable, and at
// the top of the Great Stair the Regent, the last servant, given the keys and
// one command: deliver the city whole. Beaten, it asks the first question it
// has ever asked for itself: "Was it long, for you?"
//
// So the music is a court dance with nobody dancing: a sarabande in 3/4 at 88,
// the stately one with its weight on the second beat, in F major — the
// Household's own theme, which the Burned Land has already heard once, from
// the walls. It is played first by too small a band (a flute, pizzicato
// chords on the sarabande's second beat, a harp) with the archive clock
// ticking under it in a closed hat, the one sound a perfectly kept empty city
// makes. The homesickness is the music box: the same theme in the minor on
// glass, alone. The dungeon is in B, where the theme turns minor and the
// household guard walk it — circling harp, a clock that ticks twice as fast —
// and in the Regent's section, a French-overture processional on brass that
// is grand, courteous, and not at all a villain's.
//
//   intro  the archive clock chimes the quarter, the music box starts the
//          theme, the ticking comes in — skipped on the loop
//   A      the Table Is Set: the theme on flute, pizzicato on beat two, harp,
//          the clock. Half-close on bar 8, home on bar 16.
//   B      the Household Guard: D minor, the theme turned minor on the reed
//          with a horn walking under it, a low harp circling in eighths, the
//          ticking doubled, timpani; ends on the dominant
//   A'     Set for a Festival: the theme as the city imagines it — flute and
//          strings in octaves, horn counter-line, flowing harp
//   C      the Seat of the Household: B-flat, the subdominant, straight off
//          the F that closes A' — the Regent's dotted processional on brass,
//          horn chords leaning on beat two, spiccato, choir, timpani — the
//          loudest section
//   D      Was It Long: the theme in D minor on glass, alone but for a harp
//          comb, the choir and the clock bell — the quietest bars, half-closing
//          back onto A
//
// The clock is the city's keeper and the glass is its homesickness; only C is
// allowed to sound like a court.

import { onFirst, type Piece } from "./kit.ts";

/** The Household's theme: a sarabande, short-long, half-close on bar 8 and the
 *  answer up to the D before coming home. A and A' play it; the Burned Land's
 *  C section quotes its first eight bars in 4/4. */
const THEME_CHORDS = `
  F | C/E | Dm | Am | Bb | F/A | Gm7 | C |
  F | C/E | Dm | Bb | F/C | Gm  | C7  | F `;
const THEME = `
  c5 f5:2 | e5 g5:2 | a5:1.5 g5:.5 f5 | e5:2 c5 | d5 bf5:2 | a5 f5:2 | g5:1.5 f5:.5 e5 | g5:3 |
  c5 f5:2 | e5 g5:2 | a5:1.5 bf5:.5 c6 | d6:2 bf5 | c6:1.5 a5:.5 f5 | bf5 g5:2 | g5:1.5 e5:.5 c5 | f5:3 `;
/** A' only: the horn's line under the theme, long and low */
const THEME_HORN = `
  a3:3 | g3:3 | f3:3 | e3:3 | f3:3 | f3:3 | bf3:3 | g3:1.5 e3:1.5 |
  a3:3 | c4:3 | d4:3 | d4:3 | c4:3 | bf3:3 | bf3:3 | a3:3 `;
/** The theme turned minor: B's reed and D's music box. */
const MINOR = "a4 d5:2 | cs5 e5:2 | f5:1.5 e5:.5 d5 | d5:2 b4";

/** the archive clock, a closed hat on the quarter: the only sound the kept city makes */
const CLOCK = { hat: "x...o...o...", vel: 0.32 };

export default {
  title: "The Table Is Set",
  zones: ["capital"],
  note: "a sarabande in F (3/4, weight on beat two) for a court with nobody in it: the clock ticks under A, the guard walk the theme in D minor (B), the Regent's dotted processional on brass (C), and the music box (D) is the homesickness",
  song: {
    bpm: 88, beats: 3, space: 3.4,
    sections: [
      // 0 — intro: the clock chimes, the music box starts, the ticking begins
      {
        name: "intro",
        chords: "F | Bb/F | Fadd9 | C7sus4 C7",
        pad: { inst: "choir", vel: 0.55 }, bass: { pat: "swell", vel: 0.65 },
        lead: { inst: "bell", vel: 0.4, n: "a5:3 | f5:3 | g5:3 | c5:3" },
        counter: { inst: "glass", vel: 0.35, n: ".:3 | .:3 | c6 f6:2 | g6:1.5 e6:1.5" },
        drums: { hat: "............ | ............ | x...o...o... | x...o...o...", vel: 0.32 },
      },
      // 1 — A, the Table Is Set: too small a band, and the clock
      {
        name: "A Table Is Set",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.7 },
        hits: { inst: "pizz", pat: ".x.", unit: 1, oct: 3, vel: 1.15 },
        arp: { inst: "harp", pat: "0 . . 2 1 .", unit: 0.5, oct: 4, vel: 0.55 },
        lead: { inst: "flute", n: THEME },
        parts: [{ inst: "bell", vel: 0.3, n: `f5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          f5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3` }],
        drums: CLOCK,
      },
      // 2 — B, the Household Guard: the theme turned minor, walked
      {
        name: "B Household Guard",
        chords: `
          Dm | A/C# | Dm/C | G/B | Bb | Gm6    | Asus4 A | Dm |
          Dm | Bbmaj7 | Gm | A7  | Bb | E7     | Asus4 A | A `,
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "root", vel: 0.9 },
        arp: { inst: "harp", pat: "0 1 2 1 2 1", unit: 0.5, oct: 3, vel: 0.9 },
        lead: { inst: "reed", vel: 1.15, n: `
          ${MINOR} | bf4 d5:2 | e5 d5 bf4 | d5:1.5 cs5:1.5 | d5:3 |
          f5 a5:2 | a5:1.5 g5:.5 f5 | g5 d5:2 | cs5 e5 g5 | f5:2 d5 | d5 b4 gs4 | d5:1.5 cs5:1.5 | a4:3 ` },
        counter: { inst: "horn", vel: 0.95, n: `
          d4:3 | e4:3 | f4:3 | g4:3 | f4:3 | e4:3 | e4:3 | f4:3 |
          a4:3 | f4:3 | d4:3 | cs4:3 | d4:3 | d4:3 | e4:3 | cs4:3 ` },
        parts: [{ inst: "timpani", vel: 0.55, n: `
          d2:3 | .:3 | .:3 | .:3 | bf1:3 | .:3 | a1:3 | .:3 |
          d2:3 | .:3 | g1:3 | a1:3 | bf1:3 | e2:3 | a1:3 | a1?:.25*12 ` }],
        drums: { hat: "x.o.x.o.x.o.", vel: 0.3 },
      },
      // 3 — A', Set for a Festival: the theme as the city imagines it
      {
        name: "A' Festival",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.9 }, bass: { pat: "root", vel: 0.9 },
        hits: { inst: "pizz", pat: ".x.", unit: 1, oct: 3, vel: 1.1 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.55 },
        lead: { inst: "flute", n: THEME },
        counter: { inst: "horn", vel: 0.9, n: THEME_HORN },
        parts: [{ inst: "strings", oct: -1, vel: 3.0, n: THEME }],
      },
      // 4 — C, the Seat of the Household: the Regent's processional
      {
        name: "C Seat of the Household",
        chords: `
          Bb | F/A | Gm | Eb | Bb/F | Cm7 | F7 | Bb |
          Gm | Dm/F | Eb | Bb/D | Cm | Bb/D | F7 | Bb `,
        pad: { inst: "choir", vel: 1.2 }, bass: { pat: "root", vel: 1.0 },
        hits: { inst: "horn", pat: "x.X---", unit: 0.5, oct: 3, vel: 0.55 },
        arp: { inst: "spiccato", pat: "0 1 2 1 2 1", unit: 0.5, oct: 3, vel: 0.75 },
        lead: { inst: "brass", vel: 1.3, n: `
          f4:.75 f4:.25 bf4:2 | a4:.75 c5:.25 f5:2 | d5:1.5 c5:.5 bf4 | bf4:2 g4 |
          f4:.75 f4:.25 d5:2 | ef5:1.5 d5:.5 c5 | bf4:1.5 a4:1.5 | bf4:3 |
          d5:.75 d5:.25 g5:2 | f5:2 d5 | ef5:.75 f5:.25 g5:2 | f5:1.5 d5:.5 bf4 |
          c5:.75 ef5:.25 g5:2 | f5:2 d5 | ef5:1.5 c5:1.5 | bf4:3 ` },
        counter: { inst: "strings", vel: 2.5, n: `
          d4:3 | c4:3 | d4:3 | ef4:3 | d4:3 | ef4:3 | c4:3 | d4:3 |
          d4:3 | d4:3 | ef4:3 | f4:3 | ef4:3 | f4:3 | a4:3 | f4:3 ` },
        parts: [{ inst: "timpani", vel: 0.6, n: `
          bf1!:3 | f1:3 | g1:3 | ef2:3 | f1:3 | c2:3 | f1:1.5 f1:.5*3 | bf1:3 |
          g1:3 | f1:3 | ef2:3 | d2:3 | c2:3 | d2:3 | f1?:.25*12 | bf1!:3 ` }],
        drums: { kick: "x...........", crash: onFirst("X...........", 8), vel: 0.5, fill: { tom: "......1.2.3.", every: 8 } },
      },
      // 5 — D, Was It Long: the music box, alone
      {
        name: "D Was It Long",
        chords: "Dm | A/C# | Dm/C | G/B | Gm | Bb | C7sus4 | C7",
        pad: { inst: "choir", vel: 0.65 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "harp", pat: "0 1 2", unit: 1, oct: 4, vel: 0.5 },
        lead: { inst: "glass", oct: 1, vel: 0.8, n: `${MINOR} | bf4 d5:2 | f5:1.5 d5:.5 bf4 | f5:3 | e5:3` },
        counter: { inst: "horn", vel: 0.6, n: ".:3 | .:3 | .:3 | .:3 | d4:3 | d4:3 | c4:3 | bf3:3" },
        parts: [{ inst: "bell", vel: 0.3, n: "d5:3 | .:3 | .:3 | .:3 | bf4:3 | .:3 | .:3 | .:3" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
