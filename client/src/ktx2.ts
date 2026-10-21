// KTX2 (Basis Universal) textures: the bestiary's creature atlases ship as
// KTX2 -- ETC1S, about a JPEG's download, held on the GPU as ASTC 4x4 or BC7,
// a quarter of RGBA8 (tools/assets/creatures/ktx2.py; BESTIARY.md "Textures").
//
// Babylon fetches its KTX2 decoder and the Basis transcoder wasm from
// cdn.babylonjs.com by default. They are vendored instead, in public/ktx2/
// (Babylon's v9.22.0 babylon.ktx2Decoder.js and its ktx2Transcoders/1 files,
// Apache-2.0), so the game serves everything itself. Measured working through
// the stock glTF loader (KHR_texture_basisu) in Chrome and WebKit, 2026-10-13.
// Importing this module configures the decoder; @babylonjs/core's index
// already registers the .ktx2 texture loader (a palette variant's atlas).
// Imported from "@babylonjs/core" itself, never a deep path: a deep path is a
// second copy of the class in Vite's dev bundle, and the loader would never
// see this configuration (palette_sheets.test.mjs).
import { KhronosTextureContainer2 } from "@babylonjs/core";

const K = "/ktx2/";
KhronosTextureContainer2.URLConfig = {
  jsDecoderModule: K + "babylon.ktx2Decoder.js",
  wasmUASTCToASTC: K + "uastc_astc.wasm",
  wasmUASTCToBC7: K + "uastc_bc7.wasm",
  wasmUASTCToRGBA_UNORM: K + "uastc_rgba8_unorm_v2.wasm",
  wasmUASTCToRGBA_SRGB: K + "uastc_rgba8_srgb_v2.wasm",
  wasmUASTCToR8_UNORM: K + "uastc_r8_unorm.wasm",
  wasmUASTCToRG8_UNORM: K + "uastc_rg8_unorm.wasm",
  jsMSCTranscoder: K + "msc_basis_transcoder.js",
  wasmMSCTranscoder: K + "msc_basis_transcoder.wasm",
  wasmZSTDDecoder: K + "zstddec.wasm",
};
