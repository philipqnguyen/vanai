import test from 'node:test';import assert from 'node:assert/strict';
import {LeaseCache} from '../src/gear/cache.ts';
test('equipment cache shares in-flight loads, retains active actors, evicts idle assets and handles late disposal',async()=>{
 let loads=0;const destroyed=[];const c=new LeaseCache(v=>destroyed.push(v),0);let finish;
 const first=c.acquire('gear',()=>{loads++;return new Promise(r=>finish=r)}),second=c.acquire('gear',()=>{throw Error('duplicate load')});
 await Promise.resolve();assert.equal(loads,1);first.release();assert.equal(c.info().active,1);finish('gear');assert.equal(await second.value,'gear');assert.deepEqual(destroyed,[]);
 second.release();await Promise.resolve();assert.deepEqual(destroyed,['gear']);second.release();assert.deepEqual(c.info(),{entries:0,active:0});
 const late=c.acquire('late',()=>Promise.resolve('late'));c.dispose();await late.value;await Promise.resolve();assert.deepEqual(destroyed,['gear','late']);late.release();assert.throws(()=>c.acquire('closed',()=>Promise.resolve()),/disposed/);
});
