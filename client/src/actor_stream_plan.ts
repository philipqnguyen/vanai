// Which characters are drawn in full detail -- the Babylon-free half of
// character streaming, so the node tests can drive it on plain numbers.
//
// Philip's ruling (2026-10-13): show the NEAREST 20 characters -- NPCs and
// other players; never your own, which is always loaded -- in full detail,
// regardless of distance; everyone beyond the 20 shows only their nameplate.
// A dressed character costs ~65 MB of heap once its body type repeats and
// ~120 MB while it does not (Caerdun's 47 residents: ~3.9 GB), so the count of
// bodies, not the distance to them, is what the cap bounds.
//
// Membership must not churn while two characters stand about equally far
// away, or a walk through a crowd would load and unload bodies every frame
// (each load decodes gear and compiles shaders; each unload frees them):
//   - A free slot is filled at once, nearest first (entering a zone, someone
//     leaving).
//   - An outsider takes a member's slot only when it is clearly closer
//     (SWAP_MARGIN) than the member it would replace, and has stayed so for
//     SWAP_HOLD_S. The i-th nearest outsider is weighed against the i-th
//     farthest member, so a crowd arriving swaps in as one.
//   - A member let go is kept loaded but hidden in a small cache (CACHE_SIZE,
//     CACHE_TTL_S): walking back past it shows it again at once instead of
//     loading it again.
//   - A pinned character (a cutscene's cast) is always in full detail.
//
// DetailPlanner decides; DetailStreamer applies its answer through four hooks
// (build, show, hide, dispose) that the game and the Caerdun review supply.

/** Philip, 2026-10-13: "show nearest 20 regardless of distance". */
export const DETAIL_CAP = 20;
/** Metres an outsider must be closer than the member it replaces: about two
 * strides, more than two NPCs side by side differ, so standing still among a
 * crowd never trades one body for another. */
export const SWAP_MARGIN = 4;
/** Seconds an outsider must stay clearly closer before it swaps in: long enough
 * that passing someone at a corner does not load them, short enough that a
 * character you walk up to is dressed before you reach them. */
export const SWAP_HOLD_S = 0.75;
/** Characters let go but kept loaded and hidden: walking back and forth along a
 * street re-shows them instead of reloading. Each costs a whole character's
 * memory, so only a couple. */
export const CACHE_SIZE = 3;
/** Seconds a let-go character stays cached before it is freed. */
export const CACHE_TTL_S = 30;

export interface StreamCandidate { id: string; x: number; z: number; y?: number; pinned?: boolean }
export interface StreamState { full: ReadonlySet<string>; cached: ReadonlySet<string> }
export interface PlannerOptions { cap?: number; margin?: number; hold?: number; cacheSize?: number; cacheTtl?: number }

export class DetailPlanner {
  cap: number; margin: number; hold: number; cacheSize: number; cacheTtl: number;
  private members = new Set<string>();
  // outsider -> when it first stood clearly closer than the member it would replace
  private challengers = new Map<string, number>();
  // let go -> when; Map order is age, oldest first
  private cache = new Map<string, number>();

  constructor(o: PlannerOptions = {}) {
    this.cap = o.cap ?? DETAIL_CAP; this.margin = o.margin ?? SWAP_MARGIN; this.hold = o.hold ?? SWAP_HOLD_S;
    this.cacheSize = o.cacheSize ?? CACHE_SIZE; this.cacheTtl = o.cacheTtl ?? CACHE_TTL_S;
  }

  /** Who is in full detail and who is cached, seen from (px, pz[, py]) at `now` seconds. */
  update(px: number, pz: number, candidates: readonly StreamCandidate[], now: number, py?: number): StreamState {
    const dist = new Map<string, number>(), pinned = new Set<string>();
    for (const c of candidates) {
      const dy = py === undefined || c.y === undefined ? 0 : c.y - py;
      dist.set(c.id, Math.hypot(c.x - px, c.z - pz, dy));
      if (c.pinned) pinned.add(c.id);
    }
    // gone from the zone: nothing to come back to
    for (const id of this.members) if (!dist.has(id)) this.members.delete(id);
    for (const id of this.cache.keys()) if (!dist.has(id)) this.cache.delete(id);
    for (const id of this.challengers.keys()) if (!dist.has(id) || this.members.has(id)) this.challengers.delete(id);
    for (const id of pinned) this.promote(id);
    const d = (id: string) => dist.get(id)!;
    const farthestFirst = () => [...this.members].filter((id) => !pinned.has(id)).sort((a, b) => d(b) - d(a) || (a < b ? 1 : -1));
    // over the cap (it was lowered, or pins took the slots): the farthest go
    for (const id of farthestFirst()) {
      if (this.members.size <= this.cap) break;
      this.demote(id, now);
    }
    const outsiders = [...dist.keys()].filter((id) => !this.members.has(id)).sort((a, b) => d(a) - d(b) || (a < b ? -1 : 1));
    // free slots are filled at once, nearest first
    while (this.members.size < this.cap && outsiders.length) this.promote(outsiders.shift()!);
    // the i-th nearest outsider against the i-th farthest member
    const far = farthestFirst(), swaps: [string, string][] = [];
    outsiders.forEach((id, i) => {
      const member = far[i];
      if (member === undefined || d(id) + this.margin >= d(member)) { this.challengers.delete(id); return; }
      const since = this.challengers.get(id) ?? now;
      this.challengers.set(id, since);
      if (now - since >= this.hold) swaps.push([id, member]);
    });
    for (const [id, member] of swaps) { this.demote(member, now); this.promote(id); }
    for (const [id, at] of this.cache) if (now - at > this.cacheTtl) this.cache.delete(id);
    return { full: new Set(this.members), cached: new Set(this.cache.keys()) };
  }

  /** A character left (a player logged out or changed zone): forget it entirely. */
  forget(id: string): void { this.members.delete(id); this.cache.delete(id); this.challengers.delete(id); }
  reset(): void { this.members.clear(); this.cache.clear(); this.challengers.clear(); }

  private promote(id: string): void { this.members.add(id); this.cache.delete(id); this.challengers.delete(id); }
  private demote(id: string, now: number): void {
    this.members.delete(id);
    this.cache.delete(id); this.cache.set(id, now);
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
  }
}

/** What the streamer does to a character; `A` is the game's avatar. */
export interface StreamHooks<A> {
  /** Build the full-detail character, or null (or throw) if it cannot be: not retried while it keeps its slot. */
  build(id: string): A | null;
  /** Draw it: newly built, or back from the cache. */
  show(id: string, a: A): void;
  /** Stop drawing it but keep it loaded (the cache). */
  hide(id: string, a: A): void;
  /** Free it. */
  dispose(id: string, a: A): void;
}

export class DetailStreamer<A> {
  readonly planner: DetailPlanner;
  // every loaded character, shown or cached; a = null: its build failed
  private held = new Map<string, { a: A | null; shown: boolean }>();
  private hooks: StreamHooks<A>;
  constructor(hooks: StreamHooks<A>, options?: PlannerOptions) { this.hooks = hooks; this.planner = new DetailPlanner(options); }

  update(px: number, pz: number, candidates: readonly StreamCandidate[], now: number, py?: number): StreamState {
    const state = this.planner.update(px, pz, candidates, now, py);
    for (const [id, h] of this.held) {
      if (state.full.has(id)) continue;
      if (state.cached.has(id)) { if (h.shown && h.a) this.hooks.hide(id, h.a); h.shown = false; continue; }
      this.held.delete(id);
      if (h.a) this.hooks.dispose(id, h.a);
    }
    for (const id of state.full) {
      const h = this.held.get(id);
      if (h) { if (!h.shown && h.a) this.hooks.show(id, h.a); h.shown = true; continue; }
      // a character that cannot be built keeps its slot as a nameplate rather
      // than taking the frame loop down with it
      let a: A | null = null;
      try { a = this.hooks.build(id); } catch (error) { console.error("Character build failed", id, error); }
      this.held.set(id, { a, shown: true });
      if (a) this.hooks.show(id, a);
    }
    return state;
  }

  /** In full detail now. */
  full(id: string): boolean { return !!this.held.get(id)?.shown; }
  /** The loaded character, shown or cached. */
  get(id: string): A | null { return this.held.get(id)?.a ?? null; }
  /** Rebuilt elsewhere (a look change, which hands the old one off itself): hold the new one instead. */
  replace(id: string, a: A | null): void { const h = this.held.get(id); if (h) h.a = a; }
  /** Free a cached copy whose look went stale; it is built fresh if it comes back. */
  discard(id: string): void {
    const h = this.held.get(id);
    if (!h || h.shown) return;
    this.held.delete(id);
    if (h.a) this.hooks.dispose(id, h.a);
  }
  /** Gone for good: free it and forget it. */
  drop(id: string): void {
    const h = this.held.get(id);
    this.held.delete(id); this.planner.forget(id);
    if (h?.a) this.hooks.dispose(id, h.a);
  }
  /** The scene went with the zone (which frees every mesh): forget without disposing. */
  reset(): void { this.held.clear(); this.planner.reset(); }
  /** Free everything held. */
  disposeAll(): void { for (const id of [...this.held.keys()]) this.drop(id); }
  heldIds(): string[] { return [...this.held.keys()]; }
}
