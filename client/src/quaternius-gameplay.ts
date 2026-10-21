import {type AnimationGroup} from '@babylonjs/core';
import type {AvatarNode} from './entities';
import {attachForearmInstance} from './forearm-twist';
import {SWORD_MOTION_KEY,IDLE_MOTION_KEY} from './sword-motion';
import {Q,QuaterniusPlayback} from './quaternius-gameplay-state';

type Player = {policy:QuaterniusPlayback;revision:number;group?:AnimationGroup;outgoing?:AnimationGroup;blendAt?:number;mode?:string;sourceStartedAt?:number;upper:Map<string,AnimationGroup>;lower:Map<string,AnimationGroup>;base?:AnimationGroup;restore?:()=>void;dispose?:()=>void;locomotion?:string};
const players=new WeakMap<AvatarNode,Player>();
const lowerBone=(name:string)=>/^(root|pelvis|thigh_|calf_|foot_|ball_|tail)/.test(name);
function masked(group:AnimationGroup,keepLower:boolean):AnimationGroup {
  const result=group.clone(`${group.name} ${keepLower?'locomotion':'upper body'}`);
  for(const t of [...result.targetedAnimations])if(lowerBone(t.target.name)!==keepLower)result.removeTargetedAnimation(t.animation);
  return result;
}
export function disposeQuaternius(av:AvatarNode):void {
  const p=players.get(av);if(!p)return;
  p.dispose?.();p.upper.forEach(g=>g.dispose());p.lower.forEach(g=>g.dispose());players.delete(av);
}
export function registerQuaternius(av:AvatarNode,hooks?:{restore:()=>void;dispose:()=>void}):void {
  disposeQuaternius(av);
  const supported=!!av.model?.groups.has(SWORD_MOTION_KEY);
  const skeleton=av.model?.root.getChildMeshes().find(m=>m.skeleton)?.skeleton;
  const allowed=new Set([...Object.values(Q).map(c=>c.key),SWORD_MOTION_KEY,IDLE_MOTION_KEY]);
  const twist=supported&&skeleton?attachForearmInstance(skeleton,()=>allowed.has(av.currentAnim)):undefined;
  const dispose=()=>{twist?.dispose();hooks?.dispose();};
  av.model?.root.onDisposeObservable.addOnce(()=>disposeQuaternius(av));
  players.set(av,{policy:new QuaterniusPlayback(supported),revision:-1,upper:new Map(),lower:new Map(),restore:hooks?.restore,dispose});av.currentAnim='';
}
export function quaterniusLocomotion(av:AvatarNode):string {return players.get(av)?.locomotion??'';}
export function quaterniusAttack(av:AvatarNode,now:number,spell=false):boolean{
  const player=players.get(av);if(!player)return false;
  player.policy.attack(av.jobRef,now,spell);return true;
}
export function animateQuaternius(av:AvatarNode,input:string,now:number):boolean{
  const player=players.get(av);if(!player||!av.model)return false;
  player.restore?.();
  if(input==='dead')av.castingUntil=0;
  const casting=av.castingUntil>now&&input!=='dead';
  const desired=player.policy.update(input,now,casting);
  const moving=input==='run'||input==='walk';
  const locomotion=`ual1:${input==='walk'?'Walk_Loop':'Sprint_Loop'}`;
  const layered=moving&&desired.key!==locomotion;
  const mode=layered?'moving':'whole';
  player.locomotion=moving?locomotion:'';
  if(av.currentAnim!==desired.key||player.revision!==player.policy.revision||player.mode!==mode){
    const sameAction=av.currentAnim===desired.key&&player.revision===player.policy.revision;
    // A channel may end before the clip (and hold its last key). Its masterFrame
    // is therefore not a clip clock; use elapsed source time when changing masks.
    const sourceFps=player.group?.targetedAnimations[0]?.animation.framePerSecond??60;
    const elapsed=Math.max(0,now-(player.sourceStartedAt??now));
    const previousFrame=sameAction?(desired.loop?elapsed%desired.seconds:Math.min(elapsed,desired.seconds))*sourceFps:
      moving&&!layered?player.base?.animatables[0]?.masterFrame:undefined;
    player.outgoing?.stop();
    player.outgoing=player.group?.isPlaying?player.group:undefined;
    if(player.outgoing)player.outgoing.setWeightForAllAnimatables(1);
    player.blendAt=now;
    const source=av.model.groups.get(desired.key);
    if(!source)throw new Error(`Missing Quaternius gameplay clip ${desired.key}`);
    let group=source;
    if(layered){
      group=player.upper.get(desired.key)??masked(source,false);player.upper.set(desired.key,group);
    }
    if(group===player.outgoing){group.stop();player.outgoing=undefined;}
    group.start(desired.loop,1,group.from,group.to);
    if(previousFrame!==undefined)group.goToFrame(previousFrame);
    group.setWeightForAllAnimatables(player.outgoing?0:1);
    if(!sameAction)player.sourceStartedAt=now;
    player.group=group;player.revision=player.policy.revision;player.mode=mode;av.currentAnim=desired.key;
  }
  if(layered){
    const base=player.lower.get(locomotion)??masked(av.model.groups.get(locomotion)!,true);player.lower.set(locomotion,base);
    if(player.base!==base){player.base?.stop();player.base=base;}
    if(!base.isPlaying){
      const phase=av.model.groups.get(locomotion)?.animatables[0]?.masterFrame??0;
      base.start(true,1);base.goToFrame(phase);
    }
  }
  if(player.outgoing&&player.group){
    const weight=Math.min(1,(now-player.blendAt!)/.10);
    player.group.setWeightForAllAnimatables(weight);player.outgoing.setWeightForAllAnimatables(1-weight);
    player.base?.setWeightForAllAnimatables(layered?weight:1-weight);
    if(weight===1){player.outgoing.stop();player.outgoing=undefined;if(!layered){player.base?.stop();player.base=undefined;}}
  }else if(player.base){
    if(layered)player.base.setWeightForAllAnimatables(1);
    else{player.base.stop();player.base=undefined;}
  }
  // Babylon's completed non-loop group keeps its final evaluated pose. Pin the
  // death end explicitly so future animation mixer behavior cannot reset it.
  if(input==='dead'&&player.group&&!player.group.isPlaying)player.group.goToFrame(player.group.to);
  av.castOrb.setEnabled(casting);
  return true;
}

export function quaterniusPlaybackInfo(av:AvatarNode):unknown {
  if(!import.meta.env.DEV)return;
  const p=players.get(av);if(!p)return;
  return {mode:p.mode,action:av.currentAnim,frame:p.sourceStartedAt===undefined?undefined:(performance.now()/1000-p.sourceStartedAt)*(p.group?.targetedAnimations[0]?.animation.framePerSecond??60),
    actionSpeed:p.group?.speedRatio,base:p.base?.name,baseSpeed:p.base?.speedRatio,
    upperTargets:p.group?.targetedAnimations.map(t=>t.target.name),
    lowerTargets:p.base?.targetedAnimations.map(t=>t.target.name)};
}
