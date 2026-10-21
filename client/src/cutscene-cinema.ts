// The intro: a scene told in chapters across the world (cutscenes/*.json
// `intro`; Philip's ruling 2026-10-11 -- every new character sees it before
// their city's opening). It plays before the character joins the world, so
// nobody else sees them and no server state moves until it ends.
//
// One zone is in memory at a time, so each chapter is a narration card on
// black, behind which its zone builds (a synchronous build of 0.6-3.4 s, so
// the music is scheduled ahead first: music.ts musicPrefill) and then warms
// (cutscene.ts), and then its shots, played by an ordinary CutscenePlayer. The
// card's words stay over the first shot (Card.hold) rather than holding the
// screen black, so the black is only as long as a build needs. The overture
// (score/intro.ts) leads: a card comes in on its chapter's bar and the shots
// start cardBars later. A chapter late from its warm-up rolls the moment it is
// ready and skips ahead by its lateness, so every cut stays on its beat. The
// first chapter is built and warmed before the music starts at all. The intro
// skips as a whole.
//
// The intro builds no NPCs (the zones' own are placed by world.ts for play),
// so a street that should be busy brings its own townsfolk (Chapter.crowd),
// and a Border Gate it opens (Chapter.gates) is shut, with no veil, until then.
import { engine, scene, buildZone, groundHeight, updateCarpet, pinCutsceneDaytime, setBorderGateOpen, worldObjects } from "./scene";
import { CutscenePlayer, type CutsceneStage } from "./cutscene";
import { chapterScene, chapterTimes, CARD_HOLD, type CinemaDef, type Chapter } from "./cutscene_plan";
import { buildNpcAvatar, placeNpcAvatar, animateAvatar, disposeAvatar, type AvatarNode } from "./entities";
import { npcPresent } from "./actor-reveal";
import { ZONES } from "./data";
import { compile, playSong, musicPrefill, fadeOutSong } from "./music";
import { sceneCue } from "./score";
import { unlockAudio, audioUnlocked } from "./audio";

export interface CinemaResult { skipped: boolean }

const CARD_FADE_MS = 500;   // the card's own fade (style.css #cinema .cin-card)
const WARM_QUIET_MS = 300;  // the warm-up's settle, short: the card is a bar
const CROWD_WAIT_S = 6;     // the most the first chapter waits for its townsfolk to dress
const STROLL = 1.3;         // a townsperson's walk, metres a second
const CROWD_BODIES = ["aedri-male", "aedri-female", "valdren-male"];
const PREFILL_S = 6;        // music handed to the audio clock before a build: the longest build is ~3.4 s
const END_FADE_S = 2.5;     // the overture dies away under the title

const nextFrame = () => new Promise<void>((done) => { requestAnimationFrame(() => done()); setTimeout(done, 120); });
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// The chapters have no watcher: nothing is "self", nobody walks, no NPC is cued.
// A chapter's townsfolk: deterministic (seeded by chapter and place), so every
// viewing sees the same street; walkers stroll their line's way, some each way.
interface Townsfolk { av: AvatarNode; dx: number; dz: number; walk: boolean }
function seeded(n: number): () => number {
  let x = (n * 2654435761) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function raiseCrowd(c: Chapter, chapter: number): Townsfolk[] {
  const out: Townsfolk[] = [];
  (c.crowd ?? []).forEach((g, gi) => {
    const rnd = seeded(chapter * 977 + gi * 131 + 7);
    const lx = g.to[0] - g.from[0], lz = g.to[1] - g.from[1], len = Math.hypot(lx, lz) || 1;
    const ux = lx / len, uz = lz / len, w = g.w ?? 3;
    for (let k = 0; k < g.n; k++) {
      const u = (k + rnd()) / g.n, side = (rnd() * 2 - 1) * w;
      const x = g.from[0] + lx * u - uz * side, z = g.from[1] + lz * u + ux * side;
      const walk = !!g.walk && rnd() < 0.75, back = rnd() < 0.5;
      const dx = walk ? (back ? -ux : ux) : 0, dz = walk ? (back ? -uz : uz) : 0;
      const h = walk ? Math.atan2(dx, dz) : rnd() * Math.PI * 2;
      // three bodies between them, not eight: each body brings its own
      // shaders, and the first chapter waits for every one to compile
      const av = buildNpcAvatar({ id: `intro_${chapter}_${gi}_${k}`, body: CROWD_BODIES[(gi * 7 + k) % CROWD_BODIES.length], kind: "flavor" } as any);
      placeNpcAvatar(av, { x, z, h });
      out.push({ av, dx, dz, walk });
    }
  });
  return out;
}
function stepCrowd(folk: Townsfolk[], dt: number, now: number): void {
  for (const f of folk) {
    if (f.walk) {
      const p = f.av.root.position;
      p.x += f.dx * STROLL * dt; p.z += f.dz * STROLL * dt;
      p.y = groundHeight(p.x, p.z);
    }
    animateAvatar(f.av, f.walk ? "walk" : "idle", dt, now);
  }
}

// A Border Gate the chapter opens starts shut, with no veil in it.
function gatedPortal(id: string, open: boolean): void {
  setBorderGateOpen(id, open);
  worldObjects.find((o) => o.kind === "portal" && o.id === id)?.mesh?.setEnabled(open);
}

function emptyStage(): CutsceneStage {
  return {
    scene, name: "", npcs: [],
    ground: (x, z) => groundHeight(x, z),
    subject: () => ({ x: 0, y: 0, z: 0, h: 0 }),
    moveSubject() {}, placeSubject() {}, subjectAnim() {},
    npc: () => undefined, turnNpc() {}, npcAnim() {},
    handBack() {},
  };
}

/**
 * Play a chapters scene on the engine already made (initEngine), with its own
 * render loop, and resolve when it has ended or been skipped. The last chapter's
 * zone is left built; whoever comes next builds over it.
 */
export function playCinema(id: string, def: CinemaDef, opts: { fromChapter?: number } = {}): Promise<CinemaResult> {
  const cue = sceneCue(id);
  const song = cue?.song ?? null;
  const barS = song ? compile(song).bar : 2;
  const times = chapterTimes(def, barS);
  const total = def.bars * barS;

  // ---- the frame over everything: black, the card, the skip ----
  const root = document.createElement("div");
  root.id = "cinema";
  root.innerHTML = `<div class="cin-wait"></div><div class="cin-card"><div class="cin-text"></div><div class="cin-sub"></div></div>`
    + `<div class="cs-skip"><span class="cs-skip-hint">Press Esc again to skip</span><button type="button" class="cs-skip-btn" tabindex="-1">Skip</button></div>`;
  document.body.appendChild(root);
  document.body.classList.add("in-cutscene", "in-cinema");
  const card = root.querySelector(".cin-card") as HTMLElement;
  const skipBox = root.querySelector(".cs-skip") as HTMLElement;
  const setCard = (text: string, sub: string | undefined, title: boolean) => {
    (card.querySelector(".cin-text") as HTMLElement).textContent = text;
    (card.querySelector(".cin-sub") as HTMLElement).textContent = sub ?? "";
    card.classList.toggle("title", title);
  };
  const black = (on: boolean) => root.classList.toggle("clear", !on);

  // ---- the clock: the overture's, which is the wall clock it started on ----
  // (fromChapter, for the dev view: start the clock and the music at that card)
  const first = Math.max(0, Math.min(def.chapters.length - 1, opts.fromChapter ?? 0));
  const offset = times[first].card;
  let t0 = performance.now() - offset * 1000;
  const now = () => (performance.now() - t0) / 1000;
  const startMusic = (from: number) => { if (song && audioUnlocked()) playSong(song, from > 0 ? 0.8 : 1.5, from); };
  const waitFor = async (t: number, cancelled: () => boolean) => { while (now() < t && !cancelled()) await sleep(Math.min(100, (t - now()) * 1000)); };

  let player: CutscenePlayer | null = null;
  let skipped = false, finished = false;
  let armedUntil = 0;
  const cancelled = () => skipped || finished;

  // ---- input: any gesture lets the sound in; Esc twice (or the button) skips ----
  const gesture = () => { if (!audioUnlocked()) { unlockAudio(); startMusic(now()); } };
  const skip = () => { if (!cancelled()) skipped = true; };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    gesture();
    if (e.code !== "Escape" || e.repeat) return;
    e.preventDefault();
    const t = performance.now() / 1000;
    if (t < armedUntil) skip(); else { armedUntil = t + 2.5; skipBox.classList.add("armed"); setTimeout(() => skipBox.classList.remove("armed"), 2500); }
  };
  window.addEventListener("keydown", onKey, true);
  root.addEventListener("pointerdown", gesture);
  root.querySelector(".cs-skip-btn")!.addEventListener("click", skip);

  // ---- the render loop: the chapter's player, its townsfolk, and the grass under the camera ----
  let folk: Townsfolk[] = [];
  let gates: { at: number; open: string; done: boolean }[] = [];
  let last = performance.now();
  const loop = () => {
    const nowMs = performance.now(), dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    if (folk.length) stepCrowd(folk, dt, nowMs / 1000);
    if (player && !player.ended && player.update(dt)) black(true); // on black the frame it hands back
    if (player) for (const g of gates) if (!g.done && player.t >= g.at - 1e-3 && rolledNow) { g.done = true; gatedPortal(g.open, true); }
    const cam = scene?.activeCamera;
    if (!cam) return;
    updateCarpet(cam.position.x, cam.position.z);
    scene.render();
  };
  let rolledNow = false;
  engine.runRenderLoop(loop);

  // A chapter's zone, built behind its card, its townsfolk raised and its gates
  // shut, and its player warming; it rolls on its bar, once the clock runs.
  let clockRunning = false;
  const prepare = (i: number) => {
    const c = def.chapters[i], at = times[i];
    if (clockRunning) musicPrefill(PREFILL_S);
    player?.abort();
    for (const f of folk) disposeAvatar(f.av);
    folk = []; gates = []; rolledNow = false;
    const buildAt = performance.now();
    buildZone(c.zone!);
    for (const g of c.gates ?? []) gatedPortal(g.open, false);
    gates = (c.gates ?? []).map((g) => ({ ...g, done: false }));
    folk = raiseCrowd(c, i + 1);
    // the timings, for a script to check a card is long enough (window.__cinLog)
    const entry = { chapter: i + 1, zone: c.zone, card: +at.card.toFixed(2), shotsDue: +at.shots.toFixed(2), build: +((performance.now() - buildAt) / 1000).toFixed(2), ready: -1, rolled: -1, late: 0, crowd: "" };
    ((window as unknown as { __cinLog?: unknown[] }).__cinLog ??= []).push(entry);
    let rolled = false;
    const p = new CutscenePlayer(chapterScene(c, `${id}:${i + 1}`), emptyStage(), {
      ownKeys: false, riseIntoPlay: false, warmQuietMs: WARM_QUIET_MS, warmLight: true,
      // the shots wait for their bar; a chapter late from its warm-up goes as soon as it can
      rollWhen: () => {
        if (!clockRunning) return false;
        if (entry.ready < 0) entry.ready = +now().toFixed(2);
        return now() >= at.shots - 0.02;
      },
      onRoll: () => {
        rolled = true; rolledNow = true;
        entry.rolled = +now().toFixed(2);
        if (folk.length) entry.crowd = `${folk.filter((f) => npcPresent(f.av)).length}/${folk.length} dressed`;
        // late: catch up with the music, so the cuts stay on their beats
        const late = now() - at.shots;
        if (late > 0.05) { entry.late = +late.toFixed(2); p.skipAhead(late); }
        black(false);
        // the card's words stay over the picture a moment, then go
        const hold = (c.card.hold ?? CARD_HOLD) * 1000, shown = card.dataset.n;
        card.classList.add("over");
        setTimeout(() => { if (card.dataset.n === shown) card.classList.remove("on", "over"); }, hold);
      },
    });
    player = p;
    p.start(true);
    return { p, rolled: () => rolled };
  };
  let cards = 0;
  const showCard = (i: number) => {
    const c = def.chapters[i];
    setCard(c.card.text, c.card.sub, !!c.card.title);
    card.dataset.n = String(++cards);
    card.classList.remove("over");
    card.classList.add("on");
    black(true);
  };

  const run = async (): Promise<void> => {
    // the first chapter is built and warmed before the music starts, so the
    // overture's opening bars never wait on a build
    let ready: ReturnType<typeof prepare> | null = null;
    if (def.chapters[first]?.zone) {
      // a few seconds on black before a note of music: say something is coming
      root.classList.add("waiting");
      await nextFrame();
      ready = prepare(first);
      // ...and its townsfolk dressed (a body still loading is never shown, actor-reveal.ts)
      const waitFrom = performance.now();
      while (!cancelled()) {
        const crowdIn = folk.every((f) => npcPresent(f.av)) || performance.now() - waitFrom > CROWD_WAIT_S * 1000;
        if (ready.p.warmed && crowdIn) break;
        await sleep(50);
      }
    }
    root.classList.remove("waiting");
    t0 = performance.now() - offset * 1000;
    clockRunning = true;
    startMusic(offset);
    for (let i = first; i < def.chapters.length && !cancelled(); i++) {
      const c = def.chapters[i], at = times[i];
      await waitFor(at.card, cancelled);
      showCard(i);
      if (!c.zone) { await waitFor(at.end, cancelled); break; }
      let cur = i === first ? ready : null;
      if (!cur) {
        // the card is on screen before the page is held for the build
        await sleep(CARD_FADE_MS);
        await nextFrame(); await nextFrame();
        if (cancelled()) break;
        cur = prepare(i);
      }
      while (!cur.p.ended && !cancelled()) await sleep(50);
      if (!cur.rolled()) black(true);
    }
    for (const f of folk) disposeAvatar(f.av);
    folk = [];
    if (!skipped) await waitFor(total - END_FADE_S, cancelled);
  };

  return run().then(async () => {
    finished = true;
    // the overture dies away over the title (or quickly, skipped) under black
    fadeOutSong(skipped ? 1.2 : END_FADE_S);
    player?.abort();
    player = null;
    for (const f of folk) disposeAvatar(f.av);
    folk = [];
    card.classList.remove("on", "over");
    black(true);
    await sleep(skipped ? 700 : END_FADE_S * 1000);
    pinCutsceneDaytime(null);
    engine.stopRenderLoop(loop);
    window.removeEventListener("keydown", onKey, true);
    document.body.classList.remove("in-cutscene", "in-cinema");
    root.remove();
    return { skipped };
  });
}
