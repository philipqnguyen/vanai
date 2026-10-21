// The screens before the world, photographed: sign in, create account (and
// its validation), the empty roster, character creation for every people,
// the roster with characters, and the loading screen on the way in. Run
// against a dev client and server (defaults :5173 and :3000):
//   node tools/qa/pregame_shots.mjs [client] [api] [width] [height]
// Frames go to .playwright-mcp/pregame/.
import {chromium,CHANNEL,GL_ARGS,QA_BASE,API_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const [client=QA_BASE,api=API_BASE,W='1440',H='900']=process.argv.slice(2);
const out='.playwright-mcp/pregame';fs.mkdirSync(out,{recursive:true});
const tag=`${W}x${H}`,seed=Date.now().toString(36).replace(/[0-9]/g,x=>String.fromCharCode(97+Number(x)));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
const errors=[];
try{
 const p=await browser.newPage({viewport:{width:+W,height:+H}});
 p.on('pageerror',e=>errors.push(e.message));
 const shot=async(name)=>{await p.waitForTimeout(500);await p.screenshot({path:`${out}/${tag}-${name}.png`});console.log('shot',name);};
 await p.goto(client+'/');await p.locator('#f-email').waitFor();await shot('1-signin');
 await p.locator('#f-go').click();await shot('2-signin-error');
 await p.locator('.pg-tabs [data-mode=register]').click();
 await p.locator('#f-email').fill(`pregame-${seed}@example.invalid`);await p.locator('#f-pass').fill('secret12');await p.locator('#f-pass2').fill('secret13');
 await p.locator('#f-go').click();await shot('3-register-mismatch');
 await p.locator('#f-pass2').fill('secret12');await p.locator('#f-go').click();
 await p.locator('#c-new').waitFor();await shot('4-empty-roster');
 await p.locator('#c-new').click();await p.locator('#n-preview-status').waitFor({state:'hidden',timeout:90000});await shot('5-create-aedri');
 for(const race of ['valdren','karrog','nym','rasha']){
  await p.locator(`[data-r=${race}]`).click();
  const hairs=await p.locator('#n-hair [data-v]').evaluateAll(b=>b.map(x=>x.dataset.v));assert.ok(hairs.length&&!hairs.includes('none'),race);
  await p.locator('#n-preview-status').waitFor({state:'hidden',timeout:90000});await shot(`6-create-${race}`);
 }
 await p.locator('[data-r=aedri]').click();await p.locator('#n-face [data-v=female]').click();await p.locator('[data-j=WHM]').click();await p.locator('[data-c=moonmere]').click();
 await p.locator('#n-go').click();await shot('7-create-noname');
 await p.locator('#n-name').fill('Bad1');await shot('8-create-badname');
 await p.locator('#n-name').fill('Pg'+seed.slice(-8));await p.locator('#n-preview-status').waitFor({state:'hidden',timeout:90000});await shot('9-create-ready');
 await p.locator('#n-go').click();await p.waitForTimeout(150);await p.screenshot({path:`${out}/${tag}-10-loading-start.png`});
 // a new character sees the intro first: skip it, then the loading screen returns
 await p.locator('#cinema .cs-skip-btn').waitFor({state:'attached',timeout:30000});await p.waitForTimeout(800);await p.evaluate(()=>document.querySelector('#cinema .cs-skip-btn').click());
 await p.locator('#loading-screen.on').waitFor({timeout:30000});await p.waitForTimeout(1500);await shot('10-loading-zone');
 await p.waitForFunction(()=>window.__vanai?.avatar?.()?.model&&!document.querySelector('#loading-screen.on'),null,{timeout:180000});await shot('11-in-world');
 await p.goto(client+'/');await p.locator('.charrow').first().waitFor();await p.locator('#n-preview-status').waitFor({state:'hidden',timeout:90000});await shot('12-roster');
 const res=await p.evaluate(async(api)=>(await fetch(api+'/api/characters',{credentials:'include',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Baldy',race:'aedri',job:'PLD',city:'caerdun',appearance:{face:'male',hair:'none'}})})).status,api);
 assert.equal(res,422,'a bald character must be refused');
 console.log('errors',errors);
}finally{await browser.close()}
