import {JumpArc,JUMP_DURATION} from './jump.ts';

// The game owns the trajectory. Quaternius only adds a presentation phase;
// never delay liftoff or lengthen airtime to fit the source takeoff clip.
export const Q_JUMP = { contact:JUMP_DURATION, land:38/30 };
export class QuaterniusJumpArc extends JumpArc {
  phase(now:number):string|undefined {
    return this.airborne(now)?'jump:start':undefined;
  }
}
