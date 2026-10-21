#!/usr/bin/env python3
"""Generate per-zone map cards and splice them into design/the-empty-throne.html.

Usage:  python3 tools/design/gen_zonemaps.py
        Splices between <!-- ZONEMAPS:START --> and <!-- ZONEMAPS:END --> in the
        Zone Maps tab. Deterministic (seeded per zone name).

Boundary language (researched: real provincial borders follow rivers, mountain
ridgelines, and ruled survey lines in charted country; coasts where land meets
water). Segment styles:
  survey - the empire's ruled registry lines: dead straight, with chain ticks
  river  - meandering blue border
  ridge  - jagged divide with peak glyphs
  wild   - unruled edge where a province just fades out
  burn   - the fire line around the capital: the most fractal edge of all
  coast  - fractal shoreline with a water band outside

Directional rule: every portal sits on the compass side its neighbor occupies
on the continent map (gen_worldmap.py). North is up on every card.
"""
import math, random, zlib, os

W, H = 380, 300


def zrng(name):
    return random.Random(zlib.crc32(name.encode()))


def subdiv(pts, iters, rough, r):
    pts = list(pts)
    for _ in range(iters):
        out = []
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            out.append((x1, y1))
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dx, dy = x2 - x1, y2 - y1
            seg = math.hypot(dx, dy) + 1e-9
            off = r.gauss(0, seg * rough)
            out.append((mx - dy / seg * off, my + dx / seg * off))
        out.append(pts[-1])
        pts = out
    return pts


STYLE_ROUGH = {"survey": None, "river": (3, 0.07), "ridge": (3, 0.13),
               "wild": (3, 0.11), "burn": (4, 0.17), "coast": (4, 0.15)}


def boundary(r, poly):
    """poly: [((x,y), style_to_next), ...] closed clockwise.
    Returns (all_pts, [(style, seg_pts), ...])."""
    segs = []
    n = len(poly)
    for i in range(n):
        p1, style = poly[i]
        p2 = poly[(i + 1) % n][0]
        cfg = STYLE_ROUGH[style]
        pts = [p1, p2] if cfg is None else subdiv([p1, p2], cfg[0], cfg[1], r)
        segs.append((style, pts))
    allp = []
    for _, pts in segs:
        allp.extend(pts[:-1])
    return allp, segs


def path_of(pts, closed=True):
    d = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    return d + (" Z" if closed else "")


def peak(x, y, s):
    w, h = 7 * s, 8 * s
    return (f'<path d="M {x-w:.0f} {y:.0f} L {x:.0f} {y-h:.0f} L {x+w:.0f} {y:.0f}" '
            f'fill="var(--bg)" stroke="var(--text)" stroke-width="1" stroke-linejoin="round"></path>')


_CLIP = {"n": 0, "id": "zclip0"}


def clipped(inner):
    """Confine terrain washes/scatter to the most recent boundary's outline."""
    return f'<g clip-path="url(#{_CLIP["id"]})">{inner}</g>'


def draw_boundary(r, poly, hole=None):
    allp, segs = boundary(r, poly)
    d = path_of(allp)
    if hole is not None:
        d += " " + path_of(hole)
    _CLIP["n"] += 1
    _CLIP["id"] = f"zclip{_CLIP['n']}"
    o = [f'<clipPath id="{_CLIP["id"]}"><path d="{path_of(allp)}"></path></clipPath>',
         f'<path d="{d}" fill="var(--panel)" fill-rule="evenodd" stroke="var(--text-dim)" stroke-width="1.3"></path>']
    for style, pts in segs:
        pd = path_of(pts, closed=False)
        if style == "river":
            o.append(f'<path d="{pd}" fill="none" stroke="var(--caerdun)" stroke-width="3" opacity="0.8" stroke-linecap="round"></path>')
        elif style == "coast":
            o.append(f'<path d="{pd}" fill="none" stroke="var(--caerdun)" stroke-width="13" opacity="0.22" stroke-linecap="round"></path>')
            o.append(f'<path d="{pd}" fill="none" stroke="var(--caerdun)" stroke-width="2" opacity="0.6"></path>')
        elif style == "ridge":
            step = max(1, len(pts) // 7)
            for x, y in pts[1:-1:step]:
                o.append(peak(x, y, r.uniform(0.5, 0.75)))
        elif style == "survey":
            (x1, y1), (x2, y2) = pts[0], pts[-1]
            L = math.hypot(x2 - x1, y2 - y1)
            ux, uy = (x2 - x1) / L, (y2 - y1) / L
            px, py = -uy, ux
            o.append(f'<path d="{pd}" fill="none" stroke="var(--text-dim)" stroke-width="1.8"></path>')
            t = 24.0
            while t < L:
                x, y = x1 + ux * t, y1 + uy * t
                o.append(f'<line x1="{x-px*4:.0f}" y1="{y-py*4:.0f}" x2="{x+px*4:.0f}" y2="{y+py*4:.0f}" stroke="var(--text-dim)" stroke-width="1"></line>')
                t += 30
            for x, y in ((x1, y1), (x2, y2)):
                o.append(f'<rect x="{x-2.6:.0f}" y="{y-2.6:.0f}" width="5.2" height="5.2" fill="var(--text-dim)"></rect>')
        elif style == "burn":
            o.append(f'<path d="{pd}" fill="none" stroke="var(--warn)" stroke-width="1.6" opacity="0.75"></path>')
    return "".join(o)


# ── interior helpers ─────────────────────────────────────────────────────────
def trees(r, cx, cy, rx, ry, n, color="heartwood"):
    o = []
    for _ in range(n):
        a, rr = r.uniform(0, 2 * math.pi), math.sqrt(r.random())
        x, y = cx + rx * rr * math.cos(a), cy + ry * rr * math.sin(a)
        o.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{2.1*r.uniform(0.7,1.1):.1f}" fill="var(--{color})" opacity="0.65"></circle>')
    return "".join(o)


def river(pts, w=2.4, color="caerdun", op=0.75):
    return (f'<path d="{path_of(pts, closed=False)}" fill="none" stroke="var(--{color})" '
            f'stroke-width="{w}" stroke-linecap="round" opacity="{op}"></path>')


def wriver(r, pts, w=2.4, **kw):
    return river(subdiv(pts, 3, 0.08, r), w, **kw)


def stipple(r, cx, cy, rx, ry, n, color, rad=1.0, op=0.7):
    o = []
    for _ in range(n):
        a, rr = r.uniform(0, 2 * math.pi), math.sqrt(r.random())
        x, y = cx + rx * rr * math.cos(a), cy + ry * rr * math.sin(a)
        o.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rad}" fill="var(--{color})" opacity="{op}"></circle>')
    return "".join(o)


def wheat(r, cx, cy, rx, ry, n):
    o = []
    for _ in range(n):
        a, rr = r.uniform(0, 2 * math.pi), math.sqrt(r.random())
        x, y = cx + rx * rr * math.cos(a), cy + ry * rr * math.sin(a)
        o.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x:.0f}" y2="{y-4:.0f}" stroke="var(--accent)" stroke-width="1" opacity="0.55"></line>')
    return "".join(o)


def blocks(r, cx, cy, n, spread, size=7):
    o = []
    for _ in range(n):
        x, y = cx + r.uniform(-spread, spread), cy + r.uniform(-spread * 0.7, spread * 0.7)
        o.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{size*r.uniform(0.7,1.3):.0f}" height="{size*r.uniform(0.6,1.1):.0f}" fill="var(--text-dim)" opacity="0.55"></rect>')
    return "".join(o)


def road(pts, w=1.6):
    return f'<path d="{path_of(pts, closed=False)}" fill="none" stroke="var(--accent-dim)" stroke-width="{w}" stroke-dasharray="4 5"></path>'


def tint(cx, cy, rx, ry, color, op):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="var(--{color})" opacity="{op}"></ellipse>'


def lake(r, cx, cy, rad, wobble=0.2):
    pts = []
    n = 9
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = rad * (1 + r.uniform(-wobble, wobble))
        pts.append((cx + rr * math.cos(a) * 1.25, cy + rr * math.sin(a)))
    pts.append(pts[0])
    return f'<path d="{path_of(subdiv(pts, 2, 0.09, r))}" fill="var(--caerdun)" opacity="0.5"></path>'


def label(x, y, s, size=10, anchor="middle", dim=True, weight=""):
    fill = "var(--text-dim)" if dim else "var(--text)"
    w = ' font-weight="700"' if weight else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{w}>{s}</text>'


def landmark(x, y, s, kind="mark", lx=None, ly=None, anchor="middle"):
    lx, ly = lx if lx is not None else x, ly if ly is not None else y + 14
    if kind == "dungeon":
        g = f'<rect x="{x-5}" y="{y-5}" width="10" height="10" fill="none" stroke="var(--text)" stroke-width="1.8"></rect>'
    else:
        g = f'<rect x="{x-4}" y="{y-4}" width="8" height="8" transform="rotate(45 {x} {y})" fill="var(--text)" opacity="0.8"></rect>'
    return g + label(lx, ly, s, anchor=anchor)


def portal(x, y, deg, dest, kind="exit", lx=None, ly=None, anchor="middle"):
    """Arrow on the boundary pointing outward at compass bearing deg (0 = N)."""
    a = math.radians(deg)
    ux, uy = math.sin(a), -math.cos(a)
    px, py = -uy, ux
    lx, ly = lx if lx is not None else x - ux * 14, ly if ly is not None else y - uy * 14 + 4
    if kind == "gate":
        g = f'<rect x="{x-7:.0f}" y="{y-7:.0f}" width="14" height="14" transform="rotate(45 {x:.0f} {y:.0f})" fill="var(--accent)"></rect>'
        return g + label(lx, ly, dest, anchor=anchor, dim=False)
    tip = (x + ux * 13, y + uy * 13)
    b1 = (x - ux * 2 + px * 7, y - uy * 2 + py * 7)
    b2 = (x - ux * 2 - px * 7, y - uy * 2 - py * 7)
    g = (f'<path d="M {tip[0]:.0f} {tip[1]:.0f} L {b1[0]:.0f} {b1[1]:.0f} L {b2[0]:.0f} {b2[1]:.0f} Z" '
         f'fill="var(--accent)"></path>')
    return g + label(lx, ly, dest, 9.5, anchor=anchor)


def card(name, band, note, body):
    svg = (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Map of {name}" '
           f'xmlns="http://www.w3.org/2000/svg" font-family="Alegreya Sans, system-ui, sans-serif">{body}</svg>')
    return (f'<article class="zonecard"><h3>{name} <span class="band">{band}</span></h3>'
            f'{svg}<p class="zc-note">{note}</p></article>')


cards = []

# ── Caerdun ── neighbors: Hunting Wood gate SE, Heartwood road E, Moonmere road S
r = zrng("caerdun")
poly = [((70, 258), "coast"), ((44, 170), "coast"), ((80, 84), "coast"), ((190, 40), "coast"),
        ((300, 56), "survey"), ((336, 160), "survey"), ((300, 246), "wild")]
b = [draw_boundary(r, poly)]
b.append(label(56, 46, "the fjord", 10))
for ty in (110, 150, 190):
    b.append(f'<path d="M 120 {ty} L 280 {ty}" stroke="var(--text-dim)" stroke-width="1" opacity="0.45" fill="none"></path>')
b.append(blocks(r, 200, 150, 24, 66))
b.append(landmark(112, 112, "the lighthouse", lx=120, anchor="start"))
b.append(landmark(170, 216, "the wage vaults"))
b.append(landmark(258, 96, "the drill yards", lx=250, ly=88, anchor="end"))
b.append(label(250, 108, "Paladin &amp; Samurai halls", 9, anchor="end"))
b.append(road([(250, 170), (300, 180), (326, 182)]))
b.append(portal(330, 182, 90, "to the Caerdun Fields", lx=314, ly=170, anchor="end"))
cards.append(card("Caerdun", "city &middot; safe",
    "The garrison city on the fjord: granite terraces to a cold harbor, the empire's ruled survey line for an eastern border, and both tank guilds drilling for an empire with a return date. One landward exit: the Caerdun Fields (E).", "".join(b)))

# ── the Caerdun Fields ── city W, North Road E, ferry NW, border gate SE (quest)
# One coast, the north-west, where the fjord is and the ferry berths; the whole
# west border is land under the rim, with the city gate in it (Philip, 2026-09-05:
# the ferry moved off the west side, "that map needs to change too").
r = zrng("caerdunfields")
poly = [((52, 88), "coast"), ((210, 44), "wild"), ((336, 66), "wild"), ((344, 226), "wild"),
        ((210, 266), "survey"), ((66, 244), "wild")]
b = [draw_boundary(r, poly)]
b.append(trees(r, 140, 120, 70, 50, 20, color="heartwood"))
b.append(stipple(r, 240, 160, 80, 60, 22, "heartwood", 1.2, 0.4))
b.append(road([(60, 160), (180, 150), (330, 140)]))
b.append(landmark(120, 190, "the watch farms", lx=120, ly=208))
b.append(landmark(230, 100, "milestone zero", lx=238, ly=92, anchor="start"))
b.append(portal(56, 158, 270, "to Caerdun", lx=72, ly=146, anchor="start"))
b.append(road([(150, 152), (168, 100), (173, 58)], 1.2))
b.append(portal(173, 54, 345, "ferry to the Moonmere Shores", lx=184, ly=74, anchor="start"))
b.append(portal(338, 140, 90, "to the North Road", lx=322, ly=128, anchor="end"))
b.append(portal(300, 230, 135, "the border gate", "gate", lx=284, ly=220, anchor="end"))
b.append(label(284, 208, "opens with the main quest", 8.5, anchor="end"))
cards.append(card("the Caerdun Fields", "1&ndash;10",
    "Caerdun's home countryside: watch farms, pine meadows, and milestone zero of the old imperial roads. The fjord lies along the north-west &mdash; no land road reaches Moonmere from here, but a ferry crosses the water for a fare &mdash; and the border gate in the southeast stays shut until the main quest grants your charter. Exits: Caerdun (W gate) &middot; the North Road (E) &middot; the gulf ferry (NW, to the Moonmere Shores) &middot; the Hunting Wood (SE gate, main quest).", "".join(b)))

# ── Heartwood ── gate W, Caerdun NW, Moonmere SW; bay E
r = zrng("heartwood")
poly = [((56, 96), "wild"), ((200, 38), "wild"), ((300, 66), "coast"), ((338, 160), "coast"),
        ((296, 252), "wild"), ((110, 264), "wild"), ((48, 190), "wild")]
b = [draw_boundary(r, poly)]
b.append(label(330, 60, "the bay", 10))
b.append(trees(r, 180, 155, 110, 90, 46))
b.append(f'<circle cx="180" cy="150" r="32" fill="none" stroke="var(--heartwood)" stroke-width="2.5" opacity="0.8"></circle>')
b.append(label(180, 153, "the grove ring", 9.5, dim=False))
b.append(blocks(r, 178, 150, 12, 44, 6))
b.append(landmark(126, 222, "the song-steps", lx=126, ly=240))
b.append(label(126, 252, "Monk guild", 8.5))
b.append(landmark(248, 210, "the grudge hall", lx=256, anchor="start"))
b.append(label(256, 236, "Dark Knight guild", 8.5, anchor="start"))
b.append(portal(52, 150, 270, "to the Heartwood Fields", lx=70, ly=138, anchor="start"))
cards.append(card("Heartwood", "city &middot; safe",
    "The unconquered city inside its ring of living trees, on the bay. Its borders were never surveyed &mdash; the empire's chains stopped where the grove began. One landward exit: the Heartwood Fields (W).", "".join(b)))

# ── the Heartwood Fields ── city E, North Road NW, Shore Road SW, border gate W (quest)
r = zrng("heartwoodfields")
poly = [((60, 66), "wild"), ((250, 40), "wild"), ((342, 100), "wild"), ((330, 240), "wild"),
        ((180, 268), "wild"), ((48, 210), "ridge")]
b = [draw_boundary(r, poly)]
b.append(trees(r, 180, 130, 110, 70, 40))
b.append(trees(r, 250, 210, 60, 40, 16))
b.append(road([(336, 160), (220, 160), (110, 150)]))
b.append(landmark(210, 220, "the charcoal burners", lx=210, ly=238))
b.append(landmark(150, 90, "the wild orchards", lx=158, ly=82, anchor="start"))
b.append(portal(336, 160, 90, "to Heartwood", lx=320, ly=148, anchor="end"))
b.append(portal(120, 54, 315, "to the North Road", lx=136, ly=46, anchor="start"))
b.append(portal(96, 246, 225, "to the Shore Road", lx=116, ly=270, anchor="start"))
b.append(portal(56, 150, 270, "the border gate", "gate", lx=80, ly=120, anchor="start"))
b.append(label(80, 132, "opens with the main quest", 8.5, anchor="start"))
cards.append(card("the Heartwood Fields", "1&ndash;10",
    "Heartwood's home countryside: wild orchards, charcoal camps, and the grove-shadowed road west. The border gate waits at the western ridge &mdash; shut until the main quest grants your charter. Exits: Heartwood (E) &middot; the North Road (NW) &middot; the Shore Road (SW) &middot; the Timber Estates (W gate, main quest).", "".join(b)))

# ── Moonmere ── the Banded Cloisters on the Crescent Mere (MOONMERE.md); the causeway N
# Drawn FROM THE PLAN, not by hand: the coast is client/src/moonmere-layout.json's shape (dense and
# already wandered, D-9 -- the same polygon registerZone hands ZONE_SHAPES, so the card, the in-game
# map and the ground agree), its blocks and rows are their own corners, and the named buildings stand
# where the layout puts them. North is up (+z), as on every card and the in-game map.
r = zrng("moonmere")
_ML = __import__("json").load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "client", "src", "moonmere-layout.json")))
_MS, _MX, _MZ = 0.66, 10.0, 336.0          # px per metre; the world point at the card's top centre


def _mm(x, z):
    return (W / 2 + (x - _MX) * _MS, 14 + (_MZ - z) * _MS)


def exact_coast(pts):
    """A coast already wandered (the plan's own): no subdivision, one ribbon."""
    _CLIP["n"] += 1
    _CLIP["id"] = f"zclip{_CLIP['n']}"
    d = path_of(pts)
    return (f'<clipPath id="{_CLIP["id"]}"><path d="{d}"></path></clipPath>'
            f'<path d="{d}" fill="var(--panel)" stroke="var(--text-dim)" stroke-width="1.3"></path>'
            f'<path d="{d}" fill="none" stroke="var(--caerdun)" stroke-width="13" opacity="0.22" stroke-linejoin="round"></path>'
            f'<path d="{d}" fill="none" stroke="var(--caerdun)" stroke-width="2" opacity="0.6" stroke-linejoin="round"></path>')


def _poly(corners, op=0.55, fill="var(--text-dim)"):
    return f'<path d="{path_of([_mm(x, z) for x, z in corners])}" fill="{fill}" opacity="{op}"></path>'


b = [exact_coast([_mm(x, z) for x, z in _ML["shape"]["pts"][::2]])]
# the mere: the sea come in through the mouth (the coast already bites it out); its quay ring
b.append(clipped(f'<path d="{path_of([_mm(x, z) for x, z in _ML["terrain"]["mere"]["pts"]])}" fill="none" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"></path>'))
for blk in _ML["blocks"] + _ML["rows"]:
    b.append(_poly(blk["corners"]))
for c in _ML["civic"]:
    if c["id"] in ("loggia",):
        continue
    b.append(_poly(c["corners"], 0.85, "var(--text)"))
# the streets the map draws (the ones play maps too: addMapRoad); the decks over the water -- the
# Inn Pier out to the Shelf Inn on its piles, the Jetty -- as a thin deck stroke, or the inn reads as
# a block adrift in the sea (S5 review). The causeway has its own stroke below
for st in _ML["streets"]:
    if st.get("map") is False:
        continue
    if st.get("kind") == "deck":
        if st.get("id") != "causeway":
            b.append(f'<path d="{path_of([_mm(x, z) for x, z in st["pts"]], closed=False)}" fill="none" stroke="var(--text-dim)" stroke-width="2.2" opacity="0.75" stroke-linecap="round"></path>')
        continue
    b.append(f'<path d="{path_of([_mm(x, z) for x, z in st["pts"]], closed=False)}" fill="none" stroke="var(--accent-dim)" stroke-width="1.1" opacity="0.7"></path>')
_cw = _ML["causeway"]
x0, y0 = _mm(_cw["x"], _cw["zLand"])
b.append(f'<path d="M {x0:.0f} {y0:.0f} L {x0:.0f} 6" stroke="var(--text-dim)" stroke-width="3.5" opacity="0.8"></path>')
cx, cy = _mm(*_ML["terrain"]["mere"]["centre"])
b.append(label(round(cx), round(cy + 3), "the Mere", 10))
_at = {c["id"]: _mm(c["x"], c["z"]) for c in _ML["civic"]}
# every label over the plan carries a halo of the card's panel colour, so a name that crosses a block
# still reads (S5 review: the Long Tower's, Academy Court's and the Sea Lamp's sat on filled blocks)
_bn = len(b)
X, Y = _at["longTower"]; b.append(landmark(round(X), round(Y), "the Long Tower", lx=round(X) + 6, ly=round(Y) - 18))
X, Y = _at["burnedShelf"]; b.append(label(round(X) - 8, round(Y) + 14, "the Burned Shelf", 9, anchor="end"))
b.append(label(round(X) - 8, round(Y) + 25, "Black Mage guild", 8.5, anchor="end"))
X, Y = _at["college"]; b.append(landmark(round(X), round(Y), "the Mending College", lx=round(X) + 16, ly=round(Y) - 6, anchor="start"))
b.append(label(round(X) + 16, round(Y) + 5, "White Mage guild", 8.5, anchor="start"))
X, Y = _mm(16, 168); b.append(label(round(X), round(Y) - 11, "Academy Court", 8.5, dim=False))
X, Y = _at["inn"]; b.append(label(round(X) - 9, round(Y) + 3, "the Shelf Inn", 8.5, anchor="end"))
X, Y = _at["seaLamp"]; b.append(landmark(round(X), round(Y), "the Sea Lamp", lx=round(X) - 8, ly=round(Y) + 3, anchor="end"))
X, Y = _at["causewayGate"]; b.append(label(round(X) + 12, round(Y) + 4, "the Landing", 8.5, anchor="start"))
b[_bn:] = [t.replace("<text ", '<text stroke="var(--panel)" stroke-width="3" paint-order="stroke" stroke-linejoin="round" ') for t in b[_bn:]]
b.append(portal(x0, 8, 0, "causeway to the Moonmere Shores", lx=x0 + 12, ly=16, anchor="start"))
b.append(label(W - 14, H - 12, "the Southern Sea", 9.5, anchor="end"))
cards.append(card("Moonmere", "city &middot; safe",
    "The academy in exile: the Banded Cloisters, gold tufa ruled with basalt, on a crescent island round its own inner harbour, the Mere, open to the south. Quay, two terraces and the knoll step up from the water; the Long Tower stands over all of it, its louvres painted shut. One way off: the causeway north to the Moonmere Shores.", "".join(b)))

# ── the Moonmere Shores ── the island city S across the Mere (causeway), Shore Road NE, border gate N (quest)
r = zrng("moonmereshores")
poly = [((56, 60), "wild"), ((200, 38), "wild"), ((334, 62), "wild"), ((344, 220), "coast"),
        ((196, 252), "coast"), ((50, 214), "coast")]
b = [draw_boundary(r, poly)]
b.append(label(196, 282, "the Mere", 10))
b.append(stipple(r, 130, 130, 70, 50, 20, "heartwood", 1.1, 0.4))
b.append(trees(r, 270, 120, 55, 40, 14))
b.append(f'<path d="M 196 246 L 197 274" stroke="var(--text-dim)" stroke-width="3.5" opacity="0.8"></path>')
b.append(landmark(120, 200, "the ferry piers", lx=120, ly=218))
b.append(landmark(258, 180, "the reed harvest", lx=266, anchor="start"))
b.append(portal(197, 248, 180, "causeway to Moonmere", ly=236))
b.append(portal(52, 140, 270, "ferry to the Caerdun Fields", lx=68, ly=128, anchor="start"))
b.append(portal(310, 76, 45, "to the Shore Road", lx=306, ly=50, anchor="end"))
b.append(portal(196, 44, 0, "the border gate", "gate", lx=196, ly=68))
b.append(label(196, 80, "opens with the main quest", 8.5))
cards.append(card("the Moonmere Shores", "1&ndash;10",
    "The shore ring around Moonmere Bay: ferry piers, reed beds, one land road out &mdash; and the ferry, the paid crossing over the gulf that the piers were built for. The academy stands out in the Mere, a causeway's walk offshore. Exits: Moonmere (S, causeway) &middot; the Shore Road (NE) &middot; the gulf ferry (W, to the Caerdun Fields) &middot; the Summer Lakes (N gate, main quest).", "".join(b)))

# ── the North Road ── Caerdun Fields W, Heartwood Fields E; cliffs N, foothills S
r = zrng("northroad")
poly = [((44, 96), "coast"), ((190, 56), "coast"), ((336, 88), "wild"), ((344, 210), "ridge"),
        ((180, 248), "ridge"), ((52, 216), "ridge")]
b = [draw_boundary(r, poly)]
b.append(clipped(f'<rect x="0" y="0" width="{W}" height="{H}" fill="var(--caerdun)" opacity="0.11"></rect>'))
b.append(label(150, 44, "the cold coast", 9))
for _ in range(16):
    _x, _y, _w = r.uniform(60, 320), r.uniform(92, 230), r.uniform(12, 26)
    b.append(clipped(f'<path d="M {_x:.0f} {_y:.0f} q {_w/2:.0f} {-_w/4:.0f} {_w:.0f} 0" fill="none" stroke="var(--caerdun)" stroke-width="1.3" opacity="0.5"></path>'))
b.append(road([(50, 160), (140, 150), (250, 152), (338, 148)]))
for _ in range(12):
    _x, _y, _s = r.uniform(70, 185), r.uniform(168, 226), r.uniform(0.8, 1.3)
    b.append(f'<path d="M {_x-5*_s:.0f} {_y:.0f} L {_x:.0f} {_y-9*_s:.0f} L {_x+5*_s:.0f} {_y:.0f} Z" fill="var(--panel)" stroke="var(--heartwood)" stroke-width="1.1"></path>')
b.append(lake(r, 260, 198, 13))
b.append(label(238, 202, "the frozen tarn", 8.5, anchor="end"))
b.append('<circle cx="196" cy="152" r="9" fill="var(--accent)" opacity="0.30"></circle>')
b.append(landmark(196, 152, "the halfway inn", ly=170))
b.append(label(196, 182, "the one lit window &mdash; where the three stories merge", 8.5))
b.append(landmark(290, 120, "the old milestones", lx=282, ly=112, anchor="end"))
b.append(portal(48, 158, 270, "to the Caerdun Fields", lx=64, ly=146, anchor="start"))
b.append(portal(340, 148, 90, "to the Heartwood Fields", lx=324, ly=136, anchor="end"))
cards.append(card("the North Road", "10&ndash;17",
    "The cold way between Caerdun and Heartwood: a snowbound upland under the cliff coast &mdash; drifts to the eaves, snow-hooded pines, a frozen tarn &mdash; and the halfway inn, the one lit window in a hundred white miles, where the three city stories merge into one at ~16. Beautiful, not bleak: winter as a postcard, with the crescent's peaks above. Exits: the Caerdun Fields (W) &middot; the Heartwood Fields (E).", "".join(b)))

# ── the Shore Road ── Heartwood Fields NE, Moonmere Shores SW; the warm sea SE
r = zrng("shoreroad")
poly = [((44, 190), "wild"), ((160, 90), "wild"), ((330, 52), "wild"), ((348, 170), "coast"),
        ((220, 260), "coast"), ((70, 262), "coast")]
b = [draw_boundary(r, poly)]
b.append(label(300, 240, "the warm sea", 9))
b.append(road([(70, 210), (170, 180), (280, 120), (334, 74)]))
b.append(trees(r, 140, 150, 60, 40, 16))
b.append(landmark(240, 180, "the palm strand", lx=232, ly=198, anchor="end"))
b.append(landmark(152, 218, "the grain-ship wreck", lx=160, ly=212, anchor="start"))
b.append(portal(330, 60, 45, "to the Heartwood Fields", lx=316, ly=52, anchor="end"))
b.append(portal(62, 224, 225, "to the Moonmere Shores", lx=82, ly=250, anchor="start"))
cards.append(card("the Shore Road", "10&ndash;17",
    "The southern way, where the climate softens: palms on the strand, a wrecked imperial grain ship half-buried in the sand, and the warm sea glittering southeast. With the gulf closing the west, this is Moonmere's only land road &mdash; everyone bound for the academy walks it. Exits: the Heartwood Fields (NE) &middot; the Moonmere Shores (SW).", "".join(b)))

# ── the Hunting Wood ── Caerdun gate W, Reservoir S, Gardens E; Mausoleum inside
r = zrng("huntingwood")
poly = [((58, 64), "ridge"), ((210, 36), "ridge"), ((330, 74), "river"), ((342, 216), "wild"),
        ((240, 266), "wild"), ((84, 252), "survey")]
b = [draw_boundary(r, poly)]
b.append(trees(r, 195, 155, 145, 105, 78))
for ang in (-16, 6, 28):
    a = math.radians(ang)
    b.append(f'<path d="M 210 152 L {210+150*math.cos(a):.0f} {152-150*math.sin(a):.0f}" stroke="var(--bg-deep)" stroke-width="7" opacity="0.9"></path>')
b.append(label(296, 108, "the king&rsquo;s rides", 9))
b.append(landmark(210, 152, "the hunting lodge", ly=170))
b.append(landmark(114, 206, "the swallowed garrison", lx=122, ly=200, anchor="start"))
b.append(landmark(112, 96, "the Mausoleum", "dungeon", lx=120, ly=88, anchor="start"))
b.append(label(120, 100, "20&ndash;22", 8.5, anchor="start"))
b.append(portal(71, 158, 270, "gate: the Caerdun Fields", "gate", lx=89, ly=145, anchor="start"))
b.append(portal(180, 260, 180, "to the Reservoir"))
b.append(portal(338, 160, 90, "to the King&rsquo;s Gardens", lx=322, ly=148, anchor="end"))
cards.append(card("the Hunting Wood", "15&ndash;22 &middot; main quest", "Caerdun's doorstep, behind the story-locked border gate. The crescent's ridge walls it north; a stream marks the Gardens border east; the west line is the empire's old forest survey, chain-ticks and all. Exits: the Caerdun Fields (W, gate) &middot; the Reservoir (S) &middot; the King's Gardens (E).", "".join(b)))

# ── the Timber Estates ── Heartwood gate E, Gardens W, Glassworks S
r = zrng("timberestates")
poly = [((64, 56), "survey"), ((322, 50), "wild"), ((348, 234), "survey"), ((72, 246), "survey")]
b = [draw_boundary(r, poly)]
for i in range(9):
    for j in range(6):
        b.append(f'<circle cx="{92+i*26+r.uniform(-3,3):.0f}" cy="{78+j*26+r.uniform(-3,3):.0f}" r="2.4" fill="var(--heartwood)" opacity="0.6"></circle>')
b.append(f'<path d="M 80 226 L 330 220" stroke="var(--caerdun)" stroke-width="3" opacity="0.6"></path>')
b.append(label(112, 212, "the log flume", 9, anchor="start"))
b.append(landmark(296, 84, "the overseer&rsquo;s lodge", lx=288, ly=76, anchor="end"))
b.append(landmark(112, 206, "the timber yards", lx=120, ly=198, anchor="start"))
b.append(portal(322, 148, 90, "gate: the Heartwood Fields", "gate", lx=306, ly=136, anchor="end"))
b.append(portal(68, 120, 270, "to the King&rsquo;s Gardens", lx=86, ly=108, anchor="start"))
b.append(portal(200, 243, 180, "to the Glassworks", ly=232))
cards.append(card("the Timber Estates", "15&ndash;22 &middot; main quest", "Heartwood's doorstep and its old wound: an industrial plantation, so its borders are the straightest in the interior &mdash; ruled survey lines on three sides, wild only toward the bay. Exits: the Heartwood Fields (E, gate) &middot; the King's Gardens (W) &middot; the Glassworks (S).", "".join(b)))

# ── the Summer Lakes ── Moonmere gate S, Granary N, Canal W
r = zrng("summerlakes")
poly = [((44, 96), "wild"), ((170, 40), "river"), ((344, 84), "wild"), ((330, 232), "survey"),
        ((130, 262), "wild")]
b = [draw_boundary(r, poly)]
b.append(lake(r, 120, 130, 40))
b.append(lake(r, 230, 158, 48))
b.append(lake(r, 310, 130, 24))
b.append(wriver(r, [(238, 40), (232, 110)], 2.2))
b.append(wriver(r, [(232, 205), (228, 250), (222, 268)], 2.6))
b.append(f'<path d="M 128 182 C 172 216 262 224 294 190" stroke="var(--accent-dim)" stroke-width="2.4" fill="none" opacity="0.9"></path>')
b.append(label(196, 236, "the promenade", 9))
b.append(landmark(300, 170, "the boathouse crescent", lx=292, ly=188, anchor="end"))
b.append(landmark(166, 108, "the sunken ballroom", "dungeon", lx=158, ly=96, anchor="end"))
b.append(landmark(78, 190, "the lily meres", lx=78, ly=208))
b.append(portal(224, 254, 180, "gate: the Moonmere Shores", "gate", lx=258, ly=272, anchor="middle"))
b.append(portal(206, 44, 0, "to the Granary Plains", lx=206, ly=66))
b.append(portal(48, 140, 270, "to the Canal Works", lx=64, ly=128, anchor="start"))
cards.append(card("the Summer Lakes", "15&ndash;22 &middot; main quest", "Moonmere's doorstep &mdash; the beautiful one. The river is the northern border and the resort registry line the southern; between them, villa lakes and a promenade gone charmingly wild. Exits: the Moonmere Shores (S, gate) &middot; the Granary Plains (N) &middot; the Canal Works (W).", "".join(b)))

# ── the Reservoir ── Hunting Wood N, Gardens NE, Canal S; a walled valley
r = zrng("reservoir")
poly = [((120, 44), "wild"), ((286, 52), "ridge"), ((334, 226), "survey"), ((76, 232), "ridge")]
b = [draw_boundary(r, poly)]
b.append(lake(r, 200, 130, 82, wobble=0.13))
b.append(label(126, 222, "the great dam", 9))
b.append(blocks(r, 160, 140, 7, 26, 5))
b.append(label(160, 170, "the drowned village", 9))
b.append(landmark(222, 98, "the Bell Tower", "dungeon", lx=214, ly=90, anchor="end"))
b.append(label(214, 102, "22&ndash;25", 8.5, anchor="end"))
b.append(portal(200, 48, 0, "to the Hunting Wood", lx=200, ly=70))
b.append(portal(300, 96, 45, "to the King&rsquo;s Gardens", lx=286, ly=84, anchor="end"))
b.append(portal(240, 229, 180, "to the Canal Works", lx=268, ly=218, anchor="middle"))
cards.append(card("the Reservoir", "20&ndash;26",
    "A valley the empire drowned on purpose: ridgelines for east and west borders, the dam &mdash; a ruled line of imperial masonry &mdash; for the southern one. The merged story's first shared ground: the only interior zone within two hops of every doorstep, so all three cities' explorers converge here, and the Bell Tower is the first dungeon the whole world runs together. Exits: the Hunting Wood (N) &middot; the King's Gardens (NE) &middot; the Canal Works (S, over the dam).", "".join(b)))

# ── the King's Gardens ── HW W, Timber E, Reservoir SW, Wall N, Burned S
r = zrng("kingsgardens")
poly = [((72, 78), "ridge"), ((312, 70), "survey"), ((324, 238), "wild"), ((64, 252), "survey")]
b = [draw_boundary(r, poly)]
for gx, gy in [(130, 116), (252, 112), (136, 196), (256, 192)]:
    b.append(f'<rect x="{gx-36}" y="{gy-24}" width="72" height="48" fill="none" stroke="var(--heartwood)" stroke-width="1.5" opacity="0.7" rx="3"></rect>')
    b.append(stipple(r, gx, gy, 28, 17, 9, "moonmere", 1.4, 0.8))
b.append(landmark(193, 154, "the fountain court"))
b.append(landmark(292, 216, "the glasshouse", lx=284, ly=210, anchor="end"))
b.append(landmark(96, 228, "the hedge labyrinth", lx=110, ly=234, anchor="start"))
b.append(portal(68, 150, 270, "to the Hunting Wood", lx=84, ly=160, anchor="start"))
b.append(portal(318, 150, 90, "to the Timber Estates", lx=302, ly=138, anchor="end"))
b.append(portal(80, 246, 225, "down to the Reservoir", lx=100, ly=244, anchor="start"))
b.append(portal(192, 73, 0, "stairs to the Border Wall", lx=192, ly=88))
b.append(portal(240, 244, 180, "to the Burned Land", ly=234))
cards.append(card("the King&rsquo;s Gardens", "22&ndash;28",
    "The royal parterres under the crescent: a ridge for a northern border, ruled garden-registry lines east and west. Nothing here is wild, and you are trespassing. Exits: Hunting Wood (W) &middot; Timber Estates (E) &middot; Reservoir (SW, down) &middot; Border Wall (N, stairs) &middot; the Burned Land (S).", "".join(b)))

# ── the Glassworks ── Timber N, Wall E, Burned W, Granary SW
r = zrng("glassworks")
poly = [((62, 74), "ridge"), ((296, 52), "ridge"), ((344, 204), "wild"), ((230, 262), "wild"),
        ((58, 236), "wild")]
b = [draw_boundary(r, poly)]
b.append(clipped(f'<rect x="0" y="0" width="{W}" height="{H}" fill="var(--accent-dim)" opacity="0.24"></rect>'))
for _ in range(24):
    x, y, w2 = r.uniform(80, 320), r.uniform(90, 240), r.uniform(10, 22)
    b.append(clipped(f'<path d="M {x:.0f} {y:.0f} q {w2/2:.0f} {-w2/3:.0f} {w2:.0f} 0" fill="none" stroke="var(--accent-dim)" stroke-width="1.2" opacity="0.7"></path>'))
for i in range(4):
    b.append(f'<rect x="{104+i*48}" y="96" width="13" height="19" fill="var(--warn)" opacity="0.7"></rect>')
b.append(label(176, 130, "the furnace rows &mdash; still burning", 9))
b.append(wriver(r, [(128, 130), (170, 175), (232, 200), (296, 208)], 2.6, color="accent"))
b.append(label(252, 226, "the melt canal", 9))
b.append(landmark(272, 160, "the mirror flat", lx=264, ly=154, anchor="end"))
b.append(portal(184, 61, 0, "to the Timber Estates", lx=184, ly=84))
b.append(portal(322, 120, 90, "stairs to the Border Wall", lx=308, ly=102, anchor="end"))
b.append(portal(60, 160, 270, "to the Burned Land", lx=76, ly=148, anchor="start"))
b.append(portal(130, 252, 200, "to the Granary Plains", lx=150, ly=242, anchor="start"))
cards.append(card("the Glassworks", "24&ndash;30",
    "Rain-shadow country: the crescent's ridges border it north and east, and behind them the furnaces never banked &mdash; three centuries of heat vitrified the province into dunes of glass. Exits: Timber Estates (N) &middot; Border Wall (E, stairs) &middot; the Burned Land (W) &middot; Granary Plains (SW).", "".join(b)))

# ── the Canal Works ── Reservoir N, Granary E, Summer Lakes SE
r = zrng("canalworks")
poly = [((54, 78), "river"), ((316, 62), "river"), ((334, 222), "wild"), ((96, 262), "wild")]
b = [draw_boundary(r, poly)]
for i in range(3):
    b.append(f'<path d="M 70 {112+i*46} L 320 {104+i*46}" stroke="var(--caerdun)" stroke-width="4" opacity="0.45"></path>')
b.append(f'<path d="M 196 70 L 200 246" stroke="var(--caerdun)" stroke-width="5" opacity="0.5"></path>')
b.append(stipple(r, 195, 160, 130, 90, 46, "heartwood", 1.0, 0.4))
b.append(landmark(198, 134, "the great sluice", lx=206, ly=126, anchor="start"))
b.append(landmark(118, 216, "the sunken barges", lx=118, ly=234))
b.append(landmark(282, 176, "the lock stairs", lx=290, anchor="start"))
b.append(portal(180, 68, 0, "to the Reservoir", lx=180, ly=92))
b.append(portal(324, 110, 90, "to the Granary Plains", lx=308, ly=100, anchor="end"))
b.append(portal(296, 240, 135, "to the Summer Lakes", lx=280, ly=262, anchor="end"))
cards.append(card("the Canal Works", "26&ndash;32",
    "The failed flood-works: its own canals are its northern border, the fen owns the rest. Barge trains rot in their locks; reeds have the towpaths. The gloomy one &mdash; and you chose it, because the pay is good. Exits: the Reservoir (N) &middot; the Granary Plains (E) &middot; the Summer Lakes (SE).", "".join(b)))

# ── the Granary Plains ── Burned N (the fire line), Glassworks NE, Canal W, Summer S
r = zrng("granaryplains")
poly = [((78, 56), "burn"), ((302, 66), "survey"), ((326, 244), "wild"), ((118, 266), "wild"),
        ((54, 170), "river")]
b = [draw_boundary(r, poly)]
b.append(wheat(r, 200, 160, 130, 90, 130))
b.append(wriver(r, [(60, 160), (110, 200), (170, 236), (222, 262)], 2.8))
b.append(label(120, 178, "the fords", 9))
for tx, ty in [(120, 110), (286, 120), (160, 220)]:
    b.append(f'<rect x="{tx-6}" y="{ty-16}" width="12" height="16" fill="var(--text-dim)" opacity="0.75"></rect>')
b.append(label(120, 124, "granary towers", 9))
b.append(landmark(262, 208, "the reaping line", lx=254, ly=200, anchor="end"))
b.append(label(254, 224, "harvester sentinels, still at work", 8.5, anchor="end"))
b.append(portal(190, 58, 0, "to the Burned Land", lx=190, ly=80))
b.append(portal(296, 74, 45, "to the Glassworks", lx=282, ly=94, anchor="end"))
b.append(portal(58, 150, 270, "to the Canal Works", lx=74, ly=138, anchor="start"))
b.append(portal(226, 260, 180, "to the Summer Lakes", ly=250))
cards.append(card("the Granary Plains", "28&ndash;34",
    "The breadbasket gone feral. Its northern border is the fire line itself &mdash; the ragged edge where the Burned Land starts &mdash; its west the river, its east a granary survey line. The harvesters still reap. Exits: the Burned Land (N) &middot; Glassworks (NE) &middot; Canal Works (W) &middot; Summer Lakes (S).", "".join(b)))

# ── the Border Wall ── stairs: Reservoir W, Gardens S, Glassworks E
r = zrng("borderwall")
poly = [((36, 224), "ridge"), ((310, 54), "wild"), ((352, 92), "ridge"), ((76, 268), "wild")]
b = [draw_boundary(r, poly)]
b.append(f'<path d="M 56 240 L 330 78" stroke="var(--text)" stroke-width="5" opacity="0.8"></path>')
for t in (0.16, 0.5, 0.84):
    x, y = 56 + 274 * t, 240 - 162 * t
    b.append(f'<rect x="{x-6:.0f}" y="{y-15:.0f}" width="12" height="17" fill="var(--text)" opacity="0.85"></rect>')
b.append(label(150, 120, "the rampart road", 10))
b.append(label(150, 134, "a hundred miles of wall-walk", 8.5))
b.append(label(262, 108, "watchtowers", 9))
b.append(portal(52, 250, 270, "stairs down: the Reservoir", lx=68, ly=286, anchor="start"))
b.append(portal(206, 168, 180, "stairs down: the King&rsquo;s Gardens", lx=210, ly=196))
b.append(portal(344, 78, 90, "stairs down: the Glassworks", lx=330, ly=64, anchor="end"))
cards.append(card("the Border Wall", "30&ndash;36",
    "A zone that is a border: the rampart road along the crescent's spine, watchtower to watchtower, the interior spread below. The sentinels patrol thickest here. Stairs down: the Reservoir (W) &middot; the King's Gardens (S) &middot; the Glassworks (E).", "".join(b)))

# ── the Burned Land ── from Gardens N, Glassworks E, Granary S; inward: the Capital
r = zrng("burnedland")
poly = [((70, 96), "burn"), ((196, 40), "burn"), ((330, 86), "burn"), ((342, 214), "burn"),
        ((214, 268), "burn"), ((64, 232), "burn")]
wall_hole = [(160, 122), (196, 108), (232, 124), (240, 158), (214, 186), (172, 184), (150, 154), (160, 122)]
b = [draw_boundary(r, poly, hole=wall_hole)]
b.append(clipped(stipple(r, 195, 152, 140, 100, 90, "empire", 1.1, 0.55)))
for ang in range(0, 360, 45):
    a = math.radians(ang)
    b.append(f'<path d="M {195+120*math.cos(a):.0f} {152+92*math.sin(a):.0f} L {195+52*math.cos(a):.0f} {152+40*math.sin(a):.0f}" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="2 4" opacity="0.6"></path>')
b.append(label(196, 148, "the Capital", 9.5, dim=False))
b.append(label(196, 161, "walls unburned", 8))
b.append(f'<path d="M 189 92 L 196 104 L 203 92 Z" fill="var(--accent)"></path>')
b.append(landmark(108, 100, "the glassed orchard", lx=116, ly=92, anchor="start"))
b.append(landmark(272, 220, "the last camp", lx=264, ly=238, anchor="end"))
b.append(portal(180, 52, 0, "from the King&rsquo;s Gardens", lx=180, ly=74))
b.append(portal(336, 150, 90, "from the Glassworks", lx=320, ly=140, anchor="end"))
b.append(portal(220, 264, 180, "from the Granary Plains", ly=254))
cards.append(card("the Burned Land", "34&ndash;45",
    "The one border no surveyor drew: the fire line, exactly as ragged as the night left it, ringing the capital whose walls did not burn. Ash roads converge inward. Entered from: King's Gardens (N) &middot; Glassworks (E) &middot; Granary Plains (S). Exit: inward.", "".join(b)))

# ── the Capital of Vanai ── entry S from the Burned Land
r = zrng("capital")
wall = [((130, 62), "survey"), ((262, 54), "survey"), ((330, 128), "survey"), ((312, 218), "survey"),
        ((238, 264), "survey"), ((116, 256), "survey"), ((52, 186), "survey"), ((62, 104), "survey")]
b = [draw_boundary(r, wall)]
for (pt, _s) in wall:
    b.append(f'<rect x="{pt[0]-5:.0f}" y="{pt[1]-5:.0f}" width="10" height="10" fill="var(--text)" opacity="0.8" transform="rotate(45 {pt[0]:.0f} {pt[1]:.0f})"></rect>')
b.append(blocks(r, 150, 180, 20, 44, 6))
b.append(blocks(r, 250, 170, 16, 34, 6))
b.append(blocks(r, 195, 110, 12, 30, 6))
b.append(landmark(140, 190, "the market ward", lx=132, ly=214, anchor="end"))
b.append(landmark(258, 168, "the archive", lx=266, anchor="start"))
b.append(f'<rect x="180" y="76" width="28" height="24" fill="none" stroke="var(--text)" stroke-width="2.4"></rect>')
b.append(label(194, 114, "the palace &mdash; the Regent", 9.5, dim=False))
b.append(label(194, 240, "one city, two mornings", 9))
b.append(portal(178, 260, 180, "the gates &mdash; from the Burned Land", "gate", lx=178, ly=286))
cards.append(card("the Capital of Vanai", "45+",
    "A bastioned wall on the empire's own survey lines &mdash; the one shape in Ardenfell that is deliberate. The whole city is the final dungeon; the Regent holds the palace. At the gates a party chooses: the empty city of the main quest (open while any member still needs it), or the living capital. Entry: the Burned Land (S).", "".join(b)))

# ── splice ───────────────────────────────────────────────────────────────────
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
target = os.path.join(repo, "design", "the-empty-throne.html")
html = open(target).read()
START, END = "<!-- ZONEMAPS:START -->", "<!-- ZONEMAPS:END -->"
s, e = html.find(START), html.find(END)
assert s != -1 and e != -1, "zone map markers not found"
inner = START + '\n<div class="zonegrid">\n' + "\n".join(cards) + "\n</div>\n"
open(target, "w").write(html[:s] + inner + html[e:])
print(f"spliced {len(cards)} zone cards into {os.path.relpath(target, repo)}")
