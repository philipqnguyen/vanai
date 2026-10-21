import {joinHeartwoodFloor} from './heartwood-floors';
import {ZONES} from './data';
import {Mesh, VertexData, type StandardMaterial} from '@babylonjs/core';
import {scene, buildApi, addShadowCaster} from './scene';
import {grownBranch, box, rimRail, planter, type Home, type P} from './heartwood-neighborhood';
type Tree={name:string;x:number;z:number;scale:number;y:number};
export type UpperRing={tree:Tree;y:number;r:number;half:number;homes:Home[]};
export type UpperBridge={name:string;from:string;to:string;a:P;b:P;half:number;sag:number};
export type UpperPlan={rings:UpperRing[];homes:Home[];stair:{foot:P;top:P;landing:P;half:number};bridges:UpperBridge[];bridge:UpperBridge};
let plan:UpperPlan;
const TAU=Math.PI*2,point=(r:UpperRing,a:number,d=r.r):P=>[r.tree.x+Math.sin(a)*d,r.y,r.tree.z+Math.cos(a)*d];
export function planUpperHeartwood(trees:Tree[]):UpperPlan{
 const shared=ZONES.heartwood.sites.upper_boughs;
 const rings:UpperRing[]=shared.decks.filter((d:any)=>d.name&&d.r&&d.holes?.length).map((deck:any)=>{const tree=trees.find(t=>t.name===deck.name)!;const inner=deck.holes[0].r;return {tree,y:deck.y,r:(deck.r+inner)/2,half:(deck.r-inner)/2,homes:[]} as UpperRing;});
 for(const ring of rings)for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,p=point(ring,a,16.5);ring.homes.push({name:`${ring.tree.name} · Upper ${i+1}`,x:p[0],z:p[2],y:ring.y,r:7,door:a,doorHalf:2.3,height:5.5,city:true});}
 const a=rings[0],bridges:UpperBridge[]=shared.ramps.filter((r:any)=>r.from&&r.to).map((r:any)=>({name:r.name,from:r.from,to:r.to,a:[r.x0,r.y0,r.z0],b:[r.x1,r.y1,r.z1],half:r.half,sag:r.sag}));
 const stair=shared.ramps[0],top:P=[stair.x1,stair.y1,stair.z1],landing:P=[a.tree.x-Math.sqrt(a.r*a.r-(top[2]-a.tree.z)**2),a.y,top[2]],foot:P=[stair.x0,stair.y0,stair.z0];
 plan={rings,homes:rings.flatMap(r=>r.homes),stair:{foot,top,landing,half:stair.half},bridges,bridge:bridges[0]};return plan;
}
export const inspectUpperHeartwood=()=>plan;
export function upperBridgePoint(t:number,bridge=plan.bridge):P{const {a,b,sag}=bridge;return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-sag*Math.sin(Math.PI*t)**2,a[2]+(b[2]-a[2])*t];}
function mesh(name:string,positions:number[],indices:number[],uvs:number[],mat:StandardMaterial){const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const vd=new VertexData();Object.assign(vd,{positions,indices,normals,uvs});const m=new Mesh('hw_'+name,scene);vd.applyToMesh(m);m.material=mat;m.isPickable=false;addShadowCaster(m);return m;}
function annulus(r:UpperRing,wood:StandardMaterial){
 const n=224,p:number[]=[],indices:number[]=[],uv:number[]=[];
 for(let j=0;j<=n;j++){const a=j/n*TAU;for(const radius of [r.r-r.half,r.r+r.half])for(const y of [r.y,r.y-.4]){p.push(r.tree.x+Math.sin(a)*radius,y,r.tree.z+Math.cos(a)*radius);uv.push(j/n*TAU*r.r/3,(radius-r.r)/3+(y-r.y));}}
 for(let i=0;i<n;i++){const a=i*4,b=a+4;for(const [c,d,e,f]of [[a,b,a+2,b+2],[a+1,a+3,b+1,b+3],[a,a+1,b,b+1],[a+2,b+2,a+3,b+3]])indices.push(c,e,d,e,f,d);
  const th=(i+.5)/n*TAU,q=point(r,th),len=TAU*r.r/n;buildApi.addDeck(q[0],q[2],len/2+.035,r.half-.012,th,r.y);
 }
 joinHeartwoodFloor(mesh('upper_ring',p,indices,uv,wood),r.y);
 // Board seams are shallow grooves over an unbroken structural deck.
 for(let i=0;i<n;i++){const a=i/n*TAU,p0=point(r,a,r.r-r.half),p1=point(r,a,r.r+r.half);grownBranch('ring_board_seam',[[p0[0],r.y+.006,p0[2]],[p1[0],r.y+.006,p1[2]]],.012,.012,wood);}
}
function flight(wood:StandardMaterial,bark:StandardMaterial){
 const {foot,top,landing,half}=plan.stair,len=Math.hypot(top[0]-foot[0],top[2]-foot[2]),rise=top[1]-foot[1],n=Math.ceil(rise/.18),yaw=Math.atan2(top[0]-foot[0],top[2]-foot[2]),at=(t:number):P=>[foot[0]+(top[0]-foot[0])*t,foot[1]+rise*t,foot[2]+(top[2]-foot[2])*t];
 for(let i=0;i<n;i++){const a=at(i/n),b=at((i+1)/n),m=box('upper_stair_tread',[(a[0]+b[0])/2,b[1]-.17,(a[2]+b[2])/2],[half*2,.34,len/n+.03],wood);m.rotation.y=yaw;joinHeartwoodFloor(m,b[1]);buildApi.addRamp(a[0],a[2],a[1],b[0],b[2],b[1],half,.015,'heartwood upper stair');buildApi.addStairBody(a[0],a[2],a[1],b[0],b[2],b[1],half,.45,'heartwood upper stair');}
 const landingLength=landing[0]-top[0],landingMesh=box('upper_stair_landing',[(top[0]+landing[0])/2,top[1]-.2,top[2]],[landingLength+.1,.4,(half+1)*2],wood);
 joinHeartwoodFloor(landingMesh,top[1]);
 buildApi.addDeck((top[0]+landing[0])/2,top[2],landingLength/2+.05,half+1,0,top[1]);
 for(const side of [-1,1]){const pts=Array.from({length:40},(_,i):P=>{const p=at(i/39);return[p[0]+Math.cos(yaw)*half*side,p[1],p[2]-Math.sin(yaw)*half*side];});rimRail('upper_stair',pts,wood);grownBranch('stair_stringer',pts.map(p=>[p[0],p[1]-.35,p[2]]),.36,.36,bark);}
 // A forked trestle carries the long flight; its feet avoid the road underneath.
 for(const t of [.28,.76]){const p=at(t);for(const side of [-1,1]){const px=p[0]+Math.cos(yaw)*side*(half-.2),pz=p[2]-Math.sin(yaw)*side*(half-.2),y=buildApi.surface(px,pz);grownBranch('upper_stair_trestle',[[px,y-.4,pz],[px,y+(p[1]-y)*.5,pz],[px,p[1]-.35,pz]],.38,.24,bark);buildApi.addBoxCollider(px,pz,.38,.38,0,p[1]-.4,y);}}
}
function ropeBridge(bridge:UpperBridge,wood:StandardMaterial,rope:StandardMaterial,bark:StandardMaterial){
 const at=(t:number)=>upperBridgePoint(t,bridge),surfaceGroup=`heartwood rope bridge ${bridge.name}`;
 const {a,b,half}=bridge,len=Math.hypot(b[0]-a[0],b[2]-a[2]),dx=(b[0]-a[0])/len,dz=(b[2]-a[2])/len,n=Math.ceil(len/.48),yaw=Math.atan2(dx,dz);
 // A continuous deck skin closes plank joints and shares the movement profile.
 const p:number[]=[],uv:number[]=[],ix:number[]=[];
 for(let i=0;i<=n;i++){const q=at(i/n);for(const side of [-1,1]){p.push(q[0]+dz*side*half,q[1]-.018,q[2]-dx*side*half);uv.push(side,i/n*len/3);}}
 for(let i=0;i<n;i++){const a=at(i/n),b=at((i+1)/n),q=i*2;ix.push(q,q+2,q+1,q+1,q+2,q+3);const m=box('suspension_plank',[(a[0]+b[0])/2,(a[1]+b[1])/2-.13,(a[2]+b[2])/2],[half*2,.26,len/n-.012],wood);m.rotation.set(-Math.atan2(b[1]-a[1],len/n),yaw,0);buildApi.addRamp(a[0],a[2],a[1],b[0],b[2],b[1],half,.025,surfaceGroup);buildApi.addStairBody(a[0],a[2],a[1],b[0],b[2],b[1],half,.32,surfaceGroup);}
 mesh('suspension_deck',p,ix,uv,wood);
 // Fan-shaped boarding aprons fill the outside wedges of each curved ring join.
 for(const end of [0,1]){
  const sign=end===0?1:-1,start=at(end),finish=at(end+sign*4.5/len),verts:number[]=[],uvs:number[]=[],idx:number[]=[];
  for(const [q,w]of [[start,4.7],[finish,half]] as [P,number][])for(const side of [-1,1])for(const y of [24,23.68]){verts.push(q[0]+dz*side*w,y,q[2]-dx*side*w);uvs.push(side,q[0]/3);}
  for(const [a,b,c,d]of [[0,4,2,6],[1,3,5,7],[0,1,4,5],[2,6,3,7],[0,2,1,3],[4,5,6,7]])idx.push(a,b,c,c,b,d);
  if(end===1)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  joinHeartwoodFloor(mesh('bridge_boarding_apron',verts,idx,uvs,wood),24);
  for(let i=0;i<12;i++){const t=(i+.5)/12,q=at(end+sign*t*4.5/len);buildApi.addDeck(q[0],q[2],4.7+(half-4.7)*t,4.5/24+.025,yaw,24);}
 }

 // Rail endpoints and suspension anchors share the same two end planes.
 // Extending the original t=0..1 cables beyond these posts left bare ends
 // hanging over the circular walks.
 const endT=3.8/len,lastT=1-endT;
 for(const side of [-1,1]){
  const rail:P[]=[],cable:P[]=[],toe:P[]=[];
  for(let i=0;i<=40;i++){
   const t=endT+(lastT-endT)*i/40,q=at(t),x=q[0]+dz*side*half,z=q[2]-dx*side*half;
   const nearEnd=Math.min((t-endT)*len,(lastT-t)*len),offset=half-.06+.56*Math.max(0,1-nearEnd/3),cx=q[0]+dz*side*offset,cz=q[2]-dx*side*offset,cy=29.1-4*Math.sin(Math.PI*t)**2;
   rail.push([x,q[1]+1.12,z]);toe.push([x,q[1]+.22,z]);cable.push([cx,cy,cz]);
   if(i>0&&i<40&&i%2===0)grownBranch('suspension_hanger',[[x,q[1]-.16,z],[cx,cy,cz]],.045,.045,rope);
   if(i){const old=at(endT+(lastT-endT)*(i-1)/40);buildApi.addBoxCollider((old[0]+q[0])/2+dz*side*half,(old[2]+q[2])/2-dx*side*half,.09,(lastT-endT)*len/80+.025,yaw,Math.max(old[1],q[1])+1.3,Math.min(old[1],q[1])-.3);}
  }
  grownBranch('rope_handrail',rail,.08,.08,rope);grownBranch('suspension_cable',cable,.14,.14,rope);grownBranch('rope_toe_rail',toe,.07,.07,rope);
  for(const end of [0,1]){
   const t=end===0?endT:lastT,q=at(t),x=q[0]+dz*side*(half+.5),z=q[2]-dx*side*(half+.5),top=29.1-4*Math.sin(Math.PI*t)**2;
   if(side===-1){const crossbeam=box('bridge_anchor_beam',[q[0],q[1]-.4,q[2]],[7.2,.5,.65],wood);crossbeam.rotation.y=yaw;}
   grownBranch('anchor_crosspin',[[x-dz*.7,top,z+dx*.7],[x+dz*.7,top,z-dx*.7]],.14,.14,bark);
   grownBranch('bridge_anchor_post',[[x,q[1]-.8,z],[x,q[1]+2.1,z],[x,top+.35,z]],.35,.23,bark);buildApi.addBoxCollider(x,z,.38,.38,0,top+.3,q[1]-.5);
   // Anchor stays at the outer rim, clear of the ring's walking lanes.
   const toward=end===0?-1:1,anchor=at(end),ax=anchor[0]-dx*toward*2.1+dz*side*4,az=anchor[2]-dz*toward*2.1-dx*side*4;
   grownBranch('bridge_backstay',[[x,top,z],[ax,24.12,az]],.13,.13,rope);
   const cleat=box('backstay_deck_anchor',[ax,24.06,az],[.65,.18,.7],bark);cleat.rotation.y=yaw;
   for(let k=0;k<4;k++){const loop:P[]=Array.from({length:21},(_,i)=>[x+Math.sin(i/20*TAU)*.36,top-.2+k*.10,z+Math.cos(i/20*TAU)*.36]);grownBranch('anchor_lashing',loop,.045,.045,rope);}
  }
 }

}
export function buildUpperHeartwood(wood:StandardMaterial,bark:StandardMaterial,leaves:StandardMaterial[],rope:StandardMaterial){
 const delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 for(const ring of plan.rings){annulus(ring,wood);
  const exits=plan.bridges.filter(b=>b.from===ring.tree.name||b.to===ring.tree.name).map(bridge=>{const end=bridge.from===ring.tree.name?0:1,p=end?bridge.b:bridge.a;return{a:Math.atan2(p[0]-ring.tree.x,p[2]-ring.tree.z),gap:3.5,bridge,end};});
  const stairA=Math.atan2(plan.stair.top[0]-ring.tree.x,plan.stair.top[2]-ring.tree.z);

  for(const side of [-1,1]){let run:P[]=[];for(let i=0;i<=224;i++){const a=i/224*TAU,doorGap=side<0&&ring.homes.some(h=>Math.abs(delta(a,h.door!))*ring.r<3.15),exitGap=side>0&&(exits.some(e=>Math.abs(delta(a,e.a))*ring.r<e.gap)||ring===plan.rings[0]&&Math.abs(delta(a,stairA))*ring.r<3.6);
    if(doorGap||exitGap){if(run.length>1)rimRail('upper_ring',run,wood);run=[];}else run.push(point(ring,a,ring.r+side*(ring.half-.12)));}
   if(run.length>1)rimRail('upper_ring',run,wood);
  }
  // Close the corners where a straight landing meets the curved outer guard.
  for(const exit of [...exits,...(ring===plan.rings[0]?[{a:stairA,gap:3.6,bridge:null,end:0}]:[])])for(const side of [-1,1]){
   const step=TAU/224,edge=exit.a+side*exit.gap/ring.r,aa=(side>0?Math.ceil(edge/step):Math.floor(edge/step))*step,p=point(ring,aa,ring.r+ring.half-.12);
   let q:P;
   if(exit.bridge){const br=exit.bridge,along=3.8/Math.hypot(br.b[0]-br.a[0],br.b[2]-br.a[2]),t=exit.end?1-along:along,bp=upperBridgePoint(t,br);q=[bp[0]+Math.cos(exit.a)*side*br.half,bp[1],bp[2]-Math.sin(exit.a)*side*br.half];}
   else q=[plan.stair.top[0],ring.y,plan.stair.top[2]+side*plan.stair.half];
   rimRail('upper_exit_corner',[p,q],wood);
   if(exit.bridge){grownBranch('bridge_rail_terminal',[q,[q[0],q[1]+1.12,q[2]]],.12,.09,wood);buildApi.addBoxCollider(q[0],q[2],.12,.12,0,q[1]+1.2,q[1]-.3);}
  }
  for(const h of ring.homes){const a=h.door!,start=point(ring,a,16.5+h.r-.5),end=point(ring,a,ring.r),len=Math.hypot(end[0]-start[0],end[2]-start[2]),m=box('upper_door_landing',[(start[0]+end[0])/2,ring.y-.2,(start[2]+end[2])/2],[5.6,.4,len+.1],wood);m.rotation.y=a;joinHeartwoodFloor(m,ring.y);buildApi.addDeck((start[0]+end[0])/2,(start[2]+end[2])/2,2.8,len/2+.05,a,ring.y);
   for(const side of [-1,1]){const p=point(ring,a,24.1);planter(p[0]+Math.cos(a)*side*3.1,ring.y,p[2]-Math.sin(a)*side*3.1,wood,leaves,a);}
  }
 }
 flight(wood,bark);for(const bridge of plan.bridges)ropeBridge(bridge,wood,rope,bark);
}
