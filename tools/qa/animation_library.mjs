// Development-only full catalog audit. Screenshots and results stay outside Git.
import {chromium,CHANNEL,QA_BASE} from './lib/playwright.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.playwright-mcp/animation-library';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
try{
 await page.goto(QA_BASE+'/animation-library-review.html');
 await page.waitForFunction(()=>window.__animationLibrary?.ready,null,{timeout:120000});
 await page.evaluate(()=>window.__animationLibrary.pause());
 await page.screenshot({path:out+'/initial.png'});
 if(process.argv.includes('--smoke')){console.log(await page.locator('#status').textContent());}
 else{
 const bodies=await page.evaluate(()=>Object.keys(window.__animationLibrary.library.catalog.rigs));
 const results=[];
 for(const body of bodies){
  await page.evaluate(id=>window.__animationLibrary.setBody(id),body);
  for(const pack of await page.evaluate(()=>window.__animationLibrary.library.catalog.packs.map(p=>({id:p.id,names:p.clips.map(c=>c.name)})))){
   await page.evaluate(id=>window.__animationLibrary.setPack(id),pack.id);
   for(const name of pack.names){
    const result=await page.evaluate(([name])=>{
     const api=window.__animationLibrary;api.setClip(name);let finite=true,maxPosition=0;
     for(const fraction of [0,.25,.5,.75,1]){
      api.seek(fraction);api.scene.render();
      for(const node of api.nodes.values()){
       node.computeWorldMatrix(true);const v=node.getAbsolutePosition();finite&&=Number.isFinite(v.x+v.y+v.z);maxPosition=Math.max(maxPosition,Math.abs(v.x),Math.abs(v.y),Math.abs(v.z));
      }
     }
     return {name,finite,maxPosition,targets:api.group.targetedAnimations.length,rendered:api.scene.getActiveMeshes().length};
    },[name]);
    results.push({body,pack:pack.id,...result});
   }
   for(const name of pack.names.filter(n=>/GroundSit_Idle|Sprint_Loop|Spell_Simple_Shoot|Sword_Attack_Standing|Crawl_Loop|Swim_Idle|Backflip|DoubleJump|Aerial|WallRun|Zombie|Monster/.test(n)).slice(0,12)){
    await page.evaluate(n=>{window.__animationLibrary.setClip(n);window.__animationLibrary.seek(.5);},name);
    await page.screenshot({path:`${out}/${body}-${pack.id}-${name}.png`});
   }
  }
  console.log('Audited',body,results.length,'body/clip cases');
 }
 const bad=results.filter(r=>!r.finite||!r.rendered||!r.targets);
 const report={bodies:8,clips:254,phases:5,cases:results.length,errors,bad,libraryRequests:requests.filter(s=>s.includes('/animation-library/quaternius/')),results};
 writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
 if(bad.length)throw new Error(`${bad.length} invalid cases`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
