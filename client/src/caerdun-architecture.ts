// Caerdun's original modular kit. House geometry and gameplay levels share these
// dimensions; no global scaling of the furniture, doors or player is involved.
import { buildApi, terrainMeshHeight } from './scene';
import { place, makeFlight, type HouseSpec, type HouseRecord } from './town';
export const CAERDUN_STOREY = 3.4;
export const CAERDUN_STAIR_RUN = 5.6;
const INNER = .32;
export function caerdunModule(file:string):string|null {
  if(file.startsWith('caerdun/'))return file;
  if(file==='Stairs_Exterior_Platform')return 'caerdun/quay.glb';
  // This source piece has its 2m axis along Z; our foundation is along X.
  if(file==='Stairs_Exterior_SingleSideThick')return 'caerdun/foundation.glb';
  if(file.startsWith('Wall_'))return `caerdun/tower_${file.includes('_Door_')?'door':file.includes('Window')?'window':'plain'}.glb`;
  if(file.startsWith('Window_')||file.startsWith('DoorFrame_')||file.startsWith('Corner_'))return null;
  if(/^Door_\d/.test(file))return 'caerdun/door.glb';
  if(file==='Stairs_Exterior_Straight_R')return null;
  if(file.startsWith('Stairs_Exterior_Straight'))return 'caerdun/exterior_stairs.glb';
  if(file==='Prop_Chimney')return 'caerdun/chimney.glb';
  return file;
}
export function caerdunDoorFoot(h:HouseSpec):[number,number] {
  const face=typeof h.door==='string'?h.door:'pz',end=face==='pz'||face==='nz',length=end?h.span:h.len;
  const a=-length/2+1+Math.floor(length/4)*2;
  const [x,z]=face==='pz'?[a,h.len/2+2.6]:face==='nz'?[-a,-h.len/2-2.6]:face==='px'?[h.span/2+2.6,-a]:[-h.span/2-2.6,a];
  const c=Math.cos(h.yaw),s=Math.sin(h.yaw);return [h.cx+x*c+z*s,h.cz-x*s+z*c];
}
export function makeCaerdunHouse(s:HouseSpec):HouseRecord {
  const hw=s.span/2,hl=s.len/2,seed=s.seed??0,c=Math.cos(s.yaw),sn=Math.sin(s.yaw);
  const xf=(x:number,z:number):[number,number]=>[s.cx+x*c+z*sn,s.cz-x*sn+z*c];
  const put=(name:string,x:number,y:number,z:number,yaw=0,axes?:[number,number,number])=>{const [wx,wz]=xf(x,z);place(`caerdun/${name}.glb`,wx,y,wz,s.yaw+yaw,0,0,1,undefined,axes);};
  const block=(name:string,x:number,y:number,z:number,w:number,h:number,d:number)=>put(name,x,y,z,0,[w,h,d]);
  const face=s.door===false?null:typeof s.door==='string'?s.door:'pz';
  const faces=[{id:'pz',n:[0,1],u:[1,0],yaw:0,len:s.span,at:hl},{id:'nz',n:[0,-1],u:[-1,0],yaw:Math.PI,len:s.span,at:hl},{id:'px',n:[1,0],u:[0,-1],yaw:Math.PI/2,len:s.len,at:hw},{id:'nx',n:[-1,0],u:[0,1],yaw:-Math.PI/2,len:s.len,at:hw}];
  const df=faces.find(f=>f.id===face),doorA=df?(-df.len/2+1+Math.floor(df.len/4)*2):0;
  const dx=df?df.n[0]*df.at+df.u[0]*doorA:0,dz=df?df.n[1]*df.at+df.u[1]*doorA:hl;
  let high=-Infinity;
  for(let x=-hw;x<=hw;x+=1)for(let z=-hl;z<=hl;z+=1){const q=xf(x,z);high=Math.max(high,buildApi.surface(...q));}
  const dq=xf(dx+(df?.n[0]??0)*2.6,dz+(df?.n[1]??1)*2.6);
  const y0=s.y??Math.max(high+.16,buildApi.surface(...dq)+(s.raise??1));
  const record:HouseRecord={spec:s,y0,walkable:!!face,door:null,stairs:[]};
  const wallCollider=(x:number,z:number,hx:number,hz:number,yaw:number,bottom:number,top:number)=>{const q=xf(x,z);buildApi.addBoxCollider(...q,hx,hz,s.yaw+yaw,top,bottom);};
  // Closed foundation ring stays below the finished floor and follows the pad.
  for(const f of faces)for(let i=0;i<f.len/2;i++){
    const a=-f.len/2+1+2*i,x=f.n[0]*(f.at-.14)+f.u[0]*a,z=f.n[1]*(f.at-.14)+f.u[1]*a,q=xf(x,z),g=buildApi.surface(...q)-.15;
    put('stone',x,g,z,f.yaw,[2,y0-.02-g,.36]);
  }
  const stairX=hw-1.55,stairEnd=-hl+3.2,stairStart=stairEnd+CAERDUN_STAIR_RUN,wellLeft=hw-2.8;
  const hasStairs=s.storeys>1&&s.len>=12;
  const variant=seed%4,pitch=seed%3===0?85:105;
  for(let st=0;st<s.storeys;st++){
    const y=y0+st*CAERDUN_STOREY;
    for(const f of faces)for(let i=0;i<f.len/2;i++){
      const a=-f.len/2+1+2*i,x=f.n[0]*f.at+f.u[0]*a,z=f.n[1]*f.at+f.u[1]*a;
      const isDoor=st===0&&f.id===face&&Math.abs(a-doorA)<.01;
      const isWindow=(i+st+seed)%3!==0;
      put(`wall_${st===0?0:variant===0?1:variant}_${isDoor?'door':isWindow?'window':'plain'}`,x,y,z,f.yaw);
      if(isDoor){
        put('door',x-f.u[0]*.945-f.n[0]*.05,y,z-f.u[1]*.945-f.n[1]*.05,f.yaw+Math.PI/2);
        if(seed%3!==1)put('porch',x,y,z,f.yaw);
      }
    }
    // Corner posts close the joints of perpendicular wall bays.
    for(const x of [-hw,hw])for(const z of [-hl,hl])block('beam',x,y,z,.20,CAERDUN_STOREY,.20);
    const floor=(xa:number,xb:number,za:number,zb:number)=>{if(xb>xa&&zb>za)block('floor',(xa+xb)/2,y,(za+zb)/2,xb-xa,1,zb-za);};
    if(st===0||!hasStairs)floor(-hw+INNER,hw-INNER,-hl+INNER,hl-INNER);
    else {floor(-hw+INNER,wellLeft,-hl+INNER,hl-INNER);floor(wellLeft,hw-INNER,-hl+INNER,stairEnd);floor(wellLeft,hw-INNER,stairStart+.1,hl-INNER);}
    const hole=xf((wellLeft+hw-INNER)/2,(stairEnd+stairStart+.1)/2);
    buildApi.addDeck(s.cx,s.cz,hw-INNER,hl-INNER,s.yaw,y,st>0&&hasStairs?[buildApi.obb(...hole,(hw-INNER-wellLeft)/2,(CAERDUN_STAIR_RUN+.1)/2,s.yaw)]:[]);
    if(hasStairs&&st<s.storeys-1){
      put('stairs',stairX,y,stairStart);const a=xf(stairX,stairStart),b=xf(stairX,stairEnd);
      buildApi.addRamp(...a,y,...b,y+CAERDUN_STOREY,1.08);buildApi.addStairBody(...a,y,...b,y+CAERDUN_STOREY,1.08,.20);record.stairs.push([...a,y,...b,y+CAERDUN_STOREY]);
      // Closed stringer-side collision keeps players off the stair edges.
      for(const side of [-1,1])wallCollider(stairX+side*1.095,(stairStart+stairEnd)/2,.04,2.8,0,y-.1,y+4.4);
    }
    if(st>0&&hasStairs){
      for(let i=0;i<3;i++)put('rail',wellLeft,y,stairEnd+(i+.5)*CAERDUN_STAIR_RUN/3,Math.PI/2,[CAERDUN_STAIR_RUN/6,1,1]);
      wallCollider(wellLeft,(stairEnd+stairStart)/2,.05,CAERDUN_STAIR_RUN/2,0,y-.05,y+1.1);
      if(st===s.storeys-1){put('rail',(wellLeft+hw-INNER)/2,y,stairStart+.1,0,[(hw-INNER-wellLeft)/2,1,1]);wallCollider((wellLeft+hw-INNER)/2,stairStart+.1,(hw-INNER-wellLeft)/2,.05,0,y-.05,y+1.1);}
    }
    // Furnish the left side, keeping a broad central route and the landing clear.
    if(s.span>=8){
      const fx=-hw+2;
      // The court's ground floor is reserved for the three shared wage volumes.
      if(st===0&&seed!==603){put('table',fx,y,hl-3);wallCollider(fx,hl-3,1.08,1.12,0,y-.05,y+.82);if(s.len>=16&&face!=='nx'){put('table',fx,y,.1);wallCollider(fx,.1,1.08,1.12,0,y-.05,y+.82);}}
      else if(st>0){put(seed%3===0?'shelf':'bed',fx,y,0);wallCollider(fx,0,seed%3===0?.95:.8,seed%3===0?.24:1.08,0,y-.05,y+(seed%3===0?2.2:.7));}
      put('shelf',-hw+1.7,y,-hl+.7);wallCollider(-hw+1.7,-hl+.7,.95,.23,0,y-.05,y+2.2);
    }
    const ceilingY=y+CAERDUN_STOREY;
    for(let z=-hl+1;z<hl;z+=2.4)block('beam',(-hw+wellLeft)/2,ceilingY-.30,z,wellLeft+hw-.4,.12,.17);
  }
  const top=y0+s.storeys*CAERDUN_STOREY;
  block('ceiling',0,top,0,s.span-INNER*2,1,s.len-INNER*2);
  for(let i=0;i<s.len/2;i++)put(`roof_${s.span}_${pitch}`,0,top,-hl+1+i*2);
  for(const side of [-1,1]){put(`roof_${s.span}_${pitch}`,0,top,side*(hl+.2),0,[1,1,.2]);put(`gable_${s.span}_${pitch}`,0,top,side*(hl+.05),side<0?Math.PI:0);}
  if(seed%3===1)put('dormer',hw*.63,top+(hw+.45-hw*.63)*pitch/100-.65,0,Math.PI/2);
  if(s.chimney!==false)put('chimney',hw*.52,top+(hw+.45-hw*.52)*pitch/100-.15,-hl+2);
  // Door gaps belong only to the ground floor. Upper floors remain solid.
  for(const f of faces){
    if(f.id!==face){wallCollider(f.n[0]*f.at,f.n[1]*f.at,f.len/2,.19,f.yaw,-1e9,top);continue;}
    for(const [a,b] of [[-f.len/2,doorA-.925],[doorA+.925,f.len/2]]){const mid=(a+b)/2;wallCollider(f.n[0]*f.at+f.u[0]*mid,f.n[1]*f.at+f.u[1]*mid,(b-a)/2,.19,f.yaw,-1e9,top);}
    wallCollider(dx,dz,.925,.19,f.yaw,y0+2.5,top);
  }
  buildApi.addCameraRoom({...buildApi.obb(s.cx,s.cz,hw-INNER,hl-INNER,s.yaw),y0,y1:top});
  if(df){const q=xf(dx,dz),yaw=s.yaw+df.yaw;record.door=[...q,y0,yaw];buildApi.addDeck(...q,1,.7,yaw,y0);put('floor',dx,y0,dz,df.yaw,[2,1,1.4]);makeFlight(...q,yaw,y0,s.steps==='wide'?3:1);}
  const fi=Math.min(hw,hl)-.7;buildApi.addFlatZone(s.cx-fi,s.cx+fi,s.cz-fi,s.cz+fi,y0);buildApi.footprint(s.cx,s.cz,s.span,s.len);
  return record;
}

import { Mesh, VertexData, PBRMaterial, Texture } from '@babylonjs/core';
import { scene, addShadowCaster } from './scene';
import type { TowerSpec } from './town';
// A convex floor clipped around the exact stairwell: no concentric overlapping
// tiles, no bare wedges at a circular wall and no floor spanning the stairs.
function towerFloor(cx:number,cz:number,r:number,y:number,hole:{cx:number;cz:number;hx:number;hz:number;yaw:number}|null):void {
  const vertices:number[]=[],indices:number[]=[],uv:number[]=[];
  const yaw=hole?.yaw??0,c=Math.cos(yaw),s=Math.sin(yaw),hx=hole?.cx??cx,hz=hole?.cz??cz;
  const polygon=Array.from({length:80},(_,i)=>{const x=cx+Math.cos(i*Math.PI/40)*r-hx,z=cz+Math.sin(i*Math.PI/40)*r-hz;return [x*c-z*s,x*s+z*c];});
  const clip=(poly:number[][],axis:number,edge:number,sign:number)=>{const out:number[][]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;};
  const patches=hole?[
    clip(polygon,0,-hole.hx,-1),clip(polygon,0,hole.hx,1),
    clip(clip(clip(polygon,0,-hole.hx,1),0,hole.hx,-1),1,-hole.hz,-1),
    clip(clip(clip(polygon,0,-hole.hx,1),0,hole.hx,-1),1,hole.hz,1),
  ]:[polygon];
  for(const p of patches){if(p.length<3)continue;const off=vertices.length/3;for(const [x,z] of p){const wx=hx+x*c+z*s,wz=hz-x*s+z*c;vertices.push(wx,y,wz);uv.push(wx/2.7,wz/2.7);}for(let i=1;i<p.length-1;i++)indices.push(off,off+i+1,off+i);}
  // Extrude each triangulated patch down to give the camera a real ceiling.
  const topN=vertices.length/3,topIndices=[...indices];
  for(let i=0;i<topN;i++){vertices.push(vertices[i*3],y-.18,vertices[i*3+2]);uv.push(uv[i*2],uv[i*2+1]);}
  for(let i=0;i<topIndices.length;i+=3)indices.push(topIndices[i]+topN,topIndices[i+2]+topN,topIndices[i+1]+topN);
  let po=0;for(const p of patches){if(p.length<3)continue;for(let i=0;i<p.length;i++){const a=po+i,b=po+(i+1)%p.length;indices.push(a,b,b+topN,a,b+topN,a+topN);}po+=p.length;}
  const normals:number[]=[];VertexData.ComputeNormals(vertices,indices,normals);
  const m=new Mesh(`Caerdun tower floor ${cx},${cz}/${y}`,scene),vd=new VertexData();vd.positions=vertices;vd.indices=indices;vd.normals=normals;vd.uvs=uv;vd.applyToMesh(m);
  let mat=scene.getMaterialByName('Caerdun tower floor') as PBRMaterial|null;
  if(!mat){mat=new PBRMaterial('Caerdun tower floor',scene);mat.albedoTexture=new Texture('/models/caerdun/granite.png',scene);mat.roughness=.86;mat.metallic=0;mat.backFaceCulling=false;}
  m.material=mat;m.receiveShadows=true;addShadowCaster(m);
}
type CaerdunTowerOpening={index:number;level:number};
export function makeCaerdunTower(s:TowerSpec):{top:number;R:number;y0:number} {
  const n=Math.max(8,Math.round(2*Math.PI*s.r/2)),R=n/Math.PI;
  const door=s.door??0,doorIndex=((Math.round(door/Math.PI/2*n)%n)+n)%n,angle=doorIndex/n*Math.PI*2;
  const at=(th:number,r:number):[number,number]=>[s.cx+Math.sin(th)*r,s.cz+Math.cos(th)*r];
  let highest=-Infinity;
  for(let x=-R;x<=R;x+=1)for(let z=-R;z<=R;z+=1)if(Math.hypot(x,z)<R)highest=Math.max(highest,buildApi.surface(s.cx+x,s.cz+z));
  const dq=at(s.plain?0:angle,R+2.6),y0=s.y??Math.max(highest+.16,buildApi.surface(...dq)+1),top=y0+s.storeys*CAERDUN_STOREY;
  const put=(name:string,x:number,y:number,z:number,yaw=0,axes?:[number,number,number])=>place(`caerdun/${name}.glb`,x,y,z,yaw,0,0,1,undefined,axes);
  // (The old city's ramparts deferred this closure to cut real upper doors; that
  // city and its survey are gone, ruling CF-21, so every tower closes as built.)
  const shell={cx:s.cx,cz:s.cz,R,y0,storeys:s.storeys,n,openings:[] as CaerdunTowerOpening[],close:()=>{}};
  let closed=false;
  shell.close=()=>{
    if(closed)return;closed=true;
    for(let i=0;i<n;i++){
      const th=i/n*Math.PI*2,[x,z]=at(th,R);
      // A sharp terrace brow can sit above its triangulated visible surface.
      // Seat the whole panel on the lowest rendered corner, not just its centre.
      let g=Infinity;
      for(const along of [-1.04,0,1.04])for(const across of [-.22,0,.22]){
        const px=x+Math.cos(th)*along+Math.sin(th)*across,pz=z-Math.sin(th)*along+Math.cos(th)*across;
        g=Math.min(g,buildApi.ground(px,pz),terrainMeshHeight(px,pz));
      }
      g-=.2;
      put('stone',x,g,z,th,[2.03,y0-g,.38]);
      for(let st=0;st<s.storeys;st++){
        const y=y0+st*CAERDUN_STOREY,isDoor=(st===0&&i===doorIndex)||shell.openings.some(o=>o.index===i&&o.level===st);
        put(`wall_0_${isDoor?'door':i%3===st%3?'window':'plain'}`,x,y,z,th,[1.02,1,1]);
        if(isDoor)buildApi.addBoxCollider(x,z,.925,.20,th,y+CAERDUN_STOREY-.03,y+2.5);
        else buildApi.addBoxCollider(x,z,1.03,.20,th,y+CAERDUN_STOREY-.03,st?y:-1e9);
      }
      put('stone',x,top,z,th,[2.04,.85,.6]);
      if(i%2===0)put('stone',x,top+.85,z,th,[1.12,.8,.65]);
      buildApi.addBoxCollider(x,z,1.03,.30,th,top+1.7,top-.08);
    }
  };
  shell.close();
  const [entryX,entryZ]=at(angle,R);
  put('door',entryX-Math.cos(angle)*.945,y0,entryZ+Math.sin(angle)*.945,angle+Math.PI/2);
  buildApi.addDeck(entryX,entryZ,1,.7,angle,y0);makeFlight(entryX,entryZ,angle,y0,1);
  // Gate doors face the passage; their stair stack keeps a fixed orientation
  // so rotating an entry never pushes a flight into the adjoining curtain.
  const stairAngle=s.plain?(Math.sin(angle)>.7?Math.PI:0):angle;
  const radial=R-2.5,flights=[];
  for(let st=0;st<s.storeys;st++){
    const th=stairAngle+Math.PI/2+st*Math.PI/2,y=y0+st*CAERDUN_STOREY;
    const middle=at(th,radial),yaw=th+Math.PI/2,c=Math.cos(yaw),sn=Math.sin(yaw);
    const a:[number,number]=[middle[0]+sn*2.8,middle[1]+c*2.8],b:[number,number]=[middle[0]-sn*2.8,middle[1]-c*2.8];
    put('stairs',a[0],y,a[1],yaw);
    buildApi.addRamp(...a,y,...b,y+CAERDUN_STOREY,1.08);buildApi.addStairBody(...a,y,...b,y+CAERDUN_STOREY,1.08,.20);
    const hole={cx:middle[0],cz:middle[1],hx:1.25,hz:2.8,yaw};flights.push(hole);
    for(const side of [-1,1]){
      for(let i=0;i<3;i++)put('rail',middle[0]+c*side*1.25+sn*(i-1)*5.6/3,y+CAERDUN_STOREY,middle[1]-sn*side*1.25+c*(i-1)*5.6/3,yaw+Math.PI/2,[5.6/6,1,1]);
      buildApi.addBoxCollider(middle[0]+c*side*1.25,middle[1]-sn*side*1.25,.045,2.8,yaw,y+CAERDUN_STOREY+1.08,y+CAERDUN_STOREY-.08);
      buildApi.addBoxCollider(middle[0]+c*side*1.095,middle[1]-sn*side*1.095,.04,2.8,yaw,y+4.4,y-.08);
    }
  }
  for(let st=0;st<=s.storeys;st++){
    const y=y0+st*CAERDUN_STOREY,hole=st?flights[st-1]:null;
    towerFloor(s.cx,s.cz,R-.1,y,hole);buildApi.addDisc(s.cx,s.cz,R+.15,y,hole?[buildApi.obb(hole.cx,hole.cz,hole.hx,hole.hz,hole.yaw)]:[]);
  }
  buildApi.addCameraRoom({...buildApi.obb(s.cx,s.cz,R-INNER,R-INNER,0),r:R-INNER,y0,y1:top});
  buildApi.addFlatZone(s.cx-R*.55,s.cx+R*.55,s.cz-R*.55,s.cz+R*.55,y0);buildApi.footprint(s.cx,s.cz,R*2,R*2);
  return {top,R,y0};
}
