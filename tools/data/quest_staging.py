"""Refresh reference evidence without promoting narrative/world review status.
Run after tools/qa/quest_staging.mjs. The ledger retains human staging findings.
"""
import json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
def read(name):return json.loads((ROOT/'shared/data'/name).read_text())
zones=read('zones.json');quests=read('quests.json');monsters=read('monsters.json');recipes=read('recipes.json')
ledger_path=ROOT/'design/quest-staging/audit.json';ledger=json.loads(ledger_path.read_text())
evidence={}
for key in zones:
 p=ROOT/'.playwright-mcp/quest-staging'/f'{key}.json'
 if p.exists():evidence[key]=json.loads(p.read_text())
node_items={'herb':'lamproot','ore':'glimmer_ore','reed':'mere_reed','windfall':'windfall_apple','spines':'book_spine'}
def anchor(zone,kind,point):
 result={'zone':zone,'kind':kind,**point}
 matches=[p for p in evidence.get(zone,{}).get('anchors',[]) if p['kind']==kind and p['id']==point.get('id',point.get('monster')) and p['x']==point['x'] and p['z']==point['z']]
 if matches:result['render_access']={k:matches[0].get(k) for k in ['y','accessible','nearestAccess','sampledClear','hit','nearbyHouses']}
 else:result['render_access']='pending fresh renderer evidence'
 return result
missing=[]
for key,q in quests.items():
 row=ledger['quests'][key];obj=q['objective'];row['data_evidence']={'giver':[],'targets':{}}
 for zone,d in zones.items():
  row['data_evidence']['giver'] += [anchor(zone,'npcs',p) for p in d.get('npcs',[]) if p['id']==q['giver']]
 row['data_evidence']['readables']=[anchor(zone,'interactables',p) for zone,d in zones.items() for p in d.get('interactables',[]) if p['id'] in q.get('readables',[])]
 for target in obj['targets']:
  sources=[]
  for zone,d in zones.items():
   if obj['type']=='collect':
    sources += [anchor(zone,'nodes',p) for p in d.get('nodes',[]) if node_items.get(p['kind'])==target]
    sources += [anchor(zone,'camps',p) for p in d.get('camps',[]) if any(drop['item']==target for drop in monsters[p['monster']].get('drops',[]))]
    sources += [anchor(zone,'npcs',p) for p in d.get('npcs',[]) if target in p.get('stock',[])]
   else:
    kind={'kill':'camps','talk':'npcs','interact':'interactables','reach':'landmarks'}[obj['type']]
    sources += [anchor(zone,kind,p) for p in d.get(kind,[]) if p.get('id',p.get('monster'))==target]
    if obj['type']=='interact':sources += [anchor(zone,'milestones',p) for p in d.get('milestones',[]) if p['id']==target]
  if obj['type']=='collect':
   sources += [{'kind':'recipe','skill':skill,**r} for skill,d in recipes.items() for r in d['recipes'] if r['output']==target]
  row['data_evidence']['targets'][target]=sources
  if not sources:missing.append([key,target])
ledger['coordinate_convention']='North is +z: client/src/hud.ts compass and client/src/map.ts projection. Coordinates alone do not establish a named region.'
ledger.setdefault('evidence_limits','Render evidence checks nearby access at sampled points, not a full route or narrative location. Refresh after content changes and review changed staging separately.')
ledger_path.write_text(json.dumps(ledger,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'quests':len(quests),'narratives_reviewed':sum(r['narrative_reviewed'] for r in ledger['quests'].values()),'missing_target_sources':missing},indent=2))
