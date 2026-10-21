// @ts-nocheck
// Select only existing canonical triangles; never reshape the approved surface.
export function clipPanel(buffers, indices, spec) {
 const p=buffers.position.data, uv=buffers.uv.data, chosen=[];
 const inside=i=>{
  const t=1-uv[i*2+1], u=uv[i*2], delta=((u-spec.center_u+.5)%1+1)%1-.5;
  return t>=spec.start_t-1e-7&&t<=spec.end_t+1e-7&&Math.abs(delta)<=spec.support_width/2+1e-7;
 };
 for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3);if(tri.every(inside))chosen.push(...tri);}
 if(!chosen.length)throw Error('Armor panel has no canonical support triangles');
 const ids=[...new Set(chosen)], remap=new Map(ids.map((id,i)=>[id,i])), out={};
 for(const [kind,b] of Object.entries(buffers))out[kind]={size:b.size,data:ids.flatMap(i=>Array.from(b.data.slice(i*b.size,(i+1)*b.size)))};
 const ymax=Math.max(...ids.map(i=>p[i*3+1]));
 let rootCount=0,rootError=null;
 if(spec.root_mount==='canonical_drape_top'){
  const top=ids.filter(i=>Math.abs(1-uv[i*2+1])<1e-7);
  if(spec.start_t!==0||top.length<2||!spec.canonical_root_positions?.length)throw Error('Missing actual canonical top-root evidence');
  rootCount=top.length;
  rootError=Math.max(...top.map(i=>Math.min(...spec.canonical_root_positions.map(r=>Math.hypot(...r.map((v,k)=>v-p[i*3+k]))))));
  if(!Number.isFinite(rootError)||rootError>1e-6)throw Error('Armor top does not match canonical root ring');
 }else if(!Number.isFinite(ymax)||ymax>spec.pelvis_y_m+1e-7)throw Error('Actual armor geometry exceeds pelvis ceiling');
 return {buffers:out,indices:chosen.map(i=>remap.get(i)),sourceVertices:ids,highestRoot:ymax,rootCount,rootError};
}
