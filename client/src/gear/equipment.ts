import {Mesh,Geometry,VertexBuffer,SubMesh,type AssetContainer,type TransformNode,type Node} from '@babylonjs/core';
import {gear} from '../asset-index';
const catalog=gear.catalog;
import {Components,type Entry,type Pin} from './components';
import {SourceDomainCoverage} from './source-domain';
import {selectEquipment,type GearLook} from './selection';
import {bytes,json,container} from './assets';
import {nativeWeapon} from './weapons';
import {skinHash} from './identity';
import type {AvatarNode} from '../entities';
import {addShadowCaster} from '../scene';
import {dropPointCache} from '../models';
const equipped=new WeakMap<AvatarNode,{dispose:()=>void;info:()=>unknown}>();
// A flare hidden below a torso drape's ring keeps the container's vertex
// buffers (wrapped, as underlay.ts does); only its index list differs, and that
// is the same for every wearer of the item, so it is made once and owned by the
// container. makeGeometryUnique copied every flare vertex per wearer (~5 MB a
// cuirass or robe, MEASURED 2026-10-13).
const flares=new WeakMap<Geometry,Map<string,Geometry>>();
function trimFlare(mesh:Mesh,pack:AssetContainer,key:string,kept:number[]){
 const source=mesh.geometry!;let byKey=flares.get(source);if(!byKey)flares.set(source,byKey=new Map());
 let trimmed=byKey.get(key);
 if(!trimmed){
  const full=source.getIndices()!,indices=new (source.getTotalVertices()<65536?Uint16Array:Uint32Array)(kept.length*3);
  kept.forEach((t,i)=>{for(let k=0;k<3;k++)indices[i*3+k]=full[t*3+k];});
  trimmed=new Geometry('flare below ring '+key,mesh.getScene());
  for(const kind of source.getVerticesDataKinds()){const vb=source.getVertexBuffer(kind)!;trimmed.setVerticesBuffer(new VertexBuffer(mesh.getEngine(),vb.getWrapperBuffer(),kind,{updatable:vb.isUpdatable(),stride:vb.byteStride,offset:vb.byteOffset,size:vb.getSize(),type:vb.type,normalized:vb.normalized,useBytes:true,takeBufferOwnership:true}),source.getTotalVertices());}
  trimmed.setIndices(indices,source.getTotalVertices());pack.geometries.push(trimmed);byKey.set(key,trimmed);
 }
 trimmed.applyToMesh(mesh);mesh.releaseSubMeshes();new SubMesh(0,0,mesh.getTotalVertices(),0,trimmed.getTotalIndices(),mesh);
}
// Once dressed, nothing reads an actor's own geometry on the CPU again: a look
// change builds a new actor (world.ts rebuildSelfAvatar), NPCs never change,
// and the engine handles no context loss (scene.ts initEngine). So the copies
// Babylon keeps after upload go for every geometry only this actor's
// unpickable meshes draw (coverage displays, drapes). Anything another
// geometry still holds stays -- the containers' originals, which the next
// wearer's coverage reads, and any buffer a wrapper shares -- and so does a
// pickable mesh's, since picking reads positions and indices.
function releaseOwnGeometry(root:TransformNode){
 dropPointCache(root.getChildMeshes(false));
 const own=new Set<Geometry>(),mine=(n:Node|null)=>{for(;n;n=n.parent)if(n===root)return true;return false;};
 for(const m of root.getChildMeshes(false)){const g=(m as Mesh).geometry;if(g&&!own.has(g)&&g.meshes.every(x=>!x.isPickable&&mine(x)))own.add(g);}
 if(!own.size)return;
 const kept=new Set<unknown>();
 for(const g of root.getScene().geometries)if(!own.has(g)){for(const kind of g.getVerticesDataKinds())kept.add(g.getVertexBuffer(kind)!.getWrapperBuffer());kept.add((g as any)._indices);}
 for(const g of own as Set<any>){
  for(const kind of g.getVerticesDataKinds()){const b=g.getVertexBuffer(kind).getWrapperBuffer();if(!kept.has(b))b._data=null;}
  // getTotalIndices still answers from the saved count, as clearCachedData does
  if(!kept.has(g._indices)){g._totalIndices=g._indices.length;g._indices=[];}
  g._resetPointsArrayCache();
 }
}
export function disposeEquipment(av:AvatarNode){equipped.get(av)?.dispose();equipped.delete(av);}
export function equipmentInfo(av:AvatarNode){return equipped.get(av)?.info()??{items:[],ready:false};}
/** Current item/body manifest. Geometry and masks are prepared only at equipment changes. */
export async function attachEquipment(av:AvatarNode,body:string,look:GearLook){
 const manifest=(catalog.bodies as Record<string,{body:string;source:{sha256:string};items:Record<string,Entry>}>)[body];
 if(!manifest)return;const selected=selectEquipment<Entry>(body,look,manifest);
 const wrap=nativeWeapon(look.w,body,manifest.source.sha256);if(wrap)selected.push([look.w!,wrap]);
 if(!selected.length||!av.model)return;
 const scene=av.root.getScene(),native=av.model.root.getChildMeshes().find(m=>m instanceof Mesh&&!!m.skeleton&&m.metadata?.equipmentSkin) as Mesh|undefined;
 if(!native)throw Error('Equipment native body missing');
 const releases:(()=>void)[]=[],reads:(()=>void)[]=[];const meshes:Mesh[]=[],coverages:SourceDomainCoverage[]=[],packs=new Map<Mesh,AssetContainer>();const components=new Components(scene,native,bytes,json);let disposed=false;
 const dispose=()=>{disposed=true;for(const c of coverages.splice(0).reverse())c.dispose();meshes.splice(0).forEach(m=>m.dispose(false,false));components.dispose();releases.splice(0).forEach(release=>release());};
 av.root.onDisposeObservable.addOnce(dispose);
 try{
  const records=await Promise.all(selected.map(async([id,e])=>({id,e,domain:await json(e.domain)})));
  if(av.root.isDisposed()||scene.isDisposed){dispose();return;}
  // Prove the original and prepared weights across the approved forearm adapter.
  const identity=native.metadata?.equipmentSkin,liveSkin=await skinHash(native);
  if(!identity||identity.prepared!==liveSkin||records.some(r=>r.domain.source.body_skinning_sha256!==identity.original))throw Error('Equipment body skin provenance mismatch');
  for(const r of records){for(const component of r.e.components){
   if(!component.model)continue;
   const pack=await container(component.model,scene,releases,reads);
   if(av.root.isDisposed()||scene.isDisposed){dispose();return;}
   const faceData=component.faceMap?await json(component.faceMap):undefined;
   if(component.kind==='handwraps'&&faceData?.schema!=='native-hand-face-map-v1')throw Error('Weapon face correspondence schema mismatch');
   const map=component.kind==='handwraps'?faceData.source_face_ids:faceData;
   if(disposed||av.root.isDisposed()||scene.isDisposed){dispose();return;}
   let meshIndex=0;
   for(const original of pack.meshes){
    if(!(original instanceof Mesh)||!original.getTotalVertices())continue;
    const rig=original.skeleton;
    if(!rig||rig.bones.some((b,i)=>native.skeleton!.bones[i]?.name!==b.name))throw Error('Equipment rig differs from native body');
    const mesh=original.clone('equipped '+r.id,native.parent,true)!;mesh.skeleton=native.skeleton;mesh.alwaysSelectAsActiveMesh=true;mesh.isPickable=false;mesh.setEnabled(false);mesh.metadata={...mesh.metadata,equipmentKind:component.kind};meshes.push(mesh);packs.set(mesh,pack);
    // A caster before its coverage: the partial-face patch copies how it casts and receives.
    addShadowCaster(mesh);
    await components.configure(mesh,component,r.e);
    if(disposed||av.root.isDisposed()||scene.isDisposed){dispose();return;}
    if(map&&meshIndex===0){const trim=await SourceDomainCoverage.create(mesh,[r.domain],manifest.source.sha256,map,true);coverages.push(trim);if(r.e.slot==='legs'){trim.setExclusions(records.filter(r=>r.e.slot==='feet'||r.e.slot==='body').map(r=>r.domain));}trim.setActive([r.domain.item]);}
    if(component.coordinated)await components.artwork(mesh,r.e,!!map&&meshIndex===0);
    meshIndex++;
   }
  }
  for(const component of r.e.components.filter(c=>c.config)){
   const cfg=await components.drapes(component,r.e);
   if(component.kind==='torso_drape'&&cfg.hidden_below_ring){for(const mesh of meshes.filter(m=>m.metadata?.equipmentKind==='flare'))trimFlare(mesh,packs.get(mesh)!,component.config!.url,cfg.hidden_below_ring.kept_triangles);}
  }
  }
  if(av.root.isDisposed()||scene.isDisposed){dispose();return;}
  const masks=records.map(r=>({...r.domain,source:{...r.domain.source,body_skinning_sha256:liveSkin}}));
  const skin=await SourceDomainCoverage.create(native,masks,manifest.source.sha256);coverages.push(skin);
  if(av.root.isDisposed()||scene.isDisposed){dispose();return;}
  skin.setActive(records.map(r=>r.domain.item));meshes.push(...components.meshes);meshes.forEach(m=>{m.setEnabled(true);addShadowCaster(m)});
  equipped.set(av,{dispose,info:()=>({ready:true,items:records.map(r=>r.id),meshes:meshes.length,coverage:skin.info(),perFrameFitting:false})});
  if(import.meta.env.DEV)console.info('Equipment ready',JSON.stringify(equipmentInfo(av)));
  releaseOwnGeometry(av.root);
 }catch(error){dispose();if(!av.root.isDisposed())throw error;}
 finally{reads.splice(0).forEach(done=>done());}
}
