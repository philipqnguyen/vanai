import {Mesh,VertexBuffer} from '@babylonjs/core';
export async function skinHash(mesh:Mesh):Promise<string>{
 const j=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!,w=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
 const data=new Float32Array(j.length+w.length);
 for(let v=0;v<j.length/4;v++)for(let k=0;k<4;k++){data[v*8+k]=j[v*4+k];data[v*8+4+k]=w[v*4+k];}
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer)),v=>v.toString(16).padStart(2,'0')).join('');
}
