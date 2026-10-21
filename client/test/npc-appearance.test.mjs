import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NPC_BODIES,npcAppearance,npcPresentation} from '../src/npc-appearance.ts';
import {NPC_WARDROBES} from '../src/npc-outfits.ts';
import {appearanceChoice} from '../src/appearance.ts';
import {selectEquipment} from '../src/gear/selection.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const zones=read('../../shared/data/zones.json');
const items=read('../../shared/data/items.json');
import {gear,readJson} from './runtime-assets.mjs';
const characters=readJson('models/characters/manifest.json');
const catalog=gear.catalog;
const population=Object.entries(zones).flatMap(([zone,definition])=>(definition.npcs??[]).map(npc=>({...npc,zone})));

test('every NPC receives a supported production body and valid saved appearance',()=>{
  const supported=characters.filter(r=>/^characters\/[^/]+\/body\.glb$/.test(r.file)).map(r=>r.file.split('/')[1]).sort();
  assert.deepEqual(NPC_BODIES.map(([race,face])=>`${race}-${face}`).sort(),supported);
  assert.deepEqual(Object.keys(catalog.bodies).sort(),supported);
  // 146 authored NPCs plus 89 resident flavor NPCs. Each city holds 40, plus
  // one job-gear hall vendor and two job-guild masters; Reed-Seller Mab is on
  // the Moonmere Shores; and Caerdun's lighthouse keeper, whom cd1 names
  // (Philip's ruling CF-18, 2026-10-08), makes Caerdun's 44.
  // The auction houses' brokers are counted apart (Philip, 2026-10-11: each city's house
  // a building with several brokers' counters, built city by city): everyone else as
  // before -- 235 less the one broker each of the four cities had then. The
  // returned Capital's morning took 21 more townsfolk (Philip, 2026-10-18).
  const people=population.filter(n=>n.kind!=='auction');
  assert.equal(people.length,252);
  assert.equal(population.filter(n=>n.resident).length,89);
  for(const [city,n] of [['caerdun',43],['heartwood',42],['moonmere',42]])assert.equal(people.filter(q=>q.zone===city).length,n,city);
  // and every broker stands in one of the four cities with an auction house
  assert.deepEqual([...new Set(population.filter(n=>n.kind==='auction').map(n=>n.zone))].sort(),['caerdun','capitalreturned','heartwood','moonmere']);
  assert.equal(new Set(population.map(n=>n.id)).size,population.length);
  assert.equal(new Set(population.map(n=>n.zone)).size,20);
  assert.deepEqual([...new Set(population.map(n=>n.kind))].sort(),['auction','flavor','quest','sanctuary','vendor']);
  assert.equal(population.filter(n=>n.zone==='capital').length,4);
  assert.equal(people.filter(n=>n.zone==='capitalreturned').length,38);
  for(const npc of population){
    const actual=npcAppearance(npc);
    assert.ok(supported.includes(actual.body),npc.id);
    if(npc.body)assert.equal(actual.body,npc.body,npc.id);
    assert.equal(actual.body,`${actual.race}-${actual.appearance.face}`,npc.id);
    assert.deepEqual(actual.appearance,appearanceChoice(actual.race,actual.appearance),npc.id);
  }
});

test('existing NPC identities remain fixed across order, additions and service or location changes',()=>{
  const before=new Map(population.map(n=>[n.id,npcAppearance(n)]));
  for(const npc of [{id:'a_future_resident'},...population.toReversed(),{id:'another_future_resident'}]){
    if(!before.has(npc.id))continue;
    assert.deepEqual(npcAppearance(npc),before.get(npc.id),npc.id);
    // An unpinned record looks exactly like its bare id.
    if(!npc.body&&!npc.likeness)assert.deepEqual(npcAppearance(npc.id),before.get(npc.id),npc.id);
    const moved={...npc,name:'Changed display name',zone:'another_zone',kind:'sanctuary'};
    const {race,appearance,body}=npcPresentation(moved,moved.kind);
    assert.deepEqual({race,appearance,body},before.get(npc.id),npc.id);
  }
  // A caller editing a returned appearance must not mutate a shared identity.
  const grett=population.find(n=>n.id==='marshal_grett');
  const edited=npcAppearance(grett);edited.appearance.face='male';
  assert.deepEqual(npcAppearance(grett),before.get('marshal_grett'));
});

test('v1 identity samples pin all eight bodies independently of the hash implementation',()=>{
  const samples=[
    ['gate_sergeant_ottey','rasha','female','waves'],
    ['paymaster_vail','valdren','male','cascade'],
    ['marshal_grett','aedri','male','waves'],
    ['duelist_sabel_cd','nym','female','tousled'],
    ['lord_marshal','valdren','female','braid'],
    ['armourer_brann','nym','male','tousled'],
    ['drillmaster_hal','aedri','female','braid'],
    ['guildmaster_torv','karrog','male','braid',false],
    ['master_of_arms','nym','female','bun'],
  ];
  for(const [id,race,face,hair,beard] of samples){
    assert.deepEqual(npcAppearance(id),{race,body:`${race}-${face}`,appearance:{face,hair,...(beard===undefined?{}:{beard})}},id);
  }
});

test('body pins override only the sex the story fixes, and a pin with no production body fails',()=>{
  // Bare ids still hash: the samples above stay true for these unpinned lookups.
  for(const [id,body] of [['marshal_grett','aedri-female'],['lord_marshal','valdren-male'],['drillmaster_hal','aedri-male'],['grocer_nell','aedri-female'],['auntie_wren','valdren-female'],['ostler_bram','aedri-male']]){
    const npc=population.find(n=>n.id===id);
    assert.equal(npc.body,body,id);
    assert.equal(npcAppearance(npc).body,body,id);
    assert.notEqual(npcAppearance(id).body,body,`${id} pin is redundant`);
  }
  for(const body of ['rasha-male','karrog-female','elf-male'])assert.throws(()=>npcAppearance({id:'x',body}),/unsupported body pin/);
  // Names and titles that say the sex outright.
  for(const npc of population){
    const face=npcAppearance(npc).appearance.face;
    if(/\b(Mother|Auntie|Widow|Goodwife|Woman|Granddaughter)\b/.test(npc.name))assert.equal(face,'female',npc.id);
    if(/\b(Watchman|Coachman|Ferryman)\b/.test(npc.name.replace(/Ferryman's/,'')))assert.equal(face,'male',npc.id);
  }
});

test('a recurring character looks the same in every zone',()=>{
  const groups=new Map();
  for(const npc of population)if(npc.likeness)(groups.get(npc.likeness)??groups.set(npc.likeness,[]).get(npc.likeness)).push(npc);
  assert.deepEqual([...groups.keys()].sort(),['archivist_junn_mm','duelist_sabel_cd','grudgekeeper_morrow_hw','regent_walls','sentinel_411']);
  for(const [main,copies] of groups){
    const original=population.find(n=>n.id===main),look=npcAppearance(original);
    assert.ok(!original.likeness&&original.body,main);
    for(const npc of copies)assert.deepEqual(npcAppearance(npc),look,npc.id);
    // Every record under one of the group's names is in it, so none was left on its own hash.
    const names=new Set([original,...copies].map(n=>n.name));
    assert.deepEqual(population.filter(n=>names.has(n.name)).map(n=>n.id).sort(),[main,...copies.map(n=>n.id)].sort(),main);
  }
});

test('the whole population has a varied distribution without race or sex gaps',()=>{
  const counts=Object.fromEntries(NPC_BODIES.map(([race,face])=>[`${race}-${face}`,0]));
  for(const npc of population)counts[npcAppearance(npc).body]++;
  const mean=population.length/NPC_BODIES.length;
  for(const [body,count] of Object.entries(counts))assert.ok(count>=mean*.5&&count<=mean*1.6,`${body}: ${count}`);
  for(const zone of ['caerdun','heartwood','moonmere','capital','capitalreturned']){
    const residents=population.filter(n=>n.zone===zone);
    assert.ok(new Set(residents.map(n=>npcAppearance(n).body)).size>=Math.min(3,residents.length),zone);
  }
});

// Role outfits (npc-outfits.ts; Philip 2026-10-12: a variety of gear by role,
// never everyone in the level-1 set; every NPC has hair).
test('every NPC dresses for its role in gear fitted to its body, never the starter set',()=>{
  const fitted=new Set(Object.keys(catalog.bodies['aedri-male'].items));
  for(const [role,{looks}] of Object.entries(NPC_WARDROBES))for(const look of looks){
    for(const [key,slot] of [['b','body'],['l','legs'],['f','feet']]){
      assert.equal(items[look[key]]?.slot,slot,`${role}: ${look[key]}`);
      assert.ok(fitted.has(look[key]),`${role}: ${look[key]} has no fitted model`);
      assert.ok(!look[key].startsWith('traveler_'),`${role}: ${look[key]} is the starter set`);
    }
    if(look.w)assert.ok(items[look.w]?.wtype,`${role}: ${look.w} is not a weapon`);
  }
  for(const npc of population){
    const {body,job,look,role,appearance}=npcPresentation(npc,npc.kind);
    assert.notEqual(appearance.hair,'none',`${npc.id} is bald`);
    assert.ok(NPC_WARDROBES[role],`${npc.id}: unknown role ${role}`);
    assert.deepEqual(selectEquipment(body,look,catalog.bodies[body]).map(([id])=>id).sort(),[look.b,look.l,look.f].sort(),npc.id);
    assert.equal(job,look.w?{sword:'PLD',katana:'SAM',greatsword:'DRK',staff:'BLM',cudgel:'WHM',handwraps:'MNK'}[items[look.w].wtype]:'WHM',npc.id);
    if(npc.outfit)assert.equal(role,npc.outfit,npc.id);
  }
  // a recurring character wears the same outfit in every zone
  for(const npc of population.filter(n=>n.likeness)){
    const original=population.find(n=>n.id===npc.likeness);
    assert.deepEqual(npcPresentation(npc,npc.kind).look,npcPresentation(original,original.kind).look,npc.id);
  }
  // and a city is not one outfit: many different body pieces on its streets
  for(const city of ['caerdun','heartwood','moonmere','capitalreturned']){
    const residents=population.filter(n=>n.zone===city);
    assert.ok(new Set(residents.map(n=>npcPresentation(n,n.kind).look.b)).size>=Math.min(12,residents.length/2),city);
  }
});
