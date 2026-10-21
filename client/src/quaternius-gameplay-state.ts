// Playback policy. Original source clips stay available alongside the approved sword adaptation.
export type QClip = { key: string; seconds: number; loop: boolean };
const clip = (pack: string, name: string, seconds: number, loop = false): QClip => ({key:`${pack}:${name}`,seconds,loop});
export const ADAPTED_SWORD = clip('vanai','Sword_Light_Adapted_v02',46/30);
// Philip, 2026-10-14: the default stance stands straighter and relaxed, with only
// a slow side-to-side sway (the maker's tools/animations/bake_idle.py; one loop).
export const STAND_IDLE = clip('vanai','Idle_Stand_v01',4,true);
export const Q = {
  idle: clip('ual1','Idle_Loop',2.5,true), walk: clip('ual1','Walk_Loop',40/30,true),
  run: clip('ual1','Sprint_Loop',20/30,true), takeoff: clip('ual1','Jump_Start',40/30), land: clip('ual1','Jump_Land',38/30), air: clip('ual1','Jump_Loop',2.5,true),
  sitIn: clip('ual1','GroundSit_Enter',2.5), sit: clip('ual1','GroundSit_Idle_Loop',40/30,true),
  sitOut: clip('ual1','GroundSit_Exit',65/30), death: clip('ual1','Death01',2.4),
  cheer: clip('ual1','Celebration',4), castIn: clip('ual1','Spell_Simple_Enter',16/30),
  cast: clip('ual1','Spell_Simple_Idle_Loop',2.1,true), castOut: clip('ual1','Spell_Simple_Exit',13/30),
  shoot: clip('ual1','Spell_Simple_Shoot',.5), sword: clip('ual1','Sword_Attack_Standing',46/30),
  regular: clip('ual2','Sword_Regular_A',13/30), regularOut: clip('ual2','Sword_Regular_A_Rec',29/30),
  heavy: clip('ual2','Sword_Heavy_A',22/30), heavyOut: clip('ual2','Sword_Heavy_A_Rec',1),
  punch: clip('ual1','Punch_Cross',1),
};
// A melee swing uses the weapon in hand. Philip, 2026-10-14: a mage hits with
// the staff or club; the open-hand Spell_Simple_Shoot is for spells only
// (attack(..., spell=true)). The staff takes the cudgel's overhead strike.
export const Q_ATTACKS: Record<string,QClip[]> = {
  PLD:[Q.sword], SAM:[Q.regular,Q.regularOut], DRK:[Q.heavy,Q.heavyOut],
  BLM:[Q.sword], WHM:[Q.sword], MNK:[Q.punch],
};
type Action = {kind:string; clips:QClip[]; index:number; until:number};
/** Complete stationary actions at 1×; never let visual queues delay real input. */
export class QuaterniusPlayback {
  // A prepared production rig carries the maker's derived clips (sword-motion.ts);
  // legacy q02 previews fall back to the source clips.
  private readonly adaptedSword:boolean;
  private readonly idle:QClip;
  constructor(adaptedSword=false) { this.adaptedSword=adaptedSword; this.idle=adaptedSword?STAND_IDLE:Q.idle; }
  active?: Action;
  pending?: {clips:QClip[]; at:number};
  private lastInput='idle';
  private wasCasting=false;
  revision=0;
  attack(job:string,now:number,spell=false):void {
    this.pending={clips:spell?[Q.shoot]:(this.adaptedSword&&job==='PLD'?[ADAPTED_SWORD]:(Q_ATTACKS[job]??Q_ATTACKS.PLD)),at:now};
  }
  private begin(kind:string,clips:QClip[],now:number):void {
    this.active={kind,clips,index:0,until:now+clips[0].seconds};this.revision++;
  }
  update(input:string,now:number,casting:boolean):QClip {
    input=input.toLowerCase();
    // User-approved temporary fallback; both local and replicated Wave use
    // the same unmodified celebration and its normal interruption rules.
    if(input==='emote:wave')input='emote:cheer';
    const previous=this.lastInput;this.lastInput=input;
    if(input==='dead'){
      this.pending=undefined;this.wasCasting=false;
      if(this.active?.kind!=='dead')this.begin('dead',[Q.death],now);
      return Q.death; // The adapter holds the final pose, never repeats the fall.
    }
    if(previous==='dead'){this.active=undefined;this.revision++;}
    const moving=input==='run'||input==='walk';
    if(input.startsWith('jump')){
      this.active=undefined;this.pending=undefined;this.wasCasting=false;
      return input==='jump:start'?Q.takeoff:input==='jump:land'?Q.land:input.startsWith('jump')?Q.air:input==='walk'?Q.walk:Q.run;
    }
    // Landing is an interruptible visual action, not a latched movement state.
    // Any new movement, jump, rest, cast or attack can replace it immediately.
    if(previous.startsWith('jump')&&input==='idle'&&!casting&&!this.pending)this.begin('landing',[Q.land],now);
    if(moving&&this.active&&!['attack','cast','cast-exit'].includes(this.active.kind))this.active=undefined;
    if(this.pending&&now-this.pending.at>.75)this.pending=undefined;
    if(this.active&&!this.active.clips[this.active.index].loop&&now>=this.active.until){
      this.active.index++;
      if(this.active.index<this.active.clips.length){this.active.until=now+this.active.clips[this.active.index].seconds;this.revision++;}
      else this.active=undefined;
    }
    if(this.pending&&this.active?.kind!=='attack'){
      this.begin('attack',this.pending.clips,now);this.pending=undefined;this.wasCasting=false;
    }
    if(this.active?.kind==='attack')return this.active.clips[this.active.index];
    if(casting){
      this.wasCasting=true;
      if(this.active?.kind!=='cast')this.begin('cast',[Q.castIn,Q.cast],now);
      return this.active!.clips[this.active!.index];
    }
    if(this.wasCasting){this.wasCasting=false;this.begin('cast-exit',[Q.castOut],now);}
    if(moving)return this.active?.clips[this.active.index]??(input==='walk'?Q.walk:Q.run);
    if(input==='rest'){
      if(this.active?.kind!=='sit')this.begin('sit',[Q.sitIn,Q.sit],now);
      return this.active!.clips[this.active!.index];
    }
    if(previous==='rest'&&this.active?.kind==='sit')this.begin('stand',[Q.sitOut],now);
    if(input==='emote:cheer'&&previous!==input)this.begin('cheer',[Q.cheer],now);
    return this.active?.clips[this.active.index]??this.idle;
  }
}
