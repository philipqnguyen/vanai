type Positioned = {x:number;z:number;y?:number};

// Unlabelled ground NPCs still have a rendered height. In a canopy town,
// horizontal proximity alone would let the upstairs player talk through wood.
export function interactionHeight(target:Positioned, ground:(x:number,z:number)=>number):number {
  return target.y ?? ground(target.x,target.z);
}
export function onInteractionFloor(playerY:number,target:Positioned,ground:(x:number,z:number)=>number):boolean {
  return Math.abs(playerY-interactionHeight(target,ground)) <= 1.4;
}
