/** Real Chrome context recovery with a real PBR shader plugin: the old Moonmere's plaster
 * plugin (MoonmerePlasterPlugin), inlined below as a fixture when the old city's code was
 * retired (MOONMERE.md "The old city, retired"), so the shader and its defines are unchanged.
 * Run only when other browser/performance QA is idle:
 *   node tools/qa/effect_context_recovery.mjs --run
 * Four isolated modes: adapter disabled, ownership only, async-disposal guard
 * only, and current. Split modes restore original prototype methods before
 * constructing the engine; runtime files are never edited.
 * Settle through real renders, effect readiness and texture/define scalar state.
 * Do not replace this with scene.isReady(): that call can compile material
 * defines ahead of Babylon's BRDF before-render decode after context recovery.
 * The separate probe-control evidence is preserved in ignored QA artifacts.
 */
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.env.VANAI_GAME_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base=QA_BASE;
const out=process.env.VANAI_EFFECT_QA_OUTPUT??path.join(root,'.playwright-mcp/gameplay-memory/effect-context-recovery');
if(!process.argv.includes('--run'))throw Error('Explicit --run required; coordinate QA CPU window first');
fs.mkdirSync(out,{recursive:true});
const report={consoleErrors:[],conditions:{base,geometry:'two tiny boxes; the retired Moonmere plaster shader, inlined as a fixture',context:'real Chrome WebGL; WEBGL_lose_context extension',pixelComparison:'exact readPixels SHA256, antialias=false, fixed camera/lights',settling:'actual render frames + effect readiness/processed defines/internal texture readiness; no scene.isReady compiler probes or forced dirty',fix:'isolated pages compare disabled, ownership-only, async-guard-only, current; restore original methods before Engine for split controls',browserHeapCapOverride:false,contextLoss:true,lifecycle:'separate async-disposal tool; no scene-GC claim here'},cases:[],errors:[]};
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
try{
 report.conditions.browser=browser.version();
 for(const probe of ['render-only'])for(const adapter of ['disabled','ownership-only','async-only','current'])for(const kind of ['PBRMaterial']){
  const label=probe+'-'+adapter+'-'+kind;
  const context=await browser.newContext({viewport:{width:640,height:480},deviceScaleFactor:1}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(`${label}: ${e.message}`));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({case:label,message:m.text()});});
  const source=await page.request.get(base+'/src/babylon-effect-ownership.ts');assert(source.ok());const text=await source.text(),babylon=text.match(/from\s*["']([^"']*@babylonjs_core[^"']*)["']/)?.[1];assert(babylon,'Exact Vite Babylon URL');
  await page.route('**/__effect-ownership-browser-qa',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style><canvas id="canvas" width="640" height="480"></canvas>'}));
  await page.goto(base+'/__effect-ownership-browser-qa');const cdp=await context.newCDPSession(page);
  await page.evaluate(async({kind,babylon,adapter,probe})=>{
   const B=await import(babylon),{installBabylonEffectOwnershipFix}=await import('/src/babylon-effect-ownership.ts');
   // the old client/src/moonmere-plaster.ts, verbatim but for the types: world-space lime plaster
   class MoonmerePlasterPlugin extends B.MaterialPluginBase {
  constructor(material) { super(material,'MoonmerePlaster',210,{MOONMEREPLASTER:false}); this._enable(true); }
  getClassName() { return 'MoonmerePlasterPlugin'; }
  prepareDefines(defines) { defines.MOONMEREPLASTER=true; }
  getCustomCode(type) {
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef MOONMEREPLASTER
float mmLimeHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float mmLimeNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(mmLimeHash(i),mmLimeHash(i+vec3(1,0,0)),f.x),mix(mmLimeHash(i+vec3(0,1,0)),mmLimeHash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(mmLimeHash(i+vec3(0,0,1)),mmLimeHash(i+vec3(1,0,1)),f.x),mix(mmLimeHash(i+vec3(0,1,1)),mmLimeHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
#endif`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef MOONMEREPLASTER
vec3 mmP=vPositionW;
float mmFootprint=max(length(dFdx(mmP)),length(dFdy(mmP)));
float mmGrainFade=1.-smoothstep(.004,.025,mmFootprint);
float mmCloud=mmLimeNoise(mmP*.83)*.7+mmLimeNoise(mmP*2.1)*.3;
float mmGrain=mmLimeNoise(mmP*180.);
// Sparse, shallow trowel ridges; the mask breaks them into gentle curved marks.
float mmStroke=smoothstep(.92,.995,.5+.5*sin(mmP.y*10.+mmP.x*.7+mmP.z*.63+mmLimeNoise(mmP*.7)*5.));
mmStroke*=smoothstep(.52,.73,mmLimeNoise(mmP*1.3+vec3(8,2,5)));
surfaceAlbedo*=.9825+.035*mmCloud+(mmGrain-.5)*.012*mmGrainFade;
float mmHeight=.0007*mmStroke+.00025*mmCloud+.00012*mmGrain*mmGrainFade;
// Derivatives perturb the normal in metres without stretched UVs or tile seams.
vec3 mmDx=dFdx(mmP),mmDy=dFdy(mmP),mmR1=cross(mmDy,normalW),mmR2=cross(normalW,mmDx);
float mmDet=dot(mmDx,mmR1);
if(abs(mmDet)>.00000001)normalW=normalize(abs(mmDet)*normalW-sign(mmDet)*(dFdx(mmHeight)*mmR1+dFdy(mmHeight)*mmR2));
#endif`};
  }
   }
   const original={standard:B.StandardMaterial.prototype.isReadyForSubMesh,pbr:B.PBRBaseMaterial.prototype.isReadyForSubMesh,set:B.DrawWrapper.prototype.setEffect,dispose:B.DrawWrapper.prototype.dispose,prepare:B.Effect.prototype._prepareEffect};if(adapter!=='disabled'){installBabylonEffectOwnershipFix();if(original.standard===B.StandardMaterial.prototype.isReadyForSubMesh)throw Error('Fix did not patch actual barrel');if(adapter==='ownership-only')B.Effect.prototype._prepareEffect=original.prepare;if(adapter==='async-only'){B.StandardMaterial.prototype.isReadyForSubMesh=original.standard;B.PBRBaseMaterial.prototype.isReadyForSubMesh=original.pbr;B.DrawWrapper.prototype.setEffect=original.set;B.DrawWrapper.prototype.dispose=original.dispose;}}const flags={standard:B.StandardMaterial.prototype.isReadyForSubMesh!==original.standard,pbr:B.PBRBaseMaterial.prototype.isReadyForSubMesh!==original.pbr,set:B.DrawWrapper.prototype.setEffect!==original.set,dispose:B.DrawWrapper.prototype.dispose!==original.dispose,prepare:B.Effect.prototype._prepareEffect!==original.prepare};const ownership=adapter==='current'||adapter==='ownership-only',asyncGuard=adapter==='current'||adapter==='async-only';if(flags.standard!==ownership||flags.pbr!==ownership||flags.set!==ownership||flags.dispose!==ownership||flags.prepare!==asyncGuard)throw Error('Split control prototype mismatch');
   const engine=new B.Engine(document.getElementById('canvas'),false,{preserveDrawingBuffer:true});engine.setHardwareScalingLevel(1);
   const q=window.__effectQA={B,engine,scene:null,materials:[],meshes:[],prior:[],callbackRefs:new Map(),flags,trace:[],traceEnabled:false};
   q.frames=async(count=5)=>{for(let i=0;i<count;i++){if(q.traceEnabled)q.trace.push({at:'before-frame',textures:q.textureState()});q.engine.beginFrame();q.scene.render();q.engine.endFrame();if(q.traceEnabled)q.trace.push({at:'after-frame',textures:q.textureState()});await new Promise(r=>requestAnimationFrame(r));}};
   q.renderReady=()=>{if(q.traceEnabled)q.trace.push({at:'before-readiness-'+probe,textures:q.textureState()});const ready=(probe!=='scene-ready'||q.scene.isReady())&&q.materials.every(m=>!m._environmentBRDFTexture||m._environmentBRDFTexture._texture?.isReady)&&q.meshes.every(m=>m.subMeshes.every(s=>s.effect?.isReady()&&!s.materialDefines?.isDirty));if(q.traceEnabled)q.trace.push({at:'after-readiness-'+probe,ready,textures:q.textureState()});return ready;};q.settle=async()=>{const deadline=performance.now()+30_000;do{await q.frames(2);if(q.renderReady()){await q.frames(2);if(q.renderReady())return;}}while(performance.now()<deadline);throw Error('Scene shader/processed-defines readiness timed out');};
   q.stats=()=>{const effects=Object.values(q.engine._compiledEffects);return{effectCount:effects.length,refs:effects.map(e=>e._refCount).sort((a,b)=>a-b),disposed:effects.map(e=>e.isDisposed),callbacks:effects.map(e=>typeof e._processCodeAfterIncludes),meshEffects:q.meshes.map(m=>m.subMeshes[0]?.effect?.uniqueId),ready:q.renderReady(),endFrameObservers:q.engine.onEndFrameObservable.observers.length};};
   q.textureState=()=>q.materials.map((m,i)=>{const t=m._environmentBRDFTexture,it=t?._texture;return{material:m.name,exists:!!t,ready:it?.isReady,rgbd:t?.isRGBD,internalReady:it?.isReady,internalRGBD:it?._isRGBD,internalType:it?.type,internalSource:it?.source,internalId:it?.uniqueId,definesRGBD:q.meshes[i]?.subMeshes[0]?.materialDefines?.ENVIRONMENTBRDF_RGBD,definesDirty:q.meshes[i]?.subMeshes[0]?.materialDefines?.isDirty};});
   q.shaderState=()=>({keys:Object.keys(q.engine._compiledEffects),effects:Object.values(q.engine._compiledEffects).map(e=>({id:e.uniqueId,defines:e.defines,ready:e._isReady,disposed:e.isDisposed})),materials:q.materials.map(m=>({name:m.name,disableLighting:m.disableLighting})),submeshes:q.meshes.map(m=>m.subMeshes.map(s=>({defines:s.materialDefines?.toString(),isDirty:s.materialDefines?.isDirty,areLightsDirty:s.materialDefines?._areLightsDirty,areTexturesDirty:s.materialDefines?._areTexturesDirty}))),textures:q.textureState(),caps:{halfFloatRender:q.engine.getCaps().textureHalfFloatRender,halfFloatLinear:q.engine.getCaps().textureHalfFloatLinearFiltering,floatRender:q.engine.getCaps().textureFloatRender,floatLinear:q.engine.getCaps().textureFloatLinearFiltering,webGLVersion:q.engine.webGLVersion,standardDerivatives:q.engine.getCaps().standardDerivatives,parallelShaderCompile:!!q.engine.getCaps().parallelShaderCompile}});
   q.pixels=async()=>{await q.settle();const raw=await q.engine.readPixels(0,0,640,480),bytes=new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength),right=new Uint8Array(320*480*4);for(let y=0;y<480;y++)right.set(bytes.subarray((y*640+320)*4,(y+1)*640*4),y*320*4);const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');return{all:await hash(bytes),right:await hash(right),nonzero:bytes.some(v=>v!==0)};};
   q.makeScene=()=>{const s=new B.Scene(q.engine);s.clearColor=new B.Color4(.12,.14,.17,1);s.activeCamera=new B.ArcRotateCamera('camera',-Math.PI/2,Math.PI/2,5,new B.Vector3(0,0,-85),s);new B.HemisphericLight('light',new B.Vector3(.5,1,-.5),s);return s;};
   q.scene=q.makeScene();Object.defineProperty(q.scene,'__vanaiHeapSceneTag',{value:'vanai-scene:effect-fixture:'+kind});
   for(let i=0;i<2;i++){const mesh=B.MeshBuilder.CreateBox('box-'+i,{size:1.1},q.scene);mesh.position.set(i===0?-.8:.8,0,-85);const material=new B[kind]('material-'+i,q.scene);if(kind==='PBRMaterial'){material.albedoColor=new B.Color3(.7,.43,.24);material.metallic=0;material.roughness=.9;new MoonmerePlasterPlugin(material);}else throw Error('PBRMaterial only: the StandardMaterial fixture (MoonmerePavingWeatherPlugin) retired with the old Moonmere');mesh.material=material;q.materials.push(material);q.meshes.push(mesh);}
   await q.settle();
  },{kind,babylon,adapter,probe});
  const item={kind,adapter,probe,prototypeFlags:await page.evaluate(()=>window.__effectQA.flags)};report.cases.push(item);
  const stats=()=>page.evaluate(()=>window.__effectQA.stats());
  const assertLive=(value,refs)=>{assert.equal(value.ready,true);if(adapter==='current'||adapter==='ownership-only')assert.deepEqual(value.refs,refs);assert(value.disposed.every(v=>v===false));assert(value.callbacks.every(v=>v==='function'));};
  item.initial=await stats();assertLive(item.initial,[2]);assert.equal(new Set(item.initial.meshEffects).size,1,'Both materials share cached effect');item.before=await page.evaluate(()=>window.__effectQA.pixels());assert(item.before.nonzero);
  await page.screenshot({path:path.join(out,label+'-before.png')});
  item.dirty=[];for(let i=0;i<4;i++){await page.evaluate(async()=>{const q=window.__effectQA;for(const m of q.materials)m.markAsDirty(q.B.Material.AllDirtyFlag);await q.settle();});const value=await stats();assertLive(value,[2]);item.dirty.push(value);}
  item.afterDirty=await page.evaluate(()=>window.__effectQA.pixels());assert.equal(item.afterDirty.all,item.before.all,'Identical defines preserve exact pixels');
  await page.evaluate(async()=>{const q=window.__effectQA;for(const m of q.materials)m.disableLighting=true;await q.settle();});item.changed=await stats();assertLive(item.changed,[2]);item.changedPixels=await page.evaluate(()=>window.__effectQA.pixels());assert.notEqual(item.changedPixels.all,item.before.all,'Lighting define changes visible rendering');
  await page.evaluate(async()=>{const q=window.__effectQA;for(const m of q.materials)m.disableLighting=false;await q.settle();});item.restoredDefines=await stats();assertLive(item.restoredDefines,[2]);item.restoredPixels=await page.evaluate(()=>window.__effectQA.pixels());assert.equal(item.restoredPixels.all,item.before.all,'Restored defines reproduce exact pixels');
  item.beforeContextShaderState=await page.evaluate(()=>window.__effectQA.shaderState());
  if(true){
  await page.evaluate(async()=>{const q=window.__effectQA,gl=q.engine._gl,ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('WEBGL_lose_context unavailable');for(const[k,e]of Object.entries(q.engine._compiledEffects))q.callbackRefs.set(k,{callback:new WeakRef(e._processCodeAfterIncludes),id:e.uniqueId});q.traceEnabled=true;const lost=new Promise(resolve=>q.engine.onContextLostObservable.addOnce(resolve)),restored=new Promise(resolve=>q.engine.onContextRestoredObservable.addOnce(resolve));ext.loseContext();await lost;await new Promise(r=>setTimeout(r,100));ext.restoreContext();let timeout;try{await Promise.race([restored,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Context restore timed out')),20_000);})]);}finally{clearTimeout(timeout);}q.immediateRestored=q.shaderState();await q.settle();q.contextRestore={lost:true,restored:true,beforeKeys:[...q.callbackRefs.keys()],immediateRestored:q.immediateRestored,callbacks:Object.entries(q.engine._compiledEffects).map(([k,e])=>({key:k,beforeEffectId:q.callbackRefs.get(k)?.id??null,afterEffectId:e.uniqueId,type:typeof e._processCodeAfterIncludes,sameCallback:e._processCodeAfterIncludes===q.callbackRefs.get(k)?.callback.deref()}))};if(q.contextRestore.callbacks.some(x=>x.type!=='function'))throw Error('Live shader callback missing after context restoration');q.callbackRefs.clear();});
  item.contextRestore=await page.evaluate(()=>window.__effectQA.contextRestore);item.afterContextRestore=await stats();assertLive(item.afterContextRestore,[2]);item.contextRestoredPixels=await page.evaluate(()=>window.__effectQA.pixels());await page.screenshot({path:path.join(out,label+'-restored.png')});item.afterContextShaderState=await page.evaluate(()=>window.__effectQA.shaderState());item.exactContextPixels=item.contextRestoredPixels.all===item.before.all;const beforeDefines=new Set((item.beforeContextShaderState.submeshes[0][0].defines??'').split('\n')),afterDefines=new Set((item.afterContextShaderState.submeshes[0][0].defines??'').split('\n'));item.textureTrace=await page.evaluate(()=>window.__effectQA.trace);item.contextDefineDelta={added:[...afterDefines].filter(x=>!beforeDefines.has(x)),removed:[...beforeDefines].filter(x=>!afterDefines.has(x))};
  }else item.contextRestore={skipped:true,reason:'separate scene-lifecycle control'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await context.close();
 }
 report.shaderErrors=report.consoleErrors.filter(x=>/Unable to compile effect|Error compiling effect|SHADER ERROR|VALIDATE_STATUS false/i.test(x.message));assert.deepEqual(report.shaderErrors,[]);assert.deepEqual(report.errors,[]);report.exactContextPixels=report.cases.every(item=>item.exactContextPixels);report.completed=true;report.pass=report.exactContextPixels;assert(report.exactContextPixels,'One or more context restores changed exact pixels; inspect A/B defines and screenshots');
}catch(error){report.failure=String(error.stack??error);throw error;}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
