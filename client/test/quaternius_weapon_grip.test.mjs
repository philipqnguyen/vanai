import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {quaterniusBladeRoll} from '../src/quaternius-weapon-grip.ts';
import {readJson} from './runtime-assets.mjs';
test('blade grip correction is limited to opted-in swords, katana and greatswords',()=>{
 for(const type of ['sword','greatsword'])assert.equal(quaterniusBladeRoll('nym-quaternius',type),Math.PI/2);
 for(const variant of ['aedri-quaternius','nym-quaternius','rasha-quaternius','valdren-quaternius','karrog-quaternius'])assert.equal(quaterniusBladeRoll(variant,'katana'),-Math.PI/2);
 for(const type of ['staff','cudgel','handwraps',undefined])assert.equal(quaterniusBladeRoll('nym-quaternius',type),0);
 for(const variant of [undefined,'smallfolk-v10','smallfolk-v11','smallfolk-v12','smallfolk-quaternius'])for(const type of ['sword','katana','greatsword'])assert.equal(quaterniusBladeRoll(variant,type),0);
});
test('measured correction makes the edge lead all mapped blade strikes without moving the grip',()=>{
 const report=readJson('design/race-preview/quaternius/weapon-grip-measurements.json');
 assert.equal(report.rollDegrees,quaterniusBladeRoll('nym-quaternius','sword')*180/Math.PI);
 assert.equal(report.cases.length,12);
 for(const c of report.cases){assert.ok(c.gripAndLongAxisUnchanged);assert.ok(c.cuttingCore.flatBefore>.97,`${c.job} ${c.mode} baseline cutting core`);assert.ok(c.cuttingCore.flatAfter<.25,`${c.job} ${c.mode} corrected cutting core`);assert.ok(c.flatExposureRmsAfter<c.flatExposureRmsBefore);if(c.mode==='stationary')assert.ok(c.flatExposureRmsAfter<.4);}
});
