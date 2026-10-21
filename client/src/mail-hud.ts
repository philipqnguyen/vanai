// The Mail window (Philip, 2026-10-14): its own window off the Social menu,
// apart from the courts' Letters. Inbox, a page at a time, with a reading
// pane that collects a parcel's gold and items, replies and deletes; Write,
// which encloses gold and up to four stacks from your bags. The auction house
// writes here too: a sale (the gold is already in your purse) and an unsold
// listing coming home. The unread count rides on the Social dock key, pushed
// by the server (`mail_unread`) so it moves without polling.
//
// hud.ts reaches this through hooks (initMailHud, renderMailWindow); world.ts
// hands it `mail_unread`. The rules live in mail-model.ts, which the node
// tests read; the server's are server/lib/vanai/mail.rb.

import "./auction-mail.css";
import { ITEMS } from "./data";
import { state } from "./state";
import { api } from "./net";
import { itemIcon, lpIcon, strokeIcon } from "./icons";
import { pager } from "./pager";
import { auctionPurseChanged } from "./auction-hud";
import {
  DEFAULT_LIMITS, emptyDraft, ageLabel, replyDraft, postageFor, draftCost, enclose, draftProblem, badgeText, enclosureState,
  type Draft, type MailLimits,
} from "./mail-model";
import { rarityClass } from "./auction-model";
import type { HudApi } from "./hud";
import type { MarketDeps } from "./auction-hud";

type Tab = "inbox" | "write";

let hud: HudApi;
let deps: MarketDeps;
let tab: Tab = "inbox";
let unread = 0;
let limits: MailLimits = DEFAULT_LIMITS;
let page = 1;
let inbox: any = null;
let openId: number | null = null;
let draft: Draft = emptyDraft();
let pickPage = 1;
let seq = 0;

const PICK_PER_PAGE = 8;
// an envelope and a tied parcel, drawn in the Lamplight stroke style
const ENVELOPE = "M3 6h18v12H3zM3 7l9 6 9-6";
const PARCEL = "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8M8 6l8 4";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
function guard<T extends HTMLElement>(input: T): T {
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return input;
}
function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.tabIndex = -1;
  b.innerHTML = label;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}
const coin = (n: number) => `<span class="ah-gold lp-num">${lpIcon("coin", 12, 2)}${n.toLocaleString()}</span>`;

/** Once, from initHud, before the windows are made draggable. */
export function initMailHud(hudApi: HudApi, lent: MarketDeps): void {
  hud = hudApi;
  deps = lent;
  $("hud").insertAdjacentHTML("beforeend", `
    <div class="window mailw" id="win-mail"><div class="whead"><span class="wtitle">Mail</span>
      <div class="mtabs" role="tablist" aria-label="Mail">
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-mtab="inbox" aria-selected="true">Inbox<span class="mtab-unread lp-num"></span></button>
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-mtab="write" aria-selected="false">Write</button>
      </div>
      <button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div>
      <div class="wbody"></div></div>`);
  const w = $("win-mail");
  w.querySelector(".wclose")!.addEventListener("click", () => w.classList.remove("on"));
  w.querySelectorAll<HTMLElement>(".mtabs .lp-tab").forEach((b) =>
    b.addEventListener("click", () => { tab = b.dataset.mtab as Tab; renderMailWindow(); }));
  new MutationObserver(() => {
    if (!w.classList.contains("on")) document.getElementById("item-tip")?.classList.remove("on");
  }).observe(w, { attributes: true, attributeFilter: ["class"] });
  // the badge rides on the Social key, which opens the chooser Mail is in
  document.getElementById("social-btn")?.insertAdjacentHTML("beforeend", `<span class="mbadge lp-num"></span>`);
  renderBadge();
  api("/mail?per=1").then((r) => { if (!r.error) { unread = r.unread ?? 0; renderBadge(); } });
}

function renderBadge(): void {
  const t = badgeText(unread);
  document.querySelectorAll<HTMLElement>(".mbadge, #win-mail .mtab-unread, #social-menu .mail-unread").forEach((b) => {
    b.textContent = t;
    b.classList.toggle("has", unread > 0);
  });
  const key = document.getElementById("social-btn");
  if (key) {
    const label = unread > 0 ? `Social (O) · ${unread} unread letter${unread === 1 ? "" : "s"}` : "Social (O)";
    key.title = label;
    key.setAttribute("aria-label", label);
  }
}

/** world.ts: the server's `mail_unread` -- the count, and the letter just arrived. */
export function handleMailMessage(msg: any): void {
  unread = msg.unread ?? unread;
  renderBadge();
  if (msg.letter) {
    hud.toast(`A letter from ${msg.letter.from}: ${msg.letter.subject}`, "mail");
    hud.addChat("system", "", `Mail from ${msg.letter.from}: “${msg.letter.subject}”. Open it from Social › Mail.`);
  }
  if ($("win-mail").classList.contains("on") && tab === "inbox") loadInbox();
}

/** hud.ts toggleWindow: the window has just opened (or a tab was picked). */
export function renderMailWindow(which?: Tab): void {
  if (which) tab = which;
  const w = $("win-mail");
  if (!w.classList.contains("on")) return;
  document.getElementById("item-tip")?.classList.remove("on");
  w.querySelectorAll<HTMLElement>(".mtabs .lp-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mtab === tab)));
  renderBadge();
  const body = w.querySelector(".wbody") as HTMLElement;
  body.innerHTML = "";
  body.dataset.tab = tab;
  if (tab === "inbox") renderInbox(body);
  else renderWrite(body);
}

// ---------- Inbox ----------

function renderInbox(body: HTMLElement): void {
  body.innerHTML = `<div class="ml-inbox"><section class="ml-list"><div class="ml-rows"></div><div class="ah-pager"></div></section>
    <section class="ml-read"></section></div>`;
  if (inbox) drawInbox();
  loadInbox();
}

async function loadInbox(): Promise<void> {
  const mySeq = ++seq;
  const r = await api(`/mail${page > 1 ? `?page=${page}` : ""}`);
  if (mySeq !== seq) return;
  if (r.error) { hud.addChat("system", "", r.error); return; }
  inbox = r;
  page = r.page;
  unread = r.unread ?? unread;
  limits = r.limits ?? limits;
  renderBadge();
  if (tab === "inbox" && $("win-mail").classList.contains("on")) drawInbox();
}

function drawInbox(): void {
  const rows = document.querySelector<HTMLElement>("#win-mail .ml-rows");
  if (!rows) return;
  rows.innerHTML = "";
  const now = Date.now();
  const letters: any[] = inbox?.letters || [];
  if (!letters.length) rows.appendChild(el("div", "ah-empty", `${strokeIcon(ENVELOPE, 28, 1.5)}<div>No letters. Sales, unsold listings and letters from other adventurers arrive here.</div>`));
  letters.forEach((l) => {
    const enc = enclosureState(l);
    const marks = `${l.gold > 0 && enc === "parcel" ? `<span class="ml-mark gold" title="Gold enclosed">${lpIcon("coin", 13, 2)}</span>` : ""}`
      + `${l.items.length && enc === "parcel" ? `<span class="ml-mark parcel" title="Items enclosed">${strokeIcon(PARCEL, 13, 1.8)}</span>` : ""}`;
    const b = button(`ml-row${l.read ? "" : " unread"}${openId === l.id ? " sel" : ""}${l.kind === "system" ? " system" : ""}`,
      `<span class="ml-dot"></span><span class="ml-main"><span class="ml-top"><span class="ml-from">${esc(l.from)}</span>`
      + `<span class="ml-age lp-num">${ageLabel(l.sent_at, now)}</span></span>`
      + `<span class="ml-subj">${esc(l.subject)}</span></span><span class="ml-marks">${marks}</span>`,
      () => openLetter(l.id));
    rows.appendChild(b);
  });
  const pg = document.querySelector<HTMLElement>("#win-mail .ml-list .ah-pager")!;
  pg.innerHTML = "";
  pg.appendChild(pager(inbox?.page ?? 1, inbox?.pages ?? 1, (p) => { page = p; loadInbox(); }));
  const pane = document.querySelector<HTMLElement>("#win-mail .ml-read")!;
  if (openId === null || !letters.some((l) => l.id === openId)) {
    if (!pane.dataset.id || !letters.some((l) => String(l.id) === pane.dataset.id)) {
      pane.dataset.id = "";
      pane.innerHTML = `<div class="ml-none">${strokeIcon(ENVELOPE, 34, 1.3)}<div>${inbox?.total
        ? "Pick a letter to read it."
        : "Your mailbox is empty."}</div><div class="imeta">${inbox?.total ?? 0} letter${inbox?.total === 1 ? "" : "s"} · ${unread} unread</div></div>`;
    }
  }
}

async function openLetter(id: number): Promise<void> {
  openId = id;
  document.querySelectorAll<HTMLElement>("#win-mail .ml-row").forEach((r, i) =>
    r.classList.toggle("sel", inbox?.letters?.[i]?.id === id));
  const r = await api(`/mail/${id}`);
  if (openId !== id) return;
  const pane = document.querySelector<HTMLElement>("#win-mail .ml-read");
  if (!pane) return;
  if (r.error) { pane.innerHTML = `<div class="ml-none"><div>${esc(r.error)}</div></div>`; return; }
  unread = r.unread ?? unread;
  renderBadge();
  // the list's row reads as read now too
  const row = inbox?.letters?.find((l: any) => l.id === id);
  if (row && !row.read) { row.read = true; drawInbox(); }
  drawLetter(pane, r.letter);
}

function drawLetter(pane: HTMLElement, l: any): void {
  pane.dataset.id = String(l.id);
  const age = ageLabel(l.sent_at, Date.now());
  pane.innerHTML = `<div class="ml-head"><div class="ml-title">${esc(l.subject)}</div>
    <div class="imeta">From <b>${esc(l.from)}</b> · ${/^\d+[mhd]$/.test(age) ? `${age} ago` : age}</div></div>
    <div class="ml-body"></div>`;
  (pane.querySelector(".ml-body") as HTMLElement).textContent = l.body || "";
  const enc = enclosureState(l);
  if (enc) {
    const box = el("div", `ml-enc ${enc}`);
    box.appendChild(el("div", "ml-enc-head", enc === "parcel" ? `${strokeIcon(PARCEL, 15, 1.8)}Enclosed` : "Collected"));
    const chips = el("div", "ml-chips");
    if (l.gold > 0) chips.appendChild(el("span", "ml-chip", `${coin(l.gold)} gold`));
    l.items.forEach((it: any) => {
      const def = ITEMS[it.item_key];
      const chip = el("span", "ml-chip", `<span class="iicon">${itemIcon(def)}</span><span class="ah-name ${rarityClass(def?.rarity)}">${esc(it.name)}</span>${it.qty > 1 ? `<span class="ah-qty lp-num">×${it.qty}</span>` : ""}`);
      deps.attachTip(chip, () => deps.itemTipHtml(it.item_key));
      chips.appendChild(chip);
    });
    box.appendChild(chips);
    if (enc === "parcel") {
      const take = button("btn gold", "Collect", async () => {
        take.disabled = true;
        const r = await api(`/mail/${l.id}/collect`, { method: "POST" });
        if (r.error) { take.disabled = false; status(pane, r.error); return; }
        if (state.self && typeof r.gold === "number") state.self.gold = r.gold;
        unread = r.unread ?? unread;
        renderBadge();
        hud.updateSelf();
        auctionPurseChanged();
        const got = [l.gold > 0 ? `${l.gold}g` : "", ...l.items.map((i: any) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`)].filter(Boolean).join(", ");
        hud.addChat("loot", "", `Collected from the post: ${got}.`);
        const row = inbox?.letters?.find((x: any) => x.id === l.id);
        if (row) row.collected = true;
        drawInbox();
        drawLetter(pane, r.letter);
        await deps.refreshInventory();
      });
      box.appendChild(take);
    }
    pane.appendChild(box);
  }
  const acts = el("div", "ml-acts");
  if (l.can_reply) acts.appendChild(button("btn primary", "Reply", () => { draft = replyDraft(l, limits); renderMailWindow("write"); }));
  const del = button("btn danger", "Delete", async () => {
    if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Delete it?"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3000); return; }
    const r = await api(`/mail/${l.id}`, { method: "DELETE" });
    if (r.error) { status(pane, r.error); return; }
    unread = r.unread ?? unread;
    openId = null;
    pane.dataset.id = "";
    loadInbox();
  });
  if (enc === "parcel") { del.disabled = true; del.title = "Collect what is enclosed first."; }
  acts.appendChild(del);
  pane.appendChild(acts);
  pane.appendChild(el("div", "ah-status"));
}

function status(root: HTMLElement, text: string, kind: "ok" | "err" = "err"): void {
  const s = root.querySelector<HTMLElement>(".ah-status");
  if (!s) { hud.addChat("system", "", text); return; }
  s.textContent = text;
  s.dataset.kind = kind;
}

// ---------- Write ----------

function mailable(): any[] {
  return state.inventory.filter((r: any) => !r.equipped_slot && !r.named_relic && !ITEMS[r.item_key]?.bound);
}

function renderWrite(body: HTMLElement): void {
  const form = el("div", "ml-write");
  const to = guard(document.createElement("input"));
  to.className = "hud-field";
  to.placeholder = "Character name";
  to.maxLength = 24;
  to.value = draft.to;
  to.addEventListener("input", () => { draft.to = to.value; });
  const subject = guard(document.createElement("input"));
  subject.className = "hud-field";
  subject.placeholder = "Subject";
  subject.maxLength = limits.subject;
  subject.value = draft.subject;
  subject.addEventListener("input", () => { draft.subject = subject.value; });
  const text = guard(document.createElement("textarea"));
  text.className = "hud-field ml-text";
  text.placeholder = "Write your letter…";
  text.maxLength = limits.body;
  text.value = draft.body;
  const counter = el("span", "ml-count lp-num");
  const count = () => { counter.textContent = `${draft.body.length}/${limits.body}`; };
  text.addEventListener("input", () => { draft.body = text.value; count(); });
  count();
  const row = (label: string, ...kids: HTMLElement[]) => {
    const r = el("label", "ml-frow", `<span class="ah-flabel">${label}</span>`);
    r.append(...kids);
    return r;
  };
  form.append(row("To", to), row("Subject", subject), text, counter);

  const parcel = el("div", "ml-parcel");
  parcel.innerHTML = `<div class="wsection">Enclose</div>`;
  const gold = guard(document.createElement("input"));
  gold.type = "number";
  gold.min = "0";
  gold.max = String(limits.gold);
  gold.className = "hud-field ah-num";
  gold.value = draft.gold ? String(draft.gold) : "";
  gold.placeholder = "0";
  const encl = el("div", "ml-chips");
  const cost = el("div", "imeta ml-cost lp-num");
  const drawCost = () => {
    const post = postageFor(draft, limits);
    cost.innerHTML = post
      ? `Postage ${post}g for a parcel · from your purse: <b>${draftCost(draft, limits).toLocaleString()}g</b> of ${(state.self?.gold ?? 0).toLocaleString()}g`
      : "A letter with nothing enclosed goes free.";
  };
  gold.addEventListener("input", () => { draft.gold = Math.max(0, parseInt(gold.value, 10) || 0); drawCost(); });
  const goldRow = el("label", "ml-frow", `<span class="ah-flabel">${lpIcon("coin", 13, 2)} Gold</span>`);
  goldRow.appendChild(gold);
  parcel.append(goldRow, encl);
  const picker = el("div", "ml-picker");
  parcel.appendChild(picker);
  parcel.appendChild(cost);
  const drawEnclosures = () => {
    encl.innerHTML = "";
    draft.items.forEach((e) => {
      const def = ITEMS[e.item_key];
      const chip = el("span", "ml-chip", `<span class="iicon">${itemIcon(def)}</span><span class="ah-name ${rarityClass(def?.rarity)}">${esc(def?.name || e.item_key)}</span>${e.qty > 1 ? `<span class="ah-qty lp-num">×${e.qty}</span>` : ""}`);
      chip.appendChild(button("ml-x", lpIcon("close", 11, 2.4), () => {
        draft.items = draft.items.filter((x) => x !== e);
        drawEnclosures(); drawPicker(); drawCost();
      }));
      encl.appendChild(chip);
    });
    if (!draft.items.length) encl.appendChild(el("span", "imeta", `Up to ${limits.stacks} items from your bags, below.`));
    else encl.appendChild(el("span", "imeta lp-num", `${draft.items.length}/${limits.stacks}`));
  };
  const drawPicker = () => {
    picker.innerHTML = "";
    const rows = mailable();
    const pages = Math.max(1, Math.ceil(rows.length / PICK_PER_PAGE));
    pickPage = Math.min(Math.max(1, pickPage), pages);
    if (!rows.length) picker.appendChild(el("div", "imeta", "Nothing in your bags can be sent."));
    rows.slice((pickPage - 1) * PICK_PER_PAGE, pickPage * PICK_PER_PAGE).forEach((r: any) => {
      const def = ITEMS[r.item_key];
      const inDraft = draft.items.find((e) => e.inventory_item_id === r.id)?.qty ?? 0;
      const left = r.qty - inDraft;
      const line = el("div", "ml-pick");
      line.innerHTML = `<span class="iicon">${itemIcon(def)}</span><span class="ah-name ${rarityClass(def?.rarity)}">${esc(def?.name || r.item_key)}</span><span class="ah-have lp-num">${left < 1 ? "enclosed" : left > 1 || inDraft ? `${left} left` : ""}</span>`;
      deps.attachTip(line, () => deps.itemTipHtml(r.item_key));
      let qty: HTMLInputElement | null = null;
      if (left > 1) {
        qty = guard(document.createElement("input"));
        qty.type = "number";
        qty.min = "1";
        qty.max = String(left);
        qty.value = String(left);
        qty.className = "hud-field ah-num sm";
        qty.setAttribute("aria-label", "How many");
        line.appendChild(qty);
      }
      const add = button("btn sm", "Enclose", () => {
        const out = enclose(draft.items, r, qty ? parseInt(qty.value, 10) || 0 : 1, limits);
        if (typeof out === "string") { status(form, out); return; }
        draft.items = out;
        drawEnclosures(); drawPicker(); drawCost();
      });
      add.disabled = left < 1;
      line.appendChild(add);
      picker.appendChild(line);
    });
    if (pages > 1) picker.appendChild(pager(pickPage, pages, (p) => { pickPage = p; drawPicker(); }));
  };
  drawEnclosures();
  drawPicker();
  drawCost();
  form.appendChild(parcel);

  const foot = el("div", "ml-foot");
  const clear = button("btn", "Discard", () => { draft = emptyDraft(); renderMailWindow("write"); });
  const sendB = button("btn gold", "Send", async () => {
    const problem = draftProblem(draft, state.self?.gold ?? 0, state.self?.name ?? "", limits);
    if (problem) { status(form, problem); return; }
    sendB.disabled = true;
    const r = await api("/mail", { method: "POST", body: JSON.stringify({
      to: draft.to.trim(), subject: draft.subject.trim(), body: draft.body, gold: draft.gold,
      items: draft.items.map((e) => ({ inventory_item_id: e.inventory_item_id, qty: e.qty })),
    }) });
    sendB.disabled = false;
    if (r.error) { status(form, r.error); return; }
    const who = draft.to.trim();
    draft = emptyDraft();
    if (state.self && typeof r.gold === "number") state.self.gold = r.gold;
    hud.updateSelf();
    auctionPurseChanged();
    await deps.refreshInventory();
    renderMailWindow("write");
    status($("win-mail"), `Sent to ${who}${r.postage ? ` (${r.postage}g postage)` : ""}.`, "ok");
  });
  foot.append(clear, sendB);
  // the status above the sticky foot, where it is seen
  form.appendChild(el("div", "ah-status"));
  form.appendChild(foot);
  body.appendChild(form);
}
