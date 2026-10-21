import {registerZone,scene,makeOcean,buildApi} from '../scene';
import {instantiateModel} from '../models';
import {FERRY} from '../ferry-clock';
const ocean=makeOcean(0,0,1,{shore:{pts:[[-1,-1],[1,-1],[1,1],[-1,1]],coast:[true,true,true,true]},floor:8,shelf:1,reach:1100});
function build(){
 scene.getMeshByName('ground')?.setEnabled(false);ocean.build('gulf');
 // Floor heights and hull bounds are shared with authoritative movement.
 // Keep the model's existing rails and stairs; no passenger pen across them.
 for(const r of FERRY.obstacles)buildApi.addBoxCollider((r.x0+r.x1)/2,(r.z0+r.z1)/2,(r.x1-r.x0)/2,(r.z1-r.z0)/2,0,40,0);
 const owner=scene;instantiateModel('pirate/Ship_Large.gltf',null).then(m=>{if(!m||scene!==owner||owner.isDisposed)return;m.root.name='gulf_voyage_ship';m.root.scaling.setAll(3.9);});
}
for(const key of Object.values(FERRY.ports).map(p=>p.sea_zone))registerZone({key,height:()=>-8,build});
