/** Scene-owned assets remain alive while any actor holds a lease. */
export class LeaseCache<T> {
 private entries=new Map<string,{value:Promise<T>;refs:number;last:number}>();private clock=0;private closed=false;
 private destroy:(value:T)=>void;private idleLimit:number;
 constructor(destroy:(value:T)=>void,idleLimit=16){this.destroy=destroy;this.idleLimit=idleLimit;}
 acquire(key:string,load:()=>Promise<T>){
  if(this.closed)throw Error('Resource cache disposed');
  let entry=this.entries.get(key);
  if(!entry){const fresh={value:Promise.resolve().then(load),refs:0,last:++this.clock};entry=fresh;this.entries.set(key,fresh);fresh.value.catch(()=>{if(this.entries.get(key)===fresh)this.entries.delete(key)});}
  entry.refs++;entry.last=++this.clock;let released=false;
  return {value:entry.value,release:()=>{if(released)return;released=true;entry!.refs--;entry!.last=++this.clock;this.trim();}};
 }
 private trim(){const idle=[...this.entries].filter(([,e])=>e.refs===0).sort((a,b)=>a[1].last-b[1].last);while(idle.length>this.idleLimit){const [key,e]=idle.shift()!;this.entries.delete(key);void e.value.then(this.destroy).catch(()=>{});}}
 dispose(){if(this.closed)return;this.closed=true;for(const e of this.entries.values())void e.value.then(this.destroy).catch(()=>{});this.entries.clear();}
 info(){return {entries:this.entries.size,active:[...this.entries.values()].filter(e=>e.refs>0).length};}
}
