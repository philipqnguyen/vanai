#!/usr/bin/env python3
"""Generate concept-art postcards for the wilderness zones and splice them into
design/the-empty-throne.html (Art Direction tab, between ARTBOARDS markers).

Usage:  python3 tools/design/gen_artboards.py

Each board is a flat-color travel-poster composition: sky gradient, light source,
layered silhouettes back-to-front, one focal landmark, committed palette. The
hexes on the board are BUILD TARGETS: sky stops feed the zone's lighting pass,
the fog swatch is the fog color, ground/foliage swatches are tint anchors.
Deterministic (seeded per zone) — same input, same postcard.
"""
import math, random, zlib, os

W, H = 640, 360


def zr(name):
    return random.Random(zlib.crc32(name.encode()) ^ 7)


def pts_path(pts, close_to=None):
    d = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    if close_to is not None:
        d += f" L {W} {close_to} L 0 {close_to} Z"
    return d


def sky(zid, stops):
    g = "".join(f'<stop offset="{o}" stop-color="{c}"></stop>' for o, c in stops)
    return (f'<defs><linearGradient id="sky-{zid}" x1="0" y1="0" x2="0" y2="1">{g}</linearGradient></defs>'
            f'<rect width="{W}" height="{H}" fill="url(#sky-{zid})"></rect>')


def sun(x, y, rad, color, halo=None):
    o = ""
    if halo:
        o += f'<circle cx="{x}" cy="{y}" r="{rad*2.6:.0f}" fill="{halo}" opacity="0.35"></circle>'
    return o + f'<circle cx="{x}" cy="{y}" r="{rad}" fill="{color}"></circle>'


def ridge(r, y, amp, color, jag=7, op=1.0):
    """Jagged mountain band with its top around y."""
    pts = [(0, y + r.uniform(-amp, amp))]
    x = 0
    while x < W:
        x += r.uniform(30, 70)
        pts.append((min(x, W), y + r.uniform(-amp, amp) - (amp if r.random() < 0.3 else 0)))
    return f'<path d="{pts_path(pts, close_to=H)}" fill="{color}" opacity="{op}"></path>'


def hills(r, y, amp, color, op=1.0):
    """Soft rolling band."""
    pts = []
    for i in range(9):
        pts.append((i * W / 8, y + amp * math.sin(i * 1.7 + r.uniform(0, 6))))
    return f'<path d="{pts_path(pts, close_to=H)}" fill="{color}" opacity="{op}"></path>'


def treeline(r, y, h, color, op=1.0):
    """Bumpy canopy band."""
    o = [f'M 0 {y+h}']
    x = 0
    while x < W:
        w = r.uniform(18, 42)
        o.append(f'L {x:.0f} {y + r.uniform(0, h*0.5):.0f} Q {x + w/2:.0f} {y - r.uniform(2, h*0.4):.0f} {min(x+w, W):.0f} {y + r.uniform(0, h*0.5):.0f}')
        x += w
    o.append(f'L {W} {H} L 0 {H} Z')
    return f'<path d="{" ".join(o)}" fill="{color}" opacity="{op}"></path>'


def pines(r, y, n, hmin, hmax, color, x0=0, x1=W, snow=None):
    o = []
    for _ in range(n):
        x = r.uniform(x0, x1)
        ph = r.uniform(hmin, hmax)
        w = ph * 0.42
        o.append(f'<path d="M {x-w:.0f} {y:.0f} L {x:.0f} {y-ph:.0f} L {x+w:.0f} {y:.0f} Z" fill="{color}"></path>')
        if snow:
            o.append(f'<path d="M {x-w*0.45:.0f} {y-ph*0.55:.0f} L {x:.0f} {y-ph:.0f} L {x+w*0.45:.0f} {y-ph*0.55:.0f} Z" fill="{snow}"></path>')
    return "".join(o)


def broadleaf(r, y, n, hmin, hmax, trunk, crown, x0=0, x1=W):
    o = []
    for _ in range(n):
        x = r.uniform(x0, x1)
        th = r.uniform(hmin, hmax)
        cr = th * 0.55
        o.append(f'<rect x="{x-1.6:.0f}" y="{y-th:.0f}" width="3.2" height="{th:.0f}" fill="{trunk}"></rect>')
        o.append(f'<circle cx="{x:.0f}" cy="{y-th:.0f}" r="{cr:.0f}" fill="{crown}"></circle>')
    return "".join(o)


def palm(x, y, h, trunk, frond):
    o = [f'<path d="M {x} {y} q {h*0.25:.0f} {-h*0.6:.0f} {h*0.45:.0f} {-h:.0f}" fill="none" stroke="{trunk}" stroke-width="4"></path>']
    tx, ty = x + h * 0.45, y - h
    for ang in (-150, -120, -80, -40, -10, 25):
        a = math.radians(ang)
        o.append(f'<path d="M {tx:.0f} {ty:.0f} q {22*math.cos(a):.0f} {22*math.sin(a):.0f} {40*math.cos(a):.0f} {40*math.sin(a)+9:.0f}" fill="none" stroke="{frond}" stroke-width="4" stroke-linecap="round"></path>')
    return "".join(o)


def water(y0, y1, color, glint, r, n=8):
    o = [f'<rect x="0" y="{y0}" width="{W}" height="{y1-y0}" fill="{color}"></rect>']
    for _ in range(n):
        x, y = r.uniform(20, W - 60), r.uniform(y0 + 6, y1 - 6)
        o.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{r.uniform(18,55):.0f}" height="2" rx="1" fill="{glint}" opacity="0.7"></rect>')
    return "".join(o)


def fog(y, h, color, op):
    return f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="{color}" opacity="{op}"></rect>'


def grain(r, y0, color, n=60, op=0.5):
    o = []
    for _ in range(n):
        x, y = r.uniform(0, W), r.uniform(y0, H - 6)
        o.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x:.0f}" y2="{y-r.uniform(4,9):.0f}" stroke="{color}" stroke-width="1.6" opacity="{op}"></line>')
    return "".join(o)


BOARDS = []


def board(name, band, mood, body, palette, light, kit, touch):
    sw = "".join(f'<span><i style="background:{hx}"></i>{label}<br>{hx}</span>' for label, hx in palette)
    BOARDS.append(
        f'<article class="artboard"><header><h3>{name}</h3><span class="qmeta">{band}</span></header>'
        f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Concept postcard: {name}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'
        f'<div class="swatches">{sw}</div>'
        f'<p class="artspec"><b>Mood</b>{mood}</p>'
        f'<p class="artspec"><b>Light</b>{light}</p>'
        f'<p class="artspec"><b>Kit</b>{kit}</p>'
        f'<p class="artspec"><b>Touchstones</b>{touch}</p></article>')


# ── 1. the Caerdun Fields ────────────────────────────────────────────────────
r = zr("caerdunfields")
b = [sky("cf", [(0, "#aecbe8"), (0.62, "#dfe3d2"), (1, "#f2e3c2")])]
b.append(sun(120, 92, 26, "#f6e7b8", "#f2e3c2"))
b.append(ridge(r, 132, 16, "#9aa5b4", op=0.8))                    # NW highlands
b.append(f'<path d="M 0 176 L 0 150 L 34 138 L 52 150 L 70 132 L 92 150 L 92 176 Z" fill="#8b8f96"></path>')  # city silhouette W
b.append(f'<rect x="40" y="118" width="7" height="26" fill="#8b8f96"></rect>')  # lighthouse
b.append(fog(150, 30, "#e8e4d2", 0.5))
b.append(hills(r, 205, 14, "#8fae62"))
b.append(hills(r, 250, 12, "#7fa051"))
b.append(pines(r, 250, 9, 26, 44, "#3c5a3a", x0=380, x1=630))
for fx in (170, 250, 480):
    b.append(f'<rect x="{fx}" y="228" width="26" height="16" fill="#7c6a4e"></rect><path d="M {fx-4} 228 L {fx+13} 216 L {fx+30} 228 Z" fill="#a0522d" opacity="0.85"></path>')
b.append(f'<path d="M 0 300 L 640 286" stroke="#c9b98e" stroke-width="9" fill="none"></path>')  # the road east
b.append(hills(r, 320, 8, "#6a8a44"))
board("the Caerdun Fields", "levels 1&ndash;10 &middot; the starter morning",
      "A working countryside in first light: watch farms, pine breaks, the granite city and its lighthouse behind your shoulder, and one gold road running east. Safe should still look worth defending.",
      "".join(b),
      [("sky", "#aecbe8"), ("horizon", "#f2e3c2"), ("meadow", "#7fa051"), ("pine", "#3c5a3a"), ("granite", "#8b8f96"), ("road gold", "#c9b98e")],
      "Early morning, sun low in the east; long soft shadows; thin valley fog at the city's feet; fog color #e8e4d2.",
      "Village kit farm houses and fences, nature pines, goat pens and hay; sandstone city wall visible at the west edge.",
      "FFXIV Central Shroud at dawn; Ghibli's working farms; the first field outside any hometown.")

# ── 2. the Heartwood Fields ──────────────────────────────────────────────────
r = zr("heartwoodfields")
b = [sky("hf", [(0, "#bcd6e6"), (0.6, "#e9e6c8"), (1, "#f6e8c4")])]
b.append(sun(520, 84, 24, "#f8ecc0", "#f6e8c4"))
b.append(water(150, 172, "#6d94ae", "#cfe2ea", r, n=5))            # the bay glint, east
b.append(treeline(r, 150, 26, "#4e7c46", op=0.85))                 # the grove-ring skyline
b.append(f'<circle cx="560" cy="140" r="34" fill="none" stroke="#3f6b3a" stroke-width="7"></circle>')  # grove ring hint
b.append(fog(158, 26, "#eee9cf", 0.45))
b.append(hills(r, 220, 12, "#93b060"))
for i in range(7):                                                  # orchard rows
    yy = 236 + i * 16
    for j in range(9):
        xx = 40 + j * 70 + (i % 2) * 32
        b.append(f'<circle cx="{xx}" cy="{yy}" r="{9 + i}" fill="#6f9a4e"></circle><rect x="{xx-1.5}" y="{yy}" width="3" height="{10+i}" fill="#6b503c"></rect>')
b.append(f'<path d="M 300 250 q 6 -26 2 -44" stroke="#9a938a" stroke-width="5" fill="none" opacity="0.7"></path>')  # charcoal smoke
b.append(hills(r, 330, 6, "#7fa051"))
board("the Heartwood Fields", "levels 1&ndash;10 &middot; the orchard country",
      "Orchard rows marching toward the bay, the grove-ring skyline behind, one thread of charcoal smoke. Everything planted, everything loved, nothing surveyed.",
      "".join(b),
      [("sky", "#bcd6e6"), ("bay", "#6d94ae"), ("orchard", "#6f9a4e"), ("deep canopy", "#4e7c46"), ("meadow", "#93b060"), ("smoke", "#9a938a")],
      "Late morning, sun high east over the bay; dappled light; fog only as haze over the water; fog color #eee9cf.",
      "Village kit fruit trees in deliberate rows, charcoal-burner camps, plaster-and-timber farmsteads; the bay's water band on the east edge.",
      "FFXIV's Lavender Beds; cider-country postcards; an orchard ladder left leaning.")

# ── 3. the Moonmere Shores ───────────────────────────────────────────────────
r = zr("moonmereshores")
b = [sky("ms", [(0, "#cfd9ec"), (0.55, "#e8ddd0"), (1, "#f0d9c0")])]
b.append(sun(320, 96, 22, "#f4e6cc", "#f0d9c0"))
b.append(water(170, 250, "#7d9bb8", "#d8e4ec", r, n=10))           # the Mere, open to the Southern Sea
b.append(f'<path d="M 250 170 L 250 152 L 285 138 L 320 152 L 320 170 Z" fill="#8a84a8"></path>')  # academy island
b.append(f'<rect x="278" y="120" width="8" height="24" fill="#8a84a8"></rect>')  # observatory
b.append(f'<rect x="284" y="170" width="6" height="80" fill="#b8ab90"></rect>')  # causeway
b.append(fog(162, 20, "#e6e0d4", 0.5))
b.append(hills(r, 268, 10, "#9aa86a"))
for rx in range(10):                                                # reed clumps
    x = 30 + rx * 64
    b.append(f'<path d="M {x} 300 q 2 -22 0 -26 M {x+5} 300 q 4 -18 8 -24 M {x-5} 300 q -4 -16 -7 -22" stroke="#a8b06a" stroke-width="3" fill="none"></path>')
b.append(f'<rect x="80" y="252" width="40" height="8" fill="#7a6a50"></rect><rect x="86" y="240" width="5" height="12" fill="#7a6a50"></rect>')  # ferry pier
b.append(hills(r, 330, 6, "#8fa060"))
board("the Moonmere Shores", "levels 1&ndash;10 &middot; the shore of the Mere",
      "Reed beds, ferry piers, and the academy out in the Mere &mdash; violet-grey towers doubled in sheltered water, the causeway running to them across the bay. The calmest of the three starts; the water does the talking.",
      "".join(b),
      [("sky", "#cfd9ec"), ("dusk sand", "#f0d9c0"), ("the Mere", "#7d9bb8"), ("academy violet", "#8a84a8"), ("reeds", "#a8b06a"), ("pier wood", "#7a6a50")],
      "Softest light of the three: high thin cloud, sun diffused; mirror water; a haze bar where the sea meets the sky, no far shore; fog color #e6e0d4.",
      "Island-pack reeds and small boats, village piers and shore cottages, the violet-washed city visible across the water.",
      "FFXIV's Mist at dawn; watercolour coasts; a rowboat heard before it's seen.")

# ── 4. the North Road ────────────────────────────────────────────────────────
r = zr("northroad")
b = [sky("nr", [(0, "#cddcea"), (0.65, "#e9ecec"), (1, "#f4f0e6")])]
b.append(sun(510, 78, 20, "#f7f2dc", "#eef0ea"))
b.append(ridge(r, 120, 22, "#8e9aac"))                              # crescent peaks
b.append(ridge(r, 128, 12, "#f0f3f6", op=0.9))                      # snow on them
b.append(fog(140, 26, "#e9edf2", 0.6))
b.append(hills(r, 200, 10, "#e4ebf1"))                              # snowfield far
b.append(hills(r, 260, 12, "#eef1f4"))                              # snowfield near
b.append(pines(r, 262, 12, 30, 58, "#4a6b52", x0=20, x1=280, snow="#f2f5f7"))
b.append(pines(r, 258, 7, 24, 40, "#4a6b52", x0=470, x1=630, snow="#f2f5f7"))
b.append(f'<path d="M 0 316 Q 320 292 640 300" stroke="#d5dde5" stroke-width="13" fill="none"></path>')  # the road
b.append(f'<rect x="330" y="216" width="52" height="34" fill="#5e5548"></rect>'
         f'<path d="M 322 216 L 356 194 L 390 216 Z" fill="#7e7264"></path>'
         f'<rect x="344" y="228" width="10" height="12" fill="#e8a84f"></rect>'
         f'<path d="M 372 200 q 3 -12 -1 -18" stroke="#cfd4da" stroke-width="4" fill="none"></path>')  # the inn + lit window + chimney smoke
b.append(f'<path d="M 352 250 L 352 316" stroke="#c9d6e2" stroke-width="2" stroke-dasharray="3 6"></path>')  # path to the door
b.append(hills(r, 336, 5, "#e6ebef"))
board("the North Road", "levels 10&ndash;17 &middot; the winterland",
      "A snowbound upland under the crescent's white peaks &mdash; and one warm window. The whole zone is composed around the halfway inn's light: winter as a postcard, never as a punishment.",
      "".join(b),
      [("sky", "#cddcea"), ("snow", "#eef1f4"), ("snow shadow", "#c9d6e2"), ("pine", "#4a6b52"), ("peak stone", "#8e9aac"), ("inn light", "#e8a84f")],
      "Pale noon or blue-hour dusk; low color everywhere except the inn's amber; snow reflects the sky's hue; fog color #e9edf2, drawn as bands.",
      "Graveyard-pack bare trees + nature pines with baked snow caps, white ground sheet, drift props, the inn as a full modular building with glowing windows.",
      "Ghibli snowfields; FFXI's Beaucedine before the sadness; a lit inn seen from a cold road.")

# ── 5. the Shore Road ────────────────────────────────────────────────────────
r = zr("shoreroad")
b = [sky("sr", [(0, "#a8d0dc"), (0.6, "#ead9b4"), (1, "#f6e0b8")])]
b.append(sun(120, 80, 26, "#f9ecc4", "#f2ddb0"))
b.append(water(160, 240, "#5e9fae", "#cfe8ea", r, n=12))
b.append(f'<path d="M 470 240 q 30 -34 74 -28 L 544 240 Z" fill="#6a5c48"></path>'
         f'<rect x="500" y="188" width="5" height="30" fill="#6a5c48" transform="rotate(-14 500 188)"></rect>')  # the grain-ship wreck
b.append(fog(152, 20, "#ecdfc2", 0.4))
b.append(hills(r, 268, 10, "#e6cf9e"))                              # the strand
b.append(palm(90, 288, 74, "#7a5c40", "#5d8a4e"))
b.append(palm(180, 296, 58, "#7a5c40", "#5d8a4e"))
b.append(palm(560, 292, 66, "#7a5c40", "#5d8a4e"))
b.append(f'<path d="M 0 306 Q 320 288 640 302" stroke="#d9bc84" stroke-width="11" fill="none"></path>')
b.append(grain(r, 316, "#c8b184", n=40, op=0.5))
board("the Shore Road", "levels 10&ndash;17 &middot; the warm sea",
      "Palms leaning over a gold strand, the warm sea glittering, and the wrecked imperial grain ship as the one dark silhouette &mdash; the south's answer to the winter road: heat, salt, ease.",
      "".join(b),
      [("sky", "#a8d0dc"), ("sea", "#5e9fae"), ("sand", "#e6cf9e"), ("palm", "#5d8a4e"), ("wreck wood", "#6a5c48"), ("road", "#d9bc84")],
      "Hot mid-afternoon; high glitter on the water; heat-haze instead of fog; fog color #ecdfc2, very thin.",
      "Island-pack palms, beach rocks and boats; the wreck built from ship props half-buried; pale sand ground sheet.",
      "FFXIV's Costa del Sol; FFXI's Valkurm without the dunes' menace; sandals-off weather.")

# ── 6. the Hunting Wood ──────────────────────────────────────────────────────
r = zr("huntingwood")
b = [sky("hw", [(0, "#dfe8c8"), (1, "#c8d8b0")])]
b.append(treeline(r, 60, 40, "#2f5231"))
b.append(treeline(r, 110, 40, "#3d6538"))
for gx in (150, 300, 450):                                          # god rays
    b.append(f'<path d="M {gx} 0 L {gx+34} 0 L {gx+110} 360 L {gx+50} 360 Z" fill="#f3e2ae" opacity="0.30"></path>')
b.append(treeline(r, 180, 46, "#4d7a3e"))
b.append(f'<path d="M 260 360 L 306 200 L 334 200 L 380 360 Z" fill="#90ab5e"></path>')  # the king's ride, cutting straight through
b.append(f'<path d="M 306 214 L 296 208 L 316 202 L 322 210 Z" fill="#5e5548"></path>')  # lodge silhouette at the vanishing point
for _ in range(9):
    x = r.uniform(20, 620)
    if 250 < x < 390: continue
    b.append(f'<rect x="{x:.0f}" y="{r.uniform(200, 300):.0f}" width="7" height="90" fill="#3a4f30"></rect>')  # near trunks
b.append(grain(r, 320, "#6f8a4a", n=50, op=0.6))
board("the Hunting Wood", "levels 15&ndash;22 &middot; Caerdun's doorstep",
      "A cathedral of royal forest with sun-shafts for windows, and the king's rides &mdash; dead-straight avenues of light &mdash; converging on the lodge. The first interior zone most players see: awe, not fear.",
      "".join(b),
      [("canopy light", "#dfe8c8"), ("canopy deep", "#2f5231"), ("mid green", "#4d7a3e"), ("ride grass", "#90ab5e"), ("sun shaft", "#f3e2ae"), ("trunk", "#3a4f30")],
      "Mid-morning shafts through canopy; the rides hold the only full sun; interior twilight elsewhere; fog color #c8d8b0, low and green.",
      "Village-pack giants (Tree_04) for the ride edges, dense nature trees, the lodge and the Mausoleum door as stone landmarks.",
      "FFXIV's East Shroud sun-shafts; the New Forest's ancient rides; Uccello's hunt paintings.")

# ── 7. the Timber Estates ────────────────────────────────────────────────────
r = zr("timberestates")
b = [sky("te", [(0, "#c6d8d2"), (0.7, "#e6e2c4"), (1, "#eee6c8")])]
b.append(sun(560, 70, 18, "#f2ecc8"))
b.append(treeline(r, 130, 22, "#476b3f", op=0.8))
b.append(fog(140, 24, "#e2e2cc", 0.5))
for i in range(5):                                                  # the ranks, in perspective
    y = 180 + i * 36
    n = 7 + i * 2
    sp = W / n
    sc = 0.5 + i * 0.18
    for j in range(n):
        x = sp * (j + 0.5) + (i % 2) * sp * 0.3
        th, cr = 34 * sc, 17 * sc
        b.append(f'<rect x="{x-2*sc:.0f}" y="{y-th:.0f}" width="{4*sc:.1f}" height="{th:.0f}" fill="#6b503c"></rect>'
                 f'<circle cx="{x:.0f}" cy="{y-th:.0f}" r="{cr:.0f}" fill="#557b45"></circle>')
b.append(f'<path d="M 0 268 L 640 254" stroke="#7d9bb8" stroke-width="7" fill="none"></path>')  # the flume
b.append(f'<rect x="470" y="216" width="34" height="22" fill="#5e5548"></rect><path d="M 464 216 L 487 202 L 510 216 Z" fill="#7e7264"></path>')  # overseer's lodge
b.append(hills(r, 322, 6, "#8aa258"))
board("the Timber Estates", "levels 15&ndash;22 &middot; Heartwood's doorstep",
      "A forest in ranks: planted giants in perfect perspective rows, the log flume ruled across them, the overseer's lodge watching. Beautiful and wrong in equal measure &mdash; order where forest should be wild.",
      "".join(b),
      [("sky", "#c6d8d2"), ("canopy", "#557b45"), ("deep line", "#476b3f"), ("trunk", "#6b503c"), ("flume water", "#7d9bb8"), ("clearing", "#8aa258")],
      "Even, shadowless overcast-bright &mdash; the light of a managed place; fog color #e2e2cc between the far ranks.",
      "Nature trees planted in strict grid rows (the anti-scatter), the flume as an elevated water channel, kit lodge; row-gaps as the walkways.",
      "Poplar plantations from a train window; Tuscan cypress avenues; the unease of topiary.")

# ── 8. the Summer Lakes ──────────────────────────────────────────────────────
r = zr("summerlakes")
b = [sky("sl", [(0, "#bfe0e4"), (0.55, "#f2e6c6"), (1, "#fbe9c8")])]
b.append(sun(180, 76, 24, "#fceecb", "#f8e8c0"))
b.append(hills(r, 140, 10, "#a8bc8a", op=0.7))
b.append(water(170, 236, "#6fa7b8", "#dff0ef", r, n=9))
for lx, lw in ((90, 40), (200, 26), (420, 52), (560, 30)):          # lily rafts
    b.append(f'<ellipse cx="{lx}" cy="{r.uniform(196, 226):.0f}" rx="{lw}" ry="5" fill="#7fae6a" opacity="0.85"></ellipse>')
b.append(f'<path d="M 360 170 L 360 150 L 402 136 L 444 150 L 444 170 Z" fill="#ead9b8"></path>'
         f'<path d="M 356 150 L 402 128 L 448 150 Z" fill="#b06a4a"></path>')  # villa on the far shore
b.append(f'<rect x="470" y="160" width="26" height="12" fill="#ead9b8"></rect><path d="M 466 160 L 483 150 L 500 160 Z" fill="#b06a4a"></path>')  # boathouse
b.append(f'<path d="M 40 258 Q 320 276 600 252" stroke="#d9c49a" stroke-width="8" fill="none"></path>')  # the promenade
b.append(hills(r, 300, 8, "#93b068"))
b.append(broadleaf(r, 300, 4, 34, 48, "#7a5c40", "#6f9a4e", x0=460, x1=630))
board("the Summer Lakes", "levels 15&ndash;22 &middot; Moonmere's doorstep &mdash; the beautiful one",
      "Villa terraces and terracotta roofs over lily-rafted water; the promenade curving between the lakes. The zone the trailer is shot in. If a player stops walking just to look, it's working.",
      "".join(b),
      [("sky", "#bfe0e4"), ("gold air", "#fbe9c8"), ("lake", "#6fa7b8"), ("lily", "#7fae6a"), ("villa cream", "#ead9b8"), ("terracotta", "#b06a4a")],
      "Eternal late-afternoon gold; water holds the sky; warm stone bounce-light; fog color #f2e6c6, only ever as glow.",
      "Village kit with the terracotta roof variant, piers and boathouses, flower carpets at full budget, the sunken ballroom's dome breaking one lake's surface.",
      "FFXIV's Il Mheg minus the fae menace; Lake Como; Monet with a level band.")

# ── 9. the Reservoir ─────────────────────────────────────────────────────────
r = zr("reservoir")
b = [sky("rv", [(0, "#c2d2dc"), (0.6, "#dcd8c4"), (1, "#e8e2cc")])]
b.append(ridge(r, 110, 20, "#7e8a90"))                              # valley walls
b.append(ridge(r, 150, 14, "#95a0a2", op=0.9))
b.append(fog(150, 24, "#dfe0d2", 0.55))
b.append(water(190, 290, "#5c7f96", "#c8d8dc", r, n=10))
b.append(f'<rect x="286" y="150" width="16" height="52" fill="#7a7568"></rect><path d="M 282 150 L 294 136 L 306 150 Z" fill="#7a7568"></path>')  # the Bell Tower
b.append(f'<rect x="150" y="176" width="9" height="20" fill="#7a7568"></rect><path d="M 147 176 L 154 166 L 162 176 Z" fill="#7a7568"></path>')   # drowned steeple
b.append(f'<rect x="470" y="172" width="7" height="16" fill="#7a7568"></rect>')
b.append(f'<rect x="0" y="284" width="640" height="14" fill="#8d8878"></rect>')  # the dam
for dx in range(0, 640, 40):
    b.append(f'<rect x="{dx+14}" y="278" width="10" height="6" fill="#8d8878"></rect>')
b.append(f'<rect x="0" y="298" width="640" height="62" fill="#6e7a70"></rect>')
board("the Reservoir", "levels 20&ndash;26 &middot; the first shared ground",
      "A drowned valley as a held mirror: steeples and the Bell Tower rising from still water, ridge walls either side, and the dam &mdash; one ruled line of imperial masonry &mdash; underlining the whole scene.",
      "".join(b),
      [("sky", "#c2d2dc"), ("valley wall", "#7e8a90"), ("water", "#5c7f96"), ("stone", "#7a7568"), ("dam", "#8d8878"), ("mist", "#dfe0d2")],
      "Still, windless light; mist lying on the water at dawn, burning off by noon; every vertical doubled by reflection; fog color #dfe0d2.",
      "Water tech at its stillest (high reflection), drowned-village rooftops as breakers, the Bell Tower shell, the dam walkable end to end.",
      "Flooded church towers (Reschensee); FFXI's Qufim fog; the minute after a bell stops.")

# ── 10. the King's Gardens ───────────────────────────────────────────────────
r = zr("kingsgardens")
b = [sky("kg", [(0, "#d8dcec"), (0.6, "#ece4d4"), (1, "#f4e8d8")])]
b.append(sun(320, 70, 20, "#f6ecd4", "#f0e6d0"))
b.append(treeline(r, 130, 18, "#5f8a5a", op=0.75))
b.append(fog(138, 20, "#e8e4dc", 0.5))
for i, y in enumerate((190, 232, 276)):                             # terraced parterres
    b.append(f'<rect x="0" y="{y}" width="640" height="30" fill="{"#7fa06a" if i % 2 == 0 else "#8fae7a"}"></rect>')
    for hx in range(30, 640, 76):
        b.append(f'<rect x="{hx}" y="{y+6}" width="44" height="16" fill="none" stroke="#4e7048" stroke-width="4"></rect>')
        b.append(f'<circle cx="{hx+22}" cy="{y+14}" r="4" fill="#cfd4e4"></circle>')  # silver blooms
b.append(f'<path d="M 296 190 L 296 150 L 320 134 L 344 150 L 344 190 Z" fill="#c8cede" opacity="0.9"></path>'
         f'<path d="M 296 150 L 320 134 L 344 150" fill="none" stroke="#9aa2be" stroke-width="3"></path>')  # the glasshouse
b.append(f'<rect x="120" y="204" width="6" height="18" fill="#b8b4a8"></rect><ellipse cx="123" cy="202" rx="12" ry="3" fill="#9db4c8"></ellipse>')  # fountain
board("the King&rsquo;s Gardens", "levels 22&ndash;28 &middot; still watered, still pruned",
      "Terraced parterres in silver and green, hedge-ruled, fountain-punctuated, the glasshouse catching pale sun. Perfection as atmosphere: the most beautiful zone and the most unnerving, because nothing here is wild.",
      "".join(b),
      [("sky", "#d8dcec"), ("hedge", "#4e7048"), ("lawn", "#7fa06a"), ("silver bloom", "#cfd4e4"), ("glasshouse", "#c8cede"), ("pale stone", "#f4e8d8")],
      "Cool pearl light, as if the zone has its own overcast made of silk; no hard shadows; fog color #e8e4dc.",
      "Pale-garden silver flowers at density, hedge geometry from fences/walls, kit fountains, the glasshouse as a landmark build; gardener sentinels on visible patrol loops.",
      "Versailles out of season; FFXIV's Firmament gardens; a museum after hours.")

# ── 11. the Glassworks ───────────────────────────────────────────────────────
r = zr("glassworks")
b = [sky("gw", [(0, "#e6cfa8"), (0.6, "#f2ddb0"), (1, "#f7e6c0")])]
b.append(sun(320, 88, 30, "#f9e9be", "#f4dfa8"))
b.append(ridge(r, 128, 18, "#b09070", op=0.75))
b.append(fog(140, 22, "#f0ddb4", 0.5))
b.append(hills(r, 210, 16, "#d9b678"))
b.append(hills(r, 260, 18, "#c39a5a"))
for i in range(4):                                                  # furnace row
    fx = 120 + i * 60
    b.append(f'<rect x="{fx}" y="176" width="20" height="34" fill="#7e5a44"></rect>'
             f'<ellipse cx="{fx+10}" cy="176" rx="7" ry="4" fill="#e8933f"></ellipse>'
             f'<path d="M {fx+10} 170 q 4 -16 -2 -26" stroke="#c8b49a" stroke-width="5" fill="none" opacity="0.8"></path>')
b.append(f'<path d="M 470 240 Q 520 252 600 246" stroke="#e8933f" stroke-width="6" fill="none" opacity="0.85"></path>')  # melt canal
b.append(f'<ellipse cx="520" cy="300" rx="70" ry="10" fill="#efe0c0"></ellipse>')  # the mirror flat
b.append(hills(r, 330, 8, "#c9a260"))
b.append(grain(r, 300, "#b08a4c", n=30, op=0.4))
board("the Glassworks", "levels 24&ndash;30 &middot; the rain-shadow desert",
      "Dunes of glass under amber heat-haze, the furnace row still smoking after three centuries, a canal of slow orange melt, and the mirror flat throwing the sky back. The desert that glitters instead of glowers.",
      "".join(b),
      [("sky", "#e6cfa8"), ("glass dune", "#d9b678"), ("deep dune", "#c39a5a"), ("furnace brick", "#7e5a44"), ("melt", "#e8933f"), ("mirror", "#efe0c0")],
      "Perpetual golden hour by heat; shimmer distortion near furnaces; fog color #f0ddb4 as haze bands.",
      "Desert dirt sheet tinted amber, island cliffs as mesas, furnace structures from dungeon/village brick pieces, emissive melt ribbons.",
      "FFXIV's Amh Araeng at its prettiest; glassblowing furnaces; a mirage you can walk to.")

# ── 12. the Canal Works ──────────────────────────────────────────────────────
r = zr("canalworks")
b = [sky("cw", [(0, "#b8c0b8"), (0.65, "#d6d2bc"), (1, "#ded8c0")])]
b.append(treeline(r, 138, 20, "#5e7458", op=0.7))
b.append(fog(146, 26, "#d8d6c2", 0.6))
b.append(f'<path d="M 240 360 L 300 180 L 340 180 L 400 360 Z" fill="#6e8478"></path>')  # canal, one-point perspective
b.append(f'<path d="M 300 180 L 296 360 M 344 180 L 348 360" stroke="#c8ccb8" stroke-width="2" opacity="0.6"></path>')
b.append(f'<rect x="306" y="196" width="28" height="10" fill="#6a5c48"></rect>')  # lock gate far
b.append(f'<rect x="286" y="252" width="66" height="14" fill="#6a5c48"></rect>')  # lock gate near
b.append(f'<path d="M 150 300 q 30 -18 70 -8 L 220 312 Z" fill="#584c3c"></path>')  # sunken barge
b.append(hills(r, 296, 10, "#79855c"))
for rx in range(12):
    x = 30 + rx * 54
    b.append(f'<path d="M {x} 330 q 3 -26 0 -32 M {x+6} 330 q 5 -20 10 -28" stroke="#8a9460" stroke-width="3" fill="none"></path>')
b.append(grain(r, 330, "#6e7a54", n=30, op=0.5))
board("the Canal Works", "levels 26&ndash;32 &middot; the elective gloom",
      "One drowned canal running dead straight to a grey horizon, lock gates rotting in place, a barge settling into the reeds. The one moody zone &mdash; and players chose to come, so the gloom can be gorgeous: silver-green, not brown.",
      "".join(b),
      [("sky", "#b8c0b8"), ("canal", "#6e8478"), ("reed", "#8a9460"), ("wet field", "#79855c"), ("barge wood", "#584c3c"), ("mist", "#d8d6c2")],
      "Flat pewter light, drizzle-bright; mist in horizontal bands; the only zone allowed a grey sky &mdash; keep it silver, never brown; fog color #d8d6c2.",
      "Mud ground sheet, graveyard trees at the margins, canal geometry as carved channels with lock-gate props, reed carpets heavy.",
      "The Fens; FFXI's Pashhow without the aggro dread; Dutch landscape paintings' wet light.")

# ── 13. the Granary Plains ───────────────────────────────────────────────────
r = zr("granaryplains")
b = [sky("gp", [(0, "#c9d8e2"), (0.55, "#eeddb0"), (1, "#f6e2b0")])]
b.append(sun(160, 84, 26, "#f9ecc0", "#f4e0a8"))
b.append(hills(r, 150, 8, "#c8ba8a", op=0.7))
b.append(fog(150, 18, "#f0e2ba", 0.4))
b.append(hills(r, 200, 12, "#ddb75e"))
b.append(hills(r, 260, 14, "#c49a44"))
for tx, ts in ((110, 1.0), (330, 0.8), (540, 1.1)):                 # granary towers
    tw, th = 26 * ts, 60 * ts
    b.append(f'<rect x="{tx}" y="{200-th:.0f}" width="{tw:.0f}" height="{th:.0f}" fill="#9a8f7a"></rect>'
             f'<path d="M {tx-4} {200-th:.0f} L {tx+tw/2:.0f} {200-th-16*ts:.0f} L {tx+tw+4:.0f} {200-th:.0f} Z" fill="#7e7264"></path>')
b.append(f'<path d="M 0 246 Q 320 238 640 250" stroke="#7d9bb8" stroke-width="6" fill="none"></path>')  # the river
for hx in range(5):                                                 # the reaping line
    x = 380 + hx * 40
    b.append(f'<rect x="{x}" y="280" width="8" height="18" fill="#55504b"></rect><path d="M {x+8} 282 q 10 -6 14 2" stroke="#55504b" stroke-width="3" fill="none"></path>')
b.append(grain(r, 300, "#b08c34", n=80, op=0.55))
board("the Granary Plains", "levels 28&ndash;34 &middot; the breadbasket gone feral",
      "Wheat to every horizon, granary towers like castles on the skyline, the river a blue ribbon through gold &mdash; and the reaping line of harvester sentinels working the distance, small and tireless.",
      "".join(b),
      [("sky", "#c9d8e2"), ("wheat light", "#ddb75e"), ("wheat deep", "#c49a44"), ("tower", "#9a8f7a"), ("river", "#7d9bb8"), ("sentinel", "#55504b")],
      "Big-sky afternoon; wind visible as waves in the wheat; heat shimmer at the horizon; fog color #f0e2ba.",
      "Wheat as dense gold grass carpets, granary towers from stone kit pieces, harvester sentinels as ambient patrols, the river with fords.",
      "FFXIV's Yanxia fields; van Gogh's wheat; the American plains with castles.")

# ── 14. the Border Wall ──────────────────────────────────────────────────────
r = zr("borderwall")
b = [sky("bw", [(0, "#a9c4e0"), (0.6, "#dcd8c4"), (1, "#eadcc0")])]
b.append(sun(520, 60, 18, "#f2e8c8"))
b.append(ridge(r, 200, 26, "#6e7482"))                              # peaks below the wall!
b.append(ridge(r, 214, 12, "#e8ecf0", op=0.85))                     # snow caps
b.append(fog(230, 30, "#d8dcd8", 0.55))
b.append(f'<path d="M 0 240 L 640 150" stroke="#8d8878" stroke-width="16" fill="none"></path>')  # the rampart road
b.append(f'<path d="M 0 232 L 640 142" stroke="#a29c8a" stroke-width="4" fill="none"></path>')   # its parapet light edge
for t, ts in ((0.18, 1.0), (0.52, 0.9), (0.86, 1.1)):
    x, y = t * 640, 240 - t * 90
    b.append(f'<rect x="{x-9*ts:.0f}" y="{y-38*ts:.0f}" width="{18*ts:.0f}" height="{38*ts:.0f}" fill="#7e7a6e"></rect>'
             f'<path d="M {x-12*ts:.0f} {y-38*ts:.0f} L {x:.0f} {y-50*ts:.0f} L {x+12*ts:.0f} {y-38*ts:.0f} Z" fill="#6b675c"></path>')
b.append(hills(r, 320, 10, "#8a9478", op=0.9))                      # the interior, far below
b.append(f'<circle cx="320" cy="336" r="5" fill="#e0b264" opacity="0.9"></circle>')  # the capital's glow, tiny, below
board("the Border Wall", "levels 30&ndash;36 &middot; the rampart road",
      "The zone is a road in the sky: the rampart running watchtower to watchtower along the crescent's spine, snow-capped peaks below the parapet, and the whole interior spread out beneath &mdash; with one gold point at its center.",
      "".join(b),
      [("sky", "#a9c4e0"), ("rampart", "#8d8878"), ("tower", "#7e7a6e"), ("peak", "#6e7482"), ("snow", "#e8ecf0"), ("capital glow", "#e0b264")],
      "Thin, bright altitude light; wind-driven cloud shadows crossing the walkway; the interior below always slightly gold; fog color #d8dcd8, below you.",
      "The wall as walkable geometry with parapets, watchtower interiors as rest points, vista rendering of the interior (the one zone built around looking down).",
      "The Great Wall in winter light; Shadow of the Colossus bridges; every screenshot is a banner image.")

# ── 15. the Burned Land ──────────────────────────────────────────────────────
r = zr("burnedland")
b = [sky("bl", [(0, "#d8cbc0"), (0.55, "#e4d6c6"), (1, "#e9d9c8")])]
b.append(sun(320, 92, 24, "#f0e2cc", "#e8d8c4"))
b.append(fog(160, 22, "#e2d6c6", 0.55))
b.append(hills(r, 220, 10, "#a8a29a"))
b.append(f'<path d="M 250 238 L 250 214 L 268 202 L 286 194 L 304 188 L 322 188 L 340 194 L 358 202 L 376 214 L 390 238 Z" fill="#c0a878"></path>'
         f'<path d="M 300 188 L 320 162 L 340 188 Z" fill="#e0b264"></path>')  # the capital on the ash horizon, unburned, gold-crowned
b.append(hills(r, 270, 12, "#8e8880"))
for _ in range(11):                                                 # glassed trunks, all bent away
    x = r.uniform(30, 610)
    lean = -1 if x < 320 else 1
    b.append(f'<path d="M {x:.0f} 300 q {14*lean} -20 {26*lean} -44" stroke="#55504b" stroke-width="5" fill="none" stroke-linecap="round"></path>')
b.append(f'<rect x="96" y="268" width="26" height="18" fill="#6e665c"></rect><path d="M 92 268 L 109 256 L 126 268 Z" fill="#7e7264"></path>'
         f'<circle cx="140" cy="288" r="3" fill="#c05b4d"></circle>')  # Emmer's farmhouse + one ember-flower
b.append(hills(r, 330, 6, "#7e7a74"))
b.append(grain(r, 316, "#95908a", n=40, op=0.45))
board("the Burned Land", "levels 34&ndash;45 &middot; the fire that faced outward",
      "Pale ash country under warm haze, every glassed trunk bent away from the center &mdash; and at the center, untouched, the capital with its gold crown. The wound and the answer in one composition. Emmer's farmhouse stands small at the edge, one ember-flower at the grave.",
      "".join(b),
      [("haze sky", "#d8cbc0"), ("ash light", "#a8a29a"), ("ash deep", "#7e7a74"), ("char", "#55504b"), ("capital stone", "#c0a878"), ("ember", "#c05b4d")],
      "Warm pale haze, like the hour after a bonfire; the capital is always the brightest thing in frame; fog color #e2d6c6.",
      "Ash ground sheet, graveyard bare trees re-posed leaning outward, glassed-ground decals, the capital's walls as the permanent skyline landmark.",
      "Pompeii's casts, gently; FFXIV's Ghimlyt haze; the quiet after fireworks.")

# ── splice ───────────────────────────────────────────────────────────────────
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
target = os.path.join(repo, "design", "the-empty-throne.html")
html = open(target).read()
START, END = "<!-- ARTBOARDS:START -->", "<!-- ARTBOARDS:END -->"
s, e = html.find(START), html.find(END)
assert s != -1 and e != -1, "artboard markers not found"
open(target, "w").write(html[:s] + START + "\n" + "\n".join(BOARDS) + "\n" + html[e:])
print(f"spliced {len(BOARDS)} concept boards into {os.path.relpath(target, repo)}")
