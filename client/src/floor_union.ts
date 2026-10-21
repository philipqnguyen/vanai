// Convex subtraction keeps interpolated vertex attributes attached to each cut.
// The first two coordinates are world x/z; remaining values are arbitrary data.
export type FloorVertex = number[];
const EPS=1e-9;
export function polygonArea(p:FloorVertex[]):number {
 return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
}
function halfPlane(p:FloorVertex[],a:FloorVertex,b:FloorVertex,sign:number,inside:boolean):FloorVertex[]{
 const distance=(v:FloorVertex)=>sign*((b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]));
 const out:FloorVertex[]=[];
 for(let i=0;i<p.length;i++){
  const u=p[i],v=p[(i+1)%p.length],du=distance(u),dv=distance(v),iu=inside?du>=0:du<=0,iv=inside?dv>=0:dv<=0;
  if(iu)out.push(u);
  if(iu!==iv){const t=du/(du-dv);out.push(u.map((n,j)=>n+(v[j]-n)*t));}
 }
 return out;
}
export function subtractConvex(subject:FloorVertex[],clip:FloorVertex[]):FloorVertex[][]{
 if(subject.length<3||clip.length<3)return subject.length>=3?[subject]:[];
 const sign=Math.sign(polygonArea(clip));if(!sign)return[subject];
 // If the intersection has no area, retain the original triangulation.
 let intersection=subject;
 for(let i=0;i<clip.length&&intersection.length>=3;i++)intersection=halfPlane(intersection,clip[i],clip[(i+1)%clip.length],sign,true);
 if(intersection.length<3||Math.abs(polygonArea(intersection))<EPS)return[subject];
 const result:FloorVertex[][]=[];let remaining=subject;
 for(let i=0;i<clip.length&&remaining.length>=3;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],outside=halfPlane(remaining,a,b,sign,false);
  if(outside.length>=3&&Math.abs(polygonArea(outside))>EPS)result.push(outside);
  remaining=halfPlane(remaining,a,b,sign,true);
 }
 return result;
}
