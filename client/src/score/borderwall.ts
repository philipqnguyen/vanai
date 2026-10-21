// ---------- The Border Wall — "A Road in the Sky" ----------
// The rampart road along the crescent's spine: the wall on the crest, watchtower
// to watchtower, its walk the road; snow-capped peaks below the parapet, the
// snowfields and the frozen tarn on the outer face, pines down the inner slope,
// and the whole interior spread out underneath with one gold point at its
// centre — the capital. Thin bright altitude light. The sentinels patrol
// thickest here, and the embassy has pitched its camp under the great tower.
// "Every screenshot is a banner image." Levels 25-36.
//
// So: broad, high and wide-spaced. 5/4 at 100, every bar a long stride and a
// short one (3+2) — a walk along a wall in the wind, never quite a march.
// E-flat major with the Lydian A natural (the F/Eb in the theme's second bar,
// the D natural over A-flat): the raised fourth is the lift of altitude, the
// floor dropping away. The theme opens on a fifth and climbs to the sixth,
// wide enough to fill the sky; the horn has it alone first, the brass have it
// last. The gold point is a bell: three notes, g-bf-eb, heard in the intro, in
// the gap of the first phrase and again at the end before the loop — the one
// thing in the piece that is looking at the capital. That is the dread, and it
// is a bell in the distance.
//
//   intro  wind in the flute over a pad, and the gold point — skipped on loop
//   A      Rampart Road: the theme on a lone horn over harp and strings; the
//          bell answers the first phrase's gap; half-close on Bb
//   A'     the theme again with the flute above it, home on E-flat
//   B      Snowfields: C minor, the band drops away — the flute high and
//          sparse like wind over the tarn, glass snow, pizzicato in the 3+2,
//          a choir; ends on G, the darker half-close
//   C      the Patrol: the sentinels' tread — taiko and timpani in the 3+2,
//          spiccato, a low brass line in C minor, the edge of the dread;
//          its Bb hands up to the banner
//   A''    Banner: the theme on brass with the horn below and the flute
//          descant, choir, timpani, a crash — the loudest bars
//   D      the Gold Point: the bell over a choir, a far horn, and the loop
//
// Neighbours: the Glassworks below the east stair (7/8, A mixolydian) and the
// Reservoir and the King's Gardens — this is the only one in 5/4, and the
// only one that stands this high.

import { onFirst, type Piece } from "./kit.ts";

/** the theme's opening phrase: a fifth up, the Lydian sixth, a fall, a gap */
const OPEN = "ef4:3 bf4:2 | c5:3 a4:2 | bf4 g4 f4 d4:2 | ef4:3 .:2";
/** ...its half-close (A), climbing to the D natural over Ab */
const HALF = "ef4:3 bf4:2 | c5:3 ef5:2 | ef5 d5 c5 af4:2 | bf4:5";
/** ...and its home (A', A''), the Eb leaning onto D over Bb */
const HOME = "g4:3 c5:2 | ef5:3 c5:2 | ef5:3 d5:2 | ef5:5";
const OPEN_CHORDS = "Eb | F/Eb | Gm7 | Abmaj7";
const HOME_CHORDS = `${OPEN_CHORDS} | Cm7 | Abmaj7 | Bb | Eb`;
/** the gold point: the capital, three notes on a bell */
const GOLD = "g5 bf5 ef6:3";
/** the flute above the theme in A' and A'': long tones, the wind over the wall */
const DESCANT = "g5:5 | a5:5 | bf5:3 a5:2 | g5:5 | g5:3 ef5:2 | c6:3 bf5:2 | bf5:3 af5:2 | g5:5";
/** The bass written out, root on the long stride and the octave on the short
 *  one. Written out when the engine's `oct` still halved the bar, which in 5/4
 *  put the octave on beat 2.5, an eighth ahead of the stride (music.ts
 *  bassSteps now steps 5/4 as 3+2, the same as this). Roots are pitch classes
 *  in the C2 octave. */
const bass32 = (roots: string) =>
  roots.trim().split(/\s*\|\s*/).map((r) => `${r}2:3 ${r}3:2`).join(" | ");
const HOME_BASS = bass32("ef | ef | g | af | c | af | bf | ef");

export default {
  title: "A Road in the Sky",
  zones: ["borderwall"],
  note: "5/4 (3+2), E-flat Lydian: a wide theme horn-first and brass-last; the three-note bell (g-bf-eb) is the gold point, the capital, and the only thing in the piece looking at it",
  song: {
    bpm: 100, beats: 5, space: 3.2,
    sections: [
      // 0 — intro: wind and the gold point. Skipped on the loop.
      {
        name: "intro",
        chords: "Eb | F/Eb",
        pad: { inst: "pad", vel: 0.65 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "bell", vel: 0.4, n: `${GOLD} | .:5` },
        counter: { inst: "flute", vel: 0.4, n: ".:2 bf5:3 | a5:3 g5:2" },
      },
      // 1 — A, Rampart Road: the lone horn
      {
        name: "A Rampart Road",
        chords: "Eb | F/Eb | Gm7 | Abmaj7 | Eb | F/Eb | Ab | Bb",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.85 },
        arp: { inst: "harp", pat: "0 1 2 3 2 1 0 2 3 2", unit: 0.5, oct: 4, vel: 0.6 },
        lead: { inst: "horn", vel: 1.05, n: `${OPEN} | ${HALF}` },
        counter: { inst: "bell", vel: 0.32, n: `.:5 | .:5 | .:5 | ${GOLD} | .:5 | .:5 | .:5 | .:5` },
      },
      // 2 — A', the theme home with the flute above it
      {
        name: "A' Rampart Road",
        chords: HOME_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: null,
        arp: { inst: "harp", pat: "0 1 2 3 2 1 0 2 3 2", unit: 0.5, oct: 4, vel: 0.6 },
        lead: { inst: "horn", vel: 1.05, n: `${OPEN.replace("ef4:3 .:2", "ef4:3 g4 bf4")} | ${HOME}` },
        counter: { inst: "flute", vel: 0.5, n: DESCANT },
        parts: [
          { inst: "timpani", vel: 0.4, n: "ef2:5 | .:5 | .:5 | .:5 | c2:5 | .:5 | bf1:.25*20 | ef2:5" },
          { inst: "bass", vel: 0.81, n: HOME_BASS },
        ],
        drums: { kick: "x...........x.......", vel: 0.35 },
      },
      // 3 — B, Snowfields: C minor, wind over the tarn
      {
        name: "B Snowfields",
        chords: "Cm | Ab | Eb | Bb | Cm | Ab | Fm | G",
        pad: { inst: "choir", vel: 0.5 }, bass: { pat: "swell", vel: 0.65 },
        arp: { inst: "pizz", pat: "0 . 2 1 . 2 . 1 2 .", unit: 0.5, oct: 3, vel: 0.9 },
        lead: { inst: "flute", vel: 0.85, n: "g5:3 ef5:2 | c5:5 | bf4:3 g5:2 | f5:5 | g5:3 c6:2 | af5:3 g5:2 | f5:3 af5:2 | g5:3 d5:2" },
        // snow: the glass catches the flute's held notes
        counter: { inst: "glass", vel: 0.3, n: ".:5 | .:3 ef6:2 | .:5 | .:3 d6:2 | .:5 | .:3 c6:2 | .:5 | .:3 b5:2" },
        parts: [{ inst: "horn", vel: 0.45, n: "c4:5 | c4:5 | bf3:5 | bf3:5 | c4:5 | c4:5 | c4:5 | b3:5" }],
      },
      // 4 — C, the Patrol: the sentinels' tread in the 3+2
      {
        name: "C Patrol",
        chords: "Cm | Cm/Bb | Ab | G | Cm | Cm/Bb | Ab | Bb",
        pad: { inst: "strings", vel: 0.55 }, bass: null,
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1 2 1 2 1", unit: 0.5, oct: 3, vel: 0.75 },
        lead: { inst: "brass", vel: 0.75, n: "c4:3 g4:2 | ef4 d4 c4 g3:2 | af3 c4 ef4 af4:2 | g4:3 b3:2 | c4:3 g4:2 | bf4:3 g4:2 | af4 g4 f4 ef4:2 | d4:3 f4:2" },
        counter: { inst: "choir", vel: 0.4, n: "g4:5 | g4:5 | af4:5 | g4:5 | g4:5 | g4:5 | af4:5 | f4:5" },
        parts: [
          { inst: "timpani", vel: 0.5, n: "c2:3 g1:2 | c2:3 g1:2 | af1:3 ef2:2 | g1:3 d2:2 | c2:3 g1:2 | bf1:3 g1:2 | af1:3 ef2:2 | bf1:.25*20" },
          { inst: "bass", vel: 0.81, n: bass32("c | bf | af | g | c | bf | af | bf") },
        ],
        drums: { taiko: "3...........2.......", tom: "........2.......2.2.", vel: 0.55 },
      },
      // 5 — A'', Banner: the brass have the theme
      {
        name: "A'' Banner",
        chords: HOME_CHORDS,
        pad: { inst: "choir", vel: 0.8 }, bass: null,
        arp: { inst: "harp", pat: "0 1 2 3 2 1 0 2 3 2", unit: 0.5, oct: 4, vel: 0.55 },
        lead: { inst: "brass", vel: 1, n: `${OPEN.replace("ef4:3 .:2", "ef4:3 g4 bf4")} | ${HOME}` },
        counter: { inst: "horn", vel: 0.8, n: "bf3:3 g3:2 | a3:5 | d4:3 bf3:2 | c4:5 | ef4:3 g4:2 | af4:3 ef4:2 | f4:3 d4:2 | ef4:5" },
        parts: [
          { inst: "flute", vel: 0.5, n: DESCANT },
          { inst: "strings", vel: 0.5, n: "g4:5 | a4:5 | bf4:5 | c5:5 | c5:5 | c5:5 | d5:5 | bf4:5" },
          { inst: "timpani", vel: 0.45, n: "ef2:5 | f2:5 | g2:5 | af1:5 | c2:5 | af1:5 | bf1:.25*20 | ef2:5" },
          { inst: "bass", vel: 0.95, n: HOME_BASS },
        ],
        drums: { kick: "x...........x.......", taiko: "3...................", crash: onFirst("x...................", 8), vel: 0.5 },
      },
      // 6 — D, the Gold Point: the bell, a far horn, back to the road
      {
        name: "D Gold Point",
        chords: "Eb | Abmaj7 | Fm7 | Bb",
        pad: { inst: "choir", vel: 0.55 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "bell", vel: 0.4, n: `${GOLD} | .:5 | f5 af5 c6:3 | .:5` },
        counter: { inst: "horn", vel: 0.6, n: "ef4:5 | ef4:5 | c4:5 | ef4:3 d4:2" },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
