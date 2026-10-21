# Fetch CC0 ground sheets from Poly Haven into client/public/tex.
#
# The repo already carries a handful of these (leafy_grass, forest_leaves_03,
# brown_mud_leaves_01, ...); this is how the rest arrive, so the next biome does
# not have to rediscover the API shape. Naming matches what TERRAIN_TEX expects:
#
#   <name>_diff.jpg   albedo
#   <name>_nor.jpg    OpenGL-convention tangent normal
#
# (tex/build/ uses the _nor_gl suffix instead -- texMat vs buildTerrain. Do not
# mix them up; a missing sheet fails silently to a flat mesh in Babylon.)
#
# Usage:  python3 tools/assets/fetch_polyhaven_tex.py red_sand dry_ground_01 ...

import io, json, os, sys, urllib.request

RES = "1k"           # matches the sheets already vendored
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "client", "public", "tex")
UA = {"User-Agent": "vanai-asset-import"}

def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)   # the API 403s a bare urllib UA
    data = urllib.request.urlopen(req, timeout=120).read()
    return data if binary else json.loads(data)

def pick(files, kind):
    """Poly Haven keys maps by type; the normal map is 'nor_gl' (OpenGL green)."""
    node = files.get(kind)
    if not node:
        return None
    entry = node.get(RES) or next(iter(node.values()))
    # prefer jpg, fall back to whatever the resolution offers
    return (entry.get("jpg") or entry.get("png") or next(iter(entry.values())))["url"]

def fetch(name):
    from PIL import Image
    files = get(f"https://api.polyhaven.com/files/{name}")
    got = []
    for kind, suffix in (("Diffuse", "diff"), ("nor_gl", "nor")):
        url = pick(files, kind)
        if not url:
            print(f"  ! {name}: no {kind}")
            continue
        im = Image.open(io.BytesIO(get(url, binary=True))).convert("RGB")
        dest = os.path.join(OUT, f"{name}_{suffix}.jpg")
        im.save(dest, "JPEG", quality=90, optimize=True)
        got.append(f"{suffix} {im.size[0]}px {os.path.getsize(dest)//1024}KB")
    # average albedo, because every tint in TERRAIN_TEX MULTIPLIES this and so
    # can only darken it -- solving a tint without knowing the base is the
    # mistake CC0-ASSETS.md records twice.
    d = os.path.join(OUT, f"{name}_diff.jpg")
    if os.path.exists(d):
        im = Image.open(d).resize((64, 64))
        px = list(im.getdata())
        avg = tuple(sum(p[i] for p in px) // len(px) for i in range(3))
        got.append("avg #%02x%02x%02x" % avg)
    print(f"  {name}: {', '.join(got)}")

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n in sys.argv[1:]:
        fetch(n)
