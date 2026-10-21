import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {Q} from '../src/quaternius-gameplay-state.ts';
import {quaterniusBladeRoll} from '../src/quaternius-weapon-grip.ts';
import {readPath,sourceSha} from './runtime-assets.mjs';
const manifest=JSON.parse(readPath('models/characters/manifest.json')),model=file=>readPath('models/'+file);
const models=new Map();
for(const record of manifest){const bytes=model(record.file);models.set(record.file,JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))));}
test('all seventeen optimized avatar derivatives are present and retain approved hashes',()=>{
 assert.equal(manifest.length,17);
 // each ships as the file the manifest pins (or a packed copy made from it), within the size budget
 for(const record of manifest){assert.ok(record.bytes<(/characters\/(rasha|karrog)-/.test(record.file)?13_000_000:11_000_000));assert.equal(sourceSha('models/'+record.file),record.sha256,record.file);}
});
test('Aedri, Nym, Valdren and the female Rasha supply all 21 complete mapped clip durations',()=>{
 for(const [label,model]of ['aedri','nym','rasha','valdren','karrog'].flatMap(race=>(race==='rasha'?['female']:race==='karrog'?['male']:['male','female']).map(face=>[`${race}-${face}`,models.get(`characters/${race}-${face}/body.glb`)]))){
  assert.equal(model.animations.length,21,label);
  for(const clip of Object.values(Q)){const a=model.animations.find(a=>a.name===clip.key);assert.ok(a,`${label} ${clip.key}`);const duration=a.duration??Math.max(...a.samplers.map(s=>model.accessors[s.input].max[0]));assert.ok(Math.abs(duration-clip.seconds)<1e-5,`${label} ${clip.key}`);}
 }
});
test('Aedri hair remains a separate asset, with only braid bound to body joint indices',()=>{
 const body=models.get('characters/aedri-female/body.glb'),hair=models.get('characters/aedri-female/braid.glb');
 assert.deepEqual(hair.skins[0].joints.map(i=>hair.nodes[i].name),body.skins[0].joints.map(i=>body.nodes[i].name));
 assert.equal(hair.animations?.length??0,0);assert.equal(models.get('characters/aedri-male/waves.glb').skins?.length??0,0);
});
test('quarter-turn handle roll applies once to mapped blades for mapped avatar variants only',()=>{
 for(const variant of ['aedri-quaternius','nym-quaternius','rasha-quaternius','valdren-quaternius','karrog-quaternius'])for(const type of ['sword','katana','greatsword'])assert.equal(quaterniusBladeRoll(variant,type),type==='katana'?-Math.PI/2:Math.PI/2);
 for(const variant of ['aedri-quaternius','nym-quaternius','rasha-quaternius','valdren-quaternius','karrog-quaternius'])for(const type of ['staff','cudgel','handwraps',undefined])assert.equal(quaterniusBladeRoll(variant,type),0);
 for(const variant of [undefined,'smallfolk-v10','smallfolk-v11','smallfolk-v12','smallfolk-quaternius'])assert.equal(quaterniusBladeRoll(variant,'sword'),0);
});

test('both new Nym bodies use fresh complete rigs and removable Head-local hair',()=>{for(const face of ['male','female']){const body=models.get(`characters/nym-${face}/body.glb`),hair=models.get(`characters/nym-${face}/hair.glb`);assert.equal(body.skins[0].joints.length,65);assert.ok(body.nodes.some(n=>n.name==='handslot.r'));assert.ok(body.nodes.some(n=>n.name==='handslot.l'));assert.equal(hair.skins?.length??0,0);assert.equal(hair.animations?.length??0,0);assert.ok(hair.meshes.length>0);assert.ok(!body.nodes.some(n=>/^head_male|head_female|tail/.test(n.name)));}});

test('Rasha keeps removable hair and a source-driven tail without added motion channels',()=>{const body=models.get('characters/rasha-female/body.glb'),hair=models.get('characters/rasha-female/hair.glb');assert.equal(body.skins[0].joints.length,72);assert.equal(body.nodes.filter(n=>/^tail_/.test(n.name)).length,7);for(const a of body.animations)assert.ok(a.channels.every(c=>!/^tail_/.test(body.nodes[c.target.node].name)));assert.equal(hair.skins?.length??0,0);assert.equal(hair.animations?.length??0,0);});

test('promoted GLBs contain every buffer and image without authoring-file dependencies',()=>{for(const [file,g]of models){for(const b of g.buffers??[])assert.equal(b.uri,undefined,file);for(const im of g.images??[])assert.ok(Number.isInteger(im.bufferView)&&im.uri===undefined,file);}});

test('both Valdren hairstyles share body joint order and inverse binds; female is approved v10',()=>{
 for(const face of ['male','female']){const body=models.get(`characters/valdren-${face}/body.glb`),hair=models.get(`characters/valdren-${face}/hair.glb`);assert.equal(body.skins[0].joints.length,65);assert.deepEqual(hair.skins[0].joints.map(i=>hair.nodes[i].name),body.skins[0].joints.map(i=>body.nodes[i].name));assert.equal(hair.animations?.length??0,0);
 const bind=(g,file)=>{const a=g.accessors[g.skins[0].inverseBindMatrices],v=g.bufferViews[a.bufferView],bytes=model(file),offset=28+bytes.readUInt32LE(12)+(v.byteOffset??0)+(a.byteOffset??0);return bytes.subarray(offset,offset+a.count*16*4)};assert.deepEqual(bind(body,`characters/valdren-${face}/body.glb`),bind(hair,`characters/valdren-${face}/hair.glb`));}
 assert.equal(manifest.find(r=>r.file==='characters/valdren-female/hair.glb').sha256,'bae34dbb6450fc674a0b3dbf49064d1c2b4e4d0bb0cd4d3b8409f3ff065218db');
});

test('Karrog fit-v02 removable coif and beard retain the body joint order and inverse binds',()=>{
 const body=models.get('characters/karrog-male/body.glb');assert.equal(body.skins[0].joints.length,65);
 const bind=(g,file)=>{const a=g.accessors[g.skins[0].inverseBindMatrices],v=g.bufferViews[a.bufferView],bytes=model(file),offset=28+bytes.readUInt32LE(12)+(v.byteOffset??0)+(a.byteOffset??0);return bytes.subarray(offset,offset+a.count*16*4)};
 for(const [part,hash]of [['coif','5388773ad2bf3a9d1e5d9396fef9e7ac4161c5159a427a68b9cbbd0d59ec437f'],['beard','33c632b046fefa963c7083d52ce1c7abe4e815e7041809e1150983ccc5833ca0']]){
  const file=`characters/karrog-male/${part}.glb`,hair=models.get(file);assert.deepEqual(hair.skins[0].joints.map(i=>hair.nodes[i].name),body.skins[0].joints.map(i=>body.nodes[i].name));assert.equal(hair.animations?.length??0,0);assert.deepEqual(bind(body,'characters/karrog-male/body.glb'),bind(hair,file));assert.equal(manifest.find(r=>r.file===file).sha256,hash);
 }
});
