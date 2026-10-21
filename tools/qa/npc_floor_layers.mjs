// Measure which NPCs stand on a floor with another walkable layer beneath them.
//
// The server knows a player's floor only through `sites` (SiteLevels): an NPC
// on an upper storey with no site is, to the server, just an (x,z) eight metres
// away, so it can be addressed from the room below. This builds every zone with
// NPCs through the real client builder (/?zone=<key>, no account) and records,
// for each NPC, the LOWEST walkable surface at its (x,z) -- terrain, deck or
// stair -- next to the height it stands at. tools/data/audit.py then fails any
// NPC without a site that stands a storey above that lowest layer, and any NPC
// this table has not measured (keyed by position, so a rename does not matter).
//
//   node tools/qa/npc_floor_layers.mjs [url] [zone ...]   # report only
//   node tools/qa/npc_floor_layers.mjs --write             # rewrite the table
//
// It also prints the house or tower under each elevated NPC, which is what a
// new site entry is measured from (BUILDINGS.md "Talking across a floor").
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const tablePath='tools/data/npc_floor_layers.json';
const definitions=JSON.parse(fs.readFileSync('shared/data/zones.json','utf8'));
const args=process.argv.slice(2),write=args.includes('--write'),url=args.find(a=>/^https?:/.test(a))??QA_BASE;
const requested=args.filter(a=>!a.startsWith('--')&&!/^https?:/.test(a));
const keys=requested.length?requested:Object.keys(definitions).filter(k=>(definitions[k].npcs??[]).length);
const table=fs.existsSync(tablePath)?JSON.parse(fs.readFileSync(tablePath,'utf8')):{};
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS,'--ignore-gpu-blocklist']});
const report={},errors=[];
try{
 for(const key of keys){
  // A dev server reloads the page whenever a source file changes under it;
  // measure again rather than fail the whole sweep on one reload.
  let rows=null;
  for(let attempt=1;!rows;attempt++){
  const page=await browser.newPage({viewport:{width:900,height:600}}),pageErrors=[];
  await page.addInitScript(()=>performance.setResourceTimingBufferSize(1e5));
  page.on('pageerror',e=>pageErrors.push(`${key}: ${e.message}`));
  try{
  await page.goto(`${url}/?zone=${key}&daytime=.25`);
  await page.waitForFunction(()=>window.__zv?.blocked,null,{timeout:240000});
  await page.waitForTimeout(500);
  rows=await page.evaluate(async npcs=>{
   const find=n=>performance.getEntriesByType('resource').map(r=>r.name).find(r=>new URL(r).pathname===`/src/${n}.ts`)??`/src/${n}.ts`;
   const S=await import(find('scene')),T=await import(find('town')),B=await import(performance.getEntriesByType('resource').map(r=>r.name).find(r=>new URL(r).pathname.endsWith('/@babylonjs_core.js')));
   const inRect=(x,z,cx,cz,hx,hz,yaw)=>{const dx=x-cx,dz=z-cz,c=Math.cos(yaw),s=Math.sin(yaw);return Math.abs(dx*c-dz*s)<hx&&Math.abs(dx*s+dz*c)<hz;};
   const liquid=/water|ocean|_sea|sea_|mere_surface|lake|river|pond|harbour_surface/i;
   return npcs.map(n=>{
    // Every walkable layer under (x,z): groundHeight(x,z,prevY) answers the
    // highest surface a body at prevY can stand on, so sweeping prevY from
    // the bottom up visits each one. Terrain under a liquid surface deeper
    // than wading is not a layer anyone stands on (a pier over the harbour).
    const terrain=S.groundHeight(n.x,n.z),top=(n.y??terrain)+1,layers=new Set();
    for(let h=Math.min(terrain,top)-2;h<=top;h+=.25)layers.add(+S.groundHeight(n.x,n.z,h).toFixed(4));
    const hits=S.scene.multiPickWithRay(new B.Ray(new B.Vector3(n.x,top+1,n.z),new B.Vector3(0,-1,0),top+1-terrain+.5),m=>liquid.test(m.name))??[];
    const surface=Math.max(-Infinity,...hits.map(h=>h.pickedPoint.y));
    const drowned=surface>terrain+S.WADE_DEPTH;
    if(drowned)layers.delete(+terrain.toFixed(4));
    // Nor is a layer sealed inside solid masonry: the ground under a stair
    // landing that stands on its own block (the Capital's Great Stair, where
    // Morrow waits) is answered by groundHeight but held shut by the block's
    // collider. A layer under the NPC counts as entombed only when a body is
    // blocked there at its (x,z) AND a metre out on all four sides -- inside
    // the stone, not merely beside a wall of a room below. A metre, not less:
    // debugHit pads every box by the body's 0.45 m radius, so at half a metre
    // a 0.2 m wall or a desk straight under a gallery NPC blocked all five
    // probes and a real lower floor was dropped (the M2 review). At a metre a
    // box must reach past 0.55 m every way from the spot to entomb it.
    const entombed=[],STOREY_GAP=1.5;  // audit.py's: a step or a quay is not a floor
    for(const y of [...layers])if(n.y!=null&&y<n.y-STOREY_GAP&&[[0,0],[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>/box|stair body/.test(S.debugHit(n.x+dx,n.z+dz,y)))){layers.delete(y);entombed.push(y);}
    const lowest=layers.size?Math.min(...layers):terrain;
    const house=T.inspectHouses().find(h=>inRect(n.x,n.z,h.spec.cx,h.spec.cz,h.spec.span/2,(h.spec.len)/2,h.spec.yaw??0));
    const tower=T.inspectTowers().find(t=>Math.hypot(n.x-t.spec.cx,n.z-t.spec.cz)<t.R);
    return {id:n.id,site:n.site??null,x:n.x,z:n.z,y:n.y??null,lowest:+lowest.toFixed(4),terrain:+terrain.toFixed(4),layers:[...layers].sort((a,b)=>a-b),liquid:drowned?+surface.toFixed(3):null,entombed,liquidMeshes:[...new Set(hits.map(h=>h.pickedMesh.name))],
     house:house?{seed:house.spec.seed,cx:house.spec.cx,cz:house.spec.cz,span:house.spec.span,len:house.spec.len,yaw:house.spec.yaw,y0:house.y0,storeys:house.spec.storeys,walkable:house.walkable,stairs:house.stairs,door:house.door}:null,
     tower:tower?{cx:tower.spec.cx,cz:tower.spec.cz,R:tower.R,y0:tower.y0}:null};
   });
  },definitions[key].npcs);
  errors.push(...pageErrors);
  }catch(e){if(attempt>=3)throw e;console.error(`${key}: ${e.message.split('\n')[0]} -- measuring again`);}
  finally{await page.close();}
  }
  report[key]=rows;
  // every NPC, sited ones too: dropping a site must read as an elevated NPC
  table[key]=rows.map(r=>({x:r.x,z:r.z,y:r.y,lowest:r.lowest}));
  const elevated=rows.filter(r=>!r.site&&r.y!==null&&r.y-r.lowest>1.5);
  console.log(JSON.stringify({key,npcs:rows.length,elevated:elevated.map(r=>({id:r.id,y:r.y,lowest:r.lowest,house:r.house?.seed??null,tower:!!r.tower}))}));
 }
}finally{await browser.close();}
fs.mkdirSync('.playwright-mcp',{recursive:true});
fs.writeFileSync('.playwright-mcp/npc-floor-layers.json',JSON.stringify({report,errors},null,1));
if(write){
 const sorted=Object.fromEntries(Object.keys(table).sort().map(k=>[k,table[k]]));
 fs.writeFileSync(tablePath,'{\n'+Object.entries(sorted).map(([k,rows])=>` ${JSON.stringify(k)}: [\n`+rows.map(r=>'  '+JSON.stringify(r)).join(',\n')+'\n ]').join(',\n')+'\n}\n');
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
