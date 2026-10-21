# Quaternius glTF pack importer.
#
# The Source-tier packs ship engine-ready glTF next to their raw textures, so
# there is no geometry conversion to do.
# What there IS to do is texture budget: the packs ship 2048x2048 RGBA PNGs --
# 58 MB for the Nature MegaKit alone -- for art that is flat stylized colour
# with no high-frequency detail. Shipping that to a browser is indefensible,
# and it is the whole reason this file exists rather than a cp -r.
#
#   * opaque maps  -> JPEG (no alpha to preserve, and JPEG is what the rest of
#                     public/tex already uses)
#   * alpha maps   -> PNG, quantised; leaf and flower cutouts need the alpha
#                     channel for the alphaTest path in scene.ts
#
# Both are capped at MAX_PX. Image URIs in the .gltf are rewritten to match;
# .bin files are copied untouched.
#
# Usage:  python3 tools/assets/import_quaternius.py <src glTF dir> <dest dir>

import json, os, shutil, sys
from PIL import Image

MAX_PX = 512      # flat stylized colour; 2048 buys nothing at gameplay distance
JPEG_Q = 88

def alpha_used(im):
    if im.mode != "RGBA":
        return False
    lo, _ = im.getchannel("A").resize((64, 64)).getextrema()
    return lo < 250

def convert_texture(src, dest_dir):
    im = Image.open(src)
    if max(im.size) > MAX_PX:
        scale = MAX_PX / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    stem = os.path.splitext(os.path.basename(src))[0]
    if alpha_used(im):
        out = os.path.join(dest_dir, stem + ".png")
        im.save(out, "PNG", optimize=True)
    else:
        out = os.path.join(dest_dir, stem + ".jpg")
        im.convert("RGB").save(out, "JPEG", quality=JPEG_Q, optimize=True)
    return os.path.basename(out)

def main(src_dir, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    remap, before, after = {}, 0, 0
    for f in sorted(os.listdir(src_dir)):
        if f.lower().endswith(".png") or f.lower().endswith(".jpg"):
            s = os.path.join(src_dir, f)
            before += os.path.getsize(s)
            new = convert_texture(s, dest_dir)
            after += os.path.getsize(os.path.join(dest_dir, new))
            remap[f] = new
    models = 0
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith(".gltf"):
            continue
        d = json.load(open(os.path.join(src_dir, f)))
        for img in d.get("images", []):
            uri = img.get("uri")
            if uri in remap:
                img["uri"] = remap[uri]
            elif uri:
                # A glTF image URI is the exporter's datablock name and need not
                # be the texture's filename. The Village MegaKit's vines ask for
                # "T_VineLeaf_png.png" while the pack ships "T_VineLeaf.png", so
                # the remap above missed it and the URI was written out pointing
                # at nothing -- which does not fail loudly: Babylon substitutes
                # its magenta checkerboard, and nine vine models rendered as
                # checks on a wall until someone looked closely.
                stem = os.path.splitext(uri)[0]
                for cand in (stem.rsplit("_", 1)[0], stem):
                    for ext in (".png", ".jpg"):
                        if cand + ext in remap.values():
                            img["uri"] = cand + ext
                            break
                    else:
                        continue
                    break
                else:
                    print(f"  WARNING: {f} references {uri}, which no texture matched")
        for buf in d.get("buffers", []):
            uri = buf.get("uri")
            if uri and not uri.startswith("data:"):
                shutil.copyfile(os.path.join(src_dir, uri), os.path.join(dest_dir, uri))
        json.dump(d, open(os.path.join(dest_dir, f), "w"), separators=(",", ":"))
        models += 1
    print(f"{models} models, {len(remap)} textures")
    print(f"textures {before/1e6:.1f} MB -> {after/1e6:.1f} MB "
          f"({100 - after*100//max(1,before)}% smaller)")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
