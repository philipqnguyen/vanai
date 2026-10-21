"""OLD QUILLBACK, the Timber Estates' named boar (bestiary_plan.json
"unique:old_quillback"): the suid body plan at three times a boar, its crest
grown into a fan of banded quills from the crown to the tail, thorn resin run
down the flanks from their roots. A unique NM gets its own spec file, so its
builder never edits the body plan's."""
from plans.suid import suid

CREATURES = {
    "old_quillback": lambda variant=None: suid(
        "old_quillback", s=3.0, quill=1.0, crest=0.7, tusk=1.1, tris=8400, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#4a3a30", "back": "#2c221b", "belly": "#5c4a3c", "grizzle": "#9a8a70", "dark": "#231b15", "snout": "#2e2420",
             "cheek": "#8f7e66", "quill": "#e2d4b4", "quill_band": "#3a2a20", "resin": "#e0b264", "tusk": "#e4d6b4"},
        notes="Old Quillback NM: a fan of banded quills crown to tail, thorn resin down the flanks"),
}
