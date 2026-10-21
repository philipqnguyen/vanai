"""THE MIRROR STAG, the Glassworks' notorious stag (bestiary_plan.json
"unique:the_glass_stag"): the cervid body plan at 2.6 times a stag, its rack
grown into faceted mirror glass that throws the dunes and the sky back, its
coat dusted with glittering glass sand. A unique NM gets its own spec file,
so its builder never edits the body plan's."""
from plans.cervid import cervid

CREATURES = {
    "the_glass_stag": lambda variant=None: cervid(
        "the_glass_stag", s=2.6, rack="mirror", span=1.25, rack_h=0.85, tris=7300, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#a9aaa2", "back": "#878a86", "belly": "#e2e2da", "rump": "#eeeee6", "mane": "#646a6c", "legs": "#8c8e8a",
             "muzzle": "#d8d8d0", "ear_in": "#c8d4da", "eye": "#3a6e8a", "glass": "#cfe0ea", "glass2": "#e8f0f8", "sand": "#d8c890"},
        notes="the Mirror Stag NM: a rack of faceted mirror glass throwing the dunes back, a coat of glass sand, mirror crystals breaking through the hide"),
}
