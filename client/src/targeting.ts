// Who Tab reaches for.
//
// Targeting is one list, not four: every monster, fellow explorer, NPC and
// touchable world object the camera is looking at, sorted by how far away it
// is. Tab walks the whole list; Shift+Tab walks only enemies; Ctrl+Tab only
// players. The picking itself lives here, free of Babylon and of game state,
// so it can be reasoned about (and tested) on plain numbers.

export type TargetKind = "enemy" | "player" | "npc" | "object";

export interface TargetCandidate {
  id: string;   // exactly what goes into state.targetId
  kind: TargetKind;
  name: string;
  x: number;
  y: number;    // eye height, for the cone test against the camera
  z: number;
}

export interface Vec3 { x: number; y: number; z: number }

export interface ViewFrame {
  cam: Vec3;    // where the camera sits
  fwd: Vec3;    // unit vector: where it looks
  x: number;    // where the player stands — distances are measured from here
  z: number;
}

export interface CycleOptions {
  kinds?: TargetKind[]; // undefined = every kind
  maxDist?: number;
  minDot?: number;
}

// A ~75° cone around the camera's forward ray, out to a comfortable engage
// distance. Both are the numbers the enemy-only cycle has always used.
export const VIEW_DOT = 0.25;
export const TAB_RANGE = 35;

// The prefixes that keep a milestone named "mere_votive" from being mistaken
// for monster "m12". Monsters and players keep their server ids ("m…"/"p…").
const NPC_PREFIX = "npc:";
const OBJ_PREFIX = "obj:";

export function npcTargetId(npcId: string): string { return NPC_PREFIX + npcId; }
export function objTargetId(objId: string): string { return OBJ_PREFIX + objId; }

// What a target id refers to. "other" is a monster or a player — those still
// belong to state.monsters / state.players, which answer the question better
// than any prefix could.
export function parseTargetId(tid: string | null): { kind: "npc" | "object" | "other"; id: string } {
  if (!tid) return { kind: "other", id: "" };
  if (tid.startsWith(NPC_PREFIX)) return { kind: "npc", id: tid.slice(NPC_PREFIX.length) };
  if (tid.startsWith(OBJ_PREFIX)) return { kind: "object", id: tid.slice(OBJ_PREFIX.length) };
  return { kind: "other", id: tid };
}

// The candidates the player can actually see, nearest first. Ties break on id
// so the cycle stays stable when two things sit the same distance away.
export function targetsInView(
  candidates: TargetCandidate[],
  view: ViewFrame,
  opts: CycleOptions = {},
): TargetCandidate[] {
  const { kinds, maxDist = TAB_RANGE, minDot = VIEW_DOT } = opts;
  return candidates
    .filter((c) => !kinds || kinds.includes(c.kind))
    .map((c) => ({ c, d: Math.hypot(c.x - view.x, c.z - view.z) }))
    .filter((o) => o.d < maxDist)
    .filter((o) => {
      const dx = o.c.x - view.cam.x;
      const dy = o.c.y - view.cam.y;
      const dz = o.c.z - view.cam.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return (view.fwd.x * dx + view.fwd.y * dy + view.fwd.z * dz) / len > minDot;
    })
    .sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1))
    .map((o) => o.c);
}

// The next one along. A target that has left the view is not in the list, so
// the index is -1 and the cycle restarts at the nearest thing you can see.
export function nextTarget(list: TargetCandidate[], currentId: string | null): TargetCandidate | null {
  if (list.length === 0) return null;
  const idx = list.findIndex((c) => c.id === currentId);
  return list[(idx + 1) % list.length];
}
