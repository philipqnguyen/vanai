import {MaterialPluginBase,RawTexture,Texture,Constants,Mesh,SubMesh,ShadowDepthWrapper,Geometry,VertexBuffer} from '@babylonjs/core';
import {validateCoverageSource} from './underlay';
// Only the partial-face copies carry the domain attributes. The whole faces draw
// the shared original vertices and get the row of -1 (no discard test) as a
// constant instead of a per-character buffer. The fragment program stays the
// one every face used before: compiling the test out moved single pixels by one
// level (measured), so only the vertex stage differs.
const domainOn=(mesh:any)=>!!mesh?.isVerticesDataPresent?.('clothingRow');
// A material clone clones every texture slot. Each copy holds the shared GPU
// texture and its CPU copy past the gear that owns them and was never disposed
// (measured: ~87 MB and 100 textures per 20 NPCs reloaded), so the clone uses
// the source's own textures and disposing it with (false,false) stays right.
function shareTextures(clone:any,source:any){for(const key of Object.keys(clone)){const t=clone[key];if(t instanceof Texture&&source[key]!==t){t.dispose();clone[key]=source[key];}}return clone;}
class DomainPlugin extends MaterialPluginBase {
 constructor(material:any,private texture:RawTexture,private height:number,private keepInside:boolean){super(material,'ClothingSourceDomain',215,{CLOTHING_DOMAIN:false,CLOTHING_DOMAIN_COPIES:false});this._enable(true)}
 getClassName(){return 'ClothingSourceDomain'}
 prepareDefines(d:any,_scene:any,mesh:any){d.CLOTHING_DOMAIN=true;d.CLOTHING_DOMAIN_COPIES=domainOn(mesh)}
 getAttributes(a:string[],_scene:any,mesh:any){if(domainOn(mesh))a.push('clothingBary','clothingRow','clothingSubtract')}
 getSamplers(a:string[]){a.push('clothingDomainSampler')}
 getUniforms(){return {ubo:[{name:'clothingDomainInfo',size:2,type:'vec2'}],fragment:'uniform vec2 clothingDomainInfo;'}}
 bindForSubMesh(buffer:any){buffer.setTexture('clothingDomainSampler',this.texture);buffer.updateFloat2('clothingDomainInfo',this.height,this.keepInside?1:0)}
 getCustomCode(type:string):any{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'\n#ifdef CLOTHING_DOMAIN_COPIES\nattribute vec2 clothingBary; attribute float clothingRow; attribute float clothingSubtract;\n#endif\nvarying vec2 vClothingBary; varying float vClothingRow; varying float vClothingSubtract;',CUSTOM_VERTEX_MAIN_END:'\n#ifdef CLOTHING_DOMAIN_COPIES\nvClothingBary=clothingBary;vClothingRow=clothingRow;vClothingSubtract=clothingSubtract;\n#else\nvClothingBary=vec2(0.0);vClothingRow=-1.0;vClothingSubtract=0.0;\n#endif\n'};
  if(type==='fragment')return {CUSTOM_FRAGMENT_DEFINITIONS:'uniform sampler2D clothingDomainSampler; varying vec2 vClothingBary; varying float vClothingRow; varying float vClothingSubtract;',CUSTOM_FRAGMENT_BEFORE_LIGHTS:`if(vClothingRow>=0.0){bool insideAny=false;bool firstInside=false;bool secondInside=false;for(int p=0;p<2;p++){bool insidePoly=true;bool hasEdge=false;for(int e=0;e<6;e++){vec4 plane=texture2D(clothingDomainSampler,vec2((float(p*6+e)+0.5)/12.0,(vClothingRow+0.5)/clothingDomainInfo.x));if(plane.w>0.5){hasEdge=true;if(dot(plane.xyz,vec3(vClothingBary,1.0))<0.0)insidePoly=false;}}if(p==0)firstInside=hasEdge&&insidePoly;else secondInside=hasEdge&&insidePoly;insideAny=insideAny||(hasEdge&&insidePoly);}if(vClothingSubtract>0.5)insideAny=firstInside&&!secondInside;if((clothingDomainInfo.y>0.5 ? !insideAny : insideAny))discard;}`};
  return null;
 }
}
class NonlinearDepthOutput extends MaterialPluginBase {
 constructor(material:any){super(material,'ClothingNonlinearDepth',220,{CLOTHING_DEPTH:false});this._enable(true)}
 prepareDefines(d:any){d.CLOTHING_DEPTH=true}
 getCustomCode(type:string):any{return type==='fragment'?{CUSTOM_FRAGMENT_MAIN_END:'gl_FragColor=vec4(gl_FragCoord.z,0.0,0.0,1.0);'}:null}
}
/** Fixed source-face domains; ordinary skinning and no per-frame CPU work.
 * Material and original vertex/index buffers restore from immutable originals.
 * While covering, a character owns only an index list over the original's
 * shared vertex buffers and a small child mesh of the partly covered faces.
 */
export class SourceDomainCoverage {
 private original:any;private material:any;private get indices(){return this.original.getIndices(false,false);}private originalInfluences:number;private keeper:Mesh;private shared:Geometry|null=null;private patch:Mesh|null=null;private copies=new Uint32Array(0);private tex:RawTexture|null=null;private activeMaterial:any=null;private records=new Map<string,any>();private map:number[];private active:string[]=[];private depthRenderer:any=null;private depthMaterial:any=null;private exclusions:any[]=[];
 static async create(mesh:Mesh,records:any[],sourceSha:string,faceMap?:number[],keepInside=false){
  // Every record still validates its domain. Identical source proofs need one
  // hash pass on this unmodified mesh, not one pass per equipped item. The set
  // is call-local: future mesh mutations must always be checked again.
  const verified=new Set<string>();
  for(const r of records){if(r.schema!=='clothing-source-domains-v1'||r.source.glb_sha256!==sourceSha)throw Error('Source domain identity mismatch');if(!faceMap){const proof=JSON.stringify([r.source.glb_sha256,r.source.body_triangles,r.source.body_indices_sha256,r.source.body_positions_sha256,r.source.body_skinning_sha256]);if(!verified.has(proof)){await validateCoverageSource(mesh,r.source);verified.add(proof);}}const protectedFaces=new Set(r.protected_faces??[]);if(r.whole_faces.some((f:number)=>protectedFaces.has(f))||r.partial.some((p:any)=>protectedFaces.has(p.face)))throw Error('Source domain covers protected anatomy');if(r.partial.some((p:any)=>!Number.isInteger(p.face)||p.face<0||p.face>=r.source.body_triangles||!p.halfplanes.length||p.halfplanes.length>6||p.halfplanes.some((e:number[])=>e.length!==3||e.some(v=>!Number.isFinite(v)))))throw Error('Invalid source-domain polygon');}
  return new SourceDomainCoverage(mesh,records,faceMap,keepInside);
 }
 constructor(private mesh:Mesh,records:any[],faceMap:number[]|undefined,private keepInside:boolean){
  // The original geometry stays alive unchanged (the keeper holds it), so its
  // vertex data is read back from it, not copied: a copy of every body and gear
  // vertex as JS numbers was the largest share of a dressed actor's heap, and a
  // whole-mesh display copy per character the next largest.
  this.original=mesh.geometry;this.material=mesh.material;this.originalInfluences=mesh.numBoneInfluencers;this.map=faceMap??Array.from({length:this.indices.length/3},(_,i)=>i);if(this.map.length!==this.indices.length/3)throw Error('Source face correspondence count mismatch');
  this.keeper=new Mesh('immutable source domain keeper',mesh.getScene());this.original.applyToMesh(this.keeper);this.keeper.setEnabled(false);
  for(const r of records){if(this.records.has(r.item))throw Error('Duplicate domain');this.records.set(r.item,r)}
 }
 setActive(active:string[]){
  active=[...new Set(active)].sort();if(active.some(x=>!this.records.has(x)))throw Error('Unknown source domain');this.active=active;
  if(!active.length){this.original.applyToMesh(this.mesh);this.mesh.material=this.material;this.mesh.numBoneInfluencers=this.originalInfluences;this.mesh.releaseSubMeshes();new SubMesh(0,0,this.mesh.getTotalVertices(),0,this.original.getTotalIndices(),this.mesh);this.depthRenderer?.setMaterialForRendering(this.mesh,undefined);this.release();return}
  const whole=new Set<number>(),partial=new Map<number,any[]>();for(const id of active){const r=this.records.get(id);for(const f of r.whole_faces)whole.add(f);for(const p of r.partial){const list=partial.get(p.face)??[];list.push(p);partial.set(p.face,list)}}
  const holeWhole=new Set<number>(),holePartial=new Map<number,any>();for(const r of this.exclusions){for(const f of r.whole_faces)holeWhole.add(f);for(const p of r.partial){if(holePartial.has(p.face))throw Error('Overlapping partial exclusion owners require an explicit union');holePartial.set(p.face,p)}}
  // Whole faces keep their original vertex indices (a typed list over the shared
  // buffers); a partial face's corners are copied into the patch with the domain
  // row and barycentrics its fragments test.
  const indices=this.indices,count=this.original.getTotalVertices(),kept=new (count<=65535?Uint16Array:Uint32Array)(indices.length);let n=0;
  const copies:number[]=[],bary:number[]=[],rows:number[]=[],subtract:number[]=[],planes:number[][]=[];
  for(let f=0;f<this.map.length;f++){
   const source=this.map[f];let full=whole.has(source),pp=partial.get(source)??[];const hole=holePartial.get(source);if(this.keepInside&&holeWhole.has(source))continue;let sub=false;if(this.keepInside&&hole&&(full||pp.length)){pp=[full?{halfplanes:[[0,0,1]]}:pp[0],hole];full=false;sub=true;}
   if((!this.keepInside&&full)||(this.keepInside&&!full&&!pp.length))continue;
   if(!full&&pp.length){if(pp.length>2)throw Error('More than two convex domains per source face');const row=planes.length;const values=new Array(48).fill(0);for(let p=0;p<pp.length;p++){if(pp[p].halfplanes.length>6)throw Error('Too many polygon edges');pp[p].halfplanes.forEach((eq:number[],e:number)=>{values.splice((p*6+e)*4,4,...eq,1)})}planes.push(values);for(let k=0;k<3;k++){copies.push(indices[f*3+k]);bary.push(k===1?1:0,k===2?1:0);rows.push(row);subtract.push(sub?1:0)}}else for(let k=0;k<3;k++)kept[n++]=indices[f*3+k];
  }
  this.patch?.dispose(false,false);this.patch=null;
  const height=Math.max(1,planes.length),data=new Float32Array(height*48);planes.forEach((p,i)=>data.set(p,i*48));this.tex?.dispose();this.activeMaterial?.dispose(false,false);this.tex=RawTexture.CreateRGBATexture(data,12,height,this.mesh.getScene(),false,false,Texture.NEAREST_SAMPLINGMODE,Constants.TEXTURETYPE_FLOAT);this.tex.wrapU=this.tex.wrapV=Texture.CLAMP_ADDRESSMODE;this.tex.gammaSpace=false;
  this.activeMaterial=shareTextures(this.material.clone('Clothing exact static source domain'),this.material);new DomainPlugin(this.activeMaterial,this.tex,height,this.keepInside);this.activeMaterial.shadowDepthWrapper=new ShadowDepthWrapper(this.activeMaterial,this.mesh.getScene());if(this.depthRenderer){this.depthMaterial?.dispose(false,false);this.depthMaterial=shareTextures(this.material.clone('Clothing exact nonlinear depth'),this.material);new DomainPlugin(this.depthMaterial,this.tex,height,this.keepInside);new NonlinearDepthOutput(this.depthMaterial);this.depthRenderer.setMaterialForRendering(this.mesh,this.depthMaterial);}
  // The wrappers draw the original's GPU buffers and never release them: the
  // original keeps them (the keeper holds it) until after this geometry is gone.
  // Shared ownership is not safe here, since a buffer uploaded after it was set
  // on its geometry never counted that first owner. Only the index list is ours.
  const scene=this.mesh.getScene(),geometry=new Geometry('source domain '+this.mesh.uniqueId,scene),previous=this.shared;
  for(const kind of this.original.getVerticesDataKinds()){const vb=this.original.getVertexBuffer(kind);geometry.setVerticesBuffer(new VertexBuffer(scene.getEngine(),vb.getWrapperBuffer(),kind,{updatable:vb.isUpdatable(),stride:vb.byteStride,offset:vb.byteOffset,size:vb.getSize(),type:vb.type,normalized:vb.normalized,useBytes:true,takeBufferOwnership:false}),count)}
  geometry.setIndices(kept.slice(0,n),count);geometry.applyToMesh(this.mesh);this.shared=geometry;previous?.dispose();this.mesh.material=this.activeMaterial;this.mesh.numBoneInfluencers=this.originalInfluences;this.mesh.releaseSubMeshes();new SubMesh(0,0,count,0,n,this.mesh);
  this.copies=Uint32Array.from(copies);if(copies.length){
   const patch=this.patch=this.makePatch();for(const kind of geometry.getVerticesDataKinds())this.copyToPatch(kind);
   patch.setVerticesData('clothingBary',new Float32Array(bary),false,2);patch.setVerticesData('clothingRow',new Float32Array(rows),false,1);patch.setVerticesData('clothingSubtract',new Float32Array(subtract),false,1);const order=new (copies.length<=65535?Uint16Array:Uint32Array)(copies.length);for(let i=0;i<order.length;i++)order[i]=i;patch.setIndices(order);
  }
  // Data a caller adds to the covered mesh later (an artwork's coordinates) is
  // per vertex, so the copied corners need theirs as the old display copy had.
  geometry.onGeometryUpdated=(g,kind)=>{if(kind&&g===this.shared&&this.patch)this.copyToPatch(kind)};
 }
 private copyToPatch(kind:string){const data=this.shared!.getVerticesData(kind)!,width=data.length/this.shared!.getTotalVertices(),values=new Float32Array(this.copies.length*width);for(let i=0;i<this.copies.length;i++)for(let k=0;k<width;k++)values[i*width+k]=data[this.copies[i]*width+k];this.patch!.setVerticesData(kind,values,false,width)}
 private makePatch(){
  // A child at identity draws in the covered mesh's space and follows its
  // enabled state; everything else that decides how that mesh draws is copied.
  // Never pickable: picking needs CPU geometry, which is released once a
  // character is dressed. The body mesh itself stays pickable, and an NPC has
  // a body-sized hit capsule; only the thin partly covered bands are lost.
  const mesh=this.mesh,patch=new Mesh('source domain partial faces',mesh.getScene(),mesh);
  patch.skeleton=mesh.skeleton;patch.numBoneInfluencers=this.originalInfluences;patch.material=this.activeMaterial;patch.alwaysSelectAsActiveMesh=mesh.alwaysSelectAsActiveMesh;patch.receiveShadows=mesh.receiveShadows;patch.isPickable=false;patch.isVisible=mesh.isVisible;patch.visibility=mesh.visibility;patch.layerMask=mesh.layerMask;patch.renderingGroupId=mesh.renderingGroupId;patch.hasVertexAlpha=mesh.hasVertexAlpha;patch.useVertexColors=mesh.useVertexColors;patch.sideOrientation=mesh.sideOrientation;patch.overrideMaterialSideOrientation=mesh.overrideMaterialSideOrientation;
  // Opaque meshes draw in scene order, and where layers meet at equal depth the
  // later one wins: the copies draw right after their mesh, where they used to.
  const list=mesh.getScene().meshes;list.splice(list.indexOf(patch),1);list.splice(list.indexOf(mesh)+1,0,patch);
  for(const light of mesh.getScene().lights)light.getShadowGenerators()?.forEach(g=>{const list=g.getShadowMap()?.renderList;if(list?.includes(mesh))list.push(patch)});
  if(this.depthRenderer)this.depthRenderer.setMaterialForRendering(patch,this.depthMaterial);
  return patch;
 }
 // Only once the covered mesh draws the original again.
 private release(){this.patch?.dispose(false,false);this.patch=null;this.shared?.dispose();this.shared=null;this.copies=new Uint32Array(0)}
 info(){return {active:this.active,originalGeometryRestored:this.mesh.geometry===this.original,originalMaterialRestored:this.mesh.material===this.material,originalIndexOrderRestored:JSON.stringify(Array.from(this.mesh.getIndices()!))===JSON.stringify(Array.from(this.indices)),originalInfluences:this.originalInfluences,perFrameGeometryWork:false,perFrameTextureUploads:0,vertices:this.mesh.getTotalVertices()+(this.patch?.getTotalVertices()??0),sharedVertexBuffers:this.original.getVerticesDataKinds().every((k:string)=>this.mesh.getVertexBuffer(k)?.getBuffer()===this.original.getVertexBuffer(k).getBuffer()),forwardPBR:true,depthShadowVerified:false}}
 setExclusions(records:any[]){if(records.length>2)throw Error('At most torso and footwear exclusion owners supported');const source=[...this.records.values()][0]?.source.glb_sha256;for(const r of records)if(r.schema!=='clothing-source-domains-v1'||r.source.glb_sha256!==source)throw Error('Invalid exclusion domain');this.exclusions=records;if(this.active.length)this.setActive(this.active)}
 attachNonlinearDepthRenderer(renderer:any){this.depthRenderer=renderer;if(this.active.length)this.setActive(this.active)}
 dispose(){if(!this.mesh.isDisposed())this.setActive([]);this.release();this.tex?.dispose();this.activeMaterial?.dispose(false,false);this.depthMaterial?.dispose(false,false);this.keeper.dispose(false,false)}
 setBaseMaterial(material:any){this.material=material;if(this.active.length)this.setActive(this.active);else this.mesh.material=material}
}
