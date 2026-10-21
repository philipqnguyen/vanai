import {Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, VertexData} from '@babylonjs/core';
import {scene, buildApi, addShadowCaster, seededRand} from './scene';
import {material, rimRail, type P} from './heartwood-neighborhood';

// Step S4 kill switch (tmp/heartwood-perf/PLAN2.md): false puts back the
// 6-vertex, 4-triangle petal.
const HW_PETAL_KITE=true;
// A petal outline from its base (along, across, up, in petal sizes). The kite
// is 2 triangles over 4 vertices, about the fan's area (0.45 against 0.49):
// the blossoms were 0.34 M main-pass triangles at p (MEASURED 2026-10-07).
const PETAL:[number,number,number][]=HW_PETAL_KITE?[[0,0,.04],[.72,-.4,.15],[1.12,0,.22],[.72,.4,.15]]:[[0,0,.04],[.42,-.3,.1],[.9,-.32,.17],[1.12,0,.22],[.9,.32,.17],[.42,.3,.1]];
/** Open five-petalled flowers and closed buds, rather than pink leaf polygons. */
export function mourningBlossoms(p:P,r:number,seed:number,count:number,mat:StandardMaterial){
 const rnd=seededRand(seed),positions:number[]=[],indices:number[]=[],colors:number[]=[];
 for(let i=0;i<count;i++){
  const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*r,c:[number,number,number]=[p[0]+Math.cos(a)*d,p[1]+(rnd()-.5)*r*.6,p[2]+Math.sin(a)*d],size=.28+rnd()*.27,turn=rnd()*Math.PI*2,bud=i%5===0;
  for(let petal=0;petal<5;petal++){
   const q=turn+petal*Math.PI*2/5,base=positions.length/3;
   for(const [along,across,up]of PETAL){
    const radial=along*size*(bud?.25:1),side=across*size*(bud?.45:1);
    positions.push(c[0]+Math.cos(q)*radial-Math.sin(q)*side,c[1]+up*size+(bud?along*size*.9:0),c[2]+Math.sin(q)*radial+Math.cos(q)*side);
    const gold=along===0;colors.push(1,gold?.67:.96,gold?.3:.91,1);
   }
   for(let j=1;j<PETAL.length-1;j++)indices.push(base,base+j,base+j+1);
  }
 }
 const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const vd=new VertexData();Object.assign(vd,{positions,indices,normals,colors});
 const mesh=new Mesh('hw_mourning_blossoms',scene);vd.applyToMesh(mesh);mesh.material=mat;mesh.isPickable=false;
}

export const SONG_STEPS={x:118,z:-62,r0:12.4,tiers:3,width:2,rise:.28,a0:Math.PI*.52,a1:Math.PI*1.48};
/** Broad audience terraces; each continuous tread has the same collision floor. */
export function buildSongSteps(y:number,wood:StandardMaterial){
 const s=SONG_STEPS,n=72;
 for(let tier=0;tier<s.tiers;tier++){
  const r0=s.r0+tier*s.width,r1=r0+s.width,top=y+(tier+1)*s.rise,p:number[]=[],uvs:number[]=[],ix:number[]=[];
  for(let i=0;i<=n;i++){const a=s.a0+(s.a1-s.a0)*i/n;
   for(const r of [r0,r1])for(const yy of [top,y-.32]){p.push(s.x+Math.cos(a)*r,yy,s.z+Math.sin(a)*r);uvs.push(Math.cos(a)*r/3,Math.sin(a)*r/3);}
  }
  for(let i=0;i<n;i++){const a=i*4,b=a+4;for(const [v,w,x,z]of [[a,b,a+2,b+2],[a,a+1,b,b+1],[a+2,b+2,a+3,b+3]])ix.push(v,x,w,w,x,z);
   const angle=s.a0+(s.a1-s.a0)*(i+.5)/n,r=(r0+r1)/2,len=(s.a1-s.a0)*r/n;
   buildApi.addDeck(s.x+Math.cos(angle)*r,s.z+Math.sin(angle)*r,len/2+.025,s.width/2+.012,Math.PI/2-angle,top);
  }
  for(const i of [0,n*4])ix.push(i,i+2,i+1,i+1,i+2,i+3);
  const normals:number[]=[];VertexData.ComputeNormals(p,ix,normals);const vd=new VertexData();Object.assign(vd,{positions:p,indices:ix,normals,uvs});const m=new Mesh('hw_song_terrace',scene);vd.applyToMesh(m);m.material=wood;m.isPickable=false;
 }
 const edge=s.r0+s.tiers*s.width-.1,top=y+s.tiers*s.rise;
 // The back rail's 145 tubes were a draw each in every pass and every cascade
 // they reach (MEASURED: 380 shadow draws at the song steps); merged they are
 // one. MergeMeshes drops casting and receiving, and the rail did both, so the
 // merged rail is registered again; it stays unpickable like its tubes.
 const railStart=scene.meshes.length;
 rimRail('song_back',Array.from({length:73},(_,i):P=>{const a=s.a0+(s.a1-s.a0)*i/72;return[s.x+Math.cos(a)*edge,top,s.z+Math.sin(a)*edge];}),wood);
 const rail=Mesh.MergeMeshes(scene.meshes.slice(railStart) as Mesh[],true,true,undefined,false,true);
 if(rail){rail.isPickable=false;rail.metadata={hwPart:'song_back'};addShadowCaster(rail);}
 scene.metadata={...scene.metadata,songSteps:{...s,y}};
}

/** The hall records its debts underfoot; an ink layer adds no collision. */
export function grudgeFloor(x:number,z:number,y:number){
 const tex=new DynamicTexture('hw_grudge_register',{width:1024,height:1024},scene,false),c=tex.getContext() as CanvasRenderingContext2D;
 c.clearRect(0,0,1024,1024);c.strokeStyle='#57452e';c.fillStyle='#57452e';c.lineWidth=5;
 for(const r of [330,440]){c.beginPath();c.arc(512,512,r,0,Math.PI*2);c.stroke();}
 c.font='bold 42px Georgia';c.textAlign='center';
 for(const [text,z]of [['RESTITUTION UPON RETURN',270],['THE TAKEN GROVES',710],['THE DISPLACED FAMILIES',770]] as [string,number][])c.fillText(text,512,z);
 tex.hasAlpha=true;tex.update();const mat=material('grudge_ink','#ffffff');mat.diffuseTexture=tex;mat.useAlphaFromDiffuseTexture=true;mat.emissiveColor=Color3.FromHexString('#57452e').scale(.12);
 const m=MeshBuilder.CreateGround('hw_grudge_floor_record',{width:15,height:15},scene);m.position.set(x,y+.013,z);m.material=mat;m.isPickable=false;
}
