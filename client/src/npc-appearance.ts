import {appearanceChoice, type CharacterAppearance} from './appearance.ts';
import {npcOutfit,type NpcRoleRecord} from './npc-outfits.ts';

// Fixed order is part of the NPC identity contract. Adding residents or changing
// their zone, name or service must not reshuffle existing appearances.
export const NPC_BODIES = [
  ['aedri','male'], ['aedri','female'], ['nym','male'], ['nym','female'],
  ['rasha','female'], ['valdren','male'], ['valdren','female'], ['karrog','male'],
] as const;

/** The appearance fields of a zones.json NPC record. Both overrides are
 * optional and absent on almost every NPC, whose look stays the hash of its id.
 * `body` pins the body where the story fixes the person's sex and the hash
 * disagrees (a "she" in every quest must not be drawn as a man).
 * `likeness` names the record whose id seeds the hashes instead, so one
 * recurring character (Sabel, Morrow, Junn ...) placed under a different id in
 * every zone keeps the same hair and beard everywhere. A recurring record
 * repeats its likeness's body pin; tools/data/audit.py holds them equal. */
export interface NpcIdentity extends NpcRoleRecord {body?:string;likeness?:string}

function hash(key:string):number {
  let h=2166136261;
  for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
  h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);
  return (h^(h>>>16))>>>0;
}
/** A bare id is an unpinned NPC; pass the whole record wherever it is at hand. */
export function npcAppearance(npc:string|NpcIdentity) {
  const record=typeof npc==='string'?{id:npc}:npc,key=record.likeness??record.id;
  let [race,face]:readonly [string,string]=NPC_BODIES[hash('npc-body-v1:'+key)%NPC_BODIES.length];
  if(record.body){
    const pinned=NPC_BODIES.find(([r,f])=>`${r}-${f}`===record.body);
    if(!pinned)throw new Error(`NPC ${record.id}: unsupported body pin ${record.body}`);
    [race,face]=pinned;
  }
  const style=hash('npc-hair-v1:'+key);
  const appearance:CharacterAppearance=appearanceChoice(race,{face:face as 'male'|'female'})!;
  // Every NPC has hair (Philip, 2026-10-12): no bald roll.
  if(race==='nym'&&style%2===0)appearance.hair='bun';
  if(race==='karrog')appearance.beard=hash('npc-beard-v1:'+key)%4!==0;
  return {race,appearance,body:`${race}-${face}`};
}
/** The record's role dresses it (npc-outfits.ts): pass the whole record so
 * its name, title, kind and `outfit` are read. A bare id gets townsfolk wear. */
export function npcPresentation(npc:string|NpcIdentity,kind?:string) {
  const record:NpcIdentity=typeof npc==='string'?{id:npc,kind}:{kind,...npc},key=record.likeness??record.id;
  const {role,look,job}=npcOutfit(record,hash('npc-outfit-v1:'+key));
  return {...npcAppearance(npc),role,job,look};
}
