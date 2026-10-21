// ---------- Heartwood — "Where the Old Trees Can Hear" ----------
// The unconquered city inside its ring of living trees, on the bay: homes
// grown into the great trunks, rope bridges between them, the brook, the
// Song-Steps where the chanters teach, the Grudge Hall where the floor is
// grudges, amber windows at night. The empire's survey chains stopped where
// the grove began. Heartwood keeps everything in songs — "law, land, grudges,
// recipes. Paper burns and stone gets carted off by empires, but a song lives
// in too many chests to steal." Grievance with receipts, and a sense of humour
// about it.
//
// So the city's music is a song, not a march: a folk ballad in 3/4 at 112, in
// A dorian — minor, but with the raised sixth (F#, the D-major chord) that
// keeps it proud rather than sorry, the mode old ballads are sung in. The
// tune is the greeting-song every newcomer learns: "four lines, older than
// the walls we don't have" — four 4-bar lines, a half-close on the second
// (the dorian bass walks A G F# E under it) and home on the fourth. There is
// no brass and no snare anywhere: those are Caerdun's. Heartwood's band is a
// flute, a reed, a lute and harp, hand drums, and the ring of voices.
//
//   intro  the greeting's head as a call on flute over a frame-drum heartbeat
//          — skipped on the loop
//   A      the Greeting: the tune on flute over harp, a soft hand drum on the
//          one; the reed answers in the bars where the flute holds
//   A'     the Ring sings it back: the reed takes the tune at singing pitch,
//          the flute a descant above it, the choir a bed, lute and shaker
//   B      the Grudge Hall: E minor, a sly low reed tune over a pizzicato
//          oom-pah-pah and knocks on wood ("people call us bitter; we prefer
//          accurate"), B7's D# for the bite; the flute joins in the second half
//   C      the Song-Steps: the battle-chanters' war-song, banned by the empire
//          and sung again — choir and reed in unison on long chant notes, the
//          greeting's own rising e-a at its head, taiko and hand drums under a
//          lute strum, the flute high above. The loudest section.
//   D      the Counting-Song: one verse a family. It is the Heartwood Fields'
//          tune (score/heartwoodfields.ts, there a swung 4/4 in F), here in
//          the city's 3/4 and in G, on flute over harp, a voice joining each
//          line and one bell stroke counting each: one, two, three, four. Its
//          ending is banned, so the last line stops a bar short of home and
//          the harmony slides to E instead of G — then the bell strikes five,
//          after the tune has stopped. "The counting doesn't stop at today.
//          Somebody counted past us." The greeting's A minor answers it, on
//          the loop.
//
// The homesickness is all in D, and it is gentle: a children's song that is
// still counting.

import type { Piece } from "./kit.ts";

const bars = (...b: string[]) => b.join(" | ");
const rep = (bar: string, n: number) => Array(n).fill(bar).join(" | ");

/** The greeting-song: four lines. Line 2 half-closes on Em over the walking
 *  dorian bass; line 3 lifts to G; line 4 comes home. A, A' (and the intro's
 *  call) play it. */
const GREETING_CHORDS = `
  Am | Em   | G     | Am |
  Am | Am/G | D/F#  | Em |
  Am | C    | D     | G  |
  C  | Am   | Em    | Am `;
const GREETING = `
  e4 a4 a4      | b4:2 c5          | d5 c5 b4          | a4:3 |
  e5:2 d5       | c5:1.5 b4:.5 a4  | a4 g4 fs4         | e4:3 |
  a4 c5 e5      | g5:2 e5          | d5 e5 fs5         | g5:3 |
  e5:2 d5       | c5 b4 a4         | b4:1.5 g4:.5 e4   | a4:3 `;
/** the reed's answers in A: only where the flute holds a line's last note */
const GREETING_ANSWER = `
  .:3 | .:3 | .:3 | .:1 e4:.5 g4:.5 a4 |
  .:3 | .:3 | .:3 | .:1 b3:.5 d4:.5 e4 |
  .:3 | .:3 | .:3 | .:1 b4:.5 a4:.5 g4 |
  .:3 | .:3 | .:3 | .:1 c5:.5 b4:.5 a4 `;
/** A' descant over the reed's tune: slow, mostly a third or sixth above */
const GREETING_DESCANT = `
  a5:3 | g5:3 | g5:2 b5 | a5:2 e5 |
  c6:2 b5 | a5:3 | a5:1.5 b5:.5 a5 | g5:3 |
  a5:3 | c6:3 | a5:3 | b5:3 |
  c6:2 b5 | a5:3 | b5:2 g5 | a5:3 `;
/** the bass in 3/4: root on the one, the fifth on three (no engine pattern
 *  walks root-fifth in 3/4, so the bass is written out) */
const GREETING_BASS = `
  a2:2 e2 | e2:2 b1 | g2:2 d2 | a2:2 e2 |
  a2:2 e2 | g2:2 e2 | fs2:2 a2 | e2:2 b1 |
  a2:2 e2 | c3:2 g2 | d3:2 a2 | g2:2 d2 |
  c3:2 g2 | a2:2 e2 | e2:2 b1 | a2:3 `;

export default {
  title: "Where the Old Trees Can Hear",
  zones: ["heartwood"],
  note: "a 3/4 ballad in A dorian: the greeting-song on flute, then sung back on reed under a descant; the Grudge Hall (E minor, pizzicato, knocks on wood); the chanters' war-song (choir, taiko); and the counting-song (the Fields' tune), which stops short of home while its bell keeps counting",
  song: {
    bpm: 112, beats: 3, space: 2.8,
    sections: [
      // 0 — intro: the greeting's head as a call, a frame-drum heartbeat
      {
        name: "intro",
        chords: "Am | G | Am | Esus4",
        pad: { inst: "strings", vel: 0.5 }, bass: { pat: "swell", vel: 0.6 },
        lead: { inst: "flute", vel: 0.9, n: "e5 a5:2 | g5:1.5 e5:.5 d5 | e5:3 | .:3" },
        counter: { inst: "harp", vel: 0.6, n: "a3+e4+a4:3 | g3+d4+g4:3 | a3+e4+a4:3 | e3+a3+b3:3" },
        parts: [{ inst: "drum", vel: 0.55, n: "a2 .:2 | a2 .:2 | a2 .:2 | a2 . e2?" }],
      },
      // 1 — A, the Greeting: flute over harp, the reed answering
      {
        name: "A Greeting",
        chords: GREETING_CHORDS,
        pad: { inst: "strings", vel: 0.45 }, bass: null,
        lead: { inst: "flute", oct: 1, vel: 0.95, n: GREETING },
        counter: { inst: "reed", vel: 0.55, n: GREETING_ANSWER },
        arp: { inst: "harp", pat: "0 1 2 3 2 1", unit: 0.5, oct: 3, vel: 0.7 },
        parts: [
          { inst: "bass", vel: 0.75, n: GREETING_BASS },
          { inst: "drum", vel: 0.5, n: rep("a2 .:2", 15) + " | a2 . e2?" },
        ],
        drums: { shaker: "x...x...x...", vel: 0.45 },
      },
      // 2 — A', the Ring sings it back: reed tune, flute descant, choir bed
      {
        name: "A' Ring",
        chords: GREETING_CHORDS,
        pad: { inst: "choir", vel: 0.85 }, bass: null,
        lead: { inst: "reed", vel: 0.95, n: GREETING },
        counter: { inst: "flute", vel: 0.6, n: GREETING_DESCANT },
        arp: { inst: "lute", pat: "0 1 2 1 2 1", unit: 0.5, oct: 3, vel: 0.75 },
        parts: [
          { inst: "bass", vel: 0.95, n: GREETING_BASS },
          { inst: "strings", vel: 0.45, n: bars(
            "c4:3", "b3:3", "b3:3", "c4:3", "c4:3", "c4:3", "a3:3", "g3:3",
            "c4:3", "e4:3", "fs4:3", "d4:3", "e4:3", "c4:3", "b3:3", "c4:3") },
          { inst: "drum", vel: 0.55, n: rep("a2 . e2?", 16) },
        ],
        drums: { shaker: "x.x.x.x.x.x.", tom: "........2...", vel: 0.5 },
      },
      // 3 — B, the Grudge Hall: E minor, sly reed, oom-pah-pah, knocks on wood
      {
        name: "B Grudge Hall",
        chords: `
          Em | Em | Am | Em | C  | Am | B7 | Em |
          Em | D  | C  | B7 | Em | Am | B7 | Em `,
        pad: { inst: "strings", vel: 0.35 }, bass: null,
        lead: { inst: "reed", vel: 0.9, n: `
          e4 g4 b4            | c5:2 b4         | a4 c5 e5        | b4:3     |
          e5:2 c5             | a4 b4 c5        | b4 a4 fs4       | e4:3     |
          g4:.5 a4:.5 b4 b4   | a4:.5 b4:.5 a4 fs4 | g4:.5 a4:.5 b4 e5 | ds5:2 b4 |
          e5:1.5 d5:.5 b4     | c5 b4 a4        | b4 a4 fs4       | e4:3 ` },
        counter: { inst: "flute", vel: 0.45, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          g5:3 | fs5:3 | e5:3 | fs5:3 | g5:3 | e5:3 | ds5:3 | e5:3 ` },
        hits: { inst: "pizz", pat: "..x.x.", unit: 0.5, oct: 3, vel: 0.9 },
        parts: [
          { inst: "bass", vel: 0.85, n: bars(
            "e2:3", "e2:3", "a2:3", "e2:3", "c3:3", "a2:3", "b2:3", "e2:3",
            "e2:3", "d2:3", "c3:3", "b2:3", "e2:3", "a2:3", "b2:3", "e2:3") },
          // knocks on wood: the grudge-keepers' receipts, on the off-bars
          { inst: "drum", vel: 0.4, n: rep(".:2 c4?", 1) + " | " + rep(".:3 | .:2 c4?", 7) + " | .:3" },
          { inst: "drum", vel: 0.5, n: rep("e2 .:2", 16) },
        ],
      },
      // 4 — C, the Song-Steps: the banned war-song, sung again
      {
        name: "C Song-Steps",
        chords: `
          Am | G | C | G | Am | D | Em | E |
          Am | G | C | D | C  | G | Esus4 E | Am `,
        pad: { inst: "strings", vel: 0.95 }, bass: null,
        // bar 15's G sharp falls at beat 1.5 with the Esus4 -> E split (where
        // the flute's does), not on beat 3 against the flute's G sharp
        lead: { inst: "choir", vel: 1.4, n: `
          e4:1 a4:2 | b4:1 d5:2 | e5:2 d5 | d5:3 |
          c5:2 b4   | a4:2 fs4  | g4 a4 b4 | b4:3 |
          e5:2 e5   | d5:2 b4   | c5:2 e5 | fs5:3 |
          e5:2 d5   | b4:2 g4   | a4:1.5 gs4:1.5 | a4:3 ` },
        counter: { inst: "flute", vel: 0.55, n: `
          c6:3 | b5:3 | g5:3 | b5:1 a5:.5 b5:.5 d6 |
          e6:2 c6 | d6:2 a5 | b5:3 | gs5 b5 e6 |
          c6:3 | b5:3 | c6:2 e6 | a5 d6:2 |
          e6:2 d6 | d6:2 b5 | b5:1.5 gs5:1.5 | a5:3 ` },
        hits: { inst: "lute", pat: "X-x.x.", unit: 0.5, oct: 3, vel: 0.7 },
        parts: [
          // the reed doubles the chant so its words (the notes) speak on time
          { inst: "reed", vel: 0.85, n: `
          e4:1 a4:2 | b4:1 d5:2 | e5:2 d5 | d5:3 |
          c5:2 b4   | a4:2 fs4  | g4 a4 b4 | b4:3 |
          e5:2 e5   | d5:2 b4   | c5:2 e5 | fs5:3 |
          e5:2 d5   | b4:2 g4   | a4:1.5 gs4:1.5 | a4:3 ` },
          { inst: "bass", vel: 1.1, n: bars(
            "a2:2 e2", "g2:2 d2", "c3:2 g2", "g2:2 d2", "a2:2 e2", "d2:2 a2", "e2:2 b1", "e2:2 e2",
            "a2:2 e2", "g2:2 d2", "c3:2 g2", "d2:2 a2", "c3:2 g2", "g2:2 d2", "e2:2 e2", "a2:3") },
          { inst: "drum", vel: 0.6, n: rep("a2 a2? e2", 16) },
        ],
        drums: {
          taiko: "3.....2...2. | 3.....2.3.2.",
          tom: "....2.....1.",
          shaker: "x.x.x.x.x.x.",
          vel: 0.75,
          fill: { taiko: "3...3...2.22", tom: "1.1.2.2.3.3.", every: 8 },
        },
      },
      // 5 — D, the Counting-Song: the Fields' tune, and the count goes on
      {
        name: "D Counting-Song",
        chords: `
          G   | G   | G     | C     | G/B   | D     | Em    | Em |
          Am7 | Am7 | D7sus4 D | Esus4 | Esus4 | Esus4 | E  | E `,
        pad: null, bass: null,
        lead: { inst: "flute", vel: 0.8, n: `
          d5 g5:.5 g5:.5 a5 | b5 d6:1.5 b5:.5 | g5:3 |
          e5 g5:.5 g5:.5 c6 | b5 a5 g5        | d5:3 |
          b5 b5:.5 a5:.5 g5 | e5:3            | a5:1.5 g5:.5 e5 |
          c5:3              | d5 g5:.5 fs5:.5 a5 | a5:3 |
          .:3 | .:3 | .:3 | .:3 ` },
        // a voice joins each line: strings in the second, the reed in the
        // third, the choir in the fourth, and the choir alone holds the count
        counter: { inst: "reed", vel: 0.45, n: `
          .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
          g4:3 | g4:2 b4 | c5:3 | e4:3 | d4:2 fs4 | e4:3 |
          .:3 | .:3 | .:3 | .:3 ` },
        arp: { inst: "harp", pat: "0 1 2", unit: 1, oct: 3, vel: 0.75 },
        parts: [
          // the count: one stroke, two, three, four — and five after the song stops
          { inst: "bell", vel: 0.45, n: `
            g5:3 | .:3 | .:3 | g5 g5:2 | .:3 | .:3 |
            g5 g5 g5 | .:3 | .:3 | g5 g5 g5 | g5:3 | .:3 |
            e5 e5 e5 | e5 e5 . | .:3 | .:3 ` },
          { inst: "strings", vel: 0.42, n: `
            .:3 | .:3 | .:3 | g3+e4:3 | g3+d4:3 | fs3+a3:3 |
            g3+b3:3 | g3+b3:3 | g3+c4:3 | g3+c4:3 | a3+d4:3 | a3+b3:3 |
            .:3 | .:3 | .:3 | .:3 ` },
          { inst: "choir", vel: 0.7, n: `
            .:3 | .:3 | .:3 | .:3 | .:3 | .:3 |
            .:3 | .:3 | .:3 | c4+e4:3 | c4+d4:3 | a3+b3:3 |
            a3+b3:3 | a3+b3:3 | gs3+b3:3 | gs3+b3:3 ` },
          { inst: "bass", vel: 0.7, n: bars(
            "g2:3", "g2:3", "g2:3", "c3:3", "b2:3", "d2:3", "e2:3", "e2:3",
            "a2:3", "a2:3", "d2:3", "e2:3", "e2:3", "e2:3", "e2:3", "e2:3") },
        ],
      },
    ],
    form: [0, 1, 2, 3, 4, 5], loopFrom: 1,
  },
} satisfies Piece;
