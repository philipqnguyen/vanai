import {Mesh,TransformNode,type Scene} from '@babylonjs/core';
import {gear} from '../asset-index';
import type {Entry,Pin} from './components';
import {container} from './assets';
import {cloneRigidRoot} from './rigid';
import {addShadowCaster} from '../scene';
type Native={model:Pin;coverage:Pin;face_map:Pin;body_source:{sha256:string};keep_native_weights:boolean;garment_keep_inside_domain:boolean};
type Weapon={type:string;shared_model?:Pin;bodies:Record<string,Native>};
const items=gear.weapons.items as Record<string,Weapon>;
export function weaponEntry(id?:string){return id&&Object.hasOwn(items,id)?items[id]:undefined;}
export function nativeWeapon(id:string|undefined,body:string,source:string):Entry|undefined{
 const native=weaponEntry(id)?.bodies[body];if(!native)return;
 if(native.body_source.sha256!==source||!native.keep_native_weights||!native.garment_keep_inside_domain)throw Error('Weapon native source contract mismatch');
 return {slot:'weapon',domain:native.coverage,components:[{kind:'handwraps',model:native.model,faceMap:native.face_map}]};
}
/** Detach only the authored donor node; the glTF conversion wrapper is not a grip. */
export async function rigidWeapon(id:string,scene:Scene,owner:TransformNode):Promise<TransformNode|undefined>{
 const pin=weaponEntry(id)?.shared_model;if(!pin)return;
 const releases:(()=>void)[]=[];let root:TransformNode|undefined,disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;root?.dispose(false,false);releases.splice(0).forEach(fn=>fn());};
 owner.onDisposeObservable.addOnce(dispose);
 try{
  // a clone shares the container's geometry and reads none of it
  const pack=await container(pin,scene,releases);
  if(disposed||owner.isDisposed()||scene.isDisposed){releases.splice(0).forEach(fn=>fn());return;}
  root=cloneRigidRoot(pack,id);
  for(const mesh of [...(root instanceof Mesh?[root]:[]),...root.getChildMeshes()])addShadowCaster(mesh);
  return root;
 }catch(error){dispose();if(!owner.isDisposed())throw error;}
}
