import {KhronosTextureContainer2} from '@babylonjs/core';
import type {Pin} from './components';
import {packedIndex,refPin,type Ref} from '../asset-index';

// Packed gear (the maker's tools/runtime/pack): a derived copy of an approved GLB
// or drape texture, in the index only when it passed the numeric checks against
// that exact source, so it carries the source's approval (Philip, 2026-10-12).
// The index lists it under the source's hash; the approved file itself is not
// shipped, so there is no fallback to it.
// Every gear image is at most 1024² (Philip, 2026-10-14: "All at 1024. I don't
// want 2048 anymore"): the index names the packer's 1024² copy of anything larger
// (the source's own mip level, what the GPU samples at play distance), for every
// character and every view alike.
export const packedModel=(pin:Pin)=>packedIndex.models[pin.sha256];
/** A packed model's image, by the URI the packed file names it with. */
export const packedImage=(image:Ref):Pin=>refPin(image);
/** The KTX2 copy of a drape or collar texture (encoded y-flipped for invertY), if packed. */
export function packedTexture(pin:Pin){const t=packedIndex.textures[pin.sha256];return t&&refPin(t);}
// KTX2 transcoders are served from /ktx2/ (copied from babylonjs-ktx2decoder and
// Babylon's transcoder set), never fetched from a CDN.
const KTX2='/ktx2/';
KhronosTextureContainer2.URLConfig={jsDecoderModule:KTX2+'babylon.ktx2Decoder.js',wasmUASTCToASTC:KTX2+'uastc_astc.wasm',wasmUASTCToBC7:KTX2+'uastc_bc7.wasm',
 wasmUASTCToRGBA_UNORM:KTX2+'uastc_rgba8_unorm_v2.wasm',wasmUASTCToRGBA_SRGB:KTX2+'uastc_rgba8_srgb_v2.wasm',wasmUASTCToR8_UNORM:KTX2+'uastc_r8_unorm.wasm',
 wasmUASTCToRG8_UNORM:KTX2+'uastc_rg8_unorm.wasm',jsMSCTranscoder:KTX2+'msc_basis_transcoder.js',wasmMSCTranscoder:KTX2+'msc_basis_transcoder.wasm',wasmZSTDDecoder:KTX2+'zstddec.wasm'};
