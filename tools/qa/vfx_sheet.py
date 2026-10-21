"""Tile vfx_shots.mjs frames into one contact sheet per ability (or all given).

    python3 tools/qa/vfx_sheet.py tmp/spell-fx/shots stone [fire ...] --out tmp/spell-fx/sheet.jpg
"""
import sys, glob, os
from PIL import Image, ImageDraw
args = sys.argv[1:]
out = "tmp/spell-fx/sheet.jpg"
if "--out" in args:
    i = args.index("--out"); out = args[i + 1]; del args[i:i + 2]
crop = None
if "--crop" in args:
    i = args.index("--crop"); crop = tuple(int(v) for v in args[i + 1].split(",")); del args[i:i + 2]
pick = None
if "--pick" in args:
    i = args.index("--pick"); pick = [int(v) for v in args[i + 1].split(",")]; del args[i:i + 2]
folder, keys = args[0], args[1:]
files = []
if not keys:
    files = sorted(glob.glob(os.path.join(folder, "*.jpg")))
for k in keys:
    mine = sorted(f for f in glob.glob(os.path.join(folder, f"{k}_*.jpg")) if os.path.basename(f).rsplit("_", 1)[0] == k)
    # --pick 1,3,4: those frames of each ability, one row an ability
    files += [mine[p] for p in pick if p < len(mine)] if pick else mine
ims = [Image.open(f) for f in files]
if crop: ims = [im.crop(crop) for im in ims]
w, h = ims[0].size
scale = (0.5 if not pick else 0.4) if not crop else 1
tw, th = int(w * scale), int(h * scale)
cols = len(pick) if pick else (3 if len(ims) > 4 else 2)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "black")
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im.resize((tw, th)), (x, y))
    d.text((x + 6, y + 4), os.path.basename(f)[:-4], fill="white")
sheet.save(out, quality=88)
print(out, len(ims))
