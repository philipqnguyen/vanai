type Point=[number,number,number];
/** A closed, extruded wall around the existing arch centreline. The projecting
 * stone frame overlaps this boundary, so its opening and reveals stay intact.
 * Faces sit 50mm behind the frame; no coplanar patch planes are needed. */
export function doorwayWallGeometry(opts: {
  half?: number; spring?: number; rise?: number; height?: number;
  edge?: number; depth?: number;
} = {}) {
  const {half=1.85,spring=3.5,rise=1.7,height=8,edge=2,depth=.35}=opts;
  const count=18;
  const positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[];
  function quad(points:Point[],normal:Point,tex?:number[][]):void {
    const n=positions.length/3,[a,b,c]=points,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const reverse=cross.reduce((sum,v,i)=>sum+v*normal[i],0)>0;
    points.forEach((p,i)=>{positions.push(...p);normals.push(...normal);uvs.push(...(tex?.[i]??[p[0]/3,p[1]/3]));});
    indices.push(...(reverse?[n,n+2,n+1,n,n+3,n+2]:[n,n+1,n+2,n,n+2,n+3]));
  }
  const curve=Array.from({length:count+1},(_,i)=>{const a=Math.PI-i*Math.PI/count;return [half*Math.cos(a),spring+rise*Math.sin(a)];});
  // Exact endpoints keep the jamb/reveal seams welded geometrically.
  curve[0]=[-half,spring];curve[count]=[half,spring];
  for(const side of[-1,1]){
    const z=side*depth,normal:Point=[0,0,side];
    for(const [l,r]of[[-edge,-half],[half,edge]])for(const[b,t]of[[0,spring],[spring,height]])quad([[l,b,z],[r,b,z],[r,t,z],[l,t,z]],normal);
    for(let i=1;i<curve.length;i++){const[a,b]=[curve[i-1],curve[i]];quad([[a[0],a[1],z],[b[0],b[1],z],[b[0],height,z],[a[0],height,z]],normal);}
  }
  const xs=[-edge,...curve.map(p=>p[0]),edge];
  for(let i=1;i<xs.length;i++){const[l,r]=[xs[i-1],xs[i]];quad([[l,height,-depth],[r,height,-depth],[r,height,depth],[l,height,depth]],[0,1,0],[[l/3,-depth/3],[r/3,-depth/3],[r/3,depth/3],[l/3,depth/3]]);}
  for(const side of[-1,1]){
    const outer=side*edge,inner=side*half;
    for(const[b,t]of[[0,spring],[spring,height]])quad([[outer,b,-depth],[outer,t,-depth],[outer,t,depth],[outer,b,depth]],[side,0,0],[[-depth/3,b/3],[-depth/3,t/3],[depth/3,t/3],[depth/3,b/3]]);
    quad([[inner,0,-depth],[inner,spring,-depth],[inner,spring,depth],[inner,0,depth]],[-side,0,0],[[-depth/3,0],[-depth/3,spring/3],[depth/3,spring/3],[depth/3,0]]);
    quad([[outer,0,-depth],[inner,0,-depth],[inner,0,depth],[outer,0,depth]],[0,-1,0],[[outer/3,-depth/3],[inner/3,-depth/3],[inner/3,depth/3],[outer/3,depth/3]]);
  }
  let length=0;
  for(let i=1;i<curve.length;i++){
    const[a,b]=[curve[i-1],curve[i]],dx=b[0]-a[0],dy=b[1]-a[1],segment=Math.hypot(dx,dy);
    quad([[a[0],a[1],-depth],[b[0],b[1],-depth],[b[0],b[1],depth],[a[0],a[1],depth]],[dy/segment,-dx/segment,0],[[length/3,-depth/3],[(length+segment)/3,-depth/3],[(length+segment)/3,depth/3],[length/3,depth/3]]);length+=segment;
  }
  return {positions,indices,normals,uvs};
}
