// Use the same entry point as the game: Vite can optimize deep imports into
// distinct class copies, which would leave the rendered materials unpatched.
import { AbstractEngine, StandardMaterial, PBRBaseMaterial, DrawWrapper, Effect } from '@babylonjs/core';

type Material = StandardMaterial | PBRBaseMaterial;
type Pending = { wrapper: DrawWrapper; effect: Effect; owner: Set<Pending> };
let installed = false;
const observed = new WeakSet<Material>();
const pending = new WeakMap<DrawWrapper, Pending>();
const transferred = new WeakMap<DrawWrapper, Effect>();

function releasePending(wrapper: DrawWrapper) {
  const lease = pending.get(wrapper);
  if (!lease) return;
  pending.delete(wrapper);
  lease.owner.delete(lease);
  lease.effect.dispose();
}

function observe(material: Material) {
  if (observed.has(material)) return;
  observed.add(material);
  const owned = new Set<Pending>();
  material.onEffectCreatedObservable.add(({ effect, subMesh }) => {
    if (!subMesh) return;
    const wrapper = subMesh._drawWrapper;
    // This event proves createEffect acquired one reference. A hot-swap retry
    // may never assign it, so hold just one pending acquisition per wrapper.
    releasePending(wrapper);
    const lease = { wrapper, effect, owner: owned };
    pending.set(wrapper, lease);
    owned.add(lease);
  });
  material.onDisposeObservable.addOnce(() => {
    for (const lease of owned) releasePending(lease.wrapper);
  });
}

/** Compatibility for the proven createEffect/setEffect ownership gap in 9.22.0.
 * Keep the shader callbacks intact: Babylon needs them for context restoration.
 * Do not extend this hook to ShaderMaterial: its event occurs AFTER assignment.
 */
export function installBabylonEffectOwnershipFix() {
  if (installed) return;
  if (AbstractEngine.Version !== '9.22.0') {
    throw new Error(`Revalidate Babylon effect ownership for ${AbstractEngine.Version}`);
  }
  installed = true;
  const prepareEffect = Effect.prototype._prepareEffect;
  Effect.prototype._prepareEffect = function (...args) {
    // Shader imports/source loading can finish after disposal. Babylon 9.22.0
    // otherwise creates a native pipeline that a second dispose cannot release.
    if (this.isDisposed || this.getEngine().isDisposed) return;
    return prepareEffect.apply(this, args);
  };
  const standardReady = StandardMaterial.prototype.isReadyForSubMesh;
  StandardMaterial.prototype.isReadyForSubMesh = function (...args) {
    observe(this);
    return standardReady.apply(this, args);
  };
  const pbrReady = PBRBaseMaterial.prototype.isReadyForSubMesh;
  PBRBaseMaterial.prototype.isReadyForSubMesh = function (...args) {
    observe(this);
    return pbrReady.apply(this, args);
  };
  const setEffect = DrawWrapper.prototype.setEffect;
  DrawWrapper.prototype.setEffect = function (effect, ...args) {
    const acquisition = pending.get(this);
    const ownedEffect = transferred.get(this);
    if (acquisition && acquisition.effect === effect) {
      // Transfer the newly acquired reference. Identical defines still acquire
      // another reference, so replace our previous ownership even for the same
      // handle. Arbitrary borrowed effects have no entry in transferred.
      pending.delete(this);
      acquisition.owner.delete(acquisition);
      ownedEffect?.dispose();
      transferred.set(this, effect!);
    } else {
      releasePending(this);
      if (ownedEffect && ownedEffect !== effect) {
        transferred.delete(this);
        ownedEffect.dispose();
      }
    }
    return setEffect.call(this, effect, ...args);
  };
  const dispose = DrawWrapper.prototype.dispose;
  DrawWrapper.prototype.dispose = function (...args) {
    releasePending(this);
    // The framework releases the installed effect itself, possibly at endFrame.
    transferred.delete(this);
    return dispose.apply(this, args);
  };
}
