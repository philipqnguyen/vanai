import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='.playwright-mcp/ferry',root=process.env.FERRY_QA_URL??QA_BASE;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],poses=[],decks=[];
page.on('pageerror',e=>errors.push(e.message));
let status=0;
try {
 for(const zone of ['gulf_to_caerdun','gulf_to_moonmere']) {
  await page.goto(`${root}/?zone=${zone}&at=0,-46&eye=38&look=0,0&looky=4&daytime=0.25`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__zv?.scene.isReady()&&window.__zv.scene.getTransformNodeByName('gulf_voyage_ship'));
  const deck=await page.evaluate(async()=>{
   const v=window.__zv;
   const {MeshBuilder,StandardMaterial,Color3,Ray,Vector3}=await import('/node_modules/@babylonjs/core/index.js');
   const paths=[[[3.5,0],[3.5,2.7],[5,2.7],[10,2.7],[18,2.7],[23,1]],[[3.5,0],[-4.5,0],[-4.5,5.2],[-8,5.2],[-13.2,5.2],[-17,4],[-21,2]],[[3.5,0],[-4.5,0],[-4.5,-5.2],[-8,-5.2],[-13.2,-5.2],[-17,-4],[-21,-2]]];
   const traversals=paths.map(path=>{
    let [x,z]=path[0],y=v.ground(x,z),steps=0;
    for(const [nx,nz] of [...path.slice(1),...path.slice().reverse()]) {
     const ox=x,oz=z,count=Math.max(1,Math.ceil(Math.hypot(nx-x,nz-z)/.08));
     for(let i=1;i<=count;i++) {
      const tx=ox+(nx-ox)*i/count,tz=oz+(nz-oz)*i/count;
      const next=v.resolveCollision(x,z,tx,tz,y);
      if(Math.hypot(next[0]-tx,next[1]-tz)>.001)throw Error(`Blocked at ${x},${z} toward ${tx},${tz}: ${v.debugHit(tx,tz,y)}`);
      [x,z]=next;y=v.ground(x,z,y);steps++;
     }
    }
    return {destination:path.at(-1),height:v.ground(...path.at(-1)),steps,returned:[x,z,y]};
   });
   const ship=v.scene.getTransformNodeByName('gulf_voyage_ship');
   const samples=[[23,1],[16,3],[8,3],[0,2],[-10,5.2],[-18,2]].map(([x,z])=>{
    const y=v.ground(x,z),hits=v.scene.multiPickWithRay(new Ray(new Vector3(x,8,z),new Vector3(0,-1,0),5),m=>ship.getChildMeshes().includes(m));
    const rendered=hits?.[0]?.pickedPoint.y;
    if(rendered===undefined||Math.abs(rendered-y)>.36)throw Error(`Floor mismatch ${x},${z}: ${y} vs ${rendered}`);
    return {x,z,y,rendered};
   });
   for(const [x,z] of [[23,1],[16,3],[8,3],[-10,5.2],[-18,2]]){
    const marker=MeshBuilder.CreateCapsule('qa_passenger',{height:1.8,radius:.3},v.scene);marker.position.set(x,v.ground(x,z)+.9,z);
    const mat=new StandardMaterial('qa_passenger_material',v.scene);mat.diffuseColor=new Color3(.1,.8,.9);marker.material=mat;
   }
   return {traversals,samples,cannon:v.debugHit(1,5,3.995),outside:v.walkable(24,5)};
  });
  assert.notEqual(deck.cannon,'clear');assert.equal(deck.outside,false);decks.push({zone,...deck});
  await page.screenshot({path:`${out}/${zone}-deck-traversal.png`});
 }
 for(const port of process.env.FERRY_QA_DECK_ONLY ? [] : ['moonmereshores','caerdunfields']){
  const query=port==='moonmereshores'?'at=-160,-190&eye=53&look=-190,-267&looky=5':'at=-22,217&eye=53&look=-53,288&looky=5';
  await page.goto(`${root}/?zone=${port}&${query}&ferrytime=500&daytime=0.25`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__zv?.scene.isReady()&&window.__zv.scene.getTransformNodeByName('gulf_ferry_ship'));
  for(const time of [1005,1010,1017,1020,1199,1203,1210,1215,1300]){
   await page.evaluate(time=>{const url=new URL(location.href);url.searchParams.set('ferrytime',time);history.replaceState(null,'',url);},time);
   await page.waitForTimeout(150);
   const pose=await page.evaluate(()=>{const n=window.__zv.scene.getTransformNodeByName('gulf_ferry_ship');return{visible:n.isEnabled(),x:n.position.x,z:n.position.z,yaw:n.rotation.y,...n.metadata};});
   assert.equal(pose.visible,time!==1300);poses.push({port,time,...pose});
   if(time!==1300)await page.screenshot({path:`${out}/${port}-${time}.png`});
  }
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/${process.env.FERRY_QA_DECK_ONLY ? 'deck-review' : 'visual-review'}.json`,JSON.stringify({decks,poses,errors},null,2));
 console.log(JSON.stringify({decks,poses,errors},null,2));
} catch(e) {status=1;console.error(e);await page.screenshot({path:`${out}/visual-failure.png`}).catch(()=>{});}
const timer=setTimeout(()=>process.exit(status),3000);await browser.close();clearTimeout(timer);process.exit(status);
