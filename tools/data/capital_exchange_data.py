"""Write the Capital's Exchange into shared/data/zones.json from its plan.

    python3 tools/data/capital_exchange_data.py          # report what would change
    python3 tools/data/capital_exchange_data.py --write  # and write it

The plan is client/src/capital-layout.json (`exchange`, `buildings` exchange, the
returned city's broker spots); zones/capital_exchange.ts plans the building from
it and client/test/capital_layout.test.mjs holds zones.json to the plan, spot for
spot. This writes only the returned Capital's (`capitalreturned`) part:

  * the four brokers (kind auction), at their counters' spots, standing on the
    Exchange's floor (y: the city floor + the podium) in the site `exchange`,
    floor 0, facing the court and the square (h, the avatar's yaw: -x is -pi/2).
    broker_imperial keeps its id and words; the three new brokers are written
    with theirs;
  * the site `exchange`: the plan building's box (cx, cz, yaw, span, len, seed)
    with the plan's one floor and entrance (SiteLevels: a broker answers from
    anywhere on that floor and from nowhere off it);
  * the map's services entry for the auction house at the building's middle,
    listing the four brokers (map_services.ts draws one badge for them).

zones.json is re-read and only these keys of `capitalreturned` are replaced, so
another agent's edits to other zones survive. Rails must restart to see it.
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ZONES = ROOT / 'shared/data/zones.json'
PLAN = json.loads((ROOT / 'client/src/capital-layout.json').read_text())
KEY = 'capitalreturned'
FLOOR = PLAN['terrain']['floor']
EX = PLAN['exchange']
B = next(b for b in PLAN['buildings'] if b['id'] == 'exchange')
SPOTS = PLAN['spots'][KEY]['npcs']
BROKERS = [k for k, v in PLAN['inside'].items() if v == 'exchange']

# the three new brokers' words (broker_imperial keeps its own)
NEW = {
    'broker_vane': {
        'name': 'Factor Ambrose Vane',
        'dialog': ["Lots are called at the bell and struck at the counter. The bell has not rung in three hundred years, so this morning we are using a spoon and a cup.",
                   "Your goods, your price, my ledger. The Exchange takes three in the hundred, as it always did. The free cities call that a tax. We call it the custom of the house."],
    },
    'broker_odile': {
        'name': 'Factor Odile Marchbank',
        'dialog': ["Every ledger on this counter balanced the night the city stopped. I have checked them twice this morning. Everything balanced but the world.",
                   "Four counters, one ledger. List it with me or with any of us; it goes up on the same board under the same balance, and the same buyer finds it."],
    },
    'broker_reeve': {
        'name': 'Factor Tamsin Reeve',
        'dialog': ["Stand where you can see the board. The lots go up as they come in, and this morning they come in from three cities that were villages when I last opened this ledger.",
                   "The balance on the tower is the sign over the houses in Caerdun, Heartwood and Moonmere as well, I am told. Good. Coin should keep one language, whatever the courts speak."],
    },
}


def broker_rec(old, bid):
    x, z = SPOTS[bid]
    rec = dict(old) if old else {'id': bid, 'name': NEW[bid]['name'], 'kind': 'auction', 'dialog': NEW[bid]['dialog']}
    rec.update({'title': 'The Exchange', 'x': x, 'z': z, 'y': round(FLOOR + EX['podium'], 3), 'site': 'exchange', 'floor': 0,
                'h': round(-math.pi / 2, 4)})
    return rec


def main():
    write = '--write' in sys.argv
    zones = json.loads(ZONES.read_text())
    zone = zones[KEY]
    changes = []
    # the brokers, where the old one stood in the list, the new ones after it
    npcs = zone['npcs']
    have = {n['id']: i for i, n in enumerate(npcs)}
    anchor = have.get('broker_imperial')
    new_list, placed = [], set()
    for n in npcs:
        if n['id'] in BROKERS:
            if n['id'] == 'broker_imperial' or anchor is None:
                for bid in BROKERS:
                    if bid in placed: continue
                    old = next((m for m in npcs if m['id'] == bid), None)
                    rec = broker_rec(old, bid)
                    if rec != old: changes.append(f'npc {bid}: {"moved" if old else "added"} to ({rec["x"]}, {rec["z"]}, y {rec["y"]})')
                    new_list.append(rec); placed.add(bid)
            continue
        new_list.append(n)
    for bid in BROKERS:
        if bid not in placed:
            new_list.append(broker_rec(None, bid)); changes.append(f'npc {bid}: added')
    zone['npcs'] = new_list
    # the site: the plan's building box with the plan's floor
    site = {'cx': B['cx'], 'cz': B['cz'], 'yaw': B['yaw'], 'span': B['span'], 'len': B['len'], 'name': 'The Exchange',
            'house_seed': B['seed'], **EX['site']}
    if zone.setdefault('sites', {}).get('exchange') != site:
        changes.append('site exchange')
        zone['sites']['exchange'] = site
    # the map's badge at the building's middle (the podium's centre: front face less half its depth)
    fx, fz = EX['front']
    th = {'e': math.pi / 2, 'w': -math.pi / 2, 'n': 0.0, 's': math.pi}[EX['faces']]
    cx, cz = round(fx + (-EX['depth'] / 2) * round(math.sin(th)), 3), round(fz + (-EX['depth'] / 2) * round(math.cos(th)), 3)
    entry = {'kind': 'auction', 'name': 'The Auction House', 'x': cx, 'z': cz, 'npcs': BROKERS}
    services = [s for s in zone.get('services', []) if s['kind'] != 'auction']
    old = next((s for s in zone.get('services', []) if s['kind'] == 'auction'), None)
    if old != entry:
        changes.append(f'services auction -> ({cx}, {cz}) {BROKERS}')
    zone['services'] = [entry] + services
    print('\n'.join(changes) or 'nothing to change')
    if write and changes:
        ZONES.write_text(json.dumps(zones, indent=2, ensure_ascii=False) + '\n')
        print('wrote', ZONES)


if __name__ == '__main__':
    main()
