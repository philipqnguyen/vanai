// The standing idle (Philip, 2026-10-14: stand straighter; then a little more
// relaxed: a slight sway, feet wider, palms toward the body, elbows out),
// baked by the maker's tools/animations/bake_idle.py.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {QuaterniusPlayback,Q,STAND_IDLE} from '../src/quaternius-gameplay-state.ts';
// sword-motion.ts (the loader) is Babylon-bound; its key is this one
const IDLE_MOTION_KEY='vanai:Idle_Stand_v01';
import {readPath,sourceSha} from './runtime-assets.mjs';
const base='animations/vanai-idle-v01/',c=JSON.parse(readPath(base+'clip.json')),bin=readPath(base+c.buffer.file);
test('a prepared rig idles on the standing idle; a legacy preview keeps the source idle',()=>{
 assert.equal(new QuaterniusPlayback(true).update('idle',0,false),STAND_IDLE);
 assert.equal(new QuaterniusPlayback(false).update('idle',0,false),Q.idle);
 assert.equal(STAND_IDLE.key,IDLE_MOTION_KEY);assert.ok(STAND_IDLE.loop);
 // every action still returns to it
 const p=new QuaterniusPlayback(true);p.attack('BLM',0);p.update('idle',0,false);assert.equal(p.update('idle',1.6,false),STAND_IDLE);
 assert.equal(p.update('dead',2,false),Q.death);assert.equal(p.update('idle',30,false),STAND_IDLE);
});
test('the stand is one slow sway loop, on the source library and the bodies it was measured on',()=>{
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(c.key,IDLE_MOTION_KEY);assert.equal(c.seconds,STAND_IDLE.seconds);assert.equal(bin.byteLength,c.buffer.bytes);assert.equal(hash(bin),c.buffer.sha256);
 const lib='animation-library/quaternius/',source=JSON.parse(readPath(lib+'catalog.json'));assert.equal(hash(readPath(lib+source.buffer.file)),c.sourceSha256);
 for(const [name,r]of Object.entries(c.rigs))assert.equal(sourceSha(`models/characters/${name}/body.glb`),r.sha256,name);
 assert.equal(Object.keys(c.rigs).length,8);
 assert.equal(c.frames[0],0);assert.ok(Math.abs(c.frames.at(-1)-c.seconds*60)<1e-6);
 assert.equal(new Set(c.channels.map(ch=>ch.node)).size,Object.keys(Object.values(c.rigs)[0].bones).length);
 let moving=0;
 for(const ch of c.channels){
  assert.ok(ch.count===1||ch.count===c.frames.length,ch.node);
  const at=(k,i)=>bin.readFloatLE(ch.offset+(k*ch.width+i)*4);
  for(let k=0;k<ch.count;k++)for(let i=0;i<ch.width;i++)assert.ok(Number.isFinite(at(k,i)));
  // the loop closes on itself: no pop at the seam
  if(ch.count>1){moving++;for(let i=0;i<ch.width;i++)assert.equal(at(ch.count-1,i),at(0,i),ch.node);}
 }
 assert.ok(moving>0,'the stance sways');
 // each approved body wears its own arms: four held rotations, solved against its own skin
 assert.deepEqual(Object.keys(c.bodies).sort(),Object.keys(c.rigs).sort());
 for(const [body,{channels}]of Object.entries(c.bodies)){
  assert.deepEqual(channels.map(ch=>ch.node).sort(),['lowerarm_l','lowerarm_r','upperarm_l','upperarm_r'],body);
  for(const ch of channels){assert.equal(ch.path,'rotation');assert.equal(ch.count,1);assert.ok(ch.offset+16<=bin.length);
   const q=[0,1,2,3].map(i=>bin.readFloatLE(ch.offset+i*4));assert.ok(Math.abs(Math.hypot(...q)-1)<1e-4,body+' '+ch.node);}
 }
});
test('upright, relaxed and planted: the bake recorded its own measurements within these bounds',()=>{
 const m=c.measured;

 // the source idle leans the upper back 16 deg and the head another 14 deg forward
 assert.ok(m.pitchFromNeutral.spine_03<5&&m.pitchFromNeutral.Head<5,JSON.stringify(m.pitchFromNeutral));
 for(const [body,b]of Object.entries(m).filter(([k])=>k in c.rigs)){
  // the feet stand where the source idle's do (nym-fit.ts's ground offset is measured on it)
  assert.ok(b.worstGroundError_m<.003,body);
  // a slight sway: the pelvis moves a centimetre or two, the planted feet stay put
  assert.ok(b.pelvisSway_m>.005&&b.pelvisSway_m<.03,body);assert.ok(b.footDrift_m<.004,body);
  // relaxed: feet wider than the neutral column, still under the source idle's stance for every body but Karrog's
  assert.ok(b.feetApart_m>.2&&b.feetApart_m<.45,body);
  // elbows a little out from the body
  assert.ok(b.elbowsOut_m.every(e=>e>.02),body);
  // the hands hang clear of the hips and thighs (the bare skin; tight legwear fits in the gap)
  assert.ok(b.handGap_m.every(g=>g>=.012),body+' '+b.handGap_m);
  // palms face the thighs: inward (+X is the body's left), not forward (+Z)
  const [l,r]=b.palm;assert.ok(l[0]<-.8&&r[0]>.8&&l[2]<.2&&r[2]<.2,body+' '+JSON.stringify(b.palm));
 }
});
