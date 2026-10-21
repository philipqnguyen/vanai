// Dungeon kit v2: the one-page demo (client/dungeon-kit.html, dev only).
//
//   http://localhost:5176/dungeon-kit.html            free camera, all eleven themes
//   http://localhost:5176/dungeon-kit.html?theme=keep start in one theme's hall
//   http://localhost:5176/dungeon-kit.html?shoot      render the contact sheet
//                                                      (window.__kitSheet, a PNG data URL)
//
// Each theme gets the same small plan (a 28 x 20 m hall, a corridor through a
// doorway to a back room, a side corridor) built ONLY with the kit: the shell
// (floors, walls, doorways, pilasters, ceilings, sconces), two windows with a
// backdrop card, a stair up to a gallery, piers, braziers, props, flames,
// light pools and lamp slots, culled by room. No game scene: it makes its own
// engine, lights, tone mapping and glow layer to match scene.ts's dungeons.
import { Color3, Color4, ColorCurves, DynamicTexture, Engine, GlowLayer, HDRCubeTexture, HemisphericLight, DirectionalLight, ImageProcessingConfiguration, MeshBuilder, Scene, StandardMaterial, UniversalCamera, Vector3 } from '@babylonjs/core';
import { DungeonKit, THEMES, planGroups, emitterSelector, brazier, pier, stairFlight, galleryEdge, box, type KitLayout, type ThemePreset, type BackdropSlot } from './index.ts';

const SPACING = 30; // cells between themes (120 m)

function demoLayout(k: number): KitLayout {
  const o = k * SPACING;
  return {
    cell: 4,
    rooms: [
      { id: 'hall', name: 'Hall', x: o - 3, z: 0, w: 7, d: 5, kind: 'hall', y: 0 },
      { id: 'back', name: 'Back room', x: o - 2, z: 9, w: 5, d: 3, kind: 'store', y: 0 },
    ],
    corridors: [[[o, 4], [o, 9]], [[o - 3, 2], [o - 7, 2]]],
  };
}

function buildTheme(scene: Scene, glow: GlowLayer, t: ThemePreset, k: number): { kit: DungeonKit; ready: Promise<void>; cam: { pos: Vector3; look: Vector3 } } {
  const plan = planGroups(demoLayout(k));
  const kit = new DungeonKit(scene, t, plan, { prefix: `demo${k}`, glow });
  const ox = k * SPACING * 4;
  const r = kit.shell({
    windows: (e, g) => g.id === 'hall' && e.dx === -1 && (e.j === 1 || e.j === 3) ? { kind: t.key === 'watchtower' || t.key === 'beaconfort' ? 'slit' : 'arch' } : null,
  });
  const fr = t.arch.framed, h = t.arch.wallHeight;
  kit.build('hall', (p) => {
    // a pair of piers on the axis, the kind the theme would use
    for (const s of [-1, 1]) pier(p, { kind: fr ? 'timber' : t.key === 'tomb' || t.key === 'keep' ? 'cluster' : t.key === 'ballroom' ? 'round' : 'square', w: fr ? 0.5 : 1.1, h, x: ox + s * 6, z: 9 });
    // a stair against the east wall up to a gallery
    const sx = ox + 13.15 - 1.4;
    p.at(sx, 0, 1, 0, () => stairFlight(p, { w: 2.4, run: 7, rise: 3.6, rails: 'left' }));
    box(p.g('floor'), sx - 1.2, 3.42, 8, ox + 13.15, 3.6, 16, 0.02);
    box(p.g('wall'), sx - 1.2, 0, 8, ox + 13.15, 3.42, 16.6, 0, ['py']);
    p.at(sx - 1.2, 3.6, 12, -Math.PI / 2, () => galleryEdge(p, { len: 8 }));
  });
  // braziers: built in the hall, their seats become fires
  for (const s of [-1, 1]) {
    let seat: [number, number, number] = [0, 0, 0];
    kit.build('hall', (p) => p.at(ox + s * 4, 0, 9, 0, () => { const q = brazier(p); if (p.detail) seat = q; }));
    kit.fire('hall', seat, { size: 1.6 });
  }
  // props: the theme's list, along the west wall and the back corners
  const spots: [number, number, number][] = [[-11.5, 15.5, 0.4], [-12.2, 9, Math.PI / 2], [-9, 15.8, 0], [-5.5, 15.6, 0.2], [5, 15.7, 0], [-12.2, 6, Math.PI / 2], [8.5, 0.5, Math.PI], [-6, 1.5, 2.1], [2.5, 15.5, 0.3], [-3, 12, 0.7], [7.5, 6, 1.2]];
  t.props.forEach((file, i) => { const s = spots[i % spots.length]; kit.props.place({ file, group: 'hall', x: ox + s[0], y: 0, z: s[1], yaw: s[2] }); });
  // a backdrop card in each window slot (here a painted sky; a dungeon puts its view there)
  for (const w of r.windows) backdropCard(scene, w, t);
  const ready = kit.finish();
  return { kit, ready, cam: { pos: new Vector3(ox - 1.5, 3.3, -0.7), look: new Vector3(ox + 1, 3.6, 14) } };
}

function backdropCard(scene: Scene, s: BackdropSlot, t: ThemePreset): void {
  const m = MeshBuilder.CreatePlane('demo_backdrop', { width: s.w + 1.2, height: s.h + 1.2 }, scene);
  m.position.set(s.center[0] + s.normal[0] * 0.6, s.center[1], s.center[2] + s.normal[2] * 0.6);
  m.rotation.y = Math.atan2(s.normal[0], s.normal[2]);
  const tex = new DynamicTexture('demo_sky', { width: 64, height: 128 }, scene, false), ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  const open = t.key === 'watchtower' || t.key === 'beaconfort';
  g.addColorStop(0, open ? '#9cc0d8' : '#3a5a72'); g.addColorStop(0.7, open ? '#d8dccc' : '#6a7c86'); g.addColorStop(1, open ? '#7a8a6a' : '#2a3a3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128); tex.update();
  const mat = new StandardMaterial('demo_sky_m', scene);
  mat.disableLighting = true; mat.emissiveTexture = tex; mat.diffuseColor = Color3.Black(); mat.backFaceCulling = false;
  m.material = mat; m.isPickable = false;
}

export async function runKitDemo(canvas: HTMLCanvasElement): Promise<void> {
  const params = new URLSearchParams(location.search), shoot = params.has('shoot');
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  // the dungeon look of scene.ts buildZone: glow 0.5, env 0.45, ACES + curves, contrast, vignette
  const glow = new GlowLayer('glow', scene); glow.intensity = 0.5; emitterSelector(glow);
  scene.environmentTexture = new HDRCubeTexture('/env/sky_1k.hdr', scene, 128, false, true, false, true);
  scene.environmentIntensity = 0.45;
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true; ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  const curves = new ColorCurves(); curves.globalSaturation = 34; curves.highlightsHue = 30; curves.highlightsDensity = 18;
  ipc.colorCurves = curves; ipc.colorCurvesEnabled = true; ipc.contrast = 1.18; ipc.exposure = 1.06;
  ipc.vignetteEnabled = true; ipc.vignetteWeight = 1.05; ipc.vignetteColor = Color4.FromHexString('#141a2eff');
  scene.fogMode = Scene.FOGMODE_EXP2;
  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
  hemi.diffuse = Color3.FromHexString('#aab2d4');
  const sun = new DirectionalLight('celestial', new Vector3(-0.4, -1, 0.3), scene); sun.intensity = 0.32; sun.diffuse = Color3.FromHexString('#bcc6e8');

  const themes = Object.values(THEMES), built = themes.map((t, k) => ({ t, ...buildTheme(scene, glow, t, k) }));
  const look = (i: number) => {
    const b = built[i];
    hemi.intensity = b.t.hemi; hemi.groundColor = Color3.FromHexString(b.t.hemiGround);
    scene.fogColor = Color3.FromHexString(b.t.fog.color); scene.fogDensity = b.t.fog.density;
    scene.clearColor = Color4.FromHexString(b.t.clear + 'ff');
    cam.position.copyFrom(b.cam.pos); cam.setTarget(b.cam.look);
    for (const x of built) x.kit.invalidate();
  };
  const cam = new UniversalCamera('kit_cam', Vector3.Zero(), scene);
  cam.minZ = 0.1; cam.fov = 1.05; cam.speed = 0.8;
  cam.attachControl(canvas, true);
  const start = Math.max(0, themes.findIndex((t) => t.key === params.get('theme')));
  look(start);
  (window as unknown as Record<string, unknown>).__kitDemo = { scene, built, look, stats: () => built.map((b) => ({ theme: b.t.key, ...b.kit.stats() })) };
  window.addEventListener('keydown', (e) => { const n = Number(e.key); if (e.key >= '0' && e.key <= '9') look(n === 0 ? 9 : n - 1); if (e.key === '-') look(10); });
  window.addEventListener('resize', () => engine.resize());
  if (!shoot) { engine.runRenderLoop(() => scene.render()); return; }

  // the contact sheet: each theme's hall from its door, one tile each
  await new Promise((r) => setTimeout(r, 300));
  await Promise.all(built.map((b) => b.ready.catch(() => undefined)));
  await scene.whenReadyAsync();
  const TW = 800, TH = 500, cols = 4, rows = Math.ceil(built.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = TW * cols; sheet.height = TH * rows;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  const eng = engine as unknown as { _drawCalls: { fetchNewFrame(): void; current: number } };
  const counts: Record<string, number> = {};
  for (let i = 0; i < built.length; i++) {
    look(i);
    for (let f = 0; f < 12; f++) scene.render();
    await scene.whenReadyAsync();
    for (let f = 0; f < 4; f++) scene.render();
    eng._drawCalls.fetchNewFrame(); scene.render(); counts[built[i].t.key] = eng._drawCalls.current;
    const img = await new Promise<HTMLImageElement>((res) => { const im = new Image(); im.onload = () => res(im); im.src = canvas.toDataURL('image/png'); });
    const x = (i % cols) * TW, y = Math.floor(i / cols) * TH;
    ctx.drawImage(img, x, y, TW, TH);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y + TH - 34, TW, 34);
    ctx.fillStyle = '#f2ead8'; ctx.font = '600 18px sans-serif';
    ctx.fillText(`${built[i].t.name}  (${built[i].t.dungeon})  ${counts[built[i].t.key]} draws`, x + 12, y + TH - 11);
  }
  (window as unknown as Record<string, unknown>).__kitCounts = counts;
  (window as unknown as Record<string, unknown>).__kitSheet = sheet.toDataURL('image/png');
}
