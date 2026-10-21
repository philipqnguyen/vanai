// Build one zone in the /?zone= preview, time its synchronous build, and record
// an order-independent fingerprint of what it produced: every mesh's geometry,
// colours, UVs, thin instances and transform; every collider list; and the
// gameplay queries (groundHeight with and without a previous height, isWalkable,
// collision) sampled over the zone and densely over its middle.
//
// For changes that must not change the world -- a faster lookup, a cache, a
// refactor. Fingerprint the zone on a server running the old code and on one
// running the new, then compare with zone_fingerprint_diff.py. See CITY-LOADING.md.
//
//   node tools/qa/zone_fingerprint.mjs <port> <zone> <out.json> [--profile]
//
// --profile also writes <out>.cpuprofile of the build (open it in Chrome DevTools).
import fs from "fs";
import { chromium, CHANNEL, GL_ARGS } from "./lib/playwright.mjs";
const [port, zone, out] = process.argv.slice(2);
const profile = process.argv.includes("--profile");
const browser = await chromium.launch({ ...CHANNEL, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message.slice(0, 300)));
const cdp = await page.context().newCDPSession(page);
// A first zone warms Vite's module transforms, so the timing below is the build.
await page.goto(`http://127.0.0.1:${port}/?zone=overseerslodge`, { waitUntil: "load", timeout: 300000 });
await page.waitForFunction(() => window.__zv, null, { timeout: 300000, polling: 100 });
if (profile) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?zone=${zone}`, { waitUntil: "commit", timeout: 300000 });
await page.waitForFunction(() => window.__zv, null, { timeout: 600000, polling: 50 });
const buildMs = Date.now() - t0;
if (profile) { const { profile: p } = await cdp.send("Profiler.stop"); fs.writeFileSync(out.replace(/\.json$/, ".cpuprofile"), JSON.stringify(p)); }
const fp = await page.evaluate(() => {
  const fnv = () => { let h = 2166136261 >>> 0; return { eat(arr) { const f = arr instanceof Float32Array ? arr : Float32Array.from(arr); const u = new Uint32Array(f.buffer, f.byteOffset, f.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } }, get v() { return h.toString(16).padStart(8, "0"); } }; };
  const zv = window.__zv, s = zv.scene;
  // Only what the synchronous build made: async model loads land later and in
  // a different order every run.
  const meshes = {};
  for (const m of s.meshes) {
    const p = m.getVerticesData?.("position");
    const h = fnv();
    if (p) h.eat(p);
    const ix = m.getIndices?.(); if (ix) h.eat(Float32Array.from(ix));
    const c = m.getVerticesData?.("color"); if (c) h.eat(c);
    const uv = m.getVerticesData?.("uv"); if (uv) h.eat(uv);
    if (m.thinInstanceCount) h.eat(m._thinInstanceDataStorage?.matrixData?.subarray(0, m.thinInstanceCount * 16) ?? []);
    if (!m.getVerticesData) continue;
    h.eat([m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z, m.scaling.x, m.scaling.y, m.scaling.z, m.isEnabled() ? 1 : 0]);
    (meshes[m.name] ??= []).push(h.v);
  }
  for (const k in meshes) meshes[k].sort();
  const lists = {};
  for (const [name, list] of [["colliders", zv.colliders], ["boxes", zv.boxColliders], ["circles", zv.circleColliders]]) {
    const h = fnv(); for (const c of list || []) h.eat(Object.values(c).filter(v => typeof v === "number")); lists[name] = [h.v, (list || []).length];
  }
  // Gameplay queries on a grid over the whole square, denser over the middle.
  const size = zv.shape ? Math.max(...zv.shape.pts.flat().map(Math.abs)) * 2 + 40 : 520;
  const pts = [];
  for (let i = 0; i < 110; i++) for (let j = 0; j < 110; j++) pts.push([-size / 2 + (i + .37) * size / 110, -size / 2 + (j + .61) * size / 110]);
  for (let i = 0; i < 90; i++) for (let j = 0; j < 90; j++) pts.push([-120 + (i + .29) * 240 / 90, -120 + (j + .53) * 240 / 90]);
  const ground = [], walk = [], blocked = [];
  for (const [x, z] of pts) {
    const g = zv.ground(x, z);
    ground.push(g, zv.ground(x, z, g), zv.ground(x, z, g + 3.2), zv.ground(x, z, g + 7.5));
    walk.push(zv.walkable(x, z) ? 1 : 0);
    blocked.push(zv.blocked(x, z) ? 1 : 0);
  }
  return { meshes, lists, ground, walk, blocked, meshCount: s.meshes.length };
});
const meshKeys = Object.keys(fp.meshes).sort();
const all = meshKeys.map(k => k + ":" + fp.meshes[k].join(",")).join("|");
let h = 2166136261 >>> 0; for (let i = 0; i < all.length; i++) { h ^= all.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
fs.writeFileSync(out, JSON.stringify({ zone, buildMs, errors, ...fp }));
console.log(JSON.stringify({ zone, port, buildMs, meshHash: h.toString(16), meshes: fp.meshCount, lists: fp.lists, errors: errors.length }));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]); process.exit(0);
