import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const config=JSON.parse(fs.readFileSync(new URL('../../shared/data/ferry.json',import.meta.url)));
const source=fs.readFileSync(new URL('../src/ferry-deck.ts',import.meta.url),'utf8').replace("import config from '@data/ferry.json';",`const config=${JSON.stringify(config)};`);
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ferryDeckHeight:height,ferryBlockedMove:blocked}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const routes=[[[3.5,0],[3.5,2.7],[5,2.7],[10,2.7],[18,2.7],[23,1]],[[3.5,0],[-4.5,0],[-4.5,5.2],[-8,5.2],[-13.2,5.2],[-17,4],[-21,2]],[[3.5,0],[-4.5,0],[-4.5,-5.2],[-8,-5.2],[-13.2,-5.2],[-17,-4],[-21,-2]]];
test('both ends can be reached and returned from using the existing stairs',()=>{
 for(const path of routes)for(let i=1;i<path.length;i++){
  assert.equal(blocked(...path[i-1],...path[i]),false,JSON.stringify(path.slice(i-1,i+1)));
  assert.equal(blocked(...path[i],...path[i-1]),false);
 }
 assert.equal(height(23,1),5.997);assert.equal(height(-21,2),7.602);
});
test('hull, stair sides, cannon and mast sweeps reject shortcuts',()=>{
 for(const move of [[-3,5,5,5],[-3,0,-10,0],[-3,2,-50,2],[-10,1,-10,5.2],[8,3,8,6],[-13,6,-22,6]])assert.equal(blocked(...move),true,JSON.stringify(move));
 assert.equal(height(24,5),null);assert.equal(height(-22,5),null);
});
test('client and authoritative Ruby agree across the entire deck and movement paths',()=>{
 const points=[];for(let x=-26;x<=24;x+=.5)for(let z=-8;z<=8;z+=.5)points.push([x,z]);
 const moves=routes.flatMap(path=>path.slice(1).flatMap((p,i)=>[[...path[i],...p],[...p,...path[i]]]));
 for(let x=-26;x<24;x+=1)for(let z=-8;z<8;z+=1)moves.push([x,z,x+.7,z+.3]);
 const ruby=`require 'json'; require './lib/vanai/ferry'; module Vanai::Data; def self.ferry; @f ||= JSON.parse(File.read('../shared/data/ferry.json')); end; end; d=JSON.parse(STDIN.read); puts JSON.generate({heights:d['points'].map{|p| Vanai::Ferry.deck_height(*p)},moves:d['moves'].map{|p| Vanai::Ferry.blocked_move?(*p)}})`;
 const result=JSON.parse(execFileSync('ruby',['-e',ruby],{cwd:new URL('../../server/',import.meta.url),input:JSON.stringify({points,moves}),encoding:'utf8'}));
 result.heights.forEach((h,i)=>{const y=height(...points[i]);if(y===null)assert.equal(h,null);else assert.ok(Math.abs(y-h)<1e-9);});
 assert.deepEqual(result.moves,moves.map(p=>blocked(...p)));
});
