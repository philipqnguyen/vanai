import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import crypto from 'node:crypto';
import ts from 'typescript';import {NullEngine,Scene,MeshBuilder,PBRMaterial,RawTexture} from '@babylonjs/core';
const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));fs.mkdirSync(cache,{recursive:true});
const dir=fs.mkdtempSync(path.join(cache,'gear-coverage-test-'));
for(const file of ['underlay','source-domain']){const source=fs.readFileSync(new URL(`../src/gear/${file}.ts`,import.meta.url),'utf8').replace("'./underlay'","'./underlay.mjs'");fs.writeFileSync(path.join(dir,file+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
const {SourceDomainCoverage}=await import(pathToFileURL(path.join(dir,'source-domain.mjs')).href);
const sha=x=>crypto.createHash('sha256').update(new Uint8Array(x.buffer)).digest('hex');
test('coverage restores original buffers/materials and releases per-actor resources through repeated equip cycles',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const mesh=MeshBuilder.CreateGround('body',{width:1,height:1},scene);mesh.material=new PBRMaterial('skin',scene);
 // a textured material: the per-actor clones must share its textures, not copy them
 for(const slot of ['albedoTexture','metallicTexture','bumpTexture'])mesh.material[slot]=RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,scene);
 const other=mesh.clone('other');const original=mesh.geometry,material=mesh.material,indices=Array.from(mesh.getIndices());
 const record={schema:'clothing-source-domains-v1',item:'torso-short',source:{glb_sha256:'source',body_triangles:2,body_indices_sha256:sha(Uint32Array.from(indices)),body_positions_sha256:sha(Float32Array.from(mesh.getVerticesData('position')))},whole_faces:[0],partial:[{face:1,halfplanes:[[1,0,-.25]]}]};
 // cloning a textured PBR material creates the scene's one default material
 // (marking submeshes dirty asks for it); it is the scene's, not the actor's
 scene.defaultMaterial;
 const baseline={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length};
 for(let i=0;i<5;i++){
  const coverage=await SourceDomainCoverage.create(mesh,[record],'source');coverage.setActive(['torso-short']);
  assert.notEqual(mesh.geometry,original);assert.equal(other.geometry,original);assert.deepEqual(Array.from(other.getIndices()),indices);
  coverage.setActive([]);assert.equal(mesh.geometry,original);assert.equal(mesh.material,material);assert.deepEqual(Array.from(mesh.getIndices()),indices);
  for(const slot of ['albedoTexture','metallicTexture','bumpTexture'])assert.equal(coverage.activeMaterial[slot],material[slot],slot);
  coverage.dispose();assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length},baseline);
 }
 await assert.rejects(()=>SourceDomainCoverage.create(mesh,[{...record,source:{...record.source,glb_sha256:'stale'}}],'source'),/identity mismatch/);
 await assert.rejects(()=>SourceDomainCoverage.create(mesh,[{...record,protected_faces:[0]}],'source'),/protected anatomy/);
 scene.dispose();engine.dispose();fs.rmSync(dir,{recursive:true,force:true});
});
test('higher-priority torso and footwear remove covered cloth independently without affecting restoration',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateGround('cloth',{width:1,height:1},scene);mesh.material=new PBRMaterial('cloth',scene);
 const original=mesh.geometry,indices=Array.from(mesh.getIndices());
 const base={schema:'clothing-source-domains-v1',item:'legs',source:{glb_sha256:'source',body_triangles:2},whole_faces:[0,1],partial:[]};
 const coverage=await SourceDomainCoverage.create(mesh,[base],'source',[0,1],true);coverage.setActive(['legs']);
 coverage.setExclusions([{...base,item:'torso',whole_faces:[0]},{...base,item:'feet',whole_faces:[1]}]);assert.equal(mesh.getTotalIndices(),0);
 coverage.setExclusions([{...base,item:'feet',whole_faces:[1]}]);assert.deepEqual(Array.from(mesh.getIndices()),indices.slice(0,3));
 coverage.dispose();assert.equal(mesh.geometry,original);assert.deepEqual(Array.from(mesh.getIndices()),indices);scene.dispose();engine.dispose();
});

test('sleeve and handwrap partial domains share one reversible body union and reject a third region',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateGround('body',{width:1,height:1},scene);mesh.material=new PBRMaterial('skin',scene);
 const original=mesh.geometry,material=mesh.material,indices=Array.from(mesh.getIndices());
 const base={schema:'clothing-source-domains-v1',source:{glb_sha256:'source',body_triangles:2,body_indices_sha256:sha(Uint32Array.from(indices)),body_positions_sha256:sha(Float32Array.from(mesh.getVerticesData('position')))},whole_faces:[]};
 const records=[{...base,item:'sleeve',partial:[{face:0,halfplanes:[[1,0,-.6]]}]},{...base,item:'wrap',partial:[{face:0,halfplanes:[[-1,0,.4]]}]},{...base,item:'third',partial:[{face:0,halfplanes:[[0,1,-.5]]}]}];
 const coverage=await SourceDomainCoverage.create(mesh,records,'source');
 for(let i=0;i<3;i++){coverage.setActive(['sleeve','wrap']);assert.equal(coverage.info().active.length,2);coverage.setActive(['sleeve']);coverage.setActive([]);assert.equal(mesh.geometry,original);assert.equal(mesh.material,material);assert.deepEqual(Array.from(mesh.getIndices()),indices);}
 assert.throws(()=>coverage.setActive(['sleeve','wrap','third']),/More than two convex/);coverage.dispose();assert.equal(mesh.geometry,original);scene.dispose();engine.dispose();
});

test('setting leg exclusions before activation preserves exact output with one preparation',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateGround('cloth',{width:1,height:1},scene);mesh.material=new PBRMaterial('cloth',scene);
 const original=mesh.geometry,material=mesh.material,peer=mesh.clone('independent peer'),indices=Array.from(mesh.getIndices());
 const resources=()=>({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length});
 const base={schema:'clothing-source-domains-v1',item:'legs',source:{glb_sha256:'source',body_triangles:2},whole_faces:[0,1],partial:[]};
 const partialBase={...base,whole_faces:[1],partial:[{face:0,halfplanes:[[1,0,-.15]]}]};
 const exclusions=[[],[{...base,item:'torso',whole_faces:[0]}],[{...base,item:'torso',whole_faces:[],partial:[{face:0,halfplanes:[[-1,0,.6]]}]}],[{...base,item:'torso',whole_faces:[],partial:[{face:0,halfplanes:[[-1,0,.6]]}]},{...base,item:'feet',whole_faces:[1]}]];
 const snapshot=coverage=>{
  const texture=coverage.tex.getInternalTexture()._bufferView;
  assert.ok(texture instanceof Float32Array,'domain texture data must be inspected');
  return {indices:Array.from(mesh.getIndices()),buffers:Object.fromEntries(mesh.getVerticesDataKinds().map(k=>[k,Array.from(mesh.getVerticesData(k))])),influences:mesh.numBoneInfluencers,texture:Array.from(texture),textureSize:coverage.tex.getSize(),info:coverage.info()};
 };
 try{
  for(const record of [base,partialBase])for(const holes of exclusions){
   const outputs=[];
   for(const order of ['old','new']){
    const baseline=resources(),coverage=await SourceDomainCoverage.create(mesh,[record],'source',[0,1],true);
    let builds=0;const activate=coverage.setActive.bind(coverage);coverage.setActive=(...args)=>{builds++;return activate(...args)};
    try{
     if(order==='old'){coverage.setActive(['legs']);coverage.setExclusions(holes)}else{coverage.setExclusions(holes);coverage.setActive(['legs'])}
     assert.equal(builds,order==='old'?2:1);outputs.push(snapshot(coverage));
     assert.equal(peer.geometry,original);assert.deepEqual(Array.from(peer.getIndices()),indices);
    }finally{coverage.dispose();}
    assert.equal(mesh.geometry,original);assert.equal(mesh.material,material);assert.deepEqual(Array.from(mesh.getIndices()),indices);assert.deepEqual(resources(),baseline);
   }
   assert.deepEqual(outputs[0],outputs[1]);
  }
 }finally{scene.dispose();engine.dispose();}
});

test('coverage validates identical sources once per create and still rejects later invalid records',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateGround('body',{width:1,height:1},scene);mesh.material=new PBRMaterial('skin',scene);
 const joints=new Float32Array(mesh.getTotalVertices()*4),weights=new Float32Array(joints.length);
 for(let i=0;i<mesh.getTotalVertices();i++)weights[i*4]=1;
 mesh.setVerticesData('matricesIndices',joints,false,4);mesh.setVerticesData('matricesWeights',weights,false,4);
 const skin=new Float32Array(joints.length+weights.length);
 for(let v=0;v<joints.length/4;v++)for(let k=0;k<4;k++){skin[v*8+k]=joints[v*4+k];skin[v*8+4+k]=weights[v*4+k];}
 const source={glb_sha256:'source',body_triangles:2,body_indices_sha256:sha(Uint32Array.from(mesh.getIndices())),body_positions_sha256:sha(Float32Array.from(mesh.getVerticesData('position'))),body_skinning_sha256:sha(skin)};
 const base={schema:'clothing-source-domains-v1',source,whole_faces:[0],partial:[]};
 const records=['torso','legs','feet'].map(item=>({...base,item,source:{...source}}));
 const digest=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);let digests=0;
 t.mock.method(globalThis.crypto.subtle,'digest',(...args)=>{digests++;return digest(...args)});
 try{
  const coverage=await SourceDomainCoverage.create(mesh,records,'source');coverage.dispose();
  assert.equal(digests,3,'one indices/positions/skinning validation for three matching source tuples');
  for(const field of ['body_indices_sha256','body_positions_sha256','body_skinning_sha256']){
   const bad={...records[1],source:{...source,[field]:'stale'}};
   await assert.rejects(()=>SourceDomainCoverage.create(mesh,[records[0],bad],'source'),/body revision|skin weights changed/,field);
  }
  await assert.rejects(()=>SourceDomainCoverage.create(mesh,[records[0],{...records[1],protected_faces:[0]}],'source'),/protected anatomy/);
  await assert.rejects(()=>SourceDomainCoverage.create(mesh,[records[0],{...records[1],whole_faces:[],partial:[{face:0,halfplanes:[[NaN,0,1]]}]}],'source'),/Invalid source-domain polygon/);
  const positions=Float32Array.from(mesh.getVerticesData('position'));positions[0]+=.1;
  mesh.setVerticesData('position',positions,false,3);
  await assert.rejects(()=>SourceDomainCoverage.create(mesh,records,'source'),/body revision/,'a later create must revalidate mutated geometry');
 }finally{t.mock.restoreAll();scene.dispose();engine.dispose();}
});

test('covering shares the original vertex buffers and copies only the partly covered faces',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateGround('body',{width:1,height:1,subdivisions:2},scene);mesh.material=new PBRMaterial('skin',scene);
 const original=mesh.geometry,indices=Array.from(mesh.getIndices()),positions=Array.from(mesh.getVerticesData('position')),faces=indices.length/3;
 const resources=()=>({meshes:scene.meshes.length,geometries:scene.geometries.length,materials:scene.materials.length,textures:scene.textures.length});
 const record={schema:'clothing-source-domains-v1',item:'torso',source:{glb_sha256:'source',body_triangles:faces,body_indices_sha256:sha(Uint32Array.from(indices)),body_positions_sha256:sha(Float32Array.from(positions))},whole_faces:[0,1,2],partial:[{face:3,halfplanes:[[1,0,-.25]]},{face:5,halfplanes:[[0,1,-.5]]}]};
 try{
  const baseline=resources(),coverage=await SourceDomainCoverage.create(mesh,[record],'source');
  for(let cycle=0;cycle<2;cycle++){
   coverage.setActive(['torso']);
   for(const kind of original.getVerticesDataKinds())assert.equal(mesh.getVertexBuffer(kind).getBuffer(),original.getVertexBuffer(kind).getBuffer(),kind);
   assert.ok(mesh.getIndices() instanceof Uint16Array,'the index list is typed');
   assert.deepEqual(Array.from(mesh.getIndices()),[4,6,7].flatMap(f=>indices.slice(f*3,f*3+3)),'whole faces are omitted, partial faces move to the patch');
   assert.equal(mesh.isVerticesDataPresent('clothingRow'),false);
   const patches=mesh.getChildMeshes().filter(m=>m.name==='source domain partial faces');assert.equal(patches.length,1);const [patch]=patches;
   const corners=[3,5].flatMap(f=>indices.slice(f*3,f*3+3));
   assert.deepEqual(Array.from(patch.getVerticesData('position')),corners.flatMap(v=>positions.slice(v*3,v*3+3)));
   assert.deepEqual(Array.from(patch.getVerticesData('clothingRow')),[0,0,0,1,1,1]);assert.deepEqual(Array.from(patch.getVerticesData('clothingBary')),[0,0,1,0,0,1,0,0,1,0,0,1]);
   assert.equal(patch.material,mesh.material);assert.equal(patch.skeleton,mesh.skeleton);
   mesh.material.isReadyForSubMesh(mesh,mesh.subMeshes[0]);mesh.material.isReadyForSubMesh(patch,patch.subMeshes[0]);
   assert.equal(!!mesh.subMeshes[0].materialDefines.CLOTHING_DOMAIN_COPIES,false,'whole faces take the row of -1 as a constant');assert.equal(patch.subMeshes[0].materialDefines.CLOTHING_DOMAIN_COPIES,true);
   // per-vertex data a caller adds later (artwork coordinates) reaches the copied corners
   mesh.setVerticesData('artworkPosition',Array.from(mesh.getVerticesData('position')),false,3);
   assert.deepEqual(Array.from(patch.getVerticesData('artworkPosition')),Array.from(patch.getVerticesData('position')));
   assert.equal(coverage.info().sharedVertexBuffers,true);assert.equal(coverage.info().vertices,9+6);
   coverage.setActive([]);
   assert.equal(mesh.geometry,original);assert.deepEqual(Array.from(mesh.getIndices()),indices);assert.equal(mesh.getChildMeshes().length,0);
   assert.deepEqual(Array.from(mesh.getVerticesData('position')),positions,'releasing the cover leaves the shared buffers alone');
  }
  coverage.dispose();assert.deepEqual(resources(),baseline);
 }finally{scene.dispose();engine.dispose();}
});
