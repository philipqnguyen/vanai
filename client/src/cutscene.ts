// Cutscenes, the half that plays them: the scene's own camera, the letterbox
// and subtitles, and the actors' cues, over the live zone. cutscene_plan.ts
// is the timeline it reads (and its header is the data's guide); world.ts and
// the /?cutscene= dev view are the two stages it plays on.
//
// The scene borrows the world rather than building one: it takes over
// scene.activeCamera (every LOD cell, shadow cascade and light pool already
// follows whichever camera is active), drives the watcher's own avatar and the
// zone's NPCs through the stage, and gives everything back at the end. The
// hand-back happens under black, so the scene's pinned hour and the play
// camera's return are never seen to jump; the play camera is set to where
// the scene's last shot stood, so play picks up from the same view.
import { TargetCamera, Vector3, type Camera, type Scene } from "@babylonjs/core";
import {
  cameraAt, fadeAt, barsAt, lineAt, titleAt, cuesCrossed, duration, shotSpans, lineHtml, speakerName,
  type CutsceneDef, type Pose, type Resolver, type CamPose, type Cue, WALK_SPEED,
} from "./cutscene_plan";
import { pinCutsceneDaytime, groundHeight } from "./scene";
import { ZONES } from "./data";
import { scoreCutscene, endCutsceneScore, hushForCutscene, unlockAudio, audioUnlocked } from "./audio";

/** What a scene needs of the place it plays in. */
export interface CutsceneStage {
  scene: Scene;
  /** the watcher's name, for {name} and their own lines */
  name: string;
  npcs: { id: string; name: string }[];
  ground(x: number, z: number): number;
  subject(): Pose;
  /** move the watcher; the stage applies the zone's collision and floors */
  moveSubject(x: number, z: number, h: number): void;
  /** stand the watcher on a spot outright (a scene's mark), no collision */
  placeSubject(x: number, z: number, h: number): void;
  subjectAnim(anim: string): void;
  npc(id: string): Pose | undefined;
  /** a monster's camp and the nearest crystal, for a look down a dungeon and a scene that plays anywhere */
  camp?(key: string): Pose | undefined;
  crystal?(): Pose | undefined;
  /** null puts them back to the facing their mark gives them */
  turnNpc(id: string, h: number | null): void;
  npcAnim(id: string, anim: string | null): void;
  /** the zone it is playing in (for a scene that plays anywhere) */
  zone?(): string;
  /** under black at the end: put the play camera back, looking from `from` */
  handBack(from: CamPose): void;
}

// A monster's camp and the nearest crystal, on the ground: what a dungeon reveal
// and a scene that plays anywhere point their cameras at.
export function campPose(zone: string, key: string): { x: number; y: number; z: number; h: number } | undefined {
  const c = (ZONES[zone]?.camps ?? []).find((k: any) => k.monster === key);
  return c ? { x: c.x, y: groundHeight(c.x, c.z), z: c.z, h: 0 } : undefined;
}
export function nearestCrystal(zone: string, x: number, z: number): { x: number; y: number; z: number; h: number } | undefined {
  let best: any = null, bd = Infinity;
  for (const m of ZONES[zone]?.milestones ?? []) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } }
  return best ? { x: best.x, y: best.y ?? groundHeight(best.x, best.z), z: best.z, h: 0 } : undefined;
}

export interface CutsceneResult { skipped: boolean }

/** How a scene plays inside something larger (the intro, cutscene-cinema.ts). */
export interface PlayerOptions {
  /** take the keyboard and show the skip (default); the intro skips as a whole */
  ownKeys?: boolean;
  /** fade up into play at the end (default), or stop on black for the next chapter */
  riseIntoPlay?: boolean;
  /** when the warm-up is done and the first frame is coming up */
  onRoll?: () => void;
  /** hold the first frame, warmed, until this says go (the intro's music leads) */
  rollWhen?: () => boolean;
  /** how long nothing new must arrive for the warm-up to call the zone settled
   *  (default WARM_QUIET_MS; the intro, behind a one-bar card, settles sooner) */
  warmQuietMs?: number;
  /** a lighter warm-up: each shot's two ends, two frames each, not its start,
   *  middle and end at three, and no waiting on the meadow (the intro, whose
   *  short shots fly a straight line, high and fast) */
  warmLight?: boolean;
}

const TURN_RATE = 5; // radians a second, an unhurried turn of the head and shoulders
const HAND_BACK_FADE = 0.5; // to black, when the last shot does not end on it
const HAND_BACK_RISE = 0.8; // from black into play
// The warm-up under black before the first frame. A scene starts while the zone
// is still streaming in (a fresh character's opening follows the loading veil
// by seconds), and its wide shots are the first look at most of the city: in
// Caerdun the first two seconds saw ~270 meshes, ~140 textures and ~140
// shaders arrive, with 200-900 ms frames (MEASURED 2026-10-11). So the scene
// holds on black, looks once from every shot's start, middle and end so their
// shaders compile and their LOD cells load unseen, then waits for the scene to
// stop changing -- never longer than WARM_MAX.
const WARM_FRAMES = 3;     // frames at each pose: one to ask, two for what it asked for
const WARM_QUIET_MS = 1000; // nothing new arriving for this long is settled
const WARM_MAX_MS = 15000;

const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnToward = (h: number, want: number, dt: number) => {
  const d = wrap(want - h), step = TURN_RATE * dt;
  return Math.abs(d) <= step ? want : h + Math.sign(d) * step;
};

interface Hold { anim: string; until: number }

export class CutscenePlayer {
  readonly def: CutsceneDef;
  readonly total: number;
  t = 0;
  private stage: CutsceneStage;
  private cam: TargetCamera | null = null;
  private before: Camera | null = null;
  private resolver: Resolver;
  private root: HTMLElement | null = null;
  private els: Record<string, HTMLElement> = {};
  private lineKey = "";
  private phase: "warming" | "playing" | "closing" | "rising" | "done" = "warming";
  private warmPoses: number[] = [];
  private warmFrame = 0;
  private warmFrom = 0;
  private warmSig = "";
  private warmSigAt = 0;
  private phaseT = 0;
  private closeFrom = 0;
  private skipped = false;
  private skipArmedUntil = 0;
  private lastPose: CamPose | null = null;
  private walk: { x: number; z: number; speed: number } | null = null;
  private selfFace: number | null = null;
  private selfHold: Hold | null = null;
  private npcFace = new Map<string, number>();
  private npcHold = new Map<string, Hold>();
  private done: (r: CutsceneResult) => void = () => {};
  readonly finished: Promise<CutsceneResult>;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  private opts: PlayerOptions;
  private faceCrystal: number | null = null;

  constructor(def: CutsceneDef, stage: CutsceneStage, opts: PlayerOptions = {}) {
    this.def = def;
    this.stage = stage;
    this.opts = { ownKeys: true, riseIntoPlay: true, ...opts };
    this.total = duration(def);
    this.finished = new Promise((r) => { this.done = r; });
    // A scene that plays anywhere (the first crystal) is framed from the watcher
    // to the crystal they touched: nothing turns a player to face what they touch,
    // so the start turns them, under the opening black.
    let frameH = def.mark ? def.mark[2] : stage.subject().h;
    const cr = def.zone === "*" ? stage.crystal?.() : undefined, me = stage.subject();
    if (cr && Math.hypot(cr.x - me.x, cr.z - me.z) > 0.5) {
      frameH = Math.atan2(cr.x - me.x, cr.z - me.z);
      this.faceCrystal = frameH;
    }
    this.resolver = {
      ground: (x, z) => stage.ground(x, z),
      subject: () => stage.subject(),
      frameH,
      npc: (id) => stage.npc(id),
      camp: (key) => stage.camp?.(key),
      crystal: () => stage.crystal?.(),
    };
  }

  /** warm: hold on black until the zone has caught up (cutscene-view's seek skips it) */
  start(warm = true): void {
    const sc = this.stage.scene;
    this.before = sc.activeCamera;
    const cam = new TargetCamera("cutscene_cam", Vector3.Zero(), sc);
    cam.minZ = 0.1;
    cam.maxZ = this.before?.maxZ ?? 4000;
    this.cam = cam;
    sc.activeCamera = cam;
    if (this.def.daytime !== undefined) pinCutsceneDaytime(this.def.daytime);
    const m = this.def.mark, s = this.stage.subject();
    if (m && (Math.hypot(s.x - m[0], s.z - m[1]) > 1 || Math.abs(wrap(s.h - m[2])) > 0.05)) this.stage.placeSubject(m[0], m[1], m[2]);
    else if (this.faceCrystal !== null) this.stage.placeSubject(s.x, s.z, this.faceCrystal);
    this.buildOverlay();
    document.body.classList.add("in-cutscene");
    if (this.opts.ownKeys) window.addEventListener("keydown", this.keyHandler, true);
    this.warmPoses = !warm ? [] : shotSpans(this.def).flatMap((s) => this.opts.warmLight ? [s.start + 0.01, s.end - 0.01] : [s.start + 0.01, (s.start + s.end) / 2, s.end - 0.01]);
    this.warmFrom = performance.now();
    if (warm) { this.place(); if (this.scoreZone()) hushForCutscene(); } else this.roll();
    this.paint();
  }

  private roll(): void {
    this.phase = "playing";
    this.t = 0;
    this.fireCues(-1, 0);
    this.place();
    // the score comes in with the picture, from its first bar
    if (this.scoreZone()) scoreCutscene(this.scoreZone()!);
    this.opts.onRoll?.();
  }

  private scoreZone(): string | null {
    const m = this.def.music ?? this.def.zone;
    // a scene that plays anywhere is scored by wherever it is playing
    if (m === "*") return this.stage.zone?.() ?? null;
    return m === "none" ? null : m;
  }

  // Any key or click in a scene is a gesture the browser accepts for sound. A
  // new character may reach their opening without having pressed anything in
  // the world (the scene takes the keyboard first), so the scene unlocks it
  // itself and the piece joins at the scene's own time.
  private gesture(): void {
    if (audioUnlocked()) return;
    unlockAudio();
    const z = this.scoreZone();
    if (z && this.phase === "playing") scoreCutscene(z, this.t);
    else if (z && this.phase === "warming") hushForCutscene(); // the unlock started the zone's piece
  }

  // What would show the zone is still arriving: anything new to draw, to
  // texture or to compile. _compiledEffects is Babylon's own cache of built
  // shaders (not public API; read defensively, the counts alone still work).
  private sceneSig(): string {
    const sc = this.stage.scene, eng = sc.getEngine() as unknown as { _compiledEffects?: Record<string, unknown> };
    let thin = 0;
    // a light warm-up does not wait for the meadow (grass.ts lays a cell a
    // frame around the camera): the intro flies too high and too fast for it
    for (const m of sc.meshes) if (!(this.opts.warmLight && m.name === "meadow")) thin += (m as unknown as { thinInstanceCount?: number }).thinInstanceCount || 0;
    return [sc.meshes.length, thin, sc.materials.length, sc.textures.length, sc.getWaitingItemsCount(),
      eng._compiledEffects ? Object.keys(eng._compiledEffects).length : 0].join(":");
  }

  private warmStep(): void {
    const now = performance.now();
    const visiting = Math.floor(this.warmFrame / (this.opts.warmLight ? 2 : WARM_FRAMES));
    this.warmFrame++;
    if (visiting < this.warmPoses.length) {
      this.t = this.warmPoses[visiting];
      this.place();
      this.t = 0;
      this.warmSigAt = now;
      return;
    }
    this.place();
    const sig = this.sceneSig();
    if (sig !== this.warmSig) { this.warmSig = sig; this.warmSigAt = now; }
    const quiet = now - this.warmSigAt >= (this.opts.warmQuietMs ?? WARM_QUIET_MS) && this.stage.scene.getWaitingItemsCount() === 0;
    if (quiet || now - this.warmFrom > WARM_MAX_MS) {
      this.isWarm = true;
      if (this.opts.rollWhen?.() ?? true) this.roll();
    }
  }

  private isWarm = false;
  /** The warm-up is done: the zone has settled and the first frame waits only on rollWhen. */
  get warmed(): boolean { return this.isWarm || this.phase !== "warming"; }

  /** Handed back and torn down. */
  get ended(): boolean { return this.phase === "done"; }

  /** Jump s seconds on, cues and all: an intro chapter that rolled late from
   *  its warm-up catches up with the music rather than drifting off its bars. */
  skipAhead(s: number): void {
    if (this.phase !== "playing" || !(s > 0)) return;
    const t0 = this.t;
    this.t = Math.min(this.total, this.t + s);
    this.fireCues(t0, this.t);
    this.place();
  }

  /** One frame. True once the scene has handed the world back. */
  update(dt: number): boolean {
    if (this.phase === "done") return true;
    if (this.phase === "warming") {
      this.phaseT += dt;
      this.warmStep();
    } else if (this.phase === "playing") {
      const t0 = this.t;
      this.t = Math.min(this.total, this.t + dt);
      this.fireCues(t0, this.t);
      this.stepActors(dt);
      this.place();
      if (this.t >= this.total) this.close(false);
    } else {
      this.phaseT += dt;
      if (this.phase === "closing") {
        this.stepActors(dt);
        if (this.phaseT >= HAND_BACK_FADE) this.handBack();
        if ((this.phase as string) === "rising" && !this.opts.riseIntoPlay) { this.finish(); return true; }
      } else if (this.phase === "rising" && this.phaseT >= HAND_BACK_RISE) {
        this.finish();
        return true;
      }
    }
    this.paint();
    return false;
  }

  /** End now, as the skip does: a short fade, then the hand-back. */
  skip(): void {
    if (this.phase !== "playing" && this.phase !== "warming") return;
    this.skipped = true;
    this.close(true);
  }

  // ---------- the scene's camera ----------
  private place(): void {
    if (!this.cam) return;
    const pose = cameraAt(this.def, this.t, this.resolver);
    this.lastPose = pose;
    this.cam.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    this.cam.setTarget(new Vector3(pose.look.x, pose.look.y, pose.look.z));
    this.cam.fov = pose.fov;
  }

  // ---------- the actors ----------
  private fireCues(t0: number, t1: number): void {
    for (const c of cuesCrossed(this.def, t0, t1)) this.cue(c, c.time);
  }

  private faceOf(face: string | number): number | null {
    const s = this.stage.subject();
    if (typeof face === "number") return face;
    if (face === "self") return null;
    const n = face.startsWith("npc:") ? this.stage.npc(face.slice(4)) : undefined;
    return n ? Math.atan2(n.x - s.x, n.z - s.z) : null;
  }

  private cue(c: Cue, time: number): void {
    const hold = (anim: string): Hold => ({ anim, until: c.for !== undefined ? time + c.for : Infinity });
    if (c.who === "self") {
      if (c.walk) {
        const s = this.stage.subject();
        const h = this.resolver.frameH, fwd = c.walk.fwd ?? 0, right = c.walk.right ?? 0;
        this.walk = { x: s.x + Math.sin(h) * fwd + Math.cos(h) * right, z: s.z + Math.cos(h) * fwd - Math.sin(h) * right, speed: c.speed ?? WALK_SPEED };
      }
      if (c.face !== undefined) this.selfFace = this.faceOf(c.face);
      if (c.anim) this.selfHold = c.anim === "idle" ? null : hold(c.anim);
      return;
    }
    const id = c.who.slice(4);
    if (c.face !== undefined) {
      const n = this.stage.npc(id), s = this.stage.subject();
      if (c.face === "self" && n) this.npcFace.set(id, Math.atan2(s.x - n.x, s.z - n.z));
      else if (typeof c.face === "number") this.npcFace.set(id, c.face);
      else if (n) {
        const other = this.stage.npc(c.face.slice(4));
        if (other) this.npcFace.set(id, Math.atan2(other.x - n.x, other.z - n.z));
      }
    }
    if (c.anim) {
      if (c.anim === "idle") { this.npcHold.delete(id); this.stage.npcAnim(id, null); }
      else this.npcHold.set(id, hold(c.anim));
    }
  }

  private stepActors(dt: number): void {
    const s = this.stage.subject();
    let anim = "idle", h = s.h, x = s.x, z = s.z;
    if (this.walk) {
      const dx = this.walk.x - s.x, dz = this.walk.z - s.z, d = Math.hypot(dx, dz), step = this.walk.speed * dt;
      if (d <= Math.max(step, 0.02)) { x = this.walk.x; z = this.walk.z; this.walk = null; }
      else { x += (dx / d) * step; z += (dz / d) * step; h = turnToward(h, Math.atan2(dx, dz), dt * 2); anim = "walk"; }
    } else if (this.selfFace !== null) {
      h = turnToward(h, this.selfFace, dt);
      if (h === this.selfFace) this.selfFace = null;
    }
    if (this.selfHold && this.t >= this.selfHold.until) this.selfHold = null;
    if (this.selfHold && !this.walk) anim = this.selfHold.anim;
    if (x !== s.x || z !== s.z || h !== s.h) this.stage.moveSubject(x, z, h);
    this.stage.subjectAnim(anim);
    for (const [id, want] of this.npcFace) {
      const n = this.stage.npc(id);
      if (n) this.stage.turnNpc(id, turnToward(n.h, want, dt));
    }
    for (const [id, hold] of this.npcHold) {
      if (this.t >= hold.until) { this.npcHold.delete(id); this.stage.npcAnim(id, null); }
      else this.stage.npcAnim(id, hold.anim);
    }
  }

  // ---------- the end ----------
  private close(fast: boolean): void {
    this.phase = "closing";
    this.phaseT = 0;
    // a last shot that already ends on black hands back at once
    this.closeFrom = fast ? this.blackNow() : fadeAt(this.def, this.total);
    if (this.closeFrom >= 0.999) this.handBack();
    if ((this.phase as string) === "rising" && !this.opts.riseIntoPlay) this.finish();
  }

  private blackNow(): number { return this.phase === "playing" ? fadeAt(this.def, this.t) : 1; } // warming is all black

  private handBack(): void {
    this.phase = "rising";
    this.phaseT = 0;
    this.walk = null;
    this.selfFace = null;
    this.selfHold = null;
    this.stage.subjectAnim("idle");
    for (const id of new Set([...this.npcFace.keys(), ...this.npcHold.keys()])) {
      this.stage.turnNpc(id, null);
      this.stage.npcAnim(id, null);
    }
    this.npcFace.clear();
    this.npcHold.clear();
    pinCutsceneDaytime(null);
    endCutsceneScore();
    const sc = this.stage.scene;
    if (this.before && !this.before.isDisposed()) sc.activeCamera = this.before;
    if (this.lastPose) this.stage.handBack(this.lastPose);
    this.cam?.dispose();
    this.cam = null;
  }

  private finish(): void {
    this.phase = "done";
    if (this.opts.ownKeys) window.removeEventListener("keydown", this.keyHandler, true);
    document.body.classList.remove("in-cutscene");
    this.root?.remove();
    this.root = null;
    this.done({ skipped: this.skipped });
  }

  /** Tear down at once, whatever the phase (the zone is going away under it). */
  abort(): void {
    if (this.phase === "done") return;
    if (this.phase !== "rising") this.handBack();
    this.finish();
  }

  // ---------- the frame's dressing ----------
  private buildOverlay(): void {
    const root = document.createElement("div");
    root.id = "cutscene";
    root.innerHTML = `<div class="cs-bar cs-top"></div>`
      + `<div class="cs-bar cs-bottom"><div class="cs-line"><div class="cs-who"></div><div class="cs-text"></div></div></div>`
      + `<div class="cs-title"><div class="cs-title-text"></div><div class="cs-title-sub"></div></div>`
      + `<div class="cs-fade"></div>`
      + `<div class="cs-skip"><span class="cs-skip-hint">Press Esc again to skip</span><button type="button" class="cs-skip-btn" tabindex="-1">Skip</button></div>`;
    document.body.appendChild(root);
    this.root = root;
    for (const k of ["cs-top", "cs-bottom", "cs-line", "cs-who", "cs-text", "cs-title", "cs-title-text", "cs-title-sub", "cs-fade", "cs-skip"]) {
      this.els[k] = root.querySelector(`.${k}`) as HTMLElement;
    }
    root.querySelector(".cs-skip-btn")!.addEventListener("click", () => this.skip());
    root.addEventListener("pointerdown", () => this.gesture());
  }

  private onKey(e: KeyboardEvent): void {
    // the scene owns the keyboard: nothing reaches the world's bindings
    e.stopPropagation();
    this.gesture();
    if (e.code !== "Escape" || e.repeat) { if (e.code === "Tab") e.preventDefault(); return; }
    e.preventDefault();
    const now = performance.now() / 1000;
    if (now < this.skipArmedUntil) { this.skip(); return; }
    this.skipArmedUntil = now + 2.5;
  }

  private paint(): void {
    if (!this.root) return;
    const e = this.els;
    let black: number, bars: number;
    if (this.phase === "warming") { black = 1; bars = barsAt(this.phaseT); }
    else if (this.phase === "playing") { black = fadeAt(this.def, this.t); bars = 1; }
    else if (this.phase === "closing") { black = this.closeFrom + (1 - this.closeFrom) * Math.min(1, this.phaseT / HAND_BACK_FADE); bars = 1; }
    else { const u = Math.min(1, this.phaseT / HAND_BACK_RISE); black = 1 - u; bars = 1 - u; }
    e["cs-fade"].style.opacity = black.toFixed(3);
    e["cs-top"].style.transform = `scaleY(${bars.toFixed(3)})`;
    e["cs-bottom"].style.transform = `scaleY(${bars.toFixed(3)})`;
    const line = this.phase === "playing" ? lineAt(this.def, this.t) : null;
    if ((line?.key ?? "") !== this.lineKey) {
      this.lineKey = line?.key ?? "";
      if (line) {
        const who = speakerName(line.line.who, this.stage.name, this.stage.npcs);
        e["cs-who"].textContent = who;
        e["cs-who"].hidden = !who;
        e["cs-line"].classList.toggle("narration", !line.line.who);
        e["cs-text"].innerHTML = lineHtml(line.line.text, this.stage.name);
      }
    }
    e["cs-line"].style.opacity = (line?.opacity ?? 0).toFixed(3);
    const title = this.phase === "playing" ? titleAt(this.def, this.t) : null;
    if (title) {
      if (e["cs-title-text"].textContent !== title.title.text) {
        e["cs-title-text"].textContent = title.title.text;
        e["cs-title-sub"].textContent = title.title.sub ?? "";
      }
    }
    e["cs-title"].style.opacity = (title?.opacity ?? 0).toFixed(3);
    const armed = performance.now() / 1000 < this.skipArmedUntil;
    e["cs-skip"].classList.toggle("armed", armed);
    e["cs-skip"].style.opacity = this.phase === "playing" && this.opts.ownKeys ? "" : "0";
  }
}
