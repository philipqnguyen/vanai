# Replicates Stats.sheet / Stats.monster_sheet / Combat swings to read the difficulty curve:
# solo PLD (tank) and DRK (DD) in vendor gear vs an even-level monster (hp_mult 1, dmg_mult 1, delay 2.6).
import math, json
from pathlib import Path
JOBS = json.load(open(Path(__file__).resolve().parents[2] / 'shared' / 'data' / 'jobs.json'))
RACE = JOBS['races']['aedri']
# vendor gear per level: (weapon dmg, weapon delay, armour def)
GEAR = [(1,6,3.0,5),(6,11,3.0,5),(8,11,3.0,32),(9,14,3.0,32),(12,17,3.0,32),(15,17,3.0,46),(18,24,3.0,46),(19,24,3.0,53),(20,28,3.0,53),
        (26,33,3.0,53),(27,33,3.0,78),(34,42,3.0,78),(35,42,3.0,100),(42,51,3.0,100),(43,51,3.0,121),(48,67,3.0,139)]
def gear(l):
    g = GEAR[0]
    for row in GEAR:
        if row[0] <= l: g = row
    return g
def sheet(job, l, band=None):
    jd = JOBS[job]; base = {}
    for s in ['str','vit','int','mnd','agi']:
        base[s] = round((jd['base'][s] + jd['growth'][s]*(l-1)) * RACE['mods'][s])
    _, wd, delay, gdef = gear(l)
    if job == 'DRK': wd = round(wd * 1.45)  # greatswords hit harder (worn 9 vs 6 ...)
    return dict(base, **{'def': round(base['vit']*0.9)+gdef, 'weapon_dmg': wd, 'delay': delay,
                'max_hp': round((30 + jd['hp_per_level']*l) * RACE['hp_mod']) + base['vit']})
def monster(l, hp_mult=1.0, dmg_mult=1.0, delay=2.6, band=None):
    hp = (22 + l*15) * hp_mult; dmg = (4 + l*2.3) * dmg_mult
    if band:  # the level band (Stats.band below)
        f = band(l); hp *= f[0]; dmg *= f[1]
    return {'hp': hp, 'dmg': dmg, 'def': 3 + l*2.2, 'agi': 4 + l*1.6, 'delay': delay}
def fight(job, l, band=None, mob=None):
    p = sheet(job, l); m = mob or monster(l, band=band)
    hitc = min(0.99, max(0.55, 0.90 + (p['agi'] - m['agi'])*0.004))
    pdmg = max(1, p['weapon_dmg'] + p['str']*0.7 - m['def']*0.22) * hitc * 1.05  # crits ~5%
    dps = pdmg / p['delay']
    ttk = m['hp'] / dps
    mhit = min(0.99, max(0.55, 0.90 + (m['agi'] - p['agi'])*0.004))
    mdmg = max(1, m['dmg']*1.15 - p['def']*0.35) * mhit
    taken = mdmg / m['delay'] * ttk
    return ttk, taken / p['max_hp'], p['max_hp'], m['hp']
def show(band=None, title=''):
    print(title)
    for l in [1,3,5,8,10,12,15,18,20,25,30,35,40,45,50]:
        t1, f1, hp, mhp = fight('PLD', l, band); t2, f2, _, _ = fight('DRK', l, band)
        print(f"  L{l:2}: PLD ttk {t1:5.1f}s loses {f1*100:5.0f}% of {hp:4} hp | DRK ttk {t2:5.1f}s loses {f2*100:5.0f}% | mob hp {mhp:6.0f}")
show(None, 'CURRENT (no band factor)')
# Stats.band (server/lib/vanai/data.rb), the band in play: 1-10 a shade under
# (hp x0.9, dmg x0.85); 11-20 ramps to hp x1.8 and dmg x1.35; holds after.
# Keep the two the same: this tool is how the band's numbers were measured.
def band(l):
    if l <= 10: return (0.9, 0.85)
    t = min(1.0, (l - 10) / 10.0)
    return (0.9 + 0.9*t, 0.85 + 0.5*t)
show(band, 'Stats.band (in play)')
# party of 3 at L20 and L35 vs banded mob: PLD tank, DRK dd, WHM heals ~ (power + mnd*0.75) every 3.5s
for l in [12, 20, 35, 50]:
    m = monster(l, band=band)
    p = sheet('PLD', l); d = sheet('DRK', l); w = sheet('WHM', l)
    def dps(s):
        hitc = min(0.99, max(0.55, 0.90 + (s['agi'] - m['agi'])*0.004))
        return max(1, s['weapon_dmg'] + s['str']*0.7 - m['def']*0.22) * hitc * 1.05 / s['delay']
    ttk = m['hp'] / (dps(p) + dps(d) + dps(w)*0.6)
    mhit = min(0.99, max(0.55, 0.90 + (m['agi'] - p['agi'])*0.004))
    incoming = max(1, m['dmg']*1.15 - p['def']*0.35) * mhit / m['delay']
    cure = (20 + 4*l + w['mnd']*0.75) / 3.5  # a cure every ~3.5 s (cast + gcd), power grows with level
    print(f"PARTY L{l}: ttk {ttk:4.1f}s, tank takes {incoming:4.1f}/s vs healer {cure:4.1f}/s heal; tank hp {p['max_hp']}, fight damage {incoming*ttk:5.0f}")
