// ---------- The Granary Plains — "The Stores Are Filling" ----------
// The empire's breadbasket gone feral, and still producing: wheat to every
// horizon under a big afternoon sky, granary towers standing on the eastern
// rise like castles, the river a blue ribbon through the gold, and across the
// middle distance the reaping line — harvester sentinels, small and tireless,
// cutting a harvest for a country that is not coming to eat it. "This year
// the doors are open and the stores are filling." The ash of the fire line
// lies along the north edge, the one grey band in it. Levels 22-34.
//
// So: a harvest waltz. 3/4 at 116, F major — warm, wide, the generous key — a
// sung tune with a long-short lilt and a leap to the top of the stave in its
// second bar, the kind of thing a field crew sings without deciding to. The
// tireless reapers are an ostinato that never stops in their section; the
// keep where the count is kept gets a hymn; the fire line gets eight bars of
// D minor and nothing more, because the dread belongs at the edge.
//
//   intro  the lute's oom-pah-pah, a far horn, a lark — skipped on the loop
//   A      Wheat: the tune on the strings like a field crew singing, lute
//          on beats 2 and 3, flute answering the half-close and the cadence
//   A'     Gleaners: everyone joins — the flute takes the tune, the reed sings
//          a third or a sixth under it, a shaker and the kick come in
//   B      the Reaping Line: D minor, the spiccato ticking eighths without a
//          break (the sentinels), a sly reed tune that pecks between rests,
//          glass calls from far down the line; ends on A, the half-close
//   C      the Great Granary: B's closing A steps up onto Bb (the lift), a hymn
//          on the horn over choir and full strings, timpani, flute descant —
//          the loudest section, the stores full
//   D      the Fire Line: D minor, choir and a lone flute singing the tune's
//          opening in the minor over soft timpani, the grey band at the edge;
//          its C7 hands back to A's F
//
// Neighbours: the Glassworks (7/8, A mixolydian), the Canal Works (4/4,
// G dorian, swung) and the Summer Lakes, the other waltz (E major, slower, on
// harp and flute, the resort's) — this one is the working waltz, strings and
// lute, and the only one that sounds like it has had a good year.

import { onFirst, type Piece } from "./kit.ts";

/** The harvest tune. Half-close on C7 in bar 8 (held high on G), home on F in
 *  bar 15, bar 16 left empty for the answer. A and A' play it. */
const TUNE = `
  c5:2 f5 | a5:1.5 g5:.5 f5 | d5:2 bf4 | c5:3 |
  a4:2 d5 | g5:1.5 f5:.5 d5 | bf4 c5 e5 | g5:3 |
  a5:2 f5 | c5:2 a4 | bf4 d5 f5 | bf5:1.5 a5:.5 g5 |
  a5:1.5 g5:.5 f5 | e5:1.5 d5:.5 e5 | f5:3 | .:3 `;
const TUNE_CHORDS = `
  F | F   | Bb | F    | Dm   | Gm | C | C7 |
  F | F/A | Bb | Gm7  | F/C  | C7 | F | F `;
/** A' only: the reed a third or a sixth under the flute, the gleaners joining */
const HARMONY = `
  a4:2 c5 | f5:1.5 e5:.5 c5 | bf4:2 f4 | a4:3 |
  f4:2 a4 | d5:1.5 c5:.5 bf4 | g4 a4 c5 | e5:3 |
  f5:2 c5 | a4:2 f4 | f4 bf4 d5 | g5:1.5 f5:.5 d5 |
  f5:1.5 e5:.5 c5 | c5:1.5 bf4:.5 c5 | a4:3 | .:3 `;
/** the answer where the tune holds: a lark at the half-close, a fall at home */
const ANSWER = `
  .:3 | .:3 | .:3 | .:1 f5:.5 g5:.5 a5 | .:3 | .:3 | .:3 | .:1 c6:.5 bf5:.5 a5:.5 g5:.5 |
  .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:1 c6 a5 | f5:1.5 g5:.5 a5 `;

export default {
  title: "The Stores Are Filling",
  zones: ["granaryplains"],
  note: "a harvest waltz in F: the tune sung on strings, then flute and reed in thirds; the Reaping Line's spiccato never stops; the Granary hymn steps up to Bb; only the eight-bar Fire Line is in the minor",
  song: {
    bpm: 116, beats: 3, space: 2.6,
    sections: [
      // 0 — intro: the oom-pah-pah, a far horn, a lark. Skipped on the loop.
      {
        name: "intro",
        chords: "F | Bb/F | F | C7",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.7 },
        hits: { inst: "lute", pat: ".xx", unit: 1, oct: 3, vel: 0.5 },
        // bar 2 turns on the Bb (it held A against the Bb/F, a bar of major sevenths)
        lead: { inst: "horn", vel: 0.6, n: "c4:2 f4 | bf4:1.5 a4:.5 f4 | .:3 | .:3" },
        counter: { inst: "flute", vel: 0.45, n: ".:3 | .:3 | .:1 f5:.5 g5:.5 a5 | c6:1.5 bf5:.5 g5" },
      },
      // 1 — A, Wheat: the tune on strings, lute on 2 and 3
      {
        name: "A Wheat",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.95 },
        hits: { inst: "lute", pat: ".xx", unit: 1, oct: 3, vel: 0.6 },
        // strings sit 10 dB under the flute or horn at one vel; at 1.3 the tune
        // measured level with the lute and the flute's answers, i.e. buried
        lead: { inst: "strings", vel: 3.4, n: TUNE },
        counter: { inst: "flute", vel: 0.5, n: ANSWER },
        drums: { shaker: "x...o...o...", vel: 0.45 },
      },
      // 2 — A', Gleaners: flute and reed in thirds, the kick in
      {
        name: "A' Gleaners",
        chords: TUNE_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "root", vel: 0.95 },
        hits: { inst: "lute", pat: ".xx", unit: 1, oct: 3, vel: 0.65 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.45 },
        lead: { inst: "flute", vel: 1, n: TUNE },
        counter: { inst: "reed", vel: 0.65, n: HARMONY },
        drums: {
          kick: "x...........", shaker: "x.o.x.o.x.o.", tom: "........2.2.", vel: 0.5,
          fill: { tom: "....2.2.1.1.", every: 8 },
        },
      },
      // 3 — B, the Reaping Line: D minor, the ostinato that never stops
      {
        name: "B Reaping Line",
        chords: `
          Dm | Bb | F | C   | Dm | Bb | Gm    | A |
          Dm | Bb | F | C/E | Bb | Gm | Asus4 | A `,
        // one bass note a bar under the spiccato's ticking eighths: the reapers
        // are the rhythm here, the bass only the ground
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "root", vel: 0.7 },
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1", unit: 0.5, oct: 3, vel: 0.8 },
        lead: { inst: "reed", vel: 0.95, n: `
          a4 d5 e5 | f5:2 d5 | c5 a4 f4 | g4:2 e4 |
          a4 d5 e5 | f5:2 g5 | f5 d5 bf4 | cs5:3 |
          f5 e5 d5 | d5:2 f5 | c5:2 a4 | c5 bf4 g4 |
          f4 bf4 d5 | d5:1.5 c5:.5 bf4 | a4:2 d5 | cs5:3 ` },
        // the next sentinel down the line answering, far off
        counter: { inst: "glass", vel: 0.3, n: `
          .:3 | .:3 | .:3 | .:1 e6:2 | .:3 | .:3 | .:3 | .:1 e6:2 |
          .:3 | .:3 | .:3 | .:1 g6:2 | .:3 | .:3 | .:3 | .:1 e6:2 ` },
        parts: [{ inst: "pizz", vel: 0.8, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          d4 . a3 | d4 . f4 | c4 . a3 | c4 . g3 | d4 . bf3 | g3 . d4 | a3 . e4 | a3 . . ` }],
        drums: { hat: "x.o.x.o.x.o.", vel: 0.3 },
      },
      // 4 — C, the Great Granary: the hymn on Bb
      {
        name: "C Great Granary",
        chords: `
          Bb | F/A  | Gm  | Eb | Bb/F | F  | Bb | F  |
          Eb | Bb/D | Cm7 | F  | Gm   | Eb | F7 | Bb `,
        // the bass on 1 and 3 with the lute, written out (what `oct` now plays
        // in 3/4, music.ts bassSteps; written when it still hiccuped on the and of 2)
        pad: { inst: "choir", vel: 0.7 }, bass: null,
        hits: { inst: "lute", pat: "X-x", unit: 1, oct: 3, vel: 0.5 },
        lead: { inst: "horn", vel: 1.1, n: `
          bf4:2 d5 | c5:2 f5 | d5:1.5 c5:.5 bf4 | g4:3 |
          f4:2 bf4 | c5:2 a4 | d5:2 f5 | c5:3 |
          bf4:2 ef5 | d5:2 bf4 | c5:1.5 bf4:.5 g4 | a4:2 c5 |
          d5:2 bf4 | ef5:1.5 d5:.5 c5 | a4:1.5 c5:.5 ef5 | d5:3 ` },
        counter: { inst: "flute", vel: 0.5, n: `
          f5:3 | f5:3 | g5:3 | g5:3 | f5:3 | a5:3 | bf5:3 | a5:3 |
          g5:3 | f5:3 | ef5:3 | f5:3 | g5:3 | g5:3 | f5:1.5 ef5:1.5 | d5:3 ` },
        parts: [
          { inst: "strings", vel: 0.55, n: `
            d4:3 | c4:3 | d4:3 | bf3:3 | d4:3 | c4:3 | d4:3 | c4:3 |
            g3:3 | f3:3 | g3:3 | a3:3 | bf3:3 | g3:3 | a3:3 | bf3:3 ` },
          { inst: "timpani", vel: 0.5, n: `
            bf1:3 | .:3 | .:3 | .:3 | f2:3 | .:3 | .:3 | f2:.25*12 |
            bf1:3 | .:3 | .:3 | f2:3 | .:3 | .:3 | f2:.25*12 | bf1:3 ` },
          { inst: "bass", vel: 0.95, n: "bf2:2 bf3 | a2:2 a3 | g2:2 g3 | ef2:2 ef3 | f2:2 f3 | f2:2 f3 | bf2:2 bf3 | f2:2 f3 | ef2:2 ef3 | d2:2 d3 | c2:2 c3 | f2:2 f3 | g2:2 g3 | ef2:2 ef3 | f2:2 f3 | bf2:2 bf3" },
        ],
        drums: { kick: "x...........", shaker: "x.o.x.o.x.o.", crash: onFirst("x...........", 8), vel: 0.5 },
      },
      // 5 — D, the Fire Line: the tune's opening in the minor, at the edge
      {
        name: "D Fire Line",
        chords: "Dm | Bb | Gm | A | Dm | Bb | Gm6 | C7",
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "swell", vel: 0.75 },
        lead: { inst: "flute", vel: 0.8, n: `
          a4:2 d5 | f5:1.5 e5:.5 d5 | bf4:2 g4 | a4:3 |
          a4:2 d5 | f5:1.5 g5:.5 f5 | d5:2 bf4 | e5:1.5 d5:.5 g4 ` },
        parts: [{ inst: "timpani", vel: 0.35, n: "d2:3 | .:3 | .:3 | a1:3 | d2:3 | .:3 | .:3 | c2:.25*12" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
