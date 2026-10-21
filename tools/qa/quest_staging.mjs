// Read-only world staging evidence. Local access is not a full route proof.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const definitions=JSON.parse(fs.readFileSync('shared/data/zones.json','utf8'));
const keys=process.argv.slice(3);if(!keys.length)keys.push(...Object.keys(definitions));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await page.routeWebSocket('**',()=>{});
let failures=0;
fs.mkdirSync('.playwright-mcp/quest-staging',{recursive:true});
for(const key of keys){
 try{
  await page.goto((process.argv[2]??QA_BASE)+'/?zone='+key+'&daytime=.18');
  await page.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:180000});
  await page.waitForLoadState('networkidle',{timeout:90000});
  await page.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:90000});
  await page.waitForTimeout(1500);
  const report=await page.evaluate(async({key,def})=>{
   const url=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/scene.ts').name,m=await import(url),s=m.scene,c=s.activeCamera;
   const anchors=[];
   for(const kind of ['npcs','interactables','nodes','landmarks','portals','camps'])for(const p of def[kind]??[]){
    const radius=kind==='nodes'?6:kind==='interactables'?7:kind==='npcs'?8:p.radius??8;
    const y=p.y??m.groundHeight(p.x,p.z),access=[];
    for(const d of (kind==='camps'?[0,radius*.25,radius*.5,radius*.75,radius]:[0,1,2,3,4,5,6])){if(d>radius)continue;for(let i=0;i<(d?16:1);i++){
     const x=p.x+Math.sin(i*Math.PI/8)*d,z=p.z+Math.cos(i*Math.PI/8)*d,at=m.groundHeight(x,z,y),hit=m.debugHit(x,z,at);
     if(hit==='clear'&&(!window.__zv.shape||m.shapeNear(window.__zv.shape,x,z).inside||m.flatZones.some(f=>x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1&&Math.abs(at-f.y)<.2)))access.push({x,z,y:at,d});
    }}
    const obj=m.worldObjects.find(o=>o.id===p.id),houses=window.__zv.inspectHouses().filter(h=>Math.hypot(h.spec.cx-p.x,h.spec.cz-p.z)<Math.hypot(h.spec.span,h.spec.len)/2+8).map(h=>h.spec.seed);
    anchors.push({kind,id:p.id??p.monster??p.key,name:p.name,x:p.x,z:p.z,y,hit:m.debugHit(p.x,p.z,y),radius,monster:p.monster,count:p.count,sampledClear:access.length,accessible:access.length>0,nearestAccess:access[0]??null,nearbyHouses:houses,visual:obj?{kind:obj.kind,x:obj.x,z:obj.z,y:obj.mesh?.position.y,mesh:obj.mesh?.name}:null});
   }
   const houses=window.__zv.inspectHouses(),levels=m.inspectLevels();
   const spawn=def.spawn??{x:0,z:0},size=def.size;
   c.position.set(spawn.x+size*.35,m.groundHeight(spawn.x,spawn.z)+size*.5,spawn.z-size*.4);c.setTarget(c.position.clone().set(0,m.groundHeight(0,0),0));
   document.querySelectorAll('body > :not(canvas)').forEach(e=>{if(e.tagName!=='SCRIPT')e.style.visibility='hidden'});
   return {key,anchors,houses,levels,scope:'Actual renderer geometry and nearby interaction access; no global pathfinding or narrative staging claims.'};
  },{key,def:definitions[key]});
  await page.waitForTimeout(600);await page.screenshot({path:'.playwright-mcp/quest-staging/'+key+'.png'});
  if(errors.length)failures++;
  fs.writeFileSync('.playwright-mcp/quest-staging/'+key+'.json',JSON.stringify({...report,errors:errors.splice(0)},null,2));console.log(JSON.stringify({key,anchors:report.anchors.length,noLocalAccess:report.anchors.filter(a=>!a.accessible).map(a=>a.id)}));
 }catch(e){failures++;console.log(JSON.stringify({key,error:e.message}));fs.writeFileSync('.playwright-mcp/quest-staging/'+key+'-error.txt',e.stack);}
}
await browser.close();if(failures||errors.length)process.exitCode=1;
