import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:750,height:800}});page.on('pageerror',e=>errors.push(e.message));await page.goto(QA_BASE+'/?character-preview');await page.waitForFunction(()=>window.__characterPreview);
 for(const race of ['aedri','nym'])for(const face of ['male','female']){
  const hair=race==='nym'?'tousled':face==='male'?'waves':'braid';
  await page.evaluate(selection=>window.postMessage({type:'character-appearance',...selection},location.origin),{race,job:'PLD',appearance:{face,hair}});
  await page.waitForFunction(()=>window.__characterPreview.avatar()?.model,null,{timeout:60000});await page.waitForTimeout(1500);
  const info=await page.evaluate(()=>{const {avatar,scene}=window.__characterPreview,a=avatar();return {variant:a.modelVariant,animation:a.currentAnim,height:a.raceH,meshes:a.model.root.getChildMeshes().map(m=>({name:m.name,skeleton:m.skeleton?.uniqueId,vertices:m.getTotalVertices(),parent:m.parent?.name})),errors:scene.getActiveMeshes().length};});
  assert.equal(info.animation,'vanai:Idle_Stand_v01');console.log(race,face,JSON.stringify(info));await page.screenshot({path:`${out}/preview-${race}-${face}.png`});
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
