"""What a creature is, as data the builder consumes (numpy only).

A Spec holds the skeleton, the organic body (an sdf.Body whose leaves name
their bones and paint regions), the rigid parts (eyes, teeth, claws, armour:
each its own small SDF, meshed at its own voxel size, skinned rigidly), the
paint function, the clips and the budgets. plans/*.py build Specs from a
handful of parameters; build.py turns one into a GLB.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

import sdf
from skeleton import Skeleton

# Clip names the game asks for (entities.ts CREATURE_CLIPS)
CORE_CLIPS = ["Idle", "Walk", "Run", "Attack_A", "Attack_B", "Hit", "Death"]


@dataclass
class Part:
    name: str
    node: object                 # sdf.Body or leaf
    bones: dict | None = None    # {bone: weight}; None = each vertex to its nearest leaf's bone
    voxel: float = 0.004
    tris: int = 200
    angle: float | None = None   # hard edges past this angle (armour); None = smooth
    uv_scale: float = 1.0        # texel density relative to the body
    meta: dict = field(default_factory=dict)
    # a carried prop (weapon, tool, lantern, book): it does not stand on the
    # ground. The rest-pose groundY and the ground clamp (ground_clips.py)
    # measure the body without it, and the test holds it only to -0.15 x
    # height. meta={"held": True} is the same flag (the round-1 spelling).
    held: bool = False

    def __post_init__(self):
        self.held = bool(self.held or self.meta.get("held"))
        if self.held:
            self.meta["held"] = True


@dataclass
class Clip:
    fn: Callable
    duration: float
    loop: bool = True
    speed: float = 0.0           # metres per second the cycle covers (Walk, Run)


@dataclass
class Spec:
    key: str
    plan: str
    sk: Skeleton
    body: sdf.Body
    body_voxel: float
    body_tris: int
    parts: list
    paint: Callable
    clips: dict
    atlas: int = 512                   # 512² for every shared look; uniques (NMs, bosses) 1024²
    lod1_ratio: float = 0.3
    falloff: float = 0.04
    roughness: float = 0.7
    metallic: float = 0.0
    emit_strength: float = 1.0
    uv_angle: float = 64
    notes: str = ""
    # tris ceiling the tests hold this creature to (common 4k, NM 12k)
    budget: int = 4200
    seed: int = 1
    role: str = "common"               # "common" (a shared look) or "unique": sets the default budget/atlas checks

    def part_id(self, name):
        if name == "body":
            return 0
        for i, p in enumerate(self.parts):
            if p.name == name:
                return i + 1
        raise KeyError(name)

    def field_all(self, Q):
        d = self.body.eval(Q)
        for p in self.parts:
            d = np.minimum(d, p.node.eval(Q))
        return d
