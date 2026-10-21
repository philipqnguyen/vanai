// ---------- The Timber Estates — "Planted in Ranks" ----------
// Heartwood's doorstep and its old wound: an imperial plantation, a forest in
// ranks, planted giants on a 20 m grid running in perfect perspective rows up
// and over the ground, the log flume ruled across them on its trestles, the
// overseer's lodge watching from its terrace, and the borders the straightest
// in the interior. Even, shadowless light. It was planted over the groves of
// the people Heartwood is made of, and they remember exactly where everything
// was; the guild that sings the banned songs wants its songbook back.
//
// So the piece is two things laid over each other, the way the estate is:
// the survey and the grove. The survey is an ostinato that never varies — a
// spiccato row in straight eighths, the same figure every bar, the same
// work rhythm under it (kick on 1 and 3, a felling tom on 4, a saw in the
// shaker) — and the grove is the tune, a Heartwood folk air on the reed in
// A dorian, whose raised sixth (the F#, the D-major bar) is the grin in it.
// Every four-bar phrase opens on the same two bars of dotted-quarter stride,
// so even the folk song walks in ranks here. 4/4 at 116: a working pace, not a march (Caerdun
// marches; this place works).
//
//   intro  the rows appear: the ostinato alone, the tune's first bar on the
//          reed as a motto, the felling toms — skipped on the loop
//   A      the Ranks: the reed air over the ostinato and the work rhythm, the
//          horn calling back only where the tune holds (bars 8 and 16)
//   B      the Flume: up to C, the ostinato stops and the water runs — harp
//          sixteenths down the trestles, a long-breathed flute tune, the reed
//          underneath it. The one section that flows instead of counting.
//   C      the Songbook: the ranks fall silent and the choir sings the air at
//          half speed over a drone — the confiscated song, heard in the grove
//          it was written for, for the first time in three hundred years.
//          That is the homesickness, and it is not the empire's.
//   A''    Restitution: the air back in the ranks with the songbook in them —
//          choir under the ostinato, the flute doubling the reed, the horn in
//          contrary motion, the full work rhythm
//
// The ostinato is the estate and the reed is the grove; the choir is the one
// thing the survey did not plant.

import { onFirst, type Piece } from "./kit.ts";

/** A dorian, half-close on D (the raised sixth) at bar 8, home on bar 16.
 *  Each phrase opens with two bars on a dotted quarter: the folk air, ruled.
 *  A and A'' play it. */
const RANKS_CHORDS = `
  Am | G | Am | D | C | G   | Am Em  | D  |
  Am | G | Am | D | C | G/B | Em7 D  | Am `;
const AIR = `
  a4:1.5 b4:.5 c5 e5 | d5:1.5 c5:.5 b4 g4 | a4 c5 e5:1.5 d5:.5 | fs5:2 d5:2       |
  e5:1.5 d5:.5 c5 e5 | d5:1.5 b4:.5 g4 b4 | c5 b4 a4 e4        | fs4:3 .          |
  a4:1.5 b4:.5 c5 e5 | d5:1.5 c5:.5 b4 g4 | a4 c5 e5 a5        | fs5:1.5 g5:.5 a5 fs5 |
  e5:1.5 d5:.5 c5 e5 | d5:1.5 b4:.5 g4 b4 | e5 d5 c5 b4        | a4:3 . `;
/** the survey: one row, every bar, root-heavy like a chain ticking off */
const ROW = "0 0 2 0 1 0 2 0";
/** kick on 1 and 3, the felling tom on 4, the saw in the shaker */
const WORK = {
  kick: "x.......x.......",
  tom: "............2...",
  shaker: "x.xox.xox.xox.xo",
};

export default {
  title: "Planted in Ranks",
  zones: ["timberestates"],
  note: "A dorian at 116: a spiccato row that never changes (the survey) under a reed folk air (the grove); the Flume runs in C, and the choir sings the air at half speed in the Songbook",
  song: {
    bpm: 116, space: 2.2,
    sections: [
      // 0 — intro: the rows appear, the motto, the felling
      {
        name: "intro",
        chords: "Am | G | Am | D",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "spiccato", pat: ROW, unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "reed", vel: 0.8, n: ".:4 | .:4 | a4:1.5 b4:.5 c5 e5 | fs5:3 ." },
        drums: { kick: "x.......x.......", vel: 0.4, fill: { tom: "........3.3.2211", kick: "x..............." } },
      },
      // 1 — A, the Ranks
      {
        name: "A Ranks",
        chords: RANKS_CHORDS,
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "oct", vel: 0.9 },
        arp: { inst: "spiccato", pat: ROW, unit: 0.5, oct: 3, vel: 0.85 },
        lead: { inst: "reed", vel: 1.05, n: AIR },
        // the horn only calls back where the air holds its note
        counter: { inst: "horn", vel: 0.75, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:1 a3 d4 fs4 |
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:1 e4 c4 a3 ` },
        drums: { ...WORK, vel: 0.5 },
      },
      // 2 — B, the Flume: C major, the water runs
      {
        name: "B Flume",
        chords: `
          C | G/B | Am | Em | F | C/E | Dm7 | G |
          C | G/B | Am | Em | F | G   | Am  | D `,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "root", vel: 0.85 },
        arp: { inst: "harp", pat: "0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1", unit: 0.25, oct: 4, vel: 0.6 },
        lead: { inst: "flute", vel: 1, n: `
          g5:3 e5    | d5:2 b4:2 | c5 e5 a5:2  | g5:4      |
          a5:3 g5    | e5:2 c5 e5 | f5 e5 d5 c5 | d5:4      |
          g5:3 e5    | d5:2 g5:2 | a5 b5 c6:2  | b5:2 g5:2 |
          a5:2 c6 a5 | g5:2 d5:2 | e5:2 a5:2   | fs5:4 ` },
        // the reed goes under it, holding where the flute moves
        counter: { inst: "reed", vel: 0.5, n: `
          e4:4 | d4:4 | c4:2 e4:2 | b3:4 | c4:4 | c4:2 g4:2 | a4:2 f4:2 | g4:2 f4:2 |
          e4:4 | d4:2 b3:2 | e4:2 a4:2 | b3:2 e4:2 | c4:2 f4:2 | d4:2 b3:2 | c4:2 e4:2 | fs4:2 a4:2 ` },
        drums: { kick: "x.......x.......", shaker: "x.xxx.xxx.xxx.xx", vel: 0.42 },
      },
      // 3 — C, the Songbook: the air at half speed, the ranks silent
      {
        name: "C Songbook",
        chords: `
          Am | Am | G | G | Am | Am | D | D     |
          C  | C  | G | G | Am G | Am/E Em | D | Dsus2 `,
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "swell", vel: 0.8 },
        arp: { inst: "harp", pat: "0 . . 2 . . 1 .", unit: 0.5, oct: 3, vel: 0.65 },
        lead: { inst: "choir", vel: 1, n: `
          a4:3 b4   | c5:2 e5:2 | d5:3 c5   | b4:2 g4:2 | a4:2 c5:2 | e5:3 d5   | fs5:4 | d5:4 |
          e5:3 d5   | c5:2 e5:2 | d5:3 b4   | g4:2 b4:2 | c5:2 b4:2 | a4:2 e4:2 | fs4:4 | e4:4 ` },
        // the horn joins the second verse, under it and against it
        counter: { inst: "horn", vel: 0.6, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |
          g3:4 | g3:2 c4:2 | b3:4 | d4:4 | e4:2 d4:2 | c4:2 b3:2 | a3:4 | a3:4 ` },
        parts: [{ inst: "glass", vel: 0.3, n: `
          a5:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |
          e5:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 ` }],
      },
      // 4 — A'', Restitution: the air in the ranks with the songbook in them
      {
        name: "A'' Restitution",
        chords: RANKS_CHORDS,
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "oct", vel: 0.95 },
        arp: { inst: "spiccato", pat: ROW, unit: 0.5, oct: 3, vel: 0.8 },
        hits: { inst: "lute", pat: "X.x.x.x.", unit: 0.5, oct: 3, vel: 0.45 },
        lead: { inst: "reed", vel: 1, n: AIR },
        counter: { inst: "horn", vel: 0.75, n: `
          c4:2 e4:2 | d4:2 b3:2 | c4:2 a3:2 | a3:2 d4:2 | e4:2 g4:2 | g4:2 d4:2 | e4:2 g4:2 | fs4:2 a4:2 |
          e4:4      | d4:4      | c4:2 e4:2 | d4:2 a3:2 | g3:2 c4:2 | b3:2 d4:2 | g4:2 fs4:2 | e4:4 ` },
        parts: [
          { inst: "flute", vel: 0.45, n: AIR },
          { inst: "timpani", vel: 0.5, n: "a1:4 | .:4 | .:4 | d2:4 | c2:4 | .:4 | .:4 | d2:2 d2:2 | a1:4 | .:4 | .:4 | d2:4 | c2:4 | .:4 | e2:2 d2:2 | a1:4" },
        ],
        drums: { ...WORK, snare: "....x.......x...", crash: onFirst("X...............", 16), vel: 0.55 },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
