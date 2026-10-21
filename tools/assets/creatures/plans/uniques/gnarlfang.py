"""GNARLFANG, the Hunting Wood's notorious wolf (bestiary_plan.json
"unique:gnarlfang"): the canine body plan at three times a wolf, pushed to
gnarl=1 -- hunched, maned, bone spurs down the spine, an overgrown fang, a
torn ear, one eye a scar. A unique NM gets its own spec file, so its builder
never edits the body plan's."""
from plans.canine import canine



CREATURES = {
    "gnarlfang": lambda variant=None: canine("gnarlfang", s=3.15, gnarl=1.0, tris=8200, budget=12000, atlas=1024, role="unique",
                                pal={"back": "#3a3532", "flank": "#6a625a", "belly": "#968c80", "muzzle": "#80776d", "brow": "#8a8278",
                                     "leg": "#8a8174", "eye": "#e8b020"},
                                notes="Gnarlfang NM: hunched, maned, spurred, an overgrown fang, a torn ear, a narrow yellow eye under a heavy brow and one scarred shut, a garrison chain"),
}
