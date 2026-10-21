import {chromium,CHANNEL,GL_ARGS,QA_BASE,API_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration',accounts=JSON.parse(fs.readFileSync(out+'/accounts.json')),lifecycle=JSON.parse(fs.readFileSync(out+'/lifecycle-report.json'));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--disable-background-timer-throttling','--disable-renderer-backgrounding']});const errors=[],events=[],results=[];
try{
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1100,height:850}})));const [p,o]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const [index,page] of [p,o].entries()){page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload).message;if(m?.t==='combat')events.push({client:index,...m});}catch{}}));}
 const send=(page,action,data={})=>page.evaluate(async({action,data})=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/net.ts');if(!url)throw new Error('Loaded network module missing');(await import(url)).send(action,data);},{action,data});
 const ready=page=>page.waitForFunction(()=>window.__vanai?.avatar?.()?.model&&window.__vanai.state.self?.maxHp>1,null,{timeout:120000});
 const login=async(page,email,id)=>{await page.goto(QA_BASE+'/?daytime=.25');await page.locator('#f-email').fill(email);await page.locator('#f-pass').fill(accounts.password);await page.locator('#f-go').click();await page.locator(`[data-id="${id}"]`).dblclick();await ready(page)};
 const zone=async(page,key)=>{await page.waitForFunction(k=>window.__vanai?.state?.zone===k&&window.__vanai.avatar()?.model&&window.__vanai.state.self.maxHp>1,key,{timeout:120000})};
 const go=async(page,x,z)=>{await page.evaluate(({x,z})=>window.__vanai.go(x,z),{x,z});await page.waitForTimeout(450)};
 const capture=async(page,name)=>{await page.evaluate(()=>{const c=window.__vanai.cam();c.radius=4;c.alpha=1.8;c.beta=1.3});await page.screenshot({path:out+'/'+name+'.png'})};
 const startTrace=page=>page.evaluate(()=>{clearInterval(window.__nymTimer);window.__nymTrace=[];window.__nymTimer=setInterval(()=>{const v=window.__vanai;if(!v?.avatar?.()?.model)return;window.__nymTrace.push({at:performance.now()/1000,self:v.avatar().currentAnim,y:v.pos().y,rootY:v.avatar().root.position.y,info:v.motion(),remotes:[...v.remotes()].map(([id,a])=>({id,anim:a.currentAnim,variant:a.modelVariant,y:a.root.position.y}))})},40)});
 const waitAnim=(page,anim)=>page.waitForFunction(a=>window.__vanai.avatar()?.currentAnim===a,anim,{timeout:12000});
 await login(p,accounts.users[0],lifecycle.characters[0].id);await login(o,accounts.users[1],lifecycle.observer.id);
 await p.waitForFunction(id=>window.__vanai.remotes().has('p'+id),lifecycle.observer.id,{timeout:30000});
 await go(o,241,-68);await startTrace(p);await startTrace(o);
 if(!process.env.CHARACTER_COMBAT_RESUME){
 // Real input and relayed jump timestamps, followed by normal /rest and /wave commands.
 await p.keyboard.press('Space');await p.waitForTimeout(130);await capture(p,'jump');await p.waitForTimeout(1200);
 const command=async(page,text)=>{await page.keyboard.press('Enter');await page.locator('#chat-input').fill(text);await page.locator('#chat-input').press('Enter')};
 await command(p,'/rest');await waitAnim(p,'ual1:GroundSit_Enter');await p.waitForTimeout(2700);await waitAnim(p,'ual1:GroundSit_Idle_Loop');await capture(p,'rest');await command(p,'/rest');await p.waitForTimeout(2300);
 await command(p,'/wave');await waitAnim(p,'ual1:Celebration');await capture(p,'wave');await p.waitForTimeout(4400);await waitAnim(p,'vanai:Idle_Stand_v01');
 await p.keyboard.down('KeyW');await p.waitForTimeout(300);await p.keyboard.up('KeyW');
 results.push({case:'jump/rest/wave',self:await p.evaluate(()=>window.__nymTrace),observer:await o.evaluate(()=>window.__nymTrace)});
 for(const page of [p,o]){await go(page,88,-18);await send(page,'interact',{id:'cd_fields'});await zone(page,'caerdunfields')}
 console.log('actual portal transfer passed');
 }else {results.push(JSON.parse(fs.readFileSync(out+'/combat-partial.json')).results[0]);for(const page of [p,o])if(await page.evaluate(()=>window.__vanai.state.zone)!=='caerdunfields'){await send(page,'chat',{channel:'say',msg:'/tp caerdunfields -300 -30'});await zone(page,'caerdunfields')}}
 for(const [i,char] of lifecycle.characters.entries()){
  if(i>0){await p.evaluate(async({id,apiBase})=>{await fetch(`${apiBase}/api/characters/${id}/select`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'}})},{id:char.id,apiBase:API_BASE});await p.reload();await p.locator(`[data-id="${char.id}"]`).dblclick();await ready(p);if(await p.evaluate(()=>window.__vanai.state.zone)==='caerdun'){await go(p,88,-18);await send(p,'interact',{id:'cd_fields'});await zone(p,'caerdunfields')}}
  await o.waitForFunction(({id,race})=>window.__vanai.remotes().get('p'+id)?.modelVariant===(race==='nym'?'nym-quaternius':'aedri-quaternius'),char,{timeout:30000});
  await startTrace(p);await startTrace(o);
  await p.keyboard.press('Space');await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>window.__vanai.avatar().currentAnim),'ual1:Jump_Start');await p.waitForTimeout(1300);
  await p.keyboard.press('Enter');await p.locator('#chat-input').fill('/wave');await p.locator('#chat-input').press('Enter');await waitAnim(p,'ual1:Celebration');await p.keyboard.down('KeyW');await p.waitForTimeout(180);await p.keyboard.up('KeyW');await p.waitForTimeout(200);
  assert.notEqual(await p.evaluate(()=>window.__vanai.avatar().currentAnim),'ual1:Celebration');
  const target=await p.evaluate(()=>[...window.__vanai.state.monsters.values()].find(m=>m.key==='meadow_hare'&&m.hpPct>0));assert.ok(target);
  await go(p,target.x+1,target.z);await go(o,target.x+5,target.z);await capture(p,'appearance-'+char.job);await startTrace(p);await startTrace(o);
  const start=events.length;await p.evaluate(id=>{window.__qaChase=setInterval(()=>{const v=window.__vanai,m=v.state.monsters.get(id);if(m)v.go(m.x+.35,m.z)},100)},target.id);await p.waitForTimeout(400);await send(p,'attack',{id:target.id});await p.waitForTimeout(6000);await p.evaluate(()=>clearInterval(window.__qaChase));await send(p,'stop_attack');await p.waitForTimeout(2200);
  const attack={PLD:'ual1:Sword_Attack_Standing',SAM:'ual2:Sword_Regular_A',DRK:'ual2:Sword_Heavy_A',BLM:'ual1:Sword_Attack_Standing',WHM:'ual1:Sword_Attack_Standing',MNK:'ual1:Punch_Cross'}[char.job];
  const trace=await p.evaluate(()=>window.__nymTrace);assert.ok(trace.some(t=>t.self===attack),'actual auto attack '+char.job);assert.ok(events.slice(start).some(e=>e.ev.some(v=>v.src==='p'+char.id&&['hit','miss'].includes(v.k))));
  const second=await p.evaluate(()=>[...window.__vanai.state.monsters.values()].find(m=>m.key==='meadow_hare'&&m.hpPct>0));await go(p,second.x+1,second.z);await send(p,'chat',{channel:'say',msg:'/tpgive'});await p.waitForTimeout(300);
  await go(p,second.x+.35,second.z);
  const ws={PLD:'fast_blade',SAM:'tachi_enpi',DRK:'hard_slash',BLM:null,WHM:null,MNK:null}[char.job];
  {await p.keyboard.down('KeyW');if(ws)await send(p,'ability',{id:ws,target:second.id});else await send(p,'attack',{id:second.id});await p.waitForTimeout(300);await capture(p,'moving-'+char.job);await p.keyboard.up('KeyW');await send(p,'stop_attack');await p.waitForTimeout(2400)}
  const spell={BLM:'stone',WHM:'cure',MNK:'mending_chant'}[char.job];
  if(spell){await send(p,'ability',{id:spell,target:char.job==='BLM'?second.id:'p'+char.id});await waitAnim(p,'ual1:Spell_Simple_Enter');await capture(p,'cast-'+char.job);await p.waitForTimeout(3000)}
  results.push({case:char.job,id:char.id,self:await p.evaluate(()=>window.__nymTrace),observer:await o.evaluate(()=>window.__nymTrace),events:events.slice(start)});console.log('real combat',char.job);
 }
 // Let an existing field monster defeat only the disposable test character.
 const hostile=await p.evaluate(()=>[...window.__vanai.state.monsters.values()].sort((a,b)=>b.level-a.level)[0]);await go(p,hostile.x+1,hostile.z);await send(p,'attack',{id:hostile.id});await p.waitForTimeout(300);await send(p,'stop_attack');await p.waitForFunction(()=>window.__vanai.state.self.dead,null,{timeout:90000});await waitAnim(p,'ual1:Death01');await p.waitForTimeout(2700);await capture(p,'death-held');assert.equal(await p.evaluate(()=>window.__vanai.avatar().currentAnim),'ual1:Death01');
 await send(p,'release');await zone(p,'caerdun');await p.waitForFunction(()=>!window.__vanai.state.self.dead);assert.equal(await p.evaluate(()=>window.__vanai.avatar().modelVariant),'aedri-quaternius');console.log('real death, held pose and release passed');
 await send(p,'chat',{channel:'say',msg:'/tp moonmere 8 288'});await zone(p,'moonmere');await capture(p,'moonmere');assert.deepEqual(await p.evaluate(()=>window.__vanai.state.self.appearance),{face:'male',hair:'none'});console.log('Moonmere transfer preserves Aedri');
 results.push({case:'death/release/Moonmere',passed:true});assert.equal(errors.length,0);
 fs.writeFileSync(out+'/combat-report.json',JSON.stringify({results,errors,events},null,2));await Promise.all(contexts.map(c=>c.close()));
}finally{fs.writeFileSync(out+'/combat-partial.json',JSON.stringify({results,errors,events},null,2));await browser.close()}
