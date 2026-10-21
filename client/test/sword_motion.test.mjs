import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {QuaterniusPlayback,Q,ADAPTED_SWORD,STAND_IDLE} from '../src/quaternius-gameplay-state.ts';
import {readPath,sourceSha} from './runtime-assets.mjs';
test('approved sword is opt-in for prepared rigs and PLD only, retaining action timing',()=>{
 const old=new QuaterniusPlayback(),modern=new QuaterniusPlayback(true);old.attack('PLD',0);modern.attack('PLD',0);
 assert.equal(old.update('idle',0,false),Q.sword);assert.equal(modern.update('idle',0,false),ADAPTED_SWORD);
 assert.equal(modern.update('run',.5,false),ADAPTED_SWORD);assert.equal(modern.update('idle',1.4,false),ADAPTED_SWORD);assert.equal(modern.update('idle',1.54,false),STAND_IDLE);
 for(const [job,want]of [['WHM',Q.sword],['SAM',Q.regular],['DRK',Q.heavy],['BLM',Q.sword],['MNK',Q.punch]]){const p=new QuaterniusPlayback(true);p.attack(job,0);assert.equal(p.update('idle',0,false),want);}
});
test('new sword respects death/jump interrupts and independent local/remote clocks',()=>{
 const a=new QuaterniusPlayback(true),b=new QuaterniusPlayback(true);a.attack('PLD',0);b.attack('PLD',.2);a.update('idle',0,false);b.update('idle',.2,false);
 assert.equal(a.update('idle',1.6,false),STAND_IDLE);assert.equal(b.update('run',1.6,false),ADAPTED_SWORD);
 assert.equal(b.update('dead',1.61,false),Q.death);a.attack('PLD',2);a.update('idle',2,false);assert.equal(a.update('jump:start',2.1,false),Q.takeoff);
});
test('derived curves are bounded and source library plus all body revisions remain immutable',()=>{
 const base='animations/vanai-sword-v02/',c=JSON.parse(readPath(base+'clip.json')),bin=readPath(base+c.buffer.file);
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(bin.byteLength,c.buffer.bytes);assert.equal(hash(bin),c.buffer.sha256);assert.ok(bin.byteLength<750000);assert.equal(c.key,ADAPTED_SWORD.key);assert.equal(c.seconds,ADAPTED_SWORD.seconds);
 const lib='animation-library/quaternius/',source=JSON.parse(readPath(lib+'catalog.json'));assert.equal(hash(readPath(lib+source.buffer.file)),c.sourceSha256);
 // the bodies the curves were measured on (a packed copy names its source)
 for(const [name,r]of Object.entries(c.rigs))assert.equal(sourceSha(`models/characters/${name}/body.glb`),r.sha256,name);
 assert.equal(Object.keys(c.rigs).length,8);assert.equal(c.frames[0],0);assert.equal(c.frames.at(-1),92);
 for(const ch of c.channels){assert.ok(ch.offset+ch.count*ch.width*4<=bin.length);assert.ok(ch.count===1||ch.count===c.frames.length);for(let i=0;i<ch.count*ch.width;i++)assert.ok(Number.isFinite(bin.readFloatLE(ch.offset+i*4)));}
});
