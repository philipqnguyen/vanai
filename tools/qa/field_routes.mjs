// Full routes from each field's entry to quest-relevant world anchors.
// Camps are areas: reach a clear point inside their spawn footprint (max 24 m
// from the centre), while point interactions use their much tighter approach.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const retry=process.env.VANAI_ROUTE_RETRY==='1',reportPath=process.env.VANAI_ROUTE_REPORT??'.playwright-mcp/field-routes.json';
const defs=JSON.parse(fs.readFileSync('shared/data/zones.json')),keys=process.argv.slice(3);if(!keys.length)keys.push(...Object.keys(defs).filter(k=>defs[k].kind==='field'));
const b=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']}),p=await b.newPage(),errors=[],reports=retry?JSON.parse(fs.readFileSync(reportPath)).reports:[];p.setDefaultNavigationTimeout(180000);p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await p.routeWebSocket('**',()=>{}); // Keep this fixed renderer snapshot independent of Vite edits.
for(const key of keys){await p.goto((process.argv[2]??QA_BASE)+'/?zone='+key);await p.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:180000});await p.waitForLoadState('networkidle');await p.evaluate(()=>window.__zv.scene.getEngine().stopRenderLoop());
 await p.evaluate(async def=>{
  const m=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/scene.ts').name);
  const sweep=(a,x,z)=>{let point=a;const count=Math.ceil(Math.hypot(x-a.x,z-a.z)/.2);for(let i=1;i<=count;i++){const nx=a.x+(x-a.x)*i/count,nz=a.z+(z-a.z)*i/count;if(!within(nx,nz))return null;const [rx,rz]=m.resolveCollision(point.x,point.z,nx,nz,point.y);if(Math.hypot(rx-nx,rz-nz)>.01)return null;const y=m.groundHeight(rx,rz,point.y);if(Math.abs(y-point.y)>.9||m.debugHit(rx,rz,y)!=='clear')return null;point={x:rx,z:rz,y};}return point;};
  const within=(x,z)=>!window.__zv.shape||m.shapeNear(window.__zv.shape,x,z).inside||m.flatZones.some(f=>x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1);
  window.__fieldRoute=(t)=>{
   const start=t.start??{x:def.spawn.x,z:def.spawn.z,y:m.groundHeight(def.spawn.x,def.spawn.z)},initialHit=m.debugHit(start.x,start.z,start.y),heap=[],seen=new Set();
   const priority=n=>n.cost+(t.retry?2:1.15)*Math.hypot(n.x-t.x,n.z-t.z);
   const push=n=>{heap.push(n);let i=heap.length-1;while(i){const parent=(i-1)>>1;if(priority(heap[parent])<=priority(n))break;heap[i]=heap[parent];i=parent;}heap[i]=n;};
   const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;for(;;){const a=i*2+1;if(a>=heap.length)break;const j=a+1<heap.length&&priority(heap[a+1])<priority(heap[a])?a+1:a;if(priority(last)<=priority(heap[j]))break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
   push({...start,cost:0,parent:null});let goal=null,visited=0;const radius=t.kind==='camps'?Math.min(t.radius*.75,24):t.kind==='landmarks'?25:t.kind==='nodes'?3:2;
   for(;heap.length&&visited<(t.limit??(t.retry?60000:12000));visited++){
    const n=pop();if(Math.hypot(n.x-t.x,n.z-t.z)<radius&&(t.y===undefined||Math.abs(n.y-t.y)<.6)){goal=n;break;}
    const step=Math.hypot(n.x-t.x,n.z-t.z)<12?.5:(t.retry?1:2);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
     const x=n.x+dx*step,z=n.z+dz*step,id=x.toFixed(2)+','+z.toFixed(2)+','+Math.round(n.y*2);if(seen.has(id)||!within(x,z))continue;const point=sweep(n,x,z);if(!point)continue;seen.add(id);push({...point,cost:n.cost+Math.hypot(dx,dz)*step,parent:n});
    }
   }
   const path=[];for(let n=goal;n;n=n.parent)path.push([n.x,n.z,n.y]);return{id:t.id??t.monster,kind:t.kind,x:t.x,z:t.z,initialHit,ok:!!goal,visited,path:path.reverse()};
  };
  window.__fieldReplay=({t,path})=>{
   let current={x:def.spawn.x,z:def.spawn.z,y:m.groundHeight(def.spawn.x,def.spawn.z)};const checked=[[current.x,current.z,current.y]];
   if(m.debugHit(current.x,current.z,current.y)!=='clear')return null;
   for(const [x,z] of path){const next=sweep(current,x,z);if(!next)return null;current=next;checked.push([current.x,current.z,current.y]);}
   const radius=t.kind==='camps'?Math.min(t.radius*.75,24):t.kind==='landmarks'?25:t.kind==='nodes'?3:2;
   if(Math.hypot(current.x-t.x,current.z-t.z)>=radius||(t.y!==undefined&&Math.abs(current.y-t.y)>.6))return null;
   return{id:t.id??t.monster,kind:t.kind,x:t.x,z:t.z,initialHit:'clear',ok:true,visited:0,path:checked,reusedRoute:true};
  };
  window.__fieldReverse=t=>{
   const radius=t.kind==='camps'?Math.min(t.radius*.75,24):t.kind==='landmarks'?25:t.kind==='nodes'?3:2;
   let start;
   for(let d=0;d<radius&&!start;d+=.5)for(let i=0;i<(d?16:1);i++){
    const x=t.x+Math.sin(i*Math.PI/8)*d,z=t.z+Math.cos(i*Math.PI/8)*d,y=t.y??m.groundHeight(x,z);
    if(within(x,z)&&m.debugHit(x,z,y)==='clear'){start={x,z,y};break;}
   }
   if(!start)return null;
   const reverse=window.__fieldRoute({id:t.id??t.monster,kind:'reverse',x:def.spawn.x,z:def.spawn.z,start,retry:true,limit:25000});
   if(!reverse.ok)return null;
   let current={x:def.spawn.x,z:def.spawn.z,y:m.groundHeight(def.spawn.x,def.spawn.z)};const path=[[current.x,current.z,current.y]];
   for(const [x,z] of reverse.path.reverse()){
    const next=sweep(current,x,z);if(!next)return null;current=next;path.push([current.x,current.z,current.y]);
   }
   if(t.y!==undefined&&Math.abs(current.y-t.y)>.6)return null;
   return{id:t.id??t.monster,kind:t.kind,x:t.x,z:t.z,initialHit:m.debugHit(def.spawn.x,def.spawn.z,path[0][2]),ok:true,visited:reverse.visited,path,reverseSearch:true};
  };
 },defs[key]);
 const targets=['camps','npcs','interactables','landmarks','nodes','portals'].flatMap(kind=>(defs[key][kind]??[]).map(t=>({...t,kind,retry})));let report=reports.find(r=>r.key===key);if(!report){report={key,routes:[]};reports.push(report);}
 // Difficult narrow corridors have measured guide paths. Revalidate every
 // segment before allowing the search to reuse them in a fresh checkout.
 for(const seed of JSON.parse(fs.readFileSync(new URL('./field-route-seeds.json',import.meta.url))).routes.filter(r=>r.zone===key)){
  const end=seed.path.at(-1),t={id:'guide-'+key,kind:'guide',x:end[0],z:end[1],y:end[2]};
  const checked=await p.evaluate(args=>window.__fieldReplay(args),{t,path:seed.path});
  console.log(JSON.stringify({key,guideRouteReplayed:!!checked}));
  if(checked){report.extraRoutes??=[];report.extraRoutes.push(checked);}
 }
 for(const [index,target] of targets.entries()){const old=report.routes[index];if(retry&&old?.ok&&old.initialHit==='clear'&&old.x===target.x&&old.z===target.z)continue;// Reuse the measured route network before searching the same valley again.
  const radius=target.kind==='camps'?Math.min(target.radius*.75,24):target.kind==='landmarks'?25:target.kind==='nodes'?3:2;
  const candidates=[];
  for(const known of [...report.routes,...(report.extraRoutes??[])].filter(r=>r?.ok&&r.initialHit==='clear'))for(let i=0;i<known.path.length;i++){
   const point=known.path[i],distance=Math.hypot(point[0]-target.x,point[1]-target.z);
   if(target.y!==undefined&&Math.abs(point[2]-target.y)>.6)continue;
   candidates.push({distance,point,path:known.path,index:i});
  }
  candidates.sort((a,b)=>a.distance-b.distance);let route=null;
  if(candidates[0]?.distance<radius)route=await p.evaluate(args=>window.__fieldReplay(args),{t:target,path:candidates[0].path.slice(0,candidates[0].index+1)});
  if(!route&&candidates[0]?.distance<100){
   const c=candidates[0],leg=await p.evaluate(t=>window.__fieldRoute(t),{...target,start:{x:c.point[0],z:c.point[1],y:c.point[2]},retry:true,limit:12000});
   if(leg.ok)route=await p.evaluate(args=>window.__fieldReplay(args),{t:target,path:[...c.path.slice(0,c.index+1),...leg.path.slice(1)]});
  }
  if(!route)route=await p.evaluate(t=>window.__fieldRoute(t),target);if(!route.ok)route=await p.evaluate(t=>window.__fieldReverse(t),target)??route;report.routes[index]={...route,retry};console.log(JSON.stringify({key,...route,path:route.path.length}));fs.writeFileSync(reportPath,JSON.stringify({reports,errors},null,2));}
}
await b.close();if(errors.length||reports.some(r=>r.routes.some(t=>!t.ok||t.initialHit!=='clear')))process.exitCode=1;
