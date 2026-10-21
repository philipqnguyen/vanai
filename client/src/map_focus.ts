// The Journal's "Show on map" mark: where the chosen duty sends you, pulsing
// over the map so it cannot be lost among the other diamonds (Philip,
// 2026-10-14: "make it pulsate and/or glow"). Babylon-free and DOM-free, so
// client/test/map_focus.test.mjs can draw it onto a recording context.
// map.ts owns the overlay canvas and the frame loop; this is what one frame
// draws, in the map's 560x430 units.

export interface PulseSpot { x: number; y: number; r: number }

// Two destinations closer than this read as one place on the map, and two
// sets of rings over each other only muddy it.
export const PULSE_MERGE = 10;
// one beat: a ring grows out of the mark and fades, and the next follows
// half a beat behind it
export const PULSE_PERIOD = 1.6;
// how far past the mark a ring travels before it has faded out
export const PULSE_REACH = 26;

/** The spots worth pulsing: close ones merged into one (the larger mark kept). */
export function pulseSpots(spots: PulseSpot[]): PulseSpot[] {
  const out: PulseSpot[] = [];
  for (const s of spots) {
    const near = out.find((o) => Math.hypot(o.x - s.x, o.y - s.y) < PULSE_MERGE);
    if (near) near.r = Math.max(near.r, s.r);
    else out.push({ ...s });
  }
  return out;
}

/** Where a ring is at `t` seconds: its phase 0..1 through one beat. */
export function ringPhase(t: number, offset: number): number {
  const p = (t / PULSE_PERIOD + offset) % 1;
  return p < 0 ? p + 1 : p;
}

// "#c9a35c" or "rgb(...)" into rgba with the given alpha, for the glow
export function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const r = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (r) {
    const [cr, cg, cb] = r[1].split(",").map((v) => v.trim());
    return `rgba(${cr},${cg},${cb},${a})`;
  }
  return color;
}

type Ctx = Pick<CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "arc" | "fill" | "stroke" | "translate" | "rotate" | "fillRect" | "strokeRect" | "createRadialGradient"
> & { fillStyle: any; strokeStyle: any; lineWidth: number; globalAlpha: number };

/** One frame of the pulse at `t` seconds: a breathing glow, two rings rolling
 *  outward and a bright diamond over the duty's own, for every spot. */
export function focusPulse(ctx: Ctx, spots: PulseSpot[], color: string, t: number): void {
  const breath = 0.5 + 0.5 * Math.sin((t / PULSE_PERIOD) * Math.PI * 2);
  for (const s of spots) {
    ctx.save();
    // the glow: a soft disc in the duty's colour that swells and settles
    const gr = s.r + 14 + breath * 6;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
    g.addColorStop(0, withAlpha(color, 0.55 + 0.25 * breath));
    g.addColorStop(0.45, withAlpha(color, 0.22));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, gr, 0, Math.PI * 2);
    ctx.fill();
    // the rings, dark-edged so they read over a pale road or water as well
    for (const off of [0, 0.5]) {
      const p = ringPhase(t, off);
      const rr = s.r + p * PULSE_REACH;
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "rgba(10,12,18,0.55)";
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the diamond itself, a size up from the map's and outlined in white
    const d = 5.5 + breath * 1.2;
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-d, -d, d * 2, d * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#fff6e0";
    ctx.strokeRect(-d, -d, d * 2, d * 2);
    ctx.restore();
  }
}
