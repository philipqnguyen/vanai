// ---------- The Propagating Cellars — "Phase Three" ----------
// The cellars under the King's Gardens glasshouse, where the Restoration's
// third phase is being carried out to the letter: ordered production for the
// capital's parks. Warm brick groin vaults, benches of pots between the piers,
// glazed propagating cases on hot-beds, the boiler, tiered staging, and the
// Sapling Nursery under the Great Lantern, where the mother stock stands in
// her tub with the saplings in ranks round her. The glasshouse is overhead and
// never seen: its daylight comes down through the floor lights whitewashed,
// with the shadows of the fronds on it. One branch has gone wrong — a bay of
// the vault fell in and the roots came down through the broken light.
//
// So: growth by rule. Under the tune, the harp and the pizzicato each repeat a
// short cell of their own length — six eighths for the harp, three quarters
// for the pizzicato — over a 4/4 bar, so the pattern lines up again only
// every three bars and the texture keeps turning over like work on a bench
// (`cycle()` below writes them out). F lydian at 96: the raised fourth (the B,
// the G-over-F chord) is the light coming down through the glass — bright,
// a little unearthly, never sad.
//
//   intro  the harp's cell alone, then the pizzicato's — skipped on the loop
//   A      the Potting Hall: the flute's long tune over the two cells, a
//          string bed. Half-close at bar 8, onto C at 16.
//   B      the Forcing Range: B-flat, the heat — the reed's warmer tune over
//          the salon of a glasshouse cellar (piano broken chords, a horn
//          below), a soft shaker-and-kick pulse like the boiler
//   C      Rootbound Stock: D minor, the branch where the roots came through.
//          Low strings creeping by half-steps, pizzicato in the bass, glass
//          up high, one distant taiko — the only shadow, eight bars long
//   D      the Sapling Nursery: back in F lydian under the Great Lantern. The
//          strings take the flute's tune, the horn holds below, the choir,
//          a third cell (the lute, five eighths) joins the other two, timpani
//
// The cells never stop for long because the work never does; the tune is the
// light on it.

import type { Piece } from "./kit.ts";

/** Write `bars` bars of a repeating cell, `per` cells' notes to the bar,
 *  wrapping the cell across bar lines — the phasing is the point. */
const cycle = (notes: string[], bars: number, per: number) => {
  const out: string[] = [];
  for (let b = 0; b < bars; b++) out.push(Array.from({ length: per }, (_, i) => notes[(b * per + i) % notes.length]).join(" "));
  return out.join(" | ");
};
// The cells use only notes that sit over every chord of the light: no F, and
// no C, which grinds a semitone on the B of the G-over-F, G and Em7 bars
// (seven of sixteen). The harp carries the lydian B itself instead.
/** six eighths of the harp */
const HARP = ["g4", "d5", "e5", "a5", "b4", "e5"];
/** three quarters of pizzicato */
const PIZZ = ["a3", "e4", "d4"];
/** five eighths of lute, for the Nursery */
const LUTE = ["b3", "g4", "e4", "a4", "d4"];

const LIGHT_CHORDS = `
  F   | G/F | Am7   | G/F | F   | G/F | Em7 | Am7 |
  Dm7 | Em7 | Fmaj7 | G   | Am7 | G/B | Dm7 | C   `;
/** the flute's tune: long notes, the lydian B on the first G-over-F */
const LIGHT = `
  a5:3 g5    | b5:2 a5 g5  | e5:4        | d5:2 g5:2  |
  a5:3 g5    | b5:2 d6 c6  | b5:2 g5:2   | a5:4       |
  f5:2 a5 c6 | b5:2 g5 e5  | e5:2 f5 a5  | b5:2 d6:2  |
  c6:2 b5 a5 | g5:3 d5     | d5:2 f5 a5  | g5:4       `;
const LIGHT_HORN = `
  f4:4 | g4:4 | e4:4 | d4:4 | f4:4 | g4:4 | g4:4 | e4:4 |
  f4:4 | e4:4 | e4:4 | d4:4 | e4:4 | d4:4 | f4:4 | e4:4 `;

export default {
  title: "Phase Three",
  zones: ["glasshouse"],
  note: "growth by rule: the harp repeats six eighths and the pizzicato three quarters over 4/4, so the texture turns over every three bars; F lydian for the light through the glass. Listen for the reed's warm B-flat in the Forcing Range and the eight dark bars of the roots",
  song: {
    bpm: 96, space: 2.8,
    sections: [
      // 0 — intro: the harp's cell, then the pizzicato's
      {
        name: "intro",
        chords: "F | G/F | F | G/F",
        pad: { inst: "strings", vel: 0.4 }, bass: { pat: "swell", vel: 0.6 },
        parts: [
          { inst: "harp", unit: 0.5, vel: 0.75, n: cycle(HARP, 4, 8) },
          { inst: "pizz", vel: 1.0, n: ".:4 | .:4 | " + cycle(PIZZ, 2, 4) },
        ],
      },
      // 1 — A, the Potting Hall: the flute over the two cells
      {
        name: "A Potting Hall",
        chords: LIGHT_CHORDS,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.7 },
        lead: { inst: "flute", vel: 1.0, n: LIGHT },
        parts: [
          { inst: "harp", unit: 0.5, vel: 0.75, n: cycle(HARP, 16, 8) },
          { inst: "pizz", vel: 1.0, n: cycle(PIZZ, 16, 4) },
        ],
      },
      // 2 — B, the Forcing Range: B-flat, the heat, the reed
      {
        name: "B Forcing Range",
        chords: `
          Bb | F/A  | Gm7 | F   | Ebmaj7 | Bb/D | Cm7 | F  |
          Bb | F/A  | Gm7 | Dm7 | Ebmaj7 | F/Eb | Gm7 | C7 `,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "oct", vel: 0.75 },
        lead: { inst: "reed", vel: 1.05, n: `
          d5:2 f5 bf5  | a5:3 f5     | bf5:2 a5 g5  | f5:4        |
          g5:3 bf5     | f5:2 d5 bf4 | c5 ef5 g5 bf5 | a5:4       |
          d6:2 c6 bf5  | c6:2 a5 f5  | g5:2 f5 d5   | a5:3 f5     |
          g5:2 bf5 g5  | a5:2 c6 a5  | bf5:2 a5 g5  | e5:2 c5:2   ` },
        counter: { inst: "horn", vel: 0.7, n: `
          f4:4 | f4:4 | d4:4 | c4:4 | ef4:4 | f4:4 | ef4:4 | f4:4 |
          f4:4 | f4:4 | d4:4 | d4:4 | ef4:4 | ef4:4 | d4:4 | e4:4 ` },
        arp: { inst: "piano", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 3, vel: 0.7 },
        drums: { kick: "x.......x.....x.", shaker: "x.xox.xox.xox.xo", vel: 0.45 },
      },
      // 3 — C, Rootbound Stock: D minor, the roots through the broken light
      {
        name: "C Rootbound Stock",
        chords: "Dm | Dm/C | Bb | A | Dm | Gm/Bb | Em7b5 | A7",
        pad: { inst: "pad", vel: 0.7 }, bass: { pat: "swell", vel: 0.75 },
        lead: { inst: "strings", vel: 2.0, n: `
          a4:2 bf4 a4 | g4:2 f4 e4 | f4:3 d4 | cs4:4 |
          d4:2 f4 a4  | bf4:2 a4 g4 | bf4:2 g4 e4 | e4:2 cs4:2 ` },
        counter: { inst: "glass", vel: 0.35, n: "d6:4 | .:4 | f6:4 | e6:4 | d6:4 | .:4 | bf5:4 | a5:4" },
        arp: { inst: "pizz", pat: "0 . 1 . 0 . 2 .", unit: 0.5, oct: 2, vel: 0.9 },
        parts: [{ inst: "timpani", vel: 0.4, n: "d2:4 | .:4 | .:4 | a1?:.25*16 | d2:4 | .:4 | .:4 | a1?:.25*16" }],
        drums: { taiko: "3............... | ................", vel: 0.35 },
      },
      // 4 — D, the Sapling Nursery: the tune grown, three cells, the choir
      {
        name: "D Sapling Nursery",
        chords: LIGHT_CHORDS,
        pad: { inst: "choir", vel: 1.15 }, bass: { pat: "oct", vel: 0.95 },
        lead: { inst: "strings", vel: 3.5, n: LIGHT },
        counter: { inst: "horn", vel: 1.2, n: LIGHT_HORN },
        parts: [
          { inst: "harp", unit: 0.5, vel: 0.7, n: cycle(HARP, 16, 8) },
          { inst: "pizz", vel: 0.95, n: cycle(PIZZ, 16, 4) },
          { inst: "lute", unit: 0.5, vel: 0.5, n: cycle(LUTE, 16, 8) },
          { inst: "flute", vel: 0.55, n: `
            .:4 | .:4 | .:4 | .:4 | c6:4 | d6:4 | b5:4 | c6:4 |
            a5:4 | b5:4 | c6:4 | d6:4 | e6:4 | d6:4 | a5:4 | g5:4 ` },
          { inst: "timpani", vel: 0.65, n: "f2!:4 | .:4 | a1:4 | .:4 | f2:4 | .:4 | e2:4 | a1:4 | d2:4 | e2:4 | f2:4 | g1:4 | a1:4 | b1:4 | d2:4 | c2?:.25*16" },
        ],
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
