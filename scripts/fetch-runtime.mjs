// bin/fetch-runtime: the character runtime (bodies, hair, gear, animations) from the
// GitHub Release this checkout pins, into the folder the game reads (ASSETS.md).
//
//   bin/fetch-runtime               the pinned release (client/src/asset-index.json "release")
//   bin/fetch-runtime --if-needed   only when the folder is missing or on another release (bin/dev)
//   bin/fetch-runtime --check       say which release is pinned and which is installed; exit 1 if they differ
//   bin/fetch-runtime --tag runtime-2026.10.20.1 | --latest
//   bin/fetch-runtime --dest /var/lib/vanai/runtime      elsewhere (DEPLOY.md "On this server")
//
// The folder is VANAI_RUNTIME from the environment or .env, else <repo>/runtime. A
// release is index.json, release.json and archives of files/<sha256>.<ext>
// (characters, animations, gear-0..f by item, about); release.json gives each
// archive's sha256 and URL, which may be an earlier release's when it did not change.
// Only archives whose sums this folder does not already have are downloaded, each
// verified before it is unpacked, and every file is then checked against the index.
// A prepared maker folder (an index.json this script did not write) is never written to.
// GITHUB_TOKEN or GH_TOKEN, if set, reads a private repository through the API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {gameRoot,runtimePath} from './runtime-root.mjs';
import {indexFiles} from './asset-index-files.mjs';
import {extract} from './runtime-archive.mjs';

const TAG_RE=/^runtime-(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/,SCHEMA='vanai-runtime-release-v1';
const argv=process.argv.slice(2),flag=n=>argv.includes(n),opt=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:undefined;};
for(const a of argv)if(a.startsWith('--')&&!['--if-needed','--check','--latest','--tag','--dest','--repo'].includes(a))fail(`Unknown option ${a} (see the header of scripts/fetch-runtime.mjs)`);
const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
const gb=n=>(n/1e9).toFixed(2)+' GB';
function fail(msg,code=1){console.error('fetch-runtime: '+msg);process.exit(code);}

// --- what is pinned, what is installed ------------------------------------------

const dest=path.resolve(gameRoot,opt('--dest')??runtimePath(gameRoot));
const pin=(()=>{const p=path.resolve(gameRoot,'client/src/asset-index.json');if(!fs.existsSync(p))return null;return JSON.parse(fs.readFileSync(p,'utf8')).release??null;})();
const repo=opt('--repo')??pin?.repo??'philipqnguyen/vanai';
if(!/^[\w.-]+\/[\w.-]+$/.test(repo))fail('Not a GitHub repository: '+repo);
// A folder this script filled has a release.json marked source "fetch"; the maker's
// prepared folder has an index.json and, once released, a release.json without it.
const installed=fs.existsSync(path.join(dest,'release.json'))?JSON.parse(fs.readFileSync(path.join(dest,'release.json'),'utf8')):null;
const prepared=fs.existsSync(path.join(dest,'index.json'))&&installed?.source!=='fetch';

let tag=opt('--tag');
if(tag&&!TAG_RE.test(tag))fail('A runtime tag is runtime-YYYY.MM.DD.N: '+tag);
if(flag('--latest'))tag=await latestTag();
if(flag('--check')){
  console.log(`pinned:    ${pin?`${pin.tag} (${pin.repo})`:'nothing'}`);
  console.log(`installed: ${prepared?`a prepared maker folder${installed?` (released as ${installed.tag})`:''}`:installed?installed.tag:'nothing'} at ${dest}`);
  process.exit(installed?.tag===(tag??pin?.tag)||prepared?0:1);
}
if(!tag){
  if(!pin)fail('client/src/asset-index.json pins no release: pass --tag or --latest');
  tag=pin.tag;
}
if(prepared){
  if(flag('--if-needed')){console.log(`fetch-runtime: ${dest} is a prepared runtime folder, left alone`);process.exit(0);}
  fail(`${dest} is a prepared maker folder (index.json without release.json); it is never overwritten. Use --dest for another folder.`);
}
if(installed?.tag===tag&&flag('--if-needed')){console.log(`fetch-runtime: ${tag} is installed at ${dest}`);process.exit(0);}

// --- GitHub ------------------------------------------------------------------------

const headers=()=>({'User-Agent':'vanai-fetch-runtime',Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})});
async function api(url){const r=await fetch(url,{headers:headers()});if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.json();}
async function latestTag(){
  const tags=(await api(`https://api.github.com/repos/${repo}/releases?per_page=100`)).filter(r=>!r.draft&&TAG_RE.test(r.tag_name)).map(r=>r.tag_name);
  if(!tags.length)fail('No runtime-* release on '+repo);
  const order=t=>{const m=TAG_RE.exec(t);return Number(m[1]+m[2]+m[3])*1e4+Number(m[4]);};
  return tags.sort((a,b)=>order(b)-order(a))[0];
}
const assetsByTag=new Map();
/** The URL that serves an attached file: the public link, or, with a token, its API
 * URL (a private repository's public links refuse). */
async function assetUrl(publicUrl){
  if(!token)return publicUrl;
  const m=/\/releases\/download\/([^/]+)\/([^/]+)$/.exec(publicUrl);if(!m)return publicUrl;
  const [,t,name]=m;
  if(!assetsByTag.has(t))assetsByTag.set(t,(await api(`https://api.github.com/repos/${repo}/releases/tags/${t}`)).assets);
  const a=assetsByTag.get(t).find(a=>a.name===decodeURIComponent(name));
  if(!a)throw Error(`${name} is not attached to ${t}`);
  return a.url;
}
async function open(publicUrl){
  const url=await assetUrl(publicUrl);
  for(let attempt=1;;attempt++){
    const r=await fetch(url,{headers:{...headers(),Accept:token?'application/octet-stream':'*/*'}}).catch(e=>({ok:false,status:e.message}));
    if(r.ok)return r;
    if(r.status===404)throw Error(`${publicUrl}: not found (a release not yet published, or a private repository${token?'':': set GITHUB_TOKEN'})`);
    if(attempt>=4)throw Error(`${publicUrl}: HTTP ${r.status}`);
    await new Promise(res=>setTimeout(res,attempt*2000));
  }
}
async function text(publicUrl){return (await open(publicUrl)).text();}
/** Download to `file`, returning its sha256, with a progress line. */
async function download(publicUrl,file,label,expected){
  const r=await open(publicUrl),hash=crypto.createHash('sha256');let got=0,shown=-1;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  await pipeline(Readable.fromWeb(r.body),async function*(src){for await(const c of src){hash.update(c);got+=c.length;const pct=Math.floor(got/expected*10);if(pct!==shown&&expected){shown=pct;process.stdout.write(`\r  ${label}: ${gb(got)} of ${gb(expected)}`);}yield c;}},fs.createWriteStream(file));
  process.stdout.write('\r');
  return hash.digest('hex');
}

// --- go -----------------------------------------------------------------------------------------

const base=`https://github.com/${repo}/releases/download/${tag}/`;
console.log(`fetch-runtime: ${tag} from ${repo} into ${dest}`);
let manifest;
try{manifest=JSON.parse(await text(base+'release.json'));}catch(e){fail(`could not read the release: ${e.message}`);}
if(manifest.schema!==SCHEMA)fail('Unknown release schema: '+manifest.schema);
if(manifest.tag!==tag)fail(`release.json on ${tag} names ${manifest.tag}`);
const work=path.join(dest,'.fetch');fs.mkdirSync(work,{recursive:true});
const doneFile=path.join(work,'done.json'),done=fs.existsSync(doneFile)?JSON.parse(fs.readFileSync(doneFile,'utf8')):{};
const have=name=>done[name]??installed?.archives?.[name]?.sha256;
const todo=Object.entries(manifest.archives).filter(([n,a])=>have(n)!==a.sha256);
console.log(`${manifest.files} files, ${gb(manifest.bytes)}; ${todo.length} of ${Object.keys(manifest.archives).length} archives to download (${gb(todo.reduce((s,[,a])=>s+a.bytes,0))})`);
for(const [name,a] of todo){
  const file=path.join(work,name);
  const sha=await download(a.url,file,name,a.bytes);
  if(sha!==a.sha256){fs.rmSync(file);fail(`${name} downloaded with sha256 ${sha}, expected ${a.sha256}`);}
  const {written,skipped}=await extract(file,dest);
  fs.rmSync(file);
  done[name]=a.sha256;fs.writeFileSync(doneFile,JSON.stringify(done));
  console.log(`  ${name}: ${gb(a.bytes)}, ${written} files unpacked${skipped?`, ${skipped} already here`:''}`);
}
const indexText=await text(base+'index.json');
if(crypto.createHash('sha256').update(indexText).digest('hex')!==manifest.index.sha256)fail('index.json does not match release.json');
const index=JSON.parse(indexText),missing=[];
for(const [name,bytes] of indexFiles(index)){let size=-1;try{size=fs.statSync(path.join(dest,'files',name)).size;}catch{}if(size!==bytes)missing.push(name);}
if(missing.length)fail(`${missing.length} file(s) the index names are missing after unpacking, e.g. ${missing[0]}; run again`);
fs.writeFileSync(path.join(dest,'index.json'),indexText);
fs.writeFileSync(path.join(dest,'release.json'),JSON.stringify({...manifest,source:'fetch'},null,1)+'\n');
fs.rmSync(work,{recursive:true,force:true});
const envHint=opt('--dest')&&path.resolve(dest)!==path.resolve(gameRoot,runtimePath(gameRoot))?` (set VANAI_RUNTIME=${path.relative(gameRoot,dest)||'.'} in .env to use it)`:'';
console.log(`fetch-runtime: ${tag} installed at ${dest}${envHint}`);
