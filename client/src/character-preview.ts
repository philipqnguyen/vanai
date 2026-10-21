import {ArcRotateCamera,Vector3,Color3,Color4,DirectionalLight,DynamicTexture,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {initEngine,buildLineupScene,scene,engine} from './scene';
import {buildAvatar,disposeAvatar,animateAvatar,type AvatarNode} from './entities';
import {appearanceChoice,type CharacterAppearance} from './appearance';
import {RACES,JOB_LIST} from './data';
import {actorRevealed,handOffActor} from './actor-reveal';

/** Same avatar factory, lighting and appearance recipe as normal play. */
export function runCharacterPreview(canvas:HTMLCanvasElement):void {
  document.querySelector('#app')?.remove();
  initEngine(canvas);buildLineupScene();
  stagePreview();
  const camera=new ArcRotateCamera('creation-camera',1.2,1.38,3.8,new Vector3(0,.9,0),scene);
  camera.fov=.6;
  camera.attachControl(canvas,true);camera.lowerRadiusLimit=2.3;camera.upperRadiusLimit=5;
  camera.lowerBetaLimit=.45;camera.upperBetaLimit=1.55;camera.panningSensibility=0;
  let avatar:AvatarNode|undefined,selection:unknown,announced=false;
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='character-appearance')return;
    const {race,job,appearance}=event.data as {race:string;job:string;appearance:CharacterAppearance};
    if(!RACES[race]?.playable||!JOB_LIST.includes(job))return;
    const previous=avatar;
    selection={race,job,appearance:appearanceChoice(race,appearance)};announced=false;
    // dressed as a new character arrives: the starting weapon and the traveler's
    // tunic and slops (Character.provision!), so the preview is what play shows
    avatar=buildAvatar('creation',race,job,false,{w:({PLD:'worn_sword',SAM:'worn_katana',DRK:'worn_greatsword',BLM:'ash_staff',WHM:'worn_cudgel',MNK:'cloth_wraps'} as Record<string,string>)[job],b:'traveler_tunic',l:'traveler_slops'},undefined,appearance);
    avatar.proc.setEnabled(false);
    // the previous choice stays on the stage until this one is dressed and posed
    if(previous)handOffActor(previous,avatar,disposeAvatar);
    camera.target.y=race==='nym'?.67:race==='karrog'?1.12:.95;camera.radius=race==='nym'?2.8:race==='karrog'?4.5:3.8;
  });
  engine.runRenderLoop(()=>{
    if(avatar?.model){
      animateAvatar(avatar,'idle',engine.getDeltaTime()/1000,performance.now()/1000);
      if(!announced&&actorRevealed(avatar)){announced=true;parent.postMessage({type:'character-preview-rendered',selection},location.origin);}
    }
    scene.render();
  });
  if(import.meta.env.DEV)Object.assign(window,{__characterPreview:{avatar:()=>avatar,scene,camera}});
  parent.postMessage({type:'character-preview-ready'},location.origin);
}

// The roster and creation screens lay this frame over their drawn night
// (title-backdrop.ts, preview-stage.ts), so the page shows through: no sky,
// and the lineup's grey floor becomes a soft pool of shadow under the feet
// that fades to nothing. A warm light from behind picks out the silhouette
// against the dark, the way a character screen is lit.
function stagePreview():void{
  document.documentElement.style.background=document.body.style.background='transparent';
  scene.clearColor=new Color4(0,0,0,0);
  scene.getMeshByName('lineup_ground')?.dispose();
  const size=256,tex=new DynamicTexture('creation_pool',{width:size,height:size},scene,false);
  const g=tex.getContext() as CanvasRenderingContext2D;
  const pool=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  pool.addColorStop(0,'rgba(40,34,44,0.95)');pool.addColorStop(.45,'rgba(26,22,32,0.7)');pool.addColorStop(1,'rgba(10,10,16,0)');
  g.fillStyle=pool;g.fillRect(0,0,size,size);tex.hasAlpha=true;tex.update();
  const disc=MeshBuilder.CreateGround('creation_floor',{width:3.6,height:3.6},scene);
  const mat=new StandardMaterial('creation_floor_m',scene);
  mat.diffuseTexture=tex;mat.useAlphaFromDiffuseTexture=true;mat.specularColor=new Color3(0,0,0);
  disc.material=mat;disc.receiveShadows=true;disc.isPickable=false;
  const rim=new DirectionalLight('creation_rim',new Vector3(-.3,-.5,1),scene);
  rim.diffuse=Color3.FromHexString('#ffc58a');rim.specular=Color3.FromHexString('#ffd9a8');rim.intensity=.9;
}
