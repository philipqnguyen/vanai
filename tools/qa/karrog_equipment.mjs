import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';
const out='.playwright-mcp/karrog-integration',account=JSON.parse(fs.readFileSync(out+'/accounts.json')),lifecycle=JSON.parse(fs.readFileSync(out+'/lifecycle-report.json')),characters=lifecycle.characters.slice(0,2),weapons={PLD:'worn_sword',SAM:'worn_katana',DRK:'worn_greatsword',BLM:'ash_staff',WHM:'worn_cudgel',MNK:'cloth_wraps'},report=[],errors=[];
const items=JSON.parse(fs.readFileSync('shared/data/items.json'));
const fixture=path.resolve(out,'equipment-fixture.json');fs.writeFileSync(fixture,JSON.stringify({email:account.users[0],ids:characters.map(c=>c.id)}));
const setup=path.resolve(out,'equipment-fixture.rb');fs.writeFileSync(setup,`require 'json'\nr=JSON.parse(File.read(ARGV[0]));raise 'Unexpected fixture' unless r['email'].start_with?('karrog-qa-')\nu=User.find_by!(email:r['email']);r['ids'].each do |id|\n c=u.characters.find(id);Character::STARTER_WEAPONS.each_value { |key| c.inventory_items.find_or_create_by!(item_key:key) { |item| item.qty=1 } }\nend\n`);
const result=spawnSync('bundle',['exec','rails','runner',setup,fixture],{cwd:path.resolve('server'),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:850,height:750}}))),[p,o]=await Promise.all(contexts.map(c=>c.newPage()));for(const page of[p,o])page.on('pageerror',e=>errors.push(e.message));
 const ready=page=>page.waitForFunction(()=>window.__vanai?.avatar?.()?.model&&window.__vanai.state.self.maxHp>1,null,{timeout:120000});
 const send=(page,action,data)=>page.evaluate(async({action,data})=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/net.ts');(await import(url)).send(action,data)},{action,data});
 const equip=async key=>{
  const worn=await p.evaluate(()=>window.__vanai.state.inventory.find(r=>r.equipped_slot==='weapon')?.item_key);
  if(worn!==key){await p.locator('[data-w=inventory]').click();await p.locator('#win-inventory .invrow').filter({has:p.locator('.iname',{hasText:items[key].name})}).getByRole('button',{name:'Equip',exact:true}).click();await p.waitForFunction(key=>window.__vanai.state.inventory.find(r=>r.equipped_slot==='weapon')?.item_key===key,key);await p.locator('#win-inventory .wclose').click();}
  await ready(p);await p.waitForFunction(()=>!!window.__vanai.avatar()?.weapon);
 };
 for(const [i,page]of[p,o].entries()){await page.goto(QA_BASE+'/?daytime=.25');await page.locator('#f-email').fill(account.users[i]);await page.locator('#f-pass').fill(account.password);await page.locator('#f-go').click();if(i){await page.locator(`[data-id="${lifecycle.observer.id}"]`).dblclick();await ready(page);await send(page,'chat',{channel:'say',msg:'/tp caerdun 70 -88'});await page.waitForFunction(()=>window.__vanai.state.zone==='caerdun');await ready(page);}}
 for(const [i,char]of characters.entries()){
  if(i)await p.reload();await p.locator(`[data-id="${char.id}"]`).dblclick();await ready(p);await send(p,'chat',{channel:'say',msg:'/tp caerdun 85 -88'});await p.waitForFunction(()=>window.__vanai.state.zone==='caerdun');await ready(p);await p.evaluate(()=>window.__vanai.go(85,-88));await p.waitForTimeout(500);
  for(const [job,key]of Object.entries(weapons)){
   await send(p,'change_job',{job});await p.waitForFunction(job=>window.__vanai.state.self.job===job&&window.__vanai.avatar()?.jobRef===job,job);await equip(key);
   await o.waitForFunction(({id,job,key,variant})=>{const v=window.__vanai;return v.remotes().get('p'+id)?.jobRef===job&&v.remotes().get('p'+id)?.modelVariant===variant&&v.state.players.get('p'+id)?.look.w===key},{id:char.id,job,key,variant:char.race+'-quaternius'},{timeout:30000});
   assert.deepEqual(await p.evaluate(()=>window.__vanai.state.self.appearance),char.appearance);assert.deepEqual(await o.evaluate(id=>window.__vanai.state.players.get('p'+id).appearance,char.id),char.appearance);
   await p.evaluate(()=>{const c=window.__vanai.cam();c.radius=4;c.alpha=1.2;c.beta=1.35});await p.waitForTimeout(750);if(job==='MNK')for(const page of[p,o])await page.waitForFunction(id=>{const v=window.__vanai,a=id?v.remotes().get('p'+id):v.avatar();return a?.weapon?.name.endsWith('_r_palm')&&a.root.getChildMeshes().filter(m=>/^wp_.*_[lr]_(palm|wrist)$/.test(m.name)).length===4},page===p?null:char.id);await p.screenshot({path:`${out}/equipment-${char.race}-${char.appearance.hair}-${char.appearance.beard}-${job}.png`});report.push({race:char.race,appearance:char.appearance,job,weapon:key,remote:true});console.log('self/remote equipped',char.race,char.appearance.face,job);
  }
  await send(p,'change_job',{job:char.job});await p.waitForFunction(job=>window.__vanai.state.self.job===job,char.job);await equip(weapons[char.job]);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/equipment-report.json',JSON.stringify({report,errors},null,2));
}finally{fs.writeFileSync(out+'/equipment-partial.json',JSON.stringify({report,errors},null,2));await browser.close()}
