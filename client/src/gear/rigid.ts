import {Mesh,TransformNode,type AssetContainer} from '@babylonjs/core';
/** Clone the authored grip node and every primitive, excluding the loader conversion root. */
export function cloneRigidRoot(pack:AssetContainer,id:string):TransformNode{
 const authored=[...pack.transformNodes,...pack.meshes].filter(n=>n.name===id);
 if(authored.length!==1)throw Error('Weapon authored root missing or ambiguous: '+id);
 const root=authored[0].clone('equipped weapon '+id,null,false) as TransformNode;
 if(!root)throw Error('Weapon clone failed');
 root.setEnabled(true);
 for(const mesh of [...(root instanceof Mesh?[root]:[]),...root.getChildMeshes()]){mesh.isPickable=false;mesh.setEnabled(true);}
 return root;
}
