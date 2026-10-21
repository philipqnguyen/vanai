// THE MOONMERE SHORES' SIDE OF THE CITY (MOONMERE.md A-14): what of the new Moonmere the Shores draw.
//
// MM-15 (Philip 2026-10-07: "rebuild BOTH causeway ends and the gate in the Cloisters style"): the
// Shores' end of the one causeway is the same build as Moonmere's (moonmere_causeway.ts) -- its bays
// on their banded arches out from the strand, the lantern pylons where it leaves the land, three
// steps down to the sand -- and the gate where the kit gatehouse stood is the Landing's own Causeway
// Gate (cg_shell), with its four lamps; the gatehouse's four lit torches' point lights burn at them
// (the gate's land face is lit by nothing else at night: scene.ts, buildMoonmereShores). The walk is
// scene.ts makeCauseway's, unchanged (`draw: false`); the Proctor, Mab, the stamp and the crate keep
// their places.
//
// MM-16 (Philip 2026-10-07: "show the new Moonmere skyline from moonmereshores, the way the Burned
// Land shows the Capital"): THE CITY ACROSS THE WATER, cheap -- the city's own pieces through the
// shared instancer at their far forms only (a bay at its LOD1 however near, its card past 140 m; the
// towers, the Long Tower's far model, the roofs, the civic shells that face the Shores; nothing that
// stands inside, nothing the city itself shows only within 45 or 140 m), on one ground mesh of the
// island painted once (lawn, rock risers, the streets' stone, sand), with no collider, no shadow and
// no glow-pass draw. AT ITS TRUE PLACE AND SCALE: the Shores' deck ends at z -380 (makeCauseway's
// zSea there), which IS Moonmere's causeway's land end at z 262 (the Landing) -- so the city stands
// translated by SHORES_FROM_MOONMERE, the deck x = 8 on the Shores' x = 0, and the Shores' causeway
// walks straight onto its Landing. The portals (MM-3) are unchanged: (8, 300) and (0, -264) stay
// where they are; this is only where each zone draws the other.
//
// This file registers the Shores' zone module with a `build` only (no height, carves, theme,
// terrain or edge): scene.ts runs it after buildMoonmereShores (buildGenericWilds), and the Shores'
// ground, sea, scatters and everything else are exactly as they were -- proved with
// tools/qa/zone_fingerprint.mjs (MOONMERE.md A-14).
import { Color3, DynamicTexture, Mesh, PointLight, StandardMaterial, Texture, Vector3, VertexData, type Scene } from "@babylonjs/core";
import { registerZone, scene, buildApi, causewayLaid, registerNightLight, glow, addMapRoad } from "../scene";
import { createCity } from "../city-architecture";
import LAYOUT from "../moonmere-layout.json";
import { MM_CITY_KIT, instanceOutside } from "./moonmere_city";
import { planCauseway, planShoresGate, solidBays, GATE } from "./moonmere_causeway";
import { lightByHouse, lightDeck, paintLitHouses } from "./moonmere_night";
import type { Layout } from "./moonmere_types";
import { SHORES_FROM_MOONMERE, VIEW_COL, VIEW_GROUND, VIEW_STONE, unb64, type ViewBake } from "./moonmere_view";

const L = LAYOUT as unknown as Layout;
// THE VIEW'S KIT: the city's own, as its own set -- casting nothing (past the Shores' 150 m cascades
// from almost every camera, and nothing of it is near enough to shade the strand), and out of the
// glow pass (its panes still light by the night sheet: the facade's emissive, no bloom)
const VIEW_KIT = { ...MM_CITY_KIT, id: "mmv", prefix: "mmv", metaKey: "moonmereView", shadowless: /./, glowNightOnly: /^$/, glows: {},
  stats: { pieces: 0, batches: 0, cells: 0, templates: 0, facades: 0 } as Record<string, number> };
const VIEW_CITY = createCity(VIEW_KIT);

/** what the last Shores build made, for the QA scripts (window.moonmereShoresStats) */
export const shoresStats: Record<string, number> = {};

registerZone({ key: "moonmereshores", build: () => buildShores() });

function buildShores(): void {
  const t0 = performance.now();
  const S = shoresStats;
  for (const k of Object.keys(S)) delete S[k];
  (window as unknown as Record<string, unknown>).moonmereShoresStats = S;
  const cw = causewayLaid();
  if (!cw || cw.draw !== false) return;
  // MM-15: the causeway, its pylons and steps, its lamps; the gate on the strand. Its first bays are
  // solid while the strand stands over the sea under their arches (S4 review: the first arch dived
  // half into the sand beside the steps), counted off the DRAWN strand -- the coast is noise here
  const spec = { x: cw.x, zLand: cw.zLand, zSea: cw.zSea, deck: cw.deck };
  const solid = solidBays(spec, buildApi.surface);
  const deck = planCauseway(spec, { steps: true, solid });
  const gy = buildApi.surface(cw.x, cw.gateZ);
  // NOTHING GROWS THROUGH THE GATE (S4 review, high: the meadow's grass stood up through the gate's
  // pale flags and on the road down to the steps, on the route every arrival takes). This module's
  // build runs before scene.ts buildMeadow, which keeps grass off mapped roads: the road runs from 2 m
  // outside the gate's land face through the passage to the steps' foot, and that is what clears the
  // passage (MEASURED, MOONMERE.md A-15: 0 clumps in it, 329 before). The footprint is for the
  // map and the spot audits only -- buildMeadow records footprints at y -Infinity and its test
  // `y > h - 0.3` never passes for them (a scene.ts bug, every zone; not fixed here, shared file), so
  // 92 clumps still stand INSIDE the solid piers, unseen
  buildApi.footprint(cw.x, cw.gateZ, GATE.w, GATE.d);
  const dir = Math.sign(cw.zSea - cw.zLand) || 1;
  addMapRoad([[cw.x, cw.gateZ - dir * (GATE.d / 2 + 2)], [cw.x, cw.zLand - dir * 2.08]], 5);
  const gate = planShoresGate(cw.x, cw.gateZ, gy, (L.mounts as Record<string, { kind: string; x: number; y: number; z: number; yaw: number }[]>).cg_shell ?? []);
  const made = instanceOutside([...deck.pieces, ...gate.pieces], "shores");
  for (const b of [...deck.boxes, ...gate.boxes]) buildApi.addBoxCollider(b.cx, b.cz, b.hx, b.hz, b.yaw, b.y1, b.y0 ?? -1e9);
  // (S4 review) the deck's lamps cast their pools on it at night, as at Moonmere's end (moonmere_night.ts)
  lightDeck(scene.getMaterialByName("mc_facade#mm"), deck.pieces.filter((p) => p.file === "lamp_post"), [cw.x - 6, Math.min(cw.zLand, cw.zSea) - 3, 12, Math.abs(cw.zSea - cw.zLand) + 6], cw.deck);
  // the gate's land face is lit by nothing but its lamps at night: the kit gatehouse's four torch
  // lights, kept (the Shores' light budget is unchanged: four, and the crystal's)
  gate.lights.forEach(([x, y, z], i) => {
    const pl = new PointLight(`cwgate_l${i}`, new Vector3(x, y, z), scene);
    pl.diffuse = Color3.FromHexString("#e8b46a");
    pl.intensity = 0.35;
    pl.range = 18;
    registerNightLight(pl, 0.35);
  });
  S.causewayPieces = deck.pieces.length + gate.pieces.length; S.causewayBatches = made.batches; S.solidBays = solid;
  S.causewayMs = Math.round(performance.now() - t0);
  // MM-16: the city across the water -- built just AFTER the zone's own build, so the Shores load
  // as fast as they did (the view is 300 m off: it lands a frame later, its templates after that)
  // (`&noview`, a QA switch for the A/B runs: dev builds only)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("noview")) return;
  const owner = scene;
  setTimeout(() => { if (owner === scene && !owner.isDisposed) void buildView(owner); }, 0);
}

// THE VIEW, A STEP A FRAME (S4 review: built in one task -- the whole plan, then the ground painted
// cell by cell -- it was a 2.1 s hitch on WebKit as a player arrived). The view is baked
// (moonmere_view.ts bakeView, client/src/moonmere-view.json, its own chunk), so nothing is planned
// here, and each step below waits for a drawn frame: the pieces, the houses' hours, the ground's
// mesh, its sheet. shoresStats keeps each step's main-thread ms and the longest
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
async function buildView(owner: Scene): Promise<void> {
  const S = shoresStats;
  const live = () => owner === scene && !owner.isDisposed;
  const t0 = performance.now();
  const V = (await import("../moonmere-view.json")).default as unknown as ViewBake;
  S.importMs = Math.round(performance.now() - t0);
  let work = 0, longest = 0;
  const step = async (name: string, fn: () => void) => {
    if (!live()) return false;
    const a = performance.now();
    fn();
    const ms = performance.now() - a;
    S[name] = Math.round(ms); work += ms; longest = Math.max(longest, ms);
    await nextFrame();
    return live();
  };
  let ground: { pos: number[]; uv: number[]; idx: number[] } | null = null;
  const ok = await step("piecesMs", () => {
    VIEW_CITY.resetStats();
    VIEW_CITY.nightGlow(owner, "r");
    const v = VIEW_CITY.instance(owner, V.pieces as Parameters<typeof VIEW_CITY.instance>[1], 0, "view", "r");
    S.viewPieces = V.pieces.length; S.viewBatches = v.batches;
  })
    // the houses keep their hours across the water too (moonmere_night.ts; the map in Moonmere's frame)
    && await step("litMs", () => {
      lightByHouse([owner.getMaterialByName("mc_facade#mmv")], paintLitHouses(V.houses, owner), [SHORES_FROM_MOONMERE.dx, SHORES_FROM_MOONMERE.dz]);
    })
    && await step("groundMeshMs", () => { ground = groundMesh(V); })
    && await step("groundMs", () => { if (ground) groundSheet(V, ground, owner); });
  S.viewMs = Math.round(work);
  S.viewLongestMs = Math.round(longest);
  S.viewWallMs = Math.round(performance.now() - t0);
  S.viewDone = ok ? 1 : 0;
}

// THE ISLAND'S GROUND, seen from across the water: the plan's exact ground (moonmere_terrain.ts) on a
// 3 m grid -- the sward, the risers' basalt, the strand's sand, the streets, stairs, landings and
// courts in their stone -- and round it the island's own shelf under the water, sand falling away to
// the deep (the Shores' sea is one sheet over a bed it does not have out here: without the shelf the
// island stood on nothing, its coast a black cliff into the haze, LOOKED). Baked (moonmere_view.ts
// bakeGround); one draw, no collider (nothing here is walked), no shadow
function groundMesh(V: ViewBake): { pos: number[]; uv: number[]; idx: number[] } {
  const G = VIEW_GROUND, n = V.ground.n;
  const hb = unb64(V.ground.h), hs = new Int16Array(hb.buffer, hb.byteOffset, n * n), kind = unb64(V.ground.kind);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = G.x0 + i * G.cell, z = G.z0 + j * G.cell;
    pos.push(x + SHORES_FROM_MOONMERE.dx, hs[j * n + i] / 100, z + SHORES_FROM_MOONMERE.dz);
    uv.push((x - G.x0) / G.size, (z - G.z0) / G.size);   // the sheet's top row is z0 (update(false))
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    // the island, the mere and the shelf; not the deep
    const q = [j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i];
    if (q.every((v) => kind[v] === 0)) continue;
    idx.push(q[0], q[3], q[2], q[0], q[2], q[1]);
  }
  return { pos, uv, idx };
}

function groundSheet(V: ViewBake, g: { pos: number[]; uv: number[]; idx: number[] }, owner: Scene): void {
  const G = VIEW_GROUND, n = V.ground.n, k = G.px / G.size;
  // the sheet: the cells' classes as one small image drawn up to the sheet (nearest: a cell is one
  // colour), then the city's stone stroked over it
  const tex = new DynamicTexture("mmv_ground", { width: G.px, height: G.px }, owner, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = VIEW_COL[0]; ctx.fillRect(0, 0, G.px, G.px);
  const m = n - 1, cls = unb64(V.ground.col), small = document.createElement("canvas");
  small.width = m; small.height = m;
  const sc = small.getContext("2d")!, img = sc.createImageData(m, m);
  const rgb = VIEW_COL.map((h) => Color3.FromHexString(h));
  for (let c = 0; c < m * m; c++) {
    const col = rgb[cls[c]];
    img.data[c * 4] = Math.round(col.r * 255); img.data[c * 4 + 1] = Math.round(col.g * 255); img.data[c * 4 + 2] = Math.round(col.b * 255); img.data[c * 4 + 3] = 255;
  }
  sc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, m * G.cell * k, m * G.cell * k);
  ctx.lineJoin = "round"; ctx.lineCap = "butt";
  for (const s of V.ground.stone) {
    const [flags, half] = s;
    ctx.beginPath();
    for (let i = 2; i + 1 < s.length; i += 2) {
      const u = (s[i] - G.x0) * k, v = (s[i + 1] - G.z0) * k;
      if (i === 2) ctx.moveTo(u, v); else ctx.lineTo(u, v);
    }
    if (half > 0) { ctx.strokeStyle = flags ? VIEW_STONE.flags : VIEW_STONE.setts; ctx.lineWidth = 2 * half * k; ctx.stroke(); }
    else { ctx.closePath(); ctx.fillStyle = VIEW_STONE.setts; ctx.fill(); }
  }
  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const { pos, uv, idx } = g;
  const mesh = new Mesh("mmv_ground", owner);
  const vd = new VertexData();
  vd.positions = pos; vd.uvs = uv; vd.indices = idx;
  let normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  // (its faces up: a flat cell's normal must point to the sky, or the sheet is culled from above)
  if (normals.length && normals.reduce((a, v, i) => (i % 3 === 1 ? a + v : a), 0) < 0) {
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
    normals = [];
    VertexData.ComputeNormals(pos, idx, normals);
  }
  // (the normals leaned toward the sky: from across the water a riser's face under the knoll took a
  // smeared black bruise where the 3 m grid folds round a body's ramp, LOOKED; the light is a far one)
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 1] + 0.9, z = normals[i + 2], l = Math.hypot(x, y, z) || 1;
    normals[i] = x / l; normals[i + 1] = y / l; normals[i + 2] = z / l;
  }
  vd.normals = normals;
  vd.applyToMesh(mesh);
  const mat = new StandardMaterial("mmv_ground_m", owner);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  if (glow) glow.addExcludedMesh(mesh);
  shoresStats.groundTris = idx.length / 3;
}
