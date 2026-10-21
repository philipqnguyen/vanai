import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const base=QA_BASE,label=process.env.NPC_TIMING_LABEL??'baseline',runs=Number(process.env.NPC_TIMING_RUNS??2),out='.playwright-mcp/npc-integration/timing';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const results=[];
try{for(let run=0;run<runs;run++){
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{window.__np={events:[],actors:[],builds:[]};performance.setResourceTimingBufferSize(20000)});
 await page.route('**/src/**',async route=>{
  const file=new URL(route.request().url()).pathname;
  if(!['/src/scene.ts','/src/entities.ts','/src/models.ts','/src/gear/equipment.ts','/src/gear/source-domain.ts','/src/gear/identity.ts','/src/gear/underlay.ts','/src/gear/assets.ts'].includes(file)){await route.continue();return;}
  const response=await route.fetch();let body=(await response.text()).replace(/\/\/# sourceMappingURL=.*$/m,'');
  const sync=name=>`{const original=${name};${name}=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{window.__np.events.push({name:'${name}',ms:performance.now()-t})}}}`;
  const asyncWrap=name=>`{const original=${name};${name}=async function(...args){const t=performance.now();try{return await original.apply(this,args)}finally{window.__np.events.push({name:'${name}',ms:performance.now()-t})}}}`;
  if(file==='/src/scene.ts')body+=`\n{const original=buildZone;buildZone=function(...args){const b={start:performance.now()};window.__np.builds.push(b);try{return original.apply(this,args)}finally{b.syncMs=performance.now()-b.start;window.__np.scene=scene;scene.onAfterRenderObservable.addOnce(()=>b.firstFrame=performance.now());}}}`;
  if(file==='/src/entities.ts')body+=`\n{const original=buildAvatar;buildAvatar=function(...args){const start=performance.now(),av=original.apply(this,args);if(args[3]){const a={id:args[0],start,syncMs:performance.now()-start,av};window.__np.actors.push(a);let model=av.model;Object.defineProperty(av,'model',{get:()=>model,set:m=>{model=m;if(m)a.bodyReady=performance.now()},configurable:true});}return av;}}`;
  if(file==='/src/gear/equipment.ts')body+=`\n{const original=attachEquipment;attachEquipment=async function(...args){const a=window.__np.actors.find(a=>a.av===args[0]);if(a)a.outfitStart=performance.now();try{return await original.apply(this,args)}finally{if(a){a.outfitReady=performance.now();a.outfitOK=equipmentInfo(args[0]).ready;}}}}`;
  if(file==='/src/models.ts')body+='\n'+asyncWrap('getContainer');
  if(file==='/src/gear/identity.ts')body+='\n'+asyncWrap('skinHash');
  if(file==='/src/gear/underlay.ts')body+='\n'+asyncWrap('validateCoverageSource');
  if(file==='/src/gear/assets.ts')body+='\n'+asyncWrap('json');
  if(file==='/src/gear/source-domain.ts')body+=`\n{const original=SourceDomainCoverage.prototype.setActive;SourceDomainCoverage.prototype.setActive=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{window.__np.events.push({name:'coverage.setActive',ms:performance.now()-t})}}}`;
  await route.fulfill({response,body});
 });
 const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 await page.goto(base+'/?heartwood-city&daytime=.25',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>{const p=window.__np;return p.actors.length===40&&p.actors.every(a=>a.bodyReady&&(!a.av.modelVariant?.endsWith('-quaternius')||a.outfitOK))&&p.scene?.isReady()},null,{timeout:240000});
 const ready=await page.evaluate(()=>performance.now());
 const result=await page.evaluate(({ready,label,run})=>{const p=window.__np,b=p.builds.at(-1),start=Math.min(...p.actors.map(a=>a.start)),end=Math.max(...p.actors.map(a=>a.outfitReady??a.bodyReady));return{label,run,staticBuildMs:b.syncMs,buildStart:b.start,npcStart:start,allModelsMs:Math.max(...p.actors.map(a=>a.bodyReady))-start,allOutfitsMs:end-start,allReadyFromBuildMs:ready-b.start,allReadyFromNavigationMs:ready,firstFrameFromBuildMs:b.firstFrame-b.start,actors:p.actors.map(({av,...a})=>({...a,variant:av.modelVariant??'legacy',vertices:av.root.getChildMeshes().reduce((n,m)=>n+m.getTotalVertices(),0)})),events:p.events,meshes:p.scene.meshes.length,renderer:(()=>{const gl=p.scene.getEngine()._gl,d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()}},{ready,label,run});
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(`${out}/${label}-${run}.cpuprofile`,JSON.stringify(profile));
 const byId=new Map(profile.nodes.map(n=>[n.id,n]));const cpu=new Map();for(let i=0;i<profile.samples.length;i++){const n=byId.get(profile.samples[i]),key=n.callFrame.functionName+' '+n.callFrame.url.split('?')[0].split('/').at(-1)+':'+(n.callFrame.lineNumber+1);cpu.set(key,(cpu.get(key)||0)+profile.timeDeltas[i]/1000)}
 result.topCpu=[...cpu].sort((a,b)=>b[1]-a[1]).slice(0,35);result.errors=errors;result.characterRequests=requests.filter(u=>/\/models\/.*\.(glb|gltf)/.test(u));results.push(result);fs.writeFileSync(`${out}/${label}.json`,JSON.stringify(results,null,2));
 await page.screenshot({path:`${out}/${label}-${run}.png`});console.log(JSON.stringify({label,run,staticBuildMs:result.staticBuildMs,allModelsMs:result.allModelsMs,allOutfitsMs:result.allOutfitsMs,allReadyFromBuildMs:result.allReadyFromBuildMs,errors}));
 await context.close();
}}finally{await browser.close()}
