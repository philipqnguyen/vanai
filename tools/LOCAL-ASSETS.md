# Local assets and scratch work

This checkout holds the game: gameplay, loaders, world and city builders, and
the game's own generated assets under `client/public` (creatures, cities,
dungeon props, nature), which are tracked. Character, gear and animation
authoring -- sources, previews, experiments, approvals -- belong to the maker
(ASSETS.md), and reach this checkout only as the asset index
(`client/src/asset-index.json`) and the maker's prepared folder (`VANAI_RUNTIME`).
Nothing of the maker's is linked, mounted or copied here.

## Keep local

- Put new one-off scripts in `tools/local/`, and screenshots or temporary output
  in `.playwright-mcp/` or `tmp/`. Those directories are ignored.
- Historical art scripts and QA captures are listed individually in
  `tools/art/.gitignore` and `tools/qa/.gitignore`; they still run locally.

Do not blanket-ignore `tools/art/`, `tools/qa/`, `client/src/`, or all GLB files:
that would hide useful new tooling or the game's own assets. To promote a
historical tool, remove its exact ignore entry, inspect its imports and
document any external inputs. Do not use force-add as a shortcut.

## Before committing

Stage explicit source paths. Inspect `git diff --cached --name-status` and
`git diff --cached --stat`; check unexpected paths with `git check-ignore -v`.
Ignore rules prevent ordinary bulk adds of local artifacts, but do not remove
already tracked files and can be overridden by `git add -f`.

The history of the September 2026 authoring cleanups (when character and gear
work still lived in this checkout) is in this file's git history and the maker's
own records.
