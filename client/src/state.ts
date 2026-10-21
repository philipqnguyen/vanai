import type {CharacterAppearance} from "./appearance";
import type { Track } from "./interp";
import type { JumpArc } from "./jump";

export interface SelfState {
  charId: number;
  name: string;
  race: string;
  appearance?: CharacterAppearance;
  job: string;
  level: number;
  xp: number;
  tnl: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  tp: number;
  gold: number;
  title: string | null;
  stats?: { str: number; vit: number; agi: number; int: number; mnd: number; def: number; weapon_dmg: number; delay: number };
  dead: boolean;
  /** the world's in-combat test (engaged, or any monster's enmity), when self_payload carries it */
  inCombat?: boolean;
  buffs: SelfBuff[];
  // performance.now()/1000 when buffs arrived: the server sends each remain
  // only when the self state changes, so the HUD counts down from this stamp
  buffsAt?: number;
}

/** One effect on you, as the server's self_payload describes it (entities.rb). */
export interface SelfBuff {
  name: string;
  /** the buff record's kind: an ability effect (buff_def, hot, …), poison, blind, evade_charges, soul_hits */
  kind: string;
  /** seconds left when the self message was sent */
  remain: number;
  /** the effect's full length in seconds */
  duration: number;
  /** an ailment a monster put on you, not a buff */
  harm: boolean;
}

export interface RemotePlayer {
  id: string;
  name: string;
  race: string;
  appearance?: CharacterAppearance;
  job: string;
  level: number;
  title?: string;
  look?: { w?: string; b?: string; h?: string; l?: string; f?: string };
  x: number; z: number; h: number; // where the avatar is drawn this frame
  track: Track; // buffered server snapshots, played back on a delay
  anim: string;
  jump: JumpArc; // takeoff relayed by the server, replayed on the playback clock
  dead: boolean;
  /** watching a cutscene: they stand still under a film icon (cutscenes.rb) */
  cs?: boolean;
}

export interface Monster {
  castEnd?: number;  // performance.now()/1000 when the current cast lands
  castMs?: number;
  castName?: string; // what the cast_start named, for the nameplate and target frame
  id: string;
  key: string;
  name: string;
  level: number;
  family: string;
  x: number; z: number; // where the mesh is drawn this frame
  track: Track;
  hpPct: number;
  state: string;
  target: string | null;
}

export const state = {
  self: null as SelfState | null,
  zone: "" as string,
  players: new Map<string, RemotePlayer>(),
  monsters: new Map<string, Monster>(),
  milestones: {} as Record<string, boolean>,
  targetId: null as string | null, // monster "m…", player "p…", "npc:<id>" or "obj:<id>"
  abilities: [] as any[],
  inventory: [] as any[],
  // `credited`: the talk/interact targets the world has counted (quests.rb)
  quests: new Map<string, { status: number; progress: number; credited?: string[] }>(),
  discoveries: new Set<string>(),
  party: [] as any[],
  jobs: [] as { job: string; level: number; xp: number }[],
  casting: null as { name: string; endsAt: number; startedAt: number } | null,
  // Ability id -> performance.now()/1000 when its cooldown ends, and when the
  // GCD ends. Both are the server's (self_payload): each self replaces them
  // whole, so an ability it leaves out is ready.
  cooldowns: new Map<string, number>(),
  gcdAt: 0,
  // Ability id -> when useHotbarSlot's double-send lock lapses. Kept apart
  // from cooldowns because a self the server sent before it ran the press
  // (a swing, a hit, a regen tick) would clear that map and drop the lock
  // early, and because the hotbar draws cooldowns: a refused press must not
  // look like one. Only a self that reports the ability's cooldown ends it.
  pressLocks: new Map<string, number>(),
  // Casts in flight for players in this zone, keyed by the "p<cid>" source
  // (yourself included), from zone cast_start events. Party rows and the
  // target frame read these; an entry is simply stale once endsAt passes.
  casts: new Map<string, { name: string; endsAt: number; ms: number }>(),
  // Stun and sleep on monsters, inferred from zone events because the
  // monster snapshot carries neither; keyed by monster id.
  mobEffects: new Map<string, { name: string; kind: "stun" | "sleep"; until: number }[]>(),
};

// Inventory replies are applied in the order they were asked for, not the
// order they land: Puma serves an equip and a /game/state read side by side,
// and the read that started first could finish last with the bags as they
// were before the equip. Each request takes a ticket when it is sent; a reply
// older than one already applied is dropped.
let inventoryIssued = 0, inventoryApplied = 0;
export function inventoryTicket(): number { return ++inventoryIssued; }
export function applyInventory(ticket: number, rows: any[]): boolean {
  if (ticket < inventoryApplied) return false;
  inventoryApplied = ticket;
  state.inventory = rows;
  return true;
}
