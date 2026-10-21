// Shared outdoor atmosphere, originally authored for Moonmere.
// Uses world time for colour and transparency; the cloud pattern stays fixed.
import { Scene, Mesh, MeshBuilder, ShaderMaterial, Effect } from '@babylonjs/core';
export function buildCoastalSky(scene:Scene, phase:()=>number):void {
  Effect.ShadersStore.coastalSkyVertexShader=`precision highp float;
    attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 direction;
    void main(){direction=position;gl_Position=worldViewProjection*vec4(position,1.);}`;
  Effect.ShadersStore.coastalSkyFragmentShader=`precision highp float;
    varying vec3 direction;uniform float daylight;uniform float dusk;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
    float fbm(vec2 p){return noise(p)*.53+noise(p*2.03)*.27+noise(p*4.11)*.13+noise(p*8.2)*.07;}
    void main(){vec3 d=normalize(direction);float h=max(d.y,0.);
      vec3 day=mix(vec3(.70,.82,.86),vec3(.18,.42,.64),pow(h,.43));
      day=mix(day,vec3(.76,.48,.32),dusk*pow(1.-h,4.)*.45);
      vec3 color=mix(vec3(.024,.037,.071),day,daylight);
      vec2 p=d.xz/max(.12,h)*1.8+vec2(7.,3.);
      float cloud=smoothstep(.53,.72,fbm(p))*smoothstep(.08,.2,h);
      vec3 cloudColor=mix(vec3(.08,.10,.16),vec3(.96,.94,.85),daylight);
      float cloudAlpha=cloud*.78;
      float alpha=cloudAlpha+daylight*(1.-cloudAlpha);
      color=(cloudColor*cloudAlpha+color*daylight*(1.-cloudAlpha))/max(alpha,.0001);
      gl_FragColor=vec4(color,alpha);}`;
  const dome=MeshBuilder.CreateSphere('coastal sky',{diameter:2280,segments:32,sideOrientation:Mesh.BACKSIDE},scene);
  const mat=new ShaderMaterial('coastal daylight atmosphere',scene,{vertex:'coastalSky',fragment:'coastalSky'},
    {attributes:['position'],uniforms:['worldViewProjection','daylight','dusk'],needAlphaBlending:true});
  // The shared sky already supplies coloured stars and their day/night fade.
  // Clear night air lets that dome through; coastal clouds still veil it.
  // Sort after the shared sky domes (0), before celestial discs and scenery.
  dome.alphaIndex=1;
  mat.backFaceCulling=false;dome.material=mat;dome.isPickable=false;
  const update=()=>{const el=Math.sin(phase()*Math.PI*2);mat.setFloat('daylight',Math.min(1,Math.max(0,el*2.2)));mat.setFloat('dusk',el>=0?Math.max(0,1-el*2.1):0);};
  scene.onBeforeRenderObservable.add(update);update();
}
