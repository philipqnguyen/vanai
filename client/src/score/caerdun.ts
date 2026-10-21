// ---------- Caerdun — "The Sea Gate Muster" ----------
// The garrison city on the fjord: granite walls, blue slate, blue banners, a
// green-blue sea and a lighthouse on the salient, built by soldiers who were
// locked outside on the night and kept the watch anyway. A city that honours
// terms to the letter gets music that keeps time to the letter: a 4/4 march
// at a walking 96, square 8-bar periods that half-close on bar 4 and pay in
// full on bar 8, and D major, the key a natural horn and a bugle call live in.
// Bright and proud first; the homesickness is one passage in B minor.
//
//   intro  the harbour clock tolls D, a horn gives the muster call (the theme's
//          own first bar), a timpani roll — skipped on the loop
//   A      the Watch: the theme on horn, an octave down, over pizzicato and a
//          snare-led march at half strength. Oom-pah bass.
//   A'     the Muster: brass takes it at pitch, the horn answers below, the
//          march at full strength, timpani on the period's downbeats
//   B, B'  the Harbour: the drill yard gives way to the quay. Up a fourth to G,
//          no snare, a lute picking eighths, the reed sings and the flute
//          answers, a shaker and the clock bell
//   C      the Ledger: B minor, spiccato strings counting eighths (three
//          centuries of wage books, every line kept), a slow horn line that
//          suspends on bar 8 and resolves, timpani building into the return
//   A''    the Gate: everything — brass theme, horn counter, stab chords, the
//          ledger's spiccato, walking bass, a crash and a snare fill
//   coda   the clock again and the muster call, quiet, back onto A's downbeat
//
// Each section has its own palette on purpose: snare and horns are the wall,
// lute and reed are the harbour, spiccato is the ledger, and only the Gate
// brings them together.

import { GROOVES, FILLS, onFirst, type Piece } from "./kit.ts";

/** The theme: a dotted muster call up to the fifth, half-close on A, then the
 *  same call a step higher, paid off on D. Played by A, A' and A''. */
const THEME = `
  a4:.75 a4:.25 d5:1.5 e5:.5 fs5 | g5:1.5 fs5:.5 e5 d5 | fs5 a5 fs5:.75 e5:.25 d5 | e5:3 a4 |
  b4:.75 b4:.25 d5:1.5 e5:.5 fs5 | g5:1.5 a5:.5 b5 g5 | fs5 e5 d5 cs5            | d5:3 . `;
const THEME_CHORDS = "D | G/D | D | A | Bm | G | Em7 A7 | D";
/** the horn's answer under the brass: long tones, contrary to the tune */
const THEME_COUNTER = `
  d4:2 fs4:2 | g4:4 | a4:2 fs4:2 | e4:2 cs4:2 | d4:4 | b3:2 d4:2 | e4:2 g4:2 | fs4:2 a4:2 `;
/** the clock bell's toll and the timpani roll that closes the intro and coda,
 *  so the loop's re-entry and the first entry are the same gesture */
const ROLL = "d2:4 | .:4 | .:4 | a1:.25*12 a1!:1";

export default {
  title: "The Sea Gate Muster",
  zones: ["caerdun"],
  note: "a march that keeps time to the letter; listen for the theme moving horn → brass, the harbour (lute, reed) in G, and the B-minor ledger before the Gate",
  song: {
    bpm: 96, space: 2.4,
    sections: [
      // 0 — intro: clock bell, the muster call, a roll
      {
        name: "intro",
        chords: "D | G/D | D | Asus4 A",
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "swell", vel: 0.8 },
        lead: { inst: "horn", vel: 0.9, n: "a3:.75 a3:.25 d4:1.5 e4:.5 fs4 | g4:3 fs4:.5 e4:.5 | fs4:.75 fs4:.25 a4:1.5 b4:.5 a4 | e4 d4 cs4:2" },
        counter: { inst: "bell", vel: 0.4, n: "d5:4 | d5:4 | d5:4 | a4:4" },
        parts: [{ inst: "timpani", vel: 0.5, n: ROLL }],
      },
      // 1 — A, the Watch: horn an octave down, pizzicato, the march at half strength
      {
        name: "A Watch",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.65 }, bass: { pat: "oct", vel: 0.85 },
        lead: { inst: "horn", oct: -1, vel: 1, n: THEME },
        arp: { inst: "pizz", pat: "0 . 2 . 1 . 2 .", unit: 0.5, oct: 3, vel: 1.2 },
        drums: { ...GROOVES.march, vel: 0.4 },
      },
      // 2 — A', the Muster: brass at pitch, the horn answering below, full march
      {
        name: "A' Muster",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.75 }, bass: { pat: "oct", vel: 1 },
        lead: { inst: "brass", vel: 0.9, n: THEME },
        counter: { inst: "horn", vel: 0.85, n: THEME_COUNTER },
        arp: { inst: "pizz", pat: "0 2 1 2 0 2 1 2", unit: 0.5, oct: 3, vel: 1.1 },
        parts: [{ inst: "timpani", vel: 0.6, n: "d2:2 .:2 | .:4 | .:4 | a1:2 .:2 | b1:2 .:2 | .:4 | .:4 | d2:2 .:2" }],
        drums: { ...GROOVES.march, vel: 0.5, fill: FILLS.pickup },
      },
      // 3 — B, the Harbour: G, lute and reed, no snare
      {
        name: "B Harbour",
        chords: "G | D/F# | Em7 | C | G | Bm7 | C | D",
        pad: { inst: "strings", vel: 0.55 }, bass: { pat: "root", vel: 0.8 },
        lead: { inst: "reed", vel: 0.9, n: `
          b4 d5 g5:1.5 fs5:.5 | e5 d5 a4:2 | b4 d5 e5:1.5 fs5:.5 | g5 e5 c5:2 |
          d5 b4:.5 c5:.5 d5 g5 | fs5:1.5 e5:.5 d5 b4 | c5 e5 g5 e5 | fs5:2 a5 fs5 ` },
        arp: { inst: "lute", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 3, vel: 0.8 },
        parts: [{ inst: "bell", vel: 0.28, n: "g5:4 | .:4 | .:4 | .:4 | g5:4 | .:4 | .:4 | .:4" }],
        drums: { shaker: "x.xox.xox.xox.xo", kick: "x.........x.....", vel: 0.55 },
      },
      // 4 — B', the answer: the flute takes the tune, the reed goes under it
      {
        name: "B' Harbour",
        chords: "G | D/F# | Em7 | C | G/D | C | D7 | G",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.75 },
        lead: { inst: "flute", vel: 0.85, n: `
          g5:1.5 fs5:.5 e5 d5 | a5:1.5 g5:.5 fs5 d5 | e5 g5 b5:1.5 a5:.5 | g5 e5 c5 e5 |
          d5:1.5 e5:.5 g5 b5 | c6:1.5 b5:.5 a5 g5 | fs5 a5 c6 a5 | g5:3 . ` },
        counter: { inst: "reed", vel: 0.6, n: "d4:2 b3:2 | a3:2 d4:2 | e4:2 g4:2 | e4:4 | d4:2 g4:2 | e4:2 c4:2 | d4:2 fs4:2 | g4:4" },
        arp: { inst: "lute", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 3, vel: 0.8 },
        drums: {
          shaker: "x.xox.xox.xox.xo", kick: "x.........x.....", vel: 0.55,
          fill: { tom: "........1.2.3.3.", kick: "x..............." },
        },
      },
      // 5 — C, the Ledger: B minor, counting spiccato, the horn line that suspends
      {
        name: "C Ledger",
        chords: "Bm | G | D/F# | A | Bm | G | Em7 | Asus4 A",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.7 },
        lead: { inst: "horn", vel: 0.8, n: `
          fs4:2 b4:1.5 cs5:.5 | d5:3 b4 | a4:2 fs4 a4 | e4:4 |
          fs4:2 b4:1.5 cs5:.5 | d5:2 e5 fs5 | g5:2 fs5 e5 | d5:2 cs5:2 ` },
        // the flute climbs under the second half and lands on the A with the horn
        counter: { inst: "flute", vel: 0.5, n: ".:4 | .:4 | .:4 | .:4 | fs5:4 | g5:2 a5:2 | b5:4 | a5:4" },
        arp: { inst: "spiccato", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 3, vel: 0.75 },
        parts: [{ inst: "timpani", vel: 0.5, n: "b1:4 | .:4 | .:4 | a1:2 a1:2 | b1:4 | .:4 | e2:2 e2:2 | a1:.25*16" }],
      },
      // 6 — A'', the Gate: the whole garrison
      {
        name: "A'' Gate",
        chords: THEME_CHORDS,
        pad: { inst: "strings", vel: 0.8 }, bass: { pat: "walk", vel: 1 },
        lead: { inst: "brass", vel: 1, n: THEME },
        counter: { inst: "horn", vel: 0.9, n: THEME_COUNTER },
        hits: { inst: "stab", pat: "X..xo..x", unit: 0.5, oct: 3, vel: 0.42 },
        arp: { inst: "spiccato", pat: "0 2 1 2 0 2 1 2", unit: 0.5, oct: 3, vel: 0.8 },
        parts: [{ inst: "timpani", vel: 0.45, n: "d2:2 .:2 | .:4 | .:4 | a1:2 . a1:.5 a1:.5 | b1:2 .:2 | .:4 | e2 . . a1 | d2!:2 .:2" }],
        // the march with the accent on 1 only: beat 3 is where the stabs and the
        // brass already land, and two accents there were the piece's hottest peak
        drums: { ...GROOVES.march, snare: "X..ox.o.x..ox.oo", vel: 0.55, crash: onFirst("X...............", 8), fill: FILLS.snare },
      },
      // 7 — coda: the clock and the muster call, quiet, onto A's downbeat
      {
        name: "coda",
        chords: "G/D | D | Em7 | Asus4 A",
        pad: { inst: "strings", vel: 0.7 }, bass: { pat: "swell", vel: 0.75 },
        lead: { inst: "horn", vel: 0.85, n: "d4:.75 d4:.25 g4:1.5 a4:.5 b4 | a4:4 | g4:2 e4:2 | e4 d4 cs4:2" },
        counter: { inst: "bell", vel: 0.35, n: "d5:4 | a4:4 | b4:4 | a4:4" },
        parts: [{ inst: "timpani", vel: 0.5, n: ROLL }],
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6, 7],
    loopFrom: 1,
  },
} satisfies Piece;
