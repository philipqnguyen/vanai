// A runtime release archive (the maker's tools/runtime/release.mjs): a plain ustar
// of files/<sha256>.<ext> (or the README, CREDITS, LICENSE and licenses/ of
// about.tar.zst), zstd-compressed. Read here with Node alone, so fetching the
// runtime needs no tar or zstd on the machine.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

/** Read ustar entries from a byte stream: yields {name, size, type, body} where body
 * is an async iterable of exactly `size` bytes that must be consumed. */
export async function* untar(source){
  let buf=Buffer.alloc(0),done=false;const it=source[Symbol.asyncIterator]();
  async function need(n){while(buf.length<n&&!done){const {value,done:d}=await it.next();if(d)done=true;else buf=buf.length?Buffer.concat([buf,value]):value;}if(buf.length<n)throw Error('Archive ends early');const out=buf.subarray(0,n);buf=buf.subarray(n);return out;}
  async function* take(n){while(n>0){if(!buf.length){const {value,done:d}=await it.next();if(d)throw Error('Archive ends early');buf=value;}const c=buf.subarray(0,Math.min(n,buf.length));buf=buf.subarray(c.length);n-=c.length;yield c;}}
  for(;;){
    const h=await need(512);
    if(h.every(b=>b===0))return;
    const str=(o,l)=>h.toString('utf8',o,o+l).replace(/\0.*$/s,'');
    const prefix=h.toString('latin1',257,262)==='ustar'?str(345,155):'',name=(prefix?prefix+'/':'')+str(0,100),size=parseInt(str(124,12).trim()||'0',8),type=str(156,1)||'0';
    const pad=size%512?512-size%512:0;
    let left=size;const body=(async function*(){for await(const c of take(size)){left-=c.length;yield c;}if(left)throw Error('Entry not fully read: '+name);})();
    yield {name,size,type,body};
    if(left)for await(const _ of body){/* consume what the caller skipped */}
    if(pad)await need(pad);
  }
}
/** Unpack `archive` into `into`, returning what was written and what was already there. */
export async function extract(archive,into){
  let written=0,skipped=0;
  for await(const e of untar(fs.createReadStream(archive).pipe(zlib.createZstdDecompress()))){
    if(e.name.includes('..')||path.isAbsolute(e.name))throw Error('Refusing path in archive: '+e.name);
    const target=path.join(into,e.name);
    if(e.type==='5'){fs.mkdirSync(target,{recursive:true});continue;}
    if(e.type!=='0')throw Error(`Unexpected entry type ${e.type}: ${e.name}`);
    // Files under files/ are named by their content: one already here at its size is done.
    if(e.name.startsWith('files/')&&fs.existsSync(target)&&fs.statSync(target).size===e.size){skipped++;continue;}
    fs.mkdirSync(path.dirname(target),{recursive:true});
    await pipeline(Readable.from(e.body),fs.createWriteStream(target+'.tmp'));
    fs.renameSync(target+'.tmp',target);written++;
  }
  return {written,skipped};
}

