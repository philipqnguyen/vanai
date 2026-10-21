import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Matrix,Vector3,Quaternion,NullEngine,Scene,TransformNode} from '@babylonjs/core';
import {AEDRI_GRIP,fitAedriGrip} from '../src/aedri-grip.ts';
import {readPath} from './runtime-assets.mjs';
function model(face){const f=readPath(`models/characters/aedri-${face}/body.glb`),n=f.readUInt32LE(12);return {g:JSON.parse(f.subarray(20,20+n)),bin:f.subarray(28+n)};}
function read(m,i){const a=m.g.accessors[i],v=m.g.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);return Array.from({length:a.count},(_,k)=>Array.from({length:width},(_,j)=>m.bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+k*(v.byteStride??width*4)+j*4)));}
const matrix=n=>n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));
function pose(m,key,phase){const nodes=structuredClone(m.g.nodes),a=m.g.animations.find(a=>a.name===key),duration=Math.max(...a.samplers.map(s=>m.g.accessors[s.input].max[0])),time=phase*duration;
 for(const c of a.channels){const s=a.samplers[c.sampler],times=read(m,s.input).flat(),values=read(m,s.output);assert.ok(!s.interpolation||s.interpolation==='LINEAR');let i=times.findLastIndex(t=>t<=time);i=Math.max(0,i);const j=Math.min(i+1,times.length-1),t=j===i?0:Math.min(1,(time-times[i])/(times[j]-times[i]));nodes[c.target.node][c.target.path]=c.target.path==='rotation'?Quaternion.Slerp(Quaternion.FromArray(values[i]),Quaternion.FromArray(values[j]),t).asArray():values[i].map((v,k)=>v+(values[j][k]-v)*t);}
 const parents=new Map();nodes.forEach((n,i)=>n.children?.forEach(c=>parents.set(c,i)));return {nodes,relative(i,hand){if(i===hand)return Matrix.Identity();return matrix(nodes[i]).multiply(this.relative(parents.get(i),hand));}};
}
function circle(a,b,c){const u=b.subtract(a).normalize(),n=Vector3.Cross(b.subtract(a),c.subtract(a)).normalize(),v=Vector3.Cross(n,u),B=b.subtract(a),C=c.subtract(a);const bx=Vector3.Dot(B,u),by=Vector3.Dot(B,v),cx=Vector3.Dot(C,u),cy=Vector3.Dot(C,v),D=2*(bx*cy-by*cx),x=(B.lengthSquared()*cy-C.lengthSquared()*by)/D,y=(bx*C.lengthSquared()-cx*B.lengthSquared())/D;return a.add(u.scale(x)).add(v.scale(y));}
for(const face of ['male','female'])test(`${face} handle axis passes through the measured curl across the mapped blade poses`,()=>{
 const m=model(face),idx=new Map(m.g.nodes.map((n,i)=>[n.name,i]));let maxBefore=0,maxAfter=0;
 for(const key of ['ual1:Idle_Loop','ual1:Sword_Attack_Standing','ual2:Sword_Regular_A','ual2:Sword_Regular_A_Rec','ual2:Sword_Heavy_A','ual2:Sword_Heavy_A_Rec'])for(const phase of [0,.2,.4,.6,.8])for(const side of ['r','l']){
  // Attack offhands open or gesture; only the dominant fist stays closed.
  if(side==='l'&&key!=='ual1:Idle_Loop')continue;
  const p=pose(m,key,phase),hand=idx.get('hand_'+side),centres=['index','middle','ring'].map(f=>circle(...[1,2,3].map(j=>p.relative(idx.get(`${f}_0${j}_${side}`),hand).getTranslation()))),centre=Vector3.FromArray([0,1,2].map(i=>centres.map(v=>v.asArray()[i]).sort((a,b)=>a-b)[1])),slot=matrix(m.g.nodes[idx.get('handslot.'+side)]),axis=Vector3.TransformNormal(Vector3.Up(),slot).normalize();
  const distance=origin=>{const d=centre.subtract(origin);return d.subtract(axis.scale(Vector3.Dot(d,axis))).length();};const before=distance(slot.getTranslation()),after=distance(Vector3.FromArray(AEDRI_GRIP[face][side]));maxBefore=Math.max(maxBefore,before);maxAfter=Math.max(maxAfter,after);assert.ok(after<.00002,`${key} ${phase} ${side}: ${after}`);
 }
 assert.ok(maxBefore>.025);assert.ok(maxAfter<.00002);
});
test('fitting changes only unanimated slot translations, preserving rotation, scale and animated bones',()=>{
 const e=new NullEngine(),scene=new Scene(e),nodes=new Map();
 for(const side of ['l','r']){const n=new TransformNode('handslot.'+side,scene);n.rotationQuaternion=Quaternion.RotationYawPitchRoll(.3,.7,.4);n.scaling.set(1,2,3);nodes.set(n.name,n);}
 const hand=new TransformNode('hand_r',scene);hand.position.set(.2,.3,.4);nodes.set(hand.name,hand);const before=[...nodes].map(([k,n])=>[k,n.rotationQuaternion?.asArray(),n.scaling.asArray()]);fitAedriGrip(nodes,'female');assert.deepEqual([...nodes].map(([k,n])=>[k,n.rotationQuaternion?.asArray(),n.scaling.asArray()]),before);assert.deepEqual(hand.position.asArray(),[.2,.3,.4]);for(const side of ['l','r'])assert.deepEqual(nodes.get('handslot.'+side).position.asArray(),AEDRI_GRIP.female[side]);e.dispose();
});
