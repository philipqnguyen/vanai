// The 2026-10-11 additions to the score engine: the notation extensions (chords
// in a token, accents, repeats), the drum grid and its fills, chord hits, the
// uneven bass patterns, the loop unroll the offline renderer schedules from,
// the bass patterns in odd meters, and the voice-load estimate. The score's
// pieces are checked by music.test.mjs and music_score.test.mjs.
//   node --test test/music_engine.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import {
  bassSteps, compile, drumHits, hitSteps, laneBars, loopAdvance, measure, parse, unroll, voiceLoad, DRUM_INST, INST,
} from "../src/music.ts";
import { PALETTE } from "../src/music-palette.ts";
import { FILLS, GROOVES, onFirst } from "../src/score/kit.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("a chord token sounds every pitch at one beat", () => {
  const n = parse("c4+e4+g4:2 a4:2");
  assert.equal(n.length, 4);
  assert.deepEqual(n.slice(0, 3).map((x) => [x.beat, x.midi, x.beats]), [[0, 60, 2], [0, 64, 2], [0, 67, 2]]);
  assert.equal(n[3].beat, 2);
  assert.equal(measure("c4+e4+g4:2 a4:2"), 4, "a chord takes the time of one token");
});

test("a tie after a chord extends every note of it", () => {
  const n = parse("c4+g4 ~ ~ d4");
  assert.equal(n[0].beats, 3);
  assert.equal(n[1].beats, 3);
  assert.equal(n[2].beat, 3);
});

test("accents scale velocity; unmarked notes carry none", () => {
  const [a, b, c] = parse("c4! d4? e4");
  assert.equal(a.vel, 1.3);
  assert.equal(b.vel, 0.55);
  assert.equal(c.vel, undefined);
  // and compile multiplies them into the part's own velocity
  const ev = compile({ bpm: 60, sections: [{ chords: "C", pad: null, bass: null, lead: { inst: "piano", n: "c4! d4? e4 f4", vel: 0.5 } }], form: [0] }).events;
  assert.deepEqual(ev.map((e) => e.vel), [0.65, 0.275, 0.5, 0.5]);
});

test("a repeat count is n tokens", () => {
  const n = parse("e4:.5*8");
  assert.equal(n.length, 8);
  assert.ok(near(n[7].beat, 3.5));
  assert.equal(measure("e4:.5*8 | .*4"), 8);
  assert.equal(measure("a2:.25*16", 1), 4);
  assert.doesNotThrow(() => parse("e4:.5*8 | c4+e4!:2*2", 1, 4, true));
  assert.throws(() => parse("e4*8 | c4", 1, 4, true), /bar 1/, "eight quarters is two bars, strict catches it");
});

test("bad tokens still fail loudly", () => {
  assert.throws(() => parse("c4+"));
  assert.throws(() => parse("c4*"));
  assert.throws(() => parse("h4"));
  assert.throws(() => parse("c4!!"));
});

test("drum lanes: steps per bar come from the bar's own length", () => {
  assert.deepEqual(laneBars("x... x... | x.x."), ["x...x...", "x.x."]);
  assert.throws(() => laneBars("x..q"));
  const h = drumHits({ kick: "x...x...x...x...", hat: "x.x." }, 1, 4);
  const kicks = h.filter((e) => e.inst === "kick");
  assert.deepEqual(kicks.map((e) => e.beat), [0, 1, 2, 3]);
  const hats = h.filter((e) => e.inst === "hat");
  assert.deepEqual(hats.map((e) => e.beat), [0, 2], "four steps in a 4-beat bar are quarters");
  // 12 steps in a 6-beat bar are half-beats
  const six = drumHits({ snare: "x.....x....." }, 1, 6).map((e) => e.beat);
  assert.deepEqual(six, [0, 3]);
});

test("a short lane repeats over the section", () => {
  const h = drumHits({ snare: "....x......." + "....", kick: "x...............|....x..........." }, 4, 4);
  assert.equal(h.filter((e) => e.inst === "snare").length, 4);
  assert.deepEqual(h.filter((e) => e.inst === "kick").map((e) => e.beat), [0, 5, 8, 13]);
});

test("velocity marks, rolls, flams and drum sizes", () => {
  const h = drumHits({ snare: "XoxfrR.........." }, 1, 4);
  const v = h.map((e) => +e.vel.toFixed(2));
  assert.equal(v[0], 1); assert.equal(v[1], 0.38); assert.equal(v[2], 0.8);
  // flam: a grace hit just before the main one
  assert.ok(h[3].beat < 0.75 && h[4].beat === 0.75 && h[3].vel < h[4].vel);
  // r = two strokes inside the step, R = three
  assert.equal(h.filter((e) => e.beat >= 1 && e.beat < 1.25).length, 2);
  assert.equal(h.filter((e) => e.beat >= 1.25 && e.beat < 1.5).length, 3);
  const toms = drumHits({ tom: "123x" }, 1, 4).map((e) => e.midi);
  assert.deepEqual(toms, [55, 50, 45, 50], "1 2 3 pick high, mid, floor; x is the middle drum");
  const taiko = drumHits({ taiko: "3..." }, 1, 4)[0];
  assert.equal(taiko.inst, "taiko");
  assert.ok(taiko.midi < 40, "o-daiko is the low one");
  // a flam on the very first step never lands before the bar
  assert.ok(drumHits({ snare: "f..." }, 1, 4).every((e) => e.beat >= 0));
});

test("hats breathe, the rest hit exactly", () => {
  const h = drumHits({ hat: "xxxxxxxxxxxxxxxx", kick: "xxxxxxxxxxxxxxxx" }, 1, 4);
  const hats = new Set(h.filter((e) => e.inst === "hat").map((e) => e.vel));
  const kicks = new Set(h.filter((e) => e.inst === "kick").map((e) => e.vel));
  assert.ok(hats.size > 4, "hat velocities vary");
  assert.equal(kicks.size, 1, "kick velocities do not");
  // and the jitter is deterministic, so renders are reproducible
  const again = drumHits({ hat: "xxxxxxxxxxxxxxxx" }, 1, 4).map((e) => e.vel);
  assert.deepEqual(again, h.filter((e) => e.inst === "hat").map((e) => e.vel));
});

test("a fill replaces only the lanes it names, in the last bar of every `every`", () => {
  const d = { kick: "x...............", snare: "....x.......x...", fill: { snare: "xxxxxxxxxxxxxxxx", every: 4 } };
  const h = drumHits(d, 8, 4);
  const snareIn = (bar) => h.filter((e) => e.inst === "snare" && e.beat >= bar * 4 && e.beat < bar * 4 + 4).length;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(snareIn), [2, 2, 2, 16, 2, 2, 2, 16]);
  assert.equal(h.filter((e) => e.inst === "kick").length, 8, "the kick keeps playing under the fill");
  // default: the section's last bar
  const h2 = drumHits({ snare: "x...", fill: FILLS.snare }, 4, 4);
  assert.equal(h2.filter((e) => e.inst === "snare" && e.beat >= 12).length, 12);
  assert.equal(h2.filter((e) => e.inst === "hat").length, 0, "the fill's silent hat lane is silent");
});

test("every groove and fill parses, every lane maps to an instrument", () => {
  for (const [name, g] of Object.entries(GROOVES)) {
    const beats = name.endsWith("68") ? 6 : 4;
    const h = drumHits(g, 4, beats);
    assert.ok(h.length > 0, `${name} makes no hits`);
    for (const e of h) assert.ok(INST[e.inst], `${name}: ${e.inst}`);
    for (const lane of Object.keys(g)) {
      for (const bar of laneBars(g[lane])) {
        assert.equal(bar.length, beats === 6 ? 12 : 16, `${name}.${lane} bar is ${bar.length} steps`);
      }
    }
  }
  for (const [name, f] of Object.entries(FILLS)) {
    for (const lane of Object.keys(f)) assert.equal(laneBars(f[lane])[0].length, 16, `${name}.${lane}`);
  }
  for (const inst of Object.values(DRUM_INST)) assert.ok(INST[inst]);
  assert.equal(laneBars(onFirst("X...............", 8)).length, 8);
  assert.equal(laneBars(onFirst("X...............", 8))[1], "................");
});

test("hits: a grid per chord, holds lengthen, the chord follows the changes", () => {
  assert.deepEqual(hitSteps("x.-X", 0.5, 2).map((s) => [s.off, s.len, s.vel]), [[0, 0.5, 0.8], [1.5, 0.5, 1]]);
  assert.deepEqual(hitSteps("x--.", 0.5, 2).map((s) => [s.off, s.len]), [[0, 1.5]]);
  assert.equal(hitSteps("x.", 0.5, 4).length, 4, "the grid repeats to fill the chord");
  const ev = compile({
    bpm: 60, sections: [{ chords: "C Am", pad: null, bass: null, hits: { inst: "stab", pat: "x...", unit: 0.5 } }], form: [0],
  }).events;
  // one hit per chord (each chord is 2 beats), each the chord's three tones
  assert.equal(ev.length, 6);
  assert.deepEqual(ev.slice(0, 3).map((e) => e.midi), [60, 64, 67]);
  assert.deepEqual(ev.slice(3).map((e) => e.midi), [69, 72, 76]);
  assert.ok(ev.every((e) => e.inst === "stab"));
  const power = compile({ bpm: 60, sections: [{ chords: "Dm", pad: null, bass: null, hits: { inst: "stab", pat: "x", unit: 4, voicing: "power" } }], form: [0] }).events;
  assert.deepEqual(power.map((e) => e.midi), [62, 69, 74]);
});

test("extra parts compile alongside lead and counter", () => {
  const ev = compile({
    bpm: 60, sections: [{
      chords: "C", pad: null, bass: null,
      lead: { inst: "brass", n: "c5:4" }, counter: { inst: "horn", n: "e4:4" },
      parts: [{ inst: "spiccato", n: "c4:.5*8" }, { inst: "timpani", n: "c2:4", oct: 1 }],
    }], form: [0],
  }).events;
  assert.equal(ev.filter((e) => e.inst === "spiccato").length, 8);
  assert.equal(ev.find((e) => e.inst === "timpani").midi, 48);
  assert.equal(ev.length, 11);
});

test("gallop, sixteen and pump bass patterns", () => {
  const bass = (pat) => compile({ bpm: 60, sections: [{ chords: "C", pad: null, bass: { pat } }], form: [0] }).events;
  const g = bass("gallop");
  assert.equal(g.length, 12);
  assert.ok(near(g[0].dur, 0.5) && near(g[1].dur, 0.25) && near(g[2].dur, 0.25), "eighth, sixteenth, sixteenth");
  assert.ok(near(g.reduce((s, e) => s + e.dur, 0), 4), "the notes fill the bar exactly");
  assert.equal(bass("sixteen").length, 16);
  const p = bass("pump");
  assert.deepEqual(p.slice(0, 4).map((e) => e.midi - p[0].midi), [0, 12, 0, 12]);
});

test("bass patterns step on the beat groupings of an odd bar, and only there", () => {
  // 4/4 and 6/8 keep the even split (oct on the half bar is beat 3, or the second dotted beat)
  assert.deepEqual(bassSteps("oct", 4), [0, 0.5]);
  assert.deepEqual(bassSteps("oct", 6), [0, 0.5]);
  assert.deepEqual(bassSteps("walk", 4), [0, 0.25, 0.5, 0.75]);
  // 3/4: octave on beat 3; 5/4 as 3+2; 7/8 in eighths as 2+2+3; 7/8 in quarters as 3+2+2
  const beatsOf = (pat, n) => bassSteps(pat, n).map((f) => Math.round(f * n * 1e6) / 1e6);
  assert.deepEqual(beatsOf("oct", 3), [0, 2]);
  assert.deepEqual(beatsOf("walk", 3), [0, 1, 2]);
  assert.deepEqual(beatsOf("oct", 5), [0, 3]);
  assert.deepEqual(beatsOf("pedal", 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(beatsOf("oct", 7), [0, 4]);
  assert.deepEqual(beatsOf("pedal", 7), [0, 2, 4]);
  assert.deepEqual(beatsOf("oct", 3.5), [0, 1.5]);
  assert.deepEqual(beatsOf("arp", 3.5), [0, 1.5, 2.5]);
  // a chord split mid-bar is not an odd bar: the even split stands...
  assert.deepEqual(bassSteps("oct", 1.5, 3), [0, 0.5]);
  assert.deepEqual(bassSteps("oct", 3.5, 7), [0, 0.5]);
  // ...except half a 6/8 bar, one dotted beat: root a quarter, octave an eighth
  assert.deepEqual(bassSteps("oct", 3, 6).map((f) => f * 3), [0, 2]);
  // and the compiled bass in a 3/4 bar is root for two beats, octave on three
  const c = compile({ bpm: 60, beats: 3, sections: [{ chords: "C", pad: null, bass: { pat: "oct" } }], form: [0] });
  const bass = c.events.filter((e) => e.inst === "bass").map((e) => [e.t, e.midi, e.dur]);
  assert.deepEqual(bass, [[0, 36, 2], [2, 48, 1]]);
});

test("compile marks every form entry, and the bar length", () => {
  const c = compile({ bpm: 120, sections: [{ chords: "C | F" }, { chords: "G | C | F | G" }], form: [0, 1, 0], loopFrom: 1 });
  assert.deepEqual(c.marks.map((m) => [m.t, m.si, m.bars]), [[0, 0, 2], [4, 1, 4], [12, 0, 2]]);
  assert.equal(c.bar, 2);
  assert.equal(c.loopAt, 4);
});

test("unroll: the transport's walk without a clock", () => {
  const c = compile({ bpm: 120, sections: [{ chords: "C | F", pad: null, bass: { pat: "root" } }, { chords: "G | C", pad: null, bass: { pat: "root" } }], form: [0, 1], loopFrom: 1 });
  // pass one: 4 notes over 8s; after it, only the loop body (bars 3-4) repeats
  const u = unroll(c, 0, 20);
  assert.deepEqual(u.map((x) => +x.at.toFixed(6)), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  assert.deepEqual(u.slice(4).map((x) => x.ev.midi), [u[2].ev.midi, u[3].ev.midi, u[2].ev.midi, u[3].ev.midi, u[2].ev.midi, u[3].ev.midi]);
  // a window starting mid-way returns only what sounds inside it
  assert.deepEqual(unroll(c, 9, 13).map((x) => x.at), [10, 12]);
  // and it agrees with loopAdvance about where the second pass starts
  const next = loopAdvance(c, 0);
  assert.equal(next.origin + c.events[next.cursor].t, 8);
});

test("voice load counts concurrent notes and nodes", () => {
  const solo = compile({ bpm: 60, sections: [{ chords: "C", pad: null, bass: null, lead: { inst: "hat", n: "c4 c4 c4 c4" } }], form: [0] });
  const l = voiceLoad(solo);
  assert.equal(l.peakNotes, 1, "hats this far apart never overlap");
  assert.equal(l.peakNodes, 3);
  const chord = compile({ bpm: 60, sections: [{ chords: "C", pad: null, bass: null, lead: { inst: "piano", n: "c4+e4+g4:4" } }], form: [0] });
  assert.equal(voiceLoad(chord).peakNotes, 3);
  assert.equal(voiceLoad(chord).peakNodes, 39);
});

test("every palette demo compiles to a clean loop", () => {
  assert.ok(PALETTE.length >= 10);
  const keys = new Set();
  for (const d of PALETTE) {
    assert.ok(!keys.has(d.key), `duplicate demo ${d.key}`);
    keys.add(d.key);
    const beats = d.song.beats ?? 4;
    for (const sec of d.song.sections) {
      for (const part of [sec.lead, sec.counter, ...(sec.parts ?? [])]) {
        if (!part) continue;
        assert.doesNotThrow(() => parse(part.n, part.unit ?? 1, beats, true), `${d.key}`);
      }
    }
    const c = compile(d.song);
    assert.ok(c.events.length > 0 && c.end - c.loopAt > 5, d.key);
    for (const e of c.events) assert.ok(INST[e.inst] && e.midi >= 16 && e.midi <= 108 && e.dur > 0, `${d.key}: ${e.inst} ${e.midi}`);
  }
  // the palette exists to show the new voices: every one of them is in it
  const used = new Set(PALETTE.flatMap((d) => compile(d.song).events.map((e) => e.inst)));
  for (const inst of ["brass", "horn", "stab", "spiccato", "pizz", "reed", "lute", "synbass", "timpani", "taiko",
    "kick", "snare", "hat", "openhat", "tom", "crash"]) assert.ok(used.has(inst), `no demo plays ${inst}`);
});
