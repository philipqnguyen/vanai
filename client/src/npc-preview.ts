import {ArcRotateCamera,Vector3,Matrix,Ray} from '@babylonjs/core';
import {initEngine,buildLineupScene,buildZone,scene,engine,groundHeight} from './scene';
import {buildNpcAvatar,placeNpcAvatar,animateAvatar} from './entities';
import {npcAppearance,NPC_BODIES} from './npc-appearance';
import {equipmentInfo} from './gear/equipment';
import {actorRevealed} from './actor-reveal';
import {ZONES} from './data';
import './zones';

/** NPC integration review: real residents and the same factory as gameplay. */
export function runNpcPreview(canvas:HTMLCanvasElement):void {
  document.querySelector('#app')?.remove();
  const query=new URLSearchParams(location.search),zone=query.get('npc-zone');
  if(zone&&!ZONES[zone])throw new Error(`Unknown NPC review zone: ${zone}`);
  initEngine(canvas,true);
  if(zone&&ZONES[zone])buildZone(zone);else buildLineupScene();
  const population=Object.entries(ZONES).flatMap(([zone,z])=>(z.npcs??[]).map((npc:any)=>({zone,npc})));
  const selected=zone?population.filter(n=>n.zone===zone):NPC_BODIES.map(([race,face])=>population.find(n=>npcAppearance(n.npc).body===`${race}-${face}`)!);
  const actors=selected.map(({zone,npc},i)=>{
    const av=buildNpcAvatar(npc);
    av.proc.setEnabled(false);
    if(zone===query.get('npc-zone'))placeNpcAvatar(av,npc);
    else av.root.position.set((i-3.5)*2.4,0,0);
    const label=document.createElement('div');label.style.cssText='position:fixed;pointer-events:none;transform:translate(-50%,-100%);text-align:center;color:#fff;background:#142329cc;padding:4px 7px;font:12px sans-serif;white-space:pre';
    label.textContent=`${npc.name}\n${npc.kind} · ${npcAppearance(npc).body}`;document.body.append(label);
    return {zone,npc,av,label};
  });
  const camera=new ArcRotateCamera('npc-review',Math.PI/2,1.4,22,new Vector3(0,1,0),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=2000;camera.attachControl(canvas,true);
  function focus(id:string){const actor=actors.find(a=>a.npc.id===id);if(!actor)return;camera.target.copyFrom(actor.av.root.position).addInPlace(new Vector3(0,actor.av.raceH*.55,0));camera.radius=5;camera.alpha=Math.PI/2-actor.av.root.rotation.y;camera.beta=1.4;}
  if(zone)focus(query.get('npc-id')??actors[0]?.npc.id);
  Object.assign(window,{__npcPreview:{scene,camera,actors,equipmentInfo,focus,pickTorso(id:string){const a=actors.find(a=>a.npc.id===id)!;const origin=a.av.root.position.add(new Vector3(0,a.av.raceH*.55,2));return scene.pickWithRay(new Ray(origin,new Vector3(0,0,-1),4),m=>m.isPickable&&m.metadata?.entityId===`npc_${id}`)?.pickedMesh?.metadata?.entityId}}});
  engine.runRenderLoop(()=>{
    const dt=Math.min(.1,engine.getDeltaTime()/1000),now=performance.now()/1000;
    for(const {av,label} of actors){animateAvatar(av,'idle',dt,now);const p=Vector3.Project(av.root.position.add(new Vector3(0,av.raceH+.45,0)),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));label.style.left=p.x+'px';label.style.top=p.y+'px';label.style.display=p.z>0&&p.z<1&&actorRevealed(av)?'block':'none';}
    scene.render();
  });
  addEventListener('resize',()=>engine.resize());
}
