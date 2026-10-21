import {MaterialPluginBase,Texture,Mesh} from '@babylonjs/core';

/** One original-pixel projection for every adjoining torso component.
 * Evaluate after interpolation in immutable bind coordinates: coincident joins
 * sample the same source point even when their triangulations differ. No blur,
 * replacement trim, UV0 changes or position/skinning edits are needed.
 */
export class CoordinatedArtwork extends MaterialPluginBase {
 enabled=true;
 constructor(material:any,private source:Texture,private recipe:any){
  super(material,'WildweaveCoordinatedArtwork',240,{},true,false);
  this.registerForExtraEvents=true;this._enable(true);
 }
 getAttributes(a:string[]){a.push('artworkPosition');}
 getClassName(){return 'WildweaveCoordinatedArtwork';}
 getSamplers(a:string[]){a.push('wildweaveReference');}
 getActiveTextures(a:Texture[]){a.push(this.source);}
 isReadyForSubMesh(){return this.source.isReady();}
 getUniforms(){return {ubo:[{name:'wildweaveArtEnabled',size:1,type:'float'}],fragment:'uniform float wildweaveArtEnabled;'};}
 hardBindForSubMesh(buffer:any){buffer.setTexture('wildweaveReference',this.source);buffer.updateFloat('wildweaveArtEnabled',this.enabled?1:0);}
 getCustomCode(type:string):any{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'attribute vec3 artworkPosition; varying vec3 vArtworkPosition;',CUSTOM_VERTEX_MAIN_BEGIN:'vArtworkPosition=artworkPosition;'};
  if(type!=='fragment')return null;
  // Babylon discovers hook names inside super(), before recipe assignment.
  if(!this.recipe)return {CUSTOM_FRAGMENT_DEFINITIONS:'',CUSTOM_FRAGMENT_BEFORE_LIGHTS:''};
  const r=this.recipe,f=(x:number)=>'('+Number(x).toFixed(8)+')',v=(a:number[])=>'vec2('+a.map(f).join(',')+')';
  const paths=Object.entries(r.arms).map(([name,points]:any)=>`vec2 ${name}(float x){${points.slice(1).map((p:number[],i:number)=>`if(x<=${f(p[0])})return mix(${v(points[i].slice(1))},${v(p.slice(1))},clamp((x-${f(points[i][0])})/${f(p[0]-points[i][0])},0.0,1.0));`).join('')}return ${v(points.at(-1).slice(1))};}`).join('\n');
  return {CUSTOM_FRAGMENT_DEFINITIONS:`varying vec3 vArtworkPosition;
uniform sampler2D wildweaveReference;
${paths}
vec2 wildweaveUV(vec3 p){
 float x=abs(p.x), drop=max(0.0,${f(r.arm_axis_y_m)}-p.y);
 bool front=p.z>=${f(r.center_z_m)};
 float lower=clamp((${f(r.flare_hem_y_m)}-p.y)/${f(r.flare_hem_y_m-r.ankle_y_m)},0.0,1.0);
 float width=mix(${f(r.upper_half_width_m)},${f(r.lower_half_width_m)},lower);
 float px=(front?315.0:855.0)+(front?1.0:-1.0)*p.x/width*mix(70.0,180.0,lower);
 float hemPixel=front?frontHem(px).x:backHem(px).x;
 float py=p.y>=${f(r.flare_hem_y_m)}?${f(r.reference_root_y)}+(${f(r.flare_hem_y_m)}-p.y)*${f((r.reference_root_y-r.reference_neck_y)/(r.neck_y_m-r.flare_hem_y_m))}:mix(${f(r.reference_root_y)},hemPixel,lower);
 vec2 torso=vec2(px,max(${f(r.reference_neck_y)},py));
 // Source-view transition is shared by torso, flare and lower panels. The
 // side chart contains genuine side-view pixels; its seam is disclosed.
 float radial=abs(p.z-${f(r.center_z_m)})/max(length(vec2(p.x,p.z-${f(r.center_z_m)})),0.001);
 if(radial<0.42&&p.y<1.30){float depth=clamp((p.z-${f(r.center_z_m)})/max(width,0.01),-1.0,1.0);torso=vec2(1320.0+depth*110.0,(p.y>=${f(r.flare_hem_y_m)}?py:mix(${f(r.reference_root_y)},886.0-30.0*abs(depth),lower)));}
 vec2 arm=front?(p.x>0.0?frontLeft(x):frontRight(x)):(p.x>0.0?backLeft(x):backRight(x));
 arm.x+=drop*(front?(p.x>0.0?${f(r.arm_horizontal_drop_scale.frontLeft)}:${f(r.arm_horizontal_drop_scale.frontRight)}):(p.x>0.0?${f(r.arm_horizontal_drop_scale.backLeft)}:${f(r.arm_horizontal_drop_scale.backRight)}))*clamp((x-0.318)/0.668,0.0,1.0);
 arm.y+=(${f(r.arm_axis_y_m)}-p.y)*${f(r.arm_drop_pixels_per_m)};
 float armStart=${f(r.arm_start_x_m)}+max(0.0,${f(r.arm_axis_y_m-.12)}-p.y)*0.7;
 float armWeight=smoothstep(armStart,armStart+${f(r.arm_transition_m)},x);
 vec2 pixel=mix(torso,arm,armWeight);
 return vec2(pixel.x/${f(r.image_size[0])},1.0-pixel.y/${f(r.image_size[1])});
}`,
 CUSTOM_FRAGMENT_BEFORE_LIGHTS:'if(wildweaveArtEnabled>0.5){surfaceAlbedo=toLinearSpace(texture2D(wildweaveReference,wildweaveUV(vArtworkPosition)).rgb);}'};
 }
}

export function retainArtworkCoordinates(mesh:Mesh){
 // A separate attribute survives the independent CPU-baked motion comparison.
 mesh.setVerticesData('artworkPosition',Array.from(mesh.getVerticesData('position')!),false,3);
}
