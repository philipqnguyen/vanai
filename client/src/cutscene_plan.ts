// Cutscenes, the Babylon-free half: what a scene in shared/data/cutscenes/*.json
// says, read back as a timeline. cutscene.ts plays it; the node tests
// (test/cutscene_plan.test.mjs) and /?cutscene= read the same functions, so a
// shot that frames the wrong thing is caught where it is written.
//
// Philip's rulings (2026-10-11): a scene plays for the current player and that
// player is always its subject -- "self" in the data is whoever is watching,
// never the party member who set it off. Everyone else sees the watcher
// standing still, with a film icon over their head and on the party bar.
//
// A scene is a list of shots played end to end. Each shot:
//
//   dur      seconds on screen
//   cam      { from: {pos, look, fov?}, to?: {pos, look, fov?}, via?: point, ease? }
//            the camera moves from `from` to `to` over the shot (a straight
//            dolly, or a curve bent towards `via`); with no `to` it holds
//   fade     { in?: s, out?: s } to and from black at the shot's ends
//   title    { at, dur, text, sub? } the card in the middle of the frame
//   lines    [{ at, dur, who?, text }] subtitles; `who` is "npc:<id>", "self"
//            or absent for narration. `{name}` is the watcher's name and
//            **bold** is the ask, as in quest dialogue
//   cues     [{ at, who, ... }] what the actors do: `walk: {fwd, right?}`
//            (metres from where the actor stands, in the scene's frame) at
//            `speed`, `face: "self" | "npc:<id>" | radians`, `anim` held `for`
//            seconds (or until the next anim cue)
//
// A point is one of:
//   [x, up, z]                          absolute, `up` metres above the ground
//   { self: [right, up, fwd] }          from the watcher's feet, in the frame
//                                       they faced when the scene began
//   { npc: "<id>", off?: [right, up, fwd] }   from an NPC's feet, in their facing
//   { camp: "<monster>", off?: [...] }  from the middle of that monster's camp
//                                       (a dungeon's next hall), in the scene's frame
//   { crystal: true, off?: [...] }      from the crystal nearest the watcher (a
//                                       scene that plays anywhere), in the frame
//
// A scene with a `mark` puts the watcher on it first, so its absolute shots
// (a two-shot with a resident, say) frame them wherever they replay it from.
// Only a first viewing leaves them there: a replay hands them back where they
// started (world.ts endCutscene, Philip 2026-10-19).
//
// The frame is fixed at the start (the watcher's heading then), so a shot
// that follows a walking subject tracks their position without swinging round
// with every turn they make.

export interface Vec3 { x: number; y: number; z: number }
export interface Pose { x: number; y: number; z: number; h: number }

export type PointRef = [number, number, number] | { self: [number, number, number] } | { npc: string; off?: [number, number, number] }
  | { camp: string; off?: [number, number, number] } | { crystal: true; off?: [number, number, number] };
export interface CamKey { pos: PointRef; look: PointRef; fov?: number }
export interface Cam { from: CamKey; to?: CamKey; via?: PointRef; ease?: Ease }
export type Ease = "inout" | "linear" | "in" | "out";
export interface Line { at: number; dur: number; who?: string; text: string }
export interface Title { at: number; dur: number; text: string; sub?: string }
export interface Cue {
  at: number; who: string;
  walk?: { fwd?: number; right?: number }; speed?: number;
  face?: string | number;
  anim?: string; for?: number;
}
export interface Shot { dur: number; cam: Cam; fade?: { in?: number; out?: number }; title?: Title; lines?: Line[]; cues?: Cue[] }
export interface CutsceneDef {
  name: string; zone: string;
  trigger: { type: string; city?: string; quest?: string; object?: string; landmark?: string };
  party?: boolean; repeat?: boolean;
  /** the hour the scene is lit at (scene.ts dayFrac: 0 sunrise, .25 noon); absent rides the clock */
  daytime?: number;
  /** the zone whose field theme scores the scene from its first bar (score/);
   *  absent is the scene's own zone, "none" leaves whatever is playing */
  music?: string;
  /** [x, z, h]: where the watcher stands for the scene. Someone already there
   *  (a new character at their city's start) does not move; a replay from
   *  elsewhere in the zone is put on it under the opening black */
  mark?: [number, number, number];
  shots: Shot[];
}

// ---------- the intro: a scene in chapters ----------
// One zone is in memory at a time, so a scene that tours the world is told in
// chapters (cutscene-cinema.ts): each one a narration card on black, behind
// which its zone builds and warms, then its shots, with the card's words held
// over the first of them. The overture leads: a chapter's card comes in on its
// `bar` of the piece, its shots start `cardBars` later, and they run to the
// next chapter's bar -- so the shots' durations add up to the bars between
// (checked by cinemaProblems).
//
// Philip, 2026-10-12: "make the intro more exciting ... the flybys are really
// slow". So the black is only as long as a build needs (a bar, two for
// Heartwood), the narration rides over the pictures, and the shots are short
// and cut on the beat.
export interface Card {
  text: string; sub?: string;
  /** the big title type (VANAI) */
  title?: boolean;
  /** seconds the card's words stay over the picture once the shots roll (default CARD_HOLD) */
  hold?: number;
}
/** People in the streets while a chapter plays (the zone's own NPCs are not
 *  built for the intro): `n` townsfolk spread along a line, `w` metres either
 *  side of it, and with `walk` they walk its way at a stroll (some each way). */
export interface Crowd { from: [number, number]; to: [number, number]; n: number; w?: number; walk?: boolean }
/** A Border Gate opened `at` seconds into a chapter's shots (scene.ts
 *  setBorderGateOpen: its leaves go and its veil shows -- put it on a cut). */
export interface GateCue { at: number; open: string }
export interface Chapter {
  bar: number;
  cardBars: number;
  card: Card;
  /** absent: a card alone (the title at the end) */
  zone?: string;
  daytime?: number;
  shots?: Shot[];
  crowd?: Crowd[];
  gates?: GateCue[];
}
/** How long a card's words stay over the picture after the shots roll. */
export const CARD_HOLD = 3.2;
/** The most people the intro stands in one chapter (each is a production avatar). */
export const CROWD_MAX = 60;
export interface CinemaDef {
  name: string;
  trigger: { type: string };
  /** the overture's bars, in the piece's own bars: how long the last chapter runs */
  bars: number;
  chapters: Chapter[];
}

/** A chapter played as an ordinary scene in its zone, scored by the cinema. */
export function chapterScene(c: Chapter, name: string): CutsceneDef {
  return { name, zone: c.zone!, trigger: { type: "chapter" }, daytime: c.daytime, music: "none", shots: c.shots ?? [] };
}

/** Where each chapter's card and shots fall on the overture, in seconds. */
export function chapterTimes(def: CinemaDef, barSeconds: number): { card: number; shots: number; end: number }[] {
  return def.chapters.map((c, i) => ({
    card: c.bar * barSeconds,
    shots: (c.bar + c.cardBars) * barSeconds,
    end: (def.chapters[i + 1]?.bar ?? def.bars) * barSeconds,
  }));
}

export function cinemaProblems(id: string, def: CinemaDef, zones: Record<string, { npcs?: { id: string }[]; size?: number; portals?: { id: string; gate_quest?: string }[] }>, barSeconds: number): string[] {
  const out: string[] = [];
  const times = chapterTimes(def, barSeconds);
  def.chapters.forEach((c, i) => {
    const at = `${id} chapter ${i + 1}`;
    if (i && c.bar <= def.chapters[i - 1].bar) out.push(`${at}: bars must climb`);
    if (!c.card?.text) out.push(`${at}: every chapter opens on a card`);
    if (c.zone === undefined) { if (c.shots?.length) out.push(`${at}: shots need a zone`); return; }
    if (!zones[c.zone]) { out.push(`${at}: zone ${c.zone} does not exist`); return; }
    const sub = chapterScene(c, `${id}:${i + 1}`);
    out.push(...sceneProblems(`${at} (${c.zone})`, sub, zones[c.zone]));
    const want = times[i].end - times[i].shots, got = duration(sub);
    if (Math.abs(want - got) > 0.05) out.push(`${at}: shots run ${got.toFixed(2)}s, the music gives them ${want.toFixed(2)}s`);
    if (JSON.stringify(c.shots).includes('"self"')) out.push(`${at}: the intro has no watcher to point at`);
    if (JSON.stringify(c.shots).includes('"npc"')) out.push(`${at}: the intro builds no NPCs to point at`);
    const half = (zones[c.zone].size ?? 0) / 2;
    let people = 0;
    for (const g of c.crowd ?? []) {
      people += g.n;
      if (!(g.n > 0) || !Number.isInteger(g.n)) out.push(`${at}: a crowd's n is a whole number of people`);
      if (half && [...g.from, ...g.to].some((v) => Math.abs(v) > half)) out.push(`${at}: a crowd stands off the zone's plate`);
    }
    if (people > CROWD_MAX) out.push(`${at}: ${people} people in the crowd, at most ${CROWD_MAX}`);
    for (const g of c.gates ?? []) {
      const p = (zones[c.zone].portals ?? []).find((q) => q.id === g.open);
      if (!p?.gate_quest) out.push(`${at}: ${g.open} is not a gated portal in ${c.zone}`);
      if (g.at < 0 || g.at > got) out.push(`${at}: gate ${g.open} opens outside the shots`);
    }
  });
  return out;
}

/** Where things stand, asked of whoever plays the scene. */
export interface Resolver {
  ground(x: number, z: number): number;
  /** the watcher now */
  subject(): Pose;
  /** the heading the watcher faced when the scene began */
  frameH: number;
  npc(id: string): Pose | undefined;
  /** a monster's camp in this zone, on the ground */
  camp?(key: string): Pose | undefined;
  /** the crystal nearest the watcher */
  crystal?(): Pose | undefined;
}

export const DEFAULT_FOV = 0.8;
/** The anims an avatar knows (entities.ts animateAvatar). */
export const ANIMS = ["idle", "walk", "run", "rest", "emote:Cheer", "emote:Wave"];
export const WALK_SPEED = 1.5;
/** How long a scene's letterbox takes to close in and open out. */
export const BARS_S = 0.7;

// ---------- the frame ----------
// Heading h faces (sin h, cos h) on the ground (world.ts myH = atan2(dx, dz));
// right of it is (cos h, -sin h). Babylon is left-handed with +z north.
export function frameOffset(h: number, right: number, fwd: number): { x: number; z: number } {
  return { x: Math.sin(h) * fwd + Math.cos(h) * right, z: Math.cos(h) * fwd - Math.sin(h) * right };
}

export function resolvePoint(p: PointRef, r: Resolver): Vec3 {
  if (Array.isArray(p)) return { x: p[0], y: r.ground(p[0], p[2]) + p[1], z: p[2] };
  if ("self" in p) {
    const s = r.subject(), [right, up, fwd] = p.self, o = frameOffset(r.frameH, right, fwd);
    return { x: s.x + o.x, y: s.y + up, z: s.z + o.z };
  }
  if ("camp" in p || "crystal" in p) {
    const at = "camp" in p ? r.camp?.(p.camp) : r.crystal?.();
    if (!at) throw new Error(`cutscene: no ${"camp" in p ? `camp of ${p.camp}` : "crystal"} here`);
    const [right, up, fwd] = p.off ?? [0, 1.6, 0], o = frameOffset(r.frameH, right, fwd);
    return { x: at.x + o.x, y: at.y + up, z: at.z + o.z };
  }
  const n = r.npc(p.npc);
  if (!n) throw new Error(`cutscene: no NPC ${p.npc} in this zone`);
  const [right, up, fwd] = p.off ?? [0, 1.6, 0], o = frameOffset(n.h, right, fwd);
  return { x: n.x + o.x, y: n.y + up, z: n.z + o.z };
}

export function ease(kind: Ease | undefined, u: number): number {
  const t = Math.min(1, Math.max(0, u));
  switch (kind ?? "inout") {
    case "linear": return t;
    case "in": return t * t * t;
    case "out": return 1 - (1 - t) ** 3;
    default: return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) });
/** A quadratic curve from a to b bent towards via. */
export function bend(a: Vec3, via: Vec3, b: Vec3, u: number): Vec3 {
  return lerp3(lerp3(a, via, u), lerp3(via, b, u), u);
}

// ---------- the timeline ----------
export interface Span { start: number; end: number }
export function shotSpans(def: CutsceneDef): Span[] {
  let t = 0;
  return def.shots.map((s) => { const span = { start: t, end: t + s.dur }; t += s.dur; return span; });
}
export const duration = (def: CutsceneDef) => def.shots.reduce((t, s) => t + s.dur, 0);

/** The shot on screen at scene time t, and how far into it. Past the end, the last shot's last frame. */
export function shotAt(def: CutsceneDef, t: number): { index: number; local: number } {
  const spans = shotSpans(def);
  for (let i = 0; i < spans.length; i++) if (t < spans[i].end) return { index: i, local: Math.max(0, t - spans[i].start) };
  const last = def.shots.length - 1;
  return { index: last, local: def.shots[last].dur };
}

export interface CamPose { pos: Vec3; look: Vec3; fov: number }
export function cameraAt(def: CutsceneDef, t: number, r: Resolver): CamPose {
  const { index, local } = shotAt(def, t);
  const shot = def.shots[index], cam = shot.cam;
  const u = ease(cam.ease, local / shot.dur);
  const a = { pos: resolvePoint(cam.from.pos, r), look: resolvePoint(cam.from.look, r), fov: cam.from.fov ?? DEFAULT_FOV };
  if (!cam.to) return a;
  const b = { pos: resolvePoint(cam.to.pos, r), look: resolvePoint(cam.to.look, r), fov: cam.to.fov ?? cam.from.fov ?? DEFAULT_FOV };
  const pos = cam.via ? bend(a.pos, resolvePoint(cam.via, r), b.pos, u) : lerp3(a.pos, b.pos, u);
  return { pos, look: lerp3(a.look, b.look, u), fov: lerp(a.fov, b.fov, u) };
}

/** Black over the frame, 0 clear to 1 black, from the shots' fades. */
export function fadeAt(def: CutsceneDef, t: number): number {
  const { index, local } = shotAt(def, t);
  const shot = def.shots[index], f = shot.fade ?? {};
  let black = 0;
  if (f.in && local < f.in) black = Math.max(black, 1 - local / f.in);
  if (f.out && local > shot.dur - f.out) black = Math.max(black, 1 - (shot.dur - local) / f.out);
  return Math.min(1, Math.max(0, black));
}

/** How far the letterbox has closed in, 0 open to 1 closed. It opens again in the hand-back to play (cutscene.ts). */
export function barsAt(t: number): number {
  return Math.min(1, Math.max(0, t / BARS_S));
}

const FADE_TEXT = 0.35;
const opacityIn = (local: number, at: number, dur: number) =>
  Math.max(0, Math.min(1, (local - at) / FADE_TEXT, (at + dur - local) / FADE_TEXT));

/** The subtitle on screen at t (the latest one still running) and its opacity. */
export function lineAt(def: CutsceneDef, t: number): { line: Line; opacity: number; key: string } | null {
  const { index, local } = shotAt(def, t);
  const lines = def.shots[index].lines ?? [];
  let best: { line: Line; opacity: number; key: string } | null = null;
  lines.forEach((line, i) => {
    if (local >= line.at && local < line.at + line.dur) best = { line, opacity: opacityIn(local, line.at, line.dur), key: `${index}:${i}` };
  });
  return best;
}

export function titleAt(def: CutsceneDef, t: number): { title: Title; opacity: number } | null {
  const { index, local } = shotAt(def, t);
  const title = def.shots[index].title;
  if (!title || local < title.at || local >= title.at + title.dur) return null;
  return { title, opacity: Math.max(0, Math.min(1, (local - title.at) / 0.9, (title.at + title.dur - local) / 0.9)) };
}

/** Every cue whose moment falls in (t0, t1], in order, with its scene time. A cue at 0 fires at t0 = -1. */
export function cuesCrossed(def: CutsceneDef, t0: number, t1: number): (Cue & { time: number })[] {
  const spans = shotSpans(def), out: (Cue & { time: number })[] = [];
  def.shots.forEach((s, i) => (s.cues ?? []).forEach((c) => {
    const time = spans[i].start + c.at;
    if (time > t0 && time <= t1) out.push({ ...c, time });
  }));
  return out.sort((a, b) => a.time - b.time);
}

// ---------- words ----------
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A line as markup: the watcher's name in for {name}, **the ask** in bold, nothing else let through. */
export function lineHtml(text: string, name: string): string {
  return escapeHtml(text.replace(/\{name\}/g, name)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

/** Who is speaking, by the name the HUD would give them; "" for narration. */
export function speakerName(who: string | undefined, name: string, npcs: { id: string; name: string }[]): string {
  if (!who) return "";
  if (who === "self") return name;
  if (who.startsWith("npc:")) return npcs.find((n) => n.id === who.slice(4))?.name ?? "";
  return "";
}

// ---------- the check ----------
// Everything a scene names must exist where it is filmed. The data audit
// (tools/data/audit.py) checks the zone, trigger and quest; this checks the
// insides, which only the client reads.
export function sceneProblems(id: string, def: CutsceneDef, zone: { npcs?: { id: string }[]; camps?: { monster: string }[]; milestones?: unknown[] } | undefined): string[] {
  const out: string[] = [];
  // a scene that plays anywhere (zone "*") may point only at the watcher and the nearest crystal
  const anywhere = def.zone === "*";
  if (!zone && !anywhere) return [`${id}: zone ${def.zone} does not exist`];
  const here = zone ?? {};
  const npcIds = new Set((here.npcs ?? []).map((n) => n.id));
  const camps = new Set((here.camps ?? []).map((c) => c.monster));
  const checkWho = (where: string, who: string | undefined) => {
    if (who === undefined || who === "self") return;
    if (!who.startsWith("npc:") || !npcIds.has(who.slice(4))) out.push(`${where}: ${who} is not self or an NPC in ${def.zone}`);
  };
  const checkPoint = (where: string, p: PointRef | undefined) => {
    if (!p) return;
    if (Array.isArray(p)) {
      if (p.length !== 3 || !p.every(Number.isFinite)) out.push(`${where}: a point is [x, up, z]`);
      else if (anywhere) out.push(`${where}: a scene that plays anywhere has no fixed places to point at`);
      return;
    }
    if ("self" in p) { if (p.self.length !== 3 || !p.self.every(Number.isFinite)) out.push(`${where}: self is [right, up, fwd]`); return; }
    if ("crystal" in p) { if (!anywhere && !(here.milestones ?? []).length) out.push(`${where}: ${def.zone} has no crystal`); return; }
    if (anywhere) { out.push(`${where}: a scene that plays anywhere points only at the watcher and the crystal`); return; }
    if ("camp" in p) { if (!camps.has(p.camp)) out.push(`${where}: no camp of ${p.camp} in ${def.zone}`); return; }
    if (!npcIds.has(p.npc)) out.push(`${where}: no NPC ${p.npc} in ${def.zone}`);
  };
  if (!def.shots?.length) out.push(`${id}: no shots`);
  if (def.mark && (def.mark.length !== 3 || !def.mark.every(Number.isFinite))) out.push(`${id}: mark is [x, z, h]`);
  if (def.music !== undefined && def.music !== "none" && typeof def.music !== "string") out.push(`${id}: music is a zone key or "none"`);
  (def.shots ?? []).forEach((s, i) => {
    const at = `${id} shot ${i + 1}`;
    if (!(s.dur > 0)) out.push(`${at}: dur must be positive`);
    if (!s.cam?.from) { out.push(`${at}: no camera`); return; }
    checkPoint(`${at} from.pos`, s.cam.from.pos); checkPoint(`${at} from.look`, s.cam.from.look);
    checkPoint(`${at} to.pos`, s.cam.to?.pos); checkPoint(`${at} to.look`, s.cam.to?.look); checkPoint(`${at} via`, s.cam.via);
    const fades = (s.fade?.in ?? 0) + (s.fade?.out ?? 0);
    if (fades > s.dur) out.push(`${at}: its fades are longer than the shot`);
    if (s.title && s.title.at + s.title.dur > s.dur + 1e-6) out.push(`${at}: the title runs past the shot`);
    (s.lines ?? []).forEach((l, j) => {
      checkWho(`${at} line ${j + 1}`, l.who);
      if (l.at < 0 || l.at + l.dur > s.dur + 1e-6) out.push(`${at} line ${j + 1}: runs past the shot`);
      // a reader's pace: ~15 characters a second, and never under two seconds
      const need = Math.max(2, l.text.length / 15);
      if (l.dur < need) out.push(`${at} line ${j + 1}: ${l.dur}s is too short to read ${l.text.length} characters (${need.toFixed(1)}s)`);
    });
    (s.cues ?? []).forEach((c, j) => {
      checkWho(`${at} cue ${j + 1}`, c.who);
      if (c.at < 0 || c.at > s.dur) out.push(`${at} cue ${j + 1}: outside the shot`);
      if (c.anim !== undefined && !ANIMS.includes(c.anim)) out.push(`${at} cue ${j + 1}: anim ${c.anim} is not one of ${ANIMS.join(", ")}`);
      if (typeof c.face === "string" && c.face !== "self") checkWho(`${at} cue ${j + 1} face`, c.face);
      if (c.walk && c.who !== "self") out.push(`${at} cue ${j + 1}: only the watcher walks (NPCs keep their marks)`);
    });
  });
  return out;
}
