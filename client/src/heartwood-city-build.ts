import {joinHeartwoodFloor, resetHeartwoodFloors} from './heartwood-floors';
import {mourningBlossoms, buildSongSteps, grudgeFloor} from './heartwood-story';
import {continuousElder} from './heartwood-tree';
import {planUpperHeartwood, buildUpperHeartwood, inspectUpperHeartwood, upperBridgePoint} from './heartwood-upper';
// Heartwood's full city: the approved living-tree vocabulary around existing destinations.
import { Mesh, Color3, StandardMaterial, Vector3, PointLight } from '@babylonjs/core';
import { scene, buildApi, glow, glowOccluderMesh, removeShadowCaster, makePath, makeJunction, makeRiver, makeSmallBridge, pathSpine, seededRand, zoneShape } from './scene';
import { ZONES } from './data';
import { CellIndex } from './spatial';
import { place, flushTown } from './town';
import { mergeByKey, flattenKit, emitterCopy } from './draw-merge';
import { planHearthGroups } from './heartwood-groups';
import { heartwoodNight, HW_NIGHT } from './heartwood-night';
import { buildHeartwoodLamps } from './heartwood-lamps';
import { buildHeartwoodPools } from './heartwood-pools';
import { HALL, HALL_DOOR, hallOpenings, hallGaps, hallRibs, hallForecourt } from './heartwood-auction-plan';
import { buildAuctionFittings } from './heartwood-auction';
import { leafCloud, livingTree, grownHome, homeOccluder, grownBranch, livingBark, material, slab, box, rimRail, planter, setGrownPockets, type Home, type P } from './heartwood-neighborhood';

type Road={pts:[number,number][];half:number};
type Tree={x:number;z:number;scale:number;seed:number;y:number;name:string};
type Spur={pts:[number,number][];half:number;startY:number;endY:number};
type Terrace={home:Home;x:number;z:number;y:number;ground:number;r:number;door:number;foot:[number,number];top:[number,number]};
let homes:Home[]=[],trees:Tree[]=[],spurs:Spur[]=[],terraces:Terrace[]=[],roads:Road[]=[],surveys:{x:number;z:number;half:number}[]=[];
let brook:ReturnType<typeof makeRiver>;
// Each brook bridge's handrail height (BRIDGES order), set where the rails are
// built and read by the lamps: the runtime ground there is already the raised
// deck, so the planner cannot re-derive it from groundHeight.
let brookRails:number[]=[];
const BRIDGES:[[number,number],[number,number],[number,number]]=[[65,4],[65,94],[65,-94]];
const DATA=ZONES.heartwood as any;
// Kill switch for paveCopies (below): false draws the paving as before, a
// mesh per ribbon and disc.
const HW_PAVE_COPY=true;
// Kill switch for the thinner understory (S6, below): false places every
// fern and door fern again, and the ferns cast again.
const HW_UNDERSTORY=true;
// The trees merge by the cell of each tree's centre, a mesh per material:
// trunks per HW_TRUNK_CELL m, crowns and blossoms per HW_CROWN_CELL m. Crowns
// city-wide drew no slower than in 96 m cells, with 20-40 fewer draws a camera
// (MEASURED 2026-10-07, paired in page, Chromium, night, median 0.982). The
// trunks city-wide drew all sixteen, in every shadow cascade, wherever one was
// in view: 3.68 M triangles where 1.4-1.8 M had been (MEASURED, capital_perf).
const HW_TRUNK_CELL=96,HW_CROWN_CELL=Infinity;
/** THE PAVING DRAWN AS RENDER COPIES. The city's paving is a mesh per ribbon
 * and junction disc, about 130 transparent draws at the far cameras. One
 * merged copy per (material, ribbon or disc) draws them instead; the discs'
 * copy after the ribbons' (alphaIndex), as makeJunction lays them over.
 * NOT scene.ts mergePavings: that puts the merged mesh into `pavings` in the
 * originals' place, and inside one mesh pavingHit resolves overlapping
 * ribbons as "the highest triangle wins", where separate meshes each spoke:
 * pavingHeight and standHeight (and through it NPC seating, entities.ts)
 * would move at the overlaps. So the originals stay the height source,
 * enabled, visible and in `pavings`, with layerMask 0 so no camera, shadow
 * cascade or glow pass draws them; the copies never enter `pavings`.
 * The copies are named hwpave_ (no "hw_"), so the heartwood QA scripts that
 * ray-pick or scan "hw_" meshes see what they saw before. Inside a copy the
 * overlapping soft edges blend in creation order rather than by distance. */
function paveCopies(made:readonly unknown[]){
  const groups=new Map<string,Mesh[]>();
  for(const m of made){if(!(m instanceof Mesh)||!m.material||!m.getTotalVertices())continue;const key=`${m.material.uniqueId}|${!m.metadata?.pathSpine}`;let g=groups.get(key);if(!g)groups.set(key,g=[]);g.push(m);}
  let n=0;
  for(const ms of groups.values()){
    if(ms.length<2)continue;
    const disc=!ms[0].metadata?.pathSpine,copy=Mesh.MergeMeshes(ms,false,true);
    if(!copy)continue;
    copy.name=`hwpave_${n++}`;copy.material=ms[0].material;copy.useVertexColors=true;copy.hasVertexAlpha=true;copy.alphaIndex=disc?1:0;
    copy.receiveShadows=true;copy.isPickable=false;copy.freezeWorldMatrix();copy.metadata={hwPart:disc?'pave_discs':'pave_ribbons'};
    if(glow)glow.addExcludedMesh(copy);
    for(const m of ms)m.layerMask=0;
  }
}
// Residents occupy the finished city. Reserving a clearing for an indoor
// resident would move or remove the very home they are meant to inhabit.
const protectedSpots=()=>[...DATA.npcs.filter((n:any)=>!n.resident),...DATA.interactables,...DATA.milestones,...DATA.portals,DATA.spawn, {x:118,z:-62}];
const angle=(x:number,z:number)=>Math.atan2(x,z);
// The destinations every planner loop keeps clear of: the zone data's, so
// they are the same for the whole build. protectedSpots() is computed once per
// prepare (prepareHeartwoodCity) instead of on every candidate it rejects.
let spots:any[]=[];
/** The nearest road survey point to (x, z), with its distance d; `approach`
 * skips the points by the three brook bridges. The answer of a scan of every
 * survey in list order with a strict `<` (so the first of equal distances),
 * found through a point CellIndex: rings of cells around the point's cell,
 * widening until a ring's nearest possible distance exceeds the best found.
 * Ties are broken toward the lower survey index explicitly, since rings are
 * not visited in list order. Every planner loop, rootLimit and forbidden ask
 * this: the full scan was 191-221 ms of the build (MEASURED, loaded profile). */
const ROAD_CELL=8;
let roadIndex:{cells:CellIndex;bridged:Uint8Array;gx0:number;gx1:number;gz0:number;gz1:number}|undefined;
function nearRoadScan(x:number,z:number,approach:boolean){let best={x:0,z:0,d:Infinity,half:4};for(const p of surveys){if(approach&&BRIDGES.some(([x,z])=>Math.abs(p.x-x)<21&&Math.abs(p.z-z)<10))continue;const d=Math.hypot(x-p.x,z-p.z);if(d<best.d)best={...p,d};}return best;}
function indexSurveys(){
  if(!surveys.length){roadIndex=undefined;return;}
  const cells=new CellIndex(ROAD_CELL),bridged=new Uint8Array(surveys.length);let gx0=Infinity,gx1=-Infinity,gz0=Infinity,gz1=-Infinity;
  surveys.forEach((p,i)=>{cells.add(i,p.x,p.x,p.z,p.z);bridged[i]=BRIDGES.some(([x,z])=>Math.abs(p.x-x)<21&&Math.abs(p.z-z)<10)?1:0;
    const gx=Math.floor(p.x/ROAD_CELL),gz=Math.floor(p.z/ROAD_CELL);gx0=Math.min(gx0,gx);gx1=Math.max(gx1,gx);gz0=Math.min(gz0,gz);gz1=Math.max(gz1,gz);});
  // A survey with a non-finite coordinate would sit outside every ring: scan.
  roadIndex=[gx0,gx1,gz0,gz1].every(Number.isFinite)?{cells,bridged,gx0,gx1,gz0,gz1}:undefined;
}
function nearRoad(x:number,z:number,approach=false){
  const R=roadIndex;if(!R||!Number.isFinite(x)||!Number.isFinite(z))return nearRoadScan(x,z,approach);
  const C=ROAD_CELL,gx=Math.floor(x/C),gz=Math.floor(z/C),{cells,bridged,gx0,gx1,gz0,gz1}=R;
  let bi=-1,bd=Infinity;
  const visit=(cx:number,cz:number)=>{for(const i of cells.query((cx+.5)*C,(cz+.5)*C)!){if(approach&&bridged[i])continue;const p=surveys[i],d=Math.hypot(x-p.x,z-p.z);if(d<bd||(d===bd&&i<bi)){bd=d;bi=i;}}};
  // Rings wholly outside the surveys' cells hold nothing; the last ring that
  // can hold one is the farthest corner of their box.
  const k0=Math.max(0,gx0-gx,gx-gx1,gz0-gz,gz-gz1),k1=Math.max(gx-gx0,gx1-gx,gz-gz0,gz1-gz);
  for(let k=k0;k<=k1;k++){
    // Any point in ring k is more than (k-1)*C away along x or z; the margin
    // keeps a ring whose bound only rounds above an equal distance.
    if(bi>=0&&(k-1)*C-1e-6>bd)break;
    for(let cx=Math.max(gx-k,gx0);cx<=Math.min(gx+k,gx1);cx++){
      if(Math.abs(cx-gx)===k){for(let cz=Math.max(gz-k,gz0);cz<=Math.min(gz+k,gz1);cz++)visit(cx,cz);}
      else{if(gz-k>=gz0)visit(cx,gz-k);if(k&&gz+k<=gz1)visit(cx,gz+k);}
    }
  }
  return bi<0?{x:0,z:0,d:Infinity,half:4}:{...surveys[bi],d:bd};
}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>t*t*(3-2*t);
function seg(x:number,z:number,a:[number,number],b:[number,number]){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return{t,d:Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)};}
// The paved junction discs [x, z, r]: the crossroads (the Elder plaza first),
// each road's ends past the first road, each spur's foot. (The old auction
// house's apron, [-14, -32, 7], went with it: the hall's forecourt arc is its
// apron now, and the disc would lie inside the hall's wall.)
const JUNCTIONS:[number,number,number][]=[[0,0,14],[-20,13,8],[34,16,7],[-81,0,7],[25,49,7],[118,-62,13]];
const junctionDiscs=():[number,number,number][]=>[...JUNCTIONS,...roads.flatMap((r,i)=>i?[r.pts[0],r.pts.at(-1)!].map((p):[number,number,number]=>[p[0],p[1],r.half+3]):[]),...spurs.map((s):[number,number,number]=>[s.pts[0][0],s.pts[0][1],s.half+1])];
export function inspectHeartwoodCity(){return{upper:inspectUpperHeartwood(),homes,trees,spurs,terraces,bridges:BRIDGES,brookRails,roads,destinations:protectedSpots(),junctions:junctionDiscs()};}
/** Plan before the terrain, so rooms, approaches and ground use the same measurements. */
export function prepareHeartwoodCity(input:Road[],base:(x:number,z:number)=>number){
  roads=input;surveys=roads.flatMap(r=>pathSpine(r.pts,1).spine.map(p=>({...p,half:r.half})));
  indexSurveys();spots=protectedSpots();
  homes=[];trees=[];spurs=[];terraces=[];
  const addHome=(name:string,x:number,z:number,r:number,door?:number,floor?:number,civic=false):Home=>{
    const q=nearRoad(x,z);const h:Home={name,x,z,r,y:floor??base(x,z)+.18,door:door??angle(q.x-x,q.z-z),height:5.5,doorHalf:2.3,city:true,civic};homes.push(h);return h;
  };
  const addTree=(name:string,x:number,z:number,scale:number,seed:number)=>trees.push({name,x,z,scale,seed,y:base(x,z)});
  addHome('The Grudge Hall',-134,-40,9,0,DATA.sites.grudge_hall.floors[0],true);
  addHome("The Elder's Rest",-90,11,8.5,Math.atan2(9,-11));
  // THE AUCTION HOUSE (heartwood-auction-plan.ts): a grown hall on the Grove
  // Ring's south-west side, its arcade facing the ring. Its floor stands at
  // the forecourt's middle, level with the ring's edge, so the arcade opens
  // onto the square without a step down; behind, the ground banks up to it.
  const fc=hallForecourt(),mid=fc[fc.length>>1];
  const hall=addHome(HALL.name,HALL.x,HALL.z,HALL.r,HALL_DOOR,base(mid[0],mid[1])+.18,true);
  Object.assign(hall,{height:HALL.height,rise:HALL.rise,doorHalf:HALL.arch.half,openings:hallOpenings(),gaps:hallGaps(),ribs:hallRibs(),wallDepth:HALL.wallDepth,hearth:HALL.hearth,hall:true});
  addHome("The Woodwrights' Guild",40,55,8,-Math.PI/2,undefined,true);
  addHome("The Chanters' Hall",106,-120,9,-.82,undefined,true);
  addTree('The Elder Tree',30,31,1.2,11);addTree('The Resting Bough',-75,24,.8,12);
  addTree('The Remembering Oak',-151,-58,1.2,13);addTree('The Singing Crown',119,-146,1.25,14);
  // Each residential anchor chooses its nearest safe clearing; measured street
  // spines and existing services reserve their real room before anything grows.
  const anchors:[string,number,number][]=[['Ferncourt',-65,66],['Sunleaf',-12,63],['Brookside',85,49],['Mossfold',-64,-42],['Amberroot',25,-64],['Southbough',-34,-105],['Tallshade',111,113],['Northrest',-92,117]];
  for(const [name,ax,az]of anchors){let best:{x:number;z:number;score:number}|undefined;
    for(let x=ax-18;x<=ax+18;x+=3)for(let z=az-18;z<=az+18;z+=3){const q=nearRoad(x,z);if(q.d<22||Math.abs(x-65)<14||spots.some(p=>Math.hypot(x-p.x,z-p.z)<23)||trees.some(t=>Math.hypot(x-t.x,z-t.z)<38)||homes.some(h=>Math.hypot(x-h.x,z-h.z)<h.r+15))continue;const score=Math.hypot(x-ax,z-az);if(!best||score<best.score)best={x,z,score};}
    if(best)addTree(name,best.x,best.z,1.05,30+trees.length);
  }
  // The four named elders stay at their existing tally destinations, with room to approach.
  for(const [name,x,z]of [['North Elder',0,176],['East Elder',187,-16],['South Elder',0,-176],['West Elder',-174,15]] as [string,number,number][])addTree(name,x,z,.95,70+trees.length);
  // Households face the lane from pockets around each trunk, never through it.
  for(const tree of trees.slice(0,-4)){
    let count=0;
    for(let i=0;i<32&&count<3;i++){
      const a=i*2.399+tree.seed*.17,r=6.6+(i%3)*.35,d=tree.scale*11+4.9,x=tree.x+Math.sin(a)*d,z=tree.z+Math.cos(a)*d,q=nearRoad(x,z);
      if(q.d<r+q.half+2||q.d>32||Math.abs(x-65)<12||spots.some(p=>Math.hypot(x-p.x,z-p.z)<r+4)||homes.some(h=>Math.hypot(x-h.x,z-h.z)<h.r+r+2)||trees.some(t=>t!==tree&&Math.hypot(x-t.x,z-t.z)<t.scale*12+r+1))continue;
      const door=angle(q.x-x,q.z-z);if(Math.sin(door)*(x-tree.x)+Math.cos(door)*(z-tree.z)<2)continue;
      addHome(`${tree.name} · ${count+1}`,x,z,r,door);count++;
    }
  }
  // Three elevated dwellings have their own spacious terrace and a straight,
  // railed root flight; everyday destinations remain on the ground.
  for(const tree of trees.filter(t=>['Ferncourt','Brookside','Southbough'].includes(t.name))){
    const a=angle(nearRoad(tree.x,tree.z).x-tree.x,nearRoad(tree.x,tree.z).z-tree.z),x=tree.x+Math.sin(a)*14,z=tree.z+Math.cos(a)*14;
    if(homes.some(h=>Math.hypot(x-h.x,z-h.z)<h.r+7))continue;
    const h=addHome(tree.name+' · Canopy home',x,z,7,a,base(x,z)+6.6),tx=x+Math.sin(a)*10.4,tz=z+Math.cos(a)*10.4,r=6;
    const top:[number,number]=[tx+Math.sin(a)*r,tz+Math.cos(a)*r],foot:[number,number]=[top[0]+Math.sin(a)*18,top[1]+Math.cos(a)*18];
    if(homes.some(o=>o!==h&&seg(o.x,o.z,top,foot).d<o.r+3)||spots.some(p=>seg(p.x,p.z,top,foot).d<5)||Math.abs(foot[0]-65)<11){homes.pop();continue;}
    terraces.push({home:h,x:tx,z:tz,y:h.y,ground:base(foot[0],foot[1]),r,door:a,foot,top});
  }
  for(const [name,x,z,a]of [['North Canopy',111,135,0],['Grudge Bough',-171,-64,-Math.PI/2]] as [string,number,number,number][]){
    const h=addHome(name,x,z,7,a,base(x,z)+6.6),tx=x+Math.sin(a)*10.4,tz=z+Math.cos(a)*10.4;
    const top:[number,number]=[tx+Math.sin(a)*6,tz+Math.cos(a)*6],foot:[number,number]=[top[0]+Math.sin(a)*18,top[1]+Math.cos(a)*18];
    terraces.push({home:h,x:tx,z:tz,y:h.y,ground:base(...foot),r:6,door:a,foot,top});
  }
  for(const h of homes){if(terraces.some(t=>t.home===h))continue;
    // The hall's forecourt: its arc round the arcade in two halves, each from
    // its own road (the West Gate road north, the south-west lane east) to the
    // main door, graded from the road down to the floor's level.
    if(h.hall){const half=fc.length>>1;for(const run of [fc.slice(0,half+1),fc.slice(half).reverse()]){const q=nearRoad(...run[0],true);spurs.push({pts:[[q.x,q.z],...run],half:HALL.forecourt.half,startY:base(q.x,q.z),endY:h.y-.18});}continue;}
    const a=h.door!,foot:[number,number]=[h.x+Math.sin(a)*(h.r+1.8),h.z+Math.cos(a)*(h.r+1.8)],q=nearRoad(...foot,true);
    spurs.push({pts:[[q.x,q.z],foot,[h.x+Math.sin(a)*(h.r-.1),h.z+Math.cos(a)*(h.r-.1)]],half:3.4,startY:base(q.x,q.z),endY:h.y-.18});
  }
  for(const p of spots){
    if(homes.some(h=>Math.hypot(h.x-p.x,h.z-p.z)<h.r)||Math.hypot(p.x-118,p.z+62)<19)continue;
    const q=nearRoad(p.x,p.z,true);if(q.d<2)continue;
    const stop=p.id?.startsWith('crystal')?5:p.prop?2:1.7,dx=(q.x-p.x)/q.d,dz=(q.z-p.z)/q.d,ex=p.x+dx*stop,ez=p.z+dz*stop;
    spurs.push({pts:[[q.x,q.z],[ex,ez]],half:3.2,startY:base(q.x,q.z),endY:base(ex,ez)});
  }
  for(const t of terraces){if(t.home.name==='North Canopy'){spurs.push({pts:[[120,84],[145,84],[145,160],[125,160],[125,174],[111,174],t.foot],half:3.5,startY:base(120,84),endY:t.ground});continue;}const q=nearRoad(...t.foot,true),dx=Math.sin(t.door),dz=Math.cos(t.door),nx=Math.cos(t.door),nz=-Math.sin(t.door),side=(q.x-t.foot[0])*nx+(q.z-t.foot[1])*nz>0?1:-1;
    spurs.push({pts:[[q.x,q.z],[t.top[0]+nx*side*8,t.top[1]+nz*side*8],[t.foot[0]+nx*side*8+dx*4,t.foot[1]+nz*side*8+dz*4],[t.foot[0]+dx*4,t.foot[1]+dz*4],t.foot],half:3.5,startY:base(q.x,q.z),endY:t.ground});}

  const upperCity=planUpperHeartwood(trees);
  homes.push(...upperCity.homes);
  const stairFoot=upperCity.stair.foot,q=nearRoad(stairFoot[0]-12,stairFoot[2],true);
  spurs.push({pts:[[q.x,q.z],[stairFoot[0]-12,stairFoot[2]],[stairFoot[0]-4,stairFoot[2]],[stairFoot[0],stairFoot[2]]],half:3.6,startY:base(q.x,q.z),endY:stairFoot[1]});

  // clampStep: the brook's waterline clamp samples the ground on a 4-texel
  // lattice, not at all 26K texels (riverWaterAndBed); dropping it restores
  // the per-texel clamp exactly
  brook=makeRiver([[65,202],[65,120],[65,4],[65,-94],[65,-205]],{half:3.1,depth:'shallow',seed:661,meander:1.1,clampStep:4});
  const upper=new Set([...terraces.map(t=>t.home),...upperCity.homes]);
  const grades=spurs.map(s=>{let total=0;const lengths=s.pts.slice(1).map((p,i)=>{const d=Math.hypot(p[0]-s.pts[i][0],p[1]-s.pts[i][1]);total+=d;return d;});
    const xs=s.pts.map(p=>p[0]),zs=s.pts.map(p=>p[1]),m=s.half+2+1e-6;return{s,total,lengths,x0:Math.min(...xs)-m,x1:Math.max(...xs)+m,z0:Math.min(...zs)-m,z1:Math.max(...zs)+m};});
  // The spur grades by their padded boxes: a CellIndex only picks which grades
  // get the box test and the blend below, in ascending list order, because
  // each blend leans on the one before it. Scanning all ~100 boxes on every
  // land() call was most of land's 334-412 ms (MEASURED, loaded profile).
  const gradeCells=new CellIndex(8);grades.forEach((g,i)=>gradeCells.add(i,g.x0,g.x1,g.z0,g.z1));
  // land() is the ground under every Heartwood question, and the brook's carve
  // asks it nine times a sample: scanning every home and spur each time was
  // ~13 s of the city's build (MEASURED 2026-09-30). A home only reaches h.r+4
  // and a spur s.half+2, so only those near the point are tested -- in list
  // order, because each blend leans on the one before it.
  let homeCells:{list:Home[];count:number;cells:CellIndex}|undefined;
  const nearHomes=(x:number,z:number):readonly number[]|null=>{
    if(!homeCells||homeCells.list!==homes||homeCells.count!==homes.length){const cells=new CellIndex(8);homes.forEach((h,i)=>{const m=h.r+4+1e-6;cells.add(i,h.x-m,h.x+m,h.z-m,h.z+m);});homeCells={list:homes,count:homes.length,cells};}
    return homeCells.cells.query(x,z);
  };
  const land=(x:number,z:number)=>{
    let y=base(x,z);
    // Candidates by index, without building a list of them per call; null (a
    // non-finite point) tests every home and grade, as the full scan did.
    const hi=nearHomes(x,z),hn=hi?hi.length:homes.length;
    for(let j=0;j<hn;j++){const h=homes[hi?hi[j]:j];if(upper.has(h))continue;const d=Math.hypot(x-h.x,z-h.z),w=Math.max(0,Math.min(1,(h.r+4-d)/2));if(w)y=lerp(y,h.y-.18,smooth(w));}
    const gi=gradeCells.query(x,z),gn=gi?gi.length:grades.length;
    for(let j=0;j<gn;j++){const {s,total,lengths,x0,x1,z0,z1}=grades[gi?gi[j]:j];if(x<x0||x>x1||z<z0||z>z1)continue;let along=0,best={d:Infinity,t:0};for(let i=0;i<lengths.length;i++){const q=seg(x,z,s.pts[i],s.pts[i+1]);if(q.d<best.d)best={d:q.d,t:(along+q.t*lengths[i])/total};along+=lengths[i];}const w=Math.max(0,Math.min(1,(s.half+2-best.d)/2));if(w)y=lerp(y,lerp(s.startY,s.endY,best.t),smooth(w));}
    return y;
  };
  // The standard bridge's last tread uses the bank height at its deck end.
  // Carry that height under the entire approach flight before returning to the
  // road grade; otherwise downhill banks drop away after the final tread.
  const banks=BRIDGES.flatMap(([bx,bz])=>[-1,1].map(side=>({bx,bz,side,bank:land(bx+side*12,bz),end:land(bx+side*34,bz)})));
  const approaches=(x:number,z:number)=>{
    let y=land(x,z);
    for(const {bx,bz,side,bank,end}of banks){const d=(x-bx)*side,cross=Math.abs(z-bz);if(d<12||d>34||cross>10)continue;
      const t=smooth(Math.max(0,Math.min(1,(d-23)/11))),w=smooth(Math.max(0,Math.min(1,(10-cross)/5)));
      y=lerp(y,lerp(bank,end,t),w);
    }
    return y;
  };
  return(x:number,z:number)=>brook.carve(x,z,approaches(x,z),approaches);
}
function mergeSince(start:number){const meshes=scene.meshes.slice(start).filter((m):m is Mesh=>m instanceof Mesh&&m.name.startsWith('hw_'));for(const mat of new Set(meshes.map(m=>m.material))){const group=meshes.filter(m=>m.material===mat);if(group.length>1)Mesh.MergeMeshes(group,true,true,undefined,false,true)?.freezeWorldMatrix();}}
/** THE GLOW OCCLUDER. The glow pass redrew the city's hw meshes black only to
 * hide what glows behind them -- the sun and moon behind the trunks and
 * crowns, a window behind its neighbour -- and then exact copies of their
 * triangles did (7.9 M glow-pass triangles at p, 6.4 M of them the copies,
 * MEASURED 2026-10-07). Hiding a halo does not need the bark's every flute or
 * a leaf's every almond, so every hw mesh leaves the pass and coarse stand-ins
 * built from the plan draw there instead, as ONE positions-only
 * glowOccluderMesh (scene.ts):
 * - each trunk's own vertices on a coarse lattice (continuousElder), open at
 *   the homes grown into it;
 * - each home's wall ring and dome (homeOccluder), open at its door and
 *   windows, so its own halos show from outside and in;
 * - an octahedron a leaf cloud, its core: a little more solid than the
 *   porous crown, so the sun and moon bloom through a canopy less;
 * - each upper ring's deck as a flat annulus, the rope bridges, the upper
 *   stair and the canopy terraces and their flights as sheets inside the
 *   boards.
 * Blossoms, ivy, rails and ropes get none (thin, they never hid a halo much).
 * What stays in the pass as itself: the window emitter copy (hwwindowglow, not
 * an hw_ name) and the cheap opaque pieces that are none of the above (slabs,
 * decks, roots, song steps; under 5,000 triangles each), as solid as they
 * look. A home's walls (room_bark) and moss cap (living_roof) leave even where
 * cheap: its ring and dome stand in (with S4's lighter ivy vines a home group's
 * moss fell under 5,000 triangles and drew in the pass again, +6 glow draws).
 * One mesh, not one per 96 m cell: the city's stand-ins are about 60K
 * triangles in all, where the cells were 17 glow draws at p (MEASURED
 * 2026-10-07, capital_perf), and culling cells of so few saves nothing. */
function glowProxies(trunkOcc:{positions:Float32Array;indices:Uint32Array}[],clouds:{p:P;size:number;volume:number}[]){
  if(!glow)return;
  const all={positions:[] as number[],indices:[] as number[]};
  const append=(c:{positions:number[];indices:number[]},p:ArrayLike<number>,ix:ArrayLike<number>)=>{const base=c.positions.length/3;for(let i=0;i<p.length;i++)c.positions.push(p[i]);for(let i=0;i<ix.length;i++)c.indices.push(ix[i]+base);};
  for(const t of trunkOcc)append(all,t.positions,t.indices);
  for(const h of homes)homeOccluder(h,all);
  for(const {p,size,volume}of clouds){const a=.55*size,v=.4*size*volume;
    append(all,[p[0]+a,p[1],p[2],p[0]-a,p[1],p[2],p[0],p[1]+v,p[2],p[0],p[1]-v,p[2],p[0],p[1],p[2]+a,p[0],p[1],p[2]-a],[0,2,4,4,2,1,1,2,5,5,2,0,0,4,3,4,1,3,1,5,3,5,0,3]);}
  // Walkways: a sheet inside each deck's thickness, a few centimetres in from
  // its edges, so it hides what the deck hid and never shows past it.
  const sheet=(pts:P[],half:number)=>{const pos:number[]=[],ix:number[]=[];
    for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l,q=pts[i];
      pos.push(q[0]+nx*half,q[1],q[2]+nz*half,q[0]-nx*half,q[1],q[2]-nz*half);if(i)ix.push(i*2-2,i*2,i*2-1,i*2-1,i*2,i*2+1);}
    append(all,pos,ix);};
  const upper=inspectUpperHeartwood();
  for(const r of upper.rings){const pos:number[]=[],ix:number[]=[],r0=r.r-r.half+.05,r1=r.r+r.half-.05,n=48;
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2;for(const rr of [r0,r1])pos.push(r.tree.x+Math.sin(a)*rr,r.y-.2,r.tree.z+Math.cos(a)*rr);const j=(i+1)%n;ix.push(i*2,j*2,i*2+1,i*2+1,j*2,j*2+1);}
    append(all,pos,ix);}
  for(const b of upper.bridges)sheet(Array.from({length:25},(_,i):P=>{const q=upperBridgePoint(i/24,b);return[q[0],q[1]-.12,q[2]];}),b.half-.05);
  const st=upper.stair;sheet([0,1].map((t):P=>[lerp(st.foot[0],st.top[0],t),lerp(st.foot[1],st.top[1],t)-.17,lerp(st.foot[2],st.top[2],t)]),st.half-.05);
  sheet([[st.top[0],st.top[1]-.2,st.top[2]],[st.landing[0],st.top[1]-.2,st.landing[2]]],st.half+.95);
  for(const t of terraces){const pos:number[]=[t.x,t.y-.14,t.z],ix:number[]=[],n=24;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pos.push(t.x+Math.sin(a)*(t.r-.05),t.y-.14,t.z+Math.cos(a)*(t.r-.05));ix.push(0,1+i,1+(i+1)%n);}append(all,pos,ix);
    sheet([[t.foot[0],t.ground-.16,t.foot[1]],[t.top[0],t.y-.16,t.top[1]]],2.05);}
  // Out of the pass first, then the stand-ins in.
  for(const m of scene.meshes){if(!(m instanceof Mesh)||!m.name.startsWith('hw_'))continue;
    const kind=`${m.name} ${m.metadata?.hwPart??''}`,cheap=m.getTotalIndices()/3<5000&&!/leaf|blossom|ivy|rail|rope|seam|room_bark|living_roof/.test(kind)&&!m.material?.needAlphaBlendingForMesh(m);
    if(!cheap)glow.addExcludedMesh(m);}
  const occ=glowOccluderMesh('hwocc',new Float32Array(all.positions),new Uint32Array(all.indices));if(occ)occ.metadata={hwPart:'glow_occluder'};
}
export function buildHeartwoodCity(){
  resetHeartwoodFloors();
  const bark=livingBark(),wood=material('city_honey','#ab9473'),moss=material('city_moss','#697942','leafy_grass'),leaves=['#527539','#6f9146','#8ca254','#426837'].map((c,i)=>material('city_leaf'+i,c)),glass=material('city_amber','#f6c373');
  wood.diffuseTexture=bark.diffuseTexture;wood.emissiveColor=Color3.FromHexString('#ad8c61').scale(.06);leaves.forEach(m=>m.emissiveColor=m.diffuseColor.scale(.12));glass.emissiveColor=Color3.FromHexString('#b87927').scale(.55);glass.metadata={glow:.12};
  // Pale petals must retain their colour on the shaded underside of a crown.
  const blossom=material('mourning_ivory','#fff3dc');blossom.emissiveColor=new Color3(.83,.8,.73);
  setGrownPockets(homes);brook.build('hw_city_brook');
  const treeJoins:unknown[]=[],treeParts=new Map<string,Mesh[]>();
  // What the glow occluder (below) needs of the trees: each trunk's coarse
  // lattice and each leaf cloud's centre, size and depth.
  const trunkOcc:{positions:Float32Array;indices:Uint32Array}[]=[],clouds:{p:P;size:number;volume:number}[]=[];
  const cloud=(p:P,size:number,mat:StandardMaterial,seed:number,count:number,volume:number)=>{leafCloud(p,size,mat,seed,count,volume);clouds.push({p,size,volume});};
  for(const tree of trees){
    tree.y=buildApi.surface(tree.x,tree.z);const start=scene.meshes.length;
    const upperRing=inspectUpperHeartwood().rings.find(r=>r.tree===tree);
    const flowering=/^(North|East|South|West) Elder$/.test(tree.name);
    const result=continuousElder(tree.x,tree.z,tree.scale,tree.y,tree.seed,bark,{homes,upperY:upperRing?.y,flowering,rootLimit:(a,r)=>{
      let reach=0;for(let d=.5;d<=7*tree.scale;d+=.5){const x=tree.x+Math.sin(a)*(r+d),z=tree.z+Math.cos(a)*(r+d),q=nearRoad(x,z);if(q.d<q.half+3||spurs.some(s=>s.pts.slice(1).some((p,i)=>seg(x,z,s.pts[i],p).d<s.half+2))||spots.some(p=>Math.hypot(x-p.x,z-p.z)<5))break;reach=d;}return reach;
    }});
    treeJoins.push({name:tree.name,...result.joins});trunkOcc.push(result.occluder);
    for(const {p,seed,low}of result.crowns){
      if(low){cloud(p,4,leaves[1],seed,95,.65);mourningBlossoms([p[0],p[1]-.3,p[2]],4.5,seed+90,220,blossom);}
      else for(let i=0;i<3;i++){const at:P=[p[0]+Math.sin(i*2.1)*4*tree.scale,p[1]+i*2*tree.scale,p[2]+Math.cos(i*2.1)*4*tree.scale];cloud(at,7*tree.scale,leaves[(seed+i)%leaves.length],seed+i,280,.8);if(flowering)mourningBlossoms(at,7*tree.scale,seed+i+90,170,blossom);}
    }
    for(let i=0;i<3;i++)cloud([tree.x+Math.sin(i*2.1)*5*tree.scale,tree.y+(63+i*4)*tree.scale,tree.z+Math.cos(i*2.1)*5*tree.scale],9*tree.scale,leaves[i],tree.seed+800+i,736,1.15);
    buildApi.addCircleCollider(tree.x,tree.z,tree.scale*6);
    // The original outer trunk boundary remains solid above its blended root flare.
    for(let i=0;i<96;i++){const a=i/96*Math.PI*2,r=tree.scale*11.8,x=tree.x+Math.sin(a)*r,z=tree.z+Math.cos(a)*r;
      if(homes.some(h=>Math.hypot(x-h.x,z-h.z)<h.r+1.3))continue;
      buildApi.addBoxCollider(x,z,.48,.5,a,tree.y+70*tree.scale,tree.y+2);
    }
    mergeSince(start);
    for(const m of scene.meshes.slice(start)){if(!(m instanceof Mesh))continue;const trunk=/^hw_(continuous_elder|trunk_shadow)/.test(m.name);if(!trunk&&!/^hw_(leaf_cloud|mourning_blossoms)/.test(m.name))continue;
      const size=trunk?HW_TRUNK_CELL:HW_CROWN_CELL,cell=`${trunk}_${Math.floor(tree.x/size+.5)}_${Math.floor(tree.z/size+.5)}`;(treeParts.get(cell)??treeParts.set(cell,[]).get(cell)!).push(m);}
  }
  // Each tree's trunk, and its crown a draw per leaf colour, merge with the
  // other trees in its cell (HW_TRUNK_CELL, HW_CROWN_CELL), one mesh per
  // material (a trunk's shadow proxy with the trunks, by its own material).
  // Since S4 made the crowns light, drawing
  // all of a colour wherever one tree is in view costs less than the draws.
  for(const parts of treeParts.values())mergeByKey(parts);
  // The notices on the auction house's board: plain paper, the hall's one
  // material of its own.
  const paper=material('auction_paper','#d8cdb2');
  const lightStart=scene.lights.length,hearths=homes.map(h=>grownHome(h,bark,wood,moss,glass,leaves,h.hall?()=>buildAuctionFittings(h,{bark,wood,glass,leaves,paper}):undefined));
  // The windows, the moss and the hearths follow the night (heartwood-night.ts).
  // The hearths from the scene, not grownHome's return: it returns a city home's only.
  heartwoodNight({glass,moss,hearths:scene.lights.slice(lightStart).filter((l):l is PointLight=>l instanceof PointLight&&l.name==='hw_hearth_light')});
  grudgeFloor(-134,-40,DATA.sites.grudge_hall.floors[0]);
  const upperStart=scene.meshes.length;
  buildUpperHeartwood(wood,bark,leaves,material('hemp_rope','#a59168'));
  const upperParts=scene.meshes.slice(upperStart);
  for(const mat of new Set(upperParts.map(m=>m.material))){const group=upperParts.filter((m):m is Mesh=>m instanceof Mesh&&m.material===mat);if(group.length>1){const merged=Mesh.MergeMeshes(group,true,true,undefined,false,true);if(merged){merged.metadata={heartwoodUpper:true};merged.freezeWorldMatrix();}}}
  const pave={tex:'mossy_cobblestone',tint:'#d6cead',soft:.3},paveStart=scene.meshes.length;
  // Break the paving at each actual bridge; roads and terrain remain continuous.
  for(const road of roads){let groups:[number,number][][]=[[]];for(const p of pathSpine(road.pts,1).spine){if(BRIDGES.some(([x,z])=>Math.abs(p.x-x)<12&&Math.abs(p.z-z)<7)){if(groups.at(-1)!.length)groups.push([]);continue;}groups.at(-1)!.push([p.x,p.z]);}for(const pts of groups)if(pts.length>1)makePath({pts,half:road.half,...pave});}
  roads.forEach((r,i)=>{if(!i)return;for(const p of [r.pts[0],r.pts.at(-1)!])makeJunction({x:p[0],z:p[1],r:r.half+3,...pave});});
  for(const s of spurs){makePath({pts:s.pts,half:s.half,...pave});makeJunction({x:s.pts[0][0],z:s.pts[0][1],r:s.half+1,...pave});}
  for(const [x,z,r]of JUNCTIONS)makeJunction({x,z,r,...pave});
  // The paving was drawn a second time, black, in the glow pass (120-132 draws
  // at the far cameras). It lies on the terrain, which stays in the pass and
  // writes the same depth under it, so leaving it out only stops its blended
  // black from dimming the halos it overlaps: at most 37 pixels a shot, by at
  // most 2/255 (MEASURED 2026-10-06, in page, the 38 shot views).
  if(glow)for(const m of scene.meshes.slice(paveStart))if(m instanceof Mesh)glow.addExcludedMesh(m);
  if(HW_PAVE_COPY)paveCopies(scene.meshes.slice(paveStart));
  brookRails=[];
  for(const [x,z]of BRIDGES){const start=scene.meshes.length,len=24,width=5.6;makeSmallBridge('hw_city_bridge',x,z,{length:len,width,lift:.45,structure:'grown',material:wood});const y=Math.max(buildApi.ground(x-len/2,z),buildApi.ground(x+len/2,z))+.65;brookRails.push(y);
    for(const side of [-1,1]){const zz=z+side*(width/2-.1);grownBranch('city_bridge_root',[[x-16,buildApi.surface(x-16,zz)-.25,zz],[x-8,y-.5,zz],[x+8,y-.5,zz],[x+16,buildApi.surface(x+16,zz)-.25,zz]],.8,.65,bark);rimRail('city_bridge',Array.from({length:13},(_,i):P=>[x-12+i*2,y,zz]),wood);}
    mergeSince(start);
  }
  for(const t of terraces){const start=scene.meshes.length,a=t.door,dx=Math.sin(a),dz=Math.cos(a),nx=Math.cos(a),nz=-Math.sin(a),half=2.1;
    slab('city_terrace',t.x,t.y,t.z,t.r,wood);buildApi.addDisc(t.x,t.z,t.r,t.y);
    for(const side of [-1,1]){const points:P[]=[];for(let i=0;i<=30;i++){const q=a+side*(.42+i/30*(Math.PI-.9));points.push([t.x+Math.sin(q)*(t.r-.2),t.y,t.z+Math.cos(q)*(t.r-.2)]);}rimRail('city_terrace',points,wood);}
    const rise=t.y-t.ground,n=Math.ceil(rise/.2),len=Math.hypot(t.foot[0]-t.top[0],t.foot[1]-t.top[1]);
    for(let i=0;i<n;i++){const f0=i/n,f1=(i+1)/n,x0=lerp(t.foot[0],t.top[0],f0),z0=lerp(t.foot[1],t.top[1],f0),x1=lerp(t.foot[0],t.top[0],f1),z1=lerp(t.foot[1],t.top[1],f1),y0=lerp(t.ground,t.y,f0),y1=lerp(t.ground,t.y,f1),mesh=box('city_tread',[(x0+x1)/2,y1-.16,(z0+z1)/2],[half*2,.32,len/n+.025],wood);mesh.rotation.y=a;joinHeartwoodFloor(mesh,y1);
      buildApi.addRamp(x0,z0,y0,x1,z1,y1,half,.015,t.home.name);buildApi.addStairBody(x0,z0,y0,x1,z1,y1,half,.4,t.home.name);
    }
    // A straight flight touches a circular terrace only at its centre. Fill
    // the full stair width back to the chord, cutting against the terrace top.
    const inset=t.r-Math.sqrt(t.r*t.r-half*half)+.08,depth=inset+.025;
    const join=box('terrace_stair_join',[t.top[0]-dx*(inset-.025)/2,t.y-.14,t.top[1]-dz*(inset-.025)/2],[half*2,.28,depth],wood);join.rotation.y=a;joinHeartwoodFloor(join,t.y);
    buildApi.addDeck(t.top[0]-dx*(inset-.025)/2,t.top[1]-dz*(inset-.025)/2,half,depth/2,a,t.y);
    for(const side of [-1,1]){const q=a+side*.42;rimRail('terrace_stair_corner',[[t.top[0]+nx*side*half,t.y,t.top[1]+nz*side*half],[t.x+Math.sin(q)*(t.r-.2),t.y,t.z+Math.cos(q)*(t.r-.2)]],wood);}
    for(const side of [-1,1]){const points:P[]=Array.from({length:14},(_,i)=>[lerp(t.foot[0],t.top[0],i/13)+nx*side*half,lerp(t.ground,t.y,i/13),lerp(t.foot[1],t.top[1],i/13)+nz*side*half]);rimRail('city_stair',points,wood);grownBranch('city_stair_root',points.map(p=>[p[0],p[1]-.4,p[2]]),.5,.5,bark);grownBranch('terrace_support',[[t.home.x,t.y-6,t.home.z],[t.x+nx*side*3,t.y-2,t.z+nz*side*3],[t.x+nx*side*5,t.y-.35,t.z+nz*side*5]],.85,.35,bark);}
    for(const side of [-1,1])for(const q of [.9,1.5,2.2])planter(t.x+Math.sin(a+side*q)*5,t.y,t.z+Math.cos(a+side*q)*5,wood,leaves,q);
    mergeSince(start);
  }
  // Each bridge and each terrace stays its own mesh a material (mergeSince):
  // merged across the city, all three terraces drew wherever one was in view
  // (0.15-0.23 M main-pass triangles more at b, k, l and o, MEASURED 2026-10-07).
  // Everyday market stalls frame the vendors without covering their standing space.
  // One canvas material per colour (five stalls made five), and each colour's
  // poles merged into one mesh: they are tubes laid in world space, so merging
  // moves no vertex. The tilted canvases stay their own meshes: baking their
  // transform on the CPU moved canopy edge pixels by up to 55/255 (MEASURED
  // 2026-10-06, reference shots), where the GPU had always transformed them.
  const stalls=new Map<string,{cloth:StandardMaterial;poles:Mesh[]}>();
  for(const [x,z]of [[-27,18],[-14,20],[40,22],[29,23],[-87,5],[-20,-40]]){
    if(homes.some(h=>Math.hypot(x-(h.x+Math.sin(h.door!)*(h.r+2)),z-(h.z+Math.cos(h.door!)*(h.r+2)))<5))continue;
    const y=buildApi.surface(x,z),colour=x>0?'#abb98a':'#d3b581';
    let stall=stalls.get(colour);if(!stall)stalls.set(colour,stall={cloth:material('city_canvas',colour),poles:[]});
    for(const side of [-1,1])stall.poles.push(grownBranch('stall_pole',[[x+side*2,y,z],[x+side*2.1,y+3,z]],.10,.07,wood));
    const roof=box('stall_canvas',[x,y+2.9,z],[4.5,.08,2.5],stall.cloth);roof.rotation.x=.1;place('moonmere/home_table.glb',x,y,z,0,0,0,1.3);buildApi.addBoxCollider(x,z,.85,.52,0,y+1.32,y);
  }
  for(const {poles}of stalls.values())Mesh.MergeMeshes(poles,true,true,undefined,false,true)?.freezeWorldMatrix();
  // The stage keeps both speakers; the audience climbs three broad living-wood terraces.
  const sy=buildApi.surface(118,-62);slab('song_stage',118,sy+.12,-62,12.5,wood);buildApi.addDisc(118,-62,12.5,sy+.12);
  buildSongSteps(sy+.12,wood);
  // The three song terraces share the plain wood and stand together: one mesh.
  for(const song of mergeByKey(scene.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.name==='hw_song_terrace')))song.metadata={hwPart:'song_terrace'};
  const upper=inspectUpperHeartwood(),clearSpan=(x:number,z:number,pad:number)=>upper.rings.some(r=>Math.abs(Math.hypot(x-r.tree.x,z-r.tree.z)-r.r)<r.half+pad)||upper.bridges.some(b=>seg(x,z,[b.a[0],b.a[2]],[b.b[0],b.b[2]]).d<b.half+pad);
  const rnd=seededRand(983),forbidden=(x:number,z:number,pad:number)=>clearSpan(x,z,pad+3)||Math.hypot(x,z)<16+pad||nearRoad(x,z).d<5+pad||spurs.some(s=>s.pts.slice(1).some((p,i)=>seg(x,z,s.pts[i],p).d<s.half+pad))||homes.some(h=>Math.hypot(x-h.x,z-h.z)<h.r+pad)||seg(x,z,[inspectUpperHeartwood().stair.foot[0],inspectUpperHeartwood().stair.foot[2]],[inspectUpperHeartwood().stair.top[0],inspectUpperHeartwood().stair.top[2]]).d<4+pad||terraces.some(t=>seg(x,z,t.foot,t.top).d<4+pad)||spots.some(p=>Math.hypot(x-p.x,z-p.z)<5+pad)||Math.abs(x-65)<7||Math.hypot(x-118,z+62)<24;
  // Broadleaf understory belongs to the settlement; no extra rim treeline.
  for(let i=0;i<900;i++){const x=(rnd()-.5)*550,z=(rnd()-.5)*390;if(forbidden(x,z,4)||trees.some(t=>Math.hypot(x-t.x,z-t.z)<t.scale*22)||x>210)continue;const y=buildApi.surface(x,z);if(y<1)continue;place('nature/CommonTree_5.gltf',x,y-.2,z,rnd()*6.28,0,0,1.5+rnd()*1.6);buildApi.addCircleCollider(x,z,.55);}
  // A thinner understory (HW_UNDERSTORY): every third of the loop's ferns is
  // not placed, its random numbers still drawn so everything after lands
  // where it did; the door ferns likewise. Ground cover only: no collider.
  for(let i=0;i<2000;i++){const x=(rnd()-.5)*520,z=(rnd()-.5)*360;if(forbidden(x,z,.8))continue;const yaw=rnd()*6.28,size=.5+rnd()*.7;if(HW_UNDERSTORY&&i%3===2)continue;place(i%3?'nature/Fern_1.gltf':'nature/Grass_Common_Short.gltf',x,buildApi.surface(x,z),z,yaw,0,0,size);}
  for(const h of homes){const a=h.door!,yy=h.y;for(const side of [-1,1])for(let i=0;i<6;i++){if(HW_UNDERSTORY&&i%3===2)continue;const q=a+side*(.6+i*.15),x=h.x+Math.sin(q)*(h.r+.7),z=h.z+Math.cos(q)*(h.r+.7);if(spots.some(p=>Math.hypot(x-p.x,z-p.z)<4))continue;place('nature/Fern_1.gltf',x,(terraces.some(t=>t.home===h)||inspectUpperHeartwood().homes.includes(h))?yy:buildApi.surface(x,z),z,q,0,0,.8);}}
  // Homes re-merge into light-safe groups (heartwood-groups.ts): a tree's
  // ground homes, an upper ring's homes, the halls joined to a group nearby, at
  // most HEARTH_CAP hearths and never two homes whose hearths may reach each
  // other, so a hearth adds nothing to its neighbours' triangles and no merged
  // mesh carries more lights than WebKit links. The 264 home meshes were one
  // draw per material per home; now one per material per group.
  const rings=inspectUpperHeartwood().rings;
  // The hall is a pocket of its own: its sapling and sign stand far above the
  // cylinder hearthReaches tests, so it shares no group's hearths.
  const pocket=homes.map(h=>{if(h.hall)return 'hall:'+h.name;const ring=rings.find(r=>r.homes.includes(h));if(ring)return 'ring:'+ring.tree.name;const tree=trees.find(t=>h.name.startsWith(t.name+' · '));return tree&&'tree:'+tree.name;});
  for(const g of planHearthGroups(homes,pocket)){
    const lamps=g.homes.flatMap(i=>hearths[i]??[]);
    for(const m of mergeByKey(lamps.flatMap(l=>l.includedOnlyMeshes),lamps))m.metadata={hwPart:m.name.replace(/^hw_|_merged$/g,'')};
  }
  // The amber windows glow: a draw per group in the glow pass, all the same
  // colour (the layer reads only their material). One copy of them all draws
  // them there instead, made before the occluder copies as they were: 13-18
  // glow draws -> 1, no slower, the glow target unchanged (MEASURED 2026-10-06,
  // in page).
  const amber=emitterCopy('hwwindowglow',scene.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.name.startsWith('hw_')&&m.subMeshes?.length===1&&m.subMeshes[0].getMaterial()===glass));
  if(amber)amber.metadata={hwPart:'window_glow'};
  glowProxies(trunkOcc,clouds);
  // The resin lamps (heartwood-lamps.ts): planned from the finished plan, drawn
  // when their GLB arrives. Decoration only: no collider, floor or pick.
  const lamps=HW_NIGHT.lamps?buildHeartwoodLamps(inspectHeartwoodCity(),bark,wood):null;
  // Their light (heartwood-pools.ts): a baked pool map read by a plugin on the
  // walk and wall materials. No light, no draw; baked before the first frame.
  if(HW_NIGHT.pools)buildHeartwoodPools(inspectHeartwoodCity(),lamps);
  // Merged or left single (a lone trunk, a one-home group), the city's pieces
  // laid in world space never move: no world matrix to recompute a frame.
  for(const m of scene.meshes)if(m instanceof Mesh&&m.name.startsWith('hw_')&&!m.parent&&!m.isWorldMatrixFrozen&&m.computeWorldMatrix(true).isIdentity())m.freezeWorldMatrix();
  // The kit (furniture, the quay, the border wall, the camps' props) was a
  // city-wide thin-instanced draw per file and submesh in every shadow cascade
  // and the glow pass at every camera: once it has all arrived (scene.ts
  // flushes the quay and the wall after this), it is baked into one
  // shadow-only caster per cull mode and a glow copy per 96 m cell, and the
  // templates go on drawing only what the camera sees;
  // nature.ts's rocks with them (18 fewer shadow draws a camera, MEASURED
  // 2026-10-06, in page, pixels unchanged). In page, before any
  // source: the kit's shadow draws 59-155 -> 21-37 a perf camera by day, its
  // glow draws 42-72 -> 11-27, the canvas and the glow target unchanged at all
  // 19 shot cameras day and night beyond the noise floor (MEASURED 2026-10-06,
  // tmp/heartwood-perf/steps/4/precheck).
  // The homes' furniture (moonmere/) stands inside their rooms, whose own
  // occluders (glowProxies) hide what is behind it: out of the glow pass with
  // no copy. The camps', quay's and wall's kit keep theirs.
  const kitSettled=flushTown();
  // Fern fronds are ankle-high cards: their shadows are a speckle no one reads
  // under the trunks' and homes', and the template's 2,175 alpha-tested
  // instances cast in every cascade (87K triangles a cascade, MEASURED
  // 2026-10-07). This scene's fern template stops casting once it exists;
  // the template is scene-owned, so another zone's ferns are untouched.
  if(HW_UNDERSTORY){const at=scene;kitSettled.then(()=>{if(at!==scene||at.isDisposed)return;for(const m of at.meshes)if(m.name==='gtn_nature/Fern_1.gltf')removeShadowCaster(m);});}
  flattenKit(scene,kitSettled,{cell:96,inside:m=>m.name.startsWith('st_moonmere/'),tag:(m,role)=>m.metadata={hwPart:role==='shadow'?'kit_shadow':'kit_glow_copy'}});
  scene.metadata={...scene.metadata,heartwoodTreeJoins:treeJoins,heartwoodCity:inspectHeartwoodCity()};
}
