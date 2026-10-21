import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='.playwright-mcp/npc-integration',reportName=process.env.NPC_QA_REPORT??'report';fs.mkdirSync(out,{recursive:true});
const base=QA_BASE;
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],report=[],requests=[];
page.on('request',r=>requests.push(r.url()));
// The scene module is found by its resource entry (see below); a zone loads
// far more than the default 250-entry timing buffer holds.
await page.addInitScript(()=>performance.setResourceTimingBufferSize(1e5));
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
try{
 const zones=(process.env.NPC_QA_ZONES??'lineup').split(',');
 for(const zone of zones){
  requests.length=0;const started=Date.now();await page.goto(`${base}/?npc-preview&daytime=.25${zone==='lineup'?'':`&npc-zone=${zone}`}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__npcPreview?.actors.length&&window.__npcPreview.actors.every(a=>a.av.model&&window.__npcPreview.equipmentInfo(a.av).ready&&a.av.root.isEnabled()),null,{timeout:180000});
  const readyMs=Date.now()-started;
  await page.waitForTimeout(1800);
  // Import the SAME scene module instance the page runs: after an HMR edit Vite
  // serves it with a ?t= query, and a bare '/src/scene.ts' is a fresh, empty copy.
  const info=await page.evaluate(async()=>{const env=await import(performance.getEntriesByType('resource').map(r=>r.name).find(n=>new URL(n).pathname==='/src/scene.ts')??'/src/scene.ts'),v=window.__npcPreview;return v.actors.map(({npc,av})=>({id:npc.id,kind:npc.kind,ground:env.groundHeight(npc.x,npc.z),surface:env.pavingHeight(npc.x,npc.z)??env.terrainMeshHeight(npc.x,npc.z),builtFloor:env.flatZones.some(f=>npc.x>=f.x0&&npc.x<=f.x1&&npc.z>=f.z0&&npc.z<=f.z1),seat:(()=>{const base=env.groundHeight(npc.x,npc.z),flat=env.flatZones.some(f=>npc.x>=f.x0&&npc.x<=f.x1&&npc.z>=f.z0&&npc.z<=f.z1),g=flat?base:env.pavingHeight(npc.x,npc.z)??env.terrainMeshHeight(npc.x,npc.z),lv=env.groundHeight(npc.x,npc.z,Math.max(base,g));return lv>base+.01?lv:g;})(),torsoPick:v.pickTorso(npc.id),variant:av.modelVariant,height:av.raceH,position:av.root.position.asArray(),expected:[npc.x,npc.y,npc.z],animation:av.currentAnim,playing:[...av.model.groups.values()].some(g=>g.isPlaying),equipment:v.equipmentInfo(av),pickMeshes:av.root.getChildMeshes().filter(m=>m.isEnabled()&&m.isPickable&&m.metadata?.entityId===`npc_${npc.id}`).length,geometry:av.root.getChildMeshes().filter(m=>m.isEnabled()).map(m=>({name:m.name,vertices:m.getTotalVertices(),visible:m.isVisible}))}))});
  for(const a of info){assert.ok(a.variant?.endsWith('-quaternius'));assert.ok(a.playing,`${a.id} idle animation`);assert.ok(a.pickMeshes>0,`${a.id} picking`);assert.equal(a.torsoPick,`npc_${a.id}`);if(zone!=='lineup'){assert.equal(a.position[0],a.expected[0]);assert.equal(a.position[2],a.expected[2]);assert.equal(a.position[1],a.expected[1]??a.seat);}assert.deepEqual(a.equipment.items.filter(x=>x!=='ash_staff').sort(),['traveler_boots','traveler_slops','traveler_tunic']);}
  await page.screenshot({path:`${out}/${zone}.png`});
  const representatives=zone==='lineup'||zone==='capital'?info:info.filter((a,i)=>info.findIndex(b=>b.kind===a.kind)===i);
  for(const a of representatives){await page.evaluate(id=>window.__npcPreview.focus(id),a.id);await page.waitForTimeout(400);await page.screenshot({path:`${out}/${zone}-${a.id}.png`});if(a.id==='junn_cap'){for(let i=1;i<=3;i++){await page.evaluate(()=>{window.__npcPreview.camera.alpha+=Math.PI/2;window.__npcPreview.camera.radius=3});await page.waitForTimeout(300);await page.screenshot({path:`${out}/${zone}-${a.id}-angle${i}.png`});}}}
  const resources=requests.filter(r=>/\/models\/characters\/.*body.glb/.test(r));
  assert.ok(resources.length>0);assert.equal(new Set(resources).size,resources.length,'body fetches shared by residents');
  assert.deepEqual(requests.filter(r=>/\/models\/(Knight|Mage|Rogue|Rogue_Hooded|Barbarian)\.glb/.test(r)),[],'no KayKit NPC character request');
  report.push({zone,readyMs,actors:info,bodyRequests:resources});fs.writeFileSync(`${out}/${reportName}.json`,JSON.stringify({report,errors},null,2));console.log(zone,info.length,'actors ready',report.at(-1).readyMs,'ms',errors.length,'errors');
 }
 assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(`${out}/${reportName}.json`,JSON.stringify({report,errors},null,2));await browser.close()}
