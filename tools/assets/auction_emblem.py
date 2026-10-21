"""The auction house's emblem, shared by every city's generator (Philip, 2026-10-11:
"one consistent, recognisable auction-house emblem/sign that reads from a distance
in every city -- the same symbol in all four, rendered in each city's materials").

The symbol is the map's: the balance the zone map and the minimap draw for the
auction house (client/src/map_services.ts SERVICE_STYLE.auction.glyph, GLYPH below;
client/test/auction_emblem.test.mjs holds the two equal), which is itself the
Capital's auction sign. Here it is a ROUNDEL: a disc field, a raised ring round it,
and the balance standing proud of the field -- a post on a stepped foot, a finial,
the beam on a round boss, and two pans hanging on their cords.

Pure python (no bpy, no numpy), so any generator imports it:

  emblem_faces(radius, ...)  the roundel as convex polygons in metres, each tagged
                             with its PART ('field', 'ring', 'device'): origin the
                             roundel's centre on its back plane, x right, y up, +z
                             out of the wall. A city maps each part to its own
                             surface (Caerdun: a blue field, bone ring and device,
                             CF-8) and feeds the polygons to its own geometry.
  paint_emblem(px, colours)  the same shapes rasterised (PIL), for a city that
                             would rather carry the emblem as a texture picture.

Both read SHAPES, so the relief and the picture never drift apart. The device is
the glyph's 24-unit drawing scaled into the field (DEVICE_SCALE): the glyph's
strokes become bars, its pan arcs solid bowls (a stroke a centimetre wide is
nothing at 40 m; a filled bowl reads).
"""
import math

# the map's glyph, verbatim (map_services.ts SERVICE_STYLE.auction.glyph): a post
# (12, 3.5..19.5), its foot (8..16 at 19.5), the beam (4.5..19.5 at 7), and from
# each end of the beam two cords down to a pan whose bowl is the arc under y 13
GLYPH = "M12 3.5v16M8 19.5h8M4.5 7h15M4.5 7 2 13a2.5 2.5 0 0 0 5 0zM19.5 7 17 13a2.5 2.5 0 0 0 5 0z"

FIELD_R = 0.8           # the field's radius, the ring's inner edge (the roundel's radius is 1)
DEVICE_SCALE = 0.068    # glyph units to roundel units: the device's farthest point (a pan's rim) at 0.71
GLYPH_CENTRE = (12.0, 11.8)


def _g(x, y):
    """A glyph point (24-unit icon space, y down) in roundel units (y up)."""
    return ((x - GLYPH_CENTRE[0]) * DEVICE_SCALE, -(y - GLYPH_CENTRE[1]) * DEVICE_SCALE)


def _rect(x0, x1, y0, y1):
    return [_g(x0, y1), _g(x1, y1), _g(x1, y0), _g(x0, y0)]


def _bar(a, b, w):
    """A bar of glyph width w from glyph point a to b (a stroke with its width)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return [_g(a[0] + nx, a[1] + ny), _g(b[0] + nx, b[1] + ny), _g(b[0] - nx, b[1] - ny), _g(a[0] - nx, a[1] - ny)]


def _ngon(cx, cy, r, n, phase=0.0):
    return [_g(cx + r * math.cos(phase + 2 * math.pi * k / n), cy + r * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]


def _bowl(cx, y, r, n=8):
    """A pan: the half disc under its rim at glyph y (the glyph's arc, filled)."""
    return [_g(cx + r * math.cos(math.pi * k / n), y + r * math.sin(math.pi * k / n)) for k in range(n + 1)]


# The device as CONVEX pieces (each a prism in relief, a polygon in paint), in the
# glyph's own numbers: the stroke widths are the glyph's 2 units thinned to what a
# relief can carry (post 1.6, beam 1.4, cords 0.6), the foot stepped, a finial on
# the post's head and a boss where the beam crosses it
SHAPES = {
    'device': [
        _rect(11.2, 12.8, 6.2, 18.8),                                   # the post
        [_g(12.0, 2.3), _g(13.1, 3.6), _g(12.0, 4.9), _g(10.9, 3.6)],    # the finial
        _rect(4.2, 19.8, 6.3, 7.7),                                     # the beam
        _ngon(12.0, 7.0, 1.35, 8, math.pi / 8),                         # the boss
        [_g(7.4, 20.3), _g(16.6, 20.3), _g(15.4, 18.6), _g(8.6, 18.6)],  # the foot
        _bar((4.5, 7.0), (2.4, 13.0), 0.6), _bar((4.5, 7.0), (6.6, 13.0), 0.6),        # the left pan's cords
        _bar((19.5, 7.0), (17.4, 13.0), 0.6), _bar((19.5, 7.0), (21.6, 13.0), 0.6),    # the right pan's
        _bowl(4.5, 13.0, 2.6), _bowl(19.5, 13.0, 2.6),                  # the pans
    ],
}


def _area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def _ccw(poly):
    return poly if _area(poly) > 0 else list(reversed(poly))


def emblem_faces(radius, depth=0.12, relief=0.08, segs=24, ring=True, back=True, sides=True):
    """The roundel as [(part, [(x, y, z), ...], normal)] convex polygons, metres.

    radius  the roundel's radius (the ring's outer edge)
    depth   the board's thickness: its back at z 0, the field's face at `depth`
    relief  how far the device stands proud of the field (the ring 0.7 of it)
    segs    the circle's segments
    ring    a raised ring round the field (else the field runs to the edge)
    back    close the board's back (a sign hung free; off when it sits on a wall)
    sides   the prisms' side faces (off: the device and ring are laid flat 1.5 cm
            proud, for a small plaque whose relief is never seen)
    Every polygon is wound counter-clockwise seen from its normal's side."""
    out = []
    zf = depth
    zd = depth + (relief if sides else 0.015)
    zr = depth + (relief * 0.7 if sides else 0.012)
    S = radius

    def circle(r):
        return [(r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
    outer = circle(S)
    inner = circle(S * FIELD_R) if ring else outer
    # the board: its face (the field), its edge, its back
    out.append(('field', [(x, y, zf) for x, y in inner], (0.0, 0.0, 1.0)))
    for i in range(segs):
        (ax, ay), (bx, by) = outer[i], outer[(i + 1) % segs]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        L = math.hypot(mx, my)
        top = zr if ring else zf
        out.append(('ring' if ring else 'field', [(ax, ay, 0.0), (bx, by, 0.0), (bx, by, top), (ax, ay, top)], (mx / L, my / L, 0.0)))
    if back:
        out.append(('field', [(x, y, 0.0) for x, y in reversed(outer)], (0.0, 0.0, -1.0)))
    if ring:
        # the ring's face, a quad a segment, and its inner edge down to the field
        for i in range(segs):
            (ax, ay), (bx, by) = outer[i], outer[(i + 1) % segs]
            (cx, cy), (dx, dy) = inner[(i + 1) % segs], inner[i]
            out.append(('ring', [(ax, ay, zr), (bx, by, zr), (cx, cy, zr), (dx, dy, zr)], (0.0, 0.0, 1.0)))
            if sides:
                mx, my = (cx + dx) / 2, (cy + dy) / 2
                L = math.hypot(mx, my)
                out.append(('ring', [(dx, dy, zf), (dx, dy, zr), (cx, cy, zr), (cx, cy, zf)], (-mx / L, -my / L, 0.0)))
    # the device, every piece a prism standing on the field
    for poly in SHAPES['device']:
        p = _ccw([(x * S, y * S) for x, y in poly])
        out.append(('device', [(x, y, zd) for x, y in p], (0.0, 0.0, 1.0)))
        if sides:
            n = len(p)
            for i in range(n):
                (ax, ay), (bx, by) = p[i], p[(i + 1) % n]
                ex, ey = bx - ax, by - ay
                L = math.hypot(ex, ey)
                if L < 1e-6:
                    continue
                out.append(('device', [(ax, ay, zf), (bx, by, zf), (bx, by, zd), (ax, ay, zd)], (ey / L, -ex / L, 0.0)))
    return out


def paint_emblem(px, field, ring, device, background=None, ring_on=True):
    """The roundel as a px x px PIL image (RGBA): `field`, `ring`, `device` and
    `background` are (r, g, b) tuples (background None: transparent outside the
    roundel). The same SHAPES as the relief, so a painted emblem and a carved one
    are one symbol."""
    from PIL import Image, ImageDraw
    k = 4                                                   # drawn 4x and reduced: smooth edges
    W = px * k
    im = Image.new('RGBA', (W, W), (*background, 255) if background else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = W / 2
    to = lambda u, v: (c + u * c, c - v * c)
    if ring_on:
        d.ellipse([0, 0, W - 1, W - 1], fill=(*ring, 255))
        r = c * FIELD_R
        d.ellipse([c - r, c - r, c + r, c + r], fill=(*field, 255))
    else:
        d.ellipse([0, 0, W - 1, W - 1], fill=(*field, 255))
    for poly in SHAPES['device']:
        d.polygon([to(u, v) for u, v in poly], fill=(*device, 255))
    return im.resize((px, px), Image.LANCZOS)


# The variants a city that builds its geometry at runtime reads as data
# (Heartwood, whose grown city is generated in the browser, not baked by a
# generator: client/src/heartwood-auction-plan.ts). Unit radius; the city scales
# them. 'sign': the relief, a board hung free and shown both ways (each face a
# copy turned half round, so no back); 'plaque': the flat version, its device
# and ring laid 1.5 cm proud (a small roundel on a wall, whose relief nobody sees).
JSON_VARIANTS = {
    'sign': dict(depth=0.07, relief=0.06, segs=32, back=False),
    'plaque': dict(depth=0.06, relief=0.05, segs=24, back=False, sides=False),
}


def emblem_json():
    """JSON_VARIANTS as plain data: {glyph, source, variants: {name: {args, faces:
    [[part, [[x, y, z], ...], [nx, ny, nz]], ...]}}}, coordinates rounded to 0.1 mm
    at unit radius. The glyph rides along so the city's node test can hold the
    file to the map's icon (client/test/auction_emblem.test.mjs)."""
    r = lambda v: round(v, 5)
    out = {'glyph': GLYPH, 'source': 'tools/assets/auction_emblem.py --json', 'frame': 'right-handed: x right, y up, +z out of the face; polygons convex, counter-clockwise from the normal side', 'variants': {}}
    for name, args in JSON_VARIANTS.items():
        faces = emblem_faces(1.0, **args)
        out['variants'][name] = {'args': args, 'faces': [[part, [[r(c) for c in p] for p in poly], [r(c) for c in n]] for part, poly, n in faces]}
    return out


if __name__ == '__main__':
    # a quick look: python3 tools/assets/auction_emblem.py out.png
    # the data for a runtime city: python3 tools/assets/auction_emblem.py --json client/src/auction-emblem.json
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--json':
        import json
        with open(sys.argv[2], 'w') as fh:
            json.dump(emblem_json(), fh, separators=(',', ':'))
            fh.write('\n')
        print('wrote', sys.argv[2])
        sys.exit(0)
    f = emblem_faces(1.0)
    print(len(f), 'polygons;', sum(len(p) - 2 for _, p, _ in f), 'triangles at radius 1, 24 segments')
    if len(sys.argv) > 1:
        paint_emblem(256, (44, 74, 110), (230, 223, 204), (230, 223, 204)).save(sys.argv[1])
        print('wrote', sys.argv[1])
