// Zone map audit -- a dev-only view at /?zonemap=<key> that draws any zone's
// map, minimap and the world map with no account, no server and no character,
// and can lay the map beside (or over) a true top-down render of the built
// zone at the same framing.
//
// It exists because the maps are drawn from data (zones.json: landmarks, NPCs,
// portals, crystals, camps, services) and from the build's own records (roads,
// water, footprints), and the cities, wild zones and dungeons were all rebuilt:
// whether a name still sits on the thing it names is a question for the eye,
// and nobody walks a fresh character through 33 zones to ask it.
//
//   /?zonemap=caerdun                    the zone map as the HUD draws it, for a new character
//   /?zonemap=caerdun&all                + every audit layer (below)
//   /?zonemap=caerdun&npcs&landmarks     + just those audit layers
//   /?zonemap=caerdun&disc=all           the HUD's landmark names as if all were found
//   /?zonemap=caerdun&mm=-38,-45&mmr=50  the minimap's crop centred there (default: the spawn), range in metres
//   /?zonemap=caerdun&compare            the map beside a top-down orthographic render, same framing
//   /?zonemap=caerdun&compare=overlay    the marks (no base) over the render; &base=0.4 adds the base map at that opacity
//   /?zonemap=caerdun&focus=-38,-45,60   both framed on a 120 m square there, for a close look
//   /?zonemap=world                      the world map, every region visited (&disc=none: all fog)
//
// Audit layers (each a param; `all` turns on every one, `name=0` turns one off):
//   landmarks  every landmark, found or not (cyan ring + name)
//   npcs       every NPC with its name and kind (dot coloured by kind)
//   portals    every portal, gated ones dashed (id > destination (gate quest))
//   crystals   every crystal's name
//   camps      every camp's ring and its monster and levels
//   quests     every spot a quest sends a player to (pink pin, quest keys) and every interactable
//   sites      every site's outline and name (gold dashes)
// Other params: scale=1.5 (backing = CSS pixels per map pixel; shots read the
// canvas 1:1), daytime=0.25 (noon, the render's light), camh=70 (render camera
// height above the tile's highest ground), tile=64 (render tile, metres),
// clip=<y> (cut the render above y metres: a dungeon's ceilings, a roof).
//
// window.__zm: { key, ready, frame, box, rect, toPx(x, z), toWorld(px, py),
// services, mapPNG(), renderPNG(), minimapPNG() } -- an audit script waits on
// `ready` and reads the canvases as PNG data URLs.
import "./style.css";
import { Camera, Plane, UniversalCamera, Vector3 } from "@babylonjs/core";
import { initEngine, buildZone, engine, scene, groundHeight, zoneFootprints, zoneMapLayers } from "./scene";
import "./zones";
import { ZONES } from "./data";
import { state } from "./state";
import { auditDropped, namesDropped, drawMinimapStatic, drawWorld, drawZone, invalidateZoneBase, setPosProvider, zoneMapFrame, REGIONS, type AuditLayers, type ZoneMapOpts } from "./map";
import { boundsFrame, frameWorldRect, zoneMapBox, MAP_BOX_TOP, type MapFrame } from "./map_frame";
import { zoneServices } from "./map_services";

const MAP_W = 560, MAP_H = 430, MM_SIDE = 172;
const AUDIT_KEYS: (keyof AuditLayers)[] = ["landmarks", "npcs", "portals", "crystals", "camps", "quests", "sites"];

export async function runZoneMapView(canvas: HTMLCanvasElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const key = params.get("zonemap") || "";
  const scale = Math.max(0.5, Math.min(4, Number(params.get("scale")) || 1.5));
  const on = (name: string) => params.has(name) && params.get(name) !== "0";
  const zm: Record<string, unknown> = { key, ready: false };
  (window as unknown as Record<string, unknown>).__zm = zm;

  document.body.style.cssText = "margin:0;background:#0a0d14;color:#d8dce8;font:12px/1.5 ui-monospace,monospace;overflow:auto";
  canvas.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;width:64px;height:64px";
  const bar = el("div", "position:absolute;left:12px;top:8px;right:12px;white-space:nowrap;overflow:hidden");
  const stage = el("div", "position:absolute;left:12px;top:40px");
  const info = el("div", "position:absolute;left:12px;white-space:pre;color:#a8b0c4");
  document.body.append(bar, stage, info);

  // the toolbar: a link per toggle, so every state of the view is a URL
  const link = (label: string, mut: (p: URLSearchParams) => void, active: boolean) => {
    const p = new URLSearchParams(location.search);
    mut(p);
    return `<a href="?${p.toString().replace(/=(&|$)/g, "$1")}" style="color:${active ? "#ffd479" : "#8fa4cc"};text-decoration:none;margin-right:10px">${label}</a>`;
  };
  const toggle = (name: string) => link(name, (p) => { if (on(name)) p.delete(name); else p.set(name, ""); }, on(name));
  const zoneOptions = ["world", ...Object.keys(ZONES)].map((k) => `<option ${k === key ? "selected" : ""}>${k}</option>`).join("");
  bar.innerHTML = `<select id="zm-zone" style="background:#141a2e;color:#d8dce8;border:1px solid #2a3350;margin-right:12px">${zoneOptions}</select>`
    + (key === "world" ? toggle("disc") : [
      link("all", (p) => { if (on("all")) p.delete("all"); else p.set("all", ""); AUDIT_KEYS.forEach((k) => p.delete(k)); }, on("all")),
      ...AUDIT_KEYS.map(toggle),
      link("disc=all", (p) => { if (p.get("disc") === "all") p.delete("disc"); else p.set("disc", "all"); }, params.get("disc") === "all"),
      link("compare", (p) => { if (p.get("compare") === null || p.get("compare") === "overlay") p.set("compare", ""); else p.delete("compare"); }, params.has("compare") && params.get("compare") !== "overlay"),
      link("overlay", (p) => { if (p.get("compare") === "overlay") p.delete("compare"); else p.set("compare", "overlay"); }, params.get("compare") === "overlay"),
    ].join("")) + `<span id="zm-at" style="color:#c9d2e4;margin-left:8px"></span>`;
  (bar.querySelector("#zm-zone") as HTMLSelectElement).onchange = (e) => {
    const p = new URLSearchParams(location.search);
    p.set("zonemap", (e.target as HTMLSelectElement).value);
    location.search = p.toString();
  };
  const at = bar.querySelector("#zm-at") as HTMLElement;

  if (key === "world") { runWorld(stage, info, scale, params, zm); return; }
  if (!ZONES[key]) {
    stage.innerHTML = `<b>?zonemap=${key || "(missing)"}</b> is not a zone.<br><br>`
      + ["world", ...Object.keys(ZONES)].map((k) => `<a style="color:#9fc6ff" href="?zonemap=${k}">${k}</a>`).join("<br>");
    return;
  }

  // the render's light: noon unless the URL pins another hour (scene.ts reads ?daytime)
  if (!params.has("daytime")) { params.set("daytime", "0.25"); history.replaceState(null, "", `?${params.toString().replace(/=(&|$)/g, "$1")}`); }
  const def = ZONES[key];
  const compare = params.has("compare") ? (params.get("compare") === "overlay" ? "overlay" : "side") : null;
  const audit: AuditLayers = {};
  AUDIT_KEYS.forEach((k) => { if (on("all") ? params.get(k) !== "0" : on(k)) audit[k] = true; });
  const anyAudit = AUDIT_KEYS.some((k) => audit[k]);

  // the frame: the zone map's own, or the caller's focus square
  const box = zoneMapBox(MAP_W, MAP_H);
  const focus = (params.get("focus") || "").split(",").map(Number);
  const focusFrame: MapFrame | undefined = focus.length === 3 && focus.every(Number.isFinite)
    ? boundsFrame([focus[0] - focus[2], focus[1] - focus[2], focus[0] + focus[2], focus[1] + focus[2]], box.w, box.h, 0) : undefined;
  const frameNow = () => focusFrame || zoneMapFrame(key, box.w, box.h);
  const opts = (): ZoneMapOpts => ({ scale, allDiscovered: params.get("disc") === "all", audit: anyAudit ? audit : undefined, frame: focusFrame });

  // the canvases: the map, or the render beside it / under its marks; the minimap
  const sized = (w: number, h: number, css = "") => {
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.style.cssText = `position:absolute;width:${c.width}px;height:${c.height}px;${css}`;
    return c;
  };
  const W = Math.round(MAP_W * scale), H = Math.round(MAP_H * scale);
  const mapCv = sized(MAP_W, MAP_H, "left:0;top:0;border:1px solid #2a3350");
  const renderCv = compare ? sized(box.w, box.h, compare === "side" ? `left:${W + 14}px;top:${MAP_BOX_TOP * scale}px;border:1px solid #2a3350` : `left:0;top:${MAP_BOX_TOP * scale}px`) : null;
  const baseCv = compare === "overlay" && Number(params.get("base")) > 0 ? sized(MAP_W, MAP_H, `left:0;top:0;opacity:${Math.min(1, Number(params.get("base")))}`) : null;
  const mmLeft = compare === "side" ? 2 * (W + 14) : W + 14;
  const mmCv = sized(MM_SIDE, MM_SIDE, `left:${mmLeft}px;top:0;border-radius:50%;box-shadow:0 0 0 2px #6b5a35`);
  if (renderCv) {
    const g = renderCv.getContext("2d")!;
    g.fillStyle = "#0c1018"; g.fillRect(0, 0, renderCv.width, renderCv.height);
    g.fillStyle = "#8fa4cc"; g.font = `${12 * scale}px monospace`; g.fillText("rendering...", 12 * scale, 24 * scale);
    stage.appendChild(renderCv);
  }
  if (baseCv) stage.appendChild(baseCv);
  stage.appendChild(mapCv);
  stage.appendChild(mmCv);
  const mmCaption = el("div", `position:absolute;left:${mmLeft}px;top:${MM_SIDE * scale + 8}px;color:#8fa4cc;white-space:pre`);
  stage.appendChild(mmCaption);
  stage.style.height = `${H + 8}px`;
  stage.style.width = `${mmLeft + MM_SIDE * scale}px`;
  info.style.top = `${40 + H + 16}px`;

  // build the zone: the map's roads, water and footprints are recorded by the
  // builders as they run, and its relief is sampled off the built ground
  state.zone = key;
  initEngine(canvas, true);   // preserveDrawingBuffer: the render's tiles are read off the canvas
  buildZone(key);

  const mmAt = (params.get("mm") || "").split(",").map(Number);
  const [mx, mz] = mmAt.length === 2 && mmAt.every(Number.isFinite) ? mmAt : [def.spawn?.x ?? 0, def.spawn?.z ?? 0];
  const mmRange = Number(params.get("mmr")) || 70;
  // the player's arrow stands where the minimap is centred, when one is asked for
  setPosProvider(params.has("mm") ? () => ({ x: mx, z: mz, h: 0 }) : null);

  const redraw = () => {
    drawZone(mapCv, key, compare === "overlay" ? { ...opts(), marksOnly: true } : opts());
    if (baseCv) drawZone(baseCv, key, { ...opts(), audit: undefined });
    // where the minimap's crop is, on the map: a dashed ring
    if (params.has("mm")) {
      const f = frameNow(), g = mapCv.getContext("2d")!;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.setLineDash([4, 3]); g.strokeStyle = "rgba(243,234,214,0.7)"; g.lineWidth = 1;
      g.beginPath(); g.arc(f.ox + (mx - f.cx) * f.S, MAP_BOX_TOP + f.oy - (mz - f.cz) * f.S, mmRange * f.S, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
  };
  const drawMinimap = () => {
    invalidateZoneBase();
    const g = mmCv.getContext("2d")!;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, MM_SIDE, MM_SIDE);
    drawMinimapStatic(g, key, mx, mz, mmRange, MM_SIDE);
    // the player's arrow, facing north, where the HUD draws it
    const C = MM_SIDE / 2;
    g.beginPath(); g.moveTo(C, C - 10); g.lineTo(C + 7, C + 6); g.lineTo(C, C + 2); g.lineTo(C - 7, C + 6); g.closePath();
    g.fillStyle = "#f3ead6"; g.fill(); g.strokeStyle = "#0b0e15"; g.lineWidth = 1.2; g.stroke();
    mmCaption.textContent = `minimap at ${mx}, ${mz}\nrange ${mmRange} m (HUD steps 35/50/70/100/140)`;
  };

  // where the cursor is, in world metres, over the map or the render
  const toWorld = (cx: number, cy: number): [number, number] => {
    const f = frameNow();
    return [f.cx + (cx - f.ox) / f.S, f.cz - (cy - MAP_BOX_TOP - f.oy) / f.S];
  };
  const hover = (cv: HTMLCanvasElement, top: number) => cv.addEventListener("mousemove", (e) => {
    const r = cv.getBoundingClientRect();
    const [wx, wz] = toWorld((e.clientX - r.left) / scale, (e.clientY - r.top) / scale + top);
    at.textContent = `x ${wx.toFixed(1)}  z ${wz.toFixed(1)}`;
  });
  hover(mapCv, 0);
  if (renderCv && compare === "side") hover(renderCv, MAP_BOX_TOP);

  // The records grow while the zone finishes building (kit pools and glTF
  // templates land for seconds after buildZone returns): redraw until their
  // counts have held still for 3 s, then draw the minimap from the full base.
  const sig = () => {
    const l = zoneMapLayers[key];
    return `${l?.roads.length ?? 0}|${l?.waters.length ?? 0}|${zoneFootprints[key]?.length ?? 0}`;
  };
  let last = "", since = performance.now();
  redraw();
  for (;;) {
    await wait(500);
    const s = sig();
    if (s !== last) { last = s; since = performance.now(); redraw(); }
    if (performance.now() - since > 3000) break;
  }
  redraw();
  drawMinimap();

  const f = frameNow();
  const rect = frameWorldRect(f, box.w, box.h);
  const services = zoneServices(def);
  Object.assign(zm, {
    frame: f, box, rect, services, auditDropped: () => auditDropped, namesDropped: () => namesDropped,
    toPx: (x: number, z: number) => [f.ox + (x - f.cx) * f.S, MAP_BOX_TOP + f.oy - (z - f.cz) * f.S],
    toWorld,
    mapPNG: () => mapCv.toDataURL("image/png"),
    minimapPNG: () => mmCv.toDataURL("image/png"),
    renderPNG: () => renderCv?.toDataURL("image/png") ?? null,
  });
  info.textContent = [
    `${key}  ${def.name}  (${def.kind}, ${def.size} m plate)`,
    `frame  ${f.S.toFixed(3)} px/m  world x ${rect[0].toFixed(0)}..${rect[2].toFixed(0)}  z ${rect[1].toFixed(0)}..${rect[3].toFixed(0)}${focusFrame ? "  (focus)" : ""}`,
    `records  roads ${zoneMapLayers[key]?.roads.length ?? 0}  waters ${zoneMapLayers[key]?.waters.length ?? 0}  footprints ${zoneFootprints[key]?.length ?? 0}`,
    "",
    "services (drawn always; zones.json `services`, else from NPC kinds):",
    ...services.map((s) => `  ${s.kind.padEnd(8)} ${s.name.padEnd(34)} ${String(s.x).padStart(8)} ${String(s.z).padStart(8)}  ${s.from === "data" ? `covers ${s.npcs.join(", ") || "-"}` : `npc ${s.npcs[0]}`}`),
    "",
    anyAudit && auditDropped ? `${auditDropped} audit names left off where they would overprint: zoom with &focus=x,z,r` : "",
    anyAudit ? "audit colours: cyan landmark/interactable  gold dashes site  pink pin quest spot  violet portal  blue crystal  red camp  NPC dots by kind" : "audit layers off (&all for every one)",
  ].join("\n");
  zm.info = info.textContent;

  if (renderCv) {
    await renderTopDown(renderCv, f, box.w, box.h, scale, params, (t) => { at.textContent = t; });
    at.textContent = "";
  }
  zm.ready = true;
}

// ---------- the top-down render ----------
// An orthographic camera straight down, rendered in square tiles and pasted
// into a canvas at exactly the map frame's metres per pixel, so a pixel on the
// render and the same pixel on the map are the same ground. Tiles, not one
// shot: the cities' and the wild kit's LOD cells pick their level by the
// camera's distance (city_pools.ts levelFor is 3D, wild-nature.ts horizontal),
// and from one camera over the centre the far cells drop to their far pieces
// or are culled altogether. Over each tile, every cell under it is near.
async function renderTopDown(
  out: HTMLCanvasElement, f: MapFrame, bw: number, bh: number, scale: number,
  params: URLSearchParams, status: (t: string) => void,
): Promise<void> {
  const rect = frameWorldRect(f, bw, bh);
  const P = f.S * scale;                                  // render pixels per metre
  const tilePx = Math.max(64, Math.min(1024, Math.round((Number(params.get("tile")) || 64) * P)));
  const T = tilePx / P;                                   // the tile's side in metres, pixel-exact
  const camH = Number(params.get("camh")) || 70;
  const cam = new UniversalCamera("zm_top", new Vector3((rect[0] + rect[2]) / 2, 200, (rect[1] + rect[3]) / 2), scene);
  cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  // looking straight down with +z (north) up the screen and +x (east) right
  cam.rotation.set(Math.PI / 2, 0, 0);
  cam.orthoLeft = -T / 2; cam.orthoRight = T / 2; cam.orthoTop = T / 2; cam.orthoBottom = -T / 2;
  cam.minZ = 0.5; cam.maxZ = 2000;
  scene.activeCamera = cam;
  // what a top-down map wants and a player's view does not: no fog, no
  // vignette, no shadows (a cascade fitted to an orthographic tile is noise)
  scene.fogEnabled = false;
  scene.shadowsEnabled = false;
  scene.imageProcessingConfiguration.vignetteEnabled = false;
  const clip = Number(params.get("clip"));
  if (params.has("clip") && Number.isFinite(clip)) scene.clipPlane = new Plane(0, 1, 0, -clip);
  engine.setHardwareScalingLevel(1);
  engine.setSize(tilePx, tilePx);

  // settle first, as tools/qa/zone_view_lib.mjs settle does: what can be drawn
  // is ready and the mesh / thin-instance / texture counts held still for 4 s
  status("settling the build...");
  const t0 = performance.now();
  let k0 = "", quiet = performance.now();
  for (;;) {
    scene.render();
    await wait(250);
    const ready = scene.meshes.every((m) => !m.isEnabled() || !m.isVisible || m.isReady(true));
    let ti = 0; for (const m of scene.meshes) ti += (m as { thinInstanceCount?: number }).thinInstanceCount || 0;
    const k = [scene.meshes.length, ti, scene.textures.length, scene.materials.length, scene.getWaitingItemsCount(), ready ? 1 : 0].join(":");
    if (k !== k0) { k0 = k; quiet = performance.now(); }
    const q = performance.now() - quiet;
    if ((ready && scene.getWaitingItemsCount() === 0 && q > 4000) || q > 12000 || performance.now() - t0 > 150000) break;
  }

  const g = out.getContext("2d")!;
  g.fillStyle = "#0c1018";
  g.fillRect(0, 0, out.width, out.height);
  const nx = Math.ceil((rect[2] - rect[0]) / T), nz = Math.ceil((rect[3] - rect[1]) / T);
  const top = (cx: number, cz: number) => {
    let hi = -Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hi = Math.max(hi, groundHeight(cx - T / 2 + (i * T) / 4, cz - T / 2 + (j * T) / 4));
    return (Number.isFinite(hi) ? hi : 0) + camH;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      status(`rendering tile ${j * nx + i + 1}/${nx * nz}`);
      const cx = rect[0] + (i + 0.5) * T, cz = rect[3] - (j + 0.5) * T;
      cam.position.set(cx, top(cx, cz), cz);
      // the LOD passes run before each render and re-pick on a camera move;
      // a few frames and a beat let the pools refill and their buffers land
      for (let n = 0; n < 4; n++) scene.render();
      await wait(30);
      scene.render();
      g.drawImage(engine.getRenderingCanvas()!, i * tilePx, j * tilePx);
    }
  }
}

// ---------- the world map ----------
function runWorld(stage: HTMLElement, info: HTMLElement, scale: number, params: URLSearchParams, zm: Record<string, unknown>): void {
  const cv = document.createElement("canvas");
  cv.width = Math.round(MAP_W * scale); cv.height = Math.round(MAP_H * scale);
  cv.style.cssText = `width:${cv.width}px;height:${cv.height}px;border:1px solid #2a3350;cursor:pointer`;
  stage.appendChild(cv);
  const fog = params.get("disc") === "none" || (params.has("disc") && params.get("disc") !== "all");
  drawWorld(cv, null, {
    scale,
    visited: fog ? () => false : () => true,
    onPick: (k) => { const p = new URLSearchParams(location.search); p.set("zonemap", k); p.delete("disc"); location.search = p.toString(); },
  });
  const onMap = new Set(REGIONS.map((r) => r.key));
  const missing = Object.keys(ZONES).filter((k) => !onMap.has(k));
  const stale = REGIONS.filter((r) => !ZONES[r.key]).map((r) => r.key);
  info.style.top = `${40 + cv.height + 16}px`;
  info.textContent = [
    `world map: ${REGIONS.length} regions, ${fog ? "all fogged (a new character)" : "all visited"}; click a region for its zone map`,
    `zones not on the world map: ${missing.join(", ") || "none"}`,
    `regions naming no zone: ${stale.join(", ") || "none"}`,
  ].join("\n");
  Object.assign(zm, { ready: true, info: info.textContent, mapPNG: () => cv.toDataURL("image/png") });
}

function el(tag: string, css: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}
function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
