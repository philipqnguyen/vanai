// ---------- Capital battle — "Deliver the City Whole" ----------
// The Burned Land and the empty Capital fight to this: the fire line exactly as
// ragged as the night left it, pale ash country with every glassed trunk bent
// away from the centre, and at the centre, untouched, the capital — a whole
// city set like a table, no dust because someone has been dusting, its gold
// crown always the brightest thing in frame. The Regent speaks from the walls
// and the household guard holds the avenue on one command: deliver the city
// whole. It is the end of the road, so it is the most urgent piece in the
// score; it is still this game, so it is never horror — the dark is polite,
// and the gold is always in view.
//
//   * 7/8 at the field's own 168. The field battle strides 3+3+2; this one
//     strides 3+2+2 — the same stride with one step cut out of it, so it never
//     quite lands and keeps tipping forward. Kick on 1 and 6, snare on 4 and 7,
//     stabs and spiccato on the 3+2+2.
//   * C minor, with G major as its dominant (the B natural) and Db, the
//     Neapolitan, for the darkest corner. The hook IS the field hook — its
//     5 1 2 | b3 2 b7 (g c d | eb d bb) — in the minor and squeezed into the
//     7/8: the claim you staked, brought to the house's front door.
//   * The choir is the household, the city's one new colour against the field
//     theme: an "ah" held under the hook, and in B the tune itself.
//   * B, the Crown: the gold in frame. Up to Eb major, and the field hook
//     comes back in the MAJOR, sung by strings and choir over half-time drums;
//     B' gives it to the brass over a sixteenth gallop. The brightest minute in
//     the Burned Land.
//   * C, the Census: no kit — taiko in 7/8, a spiccato pedal on C under Db/C
//     (the polite dark), glass where the trunks glassed, and the horn walking
//     the hook through the Neapolitan. Then four bars of climb into A''.
//
// Intro: two bars of hits and a snare run, skipped on loop. Loop: A A' B B' C
// D A'', 52 bars at 1.25 s = 65 s.
//
// The 7/8 is written out, not left to the engine: the bass patterns divided a
// bar into equal steps when this was written, which in seven eighths landed
// between them (music.ts bassSteps now steps 3+2+2), so the synbass and bass
// are written parts and every chord lasts a whole bar.

import { onFirst, type Piece } from "./kit.ts";
import type { Drums } from "../music";

const bars = (...b: string[]) => b.join(" | ");

/** Spiccato eighths on the 3+2+2, the accent on the downbeat only: the second
 *  leg belongs to the snare and the stabs, the third to the kick. Stacking
 *  the strings' accent, a kick, the snare, the stabs and the brass on the "4"
 *  was the piece's one hot peak. */
const sp7 = (r: string, f: string, o: string) => `${r}! ${r} ${f} ${o} ${f} ${r} ${o}`;
/** synbass eighths on the 3+2+2, root on each leg, octave between. No accent:
 *  the timpani strikes the same pitch on the downbeats, and the pair of them
 *  under a brass entry was where every peak came from. */
const pump7 = (r: string, o: string) => `${r} ${r} ${o} ${r} ${o} ${r} ${o}`;
/** synbass sixteenths in the gallop's shape, re-cut 3+2+2 (6+4+4) */
const gal7 = (r: string, o: string) => `${r} ${r} ${r} ${o} ${r} ${r} ${r} ${r} ${o} ${r} ${r} ${r} ${o} ${r}`;
/** half-time bass: a dotted quarter and two quarters */
const half7 = (r: string, o: string) => `${r}:3 ${o}:2 ${r}:2`;
const each = (f: (...a: string[]) => string, rows: string[][]) => bars(...rows.map((r) => f(...r)));

/** The A groove: kick on 1 and 6, snare on 4 and 7, sixteenth hats. 14 steps
 *  is a bar of sixteenths in 7/8. The kick never doubles the snare on 4. */
const stride7 = (vel: number, fill: Drums["fill"], kick = "x.........x.x."): Drums => ({
  kick: `x.........x... | ${kick}`,
  snare: "......X.....X. | ......X.....Xo",
  hat: "xoxoxoxoxoxoxo",
  crash: onFirst("X.............", 8),
  vel,
  fill,
});

/** The hook in 7/8 (brass, unit 0.5). Half-close on G in bar 4, the same call
 *  a fourth up in F minor, the Neapolitan Db, then the B natural home to G7. */
const HOOK = bars(
  "g4:3 c5:2 d5:2", "ef5:3 d5:2 bf4:2", "c5:3 ef5:2 af5:2", "g5:5 f5 d5",
  "c5:3 f5:2 g5:2", "af5:3 g5:2 ef5:2", "f5:3 ef5:2 df5:2", "b4:3 d5:2 g5:2");
const HOOK_CHORDS = "Cm | Cm7 | Ab | G | Fm | Fm7 | Db | G7";
const ANSWER = bars(
  "g4:3 c5:2 d5:2", "ef5:3 d5:2 bf4:2", "c5:3 ef5:2 af5:2", "g5:5 f5 d5",
  "c5:3 f5:2 g5:2", "af5:3 c6:2 bf5:2", "g5:3 f5:2 d5:2", "ef5:2 d5 c5:4");
const ANSWER_CHORDS = "Cm | Cm7 | Ab | G | Fm | Ab | G7 | Cm";
/** the horn under the hook: long tones moving against it */
const HORN = bars("ef4:7", "d4:3 bf3:4", "c4:3 ef4:4", "d4:7", "c4:7", "c4:3 ef4:4", "df4:3 f4:4", "d4:3 b3:4");
const HORN_ANSWER = bars("ef4:7", "d4:3 bf3:4", "c4:3 ef4:4", "d4:7", "c4:7", "c4:3 ef4:4", "d4:3 f4:4", "ef4:3 g4:4");
/** the household's "ah": two voices held a bar each */
const CHOIR = bars("c4+ef4:7", "bf3+ef4:7", "c4+ef4:7", "b3+d4:7", "c4+f4:7", "c4+ef4:7", "df4+f4:7", "b3+d4:7");
const CHOIR_ANSWER = bars("c4+ef4:7", "bf3+ef4:7", "c4+ef4:7", "b3+d4:7", "c4+f4:7", "c4+ef4:7", "b3+d4:7", "c4+g4:7");

const SP_HOOK = each(sp7, [["c3", "g3", "c4"], ["c3", "g3", "bf3"], ["af2", "ef3", "af3"], ["g2", "d3", "g3"],
  ["f2", "c3", "f3"], ["f2", "c3", "ef3"], ["df3", "af3", "df4"], ["g2", "d3", "f3"]]);
const SP_ANSWER = each(sp7, [["c3", "g3", "c4"], ["c3", "g3", "bf3"], ["af2", "ef3", "af3"], ["g2", "d3", "g3"],
  ["f2", "c3", "f3"], ["af2", "ef3", "af3"], ["g2", "d3", "f3"], ["c3", "g3", "c4"]]);
const BASS_HOOK = each(pump7, [["c2", "c3"], ["c2", "c3"], ["af1", "af2"], ["g1", "g2"], ["f1", "f2"], ["f1", "f2"], ["df2", "df3"], ["g1", "g2"]]);
const BASS_ANSWER = each(pump7, [["c2", "c3"], ["c2", "c3"], ["af1", "af2"], ["g1", "g2"], ["f1", "f2"], ["af1", "af2"], ["g1", "g2"], ["c2", "c3"]]);

/** The Crown's tune: the field hook in Eb major (5 1 2 | 3 2 7). */
const CROWN = bars(
  "bf4:3 ef5:2 f5:2", "g5:3 f5:2 d5:2", "ef5:3 g5:2 c6:2", "bf5:5 af5 g5",
  "g5:3 f5:2 ef5:2", "af5:3 g5:2 f5:2", "ef5:3 f5:2 af5:2", "g5:3 d5:2 b4:2");
const CROWN_CHORDS = "Eb | Bb/D | Cm | Ab | Eb/G | Fm7 | Bb7sus4 | G";

export default {
  title: "Deliver the City Whole",
  battle: "capital",
  note: "the field's 3+3+2 stride with a step cut out (7/8, 3+2+2); the hook is the field hook in C minor; listen for the choir under it, the field hook again in Eb MAJOR in B (the gold crown), and the Neapolitan Db in the Census",
  song: {
    bpm: 168, beats: 3.5, space: 2.2,
    sections: [
      // 0 — intro: the band on the 3+2+2, then a run up into the hook
      {
        name: "intro",
        chords: "Cm | G",
        pad: { inst: "strings", vel: 3.4 }, bass: null,
        hits: { inst: "stab", pat: "X..X.X.", voicing: "power", oct: 3, vel: 0.55 },
        lead: { inst: "brass", unit: 0.5, vel: 1.1, n: bars("c4+g4!:3 c4+g4:2 c4+g4!:2", "g3 b3 d4 f4 g4 b4 d5") },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.75, n: each(pump7, [["c2", "c3"], ["g1", "g2"]]) },
          { inst: "timpani", unit: 0.5, vel: 0.45, n: bars("c2!:3 c2:2 c2:2", "g1:3 g1 g1 g1 g1") },
        ],
        drums: {
          kick: "X.....x...x... | x.....x...x...",
          taiko: "3.....3...3... | ..............",
          snare: ".............. | x.x.x.x.xxxXXX",
          crash: "X.............",
          vel: 0.72,
        },
      },
      // 1 — A: the hook on brass, the choir's "ah" under it, half-close on G7
      {
        name: "A hook",
        chords: HOOK_CHORDS,
        pad: { inst: "strings", vel: 4.4 }, bass: null,
        hits: { inst: "stab", pat: "x..x.o.", voicing: "power", oct: 3, vel: 0.44 },
        lead: { inst: "brass", unit: 0.5, vel: 1.7, n: HOOK },
        counter: { inst: "horn", unit: 0.5, vel: 1.4, n: HORN },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.5, n: BASS_HOOK },
          { inst: "spiccato", unit: 0.5, vel: 0.6, n: SP_HOOK },
          { inst: "choir", unit: 0.5, vel: 2.8, n: CHOIR },
          { inst: "timpani", unit: 0.5, vel: 0.42, n: bars("c2!:7", ".:7", "af1:7", "g1:7", "f1:7", ".:7", "df2:7", "g1:3 g1:2 g1:2") },
        ],
        drums: stride7(0.55, { snare: "x.x.x.x.x.xXXX", hat: ".............." }),
      },
      // 2 — A': the answer, up to the c6 and home to C
      {
        name: "A' answer",
        chords: ANSWER_CHORDS,
        pad: { inst: "strings", vel: 4.4 }, bass: null,
        hits: { inst: "stab", pat: "x..x.o.", voicing: "power", oct: 3, vel: 0.44 },
        lead: { inst: "brass", unit: 0.5, vel: 1.7, n: ANSWER },
        counter: { inst: "horn", unit: 0.5, vel: 1.4, n: HORN_ANSWER },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.5, n: BASS_ANSWER },
          { inst: "spiccato", unit: 0.5, vel: 0.6, n: SP_ANSWER },
          { inst: "choir", unit: 0.5, vel: 2.8, n: CHOIR_ANSWER },
          { inst: "timpani", unit: 0.5, vel: 0.42, n: bars("c2:7", ".:7", "af1:7", "g1:7", "f1:7", "af1:7", "g1:7", "c2:3 c2:2 g1:2") },
        ],
        drums: stride7(0.55, { tom: "....11..22.333", snare: "X.x...........", hat: ".............." }),
      },
      // 3 — B, the Crown: Eb major, the field hook in the major on strings and
      // choir over half-time drums
      {
        name: "B crown",
        chords: CROWN_CHORDS,
        pad: { inst: "strings", vel: 4.2 }, bass: null,
        arp: { inst: "pizz", pat: "0 1 2 0 2 1 2", unit: 0.5, oct: 4, vel: 1 },
        lead: { inst: "strings", unit: 0.5, vel: 4.1, n: CROWN },
        counter: { inst: "choir", oct: -1, unit: 0.5, vel: 3.2, n: CROWN },
        parts: [
          { inst: "bass", unit: 0.5, vel: 0.62, n: each(half7, [["ef2", "ef3"], ["d2", "d3"], ["c2", "c3"], ["af1", "af2"],
            ["g1", "g2"], ["f1", "f2"], ["bf1", "bf2"], ["g1", "g2"]]) },
          { inst: "horn", unit: 0.5, vel: 1.1, n: bars("g4:7", "f4:7", "g4:7", "ef4:7", "ef4:7", "c4:7", "f4:3 ef4:4", "d4:7") },
        ],
        drums: {
          vel: 0.68,
          kick: "x.........x...",
          snare: "......X.......",
          hat: "x.x.x.x.x.x.x.",
          taiko: onFirst("3.............", 4) + " | " + onFirst("3.............", 4),
          fill: { snare: "........x.xXXX" },
        },
      },
      // 4 — B': the same tune on the brass over a sixteenth gallop
      {
        name: "B' crown charge",
        chords: "Eb | Bb/D | Cm | Ab | Eb/G | Fm7 | Bb7sus4 | G7",
        pad: { inst: "strings", vel: 4.4 }, bass: null,
        hits: { inst: "stab", pat: "x..x.o.", voicing: "power", oct: 3, vel: 0.38 },
        lead: { inst: "brass", unit: 0.5, vel: 1.65, n: CROWN },
        counter: { inst: "strings", vel: 2, unit: 0.5, n: bars("g5:7", "f5:7", "ef5:7", "c5:7", "bf4:7", "c5:7", "f5:3 ef5:4", "d5:3 f5:4") },
        parts: [
          { inst: "synbass", unit: 0.25, vel: 0.45, n: each(gal7, [["ef2", "ef3"], ["d2", "d3"], ["c2", "c3"], ["af1", "af2"],
            ["g1", "g2"], ["f1", "f2"], ["bf1", "bf2"], ["g1", "g2"]]) },
          { inst: "choir", unit: 0.5, vel: 2.6, n: bars("ef4+g4:7", "d4+f4:7", "ef4+g4:7", "ef4+af4:7", "ef4+g4:7", "f4+af4:7", "f4+af4:7", "d4+f4:7") },
          // the drum marks the phrases only: struck on the gallop's own pitch
          // every bar, it piled the low end up into the section's peaks
          { inst: "timpani", unit: 0.5, vel: 0.42, n: bars("ef2:7", ".:7", ".:7", ".:7", "g1:7", ".:7", ".:7", "g1:3 g1:2 g1:2") },
        ],
        drums: {
          kick: "x.....x...x...",
          snare: "...x....x...x.",
          hat: "x.x.x.x.x.x.x.",
          open: "............x.",
          crash: onFirst("X.............", 8),
          vel: 0.55,
          fill: { snare: "X.x.x.x.xxxxXX", hat: ".............." },
        },
      },
      // 5 — C, the Census: no kit; taiko in 7/8, a spiccato pedal on C under
      // Db/C, glass, and the horn walking the hook through the Neapolitan
      {
        name: "C census",
        chords: "Cm | Db/C | Cm | Db/C | Fm/C | Db/C | Ab/C | G",
        pad: { inst: "choir", vel: 1.5 }, bass: null,
        lead: { inst: "horn", unit: 0.5, vel: 1.7, n: bars(
          "g4:3 c5:4", "df5:3 c5:2 af4:2", "g4:3 c5:2 ef5:2", "f5:3 ef5:2 df5:2",
          "c5:3 f5:2 af5:2", "af5:3 g5:2 f5:2", "ef5:3 c5:2 af4:2", "b4:3 d5:2 g5:2") },
        counter: { inst: "glass", unit: 0.5, vel: 0.3, n: bars(
          ".:3 g6:4", ".:3 af6:4", ".:3 g6:4", ".:3 f6:4", ".:3 af6:4", ".:3 f6:4", ".:3 ef6:4", ".:3 d6:4") },
        parts: [
          { inst: "spiccato", unit: 0.5, vel: 0.6, n: each(sp7, [["c3", "g3", "c4"], ["c3", "af3", "df4"], ["c3", "g3", "c4"], ["c3", "af3", "df4"],
            ["c3", "af3", "c4"], ["c3", "af3", "df4"], ["c3", "ef3", "af3"], ["g2", "d3", "g3"]]) },
          { inst: "bass", unit: 0.5, vel: 0.55, n: bars("c2:7", "c2:7", "c2:7", "c2:7", "c2:7", "c2:7", "c2:7", "g1:7") },
          { inst: "timpani", unit: 0.5, vel: 0.42, n: bars(".:7", ".:7", ".:7", ".:7", "c2:7", ".:7", ".:7", ".:5 g1? g1") },
        ],
        drums: {
          taiko: "3.....2...2... | 3.....2...2.22",
          shaker: "x.x.x.x.x.x.x.",
          vel: 0.55,
          fill: { taiko: "2.....2...2...", snare: "......rrrrRRRR" },
        },
      },
      // 6 — D, the climb: brass up a step a bar on the 3+2+2, snare building
      {
        name: "D climb",
        chords: "Fm | G | Ab | G7",
        pad: { inst: "strings", vel: 4.4 }, bass: null,
        lead: { inst: "brass", unit: 0.5, vel: 1.1, n: bars("f4:3 af4:2 c5:2", "g4:3 b4:2 d5:2", "af4:3 c5:2 ef5:2", "b4:3 d5:2 f5:2") },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.6, n: each(pump7, [["f1", "f2"], ["g1", "g2"], ["af1", "af2"], ["g1", "g2"]]) },
          { inst: "spiccato", unit: 0.5, vel: 0.55, n: each(sp7, [["f2", "c3", "f3"], ["g2", "d3", "g3"], ["af2", "ef3", "af3"], ["g2", "d3", "f3"]]) },
          { inst: "timpani", unit: 0.5, vel: 0.45, n: bars("f1:3 f1:2 f1:2", "g1:3 g1:2 g1:2", "af1:3 af1:2 af1:2", "g1? g1? g1? g1? g1 g1 g1") },
        ],
        drums: {
          kick: "x.....x...x...",
          taiko: "3.....3.......",
          snare: "......o.....o. | ......o...o.o. | ..o...o.o.o.o. | x.x.x.x.xxxXXX",
          hat: "x.x.x.x.x.x.x.",
          vel: 0.62,
        },
      },
      // 7 — A'': everything — the answer, the choir, a heavier kick, and the
      // tom fill back into the hook
      {
        name: "A'' all",
        chords: ANSWER_CHORDS,
        pad: { inst: "strings", vel: 4.6 }, bass: null,
        hits: { inst: "stab", pat: "x..x.o.", voicing: "power", oct: 3, vel: 0.46 },
        lead: { inst: "brass", unit: 0.5, vel: 1.75, n: ANSWER },
        counter: { inst: "horn", unit: 0.5, vel: 1.5, n: HORN_ANSWER },
        parts: [
          { inst: "synbass", unit: 0.5, vel: 0.5, n: BASS_ANSWER },
          { inst: "spiccato", unit: 0.5, vel: 0.6, n: SP_ANSWER },
          { inst: "choir", unit: 0.5, vel: 3, n: CHOIR_ANSWER },
          { inst: "timpani", unit: 0.5, vel: 0.42, n: bars("c2:7", ".:7", "af1:7", "g1:7", "f1:7", "af1:7", "g1:7", "c2:3 g1? g1 g1:2") },
        ],
        drums: stride7(0.56, { tom: "....11..22.333", snare: "X.x...........", hat: ".............." }, "x..x......x.xx"),
      },
    ],
    form: [0, 1, 2, 3, 4, 5, 6, 7], loopFrom: 1,
  },
} satisfies Piece;
