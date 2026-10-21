// Moonmere's streets drawn as stone (S1 review, MOONMERE.md A-9): no lawn where a street or a
// court is walked. Every walkable point on a 0.5 m grid inside the Crown's street and court
// corridors (the layout's streets, less their stair flights and decks) is ray-picked for the TOP
// DRAWN SURFACE among the ground, the paving and the riser skin. Where the terrain itself is on
// top -- a gap between two ribbons, a street's last half metre against a wall -- it must draw as
// the plinth skirt's setts: the skirt mask (zones/moonmere.ts paintSkirt) lit there, on ground
// flat enough for the skirt. What the ground's shader draws there is worked out as it does
// (zones/moonmere.ts MoonmereLawnPlugin: the lawn's weight on flat ground over the strand, the
// skirt's over it): a point is LAWN where the lawn shows through by more than 30% (a mask texel
// half covered at a ribbon's blurred edge shows it at 25%), RAW where the bare terrain sheet does
// by more than half (neither lawn, skirt nor the cliff's rock covering it).
// Under a flight, a landing, a deck or a building the terrain is never seen: skipped. Listed,
// and the script exits 1.
// S2 REVIEW: the census also asks (a) for THE BEACH -- the outer coast's sand sheet (mm_beach) is a
// 3.5 m grid with its alpha per vertex, and where it lies over a walked point with its alpha over
// 0.15 it is drawn there (it broke through the Quay Ring's riser foot, a stair's cheek, the
// Boathouse Hard and the west quay's waterline, unseen by this census, which asked only for lawn);
// (b) at the WALKED QUAY's cells, not only the streets' square-ended cores -- every walkable point
// at the quay's level within R1's foot of the water (the hards' junctions with the Quay Ring were
// never sampled); (c) along every cross stair's flanks, a level ray at the cheek from 1.2 m out at
// each metre of its height over the quay: the terrain or the sand met before the masonry is raw
// ground standing through the cheek.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_lawn.mjs [http://localhost:5173] [daytime] [l1|l2] [gardens]
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';

const base = process.argv.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const daytime = process.argv.find((a) => /^0?\.\d+$/.test(a)) ?? '0.2';
// the Crown (zones/moonmere_city.ts CROWN); `--part l1` (S2) adds the College Arm and the Mere: the
// east of the island from the Crown's box down to the mouth, and the mere's west half (its quays,
// the Mere Walk, the Lamp and Ash Stairs, the Lamp Hard and the Sea Lamp's yard)
const CROWN_BOX = { x0: -75, x1: 70, z0: 80, z1: 215 };
// `l2` (S3) the whole city: and the West Arm (the island west of the Crown's box and the mere's west
// half, out to the coast: the West Terrace, WR1/WR2 and the Long Garden), the knoll's west end
// (Observatory Close, the Shelf, the Alchemists), the Landing and the spit north of the Crown's box
const L1_BOXES = [CROWN_BOX, { x0: 20, x1: 150, z0: -70, z1: 150 }, { x0: -75, x1: 20, z0: -70, z1: 80 }];
const L2_BOXES = [...L1_BOXES, { x0: -150, x1: -75, z0: -70, z1: 140 }, { x0: -110, x1: -75, z0: 140, z1: 205 }, { x0: -45, x1: 60, z0: 215, z1: 270 }];
const BOXES = process.argv.includes('l2') ? L2_BOXES : process.argv.includes('l1') ? L1_BOXES : [CROWN_BOX];
const STEP = 0.5;

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?zone=moonmere&daytime=${daytime}`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.waitForTimeout(2000);
const out = await p.evaluate(async ({ BOXES, STEP, GARDENS }) => {
  const loaded = performance.getEntriesByType('resource').map((e) => e.name);
  const S = await import(loaded.find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname)));
  const B = await import(loaded.find((n) => n.split('?')[0].endsWith('/node_modules/.vite/deps/@babylonjs_core.js')));
  const L = (await import('/src/moonmere-layout.json')).default;
  const sc = window.__zv.scene;
  const tex = sc.textures.find((t) => t.name === 'mm_plinth_skirt');
  const ctx = tex?.getContext();
  if (!ctx) return { error: 'no skirt mask' };
  const img = ctx.getImageData(0, 0, 1024, 1024).data;
  const mask = (x, z) => { const k = 1024 / 360, u = Math.floor((x + 170) * k), v = Math.floor((z + 60) * k); return u < 0 || v < 0 || u > 1023 || v > 1023 ? 0 : img[(v * 1024 + u) * 4]; };
  const meshes = sc.meshes.filter((m) => m.name === 'ground' || m.name.startsWith('mm_paving') || m.name === 'mm_riser_skin' || m.name === 'mm_beach');
  const beach = sc.meshes.find((m) => m.name === 'mm_beach');
  const bCol = beach?.getVerticesData(B.VertexBuffer.ColorKind), bIdx = beach?.getIndices();
  // the sand's drawn alpha at a pick: its face's three vertices' alpha, barycentric
  const sandAlpha = (h) => {
    if (!bCol || !bIdx || h.faceId < 0) return 1;
    const i0 = bIdx[h.faceId * 3], i1 = bIdx[h.faceId * 3 + 1], i2 = bIdx[h.faceId * 3 + 2];
    return bCol[i0 * 4 + 3] * (1 - h.bu - h.bv) + bCol[i1 * 4 + 3] * h.bu + bCol[i2 * 4 + 3] * h.bv;
  };
  const pred = (m) => meshes.includes(m);
  const streets = L.streets.filter((s) => s.paving && s.kind !== 'deck' && s.kind !== 'stair');
  const { planMoonmere } = await import('/src/zones/moonmere_plan.ts');
  const P = planMoonmere(L, { flightBodies: true });
  const inBody = (b, x, z, pad = 0) => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.cx, dz = z - b.cz; return Math.abs(dx * c - dz * s) < b.hx + pad && Math.abs(dx * s + dz * c) < b.hz + pad; };
  const covers = [...P.S.flights.map((f) => ({ ...f.body, hx: f.body.hx + 0.45 })), ...P.S.decks, ...P.H.decks, ...[...P.B.footprints, ...P.C.footprints].filter((f) => f.body).map((f) => f.body)];
  const near = (s, x, z) => {
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      // (square-ended, as a ribbon is: a court's centre line ends a half-width short of nothing)
      const t = ((x - ax) * vx + (z - az) * vz) / (L2 || 1);
      if (t < 0 || t > 1) continue;
      if (Math.hypot(x - ax - t * vx, z - az - t * vz) < s.half - 0.15) return true;
    }
    return false;
  };
  const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const top_ = L.terrain.coast.beachTop, quay = L.terrain.levels.quay;
  let n = 0, top = { paving: 0, skirt: 0 };
  const bad = [];
  // (b) the walked quay: walkable, at the quay's level, within R1's foot of the water
  const r1Foot = L.terrain.bands.r1Bare[0];
  const quayCell = (x, z) => S.isWalkable(x, z) && Math.abs(S.groundHeight(x, z, quay + 0.3) - quay) < 0.2 && (P.T.o(x, z) ?? 99) < r1Foot;
  let nq = 0, nb = 0;
  for (const BOX of BOXES) for (let x = BOX.x0; x <= BOX.x1; x += STEP) for (let z = BOX.z0; z <= BOX.z1; z += STEP) {
    const onStreet = streets.some((s) => near(s, x, z));
    const onQuay = !onStreet && BOXES.length > 1 && quayCell(x, z);
    if ((!onStreet && !onQuay) || !S.isWalkable(x, z) || covers.some((b) => inBody(b, x, z))) continue;
    if (onQuay) nq++;
    const ray = new B.Ray(new B.Vector3(x, 60, z), new B.Vector3(0, -1, 0), 120);
    let hits = (sc.multiPickWithRay(ray, pred) || []).sort((a, c) => a.distance - c.distance);
    // (a) the sand where it is drawn over the walk; where its alpha is next to nothing it is not seen
    const first = hits[0];
    if (first?.pickedMesh === beach) {
      const a = sandAlpha(first);
      if (a > 0.15) { nb++; bad.push([x, z, +(60 - first.distance).toFixed(2), 0, +a.toFixed(2), 'beach']); continue; }
      hits = hits.slice(1);
    }
    const h = hits[0];
    if (!h) continue;
    n++;
    if (h.pickedMesh.name !== 'ground') { top.paving++; continue; }
    const y = 60 - h.distance, ny = h.getNormal(true)?.y ?? 1, mk = mask(x, z);
    const lawnK = ss(top_ + 0.25, top_ + 0.9, y) * ss(0.90, 0.97, ny);
    const sk = (mk / 255) * ss(0.62, 0.72, ny) * ss(quay - 0.4, quay - 0.1, y);
    // (the bare sheet is what neither the lawn, the skirt nor the cliff's rock -- scene.ts
    // CliffRockPlugin, 1 - smoothstep(0.45, 0.85, normal.y) -- covers)
    // (S2 review: below the lawn's line to the waterline the ground draws as the beach's sand --
    // zones/moonmere.ts SAND_GROUND -- which is no raw ground)
    const wl = L.terrain.levels.waterline, sandK = ss(wl - 0.7, wl - 0.3, y) * (1 - ss(top_ + 0.05, top_ + 0.3, y));
    const lawn = lawnK * (1 - sk), raw = (1 - lawnK) * (1 - sk) * (1 - sandK) * ss(0.45, 0.85, ny);
    if (lawn <= 0.3 && raw <= 0.5) { top.skirt++; continue; }
    bad.push([x, z, +y.toFixed(2), mk, +ny.toFixed(3), lawn > 0.3 ? 'lawn' : 'raw']);
  }
  // (c) the cross stairs' flanks: a level ray at the cheek from 1.2 m out, at each metre of height
  const cheeks = [];
  let nc = 0;
  if (BOXES.length > 1) {
    const solid = (m) => m.isVisible && m.isEnabled() && m.getTotalVertices() > 0 && !m.name.startsWith('mm_glow') && m.name !== 'mm_sea' && !/sky|water|foam|wash/i.test(m.name);
    for (const st of L.streets.filter((s) => /^(kiln|ropewalk|herb|lamp|ink|ash)$/.test(s.id) && s.profile)) {
      const prof = st.profile, len = prof[prof.length - 1][0];
      const at = (sv) => { for (let i = 1; i < prof.length; i++) if (sv <= prof[i][0]) { const [s0, y0] = prof[i - 1], [s1, y1] = prof[i]; return y0 + (y1 - y0) * (sv - s0) / Math.max(1e-6, s1 - s0); } return prof[prof.length - 1][1]; };
      let acc = 0;
      const pts = st.pts;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], sl = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / sl, uz = (bz - az) / sl;
        for (let d = 0.5; d < sl; d += 1.0) {
          const sv = acc + d; if (sv > len) break;
          const tread = at(sv);
          for (const side of [-1, 1]) {
            const o = side * (st.half + 0.49), nx = side * uz, nz = -side * ux;
            const cx = ax + ux * d + uz * o, cz = az + uz * d - ux * o;
            const g = S.groundHeight(cx + nx * 1.2, cz + nz * 1.2, quay + 0.3);
            for (let y = g + 0.4; y < tread - 0.2; y += 1.0) {
              nc++;
              const ray = new B.Ray(new B.Vector3(cx + nx * 1.2, y, cz + nz * 1.2), new B.Vector3(-nx, 0, -nz), 1.25);
              const h = sc.pickWithRay(ray, solid);
              if (!h?.hit) continue;
              const name = h.pickedMesh.name;
              if (name === 'ground' || (name === 'mm_beach' && sandAlpha(h) > 0.15)) cheeks.push([+cx.toFixed(2), +cz.toFixed(2), +y.toFixed(2), st.id, name]);
            }
          }
        }
        acc += sl;
      }
    }
  }
  // (d) A-13 (the S3 review: "the lawn census measures street points only", so the Long Garden's bed,
  // the knoll's borders and the Landing's shelf were never asked): with `gardens`, EVERY walkable
  // point of S3's gardens at their own level, off the streets too, by what draws on top -- a paving
  // sheet, the skirt's stone, lawn or raw ground. Lawn is a census here, not a fault (an orchard's
  // paths and an olive grove are kept grass), and so is raw ground (the outer coast's lips, O-13)
  const gardens = {};
  if (GARDENS) {
    for (const [name, Bx, lv] of [['longGarden', { x0: -135, x1: -84, z0: 62, z1: 124 }, 14.4], ['knoll', { x0: -92, x1: -44, z0: 155, z1: 195 }, 21.6],
      ['landingTerrace', { x0: 40, x1: 92, z0: 160, z1: 212 }, 7.2]]) {
      const g = gardens[name] = { n: 0, lawn: 0, skirt: 0, raw: 0, paving: {}, lawnCells: {}, rawCells: {} };
      for (let x = Bx.x0; x <= Bx.x1; x += STEP) for (let z = Bx.z0; z <= Bx.z1; z += STEP) {
        if (!S.isWalkable(x, z) || Math.abs(S.groundHeight(x, z, lv + 0.3) - lv) > 0.3 || covers.some((b) => inBody(b, x, z))) continue;
        const ray = new B.Ray(new B.Vector3(x, 60, z), new B.Vector3(0, -1, 0), 120);
        const h = (sc.multiPickWithRay(ray, (m) => pred(m) && m !== beach) || []).sort((a, c) => a.distance - c.distance)[0];
        if (!h) continue;
        g.n++;
        if (h.pickedMesh.name !== 'ground') { const k = (h.pickedMesh.material?.name ?? h.pickedMesh.name).replace(/^.*(pave_[a-z]+).*$/, '$1'); g.paving[k] = (g.paving[k] ?? 0) + 1; continue; }
        const y = 60 - h.distance, ny = h.getNormal(true)?.y ?? 1, mk = mask(x, z);
        const lawnK = ss(top_ + 0.25, top_ + 0.9, y) * ss(0.90, 0.97, ny);
        const sk = (mk / 255) * ss(0.62, 0.72, ny) * ss(quay - 0.4, quay - 0.1, y);
        const lawn = lawnK * (1 - sk), raw = (1 - lawnK) * (1 - sk) * ss(0.45, 0.85, ny);
        if (lawn > 0.3) { g.lawn++; const k = `${Math.floor(x / 4) * 4},${Math.floor(z / 4) * 4}`; g.lawnCells[k] = (g.lawnCells[k] ?? 0) + 1; }
        else if (raw > 0.5) { g.raw++; const k = `${Math.floor(x / 4) * 4},${Math.floor(z / 4) * 4}`; g.rawCells[k] = (g.rawCells[k] ?? 0) + 1; } else g.skirt++;
      }
    }
  }
  return { n, top, bad, nq, nb, nc, cheeks, gardens };
}, { BOXES, STEP, GARDENS: process.argv.includes('gardens') });
if (out.error) { console.log(out.error); process.exit(1); }
console.log(`${out.n} street points in ${BOXES.length > 3 ? 'L2 (the whole city)' : BOXES.length > 1 ? 'L1 (the Crown, the College Arm, the Mere)' : 'the Crown'} (${out.nq} of them walked quay off the streets' cores): ${out.top.paving} under paving, ${out.top.skirt} terrain drawn as stone (the skirt) or rock, ${out.bad.length} lawn, raw terrain or sand (${out.bad.filter((r) => r[5] === 'lawn').length} lawn, ${out.nb} sand)`);
// (where they lie: 4 m cells, the worst first)
{ const cl = {}; for (const r of out.bad) { const k = `${r[5]} ${Math.floor(r[0] / 4) * 4},${Math.floor(r[1] / 4) * 4}`; cl[k] = (cl[k] ?? 0) + 1; }
  console.log('  by 4 m cell:', Object.entries(cl).sort((a, c) => c[1] - a[1]).slice(0, 24).map(([k, v]) => `${k} x${v}`).join('; ')); }
if (process.env.LAWN_OUT) (await import('node:fs')).writeFileSync(process.env.LAWN_OUT, JSON.stringify(out, null, 0));
for (const r of out.bad.slice(0, 60)) console.log(`  ${r[5]} at (${r[0]}, ${r[1]}) y ${r[2]}  mask ${r[3]}  ${r[5] === 'beach' ? 'alpha' : 'normal.y'} ${r[4]}`);
if (out.nc) console.log(`${out.nc} level rays at the cross stairs' flanks: ${out.cheeks.length} met raw ground or sand before the masonry`);
for (const c of out.cheeks.slice(0, 30)) console.log(`  ${c[4]} through ${c[3]}'s flank at (${c[0]}, ${c[1]}) y ${c[2]}`);
for (const [name, g] of Object.entries(out.gardens ?? {})) {
  console.log(`garden ${name}: ${g.n} walkable points -- paving ${JSON.stringify(g.paving)}, skirt ${g.skirt}, lawn ${g.lawn} (${(100 * g.lawn / Math.max(1, g.n)).toFixed(0)}%), raw ${g.raw}`);
  console.log('  lawn by 4 m cell:', Object.entries(g.lawnCells).sort((a, c) => c[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} x${v}`).join('; '));
  console.log('  raw by 4 m cell:', Object.entries(g.rawCells).sort((a, c) => c[1] - a[1]).slice(0, 16).map(([k, v]) => `${k} x${v}`).join('; '));
}
if (errors.length) console.log('errors', errors.slice(0, 6));
await Promise.race([b.close(), new Promise((res) => setTimeout(res, 5000))]);
// (the gardens' census is reported, not gated: MEASURED at A-13, its raw points are the outer coast's
// lips -- the Long Garden's beyond its balustrade, the Landing terrace's on C1's edge -- O-13's)
process.exit(out.bad.length || out.cheeks.length || errors.length ? 1 : 0);
