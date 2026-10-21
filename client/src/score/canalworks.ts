// ---------- The Canal Works — "The Pay Is Good" ----------
// The empire's flood-works, which failed slowly with nobody at the sluices: one
// drowned canal running dead straight to a grey horizon, lock gates rotting in
// place, barge trains settling into the reeds of the basin, the keepers'
// chapel drowned on its mound. Silver-green, never brown; flat pewter light,
// drizzle-bright, mist in bands — the only zone allowed a grey sky. It is the
// gloomy one, it is never anyone's doorstep, and you chose it, because the pay
// is good. Levels 20-32.
//
// So the music shrugs. 4/4 at a slow 80 with the eighths swung — a towpath
// trudge, wet boots, somebody whistling anyway — in G dorian, the minor with a
// raised sixth (the E natural in the C7), which is the sound of a grin under a
// hood. A walking bass, brushes, the reed for the bargee's tune, piano in the
// treble for the drizzle (and for the drowned chapel's, which nobody has
// tuned since). The homesickness is the basin, eight bars in E-flat;
// the joke is the sluice, which is in the brightest key the piece can reach.
//
//   intro  drizzle on the piano and a barge horn far up the canal — skipped
//          on the loop
//   A      Towpath: the reed's swung tune over the walking bass and brushes,
//          the piano dripping on the off-beats; half-close on D7, the sus4
//          falling to the F#
//   A'     Towpath again: the tune climbs where A fell, a low horn answers
//          like a barge from the next lock, and it comes home to G minor
//   B      Barge Basin: E-flat major, no drums, the piano rippling like
//          water, the horn in long lines over the choir — the quiet one, and
//          the only one that is sad; it cadences deceptively onto Bb
//   C      Great Sluice: Bb major, the company's grand plan — the flute's
//          jaunty tune, the lute chopping the off-beats, a shaker
//   C'     the same with the horn in thirds and the reed doubling below, the
//          loudest bars; D7 at the end walks back down to the towpath
//
// Neighbours: the Granary Plains (a 3/4 harvest waltz in F) and the Reservoir.
// This is the only swung piece among them, and the only grey sky.

import type { Piece } from "./kit.ts";

/** The bargee's tune: the sus4 falling onto F# is the half-close. */
const TOWPATH = `
  d4:.5 f4:.5 g4 bf4:1.5 a4:.5 | g4:.5 f4:.5 e4:2 . | d4:.5 f4:.5 g4 bf4 c5 | d5:1.5 c5:.5 a4:2 |
  bf4:.5 c5:.5 d5 g5:1.5 f5:.5 | d5:.5 c5:.5 a4:2 f4 | g4 bf4:.5 a4:.5 g4 ef4 | g4:2 fs4:2 `;
/** The answer climbs where A fell and comes home. */
const TOWPATH_HOME = `
  d4:.5 f4:.5 g4 bf4:1.5 a4:.5 | g4:.5 a4:.5 bf4:2 c5 | d5:1.5 bf4:.5 g4 d5 | f5:1.5 e5:.5 d5:2 |
  g5:.5 f5:.5 ef5 d5 bf4 | c5:1.5 a4:.5 f4:2 | g4:.5 a4:.5 bf4 a4 fs4 | g4:3 . `;
/** The sluice tune; bar 8 is written per ending (F7 into C', D7 into A). */
const SLUICE = (end: string) => `
  f5:.5 d5:.5 bf4 c5:.5 d5:.5 f5 | e5:.5 f5:.5 c5:2 a4 | bf4:.5 c5:.5 d5 f5 g5 | e5:1.5 d5:.5 c5:2 |
  g5:.5 f5:.5 ef5 bf4 g4 | f4:.5 g4:.5 bf4:2 d5 | ef5:.5 d5:.5 c5 bf4 g4 | ${end} `;

/** drizzle: two drops a bar on the swung off-beats, high on the piano */
const DRIZZLE = { inst: "piano" as const, pat: ". . . 4 . . . 2", unit: 0.5, oct: 5, vel: 0.45 };
/** brushes on a kit: ghosted snare, a soft hat, the kick only on one */
const BRUSHES = { kick: "x.......", snare: "..o...o.", hat: "xoxoxoxo" };

export default {
  title: "The Pay Is Good",
  zones: ["canalworks"],
  note: "swung 4/4 in G dorian: a towpath trudge with a grin, piano for the drizzle; the Barge Basin in Eb is the one sad passage, the Great Sluice in Bb is the joke",
  song: {
    bpm: 80, swing: 0.22, space: 3.0,
    sections: [
      // 0 — intro: drizzle and a barge horn. Skipped on the loop.
      {
        name: "intro",
        chords: "Gm7 | D7sus4 D7",
        pad: { inst: "pad", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        arp: DRIZZLE,
        lead: { inst: "horn", vel: 0.6, n: "g3:3 . | a3:2 fs3:2" },
        counter: { inst: "glass", vel: 0.3, n: ".:2 d6:2 | .:4" },
      },
      // 1 — A, Towpath: the reed's tune, walking bass, brushes
      {
        name: "A Towpath",
        chords: "Gm7 | C7 | Gm7 | Dm7 | Ebmaj7 | Dm7 | Cm7 | D7sus4 D7",
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "walk", vel: 0.85 },
        arp: DRIZZLE,
        lead: { inst: "reed", vel: 1, n: TOWPATH },
        counter: { inst: "glass", vel: 0.28, n: ".:4 | .:4 | .:4 | .:2 e6:2 | .:4 | .:4 | .:4 | .:2 a5:2" },
        drums: { ...BRUSHES, vel: 0.45 },
      },
      // 2 — A', Towpath home: the barge horn from the next lock
      {
        name: "A' Towpath",
        chords: "Gm7 | C7 | Gm7 | Dm7 | Ebmaj7 | F | Cm7 D7 | Gm",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "walk", vel: 0.9 },
        arp: DRIZZLE,
        lead: { inst: "reed", vel: 1, n: TOWPATH_HOME },
        counter: { inst: "horn", vel: 0.6, n: ".:4 | .:2 c4:2 | .:4 | .:2 a3:2 | .:4 | .:2 c4:2 | .:4 | .:2 d4:.5 bf3:.5 g3" },
        drums: { ...BRUSHES, vel: 0.5, fill: { snare: "..o.o.xx", tom: "....2.1." } },
      },
      // 3 — B, Barge Basin: E-flat, no drums, the horn over choir and water
      {
        name: "B Barge Basin",
        chords: "Ebmaj7 | Dm7 | Cm7 | Bbmaj7 | Ebmaj7 | Dm7 | Cm7 | D7sus4 D7",
        pad: { inst: "choir", vel: 0.55 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "piano", pat: "0 1 2 3 4 3 2 1", unit: 0.5, oct: 4, vel: 0.4 },
        lead: { inst: "horn", vel: 0.85, n: `
          bf4:3 g4 | a4:2 f4:2 | g4:3 ef4 | d4:4 |
          bf4:3 c5 | d5:2 a4:2 | c5:1.5 bf4:.5 g4:2 | g4:2 fs4:2 ` },
        // the flute answers the horn's held bars, from across the water
        counter: { inst: "flute", vel: 0.4, n: ".:4 | .:4 | .:4 | .:1 f5 d5 bf4 | .:4 | .:4 | .:4 | .:1 c6 a5 fs5" },
      },
      // 4 — C, Great Sluice: Bb, the jaunty flute, the lute on the off-beats
      {
        name: "C Great Sluice",
        chords: "Bb | F/A | Gm7 | C7 | Ebmaj7 | Bb/D | Cm7 | F7",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "walk", vel: 0.95 },
        hits: { inst: "lute", pat: ".x", unit: 0.5, oct: 3, vel: 0.6 },
        lead: { inst: "flute", vel: 1, n: SLUICE("a4:2 c5:.5 ef5:.5 f5") },
        counter: { inst: "reed", vel: 0.55, n: "d4:2 f4:2 | c4:4 | d4:2 bf3:2 | e4:2 g4:2 | g4:2 bf4:2 | f4:4 | g4:2 ef4:2 | a3:2 c4:2" },
        drums: { kick: "x...x...", snare: "..x...x.", shaker: "xoxoxoxo", vel: 0.5 },
      },
      // 5 — C', the sluice with the horn in thirds; D7 walks back to the towpath
      {
        name: "C' Great Sluice",
        chords: "Bb | F/A | Gm7 | C7 | Ebmaj7 | Bb/D | Cm7 | D7",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "walk", vel: 1 },
        hits: { inst: "lute", pat: ".x", unit: 0.5, oct: 3, vel: 0.65 },
        lead: { inst: "flute", vel: 1, n: SLUICE("a4:2 c5:.5 a4:.5 fs4") },
        counter: { inst: "horn", vel: 0.75, n: "d5:2 bf4:2 | a4:2 f4:2 | g4:2 bf4:2 | bf4:2 g4:2 | g4:2 bf4:2 | bf4:2 f4:2 | g4:2 ef4:2 | fs4:2 a4:2" },
        parts: [{ inst: "reed", vel: 0.5, oct: -1, n: SLUICE("a4:2 c5:.5 a4:.5 fs4") }],
        drums: { kick: "x...x...", snare: "..x...x.", shaker: "xoxoxoxo", hat: "x.x.x.x.", vel: 0.55, fill: { snare: "..x.xxxx", tom: "........" } },
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
