import {Mesh,PBRMaterial,Texture,DynamicTexture,Color3,type Scene,type Material} from '@babylonjs/core';
import {SwayDrape} from './drape';
import {CollarBoundary} from './collar-boundary';
import {CoordinatedArtwork as AedriArtwork,retainArtworkCoordinates} from './artwork-aedri';
import {CoordinatedArtwork as TargetArtwork} from './artwork-target';
import {clipPanel} from './panel-clip';
import {packedTexture} from './packed-index';
export type Pin={url:string;sha256:string;bytes:number};
export type Component={kind:string;model?:Pin;config?:Pin;faceMap?:Pin;artwork?:Pin;boundaries?:Pin;mounts?:Pin;coordinated?:boolean};
export type Entry={slot:string;domain:Pin;components:Component[];artwork?:Pin;artRecipe?:Pin;artAdapter?:string};
/** Instance-owned presentation resources; immutable payloads are shared by the caller. */
export class Components {
 materials:Material[]=[];textures:Texture[]=[];meshes:Mesh[]=[];disposed=false;
 constructor(private scene:Scene,private native:Mesh,private bytes:(pin:Pin)=>Promise<ArrayBuffer>,private json:(pin:Pin)=>Promise<any>){}
 dispose(){this.disposed=true;this.meshes.splice(0).forEach(m=>m.dispose(false,false));this.materials.splice(0).forEach(m=>m.dispose(false,false));this.textures.splice(0).forEach(t=>t.dispose());}
 // Its packed KTX2 copy when the index lists one (the
 // approved PNG is then not shipped), else the approved PNG.
 async texture(pin:Pin,alpha=false,wrap=true){
  const packed=packedTexture(pin);
  if(packed)return this.load(await this.bytes(packed),'.ktx2',alpha,wrap);
  return this.load(await this.bytes(pin),undefined,alpha,wrap);
 }
 private async load(data:ArrayBuffer,extension:string|undefined,alpha:boolean,wrap:boolean){
  if(this.disposed)throw Error('Equipment disposed');
  const url=URL.createObjectURL(new Blob([data],{type:extension?'image/ktx2':'image/png'}));
  try{const t=await new Promise<Texture>((resolve,reject)=>{const texture=new Texture(url,this.scene,{noMipmap:false,invertY:true,samplingMode:Texture.BILINEAR_SAMPLINGMODE,forcedExtension:extension,onLoad:()=>resolve(texture),onError:(message)=>{texture.dispose();reject(Error(message??'Equipment texture failed'));}});});if(this.disposed){t.dispose();throw Error('Equipment disposed');}this.textures.push(t);t.hasAlpha=alpha;t.wrapU=wrap?Texture.WRAP_ADDRESSMODE:Texture.CLAMP_ADDRESSMODE;t.wrapV=Texture.CLAMP_ADDRESSMODE;return t;}finally{URL.revokeObjectURL(url);}
 }
 material(name:string){const m=new PBRMaterial(name,this.scene);m.metallic=0;m.roughness=.9;m.backFaceCulling=false;this.materials.push(m);return m;}
 async artwork(mesh:Mesh,entry:Entry,reuseMaterial=false){
  const material=reuseMaterial?mesh.material as PBRMaterial:this.material('Original coordinated gear artwork');material.albedoColor=Color3.White();material.albedoTexture=null;
  retainArtworkCoordinates(mesh);const recipe=await this.json(entry.artRecipe!),texture=await this.texture(entry.artwork!,false,false);
  if(entry.artAdapter==='aedri')new AedriArtwork(material,texture,recipe);else new TargetArtwork(material,texture,recipe);
  mesh.material=material;return material;
 }
 async configure(mesh:Mesh,component:Component,entry:Entry){
  if(component.coordinated)return;
  else if(component.artwork){const m=this.material('Original '+component.kind+' artwork');m.albedoTexture=await this.texture(component.artwork,false,component.kind==='collar');mesh.material=m;}
  if(component.boundaries){const b=await this.json(component.boundaries);if(b.bounds.length!==mesh.getTotalVertices()||b.rays.length!==mesh.getTotalVertices())throw Error('Collar attribute count mismatch');mesh.setVerticesData('collarBounds',b.bounds.flat(),false,3);mesh.setVerticesData('collarRays',b.rays.flat(),false,2);new CollarBoundary(mesh.material,this.scene,b.notch_half_angle_radians,b.seam_overlap_m);}
 }
 async drapes(component:Component,entry:Entry){
  const cfg=await this.json(component.config!);if(this.disposed)throw Error('Equipment disposed');
  const mounts=component.mounts?(await this.json(component.mounts)).panels:[null];
  for(const mount of mounts){
   const d=new SwayDrape(this.scene,this.native,cfg),m=d.mesh;this.meshes.push(m);m.setEnabled(false);d.enabled=false;d.controls.fill(0);m.isPickable=false;
   if(cfg.visibility)d.setMode('item');
   if(mount){const buffers:any={};for(const k of m.getVerticesDataKinds())buffers[k]={size:m.getVertexBuffer(k)!.getSize(),data:m.getVerticesData(k)!};const clipped=clipPanel(buffers,Array.from(m.getIndices()!),mount);for(const [k,b] of Object.entries(clipped.buffers) as any)m.setVerticesData(k,b.data,false,b.size);m.setIndices(clipped.indices as number[]);m.refreshBoundingInfo();}
   let mat:PBRMaterial;
   if(component.coordinated){
    mat=await this.artwork(m,entry);d.attachMaterial(mat);d.setMode('robe');
    const alpha=new DynamicTexture('Authored robe visibility',{width:1024,height:1024},this.scene,false);this.textures.push(alpha);alpha.hasAlpha=true;alpha.wrapU=Texture.WRAP_ADDRESSMODE;alpha.wrapV=Texture.CLAMP_ADDRESSMODE;const ctx=alpha.getContext();ctx.clearRect(0,0,1024,1024);ctx.fillStyle='white';for(let x=0;x<1024;x++)ctx.fillRect(x,0,1,d.visibleLength(x/1024)*1024);alpha.update();m.setVerticesData('uv2',[...d.uvs]);alpha.coordinatesIndex=1;mat.opacityTexture=alpha;
   }else{mat=this.material('Original '+component.kind+' panels');mat.albedoTexture=await this.texture(component.artwork!,true);mat.useAlphaFromAlbedoTexture=true;d.attachMaterial(mat);}
   mat.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;mat.alphaCutOff=.5;
  }
  return cfg;
 }
}
