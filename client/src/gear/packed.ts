/** Decoding a packed gear GLB (the maker's tools/runtime/pack) back to the plain GLB the
 * equipment code was written against. Babylon-free; the packer's verifier runs
 * this exact function in node, so what is checked is what the game loads.
 *
 * A packed file is a derived copy of an approved one: welded vertices, four
 * bone influences, quantized attributes (KHR_mesh_quantization types plus an
 * `extras.vanai_dequant` offset/scale where the range is not [0,1] or [-1,1]),
 * meshopt-compressed buffer views (EXT_meshopt_compression) and KTX2 UASTC
 * images stored beside it by content hash (KHR_texture_basisu).
 *
 * Decoding returns every vertex attribute to float32 (joints to uint16) in the
 * source's own space. A skinned mesh ignores its node transform, so quantized
 * positions cannot be dequantized by a node matrix the way glTF intends; doing
 * it here keeps the artwork projection, drape, underlay and coverage code, which
 * all read raw positions, unchanged. The download shrinks; the GPU geometry is
 * float again. Images stay KTX2 and are transcoded on the GPU path. */
import {readGlb,writeGlb,packChunks,readAccessor,COMPONENTS} from './glb.ts';

export interface MeshoptLike {ready:Promise<void>;decodeGltfBuffer:(target:Uint8Array,count:number,size:number,source:Uint8Array,mode:string,filter?:string)=>void}

export async function decodePackedGear(data:ArrayBuffer|Uint8Array,meshopt:MeshoptLike,image:(uri:string)=>Promise<Uint8Array>):Promise<Uint8Array> {
  await meshopt.ready;
  const {json,bin}=readGlb(data);
  // 1. Undo the meshopt buffer views into one plain buffer.
  const views:Uint8Array[]=json.bufferViews.map((bv:any)=>{
    const ext=bv.extensions?.EXT_meshopt_compression;
    if(!ext)return bin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);
    const out=new Uint8Array(ext.count*ext.byteStride);
    meshopt.decodeGltfBuffer(out,ext.count,ext.byteStride,bin.subarray(ext.byteOffset||0,(ext.byteOffset||0)+ext.byteLength),ext.mode,ext.filter);
    return out;
  });
  const plain=packChunks(views);
  const viewJson=json.bufferViews.map((bv:any,i:number)=>({buffer:0,byteOffset:plain.offsets[i],byteLength:views[i].length,...(bv.byteStride?{byteStride:bv.byteStride}:{})}));
  const quantized={...json,bufferViews:viewJson};
  // 2. Every accessor as its own tight chunk, attributes back to float and
  //    back to the source's vertex order (`vanai_unweld`: source vertex -> welded).
  const unweld=new Map<number,number>(),maps=new Set<number>();
  for(const m of json.meshes)for(const p of m.primitives){const u=p.extras?.vanai_unweld;if(u===undefined)continue;maps.add(u);for(const a of Object.values(p.attributes) as number[])unweld.set(a,u);}
  const chunks:Uint8Array[]=[],accessors:any[]=[],index=new Map<number,number>();
  json.accessors.forEach((a:any,i:number)=>{
    if(maps.has(i))return;
    let {data:q,n,count}=readAccessor(quantized,plain.bin,i);
    const u=unweld.get(i);
    if(u!==undefined){const map=readAccessor(quantized,plain.bin,u).data,T=q.constructor as any,full=new T(map.length*n);for(let v=0;v<map.length;v++)for(let k=0;k<n;k++)full[v*n+k]=q[map[v]*n+k];q=full;count=map.length;}
    const dequant=a.extras?.vanai_dequant;let out:any=q,componentType=a.componentType;
    if(dequant){out=new Float32Array(q.length);for(let k=0;k<q.length;k++)out[k]=q[k]*dequant.scale[k%n]+dequant.offset[k%n];componentType=5126;}
    else if(a.normalized){const d=a.componentType===5122?32767:a.componentType===5120?127:a.componentType===5123?65535:255;out=new Float32Array(q.length);for(let k=0;k<q.length;k++)out[k]=Math.max(q[k]/d,-1);componentType=5126;}
    else if(a.extras?.vanai_joints&&a.componentType===5121){out=Uint16Array.from(q);componentType=5123;}
    const {extras,normalized,byteOffset,bufferView,...rest}=a;
    const accessor:any={...rest,count,componentType,bufferView:chunks.length};
    if(extras){const {vanai_dequant,vanai_joints,...keep}=extras;if(Object.keys(keep).length)accessor.extras=keep;}
    if(dequant){const min=new Array(n).fill(Infinity),max=new Array(n).fill(-Infinity);for(let k=0;k<out.length;k++){min[k%n]=Math.min(min[k%n],out[k]);max[k%n]=Math.max(max[k%n],out[k]);}accessor.min=min;accessor.max=max;}
    index.set(i,accessors.length);chunks.push(new Uint8Array(out.buffer,out.byteOffset,out.byteLength));accessors.push(accessor);
    if(COMPONENTS[a.type]!==n)throw Error('Packed gear accessor shape changed');
  });
  const meshes=json.meshes.map((m:any)=>({...m,primitives:m.primitives.map((p:any)=>{
    const {vanai_unweld,...extras}=p.extras??{};
    return {...p,attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,a])=>[k,index.get(a as number)])),indices:index.get(p.indices),...(Object.keys(extras).length?{extras}:{extras:undefined})};
  })}));
  const skins=(json.skins??[]).map((s:any)=>s.inverseBindMatrices===undefined?s:{...s,inverseBindMatrices:index.get(s.inverseBindMatrices)});
  // 3. Images: fetched by content hash and embedded, still KTX2.
  const images=await Promise.all((json.images??[]).map(async (im:any)=>{
    const bytes=im.uri?await image(im.uri):views[im.bufferView];
    chunks.push(bytes);return {mimeType:im.mimeType,bufferView:chunks.length-1,...(im.name?{name:im.name}:{}),...(im.extras?{extras:im.extras}:{})};
  }));
  const out=packChunks(chunks);
  const bufferViews=chunks.map((c,i)=>({buffer:0,byteOffset:out.offsets[i],byteLength:c.length}));
  const used=(json.extensionsUsed??[]).filter((e:string)=>e!=='EXT_meshopt_compression'&&e!=='KHR_mesh_quantization');
  const required=(json.extensionsRequired??[]).filter((e:string)=>e!=='EXT_meshopt_compression'&&e!=='KHR_mesh_quantization');
  const {extras:_e,...asset}=json.asset;
  return writeGlb({json:{...json,asset,meshes,...(json.skins?{skins}:{}),accessors,bufferViews,images,buffers:[{byteLength:out.bin.length}],extensionsUsed:used,...(required.length?{extensionsRequired:required}:{extensionsRequired:undefined})},bin:out.bin});
}
