import type {TransformNode} from '@babylonjs/core';

// Centres of the curled index/middle/ring fingers in hand-local metres. The
// exported wrist→knuckle interpolation put the shaft against the BACK of the
// hand. These fixed slot positions fit the grip hollow without touching any
// animated hand/finger bone, source curve, prop axis or approved blade roll.
export const AEDRI_GRIP = {
  male: {r:[-.03176,.09347,.00586],l:[.03176,.09347,.00586]},
  female: {r:[-.02592,.06866,.00476],l:[.02592,.06866,.00476]},
} as const;
export function fitAedriGrip(nodes:Map<string,TransformNode>,face:'male'|'female'):void {
  for(const side of ['l','r'] as const){
    const slot=nodes.get(`handslot.${side}`);
    const [x,y,z]=AEDRI_GRIP[face][side];
    if(slot)slot.position.set(x,y,z);
  }
}
