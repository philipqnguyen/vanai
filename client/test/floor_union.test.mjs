import test from 'node:test';import assert from 'node:assert/strict';
import {polygonArea,subtractConvex} from '../src/floor_union.ts';
const area=ps=>ps.reduce((n,p)=>n+Math.abs(polygonArea(p)),0);
test('overlapping landings partition their shared floor without removing the union',()=>{
 const floor=[[0,0],[5,0],[5,4],[0,4]],landing=[[3,1],[7,1],[7,3],[3,3]];
 const cut=subtractConvex(landing,floor);assert.equal(area(cut),4);assert.equal(area([floor,...cut]),24);
 assert.equal(area(subtractConvex(floor,floor)),0);
 assert.equal(area(subtractConvex(landing,floor.slice().reverse())),4);
});
test('a rotated threshold retains interpolated UVs and only touches the room boundary',()=>{
 const triangle=[[-2,0,-2,0],[2,0,2,0],[0,3,0,3]],clip=[[-1,-1],[1,-1],[1,1],[-1,1]];
 const cut=subtractConvex(triangle,clip);assert.ok(Math.abs(area(cut)-4)<1e-9);
 for(const p of cut)for(const v of p){assert.equal(v[0],v[2]);assert.equal(v[1],v[3]);}
 for(const p of cut)assert.ok(Math.abs(area(subtractConvex(p,clip))-Math.abs(polygonArea(p)))<1e-9);
});
test('adjacent triangles and a disjoint platform do not create seams or slivers',()=>{
 const a=[[0,0],[4,0],[0,4]],b=[[4,0],[4,4],[0,4]];
 assert.strictEqual(subtractConvex(a,b)[0],a);assert.strictEqual(subtractConvex(a,[[8,8],[9,8],[8,9]])[0],a);
});
