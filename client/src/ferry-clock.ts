import config from '@data/ferry.json';
export const FERRY = config;
export type FerryStatus = {server_time:number; phase:string; departure:number; arrival:number; next_departure:number; origin:string; destination:string; registered:boolean; on_dock:boolean; fare:number; voyage?:{arrival:number;departure:number;boat:number}|null};
let anchor:number|undefined, received=0;
/** Extrapolate the server's wall time with a monotonic browser clock. */
export function syncFerryClock(serverTime:number){if(Number.isFinite(serverTime)){anchor=serverTime;received=performance.now();}}
export function ferryNow(){
  if(import.meta.env.DEV){const preview=new URLSearchParams(location.search).get('ferrytime');if(preview!==null)return Number(preview);}
  return anchor===undefined?Date.now()/1000:anchor+(performance.now()-received)/1000;
}
export function ferryPhase(now:number){const departure=Math.floor(now/FERRY.period)*FERRY.period,arrival=departure+FERRY.crossing;return{departure,arrival,next_departure:departure+FERRY.period,docked:now>=arrival};}
export function ferryMotion(now:number){
 const phase=ferryPhase(now),elapsed=now-phase.departure,edge=FERRY.approach;
 if(phase.docked)return{offset:0,visible:true,phase:'docked'};
 if(elapsed<edge){const t=elapsed/edge;return{offset:220*t*t,visible:true,phase:'departing'};}
 if(now>phase.arrival-edge){const t=(phase.arrival-now)/edge;return{offset:220*t*t,visible:true,phase:'approaching'};}
 return{offset:220,visible:false,phase:'at sea'};
}
export function ferryCountdown(until:number,now=ferryNow()){const seconds=Math.max(0,Math.ceil(until-now));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}

/** The loaded bow is +X (the glTF conversion mirrors source X). Arrive along the berth, stop, then continue ahead on
 * the other half of an offshore curve. Heading follows its tangent, never
 * a sideways translation. Squared distance eases to rest at both ends.
 * A port with a `departure` or an `approach` route in ferry.json sails that instead (see ROUTES below), in its own
 * time window; a port with neither (caerdunfields) is exactly this curve. */
export function ferryPose(now: number, portKey: keyof typeof FERRY.ports) {
  const port:{ship:Berth;departure?:Route;approach?:Route}=FERRY.ports[portKey], berth=port.ship;
  const elapsed=now-ferryPhase(now).departure;
  if(port.departure){const p=plan(port.departure,false);if(elapsed<p.T)return routePose(p,berth,elapsed,false);}
  if(port.approach){const p=plan(port.approach,true),e=elapsed-(FERRY.crossing-p.T);if(e>=0&&elapsed<FERRY.crossing)return routePose(p,berth,e,true);}
  const motion=ferryMotion(now);
  // past a route's own window the ship is out at sea, whatever the shared 25 s window says
  if((port.departure&&motion.phase==='departing')||(port.approach&&motion.phase==='approaching'))
    return{offset:0,visible:false,phase:'at sea',x:berth.x,z:berth.z,yaw:berth.yaw};
  const along=motion.phase==='approaching' ? -motion.offset : motion.offset;
  const outward=along*along/220, turn=2*along/220;
  const c=Math.cos(berth.yaw), s=Math.sin(berth.yaw), side=berth.seaward;
  const dx=c+s*side*turn, dz=-s+c*side*turn;
  return {...motion, x:berth.x+c*along+s*side*outward,
    z:berth.z-s*along+c*side*outward, yaw:Math.atan2(-dz,dx)};
}

// ROUTES (Philip, 2026-10-09: the Shores ferry "leaves and sails right into the silhouette" of Moonmere across the
// water -- the offshore curve ran east and south, over the causeway and onto the island's shelf). A port may carry
// a `departure` and an `approach`, each {accel, fade, route}: `route` is legs in SAILING order, {ahead: m} straight
// on, {turn: deg, radius: m, ease?: m} a turn, POSITIVE TO STARBOARD (the way yaw grows: bow +X turns toward -Z).
// A departure's legs start at the berth; an approach's END there, on the berth's heading. `ease` ramps the
// curvature in and out over that many metres at each end, so the bow never snaps from straight into the circle.
// A leg's `speed` (m/s, carried on to later legs) caps it, and `accel` (m/s^2) is how hard the ship may speed up or
// slow down: a departure leaves from rest, an approach comes to rest at the berth, and in between the ship slows
// BEFORE a slower leg rather than in it -- a turn is sailed slowly, so its yaw rate stays a ship's, not a top's.
// The ship's window is however long that takes. `fade` is how many seconds it fades out at the end of a departure
// and in at the start of an approach: it is far out by then, and a ship blinking out of open water reads as one
// (review, 2026-10-09: it vanished 100 m off the west coast at 20 m/s).
// The path is traced by the ship's origin (midships), heading its tangent, so it is bow-first by construction;
// the turn radius is what keeps bow and stern from slewing sideways (at R, a point d m off midships moves
// sideways at d/R of the forward speed).
type Berth={x:number;z:number;yaw:number;seaward:number};
type Leg=({ahead:number}|{turn:number;radius:number;ease?:number})&{speed?:number};
type Route={accel:number;fade?:number;route:Leg[]};
type Plan={theta:(s:number)=>number;nodes:Float64Array;L:number;T:number;turn:number;end:[number,number];
  t:Float64Array;v:Float64Array;ds:number;fade:number};
const plans=new Map<Route,Plan>();
function plan(r:Route,approach:boolean):Plan{
  let p=plans.get(r);if(p)return p;
  // heading (radians, relative to the route's start) as a closed-form function of distance along it
  const legs:{s0:number;len:number;th:(u:number)=>number;speed:number}[]=[];let s0=0,th0=0,speed=Infinity;
  for(const leg of r.route){
    const start=th0;speed=leg.speed??speed;
    if('ahead' in leg){legs.push({s0,len:leg.ahead,th:()=>start,speed});s0+=leg.ahead;continue;}
    const A=leg.turn*Math.PI/180,K=Math.sign(A)/leg.radius,e=Math.min(leg.ease??0,Math.abs(A)*leg.radius),len=Math.abs(A)*leg.radius+e;
    // curvature 0 -> K over e, K, K -> 0 over e: e/R of the angle is in the two ramps, so the arc between is |A|R - e long
    const th=(u:number)=>e===0?start+K*u:u<e?start+K*u*u/(2*e):u<len-e?start+K*(u-e/2):start+A-K*(len-u)*(len-u)/(2*e);
    legs.push({s0,len,th,speed});s0+=len;th0=start+A;
  }
  const L=s0,theta=(s:number)=>{for(const l of legs)if(s<=l.s0+l.len)return l.th(s-l.s0);return th0;};
  const cap=(s:number)=>{for(const l of legs)if(s<l.s0+l.len)return l.speed;return legs[legs.length-1].speed;};
  // the position, integrated once per metre (Simpson); a pose integrates the last part-metre the same way,
  // so position and heading agree to well under a millimetre
  const n=Math.ceil(L),nodes=new Float64Array(2*(n+1));
  // the speed table's step: about half a metre, and exactly L/N, so its last step ends at the route's end
  const N=Math.ceil(L/.5),DS=L/N,v=new Float64Array(N+1),t=new Float64Array(N+1);
  p={theta,nodes,L,T:0,turn:th0,end:[0,0],t,v,ds:DS,fade:r.fade??0};
  for(let i=1;i<=n;i++){const[dx,dz]=stretch(p,i-1,i);nodes[2*i]=nodes[2*i-2]+dx;nodes[2*i+1]=nodes[2*i-1]+dz;}
  p.end=at(p,L);
  // speed along the route: the leg caps, then no faster than `accel` allows coming from the start and going into
  // the end (a forward and a backward pass); the departure's start and the approach's end are at rest
  for(let i=0;i<=N;i++)v[i]=cap(i*DS);
  if(approach)v[N]=0;else v[0]=0;
  for(let i=1;i<=N;i++)v[i]=Math.min(v[i],Math.sqrt(v[i-1]**2+2*r.accel*DS));
  for(let i=N-1;i>=0;i--)v[i]=Math.min(v[i],Math.sqrt(v[i+1]**2+2*r.accel*DS));
  // and the clock: constant acceleration over each step, so dt = 2 ds / (v0 + v1) exactly
  for(let i=1;i<=N;i++)t[i]=t[i-1]+2*DS/(v[i-1]+v[i]);
  p.T=t[N];
  plans.set(r,p);return p;
}
function stretch(p:Plan,a:number,b:number):[number,number]{
  let x=0,z=0;const h=(b-a)/8;
  for(let i=0;i<=8;i++){const w=i===0||i===8?1:i%2?4:2,th=p.theta(a+i*h);x+=w*Math.cos(th);z-=w*Math.sin(th);}
  return[x*h/3,z*h/3];
}
function at(p:Plan,s:number):[number,number]{const i=Math.min(Math.floor(s),p.nodes.length/2-1),[ex,ez]=stretch(p,i,s);return[p.nodes[2*i]+ex,p.nodes[2*i+1]+ez];}
/** distance sailed `e` seconds into the route: the step's constant acceleration, so speed is continuous */
function sailed(p:Plan,e:number){
  const{t,v,ds}=p;let lo=0,hi=t.length-1;
  if(e>=t[hi])return p.L;
  while(hi-lo>1){const m=(lo+hi)>>1;if(t[m]<=e)lo=m;else hi=m;}
  const a=(v[hi]**2-v[lo]**2)/(2*ds),d=e-t[lo];
  return Math.min(p.L,lo*ds+v[lo]*d+a*d*d/2);
}
function routePose(p:Plan,berth:Berth,e:number,approach:boolean){
  const s=sailed(p,e),[lx,lz]=at(p,s);
  // a departure is laid out from the berth on its heading; an approach is turned and moved so that it ENDS there
  const rot=approach?berth.yaw-p.turn:berth.yaw,co=Math.cos(rot),si=Math.sin(rot);
  const ox=approach?lx-p.end[0]:lx,oz=approach?lz-p.end[1]:lz;
  const fade=p.fade>0?Math.min(1,(approach?e:p.T-e)/p.fade):1;
  return{offset:s,visible:true,phase:approach?'approaching':'departing',x:berth.x+co*ox+si*oz,z:berth.z-si*ox+co*oz,
    yaw:rot+p.theta(s),fade};
}
