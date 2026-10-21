Vendored KTX2 decoder (client/src/ktx2.ts): Babylon.js v9.22.0 `babylon.ktx2Decoder.js`
and its transcoders from https://cdn.babylonjs.com/ktx2Transcoders/1/ (`msc_basis_transcoder`,
the `uastc_*` wasm) and `zstddec.wasm` from https://cdn.babylonjs.com/zstddec.wasm, fetched
2026-10-13. Babylon.js and Basis Universal are Apache-2.0 (LICENSE-Apache-2.0.md).
Replace them together when @babylonjs/core is upgraded.

`zstddec.wasm` is the Zstandard decompressor, loaded only for a KTX2 file whose header says
it is zstd-supercompressed. The creature atlases here are ETC1S (BasisLZ) and never load it,
but every character and gear texture in the maker's runtime is UASTC + zstd (9,585 files
measured 2026-10-18), so a body cannot draw without it. It is built by Don McCurdy's
zstddec (MIT), whose JavaScript wrapper Babylon bundles into babylon.ktx2Decoder.js, from
Zstandard (BSD-3-Clause); both notices are in LICENSE-zstddec.txt.
