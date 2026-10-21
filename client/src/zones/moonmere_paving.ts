// Moonmere's paving on paper (MOONMERE.md section 7, PATH.md): every walking
// surface as one-stone makePath ribbons with hard edges (soft 0, fray 0), laid
// in priority order -- Academy Court, the quays, the streets and terraces, the
// stairs and lanes, then the blocks' gate passages and courts. No Babylon.
//
// THE RING STREETS ARE LAID IN SPANS. The Quay Ring, the working strip behind
// it, the Mere Walk and the two terraces are rings round the mere, and a
// straight building on a curved band stands into them at its ends: a quay row's
// roof lap into the Walk (by its sag, up to 0.9 m), a riser rank's into a
// terrace, the Customs House's forward loggia into the quay. So each ring is
// sampled every 1.5 degrees, its inner and outer edge pulled back off anything
// built there, and laid as consecutive ribbons of constant width wherever the
// edges hold -- the stone stops at the parapet, never under a roof.
import { mmRiserBodies, type BlocksOut } from "./moonmere_blocks.ts";
import type { CivicOut } from "./moonmere_civic.ts";
import type { StreetsOut } from "./moonmere_streets.ts";
import { flightRun, merePoint, type Terrain } from "./moonmere_terrain.ts";
import { CellIndex } from "../spatial.ts";
import { insideBody, localToWorld, nearestOnLine, profileAt, type Body, type Layout, type P2, type Paving } from "./moonmere_types.ts";

/** The sheets each paving kind is laid with: the Capital's one-stone sheets at the same
 * scale, tinted toward the tufa and the basalt (Philip, 2026-10-10: the Capital's paving
 * stays; Moonmere's own flags/setts/basalt/gravel sheets were retired). */
export const PAVE_SHEETS: Record<string, { tex: string; uv: number; tint?: string }> = {
  pave_flags: { tex: "/models/capital/pave_flags", uv: 2, tint: "#f3ead6" },
  pave_setts: { tex: "/models/capital/pave_setts", uv: 2, tint: "#e4dccb" },
  pave_basalt: { tex: "/models/capital/pave_cobble", uv: 2, tint: "#a9b2c2" },
  pave_gravel: { tex: "/models/capital/pave_gravel", uv: 2, tint: "#efe4cf" },
  // A-13: the gardens' worked soil has no Capital counterpart -- Moonmere's own sheet
  // (tools/assets/paint_moonmere_cloister_textures.py)
  pave_soil: { tex: "/models/moonmere-cloister/pave_soil", uv: 2 },
};
/** priority (lower first, under) and lift above the ground, so two ribbons
 * that meet never z-fight: the stairs ride over the rings they come down onto */
const TIER: Record<string, { priority: number; lift: number }> = {
  court: { priority: 0, lift: 0.05 }, quay: { priority: 1, lift: 0.05 }, street: { priority: 1, lift: 0.05 },
  lane: { priority: 2, lift: 0.08 }, stair: { priority: 2, lift: 0.095 }, passage: { priority: 3, lift: 0.065 }, yard: { priority: 4, lift: 0.06 },
  // a straight street that runs onto a ring (Registry Walk, Bursar's Walk, the
  // Mere Stair's crossing): after the rings, and a little over them where its
  // square end meets a ring's end obliquely
  link: { priority: 2, lift: 0.07 },
  // A-7: the aprons round the buildings, last and lowest -- they take only what no
  // street, court or yard has
  apron: { priority: 5, lift: 0.055 },
};
export interface MmPaving extends Paving { lift: number; street?: string; ring?: boolean; claimed?: boolean }

const RING_STEP = 1.0;
/** a ring's stone stops this far short of the quay line: the shape's 4 m chords
 * and merePoint's exact ellipse differ by up to 3.5 cm, and a ribbon edge laid ON
 * the line fell into the mere at a few vertices and stood as a spike down to the
 * bed (review P: 129 vertices below -0.3). The quay wall's coping covers it. */
const QUAY_EDGE = 0.25;
/** sampling along a ribbon's centreline for what earlier stone has claimed */
const CLAIM_STEP = 0.25;
/** flat stone stops this short of a rising riser's foot, and a ring this short
 * of a flight standing off its level: about two thirds of the terrain's 2.33 m
 * cell (measured against the mesh model in the layout test) */
const RISER_CLEAR = 1.6, FLIGHT_CLEAR = 2.4;
/** S1 review (MM-13, "a PAVED stair-street down to the harbour"): with FLIGHT_BODIES a flight
 * stands on its own masonry and the ground beside it only cuts -- there is no embankment for
 * the mesh to smear onto the ring, and FLIGHT_CLEAR's 2.4 m left a lawn margin round every
 * flight's foot (LOOKED: the Mere Stair's lower flight landed on rough ground, the quay's setts
 * stopping 2-3 m short either side). The ring stops at the cheek's outer face and a hand more
 * (cheek_wall is 0.4 thick at the flight's edge); the plinth skirt takes the last 0.2 m. */
const FLIGHT_CLEAR_BODIES = 0.6;

/** `flightBodies`: the flights are carried by their own masonry (mmTerrain `fill:
 * false`), so their stone is flight_seg's treads and no ribbon is laid along a
 * stair's flights and the landings between them -- the ground under them no
 * longer rises, and a ribbon would lie on it under the treads. Only the level
 * lanes at a stair's ends are paved. */
export function planPaving(L: Layout, S: StreetsOut, B: BlocksOut, C: CivicOut, opts: { flightBodies?: boolean; T?: Terrain; beds?: { id: string; tex: string; pts: P2[]; half: number }[] } = {}): MmPaving[] {
  const out: MmPaving[] = [];
  const lap = L.terrain.bands.roofLap;
  // what stands into a ring: riser bodies with their roof laps, every footprint
  const laps: Body[] = mmRiserBodies(L).map((rb) => {
    const b = rb.body;
    const [cx, cz] = localToWorld(b.cx, b.cz, b.yaw, 0, -lap / 2);
    return { cx, cz, hx: b.hx, hz: b.hz + lap / 2, yaw: b.yaw };
  });
  const bodies: Body[] = [...laps, ...B.footprints.filter((f) => f.kind !== "gate").map((f) => bodyOfPts(f.pts)), ...C.footprints.map((f) => bodyOfPts(f.pts))];
  const idx = new CellIndex(8);
  bodies.forEach((b, i) => { const r = Math.hypot(b.hx, b.hz) + 0.1; idx.add(i, b.cx - r, b.cx + r, b.cz - r, b.cz + r); });
  const occupied = (x: number, z: number) => (idx.query(x, z) ?? []).some((i) => insideBody(bodies[i], x, z, 0));
  // A FLIGHT CROSSING A RING stands off its level: a cross stair rises from the
  // quay apron on its own embankment to the Mere Walk. The terrain mesh cannot
  // draw that embankment's 0.8 m shoulder on its 2.33 m cell, so it smears a
  // cell onto the quay either side, and stone laid there rode the smear up as
  // shards (review P). The ring stops FLIGHT_CLEAR short of the corridor's
  // edge wherever the stair is off the ring's level; where the stair runs level
  // across the ring (a lane over the Walk) the ring carries on and the stair is
  // cut out of it instead (the claims, below).
  const stairs = L.streets.filter((s) => s.kind === "stair" && s.profile);
  const sidx = new CellIndex(8);
  const fclear = opts.flightBodies ? FLIGHT_CLEAR_BODIES : FLIGHT_CLEAR;
  stairs.forEach((s, i) => { const r = s.half + fclear; sidx.add(i, Math.min(...s.pts.map((q) => q[0])) - r, Math.max(...s.pts.map((q) => q[0])) + r, Math.min(...s.pts.map((q) => q[1])) - r, Math.max(...s.pts.map((q) => q[1])) + r); });
  const offLevel = (x: number, z: number, y: number) => (sidx.query(x, z) ?? []).some((i) => {
    const s = stairs[i];
    const n = nearestOnLine(s.pts, x, z);
    return n.d < s.half + fclear && Math.abs(profileAt(s.profile!, n.s) - y) > 0.3;
  });
  const add = (p: Omit<MmPaving, "priority" | "lift">, tier: string) => out.push({ ...p, priority: TIER[tier].priority, lift: TIER[tier].lift });

  const ring = (id: string, tex: string, o: number, half: number, a0: number, a1: number, tier: string, street?: string, y?: number) => {
    const taken = (x: number, z: number) => occupied(x, z) || (y !== undefined && offLevel(x, z, y));
    type Smp = { a: number; i: number; e: number };
    let part = 0;
    const smp: Smp[] = [];
    for (let a = a0; a <= a1 + 1e-6; a += RING_STEP) {
      const t = (a * Math.PI) / 180;
      let inner = Math.max(o - half, QUAY_EDGE), outerE = o + half;
      // pull the inner edge out past anything standing on it, the outer edge in
      for (let d = o - half - 3; d <= o + 0.5; d += 0.1) {
        const p = merePoint(L, t, d);
        if (taken(p.x, p.z)) inner = Math.max(inner, d + 0.1);
      }
      for (let d = o + half + 3; d >= o - 0.5; d -= 0.1) {
        const p = merePoint(L, t, d);
        if (taken(p.x, p.z)) outerE = Math.min(outerE, d - 0.1);
      }
      // S1 review (MM-13): A FLIGHT'S FOOT ON THE BAND. The scans above pull each edge past
      // anything standing on it -- right for a row standing into the band from either side,
      // but a flight that comes down ONTO the band (the Mere Stair's lower flight lands 2.8 m
      // from the quay edge) stands in its middle, both scans meet it and the sample was
      // dropped: the setts stopped 2-3 m short of the foot either side (LOOKED). Where that
      // leaves nothing, the band keeps its widest free stretch, if it is a walk's width.
      if (outerE - inner < 1.0 && opts.flightBodies) {
        let best: [number, number] | null = null, r0 = -1;
        const d0 = Math.max(o - half, QUAY_EDGE), d1 = o + half;
        for (let d = d0; d <= d1 + 1e-6; d += 0.1) {
          const p = merePoint(L, t, d);
          const free = !taken(p.x, p.z) && d < d1 - 0.05;
          if (free && r0 < 0) r0 = d;
          if (!free && r0 >= 0) { const e = d - 0.1; if (!best || e - r0 > best[1] - best[0]) best = [r0 + (r0 > d0 + 1e-6 ? 0.1 : 0), e]; r0 = -1; }
        }
        if (best && best[1] - best[0] >= 2.0) { inner = best[0]; outerE = best[1]; }
      }
      smp.push({ a, i: inner, e: outerE });
    }
    // consecutive samples whose edges hold within 0.3 m are one ribbon; where two
    // ribbons meet, the narrower one carries on across the gap between their
    // samples (it stands clear of whatever narrowed it), the wider one stops
    const spans: { k: number; j: number; i: number; e: number }[] = [];
    for (let k = 0; k < smp.length;) {
      let j = k, i0 = smp[k].i, e0 = smp[k].e;
      while (j + 1 < smp.length && Math.abs(smp[j + 1].i - smp[k].i) < 0.3 && Math.abs(smp[j + 1].e - smp[k].e) < 0.3) {
        j++; i0 = Math.max(i0, smp[j].i); e0 = Math.min(e0, smp[j].e);
      }
      spans.push({ k, j, i: i0, e: e0 });
      k = j + 1;
    }
    spans.forEach((sp, n) => {
      const w = sp.e - sp.i;
      if (w < 1.0) return;
      const prev = spans[n - 1], next = spans[n + 1];
      // of two the same width, the later carries back across the gap and the
      // earlier stops: both carrying on laid one step twice (review P)
      const aS = prev && w <= prev.e - prev.i ? smp[prev.j].a : smp[sp.k].a;
      const aE = next && w < next.e - next.i ? smp[next.k].a : smp[sp.j].a;
      const oc = (sp.i + sp.e) / 2, pts: P2[] = [];
      const step = aE > aS ? Math.min(RING_STEP, aE - aS) : 1;
      for (let a = aS; a <= aE + 1e-6; a += step) {
        const p = merePoint(L, (a * Math.PI) / 180, oc);
        pts.push([p.x, p.z]);
      }
      if (pts.length < 2) {
        // a single sample: a short ribbon across half a step either side
        for (const a of [aS - RING_STEP / 4, aS + RING_STEP / 4]) { const p = merePoint(L, (a * Math.PI) / 180, oc); pts.push([p.x, p.z]); }
        pts.shift();
      }
      add({ id: `${id}_${part++}`, tex, pts, half: w / 2, map: false, street, ring: true }, tier);
    });
  };

  for (const s of L.streets) {
    if (!s.paving) continue;
    if (s.ring) {
      ring(s.id, s.paving, s.ring.o, s.half, s.ring.a[0], s.ring.a[1], s.kind === "quay" ? "quay" : "street", s.id, s.y);
      continue;
    }
    const tier = s.kind === "stair" ? "stair" : s.kind === "lane" ? "lane" : s.kind === "court" ? "court" : s.kind === "quay" ? "quay" : "link";
    const run = opts.flightBodies && s.kind === "stair" && s.profile ? flightRun(s.profile) : null;
    if (run) {
      const len = polyLength(s.pts);
      for (const [k, a, b] of [["foot", 0, run[0]], ["head", run[1], len]] as const) {
        if (b - a >= 0.6) add({ id: `${s.id}_${k}`, tex: s.paving, pts: subLine(s.pts, a, b), half: s.half, map: false, street: s.id }, tier);
      }
      continue;
    }
    add({ id: s.id, tex: s.paving, pts: s.pts, half: s.half, map: false, street: s.id, ...(s.kind === "court" ? { colStep: 3 } : {}) }, tier);
  }
  // the quay's working strip behind the apron, where no quay row stands (o 9-14.4)
  const B_ = L.terrain.bands;
  // Its outer edge stops RISER_CLEAR short of R1's foot: the mesh smears the
  // riser's first metre and a half onto the flat (one 2.33 m cell), and setts
  // laid to the foot rode it up as a lip up to a metre tall (review P)
  ring("quay_strip", "pave_setts", (B_.quayApron + B_.r1Bare[0] - RISER_CLEAR) / 2, (B_.r1Bare[0] - RISER_CLEAR - B_.quayApron) / 2, -64, 244, "quay", undefined, L.terrain.levels.quay);
  // Observatory Close, between the Burned Shelf and the Long Tower, and the
  // apron before the Provost's loggia at the head of the Observatory Stair
  add({ id: "observatory_close", tex: "pave_flags", pts: [[-71.5, 157.5], [-71.5, 193.5]], half: 4.4, map: false, colStep: 3 }, "court");
  add({ id: "loggia_apron", tex: "pave_flags", pts: [[-42.4, 178], [-47.9, 178]], half: 5.8, map: false }, "court");
  // S3 (L2): THE KNOLL'S TWO LAWNS made gardens (LOOKED, the knoll from the air: a lawn square south
  // of the Long Tower and the loggia, where Emery Coyle and Imogen Teasdale stand, and a strip north
  // of it -- the Close the only stone on the Observatory's hill). Raked gravel, 1.6 m in from the
  // knoll's edges (RISER_CLEAR: the polygon's south edge z 156, its corners cut at x -46);
  // moonmere_dress.ts plants them
  add({ id: "knoll_garden", tex: "pave_gravel", pts: [[-66.4, 163.8], [-46.8, 163.8]], half: 5.6, map: false, colStep: 2 }, "yard");
  add({ id: "knoll_north", tex: "pave_gravel", pts: [[-66.4, 189.3], [-46.8, 189.3]], half: 2.9, map: false, colStep: 2 }, "yard");
  // (and the knoll's east strip either side of the loggia's apron, to its edge less RISER_CLEAR: LOOKED
  // from the Observers' Garden, a lawn corner between the garden, the apron and the edge)
  add({ id: "knoll_east_s", tex: "pave_gravel", pts: [[-45.2, 160.2], [-45.2, 172.2]], half: 1.6, map: false, colStep: 2 }, "yard");
  add({ id: "knoll_east_n", tex: "pave_gravel", pts: [[-45.2, 183.8], [-45.2, 189.4]], half: 1.6, map: false, colStep: 2 }, "yard");
  // A-13: the ground the gardens lay for themselves (moonmere_dress.ts `beds`): the Long Garden's
  // soil bed and its bench bays, the orchard's tree rows in worked soil, the Landing terrace's
  // gravel and beds -- yards, laid before the aprons, which then keep off them
  for (const b of opts.beds ?? []) add({ id: b.id, tex: b.tex, pts: b.pts, half: b.half, map: false, colStep: 2 }, "yard");
  // the blocks' gate passages and courts
  for (const p of B.passages) {
    const [ax, az] = localToWorld(p.x, p.z, p.yaw, 0, -p.depth / 2 - 0.3), [bx, bz] = localToWorld(p.x, p.z, p.yaw, 0, p.depth / 2 + 0.3);
    add({ id: `pass_${p.block}`, tex: "pave_flags", pts: [[ax, az], [bx, bz]], half: p.half, map: false }, "passage");
  }
  for (const c of B.courts) {
    const [ax, az] = localToWorld(c.cx, c.cz, c.yaw, -c.hx + 0.2, 0), [bx, bz] = localToWorld(c.cx, c.cz, c.yaw, c.hx - 0.2, 0);
    add({ id: `court_${c.block}`, tex: c.public ? "pave_flags" : "pave_gravel", pts: [[ax, az], [bx, bz]], half: c.hz - 0.2, map: false, colStep: 2 }, "yard");
  }
  // THE APRONS (A-7; the look review: "the Archive and N1's east end stand straight on
  // lawn with no apron"): a 2.4 m apron of setts along every side of every civic
  // building, house and tower, wherever the ground beside it is the building's own
  // level -- never down a riser, never into the water -- laid last and lowest, so a
  // street, court or yard that is already there keeps its stone (the claims, below)
  if (opts.T) {
    const T = opts.T, AW = 2.4;
    // what is already paved, by segment on a grid (the claims below cut a ribbon at
    // its centre line only: an apron must stand clear of other stone across its width)
    // (one entry a SEGMENT, tested on its own: a ring ribbon is hundreds of points, and
    // asking the whole ribbon at every sample was most of the aprons' cost, MEASURED)
    const pidx = new CellIndex(8);
    const segs: { ax: number; az: number; bx: number; bz: number; h: number }[] = [];
    const addSegs = (r: MmPaving) => {
      const rr = r.half + 0.1;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
        pidx.add(segs.length, Math.min(ax, bx) - rr, Math.max(ax, bx) + rr, Math.min(az, bz) - rr, Math.max(az, bz) + rr);
        segs.push({ ax, az, bx, bz, h: r.half + 0.05 });
      }
    };
    out.forEach(addSegs);
    const paved = (x: number, z: number) => {
      for (const q of pidx.query(x, z) ?? []) {
        const g = segs[q], vx = g.bx - g.ax, vz = g.bz - g.az, L2 = vx * vx + vz * vz;
        const t = L2 < 1e-12 ? 0 : ((x - g.ax) * vx + (z - g.az) * vz) / L2;
        if (t < -0.02 || t > 1.02) continue;
        if (Math.hypot(x - g.ax - t * vx, z - g.az - t * vz) < g.h) return true;
      }
      return false;
    };
    const fps = [...C.footprints, ...B.footprints.filter((f) => f.kind === "house" || f.kind === "tower")];
    for (const f of fps) {
      const P = f.pts;
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4], c = P[(i + 2) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
        // outward: away from the footprint's other side
        let nx = -uz, nz = ux;
        if ((c[0] - a[0]) * nx + (c[1] - a[1]) * nz > 0) { nx = -nx; nz = -nz; }
        const ok = (t: number) => {
          // the stone clear of other stone (most sides face a street or a court: asked
          // first), the ground level under it and RISER_CLEAR round it (the mesh smears a
          // riser a cell onto the flat), the stone clear of buildings
          { const x = a[0] + ux * t + nx * AW / 2, z = a[1] + uz * t + nz * AW / 2; if (paved(x, z)) return false; }
          for (const [o, dt] of [[AW / 2, 0], [0.4, 0], [AW + RISER_CLEAR, 0], [AW / 2, -RISER_CLEAR], [AW / 2, RISER_CLEAR]] as const) {
            const x = a[0] + ux * (t + dt) + nx * o, z = a[1] + uz * (t + dt) + nz * o;
            const g = T.ground(x, z);
            if (g === null || Math.abs(g - f.level) > 0.06) return false;
          }
          for (const o of [0.15, AW / 2, AW - 0.05]) {
            const x = a[0] + ux * t + nx * o, z = a[1] + uz * t + nz * o;
            if (occupied(x, z) || paved(x, z)) return false;
          }
          return true;
        };
        let run0 = -1;
        const flush = (t1: number) => {
          if (run0 >= 0 && t1 - run0 >= 1.2) {
            const o = AW / 2 + 0.02;
            const pts: P2[] = [[a[0] + ux * run0 + nx * o, a[1] + uz * run0 + nz * o], [a[0] + ux * t1 + nx * o, a[1] + uz * t1 + nz * o]];
            add({ id: `apron_${f.id}_${i}_${Math.round(run0)}`, tex: "pave_setts", pts, half: AW / 2, map: false }, "apron");
            // (checked clear across its width as it was laid, so the claims below need
            // not walk it; the aprons after it see it here -- two buildings' aprons never meet)
            const r = out[out.length - 1];
            r.claimed = true;
            addSegs(r);
          }
          run0 = -1;
        };
        for (let t = 0; t <= len + 1e-6; t += 0.75) {
          if (ok(t)) { if (run0 < 0) run0 = t; } else flush(t - 0.75);
        }
        flush(len);
      }
    }
  }
  // THE CLAIMS (section 4: "the paving rectangles never overlap"; PATH.md, the
  // Capital's paving): laid in priority order, the rings first within a tier,
  // each ribbon takes only what nothing before it took. A ribbon whose centre
  // line runs onto earlier stone -- a cross stair over the Mere Walk, a gate
  // passage's lip over its street, Bursar's Walk onto the terrace -- is cut
  // there and laid in the pieces either side, each ending on the earlier
  // ribbon's edge. (They were laid over it, 3 cm higher: two stones, one ground.)
  out.sort((a, b) => a.priority - b.priority || Number(!!b.ring) - Number(!!a.ring));
  // every laid ribbon's SEGMENTS on a grid (a ring span is a hundred of them,
  // and its box is the whole ring): a point asks only the few near it
  const laid: MmPaving[] = [];
  const lidx = new CellIndex(8);
  const segOf: [number, number][] = [];
  const claim = (p: MmPaving) => {
    const r = p.half + 0.1;
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
      lidx.add(segOf.length, Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(az, bz) - r, Math.max(az, bz) + r);
      segOf.push([laid.length, i]);
    }
    laid.push(p);
  };
  const taken = (x: number, z: number): boolean => {
    const c = lidx.query(x, z);
    if (!c || !c.length) return false;
    const seen = new Set<number>();
    for (const k of c) {
      const r = segOf[k][0];
      if (seen.has(r)) continue;
      seen.add(r);
      if (onRibbon(laid[r], x, z)) return true;
    }
    return false;
  };
  for (const p of out) {
    if (p.ring || p.claimed) { claim(p); continue; }
    const len = polyLength(p.pts);
    const n = Math.max(2, Math.ceil(len / CLAIM_STEP));
    const free: boolean[] = [];
    for (let k = 0; k <= n; k++) { const q = alongLine(p.pts, (k / n) * len); free.push(!taken(q.x, q.z)); }
    if (free.every(Boolean)) { claim(p); continue; }
    // the free runs, their ends found to a centimetre on the earlier ribbon's edge
    const edge = (a: number, b: number): number => {
      const fa = !taken(alongLine(p.pts, a).x, alongLine(p.pts, a).z);
      for (let it = 0; it < 12; it++) {
        const m = (a + b) / 2, q = alongLine(p.pts, m);
        if (!taken(q.x, q.z) === fa) a = m; else b = m;
      }
      return fa ? a : b;
    };
    let part = 0;
    for (let k = 0; k <= n;) {
      if (!free[k]) { k++; continue; }
      let j = k;
      while (j + 1 <= n && free[j + 1]) j++;
      const s0 = k === 0 ? 0 : edge((k - 1) / n * len, k / n * len);
      const s1 = j === n ? len : edge(j / n * len, (j + 1) / n * len);
      if (s1 - s0 >= 0.6) claim({ ...p, id: `${p.id}~${part++}`, pts: subLine(p.pts, s0, s1) });
      k = j + 1;
    }
  }
  void S;
  return laid;
}

/** strictly on a ribbon: within its half-width, and between its ends (a ribbon
 * ends square, not round) */
export function onRibbon(r: { pts: P2[]; half: number }, x: number, z: number, inset = 0): boolean {
  // the nearest point of the centre line (round a bend the nearest is a vertex,
  // and the stone is there: a ribbon's rings turn about its spine)
  let best = Infinity, bs = 0, acc = 0;
  const pts = r.pts;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
    const t = L2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / L2));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best) { best = d; bs = acc + t * L; }
    acc += L;
  }
  if (best >= r.half - inset) return false;
  // past either end along the line (a ribbon ends square, not round)
  const along = (a: P2, b: P2) => { const vx = b[0] - a[0], vz = b[1] - a[1], L = Math.hypot(vx, vz) || 1; return ((x - a[0]) * vx + (z - a[1]) * vz) / L; };
  if (bs < 1e-6 && along(pts[0], pts[1]) < inset) return false;
  if (bs > acc - 1e-6 && along(pts[pts.length - 1], pts[pts.length - 2]) < inset) return false;
  return true;
}
function polyLength(pts: P2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function alongLine(pts: P2[], s: number): { x: number; z: number } {
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (rest <= L || i === pts.length - 1) { const t = L ? Math.min(1, rest / L) : 0; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t }; }
    rest -= L;
  }
  return { x: pts[0][0], z: pts[0][1] };
}
/** the polyline between arc lengths s0 and s1 */
function subLine(pts: P2[], s0: number, s1: number): P2[] {
  const out: P2[] = [];
  const a = alongLine(pts, s0);
  out.push([a.x, a.z]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc > s0 + 1e-6 && acc < s1 - 1e-6) out.push([pts[i][0], pts[i][1]]);
  }
  const b = alongLine(pts, s1);
  out.push([b.x, b.z]);
  return out;
}

/** a footprint's four corners back to a body */
function bodyOfPts(pts: P2[]): Body {
  const [a, b, , d] = pts;
  const cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][1] + pts[2][1]) / 2;
  const hx = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, hz = Math.hypot(d[0] - a[0], d[1] - a[1]) / 2;
  // local +x runs a -> b: (cos yaw, -sin yaw)
  const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  return { cx, cz, hx, hz, yaw };
}
