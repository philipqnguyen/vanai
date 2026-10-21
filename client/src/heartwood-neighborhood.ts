import {joinHeartwoodFloor} from './heartwood-floors';
// Original grown-wood architecture shared by the live Heartwood city.
// A single set of wall openings drives visible geometry AND collision.
import { Color3, Curve3, DynamicTexture, PointLight, Mesh, MeshBuilder, StandardMaterial, Texture, Vector3, VertexData } from '@babylonjs/core';
import { scene, buildApi, addShadowCaster, seededRand } from './scene';
import { place } from './town';
import { HEARTH_LIFT, HEARTH_REACH } from './heartwood-groups';

export type P = [number, number, number];
// Step S4 kill switches (tmp/heartwood-perf/PLAN2.md): each puts its piece back
// as it was when set to false (or 1).
// The home walls: one buffer instead of a throw-away mesh per wall quad.
const HW_WALL_BATCH=true;
// Tubes: spline points and sides scaled to the branch instead of 7 and 10 always.
const HW_TUBE_DETAIL=true;
// A home's ivy: leaf cards on the wall instead of a 400-triangle sphere a leaf.
const HW_IVY_CARDS=true;
// Leaf clouds: fewer, larger leaves (count x0.45, size x1.45: about the same cover).
const HW_LEAF_COUNT=.45,HW_LEAF_SIZE=1.45;
export type Home = {name:string;x:number;z:number;r:number;y:number;door?:number;height?:number;doorHalf?:number;civic?:boolean;city?:boolean}&HallParts;
/** What a grown HALL (the auction house, heartwood-auction-plan.ts) sets on
 * its Home; a home leaves them all unset and grows exactly as it did. */
export type HallParts = {
  hall?:boolean;
  /** the dome's rise over the wall (a home 2) */
  rise?:number;
  /** the openings, main door first, in place of homeOpenings' four */
  openings?:Opening[];
  /** the extra door arches the pools' wall lets light through */
  gaps?:{a:number;half:number}[];
  /** the roof ribs' angles, in place of the nine evenly round */
  ribs?:number[];
  /** the wall colliders' radial half-depth (a city home .98) */
  wallDepth?:number;
  /** the hearth's intensity (a city home .55) */
  hearth?:number;
};
let pockets:Home[]=[];
export function setGrownPockets(homes:Home[]):void{pockets=homes;}
export function material(name:string,color:string,texture?:string):StandardMaterial {
  const m=new StandardMaterial(`hw_${name}`,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.setAll(.06);
  m.backFaceCulling=false;m.twoSidedLighting=true;
  // StandardMaterial binds only its first 4 lights (Babylon 9.22's default), and
  // a merged group of homes carries up to 4 hearths beside hemi, sun and crystal.
  m.maxSimultaneousLights=8;
  if(texture){m.diffuseTexture=new Texture(`/tex/${texture}_diff.jpg`,scene);m.bumpTexture=new Texture(`/tex/${texture}_nor.jpg`,scene);m.bumpTexture.level=.55;}
  return m;
}
// Bark is drawn in longitudinal fibres so branches and walls share a readable,
// warm surface without stretching a photographic trunk atlas across tiny wedges.
export function livingBark():StandardMaterial {
  const m=material('living_bark','#ffffff');
  const tex=new DynamicTexture('hw_bark_fibres',{width:512,height:1024},scene,false);
  const c=tex.getContext() as CanvasRenderingContext2D,rnd=seededRand(62);
  c.fillStyle='#907c61';c.fillRect(0,0,512,1024);
  for(let i=0;i<180;i++){
    const x=rnd()*512,w=.6+rnd()*4,amp=2+rnd()*7,phase=rnd()*6.28;
    c.strokeStyle=['#88765e','#a38d70','#958067','#76674f'][i%4];c.lineWidth=w;c.beginPath();
    for(let y=0;y<=1024;y+=8){const xx=x+Math.sin(y/1024*Math.PI*4+phase)*amp;if(y)c.lineTo(xx,y);else c.moveTo(xx,y);}c.stroke();
  }
  tex.wrapU=Texture.WRAP_ADDRESSMODE;tex.wrapV=Texture.WRAP_ADDRESSMODE;tex.update();m.diffuseTexture=tex;m.emissiveColor=Color3.FromHexString('#796c53').scale(.10);return m;
}
// A gently folded almond leaf (u across, v along, h the fold), 7 vertices, 6 triangles.
const ALMOND:[number,number,number][]=[[0,-1,0],[-.48,-.3,0],[-.42,.45,0],[0,1,0],[.42,.45,0],[.48,-.3,0],[0,0,.2]];
export function leafCloud(p:P,size:number,mat:StandardMaterial,seed:number,count=410,volume=.48) {
  const rnd=seededRand(seed),positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];
  // Each cloud seeds its own rnd, so fewer leaves here shifts no other cloud.
  // The crowns were 0.78 M main-pass triangles at p (MEASURED 2026-10-07); at
  // x0.45 the leaves x1.45 keep about the cover (0.45 x 1.45^2 = 0.95).
  const n=Math.round(count*HW_LEAF_COUNT);
  for(let i=0;i<n;i++){
    const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*size,x=p[0]+Math.sin(a)*d,z=p[2]+Math.cos(a)*d,y=p[1]+(rnd()-.5)*size*volume;
    const turn=rnd()*Math.PI*2,s=(.5+rnd()*.8)*HW_LEAF_SIZE,base=positions.length/3,shade=.78+rnd()*.35;
    // A gently folded almond, with small spaces through the crown for sunlight.
    for(const [u,v,h]of ALMOND){
      positions.push(x+(u*Math.cos(turn)+v*Math.sin(turn))*s,y+h*s,z+(-u*Math.sin(turn)+v*Math.cos(turn))*s);
      colors.push(shade,shade,shade,1);
    }
    for(let k=0;k<6;k++)indices.push(base+6,base+k,base+(k+1)%6);
  }
  VertexData.ComputeNormals(positions,indices,normals);const vd=new VertexData();Object.assign(vd,{positions,indices,normals,colors});const mesh=new Mesh('hw_leaf_cloud',scene);vd.applyToMesh(mesh);finish(mesh,mat);
}
function finish(m:Mesh,mat:StandardMaterial):Mesh {m.material=mat;m.isPickable=false;addShadowCaster(m);return m;}
/** A tapering branch with a smooth centreline, in metres; useful for roots, arches and furniture. */
export function grownBranch(name:string,points:P[],r0:number,r1:number,mat:StandardMaterial):Mesh {
  // Detail follows the branch: 7 spline points a span and 10 sides made a
  // 27-point window arch 3,720 triangles, 360 at about 0.35 m a ring and 6
  // sides (MEASURED, plans2/synth/walls.mjs). A straight two-point rod needs no
  // spline points at all. Buttresses keep 7 and 10: their pocket trim below
  // registers colliders along the path.
  let nb=7,sides=10;
  if(HW_TUBE_DETAIL&&!name.startsWith('buttress')){
    let len=0;for(let i=1;i<points.length;i++)len+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1],points[i][2]-points[i-1][2]);
    const mean=(r0+r1)/2;nb=points.length<3?1:Math.min(7,Math.max(1,Math.ceil(len/(points.length-1)/.35)));sides=mean<.06?5:mean<.15?6:mean<.4?8:10;
  }
  const path=Curve3.CreateCatmullRomSpline(points.map(p=>new Vector3(...p)),nb).getPoints();
  const mesh=MeshBuilder.CreateTube(`hw_${name}`,{path,radiusFunction:(i)=>r0+(r1-r0)*i/(path.length-1),tessellation:sides,cap:Mesh.CAP_ALL},scene);
  const uv=mesh.getVerticesData('uv')!;let length=0;for(let i=1;i<path.length;i++)length+=Vector3.Distance(path[i-1],path[i]);for(let i=0;i<uv.length;i+=2){uv[i]*=Math.max(.4,(r0+r1)*Math.PI/3);uv[i+1]*=length/3;}mesh.setVerticesData('uv',uv);
  if(name.startsWith('buttress')) {
    // The tree grows around inhabited pockets; no support may pierce a room.
    const positions=mesh.getVerticesData('position')!,indices=mesh.getIndices()!,kept:number[]=[];
    const inside=(i:number)=>pockets.some(h=>Math.hypot(positions[i*3]-h.x,positions[i*3+2]-h.z)<h.r+.3&&positions[i*3+1]>h.y-.35&&positions[i*3+1]<h.y+(h.height??4.7)+.5);
    for(let i=0;i<indices.length;i+=3)if(![indices[i],indices[i+1],indices[i+2]].some(inside))kept.push(indices[i],indices[i+1],indices[i+2]);
    mesh.setIndices(kept);
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],p=Vector3.Center(a,b),radius=r0+(r1-r0)*i/(path.length-1);
      if(p.y+radius<.3||pockets.some(h=>Math.hypot(p.x-h.x,p.z-h.z)<h.r+radius+.6))continue;
      const d=Math.hypot(b.x-a.x,b.z-a.z);if(d<.05)continue;
      buildApi.addBoxCollider(p.x,p.z,radius*.82,d/2,Math.atan2(b.x-a.x,b.z-a.z),p.y+radius,p.y-radius);
    }
  }
  return finish(mesh,mat);
}
/** One ivy leaf: ALMOND stood upright on the wall at q, facing out along
 * `face` (radians, as `at` measures them), turned `spin` in its own plane. */
function ivyCard(c:{positions:number[];indices:number[]},q:P,face:number,spin:number){
  const ox=Math.sin(face),oz=Math.cos(face),tx=oz,tz=-ox,cs=Math.cos(spin),sn=Math.sin(spin),base=c.positions.length/3;
  for(const [u,v,h]of ALMOND){const a=u*.29,b=v*.19,s=a*cs-b*sn,t=a*sn+b*cs;c.positions.push(q[0]+tx*s+ox*h*.19,q[1]+t,q[2]+tz*s+oz*h*.19);}
  for(let k=0;k<6;k++)c.indices.push(base+6,base+k,base+(k+1)%6);
}
export function blob(name:string,p:P,s:P,mat:StandardMaterial):Mesh {
  const m=MeshBuilder.CreateSphere(`hw_${name}`,{diameter:2,segments:8},scene);m.position.set(...p);m.scaling.set(...s);return finish(m,mat);
}
export function slab(name:string,x:number,y:number,z:number,r:number,mat:StandardMaterial):Mesh {
  const m=MeshBuilder.CreateCylinder(`hw_${name}`,{height:.28,diameter:r*2,tessellation:64},scene);m.position.set(x,y-.14,z);if(['room_floor','terrace','city_terrace'].includes(name))joinHeartwoodFloor(m,y);return finish(m,mat);
}
export function box(name:string,p:P,s:P,mat:StandardMaterial):Mesh {
  const m=MeshBuilder.CreateBox(`hw_${name}`,{width:s[0],height:s[1],depth:s[2]},scene);m.position.set(...p);return finish(m,mat);
}
function strip(name:string,rows:P[][],mat:StandardMaterial):Mesh {
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[];const n=rows[0].length;
  rows.forEach((row,j)=>{let u=0;row.forEach((p,i)=>{if(i)u+=Vector3.Distance(new Vector3(...p),new Vector3(...row[i-1]));positions.push(...p);const v=Vector3.Distance(new Vector3(...p),new Vector3(...rows[0][i]));uvs.push(u/3,v/3);});});
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<n-1;i++){const a=j*n+i;if(name==='elder_trunk'&&[rows[j][i],rows[j][i+1],rows[j+1][i],rows[j+1][i+1]].some(p=>pockets.some(h=>Math.hypot(p[0]-h.x,p[2]-h.z)<h.r+.3&&p[1]>h.y-2&&p[1]<h.y+(h.height??4.7)+.2)))continue;indices.push(a,a+n,a+1,a+1,a+n,a+n+1);}
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const vd=new VertexData();Object.assign(vd,{positions,indices,normals,uvs});
  const m=new Mesh(`hw_${name}`,scene);vd.applyToMesh(m);return finish(m,mat);
}
/** Fluted healthy trunk; the rings flare into the buttress roots, never a scaled pine. */
export function livingTree(x:number,z:number,scale:number,bark:StandardMaterial,leaf:StandardMaterial[],baseY=0,detail=1,seed=135) {
  const rows:P[][]=[];
  for(let j=0;j<=48;j++){const t=j/48,y=t*67,base=11.5*Math.pow(1-t,.65)+.6;const row:P[]=[];
    for(let i=0;i<=96;i++){const a=i/96*Math.PI*2,r=base*(1+.085*Math.sin(a*9+t*2)+.04*Math.sin(a*17-t*4));row.push([x+scale*(Math.sin(a)*r+Math.sin(t*3)*2),baseY+scale*y-.6,z+scale*(Math.cos(a)*r+Math.sin(t*5))]);}rows.push(row);
  }
  strip('elder_trunk',rows,bark);
  const rnd=seededRand(seed);
  for(let i=0;i<Math.round(13*detail);i++){
    const a=i*2.399,y=25+rnd()*30,reach=15+rnd()*13,px=x+Math.sin(a)*reach*scale,pz=z+Math.cos(a)*reach*scale;
    grownBranch('crown_limb',[[x,baseY+y*scale,z],[x+Math.sin(a)*8*scale,baseY+(y+3)*scale,z+Math.cos(a)*8*scale],[px,baseY+(y+10)*scale,pz],[px+Math.sin(a)*4*scale,baseY+(y+17)*scale,pz]],(2.9-y*.025)*scale,.22*scale,bark);
    for(let k=0;k<3;k++){const b=k*2.4,d=4*scale;leafCloud([px+Math.sin(b)*d,baseY+(y+15+k*2)*scale,pz+Math.cos(b)*d],7*scale,leaf[(i+k)%leaf.length],seed+i*100+k,Math.round(410*detail));}
  }
  if(detail<1)for(let i=0;i<3;i++)leafCloud([x+Math.sin(i*2.1)*5*scale,baseY+(63+i*4)*scale,z+Math.cos(i*2.1)*5*scale],9*scale,leaf[i%leaf.length],seed+800+i,Math.round(1600*detail),1.15);
}
export function rimRail(name:string,pts:P[],wood:StandardMaterial,solid=true) {
  grownBranch(`${name}_handrail`,pts.map(p=>[p[0],p[1]+1.12,p[2]]),.1,.1,wood);
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],d=Math.hypot(b[0]-a[0],b[2]-a[2]),yaw=Math.atan2(b[0]-a[0],b[2]-a[2]);
    grownBranch(`${name}_post`,[a,[a[0]+.1,a[1]+.55,a[2]],[a[0],a[1]+1.12,a[2]]],.12,.065,wood);
    grownBranch(`${name}_weave`,[[a[0],a[1]+.16,a[2]],[(a[0]+b[0])/2,(a[1]+b[1])/2+.8,(a[2]+b[2])/2],[b[0],b[1]+1.12,b[2]]],.048,.045,wood);
    if(solid)buildApi.addBoxCollider((a[0]+b[0])/2,(a[2]+b[2])/2,.10,d/2+.04,yaw,Math.max(a[1],b[1])+1.2,Math.min(a[1],b[1])-.3);
  }
}
export function planter(x:number,y:number,z:number,wood:StandardMaterial,leaves:StandardMaterial[],seed=0) {
  const pot=MeshBuilder.CreateCylinder('hw_planter',{height:.55,diameterTop:.9,diameterBottom:.62,tessellation:9},scene);pot.position.set(x,y+.275,z);finish(pot,wood);
  place('nature/Fern_1.gltf',x,y+.53,z,seed,0,0,.48);
}
export type Opening={a:number;w:number;lo:number;hi:number;door?:boolean};
/** A home's door and windows: angle, half-width along the wall (m), sill and
 * arch top above the floor. One table for the walls, the arches, the colliders
 * and the glow occluder (homeOccluder). */
function homeOpenings(h:Home):Opening[]{
  if(h.openings)return h.openings;
  const door=h.door??0,doorHalf=h.doorHalf??1.55;
  return [{a:door,w:doorHalf,lo:0,hi:h.city?4.25:3.65,door:true},{a:door+.95,w:.83,lo:1.3,hi:3.45},{a:door-.95,w:.83,lo:1.3,hi:3.45},{a:door+2.45,w:.8,lo:1.3,hi:3.35}];
}
/** A home's GLOW OCCLUDER, positions only, appended to `out` (world space):
 * what the glow pass needs of a home is that the halos behind it stay hidden,
 * not its 3-6K triangles of bark, ribs and arches. A wall ring just inside the
 * inner skin (r-.45 against r-.42), 24 segments cut exactly at the openings --
 * below a window's sill and above its arch it is wall, through it and the door
 * nothing, so a home's own windows and door show from outside and inside --
 * and a dome of 4 rows x 16 inside the moss cap ((r+.3) against (r+.65)), its
 * first row closing the eave from the ring. Pure: no scene, no meshes. */
export function homeOccluder(h:Home,out:{positions:number[];indices:number[]}):void{
  const {x,z,r,y}=h,H=h.height??4.7,R=r-.45,TAU=Math.PI*2,P=out.positions,I=out.indices;
  const delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const v=(a:number,rr:number,yy:number)=>{P.push(x+Math.sin(a)*rr,yy,z+Math.cos(a)*rr);return P.length/3-1;};
  const quad=(a0:number,a1:number,lo:number,hi:number)=>{if(hi-lo<.01||a1-a0<1e-4)return;const p=v(a0,R,y+lo),q=v(a1,R,y+lo),s=v(a0,R,y+hi),t=v(a1,R,y+hi);I.push(p,s,q,q,s,t);};
  // each opening as an angular span on the ring, (door) or with wall below its sill and above its arch
  const spans=homeOpenings(h).map(o=>({c:o.a,half:o.w/r,lo:o.lo,hi:o.hi}));
  for(let i=0;i<24;i++){
    const a0=i/24*TAU,a1=(i+1)/24*TAU;
    // cut points: the segment's ends and every opening edge inside it
    const cuts=[a0,a1];
    for(const o of spans)for(const e of [o.c-o.half,o.c+o.half]){const t=a0+((delta(e,a0)%TAU)+TAU)%TAU;if(t>a0&&t<a1)cuts.push(t);}
    cuts.sort((p,q)=>p-q);
    for(let k=0;k<cuts.length-1;k++){
      const b0=cuts[k],b1=cuts[k+1],mid=(b0+b1)/2,o=spans.find(o=>Math.abs(delta(mid,o.c))<o.half);
      if(!o){quad(b0,b1,0,H);continue;}
      quad(b0,b1,0,o.lo);quad(b0,b1,o.hi,H);
    }
  }
  // the dome: the eave row at the ring, then 4 rows up the cap to its crown
  const rows:number[][]=[];
  // (a hall's dome rises h.rise, the occluder's .95 of it as a home's 1.9 of 2)
  const rise=h.rise===undefined?1.9:h.rise*.95;
  for(let j=-1;j<=4;j++){const row:number[]=[];const t=j/4,rr=j<0?R:(r+.3)*Math.cos(t*Math.PI/2),yy=y+H+(j<0?0:Math.sin(t*Math.PI/2)*rise);
    if(j===4){row.push(v(0,0,yy));rows.push(row);break;}
    for(let i=0;i<16;i++)row.push(v(i/16*TAU,rr,yy));rows.push(row);}
  for(let j=0;j<rows.length-1;j++){const a=rows[j],b=rows[j+1];for(let i=0;i<16;i++){const n=(i+1)%16;if(b.length===1)I.push(a[i],b[0],a[n]);else I.push(a[i],b[i],a[n],a[n],b[i],b[n]);}}
}
/** Rounded rooms with real deep arched openings and a continuous hollow shell.
 * A city home returns its hearth, whose include list is the home's merged meshes. */
export function grownHome(h:Home,bark:StandardMaterial,wood:StandardMaterial,moss:StandardMaterial,glass:StandardMaterial,leaves:StandardMaterial[],fit?:()=>void):PointLight|undefined {
  const {x,z,r,y}=h,door=h.door??0,H=h.height??4.7,doorHalf=h.doorHalf??1.55;
  const startMesh=scene.meshes.length;
  const at=(a:number,rr:number,yy:number):P=>[x+Math.sin(a)*rr,yy,z+Math.cos(a)*rr];
  const delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const openings=homeOpenings(h);
  const wallMeshes=scene.meshes.length;
  const N=160;
  // HW_WALL_BATCH: the same quads, in the same order, with the same uvs and
  // (no quad shares a vertex) the same normals, written into one buffer: a
  // mesh per quad, merged after, was about 15K throw-away meshes for the city.
  const wall=HW_WALL_BATCH?{positions:[] as number[],indices:[] as number[],uvs:[] as number[]}:null;
  for(let i=0;i<N;i++){
    const a0=(i/N)*Math.PI*2,a1=(i+1)/N*Math.PI*2,a=(a0+a1)/2;
    const op=openings.find(o=>Math.abs(delta(a,o.a)*r)<o.w),q=op?delta(a,op.a)*r/op.w:0;
    const hi=op?op.hi-(1-Math.sqrt(Math.max(0,1-q*q)))*1.05:0;
    const ranges=op?[[0,op.lo],[hi,H]]:[[0,H]];
    for(const [lo,top]of ranges){if(top-lo<.01)continue;
      for(const rr of [r,r-.42]){
        const arch=(a:number)=>op?op.hi-(1-Math.sqrt(Math.max(0,1-(delta(a,op.a)*r/op.w)**2)))*1.05:lo;
        const rows=[[at(a0,rr,y+(op&&lo===hi?arch(a0):lo)),at(a1,rr,y+(op&&lo===hi?arch(a1):lo))],[at(a0,rr,y+top),at(a1,rr,y+top)]],uv=[a0*r/3,lo/3,a1*r/3,lo/3,a0*r/3,top/3,a1*r/3,top/3];
        if(wall){const b=wall.positions.length/3;for(const p of [...rows[0],...rows[1]])wall.positions.push(...p);wall.uvs.push(...uv);wall.indices.push(b,b+2,b+1,b+1,b+2,b+3);}
        else strip('room_bark',rows,bark).setVerticesData('uv',uv);
      }
      buildApi.addBoxCollider(x+Math.sin(a)*(r-.2),z+Math.cos(a)*(r-.2),Math.PI*r/N+.015,h.wallDepth??(h.city?.98:.22),a,y+top,y+lo);
    }
  }
  // Merged as before (a lone mesh too): the result is hw_room_bark_merged on its
  // own MultiMaterial wrapper, neither casting nor receiving, as the home groups
  // (mergeByKey) have always found it.
  if(wall){const normals:number[]=[];VertexData.ComputeNormals(wall.positions,wall.indices,normals);const vd=new VertexData();Object.assign(vd,{positions:wall.positions,indices:wall.indices,normals,uvs:wall.uvs});
    const m=new Mesh('hw_room_bark',scene);vd.applyToMesh(m);m.material=bark;Mesh.MergeMeshes([m],true,true,undefined,false,true);}
  else Mesh.MergeMeshes(scene.meshes.slice(wallMeshes).filter((m):m is Mesh=>m instanceof Mesh),true,true,undefined,false,true);
  slab('room_floor',x,y,z,r-.12,wood);buildApi.addDisc(x,z,r-.22,y);
  buildApi.addCameraRoom({cx:x,cz:z,r:r-.48,hx:r-.48,hz:r-.48,sin:0,cos:1,y0:y,y1:y+H,...(h.city?{cameraRadius:4.5,cameraTargetHeight:2.1,cameraHideBelow:1.8}:{})});
  // A domed moss cap, carried by living ribs which flow into the wall roots.
  const roof:P[][]=[];
  const rise=h.rise??2;
  for(let j=0;j<=12;j++){const t=j/12,rr=(r+.65)*Math.cos(t*Math.PI/2);const row:P[]=[];for(let i=0;i<=64;i++)row.push(at(i/64*Math.PI*2,rr*(1+.025*Math.sin(i/64*Math.PI*10)),y+H+Math.sin(t*Math.PI/2)*rise));roof.push(row);}
  strip('living_roof',roof,moss);slab('vault_ceiling',x,y+H+.12,z,r+.65,wood);
  if(h.ribs){
    // A hall's ribs stand on its piers (the plan keeps them off every
    // opening), thicker for the larger dome, up the dome's own curve.
    for(const a of h.ribs)grownBranch('roof_rib',[at(a,r+.25,y+.1),at(a,r+.44,y+3.5),at(a,r+.5,y+H),at(a,r*.62,y+H+.825*rise),at(a,.1,y+H+rise)],.36,.12,wood);
    // each arch framed by two buttresses that meet over its crown, outside
    // the wall (a home's door pair leans in to r*.7, which in a hall this
    // wide would come down inside the room)
    for(const o of homeOpenings(h)){if(o.lo>0)continue;
      for(const side of [-1,1])grownBranch('door_buttress',[at(o.a+side*(o.w+.25)/r,r+.15,y),at(o.a+side*(o.w+.32)/r,r+.32,y+o.hi-1.1),at(o.a+side*(o.w*.5)/r,r+.3,y+o.hi+.55),at(o.a,r+.26,y+o.hi+1.05)],.27,.11,wood);}
  }else{
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;if(Math.abs(delta(a,door))*r<doorHalf+.5)continue;grownBranch('roof_rib',[at(a,r+.25,y+.1),at(a,r+.44,y+3.5),at(a,r+.5,y+H),at(a,r*.62,y+H+1.65),at(a,.1,y+H+2)],.28,.09,wood);}
  for(const side of [-1,1])grownBranch('door_buttress',[at(door+side*(doorHalf+.25)/r,r+.15,y),at(door+side*(doorHalf+.35)/r,r+.3,y+2.8),at(door+side*(doorHalf*.75)/r,r+.25,y+4.35),at(door,r*.7,y+5.8)],.25,.1,wood);
  }
  for(const o of openings){
    const angle=o.a,span=o.w/r,pts:P[]=[];
    for(let i=0;i<=24;i++){const q=-1+2*i/24;pts.push(at(angle+q*span,r+.03,y+o.hi-(1-Math.sqrt(Math.max(0,1-q*q)))*1.05));}
    grownBranch('arch', [at(angle-span,r+.03,y+o.lo),...pts,at(angle+span,r+.03,y+o.lo)],.16,.16,wood);
    if(!o.door){
      // Inset amber glass follows the round wall, behind its carved lip.
      const rows:P[][]=[[],[]];for(let i=0;i<=20;i++){const q=-1+2*i/20;rows[0].push(at(angle+q*span,r-.2,y+o.lo));rows[1].push(at(angle+q*span,r-.2,y+o.hi-(1-Math.sqrt(Math.max(0,1-q*q)))*1.05));}
      strip('amber_window',rows,glass);
      grownBranch('inner_arch',[at(angle-span,r-.44,y+o.lo),...pts.map(p=>[x+(p[0]-x)*(r-.44)/(r+.03),p[1],z+(p[2]-z)*(r-.44)/(r+.03)] as P),at(angle+span,r-.44,y+o.lo)],.13,.13,wood);
      const p=at(angle,r+.04,y+o.lo),top=at(angle,r+.04,y+o.hi);grownBranch('window_mullion',[p,top],.055,.045,wood);
      grownBranch('inner_mullion',[at(angle,r-.45,y+o.lo),at(angle,r-.45,y+o.hi)],.055,.045,wood);
      for(const side of [-1,1])grownBranch('window_leaf',[at(angle,r+.07,y+o.lo+.3),at(angle+side*span*.6,r+.07,y+o.lo+1.05),at(angle,r+.07,y+o.hi-.15)],.045,.035,wood);
    }
  }
  // HW_IVY_CARDS: a vine's leaves are almond cards (0.38 x 0.28 m, where the
  // spheres were 0.38 x 0.28 x 0.14) at the same points, facing out from the
  // room, a mesh per leaf colour per home: 0.60 M main-pass triangles at p were
  // ivy spheres (MEASURED 2026-10-07).
  const ivy=new Map<StandardMaterial,{positions:number[];indices:number[]}>();
  for(let i=0;i<13;i++){
    const a=i*2.399;if(Math.abs(delta(a,door))<.6)continue;
    // a hall's vines keep off every arch, not only the door
    if(h.hall&&openings.some(o=>!o.lo&&Math.abs(delta(a,o.a))<o.w/r+.25))continue;
    const p=at(a,r+.2,y+H+.2);place('nature/Fern_1.gltf',p[0],p[1],p[2],a,0,0,.65);
    if(i%2===0){const vines:P[]=[];for(let j=0;j<6;j++)vines.push(at(a+Math.sin(j)*.07,r+.15,y+H+.3-j*.48));grownBranch('ivy',vines,.035,.015,moss);
      const mat=leaves[i%leaves.length];
      if(HW_IVY_CARDS){let c=ivy.get(mat);if(!c)ivy.set(mat,c={positions:[],indices:[]});vines.forEach((q,j)=>ivyCard(c!,q,Math.atan2(q[0]-x,q[2]-z),Math.sin(j*1.7+i)*.5));}
      else for(const q of vines)blob('ivy_leaf',q,[.19,.14,.07],mat);}
  }
  // Made after the loop, so the leaf colours first appear in the order the
  // spheres had them, and merged below like the spheres were (lone too).
  const ivyCards=new Set<Mesh>();
  for(const [mat,c]of ivy){const normals:number[]=[];VertexData.ComputeNormals(c.positions,c.indices,normals);const vd=new VertexData();Object.assign(vd,{positions:c.positions,indices:c.indices,normals});
    const m=new Mesh('hw_ivy_leaf',scene);vd.applyToMesh(m);ivyCards.add(finish(m,mat));}
  // A hall's fittings (heartwood-auction.ts) are grown here, inside the
  // home's window: its hearth lights them and they merge with its walls.
  fit?.();
  const lamp=new PointLight('hw_hearth_light',new Vector3(x,y+HEARTH_LIFT,z),scene);lamp.diffuse=Color3.FromHexString('#ffe0ad');lamp.intensity=h.hearth??(h.city?.55:.85);lamp.range=h.r+HEARTH_REACH;
  if(h.city)lamp.includedOnlyMeshes=scene.meshes.slice(startMesh);
  const front=at(door,r+.7,y);planter(front[0]-Math.cos(door)*(doorHalf+.9),y,front[2]+Math.sin(door)*(doorHalf+.9),wood,leaves);planter(front[0]+Math.cos(door)*(doorHalf+.9),y,front[2]-Math.sin(door)*(doorHalf+.9),wood,leaves);
  if(h.city){
    const c=Math.cos(door),sn=Math.sin(door),atLocal=(lx:number,lz:number)=>[x+lx*c+lz*sn,z-lx*sn+lz*c];
    const furnish=(file:string,lx:number,lz:number,scale:number,hx=0,hz=0,height=0,rot=0)=>{
      const [px,pz]=atLocal(lx,lz);place('moonmere/'+file+'.glb',px,y+.015,pz,door+rot,0,0,scale);
      if(hx)buildApi.addBoxCollider(px,pz,hx*scale+.6,hz*scale+.6,door+rot,y+height*scale,y);
    };
    // a hall is furnished by its own fittings (the counters and the board)
    if(h.hall){}
    else if(!h.civic){
      furnish('home_rug',0,0,1.4);
      furnish('bed',-r*.55,-1.6,1,.6,1.025,.9);
      furnish('home_table',r*.52,-.4,1,.65,.4,1.01);
      furnish('home_chair',r*.52,1.2,1,.285,.28,1.22,Math.PI);
      furnish('home_cupboard',0,-r+1.15,1,.675,.284,2.01);
      furnish('home_chest',-r*.48,1.8,.9,.65,.32,.65);
      furnish('home_herbs',r*.50,-.5,.9);
    }else{
      furnish('bookcase',-r*.6,-2,1,.65,.25,2.2);
      furnish('bench',r*.58,0,1,.925,.35,1.17,Math.PI/2);
      furnish('home_cupboard',r*.25,-r+1.4,1,.675,.284,2.01);
    }
    buildApi.footprint(x,z,r*2,r*2);
    // Merge each home's original static pieces by material; city-scale repetition
    // must not turn dozens of opening patches into thousands of draw calls.
    const parts=scene.meshes.slice(startMesh).filter((m):m is Mesh=>m instanceof Mesh&&m.name.startsWith('hw_'));
    for(const mat of new Set(parts.map(m=>m.material))){const group=parts.filter(m=>m.material===mat);if(group.length>1||ivyCards.has(group[0])){const merged=Mesh.MergeMeshes(group,true,true,undefined,false,true);if(merged)lamp.includedOnlyMeshes.push(merged);}}
    return lamp;
  }
  // Furniture is measured separately in the QA report. Keep a 2.8m entry and turning aisle.
  place('moonmere/home_rug.glb',x,y+.025,z,0,0,0,1.2);
  place('moonmere/bed.glb',x-2.2,y,z-1.3,0,0,0,.85);
  place('moonmere/home_table.glb',x+1.8,y,z-.5,0,0,0,.75);
  place('moonmere/home_chair.glb',x+1.7,y,z+1,Math.PI,0,0,.8);
  place('moonmere/home_cupboard.glb',x+.8,y,z-r+1.0,0,0,0,.8);
  buildApi.addBoxCollider(x-2.2,z-1.3,.51,.88,0,y+.77,y);
  buildApi.addBoxCollider(x+1.8,z-.5,.49,.3,0,y+.76,y);
}
