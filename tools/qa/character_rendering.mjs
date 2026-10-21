import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/character-integration',browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const p=await browser.newPage({viewport:{width:750,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(QA_BASE+'/?character-preview');await p.waitForFunction(()=>window.__characterPreview);
 await p.evaluate(()=>window.postMessage({type:'character-appearance',race:'aedri',job:'PLD',appearance:{face:'female',hair:'braid'}},location.origin));await p.waitForFunction(()=>window.__characterPreview.avatar()?.model);await p.waitForTimeout(500);
 const result=await p.evaluate(async()=>{
  const v=window.__characterPreview,a=v.avatar(),scene=v.scene;scene.getEngine().stopRenderLoop();
  const loaded=name=>performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/'+name+'.ts');
  const {animateQuaternius,quaterniusAttack}=await import(loaded('quaternius-gameplay'));
  const {buildAvatar,disposeAvatar}=await import(loaded('entities'));
  const {Matrix,Vector3,Quaternion}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/node_modules/.vite/deps/@babylonjs_core.js'));
  const nodes=new Map(a.model.root.getDescendants(false).map(n=>[n.name,n]));const conversion=nodes.get('__root__'),inv=()=>Matrix.Invert(conversion.computeWorldMatrix(true)),pos=name=>Vector3.TransformCoordinates(nodes.get(name).computeWorldMatrix(true).getTranslation(),inv());
  const sample=(clip,time)=>{
   scene.onBeforeAnimationsObservable.notifyObservers(scene);a.model.groups.forEach(g=>g.stop());const g=a.model.groups.get(clip);g.start(true,1);g.goToFrame(time*(g.targetedAnimations[0]?.animation.framePerSecond??60));
   const before={left:pos('foot_l'),right:pos('foot_r'),hipL:pos('thigh_l'),hipR:pos('thigh_r')};scene.onAfterAnimationsObservable.notifyObservers(scene);const after={left:pos('foot_l'),right:pos('foot_r'),hipL:pos('thigh_l'),hipR:pos('thigh_r')};return{before:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.asArray()])),after:Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v.asArray()]))};
  };
  const samples=[];
  for(const yaw of [0,1.1]){a.root.rotation.y=yaw;animateQuaternius(a,'run',10);for(let i=0;i<101;i++)samples.push(sample('ual1:Sprint_Loop',i/100*20/30));}
  animateQuaternius(a,'idle',20);const unchanged=[];for(const key of a.model.groups.keys())if(!/Walk_Loop|Sprint_Loop/.test(key))unchanged.push({key,sample:sample(key,.2)});
  animateQuaternius(a,'run',30);quaterniusAttack(a,30);animateQuaternius(a,'run',30.01);const moving=sample('ual1:Sprint_Loop',.25);
  // Multiple production instances share assets but must never share pose state.
  const peers=[buildAvatar('peer-a','aedri','PLD',false,{},undefined,{face:'female',hair:'braid'}),buildAvatar('peer-b','aedri','PLD',false,{},undefined,{face:'female',hair:'braid'})];
  for(let n=0;n<600&&!peers.every(p=>p.model);n++)await new Promise(r=>setTimeout(r,50));if(!peers.every(p=>p.model))throw new Error('peer load timeout');
  const bodies=[a,...peers].map(p=>p.model.root.getChildMeshes().find(m=>m.name.startsWith('Human female'))),hair=[a,...peers].map(p=>p.model.root.getChildMeshes().find(m=>m.name.startsWith('Removable braid')));
  const sharing={geometry:bodies.map(m=>m.geometry.uniqueId),material:bodies.map(m=>m.material.uniqueId),skeleton:bodies.map(m=>m.skeleton.uniqueId),hairGeometry:hair.map(m=>m.geometry.uniqueId),hairSkeleton:hair.map(m=>m.skeleton.uniqueId)};
  const observers=scene.onAfterAnimationsObservable.observers.length;peers.forEach(disposeAvatar);await new Promise(r=>setTimeout(r,10));const observersAfter=scene.onAfterAnimationsObservable.observers.length;
  return {samples,unchanged,moving,sharing,observers,observersAfter,handedness:scene.useRightHandedSystem};
 });
 assert.equal(result.handedness,false);
 for(const {before:b,after:a}of result.samples){assert.ok(a.left[0]<b.left[0]);assert.ok(a.right[0]>b.right[0]);assert.ok(a.left[0]>a.right[0]);for(const h of ['hipL','hipR'])for(let k=0;k<3;k++)assert.ok(Math.abs(a[h][k]-b[h][k])<1e-5);}
 for(const {sample:{before,after}}of result.unchanged)assert.deepEqual(after,before);
 assert.equal(new Set(result.sharing.geometry).size,1);assert.equal(new Set(result.sharing.material).size,1);assert.equal(new Set(result.sharing.skeleton).size,3);assert.equal(new Set(result.sharing.hairGeometry).size,1);assert.deepEqual(result.sharing.hairSkeleton,result.sharing.skeleton);assert.equal(result.observers-result.observersAfter,2);assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/rendering-report.json',JSON.stringify({...result,errors},null,2));console.log('left-handed female gait, 19 untouched poses, independent skeletons/shared assets and disposal pass');
}finally{await browser.close();}
