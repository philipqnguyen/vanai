// Walking into a Dawn Veil takes you through it (Philip, 2026-10-15): a veil
// is a door, a gate, a zone's edge, and you pass through a door by walking.
// A Rune Circle stays a thing you use -- target it and press E, or
// double-click it -- because it stands on open ground where you would
// otherwise blunder into it. Babylon-free; client/test/portal_touch.test.mjs.

/** The card a veil draws, as world.ts reads it: where it stands, which way you walk through it, how wide it is. */
export interface VeilCard { at: [number, number]; yaw: number; width: number }

/**
 * How far either side of the card counts as touching it. A framed veil can
 * stand a little behind a collider (a sill, a gate's leaves open to the
 * sides), and a walker at 8 m/s covers 0.8 m in a 10 fps frame, so the band
 * is wider than any single step.
 */
export const TOUCH_DEPTH = 2.2;

/** Whether (x, z) stands within the veil's width and TOUCH_DEPTH of its plane. */
export function touchingVeil(card: VeilCard, x: number, z: number, depth = TOUCH_DEPTH): boolean {
  const dx = x - card.at[0], dz = z - card.at[1];
  // the card's normal is (sin yaw, cos yaw), the direction you walk through it
  const nx = Math.sin(card.yaw), nz = Math.cos(card.yaw);
  const through = dx * nx + dz * nz;
  const across = dx * nz - dz * nx;
  return Math.abs(through) <= depth && Math.abs(across) <= card.width / 2;
}

/**
 * Fires once per touch. A veil you are standing in when the zone appears
 * (a landing too near a return portal) is not touched until you have stepped
 * out of it and back, so nobody is bounced straight back the way they came;
 * a refused crossing (a barred gate) is not asked again until you do the same.
 */
export class PortalTouchLatch {
  private inside = new Set<string>();
  private primed = false;

  /** A new zone: whatever you stand in on arrival does not count. */
  reset(): void { this.inside.clear(); this.primed = false; }

  /** The ids touched this frame; returns the one newly entered, if any. */
  update(touching: Iterable<string>): string | null {
    const now = new Set(touching);
    let fired: string | null = null;
    if (this.primed) for (const id of now) if (!this.inside.has(id)) { fired = id; break; }
    this.inside = now;
    this.primed = true;
    return fired;
  }
}
