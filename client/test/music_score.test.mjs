// The Empty Throne score (src/score/): every piece file is well formed (bars
// that add up, a loop that seams), every zone and all of Philip's four battle
// groups (2026-10-11) are scored, and a piece scores exactly what it claims.
//   node --test test/music_score.test.mjs
//
// src/score/index.ts finds pieces with Vite's import.meta.glob, which Node does
// not have, so this test finds them itself with the same rule: every .ts file
// in src/score except index.ts and kit.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { chordBars, compile, loopAdvance, measure, parse, parseChord, INST } from "../src/music.ts";
import { BATTLE_GROUPS, battleGroupOf, buildScore, makeCues } from "../src/score/kit.ts";

const ZONES = JSON.parse(readFileSync(new URL("../../shared/data/zones.json", import.meta.url), "utf8"));
const dir = new URL("../src/score/", import.meta.url);
const pieceFiles = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "kit.ts").sort();
const pieces = [];
for (const f of pieceFiles) pieces.push({ file: `score/${f}`, piece: (await import(new URL(f, dir))).default });

test("the score builds: no zone or group is claimed twice", () => {
  assert.doesNotThrow(() => buildScore(pieces));
});

for (const { file, piece } of pieces) {
  test(`${file}: a well-formed piece`, () => {
    assert.ok(piece && piece.title && piece.song, "default export is not a Piece");
    for (const z of piece.zones ?? []) assert.ok(ZONES[z], `unknown zone ${z}`);
    if (piece.battle) assert.ok(BATTLE_GROUPS.some((g) => g.key === piece.battle), `unknown battle group ${piece.battle}`);
    const song = piece.song;
    const beats = song.beats ?? 4;
    song.sections.forEach((sec, si) => {
      const bars = chordBars(sec.chords);
      assert.ok(bars.length > 0, `section ${si} has no bars`);
      for (const g of bars) for (const name of g) parseChord(name);
      const parts = [["lead", sec.lead], ["counter", sec.counter], ...(sec.parts ?? []).map((p, i) => [`parts[${i}]`, p])];
      for (const [role, part] of parts) {
        if (!part) continue;
        const where = `section ${si} ${role}`;
        assert.ok(INST[part.inst], `${where}: unknown instrument ${part.inst}`);
        assert.doesNotThrow(() => parse(part.n, part.unit ?? 1, beats, true), where);
        assert.equal(measure(part.n, part.unit ?? 1), bars.length * beats, `${where}: wrong total length`);
      }
    });
    for (const i of song.form) assert.ok(song.sections[i], `form points at missing section ${i}`);
    const c = compile(song);
    assert.ok(c.end > 20, `a pass is only ${c.end.toFixed(1)}s`);
    assert.ok(c.end - c.loopAt > 10, "loop body too short");
    for (const e of c.events) assert.ok(e.midi >= 16 && e.midi <= 108 && e.dur > 0 && e.t >= 0, `${e.inst} ${e.midi}`);
    for (let i = 1; i < c.events.length; i++) assert.ok(c.events[i].t >= c.events[i - 1].t, "events out of order");
    const next = loopAdvance(c, 0);
    assert.ok(next && Math.abs(next.origin + c.events[next.cursor].t - c.end) < 1e-6, "loop seam drifts");
    if (piece.battle) {
      // Philip: battle music fast and intense
      assert.ok(song.bpm >= 140, `a battle theme at ${song.bpm}bpm`);
      assert.ok(song.sections.some((s) => s.drums || s.perc === "drive"), "a battle theme with no drums");
    }
  });
}

test("battle groups: Philip's four, and every zone falls in one of the first three", () => {
  assert.deepEqual(BATTLE_GROUPS.map((g) => g.key), ["field", "dungeon", "capital", "boss"]);
  const by = { field: [], dungeon: [], capital: [] };
  for (const [k, z] of Object.entries(ZONES)) by[battleGroupOf(z)].push(k);
  assert.equal(by.dungeon.length, 11, `dungeons: ${by.dungeon}`);
  assert.deepEqual(by.capital.sort(), ["burnedland", "capital"]);
  for (const k of ["caerdun", "heartwood", "moonmere", "capitalreturned", "huntingwood", "gulf_to_caerdun"]) {
    assert.ok(by.field.includes(k), `${k} should fight to the field theme`);
  }
  assert.equal(battleGroupOf(undefined), "field");
});

test("the whole world is scored: every zone, all four groups, the ferry on both crossings", () => {
  const score = buildScore(pieces);
  const cues = makeCues(score, ZONES);
  for (const zone of Object.keys(ZONES)) {
    const m = cues.zoneMusic(zone);
    assert.ok(m.field, `${zone} has no field theme`);
    assert.ok(m.battle && m.boss, `${zone} has no battle or boss theme`);
    assert.equal(m.battle, score.battle[battleGroupOf(ZONES[zone])].song, `${zone} fights to the wrong group`);
  }
  for (const g of BATTLE_GROUPS) assert.ok(cues.battleCue(g.key), `no ${g.key} battle theme`);
  // the one piece that scores two zones: the crossing either way is one voyage
  assert.equal(cues.fieldCue("gulf_to_caerdun").file, "score/ferry.ts");
  assert.equal(cues.zoneMusic("gulf_to_caerdun").field, cues.zoneMusic("gulf_to_moonmere").field);
  // and the other way round: nothing claims a zone that is not in zones.json
  for (const z of Object.keys(score.zones)) assert.ok(ZONES[z], `a piece claims unknown zone ${z}`);
});

test("every battle theme is quicker than any field theme it cuts into", () => {
  // in quarter notes: a 6/8 or 7/8 piece's bpm counts eighths (beats 6 or 7);
  // every other piece, the Capital battle's 7/8 in 3.5 beats included, counts quarters
  const quarters = (s) => (s.beats === 6 || s.beats === 7 ? s.bpm / 2 : s.bpm);
  const score = buildScore(pieces);
  const slowestBattle = Math.min(...Object.values(score.battle).map((e) => quarters(e.song)));
  for (const [zone, e] of Object.entries(score.zones)) {
    assert.ok(quarters(e.song) < slowestBattle, `${zone} (${e.file}) is as quick as a battle theme`);
  }
});

test("a piece scores exactly the zones and group it claims", () => {
  const song = { bpm: 120, sections: [{ chords: "C | F | G | C" }], form: [0, 0, 0] };
  const fight = { bpm: 168, sections: [{ chords: "Am | F", drums: { kick: "x..." } }], form: [0] };
  const score = buildScore([
    { file: "score/a.ts", piece: { title: "A", zones: ["caerdun", "capitalreturned"], song, note: "n" } },
    { file: "score/b.ts", piece: { title: "B", battle: "field", song: fight } },
  ]);
  const cues = makeCues(score, ZONES);
  assert.deepEqual(cues.fieldCue("caerdun"), { title: "A", song, file: "score/a.ts", note: "n" });
  assert.equal(cues.zoneMusic("capitalreturned").field, song);
  assert.equal(cues.zoneMusic("heartwood").field, null, "an unclaimed zone is silent, not a crash");
  assert.equal(cues.zoneMusic("caerdun").battle, fight);
  assert.equal(cues.zoneMusic("huntingwood").battle, fight, "the field group is every field zone");
  assert.equal(cues.zoneMusic("mausoleum").battle, null, "a group with no piece has no battle theme");
  assert.equal(cues.zoneMusic("mausoleum").boss, null);
  assert.equal(cues.battleCue("capital"), null);
});

test("ambiguous or empty claims are refused", () => {
  const song = { bpm: 100, sections: [{ chords: "C" }], form: [0] };
  assert.throws(() => buildScore([
    { file: "score/a.ts", piece: { title: "A", zones: ["caerdun"], song } },
    { file: "score/b.ts", piece: { title: "B", zones: ["caerdun"], song } },
  ]), /already scored by score\/a\.ts/);
  assert.throws(() => buildScore([
    { file: "score/a.ts", piece: { title: "A", battle: "boss", song } },
    { file: "score/b.ts", piece: { title: "B", battle: "boss", song } },
  ]), /battle group boss/);
  assert.throws(() => buildScore([{ file: "score/c.ts", piece: { title: "C", song } }]), /claims no zones/);
  assert.throws(() => buildScore([{ file: "score/d.ts", piece: undefined }]), /not a Piece/);
});
