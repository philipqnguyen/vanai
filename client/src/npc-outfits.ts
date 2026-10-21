/** What an NPC wears: a role, read from the record, and an outfit hashed from
 * that role's wardrobe. Babylon-free; client/test/npc-appearance.test.mjs reads it.
 *
 * Adding an NPC: give it a name and title that say its trade ("Net Sorter",
 * "Gate-Sergeant ...") and NPC_ROLE_RULES dresses it. Where the words do not
 * say it -- a guild master, a recurring character, a sentinel with a plain
 * title -- put `"outfit": "<role>"` on the zones.json record. A likeness copy
 * repeats its original's outfit (tools/data/audit.py holds them equal), and the
 * outfit hashes from the likeness, so Sabel wears the same coat in every zone.
 *
 * Every piece is in the fitted catalog for all eight bodies (the test checks
 * it). Each (body, item) a zone uses is a download of several MB, so a role's
 * wardrobe stays a handful of curated looks rather than any piece at random;
 * the test prints and bounds each zone's gear bytes. */
import items from '../../shared/data/items.json' with {type:'json'};

export interface NpcLook {b:string;l:string;f:string;w?:string}
interface Wardrobe {looks:NpcLook[]}

const set=(b:string,l:string,f:string,w?:string):NpcLook=>({b,l,f,...(w?{w}:{})});
// A job guild's issue: the item ids the gear distribution gave each job.
const guild=(job:string,tier:number,w:string,legs=tier,feet=tier):NpcLook=>
  set(`calling_${job}_${tier}_body`,`calling_${job}_${legs}_legs`,`calling_${job}_${feet}_feet`,w);

export const NPC_WARDROBES:Record<string,Wardrobe> = {
  // Townsfolk: the plain clothes of the cities, never the starter set.
  townsfolk:{looks:[
    set('fieldhand_robe','fieldhand_slops','fieldhand_shoes'),
    set('wold_cloth_robe','wold_cloth_slops','wold_cloth_shoes'),
    set('watchfarm_vest','watchfarm_trews','watchfarm_boots'),
    set('lampright_vest','lampright_trews','lampright_boots'),
    set('valleyweave_robe','valleyweave_slops','valleyweave_sandals'),
    set('watchfarm_vest','wold_cloth_slops','wold_cloth_shoes'),
  ]},
  labourer:{looks:[
    set('watchfarm_vest','watchfarm_trews','watchfarm_boots'),
    set('lampright_vest','lampright_trews','lampright_boots'),
    set('waywatcher_jerkin','watchfarm_trews','lampright_boots'),
    set('fieldhand_robe','watchfarm_trews','watchfarm_boots'),
  ]},
  sailor:{looks:[
    set("bargeman's_jerkin","bargeman's_trews","bargeman's_boots"),
    set("sounder's_jerkin","sounder's_trews","sounder's_boots"),
    set('tiderunner_jerkin','tiderunner_trews','tiderunner_boots'),
    set('lampright_vest',"bargeman's_trews","bargeman's_boots"),
  ]},
  crafter:{looks:[
    set('thornhide_jerkin','thornhide_trews','thornhide_boots'),
    set('watchfarm_vest','wold_cloth_slops','watchfarm_boots'),
    set("sounder's_jerkin",'wastewalker_trews','wastewalker_boots'),
    set('lampright_vest','lampright_trews','lampright_boots'),
    set('wastewalker_jerkin','wastewalker_trews','wastewalker_boots'),
  ]},
  farmer:{looks:[
    set('fieldhand_robe','fieldhand_slops','fieldhand_shoes'),
    set('watchfarm_vest','watchfarm_trews','watchfarm_boots'),
    set('wold_cloth_robe','wold_cloth_slops','wold_cloth_shoes'),
    set('watchfarm_vest','fieldhand_slops','watchfarm_boots'),
  ]},
  trader:{looks:[
    set('valleyweave_robe','valleyweave_slops','valleyweave_sandals'),
    set('argent_robe','argent_slops','argent_shoes'),
    set('merewoven_robe','merewoven_slops','merewoven_sandals'),
    set("bargeman's_jerkin",'valleyweave_slops',"bargeman's_boots"),
    set('lampright_vest','argent_slops','argent_shoes'),
  ]},
  // The auction houses' brokers and the Capital's factors: the money in town.
  broker:{looks:[
    set('glasswoven_robe','glasswoven_slops','glasswoven_sandals'),
    set('reedwoven_robe','reedwoven_slops','reedwoven_sandals'),
    set('deepsilk_robe','deepsilk_slops','deepsilk_sandals'),
    set('merewoven_robe','merewoven_slops','merewoven_sandals'),
  ]},
  scholar:{looks:[
    set('wallscholar_robe','wallscholar_slops','wallscholar_sandals'),
    set('argent_robe','argent_slops','argent_shoes'),
    set('reedwoven_robe','reedwoven_slops','reedwoven_sandals'),
    set('glasswoven_robe','glasswoven_slops','glasswoven_sandals'),
    set('valleyweave_robe','valleyweave_slops','valleyweave_sandals'),
  ]},
  student:{looks:[
    set('wold_cloth_robe','wold_cloth_slops','wold_cloth_shoes'),
    set('argent_robe','argent_slops','argent_shoes'),
    set('fieldhand_robe','wold_cloth_slops','wold_cloth_shoes'),
  ]},
  healer:{looks:[
    set('calling_whm_10_body','calling_whm_10_legs','calling_whm_10_feet'),
    set('calling_whm_20_body','calling_whm_20_legs','calling_whm_20_feet'),
    set('merewoven_robe','merewoven_slops','merewoven_sandals'),
    set('valleyweave_robe','valleyweave_slops','valleyweave_sandals'),
  ]},
  noble:{looks:[
    set('deepsilk_robe','deepsilk_slops','deepsilk_sandals'),
    set('embersilk_robe','embersilk_slops','embersilk_sandals'),
    set('gloamweave_robe','gloamweave_slops','gloamweave_sandals'),
    set('wallscholar_robe','wallscholar_slops','wallscholar_sandals'),
  ]},
  ranger:{looks:[
    set('waywatcher_jerkin','waywatcher_trews','waywatcher_boots','bronze_sword'),
    set('thornhide_jerkin','thornhide_trews','thornhide_boots','wold_blade'),
    set('wastewalker_jerkin','wastewalker_trews','wastewalker_boots','iron_sword'),
    set('ashstalker_jerkin','ashstalker_trews','ashstalker_boots','valley_blade'),
  ]},
  freebooter:{looks:[
    set('wallrunner_jerkin','wallrunner_trews','wallrunner_boots'),
    set('wastewalker_jerkin','wastewalker_trews','wastewalker_boots'),
    set('ashstalker_jerkin',"bargeman's_trews",'ashstalker_boots'),
    set('waywatcher_jerkin','wastewalker_trews','waywatcher_boots'),
  ]},
  guard:{looks:[
    set('gatewarden_hauberk','gatewarden_chausses','gatewarden_sabatons','bronze_sword'),
    set('thornguard_hauberk','thornguard_chausses','thornguard_sabatons','iron_sword'),
    set('greywall_hauberk','greywall_chausses','greywall_sabatons','bronze_greatsword'),
    set('damwarden_cuirass','damwarden_chausses','damwarden_sabatons','wold_blade'),
    set('lockplate_cuirass','lockplate_chausses','lockplate_sabatons','iron_sword'),
  ]},
  officer:{looks:[
    set('rampart_cuirass','rampart_chausses','rampart_sabatons','tideworn_blade'),
    set('tidewarden_cuirass','tidewarden_chausses','tidewarden_sabatons','amberglass_sword'),
    set('amberplate_cuirass','amberplate_chausses','amberplate_sabatons','wallforged_blade'),
    set('lockplate_cuirass','lockplate_chausses','lockplate_sabatons','bogiron_blade'),
  ]},
  commander:{looks:[
    set('firstward_cuirass','firstward_chausses','firstward_sabatons','palegarden_blade'),
    set('cinderguard_cuirass','cinderguard_chausses','cinderguard_sabatons','cinderforged_sword'),
    set('cinderplate_cuirass','rampart_chausses','rampart_sabatons','cinderforged_greatsword'),
  ]},
  // The empire's left-behind caretakers: the old household's plate.
  sentinel:{looks:[
    set('hushward_plate','lockplate_chausses','lockplate_sabatons','wardens_trident'),
    set('greywall_hauberk','greywall_chausses','greywall_sabatons','wardens_trident'),
    set('damwarden_cuirass','damwarden_chausses','damwarden_sabatons'),
  ]},
  // The job guilds, members and masters, in their own job's issue.
  pld:{looks:[guild('pld',10,'iron_sword'),guild('pld',20,'meredge_blade'),guild('pld',24,'lamplit_blade',20,17)]},
  'pld-master':{looks:[guild('pld',40,'cinderforged_sword'),guild('pld',50,'palegarden_blade')]},
  sam:{looks:[guild('sam',10,'iron_katana'),guild('sam',20,'mistwalker_katana'),guild('sam',24,'duskfell_katana',20,17)]},
  'sam-master':{looks:[guild('sam',40,'cinderforged_katana'),guild('sam',50,'palegarden_katana')]},
  drk:{looks:[guild('drk',10,'iron_greatsword'),guild('drk',20,'rootcleaver'),guild('drk',24,'hollow_greatsword',20,17)]},
  'drk-master':{looks:[guild('drk',40,'cinderforged_greatsword'),guild('drk',50,'palegarden_greatsword')]},
  mnk:{looks:[guild('mnk',10,'studded_wraps'),guild('mnk',20,'rootbound_wraps'),guild('mnk',24,'chanters_wraps',20,17)]},
  'mnk-master':{looks:[guild('mnk',40,'cinderforged_fists'),guild('mnk',50,'palegarden_wraps')]},
  whm:{looks:[guild('whm',10,'vigil_mace'),guild('whm',20,'heartwood_maul'),guild('whm',24,'abbess_cane',20,17)]},
  'whm-master':{looks:[guild('whm',40,'abbots_maul'),guild('whm',50,'palelight_mace')]},
  blm:{looks:[guild('blm',10,'elder_staff'),guild('blm',20,'merelight_staff'),guild('blm',24,'moonmere_rod',20,17)]},
  'blm-master':{looks:[guild('blm',40,'emberglass_staff'),guild('blm',50,'palelight_staff')]},
};

/** First match wins, over "name title". Match trades and ranks, never words
 * that are also surnames here (Reed, Tide, Ash, Song, Kettle, Scrivener ...). */
export const NPC_ROLE_RULES:[RegExp,string][] = [
  [/sentinel|automaton|stair warden/i,'sentinel'],
  [/chant|refrain/i,'mnk'],
  [/lord marshal|master of arms/i,'commander'],
  [/marshal|captain|quartermaster/i,'officer'],
  [/sergeant|sentry|watchman|watch-|\bguard\b|recruit|pikeman|gate-warden|road-warden/i,'guard'],
  [/freebooter|thief|deserter/i,'freebooter'],
  [/scout|ranger|huntsman/i,'ranger'],
  [/minister|regent|provost|speaker|\bdean\b/i,'noble'],
  [/nurse|orderly|chaplain|apothecary/i,'healer'],
  [/archivist|clerk|copyist|tutor|translator|observer|surveyor|map tracer|letter writer|tide-table|bursar|paymaster|alchemist|proctor|bookbinder|\breader\b|ink grinder/i,'scholar'],
  [/student|apprentice/i,'student'],
  [/fisher|\bnet\b|sail|rope|pilot|ferry|boat|mussel|line baiter|beachcomber|harbour|eel-|poleman|dock|quay|cargo|waterside/i,'sailor'],
  [/smith|armourer|grinder|polisher|wright|maker|carver|dyer|weaver|baker|candle|lens|tanner|harness|quilt|basket|braider|mender|charcoal|logger|lamp-keeper/i,'crafter'],
  [/seller|grocer|chandler|innkeeper|stall|outfitter|sundries|buyer|factor|tallier|petitioner/i,'trader'],
  [/farm|orchard|garden|seed|grove|herb|produce|goodwife|harvest|cutter|\bmill/i,'farmer'],
  [/porter|carrier|carter|sweep|runner|hauler|coachman|ostler|scarer|groundskeeper|lamplighter|errand|coiler/i,'labourer'],
];
// The job whose stance and swing go with the weapon in hand; unarmed is WHM.
const JOB_BY_WTYPE:Record<string,string> = {sword:'PLD',katana:'SAM',greatsword:'DRK',staff:'BLM',cudgel:'WHM',handwraps:'MNK'};
const KIND_ROLE:Record<string,string> = {auction:'broker',vendor:'trader',sanctuary:'commander'};

export interface NpcRoleRecord {id:string;name?:string;title?:string;kind?:string;outfit?:string}
export function npcRole(npc:NpcRoleRecord):string {
  if(npc.outfit){
    if(!NPC_WARDROBES[npc.outfit])throw new Error(`NPC ${npc.id}: unknown outfit ${npc.outfit}`);
    return npc.outfit;
  }
  if(npc.kind==='auction')return 'broker';
  const words=`${npc.name??''} ${npc.title??''}`;
  for(const [rule,role] of NPC_ROLE_RULES)if(rule.test(words))return role;
  return KIND_ROLE[npc.kind??'']??'townsfolk';
}
/** `seed` is the NPC's identity hash (npc-appearance.ts), so a look never
 * moves when other NPCs are added or reordered. */
export function npcOutfit(npc:NpcRoleRecord,seed:number):{role:string;look:NpcLook;job:string} {
  const role=npcRole(npc),looks=NPC_WARDROBES[role].looks,look={...looks[seed%looks.length]};
  const wtype=look.w?(items as Record<string,{wtype?:string}>)[look.w]?.wtype:undefined;
  return {role,look,job:(wtype&&JOB_BY_WTYPE[wtype])||'WHM'};
}
