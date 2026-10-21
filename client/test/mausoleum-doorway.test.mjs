import test from 'node:test';import assert from 'node:assert/strict';
import {doorwayWallGeometry} from '../src/zones/mausoleum-doorway.ts';
for(const [label,opts] of [['original',{}],['small kiln',{half:1.8,spring:2.3,rise:1.5,height:6.4,edge:5.5,depth:1}],['hall kiln',{half:2.7,spring:3.5,rise:2.2,height:8.5,edge:8.5,depth:1}]]) test(`${label} door wall is a closed manifold with outward faces and an open arch`,()=>{
 const {half=1.85,spring=3.5,rise=1.7,height=8,edge=2,depth=.35}=opts;
 const {positions:p,indices,uvs,normals}=doorwayWallGeometry(opts),edges=new Map();let volume=0;
 const vertex=i=>p.slice(i*3,i*3+3),key=v=>v.map(x=>x.toFixed(7)).join(',');
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),[a,b,c]=ids.map(vertex),ab=b.map((x,k)=>x-a[k]),ac=c.map((x,k)=>x-a[k]);
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];assert.ok(Math.hypot(...cross)>1e-8);
  assert.ok(cross.reduce((sum,x,k)=>sum+x*normals[ids[0]*3+k],0)<0,'Babylon left-handed outward winding');
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  for(let n=0;n<3;n++){const u=key(vertex(ids[n])),v=key(vertex(ids[(n+1)%3])),k=[u,v].sort().join('/');const e=edges.get(k)||{count:0,balance:0};e.count++;e.balance+=u<v?1:-1;edges.set(k,e);}
 }
 assert.ok([...edges.values()].every(e=>e.count===2&&e.balance===0),'Each geometric edge has exactly two opposite faces');
 const voidArea=2*half*spring+18/2*half*rise*Math.sin(Math.PI/18),expected=(2*edge*height-voidArea)*2*depth;
 assert.ok(Math.abs(-volume-expected)<1e-8,'Closed volume retains the existing arch centreline opening');
 assert.equal(uvs.length,p.length/3*2);assert.ok([...p,...uvs,...normals].every(Number.isFinite));
});
