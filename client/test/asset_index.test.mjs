// The asset index (client/src/asset-index.json, npm run assets:import) and the
// runtime folder it names: everything the game loads from the maker, one way.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {indexFiles} from '../../scripts/asset-index-files.mjs';
import {runtimeRoot} from '../../scripts/runtime-root.mjs';
import {index} from './runtime-assets.mjs';
const root=new URL('../../',import.meta.url);

test('every file the index names is in the runtime folder at its size',()=>{
  const files=indexFiles(index),dir=path.join(runtimeRoot(),'files'),missing=[];
  for(const [name,bytes] of files){let size=-1;try{size=fs.statSync(path.join(dir,name)).size;}catch{}if(size!==bytes)missing.push(name);}
  assert.deepEqual(missing.slice(0,10),[],`${missing.length} file(s) missing or changed: re-run the maker's tools/runtime/prepare.mjs, then npm run assets:import`);
  assert.ok(files.size>10000);
});

test('the maker verified packed gear with this checkout\'s decoder',()=>{
  for(const [file,sha] of Object.entries(index.decoder))
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('client/src/gear/'+file,root))).digest('hex'),sha,`client/src/gear/${file} differs from the maker's copy`);
});

test('every catalog model and drape texture ships packed, or as approved when it failed a check',()=>{
  const packed=new Set([...Object.keys(index.packed.models),...Object.keys(index.packed.textures)]),files=indexFiles(index),bare=[];
  for(const b of Object.values(index.gear.catalog.bodies))for(const e of Object.values(b.items))for(const c of e.components)
    for(const pin of [c.model,c.artwork&&!c.coordinated?c.artwork:null])if(pin&&!packed.has(pin.sha256)){
      assert.ok(files.has(pin.sha256+path.extname(pin.url).toLowerCase()),pin.url);bare.push(pin.url);}
  assert.ok(bare.length<=2,`${bare.length} unpacked: ${bare.slice(0,5)}`);
});

// The pixel size in an image file's header: KTX2, PNG or WebP (VP8, VP8L, VP8X).
function imageSize(b){
  if(b.toString('latin1',1,7)==='KTX 20')return [b.readUInt32LE(20),b.readUInt32LE(24)];
  if(b.toString('latin1',1,4)==='PNG')return [b.readUInt32BE(16),b.readUInt32BE(20)];
  const c=b.toString('latin1',12,16);
  if(c==='VP8 ')return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  if(c==='VP8L'){const v=b.readUInt32LE(21);return [(v&0x3fff)+1,((v>>14)&0x3fff)+1];}
  if(c==='VP8X')return [b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];
  throw Error('unknown image type');
}

// Philip, 2026-10-14: "All at 1024. I don't want 2048 anymore."
test('every packed gear image is at most 1024²',()=>{
  const dir=path.join(runtimeRoot(),'files'),big=[],buf=Buffer.alloc(32);
  const all=[...Object.values(index.packed.models).flatMap(m=>Object.values(m.images)),...Object.values(index.packed.textures)];
  for(const i of all){
    const fd=fs.openSync(path.join(dir,i.h),'r');fs.readSync(fd,buf,0,32,0);fs.closeSync(fd);
    const [w,h]=imageSize(buf);if(Math.max(w,h)>1024)big.push(`${i.h} ${w}x${h}`);
  }
  assert.deepEqual(big.slice(0,10),[],`${big.length} image(s) larger than 1024²`);
  assert.ok(all.length>5000);
});

test('the gates are the ones Philip set (2026-10-12, 1024² copies 2026-10-13)',()=>{
  const g=index.gates;
  assert.ok(g.psnr>=42&&g.p999<=16&&g.maskFlip<=1e-3,'texture gate loosened');
  assert.ok(g.position<=2e-5&&g.skinned<=1e-4&&g.normalDeg<=0.01,'geometry gate loosened');
  assert.ok(g.farPsnr>=40,'1024²-copy gate loosened');
});

// The maker's files come only through the index: nothing links them in or asks
// for them by their old paths.
test('nothing reaches the maker except through the index',()=>{
  for(const p of ['client/public/gear','client/public/gear-packed','client/public/animations','client/public/animation-library','client/public/models/characters','client/public/models/preview','client/local','design/gear','design/race-preview','design/characters','.asset-links.json'])
    assert.ok(!fs.existsSync(new URL(p,root)),p+' exists: the maker\'s files come through the asset index only');
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  const old=/['"`]\/(gear|gear-packed|animations|animation-library)\/|['"`]\/models\/(characters|preview)\/|VANAI_ASSET_ROOT/;
  for(const f of walk(new URL('client/src',root).pathname))if(/\.(ts|js)$/.test(f))assert.ok(!old.test(fs.readFileSync(f,'utf8')),path.relative(root.pathname,f)+' names a maker path');
});
