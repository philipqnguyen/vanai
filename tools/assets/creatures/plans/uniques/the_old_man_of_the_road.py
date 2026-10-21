"""THE OLD MAN OF THE ROAD: the North Road's notorious giant. The giant rig
under snow -- a white shag gone yellow-grey at the roots, drifts on the
shoulders and the crown -- a beard of icicles hanging from the jaw, and a
coach wheel off some imperial post-coach strapped to the left forearm as a
shield, a bite broken out of its rim. Cold blue eyes deep under the brow."""
from __future__ import annotations

from plans.giant import giant

OLD_MAN = dict(fur="#b4b8bc", fur_dark="#6a6e74", fur_hi="#dfe4ea", skin="#3e4652", skin_hi="#7a8694", eye="#9ad0f0",
               tusk="#e8e0cc", ice="#c8e4f6", snow="#f2f6fa", wood="#5e4430", iron="#3e4248", glass="#9a9ea6", face="#6c7682",
               grime="#4e4234")

CREATURES = {
    "the_old_man_of_the_road": lambda variant=None: giant("the_old_man_of_the_road", H=5.5, pal=OLD_MAN, atlas=1024, tris=9600, budget=12000,
                                                           coat="snow", beard=True, wheel=True, tuft_n=70, role="unique",
                                                           notes="The Old Man of the Road: the giant under snow, an icicle beard, a coach wheel for a shield"),
}
