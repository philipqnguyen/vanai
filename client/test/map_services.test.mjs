// The maps' service icons (client/src/map_services.ts): what a zone's services
// are -- zones.json `services` for a building (the auction house, an inn),
// NPC kinds for one person (vendor, trainer) -- the badges' look, the legend's
// rows and where a label goes; and that map.ts draws them, always, on the zone
// map and the minimap (Philip, 2026-10-11).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  zoneServices, serviceNpcIds, drawServiceIcon, legendRows, placeLabels, labelCandidates, serviceRadius,
  SERVICE_KINDS, SERVICE_STYLE, NPC_SERVICE, LEGEND_PAD, LEGEND_ICON, LEGEND_GAP,
} from '../src/map_services.ts';
import { LP_PATHS } from '../src/icons.ts';
import { MAIN_COLOR, SIDE_COLOR, GUILD_COLOR } from '../src/quest_rules.ts';
import { CROSSING_COLOR } from '../src/map_frame.ts';

const ZONES = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url), 'utf8'));

test('every city with a broker marks its auction house as a building that stands for the broker', () => {
  const cities = Object.entries(ZONES).filter(([, z]) => (z.npcs || []).some((n) => n.kind === 'auction'));
  assert.deepEqual(cities.map(([k]) => k).sort(), ['caerdun', 'capitalreturned', 'heartwood', 'moonmere']);
  for (const [key, z] of cities) {
    const marks = zoneServices(z);
    const auctions = marks.filter((m) => m.kind === 'auction');
    assert.equal(auctions.length, 1, `${key}: one auction house`);
    assert.equal(auctions[0].from, 'data', `${key}: marked from zones.json services, not at the broker`);
    const broker = z.npcs.find((n) => n.kind === 'auction');
    assert.ok(auctions[0].npcs.includes(broker.id), `${key}: the mark covers ${broker.id}`);
    // the auction house is first: its label is placed before any other
    assert.equal(marks[0].kind, 'auction');
    // and it is drawn inside the plate
    assert.ok(Math.abs(auctions[0].x) <= z.size / 2 && Math.abs(auctions[0].z) <= z.size / 2);
  }
});

test('inns are services entries over their innkeepers, who are vendor NPCs', () => {
  const inns = Object.entries(ZONES).flatMap(([k, z]) => zoneServices(z).filter((m) => m.kind === 'inn').map((m) => [k, m]));
  assert.deepEqual(inns.map(([k]) => k).sort(), ['caerdun', 'capitalreturned', 'heartwood', 'moonmere', 'northroad']);
  for (const [k, m] of inns) {
    for (const id of m.npcs) {
      const n = ZONES[k].npcs.find((x) => x.id === id);
      assert.equal(n.kind, 'vendor', `${k}: ${id} sells the inn's goods`);
      // the innkeeper is not drawn a second time as a vendor
      assert.ok(!zoneServices(ZONES[k]).some((s) => s.kind === 'vendor' && s.npcs.includes(id)));
    }
  }
});

test('vendors and trainers come from NPC kinds; flavour and quest NPCs are not services', () => {
  const cd = ZONES.caerdun;
  const marks = zoneServices(cd);
  const ids = serviceNpcIds(marks);
  for (const n of cd.npcs) {
    if (NPC_SERVICE[n.kind]) assert.ok(ids.has(n.id), `${n.id} (${n.kind}) has a mark`);
    else assert.ok(!ids.has(n.id), `${n.id} (${n.kind}) has none`);
  }
  assert.equal(marks.filter((m) => m.kind === 'trainer').length, 1);
  const hal = marks.find((m) => m.kind === 'trainer');
  assert.deepEqual([hal.name, hal.from, hal.npcs], ['Drillmaster Hal', 'npc', ['drillmaster_hal']]);
  // a field zone's trader is a vendor mark too; a dungeon has none
  assert.ok(zoneServices(ZONES.huntingwood).some((m) => m.kind === 'vendor'));
  assert.deepEqual(zoneServices(ZONES.mausoleum), []);
});

test('a broker with no building entry still marks the auction house; an unknown kind is skipped', () => {
  const def = {
    services: [{ kind: 'bank', name: 'Vault', x: 0, z: 0 }, { kind: 'inn', name: 'Inn', x: 5, z: 5, npcs: ['keeper'] }],
    npcs: [
      { id: 'b', name: 'Broker B', kind: 'auction', x: 1, z: 2 },
      { id: 'keeper', name: 'Keeper', kind: 'vendor', x: 6, z: 6 },
      { id: 'v', name: 'Vend', kind: 'vendor', x: 3, z: 3 },
      { id: 'f', name: 'Folk', kind: 'flavor', x: 4, z: 4 },
    ],
  };
  const m = zoneServices(def);
  assert.deepEqual(m.map((s) => [s.kind, s.name, s.from]), [['auction', 'Broker B', 'npc'], ['inn', 'Inn', 'data'], ['vendor', 'Vend', 'npc']]);
  assert.deepEqual([...serviceNpcIds(m)].sort(), ['b', 'keeper', 'v']);
  assert.deepEqual(zoneServices(null), []);
});

test('the four badges are told apart by shape, colour and glyph (the crystal keeps its lozenge)', () => {
  assert.deepEqual([...SERVICE_KINDS], ['auction', 'inn', 'trainer', 'vendor']);
  const colors = SERVICE_KINDS.map((k) => SERVICE_STYLE[k].color.toLowerCase());
  assert.equal(new Set(colors).size, 4);
  // none is a colour another map mark already means: crystal, crossing, folk, the duties
  for (const c of ['#5c8fe6', CROSSING_COLOR, '#a9dca0', '#9aa4c0', MAIN_COLOR, SIDE_COLOR, GUILD_COLOR]) assert.ok(!colors.includes(c.toLowerCase()), c);
  // the crossing shares the duties' diamond, so it never wears a duty's colour (it was a lilac
  // beside the guild's until 2026-10-12)
  for (const c of [MAIN_COLOR, SIDE_COLOR, GUILD_COLOR]) assert.notEqual(CROSSING_COLOR.toLowerCase(), c.toLowerCase());
  assert.equal(new Set(SERVICE_KINDS.map((k) => SERVICE_STYLE[k].glyph)).size, 4);
  // the vendor's bag is the HUD's own (icons.ts)
  assert.equal(SERVICE_STYLE.vendor.glyph, LP_PATHS.bags);
  // the auction house is the one filled badge, and the largest
  assert.deepEqual(SERVICE_KINDS.filter((k) => SERVICE_STYLE[k].filled), ['auction']);
  assert.ok(SERVICE_KINDS.every((k) => k === 'auction' || serviceRadius('auction', 5) > serviceRadius(k, 5)));
});

// a canvas that records what is drawn, and a Path2D that records its path
function recorder() {
  const calls = [];
  const ctx = new Proxy({ lineWidth: 1 }, {
    get(t, p) {
      if (p in t) return t[p];
      return (...a) => calls.push([p, ...a]);
    },
    set(t, p, v) { t[p] = v; calls.push([`=${String(p)}`, v]); return true; },
  });
  return { ctx, calls };
}
globalThis.Path2D = class { constructor(d) { this.d = d; } };

test('drawServiceIcon draws a badge at its radius and strokes the kind\'s glyph', () => {
  for (const kind of SERVICE_KINDS) {
    const { ctx, calls } = recorder();
    drawServiceIcon(ctx, kind, 40, 30, 5);
    const arcs = calls.filter((c) => c[0] === 'arc');
    assert.deepEqual(arcs[0].slice(1, 4), [40, 30, serviceRadius(kind, 5)]);
    const fills = calls.filter((c) => c[0] === '=fillStyle').map((c) => c[1]);
    assert.equal(fills[0] === SERVICE_STYLE[kind].color, SERVICE_STYLE[kind].filled);
    const glyph = calls.find((c) => c[0] === 'stroke' && c[1]);
    assert.equal(glyph[1].d, SERVICE_STYLE[kind].glyph);
    assert.equal(calls.filter((c) => c[0] === 'save').length, calls.filter((c) => c[0] === 'restore').length);
  }
});

test('the legend flows into two rows and drops what will not fit rather than overprinting', () => {
  const measure = (t) => t.length * 5;
  const entries = ['teleport crystal', 'auction house', 'inn', 'trainer', 'vendor', 'crossing', 'folk', 'main duty', 'side duty', 'guild duty']
    .map((label) => ({ key: label, label }));
  const slots = legendRows(entries, 560, measure);
  assert.equal(slots.length, entries.length);
  assert.equal(slots[0].x, LEGEND_PAD);
  assert.equal(slots[1].x, LEGEND_PAD + LEGEND_ICON + measure('teleport crystal') + LEGEND_GAP);
  assert.ok(slots.some((s) => s.row === 1));
  for (const s of slots) assert.ok(s.x + LEGEND_ICON + measure(s.label) <= 560 - LEGEND_PAD, s.label);
  // a narrow canvas runs out of rows: the rest are dropped
  const narrow = legendRows(entries, 200, measure);
  assert.ok(narrow.length < entries.length && narrow.every((s) => s.row < 2));
});

test('labels go below, else elsewhere, never over another; the auction house always gets one', () => {
  const W = 300, H = 200;
  const a = { x: 100, y: 100, r: 8, w: 60, h: 10, must: true };
  const [s] = placeLabels([a], W, H);
  assert.deepEqual(s, { x: 100, y: 100 + 8 + 2 + 8, align: 'center' });
  // a second mark right beside it cannot go below (the first label is there)
  const b = { x: 112, y: 100, r: 6, w: 50, h: 10 };
  const [, s2] = placeLabels([a, b], W, H);
  assert.ok(s2 && !(s2.align === 'center' && s2.y > 100), JSON.stringify(s2));
  // walled in on every side, an ordinary label is left off, a must label is not
  const wall = [[0, 0, W, H]];
  assert.deepEqual(placeLabels([{ ...b }], W, H, wall), [null]);
  assert.ok(placeLabels([a], W, H, wall)[0]);
  // and a label at the canvas edge is kept on it
  const edge = placeLabels([{ x: 2, y: 100, r: 4, w: 40, h: 10 }], W, H)[0];
  assert.equal(edge.align, 'left');
  // eight candidates, each its text's rect beside the mark
  assert.equal(labelCandidates(a).length, 8);
});

test('map.ts draws the services on the zone map and the minimap, ungated, and hud.ts uses that minimap', () => {
  const src = fs.readFileSync(new URL('../src/map.ts', import.meta.url), 'utf8');
  const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));
  for (const name of ['drawZone', 'drawMinimapStatic']) {
    const body = fn(name);
    assert.match(body, /zoneServices\(/, name);
    assert.match(body, /drawServiceIcon\(/, name);
    // no discovery test anywhere near the services
    assert.doesNotMatch(body.slice(body.indexOf('zoneServices('), body.indexOf('drawServiceIcon(') + 80), /discoveries/, name);
  }
  assert.match(fn('drawLegend'), /legendRows\(/);
  const hud = fs.readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
  assert.match(hud, /drawMinimapStatic\(ctx, state\.zone, myX, myZ, mmRange, S\)/);
});
