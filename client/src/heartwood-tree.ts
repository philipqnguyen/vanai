// One indexed surface: trunk, spreading root flutes, branch collars and limbs.
import {Mesh, Vector3, VertexData, StandardMaterial, Color3} from '@babylonjs/core';
import {scene, buildApi, addShadowCaster, seededRand, glow} from './scene';
import type {Home, P} from './heartwood-neighborhood';
import {CellIndex} from './spatial';
export type ElderOptions={homes:Home[];rootLimit:(a:number,r:number)=>number;upperY?:number;flowering?:boolean};
type Fork={i:number;j:number;wi:number;wj:number;span:number;a:number;y:number;reach:number;rise:number;r:number;support:boolean;floor?:number};
/* LIGHTER TRUNKS (S6, 2026-10-07; each a kill switch). A trunk was 160 x 112
 * grid quads and 34 rings a limb, about 55-61K triangles a tree in the main
 * pass and again in every shadow cascade (0.92 M of them at p, MEASURED).
 * - FORK_RINGS: rings along each limb (was 34); a limb is a smooth sweep and
 *   the colliders never read it.
 * - DRAW_J: rows of the DRAWN grid (was 112). The surface is the same function
 *   sampled coarser; the columns (N 160) stay, so the pocket band is unchanged
 *   around the trunk. The trunk's foot colliders are still sampled from the
 *   original 112-row grid with its own forks (pointOn(COLLIDER_J, forks0)),
 *   so they do not move by a bit.
 * - HW_TRUNK_SHADOW_PROXY: the drawn trunk receives shadows but no longer
 *   casts; a lattice of its own vertices (every 2nd row and column, pulled
 *   1% toward the axis so it does not poke through the bark it shades, open
 *   where homes are grown in) casts in its place, unseen. */
const FORK_RINGS=14,DRAW_J=80,COLLIDER_J=112;
export const HW_TRUNK_SHADOW_PROXY=true;
// One shadow material a scene, held weakly: it goes with its scene.
const shadowMats=new WeakMap<object,StandardMaterial>();
export function continuousElder(x:number,z:number,scale:number,y0:number,seed:number,bark:StandardMaterial,opts:ElderOptions){
 const N=160,J=DRAW_J,height=67*scale,positions:number[]=[],uvs:number[]=[],indices:number[]=[],rnd=seededRand(seed),forks0:Fork[]=[],crowns:{p:P;seed:number;low?:boolean}[]=[];
 const step=2*Math.PI/N,delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 // Angular sectors spread and feather through the lower trunk; there is no
 // separate root tube, cap or socket to hide at the foot of the tree.
 const roots=Array.from({length:7},(_,i)=>{const a=i*Math.PI*2/7+seed*.27;return{a,reach:opts.rootLimit(a,12*scale)};});
 for(let i=0;i<7;i++){
  const a=i*2.399+.27,y=(29+rnd()*25)*scale,j=Math.round(y/height*COLLIDER_J);
  forks0.push({i:Math.round((a%(2*Math.PI))/step),j,wi:6,wj:5,span:5*height/COLLIDER_J*1.7,a,y:j/COLLIDER_J*height,reach:(18+rnd()*9)*scale,rise:(15+rnd()*5)*scale,r:1.7*scale,support:false});
 }
 // The clock must be readable from its tally boards, not only from a fly
 // camera. These low flowering limbs use the same welded collars as the crown.
 if(opts.flowering)for(let i=0;i<3;i++){
  const a=Math.atan2(-x,-z)+i*Math.PI*2/3,j=Math.round(12*scale/height*COLLIDER_J);
  forks0.push({i:Math.round((a+Math.PI*2)%(Math.PI*2)/step),j,wi:5,wj:3,span:3*height/COLLIDER_J*1.7,a,y:j/COLLIDER_J*height,reach:20*scale,rise:4*scale,r:.75*scale,support:false});
 }
 if(opts.upperY!==undefined)for(let i=0;i<4;i++){
  const a=Math.PI/4+i*Math.PI/2,lowerTop=Math.max(y0,...opts.homes.filter(h=>h.y<opts.upperY!-5&&Math.hypot(h.x-x,h.z-z)<h.r+12*scale).map(h=>h.y+(h.height??5.5)+.2));
  // Keep a complete trunk row below the collar, above the inhabited pocket cut.
  const j=Math.max(Math.round((opts.upperY-y0-3.5)/height*COLLIDER_J),Math.ceil((lowerTop-y0)/height*COLLIDER_J)+3);
  forks0.push({i:Math.round(a/step),j,wi:5,wj:2,span:2*height/COLLIDER_J*1.7,a,y:j/COLLIDER_J*height,reach:26.4,rise:opts.upperY-y0-j/COLLIDER_J*height-.9,r:1.45,support:true,floor:lowerTop-y0});
 }
 // The drawn forks: the same collars (centre y, widths in metres, limbs and
 // crowns where they were), their holes cut on the drawn rows -- still a
 // complete row between an upper collar and the inhabited pocket below it.
 const forks=forks0.map((f):Fork=>({...f,j:Math.max(Math.round(f.y/height*J),f.floor===undefined?0:Math.ceil(f.floor/height*J)+3),wj:Math.max(2,Math.round(f.wj*J/COLLIDER_J))}));
 const seamEdges=new Map<string,number>(),edgeKey=(a:number,b:number)=>a<b?a+':'+b:b+':'+a;
 const ringId=(j:number,i:number)=>j*N+((i%N)+N)%N;
 const pointOn=(J:number,forks:Fork[])=>(j:number,i:number):P=>{
  const t=j/J,a=i*step,yy=t*height,base=(11.5*Math.pow(1-t,.65)+.6)*scale;
  let r=base*(1+.055*Math.sin(a*9+t*2)+.025*Math.sin(a*17-t*4));
  for(const root of roots)r+=root.reach*Math.exp(-Math.pow(delta(a,root.a)/.26,2))*Math.exp(-Math.pow(yy/(6.8*scale),1.25));
  // A broad raised collar reaches into the surrounding trunk before extrusion.
  for(const f of forks){const da=delta(a,f.a)/(f.wi*step*1.65),dy=(yy-f.y)/f.span;r+=(f.support?1.0:1.9)*scale*Math.exp(-(da*da+dy*dy)*1.5);}
  const px=x+Math.sin(a)*r+Math.sin(t*3)*2*scale,pz=z+Math.cos(a)*r+Math.sin(t*5)*scale;
  const blend=Math.max(0,1-yy/(12*scale))**4,ground=blend>0?buildApi.surface(px,pz)-1.2:y0;
  return[px,y0+yy+(ground-y0)*blend,pz];
 };
 const point=pointOn(J,forks);
 for(let j=0;j<=J;j++)for(let i=0;i<N;i++){positions.push(...point(j,i));uvs.push(i/N*2*Math.PI*12*scale/3,j/J*height/3);}
 // Every triangle asked this of its three corners against every home in the
 // city (~1.5 s of Heartwood's build, MEASURED 2026-09-30). A vertex never
 // moves once pushed, so each is answered once, against the homes near it.
 const homeCells=new CellIndex(8);opts.homes.forEach((h,i)=>{const m=h.r+.3+1e-6;homeCells.add(i,h.x-m,h.x+m,h.z-m,h.z+m);});
 const pocketOf:boolean[]=[];
 const pocket=(id:number)=>pocketOf[id]??=(homeCells.query(positions[id*3],positions[id*3+2])?.map(i=>opts.homes[i])??opts.homes).some(h=>Math.hypot(positions[id*3]-h.x,positions[id*3+2]-h.z)<h.r+.3&&positions[id*3+1]>h.y-.2&&positions[id*3+1]<h.y+(h.height??5.5)+.2);
 const tri=(a:number,b:number,c:number)=>{if(![a,b,c].some(pocket))indices.push(a,c,b);};
 for(let j=0;j<J;j++)for(let i=0;i<N;i++){
  if(forks.some(f=>j>=f.j-f.wj&&j<f.j+f.wj&&Math.abs(delta((i+.5)*step,f.i*step))<f.wi*step))continue;
  const a=ringId(j,i),b=ringId(j+1,i),c=ringId(j,i+1),d=ringId(j+1,i+1);tri(a,b,c);tri(c,b,d);
 }
 // each fork's rings of vertex ids, the boundary first and the cap last, for the occluder
 const forkRings:{rings:number[][];cap:number;centres:Vector3[]}[]=[];
 for(const f of forks){
  const boundary:number[]=[];
  // Same exact indices as the hole boundary: the joint is welded, including normals.
  for(let i=-f.wi;i<f.wi;i++)boundary.push(ringId(f.j-f.wj,f.i+i));
  for(let j=-f.wj;j<f.wj;j++)boundary.push(ringId(f.j+j,f.i+f.wi));
  for(let i=f.wi;i>-f.wi;i--)boundary.push(ringId(f.j+f.wj,f.i+i));
  for(let j=f.wj;j>-f.wj;j--)boundary.push(ringId(f.j+j,f.i-f.wi));
  for(let i=0;i<boundary.length;i++)seamEdges.set(edgeKey(boundary[i],boundary[(i+1)%boundary.length]),0);
  const vectors=boundary.map(id=>Vector3.FromArray(positions,id*3)),center=vectors.reduce((s,p)=>s.add(p),Vector3.Zero()).scale(1/vectors.length);
  const out=new Vector3(Math.sin(f.a),0,Math.cos(f.a)),side=new Vector3(Math.cos(f.a),0,-Math.sin(f.a));
  let previous=boundary;const fr={rings:[boundary],cap:0,centres:[center]};forkRings.push(fr);
  const L=FORK_RINGS,end=new Vector3(x+out.x*f.reach,y0+f.y+f.rise,z+out.z*f.reach),len=Vector3.Distance(center,end);
  for(let j=1;j<=L;j++){
   const t=j/L,s=t*t*(3-2*t),c=Vector3.Lerp(center,end,t);c.y+=(f.support?1.2:-2)*Math.sin(Math.PI*t);
   const tangent=end.subtract(center);tangent.y+=(f.support?1.2:-2)*Math.PI*Math.cos(Math.PI*t);tangent.normalize();
   const up=Vector3.Cross(tangent,side).normalize(),radius=f.r*Math.pow(1-t,.72)+(f.support?.48:.035),ring:number[]=[];
   for(let k=0;k<boundary.length;k++){
    const origin=vectors[k].subtract(center),theta=Math.atan2(origin.y,Vector3.Dot(origin,side)),oval=side.scale(Math.cos(theta)*radius).add(up.scale(Math.sin(theta)*radius));
    // The first metre preserves the broad irregular collar, then flows into the limb.
    const mix=Math.min(1,t*(opts.flowering&&f.y<20*scale?2:5)),offset=Vector3.Lerp(origin,oval,mix*mix*(3-2*mix)),p=c.add(offset),id=positions.length/3;
    if(f.support)p.y=Math.min(p.y,opts.upperY!-.23);
    positions.push(p.x,p.y,p.z);uvs.push(uvs[boundary[k]*2],uvs[boundary[k]*2+1]+s*len/3);ring.push(id);
   }
   for(let k=0;k<ring.length;k++){const next=(k+1)%ring.length;tri(previous[k],ring[k],previous[next]);tri(previous[next],ring[k],ring[next]);}previous=ring;fr.rings.push(ring);fr.centres.push(c);
  }
  const cap=positions.length/3;fr.cap=cap;positions.push(end.x,end.y,end.z);uvs.push(.5,len/3);for(let k=0;k<previous.length;k++)tri(previous[k],cap,previous[(k+1)%previous.length]);
  if(!f.support)crowns.push({p:[end.x,end.y,end.z],seed:seed+f.i*13,low:f.y<20*scale});
 }
 for(let i=0;i<indices.length;i+=3)for(let k=0;k<3;k++){const key=edgeKey(indices[i+k],indices[i+(k+1)%3]);if(seamEdges.has(key))seamEdges.set(key,seamEdges.get(key)!+1);}
 const joins={forks:forks.length,sharedEdges:seamEdges.size,openEdges:[...seamEdges.values()].filter(n=>n!==2).length,openDetails:[...seamEdges].filter(([,n])=>n!==2).map(([key,count])=>({key,count,points:key.split(':').map(i=>positions.slice(Number(i)*3,Number(i)*3+3)),rooms:opts.homes.filter(h=>key.split(':').some(i=>Math.hypot(positions[Number(i)*3]-h.x,positions[Number(i)*3+2]-h.z)<h.r+.3)).map(h=>({name:h.name,y:h.y}))}))};
 const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const vd=new VertexData();Object.assign(vd,{positions,indices,normals,uvs});const mesh=new Mesh('hw_continuous_elder',scene);vd.applyToMesh(mesh);mesh.material=bark;mesh.isPickable=false;
 if(HW_TRUNK_SHADOW_PROXY)mesh.receiveShadows=true;else addShadowCaster(mesh);
 // Ground-level boundary follows the root flares, at the height where a body
 // would hit the solid buttress. Its geometry is part of the trunk above.
 const colliderPoint=pointOn(COLLIDER_J,forks0);
 for(let i=0;i<N;i++){const p=colliderPoint(3,i),q=colliderPoint(3,i+1),cx=(p[0]+q[0])/2,cz=(p[2]+q[2])/2;if(opts.homes.some(h=>Math.hypot(cx-h.x,cz-h.z)<h.r+1.5&&h.y<y0+6))continue;buildApi.addBoxCollider(cx,cz,Math.hypot(q[0]-p[0],q[2]-p[2])/2+.05,.35,Math.atan2(q[0]-p[0],q[2]-p[2])-Math.PI/2,Math.max(p[1],q[1])+1,y0-3);}
 mesh.metadata={continuousElder:{weldedForks:forks.length,rootSectors:roots.length,vertices:positions.length/3}};
 // THE GLOW OCCLUDER (heartwood-city-build.ts) and THE SHADOW PROXY: coarse
 // lattices of the trunk's own vertices -- every few rows and columns of the
 // main grid and every 4th ring and boundary vertex of each limb -- pulled
 // toward the axis (or the limb's ring centre) so each stays inside the bark
 // it stands in for. A coarse quad whose span holds a pocket vertex is drawn
 // at the 2-step grid instead, minus what the pocket cut removes, so a home
 // grown into the trunk keeps its halos and its daylight, and the trunk around
 // it still hides what is behind and still shades. The glow lattice keeps
 // about S3's 4.8 m rows and 8 columns (2% in). The shadow lattice is every
 // 2nd row and column (1% in) and every 2nd boundary vertex of a limb (2% in):
 // at every 4th, 2-4% in, a chord across the concave skirt of a collar stood
 // proud of the bark and darkened it in daylight, and the collars' and root
 // flutes' long morning shadows came out short (east elder, MEASURED by eye
 // 2026-10-07). Still about a ninth of the triangles the trunks cast.
 const axis=(j:number)=>{const t=j/J;return[x+Math.sin(t*3)*2*scale,z+Math.sin(t*5)*scale];};
 const span=(j0:number,i0:number,sj:number,si:number)=>{for(let j=j0;j<=Math.min(J,j0+sj);j++)for(let i=i0;i<=i0+si;i++)if(pocket(ringId(j,i)))return true;return false;};
 const lattice=(rows:number,cols:number,K:number,limbCols=4,limbK=K)=>{
  const occ:number[]=[],occI:number[]=[];
  const gridV=new Map<number,number>(),gv=(j:number,i:number)=>{const id=ringId(j,i);let o=gridV.get(id);if(o===undefined){const [cx,cz]=axis(j);occ.push(cx+(positions[id*3]-cx)*K,positions[id*3+1],cz+(positions[id*3+2]-cz)*K);o=occ.length/3-1;gridV.set(id,o);}return o;};
  const quad=(j0:number,i0:number,sj:number,si:number)=>{const j1=Math.min(J,j0+sj),a=gv(j0,i0),b=gv(j1,i0),c=gv(j0,i0+si),d=gv(j1,i0+si);occI.push(a,c,b,c,d,b);};
  for(let j=0;j<J;j+=rows)for(let i=0;i<N;i+=cols){
   if(!span(j,i,rows,cols)){quad(j,i,rows,cols);continue;}
   for(let jj=j;jj<Math.min(J,j+rows);jj+=2)for(let ii=i;ii<i+cols;ii+=2)if(!span(jj,ii,2,2))quad(jj,ii,2,2);
  }
  for(const {rings,cap,centres}of forkRings){
   const n=rings[0].length,cols=Array.from({length:Math.ceil(n/limbCols)},(_,k)=>k*limbCols),pick=rings.map((_,k)=>k).filter(k=>k%4===0||k===rings.length-1),ids:number[][]=[];
   for(const k of pick){const c=centres[k];ids.push(cols.map(col=>{const id=rings[k][col];occ.push(c.x+(positions[id*3]-c.x)*limbK,c.y+(positions[id*3+1]-c.y)*limbK,c.z+(positions[id*3+2]-c.z)*limbK);return occ.length/3-1;}));}
   for(let k=0;k<pick.length-1;k++)for(let m=0;m<cols.length;m++){const nm=(m+1)%cols.length,ra=rings[pick[k]],rb=rings[pick[k+1]];
    if(pocket(ra[cols[m]])||pocket(ra[cols[nm]])||pocket(rb[cols[m]])||pocket(rb[cols[nm]]))continue;
    const a=ids[k][m],b=ids[k+1][m],c=ids[k][nm],d=ids[k+1][nm];occI.push(a,b,c,c,b,d);}
   const tip=occ.length/3;occ.push(positions[cap*3],positions[cap*3+1],positions[cap*3+2]);const last=ids.at(-1)!;
   for(let m=0;m<cols.length;m++)occI.push(last[m],tip,last[(m+1)%cols.length]);
  }
  return{positions:new Float32Array(occ),indices:new Uint32Array(occI)};
 };
 if(HW_TRUNK_SHADOW_PROXY){
  // Shadow-only, as draw-merge.ts flattenKit's kit_shadow: never in the
  // camera's layer, out of the glow pass, cast on the scene's generator.
  const {positions:sp,indices:si}=lattice(2,2,.99,2,.98),proxy=new Mesh('hw_trunk_shadow',scene),pd=new VertexData();
  pd.positions=sp;pd.indices=si;pd.applyToMesh(proxy);
  let mat=shadowMats.get(scene);if(!mat){mat=new StandardMaterial('hw_trunk_shadow_m',scene);mat.disableLighting=true;mat.diffuseColor=Color3.Black();mat.specularColor=Color3.Black();mat.backFaceCulling=false;shadowMats.set(scene,mat);}
  proxy.material=mat;proxy.isPickable=false;proxy.layerMask=0x10000000;proxy.metadata={hwPart:'trunk_shadow'};
  glow?.addExcludedMesh(proxy);addShadowCaster(proxy);proxy.receiveShadows=false;proxy.freezeWorldMatrix();
 }
 return{mesh,crowns,joins,occluder:lattice(Math.max(2,Math.round(8*J/COLLIDER_J)),8,.98)};
}
