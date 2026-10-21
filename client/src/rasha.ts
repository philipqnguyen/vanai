import {Quaternion,TransformNode} from '@babylonjs/core';
import type {AvatarNode} from './entities';
import {rashaChoice,type CharacterAppearance} from './appearance';
import {instantiateModel} from './models';
import {registerQuaternius} from './quaternius-gameplay';
import {RASHA_GROUND_OFFSET} from './rasha-fit';
import {colourHair} from './hair-colour';

/** Measured Meshy Rasha bodies and separate hair, with original Quaternius clips. */
export async function loadRasha(av:AvatarNode,id:string,appearance?:CharacterAppearance):Promise<boolean>{
  const choice=rashaChoice('rasha',appearance)!;
  const folder='characters/rasha-female/';
  const body=await instantiateModel(folder+'body.glb',id,true);
  if(!body)return false;
  body.root.setEnabled(false);
  // Legacy non-bald appearance values resolve to this body's supplied style.
  const hair=await instantiateModel(folder+'hair.glb',id,true);
  if(av.root.isDisposed()||body.root.getScene()!==av.root.getScene()||!hair){
    for(const model of [body,hair]){model?.groups.forEach(g=>g.dispose());model?.root.dispose();}return false;
  }
  if(hair){
    colourHair(hair,'rasha-female/hair',choice.hair_colour);
    const head=body.root.getDescendants(false).find(n=>n.name==='Head');
    if(!head)throw new Error('Rasha body has no Head attachment');
    // Hair is already Head-local. The body's import root supplies the single
    // glTF-to-Babylon coordinate conversion to the attached hierarchy.
    for(const n of hair.root.getChildren())if(n instanceof TransformNode&&n.name==='__root__'){
      n.rotationQuaternion=Quaternion.Identity();n.scaling.setAll(1);
    }
    hair.root.parent=head;
  }
  body.root.parent=av.root;body.root.position.y=RASHA_GROUND_OFFSET[choice.face];body.root.setEnabled(true);
  body.root.metadata={...(body.root.metadata??{}),rashaFace:choice.face};
  av.model=body;av.modelVariant='rasha-quaternius';av.raceH=1.8;
  av.castOrb.position.set(0,1.35,.45);av.castOrb.scaling.setAll(.85);
  registerQuaternius(av);
  return true;
}
