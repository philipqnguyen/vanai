"""Write client/src/zones/caerdun_kit.ts from tools/data/caerdun_contract.json (the
plan's copy of the kit: every value comes from the contract, nothing is typed by
hand). Run from the repo root: python3 tools/data/caerdun_make_kit.py. Re-run after
caerdun_contract_gen.py changes a number."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
C = json.load(open(os.path.join(HERE, 'caerdun_contract.json')))
OUT = os.path.join(ROOT, 'client', 'src', 'zones', 'caerdun_kit.ts')

j = lambda v: json.dumps(v, separators=(', ', ': '))
K = C['kit']
cat = C['catalogue']
files = {}
for name in sorted(cat):
    e = cat[name]
    rec = {'set': e['set'], 'mask': e['mask'], 'lod0': e['lod0'], 'casts': e['casts'], 'glow': e['glow'], 'materials': e['materials'],
           'size': e['size']}
    if e['mask'] == 'lods':
        rec['lods'] = [name, e['lod1']['file'], e['lod2']]
    if e.get('shell'):
        rec['shell'] = True
    files[name] = rec
    if e.get('lod1') and not e['lod1'].get('borrowed'):
        l1 = e['lod1']['file']
        files[l1] = {'set': e['set'], 'mask': 'lod1', 'lod0': e['lod1']['ceil'], 'casts': e['casts'], 'glow': e['glow'],
                     'materials': e['materials'], 'size': e['size']}
assert sorted(files) == sorted(C['files']), (sorted(set(files) ^ set(C['files'])))

mats = {}
for k, v in C['materials'].items():
    mats[k] = {kk: vv for kk, vv in v.items() if kk != 'sheet'}

lines = []
w = lines.append
w('// Caerdun\'s kit on paper: the Sea Gate module library\'s datums, materials,')
w('// facade sheet, LOD and cell rules, shadow and glow lists and the catalogue,')
w('// as the zone glue will hand them to city-architecture.ts createCity (the')
w('// Capital\'s CL_MATERIALS / CL_FACADE pattern). No Babylon here, so the node')
w('// test (test/caerdun_fortress_layout.test.mjs) reads exactly what is built.')
w('//')
w('// EVERY VALUE IS COPIED FROM THE BUILD CONTRACT (tools/data/caerdun_contract.json,')
w('// written by tools/data/caerdun_contract_gen.py; CAERDUN-CONTRACT.md section 1).')
w('// Nothing is typed by hand: tools/data/caerdun_make_kit.py regenerates')
w('// this file, and the plan and module tests each hold their own copy of the')
w('// numbers the other side builds against (CAERDUN-CONTRACT.md section 7, "Seams").')
w('//')
w('// The library is the GENERATOR track\'s (tools/assets/build_caerdun_modules.py,')
w('// public/models/seagate/). CF-10: its own set, prefix sg_, so models/caerdun/*')
w('// and the old kit stay for the eight other zones that use them.')
w('')
w('/** The datums every module and the plan share (CAERDUN-CONTRACT.md section 2). World')
w(' *  heights unless a name ends in Rel (above the city floor F). */')
w(f'export const SG = {j(C["datums"])} as const;')
w('')
w('/** The walkable shells\' local datums (CAERDUN-CONTRACT.md 3.5): the generator builds')
w(' *  treads, rooms and doors on these lines and the plan lays its decks, flights,')
w(' *  camera rooms and colliders on the same ones. Module-local coordinates. */')
w(f'export const SG_SHELL = {j(C["shellDatums"])} as const;')
w('/** What the generator built where it departed from SG_SHELL (contract.json')
w(' *  asBuilt; the manifest\'s `departures`): it SUPERSEDES SG_SHELL key by key --')
w(' *  the wider tower walk doors (CF-7), the 1.3 m caphouse door, the clock\'s')
w(' *  alternating flights, the Crown Gate\'s stairwells. SG_SHELL stays the first')
w(' *  version because the manifest\'s datums.shellDatums is held equal to it. */')
w(f'export const SG_AS_BUILT = {j(C["asBuilt"])} as const;')
w('')
w('/** The eight materials of the whole library (CAERDUN-CONTRACT.md 3.1). Water is not one:')
w(' *  the harbour is the zone\'s one makeOcean (WATER.md) and the ditch is dry. */')
w(f'export const SG_MATERIALS: Record<string, {{ facade?: string; albedo?: string; color?: string; roughness: number; metallic: number; emissive?: string; emissiveNight?: string; emissiveTexture?: string; casts?: boolean; additive?: boolean; unlit?: boolean; glow?: number }}> = {j(mats)};')
w('')
w('/** The facade sheet (CAERDUN-CONTRACT.md 3.2): stone, far, joinery and glass merged at')
w(' *  load into one material; uv is [su, ou, sv, ov], u\' = u su + ou, v\' = v sv + ov')
w(' *  in glTF UVs (v down), the CL_FACADE order. */')
F = C['facade']
w(f'export const SG_FACADE = {j({"name": F["name"], "file": F["file"], "size": F["size"], "rough": F["rough"], "roughSize": F["roughSize"], "glow": F["glow"], "glowSize": F["glowSize"], "uv": F["uv"], "parts": F["parts"]})} as const;')
w('')
w('/** manifest lodDistances: metres from the camera to a culling cell\'s box (3D). */')
w(f'export const SG_LOD = {j(K["lod"])} as const;')
w('/** A culling cell is at most this on a side (one wall run, gate, row or building). */')
w(f'export const SG_CELL = {K["cell"]};')
w('/** The skyline grid: roofs, turrets and cones never switch and batch on it.')
w(' *  Centred on Crown Street (z -18) and off x = 0, so no sky line runs down the')
w(' *  city\'s axis (the Capital\'s x = 0 trap, CITY-BUILD.md). */')
w(f'export const SG_GRID = {j(K["skyGrid"])} as const;')
w('/** Cell box defaults: height and reach (walls pieces pass wallReach, gates gateReach). */')
w(f'export const SG_REACH = {j({"cellHeight": K["cellHeight"], "reach": K["reach"], "wall": K["wallReach"], "gate": K["gateReach"]})} as const;')
w('')
w('/** The kit\'s identity for createCity (CAERDUN-CONTRACT.md section 5). */')
w(f'export const SG_KIT_ID = {j({"id": K["id"], "prefix": K["prefix"], "dir": K["dir"], "metaKey": K["metaKey"], "states": K["states"]})} as const;')
w(f'export const SG_NIGHT = {j(K["night"])} as const;')
w(f'export const SG_LIGHT = {j(K["light"])} as const;')
w('')
w('// The shadow and glow rules, DERIVED in the contract from the catalogue\'s')
w('// "casts" and "glow pass" columns, so the lists and the catalogue never disagree.')
w('/** Pool files that never cast (the cards, interiors, parados, dressing, ditch, dormers). */')
w(f'export const SG_SHADOWLESS = /{K["shadowless"]}/;')
w('/** Always in the glow pass: cressets, arch glows, the beam, the lighthouse and the Crown Gate. */')
w(f'export const SG_GLOW_ALWAYS = /{K["glowAlways"]}/;')
w('/** In the glow pass at night only: the lit house bays, wall-house windows, Sea Gate, street arch, halls. */')
w(f'export const SG_GLOW_NIGHT_ONLY = /{K["glowNightOnly"]}/;')
w('/** Material names (with the city suffix) that never cast. */')
w(f'export const SG_SHADOW_SKIP = {j(K["shadowSkip"])};')
w('')
w('/** The paving sheets (makePath ribbons), a 4 m tile each. */')
w(f'export const SG_PAVE = {j(K["pave"])} as const;')
w('')
w('export type SgSet = "walls" | "harbour" | "town" | "civic";')
w('/** How a file is shown: lods (three files by cell distance), all (one file at every')
w(' *  distance), near (hidden past 140 m), in (near only, past 45 m hidden), sky (never')
w(' *  switches, on the sky grid), lod2 (only as a card), lod1 (only as a LOD1). */')
w('export type SgShown = "lods" | "all" | "near" | "in" | "sky" | "lod2" | "lod1";')
w('export interface SgFile { set: SgSet; mask: SgShown; lod0: number; casts: boolean; glow: "out" | "night" | "always"; materials: string[]; size: number[]; lods?: [string, string, string]; shell?: boolean }')
w('/** The catalogue (CAERDUN-CONTRACT.md 3.4): every file, its set, how it is shown and its')
w(' *  triangle CEILING (lod0: the LOD0 ceiling of a base file, or the LOD1 ceiling of')
w(' *  an _l1 file). A file belongs to exactly one set: the template key is')
w(' *  `${prefix}:${tag}:${file}`, so a file placed by two sets would be two templates. */')
w('export const SG_FILES: Record<string, SgFile> = {')
for name in sorted(files):
    w(f'  {name}: {j(files[name])},')
w('};')
w('')
w('/** The budgets the plan test holds (CAERDUN-CONTRACT.md section 6). */')
w(f'export const SG_BUDGETS = {j(C["budgets"])} as const;')
w('')
open(OUT, 'w').write('\n'.join(lines))
print('wrote', OUT, len(files), 'files')
