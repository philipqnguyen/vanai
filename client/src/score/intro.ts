// ---------- The intro — "The Empty Throne" (an overture) ----------
// The scene every new character sees before their city (cutscenes/*.json
// `intro`, cutscene-cinema.ts): the empire at its height, the night everyone
// left, the empty city, the border, the three free cities built outside it,
// and the border failing. It is the only piece written for a scene rather than
// a place, and it is laid out bar for bar to the scene's chapters: each
// section opens on one chapter, its first bar or two under the narration card
// (the chapter's zone builds behind it), the rest under the shots. Change a
// section's length and the chapter's `bar` and shots in cutscenes/*.json must
// move with it (cinemaProblems checks the two agree).
//
// Re-scored 2026-10-12 as a trailer (Philip: "the flybys are also really
// slow"): 4/4 at 120, so a bar is exactly 2 s and a beat 0.5 s and the shots
// cut on the beats; 49 bars, 98 s. Driving, building, with one dead stop.
//
// The empire's music is the Household theme (score/capital.ts, "The Table Is
// Set", there a sarabande in 3/4), broadened to 4/4 the way the Burned Land
// quotes it from the walls, and still the spine. Each city is quoted in its own
// colours: Caerdun's muster call on the horn over a march snare
// (score/caerdun.ts, already 4/4), Heartwood's greeting-song on the flute over
// hand drum and shaker (heartwood.ts, recast from 3/4), Moonmere's theme on the
// piano with its lydian B natural (moonmere.ts, recast from 5/4). A shaker or
// a spiccato line keeps an eighth-note pulse running across the cities' joins
// (bars 21, 26, 32), so the three read as one run, not three songs.
//
//   S0  bars  0-1   Before: a choir, a timpani roll and a spiccato riser out of nothing
//   S1  bars  2-7   The Empire: the theme on brass, horn under it, spiccato eighths,
//                   taiko and timpani, driving to the last sixteenth of bar 7
//   S2  bars  8-9   The Night: nothing. Bar 8 is silent; one far bell in bar 9
//   S3  bars 10-14  The Table Is Set: the theme in D minor on glass, the music box
//                   of the empty city, the archive clock ticking once a second
//   S4  bars 15-20  The Border: D minor, the horn call; the ostinato, the taiko and
//                   the kick come back in under it bar by bar, a roll into Caerdun
//   S5  bars 21-25  Caerdun: D major, the muster call on horn over the march
//   S6  bars 26-31  Heartwood: A dorian, the greeting-song on flute, hand drum, shaker
//   S7  bars 32-36  Moonmere: F lydian, the theme on piano, the B natural held in bar 34
//   S8  bars 37-44  The Gates: everything builds from D minor to the dominant; the
//                   last beat of bar 44 is a breath
//   S9  bars 45-48  Vanai: the hit, the theme's head on everything, the F held to the end
//
// The dead stop is why bar 7 empties from the top down: the voices that ring
// (strings, choir, horn, taiko, timpani's long strokes) let go on its third
// beat, the brass, the spiccato and the bass on its fourth, and only the
// snare's sixteenths, dry, drive to the barline. It is also why the room is
// 1.2 s against the old overture's 3.6. Measured: a 1.4 s room left bar 8 at
// -47 dBFS, and the spiccato's last eighths put another 8 dB on top; this way
// bar 8 renders at -54 dBFS, digital silence by its third beat.

import { onFirst, type Piece } from "./kit.ts";

/** The spiccato ostinato for one bar: root, root, octave, root, fifth, root,
 *  octave, root, in eighths (or sixteenths, twice over, with `six`). */
const ost = (r: string, hi: string, five: string, six = false): string => {
  const cell = `${r}!:L ${r}:L ${hi}:L ${r}:L ${five}:L ${r}:L ${hi}:L ${r}:L`;
  return six ? `${cell} ${cell}`.replace(/:L/g, ":.25") : cell.replace(/:L/g, ":.5");
};
const QUIET = "................";

export default {
  title: "The Empty Throne",
  scenes: ["intro"],
  note: "the intro's overture, a trailer in 4/4 at 120 cut to the scene's chapters: the Household theme driving (the empire), a dead stop for the night, the theme on glass in D minor (the empty city), the three cities' own themes on one running pulse, a build, and the theme's head on everything for the title",
  song: {
    bpm: 120, beats: 4, space: 1.2,
    sections: [
      // S0 — Before: the card "For a thousand years..." Out of nothing, onto bar 2.
      {
        name: "S0 Before",
        chords: "F | Csus4 C",
        pad: null, bass: null,
        parts: [
          { inst: "choir", vel: 0.55, n: "f3+c4+f4?:4 | g3+c4+f4:2 g3+c4+e4!:2" },
          { inst: "timpani", vel: 0.42, n: "f1?:.25*16 | c2:.25*12 c2!:.25*4" },
          // the riser: two octaves up in sixteenths, landing on the theme's F
          { inst: "spiccato", vel: 0.7, n: ".:4 | c3?:.25 d3?:.25 e3?:.25 f3?:.25 g3:.25 a3:.25 bf3:.25 c4:.25 d4:.25 e4:.25 f4:.25 g4:.25 a4!:.25 bf4!:.25 c5!:.25 e5!:.25" },
        ],
        drums: { snare: "................ | oooooooo xxxxXXXX", vel: 0.4 },
      },
      // S1 — The Empire: the living Capital at dusk, the flights down its avenue
      {
        name: "S1 The Empire",
        chords: "F | C/E | Dm | Bb | Gm7 | C",
        pad: null, bass: null,
        lead: { inst: "brass", vel: 0.85, n: "c5 f5:3 | e5 g5:3 | a5:1.5 g5:.5 f5:2 | d5 bf5:3 | a5:1.5 bf5:.5 c6 d6 | c6:1.5 bf5:.5 g5:.5 e5:.5 .:1" },
        counter: { inst: "horn", vel: 0.9, n: "f4:4 | e4:4 | d4:2 f4:2 | f4:4 | d4:2 e4:2 | e4:2 .:2" },
        parts: [
          // the strings' chords written out, so they let go on bar 7's third beat
          { inst: "strings", vel: 0.45, n: "a3+c4+f4:4 | g3+c4+e4:4 | f3+a3+d4:4 | f3+bf3+d4:4 | g3+bf3+d4+f4:4 | g3+c4+e4:2 .:2" },
          { inst: "choir", vel: 0.32, n: "f4:4 | e4:4 | d4:4 | d4:4 | d4:4 | e4:2 .:2" },
          { inst: "spiccato", vel: 0.75, n: [ost("f3", "f4", "c4"), ost("e3", "e4", "c4"), ost("d3", "d4", "a3"), ost("bf2", "bf3", "f3"), ost("g2", "g3", "d3"), "c3!:.5 c3:.5 c4:.5 c3:.5 g3:.5 c3:.5 .:1"].join(" | ") },
          { inst: "bass", vel: 0.8, n: "f2:.5*8 | e2:.5*8 | d2:.5*8 | bf1:.5*8 | g1:.5*8 | c2:.5*6 c2!:.5 .:.5" },
          // short strokes only in bar 7: a long one rings 2 s, into the silence
          { inst: "timpani", vel: 0.42, n: "f1!:1 .:1 f1:.5 f1:.5 c2:1 | c2:2 c2:.5 c2:.5 c2:1 | d2:2 a1:2 | bf1:2 f1:1 f1:.25*4 | g1:2 d2:1 d2:.25*4 | c2!:.5 .:.5 c2:.25*4 .:2" },
        ],
        drums: {
          kick: "x.......x.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.",
          taiko: "3.......2.......", crash: onFirst("X...............", 6), vel: 0.5,
          // the stop: taiko, toms and kick early (they ring), the snare to the last sixteenth
          fill: { kick: "x.....x.x.......", snare: "....X...xxxxXXXX", hat: "x.x.x.x.........", taiko: "3...............", tom: "........1.2.3..." },
        },
      },
      // S2 — The Night: the card "Then, one night, between dusk and dawn, everyone was gone."
      {
        name: "S2 The Night",
        chords: "Dm | Dm",
        pad: null, bass: null,
        parts: [{ inst: "bell", vel: 0.16, n: ".:4 | d5:4" }],
      },
      // S3 — The Table Is Set: the empty Capital at dawn, the music box
      {
        name: "S3 The Table Is Set",
        chords: "Dm | A/C# | Dm | Gm/Bb | A",
        pad: { inst: "strings", vel: 0.34 }, bass: { pat: "root", vel: 0.4 },
        lead: { inst: "glass", vel: 0.8, n: "a4 d5:3 | cs5 e5:3 | f5:1.5 e5:.5 d5:2 | bf4 g5:3 | e5:1.5 d5:.5 cs5:2" },
        counter: { inst: "harp", vel: 0.4, n: "d3:2 a3:2 | cs3:2 a3:2 | d3:2 a3:2 | bf2:2 g3:2 | a2:2 cs3:2" },
        // the archive clock: once a second, the kept city's one sound
        drums: { hat: "x.......o.......", vel: 0.3 },
      },
      // S4 — The Border: the card, then fast along the walls. The drive comes back.
      {
        name: "S4 The Border",
        chords: "Dm | Dm | Bb | F/A | Gm | A",
        pad: { inst: "choir", vel: 0.5 }, bass: null,
        lead: { inst: "horn", vel: 1.05, n: "d4:2 a4:2 | a4:3 f4:.5 a4:.5 | d5:3 c5 | c5:1.5 bf4:.5 a4:2 | bf4:1.5 a4:.5 g4 e4 | a4:4" },
        counter: { inst: "brass", vel: 0.5, oct: -1, n: ".:4 | .:4 | .:4 | c5:1.5 bf4:.5 a4:2 | bf4:1.5 a4:.5 g4 e4 | a4:4" },
        parts: [
          { inst: "spiccato", vel: 0.75, n: [".:4", ost("d3", "d4", "a3"), ost("bf2", "bf3", "f3"), ost("a2", "a3", "f3"), ost("g2", "g3", "d3", true), "a2:.25*8 cs3:.25*4 e3!:.25*4"].join(" | ") },
          { inst: "bass", vel: 0.75, n: ".:4 | d2:.5*8 | bf1:.5*8 | a1:.5*8 | g1:.5*8 | a1:.5*8" },
          { inst: "timpani", vel: 0.4, n: "d2?:.25*16 | d2:2 .:2 | bf1:2 .:2 | a1:2 .:2 | g1:2 g1:.5 g1:.5 g1:1 | a1?:.25*8 a1:.25*4 a1!:.25*4" },
        ],
        drums: {
          taiko: `${QUIET} | 3.......3....... | 3.......3.....2. | 3...2...3...2.2. | 3..2..2.3..2.2.. | 3.2.3.2.3.2.3333`,
          kick: `${QUIET} | ${QUIET} | ${QUIET} | x.......x....... | x.....x.x.....x. | x...x...x...x...`,
          snare: `${QUIET} | ${QUIET} | ${QUIET} | ${QUIET} | ............x.x. | ........xxxxXXXX`,
          vel: 0.55,
        },
      },
      // S5 — Caerdun: the card, then the fortress. The muster call, still driving.
      {
        name: "S5 Caerdun",
        chords: "D | G/D | D | A | G",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "drive", vel: 0.75 },
        lead: { inst: "horn", vel: 1.2, n: "a4:.75 a4:.25 d5:1.5 e5:.5 fs5 | g5:1.5 fs5:.5 e5 d5 | fs5 a5 fs5:.75 e5:.25 d5 | e5:3 a4 | b4:.75 b4:.25 d5:1.5 e5:.5 g5" },
        counter: { inst: "brass", vel: 0.45, n: "fs3:4 | g3:4 | a3:4 | a3:4 | g3:4" },
        arp: { inst: "pizz", pat: "0 2 1 2 0 2 1 2", unit: 0.5, oct: 3, vel: 1.0 },
        parts: [{ inst: "timpani", vel: 0.5, n: "d2!:2 .:2 | .:4 | d2:2 .:2 | a1:2 a1:.5*4 | g1:2 .:2" }],
        drums: {
          kick: "x.......x.......", snare: "X..ox.o.X..ox.oo", shaker: "x.x.x.x.x.x.x.x.",
          crash: onFirst("X...............", 5), vel: 0.45,
          fill: { snare: "X..ox.o.X...XXXX" },
        },
      },
      // S6 — Heartwood: two bars of card, then low among the giant trees. The greeting-song.
      {
        name: "S6 Heartwood",
        chords: "Am | G Am | Am C | D G | C Am | Em G",
        pad: { inst: "strings", vel: 0.45 }, bass: null,
        lead: { inst: "flute", vel: 1.0, n: "e4 a4:.5 a4:.5 b4:1.5 c5:.5 | d5 c5:.5 b4:.5 a4:2 | a4 c5:.5 e5:.5 g5:1.5 e5:.5 | d5 e5:.5 fs5:.5 g5:2 | e5:1.5 d5:.5 c5 b4:.5 a4:.5 | b4:1.5 g4:.5 b4 d5" },
        arp: { inst: "harp", pat: "0 1 2 1 2 1 0 1", unit: 0.5, oct: 3, vel: 0.6 },
        parts: [
          // root and fifth in quarters, written: the engine's patterns divide a
          // half-bar chord in half again
          { inst: "bass", vel: 0.8, n: "a2 e3 a2 e3 | g2 d3 a2 e3 | a2 e3 c3 g2 | d3 a2 g2 d3 | c3 g2 a2 e3 | e2 b2 g2 d3" },
        ],
        drums: { tom: "2..1..2.2..1..2.", shaker: "xoxoxoxoxoxoxoxo", kick: "x.......x.......", vel: 0.5 },
      },
      // S7 — Moonmere: the card, then the island from the open sea. The B natural in bar 34.
      {
        name: "S7 Moonmere",
        chords: "F | C | Fmaj7s11 | C | Bb A",
        pad: { inst: "strings", vel: 0.42 }, bass: { pat: "root", vel: 0.65 },
        lead: { inst: "piano", vel: 0.9, n: "c5 f5 a5 g5:.5 f5:.5 | e5:1.5 d5:.5 e5 g5 | a5:1.5 g5:.5 b5:2 | c6:1.5 b5:.5 g5 e5 | f5:1.5 d5:.5 e5:1.5 cs5:.5" },
        arp: { inst: "harp", pat: "0 1 2 3 2 1 2 1", unit: 0.5, oct: 3, vel: 0.6 },
        parts: [{ inst: "glass", vel: 0.35, n: ".:4 | .:4 | .:2 b5:2 | .:4 | .:4" }],
        drums: { shaker: "x.x.x.x.x.x.x.x.", kick: "x.......x.......", vel: 0.38, fill: { tom: "........1.2.3.33" } },
      },
      // S8 — The Gates: the card "Now, after three hundred years, the border is failing.",
      // then the gates opening and the camera through them
      {
        name: "S8 The Gates",
        chords: "Dm | Bb | F/A | Gm | Dm/F | Bb | Csus4 | C",
        pad: null, bass: null,
        lead: { inst: "brass", vel: 0.8, n: "a4:4 | bf4:4 | c5:4 | d5:4 | f5:4 | f5:2 g5:2 | g5:4 | g5:3 .:1" },
        counter: { inst: "horn", vel: 0.85, n: "d4:4 | d4:4 | c4:4 | bf3:4 | a3:4 | bf3:4 | c4:4 | e4:3 .:1" },
        parts: [
          { inst: "strings", vel: 0.5, n: "d3+a3+f4:4 | d3+bf3+f4:4 | c3+a3+f4:4 | d3+bf3+g4:4 | f3+a3+d4:4 | f3+bf3+d4:4 | f3+c4+g4:4 | e3+c4+g4:3 .:1" },
          { inst: "choir", vel: 0.42, n: ".:4 | .:4 | .:4 | .:4 | a4+d5:4 | bf4+d5:4 | c5+f5:4 | c5+e5:3 .:1" },
          { inst: "spiccato", vel: 0.75, n: [
            ost("d3", "d4", "a3"), ost("bf2", "bf3", "f3"), ost("a2", "a3", "f3"), ost("g2", "g3", "d3"),
            ost("d3", "d4", "a3", true), ost("bf2", "bf3", "f3", true), ost("c3", "c4", "g3", true), "c3:.25*4 c3:.25*4 c4!:.25*4 .:1",
          ].join(" | ") },
          { inst: "bass", vel: 0.8, n: "d2:.5*8 | bf1:.5*8 | a1:.5*8 | g1:.5*8 | f1:.5*8 | bf1:.5*8 | c2:.5*8 | c2:.5*6 .:1" },
          { inst: "timpani", vel: 0.42, n: "d2:2 .:2 | bf1:2 .:2 | a1:2 a1:1 a1:1 | g1:1 g1:1 g1:.5*4 | d2:1 d2:.5 d2:.5 d2:.5*4 | bf1:.5*8 | c2:.25*16 | c2:.25*8 c2!:.25*4 .:1" },
        ],
        drums: {
          taiko: "3.......3....... | 3.......3.....2. | 3.......3...2.2. | 3...2...3...2.2. | 3...2.2.3...2.2. | 3.2.2.2.3.2.2.2. | 3.2.3.2.3.2.3.2. | 3.2.3.2.3.......",
          tom: `${QUIET} | ${QUIET} | ............1.2. | ............1123 | ........1.1.2.33 | ........11223333 | ....1.1.2.2.3.33 | 11112222333.....`,
          snare: `${QUIET} | ${QUIET} | ${QUIET} | ............xxxx | ....X.......X... | ....X.......X.xx | ....X...X...xxxx | rrrrrrrrRRRR....`,
          kick: "........x....... | x.......x....... | x.......x.x..... | x.......x.x..... | x...x...x...x... | x...x...x...x... | x.x.x.x.x.x.x.x. | x.x.x.x.x.x.....",
          vel: 0.47,
        },
      },
      // S9 — Vanai: the title. The hit, the theme's head on everything, the F held.
      {
        name: "S9 Vanai",
        chords: "F | C/E | Gm C | F",
        pad: { inst: "strings", vel: 0.75 }, bass: null,
        lead: { inst: "brass", vel: 0.95, n: "c5! f5:3 | e5 g5:3 | a5:1.5 bf5:.5 g5:2 | f5:4" },
        counter: { inst: "horn", vel: 0.9, n: "a3:4 | g3:4 | bf3:2 c4:2 | a3:4" },
        parts: [
          { inst: "flute", vel: 0.6, n: "c5 f5:3 | e5 g5:3 | a5:1.5 bf5:.5 g5:2 | f5:4" },
          { inst: "strings", vel: 0.5, n: "c4 f4:3 | e4 g4:3 | a4:1.5 bf4:.5 g4:2 | f4:4" },
          { inst: "choir", vel: 0.45, n: "a4+c5:4 | g4+c5:4 | bf4+d5:2 c5+e5:2 | a4+c5:4" },
          { inst: "bass", vel: 0.85, n: "f1:.5*8 | e2:.5*8 | g1:.5*4 c2:.5*4 | f1:4" },
          { inst: "timpani", vel: 0.46, n: "f1!:1 f1:.25*4 c2:2 | c2:2 c2:.5*4 | g1:2 c2:.25*8 | f1:4" },
          { inst: "bell", vel: 0.3, n: ".:4 | .:4 | .:4 | f5:4" },
        ],
        drums: {
          crash: "X............... | ................ | ................ | X...............",
          taiko: "3.......2....... | 3.......2....... | 3...2...3.2.2.2. | 3...............",
          kick: "X.......x....... | x.......x....... | x...x...x.x.x.x. | X...............",
          vel: 0.47,
        },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    // the cinema fades it out over the title; should anyone hear past the end
    // (the jukebox), it comes round to the Empire rather than the opening card
    loopFrom: 1,
  },
} satisfies Piece;
