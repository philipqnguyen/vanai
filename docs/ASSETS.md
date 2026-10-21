# The maker's assets: one folder, one index

Asset production is owned by the separate Vanai Assets Maker. Character bodies, hair, animations, gear builders, recipes, approval records, source objects and the approved payloads live there; their approved bytes are never modified. This game keeps gameplay, loaders and world/city builders, and its own generated assets (creatures, cities, dungeon props, trees) in `client/public`, tracked in git and shipped in the Docker image.

Everything the game loads from the maker crosses as two things only (Philip, 2026-10-14):

- **One folder** of files named by their content, `<sha256>.<ext>`: the maker's `runtime/files/`, written by its `tools/runtime/prepare.mjs`. Served at `/assets/files/` in development and from `VANAI_ASSET_BASE` in production.
- **One index**, `client/src/asset-index.json` (tracked), copied in by `npm run assets:import`. It names every file the game loads by hash: the gear manifests (catalog, weapons, traveler) with their pins, the packed copies (every image at most 1024²), and files by path (`models/characters/…`, `animations/…`, `animation-library/…`, and a few maker records the tests read).

No symlinks, no maker folders in this checkout, no `VANAI_ASSET_ROOT`. `client/test/asset_index.test.mjs` fails if any of the old links or paths come back.

## The runtime folder

The game reads the folder at `VANAI_RUNTIME` (`.env`, relative to this checkout; never a `VITE_*` variable), or `./runtime` (gitignored) when it is unset. Two ways to fill it:

- **Fetched** (anyone): `bin/fetch-runtime` installs the GitHub Release this checkout pins (below); `bin/dev` runs it when the folder is missing or on another release. The default folder needs no `.env` at all.
- **The maker's own** (Philip): `VANAI_RUNTIME=../vanai_assets_maker/runtime`, the folder its `tools/runtime/prepare.mjs` writes. A prepared folder has an `index.json` and no `release.json`, and `fetch-runtime` never writes into one.

The dev and preview servers serve `VANAI_RUNTIME/files` at `/assets/files/` (`client/vite.config.ts`, with a year-long immutable cache: names never change), and `npm test` reads the maker's files through the index from the same folder (`client/test/runtime-assets.mjs`). Restart Vite after editing `.env`.

## Releases

The runtime is published as GitHub Releases of the game repository, tagged `runtime-YYYY.MM.DD.N` (Philip, 2026-10-20: N counts the day's releases from 1; a number, never a letter), by the maker's `tools/runtime/release.mjs`. A release is a full snapshot:

- `index.json`, the index as prepared; `release.json`, the manifest (schema `vanai-runtime-release-v1`: repo, tag, the index's sha256, each archive's sha256, bytes, file count and URL); `SHA256SUMS`.
- the files in archives of stable membership, each a plain ustar of `files/<sha256>.<ext>`, sorted with fixed metadata, then zstd: `characters` (models/characters), `animations` (animations, animation-library, the maker's records), `gear-0` … `gear-f` (gear by item: all bodies' files of an item sit in the archive named by the first hex digit of the item key's sha256; a shared file goes with its first item) and `about` (README, CREDITS, LICENSE, licenses/). The same files make the same bytes, so an archive unchanged since the previous release is not attached again: `release.json` points at the earlier release's copy. **A runtime release is therefore never deleted.** Every archive stays well under GitHub's 2 GiB per attached file (the largest is about 0.33 GB packed).

`bin/fetch-runtime` (`scripts/fetch-runtime.mjs`, Node only, no tar or zstd needed: `scripts/runtime-archive.mjs` reads the archives) downloads `release.json`, then only the archives whose sums the folder's own `release.json` does not already have, verifies each before unpacking it, checks every file the index names, and writes `index.json` and `release.json`. A run that stops part way resumes. `GITHUB_TOKEN` or `GH_TOKEN` reads a private repository through the API.

**The pin.** `npm run assets:import` copies `release` `{repo, tag}` from the runtime folder's `release.json` into `client/src/asset-index.json` when that release was made from the very index being imported (its sha256 matches); otherwise it warns and pins nothing, and `client/test/release_pin.test.mjs` fails, so an index reaches `main` only with the release that matches it. `bin/fetch-runtime` reads the pin; `--tag` and `--latest` override it.

**The tag lands on the pin commit.** `release.mjs` leaves the release a *draft*, which has no git tag yet. When the commit that pins it reaches `main`, `.github/workflows/publish-runtime.yml` (it runs on pushes that touch `asset-index.json`) publishes the draft with the pushed commit as the release's target, so the tag points at the commit that pins the release (push the pin on its own, or the tag lands on the head of the push). A pushed pin whose release is already published, or that names no draft yet, is left alone. Until it is published, the release's download links answer 404 (a token still reaches it through the API); the fallback is `node tools/runtime/release.mjs --publish` in the maker, which publishes the draft onto the tip of `main`.

## How the game loads them

`client/src/asset-index.ts` resolves everything: `pinUrl(pin)` for a gear pin, `runtimePath('models/characters/aedri-male/body.glb')` for a file by path, `refPin` for a packed file. The base is `/assets` unless the build sets `VITE_ASSET_BASE` (production: `VANAI_ASSET_BASE`, a bucket URL or `/runtime` on the game's own server; DEPLOY.md "The maker's assets"). Gear bytes are hash-checked as they arrive (`gear/assets.ts`).

## New or revised assets, step by step

1. Build and approve it in the maker (its README, `GEAR-FITTING.md`, the authoritative fitting runbook). Run gear-production commands from the maker directory: its frozen approval records and relative producer paths assume it.
2. In the maker: `node tools/runtime/prepare.mjs`. It packs what is new (only sources with no packed copy), checks every file and writes `runtime/files/` and `runtime/index.json`.
3. In the maker: `node tools/runtime/release.mjs` (`--dry-run` first if you like). It builds the archives, uploads the changed ones to a new `runtime-YYYY.MM.DD.N` *draft* release on the game repository, and writes `runtime/release.json`. Then `node tools/runtime/publish.mjs` uploads the new files to R2 for the live server.
4. Here: `npm --prefix client run assets:import` (copies the index after checking every file it names by size and hash, and that the maker verified packed gear with this checkout's decoder; `--fast` checks sizes only; pins the release), then `npm --prefix client test`.
5. Commit `client/src/asset-index.json` here and the maker's `tools/runtime/pack/packed-report.json` there. When the commit reaches `main`, the publish-runtime workflow publishes the draft onto it ("The tag lands on the pin commit" above).
6. Before deploying: the files must be wherever `VANAI_ASSET_BASE` points (DEPLOY.md "The maker's assets"): R2 has them from step 3; a server that serves them itself runs `bin/fetch-runtime --dest`.

## Packed copies

The game loads a smaller derived copy of each approved gear GLB, drape/collar texture and character model (Philip's ruling, 2026-10-12: a copy that passes the numeric checks keeps the source's approval; no visual review). The maker's `tools/runtime/pack/pack.mjs` makes them: vertices welded and quantized, four bone influences, meshopt compression, images of undrawn materials dropped, every drawn image as KTX2 UASTC. It decodes each copy with the game's own decoder (`client/src/gear/packed.ts`, the same file in both repos; the import refuses an index made with another) and checks it against the approved file: positions within 0.02 mm, skinned within 0.1 mm under random poses, same triangles, vertex order and materials, textures at 42 dB PSNR or better with 99.9% of pixels within 16/255 and alpha-tested edges unchanged. The header of `pack.mjs` lists every gate; the index carries them and `asset_index.test.mjs` fails if one is loosened.

- **1024² gear textures (Philip, 2026-10-13; everywhere since 2026-10-14: "All at 1024. I don't want 2048 anymore").** Every gear image ships at 1024² at most, for every character and every view, character creation and the lineup included. The packer still makes the full copy (its checks are how a packed model passes), and every image larger than 1024² also gets a far copy, made from the source's own next mip level (a box reduction by 2, which is what the GPU samples at play distance) and checked against it with one gate, PSNR 40 dB or better (the 99.9th-percentile and alpha-edge numbers are recorded, not gated). An image that kept its approved PNG/WebP gets the reduction itself, lossless, in its own format. Prepare puts only the 1024² copy in the folder and the index, and refuses an image larger than that; `asset_index.test.mjs` reads every image's header to hold it.
- **Character models (Philip, 2026-10-13).** Every body, hair, beard and coif GLB gets a copy whose images are KTX2 at full size; all its other bytes (geometry, skin, materials) are checked identical. The index records the file it was made from (`src`), and Prepare refuses a copy older than its file or a body the catalog pins differently. Hair normal maps miss the gate (fine strand detail, about 30 dB) and keep their WebP inside the copy.
- A file that fails a check ships as approved (one catalog model does today). The approved file of anything packed is not shipped: there is no fallback to it at runtime.
- Packing needs `basisu` (`brew install basis_universal`) and python3 with numpy and Pillow; the whole catalog takes hours, new gear seconds to minutes.

## Size

The folder holds about 10,000 files, 5 GB: packed gear models and their 1024² textures, the gear JSON (domains, configs, boundaries; 0.8 GB, gzipped in transit), packed character models and the animations. The maker's 22 GB of approved originals stay in the maker.
