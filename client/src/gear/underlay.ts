import {Mesh,Material,MultiMaterial,SubMesh,Geometry,VertexBuffer} from '@babylonjs/core';
export type CoverageMask={body_triangles:number;selected_triangle_ids:number[];opening_inset_geodesic_m:number;profile_id?:string;status?:string;default_regions?:string[];regions?:Record<string,number[]>;body_indices_sha256?:string;body_positions_sha256?:string;body_skinning_sha256?:string};
export type CoverageMode='skin'|'underlay'|'hide';
/** Reject stale body topology/positions before applying a versioned profile. */
export async function validateCoverageSource(mesh:Mesh,mask:CoverageMask){
  if(!mask.body_indices_sha256||!mask.body_positions_sha256)return false;
  const digest=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const indices=Uint32Array.from(mesh.getIndices()!),positions=Float32Array.from(mesh.getVerticesData('position')!);
  if(await digest(indices.buffer)!==mask.body_indices_sha256||await digest(positions.buffer)!==mask.body_positions_sha256)throw Error('Coverage profile does not match this body revision; regenerate its mapping');
  if(mask.body_skinning_sha256){
    const j=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!,w=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
    const skin=new Float32Array(j.length+w.length);for(let v=0;v<j.length/4;v++){for(let k=0;k<4;k++){skin[v*8+k]=j[v*4+k];skin[v*8+4+k]=w[v*4+k];}}
    if(await digest(skin.buffer)!==mask.body_skinning_sha256)throw Error('Body skin weights changed; revalidate coverage profile');
  }
  return true;
}
/** Overrides can narrow known regions; they cannot add faces outside the profile. */
export function withCoverageOverrides(mask:CoverageMask,options:{regions?:string[];excludeTriangles?:number[]}={}):CoverageMask{
  const known=new Set(mask.selected_triangle_ids);let chosen=new Set(known);
  if(options.regions){if(!mask.regions)throw Error('Profile has no named regions');chosen=new Set<number>();for(const name of options.regions){const ids=mask.regions[name];if(!ids)throw Error('Unknown coverage region: '+name);for(const id of ids){if(!known.has(id))throw Error('Region is outside approved profile');chosen.add(id);}}}
  for(const id of options.excludeTriangles??[])chosen.delete(id);
  return {...mask,selected_triangle_ids:[...chosen].sort((a,b)=>a-b)};
}
/** Equipment-only appearance change. Original geometry/texture remain immutable. */
export class GearUnderlay {
  private originalMaterial:Material|null;
  private originalGeometry:Geometry;
  private originalIndices:Uint16Array|Uint32Array;
  private partitioned:Uint16Array|Uint32Array;
  private hidden:Uint16Array|Uint32Array;
  private originalSubmeshes:{materialIndex:number;verticesStart:number;verticesCount:number;indexStart:number;indexCount:number}[];
  private material:MultiMaterial;
  private geometries=new Map<CoverageMode,Geometry>();
  private skinCount:number;
  private mode:CoverageMode='skin';
  readonly selected:number;
  constructor(private mesh:Mesh, palette:Material, mask:CoverageMask){
    if(mask.status?.startsWith('superseded'))throw Error('This coverage profile was withdrawn; preserve the tunic front slit');
    this.originalMaterial=mesh.material;this.originalGeometry=mesh.geometry!;
    const IndexArray=mesh.getTotalVertices()<65535?Uint16Array:Uint32Array;
    this.originalIndices=IndexArray.from(mesh.getIndices()!);
    if(this.originalIndices.length!==mask.body_triangles*3)throw Error('Coverage map/body triangle mismatch');
    this.originalSubmeshes=mesh.subMeshes.map(s=>({materialIndex:s.materialIndex,verticesStart:s.verticesStart,verticesCount:s.verticesCount,indexStart:s.indexStart,indexCount:s.indexCount}));
    const selected=new Set(mask.selected_triangle_ids);
    if(selected.size!==mask.selected_triangle_ids.length||[...selected].some(i=>i<0||i>=mask.body_triangles))throw Error('Invalid coverage triangle IDs');
    this.selected=selected.size;this.skinCount=(mask.body_triangles-this.selected)*3;
    this.partitioned=new IndexArray(this.originalIndices.length);let skin=0,gear=this.skinCount;
    for(let f=0;f<mask.body_triangles;f++){const offset=selected.has(f)?gear:skin;this.partitioned.set(this.originalIndices.subarray(f*3,f*3+3),offset);if(selected.has(f))gear+=3;else skin+=3;}
    this.hidden=this.partitioned.slice(0,this.skinCount);
    this.material=new MultiMaterial('Equipment underlay (appearance only)',mesh.getScene());this.material.subMaterials=[this.originalMaterial,palette];
  }
  private geometry(mode:CoverageMode){
    let geometry=this.geometries.get(mode);if(geometry)return geometry;
    geometry=new Geometry('equipment-coverage-'+this.mesh.uniqueId+'-'+mode,this.mesh.getScene());
    // Share the existing GPU vertex buffers with independent reference-counted
    // wrappers. Only the index buffer differs; other actors keep original indices.
    for(const kind of this.originalGeometry.getVerticesDataKinds()){
      const vb=this.originalGeometry.getVertexBuffer(kind)!;
      const shared=new VertexBuffer(this.mesh.getEngine(),vb.getWrapperBuffer(),kind,{updatable:vb.isUpdatable(),stride:vb.byteStride,offset:vb.byteOffset,size:vb.getSize(),type:vb.type,normalized:vb.normalized,useBytes:true,takeBufferOwnership:true});
      geometry.setVerticesBuffer(shared,this.mesh.getTotalVertices());
    }
    geometry.setIndices(mode==='hide'?this.hidden:this.partitioned);this.geometries.set(mode,geometry);return geometry;
  }
  set(mode:CoverageMode){
    if(mode===this.mode)return;this.mode=mode;
    (mode==='skin'?this.originalGeometry:this.geometry(mode)).applyToMesh(this.mesh);
    this.mesh.releaseSubMeshes();this.mesh.material=mode==='underlay'?this.material:this.originalMaterial;
    if(mode==='underlay'){new SubMesh(0,0,this.mesh.getTotalVertices(),0,this.skinCount,this.mesh);new SubMesh(1,0,this.mesh.getTotalVertices(),this.skinCount,this.selected*3,this.mesh);}
    else if(mode==='hide')new SubMesh(0,0,this.mesh.getTotalVertices(),0,this.skinCount,this.mesh);
    else for(const s of this.originalSubmeshes)new SubMesh(s.materialIndex,s.verticesStart,s.verticesCount,s.indexStart,s.indexCount,this.mesh);
  }
  info(){const indices=this.mesh.getIndices()!;return {mode:this.mode,bodyEnabled:this.mesh.isEnabled(),selectedTriangles:this.selected,totalTriangles:indices.length/3,submeshes:this.mesh.subMeshes.length,originalMaterialRestored:this.mesh.material===this.originalMaterial,originalGeometryRestored:this.mesh.geometry===this.originalGeometry,originalIndexOrderRestored:indices.length===this.originalIndices.length&&this.originalIndices.every((x,i)=>x===indices[i]),sharedVertexBuffers:this.originalGeometry.getVerticesDataKinds().every(k=>this.originalGeometry.getVertexBuffer(k)!.getBuffer()===this.mesh.getVertexBuffer(k)!.getBuffer()),cpuIndexArrayBytes:this.originalIndices.byteLength+this.partitioned.byteLength+this.hidden.byteLength,additionalGpuIndexBytes:[...this.geometries.keys()].reduce((n,k)=>n+(k==='hide'?this.hidden.byteLength:this.partitioned.byteLength),0),perFrameGeometryWork:false};}
  dispose(){this.set('skin');for(const g of this.geometries.values())g.dispose();this.material.dispose(false,false);}
}
