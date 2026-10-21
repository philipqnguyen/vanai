import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration',accounts=JSON.parse(fs.readFileSync(out+'/accounts.json'));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const p=await browser.newPage({viewport:{width:900,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(QA_BASE+'/?character-preview');await p.waitForFunction(()=>window.__characterPreview);
 for(const face of ['male','female']){
  await p.evaluate(face=>window.postMessage({type:'character-appearance',race:'aedri',job:'MNK',appearance:{face,hair:'none'}},location.origin),face);await p.waitForFunction(()=>window.__characterPreview.avatar()?.model);await p.waitForTimeout(700);await p.screenshot({path:`${out}/wraps-${face}.png`});
 }
 await p.setViewportSize({width:1280,height:1000});await p.goto(QA_BASE+'/');await p.locator('#f-email').fill(accounts.users[0]);await p.locator('#f-pass').fill(accounts.password);await p.locator('#f-go').click();await p.locator('#c-new').click();
 for(const race of ['aedri','nym'])for(const face of ['male','female']){
  await p.locator(`[data-r=${race}]`).click();await p.locator(`#n-face [data-v=${face}]`).click();await p.locator('#n-preview-status').waitFor({state:'hidden',timeout:60000});await p.locator('#n-preview').scrollIntoViewIfNeeded();
  const box=await p.locator('#n-preview').boundingBox();assert.ok(box.height>=275);await p.screenshot({path:`${out}/final-creation-${race}-${face}.png`});
 }
 assert.deepEqual(errors,[]);console.log('final creation framing and both human monk wraps render without browser errors');
}finally{await browser.close();}
