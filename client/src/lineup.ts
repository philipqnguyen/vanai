// Race lineup — a dev-only view at /?lineup that stands every race side by
// side on flat ground under even light.
//
// It exists because character work fails in a particular way: someone
// describes a silhouette in words, someone else writes numbers for it, and
// nobody looks at the result until it is in the game surrounded by fog,
// buildings and night lighting. This page is the shortest path from a change
// to a production body (its loader, fit or equipment) to a picture of what
// that change did. Change it, reload, look. Screenshot it and the same loop
// works for a reviewer who cannot run the client. The height in each label is
// the production body's (RACE_LOOK.h mirrors what each loader sets).
//
//   /?lineup                     every race, PLD, idling
//   /?lineup&job=BLM&anim=walk   another job, walking
//   /?lineup&view=three          three-quarter instead of front-on
//   /?lineup&race=nym            one race alone, filling the frame
//   /?lineup&gear=20             the job's level-20 guild set (default 50; none undresses)
//   /?lineup&drawn=1             weapons in hand, as in combat (default: sheathed)
//   /?lineup&face=female         the feminine bodies (Karrog and Rasha have one)
//   /?lineup&hair=dark_blue       every hair in one colour (appearance.ts HAIR_COLOURS)
import "./style.css";
import {
  ArcRotateCamera, Vector3, DynamicTexture, MeshBuilder, StandardMaterial,
  Color3, Mesh,
} from "@babylonjs/core";
import { initEngine, buildLineupScene, engine, scene } from "./scene";
import { buildAvatar, disposeAvatar, animateAvatar, placeOnGround, type AvatarNode } from "./entities";
import { RACES, RACE_LIST, JOB_LIST } from "./data";
import { NPC_WARDROBES, type NpcLook } from "./npc-outfits";
import { HAIR_COLOURS, type HairColour } from "./appearance";

// A job's guild sets by level, members' and masters' (npc-outfits.ts), so the
// Job buttons show the job dressed rather than in underwear.
const jobSets = (job: string): Record<string, NpcLook> => {
  const j = job.toLowerCase(), out: Record<string, NpcLook> = {};
  for (const l of [...(NPC_WARDROBES[j]?.looks || []), ...(NPC_WARDROBES[`${j}-master`]?.looks || [])])
    out[l.b.match(/_(\d+)_body$/)?.[1] || l.b] = l;
  return out;
};

const SPACING = 2.4;
const VIEWS: Record<string, number> = {
  front: Math.PI / 2,
  three: Math.PI / 2 - 0.72,
  side: 0,
  back: -Math.PI / 2,
};
const ANIMS = ["idle", "walk", "run", "rest", "dead"];

interface Standing { race: string; av: AvatarNode; label: Mesh }

export function runLineup(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  let job = (params.get("job") || "PLD").toUpperCase();
  if (!JOB_LIST.includes(job)) job = "PLD";
  let anim = params.get("anim") || "idle";
  let view = params.get("view") || "front";
  const only = params.get("race");
  const drawn = params.get("drawn") === "1";
  const face = params.get("face") === "female" ? "female" : "male";
  const hairColour = (HAIR_COLOURS.includes(params.get("hair") as HairColour) ? params.get("hair") : "natural") as HairColour;
  // `look=b:rampart_cuirass,l:rampart_chausses,f:rampart_sabatons` dresses everyone
  const sets = jobSets(job);
  const gearNames = [...Object.keys(sets), "none"];
  let gear = params.get("gear") || "50";
  if (!gearNames.includes(gear)) gear = gearNames[gearNames.length - 2] || "none";
  const named = Object.fromEntries((params.get("look") || "").split(",").filter(Boolean).map((p) => p.split(":")));
  const look = params.get("look") ? named : gear === "none" ? {} : { ...sets[gear] };
  const races = only && RACE_LIST.includes(only) ? [only] : RACE_LIST;

  if (!ANIMS.includes(anim)) anim = "idle";
  if (!(view in VIEWS)) view = "front"; // side is alpha 0 — a truthiness test drops it

  initEngine(canvas);
  buildLineupScene();

  const span = (races.length - 1) * SPACING;
  const camera = new ArcRotateCamera(
    "lineup_cam", VIEWS[view], 1.34, races.length === 1 ? 4.2 : span * 0.6 + 4.6,
    new Vector3(0, 1.15, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 24;
  camera.lowerRadiusLimit = 1.5;

  // Name plates, drawn into the scene rather than the DOM so a screenshot of
  // the canvas alone is still self-describing.
  const label = (text: string, x: number, y: number): Mesh => {
    const tex = new DynamicTexture(`lbl_${text}`, { width: 512, height: 96 }, scene, true);
    tex.hasAlpha = true;
    tex.drawText(text, null, 66, "bold 44px Alegreya Sans, sans-serif", "#f2ead8", "transparent", true);
    const plane = MeshBuilder.CreatePlane(`lblp_${text}`, { width: 2.2, height: 0.41 }, scene);
    const mat = new StandardMaterial(`lblm_${text}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0, 0, 0);
    mat.opacityTexture = tex;
    mat.backFaceCulling = false;
    plane.material = mat;
    plane.position.set(x, y, 0);
    plane.billboardMode = Mesh.BILLBOARDMODE_Y;
    plane.isPickable = false;
    return plane;
  };

  let standing: Standing[] = [];
  const build = (): void => {
    standing.forEach((s) => { disposeAvatar(s.av); s.label.dispose(); });
    standing = races.map((race, i) => {
      const x = i * SPACING - span / 2;
      const av = buildAvatar(`lineup_${race}`, race, job, false, look, undefined, { face, hair_colour: hairColour });
      if (drawn) av.combatUntil = Infinity;
      placeOnGround(av.root, x, 0);
      return {
        race,
        av,
        label: label(`${RACES[race]?.name || race}  ${av.raceH.toFixed(2)}m`, x, av.raceH + 0.42),
      };
    });
  };
  build();
  // dev: frame and pose from the console or a QA script without a reload
  if (import.meta.env.DEV) Object.assign(window, { __lineup: { camera, scene, avatars: () => standing.map((s) => s.av) } });

  // ---- controls ----
  const bar = document.createElement("div");
  bar.id = "lineup-bar";
  const row = (title: string, items: string[], cur: string, pick: (v: string) => void): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "lineup-row";
    wrap.innerHTML = `<span class="lineup-label">${title}</span>`;
    items.forEach((it) => {
      const b = document.createElement("button");
      b.textContent = it;
      b.className = it === cur ? "sel" : "";
      b.addEventListener("click", () => pick(it));
      wrap.appendChild(b);
    });
    return wrap;
  };
  const setParam = (k: string, v: string): void => {
    const q = new URLSearchParams(location.search);
    q.set(k, v);
    q.set("lineup", "1");
    q.delete("look"); // a button replaces a hand-named look
    location.search = q.toString();
  };
  const renderBar = (): void => {
    bar.innerHTML = "";
    bar.appendChild(row("Job", JOB_LIST, job, (v) => setParam("job", v)));
    bar.appendChild(row("Gear", gearNames, params.get("look") ? "" : gear, (v) => setParam("gear", v)));
    bar.appendChild(row("Motion", ANIMS, anim, (v) => setParam("anim", v)));
    bar.appendChild(row("View", Object.keys(VIEWS), view, (v) => setParam("view", v)));
    bar.appendChild(row("People", ["all", ...RACE_LIST], only || "all", (v) => setParam("race", v === "all" ? "" : v)));
    bar.appendChild(row("Body", ["male", "female"], face, (v) => setParam("face", v)));
    bar.appendChild(row("Hair", HAIR_COLOURS, hairColour, (v) => setParam("hair", v)));
  };
  renderBar();
  document.body.appendChild(bar);

  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    standing.forEach((s) => animateAvatar(s.av, anim, dt, now / 1000));
    scene.render();
  });
}
