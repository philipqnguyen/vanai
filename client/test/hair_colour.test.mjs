import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {appearanceChoice,hairOptions,hairColourOptions,hairFile,HAIR_COLOURS,HAIR_DYES,NATURAL_HAIR} from '../src/appearance.ts';
const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const measured=JSON.parse(read('../src/hair-colours.json'));
const index=JSON.parse(read('../src/asset-index.json'));
const LOOKS=[['nym','male'],['nym','female'],['aedri','male'],['aedri','female'],['valdren','male'],['valdren','female'],['karrog','male'],['rasha','female']];

test('every hair a character can wear is measured from the runtime file the game loads',()=>{
 const files=new Set();
 for(const [race,face] of LOOKS)for(const [hair] of hairOptions(race,face))files.add(hairFile(race,face,hair));
 files.add('karrog-male/beard'); // the beard takes the coif's colour
 for(const file of files){
  const key=`models/characters/${file}.glb`,entry=measured[key];
  assert.ok(entry,`${file} is not measured: python3 tools/assets/measure_hair.py`);
  // a revised or repacked hair has to be measured again
  assert.equal(entry.file,index.paths[key]?.h,`${file} changed since it was measured: python3 tools/assets/measure_hair.py`);
  assert.match(entry.colour,/^#[0-9a-f]{6}$/);
  assert.ok(entry.mid>0&&entry.mid<1&&entry.spread>0,file);
 }
 for(const [race,face] of LOOKS)for(const [hair] of hairOptions(race,face))assert.ok(NATURAL_HAIR[hairFile(race,face,hair)],`${race} ${face} ${hair} has no natural name`);
});

test('each hair offers its own colour first, then dark blue, dark green and auburn, every name once',()=>{
 assert.deepEqual(HAIR_COLOURS,['natural','dark_blue','dark_green','auburn']);
 for(const [race,face] of LOOKS)for(const [hair,style] of hairOptions(race,face)){
  const options=hairColourOptions(race,face,hair);
  assert.deepEqual(options.map(o=>o[0]),HAIR_COLOURS,`${race} ${face} ${hair}`);
  assert.equal(new Set(options.map(o=>o[1].toLowerCase())).size,options.length,`${race} ${face} ${hair}: ${options.map(o=>o[1])}`);
  for(const [,,swatch] of options)assert.match(swatch,/^#[0-9a-f]{6}$/);
  // the style's label no longer names a colour: the colour row does
  for(const name of [...Object.values(NATURAL_HAIR),...Object.values(HAIR_DYES).map(d=>d.label),'Midnight','Auburn'])
   assert.doesNotMatch(style,new RegExp(`\\b${name}\\b`,'i'),`${race} ${face} ${hair}`);
 }
});

test('a colour is kept only when it is a dye, as the server saves it',()=>{
 for(const [race,face] of LOOKS){
  assert.equal('hair_colour' in appearanceChoice(race,{face}),false);
  assert.equal('hair_colour' in appearanceChoice(race,{face,hair_colour:'natural'}),false);
  assert.equal('hair_colour' in appearanceChoice(race,{face,hair_colour:'purple'}),false);
  for(const colour of Object.keys(HAIR_DYES))assert.equal(appearanceChoice(race,{face,hair_colour:colour}).hair_colour,colour);
 }
});

test('the server offers the same colours and every race loader paints them',()=>{
 const server=read('../../server/app/models/character.rb').match(/HAIR_COLOURS = %w\[([^\]]+)\]/)[1].split(/\s+/);
 assert.deepEqual(server,HAIR_COLOURS);
 for(const race of ['aedri','valdren','karrog','nym','rasha'])assert.match(read(`../src/${race}.ts`),/colourHair\(/,race);
 assert.match(read('../src/main.ts'),/id="n-hair-colour"/);
});
