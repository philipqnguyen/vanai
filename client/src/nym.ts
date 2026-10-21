import {Quaternion,TransformNode} from '@babylonjs/core';
import type {AvatarNode} from './entities';
import {instantiateModel} from './models';
import {registerQuaternius} from './quaternius-gameplay';
import {NYM_GROUND_OFFSET,NYM_HAIR_CENTRE,NYM_HAIR_SCALE} from './nym-fit';
import type {HairColour} from './appearance';
import {colourHair} from './hair-colour';

/** A Nym's saved look (appearance.ts nymChoice): which body, which hair. */
export interface NymChoice {face:'male'|'female';hair:'tousled'|'bun';hair_colour?:HairColour}

/** Measured Meshy Nym bodies and separate hair, with original Quaternius clips. */
export async function loadNym(av:AvatarNode,id:string,choice:NymChoice):Promise<boolean>{
  const folder=`characters/nym-${choice.face}/`;
  const body=await instantiateModel(folder+'body.glb',id,true);
  if(!body)return false;
  body.root.setEnabled(false);
  // Saved styles stay independent of body: tousled is chestnut, bun is topknot.
  const hairFace=choice.hair==='bun'?'female':'male';
  const hair=await instantiateModel(`characters/nym-${hairFace}/hair.glb`,id,true);
  if(av.root.isDisposed()||body.root.getScene()!==av.root.getScene()||!hair){
    for(const model of [body,hair]){model?.groups.forEach(g=>g.dispose());model?.root.dispose();}return false;
  }
  if(hair){
    colourHair(hair,`nym-${hairFace}/hair`,choice.hair_colour);
    const head=body.root.getDescendants(false).find(n=>n.name==='Head');
    if(!head)throw new Error('Nym body has no Head attachment');
    // Hair is already Head-local. The body's import root supplies the single
    // glTF-to-Babylon coordinate conversion to the attached hierarchy.
    for(const n of hair.root.getChildren())if(n instanceof TransformNode&&n.name==='__root__'){
      n.rotationQuaternion=Quaternion.Identity();n.scaling.setAll(1);
    }
    hair.root.parent=head;
    if(hairFace!==choice.face){
      const source=NYM_HAIR_CENTRE[hairFace],target=NYM_HAIR_CENTRE[choice.face];
      // Keep the topknot cap broad on the male skull; shrinking it exposes
      // the rear temples despite the smaller overall scalp envelope.
      const scale=NYM_HAIR_SCALE[choice.face];
      hair.root.scaling.set(scale[0],scale[1],scale[2]);
      hair.root.position.set(...target.map((v,i)=>v-source[i]*scale[i]) as [number,number,number]);
    }
  }
  body.root.parent=av.root;body.root.position.y=NYM_GROUND_OFFSET[choice.face];body.root.setEnabled(true);
  body.root.metadata={...(body.root.metadata??{}),nymFace:choice.face};
  av.model=body;av.modelVariant='nym-quaternius';av.raceH=1.28;
  av.castOrb.position.set(0,.91,.30);av.castOrb.scaling.setAll(.6);
  registerQuaternius(av);
  return true;
}
