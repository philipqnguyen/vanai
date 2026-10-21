export interface DungeonRamp {x0:number;z0:number;y0:number;x1:number;z1:number;y1:number;half:number}
/** A single exposed floor per horizontal location; upper galleries are reached
 * through explicit flights, not inferred from a room's rectangular footprint. */
export function dungeonFloor(heights:Record<string,number>,ramps:readonly DungeonRamp[],x:number,z:number):number{
 for(const r of ramps){const dx=r.x1-r.x0,dz=r.z1-r.z0,len=Math.hypot(dx,dz),t=((x-r.x0)*dx+(z-r.z0)*dz)/(len*len),across=Math.abs((x-r.x0)*dz-(z-r.z0)*dx)/len;
  if(t>=-.3/len&&t<=1+.3/len&&across<=r.half+.05)return r.y0+(r.y1-r.y0)*Math.max(0,Math.min(1,t));
 }
 return heights[`${Math.floor(x/4+.5)},${Math.floor(z/4+.5)}`]??0;
}
