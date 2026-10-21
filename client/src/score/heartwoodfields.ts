// ---------- The Heartwood Fields — "The Counting-Song" ----------
// Heartwood's home countryside, levels 1-10: wild orchards, the mill on the
// brook, the charcoal camps' one thread of smoke, and the grove-shadowed road
// west to the border gate. "Everything planted, everything loved, nothing
// surveyed." Heartwood is the city that kept its songs when the empire banned
// them, and out here the songs are still how things are done: newcomers sing
// the greeting to the trees, the elders each keep a verse of the counting-song,
// there is a verse that goes with the mill wheel that nobody sings right who
// has not heard the wheel, and Petta in the orchards hums something that stops
// in the middle — be polite and pretend you didn't hear.
//
// So the piece is a song with verses, the way the zone's quests are: F major,
// a swung 4/4 at 104 (cider country, a tune you could clap to), one melody —
// a counting-up verse and a refrain with the grove's choir answering it —
// sung three times by different people, and one other tune that breaks off.
//
//   intro  the city's greeting-song heard back over the gate (its head, on
//          flute), the mill wheel starting (harp), the verse's first line
//          hummed on the reed — skipped on the loop
//   A      Hazel's verse: the reed sings verse and refrain over a strummed lute
//          and a walking bass; the choir answers the refrain in long notes
//   B      the Mill Verse: the same tune in D minor, low on the horn, an old
//          man's voice; the harp turns eighths like the wheel, a tom thumps
//          on the paddles, the flute answers at the cadences
//   C      Petta's tune: the song's ending, the part the empire banned and
//          the city still leaves off (Heartwood's own piece stops it a bar
//          short too). She hums it on the reed over the choir, counting up
//          twice in D minor towards the high C — and stops there. Two bars of
//          nothing but the choir and a glass drop. Then the flute, gently,
//          starts counting again. That gap is the haunting; it is homesickness
//          for a song.
//   A'     everyone's verse: the flute has the tune, the choir sings the
//          refrain with it, the reed a counter-line, the horn underneath, the
//          kit in with a backbeat — the loudest pass, the Song-Steps out of doors
//
// The choir is Heartwood's sound (the chanters); the swing is the fields'.
// Heartwood's city piece sings this verse in its own 3/4 (its section D), and
// the North Road quotes its first bar at the halfway inn.

import type { Piece } from "./kit.ts";

/** The counting-song: up the scale to the octave and back, a verse that
 *  half-closes nowhere — it just keeps counting — then a refrain that leans on
 *  Bb and C and turns to D minor before it comes home. */
const VERSE = `
  c5 f5:.5 f5:.5 g5 a5 | c6:1.5 a5:.5 f5:2 | d5 f5:.5 f5:.5 bf5 a5 | g5 f5 c5:2 |
  a5 a5:.5 g5:.5 f5 d5 | g5:1.5 f5:.5 d5 bf4 | c5 f5 e5 g5           | f5:3 .     |`;
const REFRAIN = `
  f5 d5:.5 f5:.5 bf5:2 | g5 e5:.5 g5:.5 c6:2 | a5:1.5 g5:.5 e5 c5 | f5:1.5 e5:.5 d5:2 |
  f5 d5:.5 f5:.5 bf5:2 | c6 bf5:.5 a5:.5 g5:2 | f5 g5 bf5 e5       | f5:3 . `;
const SONG = VERSE + REFRAIN;
const SONG_CHORDS = `
  F  | F | Bb | F   | Dm | Gm7 | C7sus4 C7 | F |
  Bb | C | Am7 | Dm | Bb | C   | Gm7 C7    | F `;
/** the grove answering the refrain: long notes, no words */
const CHOIR_ANSWER = `
  .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |
  d5:4 | e5:4 | e5:4 | d5:4 | d5:4 | e5:4 | d5:2 c5:2 | c5:4 `;
/** A' only: the reed's counter-line, half notes against the tune's quarters */
const REED_COUNTER = `
  a4:2 c5:2 | a4:4 | bf4:2 d5:2 | c5:4 | d5:2 f5:2 | d5:4 | c5:2 bf4:2 | a4:4 |
  d5:4 | e5:4 | c5:2 e5:2 | f5:2 d5:2 | d5:4 | e5:2 g5:2 | d5:2 c5:2 | c5:4 `;

export default {
  title: "The Counting-Song",
  zones: ["heartwoodfields"],
  note: "swung 4/4, F major: one song, three singers (reed, then the low horn in D minor at the mill, then everyone); listen for Petta's tune in C stopping after three bars — the gap is deliberate",
  song: {
    bpm: 104, swing: 0.18, space: 2.6,
    sections: [
      // 0 — intro: the city's greeting from the gate, the wheel, the first line
      {
        name: "intro",
        chords: "Dm | C F | F | C7sus4 C7",
        pad: { inst: "choir", vel: 0.5 }, bass: { pat: "swell", vel: 0.7 },
        // Heartwood's greeting-song ("Where the Old Trees Can Hear"), its head
        // in D dorian, heard back over the gate
        counter: { inst: "flute", vel: 0.55, n: "a4 d5 d5:2 | e5:2 f5:2 | .:4 | .:4" },
        lead: { inst: "reed", vel: 0.7, n: ".:4 | .:4 | c5 f5:.5 f5:.5 g5 a5 | c6:1.5 bf5:.5 g5 e5" },
        arp: { inst: "harp", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 4, vel: 0.5 },
        drums: { tom: "2.......2.......", vel: 0.35 },
      },
      // 1 — A, Hazel's verse: the reed sings, the grove answers
      {
        name: "A Hazel's verse",
        chords: SONG_CHORDS,
        pad: { inst: "strings", vel: 0.68 }, bass: { pat: "walk", vel: 0.8 },
        lead: { inst: "reed", vel: 1.05, n: SONG },
        counter: { inst: "choir", vel: 0.55, n: CHOIR_ANSWER },
        hits: { inst: "lute", pat: "X.x.Xox.", unit: 0.5, oct: 3, vel: 0.56 },
        drums: { kick: "x.......x.......", shaker: "x.x.x.x.x.x.x.x.", vel: 0.45 },
      },
      // 2 — B, the Mill Verse: D minor, low horn, the wheel turning
      {
        name: "B Mill Verse",
        chords: `
          Dm | Dm/C | Bb | A   | Dm | Gm | A7sus4 A7 | Dm |
          Bb | C    | F  | A   | Bb | C  | Gm7 A7    | Dm `,
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "oct", vel: 0.8 },
        lead: { inst: "horn", oct: -1, vel: 0.92, n: `
          a4 d5:.5 d5:.5 e5 f5 | a5:1.5 f5:.5 d5:2 | bf4 d5:.5 d5:.5 g5 f5 | e5 cs5 a4:2 |
          f5 f5:.5 e5:.5 d5 a4 | g5:1.5 f5:.5 d5 bf4 | a4 d5 cs5 e5        | d5:3 .      |
          d5 bf4:.5 d5:.5 f5:2 | e5 c5:.5 e5:.5 g5:2 | f5:1.5 e5:.5 c5 a4  | e5:1.5 d5:.5 cs5:2 |
          d5 bf4:.5 d5:.5 f5:2 | g5 f5:.5 e5:.5 c5:2 | d5 bf4 cs5 e5       | d5:3 . ` },
        counter: { inst: "flute", vel: 0.45, n: `
          .:4 | .:4 | .:4 | cs6?:.5 b5?:.5 a5:3 | .:4 | .:4 | .:4 | a5?:.5 f5?:.5 d5:3 |
          f5:4 | g5:4 | a5:4 | a5:4 | bf5:4 | g5:4 | f5:2 e5:2 | f5:4 ` },
        arp: { inst: "harp", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 4, vel: 0.6 },
        drums: { tom: "2.......2.......", shaker: "x.x.x.x.x.x.x.x.", vel: 0.45 },
      },
      // 3 — C, Petta's tune: the song's banned ending, climbing, and it stops
      {
        name: "C Petta's tune",
        chords: "Dm | Bb | F | C | Dm | Bb | Gm7 | Csus4 C",
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "swell", vel: 0.65 },
        lead: { inst: "reed", vel: 0.75, n: "d5 f5:.5 f5:.5 g5 a5 | bf5:1.5 a5:.5 g5 d5 | c5 f5:.5 f5:.5 g5 a5 | c6:1.5 .:2.5 | .:4 | .:4 | .:4 | .:4" },
        // after the gap, the flute starts counting again, on tiptoe
        counter: { inst: "flute", vel: 0.55, n: ".:4 | .:4 | .:4 | .:4 | .:4 | .:4 | f5:2 g5 a5 | g5:3 c5" },
        parts: [{ inst: "glass", vel: 0.3, n: ".:4 | .:4 | .:4 | .:4 | d6:4 | .:2 a5:2 | .:4 | .:4" }],
      },
      // 4 — A', everyone's verse
      {
        name: "A' everyone's verse",
        chords: SONG_CHORDS,
        pad: { inst: "strings", vel: 0.82 }, bass: { pat: "walk", vel: 0.95 },
        lead: { inst: "flute", vel: 1.15, n: SONG },
        counter: { inst: "reed", vel: 0.55, n: REED_COUNTER },
        parts: [
          // the choir sings the refrain with the flute, an octave down
          { inst: "choir", oct: -1, vel: 0.62, n: ".:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 |" + REFRAIN },
          { inst: "horn", oct: -1, vel: 0.5, n: "f4:4 | f4:4 | f4:4 | f4:4 | f4:4 | d4:4 | g4:4 | f4:4 | f4:4 | e4:4 | e4:4 | f4:4 | f4:4 | e4:4 | d4:2 e4:2 | f4:4" },
        ],
        hits: { inst: "lute", pat: "X.x.Xox.", unit: 0.5, oct: 3, vel: 0.62 },
        drums: {
          kick: "x.......x.......", snare: "....x.......x...", shaker: "x.x.x.x.x.x.x.x.", vel: 0.45,
          fill: { tom: "........1.2.2.3.", every: 8 },
        },
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
