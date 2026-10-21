import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readPath,sourceSha} from './runtime-assets.mjs';
const lib='animation-library/quaternius/';
const catalog=JSON.parse(readPath(lib+'catalog.json')),buffer=readPath(lib+catalog.buffer.file);
const hash=b=>createHash('sha256').update(b).digest('hex');
function values(index){const a=catalog.accessors[index];return Array.from({length:a.count*a.width},(_,i)=>buffer.readFloatLE(a.offset+i*4));}
// a runtime model by its index path
function glb(path){const bytes=readPath(path),length=bytes.readUInt32LE(12);return {g:JSON.parse(bytes.subarray(20,20+length)),b:bytes.subarray(28+length)};}
function read({g,b},index){const a=g.accessors[index],v=g.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);return Array.from({length:a.count*width},(_,i)=>b.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/width)*(v.byteStride??width*4)+(i%width)*4));}
test('shared in-place library is intact, mesh-free, licensed, and complete',()=>{
 assert.equal(catalog.format,1);assert.equal(catalog.variant,'inplace');assert.equal(catalog.reviewOnly,true);
 assert.equal(catalog.creator,'Quaternius');assert.equal(hash(buffer),catalog.buffer.sha256);assert.equal(buffer.length,catalog.buffer.bytes);
 assert.equal(catalog.packs.length,2);assert.equal(Object.keys(catalog.rigs).length,8);
 for(const pack of catalog.packs){
  assert.equal(pack.clips.length,pack.id==='ual1'?120:134);assert.equal(new Set(pack.clips.map(c=>c.name)).size,pack.clips.length);
  const license=readPath(lib+pack.license);assert.equal(hash(license),pack.licenseSha256);assert.match(license.toString(),/CC0 1.0 Universal/);assert.match(license.toString(),/Quaternius/);
  for(const clip of pack.clips){assert.ok(clip.end>=clip.start);assert.ok(clip.channels.length>0);for(const c of clip.channels){
   assert.ok(pack.nodes[c.node]);assert.ok(['LINEAR','STEP'].includes(c.interpolation));const times=values(c.times),v=values(c.values);assert.ok(times.every(Number.isFinite));assert.ok(v.every(Number.isFinite));assert.ok(times.every((t,i)=>!i||t>times[i-1]));assert.equal(v.length,times.length*(c.path==='rotation'?4:3));
   for(const rig of Object.values(catalog.rigs))assert.ok(rig.bones[c.node],c.node);
  }}
 }
 for(const key of ['meshes','materials','textures','images','skins'])assert.equal(catalog[key],undefined);
});
test('every production body is pinned and its existing 21 clips match shared retargeting',()=>{
 for(const [id,rig] of Object.entries(catalog.rigs)){
  const path='models/'+rig.body;assert.equal(sourceSha(path),rig.sha256,id);
  const runtime=glb(path);assert.equal(runtime.g.animations.length,21);
  for(const a of runtime.g.animations){
   const [packId,name]=a.name.split(':'),pack=catalog.packs.find(p=>p.id===packId),clip=pack.clips.find(c=>c.name===name);assert.ok(clip);assert.equal(clip.channels.length,a.channels.length);
   for(const c of a.channels){
    const node=runtime.g.nodes[c.target.node].name,channel=clip.channels.find(x=>x.node===node&&x.path===c.target.path);assert.ok(channel);
    const sampler=a.samplers[c.sampler];assert.equal(channel.interpolation,sampler.interpolation??'LINEAR');assert.deepEqual(values(channel.times),read(runtime,sampler.input));
    const expected=values(channel.values),actual=read(runtime,sampler.output);assert.equal(expected.length,actual.length);
    for(let i=0;i<expected.length;i++){
     const value=c.target.path==='translation'?Math.fround(rig.bones[node].translation[i%3]+(expected[i]-pack.nodes[node].translation[i%3])*rig.bones[node].translationScale):expected[i];
     assert.ok(Math.abs(value-actual[i])<2e-6,`${id} ${a.name} ${node} ${c.target.path}`);
    }
   }
  }
 }
});
