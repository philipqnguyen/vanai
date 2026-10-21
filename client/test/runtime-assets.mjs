// The maker's files for node tests, through the same index the game loads by
// (client/src/asset-index.json) and the runtime folder it names (VANAI_RUNTIME).
import fs from 'node:fs';
import {extname} from 'node:path';
import {runtimeRoot} from '../../scripts/runtime-root.mjs';
export const index=JSON.parse(fs.readFileSync(new URL('../src/asset-index.json',import.meta.url)));
export const gear=index.gear;
const runtime=runtimeRoot();
export const file=name=>fs.readFileSync(`${runtime}/files/${name}`);
/** A maker file by its path ('models/characters/aedri-male/body.glb', 'design/gear/…'). */
export function readPath(rel){const r=index.paths[rel];if(!r)throw Error('Not in the asset index: '+rel);return file(r.h);}
export const readJson=rel=>JSON.parse(readPath(rel));
/** The hash of the maker's own file at `rel`: a packed copy names its source. */
export const sourceSha=rel=>index.paths[rel].src??index.paths[rel].h.slice(0,64);
/** A gear pin's approved bytes as shipped, or null when a packed copy replaces them. */
export function readPin(pin){
 if(index.packed.models[pin.sha256]||index.packed.textures[pin.sha256])return null;
 return file(pin.sha256+extname(pin.url).toLowerCase());
}
