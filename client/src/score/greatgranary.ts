// ---------- The Great Granary — "Enough to Feed Their City" ----------
// The empire's granary on the Granary Plains, still filling for a city that
// is not there. Forty brick towers stand in two ranks down a loading lane
// like the nave of a basilica, sun falling through the clerestory in shafts
// full of chaff; the harvester sentinels reap, the mill grinds, the count
// sentinels count, and the Granary-Master keeps the provisioning ledger in a
// coffered office with a painted plan of the plains behind the desk. It is
// the most abundant place in the game and the most absurd: three centuries of
// harvests, counted and stacked, for a dinner nobody has come home to.
//
// So the meter is the counting. 7/8, grouped 2+2+3 — "one-two, one-two,
// one-two-three", the tally a counting engine keeps and a thresher's flail
// beats — at an eighth of 252, brisk enough to stride to and lopsided enough
// to grin at. F major, harvest gold: a lute strumming the groups, a rustic
// reed with the tune, a tally bell that rings each bar it counts. Funny first;
// the homesickness is the ledger at the end.
//
//   intro  the tally bell and the lute start the count — skipped on the loop
//   A      the Tally Hall: the harvest tune on the reed, low and rustic, the
//          flute answering at the half-close, pizzicato bass on the groups
//   B      the Mill: D minor, the millstones — spiccato grinding the groups,
//          timpani on the stones, the horn turns the tune's head dark
//   C      the Forty Towers: up to B-flat, the basilica of grain. The strings
//          lay long notes across the lopsided bars like sun across the lane,
//          the choir under them, the harp spilling the groups — the widest
//          and loudest place in the piece
//   D      the Count Floor: the Counting Engine. A piano ticks the tally in
//          eighths with the bells and the count drums, and on every fourth bar
//          the engine recounts — 3+2+2 instead of 2+2+3 — and carries on as if
//          nothing happened
//   A'     the harvest tune with everyone: flute on top, reed in harmony, the
//          horn underneath, the full count in the drums
//   E      the Ledger: the provisioning ledger, enough to feed their city. The
//          choir and the harp, the tune's head slowed in the horn, a glass
//          glint, the count stopped — then the half-close back into A
//
// Each place has its own sound: lute and reed are the harvest, spiccato and
// timpani the mill, strings and choir the towers, piano and bells the engine.

import type { Piece } from "./kit.ts";

/** A bar of the count on the bass: root on the first two groups, the fifth on
 *  the third — the 2+2+3 is in the floor of every section that dances. */
const count = (...bars: [string, string][]) => bars.map(([r, f]) => `${r}:2 ${r}:2 ${f}:3`).join(" | ");

/** The harvest tune (eighths: 2+2+3 in nearly every bar), half-close on C at
 *  bar 8, the answer climbing to the high D and home. */
const HARVEST_CHORDS = `
  F | C/E | Dm7 | Bb | F/A | Gm7 | Bb | C |
  F | C/E | Dm  | Am | Bb  | F/C | C7 | F `;
const HARVEST = `
  c5:2 f5:2 a5:3 | g5:2 e5:2 c5:3 | d5:2 f5:2 a5:2 c6 | bf5:2 a5:2 g5:3 |
  a5:2 c6:2 f5:3 | g5 a5 bf5:2 d5:3 | d5:2 f5:2 bf5 a5 g5 | g5:4 .:3 |
  c5:2 f5:2 a5:3 | g5:2 e5:2 c6:3 | d6:2 c6:2 a5:3 | c6:2 a5:2 e5:3 |
  f5:2 g5:2 bf5:3 | a5:2 g5:2 f5:3 | g5 a5 g5:2 e5 d5 c5 | f5:4 .:3 `;
const HARVEST_BASS = count(
  ["f2", "c3"], ["e2", "c3"], ["d2", "a2"], ["bf1", "f2"], ["a1", "f2"], ["g2", "d3"], ["bf1", "f2"], ["c2", "g2"],
  ["f2", "c3"], ["e2", "c3"], ["d2", "a2"], ["a1", "e2"], ["bf1", "f2"], ["c2", "f2"], ["c2", "g2"], ["f2", "c3"]);
/** A' only: the reed's harmony a third or sixth under the flute */
const HARVEST_HARMONY = `
  a4:2 c5:2 f5:3 | e5:2 c5:2 g4:3 | f4:2 a4:2 f5:2 a5 | d5:2 f5:2 d5:3 |
  f5:2 a5:2 c5:3 | d5 f5 g5:2 bf4:3 | bf4:2 d5:2 f5 f5 d5 | e5:4 .:3 |
  a4:2 c5:2 f5:3 | e5:2 c5:2 g5:3 | f5:2 a5:2 f5:3 | a5:2 e5:2 c5:3 |
  d5:2 d5:2 f5:3 | f5:2 e5:2 c5:3 | e5 f5 e5:2 c5 bf4 g4 | a4:4 .:3 `;

/** the count in the kit: kick on each group, a ghosted snare into the three */
const COUNT_KIT = {
  kick: "x...x...x.....",
  shaker: "x.o.x.o.x.o.o.",
  tom: "..........2...",
};

export default {
  title: "Enough to Feed Their City",
  zones: ["greatgranary"],
  note: "7/8 counted 2+2+3 all the way through; listen for the harvest tune (reed, then flute), the mill's minor in B, the strings' long notes across the bars in the Forty Towers, and the Counting Engine recounting 3+2+2 on every fourth bar of D",
  song: {
    bpm: 252, beats: 7, space: 2.8,
    sections: [
      // 0 — intro: the tally bell, then the lute starts the count
      {
        name: "intro",
        chords: "F | Bb/F | F | C7",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.7 },
        hits: { inst: "lute", pat: "X.x.x..", unit: 1, oct: 3, vel: 0.7 },
        counter: { inst: "bell", vel: 0.35, n: "f5:7 | .:7 | f5:7 | c5:7" },
        parts: [{ inst: "pizz", vel: 0.8, n: ".:7 | .:7 | f3:2 f3:2 c4:3 | c3:2 e3:2 g3 bf3 c4" }],
        drums: { kick: "x...x...x.....", vel: 0.4 },
      },
      // 1 — A, the Tally Hall: the harvest tune on the reed, low and rustic
      {
        name: "A Tally Hall",
        chords: HARVEST_CHORDS,
        pad: { inst: "strings", vel: 0.55 }, bass: null,
        hits: { inst: "lute", pat: "X.x.x..", unit: 1, oct: 3, vel: 0.85 },
        lead: { inst: "reed", oct: -1, vel: 1.3, n: HARVEST },
        // the flute answers the half-close and the cadence, in the tune's own rhythm
        counter: { inst: "flute", vel: 0.55, n: `
          .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:4 c6 d6 e6 |
          .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:4 a5 g5 e5 ` },
        parts: [
          { inst: "pizz", vel: 1.2, n: HARVEST_BASS },
          { inst: "bell", vel: 0.22, n: "f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7" },
        ],
        drums: { ...COUNT_KIT, vel: 0.42 },
      },
      // 2 — B, the Mill: D minor, the stones grinding the groups
      {
        name: "B Mill",
        chords: "Dm | Am | Bb | F | Gm | Dm | Gm7 | F7",
        pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root", vel: 0.65 },
        arp: { inst: "spiccato", pat: "0 0 1 0 0 2 1", unit: 1, oct: 3, vel: 0.78 },
        lead: { inst: "horn", oct: -1, vel: 1.05, n: `
          a4:2 d5:2 f5:3 | e5:2 c5:2 a4:3 | bf4:2 d5:2 f5:2 d5 | c5:4 a4:3 |
          g4:2 bf4:2 d5:3 | f5:2 e5:2 d5:3 | d5:2 bf4:2 g4 a4 bf4 | a4:2 c5:2 ef5:3 ` },
        counter: { inst: "reed", vel: 0.5, n: ".:7 | .:4 e5 d5 c5 | .:7 | .:4 f5 e5 c5 | .:7 | .:4 a5 g5 f5 | .:7 | .:4 c5 d5 ef5" },
        parts: [{ inst: "timpani", vel: 0.5, n: "d2:2 d2:2 a1:3 | a1:2 a1:2 e2:3 | bf1:2 bf1:2 f2:3 | f2:2 f2:2 c2:3 | g1:2 g1:2 d2:3 | d2:2 d2:2 a1:3 | g1:2 g1:2 d2:3 | f2:2 f2:2 c2?:.5*6" }],
        drums: { kick: "x...x...x.....", tom: "..........3.3.", vel: 0.5 },
      },
      // 3 — C, the Forty Towers: B-flat, long notes across the lopsided bars
      {
        name: "C Forty Towers",
        chords: `
          Bb | F/A | Gm  | Eb | Bb/D | Cm7 | F   | F7 |
          Bb | Dm  | Eb  | Cm | Gm   | Eb  | F/C | C7 `,
        pad: { inst: "choir", vel: 1.4 }, bass: { pat: "root", vel: 0.6 },
        arp: { inst: "harp", pat: "0 1 2 0 1 2 3", unit: 1, oct: 4, vel: 0.7 },
        lead: { inst: "strings", vel: 4.5, n: `
          d5:7 | c5:4 a4:3 | bf4:4 d5:3 | g5:7 | f5:4 d5:3 | ef5:4 c5:3 | c5:4 f5:3 | a5:4 ef5:3 |
          d5:4 f5:3 | a5:7 | g5:4 bf5:3 | g5:4 ef5:3 | d5:4 g5:3 | bf5:4 g5:3 | a5:4 f5:3 | e5:4 g5:3 ` },
        counter: { inst: "horn", vel: 1.15, n: `
          f4:7 | f4:7 | d4:7 | ef4:7 | f4:7 | ef4:4 g4:3 | a4:7 | ef4:7 |
          f4:7 | f4:7 | bf4:7 | c5:4 g4:3 | bf4:7 | g4:7 | f4:7 | bf4:4 e4:3 ` },
        parts: [
          { inst: "pizz", vel: 0.8, n: count(
            ["bf2", "f3"], ["a2", "f3"], ["g2", "d3"], ["ef2", "bf2"], ["d2", "bf2"], ["c2", "g2"], ["f2", "c3"], ["f2", "ef3"],
            ["bf2", "f3"], ["d2", "a2"], ["ef2", "bf2"], ["c2", "g2"], ["g2", "d3"], ["ef2", "bf2"], ["c2", "f2"], ["c2", "bf2"]) },
          // the sun through the clerestory: the flute high over the strings in the second half
          { inst: "flute", vel: 0.55, n: ".:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | .:7 | f6:7 | d6:4 f6:3 | ef6:7 | c6:4 g5:3 | bf5:7 | g5:4 bf5:3 | c6:4 a5:3 | bf5:4 c6:3" },
          { inst: "timpani", vel: 0.55, n: "bf1:7 | .:7 | .:7 | ef2:7 | .:7 | .:7 | f2:7 | f2:4 f2:3 | bf1:7 | .:7 | ef2:7 | .:7 | g1:7 | ef2:7 | .:7 | c2:2 c2:2 c2?:.5*6" },
        ],
        drums: { kick: "x...x...x.....", shaker: "x.o.x.o.x.o.o.", vel: 0.38 },
      },
      // 4 — D, the Count Floor: the engine ticks; every fourth bar it recounts
      {
        name: "D Count Floor",
        chords: "F | F | C/E | C | Dm | Bb | C | C7",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root", vel: 0.6 },
        lead: { inst: "piano", vel: 0.62, n: `
          f5 c5 f5 c5 f5 a5 c6 | c6 a5 c6 a5 c6 a5 f5 | e5 c5 e5 c5 g5 e5 c5 | g5 e5 c5 e5:2 g5:2 |
          d5 a4 d5 a4 d5 f5 a5 | bf5 f5 bf5 f5 d5 f5 bf5 | c6 g5 e5 g5 c6:3 | bf5 g5 e5 g5:2 c6:2 ` },
        // the glint in a recount bar lands on its last group (3+2+2: beat 5), not
        // where the 2+2+3 would have put it
        counter: { inst: "glass", vel: 0.3, n: "a5:7 | .:7 | g5:7 | .:5 c6:2 | f5:7 | .:7 | e5:7 | .:5 bf5:2" },
        parts: [
          { inst: "pizz", vel: 0.85, n: "f3:2 c3:2 f3:3 | f3:2 c3:2 a3:3 | e3:2 c3:2 g3:3 | c3:3 g3:2 c4:2 | d3:2 a2:2 d3:3 | bf2:2 f3:2 bf3:3 | c3:2 g3:2 c4:3 | c3:3 g3:2 bf3:2" },
          { inst: "bell", vel: 0.25, n: "c6:7 | .:7 | .:7 | c6:3 .:4 | c6:7 | .:7 | .:7 | c6:3 .:4" },
        ],
        // the count drums: 2+2+3 three bars, then the 3+2+2 recount
        drums: {
          tom: "1...2...3..... | 1...2...3..... | 1...2...3..... | 3.....2...1...",
          kick: "x...x...x..... | x...x...x..... | x...x...x..... | x.....x...x...",
          shaker: "xoxoxoxoxoxoxo",
          vel: 0.45,
        },
      },
      // 5 — A', the harvest tune with everyone
      {
        name: "A' Harvest Home",
        chords: HARVEST_CHORDS,
        pad: { inst: "strings", vel: 0.7 }, bass: null,
        hits: { inst: "lute", pat: "X.x.x..", unit: 1, oct: 3, vel: 0.7 },
        lead: { inst: "flute", vel: 1, n: HARVEST },
        counter: { inst: "reed", vel: 0.6, n: HARVEST_HARMONY },
        parts: [
          { inst: "bass", vel: 0.85, n: HARVEST_BASS },
          { inst: "horn", vel: 0.55, n: "f4:7 | e4:7 | f4:7 | d4:7 | c4:7 | d4:7 | d4:7 | e4:7 | f4:7 | g4:7 | f4:7 | e4:7 | d4:7 | c4:7 | bf3:4 e4:3 | f4:7" },
          { inst: "bell", vel: 0.22, n: "f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7 | f5:7 | .:7 | .:7 | .:7" },
        ],
        drums: { ...COUNT_KIT, snare: "......o.....o.", vel: 0.5, fill: { tom: "1.1.2.2.3.3.3.", every: 8 } },
      },
      // 6 — E, the Ledger: the count stops; enough to feed their city
      {
        name: "E Ledger",
        chords: "Gm7 | Dm | Bbmaj7 | F/A | Gm7 | Am7 | Bb | C",
        pad: { inst: "choir", vel: 0.65 }, bass: { pat: "swell", vel: 0.7 },
        arp: { inst: "harp", pat: "0 1 2 3 . . .", unit: 1, oct: 4, vel: 0.5 },
        lead: { inst: "horn", vel: 0.8, n: `
          d4:2 g4:2 bf4:3 | a4:4 f4:3 | d4:2 f4:2 a4:3 | c5:7 |
          bf4:2 a4:2 g4:3 | e4:2 g4:2 c5:3 | d5:4 bf4:3 | c5:4 e4:3 ` },
        counter: { inst: "glass", vel: 0.3, n: ".:7 | f5:7 | .:7 | a5:7 | .:7 | e5:7 | .:7 | g5:7" },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
