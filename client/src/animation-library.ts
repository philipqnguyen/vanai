import {Animation,AnimationGroup,Quaternion,Vector3,TransformNode,type Scene} from '@babylonjs/core';
import {runtimePath} from './asset-index';
export type Curve={node:string;path:'translation'|'rotation'|'scale';interpolation:'LINEAR'|'STEP';times:number;values:number};
export type Clip={name:string;start:number;end:number;channels:Curve[]};
type Rest={translation:number[];rotation:number[];scale:number[];parent?:string|null;translationScale?:number};
export type Pack={id:string;title:string;nodes:Record<string,Rest>;clips:Clip[]};
export type Library={format:number;variant:string;packs:Pack[];rigs:Record<string,{body:string;sha256:string;bones:Record<string,Rest>}>;accessors:{offset:number;count:number;width:number}[];buffer:{file:string;bytes:number;sha256:string}};
export type LoadedLibrary={catalog:Library;buffer:ArrayBuffer};
let pending:Promise<LoadedLibrary>|undefined;
/** Only the development review entry imports this module. Normal play is unchanged. */
export function loadAnimationLibrary():Promise<LoadedLibrary>{
  if(!import.meta.env.DEV)throw new Error('Full animation library is development-review only');
  return pending??= (async()=>{
    // the maker's files, by the asset index
    const at=(f:string)=>runtimePath('animation-library/quaternius/'+f).url;
    const response=await fetch(at('catalog.json'));if(!response.ok)throw new Error('Animation catalog could not load');
    const catalog=await response.json() as Library;
    if(catalog.format!==1||catalog.variant!=='inplace')throw new Error('Unsupported animation library');
    const data=await fetch(at(catalog.buffer.file));if(!data.ok)throw new Error('Animation buffer could not load');
    const buffer=await data.arrayBuffer();if(buffer.byteLength!==catalog.buffer.bytes)throw new Error('Animation buffer size mismatch');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
    if(digest!==catalog.buffer.sha256)throw new Error('Animation buffer hash mismatch');
    return {catalog,buffer};
  })().catch(error=>{pending=undefined;throw error;});
}
export function samples(library:LoadedLibrary,index:number):Float32Array{
  const a=library.catalog.accessors[index];return new Float32Array(library.buffer,a.offset,a.count*a.width);
}
/** Fixed rest/length adaptation, matching all 21 existing clips on every body.
 * Build just the selected group; do not allocate 254 animations per character.
 */
export function makeLibraryClip(library:LoadedLibrary,body:string,pack:Pack,clip:Clip,nodes:Map<string,TransformNode>,scene:Scene):AnimationGroup{
  const rig=library.catalog.rigs[body];if(!rig)throw new Error(`Unknown rig ${body}`);
  const group=new AnimationGroup(`${body} ${pack.id}:${clip.name}`,scene);
  try{
    for(const channel of clip.channels){
      const target=nodes.get(channel.node),rest=rig.bones[channel.node],source=pack.nodes[channel.node];
      if(!target||!rest||!source)throw new Error(`Missing target ${body}/${channel.node}`);
      const times=samples(library,channel.times),values=samples(library,channel.values),width=channel.path==='rotation'?4:3;
      const property=channel.path==='translation'?'position':channel.path==='rotation'?'rotationQuaternion':'scaling';
      const animation=new Animation(`${channel.node}.${property}`,property,60,channel.path==='rotation'?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CYCLE);
      animation.setKeys(Array.from(times,(t,i)=>{
        const v=Array.from(values.subarray(i*width,(i+1)*width));
        if(channel.path==='translation')for(let j=0;j<3;j++)v[j]=Math.fround(rest.translation[j]+(v[j]-source.translation[j])*rest.translationScale!);
        return {frame:t*60,value:width===4?Quaternion.FromArray(v):Vector3.FromArray(v),interpolation:channel.interpolation==='STEP'?1:undefined};
      }));
      group.addTargetedAnimation(animation,target);
    }
    // Do not normalize keys: source channel end times intentionally differ.
    return group;
  }catch(error){group.dispose();throw error;}
}
export function restoreLibraryRest(library:LoadedLibrary,body:string,nodes:Map<string,TransformNode>):void{
  for(const [name,rest] of Object.entries(library.catalog.rigs[body].bones)){
    const target=nodes.get(name);if(!target)throw new Error(`Missing rest joint ${name}`);
    target.position.copyFromFloats(...rest.translation as [number,number,number]);
    target.rotationQuaternion=Quaternion.FromArray(rest.rotation);target.scaling.copyFromFloats(...rest.scale as [number,number,number]);
  }
}
