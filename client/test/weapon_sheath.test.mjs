// Sheathed weapons (Philip, 2026-10-14): long ones on the back, the rest on the
// left hip, drawn only in combat. weapon_sheath_plan.ts.
import test from 'node:test';import assert from 'node:assert/strict';
import {sheathSlot,sheathFrame,weaponDrawn,combatHold,COMBAT_HOLD,cross} from '../src/weapon_sheath_plan.ts';
const body={up:[0,1,0],forward:[0,0,1],left:[1,0,0],pelvis:[0,1,0],backCentre:[0,1.4,-.12],hipLeft:[.17,1,0]};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],near=(a,b,e=1e-9)=>a.every((v,i)=>Math.abs(v-b[i])<e);
test('the greatsword and the staff go on the back, other weapons on the hip, handwraps stay worn',()=>{
 assert.equal(sheathSlot('greatsword'),'back');assert.equal(sheathSlot('staff'),'back');
 for(const t of ['sword','katana','cudgel'])assert.equal(sheathSlot(t),'hip');
 assert.equal(sheathSlot('handwraps'),null);assert.equal(sheathSlot(undefined),null);
 assert.equal(sheathFrame('handwraps',body,{thin:'z',span:[0,1]}),null);
});
test('drawn in combat and for a while after, sheathed otherwise',()=>{
 assert.equal(weaponDrawn(0,10),false);assert.equal(weaponDrawn(combatHold(10),10+COMBAT_HOLD-.01),true);assert.equal(weaponDrawn(combatHold(10),10+COMBAT_HOLD),false);
});
test('each sheath is a right-handed unit frame: a stand-in hand slot',()=>{
 for(const type of ['greatsword','staff','sword','katana','cudgel'])for(const thin of ['x','z']){
  const f=sheathFrame(type,body,{thin,span:[-.1,.9]});
  for(const a of [f.x,f.y,f.z])assert.ok(Math.abs(dot(a,a)-1)<1e-9);
  assert.ok(Math.abs(dot(f.x,f.y))<1e-9&&Math.abs(dot(f.y,f.z))<1e-9&&Math.abs(dot(f.x,f.z))<1e-9);
  assert.ok(near(cross(f.x,f.y),f.z),`${type} ${thin} is right-handed`);
  // the blade's flat lies against the body: its thin axis is the body's normal there
  const n=thin==='x'?f.x:f.z,normal=sheathSlot(type)==='back'?body.forward:body.left;
  assert.ok(Math.abs(Math.abs(dot(n,normal))-1)<1e-9,`${type} lies flat`);
 }
});
test('back: centred behind the spine on a right-shoulder diagonal; a greatsword hilt up, a staff head up',()=>{
 const w={thin:'z',span:[-.1,.9]},g=sheathFrame('greatsword',body,w),s=sheathFrame('staff',body,w);
 // greatsword +Y (the blade) runs down and to the left; the staff's head up and to the right
 assert.ok(g.y[1]<0&&g.y[0]>0);assert.ok(s.y[1]>0&&s.y[0]<0);
 // the weapon's middle sits behind the back's surface, on the midline
 for(const f of [g,s]){const mid=f.origin.map((v,i)=>v+f.y[i]*.4);assert.ok(Math.abs(mid[0])<1e-9);assert.ok(mid[2]<body.backCentre[2]);assert.ok(Math.abs(mid[1]-body.backCentre[1])<1e-9);}
});
test('hip: the grip outside the left hip and forward, the weapon hanging back and down',()=>{
 const f=sheathFrame('sword',body,{thin:'x',span:[-.1,.6]});
 assert.ok(f.origin[0]>body.hipLeft[0]);assert.ok(f.origin[2]>0);assert.ok(f.origin[1]>body.hipLeft[1]);
 assert.ok(f.y[1]<0&&f.y[2]<0&&Math.abs(f.y[0])<1e-9);
});
