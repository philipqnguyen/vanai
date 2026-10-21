import type { ArcRotateCamera } from '@babylonjs/core';
import { cameraRoomAt, cameraObstruction, ceilingAbove, groundHeight, scene, cameraDungeon } from './scene';
import { cameraRoomTarget, cameraRoomExit, cameraRoomDistance, cameraAngleDelta, easeCamera, type CameraPoint } from './camera_geometry';

export interface FollowSubject extends CameraPoint { heading: number; firstPerson?: boolean; targetHeight?: number }

/** Shared by play and the walking review; solve after Babylon consumes orbit/zoom input. */
export function attachFollowCamera(camera: ArcRotateCamera, subject: () => FollowSubject, visibility?: (show: boolean) => void) {
  let outdoorRadius = camera.radius, indoorRadius = 1.65, lastRadius = camera.radius;
  let lastAlpha = camera.alpha, lastBeta = camera.beta, indoors = false, alignment = 0, entryHeading = 0, leaving = false;
  camera.minZ = .05;
  camera.lowerRadiusLimit = .01; // collision may briefly require a head-height view at a threshold
  camera.panningSensibility = 0;
  const inspect = () => ({ indoors, outdoorRadius, indoorRadius });
  camera.onAfterCheckInputsObservable.add(() => {
    const p = subject(), dt = Math.min(.1, scene.getEngine().getDeltaTime()/1000);
    const room = cameraRoomAt(p.x,p.z,p.y), nearRoom = room ?? cameraRoomAt(p.x,p.z,p.y,3.5);
    // Large living-tree rooms need enough distance to frame the actual avatar.
    // Keep indoor zoom proportional; existing rooms retain their current feel.
    const roomScale = (nearRoom?.cameraRadius ?? 1.65) / 1.65;
    const nowInside = !!room || cameraDungeon();
    const manualOrbit = Math.abs(cameraAngleDelta(lastAlpha,camera.alpha)) > .001 || Math.abs(lastBeta-camera.beta) > .001;
    const zoom = camera.radius-lastRadius;
    if (Math.abs(zoom) > .0001) {
      if (indoors) indoorRadius = Math.max(.7,Math.min(2.4,indoorRadius+zoom/roomScale));
      else outdoorRadius = Math.max(2.2,Math.min(camera.upperRadiusLimit ?? 30,outdoorRadius+zoom));
    }
    if (nowInside && !indoors) { alignment = .65; entryHeading = -p.heading-Math.PI/2; }
    if (manualOrbit) alignment = 0;
    if (alignment > 0 && nowInside) {
      camera.alpha += cameraAngleDelta(camera.alpha,entryHeading)*(1-Math.exp(-dt*9));
      camera.beta = easeCamera(camera.beta,1.4,dt,9);
      alignment -= dt;
    }
    if (indoors && !nowInside) leaving = true;
    if (!nearRoom || nowInside) leaving = false;
    indoors = nowInside;
    const close = nowInside || !!nearRoom;
    // Pull almost to eye level before crossing the jamb, so keeping the lens
    // inside on the next frame does not require a sudden metre-long jump.
    const roomRadius = indoorRadius*roomScale;
    const approach = !nowInside && nearRoom && !leaving
      ? .06+(roomRadius-.06)*Math.max(0,Math.min(1,(Math.max(cameraRoomDistance(nearRoom,p),(nearRoom.y0-p.y)*.5)-1.3)/2.2))
      : roomRadius;
    const desired = p.firstPerson ? .05 : close ? Math.min(outdoorRadius,approach) : outdoorRadius;
    camera.radius = easeCamera(lastRadius,desired,dt,desired < lastRadius ? 22 : close ? 8 : 4);
    const lookUp = Math.max(0,Math.min(1,(camera.beta-Math.PI/2)/.6));
    const targetHeight = close ? Math.min(nearRoom?.cameraTargetHeight ?? 1.55,p.targetHeight ?? Infinity) : (p.targetHeight ?? 2)+lookUp*1.5;
    camera.target.set(p.x,easeCamera(camera.target.y,p.y+targetHeight,dt,14),p.z);
    // Avoid trailing below the current stair/floor or aiming into its ceiling.
    camera.target.y = Math.max(p.y+.35,camera.target.y);
    const ceiling = ceilingAbove(p.x,p.z,p.y);
    if (ceiling !== null) camera.target.y = Math.min(camera.target.y,ceiling-.22);
    if (room) {
      const target = cameraRoomTarget(room,camera.target,.23);
      camera.target.set(target.x,target.y,target.z);
    }
    const direction = { x: Math.cos(camera.alpha)*Math.sin(camera.beta), y: Math.cos(camera.beta), z: Math.sin(camera.alpha)*Math.sin(camera.beta) };
    let safe = camera.radius;
    if (room) safe = Math.min(safe,cameraRoomExit(room,camera.target,direction,.18));
    const t = camera.target, end = { x: t.x+direction.x*safe, y: t.y+direction.y*safe, z: t.z+direction.z*safe };
    const obstacle = cameraObstruction(t.x,t.y,t.z,end.x,end.y,end.z,close);
    if (obstacle !== null) safe = Math.min(safe,obstacle);
    // Check along the current ray, not last frame's camera position. This also
    // keeps the near plane above upper floors and sloping stair treads.
    const steps = Math.ceil(safe/.1);
    for (let i = 1; i <= steps; i++) {
      const distance = safe*i/steps, x = t.x+direction.x*distance, z = t.z+direction.z*distance;
      const y = t.y+direction.y*distance;
      if (y < groundHeight(x,z,p.y)+.18) { safe = safe*(i-1)/steps; break; }
    }
    // Obstruction safety is immediate; only moving back out is eased.
    camera.radius = Math.max(.01,Math.min(camera.radius,safe));
    visibility?.(!p.firstPerson && camera.radius >= (nearRoom?.cameraHideBelow ?? .6));
    lastRadius = camera.radius; lastAlpha = camera.alpha; lastBeta = camera.beta;
  });
  return { inspect };
}
