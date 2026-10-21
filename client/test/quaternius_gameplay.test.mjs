import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Q,Q_ATTACKS,QuaterniusPlayback} from '../src/quaternius-gameplay-state.ts';
import {QuaterniusJumpArc,Q_JUMP} from '../src/quaternius-jump.ts';
import {JumpArc,JUMP_DURATION,JUMP_VELOCITY,JUMP_GRAVITY} from '../src/jump.ts';
import {readJson} from './runtime-assets.mjs';
const catalog=readJson('design/race-preview/quaternius/full/catalog.json');
test('all mapped clips exist with complete measured source durations',()=>{for(const c of Object.values(Q)){const [pack,name]=c.key.split(':');const src=catalog.find(s=>s.key===`${pack}:inplace:${name}`);assert.ok(src,c.key);assert.ok(Math.abs(src.duration-c.seconds)<1e-6,c.key)}});
test('stationary SAM follows complete attack with complete recovery',()=>{const p=new QuaterniusPlayback();p.attack('SAM',0);assert.equal(p.update('idle',0,false),Q.regular);assert.equal(p.update('idle',.36,false),Q.regular);assert.equal(p.update('idle',.44,false),Q.regularOut);assert.equal(p.update('idle',1.3,false),Q.regularOut);assert.equal(p.update('idle',1.42,false),Q.idle)});
test('overlap is bounded and moving attacks preserve their full duration',()=>{const p=new QuaterniusPlayback();p.attack('PLD',0);p.update('idle',0,false);p.attack('MNK',.1);assert.equal(p.update('idle',1.54,false),Q.idle);p.attack('MNK',2);assert.equal(p.update('run',2,false),Q.punch);assert.equal(p.update('run',2.5,false),Q.punch);assert.equal(p.update('run',3.01,false),Q.run)});
test('fresh overlapping action waits for recovery without compression',()=>{const p=new QuaterniusPlayback();p.attack('MNK',0);p.update('idle',0,false);p.attack('BLM',.8);assert.equal(p.update('idle',.9,false),Q.punch);assert.equal(p.update('idle',1.01,false),Q.sword)});
test('death clears action and cast, holds, and revival returns idle',()=>{const p=new QuaterniusPlayback();p.attack('DRK',0);p.update('idle',0,false);assert.equal(p.update('dead',.2,true),Q.death);assert.equal(p.update('dead',30,true),Q.death);assert.equal(p.update('idle',31,false),Q.idle)});
test('sit and casting enter/loop/exit; movement interrupts immediately',()=>{const p=new QuaterniusPlayback();assert.equal(p.update('rest',0,false),Q.sitIn);assert.equal(p.update('rest',2.51,false),Q.sit);assert.equal(p.update('idle',3,false),Q.sitOut);assert.equal(p.update('run',3.1,false),Q.run);assert.equal(p.update('idle',4,true),Q.castIn);assert.equal(p.update('idle',4.6,true),Q.cast);assert.equal(p.update('idle',6,false),Q.castOut)});
test('cheer survives old 2.4s latch, but never repeats or overrides movement',()=>{const p=new QuaterniusPlayback();assert.equal(p.update('emote:cheer',0,false),Q.cheer);assert.equal(p.update('idle',2.5,false),Q.cheer);assert.equal(p.update('idle',4.01,false),Q.idle);assert.equal(p.update('emote:wave',5,false),Q.cheer)});
test('Quaternius jump exactly shares original immediate trajectory and remote clocks',()=>{
 const original=new JumpArc(),local=new QuaterniusJumpArc(),remote=new QuaterniusJumpArc();
 original.start(10,10);local.start(10,10);remote.start(10,9.9);
 assert.equal(JUMP_VELOCITY,5.6);assert.equal(JUMP_GRAVITY,15);assert.equal(Q_JUMP.contact,JUMP_DURATION);
 for(let t=9.9;t<12;t+=1/120){assert.equal(local.height(t),original.height(t));assert.equal(local.airborne(t),original.airborne(t));assert.equal(remote.height(t),local.height(t));assert.equal(remote.phase(t),local.phase(t))}
 assert.ok(local.height(10.001)>0);assert.equal(local.phase(10.7),'jump:start');assert.equal(local.phase(10.75),undefined);assert.equal(local.height(10.75),0);
 assert.ok(Math.abs(local.height(10+JUMP_DURATION/2)-1.0453333333333332)<1e-10);
 local.start(10.75,10.75);assert.ok(local.height(10.751)>0,'can jump again immediately after contact');
 remote.start(10,12);assert.equal(remote.phase(12),'jump:start');remote.cancel();assert.equal(remote.phase(12),undefined);
});
test('landing recovery yields immediately to movement, rest, attacks, casting and another jump',()=>{
 for(const input of ['run','rest','jump:start']){const p=new QuaterniusPlayback();p.update('jump:start',0,false);assert.equal(p.update('idle',.75,false),Q.land);assert.equal(p.update(input,.76,false),input==='run'?Q.run:input==='rest'?Q.sitIn:Q.takeoff);}
 const p=new QuaterniusPlayback();p.update('jump:start',0,false);p.update('idle',.75,false);p.attack('MNK',.76);assert.equal(p.update('idle',.76,false),Q.punch);
 const c=new QuaterniusPlayback();c.update('jump:start',0,false);c.update('idle',.75,false);assert.equal(c.update('idle',.76,true),Q.castIn);
 const moved=new QuaterniusPlayback();moved.update('jump:start',0,false);assert.equal(moved.update('run',.75,false),Q.run);assert.equal(moved.update('idle',.8,false),Q.idle,'cancelled landing never restarts');
});
test('a fresh queued repetition restarts the same clip as a new action',()=>{const p=new QuaterniusPlayback();p.attack('MNK',0);p.update('idle',0,false);const first=p.revision;p.attack('MNK',.8);assert.equal(p.update('idle',1.01,false),Q.punch);assert.ok(p.revision>first);assert.equal(p.update('idle',1.9,false),Q.punch);assert.equal(p.update('idle',2.02,false),Q.idle)});

test('temporary wave fallback shares cheer completion and interruption for replicated input',()=>{
 const local=new QuaterniusPlayback(),remote=new QuaterniusPlayback();
 assert.equal(local.update('emote:Wave',0,false),Q.cheer);assert.equal(remote.update('emote:Wave',.3,false),Q.cheer);
 assert.equal(local.update('idle',2.5,false),Q.cheer);assert.equal(remote.update('idle',2.8,false),Q.cheer);
 assert.equal(local.update('idle',4.01,false),Q.idle);assert.equal(remote.update('idle',4.31,false),Q.idle);
 for(const [input,want] of [['run',Q.run],['rest',Q.sitIn],['jump:start',Q.takeoff],['dead',Q.death]]){const p=new QuaterniusPlayback();p.update('emote:Wave',0,false);assert.equal(p.update(input,.1,false),want)}
 const attack=new QuaterniusPlayback();attack.update('emote:Wave',0,false);attack.attack('MNK',.1);assert.equal(attack.update('emote:Wave',.1,false),Q.punch);
 const cast=new QuaterniusPlayback();cast.update('emote:Wave',0,false);assert.equal(cast.update('emote:Wave',.1,true),Q.castIn);
});
