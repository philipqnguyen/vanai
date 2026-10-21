// Entity interpolation for remote players and monsters.
//
// The world loop broadcasts positions four times a second (server TICK = 0.25).
// Chasing the newest position with an exponential ease made every remote entity
// sprint most of the way there, coast to a dead stop, and wait for the next
// packet — a visible move/stop stutter at 4Hz, far worse in production where
// network jitter spaces the packets unevenly.
//
// Instead each entity keeps a short buffer of the snapshots it has received and
// is drawn at (now - INTERP_DELAY), between the two snapshots that bracket that
// instant. Motion is continuous, jitter is absorbed by the buffer, and the only
// cost is that remote entities lag a third of a second behind the server — the
// standard trade, and invisible in play.

// One snapshot interval plus headroom for a late packet. Below the interval
// there is nothing to interpolate towards; far above it, remote entities lag.
export const INTERP_DELAY = 0.4;
const MAX_EXTRAPOLATE = 0.25; // coast this long past the newest snapshot
const TELEPORT_DIST = 30; // a jump this large is a warp, not movement
const BUFFER_MAX = 16;

// ---- server clock ----
// Snapshots carry the world clock they describe. Estimating the offset between
// that clock and ours from the FASTEST packet seen keeps playback anchored to
// even server-side spacing, so jitter only decides whether a packet has landed
// in time — which is what INTERP_DELAY buys headroom for.
let offset = 0; // what the render clock uses
let target = 0; // where the estimate says it should be
let haveOffset = false;
let slewedAt = 0;
const SLEW_RATE = 0.02; // seconds of correction per second of real time

/** Call once per snapshot message, before pushing its entities. */
export function noteServerClock(serverT: number, clientNow: number): void {
  const o = clientNow - serverT;
  // first sample, a server restart (its clock rewinds), or a hopeless estimate
  if (!haveOffset || o > target + 5 || o < target - 5) {
    offset = target = o;
    slewedAt = clientNow;
    haveOffset = true;
    return;
  }
  // track the minimum — the fastest packet is the one least distorted by
  // queueing — letting it creep up so one freak packet cannot anchor us
  target = Math.min(o, target + 0.0005);
}

/**
 * Eases the render clock onto the estimate. Correcting it in one step would
 * shunt every remote entity forward at once; bleeding it off at SLEW_RATE
 * hides the correction inside a couple of percent of their speed.
 * Call once a frame, before sampling.
 */
export function tickServerClock(clientNow: number): void {
  if (!haveOffset) return;
  const dt = Math.max(0, Math.min(clientNow - slewedAt, 0.25));
  slewedAt = clientNow;
  const step = SLEW_RATE * dt;
  offset += Math.max(-step, Math.min(step, target - offset));
}

/** Our best estimate of the world clock right now. */
export function serverNow(clientNow: number): number {
  return clientNow - offset;
}


export interface Sample {
  x: number;
  z: number;
  h: number;
  anim: string;
  vx: number; // world units/second along the segment being played
  vz: number;
  speed: number;
}

interface Snapshot {
  t: number;
  x: number;
  z: number;
  h: number;
  anim: string;
}

function shortestArc(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Track {
  private buf: Snapshot[] = [];
  // Where to draw before any snapshot has arrived. Timelines start empty on
  // purpose: at construction the world clock may not be known yet, and a seed
  // stamped with a guess would sit in the future and swallow every real
  // snapshot that followed it.
  private readonly seed: Snapshot;
  /** Set for one frame after a warp, so callers can skip movement animation. */
  warped = false;

  constructor(x: number, z: number, h = 0, anim = "idle") {
    this.seed = { t: 0, x, z, h, anim };
  }

  /** Record a snapshot. `t` is the world clock the snapshot describes. */
  push(t: number, x: number, z: number, h: number, anim: string): void {
    const last = this.buf[this.buf.length - 1];
    if (last) {
      if (t <= last.t) return; // out of order or same frame — the newer wins
      if (Math.hypot(x - last.x, z - last.z) > TELEPORT_DIST) {
        // zoned, respawned or /tp'd: interpolating across it would send the
        // avatar skating over the whole map
        this.buf.length = 0;
        this.warped = true;
      }
    }
    this.buf.push({ t, x, z, h, anim });
    if (this.buf.length > BUFFER_MAX) this.buf.splice(0, this.buf.length - BUFFER_MAX);
  }

  /** Position to draw at, given the current client clock. */
  sample(clientNow: number): Sample {
    const buf = this.buf;
    if (!buf.length) {
      const s = this.seed;
      return { x: s.x, z: s.z, h: s.h, anim: s.anim, vx: 0, vz: 0, speed: 0 };
    }
    const last = buf[buf.length - 1];
    const renderT = serverNow(clientNow) - INTERP_DELAY;

    // still filling the buffer, or the entity has not moved in a while
    if (buf.length === 1 || renderT <= buf[0].t) {
      const s = buf[0];
      return { x: s.x, z: s.z, h: s.h, anim: s.anim, vx: 0, vz: 0, speed: 0 };
    }

    // starved: the next snapshot is late. Coast along the last known velocity
    // for a moment rather than freezing, then hold position.
    if (renderT >= last.t) {
      const prev = buf[buf.length - 2];
      const span = last.t - prev.t;
      const ahead = Math.min(renderT - last.t, MAX_EXTRAPOLATE);
      if (span <= 0) return { x: last.x, z: last.z, h: last.h, anim: last.anim, vx: 0, vz: 0, speed: 0 };
      // once the coast is spent the entity is standing still, not walking
      const spent = renderT - last.t > MAX_EXTRAPOLATE;
      const vx = (last.x - prev.x) / span, vz = (last.z - prev.z) / span;
      return {
        x: last.x + vx * ahead,
        z: last.z + vz * ahead,
        h: last.h,
        anim: last.anim,
        vx: spent ? 0 : vx,
        vz: spent ? 0 : vz,
        speed: spent ? 0 : Math.hypot(vx, vz),
      };
    }

    // find the pair bracketing renderT — guaranteed to exist now
    for (let i = buf.length - 2; i >= 0; i--) {
      const a = buf[i], b = buf[i + 1];
      if (renderT < a.t) continue;
      const span = b.t - a.t;
      const f = span > 0 ? (renderT - a.t) / span : 1;
      // drop snapshots that are now fully behind us, keeping `a` as the anchor
      if (i > 0) buf.splice(0, i);
      const vx = span > 0 ? (b.x - a.x) / span : 0;
      const vz = span > 0 ? (b.z - a.z) / span : 0;
      return {
        x: a.x + (b.x - a.x) * f,
        z: a.z + (b.z - a.z) * f,
        h: a.h + shortestArc(a.h, b.h) * f,
        anim: a.anim,
        vx, vz, speed: Math.hypot(vx, vz),
      };
    }

    return { x: last.x, z: last.z, h: last.h, anim: last.anim, vx: 0, vz: 0, speed: 0 };
  }

  /** True once per warp; reading it clears the flag. */
  consumeWarp(): boolean {
    if (!this.warped) return false;
    this.warped = false;
    return true;
  }
}
