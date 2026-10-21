import type {Node,Scene} from '@babylonjs/core';
import type {AvatarNode} from './entities';

/**
 * Actors -- the local player, remote players, NPCs and the creation preview --
 * stay invisible until they can be drawn finished, then appear in one frame.
 *
 * buildAvatar hides the whole actor at birth (root disabled: body, hair,
 * equipment, weapon, cast orb, NPC hitbox, shadows, picking). It is revealed in
 * the onAfterAnimations of the first frame in which
 *   1. its production body, weapon and equipment for the current look are all
 *      attached (actorAssetsReady),
 *   2. animateAvatar has started a clip AND this frame's animate() evaluated
 *      it, so the bones hold that clip's pose, not the bind pose, and
 *   3. every mesh it is about to draw has its material compiled
 *      (Mesh.isReady(true)). A mesh whose shader is still compiling is skipped
 *      by the renderer, which would show the body for a frame without its
 *      clothes or its clothes without the body.
 * Revealing in onAfterAnimations is before the frame's active-mesh pass, so
 * that frame already draws it posed.
 *
 * WHY THE CLOCK IS STARTED HERE (MEASURED, Babylon 9.22.0): Scene._animate
 * returns without evaluating anything until the first frame on which
 * scene._pendingData is empty (animatable.core.js: `if (!_animationTimeLast)
 * { if (_pendingData.length > 0) return; ... }`). Every glb an actor or the
 * zone loads is pending data, so in a crowded city the clock did not start
 * for seconds after the first resident was dressed: every playing idle group
 * sat at the bind pose (Moonmere: bodies at 12 s, still T-posed until the
 * last equipment landed at 29 s). The gate only ever applies before the clock
 * first starts; Scene.resetLastAnimationTimeFrame is Babylon's own API for
 * starting it ("useful ... when animations start running when loading a scene
 * for the first time"). An actor whose own assets are ready therefore starts
 * the clock instead of waiting for every unrelated asset in the zone.
 *
 * NPC failures stay hidden (no placeholder, no underwear); tools/qa/
 * npc_failure.mjs expects that. A player is never left invisible: a known
 * failure shows what loaded at once (the procedural placeholder if the body
 * itself failed), and a hang is revealed after PLAYER_REVEAL_TIMEOUT_MS with a
 * warning.
 */
export const PLAYER_REVEAL_TIMEOUT_MS=45_000;

type Gate={npc:boolean;external?:boolean;assets:'loading'|'ready'|'failed';revealed:boolean;wanted:boolean;waiters:(()=>void)[];settled:(()=>void)[];timer?:ReturnType<typeof setTimeout>};
const gates=new WeakMap<AvatarNode,Gate>();
const pending=new WeakMap<Scene,Set<AvatarNode>>();
const clockStarted=new WeakSet<Scene>();
// whether the animation clock was running when this frame's animate() began
const evaluating=new WeakMap<Scene,boolean>();
// the revealed actor still standing in for a not-yet-ready rebuild of it
const standIns=new WeakMap<AvatarNode,AvatarNode>();

function watch(scene:Scene):Set<AvatarNode>{
  let set=pending.get(scene);if(set)return set;
  const waiting=set=new Set();pending.set(scene,waiting);
  scene.onBeforeAnimationsObservable.add(()=>evaluating.set(scene,clockStarted.has(scene)));
  scene.onAfterAnimationsObservable.add(()=>{
    if(!waiting.size||!evaluating.get(scene))return;
    for(const av of waiting){
      const gate=gates.get(av);
      if(!gate||av.root.isDisposed()){waiting.delete(av);continue;}
      if(gate.assets!=='ready'||!av.model||!(av.currentAnim||gate.external)||!meshesReady(av))continue;
      reveal(av,gate);
    }
  });
  return waiting;
}

function startClock(scene:Scene):void{
  if(clockStarted.has(scene)||scene.isDisposed)return;
  clockStarted.add(scene);scene.resetLastAnimationTimeFrame();
}

// Only meshes the reveal will actually draw: enabled up to the actor root
// (the root itself is the one switched off) and visible. The NPC hit capsule
// (visibility 0) and the disabled procedural placeholder are not drawn.
function meshesReady(av:AvatarNode):boolean{
  for(const mesh of av.root.getChildMeshes(false)){
    if(!mesh.isVisible||mesh.visibility<=0||!mesh.getTotalVertices())continue;
    let drawn=true;
    for(let n:Node|null=mesh;n&&n!==av.root;n=n.parent)if(!n.isEnabled(false)){drawn=false;break;}
    if(drawn&&!mesh.isReady(true))return false;
  }
  return true;
}

function settle(gate:Gate):void{gate.settled.splice(0).forEach(fn=>fn());}

function reveal(av:AvatarNode,gate:Gate):void{
  if(gate.revealed)return;
  gate.revealed=true;clearTimeout(gate.timer);settle(gate);
  pending.get(av.root.getScene())?.delete(av);
  if(!av.root.isDisposed())av.root.setEnabled(gate.wanted);
  gate.waiters.splice(0).forEach(fn=>fn());
}

/** Hide a freshly built actor until it is ready (called by buildAvatar). */
export function holdActor(av:AvatarNode,npc:boolean):void{
  const scene=av.root.getScene(),gate:Gate={npc,assets:'loading',revealed:false,wanted:true,waiters:[],settled:[]};
  gates.set(av,gate);av.root.setEnabled(false);watch(scene).add(av);
  if(!npc)gate.timer=setTimeout(()=>{
    if(gate.revealed||av.root.isDisposed())return;
    console.warn(`Avatar ${av.root.name} not ready after ${PLAYER_REVEAL_TIMEOUT_MS/1000} s; showing what loaded`,{body:!!av.model,assets:gate.assets,animation:av.currentAnim});
    showWhatLoaded(av,gate);
  },PLAYER_REVEAL_TIMEOUT_MS);
  av.root.onDisposeObservable.addOnce(()=>{clearTimeout(gate.timer);pending.get(scene)?.delete(av);settle(gate);});
}

function showWhatLoaded(av:AvatarNode,gate:Gate):void{
  // no production body: the procedural placeholder is better than nothing for a
  // player, who must be able to see where they are standing
  if(!av.model&&!av.proc.isDisposed())av.proc.setEnabled(true);
  reveal(av,gate);
}

/** Body, weapon and equipment for the current look are attached. */
export function actorAssetsReady(av:AvatarNode):void{
  const gate=gates.get(av);if(!gate||gate.revealed||av.root.isDisposed())return;
  gate.assets='ready';startClock(av.root.getScene());settle(gate);
}

/** Something the look needs failed to load. */
export function actorAssetsFailed(av:AvatarNode,reason:unknown):void{
  const gate=gates.get(av);if(!gate||gate.revealed||av.root.isDisposed())return;
  if(gate.npc){
    // NPCs stay hidden: a resident in underwear or a grey placeholder is worse
    // than an empty spot
    gate.assets='failed';pending.get(av.root.getScene())?.delete(av);settle(gate);
    console.warn(`NPC ${av.root.name} stays hidden: its look failed to load`,reason);
    return;
  }
  console.warn(`Avatar ${av.root.name} look incomplete; showing what loaded`,reason);
  // a body that did load still waits for its first pose: no bind pose
  if(av.model){gate.assets='ready';startClock(av.root.getScene());settle(gate);}
  else showWhatLoaded(av,gate);
}

/** For review tools that pose the skeleton themselves (goToFrame on their own
 * group) instead of through animateAvatar: reveal once dressed and compiled. */
export function actorPosedExternally(av:AvatarNode):void{
  const gate=gates.get(av);if(gate)gate.external=true;
}

/** Runs once the actor's own loading is over: dressed, failed, revealed or gone. */
export function whenActorSettled(av:AvatarNode,fn:()=>void):void{
  const gate=gates.get(av);
  if(!gate||gate.revealed||gate.assets!=='loading'||av.root.isDisposed())fn();else gate.settled.push(fn);
}

/** True once the actor has been revealed (actors built elsewhere always are). */
export function actorRevealed(av:AvatarNode|null|undefined):boolean{
  if(!av||av.root.isDisposed())return false;
  return gates.get(av)?.revealed??true;
}

/**
 * An NPC can be found and spoken to: drawn, or its look failed for good. A
 * failed NPC stays invisible (no underwear, no placeholder) but keeps its
 * nameplate, Tab target and E prompt, so a quest giver, vendor or trainer whose
 * outfit failed to load never blocks play -- the server still serves them.
 */
export function npcPresent(av:AvatarNode|null|undefined):boolean{
  if(actorDrawn(av))return true;
  return !!av&&!av.root.isDisposed()&&gates.get(av)?.assets==='failed';
}

/** Something is on screen for this actor: itself, or the old look it replaces. */
export function actorDrawn(av:AvatarNode|null|undefined):boolean{
  return !!av&&(actorRevealed(av)||actorRevealed(standIns.get(av)));
}

export function whenActorRevealed(av:AvatarNode,fn:()=>void):void{
  const gate=gates.get(av);
  if(!gate||gate.revealed)fn();else gate.waiters.push(fn);
}

/** The camera's own show/hide (first person, tight rooms) without revealing early. */
export function setActorShown(av:AvatarNode,show:boolean):void{
  const gate=gates.get(av);
  if(!gate)av.root.setEnabled(show);
  else{gate.wanted=show;if(gate.revealed)av.root.setEnabled(show);}
  const standIn=standIns.get(av);if(standIn)setActorShown(standIn,show);
}

/** The revealed actor standing in for `av` while `av` loads, if any. */
export function actorStandIn(av:AvatarNode):AvatarNode|undefined{return standIns.get(av);}

/**
 * Swap `old` for its rebuild `next` (a job, gear or race change) without a
 * gap: `old` keeps being drawn, posed and moved with `next` (animateAvatar
 * forwards to it) until `next` is revealed, and is disposed after that frame.
 * A rebuild of a rebuild that never showed hands the original stand-in on.
 */
export function handOffActor(old:AvatarNode,next:AvatarNode,dispose:(av:AvatarNode)=>void):void{
  let shown:AvatarNode|undefined=old;
  if(!actorRevealed(old)){shown=standIns.get(old);standIns.delete(old);dispose(old);}
  if(!shown||shown.root.isDisposed())return;
  if(actorRevealed(next)){dispose(shown);return;}
  standIns.set(next,shown);
  const gate=gates.get(next)!;
  setActorShown(shown,gate.wanted);
  next.root.onDisposeObservable.addOnce(()=>{if(standIns.get(next)===shown){standIns.delete(next);dispose(shown!);}});
  whenActorRevealed(next,()=>{
    if(standIns.get(next)!==shown)return;
    standIns.delete(next);
    // the frame being rendered draws `next`; drop the old look from it now
    // and free it once the frame is done
    if(!shown!.root.isDisposed())shown!.root.setEnabled(false);
    next.root.getScene().onAfterRenderObservable.addOnce(()=>dispose(shown!));
  });
}
