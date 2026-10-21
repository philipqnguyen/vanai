import {MaterialPluginBase,ShadowDepthWrapper,Mesh,VertexData,Vector3,Matrix} from '@babylonjs/core';
const TAU=Math.PI*2,clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));

// Eight uniform controls, native body palette only. No secondary rig or collision state.
class SwayMaterial extends MaterialPluginBase {
 constructor(material:any,public drape:SwayDrape){super(material,'EightRegionSway',210,{},true,false);this.registerForExtraEvents=true;this._enable(true);material.shadowDepthWrapper=new ShadowDepthWrapper(material,drape.scene);}
 getAttributes(attributes:string[]){attributes.push('swayRoot','swayUV');}
 getUniforms(){return {ubo:[{name:'swayControls',size:4,type:'vec4',arraySize:8}],vertex:'uniform vec4 swayControls[8];'};}
 hardBindForSubMesh(buffer:any,_scene:any,_engine:any,subMesh:any){
  // Per-mesh data allows the cost probe to share source materials across repeated avatars.
  const d=subMesh.getRenderingMesh().metadata?.swayDrape??this.drape;
  buffer.updateFloatArray('swayControls',d.controls);
 }
 getCustomCode(type:string){if(type!=='vertex')return null;return {
  CUSTOM_VERTEX_DEFINITIONS:`attribute vec3 swayRoot;
attribute vec2 swayUV;
vec4 regionSway(float u){float q=fract(u)*8.0;int a=int(floor(q));int b=(a+1)%8;float f=fract(q);f=f*f*(3.0-2.0*f);return mix(swayControls[a],swayControls[b],f);}`,
  // Native matrices act on the root point; the hanging offset stays in avatar space.
  // The same injected vertex code is reused by ShadowDepthWrapper, including alpha discard.
  '!vec4 worldPos=finalWorld\\*vec4\\(positionUpdated,1.0\\);':`vec4 swayField=regionSway(swayUV.x);
float swayHeight=min(swayUV.y/max(swayField.z,0.05),1.0);
vec2 swayDelta=swayField.xy*swayHeight*swayHeight;
vec3 hangingOffset=positionUpdated-swayRoot+vec3(swayDelta.x,0.0,swayDelta.y);
vec4 worldPos=finalWorld*vec4(swayRoot,1.0)+world*vec4(hangingOffset,0.0);`,
  '!mat3 normalWorld=mat3\\(finalWorld\\);':'mat3 normalWorld=mat3(world);'
 };}
}

export class SwayDrape {
 mesh:Mesh;positions:number[]=[];indices:number[]=[];uvs:number[]=[];joints:number[]=[];weights:number[]=[];
 controls=new Float32Array(32);active=Array(8).fill(1);mode='full';enabled=true;time=0;steps=0;
 amplitudeScale=1;speed=0;turn=0;targetSpeed=0;targetTurn=0;phase=0;n:number;C=8;S=0;
 constructor(public scene:any,public body:Mesh,public cfg:any){
  this.n=cfg.root.positions.length;const root=cfg.root,intervals=cfg.recipe.mesh_axial_intervals,roots:number[]=[],coords:number[]=[];
  for(let row=0;row<=intervals;row++)for(let i=0;i<=this.n;i++){
   const id=i%this.n,t=row/intervals,rawAngle=root.angles[id],a=rawAngle+(i===this.n?TAU:0),wrappedAngle=((rawAngle%TAU)+TAU)%TAU,textureAngle=wrappedAngle+(i===this.n?TAU:0),r=root.positions[id];
   // `transition_drop_m` is the ramp: the drop over which a panel reaches full push. It is PER ROOT,
   // indexed like `radial_offset_m`, so each panel can hold the same tip angle whatever its length -
   // the canonical drape system, approved 2026-09-17 at theta = 23.820464 degrees.
   // THE SCALAR BRANCH IS THE RETIREMENT PATH, NOT A SUPPORTED OPTION: every config accepted before
   // that ruling carries one number for the whole garment, and this reads it so those packages keep
   // building. New work emits an array. Drop the scalar read once nothing accepted still carries one.
   const profile=cfg.standing_profile,td=profile?(Array.isArray(profile.transition_drop_m)?profile.transition_drop_m[id]:profile.transition_drop_m):1,q=profile?Math.min(1,(r[1]-cfg.hem_y_m)*t/td):0;
   // The standing curve, canonical here rather than patched into each package copy after the fact.
   // `arc` at bias 3.8018 is the approved shape; it used to live only in ring_drape.py's patcher, so
   // this file rendered smoothstep for a config that asked for arc and looked entirely healthy doing it.
   // AN UNRECOGNISED CURVE THROWS. Falling through to smoothstep is how a config can name a shape, not
   // get it, and leave no trace - the failure mode that costs an afternoon. Absent is still the old
   // default, because every config predating the field meant smoothstep by saying nothing.
   const curve=(()=>{
    if(!profile)return q*q*(3-2*q);
    const s=q*q*q*(10+q*(-15+6*q)),c=profile.curve;
    if(c===undefined||c===null)return q*q*(3-2*q);
    if(c==='arc')return 1-Math.pow(1-q,profile.curve_bias??2);
    if(c==='bias')return Math.pow(s,profile.curve_bias??1);
    if(c==='smootherstep')return s;
    throw new Error('drape standing_profile.curve is '+JSON.stringify(c)+'; expected arc, bias, smootherstep or absent');
   })();
   const radial=profile?profile.radial_offset_m[id]*curve:cfg.recipe.hem_radial_ease_m*t;
   this.positions.push(r[0]+Math.sin(a)*radial,r[1]+(cfg.hem_y_m-r[1])*t,r[2]+Math.cos(a)*radial);
   // Ring extraction leaves the final quadrant's equivalent angles negative. Keep `a` for geometry so this
   // UV correction cannot move a vertex, but wrap texture/sway coordinates before duplicating the seam.
   // Otherwise the last cell interpolates from about -0.03 to 1.00 and sweeps almost the whole artwork atlas.
   this.uvs.push(textureAngle/TAU,1-t);roots.push(...r);coords.push(textureAngle/TAU,t);
   for(let s=0;s<8;s++){this.joints.push(root.joints[id][s]??0);this.weights.push(root.weights[id][s]??0);}
   if(row<intervals&&i<this.n){const a0=row*(this.n+1)+i,b0=a0+1,c0=a0+this.n+1,d0=c0+1;this.indices.push(a0,c0,b0,b0,c0,d0);}
  }
  this.mesh=new Mesh('Fixed ankle template with eight-region sway',scene);this.mesh.parent=body.parent;
  this.mesh.skeleton=body.skeleton;this.mesh.numBoneInfluencers=8;this.mesh.alwaysSelectAsActiveMesh=true;this.mesh.metadata={swayDrape:this};
  const vd=new VertexData();vd.positions=this.positions;vd.indices=this.indices;vd.uvs=this.uvs;vd.normals=[];if(cfg.normal_convention!==undefined&&cfg.normal_convention!=='outward-rhs-v1')throw new Error('Unknown drape normal convention');/* Source geometry remains RHS beneath the native GLTF conversion parent. */VertexData.ComputeNormals(vd.positions,vd.indices,vd.normals,cfg.normal_convention==='outward-rhs-v1'?{useRightHandedSystem:true}:undefined);
  vd.matricesIndices=[];vd.matricesWeights=[];vd.matricesIndicesExtra=[];vd.matricesWeightsExtra=[];
  for(let i=0;i<this.positions.length/3;i++){vd.matricesIndices.push(...this.joints.slice(i*8,i*8+4));vd.matricesWeights.push(...this.weights.slice(i*8,i*8+4));vd.matricesIndicesExtra.push(...this.joints.slice(i*8+4,i*8+8));vd.matricesWeightsExtra.push(...this.weights.slice(i*8+4,i*8+8));}
  vd.applyToMesh(this.mesh);this.mesh.setVerticesData('swayRoot',roots,false,3);this.mesh.setVerticesData('swayUV',coords,false,2);
  // Only the build reads these (the mesh holds the result; `uvs` feeds the
  // robe's visibility map), and every drape of every actor kept them.
  this.positions=[];this.indices=[];this.joints=[];this.weights=[];
 }
 attachMaterial(material:any){this.mesh.material=material;return new SwayMaterial(material,this);}
 visibleLength(u:number){if(this.mode==='none')return 0;const wrapped=((u%1)+1)%1;if(this.mode==='item'&&this.cfg.visibility){const rows=this.cfg.visibility.angularHemProfile;return rows[Math.floor(wrapped*rows.length)].visibleLength;}const theta=wrapped*TAU;if(this.mode==='short')return .43;if(this.mode==='sides'){const d=Math.min(Math.abs(theta-Math.PI/2),Math.abs(theta-3*Math.PI/2));return d<=Math.PI/4+1e-8?1:0;}if(this.mode==='robe'){const q=wrapped*8;return .9+.1*(1-Math.abs((q%1)*2-1));}return 1;}
 setMode(mode:string){this.mode=mode;for(let c=0;c<8;c++)this.active[c]=mode==='item'?this.cfg.visibility.regions[c].visibleLength:mode==='robe'?1:this.visibleLength(c/8);if(mode==='none')this.controls.fill(0);}
 setMotion(speed:number,turn:number){const s=this.cfg.recipe.sway;this.targetSpeed=clamp(Number.isFinite(speed)?speed:0,0,s.maximum_speed_m_s);this.targetTurn=clamp(Number.isFinite(turn)?turn:0,-s.maximum_turn_rad_s,s.maximum_turn_rad_s);}
 setAmplitude(value:number){this.amplitudeScale=clamp(Number.isFinite(value)?value:1,0,1.5);}
 reset(){this.phase=this.time=0;this.speed=this.targetSpeed;this.turn=this.targetTurn;this.controls.fill(0);this.steps=0;}
 step(dt:number){
  if(!this.mesh.isEnabled()||this.mode==='none')return;
  if(!this.enabled){this.controls.fill(0);return;}
  const s=this.cfg.recipe.sway;dt=clamp(Number.isFinite(dt)?dt:0,0,.05);const blend=1-Math.exp(-dt*s.input_response);
  this.speed+=(this.targetSpeed-this.speed)*blend;this.turn+=(this.targetTurn-this.turn)*blend;
  this.time+=dt;this.phase=(this.phase+dt*(s.idle_frequency_rad_s+s.speed_frequency*this.speed))%TAU;
  const motion=this.speed/s.maximum_speed_m_s,turn=this.turn/s.maximum_turn_rad_s,amplitude=s.idle_amplitude_m+(s.maximum_amplitude_m-s.idle_amplitude_m)*motion;
  for(let c=0;c<8;c++){
   const angle=c/8*TAU;let x=amplitude*Math.sin(this.phase+Math.sin(angle)*.45)+turn*s.turn_amplitude_m*Math.cos(angle),z=amplitude*.55*Math.cos(this.phase)+turn*s.turn_amplitude_m*Math.sin(angle);
   const support=s.normalize_visible_hem?Math.max(.43,this.active[c]):1;
   const shortScale=s.normalize_visible_hem&&support<=.5?(s.short_hem_amplitude_scale??1):1;
   const scale=this.amplitudeScale*shortScale;x*=scale;z*=scale;
   const cap=Math.min(s.maximum_amplitude_m*scale,s.absolute_maximum_amplitude_m??s.maximum_amplitude_m),length=Math.hypot(x,z);
   if(length>cap&&length>0){x*=cap/length;z*=cap/length;}
   this.controls[c*4]=x;this.controls[c*4+1]=z;this.controls[c*4+2]=support;
  }
  this.steps++;
 }
 offset(u:number,t:number){const q=(((u%1)+1)%1)*8,a=Math.floor(q),b=(a+1)%8,v=q-a,f=v*v*(3-2*v);const height=Math.min(t/Math.max(.05,this.controls[a*4+2]*(1-f)+this.controls[b*4+2]*f),1);return [(this.controls[a*4]*(1-f)+this.controls[b*4]*f)*height*height,0,(this.controls[a*4+1]*(1-f)+this.controls[b*4+1]*f)*height*height];}
 // CPU reference is for one-time shader/baked-render validation, never the frame update path.
 referencePositions(){this.body.skeleton!.prepare();const palette=this.body.skeleton!.getTransformMatrices(this.body),p=this.mesh.getVerticesData('position')!,r=this.mesh.getVerticesData('swayRoot')!,uv=this.mesh.getVerticesData('swayUV')!,js=this.mesh.getVerticesData('matricesIndices')!,ws=this.mesh.getVerticesData('matricesWeights')!,je=this.mesh.getVerticesData('matricesIndicesExtra')!,we=this.mesh.getVerticesData('matricesWeightsExtra')!,out:number[]=[];
  for(let i=0;i<p.length/3;i++){const root=Vector3.FromArray(r,i*3),posed=Vector3.Zero();for(let k=0;k<8;k++){const j=k<4?js[i*4+k]:je[i*4+k-4],w=k<4?ws[i*4+k]:we[i*4+k-4];if(w)posed.addInPlace(Vector3.TransformCoordinates(root,Matrix.FromArray(palette,j*16)).scale(w));}const delta=this.offset(uv[i*2],uv[i*2+1]);out.push(posed.x+p[i*3]-root.x+delta[0],posed.y+p[i*3+1]-root.y,posed.z+p[i*3+2]-root.z+delta[2]);}return out;}
 diagnostics(){return {mechanism:'eight-region-vertex-sway',dedicatedDrapeBones:0,particleNodes:0,collisionPasses:0,nativeSkeletonShared:this.mesh.skeleton===this.body.skeleton,regions:8,mode:this.mode,finite:[...this.controls,this.speed,this.turn,this.phase].every(Number.isFinite),maximumControlOffset_m:Math.max(...Array.from({length:8},(_,c)=>Math.hypot(this.controls[c*4],this.controls[c*4+1]))),rootSwayOffset_m:Math.hypot(...this.offset(.37,0)),steps:this.steps};}
}
