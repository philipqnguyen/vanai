// Zone preview — a dev-only view at /?zone=<key> that builds any zone with no
// account, no server and no character.
//
// It exists for the same reason ?lineup does, one scale up. Zone art fails when
// someone changes a scatter table, cannot be bothered to log in, walk across
// three regions and wait for night, and so ships a number nobody looked at.
// CC0-ASSETS.md is largely a list of bugs that shipped exactly that way --
// including a standing-stone glade that was verified somewhere else and then
// moved back to a position it had never been seen at.
//
//   /?zone=mirefen                 free camera over the fen
//   /?zone=hush&daytime=0.25       pinned to noon (?daytime is honoured as usual)
//   /?zone=barrow&at=40,-110       drop the camera somewhere specific
//   /?zone=emberdeep&eye=8         eye height in metres (default 6)
//   /?zone=lochveil&tour           orbit the zone slowly, for a look at everything
//   /?zone=barrow&at=40,-110&look=0,0   aim the camera as well as place it
//
// It also carries the annotation tools (see annotate.ts): circle, box, stroke
// or lasso an area, write what is wrong with it, and save the batch with its
// screenshots to tmp/zone-notes/ for Claude to work from. Keys 1/2/3/0, G, S.
import "./style.css";
import { probeFloors, inspectHouses } from "./town";
import {
  ArcRotateCamera, UniversalCamera, Vector3, Color3, Mesh, MeshBuilder,
  StandardMaterial, DynamicTexture,
} from "@babylonjs/core";
import { initEngine, buildZone, updateCarpet, groundHeight, engine, scene, CITY_EXITS, isWalkable, zoneShape, resolveCollision, debugHit, circleColliders, colliders, boxColliders } from "./scene";
import { initAnnotate } from "./annotate";
import { capitalStats } from "./capital-architecture";
import { cityStats } from "./city-architecture";
import "./zones";
import { ZONES } from "./data";

export function runZoneView(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const keys = Object.keys(ZONES);
  let key = params.get("zone") || "";
  if (!keys.includes(key)) {
    // an unknown key is nearly always a typo, and silently falling back to the
    // Greywold hides it — say what was asked for and what exists
    document.body.innerHTML =
      `<div style="font:15px/1.7 monospace;color:#f2ead8;background:#141a2e;padding:2rem">`
      + `<b>?zone=${key || "(missing)"}</b> is not a zone.<br><br>`
      + keys.map((k) => `<a style="color:#9fc6ff" href="?zone=${k}">${k}</a>`
        + ` <span style="opacity:.55">${(ZONES as any)[k].kind}, ${(ZONES as any)[k].size}m</span>`).join("<br>")
      + `</div>`;
    return;
  }

  initEngine(canvas, true); // preserveDrawingBuffer: annotation notes carry a screenshot
  buildZone(key);
  // Dev handle on the live scene, same spirit as window.__annotate: when a
  // material or an instance buffer is not doing what the code says it should,
  // guessing costs a rebuild each time and inspecting costs nothing.
  // cityStats: every city-architecture.ts kit's counters by id (cityStats.capital
  // is capitalStats, which the Capital's QA scripts read by that name).
  (window as unknown as Record<string, unknown>).__zv = { scene, ground: groundHeight, probeFloors, inspectHouses, cityExits: CITY_EXITS, walkable: isWalkable, capitalStats, cityStats };

  const def = (ZONES as any)[key];
  // the plate's detailed outline too, for an audit script that wants to walk
  // the rim line and ask what is walkable just outside it
  // ...and the colliders, because isWalkable is the terrain's answer only
  // (slope, water, levels): what a rim rock or a wall blocks is a collider,
  // and an audit that asks "can a player get past here" needs both
  const blocked = (x: number, z: number): boolean => { const [rx, rz] = resolveCollision(x - 0.2, z, x, z); return Math.abs(rx - x) > 1e-6 || Math.abs(rz - z) > 1e-6; };
  (window as unknown as Record<string, unknown>).__zv = { ...((window as unknown as Record<string, unknown>).__zv as object), shape: zoneShape(key), key, blocked, resolveCollision, debugHit, circleColliders, colliders, boxColliders };
  const size: number = def.size;
  const spawn = def.spawn || { x: 0, z: 0 };
  const at = (params.get("at") || "").split(",").map(Number);
  const [ax, az] = at.length === 2 && at.every((n) => !Number.isNaN(n)) ? at : [spawn.x, spawn.z];
  const mausoleumReview = import.meta.env.DEV && !!def.layout && !params.has('tour');
  const walking = (params.has("walk") || (mausoleumReview && params.has('review'))) && !params.has("tour");
  const eye = walking ? 1.7 : Number(params.get("eye")) || 6;

  // Two cameras, because the two questions are different. A walk-height fly
  // camera answers "does this read from the ground?", which is where scale
  // errors show; the orbit answers "is the whole zone dressed?".
  const tour = params.has("tour");
  let cam: ArcRotateCamera | UniversalCamera;
  let jumpReview: ((p:{x:number;z:number;y:number;lookX:number;lookZ:number})=>void) | undefined;
  if (tour) {
    cam = new ArcRotateCamera("zv_orbit", 0.9, 1.15, size * 0.62,
      new Vector3(0, 0, 0), scene);
    cam.attachControl(canvas, true);
    cam.wheelPrecision = 0.6;
    scene.onBeforeRenderObservable.add(() => { (cam as ArcRotateCamera).alpha += 0.0012; });
  } else {
    cam = new UniversalCamera("zv_fly", new Vector3(ax, groundHeight(ax, az) + eye, az), scene);
    cam.attachControl(canvas, true);
    cam.speed = 2.4;
    cam.angularSensibility = 900;
    cam.minZ = 0.2;
    cam.keysUp = [87, 38]; cam.keysDown = [83, 40];       // WASD + arrows
    cam.keysLeft = [65, 37]; cam.keysRight = [68, 39];
    cam.keysUpward = [69]; cam.keysDownward = [81];       // E / Q for height
    // a saved note stores where the camera was AND what it was pointed at;
    // without this half the reproduce URL puts you in the right spot facing
    // the wrong way, which is no reproduction at all
    const look = (params.get("look") || "").split(",").map(Number);
    if (look.length === 2 && look.every((n) => !Number.isNaN(n))) {
      cam.setTarget(new Vector3(look[0], params.has("looky") ? Number(params.get("looky")) : groundHeight(look[0], look[1]), look[1]));
    }
    jumpReview = p => {
      const camera=cam as UniversalCamera;
      camera.cameraDirection.setAll(0);camera.cameraRotation.setAll(0);
      camera.position.set(p.x,p.y+eye,p.z);camera.setTarget(new Vector3(p.lookX,p.y+eye,p.lookZ));
      canvas.focus();
    };
    if (walking) {
      const camera = cam as UniversalCamera;
      camera.minZ = .08;
      camera.keysUpward = []; camera.keysDownward = [];
      camera.inputs.attached.keyboard?.detachControl();
      const pressed = new Set<string>();
      addEventListener('keydown', e => { if (['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault(); pressed.add(e.code); });
      addEventListener('keyup', e => pressed.delete(e.code));
      addEventListener('blur', () => pressed.clear());
      let feet = groundHeight(ax,az);
      const placeReview=jumpReview;
      // The walking loop owns feet independently of camera.position. A review
      // teleport must update both, or the next frame restores the old floor.
      jumpReview=p=>{pressed.clear();feet=p.y;placeReview(p);};
      scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(.1,engine.getDeltaTime()/1000);
        const f = Number(pressed.has('KeyW'))-Number(pressed.has('KeyS'));
        const r = Number(pressed.has('KeyD'))-Number(pressed.has('KeyA'));
        const direction = camera.getForwardRay().direction; direction.y=0; direction.normalize();
        const move = new Vector3(direction.x*f+direction.z*r,0,direction.z*f-direction.x*r);
        if (move.lengthSquared()) {
          move.normalize().scaleInPlace(dt*(pressed.has('ShiftLeft')||pressed.has('ShiftRight')?5:2.5));
          const steps=Math.ceil(move.length()/.07);
          for(let i=0;i<steps;i++){
            const [x,z]=resolveCollision(camera.position.x,camera.position.z,camera.position.x+move.x/steps,camera.position.z+move.z/steps,feet);
            feet=groundHeight(x,z,feet);camera.position.set(x,feet+eye,z);
          }
        }
        camera.position.y=feet+eye;
      });
    }
    // Shift to sprint: a 680m zone is a long way at walking speed
    addEventListener("keydown", (e) => { if (e.key === "Shift") (cam as UniversalCamera).speed = 9; });
    addEventListener("keyup", (e) => { if (e.key === "Shift") (cam as UniversalCamera).speed = 2.4; });
  }
  cam.maxZ = 2000;

  // the blade carpet follows the player in game; here it follows the camera
  scene.onBeforeRenderObservable.add(() => {
    const p = cam.position;
    updateCarpet(p.x, p.z);
  });

  // A metre stick at the drop point. Scale is the single thing this view exists
  // to check and the thing prose is worst at, so the frame carries its own
  // ruler: bands of 1m, and a 1.8m mark at roughly a person's height.
  if (!tour) {
    const gy = groundHeight(ax, az);
    for (let i = 0; i < 10; i++) {
      const band = MeshBuilder.CreateCylinder(`zv_stick${i}`, { height: 1, diameter: 0.16 }, scene);
      band.position.set(ax + 2, gy + 0.5 + i, az + 2);
      const bm = new StandardMaterial(`zv_stickm${i}`, scene);
      bm.diffuseColor = Color3.Black();
      bm.emissiveColor = i === 1 ? Color3.FromHexString("#ff4d4d")   // 1-2m: a person
        : i % 2 ? Color3.FromHexString("#f2ead8") : Color3.FromHexString("#2a2a2a");
      bm.specularColor = Color3.Black();
      band.material = bm;
      band.isPickable = false;
    }
  }

  // HUD: zone, camera position and ground height, updated live. A screenshot of
  // the canvas is then self-describing, which is the whole point of ?lineup's
  // in-scene labels too.
  const hud = document.createElement("div");
  hud.style.cssText = "position:fixed;left:10px;top:10px;z-index:9;font:12px/1.6 ui-monospace,monospace;"
    + "color:#f2ead8;background:#141a2ecc;padding:8px 11px;border-radius:6px;white-space:pre;pointer-events:none";
  document.body.appendChild(hud);
  const nav = document.createElement("div");
  nav.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:9;font:11px/1.9 ui-monospace,monospace;"
    + "max-width:min(560px,60vw);color:#8fa4cc;background:#141a2ecc;padding:8px 11px;border-radius:6px";
  nav.innerHTML = keys.map((k) => `<a style="color:${k === key ? "#ffd479" : "#8fa4cc"};text-decoration:none;`
    + `margin-right:9px" href="?zone=${k}${tour ? "&tour" : ""}">${k}</a>`).join("");
  document.body.appendChild(nav);

  initAnnotate({ zone: key, size, camera: cam, canvas });
  if(mausoleumReview && walking && jumpReview){
    const place=jumpReview;
    void import('./mausoleum-review').then(({initMausoleumReview})=>
      initMausoleumReview(cam as UniversalCamera,place,params.has('review'),params.has('checkpassages'),key));
  }

  engine.runRenderLoop(() => {
    // buildZone() disposes the scene, so anything that rebuilds from the
    // console (a sweep over every zone, say) leaves this loop cameraless for a
    // frame. Skipping is quieter than a stack trace per frame.
    if (!scene.activeCamera) return;
    const p = cam.position;
    hud.textContent = `${key}  (${def.kind}, ${size}m)\n`
      + `x ${p.x.toFixed(0)}  z ${p.z.toFixed(0)}  eye ${(p.y - groundHeight(p.x, p.z)).toFixed(1)}m\n`
      + (tour ? "orbit — drag to steer" : walking ? "WASD walk · drag to look · Shift run" : "WASD move · Q/E down/up · Shift sprint");
    scene.render();
  });
  void Mesh; void DynamicTexture;
}
