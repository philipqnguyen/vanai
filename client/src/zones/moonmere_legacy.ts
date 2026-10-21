// THE LEGACY DIET (GATE-1 levers 1-3, the adversarial perf review's top two
// findings; MOONMERE.md section 12, A-7). Moonmere's island is drawn by the
// shared instancer at a cost bounded by its library -- but around it the scene
// still holds what scene.ts builds for every zone: the zones.json furniture
// (buildLandmarkProps: desks, globes, telescopes, the water clock and its five
// drops, shelves, presses, the props kit's books, scrolls and benches), the
// paving, beach and bed skirt. MEASURED (the perf review, MOONMERE.md A-7): the
// furniture alone was 97-142 draws at every camera -- drawn through closed
// walls from 200 m, in the main pass, again black in the glow pass and again
// per shadow cascade, from inside rooms whose shadows nobody can see -- and the
// causeway's kit (since retired) another 40-70 at the arrival and Mere Walk views. This is the
// caller's answer, with no change to scene.ts or the shared instancer:
//
//   1. FURNITURE IS SEEN ONLY NEAR ITS ROOM. Each furniture file is ONE
//      thin-instanced template (models.ts placeExact), one draw a submesh
//      however many desks it holds, so gating the whole file by the camera's
//      distance to its NEAREST instance saves exactly what repacking per
//      instance would. Past FURNITURE_NEAR of every instance it is disabled;
//      it never casts (an interior's shadow falls inside an opaque shell) and
//      never joins the glow pass (nothing that glows stands in a room behind
//      it). The water clock's drops and the desks' label plaques go with it.
//   2. (THE CAUSEWAY KIT's glow, casting and torch gate went with makeCauseway's
//      drawn path, 2026-10-10: the causeway is the Cloisters' own stone, MM-15, A-14.)
//   3. THE GLOW DIET (the Capital's glowDiet rule): what lies on the ground and
//      hides nothing -- the paving, the strand, the bed skirt -- is out of the
//      glow pass from the moment it is made. The terrain stays in (a real
//      occluder of the crystal and the lamps behind a riser).
import { glow, removeShadowCaster, scene } from "../scene";
import type { AbstractMesh, Mesh } from "@babylonjs/core";

/** furniture is drawn while the camera is within this of one of its instances (m) */
export const FURNITURE_NEAR = 34;

// the zones.json furniture by template name (models.ts names a merged
// template `st_<file>_<node>_merged`; a tinted clone `tint_<file>|...`)
const FURNITURE = /^(st_|tint_)(moonmere\/(desk|star_globe|telescope|water_clock|bookcase|seal_press|door)|props\/)/;
// (and the annex door's leaf, moonmere/door.glb's two meshes, inside the Long Tower)
const FURNITURE_LOOSE = /^(clock_drop_|quest_label_|arched oak leaf|door join)/;
const GROUND_GLOW_OUT = /^(mm_paving|mm_pave_|mm_beach|mm_bedskirt)/;
// THE CRYSTAL'S KIT DAIS (A-7): makeTeleportCrystal's dungeon-kit terrace and block
// (tinted #26282c and #4a4e55), its four kit flights (#a4a8ae) and its corner
// posts are hidden -- Moonmere draws the dais in its own stone (crystal_dais,
// moonmere_dress.ts) -- and the builder's collider is kept. (Only the crystal
// places these tinted templates)
const CRYSTAL_DAIS = /^(tint_dungeon\/floor_foundation_allsides\.glb\|#(26282c|4a4e55)|tint_town\/Stairs_Exterior_Straight\.gltf\|#a4a8ae|st_halloween\/fence_pillar)/;

interface Gated { m: AbstractMesh; pts: Float32Array; n: number; cast: boolean }

/** what the diet did, for the QA scripts (window.moonmereLegacy) */
export const legacyStats = { furniture: 0, furnitureOn: 0, glowOut: 0 };

/** Install the diet on the current scene: call at the start of the zone's build. */
export function legacyDiet(): void {
  const owner = scene;
  const layer = glow && owner.effectLayers.includes(glow) ? glow : null;
  const gated: Gated[] = [];
  const hidden: AbstractMesh[] = [];
  const seen = new WeakSet<AbstractMesh>();
  const S = legacyStats;
  for (const k of Object.keys(S) as (keyof typeof S)[]) S[k] = 0;
  (window as unknown as Record<string, unknown>).moonmereLegacy = S;

  const glowOut = (m: AbstractMesh) => { if (layer) { layer.addExcludedMesh(m as Mesh); S.glowOut++; } };
  const classify = (m: AbstractMesh) => {
    if (seen.has(m)) return;
    const n = m.name;
    if (CRYSTAL_DAIS.test(n)) {
      seen.add(m);
      hidden.push(m);
    } else if (FURNITURE.test(n) || FURNITURE_LOOSE.test(n)) {
      seen.add(m);
      glowOut(m);
      gated.push({ m, pts: new Float32Array(0), n: -1, cast: false });
      S.furniture++;
    } else if (GROUND_GLOW_OUT.test(n)) {
      seen.add(m);
      glowOut(m);
    }
  };
  for (const m of owner.meshes) classify(m);
  // a template's name is set before the observable fires (Mesh's constructor);
  // its shadow caster is added after, so casting is undone in the pass below
  const added = owner.onNewMeshAddedObservable.add(classify);

  // where a gated mesh's instances stand: its thin instances' translations, or
  // the mesh itself. Re-read whenever its instance count changes (placeExact
  // adds a file's spots one call at a time, as each resolves)
  const refresh = (g: Gated) => {
    const m = g.m as Mesh;
    const count = m.thinInstanceCount || 0;
    if (count === g.n) return;
    g.n = count;
    if (count > 0) {
      const ms = m.thinInstanceGetWorldMatrices();
      g.pts = new Float32Array(ms.length * 3);
      ms.forEach((w, i) => { const t = w.getTranslation(); g.pts[i * 3] = t.x; g.pts[i * 3 + 1] = t.y; g.pts[i * 3 + 2] = t.z; });
    } else {
      const p = m.getAbsolutePosition();
      g.pts = new Float32Array([p.x, p.y, p.z]);
    }
  };
  let frame = 0;
  const pass = () => {
    const cam = owner.activeCamera;
    if (!cam || ++frame % 6) return;
    const c = cam.globalPosition;
    for (const m of hidden) if (m.isEnabled(false)) { m.setEnabled(false); removeShadowCaster(m); }
    const r2 = FURNITURE_NEAR * FURNITURE_NEAR;
    let on = 0;
    for (const g of gated) {
      if (g.m.isDisposed()) continue;
      if (!g.cast) { removeShadowCaster(g.m); g.cast = true; }
      refresh(g);
      let near = false;
      for (let i = 0; i < g.pts.length && !near; i += 3) {
        const dx = g.pts[i] - c.x, dy = g.pts[i + 1] - c.y, dz = g.pts[i + 2] - c.z;
        near = dx * dx + dy * dy + dz * dz < r2;
      }
      if (g.m.isEnabled(false) !== near) g.m.setEnabled(near);
      if (near) on++;
    }
    S.furnitureOn = on;
  };
  const obs = owner.onBeforeRenderObservable.add(pass);
  owner.onDisposeObservable.addOnce(() => {
    owner.onNewMeshAddedObservable.remove(added);
    owner.onBeforeRenderObservable.remove(obs);
  });
}
