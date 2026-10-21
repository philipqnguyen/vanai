// ---------- Moonmere — "Deciding When" ----------
// The imperial academy in exile: the Banded Cloisters, gold tufa ruled with
// blue-grey basalt, on a crescent island round its own round harbour, the
// Mere; quay, two terraces and the knoll stepping up from the water, and over
// all of it the Long Tower, whose louvres were painted shut three hundred
// years ago. Precise, evasive, footnoted: the only people who can read the
// interior's records and the only ones who won't say everything they've read.
// "The order matters. The order has always mattered, for reasons that were
// once reasons." "An archive is not for remembering. An archive is for
// deciding when."
//
// So: chamber music, the one city without a drum kit. 5/4 at 120, always
// grouped 3+2, because the academy's sentences always carry one clause more
// than you expected; F major with the lydian B natural (Fmaj7#11) as the
// secret note, heard in the intro, in footnotes and in the hidden room. The
// melody keeps the rules and the harmony dodges: bar 7's C7 resolves in the
// tune exactly as it should, while the bass slips to D minor underneath — the
// deceptive cadence is the city's manners. Only the sixteenth bar finally
// lands home, and even then a glass footnote adds the B natural afterwards.
//
//   intro  the telescope figure: harp and glass climb F G A B C over a
//          Fmaj7#11 — skipped on the loop
//   A      Academy Court: the theme on piano over a harp ostinato that runs
//          up the chord for three beats and turns for two; glass footnotes
//          after each phrase
//   A'     the theme on flute with the piano an octave under it, a cello
//          counter that moves only where the tune holds, the ostinato now
//          pizzicato — the order matters
//   B      the Mere: B flat major, the warm one — harp rippling, the reed's
//          long harbour tune, the flute answering, a shaker keeping the quay's
//          time
//   C      the Room That Isn't: D minor, quiet — choir, glass, the B natural
//          (Dm6) again, a slow figure up toward the point of sky every
//          telescope still watches; it stops on A7sus4 and dodges to F
//   A''    the Court in Session: the theme's second half, everyone — strings
//          with the tune, flute descant, harp, pizzicato on the 3+2, timpani —
//          and the footnote back onto A
//
// The homesickness is C, and it is curiosity more than grief: the academy
// knows exactly what it is not saying.

import type { Piece } from "./kit.ts";

const bars = (...b: string[]) => b.join(" | ");

/** The theme, 3+2 in every bar. Half-close on bar 4; the deceptive Dm on bar
 *  8; the lydian Bbmaj7#11 on bar 14; home only on bar 16. */
const THEME_CHORDS = `
  F | Bb | Gm7  | C  | F  | Bb         | C7 | Dm |
  F | Bb | Gm11 | C6 | Dm | Bbmaj7s11  | C7 | F `;
const THEME_A = `
  c5 f5 a5 g5:.5 f5:.5 e5         | d5:1.5 e5:.5 f5 bf4:2  |
  g4 bf4 d5 f5:.5 e5:.5 d5        | e5:3 c5:2              |
  c5 f5 a5 g5:.5 f5:.5 e5         | d5:1.5 e5:.5 f5 g5:2   |
  bf5:1.5 a5:.5 g5 e5:.5 f5:.5 g5 | f5:3 d5:2              `;
const THEME_B = `
  c5 f5 a5 g5:.5 f5:.5 e5         | d5:1.5 e5:.5 f5 d6:2   |
  c6 bf5 a5 g5:.5 a5:.5 bf5       | a5:3 g5:2              |
  f5 a5 d6 c6:.5 bf5:.5 a5        | f5:1.5 a5:.5 bf5 e5:2  |
  g5:1.5 f5:.5 e5 d5:.5 e5:.5 c5  | f5:3 .:2               `;
const THEME = THEME_A + " | " + THEME_B;
/** footnotes: two glass notes after a phrase closes; the last is B natural to C */
const FOOTNOTES = `
  .:5 | .:5 | .:5 | .:3 g5 c6  | .:5 | .:5 | .:5 | .:3 a5 d6 |
  .:5 | .:5 | .:5 | .:3 b5 d6  | .:5 | .:5 | .:5 | .:3 b5 c6 `;
/** A' cello: holds while the tune moves, moves (and creeps up) while it holds */
const CELLO = `
  a3:3 g3:2 | f3:3 d3:2 | bf3:3 a3:2 | g3 a3 bf3 c4:2 |
  a3:3 c4:2 | d4:3 bf3:2 | e4:3 c4:2 | d4 e4 f4 a4:2 |
  a3:3 c4:2 | bf3:3 f4:2 | g3:3 d4:2 | c4 d4 e4 g4:2 |
  a3:3 f3:2 | d4:3 e4:2  | c4:3 bf3:2 | a3 bf3 b3 c4:2 `;
/** root on one, fifth on four: the 3+2 in the bass (no engine pattern
 *  plays a fifth on the short group, so the bass is written out) */
const rootFifth = (pairs: string) => pairs.trim().split(/\s+/).map((p) => {
  const [r, f] = p.split("/");
  return `${r}:3 ${f}:2`;
}).join(" | ");
const THEME_BASS = rootFifth(`
  f2/c3 bf1/f2 g2/d2 c2/g2 f2/c3 bf1/f2 c2/g2 d2/a2
  f2/c3 bf1/f2 g2/d2 c2/g2 d2/a2 bf1/f2 c2/g2 f2/c3`);
/** the 3+2 ostinato: up the chord for three beats, a turn for two */
const OSTINATO = "0 1 2 3 2 1 0 2 3 2";

export default {
  title: "Deciding When",
  zones: ["moonmere"],
  note: "chamber music in 5/4 (3+2), no drum kit: the theme on piano, then flute; the deceptive cadence on bar 8 is the city's manners; listen for the glass footnotes, the Mere in B flat, and the hidden room's B natural before the Court in Session",
  song: {
    bpm: 120, beats: 5, space: 2.6,
    sections: [
      // 0 — intro: the telescope figure, F G A B C
      {
        name: "intro",
        chords: "Fmaj7s11 | Fmaj7s11 | Fmaj7s11 | Csus4",
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "swell", vel: 0.6 },
        lead: { inst: "harp", vel: 0.9, n: "f4 g4 a4 b4:2 | c5:5 | .:5 | .:5" },
        counter: { inst: "glass", vel: 0.45, n: ".:5 | .:5 | f5 g5 a5 b5:2 | c6:5" },
      },
      // 1 — A, Academy Court: piano theme, piano ostinato, glass footnotes
      {
        name: "A Academy Court",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.4 }, bass: null,
        lead: { inst: "piano", vel: 0.95, n: THEME },
        counter: { inst: "glass", vel: 0.4, n: FOOTNOTES },
        arp: { inst: "harp", pat: OSTINATO, unit: 0.5, oct: 3, vel: 0.85 },
        parts: [{ inst: "bass", vel: 0.8, n: THEME_BASS }],
      },
      // 2 — A', flute and piano in octaves, the cello counter, pizzicato ticks
      {
        name: "A' Cloister",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.45 }, bass: null,
        lead: { inst: "flute", vel: 1, n: THEME },
        counter: { inst: "strings", vel: 0.85, n: CELLO },
        arp: { inst: "pizz", pat: OSTINATO, unit: 0.5, oct: 3, vel: 1.1 },
        parts: [
          { inst: "piano", oct: -1, vel: 0.55, n: THEME },
          { inst: "bass", vel: 0.9, n: THEME_BASS },
          { inst: "glass", vel: 0.35, n: FOOTNOTES },
        ],
      },
      // 3 — B, the Mere: B flat, harp ripple, the reed's harbour tune
      {
        name: "B the Mere",
        chords: `
          Bb | F/A  | Gm7 | Eb   | Bb  | Dm7     | Eb     | F7 |
          Gm | Dm/F | Eb  | Bb/D | Cm7 | F7sus4  | Ebmaj7 | F `,
        pad: { inst: "strings", vel: 0.45 }, bass: null,
        lead: { inst: "reed", vel: 0.9, n: `
          d5:3 f5:2            | c5:3 a4:2           | bf4:1.5 c5:.5 d5 f5:2 | g5:3 f5 ef5    |
          d5:3 f5:2            | a5:3 f5:2           | g5:1.5 f5:.5 ef5 d5 c5 | c5:3 .:2      |
          bf4 d5 g5 f5 d5      | f5:1.5 e5:.5 d5 a4:2 | g4 bf4 ef5 g5:2      | f5:3 d5:2      |
          ef5 g5 bf5 a5:.5 g5:.5 f5 | bf5:3 a5:2     | g5:1.5 f5:.5 ef5 d5 bf4 | a4:3 .:2 ` },
        counter: { inst: "flute", vel: 0.6, n: `
          .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:3 a5:.5 bf5:.5 c6 |
          d6:3 bf5:2 | a5:5 | bf5:3 g5:2 | bf5:3 f5:2 | g5:3 ef6:2 | ef6:3 c6:2 | bf5:3 g5:2 | .:1 c6 a5 f5:2 ` },
        arp: { inst: "harp", pat: "0 1 2 4 3 4 2 4 3 1", unit: 0.5, oct: 4, vel: 0.75 },
        parts: [{ inst: "bass", vel: 0.85, n: rootFifth(`
          bf1/f2 a1/f2 g2/d2 ef2/bf2 bf1/f2 d2/a2 ef2/bf2 f2/c3
          g2/d2 f2/a2 ef2/bf2 d2/bf2 c2/g2 f2/c3 ef2/bf2 f2/c3`) }],
        // the shaker keeps the 3+2 too: accents on one and four, a ghost into each group
        drums: { shaker: "X.xox.X.xo", vel: 0.5 },
      },
      // 4 — C, the Room That Isn't: D minor, the B natural, toward the sky
      {
        name: "C the Room That Isn't",
        chords: "Dm | Dm6 | Bbmaj7 | Bbmaj7s11 | Gm9 | Dm/A | Em7b5 | A7sus4",
        pad: { inst: "choir", vel: 0.8 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "glass", vel: 0.55, n: "a5:5 | b5:3 a5:2 | f5:5 | e5:5 | d5:3 f5:2 | a5:5 | g5:3 bf5:2 | a5:5" },
        counter: { inst: "flute", vel: 0.45, n: ".:5 | .:5 | d5 e5 f5 a5:2 | e6:5 | .:5 | .:5 | e5 f5 g5 bf5:2 | d6:3 .:2" },
        parts: [{ inst: "harp", vel: 0.55, n: "d3+a3:5 | d3+b3:5 | bf2+f3:5 | bf2+e3:5 | g2+d3:5 | a2+f3:5 | e3+bf3:5 | a2+d3:5" }],
      },
      // 5 — A'', the Court in Session: the theme's second half, everyone
      {
        name: "A'' Court in Session",
        chords: "F | Bb | Gm11 | C6 | Dm | Bbmaj7s11 | C7 | F",
        pad: { inst: "strings", vel: 1.0 }, bass: null,
        lead: { inst: "strings", vel: 1.5, n: THEME_B },
        counter: { inst: "flute", vel: 0.85, n: "a5:3 c6:2 | bf5:3 f6:2 | d6:3 bf5:2 | c6:5 | a5:3 f6:2 | e6:3 d6:2 | c6:3 bf5:2 | a5:5" },
        arp: { inst: "harp", pat: OSTINATO, unit: 0.5, oct: 3, vel: 0.9 },
        hits: { inst: "pizz", pat: "x.....x...", unit: 0.5, oct: 3, vel: 1.0 },
        parts: [
          { inst: "bass", vel: 1.1, n: rootFifth("f2/c3 bf1/f2 g2/d2 c2/g2 d2/a2 bf1/f2 c2/g2 f2/c3") },
          { inst: "timpani", vel: 0.65, n: "f2:3 c2:2 | .:5 | .:5 | c2:3 c2:2 | d2:3 .:2 | .:5 | c2:.25*12 c2:2 | f2!:3 .:2" },
          { inst: "glass", vel: 0.4, n: ".:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:3 b5 c6" },
        ],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
