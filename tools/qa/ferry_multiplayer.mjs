import {chromium,CHANNEL,GL_ARGS} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const api='http://127.0.0.1:3013',root='http://127.0.0.1:5194',out='.playwright-mcp/ferry';fs.mkdirSync(out,{recursive:true});
const control=async(path,data={})=>{const r=await fetch(`${api}/__ferry_review/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const j=await r.json();assert.ok(!j.error,JSON.stringify(j));return j;};
const browser=await chromium.launch({...CHANNEL,args:[...GL_ARGS,'--ignore-gpu-blocklist']});const pages=[],errors=[];let status=0;
const send=(page,action,data={})=>page.evaluate(async({action,data})=>(await import('/src/net.ts')).send(action,data),{action,data});
const ready=(page,zone)=>page.waitForFunction(zone=>window.__vanai?.state.zone===zone&&window.__vanai.cam?.()?.getScene().isReady()&&window.__vanai.state.self.maxHp>1,zone,{timeout:60000});
try{
 const start=await control('time',{time:300});const fixtures=start.fixtures;
 for(const f of fixtures){
  const ctx=await browser.newContext({viewport:{width:1440,height:950}});
  assert.equal((await (await ctx.request.post(`${api}/api/login`,{data:{email:f.email,password:f.password}})).json()).ok,true);
  assert.equal((await (await ctx.request.post(`${api}/api/characters/${f.id}/select`,{data:{}})).json()).ok,true);
  const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(`${root}/?daytime=0.25`);await p.locator(`.charrow[data-id="${f.id}"]`).dblclick();await ready(p,f.origin);
 }
 const[a,b,c]=pages;
 await send(a,'talk',{npc:fixtures[0].npc});await a.getByText('Next arrival in',{exact:false}).waitFor();assert.equal(await a.getByRole('button',{name:'Confirm boarding · 10 gold',exact:true}).count(),0);
 await a.screenshot({path:`${out}/waiting.png`});
 await control('time',{time:500});
 for(let i=0;i<3;i++){await send(pages[i],'talk',{npc:fixtures[i].npc});await pages[i].getByRole('button',{name:'Confirm boarding · 10 gold',exact:true}).click();await pages[i].getByRole('button',{name:'Cancel boarding',exact:true}).waitFor();}
 await a.getByRole('button',{name:'Cancel boarding',exact:true}).click();await a.getByRole('button',{name:'Confirm boarding · 10 gold',exact:true}).click();await a.getByRole('button',{name:'Cancel boarding',exact:true}).waitFor();
 await a.screenshot({path:`${out}/registered.png`});
 await control('time',{time:600});
 await Promise.all([ready(a,'gulf_to_caerdun'),ready(b,'gulf_to_caerdun'),ready(c,'gulf_to_moonmere')]);
 await a.waitForFunction(()=>window.__vanai.state.players.size===1);await c.waitForFunction(()=>window.__vanai.state.players.size===0);
 const groups=await Promise.all(pages.map(p=>p.evaluate(()=>[window.__vanai.state.self.name,...[...window.__vanai.state.players.values()].map(v=>v.name)])));
 assert.deepEqual(groups[0].sort(),['Passengerone','Passengertwo']);assert.deepEqual(groups[2],['Passengerthree']);
 await a.keyboard.press('Enter');await a.locator('#chat-input').fill('Hello from our sailing');await a.locator('#chat-input').press('Enter');await b.locator('#chat-log').getByText('Hello from our sailing',{exact:false}).waitFor();assert.equal(await c.locator('#chat-log').getByText('Hello from our sailing',{exact:false}).count(),0);
 const before=await a.evaluate(()=>window.__vanai.pos());await a.locator('#game-canvas').click({position:{x:900,y:600}});await a.keyboard.down('KeyD');await a.waitForTimeout(650);await a.keyboard.up('KeyD');const after=await a.evaluate(()=>window.__vanai.pos());assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.3,'Walkable ship deck');
 await a.screenshot({path:`${out}/multiplayer-deck.png`});
 await b.reload();await b.locator(`.charrow[data-id="${fixtures[1].id}"]`).dblclick();await ready(b,'gulf_to_caerdun');await b.getByText('Arrival in',{exact:false}).waitFor();assert.equal((await control('status')).characters.find(x=>x.id===fixtures[1].id).gold,0);
 await b.close();await control('time',{time:1020});await Promise.all([ready(a,'caerdunfields'),ready(c,'moonmereshores')]);
 const finish=await control('status');assert.deepEqual(fixtures.map(f=>finish.characters.find(x=>x.id===f.id).gold),[40,0,40]);assert.ok(finish.characters.every(x=>x.ferry_voyage===null));assert.equal(finish.characters.find(x=>x.id===fixtures[1].id).zone,'caerdunfields');
 await a.screenshot({path:`${out}/arrived.png`});assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/multiplayer-audit.json`,JSON.stringify({groups,before,after,finish,errors},null,2));console.log(JSON.stringify({groups,walk:{before,after},characters:finish.characters,errors},null,2));
}catch(e){status=1;console.error(e);for(let i=0;i<pages.length;i++)if(!pages[i].isClosed()){console.error(await pages[i].locator('body').innerText().catch(()=>''));await pages[i].screenshot({path:`${out}/failure-${i}.png`}).catch(()=>{});}}
const timer=setTimeout(()=>process.exit(status),3000);await browser.close();clearTimeout(timer);process.exit(status);
