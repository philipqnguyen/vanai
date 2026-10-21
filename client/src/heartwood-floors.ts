import {Mesh, Vector3} from '@babylonjs/core';
import {polygonArea, subtractConvex, type FloorVertex} from './floor_union';

type Patch={polygon:FloorVertex[];bounds:number[]};
let floors=new Map<number,Patch[]>();
export function resetHeartwoodFloors(){floors=new Map();}
const bounds=(p:FloorVertex[])=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const overlaps=(a:number[],b:number[])=>a[0]<b[2]-1e-7&&a[2]>b[0]+1e-7&&a[1]<b[3]-1e-7&&a[3]>b[1]+1e-7;

/** Keep the already-built floor at a join and cut the newcomer to its boundary.
 * Movement retains the union of both footprints; no height offsets hide overlaps.
 * Apply after positioning/rotating the mesh, before merging static city meshes.
 */
export function joinHeartwoodFloor(mesh:Mesh,y:number):Mesh{
 const key=Math.round(y*10000),previous=floors.get(key)??[],matrix=mesh.computeWorldMatrix(true);
 const positions=Array.from(mesh.getVerticesData('position')!),normals=Array.from(mesh.getVerticesData('normal')!),uvs=Array.from(mesh.getVerticesData('uv')!);
 const old=Array.from(mesh.getIndices()!),indices:number[]=[],added:Patch[]=[];
 let cuts=0;
 for(let i=0;i<old.length;i+=3){
  const ids=old.slice(i,i+3),world=ids.map(j=>Vector3.TransformCoordinates(new Vector3(...positions.slice(j*3,j*3+3) as [number,number,number]),matrix));
  if(world.some(p=>Math.abs(p.y-y)>.0001)){indices.push(...ids);continue;}
  const triangle=ids.map((j,k)=>[world[k].x,world[k].z,...positions.slice(j*3,j*3+3),...normals.slice(j*3,j*3+3),...uvs.slice(j*2,j*2+2)]),bb=bounds(triangle);
  let pieces=[triangle];
  for(const patch of previous){if(!overlaps(bb,patch.bounds))continue;pieces=pieces.flatMap(p=>subtractConvex(p,patch.polygon));if(!pieces.length)break;}
  if(pieces.length===1&&pieces[0]===triangle)indices.push(...ids);
  else{cuts++;for(const piece of pieces){const base=positions.length/3;for(const v of piece){positions.push(...v.slice(2,5));normals.push(...v.slice(5,8));uvs.push(...v.slice(8,10));}for(let j=1;j<piece.length-1;j++)indices.push(base,base+j,base+j+1);}}
  for(const p of pieces)if(Math.abs(polygonArea(p))>1e-9)added.push({polygon:p.map(v=>v.slice(0,2)),bounds:bounds(p)});
 }
 previous.push(...added);floors.set(key,previous);
 if(cuts){mesh.setVerticesData('position',positions);mesh.setVerticesData('normal',normals);mesh.setVerticesData('uv',uvs);mesh.setIndices(indices);}
 mesh.metadata={...mesh.metadata,floorJoin:{y,cuts}};
 return mesh;
}
