import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const config=JSON.parse(fs.readFileSync(new URL('../../shared/data/ferry.json',import.meta.url)));
const source=fs.readFileSync(new URL('../src/ferry-clock.ts',import.meta.url),'utf8').replace("import config from '@data/ferry.json';",`const config=${JSON.stringify(config)};`).replaceAll('import.meta.env.DEV','false');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ferryPose,ferryPhase,ferryMotion,ferryCountdown,syncFerryClock,ferryNow}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('600 second shared departures and 420 second crossings at exact boundaries',()=>{for(const base of[0,600,1727184000]){assert.equal(ferryPhase(base+419.999).docked,false);assert.equal(ferryPhase(base+420).docked,true);assert.equal(ferryPhase(base+599.999).docked,true);assert.equal(ferryPhase(base+600).docked,false);assert.equal(ferryPhase(base+599).next_departure,base+600);}});
test('approach and departure converge on the same dock without an independent timer',()=>{assert.deepEqual(ferryMotion(500),{offset:0,visible:true,phase:'docked'});assert.equal(ferryMotion(600).offset,0);assert.ok(ferryMotion(610).offset>0);assert.equal(ferryMotion(700).visible,false);assert.equal(ferryMotion(1010).offset,ferryMotion(610).offset);assert.equal(ferryMotion(1020).offset,0);});
test('countdowns clamp and round up; server sync replaces an incorrect wall clock',()=>{assert.equal(ferryCountdown(600,599.1),'0:01');assert.equal(ferryCountdown(600,601),'0:00');assert.equal(ferryCountdown(1020,600),'7:00');syncFerryClock(500);assert.ok(Math.abs(ferryNow()-500)<.1);syncFerryClock(600);assert.ok(Math.abs(ferryNow()-600)<.1);});

// the poses every port had before ports could carry a `departure` (2026-10-09): a port without one must
// still produce exactly these
function legacyPose(now,port){
 const motion=ferryMotion(now),berth=config.ports[port].ship;
 const along=motion.phase==='approaching'?-motion.offset:motion.offset;
 const outward=along*along/220,turn=2*along/220,c=Math.cos(berth.yaw),s=Math.sin(berth.yaw),side=berth.seaward;
 const dx=c+s*side*turn,dz=-s+c*side*turn;
 return{...motion,x:berth.x+c*along+s*side*outward,z:berth.z-s*along+c*side*outward,yaw:Math.atan2(-dz,dx)};
}
// every sampled moving pose, departing or approaching, whatever window the port's routes give it
const moving=(port)=>{const out=[];for(let t=.01;t<config.crossing;t+=.17){const p=ferryPose(t,port);if(p.visible&&p.phase!=='docked')out.push(t);}return out;};

test('both ports travel bow-first and hold the berth through the dwell',()=>{
 for(const port of Object.keys(config.ports)){
  const berth=config.ports[port].ship;
  for(const time of moving(port)){
   // the last sample of a window may have nowhere further to go: measure its motion from just before instead
   const p=ferryPose(time,port),n=ferryPose(time+.001,port),[a,c]=n.visible&&(n.x!==p.x||n.z!==p.z)?[p,n]:[ferryPose(time-.001,port),p];
   const dx=c.x-a.x,dz=c.z-a.z;
   const dot=(Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz)/Math.hypot(dx,dz);
   assert.ok(p.visible&&dot>.99999,`bow not aligned at ${port} ${time}`);
  }
  // leaves from rest and arrives at rest: the first and last centimetres are the berth's
  const a=ferryPose(1e-3,port),b=ferryPose(config.crossing-1e-3,port);
  assert.ok(Math.hypot(a.x-berth.x,a.z-berth.z)<.01&&Math.hypot(b.x-berth.x,b.z-berth.z)<.01);
  for(const time of [420,500,599.999,600]){const p=ferryPose(time,port);assert.equal(p.x,berth.x);assert.equal(p.z,berth.z);assert.ok(Math.abs(p.yaw-berth.yaw)<1e-9);}
  // out at sea it is hidden, between its departure window and the approach
  const m=moving(port),gap=m.findIndex((t,i)=>i>0&&t-m[i-1]>1),out=m[gap-1]+.2,back=m[gap]-.2;
  assert.ok(gap>0&&out<back,`${port} has no time at sea`);
  for(const time of [out,(out+back)/2,back])assert.equal(ferryPose(time,port).visible,false,`${port} ${time}`);
 }
});

test('caerdunfields sails exactly the curve it always has',()=>{
 for(let time=-600;time<1200;time+=.37)assert.deepEqual(ferryPose(time,'caerdunfields'),legacyPose(time,'caerdunfields'));
});

// THE SHORES' SHIP AND THE CITY ACROSS THE WATER (Philip, 2026-10-09: it "leaves and sails right into the
// silhouette"). The hull as a box over its MEASURED extent (scene.ts: 3.9x Ship_Large is 60 m long and
// 20.7 m in the beam; the bowsprit reaches 36 m ahead of the origin, the stern 30 behind, LOOKED from above).
const HULL=[[-30,-10.5],[-30,10.5],[36,0],[24,-10.5],[24,10.5],[0,-10.5],[0,10.5],[-15,-10.5],[-15,10.5],[12,-10.5],[12,10.5]];
const corners=(p)=>HULL.map(([a,b])=>[p.x+a*Math.cos(p.yaw)+b*Math.sin(p.yaw),p.z-a*Math.sin(p.yaw)+b*Math.cos(p.yaw)]);
// the island as the Shores draw it (zones/moonmere_view.ts, the baked moonmere-view.json): every ground
// vertex that stands off the flat floor the bake lays under the open water -- the island, its mere and the
// sand shelf rising to its coast -- in the Shores' frame
const viewSrc=fs.readFileSync(new URL('../src/zones/moonmere_view.ts',import.meta.url),'utf8');
const lit=(name)=>JSON.parse(viewSrc.match(new RegExp(`export const ${name} = (\\{[^}]*\\})`))[1].replace(/(\w+):/g,'"$1":'));
const G=lit('VIEW_GROUND'),F=lit('SHORES_FROM_MOONMERE');
const bake=JSON.parse(fs.readFileSync(new URL('../src/moonmere-view.json',import.meta.url)));
const n=bake.ground.n,hb=Buffer.from(bake.ground.h,'base64'),hs=new Int16Array(hb.buffer,hb.byteOffset,n*n);
const floor=Math.min(...hs),island=[];
for(let j=0;j<n;j++)for(let i=0;i<n;i++)if(hs[j*n+i]>floor+5)island.push([G.x0+i*G.cell+F.dx,G.z0+j*G.cell+F.dz]);
const toIsland=(x,z)=>{let d=Infinity;for(const[ix,iz]of island)d=Math.min(d,(ix-x)**2+(iz-z)**2);return Math.sqrt(d)-G.cell;};
// the Shores' plate (scene.ts MS_SHAPE before its 26 m detail; south and west are coast), and the causeway
// (zones.json's gate on it, south to the island)
const PLATE=[[-298.0,200.6],[7.1,252.5],[323.3,195.9],[338.0,-244.0],[-2.4,-252.5],[-302.0,-160.0]];
const inside=(x,z)=>{let k=false;for(let i=0,j=PLATE.length-1;i<PLATE.length;j=i++){const[ax,az]=PLATE[i],[bx,bz]=PLATE[j];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)k=!k;}return k;};
const toEdge=(x,z)=>Math.min(...PLATE.map(([ax,az],i)=>{const[bx,bz]=PLATE[(i+1)%PLATE.length],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(ax+t*dx-x,az+t*dz-z);}));
const zones=JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json',import.meta.url)));
const gate=(Array.isArray(zones)?zones:Object.values(zones)).flatMap((z)=>z.portals??[]).find((p)=>p.id==='ms_causeway');

const K='moonmereshores',BERTH=config.ports[K].ship;
// the piers (scene.ts buildMoonmereShores, MEASURED live): the ferry's head the ship lies alongside, and the empty
// second pier its stern swings toward in the turn
const HEAD={x0:-199,x1:-181,z0:-247.5,z1:-233.5},PIER2={x0:-163.5,x1:-156.5,z0:-229.5,z1:-195.5};
const rectD=(x,z,r)=>Math.hypot(Math.max(r.x0-x,0,x-r.x1),Math.max(r.z0-z,0,z-r.z1));
// what a player can stand on: the plate and the causeway out to its gate
const segD=(x,z,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(ax+t*dx-x,az+t*dz-z);};
const ashore=(x,z)=>inside(x,z)?0:Math.min(toEdge(x,z),segD(x,z,gate.x,-150,gate.x,gate.z-40));

test('the Shores ferry stays on open water, clear of the city across it, its shelf, the causeway and the piers',()=>{
 let isl=Infinity,plate=Infinity,cause=Infinity,pier2=Infinity,head=Infinity,sheet=0;
 for(const time of moving(K)){
  const p=ferryPose(time,K),off=Math.hypot(p.x-BERTH.x,p.z-BERTH.z);
  for(const[x,z]of corners(p)){
   isl=Math.min(isl,toIsland(x,z));
   assert.ok(!inside(x,z),`hull on the Shores' plate at ${time}`);plate=Math.min(plate,toEdge(x,z));
   if(z<gate.z+20)cause=Math.min(cause,Math.abs(x-gate.x)-4.5);
   pier2=Math.min(pier2,rectD(x,z,PIER2));
   // alongside the head is where it berths; once it has sailed a ship length it must not come back to it
   if(off>60)head=Math.min(head,rectD(x,z,HEAD));
   sheet=Math.max(sheet,Math.hypot(x,z));
  }
 }
 assert.ok(isl>=25,`within ${isl.toFixed(1)} m of the island's drawn footprint`);
 assert.ok(plate>=20,`within ${plate.toFixed(1)} m of the Shores' plate`);
 assert.ok(cause>=25,`within ${cause.toFixed(1)} m of the causeway`);
 assert.ok(pier2>=10&&head>=10,`within ${pier2.toFixed(1)} m of the second pier, ${head.toFixed(1)} m of the head`);
 // the sea sheet is a 1100 m disc about the origin (scene.ts MS_MERE reach): never sail off its edge
 assert.ok(sheet<=1050,`hull ${sheet.toFixed(0)} m from the sheet's centre`);
});

// a point d m along the hull from midships: its velocity across the hull and along it
function slew(time,d){
 const p=ferryPose(time,K),q=ferryPose(time+.01,K),fx=Math.cos(p.yaw),fz=-Math.sin(p.yaw);
 const vx=(q.x+Math.cos(q.yaw)*d-p.x-fx*d)/.01,vz=(q.z-Math.sin(q.yaw)*d-p.z-fz*d)/.01;
 return{across:Math.abs(-fz*vx+fx*vz),along:fx*vx+fz*vz,yawRate:Math.abs(q.yaw-p.yaw)/.01};
}

test('the Shores ferry turns sharply away once clear of the pier, a ship turning and not a top',()=>{
 const start=moving(K).find((t)=>Math.abs(ferryPose(t,K).yaw-BERTH.yaw)>.01);
 const p0=ferryPose(start,K);
 // clear of the pier head before it turns: the stern (30 m aft) is past the head's seaward end
 assert.ok(p0.x-30>HEAD.x1,`turns with the stern at ${(p0.x-30).toFixed(1)}`);
 // half a turn within three ship lengths of sailing, i.e. a circle about two ship lengths across
 let t=start;while(Math.abs(ferryPose(t,K).yaw-BERTH.yaw)<Math.PI-.01)t+=.05;
 assert.ok(ferryPose(t,K).offset-p0.offset<=180,`half a turn took ${(ferryPose(t,K).offset-p0.offset).toFixed(0)} m`);
 // and never a pivot: yaw under 10 deg/s, bow and stern (30 m either side of midships) moving across the hull at
 // no more than ~half (0.6 at the 50 m radius) of the way they move along it (review 2026-10-09: at 22 m the
 // bow swept sideways at 17 m/s while the ship made 8)
 for(const time of moving(K))for(const d of[-30,30]){
  const v=slew(time,d);if(v.along<.3)continue;
  assert.ok(v.across<=.62*v.along,`slews ${v.across.toFixed(1)} across at ${v.along.toFixed(1)} on, ${d} m, ${time.toFixed(1)} s`);
  assert.ok(v.yawRate<=10*Math.PI/180,`yaw rate ${(v.yawRate*180/Math.PI).toFixed(1)} deg/s at ${time.toFixed(1)}`);
 }
 // it ends heading away west
 const m=moving(K),last=ferryPose(m.findLast((t)=>t<config.crossing/2),K);
 assert.ok(last.x<BERTH.x-400&&Math.cos(last.yaw)<-.8,`ends at ${last.x},${last.z} heading ${last.yaw}`);
});

// It goes out of sight where nobody can see it go (review 2026-10-09: it blinked out 100 m off the west coast, in
// plain view, at 20 m/s, and appeared from nothing at 350 m): it fades in the haze at least 600 m from anywhere a
// player stands, and is at full strength the whole time it is within 450 m of them.
test('the Shores ferry fades out and in far out in the haze, never blinking in plain view',()=>{
 const m=moving(K),gap=m.findIndex((t,i)=>i>0&&t-m[i-1]>1),edges=[m[gap-1],m[gap]];
 assert.ok(edges[0]<edges[1]);
 for(const time of edges){const p=ferryPose(time,K);
  assert.ok(p.fade<.05,`fade ${p.fade} at ${time}`);
  assert.ok(ashore(p.x,p.z)>=600,`hides ${ashore(p.x,p.z).toFixed(0)} m from shore at ${time}`);}
 for(const time of m){const p=ferryPose(time,K);
  if(ashore(p.x,p.z)<450)assert.equal(p.fade,1,`fading ${ashore(p.x,p.z).toFixed(0)} m from shore at ${time}`);}
 // and the fade is gradual: no step bigger than a fortieth across 0.17 s
 for(let i=1;i<m.length;i++)if(m[i]-m[i-1]<1)assert.ok(Math.abs(ferryPose(m[i],K).fade-ferryPose(m[i-1],K).fade)<.025);
});
