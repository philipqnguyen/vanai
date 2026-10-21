import {skinHash} from './gear/identity';
/** The maker's derived clips, sourced from Quaternius CC0: the approved one-handed
 * sword adaptation and the standing idle (the maker's tools/animations/
 * bake_idle.py). Immutable curves load once; each body template gets one group per
 * clip. Babylon clones targets/skeletons for actors while sharing geometry and
 * Animation key data.
 */
import {Animation,AnimationGroup,Quaternion,Vector3,Mesh,type AssetContainer} from '@babylonjs/core';
import {prepareForearmTemplate} from './forearm-twist';
import {PRODUCTION_BODIES} from './character-bodies';
import {runtimePath} from './asset-index';
export {PRODUCTION_BODIES} from './character-bodies';
export const SWORD_MOTION_KEY='vanai:Sword_Light_Adapted_v02';
export const IDLE_MOTION_KEY='vanai:Idle_Stand_v01';
const DERIVED:{key:string;folder:string}[]=[{key:SWORD_MOTION_KEY,folder:'vanai-sword-v02'},{key:IDLE_MOTION_KEY,folder:'vanai-idle-v01'}];
type Channel={node:string;path:string;offset:number;count:number;width:number};
// `bodies`: a body's own channels replacing the shared ones of the same bone and
// path (the idle's arms are solved per body against that body's skin)
type ClipData={format:number;key:string;seconds:number;frames:number[];channels:Channel[];bodies?:Record<string,{channels:Channel[]}>;rigs:Record<string,{bones:Record<string,{translation:number[];translationScale:number}>}>;buffer:{file:string;bytes:number;sha256:string}};
const pending=new Map<string,Promise<{clip:ClipData;buffer:ArrayBuffer}>>();
function load({key,folder}:{key:string;folder:string}){
 let p=pending.get(key);if(p)return p;
 p=(async()=>{
  // the maker's files, by the asset index
  const at=(f:string)=>runtimePath(`animations/${folder}/${f}`).url;
  const response=await fetch(at('clip.json'));if(!response.ok)throw new Error(`${key} metadata unavailable`);
  const clip=await response.json() as ClipData;if(clip.format!==1||clip.key!==key)throw new Error(`Unsupported motion ${key}`);
  const binary=await fetch(at(clip.buffer.file));if(!binary.ok)throw new Error(`${key} curves unavailable`);
  const buffer=await binary.arrayBuffer();if(buffer.byteLength!==clip.buffer.bytes)throw new Error(`${key} curve size mismatch`);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==clip.buffer.sha256)throw new Error(`${key} curve hash mismatch`);return{clip,buffer};
 })().catch(e=>{pending.delete(key);throw e;});
 pending.set(key,p);return p;
}
function derivedGroup(container:AssetContainer,body:string,clip:ClipData,buffer:ArrayBuffer):AnimationGroup{
 const rig=clip.rigs[body],nodes=new Map(container.transformNodes.map(n=>[n.name,n]));
 const group=new AnimationGroup(clip.key,container.scene);
 try{
  const own=clip.bodies?.[body]?.channels??[],mine=new Set(own.map(ch=>ch.node+'.'+ch.path));
  for(const ch of [...clip.channels.filter(ch=>!mine.has(ch.node+'.'+ch.path)),...own]){
   const target=nodes.get(ch.node),rest=rig?.bones[ch.node];if(!target||!rest)throw new Error(`Missing ${clip.key} target ${body}/${ch.node}`);
   const values=new Float32Array(buffer,ch.offset,ch.count*ch.width),rotation=ch.path==='rotation';
   const property=ch.path==='translation'?'position':rotation?'rotationQuaternion':'scaling';
   const animation=new Animation(`${ch.node}.${property}`,property,60,rotation?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CYCLE);
   const keys=Array.from({length:ch.count},(_,i)=>{
    const v=Array.from(values.subarray(i*ch.width,(i+1)*ch.width));
    if(ch.path==='translation')for(let k=0;k<3;k++)v[k]=Math.fround(rest.translation[k]+v[k]*rest.translationScale);
    return{frame:ch.count===1?0:clip.frames[i],value:rotation?Quaternion.FromArray(v):Vector3.FromArray(v)};
   });
   // a still channel (one key) lasts the clip's length
   if(keys.length===1)keys.push({...keys[0],frame:clip.seconds*60});
   animation.setKeys(keys);group.addTargetedAnimation(animation,target);
  }
  return group;
 }catch(error){group.dispose();throw error;}
}
export async function prepareCharacterTemplate(container:AssetContainer,body:string){
 if(!PRODUCTION_BODIES.some(b=>b===body))return;
 const loaded=await Promise.all(DERIVED.map(load));if(container.scene.isDisposed)return;
 const groups:AnimationGroup[]=[];
 try{
  for(const {clip,buffer} of loaded)groups.push(derivedGroup(container,body,clip,buffer));
  const meshes=container.meshes.filter((m):m is Mesh=>m instanceof Mesh&&!!m.skeleton&&m.getTotalVertices()>0);
  const originalSkin=await Promise.all(meshes.map(skinHash));
  prepareForearmTemplate(meshes);
  for(let i=0;i<meshes.length;i++)meshes[i].metadata={...meshes[i].metadata,equipmentSkin:{original:originalSkin[i],prepared:await skinHash(meshes[i])}};
  for(const group of groups){container.animationGroups.push(group);container.scene.removeAnimationGroup(group);}
 }catch(error){groups.forEach(g=>g.dispose());throw error;}
}
