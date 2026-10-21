/** The floor domain is shared data so geometry, encounters and server routing agree. */
export interface TombRoom { id: string; name: string; x: number; z: number; w: number; d: number; kind: string; y?: number }
export interface TombLayout { cell: number; rooms: TombRoom[]; corridors: number[][][]; walkways?: {id:string;name:string;points:number[][];y?:number}[]; obstacles?: {x:number;z:number;w:number;d:number}[] }
export function tombCells(layout: TombLayout): Map<string, TombRoom | null> {
  const cells = new Map<string, TombRoom | null>();
  for (const r of layout.rooms) for (let x=r.x;x<r.x+r.w;x++) for (let z=r.z;z<r.z+r.d;z++) cells.set(`${x},${z}`,r);
  for (const path of layout.corridors) for(let n=1;n<path.length;n++) {
    let [x,z]=path[n-1]; const [ex,ez]=path[n];
    if(x!==ex&&z!==ez) throw new Error('Mausoleum corridors must be orthogonal');
    const dx=Math.sign(ex-x),dz=Math.sign(ez-z);
    for(;;x+=dx,z+=dz) { if(!cells.has(`${x},${z}`))cells.set(`${x},${z}`,null); if(x===ex&&z===ez)break; }
  }
  return cells;
}

export interface TombEntrance { x: number; z: number; dx: number; dz: number; room: string }
export function tombEntrances(layout: TombLayout): TombEntrance[] {
  const cells=tombCells(layout),entries:TombEntrance[]=[];
  for(const [key,room] of cells){
    if(!room)continue;
    const [i,j]=key.split(',').map(Number);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next=`${i+dx},${j+dz}`;
      if(cells.has(next)&&!cells.get(next))entries.push({x:(i+dx/2)*layout.cell,z:(j+dz/2)*layout.cell,dx,dz,room:room.id});
    }
  }
  return entries;
}

