import {Material,Mesh} from '@babylonjs/core';
import {instantiateModel} from './models';
import {scene} from './scene';
import {FERRY,ferryNow,ferryPose} from './ferry-clock';

/** One existing ship instance and one transform update; no new lights or wake. */
export function buildDockedFerry(portKey:keyof typeof FERRY.ports){
 const owner=scene,port:{ship:{yaw:number;y:number};departure?:{fade?:number};approach?:{fade?:number}}=FERRY.ports[portKey] as never,pose=port.ship;
 // A port whose route fades the ship in and out far at sea (ferry-clock.ts ROUTES) needs meshes of its own: an
 // instance's visibility is its source's. Cloned only there, so a port without one draws exactly as it always has.
 const fades=!!(port.departure?.fade||port.approach?.fade);
 instantiateModel('pirate/Ship_Large.gltf',null,fades).then(model=>{
  if(!model||scene!==owner||owner.isDisposed)return;
  const root=model.root;root.name='gulf_ferry_ship';root.scaling.setAll(3.9);root.rotation.y=pose.yaw;
  const meshes=root.getChildMeshes().filter((m):m is Mesh=>m instanceof Mesh);let shown=1;
  const modes=new Map<Material,number|null>();
  const update=()=>{const motion=ferryPose(ferryNow(),portKey),fade='fade' in motion?motion.fade:1;
   root.setEnabled(motion.visible&&fade>0);root.position.set(motion.x,pose.y,motion.z);root.rotation.y=motion.yaw;
   root.metadata={phase:motion.phase,offset:motion.offset,fade};
   if(fade!==shown&&fade>0){
    // The glTF loader pins its materials OPAQUE, which ignores visibility, so they blend while it fades and go
    // back to what they were at full opacity; a depth pre-pass meanwhile, so the ship does not show its own far
    // side through itself (the materials are this ship's alone in this scene)
    for(const m of meshes){m.visibility=fade;const mat=m.material;if(!mat)continue;
     if(!modes.has(mat))modes.set(mat,mat.transparencyMode);
     mat.transparencyMode=fade<1?Material.MATERIAL_ALPHABLEND:modes.get(mat)!;mat.needDepthPrePass=fade<1;}
    shown=fade;
   }};
  update();owner.onBeforeRenderObservable.add(update);
 });
}
