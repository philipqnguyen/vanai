import {Color3, DynamicTexture, Mesh, MeshBuilder, PointLight, Quaternion, StandardMaterial, Texture, Vector3, VertexData} from '@babylonjs/core';
import {scene, buildApi, addShadowCaster} from '../scene';
import {dungeonBoxUV} from './dungeon-box-uv';

/** Construction primitives only: each dungeon owns its architecture and plan. */
export function dungeonCraft(prefix:string){
  const batches=new Map<StandardMaterial,Mesh[]>(),lamps:Vector3[]=[];
  const material=(name:string,color:string,texture?:string)=>{const m=new StandardMaterial(`${prefix}_${name}`,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.FromHexString('#28221b');m.emissiveColor=m.diffuseColor.scale(.10);m.maxSimultaneousLights=6;if(texture)m.diffuseTexture=new Texture(texture,scene);return m;};
  const keep=(mesh:Mesh,m:StandardMaterial)=>{mesh.material=m;mesh.isPickable=false;const b=batches.get(m)??[];b.push(mesh);batches.set(m,b);return mesh;};
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial,rot=0)=>{const tile=m.metadata?.tile;const b=MeshBuilder.CreateBox(`${prefix}_${name}`,{width:w,height:h,depth:d,faceUV:tile?dungeonBoxUV(w,h,d,tile):undefined},scene);b.position.set(x,y,z);b.rotation.y=rot;return keep(b,m);};
  const cylinder=(name:string,x:number,y:number,z:number,h:number,diameter:number,m:StandardMaterial,top=diameter)=>{const b=MeshBuilder.CreateCylinder(`${prefix}_${name}`,{height:h,diameterBottom:diameter,diameterTop:top,tessellation:16},scene);b.position.set(x,y,z);return keep(b,m);};
  const beam=(name:string,a:number[],b:number[],width:number,m:StandardMaterial)=>{const from=Vector3.FromArray(a),to=Vector3.FromArray(b),mesh=box(name,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,Vector3.Distance(from,to),width,m);const dir=to.subtract(from).normalize(),axis=Vector3.Cross(Vector3.Up(),dir);mesh.rotationQuaternion=axis.lengthSquared()<1e-10?Quaternion.Identity():Quaternion.RotationAxis(axis.normalize(),Math.acos(dir.y));return mesh;};
  const geometry=(name:string,positions:number[],indices:number[],m:StandardMaterial,uvs?:number[])=>{const mesh=new Mesh(`${prefix}_${name}`,scene),v=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);v.positions=positions;v.indices=indices;v.normals=normals;v.uvs=uvs??positions.flatMap((_,i)=>i%3===0?[positions[i]/4,positions[i+2]/4]:[]);v.applyToMesh(mesh);return keep(mesh,m);};
  const solid=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial,rot=0)=>{const b=box(name,x,y+h/2,z,w,h,d,m,rot);buildApi.addBoxCollider(x,z,w/2,d/2,rot,y+h,y);return b;};
  const finish=(opts: { shadows?: boolean; lights?: boolean } = {})=>{for(const[m,list]of batches)for(let k=0;k<list.length;k+=120){const merged=Mesh.MergeMeshes(list.slice(k,k+120),true,true,undefined,false,false);if(merged){merged.name=`${prefix}_built_${m.name}_${k}`;merged.isPickable=true;merged.freezeWorldMatrix();if(opts.shadows)addShadowCaster(merged);}}if(opts.lights===false)return;const slots=Array.from({length:4},(_,i)=>{const l=new PointLight(`${prefix}_lamp_${i}`,Vector3.Zero(),scene);l.diffuse=Color3.FromHexString('#ffe2b2');l.intensity=2;l.range=22;return l;});scene.onBeforeRenderObservable.add(()=>{const p=scene.activeCamera?.position;if(!p)return;const nearest=lamps.map(l=>({l,d:Vector3.DistanceSquared(p,l)})).sort((a,b)=>a.d-b.d);slots.forEach((slot,i)=>{if(nearest[i])slot.position.copyFrom(nearest[i].l);else slot.setEnabled(false);});});};
  return {material,keep,box,cylinder,beam,geometry,solid,lamps,finish};
}

/** Running-bond brick shared by the furnace hall and outdoor kilns. Neutral
 * mortar and slight course variation keep masonry legible at gameplay scale. */
export function brickTexture(name: string, base: [number, number, number] = [112, 84, 66], mortar = '#49433c'): DynamicTexture {
  const texture = new DynamicTexture(name, {width:256,height:256}, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = mortar; ctx.fillRect(0,0,256,256);
  for(let row=0;row<16;row++) for(let n=-1;n<9;n++) {
    const v=(row*13+n*7+200)%24;
    ctx.fillStyle=`rgb(${base[0]+v},${base[1]+v},${base[2]+v})`;
    ctx.fillRect(n*32+(row%2)*16+1,row*16+1,30,14);
  }
  texture.update();return texture;
}

// ---------------------------------------------------------------------------
// Dungeon kit v2 (client/src/dungeon-kit/, DUNGEONS.md): the game glue every
// dungeon builds through. dungeonCraft above is no dungeon's now: Glassworks
// uses it for its kilns and work shelters (BUILDINGS.md).
import { DungeonKit, planGroups, themeFor, type KitLayout, type KitOptions, type ShellOpts, type ThemePreset, type KitPlan } from '../dungeon-kit/index.ts';
import { glow, setZoneFog } from '../scene';
import { Color4 } from '@babylonjs/core';

export interface DungeonKitGlue {
  kit: DungeonKit; plan: KitPlan; theme: ThemePreset;
  /** build every group's shell and register its colliders and camera rooms */
  shell: (o?: Partial<ShellOpts>) => ReturnType<DungeonKit['shell']>;
}

/**
 * A kit bound to the zone being built: the scene, the glow layer, the theme's
 * fog and clear colour applied, and a shell() that also registers every wall
 * collider and camera room with buildApi (RULINGS.md: addCameraRoom for every
 * room, stair and corridor). Call kit.finish() at the end of the build.
 * Pass the module's `hemi` as theme.hemi in registerZone.
 */
export function dungeonKit(prefix: string, themeKey: string, layout: KitLayout, opts: Partial<KitOptions> & { corridorRun?: number } = {}): DungeonKitGlue {
  const theme = themeFor(themeKey), plan = planGroups(layout, { corridorRun: opts.corridorRun });
  scene.clearColor = Color4.FromHexString(theme.clear + 'ff');
  setZoneFog(theme.fog.density, theme.fog.color, theme.fog.color);
  const kit = new DungeonKit(scene, theme, plan, { glow, glowOccluders: false, ...opts, prefix });
  const shell = (o: Partial<ShellOpts> = {}) => {
    const r = kit.shell(o);
    for (const c of r.colliders) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
    for (const c of r.cameraRooms) buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: 0, cos: 1, y0: c.y0, y1: c.y1, cameraRadius: c.cameraRadius });
    return r;
  };
  return { kit, plan, theme, shell };
}
