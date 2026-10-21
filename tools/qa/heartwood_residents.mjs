// Measure the rendered residents against the actual rooms, furniture and floors.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const out='.playwright-mcp/heartwood-residents';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try {
 const p=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await p.goto(BASE+'/?heartwood-city&daytime=.22');
 await p.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 // actors stay hidden until dressed and posed (client/src/actor-reveal.ts)
 await p.waitForFunction(()=>{const v=window.__heartwoodCity;return v.npcs.every(n=>v.scene.getTransformNodeByName(`avroot_npc_${n.id}`)?.isEnabled());},null,{timeout:240000});
 await p.waitForTimeout(1500);
 const report=await p.evaluate(async()=>{
  const v=window.__heartwoodCity,s=v.scene,plan=v.inspectCity();s.getEngine().stopRenderLoop();
  const B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name);
  const failures=[],residents=v.npcs.filter(n=>n.resident),placements=[];
  for(const n of residents){
   const y=n.y??v.ground(n.x,n.z),h=plan.homes.find(h=>h.name===n.home),root=s.getTransformNodeByName(`avroot_npc_${n.id}`);
   const meshes=root?.getChildMeshes().filter(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices());
   if(!meshes?.length)failures.push({id:n.id,reason:'missing rendered model'});
   if(!root||Math.abs(root.position.y-y)>.01)failures.push({id:n.id,reason:'rendered root height'});
   const feet=meshes?.reduce((lo,m)=>{m.computeWorldMatrix(true);return Math.min(lo,m.getBoundingInfo().boundingBox.minimumWorld.y)},Infinity);
   if(!Number.isFinite(feet)||Math.abs(feet-y)>.2)failures.push({id:n.id,reason:'visible feet height',feet,y});
   for(let i=0;i<12;i++){
    const a=i*Math.PI/6,x=n.x+Math.sin(a)*.6,z=n.z+Math.cos(a)*.6;
    if(v.debugHit(x,z,y)!=='clear'||Math.abs(v.ground(x,z,y)-y)>.22)failures.push({id:n.id,reason:'standing clearance',x,z});
   }
   if(h){
    if(Math.hypot(n.x-h.x,n.z-h.z)>h.r-1||Math.abs(y-h.y)>.01)failures.push({id:n.id,reason:'outside assigned home'});
    const dx=Math.sin(h.door),dz=Math.cos(h.door),doorDistance=Math.hypot(n.x-h.x-dx*h.r,n.z-h.z-dz*h.r);
    if(doorDistance<3)failures.push({id:n.id,reason:'blocks doorway'});
    // Walk from the front room into speaking range without furniture collision.
    let x=h.x+dx*2,z=h.z+dz*2;
    for(let i=0;i<40;i++){const d=Math.hypot(n.x-x,n.z-z);if(d<1.8)break;const nx=x+(n.x-x)/d*.15,nz=z+(n.z-z)/d*.15,[rx,rz]=v.resolveCollision(x,z,nx,nz,y);if(Math.hypot(rx-nx,rz-nz)>.03){failures.push({id:n.id,reason:'blocked approach'});break;}x=rx;z=rz;}
    const hit=s.pickWithRay(new B.Ray(new B.Vector3(n.x,y+.3,n.z),new B.Vector3(0,-1,0),.6),m=>m.name.startsWith('hw_'));
    if(!hit?.hit||Math.abs(hit.pickedPoint.y-y)>.03)failures.push({id:n.id,reason:'missing rendered home floor'});
   }else if(plan.homes.some(h=>Math.abs(h.y-y)<1.4&&Math.hypot(n.x-h.x,n.z-h.z)<h.r))failures.push({id:n.id,reason:'outdoor resident inside home'});
   placements.push({id:n.id,home:n.home??null,x:n.x,z:n.z,y,feet,meshes:meshes?.length});
  }
  for(let i=0;i<v.npcs.length;i++)for(const other of v.npcs.slice(i+1)){const n=v.npcs[i];if(!n.resident&&!other.resident)continue;if(Math.abs((n.y??v.ground(n.x,n.z))-(other.y??v.ground(other.x,other.z)))<2&&Math.hypot(n.x-other.x,n.z-other.z)<1.2)failures.push({id:n.id,other:other.id,reason:'overlapping residents'});}
  return{total:v.npcs.length,added:residents.length,indoor:residents.filter(n=>n.home).length,upper:residents.filter(n=>n.site==='upper_boughs').length,placements,homes:plan.homes,failures};
 });
 const baseline=`${out}/before-city.json`;
 if(fs.existsSync(baseline)){const before=JSON.parse(fs.readFileSync(baseline)).homes;for(const h of before){const current=report.homes.find(c=>c.name===h.name);if(!current||['x','z','y','r','door'].some(k=>Math.abs(h[k]-current[k])>1e-8))report.failures.push({home:h.name,reason:'existing home moved'});}}
 for(const [shot,id]of [['ground-home','hw_resident_agnes_reed'],['upper-home','hw_resident_simon_root'],['market','hw_resident_olwen_willow'],['waterfront','hw_resident_sella_reed'],['upper-walk','hw_resident_merrin_oak']]){
  await p.evaluate(async id=>{const v=window.__heartwoodCity,s=v.scene,n=v.npcs.find(n=>n.id===id),B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name),a=n.h??Math.PI,d=n.home?4.2:6;
   v.player.root.setEnabled(false);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
   const c=new B.UniversalCamera('resident review',new B.Vector3(n.x+Math.sin(a)*d,n.y+2.4,n.z+Math.cos(a)*d),s);c.minZ=.06;c.fov=1.1;c.setTarget(new B.Vector3(n.x,n.y+1,n.z));s.activeCamera=c;for(let i=0;i<8;i++)s.render();
  },id);await p.screenshot({path:`${out}/${shot}.png`});
 }
 report.errors=errors;fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,added:report.added,indoor:report.indoor,upper:report.upper,failures:report.failures,errors}));
 if(report.failures.length||errors.length||report.added!==30||report.indoor!==15)process.exitCode=1;
}finally{await browser.close();}
