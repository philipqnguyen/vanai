import {clearFerryHud,updateFerryStatus} from './ferry-hud';
import { loadingScreen } from "./loading-screen";
import {equipmentInfo} from './gear/equipment';
import {mappedRace} from './appearance';
import {nymChoice} from "./appearance";
import {onInteractionFloor} from './interaction_height';
import { attachFollowCamera } from "./follow_camera";
import { arrivalHeading, arrivalBeta, alphaFor, portalLandings } from "./arrival";
import { ArcRotateCamera, Vector3, PointerEventTypes } from "@babylonjs/core";
import { engine, scene, buildZone, onGpuReset, openQuestDoor, setBorderGateOpen, groundHeight, entryHeight, standHeight, debugHit, worldObjects, setMilestoneLit, resolveCollision, updateCarpet } from "./scene";
import { placeNpcAvatar, buildNpcAvatar, buildAvatar, addHitCapsule, disposeAvatar, npcStandY, raceHeight, animateAvatar, animateMonster, flashAttack, flashCast, flashMonsterHit, buildMonsterMesh, monsterDeathAndDispose, type AvatarNode, type MonsterNode, type Look } from "./entities";
import { Track, INTERP_DELAY, noteServerClock, serverNow, tickServerClock } from "./interp";
import { actorDrawn, npcPresent, handOffActor, setActorShown, whenActorSettled } from "./actor-reveal";
import { DetailStreamer, type StreamCandidate } from "./actor_stream_plan";
import { npcPresentation } from "./npc-appearance";
import { JumpArc } from "./jump";
import {QuaterniusJumpArc} from "./quaternius-jump";
import {quaterniusPlaybackInfo} from "./quaternius-gameplay";
const makeGameplayJump=(race=state.self?.race)=> mappedRace(race)?new QuaterniusJumpArc():new JumpArc();
import { state } from "./state";
import { connectZone, send } from "./net";
import { ZONES, ITEMS, ABILITIES, CUTSCENES, MONSTERS } from "./data";
import { CutscenePlayer, campPose, nearestCrystal, type CutsceneStage } from "./cutscene";
import { PortalTouchLatch, touchingVeil } from "./portal_touch";
import { toggleFullscreen } from "./fullscreen";
import { sfx, unlockAudio, startZoneAudio, updatePlaceAudio, setEngaged } from "./audio";
import { combatHold } from "./weapon_sheath_plan";
import { fxEvent, fxPrewarm, fxClear, bodyHeight, handsOf, type FxWorld } from "./spell-fx";
import type { HudApi } from "./hud";
import { interactVerb } from "./hud_model";
import { showTravelMenu, openPlayerMenu, openPlayerMenuAtEntity, closePlayerMenu } from "./hud";
import { setPosProvider } from "./map";
import { showTargetMarker, hideTargetMarker, showObjectiveMarkers, hideObjectiveMarkers } from "./marker";
import { activeQuestDestinations, interactableWanted, isMainQuest, portalVisible, storyGiverDest, storyStep, zoneLabel } from "./quest_index";
import { handleCourtMessage, setCourtCombat, isCourtStationId } from "./court-hud";
import { handleMailMessage } from "./mail-hud";
import {
  nextTarget, npcTargetId, objTargetId, parseTargetId, targetsInView,
  type TargetCandidate, type TargetKind,
} from "./targeting";

let hud: HudApi;
let camera: ArcRotateCamera;
let myAvatar: AvatarNode | null = null;
const avatars = new Map<string, AvatarNode>();
const monsterNodes = new Map<string, MonsterNode>();
const npcAvatars = new Map<string, AvatarNode>();
// Only the nearest DETAIL_CAP characters -- residents and other players, never
// your own -- are built in full; everyone else is a nameplate at their spot
// (actor_stream_plan.ts, Philip 2026-10-13). `avatars` and `npcAvatars` hold
// only the drawn ones, so every reader that skips a missing body keeps working;
// streamer ids are "npc_<id>" for a resident and the server's "p…" for a player.
const streamer = new DetailStreamer<AvatarNode>({
  build: (id) => id.startsWith("npc_") ? buildResident(id.slice(4)) : buildStreamedPlayer(id),
  show(id, av) { setActorShown(av, true); liveMap(id).set(liveKey(id), av); },
  hide(id, av) {
    setActorShown(av, false);
    if (liveMap(id).get(liveKey(id)) === av) liveMap(id).delete(liveKey(id));
    knownHeight.set(id, av.raceH);
  },
  dispose(id, av) {
    if (liveMap(id).get(liveKey(id)) === av) liveMap(id).delete(liveKey(id));
    if (av.model) knownHeight.set(id, av.raceH);
    disposeAvatar(av);
  },
});
const liveMap = (id: string) => id.startsWith("npc_") ? npcAvatars : avatars;
const liveKey = (id: string) => id.startsWith("npc_") ? id.slice(4) : id;
// A body's own measured height, kept when it is let go, so its nameplate does
// not drop to the race's nominal height when the body is unloaded.
const knownHeight = new Map<string, number>();
// Where each resident stands (placeNpcAvatar's feet) and the race they wear: a
// resident never moves, so this is worked out once a zone.
const npcSpots = new Map<string, { y: number; race: string }>();
function npcSpot(n: any): { y: number; race: string } {
  let spot = npcSpots.get(n.id);
  if (!spot) { spot = { y: npcStandY(n), race: npcPresentation(n, n.kind).race }; npcSpots.set(n.id, spot); }
  return spot;
}
// The streamer weighs who is nearest a few times a second, not every frame: its
// hold is in seconds, and a sort of every character each frame buys nothing.
const STREAM_EVERY_S = 0.25;
let streamAt = -Infinity;
// Combat events name abilities, not ids; the mob-effect tracker needs the
// stun and sleep durations, which only the ability data holds.
const abilityByName = new Map<string, any>(Object.values(ABILITIES).map((a: any) => [a.name, a]));

const keys: Record<string, boolean> = {};
let myX = 0, myZ = 0, myH = 0, myAnim = "idle";
// The height the character is standing at. Tracked, not derived: a floor above
// the ground is only findable from where the feet were last frame (see
// groundHeight's prevY), so this is the one piece of position the server does
// not hold. Remote entities keep theirs in `levelY`, keyed by id.
let myY = 0;
const levelY = new Map<string, number>();
function heightFor(id: string, x: number, z: number): number {
  // first seen: no height a frame ago, so the floor a body arriving there fits
  // on (scene.ts entryHeight) -- groundHeight alone drew a player first seen on
  // a wall walk inside the curtain under it until they came down a stair
  const prev = levelY.get(id);
  const y = prev === undefined ? entryHeight(x, z) : groundHeight(x, z, prev);
  levelY.set(id, y);
  return y;
}
// Walk the local player toward (tx, tz) in steps of at most MOVE_SUBSTEP,
// taking the level after each. A stair body is solid more than 0.28 m above the
// level the move starts from (scene.ts stairBodyHit), and a flight rises 0.91 m
// a metre, so a frame's whole move at once (8 m/s) made the next tread a wall
// on any frame over ~38 ms: under ~26 fps no stair could be climbed at all
// (Philip 2026-10-12, every Moonmere stair). The QA walkers step 0.1 m too.
const MOVE_SUBSTEP = 0.1;
function walkSelf(tx: number, tz: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(tx - myX, tz - myZ) / MOVE_SUBSTEP));
  const sx = (tx - myX) / n, sz = (tz - myZ) / n;
  for (let i = 0; i < n; i++) {
    const [rx, rz] = resolveCollision(myX, myZ, myX + sx, myZ + sz, myY);
    const stuck = rx === myX && rz === myZ;
    myX = rx; myZ = rz;
    myY = groundHeight(myX, myZ, myY);
    if (stuck) break;
  }
}
let lastSent = { x: 0, z: 0, h: 0, anim: "" };
// THE HEIGHT THIS BROWSER LAST STOOD AT, per character: the server keeps x and z
// only, so a refresh or a login on an upper floor asked entryHeight to guess the
// floor. Remembered with the zone and the x, z it belongs to (localStorage,
// once a second at most), it is entryHeight's hint when the entry is that spot.
const HEIGHT_KEY = () => `vanai.height.${state.self?.charId ?? "?"}`;
let lastHeightSave = 0;
function rememberHeight(now: number): void {
  if (now - lastHeightSave < 1) return;
  lastHeightSave = now;
  try { localStorage.setItem(HEIGHT_KEY(), JSON.stringify({ zone: state.zone, x: myX, z: myZ, y: myY })); } catch { /* private window: no memory */ }
}
function rememberedHeight(zone: string, x: number, z: number): number | undefined {
  try {
    const r = JSON.parse(localStorage.getItem(HEIGHT_KEY()) ?? "null");
    if (r && r.zone === zone && Math.hypot(r.x - x, r.z - z) < 0.75 && Number.isFinite(r.y)) return r.y;
  } catch { /* none */ }
  return undefined;
}
let lastMoveSend = 0;
let lastDiscoverCheck = 0;
let attacking = false;
let zoneReady = false;
// Zone entry keeps the loading veil up past the snapshot until the local
// avatar is revealed (actor-reveal.ts), so the player never watches their own
// body arrive in pieces -- but never longer than SELF_VEIL_MAX_MS after the
// avatar was built. Past that the world shows and the avatar appears when it
// is ready (or at actor-reveal's own hard fallback).
const SELF_VEIL_MAX_MS = 15000;
const NPC_WAIT_MAX_MS = SELF_VEIL_MAX_MS;
let veilHeld = false, veilUntil = 0;
let stepTimer = 0;
let selfJump = makeGameplayJump(); // our own hop: local clock, no round trip
let emoteUntil = 0;
let emoteAnim = "";
let autorun = false;       // R runs forward until you stop it (W/S, chat, death, a zone line)
window.addEventListener("vanai-emote", ((e: CustomEvent) => {
  const name = { cheer: "Cheer", wave: "Wave" }[e.detail as string] || "Cheer";
  emoteAnim = `emote:${name}`;
  emoteUntil = performance.now() / 1000 + 2.4;
}) as EventListener);
// "/r" and "/rest" in the composer reach the world through the same door as emotes
window.addEventListener("vanai-rest", (() => rest_toggle()) as EventListener);
const aggroSeen = new Set<string>();

// ---------- cutscenes ----------
// The scene playing (cutscene.ts), the ones waiting their turn, and what the
// scene asks of the actors this frame. The server says which scene is owed
// ({t:"cutscene"}); it starts here once the zone, your avatar and the scene's
// NPCs are all drawn and nothing is fighting you, and the world is told when
// it begins and ends so everyone else sees you still, under a film icon.
let cutscene: CutscenePlayer | null = null;
let cutsceneId = "";
const cutsceneQueue: string[] = [];
let cutsceneRetryAt = 0;
let cutsceneAnim = "idle";
const npcAnimOverride = new Map<string, string>();
// the zone whose residents are built, and when: a scene that names an NPC
// waits for them to be drawn, but not forever
let npcsBuiltFor = "";
let npcsBuiltAt = 0;
const CUTSCENE_NPC_WAIT_MS = 8000;
const CUTSCENE_RETRY_S = 5;
export function inCutscene(): boolean { return !!cutscene; }
// a scene filmed here, or one that plays anywhere (zone "*": the first crystal)
const playsHere = (id: string) => { const z = CUTSCENES[id]?.zone; return z === state.zone || z === "*"; };
window.addEventListener("vanai-cutscene", ((e: CustomEvent) => cutsceneCommand(String(e.detail || ""))) as EventListener);

export function setHud(h: HudApi): void { hud = h; }
setPosProvider(() => ({ x: myX, z: myZ, h: myH }));

// The zone build is one long synchronous task, so a loading screen raised in
// the same task is never painted: the player used to watch the old zone freeze
// for the whole build instead. Raise it, let two frames go by so it is on
// screen, then build. A newer entry arriving during that wait supersedes this
// one; the old zone stays as it was behind the overlay until then. A hidden
// tab gets no animation frames, so the wait is capped rather than open-ended.
let entryGeneration = 0;
const nextFrame = () => new Promise<void>((done) => { requestAnimationFrame(() => done()); setTimeout(done, 100); });
export async function enterZone(zoneKey: string, x: number, z: number): Promise<void> {
  const generation = ++entryGeneration;
  // a scene is filmed in its zone: crossing out of it ends it unseen, and the
  // server sends it again on the next join while it is still owed
  if (cutscene) { cutscene.abort(); cutscene = null; cutsceneId = ""; cutsceneFrom = null; }
  cutsceneQueue.length = 0;
  npcAnimOverride.clear();
  npcsBuiltFor = "";
  zoneReady = false;
  veilHeld = false;
  portalTouch.reset();
  autorun = false;
  // the world ends auto-attack on every crossing (a new PlayerState) and says nothing
  attacking = false;
  selfJump.cancel();
  restingLocal = false;
  hud.showLoading(true, ZONES[zoneKey]?.name || zoneKey);
  hud.closeWindows();
  // The old subscription stays open until connectZone replaces it: the world
  // goes on speaking to the character after a zone_change (the crystal's fare,
  // "carries you home"), and with no subscription those lines were lost. Only
  // what it says of the zone being left is let go meanwhile (ZONE_PICTURE).
  crossing = true;
  await nextFrame(); await nextFrame();
  if (generation !== entryGeneration) return;
  clearFerryHud();
  state.zone = zoneKey;
  state.players.clear();
  state.monsters.clear();
  // monster ids are per zone and can come back in the next one
  state.casts.clear();
  state.mobEffects.clear();
  state.targetId = null;
  hud.updateTarget(); // or the old target's frame stays up, frozen
  // the party frame is the world's to fill: join sends it again for a member,
  // and a party that broke up during the crossing told a line nobody held
  state.party = [];
  hud.updateParty();
  avatars.clear();
  monsterNodes.clear();
  npcAvatars.clear();
  // the old scene took every body with it, cached ones included
  streamer.reset();
  knownHeight.clear();
  npcSpots.clear();
  hud.clearPlates();

  buildZone(zoneKey);
  loadingScreen().step(0.62, "Lighting the lamps");
  fxPrewarm();
  restoreQuestDoors();
  startZoneAudio(zoneKey);
  myX = x; myZ = z;
  myY = entryHeight(x, z, rememberedHeight(zoneKey, x, z));
  levelY.clear();
  // Dev handle, same spirit as zoneview's __zv: where the character is standing
  // (x, y, z -- the y is the one piece the server does not know) and a way to
  // put it somewhere, for walking a stair from a script without a hand on WASD.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__vanai = {
      pos: () => ({ x: myX, y: myY, z: myZ }),
      // the server walks a jump no run could make at the speed limit
      // (server move_check.rb), so the dev server is told to put them there
      go: (gx: number, gz: number) => { myX = gx; myZ = gz; myY = entryHeight(gx, gz); send("chat", { channel: "say", msg: `/warp ${gx} ${gz}` }); },
      // the journal and the rest of the client's view of the world, so a QA
      // script can stage a quest (state.quests.set(key, {status: 1, progress: 0}))
      // and look at what the objective markers do without playing up to it
      state,
      cam: () => camera,
      avatar: () => myAvatar,
      equipment: () => myAvatar ? equipmentInfo(myAvatar) : undefined,
      motion: () => myAvatar ? quaterniusPlaybackInfo(myAvatar) : undefined,
      remotes: () => avatars,
      hit: (hx: number, hz: number, hy: number) => debugHit(hx, hz, hy),
    };
  }
  const self = state.self!;
  selfJump = makeGameplayJump();
  loadingScreen().step(0.7, `Dressing ${self.name}`);
  myAvatar = buildAvatar("me", self.race, self.job, false, selfLook(), undefined, self.appearance);
  builtFrom.set(myAvatar, lookKey(self.race, self.job, selfLook(), self.appearance));
  veilUntil = performance.now() + SELF_VEIL_MAX_MS;
  positionNode(myAvatar, myX, myZ, myY);

  // A zone's start, spawn, a crystal's landing or a portal's landing says which
  // way an arrival faces and how the camera looks (arrival.ts): a crystal or a
  // portal that names no heading faces the zone's centre, never back out at the
  // edge just crossed. Every other entry keeps the camera looking north.
  const arrival = { start: ZONES[zoneKey]?.start, spawn: ZONES[zoneKey]?.spawn, milestones: ZONES[zoneKey]?.milestones, landings: portalLandings(ZONES as any, zoneKey) };
  const facing = arrivalHeading(arrival, x, z);
  if (facing !== undefined) myH = facing;
  camera = new ArcRotateCamera("cam", alphaFor(facing ?? 0), arrivalBeta(arrival, x, z), 14, new Vector3(myX, myY + 2, myZ), scene);
  camera.upperRadiusLimit = 30;
  camera.lowerBetaLimit = 0.4;
  camera.upperBetaLimit = 2.5; // past pi/2, so the player can look well up at the sky
  camera.attachControl(engine.getRenderingCanvas(), true);
  camera.panningSensibility = 0;
  camera.wheelDeltaPercentage = 0.02;
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput"); // arrows handled in tickMovement
  attachFollowCamera(camera, () => ({ x: myX, y: myY, z: myZ, heading: myH, targetHeight:nymChoice(state.self!.race,state.self!.appearance) ? .85 : state.self!.race==='karrog'?1.35:(state.self!.race==='aedri'||state.self!.race==='rasha'||state.self!.race==='valdren')?1.15:undefined }), show => { if (myAvatar) setActorShown(myAvatar, show); });

  // Residents load after your own avatar is dressed (or once the veil's cap
  // has passed). Everything dresses on the one main thread: built together,
  // Moonmere's 40 residents held a fresh character back to 22 s behind the
  // veil, against ~12 s dressed first (headless, MEASURED 2026-10-02). Each
  // resident still appears only when dressed and posed (actor-reveal.ts).
  let npcsBuilt = false;
  const residents = () => {
    if (npcsBuilt || generation !== entryGeneration || state.zone !== zoneKey) return;
    npcsBuilt = true;
    buildNpcs(zoneKey);
  };
  whenActorSettled(myAvatar, residents);
  setTimeout(residents, NPC_WAIT_MAX_MS);
  setupPointer();

  // The snapshot arrives via join. ActionCable confirms again each time it
  // re-subscribes after a dropped line, and the world joins you afresh then.
  crossing = false;
  let confirmed = false;
  connectZone(onMessage, () => { if (confirmed) rejoined(); confirmed = true; });
  hud.setZoneName(ZONES[zoneKey]?.name || zoneKey);
}

// What a dropped line kept from the client: the world left you (leave) and
// joined you again, and what it said in between went nowhere. The join sends
// the zone, yourself, the journal and your party (empty when it is gone) again,
// so the party frame is left for it: cleared here, it could wipe a roster that
// landed before this confirmation. The trade the leave cancelled is simply
// gone. A gate vote outlives the drop on the world's side, so its card stays
// to be answered (its own timer ends it). A scene still playing is told again,
// or the world's new PlayerState never knows it began.
function rejoined(): void {
  hud.renderTrade({ closed: true });
  if (cutscene && cutsceneId) send("cutscene_begin", { id: cutsceneId });
}

// What the world says of the zone itself (its stream, gated to the zone you
// are in): while a crossing builds the next zone, none of it is about the one
// you are entering.
let crossing = false;
const ZONE_PICTURE = new Set(["snapshot", "player_join", "player_update", "player_leave", "monster_spawn", "pos", "combat"]);

function restoreQuestDoors():void {
  for(const it of ZONES[state.zone].interactables??[]){
    if(!it.open_quest)continue;
    const progress=state.quests.get(it.open_quest);
    if(progress&&(progress.status===2||progress.progress>=1))openQuestDoor(it.id);
  }
  restoreGatedPortals();
}

// A main chapter handed in: say where the story goes next, once, as the
// tracker and the Journal go on saying it (hud.ts storyNext).
function storyContinues(): void {
  const step = storyStep();
  if (!step || step.state === "active") return;
  const g = storyGiverDest(step.key);
  if (!g) return;
  const where = g.zone === state.zone ? "" : ` in ${zoneLabel(g.zone).replace(/^The /, "the ")}`;
  const text = step.state === "level"
    ? `The story continues at level ${step.opensAt}: ${g.label.replace(/^Speak/, "speak")}${where}.`
    : `The story continues: ${g.label.replace(/^Speak/, "speak")}${where}.`;
  hud.toast(text, "");
  hud.addChat("system", "", text);
}

// A gated portal's glow is in the scene for everyone (the zone is built once)
// but enabled only for a character whose journal opens it; touchable() keeps
// it out of Tab, clicks and E, and the maps ask the same rule. Runs wherever
// the doors do: after the build and on every journal message, so handing in
// the gate's quest shows it without a zone reload. A Border Gate's leaves
// and colliders follow the same rule (scene.ts setBorderGateOpen; a portal
// without a switching gate ignores it): shut with no veil, open with one.
function restoreGatedPortals(): void {
  const defs = (ZONES[state.zone]?.portals as any[]) || [];
  for (const o of worldObjects) {
    if (o.kind !== "portal" || !o.mesh) continue;
    const p = defs.find((d: any) => d.id === o.id);
    if (p?.gate_quest) o.mesh.setEnabled(portalVisible(p));
  }
  for (const p of defs) if (p.gate_quest) setBorderGateOpen(p.id, portalVisible(p));
}

// The residents join the stream: the nearest are built now, the rest stand as
// nameplates until you come near.
function buildNpcs(zoneKey: string): void {
  npcsBuiltFor = zoneKey;
  npcsBuiltAt = performance.now();
  tickStream(performance.now() / 1000, true);
}

function buildResident(id: string): AvatarNode | null {
  const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === id);
  if (!npc) return null;
  const av = buildNpcAvatar(npc);
  placeNpcAvatar(av, npc);
  return av;
}

function buildStreamedPlayer(id: string): AvatarNode | null {
  const rp = state.players.get(id);
  if (!rp) return null;
  const av = buildRemoteAvatar(rp);
  if (av) { positionNode(av, rp.x, rp.z, heightFor(id, rp.x, rp.z)); av.root.rotation.y = rp.h ?? 0; }
  return av;
}

function tickStream(now: number, force = false): void {
  if (!state.self || (!force && now - streamAt < STREAM_EVERY_S)) return;
  streamAt = now;
  const cast = new Set(cutsceneCast());
  const list: StreamCandidate[] = [];
  if (npcsBuiltFor === state.zone) for (const n of (ZONES[state.zone].npcs || []) as any[]) {
    list.push({ id: `npc_${n.id}`, x: n.x, z: n.z, y: npcSpot(n).y, pinned: cast.has(n.id) });
  }
  state.players.forEach((rp) => list.push({ id: rp.id, x: rp.x, z: rp.z, y: levelY.get(rp.id) }));
  streamer.update(myX, myZ, list, now, myY);
}

// Where a character with no body drawn wears its nameplate: over the feet the
// body would stand on, at its height. Null: not in the world (yet).
function bodilessPlate(id: string): Vector3 | null {
  if (id.startsWith("npc_")) {
    if (npcsBuiltFor !== state.zone) return null;
    const n = (ZONES[state.zone].npcs || []).find((o: any) => o.id === id.slice(4));
    if (!n) return null;
    const spot = npcSpot(n);
    return new Vector3(n.x, spot.y + (knownHeight.get(id) ?? raceHeight(spot.race)) + 0.5, n.z);
  }
  const rp = state.players.get(id);
  if (!rp) return null;
  const y = standHeight(rp.x, rp.z, levelY.get(id) ?? groundHeight(rp.x, rp.z));
  return new Vector3(rp.x, y + (knownHeight.get(id) ?? raceHeight(rp.race)) + 0.5, rp.z);
}

// A resident can be found and spoken to: drawn (or its look failed for good,
// actor-reveal.ts npcPresent), or standing as a nameplate beyond the nearest
// DETAIL_CAP. One still being dressed is not on offer yet, as before.
function npcHere(id: string): boolean {
  const av = npcAvatars.get(id);
  if (av) return npcPresent(av);
  return npcsBuiltFor === state.zone && !streamer.full(`npc_${id}`);
}

export function selfLook(): Look {
  const look: Look = {};
  state.inventory.forEach((row: any) => {
    if (!row.equipped_slot) return;
    if (row.equipped_slot === "weapon") look.w = row.item_key;
    if (row.equipped_slot === "body") look.b = row.item_key;
    if (row.equipped_slot === "head") look.h = row.item_key;
    if (row.equipped_slot === "legs") look.l = row.item_key;
    if (row.equipped_slot === "feet") look.f = row.item_key;
  });
  return look;
}

// What an avatar was built from. A player_update that changes none of it (a
// level, a title, the snapshot's copy of yourself) keeps the avatar as it is
// rather than rebuilding one that would have to load and pose all over again.
const builtFrom = new WeakMap<AvatarNode, string>();
const lookKey = (race: string, job: string, look: Look, appearance: unknown) => JSON.stringify([race, job, look, appearance ?? null]);

export function rebuildSelfAvatar(): void {
  if (!myAvatar) return;
  const key = lookKey(state.self!.race, state.self!.job, selfLook(), state.self!.appearance);
  if (builtFrom.get(myAvatar) === key) return;
  const rot = myAvatar.root.rotation.y;
  const old = myAvatar;
  myAvatar = buildAvatar("me", state.self!.race, state.self!.job, false, selfLook(), undefined, state.self!.appearance);
  builtFrom.set(myAvatar, key);
  // the old look stays drawn until the new one is dressed and posed
  handOffActor(old, myAvatar, disposeAvatar);
  positionNode(myAvatar, myX, myZ, myY);
  myAvatar.root.rotation.y = rot;
}

function positionNode(av: AvatarNode, x: number, z: number, level = groundHeight(x, z)): void {
  av.root.position.set(x, standHeight(x, z, level), z);
}

// ---------- networking ----------
function onMessage(msg: any): void {
  if (crossing && ZONE_PICTURE.has(msg.t)) return;
  switch (msg.t) {
    case "snapshot": {
      // A rejoin after a dropped line can find you elsewhere: a zone_change
      // the line swallowed (a portal, a crystal, a gate, the ferry). Build the
      // zone the world has you in; its join sends the snapshot again.
      const meId = `p${state.self!.charId}`;
      if (msg.zone && msg.zone !== state.zone && ZONES[msg.zone]) {
        const me = (msg.players || []).find((p: any) => p.id === meId);
        void enterZone(msg.zone, me?.x ?? myX, me?.z ?? myZ);
        break;
      }
      zoneReady = true;
      loadingScreen().step(0.86, "Meeting the locals");
      // the veil stays up until your own avatar is dressed and posed
      // (tickMovement lifts it), capped so a slow load never holds the zone
      veilHeld = true;
      state.milestones = msg.milestones || {};
      Object.entries(state.milestones).forEach(([id, lit]) => setMilestoneLit(id, !!lit));
      // The snapshot is the whole zone: after a dropped line, whoever left and
      // whatever died meanwhile (their player_leave and mdie went to the dead
      // line) are not in it, and go.
      const players = new Set((msg.players || []).map((p: any) => p.id));
      for (const id of [...state.players.keys()]) if (!players.has(id)) dropPlayer(id);
      const monsters = new Set((msg.monsters || []).map((m: any) => m.id));
      for (const id of [...state.monsters.keys()]) if (!monsters.has(id)) removeMonster(id);
      msg.players.forEach((p: any) => upsertPlayer(p));
      msg.monsters.forEach((m: any) => upsertMonster(m));
      // and every timeline starts again from here: a restarted world's clock
      // rewinds, and a Track drops every position older than its newest
      for (const p of msg.players) {
        const rp = state.players.get(p.id);
        if (rp) { rp.x = p.x; rp.z = p.z; rp.track = new Track(p.x, p.z, p.h, p.anim); }
      }
      for (const m of msg.monsters) {
        const mob = state.monsters.get(m.id);
        if (mob) { mob.hpPct = m.hp_pct; mob.state = m.state; mob.target = m.target; mob.track = new Track(m.x, m.z); }
      }
      break;
    }
    case "player_join": case "player_update":
      upsertPlayer(msg.player);
      break;
    case "player_leave":
      dropPlayer(msg.id);
      break;
    case "pos_correct": {
      // The world refused or clamped a move (a wall, the speed budget, the
      // ferry's deck) or put you somewhere itself (a rejoin, a replay ending):
      // you are where it says, at once, and walk on from there.
      if (typeof msg.x !== "number" || typeof msg.z !== "number") break;
      // with no stacked floor named, the level you stand on now: a clamp on
      // an upper deck puts you back a step along it, not on the ground below
      const floor = typeof msg.floor === "number" ? msg.floor : undefined;
      // a scene is moving you just now: the correction is where it hands you back
      if (cutscene) { if (cutsceneFrom) Object.assign(cutsceneFrom, { x: msg.x, z: msg.z, y: entryHeight(msg.x, msg.z, floor ?? cutsceneFrom.y) }); break; }
      selfJump.cancel();
      myY = entryHeight(msg.x, msg.z, floor ?? myY);
      myX = msg.x; myZ = msg.z;
      lastSent = { ...lastSent, x: myX, z: myZ };
      if (myAvatar) positionNode(myAvatar, myX, myZ, myY);
      break;
    }
    case "monster_spawn":
      upsertMonster(msg.monster);
      break;
    case "pos": {
      // tickRemotes plays these back INTERP_DELAY behind the world clock
      const client = performance.now() / 1000;
      if (typeof msg.s === "number") noteServerClock(msg.s, client);
      const at = typeof msg.s === "number" ? msg.s : serverNow(client);
      // A frame carries only what changed (zone_state.rb broadcast_positions):
      // whatever is not in it holds its last sample. Something that rested
      // past the last tick and moves on this one comes first as it stood at
      // that tick (`r`), so its Track starts the move from there rather than
      // spreading one step across the whole rest.
      const back = msg.r;
      if (back && typeof back.s === "number") {
        (back.p || []).forEach(([id, x, z, h, anim]: any) => {
          if (id !== `p${state.self!.charId}`) state.players.get(id)?.track.push(back.s, x, z, h, anim);
        });
        (back.m || []).forEach(([id, x, z]: any) => state.monsters.get(id)?.track.push(back.s, x, z, 0, ""));
      }
      (msg.p || []).forEach(([id, x, z, h, anim]: any) => {
        if (id === `p${state.self!.charId}`) return;
        const rp = state.players.get(id);
        if (rp) { rp.track.push(at, x, z, h, anim); rp.anim = anim; }
      });
      // Takeoffs relayed since the last snapshot. A jump is a third-of-a-second
      // impulse, far shorter than the 4Hz `anim` field can carry faithfully, so
      // it travels as its own timestamped event and each client replays the
      // whole arc. `at` is the world clock; remotes are drawn INTERP_DELAY
      // behind it, and a late packet starts the arc now rather than clipping
      // the part that has already gone by.
      const renderT = serverNow(client) - INTERP_DELAY;
      (msg.j || []).forEach(([id, jt]: any) => {
        if (id === `p${state.self!.charId}`) return;
        state.players.get(id)?.jump.start(jt, renderT);
      });
      (msg.m || []).forEach(([id, x, z, hpPct, st, target]: any) => {
        const m = state.monsters.get(id);
        if (!m) return;
        m.track.push(at, x, z, 0, "");
        m.hpPct = hpPct; m.state = st; m.target = target;
        if (st === "dead") removeMonster(id);
      });
      break;
    }
    case "combat":
      (msg.ev || []).forEach(handleCombatEvent);
      break;
    case "chat":
      hud.addChat(msg.channel, msg.from, msg.msg, msg.to);
      break;
    case "who_list":
      hud.renderWhoList(msg);
      break;
    case "examine":
      hud.showExamine(msg);
      break;
    case "self": {
      const s = state.self!;
      const prevJob = s.job, prevLevel = s.level, wasDead = s.dead;
      s.hp = msg.hp; s.maxHp = msg.max_hp; s.mp = msg.mp; s.maxMp = msg.max_mp;
      s.tp = msg.tp; s.level = msg.level; s.xp = msg.xp; s.tnl = msg.tnl;
      s.gold = msg.gold; s.dead = msg.dead; s.buffs = msg.buffs || []; s.job = msg.job;
      // the world's own word on whether you are in a fight (enmity included),
      // when it gives it: cutsceneReady waits on it
      s.inCombat = !!msg.in_combat;
      // The death overlay follows the world's state, not only its events: a
      // rejoin can bring you back alive (or dead) with no revive or death.
      if (msg.dead && !wasDead) { attacking = false; hud.showDeath(0); }
      else if (!msg.dead && wasDead) hud.hideDeath();
      const at = performance.now() / 1000;
      s.buffsAt = at;
      // The server's timers are the truth: replacing the map whole drops a
      // cooldown it no longer reports. A press lock ends only once its
      // ability's real cooldown arrives; any other self may predate the press.
      if (msg.cooldowns) {
        state.cooldowns.clear();
        for (const [id, remain] of Object.entries(msg.cooldowns)) {
          state.cooldowns.set(id, at + (remain as number));
          state.pressLocks.delete(id);
        }
      }
      if (typeof msg.gcd === "number") state.gcdAt = at + msg.gcd;
      if (msg.stats) s.stats = msg.stats;
      // keep the per-job level list current (it's only fetched at login)
      const jrow = state.jobs.find((j) => j.job === msg.job);
      if (jrow) { jrow.level = msg.level; jrow.xp = msg.xp; }
      else state.jobs.push({ job: msg.job, level: msg.level, xp: msg.xp });
      if (prevJob !== msg.job) {
        rebuildSelfAvatar();
        // a job change pauses or resumes guild quests, and the tracker and
        // log draw their "waits for the <Job>" note only in refreshQuests;
        // change_job sends no quest event to trigger it
        hud.refreshQuests();
      } else if (prevLevel !== msg.level) {
        // the next main chapter may open at this level (its row says so)
        hud.refreshQuests();
      }
      hud.updateSelf();
      break;
    }
    case "party":
      state.party = msg.members || [];
      hud.updateParty();
      break;
    case "party_invite":
      hud.showInvite(msg.from);
      break;
    case "gate_confirm":
      hud.showGatePrompt(msg);
      sfx.questComplete();
      break;
    case "gate_closed":
      hud.hideGatePrompt();
      // the close sent to members the gate is about to carry through is silent
      if (msg.msg) hud.addChat("system", "", msg.msg);
      break;
    case "trade_invite":
      hud.showTradeInvite(msg.from);
      break;
    case "trade_state":
      hud.renderTrade(msg);
      break;
    case "xp":
      hud.addChat("xp", "", `You gain ${msg.amount} experience${msg.chain > 0 ? ` (chain ${msg.chain}!)` : ""}.`);
      sfx.xpTick();
      break;
    case "loot":
      if (msg.item) { hud.addChat("loot", "", `You obtain ${msg.name}.`); sfx.loot(); }
      if (msg.gold) hud.addChat("loot", "", `You find ${msg.gold} gold.`);
      break;
    case "system":
      hud.addChat("system", "", msg.msg);
      break;
    case "quest_log": {
      // authoritative snapshot of the journal, sent on login and zone join
      state.quests.clear();
      Object.entries(msg.quests || {}).forEach(([id, q]: [string, any]) => {
        state.quests.set(id, { status: q.status, progress: q.progress, credited: q.credited });
      });
      restoreQuestDoors();
      hud.refreshQuests();
      break;
    }
    case "quest_update": {
      const prev = state.quests.get(msg.id);
      state.quests.set(msg.id, { status: msg.status, progress: msg.progress, credited: msg.credited ?? prev?.credited });
      if (msg.status === 1) hud.addChat("system", "", `${msg.name}: ${msg.label} (${Math.min(msg.progress, msg.count)}/${msg.count})`);
      // the server re-sends every active duty on each zone join and on accept;
      // only a count that actually rose is worth a pill
      if (msg.status === 1 && msg.count > 0 && prev?.status === 1 && msg.progress > prev.progress) {
        hud.dutyToast(msg.id, msg.name, msg.progress, msg.count);
      }
      restoreQuestDoors();
      hud.refreshQuests();
      break;
    }
    case "quest_complete": {
      state.quests.set(msg.id, { status: 2, progress: 999 });
      hud.toast(`Duty complete: ${msg.name}`, "");
      sfx.questComplete();
      restoreQuestDoors();
      hud.refreshQuests();
      if (isMainQuest(msg.id)) storyContinues();
      hud.refreshInventoryLater();
      break;
    }
    case "ferry_status":
      updateFerryStatus(msg);
      break;
    case "npc_dialog":
      hud.showDialog(msg);
      break;
    case "cutscene":
      if (CUTSCENES[msg.id] && msg.id !== cutsceneId && !cutsceneQueue.includes(msg.id)) cutsceneQueue.push(msg.id);
      break;
    case "cutscene_refused":
      // the world would not have you in a scene just now (a fight started,
      // say): stop it, and try again shortly if it can pass. Nothing of it
      // happened, so you stand where you stood and the camera looks as it did
      // (the scene had put you on its mark, and the world never moved you).
      if (cutscene && cutsceneId === msg.id) {
        const from = cutsceneFrom;
        cutscene.abort();
        endCutscene(false);
        if (from) restoreSubject(from);
      }
      if (msg.retry) { if (!cutsceneQueue.includes(msg.id)) cutsceneQueue.unshift(msg.id); cutsceneRetryAt = performance.now() / 1000 + CUTSCENE_RETRY_S; }
      else if (msg.msg) hud.addChat("system", "", msg.msg);
      break;
    case "abilities":
      state.abilities = msg.list || [];
      hud.renderHotbar();
      break;
    case "inventory_dirty":
      hud.refreshInventoryLater();
      break;
    case "milestone":
      state.milestones[msg.id] = msg.lit;
      setMilestoneLit(msg.id, msg.lit);
      sfx.milestone();
      break;
    case "discovery_silent":
      state.discoveries.add(msg.id);
      break;
    case "discovery":
      state.discoveries.add(msg.id);
      hud.toast(`${msg.name}`, "discovery");
      hud.addChat("xp", "", `Discovered: ${msg.name} (+${msg.xp} XP)`);
      sfx.discovery();
      break;
    case "death":
      // the world ended your auto-attack (combat.rb player_death)
      attacking = false;
      state.self!.dead = true;
      hud.showDeath(msg.xp_lost);
      sfx.death();
      break;
    case "milestone_menu":
      showTravelMenu(msg);
      break;
    case "raise_offer":
      hud.showRaiseOffer(msg.from);
      hud.addChat("system", "", `${msg.from} is casting Raise on you.`);
      break;
    case "zone_change": {
      state.self!.dead = false;
      hud.hideDeath();
      // the gate's prompt belongs to the zone it was asked in. The server
      // closes it when the party agrees, so this only matters for a member who
      // teleports, releases or walks out mid-vote: they can no longer answer
      // from the new zone, and the server still counts them, so the vote lapses
      // after its timer as "not everyone answered" -- leaving the gate's zone
      // is leaving the gate
      hud.hideGatePrompt();
      void enterZone(msg.zone, msg.x, msg.z);
      break;
    }
    case "mail_unread":
      handleMailMessage(msg);
      break;
    default: if (typeof msg.t === "string" && msg.t.startsWith("court_")) handleCourtMessage(msg);
  }
}

// frees their body, drawn or cached (the streamer's dispose)
function dropPlayer(id: string): void {
  streamer.drop(id);
  avatars.delete(id);
  fxClear(id);
  state.players.delete(id);
  hud.removePlate(id);
}

function upsertPlayer(p: any): void {
  if (p.id === `p${state.self!.charId}`) {
    // Keep persisted identity/appearance when refreshing gear or rejoining.
    state.self!.race=p.race;state.self!.appearance=p.appearance;
    rebuildSelfAvatar();
    return;
  }
  let rp = state.players.get(p.id);
  if (!rp) {
    rp = { id: p.id, name: p.name, race: p.race, appearance:p.appearance, job: p.job, level: p.level, title: p.title, look: p.look,
           x: p.x, z: p.z, h: p.h, anim: p.anim, dead: p.dead, cs: !!p.cs,
           track: new Track(p.x, p.z, p.h, p.anim), jump: makeGameplayJump(p.race) };
    state.players.set(p.id, rp);
    // built by the streamer if they are among the nearest (tickStream)
    streamAt = -Infinity;
  } else {
    rp.name = p.name; rp.race=p.race; rp.appearance=p.appearance; rp.job = p.job; rp.level = p.level; rp.dead = p.dead; rp.title = p.title; rp.look = p.look; rp.cs = !!p.cs;
    const key = lookKey(p.race, p.job, p.look || {}, p.appearance);
    // nameplate only, or cached: built with the new look when drawn again
    if (!streamer.full(p.id)) {
      const held = streamer.get(p.id);
      if (held && builtFrom.get(held) !== key) streamer.discard(p.id);
      return;
    }
    // job/race/gear change → rebuild avatar; the old look stays drawn until
    // the new one is dressed and posed
    const av = avatars.get(p.id);
    if (av && builtFrom.get(av) === key) return;
    avatars.delete(p.id);
    const nav = buildRemoteAvatar(p);
    if (nav) { positionNode(nav, rp.x, rp.z, heightFor(p.id, rp.x, rp.z)); avatars.set(p.id, nav); }
    streamer.replace(p.id, nav);
    if (av) { if (nav) handOffActor(av, nav, disposeAvatar); else disposeAvatar(av); }
  }
}

// buildAvatar throws on an unknown race (there is no legacy stand-in body any
// more). One remote player with bad data must not abort the rest of a
// snapshot -- the players after it and every monster -- so it is logged and
// left without an avatar; every per-frame reader already skips that case.
function buildRemoteAvatar(p: any): AvatarNode | null {
  try { const av = buildAvatar(p.id, p.race, p.job, false, p.look || {}, undefined, p.appearance); addHitCapsule(av, p.id); builtFrom.set(av, lookKey(p.race, p.job, p.look || {}, p.appearance)); return av; }
  catch (error) { console.error("Remote player avatar failed", p.id, error); return null; }
}

function upsertMonster(m: any): void {
  let mob = state.monsters.get(m.id);
  if (!mob) {
    mob = { id: m.id, key: m.key, name: m.name, level: m.level, family: m.family,
            x: m.x, z: m.z, hpPct: m.hp_pct, state: m.state, target: m.target,
            track: new Track(m.x, m.z) };
    state.monsters.set(m.id, mob);
    const node = buildMonsterMesh(m.id, m.key);
    node.root.position.set(m.x, standHeight(m.x, m.z, groundHeight(m.x, m.z)), m.z);
    monsterNodes.set(m.id, node);
  }
}

function removeMonster(id: string): void {
  const node = monsterNodes.get(id);
  if (node) monsterDeathAndDispose(node);
  monsterNodes.delete(id);
  state.monsters.delete(id);
  state.mobEffects.delete(id);
  hud.removePlate(id);
  if (state.targetId === id) {
    state.targetId = null;
    attacking = false;
    hud.updateTarget();
  }
}

// What spell-fx.ts reads of the world: the bodies by their event ids, the
// monsters' statuses, and your own buffs (self_payload) so a ward ends when it ends.
const fxWorld: FxWorld = {
  actor(id) {
    const meId = state.self ? `p${state.self.charId}` : "";
    const av = id === meId || id === "me" ? myAvatar : avatars.get(id);
    if (av) return { node: av.root, height: av.raceH || 1.8, hands: () => handsOf(av.model?.root) };
    const mn = monsterNodes.get(id);
    if (mn) return { node: mn.root, height: bodyHeight(mn.root, MONSTERS[state.monsters.get(id)?.key ?? ""]?.height_m ?? 1.6) };
    return null;
  },
  status(id, kind) {
    const now = performance.now() / 1000;
    return !!state.mobEffects.get(id)?.some((e) => e.kind === kind && e.until > now);
  },
  hasBuff(id, name) {
    if (!state.self || id !== `p${state.self.charId}`) return undefined;
    return state.self.buffs.some((b) => b.name === name);
  },
  listener: () => myAvatar?.root.position ?? null,
  mine: (id) => !!state.self && (id === `p${state.self.charId}` || id === "me"),
};

function handleCombatEvent(ev: any): void {
  const meId = `p${state.self!.charId}`;
  const posOf = (id: string): Vector3 | null => {
    if (id === meId || id === "me") return myAvatar!.root.position.add(new Vector3(0, 2, 0));
    const av = avatars.get(id);
    if (av) return av.root.position.add(new Vector3(0, 2, 0));
    const mn = monsterNodes.get(id);
    if (mn) return mn.root.position.add(new Vector3(0, mn.plateY - 0.4, 0));
    return null;
  };
  const now = performance.now() / 1000;
  // damage wakes a sleeping monster (combat.rb damage_monster)
  if ((ev.k === "hit" || ev.k === "spell" || ev.k === "ws" || ev.k === "dot")
      && ev.dmg > 0 && typeof ev.tgt === "string" && ev.tgt.startsWith("m")) {
    const fx = state.mobEffects.get(ev.tgt);
    if (fx) state.mobEffects.set(ev.tgt, fx.filter((e) => e.kind !== "sleep"));
  }
  switch (ev.k) {
    case "hit": case "spell": case "ws": {
      const p = posOf(ev.tgt);
      if (p) {
        const cls = ev.tgt === meId ? "dmg-in" : ev.k === "spell" ? "spell" : ev.crit ? "crit" : ev.k === "ws" ? "ws" : "dmg-out";
        hud.floatText(p, `${ev.dmg}${ev.crit ? "!" : ""}`, cls);
        if (ev.name && ev.k !== "hit") hud.floatText(p.add(new Vector3(0, 0.7, 0)), ev.name, "ws");
      }
      if (ev.k === "spell" && ev.sleep && typeof ev.tgt === "string" && ev.tgt.startsWith("m")) {
        addMobEffect(ev.tgt, ev.name, "sleep", now + (abilityByName.get(ev.name)?.duration || 20));
      }
      // a weapon skill's or a spell's own sound is spell-sfx.ts's, played by
      // spell-fx.ts as its picture lands; a plain swing keeps the hit here
      if (ev.tgt === meId) sfx.hitTaken();
      else if (ev.k === "hit") sfx.meleeHit(!!ev.crit);
      if (ev.burst) {
        hud.toast("MAGIC BURST!", "sc");
        sfx.magicBurst();
      }
      const srcAv = ev.src === meId ? myAvatar : avatars.get(ev.src);
      if (srcAv) flashAttack(srcAv, performance.now() / 1000, ev.k === "spell");
      if (typeof ev.src === "string" && ev.src.startsWith("m")) {
        const mn = monsterNodes.get(ev.src);
        if (mn) {
          mn.attackUntil = performance.now() / 1000 + 0.8;
          // a notorious monster's weapon skill is its signature move
          if (ev.k === "ws") mn.specialUntil = performance.now() / 1000 + 1.6;
        }
      }
      if (ev.dmg > 0 && typeof ev.tgt === "string" && ev.tgt.startsWith("m")) {
        const mn = monsterNodes.get(ev.tgt);
        if (mn) flashMonsterHit(mn, performance.now() / 1000);
      }
      if (ev.tgt === meId || ev.src === meId) {
        const who = ev.src === meId ? "You" : nameOf(ev.src);
        const whom = ev.tgt === meId ? "you" : nameOf(ev.tgt);
        hud.addChat("combatline", "", `${who} ${ev.name ? `(${ev.name}) ` : ""}hit${who === "You" ? "" : "s"} ${whom} for ${ev.dmg}.`);
      }
      break;
    }
    case "miss": {
      const srcAv = ev.src === meId ? myAvatar : avatars.get(ev.src);
      if(srcAv?.modelVariant?.endsWith('-quaternius')) flashAttack(srcAv, performance.now()/1000);
      const p = posOf(ev.tgt);
      if (p) hud.floatText(p, ev.anticipated ? "Anticipated" : "Miss", "miss");
      sfx.miss();
      break;
    }
    case "dot": {
      const p = posOf(ev.tgt);
      if (p) hud.floatText(p, `${ev.dmg}`, "spell");
      if (ev.tgt === meId) sfx.hitTaken();
      break;
    }
    case "heal": {
      const p = posOf(ev.tgt);
      if (p && ev.amount > 0) {
        hud.floatText(p, `+${ev.amount}`, "heal");
      }
      break;
    }
    case "sc": {
      hud.toast(`Skillchain: ${ev.name}!`, "sc");
      sfx.skillchain(ev.element);
      const sp = posOf(ev.tgt);
      if (sp) {
        hud.floatText(sp.add(new Vector3(0, 1.2, 0)), `${ev.name} ${ev.dmg}`, "ws");
      }
      break;
    }
    case "cast_start": {
      if (ev.src === meId) hud.startCastBar(ev.name, ev.ms);
      const caster = ev.src === meId ? myAvatar : avatars.get(ev.src);
      if (caster) flashCast(caster, performance.now() / 1000, (ev.ms || 1500) / 1000);
      if (typeof ev.src === "string" && ev.src.startsWith("m")) {
        const mm = state.monsters.get(ev.src);
        if (mm) { mm.castEnd = now + ev.ms / 1000; mm.castMs = ev.ms; mm.castName = ev.name; }
        const cn = monsterNodes.get(ev.src);
        if (cn) cn.castUntil = now + ev.ms / 1000;
      } else if (typeof ev.src === "string" && ev.src.startsWith("p")) {
        state.casts.set(ev.src, { name: ev.name, endsAt: now + ev.ms / 1000, ms: ev.ms });
      }
      break;
    }
    case "ja": {
      const p = posOf(ev.tgt);
      if (p && ev.name) hud.floatText(p.add(new Vector3(0, 0.7, 0)), ev.name, "ws");
      if (ev.stun && typeof ev.tgt === "string" && ev.tgt.startsWith("m")) {
        // the server drops the monster's cast on a stun (combat.rb) and sends
        // no event for it, so the cast bar has to end here
        const mm = state.monsters.get(ev.tgt);
        if (mm) mm.castEnd = undefined;
        const cn = monsterNodes.get(ev.tgt); // the stunned monster stops its Cast clip
        if (cn) cn.castUntil = 0;
        addMobEffect(ev.tgt, ev.name, "stun", now + (abilityByName.get(ev.name)?.duration || 3));
      }
      break;
    }
    case "buff": {
      const p = posOf(ev.tgt);
      if (p) hud.floatText(p, ev.name, "heal");
      break;
    }
    case "levelup": {
      const p = posOf(ev.tgt);
      if (p) {
        hud.floatText(p.add(new Vector3(0, 1, 0)), "LEVEL UP!", "crit");
      }
      if (ev.tgt === meId) { hud.toast("Level up!", ""); sfx.levelUp(); }
      break;
    }
    case "die": {
      if (ev.tgt !== meId) {
        const rp = state.players.get(ev.tgt);
        if (rp) rp.dead = true;
      }
      break;
    }
    case "revive": {
      const rp = state.players.get(ev.tgt);
      if (rp) rp.dead = false;
      if (ev.tgt === meId) hud.hideDeath();
      break;
    }
    case "boss_telegraph":
      hud.toast("HUSHFALL IS COMING — SKILLCHAIN TO BREAK IT!", "sc");
      break;
    case "boss_interrupt":
      hud.toast("The silence shatters!", "");
      break;
    case "mdie":
      removeMonster(ev.tgt);
      break;
  }
  // after the switch, so a sleep or a stun is already in mobEffects for the aura to see
  fxEvent(fxWorld, ev);
}

function addMobEffect(id: string, name: string, kind: "stun" | "sleep", until: number): void {
  // a recast replaces its own entry rather than stacking a second chip
  const list = (state.mobEffects.get(id) || []).filter((e) => e.name !== name);
  list.push({ name, kind, until });
  state.mobEffects.set(id, list);
}

function nameOf(id: string): string {
  return state.players.get(id)?.name || state.monsters.get(id)?.name || "something";
}

// ---------- input ----------
export function initInput(): void {
  window.addEventListener("pointerdown", () => unlockAudio(), { once: false });
  window.addEventListener("keydown", () => unlockAudio(), { once: true });
  window.addEventListener("keydown", (e) => {
    if (hud.chatFocused()) return;
    // the scene owns the keyboard while it plays (cutscene.ts listens first)
    if (cutscene) return;
    keys[e.code] = true;
    if (e.code.startsWith("Arrow")) e.preventDefault(); // camera orbit, not page scroll
    if (e.code === "Space") {
      e.preventDefault();
      const now = performance.now() / 1000;
      if (!state.self?.dead && !selfJump.airborne(now)) {
        selfJump.start(now, now);
        sfx.uiClick();
        // the arc itself never crosses the wire — only the fact that it started
        send("jump");
      }
    }
    // Alt+Enter, the desktop game's fullscreen key, before Enter opens the chat
    if (e.code === "Enter" && e.altKey) { e.preventDefault(); toggleFullscreen(); return; }
    if (e.code === "Enter") hud.focusChat();
    // "/" opens the composer ready for a command (and never Firefox quick-find)
    if (e.key === "/") { e.preventDefault(); hud.focusChat("/"); }
    // Tab walks everything in view; Shift+Tab only enemies. Players get the key
    // just above Tab — Ctrl+Tab belongs to the browser, which never hands it on,
    // and someone reaching for their other browser tab is not asking to retarget.
    if (e.code === "Tab" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      cycleTarget(e.shiftKey ? "enemy" : "all");
    }
    if (e.code === "Backquote") { e.preventDefault(); cycleTarget("player"); }
    if (e.code === "KeyF") tryAttack();
    if (e.code === "KeyE") tryInteract();
    // Ctrl/Cmd+R answers the last whisper; bare R is autorun
    if (e.code === "KeyR" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); hud.replyToLastTell(); }
    else if (e.code === "KeyR") { toggleAutorun(); }
    if (e.code === "KeyW" || e.code === "KeyS") autorun = false; // hands back on the wheel
    if (e.code === "Escape") { clearTarget(); hud.closeWindows(); }
    // a held key would repeat ~30 times a second, and each repeat of an item
    // slot is one more use_item for the server to refuse
    if (e.code.startsWith("Digit") && !e.repeat) {
      const n = parseInt(e.code.slice(5));
      if (n >= 1 && n <= 9) hud.useHotbarSlot(n - 1);
      else if (n === 0) hud.useHotbarSlot(9); // 0 = tenth slot
    }
    if (e.code === "KeyI") hud.toggleWindow("inventory");
    if (e.code === "KeyC") hud.toggleWindow("character");
    if (e.code === "KeyJ") hud.toggleWindow("quests");
    if (e.code === "KeyM") hud.toggleWindow("map");
    if (e.code === "KeyK") hud.toggleWindow("craft");
    if (e.code === "KeyL") hud.toggleWindow("court");
    if (e.code === "KeyO") hud.toggleWindow("friends");
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
}

let restingLocal = false;
function rest_toggle(): void {
  restingLocal = !restingLocal;
  rest_send(restingLocal);
}
function rest_send(on: boolean): void {
  myAnim = on ? "rest" : "idle";
  if (on) autorun = false;
  send("rest", { on });
  if (on) hud.addChat("system", "", "You kneel and rest. (move, or /rest again, to stand)");
}

function toggleAutorun(): void {
  autorun = !autorun;
  if (!autorun) return;
  if (restingLocal) { restingLocal = false; rest_send(false); }
  hud.toast("Autorun", "");
}

// A click targets. A double-click on an NPC or a touchable thing also uses
// it — the same as pressing E once it is targeted — and on a monster fights
// it, the same as F. (Babylon reports the second
// click as POINTERDOUBLETAP and withholds POINTERPICK for it, so the first
// click has already done the targeting by the time the double-tap lands.)
function setupPointer(): void {
  scene.onPointerObservable.add((pi) => {
    const twice = pi.type === PointerEventTypes.POINTERDOUBLETAP;
    if (pi.type !== PointerEventTypes.POINTERPICK && !twice) return;
    const mesh = pi.pickInfo?.pickedMesh;
    const entityId = mesh?.metadata?.entityId as string | undefined;
    if (!entityId) return;
    if (entityId.startsWith("npc_") || entityId.startsWith("obj_")) {
      // NPCs and world objects are targets first; E (or a double-click) acts
      const id = entityId.slice(4);
      if (entityId.startsWith("obj_")) {
        const o = worldObjects.find((w) => w.id === id);
        if (o && !touchable(o)) return; // an inert relic: the click lands on scenery
      } else {
        // Kit floors are thin instances a pick sees straight through, so a
        // click can land on someone a storey away. They are not on offer.
        // Only within speaking reach: further off, the height between you is
        // a hillside, not a floor (Moonmere refused ~half of clicks at 12-25 m).
        const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === id);
        if (npc && throughFloor(npc)) return;
      }
      state.targetId = entityId.startsWith("npc_") ? npcTargetId(id) : objTargetId(id);
      hud.updateTarget();
      if (twice) tryInteract();
      return;
    }
    // (by the roster, not the "m" prefix: your own body's id is "me")
    if (state.monsters.has(entityId)) {
      if (state.targetId !== entityId) { state.targetId = entityId; hud.updateTarget(); }
      // a double-click also fights it, as F does
      if (twice && !fighting(entityId)) tryAttack();
      return;
    }
    if (twice) return; // a fellow explorer: the first click targeted them
    if (entityId.startsWith("p")) {
      // target player (for heals) — store as target too
      state.targetId = entityId;
      hud.updateTarget();
      // …and offer the things you can do to another explorer, at the cursor.
      // clientX/clientY are CSS pixels; scene.pointerX is render-buffer pixels.
      if (entityId !== `p${state.self!.charId}`) {
        const rp = state.players.get(entityId);
        const ev = pi.event as { clientX?: number; clientY?: number } | undefined;
        if (rp && ev && ev.clientX !== undefined && ev.clientY !== undefined) {
          openPlayerMenu(rp.name, ev.clientX, ev.clientY);
        }
      }
    }
  });
}

function talkToNpc(npcId: string): void {
  const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === npcId);
  if (!npc) return;
  const d = Math.hypot(myX - npc.x, myZ - npc.z);
  if (!onInteractionFloor(myY,npc,groundHeight)) { hud.addChat("system", "", "Meet them on the same floor."); return; }
  if (d > NPC_REACH) { hud.addChat("system", "", "Move closer to speak."); return; }
  send("talk", { npc: npcId });
}

// Tab walks what you can actually see: near, alive, and inside a ~75° cone
// around where the camera is looking (not where the character faces).
type CycleMode = "all" | "enemy" | "player";
const MODE_KINDS: Record<CycleMode, TargetKind[] | undefined> = {
  all: undefined,
  enemy: ["enemy"],
  player: ["player"],
};

// Everything targetable in the zone, in world space: monsters and players
// where they are being drawn this frame, NPCs and objects where they stand.
function targetCandidates(): TargetCandidate[] {
  const out: TargetCandidate[] = [];
  const eye = (x: number, z: number) => groundHeight(x, z) + 1;
  state.monsters.forEach((m) => {
    if (m.state === "dead") return;
    const node = monsterNodes.get(m.id);
    const x = node ? node.root.position.x : m.x;
    const z = node ? node.root.position.z : m.z;
    out.push({ id: m.id, kind: "enemy", name: m.name, x, y: node ? node.root.position.y + 1 : eye(x, z), z });
  });
  state.players.forEach((rp) => {
    const av = avatars.get(rp.id);
    if (av && !actorDrawn(av)) return; // not on screen yet (actor-reveal.ts)
    const x = av ? av.root.position.x : rp.x;
    const z = av ? av.root.position.z : rp.z;
    out.push({ id: rp.id, kind: "player", name: rp.name, x, y: av ? av.root.position.y + 1 : eye(x, z), z });
  });
  (ZONES[state.zone].npcs || []).forEach((n: any) => {
    if(!onInteractionFloor(myY,n,groundHeight))return;
    if (!npcHere(n.id)) return; // not on screen yet
    out.push({ id: npcTargetId(n.id), kind: "npc", name: n.name, x: n.x, y: (npcAvatars.get(n.id)?.root.position.y??n.y??groundHeight(n.x,n.z))+(npcAvatars.get(n.id)?.raceH??1.8)*.55, z: n.z });
  });
  worldObjects.forEach((o) => {
    if (!touchable(o)) return;
    out.push({ id: objTargetId(o.id), kind: "object", name: o.name, x: o.x, y: (o.y??groundHeight(o.x,o.z))+1, z: o.z });
  });
  return out;
}

function cycleTarget(mode: CycleMode): void {
  if (!camera || !zoneReady) return;
  const fwd = camera.getForwardRay().direction;
  const cam = camera.globalPosition;
  const view = { cam: { x: cam.x, y: cam.y, z: cam.z }, fwd: { x: fwd.x, y: fwd.y, z: fwd.z }, x: myX, z: myZ };
  const list = targetsInView(targetCandidates(), view, { kinds: MODE_KINDS[mode] });
  const next = nextTarget(list, state.targetId);
  if (!next) return;
  state.targetId = next.id;
  hud.updateTarget();
}

function clearTarget(): void {
  state.targetId = null;
  attacking = false;
  send("stop_attack");
  hud.updateTarget();
}

// Auto-attack is on against this monster (the one last engaged with F).
let attackedId: string | null = null;
const fighting = (id: string | null): boolean => attacking && !!id && id === attackedId;

export function tryAttack(): void {
  if (!state.targetId || !state.targetId.startsWith("m")) return;
  // the world refuses both, and the flag would hold the music and the weapon
  if (state.self?.dead || cutscene) return;
  attacking = true;
  attackedId = state.targetId;
  send("attack", { id: state.targetId });
  hud.addChat("combatline", "", `You engage ${nameOf(state.targetId)}.`);
}

// How close you must stand to use a thing. These sit just inside the ranges
// the server enforces, so the prompt goes quiet before the server refuses.
const NPC_REACH = 7.5;
// Within speaking reach but on another floor: a click on them and a target
// already on them are not on offer. Beyond reach the height between you is
// ground to cover (a hillside, a terrace), and they stay clickable.
const throughFloor = (npc: any): boolean =>
  Math.hypot(myX - npc.x, myZ - npc.z) <= NPC_REACH && !onInteractionFloor(myY, npc, groundHeight);
const REACH: Record<string, number> = { portal: 8.5, milestone: 6.5, node: 5.5, interactable: 6.5 };
const DEFAULT_REACH = 6.5;

interface Touchable { id: string; kind: string; name: string; d: number; reach: number }

// Whether a world object is anything to you right now. Crystals and nodes
// always are, and portals unless gated on a quest this character has not
// finished (portalVisible); a quest relic only while an active quest names it
// (quest_index.ts interactableWanted) -- otherwise it is scenery, and neither
// the prompt, Tab, a click nor E will find it.
function touchable(o: { id: string; kind: string; x:number; z:number; y?: number }): boolean {
  if(!onInteractionFloor(myY,o,groundHeight))return false;
  if (o.kind === "portal") return portalVisible((ZONES[state.zone]?.portals || []).find((p: any) => p.id === o.id));
  return o.kind !== "interactable" || interactableWanted(o.id) || isCourtStationId(o.id);
}

// What E acts on: whatever you have targeted, once it is something you can
// touch. Nothing is used by proximity alone — target it first.
function targetedInteractable(): Touchable | null {
  const t = parseTargetId(state.targetId);
  if (t.kind === "npc") {
    const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === t.id);
    if (!npc || !onInteractionFloor(myY, npc, groundHeight)) return null;
    return { id: t.id, kind: "npc", name: npc.name, d: Math.hypot(myX - npc.x, myZ - npc.z), reach: NPC_REACH };
  }
  if (t.kind === "object") {
    const o = worldObjects.find((w) => w.id === t.id);
    if (!o || !touchable(o)) return null;
    return { id: o.id, kind: o.kind, name: o.name, d: Math.hypot(myX - o.x, myZ - o.z), reach: REACH[o.kind] ?? DEFAULT_REACH };
  }
  return null;
}

function tryInteract(): void {
  const obj = targetedInteractable();
  if (obj) {
    if (obj.kind === "npc") talkToNpc(obj.id);
    else send("interact", { id: obj.id });
    return;
  }
  // A targeted explorer is "interacted with" through the same menu a click on
  // them raises — trade, invite, whisper, examine — so E reaches it too.
  const tid = state.targetId;
  if (tid && tid.startsWith("p") && tid !== `p${state.self!.charId}`) {
    const rp = state.players.get(tid);
    if (rp) { openPlayerMenuAtEntity(tid, rp.name); return; }
  }
  // E with nothing usable targeted: point at whatever is underfoot
  const near = nearestInteractable();
  if (near) hud.addChat("system", "", `Target ${near.name} first — click it, or Tab to it.`);
}

// How near something must be before the Tab nudge names it (and E with nothing
// targeted points at it). Philip, 2026-10-15: 4 m, not the old 6.5 -- in a
// town the nudge was up everywhere.
const NUDGE_REACH = 4;

function nearestInteractable(): { id: string; kind: string; name: string } | null {
  let best: { id: string; kind: string; name: string; d: number } | null = null;
  worldObjects.forEach((o) => {
    if (!touchable(o)) return;
    const d = Math.hypot(myX - o.x, myZ - o.z);
    if (d < NUDGE_REACH && (!best || d < best.d)) best = { id: o.id, kind: o.kind, name: o.name, d };
  });
  (ZONES[state.zone].npcs || []).forEach((n: any) => {
    if(!onInteractionFloor(myY,n,groundHeight))return;
    if (!npcHere(n.id)) return;
    const d = Math.hypot(myX - n.x, myZ - n.z);
    if (d < NUDGE_REACH && (!best || d < best.d)) best = { id: n.id, kind: "npc", name: n.name, d };
  });
  return best;
}

// Walking into a Dawn Veil takes you through it; a Rune Circle is used like
// anything else, targeted and E or a double-click (portal_touch.ts). Only once
// you stand in the world: a veil you arrive inside, or stood in through a
// cutscene or the loading veil, waits for you to step out and back.
const portalTouch = new PortalTouchLatch();
let portalSentAt = 0;
function checkPortalTouch(): void {
  if (!zoneReady || veilHeld || cutscene || !state.self || state.self.dead) return;
  const touching: string[] = [];
  for (const o of worldObjects) {
    if (o.kind === "portal" && o.veil && touchable(o) && touchingVeil(o.veil, myX, myZ)) touching.push(o.id);
  }
  const id = portalTouch.update(touching);
  // the zone_change is on its way: one ask, not one a frame until it lands
  if (id && performance.now() - portalSentAt > 1500) { portalSentAt = performance.now(); send("interact", { id }); }
}

// ---------- frame loop ----------
export function startRenderLoop(): void {
  // a lost GPU context comes back as a fresh entry to the zone you stand in,
  // the way a zone change builds it (scene.ts initEngine)
  onGpuReset(() => enterZone(state.zone, myX, myZ));
  let last = performance.now();
  engine.runRenderLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - last) / 1000, 0.1);
    last = nowMs;
    const now = nowMs / 1000;
    if (!scene) return;
    tickCutscene(dt, now);
    tickMovement(dt, now);
    checkPortalTouch();
    // before tickRemotes, which places a player shown again from the cache this
    // same frame: they never draw one frame where they were let go
    tickStream(now);
    tickRemotes(dt, now);
    npcAvatars.forEach((av, id) => animateAvatar(av, npcAnimOverride.get(id) ?? "idle", dt, now));
    if (cutscene) { hideTargetMarker(); hideObjectiveMarkers(); }
    else { tickTargetMarker(now); tickObjectiveMarkers(now); }
    hud.tickFrame(camera, myAvatar, monsterNodes, avatars, npcAvatars, myX, myZ, bodilessPlate);
    checkPrompts(now);
    scene.render();
  });
}

function tickMovement(dt: number, now: number): void {
  if (!myAvatar || !zoneReady) return;
  const s = state.self!;
  if (cutscene) {
    // the scene moves you (CutsceneStage.moveSubject); nothing goes to the
    // server until it ends, so everyone else sees you standing where it began
    myAvatar.root.position.set(myX, standHeight(myX, myZ, myY), myZ);
    myAvatar.root.rotation.y = myH;
    myAnim = cutsceneAnim;
    animateAvatar(myAvatar, cutsceneAnim, dt, now);
    updateCarpet(myX, myZ);
    return;
  }
  let vx = 0, vz = 0;
  if (s.dead || hud.chatFocused()) autorun = false;
  if (!s.dead && !hud.chatFocused()) {
    if (keys["KeyW"] || autorun) vz += 1;
    if (keys["KeyS"]) vz -= 1;
    if (keys["KeyA"]) vx -= 1;
    if (keys["KeyD"]) vx += 1;
  }
  const moving = vx !== 0 || vz !== 0;
  if (moving) {
    restingLocal = false;
    const camYaw = -camera.alpha - Math.PI / 2;
    const len = Math.hypot(vx, vz);
    const dirX = (Math.sin(camYaw) * vz + Math.cos(camYaw) * vx) / len;
    const dirZ = (Math.cos(camYaw) * vz - Math.sin(camYaw) * vx) / len;
    const speed = 8.0;
    const half = (ZONES[state.zone].size as number) / 2 - 2;
    walkSelf(Math.max(-half, Math.min(half, myX + dirX * speed * dt)),
      Math.max(-half, Math.min(half, myZ + dirZ * speed * dt)));
    myH = Math.atan2(dirX, dirZ);
    myAnim = "run";
  } else if (myAnim === "run") {
    myAnim = restingLocal ? "rest" : "idle";
  }
  // jump arc (visual; landing height follows the terrain)
  if (s.dead) selfJump.cancel();
  const airborne = selfJump.airborne(now);
  const jumpY = selfJump.height(now);
  // Interrupt the input latch too, so stopping after a brief move cannot
  // restart a cancelled Quaternius cheer/wave.
  if(mappedRace(s.race)&&(moving||airborne||s.dead))emoteUntil=0;
  if (s.dead) myAnim = "dead";
  else if (myAnim === "dead") myAnim = "idle";
  if (!s.dead) {
    if (airborne) myAnim = "jump";
    else if (myAnim === "jump") myAnim = moving ? "run" : "idle";
    if (emoteUntil > now && !moving && !airborne) myAnim = emoteAnim;
    else if (myAnim.startsWith("emote:")) myAnim = "idle";
  }

  // auto-face the engaged target when standing still
  if (attacking && !moving && state.targetId) {
    const m = state.monsters.get(state.targetId);
    if (m) myH = Math.atan2(m.x - myX, m.z - myZ);
  }

  updatePlaceAudio(myX, myZ, dt);

  // footsteps
  if (moving) {
    stepTimer += dt;
    if (stepTimer > 0.32) { stepTimer = 0; sfx.footstep(state.zone); }
  }

  // myY is the LEVEL (collision, camera and the same-floor checks use it);
  // the feet go on what is drawn there (standHeight)
  if (veilHeld && (actorDrawn(myAvatar) || performance.now() > veilUntil)) { veilHeld = false; hud.showLoading(false, ""); }
  myY = groundHeight(myX, myZ, myY);
  myAvatar.root.position.set(myX, standHeight(myX, myZ, myY) + jumpY, myZ);
  myAvatar.root.rotation.y = myH;
  const phase=selfJump instanceof QuaterniusJumpArc?selfJump.phase(now):undefined;
  animateAvatar(myAvatar, !s.dead&&phase?phase:myAnim, dt, now);

  // camera orbit on arrow keys
  if (!hud.chatFocused()) {
    if (keys["ArrowLeft"]) camera.alpha += 2.6 * dt;
    if (keys["ArrowRight"]) camera.alpha -= 2.6 * dt;
    if (keys["ArrowUp"]) camera.beta = Math.max(camera.lowerBetaLimit!, camera.beta - 1.5 * dt);
    if (keys["ArrowDown"]) camera.beta = Math.min(camera.upperBetaLimit!, camera.beta + 1.5 * dt);
  }

  updateCarpet(myX, myZ);

  // network send 10Hz
  if (now - lastMoveSend > 0.1) {
    if (Math.abs(lastSent.x - myX) > 0.02 || Math.abs(lastSent.z - myZ) > 0.02 ||
        lastSent.h !== myH || lastSent.anim !== myAnim) {
      send("move", { x: myX, z: myZ, h: myH, anim: myAnim });
      lastSent = { x: myX, z: myZ, h: myH, anim: myAnim };
      rememberHeight(now);
    }
    lastMoveSend = now;
  }
}

// Ring under the target: red for an enemy, cyan for a fellow explorer. Follows the
// interpolated node so it never lags a frame behind the thing it marks.
function tickTargetMarker(now: number): void {
  const tid = state.targetId;
  if (!tid || !zoneReady) { hideTargetMarker(); return; }
  const mob = state.monsters.get(tid);
  if (mob && mob.state !== "dead") {
    const node = monsterNodes.get(tid);
    const x = node ? node.root.position.x : mob.x;
    const z = node ? node.root.position.z : mob.z;
    showTargetMarker(x, z, "enemy", now);
    return;
  }
  const rp = state.players.get(tid);
  if (rp) {
    const av = avatars.get(tid);
    if (av && !actorDrawn(av)) { hideTargetMarker(); return; }
    const x = av ? av.root.position.x : rp.x;
    const z = av ? av.root.position.z : rp.z;
    showTargetMarker(x, z, "friendly", now);
    return;
  }
  const t = parseTargetId(tid);
  if (t.kind === "npc") {
    const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === t.id);
    if (npc && !npcHere(t.id)) { hideTargetMarker(); return; }
    if (npc) { showTargetMarker(npc.x, npc.z, "neutral", now,npcAvatars.get(t.id)?.root.position.y??npcSpot(npc).y); return; }
  } else if (t.kind === "object") {
    const o = worldObjects.find((w) => w.id === t.id);
    if (o) { showTargetMarker(o.x, o.z, "neutral", now,o.y); return; }
  }
  hideTargetMarker(); // dead, gone, or a party member in another zone
}

// Objective markers on the things active quests name in this zone (nodes,
// notices, landmarks): the nearest few within OBJECTIVE_RANGE. The HUD's
// beacons and the map carry the far view; these say WHICH object, up close.
// The journal only changes on a server message, so the lookup is cached.
const OBJECTIVE_RANGE = 90;
let objDestCache: { at: number; zone: string; list: { x: number; z: number; y?: number; color: string }[] } | null = null;
function tickObjectiveMarkers(now: number): void {
  if (!zoneReady || !state.self) { hideObjectiveMarkers(); return; }
  const t = performance.now();
  if (!objDestCache || objDestCache.zone !== state.zone || t - objDestCache.at > 250) {
    objDestCache = {
      at: t, zone: state.zone,
      list: activeQuestDestinations(state.zone).filter((d) => d.kind === "point").map((d) => ({ x: d.x, z: d.z, y:d.y, color: d.color })),
    };
  }
  const near = objDestCache.list
    .map((d) => ({ ...d, dd: (d.x - myX) ** 2 + (d.z - myZ) ** 2 }))
    .filter((d) => d.dd < OBJECTIVE_RANGE * OBJECTIVE_RANGE)
    .sort((a, b) => a.dd - b.dd);
  showObjectiveMarkers(near, now);
}

function tickRemotes(dt: number, now: number): void {
  tickServerClock(now);
  state.players.forEach((rp) => {
    const av = avatars.get(rp.id);
    const s = rp.track.sample(now);
    rp.x = s.x; rp.z = s.z; rp.h = s.h;
    // a nameplate-only player still moves: the plate follows, and the streamer
    // measures from here
    if (!av) { heightFor(rp.id, rp.x, rp.z); return; }
    // the jump runs on the same playback clock as the position, so the arc
    // peaks over the ground the interpolated feet are crossing
    if (rp.dead) rp.jump.cancel();
    const renderT = serverNow(now) - INTERP_DELAY;
    const airborne = rp.jump.airborne(renderT);
    av.root.position.set(rp.x, standHeight(rp.x, rp.z, heightFor(rp.id, rp.x, rp.z)) + rp.jump.height(renderT), rp.z);
    av.root.rotation.y = s.h;
    // the anim that shipped with the snapshot being played, not the newest one.
    // A latched "jump" outlives or undershoots the real arc, so the arc — not
    // the snapshot — decides whether they are shown in the air.
    let anim = s.anim || rp.anim;
    if (anim === "jump") anim = s.speed > 0.15 ? "run" : "idle";
    if (airborne) anim = "jump";
    const phase=rp.jump instanceof QuaterniusJumpArc?rp.jump.phase(renderT):undefined;
    animateAvatar(av, rp.dead ? "dead" : phase?phase:anim, dt, now);
  });
  const meId = `p${state.self!.charId}`;
  let engagedCount = attacking ? 1 : 0;
  // in combat, weapons are drawn (weapon-sheath.ts): your own auto-attack, or
  // any monster fighting you or another player; a swing or cast marks it too
  if (attacking && myAvatar) myAvatar.combatUntil = combatHold(now);
  let bossEngaged = false;
  state.monsters.forEach((m) => {
    const node = monsterNodes.get(m.id);
    if (!node) return;
    const s = m.track.sample(now);
    m.x = s.x; m.z = s.z;
    node.root.position.set(m.x, standHeight(m.x, m.z, heightFor(m.id, m.x, m.z)), m.z);
    const moving = s.speed > 0.15;
    if (moving) {
      // ease into the heading: segment boundaries can turn sharply
      const want = Math.atan2(s.vx, s.vz);
      let diff = want - node.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      node.root.rotation.y += diff * Math.min(1, dt * 12);
    } else if (m.target) {
      // face whoever the monster is fighting
      let tx: number | null = null, tz: number | null = null;
      if (m.target === meId) { tx = myX; tz = myZ; }
      else {
        const tp = state.players.get(m.target);
        if (tp) { tx = tp.x; tz = tp.z; }
      }
      if (tx !== null && tz !== null) {
        const want = Math.atan2(tx - m.x, tz - m.z);
        let diff = want - node.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        node.root.rotation.y += diff * Math.min(1, dt * 8);
      }
    }
    animateMonster(node, moving, dt, now, s.speed);
    if (m.target) {
      const foe = m.target === meId ? myAvatar : avatars.get(m.target);
      if (foe) foe.combatUntil = combatHold(now);
    }
    const onMe = m.target === meId;
    if (onMe) {
      engagedCount++;
      if (!aggroSeen.has(m.id)) { aggroSeen.add(m.id); sfx.aggro(); }
    } else {
      aggroSeen.delete(m.id);
    }
    // the boss theme should start when you open on it, not when it deigns to
    // answer, so an unaggroed boss you are swinging at counts too
    if (m.family === "boss" && (onMe || (attacking && state.targetId === m.id))) bossEngaged = true;
  });
  setEngaged(engagedCount > 0, bossEngaged);
  // cards wait while something fights you, or you fight something that fights back (a stale auto-attack does not hold them),
  // and while a scene plays or waits to: it hides the HUD, so a card shown then would be marked seen unread
  setCourtCombat(engagedCount - (attacking ? 1 : 0) > 0 || (attacking && !!state.monsters.get(state.targetId ?? "")?.target)
    || !!cutscene || cutsceneQueue.length > 0);
}

// A live monster targeted while you are not already fighting it, and while
// tryAttack would act (not dead, not in a scene).
function fightable(id: string | null): boolean {
  if (!id || !id.startsWith("m") || fighting(id) || state.self?.dead || cutscene) return false;
  const m = state.monsters.get(id);
  return !!m && m.state !== "dead";
}

function checkPrompts(now: number): void {
  // a relic targeted while its quest was active goes inert at hand-in; let go
  // of it rather than leave a target frame on what is now furniture
  const tgt = parseTargetId(state.targetId);
  if (tgt.kind === "object") {
    const o = worldObjects.find((w) => w.id === tgt.id);
    if (o && !touchable(o)) clearTarget();
  }
  // ...and someone left on another floor (the stairs climbed or descended
  // since they were targeted): the server refuses them from here, so the
  // target frame, marker and E prompt do not offer them either.
  if (tgt.kind === "npc") {
    const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === tgt.id);
    if (npc && throughFloor(npc)) clearTarget();
  }
  // interact prompt — the target leads, with a nudge toward what is underfoot
  const obj = targetedInteractable();
  if (obj) {
    hud.setInteractPrompt({
      key: "E", verb: isCourtStationId(obj.id) ? "Use" : interactVerb(obj.kind, obj.kind === "milestone" && !!state.milestones[obj.id]),
      name: obj.name, note: obj.d > obj.reach ? "too far" : undefined,
    });
  } else if (fightable(state.targetId)) {
    // a monster in your sights you are not yet fighting: F engages it
    hud.setInteractPrompt({ key: "F", verb: "Fight", name: state.monsters.get(state.targetId!)!.name });
  } else {
    const near = nearestInteractable();
    hud.setInteractPrompt(near ? { key: "Tab", verb: "Target", name: near.name } : null);
  }

  // discovery scan
  if (now - lastDiscoverCheck > 1.5) {
    lastDiscoverCheck = now;
    (ZONES[state.zone].landmarks || []).forEach((lm: any) => {
      if (state.discoveries.has(lm.id)) return;
      if (Math.hypot(myX - lm.x, myZ - lm.z) < 20) send("discover", { id: lm.id });
    });
  }
}

// ---------- cutscenes: starting, playing, ending ----------
function cutsceneReady(id: string, now: number): boolean {
  const def = CUTSCENES[id], s = state.self;
  if (!def || !s || !playsHere(id)) return false;
  if (!zoneReady || veilHeld || !myAvatar || !actorDrawn(myAvatar) || s.dead) return false;
  if (now < cutsceneRetryAt || attacking || s.inCombat) return false;
  const meId = `p${s.charId}`;
  for (const m of state.monsters.values()) if (m.target === meId && m.state !== "dead") return false;
  // the scene's cast must be on screen: built, then drawn, or given up on.
  // The cast is pinned in full detail (tickStream) from the moment the scene is
  // owed, so the wait runs from then, not from the zone's residents.
  if (npcsBuiltFor !== state.zone) return false;
  if (castWaitFor !== id) { castWaitFor = id; castWaitFrom = performance.now(); tickStream(now, true); }
  const zoneNpcs = new Set((ZONES[state.zone].npcs || []).map((n: any) => n.id));
  const waiting = castOf(id).some((n) => zoneNpcs.has(n) && !npcPresent(npcAvatars.get(n)));
  return !waiting || performance.now() - Math.max(npcsBuiltAt, castWaitFrom) > CUTSCENE_NPC_WAIT_MS;
}

// The residents a scene names, which must be drawn in full while it is owed and while it plays.
function castOf(id: string): string[] {
  const named = JSON.stringify(CUTSCENES[id] ?? {}).match(/npc:([a-z0-9_]+)|"npc":\s*"([a-z0-9_]+)"/g) ?? [];
  return named.map((m) => m.replace(/^npc:|^"npc":\s*"|"$/g, ""));
}
let castWaitFor = "", castWaitFrom = 0;
function cutsceneCast(): string[] {
  if (cutscene) return castOf(cutsceneId);
  const next = cutsceneQueue.find((id) => playsHere(id));
  return next ? castOf(next) : [];
}

function tickCutscene(dt: number, now: number): void {
  if (cutscene) {
    if (cutscene.update(dt)) endCutscene(true);
    return;
  }
  if (!cutsceneQueue.length) return;
  // a scene filmed in another zone is not this one's to play
  while (cutsceneQueue.length && !playsHere(cutsceneQueue[0])) cutsceneQueue.shift();
  const id = cutsceneQueue[0];
  if (!id || !cutsceneReady(id, now)) return;
  cutsceneQueue.shift();
  startCutscene(id);
}

function startCutscene(id: string): void {
  const def = CUTSCENES[id];
  autorun = false;
  // the world ends auto-attack as the scene begins (cutscene_begin)
  attacking = false;
  restingLocal = false;
  selfJump.cancel();
  emoteUntil = 0;
  for (const k of Object.keys(keys)) keys[k] = false;
  hud.closeWindows();
  cutsceneAnim = "idle";
  // whatever the follow camera last decided, you are in the shot
  if (myAvatar) setActorShown(myAvatar, true);
  // stand still where everyone else will see you, then tell the world
  send("move", { x: myX, z: myZ, h: myH, anim: "idle" });
  lastSent = { x: myX, z: myZ, h: myH, anim: "idle" };
  send("cutscene_begin", { id });
  // where it began: a refused scene, and a scene seen before, put you back
  // here (Philip 2026-10-19: only a first viewing leaves you on its mark)
  cutsceneFrom = { x: myX, z: myZ, y: myY, h: myH, alpha: camera?.alpha, beta: camera?.beta, replay: state.discoveries.has(`scene_seen_${id}`) };
  cutsceneId = id;
  castWaitFor = "";
  cutscene = new CutscenePlayer(def, worldStage());
  cutscene.start();
}

function endCutscene(watched: boolean): void {
  const id = cutsceneId, from = cutsceneFrom;
  cutscene = null;
  cutsceneId = "";
  cutsceneFrom = null;
  npcAnimOverride.clear();
  for (const k of Object.keys(keys)) keys[k] = false;
  if (!watched || !id) return;
  send("cutscene_end", { id });
  state.discoveries.add(`scene_seen_${id}`);
  // a replay hands you back where you stood (the world's pos_correct says the
  // same); a first viewing leaves you where the scene did
  if (from?.replay) restoreSubject(from);
  // where you stand now that the world is listening again
  send("move", { x: myX, z: myZ, h: myH, anim: "idle" });
  lastSent = { x: myX, z: myZ, h: myH, anim: "idle" };
  myAnim = "idle";
}

// Where a scene found you, and how the camera looked then.
interface SubjectPose { x: number; z: number; y: number; h: number; alpha?: number; beta?: number; replay: boolean }
let cutsceneFrom: SubjectPose | null = null;
function restoreSubject(from: SubjectPose): void {
  myX = from.x; myZ = from.z; myY = from.y; myH = from.h;
  if (myAvatar) { positionNode(myAvatar, myX, myZ, myY); myAvatar.root.rotation.y = myH; }
  if (camera && from.alpha !== undefined && from.beta !== undefined) {
    camera.target.set(myX, myY + 2, myZ);
    camera.alpha = from.alpha; camera.beta = from.beta;
  }
}

function worldStage(): CutsceneStage {
  const npcDefs = (ZONES[state.zone].npcs || []) as any[];
  return {
    scene,
    name: state.self!.name,
    npcs: npcDefs,
    ground: (x, z) => groundHeight(x, z),
    subject: () => ({ x: myX, y: myY, z: myZ, h: myH }),
    moveSubject(x, z, h) {
      walkSelf(x, z);
      myH = h;
    },
    placeSubject(x, z, h) { myX = x; myZ = z; myH = h; myY = entryHeight(x, z); },
    subjectAnim(anim) { cutsceneAnim = anim; },
    npc(id) {
      const av = npcAvatars.get(id);
      return av ? { x: av.root.position.x, y: av.root.position.y, z: av.root.position.z, h: av.root.rotation.y } : undefined;
    },
    camp(key) { return campPose(state.zone, key); },
    crystal() { return nearestCrystal(state.zone, myX, myZ); },
    zone: () => state.zone,
    turnNpc(id, h) {
      const av = npcAvatars.get(id);
      if (av) av.root.rotation.y = h ?? (npcDefs.find((n) => n.id === id)?.h ?? Math.PI);
    },
    npcAnim(id, anim) { if (anim) npcAnimOverride.set(id, anim); else npcAnimOverride.delete(id); },
    handBack(from) {
      // the play camera picks up looking from where the last shot stood; the
      // follow camera then eases back to the player's own distance
      if (!camera) return;
      const t = camera.target;
      t.set(myX, myY + 2, myZ);
      const dx = from.pos.x - t.x, dy = from.pos.y - t.y, dz = from.pos.z - t.z;
      const r = Math.hypot(dx, dy, dz);
      if (r < 0.5) return;
      camera.alpha = Math.atan2(dz, dx);
      camera.beta = Math.min(camera.upperBetaLimit ?? 2.5, Math.max(camera.lowerBetaLimit ?? 0.4, Math.acos(dy / r)));
    },
  };
}

// "/cutscene" lists the scenes you can watch again here; "/cutscene <name>"
// plays one. Only a scene you have already seen, in the zone it was filmed in:
// the world refuses anything else (cutscenes.rb Cutscenes.refusal).
function cutsceneCommand(arg: string): void {
  const here = Object.entries(CUTSCENES).filter(([id]) => playsHere(id) && state.discoveries.has(`scene_seen_${id}`));
  const q = arg.trim().toLowerCase();
  if (!q) {
    hud.addChat("system", "", here.length
      ? `Scenes you can watch again here: ${here.map(([, d]) => d.name).join(", ")}. Type /cutscene and the name.`
      : "There is no scene here you have seen.");
    return;
  }
  // the name or any part of it: "/cutscene sea gate" finds The Sea Gate
  const hit = here.find(([id, d]) => id === q || d.name.toLowerCase() === q) ?? here.find(([, d]) => d.name.toLowerCase().includes(q));
  if (!hit) { hud.addChat("system", "", "No scene by that name that you have seen here."); return; }
  if (cutscene || cutsceneQueue.includes(hit[0])) return;
  cutsceneQueue.push(hit[0]);
}

export function getMyPos(): { x: number; z: number } { return { x: myX, z: myZ }; }
export function isAttacking(): boolean { return attacking; }
