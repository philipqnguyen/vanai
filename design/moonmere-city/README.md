# The old Moonmere's module library

The old Moonmere -- the arched-plaster city built on the village kit's plan
(`?moonmere-city`, `buildMoonmere2`, `client/src/moonmere-*.ts`) -- was
retired on 2026-10-09, once the Banded Cloisters replaced it (MOONMERE.md
"The old city, retired"). Its code, its review page and its QA scripts are
gone; this file's full description of it is in git history (before the
retirement, e.g. `d762d1a2`).

What stays is the furniture and the one door leaf the game still places, 16
original modules in `client/public/models/moonmere/` (provenance in its
`CREDITS.md`): the annex door's leaf (`door`; its frame, `wall_door`, was
retired on 2026-10-10 once the Long Tower framed that door itself), the
shelves and stamp desks (`bookcase`, `desk`, `seal_press`), the observatory
instruments (`star_globe`, `telescope`, `water_clock`), Heartwood's homes and
stalls (`bed`, `bench`, `home_chair`, `home_chest`, `home_cupboard`,
`home_herbs`, `home_rug`, `home_table`) and the Sunken Ballroom's
`music_box`. The new city's modules are `client/public/models/moonmere-cloister/`.

Rebuild them with:

`blender --background --python tools/assets/build_moonmere_modules.py`

It writes the 16 GLBs, their triangle/material `manifest.json`, and the
editable `design/moonmere-city/modules.blend` library (not tracked). Taking
the 45 retired builders out changed none of the 17 then kept (MEASURED 2026-10-09: the
old and the trimmed generator export the same vertex data and glTF structure,
differing only in Blender's `.001` name suffixes; `star_globe`'s bytes, and
once its welded vertex count, vary from run to run of either, so it is never
byte-reproducible). The committed GLBs were left as they were. The quest staging audit that
added the instruments and the music box is `design/quest-staging/README.md`.
