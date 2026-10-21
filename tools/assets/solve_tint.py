# Solve a TERRAIN_TEX / placeExact tint backwards from the colour you want.
#
# Vertex colour and material tints MULTIPLY the sheet, so a tint can only ever
# DARKEN it. Picking a tint that "looks like" the target is the mistake
# CC0-ASSETS.md records twice (Caerdun's lavender streets). This solves
#     tint = target / base
# per channel and tells you when the target is UNREACHABLE, i.e. when it asks a
# channel to go brighter than the sheet already is.
#
# Pass --lit for a surface lit by the outdoor scene rather than for the raw
# texel value. MEASURED in the running game: hemi 0.6 + sun 0.75, then exposure
# 1.06, contrast 1.18 and an ACES curve, land a mid surface roughly 1.4x
# brighter than albedo x texture predicts. Solving without it is why the Hush's
# chapel kept coming back pale however grey the tint looked on paper.
#
# Usage:  python3 tools/assets/solve_tint.py <sheet-or-#hex-base> <#target> [...]
#         python3 tools/assets/solve_tint.py leafy_grass '#5a7048' '#7d9464'
#         python3 tools/assets/solve_tint.py --lit '#9da4c5' '#6e6e70'

import os, sys
from PIL import Image

TEX = os.path.join(os.path.dirname(__file__), "..", "..", "client", "public", "tex")

def base_of(spec):
    if spec.startswith("#"):
        return tuple(int(spec[1 + i * 2: 3 + i * 2], 16) for i in range(3))
    p = os.path.join(TEX, f"{spec}_diff.jpg")
    im = Image.open(p).convert("RGB").resize((64, 64))
    px = list(im.getdata())
    return tuple(sum(q[i] for q in px) // len(px) for i in range(3))

def solve(base, target):
    t = tuple(int(target[1 + i * 2: 3 + i * 2], 16) for i in range(3))
    tint, capped = [], []
    for i in range(3):
        if base[i] == 0:
            tint.append(255); capped.append(True); continue
        v = round(t[i] * 255 / base[i])
        capped.append(v > 255)
        tint.append(min(255, v))
    got = tuple(round(base[i] * tint[i] / 255) for i in range(3))
    return tint, got, any(capped)

LIT_GAIN = 1.4   # rough; --correct below is the accurate route

def correct(cur, got, want):
    """Closed-loop tint correction from a MEASURED rendered pixel.

    Solving forwards can only ever be approximate here, because between the
    tint and the pixel sit: the albedo texture, two BLUE lights (hemi #aab2d4,
    sun #bcc6e8), a blue sky HDRI through environmentIntensity, a day-driven
    exposure that reaches 1.52 at noon, contrast and an ACES curve. Rather than
    model that, render once, sample the pixel, and scale the tint by
    want/got per channel. Two passes is normally exact.

    Sample a LIT face from the screenshot, not a shadowed one.
    """
    c = [int(cur[1 + i * 2:3 + i * 2], 16) for i in range(3)]
    g = [int(got[1 + i * 2:3 + i * 2], 16) for i in range(3)]
    w = [int(want[1 + i * 2:3 + i * 2], 16) for i in range(3)]
    out = [min(255, max(0, round(c[i] * w[i] / max(1, g[i])))) for i in range(3)]
    return "#%02x%02x%02x" % tuple(out)

def main(argv):
    if "--correct" in argv:
        a = [x for x in argv if x != "--correct"]
        print(f"tint {a[0]} rendered {a[1]}, want {a[2]}  ->  {correct(a[0], a[1], a[2])}")
        return
    lit = "--lit" in argv
    argv = [a for a in argv if a != "--lit"]
    base = base_of(argv[0])
    if lit:
        base = tuple(min(255, round(c * LIT_GAIN)) for c in base)
        print("(--lit: base scaled by %.1f for scene light gain)" % LIT_GAIN)
    print(f"base {argv[0]} = rgb{base}  #%02x%02x%02x" % base)
    for target in argv[1:]:
        tint, got, capped = solve(base, target)
        flag = "  UNREACHABLE (sheet is too dark in a channel)" if capped else ""
        print("  want %s -> tint #%02x%02x%02x  gives #%02x%02x%02x%s"
              % (target, *tint, *got, flag))

if __name__ == "__main__":
    main(sys.argv[1:])
