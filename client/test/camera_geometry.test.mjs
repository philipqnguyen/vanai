import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraBoxRay, cameraRoomHas, cameraRoomTarget, cameraRoomExit, easeCamera, cameraAngleDelta } from '../src/camera_geometry.ts';
const room = {cx:7,cz:-4,hx:3,hz:5,sin:Math.sin(.7),cos:Math.cos(.7),y0:10,y1:20};
test('a nearby thin wall stops the lens even within the old 2.4m blind spot',()=>{
 assert.deepEqual(cameraBoxRay([0,1.5,0],[0,0,1.65],[-2,0,.7],[2,3,.72]),[.7/1.65,.72/1.65]);
 assert.equal(cameraBoxRay([0,4,0],[0,0,1.65],[-2,0,.7],[2,3,.72]),null);
});
test('oriented rooms exclude outside corners and roofs, include upper storeys',()=>{
 assert.ok(cameraRoomHas(room,{x:7,y:17,z:-4}));
 assert.ok(!cameraRoomHas(room,{x:10.8,y:17,z:.5}));
 assert.ok(!cameraRoomHas(room,{x:7,y:21,z:-4}));
});
test('the camera stops inside rotated room walls for every orbit heading',()=>{
 const p={x:7,y:13,z:-4};
 for(let a=0;a<Math.PI*2;a+=.05){const d={x:Math.cos(a),y:.1,z:Math.sin(a)};const r=cameraRoomExit(room,p,d,.18);assert.ok(cameraRoomHas(room,{x:p.x+d.x*r,y:p.y+d.y*r,z:p.z+d.z*r}));}
});
test('tower camera remains inside its round wall, including diagonal views',()=>{
 const tower={...room,r:4};const p={x:10.7,y:13,z:-4};
 for(let a=0;a<Math.PI*2;a+=.05){const d={x:Math.cos(a),y:0,z:Math.sin(a)},r=cameraRoomExit(tower,p,d,.18);assert.ok(Math.hypot(p.x+d.x*r-7,p.z+d.z*r+4)<=3.821);}
});
test('threshold targets leave enough room for the near plane inside the jamb',()=>{
 const p={x:7+room.cos*2.99,y:12,z:-4-room.sin*2.99},t=cameraRoomTarget(room,p,.23);
 assert.ok(cameraRoomHas(room,t));
 const d={x:room.cos,y:0,z:-room.sin};assert.ok(cameraRoomExit(room,t,d,.18)>.049);
});
test('outdoor zoom recovery takes the same time at 30 and 120 fps',()=>{
 const run=fps=>{let r=1.65;for(let i=0;i<fps;i++)r=easeCamera(r,14,1/fps,4);return r};
 assert.ok(Math.abs(run(30)-run(120))<1e-10);assert.ok(run(30)>13 && run(30)<14);
 assert.ok(Math.abs(cameraAngleDelta(Math.PI-.1,-Math.PI+.1)-.2)<1e-10);
});
