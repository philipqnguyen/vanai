// Exercise actual keyboard input and animated character placement on the new layer.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{class QuietSocket extends EventTarget{static OPEN=1;readyState=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')))}send(){}close(){}}window.WebSocket=QuietSocket;});
 await page.goto(BASE+'/?heartwood-city&race=karrog&district=Rope%20bridge&daytime=.22');
 await page.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 const results=[];
 for(const mode of ['bridge','ring','stairs']){
  await page.evaluate(mode=>{const v=window.__heartwoodCity,u=v.inspectCity().upper;let p;
   if(mode==='bridge'){const b=u.bridge;p=[(b.a[0]+b.b[0])/2,24-b.sag,(b.a[2]+b.b[2])/2];}
   else if(mode==='ring'){const r=u.rings[0];p=[r.tree.x,r.y,r.tree.z-r.r];}
   else{const s=u.stair;p=s.foot.map((n,i)=>n+(s.top[i]-n)*.25);}
   v.teleport(p[0],p[2],p[1]);v.setHeading(Math.PI/2);v.camera.alpha=Math.PI;v.camera.beta=1.4;v.camera.radius=7;
   document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
  },mode);
  await page.waitForTimeout(350);const start=await page.evaluate(()=>window.__heartwoodCity.pos.asArray());
  await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');
  const end=await page.evaluate(()=>{const v=window.__heartwoodCity,p=v.pos;return{p:p.asArray(),floor:v.ground(p.x,p.z,p.y),camera:v.camera.globalPosition.asArray(),visible:v.player.root.isEnabled()};});
  results.push({mode,start,...end,travel:Math.hypot(end.p[0]-start[0],end.p[2]-start[2])});
  await page.screenshot({path:`.playwright-mcp/heartwood-city/walking-upper-${mode}.png`});
 }
 fs.writeFileSync('.playwright-mcp/heartwood-city/upper-walk.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
 if(errors.length||results.some(r=>r.travel<.3||Math.abs(r.p[1]-r.floor)>.04||!r.visible))process.exitCode=1;
}finally{await browser.close();}
