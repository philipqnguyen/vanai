import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gearJobs} from '../src/gear-eligibility.ts';
import {readJson} from './runtime-assets.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL('../../'+file,import.meta.url)));
const {races,...jobs}=read('shared/data/jobs.json');
const items=read('shared/data/items.json');
const order=Object.keys(jobs);
test('job restrictions narrow materials, reject malformed lists, and preserve shared gear',()=>{
 assert.deepEqual(gearJobs(items.traveler_tunic,jobs,order),order);
 assert.deepEqual(gearJobs({slot:'body',atype:'cloth',allowed_jobs:['BLM']},jobs,order),['BLM']);
 assert.deepEqual(gearJobs({slot:'body',atype:'chain',allowed_jobs:['BLM']},jobs,order),[]);
 for(const allowed_jobs of [[],null,'BLM',['UNKNOWN']])assert.deepEqual(gearJobs({slot:'head',atype:'any',allowed_jobs},jobs,order),[]);
 assert.deepEqual(gearJobs({slot:'weapon',wtype:'sword',allowed_jobs:['WHM']},jobs,order),[]);
});
test('server and client agree for every catalog item',()=>{
 const source="require './server/lib/vanai/data'; Vanai::Data.load!(File.expand_path('server')); puts JSON.generate(Vanai::Data.items.transform_values { |item| Vanai::Data.eligible_jobs(item) })";
 const server=JSON.parse(execFileSync('ruby',['-e',source],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}));
 for(const [key,item] of Object.entries(items))assert.deepEqual(gearJobs(item,jobs,order),server[key],key);
});
test('all six jobs have complete milestone sets, rotating upgrades and an acquisition route or quest plan',()=>{
 const briefs=readJson('design/gear/job-sets.json').items;
 const acquisition=readJson('design/gear/acquisition.json').items;
 const routes=['zones','quests','monsters','recipes'].map(f=>JSON.stringify(read('shared/data/'+f+'.json'))).join('\n');
 assert.equal(Object.keys(briefs).length,168);
 for(const job of order){
  for(const level of [10,20,30,40,50])for(const slot of ['head','body','legs','feet']){
   const id=`calling_${job.toLowerCase()}_${level}_${slot}`;
   assert.equal(items[id].lvl,level);assert.equal(items[id].slot,slot);assert.deepEqual(gearJobs(items[id],jobs,order),[job]);
  }
  const singles=Object.keys(briefs).filter(k=>briefs[k].job===job&&briefs[k].kind==='individual');
  assert.deepEqual(singles.map(k=>items[k].lvl),[14,17,24,27,34,37,44,47]);
 }
 for(const [id,brief] of Object.entries(briefs)){
  // Waymark pieces at 14/17/44/47 are sold and at 24/27 crafted, so the data
  // itself is their route; every other piece is quest-only and carries a
  // planned override naming its quest until that quest is in the data.
  const [,job,level]=id.match(/^calling_(\w+?)_(\d+)_/);
  if([14,17,24,27,44,47].includes(+level)){assert.equal(acquisition[id],undefined,id);assert.ok(routes.includes(`"${id}"`),id);}
  else if(!routes.includes(`"${id}"`))assert.deepEqual(acquisition[id],{status:'planned',note:`quest: g_${job}_${level}`},id);
  // Only the vendor Waymark pieces have a buy price; milestones cannot be sold.
  if(![14,17,44,47].includes(+level))assert.ok(!items[id].price,id);
  if(brief.kind==='milestone')assert.equal(items[id].price_sell,undefined,id);
  assert.ok(Object.values(items[id].stats).every(v=>Number.isInteger(v)&&v>0));
  if(brief.kind==='individual'){
   const previous=items[`calling_${brief.job.toLowerCase()}_${brief.setLevel}_${items[id].slot}`];
   assert.ok(items[id].def>previous.def,id);
  }
 }
});
