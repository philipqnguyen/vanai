// Where a weapon is worn when it is not in the hand (Philip, 2026-10-14):
// long weapons, the greatsword and the staff, slung across the back; every
// other weapon on the left hip. A character draws it into the holding hand
// only in combat. Handwraps are worn, never sheathed.
//
// Babylon-free: the slot each weapon type takes, when a character counts as in
// combat, and the sheath's frame built from the body's measured landmarks
// (weapon-sheath.ts measures them; client/test/weapon_sheath.test.mjs reads
// this file). Every frame here is in the body's mesh space at bind, in metres.

export type SheathSlot = 'back' | 'hip';
export type V3 = [number, number, number];

/** null: the weapon has no sheath (handwraps) and stays where it is worn. */
export function sheathSlot(weaponType: string | undefined): SheathSlot | null {
  if (weaponType === 'greatsword' || weaponType === 'staff') return 'back';
  if (weaponType === 'sword' || weaponType === 'katana' || weaponType === 'cudgel') return 'hip';
  return null;
}

/** Seconds a character keeps the weapon out after the last sign of a fight
 * (their own swing or cast, a monster on them, their auto-attack). Long
 * enough that a pause between pulls does not sheathe and redraw. */
export const COMBAT_HOLD = 6;
export function combatHold(now: number): number { return now + COMBAT_HOLD; }
export function weaponDrawn(combatUntil: number, now: number): boolean { return combatUntil > now; }

/** The body as weapon-sheath.ts measured it, mesh space at bind. */
export interface BodyLandmarks {
  up: V3; forward: V3; left: V3;   // unit; left is the character's own left
  pelvis: V3;                      // the pelvis joint
  backCentre: V3;                  // the back's surface behind the upper spine, on the midline
  hipLeft: V3;                     // the left hip's outer surface at the belt
}
/** The weapon as it sits in the hand slot: the handle runs along +Y from the
 * grip at the origin; `thin` is the slot axis the weapon is thinnest along (a
 * blade's broad-face normal), `span` its extent along +Y, metres. */
export interface WeaponExtent { thin: 'x' | 'z'; span: [number, number]; }
/** A frame for the sheath node: the weapon keeps its exact in-hand transform
 * and is reparented here, so the frame is a stand-in hand slot. */
export interface SheathFrame { origin: V3; x: V3; y: V3; z: V3; }

// Clearance over the bare body for the gear worn over it (a cuirass, a robe,
// a hip guard): the weapon rides on the outfit, not in it.
export const BACK_CLEARANCE = 0.045;
export const HIP_CLEARANCE = 0.04;
// The back carry's diagonal from vertical (handle over the right shoulder);
// the hip carry's tilt (grip forward, point back) from hanging straight.
export const BACK_TILT_DEG = 28;
export const HIP_TILT_DEG = 38;
// The grip sits this far above the hip joint and forward of the hip's centre:
// at the belt, clear of the hand hanging at the side in the standing idle.
export const HIP_GRIP_UP = 0.07;
export const HIP_GRIP_FORWARD = 0.1;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
const mix = (a: V3, wa: number, b: V3, wb: number): V3 => normalize(add(scale(a, wa), scale(b, wb)));

/** A right-handed frame with +Y along `along` and the weapon's thin axis on `normal`
 * (made exactly perpendicular). */
function frame(origin: V3, along: V3, normal: V3, thin: 'x' | 'z'): SheathFrame {
  const y = normalize(along), n = normalize(add(normal, scale(y, -dot(normal, y))));
  // right-handed: x × y = z
  if (thin === 'z') return { origin, y, z: n, x: cross(y, n) };
  return { origin, y, x: n, z: cross(n, y) };
}

/** The sheath for `type`'s slot on this body. Back: the weapon's middle on the
 * back's midline, flat against it, on a diagonal from the right shoulder down to
 * the left hip -- a greatsword hilt up, a staff's head up. Hip: the grip at the
 * left hip, forward of its centre, the weapon hanging back and down along the
 * thigh with its flat against it. */
export function sheathFrame(type: string, body: BodyLandmarks, w: WeaponExtent): SheathFrame | null {
  const slot = sheathSlot(type);
  if (!slot) return null;
  const right = scale(body.left, -1), down = scale(body.up, -1), back = scale(body.forward, -1);
  if (slot === 'back') {
    const t = BACK_TILT_DEG * Math.PI / 180;
    // the shoulder end of the diagonal is up and to the right
    const shoulderward = mix(body.up, Math.cos(t), right, Math.sin(t));
    // a greatsword's +Y (its blade) runs down to the left hip, a staff's (its head) up
    const along = type === 'staff' ? shoulderward : scale(shoulderward, -1);
    const middle = (w.span[0] + w.span[1]) / 2;
    const centre = add(body.backCentre, scale(back, BACK_CLEARANCE));
    return frame(add(centre, scale(along, -middle)), along, body.forward, w.thin);
  }
  const t = HIP_TILT_DEG * Math.PI / 180;
  const along = mix(down, Math.cos(t), back, Math.sin(t));
  const grip = add(add(add(body.hipLeft, scale(body.left, HIP_CLEARANCE)), scale(body.up, HIP_GRIP_UP)), scale(body.forward, HIP_GRIP_FORWARD));
  return frame(grip, along, body.left, w.thin);
}
