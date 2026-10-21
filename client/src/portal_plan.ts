// What a portal looks like and how big it is, from its zones.json entry -- the
// Babylon-free half of the portals (portal-fx.ts draws them), so the node tests
// can read every portal in the world without a scene.
//
// Two looks (Philip, 2026-10-10; tmp/wilds/RULINGS.md "Portals"):
//   fx "veil" -- the Dawn Veil, wherever you pass THROUGH something: a door, a
//                gate, a causeway, a zone's edge. Framed ONLY in a real built
//                opening; otherwise it stands free.
//   fx "rune" -- the Rune Circle, where you enter from open ground, and as a
//                dungeon's way back out (Philip, 2026-10-10: "inside dungeons,
//                we can use the rune portals"): a dungeon's one portal stands
//                in its entry room, sized to that floor and under its ceiling.
//
// The data (shared/data/zones.json, a portal entry):
//   "fx": "veil" | "rune"
//   "veil": { "width": m, "height": m, "yaw": rad, "at": [x, z], "frame": "arch"|"rect"|"free"|"span", "y": m }
//       width   across the passage (a framed veil: the opening's clear width)
//       height  threshold to head (an arch: to the crown; free/span: where the light has faded out)
//       yaw     the card's normal is (sin yaw, cos yaw) -- the direction you WALK through it, the
//               world.ts heading convention. Omitted: facing the zone's centre, which is right for
//               an edge exit and wrong for most doors, so a framed veil always says it.
//       at      where the veil stands when that is not the portal's own (x, z) -- the interaction
//               spot may be out in front of the opening (bl_capital)
//       frame   "arch"  a round-headed opening, its head a half circle the width across
//               "rect"  a square-headed door or gate
//               "free"  no frame: soft sides, the head fading into the air (a zone's edge)
//               "span"  sides that meet what flanks them (parapets), the head fading into the air
//       y       the threshold's height when the surface there is not it (a raised door sill)
//   "rune": { "radius": m, "at": [x, z], "column": m, "floor": m }        all optional
//       column  the light column's height; omitted, the open-ground one (runeColumn). Under a
//               ceiling it stops short of it -- a room's roof, a tie beam, a vault's crown
//       floor   how far a BUILT floor's top stands above the ground the disc follows: a
//               dungeon's flags, boards and inlays are laid a few cm proud of it (KayKit's
//               floor_tile_large tops at 0.05), and a disc at the ground's height lies under them
//   "th": rad    an explicit arrival heading for the body that LANDS through this portal at
//                (tx, tz) -- arrival.ts; without it the arrival faces the destination's centre
//
// The old `glow` object ({width, height, yaw, at, arch}) is still read when there
// is no `veil`, so a zone that has not been migrated keeps its sizes.

export type PortalFxKind = "veil" | "rune";
export type VeilFrame = "arch" | "rect" | "free" | "span";

/** Same colours everywhere (the ruling): gold at the floor, pale teal at the head, a warm white in the strands */
export const VEIL_COLOURS: readonly string[] = ["#ffae4a", "#7fd8e6", "#fff3d6"];
/** the rune's deep teal, its glyph light, its highlight (the study's) */
export const RUNE_COLOURS: readonly string[] = ["#0b3a32", "#3fe0b0", "#d2fff2"];

/** a free veil at a zone's edge: a road's width and then some, a little over two storeys */
export const FREE_VEIL = { width: 12, height: 8 };
/** a built opening nobody has measured yet: the old glow card's size */
export const FRAMED_DEFAULT = { width: 7.4, height: 7 };
export const RUNE_RADIUS = 3.2;
/** the shards' orbit height on open ground (portal-fx.ts); under a low column they ride lower */
export const RUNE_HEAD = 2.5;
/** the open-ground column: a landmark from across a field */
export const runeColumn = (radius: number): number => Math.max(8, radius * 3.1);
/** where the shards circle under a column `column` high: head height, or lower under a capped one */
export const runeHead = (column: number): number => Math.min(RUNE_HEAD, column * 0.55);
/** a portal this far or more from its zone's edge, in the open, is a rune's place, not a veil's */
export const RUNE_EDGE = 90;

export interface RuneData { radius?: number; at?: [number, number]; column?: number; floor?: number }
export interface VeilData { width?: number; height?: number; yaw?: number; at?: [number, number]; frame?: VeilFrame; y?: number }
export interface GlowData { width?: number; height?: number; yaw?: number; at?: [number, number]; arch?: boolean }
export interface PortalData {
  id: string; x: number; z: number; y?: number; to: string; tx?: number; tz?: number;
  built?: boolean; crossing?: boolean; fx?: PortalFxKind;
  veil?: VeilData; rune?: RuneData; glow?: GlowData; th?: number;
}
export interface ZoneData { kind?: string; size?: number; portals?: PortalData[] }

export interface VeilSpec { width: number; height: number; yaw: number; at: [number, number]; frame: VeilFrame; y?: number }
export interface RuneSpec { radius: number; at: [number, number]; column: number; floor: number }

/** the heading (and a veil's yaw) from (x, z) toward (cx, cz): atan2(dx, dz), world.ts myH */
export function yawToward(x: number, z: number, cx = 0, cz = 0): number {
  return Math.atan2(cx - x, cz - z);
}

/** how far (x, z) stands inside a square plate of `size` */
export function plateEdge(x: number, z: number, size: number): number {
  return size / 2 - Math.max(Math.abs(x), Math.abs(z));
}

/** a dungeon's portals are its way back out: one each, in its entry room */
export const isDungeonExit = (zone: ZoneData): boolean => zone.kind === "dungeon";

/**
 * The look a portal gets when its data does not say: a rune for a dungeon's
 * exit, or where it stands in the open, well inside a field zone, with nothing
 * built round it; a veil everywhere else. `edge` is its distance to the zone's
 * REAL edge (a shaped zone's outline); without one, the square plate's.
 */
export function suggestFx(p: PortalData, zone: ZoneData, edge?: number): PortalFxKind {
  if (isDungeonExit(zone)) return "rune";
  if (zone.kind !== "field" || p.built || p.crossing) return "veil";
  const e = edge ?? plateEdge(p.x, p.z, zone.size ?? 700);
  return e >= RUNE_EDGE ? "rune" : "veil";
}

export function portalFx(p: PortalData, zone: ZoneData): PortalFxKind {
  return p.fx === "veil" || p.fx === "rune" ? p.fx : suggestFx(p, zone);
}

/** A veil's size, facing and frame: `veil`, else the old `glow`, else the defaults for its kind. */
export function veilSpec(p: PortalData): VeilSpec {
  const v = p.veil, g = p.glow;
  const framed = !!p.built;
  const frame: VeilFrame = v?.frame ?? (g?.arch ? "arch" : framed ? "rect" : "free");
  const base = frame === "free" ? FREE_VEIL : FRAMED_DEFAULT;
  const width = v?.width ?? g?.width ?? base.width;
  const height = v?.height ?? g?.height ?? base.height;
  const at: [number, number] = v?.at ?? g?.at ?? [p.x, p.z];
  const yaw = v?.yaw ?? g?.yaw ?? yawToward(at[0], at[1]);
  const out: VeilSpec = { width, height, yaw, at, frame };
  if (v?.y !== undefined) out.y = v.y;
  return out;
}

export function runeSpec(p: PortalData): RuneSpec {
  const radius = p.rune?.radius ?? RUNE_RADIUS;
  return { radius, at: p.rune?.at ?? [p.x, p.z], column: p.rune?.column ?? runeColumn(radius), floor: p.rune?.floor ?? 0 };
}

/**
 * The shader's outline code (portal-fx.ts FRAG.veil): an arch needs a head at
 * least half its width up, or it has no room for its half circle and is drawn
 * square-headed.
 */
export function veilShapeCode(frame: VeilFrame, width = 1, height = 1): number {
  if (frame === "arch") return height >= width / 2 ? 0 : 1;
  return frame === "rect" ? 1 : frame === "free" ? 2 : 3;
}

/**
 * How far in from its sides the light reaches full strength, metres. A framed
 * veil a metre in from its jambs (less for a narrow door, or a 4 m door is all
 * feather); a free one a quarter of its width each side, so it has no edge to
 * see; a span only a little, so it meets the parapets.
 */
export function veilFeather(width: number, frame: VeilFrame): number {
  if (frame === "free") return Math.max(1.5, width * 0.25);
  if (frame === "span") return 0.45;
  return Math.min(1.1, width * 0.18);
}
