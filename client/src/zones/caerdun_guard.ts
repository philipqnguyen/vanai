// THE GUARD RAILS inside Caerdun's shells (CF-7: walkable means nobody falls).
// The court hall, the clock tower, the Crown Gate's towers and the Lantern
// Bastion's stair hall climb by flights that fly over wells and land on decks in
// the air; the shell datums give their floors and flights but no balustrades,
// and scene.ts's move rule asks the box colliders only at the feet's CURRENT
// height before groundHeight picks the floor -- so a walker who steps off a
// flight's open side, or off a deck into its well, drops to whatever is under
// it (MEASURED by the plan test's fall audit: 10 m inside the Crown Gate's south
// tower, 3-4 m in the clock and the court, 20 m in the bastion).
//
// This pass finds those edges instead of listing them by hand, so a datum
// change cannot leave one open: every edge of every deck (and hole) in the
// guarded shells, and both sides of every flight, is probed just past the edge
// with the game's own ground rule (the highest floor no more than STEP_UP over
// the feet); where the feet would drop more than DROP and no collider already
// stops the body there, a rail box 0.15 m thick stands on the edge, a metre over
// the floor (stepped up a flight in chunks). An edge where a flight arrives, a
// landing continues or a wall stands is left alone, because the probe finds the
// floor or the wall. No Babylon here.
//
// THE RAILS ARE SEEN (the close-out pass): a collider where nothing stands is an
// invisible wall, so every rail found here also hands back its line, and the plan
// sets a handrail module on it (caerdun_plan.ts: sg_rail along a floor's edge,
// sg_rail_flight chunk by chunk up a flight's side).
import { SG } from "./caerdun_kit.ts";
import { local, toLocal, r3, type SgBox, type SgDeck, type SgDisc, type SgFlight, type P2 } from "./caerdun_frame.ts";

const STEP_UP = 0.9, R = 0.45, DROP = 1.0, SAMPLE = 0.25, CHUNK = 1.2, THICK = 0.15;

export interface GuardInput { decks: SgDeck[]; discs: SgDisc[]; flights: SgFlight[]; boxes: SgBox[]; level: (x: number, z: number) => number }

const inRect = (d: { cx: number; cz: number; hx: number; hz: number; yaw?: number }, x: number, z: number, pad = 0) => {
  const [u, v] = toLocal(d.cx, d.cz, d.yaw ?? 0, x, z);
  return Math.abs(u) < d.hx + pad && Math.abs(v) < d.hz + pad;
};
const deckHas = (d: SgDeck | SgDisc, x: number, z: number) => {
  if ("r" in d && d.r !== undefined) { if (Math.hypot(x - d.cx, z - d.cz) > d.r) return false; }
  else if (!inRect(d as SgDeck, x, z)) return false;
  return !(d.holes ?? []).some((h) => inRect(h, x, z));
};

/** Rails for every open edge of the decks and flights `guarded` picks out. */
/** a coarse grid over the items' extents (the probes ask a few metres at a time) */
function grid<T>(items: T[], ext: (t: T) => number): (x: number, z: number) => T[] {
  const C = 8, m = new Map<number, T[]>();
  items.forEach((it) => {
    const { cx, cz } = it as unknown as { cx: number; cz: number }, e = ext(it);
    for (let i = Math.floor((cx - e) / C); i <= Math.floor((cx + e) / C); i++) for (let j = Math.floor((cz - e) / C); j <= Math.floor((cz + e) / C); j++) {
      const k = i * 100003 + j;
      let l = m.get(k);
      if (!l) m.set(k, (l = []));
      l.push(it);
    }
  });
  return (x, z) => m.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? [];
}

/** What a rail looks like, for the visible handrail the plan sets on it (sg_rail on
 *  a floor's edge, sg_rail_flight up a flight's side): the edge from a to b, the
 *  floor's height (a deck) or the nosing line's at each end (a flight), and the
 *  outward normal (from the floor into the drop). */
export interface RailLine { kind: "deck" | "flight"; a: P2; b: P2; ya: number; yb: number; n: P2 }

export function guardRails(I: GuardInput, guarded: (id: string | undefined) => boolean): { box: SgBox; owner: string; line: RailLine }[] {
  const nearFloor = grid<SgDeck | SgDisc>([...I.decks, ...I.discs], (d) => ("r" in d && d.r !== undefined ? d.r : Math.hypot((d as SgDeck).hx, (d as SgDeck).hz)));
  const ramps = I.flights.map((f) => { const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0); return { f, len, ux: (f.x1 - f.x0) / len, uz: (f.z1 - f.z0) / len, cx: (f.x0 + f.x1) / 2, cz: (f.z0 + f.z1) / 2 }; });
  const nearRamp = grid(ramps, (r) => r.len / 2 + r.f.half + 0.5);
  const nearBox = grid(I.boxes, (b) => Math.hypot(b.hx, b.hz) + R + 0.1);
  const ground = (x: number, z: number, prevY: number): number => {
    let best = -Infinity, lowest = I.level(x, z);
    const consider = (y: number) => { lowest = Math.min(lowest, y); if (y <= prevY + STEP_UP && y > best) best = y; };
    consider(I.level(x, z));
    for (const d of nearFloor(x, z)) if (deckHas(d, x, z)) consider(d.y);
    for (const r of nearRamp(x, z)) {
      const dx = x - r.f.x0, dz = z - r.f.z0, along = dx * r.ux + dz * r.uz;
      if (along < -r.f.endPad || along > r.len + r.f.endPad || Math.abs(-dx * r.uz + dz * r.ux) > r.f.half) continue;
      consider(r.f.y0 + (r.f.y1 - r.f.y0) * Math.max(0, Math.min(1, along / r.len)));
    }
    return best === -Infinity ? lowest : best;
  };
  // a body centred at (x, z) with its feet at y is already stopped there
  const stopped = (x: number, z: number, y: number) => nearBox(x, z).some((b) => {
    const y0 = b.y0 === undefined ? -1e9 : b.y0 + SG.F, y1 = b.y1 + SG.F;
    return !(y + 1.2 < y0 || y > y1) && inRect(b, x, z, R);
  });
  // does a body standing at `y` over the edge point (x, z), stepping out along (nx, nz), fall?
  const falls = (x: number, z: number, nx: number, nz: number, y: number) =>
    [0.05, 0.3].some((d) => { const px = x + nx * d, pz = z + nz * d; return y - ground(px, pz, y) > DROP && !stopped(px, pz, y); });

  const out: { box: SgBox; owner: string; line: RailLine }[] = [];
  const rail = (owner: string, cx: number, cz: number, hx: number, yaw: number, yLo: number, yHi: number, line: RailLine) =>
    out.push({ owner, line, box: { cx: r3(cx), cz: r3(cz), hx: r3(hx), hz: THICK / 2, yaw, y0: r3(yLo - SG.F), y1: r3(yHi - SG.F), what: "rail", id: owner } });
  // runs of marked samples along a line, as [t0, t1] in metres
  const runsOf = (len: number, marked: (t: number) => boolean): [number, number][] => {
    const n = Math.max(1, Math.round(len / SAMPLE)), res: [number, number][] = [];
    let start: number | null = null;
    for (let k = 0; k <= n; k++) {
      const t = (len * k) / n, m = marked(t);
      if (m && start === null) start = Math.max(0, t - SAMPLE / 2);
      if ((!m || k === n) && start !== null) { res.push([start, m ? len : Math.min(len, t - SAMPLE / 2)]); start = null; }
    }
    return res.filter(([a, b]) => b - a > 0.05);
  };

  // ── the decks' edges and their holes' edges ───────────────────────────────
  // (a disc's round edge is the towers' and the platform's, walled by their
  // parapets; only its holes are probed)
  for (const d of [...I.decks, ...I.discs]) {
    if (!guarded(d.id)) continue;
    const rects: { cx: number; cz: number; hx: number; hz: number; yaw: number; sign: 1 | -1 }[] = [
      ...("r" in d && d.r !== undefined ? [] : [{ cx: d.cx, cz: d.cz, hx: (d as SgDeck).hx, hz: (d as SgDeck).hz, yaw: (d as SgDeck).yaw ?? 0, sign: 1 as const }]),
      ...(d.holes ?? []).map((h) => ({ cx: h.cx, cz: h.cz, hx: h.hx, hz: h.hz, yaw: h.yaw ?? 0, sign: -1 as const })),
    ];
    for (const q of rects) {
      // the four edges in the rect's frame: (along axis, fixed coordinate, outward normal)
      for (const [axis, sgn] of [["u", 1], ["u", -1], ["v", 1], ["v", -1]] as ["u" | "v", 1 | -1][]) {
        const len = 2 * (axis === "u" ? q.hx : q.hz), fixed = sgn * (axis === "u" ? q.hz : q.hx);
        const at = (t: number): [number, number] => (axis === "u" ? [-q.hx + t, fixed] : [fixed, -q.hz + t]);
        // outward from the floor: away from the deck's centre, into a hole's middle
        const [nu, nv] = axis === "u" ? [0, sgn * q.sign] : [sgn * q.sign, 0];
        const c = Math.cos(q.yaw), s = Math.sin(q.yaw), nx = nu * c + nv * s, nz = -nu * s + nv * c;
        const marked = (t: number) => {
          const [u, v] = at(t), [x, z] = local(q.cx, q.cz, q.yaw, u, v);
          // the point just inside the floor must be the deck's own (not a hole's or another rect's)
          if (!deckHas(d, x - nx * 0.05, z - nz * 0.05)) return false;
          return falls(x, z, nx, nz, d.y);
        };
        for (const [t0, t1] of runsOf(len, marked)) {
          const [ua, va] = at(t0), [ub, vb] = at(t1);
          // the rail just past the edge, outside the floor
          const [ax, az] = local(q.cx, q.cz, q.yaw, ua, va), [bx, bz] = local(q.cx, q.cz, q.yaw, ub, vb);
          const mx = (ax + bx) / 2 + nx * THICK / 2, mz = (az + bz) / 2 + nz * THICK / 2;
          // live only for a body ON this floor (fix round 1): the game asks a box
          // from 1.2 m under its foot, so a rail standing from 0.3 m under the floor
          // also fenced the flight climbing through the well beneath it, and squeezed
          // the body to 0.28 m at the head of the Crown Gate's F2 (the walk review,
          // MEASURED); from 0.95 m over the floor it stops nobody more than 0.25 m below
          rail(d.id ?? "deck", mx, mz, (t1 - t0) / 2, q.yaw + (axis === "u" ? 0 : Math.PI / 2), d.y + 0.95, d.y + 1.0,
            { kind: "deck", a: [ax, az], b: [bx, bz], ya: d.y, yb: d.y, n: [nx, nz] });
        }
      }
    }
  }

  // ── both sides of every flight ────────────────────────────────────────────
  for (const r of ramps) {
    const f = r.f;
    if (!guarded(f.id)) continue;
    const yaw = Math.atan2(-r.uz, r.ux), tread = (t: number) => f.y0 + (f.y1 - f.y0) * Math.max(0, Math.min(1, t / r.len));
    for (const side of [-1, 1]) {
      // the left normal of travel is (uz, -ux) in this frame convention's terms: (-uz, ux) rotated; use the plain perpendicular
      const nx = side * -r.uz, nz = side * r.ux;
      const edge = (t: number): [number, number] => [f.x0 + r.ux * t + nx * f.half, f.z0 + r.uz * t + nz * f.half];
      const marked = (t: number) => { const [x, z] = edge(t); return falls(x, z, nx, nz, tread(t)); };
      for (const [t0, t1] of runsOf(r.len, marked)) {
        const n = Math.max(1, Math.ceil((t1 - t0) / CHUNK));
        for (let k = 0; k < n; k++) {
          const a = t0 + ((t1 - t0) * k) / n, b = t0 + ((t1 - t0) * (k + 1)) / n, [ax, az] = edge(a), [bx, bz] = edge(b);
          rail(f.id ?? "flight", (ax + bx) / 2 + nx * THICK / 2, (az + bz) / 2 + nz * THICK / 2, (b - a) / 2, yaw, Math.min(tread(a), tread(b)) - 0.4, Math.max(tread(a), tread(b)) + 1.0,
            { kind: "flight", a: [ax, az], b: [bx, bz], ya: tread(a), yb: tread(b), n: [nx, nz] });
        }
      }
    }
  }
  return cullCovered(out);
}

/** FIX ROUND 1 (the walk review: every clock landing left the body 0.10 m between a
 *  rail's end and the wall, MEASURED; cd5's post reachable only by sliding along the
 *  wall). The probe asks only the colliders that stood before this pass, so where two
 *  of a well's edges meet beside a flight's head each got its own rail -- a 0.4 m stub
 *  across the landing a walker turns on, whose job the long rail on the other edge
 *  already does (the body is held 0.45 m off a rail, which covers the stub's whole
 *  drop). A floor-edge rail is dropped when every point a body could fall from along
 *  it is already stopped by a longer one on the same floor: longest first, so the
 *  long side of a well keeps its rail and the stub goes. */
function cullCovered(rails: { box: SgBox; owner: string; line: RailLine }[]): { box: SgBox; owner: string; line: RailLine }[] {
  const order = rails.map((r, i) => ({ r, i })).sort((a, b) => b.r.box.hx - a.r.box.hx || a.i - b.i);
  const kept: typeof order = [];
  for (const o of order) {
    const { box: b, line } = o.r;
    let covered = line.kind === "deck";
    if (covered) {
      // the drop side of the line (the floor's edge pushed out along its normal)
      const n = Math.max(2, Math.ceil(Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]) / SAMPLE));
      for (let k = 0; k <= n && covered; k++) for (const d of [0.05, 0.3]) {
        const t = k / n, x = line.a[0] + (line.b[0] - line.a[0]) * t + line.n[0] * d, z = line.a[1] + (line.b[1] - line.a[1]) * t + line.n[1] * d;
        if (!kept.some(({ r: q }) => q.line.kind === "deck" && q.box.y0 === b.y0 && inRect(q.box, x, z, R))) { covered = false; break; }
      }
    }
    if (!covered) kept.push(o);
  }
  return kept.sort((a, b) => a.i - b.i).map((o) => o.r);
}
