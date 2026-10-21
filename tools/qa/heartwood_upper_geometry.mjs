import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Freeze this review build while unrelated files continue changing in Vite.
 await page.addInitScript(()=>{class QuietSocket extends EventTarget{static OPEN=1;readyState=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')))}send(){}close(){}}window.WebSocket=QuietSocket;});
 await page.goto(BASE+'/?heartwood-city&race=karrog&daytime=.22');
 await page.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 const report=await page.evaluate(async()=>{
  const v=window.__heartwoodCity,s=v.scene,e=s.getEngine();e.stopRenderLoop();const upper=v.inspectCity().upper;
  const B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name);
  const surface=(x,y,z,room=false)=>s.pickWithRay(new B.Ray(new B.Vector3(x,y+.35,z),new B.Vector3(0,-1,0),.75),m=>m.isEnabled()&&(room&&m.name.startsWith('hw_')||m.metadata?.heartwoodUpper||/hw_(upper_ring|upper_door_landing|upper_stair_tread|suspension_deck|suspension_plank)/.test(m.name)));
  const coverage=[],guards=[],ground=[];
  const probe=(name,points)=>{let missing=0,maxGap=0;for(const p of points){const hit=surface(...p,name.includes('landing'));if(!hit?.hit)missing++;else maxGap=Math.max(maxGap,Math.abs(hit.pickedPoint.y-p[1]));}coverage.push({name,samples:points.length,missing,maxGap});};
  const block=(name,x,y,z,dx,dz)=>{let blocked=false;for(let i=1;i<=80;i++){const px=x+dx*(i-1)*.06,pz=z+dz*(i-1)*.06,nx=x+dx*i*.06,nz=z+dz*i*.06,[rx,rz]=v.resolveCollision(px,pz,nx,nz,y);if(Math.hypot(rx-nx,rz-nz)>.02){blocked=true;break;}}guards.push({name,blocked});};
  for(const r of upper.rings){const points=[];for(const lane of [-1.65,0,1.65])for(let i=0;i<224;i++){const a=(i+.4)/224*Math.PI*2;points.push([r.tree.x+Math.sin(a)*(r.r+lane),r.y,r.tree.z+Math.cos(a)*(r.r+lane)]);}probe(r.tree.name,points);
   for(const a of [0,.6,1.2,2.4,3.2,4,5.4])block(r.tree.name+' outer '+a,r.tree.x+Math.sin(a)*r.r,r.y,r.tree.z+Math.cos(a)*r.r,Math.sin(a),Math.cos(a));
   for(const h of r.homes){const dx=Math.sin(h.door),dz=Math.cos(h.door),pts=[];for(let i=0;i<=32;i++)for(const lane of [-1.2,0,1.2])pts.push([h.x+dx*(h.r-1+i*.16)+dz*lane,h.y,h.z+dz*(h.r-1+i*.16)-dx*lane]);probe(h.name+' landing',pts);}
  }
  const br=upper.bridge,len=Math.hypot(br.b[0]-br.a[0],br.b[2]-br.a[2]),dx=(br.b[0]-br.a[0])/len,dz=(br.b[2]-br.a[2])/len,bp=[];
  for(let i=0;i<=180;i++){const t=i/180,x=br.a[0]+dx*len*t,z=br.a[2]+dz*len*t,y=br.a[1]+(br.b[1]-br.a[1])*t-br.sag*Math.sin(Math.PI*t)**2;for(const lane of [-1.65,0,1.65])bp.push([x+dz*lane,y,z-dx*lane]);if(i%30===0&&i>0&&i<180)for(const side of [-1,1])block('bridge '+i+'/'+side,x,y,z,dz*side,-dx*side);const gy=v.ground(x,z);if(v.debugHit(x,z,gy)==='clear')ground.push({x,z,y:gy,retained:Math.abs(v.ground(x,z,gy)-gy)<.35,headroom:y-gy});}probe('rope bridge',bp);
  const st=upper.stair,sl=Math.hypot(st.top[0]-st.foot[0],st.top[2]-st.foot[2]),sx=(st.top[0]-st.foot[0])/sl,sz=(st.top[2]-st.foot[2])/sl,sp=[];
  for(let i=0;i<=180;i++){const t=i/180,x=st.foot[0]+sx*sl*t,z=st.foot[2]+sz*sl*t,y=st.foot[1]+(st.top[1]-st.foot[1])*t;for(const lane of [-1.65,0,1.65])sp.push([x+sz*lane,v.ground(x+sz*lane,z-sx*lane,y),z-sx*lane]);if(i===90)for(const side of [-1,1])block('stair '+side,x,y,z,sz*side,-sx*side);}probe('upper stair',sp);
  return{coverage,guards,ground,treeJoins:s.metadata.heartwoodTreeJoins};
 });
 report.errors=errors;fs.writeFileSync('.playwright-mcp/heartwood-city/upper-geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({treeJoins:report.treeJoins,coverage:report.coverage,guardFailures:report.guards.filter(r=>!r.blocked),groundFailures:report.ground.filter(r=>!r.retained||r.headroom<3),errors}));
 if(errors.length||report.treeJoins.some(r=>r.openEdges)||report.coverage.some(r=>r.missing||r.maxGap>.3)||report.guards.some(r=>!r.blocked)||report.ground.some(r=>!r.retained||r.headroom<3))process.exitCode=1;
}finally{await browser.close();}
