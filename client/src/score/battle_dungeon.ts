// ---------- Dungeon battle — "Keep Out, Keep Well" ----------
// All eleven dungeons fight to this: the Mausoleum and the overseer's lodge,
// the sunken ballroom, the Bell Tower's escapement, the propagating cellars,
// the furnace, the great sluice's wheel, the granary, the watchtower, the
// Beacon Fort and the Keep. What they share is that they are indoors, kept,
// and still working — the empire's rooms, swept and locked, with something
// polite and implacable in each one enforcing a notice nobody has read in
// three hundred years. Every writ in them says the same thing: "The household
// departs this night and will return. Keep out. Keep well." So the piece is
// close quarters and machinery rather than horror: tense, driving, tidy.
//
//   * D minor at 156, a touch under the field's 168 — the walls are closer,
//     and a minor key that leans on its leading tone (A7, the C#) drives
//     instead of mourning. The f-over-A appoggiatura (f falls to e) is the
//     tension motif, and it recurs on every half-close.
//   * The family DNA is the field battle's 3+3+2 stride, FOLDED into half the
//     space: the spiccato ostinato and the kick group sixteenths 3+3+2 per half
//     bar, so the same stride ticks twice as fast — the field's race, run down
//     a corridor. It is the escapement in the Bell Tower as much as a rhythm.
//   * The hook (low brass and horn, a3 d4 e4 | f4 e4 c#4) has the field hook's
//     shape — a fourth leap up, a step, a turn down — in the minor, with the
//     f falling onto the C#. A gives it to the low brass, A' to the brass at
//     pitch with the horn answering; A'' to everyone.
//   * B, the Gallery: the bass descends a lament (D C# C B Bb A G A) under a
//     long string tune on half-time drums — a long, lit corridor.
//   * C, the Escapement: no kit. Taiko ticks, a pizzicato clockwork and glass
//     on the off-beats; the reed plays the hook IN F MAJOR over a choir bed —
//     beds made, table set, the one homesick turn — before the timpani wind it
//     back into the minor.
//   * D, Unsealed: a new rising line over a gallop bass, the horn chasing it a
//     beat behind; the Neapolitan Eb before the last half-close is the
//     darkest chord in the piece, and the only one it saves for this.
//
// Intro: two bars of hits and a snare run, skipped on loop. Loop: A A' B C D
// A'', 48 bars at 1.54 s = 74 s.
//
// The room is smaller than the field's (reverb 1.4 s against 1.9): the hits are
// drier and the ostinato speaks, which is most of what "close quarters" is.

import { FILLS, onFirst, type Piece } from "./kit.ts";
import type { Drums } from "../music";

const bars = (...b: string[]) => b.join(" | ");

/** The escapement: sixteenths, accented 3+3+2 in each half bar — the field's
 *  stride folded in two. Root, fifth, octave. Only the first two legs are
 *  accented: the third belongs to the kick. */
const tick = (r: string, f: string, o: string) => {
  const half = `${r}! ${r} ${f} ${o}! ${f} ${r} ${o} ${f}`;
  return `${half} ${half}`;
};
/** First half of one bar's ostinato, second half of another's: for a bar that
 *  changes chord on beat 3, so the ticks never hold a G or a Bb under the A7. */
const halves = (a: string, b: string) => {
  const x = a.split(" "), y = b.split(" ");
  return [...x.slice(0, x.length / 2), ...y.slice(y.length / 2)].join(" ");
};
/** the same, in eighths: half the ticks, for the sections that thin out */
const tick8 = (r: string, f: string, o: string) => `${r}! ${f} ${o} ${f} ${r}! ${f} ${o} ${f}`;

/** The hook, at the brass's pitch. A plays it an octave down. */
const HOOK = bars(
  "a4:3 d5:3 e5:2", "f5:3 e5:3 cs5:2", "d5:2 e5 f5 g5:2 a5:2", "bf5:6 a5:2",
  "a4:3 d5:3 e5:2", "f5:3 g5:3 a5:2", "bf5:2 a5 g5 f5:2 e5:2", "cs5:3 e5:3 a5:2");
const HOOK_CHORDS = "Dm | A/C# | Dm | Bb | Dm | Gm | Gm A7 | A7";
/** the answer: same head, then up to the a and home to D */
const ANSWER = bars(
  "a4:3 d5:3 e5:2", "f5:3 e5:3 cs5:2", "d5:2 e5 f5 g5:2 a5:2", "bf5:6 a5:2",
  "a4:3 d5:3 f5:2", "a5:3 g5:3 e5:2", "f5:2 e5 d5 cs5:2 e5:2", "d5:6 .:2");
const ANSWER_CHORDS = "Dm | A/C# | Dm | Bb | Dm | C | Bb A7 | Dm";
/** the horn's answer under the brass: long tones moving against the tune */
const ANSWER_COUNTER = bars("f4:4", "e4:2 g4:2", "a4:4", "f4:2 d4:2", "f4:4", "e4:2 c4:2", "d4:2 cs4:2", "d4:2 a3:2");

/** The A groove: the kick on the folded stride's first legs, a dry backbeat,
 *  eighth hats, and a floor tom on the "and" of 4 for the room. */
const corridor = (vel: number, fill: Drums["fill"], kick = "x..x..x.....x..x"): Drums => ({
  kick,
  snare: "....X.......X... | ....X.......X..o",
  hat: "x.xxx.x.x.xxx.x.",
  tom: "..............3.",
  crash: onFirst("X...............", 8),
  vel,
  fill,
});

export default {
  title: "Keep Out, Keep Well",
  battle: "dungeon",
  note: "the field's 3+3+2 stride folded into sixteenths; listen for the hook in low brass (A) then at pitch (A'), the lament bass under B, and the reed's F-major hook in the Escapement — the one warm turn",
  song: {
    bpm: 156, space: 1.4,
    sections: [
      // 0 — intro: the band on the folded stride, then a snare run into the hook
      {
        name: "intro",
        chords: "Dm | A7",
        pad: { inst: "strings", vel: 3.6 }, bass: { inst: "synbass", pat: "pump", vel: 0.8 },
        hits: { inst: "stab", pat: "X..X..X.", unit: 0.25, voicing: "power", oct: 3, vel: 0.55 },
        lead: { inst: "brass", oct: -1, unit: 0.5, vel: 1.15, n: bars("d4+a4!:3 d4+a4:3 d4+a4!:2", "a3 cs4 e4 g4 a4 cs5 e5:2") },
        parts: [
          { inst: "timpani", unit: 0.25, vel: 0.45, n: bars("d2!:3 d2:3 d2:2 d2!:3 d2:3 d2:2", "a1:4 a1:4 a1:.5*16") },
          { inst: "spiccato", unit: 0.25, vel: 0.5, n: bars(tick("d3", "a3", "d4"), tick("a2", "e3", "a3")) },
        ],
        drums: {
          kick: "X..x..x.X..x..x. | x..x..x.x.......",
          taiko: "3.......3....... | 3...............",
          snare: "................ | x.x.x.x.xxxxXXXX",
          crash: "X...............",
          vel: 0.72,
        },
      },
      // 1 — A: the hook in the low brass over the escapement
      {
        name: "A hook",
        chords: HOOK_CHORDS,
        pad: { inst: "strings", vel: 4.4 }, bass: { inst: "synbass", pat: "drive", vel: 0.5 },
        hits: { inst: "stab", pat: "x..x..o.", unit: 0.25, voicing: "power", oct: 3, vel: 0.42 },
        lead: { inst: "brass", oct: -1, unit: 0.5, vel: 1.6, n: HOOK },
        counter: { inst: "horn", oct: -1, unit: 0.5, vel: 1.3, n: HOOK },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.5, n: bars(
            tick("d3", "a3", "d4"), tick("cs3", "a3", "e4"), tick("d3", "a3", "d4"), tick("bf2", "f3", "bf3"),
            tick("d3", "a3", "d4"), tick("g2", "d3", "g3"), halves(tick("g2", "d3", "g3"), tick("a2", "e3", "a3")), tick("a2", "e3", "a3")) },
          // the Bb bar stays on Bb: a low A on beats 3-4 sat a semitone over the
          // synbass's Bb drive, mud in the one register nothing can hide it
          { inst: "timpani", vel: 0.42, n: bars("d2!:4", ".:4", "d2:4", "bf1:2 bf1:2", "d2:4", "g1:4", "g1:2 a1:2", "a1:1.5 a1:1.5 a1:1") },
        ],
        drums: corridor(0.55, FILLS.toms),
      },
      // 2 — A': the brass at pitch, the horn answering below, home to D
      {
        name: "A' answer",
        chords: ANSWER_CHORDS,
        pad: { inst: "strings", vel: 4.4 }, bass: { inst: "synbass", pat: "drive", vel: 0.5 },
        hits: { inst: "stab", pat: "x..x..o.", unit: 0.25, voicing: "power", oct: 3, vel: 0.42 },
        lead: { inst: "brass", unit: 0.5, vel: 1.6, n: ANSWER },
        counter: { inst: "horn", vel: 1.5, n: ANSWER_COUNTER },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.5, n: bars(
            tick("d3", "a3", "d4"), tick("cs3", "a3", "e4"), tick("d3", "a3", "d4"), tick("bf2", "f3", "bf3"),
            tick("d3", "a3", "d4"), tick("c3", "g3", "c4"), halves(tick("bf2", "f3", "bf3"), tick("a2", "e3", "a3")), tick("d3", "a3", "d4")) },
          { inst: "timpani", vel: 0.42, n: bars("d2:4", ".:4", "d2:4", "bf1:2 bf1:2", "d2:4", "c2:4", "bf1:2 a1:2", "d2!:1.5 d2:1.5 a1:1") },
        ],
        drums: corridor(0.55, { snare: "x.x.x.x.xxxxxxxX", hat: "................" }),
      },
      // 3 — B, the Gallery: a lament bass under a long string tune, half-time
      {
        name: "B gallery",
        chords: "Dm | A/C# | C | G/B | Bb | F/A | Gm | A",
        pad: { inst: "strings", vel: 4.2 }, bass: { inst: "bass", pat: "oct", vel: 0.6 },
        arp: { inst: "pizz", pat: "0 1 2 1 0 1 2 1", unit: 0.5, oct: 4, vel: 1 },
        lead: { inst: "strings", unit: 0.5, vel: 4.1, n: bars(
          "f5:3 e5 f5:2 a5:2", "e5:6 cs5:2", "g5:3 f5 e5:2 c5:2", "d5:8",
          "d6:3 c6 bf5:2 f5:2", "a5:3 bf5 c6:4", "bf5:4 a5:2 g5:2", "a5:4 cs5:2 e5:2") },
        // the horn doubles the tune an octave down, and the ostinato goes to eighths
        counter: { inst: "horn", oct: -1, unit: 0.5, vel: 1.2, n: bars(
          "f5:3 e5 f5:2 a5:2", "e5:6 cs5:2", "g5:3 f5 e5:2 c5:2", "d5:8",
          "d6:3 c6 bf5:2 f5:2", "a5:3 bf5 c6:4", "bf5:4 a5:2 g5:2", "a5:4 cs5:2 e5:2") },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.5, n: bars(
            tick8("d3", "a3", "d4"), tick8("cs3", "a3", "e4"), tick8("c3", "g3", "c4"), tick8("b2", "g3", "d4"),
            tick8("bf2", "f3", "bf3"), tick8("a2", "f3", "c4"), tick8("g2", "d3", "g3"), tick8("a2", "e3", "a3")) },
        ],
        drums: {
          vel: 0.68,
          kick: "x.........x.....",
          snare: "........X.......",
          hat: "x.x.x.x.x.x.x.x.",
          taiko: onFirst("3...............", 4) + " | " + onFirst("3...............", 4),
          fill: FILLS.pickup,
        },
      },
      // 4 — C, the Escapement: no kit. Taiko ticks, a pizzicato clockwork,
      // glass on the off-beats, and the hook in F major on the reed
      {
        name: "C escapement",
        chords: "F | C/E | Dm | Bb | F | C/E | Bb | A",
        pad: { inst: "choir", vel: 1.5 }, bass: { inst: "bass", pat: "root", vel: 0.55 },
        arp: { inst: "pizz", pat: "0 2 1 2 0 2 1 2", unit: 0.25, oct: 4, vel: 1.5 },
        lead: { inst: "reed", unit: 0.5, vel: 1.7, n: bars(
          "c5:3 f5:3 g5:2", "a5:3 g5:3 e5:2", "f5:2 g5 a5 c6:4", "bf5:6 d5:2",
          "c5:3 f5:3 g5:2", "a5:3 c6:3 g5:2", "f5:3 d5:3 bf4:2", "a4:6 cs5:2") },
        counter: { inst: "glass", vel: 0.3, n: bars(
          ". c6 . f6", ". e6 . g6", ". d6 . f6", ". d6 . f6", ". c6 . a6", ". g6 . e6", ". f6 . d6", ". e6 . a5") },
        parts: [
          { inst: "lute", unit: 0.5, vel: 0.9, n: bars(
            "f3 c4 a3 c4 f3 c4 a3 c4", "e3 c4 g3 c4 e3 c4 g3 c4", "d3 a3 f3 a3 d3 a3 f3 a3", "bf2 f3 d3 f3 bf2 f3 d3 f3",
            "f3 c4 a3 c4 f3 c4 a3 c4", "e3 c4 g3 c4 e3 c4 g3 c4", "bf2 f3 d3 f3 bf2 f3 d3 f3", "a2 e3 d3 e3 a2 e3 cs3 e3") },
          { inst: "timpani", vel: 0.45, n: bars(".:4", ".:4", ".:4", ".:4", "f1:4", ".:4", "bf1:2 bf1:2", ".:3 e2?:.5 e2:.5") },
        ],
        // the wind-up is a snare roll over the two smaller taiko and a timpani
        // pickup on the fifth: a sixteenth taiko run rang seven drums at once
        // (each speaks 1.2 s) under the choir's tail, and an o-daiko or a timpani
        // roll on the low A, under the bass's and the lute's own A, was the
        // piece's one hot peak
        drums: {
          taiko: "3...2...3...2... | 3...2...3...2.22",
          shaker: "x.xxx.xxx.xxx.xx",
          vel: 0.55,
          fill: { taiko: "2.......2...2...", snare: "........rrrrRRRR" },
        },
      },
      // 5 — D, Unsealed: a new rising line over a gallop, the horn a beat behind
      {
        name: "D unsealed",
        chords: "Gm | Dm | Bb | A | Gm | Dm | Eb | A7",
        pad: { inst: "strings", vel: 4.4 }, bass: { inst: "synbass", pat: "gallop", vel: 0.48 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.5 },
        lead: { inst: "brass", unit: 0.5, vel: 1.5, n: bars(
          "g4:3 bf4:3 d5:2", "f5:3 e5:3 d5:2", "f5:3 g5:3 a5:2", "cs5:3 e5:3 a5:2",
          "bf5:3 a5:3 g5:2", "a5:3 f5:3 d5:2", "g5:3 f5:3 ef5:2", "e5:3 cs5:3 a4:2") },
        // the chase: the tune's head again, one beat late and an octave down.
        // Where the strict canon would carry a note across a bar line onto a
        // chord it fights (the A over Gm, the Eb over A7 a semitone under the
        // brass's E), the horn takes a chord tone for that one beat instead
        counter: { inst: "horn", unit: 0.5, vel: 1.3, n: bars(
          ".:2 g3:3 bf3:3", "d4:2 f4:3 e4:3", "d4:2 f4:3 g4:3", "a4:2 cs4:3 e4:3",
          "g4:2 bf4:3 a4:3", "f4:2 a4:3 f4:3", "bf3:2 g4:3 f4:3", "g4:2 e4:3 cs4:3") },
        parts: [
          // eighths, not sixteenths: the gallop bass already fills every
          // sixteenth, and the two together were the piece's heaviest bar
          { inst: "spiccato", unit: 0.5, vel: 0.55, n: bars(
            tick8("g2", "d3", "g3"), tick8("d3", "a3", "d4"), tick8("bf2", "f3", "bf3"), tick8("a2", "e3", "a3"),
            tick8("g2", "d3", "g3"), tick8("d3", "a3", "d4"), tick8("ef3", "bf3", "ef4"), tick8("a2", "e3", "a3")) },
          { inst: "timpani", vel: 0.42, n: bars("g1:4", "d2:4", "bf1:4", "a1:4", "g1:4", "d2:4", "ef2:4", "a1?:.25*6 a1:.25*6 a1!:1") },
        ],
        drums: {
          kick: "x.xxx.xxx.xxx.xx",
          snare: "....X.......X...",
          hat: "x.x.x.x.x.x.x.x.",
          crash: onFirst("X...............", 4),
          vel: 0.52,
          fill: FILLS.snare,
        },
      },
      // 6 — A'': everyone — the answer in brass, horn counter, sixteenth stabs,
      // the full folded-stride kick, and the tom fill back into the hook
      {
        name: "A'' all",
        chords: ANSWER_CHORDS,
        pad: { inst: "strings", vel: 4.6 }, bass: { inst: "synbass", pat: "drive", vel: 0.5 },
        // no accent on the stabs or the timpani's downbeat: the crash, kick and
        // brass entry already land there, and the accents were the only peak
        hits: { inst: "stab", pat: "x..x..o.", unit: 0.25, voicing: "power", oct: 3, vel: 0.44 },
        lead: { inst: "brass", unit: 0.5, vel: 1.7, n: ANSWER },
        counter: { inst: "horn", vel: 1.5, n: ANSWER_COUNTER },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.5, n: bars(
            tick("d3", "a3", "d4"), tick("cs3", "a3", "e4"), tick("d3", "a3", "d4"), tick("bf2", "f3", "bf3"),
            tick("d3", "a3", "d4"), tick("c3", "g3", "c4"), halves(tick("bf2", "f3", "bf3"), tick("a2", "e3", "a3")), tick("d3", "a3", "d4")) },
          { inst: "timpani", vel: 0.42, n: bars("d2:4", ".:4", "d2:4", "bf1:2 bf1:2", "d2:4", "c2:4", "bf1:2 a1:2", "d2!:2 a1?:.5 a1?:.5 a1:1") },
        ],
        drums: corridor(0.56, FILLS.toms, "x..x..x.x..x..x."),
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6], loopFrom: 1,
  },
} satisfies Piece;
