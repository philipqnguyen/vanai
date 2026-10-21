import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration',account=JSON.parse(fs.readFileSync(out+'/accounts.json')),prior=JSON.parse(fs.readFileSync(out+'/lifecycle-report.json'));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});const errors=[],updates=[];
try{
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1200,height:850}}))),[p,o]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const page of [p,o])page.on('pageerror',e=>errors.push(e.message));
 o.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload).message;if(m?.t==='player_update')updates.push(m.player)}catch{}}));
 const ready=page=>page.waitForFunction(()=>window.__vanai?.avatar?.()?.model&&window.__vanai.state.self.maxHp>1,null,{timeout:120000});
 const send=(page,action,data)=>page.evaluate(async({action,data})=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/net.ts');(await import(url)).send(action,data)},{action,data});
 for(const [index,page] of [p,o].entries()){
  await page.goto(QA_BASE+'/?daytime=.25');await page.locator('#f-email').fill(account.users[index]);await page.locator('#f-pass').fill(account.password);await page.locator('#f-go').click();
  if(index){await page.locator(`[data-id="${prior.observer.id}"]`).dblclick();await ready(page);await send(page,'chat',{channel:'say',msg:'/tp caerdun 241 -68'});await page.waitForFunction(()=>window.__vanai.state.zone==='caerdun'&&window.__vanai.avatar()?.model,null,{timeout:120000});}
 }
 for(const [index,char] of prior.characters.slice(0,4).entries()){
  const id=char.id,rid='p'+id,appearance=char.appearance,variant=char.race==='nym'?'nym-quaternius':'aedri-quaternius';
  if(index)await p.reload();await p.locator(`[data-id="${id}"]`).dblclick();await ready(p);
  await send(p,'chat',{channel:'say',msg:'/tp caerdun 236 -68'});await p.waitForFunction(()=>window.__vanai.state.zone==='caerdun'&&window.__vanai.avatar()?.model,null,{timeout:120000});
  await o.waitForFunction(({rid,variant})=>window.__vanai.remotes().get(rid)?.modelVariant===variant,{rid,variant},{timeout:30000});
  const weapon=await p.evaluate(()=>window.__vanai.state.inventory.find(r=>r.equipped_slot==='weapon').item_key);
  await p.keyboard.press('KeyC');await p.locator('.gearslot[data-slot=weapon]').click();await p.locator('#gear-ctx button').filter({hasText:'Remove'}).click();
  await p.waitForFunction(()=>!window.__vanai.state.inventory.some(r=>r.equipped_slot==='weapon'));await o.waitForFunction(id=>!window.__vanai.state.players.get(id).look.w,rid);await ready(p);
  assert.deepEqual(await p.evaluate(()=>window.__vanai.state.self.appearance),appearance);assert.equal(await p.evaluate(()=>window.__vanai.avatar().modelVariant),variant);
  await p.locator('.gearslot[data-slot=weapon]').click();await p.locator('#gear-ctx .ctx-item').first().click();
  await p.waitForFunction(()=>window.__vanai.state.inventory.some(r=>r.equipped_slot==='weapon'));await o.waitForFunction(({rid,weapon})=>window.__vanai.state.players.get(rid).look.w===weapon,{rid,weapon});await ready(p);await p.keyboard.press('KeyC');
  await p.evaluate(()=>window.__vanai.go(88,-88));await p.waitForTimeout(500);await send(p,'change_job',{job:'WHM'});await p.waitForFunction(variant=>window.__vanai.state.self.job==='WHM'&&window.__vanai.avatar()?.modelVariant===variant,variant);
  await o.waitForFunction(({rid,variant})=>window.__vanai.remotes().get(rid)?.jobRef==='WHM'&&window.__vanai.remotes().get(rid)?.modelVariant===variant,{rid,variant});assert.deepEqual(await o.evaluate(id=>window.__vanai.state.players.get(id).appearance,rid),appearance);
  await send(p,'change_job',{job:char.job});await p.waitForFunction(({job,variant})=>window.__vanai.state.self.job===job&&window.__vanai.avatar()?.modelVariant===variant,{job:char.job,variant});
  await p.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/world.ts');(await import(url)).enterZone('caerdun',79,-18)});await ready(p);
  await o.waitForFunction(({rid,variant,job})=>window.__vanai.remotes().get(rid)?.jobRef===job&&window.__vanai.remotes().get(rid)?.modelVariant===variant,{rid,variant,job:char.job});assert.deepEqual(await o.evaluate(id=>window.__vanai.state.players.get(id).appearance,rid),appearance);
  assert.ok(updates.some(x=>x.id===rid&&!x.look.w));assert.ok(updates.some(x=>x.id===rid&&x.job==='WHM'));assert.ok(updates.filter(x=>x.id===rid).every(x=>x.race===char.race&&JSON.stringify(x.appearance)===JSON.stringify(appearance)));
  console.log('gear/job/reconnect',char.race,appearance.face);
 }
 await o.evaluate(()=>window.__vanai.go(239,-68));await p.evaluate(()=>{const c=window.__vanai.cam();c.alpha=1.8;c.beta=1.3;c.radius=6});await p.waitForTimeout(800);await p.screenshot({path:out+'/nym-with-aedri.png'});
 assert.equal(errors.length,0);
 fs.writeFileSync(out+'/updates-report.json',JSON.stringify({passed:true,errors,updates},null,2));console.log('real gear removal/equip, job change and resubscription preserve appearance');await Promise.all(contexts.map(c=>c.close()));
}finally{await browser.close()}
