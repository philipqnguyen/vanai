// Heartwood's resin lamps, drawn (tmp/heartwood-night PLAN.md step L2). Where
// they stand is heartwood-lamps-plan.ts; what they are is the generated
// client/public/models/heartwood/hw_lamps.glb (tools/assets/build_heartwood_lamps.mjs).
//
// SIX DRAWS AND ONE GLOW DRAW, whatever the count: each piece of the GLB is one
// template mesh carrying every lamp's matrix as a thin instance (the crook, the
// wall arm and the rail arm in the city's own hw_living_bark; the cage and leaf
// cap in hw_city_honey, so neither wood compiles a new shader of its own; the
// resin and the halo their own). Only the resin is in the glow pass.
//
// NIGHT ONLY. The resin's emissive and glow follow the shared night amount
// (scene.ts registerNightRamp: 0 by day), and the halo's visibility is the
// night amount itself, disabled at 0: by day a lamp is dark amber and wood.
//
// DECORATION ONLY: no collider, never pickable, never a floor or paving, and
// nothing casts a shadow (the wood receives). The planner keeps every crook
// off the walk lines; here a crook that lands on a blocked cell (isWalkable)
// is dropped, never moved, and the count is logged.
//
// The GLB is read here rather than through the glTF loader: the pieces are
// plain buffers, and the loader would build three PBR materials only to throw
// them away, and after every load raises every material's
// maxSimultaneousLights to the scene's light count (BASELINE.md §3).
import { Mesh, VertexData, StandardMaterial, Color3, Matrix, Material, Constants } from '@babylonjs/core';
import { scene, glow, groundHeight, isWalkable, registerNightRamp, nightAmount } from './scene';
import { planHeartwoodLamps, lampCityOf, type Lamp, type LampPiece } from './heartwood-lamps-plan';
import { HW_NIGHT } from './heartwood-night';

const GLB_URL = '/models/heartwood/hw_lamps.glb';
// The resin: a dark amber by day (the prototype's (.80, .47, .15) read as a
// lit gourd in full sun), its emissive (1, 0.36, 0.07) x 0.9 at full night and
// glow-pass strength 8 (the layer's 32-pixel kernel only whitens a lamp this
// small; the halo gives the bloom).
const RESIN_DIFFUSE = new Color3(.50, .29, .09), RESIN_NIGHT = new Color3(1, .36, .07).scale(.9), RESIN_GLOW = 8;
// Outdoors a lamp binds the hemi, the sun or moon and the crystal (every hearth
// is scoped to its own home); 4 leaves one in hand. Set explicitly, though a
// kit glTF that loads later still raises it to the scene's light count
// (BASELINE.md §3; MEASURED 47 at runtime): what binds is the 3 unscoped lights.
const LAMP_LIGHTS = 4;

type Piece = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; colors?: Float32Array; indices: Uint16Array };

/** The GLB's pieces back in Babylon's space: the generator negated x and
 * reversed each triangle for glTF; undo exactly that. */
function readLampGlb(buf: ArrayBuffer): Map<string, Piece> {
  const dv = new DataView(buf), jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const bin = 20 + jsonLen + 8;
  const read = (i: number) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    return a.componentType === 5123 ? new Uint16Array(buf.slice(bin + v.byteOffset, bin + v.byteOffset + n * 2)) : new Float32Array(buf.slice(bin + v.byteOffset, bin + v.byteOffset + n * 4));
  };
  const out = new Map<string, Piece>();
  for (const node of json.nodes) {
    const prim = json.meshes[node.mesh].primitives[0], at = prim.attributes;
    const positions = read(at.POSITION) as Float32Array, normals = read(at.NORMAL) as Float32Array, indices = read(prim.indices) as Uint16Array;
    for (let i = 0; i < positions.length; i += 3) { positions[i] = -positions[i]; normals[i] = -normals[i]; }
    for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
    out.set(node.name, { positions, normals, indices, uvs: read(at.TEXCOORD_0) as Float32Array, colors: at.COLOR_0 === undefined ? undefined : read(at.COLOR_0) as Float32Array });
  }
  return out;
}

/** A lamp where it stands: its fixture's base height, and the point its
 * resin hangs at (base + hook), which is where the pools (heartwood-pools.ts)
 * take its light from. */
export type PlacedLamp = Lamp & { base: number; light: [number, number, number] };
export interface HeartwoodLamps {
  /** The lamps that stand, every one the plan made but a crook on a blocked
   * cell. Worked out on the first call, which must come after the zone build
   * (it reads groundHeight and isWalkable); the drawing and the pools share
   * the one list. */
  placed(): { placed: PlacedLamp[]; dropped: number };
}

/** Plans the lamps now (the city's plan is complete) and draws them once the
 * GLB arrives. `city` is inspectHeartwoodCity()'s object; `bark` and `honey`
 * the city's own woods. */
export function buildHeartwoodLamps(city: unknown, bark: StandardMaterial, honey: StandardMaterial): HeartwoodLamps {
  const owner = scene, t0 = performance.now();
  // the hand-kept fills (LAMP_ADD / LAMP_SKIP) ride on HW_NIGHT.fills; a row
  // the rules refuse is never placed, and says so here
  const plan = planHeartwoodLamps(lampCityOf(city, owner.metadata?.songSteps ?? null), { fills: HW_NIGHT.fills });
  for (const r of plan.fills.refused) console.warn(`[heartwood lamps] hand row refused (${r.rule}): ${r.why}`);
  const planMs = performance.now() - t0;
  let memo: { placed: PlacedLamp[]; dropped: number } | null = null;
  const placedLamps = () => {
    if (memo) return memo;
    // Each lamp's base height, from the plan or the floor under it; a crook
    // on a blocked cell is dropped (only ever dropped: the plan keeps the rest).
    const placed: PlacedLamp[] = [];
    let dropped = 0;
    for (const l of plan.lamps) {
      if (l.piece === 'crook' && !isWalkable(l.x, l.z)) { dropped++; continue; }
      const base = l.y ?? Math.max(...l.sample.map(([x, z]) => groundHeight(x, z, l.floorHint ?? undefined))) + l.lift;
      placed.push({ ...l, base, light: [l.x + l.hook[0], base + l.hook[1], l.z + l.hook[2]] });
    }
    return (memo = { placed, dropped });
  };
  fetch(GLB_URL).then((r) => { if (!r.ok) throw new Error(`${GLB_URL}: ${r.status}`); return r.arrayBuffer(); }).then((buf) => {
    if (owner !== scene || owner.isDisposed) return;
    const t1 = performance.now();
    const pieces = readLampGlb(buf);
    const { placed, dropped } = placedLamps();
    const matrices = (list: { x: number; y: number; z: number; yaw: number }[]) => {
      const m = new Float32Array(list.length * 16), tmp = new Matrix();
      list.forEach((p, i) => { Matrix.RotationYToRef(p.yaw, tmp); tmp.setTranslationFromFloats(p.x, p.y, p.z); tmp.copyToArray(m, i * 16); });
      return m;
    };
    const supports = (piece: LampPiece) => placed.filter((l) => l.piece === piece).map((l) => ({ x: l.x, y: l.base, z: l.z, yaw: l.yaw }));
    const hooks = placed.map((l) => ({ x: l.x + l.hook[0], y: l.base + l.hook[1], z: l.z + l.hook[2], yaw: l.yaw }));

    const resin = new StandardMaterial('hwlamp_resin', owner);
    resin.diffuseColor = RESIN_DIFFUSE.clone(); resin.specularColor = new Color3(.35, .3, .22); resin.specularPower = 40;
    resin.emissiveColor = Color3.Black(); resin.maxSimultaneousLights = LAMP_LIGHTS; resin.metadata = { glow: 0 };
    registerNightRamp(resin, { emissiveDay: Color3.Black(), emissiveNight: RESIN_NIGHT, glowDay: 0, glowNight: RESIN_GLOW });
    const haloMat = new StandardMaterial('hwlamp_halo', owner);
    haloMat.disableLighting = true; haloMat.emissiveColor = Color3.White(); haloMat.diffuseColor = Color3.Black(); haloMat.specularColor = Color3.Black();
    haloMat.transparencyMode = Material.MATERIAL_ALPHABLEND; haloMat.alphaMode = Constants.ALPHA_ADD; haloMat.disableDepthWrite = true;
    haloMat.backFaceCulling = false; haloMat.fogEnabled = false; haloMat.maxSimultaneousLights = LAMP_LIGHTS;

    const make = (piece: string, mat: StandardMaterial, at: { x: number; y: number; z: number; yaw: number }[], receive: boolean) => {
      const p = pieces.get(piece);
      if (!p || !at.length) return null;
      const m = new Mesh('hwlamp_' + piece, owner), vd = new VertexData();
      vd.positions = p.positions; vd.normals = p.normals; vd.uvs = p.uvs; vd.indices = p.indices; if (p.colors) vd.colors = p.colors;
      vd.applyToMesh(m, false);
      m.material = mat; m.isPickable = false; m.checkCollisions = false; m.receiveShadows = receive;
      m.metadata = { hwPart: 'lamp_' + piece };
      m.thinInstanceSetBuffer('matrix', matrices(at), 16, true);
      m.thinInstanceRefreshBoundingInfo(false);
      m.doNotSyncBoundingInfo = true;
      m.freezeWorldMatrix();
      return m;
    };
    const wood = [make('crook', bark, supports('crook'), true), make('wall_arm', bark, supports('wall_arm'), true), make('rail_arm', bark, supports('rail_arm'), true), make('lamp_wood', honey, hooks, true)];
    make('lamp_resin', resin, hooks, false);
    const halo = make('halo', haloMat, hooks, false);
    if (glow) for (const m of [...wood, halo]) if (m) glow.addExcludedMesh(m);
    if (halo) {
      halo.alphaIndex = 6;
      // the halo is the night amount: visibility N, out of the scene at 0
      let last = NaN;
      const step = () => {
        const n = nightAmount();
        if (!(Math.abs(n - last) > .002) && !((n === 0 || n === 1) && n !== last)) return;
        last = n; halo.visibility = n; halo.setEnabled(n > 0);
      };
      step(); owner.onBeforeRenderObservable.add(step);
    }
    const kinds: Record<string, number> = {};
    for (const l of placed) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
    owner.metadata = { ...owner.metadata, heartwoodLamps: { placed: placed.length, planned: plan.lamps.length, dropped, missed: plan.missed, fills: { added: plan.fills.added, skipped: plan.fills.skipped, refused: plan.fills.refused.length, droppedFills: plan.lamps.filter((l) => l.fill).length - placed.filter((l) => l.fill).length }, kinds, planMs: +planMs.toFixed(1), installMs: +(performance.now() - t1).toFixed(1), lamps: placed } };
    console.info(`[heartwood lamps] ${placed.length} of ${plan.lamps.length} placed, ${dropped} dropped on blocked ground`);
  }).catch((e) => { if (owner === scene && !owner.isDisposed) console.error('[heartwood lamps]', e); });
  return { placed: placedLamps };
}
