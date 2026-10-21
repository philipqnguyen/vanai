import type {AvatarNode} from './entities';
import {instantiateModel} from './models';
import {registerQuaternius} from './quaternius-gameplay';
import {valdrenChoice,type CharacterAppearance} from './appearance';
import {VALDREN_GROUND_OFFSET} from './valdren-fit';
import {colourHair} from './hair-colour';

/** Approved elf proportions and source motion, without the old Valdren reshape. */
export async function loadValdren(av:AvatarNode,id:string,appearance?:CharacterAppearance):Promise<boolean>{
  const choice=valdrenChoice('valdren',appearance)!;
  const folder=`characters/valdren-${choice.face}/`;
  const body=await instantiateModel(folder+'body.glb',id,true);
  if(!body)return false;
  body.root.setEnabled(false);
  const hair=await instantiateModel(folder+'hair.glb',id,true);
  if(av.root.isDisposed()||body.root.getScene()!==av.root.getScene()||!hair){
    for(const model of [body,hair]){model?.groups.forEach(g=>g.dispose());model?.root.dispose();}return false;
  }
  if(hair){
    colourHair(hair,`valdren-${choice.face}/hair`,choice.hair_colour);
    const skeleton=body.root.getChildMeshes().find(m=>m.skeleton)?.skeleton;
    if(!skeleton)throw new Error('Valdren body has no skeleton');
    const redundant=new Set(hair.root.getChildMeshes().map(m=>m.skeleton).filter(s=>s&&s!==skeleton));
    for(const mesh of hair.root.getChildMeshes())if(mesh.skeleton){
      mesh.skeleton=skeleton;mesh.alwaysSelectAsActiveMesh=true;
    }
    redundant.forEach(s=>s?.dispose());
    for(const node of hair.root.getDescendants(false))if(node.name==='root'&&!node.getChildMeshes().length)node.dispose();
    // Each sibling import keeps its glTF conversion. The same sole reference
    // on both wrappers keeps the shared bind-space hair aligned to the body.
    hair.root.parent=av.root;hair.root.position.y=VALDREN_GROUND_OFFSET[choice.face];
  }
  body.root.parent=av.root;body.root.position.y=VALDREN_GROUND_OFFSET[choice.face];body.root.setEnabled(true);
  body.root.metadata={...(body.root.metadata??{}),valdrenFace:choice.face};
  av.model=body;av.modelVariant='valdren-quaternius';av.raceH=1.90;
  av.castOrb.position.set(0,1.45,.4);
  registerQuaternius(av);
  return true;
}
