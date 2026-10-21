"""DUSKMAW, the North Road's named wolf (bestiary_plan.json "unique:duskmaw"):
the canine body plan at 2.7 times a wolf, long in the leg and carried low,
a dusk-blue coat under a mane that runs from the crown to the middle of the
back, frost grown out of the hair in clear shards, and a maw that hangs open
and is lit faintly from inside. A unique NM gets its own spec file, so its
builder never edits the body plan's."""
from plans.canine import canine

CREATURES = {
    "duskmaw": lambda variant=None: canine(
        "duskmaw", s=2.7, dusk=1.0, tris=8600, budget=12000, atlas=1024, role="unique",
        pal={"back": "#1e2134", "flank": "#353a54", "belly": "#5e6278", "muzzle": "#6c7088", "leg": "#3e4258", "ear_in": "#4e5270",
             "tail_tip": "#b8bcd4", "eye": "#6f52c8", "brow": "#8a8ea8", "frost": "#d8dcf0", "glow": "#a89ae0"},
        notes="Duskmaw NM: dusk-blue, a frost-shard mane to mid-back, a maw lit from inside"),
}
