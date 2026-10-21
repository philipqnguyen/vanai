import './animation-library-review.css';
import {ArcRotateCamera,Camera,Vector3,TransformNode,type AnimationGroup} from '@babylonjs/core';
import {initEngine,buildLineupScene,scene,engine} from './scene';
import {buildAvatar,disposeAvatar,type AvatarNode} from './entities';
import {actorPosedExternally} from './actor-reveal';
import {loadAnimationLibrary,makeLibraryClip,restoreLibraryRest,type LoadedLibrary,type Clip,type Pack} from './animation-library';
if(!import.meta.env.DEV)throw new Error('Animation library review is development-only');
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const select=(id:string)=>$<HTMLSelectElement>(id);
initEngine($<HTMLCanvasElement>('renderCanvas'));buildLineupScene();
const camera=new ArcRotateCamera('library-camera',-Math.PI/3,1.35,4,new Vector3(0,.9,0),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;camera.attachControl($('renderCanvas'),true);camera.wheelPrecision=50;camera.lowerRadiusLimit=1.5;camera.upperRadiusLimit=8;camera.panningSensibility=0;
let library:LoadedLibrary,avatar:AvatarNode|undefined,nodes=new Map<string,TransformNode>(),group:AnimationGroup|undefined,clip:Clip|undefined,pack:Pack|undefined,body='',playing=true,seconds=0,nonce=0,ready=false;
let poseFrame:{height:number;center:number}|undefined;
function frame(){const height=poseFrame?.height??(body.startsWith('nym')?1.6:body.startsWith('karrog')?2.8:2.4);camera.target.set(0,poseFrame?.center??height*.43,0);const aspect=engine.getRenderWidth()/engine.getRenderHeight(),size=height*camera.radius/4;camera.orthoTop=size/2;camera.orthoBottom=-size/2;camera.orthoLeft=-size*aspect/2;camera.orthoRight=size*aspect/2;}
function view(){camera.alpha=({front:Math.PI/2,three:Math.PI/3,side:0,back:-Math.PI/2} as Record<string,number>)[select('view').value];camera.beta=1.38;}
function updateClock(){if(!clip)return;$<HTMLInputElement>('time').value=String((seconds-clip.start)/(clip.end-clip.start||1));$('clock').textContent=`${seconds.toFixed(2)} / ${clip.end.toFixed(2)} s · 1×`;}
function seek(fraction:number){if(!group||!clip)return;seconds=clip.start+(clip.end-clip.start)*Math.max(0,Math.min(1,fraction));group.goToFrame(seconds*60);updateClock();}
function setClip(name:string){
  if(!ready)return;poseFrame=undefined;group?.dispose();group=undefined;restoreLibraryRest(library,body,nodes);
  pack=library.catalog.packs.find(p=>p.id===select('pack').value)!;clip=pack.clips.find(c=>c.name===name);
  if(!clip)throw new Error(`Missing clip ${name}`);
  group=makeLibraryClip(library,body,pack,clip,nodes,scene);group.start(false,1,clip.start*60,clip.end*60);group.pause();seek(0);
  select('clip').value=name;$('status').textContent=`${body} · ${pack.id}:${clip.name} · ${pack.clips.length} entries`;
  const url=new URL(location.href);url.searchParams.set('body',body);url.searchParams.set('pack',pack.id);url.searchParams.set('clip',clip.name);history.replaceState(null,'',url);
}
function fillClips(preferred?:string){
  pack=library.catalog.packs.find(p=>p.id===select('pack').value)!;
  const term=$<HTMLInputElement>('search').value.toLowerCase(),list=pack.clips.filter(c=>c.name.toLowerCase().includes(term));
  select('clip').replaceChildren(...list.map(c=>new Option(c.name,c.name)));
  if(!list.length){$('status').textContent='No matching animations';return;}
  setClip(list.some(c=>c.name===preferred)?preferred!:list.find(c=>c.name==='Idle_Loop')?.name??list[0].name);
}
async function setBody(id:string){
  ready=false;const ticket=++nonce;group?.dispose();group=undefined;clip=undefined;if(avatar)disposeAvatar(avatar);
  body=id;select('body').value=id;$('status').textContent='Loading approved body and hair…';
  const [race,face]=id.split('-'),job=select('job').value;
  const hair=race==='aedri'?(face==='female'?'braid':'waves'):race==='nym'?(face==='female'?'bun':'tousled'):race==='valdren'?(face==='female'?'braid':'cascade'):race==='karrog'?'braid':'waves';
  const current=buildAvatar(`library-${ticket}`,race,job,false,{w:({PLD:'worn_sword',SAM:'worn_katana',DRK:'worn_greatsword',BLM:'ash_staff',WHM:'worn_cudgel',MNK:'cloth_wraps'} as Record<string,string>)[job]},undefined,{face:face as 'male'|'female',hair,beard:true});avatar=current;current.proc.setEnabled(false);
  const deadline=performance.now()+45000;
  while(!current.model){if(ticket!==nonce)return;if(performance.now()>deadline)throw new Error('Character failed to load');await new Promise(r=>setTimeout(r,50));}
  if(ticket!==nonce)return;
  current.model.groups.forEach(g=>g.stop());
  nodes=new Map(current.model.root.getDescendants(false).filter((n):n is TransformNode=>n instanceof TransformNode).map(n=>[n.name,n]));
  for(const name of Object.keys(library.catalog.rigs[id].bones))if(!nodes.has(name))throw new Error(`Missing ${id}/${name}`);
  // this page poses the bones itself (seek/goToFrame), not via animateAvatar
  actorPosedExternally(current);
  ready=true;frame();view();fillClips(new URL(location.href).searchParams.get('clip')??'Idle_Loop');
}
function fail(error:unknown){ready=false;$('status').textContent=`Review error: ${String(error)}`;console.error(error);}
$('ground').onchange=()=>scene.getMeshByName('lineup_ground')?.setEnabled($<HTMLInputElement>('ground').checked);
$('frame-pose').onclick=()=>{let low=Infinity,high=-Infinity;for(const name of Object.keys(library.catalog.rigs[body].bones)){const n=nodes.get(name)!;n.computeWorldMatrix(true);const y=n.getAbsolutePosition().y;low=Math.min(low,y);high=Math.max(high,y);}poseFrame={height:Math.max(.8,high-low+.7),center:(high+low)/2+.1};camera.radius=4;frame();};
$('body').onchange=()=>void setBody(select('body').value).catch(fail);
$('job').onchange=()=>void setBody(body).catch(fail);
$('pack').onchange=()=>fillClips();$('search').oninput=()=>fillClips();$('clip').onchange=()=>setClip(select('clip').value);$('view').onchange=view;
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
$('time').oninput=()=>{playing=false;$('play').textContent='Play';seek(Number($<HTMLInputElement>('time').value));};
engine.runRenderLoop(()=>{
  if(ready&&group&&clip&&playing){seconds+=engine.getDeltaTime()/1000;if(seconds>clip.end){if($<HTMLInputElement>('loop').checked)seconds=clip.start+(seconds-clip.start)%(clip.end-clip.start||1);else{seconds=clip.end;playing=false;$('play').textContent='Play';}}group.goToFrame(seconds*60);updateClock();}
  frame();avatar?.weapon?.setEnabled($<HTMLInputElement>('weapon').checked);scene.render();
});window.addEventListener('resize',()=>{engine.resize();frame();});
Object.assign(window,{__animationLibrary:{get ready(){return ready;},get library(){return library;},get avatar(){return avatar;},get nodes(){return nodes;},get group(){return group;},get body(){return body;},scene,camera,setBody,setClip,seek,pause(){playing=false;$('play').textContent='Play';},async setPack(id:string){select('pack').value=id;fillClips();}}});
void loadAnimationLibrary().then(async loaded=>{
  library=loaded;select('body').replaceChildren(...Object.keys(library.catalog.rigs).map(id=>new Option(id.replace('-',' · '),id)));
  select('pack').replaceChildren(...library.catalog.packs.map(p=>new Option(p.title,p.id)));
  const q=new URL(location.href).searchParams;select('pack').value=library.catalog.packs.some(p=>p.id===q.get('pack'))?q.get('pack')!:'ual1';
  await setBody(q.get('body')&&library.catalog.rigs[q.get('body')!]?q.get('body')!:'aedri-female');
}).catch(fail);
