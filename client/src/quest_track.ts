// Which duties the player has pinned, and the small pure rules the Duties
// tracker draws with. "Tracked" is client-only: the server knows nothing of
// it, so it lives per character in localStorage and is shared by the tracker
// and the Journal. Dependency-free so node --test can import it directly.

const key = (charId: number | string) => `vanai_tracked_${charId}`;

// localStorage is missing in node and can throw in a private window or with
// blocked site data; either way the answer is "nothing tracked"
export function getTracked(charId: number | string): string[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(key(charId)) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function isTracked(charId: number | string, id: string): boolean {
  return getTracked(charId).includes(id);
}

// flips one duty and returns whether it is tracked now
export function toggleTracked(charId: number | string, id: string): boolean {
  const list = getTracked(charId);
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  try { globalThis.localStorage?.setItem(key(charId), JSON.stringify(list)); } catch { /* unsaved */ }
  return at < 0;
}

// Tracker order: the tracked duties that are still active, in the order they
// were pinned; then the nearest; then everything else as it came.
export function orderTracker(activeIds: string[], trackedIds: string[], nearestId: string | null): string[] {
  const active = new Set(activeIds);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => { if (active.has(id) && !seen.has(id)) { seen.add(id); out.push(id); } };
  trackedIds.forEach(add);
  if (nearestId) add(nearestId);
  activeIds.forEach(add);
  return out;
}

// relRad: bearing relative to the camera, 0 = straight ahead, positive = clockwise
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
export function arrow8(relRad: number): string {
  const tau = Math.PI * 2;
  const a = ((relRad % tau) + tau) % tau;
  return ARROWS[Math.round(a / (tau / 8)) % 8];
}

export function fmtDist(m: number): string {
  // 999.6 m would round to "1000 m", so the switch keys off the rounded value
  if (Math.round(m) >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
