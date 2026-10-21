// Heartwood's auction house into shared/data/zones.json (CITY-BUILD.md
// "Heartwood's auction house"): the plan (client/src/heartwood-auction-plan.ts)
// stands the brokers and the map's services entry, so the server's reach test,
// the client's NPCs and the map's icon all read the hall the city grows.
//
//   node tools/data/heartwood_auction_data.mjs           # report what would change
//   node tools/data/heartwood_auction_data.mjs --write   # rewrite zones.json
//
// THE PLAN IS THE SOURCE: each broker's x, z and facing (h) behind their
// counter, in BROKERS order, and the services entry at the hall's centre listing
// all four. broker_fennick keeps its id, name and lines (moved from the old
// house's door into the hall); the other three are added with theirs (NEW
// below) when missing, and only their place is rewritten after that. ONLY
// HEARTWOOD'S npcs AND services are touched, by Python's json (indent 2,
// ensure_ascii off: the file's own format), on the file as it is when written,
// so another worker's edit to any other zone is kept.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { HALL, hallBrokers } from '../../client/src/heartwood-auction-plan.ts';

const ZPATH = new URL('../../shared/data/zones.json', import.meta.url).pathname;
const NEW = {
  broker_rook: { name: 'Broker Rook', dialog: [
    'Four counters and one board. List it with me and Fennick can sell it, or Hazel, or Sedge; it is the same ledger.',
    'Every sale is written twice here: once for the buyer, once for the groves. Heartwood keeps receipts. It has kept them for three hundred years.'] },
  broker_hazel: { name: 'Broker Hazel', dialog: [
    'Imperial silver fetches what it weighs. Grove-relics fetch what they cost us, and the court sees to it that they do.',
    'The balance in the hoop over the dome is the same sign as the one over Caerdun\'s house and Moonmere\'s. Coin keeps one language, whatever the courts speak.'] },
  broker_sedge: { name: 'Broker Sedge', dialog: [
    'The board is copied fresh at every chant. If your price is pinned there, somebody on this floor has already argued about it.',
    'The court takes its small cut on every sale and plants it back in the groves. The planting rolls are open to anyone who asks the Ring.'] },
};
const brokers = hallBrokers();
const services = { kind: 'auction', name: HALL.name, x: HALL.x, z: HALL.z, npcs: brokers.map((b) => b.id) };
const zones = JSON.parse(fs.readFileSync(ZPATH, 'utf8')), hw = zones.heartwood, changes = [];
for (const b of brokers) {
  const n = hw.npcs.find((q) => q.id === b.id);
  if (!n) { if (!NEW[b.id]) throw new Error(`${b.id}: not in zones.json and no lines for it`); changes.push(`+ ${b.id} (${b.x}, ${b.z}) h ${b.h}`); continue; }
  if (n.x !== b.x || n.z !== b.z || n.h !== b.h) changes.push(`${b.id}: (${n.x}, ${n.z}) h ${n.h} -> (${b.x}, ${b.z}) h ${b.h}`);
}
const old = (hw.services ?? []).find((s) => s.kind === 'auction');
if (JSON.stringify(old) !== JSON.stringify(services)) changes.push(`services auction: ${JSON.stringify(old)} -> ${JSON.stringify(services)}`);
console.log(changes.length ? changes.join('\n') : 'zones.json already matches the plan');
const PY = `
import json, sys
path, brokers, svc, new = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3]), json.loads(sys.argv[4])
z = json.load(open(path))
hw = z['heartwood']
for b in brokers:
    n = next((q for q in hw['npcs'] if q['id'] == b['id']), None)
    if n is None:
        # a new broker goes after the last broker, beside the house's others
        last = max(i for i, q in enumerate(hw['npcs']) if q.get('kind') == 'auction')
        n = {'id': b['id'], 'name': new[b['id']]['name'], 'kind': 'auction', 'x': b['x'], 'z': b['z'], 'h': b['h'], 'title': 'The Auction House', 'dialog': new[b['id']]['dialog']}
        hw['npcs'].insert(last + 1, n)
    n['x'], n['z'], n['h'] = b['x'], b['z'], b['h']
s = hw.setdefault('services', [])
i = next((k for k, q in enumerate(s) if q['kind'] == 'auction'), None)
if i is None: s.insert(0, svc)
else: s[i] = svc
open(path, 'w').write(json.dumps(z, indent=2, ensure_ascii=False) + '\\n')
`;
if (process.argv.includes('--write') && changes.length) {
  execFileSync('python3', ['-c', PY, ZPATH, JSON.stringify(brokers), JSON.stringify(services), JSON.stringify(NEW)]);
  console.log(`written: ${ZPATH}`);
}
