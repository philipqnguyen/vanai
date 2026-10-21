import {npcPresentation,type NpcIdentity} from './npc-appearance';
import {weaponEntry,rigidWeapon} from './gear/weapons';
import {attachEquipment,disposeEquipment} from './gear/equipment';
import {nymChoice,type CharacterAppearance} from "./appearance";
import {
  MeshBuilder, StandardMaterial, Color3, Mesh, TransformNode, Vector3, Quaternion, Texture,
  type AbstractMesh, type Material,
} from "@babylonjs/core";
import { scene, groundHeight, standHeight, addShadowCaster } from "./scene";
import { MONSTERS, ITEMS } from "./data";
import { instantiateModel, playAnim, type ModelInstance } from "./models";
import { creatureFor, prepareCreature, creatureClip, type CreatureStats } from "./creatures";
import {quaterniusBladeRoll} from './quaternius-weapon-grip';
import {loadAedri} from './aedri';
import {loadNym} from './nym';
import {loadRasha} from './rasha';
import {loadKarrog} from './karrog';
import karrogWraps from './karrog-wraps.json';
import {loadValdren} from './valdren';
import {VALDREN_WRAPS} from './valdren-fit';
import {NYM_WEAPON_SCALE} from './nym-fit';
import {animateQuaternius,quaterniusAttack,disposeQuaternius} from './quaternius-gameplay';
import {holdActor,actorAssetsReady,actorAssetsFailed,actorStandIn} from './actor-reveal';
import {sheatheWeapon,updateSheath} from './weapon-sheath';
import {combatHold,weaponDrawn} from './weapon_sheath_plan';

// One weapon type per job, for items the client's table doesn't know.
const JOB_WTYPE: Record<string, string> = {
  PLD: "sword", SAM: "katana", DRK: "greatsword",
  BLM: "staff", WHM: "cudgel", MNK: "handwraps",
};
// An approved shared katana model is drawn slim and long by this scale
// (the weapon manifest in the asset index records that scale as unchanged). The KayKit donor
// props (Knight.glb's swords, Mage.glb's staff) that once stood in for a
// weapon key the manifest did not know are gone with the bestiary remodel:
// every weapon in items.json is approved, so they only ever loaded for a
// stale key, and a stale key now draws bare hands. cudgel and handwraps keep
// their built-in fallbacks below.
const WEAPON_SCALE: Record<string, [number, number, number]> = {
  katana: [0.58, 1.2, 0.58],
};
const UNDYED_HEX = "#4f4a43"; // procedural fallback body (shown only if a player's body fails)
// ---------- races ----------
//
// Every race renders a production body (aedri.ts, valdren.ts, karrog.ts,
// nym.ts, rasha.ts), and each loader writes its own measured height to
// av.raceH. This table only shapes the procedural placeholder. It is never
// drawn while the body loads (actor-reveal.ts keeps the actor hidden); a
// player whose body fails to load is shown it instead. `h` matches the
// production height the loader will set, so the ?lineup label and the
// nameplate sit right from the first frame.
interface RaceLook {
  h: number;    // standing height, metres -- the production body's
  w: number;    // placeholder width multiplier
  skin: string; // placeholder head and arms
}

const RACE_LOOK: Record<string, RaceLook> = {
  aedri: { h: 1.8, w: 1.0, skin: "#c9a88a" },
  valdren: { h: 1.9, w: 0.87, skin: "#d8cfc4" },
  karrog: { h: 2.2, w: 1.32, skin: "#8a8d92" },
  nym: { h: 1.28, w: 0.94, skin: "#d9c4a8" },
  rasha: { h: 1.8, w: 0.95, skin: "#b89478" },
};

const JOB_COLOR: Record<string, string> = {
  PLD: "#7d9bb8", SAM: "#b06a5a", DRK: "#5c4a78", BLM: "#3a3a52", WHM: "#c9c4b0", MNK: "#8a9a6a",
};

// armor set body colors, by item key prefix
const SET_COLOR: [string, string][] = [
  ["traveler_", "#7a6a52"],
  ["wold_cloth_", "#5a5f7a"],
  ["lampright_", "#6a4f38"],
  ["thornguard_", "#5c6470"],
  ["argent_", "#8a84a8"],
  ["greywall_", "#4a505c"],
  ["gnarled_", "#5f4a3a"],
];

function setColorFor(itemKey: string | undefined, fallback: string): string {
  if (!itemKey) return fallback;
  const found = SET_COLOR.find(([prefix]) => itemKey.startsWith(prefix));
  return found ? found[1] : fallback;
}

function weaponTint(itemKey: string | undefined): string {
  if (!itemKey) return "#666b76";
  const item = ITEMS[itemKey];
  if (!item) return "#666b76";
  if (item.rarity === "rare") return "#c9a35c";
  if (item.rarity === "uncommon") return "#8fae8a";
  if ((item.lvl || 1) >= 12) return "#8a92a0";
  if ((item.lvl || 1) >= 6) return "#9a7a4f";
  return "#666b76";
}

// The weapon type this character is drawn holding, or undefined for bare
// hands. The equipped item decides; the job is the fallback for the
// placeholder rig, which is built before any item is known.
function weaponType(job: string, look: Look): string | undefined {
  if (!look.w) return undefined;
  return ITEMS[look.w]?.wtype || JOB_WTYPE[job];
}

function em(name: string, hex: string, emissive?: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.04, 0.04, 0.04);
  if (emissive) m.emissiveColor = Color3.FromHexString(emissive);
  // Marked so it can be freed with the entity that owns it — see
  // disposeProceduralMaterials for why the tag is needed rather than just
  // disposing whatever a mesh happens to point at.
  m.metadata = { procedural: true };
  return m;
}

// Free the procedural materials hanging under a node.
//
// Babylon's mesh.dispose() deliberately leaves materials alone
// (disposeMaterialAndTextures defaults to false), so every monster killed and
// every avatar rebuilt used to leave its whole set behind. That is not just
// memory: a StandardMaterial subscribes to the scene's image processing
// configuration in its constructor and only unsubscribes in dispose(), and each
// of those listeners rescans every mesh in the scene whenever the configuration
// changes. Leaked materials therefore add per-frame cost, not just bytes.
//
// Only materials `em()` made are touched. Model materials are shared between
// every instance of a glb by the container cache, so disposing one here would
// blank every other entity wearing the same file — which is exactly why this
// checks a tag instead of disposing whatever it finds.
export function disposeProceduralMaterials(root: TransformNode): void {
  const meshes: AbstractMesh[] = root.getChildMeshes();
  if ((root as AbstractMesh).material) meshes.push(root as AbstractMesh);
  const seen = new Set<Material>();
  meshes.forEach((msh) => {
    const mat = msh.material;
    if (!mat || !mat.metadata?.procedural || seen.has(mat)) return;
    seen.add(mat);
    mat.dispose();
  });
}

export interface Look { w?: string; b?: string; h?: string; l?: string; f?: string }

export interface AvatarNode {
  root: TransformNode;
  proc: TransformNode;
  model: ModelInstance | null;
  modelVariant?: 'aedri-quaternius'|'nym-quaternius'|'rasha-quaternius'|'valdren-quaternius'|'karrog-quaternius';
  currentAnim: string;
  jobRef: string;
  torso: Mesh;
  head: Mesh;
  hipL: TransformNode; hipR: TransformNode;
  shoulderL: TransformNode; shoulderR: TransformNode;
  weapon: TransformNode | null;
  castOrb: Mesh;
  raceH: number;
  walkPhase: number;
  attackUntil: number;
  castingUntil: number;
  // in combat until then: the weapon is drawn (weapon-sheath.ts)
  combatUntil: number;
  cloned: Material[]; // per-avatar material clones (containers share materials)
}

/** Keep authored floors; otherwise seat the NPC where a walker arriving from
 * the ground would stand: standHeight, the same foot height players and
 * monsters use, on the level groundHeight finds from the drawn ground.
 *
 * The level needs groundHeight's prevY: without it decks and ramps are never
 * considered, which buried Heartwood's song-stage singers 0.15 m in the stage.
 * Asking from the drawn ground (not the field) lets a stage within one step of
 * the path the NPC stands beside win. Off the levels, standHeight seats them on
 * a path, junction or lifted sand/glass sheet where it is drawn, else on the
 * DRAWN terrain: terrainMeshHeight matched the picked ground to 0.5 mm at 65
 * NPCs (MEASURED 2026-10-01), while the field hung them up to 0.28 m in the air
 * on convex brows, where the coarse mesh cuts below it. */
export function placeNpcAvatar(av:AvatarNode,npc:{x:number;z:number;y?:number;h?:number}):void {
  av.root.position.set(npc.x,npcStandY(npc),npc.z);av.root.rotation.y=npc.h??Math.PI;
}

/** The feet height placeNpcAvatar seats an NPC at; a nameplate-only NPC
 * (actor_stream_plan.ts) hangs its plate over the same spot. */
export function npcStandY(npc:{x:number;z:number;y?:number}):number {
  const {x,z}=npc,base=groundHeight(x,z);
  const level=groundHeight(x,z,Math.max(base,standHeight(x,z,base)));
  return npc.y??standHeight(x,z,level);
}

/** A race's standing height before its body has loaded and measured itself:
 * where a nameplate-only character's plate sits. */
export function raceHeight(race:string):number{return (RACE_LOOK[race]||RACE_LOOK.aedri).h;}

/** Shared by gameplay and city reviews; identity always uses the content ID. */
export function buildNpcAvatar(npc:NpcIdentity&{kind?:string}):AvatarNode {
  // The record, not just its id, carries story-fixed body pins and likenesses.
  const p=npcPresentation(npc,npc.kind);
  const id=`npc_${npc.id}`,av=buildAvatar(id, p.race, p.job, true, p.look, npc.kind, p.appearance);
  av.proc.setEnabled(false);
  addHitCapsule(av,id);
  return av;
}

/** Clothing masks remove body triangles and equipment is deliberately not
 * pickable, so a clothed body alone leaves only face and hands to click. A
 * body-sized invisible capsule, added once the body has loaded and measured
 * its height, keeps the whole figure clickable. Every NPC and every other
 * player wears one; your own avatar does not (it would catch clicks meant
 * for whatever stands past your shoulder). */
export function addHitCapsule(av:AvatarNode,entityId:string):void {
  const owner=av.root.getScene();
  const ready=owner.onBeforeRenderObservable.add(()=>{
    if(!av.model)return;
    owner.onBeforeRenderObservable.remove(ready);
    const hit=MeshBuilder.CreateCapsule(`hit_${entityId}`,{height:av.raceH,radius:av.raceH<1.4?.22:av.raceH>2?.38:.28,tessellation:8},owner);
    hit.parent=av.root;hit.position.y=av.raceH/2;hit.visibility=0;
    hit.isPickable=true;hit.metadata={entityId};
  });
  av.root.onDisposeObservable.addOnce(()=>owner.onBeforeRenderObservable.remove(ready));
}

export function buildAvatar(id: string, race: string, job: string, isNpc = false, look: Look = {}, npcKind?: string, appearance?: CharacterAppearance): AvatarNode {
  if(isNpc&&!appearance){
    const choice=npcPresentation(id.replace(/^npc_/,''),npcKind);
    race=choice.race;appearance=choice.appearance;job=choice.job;look=choice.look;
  }
  const b = RACE_LOOK[race] || RACE_LOOK.aedri;
  const h = b.h, w = b.w;
  const trueRoot = new TransformNode(`avroot_${id}`, scene);
  const root = new TransformNode(`av_${id}`, scene);
  root.parent = trueRoot;
  const pick = (m: Mesh) => { m.isPickable = true; m.metadata = { entityId: id }; };

  const bodyColor = isNpc ? "#5a5648" : setColorFor(look.b, UNDYED_HEX);
  const legColor = isNpc ? "#46443a" : setColorFor(look.l, UNDYED_HEX);

  // torso
  const torso = MeshBuilder.CreateBox(`avt_${id}`, { width: 0.42 * w, depth: 0.26 * w, height: h * 0.34 }, scene);
  torso.parent = root;
  torso.position.y = h * 0.62;
  torso.material = em(`avtm_${id}`, bodyColor);
  pick(torso);

  // job sash
  const sash = MeshBuilder.CreateBox(`avs_${id}`, { width: 0.45 * w, depth: 0.29 * w, height: 0.08 }, scene);
  sash.parent = root;
  sash.position.y = h * 0.5;
  sash.material = em(`avsm_${id}`, JOB_COLOR[job] || "#6a6a6a");
  sash.isPickable = false;

  // head
  const head = MeshBuilder.CreateSphere(`avh_${id}`, { diameter: 0.3 * (w * 0.7 + 0.5), segments: 8 }, scene);
  head.parent = root;
  head.position.y = h * 0.9;
  head.material = em(`avhm_${id}`, b.skin);
  pick(head);

  // helm
  if (look.h) {
    const helm = MeshBuilder.CreateCylinder(`avhelm_${id}`, { height: 0.14, diameterBottom: 0.32 * (w * 0.7 + 0.5), diameterTop: 0.2 }, scene);
    helm.parent = head;
    helm.position.y = 0.12;
    helm.material = em(`avhelmm_${id}`, setColorFor(look.h, "#5c6470"));
    helm.isPickable = false;
  }

  // limbs: pivot transform nodes at joints, mesh hanging below
  const limb = (name: string, len: number, dia: number, color: string, px: number, py: number): TransformNode => {
    const pivot = new TransformNode(`${name}_p`, scene);
    pivot.parent = root;
    pivot.position.set(px, py, 0);
    const mesh = MeshBuilder.CreateCylinder(name, { height: len, diameter: dia }, scene);
    mesh.parent = pivot;
    mesh.position.y = -len / 2;
    mesh.material = em(`${name}_m`, color);
    mesh.isPickable = false;
    return pivot;
  };
  const legLen = h * 0.44, armLen = h * 0.34;
  const hipL = limb(`avll_${id}`, legLen, 0.11 * w + 0.05, legColor, -0.11 * w, h * 0.45);
  const hipR = limb(`avlr_${id}`, legLen, 0.11 * w + 0.05, legColor, 0.11 * w, h * 0.45);
  const shoulderL = limb(`aval_${id}`, armLen, 0.08 * w + 0.04, b.skin, -0.26 * w, h * 0.78);
  const shoulderR = limb(`avar_${id}`, armLen, 0.08 * w + 0.04, b.skin, 0.26 * w, h * 0.78);

  // weapon in right hand — bare slot, bare hands, same as the rigged model
  const weapon = look.w ? buildWeapon(id, job, look) : null;
  if (weapon) {
    weapon.parent = shoulderR;
    weapon.position.y = -armLen;
  }

  // casting orb (hidden unless casting)
  const castOrb = MeshBuilder.CreateSphere(`avorb_${id}`, { diameter: 0.24, segments: 6 }, scene);
  castOrb.parent = trueRoot;
  castOrb.position.y = h * 0.78;
  castOrb.position.z = 0.45;
  const om = em(`avorbm_${id}`, "#9a8fd0", "#8a7fc9");
  castOrb.material = om;
  castOrb.isPickable = false;
  castOrb.setEnabled(false);

  const av: AvatarNode = {
    root: trueRoot, proc: root, model: null, currentAnim: "", jobRef: job,
    torso, head, hipL, hipR, shoulderL, shoulderR, weapon, castOrb,
    raceH: h, walkPhase: 0, attackUntil: 0, castingUntil: 0, combatUntil: 0, cloned: [],
  };

  // Hidden until body, weapon, equipment and a first pose are all in place
  // (actor-reveal.ts): no grey stand-in, no naked bind pose.
  holdActor(av,isNpc);
  const nym=nymChoice(race,appearance);
  if(nym){dress(av,id,job,look,loadNym(av,id,nym),'nym-'+nym.face);return av;}
  const female=appearance?.face==='female';
  if(race==='karrog'){dress(av,id,job,look,loadKarrog(av,id,appearance),'karrog-male');return av;}
  if(race==='valdren'){dress(av,id,job,look,loadValdren(av,id,appearance),female?'valdren-female':'valdren-male');return av;}
  if(race==='rasha'){dress(av,id,job,look,loadRasha(av,id,appearance),'rasha-female');return av;}
  if(race==='aedri'){dress(av,id,job,look,loadAedri(av,id,appearance),female?'aedri-female':'aedri-male');return av;}
  // Every race has a production body above. Anything else is a malformed race
  // string (the server only stores the five playable races), and the old
  // KayKit stand-in body is gone: fail loudly rather than leave a grey
  // placeholder in the world. NPCs share the contract -- npcPresentation only
  // ever assigns production bodies.
  disposeProceduralMaterials(trueRoot);
  trueRoot.dispose();
  throw new Error(`Unsupported ${isNpc ? "NPC production body" : "race"}: ${race}`);
}

// Swap the procedural placeholder for the production body, then attach the weapon and the
// equipment for this look side by side. The actor is released for reveal only
// when all three are in; a failure is reported to actor-reveal, which keeps an
// NPC hidden and shows a player what did load.
function dress(av:AvatarNode,id:string,job:string,look:Look,body:Promise<boolean>,equipmentBody?:string):void {
  void body.then(async loaded=>{
    if(!loaded){actorAssetsFailed(av,'production body did not load');return;}
    disposeProceduralMaterials(av.proc);av.proc.dispose();av.weapon=null;
    const parts=await Promise.allSettled([
      attachSmallfolkWeapon(av,id,job,look).catch(error=>{console.error('Weapon equipment failed',error);throw error;}),
      equipmentBody?attachEquipment(av,equipmentBody,look).catch(error=>{console.error('Equipment load failed',error);throw error;}):undefined,
    ]);
    const failed=parts.find(p=>p.status==='rejected');
    if(failed)actorAssetsFailed(av,(failed as PromiseRejectedResult).reason);else actorAssetsReady(av);
  }).catch(error=>{console.error('Equipment load failed',error);actorAssetsFailed(av,error);});
}

// dispose an avatar plus the materials it owns: the procedural ones `em()` made
// and the model-look clones. Both have to go before the node tree does, since
// the walk needs the meshes still attached to find them.
export function disposeAvatar(av: AvatarNode): void {
  disposeEquipment(av);
  disposeProceduralMaterials(av.root);
  disposeQuaternius(av);
  av.model?.groups.forEach(g=>g.dispose());
  av.root.dispose();
  av.cloned.forEach(disposeCloneWithTextures);
  av.cloned.length = 0;
}

// Material.clone copies every texture slot with Texture.clone: a new Texture
// object holding a reference on the shared GPU texture (and on the CPU copy
// Babylon keeps of it). Disposing the clone without them left those references
// behind, so the glb's textures outlived its container -- the leak a character
// unloaded and loaded again would repeat. A texture another material still
// uses as that same object is left alone.
function disposeCloneWithTextures(m: Material): void {
  const own = m.getActiveTextures().filter((t) => !m.getScene().materials.some((o) => o !== m && o.hasTexture(t)));
  m.dispose();
  own.forEach((t) => t.dispose());
}

function handSlot(mi: ModelInstance, side: "l" | "r"): TransformNode | undefined {
  return mi.root.getDescendants(false).find((n) => n.name === `handslot.${side}`) as TransformNode | undefined;
}

// Resolves once the weapon is in the hand (or there is none to hold).
function attachSmallfolkWeapon(av:AvatarNode,id:string,job:string,look:Look):Promise<void> {
  const mi=av.model!,wtype=weaponType(job,look),scale=wtype?WEAPON_SCALE[wtype]:undefined;
  // Equipment remains separate. Half-size donor props fit the measured hand;
  // a dedicated grip slot follows the same retargeted hand as the skin.
  const attach=(m:TransformNode,side:'l'|'r')=>{
    const hand=handSlot(mi,side);if(!hand||hand.isDisposed()||mi.root.isDisposed()){m.dispose();return;}
    const roll=quaterniusBladeRoll(av.modelVariant,wtype);
    if(roll){
      // Roll only the prop in its measured handle frame. The grip origin,
      // handle direction, accepted rig and source hand animation stay exact.
      const native=m.rotationQuaternion??Quaternion.FromEulerVector(m.rotation);
      m.rotationQuaternion=native.multiply(Quaternion.RotationAxis(Vector3.Up(),roll));
    }
    // New Nym palm hollows need the smaller prop diameter as well as fitted slots.
    m.parent=hand;m.scaling.scaleInPlace(av.modelVariant==='nym-quaternius'?NYM_WEAPON_SCALE:.5);
    // worn on the back or hip until a fight draws it (weapon-sheath.ts)
    if(side==='r'){av.weapon=m;sheatheWeapon(av,m,hand,wtype,weaponDrawn(av.combatUntil,performance.now()/1000));}
  };
  const approved=weaponEntry(look.w);
  if(approved){
    // Native handwear joins clothing's single coverage owner below.
    if(approved.shared_model)return rigidWeapon(look.w!,scene,av.root).then(m=>{
      if(!m)return;if(scale)m.scaling.multiplyInPlace(new Vector3(...scale));attach(m,'r');
      if(import.meta.env.DEV&&wtype==='katana')scene.onAfterRenderObservable.addOnce(()=>{if(m.isDisposed())return;const world=m.computeWorldMatrix(true);console.info('Katana held axes',JSON.stringify({item:look.w,variant:av.modelVariant,concave:Vector3.TransformNormal(Vector3.Right(),world).normalize().asArray(),handle:Vector3.TransformNormal(Vector3.Up(),world).normalize().asArray(),world:world.asArray()}));});
    });
    return Promise.resolve();
  }
  if(wtype==='cudgel')attach(buildMace(`${id}_w`,weaponTint(look.w)),'r');
  else if(wtype==='handwraps')for(const side of ['l','r'] as const){
    const hand=mi.root.getDescendants(false).find(n=>n.name===(av.modelVariant?.endsWith('-quaternius')?`hand_${side}`:`hand.${side}`)) as TransformNode|undefined;
    if(!hand)continue;
    if(av.modelVariant==='karrog-quaternius'){
      // The approved convex sections clear the broad palm where ellipses cut
      // through it. Retain those measured paths in the existing hand frame.
      const cloth=em(`wpm_${id}_${side}`,weaponTint(look.w));
      for(const fit of karrogWraps[side]){
        const band=MeshBuilder.CreateRibbon(`wp_${id}_${side}_${fit.part}`,{pathArray:fit.paths.map(row=>row.map(p=>Vector3.FromArray(p))),closePath:true,sideOrientation:Mesh.DOUBLESIDE},scene);
        band.parent=hand;band.material=cloth;band.isPickable=false;addShadowCaster(band);
        if(side==='r'&&fit.part==='palm')av.weapon=band;
      }
      continue;
    }
    // The donor's wrap offsets assume its much wider hand and a different
    // slot axis. Fit these bands directly around this rig's measured palm.
    const elf=av.modelVariant==='valdren-quaternius',elfFits=VALDREN_WRAPS[mi.root.metadata?.valdrenFace==='female'?'female':'male'][side];
    const band=MeshBuilder.CreateCylinder(`wp_${id}_${side}`,{height:.018,diameter:.052,tessellation:elf?24:16},scene);
    band.parent=hand;band.position.y=.049;band.scaling.z=.72;
    const human=av.modelVariant==='aedri-quaternius',nym=av.modelVariant==='nym-quaternius';
    const nymFemale=mi.root.metadata?.nymFace==='female';
    // Measured human palm cross-sections are wider/deeper than Nym's. Scale
    // the fit by the actual wrist-to-middle-knuckle span on either human bind.
    const knuckle=mi.root.getDescendants(false).find(n=>n.name===`middle_01_${side}`) as TransformNode|undefined;
    const palmScale=human&&knuckle?knuckle.position.y/.0887553383:1;
    if(human){band.scaling.set(1.077*palmScale,palmScale,1.508*palmScale);band.position.set((side==='r'?-.008:.008)*palmScale,.05*palmScale,-.001*palmScale);}
    if(nym){band.scaling.set(nymFemale?1.12:1.08,.75,nymFemale?1.48:1.31);band.position.set((side==='r'?1:-1)*(nymFemale?-.005:0),.018,nymFemale?.004:0);}
    if(av.modelVariant==='rasha-quaternius'){band.scaling.set(1.23,1,1.77);band.position.set(side==='r'?-.011:.011,.045,-.0015);}
    if(elf){const fit=elfFits[0];band.position.set(fit.center[0],fit.center[1],fit.center[2]);band.scaling.set(fit.diameterX/.052,1,fit.diameterZ/.052);}
    band.material=em(`wpm_${id}_${side}`,weaponTint(look.w));band.isPickable=false;addShadowCaster(band);
    const wrist=MeshBuilder.CreateCylinder(`wpw_${id}_${side}`,{height:.016,diameter:.037,tessellation:elf?24:16},scene);
    wrist.parent=hand;wrist.position.y=.008;wrist.scaling.z=.82;
    if(human){wrist.scaling.set(1.244*palmScale,palmScale,1.678*palmScale);wrist.position.set((side==='r'?-.002:.002)*palmScale,.008*palmScale,.002*palmScale);}
    if(nym){wrist.scaling.set(nymFemale?1.5:1.60,.75,nymFemale?1.91:1.86);wrist.position.set((side==='r'?1:-1)*(nymFemale?-.003:0),.004,nymFemale?.004:0);}
    if(av.modelVariant==='rasha-quaternius'){wrist.scaling.set(1.5,1,1.84);wrist.position.set(side==='r'?-.012:.012,.005,.001);}
    if(elf){const fit=elfFits[1];wrist.position.set(fit.center[0],fit.center[1],fit.center[2]);wrist.scaling.set(fit.diameterX/.037,1,fit.diameterZ/.037);}
    wrist.material=band.material;wrist.isPickable=false;addShadowCaster(wrist);
    if(side==='r')av.weapon=band;
  }
  return Promise.resolve();
}

// Fallback cudgel for a weapon key the manifest does not know. The kit ships
// no mace, so it is modelled here in the donor props' units (attach() halves
// them for the production hand) and posed like a bundled prop: grip at the
// handslot origin, business end up +Y.
function buildMace(id: string, hex: string): Mesh {
  const haft = MeshBuilder.CreateCylinder(`wp_${id}`, { height: 0.95, diameter: 0.09, tessellation: 8 }, scene);
  haft.material = em(`wpm_${id}`, "#463625"); // leather-bound shaft
  const part = (m: Mesh, color: string) => {
    m.parent = haft;
    m.material = em(`wpm_${id}_${m.name}`, color);
    m.isPickable = false;
    addShadowCaster(m);
  };
  const head = MeshBuilder.CreateCylinder(`wph_${id}`, { height: 0.3, diameter: 0.2, tessellation: 6 }, scene);
  head.position.y = 0.55;
  part(head, hex);
  // four flanges around the head — the silhouette that reads as "mace" and
  // not "stick" at the distance the camera actually sits
  for (let i = 0; i < 4; i++) {
    const fl = MeshBuilder.CreateBox(`wpf_${id}_${i}`, { width: 0.05, height: 0.28, depth: 0.19 }, scene);
    fl.rotation.y = (i * Math.PI) / 2;
    fl.position.set(Math.sin((i * Math.PI) / 2) * 0.11, 0.55, Math.cos((i * Math.PI) / 2) * 0.11);
    part(fl, hex);
  }
  const cap = MeshBuilder.CreateSphere(`wpc_${id}`, { diameter: 0.13, segments: 6 }, scene);
  cap.position.y = 0.73;
  part(cap, hex);
  const pommel = MeshBuilder.CreateSphere(`wpp_${id}`, { diameter: 0.12, segments: 6 }, scene);
  pommel.position.y = -0.5;
  part(pommel, hex);
  haft.isPickable = false;
  addShadowCaster(haft);
  return haft;
}

// The placeholder rig's weapon: blocked-in shapes on the procedural body that
// a player is shown only if the production body fails to load. The real
// weapon goes into the body's hand slot in attachSmallfolkWeapon.
function buildWeapon(id: string, job: string, look: Look): Mesh | null {
  const wtype = weaponType(job, look);
  const tint = weaponTint(look.w);
  let wp: Mesh | null = null;
  switch (wtype) {
    case "sword":
      wp = MeshBuilder.CreateBox(`wp_${id}`, { width: 0.06, depth: 0.14, height: 0.85 }, scene);
      break;
    case "katana":
      wp = MeshBuilder.CreateBox(`wp_${id}`, { width: 0.04, depth: 0.09, height: 1.05 }, scene);
      break;
    case "greatsword":
      wp = MeshBuilder.CreateBox(`wp_${id}`, { width: 0.09, depth: 0.22, height: 1.45 }, scene);
      break;
    case "staff": {
      wp = MeshBuilder.CreateCylinder(`wp_${id}`, { height: 1.5, diameter: 0.06 }, scene);
      const orb = MeshBuilder.CreateSphere(`wporb_${id}`, { diameter: 0.15, segments: 6 }, scene);
      orb.parent = wp;
      orb.position.y = 0.8;
      orb.material = em(`wporbm_${id}`, "#9d8fc9", "#6a5f9a");
      orb.isPickable = false;
      break;
    }
    case "cudgel":
      wp = MeshBuilder.CreateCylinder(`wp_${id}`, { height: 0.75, diameterTop: 0.14, diameterBottom: 0.08 }, scene);
      break;
    case "handwraps":
      return null;
  }
  if (wp) {
    wp.rotation.x = Math.PI / 2.4; // held out along the hanging arm
    wp.material = em(`wpm_${id}`, tint);
    wp.isPickable = false;
  }
  return wp;
}

export function animateAvatar(av: AvatarNode, anim: string, dt: number, nowS: number): void {
  // The old look stays on screen while a rebuild loads (actor-reveal.ts
  // handOffActor): it stands where the new one is placed and moves the same way.
  const standIn=actorStandIn(av);
  if(standIn){standIn.root.position.copyFrom(av.root.position);standIn.root.rotation.copyFrom(av.root.rotation);standIn.combatUntil=av.combatUntil;animateAvatar(standIn,anim,dt,nowS);}
  updateSheath(av,nowS);
  if(animateQuaternius(av,anim,nowS))return;
  const moving = anim === "walk" || anim === "run";

  // A production body is driven by quaternius-gameplay.ts above. One whose
  // player has been disposed (an actor-reveal stand-in mid hand-off) holds its
  // pose: the procedural path below would rescale and tilt its root.
  if (av.model) return;

  // ---- procedural fallback path ----
  if (moving) {
    av.walkPhase += dt * (anim === "run" ? 9.5 : 6.5);
    const swing = Math.sin(av.walkPhase) * 0.65;
    av.hipL.rotation.x = swing;
    av.hipR.rotation.x = -swing;
    av.shoulderL.rotation.x = -swing * 0.7;
    av.shoulderR.rotation.x = swing * 0.7;
    av.root.position.y += 0; // ground set externally
    av.torso.rotation.x = 0.06;
  } else {
    const settle = Math.min(1, dt * 10);
    av.hipL.rotation.x *= 1 - settle;
    av.hipR.rotation.x *= 1 - settle;
    av.shoulderL.rotation.x *= 1 - settle;
    av.shoulderR.rotation.x *= 1 - settle;
    av.torso.rotation.x = Math.sin(nowS * 1.5) * 0.012; // breathe
  }

  if (anim === "rest") {
    av.root.scaling.y = 0.7;
    av.torso.rotation.x = 0.25;
  } else if (anim === "dead") {
    av.root.rotation.x = Math.PI / 2 * 0.94;
    av.root.scaling.y = 1;
  } else {
    av.root.scaling.y = 1;
    av.root.rotation.x = 0;
  }

  // attack: right arm overhead slash
  if (av.attackUntil > nowS) {
    const t = 1 - (av.attackUntil - nowS) / 0.35;
    av.shoulderR.rotation.x = -2.4 + Math.sin(t * Math.PI) * 2.9;
  }

  // casting: arms forward, orb visible and pulsing
  const casting = av.castingUntil > nowS;
  av.castOrb.setEnabled(casting);
  if (casting) {
    av.shoulderL.rotation.x = -1.2;
    av.shoulderR.rotation.x = -1.2;
    const pulse = 1 + Math.sin(nowS * 12) * 0.25;
    av.castOrb.scaling.setAll(pulse);
    av.castOrb.rotation.y += dt * 4;
  }
}

export function flashAttack(av: AvatarNode, nowS: number, spell=false): void {
  const standIn=actorStandIn(av);if(standIn)flashAttack(standIn,nowS,spell);
  av.combatUntil=combatHold(nowS);
  if(quaterniusAttack(av,nowS,spell))return;
  av.attackUntil = nowS + 0.35;
}
export function flashCast(av: AvatarNode, nowS: number, seconds: number): void {
  const standIn=actorStandIn(av);if(standIn)flashCast(standIn,nowS,seconds);
  av.castingUntil = nowS + seconds;
  av.combatUntil = Math.max(av.combatUntil, combatHold(nowS + seconds));
}

// ---------- monsters ----------
//
// Every monster is a generated creature (creatures.ts, BESTIARY.md): one GLB
// per look of the bestiary plan, worn at the plan's height in its palette
// variant. The KayKit and Quaternius monster bodies, the per-family
// procedural bodies and their tables are gone (2026-10-13).
export interface MonsterNode {
  root: TransformNode;
  proc: TransformNode;  // the loading placeholder, disposed when the model is in
  model: ModelInstance | null;
  currentAnim: string;
  attackUntil: number;
  // the creature's stats and clip state (null until its model is in)
  creature: CreatureStats | null;
  plateY: number;       // nameplate height above the root, metres
  hitUntil: number;
  castUntil: number;
  specialUntil: number;
  attackFlip: boolean;
  attackSeen: number;   // the attackUntil the current swing was chosen for
  creatureScale: number; // world height / built height: a stride grows with it
}

// A palette variant (bestiary_plan.json: a wearer whose palette or crusts
// differ from its look's) is the same GLB with another painted atlas on the
// same UVs. One material per (GLB, variant), cloned from the GLB's and shared
// by every monster wearing that variant; the clone takes the variant's albedo
// (and its emissive / metal-rough maps where the kit painted different ones).
// A variant the kit has not painted yet wears the base atlas.
const variantCache = new WeakMap<object, Map<string, Material>>();
function tintCreature(mi: ModelInstance, file: string, tint: number[]): void {
  const owner = mi.root.getScene();
  let cache = variantCache.get(owner);
  if (!cache) { cache = new Map(); variantCache.set(owner, cache); }
  const key = `${file}|tint|${tint.join(",")}`;
  mi.root.getChildMeshes().forEach((msh) => {
    const mat: any = msh.material;
    if (!mat?.albedoColor) return;
    let clone = cache!.get(key) as any;
    if (!clone) {
      clone = mat.clone(`${mat.name}_tint`);
      clone.albedoColor = new Color3(tint[0], tint[1], tint[2]);
      cache!.set(key, clone);
    }
    msh.material = clone;
  });
}
function variantTexture(url: string, owner: any): Texture {
  // glTF images are not flipped; textures made here must match the GLB's UVs
  const t = new Texture(`/models/${url}`, owner, { invertY: false });
  t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}
function dressVariant(mi: ModelInstance, stats: CreatureStats, variant: string, tint?: number[]): void {
  const v = stats.variants?.[variant];
  if (!v) {
    // not painted yet: a small lightness shift may stand in as a multiply
    if (tint) tintCreature(mi, stats.file, tint);
    return;
  }
  const owner = mi.root.getScene();
  let cache = variantCache.get(owner);
  if (!cache) { cache = new Map(); variantCache.set(owner, cache); }
  const key = `${stats.file}@${variant}`;
  mi.root.getChildMeshes().forEach((msh) => {
    const mat: any = msh.material;
    if (!mat?.albedoTexture && !mat?.albedoColor) return;
    let clone = cache!.get(key) as any;
    if (!clone) {
      clone = mat.clone(`${mat.name}@${variant}`);
      clone.albedoTexture = variantTexture(v.atlas, owner);
      if (v.emit) {
        clone.emissiveTexture = variantTexture(v.emit, owner);
        if (!mat.emissiveTexture) { clone.emissiveColor = new Color3(1, 1, 1); clone.emissiveIntensity = 2; }
      }
      if (v.mr) clone.metallicTexture = variantTexture(v.mr, owner);
      cache!.set(key, clone);
    }
    msh.material = clone;
  });
}

/**
 * A monster's node. Until its creature is in (or if it never loads), a dim
 * cone of the monster's height and footprint stands in: it carries the
 * nameplate height and stays pickable, so a target is never invisible.
 */
export function buildMonsterMesh(id: string, key: string): MonsterNode {
  const def = MONSTERS[key];
  const trueRoot = new TransformNode(`mobroot_${id}`, scene);
  const root = new TransformNode(`mob_${id}`, scene);
  root.parent = trueRoot;
  const cr = creatureFor(key);
  const worldH: number = cr?.use.h ?? def?.height_m ?? 1.5;
  const radius: number = def?.radius_m ?? 0.5;
  const cone = MeshBuilder.CreateCylinder(`mb_${id}`, { height: worldH, diameterTop: 0, diameterBottom: radius * 1.4, tessellation: 8 }, scene);
  cone.parent = root;
  cone.position.y = worldH / 2;
  cone.material = em(`mbm_${id}`, def?.undead ? "#33304a" : "#4a4438");
  cone.isPickable = true;
  cone.metadata = { entityId: id };
  const node: MonsterNode = { root: trueRoot, proc: root, model: null, currentAnim: "", attackUntil: 0,
    creature: null, plateY: worldH + 0.45, hitUntil: 0, castUntil: 0, specialUntil: 0, attackFlip: false, attackSeen: 0, creatureScale: 1 };
  if (!cr) {
    // creature-looks.json covers every monster (tools/data/audit.py and the
    // client tests check it); a key it lacks is a data error, shown as the cone
    console.error(`monster ${key} has no creature`);
    return node;
  }
  // A generated creature: built at its true size, feet at y = 0, facing +z.
  instantiateModel(cr.stats.file, id).then((mi) => {
    if (!mi) return;
    if (trueRoot.isDisposed()) { mi.root.dispose(); return; }
    disposeProceduralMaterials(node.proc);
    node.proc.dispose();
    mi.root.parent = trueRoot;
    // Feet are authored at y = 0, so no bounds-based grounding: a weapon
    // held low in the bind pose (the Regent's sceptre) would lift it off
    // the floor. The kit's measured top (stats.height) sets the scale.
    mi.root.scaling.setAll(worldH / cr.stats.height);
    mi.root.position.y = 0;
    if (cr.use.variant) dressVariant(mi, cr.stats, cr.use.variant, cr.use.tint);
    prepareCreature(mi, worldH);
    node.creatureScale = worldH / cr.stats.height;
    node.creature = cr.stats;
    node.model = mi;
    addMonsterHit(trueRoot, id, worldH, cr.stats.width * node.creatureScale, cr.stats.length * node.creatureScale);
    playAnim(mi, ["Idle"], true);
    node.currentAnim = "Idle";
  });
  return node;
}

// A creature is picked on its skinned triangles, which a pick sees in the
// bind pose and which leave gaps between legs, wings and tails: a side-on wolf
// caught a third of the clicks on it. An invisible box of its measured height,
// width and length (creatures/<glb>.json at its built scale), turning with it,
// takes the click instead, never smaller than a small creature can still be
// clicked at.
const MOB_HIT_MIN = 0.9;
function addMonsterHit(root: TransformNode, id: string, h: number, w: number, l: number): void {
  const height = Math.max(h, MOB_HIT_MIN);
  const hit = MeshBuilder.CreateBox(`mob_hit_${id}`, { height, width: Math.max(w, MOB_HIT_MIN), depth: Math.max(l, MOB_HIT_MIN) }, scene);
  hit.parent = root; hit.position.y = height / 2; hit.visibility = 0;
  hit.isPickable = true; hit.metadata = { entityId: id };
}

// play a death animation, then dispose (used instead of instant removal)
export function monsterDeathAndDispose(node: MonsterNode): void {
  // a corpse on its way out is no longer a target
  node.root.getChildMeshes().forEach((m) => { m.isPickable = false; });
  const free = () => {
    if (node.root.isDisposed()) return; // a zone change already took the whole scene
    disposeProceduralMaterials(node.root);
    node.root.dispose();
  };
  if (node.model && node.creature) {
    // the kit's deaths end lying still; hold that a moment before going
    playAnim(node.model, ["Death"], false, 1.0);
    setTimeout(free, ((node.creature.clips.Death || 1.2) + 0.9) * 1000);
  } else {
    free();
  }
}

/** A monster was struck: generated creatures flinch (their Hit clip). */
export function flashMonsterHit(node: MonsterNode, nowS: number): void {
  node.hitUntil = nowS + 0.4;
}

export function animateMonster(node: MonsterNode, moving: boolean, dt: number, nowS: number, speed = moving ? 3 : 0): void {
  void dt;
  if (!node.model || !node.creature) return;
  const attacking = node.attackUntil > nowS;
  if (attacking && node.attackSeen !== node.attackUntil) {
    // a new swing: alternate the two attacks, and restart even mid-clip
    if (node.attackSeen < nowS) node.attackFlip = !node.attackFlip;
    node.attackSeen = node.attackUntil;
    node.currentAnim = "";
  }
  // a clip's ground speed is measured at the built size; a monster scaled up
  // covers proportionally more ground per cycle
  const pick = creatureClip(node.creature, {
    moving, speed: speed / node.creatureScale, attacking, attackFlip: node.attackFlip,
    casting: node.castUntil > nowS, hit: node.hitUntil > nowS, special: node.specialUntil > nowS,
  });
  if (node.currentAnim !== pick.clip) {
    const wasPlaying = node.model.groups.get(pick.clip)?.isPlaying;
    const g = playAnim(node.model, [pick.clip], pick.loop, pick.rate);
    if (g) {
      // a one-shot asked for again while still running starts over
      if (!pick.loop && wasPlaying) g.goToFrame(g.from);
      g.speedRatio = pick.rate;
      node.currentAnim = pick.clip;
    }
  } else if (pick.loop) {
    const g = node.model.groups.get(pick.clip);
    if (g) g.speedRatio = pick.rate;
  }
}

export function placeOnGround(node: TransformNode, x: number, z: number): void {
  node.position.x = x;
  node.position.z = z;
  node.position.y = groundHeight(x, z);
}
