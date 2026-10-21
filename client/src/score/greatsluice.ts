// ---------- The Great Sluice — "Water for the Last Barge" ----------
// The empire's sluice house on the Canal Works fen: a vaulted wheel hall with
// the great wheel still turning in its race, water running under the bridges
// into the culverts, twin beam engines rocking in the Pump Hall, and the
// Sluice Master keeping the Works Ledger in front of a gate that sprays at its
// seams. Three hundred years of pumping for a barge that has not come in. The
// bargemen who waited for it are still on the bridge, drowned and patient,
// and a deep choir sings at the wheel. The fen is the game's one gloomy
// province; the sluice under it is gloomy the way a lock-keeper is — faithful,
// wet, and keeping very good time.
//
// So the wheel is the clock. 4/4 at a heavy-footed 92, and under almost every
// bar the paddles turn in triplets (an arp on the third of a beat), so the
// piece rolls rather than marches. D dorian, the bargemen's mode: minor, with
// the raised sixth (the G-major bar, bar 2 of the tune) that keeps a work song
// from sinking. The tune is a hauling song for a barge rope: a pickup, a heave
// on the downbeat, a half-close on A at bar 8 and home on bar 16.
//
//   intro  the beam engine starts (timpani d-a, a seesaw), the wheel comes in
//          a paddle at a time, a low horn gives the song's head — skipped on
//          the loop
//   A      the Intake: the hauling song on the reed over the pizzicato wheel,
//          the engine's thud on 1 and its knock on 3. Lean on purpose.
//   B      the Wheel Hall: up into F, the vault opens and the daylight comes
//          through the thermal window — the deep choir, the harp takes the
//          wheel, the horn sings a broad line of its own and the flute floats
//          over it. The widest-sounding section.
//   C      the Pump Hall: back to D minor and into the machinery. Spiccato
//          chugs in triplets, the horn rocks the beam (d down to a, every
//          half bar), timpani and kick on the strokes, the reed turns the
//          song's head into a working line. The busiest section.
//   A'     the song with everyone on the rope: the flute has the tune, the
//          reed a harmony under it, the horn holds the floor, harp and
//          pizzicato both turning, a triplet shaker in the engine's groove
//   D      the Sump: the quiet edge. The wheel heard through a wall, glass
//          drips, the choir alone, the song's head low in the reed — and an
//          E-flat chord, the one shadow in the piece, before A resolves it.
//
// The dread is one chord wide (D's E-flat); the rest is the sound of a
// machine that never stopped believing the barge was coming.

import type { Piece } from "./kit.ts";

/** The hauling song: a heave on each downbeat, half-close on A (bar 8), the
 *  answer climbing to the high C before it comes home on D. */
const SONG_CHORDS = `
  Dm | G/D | Dm | C    | Bb | F/A | Gm7   | A7sus4 A7 |
  Dm | G/D | Dm | Am   | Bb | C   | Gm6 A7 | Dm       `;
const SONG = `
  a4 d5:.5 e5:.5 f5 e5 | d5:2 b4 g4    | a4 d5:.5 e5:.5 f5 a5 | g5:3 e5       |
  f5:1.5 e5:.5 d5 bf4  | c5:2 a4 f4    | g4 bf4 d5 c5         | a4:4          |
  a4 d5:.5 e5:.5 f5 e5 | d5:2 b4 g4    | a4 d5 f5 a5          | c6:2 b5:.5 a5:.5 g5 |
  bf5:1.5 a5:.5 g5 f5  | e5:2 g5:2     | f5 e5 d5 cs5         | d5:4          `;
/** A' only: the reed's harmony under the flute, holding where the tune moves.
 *  It stays below the tune throughout: the reed is the darker voice, and where
 *  it crossed above the flute the hauling song lost its top line. */
const SONG_HARMONY = `
  f4:2 a4:2 | b4:2 g4 d4 | f4:2 a4 d5 | e5:2 c5:2 |
  d5:2 f4:2  | a4:2 f4 c4 | d4:2 g4 a4 | d4:2 e4:2  |
  f4:2 a4:2 | b4:2 g4 d4 | f4:2 a4 d5 | e5:2 c5:2 |
  d5:2 f5:2 | c5:2 e5:2 | bf4:2 a4 g4 | f4:4 `;
/** the horn holding the floor under A' */
const SONG_FLOOR = `
  d4:4 | d4:4 | d4:2 f4:2 | e4:4 | d4:4 | c4:4 | bf3:2 d4:2 | e4:2 cs4:2 |
  d4:4 | d4:4 | f4:4      | e4:4 | f4:4 | e4:4 | d4:2 cs4:2 | d4:4 `;

/** The wheel: one paddle per third of a beat, up the chord and round again. */
const WHEEL = "0 1 2 0 1 2 0 1 2 0 1 2";
const THIRD = 1 / 3;

export default {
  title: "Water for the Last Barge",
  zones: ["greatsluice"],
  note: "the wheel turns in triplets under nearly every bar; listen for the bargemen's hauling song (reed in A, flute in A'), the choir and the horn's own line in the Wheel Hall, the beam engine rocking in the Pump Hall, and the one E-flat chord in the Sump",
  song: {
    bpm: 92, space: 3.2,
    sections: [
      // 0 — intro: the engine, then the wheel, then the song's head. The
      // G-major colour sits in bar 2, under the rest: the head's F would rub
      // against its B-natural, so the head enters over D minor, where it lives.
      {
        name: "intro",
        chords: "Dm | G/D | Dm | Asus4 A",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "swell", vel: 0.75 },
        arp: { inst: "pizz", pat: ". . . . . . 0 1 2 0 1 2", unit: THIRD, oct: 3, vel: 1.1 },
        lead: { inst: "horn", vel: 0.8, n: ".:4 | .:4 | a3 d4:.5 e4:.5 f4 e4 | d4:2 cs4:2" },
        counter: { inst: "glass", vel: 0.3, n: "d6:4 | .:4 | .:4 | a5:4" },
        parts: [{ inst: "timpani", vel: 0.5, n: "d2:2 a1:2 | d2:2 a1:2 | d2:2 a1:2 | a1:.25*12 a1:1" }],
      },
      // 1 — A, the Intake: the song on the reed, the wheel in pizzicato
      {
        name: "A Intake",
        chords: SONG_CHORDS,
        pad: { inst: "strings", vel: 0.42 }, bass: { pat: "root", vel: 0.72 },
        arp: { inst: "pizz", pat: WHEEL, unit: THIRD, oct: 3, vel: 0.95 },
        lead: { inst: "reed", vel: 0.85, n: SONG },
        // a drip into the race wherever the song holds its breath
        counter: { inst: "glass", vel: 0.28, n: ".:4 | .:4 | .:4 | .:3 a5 | .:4 | .:4 | .:4 | .:2 e6:2 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:2 a5:2" },
        drums: { kick: "x...............", tom: "........2.......", vel: 0.42 },
      },
      // 2 — B, the Wheel Hall: F major, the choir, the horn's broad line
      {
        name: "B Wheel Hall",
        chords: `
          F  | C/E | Dm7 | Am | Bb | F/A    | Gm7     | Csus4 C |
          Bb | C   | Am7 | Dm | Gm7 | Bb/C C | Bbmaj7 | A       `,
        pad: { inst: "choir", vel: 0.9 }, bass: { pat: "oct", vel: 0.9 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1 0 1 2 3 2 1", unit: THIRD, oct: 4, vel: 0.72 },
        lead: { inst: "horn", vel: 1.1, n: `
          c5:3 a4      | g4:2 e4:2 | f4:1.5 g4:.5 a4 c5 | e5:4 |
          d5:3 c5      | c5:2 a4:2 | bf4:1.5 a4:.5 g4 f4 | g4:4 |
          f5:3 d5      | e5:2 g5:2 | e5:1.5 d5:.5 c5 e5 | d5:2 a4:2 |
          bf4:2 d5 f5  | d5:2 e5:2 | d5:2 a4:2          | cs5:4 ` },
        counter: { inst: "flute", vel: 0.58, n: `
          a5:4 | g5:4 | f5:2 a5:2 | e5:2 c6:2 | bf5:4 | a5:4 | g5:2 bf5:2 | c6:2 bf5 g5 |
          d6:4 | c6:4 | c6:2 e5:2 | f5:2 a5:2 | bf5:2 d6:2 | f5:2 g5:2 | f5:2 d5:2 | e5:4 ` },
        parts: [{ inst: "timpani", vel: 0.45, n: `
          f2:4 | .:4 | .:4 | .:4 | bf1:4 | .:4 | .:4 | c2:2 c2:2 |
          bf1:4 | .:4 | .:4 | d2:4 | .:4 | c2:2 c2:2 | .:4 | a1:.25*8 a1:2 ` }],
      },
      // 3 — C, the Pump Hall: the beam engines; the song's head as a working line
      {
        name: "C Pump Hall",
        chords: "Dm | Dm | Bb | C | Dm | Dm | Gm6 | A7",
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "root", vel: 0.95 },
        arp: { inst: "spiccato", pat: "0 0 2 0 0 2 0 0 3 0 0 2", unit: THIRD, oct: 3, vel: 0.95 },
        lead: { inst: "reed", vel: 0.9, n: `
          d5:2 a4 d5 | f5:1.5 e5:.5 d5 a4 | bf4:2 d5 f5 | g5:1.5 f5:.5 e5 c5 |
          d5:2 a4 d5 | f5:1.5 g5:.5 a5 f5 | g5 f5 e5 d5 | cs5:2 e5 a5 ` },
        // the beam: down on 1, up on 3
        counter: { inst: "horn", vel: 0.8, n: "d4:2 a3:2 | d4:2 a3:2 | d4:2 f3:2 | e4:2 g3:2 | d4:2 a3:2 | d4:2 a3:2 | d4:2 bf3:2 | cs4:2 a3:2" },
        parts: [{ inst: "timpani", vel: 0.5, n: "d2:2 a1:2 | d2:2 a1:2 | bf1:2 f2:2 | c2:2 g1:2 | d2:2 a1:2 | d2:2 a1:2 | g1:2 d2:2 | a1:.25*8 a1:2" }],
        drums: { kick: "x.....x.....", tom: "...2.....3..", shaker: "x.xx.xx.xx.x", vel: 0.55, fill: { tom: "1..2..2..3.3", kick: "x..........." } },
      },
      // 4 — A', everyone on the rope
      {
        name: "A' All Hands",
        chords: SONG_CHORDS,
        pad: { inst: "strings", vel: 0.85 }, bass: { pat: "oct", vel: 0.95 },
        arp: { inst: "harp", pat: WHEEL, unit: THIRD, oct: 4, vel: 0.6 },
        hits: { inst: "pizz", pat: "x.o.", unit: 1, oct: 3, vel: 0.9 },
        lead: { inst: "flute", vel: 1.05, n: SONG },
        counter: { inst: "reed", vel: 0.65, n: SONG_HARMONY },
        parts: [
          { inst: "horn", vel: 0.6, n: SONG_FLOOR },
          { inst: "timpani", vel: 0.4, n: "d2:4 | .:4 | .:4 | .:4 | bf1:4 | .:4 | .:4 | a1:2 a1:2 | d2:4 | .:4 | .:4 | .:4 | bf1:4 | c2:4 | g1:2 a1:2 | d2:4" },
        ],
        drums: { kick: "x.....x.....", tom: "........2...", shaker: "x.xx.xx.xx.x", vel: 0.5 },
      },
      // 5 — D, the Sump: the wheel through a wall, the choir, the one shadow
      {
        name: "D Sump",
        chords: "Gm | Dm | Bb | A | Gm | Dm/F | Ebmaj7 | Asus4 A",
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "harp", pat: "0 . . 2 . . 1 . . . . .", unit: THIRD, oct: 3, vel: 0.5 },
        lead: { inst: "reed", vel: 0.7, n: ".:2 a3 d4 | f4:3 e4 | d4:2 f4 bf4 | a4:4 | .:2 a3 d4 | f4:2 e4 c4 | d4:2 bf3:2 | a3:2 cs4:2" },
        counter: { inst: "glass", vel: 0.32, n: "d6:4 | .:4 | f5:4 | .:4 | d6:4 | .:4 | g5:4 | e5:4" },
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
