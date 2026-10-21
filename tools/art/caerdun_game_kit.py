"""Original Caerdun production kit, derived from the reviewed harbor study's rules.
Run Blender -b --python tools/art/caerdun_game_kit.py. No study files are modified.
CAERDUN_KIT_OUT and CAERDUN_KIT_LIBRARY redirect the GLBs/textures/manifest and the
.blend library (to build into a scratch folder and compare, file for file).
Coordinates below are game metres: Y up, +Z outward, origin at the floor datum.
"""
import bpy, bmesh, math, json, random, os
from pathlib import Path
from mathutils import Vector, noise
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('CAERDUN_KIT_OUT',ROOT/'client/public/models/caerdun'));OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
COL=None;catalog={}
def material(name,color,source=None,contrast=.15,rough=.8,metal=0):
 m=bpy.data.materials.new('CD_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if source:
  # Bake the study's restrained monochrome photographic grain into an ordinary
  # sRGB albedo. Export contains no unsupported Cycles box/noise/bump nodes.
  im=bpy.data.images.load(str(ROOT/'client/public'/source),check_existing=False);im.scale(512,512)
  px=list(im.pixels[:]);out=bpy.data.images.new(name+' baked albedo',width=512,height=512)
  for i in range(0,len(px),4):
   l=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2];q=1+contrast*(min(1,max(0,(l-.04)/.7))*2-1)
   px[i:i+4]=[min(1,c*q) for c in color]+[1]
  out.pixels[:]=px;out.filepath_raw=str(OUT/(name.lower()+'.png'));out.file_format='PNG';out.save();out.pack();bpy.data.images.remove(im)
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=out;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);p.inputs['Base Color'].default_value=(1,1,1,1)
 return m
stone=material('Granite',(.30,.335,.35),'tex/aerial_rocks_02_diff.jpg',.22)
plaster=material('Lime',(.59,.555,.455),'tex/build/grey_plaster_02_diff.jpg',.09,.92)
wood=material('Oak',(.135,.095,.061),'tex/build/dark_wooden_planks_diff.jpg',.3)
oak=material('FloorOak',(.40,.295,.18),'tex/build/wood_floor_worn_diff.jpg',.25)
slate=material('Slate',(.105,.155,.205),'tex/build/roof_slates_02_diff.jpg',.33,.78)
red=material('Oxblood',(.22,.055,.04),rough=.85);iron=material('Iron',(.027,.035,.035),rough=.45,metal=.5)
glass=material('WindowGlass',(.13,.20,.19),rough=.24,metal=.15);linen=material('Linen',(.61,.55,.41))
# (the rowan's leaf and the rocks' Bedrock materials went with the old Caerdun's scenery, 2026-10-09)

def start(name):
 global COL
 bpy.ops.object.select_all(action='DESELECT');COL=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(COL)
def mesh(name,vs,faces,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],faces);me.update();o=bpy.data.objects.new(name,me);COL.objects.link(o);me.materials.append(mat);return o
def box(name,x,y,z,w,h,d,mat=stone,bevel=.012):
 a,b,c=w/2,h/2,d/2
 o=mesh(name,[(x+xx*a,y+yy*b,z+zz*c) for xx,yy,zz in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat)
 if bevel:
  mod=o.modifiers.new('Worked arris','BEVEL');mod.width=bevel;mod.segments=1;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def beam(name,a,b,w=.14,mat=wood):
 a,b=Vector((a[0],-a[2],a[1])),Vector((b[0],-b[2],b[1]));v=b-a
 o=box(name,0,0,0,w,v.length,w,mat);o.location=(a+b)/2;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
def prism(name,points,z0,z1,mat):
 n=len(points);return mesh(name,[(x,y,z) for z in [z0,z1] for x,y in points],[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
def save(name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in COL.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=list(COL.objects)[0];bpy.ops.object.convert(target='MESH')
 for mat in list(bpy.data.materials):
  group=[o for o in COL.objects if o.type=='MESH' and o.data.materials[0]==mat]
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
 bpy.ops.object.select_all(action='DESELECT')
 for o in COL.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=list(COL.objects)[0];bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 points=[]
 for o in COL.objects:
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='metres')
  for p in o.data.polygons:
   axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in p.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]/2.7,v[axes[1]]/2.7)
  points.extend([(v.co.x,v.co.z,-v.co.y) for v in o.data.vertices])
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
 import struct
 path=OUT/(name+'.glb');data=path.read_bytes();jl=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jl]);binstart=20+jl;binary=data[binstart+8:]
 for im in doc.get('images',[]):
  bv=doc['bufferViews'][im.pop('bufferView')];namepart=im.get('name','image').replace(' baked albedo','').lower()+'.png'
  (OUT/namepart).write_bytes(binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]);im.pop('mimeType',None);im['uri']=namepart
 # Compact binary buffer views after externalizing embedded images.
 used={a['bufferView'] for a in doc.get('accessors',[]) if 'bufferView' in a};remap={};newbin=bytearray();newviews=[]
 for i,bv in enumerate(doc.get('bufferViews',[])):
  if i not in used:continue
  while len(newbin)%4:newbin.append(0)
  new=bv.copy();off=bv.get('byteOffset',0);new['byteOffset']=len(newbin);newbin.extend(binary[off:off+bv['byteLength']]);remap[i]=len(newviews);newviews.append(new)
 for a in doc.get('accessors',[]):
  if 'bufferView' in a:a['bufferView']=remap[a['bufferView']]
 doc['bufferViews']=newviews;doc['buffers'][0]['byteLength']=len(newbin)
 while len(newbin)%4:newbin.append(0)
 js=json.dumps(doc,separators=(',',':')).encode()
 while len(js)%4:js+=b' '
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(newbin))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(newbin),0x004e4942)+newbin)
 catalog[name]={'min' :[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in COL.objects),'materials':sorted({m.name for o in COL.objects for m in o.data.materials})}

def masonry(x0,x1,y0,y1,z=.055):
 if x1-x0<.02 or y1-y0<.02:return
 rows=max(1,round((y1-y0)/.425));rh=(y1-y0)/rows
 for j in range(rows):
  off=.5*(j%2)
  for i in range(math.floor(x0)-1,math.ceil(x1)+1):
   a=max(x0,i+off);b=min(x1,i+1+off)
   if b-a>.025:box('Bonded granite', (a+b)/2,y0+(j+.5)*rh,z,b-a-.014,rh-.014,.09,stone,.014)
def wall(kind,height=3.4,variant=0):
 door=kind=='door';window=kind=='window';mat=stone if variant==0 else wood if variant==2 else plaster
 hole=.925 if door else .48;sill=0 if door else 1.03;head=2.5 if door else 2.38
 rects=[(-1,1,0,height)] if kind=='plain' else [(-1,-hole,0,height),(hole,1,0,height),(-hole,hole,head,height)]+([] if door else [(-hole,hole,0,sill)])
 for a,b,c,d in rects:
  box('Solid wall and reveal',(a+b)/2,(c+d)/2,-.14,b-a,d-c,.36,mat,0)
  if variant==0:masonry(a,b,c,d)
  box('Interior lime lining',(a+b)/2,(c+d)/2,-.326,b-a,d-c,.016,plaster,0)
 if variant:
  for x in [-.94,.94]:box('Frame post',x,height/2,.03,.12,height,.22,wood)
  for y in [.11,height-.12]:box('Floor beam',0,y,.035,2,.22,.25,wood)
  if kind=='plain':
   beam('Diagonal brace',(-.84,.35,.055),(.84,height-.35,.055),.16)
   if variant==3:beam('Counter brace',(.84,.35,.06),(-.84,height-.35,.06),.14)
  else:
   for x in [-.72,.72]:beam('Short shoulder brace',(x,.42,.06),(math.copysign(.91,x),.94,.06),.12)
  if variant==2:
   for i in range(8):
    x=-.875+i*.25
    for a,b,c,d in rects:
     if a<=x<=b:box('Weatherboard',x,(c+d)/2,.09,.23,d-c,.045,wood,.003)
 if door:
  box('Oak lintel',0,2.63,.065,2.35,.22,.36,wood)
  for side in [-1,1]:box('Dressed door jamb',side*1.02,1.25,.10,.18,2.5,.25,stone)
 if window:
  box('Recessed glass',0,(sill+head)/2,-.17,.96,head-sill,.022,glass,0)
  for x in [-.515,0,.515]:box('Window mullion',x,(sill+head)/2,-.11,.055,head-sill+.12,.25,oak,.006)
  for y in [sill,1.48,1.93,head]:box('Divided window',0,y,-.11,1.08,.055,.25,oak,.006)
  box('Window sill',0,sill-.08,.04,1.3,.15,.6,stone)
  for side in [-1,1]:
   box('Oxblood shutter',side*.765,(sill+head)/2,.18,.40,head-sill+.08,.075,red)
   for y in [1.22,2.15]:box('Iron shutter strap',side*.765,y,.225,.36,.045,.035,iron,.004)
 for a,b in ([(-1,-hole),(hole,1)] if door else [(-1,1)]):box('Interior skirting',(a+b)/2,.07,-.34,b-a,.14,.06,oak,.003)
for v in range(4):
 for kind in ['plain','window','door']:
  name=f'wall_{v}_{kind}';start(name);wall(kind,variant=v);save(name)
# Tower bays retain the established 3.125 m floor datum and narrow door contract.
for kind in ['plain','window','door']:
 start('tower_'+kind);wall(kind,height=3.125);save('tower_'+kind)
start('door');box('Oak door',.945,1.24,0,1.89,2.46,.095,oak)
for y in [.38,1.9]:box('Strapped door',.945,y,.059,1.76,.09,.035,iron,.004)
box('Latch',1.6,1.1,.08,.18,.06,.06,iron);save('door')
for name,dim,mat in [('floor',(1,.18,1),oak),('ceiling',(1,.1,1),plaster),('beam',(1,1,1),wood),('stone',(1,1,1),stone),('foundation',(2,1,.4),stone),('quay',(2,1,2),stone)]:
 start(name);box(name,0,-dim[1]/2 if name in ['floor','ceiling'] else dim[1]/2,0,*dim,mat,0 if name in ['floor','ceiling'] else .012);save(name)
start('rail')
for x in [-.95,-.5,0,.5,.95]:box('Gallery spindle',x,.51,0,.05,1.02,.05,wood,.005)
box('Gallery handrail',0,1.03,0,2,.08,.09,oak);save('rail')
start('stairs')
for i in range(20):box('Oak tread',0,(i+1)*.17-.04,-(i+.5)*.28,2.14,.08,.30,oak)
for x in [-1.05,1.05]:
 beam('Stringer',(x,0,0),(x,3.4,-5.6),.13)
 beam('Handrail',(x,1,0),(x,4.4,-5.6),.065,oak)
 for i in range(0,21,4):beam('Spindle',(x,i*.17,-i*.28),(x,i*.17+1,-i*.28),.045)
save('stairs')
# 2m ridge slices compose arbitrary roof lengths without scaling slate courses.
for span in [4,6,8,10,12,14]:
 for pitch in [.85,1.05]:
  tag=f'{span}_{round(pitch*100)}';w=span/2+.45;rise=w*pitch
  start('roof_'+tag)
  for side in [-1,1]:
   prism('Slate backing',[(0,rise),(side*w,0),(side*w,-.10),(0,rise-.10)],-1,1,slate)
   rows=math.ceil(w/.34)
   for j in range(rows):
    a=w*j/rows;b=min(w,w*(j+1)/rows+.055)
    for k in range(4):
     z=-1+k*.5
     prism('Staggered slate course',[(side*a,rise-a*pitch+.035),(side*b,rise-b*pitch+.035),(side*b,rise-b*pitch+.005),(side*a,rise-a*pitch+.005)],z+.008,z+.49,slate)
   box('Heavy oak eave',side*(w-.08),-.055,0,.18,.22,2,wood)
  box('Ridge cap',0,rise+.06,0,.25,.15,2,slate);save('roof_'+tag)
  start('gable_'+tag);prism('Lime gable',[(-span/2,0),(span/2,0),(0,span/2*pitch)],-.19,.05,plaster)
  beam('King post',(0,0,.09),(0,span/2*pitch,.09),.17)
  for side in [-1,1]:
   beam('Bargeboard',(0,rise,.09),(side*w,0,.09),.18,oak)
   beam('Gable strut',(0,.2,.08),(side*span*.28,span*.22*pitch,.08),.16)
  box('Gable tie',0,.08,.08,span,.20,.22,wood);save('gable_'+tag)
start('chimney');box('Granite chimney',0,1.2,0,.82,2.4,.86,stone)
for y in [.5,1,1.5,2]:box('Chimney course',0,y,0,.85,.055,.89,stone)
box('Chimney cap',0,2.45,0,1.02,.17,1.06,stone);box('Sooted flue',0,2.54,0,.58,.012,.62,iron,0);save('chimney')
start('porch')
for x in [-1.2,1.2]:
 box('Porch post',x,1.25,1.35,.18,2.5,.18,wood);beam('Porch brace',(x,1.85,1.35),(x,2.65,.6),.14)
for side in [-1,1]:prism('Porch slate',[(0,3.15),(side*1.48,2.5),(side*1.48,2.4),(0,3.05)],-.10,1.6,slate)
save('porch')
start('exterior_stairs')
for i in range(7):
 top=1-i/7;z=-1.04+(i+.5)*2.08/7
 box('Solid granite step',0,top/2,z,2,top,2.08/7+.008,stone,.009)
save('exterior_stairs')
start('dormer')
prism('Dormer face',[(-.95,0),(.95,0),(.95,1.3),(0,2),(-.95,1.3)],-.16,.08,plaster)
for side in [-1,1]:
 prism('Dormer roof',[(0,2.10),(side*1.12,1.30),(side*1.12,1.20),(0,2)],-1.6,.30,slate)
 beam('Dormer bargeboard',(0,2.12,.32),(side*1.12,1.30,.32),.13,oak)
box('Dormer sill',0,.24,.16,1.1,.14,.3,oak)
box('Dormer shutter',0,.82,.12,.85,1.0,.1,red)
for x in [-.44,0,.44]:box('Dormer framing',x,.82,.19,.07,1.05,.06,wood)
save('dormer')
start('table')
box('Table top',0,.77,0,2.1,.07,1.09,oak)
for x in [-.84,.84]:
 for z in [-.37,.37]:box('Table leg',x,.37,z,.10,.74,.1,wood)
for z in [-.9,.9]:
 box('Bench seat',0,.46,z,2.15,.08,.38,oak)
 for x in [-.82,.82]:box('Bench trestle',x,.22,z,.12,.44,.3,wood)
save('table')
start('bed');box('Bed frame',0,.30,0,1.6,.42,2.15,wood);box('Linen mattress',0,.56,0,1.48,.16,2.02,linen);box('Folded blanket',0,.67,-.48,1.49,.08,.9,red);box('Pillow',0,.69,.65,1.08,.16,.40,linen);save('bed')
start('shelf')
for x in [-.9,.9]:box('Shelf upright',x,1.1,0,.09,2.2,.4,wood)
for y in [.3,.8,1.3,1.8]:
 box('Shelf',0,y,0,1.9,.07,.42,oak)
 for i in range(9):box('Wage ledger',-.76+i*.18,y+.19,0,.12,.31,.23,red if i%3 else linen,.003)
save('shelf')
# (The old Caerdun's own scenery -- three rounded rocks and their bedrock texture, a
# rowan and a shrub -- was cut here 2026-10-09: only that city placed them, and it
# is gone, ruling CF-21. The kit pieces the other zones build with follow.)
(OUT/'manifest.json').write_text(json.dumps({'units':'metres','up':'Y','outward':'+Z','storey':3.4,'bay':2,'doorClear':[1.85,2.5],'stairs':{'rise':3.4,'run':5.6,'clearWidth':2.035},'modules':catalog},indent=2)+'\n')
library=Path(os.environ.get('CAERDUN_KIT_LIBRARY',ROOT/'design/caerdun-harbor-v2/game-kit'));library.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(library/'Caerdun modular library.blend'))
print('CAERDUN KIT',len(catalog),'modules',sum(x['triangles'] for x in catalog.values()),'triangles')
