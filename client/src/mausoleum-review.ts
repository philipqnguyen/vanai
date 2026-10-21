import { Color3, MeshBuilder, Vector3, type LinesMesh, type UniversalCamera } from '@babylonjs/core';
import zones from '@data/zones.json';
import { scene, groundHeight, debugHit, resolveCollision } from './scene';
import { tombCells, type TombLayout, type TombRoom } from './zones/mausoleum-layout';
import { reviewPaths, checkReviewPath, type ReviewPath, type ReviewResult, type ReviewCollision, type ReviewFailure } from './mausoleum-review-checks';

interface Destination {x:number;z:number;y:number;lookX:number;lookZ:number}
export function initMausoleumReview(camera:UniversalCamera,jump:(p:Destination)=>void,open:boolean,autoCheck:boolean,key = 'mausoleum'):void {
  const definition=(zones as unknown as Record<string,{name:string;layout:TombLayout;sites:Record<string,{ramps:{x0:number;z0:number;x1:number;z1:number;y0:number;y1:number;half:number}[]}>;interactables:{x:number;z:number}[]}>)[key];
  const layout=definition.layout,cells=tombCells(layout),ramps=Object.values(definition.sites??{}).flatMap(s=>s.ramps);
  const xs=[...cells.keys()].map(k=>Number(k.split(',')[0])*4),zs=[...cells.keys()].map(k=>-Number(k.split(',')[1])*4);
  const bounds={x:Math.min(...xs)-8,y:Math.min(...zs)-8,w:Math.max(...xs)-Math.min(...xs)+16,h:Math.max(...zs)-Math.min(...zs)+16};
  const api:ReviewCollision={ground:groundHeight,hit:debugHit,move:resolveCollision,floor:(x,z)=>cells.has(`${Math.floor(x/4+.5)},${Math.floor(z/4+.5)}`)};
  const paths=reviewPaths(layout,ramps),results=new Map<string,ReviewResult>();
  const ns='http://www.w3.org/2000/svg';
  const svgEl=(tag:string,attrs:Record<string,string|number>)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const colors={unchecked:'#8290a2',pass:'#50d698',blocked:'#ff626a'};
  const style=document.createElement('style');style.textContent=`
  #ms-review{position:fixed;z-index:30;right:14px;top:94px;width:min(1060px,calc(100vw - 28px));height:min(860px,calc(100vh - 125px));background:#111c28f5;color:#e8edf2;border:1px solid #667382;border-radius:10px;box-shadow:0 15px 70px #0009;display:flex;flex-direction:column;font:13px/1.4 system-ui,sans-serif}
  #ms-review[hidden]{display:none}#ms-review header{padding:13px 16px;border-bottom:1px solid #435364;display:flex;gap:12px;align-items:center;flex-wrap:wrap}#ms-review h2{font:600 16px system-ui;margin:0 auto 0 0}#ms-review button,#ms-review-toggle{font:inherit;color:#e8edf2;background:#253749;border:1px solid #5b7186;border-radius:5px;padding:6px 9px;cursor:pointer}#ms-review button:hover,#ms-review button:focus-visible{background:#39526b;outline:2px solid #ebc37d}#ms-review button:disabled{opacity:.5;cursor:wait}
  #ms-review-toggle{position:fixed;z-index:31;right:14px;bottom:14px;font:13px system-ui}#ms-review .body{display:grid;grid-template-columns:minmax(0,1fr) 265px;min-height:0;flex:1}#ms-review .map{position:relative;min-width:0;min-height:0;overflow:hidden}#ms-review svg{position:absolute;inset:0;width:100%;height:100%;min-height:0;touch-action:none}#ms-review aside{overflow:auto;border-left:1px solid #435364;padding:10px}#ms-review .room-list{display:grid;gap:4px}#ms-review .room-list button{text-align:left;font-size:12px}#ms-review .room-list button[aria-current=true]{border-color:#ffe099;background:#4e452d}
  #ms-review footer{padding:10px 16px;border-top:1px solid #435364;color:#b9c6d2}#ms-review .legend{display:flex;gap:15px;flex-wrap:wrap;margin:6px 0}#ms-review .legend span::before{content:'━';margin-right:5px;color:var(--color)}#ms-review .room{cursor:pointer}#ms-review .room:hover rect,#ms-review .room:focus rect{stroke:#ffe099;stroke-width:1}#ms-review .route{cursor:crosshair}#ms-review .route:hover{stroke-width:1.2}#ms-review .detail{padding:8px 0;color:#d3dce5;white-space:pre-line}#ms-review .failure{display:block;width:100%;text-align:left;margin:4px 0;border-color:#d36c72}
  @media(max-width:700px){#ms-review .body{grid-template-columns:minmax(0,1fr) 170px}#ms-review{top:82px;height:calc(100vh - 140px)}#ms-review header{padding:8px}#ms-review .room-list button{font-size:11px}}
  `;document.head.appendChild(style);
  const panel=document.createElement('section');panel.id='ms-review';panel.setAttribute('aria-label',`${definition.name} developer review map`);panel.hidden=!open;
  panel.innerHTML=`<header><h2>${definition.name} · review map</h2><button type="button" data-action="check">Check passages</button><label><input type="checkbox" data-action="paint"> Paint in scene</label><button type="button" data-action="close" aria-label="Hide review map">Hide · M</button></header><div class="body"><div class="map"></div><aside><div class="position" aria-live="off"></div><div class="detail">Click any named room to stand there.</div><div class="room-list"></div><div class="failures"></div></aside></div><footer><div class="status" role="status">Unchecked · run passage checks</div><div class="legend"><span style="--color:${colors.pass}">Pass</span><span style="--color:${colors.blocked}">Blocked</span><span style="--color:${colors.unchecked}">Unchecked</span></div><div>0.9m player · both directions · three lanes per passage · junction turns · stairs up/down.<br>Checks sample passage lanes; room interiors are not certified. M map · C recheck · WASD walk · drag to look.</div></footer>`;
  document.body.appendChild(panel);
  const toggle=document.createElement('button');toggle.id='ms-review-toggle';toggle.textContent='Review map · M';toggle.setAttribute('aria-controls','ms-review');document.body.appendChild(toggle);
  const setOpen=(value:boolean)=>{panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));};setOpen(open);
  toggle.onclick=()=>setOpen(panel.hidden===true);panel.querySelector<HTMLButtonElement>('[data-action=close]')!.onclick=()=>setOpen(false);
  const svg=svgEl('svg',{viewBox:`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,role:'group','aria-label':`Overhead ${definition.name} map. Select a room to jump there.`});panel.querySelector('.map')!.appendChild(svg);
  svg.appendChild(svgEl('rect',{x:bounds.x,y:bounds.y,width:bounds.w,height:bounds.h,fill:'#0c1620'}));
  for(const key of cells.keys()){const[x,z]=key.split(',').map(Number);svg.appendChild(svgEl('rect',{x:x*4-2,y:-z*4-2,width:4,height:4,fill:'#334656'}));}
  const roomLayer=svgEl('g',{}),routeLayer=svgEl('g',{}),failureLayer=svgEl('g',{});svg.append(roomLayer,routeLayer,failureLayer);
  const detail=panel.querySelector<HTMLDivElement>('.detail')!,roomButtons=new Map<string,HTMLButtonElement>();
  const safe=(x:number,z:number,y:number)=>api.floor(x,z)&&debugHit(x,z,y)==='clear'&&[[.12,0],[-.12,0],[0,.12],[0,-.12]].every(([dx,dz])=>debugHit(x+dx,z+dz,y)==='clear');
  function findDestination(r:TombRoom):Destination|null {
    const cx=(r.x+(r.w-1)/2)*4,cz=(r.z+(r.d-1)/2)*4;
    // Prefer the entrance half, looking toward the room's long axis. Scan
    // alternate standing positions instead of teleporting into a prop.
    const wanted=[cx,cz-Math.min(4,r.d*2-2)];
    const candidates:Destination[]=[];
    for(let x=r.x*4-.5;x<(r.x+r.w-1)*4+1;x+=.5)for(let z=r.z*4-.5;z<(r.z+r.d-1)*4+1;z+=.5){
      candidates.push({x,z,y:0,lookX:cx,lookZ:cz+Math.max(3,r.d)});
    }
    candidates.sort((a,b)=>(a.x-wanted[0])**2+(a.z-wanted[1])**2-((b.x-wanted[0])**2+(b.z-wanted[1])**2));
    for(const d of candidates){d.y=groundHeight(d.x,d.z,Infinity);if(safe(d.x,d.z,d.y))return d;}return null;
  }
  const destinations=new Map(layout.rooms.map(r=>[r.id,findDestination(r)]));
  function moveTo(r:TombRoom):void {
    const d=destinations.get(r.id);if(!d||!safe(d.x,d.z,d.y)){detail.textContent=`${r.name}: no safe standing point. Jump refused.`;return;}
    jump(d);detail.textContent=`${r.name}\nStanding at ${d.x.toFixed(1)}, ${d.z.toFixed(1)} · floor ${d.y.toFixed(1)}m`;
    for(const[id,b]of roomButtons)b.setAttribute('aria-current',String(id===r.id));
  }
  layout.rooms.forEach((r,index)=>{
    const cx=(r.x+(r.w-1)/2)*4,cz=(r.z+(r.d-1)/2)*4;
    const g=svgEl('g',{class:'room',tabindex:0,role:'button','aria-label':`Visit ${r.name}`,'data-room':r.id});
    g.appendChild(svgEl('rect',{x:r.x*4-2,y:-(r.z+r.d-1)*4-2,width:r.w*4,height:r.d*4,rx:.8,fill:r.kind==='boss'?'#63563d':'#40566a',stroke:'#91a1ad','stroke-width':.3}));
    const name=r.name.replace(/^The |^the /,'').split(' — ')[0],words=name.split(' '),lines:string[]=[];let line='';
    for(const word of words){if((line+' '+word).trim().length>Math.max(9,r.w*3)&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
    const t=svgEl('text',{x:cx,y:-cz-(lines.length-1)*1.8,'text-anchor':'middle',fill:'#edf0e8','font-size':3.2,'font-family':'system-ui','pointer-events':'none'});
    lines.forEach((text,i)=>{const span=svgEl('tspan',{x:cx,dy:i?3.8:0});span.textContent=text;t.appendChild(span);});g.appendChild(t);
    const title=svgEl('title',{});title.textContent=r.name;g.appendChild(title);g.addEventListener('click',()=>moveTo(r));g.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(k.key==='Enter'||k.key===' '){k.preventDefault();moveTo(r);}});roomLayer.appendChild(g);
    const button=document.createElement('button');button.type='button';button.dataset.room=r.id;button.textContent=`${String(index+1).padStart(2,'0')}  ${r.name}`;button.disabled=!destinations.get(r.id);button.onclick=()=>moveTo(r);roomButtons.set(r.id,button);panel.querySelector('.room-list')!.appendChild(button);
  });
  const writ=definition.interactables[0];
  const dais:Destination={x:writ.x,z:writ.z-3,y:groundHeight(writ.x,writ.z-3,Infinity),lookX:writ.x,lookZ:writ.z+3};
  function moveDais():void {
    if(!safe(dais.x,dais.z,dais.y)){detail.textContent='The writ dais has no clear standing position.';return;}
    jump(dais);detail.textContent=`Writ dais · upper floor\nStanding at ${dais.x}, ${dais.z} · floor ${dais.y.toFixed(1)}m`;
    for(const[id,b]of roomButtons)b.setAttribute('aria-current',String(id==='dais'));
  }
  destinations.set('dais',dais);
  const daisButton=document.createElement('button');daisButton.type='button';daisButton.dataset.room='dais';daisButton.textContent='Writ dais · upper floor';daisButton.onclick=moveDais;roomButtons.set('dais',daisButton);panel.querySelector('.room-list')!.appendChild(daisButton);
  const daisMark=svgEl('g',{tabindex:0,role:'button','aria-label':'Visit the writ dais','data-room':'dais',class:'room'});
  daisMark.appendChild(svgEl('rect',{x:writ.x-5,y:-writ.z-1,width:10,height:4,fill:'#958250',stroke:'#dfd0a6','stroke-width':.3}));
  const daisText=svgEl('text',{x:writ.x,y:-writ.z+2,'text-anchor':'middle','font-size':2.8,fill:'#fff'});daisText.textContent='Dais';daisMark.appendChild(daisText);daisMark.addEventListener('click',moveDais);daisMark.addEventListener('keydown',e=>{if((e as KeyboardEvent).key==='Enter')moveDais();});roomLayer.appendChild(daisMark);
  if(key!=='mausoleum')for(const [index,ramp]of ramps.entries()){
    const len=Math.hypot(ramp.x1-ramp.x0,ramp.z1-ramp.z0),x=ramp.x1+(ramp.x1-ramp.x0)/len*.8,z=ramp.z1+(ramp.z1-ramp.z0)/len*.8;
    const d={x,z,y:groundHeight(x,z,Infinity),lookX:x+3,lookZ:z+3},id=`landing:${index}`;
    if(!safe(x,z,d.y)||Math.abs(d.y-ramp.y1)>.1)continue;
    destinations.set(id,d);const button=document.createElement('button');button.type='button';button.dataset.room=id;button.textContent=`Upper landing ${index+1} · ${d.y}m`;button.onclick=()=>{jump(d);detail.textContent=`Upper landing ${index+1}`;};panel.querySelector('.room-list')!.appendChild(button);
  }
  const lines=new Map<string,Element>(),worldLines=new Map<string,LinesMesh>();let paint=false;
  function inspect(path:ReviewPath,selected?:ReviewFailure):void {
    const result=results.get(path.id);detail.textContent=`${path.label}\n${result?result.status==='pass'?`Pass · ${result.sweeps} player sweeps`:`Blocked · ${result.failures.length} failed sweeps`:'Unchecked'}`;
    panel.querySelector('aside')!.scrollTop=0;
    const failure=selected??result?.failures[0];if(failure){detail.textContent+=`\nAt ${failure.x.toFixed(1)}, ${failure.z.toFixed(1)}\n${failure.reason}`;if(failure.safe){const[x,z,y]=failure.safe;jump({x,z,y,lookX:failure.x,lookZ:failure.z});}}
  }
  for(const o of layout.obstacles??[])routeLayer.appendChild(svgEl('rect',{x:o.x*4-2,y:-(o.z+o.d-1)*4-2,width:o.w*4,height:o.d*4,fill:'#17232b',stroke:'#a89977','stroke-width':.3,'pointer-events':'none'}));
  for(const path of paths){
    const p=svgEl('polyline',{points:path.points.map(([x,z])=>`${x},${-z}`).join(' '),fill:'none',stroke:colors.unchecked,'stroke-width':path.kind==='door'?.85:.55,'stroke-dasharray':'1 1',class:'route','data-check':path.id});
    const title=svgEl('title',{});title.textContent=`${path.label} · unchecked`;p.appendChild(title);p.addEventListener('click',e=>{e.stopPropagation();inspect(path);});lines.set(path.id,p);routeLayer.appendChild(p);
    const points:Vector3[]=[];for(let i=1;i<path.points.length;i++){const[a,b]=[path.points[i-1],path.points[i]],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);let y=path.heights?.[0]??groundHeight(a[0],a[1],0);for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;y=groundHeight(x,z,y);points.push(new Vector3(x,y+.09,z));}}
    const mesh=MeshBuilder.CreateLines(`ms_review_${path.id}`,{points},scene);mesh.color=Color3.FromHexString(colors.unchecked);mesh.isPickable=false;mesh.setEnabled(false);worldLines.set(path.id,mesh);
  }
  panel.querySelector<HTMLInputElement>('[data-action=paint]')!.onchange=e=>{paint=(e.target as HTMLInputElement).checked;for(const mesh of worldLines.values())mesh.setEnabled(paint);};
  const marker=svgEl('g',{'pointer-events':'none','data-position-marker':''});marker.appendChild(svgEl('circle',{r:1.8,fill:'#fff3bc',stroke:'#111','stroke-width':.6}));marker.appendChild(svgEl('path',{d:'M 0 -4 L -1.3 -1.8 L 1.3 -1.8 Z',fill:'#fff3bc'}));svg.appendChild(marker);
  const status=panel.querySelector<HTMLDivElement>('.status')!,checkButton=panel.querySelector<HTMLButtonElement>('[data-action=check]')!;let running=false,run=0;
  function updateStatus():void {const pass=[...results.values()].filter(r=>r.status==='pass').length,blocked=results.size-pass;status.textContent=`${running?'Checking… · ':''}${pass} pass · ${blocked} blocked · ${paths.length-results.size} unchecked`;}
  async function runChecks():Promise<void> {
    const token=++run;running=true;checkButton.disabled=true;results.clear();failureLayer.replaceChildren();panel.querySelector('.failures')!.replaceChildren();
    for(const[id,line]of lines){line.setAttribute('stroke',colors.unchecked);line.setAttribute('stroke-dasharray','1 1');line.querySelector('title')!.textContent='Unchecked';worldLines.get(id)!.color=Color3.FromHexString(colors.unchecked);}
    updateStatus();await scene.whenReadyAsync();let index=0;
    await new Promise<void>(resolve=>{const batch=()=>{
      if(token!==run){resolve();return;}const start=performance.now();
      while(index<paths.length&&performance.now()-start<12){const path=paths[index++],result=checkReviewPath(path,api);results.set(path.id,result);const line=lines.get(path.id)!;line.setAttribute('stroke',colors[result.status]);line.removeAttribute('stroke-dasharray');line.querySelector('title')!.textContent=`${path.label}: ${result.status}`;worldLines.get(path.id)!.color=Color3.FromHexString(colors[result.status]);
        if(result.status==='blocked'){
          for(const f of result.failures){const dot=svgEl('circle',{cx:f.x,cy:-f.z,r:1.25,fill:colors.blocked,stroke:'#170a0b','stroke-width':.35,tabindex:0,role:'button','aria-label':`Inspect blocked ${path.label}`});dot.addEventListener('click',()=>inspect(path,f));dot.addEventListener('keydown',e=>{if((e as KeyboardEvent).key==='Enter')inspect(path,f);});failureLayer.appendChild(dot);}
          const b=document.createElement('button');b.className='failure';b.textContent=`Blocked: ${path.label}`;b.onclick=()=>inspect(path);panel.querySelector('.failures')!.appendChild(b);
        }
      }
      updateStatus();if(index<paths.length)requestAnimationFrame(batch);else resolve();};requestAnimationFrame(batch);});
    if(token===run){running=false;checkButton.disabled=false;updateStatus();}
  }
  checkButton.onclick=()=>void runChecks();
  addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??''))return;if(e.code==='KeyM'){e.preventDefault();setOpen(panel.hidden===true);}if(e.code==='KeyC'){e.preventDefault();void runChecks();}});
  scene.onBeforeRenderObservable.add(()=>{
    const p=camera.position,d=camera.getForwardRay().direction,heading=Math.atan2(d.x,d.z)*180/Math.PI;
    marker.setAttribute('transform',`translate(${p.x},${-p.z}) rotate(${heading})`);
    panel.querySelector('.position')!.textContent=`You: ${p.x.toFixed(1)}, ${p.z.toFixed(1)} · floor ${(p.y-1.7).toFixed(1)}m`;
  });
  (window as unknown as Record<string,unknown>).__mausoleumReview={paths,results,destinations,runChecks,jumpTo:(id:string)=>{if(id==='dais'){moveDais();return;}const r=layout.rooms.find(r=>r.id===id);if(r)moveTo(r);},state:()=>({open:!panel.hidden,running,total:paths.length,pass:[...results.values()].filter(r=>r.status==='pass').length,blocked:[...results.values()].filter(r=>r.status==='blocked').length,unchecked:paths.length-results.size,paint})};
  (window as unknown as Record<string,unknown>).__dungeonReview=(window as unknown as Record<string,unknown>).__mausoleumReview;
  updateStatus();if(autoCheck)void runChecks();
}
