import test from 'node:test';import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {FemaleLocomotion} from '../src/meshy-female-locomotion.ts';
function fixture(yaw=0,inward=.02){
 const engine=new NullEngine(),scene=new Scene(engine),stage=new TransformNode('stage',scene);stage.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),yaw);const nodes=new Map();
 for(const [side,sign]of[['l',1],['r',-1]]){let parent=stage;for(const [name,pos]of[['thigh',[sign*.088,.98,0]],['calf',[0,-.44,.10]],['foot',[0,-.40,-.10]]]){const n=new TransformNode(name+'_'+side,scene);n.parent=parent;n.position=Vector3.FromArray(pos);n.rotationQuaternion=Quaternion.Identity();nodes.set(n.name,n);parent=n;}}
 const layer=new FemaleLocomotion();layer.inwardMeters=inward;return{engine,scene,stage,nodes,layer};
}
const pos=n=>n.computeWorldMatrix(true).getTranslation();
const rot=n=>{const q=Quaternion.Identity();n.computeWorldMatrix(true).decompose(undefined,q);return q;};
test('female derived gait moves each ankle 2 cm inward with fixed hips, segment lengths and foot orientation',()=>{
 for(const yaw of[0,1.1]){const f=fixture(yaw),before=new Map([...f.nodes].map(([k,n])=>[k,{p:pos(n),q:rot(n)}]));f.layer.apply(f.nodes,f.stage,'ual1:Sprint_Loop',false,1/60);
 for(const [side,sign]of[['l',1],['r',-1]]){const names=['thigh','calf','foot'].map(n=>n+'_'+side);assert.ok(Vector3.Distance(pos(f.nodes.get(names[0])),before.get(names[0]).p)<1e-6);const shift=Vector3.TransformNormal(new Vector3(-sign*.02,0,0),f.stage.getWorldMatrix());assert.ok(Vector3.Distance(pos(f.nodes.get(names[2])),before.get(names[2]).p.add(shift))<1e-6);assert.ok(Math.abs(Quaternion.Dot(rot(f.nodes.get(names[2])),before.get(names[2]).q))>1-1e-6);for(let i=0;i<2;i++)assert.ok(Math.abs(Vector3.Distance(pos(f.nodes.get(names[i])),pos(f.nodes.get(names[i+1])))-Vector3.Distance(before.get(names[i]).p,before.get(names[i+1]).p))<1e-6);}
 f.engine.dispose();}
});
test('source restoration prevents accumulation and leaves non-locomotion unchanged',()=>{
 const f=fixture(),original=new Map([...f.nodes].map(([k,n])=>[k,n.rotationQuaternion.asArray()]));let first;
 for(let i=0;i<30;i++){f.layer.restore();f.layer.apply(f.nodes,f.stage,'ual1:Walk_Loop',false,1/60);const values=[...f.nodes].flatMap(([,n])=>n.rotationQuaternion.asArray());if(first)assert.deepEqual(values,first);else first=values;}
 f.layer.restore();f.layer.apply(f.nodes,f.stage,'ual1:Sword_Attack_Standing',false,1/60);assert.equal(f.layer.weight,0);for(const [k,n]of f.nodes)assert.deepEqual(n.rotationQuaternion.asArray(),original.get(k));f.engine.dispose();
});
test('entry ramps, walk/run preserves adjustment, and other source clips exit immediately',()=>{
 const f=fixture();f.layer.apply(f.nodes,f.stage,'ual1:Walk_Loop',true,1/60);assert.ok(f.layer.weight>0&&f.layer.weight<1);for(let i=0;i<10;i++){f.layer.restore();f.layer.apply(f.nodes,f.stage,'ual1:Walk_Loop',true,1/60);}assert.equal(f.layer.weight,1);f.layer.restore();f.layer.apply(f.nodes,f.stage,'ual1:Sprint_Loop',true,1/60);assert.equal(f.layer.weight,1);f.layer.restore();f.layer.apply(f.nodes,f.stage,'ual1:Jump_Start',true,1/60);assert.equal(f.layer.weight,0);f.engine.dispose();
});

test('v03 uses 4 cm per foot from source, another 2 cm beyond v02, without stretching',()=>{
 const f=fixture(0,.04);const before=new Map([...f.nodes].map(([k,n])=>[k,pos(n)]));f.layer.apply(f.nodes,f.stage,'ual1:Sprint_Loop',false,1/60);
 for(const [side,sign]of[['l',1],['r',-1]]){const foot='foot_'+side;assert.ok(Vector3.Distance(pos(f.nodes.get(foot)),before.get(foot).add(new Vector3(-sign*.04,0,0)))<1e-6);for(const [a,b]of[['thigh','calf'],['calf','foot']])assert.ok(Math.abs(Vector3.Distance(pos(f.nodes.get(a+'_'+side)),pos(f.nodes.get(b+'_'+side)))-Vector3.Distance(before.get(a+'_'+side),before.get(b+'_'+side)))<1e-6);}
 f.engine.dispose();
});
test('an unreachable narrowed target clamps reach instead of stretching a straight leg',()=>{
 const f=fixture(0,.04);for(const side of['l','r']){f.nodes.get('calf_'+side).position.set(0,-.44,0);f.nodes.get('foot_'+side).position.set(0,-.40,0);}
 f.layer.apply(f.nodes,f.stage,'ual1:Walk_Loop',false,1/60);assert.ok(f.layer.lastErrors.every(e=>e>0&&e<.002));for(const side of['l','r']){const h=pos(f.nodes.get('thigh_'+side)),k=pos(f.nodes.get('calf_'+side)),a=pos(f.nodes.get('foot_'+side));assert.ok(Math.abs(Vector3.Distance(h,k)-.44)<1e-6);assert.ok(Math.abs(Vector3.Distance(k,a)-.40)<1e-6);assert.ok([...h.asArray(),...k.asArray(),...a.asArray()].every(Number.isFinite));}f.engine.dispose();
});

test('gait stays inward and preserves orientation beneath the game glTF reflection',()=>{
 for(const yaw of [0,1.1]){
  const f=fixture(yaw,.04);f.stage.scaling.z=-1;
  const before=new Map([...f.nodes].map(([k,n])=>[k,{p:pos(n),q:rot(n)}]));
  f.layer.apply(f.nodes,f.stage,'ual1:Sprint_Loop',false,1/60);
  for(const [side,sign] of [['l',1],['r',-1]]){
   const name='foot_'+side,shift=Vector3.TransformNormal(new Vector3(-sign*.04,0,0),f.stage.getWorldMatrix());
   assert.ok(Vector3.Distance(pos(f.nodes.get(name)),before.get(name).p.add(shift))<1e-6);
   assert.ok(Math.abs(Quaternion.Dot(rot(f.nodes.get(name)),before.get(name).q))>1-1e-6);
  }
  f.engine.dispose();
 }
});
