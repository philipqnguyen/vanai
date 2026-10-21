import {Vector4} from '@babylonjs/core';
/** Babylon's side/top U axes follow height/depth, not width on every face. */
export function dungeonBoxUV(w:number,h:number,d:number,tile:number):Vector4[]{
 const f=(u:number,v:number)=>new Vector4(0,0,u/tile,v/tile);
 return [f(w,h),f(w,h),f(h,d),f(h,d),f(d,w),f(d,w)];
}
