/** Broad-nib painted capitals: explicit pen paths, not a UI font or distress filter. */
const letters:Record<string,string[]>={
 '’':['M3 1 L2.6 2.3'],
 A:['M1 8 L3 1 L5 8','M1.8 5.2 L4.3 5.2'],B:['M1 8 L1 1 Q5 .7 4.8 3 Q4.5 4.4 1 4.4','M1 4.4 Q5.7 4 5 6.4 Q4.7 8.2 1 8'],
 C:['M5 1.6 Q1 .1 1 4.5 Q1 9 5 7.4'],D:['M1 8 L1 1 Q5 .8 5 4.5 Q5 8.2 1 8'],E:['M5 1.3 Q1 0 1 4.5 Q1 9 5 7.6','M1 4.5 L4.5 4.5'],
 F:['M1 8 L1 1 L5 1.2','M1 4.1 L4.3 4.1'],G:['M5 1.6 Q1 .1 1 4.5 Q1 9 5 7.4 L5 4.6 L3.2 4.6'],H:['M1 1 L1 8','M5 1 L5 8','M1 4.4 L5 4.4'],
 I:['M2 1 L4 1','M3 1 L3 8','M2 8 L4 8'],K:['M1 1 L1 8','M5 1 L1 4.7 L5 8'],L:['M1 1 L1 7.8 Q3 8.3 5 7.6'],M:['M.6 8 L1 1 L3 5.2 L5 1 L5.4 8'],
 N:['M1 8 L1 1 L5 8 L5 1'],O:['M3 1 Q.6 1 .8 4.5 Q.7 8 3 8 Q5.3 8 5.2 4.5 Q5.4 1 3 1'],P:['M1 8 L1 1 Q5 .7 5 3 Q5 5 1 4.8'],
 R:['M1 8 L1 1 Q5 .7 5 3 Q5 5 1 4.8','M3 4.8 L5.3 8'],S:['M5 1.5 Q1 -.1 1 2.7 Q1 4 3.4 4.7 Q6 5.5 4.8 7.3 Q3.4 8.8 1 7.4'],T:['M.5 1.3 Q3 .6 5.5 1.3','M3 1 L3 8'],
 U:['M1 1 L1 6 Q1 8 3 8 Q5 8 5 6 L5 1'],V:['M.7 1 L3 8 L5.3 1'],W:['M.3 1 L1.6 8 L3 4 L4.4 8 L5.7 1'],X:['M.8 1 L5.2 8','M5.2 1 L.8 8'],Y:['M.6 1 L3 4.5 L5.4 1','M3 4.5 L3 8']};
export function craftLettering(ctx:CanvasRenderingContext2D,text:string,w:number,h:number,color:string){
 const chars=[...text.toUpperCase()],advance=(ch:string)=>ch===' '?3:ch==='·'?2:7,total=chars.reduce((n,ch)=>n+advance(ch),0),scale=Math.min((w*.85)/total,h*.095);
 ctx.save();ctx.translate((w-total*scale)/2,(h-9*scale)/2);ctx.scale(scale,scale);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=.16;ctx.lineCap='square';ctx.lineJoin='round';
 for(const ch of chars){if(ch==='·'){ctx.beginPath();ctx.arc(1,4.5,.35,0,Math.PI*2);ctx.fill();}else for(const path of letters[ch]??[]){const stroke=new Path2D(path);for(let nib=-.3;nib<=.3;nib+=.075){ctx.save();ctx.translate(nib,-nib*.6);ctx.stroke(stroke);ctx.restore();}}ctx.translate(advance(ch),0);}ctx.restore();
}
