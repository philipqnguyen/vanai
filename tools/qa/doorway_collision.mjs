// Exercise the real builder/resolver for every door face and rotated house variant.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const page=await browser.newPage();
// (S5, the Moonmere rebuild: the host zone only has to build town.ts houses for the wait below -- the
// cases are built on their own flat pad. The new Moonmere builds none (MOONMERE.md), so the host is a
// zone that still does; pass another as the third argument)
await page.goto((process.argv[2]??QA_BASE)+`/?zone=${process.argv[3]??'heartwoodfields'}&daytime=.25`);
await page.waitForFunction(()=>window.__zv?.inspectHouses().length>0,null,{timeout:180000});
const results=await page.evaluate(async()=>{
 const loaded=name=>performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname===`/src/${name}.ts`).name;
 const m=await import(loaded('scene')),town=await import(loaded('town'));m.engine.stopRenderLoop();
 // Build the variants on a flat test pad, independent of the city terraces.
 m.buildApi.surface=m.buildApi.ground=()=>0;
 m.buildApi.addFlatZone(-30,30,-30,30,0);
 const results=[];
 // (the old Moonmere's 3.6 m storey and its town.ts branches went with the old city: MOONMERE.md)
 for(const face of ['pz','nz','px','nx'])for(const yaw of [0,.37,Math.PI/2])for(const walkable of [false,true]){
  m.colliders.length=m.boxColliders.length=m.circleColliders.length=0;
  m.inspectStairBodies().length=0;
  town.makeHouse({cx:0,cz:0,y:0,span:8,len:12,storeys:3,yaw,door:face,steps:'narrow',walkable,seed:17});
  const [lx,lz,ux,uz]=face==='pz'?[1,6,0,1]:face==='nz'?[1,-6,0,-1]:face==='px'?[4,1,1,0]:[-4,1,-1,0];
  const c=Math.cos(yaw),s=Math.sin(yaw),x=lx*c+lz*s,z=-lx*s+lz*c,nx=ux*c+uz*s,nz=-ux*s+uz*c;
  const cross=(level,outward)=>{let px=x+nx*(outward?-2.7:1.5),pz=z+nz*(outward?-2.7:1.5);const tx=x+nx*(outward?1.5:-2.7),tz=z+nz*(outward?1.5:-2.7);for(let i=1;i<=60;i++){const wantX=px+(tx-px)/(61-i),wantZ=pz+(tz-pz)/(61-i),[a,b]=m.resolveCollision(px,pz,wantX,wantZ,level);if(Math.hypot(a-wantX,b-wantZ)>.001)return false;px=a;pz=b;}return true;};
  const storey=3.125,ground=cross(0,false),upper=[1,2].map(level=>cross(level*storey,true));
  results.push({face,yaw,walkable,ground,upper,ok:ground===walkable&&upper.every(v=>!v)});
 }
 return results;
});
fs.writeFileSync('.playwright-mcp/doorway-collision.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({cases:results.length,failed:results.filter(r=>!r.ok)}));
await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
