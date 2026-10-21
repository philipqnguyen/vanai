import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration',account=JSON.parse(fs.readFileSync(out+'/accounts.json')),prior=JSON.parse(fs.readFileSync(out+'/lifecycle-report.json'));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--disable-background-timer-throttling','--disable-renderer-backgrounding']}),report=[];
try{
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1000,height:850}}))),[p,o]=await Promise.all(contexts.map(c=>c.newPage())),errors=[];
 for(const page of [p,o])page.on('pageerror',e=>errors.push(e.message));
 const ready=page=>page.waitForFunction(()=>window.__vanai?.avatar?.()?.model&&window.__vanai.state.self.maxHp>1,null,{timeout:120000});
 const send=(page,action,data)=>page.evaluate(async({action,data})=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/net.ts');(await import(url)).send(action,data)},{action,data});
 for(const [i,page]of[p,o].entries()){await page.goto(QA_BASE+'/?daytime=.25');await page.locator('#f-email').fill(account.users[i]);await page.locator('#f-pass').fill(account.password);await page.locator('#f-go').click();if(i){await page.locator(`[data-id="${prior.observer.id}"]`).dblclick();await ready(page);await send(page,'chat',{channel:'say',msg:'/tp caerdunfields -300 -30'});await page.waitForFunction(()=>window.__vanai.state.zone==='caerdunfields'&&window.__vanai.avatar()?.model,null,{timeout:120000});}}
 for(const [i,char]of prior.characters.filter(c=>['DRK','WHM'].includes(c.job)).entries()){
  if(i)await p.reload();await p.locator(`[data-id="${char.id}"]`).dblclick();await ready(p);if(await p.evaluate(()=>window.__vanai.state.zone)!=='caerdunfields'){await send(p,'chat',{channel:'say',msg:'/tp caerdunfields -300 -30'});await p.waitForFunction(()=>window.__vanai.state.zone==='caerdunfields'&&window.__vanai.avatar()?.model,null,{timeout:120000});}
  await o.waitForFunction(id=>window.__vanai.remotes().get('p'+id)?.model,char.id,{timeout:30000});
  const target=await p.evaluate(()=>[...window.__vanai.state.monsters.values()].find(m=>m.key==='meadow_hare'&&m.hpPct>0));await p.evaluate(t=>{const v=window.__vanai;v.go(t.x+.35,t.z);window.__follow=setInterval(()=>{const m=v.state.monsters.get(t.id);if(m)v.go(m.x+.35,m.z)},70)},target);await o.evaluate(t=>window.__vanai.go(t.x+4,t.z),target);await p.waitForTimeout(400);
  const attack=char.job==='DRK'?'ual2:Sword_Heavy_A':'ual1:Sword_Attack_Standing';await send(p,'attack',{id:target.id});await p.waitForFunction(attack=>window.__vanai.avatar()?.currentAnim===attack,attack,{timeout:15000});await p.evaluate(()=>clearInterval(window.__follow));await p.keyboard.down('KeyW');await p.waitForFunction(()=>window.__vanai.motion()?.mode==='moving',null,{timeout:1000});
  const sample=await p.evaluate(()=>window.__vanai.motion());assert.equal(sample.actionSpeed,1);assert.equal(sample.baseSpeed,1);assert.ok(sample.lowerTargets.includes('foot_l'));assert.ok(!sample.upperTargets.includes('foot_l'));
  await p.waitForTimeout(120);const remote=await o.evaluate(id=>window.__vanai.remotes().get('p'+id)?.currentAnim,char.id);assert.ok(remote===attack||remote==='ual2:Sword_Heavy_A_Rec',remote);await p.screenshot({path:`${out}/confirmed-moving-${char.job}.png`});await p.keyboard.up('KeyW');await send(p,'stop_attack',{});report.push({job:char.job,sample,remote});console.log('confirmed real moving attack',char.job);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/moving-report.json',JSON.stringify({report,errors},null,2));
}finally{await browser.close()}
