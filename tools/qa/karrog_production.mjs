import {chromium,CHANNEL,GL_ARGS} from './lib/playwright.mjs';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const root=process.env.CHARACTER_DIST??'client/dist',out='.playwright-mcp/karrog-integration';
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}try{const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.env':'application/octet-stream'})[ext]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(5187,'127.0.0.1',r));
const browser=await chromium.launch({...CHANNEL,headless:true,args:[...GL_ARGS]});
try{
 const p=await browser.newPage({viewport:{width:750,height:800}}),errors=[],requests=[],bad=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));p.on('response',r=>{if(r.status()>=400)bad.push(r.url())});
 await p.addInitScript(()=>{window.addEventListener('message',e=>{if(e.data?.type==='character-preview-ready')window.previewReady=true;if(e.data?.type==='character-preview-rendered')window.previewSelection=e.data.selection;});});
 await p.goto('http://127.0.0.1:5187/?character-preview');await p.waitForFunction(()=>window.previewReady);
 for(const [race,face,hair,beard] of [['karrog','male','braid',true],['karrog','male','braid',false]]){
  const selection={race,job:'PLD',appearance:{face,hair,beard}};
  await p.evaluate(selection=>{window.previewSelection=undefined;window.postMessage({type:'character-appearance',...selection},location.origin)},selection);
  await p.waitForFunction(selection=>JSON.stringify(window.previewSelection)===JSON.stringify(selection),selection,{timeout:60000});await p.waitForTimeout(400);await p.screenshot({path:`${out}/production-${race}-${face}-${hair}-${beard}.png`});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.ok(!requests.some(u=>u.includes('/models/preview/')));assert.equal(fs.existsSync(path.join(root,'models/preview')),false);
 fs.writeFileSync(out+'/production-report.json',JSON.stringify({passed:true,errors,bad,modelRequests:[...new Set(requests.filter(u=>u.includes('/models/')))]},null,2));console.log('clean production build renders Karrog with four independent coif/beard choices with zero missing assets or prototype requests');
}finally{await browser.close();server.close();}
