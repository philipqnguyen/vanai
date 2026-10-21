// Continuous ground-to-canopy round trip across every branch of the upper network.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const out='.playwright-mcp/heartwood-third-bough';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/?heartwood-city&race=karrog&daytime=.22');await p.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 const result=await p.evaluate(()=>{
  const v=window.__heartwoodCity,u=v.inspectCity().upper;v.scene.getEngine().stopRenderLoop();
  const st=u.stair,root=u.rings[0],xy=p=>[p[0],p[2],p[1]],points=[st.foot,st.top,st.landing].map(xy);
  const angle=(r,p)=>Math.atan2(p[0]-r.tree.x,p[2]-r.tree.z),arc=(r,a,b)=>Array.from({length:241},(_,i)=>{const q=a+(b-a)*i/240;return[r.tree.x+Math.sin(q)*r.r,r.tree.z+Math.cos(q)*r.r,r.y];});
  const start=angle(root,st.landing);let a=start;
  for(const bridge of u.bridges){
   const from=u.rings.find(r=>r.tree.name===bridge.from),to=u.rings.find(r=>r.tree.name===bridge.to);
   if(from!==root)throw new Error('This round-trip fixture expects bridges from the entry ring');
   const b=angle(from,bridge.a);points.push(...arc(root,a,b+Math.PI*2));
   const crossing=Array.from({length:241},(_,i)=>{const t=i/240;return[bridge.a[0]+(bridge.b[0]-bridge.a[0])*t,bridge.a[2]+(bridge.b[2]-bridge.a[2])*t,24-bridge.sag*Math.sin(Math.PI*t)**2];});
   const arrival=angle(to,bridge.b);points.push(...crossing,...arc(to,arrival,arrival+Math.PI*2),...crossing.slice().reverse());a=b;
  }
  points.push(...arc(root,a,start),...([st.landing,st.top,st.foot].map(xy)));
  let [x,z,y]=points[0];const upperHistory=[],failures=[];
  for(const target of points.slice(1)){const ax=x,az=z,n=Math.ceil(Math.hypot(target[0]-x,target[1]-z)/.12);
   for(let i=1;i<=n;i++){const nx=ax+(target[0]-ax)*i/n,nz=az+(target[1]-az)*i/n,[rx,rz]=v.resolveCollision(x,z,nx,nz,y),ny=v.ground(rx,rz,y);if(Math.hypot(rx-nx,rz-nz)>.025||Math.abs(ny-y)>.4){failures.push({at:[nx,nz,ny],from:[x,z,y],hit:v.debugHit(nx,nz,y)});break;}x=rx;z=rz;y=ny;upperHistory.push([x,z,y]);}
  }
  return{upperHistory,failures,bridges:u.bridges.map(b=>b.name),end:[x,z,y]};
 });result.errors=errors;fs.writeFileSync(`${out}/history.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({samples:result.upperHistory.length,failures:result.failures,bridges:result.bridges,end:result.end,errors}));if(result.failures.length||errors.length)process.exitCode=1;
}finally{await browser.close();}
