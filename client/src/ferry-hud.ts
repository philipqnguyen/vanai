import {ferryCountdown,ferryNow,ferryPhase,syncFerryClock,type FerryStatus} from './ferry-clock';
import {send} from './net';
import {ZONES} from './data';
let status:FerryStatus|null=null,menuOpen=false,lastText='';
// The panel stacks in the HUD's right column, between the minimap and Duties,
// so neither is covered; without that column (no HUD yet) it floats over #app.
// The froute/fdetail/fnote classes let a short window fold it to a compact form
// (style.css #right-col.tight); the detail's title keeps its full text then.
function panel(){let el=document.getElementById('ferry-panel');if(!el){el=document.createElement('section');el.id='ferry-panel';el.setAttribute('aria-label','Gulf Ferry');const col=document.getElementById('right-col'),mm=document.getElementById('minimap-cluster');if(col&&mm?.parentElement===col)mm.after(el);else if(col)col.prepend(el);else document.getElementById('app')!.append(el);}return el;}
export function clearFerryHud(){status=null;menuOpen=false;document.getElementById('ferry-panel')?.remove();lastText='';}
export function updateFerryStatus(next:FerryStatus,open=false){if(!status||next.server_time>=status.server_time){status=next;syncFerryClock(next.server_time);}menuOpen ||= open;if(next.registered||next.voyage)menuOpen=true;renderFerryHud();}
export function renderFerryHud(){
 if(!status||!menuOpen)return;
 const s=status,now=ferryNow(),phase=ferryPhase(now),aboard=!!s.voyage,registered=s.registered&&!aboard;
 const deadline=aboard?s.voyage!.arrival:registered?s.next_departure:phase.docked?phase.next_departure:phase.arrival;
 const destination=ZONES[s.destination]?.name||s.destination;
 const text=registered&&now>=deadline?'Boarding passengers…':aboard?`Arrival in ${ferryCountdown(deadline,now)}`:registered?`Departure in ${ferryCountdown(deadline,now)}`:phase.docked?`Docked · departs in ${ferryCountdown(deadline,now)}`:`Next arrival in ${ferryCountdown(deadline,now)}`;
 const signature=[text,registered,aboard,s.on_dock,s.fare].join('|');if(signature===lastText)return;lastText=signature;
 const p=panel();p.replaceChildren();
 const heading=document.createElement('h3');heading.textContent='The Gulf Ferry';p.append(heading);
 const route=document.createElement('p');route.className='froute';route.textContent=`To ${destination}`;p.append(route);
 const timer=document.createElement('strong');timer.textContent=text;p.append(timer);
 const detail=document.createElement('p');detail.className='fdetail';detail.textContent=aboard?'Fare paid. Walk the deck and talk with your fellow passengers.':registered?`Registered · ${s.fare} gold will be charged at departure. Stay on the dock and keep enough gold.`:`Passage: ${s.fare} gold each way, charged at departure. Seven minutes at sea.`;detail.title=detail.textContent;p.append(detail);
 const button=(label:string,action:()=>void,kind='')=>{const b=document.createElement('button');b.className=`btn sm${kind}`;b.textContent=label;b.onclick=()=>{b.blur();action();};p.append(b);return b;};
 if(registered)button('Cancel boarding',()=>send('ferry_cancel'));
 else if(!aboard&&phase.docked){const b=button(`Confirm boarding · ${s.fare} gold`,()=>send('ferry_board',{departure:phase.next_departure}),' gold');b.disabled=!s.on_dock;if(!s.on_dock){const note=document.createElement('p');note.className='fnote';note.textContent='Stand on the dock and speak to the dockmaster.';p.append(note);}}
 if(!registered&&!aboard)button('Close',()=>{menuOpen=false;p.remove();lastText='';});
}
