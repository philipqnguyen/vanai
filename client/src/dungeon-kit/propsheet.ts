// Dungeon props: the contact sheet (client/prop-sheet.html, dev only).
//
// Every prop alone in a corner of a dungeon room at the scale a dungeon uses
// it: a flagged floor and an ashlar wall from the kit's sheets, the theme's
// hemisphere, fog and tone mapping (the kit demo's copy of scene.ts's dungeon
// look), and one lamp of the theme's colour where a sconce would hang. The
// camera frames each prop's bounds; a 1 m post (halves dark and light)
// stands beside it. Props draw through PropPools, the game's own path, so the
// sheet shows exactly what a dungeon draws: CC0 files raw (only those still on
// disk: the replaced ones are deleted, DUNGEON-PROPS.md), a CC0 file with
// `>` through the swap table, `dp:<id>` an original by id.
//
//   /prop-sheet.html?items=props/Barrel.gltf,props/Barrel.gltf>,dp:cask_oak&theme=lodge&cols=6
//   window.__propSheetItems = [{ item, scale?, label? }]   set before the page loads
//   &shoot  -> window.__propSheet (PNG data URL), window.__propSheetInfo
import { Color3, Color4, ColorCurves, Engine, GlowLayer, HDRCubeTexture, HemisphericLight, DirectionalLight, ImageProcessingConfiguration, MeshBuilder, PointLight, Scene, StandardMaterial, Texture, UniversalCamera, Vector3, type Mesh } from '@babylonjs/core';
import { PropPools } from './instances.ts';
import { THEMES } from './themes.ts';
import { emitterSelector } from './glow.ts';

export interface SheetItem { item: string; scale?: number; label?: string; yaw?: number }

const SPACING = 40;

export async function runPropSheet(canvas: HTMLCanvasElement): Promise<void> {
  const params = new URLSearchParams(location.search), shoot = params.has('shoot');
  const W = window as unknown as Record<string, unknown>;
  const items: SheetItem[] = (W.__propSheetItems as SheetItem[] | undefined) ?? (params.get('items') ?? 'props/Barrel.gltf').split(',').map((item) => ({ item }));
  const theme = THEMES[params.get('theme') ?? 'tomb'] ?? THEMES.tomb;
  const cols = Number(params.get('cols') ?? 6), TW = Number(params.get('tw') ?? 360), TH = Number(params.get('th') ?? 300);

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  const glow = new GlowLayer('glow', scene); glow.intensity = 0.5; emitterSelector(glow);
  scene.environmentTexture = new HDRCubeTexture('/env/sky_1k.hdr', scene, 128, false, true, false, true);
  scene.environmentIntensity = 0.45;
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true; ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  const curves = new ColorCurves(); curves.globalSaturation = 34; curves.highlightsHue = 30; curves.highlightsDensity = 18;
  ipc.colorCurves = curves; ipc.colorCurvesEnabled = true; ipc.contrast = 1.18; ipc.exposure = 1.06;
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogColor = Color3.FromHexString(theme.fog.color); scene.fogDensity = theme.fog.density;
  scene.clearColor = Color4.FromHexString(theme.fog.color + 'ff');
  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
  hemi.diffuse = Color3.FromHexString('#aab2d4'); hemi.intensity = theme.hemi; hemi.groundColor = Color3.FromHexString(theme.hemiGround);
  const sun = new DirectionalLight('celestial', new Vector3(-0.4, -1, 0.3), scene); sun.intensity = 0.32; sun.diffuse = Color3.FromHexString('#bcc6e8');
  const lamp = new PointLight('lamp', Vector3.Zero(), scene);
  lamp.diffuse = Color3.FromHexString(theme.lamp.color); lamp.intensity = theme.lamp.intensity; lamp.range = theme.lamp.range;

  // the corner: a flagged floor and an ashlar wall behind, moved to each tile
  const sheetMat = (sheet: string, period: number, tint: string) => {
    const m = new StandardMaterial(`ps_${sheet}`, scene), t = new Texture(`/tex/dungeon/${sheet}_diff.jpg`, scene), n = new Texture(`/tex/dungeon/${sheet}_nor_gl.jpg`, scene);
    t.uScale = t.vScale = n.uScale = n.vScale = 12 / period;
    m.diffuseTexture = t; m.bumpTexture = n; m.diffuseColor = Color3.FromHexString(tint); m.specularColor = new Color3(0.05, 0.05, 0.05);
    return m;
  };
  const floor = MeshBuilder.CreateGround('ps_floor', { width: 12, height: 12 }, scene);
  floor.material = sheetMat('flags', 4, theme.surfaces.floor.tint);
  const wall = MeshBuilder.CreatePlane('ps_wall', { width: 12, height: 12 }, scene);
  wall.material = sheetMat('ashlar', 4, theme.surfaces.wall.tint);
  const post: Mesh[] = [0, 1].map((k) => {
    const b = MeshBuilder.CreateBox(`ps_post${k}`, { width: 0.04, depth: 0.04, height: 0.5 }, scene);
    const m = new StandardMaterial(`ps_postm${k}`, scene); m.diffuseColor = k ? new Color3(0.85, 0.85, 0.8) : new Color3(0.08, 0.08, 0.08); m.emissiveColor = m.diffuseColor.scale(0.35);
    b.material = m; return b;
  });

  const pools = new PropPools(scene, '/models/', theme.key);
  items.forEach((it, i) => {
    const file = it.item.endsWith('>') ? it.item.slice(0, -1) : it.item;
    pools.place({ file, group: `t${i}`, x: i * SPACING, y: 0, z: 0, yaw: it.yaw ?? 0, scale: it.scale ?? 1, raw: !it.item.endsWith('>') && !file.startsWith('dp:') });
  });
  await pools.load();
  // tile -> which pool meshes hold its instance: show only that tile's group
  const tiles = items.map((_, i) => `t${i}`);
  const show = (i: number | null) => pools.update(i === null ? null : { visible: new Set([tiles[i]]), near: new Set([tiles[i]]) });

  const cam = new UniversalCamera('ps_cam', new Vector3(0, 1.5, -4), scene);
  cam.minZ = 0.05; cam.fov = 0.6;
  const info: Record<string, unknown>[] = [];
  const frame = (i: number) => {
    show(i);
    // bounds of whatever is drawn for this tile
    let lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity), tris = 0;
    for (const m of pools.meshes) {
      if (!m.isEnabled() || !m.thinInstanceCount) continue;
      m.thinInstanceRefreshBoundingInfo(false);
      const bb = m.getBoundingInfo().boundingBox;
      lo = Vector3.Minimize(lo, bb.minimumWorld); hi = Vector3.Maximize(hi, bb.maximumWorld);
      tris += (m.getTotalIndices() / 3) * m.thinInstanceCount;
    }
    if (!isFinite(lo.x)) { lo = new Vector3(i * SPACING - 0.5, 0, -0.5); hi = new Vector3(i * SPACING + 0.5, 1, 0.5); }
    const c = lo.add(hi).scale(0.5), size = hi.subtract(lo), r = Math.max(0.35, size.length() / 2);
    const ox = i * SPACING;
    floor.position.set(ox, 0, 2); wall.position.set(ox, 6, Math.max(hi.z, 0) + 1.2);
    post[0].position.set(Math.max(hi.x, ox) + 0.25, 0.25, c.z); post[1].position.set(Math.max(hi.x, ox) + 0.25, 0.75, c.z);
    // three-quarter view from the front left, a little above
    const dist = r / Math.sin(cam.fov / 2) * 1.02, az = -0.6, el = 0.32;
    cam.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, c.y + Math.sin(el) * dist, c.z - Math.cos(az) * Math.cos(el) * dist);
    cam.setTarget(c);
    lamp.position.set(c.x - 1.6, Math.max(2.2, hi.y + 1.2), c.z - 1.8);
    return { size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)), tris: Math.round(tris) };
  };

  W.__propSheetScene = { scene, pools, frame, show };
  if (!shoot) {
    let i = 0; frame(0);
    window.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') frame(i = (i + 1) % items.length); if (e.key === 'ArrowLeft') frame(i = (i + items.length - 1) % items.length); });
    engine.runRenderLoop(() => scene.render());
    return;
  }
  engine.setSize(TW * 2, TH * 2);
  await scene.whenReadyAsync();
  const rows = Math.ceil(items.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = TW * cols; sheet.height = TH * rows;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < items.length; i++) {
    const f = frame(i);
    for (let k = 0; k < 10; k++) scene.render();
    await scene.whenReadyAsync();
    for (let k = 0; k < 3; k++) scene.render();
    const img = await new Promise<HTMLImageElement>((res) => { const im = new Image(); im.onload = () => res(im); im.src = canvas.toDataURL('image/png'); });
    const x = (i % cols) * TW, y = Math.floor(i / cols) * TH;
    ctx.drawImage(img, x, y, TW, TH);
    const label = items[i].label ?? items[i].item;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y + TH - 40, TW, 40);
    ctx.fillStyle = '#f2ead8'; ctx.font = '600 13px sans-serif'; ctx.fillText(label.slice(0, 48), x + 6, y + TH - 24);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#c8c0b0';
    ctx.fillText(`${f.size.map((v) => v.toFixed(2)).join(' x ')} m  ${f.tris} tris  #${i}`, x + 6, y + TH - 8);
    ctx.strokeStyle = '#000'; ctx.strokeRect(x + 0.5, y + 0.5, TW - 1, TH - 1);
    info.push({ i, item: items[i].item, ...f });
  }
  W.__propSheetInfo = info;
  W.__propSheet = sheet.toDataURL('image/jpeg', 0.88);
}
