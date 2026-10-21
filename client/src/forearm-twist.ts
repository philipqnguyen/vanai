/** Prepare immutable shared template weights once; drive six helper bones per actor.
 * Source GLBs, original bone indices, topology, UVs and animation targets stay intact.
 */
import {Bone,Matrix,Mesh,Skeleton,Quaternion,Vector3,VertexBuffer} from '@babylonjs/core';
type Arm={upper:number;lower:number;elbow:Vector3;axis:Vector3;length:number;bones:Bone[]};
export function prepareForearmTemplate(meshes:Mesh[]){
 if(!meshes.length||!meshes[0].skeleton)throw new Error('Expected a skinned body');
 const skeleton=meshes[0].skeleton;
 if(meshes.some(m=>m.skeleton!==skeleton))throw new Error('Use one adapter per skeleton');
 if(skeleton.needInitialSkinMatrix)throw new Error('Mesh-specific initial skin matrices are not supported');
 if(skeleton.bones.some(b=>b.name.startsWith('vanai_forearm_')))throw new Error('Forearm adapter already attached');
 const originalCount=skeleton.bones.length,arms:Arm[]=[];
 for(const side of ['l','r']){
  const find=(name:string)=>{const b=skeleton.bones.find(b=>b.name===name+'_'+side);if(!b)throw new Error(`Missing ${name}_${side}`);return b;};
  const upper=find('upperarm'),lower=find('lowerarm'),hand=find('hand');
  const rest=(bone:Bone)=>Vector3.TransformCoordinates(Vector3.Zero(),bone.getAbsoluteInverseBindMatrix().clone().invert());
  const elbow=rest(lower),end=rest(hand),axis=end.subtract(elbow),length=axis.length();axis.scaleInPlace(1/length);
  const bones=Array.from({length:3},(_,k)=>new Bone(`vanai_forearm_${side}_${k}`,skeleton,null,Matrix.Identity(),Matrix.Identity(),Matrix.Identity(),skeleton.bones.length));
  arms.push({upper:upper.getIndex()!,lower:lower.getIndex()!,elbow,axis,length,bones});
 }
 let changedVertices=0,maxDiscardedWeight=0;
 for(const mesh of meshes){
  if(mesh.numBoneInfluencers>4)throw new Error('Expected four source influences');
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!,sourceJ=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!,sourceW=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
  const joints=Float32Array.from(sourceJ),weights=Float32Array.from(sourceW);
  for(let v=0;v<positions.length/3;v++){
   let entries=Array.from({length:4},(_,k)=>[sourceJ[v*4+k],sourceW[v*4+k]]),changed=false;
   for(const arm of arms){
    // Finish pronation before the wrist/finger weight transition.
    const t=Math.max(0,Math.min(1,Vector3.Dot(Vector3.FromArray(positions,v*3).subtract(arm.elbow),arm.axis)/(arm.length*.8)));
    if(t>=1)continue;
    const segment=Math.min(2,Math.floor(t*3)),fraction=t*3-segment;
    entries=entries.flatMap(([joint,weight])=>{
     if(joint!==arm.lower||weight===0)return [[joint,weight]];
     changed=true;return [[arm.bones[segment].getIndex()!,weight*(1-fraction)],[segment===2?arm.lower:arm.bones[segment+1].getIndex()!,weight*fraction]];
    });
   }
   if(!changed)continue;changedVertices++;entries.sort((a,b)=>b[1]-a[1]);const removed=entries.slice(4).reduce((sum,e)=>sum+e[1],0);maxDiscardedWeight=Math.max(maxDiscardedWeight,removed);const total=entries.slice(0,4).reduce((sum,e)=>sum+e[1],0);
   for(let k=0;k<4;k++){joints[v*4+k]=entries[k][0];weights[v*4+k]=entries[k][1]/total;}
  }
  if(maxDiscardedWeight>1e-7)throw new Error("Forearm remap loses weights; body requires review");
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,joints,false,4);mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,weights,false,4);
 }
 return {originalBones:originalCount,helperBones:6,changedVertices,maxDiscardedWeight};
}
/** Attach only to an instance of a prepared template. Never rewrites shared geometry.
 * Callback runs after Babylon synchronizes animated nodes and before its one skin
 * palette upload. Disposal removes the callback, not shared template resources.
 */
export function attachForearmInstance(skeleton:Skeleton,enabled:()=>boolean=()=>true){
 const arms:Arm[]=[];
 for(const side of ['l','r']){
  const find=(name:string)=>skeleton.bones.find(b=>b.name===name+'_'+side)!;
  const upper=find('upperarm'),lower=find('lowerarm'),hand=find('hand');
  const bones=[0,1,2].map(k=>skeleton.bones.find(b=>b.name===`vanai_forearm_${side}_${k}`)!);
  if(!upper||!lower||!hand||bones.some(b=>!b))throw new Error('Forearm template not prepared');
  const rest=(bone:Bone)=>Vector3.TransformCoordinates(Vector3.Zero(),bone.getAbsoluteInverseBindMatrix().clone().invert());
  const elbow=rest(lower),axis=rest(hand).subtract(elbow),length=axis.length();axis.scaleInPlace(1/length);
  arms.push({upper:upper.getIndex()!,lower:lower.getIndex()!,elbow,axis,length,bones});
 }
 const identity=Quaternion.Identity(),one=Vector3.One(),zero=Vector3.Zero();
 // Reuse scratch objects: avatar count must not turn six bone updates into a
 // stream of transient vectors/quaternions and garbage-collection pauses.
 const upperMatrix=Matrix.Identity(),lowerMatrix=Matrix.Identity(),rotationMatrix=Matrix.Identity();
 const u=Quaternion.Identity(),l=Quaternion.Identity(),inverse=Quaternion.Identity(),relative=Quaternion.Identity();
 const twist=Quaternion.Identity(),swing=Quaternion.Identity(),partial=Quaternion.Identity(),rotation=Quaternion.Identity(),base=Quaternion.Identity();
 const posedElbow=Vector3.Zero(),position=Vector3.Zero(),scale=Vector3.One();
 function update(){
  const active=enabled();
  skeleton.computeAbsoluteMatrices(true);
  for(const arm of arms){
   const upper=skeleton.bones[arm.upper],lower=skeleton.bones[arm.lower];
   upper.getAbsoluteInverseBindMatrix().multiplyToRef(upper.getAbsoluteMatrix(),upperMatrix);
   lower.getAbsoluteInverseBindMatrix().multiplyToRef(lower.getAbsoluteMatrix(),lowerMatrix);
   Quaternion.FromRotationMatrixToRef(upperMatrix,u);Quaternion.FromRotationMatrixToRef(lowerMatrix,l);
   u.conjugateToRef(inverse);inverse.multiplyToRef(l,relative);
   const dot=relative.x*arm.axis.x+relative.y*arm.axis.y+relative.z*arm.axis.z;
   twist.set(arm.axis.x*dot,arm.axis.y*dot,arm.axis.z*dot,relative.w);
   const length=twist.length();
   // Unsupported clips and the singular 180-degree bend use the original
   // lower-arm skin transform. No NaNs and no silently altered new clips.
   if(!active||length<1e-6){
    lowerMatrix.decompose(scale,rotation,position);
    for(const bone of arm.bones){bone.rotationQuaternion=rotation;bone.position=position;bone.scaling=scale;}
    continue;
   }
   twist.scaleInPlace((twist.w<0?-1:1)/length);twist.conjugateToRef(inverse);
   relative.multiplyToRef(inverse,swing);u.multiplyToRef(swing,base);
   Vector3.TransformCoordinatesToRef(arm.elbow,lowerMatrix,posedElbow);
   for(let k=0;k<3;k++){
    Quaternion.SlerpToRef(identity,twist,k/3,partial);base.multiplyToRef(partial,rotation);
    Matrix.ComposeToRef(one,rotation,zero,rotationMatrix);
    Vector3.TransformCoordinatesToRef(arm.elbow,rotationMatrix,position);
    posedElbow.subtractToRef(position,position);
    arm.bones[k].rotationQuaternion=rotation;arm.bones[k].position=position;arm.bones[k].scaling=one;
   }
  }
 }
 const observer=skeleton.onBeforeComputeObservable.add(update);
 let disposed=false;
 return {dispose(){if(disposed)return;disposed=true;skeleton.onBeforeComputeObservable.remove(observer);},arms};
}
