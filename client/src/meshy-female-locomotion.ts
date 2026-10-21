import {Matrix,Quaternion,Vector3,type TransformNode} from '@babylonjs/core';

export const FEMALE_FOOT_INWARD_METERS=.040;
export const FEMALE_LOCOMOTION_CLIPS=new Set(['ual1:Walk_Loop','ual1:Sprint_Loop']);
type Saved={node:TransformNode;rotation:Quaternion};
// Work below the glTF conversion root. World matrices in the game's left-handed
// scene contain a reflection; decomposing those as rotations corrupts an IK solve.
function relativeMatrix(node:TransformNode,reference:Matrix){return node.computeWorldMatrix(true).multiply(reference);}
function worldRotation(node:TransformNode,reference:Matrix){const q=Quaternion.Identity();relativeMatrix(node,reference).decompose(undefined,q);return q;}
function setWorldRotation(node:TransformNode,rotation:Quaternion,reference:Matrix){
 const parent=node.parent as TransformNode|null;
 node.rotationQuaternion=parent?worldRotation(parent,reference).conjugate().multiply(rotation):rotation;
 node.computeWorldMatrix(true);
}
function aim(node:TransformNode,from:Vector3,to:Vector3,reference:Matrix){
 const a=from.normalizeToNew(),b=to.normalizeToNew(),cross=Vector3.Cross(a,b),dot=Math.max(-1,Math.min(1,Vector3.Dot(a,b)));
 if(cross.lengthSquared()<1e-16)return;
 setWorldRotation(node,Quaternion.RotationAxis(cross.normalize(),Math.acos(dot)).multiply(worldRotation(node,reference)),reference);
}

/** Derived female walk/run layer. Purchased clips and mesh/bind data stay intact. */
export class FemaleLocomotion {
 private saved:Saved[]=[];
 enabled=true;
 inwardMeters=FEMALE_FOOT_INWARD_METERS;
 weight=0;
 lastErrors:number[]=[];
 restore(){for(const {node,rotation} of this.saved)if(!node.isDisposed())node.rotationQuaternion=rotation;this.saved=[];}
 apply(nodes:Map<string,TransformNode>,stage:TransformNode,clip:string,playing:boolean,dt:number){
  const active=this.enabled&&FEMALE_LOCOMOTION_CLIPS.has(clip);
  // Non-locomotion poses must remain exact immediately, including paused QA.
  // Entry ramps over 120 ms; walk↔run retains its settled correction.
  this.weight=active?(playing?Math.min(1,this.weight+Math.min(dt,.05)/.12):1):0;
  this.lastErrors=[];if(!this.weight)return;
  const reference=Matrix.Invert(stage.computeWorldMatrix(true));
  const position=(node:TransformNode)=>relativeMatrix(node,reference).getTranslation();
  for(const [side,sign] of [['l',1],['r',-1]] as const){
   const hip=nodes.get('thigh_'+side)!,knee=nodes.get('calf_'+side)!,foot=nodes.get('foot_'+side)!;
   for(const node of [hip,knee,foot])this.saved.push({node,rotation:node.rotationQuaternion!.clone()});
   const H=position(hip),K=position(knee),F=position(foot),footRotation=worldRotation(foot,reference);
   const shift=new Vector3(-sign*this.inwardMeters*this.weight,0,0);
   const desired=F.add(shift),axis=desired.subtract(H),upper=Vector3.Distance(H,K),lower=Vector3.Distance(K,F);
   const distance=Math.min(axis.length(),upper+lower-1e-7);axis.normalize();
   const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
   const pole=K.add(shift.scale(upper/(upper+lower))).subtract(H);
   const bend=pole.subtract(axis.scale(Vector3.Dot(pole,axis)));
   if(bend.lengthSquared()<1e-12)bend.set(0,0,1);
   bend.normalize();const targetKnee=H.add(axis.scale(along)).add(bend.scale(Math.sqrt(Math.max(0,upper*upper-along*along))));
   const targetFoot=H.add(axis.scale(distance));
   aim(hip,K.subtract(H),targetKnee.subtract(H),reference);
   const actualKnee=position(knee),actualFoot=position(foot);
   aim(knee,actualFoot.subtract(actualKnee),targetFoot.subtract(actualKnee),reference);
   // Keep source foot orientation and vertical/sagittal contact trajectory.
   setWorldRotation(foot,footRotation,reference);
   this.lastErrors.push(Vector3.Distance(position(foot),desired));
  }
 }
}
