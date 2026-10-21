// ---------- The Keep — "The Last Door" ----------
// Inside the Capital's castle keep, levels 47-50: the main story's last door.
// The great doors into the Great Hall are barred — "the last door does not
// open" — so the way in is the household's back way: the guardroom, the
// kitchens with the great hearth banked, the armoury, the cells, then the Long
// Gallery, a hundred metres of portraits under tall windows on the city in the
// late sun; the council chamber, the chapel, the library; the Presence
// Chamber, and the Great Hall itself — a basilica, a clerestory streaming
// light, the empty throne under its baldachin and the Regent before it.
// Behind the throne, the King's Chamber: the bed made and never slept in.
// Every chandelier in the keep hangs a little out of true, all the same way.
//
// So the form is the household. A ground bass — eight bars, one note each,
// E-flat stepping down the scale to G and turning back up to B-flat — that
// never stops, never changes, and carries every variation laid over it: the
// servants' round, kept every day for three hundred years. 4/4 at a stately
// 84, E-flat major, the warmest key the brass and choir have. The tune over
// it is an air a household would hum; each room dresses it differently, and
// the walk through the keep is the walk through the variations. Grand at the
// throne, homesick everywhere else.
//
//   intro  the barred doors: two knocks on the timpani, the chapel bell, the
//          horn, the second half of the ground — skipped on the loop
//   V1     the Back Way: the air on the flute over the harp and the ground in
//          the bass — the household going about its morning
//   V2     the Cells: the same ground under C minor; the air turns minor in
//          the low reed, pizzicato and glass. The one shadow.
//   V3     the Long Gallery: the ground twice. The strings sing the air and
//          its answer at full length, the horn under them, the harp turning,
//          the bell for the late sun on the portraits — the mid set piece
//   V4     the Chapel: the horns in pairs and the choir make the ground a
//          chorale; the hushed room, the silence haunts
//   V5     the Great Hall: the ground twice, and everything — the brass with
//          the air, the strings doubling, horns, choir, timpani and a crash.
//          The empty throne, honoured. The loudest place in the piece.
//   V6     the King's Chamber: half the ground on the harp alone, glass, the
//          air's first bar on the flute and then nothing — the bed made and
//          never slept in — and the round begins again at the Back Way
//
// The haunting is only that the variations are for a family who has not come
// home; the ground keeps going because nobody told it to stop.

import type { Piece } from "./kit.ts";

/** The ground: down the scale from E-flat to G, then back up to the dominant.
 *  Every variation's chords sit over exactly these bass notes. Bar 4 is G minor
 *  with its seventh because the air holds F there for three beats. */
const GROUND_CHORDS = "Eb | Bb/D | Cm | Gm7/Bb | Ab | Eb/G | Fm/Ab | Bb";
const GROUND = "ef3:4 | d3:4 | c3:4 | bf2:4 | af2:4 | g2:4 | af2:4 | bf2:4";
/** the ground with its octave on beat 3, for the variations that walk */
const GROUND_WALK = "ef3:2 ef2:2 | d3:2 d2:2 | c3:2 c2:2 | bf2:2 bf1:2 | af2:2 af1:2 | g2:2 g1:2 | af2:2 af1:2 | bf2:2 bf1:2";

/** The air: a half-close on the ground's B-flat every eight bars, the answer
 *  reaching up to the high B-flat in its second bar. */
const AIR = `
  bf4:1.5 c5:.5 bf4 g4  | f4:2 bf4:2         | c5:1.5 d5:.5 ef5 g5 | f5:3 d5        |
  ef5:1.5 f5:.5 ef5 c5  | bf4:2 g4:2         | af4 c5 f5 ef5       | d5:4           `;
const ANSWER = `
  g5:1.5 f5:.5 ef5 bf4  | d5:1.5 ef5:.5 f5 bf5 | g5:2 ef5:2        | d5:1.5 c5:.5 bf4 d5 |
  c5:1.5 bf4:.5 af4 c5  | ef5:2 bf4 g5       | af5:1.5 g5:.5 f5 c5 | d5:4           `;
/** the horn under the air and its answer */
const AIR_FLOOR = `
  ef4:4 | f4:4 | g4:4 | bf4:2 g4:2 | af4:4 | g4:4 | f4:2 af4:2 | f4:4 |
  ef4:2 g4:2 | f4:4 | ef4:2 c4:2 | d4:4 | ef4:4 | ef4:2 bf3:2 | c4:2 f4:2 | d4:4 `;

export default {
  title: "The Last Door",
  zones: ["keep"],
  note: "a ground bass that never stops (E-flat down to G and back up to B-flat, one note a bar) under variations, one per room: the air on flute (Back Way), minor in the reed (Cells), strings (Long Gallery), a chorale (Chapel), the full court (Great Hall), and the harp alone (King's Chamber)",
  song: {
    bpm: 84, space: 3.6,
    sections: [
      // 0 — intro: the barred doors, the bell, the second half of the ground
      {
        name: "intro",
        chords: "Ab | Eb/G | Fm/Ab | Bb",
        pad: { inst: "choir", vel: 0.6 }, bass: null,
        lead: { inst: "horn", vel: 0.85, n: ".:4 | bf3:1.5 c4:.5 bf3 g3 | f3:2 af3:2 | bf3:4" },
        counter: { inst: "bell", vel: 0.3, n: "ef5:4 | .:4 | .:4 | f5:4" },
        parts: [
          { inst: "bass", vel: 0.7, n: "af2:4 | g2:4 | af2:4 | bf2:4" },
          { inst: "timpani", vel: 0.55, n: "ef2!:1 ef2:1 .:2 | .:4 | .:4 | bf1:.25*12 bf1:1" },
        ],
      },
      // 1 — V1, the Back Way: the air on the flute, the household's morning
      {
        name: "V1 Back Way",
        chords: GROUND_CHORDS,
        pad: { inst: "strings", vel: 0.45 }, bass: null,
        arp: { inst: "harp", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 4, vel: 0.6 },
        lead: { inst: "flute", vel: 0.9, n: AIR },
        parts: [{ inst: "bass", vel: 0.55, n: GROUND }],
      },
      // 2 — V2, the Cells: the same ground under C minor
      {
        name: "V2 Cells",
        chords: "Cm/Eb | G/D | Cm | Gm/Bb | Fm/Ab | G | Ab | Bb",
        pad: { inst: "choir", vel: 0.5 }, bass: null,
        arp: { inst: "pizz", pat: "0 . 2 . 1 . 2 .", unit: 0.5, oct: 3, vel: 0.85 },
        lead: { inst: "reed", vel: 0.95, n: `
          g4:1.5 af4:.5 g4 ef4 | d4:2 g4:2 | c5:1.5 d5:.5 ef5 c5 | d5:3 bf4 |
          c5:1.5 bf4:.5 af4 f4 | g4:2 b4:2 | c5 ef5 af5 g5       | f5:2 d5:2 ` },
        counter: { inst: "glass", vel: 0.3, n: "ef6:4 | .:4 | g5:4 | .:4 | c6:4 | b5:4 | .:4 | d6:4" },
        parts: [{ inst: "bass", vel: 0.5, n: GROUND }],
      },
      // 3 — V3, the Long Gallery: the strings sing the air at full length
      {
        name: "V3 Long Gallery",
        chords: `${GROUND_CHORDS} | ${GROUND_CHORDS}`,
        pad: { inst: "strings", vel: 0.6 }, bass: null,
        arp: { inst: "harp", pat: "0 1 2 3 2 1 2 3", unit: 0.5, oct: 4, vel: 0.62 },
        lead: { inst: "strings", vel: 3.6, n: `${AIR} | ${ANSWER}` },
        counter: { inst: "horn", vel: 0.8, n: AIR_FLOOR },
        parts: [
          { inst: "bass", vel: 0.85, n: `${GROUND_WALK} | ${GROUND_WALK}` },
          { inst: "bell", vel: 0.22, n: "g5:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | bf5:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4" },
        ],
      },
      // 4 — V4, the Chapel: the ground as a chorale
      {
        name: "V4 Chapel",
        chords: "Eb | Bb/D | Cm7 | Bb | Abmaj7 | Eb/G | Fm7/Ab | Bbsus4 Bb",
        pad: { inst: "choir", vel: 1.2 }, bass: null,
        lead: { inst: "horn", vel: 0.9, n: `
          g4+bf4:4 | f4+bf4:4 | g4+c5:2 g4+bf4:2 | f4+d5:4 |
          ef4+c5:2 g4+c5:2 | g4+bf4:4 | af4+c5:2 af4+ef5:2 | f4+ef5:2 f4+d5:2 ` },
        counter: { inst: "bell", vel: 0.24, n: "ef5:4 | .:4 | .:4 | .:4 | c5:4 | .:4 | .:4 | .:4" },
        parts: [{ inst: "bass", vel: 0.6, n: GROUND }],
      },
      // 5 — V5, the Great Hall: everything, for an empty throne
      {
        name: "V5 Great Hall",
        chords: `${GROUND_CHORDS} | ${GROUND_CHORDS}`,
        pad: { inst: "choir", vel: 1.1 }, bass: null,
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "brass", vel: 1.05, n: `${AIR} | ${ANSWER}` },
        counter: { inst: "horn", vel: 0.85, n: AIR_FLOOR },
        parts: [
          { inst: "strings", vel: 2.4, n: `${AIR} | ${ANSWER}` },
          { inst: "bass", vel: 0.9, n: `${GROUND_WALK} | ${GROUND_WALK}` },
          { inst: "timpani", vel: 0.5, n: `
            ef2!:4 | d2:4 | c2:4 | bf1:4 | af1:4 | g1:4 | af1:4 | bf1:.25*8 bf1:2 |
            ef2!:4 | d2:4 | c2:4 | bf1:4 | af1:4 | g1:4 | af1:4 | bf1:.25*12 bf1:1 ` },
        ],
        drums: {
          snare: "................ | ................ | ................ | ................ | ................ | ................ | ................ | ............rrRR",
          crash: "X............... | ................ | ................ | ................ | ................ | ................ | ................ | ................",
          vel: 0.4,
        },
      },
      // 6 — V6, the King's Chamber: half the ground on the harp alone
      {
        name: "V6 King's Chamber",
        chords: "Eb | Bb/D | Cm | Gm7/Bb",
        pad: { inst: "strings", vel: 0.35 }, bass: null,
        arp: { inst: "harp", pat: "0 1 2 3 . . . .", unit: 0.5, oct: 4, vel: 0.5 },
        lead: { inst: "flute", vel: 0.6, n: "bf4:1.5 c5:.5 bf4 g4 | f4:4 | .:4 | .:4" },
        counter: { inst: "glass", vel: 0.3, n: ".:4 | .:4 | g5:4 | f5:4" },
        parts: [{ inst: "bass", vel: 0.42, n: "ef3:4 | d3:4 | c3:4 | bf2:4" }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
