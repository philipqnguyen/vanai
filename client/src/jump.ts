// The jump arc.
//
// The server never simulates height — it only knows where a character stands on
// the ground plane — so a jump is pure client-side theatre. That is fine as long
// as every client draws the *same* theatre: the jumper runs this curve locally
// the moment they press Space, and everyone else runs it from the takeoff
// instant the server relays back. Both sides read the numbers from here, so a
// jump you watch is the jump the jumper felt.

/** Upward speed at takeoff, world units/second. */
export const JUMP_VELOCITY = 5.6;
/** Downward pull, world units/second². */
export const JUMP_GRAVITY = 15;
/** Seconds from takeoff to landing. */
export const JUMP_DURATION = (2 * JUMP_VELOCITY) / JUMP_GRAVITY;

/**
 * Height above the ground `elapsed` seconds after takeoff. Zero before the
 * jump and once it has landed, so callers can use `> 0` as "airborne".
 */
export function jumpHeight(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= JUMP_DURATION) return 0;
  return JUMP_VELOCITY * elapsed - 0.5 * JUMP_GRAVITY * elapsed * elapsed;
}

/**
 * One character's jump, whether it is our own or a remote one being replayed.
 *
 * Both are the same problem — a takeoff instant plus a clock — they just read
 * different clocks: our own arc runs on the local clock the moment Space is
 * pressed, while a remote's runs on the interpolation playback clock, so it
 * peaks over the same patch of ground the interpolated feet are crossing.
 */
export class JumpArc {
  private at = -Infinity; // takeoff, in whichever clock the caller passes

  /**
   * Begin an arc that took off at `takeoffT`. `clockNow` is the caller's clock
   * right now: a relayed takeoff that the network delivered late starts from
   * here instead, because a jump shown whole a moment late reads better than
   * one that begins halfway up.
   */
  start(takeoffT: number, clockNow: number): void {
    this.at = Math.max(takeoffT, clockNow);
  }

  /** Height above the ground; 0 while grounded. */
  height(clockNow: number): number {
    return jumpHeight(clockNow - this.at);
  }

  /** In the air — true across the whole arc, including the two ends. */
  airborne(clockNow: number): boolean {
    const el = clockNow - this.at;
    return el >= 0 && el < JUMP_DURATION;
  }

  /** Put them back on the ground (death, a zone line, a rebuilt avatar). */
  cancel(): void {
    this.at = -Infinity;
  }
}
