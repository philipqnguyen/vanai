// Rendered aperture, headroom, tread and guard checks complement the movement audit.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Freeze this review build while unrelated files continue changing in Vite.
 await page.addInitScript(()=>{class QuietSocket extends EventTarget{static OPEN=1;readyState=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')))}send(){}close(){}}window.WebSocket=QuietSocket;});
 await page.goto(BASE+'/?heartwood-city&race=karrog&daytime=.22');
 await page.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:180000});
 const start=await page.evaluate(()=>window.__heartwoodCity.pos.asArray());
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const end=await page.evaluate(()=>window.__heartwoodCity.pos.asArray());
 const travel=Math.hypot(end[0]-start[0],end[2]-start[2]);
 const report=await page.evaluate(async()=>{
  const v=window.__heartwoodCity,s=v.scene;s.getEngine().stopRenderLoop();
  const B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name),plan=v.inspectCity();
  const ray=(p,d,len)=>s.pickWithRay(new B.Ray(new B.Vector3(...p),new B.Vector3(...d),len),m=>m.name.startsWith('hw_')&&m.isEnabled());
  const apertures=plan.homes.map(h=>{const dx=Math.sin(h.door),dz=Math.cos(h.door),hits=[];
   for(const across of [-1.25,0,1.25])for(const up of [.3,1.55,2.35]){const p=[h.x+dx*(h.r+1.6)+dz*across,h.y+up,h.z+dz*(h.r+1.6)-dx*across],hit=ray(p,[-dx,0,-dz],3.2);if(hit?.hit)hits.push({across,up,mesh:hit.pickedMesh.name});}
   return{name:h.name,hits};
  });
  const headroom=plan.homes.map(h=>{const heights=[];for(let i=0;i<9;i++){const a=i*Math.PI/4,d=i===8?0:1.3,hit=ray([h.x+Math.sin(a)*d,h.y+2.4,h.z+Math.cos(a)*d],[0,1,0],6);heights.push(hit?.hit?hit.distance+2.4:0);}return{name:h.name,min:Math.min(...heights)};});
  const stairs=plan.terraces.map(t=>{let maxGap=0,missing=0;for(let i=0;i<=180;i++){const u=i/180,x=t.foot[0]+(t.top[0]-t.foot[0])*u,z=t.foot[1]+(t.top[1]-t.foot[1])*u,y=v.ground(x,z,t.ground+(t.y-t.ground)*u),hit=ray([x,y+.35,z],[0,-1,0],.8);if(!hit?.hit)missing++;else maxGap=Math.max(maxGap,Math.abs(hit.pickedPoint.y-y));}return{name:t.home.name,maxGap,missing};});
  const barriers=plan.terraces.map(t=>{const x=(t.foot[0]+t.top[0])/2,z=(t.foot[1]+t.top[1])/2,y=(t.y+t.ground)/2,dx=Math.cos(t.door),dz=-Math.sin(t.door);let blocked=false;
   for(let i=1;i<=80;i++){const nx=x+dx*i*.05,nz=z+dz*i*.05,[rx,rz]=v.resolveCollision(x+dx*(i-1)*.05,z+dz*(i-1)*.05,nx,nz,y);if(Math.hypot(rx-nx,rz-nz)>.015){blocked=true;break;}}return{name:t.home.name,blocked};});
  return{apertures,headroom,stairs,barriers};
 });
 report.keyboard={start,end,travel};report.errors=errors;fs.writeFileSync('.playwright-mcp/heartwood-city/geometry.json',JSON.stringify(report,null,2));
 const failures={keyboard:travel<.3?[report.keyboard]:[],apertures:report.apertures.filter(r=>r.hits.length),headroom:report.headroom.filter(r=>r.min<4),stairs:report.stairs.filter(r=>r.missing||r.maxGap>.26),barriers:report.barriers.filter(r=>!r.blocked),errors};console.log(JSON.stringify(failures));if(Object.values(failures).some(v=>v.length))process.exitCode=1;
}finally{await browser.close();}
