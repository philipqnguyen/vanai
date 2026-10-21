// Exercise actual client journal gating and destinations without a game account.
import {chromium,CHANNEL,QA_BASE} from './lib/playwright.mjs';import fs from 'node:fs';
const b=await chromium.launch({...CHANNEL,headless:true}),p=await b.newPage();await p.routeWebSocket('**',()=>{});
await p.goto((process.argv[2]??QA_BASE)+'/?zone=burnedland');await p.waitForFunction(()=>window.__zv?.scene?.isReady(),null,{timeout:180000});
const result=await p.evaluate(async()=>{
 const q=await import('/src/quest_index.ts'),{state}=await import('/src/state.ts'),{ZONES}=await import('/src/data.ts');
 state.quests.clear();const inactive=!q.interactableWanted('emmers_table');state.quests.set('ash2',{status:1,progress:0});
 const readable=q.interactableWanted('emmers_table'),d=q.questDestinations('ash2',false),destinations=d.some(p=>p.kind==='point')&&d.some(p=>p.kind==='npc');
 state.quests.set('ash2',{status:2,progress:1});const completed=!q.interactableWanted('emmers_table');
 const shelves=q.questDestinations('mm1',false),stacked=shelves.filter(p=>p.x===shelves[0].x&&p.z===shelves[0].z),distinctFloors=new Set(stacked.map(p=>p.y)).size>1;
 const crest=ZONES.reservoir.nodes.find(n=>n.y!==undefined);
 return {inactive,readable,destinations,completed,distinctFloors,shelves,crestHeight:crest.y,scope:'Journal gating, supplementary readable and stacked objective markers; no server or account.'};
});await b.close();fs.writeFileSync('.playwright-mcp/quest-markers.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(['inactive','readable','destinations','completed','distinctFloors'].some(k=>!result[k]))process.exitCode=1;
