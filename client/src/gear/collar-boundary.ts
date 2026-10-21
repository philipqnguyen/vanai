import {MaterialPluginBase,ShadowDepthWrapper} from '@babylonjs/core';
export class CollarBoundary extends MaterialPluginBase {
 constructor(material:any,scene:any,halfAngle:number,overlap:number){super(material,'StandardCollarBoundary',216,{},true,false);this._enable(true);material.metadata={collarHalfAngle:halfAngle,collarOverlap:overlap};material.shadowDepthWrapper=new ShadowDepthWrapper(material,scene);}
 getClassName(){return 'StandardCollarBoundary'}
 getAttributes(a:string[]){a.push('collarBounds','collarRays')}
 getUniforms(){return {ubo:[{name:'collarHalfAngle',size:1,type:'float'},{name:'collarOverlap',size:1,type:'float'}],fragment:'uniform float collarHalfAngle; uniform float collarOverlap;'}}
 bindForSubMesh(buffer:any){buffer.updateFloat('collarHalfAngle',this._material.metadata.collarHalfAngle);buffer.updateFloat('collarOverlap',this._material.metadata.collarOverlap)}
 getCustomCode(type:string):any{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'attribute vec3 collarBounds; attribute vec2 collarRays; varying vec3 vCollarBounds; varying vec2 vCollarRays;',CUSTOM_VERTEX_MAIN_END:'vCollarBounds=collarBounds;vCollarRays=collarRays;'};
  if(type==='fragment')return {CUSTOM_FRAGMENT_DEFINITIONS:'varying vec3 vCollarBounds; varying vec2 vCollarRays;',CUSTOM_FRAGMENT_BEFORE_LIGHTS:'if(vCollarBounds.x < -collarOverlap||vCollarBounds.y<0.0)discard;float collarAngle=abs(atan(vCollarRays.x,vCollarRays.y));if(vCollarBounds.x>vCollarBounds.z*min(1.0,collarAngle/collarHalfAngle))discard;'};
  return null;
 }
}
