#!/usr/bin/env python3
"""Generate the Ardenfell continent map and splice it into design/the-empty-throne.html.

Usage:  python3 tools/design/gen_worldmap.py
        (re-run after editing; same seed -> identical map. Change `rng` seed,
        COAST control points, or region/label positions below, then re-run.
        Preview: serve design/ with any http server and open
        the-empty-throne.html#map — file:// won't load the Google fonts.)

The map is generated, not drawn: the macro shape (COAST, ranges, rivers, labels)
is designed by hand below; the fractal micro-detail comes from seeded midpoint
displacement, so the coastline stays organic but reproducible.

Cartography rules applied (researched 2026-08-29):
- fractal coastline via midpoint displacement, extra roughness in the NW (fjords)
- mountain ranges in arcs; the border crescent doubles as the natural wall,
  with gaps only at the three city gates
- rivers rise in mountains, grow, join, and reach the sea in a bay
- rain-shadow desert (Glassworks) on the lee side of the NE crescent
- lakes have outflows; island arc off the SE coast
- Moonmere is a sea island, not a lake island: it stands off the south coast in
  the Southern Sea, joined to the mainland by the causeway, and the river the
  interior sends south empties into the same bay the causeway leaves from
"""
import math, random

rng = random.Random(11)  # seed chosen by iteration

CX, CY = 450, 395  # interior centroid


def subdivide(pts, iters=3, rough=0.16, fjord=None, closed=True):
    for _ in range(iters):
        out = []
        n = len(pts)
        rng2 = range(n) if closed else range(n - 1)
        for i in rng2:
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            out.append((x1, y1))
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dx, dy = x2 - x1, y2 - y1
            seg = math.hypot(dx, dy)
            r = rough
            if fjord and fjord(mx, my):
                r = rough * 2.4
            off = rng.gauss(0, seg * r)
            out.append((mx - dy / (seg + 1e-9) * off, my + dx / (seg + 1e-9) * off))
        if not closed:
            out.append(pts[-1])
        pts = out
    return pts


def path(pts, closed=True):
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return d + (" Z" if closed else "")


# ---- the continent silhouette (designed gestalt, clockwise from N) ----
COAST = [
    (300, 150), (380, 120), (470, 135), (560, 118), (640, 150),   # north coast
    (700, 195), (722, 260),                                        # NE cape
    (684, 306), (664, 352),                                        # Heartwood Bay — a shallower bite, leaving room for the Heartwood Fields
    (735, 395), (712, 465),                                        # east cape
    (640, 520), (600, 590),                                        # SE coast
    (548, 648), (492, 688),                                        # south coast shoulder
    (470, 730), (416, 656), (372, 722),                            # Moonmere Bay: east arm, the river's mouth at its head, west arm
    (292, 566), (240, 532),                                        # toward the gulf
    (322, 478), (316, 424),                                        # gulf inner shore (deep bite)
    (198, 398), (174, 340),                                        # west cape beyond the gulf
    (212, 284), (244, 262), (204, 246), (246, 226), (268, 172),    # NW fjord coast (notched)
]

fjordzone = lambda x, y: (x < 330 and y < 300) or (y < 165)
coast_pts = subdivide(COAST, iters=4, rough=0.13, fjord=fjordzone)

# ---- islands (arc off the SE coast) ----
def blob(cx, cy, r, wobble=0.35, n=7, iters=3):
    base = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * (1 + rng.uniform(-wobble, wobble))
        base.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return subdivide(base, iters=iters, rough=0.14)

islands = [blob(672, 660, 26), blob(730, 610, 15), blob(636, 712, 12)]

# ---- Moonmere: an island city in the Southern Sea, off the mouth of the bay ----
MOON = (418, 744)
moon_isle = blob(MOON[0], MOON[1], 20, wobble=0.16)
CAUSEWAY = ((416, 662), (418, 726))  # the bay's head -> the island's north quay

# ---- lakes ----
reservoir = blob(352, 388, 17, wobble=0.25)
summer1 = blob(438, 512, 12, wobble=0.2)
summer2 = blob(470, 528, 8, wobble=0.2)

# ---- the border crescent: organic closed curve around the interior ----
def crescent_r(a):
    return 152 + 20 * math.sin(a * 2.3 + 1.2) + 10 * math.sin(a * 4.7)

border = []
for i in range(72):
    a = 2 * math.pi * i / 72
    r = crescent_r(a)
    border.append((CX + r * math.cos(a), CY + r * math.sin(a)))

# gates at compass bearings (screen: angle 0 = east, y down)
def on_border(deg):
    a = math.radians(deg)
    r = crescent_r(a)
    return CX + r * math.cos(a), CY + r * math.sin(a)

gate_nw = on_border(215)   # Caerdun's door
gate_e = on_border(348)    # Heartwood's door
gate_s = on_border(100)    # Moonmere's door

GAPS_DEG = [(207, 223), (340, 356), (88, 114)]  # no mountains at the gates

# ---- mountains along the crescent (skipping gaps) + NW coastal highlands ----
def in_gap(deg):
    d = deg % 360
    return any(lo <= d <= hi for lo, hi in GAPS_DEG)

peaks = []
for i in range(150):
    deg = i * 2.4
    if in_gap(deg):
        continue
    a = math.radians(deg)
    r = crescent_r(a) + rng.uniform(-7, 7)
    x = CX + r * math.cos(a) + rng.uniform(-4, 4)
    y = CY + r * math.sin(a) + rng.uniform(-4, 4)
    s = rng.uniform(0.55, 1.0)
    peaks.append((x, y, s))

# NW highlands behind Caerdun (parallel to the fjord coast)
for i in range(16):
    t = i / 15
    x = 236 + 60 * t + rng.uniform(-10, 10)
    y = 300 - 95 * t + rng.uniform(-9, 9)
    peaks.append((x, y, rng.uniform(0.4, 0.75)))

peaks.sort(key=lambda p: p[1])  # paint back-to-front

def peak_glyph(x, y, s):
    w, h = 8.5 * s, 9.5 * s
    return (f'<path d="M {x-w:.1f} {y:.1f} L {x:.1f} {y-h:.1f} L {x+w:.1f} {y:.1f}" '
            f'fill="var(--bg)" stroke="var(--text)" stroke-width="1.1" stroke-linejoin="round"></path>'
            f'<path d="M {x:.1f} {y-h:.1f} L {x+w*0.35:.1f} {y-h*0.35:.1f}" '
            f'stroke="var(--text-dim)" stroke-width="0.8"></path>')

# ---- rivers (rise in the crescent, grow, join, reach the sea) ----
def river(pts, width):
    p = subdivide(pts, iters=3, rough=0.10, closed=False)
    return f'<path d="{path(p, closed=False)}" fill="none" stroke="var(--caerdun)" stroke-width="{width}" stroke-linecap="round" opacity="0.85"></path>'

r_main = [(468, 262), (462, 320), (447, 380), (440, 442), (444, 500), (448, 538)]  # source→Summer Lakes
r_west = [(330, 300), (344, 368)]                       # into the Reservoir
r_west2 = [(360, 404), (398, 452), (430, 478)]          # Reservoir outflow joins main
r_out = [(438, 546), (432, 578), (424, 612)]            # lakes → under the wall, running south
r_delta = [(424, 614), (430, 648), (440, 688)]          # → the sea, on the bay's east arm, clear of the causeway

# ---- forests (tree glyphs) ----
def forest(cx, cy, rad, n):
    out = []
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        rr = rad * math.sqrt(rng.random())
        x, y = cx + rr * math.cos(a) * 1.3, cy + rr * math.sin(a)
        s = rng.uniform(0.7, 1.1)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{2.4*s:.1f}" fill="var(--heartwood)" opacity="0.7"></circle>'
                   f'<line x1="{x:.1f}" y1="{y+2.2*s:.1f}" x2="{x:.1f}" y2="{y+4.4*s:.1f}" stroke="var(--heartwood)" stroke-width="0.9" opacity="0.7"></line>')
    return "".join(out)

forests = (forest(352, 302, 34, 26)      # the Hunting Wood (NW interior)
           + forest(560, 330, 36, 26)    # the Timber Estates (E interior)
           + forest(684, 408, 26, 16)    # wild woods around Heartwood city (outside)
           + forest(300, 555, 22, 10))   # SW coastal scrub

# ---- desert stipple (rain shadow behind the NE crescent) ----
dots = []
for _ in range(60):
    a = rng.uniform(-0.9, 0.35)
    rr = rng.uniform(55, 125)
    x, y = CX + rr * math.cos(a) + 30, CY + rr * math.sin(a) - 40
    dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1" fill="var(--accent-dim)" opacity="0.8"></circle>')
desert = "".join(dots)

# ---- assemble ----
def tint(cx, cy, rx, ry, color, op):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="var(--{color})" opacity="{op}"></ellipse>'

coast_d = path(coast_pts)
svg = f'''<svg viewBox="0 0 900 800" role="img" aria-label="The continent of Ardenfell: fjord coasts and highlands in the northwest by Caerdun, a forested east coast by Heartwood, the island city of Moonmere on its causeway off the south coast, and a mountain crescent enclosing the sealed imperial interior with the capital of Vanai at its heart." xmlns="http://www.w3.org/2000/svg" font-family="Alegreya Sans, system-ui, sans-serif">
<defs><filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"></feGaussianBlur></filter></defs>

<!-- sea -->
<rect x="0" y="0" width="900" height="800" fill="var(--caerdun)" opacity="0.16"></rect>

<!-- coastal glow -->
<path d="{coast_d}" fill="none" stroke="var(--caerdun)" stroke-width="22" opacity="0.10"></path>
<path d="{coast_d}" fill="none" stroke="var(--caerdun)" stroke-width="10" opacity="0.16"></path>

<!-- landmass -->
<path d="{coast_d}" fill="var(--panel)" stroke="var(--text-dim)" stroke-width="1.6"></path>
{''.join(f'<path d="{path(i)}" fill="var(--panel)" stroke="var(--text-dim)" stroke-width="1.3"></path>' for i in islands)}
<path d="{path(moon_isle)}" fill="var(--panel)" stroke="var(--text-dim)" stroke-width="1.4"></path>

<!-- region tints (soft) -->
<g filter="url(#soft)">
{tint(352, 302, 52, 40, 'heartwood', 0.28)}
{tint(560, 330, 55, 42, 'heartwood', 0.34)}
{tint(452, 520, 48, 30, 'caerdun', 0.22)}
{tint(478, 292, 40, 26, 'moonmere', 0.30)}
{tint(MOON[0], MOON[1], 34, 26, 'moonmere', 0.26)}
{tint(540, 430, 48, 34, 'accent-dim', 0.30)}
{tint(392, 470, 40, 26, 'empire', 0.35)}
{tint(346, 386, 30, 24, 'caerdun', 0.28)}
{tint(452, 468, 34, 22, 'accent', 0.20)}
{tint(304, 272, 50, 34, 'heartwood', 0.26)}
{tint(644, 386, 46, 30, 'heartwood', 0.28)}
{tint(452, 636, 74, 34, 'heartwood', 0.22)}
{tint(355, 200, 55, 18, 'caerdun', 0.13)}
{tint(470, 196, 60, 18, 'caerdun', 0.13)}
{tint(590, 250, 45, 22, 'caerdun', 0.13)}
{tint(645, 455, 40, 25, 'accent', 0.14)}
{tint(580, 507, 45, 20, 'accent', 0.14)}
{tint(490, 540, 45, 20, 'accent', 0.14)}
</g>
<circle cx="455" cy="380" r="42" fill="none" stroke="var(--empire)" stroke-width="20" opacity="0.5" filter="url(#soft)"></circle>

<!-- desert stipple -->
{desert}

<!-- the border (dashed) with the mountain crescent on top -->
<path d="{path(border)}" fill="none" stroke="var(--text-dim)" stroke-width="1.6" stroke-dasharray="5 5" opacity="0.85"></path>

<!-- rivers -->
{river(r_main, 2.4)}
{river(r_west, 1.6)}
{river(r_west2, 1.9)}
{river(r_out, 2.6)}
{river(r_delta, 3.0)}

<!-- lakes -->
<path d="{path(reservoir)}" fill="var(--caerdun)" opacity="0.55"></path>
<path d="{path(summer1)}" fill="var(--caerdun)" opacity="0.55"></path>
<path d="{path(summer2)}" fill="var(--caerdun)" opacity="0.55"></path>

<!-- forests -->
{forests}

<!-- mountains -->
{''.join(peak_glyph(x, y, s) for x, y, s in peaks)}

<!-- gates -->
<rect x="{gate_nw[0]-8:.0f}" y="{gate_nw[1]-8:.0f}" width="16" height="16" transform="rotate(45 {gate_nw[0]:.0f} {gate_nw[1]:.0f})" fill="var(--accent)"></rect>
<rect x="{gate_e[0]-8:.0f}" y="{gate_e[1]-8:.0f}" width="16" height="16" transform="rotate(45 {gate_e[0]:.0f} {gate_e[1]:.0f})" fill="var(--accent)"></rect>
<rect x="{gate_s[0]-8:.0f}" y="{gate_s[1]-8:.0f}" width="16" height="16" transform="rotate(45 {gate_s[0]:.0f} {gate_s[1]:.0f})" fill="var(--accent)"></rect>

<!-- cities -->
<circle cx="258" cy="242" r="7" fill="var(--caerdun)" stroke="var(--text)" stroke-width="1.5"></circle>
<circle cx="694" cy="386" r="7" fill="var(--heartwood)" stroke="var(--text)" stroke-width="1.5"></circle>
<circle cx="{MOON[0]}" cy="{MOON[1]}" r="6.5" fill="var(--moonmere)" stroke="var(--text)" stroke-width="1.5"></circle>
<!-- the causeway: the island city's one road, out of the bay's west arm -->
<path d="M {CAUSEWAY[0][0]} {CAUSEWAY[0][1]} L {CAUSEWAY[1][0]} {CAUSEWAY[1][1]}" stroke="var(--text-dim)" stroke-width="2.6" stroke-linecap="round" opacity="0.9"></path>
<text x="418" y="784" font-size="10.5" fill="var(--text-dim)" font-style="italic" text-anchor="middle">the causeway</text>

<!-- roads (dotted, outside the border) -->
<path d="M 264 250 C 300 300 320 320 {gate_nw[0]:.0f} {gate_nw[1]:.0f}" fill="none" stroke="var(--accent-dim)" stroke-width="1.8" stroke-dasharray="4 5"></path>
<path d="M 688 386 C 652 380 622 372 {gate_e[0]:.0f} {gate_e[1]:.0f}" fill="none" stroke="var(--accent-dim)" stroke-width="1.8" stroke-dasharray="4 5"></path>
<path d="M 416 650 C 414 620 418 580 {gate_s[0]:.0f} {gate_s[1]+6:.0f}" fill="none" stroke="var(--accent-dim)" stroke-width="1.8" stroke-dasharray="4 5"></path>
<path d="M 692 394 C 648 500 540 616 428 654" fill="none" stroke="var(--accent-dim)" stroke-width="1.2" stroke-dasharray="2 6" opacity="0.7"></path>
<path d="M 215 405 Q 244 480 300 528" fill="none" stroke="var(--caerdun)" stroke-width="1.6" stroke-dasharray="2 5" opacity="0.85"></path>
<text x="206" y="468" font-size="11" fill="var(--caerdun)" font-style="italic" text-anchor="end">the ferry</text>
<text x="452" y="186" font-size="10.5" fill="var(--accent-dim)" font-style="italic" text-anchor="middle">the North Road</text>
<text x="600" y="512" font-size="10.5" fill="var(--accent-dim)" font-style="italic" text-anchor="start">the Shore Road</text>
<path d="M 268 238 C 350 172 590 158 690 376" fill="none" stroke="var(--accent-dim)" stroke-width="1.2" stroke-dasharray="2 6" opacity="0.7"></path>

<!-- the Mausoleum -->
<rect x="371" y="325" width="10" height="10" transform="rotate(45 376 330)" fill="var(--text)" opacity="0.9"></rect>

<!-- labels: seas -->
<g font-size="13" font-style="italic" fill="var(--caerdun)" text-anchor="middle" opacity="0.95">
  <text x="130" y="540">the Western Gulf</text>
  <text x="770" y="330">Heartwood Bay</text>
  <text x="640" y="770">the Southern Sea</text>
  <text x="705" y="655" font-size="11">the Stray Isles</text>
</g>

<!-- labels: cities -->
<g font-size="14" fill="var(--text)" font-weight="700">
  <text x="250" y="226" text-anchor="middle">Caerdun</text>
  <text x="694" y="370" text-anchor="middle">Heartwood</text>
  <text x="444" y="752" text-anchor="start">Moonmere</text>
</g>

<!-- labels: interior provinces -->
<g font-size="12.5" fill="var(--text)" text-anchor="middle">
  <text x="352" y="290">the Hunting Wood</text>
  <text x="560" y="308">the Timber Estates</text>
  <text x="440" y="505">the Summer Lakes</text>
  <text x="484" y="276">the King's Gardens</text>
  <text x="556" y="444">the Glassworks</text>
  <text x="382" y="484">the Canal Works</text>
  <text x="332" y="374">the Reservoir</text>
  <text x="466" y="470">the Granary Plains</text>
  <text x="310" y="262" font-size="11.5">the Caerdun Fields</text>
  <text x="642" y="412" font-size="11.5">the Heartwood Fields</text>
  <text x="468" y="628" font-size="11.5" text-anchor="start">the Moonmere Shores</text>
</g>
<text x="455" y="346" text-anchor="middle" font-size="10" fill="var(--text-dim)" letter-spacing="1.6">THE BURNED LAND</text>
<text x="455" y="384" text-anchor="middle" font-size="13.5" fill="var(--text)" font-weight="700">VANAI</text>
<text x="455" y="398" text-anchor="middle" font-size="10" fill="var(--text-dim)">the capital</text>
<text x="390" y="334" text-anchor="start" font-size="10" fill="var(--text-dim)">the Mausoleum</text>

<!-- fjords note + highlands -->
<text x="196" y="212" font-size="11" fill="var(--text-dim)" font-style="italic" text-anchor="middle">the fjords</text>
<text x="238" y="480" font-size="11" fill="var(--text-dim)" font-style="italic" text-anchor="middle">the gulf shore</text>

<!-- cartouche: title, compass, scale -->
<text x="120" y="712" font-size="22" font-family="Cinzel, serif" fill="var(--text)" letter-spacing="6" text-anchor="start">ARDENFELL</text>
<text x="120" y="732" font-size="11" fill="var(--text-dim)" font-style="italic" text-anchor="start">surveyed in the 297th year of the sealed border</text>
<g stroke="var(--text-dim)" fill="none">
  <line x1="820" y1="120" x2="820" y2="70" stroke-width="1.5"></line>
  <path d="M 820 70 L 814 84 L 820 80 L 826 84 Z" fill="var(--text)" stroke="none"></path>
  <line x1="120" y1="756" x2="220" y2="756" stroke-width="1.5"></line>
  <line x1="120" y1="751" x2="120" y2="761" stroke-width="1.5"></line>
  <line x1="220" y1="751" x2="220" y2="761" stroke-width="1.5"></line>
</g>
<text x="828" y="98" font-size="12" fill="var(--text)">N</text>
<text x="170" y="774" font-size="10" fill="var(--text-dim)" text-anchor="middle">a hundred miles</text>
</svg>'''

import os

repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
target = os.path.join(repo, "design", "the-empty-throne.html")
html = open(target).read()
start = html.find('<svg viewBox="0 0 900 800"')
assert start != -1, "map svg not found in the-empty-throne.html — has the viewBox changed?"
end = html.find("</svg>", start) + len("</svg>")
open(target, "w").write(html[:start] + svg + html[end:])
print(f"spliced {len(svg)} bytes into {os.path.relpath(target, repo)}")
