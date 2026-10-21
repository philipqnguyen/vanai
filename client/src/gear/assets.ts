import {AssetContainer,LoadAssetContainerAsync,Scene,type Geometry} from '@babylonjs/core';
import {MeshoptDecoder} from 'meshoptimizer/decoder';
import {parseImmutableJson} from './immutable-json';
import {LeaseCache} from './cache';
import {decodePackedGear} from './packed';
import {ownContainerBytes} from '../models';
import type {Pin} from './components';
import {packedModel,packedImage} from './packed-index';
import {pinUrl,refPin} from '../asset-index';

// A packed GLB's images are files beside it, each read by its hash.
async function glbBytes(pin:Pin):Promise<ArrayBuffer|Uint8Array>{
 const e=packedModel(pin);if(!e)return bytes(pin);
 return decodePackedGear(await bytes(refPin(e)),MeshoptDecoder,async uri=>{const i=e.images[uri];if(!i)throw Error('Packed gear image unlisted: '+uri);return new Uint8Array(await bytes(packedImage(i)));});
}
const binaryCache=new Map<string,Promise<ArrayBuffer>>();
const containers=new WeakMap<Scene,LeaseCache<AssetContainer>>();
const binarySizes=new Map<string,number>();
// Only JSON is read again (each actor parses the shared, frozen copy); a GLB or
// texture is decoded once into the container/texture caches, so its raw bytes
// are dropped as soon as the load that asked for them has them.
const RETAIN=/\.json$/;
function trimBytes(){let total=[...binarySizes.values()].reduce((a,b)=>a+b,0);for(const [key,size] of binarySizes){if(total<=128*1024*1024)break;binaryCache.delete(key);binarySizes.delete(key);total-=size;}}
// Every file is fetched from the one folder by its hash (asset-index.ts) and checked.
export async function bytes(pin:Pin){
 const url=pinUrl(pin);
 let p=binaryCache.get(url);
 if(!p){p=(async()=>{const r=await fetch(url);if(!r.ok)throw Error('Equipment asset unavailable: '+pin.url);const b=await r.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');if(b.byteLength!==pin.bytes||hash!==pin.sha256)throw Error('Equipment asset identity changed');if(RETAIN.test(url)){binarySizes.set(url,b.byteLength);trimBytes();}else queueMicrotask(()=>binaryCache.delete(url));return b;})().catch(e=>{binaryCache.delete(url);throw e;});binaryCache.set(url,p);}
 return p;
}
export async function json(pin:Pin){return parseImmutableJson(await bytes(pin));}
async function load(pin:Pin,scene:Scene,skipMaterials=false){
 const data=await glbBytes(pin);if(scene.isDisposed)throw Error('Equipment scene disposed');const url=URL.createObjectURL(new Blob([data as BlobPart]));
 try{return ownContainerBytes(await LoadAssetContainerAsync(url,scene,{pluginExtension:'.glb',pluginOptions:{gltf:{skipMaterials}}}));}finally{URL.revokeObjectURL(url);}
}
// A container's CPU copy of its geometry is read only while someone is being
// dressed from it (the coverage and the flare trim read the originals); once
// they are drawn the GPU has it all. So it is dropped when the last equip
// reading it finishes and read back from the file when the next wearer comes
// (Philip, 2026-10-13: drop CPU copies once a character is built; a later
// wearer may reload). ~16 MB a dressed NPC's gear. Only what the file holds is
// dropped: attributes a wearer added (artwork, collar) are not in it, stay,
// and geometries derived later (a trimmed flare) are not touched.
type Held={readers:number;stripped:boolean;restoring?:Promise<void>;originals:{geometry:Geometry;kinds:string[];vertices:number;indices:number}[]};
const held=new WeakMap<AssetContainer,Held>();
function strip(h:Held){
 for(const {geometry,kinds} of h.originals){const g=geometry as any;for(const kind of kinds){const b=g.getVertexBuffer(kind)?.getWrapperBuffer();if(b)b._data=null;}if(g._indices.length){g._totalIndices=g._indices.length;g._indices=[];}g._resetPointsArrayCache();}
 h.stripped=true;
}
async function restore(pin:Pin,scene:Scene,h:Held){
 // the same file through the same loader gives the same geometries in the
 // same order; materials and images are skipped, the GPU copy is let go
 const fresh=await load(pin,scene,true);
 try{
  if(fresh.geometries.length<h.originals.length)throw Error('Equipment container changed on reload: '+pin.url);
  h.originals.forEach(({geometry,kinds,vertices,indices},i)=>{
   const from=fresh.geometries[i] as any,to=geometry as any;
   if(from.getTotalVertices()!==vertices||from.getTotalIndices()!==indices||kinds.some(k=>!from.getVertexBuffer(k)))throw Error('Equipment container changed on reload: '+pin.url);
   for(const kind of kinds){const b=to.getVertexBuffer(kind)?.getWrapperBuffer();if(b)b._data=from.getVertexBuffer(kind).getWrapperBuffer()._data;}
   to._indices=from._indices;
  });
 }finally{fresh.dispose();}
 h.stripped=false;
}
function doneReading(h:Held){if(--h.readers===0&&!h.stripped)strip(h);}
/** A leased container. With `reads`, its CPU geometry is present until they run
 * (once the equip is done). Without (a rigid weapon, cloned whole), it is never
 * dropped: a clone refreshes its bounds from it. */
export async function container(pin:Pin,scene:Scene,releases:(()=>void)[],reads?:(()=>void)[]){
 let cache=containers.get(scene);if(!cache){cache=new LeaseCache(c=>c.dispose());containers.set(scene,cache);scene.onDisposeObservable.addOnce(()=>cache!.dispose());}
 const lease=cache.acquire(pin.url,async()=>{const pack=await load(pin,scene,false);held.set(pack,{readers:0,stripped:false,originals:pack.geometries.map(g=>({geometry:g,kinds:g.getVerticesDataKinds(),vertices:g.getTotalVertices(),indices:g.getTotalIndices()}))});return pack;});releases.push(lease.release);
 const pack=await lease.value,h=held.get(pack)!;
 if(!reads)return pack;
 h.readers++;reads.push(()=>doneReading(h));
 if(h.stripped)await (h.restoring??=restore(pin,scene,h).finally(()=>{h.restoring=undefined;}));
 return pack;
}
