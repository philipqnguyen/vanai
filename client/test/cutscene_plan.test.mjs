// Cutscenes (cutscene_plan.ts; cutscene.ts plays them). Philip's rulings of
// 2026-10-11: a scene plays for the current player and stars them -- "self"
// is always whoever watches -- and the opening of each home city is the
// first scene. These pin the timeline maths and hold every scene in
// shared/data/cutscenes/*.json to what its zone actually has.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  frameOffset, resolvePoint, ease, shotAt, shotSpans, duration, cameraAt, fadeAt, barsAt,
  lineAt, titleAt, cuesCrossed, lineHtml, speakerName, sceneProblems, cinemaProblems, chapterTimes, chapterScene, BARS_S,
} from "../src/cutscene_plan.ts";
import { compile } from "../src/music.ts";
import overture from "../src/score/intro.ts";

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../shared/data/${f}`, import.meta.url)));
const ALL = Object.assign({}, ...fs.readdirSync(new URL("../../shared/data/cutscenes/", import.meta.url)).filter((f) => f.endsWith(".json")).sort().map((f) => read(`cutscenes/${f}`)));
const ZONES = read("zones.json");
// scenes filmed in one zone, and the intro, told in chapters (cutscene-cinema.ts)
const SCENES = Object.fromEntries(Object.entries(ALL).filter(([, d]) => !d.chapters));
const INTRO = ALL.intro;
const BAR = compile(overture.song).bar;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const flat = (extra = {}) => ({ ground: () => 0, subject: () => ({ x: 0, y: 0, z: 0, h: 0 }), frameH: 0, npc: () => undefined, ...extra });
const scene = (shots) => ({ name: "t", zone: "caerdun", trigger: { type: "opening", city: "caerdun" }, shots });
const hold = (pos) => ({ from: { pos, look: [0, 0, 10] } });

test("every scene's insides resolve in the zone it is filmed in", () => {
  assert.ok(Object.keys(SCENES).length >= 3);
  for (const [id, def] of Object.entries(SCENES)) assert.deepEqual(sceneProblems(id, def, ZONES[def.zone]), [], id);
});

test("each home city has exactly one opening, filmed there, with a mark at its start", () => {
  for (const city of ["caerdun", "heartwood", "moonmere"]) {
    const openings = Object.entries(SCENES).filter(([, d]) => d.trigger.type === "opening" && d.trigger.city === city);
    assert.equal(openings.length, 1, city);
    const [, d] = openings[0];
    assert.equal(d.zone, city);
    // the server's START_CITIES (character.rb) stand a new character here; the
    // zone's start or spawn is the same spot (start_cities_test.rb)
    const start = ZONES[city].start ?? ZONES[city].spawn;
    assert.ok(d.mark && near(d.mark[0], start.x) && near(d.mark[1], start.z), `${city}: the mark is the start`);
    // the tone law: every doorstep greets a new player in daylight
    assert.ok(d.daytime > 0.02 && d.daytime < 0.45, `${city}: lit by day`);
    // it opens out of black and hands back under black
    assert.ok(d.shots[0].fade?.in > 0, `${city}: fades in`);
    assert.ok(d.shots.at(-1).fade?.out > 0, `${city}: fades out`);
  }
});

test("the intro: every chapter resolves, and its shots fill the bars the overture gives them", () => {
  assert.ok(INTRO && INTRO.trigger.type === "intro");
  assert.deepEqual(overture.scenes, ["intro"], "the overture is the intro's own piece");
  assert.deepEqual(cinemaProblems("intro", INTRO, ZONES, BAR), []);
  // the overture is exactly as long as the scene, so the title lands on its last chord
  assert.ok(Math.abs(compile(overture.song).end - INTRO.bars * BAR) < 1e-6, "the overture's bars are the scene's");
  const times = chapterTimes(INTRO, BAR);
  assert.equal(times[0].card, 0);
  assert.ok(times.every((t, i) => !i || t.card >= times[i - 1].end - 1e-9), "chapters follow one another");
});

test("the intro's sections line up with its chapters, bar for bar", () => {
  // each chapter's card comes in on the first bar of a section of the overture
  const starts = [];
  let bar = 0;
  for (const i of overture.song.form) { starts.push(bar); bar += overture.song.sections[i].chords.split("|").length; }
  for (const c of INTRO.chapters) assert.ok(starts.includes(c.bar), `chapter at bar ${c.bar} does not open a section (${starts.join(",")})`);
});

test("the intro's cards are short, and the slow builds get the longer ones", () => {
  // Philip 2026-10-12: faster. The black is only as long as a build needs: the
  // first chapter is built before the music starts, and a chapter that rolls
  // late skips ahead by its lateness (cutscene-cinema.ts), so a short card costs
  // the first shot a moment, never the music its cuts. Heartwood's synchronous
  // build is the longest (~3.9 s); from its card to its first frame, MEASURED
  // headless 2026-10-12: Heartwood 6.8 s, Caerdun's fields 6.6, the Border
  // Wall 3.8, the empty Capital 3.5, Moonmere 3.1, Caerdun 2.8.
  for (const c of INTRO.chapters) if (c.zone) assert.ok(c.cardBars >= 1 && c.cardBars <= 3, `chapter at bar ${c.bar}: a ${c.cardBars}-bar card`);
  for (const z of ["heartwood", "caerdunfields"]) assert.ok(INTRO.chapters.find((c) => c.zone === z)?.cardBars >= 3, `${z}'s card covers its build`);
  assert.ok(INTRO.bars * BAR <= 110, `the intro runs ${(INTRO.bars * BAR).toFixed(0)}s`);
  const sub = chapterScene(INTRO.chapters[0], "intro:1");
  assert.equal(sub.music, "none", "a chapter is scored by the overture, not its zone");
});

test("the frame: fwd is the way the heading faces and right is a quarter turn clockwise", () => {
  const n = frameOffset(0, 0, 1); assert.ok(near(n.x, 0) && near(n.z, 1));
  const e = frameOffset(Math.PI / 2, 0, 1); assert.ok(near(e.x, 1) && near(e.z, 0));
  const r = frameOffset(0, 1, 0); assert.ok(near(r.x, 1) && near(r.z, 0));
  const r2 = frameOffset(Math.PI / 2, 1, 0); assert.ok(near(r2.x, 0) && near(r2.z, -1));
});

test("points: absolute ones stand on the ground, self and npc ones on the actor", () => {
  const r = flat({ ground: (x, z) => x + z, subject: () => ({ x: 10, y: 3, z: 5, h: 1 }), frameH: Math.PI / 2, npc: (id) => id === "a" ? { x: 1, y: 2, z: 3, h: 0 } : undefined });
  assert.deepEqual(resolvePoint([2, 1.5, 4], r), { x: 2, y: 7.5, z: 4 });
  const s = resolvePoint({ self: [0, 1.6, 2] }, r); // 2 m east of the watcher: the frame, not their own heading
  assert.ok(near(s.x, 12) && near(s.y, 4.6) && near(s.z, 5));
  const n = resolvePoint({ npc: "a", off: [0, 1, 2] }, r);
  assert.ok(near(n.x, 1) && near(n.y, 3) && near(n.z, 5));
  assert.throws(() => resolvePoint({ npc: "nobody" }, r));
});

test("points: a camp and the nearest crystal, in the scene's frame", () => {
  const r = flat({ frameH: Math.PI / 2, camp: (k) => (k === "boss" ? { x: 10, y: 2, z: 20, h: 0 } : undefined), crystal: () => ({ x: -5, y: 1, z: 5, h: 0 }) });
  const c = resolvePoint({ camp: "boss", off: [0, 3, -6] }, r); // 6 m back from the camp along the frame (east)
  assert.ok(near(c.x, 4) && near(c.y, 5) && near(c.z, 20));
  const k = resolvePoint({ crystal: true }, r);
  assert.ok(near(k.x, -5) && near(k.y, 2.6) && near(k.z, 5));
  assert.throws(() => resolvePoint({ camp: "nobody" }, r));
});

test("a scene that plays anywhere points only at the watcher and the crystal", () => {
  const base = { name: "t", zone: "*", trigger: { type: "attune" } };
  const ok = { ...base, shots: [{ dur: 3, cam: { from: { pos: { crystal: true, off: [0, 2, -4] }, look: { self: [0, 1.5, 0] } } } }] };
  assert.deepEqual(sceneProblems("ok", ok, undefined), []);
  const bad = { ...base, shots: [{ dur: 3, cam: { from: { pos: [0, 2, 0], look: { npc: "inga" } } } }] };
  assert.equal(sceneProblems("bad", bad, undefined).length, 2);
});

test("ease: every curve runs 0 to 1 and the default is symmetric", () => {
  for (const k of ["inout", "linear", "in", "out", undefined]) {
    assert.ok(near(ease(k, 0), 0) && near(ease(k, 1), 1), String(k));
    assert.ok(near(ease(k, -1), 0) && near(ease(k, 2), 1), String(k));
  }
  assert.ok(near(ease(undefined, 0.5), 0.5));
  assert.ok(near(ease("inout", 0.25) + ease("inout", 0.75), 1));
});

test("shots play end to end, and past the end the last frame holds", () => {
  const d = scene([{ dur: 2, cam: hold([0, 1, 0]) }, { dur: 3, cam: hold([1, 1, 0]) }]);
  assert.equal(duration(d), 5);
  assert.deepEqual(shotSpans(d), [{ start: 0, end: 2 }, { start: 2, end: 5 }]);
  assert.deepEqual(shotAt(d, 0), { index: 0, local: 0 });
  assert.deepEqual(shotAt(d, 2), { index: 1, local: 0 });
  assert.deepEqual(shotAt(d, 9), { index: 1, local: 3 });
});

test("the camera moves from `from` to `to`, bends towards `via`, and holds with no `to`", () => {
  const d = scene([
    { dur: 2, cam: { from: { pos: [0, 0, 0], look: [0, 0, 10], fov: 1 }, to: { pos: [10, 0, 0], look: [10, 0, 10], fov: 0.5 }, ease: "linear" } },
    { dur: 2, cam: { from: { pos: [0, 0, 0], look: [0, 0, 1] }, to: { pos: [10, 0, 0], look: [0, 0, 1] }, via: [5, 0, 10], ease: "linear" } },
    { dur: 2, cam: hold([3, 2, 1]) },
  ]);
  const mid = cameraAt(d, 1, flat());
  assert.ok(near(mid.pos.x, 5) && near(mid.look.x, 5) && near(mid.fov, 0.75));
  const bent = cameraAt(d, 3, flat()); // a quadratic halfway is a quarter of the way to `via`... and back
  assert.ok(near(bent.pos.x, 5) && near(bent.pos.z, 5));
  const held = cameraAt(d, 5, flat());
  assert.deepEqual(held.pos, { x: 3, y: 2, z: 1 });
  assert.ok(near(held.fov, 0.8));
});

test("fades: black at a shot's faded ends, clear between, and the letterbox closes in", () => {
  const d = scene([{ dur: 4, fade: { in: 1, out: 2 }, cam: hold([0, 1, 0]) }]);
  assert.ok(near(fadeAt(d, 0), 1) && near(fadeAt(d, 0.5), 0.5) && near(fadeAt(d, 1.5), 0));
  assert.ok(near(fadeAt(d, 3), 0.5) && near(fadeAt(d, 4), 1));
  assert.ok(near(barsAt(0), 0) && near(barsAt(BARS_S / 2), 0.5) && near(barsAt(30), 1));
});

test("lines and titles show in their windows, faded at the edges", () => {
  const d = scene([{ dur: 6, cam: hold([0, 1, 0]), title: { at: 1, dur: 3, text: "Caerdun" },
    lines: [{ at: 0, dur: 3, text: "one" }, { at: 2.5, dur: 3, who: "self", text: "two" }] }]);
  assert.equal(lineAt(d, 1).line.text, "one");
  assert.equal(lineAt(d, 2.7).line.text, "two"); // the later line wins an overlap
  assert.equal(lineAt(d, 5.4).opacity < 0.5, true);
  assert.equal(lineAt(d, 5.95 + 0.1), null);
  assert.equal(titleAt(d, 0.5), null);
  assert.ok(near(titleAt(d, 2.5).opacity, 1));
});

test("cues fire once each, in order, a cue at the very start included", () => {
  const d = scene([{ dur: 2, cam: hold([0, 1, 0]), cues: [{ at: 1, who: "self", anim: "emote:Wave" }, { at: 0, who: "self", face: 0 }] },
    { dur: 2, cam: hold([0, 1, 0]), cues: [{ at: 0.5, who: "self", walk: { fwd: 2 } }] }]);
  assert.deepEqual(cuesCrossed(d, -1, 0).map((c) => c.time), [0]);
  assert.deepEqual(cuesCrossed(d, 0, 1).map((c) => c.time), [1]);
  assert.deepEqual(cuesCrossed(d, 1, 4).map((c) => c.time), [2.5]);
  assert.deepEqual(cuesCrossed(d, 0, 0.99), []);
});

test("words: the watcher's name goes in, the ask is bold, and nothing else is markup", () => {
  assert.equal(lineHtml("Morning, {name}. Go to the **Drill Yards**.", "Wren"), "Morning, Wren. Go to the <b>Drill Yards</b>.");
  assert.equal(lineHtml("<img src=x>", "<b>"), "&lt;img src=x&gt;");
  assert.equal(lineHtml("{name}", "<i>Ash</i>"), "&lt;i&gt;Ash&lt;/i&gt;");
  const npcs = [{ id: "inga", name: "Inga Daws" }];
  assert.equal(speakerName("npc:inga", "Wren", npcs), "Inga Daws");
  assert.equal(speakerName("self", "Wren", npcs), "Wren"); // the subject is whoever watches
  assert.equal(speakerName(undefined, "Wren", npcs), "");
});

test("the check catches what would break a scene in play", () => {
  const zone = { npcs: [{ id: "inga" }] };
  const bad = scene([{ dur: 1, fade: { in: 1, out: 1 }, cam: { from: { pos: { npc: "ghost" }, look: [0, 0, 0] } },
    lines: [{ at: 0, dur: 1, who: "npc:nobody", text: "This sentence is much too long to read in one second." }],
    cues: [{ at: 2, who: "npc:inga", walk: { fwd: 1 }, anim: "dance" }] }]);
  const out = sceneProblems("bad", bad, zone).join("\n");
  for (const want of ["no NPC ghost", "npc:nobody", "too short to read", "outside the shot", "anim dance", "only the watcher walks", "fades are longer"]) {
    assert.ok(out.includes(want), `expected "${want}" in:\n${out}`);
  }
});
