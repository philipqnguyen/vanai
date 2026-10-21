/** Minimal GLB container read/write, Babylon-free, shared by the gear packer
 * (the maker's tools/runtime/pack) and the runtime decoder (packed.ts). Only what gear uses:
 * one JSON chunk and at most one BIN chunk. */
export interface Glb {json:any;bin:Uint8Array}

export function readGlb(data:ArrayBuffer|Uint8Array):Glb {
  const u8=data instanceof Uint8Array?data:new Uint8Array(data),view=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw Error('Not a glTF 2 binary');
  const jsonLength=view.getUint32(12,true);
  if(view.getUint32(16,true)!==0x4e4f534a)throw Error('GLB JSON chunk missing');
  const json=JSON.parse(new TextDecoder().decode(u8.subarray(20,20+jsonLength)));
  let bin:Uint8Array=new Uint8Array(0);const at=20+jsonLength;
  if(at+8<=u8.byteLength&&view.getUint32(at+4,true)===0x004e4942)bin=u8.subarray(at+8,at+8+view.getUint32(at,true));
  return {json,bin};
}

export function writeGlb({json,bin}:Glb):Uint8Array {
  const text=new TextEncoder().encode(JSON.stringify(json));
  const jsonLength=(text.length+3)&~3,binLength=(bin.length+3)&~3;
  const out=new Uint8Array(12+8+jsonLength+(bin.length?8+binLength:0)),view=new DataView(out.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.length,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);
  out.fill(0x20,20,20+jsonLength);out.set(text,20);
  if(bin.length){const at=20+jsonLength;view.setUint32(at,binLength,true);view.setUint32(at+4,0x004e4942,true);out.set(bin,at+8);}
  return out;
}

/** Concatenates 4-byte-aligned chunks into one BIN, returning each chunk's offset. */
export function packChunks(chunks:Uint8Array[]):{bin:Uint8Array;offsets:number[]} {
  const offsets:number[]=[];let length=0;
  for(const c of chunks){offsets.push(length);length=(length+c.length+3)&~3;}
  const bin=new Uint8Array(length);chunks.forEach((c,i)=>bin.set(c,offsets[i]));
  return {bin,offsets};
}

export const COMPONENTS:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export const TYPED:Record<number,any>={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};

/** An accessor's elements as a tightly packed typed array (strides removed). */
export function readAccessor(json:any,bin:Uint8Array,index:number):{data:any;n:number;count:number;componentType:number;normalized:boolean} {
  const a=json.accessors[index],bv=json.bufferViews[a.bufferView],T=TYPED[a.componentType],n=COMPONENTS[a.type];
  const elem=T.BYTES_PER_ELEMENT*n,stride=bv.byteStride||elem,start=bin.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0);
  const out=new T(a.count*n);
  if(stride===elem&&start%T.BYTES_PER_ELEMENT===0)out.set(new T(bin.buffer,start,a.count*n));
  else{const src=new Uint8Array(bin.buffer),dst=new Uint8Array(out.buffer);for(let i=0;i<a.count;i++)dst.set(src.subarray(start+i*stride,start+i*stride+elem),i*elem);}
  return {data:out,n,count:a.count,componentType:a.componentType,normalized:!!a.normalized};
}
