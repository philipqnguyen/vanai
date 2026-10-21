import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { NullEngine, Scene, FreeCamera, Vector3, MeshBuilder, StandardMaterial, PBRMaterial, MaterialPluginBase, HemisphericLight, Material } from '@babylonjs/core/index.js';

const require = createRequire(import.meta.url);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vanai-effect-ownership-'));
const source = fs.readFileSync(new URL('../src/babylon-effect-ownership.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace("from '@babylonjs/core'", `from '${pathToFileURL(require.resolve('@babylonjs/core/index.js')).href}'`);
fs.writeFileSync(path.join(scratch, 'ownership.mjs'), output);
const { installBabylonEffectOwnershipFix } = await import(pathToFileURL(path.join(scratch, 'ownership.mjs')));
installBabylonEffectOwnershipFix();
installBabylonEffectOwnershipFix(); // Repeated setup must not acquire duplicate observers.
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function fixture(t, Type = StandardMaterial) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('camera', new Vector3(0, 0, -5), scene);
  new HemisphericLight('light', new Vector3(0, 1, 0), scene);
  const mesh = MeshBuilder.CreateBox('box', {}, scene);
  const material = mesh.material = new Type('material', scene);
  new MaterialPluginBase(material, 'ownership-fixture', 100, {}, true, true);
  t.after(() => engine.dispose());
  return { engine, scene, mesh, material };
}
const effects = engine => Object.values(engine._compiledEffects);
const refs = engine => effects(engine).map(effect => effect._refCount).sort((a, b) => a - b);
async function render(scene, count = 3) {
  for (let i = 0; i < count; i++) { scene.render(); await new Promise(resolve => setImmediate(resolve)); }
}
function holdCompilation(engine, oldEffect) {
  const create = engine.createEffect;
  let ready = false;
  const originals = new WeakMap();
  engine.createEffect = function (...args) {
    const effect = create.apply(this, args);
    if (effect !== oldEffect && !originals.has(effect)) {
      const isReady = effect.isReady.bind(effect);
      originals.set(effect, isReady);
      effect.isReady = () => ready && isReady();
    }
    return effect;
  };
  return () => { ready = true; };
}

for (const Type of [StandardMaterial, PBRMaterial]) {
  test(`${Type.name}: repeated and changed defines balance references, preserving shader callbacks`, async t => {
    const {engine, scene, mesh, material} = fixture(t, Type);
    await render(scene); const first = mesh.subMeshes[0].effect;
    assert.equal(typeof first._processCodeAfterIncludes, 'function');
    assert.deepEqual(refs(engine), [1]);
    material.markAsDirty(Material.AllDirtyFlag); await render(scene);
    assert.equal(mesh.subMeshes[0].effect, first); assert.deepEqual(refs(engine), [1]);
    material.disableLighting = true; await render(scene);
    assert.notEqual(mesh.subMeshes[0].effect, first); assert.equal(first.isDisposed, true);
    assert.deepEqual(refs(engine), [1]); scene.dispose(); assert.deepEqual(refs(engine), []);
  });
  test(`${Type.name}: different materials share one cached effect without premature disposal`, async t => {
    const {engine, scene, mesh, material} = fixture(t, Type);
    const other = MeshBuilder.CreateBox('peer', {}, scene);
    const peer = other.material = new Type('peer-material', scene);
    new MaterialPluginBase(peer, 'ownership-fixture', 100, {}, true, true);
    await render(scene); const shared = mesh.subMeshes[0].effect;
    assert.equal(other.subMeshes[0].effect, shared); assert.deepEqual(refs(engine), [2]);
    material.markAsDirty(Material.AllDirtyFlag); await render(scene); assert.deepEqual(refs(engine), [2]);
    mesh.dispose(); await new Promise(resolve => setTimeout(resolve, 5)); engine.endFrame();
    assert.equal(shared.isDisposed, false); assert.deepEqual(refs(engine), [1]);
    await render(scene); assert.equal(other.subMeshes[0].effect, shared);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
  for (const ending of ['complete', 'material', 'scene', 'wrapper']) {
    test(`${Type.name}: repeated pending hot swap then ${ending}`, async t => {
      const {engine, scene, mesh, material} = fixture(t, Type);
      await render(scene); const previous = mesh.subMeshes[0].effect;
      const complete = holdCompilation(engine, previous);
      material.disableLighting = true; await render(scene, 6);
      assert.equal(mesh.subMeshes[0].effect, previous); assert.deepEqual(refs(engine), [1, 1]);
      if (ending === 'complete') {
        complete(); await render(scene); assert.deepEqual(refs(engine), [1]);
        assert.equal(previous.isDisposed, true);
        assert.equal(typeof mesh.subMeshes[0].effect._processCodeAfterIncludes, 'function');
      } else if (ending === 'material') {
        material.dispose(); await new Promise(resolve => setTimeout(resolve, 5)); engine.endFrame();
        assert.deepEqual(refs(engine), []);
      } else if (ending === 'wrapper') {
        mesh.subMeshes[0].resetDrawCache(undefined, true); assert.deepEqual(refs(engine), []);
      }
      scene.dispose(); assert.deepEqual(refs(engine), []);
    });
  }
}

for (const Type of [StandardMaterial, PBRMaterial]) {
  test(`${Type.name}: material unbinding releases only a proven installed acquisition`, async t => {
    const {engine, scene, mesh} = fixture(t, Type);
    await render(scene); const effect = mesh.subMeshes[0].effect;
    const wrapper = mesh.subMeshes[0]._drawWrapper;
    wrapper.setEffect(effect); wrapper.setEffect(effect);
    assert.deepEqual(refs(engine), [1]); // No createEffect call: no new reference.
    mesh.material = null;
    assert.equal(effect.isDisposed, true); assert.deepEqual(refs(engine), []);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
}
test('an unrelated borrowed setter reference is never decremented by the compatibility hook', async t => {
  const {engine, scene, mesh} = fixture(t);
  await render(scene); const effect = mesh.subMeshes[0].effect;
  const {DrawWrapper} = await import('@babylonjs/core/Materials/drawWrapper.js');
  const borrower = new DrawWrapper(engine);
  borrower.setEffect(effect); borrower.setEffect(effect); borrower.setEffect(null);
  assert.deepEqual(refs(engine), [1]); borrower.dispose(true);
  scene.dispose(); assert.deepEqual(refs(engine), []);
});

for (const Type of [StandardMaterial, PBRMaterial]) {
  test(`${Type.name}: the engine effect rebuild path preserves the live shader and its callback`, async t => {
    const {engine, scene, mesh} = fixture(t, Type);
    await render(scene);
    const effect = mesh.subMeshes[0].effect;
    const callback = effect._processCodeAfterIncludes;
    engine._rebuildEffects(); await render(scene);
    assert.equal(mesh.subMeshes[0].effect, effect);
    assert.equal(effect._processCodeAfterIncludes, callback);
    assert.equal(effect.isReady(), true); assert.deepEqual(refs(engine), [1]);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
}

for (const Type of [StandardMaterial, PBRMaterial]) {
  test(`${Type.name}: two meshes sharing one material each own a shader reference`, async t => {
    const {engine, scene, mesh, material} = fixture(t, Type);
    const peer = mesh.clone('same-material');
    await render(scene); const effect = mesh.subMeshes[0].effect;
    assert.equal(peer.material, material); assert.equal(peer.subMeshes[0].effect, effect);
    assert.deepEqual(refs(engine), [2]);
    material.markAsDirty(Material.AllDirtyFlag); await render(scene); assert.deepEqual(refs(engine), [2]);
    mesh.dispose(); await new Promise(resolve => setTimeout(resolve, 5)); engine.endFrame();
    assert.equal(effect.isDisposed, false); assert.deepEqual(refs(engine), [1]);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
  test(`${Type.name}: replacing a pending compilation keeps only the newest acquisition`, async t => {
    const {engine, scene, mesh, material} = fixture(t, Type);
    await render(scene); const initial = mesh.subMeshes[0].effect;
    const complete = holdCompilation(engine, initial);
    material.disableLighting = true; await render(scene, 4);
    const abandoned = effects(engine).find(effect => effect !== initial);
    assert.ok(abandoned); assert.deepEqual(refs(engine), [1, 1]);
    material.pointsCloud = true; await render(scene, 4);
    assert.equal(abandoned.isDisposed, true); assert.deepEqual(refs(engine), [1, 1]);
    assert.equal(mesh.subMeshes[0].effect, initial);
    complete(); await render(scene); assert.deepEqual(refs(engine), [1]);
    assert.notEqual(mesh.subMeshes[0].effect, abandoned);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
  test(`${Type.name}: replacing the mesh material with another supported type releases its old shader`, async t => {
    const {engine, scene, mesh} = fixture(t, Type);
    await render(scene); const first = mesh.subMeshes[0].effect;
    const Next = Type === StandardMaterial ? PBRMaterial : StandardMaterial;
    const next = new Next('replacement', scene);
    new MaterialPluginBase(next, 'ownership-fixture', 100, {}, true, true);
    mesh.material = next;
    await new Promise(resolve => setTimeout(resolve, 5)); engine.endFrame();
    assert.equal(first.isDisposed, true); assert.deepEqual(refs(engine), []);
    await render(scene); assert.deepEqual(refs(engine), [1]);
    assert.notEqual(mesh.subMeshes[0].effect, first);
    scene.dispose(); assert.deepEqual(refs(engine), []);
  });
}

for (const cancellation of ['effect', 'engine', 'none']) {
  test(cancellation === 'none' ? 'live async shader initialization still compiles normally' : `shader initialization finishing after ${cancellation} disposal cannot resurrect a pipeline`, async t => {
    const engine = new NullEngine();
    t.after(() => engine.dispose());
    let release;
    const initialized = new Promise(resolve => { release = resolve; });
    let created = 0;
    const create = engine.createPipelineContext;
    engine.createPipelineContext = function (...args) { created++; return create.apply(this, args); };
    const shader = {
      vertexSource: 'attribute vec3 position; void main(){gl_Position=vec4(position,1.0);}',
      fragmentSource: 'void main(){gl_FragColor=vec4(1.0);}',
    };
    const effect = engine.createEffect(shader, {
      attributes: ['position'], uniformsNames: [], samplers: [], defines: '',
      extraInitializationsAsync: () => initialized,
    }, engine);
    assert.equal(created, 0);
    if (cancellation === 'effect') effect.dispose();
    if (cancellation === 'engine') engine.dispose();
    release(); await new Promise(resolve => setTimeout(resolve, 5));
    if (cancellation === 'none') {
      assert.equal(created, 1); assert.equal(effect.isReady(), true);
      assert.equal(effect.isDisposed, false); assert.deepEqual(refs(engine), [1]);
      effect.dispose(); assert.deepEqual(refs(engine), []);
    } else {
      assert.equal(created, 0); assert.equal(effect.getPipelineContext(), null);
      if (cancellation === 'effect') { assert.equal(effect.isDisposed, true); assert.deepEqual(refs(engine), []); }
      else assert.equal(engine.isDisposed, true);
    }
  });
}
