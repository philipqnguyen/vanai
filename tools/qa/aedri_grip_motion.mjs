import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
const out='.playwright-mcp/aedri-grip';fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});const report=[],errors=[];
try{
 const p=await browser.newPage({viewport:{width:900,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(QA_BASE+'/?character-preview');await p.waitForFunction(()=>window.__characterPreview);
 await p.evaluate(()=>{window.__characterPreview.scene.getEngine().stopRenderLoop();const label=document.createElement('div');label.id='grip-label';label.style.cssText='position:fixed;top:12px;left:12px;color:white;background:#152132df;padding:12px;font:20px system-ui';document.body.append(label)});
 const clips={PLD:'ual1:Sword_Attack_Standing',SAM:'ual2:Sword_Regular_A',DRK:'ual2:Sword_Heavy_A',BLM:'ual1:Sword_Attack_Standing',WHM:'ual1:Sword_Attack_Standing',MNK:'ual1:Punch_Cross'};
 for(const face of ['male','female'])for(const job of Object.keys(clips)){
  await p.evaluate(({face,job})=>window.postMessage({type:'character-appearance',race:'aedri',job,appearance:{face,hair:'none'}},location.origin),{face,job});await p.waitForFunction(job=>{const a=window.__characterPreview.avatar();if(a)a.combatUntil=Infinity;return a?.jobRef===job&&a.model&&a.weapon?.parent?.name===(job==='MNK'?'hand_r':'handslot.r')},job);
  for(const [state,clip,phase] of [['idle','vanai:Idle_Stand_v01',.2],['attack-start',clips[job],.1],['attack-strike',clips[job],.4],['attack-finish',clips[job],.8],['cast','ual1:Spell_Simple_Shoot',.4]]){
   const info=await p.evaluate(({face,job,state,clip,phase})=>{const v=window.__characterPreview,a=v.avatar(),s=v.scene;s.onBeforeAnimationsObservable.notifyObservers(s);s.animationGroups.forEach(g=>g.stop());const g=a.model.groups.get(clip);g.start(false,1);g.goToFrame(g.from+(g.to-g.from)*phase);g.pause();const slot=a.model.root.getDescendants(false).find(n=>n.name==='handslot.r'),left=a.model.root.getDescendants(false).find(n=>n.name==='handslot.l');slot.computeWorldMatrix(true);left.computeWorldMatrix(true);v.camera.minZ=.005;v.camera.lowerRadiusLimit=.1;v.camera.setTarget(slot.getAbsolutePosition().clone());v.camera.radius=.7;v.camera.alpha=.8;v.camera.beta=1.35;document.querySelector('#grip-label').textContent=`Aedri ${face} · ${job} · ${state}`;s.render();return {face,job,state,clip,phase,slot:slot.position.asArray(),leftSlot:left.position.asArray(),prop:a.weapon.position.asArray(),scale:a.weapon.scaling.asArray(),rotation:a.weapon.rotationQuaternion?.asArray(),sourceSpeed:g.speedRatio};},{face,job,state,clip,phase});
   await p.waitForTimeout(80);await p.evaluate(()=>window.__characterPreview.scene.render());await p.screenshot({path:`${out}/${face}-${job}-${state}-close.png`});assert.equal(info.sourceSpeed,1);report.push(info);
   if(state==='attack-strike'&&['SAM','DRK','BLM'].includes(job)){await p.evaluate(()=>{const v=window.__characterPreview;v.camera.target.set(0,.95,0);v.camera.radius=3.3;v.scene.render()});await p.screenshot({path:`${out}/${face}-${job}-${state}-body.png`});}
  }
  if(job==='PLD'){
   fs.mkdirSync(`${out}/${face}-frames`,{recursive:true});
   for(let i=0;i<20;i++){await p.evaluate(i=>{const v=window.__characterPreview,g=v.avatar().model.groups.get('ual1:Sword_Attack_Standing');v.scene.animationGroups.forEach(a=>a.stop());g.start(false,1);g.goToFrame(g.from+(g.to-g.from)*i/19);g.pause();v.camera.target.set(0,1.05,0);v.camera.radius=3.1;document.querySelector('#grip-label').textContent='Source sword attack · fixed palm attachment';v.scene.render()},i);await p.screenshot({path:`${out}/${face}-frames/${String(i).padStart(3,'0')}.png`});}
  }
  console.log('sampled',face,job);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/motion-review.json',JSON.stringify({report,errors},null,2));
}finally{await browser.close()}
