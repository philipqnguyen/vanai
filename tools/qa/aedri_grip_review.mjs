import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const out='.playwright-mcp/aedri-grip';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const p=await browser.newPage({viewport:{width:1000,height:1000}});p.on('pageerror',e=>console.error(e.message));
 for(const face of ['male','female']){
  await p.goto(QA_BASE+'/?character-preview');await p.waitForFunction(()=>window.__characterPreview);await p.evaluate(face=>window.postMessage({type:'character-appearance',race:'aedri',job:'PLD',appearance:{face,hair:'none'}},location.origin),face);await p.waitForFunction(()=>{const a=window.__characterPreview.avatar();if(a)a.combatUntil=Infinity;return a?.model&&a.weapon?.parent?.name==='handslot.r';});await p.waitForTimeout(300);
  await p.evaluate(()=>{const v=window.__characterPreview;v.scene.getEngine().stopRenderLoop();const label=document.createElement('div');label.id='grip-label';label.style.cssText='position:fixed;top:16px;left:16px;color:white;background:#152132df;padding:14px;font:22px system-ui;pointer-events:none';document.body.append(label)});
  for(const view of ['front','side','three']){
   const info=await p.evaluate(({face,view})=>{const v=window.__characterPreview,a=v.avatar(),s=v.scene;const hand=a.model.root.getDescendants(false).find(n=>n.name==='hand_r');a.model.groups.forEach(g=>g.stop());const g=a.model.groups.get('vanai:Idle_Stand_v01');g.start(true,1);g.goToFrame(.2*(g.to-g.from));g.pause();s.onBeforeAnimationsObservable.notifyObservers(s);hand.computeWorldMatrix(true);v.camera.setTarget(a.weapon.parent.getAbsolutePosition().clone());v.camera.alpha={front:Math.PI/2,side:0,three:.8}[view];v.camera.minZ=.005;v.camera.beta=1.35;v.camera.lowerRadiusLimit=.1;v.camera.radius=.6;document.querySelector('#grip-label').textContent=`Aedri ${face} · idle · ${view} · ${new URLSearchParams(location.search).get('x')??'grip'}`;s.render();return{hand:hand.getAbsolutePosition().asArray(),weapon:a.weapon.getAbsolutePosition().asArray(),slot:a.weapon.parent.position.asArray(),prop:a.weapon.position.asArray()};},{face,view});console.log(face,view,JSON.stringify(info));await p.waitForTimeout(150);await p.evaluate(()=>window.__characterPreview.scene.render());await p.screenshot({path:`${out}/${process.env.GRIP_LABEL??'before'}-${face}-${view}.png`});
  }
 }
}finally{await browser.close()}
