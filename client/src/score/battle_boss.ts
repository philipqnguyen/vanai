// ---------- Boss — "Settle in Full" ----------
// Every named encounter, anywhere: the Warden of the Mausoleum, the Overseer,
// the Master of Ceremonies, the Bellringer, the Glassblower, the Lock-Keeper,
// the Reaper in the granary, the Wall Drake, the Beacon-Keeper — and at the
// end of everything, the Regent. Most of them are servants: polite,
// implacable, enforcing a household's last orders. Beating one settles an
// account three hundred years overdue (Caerdun's wage book ends in a dated
// settlement-in-full), and it is the biggest moment a party shares, so this is
// the biggest piece in the score: fast, heroic, a hook to shout over voice
// chat — the boss theme of the game the field theme promised.
//
//   * A minor at 184, the fastest piece in the score. The field strides 3+3+2;
//     so does the boss — the kick, the stabs, the spiccato accents and the
//     hook's own rhythm — at a gallop.
//   * The hook (brass over horns, a4 e5 d5 e5 | f5 e5 c5) leaps a FIFTH where
//     the field hook leapt a fourth: the same gesture, squared up. Horns and
//     choir answer it.
//   * The choir is the size: an "ah" under the intro, the horns' line in A', a
//     chorus in B and B', a chant over the Gauntlet.
//   * B, the Stand: up to C major, a long tune on strings and choir over
//     half-time drums; B' gives it to the brass and choir together over the
//     drive groove — the chorus.
//   * C, the Gauntlet: the breakdown is a riff, not a lull — low brass and
//     synbass in unison on the 3+3+2 over taiko and toms, the choir chanting
//     above — then four bars climbing F G A B, onto the dominant of E.
//   * D, Settle in Full: the turn the whole score has been saving. The FIELD
//     battle's hook, at its own pitch, in E MAJOR — the claim you staked in the
//     first fight, played as a fanfare over a gallop, a bell on the downbeats.
//     The loudest bars in the game. Four bars of F G E7 drop it back into A
//     minor, into the hook.
//
// Intro: two bars — the whole band on Am, a run up E7 — skipped on loop. Loop:
// A A' B B' C C' D E, 56 bars at 1.30 s = 73 s.

import { FILLS, GROOVES, onFirst, type Piece } from "./kit.ts";
import type { Drums } from "../music";

const bars = (...b: string[]) => b.join(" | ");
const each = (f: (...a: string[]) => string, rows: string[][]) => bars(...rows.map((r) => f(...r)));

/** Sixteenth spiccato, up and down the chord, accented on the first two legs
 *  of the 3+3+2 (sixteenths 0 and 6); the third leg is the snare's. */
const run16 = (r: string, f: string, o: string) =>
  `${r}! ${f} ${o} ${f} ${r} ${f} ${o}! ${f} ${r} ${f} ${o} ${f} ${r} ${f} ${o} ${f}`;
/** the same in eighths, for the half-time sections */
const run8 = (r: string, f: string, o: string) => `${r}! ${f} ${o} ${r} ${f} ${o} ${r} ${f}`;
/** First half of one bar's run, second half of another's: for a bar that
 *  changes chord on beat 3, so the strings never hold an A over the E7 or B. */
const halves = (a: string, b: string) => {
  const x = a.split(" "), y = b.split(" ");
  return [...x.slice(0, x.length / 2), ...y.slice(y.length / 2)].join(" ");
};

/** The boss hook: a fifth up and a turn, on the 3+3+2. Half-close on E7. */
const HOOK = bars(
  "a4:3 e5:3 d5 e5", "f5:3 e5:3 c5:2", "d5:3 g5:3 f5 e5", "gs5:6 e5:2",
  "a4:3 e5:3 d5 e5", "f5:3 a5:3 g5 f5", "f5:2 e5 d5 c5:2 b4:2", "b4:3 e5:3 gs5:2");
const HOOK_CHORDS = "Am | F | G | E | Am | F | Dm7 | E7";
/** the answer: same head, up to the d6 and home */
const ANSWER = bars(
  "a4:3 e5:3 d5 e5", "f5:3 e5:3 c5:2", "d5:3 g5:3 f5 e5", "gs5:6 e5:2",
  "a4:3 e5:3 d5 e5", "f5:3 a5:3 c6:2", "d6:3 c6 b5:2 gs5:2", "a5:6 .:2");
const ANSWER_CHORDS = "Am | F | G | E | Am | F | Dm7 E7 | Am";
const HORN = bars("c5:4", "a4:2 c5:2", "b4:4", "b4:2 gs4:2", "c5:4", "a4:2 c5:2", "a4:2 f4:2", "e4:2 gs4:2");
const HORN_ANSWER = bars("c5:4", "a4:2 c5:2", "b4:4", "b4:2 gs4:2", "c5:4", "c5:2 f5:2", "f4:2 e4:2", "e4:4");
const RUN_HOOK = each(run16, [["a2", "e3", "a3"], ["f2", "c3", "f3"], ["g2", "d3", "g3"], ["e2", "b2", "e3"],
  ["a2", "e3", "a3"], ["f2", "c3", "f3"], ["d3", "a3", "c4"], ["e2", "b2", "d3"]]);
const RUN_ANSWER = bars(
  each(run16, [["a2", "e3", "a3"], ["f2", "c3", "f3"], ["g2", "d3", "g3"], ["e2", "b2", "e3"], ["a2", "e3", "a3"], ["f2", "c3", "f3"]]),
  halves(run16("d3", "a3", "c4"), run16("e2", "b2", "d3")), run16("a2", "e3", "a3"));

/** The Stand's tune, C major: a long line over half-time. */
const STAND = bars(
  "a5:6 g5 f5", "g5:4 d5:4", "e5:3 g5:3 b5:2", "a5:8",
  "c6:3 a5:3 f5:2", "b5:6 a5 g5", "c6:4 b5:2 g5:2", "gs5:8");
const STAND_CHORDS = "F | G | Em7 | Am | Dm7 | G | Cmaj7 | E7";

/** The field battle's hook (score/battle_field.ts, A), at its own pitch, in E
 *  major: g -> g#, d -> d# where it leads, d and g natural where the chord is
 *  the borrowed bVII or bVI. */
const CLAIM = bars(
  "b4:3 e5:3 fs5:2", "gs5:3 fs5:3 ds5:2", "fs5:2 e5 d5 e5:2 fs5:2", "cs5:6 e5:2",
  "e5:3 g5:3 a5:2", "b5:3 a5:3 fs5:2", "gs5:2 fs5 e5 ds5:2 fs5:2", "e5:4 gs5:2 b5:2");
const CLAIM_CHORDS = "E | G#m7 | D | A | C | D | A B | E";
/** the horns under it: battle_field.ts's own A counter, in the major */
const CLAIM_HORN = bars("gs4:4", "fs4:2 ds4:2", "a4:4", "a4:2 e4:2", "g4:4", "fs4:2 a4:2", "cs5:2 ds5:2", "b4:4");

/** The A groove: the field's stride, with a doubled kick on the third leg. */
const stride = (vel: number, fill: Drums["fill"]): Drums => ({
  kick: "x.....x.....x... | x.....x...x.x.x.",
  snare: "....X.......X... | ....X.......X..o",
  hat: "xoxoxoxoxoxoxoxo",
  open: "..............x.",
  crash: onFirst("X...............", 8),
  vel,
  fill,
});

export default {
  title: "Settle in Full",
  battle: "boss",
  note: "the biggest piece: the hook leaps a fifth where the field's leapt a fourth; listen for the choir chorus in B', the Gauntlet riff in C, and in D the FIELD battle's hook at its own pitch in E major — the claim, paid in full",
  song: {
    bpm: 184, space: 2,
    sections: [
      // 0 — intro: the whole band on Am on the 3+3+2, then a run up E7
      {
        name: "intro",
        chords: "Am | E7",
        pad: { inst: "strings", vel: 3.6 }, bass: { inst: "synbass", pat: "pump", vel: 0.78 },
        hits: { inst: "stab", pat: "X..x..x.", voicing: "power", oct: 3, vel: 0.55 },
        lead: { inst: "brass", unit: 0.5, vel: 1.15, n: bars("a3+e4!:3 a3+e4:3 a3+e4!:2", "e4 gs4 b4 d5 e5 gs5 b5:2") },
        parts: [
          { inst: "choir", unit: 0.5, vel: 2.4, n: bars("e4+a4:8", "d4+gs4:8") },
          { inst: "timpani", unit: 0.5, vel: 0.45, n: bars("a1!:3 a1:3 e2:2", "e2:3 e2:3 e2:.5*4") },
        ],
        drums: {
          kick: "X.....x.....x... | x.....x.....x...",
          taiko: "3.....2.....3... | 3...............",
          snare: "................ | x.x.x.x.xxxxXXXX",
          crash: "X...............",
          vel: 0.75,
        },
      },
      // 1 — A: the hook on brass, horns answering, the sixteenth run under it
      {
        name: "A hook",
        chords: HOOK_CHORDS,
        pad: { inst: "strings", vel: 4.6 }, bass: { inst: "synbass", pat: "drive", vel: 0.48 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.5 },
        lead: { inst: "brass", unit: 0.5, vel: 1.6, n: HOOK },
        counter: { inst: "horn", vel: 1.5, n: HORN },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.45, n: RUN_HOOK },
          // the drum leaves bar 6 to the brass: f1 on the timpani under the synbass's
          // f and the kick, beneath the brass's leap, was the hottest downbeat
          { inst: "timpani", vel: 0.42, n: bars("a1:4", ".:4", "g1:4", "e2:4", "a1:4", ".:4", "d2:4", "e2:1.5 e2:1.5 e2:1") },
        ],
        drums: stride(0.5, FILLS.toms),
      },
      // 2 — A': the answer, the choir doubling the horns, home to A
      {
        name: "A' answer",
        chords: ANSWER_CHORDS,
        pad: { inst: "strings", vel: 4.6 }, bass: { inst: "synbass", pat: "drive", vel: 0.48 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.5 },
        lead: { inst: "brass", unit: 0.5, vel: 1.6, n: ANSWER },
        counter: { inst: "horn", vel: 1.5, n: HORN_ANSWER },
        parts: [
          { inst: "choir", vel: 2.2, n: HORN_ANSWER },
          { inst: "spiccato", unit: 0.25, vel: 0.45, n: RUN_ANSWER },
          { inst: "timpani", vel: 0.42, n: bars("a1:4", ".:4", "g1:4", "e2:4", "a1:4", ".:4", "d2:2 e2:2", "a1:1.5 a1:1.5 e2:1") },
        ],
        drums: stride(0.5, { snare: "x.x.x.x.xxxxxxxX", hat: "................" }),
      },
      // 3 — B, the Stand: C major, a long tune on strings, the choir an octave
      // under, half-time
      {
        name: "B stand",
        chords: STAND_CHORDS,
        pad: { inst: "strings", vel: 4.4 }, bass: { inst: "bass", pat: "oct", vel: 0.6 },
        lead: { inst: "strings", unit: 0.5, vel: 4.2, n: STAND },
        counter: { inst: "choir", oct: -1, unit: 0.5, vel: 3.2, n: STAND },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.55, n: each(run8, [["f2", "c3", "f3"], ["g2", "d3", "g3"], ["e2", "b2", "e3"], ["a2", "e3", "a3"],
            ["d2", "a2", "d3"], ["g2", "d3", "g3"], ["c3", "g3", "b3"], ["e2", "b2", "d3"]]) },
          { inst: "horn", vel: 1.2, n: bars("c5:4", "b4:4", "b4:4", "c5:4", "a4:4", "b4:2 d5:2", "e5:2 d5:2", "d5:2 b4:2") },
        ],
        drums: {
          vel: 0.7,
          kick: "x.........x.....",
          snare: "........X.......",
          hat: "x.x.x.x.x.x.x.x.",
          taiko: onFirst("3...............", 4) + " | " + onFirst("3...............", 4),
          crash: onFirst("X...............", 4),
          fill: FILLS.pickup,
        },
      },
      // 4 — B', the chorus: the same tune on brass and choir over the drive
      {
        name: "B' chorus",
        chords: STAND_CHORDS,
        pad: { inst: "strings", vel: 4.6 }, bass: { inst: "synbass", pat: "drive", vel: 0.48 },
        hits: { inst: "stab", pat: "X..x..o.", voicing: "power", oct: 3, vel: 0.42 },
        lead: { inst: "brass", unit: 0.5, vel: 1.65, n: STAND },
        counter: { inst: "choir", oct: -1, unit: 0.5, vel: 3.4, n: STAND },
        parts: [
          { inst: "spiccato", unit: 0.25, vel: 0.42, n: each(run16, [["f2", "c3", "f3"], ["g2", "d3", "g3"], ["e2", "b2", "e3"], ["a2", "e3", "a3"],
            ["d2", "a2", "d3"], ["g2", "d3", "g3"], ["c3", "g3", "b3"], ["e2", "b2", "d3"]]) },
          { inst: "timpani", vel: 0.42, n: bars("f1:4", "g1:4", "e2:4", "a1:4", "d2:4", "g1:4", "c2:4", "e2?:.25*6 e2:.25*6 e2!:1") },
        ],
        drums: { ...GROOVES.drive, crash: onFirst("X...............", 8), vel: 0.55, fill: FILLS.toms },
      },
      // 5 — C, the Gauntlet: a riff in low brass and synbass on the 3+3+2,
      // taiko and toms, the choir chanting over it
      {
        name: "C gauntlet",
        chords: "Am | Am | F | E | Am | Am | F | E",
        pad: { inst: "strings", vel: 3 }, bass: null,
        lead: { inst: "brass", oct: -1, unit: 0.5, vel: 1.5, n: bars(
          "a4!:3 a4:3 g4:2", "c5!:3 b4:3 g4:2", "a4!:3 a4:3 c5:2", "b4!:3 gs4:3 e4:2",
          "a4!:3 a4:3 g4:2", "c5!:3 d5:3 e5:2", "f5!:3 e5:3 c5:2", "b4!:3 gs4:3 b4:2") },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.62, n: bars(
            "a1!:3 a1:3 g1:2", "c2!:3 b1:3 g1:2", "a1!:3 a1:3 c2:2", "b1!:3 gs1:3 e1:2",
            "a1!:3 a1:3 g1:2", "c2!:3 d2:3 e2:2", "f2!:3 e2:3 c2:2", "b1!:3 gs1:3 b1:2") },
          { inst: "choir", unit: 0.5, vel: 2.6, n: bars("e4+a4:8", "e4+a4:8", "f4+a4:8", "e4+gs4:8", "e4+a4:8", "e4+a4:8", "f4+c5:8", "e4+b4:8") },
          { inst: "spiccato", unit: 0.5, vel: 0.55, n: each(run8, [["a2", "e3", "a3"], ["a2", "e3", "a3"], ["f2", "c3", "f3"], ["e2", "b2", "e3"],
            ["a2", "e3", "a3"], ["a2", "e3", "a3"], ["f2", "c3", "f3"], ["e2", "b2", "e3"]]) },
        ],
        drums: {
          kick: "x.....x.....x...",
          taiko: "3.....2.....2... | 3.....2.....3.22",
          tom: "........1.......",
          hat: "x.x.x.x.x.x.x.x.",
          vel: 0.58,
          fill: { tom: "....11.12.22.333", hat: "................" },
        },
      },
      // 6 — C', the climb: F G A B, the brass arpeggios rising, the snare
      // building onto the dominant of E
      {
        name: "C' climb",
        chords: "F | G | A | B",
        pad: { inst: "strings", vel: 4.6 }, bass: { inst: "synbass", pat: "pump", vel: 0.62 },
        hits: { inst: "stab", pat: "x..x..x.", voicing: "power", oct: 3, vel: 0.42 },
        lead: { inst: "brass", unit: 0.5, vel: 1.3, n: bars("f4:3 a4:3 c5:2", "g4:3 b4:3 d5:2", "a4:3 cs5:3 e5:2", "b4:3 ds5:3 fs5:2") },
        parts: [
          { inst: "choir", unit: 0.5, vel: 2.4, n: bars("c4+f4:8", "d4+g4:8", "e4+a4:8", "ds4+fs4:8") },
          { inst: "timpani", vel: 0.45, n: bars("f1:2 f1:2", "g1:2 g1:2", "a1:2 a1:2", "b1?:.5*4 b1?:.25*4 b1:.25*4") },
        ],
        drums: {
          kick: "x.....x.....x...",
          snare: "....o.......o... | ....o...o...o... | ..o.o.o.o.o.o.o. | x.x.x.x.xxxxXXXX",
          hat: "x.x.x.x.x.x.x.x.",
          taiko: "3.......3.......",
          vel: 0.62,
        },
      },
      // 7 — D, Settle in Full: the field battle's hook in E major as a fanfare
      // over a gallop, horns and choir under it, a bell on the downbeats
      {
        name: "D settle in full",
        chords: CLAIM_CHORDS,
        pad: { inst: "strings", vel: 4.8 }, bass: { inst: "synbass", pat: "drive", vel: 0.5 },
        hits: { inst: "stab", pat: "x..x..o.", voicing: "power", oct: 3, vel: 0.4 },
        lead: { inst: "brass", unit: 0.5, vel: 1.8, n: CLAIM },
        counter: { inst: "horn", vel: 1.5, n: CLAIM_HORN },
        parts: [
          // the choir holds the horns' line, not the fanfare's eighths: every
          // choir note rings 0.8 s past its end, and doubling the tune stacked
          // five of them at once
          { inst: "choir", vel: 2.6, n: CLAIM_HORN },
          { inst: "bell", vel: 0.3, n: bars("e5:4", ".:4", ".:4", ".:4", "e5:4", ".:4", ".:4", ".:4") },
          // eighths under the fanfare: the gallop kick already fills the sixteenths
          { inst: "spiccato", unit: 0.5, vel: 0.55, n: bars(
            each(run8, [["e2", "b2", "e3"], ["gs2", "ds3", "fs3"], ["d3", "a3", "d4"], ["a2", "e3", "a3"], ["c3", "g3", "c4"], ["d3", "a3", "d4"]]),
            halves(run8("a2", "e3", "a3"), run8("b2", "fs3", "b3")), run8("e2", "b2", "e3")) },
          { inst: "timpani", vel: 0.42, n: bars("e2:4", ".:4", "d2:4", "a1:4", "c2:4", "d2:4", "a1:2 b1:2", "e2:4") },
        ],
        // the backbeat unaccented: the gallop puts a kick under every snare
        drums: { ...GROOVES.gallop, snare: "....x.......x..o", hat: "x.x.x.x.x.x.x.x.", crash: onFirst("X...............", 4), vel: 0.55 },
      },
      // 8 — E, the turn home: F G E7, the brass falling back into A minor,
      // the toms into the hook
      {
        name: "E turn",
        chords: "F | G | E7sus4 | E7",
        pad: { inst: "strings", vel: 4.4 }, bass: { inst: "synbass", pat: "oct", vel: 0.62 },
        hits: { inst: "stab", pat: "X.......", voicing: "power", oct: 3, vel: 0.5 },
        lead: { inst: "brass", unit: 0.5, vel: 1.5, n: bars("a5:3 f5:3 c5:2", "b5:3 g5:3 d5:2", "a5:3 e5:3 b4:2", "gs4:2 b4:2 d5:2 e5:2") },
        counter: { inst: "horn", vel: 1.4, n: bars("c5:4", "d5:4", "d5:2 b4:2", "b4:2 gs4:2") },
        parts: [
          { inst: "timpani", vel: 0.45, n: bars("f1:4", "g1:4", "e2:4", "e2?:.25*6 e2:.25*6 e2:1") },
        ],
        drums: {
          kick: "x.........x.....",
          snare: "........X.......",
          hat: "x.x.x.x.x.x.x.x.",
          crash: "X...............",
          vel: 0.62,
          fill: FILLS.toms,
        },
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6, 7, 8], loopFrom: 1,
  },
} satisfies Piece;
