import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {nymChoice,aedriChoice,rashaChoice,valdrenChoice,karrogChoice,appearanceChoice,mappedRace,hairOptions} from '../src/appearance.ts';
test('Nym hair follows the gender, whatever was saved, and leaves other races alone',()=>{
 assert.deepEqual(nymChoice('nym'),{face:'male',hair:'tousled'});
 for(const face of ['male','female'])for(const hair of ['tousled','bun'])assert.deepEqual(nymChoice('nym',{face,hair}),{face,hair:face==='female'?'bun':'tousled'});
 for(const race of ['aedri','valdren','karrog','rasha'])assert.equal(nymChoice(race,{face:'female',hair:'bun'}),undefined);
});
// Philip, 2026-10-21: creation offers a Nym woman only the tousled topknot and
// a Nym man only the layers.
test('Nym hair follows the gender at creation',()=>{
 assert.deepEqual(hairOptions('nym','female'),[['bun','Tousled topknot']]);
 assert.deepEqual(hairOptions('nym','male'),[['tousled','Layers']]);
});
test('only approved races are playable and Nym retains existing stat modifiers',()=>{
 const {races}=JSON.parse(fs.readFileSync(new URL('../../shared/data/jobs.json',import.meta.url)));
 assert.deepEqual(Object.keys(races).filter(r=>races[r].playable),['aedri','valdren','karrog','nym','rasha']);
 assert.deepEqual(races.nym.mods,{str:.85,vit:.9,int:1.12,mnd:1.1,agi:1.06});assert.equal(races.nym.hp_mod,.88);assert.equal(races.nym.mp_mod,1.18);
});

test('Aedri body defaults match saved styles',()=>{
 assert.deepEqual(aedriChoice('aedri'),{face:'male',hair:'waves'});
 assert.deepEqual(aedriChoice('aedri',{face:'female'}),{face:'female',hair:'braid'});
 assert.equal(aedriChoice('nym'),undefined);assert.equal(appearanceChoice('unknown'),undefined);
});

test('Rasha resolves to its approved female body and waves, including legacy input',()=>{
 for(const face of [undefined,'male','female'])for(const hair of [undefined,'waves','none']){const choice={face:'female',hair:'waves'};assert.deepEqual(rashaChoice('rasha',{face,hair}),choice);assert.deepEqual(appearanceChoice('rasha',{face,hair}),choice);}
 assert.equal(rashaChoice('nym'),undefined);for(const race of ['aedri','nym','rasha'])assert.equal(mappedRace(race),true);assert.equal(mappedRace('valdren'),true);
 const {races}=JSON.parse(fs.readFileSync(new URL('../../shared/data/jobs.json',import.meta.url)));assert.deepEqual(races.rasha.mods,{str:1.05,vit:.95,int:.95,mnd:.95,agi:1.12});assert.equal(races.rasha.hp_mod,.98);assert.equal(races.rasha.mp_mod,.95);
});

test('Valdren retains its race stats and resolves corresponding elf hair',()=>{
 assert.deepEqual(valdrenChoice('valdren'),{face:'male',hair:'cascade'});assert.equal(valdrenChoice('aedri'),undefined);
 for(const face of ['male','female']){assert.deepEqual(appearanceChoice('valdren',{face}),{face,hair:face==='female'?'braid':'cascade'});}
 const {races}=JSON.parse(fs.readFileSync(new URL('../../shared/data/jobs.json',import.meta.url)));assert.deepEqual(races.valdren.mods,{str:.95,vit:.92,int:1.08,mnd:1.08,agi:1.05});assert.equal(races.valdren.hp_mod,.95);assert.equal(races.valdren.mp_mod,1.1);
});

test('Karrog male coif and beard are independent and old empty rows resolve to approved defaults',()=>{
 assert.deepEqual(karrogChoice('karrog'),{face:'male',hair:'braid',beard:true});
 for(const beard of [true,false])assert.deepEqual(appearanceChoice('karrog',{face:'male',hair:'braid',beard}),{face:'male',hair:'braid',beard});
 assert.deepEqual(karrogChoice('karrog',{face:'female'}),{face:'male',hair:'braid',beard:true});assert.equal(karrogChoice('aedri'),undefined);assert.equal(mappedRace('karrog'),true);
 const {races}=JSON.parse(fs.readFileSync(new URL('../../shared/data/jobs.json',import.meta.url)));assert.deepEqual(races.karrog.mods,{str:1.1,vit:1.12,int:.9,mnd:.95,agi:.88});assert.equal(races.karrog.hp_mod,1.12);assert.equal(races.karrog.mp_mod,.85);
});

// Philip, 2026-10-15: every player character has hair. Creation offers no
// "no hair", and a legacy saved "none" resolves to the race's own style.
test('no player character is ever bald',()=>{
 const defaults={nym:{male:'tousled',female:'bun'},aedri:{male:'waves',female:'braid'},valdren:{male:'cascade',female:'braid'},karrog:{male:'braid',female:'braid'},rasha:{male:'waves',female:'waves'}};
 for(const race of Object.keys(defaults))for(const face of ['male','female']){
  assert.equal(appearanceChoice(race,{face,hair:'none'}).hair,defaults[race][face],`${race} ${face}`);
  const options=hairOptions(race,face);
  assert.ok(options.length>0);
  for(const [hair] of options){assert.notEqual(hair,'none');assert.equal(appearanceChoice(race,{face,hair}).hair,hair,`${race} ${face} ${hair}`);}
 }
 const loaders=['aedri','valdren','karrog','nym','rasha'].map(r=>fs.readFileSync(new URL(`../src/${r}.ts`,import.meta.url),'utf8'));
 for(const src of loaders)assert.doesNotMatch(src,/'none'/);
 const main=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.doesNotMatch(main,/No hair/);
});
