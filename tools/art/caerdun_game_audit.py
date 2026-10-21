"""Verify exported runtime assets independently of Blender's scene state."""
import json,sys,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/assets'))
from measure_gltf import measure
folder=ROOT/'client/public/models/caerdun';manifest=json.loads((folder/'manifest.json').read_text());out=[]
for name,expected in manifest['modules'].items():
 path=folder/(name+'.glb');got=measure(str(path));assert got,name
 for field in ['min','max']:
  assert all(abs(a-b)<.002 for a,b in zip(got[field],expected[field])),(name,field,got[field],expected[field])
 blob=path.read_bytes();assert struct.unpack_from('<I',blob,8)[0]==len(blob),name
 n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n])
 for im in doc.get('images',[]):assert (folder/im['uri']).is_file(),(name,im)
 for node in doc['nodes']:
  assert node.get('translation',[0,0,0])==[0,0,0],(name,node)
  assert node.get('scale',[1,1,1])==[1,1,1],(name,node)
 assert not doc.get('animations'),name
 out.append(got)
assert measure(str(folder/'floor.glb'))['max'][1]==0
assert measure(str(folder/'floor.glb'))['min'][1]==-.18
assert measure(str(folder/'bed.glb'))['size'][::2]==[1.6,2.15]
report={'modules':len(out),'boundsAndPivots':'pass','externalImages':'pass','runtimeBytes':sum(p.stat().st_size for p in folder.iterdir() if p.is_file()),'exports':out}
(ROOT/'design/caerdun-harbor-v2/game-kit/export-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"{len(out)} exported modules: bounds, pivots, image dependencies and human-scale furniture pass")
