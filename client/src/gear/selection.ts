export type GearLook={b?:string;l?:string;f?:string;h?:string;w?:string};
/** Unsupported bodies/items have no visual fallback; headgear is never loaded. */
export function selectEquipment<T extends {slot:string}>(body:string,look:GearLook,manifest:{body:string;items:Record<string,T>}):[string,T][]{
 if(body!==manifest.body)return [];
 return ([['body',look.b],['legs',look.l],['feet',look.f]] as const).flatMap(([slot,id])=>{
  const entry=id&&Object.hasOwn(manifest.items,id)?manifest.items[id]:undefined;
  return entry&&entry.slot===slot?[[id!,entry] as [string,T]]:[];
 });
}
