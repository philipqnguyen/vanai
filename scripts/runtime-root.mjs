import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
// The character runtime folder: index.json and files/<sha256>.<ext>, either fetched
// from the pinned GitHub Release (bin/fetch-runtime) or the maker's own prepared
// folder (its tools/runtime/prepare.mjs). Development serves it at /assets/files/
// and `npm run assets:import` copies its index in; production reads the same files
// from VANAI_ASSET_BASE (DEPLOY.md). It is the only thing this checkout needs from the maker.
export const gameRoot=fileURLToPath(new URL('../',import.meta.url));
export const DEFAULT_RUNTIME='runtime';
/** Where the runtime folder is or would be: VANAI_RUNTIME from the environment or
 * .env (relative to the checkout), else <checkout>/runtime, gitignored. */
export function runtimePath(root=gameRoot,env=process.env){
 const config=resolve(root,'.env'),values=existsSync(config)?parseEnv(readFileSync(config,'utf8')):{};
 return resolve(root,env.VANAI_RUNTIME||values.VANAI_RUNTIME||DEFAULT_RUNTIME);
}
export function runtimeRoot(root=gameRoot,env=process.env){
 const result=runtimePath(root,env);
 if(!existsSync(resolve(result,'index.json'))||!existsSync(resolve(result,'files')))throw Error('No character runtime at '+result+' (index.json, files/): run bin/fetch-runtime, or point VANAI_RUNTIME in .env at a prepared runtime folder (.env.example, ASSETS.md).');
 return realpathSync(result);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(runtimeRoot());
