// ---------- The Capital of Vanai, returned — "This Morning First" ----------
// The living city, for a character who has stood in the Morning: the same
// Colonnade City as the empty one — limestone arcades under one cornice,
// verdigris domes, the gold crown on the palace lantern — with the shutters
// open, awnings and goods under the arcades, washing across the back lanes,
// the three courts' banners on the palace steps, the stone-player's move made
// at last, and every window, lamp and dome lantern lit at night. For the
// returned it has been one evening; for everyone outside, three hundred years.
// The why is deferred: "Not yet. Let us have this morning first," with one
// glance at the empty point of sky every telescope in Moonmere still watches.
//
// So this is the empty city's music with the people back in it. The Household
// theme (score/capital.ts, "The Table Is Set": a sarabande in F, 3/4 at 88,
// played by too small a band to a court with nobody in it) becomes the dance
// it was written for: a minuet at 120, up a step into G, with the full band it
// was always waiting for. The bells — silent in the empty city but for the
// archive clock — ring in the intro, at the theme's two halves and in the coda.
// The theme is the same notes, so a player who has walked the empty city
// hears the same tune come back alive.
//
//   intro  every bell in the city, change-ringing over G, a timpani roll —
//          skipped on the loop
//   A      the Morning: the Household theme on flute, then on the reed for its
//          second half (morning music trades its tune between the two), harp,
//          pizzicato on the minuet's two and three, the horn's long line under
//          it, a bell at each half
//   B      the Market Square: C major, a market tune of the city's own on the
//          reed over a lute oom-pah-pah, a hand drum and shaker, the flute
//          tossing fills into the held notes
//   B'     the Three Courts: the courts' banners hang on the palace steps and
//          their tunes turn up in the square — Caerdun's muster call on horn,
//          Heartwood's greeting on flute (its own A dorian, here over the
//          market's A minor), Moonmere's head on piano (with its lydian E over
//          B flat) — and Caerdun and Heartwood settle the market tune's
//          cadence with the reed, while Moonmere's piano declines to commit
//   C      Not Yet: E minor, the quiet bars — a string line for the census
//          that kept everyone outside on the household rolls (a comfort or an
//          outrage; the music will not say which), then Moonmere's telescope
//          figure on glass, climbing to a held D over D7sus4, and the horn
//          softly anticipating the theme's first two bars over the dominant
//   A'     the Great Stair: the theme with everyone — brass, flute and strings,
//          the horn line, harp, timpani, the bells, a crash on the one
//   coda   the bells again, quieter, onto A's downbeat
//
// Sunlit and full first; the homesickness is C, and it is the outside's, not
// the city's.

import { onFirst, type Piece } from "./kit.ts";

/** The Household theme from score/capital.ts, transposed F -> G and unchanged
 *  otherwise: short-long, a half-close on bar 8, the answer up to the E, home
 *  on bar 16. A and A' play it. */
const THEME_CHORDS = `
  G | D/F# | Em | Bm | C    | G/B | Am7 | D |
  G | D/F# | Em | C  | G/D  | Am  | D7  | G `;
const THEME_1 = `d5 g5:2 | fs5 a5:2 | b5:1.5 a5:.5 g5 | fs5:2 d5 | e5 c6:2 | b5 g5:2 | a5:1.5 g5:.5 fs5 | a5:3`;
const THEME_2 = `d5 g5:2 | fs5 a5:2 | b5:1.5 c6:.5 d6 | e6:2 c6 | d6:1.5 b5:.5 g5 | c6 a5:2 | a5:1.5 fs5:.5 d5 | g5:3`;
const THEME = `${THEME_1} | ${THEME_2}`;
const REST8 = ".:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3";
/** the empty city's horn line (its A'), transposed with the theme */
const HORN = `
  b3:3 | a3:3 | g3:3 | fs3:3 | g3:3 | g3:3 | c4:3 | a3:1.5 fs3:1.5 |
  b3:3 | d4:3 | e4:3 | e4:3  | d4:3 | c4:3 | c4:3 | b3:3 `;
/** change-ringing: six bells in rounds, then two changes — the city's bells
 *  all going at once for the first time in three hundred years */
const PEAL = `
  g5:.5 fs5:.5 e5:.5 d5:.5 c5:.5 b4:.5 |
  fs5:.5 g5:.5 d5:.5 e5:.5 b4:.5 c5:.5 |
  g5:.5 e5:.5 fs5:.5 c5:.5 d5:.5 b4:.5 `;

/** the market's tune: a lilting ländler, half-close on bar 8 */
const MARKET_CHORDS = `
  C | C   | F | C | Dm7 | C/E  | Dm7 | G7 |
  C | Am  | F | C | F   | C/G  | G7  | C `;
const MARKET = `
  e5:.5 f5:.5 g5 c5   | e5:2 c5 | a5:.5 g5:.5 f5 a5 | g5:2 e5 |
  f5:.5 e5:.5 d5 f5   | e5:.5 d5:.5 c5 e5 | d5:.5 c5:.5 b4 a4 | b4:2 g4 |
  e5:.5 f5:.5 g5 c6   | a5:2 e5 | f5:.5 g5:.5 a5 c6 | g5:2 e5 |
  a5:.5 g5:.5 f5 a5   | g5:.5 f5:.5 e5 g5 | f5 d5 b4 | c5:3 `;
const MARKET_KIT = { tom: "2.......1...", shaker: "x.x.x.x.x.x.", vel: 0.6 };

export default {
  title: "This Morning First",
  zones: ["capitalreturned"],
  note: "the empty Capital's Household theme (capital.ts) come alive: a minuet in G with the full band and the bells; the market in C, where the three courts' tunes turn up (Caerdun's horn call, Heartwood's greeting, Moonmere's head); the quiet bars (C) are the census and the glance at the sky",
  song: {
    bpm: 120, beats: 3, space: 3.0,
    sections: [
      // 0 — intro: every bell in the city
      {
        name: "intro",
        chords: "G | G | C/G | D7sus4",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "bell", vel: 0.42, n: `${PEAL} | d5:3` },
        counter: { inst: "horn", vel: 0.7, n: "d4:3 | d4:3 | e4:3 | d4:3" },
        parts: [{ inst: "timpani", vel: 0.5, n: "g1:3 | .:3 | .:3 | d2?:.25*12" }],
      },
      // 1 — A, the Morning: flute, then reed; harp, pizzicato two-three, horn
      {
        name: "A the Morning",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.45 }, bass: { pat: "root", vel: 0.75 },
        lead: { inst: "flute", vel: 1, n: `${THEME_1} | ${REST8}` },
        counter: { inst: "reed", vel: 0.95, n: `${REST8} | ${THEME_2}` },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.6 },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 3, vel: 0.85 },
        parts: [
          { inst: "horn", vel: 0.6, n: HORN },
          { inst: "bell", vel: 0.3, n: `g5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | g5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3` },
        ],
      },
      // 2 — B, the Market Square: the city's own tune, in C
      {
        name: "B Market Square",
        chords: MARKET_CHORDS,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.9 },
        lead: { inst: "reed", vel: 1.1, n: MARKET },
        counter: { inst: "flute", vel: 0.55, n: `
          .:3 | .:1 g5:.5 a5:.5 g5 | .:3 | .:1 c6:.5 d6:.5 c6 | .:3 | .:3 | .:3 | .:1 d6:.5 b5:.5 g5 |
          .:3 | .:1 c6:.5 b5:.5 a5 | .:3 | .:1 e6:.5 d6:.5 c6 | .:3 | .:3 | .:3 | .:3 ` },
        hits: { inst: "lute", pat: ".xx", unit: 1, oct: 3, vel: 0.9 },
        drums: MARKET_KIT,
      },
      // 3 — B', the Three Courts: each court's tune turns up in the square
      {
        name: "B' Three Courts",
        chords: `
          C | C   | Dm7 | G   | Am | Em  | G  | Am |
          F | C/E | Bb  | C7  | F  | C/G | G7 | C `,
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.9 },
        // Caerdun's muster call (its 4-3 suspension over C), then the cadence
        lead: { inst: "horn", vel: 1, n: `
          g4:.75 g4:.25 c5:1.5 d5:.5 | e5 f5:1.5 e5:.5 | d5 c5:2 | g4:3 |
          ${".:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3"} |
          f4:3 | e4:3 | d4:2 f4 | e4:3 ` },
        // Heartwood's greeting, at the pitch Heartwood's own flute plays it
        counter: { inst: "flute", vel: 0.9, n: `
          .:3 | .:3 | .:3 | .:3 |
          e5 a5 a5 | b5:2 c6 | d6 c6 b5 | a5:3 |
          .:3 | .:3 | .:3 | .:3 |
          c6:3 | c6:3 | b5:3 | c6:3 ` },
        hits: { inst: "lute", pat: ".xx", unit: 1, oct: 3, vel: 0.9 },
        parts: [
          // Moonmere's head, re-barred into the minuet, the lydian E over B flat kept
          { inst: "piano", vel: 0.85, n: `
            ${REST8} |
            c5 f5 a5 | g5:.5 f5:.5 e5:2 | d5:1.5 e5:.5 f5 | bf4:3 |
            .:3 | .:3 | .:3 | .:3 ` },
          // and the market, who were here first, take the cadence back
          { inst: "reed", vel: 0.9, n: `
            ${REST8} | .:3 | .:3 | .:3 | .:3 |
            a5:.5 g5:.5 f5 a5 | g5:.5 f5:.5 e5 g5 | f5 d5 b4 | c5:3 ` },
        ],
        drums: MARKET_KIT,
      },
      // 4 — C, Not Yet: the census, and the glance at the sky
      {
        name: "C Not Yet",
        chords: `
          Em    | C         | G   | D/F# | Em  | Am7       | B7sus4  | B7 |
          Cmaj7 | Cmaj7s11  | G/B | Em   | Am7 | Cmaj7s11  | D7sus4  | D7 `,
        pad: { inst: "choir", vel: 0.6 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "strings", vel: 1.5, n: `
          b4:2 e5 | g5:1.5 fs5:.5 e5 | d5:2 b4 | a4:3 | b4:2 e5 | g5:1.5 a5:.5 e5 | e5:2 fs5 | ds5:3 |
          e4:3 | fs4:3 | d4:3 | e4:3 | e4:3 | fs4:3 | g4:3 | fs4:3 ` },
        // Moonmere's telescope figure, which here is simply in the key
        counter: { inst: "glass", vel: 0.5, n: `
          ${REST8} |
          c5 d5 e5 | fs5:2 g5 | b5:3 | .:3 | e5 fs5 g5 | b5:3 | d6:3 | c6:2 .:1 ` },
        arp: { inst: "harp", pat: "0 1 2", unit: 1, oct: 3, vel: 0.5 },
        parts: [
          // the theme's first two bars, softly, over the dominant: not yet
          { inst: "horn", vel: 0.6, n: `${REST8} | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | d4 g4:2 | fs4 a4:2` },
        ],
      },
      // 5 — A', the Great Stair: the theme with everyone
      {
        name: "A' Great Stair",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 1.0 }, bass: { pat: "root", vel: 1.05 },
        lead: { inst: "brass", oct: -1, vel: 0.95, n: THEME },
        counter: { inst: "horn", vel: 0.85, n: HORN },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 4, vel: 0.6 },
        hits: { inst: "pizz", pat: ".xx", unit: 1, oct: 3, vel: 1.2 },
        parts: [
          { inst: "flute", vel: 0.85, n: THEME },
          { inst: "strings", vel: 1.3, n: THEME },
          { inst: "timpani", vel: 0.55, n: `
            g1!:3 | .:3 | e2:3 | .:3 | c2:3 | .:3 | d2:3 | d2?:.25*12 |
            g1!:3 | .:3 | e2:3 | .:3 | d2:3 | .:3 | d2:1.5 d2:1.5 | g1!:3 ` },
          { inst: "bell", vel: 0.35, n: `g5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | g5:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | g4:3` },
        ],
        drums: { kick: "x...........", crash: onFirst("X...........", 8), vel: 0.45 },
      },
      // 6 — coda: the bells, quieter, onto A
      {
        name: "coda",
        chords: "C | G/B | Am7 | D7sus4",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "swell", vel: 0.7 },
        lead: { inst: "bell", vel: 0.32, n: `${PEAL} | d5:3` },
        counter: { inst: "horn", vel: 0.6, n: "e4:3 | d4:3 | c4:3 | c4:2 a3" },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
