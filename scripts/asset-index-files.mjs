import {extname} from 'node:path';
/** Every file an asset index names, as name (<sha256>.<ext>) -> bytes: the packed
 * and path refs ({h, b}) and each gear pin ({url, sha256, bytes}) that is not
 * replaced by a packed copy. Shared by the import and the game's tests. */
export function indexFiles(index){
 const files=new Map(),packed=new Set([...Object.keys(index.packed.models),...Object.keys(index.packed.textures)]);
 const add=(name,bytes)=>{if(files.has(name)&&files.get(name)!==bytes)throw Error('Conflicting sizes for '+name);files.set(name,bytes);};
 (function walk(v){
  if(!v||typeof v!=='object')return;
  if(typeof v.h==='string'&&typeof v.b==='number')add(v.h,v.b);
  for(const x of Object.values(v))walk(x);
 })({packed:index.packed,paths:index.paths});
 (function pins(v){
  if(!v||typeof v!=='object')return;
  if(typeof v.url==='string'&&typeof v.sha256==='string'&&v.url.startsWith('/')&&!packed.has(v.sha256))add(v.sha256+extname(v.url).toLowerCase(),v.bytes);
  for(const x of Object.values(v))pins(x);
 })(index.gear);
 return files;
}
