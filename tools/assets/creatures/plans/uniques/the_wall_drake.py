"""THE WALL DRAKE (NM, the Border Wall): the drake rig at three times a
drake and gone four-legged -- legs drawn under it like a dragon's, slate
plates cut as the wall's own masonry, crag feathers fanned off the crest, a
tail that reads as rampart with merlons down it, eyes lit gold. Built by
reptile.lizard(wall=1); its Special is the rearing bellow."""
from plans.reptile import lizard

CREATURES = {
    "the_wall_drake": lambda variant=None: lizard("the_wall_drake", s=2.9, wall=1.0, atlas=1024, tris=7600, budget=12000, role="unique",
                                                  notes="the Wall Drake: four-legged drake at 3x, masonry plates, crag feathers, merlon tail", variant=variant),
}
