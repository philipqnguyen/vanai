"""THE ORCHARD SOW, the Heartwood Fields' notorious sow (bestiary_plan.json
"unique:the_orchard_sow"): the suid body plan at about three times a boar,
a sow -- no tusks, a round low belly with its teats, a litter's worth of
fine scars -- with windfall apples and leaves caught in her short crest. A
unique NM gets its own spec file, so its builder never edits the body plan's."""
from plans.suid import suid

CREATURES = {
    "the_orchard_sow": lambda variant=None: suid(
        "the_orchard_sow", s=2.9, sow=1.0, tusk=0.0, crest=1.0, tris=8400, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#6a5040", "back": "#4a382c", "belly": "#8c6c5a", "grizzle": "#b8a288", "dark": "#3a2c22", "snout": "#6a4a40",
             "disc": "#b47a6c", "cheek": "#a89078", "ear_in": "#b07a6c", "apple": "#c25a40", "apple2": "#a8c060", "leaf": "#6a8a3a",
             "scar": "#c09088"},
        notes="the Orchard Sow NM: a sow, no tusks, windfall apples and leaves caught in her crest, a litter's worth of scars"),
}
