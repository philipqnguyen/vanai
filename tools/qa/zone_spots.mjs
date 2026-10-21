// Every place in one zone that the game needs a player to reach, ring-tested
// on the real ground and checked reachable from the spawn -- the wilds build's
// "never bury or block an NPC, a quest target, a node, a portal or a landing"
// gate (tmp/wilds/RULINGS.md), run after any reshape or dressing pass.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/zone_spots.mjs <zoneKey> [--base http://localhost:5173]
//        [--out file.json] [--step 2] [--extra spots.json]
//
// The spots come from shared/data, not from a hand list, so nothing a zone
// agent forgets to name escapes the check: the spawn, the crystals, NPCs,
// nodes, interactables, landmarks, portals, camps, and the LANDINGS other
// zones' portals drop players at (their tx, tz). Each spot also says which
// quests name it (giver, talk / interact / reach / kill target), so a failure
// says what breaks. `--extra` adds [[x, z, "label"], ...] (quest spots that
// live only in a zone module).
//
// Two tests per spot, both against isWalkable AND the colliders (isWalkable
// knows nothing about rocks, walls or houses -- ZONE-NOTES.md "QA harness"):
//   ring   the centre and 8 points round it at the kind's radius. A landing
//          or the spawn must be clear all round (a body arrives there); a
//          crystal needs a walk round its plinth; an NPC, node or object only
//          needs a side to stand on within the server's reach.
//   reach  a flood fill from the spawn over a `step` m grid of walkable,
//          collider-free ground (8-connected): the spot, or a ring point of
//          it, must be in the filled region. It is a grid, not a pathfinder
//          -- it cannot see a 1 m step or a ledge -- but it does catch the
//          failure a reshape makes: a ravine, a cliff line or a scatter of
//          rock that cuts a place off from the rest of the zone.
// Exit 1 when anything FAILs; WARN (camps, landmarks) does not fail the run.
import fs from "node:fs";
import { QA_BASE } from "./lib/playwright.mjs";
import { openZone, parseArgs, closeBrowser, ROOT } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, step: "2" });
const zone = args._[0];
if (!zone) { console.error("usage: node tools/qa/zone_spots.mjs <zoneKey> [--base url] [--out file.json] [--step 2] [--extra spots.json]"); process.exit(2); }
const ZONES = JSON.parse(fs.readFileSync(`${ROOT}shared/data/zones.json`, "utf8"));
const QUESTS = JSON.parse(fs.readFileSync(`${ROOT}shared/data/quests.json`, "utf8"));
const def = ZONES[zone];
if (!def) { console.error(`no zone ${zone}`); process.exit(2); }

// which quests name an id, and how
const uses = {};
const use = (id, s) => (uses[id] ??= []).push(s);
for (const [k, q] of Object.entries(QUESTS)) {
  if (q.giver) use(q.giver, `${k}:giver`);
  const o = q.objective || {};
  for (const t of o.targets || []) use(t, `${k}:${o.type}`);
}

// Radii: what a player needs round each kind. The server's reach is 8 m to an
// NPC, 9 to a portal, 7 to a crystal or object, 6 to a node (world.rb), so a
// ring well inside that with a few clear points is "can be used".
//   kind: [ring radius m, clear ring points needed of 8, centre must be clear, FAIL or WARN]
const RULE = {
  spawn: [2.5, 8, true, "FAIL"], landing: [2.5, 8, true, "FAIL"],
  crystal: [5.5, 6, false, "FAIL"], npc: [2.5, 3, false, "FAIL"], node: [2.5, 3, false, "FAIL"],
  object: [3, 3, false, "FAIL"], portal: [5, 3, false, "FAIL"],
  landmark: [8, 1, false, "WARN"], camp: [8, 3, false, "WARN"],
};
const spots = [];
const add = (kind, id, x, z, extra = {}) => spots.push({ kind, id, x, z, quests: uses[id] || [], ...extra });
if (def.spawn) add("spawn", "spawn", def.spawn.x, def.spawn.z);
for (const n of def.npcs || []) add("npc", n.id, n.x, n.z, { npcKind: n.kind });
for (const n of def.nodes || []) add("node", n.id, n.x, n.z);
for (const n of def.milestones || []) {
  add("crystal", n.id, n.x, n.z);
  // a teleport, teleport_home and a death release all land a body BESIDE the
  // plinth, at +5, +3 (world.rb teleport_to_crystal)
  add("landing", `${n.id} arrival`, n.x + 5, n.z + 3, { plinth: [n.x, n.z] });
}
// a spot on a platform says its height and site (a writ on a dais, a dungeon's
// boss-room exit): it is tested on that platform, below
const raisedOf = (n) => typeof n.y === "number" && n.site ? { y: n.y, site: n.site } : {};
for (const n of def.interactables || []) add("object", n.id, n.x, n.z, raisedOf(n));
for (const n of def.landmarks || []) add("landmark", n.id, n.x, n.z);
for (const p of def.portals || []) add("portal", p.id, p.x, p.z, { to: p.to, ...raisedOf(p) });
for (const c of def.camps || []) {
  // a camp is named by its monster in kill quests
  spots.push({ kind: "camp", id: `${c.monster}@${c.x},${c.z}`, x: c.x, z: c.z, quests: uses[c.monster] || [], lvl: `${c.min_lvl}-${c.max_lvl}` });
}
for (const [k, z] of Object.entries(ZONES)) for (const p of z.portals || []) {
  if (p.to === zone && typeof p.tx === "number") add("landing", `${p.id} (from ${k})`, p.tx, p.tz);
}
if (args.extra) for (const [x, z, label] of JSON.parse(fs.readFileSync(args.extra, "utf8"))) add("object", label || `${x},${z}`, x, z);

const log = (s) => console.error(s);
const { browser, page, errors } = await openZone(zone, { base: args.base, log });
const res = await page.evaluate(async ([spots, RULE, step, size, sites]) => {
  const zv = window.__zv;
  // NOT zv.blocked: that asks resolveCollision whether a 0.2 m step in +x is
  // refused, and a body already inside a circle collider may move anywhere
  // that does not take it closer to the centre -- so every point inside a rim
  // rock's circle EAST of its centre read as free, and this fill walked
  // through the mountains (MEASURED 2026-10-10, the rim audit). The question
  // is scene.ts bodyClearAt's: does a body standing here overlap a collider?
  // (zoneview.ts is a hash-locked copy -- MOONMERE.md section 6 -- so the fix
  // lives here, not in zv.blocked.)
  const S = await import("/src/scene.ts");
  const blocked = (x, z) => !S.bodyClearAt(x, z, zv.ground(x, z));
  const ok = (x, z) => zv.walkable(x, z) && !blocked(x, z);
  // the flood fill, on the plate's square; the shaped edge and the rim are
  // walkable=false or colliders already
  const half = size / 2, n = Math.floor(size / step) + 1;
  const idx = (x, z) => { const i = Math.round((x + half) / step), j = Math.round((z + half) / step); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const seen = new Uint8Array(n * n); // 0 unknown, 1 reached, 2 refused
  const sp = spots.find((s) => s.kind === "spawn") || spots[0];
  // start from the nearest good cell to the spawn (it may stand on a deck)
  let start = -1;
  for (let r = 0; r <= 6 && start < 0; r += step) for (let a = 0; a < 16 && start < 0; a++) {
    const x = sp.x + Math.cos(a * Math.PI / 8) * r, z = sp.z + Math.sin(a * Math.PI / 8) * r;
    if (ok(x, z)) start = idx(x, z);
  }
  let reached = 0;
  if (start >= 0) {
    const q = [start]; seen[start] = 1;
    while (q.length) {
      const c = q.pop(); reached++;
      const i = c % n, j = (c - i) / n;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const k = jj * n + ii;
        if (seen[k]) continue;
        const x = ii * step - half, z = jj * step - half;
        // the midpoint too, so a diagonal step cannot slip between two rocks
        if (ok(x, z) && ok((x + i * step - half) / 2, (z + j * step - half) / 2)) { seen[k] = 1; q.push(k); } else seen[k] = 2;
      }
    }
  }
  const inFill = (x, z) => {
    // the nearest grid cells round a point; any reached one counts
    for (const dx of [-step, 0, step]) for (const dz of [-step, 0, step]) { const k = idx(x + dx, z + dz); if (k >= 0 && seen[k] === 1 && Math.hypot(dx, dz) <= step * 1.5) return true; }
    return false;
  };
  return {
    reachedCells: reached, step,
    spots: spots.map((s) => {
      const [r, need, centre, sev] = RULE[s.kind];
      // A spot on a platform the ground function does not see (its `y` above
      // that ground): a point is good when it is on one of its site's decks at
      // that height with a body clear there, and the spot is reached when the
      // foot of a flight up to that height is (the fill walks the floor only)
      const site = s.site && sites[s.site];
      const raised = site && typeof s.y === "number" && Math.abs(s.y - zv.ground(s.x, s.z)) > 0.5;
      const onDeck = (x, z) => (site.decks || []).some((d) => {
        if (Math.abs(d.y - s.y) > 0.65) return false;
        const dx = x - d.cx, dz = z - d.cz, sn = d.sin ?? 0, cs = d.cos ?? 1;
        return Math.abs(dx * cs - dz * sn) < d.hx && Math.abs(dx * sn + dz * cs) < d.hz;
      });
      // A crystal's arrival is 5.8 m from the crystal, and its 2.5 m ring
      // reaches onto the plinth -- the 6.6 m square terrace (scene.ts
      // makeTeleportCrystal, HALF 3.3) and its r 3.3 collider -- the one thing a
      // body arriving beside a crystal is meant to stand next to: every zone's
      // arrival read 6/8. A ring point that is walkable and on the plinth's
      // square, a body's width out, counts as clear (spot_audit.mjs ignores the
      // plinth's collider too).
      const byPlinth = s.plinth ? (x, z) => zv.walkable(x, z) && Math.max(Math.abs(x - s.plinth[0]), Math.abs(z - s.plinth[1])) < 3.3 + 0.55 : () => false;
      const good = raised ? (x, z) => onDeck(x, z) && S.bodyClearAt(x, z, s.y) : (x, z) => ok(x, z) || byPlinth(x, z);
      const ring = [];
      for (let a = 0; a < 8; a++) { const x = s.x + Math.cos(a * Math.PI / 4) * r, z = s.z + Math.sin(a * Math.PI / 4) * r; ring.push({ x, z, ok: good(x, z) }); }
      const clear = ring.filter((p) => p.ok).length;
      const c = raised ? { walkable: onDeck(s.x, s.z), blocked: !S.bodyClearAt(s.x, s.z, s.y) } : { walkable: zv.walkable(s.x, s.z), blocked: blocked(s.x, s.z) };
      const flightFoot = () => (site.ramps || []).some((f) => Math.abs(Math.max(f.y0, f.y1) - s.y) < 0.65 && (f.y0 < f.y1 ? inFill(f.x0, f.z0) : inFill(f.x1, f.z1)));
      const reach = raised ? flightFoot() : inFill(s.x, s.z) || ring.some((p) => p.ok && inFill(p.x, p.z));
      const why = [];
      if (centre && (!c.walkable || c.blocked)) why.push(`centre ${c.walkable ? "" : "unwalkable "}${c.blocked ? "in a collider" : ""}`.trim());
      if (clear < need) why.push(`ring ${clear}/8 clear at ${r} m (needs ${need})`);
      if (!reach) why.push("not reachable from the spawn");
      return { ...s, ground: +zv.ground(s.x, s.z).toFixed(2), centre: c, ring: clear, reach, verdict: why.length ? sev : "ok", why };
    }),
  };
}, [spots, RULE, Number(args.step), def.size, def.sites || {}]);

const bad = res.spots.filter((s) => s.verdict !== "ok");
for (const s of res.spots) {
  if (s.verdict === "ok") continue;
  console.log(`${s.verdict.padEnd(4)} ${s.kind.padEnd(8)} ${s.id} (${s.x}, ${s.z})  ${s.why.join("; ")}${s.quests.length ? "  quests: " + s.quests.join(" ") : ""}`);
}
const fails = bad.filter((s) => s.verdict === "FAIL").length;
console.log(`${zone}: ${res.spots.length} spots, ${fails} FAIL, ${bad.length - fails} WARN; flood fill reached ${res.reachedCells} cells of ${res.step} m${errors.length ? `; ${errors.length} page errors` : ""}`);
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ zone, ...res, errors }, null, 1));
await closeBrowser(browser, page);
process.exit(fails ? 1 : 0);
