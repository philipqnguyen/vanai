import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {selectEquipment} from '../src/gear/selection.ts';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
import {gear,readPath,readJson,readPin,sourceSha} from './runtime-assets.mjs';
const manifest=gear.catalog,current=readJson('design/gear/fitting/production/current.json').selections,items=read('shared/data/items.json');
test('catalog contains every current item/body and preserves primary selection and source-domain pairing',()=>{
 const seen=new Set();const kinds=new Set();
 for(const [body,m] of Object.entries(manifest.bodies))for(const [id,e] of Object.entries(m.items)){
  const key=id+'/'+body,r=current[key];assert.ok(r,key);seen.add(key);const pin=r.variant.model;
  assert.ok(e.components.some(c=>(c.model??c.config)?.sha256===pin.sha256),key);
  const look={[{body:'b',legs:'l',feet:'f'}[e.slot]]:id,h:id};assert.deepEqual(selectEquipment(body,look,m).map(([id])=>id),[id]);
  assert.deepEqual(selectEquipment(body,{h:id},m),[]);
  const domain=JSON.parse(readPin(e.domain));assert.equal(domain.source.glb_sha256,m.source.sha256,key);assert.equal(domain.garment_sha256,e.components.find(c=>c.faceMap)?.model.sha256??pin.sha256,key);
  const protectedFaces=new Set(domain.protected_faces??[]);assert.ok(!domain.whole_faces.some(f=>protectedFaces.has(f))&&!domain.partial.some(p=>protectedFaces.has(p.face)),key);
  for(const c of e.components){kinds.add(c.kind);if(c.kind==='collar')assert.ok(c.boundaries&&c.artwork);if(c.config&&!c.coordinated)assert.ok(c.artwork);if(c.kind==='leg_armor')assert.ok(c.mounts);}
 }
 assert.equal(Object.keys(manifest.bodies).length,8);assert.deepEqual([...seen].sort(),Object.keys(current).filter(k=>['body','legs','feet'].includes(items[k.split('/')[0]]?.slot)).sort());
 for(const kind of ['collar','sleeves','mantle','shoulders','torso_drape','leg_drape','leg_armor','native_robe','coordinated_sleeves'])assert.ok(kinds.has(kind),kind);
});
