import jobsRaw from "@data/jobs.json";
import itemsRaw from "@data/items.json";
import abilitiesRaw from "@data/abilities.json";
import monstersRaw from "@data/monsters.json";
import zonesRaw from "@data/zones.json";
import questsRaw from "@data/quests.json";
// shared/data/cutscenes/*.json, one file per group of scenes (data.rb read_cutscenes)
const cutsceneFiles = import.meta.glob<Record<string, unknown>>("../../shared/data/cutscenes/*.json", { eager: true, import: "default" });
const cutscenesRaw = Object.assign({}, ...Object.keys(cutsceneFiles).sort().map((f) => cutsceneFiles[f]));
import type { CutsceneDef, CinemaDef } from "./cutscene_plan";
import { gearJobs } from "./gear-eligibility";
import courtsRaw from "@data/courts.json";
import { injectCourtHalls } from "./court-data";

export const RACES: Record<string, any> = (jobsRaw as any).races;
export const JOBS: Record<string, any> = Object.fromEntries(
  Object.entries(jobsRaw as any).filter(([k]) => k !== "races")
);
export const ITEMS: Record<string, any> = itemsRaw as any;
export const ABILITIES: Record<string, any> = abilitiesRaw as any;
export const MONSTERS: Record<string, any> = monstersRaw as any;
export const ZONES: Record<string, any> = zonesRaw as any;
export const COURTS: any = courtsRaw;
injectCourtHalls(ZONES, COURTS); // the audience halls' heralds and stations (court-data.ts)
export const QUESTS: Record<string, any> = questsRaw as any;
// Scenes filmed in one zone (cutscene.ts), and scenes told in chapters across
// several (the intro; cutscene-cinema.ts) -- the second kind has `chapters`.
const SCENES_ALL = cutscenesRaw as Record<string, any>;
export const CUTSCENES: Record<string, CutsceneDef> = Object.fromEntries(Object.entries(SCENES_ALL).filter(([, d]) => !d.chapters));
export const CINEMAS: Record<string, CinemaDef> = Object.fromEntries(Object.entries(SCENES_ALL).filter(([, d]) => d.chapters));

export const JOB_LIST = ["PLD", "SAM", "DRK", "BLM", "WHM", "MNK"];
export const RACE_LIST = ["aedri", "valdren", "karrog", "nym", "rasha"];

// quest key -> the quests ANY of which unlock it when complete (the three
// starting-city chains merge into shared quests, so a quest can have several)
export const QUEST_PREREQ: Record<string, string[]> = {};
Object.entries(QUESTS).forEach(([key, q]: [string, any]) => {
  ([] as string[]).concat(q.next || []).forEach((n: string) => { (QUEST_PREREQ[n] ||= []).push(key); });
});

export function conColor(diff: number): { label: string; color: string } {
  if (diff >= 4) return { label: "Incredibly tough", color: "#e0796a" };
  if (diff >= 2) return { label: "Tough", color: "#e0a068" };
  if (diff >= -1) return { label: "Even match", color: "#e2d38f" };
  if (diff >= -3) return { label: "Decent challenge", color: "#a5d69c" };
  if (diff >= -5) return { label: "Easy prey", color: "#8fb8de" };
  return { label: "Too weak", color: "#8d92a6" };
}

// ---------- gear slots ----------
// The slots a character wears, in the order the Character window lays them out.
// Mirrors EQUIP_SLOTS in the game controller; the server still has the final
// say on every equip, this is only what the UI offers and how it labels it.
export const GEAR_SLOTS = ["weapon", "head", "body", "legs", "feet", "ring"];
export const SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon", head: "Head", body: "Body", legs: "Legs", feet: "Feet", ring: "Ring",
};
const ARMOR_SLOTS = ["head", "body", "legs", "feet"];

// Who may use a piece of gear — the client half of Vanai::Data.eligible_jobs.
// Armour with atype "any" is open to every job; rings are open to all.
export function eligibleJobs(item: any): string[] {
  return gearJobs(item, JOBS, JOB_LIST);
}

// Why this job cannot wear this piece right now, or null when it can.
export function equipProblem(item: any, job: string, level: number): string | null {
  if (!item || !GEAR_SLOTS.includes(item.slot)) return "That cannot be equipped.";
  if (!eligibleJobs(item).includes(job)) {
    return `Your job cannot ${item.slot === "weapon" ? "wield" : "wear"} that.`;
  }
  if ((item.lvl || 0) > level) return `Requires level ${item.lvl}.`;
  return null;
}

export const PLAYABLE_RACES = RACE_LIST.filter(race => RACES[race].playable === true);
