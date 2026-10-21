// The auction house window (Philip, 2026-10-14: categories, search, clear Buy
// and Sell tabs, every list paged). Three tabs: Buy browses the live listings
// a page at a time, filtered and sorted by the server (Vanai::Market) from a
// category sidebar, a name search, a level range, a rarity and a sort; Sell
// lists from your bags with a suggested price; My Listings shows what you have
// up, how long each has left, and cancels. A listing runs five days and an
// unsold one comes home by mail (mail-hud.ts).
//
// hud.ts reaches this through two hooks (initAuctionHud, openAuctionHouse);
// the rules live in auction-model.ts, which the node tests read.

import "./auction-mail.css";
import { ITEMS } from "./data";
import { state } from "./state";
import { api, rest } from "./net";
import { itemIcon, lpIcon, strokeIcon } from "./icons";
import { courtAuctionTaxHtml, courtAuctionTotal } from "./court-hud";
import { pager, clampPage } from "./pager";
import {
  CATEGORIES, SORTS, RARITIES, categoryOf, freshBrowse, browseQuery, pickCategory, timeLeft, endingSoon,
  sellableRows, each, suggestPrice, rarityClass, lvlLabel, type Browse,
} from "./auction-model";
import type { HudApi } from "./hud";

/** What hud.ts lends the window: its tooltips and the inventory refresh. */
export interface MarketDeps {
  itemTipHtml(key: string): string;
  attachTip(el: HTMLElement, html: () => string): void;
  refreshInventory(): Promise<void>;
}

type Tab = "buy" | "sell" | "mine";

let hud: HudApi;
let deps: MarketDeps;
let tab: Tab = "buy";
let browse: Browse = freshBrowse();
// the last browse's answer: the sidebar's counts and the tax survive a
// re-render of the shell, the rows are redrawn from it
let last: any = null;
// a slower answer to an older browse never overwrites a newer one
let seq = 0;
let mineCount = 0;
let limit = 7;
let mine: any[] = [];
let minePage = 1;
let bagsPage = 1;
let bagsFilter = "";
let picked: number | null = null; // the bags row on the Sell tab
let searchTimer = 0;

const BAGS_PER_PAGE = 10;
const MINE_PER_PAGE = 10;
// a hammer for the empty Buy page and a magnifier for the search box
const GAVEL = "M14 4l6 6M11 7l6 6M12.5 5.5 5 13l6 6 7.5-7.5M3 21h8";
const SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M16 16l5 5";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
// The world's keydown handler steps aside only for the chat input, so every
// field here swallows its own keys (hud.ts guardKeys).
function guard<T extends HTMLElement>(input: T): T {
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return input;
}
function field(type: string, cls: string, placeholder = ""): HTMLInputElement {
  const i = guard(document.createElement("input"));
  i.type = type;
  i.className = `hud-field ${cls}`;
  i.placeholder = placeholder;
  return i;
}
function select(cls: string, options: { key: string; label: string }[], value: string, label: string): HTMLSelectElement {
  const s = guard(document.createElement("select"));
  s.className = `hud-field ah-select ${cls}`;
  s.setAttribute("aria-label", label);
  options.forEach((o) => s.add(new Option(o.label, o.key, false, o.key === value)));
  return s;
}
function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.tabIndex = -1; // Space and Enter belong to the world
  b.innerHTML = label;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}
const coin = (n: number) => `<span class="ah-gold lp-num">${lpIcon("coin", 12, 2)}${n.toLocaleString()}</span>`;
const qtyTag = (q: number) => (q > 1 ? ` <span class="ah-qty lp-num">×${q}</span>` : "");
const shelfName = (b: Browse) => {
  const c = CATEGORIES.find((x) => x.key === b.cat);
  const s = c?.subs.find((x) => x.key === b.sub);
  return s ? `${c!.label} › ${s.label}` : c?.label ?? "All";
};

/** Once, from initHud, before the windows are made draggable. */
export function initAuctionHud(hudApi: HudApi, lent: MarketDeps): void {
  hud = hudApi;
  deps = lent;
  $("hud").insertAdjacentHTML("beforeend", `
    <div class="window market" id="win-auction"><div class="whead"><span class="wtitle">The Auction House</span>
      <div class="mtabs" role="tablist" aria-label="Auction house">
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-atab="buy" aria-selected="true">Buy</button>
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-atab="sell" aria-selected="false">Sell</button>
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-atab="mine" aria-selected="false">My Listings <span class="mtab-count lp-num"></span></button>
      </div>
      <span class="ah-purse lp-num" title="Your gold"></span>
      <button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button></div>
      <div class="wbody"></div>
      <div class="ah-confirm" hidden></div></div>`);
  const w = $("win-auction");
  w.querySelector(".wclose")!.addEventListener("click", () => w.classList.remove("on"));
  w.querySelectorAll<HTMLElement>(".mtabs .lp-tab").forEach((b) =>
    b.addEventListener("click", () => { if (tab !== b.dataset.atab) { tab = b.dataset.atab as Tab; renderAuctionHouse(); } }));
  // closed by its X, Escape or closeWindows: put away the tip and the confirm
  new MutationObserver(() => {
    if (w.classList.contains("on")) return;
    hideConfirm();
    document.getElementById("item-tip")?.classList.remove("on");
  }).observe(w, { attributes: true, attributeFilter: ["class"] });
}

/** The broker's "The Auction House" button. */
export function openAuctionHouse(which: Tab = "buy"): void {
  tab = which;
  $("win-auction").classList.add("on");
  renderAuctionHouse();
}

function renderAuctionHouse(): void {
  const w = $("win-auction");
  if (!w.classList.contains("on")) return;
  hideConfirm();
  document.getElementById("item-tip")?.classList.remove("on");
  w.querySelectorAll<HTMLElement>(".mtabs .lp-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.atab === tab)));
  renderPurse();
  renderTabCount();
  const body = w.querySelector(".wbody") as HTMLElement;
  body.innerHTML = "";
  body.dataset.tab = tab;
  if (tab === "buy") renderBuy(body);
  else if (tab === "sell") renderSell(body);
  else renderMine(body);
}

function renderPurse(): void {
  const p = document.querySelector<HTMLElement>("#win-auction .ah-purse");
  if (p) p.innerHTML = `${lpIcon("coin", 14, 2)}${(state.self?.gold ?? 0).toLocaleString()}`;
}

function renderTabCount(): void {
  const c = document.querySelector<HTMLElement>("#win-auction .mtab-count");
  if (c) { c.textContent = `${mineCount}/${limit}`; c.classList.toggle("full", mineCount >= limit); }
}

function flash(body: HTMLElement, text: string, kind: "ok" | "err" = "err"): void {
  const s = body.querySelector<HTMLElement>(".ah-status");
  if (!s) { hud.addChat("system", "", text); return; }
  s.textContent = text;
  s.dataset.kind = kind;
}

// ---------- Buy ----------

function renderBuy(body: HTMLElement): void {
  const wrap = el("div", "ah-buy");
  const cats = el("nav", "ah-cats");
  cats.setAttribute("aria-label", "Categories");
  const main = el("section", "ah-main");
  wrap.append(cats, main);
  body.appendChild(wrap);

  // the filter row is built once a visit: redrawing it on every answer would
  // take the caret out of the search box mid-word
  const bar = el("div", "ah-filters");
  const searchWrap = el("label", "ah-search", strokeIcon(SEARCH, 14, 2));
  const q = field("search", "ah-q", "Search by name");
  q.value = browse.q;
  q.maxLength = 40;
  q.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { browse = { ...browse, q: q.value, page: 1 }; loadBuy(); }, 280);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(searchTimer);
    browse = { ...browse, q: q.value, page: 1 };
    loadBuy();
  });
  searchWrap.appendChild(q);
  const lvl = el("div", "ah-lvl", `<span class="ah-flabel">Lv</span>`);
  const lo = field("number", "ah-lv", "1"), hi = field("number", "ah-lv", "50");
  [lo, hi].forEach((i) => { i.min = "1"; i.max = "50"; });
  lo.value = browse.lvlMin;
  hi.value = browse.lvlMax;
  lo.setAttribute("aria-label", "Lowest level");
  hi.setAttribute("aria-label", "Highest level");
  const onLvl = () => { browse = { ...browse, lvlMin: lo.value, lvlMax: hi.value, page: 1 }; loadBuy(); };
  lo.addEventListener("change", onLvl);
  hi.addEventListener("change", onLvl);
  lvl.append(lo, el("span", "ah-dash", "–"), hi);
  const rarity = select("ah-rarity", [{ key: "", label: "Any rarity" },
    ...RARITIES.map((r) => ({ key: r, label: r[0].toUpperCase() + r.slice(1) }))], browse.rarity, "Rarity");
  rarity.addEventListener("change", () => { browse = { ...browse, rarity: rarity.value, page: 1 }; loadBuy(); });
  const sort = select("ah-sort", SORTS, browse.sort, "Sort by");
  sort.addEventListener("change", () => { browse = { ...browse, sort: sort.value, page: 1 }; loadBuy(); });
  const reset = button("btn sm ah-reset", "Clear", () => { browse = { ...freshBrowse(), cat: browse.cat, sub: browse.sub }; renderAuctionHouse(); });
  bar.append(searchWrap, lvl, rarity, sort, reset);
  main.appendChild(bar);
  main.appendChild(el("div", "ah-summary"));
  const table = el("div", "ah-table");
  table.innerHTML = `<div class="ah-th"><span class="c-item">Item</span><span class="c-lv">Lv</span><span class="c-seller">Seller</span><span class="c-left">Time left</span><span class="c-price">Price</span><span class="c-act"></span></div><div class="ah-rows"></div>`;
  main.appendChild(table);
  main.appendChild(el("div", "ah-pager"));
  main.appendChild(el("div", "ah-status"));
  renderCats(cats);
  if (last) drawResults(main);
  loadBuy();
}

function renderCats(nav: HTMLElement): void {
  nav.innerHTML = "";
  const counts = last?.counts || {};
  CATEGORIES.forEach((c) => {
    const n = counts[c.key] ?? 0;
    const top = button(`ah-cat${browse.cat === c.key && !browse.sub ? " sel" : ""}${browse.cat === c.key ? " open" : ""}`,
      `<span class="ah-cname">${esc(c.label)}</span><span class="ah-ccount lp-num">${n || ""}</span>`,
      () => { browse = pickCategory(browse, c.key, null); renderCats(nav); loadBuy(); });
    top.setAttribute("aria-pressed", String(browse.cat === c.key && !browse.sub));
    nav.appendChild(top);
    // a shelf's own shelves show while it is the one picked
    if (browse.cat !== c.key) return;
    c.subs.forEach((s) => {
      const sn = counts[`${c.key}/${s.key}`] ?? 0;
      const sub = button(`ah-cat sub${browse.sub === s.key ? " sel" : ""}`,
        `<span class="ah-cname">${esc(s.label)}</span><span class="ah-ccount lp-num">${sn || ""}</span>`,
        () => { browse = pickCategory(browse, c.key, s.key); renderCats(nav); loadBuy(); });
      sub.setAttribute("aria-pressed", String(browse.sub === s.key));
      nav.appendChild(sub);
    });
  });
}

async function loadBuy(): Promise<void> {
  const mySeq = ++seq;
  const res = await api(`/auction${browseQuery(browse)}`);
  if (mySeq !== seq || tab !== "buy") return;
  const main = document.querySelector<HTMLElement>("#win-auction .ah-main");
  if (!main) return;
  if (res.error) { flash(main, res.error); return; }
  last = res;
  browse = { ...browse, page: res.page };
  mineCount = res.mine_count ?? mineCount;
  limit = res.limit ?? limit;
  renderTabCount();
  renderCats(document.querySelector<HTMLElement>("#win-auction .ah-cats")!);
  drawResults(main);
}

function drawResults(main: HTMLElement): void {
  const res = last;
  const summary = main.querySelector<HTMLElement>(".ah-summary")!;
  const n = res.total ?? 0;
  summary.innerHTML = `<div class="ah-found"><b>${esc(shelfName(browse))}</b> · ${n.toLocaleString()} listing${n === 1 ? "" : "s"}`
    + `${browse.q.trim() ? ` matching “${esc(browse.q.trim())}”` : ""}</div>${courtAuctionTaxHtml(res.tax)}`;
  const rows = main.querySelector<HTMLElement>(".ah-rows")!;
  rows.innerHTML = "";
  rows.scrollTop = 0;
  const now = Date.now();
  if (!res.listings?.length) {
    const filtered = browse.cat !== "all" || browse.q.trim() || browse.lvlMin || browse.lvlMax || browse.rarity;
    rows.appendChild(el("div", "ah-empty", `${strokeIcon(GAVEL, 28, 1.5)}<div>${filtered
      ? "Nothing listed matches. Try another shelf or clear the filters."
      : "Nothing is listed right now. Be the first: the Sell tab lists from your bags."}</div>`));
  }
  (res.listings || []).forEach((l: any) => {
    const total = courtAuctionTotal(res.tax, l.price);
    const it = ITEMS[l.item_key];
    const row = el("div", `ah-row${l.mine ? " mine" : ""}`);
    row.innerHTML = `<span class="c-item"><span class="iicon">${itemIcon(it)}</span><span class="ah-name ${rarityClass(l.rarity)}">${esc(l.name)}${qtyTag(l.qty)}</span></span>`
      + `<span class="c-lv lp-num">${lvlLabel(l.lvl)}</span>`
      + `<span class="c-seller">${esc(l.seller)}</span>`
      + `<span class="c-left lp-num${endingSoon(l.expires_at, now) ? " soon" : ""}">${timeLeft(l.expires_at, now)}</span>`
      + `<span class="c-price">${coin(total)}${total > l.price ? `<small class="lp-num">${l.price.toLocaleString()} + ${(total - l.price).toLocaleString()} tax</small>` : ""}`
      + `${l.qty > 1 ? `<small class="lp-num">${each(total, l.qty).toLocaleString()} each</small>` : ""}</span>`;
    deps.attachTip(row.querySelector(".c-item") as HTMLElement, () => deps.itemTipHtml(l.item_key));
    const act = el("span", "c-act");
    if (l.mine) act.innerHTML = `<span class="ah-yours">Yours</span>`;
    else act.appendChild(button("btn gold sm", "Buy", () => confirmBuy(l, total)));
    row.appendChild(act);
    rows.appendChild(row);
  });
  const pg = main.querySelector<HTMLElement>(".ah-pager")!;
  pg.innerHTML = "";
  pg.appendChild(pager(res.page ?? 1, res.pages ?? 1, (p) => { browse = { ...browse, page: p }; loadBuy(); }));
}

// The buy is confirmed in the window, over the list: what, from whom, and the
// total with the house's tax broken out -- the total that goes back to the
// server, which refuses it if the rate moved meanwhile.
function confirmBuy(l: any, total: number): void {
  const box = document.querySelector<HTMLElement>("#win-auction .ah-confirm")!;
  const it = ITEMS[l.item_key];
  const tax = total - l.price;
  box.innerHTML = `<div class="ah-card" role="dialog" aria-label="Confirm purchase">
    <div class="ah-card-head"><span class="iicon big">${itemIcon(it)}</span><div><div class="ah-name ${rarityClass(l.rarity)}">${esc(l.name)}${qtyTag(l.qty)}</div>
    <div class="imeta">from ${esc(l.seller)} · Lv ${lvlLabel(l.lvl)}</div></div></div>
    <dl class="ah-sum"><dt>Price</dt><dd>${coin(l.price)}</dd>${tax > 0 ? `<dt>House tax</dt><dd>${coin(tax)}</dd>` : ""}
    <dt class="tot">Total</dt><dd class="tot">${coin(total)}</dd><dt>Your gold after</dt><dd>${coin((state.self?.gold ?? 0) - total)}</dd></dl>
    <div class="ah-card-msg"></div><div class="btns"></div></div>`;
  const msg = box.querySelector<HTMLElement>(".ah-card-msg")!;
  const btns = box.querySelector<HTMLElement>(".btns")!;
  const poor = (state.self?.gold ?? 0) < total;
  if (poor) msg.textContent = "Not enough gold.";
  const buy = button("btn gold", `Buy for ${total.toLocaleString()}g`, async () => {
    buy.disabled = true;
    const r = await rest.auctionBuy(l.id, total);
    if (r.error) {
      msg.textContent = r.error;
      // a moved rate: redraw the list at the new one behind the card
      if (r.tax) { hideConfirm(); loadBuy(); flash(document.querySelector("#win-auction .ah-main") as HTMLElement, r.error); }
      return;
    }
    hud.addChat("loot", "", `Won at auction: ${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""} for ${r.total ?? total}g.`);
    hideConfirm();
    await deps.refreshInventory();
    hud.updateSelf();
    renderPurse();
    loadBuy();
  });
  buy.disabled = poor;
  btns.append(button("btn", "Cancel", hideConfirm), buy);
  box.hidden = false;
}

function hideConfirm(): void {
  const box = document.querySelector<HTMLElement>("#win-auction .ah-confirm");
  if (box) { box.hidden = true; box.innerHTML = ""; }
}

// ---------- Sell ----------

function renderSell(body: HTMLElement): void {
  const wrap = el("div", "ah-sell");
  const bags = el("section", "ah-bags");
  const form = el("section", "ah-form");
  wrap.append(bags, form);
  body.appendChild(wrap);
  const head = el("div", "ah-bags-head", `<div class="wsection">Your bags</div>`);
  const filter = field("search", "ah-bagq", "Filter");
  filter.value = bagsFilter;
  filter.addEventListener("input", () => { bagsFilter = filter.value; bagsPage = 1; drawBags(bags); });
  head.appendChild(filter);
  bags.appendChild(head);
  bags.appendChild(el("div", "ah-baglist"));
  bags.appendChild(el("div", "ah-pager"));
  drawBags(bags);
  drawForm(form);
  // the count of what you have up, for "n/7"
  if (!last) api("/auction?per=1").then((r) => { if (!r.error) { last = r; mineCount = r.mine_count; limit = r.limit; renderTabCount(); drawForm(form); } });
}

function sellable(): any[] {
  const f = bagsFilter.trim().toLowerCase();
  return sellableRows(state.inventory, ITEMS).filter((r) => !f || (ITEMS[r.item_key]?.name || "").toLowerCase().includes(f));
}

function drawBags(bags: HTMLElement): void {
  const list = bags.querySelector<HTMLElement>(".ah-baglist")!;
  list.innerHTML = "";
  const rows = sellable();
  const pages = Math.max(1, Math.ceil(rows.length / BAGS_PER_PAGE));
  bagsPage = clampPage(bagsPage, pages);
  if (!rows.length) list.appendChild(el("div", "imeta ah-none", bagsFilter ? "Nothing in your bags by that name." : "Nothing in your bags can be sold. What you wear stays on you; take it off first."));
  rows.slice((bagsPage - 1) * BAGS_PER_PAGE, bagsPage * BAGS_PER_PAGE).forEach((r) => {
    const it = ITEMS[r.item_key];
    const b = button(`ah-bag${picked === r.id ? " sel" : ""}`,
      `<span class="iicon">${itemIcon(it)}</span><span class="ah-name ${rarityClass(it?.rarity)}">${esc(it?.name || r.item_key)}</span>`
      + `<span class="ah-have lp-num">${r.qty > 1 ? `×${r.qty}` : ""}</span>`,
      () => { picked = r.id; drawBags(bags); drawForm(document.querySelector("#win-auction .ah-form") as HTMLElement); });
    deps.attachTip(b, () => deps.itemTipHtml(r.item_key));
    list.appendChild(b);
  });
  const pg = bags.querySelector<HTMLElement>(".ah-pager")!;
  pg.innerHTML = "";
  pg.appendChild(pager(bagsPage, pages, (p) => { bagsPage = p; drawBags(bags); }));
}

function drawForm(form: HTMLElement): void {
  form.innerHTML = "";
  const row = state.inventory.find((r: any) => r.id === picked && sellableRows([r], ITEMS).length);
  const slots = `<div class="ah-slots"><span class="lp-num${mineCount >= limit ? " full" : ""}">${mineCount}/${limit}</span> listings up</div>`;
  if (!row) {
    picked = null;
    form.innerHTML = `<div class="ah-pick">${strokeIcon(GAVEL, 30, 1.5)}<div class="ah-pick-t">Pick something from your bags to sell.</div>
      <div class="imeta">Listings run five days. Whatever does not sell comes back to you by mail. You keep the full price; the buyer pays the house's tax on top.</div></div>${slots}`;
    return;
  }
  const it = ITEMS[row.item_key];
  const cat = categoryOf(it);
  const kind = [cat && CATEGORIES.find((c) => c.key === cat[0])?.subs.find((s) => s.key === cat[1])?.label
    || (cat && CATEGORIES.find((c) => c.key === cat[0])?.label), it.lvl ? `Lv ${it.lvl}` : "", it.rarity && it.rarity !== "common" ? it.rarity : ""]
    .filter(Boolean).join(" · ");
  form.insertAdjacentHTML("beforeend", `<div class="ah-card-head"><span class="iicon big">${itemIcon(it)}</span><div>
    <div class="ah-name ${rarityClass(it.rarity)}">${esc(it.name)}</div><div class="imeta">${esc(kind)} · you have ${row.qty}</div></div></div>`);
  const grid = el("div", "ah-grid");
  const qty = field("number", "ah-num", "1");
  qty.min = "1";
  qty.max = String(row.qty);
  qty.value = String(row.qty > 1 ? row.qty : 1);
  qty.disabled = row.qty <= 1;
  const price = field("number", "ah-num", "price");
  price.min = "1";
  const eachNote = el("span", "imeta ah-each lp-num");
  const hint = el("div", "imeta ah-hint", "Checking the market…");
  const qtyRow = el("label", "ah-frow", `<span class="ah-flabel">Quantity</span>`);
  qtyRow.appendChild(qty);
  if (row.qty > 1) qtyRow.appendChild(button("btn sm", "All", () => { qty.value = String(row.qty); onQty(); }));
  const priceRow = el("label", "ah-frow", `<span class="ah-flabel">Price</span>`);
  priceRow.append(price, el("span", "ah-unit", "gold total"));
  grid.append(qtyRow, priceRow, eachNote);
  form.appendChild(grid);
  form.appendChild(hint);
  let check: any = null;
  let touched = false; // a price you typed is never overwritten by the suggestion
  const n = () => Math.min(row.qty, Math.max(1, parseInt(qty.value, 10) || 1));
  const onPrice = () => {
    const p = parseInt(price.value, 10) || 0;
    eachNote.textContent = p > 0 && n() > 1 ? `${each(p, n()).toLocaleString()}g each` : "";
  };
  const suggest = () => { price.value = String(suggestPrice(check, n())); onPrice(); };
  const onQty = () => { if (!touched) suggest(); else onPrice(); };
  qty.addEventListener("input", onQty);
  price.addEventListener("input", () => { touched = true; onPrice(); });
  suggest();
  api(`/auction/price?item_key=${encodeURIComponent(row.item_key)}`).then((r) => {
    if (picked !== row.id || r.error) { if (r.error) hint.textContent = ""; return; }
    check = r;
    const bits = [r.lowest_each ? `Cheapest listed: <b>${r.lowest_each.toLocaleString()}g</b> each (${r.listed} up)` : "None listed right now",
      r.merchant ? `merchants sell at ${r.merchant.toLocaleString()}g` : r.merchant_sell ? `merchants pay ${r.merchant_sell.toLocaleString()}g` : ""];
    hint.innerHTML = bits.filter(Boolean).join(" · ");
    hint.appendChild(button("btn sm ah-suggest", "Suggest a price", () => { touched = false; suggest(); }));
    if (!touched) suggest();
  });
  const full = mineCount >= limit;
  form.insertAdjacentHTML("beforeend", `<div class="imeta ah-terms">Runs five days; unsold goods come back by mail. You keep the full price.</div>`);
  const foot = el("div", "ah-form-foot");
  foot.insertAdjacentHTML("beforeend", slots);
  const list = button("btn gold", full ? "All listing places in use" : "List it", async () => {
    const p = parseInt(price.value, 10);
    if (!p || p < 1) { flash(form, "Set a price first."); price.focus(); return; }
    list.disabled = true;
    const r = await rest.auctionList(row.id, n(), p);
    list.disabled = false;
    if (r.error) { flash(form, r.error); return; }
    hud.addChat("system", "", `Listed ${it.name}${n() > 1 ? ` ×${n()}` : ""} for ${p}g at the auction house.`);
    mineCount++;
    renderTabCount();
    last = null; // the browse's counts are stale now
    await deps.refreshInventory();
    picked = state.inventory.some((x: any) => x.id === row.id) ? row.id : null;
    const body = document.querySelector<HTMLElement>("#win-auction .wbody")!;
    renderAuctionHouse();
    flash(body, `Listed for ${p.toLocaleString()}g.`, "ok");
  });
  list.disabled = full;
  foot.appendChild(list);
  form.appendChild(foot);
  form.appendChild(el("div", "ah-status"));
}

// ---------- My Listings ----------

function renderMine(body: HTMLElement): void {
  body.innerHTML = `<div class="ah-mine-head"><div class="imeta">Listings run five days. Whatever has not sold by then comes back to you by mail, and a sale writes to you too; the gold is in your purse the moment it sells.</div></div>
    <div class="ah-table mine"><div class="ah-th"><span class="c-item">Item</span><span class="c-price">Price</span><span class="c-left">Time left</span><span class="c-act"></span></div><div class="ah-rows"></div></div>
    <div class="ah-pager"></div><div class="ah-status"></div>`;
  drawMine(body);
  api("/auction/mine").then((r) => {
    if (tab !== "mine") return;
    if (r.error) { flash(body, r.error); return; }
    mine = r.listings || [];
    mineCount = mine.length;
    limit = r.limit ?? limit;
    renderTabCount();
    drawMine(body);
  });
}

function drawMine(body: HTMLElement): void {
  const rows = body.querySelector<HTMLElement>(".ah-rows")!;
  rows.innerHTML = "";
  const now = Date.now();
  const pages = Math.max(1, Math.ceil(mine.length / MINE_PER_PAGE));
  minePage = clampPage(minePage, pages);
  if (!mine.length) rows.appendChild(el("div", "ah-empty", `${strokeIcon(GAVEL, 28, 1.5)}<div>You have nothing up. List from the Sell tab: up to ${limit} at a time.</div>`));
  mine.slice((minePage - 1) * MINE_PER_PAGE, minePage * MINE_PER_PAGE).forEach((l) => {
    const it = ITEMS[l.item_key];
    const row = el("div", "ah-row");
    row.innerHTML = `<span class="c-item"><span class="iicon">${itemIcon(it)}</span><span class="ah-name ${rarityClass(l.rarity)}">${esc(l.name)}${qtyTag(l.qty)}</span></span>`
      + `<span class="c-price">${coin(l.price)}${l.qty > 1 ? `<small class="lp-num">${each(l.price, l.qty).toLocaleString()} each</small>` : ""}</span>`
      + `<span class="c-left lp-num${endingSoon(l.expires_at, now) ? " soon" : ""}">${timeLeft(l.expires_at, now)}</span>`;
    deps.attachTip(row.querySelector(".c-item") as HTMLElement, () => deps.itemTipHtml(l.item_key));
    const act = el("span", "c-act");
    const cancel = button("btn sm", "Cancel", async () => {
      cancel.disabled = true;
      const r = await rest.auctionCancel(l.id);
      if (r.error) { cancel.disabled = false; flash(body, r.error); return; }
      mine = mine.filter((x) => x.id !== l.id);
      mineCount = mine.length;
      last = null;
      renderTabCount();
      drawMine(body);
      flash(body, `${l.name} is back in your bags.`, "ok");
      await deps.refreshInventory();
    });
    act.appendChild(cancel);
    row.appendChild(act);
    rows.appendChild(row);
  });
  const pg = body.querySelector<HTMLElement>(".ah-pager")!;
  pg.innerHTML = "";
  pg.appendChild(pager(minePage, pages, (p) => { minePage = p; drawMine(body); }));
}

/** The purse changed elsewhere (a sale, a collected parcel): redraw it if open. */
export function auctionPurseChanged(): void {
  if ($("win-auction")?.classList.contains("on")) renderPurse();
}

