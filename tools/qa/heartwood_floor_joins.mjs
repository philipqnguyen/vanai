// Regression for the coplanar overlaps and incomplete circular stair joins.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const out=process.env.VANAI_QA_OUT??'.playwright-mcp/heartwood-floor-joins';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(BASE+'/?heartwood-city&race=karrog&daytime=.22');
 await page.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 const report=await page.evaluate(()=>{
  const v=window.__heartwoodCity,s=v.scene,plan=v.inspectCity();s.getEngine().stopRenderLoop();
  const heights=[24,...plan.terraces.map(t=>t.y)],surfaces=new Map(heights.map(y=>[y,[]]));
  // Inspect actual post-merge rendered triangles, independently of the clipping helper.
  for(const m of s.meshes){if(!m.name.startsWith('hw_'))continue;const p=m.getVerticesData('position'),ix=m.getIndices();if(!p||!ix)continue;const w=m.computeWorldMatrix(true).m;
   const at=j=>{const x=p[j*3],y=p[j*3+1],z=p[j*3+2];return[x*w[0]+y*w[4]+z*w[8]+w[12],x*w[1]+y*w[5]+z*w[9]+w[13],x*w[2]+y*w[6]+z*w[10]+w[14]];};
   for(let i=0;i<ix.length;i+=3){const a=at(ix[i]),b=at(ix[i+1]),c=at(ix[i+2]);if(Math.max(a[1],b[1],c[1])-Math.min(a[1],b[1],c[1])>.0002)continue;const y=heights.find(y=>Math.abs(y-a[1])<.0002);if(y===undefined)continue;surfaces.get(y).push({p:[a,b,c],lo:[Math.min(a[0],b[0],c[0]),Math.min(a[2],b[2],c[2])],hi:[Math.max(a[0],b[0],c[0]),Math.max(a[2],b[2],c[2])]});}
  }
  const checks=[],sample=(name,y,points)=>{let samples=0,missing=0,overlaps=0;const failures=[];
   for(const [x,z]of points){let count=0,edge=false;for(const t of surfaces.get(y)){if(x<t.lo[0]||x>t.hi[0]||z<t.lo[1]||z>t.hi[1])continue;const d=t.p.map((a,i)=>{const b=t.p[(i+1)%3];return(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);});if(d.every(v=>v>=-1e-7)||d.every(v=>v<=1e-7)){if(d.some(v=>Math.abs(v)<1e-7))edge=true;else count++;}}
    if(edge)continue;samples++;if(count===0)missing++;if(count>1)overlaps++;if(count!==1&&failures.length<5)failures.push({x,z,count});
   }checks.push({name,samples,missing,overlaps,failures});};
  const strip=(x,z,a,from,to,half)=>{const p=[];for(let d=from+.017;d<to;d+=.137)for(let q=-half+.023;q<half;q+=.137)p.push([x+Math.sin(a)*d+Math.cos(a)*q,z+Math.cos(a)*d-Math.sin(a)*q]);return p;};
  for(const ring of plan.upper.rings)for(const h of ring.homes)sample(h.name,24,strip(h.x,h.z,h.door,h.r-1,ring.r-16.5+1,1.8));
  for(const br of plan.upper.bridges){const ba=Math.atan2(br.b[0]-br.a[0],br.b[2]-br.a[2]);for(const [i,p]of [br.a,br.b].entries())sample(br.name+' apron '+i,24,strip(p[0],p[2],ba+(i?Math.PI:0),-.8,4.35,1.8));}
  const st=plan.upper.stair;sample('upper stair landing',24,strip(st.top[0],st.top[2],Math.PI/2,-.08,st.landing[0]-st.top[0]+1,2.4));
  for(const t of plan.terraces){sample(t.home.name+' doorway',t.y,strip(t.home.x,t.home.z,t.door,t.home.r-2,t.home.r+2,1.7));sample(t.home.name+' stair corners',t.y,strip(t.top[0],t.top[1],t.door,-.7,.1,1.85));}
  const routes=[];
  const trace=(name,points)=>{let [x,z,y]=points[0],samples=0;for(const target of points.slice(1)){const ax=x,az=z,n=Math.ceil(Math.hypot(target[0]-x,target[1]-z)/.10);for(let i=1;i<=n;i++){const nx=ax+(target[0]-ax)*i/n,nz=az+(target[1]-az)*i/n,[rx,rz]=v.resolveCollision(x,z,nx,nz,y),ny=v.ground(rx,rz,y);if(Math.hypot(rx-nx,rz-nz)>.025||Math.abs(ny-y)>.4)return{name,ok:false,samples,at:[nx,nz,ny]};x=rx;z=rz;y=ny;samples++;}}return{name,ok:true,samples};};
  for(const ring of plan.upper.rings)for(const lane of [-1.4,0,1.4]){const pts=Array.from({length:225},(_,i)=>{const a=i/224*Math.PI*2;return[ring.tree.x+Math.sin(a)*(ring.r+lane),ring.tree.z+Math.cos(a)*(ring.r+lane),24];});routes.push(trace(ring.tree.name+' lane '+lane,[...pts,...pts.slice().reverse()]));}
  for(const br of plan.upper.bridges){const ba=Math.atan2(br.b[0]-br.a[0],br.b[2]-br.a[2]);for(const lane of [-1.65,0,1.65]){const pts=Array.from({length:181},(_,i)=>{const t=i/180;return[br.a[0]+(br.b[0]-br.a[0])*t+Math.cos(ba)*lane,br.a[2]+(br.b[2]-br.a[2])*t-Math.sin(ba)*lane,24-br.sag*Math.sin(Math.PI*t)**2];});routes.push(trace(br.name+' lane '+lane,[...pts,...pts.slice().reverse()]));}}
  return{checks,samples:checks.reduce((n,c)=>n+c.samples,0),routes,homes:plan.homes,bridges:plan.upper.bridges,joins:s.metadata.heartwoodTreeJoins};
 });
 report.errors=errors;fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(errors.length||report.checks.some(c=>c.missing||c.overlaps)||report.routes.some(r=>!r.ok)||report.joins.some(j=>j.openEdges))process.exitCode=1;
 // Match Philip's doorway, upper landing, terrace threshold and stair-corner views.
 for(const [name,eye,target]of [['upper-door',[-98,34,4],[-91,24,10]],['upper-stair',[-109,45,28],[-101,24,28]],['terrace-door',[-187,20,-64],[-174,11,-64]],['terrace-stair',[-194,23,-64],[-187,11,-64]],['bridge-east',[5,26,17],[-4,26,29]],['bridge-west',[-50,26,15],[-42,26,27]],['third-bough-wide',[-216,66,-103],[-128,24,-33]],['new-bridge',[-101,27,-15],[-123,25,-28]],['remembering-homes',[-190,37,-96],[-150,27,-61]]]){
  await page.evaluate(async({eye,target})=>{const v=window.__heartwoodCity,s=v.scene;v.player.root.setEnabled(false);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');const B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name);const camera=new B.UniversalCamera('floor review',new B.Vector3(...eye),s);camera.minZ=.06;camera.fov=1.1;camera.setTarget(new B.Vector3(...target));s.activeCamera=camera;for(let i=0;i<8;i++)s.render();},{eye,target});
  await page.screenshot({path:`${out}/${name}.png`});
 }
}finally{await browser.close();}
