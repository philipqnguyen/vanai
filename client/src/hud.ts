import {updateFerryStatus,renderFerryHud} from './ferry-hud';
import { loadingScreen } from "./loading-screen";
import { Vector3, ArcRotateCamera, Matrix } from "@babylonjs/core";
import { scene, worldObjects } from "./scene";
import { state, inventoryTicket, applyInventory } from "./state";
import { send, rest } from "./net";
import {
  ITEMS, ABILITIES, QUESTS, ZONES, JOBS, JOB_LIST, GEAR_SLOTS, SLOT_LABEL, MONSTERS,
  conColor, eligibleJobs, equipProblem,
} from "./data";
import { sfx, getVolumes, setVolume } from "./audio";
import { itemIcon, itemStrokeIcon, lpIcon, jobIcon, abilityStrokeIcon } from "./icons";
import { tpSegments, fmtRemain, liveRemain, buffTone, buffTitle, castFrac, liveEffects, partyRank, fitPartyRows, stackRewards } from "./hud_model";
import { renderMapWindow, resetMapView, tickMapWindow, showZoneOnMap, drawMinimapStatic, MM, MM_INK } from "./map";
import { dayFrac, groundHeight } from "./scene";
import {
  activeQuestDestinations, nearbyOffers, npcMarkerFor, npcPlace, objectiveMet, collectHave, questAwayZone, questCategory, questColor, questTag,
  questLive, questZoneKey, setQuestOrigin, storyStep, visiblePortals, zoneLabel, MAIN_COLOR, type QuestDest, type StoryStep,
} from "./quest_index";
import RECIPES from "@data/recipes.json";
import type { AvatarNode, MonsterNode } from "./entities";
import { actorDrawn, npcPresent } from "./actor-reveal";
import { npcTargetId, parseTargetId } from "./targeting";
import { initWindowDrag } from "./window-drag";
import { initAuctionHud, openAuctionHouse } from "./auction-hud";
import { initMailHud, renderMailWindow } from "./mail-hud";
import { pager } from "./pager";
import { pageOf, friendAction } from "./social_model";
import { initCourtHud, renderCourtWindow, courtCharacterLine, courtHeraldButtons, isCourtStationId, courtJournalGroup, courtJournalDetail, courtHasBounties, drawCourtMinimapBanner, courtVendorPriceHtml, courtRelicName, courtRelicMeta, courtRelicTip } from "./court-hud";
import { pillFor, routeOutgoing, nextSticky, isSticky, isTab, PLACEHOLDER, clampChatSize, type Sticky, type Tab } from "./chat_model";
import { getTracked, isTracked, toggleTracked, orderTracker, arrow8, fmtDist } from "./quest_track";
import { isFullscreen, toggleFullscreen, exitFullscreen } from "./fullscreen";
import {
  SLOTS, migrateLayout, fillLayout, swap, place, removeItem, slotFlags, isItemEntry, itemKeyOf,
  edgeDistance, RANGE, MARGIN,
  type Entry, type SlotFlags, type SlotInput,
} from "./hotbar_state";

/** The interact prompt's parts: the key to press, what it does, and to what. */
export interface InteractPrompt { key?: string | null; verb: string; name: string; note?: string }

export interface HudApi {
  addChat(channel: string, from: string, msg: string, to?: string): void;
  updateSelf(): void;
  updateTarget(): void;
  updateParty(): void;
  showDialog(msg: any): void;
  toast(text: string, kind: string): void;
  dutyToast(id: string, name: string, progress: number, count: number): void;
  refreshQuests(): void;
  refreshInventoryLater(): void;
  renderHotbar(): void;
  useHotbarSlot(i: number): void;
  startCastBar(name: string, ms: number): void;
  floatText(worldPos: Vector3, text: string, cls: string): void;
  showDeath(xpLost: number): void;
  hideDeath(): void;
  showRaiseOffer(from: string): void;
  showInvite(from: string): void;
  showGatePrompt(msg: any): void;
  hideGatePrompt(): void;
  showTradeInvite(from: string): void;
  renderTrade(msg: any): void;
  showLoading(on: boolean, name: string): void;
  setZoneName(name: string): void;
  setInteractPrompt(p: InteractPrompt | null): void;
  chatFocused(): boolean;
  focusChat(prefill?: string): void;
  replyToLastTell(): void;
  closeWindows(): void;
  toggleWindow(name: string): void;
  renderWhoList(msg: any): void;
  showExamine(msg: any): void;
  clearPlates(): void;
  removePlate(id: string): void;
  tickFrame(camera: ArcRotateCamera, myAvatar: AvatarNode | null,
            monsters: Map<string, MonsterNode>, avatars: Map<string, AvatarNode>,
            npcs: Map<string, AvatarNode>, myX: number, myZ: number,
            bodiless?: (id: string) => Vector3 | null): void;
}

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One dock key: the stroke icon, its keyboard hint, and the label as both the
// tooltip and the accessible name, since the button itself carries no text.
// tabindex=-1 so Space (jump) and Enter (chat) never re-press it.
function dockButton(attr: string, label: string, icon: string, key: string): string {
  return `<button type="button" class="btn dock" ${attr} tabindex="-1" aria-label="${label}" title="${label}">`
    + `${lpIcon(icon, 20)}${key ? `<span class="dkey">${key}</span>` : ""}</button>`;
}
const HOME_LABEL = "Return to home crystal";

// The global keydown handler in world.ts only steps aside for the chat input,
// so any other focusable field leaks its keystrokes into the world: "i" opens
// the Bags window, "m" the map, "/" yanks focus into the chat composer
// mid-word. Every field in the HUD has to stop that at the source.
function guardKeys<T extends HTMLElement>(input: T): T {
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return input;
}

// Build every HUD text field through this — it is guarded by construction.
function textInput(id: string, placeholder: string, onEnter?: () => void): HTMLInputElement {
  const inp = guardKeys(document.createElement("input"));
  inp.id = id;
  inp.placeholder = placeholder;
  inp.className = "hud-field";
  if (onEnter) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") onEnter(); });
  return inp;
}

let refreshInventoryFn: () => Promise<void> = async () => {};
// refreshInventoryLater's one waiting and one in-flight refresh
const invRefresh: { timer: ReturnType<typeof setTimeout> | null; busy: boolean; again: boolean } = { timer: null, busy: false, again: false };

export function initHud(opts: { refreshInventory: () => Promise<void> }): HudApi {
  refreshInventoryFn = opts.refreshInventory;
  const app = $("app");
  app.insertAdjacentHTML("beforeend", `
    <div id="hud">
      <section id="player-frame" class="lp-panel" aria-label="You">
        <div class="pemblem"><span class="pjob-icon"></span><span class="plvl lp-num"></span></div>
        <div class="pmain">
          <div class="prow"><span class="pname lp-name"></span><span class="pjob"></span></div>
          <div class="pgrid">
            <span class="lp-label">HP</span><div class="lp-meter hp hpbar"><i></i></div><span class="hpnum lp-num"></span>
            <span class="lp-label">MP</span><div class="lp-meter mp h7 mpbar"><i></i></div><span class="mpnum lp-num"></span>
            <span class="lp-label">TP</span><div class="tpsegs"><i></i><i></i><i></i></div><span class="tpnum lp-num"></span>
          </div>
        </div>
      </section>
      <div id="buff-row" aria-label="Effects on you"></div>
      <section id="target-frame" class="lp-panel" aria-label="Target">
        <div class="trow"><span class="tlv lp-num"></span><span class="tname lp-name"></span><span class="tcon"></span><span class="tside"></span></div>
        <div class="tmeter lp-meter foe h14"><i></i><b style="left:25%"></b><b style="left:50%"></b><b style="left:75%"></b><span class="tfar">out of range</span><span class="thp lp-num"></span></div>
        <div class="tfoot"><span class="teffects"></span><div class="tcast"><span class="tcname"></span><div class="lp-meter tp h4"><i></i></div><span class="tctime lp-num"></span></div></div>
      </section>
      <div id="right-col">
        <section id="minimap-cluster" aria-label="Where you are">
          <div class="mm-ring"><canvas id="minimap"></canvas><span class="mm-north">N</span><button type="button" class="mm-zoom in" aria-label="Zoom in" tabindex="-1">+</button><button type="button" class="mm-zoom out" aria-label="Zoom out" tabindex="-1">−</button></div>
          <div class="mm-caption lp-shadowed"><div id="zone-name"></div><div id="game-clock" class="lp-num"></div></div>
        </section>
        <section id="quest-tracker" aria-label="Duties"></section>
      </div>
      <div id="party-frame"></div>
      <section id="chat" aria-label="Chat">
        <div class="chat-grip n" data-axis="n"></div><div class="chat-grip e" data-axis="e"></div><div class="chat-grip ne" data-axis="ne" title="Drag to resize · double-click to reset"></div>
        <div class="chat-tabs" role="tablist" aria-label="Chat channels">
          <button type="button" class="lp-tab" role="tab" tabindex="-1" data-tab="all" aria-selected="true">All</button>
          <button type="button" class="lp-tab" role="tab" tabindex="-1" data-tab="party" aria-selected="false">Party</button>
          <button type="button" class="lp-tab" role="tab" tabindex="-1" data-tab="company" aria-selected="false">Company</button>
          <button type="button" class="lp-tab" role="tab" tabindex="-1" data-tab="tells" aria-selected="false">Tells<span class="unread lp-num"></span></button>
          <button type="button" class="lp-tab" role="tab" tabindex="-1" data-tab="combat" aria-selected="false">Combat</button>
        </div>
        <div id="chat-log" role="log" data-filter="all"></div>
        <div class="chat-compose">
          <button type="button" class="chat-pill" tabindex="-1" data-ch="say" title="Channel for plain lines (click to change)"><span class="plabel">Say</span>${lpIcon("chevDown", 10, 2.4)}</button>
          <input id="chat-input" autocomplete="off" spellcheck="false" placeholder="${PLACEHOLDER.say}" title="/say · /p party · /c company · &gt;&gt; Name tell · Ctrl+R reply · /rest · /who · /invite Name" />
        </div>
      </section>
      <nav id="hotbar" aria-label="Abilities"></nav>
      <div id="cast-bar"><div class="crow"><span class="label"></span><span class="ctime lp-num"></span></div><div class="bar"><div></div></div></div>
      <nav id="menu-buttons" aria-label="Menus">
        ${dockButton('data-w="inventory"', "Bags (I)", "bags", "I")}
        ${dockButton('data-w="character"', "Character (C)", "character", "C")}
        ${dockButton('data-w="quests"', "Journal (J)", "journal", "J")}
        ${dockButton('data-w="map"', "Map (M)", "map", "M")}
        ${dockButton('data-w="craft"', "Craft (K)", "craft", "K")}
        ${dockButton('id="social-btn"', "Social (O)", "social", "O")}
        ${dockButton('data-w="court"', "Court (L)", "court", "L")}
        ${dockButton('id="home-btn"', HOME_LABEL, "crystal", "")}
        ${dockButton('data-w="settings"', "Settings", "settings", "")}
      </nav>
      <div id="gold-readout" class="lp-num lp-shadowed">${lpIcon("coin", 14, 2)}<span class="gval"></span></div>
      <div id="xp-bar-wrap" aria-label="Experience"><div class="xpbar"><div></div></div><div class="xplabels lp-num"><span class="xplv"></span><span class="xpnum"></span></div></div>
      <div id="interact-prompt"></div>
      <div id="toasts" role="status" aria-live="polite"></div>
      <div id="gate-prompt" class="lp-prompt"><div class="phead"><span class="picon" style="color:var(--lp-brass)">${lpIcon("crystal", 20, 1.7)}</span><span class="gtitle lp-name">The Capital's Gate</span><span class="pcount lp-num"></span></div>
        <div class="pbar gate"><i></i></div><div class="gtext"></div><div class="gpending"></div><div class="gcount"></div><div class="btns">
        <button class="btn" id="gate-no">Turn back</button><button class="btn gold" id="gate-yes">Enter the empty city</button>
      </div></div>
      <div id="invite-prompt" class="lp-prompt" data-kind="party"><div class="phead"><span class="picon"></span><span class="itext"></span><span class="pcount lp-num"></span></div><div class="pbar"><i></i></div><div class="btns">
        <button class="btn" id="inv-no">Decline</button><button class="btn gold" id="inv-yes">Join</button>
      </div></div>
      <div class="window" id="win-inventory"><div class="whead"><span class="wtitle">Bags</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-character"><div class="whead"><span class="wtitle">Character</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window journal" id="win-quests"><div class="whead"><span class="wtitle">Journal</span>
        <div class="jtabs" role="tablist" aria-label="Journal sections"><button type="button" class="lp-tab" role="tab" tabindex="-1" data-jtab="active" aria-selected="true">Duties <span class="jcount lp-num"></span></button><button type="button" class="lp-tab" role="tab" tabindex="-1" data-jtab="done" aria-selected="false">Completed</button></div>
        <button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-vendor"><div class="whead"><span class="wtitle">Merchant</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-craft"><div class="whead"><span class="wtitle">Crafting</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-who"><div class="whead"><span class="wtitle">Player Search</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-friends"><div class="whead"><span class="wtitle">Friends</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-company"><div class="whead"><span class="wtitle">Company</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-examine"><div class="whead"><span class="wtitle">Examine</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-item"><div class="whead"><span class="wtitle">Gear</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-travel"><div class="whead"><span class="wtitle">Teleport Crystal</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window wide" id="win-map"><div class="whead"><span class="wtitle">Map of Ardenfell</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-settings"><div class="whead"><span class="wtitle">Settings</span><button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div class="window" id="win-trade"><div class="whead"><span class="wtitle">Trade</span><button class="wclose" id="trade-x" aria-label="Cancel the trade">${lpIcon("close", 14, 2.2)}</button></div><div class="wbody"></div></div>
      <div id="dialog-panel"><div class="dhead"><div class="dwho"><div class="dname"></div><div class="dtitle"></div></div><span class="dquest" hidden><span class="lp-diamond"></span><span class="dqname"></span></span></div><div class="dlines"></div><div class="dreward" hidden></div><div class="doffers" hidden></div><div class="dactions"></div></div>
      <div id="death-overlay"><div class="dtext">YOU HAVE FALLEN</div><div class="dsub"></div>
        <div id="raise-offer" class="lp-prompt"><div class="phead"><span class="picon" style="color:#9fdcb4">${lpIcon("cure", 20, 1.7)}</span><span class="rtext"></span></div><div class="btns">
          <button class="btn" id="raise-no">Not yet</button>
          <button class="btn gold" id="raise-yes">Accept the Raise</button>
        </div></div>
        <button class="btn gold" id="release-btn">Return to your home point</button></div>
    </div>
    <div id="player-ctx" class="ctx-menu">
      <div class="ctx-name"></div>
      <button class="ctx-item" data-action="invite">Invite to Party</button>
      <button class="ctx-item" data-action="trade">Trade</button>
      <button class="ctx-item" data-action="tell">Send Tell</button>
      <button class="ctx-item" data-action="examine">Examine</button>
      <button class="ctx-item" data-action="friend">Add Friend</button>
    </div>
    <!-- the tip sits beside the menus, not inside the HUD: a fixed #hud is its
         own stacking context, and a tip nested in it would be painted under
         the gear menu it describes -->
    <div id="item-tip"></div>
    <div id="gear-ctx" class="ctx-menu gear"></div>
    <div id="social-menu" class="ctx-menu">
      <div class="ctx-name">Social</div>
      <button class="ctx-item" data-w="who">Player Search</button>
      <button class="ctx-item" data-w="friends">Friends List</button>
      <button class="ctx-item" data-w="company">Company</button>
      <button class="ctx-item" data-w="mail">Mail<span class="mail-unread lp-num"></span></button>
      <button class="ctx-item" data-action="return" title="Teleport to your home crystal">Return to Home Point</button>
    </div>
  `);

  // chat input handling
  const input = $("chat-input") as HTMLInputElement;
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { input.classList.remove("on"); input.blur(); }
    // reply works from inside the composer too, mid-sentence
    if (e.code === "KeyR" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); api.replyToLastTell(); return; }
    if (e.key !== "Enter") return;
    // an unprefixed line goes to the sticky channel by taking its prefix
    const typed = input.value.trim();
    const raw = typed ? routeOutgoing(typed, stickyChannel) : "";
    input.value = "";
    input.classList.remove("on");
    input.blur();
    refreshPill();
    if (!raw) return;
    if (raw === "/cheer" || raw === "/wave") { window.dispatchEvent(new CustomEvent("vanai-emote", { detail: raw.slice(1) })); return; }
    if (raw.startsWith("/friend ")) { toggleFriend(raw.slice(8).trim()); return; }
    if (raw === "/who" || raw.startsWith("/who ")) { openWhoSearch(raw.slice(4).trim()); return; }
    if (raw === "/return") { send("teleport_home"); return; }
    if (raw === "/r" || raw === "/rest") { window.dispatchEvent(new CustomEvent("vanai-rest")); return; }
    if (raw === "/cutscene" || raw.startsWith("/cutscene ")) { window.dispatchEvent(new CustomEvent("vanai-cutscene", { detail: raw.slice(9).trim() })); return; }
    // ">> Name message" is what the reply shortcut and the Send Tell menu write;
    // the server already speaks "/tell Name message", so hand it over in that form
    if (raw.startsWith(">>")) { send("chat", { channel: "say", msg: `/tell ${raw.slice(2).trim()}` }); return; }
    if (raw.startsWith("/invite ")) send("party_invite", { name: raw.slice(8).trim() });
    else if (raw.startsWith("/trade ")) send("trade_invite", { name: raw.slice(7).trim() });
    else if (raw === "/leave") send("party_leave");
    else if (raw.startsWith("/p ")) send("chat", { channel: "party", msg: raw.slice(3) });
    else if (raw.startsWith("/say ")) send("chat", { channel: "say", msg: raw.slice(5) });
    else send("chat", { channel: "say", msg: raw });
  });

  initChat();
  document.querySelectorAll("#menu-buttons .btn[data-w]").forEach((b) => {
    b.addEventListener("click", () => api.toggleWindow((b as HTMLElement).dataset.w!));
  });
  // keep focus where it was, so Space (jump) and Enter never re-press a dock key
  document.querySelectorAll("#menu-buttons .btn").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  });
  // Social is three windows now, so its dock button raises a chooser
  $("social-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (socialMenuOpen) closeSocialMenu(); else openSocialMenu();
  });
  $("social-menu").querySelectorAll(".ctx-item").forEach((b) => {
    b.addEventListener("click", () => {
      const { w, action } = (b as HTMLElement).dataset;
      closeSocialMenu();
      // the chooser is already a second click, so the return needs no arming;
      // the server refuses it in combat or with no home crystal
      if (action === "return") { send("teleport_home"); return; }
      if (w && !$(`win-${w}`).classList.contains("on")) api.toggleWindow(w);
    });
  });
  document.querySelectorAll(".window .wclose").forEach((b) => {
    b.addEventListener("click", () => (b.closest(".window") as HTMLElement).classList.remove("on"));
  });
  // a window closed under the cursor (its X, a hotkey, Escape) never sends the
  // hovered row a mouseleave, so its tip would hang on; watch the class instead
  const closedWatch = new MutationObserver((muts) => {
    if (muts.some((m) => !(m.target as HTMLElement).classList.contains("on"))) hideItemTip();
  });
  document.querySelectorAll(".window").forEach((w) => closedWatch.observe(w, { attributes: true, attributeFilter: ["class"] }));
  initCourtHud(api);
  // the auction house and the mail lend hud.ts's item tips and inventory refresh
  const marketDeps = { itemTipHtml, attachTip, refreshInventory: () => refreshInventoryFn() };
  initAuctionHud(api, marketDeps);
  initMailHud(api, marketDeps);
  initWindowDrag($("hud"));
  initJournal();
  // keep focus where it was, so Space (jump) and Enter never re-press an answer
  $("dialog-panel").addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("button")) e.preventDefault();
  });
  initMinimapZoom();
  // Duties' room changes with the window and when the ferry panel joins,
  // leaves or changes height in the column. Only childList is watched: the
  // fit itself toggles the `hidden` attribute and a class, so it cannot
  // re-trigger the observer. The ferry panel redraws its countdown once a
  // second, so a refit waits for its height to actually change (-1: absent).
  window.addEventListener("resize", fitTrackerRows);
  window.addEventListener("resize", fitPartyFrame);
  // a resize changes the log's height, which leaves it scrolled mid-history
  // until the next line arrives; keep the newest line in view
  window.addEventListener("resize", () => { const log = $("chat-log"); log.scrollTop = log.scrollHeight; });
  let ferryH = -1;
  new MutationObserver((muts) => {
    if (!muts.some((m) => !(m.target as Element).closest?.("#quest-tracker, #minimap-cluster"))) return;
    const ferry = document.getElementById("ferry-panel");
    const h = ferry?.parentElement?.id === "right-col" ? ferry.offsetHeight : -1;
    if (h === ferryH) return;
    ferryH = h;
    fitTrackerRows();
  }).observe($("right-col"), { childList: true, subtree: true });
  // rows measured in the fallback face are taller or shorter than in Alegreya
  // Sans and Cinzel, so fit again once the web fonts have arrived
  document.fonts?.ready.then(() => { fitTrackerRows(); fitPartyFrame(); }).catch(() => { /* fit stays as measured */ });
  buildHotbar();
  // the chevron is rebuilt with the tracker, so one delegated listener serves it
  $("quest-tracker").addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".tcollapse")) return;
    tracker.collapsed = !tracker.collapsed;
    try { localStorage.setItem("vanai_duties_collapsed", tracker.collapsed ? "1" : "0"); } catch { /* unsaved */ }
    renderTracker();
  });
  $("quest-tracker").addEventListener("mousedown", (e) => {
    // keep focus where it was, so Space (jump) never re-presses the chevron
    if ((e.target as HTMLElement).closest(".tcollapse")) e.preventDefault();
  });

  // one player menu, shared by the world click and the who list
  $("player-ctx").querySelectorAll(".ctx-item").forEach((b) => {
    b.addEventListener("click", () => {
      const name = $("player-ctx").dataset.name || "";
      const action = (b as HTMLElement).dataset.action!;
      closePlayerMenu();
      if (name) runPlayerAction(action, name);
    });
  });
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (ctxOpen && !t.closest?.("#player-ctx")) closePlayerMenu();
    // a gear slot owns the click that opens its menu, so a press on one is
    // "outside" the old menu and reopens for the slot beneath the cursor
    if (gearMenuOpen && !t.closest?.("#gear-ctx")) closeGearMenu();
    // the dock button owns its own toggle, so a press on it is not "outside"
    if (socialMenuOpen && !t.closest?.("#social-menu, #social-btn")) closeSocialMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || (!ctxOpen && !socialMenuOpen && !gearMenuOpen)) return;
    e.stopPropagation(); // Escape closes the menu only — the target stays
    closePlayerMenu();
    closeSocialMenu();
    closeGearMenu();
  }, true);
  // Closing the Trade window is a cancel: the trade lives on the server, and a
  // window merely hidden would leave both of you "already trading".
  $("trade-x").addEventListener("click", () => send("trade_cancel"));
  $("release-btn").addEventListener("click", () => send("release"));
  // Return home: free, from anywhere, when nothing is trying to kill you.
  // Two clicks, because a mis-click here moves you across the world.
  // The icon stays put; arming shows as the brass glow and the "Go home?"
  // bubble (style.css #home-btn[data-armed]) and in the label.
  $("home-btn").addEventListener("click", () => {
    const b = $("home-btn");
    const label = (t: string) => { b.title = t; b.setAttribute("aria-label", t); };
    const disarm = () => { delete b.dataset.armed; label(HOME_LABEL); };
    if (b.dataset.armed) { disarm(); send("teleport_home"); return; }
    b.dataset.armed = "1"; label("Click again to go home");
    setTimeout(() => { if (b.dataset.armed) disarm(); }, 3000);
  });
  // Each prompt button is bound exactly once. Party and trade invites share
  // one card, so its data-kind (set by whichever invite is showing) decides
  // what the answer is sent as; nothing is re-bound per invite, so an answer
  // can never go out twice or to the wrong question.
  $("raise-yes").addEventListener("click", () => { send("raise_respond", { accept: true }); setRaiseOffer(false); });
  $("raise-no").addEventListener("click", () => { send("raise_respond", { accept: false }); setRaiseOffer(false); });
  $("gate-yes").addEventListener("click", () => {
    const yes = $("gate-yes") as HTMLButtonElement;
    if (yes.disabled) return;
    send("gate_respond", { accept: true });
    yes.disabled = true;
    yes.textContent = "Waiting for the party…";
  });
  $("gate-no").addEventListener("click", () => { send("gate_respond", { accept: false }); hideGatePrompt(); });
  const answerInvite = (accept: boolean) => {
    const ip = $("invite-prompt");
    if (!ip.classList.contains("on")) return;
    send(ip.dataset.kind === "trade" ? "trade_respond" : "party_respond", { accept });
    hideInvite();
  };
  $("inv-yes").addEventListener("click", () => answerInvite(true));
  $("inv-no").addEventListener("click", () => answerInvite(false));
  // keep focus where it was, so Space (jump) and Enter never re-press an answer
  document.querySelectorAll("#gate-prompt .btn, #invite-prompt .btn, #raise-offer .btn").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  });

  // UI click sounds
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest?.(".btn, #hotbar .slot, .charrow, .race, .job, .gearslot, .ctx-item, .lp-tab, .chat-pill, .lp-chipbtn, .jrow, .jtrack, .doffer")) sfx.uiClick();
  });

  $("hud").classList.add("on");
  return api;
}

// Settings is a menu of pages (Philip, 2026-10-15): the game is fullscreen, so
// Audio, Display and the way back to the title screen all live in it.
type SettingsPage = "menu" | "audio" | "display" | "title";
const SETTINGS_PAGES: { page: Exclude<SettingsPage, "menu">; label: string; note: string }[] = [
  { page: "audio", label: "Audio", note: "Master, music, effects and ambience volume" },
  { page: "display", label: "Display", note: "Fullscreen" },
  { page: "title", label: "Return to Title", note: "Leave the world for the character screen" },
];
function renderSettings(page: SettingsPage = "menu"): void {
  const win = $("win-settings");
  const body = win.querySelector(".wbody")!;
  const entry = SETTINGS_PAGES.find((p) => p.page === page);
  win.querySelector(".wtitle")!.textContent = entry ? entry.label : "Settings";
  body.innerHTML = "";
  if (page === "menu") {
    SETTINGS_PAGES.forEach(({ page: to, label, note }) => {
      const row = el("button", "setrow");
      (row as HTMLButtonElement).type = "button";
      row.innerHTML = `<span><span class="setname">${label}</span><span class="imeta">${note}</span></span><span class="setgo">${to === "title" ? "" : "›"}</span>`;
      row.addEventListener("click", () => renderSettings(to));
      body.appendChild(row);
    });
    return;
  }
  const back = el("button", "setback", "‹ Settings");
  (back as HTMLButtonElement).type = "button";
  back.addEventListener("click", () => renderSettings("menu"));
  body.appendChild(back);
  if (page === "audio") {
    const vols = getVolumes();
    (["master", "music", "sfx", "ambient"] as const).forEach((bus) => {
      const row = el("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:10px";
      row.innerHTML = `<span style="width:70px;color:var(--dim);font-size:12px;text-transform:capitalize">${bus}</span>`;
      const slider = guardKeys(document.createElement("input"));
      slider.type = "range";
      slider.min = "0"; slider.max = "1"; slider.step = "0.05";
      slider.value = String(vols[bus]);
      slider.style.flex = "1";
      slider.addEventListener("input", () => setVolume(bus, parseFloat(slider.value)));
      row.appendChild(slider);
      body.appendChild(row);
    });
    body.insertAdjacentHTML("beforeend",
      `<div class="imeta" style="margin-top:6px">All sound is synthesized live — nothing to load, nothing to license.</div>`);
  } else if (page === "display") {
    // fullscreen.ts: the world enters fullscreen; holding Escape leaves it, and this brings it back
    const full = el("button", "btn");
    const label = () => { full.textContent = isFullscreen() ? "Leave fullscreen" : "Play fullscreen"; };
    label();
    full.addEventListener("click", () => toggleFullscreen());
    // the page is rebuilt each time it opens: an old button lets go
    const onChange = () => { if (full.isConnected) label(); else document.removeEventListener("fullscreenchange", onChange); };
    document.addEventListener("fullscreenchange", onChange);
    body.appendChild(full);
    body.insertAdjacentHTML("beforeend", `<div class="imeta" style="margin-top:8px">Alt+Enter also switches it. Hold Escape to leave fullscreen.</div>`);
  } else {
    body.insertAdjacentHTML("beforeend",
      `<p style="margin:2px 0 14px;color:var(--lp-sub);font-size:13px;line-height:1.5">Leave the world and return to the title screen? You will leave fullscreen.</p>`);
    const btns = el("div");
    btns.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const stay = el("button", "btn", "Stay");
    stay.addEventListener("click", () => renderSettings("menu"));
    const go = el("button", "btn gold", "Return to Title");
    go.addEventListener("click", returnToTitle);
    btns.append(stay, go);
    body.appendChild(btns);
  }
}

// Back to the title screen: out of fullscreen, and a fresh page. The reload
// drops the world's connection (the server lets the character go as it does
// for a closed tab) and the boot lands a signed-in player on the character
// screen, so nothing of the world -- scene, sockets, timers -- is left running.
function returnToTitle(): void {
  exitFullscreen();
  location.reload();
}

// quest marker for an NPC: a glowing diamond in the duty's colour (brass
// main, teal side, violet guild). The Kit draws only the filled offer; the
// hollow one keeps the old "?" — the giver wants you back, or a talk target.
function npcQuestMarker(npcId: string): string {
  const m = npcMarkerFor(npcId);
  if (!m) return "";
  return `<div class="qmark ${m.glyph === "!" ? "offer" : "turnin"}" style="--qc:${m.color}"></div>`;
}

// ---------- nameplate + float text pools ----------
const plates = new Map<string, HTMLElement>();
function plateFor(id: string): HTMLElement {
  let p = plates.get(id);
  if (!p) {
    const plate = p = el("div", "nameplate");
    // A character beyond the nearest few has no body to click (world.ts
    // streams bodies), so its name takes the click instead: it targets them,
    // as a click on the body would.
    plate.addEventListener("click", () => {
      if (!plate.classList.contains("bodiless")) return;
      state.targetId = id.startsWith("npc_") ? npcTargetId(id.slice(4)) : id;
      api.updateTarget();
    });
    $("app").appendChild(p);
    plates.set(id, p);
  }
  return p;
}

let castState: { name: string; started: number; ms: number } | null = null;
let castTimeText = ""; // the cast bar's countdown, written only when it changes
// What each hotbar slot resolves to now: an ability payload, a carried
// consumable, or nothing. Indexed like the slot buttons.
type HotbarRec = { kind: "ab"; ab: any } | { kind: "item"; key: string; item: any; qty: number } | null;
let hotbarSlots: HotbarRec[] = [];
// A consumable just used, until the inventory that reflects it arrives (about
// 250 ms after inventory_dirty) or a second passes. Until then the old row
// still shows the old count. The server paces consumables itself (one a
// second, the "item" cooldown); this only keeps a double-click from earning a
// "Not yet." from it.
const itemLocks = new Map<string, { until: number; inv: any[] }>();
let charSheetSig = ""; // what the Character sheet was last drawn from
let currentVendorNpc: string | null = null;
let lastTellWith = ""; // whoever /r should answer

// ---------- chat: tabs, unread tells, the channel pill ----------
// Both choices are per-browser conveniences, so a blocked localStorage only
// costs remembering them.
function loadPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePref(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { /* unsaved */ }
}
const storedSticky = loadPref("vanai_chat_sticky");
let stickyChannel: Sticky = isSticky(storedSticky) ? storedSticky : "say";
const storedTab = loadPref("vanai_chat_tab");
let chatTab: Tab = isTab(storedTab) ? storedTab : "all";
let unreadTells = 0;

function renderUnread(): void {
  const b = document.querySelector("#chat .unread");
  if (!b) return;
  b.textContent = unreadTells ? String(Math.min(unreadTells, 99)) : "";
  b.classList.toggle("has", unreadTells > 0);
}

// The log filters by row class in CSS, so switching tabs never rebuilds it.
function setChatTab(tab: Tab): void {
  chatTab = tab;
  savePref("vanai_chat_tab", tab);
  const log = $("chat-log");
  log.dataset.filter = tab;
  document.querySelectorAll<HTMLElement>("#chat .chat-tabs .lp-tab").forEach((t) =>
    t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
  if (tab === "tells") { unreadTells = 0; renderUnread(); }
  log.scrollTop = log.scrollHeight;
}

// The pill names where the line in the composer is going: its prefix if it
// has one, else the sticky channel.
function refreshPill(): void {
  const input = $("chat-input") as HTMLInputElement;
  const p = pillFor(input.value, stickyChannel, lastTellWith);
  const pill = document.querySelector<HTMLElement>("#chat .chat-pill");
  if (!pill) return;
  pill.dataset.ch = p.ch;
  pill.querySelector(".plabel")!.textContent = p.label;
  input.placeholder = PLACEHOLDER[stickyChannel];
}

function initChat(): void {
  const input = $("chat-input") as HTMLInputElement;
  // Tabs and the pill never take focus (Space would re-press them) and never
  // leak a key into the world, the same as guardKeys.
  document.querySelectorAll<HTMLElement>("#chat .chat-tabs .lp-tab, #chat .chat-pill").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    guardKeys(b);
  });
  document.querySelectorAll<HTMLElement>("#chat .chat-tabs .lp-tab").forEach((t) => {
    t.addEventListener("click", () => setChatTab(t.dataset.tab as Tab));
  });
  document.querySelector("#chat .chat-pill")!.addEventListener("click", () => {
    stickyChannel = nextSticky(stickyChannel);
    savePref("vanai_chat_sticky", stickyChannel);
    refreshPill();
  });
  input.addEventListener("input", refreshPill);
  setChatTab(chatTab);
  renderUnread();
  refreshPill();
  initChatResize();
}

// The chat is resized by its top and right edges (it sits in the bottom-left
// corner, so those are the two that face open screen); a double-click on a
// grip puts it back. Each axis is saved only once it has been dragged, so an
// undragged one keeps the stylesheet's default and its narrow-screen cascade.
// The stylesheet caps both, so a size saved on a bigger screen still fits.
const CHAT_SIZE = "vanai_chat_size";
type ChatSize = { w?: number; h?: number };
function applyChatSize(size: ChatSize): void {
  const hud = $("hud");
  if (size.w) hud.style.setProperty("--chat-w", `${size.w}px`); else hud.style.removeProperty("--chat-w");
  if (size.h) hud.style.setProperty("--chat-log-user", `${size.h}px`); else hud.style.removeProperty("--chat-log-user");
}

function initChatResize(): void {
  const chat = $("chat"), log = $("chat-log");
  let size: ChatSize = {};
  try {
    const s = JSON.parse(loadPref(CHAT_SIZE) || "{}") as ChatSize;
    if (Number.isFinite(s.w)) size.w = s.w;
    if (Number.isFinite(s.h)) size.h = s.h;
  } catch { /* a garbled pref is the default size */ }
  applyChatSize(size);
  chat.querySelectorAll<HTMLElement>(".chat-grip").forEach((grip) => {
    const axis = grip.dataset.axis!;
    // the composer keeps focus through a drag
    grip.addEventListener("mousedown", (e) => e.preventDefault());
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const w0 = chat.offsetWidth, h0 = log.offsetHeight, sx = e.clientX, sy = e.clientY;
      grip.setPointerCapture(e.pointerId);
      chat.classList.add("resizing");
      const move = (ev: PointerEvent) => {
        if (ev.buttons === 0) { end(ev); return; }
        const c = clampChatSize(w0 + ev.clientX - sx, h0 - (ev.clientY - sy), innerWidth, innerHeight);
        // a corner drag that only went up must not pin the width (or the
        // reverse), which would stop the default following the window
        if (axis.includes("e") && ev.clientX !== sx) size.w = c.w;
        if (axis.includes("n") && ev.clientY !== sy) size.h = c.logH;
        applyChatSize(size);
        log.scrollTop = log.scrollHeight;
      };
      const end = (ev: PointerEvent) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        grip.removeEventListener("lostpointercapture", end);
        if (grip.hasPointerCapture(ev.pointerId)) grip.releasePointerCapture(ev.pointerId);
        chat.classList.remove("resizing");
        savePref(CHAT_SIZE, JSON.stringify(size));
        // the party frame's room is the screen above the chat
        fitPartyFrame();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
      grip.addEventListener("lostpointercapture", end);
    });
    grip.addEventListener("dblclick", () => {
      size = {};
      applyChatSize(size);
      savePref(CHAT_SIZE, "{}");
      log.scrollTop = log.scrollHeight;
      fitPartyFrame();
    });
  });
}

// ---------- player context menu ----------
let ctxOpen = false;

// Opened by a click on another explorer in the world, or on a row of a roster
// list. Never opens on yourself. `hide` drops actions the caller has no use
// for — the friends list already keeps its explorers close, so it hides "friend".
export function openPlayerMenu(name: string, clientX: number, clientY: number, hide: string[] = []): void {
  if (!name || name === state.self?.name) return;
  hideItemTip();
  const m = $("player-ctx");
  m.dataset.name = name;
  m.querySelector(".ctx-name")!.textContent = name;
  // every opening sets each item, so a hidden one comes back for the next
  m.querySelectorAll<HTMLElement>(".ctx-item").forEach((b) => {
    b.style.display = hide.includes(b.dataset.action!) ? "none" : "";
  });
  // the friend item adds a stranger and removes a friend, and says which
  const fa = friendAction(friendNames, name);
  const fb = m.querySelector<HTMLElement>('.ctx-item[data-action="friend"]')!;
  fb.textContent = fa.label;
  // a world click before any roster was opened: learn the list, then relabel
  // the item if the menu is still up for this explorer
  if (!friendsKnown) fetchSocial().then(() => {
    if (ctxOpen && m.dataset.name === name) fb.textContent = friendAction(friendNames, name).label;
  });
  m.classList.add("on");
  ctxOpen = true;
  // measure once shown, then keep the whole menu on screen
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(4, Math.min(clientX, window.innerWidth - r.width - 4))}px`;
  m.style.top = `${Math.max(4, Math.min(clientY, window.innerHeight - r.height - 4))}px`;
}

export function closePlayerMenu(): void {
  ctxOpen = false;
  const m = document.getElementById("player-ctx");
  if (!m) return;
  m.classList.remove("on");
  delete m.dataset.name;
}

// E on a targeted explorer has no cursor to open beneath, so the menu hangs off
// that explorer's nameplate — which the frame loop has already projected to CSS
// pixels. Off screen or not drawn this frame, it falls back to the middle.
export function openPlayerMenuAtEntity(entityId: string, name: string): void {
  const plate = plates.get(entityId);
  const shown = plate && plate.style.display !== "none";
  const r = shown ? plate!.getBoundingClientRect() : null;
  const x = r ? r.left : window.innerWidth / 2;
  const y = r ? r.bottom + 4 : window.innerHeight / 2;
  openPlayerMenu(name, x, y);
}

// ---------- social chooser (the dock's Social button) ----------
let socialMenuOpen = false;

// Sits directly above the dock button that raised it, nudged to stay on screen.
function openSocialMenu(): void {
  hideItemTip();
  const m = $("social-menu");
  const btn = $("social-btn");
  m.classList.add("on");
  socialMenuOpen = true;
  const r = m.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const left = Math.max(4, Math.min(b.right - r.width, window.innerWidth - r.width - 4));
  const top = Math.max(4, Math.min(b.top - r.height - 6, window.innerHeight - r.height - 4));
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
}

function closeSocialMenu(): void {
  socialMenuOpen = false;
  document.getElementById("social-menu")?.classList.remove("on");
}

function runPlayerAction(action: string, name: string): void {
  if (action === "invite") send("party_invite", { name });
  else if (action === "trade") send("trade_invite", { name });
  else if (action === "tell") api.focusChat(`>> ${name} `);
  else if (action === "examine") send("examine", { name });
  else if (action === "friend") toggleFriend(name, friendAction(friendNames, name).op);
}

// the one code path behind /friend (a toggle, no op), the player menu and the
// Player Search's Add Friend button (each naming the op it means)
function toggleFriend(name: string, op?: "add" | "remove"): Promise<void> {
  if (!name) return Promise.resolve();
  return rest.friendToggle(name, op).then((r: any) => {
    api.addChat("system", "", r.error || (r.already ? `${r.added} is already among your friends.`
      : r.added ? `${r.added} now walks among your friends.` : `${r.removed} removed from your friends.`));
    if (r.added) friendNames.add(String(r.added).toLowerCase());
    if (r.removed) friendNames.delete(String(r.removed).toLowerCase());
    // the roster we hold is stale the moment it changes
    socialCache = null;
    if ($("win-who").classList.contains("on") && lastWho) fillWhoResults($("who-results"), lastWho);
    if ($("win-friends").classList.contains("on")) renderFriends();
    if ($("win-company").classList.contains("on")) renderCompany();
  });
}

// ---------- the target frame ----------
// What the frame says about its target is worked out once, in updateTarget;
// the per-frame pass (tickTargetFrame) moves only what changes between
// updates: a monster's meter, range, cast, effects and whom it is hitting, the
// self meter, and an NPC's duty line.
const OBJECT_WHAT: Record<string, string> = {
  milestone: "Teleport Crystal",
  portal: "Passage",
  node: "Gathering",
  interactable: "Relic",
};
type TargetKind = "foe" | "self" | "pc" | "npc" | "obj";
interface TargetView {
  kind: TargetKind;
  name: string;
  con: string;
  tough: boolean;
  lv: { text: string; color: string | null } | null; // null colour = the chip's own tone
  side: string; // html
  meter: number | null; // HP %, or null for no meter at all
  hpTitle: string;
}
const hpOf = (hp: number, max: number) => (max > 0 ? Math.min(100, Math.max(0, (100 * hp) / max)) : 0);

function npcSide(npcId: string): string {
  const m = npcMarkerFor(npcId);
  if (!m) return "";
  // a filled diamond offers a duty; a hollow one wants it brought back or asked after
  return m.glyph === "!"
    ? `<span class="tquest" style="color:${m.color}"><span class="lp-diamond"></span>Has a duty for you</span>`
    : `<span class="tquest" style="color:${m.color}"><span class="lp-diamond hollow"></span>Wants a word</span>`;
}

function targetView(tid: string): TargetView | null {
  const s = state.self;
  if (!s) return null;
  const base = { tough: false, lv: null, side: "", meter: null, hpTitle: "" };
  const mob = state.monsters.get(tid);
  if (mob) {
    const diff = mob.level - s.level;
    const tough = diff >= 2; // the nameplate's threshold for the orange name
    const con = conColor(diff);
    // the design draws an even match in plain parchment and gives the tough
    // chip its own orange; only easier foes take the con colour
    const color = tough || diff >= -1 ? null : con.color;
    return { ...base, kind: "foe", name: mob.name, con: con.label, tough, lv: { text: `Lv ${mob.level}`, color }, meter: mob.hpPct };
  }
  if (tid === `p${s.charId}`) {
    return { ...base, kind: "self", name: s.name, con: `${s.job} ${s.level}`, side: "You",
      meter: hpOf(s.hp, s.maxHp), hpTitle: `HP ${s.hp}/${s.maxHp}` };
  }
  const pm = state.party.find((m: any) => m.id === tid);
  const rp = state.players.get(tid);
  if (rp) {
    const side = rp.dead || pm?.dead ? `<span class="tfallen">Fallen</span>`
      : pm ? `<span class="tparty">In your party</span>` : "";
    // a stranger's HP is not on the wire, so no meter rather than a fake full one
    return { ...base, kind: "pc", name: rp.name, con: `${rp.job} ${rp.level}${rp.title ? ` · ${rp.title}` : ""}`, side,
      meter: pm ? hpOf(pm.hp, pm.max_hp) : null, hpTitle: pm ? `HP ${pm.hp}/${pm.max_hp}` : "" };
  }
  if (pm) {
    // a party member with no avatar here: in another zone, or crossing between
    // them (and then the hp we hold is a stale snapshot, so no meter)
    const side = pm.away ? "between wards"
      : pm.zone && pm.zone !== state.zone ? `in ${esc(ZONES[pm.zone]?.name || pm.zone)}`
      : `<span class="tparty">In your party</span>`;
    return { ...base, kind: "pc", name: pm.name, con: `${pm.job} ${pm.level}`,
      side: pm.dead && !pm.away ? `<span class="tfallen">Fallen</span> · ${side}` : side,
      meter: pm.away ? null : hpOf(pm.hp, pm.max_hp), hpTitle: pm.away ? "" : `HP ${pm.hp}/${pm.max_hp}` };
  }
  const t = parseTargetId(tid);
  if (t.kind === "npc") {
    const npc = (ZONES[state.zone]?.npcs || []).find((n: any) => n.id === t.id);
    return npc ? { ...base, kind: "npc", name: npc.name, con: npc.title || "Townsfolk", side: npcSide(t.id) } : null;
  }
  if (t.kind === "object") {
    const o = worldObjects.find((w) => w.id === t.id);
    return o ? { ...base, kind: "obj", name: o.name, con: isCourtStationId(o.id) ? "Audience hall" : OBJECT_WHAT[o.kind] || "Object" } : null;
  }
  return null;
}

// A monster is a duty target while a live, unmet kill objective names it.
// Walks only the quests you hold, so it is cheap enough at 4 Hz.
function isDutyTarget(mobKey: string): boolean {
  for (const [k, st] of state.quests) {
    if (st.status !== 1) continue;
    const obj = QUESTS[k]?.objective;
    if (obj?.type === "kill" && (obj.targets || []).includes(mobKey) && questLive(k) && !objectiveMet(k)) return true;
  }
  return false;
}

// Target of target: you, an explorer in the zone, or a party member.
function totHtml(target: string | null): string {
  if (!target) return "";
  const s = state.self;
  const who: { name: string; job: string } | undefined = s && target === `p${s.charId}`
    ? s : state.players.get(target) || state.party.find((m: any) => m.id === target);
  if (!who) return "";
  return `<span>targeting</span><span class="ttot">${jobIcon(who.job, 13, 1.8)}${esc(who.name)}</span>`;
}

let promptSig = ""; // what the interact prompt last drew

let tfView: TargetView | null = null;
// what the per-frame pass last wrote; reset whenever updateTarget redraws
let tfLast = { pct: "", far: false, side: "", sideAt: -1, cast: false, cname: "", ctime: "", fx: "", foot: false };
let tfDom: {
  f: HTMLElement; lv: HTMLElement; name: HTMLElement; con: HTMLElement; side: HTMLElement;
  meter: HTMLElement; fill: HTMLElement; hp: HTMLElement; fx: HTMLElement;
  cname: HTMLElement; cfill: HTMLElement; ctime: HTMLElement;
} | null = null;
function tfEls() {
  const f = $("target-frame");
  if (!tfDom || tfDom.f !== f) {
    const q = (sel: string) => f.querySelector(sel) as HTMLElement;
    tfDom = {
      f, lv: q(".tlv"), name: q(".tname"), con: q(".tcon"), side: q(".tside"),
      meter: q(".tmeter"), fill: q(".tmeter > i"), hp: q(".thp"), fx: q(".teffects"),
      cname: q(".tcname"), cfill: q(".tcast i"), ctime: q(".tctime"),
    };
  }
  return tfDom;
}

function tickTargetFrame(myX: number, myZ: number, nowS: number): void {
  const v = tfView;
  const tid = state.targetId;
  if (!v || !tid) return;
  const d = tfEls();
  if (v.kind === "self") {
    const s = state.self;
    if (!s) return;
    const w = `${hpOf(s.hp, s.maxHp).toFixed(1)}%`;
    if (w !== tfLast.pct) { tfLast.pct = w; d.fill.style.width = w; d.meter.title = `HP ${s.hp}/${s.maxHp}`; }
  }
  // the side line is a quest lookup, so a few times a second is plenty
  const sideDue = nowS - tfLast.sideAt >= 0.25;
  if (v.kind === "self" || v.kind === "pc") {
    // a player's line moves on events that never redraw the frame — a stranger
    // dies or is raised, you level or change job — so re-read the view here
    if (!sideDue) return;
    tfLast.sideAt = nowS;
    const nv = targetView(tid);
    // a different shape (left the party, so the meter goes) is a full redraw
    if (!nv || nv.kind !== v.kind || (nv.meter === null) !== (v.meter === null)) { api.updateTarget(); return; }
    tfView = nv;
    if (nv.con !== v.con) d.con.textContent = nv.con;
    if (nv.side !== tfLast.side) { tfLast.side = nv.side; d.side.innerHTML = nv.side; }
    return;
  }
  if (v.kind === "npc") {
    if (!sideDue) return;
    tfLast.sideAt = nowS;
    const side = npcSide(parseTargetId(tid).id);
    if (side !== tfLast.side) { tfLast.side = side; d.side.innerHTML = side; }
    return;
  }
  if (v.kind !== "foe") return;
  const m = state.monsters.get(tid);
  if (!m) return;
  const pct = `${Math.max(0, Math.round(m.hpPct))}%`;
  if (pct !== tfLast.pct) { tfLast.pct = pct; d.fill.style.width = `${Math.max(0, m.hpPct)}%`; d.hp.textContent = pct; }
  // beyond a weapon skill's reach, to the monster's edge, with the hotbar's margin
  const far = edgeDistance(myX, myZ, m.x, m.z, MONSTERS[m.key]?.radius_m ?? 0.5) > RANGE.ws + MARGIN;
  if (far !== tfLast.far) { tfLast.far = far; d.f.classList.toggle("far", far); }
  if (sideDue) {
    tfLast.sideAt = nowS;
    const side = (isDutyTarget(m.key) ? `<span class="lp-chip tduty">DUTY TARGET</span>` : "") + totHtml(m.target);
    if (side !== tfLast.side) { tfLast.side = side; d.side.innerHTML = side; }
    // timers read in whole seconds, so the effects need no more than this pass
    const effects = liveEffects(state.mobEffects.get(m.id), nowS);
    const fx = effects.map((e) => `${e.kind}|${e.name} ${fmtRemain(e.until - nowS)}`).join("\n");
    if (fx !== tfLast.fx) {
      tfLast.fx = fx;
      d.fx.innerHTML = effects.map((e) =>
        `<span class="tfx">${lpIcon(e.kind === "stun" ? "bash" : "moon", 13, 1.8)}${esc(e.name)} ${fmtRemain(e.until - nowS)}</span>`).join("");
    }
  }
  const frac = castFrac(m.castEnd ?? 0, m.castMs ?? 0, nowS);
  const casting = frac !== null;
  if (casting !== tfLast.cast) { tfLast.cast = casting; d.f.classList.toggle("casting", casting); }
  if (casting) {
    const cname = m.castName || "Casting";
    if (cname !== tfLast.cname) { tfLast.cname = cname; d.cname.textContent = cname; }
    d.cfill.style.width = `${(frac! * 100).toFixed(1)}%`;
    const ctime = `${Math.max(0, m.castEnd! - nowS).toFixed(1)}s`;
    if (ctime !== tfLast.ctime) { tfLast.ctime = ctime; d.ctime.textContent = ctime; }
  }
  const foot = casting || tfLast.fx !== "";
  if (foot !== tfLast.foot) { tfLast.foot = foot; d.f.classList.toggle("foot", foot); }
}

const api: HudApi = {
  addChat(channel, from, msg, to) {
    const log = $("chat-log");
    let html = "";
    if (channel === "say") html = `<div class="say"><span class="from">${esc(from)}:</span> ${esc(msg)}</div>`;
    else if (channel === "party") html = `<div class="party"><span class="from">(${esc(from)})</span> ${esc(msg)}</div>`;
    // the server sends the speaker for company lines too (world.rb), which
    // used to fall through to the bare branch below and lose the name
    else if (channel === "company") html = `<div class="company"><span class="from">[${esc(from)}]</span> ${esc(msg)}</div>`;
    else if (channel === "tell") {
      const mine = !!state.self && from === state.self.name;
      const who = (mine ? to : from) || "";
      if (who) lastTellWith = who; // both directions feed the reply shortcut
      html = mine
        ? `<div class="tell out"><span class="from">&gt;&gt; ${esc(who)}</span> ${esc(msg)}</div>`
        : `<div class="tell"><span class="from">${esc(from)} &gt;&gt;</span> ${esc(msg)}</div>`;
      if (!mine && chatTab !== "tells") { unreadTells++; renderUnread(); }
    } else html = `<div class="${channel}">${esc(msg)}</div>`;
    log.insertAdjacentHTML("beforeend", html);
    // the tabs filter one shared log, so it keeps more than one view's worth
    while (log.children.length > 300) log.removeChild(log.firstChild!);
    log.scrollTop = log.scrollHeight;
  },

  updateSelf() {
    const s = state.self!;
    renderPlate(s);
    renderBuffRow(s);
    $("gold-readout").querySelector(".gval")!.textContent = s.gold.toLocaleString();
    refreshXp();
    // a job change lands here before (or after) its ability list; either way
    // the bar has to reload the new job's saved layout
    if (`${s.charId}_${s.job}` !== hotbarFor) this.renderHotbar();
    // TP, MP, buffs and death need no push here: tickHotbar reads them fresh
    // every frame and rewrites only the slots whose state changed
    // The sheet reads the stats the server recomputes after every equip, so it
    // has to be redrawn when they land — but only then. `self` arrives every
    // tick, and redrawing the sheet on each one would fight the gear menu.
    const sig = JSON.stringify([s.stats, s.level, s.gold, s.title]);
    if (sig !== charSheetSig) { charSheetSig = sig; renderCharacterIfOpen(); }
  },

  updateTarget() {
    // first, not last: the hide path below returns early
    markPartyTarget();
    const d = tfEls();
    const v = state.targetId ? targetView(state.targetId) : null;
    tfView = v;
    tfLast = { pct: "", far: false, side: "", sideAt: -1, cast: false, cname: "", ctime: "", fx: "", foot: false };
    if (!v) { d.f.classList.remove("on"); return; }
    // the class list is rebuilt outright, which also clears far/casting/foot
    // for the per-frame pass to set again from a clean cache
    // only a foe gets the brass edge; the Kit draws friends on a quiet hairline
    d.f.className = `lp-panel on ${v.kind}${v.kind === "foe" ? "" : " quiet"}${v.meter === null ? " nometer" : ""}`;
    d.lv.style.display = v.lv ? "" : "none";
    if (v.lv) {
      d.lv.textContent = v.lv.text;
      d.lv.classList.toggle("tough", v.tough);
      d.lv.style.color = v.lv.color || "";
      d.lv.style.borderColor = v.lv.color || "";
    }
    d.name.textContent = v.name;
    d.name.className = `tname lp-name ${v.kind}${v.tough ? " tough" : ""}`;
    d.con.textContent = v.con;
    d.con.classList.toggle("tough", v.tough);
    d.side.innerHTML = v.side;
    tfLast.side = v.side;
    // a player's meter is the Kit's slim solid green, with no ticks or %
    d.meter.classList.toggle("pcm", v.kind !== "foe");
    d.meter.title = v.hpTitle;
    if (v.meter !== null) {
      d.fill.style.width = `${Math.max(0, v.meter)}%`;
      d.hp.textContent = v.kind === "foe" ? `${Math.max(0, Math.round(v.meter))}%` : "";
      if (v.kind === "foe") tfLast.pct = d.hp.textContent;
    }
    d.fx.innerHTML = "";
  },

  updateParty() {
    const pf = $("party-frame");
    pf.innerHTML = "";
    partyRows.clear();
    partyFit = null;
    if (!state.party.length) return;
    const head = el("div", "phead", `<span>PARTY</span><span class="pcount lp-num">${state.party.length} / 6</span>`);
    pf.appendChild(head);
    const fitRows: HTMLElement[] = [], fitRanks: number[] = [];
    // Raise is only a hint: the row click still targets, and the hotbar casts
    const canRaise = state.abilities.some((a: any) => a?.effect === "revive");
    state.party.forEach((m: any) => {
      if (m.char_id === state.self!.charId) return;
      const film = m.cutscene ? ` <span class="pfilm" title="Watching a cutscene" aria-label="watching a cutscene">${lpIcon("film", 12, 2)}</span>` : "";
      const top = `<div class="ptop"><span class="pnm">${esc(m.name)}${m.leader ? ` <span class="plead">★</span>` : ""}${film}</span>`
        + `<span class="pjl">${esc(m.job)} ${m.level}</span></div>`;
      const icon = `<div class="picon">${jobIcon(m.job, 15, 1.8)}</div>`;
      // A member crossing a zone (or briefly dropped) keeps their seat, but the
      // hp/mp/tp we hold is a stale snapshot — show a status line, not bars.
      if (m.away) {
        const row = el("div", "pmember away");
        row.dataset.id = m.id;
        row.innerHTML = `${icon}<div class="pbody">${top}<div class="astat">somewhere between wards…</div></div>`;
        pf.appendChild(row);
        fitRows.push(row); fitRanks.push(partyRank(m, state.zone));
        return;
      }
      const hpPct = m.max_hp > 0 ? Math.min(100, Math.max(0, (100 * m.hp) / m.max_hp)) : 0;
      const mpPct = m.max_mp > 0 ? Math.min(100, Math.max(0, (100 * m.mp) / m.max_mp)) : 0;
      const low = !m.dead && hpPct < 25;
      const elsewhere = !!m.zone && m.zone !== state.zone;
      const row = el("div", `pmember${m.dead ? " dead" : ""}${low ? " low" : ""}${elsewhere ? " elsewhere" : ""}${m.id === state.targetId ? " targeted" : ""}`);
      row.dataset.id = m.id;
      // the design draws no numbers on the row, so they live in the tooltip
      row.title = `HP ${m.hp}/${m.max_hp} · MP ${m.mp}/${m.max_mp} · TP ${Math.floor(m.tp ?? 0)}`;
      const where = elsewhere
        ? `<div class="pwhere">in ${esc(ZONES[m.zone!]?.name || m.zone)}</div>` : "";
      const bars = m.dead
        ? `<div class="pfallen">FALLEN${canRaise ? ` <span class="praise">Raise</span>` : ""}</div>`
        : `<div class="lp-meter h6 php"><i style="width:${hpPct}%"></i></div>`
          + `<div class="lp-meter h3 pmp"><i style="width:${mpPct}%"></i></div>`
          + `<div class="pcast"><div class="lp-meter h3"><i></i></div><span class="pcname"></span></div>`;
      row.innerHTML = `${icon}<div class="pbody">${top}${bars}${where}</div>`;
      row.addEventListener("click", () => { state.targetId = m.id; api.updateTarget(); });
      pf.appendChild(row);
      fitRows.push(row); fitRanks.push(partyRank(m, state.zone));
      const castWrap = row.querySelector(".pcast") as HTMLElement | null;
      if (castWrap) {
        partyRows.set(m.id, {
          row, castWrap,
          castBar: castWrap.querySelector("i") as HTMLElement,
          castName: castWrap.querySelector(".pcname") as HTMLElement,
          mpLine: row.querySelector(".pmp") as HTMLElement,
          casting: false,
        });
      }
    });
    partyFit = { rows: fitRows, ranks: fitRanks, count: head.querySelector(".pcount") as HTMLElement };
    fitPartyFrame();
    if (state.party.some((m: any) => m.id === state.targetId)) api.updateTarget();
  },

  showDialog(msg) {
    const d = $("dialog-panel");
    d.classList.add("on");
    d.querySelector(".dname")!.textContent = msg.name;
    d.querySelector(".dtitle")!.textContent = msg.title || "";
    const lines = d.querySelector(".dlines")!;
    const actions = d.querySelector(".dactions")!;
    const reward = d.querySelector(".dreward") as HTMLElement;
    const rows = d.querySelector(".doffers") as HTMLElement;
    const dq = d.querySelector(".dquest") as HTMLElement;
    const npcDef = (ZONES[state.zone].npcs || []).find((n: any) => n.id === msg.npc);
    const offers: any[] = msg.offers || [];
    const turnins: any[] = msg.turnins || [];
    // the NPC's standing line, greyed, ahead of what they say to you now —
    // unless the server already sent it as the conversation itself
    const ambientLine: string = npcDef?.dialog?.[0] || "";
    const ambient = ambientLine && !(msg.lines || []).includes(ambientLine)
      ? `<p class="ambient">${esc(ambientLine)}</p>` : "";
    const say = (ls: string[]) => ls.map((l) => `<p>${esc(l)}</p>`).join("");
    // the duty under discussion, in its quest colour, at the strip's right
    const showDuty = (q: { id: string; name: string } | null) => {
      dq.hidden = !q;
      if (!q) return;
      dq.style.color = QUESTS[q.id] ? questColor(q.id) : (npcMarkerFor(msg.npc)?.color || "var(--lp-brass)");
      (dq.querySelector(".dqname") as HTMLElement).textContent = q.name;
    };
    const button = (cls: string, label: string, onClick: () => void) => {
      const b = el("button", cls, esc(label));
      b.addEventListener("click", onClick);
      actions.appendChild(b);
      return b;
    };
    const close = () => d.classList.remove("on");

    // A duty is pitched in the NPC's own words first, with what it asks and
    // pays laid out beneath; only then may the player take it up or not.
    const showOffer = (o: any) => {
      const q = QUESTS[o.id];
      showDuty(o);
      lines.innerHTML = ambient + say(o.lines || []);
      rows.hidden = true;
      rows.innerHTML = "";
      reward.hidden = !q;
      if (q) {
        const r = q.rewards || {};
        // a reward granted twice is one chip with its count, not two alike
        const items = stackRewards(r.items || []).map(({ key: k, n }) =>
          `<span class="ritem">${esc(ITEMS[k]?.name || k)}${rewardCount(n)}</span>`).join("");
        reward.innerHTML = `<span class="robj">${esc(q.objective?.label || "")}</span>`
          + `<span class="rxp lp-num">${(r.xp || 0).toLocaleString()} XP</span>`
          + (r.gold ? `<span class="rgold lp-num">${r.gold}g</span>` : "")
          + items
          + (r.title ? `<span class="ritem">Title · ${esc(r.title)}</span>` : "");
      }
      actions.innerHTML = "";
      button("btn", "Not now", renderBase);
      if (npcDef?.kind === "vendor") button("btn primary", "Browse wares", () => { close(); openVendor(msg.npc); });
      button("btn gold", "Accept duty", () => { send("quest_accept", { id: o.id }); close(); });
    };

    // One brass button per prompt: several offers or hand-ins become a list
    // of rows, and only a lone hand-in is the panel's primary action.
    const renderBase = () => {
      lines.innerHTML = ambient + say(msg.lines || []);
      reward.hidden = true;
      reward.innerHTML = "";
      showDuty(offers.length + turnins.length === 1 ? (offers[0] || turnins[0]) : null);
      actions.innerHTML = "";
      rows.innerHTML = "";
      const loneTurnin = turnins.length === 1 && !offers.length;
      rows.hidden = loneTurnin || !(offers.length + turnins.length);
      offers.forEach((o: any) => {
        const dot = QUESTS[o.id] ? questColor(o.id) : "var(--lp-brass)";
        const b = el("button", "doffer",
          `<i style="background:${dot}"></i><span class="dlabel">${esc(o.name)}</span>`
          + (o.level ? `<span class="dside lp-num">Lv ${o.level}</span>` : ""));
        b.addEventListener("click", () => showOffer(o));
        rows.appendChild(b);
      });
      const handIn = (tq: any) => { send("quest_complete", { id: tq.id }); close(); };
      if (loneTurnin) button("btn gold", `Hand in: ${turnins[0].name}`, () => handIn(turnins[0]));
      else turnins.forEach((tq: any) => {
        const dot = QUESTS[tq.id] ? questColor(tq.id) : "var(--lp-brass)";
        const b = el("button", "doffer",
          `<i style="background:${dot}"></i><span class="dlabel">${esc(tq.name)}</span><span class="dside handin">Hand in</span>`);
        b.addEventListener("click", () => handIn(tq));
        rows.appendChild(b);
      });
      if (npcDef?.kind === "vendor") button("btn primary", "Browse wares", () => { close(); openVendor(msg.npc); });
      if (npcDef?.kind === "auction") button("btn primary", "The Auction House", () => { close(); openAuction(); });
      if (msg.sanctuary) button("btn primary", "Change job", () => { close(); openJobChange(); });
      if (msg.herald) courtHeraldButtons(msg, button, close);
      if (msg.ferry) {
        updateFerryStatus(msg.ferry, true);
        button("btn primary", `Gulf Ferry · ${msg.ferry.fare ?? 10} gold`, () => updateFerryStatus(msg.ferry, true));
      }
      // the gate's keeper: the server asks the party (World.gate_enter) and
      // the answer comes back as the gate prompt
      if (msg.gate) button("btn primary", "Enter the empty city", () => { close(); send("gate_enter", { npc: msg.npc }); });
      button("btn", "Farewell", close);
    };

    renderBase();
    // one offer and nothing else to say: go straight to the pitch ("Not now"
    // returns to the plain dialog). A ferry or gate keeper always opens on the
    // plain dialog: the pitch has no room for their button, and Morrow's way
    // into the empty city would otherwise hide behind "Not now".
    if (offers.length === 1 && !turnins.length && !(msg.lines || []).length && !msg.ferry && !msg.gate) {
      showOffer(offers[0]);
    }
  },

  toast(text, kind) {
    // a skillchain is a banner over the fight, not a pill, so it has no diamond
    const t = el("div", `toast ${kind}`, kind === "sc" ? esc(text) : `<span class="lp-diamond"></span><span>${esc(text)}</span>`);
    $("toasts").appendChild(t);
    setTimeout(() => t.remove(), 4100);
  },
  dutyToast(id, name, progress, count) {
    const c = questColor(id);
    const t = el("div", "toast duty",
      `<span class="lp-diamond" style="color:${c}"></span><span><span class="dim">Duty updated ·</span> ${esc(name)}</span>`
      + `<b class="lp-num" style="color:${c}">${Math.min(progress, count)} / ${count}</b>`);
    t.dataset.key = id;
    // a run of kills would otherwise stack a pill per kill: the newest takes
    // the old one's place, which also restarts its fade; the old timer then
    // only removes a detached node
    const old = Array.from($("toasts").children).find((n) => (n as HTMLElement).dataset.key === id);
    if (old) old.replaceWith(t);
    else $("toasts").appendChild(t);
    setTimeout(() => t.remove(), 4100);
  },

  refreshQuests() {
    renderTracker();
    renderJournal();
  },

  // One refresh at a time: a burst of inventory_dirty (a fight's loot) folds
  // into the one waiting, and one arriving mid-fetch runs once it is back.
  // The avatar is redressed from the result: a job change unequips gear and
  // only this refresh carries it.
  refreshInventoryLater() {
    if (invRefresh.timer) return;
    if (invRefresh.busy) { invRefresh.again = true; return; }
    invRefresh.timer = setTimeout(() => {
      invRefresh.timer = null;
      invRefresh.busy = true;
      refreshInventoryFn().finally(() => {
        invRefresh.busy = false;
        renderInventory(); renderCharacterIfOpen(); api.renderHotbar();
        import("./world").then((w) => w.rebuildSelfAvatar());
        if (invRefresh.again) { invRefresh.again = false; api.refreshInventoryLater(); }
      });
    }, 250);
  },

  // The slots are built once (buildHotbar); this only re-resolves the layout
  // and rewrites a slot whose entry changed. Rebuilding them on every self
  // update used to drop the hover tip and any drag in progress four times a
  // second. Per-frame state (cooldown, range, TP, MP) is tickHotbar's.
  renderHotbar() {
    const s = state.self;
    if (!s || !slotEls.length) return;
    hotbarFor = `${s.charId}_${s.job}`;
    const abs = abilitiesInOrder();
    const byId = new Map(abs.map((a) => [a.id, a]));
    hotbarLayout = fillLayout(loadHotbarLayout(), abs.map((a) => a.id));
    hotbarInv = state.inventory;
    hotbarLayout.forEach((e, i) => {
      hotbarSlots[i] = e === null ? null
        : isItemEntry(e) ? itemRec(itemKeyOf(e))
        : { kind: "ab", ab: byId.get(e) };
      const slot = slotEls[i];
      if (e === slotEntry[i]) return;
      slotEntry[i] = e;
      const rec = hotbarSlots[i];
      slot.querySelector(".ico")!.innerHTML = !rec ? ""
        : rec.kind === "item" ? itemStrokeIcon(rec.key, rec.item, 24) : abilityStrokeIcon(rec.ab, 24);
      slot.draggable = !!rec;
      slotSig[i] = ""; // the state pass rewrites cost, class and label
    });
  },

  useHotbarSlot(i) {
    const rec = hotbarSlots[i];
    if (!rec) return;
    pressSlot(i);
    const now = performance.now() / 1000;
    if (rec.kind === "item") {
      const lock = itemLocks.get(rec.key);
      if (lock && lock.until > now && lock.inv === state.inventory) return;
      if ((state.cooldowns.get("item") || 0) > now) return;
      const row = state.inventory.find((r: any) => r.item_key === rec.key && !r.equipped_slot);
      if (!row) { api.addChat("system", "", "You have none left."); return; }
      send("use_item", { inv_id: row.id });
      itemLocks.set(rec.key, { until: now + 1, inv: state.inventory });
      return;
    }
    const ab = rec.ab;
    if ((state.cooldowns.get(ab.id) || 0) > now) return;
    if ((state.pressLocks.get(ab.id) || 0) > now) return;
    let target = state.targetId;
    if (["ally", "party", "self"].includes(ab.target) && (!target || !target.startsWith("p"))) target = null;
    if (ab.target === "enemy" && (!target || !target.startsWith("m"))) {
      api.addChat("system", "", "You need an enemy target. (Tab)");
      return;
    }
    send("ability", { id: ab.id, target });
    // Only a guard against a double send while the press waits for the
    // server's next tick. It lives in pressLocks, which the hotbar never
    // draws, so a refused press ("Too far away.", "Not enough MP.") leaves no
    // false cooldown; the self carrying the real cooldown drops it (world.ts).
    // 0.75 s covers a round trip plus the up-to-0.25 s wait for the tick.
    if (ab.cd) state.pressLocks.set(ab.id, now + Math.min(ab.cd, 0.75));
  },

  startCastBar(name, ms) {
    castState = { name, started: performance.now(), ms };
    castTimeText = "";
    const cb = $("cast-bar");
    cb.classList.add("on");
    (cb.querySelector(".label") as HTMLElement).textContent = name;
  },

  floatText(worldPos, text, cls) {
    if (!scene.activeCamera) return;
    const p = Vector3.Project(worldPos,
      identityMatrix(),
      scene.getTransformMatrix(),
      scene.activeCamera.viewport.toGlobal(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight()));
    if (p.z > 1 || p.z < 0) return;
    // render-buffer pixels → CSS pixels (Retina displays render at 2x)
    const canvas = scene.getEngine().getRenderingCanvas()!;
    const sx = canvas.clientWidth / scene.getEngine().getRenderWidth();
    const sy = canvas.clientHeight / scene.getEngine().getRenderHeight();
    const f = el("div", `float-text ${cls}`, esc(text));
    f.style.left = `${p.x * sx + (Math.random() * 30 - 15)}px`;
    f.style.top = `${p.y * sy}px`;
    $("app").appendChild(f);
    setTimeout(() => f.remove(), 1150);
  },

  showDeath(xpLost) {
    // a cast cut short by death never lands, so its bar must not run on
    castState = null; $("cast-bar").classList.remove("on");
    $("death-overlay").classList.add("on");
    ($("death-overlay").querySelector(".dsub") as HTMLElement).textContent =
      xpLost > 0 ? `The dark takes ${xpLost} experience with it. A White Mage's Raise can restore half.` : "";
  },
  hideDeath() {
    $("death-overlay").classList.remove("on");
    setRaiseOffer(false);
  },

  showRaiseOffer(from: string) {
    const ro = $("raise-offer");
    setRaiseOffer(true);
    (ro.querySelector(".rtext") as HTMLElement).innerHTML =
      `<b>${esc(from)}</b> is casting Raise on you. Accept, or wait until the area is safe.`;
    sfx.questComplete();
  },

  showInvite(from) { showInviteCard("party", from); },
  showGatePrompt(msg) { showGatePrompt(msg); },
  hideGatePrompt() { hideGatePrompt(); },
  showTradeInvite(from) { showTradeInvite(from); },
  renderTrade(msg) { renderTrade(msg); },

  // the one loading screen (loading-screen.ts): a crossing raises it; on the
  // way in from the roster it is already up, and this only moves it on
  showLoading(on, name) {
    const ls = loadingScreen();
    if (!on) { void ls.finish(); return; }
    if (ls.active) ls.step(0.24, `Raising ${name}`);
    else ls.begin(`Crossing to ${name}`, `Raising ${name}`, 0.08);
  },
  setZoneName(name) { $("zone-name").textContent = name; },
  setInteractPrompt(p) {
    // called every frame, so the DOM is touched only when the prompt changes
    const sig = p ? `${p.key ?? ""}|${p.verb}|${p.name}|${p.note ?? ""}` : "";
    if (sig === promptSig) return;
    promptSig = sig;
    const box = $("interact-prompt");
    box.classList.toggle("on", !!p);
    if (!p) return;
    box.innerHTML = (p.key ? `<kbd class="lp-kbd">${esc(p.key)}</kbd>` : "")
      + `<span class="iverb">${esc(p.verb)}</span><span class="iname">${esc(p.name)}</span>`
      + (p.note ? `<span class="inote">${esc(p.note)}</span>` : "");
  },

  chatFocused() { return document.activeElement === $("chat-input"); },
  focusChat(prefill) {
    const input = $("chat-input") as HTMLInputElement;
    input.classList.add("on");
    if (prefill !== undefined) input.value = prefill;
    refreshPill(); // a prefill fires no input event
    setTimeout(() => {
      input.focus();
      const n = input.value.length;
      input.setSelectionRange(n, n); // caret after the prefilled command
    }, 0);
  },
  replyToLastTell() {
    if (!lastTellWith) { api.addChat("system", "", "No one has whispered to you yet."); return; }
    // keep anything half-typed; on a line already addressed, only the name is swapped
    const typed = ($("chat-input") as HTMLInputElement).value;
    const body = typed.startsWith(">>") ? typed.slice(2).trim().split(" ").slice(1).join(" ") : typed.trim();
    api.focusChat(`>> ${lastTellWith} ${body}`); // focusChat refreshes the pill
  },
  closeWindows() {
    // the trade lives on the server: hiding its window is cancelling it, or
    // both sides stay "already trading" with no window to cancel from
    if ($("win-trade").classList.contains("on")) send("trade_cancel");
    document.querySelectorAll(".window.on").forEach((w) => w.classList.remove("on"));
    $("dialog-panel").classList.remove("on");
    closePlayerMenu();
    closeSocialMenu();
    closeGearMenu();
  },
  toggleWindow(name) {
    const w = $(`win-${name}`);
    const was = w.classList.contains("on");
    w.classList.toggle("on", !was);
    if (!was) {
      if (name === "inventory") renderInventory();
      if (name === "character") renderCharacter();
      if (name === "quests") api.refreshQuests();
      if (name === "settings") renderSettings();
      if (name === "map") { resetMapView(); renderMapWindow($("win-map").querySelector(".wbody") as HTMLElement); }
      if (name === "craft") renderCrafting();
      if (name === "who") renderWhoSearch();
      if (name === "friends") renderFriends();
      if (name === "company") renderCompany();
      if (name === "court") renderCourtWindow();
      if (name === "mail") renderMailWindow();
    }
  },
  renderWhoList(msg) {
    lastWho = msg;
    const box = document.getElementById("who-results");
    if (box) fillWhoResults(box, msg);
  },

  showExamine(msg) {
    const w = $("win-examine");
    const body = w.querySelector(".wbody")!;
    const items: any[] = msg.items || [];
    body.innerHTML =
      `<div style="font-family:Cinzel,serif;font-size:16px;color:var(--gold)">${esc(msg.name || "")}</div>
       ${msg.title ? `<div class="imeta" style="font-style:italic">${esc(msg.title)}</div>` : ""}
       <div style="color:var(--dim);font-size:12px;margin:2px 0 10px">Lv ${msg.level ?? "?"} ${esc(msg.job || "")}${msg.race ? ` · ${esc(msg.race)}` : ""}</div>
       <div class="wsection" style="margin:2px 0 4px">Arms &amp; Raiment</div>`;
    if (!items.length) {
      body.insertAdjacentHTML("beforeend", `<div class="imeta">Nothing worth remarking upon.</div>`);
    }
    items.forEach((it) => {
      const def = ITEMS[it.key];
      const row = el("div", "invrow");
      row.innerHTML = `<span class="iicon">${itemIcon(def)}</span>
        <span class="iname ${rarityCls(it.key)}">${esc(it.name || def?.name || it.key)}</span>
        <span class="imeta">${esc(it.slot || "")}</span>`;
      attachTip(row, () => itemTipHtml(it.key));
      body.appendChild(row);
    });
    w.classList.add("on");
  },

  clearPlates() {
    plates.forEach((p) => p.remove());
    plates.clear();
  },
  removePlate(id) {
    plates.get(id)?.remove();
    plates.delete(id);
  },

  tickFrame(camera, myAvatar, monsters, avatars, npcs, myX, myZ, bodiless) {
    setQuestOrigin(myX, myZ);
    tickMapWindow();
    renderFerryHud();
    // cast bar progress
    if (castState) {
      const elapsed = performance.now() - castState.started;
      const t = elapsed / castState.ms;
      const cb = $("cast-bar");
      if (t >= 1) { castState = null; cb.classList.remove("on"); }
      else {
        (cb.querySelector(".bar > div") as HTMLElement).style.width = `${t * 100}%`;
        const txt = `${((castState.ms - elapsed) / 1000).toFixed(1)}s`;
        if (txt !== castTimeText) { castTimeText = txt; cb.querySelector(".ctime")!.textContent = txt; }
      }
    }
    // the hour of the lamp: in-game clock (one real hour per day; 06:00 = sunrise)
    {
      const f = dayFrac();
      const mins = Math.floor(((0.25 + f) % 1) * 24 * 60); // f=0 -> 06:00
      const hh = Math.floor(mins / 60), mm = mins % 60;
      const isDay = Math.sin(f * Math.PI * 2) > 0;
      const sig = `${isDay ? "d" : "n"}${hh}:${mm}`;
      // a per-frame innerHTML write would rebuild the svg sixty times a second
      if (sig !== clockSig) {
        clockSig = sig;
        $("game-clock").innerHTML = `${lpIcon(isDay ? "sun" : "moon", 13, 1.8)} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
    }
    // camera heading, 0 = north (+z), clockwise positive; the target frame took
    // the compass ribbon's place, so the minimap wedge and the tracker carry it
    const camYaw = -camera.alpha - Math.PI / 2;
    // one beacon list per frame, shared by the minimap and the world markers
    const beacons = beaconsNow(myX, myZ);
    drawMinimap(myAvatar, myX, myZ, beacons, camYaw);
    tickTracker(myX, myZ, camYaw, performance.now() / 1000);
    tickUnitFrames(performance.now() / 1000);
    tickTargetFrame(myX, myZ, performance.now() / 1000);
    tickHotbar(performance.now() / 1000, myX, myZ);
    // nameplates
    const w = scene.getEngine().getRenderWidth();
    const h = scene.getEngine().getRenderHeight();
    // render-buffer pixels → CSS pixels (Retina displays render at 2x)
    const canvasEl = scene.getEngine().getRenderingCanvas()!;
    const sx = canvasEl.clientWidth / w;
    const sy = canvasEl.clientHeight / h;
    const project = (v: Vector3) => {
      const p = Vector3.Project(v, identityMatrix(), scene.getTransformMatrix(), scene.activeCamera!.viewport.toGlobal(w, h));
      p.x *= sx;
      p.y *= sy;
      return p;
    };

    // Plate markup is all classes (Kit nameplates): updatePlate rewrites the
    // DOM only when the string changes, so nothing per-frame may leak into it
    // except the quantised cast width.
    // A character with no body drawn (beyond the nearest few, world.ts
    // streamer) still wears its plate, where `bodiless` says it stands.
    const at = (id: string, av: AvatarNode | undefined): Vector3 | null => {
      const p = av ? av.root.position.add(new Vector3(0, av.raceH + 0.5, 0)) : bodiless?.(id) ?? null;
      if (p) plateFor(id).classList.toggle("bodiless", !av);
      return p;
    };
    state.players.forEach((rp) => {
      const av = avatars.get(rp.id);
      // no plate over an actor that is not drawn yet (actor-reveal.ts)
      if (av && !actorDrawn(av)) { hidePlate(rp.id); return; }
      const pos = at(rp.id, av);
      if (!pos) { hidePlate(rp.id); return; }
      const tgt = state.targetId === rp.id ? " tgt" : "";
      // a clapperboard over someone watching a cutscene: why they stand still
      const film = rp.cs ? `<div class="csmark" title="Watching a cutscene">${lpIcon("film", 18, 1.8)}</div>` : "";
      updatePlate(rp.id, pos, project, myX, myZ,
        `${film}<div class="nm pc${tgt}">${esc(rp.name)}</div>${rp.title ? `<div class="sub">${esc(rp.title)}</div>` : ""}`);
    });
    const nowS = performance.now() / 1000;
    state.monsters.forEach((m) => {
      const node = monsters.get(m.id);
      if (!node) return;
      const diff = m.level - (state.self?.level || 1);
      const tough = diff >= 2;
      const targeted = state.targetId === m.id;
      // meters only on what is fighting (Kit): aggro, or the one you picked
      const showHp = m.state === "aggro" || targeted;
      let cast = "";
      if (m.castEnd && m.castEnd > nowS) {
        const pct = Math.min(100, 100 - ((m.castEnd - nowS) * 1000 / (m.castMs || 1600)) * 100);
        // 2% steps: fifty rewrites over a cast rather than one per frame
        const w = Math.max(0, Math.round(pct / 2) * 2);
        cast = `<div class="mcastbar"><div style="width:${w}%"></div></div><div class="mcastname">${esc(m.castName || "Casting")}</div>`;
      }
      updatePlate(m.id, node.root.position.add(new Vector3(0, node.plateY, 0)), project, myX, myZ,
        `<div class="nm mob${tough ? " tough" : ""}${targeted ? " tgt" : ""}">${esc(m.name)}</div>
         <div class="sub${tough ? " tough" : ""}">Lv ${m.level}${tough ? ` · ${conColor(diff).label}` : ""}</div>
         ${showHp ? `<div class="mhp"><div style="width:${m.hpPct}%"></div></div>` : ""}${cast}`);
    });
    // every NPC is checked — flavour folk hand out quests too
    (ZONES[state.zone].npcs || []).forEach((n: any) => {
      const av = npcs.get(n.id);
      if (av && !npcPresent(av)) { hidePlate(`npc_${n.id}`); return; }
      const pos = at(`npc_${n.id}`, av);
      if (!pos) { hidePlate(`npc_${n.id}`); return; }
      const marker = npcQuestMarker(n.id);
      const tgt = state.targetId === npcTargetId(n.id) ? " tgt" : "";
      updatePlate(`npc_${n.id}`, pos, project, myX, myZ,
        `${marker}<div class="nm npc${tgt}">${esc(n.name)}</div>${n.title ? `<div class="sub">${esc(n.title)}</div>` : ""}`);
    });
    drawQuestBeacons(project, myX, myZ, beacons);
  },
};

// ---------- unit frames: the plate, the buff row, the party ----------
type SelfS = NonNullable<typeof state.self>;

let plateJob = ""; // the emblem svg is rebuilt only when the job changes
function renderPlate(s: SelfS): void {
  const f = $("player-frame");
  if (s.job !== plateJob) {
    plateJob = s.job;
    f.querySelector(".pjob-icon")!.innerHTML = jobIcon(s.job, 26);
  }
  f.querySelector(".plvl")!.textContent = String(s.level);
  const nm = f.querySelector(".pname") as HTMLElement;
  nm.textContent = s.name;
  // the design has no title line; it survives as the name's tooltip
  nm.title = s.title || "";
  f.querySelector(".pjob")!.textContent = JOBS[s.job]?.name || s.job;
  const pct = (v: number, max: number) => (max > 0 ? Math.min(100, Math.max(0, (100 * v) / max)) : 0);
  (f.querySelector(".hpbar > i") as HTMLElement).style.width = `${pct(s.hp, s.maxHp)}%`;
  (f.querySelector(".mpbar > i") as HTMLElement).style.width = `${pct(s.mp, s.maxMp)}%`;
  f.querySelector(".hpnum")!.innerHTML = `${s.hp}<span class="dim">/${s.maxHp}</span>`;
  f.querySelector(".mpnum")!.innerHTML = `${s.mp}<span class="dim">/${s.maxMp}</span>`;
  f.querySelector(".tpnum")!.textContent = String(Math.floor(s.tp));
  // TP caps at 300, so three segments of 100 rather than one bar that
  // reads full from 100 up
  const segs = f.querySelectorAll<HTMLElement>(".tpsegs > i");
  tpSegments(s.tp).forEach((v, i) => {
    const seg = segs[i];
    seg.classList.toggle("full", v >= 1);
    seg.style.background = v > 0 && v < 1
      ? `linear-gradient(90deg, #e3ae55 ${(v * 100).toFixed(1)}%, var(--lp-track) ${(v * 100).toFixed(1)}%)`
      : "";
  });
  f.classList.toggle("dead", s.dead);
}

// Buff names map back to the ability that grants them for the glyph; built
// once, because ABILITIES is static data.
let abilitiesByName: Map<string, any> | null = null;
function abilityByName(name: string): any {
  if (!abilitiesByName) {
    abilitiesByName = new Map();
    for (const ab of Object.values(ABILITIES)) if (ab?.name) abilitiesByName.set(ab.name, ab);
  }
  return abilitiesByName.get(name);
}

let buffSig: string | null = null;
// text starts null so a tile's first tick always writes, even one built at 0
let buffTimes: { el: HTMLElement; tile: HTMLElement; text: string | null }[] = [];
function renderBuffRow(s: SelfS): void {
  // self lands every tick; the tiles are rebuilt only when the set changes,
  // and the countdown text is written per frame by tickUnitFrames
  const sig = s.buffs.map((b) => `${b.kind}|${b.name}`).join("\n");
  if (sig === buffSig) return;
  buffSig = sig;
  const row = $("buff-row");
  row.innerHTML = "";
  buffTimes = [];
  // keyed by position, not name alone: Soul Eater can stack twice
  s.buffs.forEach((b) => {
    // the glyph is the granting ability's; an ailment has none, so its kind
    const icon = b.kind === "poison" ? lpIcon("droplet", 18, 1.7)
      : b.kind === "blind" ? lpIcon("eyeOff", 18, 1.7)
      : abilityStrokeIcon(abilityByName(b.name), 18);
    const tile = el("div", `buff ${buffTone(b.kind, b.harm)}`,
      `<div class="bicon">${icon}</div><span class="btime lp-num"></span>`);
    tile.title = buffTitle(b.name, b.duration);
    tile.setAttribute("aria-label", b.harm ? `${b.name}, ailment` : b.name);
    row.appendChild(tile);
    buffTimes.push({ el: tile.querySelector(".btime") as HTMLElement, tile, text: null });
  });
}

const partyRows = new Map<string, {
  row: HTMLElement; castWrap: HTMLElement; castBar: HTMLElement; castName: HTMLElement;
  mpLine: HTMLElement; casting: boolean;
}>();

// The frame is capped above the chat, so a full party at 720px has no room
// for every row. Left to the column-wrap clip alone, the row cut would simply
// be the last one in seat order — often the newest live member, while a stale
// mid-crossing seat stayed. So rows are kept by partyRank (hud_model.ts), whole,
// and the header says how many are hidden. Measured once per updateParty and
// on resize, never per frame; the CSS clip stays as the net under a party cast
// line that adds a few pixels between fits.
const PARTY_GAP = 6; // the frame's row-gap (style.css #party-frame)
let partyFit: { rows: HTMLElement[]; ranks: number[]; count: HTMLElement } | null = null;
function fitPartyFrame(): void {
  if (!partyFit) return;
  const pf = $("party-frame");
  // with the HUD itself hidden every rect is zero and nothing can be measured
  if (!pf.getClientRects().length) return;
  const { rows, ranks, count } = partyFit;
  rows.forEach((r) => { r.hidden = false; });
  // content-box: the computed height is exactly the row space (see style.css)
  const room = parseFloat(getComputedStyle(pf).height) - (pf.firstElementChild as HTMLElement).offsetHeight - PARTY_GAP;
  const keep = fitPartyRows(rows.map((r) => r.offsetHeight), ranks, room, PARTY_GAP);
  let dropped = 0;
  rows.forEach((r, i) => { r.hidden = !keep[i]; if (!keep[i]) dropped++; });
  count.textContent = `${state.party.length} / 6${dropped ? ` · +${dropped}` : ""}`;
  count.title = dropped ? `${dropped} more not shown — the window is too short for every row` : "";
}

/** Brass edge on the party row that is the current target. */
export function markPartyTarget(): void {
  document.querySelectorAll<HTMLElement>("#party-frame .pmember").forEach((r) => {
    r.classList.toggle("targeted", !!state.targetId && r.dataset.id === state.targetId);
  });
}

// Per-frame pass over the unit frames: buff countdowns and party cast lines.
// Writes only when the visible text or state actually changes.
function tickUnitFrames(nowS: number): void {
  const s = state.self;
  if (s) {
    const at = s.buffsAt ?? nowS;
    buffTimes.forEach((t, i) => {
      const b = s.buffs[i];
      if (!b) return;
      const left = liveRemain(b.remain, at, nowS);
      const text = left > 0 ? fmtRemain(left) : "";
      if (text === t.text) return;
      t.text = text;
      t.el.textContent = text;
      t.tile.style.display = left > 0 ? "" : "none";
    });
  }
  partyRows.forEach((r, id) => {
    const c = state.casts.get(id);
    const frac = c ? castFrac(c.endsAt, c.ms, nowS) : null;
    const casting = frac !== null;
    if (casting !== r.casting) {
      r.casting = casting;
      r.castWrap.classList.toggle("on", casting);
      r.mpLine.style.display = casting ? "none" : "";
      if (casting) r.castName.textContent = c!.name;
    }
    if (casting) {
      if (r.castName.textContent !== c!.name) r.castName.textContent = c!.name;
      r.castBar.style.width = `${(frac! * 100).toFixed(1)}%`;
    }
  });
}

// ---------- quest destination beacons ----------
// Floating markers over the places the active duties point at, in this zone.
const MAX_BEACONS = 6;
const BEACON_RANGE = 250; // metres — these are meant to be seen from afar
let beaconIds: string[] = [];

// resolving destinations walks every quest, so do it a few times a second
// rather than every frame; the distances themselves stay live
let destCache: { at: number; zone: string; list: QuestDest[] } | null = null;
function activeDests(): QuestDest[] {
  const now = performance.now();
  if (!destCache || destCache.zone !== state.zone || now - destCache.at > 250) {
    destCache = { at: now, zone: state.zone, list: activeQuestDestinations(state.zone) };
  }
  return destCache.list;
}

type Beacon = QuestDest & { d: number };

// a point you can touch (a node, a notice) hands over to its in-world ring
// (marker.ts) once you are close; the beacon is the far view of it
const BEACON_HANDOVER = 20;
function beaconsNow(myX: number, myZ: number): Beacon[] {
  return activeDests()
    .map((d) => ({ ...d, d: Math.hypot(d.x - myX, d.z - myZ) }))
    .filter((d) => !(d.kind === "point" && d.d < BEACON_HANDOVER))
    .sort((a, b) => (a.met === b.met ? a.d - b.d : a.met ? -1 : 1))
    .slice(0, MAX_BEACONS);
}

// An NPC destination hands over the same way, to the NPC's own plate: up
// close its hollow diamond and name already say "here", and a beacon 4 m up
// would sit right on top of them. Only the world marker steps aside — the
// minimap and the tracker keep pointing — and only while that plate is drawn.
const BEACON_NPC_HANDOVER = 25;
function drawQuestBeacons(project: (v: Vector3) => Vector3, myX: number, myZ: number, live: Beacon[]): void {
  const ids = live.map((_, i) => `qdest_${i}`);
  beaconIds.forEach((id) => { if (!ids.includes(id)) api.removePlate(id); });
  beaconIds = ids;
  live.forEach((b, i) => {
    // the NPC plates were placed earlier this frame, so this reads them current
    if (b.npc && b.d < BEACON_NPC_HANDOVER && plates.get(`npc_${b.npc}`)?.style.display === "block") {
      hidePlate(`qdest_${i}`);
      return;
    }
    const pos = new Vector3(b.x, groundHeight(b.x, b.z) + 4, b.z);
    updatePlate(`qdest_${i}`, pos, project, myX, myZ,
      `<div class="qbeacon" style="--qc:${b.color}"><div class="qb-mark">${lpIcon("chevDown", 20, 2.4)}</div>
       <div class="qb-label">${esc(b.label)}</div><div class="sub lp-num">${Math.round(b.d)}m</div></div>`,
      BEACON_RANGE);
  });
}

const IDENTITY = Matrix.Identity();
function identityMatrix(): Matrix {
  return IDENTITY;
}

// ---------- minimap ----------
// A crop of the real zone map: the static layers are blitted from an offscreen
// canvas rendered once per zone load, and only the living things are drawn here.
// world metres shown from centre to edge; the +/- buttons step through these
const MM_STEPS = [35, 50, 70, 100, 140];
const MM_CSS = 172; // the canvas's CSS size (style.css #minimap); the backing store is this × DPR
let mmRange = 70;
let clockSig = "";

function initMinimapZoom(): void {
  try {
    const saved = Number(localStorage.getItem("vanai_mm_range"));
    if (MM_STEPS.includes(saved)) mmRange = saved;
  } catch { /* default range */ }
  const step = (dir: number) => {
    const i = MM_STEPS.indexOf(mmRange);
    const next = MM_STEPS[Math.max(0, Math.min(MM_STEPS.length - 1, (i < 0 ? 2 : i) + dir))];
    if (next === mmRange) return;
    mmRange = next;
    try { localStorage.setItem("vanai_mm_range", String(mmRange)); } catch { /* unsaved */ }
  };
  document.querySelectorAll<HTMLElement>("#minimap-cluster .mm-zoom").forEach((b) => {
    // mousedown keeps focus where it was, so Space (jump) never re-presses it
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => step(b.classList.contains("in") ? -1 : 1));
  });
}

// the roster array is replaced wholesale whenever the party changes, so its
// identity is enough to know the id set is still good — no per-frame rebuild
let partyIdCache: { src: any[]; ids: Set<string> } | null = null;
function partyIdSet(): Set<string> {
  if (!partyIdCache || partyIdCache.src !== state.party) {
    partyIdCache = { src: state.party, ids: new Set(state.party.map((m: any) => `p${m.char_id}`)) };
  }
  return partyIdCache.ids;
}

// The minimap's colours and its static marks (crop, crystals, crossings,
// services, folk) live with the map (map.ts drawMinimapStatic), so the
// /?zonemap= dev view draws the same minimap the HUD does.

function drawMinimap(myAvatar: AvatarNode | null, myX: number, myZ: number, beacons: Beacon[], camYaw: number): void {
  const cv = $("minimap") as HTMLCanvasElement;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  // draw in CSS pixels on a DPR-sized backing store, so Retina stays crisp;
  // the size check also catches the window moving to another screen
  const dpr = window.devicePixelRatio || 1;
  const backing = Math.round(MM_CSS * dpr);
  if (cv.width !== backing || cv.height !== backing) { cv.width = cv.height = backing; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the brass ring is DOM now (.mm-ring), so the map runs to the canvas edge
  const S = MM_CSS, C = S / 2, R = C;
  ctx.clearRect(0, 0, S, S);
  const { px, inR } = drawMinimapStatic(ctx, state.zone, myX, myZ, mmRange, S);
  const dot = (wx: number, wz: number, color: string, r = 2.6, ring?: string) => {
    const [x, y] = px(wx, wz);
    if (!inR(x, y)) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.stroke(); }
  };
  state.monsters.forEach((m) => dot(m.x, m.z, m.target ? MM.foe : MM.foeIdle, 2.4));
  const partyIds = partyIdSet();
  state.players.forEach((p) => {
    if (partyIds.has(p.id)) dot(p.x, p.z, MM.party, 4, MM_INK);
    else dot(p.x, p.z, MM.player, 2.8);
  });
  // duties: a diamond in range, a bearing dot on the rim when beyond it
  beacons.forEach((d) => {
    const [x, y] = px(d.x, d.z);
    const dx = x - C, dy = y - C;
    const len = Math.hypot(dx, dy);
    ctx.save();
    if (len > R - 6) {
      const k = (R - 6) / (len || 1);
      ctx.translate(C + dx * k, C + dy * k);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = d.color;
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    } else {
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = "rgba(10,12,18,0.9)";
      ctx.lineWidth = 1.2;
      ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
      ctx.strokeRect(-3.6, -3.6, 7.2, 7.2);
    }
    ctx.restore();
  });
  drawCourtMinimapBanner(ctx, state.zone, S); // the controlling court's pennant (court-hud.ts)
  // the camera's view: a soft 60° wedge, so the heading the old compass ribbon
  // gave is still on screen. Canvas angles run clockwise from east, so a
  // heading (0 = north, clockwise) sits a quarter turn back.
  {
    const a = camYaw - Math.PI / 2, half = Math.PI / 6, wr = 64;
    const g = ctx.createRadialGradient(C, C, 0, C, C, wr);
    g.addColorStop(0, "rgba(243, 234, 214, 0.16)");
    g.addColorStop(1, "rgba(243, 234, 214, 0)");
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, wr, a - half, a + half);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  // me: heading arrow (up = north, rotated by facing)
  const heading = myAvatar ? myAvatar.root.rotation.y : 0;
  ctx.save();
  ctx.translate(C, C);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 6);
  ctx.lineTo(0, 2);
  ctx.lineTo(-7, 6);
  ctx.closePath();
  ctx.fillStyle = "#f3ead6";
  ctx.fill();
  ctx.strokeStyle = "#0b0e15";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function hidePlate(id: string): void {
  const plate = plates.get(id);
  if (plate) plate.style.display = "none";
}

function updatePlate(id: string, pos: Vector3, project: (v: Vector3) => Vector3, myX: number, myZ: number,
                     html: string, cull = 70): void {
  const dist = Math.hypot(pos.x - myX, pos.z - myZ);
  const plate = plateFor(id);
  if (dist > cull) { plate.style.display = "none"; return; }
  const p = project(pos);
  if (p.z > 1 || p.z < 0) { plate.style.display = "none"; return; }
  plate.style.display = "block";
  plate.style.left = `${p.x}px`;
  plate.style.top = `${p.y}px`;
  if (plate.dataset.html !== html) {
    plate.innerHTML = html;
    plate.dataset.html = html;
  }
}

// ---------- inventory / character / vendor windows ----------
// ---------- quest tracker pin ----------
function questTagHtml(id: string): string {
  return `<span class="lp-chip" style="background:${questColor(id)}">${questTag(id)}</span>`;
}

// A guild quest waits while another job is active (the server will neither
// progress nor take it back), so the journal says whose work it is.
function jobPausedText(id: string): string {
  if (questLive(id)) return "";
  const job = (QUESTS as any)[id]?.job;
  return `waits for the ${JOBS[job]?.name || job}`;
}
function jobPausedHtml(id: string): string {
  const t = jobPausedText(id);
  return t ? ` <span style="color:var(--dim)">— ${esc(t)}</span>` : "";
}

// " — The Caerdun Fields" when the duty points at a zone you are not standing in
function awayZoneHtml(id: string): string {
  const away = questAwayZone(id);
  return away ? ` <span style="color:var(--dim)">— ${esc(away)}</span>` : "";
}

// progress as the objective counts it: a met objective is full whatever the
// raw counter says (talk/reach complete on arrival). Shared with the Journal.
function questProgressOf(id: string): number {
  const obj = (QUESTS as any)[id]?.objective;
  const count = obj?.count || 1;
  if (objectiveMet(id)) return count;
  // the world keeps no counter for collect: what is in the bags is the progress
  if (obj?.type === "collect") return Math.min(collectHave(id), count);
  return Math.min(state.quests.get(id)?.progress || 0, count);
}

// ---------- Journal ----------
// Two panes: the duties grouped by where they are (the zone you stand in
// first, a PAUSED group last for guild duties waiting on another job), and
// the selected one in full. Tab, filter and selection live here, not in the
// DOM, because refreshQuests redraws the window on every journal update.
type JournalTab = "active" | "done";
type JournalFilter = "all" | "main" | "side" | "guild";
let journalTab: JournalTab = "active";
let journalFilter: JournalFilter = "all";
let selectedQuestId: string | null = null;
const JOURNAL_FILTERS: [JournalFilter, string][] = [["all", "All"], ["main", "Main"], ["side", "Side"], ["guild", "Guild"]];
const PAUSED_GROUP = "\u0000paused", ELSEWHERE_GROUP = "\u0000elsewhere";

// the zone a duty belongs under: where it points, else where its giver stands
function journalZone(id: string): string | null {
  const giverZone = npcPlace((QUESTS as any)[id]?.giver)?.zone || null;
  // an untaken quest (the next chapter) is picked up where its giver stands
  if (!state.quests.has(id)) return giverZone;
  return questZoneKey(id) || giverZone;
}
// "The Caerdun Fields" files under C, beside "Caerdun"
const zoneSortName = (key: string) => zoneLabel(key).replace(/^The /, "");

function journalGroups(ids: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  ids.forEach((id) => {
    const g = journalTab === "active" && !questLive(id) ? PAUSED_GROUP : (journalZone(id) || ELSEWHERE_GROUP);
    const list = groups.get(g);
    if (list) list.push(id); else groups.set(g, [id]);
  });
  const rank = (g: string) => g === state.zone ? 0 : g === ELSEWHERE_GROUP ? 2 : g === PAUSED_GROUP ? 3 : 1;
  return [...groups.entries()].sort(([a], [b]) =>
    rank(a) - rank(b) || (rank(a) === 1 ? zoneSortName(a).localeCompare(zoneSortName(b)) : 0));
}

function journalRow(id: string): string {
  const q = (QUESTS as any)[id];
  const paused = journalTab === "active" && !questLive(id);
  const side = journalTab === "done" ? ""
    : paused ? `<span class="jprog">${esc(q.job || "")}</span>`
    : `<span class="jprog lp-num">${questProgressOf(id)}/${q.objective.count || 1}</span>`;
  return `<button type="button" class="jrow${id === selectedQuestId ? " sel" : ""}${paused ? " paused" : ""}" tabindex="-1" data-qid="${esc(id)}">`
    + `<i class="jdot"${paused ? "" : ` style="background:${questColor(id)}"`}></i><span class="jname">${esc(q.name)}</span>${side}</button>`;
}

// the "×2" after a stacked reward item; nothing for a single one
function rewardCount(n: number): string {
  return n > 1 ? ` <span class="rcount lp-num">×${n}</span>` : "";
}

function journalDetail(id: string): string {
  const q = (QUESTS as any)[id];
  const done = state.quests.get(id)?.status === 2;
  const color = questColor(id);
  const zone = journalZone(id);
  const place = npcPlace(q.giver);
  const giver = place ? (ZONES[place.zone]?.npcs || []).find((n: any) => n.id === q.giver) : null;
  const giverName = giver?.name || place?.name || q.giver;
  const quote: string = q.desc || q.offer?.at(-1) || q.progress?.[0] || "";
  const count = q.objective.count || 1;
  const prog = done ? count : questProgressOf(id);
  const segs = Array.from({ length: count }, (_, i) => `<i${i < prog ? ` style="background:${color}"` : ""}></i>`).join("");
  const r = q.rewards || {};
  const chips: string[] = [];
  if (r.xp) chips.push(`<span class="jrw xp lp-num">${r.xp.toLocaleString()} XP</span>`);
  if (r.gold) chips.push(`<span class="jrw gold lp-num">${lpIcon("coin", 13, 2)}${r.gold}</span>`);
  stackRewards(r.items || []).forEach(({ key: k, n }) => chips.push(
    `<span class="jrw item"><span class="jicon">${itemIcon(ITEMS[k])}</span>${esc(ITEMS[k]?.name || k)}${rewardCount(n)}</span>`));
  if (r.title) chips.push(`<span class="jrw item">Title · ${esc(r.title)}</span>`);
  const tracked = !done && !!state.self && isTracked(state.self.charId, id);
  return `<div class="jmeta">${questTagHtml(id)}<span>Lv ${q.min_lvl || 1}${zone ? ` · ${esc(zoneLabel(zone))}` : ""}</span></div>`
    + `<h2 class="jtitle">${esc(q.name)}</h2>`
    + `<div class="jgiver">From <span class="jnpc">${esc(giverName)}</span>${giver?.title ? ` · ${esc(giver.title)}` : ""}</div>`
    + (quote ? `<blockquote class="lp-spoken jquote">${esc(quote)}</blockquote>` : "")
    + `<div class="jobj"><div class="jobjhead"><span>${esc(q.objective.label)}${done ? "" : jobPausedHtml(id) || awayZoneHtml(id)}</span>`
    + `<b class="lp-num" style="color:${color}">${prog} / ${count}</b></div>`
    + `<div class="jsegs" style="grid-template-columns:repeat(${count},minmax(0,1fr))">${segs}</div></div>`
    + (chips.length ? `<div><div class="lp-section jrwhead">Rewards</div><div class="jrws">${chips.join("")}</div></div>` : "")
    + (done ? "" : `<div class="jfoot">`
      + `<button type="button" class="jtrack" tabindex="-1" aria-pressed="${tracked}"><span class="lp-diamond"></span>Tracked</button>`
      + `<button type="button" class="btn jmap" tabindex="-1">Show on map</button></div>`);
}

// ---------- the next chapter ----------
// When no main chapter is in hand, the Journal and the tracker name the next
// one (quest_index.storyStep): who gives it and where, or the level it opens
// at. Its key is the untaken quest's, so it never collides with a duty's.
function storyNext(): StoryStep | null {
  const step = storyStep();
  return step && step.state !== "active" ? step : null;
}
function storyGiver(key: string): { name: string; title: string; zone: string | null } {
  const giver = (QUESTS as any)[key]?.giver;
  const place = npcPlace(giver);
  const npc = place ? (ZONES[place.zone]?.npcs || []).find((n: any) => n.id === giver) : null;
  return { name: npc?.name || place?.name || giver, title: npc?.title || "", zone: place?.zone || null };
}
// "Speak with Marshal Grett" / "At level 4, speak with Marshal Grett"
function storyAsk(step: StoryStep): string {
  const name = storyGiver(step.key).name;
  return step.state === "level" ? `At level ${step.opensAt}, speak with ${name}` : `Speak with ${name}`;
}
// "in the Caerdun Fields" when the giver stands in another zone
function storyAway(key: string): string {
  const zone = storyGiver(key).zone;
  return zone && zone !== state.zone ? `in ${zoneLabel(zone).replace(/^The /, "the ")}` : "";
}

function storyRow(step: StoryStep): string {
  const q = (QUESTS as any)[step.key];
  const side = step.state === "level" ? `Lv ${step.opensAt}` : "Next";
  return `<button type="button" class="jrow story${step.key === selectedQuestId ? " sel" : ""}" tabindex="-1" data-qid="${esc(step.key)}">`
    + `<i class="jdot" style="background:${MAIN_COLOR}"></i><span class="jname">${esc(q.name)}</span><span class="jprog lp-num">${side}</span></button>`;
}

function storyDetail(step: StoryStep): string {
  const q = (QUESTS as any)[step.key];
  const g = storyGiver(step.key);
  const where = g.zone ? ` in ${zoneLabel(g.zone).replace(/^The /, "the ")}` : "";
  const ask = step.state === "level"
    ? `The story continues at level ${step.opensAt}. Then speak with ${g.name}${where}.`
    : `Speak with ${g.name}${where} to take up the story.`;
  const meanwhile = step.state === "level" ? nearbyOffers(3) : [];
  const offers = meanwhile.map((k) => {
    const o = (QUESTS as any)[k];
    const og = storyGiver(k);
    return `<div class="jnext"><i class="jdot" style="background:${questColor(k)}"></i><span class="jname">${esc(o.name)}</span>`
      + `<span class="jprog">${esc(og.name)}${og.zone ? ` · ${esc(zoneLabel(og.zone))}` : ""}</span></div>`;
  }).join("");
  return `<div class="jmeta">${questTagHtml(step.key)}<span>Next chapter · opens at Lv ${step.opensAt}${g.zone ? ` · ${esc(zoneLabel(g.zone))}` : ""}</span></div>`
    + `<h2 class="jtitle">${esc(q.name)}</h2>`
    + `<div class="jgiver">From <span class="jnpc">${esc(g.name)}</span>${g.title ? ` · ${esc(g.title)}` : ""}</div>`
    + `<div class="jobj"><div class="jobjhead"><span>${esc(ask)}</span></div></div>`
    + (offers ? `<div><div class="lp-section jrwhead">Meanwhile</div>${offers}</div>` : "")
    + `<div class="jfoot"><button type="button" class="btn jmap" tabindex="-1">Show on map</button></div>`;
}

function renderJournal(): void {
  const win = $("win-quests");
  const active = [...state.quests].filter(([id, st]) => st.status === 1 && (QUESTS as any)[id]).length;
  (win.querySelector(".jcount") as HTMLElement).textContent = active ? String(active) : "";
  win.querySelectorAll<HTMLElement>("[data-jtab]").forEach((t) =>
    t.setAttribute("aria-selected", String(t.dataset.jtab === journalTab)));
  // a closed Journal is redrawn when it opens (toggleWindow → refreshQuests)
  if (!win.classList.contains("on")) return;
  const body = win.querySelector(".wbody") as HTMLElement;
  const keepScroll = (body.querySelector(".jlist") as HTMLElement | null)?.scrollTop || 0;
  // every quest update redraws the pane; the detail keeps its place only while
  // it still shows the same duty, so reading a long one is not snapped back
  const oldDetail = body.querySelector<HTMLElement>(".jdetail");
  const detailFor = oldDetail?.dataset.qid || null;
  const keepDetail = oldDetail?.scrollTop || 0;
  const story = journalTab === "active" && (journalFilter === "all" || journalFilter === "main") ? storyNext() : null;
  if (!state.quests.size && !courtHasBounties() && !story) {
    const hint = { heartwood: "Chanter Ives waits at the song-steps in Heartwood.",
                   moonmere: "Archivist Junn waits at the academy's returns desk, up the causeway road in Moonmere." }[state.zone]
      || "Gate-Sergeant Ottey waits at the drill yards in Caerdun.";
    body.innerHTML = `<div class="jempty">No duties yet. ${hint}</div>`;
    return;
  }
  const ids: string[] = [];
  state.quests.forEach((st, id) => {
    if (!(QUESTS as any)[id] || st.status !== (journalTab === "active" ? 1 : 2)) return;
    if (journalFilter !== "all" && questCategory(id) !== journalFilter) return;
    ids.push(id);
  });
  const groups = journalGroups(ids);
  const shown = [...(story ? [story.key] : []), ...groups.flatMap(([, g]) => g)];
  if (!selectedQuestId || !shown.includes(selectedQuestId)) selectedQuestId = shown[0] || null;
  const chips = JOURNAL_FILTERS.map(([f, label]) =>
    `<button type="button" class="lp-chipbtn${f === journalFilter ? " on" : ""}" tabindex="-1" data-jfilter="${f}" aria-pressed="${f === journalFilter}">${label}</button>`).join("");
  const list = (story ? `<div class="lp-section jgroup">Main story · next</div>${storyRow(story)}` : "")
    + groups.map(([g, gids]) => {
      const label = g === PAUSED_GROUP ? "Paused · needs another job" : g === ELSEWHERE_GROUP ? "Elsewhere" : zoneLabel(g);
      return `<div class="lp-section jgroup">${esc(label)}</div>${gids.map(journalRow).join("")}`;
    }).join("") + courtJournalGroup(journalTab, journalFilter);
  const inTab = [...state.quests.values()].some((st) => st.status === (journalTab === "active" ? 1 : 2));
  const none = !inTab ? (journalTab === "done" ? "Nothing completed yet." : "No duties in hand.") : "None of these.";
  body.innerHTML = `<div class="jlist"><div class="jchips">${chips}</div>${list || `<div class="jnone">${none}</div>`}</div>`
    + `<div class="jdetail" data-qid="${esc(selectedQuestId || "")}">${courtJournalDetail(!!selectedQuestId) ?? (story && selectedQuestId === story.key ? storyDetail(story) : selectedQuestId ? journalDetail(selectedQuestId) : "")}</div>`;
  (body.querySelector(".jlist") as HTMLElement).scrollTop = keepScroll;
  if (selectedQuestId && selectedQuestId === detailFor)
    (body.querySelector(".jdetail") as HTMLElement).scrollTop = keepDetail;
}

// one delegated listener for everything the Journal redraws
function initJournal(): void {
  const win = $("win-quests");
  win.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>("[data-jtab]");
    if (tab) { journalTab = tab.dataset.jtab as JournalTab; selectedQuestId = null; renderJournal(); return; }
    const filter = t.closest<HTMLElement>("[data-jfilter]");
    if (filter) { journalFilter = filter.dataset.jfilter as JournalFilter; renderJournal(); return; }
    const row = t.closest<HTMLElement>(".jrow");
    if (row) { selectedQuestId = row.dataset.qid || null; renderJournal(); return; }
    if (!selectedQuestId) return;
    if (t.closest(".jtrack") && state.self) {
      toggleTracked(state.self.charId, selectedQuestId);
      api.refreshQuests(); // the tracker re-orders around the pinned duty
      return;
    }
    if (t.closest(".jmap")) {
      // open first: toggleWindow resets the map to where you stand
      if (!$("win-map").classList.contains("on")) api.toggleWindow("map");
      showZoneOnMap(journalZone(selectedQuestId) || state.zone, selectedQuestId);
    }
  });
  // keep focus where it was, so Space (jump) and Enter never re-press a row
  win.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("button")) e.preventDefault();
  });
}

// ---------- Duties tracker ----------
const TRACKER_ROWS = 4;
const TRACKER_GAP = 12; // the row gap in style.css (#quest-tracker .trows)
const tracker = {
  collapsed: (() => { try { return localStorage.getItem("vanai_duties_collapsed") === "1"; } catch { return false; } })(),
  focusId: null as string | null,
  focusTracked: false, // the focus came from the tracked set, not proximity
  nearestId: null as string | null, // the nearest duty when the rows were drawn
  distText: "",
  lastTick: 0,
  x: 0, z: 0, yaw: 0, // the player's last position and camera heading, for render
};

// the duty with the closest in-zone destination; activeDests only holds live
// duties, and beaconsNow is not used because it trims near points
function nearestDuty(x: number, z: number): string | null {
  let best: string | null = null, bestD = Infinity;
  activeDests().forEach((d) => {
    const dd = Math.hypot(d.x - x, d.z - z);
    if (dd < bestD) { bestD = dd; best = d.key; }
  });
  return best;
}

// "↗ 140 m" toward the focused duty's nearest in-zone point, else its count
function focusMeta(id: string, camYaw: number): string {
  let best: QuestDest | null = null, bestD = Infinity;
  activeDests().forEach((d) => {
    if (d.key !== id) return;
    const dd = Math.hypot(d.x - tracker.x, d.z - tracker.z);
    if (dd < bestD) { bestD = dd; best = d; }
  });
  if (!best) return `${questProgressOf(id)}/${(QUESTS as any)[id]?.objective?.count || 1}`;
  const b = best as QuestDest;
  return `${arrow8(Math.atan2(b.x - tracker.x, b.z - tracker.z) - camYaw)} ${fmtDist(bestD)}`;
}
function renderTracker(): void {
  const t = $("quest-tracker");
  const active: string[] = [];
  state.quests.forEach((st, id) => { if (st.status === 1 && (QUESTS as any)[id]) active.push(id); });
  // the story always has a row: the main chapter in hand, or the next one
  const step = storyStep();
  const next = step && step.state !== "active" ? step : null;
  const all = next ? [next.key, ...active] : active;
  if (!all.length) {
    t.hidden = true;
    t.innerHTML = "";
    tracker.focusId = null;
    tracker.nearestId = null;
    // the column observer ignores changes inside Duties, so the ferry panel
    // would stay folded (tight) with the whole column free
    fitTrackerRows();
    return;
  }
  t.hidden = false;
  // live tracked duties, then the nearest, then paused tracked ones, so a run
  // of pinned guild duties waiting on another job cannot push the one you can
  // act on out of view (orderTracker drops the nearest's later repeat)
  const pinned = state.self ? getTracked(state.self.charId) : [];
  const nearest = nearestDuty(tracker.x, tracker.z);
  const tracked = [...(step ? [step.key] : []), ...pinned.filter(questLive), ...(nearest ? [nearest] : []), ...pinned.filter((id) => !questLive(id))];
  const ids = orderTracker(all, tracked, nearest).slice(0, TRACKER_ROWS);
  // the focus is chosen among the rows actually drawn, never one sliced off
  const trackedLive = pinned.find((id) => ids.includes(id) && questLive(id)) || null;
  tracker.focusId = trackedLive || (nearest && ids.includes(nearest) ? nearest : null);
  tracker.focusTracked = !!trackedLive;
  tracker.nearestId = nearest;
  const chev = tracker.collapsed ? "chevDown" : "chevUp";
  const head = `<div class="thead"><span class="lp-label tlabel">DUTIES</span>`
    + `<span class="tcount" data-total="${all.length}">${ids.length} of ${all.length} shown</span>`
    + `<button type="button" class="lp-iconbtn tcollapse" tabindex="-1" aria-expanded="${!tracker.collapsed}" `
    + `aria-label="${tracker.collapsed ? "Expand" : "Collapse"} duties">${lpIcon(chev, 12, 2.2)}</button></div>`;
  if (tracker.collapsed) { t.innerHTML = head; fitTrackerRows(); return; }
  tracker.distText = "";
  const rows = ids.map((id) => {
    const q = (QUESTS as any)[id];
    if (next && id === next.key) return storyTrackerRow(next, id === tracker.focusId);
    const count = q.objective.count || 1;
    const prog = questProgressOf(id);
    const color = questColor(id);
    const focus = id === tracker.focusId;
    const paused = jobPausedText(id);
    const away = paused ? "" : questAwayZone(id);
    // the design's "in the Caerdun Fields": zone names open with a capital The
    const note = paused || (away ? `in ${away.replace(/^The /, "the ")}` : "");
    let meta: string;
    if (focus) {
      tracker.distText = focusMeta(id, tracker.yaw);
      meta = `<span class="tmeta tdist lp-num">${esc(tracker.distText)}</span>`;
    } else meta = `<span class="tmeta lp-num">${prog}/${count}</span>`;
    const segs = focus
      ? `<div class="tsegs" style="grid-template-columns:repeat(${count},minmax(0,1fr))">`
        + Array.from({ length: count }, (_, i) => `<i${i < prog ? ` style="background:${color}"` : ""}></i>`).join("")
        + `</div>`
      : "";
    return `<div class="trow${focus ? " focus" : ""}">`
      + `<div class="tl1"><span class="lp-chip" style="background:${color}">${questTag(id)}</span>`
      + `<span class="tname">${esc(q.name)}</span>${meta}</div>`
      + `<div class="tobj">${esc(q.objective.label)}</div>`
      + (note ? `<div class="tnote">${esc(note)}</div>` : "")
      + segs + `</div>`;
  });
  t.innerHTML = `${head}<div class="trows">${rows.join("")}</div>`;
  fitTrackerRows();
}

// The next chapter's row: its name, who to speak with (and from what level),
// and where; the arrow and distance when it is the nearest thing to do here.
function storyTrackerRow(step: StoryStep, focus: boolean): string {
  const q = (QUESTS as any)[step.key];
  let meta = `<span class="tmeta lp-num">${step.state === "level" ? `Lv ${step.opensAt}` : "Next"}</span>`;
  if (focus) {
    tracker.distText = focusMeta(step.key, tracker.yaw);
    meta = `<span class="tmeta tdist lp-num">${esc(tracker.distText)}</span>`;
  }
  const note = storyAway(step.key);
  return `<div class="trow story${focus ? " focus" : ""}">`
    + `<div class="tl1"><span class="lp-chip" style="background:${MAIN_COLOR}">${questTag(step.key)}</span>`
    + `<span class="tname">${esc(q.name)}</span>${meta}</div>`
    + `<div class="tobj">${esc(storyAsk(step))}</div>`
    + (note ? `<div class="tnote">${esc(note)}</div>` : "")
    + `</div>`;
}

// The column stops short of the dock and Duties shrinks inside it, so on a
// short window (1280x720, or with the ferry panel in the column) the last row
// would be sliced mid-line. Drop whole rows instead, after the focus row has
// claimed its room, and say how many are left showing; when not even the
// header fits, Duties leaves the column entirely (`nofit`). Called after every
// draw and whenever the column's room changes; it only toggles `hidden` and
// that class.
//
// The ferry panel shares the column, and at 720px it left Duties only its
// header. So when the focus row (or, with no focus, the first) cannot fit and
// the ferry panel is in the column, the column goes `tight` — smaller gaps and
// a compact ferry panel (style.css) — and the fit runs once more. Both passes
// toggle classes only, so the column's MutationObserver is not re-triggered.
function fitTrackerRows(): void {
  const col = document.getElementById("right-col");
  col?.classList.remove("tight");
  const t = document.getElementById("quest-tracker");
  if (!t || t.hidden) return;
  if (fitTrackerOnce(t) || !col?.querySelector(":scope > #ferry-panel")) return;
  col.classList.add("tight");
  fitTrackerOnce(t);
}

// One fit at the column's current room; true when the row that matters most
// (the focus, else the first) is showing, or when collapsed Duties fits whole.
function fitTrackerOnce(t: HTMLElement): boolean {
  t.classList.remove("nofit");
  // with the HUD itself hidden every rect is zero and nothing can be measured
  if (!t.getClientRects().length) return true;
  const box = t.querySelector<HTMLElement>(".trows");
  const rows = box ? Array.from(box.children) as HTMLElement[] : [];
  rows.forEach((r) => { r.hidden = false; });
  // the tracker's own bottom padding stays clear, as the design spaces it
  const bottom = t.getBoundingClientRect().bottom - parseFloat(getComputedStyle(t).paddingBottom || "0");
  const head = t.querySelector<HTMLElement>(".thead");
  if (head && head.getBoundingClientRect().bottom > bottom + 0.5) { t.classList.add("nofit"); return false; }
  if (!box) return true;
  const room = bottom - box.getBoundingClientRect().top;
  const heights = rows.map((r) => r.getBoundingClientRect().height);
  const used = heights.reduce((a, h, i) => a + h + (i ? TRACKER_GAP : 0), 0);
  let shown = rows.length;
  if (used > room + 0.5) {
    const fi = rows.findIndex((r) => r.classList.contains("focus"));
    let total = fi >= 0 ? heights[fi] : 0;
    const keep = new Set<number>(fi >= 0 && total <= room ? [fi] : []);
    if (fi >= 0 && !keep.size) total = 0;
    for (let i = 0; i < rows.length; i++) {
      if (i === fi) continue;
      const need = heights[i] + (keep.size ? TRACKER_GAP : 0);
      if (total + need > room + 0.5) break; // later rows go too, so the order still reads
      total += need;
      keep.add(i);
    }
    rows.forEach((r, i) => { r.hidden = !keep.has(i); });
    shown = keep.size;
  }
  const count = t.querySelector<HTMLElement>(".tcount");
  if (count) count.textContent = `${shown} of ${count.dataset.total} shown`;
  const lead = Math.max(0, rows.findIndex((r) => r.classList.contains("focus")));
  return !rows.length || !rows[lead].hidden;
}

// 4 Hz: the focused row's arrow and distance, and a new focus when proximity
// picked it and something else is now nearer
function tickTracker(myX: number, myZ: number, camYaw: number, nowS: number): void {
  tracker.x = myX; tracker.z = myZ; tracker.yaw = camYaw;
  if (nowS - tracker.lastTick < 0.25) return;
  tracker.lastTick = nowS;
  if (tracker.collapsed || (!tracker.focusId && !activeDests().length)) return;
  // compared with the nearest at draw time, not the focus: when the nearest
  // is not among the drawn rows the focus is null and would never match
  if (!tracker.focusTracked && nearestDuty(myX, myZ) !== tracker.nearestId) { renderTracker(); return; }
  if (!tracker.focusId) return;
  const text = focusMeta(tracker.focusId, camYaw);
  if (text === tracker.distText) return;
  tracker.distText = text;
  const dist = $("quest-tracker").querySelector(".tdist");
  if (dist) dist.textContent = text;
}

// ---------- crafting ----------
function renderCrafting(): void {
  const body = $("win-craft").querySelector(".wbody")!;
  body.innerHTML = "";
  const have = (key: string) =>
    state.inventory.filter((r: any) => r.item_key === key && !r.equipped_slot).reduce((a: number, r: any) => a + r.qty, 0);
  Object.values(RECIPES as any).forEach((craft: any) => {
    body.insertAdjacentHTML("beforeend",
      `<div class="wsection" style="margin:8px 0 2px">${esc(craft.name)}</div>`);
    craft.recipes.forEach((r: any) => {
      const out = ITEMS[r.output];
      const div = el("div", "invrow");
      const inputs = Object.entries(r.inputs).map(([k, q]: [string, any]) => {
        const h = have(k);
        return `<span class="${h >= q ? "up" : "down"}" style="color:${h >= q ? "var(--uncommon)" : "#e08a7a"}">${esc(ITEMS[k]?.name || k)} ${h}/${q}</span>`;
      }).join(" · ");
      div.innerHTML = `<span class="iicon">${itemIcon(out)}</span>
        <span class="iname ${rarityCls(r.output)}">${esc(out?.name || r.output)}</span>
        <span class="imeta" style="flex:1">${inputs}</span>`;
      attachTip(div, () => itemTipHtml(r.output));
      const can = Object.entries(r.inputs).every(([k, q]: [string, any]) => have(k) >= q);
      const b = el("button", "btn" + (can ? " gold" : ""), "Craft");
      if (!can) (b as HTMLButtonElement).disabled = true;
      b.addEventListener("click", async () => {
        const issued = inventoryTicket();
        const res = await rest.craft(r.id);
        if (res.error) { api.addChat("system", "", res.error); return; }
        applyInventory(issued, res.inventory);
        api.addChat("loot", "", `You craft ${res.crafted}.`);
        sfx.loot();
        renderCrafting();
      });
      div.appendChild(b);
      body.appendChild(div);
    });
  });
  body.insertAdjacentHTML("beforeend",
    `<div class="imeta" style="margin-top:8px">Field craft, explorer's craft. Materials come from the hunt.</div>`);
}

// ---------- social ----------
// The who list arrives over the wire, so it is kept here and re-rendered
// whenever the window is opened again.
let lastWho: any = null;

function whoSearch(q: string, page = 1): void {
  const box = document.getElementById("who-results");
  if (box) box.innerHTML = `<div class="imeta">Looking…</div>`;
  send("who_list", { q, page });
}

// Open the Player Search window, optionally with a name typed in.
// Opens the window directly rather than through toggleWindow so the query is
// carried into the first request instead of firing a bare search after it.
export function openWhoSearch(q: string): void {
  const w = $("win-who");
  if (!w.classList.contains("on")) { w.classList.add("on"); renderWhoSearch(q); return; }
  const input = document.getElementById("who-q") as HTMLInputElement | null;
  if (input) input.value = q;
  whoSearch(q);
}

// Any roster row that stands for another explorer raises the player menu beneath
// itself, so the who list and the friends list offer the same actions — minus
// Trade, which needs the two of you standing together and so belongs to the
// world click, not to a roster of explorers who may be a zone away or offline.
function pickPlayer(row: HTMLElement, name: string, hide: string[] = []): void {
  if (!name || name === state.self?.name) return;
  row.classList.add("pickable");
  row.addEventListener("click", () => {
    const r = row.getBoundingClientRect();
    openPlayerMenu(name, r.left, r.bottom, hide);
  });
}

function fillWhoResults(box: HTMLElement, msg: any): void {
  const players: any[] = msg?.players || [];
  box.innerHTML = "";
  box.insertAdjacentHTML("beforeend",
    `<div class="imeta" id="who-count">${msg?.count ?? players.length} abroad tonight</div>`);
  if (!players.length) {
    box.insertAdjacentHTML("beforeend", `<div class="imeta">No explorers answer to that name.</div>`);
    return;
  }
  players.forEach((p) => {
    const row = el("div", "invrow who-row");
    row.dataset.name = p.name;
    row.innerHTML = `<span class="iname">${esc(p.name)}</span>
      <span class="imeta">Lv ${p.level} ${esc(p.job || "")}</span>
      <span class="imeta">${esc(p.zone_name || p.zone || "")}</span>`;
    pickPlayer(row, p.name, ["trade"]);
    // adding a friend from the search is one click, not a menu away; an explorer
    // already kept close says so instead
    if (p.name !== state.self?.name) {
      if (friendNames.has(p.name.toLowerCase())) {
        row.insertAdjacentHTML("beforeend", `<span class="who-friend">Friend</span>`);
      } else {
        const add = el("button", "btn who-add", "Add Friend");
        add.tabIndex = -1;
        add.addEventListener("click", (e) => { e.stopPropagation(); toggleFriend(p.name, "add"); });
        row.appendChild(add);
      }
    }
    box.appendChild(row);
  });
  // the query the page belongs to rides back with it, so paging keeps it
  if ((msg?.pages ?? 1) > 1) box.appendChild(pager(msg.page, msg.pages, (n) => whoSearch(msg.q ?? "", n)));
}

const SECTION = "margin:2px 0 4px";

// Friends and Company come back from the one /friends call, so a fetch is
// shared briefly between the two windows. It is dropped the moment a friend
// is added or removed, so neither list lingers on a stale roster.
let socialCache: Promise<any> | null = null;
// who is on the friends list, lower-cased: the player menu and the search's
// rows ask it whether to offer Add or Remove
const friendNames = new Set<string>();
let friendsKnown = false;
// the page each roster was last left on
let friendsPage = 1, companyPage = 1;
function fetchSocial(): Promise<any> {
  if (!socialCache) {
    socialCache = rest.friends().then((r: any) => {
      if (Array.isArray(r?.friends)) {
        friendNames.clear();
        friendsKnown = true;
        r.friends.forEach((f: any) => friendNames.add(String(f.name).toLowerCase()));
      }
      return r;
    });
    // long enough for both windows to open off one request, short enough that
    // the next opening asks the server again
    setTimeout(() => { socialCache = null; }, 2000);
  }
  return socialCache;
}

// one explorer of the roster — a friend, or a member of the company.
// `hide` is passed through to the player menu when the row is clickable;
// pass null to leave the row inert.
function explorerRow(p: any, hide: string[] | null = null): HTMLElement {
  const div = el("div", "invrow");
  // plain "Online"/"Offline" reads at a glance; the where-and-what trails it
  const where = [`Lv ${p.level} ${esc(p.job || "")}`.trim(), esc(p.zone || "")].filter(Boolean).join(" · ");
  const status = p.online
    ? `<span class="imeta online">Online</span>${where ? `<span class="imeta">${where}</span>` : ""}`
    : `<span class="imeta">Offline</span>`;
  // a lit lamp or a cold one: the BLM flame in brass-gold, or ash grey
  div.innerHTML = `<span class="iname lamp"><span class="llamp${p.online ? " lit" : ""}">${lpIcon("job_BLM", 14)}</span>${esc(p.name)}</span>${status}`;
  if (hide) pickPlayer(div, p.name, hide);
  return div;
}

function renderWhoSearch(q = ""): void {
  const body = $("win-who").querySelector(".wbody")! as HTMLElement;
  // built synchronously, so #who-results exists before the reply can land
  body.innerHTML = `
    <div class="wsection" style="${SECTION};margin-bottom:6px">Abroad Tonight</div>
    <div class="fieldrow" id="who-row"><button class="btn" id="who-go">Search</button></div>
    <div id="who-results"></div>
    <div class="imeta" style="margin-top:10px">Click an explorer above to invite, whisper or examine.</div>`;
  const qInput = textInput("who-q", "Search a name…", () => whoSearch(qInput.value.trim()));
  qInput.value = q;
  $("who-row").prepend(qInput);
  $("who-go").addEventListener("click", () => whoSearch(qInput.value.trim()));
  if (lastWho) fillWhoResults($("who-results"), lastWho);
  // the friends list decides each row's Add Friend; fetched first so the
  // rows that land are already right, and redrawn if it lands after them
  fetchSocial().then(() => { if (lastWho && document.getElementById("who-results")) fillWhoResults($("who-results"), lastWho); });
  whoSearch(q);
}

// The friends list is only the list (Philip, 2026-10-14): friends are added
// from Player Search, the world click or /friend, and removed by clicking a
// name and choosing Remove from Friends in the menu that opens.
async function renderFriends(): Promise<void> {
  const body = $("win-friends").querySelector(".wbody")! as HTMLElement;
  body.innerHTML = `<div class="imeta">Loading…</div>`;
  const res = await fetchSocial();
  body.innerHTML = "";
  const friends: any[] = res.friends || [];
  // online first, then by name: the explorers you can reach now lead the list
  const sorted = friends.slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
  const online = friends.filter((f) => f.online).length;
  body.insertAdjacentHTML("beforeend",
    `<div class="wsection" style="${SECTION}">Friends <span class="imeta lp-num">${online} of ${friends.length} online</span></div>`);
  const pg = pageOf(sorted, friendsPage);
  friendsPage = pg.page;
  pg.rows.forEach((f) => body.appendChild(explorerRow(f, ["trade"])));
  if (!friends.length) {
    body.insertAdjacentHTML("beforeend",
      `<div class="imeta">No explorers kept close yet. Find one in Player Search and choose Add Friend, or <b>/friend Name</b>.</div>`);
  }
  if (pg.pages > 1) body.appendChild(pager(pg.page, pg.pages, (n) => { friendsPage = n; renderFriends(); }));
  body.insertAdjacentHTML("beforeend",
    `<div class="imeta" style="margin-top:10px">${friends.length ? "Click a name to invite, whisper, examine or remove. " : ""}Emotes: /cheer /wave</div>`);
}

async function renderCompany(): Promise<void> {
  const body = $("win-company").querySelector(".wbody")! as HTMLElement;
  body.innerHTML = `<div class="imeta">Loading…</div>`;
  const res = await fetchSocial();
  body.innerHTML = "";
  if (!res.company) {
    body.insertAdjacentHTML("beforeend",
      `<div class="imeta">No company banner yet. <b>/company create &lt;name&gt;</b> to found one, or await an invitation. One banner per explorer.</div>`);
    return;
  }
  body.insertAdjacentHTML("beforeend", `<div class="wsection" style="${SECTION}">The ${esc(res.company.name)}</div>`);
  const pg = pageOf(res.company.members || [], companyPage);
  companyPage = pg.page;
  pg.rows.forEach((m: any) => body.appendChild(explorerRow(m)));
  if (pg.pages > 1) body.appendChild(pager(pg.page, pg.pages, (n) => { companyPage = n; renderCompany(); }));
  body.insertAdjacentHTML("beforeend",
    `<div class="imeta" style="margin-top:10px">/c &lt;message&gt; speaks to the company · /company leave to depart</div>`);
}

// One brass button per prompt: while a Raise is on offer, accepting it is the
// death screen's primary action and the walk home drops to the plain kind;
// it takes the brass back when the offer goes.
function setRaiseOffer(on: boolean): void {
  $("raise-offer").classList.toggle("on", on);
  $("release-btn").classList.toggle("gold", !on);
}

// ---------- prompt cards ----------
// A timed card (the party invite, the gate) shows its time left as m:ss and a
// draining bar, refreshed on one 250 ms interval that runs only while one is
// up. Trade and raise have no known timeout, so they draw neither.
const promptDeadline = new Map<string, { end: number; total: number }>();
let promptTick: ReturnType<typeof setInterval> | null = null;
function fmtClock(s: number): string {
  const n = Math.max(0, Math.ceil(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function drawPromptTimers(): void {
  const now = performance.now();
  promptDeadline.forEach((d, id) => {
    const card = $(id);
    const left = Math.max(0, (d.end - now) / 1000);
    (card.querySelector(".pcount") as HTMLElement).textContent = fmtClock(left);
    (card.querySelector(".pbar > i") as HTMLElement).style.width = `${(left / d.total) * 100}%`;
  });
}
function setPromptTimer(id: string, seconds: number | null): void {
  const card = $(id);
  card.classList.toggle("timed", !!seconds);
  if (seconds) promptDeadline.set(id, { end: performance.now() + seconds * 1000, total: seconds });
  else {
    promptDeadline.delete(id);
    (card.querySelector(".pcount") as HTMLElement).textContent = "";
  }
  if (promptDeadline.size && !promptTick) promptTick = setInterval(drawPromptTimers, 250);
  if (!promptDeadline.size && promptTick) { clearInterval(promptTick); promptTick = null; }
  drawPromptTimers();
}

// ---------- party and trade invites ----------
// One card serves both. The party invite lapses on the server after 60 s
// (world.rb PARTY_INVITE_TTL); one module timer hides it then, and is cleared
// by every new invite so a stale party timeout can never close a trade invite
// that replaced it.
const PARTY_INVITE_S = 60;
let inviteTimer: ReturnType<typeof setTimeout> | null = null;
function showInviteCard(kind: "party" | "trade", from: string): void {
  const ip = $("invite-prompt");
  if (inviteTimer) { clearTimeout(inviteTimer); inviteTimer = null; }
  ip.dataset.kind = kind;
  const party = kind === "party";
  const icon = ip.querySelector(".picon") as HTMLElement;
  icon.style.color = party ? "var(--lp-party)" : "#f0c06a";
  icon.innerHTML = lpIcon(party ? "social" : "coin", 20, 1.7);
  (ip.querySelector(".itext") as HTMLElement).innerHTML =
    `<b>${esc(from)}</b> ${party ? "invites you to their party." : "wants to trade with you."}`;
  ($("inv-yes") as HTMLElement).textContent = party ? "Join" : "Trade";
  ip.classList.add("on");
  setPromptTimer("invite-prompt", party ? PARTY_INVITE_S : null);
  if (party) inviteTimer = setTimeout(hideInvite, PARTY_INVITE_S * 1000);
}
function hideInvite(): void {
  if (inviteTimer) { clearTimeout(inviteTimer); inviteTimer = null; }
  $("invite-prompt").classList.remove("on");
  setPromptTimer("invite-prompt", null);
}

// ---------- the Capital's gate ----------
// The warning before the empty city, asked by its keeper (Warden Morrow) when
// the leader or a solo player takes her up on it. Every party member sees it at
// once; the server counts the accepts and a timeout is a decline (one decline
// and nobody goes). Solo players see the same words with no roster line.
// Anyone may go back in after the Regent yields, so the roster line names who
// has not seen it yet only when there is someone.
let gateTimer: ReturnType<typeof setTimeout> | null = null;
function showGatePrompt(msg: any): void {
  const gp = $("gate-prompt");
  (gp.querySelector(".gtext") as HTMLElement).textContent = msg.text || "";
  const pend = gp.querySelector(".gpending") as HTMLElement;
  const names: string[] = msg.pending || [];
  const keeper = msg.by || "The warden";
  pend.textContent = msg.solo
    ? (names.length ? "You have not yet seen the Regent yield. This is your story's version of the city."
      : "You have seen the Regent yield. Inside, the city is as it was before.")
    : `${msg.from} asks ${keeper} to open the way.` + (names.length ? ` Still to see the Regent yield: ${names.join(", ")}.` : "");
  const yes = $("gate-yes") as HTMLButtonElement;
  yes.disabled = false;
  yes.textContent = "Enter the empty city";
  gp.classList.add("on");
  if (gateTimer) clearTimeout(gateTimer);
  let left = msg.timeout || 30;
  setPromptTimer("gate-prompt", left);
  // the header's m:ss and the bar already show the time; this line keeps the rule
  (gp.querySelector(".gcount") as HTMLElement).textContent = "Silence is a no.";
  const tick = () => {
    if (left-- <= 0) { hideGatePrompt(); return; }
    gateTimer = setTimeout(tick, 1000);
  };
  tick();
}
function hideGatePrompt(): void {
  if (gateTimer) { clearTimeout(gateTimer); gateTimer = null; }
  $("gate-prompt").classList.remove("on");
  setPromptTimer("gate-prompt", null);
}

// ---------- teleport crystals ----------
// The crystal's menu: your home point (set it here, or see where it is), then
// every crystal you have attuned to, grouped by region. Going home is free;
// anywhere else costs the fare the server quoted.
export function showTravelMenu(msg: any): void {
  const w = $("win-travel");
  (w.querySelector(".wtitle") as HTMLElement).textContent = msg.name || "Teleport Crystal";
  const body = w.querySelector(".wbody")!;
  body.innerHTML = "";
  const isHome = msg.home && msg.home === msg.from;
  const homeRow = el("div", "invrow");
  const homeZone = msg.home ? ZONES[msg.home_zone]?.name || msg.home_zone : null;
  homeRow.innerHTML = `<span class="iname">Home point</span><span class="imeta">${isHome ? "This crystal" : homeZone ? esc(homeZone) : "Not set"}</span>`;
  if (!isHome) {
    const b = el("button", "btn primary", "Set here");
    b.addEventListener("click", () => send("set_home", { id: msg.from }));
    homeRow.appendChild(b);
  }
  body.appendChild(homeRow);
  const dests = msg.destinations || [];
  if (!dests.length) {
    body.insertAdjacentHTML("beforeend", `<div class="imeta" style="margin-top:8px">No other crystal knows you yet. Touch one wherever you find it.</div>`);
  }
  // regions come from zones.json; a zone without one files under its own name
  const groups = new Map<string, any[]>();
  dests.forEach((d: any) => {
    const region = ZONES[d.zone]?.region || d.zone_name;
    const arr = groups.get(region);
    if (arr) arr.push(d); else groups.set(region, [d]);
  });
  groups.forEach((list, region) => {
    body.insertAdjacentHTML("beforeend",
      `<div class="wsection" style="margin:10px 0 2px">${esc(region)}</div>`);
    list.forEach((d: any) => {
      const home = d.id === msg.home;
      const div = el("div", "invrow");
      div.innerHTML = `<span class="iname">${esc(d.zone_name)}${home ? ' <span style="color:var(--gold)">⌂</span>' : ""}</span>`;
      // the fare rides on the button; going home is free
      const b = el("button", "btn primary sm", home ? "Teleport · free" : `Teleport · ${d.fee ?? msg.fee}g`); // d.fee: a held zone's half fare
      b.addEventListener("click", () => { send("milestone_travel", { id: d.id }); w.classList.remove("on"); });
      div.appendChild(b);
      body.appendChild(div);
    });
  });
  w.classList.add("on");
}

// ---------- hotbar (persisted locally per character and job) ----------
// The layout is sparse: ten entries, each an ability id, `item:<key>` or
// null (hotbar_state.ts). The old key held a dense list of ability names; it
// is read once as a fallback and migrated, never deleted.
let slotEls: HTMLButtonElement[] = [];
let slotEntry: (Entry | undefined)[] = [];  // what each slot button was last drawn for
let slotSig: string[] = [];                 // the state each slot was last written with
let slotCdPct: number[] = [];               // the cooldown sweep last written, in half percents
let hotbarLayout: Entry[] = [];
let hotbarFor = "";                         // `${charId}_${job}` the layout was loaded for
let hotbarInv: any[] | null = null;         // the inventory array the item counts were taken from
// the slot drag in flight: where it started, what it carried, and whether a
// slot took it (drop fires on the target before dragend on the source)
let slotDrag: { from: number; entry: Entry; landed: boolean } | null = null;

// A bag drag carries the item key as well as its row index: the index is only
// good against the order the bags had when the drag began, and an inventory
// refresh mid-drag (loot, a reward, a trade) can reorder them.
const BAG_KEY_TYPE = "application/x-vanai-item";

function hotbarKey(): string { return `vanai_hotbar2_${state.self!.charId}_${state.self!.job}`; }
function legacyHotbarKey(): string { return `vanai_hotbar_${state.self!.charId}_${state.self!.job}`; }

// the order new abilities fill the bar in, and the order the old dense
// layout used for everything it had not saved
function abilitiesInOrder(): any[] {
  return state.abilities.slice().sort((a, b) => a.lvl - b.lvl);
}

function loadHotbarLayout(): Entry[] {
  let saved: unknown = null;
  let legacy = false;
  try {
    const raw = localStorage.getItem(hotbarKey());
    if (raw) saved = JSON.parse(raw);
    else {
      const old = localStorage.getItem(legacyHotbarKey());
      if (old) { saved = JSON.parse(old); legacy = true; }
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  const layout = migrateLayout(saved, state.abilities);
  // write the migration only once the names could be resolved to ids
  if (legacy && state.abilities.length) saveHotbarLayout(layout);
  return layout;
}

function saveHotbarLayout(layout: Entry[]): void {
  try { localStorage.setItem(hotbarKey(), JSON.stringify(layout)); } catch { /* unsaved */ }
}

function itemRec(key: string): HotbarRec {
  const qty = state.inventory
    .filter((r: any) => r.item_key === key && !r.equipped_slot)
    .reduce((n: number, r: any) => n + (r.qty || 1), 0);
  return { kind: "item", key, item: ITEMS[key] || { name: key }, qty };
}

function buildHotbar(): void {
  const bar = $("hotbar");
  bar.innerHTML = "";
  slotEls = [];
  for (let i = 0; i < SLOTS; i++) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "slot empty";
    slot.tabIndex = -1;
    slot.dataset.i = String(i);
    slot.innerHTML = `<span class="key">${i === 9 ? 0 : i + 1}</span><span class="ico"></span>`
      + `<span class="cost lp-num"></span><span class="cd"><span class="cdtext lp-num"></span></span><span class="uline"></span>`;
    // A focused slot would be re-pressed by Space (jump) or Enter (chat).
    // Focus cannot simply be refused: a mousedown preventDefault stops the
    // HTML5 drag from starting, and a blur inside the focus event cancels the
    // drag gesture in Chromium. So the press may focus it, the click and the
    // drag's end hand focus back, and Space/Enter lose their button default
    // here while still bubbling on to world.ts for the jump and the composer.
    const noActivate = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") e.preventDefault(); };
    slot.addEventListener("keydown", noActivate);
    slot.addEventListener("keyup", noActivate);
    slot.addEventListener("click", () => { slot.blur(); api.useHotbarSlot(i); });
    slot.addEventListener("dragstart", (e) => {
      if (!hotbarSlots[i]) { e.preventDefault(); return; }
      hideItemTip();
      e.dataTransfer!.setData("text/plain", `hb:${i}`);
      slotDrag = { from: i, entry: hotbarLayout[i] ?? null, landed: false };
    });
    // A consumable dragged off the bar and let go anywhere but a slot comes
    // off. Without this a slotted item could never leave: every ability is
    // already on the bar while there is room, so nothing can replace it.
    // Our own flag rather than dropEffect, which WebKit reports unreliably.
    slot.addEventListener("dragend", () => {
      slot.blur();
      const d = slotDrag;
      slotDrag = null;
      if (!d || d.landed || !state.self || !isItemEntry(d.entry)) return;
      if (hotbarLayout[d.from] !== d.entry) return; // the bar changed under the drag
      saveHotbarLayout(removeItem(hotbarLayout, d.from));
      api.renderHotbar();
      renderCharacterIfOpen();
    });
    slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("dragover"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("dragover"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("dragover");
      if (slotDrag) slotDrag.landed = true;
      dropOnHotbar(e.dataTransfer!.getData("text/plain"), i, e.dataTransfer!.getData(BAG_KEY_TYPE));
    });
    attachTip(slot, () => slotTipHtml(i));
    bar.appendChild(slot);
    slotEls.push(slot);
  }
  slotEntry = new Array(SLOTS).fill(undefined);
  slotSig = new Array(SLOTS).fill("");
  slotCdPct = new Array(SLOTS).fill(-1);
  hotbarSlots = new Array(SLOTS).fill(null);
}

// What can land on a slot: another slot (swap), a consumable from the bags,
// or an ability from the Character window's list of those off the bar.
function dropOnHotbar(d: string, i: number, bagKey = ""): void {
  if (!state.self) return;
  let layout: Entry[] | null = null;
  if (d.startsWith("hb:")) layout = swap(hotbarLayout, parseInt(d.slice(3)), i);
  else if (d.startsWith("bag:")) {
    const key = bagKey || orderedBags()[parseInt(d.slice(4))]?.item_key;
    const it = key && ITEMS[key];
    // only what the Use button would use
    if (it?.slot === "consumable") layout = place(hotbarLayout, i, `item:${key}`);
  } else if (d.startsWith("ab:")) {
    const id = d.slice(3);
    if (state.abilities.some((a) => a.id === id)) layout = place(hotbarLayout, i, id);
  }
  if (!layout) return;
  saveHotbarLayout(layout);
  api.renderHotbar();
  // the ability list beside the gear shows only what is off the bar
  renderCharacterIfOpen();
}

function pressSlot(i: number): void {
  const slot = slotEls[i];
  if (!slot) return;
  slot.classList.add("pressed");
  setTimeout(() => slot.classList.remove("pressed"), 120);
}

// "short" is a tone, not a resource, so the label reads what the cost is paid in
function costLabel(f: SlotFlags): string {
  if (!f.cost) return "";
  return f.costRes === "item" ? `${f.cost} left`
    : f.costRes === "tp" ? `${f.cost} TP`
    : f.costRes === "hp" ? `${f.cost} HP` : `${f.cost} MP`;
}

const NO_BUFFS: readonly string[] = [];
const tickInput: SlotInput = { dead: false, tp: 0, mp: 0, now: 0 };

// Per frame: the state of each slot from TP, MP, death, cooldowns, buffs and
// the distance to the target. At most one distance per frame; DOM writes only
// where the computed state changed.
function tickHotbar(now: number, myX: number, myZ: number): void {
  const s = state.self;
  if (!s || !slotEls.length) return;
  // item counts follow the inventory, which is always replaced whole
  if (state.inventory !== hotbarInv) api.renderHotbar();
  let targetKind: "monster" | "player" | null = null;
  let targetDist: number | null = null;
  const tid = state.targetId;
  if (tid?.startsWith("m")) {
    const m = state.monsters.get(tid);
    if (m) { targetKind = "monster"; targetDist = edgeDistance(myX, myZ, m.x, m.z, MONSTERS[m.key]?.radius_m ?? 0.5); }
  } else if (tid?.startsWith("p") && tid !== `p${s.charId}`) {
    const p = state.players.get(tid);
    if (p) { targetKind = "player"; targetDist = Math.hypot(p.x - myX, p.z - myZ); }
  }
  // this runs every frame, so one input object is refilled per slot rather
  // than ten allocated, and the buff list is only built when there are buffs
  const inp = tickInput;
  // an ailment never lights a slot, so only the buffs go in
  inp.buffs = s.buffs.length
    ? s.buffs.filter((b) => !b.harm && liveRemain(b.remain, s.buffsAt ?? now, now) > 0).map((b) => b.name) : NO_BUFFS;
  inp.dead = s.dead; inp.tp = s.tp; inp.mp = s.mp; inp.now = now;
  inp.targetKind = targetKind; inp.targetDist = targetDist;
  for (let i = 0; i < slotEls.length; i++) {
    const rec = hotbarSlots[i];
    inp.ability = rec?.kind === "ab" ? rec.ab : null;
    inp.itemQty = rec?.kind === "item" ? rec.qty : undefined;
    inp.cdUntil = rec?.kind === "ab" ? state.cooldowns.get(rec.ab.id) : undefined;
    const f = slotFlags(inp);
    const slot = slotEls[i];
    const sig = `${f.cls}|${f.cost}|${f.costTone}|${f.cdText}`;
    if (sig !== slotSig[i]) {
      const prev = slotSig[i].split("|")[0];
      slotSig[i] = sig;
      // a class swap, not a className write, so .pressed and .dragover survive
      for (const c of ["empty", "dim", "active", "cd", "far", "short", "tpready", "ready"]) {
        if (c !== f.cls && (c === prev || !prev)) slot.classList.remove(c);
      }
      slot.classList.add(f.cls);
      const cost = slot.querySelector(".cost") as HTMLElement;
      cost.textContent = f.cost;
      cost.className = `cost lp-num ${f.costTone}`;
      slot.querySelector(".cdtext")!.textContent = f.cdText;
      const name = !rec ? "Empty slot" : rec.kind === "item" ? rec.item.name : rec.ab.name;
      const c = costLabel(f);
      slot.setAttribute("aria-label", c ? `${name}, ${c}` : name);
    }
    if (f.cls === "cd") {
      const pct = Math.round(f.cdDone * 2);
      if (pct !== slotCdPct[i]) {
        slotCdPct[i] = pct;
        const d = pct / 2;
        (slot.querySelector(".cd") as HTMLElement).style.background =
          `conic-gradient(transparent 0 ${d}%, rgba(4, 6, 10, 0.7) ${d}% 100%)`;
      }
    } else slotCdPct[i] = -1;
  }
}

const TARGET_LABEL: Record<string, string> = {
  enemy: "Enemy", self: "Self", ally: "Self or ally", party: "Party", dead_ally: "Fallen ally",
};

// 90 → "90s", 300 → "5m"
const fmtSecs = (n: number): string => (n >= 60 && n % 60 === 0 ? `${n / 60}m` : `${n}s`);

function abilityTipHtml(ab: any, foot: string): string {
  const cost = ab.kind === "ws" || ab.tp ? `<span class="tipcost tp">${ab.tp || 100} TP</span>`
    : ab.mp ? `<span class="tipcost mp">${ab.mp} MP</span>`
    : ab.hp_cost_pct ? `<span class="tipcost hp">${ab.hp_cost_pct}% HP</span>` : "";
  const meta = [
    `${esc(JOBS[ab.job]?.name || ab.job || "")} · Lv ${ab.lvl}`,
    ab.cast ? `Cast ${Number(ab.cast).toFixed(1)}s` : "Instant",
    TARGET_LABEL[ab.target] || "",
    ab.cd ? `Recast ${fmtSecs(ab.cd)}` : "",
    ab.duration ? `Lasts ${fmtSecs(ab.duration)}` : "",
  ].filter(Boolean).map((t) => `<span>${t}</span>`).join("");
  return `<div class="tiphead"><span class="lp-name tipname">${esc(ab.name)}</span>${cost}</div>`
    + `<div class="tipmeta">${meta}</div>`
    + (ab.desc ? `<div class="tipdesc">${esc(ab.desc)}</div>` : "")
    + `<div class="tipfoot">${foot}</div>`;
}

function slotTipHtml(i: number): string {
  const rec = hotbarSlots[i];
  if (!rec) return "";
  const foot = `<kbd class="lp-kbd sm">${i === 9 ? 0 : i + 1}</kbd> or click · drag to rearrange`;
  if (rec.kind === "item") return itemTipHtml(rec.key) + `<div class="tipfoot">${foot}, off the bar to remove</div>`;
  return abilityTipHtml(rec.ab, foot);
}

// Abilities past the ten slots (jobs reach 15-17 by level 50) would be
// unreachable, so the Character window lists every ability off the bar for
// dragging on. Nothing is written when the bar holds them all.
function appendAbilityBook(body: Element): void {
  if (!state.self || !slotEls.length) return;
  const on = new Set(hotbarLayout);
  const off = abilitiesInOrder().filter((a) => !on.has(a.id));
  if (!off.length) return;
  const wrap = el("div", "abook");
  wrap.innerHTML = `<div class="wsection">Abilities · drag onto your bar</div>`
    + off.map((a) => `<div class="abrow" draggable="true" data-ab="${esc(a.id)}">`
      + `<span class="abico">${abilityStrokeIcon(a, 18)}</span><span class="abname">${esc(a.name)}</span>`
      + `<span class="ablv lp-num">Lv ${a.lvl}</span></div>`).join("");
  wrap.querySelectorAll<HTMLElement>(".abrow").forEach((row) => {
    const ab = off.find((a) => a.id === row.dataset.ab);
    row.addEventListener("dragstart", (e) => {
      hideItemTip();
      e.dataTransfer!.setData("text/plain", `ab:${row.dataset.ab}`);
    });
    if (ab) attachTip(row, () => abilityTipHtml(ab, "Drag onto your bar to use it"));
  });
  body.appendChild(wrap);
}

function refreshXp(): void {
  const s = state.self;
  if (!s) return;
  const w = $("xp-bar-wrap");
  const pct = s.level >= 50 ? 100 : s.tnl > 0 ? Math.min(100, Math.max(0, (100 * s.xp) / s.tnl)) : 0;
  (w.querySelector(".xpbar > div") as HTMLElement).style.width = `${pct}%`;
  w.querySelector(".xplv")!.textContent = `Lv ${s.level} ${JOBS[s.job]?.name || s.job}`;
  // MAX_LEVEL in server/lib/vanai/data.rb:125; tnl <= 1 is the login
  // placeholder before the first self update, which would read "0 / 1"
  w.querySelector(".xpnum")!.textContent = s.level >= 50 ? "Max level"
    : s.tnl <= 1 ? "" : `${s.xp.toLocaleString()} / ${s.tnl.toLocaleString()}`;
}

// ---------- bag ordering (persisted locally per character) ----------
function bagsKey(): string { return `vanai_bags_${state.self!.charId}`; }

function orderedBags(): any[] {
  const bags = state.inventory.filter((i: any) => !i.equipped_slot);
  let saved: number[] = [];
  try { saved = JSON.parse(localStorage.getItem(bagsKey()) || "[]"); } catch { /* fresh */ }
  const byId = new Map(bags.map((r: any) => [r.id, r]));
  const out: any[] = [];
  saved.forEach((id) => { const r = byId.get(id); if (r) { out.push(r); byId.delete(id); } });
  byId.forEach((r) => out.push(r));
  return out;
}

function moveBagRow(from: number, to: number): void {
  if (from === to) return;
  const ids = orderedBags().map((r) => r.id);
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
  const [id] = ids.splice(from, 1);
  ids.splice(to, 0, id);
  localStorage.setItem(bagsKey(), JSON.stringify(ids));
  renderInventory();
}

function rarityCls(key: string): string {
  const r = ITEMS[key]?.rarity;
  return r === "rare" ? "rare" : r === "uncommon" ? "uncommon" : "";
}

// ---------- item tooltips with gear comparison ----------
const STAT_LABEL: Record<string, string> = { str: "STR", vit: "VIT", agi: "AGI", int: "INT", mnd: "MND", hp: "HP", mp: "MP" };

function equippedInSlot(slot: string): any | null {
  const row = state.inventory.find((r: any) => r.equipped_slot === slot);
  return row ? ITEMS[row.item_key] : null;
}

function itemTipHtml(key: string): string {
  const it = ITEMS[key];
  if (!it) return "";
  const bits: string[] = [];
  bits.push(`<div class="tname ${rarityCls(key)}">${esc(it.name)}</div>`);
  // "Head · cloth · Lv 3": where it goes, what it is made of (or which weapon
  // it is), then the level; a kind with no slot label reads as itself
  const where = SLOT_LABEL[it.slot] || (it.slot ? it.slot[0].toUpperCase() + it.slot.slice(1) : "Item");
  const kind = it.atype && it.atype !== "any" ? it.atype : it.wtype;
  const meta = [where, kind, it.lvl ? `Lv ${it.lvl}` : "", it.rarity && it.rarity !== "common" ? it.rarity : ""].filter(Boolean);
  bits.push(`<div class="tmeta">${esc(meta.join(" · "))}</div>`);
  if (it.dmg) bits.push(`<div class="tstat">DMG ${it.dmg} · delay ${it.delay}s</div>`);
  if (it.def) bits.push(`<div class="tstat">DEF ${it.def}</div>`);
  if (it.stats) bits.push(`<div class="tstat">${Object.entries(it.stats).map(([k, v]) => `${STAT_LABEL[k] || k.toUpperCase()}+${v}`).join(" ")}</div>`);
  if (it.effect && it.slot === "consumable") bits.push(`<div class="tstat">${esc(it.desc || it.effect)}</div>`);
  // comparison vs the piece worn in the same slot; an empty slot counts as
  // zeros, so a first helm still says what it adds
  if (GEAR_SLOTS.includes(it.slot)) {
    const cur = equippedInSlot(it.slot);
    if (cur !== it) {
      const base = cur || {};
      const deltas: string[] = [];
      const dNum = (label: string, a: number, b: number) => {
        const d = (a || 0) - (b || 0);
        if (d !== 0) deltas.push(`<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d} ${label}</span>`);
      };
      dNum("DMG", it.dmg || 0, base.dmg || 0);
      dNum("DEF", it.def || 0, base.def || 0);
      const keys = new Set([...Object.keys(it.stats || {}), ...Object.keys(base.stats || {})]);
      keys.forEach((k) => dNum(STAT_LABEL[k] || k.toUpperCase(), (it.stats || {})[k] || 0, (base.stats || {})[k] || 0));
      const lead = cur ? `vs ${esc(cur.name)} ·` : "nothing worn here ·";
      const tail = deltas.length ? deltas.join(" ") : (cur ? "the same" : "");
      bits.push(`<div class="tcompare"><span class="tlead">${tail ? lead : lead.slice(0, -2)}</span>${tail ? ` ${tail}` : ""}</div>`);
    }
  }
  bits.push(courtRelicTip(it));
  if (it.price_sell || it.price) bits.push(`<div class="tmeta tprice">${it.price ? `buy ${it.price}g` : ""}${it.price && it.price_sell ? " · " : ""}${it.price_sell ? `sell ${it.price_sell}g` : ""}</div>`);
  return bits.join("");
}

// The tip sits above the menus (z 80) and follows only mouseenter/leave, so
// anything that opens over the hovered element, or removes it without a
// mouseleave (a menu, a closing window), must put it away by hand.
function hideItemTip(): void {
  document.getElementById("item-tip")?.classList.remove("on");
}

// The tip's content is asked for on each hover, so a hotbar slot shows what
// it holds now rather than what it held when the listener was attached.
function attachTip(el: HTMLElement, html: () => string): void {
  el.addEventListener("mouseenter", () => {
    const body = html();
    if (!body) return;
    const tip = $("item-tip");
    tip.innerHTML = body;
    tip.classList.add("on");
  });
  el.addEventListener("mousemove", (e) => {
    const tip = $("item-tip");
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - pad;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  el.addEventListener("mouseleave", () => hideItemTip());
}

function renderInventory(): void {
  const body = $("win-inventory").querySelector(".wbody")!;
  body.innerHTML = "";
  const bags = orderedBags();
  const section = (title: string) => body.insertAdjacentHTML("beforeend", `<div class="wsection" style="margin:6px 0 2px">${title}</div>`);
  // What is worn hangs in the Character window now, slot by slot — the bags
  // list only what is carried, so a piece appears in exactly one place.
  section("Bags");
  bags.forEach((row: any, idx: number) => {
    const div = invRow(row);
    div.draggable = true;
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData("text/plain", `bag:${idx}`);
      e.dataTransfer!.setData(BAG_KEY_TYPE, row.item_key);
    });
    div.addEventListener("dragover", (e) => { e.preventDefault(); div.classList.add("dragover"); });
    div.addEventListener("dragleave", () => div.classList.remove("dragover"));
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      const d = e.dataTransfer!.getData("text/plain");
      if (d.startsWith("bag:")) moveBagRow(parseInt(d.slice(4)), idx);
    });
    body.appendChild(div);
  });
  if (!bags.length) body.insertAdjacentHTML("beforeend", `<div class="imeta">Empty.</div>`);
  body.insertAdjacentHTML("beforeend",
    `<div class="imeta" style="margin-top:8px">What you wear hangs in the Character window <b>(C)</b>, slot by slot.</div>`);
}

// "DMG 6 · DEF 3 · STR+1 · Lv12" — the one-line shorthand for a piece, shared
// by the bag rows and the gear slots.
function statLine(item: any, withLevel = true): string {
  const bits: string[] = [];
  if (item.dmg) bits.push(`DMG ${item.dmg}`);
  if (item.def) bits.push(`DEF ${item.def}`);
  if (item.stats) bits.push(Object.entries(item.stats).map(([k, v]) => `${k.toUpperCase()}+${v}`).join(" "));
  if (withLevel && item.lvl) bits.push(`Lv${item.lvl}`);
  return bits.join(" · ");
}

// A carried piece. What is worn is drawn by the gear slots instead, so this
// only ever describes something out of the bags.
function invRow(row: any): HTMLElement {
  const item = ITEMS[row.item_key] || { name: row.item_key };
  const div = el("div", "invrow");
  div.innerHTML = `<span class="iicon">${itemIcon(item)}</span><span class="iname ${rarityCls(row.item_key)}">${esc(courtRelicName(row) ?? item.name)}${row.qty > 1 ? ` ×${row.qty}` : ""}</span>
    <span class="imeta">${courtRelicMeta(row) ?? statLine(item)}</span>`;
  attachTip(div, () => itemTipHtml(row.item_key));
  if (GEAR_SLOTS.includes(item.slot)) {
    const b = el("button", "btn", "Equip");
    b.addEventListener("click", () => equipItem(row.id));
    div.appendChild(b);
  } else if (item.slot === "consumable") {
    const b = el("button", "btn", "Use");
    b.addEventListener("click", () => {
      // the server's one-a-second pace for consumables, shared with the hotbar
      if ((state.cooldowns.get("item") || 0) > performance.now() / 1000) return;
      send("use_item", { inv_id: row.id });
    });
    div.appendChild(b);
  }
  return div;
}

// ---------- gear slots ----------
// Every change to what is worn runs through here, so the gear panel, the bag
// list and the avatar never disagree about what is on. The reply carries the
// fresh inventory — used as-is, so the avatar rebuild never races a refetch.
async function applyEquipResult(res: any, issued: number): Promise<void> {
  if (res?.error) api.addChat("system", "", res.error);
  if (res?.inventory) applyInventory(issued, res.inventory); else await refreshInventoryFn();
  renderInventory();
  renderCharacterIfOpen();
  import("./world").then((w) => w.rebuildSelfAvatar());
}

// the ticket is taken as the request leaves, so an older refresh landing
// after the reply cannot put the old gear back (state.ts applyInventory)
async function equipItem(invId: number): Promise<void> {
  const issued = inventoryTicket();
  await applyEquipResult(await rest.equip(invId), issued);
}

async function unequipSlot(slot: string): Promise<void> {
  const issued = inventoryTicket();
  await applyEquipResult(await rest.unequip(slot), issued);
}

function renderCharacterIfOpen(): void {
  if (!state.self || !$("win-character").classList.contains("on")) return;
  // the job chooser is drawn onto the sheet — redraw it whole, so a stat
  // tick cannot sweep the choice away mid-decision
  if ($("win-character").querySelector(".jobgrid")) openJobChange(); else renderCharacter();
}

function equippedRow(slot: string): any | null {
  return state.inventory.find((r: any) => r.equipped_slot === slot) || null;
}

// What an empty slot draws: the glyph of the piece that belongs there. An
// empty weapon hand shows the job's own weapon.
function slotGlyphDef(slot: string): any {
  if (slot !== "weapon") return { slot };
  return { slot: "weapon", wtype: JOBS[state.self!.job]?.weapon_type };
}

// Carried pieces that belong in this slot, best first. `fits` is what the
// job may actually put on now; `blocked` is the rest, kept so the menu can
// say why they are out of reach rather than hiding them.
function bagPiecesFor(slot: string): { fits: any[]; blocked: { row: any; why: string }[] } {
  const s = state.self!;
  const rows = state.inventory
    .filter((r: any) => !r.equipped_slot && ITEMS[r.item_key]?.slot === slot)
    .sort((a: any, b: any) => (ITEMS[b.item_key]?.lvl || 0) - (ITEMS[a.item_key]?.lvl || 0));
  const fits: any[] = [];
  const blocked: { row: any; why: string }[] = [];
  rows.forEach((r: any) => {
    const why = equipProblem(ITEMS[r.item_key], s.job, s.level);
    if (why) blocked.push({ row: r, why }); else fits.push(r);
  });
  return { fits, blocked };
}

function renderGear(body: Element): void {
  const grid = el("div", "geargrid");
  GEAR_SLOTS.forEach((slot) => {
    const row = equippedRow(slot);
    const item = row ? ITEMS[row.item_key] : null;
    const cell = el("div", `gearslot${item ? "" : " empty"}`);
    cell.dataset.slot = slot;
    let meta: string;
    if (item) {
      meta = statLine(item, false) || "—";
    } else {
      const n = bagPiecesFor(slot).fits.length;
      meta = n ? `${n} in bags` : "nothing fits";
    }
    cell.innerHTML = `<span class="iicon">${itemIcon(item || slotGlyphDef(slot))}</span>
      <span class="gtext">
        <span class="gslot">${SLOT_LABEL[slot]}</span>
        <span class="gname ${item ? rarityCls(row.item_key) : ""}">${item ? esc(item.name) : "Empty"}</span>
        <span class="imeta">${esc(meta)}</span>
      </span>`;
    if (row) attachTip(cell, () => itemTipHtml(row.item_key));
    cell.addEventListener("click", (e) => { e.stopPropagation(); openGearMenu(slot, cell); });
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

let gearMenuOpen = false;

// One menu for both cases: a worn slot offers to examine or strip the piece,
// an empty one offers everything in the bags that fits it.
function openGearMenu(slot: string, anchor: HTMLElement): void {
  // the slot's tip would cover the menu's header; the candidates bring their own
  hideItemTip();
  const m = $("gear-ctx");
  const row = equippedRow(slot);
  const item = row ? ITEMS[row.item_key] : null;
  m.innerHTML = `<div class="ctx-name">${SLOT_LABEL[slot]}${item ? ` · ${esc(item.name)}` : ""}</div>`;
  const add = (html: string, onClick?: () => void, key?: string): void => {
    const b = el("button", `ctx-item${onClick ? "" : " off"}`, html);
    if (onClick) b.addEventListener("click", () => { closeGearMenu(); onClick(); });
    else (b as HTMLButtonElement).disabled = true;
    if (key) attachTip(b, () => itemTipHtml(key));
    m.appendChild(b);
  };

  if (row && item) {
    add("Examine", () => showItemWindow(row.item_key));
    add("Remove", () => unequipSlot(slot));
  } else {
    const { fits, blocked } = bagPiecesFor(slot);
    fits.forEach((r: any) => {
      const it = ITEMS[r.item_key];
      add(`<span class="ci-icon">${itemIcon(it)}</span><span class="ci-name ${rarityCls(r.item_key)}">${esc(it.name)}</span>
           <span class="ci-meta">${esc(statLine(it, false))}</span>`, () => equipItem(r.id), r.item_key);
    });
    blocked.forEach(({ row: r, why }) => {
      const it = ITEMS[r.item_key];
      add(`<span class="ci-icon">${itemIcon(it)}</span><span class="ci-name">${esc(it.name)}</span>
           <span class="ci-meta">${esc(why)}</span>`, undefined, r.item_key);
    });
    if (!fits.length && !blocked.length) {
      m.insertAdjacentHTML("beforeend", `<div class="ctx-note">Nothing in your bags belongs in this slot.</div>`);
    }
  }

  m.classList.add("on");
  gearMenuOpen = true;
  // measure once shown, then keep the whole menu on screen
  const a = anchor.getBoundingClientRect();
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(4, Math.min(a.left, window.innerWidth - r.width - 4))}px`;
  m.style.top = `${Math.max(4, Math.min(a.bottom + 2, window.innerHeight - r.height - 4))}px`;
}

function closeGearMenu(): void {
  if (!gearMenuOpen) return;
  gearMenuOpen = false;
  document.getElementById("gear-ctx")?.classList.remove("on");
}

// The long look at a piece: what it is, what it gives, who may carry it.
function showItemWindow(key: string): void {
  const it = ITEMS[key];
  if (!it) return;
  const w = $("win-item");
  (w.querySelector(".wtitle") as HTMLElement).textContent = it.name || key;
  const body = w.querySelector(".wbody")!;
  const kind = it.slot === "weapon" ? (it.wtype || "weapon") : (it.atype ? `${it.atype} ${it.slot}` : it.slot);
  const jobs = eligibleJobs(it);
  const jobNames = jobs.length === JOB_LIST.length
    ? "every job"
    : jobs.map((j) => JOBS[j]?.name || j).join(", ");
  const rows: string[] = [];
  const stat = (k: string, v: string) => rows.push(`<span class="k">${k}</span><span>${v}</span>`);
  stat("Slot", SLOT_LABEL[it.slot] || it.slot);
  if (it.dmg) stat("Damage", `${it.dmg} · delay ${it.delay}s`);
  if (it.def) stat("Defense", `${it.def}`);
  Object.entries(it.stats || {}).forEach(([k, v]) => stat(STAT_LABEL[k] || k.toUpperCase(), `+${v}`));
  stat("Requires", it.lvl ? `Level ${it.lvl}` : "no rank");
  stat("Jobs", jobNames);
  if (it.price_sell || it.price) {
    stat("Worth", [it.price ? `buy ${it.price}g` : "", it.price_sell ? `sell ${it.price_sell}g` : ""].filter(Boolean).join(" · "));
  }
  const worn = equippedRow(it.slot)?.item_key === key;
  body.innerHTML = `
    <div class="itemhead">
      <span class="iicon big">${itemIcon(it)}</span>
      <div>
        <div class="iname ${rarityCls(key)}" style="font-family:Cinzel,serif;font-size:15px">${esc(it.name)}</div>
        <div class="imeta">${esc(kind)}${it.rarity && it.rarity !== "common" ? ` · ${esc(it.rarity)}` : ""}${worn ? " · equipped" : ""}</div>
      </div>
    </div>
    <div class="statgrid attr" style="margin-top:10px">${rows.join("")}</div>
    ${it.desc ? `<div class="imeta" style="font-style:italic">${esc(it.desc)}</div>` : ""}`;
  w.classList.add("on");
}

function renderCharacter(): void {
  const body = $("win-character").querySelector(".wbody")!;
  const s = state.self!;
  const st = s.stats;
  body.innerHTML = `
    <div style="font-family:Cinzel,serif;font-size:17px">${esc(s.name)}</div>
    <div class="imeta" style="margin-bottom:8px">${esc(s.race)} · ${esc(s.title || "a chartered explorer")}</div>
    ${courtCharacterLine()}
    <div class="statgrid">
      <span class="k">HP</span><span>${s.hp}/${s.maxHp}</span>
      <span class="k">MP</span><span>${s.mp}/${s.maxMp}</span>
      <span class="k">Level</span><span>${s.level} (${s.xp}/${s.tnl})</span>
      <span class="k">Gold</span><span>${s.gold}</span>
    </div>
    ${st ? `
    <div class="wsection" style="margin:8px 0 2px">Attributes</div>
    <div class="statgrid attr">
      <span class="k">STR</span><span>${st.str}</span>
      <span class="k">VIT</span><span>${st.vit}</span>
      <span class="k">AGI</span><span>${st.agi}</span>
      <span class="k">INT</span><span>${st.int}</span>
      <span class="k">MND</span><span>${st.mnd}</span>
      <span class="k">Defense</span><span>${st.def}</span>
      <span class="k">Weapon</span><span>DMG ${st.weapon_dmg} · ${st.delay}s</span>
    </div>` : ""}
    <div class="wsection" style="margin:8px 0 4px">Arms &amp; Raiment</div>`;
  renderGear(body);
  body.insertAdjacentHTML("beforeend",
    `<div class="imeta" style="margin:2px 0 2px">Click a slot to fit it, or to remove and examine what is worn.</div>
     <div class="wsection" style="margin:8px 0 2px">Jobs</div>`);
  state.jobs.forEach((j) => {
    body.insertAdjacentHTML("beforeend",
      `<div class="jobrow"><span>${JOBS[j.job]?.name || j.job}${j.job === s.job ? " ★" : ""}</span><span class="imeta">Lv ${j.level}</span></div>`);
  });
  body.insertAdjacentHTML("beforeend", `<div class="imeta" style="margin-top:8px">Change jobs beside a trainer: the Paladin hall in Caerdun, the chanters' hall in Heartwood, the mending college in Moonmere.</div>`);
  appendAbilityBook(body);
}

function openJobChange(): void {
  const body = $("win-character").querySelector(".wbody")!;
  $("win-character").classList.add("on");
  renderCharacter();
  body.insertAdjacentHTML("beforeend", `<div class="wsection" style="margin:10px 0 4px">Take up a job</div>`);
  const grid = el("div", "jobgrid");
  JOB_LIST.forEach((j) => {
    const b = el("div", `job${state.self!.job === j ? " sel" : ""}`, j);
    b.addEventListener("click", () => { send("change_job", { job: j }); $("win-character").classList.remove("on"); });
    grid.appendChild(b);
  });
  body.appendChild(grid);
}

// ---------- direct trading ----------
let tradeOffer: { gold: number; items: { inv_id: number; qty: number }[] } = { gold: 0, items: [] };

export function showTradeInvite(from: string): void { showInviteCard("trade", from); }

export function renderTrade(msg: any): void {
  const w = $("win-trade");
  if (msg.closed) {
    w.classList.remove("on");
    tradeOffer = { gold: 0, items: [] };
    return;
  }
  w.classList.add("on");
  (w.querySelector(".wtitle") as HTMLElement).textContent = `Trade — ${msg.partner}`;
  const body = w.querySelector(".wbody")!;
  const side = (label: string, offer: any, confirmed: boolean) => `
    <div class="wsection" style="margin:6px 0 2px">${label} ${confirmed ? '<span style="color:var(--uncommon)">✓ confirmed</span>' : ""}</div>
    <div class="imeta">Gold: ${offer.gold}</div>
    ${offer.items.map((it: any) => `<div class="invrow"><span class="iname ${rarityCls(it.item_key)}">${esc(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ""}</span></div>`).join("") || '<div class="imeta">— nothing —</div>'}`;
  body.innerHTML = side("They offer", msg.theirs, msg.their_confirm) + side("You offer", msg.mine, msg.my_confirm);

  // gold input
  const goldRow = el("div");
  goldRow.style.cssText = "display:flex;gap:8px;align-items:center;margin:8px 0";
  goldRow.innerHTML = `<span class="imeta">Offer gold:</span>`;
  const gi = guardKeys(document.createElement("input"));
  gi.type = "number"; gi.min = "0"; gi.value = String(tradeOffer.gold);
  // the shared field look; a fixed width, since .hud-field otherwise fills its row
  gi.className = "hud-field";
  gi.style.flex = "0 0 90px";
  gi.addEventListener("change", () => {
    tradeOffer.gold = Math.max(0, parseInt(gi.value) || 0);
    send("trade_offer", tradeOffer);
  });
  goldRow.appendChild(gi);
  body.appendChild(goldRow);

  // add items from bags
  body.insertAdjacentHTML("beforeend", `<div class="wsection" style="margin:6px 0 2px">Add from bags</div>`);
  // a bound item (a named relic among them) never changes hands; the item's
  // own flag holds even when a reply has dropped the row's relic details
  state.inventory.filter((r: any) => !r.equipped_slot && !r.named_relic && !ITEMS[r.item_key]?.bound && !tradeOffer.items.some((it) => it.inv_id === r.id)).forEach((row: any) => {
    const item = ITEMS[row.item_key];
    if (!item) return;
    const div = el("div", "invrow");
    div.innerHTML = `<span class="iname ${rarityCls(row.item_key)}">${esc(item.name)}${row.qty > 1 ? ` ×${row.qty}` : ""}</span>`;
    const b = el("button", "btn", "Add");
    b.addEventListener("click", () => {
      if (tradeOffer.items.length >= 6) { api.addChat("system", "", "Six items at most per trade."); return; }
      tradeOffer.items.push({ inv_id: row.id, qty: row.qty });
      send("trade_offer", tradeOffer);
    });
    div.appendChild(b);
    body.appendChild(div);
  });
  if (tradeOffer.items.length) {
    const clearB = el("button", "btn", "Remove my items");
    clearB.style.marginTop = "6px";
    clearB.addEventListener("click", () => { tradeOffer.items = []; send("trade_offer", tradeOffer); });
    body.appendChild(clearB);
  }

  const actions = el("div");
  actions.style.cssText = "display:flex;gap:8px;margin-top:12px";
  const confirmB = el("button", "btn gold", msg.my_confirm ? "Waiting…" : "Confirm trade");
  // the confirm names the offer on screen (its rev): one the partner changed
  // since is refused by the world, never applied to the offer you did not see
  if (!msg.my_confirm) confirmB.addEventListener("click", () => send("trade_confirm", { rev: msg.rev }));
  const cancelB = el("button", "btn", "Cancel");
  cancelB.addEventListener("click", () => send("trade_cancel"));
  actions.appendChild(confirmB);
  actions.appendChild(cancelB);
  body.appendChild(actions);
}

// The window, its tabs and its rules live in auction-hud.ts.
function openAuction(): void {
  openAuctionHouse();
}

async function openVendor(npcId: string): Promise<void> {
  currentVendorNpc = npcId;
  const w = $("win-vendor");
  w.classList.add("on");
  const npc = (ZONES[state.zone].npcs || []).find((n: any) => n.id === npcId);
  (w.querySelector(".wtitle") as HTMLElement).textContent = npc?.name || "Merchant";
  renderVendor(npc);
}

function renderVendor(npc: any): void {
  const body = $("win-vendor").querySelector(".wbody")!;
  body.innerHTML = `<div class="imeta" style="margin-bottom:6px">Your gold: ${state.self!.gold}</div>
    <div class="wsection" style="margin:4px 0 2px">For sale</div>`;
  (npc?.stock || []).forEach((key: string) => {
    const item = ITEMS[key];
    const div = el("div", "invrow");
    div.innerHTML = `<span class="iicon">${itemIcon(item)}</span><span class="iname ${rarityCls(key)}">${esc(item.name)}</span><span class="imeta">${courtVendorPriceHtml(state.zone, item.price)}${item.lvl ? ` · Lv${item.lvl}` : ""}</span>`;
    attachTip(div, () => itemTipHtml(key));
    const b = el("button", "btn", "Buy");
    b.addEventListener("click", async () => {
      const issued = inventoryTicket();
      const res = await import("./net").then((n) => n.rest.vendor(npc.id, "buy", { item_key: key }));
      if (res.error) { api.addChat("system", "", res.error); return; }
      if (applyInventory(issued, res.inventory)) state.self!.gold = res.gold;
      api.updateSelf();
      renderVendor(npc);
      api.addChat("loot", "", `Purchased ${item.name}.`);
    });
    div.appendChild(b);
    body.appendChild(div);
  });
  body.insertAdjacentHTML("beforeend", `<div class="wsection" style="margin:10px 0 2px">Sell from bags</div>`);
  state.inventory.filter((r: any) => !r.equipped_slot).forEach((row: any) => {
    const item = ITEMS[row.item_key];
    const value = item.price_sell || Math.round((item.price || 0) * 0.25);
    if (value <= 0) return;
    const div = el("div", "invrow");
    div.innerHTML = `<span class="iicon">${itemIcon(item)}</span><span class="iname ${rarityCls(row.item_key)}">${esc(item.name)}${row.qty > 1 ? ` ×${row.qty}` : ""}</span><span class="imeta">${value}g</span>`;
    attachTip(div, () => itemTipHtml(row.item_key));
    const b = el("button", "btn", "Sell");
    b.addEventListener("click", async () => {
      const issued = inventoryTicket();
      const res = await import("./net").then((n) => n.rest.vendor(npc.id, "sell", { inventory_item_id: row.id }));
      if (res.error) { api.addChat("system", "", res.error); return; }
      if (applyInventory(issued, res.inventory)) state.self!.gold = res.gold;
      api.updateSelf();
      renderVendor(npc);
    });
    div.appendChild(b);
    body.appendChild(div);
  });
}
