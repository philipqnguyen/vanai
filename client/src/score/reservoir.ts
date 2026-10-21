// ---------- The Reservoir — "The Held Mirror" ----------
// The valley the empire drowned on purpose: ridge walls either side, the great
// dam ruled across the south, and in between a lake so still that every
// vertical is doubled — the drowned village's roofs and steeple breaking the
// surface, the Bell Tower standing out of the water at the end of the joint
// camp's boardwalk. Still, windless light, mist at dawn. It is the merged
// story's first shared ground, where the three cities' players arrive by
// three roads and meet; and the bell that has rung the hours for three
// centuries for nobody turns out not to be broken. It is counting.
//
// So the piece is a mirror. B-flat major, 4/4 at a still 72, and a theme whose
// second two bars are the first two reflected — the same intervals turned
// upside down about the B-flat, rising where they fell — so the tune stands on
// its own reflection the way the steeples do. The intro plays the reflection
// first, before the thing it reflects: you see the water before the tower.
//
//   intro  the bell strikes the hour; mist (choir, glass); the reflected half
//          of the theme on the piano — skipped on the loop
//   A      the Held Mirror: the theme on piano over a rippling harp
//   A'     Steeples Doubled: the flute takes it, the piano moves against it
//          in contrary motion — in bar 4 the two lines cross on G, meeting at
//          the surface like a spire and its reflection
//   B      the Drowned Village: G minor, a low reed over tiptoeing pizzicato,
//          a drowned bell, a horn murmuring under the water
//   C      the Joint Camp: E-flat, the first drums, a lute strumming, and the
//          three cities passing the theme hand to hand — the horn (Caerdun)
//          plays it, the reed (Heartwood) plays its reflection, the flute
//          (Moonmere) the answer, and all three close it together. The
//          warmest and loudest passage.
//   D      the Bell Counts: a pedal under a choir, the flute floating, and a
//          bell on F whose strokes come closer together bar by bar (4, 4, 3,
//          3, 2, 2, 1½, 1½, 1, 1, 1, 1 beats) — the changed peal, the
//          intervals shortening. It never gets louder; it only gets nearer.
//          The one edge of dread, and it resolves.
//   A''    Morning on the Water: the theme on flute and strings, the piano's
//          contrary line, the bell striking the hour once as if nothing were
//          counting at all
//
// The piano is the water and the bell is the tower; only the camp has drums,
// because only the camp has people.

import type { Piece } from "./kit.ts";

/** The theme: bars 3-4 are bars 1-2 inverted about B-flat (bf d f | ef d c
 *  becomes bf g ef | f g a), a half-close on F, the answer, home on bar 8. */
const MIRROR_CHORDS = "Bb | F/A | Ebmaj7 | F | Gm | Ebmaj7 | Cm7 F | Bb";
const MIRROR = `
  bf4:1.5 d5:.5 f5:2 | ef5 d5 c5:2 | bf4:1.5 g4:.5 ef4:2 | f4 g4 a4:2 |
  d5:1.5 ef5:.5 f5 g5 | bf5:2 g5 ef5 | d5 c5 a4 c5 | bf4:4 `;
/** the piano against the flute in A' and A'': contrary motion, crossing the
 *  tune on G in bar 4 (a4 g4 f4 against f4 g4 a4) */
const CONTRARY = `
  d4:2 f4:2 | c4:2 a3:2 | g4:2 bf4:2 | a4 g4 f4:2 |
  bf3:2 d4:2 | ef4:2 bf3:2 | g4:2 f4:2 | f4:2 d4:2 `;
/** ripples: chord tones climbing in staggered steps */
const RIPPLE = "0 2 1 3 2 4 3 5";

export default {
  title: "The Held Mirror",
  zones: ["reservoir"],
  note: "B-flat at 72: the theme's bars 3-4 are bars 1-2 upside down (the reflection); the three cities pass it hand to hand at the Joint Camp, and in the Bell Counts the bell's strokes come closer together without getting louder",
  song: {
    bpm: 72, space: 3.6,
    sections: [
      // 0 — intro: the hour, the mist, the reflection before the thing it reflects
      {
        name: "intro",
        chords: "Bb | Gm | Ebmaj7 | F",
        pad: { inst: "choir", vel: 0.55 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "piano", vel: 0.8, n: ".:4 | .:4 | bf4:1.5 g4:.5 ef4:2 | f4 g4 a4:2" },
        parts: [
          { inst: "bell", vel: 0.4, n: "bf4:4 | .:4 | bf4:4 | .:4" },
          { inst: "glass", vel: 0.3, n: ".:2 d6:2 | .:2 bf5:2 | .:4 | .:4" },
        ],
      },
      // 1 — A, the Held Mirror: piano over rippling harp
      {
        name: "A Held Mirror",
        chords: MIRROR_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "swell", vel: 0.8 },
        arp: { inst: "harp", pat: RIPPLE, unit: 0.5, oct: 3, vel: 0.65 },
        lead: { inst: "piano", vel: 1, n: MIRROR },
        // glints where each half of the phrase comes to rest
        counter: { inst: "glass", vel: 0.3, n: ".:4 | .:2 c6:2 | .:4 | .:2 a5:2 | .:4 | .:2 g5:2 | .:4 | .:2 d6:2" },
        parts: [{ inst: "bell", vel: 0.3, n: "bf4:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4" }],
      },
      // 2 — A', Steeples Doubled: flute and the piano's contrary line
      {
        name: "A' Steeples Doubled",
        chords: MIRROR_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "oct", vel: 0.8 },
        arp: { inst: "harp", pat: RIPPLE, unit: 0.5, oct: 3, vel: 0.6 },
        lead: { inst: "flute", vel: 1, n: MIRROR },
        counter: { inst: "piano", vel: 0.75, n: CONTRARY },
      },
      // 3 — B, the Drowned Village: G minor, under the surface
      {
        name: "B Drowned Village",
        chords: "Gm | Eb | Cm | D | Gm | Eb | Am7b5 D7 | D7",
        pad: { inst: "choir", vel: 0.5 }, bass: { pat: "root", vel: 0.75 },
        arp: { inst: "pizz", pat: "0 . 2 . 1 . 2 .", unit: 0.5, oct: 3, vel: 1.1 },
        lead: { inst: "reed", vel: 0.9, n: `
          g4:2 bf4 a4 | g4:1.5 f4:.5 ef4:2 | c4 ef4 g4 bf4 | a4:4 |
          d5:2 c5 bf4 | c5:1.5 bf4:.5 g4:2 | a4 c5 fs4 a4  | g4:2 fs4:2 ` },
        counter: { inst: "horn", vel: 0.45, n: "g3:4 | g3:4 | g3:2 ef3:2 | fs3:4 | g3:4 | g3:2 bf3:2 | c4:2 a3:2 | d4:2 c4:2" },
        parts: [{ inst: "bell", vel: 0.25, n: "g4:4 | .:4 | .:4 | .:4 | g4:4 | .:4 | .:4 | .:4" }],
      },
      // 4 — C, the Joint Camp: three cities, one theme, hand to hand
      {
        name: "C Joint Camp",
        chords: "Eb | Bb/D | Ab | Bb | Cm | Ab | Fm7 Bb | Eb",
        pad: { inst: "strings", vel: 0.85 }, bass: { pat: "walk", vel: 0.9 },
        hits: { inst: "lute", pat: "x-x.x-x.", unit: 0.5, oct: 3, vel: 0.65 },
        // Caerdun: the theme
        lead: { inst: "horn", vel: 1.1, n: "ef4:1.5 g4:.5 bf4:2 | af4 g4 f4:2 | c4:4 | d4:4 | ef4:4 | c4:4 | c4:2 d4:2 | ef4:4" },
        // Heartwood: its reflection
        counter: { inst: "reed", vel: 0.95, n: ".:4 | .:4 | ef5:1.5 c5:.5 af4:2 | bf4 c5 d5:2 | g4:4 | af4:4 | af4:2 af4:2 | g4:4" },
        parts: [
          // Moonmere: the answer, then all three close it
          { inst: "flute", vel: 0.95, n: ".:4 | .:4 | .:4 | .:4 | g5:1.5 af5:.5 bf5 c6 | ef6:2 c6 af5 | af5 f5 d5 f5 | ef5:4" },
        ],
        drums: { kick: "x.......x.......", tom: "..............2.", shaker: "x.x.x.x.x.x.x.x.", vel: 0.55 },
      },
      // 5 — D, the Bell Counts: the strokes come closer, never louder
      {
        name: "D Bell Counts",
        chords: "Gm | Gm/F | Ebmaj7 | Ebmaj7 | Cm7 | Cm7 | Am7b5 | Fsus4 F",
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "pedal", vel: 0.55 },
        lead: { inst: "flute", vel: 0.8, n: "d5:4 | c5:2 bf4:2 | g5:4 | f5:2 d5:2 | ef5:4 | d5:2 c5:2 | c5:2 a4:2 | bf4:2 a4:2" },
        parts: [
          { inst: "bell", vel: 0.38, n: "f5:4 | f5:4 | f5:3 f5 | .:2 f5:2 | f5:2 f5:2 | f5:1.5 f5:1.5 f5 | f5 f5 f5 f5 | f5:4" },
          { inst: "glass", vel: 0.25, n: "d6:4 | .:4 | .:4 | .:4 | c6:4 | .:4 | .:4 | .:4" },
        ],
      },
      // 6 — A'', Morning on the Water: flute and strings, the bell strikes once
      {
        name: "A'' Morning on the Water",
        chords: MIRROR_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "oct", vel: 0.9 },
        arp: { inst: "harp", pat: RIPPLE, unit: 0.5, oct: 3, vel: 0.7 },
        lead: { inst: "flute", vel: 1.05, n: MIRROR },
        counter: { inst: "piano", vel: 0.8, n: CONTRARY },
        parts: [
          { inst: "strings", vel: 0.5, n: MIRROR },
          { inst: "bell", vel: 0.32, n: "bf4:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4 | .:4" },
        ],
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
