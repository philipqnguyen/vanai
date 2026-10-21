import { attachFollowCamera } from "./follow_camera";
import { onInteractionFloor } from './interaction_height';
// Local walking review of the real Heartwood build, with no world/server state.
import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { initEngine, buildZone, engine, scene, groundHeight, resolveCollision, debugHit, inspectLevels, inspectStairBodies,
  updateCarpet, circleColliders, colliders, boxColliders, cameraRoomAt, inspectCameraRooms } from './scene';
import { inspectHouses, probeFloors } from './town';
import './city-review.css';
import { inspectHeartwoodCity } from './heartwood-city-build';
import { placeNpcAvatar, buildNpcAvatar, buildAvatar, animateAvatar } from './entities';
import { setActorShown } from './actor-reveal';
import { ZONES } from './data';
import './zones';

type CityNpc = { id:string; name:string; kind:string; x:number; z:number; y?:number; h?:number; dialog?:string[]; title?:string };
const STOPS: Record<string,[number,number,number,number?]> = {
  'Elder crossroads':[0,0,1.35], "Elder's Rest":[-81,-2,1.55], 'Grudge Hall':[-134,-25,1.55],
  'Song-Steps':[110,-49,1.8], 'Chanters’ Hall':[94,-106,-.7], 'North homes':[-40,65,1.3],
  'Brook crossing':[48,4,1.0], 'Waterfront':[240,40,0], 'West crystal':[-278,2,1.3],
  // the auction house's forecourt, looking in through the main arch
  'Auction House':[-12,-8.2,.614],
};
export async function runHeartwoodCity(canvas: HTMLCanvasElement): Promise<void> {
  initEngine(canvas,true);buildZone('heartwood');
  const upper=inspectHeartwoodCity().upper,west=upper.rings[0],bridge=upper.bridge;
  STOPS['Upper stair']=[upper.stair.foot[0]-2,upper.stair.foot[2],Math.PI,upper.stair.foot[1]];
  STOPS['Upper neighborhood']=[west.tree.x,west.tree.z-west.r,Math.PI/2,west.y];
  STOPS['Rope bridge']=[bridge.a[0]+3,bridge.a[2]+.2,Math.PI,23.95];
  const oak=upper.rings.find(r=>r.tree.name==='The Remembering Oak')!,western=upper.bridges.find(b=>b.to===oak.tree.name)!;
  STOPS['Remembering Oak upper']=[oak.tree.x,oak.tree.z-oak.r,Math.PI/2,oak.y];
  STOPS['Western rope bridge']=[(western.a[0]+western.b[0])/2,(western.a[2]+western.b[2])/2,Math.atan2(western.b[0]-western.a[0],western.b[2]-western.a[2]),24-western.sag];
  const camera=new ArcRotateCamera('Heartwood walking camera',-.9,1.4,7,new Vector3(16,groundHeight(16,49)+1.5,49),scene);
  camera.minZ=.08;camera.maxZ=1600;camera.lowerBetaLimit=.3;camera.upperBetaLimit=1.7;
  camera.lowerRadiusLimit=.08;camera.upperRadiusLimit=22;camera.wheelPrecision=24;
  camera.attachControl(canvas,true);camera.inputs.attached.keyboard?.detachControl();
  const params=new URLSearchParams(location.search), keys=new Set<string>();
  const race=params.get('race')??'aedri';
  let player=buildAvatar('heartwood-review-player',race,'PLD');
  let firstPerson=false, heading=0;
  let pos=new Vector3(16,groundHeight(16,49),49);
  const npcs=((ZONES.heartwood.npcs ?? []) as CityNpc[]).map(npc=>{
    const av=buildNpcAvatar(npc);
    placeNpcAvatar(av,npc);return{npc,av};
  });
  const panel=document.createElement('aside');panel.className='city-review';panel.style.width='286px';
  panel.innerHTML='<div class="city-kicker">VANAI · CITY WALK</div><h1>Heartwood</h1><p>A city grown among living elders</p><div class="city-controls"></div><p class="city-help">WASD walk · Shift run · drag to look<br>V first person · E speak nearby</p><div class="city-links"><a href="?zone=heartwood&tour&daytime=0.2">Aerial view</a></div><small>Local review · no saved game progress</small>';
  document.body.append(panel);
  const hint=document.createElement('div');hint.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:10px 18px;background:#172e39dc;color:#ede0bd;font:14px Georgia;pointer-events:none;border-radius:3px';document.body.append(hint);
  const dialog=document.createElement('div');dialog.style.cssText='display:none;position:fixed;right:24px;bottom:24px;max-width:380px;padding:24px;background:#172e39f2;color:#eee5ce;font:16px/1.6 Georgia;border:1px solid #bcaa75';document.body.append(dialog);
  const travel=(name:string)=>{const [x,z,a,y]=STOPS[name];pos.set(x,y??groundHeight(x,z),z);camera.alpha=a;camera.beta=1.42;camera.radius=7;dialog.style.display='none';panel.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.textContent===name));};
  Object.keys(STOPS).forEach(name=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>travel(name);panel.querySelector('.city-controls')!.append(b);});
  travel((params.get('district')??'') in STOPS?params.get('district')!:'Elder crossroads');
  const at=(params.get('at')??'').split(',').map(Number);
  if(at.length>=2&&at.every(Number.isFinite))pos.set(at[0],at[2]??groundHeight(at[0],at[1]),at[1]);
  addEventListener('keydown',e=>{
    if(e.target instanceof HTMLButtonElement)e.target.blur();
    keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='KeyV')firstPerson=!firstPerson;
    if(e.code==='KeyE'){
      const near=npcs.find(n=>Math.hypot(n.npc.x-pos.x,n.npc.z-pos.z)<4&&onInteractionFloor(pos.y,n.npc,groundHeight));
      if(!near)return;
      dialog.replaceChildren();const title=document.createElement('strong');title.textContent=near.npc.name;dialog.append(title);
      const body=document.createElement('p');body.textContent=near.npc.dialog?.[0]??near.npc.title??'';dialog.append(body);
      const small=document.createElement('small');small.textContent='Dialogue preview · quests and services run in the game';dialog.append(small);dialog.style.display=dialog.style.display==='none'?'block':'none';
    }
  });
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  const follow=attachFollowCamera(camera,()=>({x:pos.x,y:pos.y,z:pos.z,heading,firstPerson}),show=>{if(player)setActorShown(player,show);});
  const move=(dx:number,dz:number)=>{const [x,z]=resolveCollision(pos.x,pos.z,pos.x+dx,pos.z+dz,pos.y);pos.set(x,groundHeight(x,z,pos.y),z);};
  (window as any).__heartwoodCity={scene,camera,follow,cameraRoomAt,inspectCameraRooms,get pos(){return pos;},get player(){return player;},move,inspectCity:inspectHeartwoodCity,
    setHeading(value:number){heading=value;},
    teleport(x:number,z:number,y?:number){pos.set(x,y??groundHeight(x,z),z);},
    ground:groundHeight,resolveCollision,debugHit,inspectLevels,inspectHouses,inspectStairBodies,probeFloors,colliders,boxColliders,circleColliders,npcs:ZONES.heartwood.npcs,definition:ZONES.heartwood,stops:STOPS};
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
    if(player){player.root.position.copyFrom(pos);player.root.rotation.y=heading;animateAvatar(player,actualSpeed>.1?(sprinting?'run':'walk'):'idle',dt,performance.now()/1000);}
    npcs.forEach(({av})=>animateAvatar(av,'idle',dt,performance.now()/1000));
    updateCarpet(pos.x,pos.z);
    const near=npcs.find(n=>Math.hypot(n.npc.x-pos.x,n.npc.z-pos.z)<4&&onInteractionFloor(pos.y,n.npc,groundHeight));
    hint.textContent=near?`${near.npc.name} · E to speak`:`${pos.x.toFixed(0)}, ${pos.z.toFixed(0)} · ${firstPerson?'First person':'City walk'}`;
    scene.render();
  });

  addEventListener('resize',()=>engine.resize());
}
