import type {Pin} from './gear/components';

/** The maker's assets, by the index it prepared (npm run assets:import; ASSETS.md).
 * Every file is named by its content, <sha256>.<ext>, under one folder: served at
 * /assets/files/ in development (VANAI_RUNTIME) and from VITE_ASSET_BASE in
 * production (a bucket, or /runtime on the game's server; DEPLOY.md). The game's own generated assets (creatures,
 * cities, props) stay in public/ and never go through here. */
export type Ref={h:string;b:number};
// a glob, not an import: the index is 6 MB, and typing it from its JSON slows tsc
const index=Object.values(import.meta.glob('./asset-index.json',{eager:true,import:'default'}))[0] as {gear:any;packed:any;paths:Record<string,Ref>};
if(!index)throw Error('No client/src/asset-index.json: npm run assets:import');
export const ASSET_BASE=((import.meta.env.VITE_ASSET_BASE as string|undefined)??'/assets').replace(/\/$/,'');
const FILES=ASSET_BASE+'/files/';
export const fileUrl=(name:string)=>FILES+name;
/** A file of the index as a pin the gear loaders fetch and check. */
export const refPin=(r:Ref):Pin=>({url:fileUrl(r.h),sha256:r.h.slice(0,r.h.indexOf('.')),bytes:r.b});
/** Where a gear manifest pin (a url under /gear, its sha256) is served: by its hash. */
export function pinUrl(pin:Pin):string{
 if(pin.url.startsWith(FILES))return pin.url;
 const dot=pin.url.lastIndexOf('.');return fileUrl(pin.sha256+(dot>pin.url.lastIndexOf('/')?pin.url.slice(dot).toLowerCase():''));
}
const paths=index.paths;
/** A maker file by its path under public/ ('models/characters/aedri-male/body.glb',
 * 'animations/vanai-sword-v02/clip.json'): its URL in the one folder. */
export function runtimePath(path:string):Pin{
 const r=paths[path];if(!r)throw Error('Not in the asset index: '+path+' (npm run assets:import)');
 return refPin(r);
}
export const gear=index.gear as {catalog:any;weapons:any;traveler:any};
export const packedIndex=index.packed as {models:Record<string,Ref&{images:Record<string,Ref>}>;textures:Record<string,Ref>};
