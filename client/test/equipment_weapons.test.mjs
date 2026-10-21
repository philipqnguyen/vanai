import {quaterniusBladeRoll} from '../src/quaternius-weapon-grip.ts';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {NullEngine,Scene,Mesh,LoadAssetContainerAsync,Matrix,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {cloneRigidRoot} from '../src/gear/rigid.ts';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
import {gear,readPath,readJson,readPin,sourceSha} from './runtime-assets.mjs';
const m=gear.weapons,current=readJson('design/gear/fitting/production/current.json').selections;
test('every weapon runtime model is selected by its exact accepted package',()=>{
 const items=read('shared/data/items.json');assert.deepEqual(Object.keys(m.items).sort(),Object.keys(items).filter(id=>items[id].slot==='weapon').sort());let total=0;
 for(const [id,e] of Object.entries(m.items)){
  const targets=e.shared_model?{'aedri-male':{model:e.shared_model}}:e.bodies;
  for(const [body,t] of Object.entries(targets)){assert.equal(current[id+'/'+body].variant.model.sha256,t.model.sha256);total++;
   for(const k of ['model','coverage','face_map'])if(t[k]){const bytes=readPin(t[k]);assert.equal(bytes.length,t[k].bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),t[k].sha256);}
  }
 }assert.equal(total,178);
});
test('rigid loader preserves donor transform, every primitive and authored materials without glTF wrapper',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{for(const id of ['worn_sword','worn_katana']){
  const data=readPin(m.items[id].shared_model);
  const pack=await LoadAssetContainerAsync(new Uint8Array(data),scene,{pluginExtension:'.glb'});
  const src=[...pack.transformNodes,...pack.meshes].find(n=>n.name===id),clone=cloneRigidRoot(pack,id);
  assert.equal(clone.parent,null);assert.deepEqual(clone.position.asArray(),src.position.asArray());assert.deepEqual(clone.rotationQuaternion.asArray(),src.rotationQuaternion.asArray());assert.deepEqual(clone.scaling.asArray(),src.scaling.asArray());
  const meshes=n=>[...(n instanceof Mesh&&n.getTotalVertices()?[n]:[]),...n.getChildMeshes()].filter(m=>m.getTotalVertices());
  const originals=meshes(src),copies=meshes(clone);assert.ok(copies.length>1);assert.equal(copies.length,originals.length);
  for(let i=0;i<copies.length;i++){assert.equal(copies[i].material,originals[i].material);assert.deepEqual(copies[i].position.asArray(),originals[i].position.asArray());assert.equal(copies[i].getTotalVertices(),originals[i].getTotalVertices());}
  clone.dispose(false,false);assert.ok(originals.every(m=>!m.isDisposed()));pack.dispose();
 }}finally{scene.dispose();engine.dispose();}
});

test('all fourteen approved katana curves face upward in the measured normal held pose',()=>{
 const report=readJson('design/gear/fitting/runtime-katana-orientation-v1.json');
 const old=Matrix.FromArray(report.baseline_world),delta=quaterniusBladeRoll('aedri-quaternius','katana')-report.baseline_roll_radians;
 const held=Matrix.RotationY(delta).multiply(old);let count=0;
 for(const [id,e] of Object.entries(m.items))if(e.type==='katana'){
  const b=readPin(e.shared_model),jsonLength=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+jsonLength).toString());
  const primitive=g.meshes[0].primitives.find(p=>p.material===0),a=g.accessors[primitive.attributes.POSITION],v=g.bufferViews[a.bufferView];assert.equal(a.count,48);assert.equal(a.componentType,5126);
  const offset=20+jsonLength+8+(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??12;
  const point=i=>new Vector3(b.readFloatLE(offset+i*stride),b.readFloatLE(offset+i*stride+4),b.readFloatLE(offset+i*stride+8));
  const center=i=>point(i*4).add(point(i*4+2)).scale(.5);
  const chord=Vector3.Lerp(center(0),center(11),5/11),mid=center(5);
  const before=Vector3.TransformCoordinates(chord,old).subtract(Vector3.TransformCoordinates(mid,old)),after=Vector3.TransformCoordinates(chord,held).subtract(Vector3.TransformCoordinates(mid,held));
  assert.ok(before.y<0,id+' baseline inverted');assert.ok(after.y>0,id+' corrected concavity up');
  assert.ok(Vector3.Distance(Vector3.TransformCoordinates(Vector3.Zero(),old),Vector3.TransformCoordinates(Vector3.Zero(),held))<1e-8);
  assert.ok(Vector3.Distance(Vector3.TransformNormal(Vector3.Up(),old),Vector3.TransformNormal(Vector3.Up(),held))<1e-8);count++;
 }assert.equal(count,14);
});
