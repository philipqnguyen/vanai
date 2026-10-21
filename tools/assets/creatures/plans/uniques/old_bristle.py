"""OLD BRISTLE, the Caerdun Fields' notorious boar (bestiary_plan.json
"unique:old_bristle"): the suid body plan at about three times a boar, the
crest grown into a hedge over the shoulders, the tusks worn to yellowed
stubs, scarred from snout to ham, and two hunters' shafts snapped off in the
hide -- a milestone's worth of fights. A unique NM gets its own spec file, so
its builder never edits the body plan's."""
from plans.suid import suid

CREATURES = {
    "old_bristle": lambda variant=None: suid(
        "old_bristle", s=2.9, hedge=1.0, crest=1.1, tusk=0.5, tris=8600, budget=12000, atlas=1024, role="unique",
        pal={"coat": "#5a4a3c", "back": "#33281f", "belly": "#6a5a4a", "grizzle": "#c4b9a4", "dark": "#2a221b", "snout": "#3a2e28",
             "cheek": "#b8ab94", "tusk": "#c8a040", "tusk_root": "#6e5636", "scar": "#8c6c64"},
        notes="Old Bristle NM: a hedge of a crest, tusks worn to stubs, scars, two snapped shafts in the hide"),
}
