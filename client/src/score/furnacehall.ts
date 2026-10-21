// ---------- The Furnace Hall — "The Fires Have Not Gone Out" ----------
// The works under the Glassworks, where the furnaces have not gone out in
// three hundred years: the Great Bottle Kiln with eight firemouths burning
// round its foot, the Furnace Row, rails and barrows and coal, stokers still
// stoking for a shift that never ended. West, the annealing rooms where glass
// cools slowly in the lehrs; the Old Flue Chapel, where the Cinder Abbot keeps
// his tallies at the ember grate; east, the Sand Store and the Pour Ledger.
// Then the Pane Hall, banks of racks counted by sentinels, and the Lantern
// Wall's amber lancets lit from behind by the Master's fire — the panes are
// crated for the capital, "phase four", never shipped.
//
// So a work song. 4/4 at 92 with the eighths swung hard (swing 0.28) — the
// lean of a shovel, the swing of a hammer, a beat you could stoke to — on
// taiko and kick, with a glass clink where an anvil would be. D phrygian
// dominant (D E-flat F# G A B-flat C), the desert's own mode, for the heat:
// the E-flat leaning onto D is the furnace breathing. Bright and hot first;
// the Glassworks is a rain-shadow desert, not a hell.
//
//   intro  the kiln: low strings on D, taiko like a heartbeat, a clink, the
//          timpani — skipped on the loop
//   A      the Stoking Floor: the reed's hook over the work beat, lute strums,
//          the bass shovelling quarters. Half-close at 8, home at 16.
//   B      the Annealing: G minor and half the weight, the glass cooling —
//          the flute's tune over pizzicato and strings, glass clinks, a soft
//          shaker; the horn answers in the second half
//   C      the Old Flue Chapel: the Cinder Abbot's arithmetic, a chant — the
//          choir in octaves on four notes, the drone, a slow taiko. The edge.
//   D      the Pane Hall: the Lantern Wall lit. The brass takes the hook over
//          the full work beat, the horn and choir and strings under it, the
//          lute strumming, timpani — the loudest place, back onto the floor
//
// The swing is the joke: three centuries of overtime, and it still grooves.

import type { Piece } from "./kit.ts";

const WORK_CHORDS = `
  D  | Eb/D | D | Gm/D | D  | Eb/D | Cm   | D |
  Gm | Eb   | D | D    | Gm | Eb   | Cm D | D `;
/** the hook: up to the F# and lean on the E-flat; half-close at 8, home at 16 */
const HOOK = `
  a4 d5:.5 ef5:.5 fs5:2  | g5:1.5 fs5:.5 ef5 d5   | fs5:.5 ef5:.5 d5 a4:2 | bf4:.5 c5:.5 d5 g4:2 |
  a4 d5:.5 ef5:.5 fs5:2  | g5:1.5 a5:.5 bf5 g5    | g5:1.5 f5:.5 ef5 c5   | d5:4                 |
  g4 bf4:.5 c5:.5 d5:2   | ef5:1.5 d5:.5 c5 bf4   | a4 fs4 a4 d5          | fs5:3 .:1            |
  g5:1.5 fs5:.5 g5 bf5   | bf5:1.5 a5:.5 g5 ef5   | ef5:.5 d5:.5 c5 fs5:.5 ef5:.5 d5 | d5:3 .:1 `;
/** the horn under the brass in D */
const HOOK_HORN = `
  fs4:4 | g4:4 | fs4:4 | g4:2 d4:2 | fs4:4 | g4:4 | ef4:2 g4:2 | fs4:4 |
  d4:4  | ef4:4 | fs4:2 a4:2 | a4:4 | bf4:4 | g4:4 | g4:2 a4:2 | fs4:4 `;

/** the work beat: kick and taiko on the swing of the shovel, a ghosted snare,
 *  the shaker on swung eighths */
const WORK = {
  kick: "x.......x.....x.",
  taiko: "3.......2.......",
  snare: "....o.......o...",
  shaker: "xoxoxoxo",
};
/** a clink on the off-beat of 4, every other bar: glass being worked. On D,
 *  the one pitch that sits over every chord here: an E would be out of the
 *  mode and grind on the E-flat bars the clinks land on. */
const CLINKS = (bars: number) => Array.from({ length: bars }, (_, i) => (i % 2 ? ".:3 .:.5 d6?:.5" : ".:4")).join(" | ");

export default {
  title: "The Fires Have Not Gone Out",
  zones: ["furnacehall"],
  note: "a swung work song in D phrygian dominant, the furnace leaning E-flat onto D. Listen for the reed's hook on the Stoking Floor coming back on brass at the Lantern Wall, the cool G-minor annealing, and the Cinder Abbot's chant in between",
  song: {
    bpm: 92, swing: 0.28, space: 2.4,
    sections: [
      // 0 — intro: the kiln breathing
      {
        name: "intro",
        chords: "D | Eb/D | D | Eb/D",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "swell", vel: 0.8 },
        parts: [
          { inst: "timpani", vel: 0.45, n: "d2:4 | .:4 | d2:4 | a1?:.25*16" },
          { inst: "glass", vel: 0.35, n: CLINKS(4) },
        ],
        drums: { taiko: "3...........2...", vel: 0.45 },
      },
      // 1 — A, the Stoking Floor: the reed's hook over the work beat
      {
        name: "A Stoking Floor",
        chords: WORK_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "pedal", vel: 0.7 },
        lead: { inst: "reed", vel: 1.5, n: HOOK },
        hits: { inst: "lute", pat: "X..x..x.", unit: 0.5, oct: 3, vel: 0.7 },
        parts: [{ inst: "glass", vel: 0.32, n: CLINKS(16) }],
        drums: { ...WORK, vel: 0.65, fill: { tom: "........1.2.3.3.", every: 8 } },
      },
      // 2 — B, the Annealing: G minor, the glass cooling slowly
      {
        name: "B Annealing",
        chords: `
          Gm | Gm/F | Eb | D    | Gm | Cm    | Am7b5 | D |
          Gm | Gm/F | Eb | Bb/D | Cm | Gm/Bb | Am7b5 | D `,
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "root", vel: 0.65 },
        lead: { inst: "flute", vel: 1.0, n: `
          d5:3 g5      | bf5:2 a5 g5 | g5:3 ef5     | fs5:4    |
          d5:2 g5 a5   | c6:2 bf5 g5 | a5:2 ef5 c5  | d5:4     |
          bf4 d5 g5 bf5 | a5:2 g5 f5 | g5:3 bf5     | f5:2 d5:2 |
          ef5:2 g5 c6  | bf5:2 a5 g5 | g5 ef5 c5 a4 | a4:4     ` },
        counter: { inst: "horn", vel: 0.6, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |
          d4:4 | d4:4 | ef4:4 | d4:4 | ef4:4 | d4:4 | c4:4 | fs4:4 ` },
        arp: { inst: "pizz", pat: "0 . 2 . 1 . 2 .", unit: 0.5, oct: 3, vel: 1.0 },
        parts: [{ inst: "glass", vel: 0.3, n: CLINKS(16) }],
        drums: { shaker: "xoxoxoxo", kick: "x...............", vel: 0.4 },
      },
      // 3 — C, the Old Flue Chapel: the Abbot's arithmetic, chanted
      {
        name: "C Flue Chapel",
        chords: "D5 | D5 | D | D | D5 | D | Eb/D | D",
        pad: { inst: "strings", vel: 0.45, oct: 2 }, bass: { pat: "swell", vel: 0.8 },
        lead: { inst: "choir", vel: 2.1, n: `
          d4:2 d4 ef4  | d4:2 c4 d4   | fs4:2 fs4 g4 | fs4:2 ef4 d4 |
          a4:2 a4 bf4  | a4:2 g4 fs4  | g4 fs4 ef4 fs4 | d4:4 ` },
        counter: { inst: "choir", oct: -1, vel: 1.4, n: `
          d4:2 d4 ef4  | d4:2 c4 d4   | fs4:2 fs4 g4 | fs4:2 ef4 d4 |
          a4:2 a4 bf4  | a4:2 g4 fs4  | g4 fs4 ef4 fs4 | d4:4 ` },
        parts: [
          { inst: "bell", vel: 0.3, n: "d5:4 | .:4 | .:4 | .:4 | a4:4 | .:4 | .:4 | d5:4" },
          { inst: "timpani", vel: 0.4, n: ".:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | d2?:.25*16" },
        ],
        drums: { taiko: "3...............", vel: 0.4 },
      },
      // 4 — D, the Pane Hall: the Lantern Wall lit, the hook on brass
      {
        name: "D Pane Hall",
        chords: WORK_CHORDS,
        pad: { inst: "choir", vel: 1.0 }, bass: { pat: "pedal", vel: 0.8 },
        lead: { inst: "brass", vel: 1.25, n: HOOK },
        counter: { inst: "horn", vel: 1.1, n: HOOK_HORN },
        hits: { inst: "lute", pat: "X.xx.xx.", unit: 0.5, oct: 3, vel: 0.6 },
        parts: [
          { inst: "strings", vel: 2.2, n: `
            a4:4 | bf4:4 | a4:4 | bf4:4 | a4:4 | bf4:4 | c5:2 g4:2 | a4:4 |
            bf4:4 | g4:4 | a4:4 | fs4:4 | bf4:4 | bf4:4 | c5:2 a4:2 | a4:4 ` },
          { inst: "timpani", vel: 0.42, n: "d2!:4 | .:4 | d2:4 | .:4 | d2!:4 | .:4 | c2:4 | d2:4 | g1!:4 | ef2:4 | d2:4 | d2:2 d2:2 | g1:4 | ef2:4 | c2:2 d2:2 | a1?:.25*16" },
          { inst: "glass", vel: 0.3, n: CLINKS(16) },
        ],
        drums: { ...WORK, taiko: "2.......2.......", snare: "....x.......x...", crash: "X..............." + " | ................".repeat(7), vel: 0.7, fill: { tom: "........1.2.3.3.", every: 8 } },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
