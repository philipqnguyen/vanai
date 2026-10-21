// Moonmere's fly-through regression (MOONMERE.md section 9, "QA scripts"; S5): EVERY LOD switch
// the shared instancer makes in the city, in both directions, day and night, against the Vite dev
// server -- with ZERO console errors, the instancer's own pool buffers checked at every camera
// position, scene.isReady() never lost to a city pool compiling, and back within READY_MS of every
// leg. Then the Moonmere Shores (MM-15, MM-16): the causeway's land end, its gate and the city
// seen across the water, built a step a frame.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_flythrough.mjs [moonmere moonmereshores] [daytime ...] [http://localhost:5173]
//   BROWSER=webkit WK_PLAYWRIGHT=/path/to/playwright ... (WebKit; default the system Chrome)
//
// Daytimes default to 0.2 and 0.6: at night the lamps, towers and public shells join the glow
// pass (moonmere_city.ts glowNightOnly) -- another effect every pool must compile.
//
// HOW "EVERY LOD SWITCH" IS PROVED. The page plans the city exactly as play does (planMoonmere,
// partPieces(L2), the pieces the instancer is handed) and keys its culling cells exactly as
// city-architecture.ts instance() does (a piece with its own distances in a cell of its own; the
// box its pieces' reach, the kit's cellHeight / reachHeight; the floor is 0, as moonmere_city.ts
// passes it), then measures each cell's level with city_pools.ts levelFor -- the instancer's own
// function. That copy is held to the instancer: its cell count must equal the instancer's own
// (cityStats.mm.cells) and its pools (city_pools.ts planPools, the kit's sky grid) the instancer's
// templates, one mesh each, or the run fails before it flies.
//
// Then THE INSTANCER'S OWN STATE IS READ AT EVERY STEP (S5 review). At each camera position the
// camera is first set 3 m aside in x and one frame drawn, then set at the position and a second
// frame drawn: lodPass runs when the camera has moved more than MOVE (1 m) in xz since its last
// pass, and from wherever its last pass was, one of those two frames is more than 1 m from it -- so
// the pass has certainly run at the position (and the camera's globalPosition, which the pass reads,
// is checked against it). Each pool's expected buffer is then computed from the copy (a piece shows
// if it is the skyline, or its planPools mask has the bit of its cell's level) and compared with the
// pool mesh: a pool with k pieces to show must be enabled with thinInstanceCount k, a pool with none
// disabled (city-architecture.ts refill). ANY mismatch, at any step, fails. A pool that stops
// switching after its first change, or switches at the wrong distance, or a cell whose box drifts
// from the copy's, is caught where it happens.
//
// The flight is: a street-level tour that passes INSIDE every cell's box (the cells ordered
// nearest-first from the arrival), a climb to 900 m and out past every cell's LOD2 and cull
// distance, and the same tour again in reverse -- so every cell goes 0 -> 1 -> 2 (-> culled) and
// back down 2 -> 1 -> 0, and a near-only cell (the dressing, mask 0b001, culled at 45 m) is
// emptied and refilled. The script also FAILS if any cell misses a transition its distances allow,
// if a pool the instancer holds never changed its instances (the backstop), on any console or page
// error, and on a leg after which isReady() does not come back within READY_MS.
//
// isReady() LOST FOR A FRAME. Every frame on which isReady() was false is counted, and the engine's
// unready effects named, with the meshes that draw with them. A not-ready frame on which a CITY
// POOL's effect (a mesh with metadata.city: the city's, the causeway's, the view's) is unready
// FAILS (FIRST_FILL, 0, would allow some on a leg's first fill). The rest are the world's, not the
// city's, and are reported by name, not failed (MOONMERE.md A-16 "Review fixes", O-16) -- MEASURED in the S5 review: the annex door's leaf
// ("arched oak leaf", "door join", moonmere/door.glb, a plain non-instanced PBR mesh) compiling
// an effect without INSTANCES the first time the furniture diet shows it near the Long Tower, one
// frame; and on the Shores the meadow trees' leaf shader (GTREE, a StandardMaterial), an effect no
// mesh draws with by the time it is named, 1-2 frames at most stops.
//
// Why it exists (the Capital's capital_flythrough.mjs, M1): a camera flown to an aerial view
// emptied every pool of a LOD level, and a tinted pool left at zero instances compiled
// `vColor *= instanceColor` with no instanceColor attribute -- "undeclared identifier", and
// scene.isReady() false for good. Moonmere's pools are tinted (tintWhite), its dressing is culled
// at 45 m, its towers switch at 60 / 220 m and the Long Tower's louvres at 140 m: each a level a
// pool is emptied at and refilled from.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { playwright, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const require = createRequire(import.meta.url);
const browserName = process.env.BROWSER || 'chromium';
const pw = browserName === 'webkit' && process.env.WK_PLAYWRIGHT ? require(process.env.WK_PLAYWRIGHT) : playwright;
const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const times = args.filter((a) => /^[0-9.]+$/.test(a));
const DAYTIMES = times.length ? times : ['0.2', '0.6'];
const zones = args.filter((a) => /^[a-z]+$/.test(a));
const KEYS = zones.length ? zones : ['moonmere', 'moonmereshores'];
const READY_MS = 20000;
// not-ready frames with a city pool's effect compiling allowed on a leg's first fill (the first street
// tour, the Shores' first stop). MEASURED 0 in the S5 review (Chromium, day and night), so 0: a pool
// that compiles in view fails. Raise it, with the measurement, only if a browser needs it
const FIRST_FILL = 0;
// metres between camera positions on a leg: well under every LOD distance (45 m), so no switch is
// stepped over without a frame drawn on each side of it
const STEP = 6;
const ROOT = new URL('../../', import.meta.url).pathname;
const LAYOUT = JSON.parse(fs.readFileSync(ROOT + 'client/src/moonmere-layout.json', 'utf8'));

// the Shores (MM-15, MM-16): [name, eye, target]; an eye y under 5 is metres over the ground there.
// The city across the water is the view (window.__zv.cityStats.mmv); the causeway's land end and
// the gate are the city kit's own pools (mm), with their own cells
const SHORES = [
  ['the meadow, the city out of sight', [0, 1.7, -60], [0, 3, 100]],
  ['the gate from the land, the city through it', [0, 1.7, -195], [0, 4, -300]],
  ['on the deck before the portal', [0, 2.5, -250], [-8, 12, -480]],
  ['the strand west of the causeway', [-60, 1.7, -232], [-10, 8, -470]],
  ['the crystal, where a return lands', [12, 1.7, -160], [-10, 10, -470]],
  ['the ferry pier', [-190, 1.7, -150], [-20, 10, -470]],
  ['over the shore, 30 m', [-60, 30, -100], [-8, 0, -460]],
  ['aerial 160 m', [140, 160, -120], [-8, 0, -480]],
  ['top-down 700 m over the water', [-8, 700, -420.1], [-8, 0, -420]],
  ['back down to the gate', [0, 1.7, -195], [0, 4, -300]],
  ['under the causeway\'s land-end arches', [14, 1.7, -268], [0, 2, -290]],
];

const launchOpts = browserName === 'chromium'
  ? { ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] }
  : { headless: true, ...(process.env.WK_EXE ? { executablePath: process.env.WK_EXE } : {}) };
const b = await pw[browserName].launch(launchOpts);
let failed = false;
const report = [];

// in the page: wait n rendered frames, sampling isReady() on each
const PAGE_HELPERS = () => {
  const zv = window.__zv, sc = zv.scene;
  const H = (window.__fly = window.__fly || { notReady: 0, frames: 0 });
  if (!H.hooked) {
    H.hooked = true;
    H.why = {}; H.cityNotReady = 0;
    const eng = sc.getEngine();
    sc.onAfterRenderObservable.add(() => {
      H.frames++;
      if (sc.isReady()) return;
      H.notReady++;
      // the engine's unready effects (scene.isReady's last test, areAllEffectsReady): which shader,
      // and which meshes draw with it (a submesh's draw wrapper per render pass)
      let city = false;
      for (const k in eng._compiledEffects) {
        const e = eng._compiledEffects[k];
        if (e.isReady()) continue;
        const nm = typeof e.name === 'string' ? e.name : (e.name?.vertex ?? e.name?.vertexElement ?? 'custom');
        const owners = new Set();
        for (const m of sc.meshes) for (const sm of m.subMeshes || []) for (const dw of sm._drawWrappers || []) if (dw && dw.effect === e) owners.add(m);
        const pools = [...owners].filter((m) => m.metadata?.city);
        if (pools.length) city = true;
        const tag = pools.length ? `${nm}: city pool ${pools[0].name}`
          : owners.size ? `${nm}: ${[...owners].slice(0, 2).map((m) => m.name).join(', ')}`
          : `${nm}${/\bGTREE\b/.test(e.defines || '') ? ' (meadow trees, GTREE)' : ''} (no mesh draws with it now)`;
        H.why[tag] = (H.why[tag] || 0) + 1;
      }
      if (city) H.cityNotReady++;
    });
  }
  H.frames_ = (n) => new Promise((res) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); res(); } }); });
  H.place = (eye, tgt) => {
    const cam = sc.activeCamera;
    const y = (x, z, h) => (h < 5 ? zv.ground(x, z) + h : h);
    cam.position.set(eye[0], y(eye[0], eye[2], eye[1]), eye[2]);
    cam.setTarget(new cam.position.constructor(tgt[0], y(tgt[0], tgt[2], tgt[1]), tgt[2]));
  };
  H.settle = async (readyMs) => {
    await H.frames_(10);
    const t0 = performance.now();
    while (!sc.isReady() && performance.now() - t0 < readyMs) await H.frames_(5);
    return { ready: sc.isReady(), ms: Math.round(performance.now() - t0) };
  };
};

for (const daytime of DAYTIMES) for (const zone of KEYS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await p.routeWebSocket?.('**', () => {});
  await p.goto(`${BASE}/?zone=${zone}&daytime=${daytime}`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  // every template in (the city's pools, and in the Shores the view's), so each pool has filled once
  await p.waitForFunction((keys) => keys.every((k) => { const s = window.__zv.cityStats?.[k]; return !s || !s.batches || s.templates >= s.batches; }),
    zone === 'moonmere' ? ['mm'] : ['mm', 'mmv'], { timeout: 120000, polling: 100 });
  await p.evaluate(PAGE_HELPERS);
  const rec = { zone, daytime, legs: [], errors: [] };
  const leg = (name, r) => {
    const ok = r.ready && !errors.length && !r.problems?.length;
    rec.legs.push({ name, ...r });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${zone} t=${daytime} ${name}: ready ${r.ready} (${r.ms} ms), not-ready frames ${r.notReady}/${r.frames}${r.cityNotReady !== undefined ? ` (${r.cityNotReady} with a city pool's effect compiling)` : ''}, ${errors.length} errors${r.note ? ', ' + r.note : ''}`);
    for (const pr of (r.problems || []).slice(0, 8)) console.log('     ', pr);
    if (!ok) failed = true;
  };

  if (zone === 'moonmere') {
    // the cells, keyed and boxed as city-architecture.ts instance() does, from the pieces play hands it
    const setup = await p.evaluate(async (L) => {
      const find = (n) => performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === `/src/${n}.ts`) ?? `/src/${n}.ts`;
      const { planMoonmere } = await import(find('zones/moonmere_plan'));
      const { partPieces, L2, MM_CITY_KIT: K } = await import(find('zones/moonmere_city'));
      const { levelFor, planPools } = await import(find('zones/city_pools'));
      const P = planMoonmere(L, { flightBodies: true });
      const pieces = partPieces(P, L2);
      const keyOf = (q) => (q.lod ? `${q.cell}@${q.lod.lod1}/${q.lod.lod2}/${q.lod.cull ?? ''}` : q.cell);
      const cells = new Map(), changing = new Set();
      for (const q of pieces) {
        if (!q.lods && !q.near && !q.mask && !q.lod) continue;   // the skyline: in no cell, never switched
        const key = keyOf(q);
        let c = cells.get(key);
        if (!c) {
          const own = q.lod ?? K.lod;
          c = { key, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: 0, y1: K.cellHeight, lod1: own.lod1, lod2: own.lod2, cull: q.lod?.cull ?? Infinity,
            // the levels its pieces can show at: a piece's mask (bit 0 = LOD0), its LOD files, or near (0b011)
            files: new Set() };
          cells.set(key, c);
        }
        const r = q.reach ?? K.reach;
        c.x0 = Math.min(c.x0, q.x - r); c.x1 = Math.max(c.x1, q.x + r);
        c.z0 = Math.min(c.z0, q.z - r); c.z1 = Math.max(c.z1, q.z + r);
        if (q.reach !== undefined) { c.y0 = Math.min(c.y0, q.y); c.y1 = Math.max(c.y1, q.y + (q.height ?? K.reachHeight ?? 21)); }
        for (const f of q.lods ?? [q.file]) c.files.add(f);
        // a file whose instances a level change can change: one not shown at every level (planBatches'
        // masks: a LOD file its own level bits, a near piece 0b011, a mask its own), or in a cell
        // that culls
        const masks = q.lods ? q.lods.map((f) => [f, q.lods.reduce((m, g, i) => (g === f ? m | (1 << i) : m), 0)]) : [[q.file, q.mask || (q.near ? 0b011 : 0b111)]];
        for (const [f, m] of masks) if (m !== 0b111 || c.cull < Infinity) changing.add(f);
      }
      const list = [...cells.values()];
      // the tour: nearest-first from the arrival, each stop the cell's centre at a height inside its box
      const stops = [], left = new Set(list.map((_, i) => i));
      let at = [8, 288];
      while (left.size) {
        let best = -1, bd = Infinity;
        for (const i of left) { const c = list[i], d = Math.hypot((c.x0 + c.x1) / 2 - at[0], (c.z0 + c.z1) / 2 - at[1]); if (d < bd) { bd = d; best = i; } }
        left.delete(best);
        const c = list[best], x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2;
        stops.push([x, z, best]);
        at = [x, z];
      }
      window.__flyCells = { list, levelFor, seen: list.map(() => new Set()), last: list.map(() => -1), stops, changing, lv: new Int8Array(list.length) };
      // the instancer's pools: every thin-instanced template of the city kit
      const pools = window.__zv.scene.meshes.filter((m) => m.metadata?.city === 'mm' && m.hasThinInstances !== undefined);
      // each pool's pieces as refill() reads them (planPools with the kit's grid: per piece its
      // cell, -1 for the skyline, and its level mask), matched to its mesh by file
      const index = new Map(list.map((c, i) => [c.key, i]));
      const fileOf = (m) => (m.name.match(/moonmere-cloister\/([^./]+)\.glb/) || [])[1];
      const byFile = new Map(pools.map((m) => [fileOf(m), m]));
      const plan = planPools({ pieces }, K.grid);
      const spec = plan.map((pp) => ({ file: pp.file, mesh: byFile.get(pp.file) ?? null,
        cell: Int32Array.from(pp.pieces, (x) => (x.lod ? index.get(keyOf(x.piece)) ?? -2 : -1)), mask: Uint8Array.from(pp.pieces, (x) => x.mask) }));
      const drift = [];
      const stats = window.__zv.cityStats.mm;
      if (list.length !== stats.cells) drift.push(`the copy keys ${list.length} cells, the instancer ${stats.cells}`);
      if (plan.length !== stats.batches) drift.push(`the copy plans ${plan.length} pools, the instancer ${stats.batches}`);
      if (pools.length !== plan.length || byFile.size !== pools.length) drift.push(`${pools.length} pool meshes (${byFile.size} files) for ${plan.length} planned pools`);
      for (const s of spec) {
        if (!s.mesh) drift.push(`pool ${s.file} has no mesh`);
        if (s.cell.some((c) => c === -2)) drift.push(`pool ${s.file} holds a switching piece in no copied cell`);
      }
      window.__flyPools = { pools, state: pools.map((m) => `${m.isEnabled()}|${m.thinInstanceCount}`), changed: pools.map(() => 0), spec, checks: 0, mismatches: 0, first: [] };
      return { cells: list.length, instancerCells: stats.cells, pools: pools.length, stops: stops.length, pieces: pieces.length, drift,
        dist: [...new Set(list.map((c) => `${c.lod1}/${c.lod2}/${c.cull}`))] };
    }, LAYOUT);
    console.log(`moonmere t=${daytime}: ${setup.pieces} pieces, ${setup.cells} switching cells (the instancer's: ${setup.instancerCells}; distances ${setup.dist.join(', ')}), ${setup.pools} pools`);
    rec.setup = setup;
    if (setup.drift.length) leg('the copy against the instancer', { ready: true, ms: 0, notReady: 0, frames: 0, problems: setup.drift });

    // one leg: move the camera along pts ([x, z, yAbove] or [x, y, z] with abs), STEP m at a time,
    // one frame at each, recording every cell's level as the instancer will compute it
    const fly = async (name, pts) => {
      const r = await p.evaluate(async ([pts, step, readyMs]) => {
        const H = window.__fly, C = window.__flyCells, Pl = window.__flyPools, zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
        const nr0 = H.notReady, f0 = H.frames, city0 = H.cityNotReady, mm0 = Pl.mismatches, ch0 = Pl.checks;
        // the camera position the LOD pass reads, as it reads it (its observer runs before this one)
        let seenAt = null;
        const ob = sc.onBeforeRenderObservable.add(() => { const g = cam.globalPosition; seenAt = [g.x, g.y, g.z]; });
        const at = ([x, z, h, abs]) => [x, abs ? h : zv.ground(x, z) + h, z];
        const look = (a, b) => [b[0] + (b[0] - a[0]) * 3, a[1] - 0.5, b[2] + (b[2] - a[2]) * 3];
        let prev = at(pts[0]);
        for (let i = 1; i < pts.length; i++) {
          const nxt = at(pts[i]), n = Math.max(1, Math.ceil(Math.hypot(nxt[0] - prev[0], nxt[1] - prev[1], nxt[2] - prev[2]) / step));
          for (let k = 1; k <= n; k++) {
            const t = k / n, e = [prev[0] + (nxt[0] - prev[0]) * t, prev[1] + (nxt[1] - prev[1]) * t, prev[2] + (nxt[2] - prev[2]) * t];
            const tg = look(prev, nxt);
            const aim = () => cam.setTarget(new cam.position.constructor(tg[0], Math.min(tg[1], e[1] - 0.2), tg[2] + 1e-3));
            // 3 m aside, a frame; then at e, a frame: the pass has run at e (header)
            cam.position.set(e[0] + 3, e[1], e[2]); aim();
            await H.frames_(1);
            cam.position.set(e[0], e[1], e[2]); aim();
            await H.frames_(1);
            if (!seenAt || Math.abs(seenAt[0] - e[0]) + Math.abs(seenAt[1] - e[1]) + Math.abs(seenAt[2] - e[2]) > 1e-3) {
              Pl.mismatches++; if (Pl.first.length < 8) Pl.first.push(`the LOD pass read the camera at ${seenAt?.map((v) => v.toFixed(2))}, set at ${e.map((v) => v.toFixed(2))}`);
            }
            for (let c = 0; c < C.list.length; c++) {
              const l = C.levelFor(C.list[c], e[0], e[1], e[2]);
              C.lv[c] = l;
              if (l !== C.last[c]) { if (C.last[c] >= 0) C.seen[c].add(`${C.last[c]}>${l}`); C.last[c] = l; }
            }
            // every pool against what its cells now show (refill: k shown -> enabled, k instances; 0 -> disabled)
            Pl.checks++;
            for (const s of Pl.spec) {
              if (!s.mesh) continue;
              let k = 0;
              for (let i = 0; i < s.cell.length; i++) { const ci = s.cell[i]; if (ci < 0 || (s.mask[i] & (1 << C.lv[ci]))) k++; }
              const on = s.mesh.isEnabled(), n = s.mesh.thinInstanceCount;
              if (on !== k > 0 || (k > 0 && n !== k)) {
                Pl.mismatches++;
                if (Pl.first.length < 8) Pl.first.push(`pool ${s.file} at (${e.map((v) => v.toFixed(1)).join(', ')}): expected ${k ? k + ' instances' : 'disabled'}, has ${on ? n + ' instances' : 'disabled'}`);
              }
            }
            Pl.pools.forEach((m, j) => { const s = `${m.isEnabled()}|${m.thinInstanceCount}`; if (s !== Pl.state[j]) { Pl.state[j] = s; Pl.changed[j]++; } });
          }
          prev = nxt;
        }
        sc.onBeforeRenderObservable.remove(ob);
        const s = await H.settle(readyMs);
        const bad = Pl.mismatches - mm0;
        return { ...s, notReady: H.notReady - nr0, frames: H.frames - f0, cityNotReady: H.cityNotReady - city0,
          note: `instancer state checked at ${Pl.checks - ch0} positions x ${Pl.spec.length} pools: ${bad} mismatches`,
          problems: bad ? Pl.first.splice(0) : [] };
      }, [pts, STEP, READY_MS]);
      // a pool compiling fails, but on the first tour, as the pools first fill
      const allowed = firstFill ? FIRST_FILL : 0;
      if (r.cityNotReady > allowed) r.problems.push(`${r.cityNotReady} not-ready frames with a city pool's effect compiling (allowed ${allowed})`);
      firstFill = false;
      leg(name, r);
    };
    let firstFill = true;
    const stopsPts = await p.evaluate(() => window.__flyCells.stops.map(([x, z]) => [x, z, 1.7]));
    const first = stopsPts[0], last = stopsPts[stopsPts.length - 1];
    await p.evaluate(([x, z]) => window.__fly.place([x, 1.7, z], [x, 1.7, z + 10]), [8, 288]);
    await p.evaluate(() => window.__fly.frames_(3));
    await fly(`street tour through all ${setup.stops} cells, nearest-first from the arrival`, [[8, 288, 1.7], ...stopsPts]);
    await fly('up and out: 900 m over the island, then 1.4 km off it (every cell LOD2 or culled)', [last, [last[0], last[1], 120, true], [4, 34, 900, true], [-1400, 34, 600, true]]);
    await fly('back in and the tour reversed (every cell back down to LOD0)', [[-1400, 34, 600, true], [4, 34, 300, true], [last[0], last[1], 60, true], ...stopsPts.slice().reverse()]);
    await fly('out along the causeway to the portal, then a low pass round the coast', [first, [8, 262, 1.7], [8, 300, 1.7], [8, 330, 6, true], [180, 60, 12, true], [60, -150, 12, true], [-180, -20, 12, true], [-150, 240, 12, true], [8, 300, 6, true]]);

    // what the flight covered, against what each cell's distances allow
    const cov = await p.evaluate(() => {
      const C = window.__flyCells, Pl = window.__flyPools, problems = [];
      let transitions = 0;
      const need = (c) => {
        // the levels the cell's distances allow as the camera goes from inside it to infinity
        // (levelFor: the cull first, then lod1, then lod2)
        const ls = [0];
        if (c.cull <= c.lod1) ls.push(3);
        else {
          ls.push(1);
          if (c.cull <= c.lod2) { if (c.cull < Infinity) ls.push(3); }
          else { if (c.lod2 < Infinity) ls.push(2); if (c.cull < Infinity) ls.push(3); }
        }
        const out = [];
        for (let i = 1; i < ls.length; i++) out.push(`${ls[i - 1]}>${ls[i]}`, `${ls[i]}>${ls[i - 1]}`);
        return out;
      };
      C.list.forEach((c, i) => {
        transitions += C.seen[i].size;
        const miss = need(c).filter((t) => !C.seen[i].has(t));
        if (miss.length) problems.push(`cell ${c.key} (${c.lod1}/${c.lod2}/${c.cull}) never made ${miss.join(', ')}`);
      });
      const still = Pl.pools.map((m, j) => [m.name, Pl.changed[j]]).filter(([, n]) => n === 0);
      return { transitions, cells: C.list.length, problems, poolsChanged: Pl.pools.length - still.length, pools: Pl.pools.length, stillPools: still.map(([n]) => n) };
    });
    // a pool none of whose pieces a level change can change (the skyline, or shown at every level
    // in a cell that never culls) is allowed to stay still
    const skylineOnly = await p.evaluate(() => {
      const files = window.__flyCells.changing;
      return window.__flyPools.pools.filter((m) => { const f = (m.name.match(/moonmere-cloister\/([^./]+)\.glb/) || [])[1] ?? m.name; return !files.has(f); }).map((m) => m.name);
    });
    const stuck = cov.stillPools.filter((n) => !skylineOnly.includes(n));
    const problems = [...cov.problems, ...stuck.map((n) => `pool ${n} switches but never changed its instances`)];
    leg(`coverage: ${cov.transitions} level transitions over ${cov.cells} cells; ${cov.poolsChanged} of ${cov.pools} pools refilled (${skylineOnly.length} never switch)`,
      { ready: true, ms: 0, notReady: 0, frames: 0, problems });
    rec.coverage = { ...cov, skylineOnly, stuck };
  } else {
    // the Shores: the stops, with the view's and the causeway's pools counted, then a dolly out and back
    // (the same rule as the city's: a not-ready frame with a city pool's effect compiling -- the
    // causeway's or the view's pools -- fails, but at the first stop, where they first draw)
    let first = true;
    const poolRule = (r) => {
      const allowed = first ? FIRST_FILL : 0;
      first = false;
      r.problems = r.cityNotReady > allowed ? [`${r.cityNotReady} not-ready frames with a city pool's effect compiling (allowed ${allowed})`] : [];
      return r;
    };
    for (const [name, eye, tgt] of SHORES) {
      const r = await p.evaluate(async ([eye, tgt, readyMs]) => {
        const H = window.__fly; const nr0 = H.notReady, f0 = H.frames, city0 = H.cityNotReady;
        H.place(eye, tgt);
        const s = await H.settle(readyMs);
        const cs = window.__zv.cityStats;
        return { ...s, notReady: H.notReady - nr0, frames: H.frames - f0, cityNotReady: H.cityNotReady - city0, note: `templates in: the causeway's ${cs?.mm?.templates}, the view's ${cs?.mmv?.templates}` };
      }, [eye, tgt, READY_MS]);
      leg(name, poolRule(r));
    }
    const r = await p.evaluate(async ([readyMs, step]) => {
      const H = window.__fly, zv = window.__zv, cam = zv.scene.activeCamera; const nr0 = H.notReady, f0 = H.frames, city0 = H.cityNotReady;
      // from the gate out over the causeway to the city's Landing, up to 600 m, and back
      const pts = [[0, zv.ground(0, -195) + 1.7, -195], [0, 3, -380], [-8, 40, -560], [-8, 600, -420], [0, 30, -250], [0, zv.ground(0, -195) + 1.7, -195]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i], n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / step);
        for (let k = 1; k <= n; k++) {
          const t = k / n; cam.position.set(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t);
          cam.setTarget(new cam.position.constructor(-8, 5, -470));
          await H.frames_(1);
        }
      }
      const s = await H.settle(readyMs);
      return { ...s, notReady: H.notReady - nr0, frames: H.frames - f0, cityNotReady: H.cityNotReady - city0 };
    }, [READY_MS, STEP]);
    leg('dolly: the gate, along the deck to the Landing, up 600 m and back', poolRule(r));
  }
  rec.notReadyWhy = await p.evaluate(() => window.__fly?.why ?? {});
  if (Object.keys(rec.notReadyWhy).length) console.log(`    ${zone} t=${daytime} unready effects on not-ready frames: ${Object.entries(rec.notReadyWhy).map(([k, v]) => `${k} x${v}`).join(', ')}`);
  rec.errors = [...new Set(errors)];
  for (const e of rec.errors.slice(0, 5)) console.log('   ', e);
  report.push(rec);
  await ctx.close();
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(report, null, 1));
// (b.close() can hang with the system Chrome channel: give it 5 s, then exit)
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
