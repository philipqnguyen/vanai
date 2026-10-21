import type {AvatarNode} from './entities';
import {instantiateModel} from './models';
import {registerQuaternius} from './quaternius-gameplay';
import {karrogChoice,type CharacterAppearance} from './appearance';
import {colourHair} from './hair-colour';

/** The approved 2.20 m body and fit-v02 pieces already contain their full fit. */
export async function loadKarrog(av:AvatarNode,id:string,appearance?:CharacterAppearance):Promise<boolean>{
  const choice=karrogChoice('karrog',appearance)!;
  const body=await instantiateModel('characters/karrog-male/body.glb',id,true);
  if(!body)return false;
  body.root.setEnabled(false);
  const pieces=[];
  for(const name of ['coif',choice.beard?'beard':null]){
    if(!name)continue;
    const piece=await instantiateModel(`characters/karrog-male/${name}.glb`,id,true);
    // the beard is hair too: it takes the coif's colour
    if(piece)colourHair(piece,`karrog-male/${name}`,choice.hair_colour);
    pieces.push(piece);
  }
  const models=[body,...pieces];
  if(av.root.isDisposed()||body.root.getScene()!==av.root.getScene()||pieces.some(p=>!p)){
    for(const model of models){model?.groups.forEach(g=>g.dispose());model?.root.dispose();}return false;
  }
  const skeleton=body.root.getChildMeshes().find(m=>m.skeleton)?.skeleton;
  if(!skeleton)throw new Error('Karrog body has no skeleton');
  for(const piece of pieces){
    if(!piece)continue;
    const redundant=new Set(piece.root.getChildMeshes().map(m=>m.skeleton).filter(s=>s&&s!==skeleton));
    for(const mesh of piece.root.getChildMeshes())if(mesh.skeleton){
      mesh.skeleton=skeleton;mesh.alwaysSelectAsActiveMesh=true;
    }
    redundant.forEach(s=>s?.dispose());
    for(const node of piece.root.getDescendants(false))if(node.name==='root'&&!node.getChildMeshes().length)node.dispose();
  }
  // Keep each import's glTF conversion and one equal sole reference. Coif and
  // beard are actor/bind-space skins, never Head-local ornaments.
  for(const model of models)if(model){model.root.parent=av.root;model.root.position.y=.0168;}
  body.root.setEnabled(true);
  av.model=body;av.modelVariant='karrog-quaternius';av.raceH=2.20;
  av.castOrb.position.set(0,1.7,.4);
  registerQuaternius(av);
  return true;
}
