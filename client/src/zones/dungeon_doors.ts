// The dungeon doors (2026-10-10 doors pass, tmp/wilds/audit/AUDIT.md section 4).
// Philip: a portal in the middle of a zone must be the dungeon's own way in --
// "a portal at the door of the dungeon entrance". Four entrances did not read
// as one, so each is now built masonry, and this file holds the two shapes
// they share:
//
//  - MasonryGeo: one merged mesh of original cut-stone geometry -- boxes,
//    walls with an arched opening, flights of steps, balustrades -- laid out
//    in a local frame and baked to world space as it goes. One entrance is one
//    mesh in the wild kit's own triplanar ashlar (nature.ts stoneMaterial, the
//    ruins' material, cached per tint: no new material where the zone's ruins
//    already use that tint), so the whole door costs one main-pass draw plus
//    its shadow and glow passes, however many parts.
//  - stairCourt: a balustraded stair well sunk into the ground, a flight down
//    to a landing and an arched door in the end wall. The terrain cannot cut
//    a well: its mesh is a 4.67 m grid (terrainSub on a 700 m plate), so a
//    carved edge smears across a whole cell. The court is therefore laid ON
//    the grid: the floor's carve is full depth out to grid lines, the side and
//    end walls are each exactly one cell thick, and the cell where the drawn
//    ground drops from field level to the floor lies entirely inside their
//    solid stone. Their tops are paved walks at field level (decks), the
//    flight is a ramp, the landing a flat.
//
// No lights; the dark of the doorway is a black panel behind the veil.
import { Mesh, VertexData } from "@babylonjs/core";
import type { Material } from "@babylonjs/core";
import { scene, mat, tbox, texMat, addShadowCaster, buildApi, ground, addMapOnlyWall } from "../scene";
import { stoneMaterial } from "../nature";

// buildTerrain's cell on every 700 m field plate (terrainSub: 150 cells)
export const CELL = 700 / 150;
/** The terrain grid line nearest v. */
export const gridLine = (v: number): number => -350 + Math.round((v + 350) / CELL) * CELL;

/** The doors' cut stone: the wild kit's ashlar (world-space triplanar, so the
 *  geometry needs no UVs), at the ruins' own grain. */
export const doorStone = (tint: string): Material => stoneMaterial(scene, "ashlar", tint, false, false, 0.55);

type V3 = [number, number, number];

export class MasonryGeo {
  private pos: number[] = []; private nrm: number[] = []; private uv: number[] = []; private idx: number[] = [];
  private X = 0; private Y = 0; private Z = 0; private c = 1; private s = 0;
  constructor(private tile = 3) {}

  /** Lay what follows in a frame at (x, y, z) turned by yaw: local +x maps to
   *  (cos yaw, -sin yaw), local +z to (sin yaw, cos yaw) -- Babylon's
   *  rotation.y, placeExact's and the veils' convention. */
  frame(x: number, y: number, z: number, yaw: number): this {
    this.X = x; this.Y = y; this.Z = z; this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    return this;
  }
  private w(p: V3): V3 { return [this.X + p[0] * this.c + p[2] * this.s, this.Y + p[1], this.Z - p[0] * this.s + p[2] * this.c]; }
  private quad(ps: V3[], n: V3, uvs: [number, number][]): void {
    const base = this.pos.length / 3;
    const wn: V3 = [n[0] * this.c + n[2] * this.s, n[1], -n[0] * this.s + n[2] * this.c];
    const W = ps.map((p) => this.w(p));
    W.forEach((p, i) => {
      this.pos.push(...p); this.nrm.push(...wn);
      this.uv.push(uvs[i][0] / this.tile, uvs[i][1] / this.tile);
    });
    // Babylon's front face winds so that (p1-p0) x (p2-p0) points AGAINST its
    // normal (VertexData.ComputeNormals' convention; MeshBuilder's plane):
    // wind each quad to its own normal, whatever order its corners came in
    const a = [W[1][0] - W[0][0], W[1][1] - W[0][1], W[1][2] - W[0][2]], b = [W[2][0] - W[0][0], W[2][1] - W[0][1], W[2][2] - W[0][2]];
    const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    if (cx * wn[0] + cy * wn[1] + cz * wn[2] < 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // a planar face, its UVs read off the two axes it lies along
  private face(ps: V3[], n: V3): void {
    const ax = Math.abs(n[0]) > 0.5 ? [2, 1] : Math.abs(n[1]) > 0.5 ? [0, 2] : [0, 1];
    this.quad(ps, n, ps.map((p) => [p[ax[0]], p[ax[1]]] as [number, number]));
  }

  /** A solid block; `skip` leaves out faces nobody sees ("-y" the bottom...). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip: string[] = ["-y"]): this {
    const F: [string, V3[], V3][] = [
      ["+z", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
      ["-z", [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
      ["+x", [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]],
      ["-x", [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
      ["+y", [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]],
      ["-y", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
    ];
    for (const [k, ps, n] of F) if (!skip.includes(k)) this.face(ps, n);
    return this;
  }

  /** A wall x0..x1 by y0..y1, thickness z0..z1 (front face +z), pierced by an
   *  opening ox0..ox1 from its threshold `sill` up to `spring`, round-headed
   *  (crown spring + half the width) unless `flat`. Below the sill it is solid. */
  archWall(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
    o: { x0: number; x1: number; sill: number; spring: number; flat?: boolean }, skip: string[] = ["-y"]): this {
    const r = (o.x1 - o.x0) / 2, cx = (o.x0 + o.x1) / 2;
    // the piers, the sill under the opening, and the outer faces
    this.box(x0, o.x0, y0, y1, z0, z1, [...skip, "+x"]);
    this.box(o.x1, x1, y0, y1, z0, z1, [...skip, "-x"]);
    if (o.sill > y0) this.box(o.x0, o.x1, y0, o.sill, z0, z1, [...skip, "+x", "-x"]);
    // the jambs (the piers' inner faces, threshold to spring)
    this.face([[o.x0, o.sill, z1], [o.x0, o.sill, z0], [o.x0, o.spring, z0], [o.x0, o.spring, z1]], [1, 0, 0]);
    this.face([[o.x1, o.sill, z0], [o.x1, o.sill, z1], [o.x1, o.spring, z1], [o.x1, o.spring, z0]], [-1, 0, 0]);
    if (o.flat) {
      this.box(o.x0, o.x1, o.spring, y1, z0, z1, [...skip.filter((k) => k !== "-y"), "+x", "-x"]);
      return this;
    }
    // the head: faces filled from the arch's curve up to the wall's top in
    // vertical strips, and the soffit under the curve
    const N = 14;
    const pt = (i: number): [number, number, number] => { const a = Math.PI * (1 - i / N); return [cx + r * Math.cos(a), o.spring + r * Math.sin(a), a]; };
    for (let i = 0; i < N; i++) {
      const [ax, ay, aa] = pt(i), [bx, by, ba] = pt(i + 1);
      this.face([[ax, ay, z1], [bx, by, z1], [bx, y1, z1], [ax, y1, z1]], [0, 0, 1]);
      this.face([[bx, by, z0], [ax, ay, z0], [ax, y1, z0], [bx, y1, z0]], [0, 0, -1]);
      const m = (aa + ba) / 2;
      this.quad([[ax, ay, z0], [ax, ay, z1], [bx, by, z1], [bx, by, z0]], [-Math.cos(m), -Math.sin(m), 0],
        [[r * aa, z0], [r * aa, z1], [r * ba, z1], [r * ba, z0]]);
    }
    if (!skip.includes("+y")) this.face([[o.x0, y1, z1], [o.x1, y1, z1], [o.x1, y1, z0], [o.x0, y1, z0]], [0, 1, 0]);
    return this;
  }

  /** A flight of `n` steps across x0..x1 climbing toward -z: from z0 (its foot,
   *  at y0) to z1 (its head, at y1), z1 < z0. Each step is solid down to `base`. */
  flight(x0: number, x1: number, z0: number, y0: number, z1: number, y1: number, n: number, base: number): this {
    const g = (z1 - z0) / n, r = (y1 - y0) / n;
    for (let k = 0; k < n; k++) {
      const za = z0 + g * k, zb = z0 + g * (k + 1), top = y0 + r * (k + 1);
      // the tread's top, its riser (facing the foot) and its two ends
      this.box(x0, x1, base, top, zb, za, ["-y", "-z"]);
    }
    return this;
  }

  /** A balustrade along local z from z0 to z1 at x, standing on y: a plinth,
   *  square balusters, a hand rail, and newels at the ends. 1 m high. */
  balustrade(x: number, y: number, z0: number, z1: number): this {
    const za = Math.min(z0, z1), zb = Math.max(z0, z1), L = zb - za;
    this.box(x - 0.24, x + 0.24, y, y + 0.22, za, zb);
    this.box(x - 0.22, x + 0.22, y + 0.84, y + 1.0, za, zb);
    const n = Math.max(1, Math.round(L / 0.36));
    for (let i = 1; i < n; i++) {
      const z = za + (L * i) / n;
      this.box(x - 0.08, x + 0.08, y + 0.22, y + 0.84, z - 0.08, z + 0.08, ["-y", "+y"]);
    }
    for (const z of [za, zb]) this.box(x - 0.3, x + 0.3, y, y + 1.12, z - 0.3, z + 0.3);
    return this;
  }

  /** A hipped roof over x0..x1 by z0..z1, eaves at y, its ridge `rise` above
   *  them along the longer side. */
  hipRoof(x0: number, x1: number, z0: number, z1: number, y: number, rise: number): this {
    const yr = y + rise;
    const slope = (a: V3, b: V3, c: V3, d: V3, n: V3) => {
      const l = Math.hypot(n[0], n[1], n[2]);
      this.face([a, b, c, d], [n[0] / l, n[1] / l, n[2] / l]);
    };
    if (x1 - x0 >= z1 - z0) {
      const h = (z1 - z0) / 2, zc = (z0 + z1) / 2, r0 = x0 + h, r1 = x1 - h;
      slope([x0, y, z1], [x1, y, z1], [r1, yr, zc], [r0, yr, zc], [0, h, rise]);
      slope([x1, y, z0], [x0, y, z0], [r0, yr, zc], [r1, yr, zc], [0, h, -rise]);
      slope([x1, y, z1], [x1, y, z0], [r1, yr, zc], [r1, yr, zc], [rise, h, 0]);
      slope([x0, y, z0], [x0, y, z1], [r0, yr, zc], [r0, yr, zc], [-rise, h, 0]);
    } else {
      const h = (x1 - x0) / 2, xc = (x0 + x1) / 2, r0 = z0 + h, r1 = z1 - h;
      slope([x1, y, z0], [x1, y, z1], [xc, yr, r1], [xc, yr, r0], [rise, h, 0]);
      slope([x0, y, z1], [x0, y, z0], [xc, yr, r0], [xc, yr, r1], [-rise, h, 0]);
      slope([x0, y, z1], [x1, y, z1], [xc, yr, r1], [xc, yr, r1], [0, h, rise]);
      slope([x1, y, z0], [x0, y, z0], [xc, yr, r0], [xc, yr, r0], [0, h, -rise]);
    }
    return this;
  }

  mesh(name: string, material: Material): Mesh {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.pos; vd.normals = this.nrm; vd.uvs = this.uv; vd.indices = this.idx;
    vd.applyToMesh(m);
    m.material = material; m.isPickable = false; m.receiveShadows = true;
    addShadowCaster(m);
    m.freezeWorldMatrix();
    return m;
  }
}

/** Slate for a roof (UV'd, so a MasonryGeo of its own). */
export const doorSlate = (tint: string): Material => texMat(`dd_slate_${tint}`, "roof_slates_02", { tint, noCull: true });

/** The dark beyond a doorway: one black panel, standing behind the veil. */
export function doorDark(name: string, x: number, y: number, z: number, yaw: number, w: number, h: number): Mesh {
  const d = tbox(name, w, h, 0.2, mat("dd_dark", "#050505", { spec: 0 }), 4);
  d.position.set(x, y + h / 2, z); d.rotation.y = yaw;
  return d;
}

// ── THE STAIR COURT ────────────────────────────────────────────────────────
export interface StairCourtSpec {
  /** Where the flight starts down, on the court's axis: a terrain grid crossing. */
  head: [number, number];
  /** Down the flight: an axis, [1,0] [-1,0] [0,1] or [0,-1] (the grid's). */
  dir: [number, number];
  /** Inner half-width, out to the grid lines the walls' inner faces stand on. */
  hw: number;
  /** The flight's run and the landing's run; together a whole number of cells. */
  flight: number; land: number;
  /** Head to landing. */
  drop: number;
  /** The doorway in the end wall: clear width and its jambs' height. */
  door: { w: number; spring: number };
  /** The end wall's top over the head's level (it stands up out of the field). */
  parapet: number;
  tint: string;
  key: string;
  /** Balustrades along the side walls' inner edges. */
  rail?: boolean;
  /** Field level for the head and the walls' tops: the ground round the court
   *  is eased to it (fully within 2 m of the walls, not at all past 10 m).
   *  Without it the head stands at the field's own height there. */
  level?: number;
}

export interface StairCourt {
  spec: StairCourtSpec;
  /** registerZone carve: the floor and its margin, full depth to the grid lines. */
  carve: { carve: (x: number, z: number, h: number, pre?: (px: number, pz: number) => number) => number };
  /** True over the court's footprint (walls included): scatters keep off. */
  covers: (x: number, z: number) => boolean;
  /** Circles over the footprint, for `avoid` lists and dressCliffs. */
  circles: () => [number, number, number][];
  /** World point at (across u, along s) on the court's axis. */
  at: (u: number, s: number) => [number, number];
  /** The yaw whose normal runs down the flight. */
  yaw: number;
  /** Builds it; returns the doorway's threshold height and the veil's spot. */
  build: () => { yh: number; yf: number; veilAt: [number, number]; crown: number; portal: [number, number] };
}

export function stairCourt(spec: StairCourtSpec): StairCourt {
  const [hx, hz] = spec.head, [dx, dz] = spec.dir;
  const wall = CELL, endWall = CELL, run = spec.flight + spec.land;
  // across = local +x of the frame whose +z runs down the flight
  const yaw = Math.atan2(dx, dz);
  const ax = Math.cos(yaw), az = -Math.sin(yaw);
  const local = (x: number, z: number): [number, number] => {
    const rx = x - hx, rz = z - hz;
    return [rx * ax + rz * az, rx * dx + rz * dz];
  };
  const at = (u: number, s: number): [number, number] => [hx + ax * u + dx * s, hz + az * u + dz * s];
  let yh: number | null = spec.level ?? null;
  const head = (pre?: (px: number, pz: number) => number) => (yh ??= pre ? pre(hx, hz) : ground(hx, hz));
  const floorAt = (y: number, s: number) => y - spec.drop * Math.max(0, Math.min(1, s / spec.flight));
  const carve = {
    carve(x: number, z: number, h: number, pre?: (px: number, pz: number) => number): number {
      const [u, s] = local(x, z);
      if (spec.level !== undefined) {
        const du = Math.max(0, Math.abs(u) - spec.hw - wall), ds = Math.max(0, -s, s - run - endWall), d = Math.hypot(du, ds);
        if (d < 10) h += (spec.level - h) * (d <= 2 ? 1 : 1 - (d - 2) / 8);
      }
      if (s < 0 || s > run + 1.2 || Math.abs(u) > spec.hw + 1.2) return h;
      const y = head(pre);
      // 0.6 m under the steps and the landing, eased in over the head's first
      // 1.5 m so the lip is not dished
      const inner = floorAt(y, s) - 0.6 * Math.min(1, s / 1.5);
      // full depth to 0.3 m inside the wall lines, field level 1 m in: the step
      // between lies under the walls' stone, never in the open
      const ramp = (v: number) => (v <= 0.3 ? 0 : v >= 1 ? 1 : (v - 0.3) / 0.7);
      const t = Math.max(ramp(Math.abs(u) - spec.hw), ramp(s - run));
      return Math.min(h, inner + (h - inner) * t);
    },
  };
  const covers = (x: number, z: number) => {
    const [u, s] = local(x, z);
    return s > -1 && s < run + endWall + 1 && Math.abs(u) < spec.hw + wall + 1;
  };
  const circles = (): [number, number, number][] => {
    const out: [number, number, number][] = [];
    const len = run + endWall, r = spec.hw + wall + 2;
    for (let s = 0; s <= len + 0.01; s += r) out.push([...at(0, s), r * 1.2]);
    out.push([...at(0, len), r * 1.2]);
    return out;
  };

  const build = () => {
    const y = yh ?? head(), yf = y - spec.drop;
    const top = y + 0.12, crownTop = y + spec.parapet, deep = yf - 1.6;
    const st = doorStone(spec.tint);
    const g = new MasonryGeo(3).frame(hx, 0, hz, yaw);
    const hw = spec.hw, W = hw + wall;
    // the side walls: one cell of solid stone each, paved on top at field level
    g.box(hw, W, deep, top, 0, run, ["-y", "+z"]);
    g.box(-W, -hw, deep, top, 0, run, ["-y", "+z"]);
    // the end wall, the doorway through it: it stands up out of the field as
    // the door's own head, the whole width of the court
    const o = { x0: -spec.door.w / 2, x1: spec.door.w / 2, sill: yf, spring: yf + spec.door.spring };
    g.archWall(-W, W, deep, crownTop, run, run + endWall, o);
    // a coping course along the end wall's top, a hand's breadth proud
    g.box(-W - 0.15, W + 0.15, crownTop, crownTop + 0.3, run - 0.15, run + endWall + 0.15, ["-y"]);
    // the flight, risers of ~0.16 m, and the landing
    const n = Math.max(4, Math.round(spec.drop / 0.16));
    g.flight(-hw, hw, spec.flight, yf, 0, y, n, deep);
    g.box(-hw, hw, deep, yf, spec.flight, run, ["-y", "-z", "+z", "+x", "-x"]);
    // the balustrades along the inner edges, field level, the head left open
    if (spec.rail) for (const side of [-1, 1]) g.balustrade(side * (hw + 0.4), top, 0.6, run - 0.2);
    g.mesh(`dd_court_${spec.key}`, st);
    // the dark behind the veil, a metre and a half into the doorway
    const [dkx, dkz] = at(0, run + 1.6);
    doorDark(`dd_dark_${spec.key}`, dkx, yf - 0.1, dkz, yaw, spec.door.w + 0.4, spec.door.spring + spec.door.w / 2 + 0.3);

    // walking: the flight is a ramp, the landing a flat, the wall tops decks
    const [fx, fz] = at(0, spec.flight);
    buildApi.addRamp(hx, hz, y, fx, fz, yf, hw - 0.05);
    const [l0x, l0z] = at(-hw, spec.flight + 0.2), [l1x, l1z] = at(hw, run);
    buildApi.addFlatZone(Math.min(l0x, l1x), Math.max(l0x, l1x), Math.min(l0z, l1z), Math.max(l0z, l1z), yf);
    for (const side of [-1, 1]) {
      const [cx, cz] = at(side * (hw + wall / 2), run / 2);
      buildApi.addDeck(cx, cz, wall / 2, run / 2, yaw, top);
      // the wall is solid to anyone below its top; on it, it is the floor
      buildApi.addBoxCollider(cx, cz, wall / 2, run / 2, yaw, top - 0.05, deep);
    }
    // the end wall: solid but for the doorway's first metre, where the veil stands
    const [ex, ez] = at(0, run + 1 + (endWall - 1) / 2);
    buildApi.addBoxCollider(ex, ez, W, (endWall - 1) / 2, yaw, crownTop + 0.3, deep);
    for (const side of [-1, 1]) {
      const half = (W - spec.door.w / 2) / 2;
      const [px, pz] = at(side * (spec.door.w / 2 + half), run + 0.5);
      buildApi.addBoxCollider(px, pz, half, 0.5, yaw, crownTop + 0.3, deep);
    }
    if (spec.rail) for (const side of [-1, 1]) {
      const [cx, cz] = at(side * (hw + 0.4), (run + 0.4) / 2);
      buildApi.addBoxCollider(cx, cz, 0.3, (run - 0.8) / 2, yaw, top + 1.1, top - 0.3);
    }
    // the map: its walls as a U round the sunk court, the end wall across the
    // door (the court drew as open ground, its portal standing in nothing).
    // Map only: `covers` and the circles keep the scatter off it already
    const half = wall / 2;
    addMapOnlyWall([at(-hw - half, 0), at(-hw - half, run + endWall / 2), at(hw + half, run + endWall / 2), at(hw + half, 0)], half);
    const veilAt = at(0, run + 0.35), portal = at(0, run - 0.6);
    return { yh: y, yf, veilAt, crown: spec.door.spring + spec.door.w / 2, portal };
  };
  return { spec, carve, covers, circles, at, yaw, build };
}

// ── THE ARCHED FRONT ───────────────────────────────────────────────────────
export interface ArchFrontSpec {
  key: string;
  /** The outer face's centre on the ground, and the way out of the door (an axis). */
  at: [number, number]; out: [number, number];
  /** Across the face, and back from it into the building. */
  width: number; depth: number;
  /** Foot of the masonry, the threshold, and the top of the walls. */
  y0: number; sill: number; top: number;
  door: { w: number; spring: number };
  tint: string;
  /** Steps out from the threshold down to `foot`, `run` metres out, `width` wide. */
  steps?: { run: number; width: number; foot: number };
  /** Merlons along the top of the face. */
  merlons?: boolean;
  /** How far into the doorway the walk goes before the dark (default 1.2). */
  reveal?: number;
  /** How far back from the face the dark stands (default: the back of the depth). */
  dark?: number;
}

/** A cut-stone front with an arched doorway through it: the door, its dark,
 *  its colliders and the walk up to the threshold. Returns the frame's helpers
 *  and where the veil and the portal go. */
export function archFront(spec: ArchFrontSpec, geo?: MasonryGeo): {
  geo: MasonryGeo; yaw: number; at: (u: number, s: number) => [number, number];
  veilAt: [number, number]; portal: [number, number]; crown: number;
} {
  const [fx, fz] = spec.at, [ox, oz] = spec.out;
  const yaw = Math.atan2(ox, oz), ax = Math.cos(yaw), az = -Math.sin(yaw);
  // local u across the face, s out of it
  const at = (u: number, s: number): [number, number] => [fx + ax * u + ox * s, fz + az * u + oz * s];
  const W = spec.width / 2, dw = spec.door.w / 2, reveal = spec.reveal ?? 1.2;
  const g = (geo ?? new MasonryGeo(3)).frame(fx, 0, fz, yaw);
  g.archWall(-W, W, spec.y0, spec.top, -spec.depth, 0, { x0: -dw, x1: dw, sill: spec.sill, spring: spec.sill + spec.door.spring });
  // a coping course, a plinth course, and the merlons along the face
  g.box(-W - 0.2, W + 0.2, spec.top, spec.top + 0.35, -spec.depth - 0.2, 0.2);
  g.box(-W - 0.12, -dw - 0.5, spec.y0, spec.sill + 0.7, 0, 0.12, ["-y", "-z"]).box(dw + 0.5, W + 0.12, spec.y0, spec.sill + 0.7, 0, 0.12, ["-y", "-z"]);
  if (spec.merlons) {
    const n = Math.max(2, Math.round(spec.width / 2.4));
    for (let i = 0; i < n; i++) {
      const u = -W + (spec.width / n) * (i + 0.5);
      g.box(u - 0.6, u + 0.6, spec.top + 0.35, spec.top + 1.6, -1.0, 0.2);
    }
  }
  if (spec.steps) {
    const st = spec.steps, n = Math.max(2, Math.round((spec.sill - st.foot) / 0.17));
    g.flight(-st.width / 2, st.width / 2, st.run, st.foot, 0, spec.sill, n, st.foot - 1.2);
    const [a0, a1] = [at(0, st.run + 0.3), at(0, 0)];
    buildApi.addRamp(a0[0], a0[1], st.foot, a1[0], a1[1], spec.sill, st.width / 2 - 0.1);
  }
  // the dark, just inside the back of the doorway
  const [kx, kz] = at(0, -(spec.dark ?? spec.depth - 0.12));
  doorDark(`dd_dark_${spec.key}`, kx, spec.sill - 0.1, kz, yaw, spec.door.w + 0.4, spec.door.spring + dw + 0.3);
  // the threshold is a flat; the walk stops `reveal` metres in
  const c0 = at(-dw, -reveal), c1 = at(dw, 0.35);
  buildApi.addFlatZone(Math.min(c0[0], c1[0]), Math.max(c0[0], c1[0]), Math.min(c0[1], c1[1]), Math.max(c0[1], c1[1]), spec.sill);
  const half = (W - dw) / 2;
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * (dw + half), -spec.depth / 2);
    buildApi.addBoxCollider(px, pz, half, spec.depth / 2, yaw, spec.top + 0.4, spec.y0 - 1);
  }
  const back = (spec.depth - reveal) / 2;
  const [bx, bz] = at(0, -reveal - back);
  buildApi.addBoxCollider(bx, bz, dw, back, yaw, spec.top + 0.4, spec.y0 - 1);
  return { geo: g, yaw, at, veilAt: at(0, -0.45), portal: at(0, 0.9), crown: spec.door.spring + dw };
}
