// ---------- The Summer Lakes — "The Long Afternoon" ----------
// Moonmere's doorstep, the beautiful one: the empire's lakeside resort, three
// lakes in a bowl of terraced villas, a promenade gone charmingly wild, lily
// meres, the boathouse crescent, and the ballroom's dome breaking the surface
// of the western mere with its colonnade marching into the water toward it.
// Eternal late-afternoon gold, water holding the sky. "The zone the trailer is
// shot in. If a player stops walking just to look, it's working."
//
// A resort that still has its ballroom gets a waltz. E major, 3/4 at a lazy
// 132 — slow enough to stroll the promenade to, never fast enough to dance
// properly, the way an afternoon that never ends should feel. Not F and not
// faster on purpose: the Sunken Ballroom under the western mere is the ball
// itself, an F-major waltz at 144, and the lakes above it should sound like
// the same music heard from the promenade — a half-step off and slower —
// rather than the same piece twice. The harp keeps the oom-pah-pah (bass on
// one, the chord on two and three), and the tune is a promenade tune:
// long-short, a leap up and a step down, half-closing on B at bar 8, a minor
// iv (A minor) in bar 12 for the one sigh in the sunshine.
//
//   intro  the harp rising, the flute idling down — skipped on the loop, and
//          played again at the end as the turn back into A
//   A      the Promenade: the waltz on flute, the harp's oom-pah-pah
//   B      the Lily Meres: down a third to C (the dreamiest move a major
//          key has), the piano floating a slower tune over rippling harp
//          eighths, the flute answering only where it holds
//   A'     the Boathouses: the tune on the reed, a horn line underneath, the
//          waltz in pizzicato with a little shaker
//   C      the Ballroom Dome: C-sharp minor, the waltz under water. The tune
//          comes back in the minor on harp, a glass echo a beat behind it, a clock
//          bell, a choir bed — and the pizzicato oom-pah-pah still going, very
//          quietly, for a dance nobody came back to. The homesickness, and
//          the only shade in the piece.
//   A''    Gold: the tune on flute and strings together, the horn line under
//          it, timpani, the whole band in the sun
//
// The harp is the resort and the flute is the afternoon; the minor only ever
// happens underwater.

import { onFirst, type Piece } from "./kit.ts";

/** The promenade tune: half-close on B at bar 8, the iv-minor sigh at bar 12,
 *  home at bar 16. A, A' and A'' play it. */
const PROM_CHORDS = `
  E | Emaj7 | F#m7 | B6    | E   | C#m  | F#7 | B |
  E | Emaj7 | A  | Am7  | E/B | F#m7 | B7 | E `;
const PROM = `
  b4:2 e5 | ds5:2 b4 | cs5:1.5 b4:.5 a4 | gs4:2 fs4 | gs4 b4 e5  | gs5:2 fs5 | e5 ds5 cs5 | ds5:3 |
  b4:2 e5 | ds5:2 b4 | cs5 e5 a5         | g5:2 fs5 | e5 b4 gs4 | a4 cs5 fs5 | ds5:2 fs5 | e5:3 `;
/** the horn under the tune in A' and A'': holding where it moves */
const PROM_HORN = `
  e4:3 | ds4:3 | cs4:3 | ds4:2 b3 | b3:3 | cs4:2 e4 | as3:2 cs4 | b3:3 |
  gs3:3 | ds4:3 | e4:2 cs4 | c4:3 | b3:3 | a3:2 cs4 | ds4:2 a3 | gs3:3 `;
/** oom-pah-pah: the bass takes one, the chord takes two and three */
const PAH = ".xx";

export default {
  title: "The Long Afternoon",
  zones: ["summerlakes"],
  note: "a lazy E-major waltz at 132: the harp is the resort, the flute the afternoon; listen for the drop to C at the Lily Meres and the tune in C-sharp minor under water at the Ballroom Dome",
  song: {
    bpm: 132, beats: 3, space: 3.0,
    sections: [
      // 0 — intro and turn: the harp rising, the flute idling down
      {
        name: "intro / turn",
        chords: "E | Amaj7 | E/B | B7",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.7 },
        arp: { inst: "harp", pat: "0 1 2 3 4 5", unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "flute", vel: 0.75, n: "e5:3 | cs5:2 b4 | gs4:3 | a4:2 ." },
        parts: [{ inst: "glass", vel: 0.3, n: "b5:3 | .:3 | .:3 | .:3" }],
      },
      // 1 — A, the Promenade
      {
        name: "A Promenade",
        chords: PROM_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "root", vel: 0.9 },
        hits: { inst: "harp", pat: PAH, unit: 1, oct: 3, vel: 1 },
        lead: { inst: "flute", vel: 1.05, n: PROM },
        // the reed answers only the two cadences
        counter: { inst: "reed", vel: 0.5, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:1 fs4 b4 |
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:1 b4 gs4 ` },
      },
      // 2 — B, the Lily Meres: C, the piano floats
      {
        name: "B Lily Meres",
        chords: `
          C | F/C | C  | G7 | F     | C/E  | Dm7  | G |
          C | F    | Am | Em  | Fmaj7 | Am7  | Am6  | B7 `,
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.75 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 3, vel: 0.6 },
        lead: { inst: "piano", vel: 0.9, n: `
          g4 c5 e5 | f5:2 e5 | d5:2 c5 | b4:3  | a4 c5 f5 | g5:2 e5 | f5 e5 d5 | d5:3 |
          g4 c5 e5 | a5:2 g5 | e5:2 c5 | b4:3  | a4 c5 e5  | g5:2 e5 | fs5:2 e5    | ds5:3 ` },
        // the flute answers in the held bars; the last one turns the key back to E
        counter: { inst: "flute", vel: 0.5, n: `
          .:3 | .:3 | .:3 | .:1 d5:.5 e5:.5 d5 | .:3 | .:3 | .:3 | .:1 b5:.5 a5:.5 g5 |
          .:3 | .:3 | .:3 | .:1 g5:.5 fs5:.5 e5  | .:3 | .:3 | .:3 | .:1 a5:.5 gs5:.5 fs5 ` },
        parts: [{ inst: "glass", vel: 0.3, n: `
          e6:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          c6:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 ` }],
      },
      // 3 — A', the Boathouses: the reed, the horn under it, pizzicato waltz
      {
        name: "A' Boathouses",
        chords: PROM_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "root", vel: 0.9 },
        hits: { inst: "pizz", pat: PAH, unit: 1, oct: 3, vel: 1.3 },
        lead: { inst: "reed", vel: 1.05, n: PROM },
        counter: { inst: "horn", vel: 0.8, n: PROM_HORN },
        drums: { kick: "x...........", shaker: "....x.x.x.x.", vel: 0.4 },
      },
      // 4 — C, the Ballroom Dome: the waltz under water, in C-sharp minor
      {
        name: "C Ballroom Dome",
        chords: `
          C#m | C#m/B | A     | G#7  | C#m   | F#m    | D#m7b5 | G#7 |
          C#m | C#m/B | Amaj7 | F#m6 | C#m/G# | D#m7b5 | G#7    | B7 `,
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "swell", vel: 0.75 },
        // the dance still going, very quietly
        hits: { inst: "pizz", pat: PAH, unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "harp", vel: 1.1, n: `
          gs4:2 cs5 | b4:2 gs4 | cs5:1.5 b4:.5 a4 | gs4:2 ds4  | e4 gs4 cs5  | cs5:2 a4  | ds5 cs5 a4 | bs4:3 |
          gs4:2 cs5 | b4:2 gs4 | cs5 e5 gs5         | fs5:2 ds5  | e5 cs5 gs4  | fs4 a4 ds5 | ds5:2 bs4  | a4:3 ` },
        // the echo off the dome: a beat behind, an octave up, every other bar
        counter: { inst: "glass", vel: 0.3, n: `
          .:1 gs5:2 | .:3 | .:1 cs6:2 | .:3 | .:1 e5:2 | .:3 | .:1 ds5:2 | .:1 bs5:2 |
          .:1 gs5:2 | .:3 | .:1 cs6:2 | .:3 | .:1 e5:2 | .:3 | .:1 ds5:2 | .:1 a5:2 ` },
        parts: [{ inst: "bell", vel: 0.3, n: `
          cs5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          cs5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 ` }],
      },
      // 5 — A'', Gold: flute and strings together, the horn under them
      {
        name: "A'' Gold",
        chords: PROM_CHORDS,
        pad: { inst: "strings", vel: 0.85 }, bass: { pat: "root", vel: 1 },
        hits: { inst: "harp", pat: PAH, unit: 1, oct: 3, vel: 1.1 },
        lead: { inst: "flute", vel: 1.2, n: PROM },
        counter: { inst: "horn", vel: 0.95, n: PROM_HORN },
        parts: [
          { inst: "strings", vel: 0.75, n: PROM },
          { inst: "timpani", vel: 0.55, n: "e2:3 | .:3 | .:3 | b1:3 | e2:3 | .:3 | .:3 | b1:3 | e2:3 | .:3 | .:3 | .:3 | b1:3 | .:3 | b1:3 | e2:3" },
        ],
        drums: { kick: "x...........", shaker: "....x.x.x.x.", crash: onFirst("x...........", 16), vel: 0.55 },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 0], loopFrom: 1,
  },
} satisfies Piece;
