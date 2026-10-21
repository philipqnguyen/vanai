/** Saved appearance is independent of job and of the development viewers. */
import MEASURED from './hair-colours.json' with {type:'json'};
// Every player character has hair (Philip, 2026-10-15): there is no "none".
// A legacy saved "none" (or anything a race does not offer) resolves to the
// race's own style, as the server's Character#appearance_payload does.
export type HairStyle='tousled'|'bun'|'braid'|'waves'|'cascade';
export type HairColour='natural'|'dark_blue'|'dark_green'|'auburn';
export interface CharacterAppearance { face?: 'male'|'female'; hair?: HairStyle|'none'; beard?: boolean; hair_colour?: HairColour }
export function nymChoice(race:string, appearance?:CharacterAppearance) {
  if(race!=='nym')return undefined;
  return {face:appearance?.face==='female'?'female' as const:'male' as const,
    hair:appearance?.hair==='bun'?'bun' as const:'tousled' as const,...dyed(appearance)};
}
export function aedriChoice(race:string, appearance?:CharacterAppearance) {
  if(race!=='aedri')return undefined;
  const face=appearance?.face==='female'?'female' as const:'male' as const;
  return {face,hair:face==='female'?'braid' as const:'waves' as const,...dyed(appearance)};
}
export function rashaChoice(race:string, appearance?:CharacterAppearance) {
  if(race!=='rasha')return undefined;
  return {face:'female' as const,hair:'waves' as const,...dyed(appearance)};
}
export function valdrenChoice(race:string, appearance?:CharacterAppearance) {
  if(race!=='valdren')return undefined;
  const face=appearance?.face==='female'?'female' as const:'male' as const;
  return {face,hair:face==='female'?'braid' as const:'cascade' as const,...dyed(appearance)};
}
export function karrogChoice(race:string, appearance?:CharacterAppearance) {
  if(race!=='karrog')return undefined;
  return {face:'male' as const,hair:'braid' as const,beard:appearance?.beard!==false,...dyed(appearance)};
}
export const appearanceChoice=(race:string,appearance?:CharacterAppearance)=>nymChoice(race,appearance)??aedriChoice(race,appearance)??rashaChoice(race,appearance)??valdrenChoice(race,appearance)??karrogChoice(race,appearance);
export const mappedRace=(race?:string)=>race==='nym'||race==='aedri'||race==='rasha'||race==='valdren'||race==='karrog';
/** The hair a race offers at creation, with its label: never "no hair". The
 * label is the style alone; its colour is hairColourOptions'. */
export function hairOptions(race:string,face:'male'|'female'):[HairStyle,string][] {
  if(race==='nym')return [['tousled','Layers'],['bun','Tousled topknot']];
  if(race==='karrog')return [['braid','Braided warrior coif']];
  if(race==='rasha')return [['waves','Waves']];
  if(race==='valdren')return face==='female'?[['braid','Braid']]:[['cascade','Half-up cascade']];
  return face==='female'?[['braid','Braid']]:[['waves','Waves']];
}

// Hair colours. Every hair keeps the colour it was made in ("natural", named
// for what it measures, tools/assets/measure_hair.py) and can instead be worn
// in one of HAIR_DYES, which hair-colour.ts paints over the approved hair in
// the shader: the maker's files are never changed. The server holds the same
// list (Character::HAIR_COLOURS); an unknown or missing colour is natural,
// and natural is never saved or sent.
export const HAIR_DYES:Record<Exclude<HairColour,'natural'>,{label:string;hex:string}>={
  dark_blue:{label:'Dark blue',hex:'#172644'},
  dark_green:{label:'Dark green',hex:'#21452a'},
  auburn:{label:'Auburn',hex:'#5c2b1b'},
};
export const HAIR_COLOURS:HairColour[]=['natural',...Object.keys(HAIR_DYES) as HairColour[]];
export function hairColourChoice(appearance?:CharacterAppearance):HairColour {
  return HAIR_COLOURS.includes(appearance?.hair_colour as HairColour)?appearance!.hair_colour!:'natural';
}
/** A choice carries a colour only when it is not natural, as the server saves it. */
function dyed(appearance?:CharacterAppearance):{hair_colour?:HairColour} {
  const colour=hairColourChoice(appearance);
  return colour==='natural'?{}:{hair_colour:colour};
}
/** What each hair's own colour is called: its measured colour (hair-colours.json)
 * read by eye. Keyed by the file a race loader instantiates. */
export const NATURAL_HAIR:Record<string,string>={
  'aedri-female/braid':'Chestnut',
  'aedri-male/waves':'Black',
  'karrog-male/coif':'Dark brown',
  'nym-female/hair':'Chestnut',
  'nym-male/hair':'Dark brown',
  'rasha-female/hair':'Light brown',
  'valdren-female/hair':'Silver',
  'valdren-male/hair':'Blonde',
};
/** The hair file a choice wears (the race loaders' own paths). A Nym's hair
 * follows the style, not the body: the bun is the female file on either. */
export function hairFile(race:string,face:'male'|'female',hair:HairStyle):string {
  if(race==='nym')return `nym-${hair==='bun'?'female':'male'}/hair`;
  if(race==='karrog')return 'karrog-male/coif';
  if(race==='aedri')return `aedri-${face}/${face==='female'?'braid':'waves'}`;
  return `${race}-${race==='rasha'?'female':face}/hair`;
}
/** The colours offered at creation for one hair: its own first, by name,
 * each with the swatch it shows (natural: the hair's measured colour). */
export function hairColourOptions(race:string,face:'male'|'female',hair:HairStyle):[HairColour,string,string][] {
  const file=hairFile(race,face,hair);
  return [['natural',NATURAL_HAIR[file],(MEASURED as Record<string,{colour:string}>)[`models/characters/${file}.glb`].colour],
    ...Object.entries(HAIR_DYES).map(([k,d])=>[k as HairColour,d.label,d.hex] as [HairColour,string,string])];
}
