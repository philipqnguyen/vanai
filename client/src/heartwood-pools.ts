// Heartwood's lamp light (tmp/heartwood-night PLAN.md step L3): the resin
// lamps (heartwood-lamps.ts) light the walks around them with NO LIGHTS AND
// NO DRAWS. Their pools are baked once into a texture over the city
// (heartwood-pools-bake.ts, which says how and why), and a material plugin on
// the few materials the walks and walls are made of adds it as diffuse light.
//
// WHAT TAKES THE LIGHT: the terrain, the paving, the strand and brook sand,
// the living bark (trunks, walls, the lamps' own crooks), the honey wood
// (floors, decks, rings, bridges, the lamp cages), the roof moss, the rope and
// the meadow grass. Not the leaves, the kit ferns, the canopy, the notice
// boards, the glass, the water: they would cost a compile each for light
// nobody would see. Avatars, NPCs and PBR kit pieces stay on L1's warm hemi.
//
// NO NEW UNIFORM BLOCK: the plugin's uniforms sit in the material's own UBO
// (WebKit allows 12 blocks a program); one sampler joins the material's.
//
// ATTACHED BEFORE THE FIRST FRAME, so it joins each material's first compile
// instead of forcing a second; the bake waits for that moment too, because a
// crook's height is groundHeight's answer and the zone build must be over.
// The meadow's material only exists once buildZone has finished.
//
// NIGHT ONLY: the gain is the night amount (scene.ts nightAmount), so by day
// the added term is exactly 0 and every pixel is today's.
import { MaterialPluginBase, RawTexture, Texture, type Material, type Scene, type UniformBuffer } from '@babylonjs/core';
import { scene, circleColliders, nightAmount } from './scene';
import { bakePoolLayers, POOL_BOUNDS, POOL_RES, POOL_STORE, POOL_SPAN, type PoolSource, type PoolCircle, type PoolHome } from './heartwood-pools-bake';
import type { HeartwoodLamps, PlacedLamp } from './heartwood-lamps';
import { DOOR_LIFT } from './heartwood-lamps-plan';

/** Pool strength at full night. */
export const POOL_GAIN = 1.0;
/** A deep resin amber, warmer than the hearths' #ffe0ad, so the walks read as
 * lamplight and the windows as hearthlight. */
const POOL_TINT: [number, number, number] = [1.0, .70, .40];
const POOL_MATERIALS = /^(groundmat|hw2_strandsand|riversand|hw_living_bark|hw_city_honey|hw_city_moss|hw_hemp_rope|meadowmat)$|^path_mossy_cobblestone(\||$)/;
/** Materials that read the pool per VERTEX, not per pixel: the meadow's
 * cards overdraw many layers deep, and per pixel they were most of the
 * pool's cost in WebKit (cross-page gate, 8 pairs, against 77385a8f, the
 * whole night plan: d_aerial_district 1.105 with the meadow per pixel, 1.043
 * without it, 1.050 per vertex; c_square_hall 1.068 / 1.045 / 1.037; MEASURED,
 * steps/L3/perf/gate-webkit-0.6-dco8*.json). A blade is small beside a
 * 5-14 m pool, so its vertices sample it well. */
const POOL_PER_VERTEX = new Set(['meadowmat']);
/** A material's own share of the pool. The meadow's blades are bright and
 * stand up into the light, so at the full gain a pool on the grass burned
 * lime beside the cobbles; the honey wood is the brightest albedo the lamps
 * fall on, and a terrace doorstep under two door lamps, the hearth's spill
 * and the terrace's rail lamps burned orange (by eye, cu3, d and
 * n_courtyard_garden, 2026-10-10). */
const POOL_SHARE: Record<string, number> = { meadowmat: .55, hw_city_honey: .75 };
/** Each lamp's strength by kind (the prototype's, MEASURED to read): the
 * rails a little under a lane crook; a door lamp less (.85 in the prototype):
 * there are two to a door and the hearth spills between them. */
const STRENGTH: Record<string, number> = { door: .7, ring: .9, bridge: .9, stair: .9, terrace: .9, brook: .95 };
/** The hearth's spill out of each door: a small pool on the doorstep, as if
 * the open door let the fire out. */
const SPILL = { R: 5, I: .4, out: 2.4, up: 2.2 };
const RAIL_LIFT = 1.12, RAIL_DECK = .65;
/** The wall test's step (m): about half a texel, so its two fetches straddle
 * a wall's 0.3 m to the next texel, not the next pool. */
const WALL_STEP = .6;
/** How far in front of a wall (m, along its normal) it reads the light that
 * falls on it, beside its own texel: past the wall's .42 m shell and most of
 * a texel, so an outer face reads the doorstep, not the bilinear blend with
 * the room behind it (heartwood-pools-bake.ts DOOR_THROAT). */
const WALL_FRONT = .9;

type PoolState = { tex: RawTexture | null; gain: number; y0: number };

export class HwPoolPlugin extends MaterialPluginBase {
  private st: PoolState;
  private share: number;
  private perVertex: boolean;
  /** the wall test below (HWPOOLWALL); a switch for A/B measuring */
  wall = true;
  /** the front read as a fetch (HWPOOLFRONT); off, it is extrapolated
   * along the slope the wall test already read, no fetch. In-page in WebKit
   * the two were within noise of each other (MEASURED, steps/L3/fix2/perf/
   * front-ab-webkit.json), so the fetch, which reads what is there. */
  front = true;
  constructor(material: Material, st: PoolState, share = 1, perVertex = false) {
    super(material, 'HwPool', 250, { HWPOOL: false, HWPOOLV: false, HWPOOLWALL: false, HWPOOLFRONT: false });
    this.st = st; this.share = share; this.perVertex = perVertex;
    this._enable(true);
  }
  getClassName(): string { return 'HwPoolPlugin'; }
  prepareDefines(defines: Record<string, unknown>): void { defines.HWPOOL = !this.perVertex; defines.HWPOOLV = this.perVertex; defines.HWPOOLWALL = !this.perVertex && this.wall; defines.HWPOOLFRONT = !this.perVertex && this.wall && this.front; }
  getSamplers(samplers: string[]): void { samplers.push('hwPoolTex'); }
  getUniforms() {
    return {
      ubo: [{ name: 'hwPoolBox', size: 4, type: 'vec4' }, { name: 'hwPoolTint', size: 4, type: 'vec4' }, { name: 'hwPoolGain', size: 1, type: 'float' }],
      vertex: '#ifdef HWPOOLV\nuniform vec4 hwPoolBox;\nuniform vec4 hwPoolTint;\nuniform float hwPoolGain;\n#endif\n',
      fragment: '#if defined(HWPOOL) || defined(HWPOOLV)\nuniform vec4 hwPoolBox;\nuniform vec4 hwPoolTint;\nuniform float hwPoolGain;\n#endif\n',
    };
  }
  bindForSubMesh(ubo: UniformBuffer): void {
    const s = this.st;
    ubo.updateFloat4('hwPoolBox', POOL_BOUNDS.x0, POOL_BOUNDS.z0, 1 / POOL_BOUNDS.wx, 1 / POOL_BOUNDS.wz);
    ubo.updateFloat4('hwPoolTint', POOL_TINT[0], POOL_TINT[1], POOL_TINT[2], s.y0);
    ubo.updateFloat('hwPoolGain', s.gain * this.share);
    if (s.tex) ubo.setTexture('hwPoolTex', s.tex);
  }
  getCustomCode(shaderType: string): Record<string, string> | null {
    const span = POOL_SPAN.toFixed(1);
    if (shaderType === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: '#ifdef HWPOOLV\nuniform sampler2D hwPoolTex;\nvarying float vHwPool;\n#endif\n',
      // the fragment's sum below, once per vertex
      CUSTOM_VERTEX_MAIN_END: `
#ifdef HWPOOLV
vec4 hwP=textureLod(hwPoolTex,(vPositionW.xz-hwPoolBox.xy)*hwPoolBox.zw,0.);
float hwD0=vPositionW.y-hwPoolTint.w-hwP.g*${span},hwD1=vPositionW.y-hwPoolTint.w-hwP.a*${span};
vHwPool=hwP.r*smoothstep(-7.5,-4.5,hwD0)*(1.-smoothstep(.5,5.,hwD0))+hwP.b*smoothstep(-7.5,-4.5,hwD1)*(1.-smoothstep(.5,5.,hwD1));
#ifdef NORMAL
vHwPool*=(.45+.55*clamp(vNormalW.y,0.,1.))*smoothstep(-.55,.05,vNormalW.y);
#endif
#endif
`,
    };
    if (shaderType !== 'fragment') return null;
    return {
      // hwPoolAt: the map's light at uv for a fragment dy m over the map's
      // base, each layer windowed by height: full from 4.5 m below its lamps
      // to 0.5 m above, gone by 7.5 m below and 5 m above, so a deck's pool
      // never falls on the lane under it and a lane's never climbs a trunk
      // past its lamp. textureLod: it is also read inside the wall branch
      // below, and the map has no mips, so it is the same fetch.
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef HWPOOL
uniform sampler2D hwPoolTex;
float hwPoolAt(vec2 uv,float dy){vec4 p=textureLod(hwPoolTex,uv,0.);float d0=dy-p.g*${span},d1=dy-p.a*${span};
return p.r*smoothstep(-7.5,-4.5,d0)*(1.-smoothstep(.5,5.,d0))+p.b*smoothstep(-7.5,-4.5,d1)*(1.-smoothstep(.5,5.,d1));}
#endif
#ifdef HWPOOLV
varying float vHwPool;
#endif
`,
      // Floors take it all, walls about half, a face turned down none (a
      // deck's underside must not catch the lamp standing on it).
      //
      // A WALL TAKES IT ONLY ON THE FACE TURNED TO THE LIGHT. The map is a
      // 1.13 x 0.94 m bilinear grid, so the lit texels just outside a home's
      // ring reach the inner face of its wall 0.3 m inside: from inside a
      // home its walls glowed amber with the door lamps hung outside them
      // (MEASURED, review-L3 r8_inside_elders_rest: the inner wall over the
      // door 33.1 -> 52.3 luma with the pools on). The map's own slope says
      // where the light comes from (it rises toward the lamp and falls into
      // a wall's or a trunk's shadow), so a wall facing down that slope takes
      // none and one across it half. Two more fetches, only on a lit
      // fragment of a wall; where the map is flat (inside a pool's plateau)
      // the slope says nothing and the wall keeps the plain half. A door gap
      // is level across the wall line unless the bake cuts the room's share
      // (DOOR_THROAT), which it does so the slope there points out too.
      //
      // A WALL READS THE LIGHT IN FRONT OF IT as well (WALL_FRONT m along its
      // normal, the larger of the two): the cut room behind an outer face
      // would otherwise dim it through the bilinear blend (MEASURED, the arch
      // seen from the street lost 23-42% of its pool with the cut alone).
      // An inner face reads the room in front of it, and the gate still
      // decides. At most 3x its own texel, so a face just over the branch's
      // .002 threshold cannot jump to a lit front: no hard edge there.
      CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef HWPOOL
vec2 hwUV=(vPositionW.xz-hwPoolBox.xy)*hwPoolBox.zw;
float hwDy=vPositionW.y-hwPoolTint.w,hwC=hwPoolAt(hwUV,hwDy);
float hwI=hwC*(.45+.55*clamp(normalW.y,0.,1.))*smoothstep(-.55,.05,normalW.y);
#ifdef HWPOOLWALL
if(hwI>.002&&normalW.y<.8){
vec2 hwG=vec2(hwPoolAt(hwUV+vec2(${WALL_STEP}*hwPoolBox.z,0.),hwDy)-hwC,hwPoolAt(hwUV+vec2(0.,${WALL_STEP}*hwPoolBox.w),hwDy)-hwC)*${(1 / WALL_STEP).toFixed(4)};
float hwGl=length(hwG),hwNl=length(normalW.xz),hwWl=1.-smoothstep(.55,.8,normalW.y);
float hwF=smoothstep(-.6,.6,dot(normalW.xz,hwG)/max(hwGl*hwNl,1e-5));
#ifdef HWPOOLFRONT
float hwCf=hwPoolAt(hwUV+normalW.xz/max(hwNl,1e-5)*${WALL_FRONT.toFixed(2)}*hwPoolBox.zw,hwDy);
#else
float hwCf=hwC+${WALL_FRONT.toFixed(2)}*dot(normalW.xz,hwG)/max(hwNl,1e-5);
#endif
hwI*=mix(1.,hwF,smoothstep(.01,.04,hwGl)*hwWl)*mix(1.,clamp(hwCf/hwC,1.,3.),hwWl);
}
#endif
color.rgb+=hwPoolTint.rgb*(hwPoolGain*hwI)*baseColor.rgb*vDiffuseColor.rgb;
#endif
#ifdef HWPOOLV
color.rgb+=hwPoolTint.rgb*(hwPoolGain*vHwPool)*baseColor.rgb*vDiffuseColor.rgb;
#endif
`,
    };
  }
}

type City = { homes: { x: number; z: number; r: number; y: number; door?: number; doorHalf?: number; gaps?: { a: number; half: number }[] }[]; trees: { x: number; z: number }[] };

/** The floor under a lamp's light: a crook stands on it, a wall arm is
 * DOOR_LIFT over its home's floor (the plan's floorHint is floor + .5), a
 * rail arm RAIL_LIFT over its rail, which stands on the deck the plan names
 * (a brook bridge's rail .65 over its deck). */
function lampSource(l: PlacedLamp): PoolSource {
  const floor = l.piece === 'crook' ? l.base : l.piece === 'wall_arm' ? (l.floorHint ?? l.base) - .5 : l.floorHint ?? l.base - RAIL_LIFT - RAIL_DECK;
  return { x: l.light[0], z: l.light[2], y: l.light[1], floor, R: l.R, I: STRENGTH[l.kind] ?? 1, layer: l.layer === 'upper' ? 1 : 0 };
}

/** One call at the end of buildHeartwoodCity (behind HW_NIGHT.pools): the
 * map is baked and the plugin attached just before the first frame. */
export function buildHeartwoodPools(city: City, lamps: HeartwoodLamps | null): void {
  const owner: Scene = scene, st: PoolState = { tex: null, gain: 0, y0: 0 };
  owner.onBeforeRenderObservable.addOnce(() => {
    if (owner !== scene || owner.isDisposed) return;
    const t0 = performance.now();
    const placed = lamps ? lamps.placed().placed : [];
    const sources = placed.map(lampSource);
    // the hearth's spill on each doorstep, on the layer its door lamps light
    for (const h of city.homes) {
      const door = h.door ?? 0, own = placed.find((l) => l.kind === 'door' && Math.abs(l.base - h.y - DOOR_LIFT) < 1e-6 && Math.abs(Math.hypot(l.x - h.x, l.z - h.z) - h.r) < .1);
      sources.push({ x: h.x + Math.sin(door) * (h.r + SPILL.out), z: h.z + Math.cos(door) * (h.r + SPILL.out), y: h.y + SPILL.up, floor: h.y, R: SPILL.R, I: SPILL.I, layer: own?.layer === 'upper' ? 1 : 0 });
    }
    const homes: PoolHome[] = city.homes.map((h) => ({ x: h.x, z: h.z, r: h.r, y: h.y, door: h.door ?? 0, doorHalf: h.doorHalf ?? 1.55, ...(h.gaps ? { gaps: h.gaps } : {}) }));
    // the circles that shadow: a trunk, a post, a planter; not a sapling
    // (.55), and not a home's own (its wall is the home's ring above)
    const circles: PoolCircle[] = circleColliders.filter((c) => c.r >= .8 && !homes.some((h) => Math.hypot(c.x - h.x, c.z - h.z) < .5 && Math.abs(c.r - h.r) < 1.5))
      .map((c) => ({ x: c.x, z: c.z, r: c.r, trunk: c.r > 3 && city.trees.some((t) => Math.hypot(c.x - t.x, c.z - t.z) < 3) }));
    const bake = bakePoolLayers(sources, circles, homes, POOL_RES);
    const tex = RawTexture.CreateRGBATexture(bake.data, POOL_RES, POOL_RES, owner, false, false, Texture.BILINEAR_SAMPLINGMODE);
    tex.name = 'hw_pool_map'; tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    st.tex = tex; st.y0 = bake.y0;
    const patched: string[] = [];
    for (const m of owner.materials) {
      if (m.getClassName() !== 'StandardMaterial' || !POOL_MATERIALS.test(m.name)) continue;
      new HwPoolPlugin(m, st, POOL_SHARE[m.name] ?? 1, POOL_PER_VERTEX.has(m.name)); patched.push(m.name);
    }
    const night = () => { st.gain = POOL_GAIN * POOL_STORE * nightAmount(); };
    night(); owner.onBeforeRenderObservable.add(night);
    owner.metadata = { ...owner.metadata, heartwoodPools: { lamps: placed.length, spills: city.homes.length, circles: circles.length, trunks: circles.filter((c) => c.trunk).length, splats: bake.splats, y0: bake.y0, res: POOL_RES, bakeMs: +bake.ms.toFixed(1), installMs: +(performance.now() - t0).toFixed(1), patched } };
    console.info(`[heartwood pools] ${sources.length} pools baked in ${bake.ms.toFixed(0)} ms, on ${patched.length} materials`);
  });
}
