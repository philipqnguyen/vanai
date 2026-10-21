// ---------- The King's Gardens — "Nothing Here Is Wild" ----------
// The royal parterres under the crescent: four hedge-ruled squares round a
// fountain court, silver-bedded and gravel-walked, statues at the corners,
// the turf terraces climbing to a belvedere, a hedge labyrinth, a glasshouse
// where the cuttings go. Cool pearl light, as if the zone had its own overcast
// made of silk. Still watered, still pruned, still perfect: the sentinels here
// are gardeners, and they are very busy. It was planted over Heartwood's
// groves, and the nursery stock is being readied for a capital that is coming
// home. "The most beautiful zone and the most unnerving, because nothing here
// is wild" — and you are trespassing.
//
// So the music is clipped to shape. A major, 4/4 at 100, a gavotte: a court
// dance, walking bass, a lute keeping the continuo in even eighths, and no
// drums but the gardeners' closed hat in B. The harmony is a ground — a
// bass falling step by step down the scale (A G# F# E D C# B, then E), the
// same descent twice in a row, changed only where the second one closes —
// and the tune is a sequence, each
// two-bar figure the last one moved down a third, so every bed matches the
// one beside it. Beautiful, and a little too tidy to trust.
//
//   intro  the Fountain Court: the harp rising and falling like the jet,
//          glass in the spray — skipped on the loop
//   A      the Four Parterres: the gavotte on flute over the ground, the lute
//          continuo and the walking bass
//   B      the Gardeners: F-sharp minor, the tune on spiccato in clipped
//          notes, a spiccato row snipping under it, a closed hat ticking like
//          shears, the horn holding still — and in the second half a flute
//          copying the spiccato note for note. They are very busy.
//   A'     the Parterres again with the reed following the flute in canon,
//          two bars behind and an octave down, strict until each cadence —
//          the gardeners' kind of beauty
//   C      the Glasshouse: D lydian (the raised fourth, the G#, is the light
//          through the panes), piano and glass over a choir, the cuttings
//          crated for the capital: the hush, and the homesickness — then the
//          dominant, and back to the parterres
//
// The canon is the unnerving part, not a minor key: everything copies
// everything, and nothing grows out of place.

import type { Piece } from "./kit.ts";

/** The ground: the bass walks down the scale, the same descent twice; only
 *  the last two bars differ (half-close, then the close). */
const GROUND = `
  A | E/G# | F#m | C#m/E | D | A/C# | Bm7    | E |
  A | E/G# | F#m | C#m/E | D | A/C# | Bm7 E7 | A `;
/** The gavotte: each two-bar figure is the last one a third lower (bars 1-6),
 *  a half-close on E at bar 8; the second half climbs instead and closes. */
const GAVOTTE = `
  a4 cs5 e5 a5      | gs5:1.5 fs5:.5 e5 b4 | fs4 a4 cs5 fs5     | e5:1.5 d5:.5 cs5 gs4 |
  d4 fs4 a4 d5      | cs5:1.5 b4:.5 a4 e4  | b4 d5 fs5 a5       | gs5:1.5 fs5:.5 e5:2  |
  a4 cs5 e5 a5      | b5:1.5 a5:.5 gs5 e5  | a5:1.5 gs5:.5 fs5 cs5 | gs5:1.5 fs5:.5 e5 cs5 |
  d5 fs5 a5 fs5     | e5 cs5 a4 cs5        | d5 b4 gs4 b4       | a4:2 .:2 `;
/** A' only: the reed plays the flute's bars two bars late and an octave down
 *  (bars 3-7 and 11-13), free only where a cadence needs it. */
const CANON = `
  .:4               | .:4                  | a3 cs4 e4 a4       | gs4:1.5 fs4:.5 e4 b3 |
  fs3 a3 cs4 fs4    | e4:1.5 d4:.5 cs4 gs3 | d3 fs3 a3 d4       | b3:1.5 a3:.5 gs3:2   |
  .:4               | .:4                  | a3 cs4 e4 a4       | b4:1.5 a4:.5 gs4 e4  |
  a4:1.5 gs4:.5 fs4 cs4 | a4:1.5 fs4:.5 e4 cs4 | fs4 d4 e4 d4   | cs4:2 .:2 `;
/** the continuo: Alberti eighths on the lute, harpsichord-plain */
const ALBERTI = "0 2 1 2 0 2 1 2";
/** the Gardeners' tune, in clipped notes with air between them */
const SHEARS_TUNE = `
  fs4:.5 .:.5 cs5:.5 .:.5 fs5:1.5 e5:.5 | es5 cs5 gs4:2 | a4:.5 .:.5 cs5:.5 .:.5 fs5:1.5 gs5:.5 | a5 fs5 ds5:2 |
  d5:.5 .:.5 fs5:.5 .:.5 b5:1.5 a5:.5   | a5 fs5 cs5:2  | d5 b4 es4 gs4                         | fs4:2 .:2     |
  a4:.5 .:.5 d5:.5 .:.5 fs5:1.5 e5:.5   | e5 cs5 a4:2   | b4:.5 .:.5 d5:.5 .:.5 fs5:1.5 a5:.5   | gs5 es5 cs5:2 |
  cs5:.5 .:.5 fs5:.5 .:.5 a5:1.5 gs5:.5 | fs5 d5 a4:2   | b4 d5 fs5 a5                          | a5:2 gs5:2 `;
const REST8 = ".:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4";

export default {
  title: "Nothing Here Is Wild",
  zones: ["kingsgardens"],
  note: "an A-major gavotte at 100, drumless but for a shears-hat in B: a ground bass walking down the scale twice; the reed follows the flute in canon in A', and the Glasshouse turns lydian",
  song: {
    bpm: 100, space: 2.4,
    sections: [
      // 0 — intro: the Fountain Court
      {
        name: "intro",
        chords: "A | D/A | E/A | A",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "swell", vel: 0.6 },
        arp: { inst: "harp", pat: "0 1 2 3 4 5 4 3", unit: 0.5, oct: 4, vel: 0.65 },
        lead: { inst: "flute", vel: 0.75, n: ".:4 | .:4 | .:4 | .:2 e5 cs5" },
        parts: [{ inst: "glass", vel: 0.3, n: "cs6:4 | .:4 | b5:4 | .:4" }],
      },
      // 1 — A, the Four Parterres
      {
        name: "A Four Parterres",
        chords: GROUND,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "walk", vel: 0.85 },
        arp: { inst: "lute", pat: ALBERTI, unit: 0.5, oct: 3, vel: 0.85 },
        lead: { inst: "flute", vel: 1, n: GAVOTTE },
        // the horn bows at each cadence and says nothing else
        counter: { inst: "horn", vel: 0.6, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | fs3:2 a3:2 | b3:2 gs3:2 |
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | fs3:2 gs3:2 | a3:4 ` },
      },
      // 2 — B, the Gardeners: clipped, busy, copied
      {
        name: "B Gardeners",
        chords: `
          F#m | C#/E# | F#m/E | B7/D# | Bm/D | F#m/C# | Bm7 C#7 | F#m |
          D   | A/C#  | Bm7   | C#7   | F#m  | D      | Bm7     | E7sus4 E7 `,
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.8 },
        arp: { inst: "spiccato", pat: "0 . 2 . 1 . 2 .", unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "spiccato", vel: 1.2, n: SHEARS_TUNE },
        counter: { inst: "horn", vel: 0.55, n: `
          a3:4 | gs3:4 | a3:4 | a3:2 fs3:2 | fs3:4 | a3:4 | fs3:2 gs3:2 | a3:4 |
          fs3:4 | e3:4 | d4:4 | es3:2 gs3:2 | a3:4 | a3:4 | d4:2 fs4:2 | d4:4 ` },
        // the second gardener: the same notes, from bar 9
        parts: [{ inst: "flute", vel: 0.55, n: `${REST8} | ${SHEARS_TUNE.split("|").slice(8).join("|")}` }],
        drums: { hat: "..x...x...x...x.", vel: 0.3 },
      },
      // 3 — A', the Parterres in canon
      {
        name: "A' Parterres in canon",
        chords: GROUND,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "walk", vel: 0.95 },
        arp: { inst: "lute", pat: ALBERTI, unit: 0.5, oct: 3, vel: 0.9 },
        lead: { inst: "flute", vel: 1.1, n: GAVOTTE },
        counter: { inst: "reed", vel: 0.9, n: CANON },
      },
      // 4 — C, the Glasshouse: D lydian, the hush
      {
        name: "C Glasshouse",
        chords: "Dmaj7s11 | Dmaj7s11 | C#m7 | F#m7 | Bm7 | Dmaj7s11 | Bm7/E | E7sus4 E",
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "swell", vel: 0.75 },
        arp: { inst: "harp", pat: "0 1 2 3 4 3 2 1", unit: 0.5, oct: 4, vel: 0.5 },
        lead: { inst: "piano", vel: 0.9, n: `
          a5:1.5 gs5:.5 fs5:2 | e5:1.5 fs5:.5 a5:2 | gs5:2 e5:2 | cs5:4 |
          d5:1.5 e5:.5 fs5 a5 | gs5:3 fs5          | e5:2 d5 b4 | a4:2 gs4:2 ` },
        counter: { inst: "glass", vel: 0.28, n: "d6:4 | cs6:4 | b5:4 | a5:4 | fs5:4 | a5:4 | b5:4 | gs5:4" },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
