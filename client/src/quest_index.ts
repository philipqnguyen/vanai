// Quest indexes: who gives what, and where each objective wants you to go.
// Built once at module load from the bundled data so the nameplates, the
// minimap, the map window and the tracker all agree on what a quest is asking.
import { QUESTS, QUEST_PREREQ, ZONES, MONSTERS, ITEMS } from "./data";
import { state } from "./state";
import { CATEGORY_RANK, MAIN_COLOR, closedCrossings, mainStoryStep, offerOpen, pickQuestZone, portalShown, questCategory, questColor, questJobOk, zoneHops, type StoryStep } from "./quest_rules";

export {
  MAIN_COLOR, SIDE_COLOR, GUILD_COLOR, isMainQuest, isGuildQuest, questCategory, questColor, questTag, questJobOk,
} from "./quest_rules";
export type { QuestCategory, StoryStep } from "./quest_rules";

export interface Place { zone: string; x: number; z: number; y?: number; name: string; }
// `kind` says what stands at the spot: a point you can walk up to and touch
// (a node, a notice, a crystal, a landmark) gets an in-world objective marker
// (marker.ts); a camp is an area and an NPC already wears a glyph, so those
// only get the map pin and the HUD beacon.
export type DestKind = "npc" | "point" | "camp" | "vendor";
// `npc` names the NPC an "npc" destination stands on, so the HUD can hand its
// beacon over to that NPC's own plate and quest marker up close.
export interface Dest { zone: string; x: number; z: number; y?: number; label: string; kind: DestKind; npc?: string; }

export const QUEST_GIVERS = new Set<string>();
export const GIVER_ZONE: Record<string, string> = {};

const NPC_PLACE: Record<string, Place> = {};
const MILESTONE_PLACE: Record<string, Place> = {};
const INTERACTABLE_PLACE: Record<string, Place> = {};
const LANDMARK_PLACE: Record<string, Place> = {};
const CAMPS_OF_MONSTER: Record<string, Place[]> = {};
const MONSTERS_DROPPING: Record<string, string[]> = {};
const NODES_OF_ITEM: Record<string, Place[]> = {};
const VENDORS_OF_ITEM: Record<string, Place[]> = {};

// each gathering node kind yields one fixed item
const NODE_ITEM: Record<string, string> = { herb: "lamproot", ore: "glimmer_ore", reed: "mere_reed", windfall: "windfall_apple", spines: "book_spine" };

Object.entries(ZONES).forEach(([zone, def]: [string, any]) => {
  (def.npcs || []).forEach((n: any) => {
    NPC_PLACE[n.id] = { zone, x: n.x, z: n.z, y: n.y, name: n.name };
    (n.stock || []).forEach((item: string) => {
      (VENDORS_OF_ITEM[item] ||= []).push({ zone, x: n.x, z: n.z, y: n.y, name: n.name });
    });
  });
  (def.milestones || []).forEach((w: any) => { MILESTONE_PLACE[w.id] = { zone, x: w.x, z: w.z, y: w.y, name: w.name }; });
  (def.interactables || []).forEach((o: any) => { INTERACTABLE_PLACE[o.id] = { zone, x: o.x, z: o.z, y: o.y, name: o.name }; });
  (def.landmarks || []).forEach((l: any) => { LANDMARK_PLACE[l.id] = { zone, x: l.x, z: l.z, y: l.y, name: l.name }; });
  (def.camps || []).forEach((c: any) => {
    (CAMPS_OF_MONSTER[c.monster] ||= []).push({ zone, x: c.x, z: c.z, name: MONSTERS[c.monster]?.name || c.monster });
  });
  (def.nodes || []).forEach((n: any) => {
    const item = NODE_ITEM[n.kind];
    if (item) (NODES_OF_ITEM[item] ||= []).push({ zone, x: n.x, z: n.z, y: n.y, name: n.kind });
  });
});

Object.entries(MONSTERS).forEach(([key, m]: [string, any]) => {
  (m.drops || []).forEach((d: any) => { (MONSTERS_DROPPING[d.item] ||= []).push(key); });
});

Object.entries(QUESTS).forEach(([, q]: [string, any]) => {
  if (!q.giver) return;
  QUEST_GIVERS.add(q.giver);
  const p = NPC_PLACE[q.giver];
  if (p) GIVER_ZONE[q.giver] = p.zone;
});

// ---------- small lookups ----------
// (the quest categories, colours and tags live in quest_rules.ts)
export function npcPlace(id: string): Place | null { return NPC_PLACE[id] || null; }
export function zoneLabel(key: string): string { return ZONES[key]?.name || key; }

// the player's position, refreshed each frame — used to pick the nearest camps
let originX = 0, originZ = 0;
export function setQuestOrigin(x: number, z: number): void { originX = x; originZ = z; }

// ---------- relics ----------
// A quest interactable (a notice, a stack, a stamp, a door) is inert until an
// active quest of yours names it: no prompt, no target, no E. Like the
// objective markers this is per character and read from the journal, so the
// same lectern is a thing to use for one player and furniture for the next --
// and goes back to being furniture the moment the quest is handed in.
export function interactableWanted(objId: string): boolean {
  let wanted = false;
  state.quests.forEach((st, key) => {
    if (wanted || st.status !== 1) return;
    const q = QUESTS[key];
    // a guild quest paused by a job change leaves its relics inert, as the server does
    if (!questJobOk(q, state.self?.job)) return;
    const obj = q?.objective;
    if ((q?.readables || []).includes(objId)) wanted = true;
    if (obj?.type === "interact" && (obj.targets || []).includes(objId)) wanted = true;
  });
  return wanted;
}

// ---------- gated portals ----------
// The portals of a zone this character can see and use right now
// (quest_rules.portalShown over the live journal). The scene, the minimap and
// the map window all ask this, so a portal appears everywhere at once when its
// quest is handed in.
export function portalVisible(p: any): boolean { return portalShown(p, state.quests); }
export function visiblePortals(zoneKey: string): any[] {
  return ((ZONES[zoneKey]?.portals as any[]) || []).filter(portalVisible);
}
// the zone pairs whose crossing is still shut for this character (a Border
// Gate before inn2): the world map draws no line between them, either way
export function shutCrossings(): Set<string> { return closedCrossings(ZONES as any, state.quests); }

// ---------- objective state ----------
// True when the active quest's objective is satisfied and the giver wants you back.
export function objectiveMet(key: string): boolean {
  const q = QUESTS[key];
  const st = state.quests.get(key);
  if (!q || !st || st.status !== 1) return false;
  const obj = q.objective;
  const count = obj.count || 1;
  if (obj.type === "collect") return collectHave(key) >= count;
  return st.progress >= count;
}

// What a collect objective has in the bags: worn gear is not in them (the
// world's objective_met? and its hand-in count only unequipped rows), and the
// world keeps no progress for collect, so this is its count too.
export function collectHave(key: string): number {
  const targets: string[] = QUESTS[key]?.objective?.targets || [];
  return state.inventory
    .filter((r: any) => !r.equipped_slot && targets.includes(r.item_key))
    .reduce((sum: number, r: any) => sum + r.qty, 0);
}

// The talk, interact and reach targets still to do, as the world counts them
// (quests.rb talk, on_interact, on_discover): one already credited is done,
// and an ordered objective wants only the first one left. A journal row from
// before credits were kept credits the first `progress` of an ordered list, as
// the world does; a reach target is done once its landmark is discovered.
export function targetsLeft(key: string): string[] {
  const obj = QUESTS[key]?.objective || {};
  const targets: string[] = obj.targets || [];
  const st = state.quests.get(key);
  if (!st || st.status !== 1) return targets;
  if (obj.type === "reach") return targets.filter((t) => !state.discoveries.has(t));
  if (obj.type !== "talk" && obj.type !== "interact") return targets;
  const credited = st.credited?.length ? st.credited : obj.ordered ? targets.slice(0, st.progress || 0) : [];
  const left = targets.filter((t) => !credited.includes(t));
  return obj.ordered ? left.slice(0, 1) : left;
}

// True when the quest has never been taken and is open to this character.
// A guild quest (`job` set) is open only to that job; see quest_rules.offerOpen.
export function offerAvailable(key: string): boolean {
  return offerOpen(key, QUESTS[key], state.self, state.quests, QUEST_PREREQ[key]);
}

// True when an active quest can move right now: a guild quest waits while
// another job is active, so it draws no markers, beacons or turn-in glyph.
export function questLive(key: string): boolean {
  return questJobOk(QUESTS[key], state.self?.job);
}

// ---------- NPC markers ----------
export interface NpcMarker { glyph: "!" | "?"; color: string; key: string; main: boolean; }

// Markers are read once per NPC per frame by the plates and again by the
// minimap; they only change when the journal does, so a short cache is plenty.
const markerCache = new Map<string, NpcMarker | null>();
let markerCacheAt = 0;

export function npcMarkerFor(npcId: string): NpcMarker | null {
  const now = performance.now();
  if (now - markerCacheAt > 250) { markerCache.clear(); markerCacheAt = now; }
  const hit = markerCache.get(npcId);
  if (hit !== undefined) return hit;
  const m = computeNpcMarker(npcId);
  markerCache.set(npcId, m);
  return m;
}

// Highest priority wins: turn-in ready > talk target of an active quest > offer.
// At equal priority the main story beats a guild quest, and a guild a side quest.
function computeNpcMarker(npcId: string): NpcMarker | null {
  if (!state.self) return null;
  let best: { rank: number; cat: number; key: string; glyph: "!" | "?" } | null = null;
  const consider = (rank: number, key: string, glyph: "!" | "?") => {
    const cat = CATEGORY_RANK[questCategory(key)];
    if (!best || rank > best.rank || (rank === best.rank && cat > best.cat)) best = { rank, cat, key, glyph };
  };
  Object.entries(QUESTS).forEach(([key, q]: [string, any]) => {
    const st = state.quests.get(key);
    if (st) {
      if (st.status !== 1 || !questLive(key)) return;
      if (q.giver === npcId && objectiveMet(key)) consider(2, key, "?");
      else if (q.objective?.type === "talk" && targetsLeft(key).includes(npcId)) consider(1, key, "?");
      return;
    }
    if (q.giver === npcId && offerAvailable(key)) consider(0, key, "!");
  });
  if (!best) return null;
  const b = best as { rank: number; cat: number; key: string; glyph: "!" | "?" };
  return { glyph: b.glyph, color: questColor(b.key), key: b.key, main: questCategory(b.key) === "main" };
}

// ---------- destinations ----------
function d2(d: Dest): number { return (d.x - originX) ** 2 + (d.z - originZ) ** 2; }

// keep only the few nearest markers per zone so a wide-ranging hunt does not
// bury the map under identical rings
function capPerZone(list: Dest[], perZone: number): Dest[] {
  const byZone = new Map<string, Dest[]>();
  list.forEach((d) => {
    const arr = byZone.get(d.zone);
    if (arr) arr.push(d); else byZone.set(d.zone, [d]);
  });
  const out: Dest[] = [];
  byZone.forEach((ds) => {
    ds.sort((a, b) => d2(a) - d2(b));
    out.push(...ds.slice(0, perZone));
  });
  return out;
}

function dedupe(list: Dest[]): Dest[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = `${d.zone}:${Math.round(d.x)}:${Math.round(d.z)}:${d.y??"ground"}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Where the quest wants the player to stand. `met` flips it to "go hand it in".
export function questDestinations(key: string, met: boolean): Dest[] {
  const q = QUESTS[key];
  if (!q) return [];
  if (met) {
    const g = NPC_PLACE[q.giver];
    return g ? [{ zone: g.zone, x: g.x, z: g.z, y: g.y, label: `Return to ${g.name}`, kind: "npc", npc: q.giver }] : [];
  }
  const obj = q.objective || {};
  // talk, interact and reach point only at what is still to do
  const targets: string[] = targetsLeft(key);
  const out: Dest[] = [];
  // Some conversations ask the player to read a document before speaking.
  // Keep that document usable without adding a second quest objective.
  (q.readables || []).forEach((id: string) => {
    const p = INTERACTABLE_PLACE[id];
    if (p) out.push({ zone: p.zone, x: p.x, z: p.z, y: p.y, label: p.name, kind: "point" });
  });
  switch (obj.type) {
    case "interact":
      targets.forEach((t) => {
        const p = MILESTONE_PLACE[t] || INTERACTABLE_PLACE[t];
        if (p) out.push({ zone: p.zone, x: p.x, z: p.z, y: p.y, label: p.name, kind: "point" });
      });
      return dedupe(out);
    case "talk":
      targets.forEach((t) => {
        const p = NPC_PLACE[t];
        if (p) out.push({ zone: p.zone, x: p.x, z: p.z, y: p.y, label: `Speak with ${p.name}`, kind: "npc", npc: t });
      });
      return dedupe(out);
    case "reach":
      targets.forEach((t) => {
        const p = LANDMARK_PLACE[t];
        if (p) out.push({ zone: p.zone, x: p.x, z: p.z, y: p.y, label: p.name, kind: "point" });
      });
      return dedupe(out);
    case "kill":
      targets.forEach((mk) => {
        (CAMPS_OF_MONSTER[mk] || []).forEach((c) => out.push({ zone: c.zone, x: c.x, z: c.z, label: c.name, kind: "camp" }));
      });
      return capPerZone(dedupe(out), 3);
    case "collect":
      targets.forEach((item) => {
        const before = out.length;
        (MONSTERS_DROPPING[item] || []).forEach((mk) => {
          (CAMPS_OF_MONSTER[mk] || []).forEach((c) => out.push({ zone: c.zone, x: c.x, z: c.z, label: c.name, kind: "camp" }));
        });
        // a node's beacon names the thing, not the whole ask: four stacks in
        // one bay each wearing the quest's sentence was a wall of text
        const short = `Gather ${ITEMS[item]?.name || item}`;
        (NODES_OF_ITEM[item] || []).forEach((n) => {
          out.push({ zone: n.zone, x: n.x, z: n.z, y: n.y, label: short, kind: "point" });
        });
        // nothing in the wild drops this item — someone sells it
        if (out.length === before) {
          (VENDORS_OF_ITEM[item] || []).forEach((v) => {
            out.push({ zone: v.zone, x: v.x, z: v.z, y: v.y, label: `Buy from ${v.name}`, kind: "vendor" });
          });
        }
      });
      return capPerZone(dedupe(out), 6);
    default:
      return out;
  }
}

export interface QuestDest extends Dest { key: string; color: string; met: boolean; }

// Every destination of every active quest, optionally narrowed to one zone,
// and the giver of the next main chapter once it can be taken, so the beacon,
// the minimap and the maps point at them as at any duty.
export function activeQuestDestinations(zone?: string): QuestDest[] {
  const out: QuestDest[] = [];
  const story = storyStep();
  const g = story?.state === "ready" ? storyGiverDest(story.key) : null;
  if (g && (!zone || g.zone === zone)) out.push({ ...g, key: story!.key, color: MAIN_COLOR, met: false });
  state.quests.forEach((st, key) => {
    if (st.status !== 1 || !QUESTS[key] || !questLive(key)) return;
    const met = objectiveMet(key);
    const color = questColor(key);
    questDestinations(key, met).forEach((d) => {
      if (zone && d.zone !== zone) return;
      out.push({ ...d, key, color, met });
    });
  });
  return out;
}

// zone-to-zone links through the portals, both ways, for "nearest by route"
const PORTAL_LINKS: Record<string, string[]> = {};
const ZONE_NAMES: Record<string, string> = {};
Object.entries(ZONES).forEach(([zone, def]: [string, any]) => {
  ZONE_NAMES[zone] = def.name || zone;
  (def.portals || []).forEach((p: any) => {
    if (!p.to || !ZONES[p.to]) return;
    (PORTAL_LINKS[zone] ||= []).push(p.to);
    (PORTAL_LINKS[p.to] ||= []).push(zone);
  });
});
let hopsFrom = "", hopsCache: Record<string, number> = {};

// The zone key a quest points at: the one you stand in when any destination
// is here, else the one its objective names or the fewest crossings away
// (quest_rules.pickQuestZone). Shared by the Journal's grouping, "Show on
// map" and questAwayZone, so they never disagree.
export function questZoneKey(key: string): string | null {
  const dests = questDestinations(key, objectiveMet(key));
  if (!dests.length) return null;
  // anything reachable without crossing a border means the duty is not "away"
  if (dests.some((d) => d.zone === state.zone)) return state.zone;
  if (hopsFrom !== state.zone) { hopsFrom = state.zone; hopsCache = zoneHops(state.zone, PORTAL_LINKS); }
  return pickQuestZone(dests.map((d) => d.zone), QUESTS[key]?.objective?.label || "", ZONE_NAMES, hopsCache);
}

// The name of the zone a quest points at, when it is not the one you stand in.
export function questAwayZone(key: string): string | null {
  const zone = questZoneKey(key);
  return zone && zone !== state.zone ? zoneLabel(zone) : null;
}

// ---------- the main story's next step ----------
// Which city each book opens in: its first chapter's giver's zone.
const BOOK_ZONE: Record<string, string> = {};
["cd", "hw", "mm"].forEach((b) => {
  const z = GIVER_ZONE[QUESTS[`${b}1`]?.giver];
  if (z) BOOK_ZONE[b] = z;
});

// The book to follow before the journal says: the city fewest crossings from
// where the character stands (a new one stands in their own), Caerdun on a tie.
function nearestBook(): string {
  if (hopsFrom !== state.zone) { hopsFrom = state.zone; hopsCache = zoneHops(state.zone, PORTAL_LINKS); }
  let best = "cd", bestHops = Infinity;
  Object.entries(BOOK_ZONE).forEach(([b, z]) => {
    const h = hopsCache[z] ?? Infinity;
    if (h < bestHops) { best = b; bestHops = h; }
  });
  return best;
}

// What the story asks of this character now (quest_rules.mainStoryStep).
export function storyStep(): StoryStep | null {
  if (!state.self) return null;
  return mainStoryStep(QUESTS, state.quests, QUEST_PREREQ, state.self.level, nearestBook());
}

// Where an untaken chapter is picked up: its giver.
export function storyGiverDest(key: string): Dest | null {
  const giver = QUESTS[key]?.giver;
  const g = giver ? NPC_PLACE[giver] : null;
  return g ? { zone: g.zone, x: g.x, z: g.z, y: g.y, label: `Speak with ${g.name}`, kind: "npc", npc: giver } : null;
}

// Where "Show on map" points: a duty's destinations, or the giver of a quest
// not yet taken (the next chapter).
export function focusDestinations(key: string): Dest[] {
  if (state.quests.has(key)) return questDestinations(key, objectiveMet(key));
  const g = storyGiverDest(key);
  return g ? [g] : [];
}

// While the next chapter waits on a level: the side and guild quests open to
// this character, fewest crossings away first, then the highest level.
export function nearbyOffers(limit: number): string[] {
  if (hopsFrom !== state.zone) { hopsFrom = state.zone; hopsCache = zoneHops(state.zone, PORTAL_LINKS); }
  const hops = (k: string) => hopsCache[GIVER_ZONE[QUESTS[k]?.giver]] ?? Infinity;
  return Object.keys(QUESTS)
    .filter((k) => questCategory(k) !== "main" && offerAvailable(k) && hops(k) < Infinity)
    .sort((a, b) => hops(a) - hops(b) || (QUESTS[b].min_lvl || 1) - (QUESTS[a].min_lvl || 1))
    .slice(0, limit);
}
