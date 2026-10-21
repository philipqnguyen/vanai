import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='.playwright-mcp/npc-integration';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const page=await browser.newPage(),requests=[];
 page.on('request',r=>requests.push(r.url()));
 await page.route('**/models/characters/**/body.glb',r=>r.abort());
 await page.goto(`${QA_BASE}/?npc-preview`);
 await page.waitForFunction(()=>window.__npcPreview?.actors.length===8);
 await page.waitForTimeout(2500);
 const actors=await page.evaluate(()=>window.__npcPreview.actors.map(({npc,av})=>({id:npc.id,loaded:!!av.model,placeholderVisible:av.proc.isEnabled()})));
 assert.ok(requests.some(r=>r.includes('/models/characters/')));
 assert.ok(actors.every(a=>!a.loaded&&!a.placeholderVisible));
 assert.deepEqual(requests.filter(r=>/\/models\/(Knight|Mage|Rogue|Rogue_Hooded|Barbarian)\.glb/.test(r)),[]);
 fs.writeFileSync(`${out}/failure-report.json`,JSON.stringify({blocked:'all production body requests',actors,legacyRequests:[]},null,2));
 console.log('All eight failed production body loads remain hidden; zero legacy character fallback requests.');
}finally{await browser.close()}
