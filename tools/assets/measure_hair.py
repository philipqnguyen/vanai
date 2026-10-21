# What colour is each production hair REALLY, and how much do its strands vary?
#
# The hair colours a player picks (appearance.ts HAIR_COLOURS) recolour the
# maker's approved hair in the shader (hair-colour.ts) rather than in new files,
# so the approved bytes stay exactly as they are. The shader keeps each hair's
# strand detail by reading the texture's own lightness against the hair's
# middle lightness and spread, and those two numbers are this script's: a dark
# hair and a pale one then take dark blue at the same strength, with the same
# streaks. It also measures each hair's own colour, which names it ("Black",
# "Chestnut", ...) and paints its swatch at creation.
#
# Each base-colour image is read from the runtime file the game loads (the
# maker's packed copy: KTX2, decoded with `basisu -unpack`), in the shader's own
# terms: linear Rec.709 luma of toLinearSpace(rgb) (pow 2.2), back through
# pow 1/2.2. Pixels darker than 1% are the atlas's unused background and are
# left out. Every entry carries the name of the runtime file it measured (the
# index's `h`): client/test/hair_colour.test.mjs fails when the maker revises or
# repacks a hair and this has not been run again.
#
# Usage:  python3 tools/assets/measure_hair.py      (writes client/src/hair-colours.json)

import glob, json, os, struct, subprocess, sys, tempfile

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'client', 'src', 'hair-colours.json')
# every hair file a race loader instantiates (aedri.ts, valdren.ts, karrog.ts, nym.ts, rasha.ts)
HAIRS = [
  'aedri-female/braid', 'aedri-male/waves', 'karrog-male/coif', 'karrog-male/beard',
  'nym-female/hair', 'nym-male/hair', 'rasha-female/hair', 'valdren-female/hair', 'valdren-male/hair',
]


def runtime_dir():
  path = os.environ.get('VANAI_RUNTIME')
  if not path and os.path.exists(os.path.join(ROOT, '.env')):
    for line in open(os.path.join(ROOT, '.env')):
      if line.startswith('VANAI_RUNTIME='): path = line.split('=', 1)[1].strip()
  if not path: sys.exit('VANAI_RUNTIME is not set (docs/ASSETS.md)')
  return path if os.path.isabs(path) else os.path.join(ROOT, path)


def find(d, key):
  if isinstance(d, dict):
    if key in d: return d[key]
    for v in d.values():
      r = find(v, key)
      if r: return r
  return None


def base_colour_image(glb):
  data = open(glb, 'rb').read()
  n = struct.unpack('<I', data[12:16])[0]
  doc = json.loads(data[20:20 + n])
  bin0 = 20 + n + 8
  (mat,) = doc['materials']
  tex = doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
  src = tex.get('extensions', {}).get('KHR_texture_basisu', {}).get('source', tex.get('source'))
  img = doc['images'][src]
  view = doc['bufferViews'][img['bufferView']]
  start = bin0 + view.get('byteOffset', 0)
  return img['mimeType'], data[start:start + view['byteLength']]


def decode(mime, raw, work):
  if mime != 'image/ktx2':
    path = os.path.join(work, 'img')
    open(path, 'wb').write(raw)
    return Image.open(path).convert('RGB')
  path = os.path.join(work, 'img.ktx2')
  open(path, 'wb').write(raw)
  subprocess.run(['basisu', '-unpack', path, '-output_path', work], check=True, capture_output=True)
  # basisu writes the top level once per transcode target; any RGB one will do
  png = sorted(glob.glob(os.path.join(work, '*_RGB_level_0_face_0_layer_0000.png')))[0]
  return Image.open(png).convert('RGB')


def main():
  index = json.load(open(os.path.join(ROOT, 'client', 'src', 'asset-index.json')))
  files = os.path.join(runtime_dir(), 'files')
  out = {}
  for hair in HAIRS:
    key = f'models/characters/{hair}.glb'
    entry = find(index, key)
    if not entry: sys.exit(f'{key} is not in the asset index')
    with tempfile.TemporaryDirectory() as work:
      rgb = np.asarray(decode(*base_colour_image(os.path.join(files, entry['h'])), work), dtype=np.float64) / 255
    px = rgb.reshape(-1, 3)
    lin = px ** 2.2
    luma = lin @ np.array([.2126, .7152, .0722])
    keep = luma > .01 ** 2.2
    light = luma[keep] ** (1 / 2.2)
    p10, mid, p90 = np.percentile(light, [10, 50, 90])
    mean = (lin[keep].mean(0)) ** (1 / 2.2)
    out[key] = {
      'file': entry['h'],
      'colour': '#' + ''.join(f'{round(c * 255):02x}' for c in mean),
      'mid': round(float(mid), 4),
      'spread': round(float((p90 - p10) / 2), 4),
    }
    print(f'{hair:22} {out[key]["colour"]}  mid {mid:.3f}  spread {(p90 - p10) / 2:.3f}')
  open(OUT, 'w').write(json.dumps(out, indent=1) + '\n')
  print('wrote', os.path.relpath(OUT, ROOT))


main()
