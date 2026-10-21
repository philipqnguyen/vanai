// The bestiary view -- /?bestiary, dev-only, no account and no server, like
// /?lineup. Every generated creature (creatures.ts) stands on a turntable,
// built by the game's own buildMonsterMesh, with a metre stick, its measured
// stats and a clip switcher. It exists for the same reason the lineup does: a
// creature is judged by looking at it in daylight, not by its numbers. (Until
// 2026-10-13 each stood beside the KayKit or Quaternius model it replaced;
// those are deleted, and BESTIARY.md keeps the comparison's numbers.)
//
//   /?bestiary                         every creature
//   /?bestiary&only=gnarlfang          one creature (or &only=<monster>), filling the frame
//   &clip=Walk                         a clip (Idle Walk Run Attack_A Attack_B Hit Death Cast Special Fly)
//   &view=three|side|front|back        camera angle; &spin=1 turns the turntables
//
// Crowd mode is the perf gate: N animated monsters walking circles, spread
// evenly over the creatures, or &zone=<key> for that zone's own camp mix, with
// the frame's cost read out (draw calls, frame time, JS heap, an estimate of
// GPU texture memory, bytes downloaded).
//
//   /?bestiary&crowd=30                (&zone=burnedland: the zone's mix)
//
// The read-out is mirrored on window.__bestiaryStats for scripted runs.
import "./style.css";
import {
  ArcRotateCamera, Vector3, DynamicTexture, MeshBuilder, StandardMaterial, Color3, Color4, Mesh,
  SceneInstrumentation, HemisphericLight, DirectionalLight, TransformNode,
} from "@babylonjs/core";
import { initEngine, buildLineupScene, engine, scene } from "./scene";
import { buildMonsterMesh, animateMonster, type MonsterNode } from "./entities";
import { MONSTERS, ZONES } from "./data";
import { CREATURE_MODEL, CREATURE_INDEX, CREATURE_LOOKS } from "./creatures";
import { playAnim } from "./models";

// A view turns the creatures, not the camera, so a pair stays side by side:
// the yaw each creature is given, the camera always in front of the row.
const VIEWS: Record<string, number> = { front: 0, three: -0.75, side: -Math.PI / 2, back: Math.PI, rthree: 0.75 };
const CLIPS = ["Idle", "Walk", "Run", "Attack_A", "Attack_B", "Hit", "Death", "Cast", "Special", "Fly"];

function daylight(): void {
  // the lineup's even light, warmed to an afternoon: sky, sun, grass
  scene.clearColor = Color4.FromHexString("#9cc3e6ff");
  for (const l of scene.lights) {
    if (l instanceof HemisphericLight) { l.intensity = 0.75; l.diffuse = Color3.FromHexString("#f2f6ff"); l.groundColor = Color3.FromHexString("#6b7a52"); }
    if (l instanceof DirectionalLight) { l.intensity = 2.1; l.diffuse = Color3.FromHexString("#fff1dc"); }
  }
  const g = scene.getMeshByName("lineup_ground");
  if (g?.material instanceof StandardMaterial) g.material.diffuseColor = Color3.FromHexString("#6f7f52");
}

function label(text: string, x: number, y: number, z = 0, w = 2.6): Mesh {
  const tex = new DynamicTexture(`lbl_${text}`, { width: 768, height: 96 }, scene, true);
  tex.hasAlpha = true;
  tex.drawText(text, null, 66, "bold 40px Alegreya Sans, sans-serif", "#1d2027", "transparent", true);
  const plane = MeshBuilder.CreatePlane(`lblp_${text}`, { width: w, height: w * 0.125 }, scene);
  const mat = new StandardMaterial(`lblm_${text}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0, 0, 0);
  mat.opacityTexture = tex;
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  plane.material = mat;
  plane.position.set(x, y, z);
  plane.billboardMode = Mesh.BILLBOARDMODE_Y;
  plane.isPickable = false;
  return plane;
}

/** A stick in half-metre bands, white and charcoal, as tall as needed. */
function metreStick(x: number, z: number, h: number): void {
  const a = new StandardMaterial("stick_a", scene); a.diffuseColor = Color3.FromHexString("#f4f1ea");
  const b = new StandardMaterial("stick_b", scene); b.diffuseColor = Color3.FromHexString("#2b2d33");
  const n = Math.ceil(h / 0.5);
  for (let i = 0; i < n; i++) {
    const seg = MeshBuilder.CreateBox(`stick_${x}_${i}`, { width: 0.06, depth: 0.06, height: 0.5 }, scene);
    seg.position.set(x, 0.25 + i * 0.5, z);
    seg.material = i % 2 ? b : a;
    seg.isPickable = false;
  }
  label(`${(n * 0.5).toFixed(1)} m`, x, n * 0.5 + 0.18, z, 1.2);
}

function kb(n: number): string { return `${Math.round(n / 1024)} KB`; }

/** The monsters to stand up: each creature's `show` monster (or `monster`),
 * filtered by `only` -- a creature key or a monster key. */
function showMonsters(only: string | null, monster: string | null): string[] {
  const out: string[] = [];
  for (const ck of Object.keys(CREATURE_INDEX).sort()) {
    const look = CREATURE_LOOKS.glbs[ck];
    const wearers = (look?.monsters || []).filter((m) => MONSTERS[m] && CREATURE_MODEL[m]?.creature === ck);
    if (!wearers.length) continue;
    if (only && only !== ck && !wearers.includes(only)) continue;
    const m = only && wearers.includes(only) ? only : monster && wearers.includes(monster) ? monster : wearers.includes(look.show) ? look.show : wearers[0];
    out.push(m);
  }
  return out;
}

export function runBestiary(canvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  initEngine(canvas, true);
  buildLineupScene();
  daylight();
  const crowd = parseInt(q.get("crowd") || "0", 10);
  if (crowd > 0) { runCrowd(canvas, crowd); return; }

  const only = q.get("only");
  const view = q.get("view") && q.get("view")! in VIEWS ? q.get("view")! : "three";
  const clip = q.get("clip") || "Idle";
  const spin = q.get("spin") === "1";
  // one stand per creature, shown as the monster it names (its `show`), or as
  // &monster=<key> -- any monster that wears it; &only= takes either key
  const keys = showMonsters(only, q.get("monster"));

  type Stand = { key: string; node: MonsterNode; pivot: TransformNode };
  const stands: Stand[] = [];
  let x = 0, maxH = 1;
  keys.forEach((k) => {
    const st = CREATURE_INDEX[CREATURE_MODEL[k].creature];
    // footprint across the row: the length when side-on, less when turned
    const turned = Math.abs(Math.sin(VIEWS[view]));
    const h = CREATURE_MODEL[k].h ?? st.height, sc = h / st.height;
    const w = Math.max((st.length * turned + st.width * (1 - turned) * 0.7) * sc, st.width * sc, 0.9);
    maxH = Math.max(maxH, h);
    const gap = w * 0.75 + 0.6;
    const cx = x + gap;
    const put = (px: number) => {
      const node = buildMonsterMesh(`bst_${k}`, k);
      const pivot = new TransformNode(`piv_${k}`, scene);
      pivot.position.set(px, 0, 0);
      pivot.rotation.y = VIEWS[view];
      node.root.parent = pivot;
      node.root.position.set(0, 0, 0);
      stands.push({ key: k, node, pivot });
    };
    put(cx);
    const name = MONSTERS[k].name;
    label(`${name}: ${st.tris[0]}/${st.tris[1]} tris · ${st.bones} bones · ${st.atlas}² · ${kb(st.bytes)}`, cx, h + 0.62, 0, Math.max(2.8, w * 1.3));
    metreStick(cx, -w * 0.6, h);
    x = cx + gap + 0.6;
  });
  const span = x;
  stands.forEach((s) => { s.pivot.position.x -= span / 2; });
  scene.meshes.filter((m) => m.name.startsWith("lblp_") || m.name.startsWith("stick_")).forEach((m) => { m.position.x -= span / 2; });

  // frame the whole row: wide enough for its span, tall enough for the tallest
  const radius = Math.max(span * 0.8, maxH * 2.0) + 0.6;
  const camera = new ArcRotateCamera("bst_cam", Math.PI / 2, 1.36, radius, new Vector3(0, maxH * 0.48, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 24;
  camera.lowerRadiusLimit = 1.2;
  camera.minZ = 0.05;

  let cur = clip;
  const at = q.get("at") !== null ? parseFloat(q.get("at")!) : null;
  const play = (c: string) => {
    cur = c;
    for (const s of stands) {
      if (!s.node.model) continue;
      const has = s.node.creature && c in s.node.creature.clips;
      const g = playAnim(s.node.model, [has ? c : "Idle"], true);
      if (g) {
        g.speedRatio = 1;
        // &at=0.4 freezes the clip at that fraction, to look at one pose
        // (blending off: a group paused mid-blend would hold the blend's start)
        if (at !== null) {
          s.node.model.groups.forEach((o) => { o.enableBlending = false; });
          const f = g.from + (g.to - g.from) * at;
          g.stop();
          g.start(false, 1, f, f + 0.01); // a one-frame clip that ends, and holds, on the pose
        }
      }
    }
  };

  // ---- controls ----
  const bar = document.createElement("div");
  bar.id = "lineup-bar";
  const setParam = (k: string, v: string): void => { const p = new URLSearchParams(location.search); if (v) p.set(k, v); else p.delete(k); location.search = p.toString(); };
  const row = (title: string, items: string[], sel: string, pick: (v: string) => void): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "lineup-row";
    wrap.innerHTML = `<span class="lineup-label">${title}</span>`;
    items.forEach((it) => {
      const b = document.createElement("button");
      b.textContent = it;
      b.className = it === sel ? "sel" : "";
      b.addEventListener("click", () => pick(it));
      wrap.appendChild(b);
    });
    return wrap;
  };
  const renderBar = () => {
    bar.innerHTML = "";
    bar.appendChild(row("Clip", CLIPS, cur, (v) => { play(v); renderBar(); }));
    bar.appendChild(row("View", Object.keys(VIEWS), view, (v) => setParam("view", v)));
    bar.appendChild(row("Spin", ["off", "on"], spin ? "on" : "off", (v) => setParam("spin", v === "on" ? "1" : "")));
    bar.appendChild(row("Creature", ["all", ...Object.keys(CREATURE_INDEX).sort()], only || "all", (v) => setParam("only", v === "all" ? "" : v)));
  };
  renderBar();
  document.body.appendChild(bar);

  // Once every model is in, fit the camera to what actually stands there: the
  // creatures come in all sizes, and a creature's caption is no measure.
  const zoom = parseFloat(q.get("zoom") || "1");
  const frame = () => {
    let lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const s of stands) {
      s.node.root.computeWorldMatrix(true);
      const { min, max } = s.node.root.getHierarchyBoundingVectors(true, (m) => m.isEnabled() && m.isVisible && !m.name.endsWith("_LOD1"));
      lo = Vector3.Minimize(lo, min); hi = Vector3.Maximize(hi, max);
    }
    if (!isFinite(lo.x)) return;
    const c = lo.add(hi).scale(0.5), ext = hi.subtract(lo);
    const fov = camera.fov, aspect = engine.getRenderWidth() / engine.getRenderHeight();
    const fit = Math.max(ext.x / (2 * Math.tan(fov / 2) * aspect), ext.y / (2 * Math.tan(fov / 2))) * 1.18 + ext.z * 0.5;
    camera.target = new Vector3(c.x, c.y, c.z);
    camera.radius = fit / zoom;
    // &focus=head&r=1.2: a portrait -- the camera on the new creature's head joint
    if (q.get("focus") === "head") {
      const st = stands[0];
      const head = st?.node.model?.root.getDescendants(false).find((n) => n.name === "head") as TransformNode | undefined;
      if (head) {
        head.computeWorldMatrix(true);
        camera.target = head.getAbsolutePosition().clone();
        camera.radius = parseFloat(q.get("r") || "1.5");
      }
    }
  };

  let started = false;
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!started && stands.every((s) => s.node.model)) { started = true; play(cur); frame(); }
    if (spin) stands.forEach((s) => { s.pivot.rotation.y += dt * 0.5; });
    scene.render();
  });
  // Ready once the clip is posed and framed and every material's textures are
  // in: a model attaches before its KTX2 atlas has transcoded, and a
  // screenshot taken then caught a dark, untextured body (round 2).
  (window as any).__bestiaryReady = () => started && stands.every((s) => s.node.model) && scene.isReady();
  (window as any).__bestiary = { stands, scene };
}

// ------------------------------------------------------------------ crowd: the perf gate
function runCrowd(canvas: HTMLCanvasElement, n: number): void {
  // the dev server's hundreds of modules fill the default 250-entry buffer
  // before a model loads, and the model fetches then go unrecorded
  performance.setResourceTimingBufferSize(20000);
  // &only=a,b limits the crowd to some creatures (keys or monsters);
  // &zone=<key> stands up that zone's own mix, every camp's monster times its
  // count (n is then the zone's total); otherwise the crowd is spread evenly
  // over every creature, one show monster each
  const q = new URLSearchParams(location.search);
  const pickOnly = q.get("only"), zoneKey = q.get("zone");
  let keys: string[];
  if (zoneKey && ZONES[zoneKey]) {
    keys = (ZONES[zoneKey].camps || []).flatMap((c: any) => Array.from({ length: c.count || 1 }, () => c.monster as string))
      .filter((k: string) => MONSTERS[k]);
    n = keys.length;
  } else {
    const all = pickOnly ? pickOnly.split(",").flatMap((o) => showMonsters(o, null)) : showMonsters(null, null);
    keys = all.length > n ? Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]) : all;
  }
  const cols = Math.ceil(Math.sqrt(n));
  const spacing = 4.5;
  const mobs: { node: MonsterNode; cx: number; cz: number; r: number; ph: number; mode: number }[] = [];
  for (let i = 0; i < n; i++) {
    const key = keys[i % keys.length];
    const node = buildMonsterMesh(`crowd_${i}`, key);
    const cx = (i % cols - (cols - 1) / 2) * spacing, cz = (Math.floor(i / cols) - (cols - 1) / 2) * spacing;
    node.root.position.set(cx, 0, cz);
    mobs.push({ node, cx, cz, r: 1.2, ph: i * 0.7, mode: i % 4 });
  }
  const camera = new ArcRotateCamera("crowd_cam", Math.PI / 2 - 0.5, 1.0, cols * spacing * 1.25 + 6, new Vector3(0, 0.8, 0), scene);
  camera.attachControl(canvas, true);
  const inst = new SceneInstrumentation(scene);
  inst.captureFrameTime = true;
  inst.captureRenderTime = true;
  const panel = document.createElement("pre");
  panel.style.cssText = "position:fixed;left:12px;top:12px;margin:0;padding:10px 14px;background:rgba(16,18,24,.82);color:#e8e4da;font:13px/1.45 ui-monospace,monospace;z-index:20;border-radius:6px";
  document.body.appendChild(panel);
  const frames: number[] = [];
  let last = performance.now(), lastPanel = 0;
  const t0 = performance.now();
  (window as any).__bestiary = { mobs, scene, engine };
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    mobs.forEach((m) => {
      // a cycle of walking, running, fighting and standing, staggered per mob
      const ph = (t * 0.2 + m.ph) % 4;
      const moving = ph < 2;
      const speed = ph < 1 ? 2.4 : 5.4;
      if (moving) {
        const a = t * speed / (m.r * 3) + m.ph;
        m.node.root.position.set(m.cx + Math.cos(a) * m.r, 0, m.cz + Math.sin(a) * m.r);
        m.node.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      }
      if (ph >= 2 && ph < 3 && m.node.attackUntil < t) m.node.attackUntil = t + 0.8 + (m.mode % 2) * 0.2;
      animateMonster(m.node, moving, dt, t, moving ? speed : 0);
    });
    scene.render();
    frames.push(engine.getDeltaTime());
    if (frames.length > 240) frames.shift();
    if (now - lastPanel > 1000) {
      lastPanel = now;
      const ready = mobs.filter((m) => m.node.model).length;
      // GPU texture memory, estimated from what is actually on the GPU: each
      // internal texture once (instances share them), RGBA8, a mip chain unless
      // it has none, six faces for a cube
      let tex = 0;
      const seen = new Set<any>();
      for (const it of engine.getLoadedTexturesCache()) {
        if (seen.has(it) || !it.width) continue;
        seen.add(it);
        // bytes per texel by GPU format: ASTC 4x4 / BC7 one byte, BC1 / ETC
        // half, anything uncompressed RGBA8 four. KTX2 textures carry their
        // mip chain, so a compressed one counts its mips too.
        const fmt = it.format as number;
        const bpp = fmt === 37808 || fmt === 36492 || fmt === 36493 || fmt === 33778 || fmt === 33779 ? 1
          : fmt === 33776 || fmt === 33777 || fmt === 37492 || fmt === 36196 ? 0.5 : 4;
        const mips = it.generateMipMaps || bpp < 4 ? 4 / 3 : 1;
        tex += it.width * it.height * bpp * mips * (it.isCube ? 6 : 1);
      }
      const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const models = res.filter((r) => r.name.includes("/models/"));
      const bytes = models.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0);
      const sorted = [...frames].sort((a, b) => a - b);
      const mem = (performance as any).memory;
      const stats = {
        set: "new", n, ready,
        drawCalls: inst.drawCallsCounter.current,
        frameMs: +inst.frameTimeCounter.lastSecAverage.toFixed(2),
        renderMs: +inst.renderTimeCounter.lastSecAverage.toFixed(2),
        deltaP50: +sorted[Math.floor(sorted.length * 0.5)]?.toFixed(2),
        deltaP95: +sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2),
        heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
        texMB: +(tex / 1048576).toFixed(1),
        modelKB: Math.round(bytes / 1024),
        modelFiles: models.length,
        meshes: scene.meshes.length,
        activeMeshes: scene.getActiveMeshes().length,
        skeletons: scene.skeletons.length,
      };
      (window as any).__bestiaryStats = stats;
      panel.textContent = Object.entries(stats).map(([k, v]) => `${k.padEnd(13)} ${v}`).join("\n");
    }
  });
}
