// Walk the approved roads, boardwalk and shallows through swept collision checks.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']}),page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await page.goto((process.argv[2]??QA_BASE)+'/?zone=reservoir&daytime=.18');await page.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:180000});await page.waitForLoadState('networkidle');
const report=await page.evaluate(async()=>{
 const m=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/scene.ts').name);
 const sweep=(a,x,z)=>{let p=a;const count=Math.ceil(Math.hypot(x-a.x,z-a.z)/.15);for(let i=1;i<=count;i++){const nx=a.x+(x-a.x)*i/count,nz=a.z+(z-a.z)*i/count,[rx,rz]=m.resolveCollision(p.x,p.z,nx,nz,p.y);if(Math.hypot(rx-nx,rz-nz)>.01)return null;const y=m.groundHeight(rx,rz,p.y);if(Math.abs(y-p.y)>.9||m.debugHit(rx,rz,y)!=='clear')return null;p={x:rx,z:rz,y};}return p;};
 const leg=(start,target)=>{const queue=[{...start,parent:null,cost:0}],seen=new Set(),pad=10,step=.5;let visited=0;for(let k=0;queue.length&&k<30000;k++){queue.sort((a,b)=>(b.cost+1.2*Math.hypot(b.x-target[0],b.z-target[1]))-(a.cost+1.2*Math.hypot(a.x-target[0],a.z-target[1])));const n=queue.pop();visited=k;if(Math.hypot(n.x-target[0],n.z-target[1])<1.2&&(target[2]===undefined||Math.abs(n.y-target[2])<.3)){const path=[];for(let p=n;p;p=p.parent)path.push([p.x,p.z,p.y]);return{ok:true,end:{x:n.x,z:n.z,y:n.y},path:path.reverse(),visited:k};}for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=n.x+dx*step,z=n.z+dz*step;if(x<Math.min(start.x,target[0])-pad||x>Math.max(start.x,target[0])+pad||z<Math.min(start.z,target[1])-pad||z>Math.max(start.z,target[1])+pad)continue;const id=x+','+z+','+Math.round(n.y*2);if(seen.has(id))continue;const p=sweep(n,x,z);if(p){seen.add(id);queue.push({...p,parent:n,cost:n.cost+Math.hypot(dx,dz)*step});}}}return{ok:false,visited,target};};
 const routes=[
  {name:'Camp to Bell Tower boardwalk and return',points:[[4,146],[20,121],[24,116,2.9],[41,93,2.9],[54,75,2.9],[41,93,2.9],[24,116,2.9],[4,146]]},
  {name:'Western shore road to dam crest keeper and return',points:[[4,146],[-100,150],[-165,85],[-190,-40],[-178,-104],[-172,-116.43],[-160,-116.21,10.4],[-80,-114.72,10.4],[0,-113.23,10.4],[80,-111.74,10.4],[120,-111,10.4],[80,-111.74,10.4],[0,-113.23,10.4],[-80,-114.72,10.4],[-160,-116.21,10.4],[-172,-116.43],[-178,-104],[-190,-40],[-165,85],[-100,150],[4,146]]},
  {name:'Eastern shore road to crest',points:[[4,146],[90,150],[170,125],[185,99],[205,40],[210,-40],[178,-96],[172,-110.03],[160,-110.26,10.4],[120,-111,10.4]]},
  {name:'Pike and wolves near camp',points:[[4,146],[60,100],[-40,130],[4,146]]},
  {name:'Village and west striders',points:[[4,146],[-110,75],[-85,0],[-100,-65],[-110,75],[4,146]]},
  {name:'Town-side spillway encounters',points:[[4,146],[80,90],[100,0],[130,-99],[145,-80],[65,-80],[40,-96],[65,-80],[100,0],[80,90],[4,146]]},
 ];
 return{routes:routes.map(r=>{let current={x:r.points[0][0],z:r.points[0][1],y:m.groundHeight(...r.points[0])};const legs=[];for(const target of r.points.slice(1)){const result=leg(current,target);legs.push(result);if(!result.ok)break;current=result.end;}return{name:r.name,ok:legs.length===r.points.length-1&&legs.every(l=>l.ok),legs};}),levels:m.inspectLevels()};
});
fs.writeFileSync('.playwright-mcp/reservoir-routes.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({routes:report.routes.map(r=>({...r,legs:r.legs.map(({path,...l})=>({...l,steps:path?.length}))})),errors}));await browser.close();if(errors.length||report.routes.some(r=>!r.ok))process.exitCode=1;
