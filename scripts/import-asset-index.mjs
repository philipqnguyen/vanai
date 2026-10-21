// npm run assets:import: copy the maker's prepared index (VANAI_RUNTIME/index.json)
// to client/src/asset-index.json after checking every file it names is in
// VANAI_RUNTIME/files with its size and hash, and that it was prepared with this
// checkout's packed-gear decoder. Nothing else crosses from the maker.
// The copy gains one field, `release` {repo, tag}: the GitHub Release the folder's
// release.json names (written by the maker's tools/runtime/release.mjs, or by
// bin/fetch-runtime), when that release was made from this very index. It is how a
// checkout pins the runtime it was tested against (bin/fetch-runtime reads it), and
// the no-runtime tests fail on an index without one: release before you commit.
//   --fast  sizes only, no hashing (the maker's prepare.mjs already hashed them)
import {readFileSync,writeFileSync,renameSync,statSync,existsSync,createReadStream} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {runtimeRoot,gameRoot} from './runtime-root.mjs';
import {indexFiles} from './asset-index-files.mjs';
const runtime=runtimeRoot(),text=readFileSync(resolve(runtime,'index.json')),index=JSON.parse(text);
if(index.schema!=='vanai-asset-index-v1')throw Error('Unknown asset index schema: '+index.schema);
for(const [file,sha] of Object.entries(index.decoder)){
 const mine=createHash('sha256').update(readFileSync(resolve(gameRoot,'client/src/gear',file))).digest('hex');
 if(mine!==sha)throw Error(`The maker verified packed gear with another ${file}: copy client/src/gear/${file} to the maker (or back) so both decode alike`);
}
const files=indexFiles(index),fast=process.argv.includes('--fast');let bytes=0;
for(const [name,size] of files){
 const p=resolve(runtime,'files',name);
 if(!existsSync(p))throw Error('Missing from the runtime folder: '+name);
 if(statSync(p).size!==size)throw Error('Wrong size: '+name);
 if(!fast){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);if(h.digest('hex')+extname(name)!==name)throw Error('Changed file: '+name);}
 bytes+=size;
}
const releaseFile=resolve(runtime,'release.json'),release=existsSync(releaseFile)?JSON.parse(readFileSync(releaseFile,'utf8')):null;
const indexSha=createHash('sha256').update(text).digest('hex');
if(release&&release.index?.sha256===indexSha)index.release={repo:release.repo,tag:release.tag};
else console.warn(release?`WARNING: ${runtime}/release.json (${release.tag}) was made from another index: no release pinned. In the maker: node tools/runtime/release.mjs, then import again.`
 :`WARNING: no release.json in ${runtime}: no release pinned (the maker's tools/runtime/release.mjs writes it).`);
const dst=resolve(gameRoot,'client/src/asset-index.json');writeFileSync(dst+'.importing',JSON.stringify(index,null,1)+'\n');renameSync(dst+'.importing',dst);
console.log(`Imported the asset index: ${files.size} files, ${(bytes/1e9).toFixed(2)} GB, ${fast?'sizes':'hashes'} checked${index.release?`, pinned to ${index.release.tag}`:''}.`);
