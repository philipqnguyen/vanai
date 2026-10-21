// Demonstrations of the 2026-10-11 voices and grooves, for the jukebox's
// "Palette" shelf and for calibrating levels by render (tools/music/render.mjs
// --palette <key>). Not score: nothing here plays in the game. Each is short,
// loops, and shows the voice doing what a composer will ask of it — a brass
// line with long and short notes, a spiccato ostinato at battle tempo, a
// timpani roll into a hit.

import type { Song } from "./music";
import { FILLS, GROOVES, onFirst } from "./score/kit.ts";

export interface Demo { key: string; title: string; note: string; song: Song }

const chordsC = "C | Am | F | G";

export const PALETTE: Demo[] = [
  {
    key: "brass", title: "Brass", note: "long notes swell and get vibrato; short ones bite",
    song: {
      bpm: 104, space: 2.4,
      sections: [{
        chords: chordsC, pad: { inst: "strings", vel: 0.6 }, bass: { pat: "root" },
        lead: { inst: "brass", n: "c4:2 e4 g4 | a4:3 g4 | f4:.5 g4:.5 a4:.5 c5:.5 a4:2 | g4:4" },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "horn", title: "Horn", note: "the warm answer: no bite, slow bloom",
    song: {
      bpm: 84, space: 3.0,
      sections: [{
        chords: "F | Dm | Bb | C", pad: { inst: "strings", vel: 0.5 }, bass: { pat: "swell" },
        lead: { inst: "horn", n: "c4:2 f4:2 | a4:3 g4 | f4:2 d4:2 | e4:4" },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "stab", title: "Brass stabs (hits)", note: "the chord punched on a grid, following the changes",
    song: {
      bpm: 164, space: 1.8,
      sections: [{
        chords: "Dm | Bb | C | A", bass: { inst: "synbass", pat: "drive" }, pad: null,
        hits: { inst: "stab", pat: "X..x..x.....x.x.", unit: 0.25, oct: 4 },
        drums: { ...GROOVES.drive },
      }],
      form: [0, 0, 0, 0], loopFrom: 0,
    },
  },
  {
    key: "spiccato", title: "Spiccato ostinato", note: "short bowed strings at 168: an engine for a fight",
    song: {
      bpm: 168, space: 2.0,
      sections: [{
        chords: "Am | F | C | G", pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root" },
        lead: { inst: "spiccato", unit: 0.5, n: `
          a3 a3! e4 a3 c4! a3 e4 c4 | a3 a3! f4 a3 c4! a3 f4 c4 |
          g3 g3! e4 g3 c4! g3 e4 c4 | g3 g3! d4 g3 b3! g3 d4 b3 ` },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "pizz", title: "Pizzicato", note: "plucked strings for a town's walking bass or a sly tune",
    song: {
      bpm: 112, space: 2.2,
      sections: [{
        chords: "G | Em | C | D", pad: null, bass: null,
        lead: { inst: "pizz", unit: 0.5, n: "g3 b3 d4 b3 g3 b3 d4 b3 | e3 g3 b3 g3 e3 g3 b3 g3 | c3 e3 g3 e3 c3 e3 g3 e3 | d3 fs3 a3 fs3 d4:2 . ." },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "lute", title: "Lute", note: "Karplus-Strong with a plectrum: the market-square string",
    song: {
      bpm: 180, beats: 6, space: 2.2,
      sections: [{
        chords: "D | G | A | D", pad: null, bass: { pat: "oct", vel: 0.6 },
        lead: { inst: "lute", n: "d4 fs4 a4 d5:2 a4 | g4 b4 d5 g5:2 d5 | a4 cs5 e5 a5:2 e5 | d5:3 d4+fs4+a4:3" },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "reed", title: "Reed", note: "a nasal double reed between oboe and shawm",
    song: {
      bpm: 96, space: 2.6,
      sections: [{
        chords: "Em | C | D | Em", pad: { inst: "strings", vel: 0.5 }, bass: { pat: "root" },
        lead: { inst: "reed", n: "e4:1.5 fs4:.5 g4 b4 | c5:2 b4 a4 | a4:1.5 g4:.5 fs4 d4 | e4:4" },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "synbass", title: "Synth bass", note: "gallop and sixteenths: the bass a battle drives on",
    song: {
      bpm: 164, space: 1.6,
      sections: [
        { chords: "Em | C | D | B", pad: null, bass: { inst: "synbass", pat: "gallop" }, drums: { kick: "x...x...x...x..." } },
        { chords: "Em | C | D | B", pad: null, bass: { inst: "synbass", pat: "sixteen", vel: 0.8 }, drums: { kick: "x...x...x...x..." } },
      ],
      form: [0, 1], loopFrom: 0,
    },
  },
  {
    key: "timpani", title: "Timpani", note: "tuned heads: a roll into a hit, then the classic I-V",
    song: {
      bpm: 120, space: 3.0,
      sections: [{
        chords: "C | C | G | C", pad: { inst: "strings", vel: 0.5 }, bass: null,
        lead: { inst: "timpani", n: "c2:.25*12 c2!:1 | g1:2 c2:2 | g1 g1 g1:.5 g1:.5 g1 | c2!:4" },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "taiko", title: "Taiko and toms", note: "the big drums alone (GROOVES.taiko), then a tom fill",
    song: {
      bpm: 140, space: 2.4,
      sections: [{
        chords: "Am | Am | Am | Am", pad: null, bass: null,
        drums: { ...GROOVES.taiko, fill: FILLS.toms },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
  {
    key: "kit-drive", title: "Kit: drive + fills", note: "GROOVES.drive at 168, a snare fill, a roll, a tom fill",
    song: {
      bpm: 168, space: 1.6,
      sections: [
        { chords: "Am | Am | Am | Am", pad: null, bass: null, drums: { ...GROOVES.drive, crash: onFirst("X...............", 4), fill: FILLS.snare } },
        { chords: "Am | Am | Am | Am", pad: null, bass: null, drums: { ...GROOVES.drive, fill: FILLS.roll } },
        { chords: "Am | Am | Am | Am", pad: null, bass: null, drums: { ...GROOVES.halftime, fill: FILLS.toms } },
      ],
      form: [0, 1, 2], loopFrom: 0,
    },
  },
  {
    key: "kit-grooves", title: "Kit: twostep, gallop, march", note: "two bars each, tempo 168 (march at the same tempo reads as double time)",
    song: {
      bpm: 168, space: 1.6,
      sections: [
        { chords: "Am | Am", pad: null, bass: null, drums: { ...GROOVES.twostep } },
        { chords: "Am | Am", pad: null, bass: null, drums: { ...GROOVES.gallop } },
        { chords: "Am | Am", pad: null, bass: null, drums: { ...GROOVES.march, open: "..............x." } },
      ],
      form: [0, 1, 2], loopFrom: 0,
    },
  },
  {
    key: "kit-68", title: "Kit: 6/8 lilt and jig", note: "GROOVES.lilt68 at a town tempo, then GROOVES.jig68",
    song: {
      bpm: 216, beats: 6, space: 2.2,
      sections: [
        { chords: "G | C | D | G", pad: null, bass: { pat: "oct", vel: 0.6 }, drums: { ...GROOVES.lilt68 } },
        { chords: "G | C | D | G", pad: null, bass: { pat: "oct", vel: 0.6 }, drums: { ...GROOVES.jig68 } },
      ],
      form: [0, 1], loopFrom: 0,
    },
  },
  {
    // Not music: everything at once, as loud as a battle cue will plausibly get,
    // so the limiter and the CPU are tested against the worst case.
    key: "stress", title: "Engine stress test", note: "not a piece: every loud voice at once at 172, to measure headroom and CPU",
    song: {
      bpm: 172, space: 2.2,
      sections: [{
        chords: "Dm | Bb | C | A | Dm | Gm | Bb C | A",
        pad: { inst: "strings" }, bass: { inst: "synbass", pat: "gallop" },
        hits: { inst: "stab", pat: "X..x..x.", unit: 0.25 },
        lead: { inst: "brass", n: "d5:2 a4 d5 | f5:3 e5 | g5:2 f5 e5 | cs5:4 | d5:2 a4 d5 | bf5:3 a5 | g5 f5 e5 g5 | a5:4" },
        counter: { inst: "spiccato", unit: 0.5, n: "d4*8 | d4*8 | e4*8 | e4*8 | d4*8 | d4*8 | e4*8 | e4*8" },
        parts: [{ inst: "timpani", n: "d2:2 a1:2 | bf1:2 f2:2 | c2:2 g1:2 | a1:.25*16 | d2:2 a1:2 | g1:2 d2:2 | bf1 c2 bf1 c2 | a1!:4" }],
        drums: { ...GROOVES.drive, taiko: "3.......3.......", crash: onFirst("X...............", 8), fill: FILLS.toms },
      }],
      form: [0, 0], loopFrom: 0,
    },
  },
];
