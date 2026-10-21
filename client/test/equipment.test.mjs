import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {selectEquipment} from '../src/gear/selection.ts';
import {gear,readPath,readJson,readPin,sourceSha} from './runtime-assets.mjs';
const manifest=gear.traveler;
const full={b:'traveler_tunic',l:'traveler_slops',f:'traveler_boots',h:'traveler_hood'};
test('equipment selection uses actual equipped item and exact supported native body, never headgear or fallback',()=>{
 assert.deepEqual(selectEquipment('aedri-male',full,manifest).map(([id])=>id),['traveler_tunic','traveler_slops','traveler_boots']);
 for(const body of ['aedri-female','nym-male','rasha-female'])assert.deepEqual(selectEquipment(body,full,manifest),[]);
 assert.deepEqual(selectEquipment('aedri-male',{},manifest),[]);
 assert.deepEqual(selectEquipment('aedri-male',{b:'traveler_boots',h:'traveler_tunic',l:'missing'},manifest),[]);
 assert.deepEqual(selectEquipment('aedri-male',{...full,b:'fieldhand_robe'},manifest).map(([id])=>id),['traveler_slops','traveler_boots']);
});
test('runtime assets retain exact current approved models and source body; every exported byte is pinned',()=>{
 const current=readJson('design/gear/fitting/production/current.json').selections;
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(sourceSha(manifest.source.path.replace(/^client\/public\//,'')),manifest.source.sha256);
 // every pin ships as approved, or as a packed copy made from it (the index lists it under its hash)
 function check(v){if(v&&typeof v==='object'){if(v.url){const data=readPin(v);if(data){assert.equal(data.length,v.bytes);assert.equal(sha(data),v.sha256);}}Object.values(v).forEach(check);}}
 check(manifest);
 for(const [id,entry] of Object.entries(manifest.items)){
  const row=current[id+'/aedri-male'];assert.equal(entry.components[0].model.sha256,row.variant.model.sha256);
  assert.equal(entry.acceptance.path,row.variant.acceptance??row.acceptance);
  assert.equal(sha(readPath(entry.acceptance.path)),entry.acceptance.sha256);
  const domain=JSON.parse(readPin(entry.domain));
  assert.equal(domain.source.glb_sha256,manifest.source.sha256);assert.equal(domain.garment_sha256,entry.components[0].model.sha256);
  assert.ok(domain.whole_faces.length>0);
 }
});
