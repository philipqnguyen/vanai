// The Capital's paving on paper (L2): every street, plaza, walk, passage and
// courtyard path as axis-aligned rectangles of one stone each, none over
// another, and the kerbs along the carriageways -- what capital.ts lays as
// makePath ribbons (one ribbon a rectangle, hard-edged) and kerb modules. No
// Babylon here, so the node test (test/capital_layout.test.mjs) reads exactly
// what is laid.
//
// WHY RECTANGLES THAT NEVER OVERLAP. The streets were ribbons with PATH.md's
// soft, wandering banks, a disc at every crossing, and where two met their
// fades crossed: from the air the city's paving was blotchy, the lawn showing
// through every edge and every junction a ragged blob (LOOKED, the K look
// pass). A formal city's paving is ruled: kerbs, flagged footways, a setts
// carriageway, the processional strip of the mock-up. So every surface is a
// rectangle with a hard edge (makePath fray 0, soft 0 -- still one ribbon,
// PATH.md's rule), and two never share ground: they are laid in priority
// order and each takes only what nothing before it took. Coplanar surfaces of
// two stones z-fight; abutting ones meet on one line.
//
// THE ORDER: the square; the civic forecourts (the Hall's runs across the ward
// street to the square); the avenue (its strip, setts and footways through the
// plazas, gate to stair); every other street, wider first, then as listed; the
// carriage MOUTHS where a street meets a wider one (its carriageway carried on
// across the wider street's footway to that street's kerb, so no kerb runs
// across a street's end); the plazas; the blocks' walks, passages, footways and
// aprons; the courtyards' lawns and gravel.
//
// THE KERBS stand on the line between a street's carriageway and its
// footways, wherever that street owns the ground on the line: so they stop
// where a wider street, the square or a forecourt took it, are broken across
// every street that joins (its mouth owns the line there), and turn into the
// joining street, running on to the wider street's kerb. And they drop where a
// carriage passage comes out of a block: a carriage arch opening onto a kerb
// is a gate nothing on wheels could use (21 of the 23 did, the L2 review).
import type { P2, Rect, Piece } from "./capital_blocks.ts";

export type PaveMat = "flags" | "setts" | "cobble" | "square" | "gravel" | "lawn";
/** The city's own paving sheets (paint_capital_textures.py) and the world-UV scale
 * each is painted at: 2 m a tile, the square's survey grid 8 m. One table for the
 * Capital's streets (capital.ts) and the Burned Land's view of them (capitalwalls.ts). */
export const PAVE_SHEETS: Record<PaveMat, { tex: string; uv: number; tint?: string }> = {
  flags: { tex: "/models/capital/pave_flags", uv: 2 },
  setts: { tex: "/models/capital/pave_setts", uv: 2 },
  cobble: { tex: "/models/capital/pave_cobble", uv: 2 },
  square: { tex: "/models/capital/pave_square", uv: 8 },
  gravel: { tex: "/models/capital/pave_gravel", uv: 2 },
  lawn: { tex: "/models/capital/pave_lawn", uv: 2 },
};
export interface Pave { rect: Rect; mat: PaveMat; owner: string; what: string }
export interface Kerb { x: number; z: number; len: number; axis: "x" | "z"; street: string }
interface Street { id: string; kind: string; pts: P2[]; half: number }
export interface PavingPlan {
  streets: Street[];
  square: { rect: number[] };
  plazas?: { id: string; rect: number[] }[];
}
export interface PavingInput {
  /** above the streets: the civic forecourts */
  forecourts?: Rect[];
  /** below the plazas: the blocks' walks, passages, footways, aprons */
  blocks?: { rect: Rect; what: string }[];
  /** last: the courtyards' lawns and their gravel */
  gardens?: { rect: Rect; what: "lawn" | "gravel" }[];
  /** the blocks' carriage passages: the kerb drops where each one crosses it */
  passages?: { street: P2; court: P2; half: number }[];
}

// A STREET'S SECTION: the carriageway's half width (the kerb lines) and its
// stone; the rest out to the street's edge is the flagged footway. The avenue
// is the mock-up's: an 8 m setts carriageway with the processional strip of
// great flags down its middle (3.2 m), kerbed, flagged walks to the arcades.
// The cross streets (Gate, Survey) are setts; the wards' streets, lanes and the
// mews cobbled, 1.2 m footways each side.
export const SECTION: Record<string, { carriage: number; mat: PaveMat; strip?: number }> = {
  avenue: { carriage: 4.0, mat: "setts", strip: 1.6 },
  cross: { carriage: -1.5, mat: "setts" },     // negative: the footway's width, from the edge
  lane: { carriage: -1.2, mat: "cobble" },
  back: { carriage: -1.2, mat: "cobble" },
};
export const carriageHalf = (st: { kind: string; half: number }) => {
  const c = (SECTION[st.kind] ?? SECTION.lane).carriage;
  return c > 0 ? c : st.half + c;
};
// the kerb module (build_capital_modules.py kerb): 0.3 m wide, 4 m long, its
// centre ON the line (it covers the seam of the two stones)
export const KERB = { w: 0.3, len: 4 };

const R = (r: number[]): Rect => [r[0], r[1], r[2], r[3]];
const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const EPS = 1e-6;
/** A minus B: up to four rectangles. */
export function subtract(a: Rect, b: Rect): Rect[] {
  const [ax0, az0, ax1, az1] = a, [bx0, bz0, bx1, bz1] = b;
  if (bx0 >= ax1 - EPS || bx1 <= ax0 + EPS || bz0 >= az1 - EPS || bz1 <= az0 + EPS) return [a];
  const out: Rect[] = [];
  if (bz0 > az0 + EPS) out.push([ax0, az0, ax1, bz0]);
  if (bz1 < az1 - EPS) out.push([ax0, bz1, ax1, az1]);
  const z0 = Math.max(az0, bz0), z1 = Math.min(az1, bz1);
  if (bx0 > ax0 + EPS) out.push([ax0, z0, bx0, z1]);
  if (bx1 < ax1 - EPS) out.push([bx1, z0, ax1, z1]);
  return out;
}
const inRect = (x: number, z: number, r: Rect, e = 0) => x >= r[0] - e && x <= r[2] + e && z >= r[1] - e && z <= r[3] + e;

// a straight, axis-aligned street segment as its rectangle and its axis
function segs(st: Street): { a: P2; b: P2; axis: "x" | "z" }[] {
  return st.pts.slice(1).map((b, i) => {
    const a = st.pts[i];
    if (a[0] !== b[0] && a[1] !== b[1]) throw new Error(`street ${st.id}: the Capital's streets run on the survey's axes`);
    return { a, b, axis: a[1] === b[1] ? "x" as const : "z" as const };
  });
}
// a band of a segment: `lo`..`hi` across it (signed, + to the left of x, + north of z... see below)
function band(s: { a: P2; b: P2; axis: "x" | "z" }, lo: number, hi: number, ext = 0): Rect {
  if (s.axis === "x") {
    const x0 = Math.min(s.a[0], s.b[0]) - ext, x1 = Math.max(s.a[0], s.b[0]) + ext, z = s.a[1];
    return [x0, z + lo, x1, z + hi];
  }
  const z0 = Math.min(s.a[1], s.b[1]) - ext, z1 = Math.max(s.a[1], s.b[1]) + ext, x = s.a[0];
  return [x + lo, z0, x + hi, z1];
}

// THE ORDER STREETS ARE LAID IN: a street goes before every street that ends
// on it (the one running through keeps the crossing whole; a lane ending on a
// ward street laid first took half the ward street's width at their T), then
// the avenue, then wider, then as the plan lists them.
export function streetOrder(all: Street[]): Street[] {
  // (on o's line, not at o's own end: two lanes meeting end to end on a third
  // both end on that one, not on each other)
  const tip = (o: Street, x: number, z: number) => [o.pts[0], o.pts[o.pts.length - 1]].some(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - z) < 1e-6);
  const endsOn = (s: Street, o: Street) => s !== o && [s.pts[0], s.pts[s.pts.length - 1]].some(([x, z]) =>
    !tip(o, x, z) && segs(o).some((t) => inRect(x, z, band(t, 0, 0), 1e-6)));
  const rank = (s: Street) => (s.kind === "avenue" ? -100 : -s.half);
  const left = all.slice().sort((a, b) => rank(a) - rank(b) || all.indexOf(a) - all.indexOf(b)), out: Street[] = [];
  while (left.length) {
    // the first one nothing still waiting must precede
    const i = left.findIndex((s) => !left.some((o) => endsOn(s, o)));
    if (i < 0) throw new Error(`streets end on each other in a ring: ${left.map((s) => s.id)}`);
    out.push(...left.splice(i, 1));
  }
  return out;
}

/** Every paved rectangle and kerb in the city. */
export function planPaving(P: PavingPlan, input: PavingInput = {}): { paves: Pave[]; kerbs: Kerb[] } {
  const paves: Pave[] = [];
  // claim: lay `r` in what nothing laid before took
  const claim = (r: Rect, mat: PaveMat, owner: string, what: string) => {
    let parts: Rect[] = [r];
    for (const p of paves) {
      if (!parts.length) break;
      if (p.rect[0] >= r[2] || p.rect[2] <= r[0] || p.rect[1] >= r[3] || p.rect[3] <= r[1]) continue;
      parts = parts.flatMap((q) => subtract(q, p.rect));
    }
    for (const q of parts) if (area(q) > 0.01) paves.push({ rect: q, mat, owner, what });
  };
  const sq = R(P.square.rect);
  claim(sq, "square", "square", "square");
  for (const f of input.forecourts ?? []) claim(f, "flags", "forecourt", "forecourt");
  const streets = streetOrder(P.streets);
  for (const st of streets) {
    const sec = SECTION[st.kind] ?? SECTION.lane, c = carriageHalf(st);
    for (const s of segs(st)) {
      // the ends run on to the edge of whatever street they meet (the plan's
      // points are on its centre line): what that street took stays its own
      if (sec.strip) {
        claim(band(s, -sec.strip, sec.strip), "flags", st.id, "strip");
        claim(band(s, sec.strip, c), sec.mat, st.id, "carriage");
        claim(band(s, -c, -sec.strip), sec.mat, st.id, "carriage");
      } else claim(band(s, -c, c), sec.mat, st.id, "carriage");
      claim(band(s, c, st.half), "flags", st.id, "footway");
      claim(band(s, -st.half, -c), "flags", st.id, "footway");
    }
  }
  // THE MOUTHS: a street ending on (or crossing) a wider one carries its
  // carriageway across that street's footway to its kerb
  for (const st of streets) {
    const c = carriageHalf(st), mat = (SECTION[st.kind] ?? SECTION.lane).mat;
    for (const o of streets) {
      if (o === st) continue;
      const oc = carriageHalf(o);
      for (const s of segs(st)) for (const t of segs(o)) {
        if (s.axis === t.axis) continue;
        // where the centre lines cross (or one ends on the other)
        const [px, pz] = s.axis === "z" ? [s.a[0], t.a[1]] : [t.a[0], s.a[1]];
        const onS = inRect(px, pz, band(s, 0, 0), 1e-6), onT = inRect(px, pz, band(t, 0, 0), 1e-6);
        if (!onS || !onT) continue;
        // only where o took the crossing: the mouths are across o's footways
        const owner = paves.find((p) => inRect(px, pz, p.rect, -1e-6));
        if (!owner || owner.owner !== o.id) continue;
        for (const sgn of [-1, 1]) {
          // which side of o the street leaves on, if it does
          const probe: P2 = s.axis === "z" ? [px, pz + sgn * (o.half + 0.5)] : [px + sgn * (o.half + 0.5), pz];
          if (!inRect(probe[0], probe[1], band(s, -0.1, 0.1), 0)) continue;
          // from o's edge to half a kerb inside o's kerb line, so o's kerb
          // there stands in the mouth and is not laid
          const k0 = oc - KERB.w / 2;
          const mouth: Rect = s.axis === "z"
            ? [px - c, Math.min(pz + sgn * k0, pz + sgn * o.half), px + c, Math.max(pz + sgn * k0, pz + sgn * o.half)]
            : [Math.min(px + sgn * k0, px + sgn * o.half), pz - c, Math.max(px + sgn * k0, px + sgn * o.half), pz + c];
          // over o's footway and the edge of its carriageway: taken back from them
          for (let i = paves.length - 1; i >= 0; i--) {
            const p = paves[i];
            if (p.owner !== o.id) continue;
            const left = subtract(p.rect, mouth);
            if (left.length === 1 && left[0] === p.rect) continue;
            paves.splice(i, 1, ...left.filter((q) => area(q) > 0.01).map((q) => ({ ...p, rect: q })));
          }
          paves.push({ rect: mouth, mat, owner: st.id, what: "mouth" });
        }
      }
    }
  }
  for (const pz of P.plazas ?? []) claim(R(pz.rect), "flags", pz.id, "plaza");
  for (const b of input.blocks ?? []) claim(b.rect, b.what === "passage" ? "setts" : "flags", "blocks", b.what);
  // the lawns before the gravel round them (the gravel is the whole court, laid under what is left)
  for (const g of (input.gardens ?? []).filter((g) => g.what === "lawn")) claim(g.rect, "lawn", "garden", "lawn");
  for (const g of (input.gardens ?? []).filter((g) => g.what !== "lawn")) claim(g.rect, g.what, "garden", g.what);

  // THE KERBS: every 0.5 m along each kerb line, kept where the street owns
  // the ground the line runs on (or its edge), in runs cut into 4 m stones
  const kerbs: Kerb[] = [];
  const owns = (id: string, x: number, z: number) => paves.some((p) => p.owner === id && inRect(x, z, p.rect, 0.05));
  const foreign = (id: string, x: number, z: number) => paves.some((p) => p.owner !== id && inRect(x, z, p.rect, -0.05));
  const STEP = 0.5;
  // THE DROPPED CROSSINGS: the kerb line nearest a passage's mouth, across the
  // passage's width and a quarter metre either side, carried on its axis out
  // from the facade -- only to the street's middle, so the far kerb stands
  const passes = (input.passages ?? []).map((p) => {
    const dx = p.street[0] - p.court[0], dz = p.street[1] - p.court[1], L = Math.hypot(dx, dz);
    return { x: p.street[0], z: p.street[1], ux: dx / L, uz: dz / L, half: Math.abs(p.half) + 0.25 };
  });
  const dropped = (x: number, z: number, s: { a: P2; axis: "x" | "z" }) => passes.some((p) => {
    const t = (x - p.x) * p.ux + (z - p.z) * p.uz, across = Math.abs(-(x - p.x) * p.uz + (z - p.z) * p.ux);
    // how far out along the axis the street's centre line is
    const tMid = s.axis === "x" ? (p.uz ? (s.a[1] - p.z) / p.uz : -1) : (p.ux ? (s.a[0] - p.x) / p.ux : -1);
    return t > 0 && t < tMid && across <= p.half + 1e-9;
  });
  for (const st of streets) {
    const c = carriageHalf(st);
    for (const s of segs(st)) for (const side of [-1, 1]) {
      const lo = s.axis === "x" ? Math.min(s.a[0], s.b[0]) : Math.min(s.a[1], s.b[1]);
      const hi = s.axis === "x" ? Math.max(s.a[0], s.b[0]) : Math.max(s.a[1], s.b[1]);
      let run0: number | null = null;
      const flush = (end: number) => {
        if (run0 === null) return;
        const L = end - run0, n = Math.ceil(L / KERB.len - 1e-9);
        if (L >= 1.5) for (let k = 0; k < n; k++) {
          const m = run0 + (k + 0.5) * L / n;
          kerbs.push(s.axis === "x" ? { x: m, z: s.a[1] + side * c, len: L / n, axis: "x", street: st.id } : { x: s.a[0] + side * c, z: m, len: L / n, axis: "z", street: st.id });
        }
        run0 = null;
      };
      for (let t = lo; t <= hi + 1e-9; t += STEP) {
        const [x, z] = s.axis === "x" ? [t, s.a[1] + side * c] : [s.a[0] + side * c, t];
        const ok = owns(st.id, x, z) && !foreign(st.id, x, z) && !dropped(x, z, s);
        if (ok && run0 === null) run0 = t;
        if (!ok) flush(t - STEP);
      }
      flush(hi);
    }
  }
  return { paves, kerbs };
}

/** The kerbs as Colonnade pieces, on the dressing's coarse cells. */
export function kerbPieces(kerbs: Kerb[], cellOf: (x: number, z: number) => string): Piece[] {
  return kerbs.map((k) => ({ file: "kerb", x: k.x, y: 0, z: k.z, yaw: k.axis === "x" ? 0 : Math.PI / 2, axes: [k.len / KERB.len, 1, 1] as [number, number, number], cell: cellOf(k.x, k.z), mask: 0b011 }));
}
