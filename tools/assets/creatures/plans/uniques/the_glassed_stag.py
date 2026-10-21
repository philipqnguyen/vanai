"""THE GLASSED STAG, the Burned Land's boss (bestiary_plan.json
"unique:the_glassed_stag"): the cervid body plan at three times a stag, run
entirely to amber glass -- shards grown from the spine and shoulders, cracks
lit from within -- its rack a glassed orchard of branches, leaves and fruit,
and the abbot's ember burning in a window in its chest. A unique NM gets its
own spec file, so its builder never edits the body plan's."""
from plans.cervid import cervid

CREATURES = {
    "the_glassed_stag": lambda variant=None: cervid(
        "the_glassed_stag", s=3.0, rack="orchard", span=1.3, rack_h=1.0, tris=7400, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#d4a85a", "back": "#a87c34", "belly": "#ecdcae", "rump": "#f0e4c0", "mane": "#a8874a", "legs": "#c0a060",
             "muzzle": "#e4d0a0", "ear_in": "#e8d4a8", "eye": "#e06030", "glass2": "#e8f0f8", "ember": "#e06030", "slag": "#3a2a20"},
        notes="the Glassed Stag boss: run to glass, a glassed orchard for a rack, the abbot's ember in the chest"),
}
