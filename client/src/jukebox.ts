// /?music — the score jukebox. Dev-only, no account and no server, on the same
// terms as /?lineup and /?zone=: every zone's piece, the four battle groups and
// the palette demos, played through the real engine exactly as the game plays
// them. It exists for Philip's listening pass (he is the only one who can hear
// the score), so it shows what each piece is doing while it plays — section,
// bar, loop position — and has a button for each thing worth listening for:
// the field-to-battle cut and the resume, the boss takeover, and the loop seam.
//
// Also reachable as /audition.html, which loads only this (no Babylon, faster).
// tools/music/render.mjs drives the `__music` handle at the bottom to render
// pieces offline and measure them.

import { initMusic, musicState, renderSong, seekMusic, setMusicCombat, setZoneMusic, stopSong,
  compile, voiceLoad, type Compiled, type Song } from "./music";
import { barProfile, loudness, peak, rmsDb, seam } from "./music_analysis";
import { ZONES } from "./data";
import { battleCue, fieldCue, sceneCue, zoneGroup, zoneMusic, SCORE, type Cue } from "./score";
import { BATTLE_GROUPS, type BattleGroup } from "./score/kit";
import { PALETTE } from "./music-palette";

type Item =
  | { kind: "zone"; key: string; label: string; sub: string }
  | { kind: "battle"; key: BattleGroup; label: string; sub: string }
  | { kind: "demo"; key: string; label: string; sub: string }
  | { kind: "scene"; key: string; label: string; sub: string };

const CSS = `
#jukebox {
  --bg: #15120f; --panel: #1f1a15; --line: #3a3027; --text: #ece3d3; --dim: #a39581; --faint: #6f6455;
  --gold: #e0b062; --field: #8fd18a; --battle: #e07b5a; --boss: #c56be0; --loop: #3d5a7a;
  position: fixed; inset: 0; overflow: auto; z-index: 50; background: var(--bg); color: var(--text);
  font: 15px/1.5 "Alegreya Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#jukebox * { box-sizing: border-box; }
#jukebox .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 16px 64px; }
#jukebox h1 { font: 600 22px/1.2 Cinzel, Georgia, serif; letter-spacing: .04em; margin: 0 0 4px; color: var(--gold); }
#jukebox .sub { color: var(--dim); margin: 0 0 14px; font-size: 14px; }
#jukebox .deck {
  position: sticky; top: 0; z-index: 3; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; box-shadow: 0 8px 24px #0008;
}
#jukebox .now { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; min-height: 26px; }
#jukebox .now .t { font-size: 19px; font-weight: 600; }
#jukebox .now .m { color: var(--dim); font-size: 13px; }
#jukebox .note { color: var(--gold); font-size: 13px; font-style: italic; min-height: 18px; }
#jukebox .badge { font: 700 10px/1 ui-monospace, Menlo, monospace; padding: 3px 5px; border-radius: 4px; letter-spacing: .06em; }
#jukebox .badge.none { background: transparent; color: var(--faint); border: 1px dashed #443c34; }
#jukebox .controls { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 8px; align-items: center; }
#jukebox button {
  font: inherit; font-size: 14px; color: var(--text); background: #2a231c; border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 10px; cursor: pointer;
}
#jukebox button:hover { border-color: #5e4f3f; }
#jukebox button:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
#jukebox button kbd { font: 11px ui-monospace, Menlo, monospace; color: var(--faint); margin-left: 6px; }
#jukebox .modes { display: inline-flex; gap: 4px; margin-left: 4px; }
#jukebox .mode { font: 700 11px/1 ui-monospace, Menlo, monospace; padding: 6px 8px; border-radius: 5px; border: 1px solid var(--line); color: var(--faint); letter-spacing: .08em; }
#jukebox .mode.on.field { color: #10140f; background: var(--field); border-color: var(--field); }
#jukebox .mode.on.battle { color: #1a0f0b; background: var(--battle); border-color: var(--battle); }
#jukebox .mode.on.boss { color: #150b18; background: var(--boss); border-color: var(--boss); }
#jukebox .status { color: var(--dim); font-size: 13px; margin-left: 6px; }
#jukebox label.vol { display: inline-flex; align-items: center; gap: 6px; color: var(--dim); font-size: 13px; margin-left: auto; }
#jukebox input[type=range] { width: 120px; accent-color: var(--gold); }
#jukebox .meter { width: 70px; height: 8px; background: #0c0a08; border-radius: 4px; overflow: hidden; display: inline-block; }
#jukebox .meter i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #5d9a58, #d8c25a 75%, #e0644a); }
#jukebox .tl { position: relative; height: 34px; background: #0f0d0b; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; cursor: pointer; }
#jukebox .tl .seg { position: absolute; overflow: hidden; white-space: nowrap; text-overflow: clip; top: 0; bottom: 0; border-right: 1px solid #00000080; display: flex; align-items: center; justify-content: center; font: 600 12px ui-monospace, Menlo, monospace; color: #d9ccb8; background: #2a2219; }
#jukebox .tl .seg.loop { background: #23303d; }
#jukebox .tl .seg.cur { background: #4a3a25; color: #fff; }
#jukebox .tl .seg.loop.cur { background: var(--loop); }
#jukebox .tl .head { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--gold); box-shadow: 0 0 6px var(--gold); pointer-events: none; }
#jukebox .tl .lp { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed #9cc3ea; pointer-events: none; }
#jukebox .readout { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 6px; font: 13px ui-monospace, Menlo, monospace; color: var(--dim); }
#jukebox .readout b { color: var(--text); font-weight: 600; }
#jukebox h2 { font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .14em; color: var(--faint); margin: 22px 0 8px; }
#jukebox ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
#jukebox li button { width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; background: var(--panel); }
#jukebox li button .z { font-weight: 600; }
#jukebox li button .p { grid-column: 1 / 2; color: var(--dim); font-size: 13px; }
#jukebox li button .k { grid-column: 2; grid-row: 1; justify-self: end; }
#jukebox li button .g { grid-column: 2; grid-row: 2; justify-self: end; color: var(--faint); font: 11px ui-monospace, Menlo, monospace; }
#jukebox li button.sel { border-color: var(--gold); }
#jukebox li button.playing { background: #3a2c1a; border-color: var(--gold); }
#jukebox .keys { color: var(--faint); font-size: 12.5px; margin-top: 26px; line-height: 1.9; }
#jukebox .keys kbd { font: 11px ui-monospace, Menlo, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; color: var(--dim); }
@media (max-width: 640px) {
  /* a sticky deck would cover half a phone screen; the lists matter more there */
  #jukebox .deck { position: static; }
  #jukebox label.vol { margin-left: 0; } #jukebox .now .t { font-size: 17px; }
}
`;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const LETTERS = "ABCDEFGHIJKLMNOP";
/** A section's own name when the piece gives one, else its index letter. */
const secName = (s: Song, si: number) => s.sections[si]?.name ?? LETTERS[si] ?? String(si);

function loadVol(): number {
  try { const v = parseFloat(localStorage.getItem("jukebox_vol") ?? ""); return Number.isFinite(v) ? v : 0.5; }
  catch { return 0.5; }
}
function saveVol(v: number): void { try { localStorage.setItem("jukebox_vol", String(v)); } catch { /* private mode */ } }

export function runJukebox(host: HTMLElement = document.body): void {
  document.getElementById("game-canvas")?.setAttribute("hidden", "");
  document.getElementById("app")?.setAttribute("hidden", "");
  document.title = "Vanai — the score";
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement("div");
  root.id = "jukebox";
  host.append(root);

  const zoneKeys = Object.keys(ZONES);
  const scored = zoneKeys.filter((z) => fieldCue(z)).length;
  const fights = BATTLE_GROUPS.filter((g) => battleCue(g.key)).length;

  root.innerHTML = `<div class="wrap">
    <h1>Vanai — the score</h1>
    <p class="sub">The Empty Throne score: ${scored} of ${zoneKeys.length} zones and ${fights} of 4 battle themes${scored < zoneKeys.length ? ` (<span class="badge none">NONE</span> marks a zone with no music)` : ""}.
      Click a zone to play it as the game does, then use Battle and Boss to hear the cut and the resume.</p>
    <div class="deck" role="region" aria-label="Transport">
      <div class="now"><span class="t" data-r="title">Nothing playing</span><span data-r="badge"></span><span class="m" data-r="meta"></span></div>
      <div class="note" data-r="note"></div>
      <div class="controls">
        <button data-a="play">Play / Stop<kbd>Space</kbd></button>
        <button data-a="battle">Battle<kbd>B</kbd></button>
        <button data-a="boss">Boss<kbd>X</kbd></button>
        <button data-a="disengage">Disengage<kbd>D</kbd></button>
        <button data-a="cycle">Cycle<kbd>C</kbd></button>
        <button data-a="seam">Hear the seam<kbd>J</kbd></button>
        <button data-a="loop">Loop start<kbd>L</kbd></button>
        <span class="modes"><span class="mode field" data-m="field">FIELD</span><span class="mode battle" data-m="battle">BATTLE</span><span class="mode boss" data-m="boss">BOSS</span></span>
        <span class="status" data-r="status"></span>
        <label class="vol">Volume <input type="range" min="0" max="1" step="0.01" data-r="vol" aria-label="Volume"> <span class="meter"><i data-r="meter"></i></span> <span data-r="peak" style="font:11px ui-monospace,Menlo,monospace;min-width:54px"></span></label>
      </div>
      <div class="tl" data-r="tl" title="Click to seek; segments are the form, blue is the loop"></div>
      <div class="readout" data-r="readout"></div>
    </div>
    <div data-r="lists"></div>
    <div class="keys">
      <kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> play the chosen · <kbd>Space</kbd> play/stop ·
      <kbd>B</kbd> battle · <kbd>X</kbd> boss · <kbd>D</kbd> disengage (field returns after 3.5s, as in play) · <kbd>C</kbd> cycle field→battle→boss→field ·
      <kbd>J</kbd> jump to 8s before the loop seam · <kbd>L</kbd> loop start · <kbd>←</kbd><kbd>→</kbd> seek 10s · <kbd>1</kbd>–<kbd>9</kbd> jump to form entry ·
      <kbd>-</kbd><kbd>=</kbd> volume<br>
      Levels: the game plays music at about 0.48 of this page's full volume (music 0.6 × master 0.8 by default). The meter is the engine's output before that.
      Score: <code>client/src/score/</code>, one file a piece · engine <code>client/src/music.ts</code> · render and measure: <code>node tools/music/render.mjs</code>.
    </div>
  </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const r = (k: string) => $<HTMLElement>(`[data-r="${k}"]`);

  // ---- audio, created on the first gesture (Safari and Chrome both insist) ----
  let ac: AudioContext | null = null;
  let out: GainNode, analyser: AnalyserNode;
  const vol = r("vol") as HTMLInputElement;
  vol.value = String(loadVol());
  function audio(): AudioContext {
    if (!ac) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      ac = new AC() as AudioContext;
      out = ac.createGain(); out.gain.value = +vol.value;
      analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      out.connect(analyser); analyser.connect(ac.destination);
      initMusic(ac, out);
    }
    if (ac.state !== "running") void ac.resume();
    return ac;
  }
  vol.oninput = () => { if (ac) out.gain.value = +vol.value; saveVol(+vol.value); };

  // ---- the lists ----
  const items: Item[] = [];
  const buttons = new Map<string, HTMLButtonElement>();
  const lists = r("lists");
  const idOf = (it: Item) => `${it.kind}:${it.key}`;

  /** only a gap gets a badge now that the whole score is written */
  function badge(c: Cue | null): string {
    return c ? "" : `<span class="badge none">NONE</span>`;
  }
  function addList(title: string, rows: { it: Item; cue: Cue | null; tag: string }[]): void {
    const h = document.createElement("h2"); h.textContent = title;
    const ul = document.createElement("ul");
    for (const { it, cue, tag } of rows) {
      const b = document.createElement("button");
      b.innerHTML = `<span class="z"></span><span class="k">${badge(cue)}</span><span class="p"></span><span class="g"></span>`;
      (b.querySelector(".z") as HTMLElement).textContent = it.label;
      (b.querySelector(".p") as HTMLElement).textContent = it.sub;
      (b.querySelector(".g") as HTMLElement).textContent = tag;
      b.onclick = () => { selected = items.indexOf(it); play(it); };
      const li = document.createElement("li"); li.append(b); ul.append(li);
      items.push(it); buttons.set(idOf(it), b);
    }
    lists.append(h, ul);
  }

  // zones in zones.json order, grouped by region: roughly the player's route
  const regions = new Map<string, string[]>();
  for (const z of zoneKeys) {
    const reg = ZONES[z].region ?? "Elsewhere";
    if (!regions.has(reg)) regions.set(reg, []);
    regions.get(reg)!.push(z);
  }
  for (const [reg, zs] of regions) {
    addList(reg, zs.map((z) => {
      const cue = fieldCue(z);
      return {
        it: { kind: "zone", key: z, label: ZONES[z].name ?? z, sub: cue ? cue.title : "no music" } as Item,
        cue, tag: `${z} · ${zoneGroup(z)} battle`,
      };
    }));
  }
  addList("Battle themes", BATTLE_GROUPS.map((g) => {
    const cue = battleCue(g.key);
    return { it: { kind: "battle", key: g.key, label: g.label, sub: cue?.title ?? "no music" } as Item, cue, tag: g.covers };
  }));
  // pieces written for a cutscene rather than a place: the intro's overture
  addList("Cutscenes", Object.keys(SCORE.scenes).map((id) => {
    const cue = sceneCue(id);
    return { it: { kind: "scene", key: id, label: cue?.title ?? id, sub: `the ${id} scene` } as Item, cue, tag: id };
  }));
  addList("Palette (engine demos, not score)", PALETTE.map((d) => ({
    it: { kind: "demo", key: d.key, label: d.title, sub: d.note } as Item, cue: null, tag: d.key,
  })));
  // demos are not cues; drop the NONE badge on them
  for (const d of PALETTE) buttons.get(`demo:${d.key}`)!.querySelector(".k")!.innerHTML = "";

  // ---- playing ----
  let selected = 0;
  let playing: Item | null = null;
  let label = { title: "", badge: "", note: "", meta: "" };
  let lastPos = 0, pass = 1;

  function songMeta(s: Song): string {
    const c = compile(s);
    return `${s.bpm} bpm · ${s.beats ?? 4} beats/bar · intro ${fmt(c.loopAt)} · loop ${fmt(c.end - c.loopAt)}`;
  }

  function play(it: Item): void {
    audio();
    playing = it; pass = 1; lastPos = 0;
    for (const [id, b] of buttons) b.classList.toggle("playing", id === idOf(it));
    if (it.kind === "zone") {
      // exactly what audio.ts startZoneAudio does on entering the zone
      const m = zoneMusic(it.key);
      const cue = fieldCue(it.key);
      setZoneMusic(m.field, m.battle, m.boss);
      label = {
        title: `${ZONES[it.key].name} — ${cue?.title ?? "no music"}`,
        badge: badge(cue), note: cue?.note ?? "",
        meta: cue ? `${cue.file} · battle: ${battleCue(zoneGroup(it.key))?.title ?? "none"}` : "",
      };
    } else if (it.kind === "battle") {
      const cue = battleCue(it.key);
      // a battle theme on its own: as the field slot, so it loops and can be seeked
      setZoneMusic(cue?.song ?? null, null, null);
      label = { title: cue?.title ?? "no music", badge: badge(cue), note: cue?.note ?? "", meta: cue?.file ?? "" };
    } else if (it.kind === "scene") {
      const cue = sceneCue(it.key);
      setZoneMusic(cue?.song ?? null, null, null);
      label = { title: cue?.title ?? "no music", badge: badge(cue), note: cue?.note ?? "", meta: cue?.file ?? "" };
    } else {
      const d = PALETTE.find((p) => p.key === it.key)!;
      setZoneMusic(d.song, null, null);
      label = { title: d.title, badge: "", note: d.note, meta: "palette demo" };
    }
    paintLabel();
  }

  function stop(): void {
    setZoneMusic(null, null, null);
    stopSong();
    playing = null;
    for (const b of buttons.values()) b.classList.remove("playing");
    label = { title: "Nothing playing", badge: "", note: "", meta: "" };
    paintLabel();
  }

  function paintLabel(): void {
    // in a fight the zone's row stays chosen but the title says what is sounding
    let title = label.title || "Nothing playing";
    const st0 = musicState();
    if (playing?.kind === "zone" && st0.song && st0.mode !== "field") {
      const cue = battleCue(st0.mode === "boss" ? "boss" : zoneGroup(playing.key));
      title = `${ZONES[playing.key].name} — ${cue?.title ?? "no music"} (${st0.mode})`;
    }
    r("title").textContent = title;
    r("badge").innerHTML = label.badge;
    r("note").textContent = label.note;
    const st = musicState();
    r("meta").textContent = [label.meta, st.song ? songMeta(st.song) : ""].filter(Boolean).join(" · ");
  }

  function choose(i: number): void {
    selected = (i + items.length) % items.length;
    const b = buttons.get(idOf(items[selected]))!;
    for (const x of buttons.values()) x.classList.remove("sel");
    b.classList.add("sel");
    b.scrollIntoView({ block: "nearest" });
  }

  // the combat buttons are the game's own calls, so the hysteresis and the
  // sticky boss flag behave here exactly as in a fight
  const battle = () => { audio(); setMusicCombat(true, false); };
  const boss = () => { audio(); setMusicCombat(true, true); };
  const disengage = () => setMusicCombat(false);
  function cycle(): void {
    const st = musicState();
    if (!st.engaged || st.leaving) battle();
    else if (!st.boss) boss();
    else disengage();
  }
  function seamJump(): void {
    const st = musicState();
    if (!st.compiled) return;
    seekMusic(Math.max(st.compiled.loopAt, st.compiled.end - 8));
  }
  const seekBy = (d: number) => { const st = musicState(); if (st.compiled) seekMusic(Math.max(0, st.position + d)); };
  function formJump(i: number): void {
    const st = musicState();
    const m = st.compiled?.marks[i];
    if (m) seekMusic(m.t);
  }

  const actions: Record<string, () => void> = {
    play: () => (musicState().song ? stop() : play(playing ?? items[selected])),
    battle, boss, disengage, cycle, seam: seamJump,
    loop: () => { const c = musicState().compiled; if (c) seekMusic(c.loopAt); },
  };
  root.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => {
    b.onclick = () => actions[b.dataset.a!]();
  });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onRange = (e.target as HTMLElement)?.tagName === "INPUT";
    const k = e.key;
    const handled = (() => {
      if (k === " ") { actions.play(); return true; }
      if (k === "ArrowDown" && !onRange) { choose(selected + 1); return true; }
      if (k === "ArrowUp" && !onRange) { choose(selected - 1); return true; }
      if (k === "Enter" && (e.target as HTMLElement)?.tagName !== "BUTTON") { play(items[selected]); return true; }
      if (k === "ArrowRight" && !onRange) { seekBy(10); return true; }
      if (k === "ArrowLeft" && !onRange) { seekBy(-10); return true; }
      const lk = k.toLowerCase();
      if (lk === "b") { battle(); return true; }
      if (lk === "x") { boss(); return true; }
      if (lk === "d") { disengage(); return true; }
      if (lk === "c") { cycle(); return true; }
      if (lk === "j") { seamJump(); return true; }
      if (lk === "l") { actions.loop(); return true; }
      if (k >= "1" && k <= "9") { formJump(+k - 1); return true; }
      if (k === "-" || k === "=" || k === "+") {
        vol.value = String(Math.min(1, Math.max(0, +vol.value + (k === "-" ? -0.05 : 0.05))));
        vol.dispatchEvent(new Event("input"));
        return true;
      }
      return false;
    })();
    if (handled) e.preventDefault();
  });

  // ---- the timeline: the form as segments, the loop in blue, the playhead ----
  const tl = r("tl");
  let tlFor: Compiled | null = null;
  let segs: HTMLElement[] = [];
  let head: HTMLElement;
  function buildTimeline(c: Compiled | null, s: Song | null): void {
    tlFor = c;
    tl.innerHTML = "";
    segs = [];
    if (!c || !s) return;
    for (let i = 0; i < c.marks.length; i++) {
      const m = c.marks[i];
      const endT = c.marks[i + 1]?.t ?? c.end;
      const d = document.createElement("div");
      d.className = "seg" + (m.t >= c.loopAt - 1e-6 ? " loop" : "");
      d.style.left = `${(m.t / c.end) * 100}%`;
      d.style.width = `${((endT - m.t) / c.end) * 100}%`;
      d.textContent = secName(s, m.si);
      d.title = `form ${i + 1}: section ${secName(s, m.si)} (${m.bars} bars) at ${fmt(m.t)}`;
      tl.append(d); segs.push(d);
    }
    const lp = document.createElement("div"); lp.className = "lp"; lp.style.left = `${(c.loopAt / c.end) * 100}%`;
    head = document.createElement("div"); head.className = "head";
    tl.append(lp, head);
  }
  tl.onclick = (e) => {
    const c = musicState().compiled;
    if (!c) return;
    const box = tl.getBoundingClientRect();
    seekMusic(((e.clientX - box.left) / box.width) * c.end);
  };

  // ---- the readout, at display rate ----
  const buf = new Float32Array(2048);
  let peakHold = -Infinity, peakAt = 0;
  function frame(): void {
    const st = musicState();
    const c = st.compiled;
    if (c !== tlFor) { buildTimeline(c, st.song); paintLabel(); pass = 1; lastPos = 0; }
    for (const m of ["field", "battle", "boss"] as const) {
      root.querySelector(`[data-m="${m}"]`)!.classList.toggle("on", !!c && st.mode === m);
    }
    r("status").textContent = st.leaving ? "combat over: field theme in 3.5s" : st.engaged ? (st.boss ? "boss fight" : "in combat") : "";
    if (c && st.song) {
      // a wrap is the transport going from the end back to the loop point, not a seek
      if (lastPos > c.end - 0.6 && st.position < c.loopAt + 0.6 && st.position + 0.5 < lastPos) pass++;
      lastPos = st.position;
      head.style.left = `${(st.position / c.end) * 100}%`;
      let fi = 0;
      for (let i = 0; i < c.marks.length; i++) if (c.marks[i].t <= st.position + 1e-6) fi = i;
      segs.forEach((s, i) => s.classList.toggle("cur", i === fi));
      const m = c.marks[fi];
      const beats = st.song.beats ?? 4;
      const into = st.position - m.t;
      const barIn = Math.floor(into / c.bar);
      const beatIn = Math.floor((into - barIn * c.bar) / (c.bar / beats));
      r("readout").innerHTML =
        `<span>section <b>${secName(st.song, m.si)}</b> (form ${fi + 1}/${c.marks.length})</span>` +
        `<span>bar <b>${barIn + 1}</b>/${m.bars} beat <b>${beatIn + 1}</b></span>` +
        `<span>song bar <b>${Math.floor(st.position / c.bar) + 1}</b></span>` +
        `<span><b>${fmt(st.position)}</b> / ${fmt(c.end)}</span>` +
        `<span>${st.position >= c.loopAt ? `in loop, pass <b>${pass}</b>` : "intro"}</span>`;
    } else {
      r("readout").innerHTML = "";
    }
    if (ac) {
      analyser.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
      const dbv = p > 0 ? 20 * Math.log10(p) : -96;
      const now = performance.now();
      if (dbv > peakHold || now - peakAt > 1500) { peakHold = dbv; peakAt = now; }
      (r("meter") as HTMLElement).style.width = `${Math.max(0, Math.min(100, ((dbv + 48) / 48) * 100))}%`;
      r("peak").textContent = Number.isFinite(peakHold) && peakHold > -90 ? `${peakHold.toFixed(1)} dB` : "";
    }
    requestAnimationFrame(frame);
  }
  choose(0);
  requestAnimationFrame(frame);

  installRenderHandle();
}

// ---------- offline render, for tools/music/render.mjs ----------

export interface RenderSpec {
  /** a zone key; `mode` picks its field theme (default), its group's battle theme, or the boss theme */
  zone?: string;
  mode?: "field" | "battle" | "boss";
  /** a battle group directly */
  group?: BattleGroup;
  /** a cutscene's own piece (score/ `scenes`) */
  scene?: string;
  /** a palette demo key */
  palette?: string;
  /** seconds to render; default: one full pass plus 12s past the seam */
  seconds?: number;
  wav?: boolean;
}

function resolve(spec: RenderSpec): { song: Song; title: string; label: string; file: string } {
  if (spec.palette) {
    const d = PALETTE.find((p) => p.key === spec.palette);
    if (!d) throw new Error(`no palette demo ${spec.palette}: ${PALETTE.map((p) => p.key).join(" ")}`);
    return { song: d.song, title: d.title, label: `palette ${d.key}`, file: "music-palette.ts" };
  }
  if (spec.scene) {
    const c = sceneCue(spec.scene);
    if (!c) throw new Error(`no piece for the ${spec.scene} scene`);
    return { song: c.song, title: c.title, label: `scene ${spec.scene}`, file: c.file };
  }
  if (spec.group) {
    const c = battleCue(spec.group);
    if (!c) throw new Error(`no ${spec.group} battle theme`);
    return { song: c.song, title: c.title, label: `${spec.group} battle`, file: c.file };
  }
  if (spec.zone) {
    if (!ZONES[spec.zone]) throw new Error(`no zone ${spec.zone}`);
    const mode = spec.mode ?? "field";
    const c = mode === "field" ? fieldCue(spec.zone) : battleCue(mode === "boss" ? "boss" : zoneGroup(spec.zone));
    if (!c) throw new Error(`${spec.zone} has no ${mode} music`);
    return { song: c.song, title: c.title, label: `${spec.zone} ${mode}`, file: c.file };
  }
  throw new Error("say what to render: zone, group or palette");
}

function wavBytes(ch: Float32Array[], rate: number): Uint8Array {
  const n = ch[0].length, nch = ch.length;
  const buf = new ArrayBuffer(44 + n * nch * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * nch * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * nch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    const s = Math.max(-1, Math.min(1, ch[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Uint8Array(buf);
}

function installRenderHandle(): void {
  let chunks: string[] = [];
  (window as any).__music = {
    list: () => ({
      zones: Object.keys(ZONES).map((z) => ({ zone: z, cue: fieldCue(z)?.title ?? null, group: zoneGroup(z) })),
      battle: BATTLE_GROUPS.map((g) => ({ group: g.key, title: battleCue(g.key)?.title ?? null })),
      palette: PALETTE.map((p) => p.key),
      pieces: Object.values(SCORE.zones).concat(Object.values(SCORE.battle) as any, Object.values(SCORE.scenes) as any).map((e: any) => e.file),
      scenes: Object.keys(SCORE.scenes),
    }),
    async render(spec: RenderSpec) {
      const { song, title, label, file } = resolve(spec);
      const c = compile(song);
      const rate = 48000;
      const seconds = spec.seconds ?? c.end + Math.min(12, c.end - c.loopAt) + 0.5;
      const t0 = performance.now();
      const ab = await renderSong(song, { seconds, sampleRate: rate });
      const wall = (performance.now() - t0) / 1000;
      const ch = [ab.getChannelData(0), ab.getChannelData(1)];
      const firstPass = ch.map((x) => x.subarray(0, Math.min(x.length, Math.round(c.end * rate))));
      const loopBody = ch.map((x) => x.subarray(Math.round(c.loopAt * rate), Math.min(x.length, Math.round(c.end * rate))));
      const lu = loudness(firstPass, rate);
      const luLoop = loudness(loopBody, rate);
      const pk = peak(ch, rate);
      const sm = seconds >= c.end + 1 ? seam(ch, rate, c.end, c.loopAt, c.bar) : null;
      chunks = [];
      if (spec.wav !== false) {
        const bytes = wavBytes(ch, rate);
        const CH = 3 << 20;
        for (let i = 0; i < bytes.length; i += CH) {
          let s = "";
          const part = bytes.subarray(i, i + CH);
          for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode(...part.subarray(j, j + 0x8000));
          chunks.push(btoa(s));
        }
      }
      return {
        label, title, file,
        bpm: song.bpm, beats: song.beats ?? 4, bar: c.bar, swing: song.swing ?? 0, space: song.space ?? 2.6,
        form: song.form, loopFrom: song.loopFrom ?? 0,
        loopAt: c.loopAt, end: c.end,
        marks: c.marks,
        sections: song.sections.map((s, i) => ({ i, bars: c.marks.find((m) => m.si === i)?.bars ?? 0 })),
        rate, seconds, wall,
        peak: pk, loudness: lu, loudnessLoop: luLoop,
        rms: rmsDb(firstPass, rate, 0, c.end),
        bars: barProfile(ch, rate, c.bar),
        seam: sm,
        load: voiceLoad(c),
        chunks: chunks.length,
      };
    },
    chunk: (i: number) => chunks[i],
  };
}
