// ---------- The Burned Land — "Letters to the Gate" ----------
// The fire that faced outward: pale ash country under a warm haze, like the
// hour after a bonfire, every glassed trunk bent away from the centre, and at
// the centre, untouched, the capital's walls on their mound with the gold crown
// over them — always the brightest thing in frame. Emmer's farmhouse stands at
// the edge with the ash orchard he kept and wrote about: he missed the night,
// spent a long life knocking, and his letters are the zone's heart ("the ash
// orchard fruited this spring… somebody should be tending this side of the
// door too"). Levels 32-45, the one place in the game the dread is allowed
// in — and even here it is the unknown at the edge, never a monster.
//
// So: C minor, the first minor-key home theme a player has heard, 4/4 at a
// slow 72 — a walking air for long ash roads, not a dirge. The tune is the
// flute's, low and breathy, the way a letter sounds read aloud; a choir bed
// stands in for the haze, glass glints for the trunks that turned to glass,
// and a timpani heartbeat so far off it is mostly felt. The dread is one
// passage, B, on a Phrygian D-flat over the C pedal that no other zone theme
// uses (only this zone's own fight, the Capital battle, shares it) — and it
// does not get cashed in: it climbs straight into C major and the capital's
// own theme (score/capital.ts, there a 3/4 sarabande, here broadened to 4/4)
// heard from the walls on a horn, the Regent speaking over the ash.
//
//   intro  glass over a choir drone, a far horn rising to the theme's first
//          notes, a timpani roll — skipped on the loop
//   A      Ash Roads: the air on flute over harp and choir; half-close on bar 8,
//          the answer climbs to the A-flat and comes home on bar 16, a horn
//          under it in long tones
//   B      the Fire Line: a low spiccato ostinato with the D-flat grinding on
//          the C pedal, the theme slowed on horn, taiko and a timpani that rolls
//          into the next downbeat — the darkest and most driven section
//   C      the Walls: C major, the bright relief — the capital's theme on horn,
//          bells, strings under it, the timpani turning ceremonial; level with
//          B, but the brightest bars in the zone
//   A'     Letters: the answer phrase again, flute at pitch and horn an octave
//          down, the reed in long tones underneath (Emmer, "it wasn't your
//          fault either")
//   D      the Ash Orchard: E-flat major, the warm turn — a lute picking, the
//          reed singing the air in the major, a bird in the flute; bVI-bVII
//          back onto A's downbeat, the quietest bars before the loop
//
// Flute is the ash, horn is the walls, reed is Emmer; only C gives the horn
// the capital's tune.

import type { Piece } from "./kit.ts";

/** The air: four bars that half-close on the G, four that come home. A and
 *  the first half of A' share the answer. */
const AIR_CHORDS = "Cm | Cm/Bb | Ab | Eb/G | Fm | Cm/Eb | Dm7b5 | Gsus4 G";
const AIR = `
  g4:2 c5:1.5 d5:.5 | ef5:2 d5 c5     | c5:1.5 bf4:.5 af4 c5 | bf4:4 |
  af4:2 c5:1.5 bf4:.5 | g4:2 ef4 g4   | f4:1.5 af4:.5 c5 af4 | c5:2 b4:2 `;
const ANSWER_CHORDS = "Cm | Cm/Bb | Ab | Eb | Fm | Ab | Gsus4 G | Cm";
const ANSWER = `
  g4:2 c5:1.5 d5:.5 | ef5:2 f5 g5     | af5:1.5 g5:.5 f5 ef5 | g5:3 ef5 |
  f5:1.5 ef5:.5 d5 c5 | ef5:2 c5 af4  | c5:2 d5 b4           | c5:4 `;

/** far off and mostly felt: a soft double beat on the downbeat every other bar */
const HEARTBEAT = "c2?:.5 c2?:3.5 | .:4";

export default {
  title: "Letters to the Gate",
  zones: ["burnedland"],
  note: "C minor, 4/4 at 72: the flute air is the ash, the Phrygian D-flat in B is the only dread in the score, and it climbs into the capital's own theme in C major (C) — the Regent from the walls; the orchard (D) is Emmer's",
  song: {
    bpm: 72, space: 3.2,
    sections: [
      // 0 — intro: glass over the haze, a far horn, a roll. Skipped on the loop.
      {
        name: "intro",
        chords: "Cm | Cm/Bb | Cm | Gsus4 G",
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.45, n: ".:4 | g3:2 c4:2 | ef4:2 f4 ef4 | d4:4" },
        counter: { inst: "glass", vel: 0.35, n: "c6:4 | .:4 | g5:4 | .:4" },
        parts: [{ inst: "timpani", vel: 0.4, n: "c2?:4 | .:4 | .:4 | g1?:.25*12 g1:1" }],
      },
      // 1 — A, Ash Roads: the air on flute, the horn under the answer
      {
        name: "A Ash Roads",
        chords: `${AIR_CHORDS} | ${ANSWER_CHORDS}`,
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "root", vel: 0.8 },
        arp: { inst: "harp", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "flute", n: `${AIR} | ${ANSWER}` },
        counter: { inst: "horn", vel: 0.55, n: `
          .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |
          ef4:4 | bf3:4 | c4:4 | bf3:4 | c4:4 | ef4:4 | d4:4 | ef4:4 ` },
        parts: [
          { inst: "glass", vel: 0.3, n: "c6:4 | .:4 | .:4 | .:4 | af5:4 | .:4 | .:4 | .:4 | g5:4 | .:4 | .:4 | .:4 | c6:4 | .:4 | .:4 | .:4" },
          { inst: "timpani", vel: 0.4, n: [HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT].join(" | ") },
        ],
      },
      // 2 — B, the Fire Line: the D-flat on the C pedal, the air slowed on horn
      {
        name: "B Fire Line",
        chords: "Cm | Db/C | Cm | Db/C | Ab | Db | Fm | Gsus4 G",
        pad: { inst: "strings", vel: 0.9 }, bass: { pat: "pedal", vel: 0.9 },
        lead: { inst: "horn", vel: 1.15, n: `
          g4:2 c5:2 | df5:3 c5 | c5:2 bf4 g4 | af4:4 |
          af4:2 c5:2 | df5:2 f5:2 | c5:2 af4 f4 | c5:2 b4:2 ` },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.95, n: `
            c3! g3 c4 g3 ef4 g3 c4 g3 | c3! af3 df4 af3 f4 af3 df4 af3 |
            c3! g3 c4 g3 ef4 g3 c4 g3 | c3! af3 df4 af3 f4 af3 df4 af3 |
            af2! ef3 af3 ef3 c4 ef3 af3 ef3 | df3! af3 df4 af3 f4 af3 df4 af3 |
            f2! c3 f3 c3 af3 c3 f3 c3 | g2! d3 g3 d3 b3 d3 g3 d3 ` },
          { inst: "timpani", vel: 0.6, n: "c2:2 c2:2 | c2:4 | c2:2 c2:2 | c2:4 | af1:4 | df2:4 | f1:2 f1:2 | g1?:.25*12 g1:.25*4" },
        ],
        drums: { taiko: "3.......2....... | 3.......2...2.2.", vel: 0.5, fill: { tom: "........1.2.3333", taiko: "3..............." } },
      },
      // 3 — C, the Walls: the capital's theme in C major, from the walls
      {
        name: "C The Walls",
        chords: "C | G/B | Am | Em | F | C/E | Dm7 G7 | Gsus4 G7",
        pad: { inst: "strings", vel: 1.0 }, bass: { pat: "oct", vel: 0.95 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1 2 1", unit: 0.5, oct: 4, vel: 0.65 },
        lead: { inst: "horn", vel: 1.25, n: `
          g4 c5:3 | b4 d5:3 | e5:1.5 d5:.5 c5:2 | b4:3 g4 |
          a4 f5:3 | e5 c5:3 | d5:1.5 c5:.5 b4:2 | d5:4 ` },
        counter: { inst: "strings", vel: 2.4, n: "c4:4 | d4:4 | e4:4 | e4:4 | f4:4 | e4:4 | f4:4 | d4:2 f4:2" },
        parts: [
          // the flute an octave over the horn: the crown catching the light
          { inst: "flute", oct: 1, vel: 0.5, n: `
            g4 c5:3 | b4 d5:3 | e5:1.5 d5:.5 c5:2 | b4:3 g4 |
            a4 f5:3 | e5 c5:3 | d5:1.5 c5:.5 b4:2 | d5:4 ` },
          { inst: "bell", vel: 0.4, n: "c6:4 | .:4 | .:4 | .:4 | c6:4 | .:4 | .:4 | .:4" },
          { inst: "timpani", vel: 0.6, n: "c2!:4 | g1:4 | a1:4 | e2:4 | f1:4 | c2:4 | d2:4 | g1:2 g1:.5*4" },
        ],
      },
      // 4 — A', Letters: the answer on flute and horn in octaves, the reed beneath
      {
        name: "A' Letters",
        chords: ANSWER_CHORDS,
        pad: { inst: "choir", vel: 0.8 }, bass: { pat: "oct", vel: 0.85 },
        arp: { inst: "harp", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 3, vel: 0.6 },
        lead: { inst: "flute", n: ANSWER },
        // bar 4 drops to the B-flat, not the D: the flute and horn land on E-flat
        // there, and a D under them is a minor ninth against the tune
        counter: { inst: "reed", vel: 0.7, n: "g4:4 | g4:2 ef4:2 | ef4:4 | ef4:2 bf3:2 | c4:4 | ef4:4 | d4:4 | ef4:4" },
        parts: [
          { inst: "horn", oct: -1, vel: 0.85, n: ANSWER },
          { inst: "timpani", vel: 0.4, n: [HEARTBEAT, HEARTBEAT, HEARTBEAT, HEARTBEAT].join(" | ") },
        ],
      },
      // 5 — D, the Ash Orchard: the air in the major, Emmer's trees
      {
        name: "D Ash Orchard",
        chords: "Eb | Cm | Ab | Bb | Ab | Eb/G | Fm7 | Ab Bb",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.65 },
        arp: { inst: "lute", pat: "0 2 1 2 3 2 1 2", unit: 0.5, oct: 3, vel: 0.75 },
        // at pitch, where the flute sang the air in A: an octave down it sat on
        // top of the lute and the string bed and the tune went to mud
        lead: { inst: "reed", vel: 0.8, n: `
          bf4:2 ef5:1.5 f5:.5 | g5:2 f5 ef5     | ef5:1.5 d5:.5 c5 ef5 | d5:3 bf4 |
          c5 ef5 af5:1.5 g5:.5 | g5:2 bf4 ef5   | f5:1.5 g5:.5 af5 f5  | ef5:2 d5:2 ` },
        // a bird in the fruit trees, answering only where the reed holds
        counter: { inst: "flute", vel: 0.45, n: `
          .:4 | .:4 | .:4 | .:1 f5?:.5 g5?:.5 bf5:2 |
          .:4 | .:4 | .:4 | .:2 g5?:.5 af5?:.5 bf5:1 ` },
        parts: [{ inst: "glass", vel: 0.25, n: "g5:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
