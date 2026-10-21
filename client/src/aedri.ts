import {Quaternion,TransformNode} from '@babylonjs/core';
import type {AvatarNode} from './entities';
import {instantiateModel} from './models';
import {FemaleLocomotion} from './meshy-female-locomotion';
import {registerQuaternius,quaterniusLocomotion} from './quaternius-gameplay';
import {fitAedriGrip} from './aedri-grip';
import {aedriChoice,type CharacterAppearance} from './appearance';
import {colourHair} from './hair-colour';

/** Final human bind and clips, used exactly as authored: no per-race rescaling. */
export async function loadAedri(av:AvatarNode,id:string,appearance?:CharacterAppearance):Promise<boolean>{
  const choice=aedriChoice('aedri',appearance)!;
  const folder=`characters/aedri-${choice.face}/`;
  const body=await instantiateModel(folder+'body.glb',id,true);
  if(!body)return false;
  body.root.setEnabled(false);
  const hair=await instantiateModel(folder+choice.hair+'.glb',id,true);
  if(av.root.isDisposed()||body.root.getScene()!==av.root.getScene()||!hair){
    for(const model of [body,hair]){model?.groups.forEach(g=>g.dispose());model?.root.dispose();}return false;
  }
  const nodes=new Map(body.root.getDescendants(false).filter((n):n is TransformNode=>n instanceof TransformNode).map(n=>[n.name,n]));
  fitAedriGrip(nodes,choice.face);
  if(hair){
    colourHair(hair,`aedri-${choice.face}/${choice.hair}`,choice.hair_colour);
    if(choice.face==='female'){
      hair.root.parent=body.root;
      const skeleton=body.root.getChildMeshes().find(m=>m.skeleton)?.skeleton;
      if(!skeleton)throw new Error('Aedri body has no skeleton');
      const redundant=new Set(hair.root.getChildMeshes().map(m=>m.skeleton).filter(s=>s&&s!==skeleton));
      hair.root.getChildMeshes().forEach(m=>{if(m.skeleton)m.skeleton=skeleton;});
      redundant.forEach(s=>s?.dispose());
      // The hair uses the body's joint indices. Its duplicate rig has no role.
      for(const n of hair.root.getDescendants(false))if(n.name==='root'&&!n.getChildMeshes().length)n.dispose();
    }else{
      // Waves are authored Head-local. Strip the import conversion here because
      // the body's glTF root already converts the whole attached hierarchy.
      for(const n of hair.root.getChildren())if(n instanceof TransformNode&&n.name==='__root__'){
        n.rotationQuaternion=Quaternion.Identity();n.scaling.setAll(1);
      }
      hair.root.parent=nodes.get('Head')!;
    }
  }
  body.root.parent=av.root;body.root.setEnabled(true);
  av.model=body;av.modelVariant='aedri-quaternius';av.raceH=1.8;
  av.castOrb.position.set(0,1.4,.4);
  if(choice.face==='female'){
    const layer=new FemaleLocomotion(),scene=body.root.getScene();
    const conversion=nodes.get('__root__')!;
    const before=scene.onBeforeAnimationsObservable.add(()=>layer.restore());
    const after=scene.onAfterAnimationsObservable.add(()=>layer.apply(nodes,conversion,quaterniusLocomotion(av),true,scene.getEngine().getDeltaTime()/1000));
    let disposed=false;
    const dispose=()=>{if(disposed)return;disposed=true;layer.restore();scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);};
    body.root.onDisposeObservable.add(dispose);
    registerQuaternius(av,{restore:()=>layer.restore(),dispose});
  }else registerQuaternius(av);
  return true;
}
