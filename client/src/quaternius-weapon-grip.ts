/** Measured KayKit blade axes: handle +Y, blade width X, broad-face normal Z.
 * The q02 slot inherited a grip whose broad face leads Quaternius cuts. A
 * local quarter-turn around the handle puts the edge into the swing plane.
 * Approved katanas curve toward local +X. The live idle grip put that side
 * down with +90 degrees; -90 turns the concavity upward without changing
 * the grip origin, blade plane, handle axis or any scale.
 * See design/race-preview/quaternius/weapon-grip-measurements.json.
 */
export function quaterniusBladeRoll(modelVariant:string|undefined,weaponType:string|undefined):number {
  return ['aedri-quaternius','nym-quaternius','rasha-quaternius','valdren-quaternius','karrog-quaternius'].includes(modelVariant??'')&&['sword','katana','greatsword'].includes(weaponType??'')?(weaponType==='katana'?-Math.PI/2:Math.PI/2):0;
}
