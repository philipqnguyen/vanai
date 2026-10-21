// ---------- The Mausoleum — "The Place Kept Ready" ----------
// Caerdun's doorstep trial, under the Hunting Wood: an imperial tomb that is
// not abandoned but inhabited. Honey-coloured masonry, blue banners, gold
// candlesticks with fresh candles in them, attendants and wardens still on
// duty, and at its heart the Court of the Unreturned — four biers made up with
// folded linen for a household that promised to come back. The Emperors' Vault
// at the end holds the empty imperial bier, made up, the writ lying on it.
// Nobody here is dead. The tomb is waiting for its owners like a guest room.
//
// So not a dirge: a sarabande, the court dance that walks slowly with its
// weight on the second beat — ceremony that still remembers it was a dance.
// 3/4 at 72, D minor (Caerdun's D, in mourning colours), square 16-bar
// periods that half-close on bar 8. The vigil bell is the only clock.
//
//   intro  the vigil bell tolls, the horn intones the head of the theme over
//          the choir — skipped on the loop
//   A      the Processional: the theme on horn, an octave down, harp
//          candlelight under it, the choir as the bed. Ordered and warm.
//   B      the Court of the Unreturned: F major, the column of forest light
//          through the oculus. The flute takes a lighter tune; at each
//          half-close a distant horn sounds the Hunting Wood's own call
//          (c-e-g, the forest above) and glass answers it a bar later — the
//          same echo the Wood plays, heard from underneath. The quietest place.
//   A'     the Long Vigil: the strings sing the theme at pitch, the horn
//          answers below, pizzicato on the dance's second beat, timpani on
//          the period's downbeats
//   C      the Emperors' Vault: B-flat, the horns in pairs over a full choir,
//          the flute high above — the empty bier, made up, honoured — then a
//          timpani roll on the dominant back into the Processional
//
// The haunting is only that the music is dressed for someone who has not come
// yet. The darkness is the minor key, never a cluster or a drone.

import type { Piece } from "./kit.ts";

/** The sarabande theme: up a fifth and lean on beat two, half-close on the
 *  leading tone at bar 8, the answer climbing to the high D and home. */
const THEME_CHORDS = `
  Dm | Gm/D | Dm | A   | Bb | Gm  | Gm6 | A  |
  Dm | Gm   | C  | F   | Bb | Gm  | A7  | Dm `;
const THEME = `
  d5 a5:1.5 g5:.5  | f5 e5:1.5 d5:.5  | f5:.5 g5:.5 a5:2 | e5:3              |
  d5 f5:1.5 e5:.5  | d5 bf4:1.5 a4:.5 | g4 bf4:1.5 d5:.5 | cs5:3             |
  d5 a5:1.5 g5:.5  | bf5 a5:1.5 g5:.5 | e5:.5 f5:.5 g5:2 | a5:2 c6           |
  d6 c6:1.5 bf5:.5 | a5 g5:1.5 f5:.5  | e5 g5:1.5 cs5:.5 | d5:3              `;
/** the horn's answer under the strings in A': long tones, contrary where it can */
const THEME_COUNTER = `
  f4:3 | g4:3 | a4:3 | a4:1.5 g4:1.5 | f4:3 | g4:3 | e4:3 | e4:3 |
  f4:3 | d4:3 | e4:3 | f4:1.5 a4:1.5 | bf4:3 | bf4:1.5 a4:1.5 | a4:1.5 g4:1.5 | f4:3 `;

export default {
  title: "The Place Kept Ready",
  zones: ["mausoleum"],
  note: "a sarabande, weight on beat two: a tomb dressed for guests. Listen for the Hunting Wood's horn call heard from below in B (answered by glass), and the horns in pairs over the choir in the Emperors' Vault",
  song: {
    bpm: 72, beats: 3, space: 3.6,
    sections: [
      // 0 — intro: the vigil bell and the head of the theme
      {
        name: "intro",
        chords: "Dm | Dm | Gm/D | A",
        pad: { inst: "choir", vel: 0.7 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "horn", vel: 0.85, n: "d4 a4:1.5 g4:.5 | f4 e4:2 | d4:1.5 e4:.5 f4 | e4:3" },
        counter: { inst: "bell", vel: 0.42, n: "d5:3 | .:3 | d5:3 | a4:3" },
        parts: [{ inst: "timpani", vel: 0.4, n: ".:3 | .:3 | .:3 | a1?:.25*8 a1:1" }],
      },
      // 1 — A, the Processional: horn an octave down, harp candles, choir bed
      {
        name: "A Processional",
        chords: THEME_CHORDS,
        pad: { inst: "choir", vel: 0.85 }, bass: { pat: "root", vel: 1 },
        lead: { inst: "horn", oct: -1, vel: 1.35, n: THEME },
        arp: { inst: "harp", pat: "0 2 1 2 3 2", unit: 0.5, oct: 4, vel: 0.8 },
        parts: [{ inst: "bell", vel: 0.3, n: "d5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | d5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3" }],
      },
      // 2 — B, the Court of the Unreturned: F major, the light from above
      {
        name: "B Court of the Unreturned",
        chords: `
          F | C/E  | Dm | Am      | Bb  | F/A | Gm7 | C          |
          F | Am/E | Dm | Bbmaj7  | Gm7 | F/A | Bb  | Asus4 A `,
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "swell", vel: 0.6 },
        lead: { inst: "flute", vel: 0.9, n: `
          f5 a5:1.5 c6:.5 | c6 g5:2         | a5 f5:1.5 d5:.5 | e5:3           |
          d5 f5:1.5 bf5:.5 | a5 c6:1.5 a5:.5 | g5 f5:1.5 d5:.5 | e5:2 .:1       |
          f5 a5:1.5 c6:.5 | e6 c6:1.5 a5:.5 | d6 a5:1.5 f5:.5 | d5:2 .:1       |
          bf5 a5:1.5 g5:.5 | a5 f5:1.5 c5:.5 | d5 f5:1.5 g5:.5 | e5 d5:.5 cs5:1.5 ` },
        // the Hunting Wood's call, heard from below at each half-close...
        counter: { inst: "horn", vel: 0.5, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | c4:.5 e4:.5 g4:2 |
          .:3 | .:3 | .:3 | bf3:.5 d4:.5 f4:2 | .:3 | .:3 | .:3 | .:3 ` },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.5 },
        // ...and its echo in glass, a bar late
        parts: [{ inst: "glass", vel: 0.32, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          c5:.5 e5:.5 g5:2 | .:3 | .:3 | .:3 | bf4:.5 d5:.5 f5:2 | .:3 | .:3 | .:3 ` }],
      },
      // 3 — A', the Long Vigil: the strings take the theme, the horn below
      {
        name: "A' Long Vigil",
        chords: THEME_CHORDS,
        pad: { inst: "choir", vel: 0.85 }, bass: { pat: "root", vel: 1.05 },
        lead: { inst: "strings", vel: 2.3, n: THEME },
        counter: { inst: "horn", vel: 0.95, n: THEME_COUNTER },
        arp: { inst: "pizz", pat: "0 . 2 1 . .", unit: 0.5, oct: 3, vel: 1.1 },
        parts: [
          { inst: "timpani", vel: 0.5, n: "d2:3 | .:3 | .:3 | a1:3 | bf1:3 | .:3 | .:3 | a1:3 | d2:3 | .:3 | .:3 | .:3 | bf1:3 | .:3 | a1:1.5 a1:1.5 | d2:3" },
          { inst: "bell", vel: 0.28, n: "d5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | d5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3" },
        ],
      },
      // 4 — C, the Emperors' Vault: B-flat, horns in pairs, the choir full
      {
        name: "C Emperors' Vault",
        chords: "Bb | F/A | Gm | D/F# | Eb | Bb/D | Em7b5 | A7",
        pad: { inst: "choir", vel: 1.2 }, bass: { pat: "oct", vel: 1.1 },
        lead: { inst: "horn", vel: 1.35, n: `
          d4+f4 f4+bf4:1.5 a4+c5:.5   | f4+d5 a4+c5:1.5 f4+a4:.5  |
          g4+bf4 bf4+d5:1.5 d5+g5:.5  | d5+fs5:3                  |
          ef5+g5 c5+f5:1.5 bf4+ef5:.5 | bf4+d5 d5+f5:1.5 f4+bf4:.5 |
          e4+g4 g4+e5:1.5 bf4+d5:.5   | a4+cs5:3 ` },
        counter: { inst: "flute", vel: 0.7, n: "d6:3 | c6:3 | bf5:3 | a5:3 | bf5:3 | bf5:1.5 a5:1.5 | g5:3 | e5:3" },
        arp: { inst: "harp", pat: "0 1 2 3 4 5", unit: 0.5, oct: 3, vel: 0.75 },
        parts: [{ inst: "timpani", vel: 0.7, n: "bf1!:3 | f2:3 | g1:3 | d2:3 | ef2!:3 | d2:3 | e2:3 | a1?:.25*12" }],
      },
    ],
    form: [0, 1, 2, 3, 4], loopFrom: 1,
  },
} satisfies Piece;
