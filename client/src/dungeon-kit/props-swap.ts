// Dungeon props: the swap from a CC0 prop path to an ORIGINAL prop, Babylon-free.
//
// Philip, 2026-10-11: "replace cc0 props in the dungeons that look cartoonish
// with your own creations". The dungeon modules keep calling
// kit.props.place({ file: 'props/Barrel.gltf', ... }) exactly as before; when
// the index (dprops-index.json, written by tools/assets/build_dungeon_props.mjs
// from each family's `replaces` lists) names that path, PropPools draws the
// original prop in its place instead. Flipping a CC0 file to an original is a
// line in a family file and a rebuild, never an edit to a dungeon module.
//
// FIT. A module's `scale` was tuned to the CC0 model (a keg at 0.62 to sit in
// its 0.65 m collider, a table at 0.8 so the books on it sit at 0.84). The new
// prop takes the size the CC0 one had where it stood: 'height' (default)
// scales it uniformly so its height equals the placed CC0 height, so authoring
// a prop at the CC0 file's typical placed height keeps every usage's own
// variation (a barrel at 1.0-1.3) while the proportions stay real; 'footprint'
// matches the larger plan side (rugs, plates, loose sheets: things with no
// height to speak of); 'real' ignores the scale; 'placement' is the authored
// size times the placement's scale (a prop authored at the CC0 file's own
// size, hung on something the module builds). The new prop's plan centre
// lands where the CC0 model's plan centre landed (KayKit pieces are not all
// centred on their origin), unless the entry names a `pivot`: the point in the
// CC0 file's frame, scaled and turned with the placement, where the new prop's
// origin goes (a banner's rod on the module's rod at every scale).
//
// TINT. One instance colour multiplies the whole prop (vertex colour and
// atlas): the Lodge's dark oak, the Furnace's soot, the Ballroom's gilt. An
// entry's tint for the CC0 file ('*' or a theme key) times the prop's own tint
// for the theme; none means no colour buffer at all.
//
// This file and the generator agree on the index's shape; the node test
// (client/test/dungeon_props.test.mjs) pins the maths and the index.

export type V3 = [number, number, number];

export interface DPropInfo {
  /** the pack (family) GLB it is in: /models/dprops/<pack>.glb */
  pack: string;
  /** authored bounds, Babylon space, metres; base at y 0, plan centre at 0 */
  min: V3; max: V3;
  tris: number; farTris: number;
  /** a far mesh exists (node `<id>__far` in the pack) */
  far: boolean;
  /** small props never draw in far (LOD) rooms whatever the placement says */
  small: boolean;
  /** per-theme instance colour (hex), '*' for every theme */
  tint?: Record<string, string>;
}

export type Fit = 'height' | 'footprint' | 'real' | 'placement';
export interface SwapEntry {
  /** the original prop id, or variants picked by placement (deterministic) */
  to: string | string[];
  fit?: Fit;
  /** extra uniform factor on top of the fit */
  scale?: number;
  /** offset in the new prop's own frame (m, after the fit) */
  offset?: V3;
  /** where the new prop's origin lands, in the CC0 file's frame (scaled and turned with the placement), instead of matching plan centres and bases */
  pivot?: V3;
  /** added to the placement's yaw: the CC0 model's front was not +z */
  dyaw?: number;
  /** instance colour for this CC0 file: '*' or a theme key (hex) */
  tint?: Record<string, string>;
  /** the CC0 model's measured bounds (env_manifest_cc0.json), copied in by the generator */
  from: { min: V3; max: V3 };
}

export interface DPropIndex {
  /** the shared atlas, under /models/dprops/ */
  atlas: { diffuse: string; normal: string; specular: string; emissive: string };
  packs: Record<string, string>;
  props: Record<string, DPropInfo>;
  swap: Record<string, SwapEntry>;
}

export interface SwapInput { file: string; x: number; y: number; z: number; yaw?: number; scale?: number; far?: boolean }
export interface SwapResult { id: string; x: number; y: number; z: number; yaw: number; scale: number; far: boolean; color: V3 | null }

export function hexRgb(h: string): V3 {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** a small stable hash of a placement, to pick a variant */
function pick(n: number, x: number, z: number): number {
  const h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663);
  return ((h >>> 0) % n);
}

/** The original prop that stands in for this CC0 placement, or null to keep the CC0 file. */
export function resolveSwap(idx: DPropIndex, p: SwapInput, theme: string): SwapResult | null {
  const e = idx.swap[p.file];
  if (!e) return null;
  const id = Array.isArray(e.to) ? e.to[pick(e.to.length, p.x, p.z)] : e.to;
  const d = idx.props[id];
  if (!d) return null;
  const s0 = p.scale ?? 1, yaw0 = p.yaw ?? 0;
  const cc = e.from, ccW = cc.max[0] - cc.min[0], ccH = cc.max[1] - cc.min[1], ccD = cc.max[2] - cc.min[2];
  const nW = d.max[0] - d.min[0], nH = d.max[1] - d.min[1], nD = d.max[2] - d.min[2];
  const fit = e.fit ?? 'height';
  let k = fit === 'real' ? 1
    : fit === 'placement' ? s0
    : fit === 'footprint' ? (Math.max(ccW, ccD) * s0) / Math.max(nW, nD, 1e-6)
    : (ccH * s0) / Math.max(nH, 1e-6);
  k *= e.scale ?? 1;
  // Babylon rotation.y: local (x, z) -> (x cos + z sin, -x sin + z cos)
  const rot = (x: number, z: number, a: number): [number, number] => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  const pv = e.pivot;
  // where the CC0 model's plan centre stood (or the pivot), in world
  const [cx, cz] = pv ? rot(pv[0] * s0, pv[2] * s0, yaw0) : rot(((cc.min[0] + cc.max[0]) / 2) * s0, ((cc.min[2] + cc.max[2]) / 2) * s0, yaw0);
  const yaw = yaw0 + (e.dyaw ?? 0);
  // minus the new prop's own plan centre (none at a pivot: its origin goes there), plus the entry's offset, in the new frame
  const o = e.offset ?? [0, 0, 0];
  const [nx, nz] = pv ? rot(o[0], o[2], yaw) : rot(o[0] - ((d.min[0] + d.max[0]) / 2) * k, o[2] - ((d.min[2] + d.max[2]) / 2) * k, yaw);
  const y = p.y + (pv ? pv[1] * s0 : cc.min[1] * s0 - d.min[1] * k) + o[1];
  const t1 = e.tint?.[theme] ?? e.tint?.['*'], t2 = d.tint?.[theme] ?? d.tint?.['*'];
  let color: V3 | null = null;
  if (t1 || t2) {
    const a = t1 ? hexRgb(t1) : [1, 1, 1], b = t2 ? hexRgb(t2) : [1, 1, 1];
    color = [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  }
  return { id, x: p.x + cx + nx, y, z: p.z + cz + nz, yaw, scale: k, far: d.small ? false : (p.far ?? false), color };
}
