// Skill and spell effects preview -- a dev view at /?vfx that stands a caster,
// an ally and a monster in any zone, with no account and no server, and plays
// any ability's effect from a button. Same reason as ?lineup and ?zone=: an
// effect described in numbers is a guess until somebody looks at it, and in
// play it lasts a second in the middle of a fight.
//
//   /?vfx                                   the Summer Lakes' road, a BLM, a stag
//   /?vfx&job=WHM&race=nym                  another caster
//   /?vfx&zone=mausoleum&mob=hollow_warder  a dungeon's dark and a boss's size
//   /?vfx&play=stone_iv                     plays it once the bodies are dressed
//   /?vfx&daytime=0.9                       at night (scene.ts dayFrac's pin)
//
// The events are the server's own shapes (combat.rb push_event), so what plays
// here is what world.ts plays: spell-fx.ts fxEvent takes both.
// window.__vfx = { play(key), ready(), stats(), keys } for a script.
import "./style.css";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { initEngine, buildZone, groundHeight, standHeight, updateCarpet, engine, scene } from "./scene";
import "./zones";
import { buildAvatar, disposeAvatar, animateAvatar, buildMonsterMesh, animateMonster, flashAttack, flashCast, type AvatarNode, type Look } from "./entities";
import { actorDrawn } from "./actor-reveal";
import { ABILITIES, ZONES, JOB_LIST, PLAYABLE_RACES, MONSTERS } from "./data";
import { fxEvent, fxPrewarm, fxStats, bodyHeight, handsOf, type FxWorld } from "./spell-fx";
import { unlockAudio, sfx } from "./audio";

const WEAPON: Record<string, string> = { PLD: "worn_sword", SAM: "worn_katana", DRK: "worn_greatsword", BLM: "ash_staff", WHM: "worn_cudgel", MNK: "cloth_wraps" };

export function runSpellFxView(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const zoneKey = ZONES[params.get("zone") || ""] ? params.get("zone")! : "summerlakes";
  const zone = ZONES[zoneKey];
  const race = PLAYABLE_RACES.includes(params.get("race") || "") ? params.get("race")! : "aedri";
  let job = JOB_LIST.includes((params.get("job") || "").toUpperCase()) ? params.get("job")!.toUpperCase() : "BLM";
  const mobKey = MONSTERS[params.get("mob") || ""] ? params.get("mob")! : "gloamstag";

  initEngine(canvas, true);
  buildZone(zoneKey);
  fxPrewarm();

  const start = zone.start ?? zone.spawn ?? { x: 0, z: 0, h: 0 };
  // &turn= swings the arena round the arrival spot (radians), to find open ground
  const h0 = ((start.h ?? 0) as number) + Number(params.get("turn") ?? 0);
  const fwd = new Vector3(Math.sin(h0), 0, Math.cos(h0));
  const side = new Vector3(fwd.z, 0, -fwd.x);
  const at = (x: number, z: number) => new Vector3(x, standHeight(x, z, groundHeight(x, z)), z);
  // out from the arrival spot, which stands against a gate or a wall in most zones
  const out = Number(params.get("out") ?? 12);
  const ox = start.x + fwd.x * out, oz = start.z + fwd.z * out;
  const meAt = at(ox, oz);
  const allyAt = at(ox + side.x * 3.2 + fwd.x * 2, oz + side.z * 3.2 + fwd.z * 2);
  const mobAt = at(ox + fwd.x * 10, oz + fwd.z * 10);
  const face = (p: Vector3, q: Vector3) => Math.atan2(q.x - p.x, q.z - p.z);

  const dress = (j: string): AvatarNode => {
    const look: Look = { w: WEAPON[j], b: "traveler_tunic", l: "traveler_slops" };
    const av = buildAvatar("me", race, j, false, look);
    av.root.position.copyFrom(meAt);
    av.root.rotation.y = face(meAt, mobAt);
    return av;
  };
  let me = dress(job);
  const ally = buildAvatar("ally", race === "nym" ? "aedri" : "nym", "WHM", false, { w: WEAPON.WHM, b: "traveler_tunic", l: "traveler_slops" });
  ally.root.position.copyFrom(allyAt);
  ally.root.rotation.y = face(allyAt, mobAt);
  const mob = buildMonsterMesh("m_vfx", mobKey);
  mob.root.position.copyFrom(mobAt);
  mob.root.rotation.y = face(mobAt, meAt);

  const camera = new ArcRotateCamera("vfx_cam", 0, 1.22, 12.5, Vector3.Lerp(meAt, mobAt, 0.55).add(new Vector3(0, 1.2, 0)), scene);
  // off to the side of the line from caster to monster, both in frame, a
  // little above as the game's follow camera sits (&cam=a,b,r to move it)
  camera.alpha = Math.atan2(-fwd.z, -fwd.x) + 0.62;
  const cam = (params.get("cam") || "").split(",").map(Number);
  if (cam.length === 3 && cam.every(Number.isFinite)) { camera.alpha += cam[0]; camera.beta = cam[1]; camera.radius = cam[2]; }
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 20;
  camera.maxZ = 4000;

  const status = new Map<string, { kind: "sleep" | "stun"; until: number }>();
  const now = () => performance.now() / 1000;
  const fxWorld: FxWorld = {
    actor(id) {
      if (id === "me") return { node: me.root, height: me.raceH || 1.8, hands: () => handsOf(me.model?.root) };
      if (id === "ally") return { node: ally.root, height: ally.raceH || 1.8, hands: () => handsOf(ally.model?.root) };
      if (id === "m_vfx") return { node: mob.root, height: bodyHeight(mob.root, MONSTERS[mobKey].height_m ?? 1.6) };
      return null;
    },
    status(id, kind) { const s = status.get(id); return !!s && s.kind === kind && s.until > now(); },
    hasBuff() { return undefined; },
    listener: () => me.root.position,
    mine: (id) => id === "me",
  };
  const emit = (ev: Record<string, unknown>) => fxEvent(fxWorld, ev);

  /** an ability's events as combat.rb sends them */
  const play = (key: string) => {
    const ab = (ABILITIES as Record<string, any>)[key];
    if (!ab) return;
    if (ab.job !== job) { switchJob(ab.job); }
    const t = now();
    const resolve = () => {
      const eff = ab.effect;
      if (ab.kind === "ws") {
        flashAttack(me, now());
        emit({ k: "ws", src: "me", tgt: "m_vfx", dmg: 120, name: ab.name, element: ab.element });
        return;
      }
      if (ab.kind === "ja") {
        if (eff === "enmity") emit({ k: "ja", src: "me", tgt: "m_vfx", name: ab.name });
        else if (eff === "stun") { status.set("m_vfx", { kind: "stun", until: now() + (ab.duration || 3) }); emit({ k: "ja", src: "me", tgt: "m_vfx", name: ab.name, stun: true }); }
        else if (eff === "buff_def" || eff === "buff_dmg") emit({ k: "buff", src: "me", tgt: "me", name: ab.name });
        else emit({ k: "ja", src: "me", tgt: "me", name: ab.name });
        return;
      }
      flashAttack(me, now(), true);
      switch (eff) {
        case "damage": emit({ k: "spell", src: "me", tgt: "m_vfx", dmg: 90, name: ab.name, element: ab.element }); break;
        case "drain": emit({ k: "spell", src: "me", tgt: "m_vfx", dmg: 60, name: ab.name, element: ab.element }); emit({ k: "heal", src: "me", tgt: "me", amount: 48, name: ab.name }); break;
        case "mp_drain": emit({ k: "spell", src: "me", tgt: "m_vfx", name: ab.name, drain_mp: 20 }); break;
        case "sleep": status.set("m_vfx", { kind: "sleep", until: now() + (ab.duration || 20) }); emit({ k: "spell", src: "me", tgt: "m_vfx", name: ab.name, sleep: true }); break;
        case "heal": emit({ k: "heal", src: "me", tgt: "ally", amount: 80, name: ab.name }); break;
        case "cure": emit({ k: "heal", src: "me", tgt: "ally", amount: 0, name: ab.name }); break;
        case "hot": case "mp_regen": case "buff_def":
          emit({ k: "buff", src: "me", tgt: "me", name: ab.name }); emit({ k: "buff", src: "me", tgt: "ally", name: ab.name }); break;
        case "revive": emit({ k: "revive", src: "me", tgt: "ally", name: "Raise" }); break;
      }
    };
    if (ab.kind === "spell") {
      const ms = Math.round((ab.cast || 1.5) * 1000);
      emit({ k: "cast_start", src: "me", name: ab.name, ms });
      flashCast(me, t, ms / 1000);
      // the server's tick and the wire put the result a little after the bar
      setTimeout(resolve, ms + 120);
    } else resolve();
  };
  const extras: Record<string, () => void> = {
    "Skillchain (radiance)": () => { sfx.skillchain("radiance"); emit({ k: "sc", tgt: "m_vfx", name: "Fusion", dmg: 300, element: "radiance" }); },
    "Skillchain (shadow)": () => { sfx.skillchain("shadow"); emit({ k: "sc", tgt: "m_vfx", name: "Gravitation", dmg: 300, element: "shadow" }); },
    "Magic burst": () => { sfx.magicBurst(); emit({ k: "spell", src: "me", tgt: "m_vfx", dmg: 200, name: "Fire II", element: "radiance", burst: true }); },
    "Monster casts": () => emit({ k: "mcast", src: "m_vfx", name: "Writ of Compliance", ms: 1600 }),
    "Level up": () => { sfx.levelUp(); emit({ k: "levelup", tgt: "me" }); },
    "Clear statuses": () => { status.clear(); },
  };

  // ---- the panel
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:10px;top:10px;bottom:10px;width:250px;z-index:60;overflow:auto;"
    + "font:12px/1.5 ui-monospace,monospace;color:#f2ead8;background:#141a2ee0;padding:8px 10px;border-radius:6px";
  if (!params.has("clean")) document.body.appendChild(panel);
  const info = document.createElement("div");
  info.style.cssText = "position:fixed;left:10px;top:10px;z-index:60;font:12px/1.6 ui-monospace,monospace;"
    + "color:#f2ead8;background:#141a2ecc;padding:6px 10px;border-radius:6px;white-space:pre;pointer-events:none";
  if (!params.has("clean")) document.body.appendChild(info);
  const btn = (label: string, go: () => void, accent = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `display:block;width:100%;text-align:left;margin:2px 0;padding:3px 6px;font:12px ui-monospace,monospace;cursor:pointer;`
      + `color:#f2ead8;background:${accent ? "#3a2c18" : "#232a40"};border:1px solid ${accent ? "#c9a35c" : "#3a4466"};border-radius:4px`;
    b.addEventListener("click", go);
    return b;
  };
  const render = () => {
    panel.innerHTML = "";
    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px";
    for (const j of JOB_LIST) {
      const t = btn(j, () => { switchJob(j); render(); }, j === job);
      t.style.width = "auto";
      tabs.appendChild(t);
    }
    panel.appendChild(tabs);
    const list = Object.entries(ABILITIES as Record<string, any>).filter(([, a]) => a.job === job).sort((a, b) => a[1].lvl - b[1].lvl);
    for (const [key, a] of list) panel.appendChild(btn(`${String(a.lvl).padStart(2)} ${a.name}  ·${a.fx}`, () => play(key)));
    const all = btn(`▶ every ${job} ability`, () => {
      list.forEach(([key, a], i) => setTimeout(() => play(key), i * 3200 + (a.cast || 0) * 0));
    }, true);
    panel.appendChild(all);
    const h = document.createElement("div");
    h.textContent = "— moments —";
    h.style.cssText = "margin:8px 0 2px;opacity:.6";
    panel.appendChild(h);
    for (const [label, go] of Object.entries(extras)) panel.appendChild(btn(label, go));
  };
  const switchJob = (j: string) => {
    if (j === job) return;
    job = j;
    disposeAvatar(me);
    me = dress(j);
  };
  render();

  (window as unknown as Record<string, unknown>).__vfx = {
    play, extras, keys: Object.keys(ABILITIES), stats: fxStats,
    ready: () => actorDrawn(me) && actorDrawn(ally),
    cam: camera, scene: () => scene,
  };

  // a browser plays no sound before the page is clicked
  addEventListener("pointerdown", () => unlockAudio());
  addEventListener("keydown", () => unlockAudio());
  let played = !params.get("play");
  let last = performance.now();
  engine.runRenderLoop(() => {
    const nowMs = performance.now(), dt = Math.min(0.1, (nowMs - last) / 1000), t = nowMs / 1000;
    last = nowMs;
    animateAvatar(me, "idle", dt, t);
    animateAvatar(ally, "idle", dt, t);
    animateMonster(mob, false, dt, t);
    updateCarpet(meAt.x, meAt.z);
    if (!played && actorDrawn(me)) { played = true; setTimeout(() => play(params.get("play")!), 600); }
    const s = fxStats();
    info.textContent = `?vfx  ${zoneKey}  ${race} ${job}  vs ${mobKey}\n`
      + `cards made ${s.cards} (free ${s.free})  particle systems ${s.systems}  running ${s.runs}  auras ${s.lasting}\n`
      + `fps ${engine.getFps().toFixed(0)}  draws ${(engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? "?"}`;
    if (scene.activeCamera) scene.render();
  });
}
