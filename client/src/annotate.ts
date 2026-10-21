// Zone annotation for ?zone=<key>: circle, box, stroke or lasso an area of
// ground, say what is wrong with it, and save the batch to tmp/zone-notes/.
//
// Why this and not a zone editor. The zones are code and should stay code:
// scatterModels puts four hundred trees down from one seed in one line, and
// a makeRiver course (huntingwood.ts STREAM_PTS) is what keeps the carve, the
// valley and the water ribbon agreeing about where the river is. Neither survives being flattened into a
// list of placements, and an editor would make a second source of truth for
// every zone. What is actually slow is not making the change -- it is saying
// WHERE. So this tool produces intent (a region, a picture, a sentence) and
// never content; the fix still lands in scene.ts.
//
// The four shapes are the four the code already speaks, so a note maps onto a
// one-line edit instead of a translation problem:
//
//   circle  { x, z, r }             avoid lists, glades, basin(), slopeExempt
//   box     { x0, x1, z0, z1 }      flatZones, colliders, camera rooms
//   stroke  { points[], width }     river courses, roads, treelines, ridges
//   lasso   { points[] }            irregular regions
//
// A stroke is the interesting one: a makeRiver course or a road's `pts` is
// exactly [number, number][], so a drawn course can be pasted in as control
// points.
//
// Keys: 1 circle · 2 box · 3 draw · 0 off · G walkability · F show filed
//       ⌘S save batch · ⌘Z remove the last open note · × in the panel deletes one
import {
  Color3, Constants, DynamicTexture, Mesh, MeshBuilder, PointerEventTypes,
  StandardMaterial, TransformNode, Vector3, VertexData,
  type ArcRotateCamera, type UniversalCamera,
} from "@babylonjs/core";
import {
  scene, engine, groundHeight, isWalkable, dayFrac, segDist, makeWaterRibbon,
} from "./scene";

// ---------- shapes ----------
export type Shape =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x0: number; x1: number; z0: number; z1: number }
  | { kind: "stroke"; points: [number, number][]; width: number }
  | { kind: "lasso"; points: [number, number][] };

interface Stats {
  samples: number; unwalkablePct: number;
  minY: number; maxY: number; maxGradient: number;
}

interface Note {
  n: number;
  shape: Shape;
  text: string;
  // Set once the note has been written to a batch on disk. A filed note stops
  // being drawn, drops its screenshot and collapses to a count -- see
  // saveBatch. Without that the list only ever grows: the panel runs off the
  // viewport at ~15, and the screenshots (~560KB each in base64) make both
  // memory and the POST body climb without limit.
  filed?: boolean;
  camera: { pos: [number, number, number]; target: [number, number, number] };
  daytime: number;
  stats: Stats;
}

type Tool = "off" | "circle" | "box" | "draw";

const GOLD = "#ffd479";   // a saved note
const CYAN = "#7fd8e0";   // the shape being drawn
const RED = "#e0604a";    // the walkability overlay, same tint marker.ts uses for danger
const FILED = "#6b7a99";  // a note already written to a batch, shown only on demand

// A drawn point is only kept once the cursor has travelled this far in world
// space; without it one drag across a zone is eight hundred points.
const DRAW_STEP = 2.0;
// Ramer-Douglas-Peucker tolerance. A river course is a handful of points
// (huntingwood.ts STREAM_PTS is seven) -- a stroke that is going to be pasted
// in as control points has to be that order of size, not a raw capture.
const SIMPLIFY_EPS = 1.6;
// close the loop into a lasso if the drag ends this near where it started
const CLOSE_DIST = 6;

let zoneKey = "";
let zoneSize = 0;
let cam: ArcRotateCamera | UniversalCamera;
let canvasEl: HTMLCanvasElement;

let tool: Tool = "off";
let showFiled = false;   // filed notes are hidden by default; F brings them back
let notes: Note[] = [];
let shots = new Map<number, string>();   // note number -> png data URL, memory only
let nextN = 1;

// ---------- geometry helpers ----------
function outline(s: Shape): { pts: [number, number][]; closed: boolean } {
  switch (s.kind) {
    case "circle": {
      const seg = Math.max(28, Math.min(96, Math.round(s.r * 2.2)));
      const p: [number, number][] = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        p.push([s.x + Math.cos(a) * s.r, s.z + Math.sin(a) * s.r]);
      }
      return { pts: p, closed: true };
    }
    case "box":
      return { pts: [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]], closed: true };
    case "lasso":
      return { pts: s.points, closed: true };
    case "stroke":
      return { pts: s.points, closed: false };
  }
}

// Subdivide so the band follows the ground rather than cutting through it: the
// ribbon only samples height at its control points.
function densify(pts: [number, number][], closed: boolean, step = 2.5): [number, number][] {
  if (pts.length < 2) return pts.slice();
  const out: [number, number][] = [];
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 0; s < k; s++) {
      out.push([a[0] + (b[0] - a[0]) * (s / k), a[1] + (b[1] - a[1]) * (s / k)]);
    }
  }
  out.push(closed ? pts[0] : pts[pts.length - 1]);
  return out;
}

function centroid(s: Shape): [number, number] {
  if (s.kind === "circle") return [s.x, s.z];
  if (s.kind === "box") return [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
  let x = 0, z = 0;
  for (const p of s.points) { x += p[0]; z += p[1]; }
  return [x / s.points.length, z / s.points.length];
}

function bounds(s: Shape): [number, number, number, number] {
  if (s.kind === "circle") return [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r];
  if (s.kind === "box") return [s.x0, s.x1, s.z0, s.z1];
  const pad = s.kind === "stroke" ? s.width / 2 : 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of s.points) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [x0 - pad, x1 + pad, z0 - pad, z1 + pad];
}

function inPoly(pts: [number, number][], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

export function inside(s: Shape, x: number, z: number): boolean {
  switch (s.kind) {
    case "circle": return Math.hypot(x - s.x, z - s.z) <= s.r;
    case "box": return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
    case "lasso": return inPoly(s.points, x, z);
    case "stroke": {
      const half = s.width / 2;
      for (let i = 0; i < s.points.length - 1; i++) {
        const [d] = segDist(x, z, s.points[i][0], s.points[i][1], s.points[i + 1][0], s.points[i + 1][1]);
        if (d <= half) return true;
      }
      return false;
    }
  }
}

// Ramer-Douglas-Peucker, on segDist -- the same point-to-segment primitive the
// zones' road carves use to decide how near a road a point is.
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [d] = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  const head = simplify(pts.slice(0, idx + 1), eps);
  const tail = simplify(pts.slice(idx), eps);
  return [...head.slice(0, -1), ...tail];
}

// ---------- measurement ----------
// A region is queryable in a way a point is not, so every note carries numbers
// rather than a vibe: how much of it cannot be stood on, how steep it gets, how
// much relief it has.
function measure(s: Shape): Stats {
  const [x0, x1, z0, z1] = bounds(s);
  const span = Math.max(1, Math.max(x1 - x0, z1 - z0));
  const step = Math.max(1.2, span / 70);
  let samples = 0, bad = 0, minY = Infinity, maxY = -Infinity, maxG = 0;
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      if (!inside(s, x, z)) continue;
      samples++;
      if (!isWalkable(x, z)) bad++;
      const y = groundHeight(x, z);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const g = 0.6;
      const gx = (groundHeight(x + g, z) - groundHeight(x - g, z)) / (2 * g);
      const gz = (groundHeight(x, z + g) - groundHeight(x, z - g)) / (2 * g);
      maxG = Math.max(maxG, Math.hypot(gx, gz));
    }
  }
  return {
    samples,
    unwalkablePct: samples ? Math.round((bad / samples) * 100) : 0,
    minY: samples ? Math.round(minY * 10) / 10 : 0,
    maxY: samples ? Math.round(maxY * 10) / 10 : 0,
    maxGradient: Math.round(maxG * 100) / 100,
  };
}

// ---------- drawing the overlay ----------
interface Drawn { meshes: Mesh[] }
const drawnByNote = new Map<number, Drawn>();
let pendingDrawn: Drawn | null = null;

function band(name: string, pts: [number, number][], halfW: number, hex: string, alpha: number): Mesh[] {
  const mat = new StandardMaterial(`${name}_m`, scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.FromHexString(hex);
  mat.alpha = alpha;
  mat.backFaceCulling = false;
  const solid = makeWaterRibbon(name, pts.map(([x, z]) => ({ x, z, y: groundHeight(x, z) + 0.2 })), halfW, mat);
  solid.isPickable = false;
  solid.alwaysSelectAsActiveMesh = true;

  // The see-through twin, exactly as marker.ts does it: the area you are
  // annotating is usually behind the hill you climbed to see it from.
  const twin = solid.clone(`${name}_xray`);
  const xm = mat.clone(`${name}_mx`);
  xm.alpha = alpha * 0.5;
  xm.depthFunction = Constants.GREATER;
  xm.disableDepthWrite = true;
  twin.material = xm;
  twin.isPickable = false;
  twin.alwaysSelectAsActiveMesh = true;
  return [solid, twin];
}

function numberLabel(n: number, x: number, z: number): Mesh {
  const dt = new DynamicTexture(`note_lbl_${n}`, { width: 128, height: 128 }, scene, false);
  dt.hasAlpha = true;
  const ctx = dt.getContext();
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#141a2ee6";
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  dt.update();
  // drawText with a null x centres for us; Babylon's ICanvasRenderingContext
  // does not expose textAlign, so this is the way to get a centred glyph
  dt.drawText(String(n), null, 92, "bold 78px ui-monospace, monospace", GOLD, null, true, true);

  const mat = new StandardMaterial(`note_lblm_${n}`, scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveTexture = dt;
  mat.diffuseTexture = dt;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;

  const plate = MeshBuilder.CreatePlane(`note_lblp_${n}`, { size: 3.4 }, scene);
  plate.material = mat;
  plate.position.set(x, groundHeight(x, z) + 5, z);
  plate.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  plate.isPickable = false;
  plate.alwaysSelectAsActiveMesh = true;
  return plate;
}

function draw(s: Shape, hex: string, name: string, n?: number, dim = false): Drawn {
  const o = outline(s);
  const meshes: Mesh[] = [];
  const a = dim ? 0.4 : 1;
  meshes.push(...band(`${name}_line`, densify(o.pts, o.closed, 2.5), 0.5, hex, 0.95 * a));
  if (s.kind === "stroke") {
    // the corridor itself, so the note shows the area and not just the path
    meshes.push(...band(`${name}_area`, densify(s.points, false, 2.5), s.width / 2, hex, 0.2 * a));
  }
  if (n !== undefined) {
    const [cx, cz] = centroid(s);
    meshes.push(numberLabel(n, cx, cz));
  }
  return { meshes };
}

// Rebuild every note's overlay from the note list. Redrawing wholesale rather
// than patching incrementally is what keeps "filed", "deleted" and "F toggled"
// from each needing their own mesh bookkeeping.
function redrawNotes(): void {
  for (const d of drawnByNote.values()) clear(d);
  drawnByNote.clear();
  for (const nt of notes) {
    if (nt.filed && !showFiled) continue;
    drawnByNote.set(nt.n, nt.filed
      ? draw(nt.shape, FILED, `note${nt.n}`, undefined, true)  // dim, and no badge: a filed note is context, not a task
      : draw(nt.shape, GOLD, `note${nt.n}`, nt.n));
  }
}

const openNotes = (): Note[] => notes.filter((n) => !n.filed);

function clear(d: Drawn | null): void {
  if (!d) return;
  for (const m of d.meshes) { m.material?.dispose(true, true); m.dispose(); }
  d.meshes.length = 0;
}

// ---------- walkability overlay ----------
let walkMesh: Mesh | null = null;
let walkOn = false;

// Only the cells that FAIL get geometry. Cheaper than a full grid with vertex
// alpha, and it sidesteps the whole hasVertexAlpha question.
function buildWalkOverlay(): Mesh | null {
  const step = Math.max(2, zoneSize / 200);
  const n = Math.floor(zoneSize / step);
  const positions: number[] = [], indices: number[] = [];
  let vi = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ax = -zoneSize / 2 + j * step, az = -zoneSize / 2 + i * step;
      if (isWalkable(ax + step / 2, az + step / 2)) continue;
      const bx = ax + step, bz = az + step;
      positions.push(
        ax, groundHeight(ax, az) + 0.14, az,
        bx, groundHeight(bx, az) + 0.14, az,
        bx, groundHeight(bx, bz) + 0.14, bz,
        ax, groundHeight(ax, bz) + 0.14, bz,
      );
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  if (!positions.length) return null;
  const mesh = new Mesh("zv_walk", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = new Array(positions.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0));
  vd.applyToMesh(mesh);
  const mat = new StandardMaterial("zv_walkm", scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.FromHexString(RED);
  mat.alpha = 0.5;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  // The overlay sits on the ground -- which for deep water is the BED, under an
  // 0.86-alpha surface that hides it completely. Water is one of only two things
  // isWalkable rejects, so without the x-ray pass the overlay is blind in half
  // the cases it exists for. Same trick as marker.ts and the annotation bands.
  const twin = mesh.clone("zv_walk_xray");
  const xm = mat.clone("zv_walkm_x");
  xm.alpha = 0.42;
  xm.depthFunction = Constants.GREATER;
  xm.disableDepthWrite = true;
  twin.material = xm;
  twin.isPickable = false;
  twin.alwaysSelectAsActiveMesh = true;
  twin.parent = mesh; // setEnabled on the parent carries to the twin
  return mesh;
}

function toggleWalk(): void {
  walkOn = !walkOn;
  if (walkOn && !walkMesh) walkMesh = buildWalkOverlay();
  walkMesh?.setEnabled(walkOn);
  refreshPanel();
}

// ---------- screenshots ----------
// Grabbed inside onAfterRender, with preserveDrawingBuffer on (see initEngine):
// the canvas holds the frame the note was written against, overlay included.
let shotWant: ((png: string) => void) | null = null;
// Frames to let pass before grabbing. The shape is created inside a pointer
// event, and the very next onAfterRender can belong to a frame whose draw calls
// already happened -- which produced notes with no annotation in the picture.
// One whole frame in between guarantees the overlay is on screen.
let shotDelay = 0;

function requestShot(): Promise<string> {
  shotDelay = 2;
  return new Promise((resolve) => { shotWant = resolve; });
}

function serveShot(): void {
  if (!shotWant) return;
  if (shotDelay > 0) { shotDelay--; return; }
  const cb = shotWant;
  shotWant = null;
  const src = engine.getRenderingCanvas();
  if (!src) { cb(""); return; }
  // JPEG, not PNG: foliage compresses terribly losslessly, and a PNG of this
  // scene is ~2.8MB -- twenty of those is a 56MB POST. These pictures say
  // "here is the area I mean"; the colour-critical work goes through
  // solve_tint.py on its own renders, not through a note.
  const k = Math.min(1, 1400 / src.width);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  const cx = c.getContext("2d");
  if (!cx) { cb(""); return; }
  cx.drawImage(src, 0, 0, c.width, c.height);
  cb(c.toDataURL("image/jpeg", 0.9));
}

// ---------- persistence ----------
// Notes survive a reload (the zone switcher links are plain hrefs, so reloads
// are normal here). Screenshots do NOT -- twenty PNGs would blow the quota --
// so the panel shows how many notes still have their picture.
const lsKey = () => `vanai_notes_${zoneKey}`;

function persist(): void {
  try { localStorage.setItem(lsKey(), JSON.stringify(notes)); } catch { /* full */ }
}

function restore(): void {
  try {
    const raw = localStorage.getItem(lsKey());
    if (!raw) return;
    notes = JSON.parse(raw) as Note[];
    nextN = notes.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    redrawNotes();
  } catch { notes = []; }
}

// ---------- the batch ----------
function reproduceUrl(nt: Note): string {
  const [px, , pz] = nt.camera.pos;
  const [tx, , tz] = nt.camera.target;
  const eye = (nt.camera.pos[1] - groundHeight(px, pz)).toFixed(1);
  return `/?zone=${zoneKey}&at=${px.toFixed(0)},${pz.toFixed(0)}&eye=${eye}`
    + `&look=${tx.toFixed(0)},${tz.toFixed(0)}&daytime=${nt.daytime.toFixed(3)}`;
}

function shapeLine(s: Shape): string {
  switch (s.kind) {
    case "circle": return `circle  x ${s.x.toFixed(0)}  z ${s.z.toFixed(0)}  r ${s.r.toFixed(0)}`;
    case "box": return `box  x ${s.x0.toFixed(0)}..${s.x1.toFixed(0)}  z ${s.z0.toFixed(0)}..${s.z1.toFixed(0)}`;
    case "stroke": return `stroke  ${s.points.length} points  width ${s.width.toFixed(0)}m`;
    case "lasso": return `lasso  ${s.points.length} points`;
  }
}

function markdown(list: Note[]): string {
  const lines: string[] = [
    `# ${zoneKey} — ${list.length} note${list.length === 1 ? "" : "s"}`,
    ``,
    `Zone is ${zoneSize}m. Saved ${new Date().toISOString()}.`,
    ``,
  ];
  for (const nt of list) {
    const st = nt.stats;
    lines.push(`## ${nt.n} · ${shapeLine(nt.shape)}`);
    lines.push(``);
    lines.push(`- Reproduce: \`${reproduceUrl(nt)}\``);
    lines.push(`- Terrain: ${st.minY}m to ${st.maxY}m · max gradient ${st.maxGradient}`
      + ` · ${st.unwalkablePct}% unwalkable (${st.samples} samples)`);
    if (shots.has(nt.n)) lines.push(`- Shot: \`${nt.n}.jpg\``);
    if (nt.shape.kind === "stroke" || nt.shape.kind === "lasso") {
      const pts = nt.shape.points.map((p) => `[${p[0].toFixed(0)}, ${p[1].toFixed(0)}]`).join(", ");
      lines.push(`- Points: \`[${pts}]\``);
    }
    lines.push(``);
    lines.push(nt.text || "_(no text)_");
    lines.push(``);
  }
  return lines.join("\n");
}

// A batch carries the OPEN notes only, and filing them is what keeps the tool
// bounded. Saving used to leave everything in the list, so consecutive saves
// were cumulative -- save three, add two, and the second batch repeated the
// first three. Retiring on success fixes that and the growth problem at once:
// the screenshots are on disk, so dropping them here is what stops memory and
// the POST body climbing with every note taken.
async function saveBatch(): Promise<void> {
  const open = openNotes();
  if (!open.length) {
    flash(notes.length ? "nothing new — every note is filed" : "nothing to save");
    return;
  }
  flash("saving…");
  const payload = {
    zone: zoneKey,
    size: zoneSize,
    savedAt: new Date().toISOString(),
    notes: open,
    markdown: markdown(open),
    shots: Object.fromEntries(open.map((n) => [n.n, shots.get(n.n)]).filter(([, v]) => v)),
  };
  try {
    const res = await fetch("/__zone-notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json();
    if (!out.ok) { flash(`save failed: ${out.error}`); return; }
    // Only now, and only for what actually went: a failed save must leave every
    // note open, or the work is gone with nothing on disk to show for it.
    for (const nt of open) {
      nt.filed = true;
      shots.delete(nt.n);
    }
    redrawNotes();
    persist();
    refreshPanel();
    flash(`saved ${open.length} → ${out.dir}`);
  } catch (e) {
    // the endpoint only exists under `npx vite` — say so rather than failing mutely
    flash(`save failed (dev server only): ${String(e)}`);
  }
}

// ---------- UI ----------
let panel: HTMLDivElement;
let readout: HTMLDivElement;
let entry: HTMLDivElement;
let entryText: HTMLTextAreaElement;
let flashEl: HTMLDivElement;
let pending: Shape | null = null;
let pendingShot = "";

function flash(msg: string): void {
  flashEl.textContent = msg;
  window.setTimeout(() => { if (flashEl.textContent === msg) flashEl.textContent = ""; }, 6000);
}

const TOOL_LABEL: Record<Tool, string> = {
  off: "off", circle: "circle", box: "box", draw: "draw",
};

// Past this many open notes the panel starts running off the viewport, and it
// is also more than is worth handing over in one pass.
const OPEN_WARN = 10;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function refreshPanel(): void {
  const open = openNotes();
  const filed = notes.length - open.length;
  const withShots = open.filter((n) => shots.has(n.n)).length;
  // Only OPEN notes are listed. Filed ones collapse to a count, which is what
  // keeps the panel a fixed size however long a session runs.
  const rows = (showFiled ? notes : open).map((n) => {
    const c = n.filed ? FILED : "#f2ead8";
    return `<div style="opacity:${n.filed ? ".4" : ".7"};color:${c}">`
      + `<span data-del="${n.n}" style="pointer-events:auto;cursor:pointer;color:#e0604a;`
      + `padding:0 5px 0 0" title="delete note ${n.n}">×</span>`
      + `${n.n}. ${shapeLine(n.shape).split("  ")[0]}${n.filed ? " (filed)" : ""} — `
      + `${esc((n.text || "").slice(0, 30)) || "…"}</div>`;
  }).join("");

  panel.innerHTML =
    `<b style="color:${GOLD}">ANNOTATE</b>  <span style="opacity:.6">${zoneKey}</span><br>`
    + (["circle", "box", "draw", "off"] as Tool[]).map((t, i) =>
      `<span style="color:${tool === t ? GOLD : "#8fa4cc"}">[${i === 3 ? 0 : i + 1}] ${TOOL_LABEL[t]}</span>`).join("  ")
    + `<br><span style="color:${walkOn ? RED : "#8fa4cc"}">[G] walkability</span>`
    + `  <span style="color:#8fa4cc">[⌘S] save batch</span>`
    + `  <span style="color:${showFiled ? GOLD : "#8fa4cc"}">[F] filed</span>`
    + `<br><span style="opacity:.65">${open.length} open`
    + `${withShots < open.length ? `, ${withShots} with a shot` : ""}`
    + `${filed ? ` · ${filed} filed` : ""}</span>`
    + (open.length > OPEN_WARN
      ? `<br><span style="color:${GOLD}">${open.length} open — worth saving</span>` : "")
    + (rows ? `<br>${rows}` : "");
}

function showEntry(s: Shape): void {
  pending = s;
  entry.style.display = "block";
  entryText.value = "";
  entryText.focus();
}

function hideEntry(): void {
  entry.style.display = "none";
  pending = null;
  pendingShot = "";
  clear(pendingDrawn);
  pendingDrawn = null;
}

function commit(): void {
  if (!pending) return;
  const target = cam.getTarget();
  const nt: Note = {
    n: nextN++,
    shape: pending,
    text: entryText.value.trim(),
    camera: {
      pos: [cam.position.x, cam.position.y, cam.position.z],
      target: [target.x, target.y, target.z],
    },
    daytime: dayFrac(),
    stats: measure(pending),
  };
  notes.push(nt);
  if (pendingShot) shots.set(nt.n, pendingShot);
  clear(pendingDrawn);
  pendingDrawn = null;
  redrawNotes();
  hideEntry();
  persist();
  refreshPanel();
}

// Deleting a FILED note only forgets it locally -- the batch already on disk is
// a snapshot and is not rewritten.
function deleteNote(n: number): void {
  const i = notes.findIndex((x) => x.n === n);
  if (i < 0) return;
  const [nt] = notes.splice(i, 1);
  shots.delete(n);
  redrawNotes();
  persist();
  refreshPanel();
  flash(nt.filed ? `forgot filed note ${n} (batch on disk is unchanged)` : `removed note ${n}`);
}

// Cmd-Z takes the last OPEN note. Popping a filed one would be a surprise:
// it is already written to disk and is showing as history, not as work.
function undoLast(): void {
  const open = openNotes();
  if (!open.length) { flash("nothing open to remove"); return; }
  deleteNote(open[open.length - 1].n);
}

function buildUi(): void {
  panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:10px;top:10px;z-index:9;font:12px/1.6 ui-monospace,monospace;"
    + "color:#f2ead8;background:#141a2ecc;padding:8px 11px;border-radius:6px;max-width:320px;pointer-events:none";
  // The panel itself stays click-through so it never eats a drag; only the ×
  // glyphs opt back in (pointer-events:auto in refreshPanel), and the click
  // still bubbles to here.
  panel.addEventListener("click", (e) => {
    const n = (e.target as HTMLElement)?.dataset?.del;
    if (n) deleteNote(Number(n));
  });
  document.body.appendChild(panel);

  readout = document.createElement("div");
  readout.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9;font:12px/1.6 ui-monospace,monospace;"
    + "color:#8fa4cc;background:#141a2ecc;padding:6px 10px;border-radius:6px;white-space:pre;pointer-events:none";
  document.body.appendChild(readout);

  flashEl = document.createElement("div");
  flashEl.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:10;"
    + "font:12px/1.6 ui-monospace,monospace;color:#ffd479;background:#141a2ee6;padding:6px 12px;"
    + "border-radius:6px;pointer-events:none";
  document.body.appendChild(flashEl);

  entry = document.createElement("div");
  entry.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:11;display:none;"
    + "font:13px/1.5 ui-monospace,monospace;color:#f2ead8;background:#141a2ef2;padding:10px;"
    + "border:1px solid #2f3a5c;border-radius:8px;width:min(620px,80vw)";
  entry.innerHTML = `<div style="opacity:.6;margin-bottom:6px">what is wrong with this area?</div>`
    + `<textarea id="zv-note-text" rows="3" style="width:100%;box-sizing:border-box;background:#0e1424;color:#f2ead8;border:1px solid #2f3a5c;border-radius:5px;padding:7px;`
    + `font:13px/1.5 ui-monospace,monospace;resize:vertical"></textarea>`
    + `<div style="margin-top:7px;display:flex;gap:8px">`
    + `<button id="zv-note-save" style="flex:0 0 auto;background:#3a4a2c;color:#f2ead8;border:1px solid #5b7040;`
    + `border-radius:5px;padding:5px 12px;font:12px ui-monospace,monospace;cursor:pointer">save note (⌘↵)</button>`
    + `<button id="zv-note-drop" style="flex:0 0 auto;background:#3a2c2c;color:#f2ead8;border:1px solid #704040;`
    + `border-radius:5px;padding:5px 12px;font:12px ui-monospace,monospace;cursor:pointer">discard (esc)</button>`
    + `</div>`;
  document.body.appendChild(entry);
  entryText = entry.querySelector("#zv-note-text") as HTMLTextAreaElement;
  entry.querySelector("#zv-note-save")!.addEventListener("click", commit);
  entry.querySelector("#zv-note-drop")!.addEventListener("click", hideEntry);
  entryText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); hideEntry(); }
    // stopPropagation below hides this from the global handler, so the browser's
    // Save Page dialog has to be headed off here too
    if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey)) e.preventDefault();
    e.stopPropagation(); // WASD in a note must not fly the camera
  });
}

// ---------- interaction ----------
// Pick against the terrain (metadata.ground, set in buildTerrain) rather than
// whatever prop is in front of it.
//
// Coordinates come from the EVENT, not from scene.pointerX: Babylon updates
// those from its own listener, which can run after this observer, so a drag
// reads the previous position and the anchor lands a frame behind the cursor.
// Measured: an event at (832, 576) saw scene.pointerX (864, 609), which
// collapsed a 11m circle to its 1m floor. Canvas-relative CSS pixels are what
// scene.pick wants, at any device pixel ratio.
let lastGround: [number, number] | null = null;

function pickGround(ev?: { clientX: number; clientY: number }): [number, number] | null {
  let px = scene.pointerX, py = scene.pointerY;
  if (ev) {
    const r = canvasEl.getBoundingClientRect();
    px = ev.clientX - r.left;
    py = ev.clientY - r.top;
  }
  const hit = scene.pick(px, py, (m) => m.metadata?.ground === true);
  if (!hit?.hit || !hit.pickedPoint) return null;
  lastGround = [hit.pickedPoint.x, hit.pickedPoint.z];
  return lastGround;
}

function setTool(t: Tool): void {
  tool = t;
  if (t === "off") cam.attachControl(canvasEl, true);
  else cam.detachControl();
  canvasEl.style.cursor = t === "off" ? "" : "crosshair";
  refreshPanel();
}

let dragging = false;
let anchor: [number, number] | null = null;
let path: [number, number][] = [];
let strokeWidth = 16;
let dirty = false;

function previewShape(): Shape | null {
  if (!anchor && !path.length) return null;
  const cur = lastGround;
  if (tool === "circle" && anchor && cur) {
    return { kind: "circle", x: anchor[0], z: anchor[1], r: Math.max(1, Math.hypot(cur[0] - anchor[0], cur[1] - anchor[1])) };
  }
  if (tool === "box" && anchor && cur) {
    return {
      kind: "box",
      x0: Math.min(anchor[0], cur[0]), x1: Math.max(anchor[0], cur[0]),
      z0: Math.min(anchor[1], cur[1]), z1: Math.max(anchor[1], cur[1]),
    };
  }
  if (tool === "draw" && path.length > 1) return { kind: "stroke", points: path.slice(), width: strokeWidth };
  return null;
}

function finish(): void {
  let s: Shape | null = null;
  if (tool === "draw") {
    if (path.length < 2) { dragging = false; anchor = null; path = []; return; }
    const simple = simplify(path, SIMPLIFY_EPS);
    const a = simple[0], b = simple[simple.length - 1];
    // one gesture, two shapes: end near where you started and it is a region
    s = Math.hypot(a[0] - b[0], a[1] - b[1]) < CLOSE_DIST && simple.length > 3
      ? { kind: "lasso", points: simple }
      : { kind: "stroke", points: simple, width: strokeWidth };
  } else {
    s = previewShape();
  }
  dragging = false;
  anchor = null;
  path = [];
  if (!s) return;
  clear(pendingDrawn);
  pendingDrawn = draw(s, CYAN, "pending");
  // capture with the shape drawn but before the entry panel exists in the DOM
  // (the panel is DOM, not canvas, so it never lands in the picture anyway)
  void requestShot().then((png) => { pendingShot = png; });
  showEntry(s);
}

export function initAnnotate(opts: {
  zone: string; size: number;
  camera: ArcRotateCamera | UniversalCamera;
  canvas: HTMLCanvasElement;
}): void {
  zoneKey = opts.zone;
  zoneSize = opts.size;
  cam = opts.camera;
  canvasEl = opts.canvas;

  buildUi();
  restore();
  refreshPanel();

  // dev handle, the way main.ts exposes __vanai: the interaction state is all
  // module-local, and a drag that goes wrong is otherwise unreadable from
  // outside
  (window as unknown as Record<string, unknown>).__annotate = {
    state: () => ({ tool, dragging, anchor, lastGround, path: path.slice(), notes }),
    notes: () => notes,
  };

  scene.onAfterRenderObservable.add(serveShot);

  scene.onBeforeRenderObservable.add(() => {
    if (!dirty) return;
    dirty = false;
    const s = previewShape();
    clear(pendingDrawn);
    pendingDrawn = s ? draw(s, CYAN, "pending") : null;
  });

  scene.onPointerObservable.add((pi) => {
    if (tool === "off") return;
    const t = pi.type;
    if (t === PointerEventTypes.POINTERDOWN) {
      const p = pickGround(pi.event);
      if (!p) return;
      pi.event.preventDefault();
      dragging = true;
      if (tool === "draw") { path = [p]; anchor = null; } else { anchor = p; }
      dirty = true;
    } else if (t === PointerEventTypes.POINTERMOVE) {
      const p = pickGround(pi.event);
      if (p) {
        readout.textContent = `x ${p[0].toFixed(0)}  z ${p[1].toFixed(0)}`
          + `  y ${groundHeight(p[0], p[1]).toFixed(1)}m`
          + `  ${isWalkable(p[0], p[1]) ? "walkable" : "UNWALKABLE"}`
          + (tool === "draw" ? `\nstroke width ${strokeWidth}m (scroll)` : "");
      }
      if (!dragging) return;
      if (tool === "draw" && p) {
        const last = path[path.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= DRAW_STEP) path.push(p);
      }
      dirty = true;
    } else if (t === PointerEventTypes.POINTERUP) {
      pickGround(pi.event); // the release position is the final radius/corner
      if (dragging) finish();
    } else if (t === PointerEventTypes.POINTERWHEEL) {
      if (tool !== "draw") return;
      const ev = pi.event as WheelEvent;
      ev.preventDefault();
      strokeWidth = Math.max(2, Math.min(120, strokeWidth + (ev.deltaY > 0 ? -2 : 2)));
      dirty = true;
    }
  });

  addEventListener("keydown", (e) => {
    if (document.activeElement === entryText) return;
    if (e.key === "1") setTool("circle");
    else if (e.key === "2") setTool("box");
    else if (e.key === "3") setTool("draw");
    else if (e.key === "0" || e.key === "Escape") setTool("off");
    else if (e.key === "g" || e.key === "G") toggleWalk();
    else if (e.key === "f" || e.key === "F") {
      showFiled = !showFiled;
      redrawNotes();
      refreshPanel();
    }
    // Cmd/Ctrl-S, not bare S: 83 is cam.keysDown in zoneview, so a plain S both
    // backs the camera up and saved the batch. preventDefault stops the
    // browser's own Save Page dialog.
    else if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void saveBatch();
    }
    else if (e.key === "z" && (e.metaKey || e.ctrlKey)) undoLast();
  });
}
