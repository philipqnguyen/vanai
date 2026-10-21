import {chromium,CHANNEL,GL_ARGS,QA_BASE,API_BASE} from './lib/playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
const base=QA_BASE;
const apiBase=process.env.VANAI_QA_API??API_BASE;
const out=process.env.MEMORY_OUTPUT??'.playwright-mcp/gameplay-memory/baseline';
const laps=Number(process.env.MEMORY_LAPS??0);
assert.ok(Number.isInteger(laps)&&laps>=0&&laps<=10,'MEMORY_LAPS must be an integer from 0 through 10');
const cities=process.env.MEMORY_CITIES?process.env.MEMORY_CITIES.split(','):laps?[...Array.from({length:laps},()=>['caerdun','moonmere','heartwood','capital','capitalreturned','overseerslodge']).flat(),'caerdun']:['caerdun','moonmere','heartwood'];
const maxJsMiB=Number(process.env.MEMORY_MAX_JS_MIB??3500);
assert.ok(Number.isFinite(maxJsMiB)&&maxJsMiB>0,'MEMORY_MAX_JS_MIB must be positive');
const takeSnapshot=process.env.MEMORY_SNAPSHOT?process.env.MEMORY_SNAPSHOT!=='0':!laps;
const zones=JSON.parse(fs.readFileSync('shared/data/zones.json','utf8'));
fs.mkdirSync(out,{recursive:true});
const report={conditions:{base,apiBase,cities,laps,takeSnapshot,maxJsMiB,requireShim:process.env.MEMORY_REQUIRE_SHIM==='1',clock:'real engine frames and server gameplay',cache:'Playwright source response routing disables HTTP cache; development server',retention:'WeakRef scene history only; no screenshots, geometry copies, JSHandles or console object listeners',heap:'Two forced GC passes after real endFrame settlement; JS heap and Runtime backing storage reported separately; RSS is per process and can share pages'},visits:[],errors:[],shaderErrors:[]};
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
report.conditions.browser=browser.version();report.conditions.platform={platform:os.platform(),arch:os.arch(),release:os.release()};report.conditions.viewport={width:1280,height:800};
try{report.conditions.source={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','--binary','HEAD','--','client/src','client/package.json','client/package-lock.json','shared/data'],{maxBuffer:32*1024*1024})).digest('hex'),untracked:execFileSync('git',['ls-files','--others','--exclude-standard','--','client/src'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};}catch(error){report.conditions.sourceError=String(error);}
let ownedBrowserPid;
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
async function captureHeap(cdp,file,page){
 await cdp.send('HeapProfiler.enable');await cdp.send('Runtime.discardConsoleEntries');await cdp.send('HeapProfiler.collectGarbage');
 const temporary=file+'.partial',fd=fs.openSync(temporary,'w');let bytes=0,error;
 const chunk=({chunk})=>{if(error)return;try{const data=Buffer.from(chunk);let at=0;while(at<data.length)at+=fs.writeSync(fd,data,at,data.length-at);bytes+=data.length;}catch(e){error=e;}};
 cdp.on('HeapProfiler.addHeapSnapshotChunk',chunk);
 let timer,rejectCrash;const failed=new Promise((_,reject)=>{rejectCrash=()=>reject(Error('QA renderer crashed during heap snapshot'));page.once('crash',rejectCrash);timer=setTimeout(()=>reject(Error('Heap snapshot exceeded 120 seconds')),120000);});
 try{await Promise.race([cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,captureNumericValue:false}),failed]);if(error)throw error;}finally{clearTimeout(timer);page.off('crash',rejectCrash);cdp.off('HeapProfiler.addHeapSnapshotChunk',chunk);fs.closeSync(fd);}
 fs.renameSync(temporary,file);return{file,bytes};
}
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error'&&/shader|effect|compile|GL_|WebGL|linkProgram/i.test(message.text()))report.shaderErrors.push(message.text().slice(0,4000));});
 const cdp=await context.newCDPSession(page),browserCdp=await browser.newBrowserCDPSession();await cdp.send('Performance.enable');ownedBrowserPid=(await browserCdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser')?.id;
 await page.addInitScript(()=>{window.__memoryQA={scenes:[],modelsPending:0,outfitsPending:0,outfitsReady:new WeakSet(),failures:[]};});
 const sourceFiles=new Set(['/src/scene.ts','/src/world.ts','/src/models.ts','/src/gear/equipment.ts']);
 await page.route('**/src/**',async route=>{
  const file=new URL(route.request().url()).pathname;if(!sourceFiles.has(file))return route.continue();
  const response=await route.fetch();let body=(await response.text()).replace(/\/\/# sourceMappingURL=.*$/m,'');
  if(file==='/src/scene.ts')body+=`\n{const original=buildZone;buildZone=function(...args){const result=original.apply(this,args),q=window.__memoryQA,tag='vanai-scene:'+q.scenes.length+':'+args[0];Object.defineProperty(scene,'__vanaiHeapSceneTag',{value:tag});q.scenes.push({tag,ref:new WeakRef(scene)});return result;};}`;
  if(file==='/src/scene.ts'){
   const barrel=body.match(/from \"([^\"]*\/@babylonjs_core\.js[^\"]*)\"/);
   if(!barrel)throw Error('QA could not identify the actual Babylon barrel import');
   body+=`\nwindow.__memoryQA.effectStatus=async()=>{const b=await import(${JSON.stringify(barrel[1])}),effects=Object.entries(engine._compiledEffects).map(([key,e])=>({key:key.slice(0,160),name:String(JSON.stringify(e.name)??'').slice(0,160),refs:e._refCount??null}));return{barrel:${JSON.stringify(barrel[1])},sceneStandardIdentity:b.StandardMaterial===StandardMaterial,standardPatched:b.StandardMaterial.prototype.isReadyForSubMesh.toString().includes('observe(this)'),pbrPatched:b.PBRBaseMaterial.prototype.isReadyForSubMesh.toString().includes('observe(this)'),drawWrapperPatched:b.DrawWrapper.prototype.setEffect.toString().includes('acquisition'),effectPreparePatched:b.Effect.prototype._prepareEffect.toString().includes('this.isDisposed')&&b.Effect.prototype._prepareEffect.toString().includes('this.getEngine().isDisposed'),refSum:effects.reduce((n,e)=>n+(e.refs??0),0),refMax:Math.max(0,...effects.map(e=>e.refs??0)),effects};};`;
  }
  if(file==='/src/models.ts')for(const name of ['instantiateModel','staticTemplate','staticTemplateVariant'])body+=`\n{const original=${name};${name}=async function(...args){window.__memoryQA.modelsPending++;try{return await original.apply(this,args)}finally{window.__memoryQA.modelsPending--;}}}`;
  if(file==='/src/gear/equipment.ts')body+=`\n{const original=attachEquipment;attachEquipment=async function(...args){const q=window.__memoryQA;q.outfitsPending++;try{const result=await original.apply(this,args);if(equipmentInfo(args[0]).ready)q.outfitsReady.add(args[0]);return result;}catch(e){q.failures.push(String(e));throw e;}finally{q.outfitsPending--;}}}`;
  if(file==='/src/world.ts')body+=`\n{let savedLoops=[];const q=window.__memoryQA;q.pause=()=>{savedLoops=engine._activeRenderLoops.slice();engine.stopRenderLoop();};q.resume=()=>{for(const loop of savedLoops)engine.runRenderLoop(loop);savedLoops=[];};q.frames=(n)=>new Promise(resolve=>{let left=n;const observer=engine.onEndFrameObservable.add(()=>{if(--left<=0){engine.onEndFrameObservable.remove(observer);resolve();}});});q.status=()=>!engine?{zoneReady:false}:({zone:state.zone,zoneReady,sceneTag:scene?.__vanaiHeapSceneTag,sceneReady:scene?.isReady(),selfModel:!!myAvatar?.model,selfOutfit:!!myAvatar&&q.outfitsReady.has(myAvatar),npcExpected:ZONES[state.zone]?.npcs?.length??0,npcs:npcAvatars.size,npcModels:[...npcAvatars.values()].filter(a=>a.model).length,npcOutfits:[...npcAvatars.values()].filter(a=>q.outfitsReady.has(a)).length,modelsPending:q.modelsPending,outfitsPending:q.outfitsPending,meshes:scene?.meshes.length,textures:scene?.textures.length,engineScenes:engine.scenes.map(s=>({tag:s.__vanaiHeapSceneTag,disposed:s.isDisposed,meshes:s.meshes.length})),compiledEffects:Object.keys(engine._compiledEffects).length,endFrameObservers:engine.onEndFrameObservable._observers.length,renderLoops:engine._activeRenderLoops.length,failures:q.failures});}`;
  await route.fulfill({response,body});
 });
 const api=(endpoint,body)=>page.evaluate(async({apiBase,endpoint,body})=>{const r=await fetch(apiBase+'/api/'+endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},{apiBase,endpoint,body});
 await page.goto(base+'/?daytime=.25',{waitUntil:'domcontentloaded'});
 const accountFile=process.env.MEMORY_ACCOUNT??path.join(out,'account.json');let account;
 if(fs.existsSync(accountFile)){account=JSON.parse(fs.readFileSync(accountFile,'utf8'));assert.equal((await api('login',{email:account.email,password:account.password})).status,200);}
 else{
  const seed=Date.now().toString(36).replace(/[0-9]/g,x=>String.fromCharCode(97+Number(x)));
  account={email:'memory-qa-'+seed+'@example.invalid',password:'Memory-local-'+seed};
  fs.writeFileSync(accountFile,JSON.stringify(account,null,2),{mode:0o600});
  const registered=await api('register',account);assert.equal(registered.status,200);account.userId=registered.body.user?.id??registered.body.id??null;
  const created=await api('characters',{name:'Memory'+seed.slice(-7),race:'aedri',job:'PLD',city:cities[0],appearance:{face:'male',hair:'waves'}});assert.equal(created.status,200);account.characterId=created.body.character.id;fs.writeFileSync(accountFile,JSON.stringify(account,null,2),{mode:0o600});
 }
 report.account={userId:account.userId,characterId:account.characterId};save();
 await page.reload();await page.locator('[data-id="'+account.characterId+'"]').dblclick();
 for(const [index,city]of cities.entries()){
  const started=Date.now();
  if(index){await page.evaluate(({city,spawn})=>import('/src/net.ts').then(({send})=>send('chat',{channel:'say',msg:'/tp '+city+' '+spawn.x+' '+spawn.z})),{city,spawn:zones[city].spawn});}
  const ready=await page.waitForFunction(city=>{const q=window.__memoryQA;if(!q.status||!window.__vanai?.avatar?.()?.model)return false;const s=q.status();if(s.failures.length)throw Error(s.failures.join('\n'));return s.zone===city&&s.zoneReady&&s.sceneReady&&s.selfModel&&s.selfOutfit&&s.npcs===s.npcExpected&&s.npcModels===s.npcs&&s.npcOutfits===s.npcs&&!s.modelsPending&&!s.outfitsPending;},city,{timeout:300000});await ready.dispose();
  await page.evaluate(()=>window.__memoryQA.frames(30));await page.waitForTimeout(2000);await page.evaluate(()=>window.__memoryQA.frames(3));
  const visit={index,city,readyMs:Date.now()-started,status:await page.evaluate(()=>window.__memoryQA.status())};
  await page.evaluate(()=>window.__memoryQA.pause());await page.waitForTimeout(50);await cdp.send('Runtime.discardConsoleEntries');await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(50);await cdp.send('HeapProfiler.collectGarbage');
  visit.heap=await cdp.send('Runtime.getHeapUsage');visit.performance=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  try{const processes=(await browserCdp.send('SystemInfo.getProcessInfo')).processInfo;visit.processes=processes.map(p=>({type:p.type,pid:p.id,cpuTime:p.cpuTime}));visit.rss=execFileSync('ps',['-o','pid=,rss=,comm=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim();}catch(e){visit.processMetricError=String(e);}
  // Dereference only after the measured GC, in a completed task separate from the next collection.
  visit.sceneLiveness=await page.evaluate(()=>window.__memoryQA.scenes.map(({tag,ref})=>{const s=ref.deref();return{tag,alive:!!s,disposed:s?.isDisposed};}));
  report.visits.push(visit);save();assert.deepEqual(report.shaderErrors,[],'No shader compilation errors');console.log(JSON.stringify({index,city,readyMs:visit.readyMs,heap:visit.heap,status:visit.status,sceneLiveness:visit.sceneLiveness}));
  if(visit.heap.usedSize>=maxJsMiB*1048576){report.stop={reason:'diagnostic JS heap limit',limitMiB:maxJsMiB,actualMiB:visit.heap.usedSize/1048576,index,city};report.complete=false;save();console.log(JSON.stringify({stopped:report.stop}));break;}
  if(index===cities.length-1){report.effectStatus=await page.evaluate(()=>window.__memoryQA.effectStatus());save();if(process.env.MEMORY_REQUIRE_SHIM==='1')for(const key of ['sceneStandardIdentity','standardPatched','pbrPatched','drawWrapperPatched','effectPreparePatched'])assert.equal(report.effectStatus[key],true,key);}
  if(index===cities.length-1&&takeSnapshot){await page.waitForTimeout(100);report.snapshot=await captureHeap(cdp,path.resolve(out,'after-transitions.heapsnapshot'),page);save();console.log(JSON.stringify({snapshot:report.snapshot}));}
  if(index<cities.length-1)await page.evaluate(()=>window.__memoryQA.resume());
 }
 report.effectStatus??=await page.evaluate(()=>window.__memoryQA.effectStatus());
 assert.deepEqual(report.errors,[]);report.complete=report.visits.length===cities.length&&!report.stop;if(!report.complete)process.exitCode=2;save();console.log(JSON.stringify({complete:report.complete,stop:report.stop,account:report.account,out}));
}catch(error){report.fatal=String(error);throw error;}finally{save();let closeTimer;try{await Promise.race([browser.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Browser close timed out')),20000);})]);}catch(error){report.closeError=String(error);save();if(ownedBrowserPid){try{process.kill(ownedBrowserPid,'SIGTERM');}catch{}await new Promise(resolve=>setTimeout(resolve,1500));try{process.kill(ownedBrowserPid,0);process.kill(ownedBrowserPid,'SIGKILL');}catch{}}// A crashed CDP transport can leave Playwright handles pending forever. This is a standalone CLI.
process.exit(1);}finally{clearTimeout(closeTimer);}}
