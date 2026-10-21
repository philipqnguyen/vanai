// Sheathed weapons (Philip, 2026-10-14): a weapon is worn on the back (greatsword,
// staff) or the left hip (everything else) and drawn into the holding hand only
// in combat. weapon_sheath_plan.ts has the rules and the frame math.
//
// The sheath is measured from each body, never tuned per race: its bind-pose
// skin gives the back's surface behind the upper spine and the left hip's at the
// belt, and the frame is placed on the spine_03 or pelvis node exactly where a
// vertex skinned wholly to that bone would sit (mesh-space point times the
// bone's inverse bind matrix). The weapon keeps its in-hand transform; only its
// parent changes, so the grip fit (aedri-grip.ts, the blade roll, the Nym scale)
// is untouched in either place.
import {Matrix,Mesh,Quaternion,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import type {AvatarNode} from './entities';
import {sheathSlot,sheathFrame,weaponDrawn,type BodyLandmarks,type V3,type WeaponExtent} from './weapon_sheath_plan';

type Sheath={weapon:TransformNode;hand:TransformNode;slot:TransformNode;drawn:boolean};
const sheaths=new WeakMap<AvatarNode,Sheath>();
// Instances share their template's geometry; measure each body once.
const measured=new Map<string,BodyLandmarks>();

const v3=(v:Vector3):V3=>[v.x,v.y,v.z];
function bodyMesh(av:AvatarNode):Mesh|undefined{
  // the native body (prepared in sword-motion.ts), not equipment or hair
  return av.model?.root.getChildMeshes().filter((m):m is Mesh=>m instanceof Mesh&&!!m.skeleton&&!!m.metadata?.equipmentSkin)
    .sort((a,b)=>b.getTotalVertices()-a.getTotalVertices())[0];
}
function landmarks(mesh:Mesh):BodyLandmarks|undefined{
  const key=mesh.geometry?.id;if(!key)return;
  const known=measured.get(key);if(known)return known;
  const bone=(name:string)=>mesh.skeleton!.bones.find(b=>b.name===name);
  const at=(name:string)=>{const b=bone(name);return b?Vector3.TransformCoordinates(Vector3.Zero(),b.getAbsoluteInverseBindMatrix().clone().invert()):undefined;};
  const pelvis=at('pelvis'),spine=at('spine_03'),neck=at('neck_01'),thighL=at('thigh_l'),thighR=at('thigh_r'),foot=at('foot_l'),ball=at('ball_l');
  if(!pelvis||!spine||!neck||!thighL||!thighR||!foot||!ball)return;
  const up=neck.subtract(pelvis).normalize(),left=thighL.subtract(thighR);left.subtractInPlace(up.scale(Vector3.Dot(left,up))).normalize();
  // the toes point forward; checked against left × up so a mirrored body cannot flip it
  let forward=Vector3.Cross(left,up).normalize();
  if(Vector3.Dot(forward,ball.subtract(foot))<0)forward=forward.negate();
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);if(!positions)return;
  const height=(p:Vector3)=>Vector3.Dot(p.subtract(pelvis),up),side=(p:Vector3)=>Vector3.Dot(p.subtract(pelvis),left),front=(p:Vector3)=>Vector3.Dot(p.subtract(pelvis),forward);
  const backLow=height(spine)-.04,backHigh=height(neck)-.02,beltLow=-.06,beltHigh=.08;
  // the torso's half width at the spine sets how far off the midline the back band reaches
  let back=Infinity,hip=-Infinity,width=0;const p=new Vector3();
  for(let i=0;i<positions.length;i+=3){p.set(positions[i],positions[i+1],positions[i+2]);const h=height(p);if(h>backLow&&h<backHigh)width=Math.max(width,Math.abs(side(p)));}
  const band=Math.max(.04,width*.25);
  for(let i=0;i<positions.length;i+=3){
    p.set(positions[i],positions[i+1],positions[i+2]);const h=height(p),s=side(p);
    if(h>backLow&&h<backHigh&&Math.abs(s)<band)back=Math.min(back,front(p));
    // only the near side of the pelvis: a hand or forearm hanging by the hip is not hip
    if(h>beltLow&&h<beltHigh&&s>0&&Math.abs(front(p))<.15)hip=Math.max(hip,s);
  }
  if(!Number.isFinite(back)||!Number.isFinite(hip))return;
  const backCentre=pelvis.add(up.scale((backLow+backHigh)/2)).add(forward.scale(back));
  const hipLeft=pelvis.add(left.scale(hip));
  const body:BodyLandmarks={up:v3(up),forward:v3(forward),left:v3(left),pelvis:v3(pelvis),backCentre:v3(backCentre),hipLeft:v3(hipLeft)};
  measured.set(key,body);return body;
}
/** The weapon's extent in its hand slot's frame (the slot is a stand-in for it). */
function extent(weapon:TransformNode,hand:TransformNode):WeaponExtent|undefined{
  const toSlot=hand.computeWorldMatrix(true).clone().invert(),lo=new Vector3(Infinity,Infinity,Infinity),hi=lo.negate();
  const meshes=[...(weapon instanceof Mesh?[weapon]:[]),...weapon.getChildMeshes()].filter(m=>m.getTotalVertices()>0);
  for(const m of meshes){
    m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox,world=m.getWorldMatrix().multiply(toSlot);
    for(const c of box.vectors){const q=Vector3.TransformCoordinates(c,world);lo.minimizeInPlace(q);hi.maximizeInPlace(q);}
  }
  if(!meshes.length)return;
  return {thin:hi.x-lo.x<hi.z-lo.z?'x':'z',span:[lo.y,hi.y]};
}
/** Wear the weapon in its sheath (and remember the hand to draw it into).
 * Call once the weapon is in the hand; a weapon with no sheath stays put. */
export function sheatheWeapon(av:AvatarNode,weapon:TransformNode,hand:TransformNode,type:string|undefined,drawn=false):void{
  releaseSheath(av);
  if(!type||!sheathSlot(type)||!av.model)return;
  const mesh=bodyMesh(av),body=mesh&&landmarks(mesh),w=extent(weapon,hand);
  const f=body&&w&&sheathFrame(type,body,w);
  const boneName=sheathSlot(type)==='back'?'spine_03':'pelvis';
  const bone=mesh?.skeleton?.bones.find(b=>b.name===boneName),node=bone?.getTransformNode();
  if(!f||!bone||!node)return;
  // mesh-space frame -> the bone's local space at bind
  const m=Matrix.FromValues(...f.x,0,...f.y,0,...f.z,0,...f.origin,1).multiply(bone.getAbsoluteInverseBindMatrix());
  const slot=new TransformNode(`${weapon.name}_sheath`,node.getScene());
  slot.rotationQuaternion=Quaternion.Identity();m.decompose(slot.scaling,slot.rotationQuaternion,slot.position);
  slot.parent=node;
  const s:Sheath={weapon,hand,slot,drawn:true};sheaths.set(av,s);
  weapon.onDisposeObservable.addOnce(()=>{if(sheaths.get(av)===s)releaseSheath(av);});
  place(s,drawn);
}
function place(s:Sheath,drawn:boolean){
  if(s.drawn===drawn)return;s.drawn=drawn;
  // parent swap only: the in-hand local transform is the sheathed one too
  s.weapon.parent=drawn?s.hand:s.slot;
}
export function releaseSheath(av:AvatarNode):void{
  const s=sheaths.get(av);if(!s)return;sheaths.delete(av);
  if(!s.weapon.isDisposed()&&!s.hand.isDisposed())s.weapon.parent=s.hand;
  s.slot.dispose();
}
/** Every frame: out in combat, back in the sheath once the fight is over. */
export function updateSheath(av:AvatarNode,now:number):void{
  const s=sheaths.get(av);if(s)place(s,weaponDrawn(av.combatUntil,now));
}
export function sheathInfo(av:AvatarNode):{drawn:boolean;slot:string}|undefined{
  const s=sheaths.get(av);return s&&{drawn:s.drawn,slot:s.slot.parent?.name??''};
}
