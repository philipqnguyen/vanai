/** Real WebGL regression control for an effect disposed during async shader loading.
 * Run only while other browser/performance QA is idle:
 *   node tools/qa/effect_async_disposal.mjs --run
 *   node tools/qa/effect_async_disposal.mjs --run --baseline
 * --baseline removes only the current disposed-effect guard in this page's served
 * response. It never modifies runtime files. Baseline is expected to reproduce.
 */
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv.includes('--run')) throw Error('Explicit --run required; coordinate browser QA first');
const root = process.env.VANAI_GAME_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = QA_BASE;
const baseline = process.argv.includes('--baseline');
const out = process.env.VANAI_EFFECT_QA_OUTPUT ?? path.join(root,
  '.playwright-mcp/gameplay-memory', `effect-async-direct-${baseline ? 'baseline' : 'guarded'}`);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...CHANNEL, headless: true,
  args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const report = {
  conditions: {
    base, browser: browser.version(), guardExpected: !baseline,
    shader: 'Explicit minimal shaders; shader callback captures departed scene',
    trigger: 'extraInitializationsAsync gate; dispose effect and scene before release',
    collection: 'Only WeakRefs to departed objects after setup; rendered StandardMaterial successor',
  },
  errors: [], consoleErrors: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    // Keep Vite/HMR transport diagnostics without confusing them with page errors.
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  await page.route('**/src/babylon-effect-ownership.ts', async route => {
    const response = await route.fetch();
    const original = await response.text();
    let body = original;
    if (baseline) {
      const guard = /if\s*\(this\.isDisposed\s*\|\|\s*this\.getEngine\(\)\.isDisposed\)\s*return;/g;
      assert.equal(original.match(guard)?.length, 1, 'Remove exactly the current async-disposal guard');
      body = original.replace(guard, '/* QA baseline: disposed-effect guard disabled */');
      report.conditions.baselineResponseGuardRemoved = true;
    }
    const hash = text => createHash('sha256').update(text).digest('hex');
    report.conditions.originalAdapterResponseSha256 = hash(original);
    report.conditions.servedAdapterResponseSha256 = hash(body);
    await route.fulfill({ response, body });
  });
  await page.route('**/__async-effect-qa', route => route.fulfill({
    contentType: 'text/html', body: '<canvas id="canvas" width="640" height="480"></canvas>',
  }));
  await page.goto(base + '/__async-effect-qa');
  // Resolve the same optimized Babylon entry used by actual game modules.
  const response = await page.request.get(base + '/src/babylon-effect-ownership.ts');
  assert(response.ok());
  const babylon = (await response.text()).match(/from\s*["']([^"']*@babylonjs_core[^"']*)["']/)?.[1];
  assert(babylon, 'Exact Vite Babylon URL');
  report.setup = await page.evaluate(async babylon => {
    const B = await import(babylon);
    const { installBabylonEffectOwnershipFix } = await import('/src/babylon-effect-ownership.ts');
    const originalReady = B.StandardMaterial.prototype.isReadyForSubMesh;
    installBabylonEffectOwnershipFix();
    if (originalReady === B.StandardMaterial.prototype.isReadyForSubMesh) {
      throw Error('Ownership fix did not patch the actual Babylon barrel instance');
    }
    const engine = new B.Engine(document.getElementById('canvas'), false, { preserveDrawingBuffer: true });
    const q = window.__asyncQA = { engine, scene: null, prior: null, effects: [], programsCreated: 0 };
    const gl = engine._gl;
    const createProgram = gl.createProgram;
    gl.createProgram = function (...args) {
      q.programsCreated++;
      return createProgram.apply(this, args);
    };
    q.frames = async (count = 5) => {
      for (let i = 0; i < count; i++) {
        engine.beginFrame(); q.scene.render(); engine.endFrame();
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    };
    q.settle = async () => {
      const until = performance.now() + 30_000;
      do {
        await q.frames(2);
        if (q.scene.isReady()) {
          await q.frames(2);
          if (q.scene.isReady()) return;
        }
      } while (performance.now() < until);
      throw Error('Successor shader readiness timed out');
    };
    const gate = new Promise(resolve => { q.release = resolve; });
    const makeScene = () => {
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(.12, .14, .17, 1);
      scene.activeCamera = new B.ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 5,
        new B.Vector3(0, 0, 0), scene);
      new B.HemisphericLight('light', new B.Vector3(.5, 1, -.5), scene);
      return scene;
    };
    q.scene = makeScene();
    Object.defineProperty(q.scene, '__vanaiHeapSceneTag', { value: 'vanai-scene:async-disposal' });
    q.prior = new WeakRef(q.scene);
    // The callback deliberately retains scene context, as material plugins do.
    // It always returns the exact shader source unchanged.
    const captureCode = scene => (_type, code) => {
      if (scene.isDisposed) return code;
      return code;
    };
    const effect = engine.createEffect({
      vertexSource: 'precision highp float;attribute vec3 position;void main(){gl_Position=vec4(position,1.0);}',
      fragmentSource: 'precision highp float;void main(){gl_FragColor=vec4(0.7,0.4,0.2,1.0);}',
    }, {
      attributes: ['position'], uniformsNames: [], uniformBuffersNames: [], samplers: [],
      defines: '#define VANAI_ASYNC_DISPOSAL_QA', processCodeAfterIncludes: captureCode(q.scene),
      extraInitializationsAsync: async () => { await gate; },
    });
    q.effects.push(new WeakRef(effect));
    const beforeDispose = [{ id: effect.uniqueId, disposed: effect.isDisposed,
      pipeline: !!effect._pipelineContext, ready: effect._isReady }];
    effect.dispose(); q.scene.dispose(); q.scene = null; engine.endFrame();
    const afterDispose = [{ id: effect.uniqueId, disposed: effect.isDisposed, pipeline: !!effect._pipelineContext }];
    q.scene = makeScene();
    const mesh = B.MeshBuilder.CreateBox('successor-box', { size: 1.1 }, q.scene);
    const material = new B.StandardMaterial('successor-material', q.scene);
    material.diffuseColor = new B.Color3(.7, .43, .24); mesh.material = material;
    await q.settle();
    return { barrelIdentityVerified: true, beforeDispose, afterDispose,
      successorReady: q.scene.isReady(), programsBeforeRelease: q.programsCreated };
  }, babylon);
  assert(report.setup.beforeDispose.length > 0);
  assert(report.setup.beforeDispose.every(effect => !effect.pipeline));
  assert(report.setup.afterDispose.every(effect => effect.disposed));
  report.afterRelease = await page.evaluate(async () => {
    const q = window.__asyncQA;
    q.release(); q.release = null;
    await q.frames(30); await q.settle();
    return {
      programsCreated: q.programsCreated,
      oldEffects: q.effects.map(ref => {
        const effect = ref.deref();
        return effect ? { id: effect.uniqueId, disposed: effect.isDisposed, ready: effect._isReady,
          pipeline: !!effect._pipelineContext, pipelineDisposed: effect._pipelineContext?._isDisposed ?? null,
          program: !!effect._pipelineContext?.program,
          spectorCallback: typeof effect._pipelineContext?.program?.__SPECTOR_rebuildProgram,
          inCache: Object.values(q.engine._compiledEffects).includes(effect) } : null;
      }),
      successorReady: q.scene.isReady(), cachedEffects: Object.keys(q.engine._compiledEffects).length,
    };
  });
  await page.screenshot({ path: path.join(out, 'successor.png') });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.discardConsoleEntries');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  report.afterGC = await page.evaluate(() => ({
    oldSceneAlive: !!window.__asyncQA.prior.deref(),
    oldEffectAlive: window.__asyncQA.effects.map(ref => !!ref.deref()),
  }));
  report.resurrected = report.afterRelease.oldEffects.some(effect =>
    effect?.disposed && effect.pipeline && effect.program && !effect.pipelineDisposed);
  if (baseline) {
    assert(report.resurrected, 'Baseline must reproduce disposed-effect native pipeline resurrection');
  } else {
    assert(!report.resurrected, 'Disposed effect must not create a live native pipeline');
    assert.equal(report.afterRelease.programsCreated, report.setup.programsBeforeRelease);
    assert.equal(report.afterGC.oldSceneAlive, false, 'Departed scene must collect');
    assert(report.afterGC.oldEffectAlive.every(alive => !alive), 'Disposed effect must collect');
  }
  assert(report.afterRelease.successorReady);
  report.shaderErrors = report.consoleErrors.filter(message =>
    /Unable to compile effect|Error compiling effect|SHADER ERROR|VALIDATE_STATUS false/i.test(message));
  assert.deepEqual(report.shaderErrors, [], 'No shader compilation failure');
  assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  // Preserve correctness evidence even if browser cleanup stalls.
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
