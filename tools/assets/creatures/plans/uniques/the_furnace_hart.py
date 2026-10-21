"""THE FURNACE HART, the Glassworks' other notorious stag (bestiary_plan.json
"unique:the_furnace_hart"): the cervid body plan at 2.6 times a stag, its
rack smoked glass with fire running in the veins and burning at the tips, its
hooves slag seamed with heat, soot climbing its legs. A unique NM gets its own
spec file, so its builder never edits the body plan's."""
from plans.cervid import cervid

CREATURES = {
    "the_furnace_hart": lambda variant=None: cervid(
        "the_furnace_hart", s=2.6, rack="ember", span=1.2, rack_h=0.9, tris=7400, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#b8805a", "back": "#8a5a3c", "belly": "#d8a070", "rump": "#e4b88a", "mane": "#4a3a30", "legs": "#6a4a36",
             "muzzle": "#c89a74", "ear_in": "#c08a6a", "eye": "#e06030", "glass": "#a08070", "ember": "#e06030", "slag": "#2a2220"},
        notes="the Furnace Hart NM: a rack of smoking ember glass, a hide burnt to cracked charcoal running with fire, slag crags, hooves of slag"),
}
