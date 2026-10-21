import { tombCells, tombEntrances, type TombLayout } from './zones/mausoleum-layout';

export type ReviewPoint = [number, number];
export interface ReviewPath {
  id: string; label: string; kind: 'corridor' | 'junction' | 'door' | 'stairs';
  points: ReviewPoint[]; lanes: number[]; heights?: [number, number];
}
export interface ReviewCollision {
  ground(x:number,z:number,previous?:number):number;
  hit(x:number,z:number,y:number):string;
  move(ox:number,oz:number,nx:number,nz:number,y:number):ReviewPoint;
  floor(x:number,z:number):boolean;
}
export interface ReviewFailure { x:number; z:number; y:number; reason:string; lane:number; direction:number; safe?:[number,number,number] }
export interface ReviewResult { status:'pass'|'blocked'; failures:ReviewFailure[]; sweeps:number }

/** Every corridor adjacency and every turn through a junction gets its own
 * result. Door approaches are independent, even when another route is open. */
export function reviewPaths(layout:TombLayout, ramps: {x0:number;z0:number;x1:number;z1:number;y0:number;y1:number;half:number}[]):ReviewPath[] {
  const cells=tombCells(layout),paths:ReviewPath[]=[],size=layout.cell;
  for(const [key,room] of cells){
    const [i,j]=key.split(',').map(Number);
    for(const [dx,dz] of [[1,0],[0,1]]){
      const next=`${i+dx},${j+dz}`;
      if(cells.has(next)&&(!room||!cells.get(next)))paths.push({id:`edge:${key}:${next}`,label:`Passage ${i*size}, ${j*size}`,kind:'corridor',points:[[i*size,j*size],[(i+dx)*size,(j+dz)*size]],lanes:[-.6,0,.6]});
    }
    if(room)continue;
    const neighbors=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>cells.has(`${i+dx},${j+dz}`));
    if(neighbors.length<2)continue;
    for(let a=0;a<neighbors.length;a++)for(let b=a+1;b<neighbors.length;b++){
      const [ax,az]=neighbors[a],[bx,bz]=neighbors[b];
      if(neighbors.length===2&&ax===-bx&&az===-bz)continue;
      paths.push({id:`junction:${key}:${a}:${b}`,label:`Junction ${i*size}, ${j*size}`,kind:'junction',points:[[(i+ax)*size,(j+az)*size],[i*size,j*size],[(i+bx)*size,(j+bz)*size]],lanes:[-.6,0,.6]});
    }
  }
  for(const e of tombEntrances(layout))paths.push({id:`door:${e.x},${e.z}`,label:`${layout.rooms.find(r=>r.id===e.room)!.name} doorway`,kind:'door',points:[[e.x-e.dx*4,e.z-e.dz*4],[e.x+e.dx*4,e.z+e.dz*4]],lanes:[-.8,0,.8]});
  ramps.forEach((r,i)=>{const len=Math.hypot(r.x1-r.x0,r.z1-r.z0),dx=(r.x1-r.x0)/len,dz=(r.z1-r.z0)/len,side=Math.min(1.6,r.half-.6);paths.push({id:`stairs:${i}`,label:`Stair ${i+1}`,kind:'stairs',points:[[r.x0-dx*.5,r.z0-dz*.5],[r.x1+dx*.5,r.z1+dz*.5]],lanes:[-side,0,side],heights:[r.y0,r.y1]});});
  for(const route of layout.walkways??[])paths.push({id:`walkway:${route.id}`,label:route.name,kind:'corridor',points:route.points.map(p=>[p[0],p[1]]),lanes:[-.6,0,.6],heights:route.y===undefined?undefined:[route.y,route.y]});
  return paths;
}

function offsetPath(points:ReviewPoint[],offset:number):ReviewPoint[] {
  const normals=points.slice(1).map(([x,z],i)=>{const dx=x-points[i][0],dz=z-points[i][1],length=Math.hypot(dx,dz);return [-dz/length,dx/length];});
  return points.map(([x,z],i)=>{
    const a=normals[Math.max(0,i-1)]!,b=normals[Math.min(i,normals.length-1)]!;
    const divisor=1+a[0]*b[0]+a[1]*b[1];
    return [x+offset*(a[0]+b[0])/divisor,z+offset*(a[1]+b[1])/divisor];
  });
}

/** Uses the same 0.45m-radius player resolver as walking. Never skips a
 * blocked start, never turns an untested route green, and carries floor
 * history through both the ascent and descent of stairs. */
export function checkReviewPath(path:ReviewPath,api:ReviewCollision):ReviewResult {
  const failures:ReviewFailure[]=[];
  for(const lane of path.lanes)for(const direction of [1,-1]){
    const points=offsetPath(path.points,lane);if(direction<0)points.reverse();
    let [x,z]=points[0],y=path.heights?.[direction>0?0:1]??api.ground(x,z,0);
    let safe:[number,number,number]|undefined;
    const fail=(reason:string)=>failures.push({x,z,y,reason,lane,direction,safe});
    const hit=api.hit(x,z,y);
    if(!api.floor(x,z)||hit!=='clear'){fail(!api.floor(x,z)?'Outside floor':hit);continue;}
    safe=[x,z,y];let blocked=false;
    for(let k=1;k<points.length&&!blocked;k++){
      const [tx,tz]=points[k],dx=tx-x,dz=tz-z,steps=Math.ceil(Math.hypot(dx,dz)/.07);
      for(let n=0;n<steps;n++){
        const nx=x+dx/steps,nz=z+dz/steps,[rx,rz]=api.move(x,z,nx,nz,y);
        if(Math.hypot(rx-nx,rz-nz)>.001||!api.floor(rx,rz)){
          // Keep the actual blocked location for map markers and inspection.
          x=nx;z=nz;fail(api.hit(nx,nz,y)==='clear'?'Movement blocked':api.hit(nx,nz,y));blocked=true;break;
        }
        x=rx;z=rz;y=api.ground(x,z,y);
        const occupied=api.hit(x,z,y);if(occupied!=='clear'){fail(occupied);blocked=true;break;}
        safe=[x,z,y];
      }
    }
    if(!blocked&&path.heights&&Math.abs(y-path.heights[direction>0?1:0])>.1)fail(`Wrong landing height: ${y.toFixed(2)}m`);
  }
  return {status:failures.length?'blocked':'pass',failures,sweeps:path.lanes.length*2};
}
