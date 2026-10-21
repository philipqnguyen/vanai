// ---------- Field battle — "Stake Your Claim" ----------
// Every wild zone, road and city fights to this, so it has three jobs: hit
// from the first bar (it cuts into whatever was playing), sit in a key any field
// theme can hand over to, and still sound like the game around it — a race for
// a sunlit province with a charter in your pocket, exciting rather than grim,
// slow enough to argue about loot mid-swing.
//
//   * E dorian at 168. The raised sixth (C#, the A-major chord in bar 4) is the
//     grin in a minor key; the C-major bar straight after it is the swagger.
//     Its chords (Em D C G A) are common ground with most keys a field theme
//     might sit in, so the cut lands as a change of gear, not of world.
//   * The rhythm is the identity: 3+3+2 eighths in every A bar — kick, brass
//     stabs, spiccato accents and the hook all lean on it — so the piece reads
//     as a stride, not a march, from bar one.
//   * The hook (brass, b4 e5 f#5 | g5 f#5 d5) is a fourth leap and a turn, the
//     part someone hums walking back to town. Horn answers it in the gaps.
//   * B lifts to the relative-major side (C D G Em) under a long string line on
//     half-time drums, then B' gives the same tune to the brass on a two-step —
//     the same melody twice, the second time charging.
//   * The breakdown is the one warm turn: a reed variation on the hook over
//     taiko and lute, then a two-part climb (4 bars of taiko and timpani, 4 of
//     the full kit) that runs straight back into the hook.
//
// Intro: two bars of hits and a snare run, skipped on loop. Loop: A A' B B' A'
// C C'a C'b, 56 bars at 1.43 s = 80 s.
//
// Levels: the kit is peaky and the engine's compressor answers its low end, so
// louder drums bought peaks, not loudness. The weight comes from the held voices
// instead — strings, bass and the brass hook carry it, the stabs sit a touch
// under — which lands at the old field battle's -13.2 LUFS, 2 LU over the field
// pilots, with the peak still under the -1.5 dBFS knee.

import { FILLS, GROOVES, onFirst, type Piece } from "./kit.ts";
import type { Drums } from "../music";

// The spiccato engine. Eighths: accents on 1 and the "and" of 2 — the first two
// legs of the 3+3+2 that the rest of the band follows. The third leg lands on
// beat 4 with the snare, so the strings and stabs leave it to the drum: three
// accents stacked on one sixteenth were the mix's only peaks. Sixteenths: the
// same accents at double density, for the sections that charge.
const ost8 = (r: string, f: string, o: string) => `${r}! ${r} ${f} ${o}! ${f} ${r} ${f} ${o}`;
const ost16 = (r: string, f: string, o: string) =>
  `${r}! ${r} ${f} ${r} ${o} ${r} ${f}! ${r} ${o} ${f} ${r} ${o} ${r} ${f} ${o} ${f}`;
const bars = (...b: string[]) => b.join(" | ");

/** The A groove: the kick walks the 3+3+2, the snare keeps an honest backbeat. */
const stride = (fill: Drums["fill"]): Drums => ({
  kick: "x.....x.....x... | x.....x...x.x...",
  snare: "....x.......x... | ....x.......x..o",
  hat: "xoxoxoxoxoxoxoxo",
  open: "..............x.",
  crash: onFirst("X...............", 8),
  vel: 0.55,
  fill,
});

export default {
  title: "Stake Your Claim",
  battle: "field",
  note: "listen for the 3+3+2 stride under everything, the brass hook in A, the same B tune twice (strings, then brass), and the reed in the breakdown; the loop seam is C'b's tom fill into the hook",
  song: {
    bpm: 168, space: 1.9,
    sections: [
      // 0 — intro: the whole band on the stride, then a run up into the hook
      {
        name: "intro",
        chords: "Em | B7",
        pad: { inst: "strings", vel: 3.4 }, bass: { inst: "synbass", pat: "pump", vel: 0.78 },
        hits: { inst: "stab", pat: "X..X..X.", voicing: "power", oct: 3, vel: 0.56 },
        lead: { inst: "brass", unit: 0.5, vel: 1.1, n: bars("e4+b4!:3 e4+b4:3 e4+b4!:2", "b3 ds4 fs4 a4 b4 ds5 fs5:2") },
        parts: [{ inst: "timpani", unit: 0.5, vel: 0.45, n: bars("e2!:3 e2:3 b1:2", "b1:3 b1:3 b1:.5*4") }],
        drums: {
          kick: "X.....x.....x... | x.....x.....x...",
          taiko: "3.....3.....3... | 3...............",
          snare: "................ | x.x.x.x.xxxxXXXX",
          crash: "X...............",
          vel: 0.75,
        },
      },
      // 1 — A: the hook over the spiccato engine, half cadence on B7
      {
        name: "A hook",
        chords: "Em | Em7 | D | A | C | D | Em | B7",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "synbass", pat: "drive", vel: 0.47 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.6 },
        lead: { inst: "brass", unit: 0.5, vel: 1.73, n: bars(
          "b4:3 e5:3 fs5:2", "g5:3 fs5:3 d5:2", "fs5:2 e5 d5 e5:2 fs5:2", "cs5:6 e5:2",
          "e5:3 g5:3 a5:2", "b5:3 a5:3 fs5:2", "g5:2 fs5 e5 d5:2 fs5:2", "ds5:3 b4:3 fs4:2") },
        counter: { inst: "horn", vel: 1.5, n: bars(
          "g4:4", "fs4:2 d4:2", "a4:4", "a4:2 e4:2", "g4:4", "fs4:2 a4:2", "b4:2 g4:2", "fs4:2 ds4:2") },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.63, n: bars(
            ost8("e3", "b3", "e4"), ost8("e3", "b3", "d4"), ost8("d3", "a3", "d4"), ost8("a2", "e3", "a3"),
            ost8("c3", "g3", "c4"), ost8("d3", "a3", "d4"), ost8("e3", "b3", "e4"), ost8("b2", "fs3", "b3")) },
          { inst: "timpani", vel: 0.42, n: bars(
            "e2!:4", ".:4", "d2:4", "a1:4", "c2:4", "d2:4", "e2:4", "b1:1.5 b1:1.5 b1:1") },
        ],
        drums: stride(FILLS.toms),
      },
      // 2 — A': the answer. Same head, then up to the C# and home to E
      {
        name: "A' answer",
        chords: "Em | Em7 | G | A | C | D | B7sus4 B7 | Em",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "synbass", pat: "drive", vel: 0.47 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.6 },
        lead: { inst: "brass", unit: 0.5, vel: 1.73, n: bars(
          "b4:3 e5:3 fs5:2", "g5:3 fs5:3 d5:2", "g5:2 a5 b5 d6:2 b5:2", "cs6:4 b5:2 a5:2",
          "g5:3 e5:3 c5:2", "fs5:3 d5:3 a4:2", "e5:4 ds5:2 b4:2", "e5:6 .:2") },
        counter: { inst: "horn", vel: 1.5, n: bars(
          "g4:4", "fs4:2 d4:2", "b4:4", "cs5:2 a4:2", "c5:4", "a4:2 fs4:2", "e4:2 ds4:2", "e4:4") },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.63, n: bars(
            ost8("e3", "b3", "e4"), ost8("e3", "b3", "d4"), ost8("g2", "d3", "g3"), ost8("a2", "e3", "a3"),
            ost8("c3", "g3", "c4"), ost8("d3", "a3", "d4"), ost8("b2", "fs3", "b3"), ost8("e3", "b3", "e4")) },
          { inst: "timpani", vel: 0.42, n: bars(
            "e2!:4", ".:4", "g1:4", "a1:4", "c2:4", "d2:4", "b1:2 b1:2", "e2!:1.5 e2:1.5 b1:1") },
        ],
        drums: stride({ snare: "x.x.x.x.xxxxxxxX", hat: "................" }),
      },
      // 3 — B: the lift. A long string tune on half-time; the floor drops so
      // the next eight bars have somewhere to charge from
      {
        name: "B lift",
        chords: "Cmaj7 | D | G | Em | Am7 | D | B7sus4 | B",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "bass", pat: "oct", vel: 0.58 },
        arp: { inst: "pizz", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 4, vel: 1 },
        lead: { inst: "strings", unit: 0.5, vel: 4.1, n: bars(
          "e5:3 d5 e5:2 g5:2", "fs5:6 d5:2", "b5:3 a5 g5:2 d5:2", "e5:8",
          "c6:3 b5 a5:2 e5:2", "fs5:3 g5 a5:4", "b5:4 a5:2 e5:2", "ds5:8") },
        // the horn's own line sits an octave under its doubling of the tune
        counter: { inst: "horn", oct: -1, vel: 0.85, n: bars(
          "c4:4", "d4:4", "d4:4", "e4:4", "e4:4", "fs4:4", "e4:2 fs4:2", "ds4:4") },
        parts: [{ inst: "horn", oct: -1, vel: 1.2, unit: 0.5, n: bars(
          "e5:3 d5 e5:2 g5:2", "fs5:6 d5:2", "b5:3 a5 g5:2 d5:2", "e5:8",
          "c6:3 b5 a5:2 e5:2", "fs5:3 g5 a5:4", "b5:4 a5:2 e5:2", "ds5:8") }],
        drums: {
          vel: 0.7,
          kick: "x.........x.....",
          snare: "........X.......",
          hat: "x.x.x.x.x.x.x.x.",
          taiko: onFirst("3...............", 4) + " | " + onFirst("3...............", 4),
          fill: FILLS.pickup,
        },
      },
      // 4 — B': the same tune, given to the brass and run at a two-step
      {
        name: "B' charge",
        chords: "Cmaj7 | D | Em | G/B | C | D | B7sus4 | B7",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "synbass", pat: "gallop", vel: 0.47 },
        hits: { inst: "stab", pat: "X..x..o.", voicing: "power", oct: 3, vel: 0.48 },
        lead: { inst: "brass", unit: 0.5, vel: 1.73, n: bars(
          "e5:3 d5 e5:2 g5:2", "fs5:6 d5:2", "g5:3 fs5 g5:2 b5:2", "d6:4 b5:2 g5:2",
          "c6:3 b5 a5:2 g5:2", "a5:3 b5 a5:2 fs5:2", "e5:4 fs5:2 a5:2", "b5:3 a5 fs5:2 ds5:2") },
        counter: { inst: "strings", vel: 2, n: bars(
          "c5:4", "a4:4", "b4:4", "b4:4", "e5:4", "d5:4", "e5:2 a4:2", "ds5:4") },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.45, n: bars(
            ost16("c3", "g3", "c4"), ost16("d3", "a3", "d4"), ost16("e3", "b3", "e4"), ost16("b2", "g3", "b3"),
            ost16("c3", "g3", "c4"), ost16("d3", "a3", "d4"), ost16("b2", "e3", "a3"), ost16("b2", "fs3", "b3")) },
          { inst: "timpani", vel: 0.42, n: bars(
            "c2:4", "d2:4", "e2:4", "b1:4", "c2:4", "d2:4", "b1:4", "b1?:.25*6 b1:.25*6 b1!:1") },
        ],
        drums: { ...GROOVES.twostep, crash: onFirst("X...............", 8), vel: 0.55, fill: FILLS.toms },
      },
      // 5 — C: the breakdown. No kit; the reed plays the hook as a folk tune
      // over taiko and a strummed lute, the one warm turn in the fight
      {
        name: "C breakdown",
        chords: "Em | D/E | Em | D/E | C | D | Em | Em",
        pad: { inst: "strings", vel: 3.8 }, bass: { inst: "bass", pat: "root", vel: 0.52 },
        arp: { inst: "lute", pat: "0 1 2 1 3 1 2 1", unit: 0.5, oct: 3, vel: 1.1 },
        lead: { inst: "reed", unit: 0.5, vel: 1.62, n: bars(
          "b4:3 e5:3 fs5:2", "g5 fs5 e5 d5 e5:4", "b4:3 e5:3 g5:2", "a5 g5 fs5 e5 fs5:4",
          "g5:3 e5:3 c5:2", "d5:2 e5 fs5 a5:4", "g5:2 fs5 e5 d5:2 b4:2", "e5:8") },
        drums: { ...GROOVES.taiko, shaker: "x.xxx.xxx.xxx.xx", vel: 0.5 },
      },
      // 6 — C'a: the climb starts. Brass walks the stride up a step a bar over
      // kick and taiko; timpani roll into the full kit
      {
        name: "C'a climb",
        chords: "Em | Em | D | A",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "synbass", pat: "pump", vel: 0.65 },
        lead: { inst: "brass", unit: 0.5, vel: 0.97, n: bars(
          "e4:3 e4:3 fs4:2", "g4:3 g4:3 a4:2", "a4:3 a4:3 b4:2", "cs5:3 cs5:3 e5:2") },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.5, n: bars(
            ost8("e3", "b3", "e4"), ost8("e3", "b3", "e4"), ost8("d3", "a3", "d4"), ost8("a2", "e3", "a3")) },
          { inst: "timpani", vel: 0.5, n: bars("e2:2 e2:2", "e2:2 e2:2", "d2:2 d2:2", "a1?:.25*8 a1:.25*8") },
        ],
        drums: {
          kick: "x.....x.....x...",
          taiko: "3.......3.......",
          snare: "....o.......o... | ....o.......o... | ....o...o...o... | ..o.o.o.x.x.xxXX",
          hat: "x.x.x.x.x.x.x.x.",
          vel: 0.62,
        },
      },
      // 7 — C'b: everything, sixteenths, and the tom fill back into the hook
      {
        name: "C'b",
        chords: "C | C | D | B7",
        pad: { inst: "strings", vel: 4.7 }, bass: { inst: "synbass", pat: "drive", vel: 0.47 },
        hits: { inst: "stab", pat: "X..x..o.", voicing: "power", oct: 3, vel: 0.52 },
        lead: { inst: "brass", unit: 0.5, vel: 1.73, n: bars(
          "e5:3 e5:3 g5:2", "e5:3 g5:3 a5:2", "a5:3 fs5:3 a5:2", "b5:4 fs5:2 ds5:2") },
        counter: { inst: "horn", vel: 1.5, n: bars("g4:4", "c5:4", "d5:4", "ds5:4") },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.45, n: bars(
            ost16("c3", "g3", "c4"), ost16("c3", "g3", "c4"), ost16("d3", "a3", "d4"), ost16("b2", "fs3", "b3")) },
          { inst: "timpani", vel: 0.42, n: bars("c2!:4", "c2:4", "d2:4", "b1?:.25*6 b1:.25*6 b1!:1") },
        ],
        drums: { ...GROOVES.drive, crash: onFirst("X...............", 4), vel: 0.55, fill: FILLS.toms },
      },
    ],
    form: [0, 1, 2, 3, 4, 2, 5, 6, 7], loopFrom: 1,
  },
} satisfies Piece;
