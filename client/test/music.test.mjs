// The score has to be *correct* before it can be good: thirty-six hand-written
// pieces is more bars than anyone counts reliably by eye, so the bar lines are
// checked mechanically (music_score.test.mjs, per piece) and the loop is
// checked here: every piece must seam exactly, never replay its intro, and
// land on the same cursor pass after pass, or a zone heard for an hour drifts.
//   node --test          (from client/ — Node imports the .ts directly)
//
// Until 2026-10-11 this pinned the old Lantern-lore score in songs.ts; that
// score is retired and these are the same checks over the Empty Throne's.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { compile, loopAdvance, measure, parse, parseChord } from "../src/music.ts";

const dir = new URL("../src/score/", import.meta.url);
const ALL = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "kit.ts").sort()) {
  ALL[f.replace(/\.ts$/, "")] = (await import(new URL(f, dir))).default.song;
}

test("the score is all here", () => {
  assert.ok(Object.keys(ALL).length >= 36, `only ${Object.keys(ALL).length} pieces`);
});

test("the loop seam is continuous", () => {
  for (const [name, song] of Object.entries(ALL)) {
    const c = compile(song);
    const next = loopAdvance(c, 0);
    assert.ok(next, `${name}: cannot loop`);
    // the first event of pass two must sound exactly where pass one ended
    const first = c.events[next.cursor];
    assert.ok(Math.abs((next.origin + first.t) - c.end) < 1e-6,
      `${name}: loop seam is ${(next.origin + first.t - c.end).toFixed(4)}s off`);
    // and nothing before the loop point may be replayed
    assert.ok(next.cursor === 0 || c.events[next.cursor - 1].t < c.loopAt,
      `${name}: loop replays the intro`);
    // a second pass must land on the same cursor, or the loop drifts over time
    const third = loopAdvance(c, next.origin);
    assert.equal(third.cursor, next.cursor, `${name}: loop point moved`);
    assert.ok(Math.abs((third.origin - next.origin) - (c.end - c.loopAt)) < 1e-9);
  }
});

test("form indices exist", () => {
  for (const [name, song] of Object.entries(ALL)) {
    for (const i of song.form) {
      assert.ok(song.sections[i], `${name}: form points at missing section ${i}`);
    }
    const lf = song.loopFrom ?? 0;
    assert.ok(lf >= 0 && lf < song.form.length, `${name}: bad loopFrom`);
  }
});

test("notation basics", () => {
  assert.equal(parse("c4 d4").length, 2);
  assert.equal(measure("c4:2 d4", 0.5), 1.5);
  assert.equal(parse("c4 ~ d4")[0].beats, 2, "tie extends the previous note");
  assert.equal(parse("c4 . d4")[1].beat, 2, "rests take up time");
  assert.deepEqual(parseChord("Am/G"), { pc: 9, bassPc: 7, tones: [0, 3, 7] });
  assert.throws(() => parseChord("Hm"));
  assert.throws(() => parse("c4 c4 | c4", 1, 4, true), /bar 1/);
});
