// Cutscene preview -- a dev view at /?cutscene=<id> that plays any scene in
// shared/data/cutscenes/*.json over its zone, with no account and no server.
//
// Same reason as ?lineup and ?zone=: a shot described in numbers is a guess
// until somebody looks at it, and the only way to look at a scene in the game
// is to make a new character and sit through it. Here the watcher is a
// stand-in of any race, the zone's residents stand on their marks, and the
// scene plays exactly as cutscene.ts plays it in the game.
//
//   /?cutscene=opening_caerdun                   plays it once
//   /?cutscene=opening_caerdun&loop              again and again
//   /?cutscene=opening_caerdun&t=21&pause        frozen 21 seconds in
//   /?cutscene=opening_moonmere&race=nym&face=female&hair=bun&hair_colour=auburn&job=WHM
//   /?cutscene=opening_caerdun&nosound          rolls at once, in silence
//
// A browser will not play sound before the page is clicked, so with sound the
// scene waits on a Play button once its cast is dressed (the score starts on
// the scene's first bar, as in the game). &pause, &t and &nosound skip it.
//
// Keys: Space pause, Left/Right a shot back or on, R from the top, Esc twice
// skips (as in the game). window.__cs = { seek(t), pause(), play(), info() }
// for a script that wants a picture of every shot.
import "./style.css";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { initEngine, buildZone, groundHeight, entryHeight, standHeight, resolveCollision, updateCarpet, engine, scene } from "./scene";
import "./zones";
import { buildAvatar, buildNpcAvatar, placeNpcAvatar, animateAvatar, buildMonsterMesh, animateMonster, type AvatarNode, type Look, type MonsterNode } from "./entities";
import { actorDrawn, npcPresent } from "./actor-reveal";
import { appearanceChoice } from "./appearance";
import { CutscenePlayer, campPose, nearestCrystal, type CutsceneStage } from "./cutscene";
import { shotAt, shotSpans, duration } from "./cutscene_plan";
import { CUTSCENES, CINEMAS, ZONES, PLAYABLE_RACES, JOB_LIST } from "./data";
import { playCinema } from "./cutscene-cinema";

import { unlockAudio, startZoneAudio } from "./audio";
import { musicState } from "./music";
import { fieldCue } from "./score";

const STEP = 1 / 30; // the fast-forward's frame, for a seek

export function runCutsceneView(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const id = params.get("cutscene") || "";
  if (CINEMAS[id]) { runCinemaView(canvas, id, params); return; }
  const def = CUTSCENES[id];
  if (!def) {
    document.body.innerHTML = `<div style="font:15px/1.7 monospace;color:#f2ead8;background:#141a2e;padding:2rem">`
      + `<b>?cutscene=${id || "(missing)"}</b> is not a scene.<br><br>`
      + Object.entries(CUTSCENES).map(([k, d]) => `<a style="color:#9fc6ff" href="?cutscene=${k}">${k}</a> <span style="opacity:.55">${d.name}, ${d.zone}, ${duration(d).toFixed(0)}s</span>`).join("<br>")
      + Object.entries(CINEMAS).map(([k, d]) => `<br><a style="color:#9fc6ff" href="?cutscene=${k}">${k}</a> <span style="opacity:.55">${d.name}, ${d.chapters.length} chapters</span>`).join("")
      + `</div>`;
    return;
  }
  // a scene that plays anywhere (the first crystal) is looked at in &zone=, by its first crystal
  const zoneKey: string = def.zone === "*" ? (params.get("zone") || "caerdunfields") : def.zone;
  const zone = ZONES[zoneKey];
  const race = PLAYABLE_RACES.includes(params.get("race") || "") ? params.get("race")! : "aedri";
  const job = JOB_LIST.includes((params.get("job") || "").toUpperCase()) ? params.get("job")!.toUpperCase() : "PLD";
  const appearance = appearanceChoice(race, {
    face: params.get("face") === "female" ? "female" : "male",
    hair: (params.get("hair") || undefined) as any,
    beard: params.get("beard") !== "none",
    hair_colour: (params.get("hair_colour") || undefined) as any,
  });
  // what a new character wears: the starter weapon and the Traveler's clothes
  const WEAPON: Record<string, string> = { PLD: "worn_sword", SAM: "worn_katana", DRK: "worn_greatsword", BLM: "ash_staff", WHM: "worn_cudgel", MNK: "cloth_wraps" };
  const look: Look = { w: WEAPON[job], b: "traveler_tunic", l: "traveler_slops" };

  initEngine(canvas, true);
  buildZone(zoneKey);
  const crystal0 = (zone.milestones ?? [])[0];
  const start = def.zone === "*" && crystal0 ? { x: crystal0.x, z: crystal0.z - 4, h: 0 } : zone.start ?? zone.spawn ?? { x: 0, z: 0, h: 0 };
  const home = { x: start.x as number, z: start.z as number, h: (start.h ?? 0) as number };
  let me = { x: home.x, y: entryHeight(home.x, home.z), z: home.z, h: home.h };
  let anim = "idle";
  const subject: AvatarNode = buildAvatar("me", race, job, false, look, undefined, appearance);
  const npcs = new Map<string, AvatarNode>();
  for (const n of zone.npcs ?? []) { const av = buildNpcAvatar(n); placeNpcAvatar(av, n); npcs.set(n.id, av); }
  const npcAnim = new Map<string, string>();
  // a dungeon's monsters, one at the middle of each camp, so a reveal down its
  // halls can be framed against what the game will put there (where in its camp
  // each one stands in play is its wander's business)
  const monsters: MonsterNode[] = [];
  if (zone.kind === "dungeon") {
    for (const c of zone.camps ?? []) {
      const node = buildMonsterMesh(`m_cv_${monsters.length}`, c.monster);
      node.root.position.set(c.x, standHeight(c.x, c.z, groundHeight(c.x, c.z)), c.z);
      monsters.push(node);
    }
  }

  // the play camera the scene hands back to: behind the watcher, as in game
  const camera = new ArcRotateCamera("cv_cam", -home.h - Math.PI / 2, 1.3, 9, new Vector3(me.x, me.y + 2, me.z), scene);
  camera.attachControl(canvas, true);
  camera.maxZ = 4000;

  const stage: CutsceneStage = {
    scene, name: params.get("name") || "Wren", npcs: zone.npcs ?? [],
    ground: (x, z) => groundHeight(x, z),
    subject: () => ({ ...me }),
    moveSubject(x, z, h) {
      const [rx, rz] = resolveCollision(me.x, me.z, x, z, me.y);
      me = { x: rx, y: groundHeight(rx, rz, me.y), z: rz, h };
    },
    placeSubject(x, z, h) { me = { x, y: entryHeight(x, z), z, h }; },
    subjectAnim(a) { anim = a; },
    npc(n) { const av = npcs.get(n); return av ? { x: av.root.position.x, y: av.root.position.y, z: av.root.position.z, h: av.root.rotation.y } : undefined; },
    camp: (key) => campPose(zoneKey, key),
    crystal: () => nearestCrystal(zoneKey, me.x, me.z),
    zone: () => zoneKey,
    turnNpc(n, h) { const av = npcs.get(n); if (av) av.root.rotation.y = h ?? ((zone.npcs ?? []).find((d: any) => d.id === n)?.h ?? Math.PI); },
    npcAnim(n, a) { if (a) npcAnim.set(n, a); else npcAnim.delete(n); },
    handBack(from) {
      camera.target.set(me.x, me.y + 2, me.z);
      const dx = from.pos.x - me.x, dy = from.pos.y - me.y - 2, dz = from.pos.z - me.z, r = Math.hypot(dx, dy, dz);
      if (r > 0.5) { camera.alpha = Math.atan2(dz, dx); camera.beta = Math.acos(dy / r); camera.radius = Math.min(14, r); }
    },
  };

  let player: CutscenePlayer | null = null;
  let paused = params.has("pause");
  const reset = (warm = true) => {
    player?.abort();
    me = { x: home.x, y: entryHeight(home.x, home.z), z: home.z, h: home.h };
    anim = "idle";
    npcAnim.clear();
    for (const n of zone.npcs ?? []) { const av = npcs.get(n.id); if (av) placeNpcAvatar(av, n); }
    const mine = player = new CutscenePlayer(def, stage);
    player.start(warm);
    // only a scene that ran out loops: a seek or a restart aborts the old one
    void mine.finished.then(() => { if (params.has("loop") && player === mine && mine.t >= mine.total) setTimeout(() => { if (player === mine) reset(); }, 1500); });
  };
  // a seek replays the scene from the top in fixed steps, so where the actors
  // stand at t is where they would have walked to by then
  const seek = (t: number) => {
    reset(false);
    const target = Math.max(0, Math.min(t, duration(def) - 0.01));
    while (player && player.t < target - 1e-6) player.update(Math.min(STEP, target - player.t));
  };

  const info = document.createElement("div");
  info.style.cssText = "position:fixed;left:10px;top:10px;z-index:60;font:12px/1.6 ui-monospace,monospace;"
    + "color:#f2ead8;background:#141a2ecc;padding:6px 10px;border-radius:6px;white-space:pre;pointer-events:none";
  if (!params.has("clean")) document.body.appendChild(info);
  const spans = shotSpans(def);
  addEventListener("keydown", (e) => {
    if (!player) return;
    if (e.code === "Space") { paused = !paused; e.preventDefault(); }
    if (e.code === "KeyR") seek(0);
    const now = shotAt(def, player.t).index;
    if (e.code === "ArrowRight") seek(spans[Math.min(spans.length - 1, now + 1)].start);
    if (e.code === "ArrowLeft") seek(spans[Math.max(0, now - 1)].start);
  });
  (window as unknown as Record<string, unknown>).__cs = {
    seek, pause: () => { paused = true; }, play: () => { paused = false; },
    npc: (n: string) => stage.npc(n), cam: () => scene.activeCamera?.globalPosition, scene: () => scene,
    // what the score is playing, for a script: the scene's cue's title if it is that piece, and how far in
    music: () => {
      const m = musicState(), cue = fieldCue(def.music && def.music !== "none" ? def.music : def.zone);
      return { title: m.song ? (cue?.song === m.song ? cue.title : "(another piece)") : null, position: +m.position.toFixed(2), mode: m.mode };
    },
    info: () => ({ t: player?.t ?? 0, shot: player ? shotAt(def, player.t).index : 0, total: duration(def), spans, me }),
    ready: () => actorDrawn(subject) && [...npcs.values()].every((av) => npcPresent(av)),
  };

  // wait for the cast to be dressed, as the game does, then roll
  let rolling = false;
  const firstT = Number(params.get("t")) || 0;
  // sound: the city's ambience and the scene's score (cutscene.ts scoreCutscene)
  let played = params.has("nosound") || params.has("pause") || !!firstT;
  const sound = () => { unlockAudio(); startZoneAudio(zoneKey); };
  const play = document.createElement("button");
  play.textContent = "▶  Play with sound";
  play.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;padding:14px 26px;"
    + "font:600 15px Cinzel,serif;letter-spacing:2px;color:#f3ead6;background:#0b0e15e6;border:1px solid #c9a35c;border-radius:6px;cursor:pointer";
  play.hidden = true;
  document.body.appendChild(play);
  play.addEventListener("click", () => { play.remove(); sound(); played = true; });
  // after the first play, R and a restart keep the sound they already have
  addEventListener("pointerdown", () => { if (played) unlockAudio(); });
  const waitStart = performance.now();
  let last = performance.now();
  engine.runRenderLoop(() => {
    const nowMs = performance.now(), dt = Math.min(0.1, (nowMs - last) / 1000), now = nowMs / 1000;
    last = nowMs;
    const cast = (actorDrawn(subject) || nowMs - waitStart > 15000) && ([...npcs.values()].every((av) => npcPresent(av)) || nowMs - waitStart > 15000);
    if (!rolling && cast && !played) play.hidden = false;
    if (!rolling && cast && played) {
      rolling = true;
      if (firstT) seek(firstT); else reset();
    }
    if (rolling && player && !paused) player.update(dt);
    subject.root.position.set(me.x, standHeight(me.x, me.z, me.y), me.z);
    subject.root.rotation.y = me.h;
    animateAvatar(subject, anim, dt, now);
    npcs.forEach((av, n) => animateAvatar(av, npcAnim.get(n) ?? "idle", dt, now));
    for (const m of monsters) animateMonster(m, false, dt, now);
    updateCarpet(me.x, me.z);
    if (player) {
      const { index } = shotAt(def, player.t);
      info.textContent = `${id}  ${def.name}\nshot ${index + 1}/${def.shots.length}  t ${player.t.toFixed(1)} / ${duration(def).toFixed(1)}s${paused ? "  (paused)" : ""}\nSpace pause · ←/→ shot · R restart`;
    } else info.textContent = `${id}: dressing the cast…`;
    if (scene.activeCamera) scene.render();
  });
}

// The intro (and any scene told in chapters): it builds its own zones, so the
// view is only the engine, a Play button for the browser's sound rule, and a
// Replay at the end. &chapter=N starts at chapter N (1-based) with the music
// there too; &nosound plays at once, silent.
function runCinemaView(canvas: HTMLCanvasElement, id: string, params: URLSearchParams): void {
  initEngine(canvas, true);
  const def = CINEMAS[id];
  const from = Math.max(0, (Number(params.get("chapter")) || 1) - 1);
  const button = (label: string, go: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;padding:14px 26px;"
      + "font:600 15px Cinzel,serif;letter-spacing:2px;color:#f3ead6;background:#0b0e15e6;border:1px solid #c9a35c;border-radius:6px;cursor:pointer";
    b.addEventListener("click", () => { b.remove(); go(); });
    document.body.appendChild(b);
  };
  document.body.style.background = "#000";
  const roll = () => {
    (window as unknown as Record<string, unknown>).__cin = { state: "playing", started: performance.now() };
    void playCinema(id, def, { fromChapter: from }).then((r) => {
      (window as unknown as Record<string, unknown>).__cin = { state: "ended", skipped: r.skipped };
      button("↻  Replay", roll);
    });
  };
  if (params.has("nosound")) roll();
  else button("▶  Play with sound", () => { unlockAudio(); roll(); });
}
