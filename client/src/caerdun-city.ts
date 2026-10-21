import { attachFollowCamera } from "./follow_camera";
// Local walking review of the real Caerdun build, with no world/server state.
import { ArcRotateCamera, Matrix, Vector3 } from '@babylonjs/core';
import { initEngine, buildZone, engine, scene, groundHeight, standHeight, resolveCollision, debugHit, inspectLevels, inspectStairBodies,
  updateCarpet, circleColliders, colliders, boxColliders, cameraRoomAt, inspectCameraRooms } from './scene';
import { inspectHouses, probeFloors } from './town';
import './city-review.css';
import { placeNpcAvatar, buildNpcAvatar, buildAvatar, animateAvatar, disposeAvatar, npcStandY, raceHeight, type AvatarNode } from './entities';
import { npcPresent, setActorShown } from './actor-reveal';
import { DetailStreamer } from './actor_stream_plan';
import { npcPresentation } from './npc-appearance';
import { ZONES } from './data';
import './zones';

type CityNpc = { id:string; name:string; kind:string; x:number; z:number; y?:number; h?:number; dialog?:string[]; title?:string };
// The Sea Gate fortress's places (caerdun-fortress-layout.json spots, since the
// cut-over to zones/caerdun.ts): [x, z, camera alpha] -- the camera looks along
// (-cos alpha, -sin alpha), so -pi/2 faces north and 0 faces west.
const STOPS: Record<string,[number,number,number]> = {
 'Crown Square':[25,-28,-Math.PI/2], 'Court hall':[25,-8.5,-Math.PI/2],
 'Market Yard':[-40,-22,0], 'The parade':[16,-74,-Math.PI/2],
 'Lantern Street':[-45,25,0], 'The quay':[-232,-34,0],
 'Harbour Terrace':[-207,-117,-Math.PI/2], 'Lighthouse':[-159.4,47.4,Math.PI],
 'Sea ramparts':[-95,71,0], 'Landward gate':[79,-18,0],
};
export async function runCaerdunCity(canvas: HTMLCanvasElement): Promise<void> {
  initEngine(canvas,true);buildZone('caerdun');
  const camera=new ArcRotateCamera('Caerdun walking camera',-.9,1.4,7,new Vector3(25,groundHeight(25,-28)+1.5,-28),scene);
  camera.minZ=.08;camera.maxZ=1600;camera.lowerBetaLimit=.3;camera.upperBetaLimit=1.7;
  camera.lowerRadiusLimit=.08;camera.upperRadiusLimit=22;camera.wheelPrecision=24;
  camera.attachControl(canvas,true);camera.inputs.attached.keyboard?.detachControl();
  const params=new URLSearchParams(location.search), keys=new Set<string>();
  const player=buildAvatar('caerdun-review-player','aedri','PLD');
  let firstPerson=false, heading=0;
  let pos=new Vector3(25,groundHeight(25,-28),-28);
  // `?npcs=N` builds only the first N NPCs (heap measurements against the city alone)
  const cityNpcs=(ZONES.caerdun.npcs ?? []).slice(0,Number(params.get('npcs')??Infinity)) as CityNpc[];
  const byId=new Map(cityNpcs.map(npc=>[npc.id,npc]));
  // The nearest DETAIL_CAP residents in full detail, the rest nameplate only, as
  // in the game (actor_stream_plan.ts); `&stream=off` builds every one, for comparisons.
  const shown=new Map<string,AvatarNode>();
  const buildOne=(npc:CityNpc)=>{const av=buildNpcAvatar(npc);placeNpcAvatar(av,npc);return av;};
  const streamer=params.get('stream')==='off'?null:new DetailStreamer<AvatarNode>({
    build:id=>buildOne(byId.get(id)!),
    show:(id,av)=>{setActorShown(av,true);shown.set(id,av);},
    hide:(id,av)=>{setActorShown(av,false);shown.delete(id);},
    dispose:(id,av)=>{shown.delete(id);disposeAvatar(av);},
  });
  if(!streamer)cityNpcs.forEach(npc=>shown.set(npc.id,buildOne(npc)));
  const standY=new Map(cityNpcs.map(npc=>[npc.id,npcStandY(npc)]));
  const plateH=new Map(cityNpcs.map(npc=>[npc.id,raceHeight(npcPresentation(npc,npc.kind).race)]));
  const candidates=cityNpcs.map(npc=>({id:npc.id,x:npc.x,z:npc.z,y:standY.get(npc.id)}));
  let streamAt=-Infinity;
  const tickStream=(now:number)=>{if(!streamer||now-streamAt<.25)return;streamAt=now;streamer.update(pos.x,pos.z,candidates,now,pos.y);};
  // the game's nameplate over every resident (hud.ts): over the body when it is
  // drawn, at its spot when it stands beyond the nearest few
  const plates=new Map<string,HTMLDivElement>();
  const plateFor=(npc:CityNpc)=>{
    let p=plates.get(npc.id);if(p)return p;
    p=document.createElement('div');p.className='city-plate';
    p.style.cssText='position:fixed;pointer-events:none;transform:translate(-50%,-100%);text-align:center;z-index:5;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 8px rgba(0,0,0,.7);display:none';
    const nm=document.createElement('div');nm.style.cssText='font:700 15px "Alegreya Sans",sans-serif;color:#a9dca0';nm.textContent=npc.name;p.append(nm);
    if(npc.title){const sub=document.createElement('div');sub.style.cssText='font-size:11px;color:#e3dac6';sub.textContent=npc.title;p.append(sub);}
    document.body.append(p);plates.set(npc.id,p);return p;
  };
  const tickPlates=()=>{
    const w=engine.getRenderWidth(),h=engine.getRenderHeight(),c=engine.getRenderingCanvas()!,sx=c.clientWidth/w,sy=c.clientHeight/h;
    const view=camera.viewport.toGlobal(w,h),transform=scene.getTransformMatrix();
    for(const npc of cityNpcs){
      const av=shown.get(npc.id);
      const p=plateFor(npc);
      // no plate over a body still dressing (actor-reveal.ts), as in the game
      if((av&&!npcPresent(av))||Math.hypot(npc.x-pos.x,npc.z-pos.z)>70){p.style.display='none';continue;}
      const over=av?av.root.position.add(new Vector3(0,av.raceH+.5,0)):new Vector3(npc.x,standY.get(npc.id)!+plateH.get(npc.id)!+.5,npc.z);
      const at=Vector3.Project(over,Matrix.IdentityReadOnly,transform,view);
      if(at.z<0||at.z>1){p.style.display='none';continue;}
      p.style.display='block';p.style.left=`${at.x*sx}px`;p.style.top=`${at.y*sy}px`;
    }
  };
  const panel=document.createElement('aside');panel.className='city-review';panel.style.width='286px';
  panel.innerHTML='<div class="city-kicker">VANAI · CITY WALK</div><h1>Caerdun</h1><p>The garrison above the cold fjord</p><div class="city-controls"></div><p class="city-help">WASD walk · Shift run · drag to look<br>V first person · E speak nearby</p><div class="city-links"><a href="?zone=caerdun&tour&daytime=0.2">Aerial view</a></div><small>Local review · no saved game progress</small>';
  document.body.append(panel);
  const hint=document.createElement('div');hint.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:10px 18px;background:#172e39dc;color:#ede0bd;font:14px Georgia;pointer-events:none;border-radius:3px';document.body.append(hint);
  const dialog=document.createElement('div');dialog.style.cssText='display:none;position:fixed;right:24px;bottom:24px;max-width:380px;padding:24px;background:#172e39f2;color:#eee5ce;font:16px/1.6 Georgia;border:1px solid #bcaa75';document.body.append(dialog);
  const travel=(name:string)=>{const [x,z,a]=STOPS[name];pos.set(x,groundHeight(x,z),z);camera.alpha=a;camera.beta=1.42;camera.radius=7;dialog.style.display='none';panel.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.textContent===name));};
  Object.keys(STOPS).forEach(name=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>travel(name);panel.querySelector('.city-controls')!.append(b);});
  travel((params.get('district')??'') in STOPS?params.get('district')!:'Crown Square');
  const at=(params.get('at')??'').split(',').map(Number);
  if(at.length===2&&at.every(Number.isFinite))pos.set(at[0],groundHeight(at[0],at[1]),at[1]);
  addEventListener('keydown',e=>{
    if(e.target instanceof HTMLButtonElement)e.target.blur();
    keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='KeyV')firstPerson=!firstPerson;
    if(e.code==='KeyE'){
      const near=cityNpcs.find(n=>Math.hypot(n.x-pos.x,n.z-pos.z)<4);
      if(!near)return;
      dialog.replaceChildren();const title=document.createElement('strong');title.textContent=near.name;dialog.append(title);
      const body=document.createElement('p');body.textContent=near.dialog?.[0]??near.title??'';dialog.append(body);
      const small=document.createElement('small');small.textContent='Dialogue preview · quests and services run in the game';dialog.append(small);dialog.style.display=dialog.style.display==='none'?'block':'none';
    }
  });
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  const follow=attachFollowCamera(camera,()=>({x:pos.x,y:pos.y,z:pos.z,heading,firstPerson}),show=>{if(player)setActorShown(player,show);});
  const move=(dx:number,dz:number)=>{const [x,z]=resolveCollision(pos.x,pos.z,pos.x+dx,pos.z+dz,pos.y);pos.set(x,groundHeight(x,z,pos.y),z);};
  (window as any).__caerdunCity={scene,camera,follow,cameraRoomAt,inspectCameraRooms,get pos(){return pos;},get player(){return player;},move,
    teleport(x:number,z:number,y?:number){pos.set(x,y??groundHeight(x,z),z);},
    ground:groundHeight,resolveCollision,debugHit,inspectLevels,inspectHouses,inspectStairBodies,probeFloors,colliders,boxColliders,circleColliders,npcs:ZONES.caerdun.npcs,definition:ZONES.caerdun,stops:STOPS,
    // character streaming, for the walk and memory checks: who is drawn, who is
    // held (drawn or cached), the planner (its cap and cache can be changed live)
    stream:{shown:()=>[...shown.keys()],held:()=>streamer?.heldIds()??[...shown.keys()],planner:streamer?.planner,
      plates:()=>[...plates].filter(([,p])=>p.style.display==='block').map(([id])=>id),tick:()=>{streamAt=-Infinity;tickStream(performance.now()/1000);}}};
  engine.runRenderLoop(()=>{
    const dt=Math.min(.1,engine.getDeltaTime()/1000), f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')), r=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const forward=new Vector3(-Math.cos(camera.alpha),0,-Math.sin(camera.alpha)),right=new Vector3(forward.z,0,-forward.x);
    const direction=forward.scale(f).add(right.scale(r));
    const sprinting=keys.has('ShiftLeft')||keys.has('ShiftRight'),speed=sprinting?6:1.4,beforeX=pos.x,beforeZ=pos.z;
    if(direction.lengthSquared()>0){
      direction.normalize();
      // Keep real movement speed at lower frame rates without jumping over
      // narrow collisions; animation and travel then use the same elapsed time.
      const steps=Math.ceil(dt/.025);
      for(let i=0;i<steps;i++)move(direction.x*dt/steps*speed,direction.z*dt/steps*speed);
    }
    const actualSpeed=Math.hypot(pos.x-beforeX,pos.z-beforeZ)/Math.max(dt,.001);
    if(direction.lengthSquared()>0)heading=Math.atan2(direction.x,direction.z);
    // the feet on what is drawn there, as the game seats them (world.ts: standHeight);
    // pos stays the walk's level (fix round 3: the review read the quay's lifted flags as a sink)
    if(player){player.root.position.set(pos.x,standHeight(pos.x,pos.z,pos.y),pos.z);player.root.rotation.y=heading;animateAvatar(player,actualSpeed>.1?(sprinting?'run':'walk'):'idle',dt,performance.now()/1000);}
    tickStream(performance.now()/1000);
    shown.forEach(av=>animateAvatar(av,'idle',dt,performance.now()/1000));
    updateCarpet(pos.x,pos.z);
    const near=cityNpcs.find(n=>Math.hypot(n.x-pos.x,n.z-pos.z)<4);
    hint.textContent=near?`${near.name} · E to speak`:`${pos.x.toFixed(0)}, ${pos.z.toFixed(0)} · ${firstPerson?'First person':'City walk'}`;
    scene.render();
    tickPlates();
  });
  addEventListener('resize',()=>engine.resize());
}
