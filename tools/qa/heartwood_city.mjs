import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
// BASE points the review at another dev server, e.g. a worktree's Vite on :5176.
const BASE=process.env.BASE||QA_BASE;
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 console.log('Loading Heartwood');
 // Freeze this review build while unrelated files continue changing in Vite.
 await page.addInitScript(()=>{class QuietSocket extends EventTarget{static OPEN=1;readyState=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')))}send(){}close(){}}window.WebSocket=QuietSocket;});
 await page.goto(BASE+'/?heartwood-city&daytime=.22&race=karrog');
 await page.waitForFunction(()=>window.__heartwoodCity?.player?.model&&window.__heartwoodCity.scene.isReady(),null,{timeout:240000});
 console.log('Scene and Karrog ready');
 await page.waitForTimeout(2000);
 const report=await page.evaluate(async()=>{
  const v=window.__heartwoodCity,s=v.scene,e=s.getEngine();e.stopRenderLoop();
  const loaded=n=>performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname===`/src/${n}.ts`)?.name??`/src/${n}.ts`,m={scene:s,engine:e,groundHeight:v.ground,resolveCollision:v.resolveCollision,debugHit:v.debugHit,cameraRoomAt:v.cameraRoomAt},B=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name),geometry=await import(loaded('camera_geometry'));
  window.__hwCityQA={v,m,B,geometry};
  const plan=v.inspectCity();
  const trace=(points)=>{let [x,z,y]=points[0],samples=0;for(const target of points.slice(1)){const ax=x,az=z,n=Math.ceil(Math.hypot(target[0]-x,target[1]-z)/.10);for(let i=1;i<=n;i++){const nx=ax+(target[0]-ax)*i/n,nz=az+(target[1]-az)*i/n,[rx,rz]=m.resolveCollision(x,z,nx,nz,y);if(Math.hypot(rx-nx,rz-nz)>.025)return{ok:false,samples,at:[nx,nz,y],hit:m.debugHit(nx,nz,y)};const ny=m.groundHeight(rx,rz,y);if(Math.abs(ny-y)>.4)return{ok:false,samples,at:[rx,rz,ny],drop:ny-y};x=rx;z=rz;y=ny;samples++;}}return{ok:true,samples,end:[x,z,y]};};
  const entrances=plan.homes.map(h=>{const a=h.door,dx=Math.sin(a),dz=Math.cos(a),upper=(plan.terraces.some(t=>t.home===h)||plan.upper.homes.includes(h)),start=[h.x+dx*(h.r+2),h.z+dz*(h.r+2),upper?h.y:m.groundHeight(h.x+dx*(h.r+2),h.z+dz*(h.r+2))],inside=[h.x+dx*(h.civic?3.5:1.8),h.z+dz*(h.civic?3.5:1.8),h.y];return{name:h.name,...trace([start,inside,start])};});
  const streets=plan.roads.map((r,i)=>({i,...trace((i===0?[[-306,2],...r.pts.slice(1)]:r.pts).map(p=>[...p,m.groundHeight(...p)]))}));
  const approaches=plan.spurs.map((r,i)=>({i,...trace(r.pts.map(p=>[...p,m.groundHeight(...p)]))}));
  const stairs=plan.terraces.map(t=>({name:t.home.name,...trace([[...t.foot,t.ground],[...t.top,t.y],[t.x,t.z,t.y],[t.home.x,t.home.z,t.y],[t.x,t.z,t.y],[...t.top,t.y],[...t.foot,t.ground]])}));
  const upper=plan.upper,upperRoutes=[];
  for(const ring of upper.rings)for(const lane of [-1.4,0,1.4]){
    const pts=Array.from({length:225},(_,i)=>{const a=i/224*Math.PI*2;return[ring.tree.x+Math.sin(a)*(ring.r+lane),ring.tree.z+Math.cos(a)*(ring.r+lane),ring.y];});
    upperRoutes.push({name:ring.tree.name+' ring '+lane,...trace([...pts,...pts.slice().reverse()])});
  }
  const st=upper.stair,sp=[st.foot,st.top,st.landing].map(p=>[p[0],p[2],p[1]]);
  upperRoutes.push({name:'Upper stair',...trace([...sp,...sp.slice().reverse()])});
  const br=upper.bridge,bp=Array.from({length:121},(_,i)=>{const t=i/120;return[br.a[0]+(br.b[0]-br.a[0])*t,br.a[2]+(br.b[2]-br.a[2])*t,br.a[1]+(br.b[1]-br.a[1])*t-br.sag*Math.sin(Math.PI*t)**2];});
  upperRoutes.push({name:'Rope bridge',...trace([...bp,...bp.slice().reverse()])});
  const destinations=plan.destinations.map(p=>{const y=p.y??m.groundHeight(p.x,p.z),free=[];for(let i=0;i<16;i++){const a=i*Math.PI/8,x=p.x+Math.sin(a)*(p.id?.startsWith('crystal')?5:2),z=p.z+Math.cos(a)*(p.id?.startsWith('crystal')?5:2);if(m.debugHit(x,z,y)==='clear'&&Math.abs(m.groundHeight(x,z,y)-y)<.4)free.push([x,z]);}return{id:p.id??'stage/spawn',x:p.x,z:p.z,free:free.length};});
  const frame=(n=1)=>{for(let i=0;i<n;i++){e._deltaTime=1000/60;v.camera._checkInputs();v.camera.getViewMatrix(true);}};
  const cameraFailures=[],cameraRooms=[],doorTransitions=[];let wallOrbitChecks=0;
  for(const h of plan.homes){v.teleport(h.x,h.z,h.y);v.setHeading(h.door+Math.PI);let min=Infinity;
    for(let i=0;i<8;i++){v.camera.alpha=i*Math.PI/4;v.camera.beta=1.4;frame(30);const cp=v.camera.globalPosition,room=m.cameraRoomAt(h.x,h.z,h.y);min=Math.min(min,v.camera.radius);if(!room||!geometry.cameraRoomHas(room,cp,-.12))cameraFailures.push({home:h.name,camera:cp.asArray(),reason:'outside room'});}
    cameraRooms.push({home:h.name,minRadius:min});
    // Orbit at usable positions near every wall; this is the actual controller
    // used in live play, with the same animated avatar and opaque geometry.
    for(let p=0;p<8;p++){
      const a=p*Math.PI/4,x=h.x+Math.sin(a)*(h.r-2.1),z=h.z+Math.cos(a)*(h.r-2.1);
      if(m.debugHit(x,z,h.y)!=='clear')continue;
      v.teleport(x,z,h.y);
      for(let orbit=0;orbit<8;orbit++)for(const beta of [.85,1.4,1.62]){v.camera.alpha=orbit*Math.PI/4;v.camera.beta=beta;frame(3);const cp=v.camera.globalPosition,room=m.cameraRoomAt(x,z,h.y);wallOrbitChecks++;if(!room||!geometry.cameraRoomHas(room,cp,-.10))cameraFailures.push({home:h.name,reason:'wall orbit',camera:cp.asArray()});}
    }
    const dx=Math.sin(h.door),dz=Math.cos(h.door),upper=(plan.terraces.some(t=>t.home===h)||plan.upper.homes.includes(h)),transitions=[];
    for(const direction of [1,-1])for(let i=0;i<=100;i++){
      const offset=direction===1?4-i*.075:-3.5+i*.075,x=h.x+dx*(h.r+offset),z=h.z+dz*(h.r+offset),y=upper?h.y:m.groundHeight(x,z,h.y);
      v.teleport(x,z,y);v.setHeading(h.door+(direction===1?Math.PI:0));v.camera.alpha=-h.door+(direction===1?Math.PI/2:-Math.PI/2);v.camera.beta=1.4;frame(2);
      transitions.push({offset,radius:v.camera.radius,inside:v.follow.inspect().indoors});
      const room=m.cameraRoomAt(x,z,y);if(room&&!geometry.cameraRoomHas(room,v.camera.globalPosition,-.08))cameraFailures.push({home:h.name,reason:'door transition',offset});
    }
    doorTransitions.push({home:h.name,min:Math.min(...transitions.map(t=>t.radius)),max:Math.max(...transitions.map(t=>t.radius)),entered:transitions.some(t=>t.inside)});
    // A 3m central turning circle must remain free of household furniture.
    if(!h.civic)for(let i=0;i<16;i++){const a=i*Math.PI/8,x=h.x+Math.sin(a)*1.35,z=h.z+Math.cos(a)*1.35;if(m.debugHit(x,z,h.y)!=='clear')cameraFailures.push({home:h.name,reason:'furnished turning circle',at:[x,z],hit:m.debugHit(x,z,h.y)});}

  }
  v.player.root.setEnabled(true);v.player.root.position.set(0,0,0);s.render();
  const meshes=v.player.model.root.getChildMeshes().filter(m=>m.getTotalVertices()),bounds=meshes.map(m=>{m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;return{lo:b.minimumWorld.asArray(),hi:b.maximumWorld.asArray()};});
  return{upper:plan.upper,upperRoutes,homes:plan.homes,trees:plan.trees,terraces:plan.terraces,entrances,streets,approaches,stairs,destinations,cameraFailures,cameraRooms,doorTransitions,wallOrbitChecks,avatarBounds:bounds,meshes:s.meshes.length,vertices:s.getTotalVertices()};
 });
 console.log('Navigation and camera checks done');
 fs.writeFileSync('.playwright-mcp/heartwood-city/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({failures:[...report.entrances,...report.streets,...report.approaches,...report.stairs,...report.upperRoutes].filter(r=>!r.ok),camera:report.cameraFailures}));
 fs.mkdirSync('.playwright-mcp/heartwood-city',{recursive:true});
 const views=[['crossroads',[0,14,-20],[22,40,31]],['upper-wide',[-24,52,-60],[-23,25,29]],['root-join',[-171,9.4,-40],[-159,11,-52]],['elder-root',[33,14.2,6],[32,17,19]],['branch-join',[0,48,-10],[25,52,31]],['upper-walk',[-82,26,-2],[-64,27,12]],['rope-bridge',[-42,26,26],[0,26,30]],['city-wide',[-100,95,-140],[20,33,20]],['market',[-28,14,-3],[8,21,27]],['grudge',[-128,12,-23],[-134,12,-40]],['brook',[83,12,21],[60,16,4]]];
 for(const [name,pos,target]of views){await page.evaluate(async({pos,target})=>{const {v,m,B}=window.__hwCityQA;document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');v.player.root.setEnabled(false);const cam=new B.UniversalCamera('QA',new B.Vector3(...pos),m.scene);cam.minZ=.06;cam.fov=1.12;cam.setTarget(new B.Vector3(...target));m.scene.activeCamera=cam;for(let i=0;i<12;i++){m.scene.render();await new Promise(r=>setTimeout(r,40));}},{pos,target});await page.screenshot({path:`.playwright-mcp/heartwood-city/${name}.png`});}

 for(const mode of ['interior','doorway','stair','terrace','upper-interior','upper-bridge','upper-ring']){
  await page.evaluate(async mode=>{
   const {v,m}=window.__hwCityQA,plan=v.inspectCity(),t=plan.terraces[0],h=mode.startsWith('upper-')?plan.upper.homes[2]:mode==='interior'||mode==='doorway'?plan.homes.find(h=>!h.civic&&h.r<7):t.home;
   let x=h.x,z=h.z,y=h.y;
   if(mode==='doorway'){x+=Math.sin(h.door)*(h.r-2);z+=Math.cos(h.door)*(h.r-2);}
   if(mode==='stair'){x=(t.foot[0]+t.top[0])/2;z=(t.foot[1]+t.top[1])/2;y=m.groundHeight(x,z,(t.y+t.ground)/2);}
   if(mode==='terrace'){x=t.x;z=t.z;y=t.y;}
   if(mode==='upper-bridge'){const br=plan.upper.bridge;x=(br.a[0]+br.b[0])/2;z=(br.a[2]+br.b[2])/2;y=24-br.sag;}
   if(mode==='upper-ring'){const r=plan.upper.rings[0];x=r.tree.x;z=r.tree.z-r.r;y=r.y;}
   v.teleport(x,z,y);v.setHeading(h.door+Math.PI);v.player.root.position.set(x,y,z);v.player.root.rotation.y=h.door+Math.PI;
   m.scene.activeCamera=v.camera;v.camera.alpha=-h.door+Math.PI/2;v.camera.beta=1.4;v.camera.radius=5;
   if(mode==='upper-bridge'){v.setHeading(Math.PI/2);v.player.root.rotation.y=Math.PI/2;v.camera.alpha=Math.PI;}
   if(mode==='upper-ring'){v.setHeading(Math.PI/2);v.player.root.rotation.y=Math.PI/2;v.camera.alpha=Math.PI;}
   v.camera._checkInputs();
   if(v.follow.inspect().indoors){v.camera.radius+=(1.65-v.follow.inspect().indoorRadius)*(4.5/1.65);v.camera._checkInputs();}
   for(let i=0;i<45;i++){m.engine._deltaTime=1000/60;m.scene.render();await new Promise(r=>setTimeout(r,16));}
  },mode);
  await page.screenshot({path:`.playwright-mcp/heartwood-city/third-person-${mode}.png`});
 }
 report.errors=errors;fs.writeFileSync('.playwright-mcp/heartwood-city/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({homes:report.homes.length,trees:report.trees.length,terraces:report.terraces.length,failures:[...report.entrances,...report.streets,...report.approaches,...report.stairs,...report.upperRoutes].filter(r=>!r.ok),destinations:report.destinations.filter(r=>!r.free),cameraFailures:report.cameraFailures,meshes:report.meshes,vertices:report.vertices,errors}));
 if(errors.length||report.cameraFailures.length||[...report.entrances,...report.streets,...report.approaches,...report.stairs,...report.upperRoutes].some(r=>!r.ok)||report.destinations.some(r=>!r.free))process.exitCode=1;
}finally{await browser.close();}
