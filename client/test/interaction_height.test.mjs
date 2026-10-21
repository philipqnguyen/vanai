import test from 'node:test';
import assert from 'node:assert/strict';
import {onInteractionFloor,interactionHeight} from '../src/interaction_height.ts';

test('a ground NPC below the upper boughs cannot be addressed through the floor',()=>{
 const tamsin={x:-81,z:0},ground=()=>9.47234780105888;
 assert.equal(onInteractionFloor(24,tamsin,ground),false);
 assert.equal(onInteractionFloor(9.47,tamsin,ground),true);
});
test('explicit indoor floors override terrain while ordinary objects use rendered ground',()=>{
 const npc={x:1,z:2,y:12},ground=()=>-4;
 assert.equal(interactionHeight(npc,ground),12);
 assert.equal(onInteractionFloor(12,npc,ground),true);
 assert.equal(onInteractionFloor(-4,npc,ground),false);
 assert.equal(onInteractionFloor(0,{x:1,z:2,y:0},ground),true);
 assert.equal(onInteractionFloor(-4,{x:1,z:2},ground),true);
});
test('every sited NPC is on offer from its own server floor and from no other',async()=>{
 const {readFile}=await import('node:fs/promises');
 const zones=JSON.parse(await readFile(new URL('../../shared/data/zones.json',import.meta.url),'utf8'));
 let checked=0;
 for(const [key,zone] of Object.entries(zones))for(const npc of zone.npcs??[]){
  if(!npc.site)continue;
  const floors=zone.sites[npc.site].floors,ground=()=>{throw Error('a sited NPC carries its own height');};
  floors.forEach((y,floor)=>assert.equal(onInteractionFloor(y,npc,ground),floor===npc.floor,`${key}/${npc.id} from floor ${floor}`));
  checked++;
 }
 assert.ok(checked>=20,`only ${checked} sited NPCs`);
});
