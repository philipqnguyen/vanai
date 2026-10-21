export interface CameraPoint { x: number; y: number; z: number }
export interface CameraRoom { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number; y0: number; y1: number; r?: number; cameraRadius?: number; cameraTargetHeight?: number; cameraHideBelow?: number;
  /** how near a walker outside counts as approaching it (the follow camera's pull-in), when nearer than the caller's pad: a room entered along a wall walk, whose doors a walker passes all the way along the walk */
  approach?: number }

/** Segment entry/exit fractions against a box, including thin walls at any distance. */
export function cameraBoxRay(origin: number[], delta: number[], low: number[], high: number[]): [number, number] | null {
  let entry = 0, exit = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(delta[i]) < 1e-9) { if (origin[i] < low[i] || origin[i] > high[i]) return null; continue; }
    const a = (low[i] - origin[i]) / delta[i], b = (high[i] - origin[i]) / delta[i];
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return [entry, exit];
}
export function cameraRoomHas(room: CameraRoom, p: CameraPoint, pad = 0): boolean {
  const dx = p.x - room.cx, dz = p.z - room.cz;
  if (p.y < room.y0 - .5 - Math.max(0,pad)*2 || p.y >= room.y1 - .15) return false;
  return room.r !== undefined ? Math.hypot(dx, dz) < room.r + pad
    : Math.abs(dx * room.cos - dz * room.sin) < room.hx + pad && Math.abs(dx * room.sin + dz * room.cos) < room.hz + pad;
}
/** Keep the orbit origin just inside the wall when the character crosses a threshold. */
export function cameraRoomTarget(room: CameraRoom, p: CameraPoint, pad: number): CameraPoint {
  const dx = p.x - room.cx, dz = p.z - room.cz;
  let x = dx * room.cos - dz * room.sin, z = dx * room.sin + dz * room.cos;
  if (room.r !== undefined) { const f = Math.min(1, (room.r - pad) / (Math.hypot(x, z) || 1)); x *= f; z *= f; }
  else { x = Math.max(-room.hx + pad, Math.min(room.hx - pad, x)); z = Math.max(-room.hz + pad, Math.min(room.hz - pad, z)); }
  return { x: room.cx + x * room.cos + z * room.sin, y: Math.min(p.y, room.y1 - pad), z: room.cz - x * room.sin + z * room.cos };
}
/** Distance to the inside face, even through an open doorway or a window. */
export function cameraRoomExit(room: CameraRoom, p: CameraPoint, direction: CameraPoint, pad: number): number {
  const dx = p.x - room.cx, dz = p.z - room.cz;
  const o = [dx * room.cos - dz * room.sin, p.y, dx * room.sin + dz * room.cos];
  const d = [direction.x * room.cos - direction.z * room.sin, direction.y, direction.x * room.sin + direction.z * room.cos];
  let distance = Infinity;
  if (room.r !== undefined) {
    const a = d[0] ** 2 + d[2] ** 2, b = o[0] * d[0] + o[2] * d[2], c = o[0] ** 2 + o[2] ** 2 - (room.r - pad) ** 2;
    if (a > 1e-9) distance = Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a);
  } else {
    for (const [i, h] of [[0, room.hx - pad], [2, room.hz - pad]]) if (Math.abs(d[i]) > 1e-9) distance = Math.min(distance, Math.max(0, (Math.sign(d[i]) * h - o[i]) / d[i]));
  }
  if (d[1] > 1e-9) distance = Math.min(distance, Math.max(0, (room.y1 - pad - p.y) / d[1]));
  if (d[1] < -1e-9) distance = Math.min(distance, Math.max(0, (room.y0 + pad - p.y) / d[1]));
  return distance;
}
export const easeCamera = (from: number, to: number, dt: number, rate = 8): number => to + (from - to) * Math.exp(-rate * dt);
export const cameraAngleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function cameraRoomDistance(room: CameraRoom, p: CameraPoint): number {
  const dx=p.x-room.cx,dz=p.z-room.cz;
  return room.r !== undefined ? Math.max(0,Math.hypot(dx,dz)-room.r)
    : Math.hypot(Math.max(0,Math.abs(dx*room.cos-dz*room.sin)-room.hx),Math.max(0,Math.abs(dx*room.sin+dz*room.cos)-room.hz));
}
