// Walk the actual collision/stair geometry to every shared quest site, without an account.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const definitions=JSON.parse(fs.readFileSync('shared/data/zones.json'));
const requested=process.argv.slice(3),keys=requested.length?requested:Object.keys(definitions).filter(k=>definitions[k].sites);
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const all=[];
for(const key of keys){
 await page.goto((process.argv[2]??QA_BASE)+'/?zone='+key+'&daytime=.18');await page.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:180000});await page.waitForLoadState('networkidle',{timeout:90000});await page.waitForTimeout(1000);
 const reports=await page.evaluate(async({key,definition})=>{
  const m=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/scene.ts').name),B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name),out=[];
 const sweep=(a,x,z)=>{let p={...a};const steps=Math.ceil(Math.hypot(x-a.x,z-a.z)/.05);for(let i=1;i<=steps;i++){const nx=a.x+(x-a.x)*i/steps,nz=a.z+(z-a.z)*i/steps,[rx,rz]=m.resolveCollision(p.x,p.z,nx,nz,p.y);if(Math.hypot(rx-nx,rz-nz)>.01)return null;const y=m.groundHeight(rx,rz,p.y);if(Math.abs(y-p.y)>.9||m.debugHit(rx,rz,y)!=='clear')return null;p={x:rx,z:rz,y};}return p;};
  for(const [id,site] of Object.entries(definition.sites)){
   const house=window.__zv.inspectHouses().find(h=>h.spec.seed===site.house_seed),actual=m.inspectLevels();let start,geometryMatches=true;
   if(site.entrance){start={...site.entrance};}
   else if(house){const [x,z,y,yaw]=house.door;start={x:x-Math.sin(yaw)*1.2,z:z-Math.cos(yaw)*1.2,y};geometryMatches=Math.abs(house.y0-site.floors[0])<.001&&house.stairs.every((r,i)=>r.every((n,j)=>Math.abs(n-site.ramps[i]?.[['x0','z0','y0','x1','z1','y1'][j]])<.001));}
   else if(site.r){const r=actual.ramps.find(r=>Math.hypot((r.x0+r.x1)/2-site.cx,(r.z0+r.z1)/2-site.cz)<site.r+2&&r.y1<r.y0&&Math.abs(r.y0-site.floors[0])<.01),len=Math.hypot(r.x1-r.x0,r.z1-r.z0);start={x:r.x0-(r.x1-r.x0)/len,z:r.z0-(r.z1-r.z0)/len,y:r.y0};}
   else {const r=site.ramps[0],len=Math.hypot(r.x1-r.x0,r.z1-r.z0);start={x:r.x0-(r.x1-r.x0)/len,z:r.z0-(r.z1-r.z0)/len,y:r.y0};}
   geometryMatches&&=site.ramps.every(r=>actual.ramps.some(a=>['x0','z0','y0','x1','z1','y1','half'].every(k=>Math.abs(a[k]-r[k])<.001)));
   const targets=[...(definition.interactables??[]),...(definition.npcs??[])].filter(t=>t.site===id),routes=[];let door=null;
   for(const t of targets){
    const step=.35,queue=[{i:0,j:0,...start,parent:null}],seen=new Set(),nodeKey=n=>`${n.i},${n.j},${Math.round(n.y*20)}`;seen.add(nodeKey(queue[0]));let goal=null;
    for(let k=0;k<queue.length&&k<50000;k++){
     const n=queue[k];if(Math.hypot(n.x-t.x,n.z-t.z)<2&&Math.abs(n.y-t.y)<.2){goal=n;break;}
     for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const i=n.i+di,j=n.j+dj,x=start.x+i*step,z=start.z+j*step;if(Math.hypot(x-site.cx,z-site.cz)>(site.r??Math.hypot(site.span,site.len)/2)+2)continue;
      const point=sweep(n,x,z);if(!point)continue;const y=point.y,node={i,j,x,z,y,parent:n};const ky=nodeKey(node);if(seen.has(ky))continue;seen.add(ky);queue.push(node);
     }
    }
    const path=[];for(let n=goal;n;n=n.parent)path.push([n.x,n.z,n.y]);
    const grab=m.scene.getMeshByName('relic_'+t.id);let pick=null;
    if(grab){grab.computeWorldMatrix(true);const centre=grab.getBoundingInfo().boundingBox.centerWorld,from=centre.add(new B.Vector3(Math.sin(t.yaw??Math.PI)*3,0,Math.cos(t.yaw??Math.PI)*3)),ray=new B.Ray(from,centre.subtract(from).normalize(),5);pick=m.scene.pickWithRay(ray,mesh=>mesh===grab)?.hit??false;}
    routes.push({id:t.id,ok:!!goal,pick,visited:seen.size,path:path.reverse()});
    if(t.prop==='annex_door'){
      const ray=new B.Ray(new B.Vector3(t.x+Math.sin(t.yaw)*2,t.y+1.2,t.z+Math.cos(t.yaw)*2),new B.Vector3(-Math.sin(t.yaw),0,-Math.cos(t.yaw)),4);
      const leafHit=()=>{const root=m.scene.transformNodes.find(n=>n.name==='mi_moonmere/door.glb_obj_'+t.id);root.computeWorldMatrix(true);root.getDescendants().forEach(n=>n.computeWorldMatrix(true));m.scene.meshes.filter(mesh=>mesh.metadata?.entityId==='obj_'+t.id).forEach(mesh=>mesh.computeWorldMatrix(true));return m.scene.pickWithRay(ray,mesh=>mesh.metadata?.entityId==='obj_'+t.id&&mesh.isVisible&&mesh.visibility>0&&mesh.getTotalVertices()>0)?.hit??false;};
      door={closed:m.debugHit(t.x,t.z,t.y),leafClosed:leafHit()};m.openQuestDoor(t.id);door.open=m.debugHit(t.x,t.z,t.y);door.leafOpen=leafHit();
    }
   }
   out.push({zone:key,id,start,geometryMatches,door,routes});
  }return out;
 },{key,definition:definitions[key]});all.push(...reports);fs.writeFileSync('.playwright-mcp/quest-routes.json',JSON.stringify({sites:all,errors},null,2));console.log(JSON.stringify({key,reports:reports.map(r=>({...r,routes:r.routes.map(({path,...p})=>({...p,steps:path.length}))}))}));
}
await browser.close();if(errors.length||all.some(s=>!s.geometryMatches||(s.door&&(!s.door.closed.startsWith('box')||s.door.open!=='clear'||!s.door.leafClosed||s.door.leafOpen))||s.routes.some(r=>!r.ok||r.pick===false)))process.exitCode=1;
