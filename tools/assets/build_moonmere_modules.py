"""The old Moonmere's original furniture and door modules. Blender --background --python this_file.
What is left of the old city's module set (client/public/models/moonmere/): the 16 files the game
still places -- the annex door's leaf (questDoor), the shelves, stamp desks and observatory
instruments (scene.ts), Heartwood's homes and stalls, and the Sunken Ballroom's music box. The
architecture (walls, windows, roofs, stairs, floors, quay, lamps) was retired with the old city
(MOONMERE.md "The old city, retired") and its builders taken out of this file; the last wall
section, the annex door's frame (wall_door), went with its wall helpers on 2026-10-10: the
Long Tower's own shell frames that door now.
The 2m bay and 3.125m storey match town.ts. No source geometry is copied from a kit.
"""
import bpy, math, pathlib, json, sys
# Optional module names after -- limit GLB exports; the editable library stays complete.
ONLY=set(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else set()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'client/public/models/moonmere';OUT.mkdir(parents=True,exist_ok=True)
COL=None;catalog={}

def material(name,color,rough=.8,metal=0):
 m=bpy.data.materials.new('MM_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
stone=material('Stone',(.48,.42,.32));clay=material('Clay',(.4,.14,.07));wood=material('Wood',(.14,.09,.047));metal=material('Metal',(.4,.26,.09),.35,.75);glass=material('Glass',(.045,.14,.18),.22,.3);cloth=material('Cloth',(.03,.13,.21));book=material('Book',(.22,.1,.07));linen=material('Linen',(.82,.8,.68))

def start(name):
 global COL
 bpy.ops.object.select_all(action='DESELECT');COL=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(COL)

def finish(o,name,mat,bevel=.018):
 o.name=name;o.data.materials.append(mat)
 for c in list(o.users_collection):c.objects.unlink(o)
 COL.objects.link(o)
 if bevel:
  mod=o.modifiers.new('Stone arris','BEVEL');mod.width=bevel;mod.segments=1
  o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
 return o

def box(name,x,y,z,w,h,d,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y));o=bpy.context.object;o.dimensions=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bevel)

def mesh(name,vs,faces,mat,bevel=0):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],faces);me.update();o=bpy.data.objects.new(name,me);COL.objects.link(o);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Cut edges','BEVEL');mod.width=bevel;mod.segments=1;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def extrusion(name,points,z0,z1,mat,bevel=0):
 n=len(points);vs=[(x,y,z) for z in [z0,z1] for x,y in points]
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,faces,mat,bevel)

def save(name):
 objects=list(COL.objects);bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.convert(target='MESH')
 # Batch by material while keeping each module's exact world origin.
 for mat in list(bpy.data.materials):
  group=[o for o in COL.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
 # Freeze the pivot into vertices before export. Variant templates must not
 # accumulate object translations when the loader reuses source geometry.
 bpy.ops.object.select_all(action='DESELECT')
 for o in COL.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=list(COL.objects)[0]
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 # Every component is a closed solid. Recalculate outward winding before
 # export, including the hip roof and arch segment extrusions.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 for o in COL.objects:
  uv=o.data.uv_layers.active or o.data.uv_layers.new(name='metres')
  for p in o.data.polygons:
   normal=o.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in p.loop_indices:
    v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]/2,v[axes[1]]/2)
 bpy.ops.object.select_all(action='DESELECT')
 for o in COL.objects:o.select_set(True)
 if not ONLY or name in ONLY:
  bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
 catalog[name]={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in COL.objects),'materials':sorted({m.name for o in COL.objects for m in o.data.materials})}

# The opening is +/-0.60m, spring 1.91m. A 2cm rebate behind the stone
# jamb closes oblique sightlines; town.ts places the hinge at -0.62m.
start('door');r=.62;points=[(0,.02),(2*r,.02),(2*r,1.91)]+[(r+r*math.cos(i*math.pi/20),1.91+r*math.sin(i*math.pi/20)) for i in range(1,21)]
extrusion('arched oak leaf',points,-.04,.045,wood)
for x in [.14,.32,.5,.68,.86]:box('door join',x*1.24/1.05,1.03,.05,.012,1.98,.014,metal,.001)
for y in [.4,1.55]:box('door iron strap',.62,y,.066,1.16,.035,.025,metal,.003)
box('latch',1.09,1.1,.1,.035,.16,.065,metal,.01);save('door')
start('bookcase')
for x in [-.8,.8]:box('bookcase stile',x,1.12,-.16,.1,2.24,.4,wood)
box('bookcase back',0,1.12,-.34,1.6,2.24,.06,wood)
for y in [.12,.63,1.15,1.67,2.2]:box('shelf',0,y,-.13,1.65,.09,.44,wood)
for row in range(4):
 for i in range(9):box('bound volume',-.68+i*.16,.37+row*.515,-.07,.115,.34+(i%3)*.03,.23,book,.004)
save('bookcase')
start('desk');box('desk top',0,.8,0,1.55,.1,.75,wood)
for x in [-.65,.65]:
 for z in [-.25,.25]:box('desk leg',x,.4,z,.1,.8,.1,wood)
box('writing folio',-.3,.87,0,.4,.045,.28,linen,.005);save('desk')
# A working seal press and fresh wax beside the chained office stamps.
start('seal_press')
box('brass seal base',0,.035,0,.28,.07,.24,metal,.015)
box('engraved die',0,.1,0,.15,.07,.15,metal,.008)
box('stamp handle',0,.22,0,.07,.2,.07,wood,.012)
box('stamp grip',0,.33,0,.2,.055,.08,wood,.015)
box('wax tablet',.32,.015,0,.2,.03,.2,clay,.035)
save('seal_press')
# Observatory instruments, authored in the same metre scale as the desks.
def round_part(name,x,y,z,radius,depth,mat,tilt=0):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=(x,-z,y));o=bpy.context.object;o.rotation_euler.x=tilt;return finish(o,name,mat,0)
start('star_globe')
round_part('globe foot',0,.09,0,.48,.18,stone)
round_part('globe pedestal',0,.68,0,.12,1.15,metal)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=.59,location=(0,0,1.6));finish(bpy.context.object,'painted star globe',glass)
for a in [0,math.pi/2]:
 bpy.ops.mesh.primitive_torus_add(major_radius=.65,minor_radius=.035,major_segments=48,minor_segments=8,location=(0,0,1.6),rotation=(math.pi/2,a,.3));finish(bpy.context.object,'graduated brass meridian',metal)
for i in range(22):
 a=i*2.399;h=-.5+i/21;rad=math.sqrt(.59**2-h*h);bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.02,location=(rad*math.cos(a),rad*math.sin(a),1.6+h));finish(bpy.context.object,'inlaid star',linen)
save('star_globe')
start('telescope')
round_part('telescope base',0,.09,0,.48,.18,stone)
round_part('telescope pillar',0,.75,0,.1,1.4,metal)
# Cylinder axis tips toward world +z and upward: both annex instruments agree.
round_part('brass telescope tube',0,1.65,0,.17,1.65,metal,1.02)
round_part('objective lens',0,1.65+.82*math.cos(1.02),.82*math.sin(1.02),.145,.018,glass,1.02)
round_part('eyepiece',0,1.65-.86*math.cos(1.02),-.86*math.sin(1.02),.075,.18,wood,1.02)
save('telescope')
start('water_clock')
round_part('clock stone foot',0,.12,0,.44,.24,stone)
for x in [-.32,.32]:box('clock upright',x,1.05,0,.07,1.9,.09,metal)
for y in [.36,1.65]:
 round_part('clock receiving bowl',0,y,0,.3,.16,metal)
 round_part('clock water surface',0,y+.085,0,.26,.018,glass)
round_part('falling water',0,1.05,0,.012,1.1,glass)
box('hour scale',.27,1.05,.07,.07,1.1,.025,linen)
for i in range(10):box('hour mark',.27,.58+i*.1,.087,.075,.012,.01,wood)
save('water_clock')
# An open cylinder music box for the drowned ballroom's interrupted waltz.
start('music_box')
box('music box base',0,.04,0,.8,.08,.52,wood,.02)
for x in [-.39,.39]:box('case side',x,.14,0,.045,.2,.52,wood,.01)
for z in [-.245,.245]:box('case end',0,.14,z,.78,.2,.045,wood,.01)
box('open lid',0,.45,-.25,.8,.46,.05,wood,.02)
box('lid lining',0,.45,-.218,.68,.34,.015,linen,.01)
bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.09,depth=.52,location=(0,-.045,.17),rotation=(0,math.pi/2,0));finish(bpy.context.object,'pinned cylinder',metal)
for i in range(18):
 box('tuned comb tooth',-.27+i*.03,.16,.17,.016,.018,.12+(i%3)*.018,metal,.002)
 box('cylinder pin',-.24+i*.028,.252,.045,.012,.023,.012,metal,.002)
box('winding key',.47,.14,.04,.14,.03,.12,metal,.01)
save('music_box')
start('bed');box('bed frame',0,.39,0,1.2,.18,2.05,wood);box('linen mattress',0,.54,0,1.1,.18,1.95,linen,.055);box('pillow',0,.69,-.68,.85,.14,.34,linen,.08)
for x in [-.53,.53]:
 for z in [-.92,.92]:box('bedpost',x,.45,z,.12,.9,.12,wood)
box('coverlet',0,.65,.3,1.11,.035,1.1,cloth,.015);save('bed')
start('bench')
for x in [-.65,.65]:box('bench stone leg',x,.24,0,.22,.48,.58,stone)
for z in [-.18,.06,.3]:box('oak seat slat',0,.55,z,1.85,.12,.18,wood)
box('oak back',0,.96,-.26,1.85,.42,.1,wood);save('bench')
# Domestic sets share the city's oak, linen and blue wool. Small objects are
# part of each reusable GLB, so a lived-in room adds instances, not point lights.
start('home_table')
box('oak supper table',0,.79,0,1.3,.1,.78,wood,.025)
for x in [-.51,.51]:
 for z in [-.27,.27]:box('turned table leg',x,.39,z,.085,.78,.085,wood,.012)
box('linen table runner',0,.848,0,.34,.015,.8,linen,.005)
for x in [-.4,.4]:
 round_part('earthen dinner plate',x,.86,0,.18,.025,linen)
 round_part('tea cup',x,.94,-.25,.068,.14,clay)
round_part('bread board',0,.869,.03,.14,.025,wood)
box('small loaf',0,.92,.03,.18,.085,.13,book,.04)
save('home_table')
start('home_chair')
for x in [-.23,.23]:
 for z in [-.22,.22]:box('chair leg',x,.24,z,.065,.48,.065,wood,.008)
box('oak chair seat',0,.48,0,.57,.07,.56,wood,.014)
box('blue seat cushion',0,.53,.02,.48,.05,.44,cloth,.025)
for x in [-.23,.23]:box('chair back upright',x,.84,-.23,.065,.76,.065,wood,.008)
for y in [.79,1.06]:box('chair back rail',0,y,-.23,.47,.13,.065,wood,.01)
save('home_chair')
start('home_cupboard')
box('cupboard body',0,.83,0,1.25,1.58,.46,wood,.018)
for x in [-.31,.31]:
 box('recessed cupboard panel',x,.78,.245,.53,1.29,.025,clay,.018)
 round_part('brass cupboard pull',x*.3,.89,.28,.027,.035,metal,math.pi/2)
box('cupboard crown',0,1.66,0,1.35,.1,.54,wood,.015)
for i in range(3):box('folded linen',-.28,1.74+i*.055,.03,.44,.05,.3,linen,.018)
round_part('storage jar',.34,1.86,0,.14,.3,clay)
round_part('jar lid',.34,2.025,0,.155,.045,wood)
save('home_cupboard')
start('home_chest')
box('blanket chest',0,.29,0,1.05,.54,.58,wood,.025)
box('chest lid',0,.585,0,1.11,.08,.64,wood,.018)
for x in [-.38,.38]:box('chest brass strap',x,.32,.298,.045,.53,.018,metal,.002)
box('folded coverlet',.2,.67,0,.52,.09,.42,cloth,.035)
box('folded pillowcase',.2,.735,0,.46,.04,.35,linen,.02)
save('home_chest')
start('home_rug')
box('woven blue wool',0,.016,0,1.5,.022,2.6,cloth,.004)
for x in [-.64,.64]:box('woven long border',x,.03,0,.055,.004,2.35,linen)
for z in [-1.14,1.14]:box('woven end border',0,.03,z,1.33,.004,.055,linen)
for x in [-.6,-.4,-.2,0,.2,.4,.6]:
 for z in [-1.33,1.33]:box('rug fringe',x,.015,z,.035,.015,.15,linen)
save('home_rug')
start('home_herbs')
round_part('terracotta pot',0,.18,0,.18,.34,clay)
round_part('pot rim',0,.35,0,.205,.065,clay)
round_part('pot soil',0,.386,0,.166,.02,wood)
herb=material('Herb',(.16,.28,.11))
for i in range(7):
 a=i*2.4
 o=box('herb leaf',math.cos(a)*.09,.51+(i%3)*.045,math.sin(a)*.09,.07,.28,.025,herb,.025)
 o.rotation_euler=(.3*math.cos(a),.3*math.sin(a),a)
save('home_herbs')
# Show just one module on opening the library; all others remain editable collections.
for collection in bpy.context.scene.collection.children:
 collection.hide_viewport=collection.name!='door'
source=ROOT/'design/moonmere-city/modules.blend';source.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(source));(OUT/'manifest.json').write_text(json.dumps(catalog,indent=2)+'\n')
print('EXPORTED',len(catalog),'original modules')
