// The courts in the HUD (COURTS.md "The court window and its news", "UI"):
// the dock's ninth key and its badge, the court window and its three tabs, the
// notice cards, the hall panels (board, registry, swearing, book), the
// character panel's line, the herald's dialog button, and every court_*
// message. Nothing from the courts goes in chat.
//
// hud.ts and world.ts reach this through one-line hooks (tmp/courts/PLAN.md
// 5.2); the rules live in court-model.ts, which the node tests read.

import "./court.css";
import { COURTS, ZONES, ITEMS } from "./data";
import { state } from "./state";
import { api, send } from "./net";
import { lpIcon } from "./icons";
import {
  CourtModel, fmtCycleEnds, loyaltyLines, offerLines, recordTotals, boardLabel, newsLabel, bountyLabel, bountyProgress, bountyRows, bountyExpiry,
  boardBountyAction, memberPrice, crumbleLabel, registryLeft, registryQuote, letterLabel,
  type NewsItem, type Bounty, type RegistryPanel, type Letter, type Card,
} from "./court-model";
import { courtName, courtColor, courtShort, bountyPins, contested } from "./court-data";
import { drawWorldBanners, drawZoneBanner, drawMinimapBanner } from "./court-map";
import { showZoneOnMap } from "./map";
import type { HudApi } from "./hud";

export const courtModel = new CourtModel();

let hud: HudApi | null = null;
type Tab = "allegiance" | "news" | "letters";
let tab: Tab = "allegiance";
// the News tab's pages, newest first, and the cursor for the next
let newsItems: NewsItem[] = [];
let newsNext: number | null = null;
/** the Allegiance tab's record as paged so far (Older adds to it) */
let record: any = null;
/** the Letters tab's next page back (null: nothing older) */
let lettersNext: number | null = null;
// the hall panel on screen: its station, its court, the board's cursor, its
// items so far (a bounty's buttons redraw as it is taken), and whether it was
// opened at the board itself (interact) or read from afar (the herald)
let hall: { station: string; court: string; next: string | null; items: any[]; atBoard: boolean; taken: Record<string, string> } | null = null;
// the journal's selected bounty, when a court bounty rather than a duty is open
let selectedBounty: number | null = null;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nameOf = (k: string | null | undefined) => courtName(COURTS, k);
// mid-sentence a proper name's own article is lower case ("from the Glassworks")
const mid = (s: string) => String(s ?? "").replace(/^The /, "the ");
const swatch = (k: string | null | undefined) =>
  `<i class="cswatch" style="background:${courtColor(COURTS, k)};border-color:${COURTS.courts?.[k ?? ""]?.banner?.trim ?? "#c9a35c"}"></i>`;
const pct = (bp: number | undefined) => (bp == null ? "?" : `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`);

/** Once, from initHud, before the windows are made draggable. */
export function initCourtHud(hudApi: HudApi): void {
  hud = hudApi;
  const close = `<button class="wclose" aria-label="Close">${lpIcon("close", 14, 2.2)}</button>`;
  $("hud").insertAdjacentHTML("beforeend", `
    <div class="window court" id="win-court"><div class="whead"><span class="wtitle">The Court</span>
      <div class="ctabs" role="tablist" aria-label="Court sections">
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-ctab="allegiance" aria-selected="true">Allegiance</button>
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-ctab="news" aria-selected="false">News<span class="cunread lp-num"></span></button>
        <button type="button" class="lp-tab" role="tab" tabindex="-1" data-ctab="letters" aria-selected="false">Letters<span class="clunread lp-num"></span></button>
      </div>${close}</div><div class="wbody"></div></div>
    <div class="window court" id="win-courthall"><div class="whead"><span class="wtitle">The Court's Board</span>${close}</div><div class="wbody"></div></div>
    <div id="court-card" class="lp-prompt"><div class="phead"><span class="picon"></span><span class="ctitle lp-name"></span></div>
      <div class="ctext"></div><div class="btns"><button class="btn" id="court-card-no">Close</button><button class="btn gold" id="court-card-yes">Read</button></div></div>`);
  for (const id of ["win-court", "win-courthall"]) {
    const w = $(id);
    w.querySelector(".wclose")!.addEventListener("click", () => w.classList.remove("on"));
  }
  // the window is closed by its X, a hotkey, Escape or closeWindows: watch the class
  // (cards wait while it is open, so closing it lets the next one up)
  new MutationObserver(() => {
    if ($("win-court").classList.contains("on") || !courtModel.windowOpen) return;
    courtModel.closeWindow();
    showNextCard();
  }).observe($("win-court"), { attributes: true, attributeFilter: ["class"] });
  $("win-court").querySelectorAll<HTMLElement>(".ctabs .lp-tab").forEach((b) =>
    b.addEventListener("click", () => { tab = b.dataset.ctab as Tab; renderCourtWindow(); }));
  $("court-card-no").addEventListener("click", closeCard);
  $("court-card-yes").addEventListener("click", () => {
    // the window takes over: no next card on top of its tabs
    $("court-card").classList.remove("on");
    courtModel.closeCard();
    openCourtWindow("letters");
  });
  // keep focus where it was, so Space (jump) and Enter never re-press an answer
  document.querySelectorAll("#court-card .btn").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  initBountyJournal();
  const key = document.querySelector<HTMLElement>('#menu-buttons [data-w="court"]');
  key?.insertAdjacentHTML("beforeend", `<span class="cbadge lp-num"></span>`);
  renderBadge();
}

// ---------- the dock badge ----------

function renderBadge(): void {
  const n = courtModel.badge();
  const b = document.querySelector<HTMLElement>("#menu-buttons .cbadge");
  if (b) { b.textContent = n ? String(Math.min(n, 99)) : ""; b.classList.toggle("has", n > 0); }
  const t = document.querySelector<HTMLElement>("#win-court .cunread");
  if (t) { t.textContent = courtModel.newsUnread ? String(Math.min(courtModel.newsUnread, 99)) : ""; t.classList.toggle("has", courtModel.newsUnread > 0); }
  const l = document.querySelector<HTMLElement>("#win-court .clunread");
  const nl = courtModel.lettersUnread;
  if (l) { l.textContent = nl ? String(Math.min(nl, 99)) : ""; l.classList.toggle("has", nl > 0); }
}

// ---------- the court window ----------

// A notice posted before the first sitting opened (the adjourn notice on a
// first boot) belongs to no sitting: "sitting 0" would read as a bug.
const sittingTag = (cycle: number | null | undefined): string => (cycle ? `sitting ${cycle}` : "before the first sitting");

function openCourtWindow(which: Tab): void {
  tab = which;
  const w = $("win-court");
  if (!w.classList.contains("on")) w.classList.add("on");
  renderCourtWindow();
}

/** hud.ts toggleWindow: the window has just opened (or a tab was picked). */
export function renderCourtWindow(): void {
  const w = $("win-court");
  if (!w.classList.contains("on")) return;
  courtModel.openWindow();
  $("court-card").classList.remove("on"); // the window holds what a card would say
  courtModel.lettersOpen = tab === "letters";
  renderBadge();
  w.querySelectorAll<HTMLElement>(".ctabs .lp-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.ctab === tab)));
  const body = w.querySelector(".wbody") as HTMLElement;
  if (tab === "allegiance") renderAllegiance(body);
  else if (tab === "news") renderNews(body, true);
  else renderLetters(body);
}

async function renderAllegiance(body: HTMLElement): Promise<void> {
  body.innerHTML = `<div class="imeta">Reading the rolls…</div>`;
  const r = await api("/courts");
  if (tab !== "allegiance") return;
  if (r.error) { body.innerHTML = `<div class="imeta">${esc(r.error)}</div>`; return; }
  const halls = Object.values<any>(COURTS.halls ?? {}).map((h: any) => `${courtShort(COURTS, h.zone)}: ${h.name}`);
  body.innerHTML = `
    <div class="csworn">${swatch(r.court)}<div><div class="cname">Sworn to ${esc(r.court_name)}</div>
      <div class="imeta">${r.switch_used ? "You have changed courts this sitting; the next change waits for the next." : "You may change courts once this sitting, at another court's swearing desk."}</div></div></div>
    <div class="imeta">The courts sit again in ${esc(fmtCycleEnds(r.cycle_ends_in))} (sitting ${r.cycle}).</div>
    ${r.dormant ? `<div class="cdormant">The courts have adjourned. Every house charges the standing three parts in a hundred until they sit again.</div>` : ""}
    <div class="wsection">The three courts</div>
    <div class="ccourts">${r.courts.map((c: any) => `
      <div class="ccourt${c.key === r.court ? " mine" : ""}">${swatch(c.key)}<span class="cn">${esc(c.name)}</span>
        <span class="lp-num" title="The auction rate a buyer pays at this court's house">${pct(c.tax_bp)}</span>
        <span class="lp-num cheld" title="The wild zones this court controls this sitting">${c.control_count ?? 0} held</span>
        <span class="lp-num ctreas" title="The court's treasury, to the nearest hundred">${Number(c.treasury).toLocaleString()} g</span></div>`).join("")}</div>
    ${heldLine(r.court, r.control || courtModel.control)}
    <div class="wsection">Your record</div>
    <div class="crecwrap"></div>
    <div class="imeta cfoot">The audience halls: ${esc(halls.join("; "))}.</div>`;
  record = r.loyalty || null;
  renderRecord(body.querySelector(".crecwrap") as HTMLElement);
}

// The record: its totals over the whole history, then the newest changes of
// court and the newest offers and purses, each paged back by its own Older.
function renderRecord(wrap: HTMLElement): void {
  const totals = recordTotals(record, nameOf);
  const lines = loyaltyLines(record || [], nameOf);
  wrap.innerHTML = (totals.length ? `<div class="crecord ctotals">${totals.map((l) => `<div>${esc(l)}</div>`).join("")}</div>` : "")
    + `<div class="crecord">${lines.map((l) => `<div>${esc(l)}</div>`).join("") || `<div class="imeta">Nothing entered yet.</div>`}</div>`;
  if (record?.sworn_next != null) wrap.appendChild(olderButton(async () => {
    const r = await api(`/courts/record?sworn_before=${record.sworn_next}`);
    record.sworn = [...(r.sworn || []), ...record.sworn];
    record.sworn_next = r.sworn_next ?? null;
    renderRecord(wrap);
  }));
  wrap.insertAdjacentHTML("beforeend", recordOffers(record));
  if (record?.letters_next != null) wrap.appendChild(olderButton(async () => {
    const r = await api(`/courts/record?letters_before=${record.letters_next}`);
    record.offers = [...(record.offers || []), ...(r.offers || [])];
    record.purses = [...(record.purses || []), ...(r.purses || [])];
    record.letters_next = r.letters_next ?? null;
    renderRecord(wrap);
  }));
}

function olderButton(onClick: () => void): HTMLElement {
  const more = document.createElement("button");
  more.className = "btn sm cmore";
  more.textContent = "Older";
  more.addEventListener("click", () => { more.disabled = true; onClick(); });
  return more;
}

async function renderNews(body: HTMLElement, fresh: boolean): Promise<void> {
  if (fresh) {
    body.innerHTML = `<div class="imeta">Reading the news…</div>`;
    const r = await api("/courts/news");
    if (tab !== "news") return;
    newsItems = r.items || [];
    newsNext = r.next ?? null;
  }
  courtModel.sawNews(newsItems);
  // the window has been opened on the news: everything up to here is seen
  if (courtModel.latestNewsId) send("court_seen", { news_id: courtModel.latestNewsId });
  body.innerHTML = newsItems.length ? "" : `<div class="imeta">No news yet. The courts' proclamations and each sitting's digest are kept here.</div>`;
  for (const item of newsItems) body.appendChild(newsRow(item));
  if (newsNext) body.appendChild(olderButton(async () => {
    const r = await api(`/courts/news?before_id=${newsNext}`);
    newsItems = newsItems.concat(r.items || []);
    newsNext = r.next ?? null;
    renderNews(body, false);
  }));
}

function newsRow(item: NewsItem): HTMLElement {
  const row = document.createElement("div");
  row.className = `cnews ${item.kind}`;
  const lines = item.kind === "digest" ? [item.payload?.header, ...(item.payload?.lines || [])].filter(Boolean) : [item.text];
  row.innerHTML = `<div class="chead"><span class="ckind">${esc(newsLabel(item))}</span>`
    + (item.court ? `<span class="cby">${swatch(item.court)}${esc(courtShort(COURTS, item.court))}</span>` : "")
    + `<span class="cwhen lp-num">${esc(sittingTag(item.cycle))}</span></div>`
    + lines.map((l: string) => `<p>${esc(l)}</p>`).join("");
  return row;
}

// the record's offers and purses, under the courts sworn to: the courts read
// the same record when they weigh an explorer (COURTS.md "The loyalty record")
function recordOffers(record: any): string {
  const lines = offerLines(record, (k) => mid(nameOf(k))); // "An offer from the Court of..."
  if (!lines.length) return "";
  return `<div class="wsection">Offers and purses</div><div class="crecord">${lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
}

// ---------- letters (S6) ----------
// COURTS.md "Letters": a court's purses and defection offers, newest first.
// The court's prose, then the terms on their own line (the server's, from the
// verb's amount), then what can be done: an open offer is accepted on the spot
// from here (it switches you and pays you) or declined; Accept is disabled once
// this sitting's switch is spent.

let letterList: Letter[] = [];

async function renderLetters(body: HTMLElement, fresh = true): Promise<void> {
  if (fresh) {
    body.innerHTML = `<div class="imeta">Breaking the seals…</div>`;
    const r = await api("/courts/letters");
    if (tab !== "letters") return;
    if (r.error) { body.innerHTML = `<div class="imeta">${esc(r.error)}</div>`; return; }
    letterList = r.letters || [];
    lettersNext = r.next ?? null;
    if (courtModel.state && typeof r.switch_used === "boolean") courtModel.state.switch_used = r.switch_used;
    // the tab has shown them: unread becomes read, here and on the server
    if (courtModel.readLetters(letterList)) send("court_seen", { letters: true });
    renderBadge();
  }
  body.innerHTML = "";
  if (!letterList.length) {
    body.innerHTML = `<div class="imeta">No letters. A court's purses and offers come here, sealed and private: nobody else learns of an offer unless it is accepted.</div>`;
    return;
  }
  body.insertAdjacentHTML("beforeend", `<div class="imeta cletnote">Letters are private. An offer, once accepted, swears you to its court on the spot and uses this sitting's one change of court; declined or left to lapse, its gold goes back.</div>`);
  for (const l of letterList) body.appendChild(letterRow(courtModel.letters.get(l.id) ?? l));
  if (lettersNext) body.appendChild(olderButton(async () => {
    const r = await api(`/courts/letters?before_id=${lettersNext}`);
    const older: Letter[] = r.letters || [];
    letterList = letterList.concat(older.filter((l) => !letterList.some((x) => x.id === l.id)));
    lettersNext = r.next ?? null;
    if (courtModel.readLetters(older)) send("court_seen", { letters: true });
    renderBadge();
    renderLetters(body, false);
  }));
}

function letterRow(l: Letter): HTMLElement {
  const row = document.createElement("div");
  row.className = `cletter ${l.kind} ${l.status}`;
  row.dataset.lid = String(l.id);
  row.innerHTML = `<div class="chead"><span class="ckind">${esc(letterLabel(l))}</span>`
    + `<span class="cby">${swatch(l.court)}${esc(courtShort(COURTS, l.court))}</span>`
    + `<span class="cwhen lp-num">sitting ${l.cycle}</span></div>`
    + `<blockquote class="lp-spoken cltext">${esc(l.text)}</blockquote>`
    + `<div class="clterms lp-num">${lpIcon("coin", 13, 2)}<span>${esc(l.terms)}</span></div>`
    + `<div class="clact"></div>`;
  const act = row.querySelector(".clact") as HTMLElement;
  const a = courtModel.letterAction(l);
  // a purse's terms line already says it was paid
  if (l.kind === "purse") { act.remove(); return row; }
  if (a.kind === "status") {
    act.innerHTML = `<span class="imeta">${esc(a.text)}</span>`;
    return row;
  }
  const accept = document.createElement("button");
  accept.className = "btn sm gold";
  accept.textContent = `Accept: swear to ${courtShort(COURTS, l.court)}`;
  accept.disabled = !a.accept;
  if (a.why) accept.title = a.why;
  const decline = document.createElement("button");
  decline.className = "btn sm";
  decline.textContent = "Decline";
  for (const b of [accept, decline]) b.addEventListener("mousedown", (e) => e.preventDefault());
  accept.addEventListener("click", () => { accept.disabled = decline.disabled = true; send("court_letter_accept", { id: l.id }); });
  decline.addEventListener("click", () => { accept.disabled = decline.disabled = true; send("court_letter_decline", { id: l.id }); });
  act.append(accept, decline);
  if (a.why) act.insertAdjacentHTML("beforeend", `<span class="imeta">${esc(a.why)}</span>`);
  return row;
}

// a letter answered or lapsed (or a new one) redraws the tab in place
function refreshLetters(): void {
  if (!$("win-court").classList.contains("on") || tab !== "letters") return;
  renderLetters($("win-court").querySelector(".wbody") as HTMLElement, false);
}

// ---------- notice cards ----------

function showNextCard(): void {
  const card = courtModel.nextCard();
  if (card) drawCard(card);
}

// A sitting pops a card only when it wrote you a letter (Philip, 2026-10-12):
// one letter reads as itself; more read as one line with the count.
function drawCard(card: Card): void {
  const el = $("court-card");
  const icon = el.querySelector(".picon") as HTMLElement;
  icon.innerHTML = lpIcon("court", 20, 1.7);
  const title = el.querySelector(".ctitle") as HTMLElement;
  const text = el.querySelector(".ctext") as HTMLElement;
  if (card.letters.length > 1) {
    icon.style.color = "var(--lp-brass)";
    title.textContent = "Court letters";
    text.innerHTML = `<p>You have ${card.letters.length} court letters.</p>`;
  } else {
    const letter = card.letters[0];
    icon.style.color = courtColor(COURTS, letter.court);
    const purse = letter.kind === "purse";
    title.textContent = `${purse ? "A purse" : "A letter"} from ${courtShort(COURTS, letter.court)}`;
    text.innerHTML = purse
      ? `<p>Sealed, and addressed to you: ${esc(mid(nameOf(letter.court)))} has paid ${letter.amount} gold into your purse.</p>`
      : `<p>Sealed, and addressed to you. ${esc(nameOf(letter.court))} has something to put to you, privately.</p>`;
  }
  $("court-card-yes").textContent = "Open";
  el.classList.add("on");
}

function closeCard(): void {
  $("court-card").classList.remove("on");
  courtModel.closeCard();
  showNextCard();
}

/** world.ts, every frame: cards wait while anything is fighting you. */
export function setCourtCombat(on: boolean): void {
  if (on === courtModel.inCombat) return;
  // a card already up when a fight starts goes back to wait for its end
  if (courtModel.setCombat(on)) $("court-card").classList.remove("on");
  if (!on) showNextCard();
}

// ---------- the hall panels ----------

function openHall(station: string, court: string, title: string, atBoard = false): HTMLElement {
  const w = $("win-courthall");
  (w.querySelector(".wtitle") as HTMLElement).textContent = title;
  w.classList.add("on");
  hall = { station, court, next: null, items: [], atBoard, taken: {} };
  return w.querySelector(".wbody") as HTMLElement;
}

function boardRows(body: HTMLElement, items: any[]): void {
  for (const item of items) {
    const row = document.createElement("div");
    row.className = `cnews board ${item.type}`;
    if (item.type === "bounty") row.dataset.bid = String(item.id);
    row.innerHTML = item.type === "bounty" ? bountyBoardHtml(item)
      : `<div class="chead"><span class="ckind">${esc(boardLabel(item))}</span><span class="cwhen lp-num">${esc(sittingTag(item.cycle))}</span></div><p>${esc(item.text)}</p>`;
    body.appendChild(row);
    if (item.type === "bounty") wireBountyRow(row, item);
  }
}

// ---------- bounties on the board ----------
// A posted bounty: what, where, the pay and the places left, the court's line,
// then what this explorer can do about it (COURTS.md "Bounties"). Only the
// court's own sworn members may take one, at the board itself.

function bountyBoardHtml(b: any): string {
  const left = b.places - b.places_paid;
  return `<div class="chead"><span class="ckind">Bounty</span><span class="cby">${esc(b.zone_name)}</span>`
    + `<span class="cwhen lp-num">until sitting ${b.expires_cycle}</span></div>`
    + `<div class="cbtitle">${esc(bountyLabel(b))}</div>`
    + `<div class="cbterms"><span class="jrw gold lp-num">${lpIcon("coin", 13, 2)}${b.reward_each} each</span>`
    + `<span class="lp-num">${left} of ${b.places} place${b.places === 1 ? "" : "s"} left</span></div>`
    + (b.text ? `<p>${esc(b.text)}</p>` : "")
    + `<div class="cbact"></div>`;
}

function wireBountyRow(row: HTMLElement, b: any): void {
  const act = row.querySelector(".cbact") as HTMLElement;
  const a = boardBountyAction(b, {
    sworn: courtModel.state?.court, held: courtModel.bounties.get(b.id), atBoard: !!hall?.atBoard,
    inventory: state.inventory as any[], heldCount: courtModel.bounties.size,
    cap: COURTS.tuning?.bounty?.active_per_character ?? 5, taken: hall?.taken[String(b.id)],
  });
  if (a.kind === "note") { act.innerHTML = `<span class="imeta">${esc(a.text)}</span>`; return; }
  const btn = document.createElement("button");
  btn.className = "btn sm gold";
  btn.textContent = a.kind === "accept" ? "Take the bounty" : "Deliver";
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    btn.disabled = true;
    send(a.kind === "accept" ? "court_bounty_accept" : "court_bounty_deliver", { id: b.id });
  });
  act.appendChild(btn);
}

// a bounty taken, paid or closed redraws the board's rows in place
function refreshBoardBounties(changed?: Bounty): void {
  if (!hall || hall.station !== "board" || !$("win-courthall").classList.contains("on")) return;
  const body = $("win-courthall").querySelector(".wbody") as HTMLElement;
  body.querySelectorAll<HTMLElement>(".cnews.bounty").forEach((row) => {
    let item = hall!.items.find((i) => i.type === "bounty" && String(i.id) === row.dataset.bid);
    if (!item) return;
    if (changed && changed.id === item.id) {
      Object.assign(item, { places_paid: changed.places_paid, bounty_status: changed.bounty_status });
      if (changed.status) hall!.taken[String(item.id)] = changed.status;
    }
    if (item.bounty_status && item.bounty_status !== "open") { row.remove(); return; }
    row.innerHTML = bountyBoardHtml(item);
    wireBountyRow(row, item);
  });
}

function renderBoard(body: HTMLElement, court: string, page: { items: any[]; next: string | null }, append = false): void {
  if (!append) {
    body.innerHTML = `<div class="chall">${swatch(court)}<span>${esc(nameOf(court))}</span></div>`;
    if (!page.items.length) body.insertAdjacentHTML("beforeend", `<div class="imeta">Nothing is posted. The court's proclamations, notices and bounties go up here when it sits.</div>`);
  }
  body.querySelector(".cmore")?.remove();
  if (hall) {
    hall.items = append ? hall.items.concat(page.items) : [...page.items];
    Object.assign(hall.taken, (page as any).taken || {});
  }
  boardRows(body, page.items);
  if (hall) hall.next = page.next;
  if (page.next) {
    const more = document.createElement("button");
    more.className = "btn sm cmore";
    more.textContent = "Older";
    more.addEventListener("click", async () => {
      if (!hall?.next) return;
      const r = await api(`/courts/board?court=${encodeURIComponent(court)}&before=${encodeURIComponent(hall.next)}`);
      if (!r.error) renderBoard(body, court, r, true);
    });
    body.appendChild(more);
  }
}

/** The board from anywhere (the herald's button): the board is public. */
export async function openBoard(court: string): Promise<void> {
  const body = openHall("board", court, "The Court's Board");
  body.innerHTML = `<div class="imeta">Reading the board…</div>`;
  const r = await api(`/courts/board?court=${encodeURIComponent(court)}`);
  if (r.error) { body.innerHTML = `<div class="imeta">${esc(r.error)}</div>`; return; }
  renderBoard(body, court, r);
}

function renderPanel(msg: any): void {
  const court = msg.court;
  switch (msg.station) {
    case "board":
      // opened at the board itself: its bounties can be taken and delivered here
      renderBoard(openHall("board", court, "The Court's Board", true), court, msg.page);
      break;
    case "swearing": {
      const body = openHall("swearing", court, "The Swearing Desk");
      const own = msg.sworn === court;
      body.innerHTML = `
        <div class="chall">${swatch(court)}<span>${esc(msg.court_name)}</span></div>
        <div class="cline">This desk swears explorers to ${esc(mid(msg.court_name))}. You are sworn to
          <span class="cnamed">${swatch(msg.sworn)}${esc(mid(msg.sworn_name))}</span>.</div>
        <div class="imeta">${msg.switch_used ? "You have already changed courts this sitting." : "You may change courts once each sitting."}
          The courts sit again in ${esc(fmtCycleEnds(msg.cycle_ends_in))}.</div>
        <div class="imeta">Claims you earned stay with the court you earned them for. There is no favour at home and none abroad.</div>
        <div class="btns"></div>`;
      const b = document.createElement("button");
      b.className = "btn gold";
      b.textContent = own ? "Already sworn here" : `Swear to ${courtShort(COURTS, court)}`;
      b.disabled = own || !!msg.switch_used;
      b.addEventListener("click", () => { b.disabled = true; b.textContent = "Swearing…"; send("court_swear", { court }); });
      body.querySelector(".btns")!.appendChild(b);
      break;
    }
    case "registry":
      renderRegistry(openHall("registry", court, "The Registry Desk"), msg);
      break;
    case "book":
      renderBook(openHall("book", court, "The Book of Names"), court, msg);
      break;
  }
}

// ---------- messages ----------

/** world.ts onMessage: every message whose type starts court_. */
export function handleCourtMessage(msg: any): void {
  switch (msg.t) {
    case "court_state":
      courtModel.applyState(msg);
      renderBadge();
      if (!courtModel.inCombat) showNextCard();
      refreshOpen();
      refreshLetters();
      break;
    case "court_cycle":
      if (courtModel.state) Object.assign(courtModel.state, { cycle: msg.cycle, cycle_ends_in: msg.cycle_ends_in, dormant: msg.dormant });
      break;
    case "court_news":
      courtModel.onNews(msg.item, msg.card);
      renderBadge();
      if ($("win-court").classList.contains("on") && tab === "news") {
        newsItems = [msg.item, ...newsItems.filter((i) => i.id !== msg.item.id)];
        renderNews($("win-court").querySelector(".wbody") as HTMLElement, false);
      }
      break;
    case "court_notice":
      hud?.toast(msg.text, "");
      if (msg.kind === "refused" && hall?.station === "swearing") $("win-courthall").classList.remove("on");
      if (msg.kind === "refused") refreshBoardBounties(); // a refused take or delivery frees its button
      if (msg.kind === "refused") refreshLetters(); // and a refused answer to a letter its buttons
      if (msg.kind === "refused" && hall?.station === "registry") { // a refused registration frees the desk's buttons
        $("win-courthall").querySelectorAll<HTMLButtonElement>(".crelic .btn").forEach((x) => { x.disabled = false; });
      }
      break;
    case "court_panel":
      renderPanel(msg);
      break;
    case "court_bounty": {
      const b: Bounty = msg.bounty;
      courtModel.onBounty(b);
      if (selectedBounty === b.id && b.status !== "active") selectedBounty = null;
      hud?.refreshQuests();
      refreshBoardBounties(b);
      break;
    }
    case "court_control":
      courtModel.onControl(msg.control);
      refreshOpen();
      break;
    case "court_relic": {
      const r = msg.relic;
      courtModel.onRelic(r, msg.event);
      if (msg.event === "found") {
        hud?.toast(`You found a named relic: ${r.name}. Register it at your own court's registry before it crumbles, a day from now.`, "");
      } else if (msg.event === "crumbled") {
        hud?.toast(`${r.name} has crumbled to dust. It was never registered.`, "");
      }
      break;
    }
    case "court_swore":
      hud?.toast(`You are sworn to ${msg.court_name}.`, "");
      if (hall?.station === "swearing") $("win-courthall").classList.remove("on");
      break;
    case "court_letter": {
      const l: Letter = msg.letter;
      // a letter that joins the card on screen redraws it ("You have 2 court letters.")
      if (courtModel.onLetter(l, msg.card) && courtModel.showing && $("court-card").classList.contains("on")) drawCard(courtModel.showing);
      const i = letterList.findIndex((x) => x.id === l.id);
      if (i >= 0) letterList[i] = { ...letterList[i], ...l };
      else if (msg.card) letterList.unshift(l);
      renderBadge();
      refreshLetters();
      if (msg.event === "lapsed") hud?.toast(`The offer from ${mid(nameOf(l.court))} has lapsed.`, "");
      if (msg.card && !courtModel.inCombat) showNextCard();
      break;
    }
  }
}

// a window left open while the state changed (a swearing, a boundary) redraws
function refreshOpen(): void {
  if ($("win-court").classList.contains("on") && tab === "allegiance") renderCourtWindow();
  if ($("win-character").classList.contains("on")) {
    const line = document.querySelector("#win-character .ccharline");
    if (line) line.outerHTML = courtCharacterLine();
  }
}

/** world.ts touchable(): a hall station is always something to touch. */
export function isCourtStationId(id: string): boolean {
  return (ZONES[state.zone]?.interactables || []).some((i: any) => i.id === id && i.court_station);
}

// ---------- the character panel and the herald ----------

/** hud.ts renderCharacter: "Sworn to the Court of Caerdun". */
export function courtCharacterLine(): string {
  const s = courtModel.state;
  if (!s?.court) return `<div class="ccharline imeta"></div>`;
  return `<div class="ccharline">${swatch(s.court)}<span>Sworn to ${esc(s.court_name)}</span>`
    + (s.switch_used ? `<span class="imeta"> · switch used this sitting</span>` : "") + `</div>`;
}

/** hud.ts dialog: a herald's own button, the court's board. */
export function courtHeraldButtons(msg: any, button: (cls: string, label: string, onClick: () => void) => unknown, close: () => void): void {
  const court = msg.herald?.court;
  if (court) button("btn primary", "Read the board", () => { close(); openBoard(court); });
}

// ---------- bounties in the journal (S3) ----------
// The Journal's "Court bounties" group: every bounty in hand, under the duties.
// hud.ts renderJournal adds the group to its list and asks for the detail of a
// selected bounty; the clicks are caught here, ahead of the Journal's own
// handler, so a bounty row never reads as a quest id.

/** hud.ts renderJournal: the group for the list pane ("" when none apply). */
export function courtJournalGroup(tab: string, filter: string): string {
  if (tab !== "active" || filter !== "all" || !courtModel.bounties.size) return "";
  const rows = bountyRows(courtModel.bounties.values(), state.inventory as any[]);
  return `<div class="lp-section jgroup">Court bounties</div>` + rows.map(({ b, label, progress }) =>
    `<button type="button" class="jrow cbounty${b.id === selectedBounty ? " sel" : ""}" tabindex="-1" data-bid="${b.id}">`
    + `<i class="jdot" style="background:${courtColor(COURTS, b.court)}"></i><span class="jname">${esc(label)}</span>`
    + `<span class="jprog lp-num">${progress}/${b.count}</span></button>`).join("");
}

/** True when the Journal has something of the courts' to show with no duties. */
export function courtHasBounties(): boolean { return courtModel.bounties.size > 0; }

/** hud.ts renderJournal: the selected bounty's detail, or null for the duty's.
 *  With no duty selected, the first bounty is shown rather than an empty pane. */
export function courtJournalDetail(questSelected: boolean): string | null {
  if (selectedBounty != null && !courtModel.bounties.has(selectedBounty)) selectedBounty = null;
  if (selectedBounty == null && !questSelected) {
    const first = bountyRows(courtModel.bounties.values(), state.inventory as any[])[0];
    if (first) selectedBounty = first.b.id;
  }
  const b = selectedBounty != null ? courtModel.bounties.get(selectedBounty) : undefined;
  if (!b) return null;
  const color = courtColor(COURTS, b.court);
  const prog = bountyProgress(b, state.inventory as any[]);
  const bar = b.count <= 20
    ? `<div class="jsegs" style="grid-template-columns:repeat(${b.count},minmax(0,1fr))">${Array.from({ length: b.count }, (_, i) => `<i${i < prog ? ` style="background:${color}"` : ""}></i>`).join("")}</div>`
    : `<div class="cbbar"><i style="width:${(100 * prog) / b.count}%;background:${color}"></i></div>`;
  const hallName = COURTS.halls?.[b.court]?.name;
  const where = b.kind === "kill"
    ? `Kills in ${esc(b.zone_name)} and its dungeons count, in a party too. Paid the moment you finish, wherever you stand.`
    : `Deliver them at ${esc(mid(nameOf(b.court)))}'s board${hallName ? ` (${esc(hallName)})` : ""}.`;
  const left = b.places - b.places_paid;
  return `<div class="jmeta"><span class="lp-chip" style="background:${color}">BOUNTY</span><span>${esc(b.zone_name)}</span></div>`
    + `<h2 class="jtitle">${esc(bountyLabel(b))}</h2>`
    + `<div class="jgiver">Posted by <span class="jnpc">${esc(nameOf(b.court))}</span></div>`
    + (b.text ? `<blockquote class="lp-spoken jquote">${esc(b.text)}</blockquote>` : "")
    + `<div class="jobj"><div class="jobjhead"><span>${esc(where)}</span><b class="lp-num" style="color:${color}">${prog} / ${b.count}</b></div>${bar}</div>`
    + `<div><div class="lp-section jrwhead">Reward</div><div class="jrws"><span class="jrw gold lp-num">${lpIcon("coin", 13, 2)}${b.reward_each}</span></div>`
    + `<div class="imeta cbnote">Paid to the first ${b.places} to finish: ${left} place${left === 1 ? "" : "s"} left when last seen. `
    + `${esc(bountyExpiry(b, courtModel.state?.cycle))}.</div></div>`
    + `<div class="jfoot"><button type="button" class="btn cbmap" tabindex="-1">Show on map</button></div>`;
}

function initBountyJournal(): void {
  const win = document.getElementById("win-quests");
  if (!win) return;
  // capture: runs before the Journal's own (bubbling) handler on the same window
  win.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>(".cbounty");
    if (row) {
      e.stopPropagation();
      selectedBounty = Number(row.dataset.bid);
      hud?.refreshQuests();
      return;
    }
    if (t.closest(".cbmap")) {
      e.stopPropagation();
      const b = selectedBounty != null ? courtModel.bounties.get(selectedBounty) : undefined;
      if (!b) return;
      const pins = bountyPins(ZONES, COURTS, b);
      if (!$("win-map").classList.contains("on")) hud?.toggleWindow("map");
      showZoneOnMap(pins.find((p) => p.zone === state.zone)?.zone ?? pins[0]?.zone ?? b.zone);
      return;
    }
    // a duty picked: the bounty steps aside
    if (t.closest(".jrow") || t.closest("[data-jtab]")) selectedBounty = null;
  }, true);
}

// ---------- bounty pins on the zone map (S3) ----------

/** map.ts drawZone: a pin at each place a bounty in hand points, in the
 *  posting court's colour (kill: its monster's camps; collect: the hall's board). */
export function drawCourtBountyPins(ctx: CanvasRenderingContext2D, key: string,
                                    px: (x: number, z: number) => [number, number],
                                    label: (text: string, x: number, y: number) => void): void {
  courtModel.bounties.forEach((b) => {
    const color = courtColor(COURTS, b.court);
    for (const p of bountyPins(ZONES, COURTS, b)) {
      if (p.zone !== key) continue;
      const [x, y] = px(p.x, p.z);
      const trim = COURTS.courts?.[b.court]?.banner?.trim ?? "#c9a35c";
      ctx.save();
      ctx.translate(x, y);
      // the courts' mark, not the duties' diamond: a pennant on a staff in a
      // dark seal ringed in the court's trim, so a green court still reads on
      // green ground
      ctx.fillStyle = "rgba(10,12,18,0.88)";
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3, -6); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(6, -3); ctx.lineTo(-3, 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#e8d9b0";
      ctx.font = "bold 9.5px sans-serif";
      label(`Bounty: ${p.label}`, x, y + 21);
    }
  });
}

// ---------- control: banners and member prices (S4) ----------

/** The Allegiance tab: the wild zones the character's court holds, where its
 *  members pay half at the crystal and the vendor and find more. */
function heldLine(court: string, control: Record<string, string>): string {
  // mid-sentence a zone's own article is lower case ("holds the Glassworks")
  const held = Object.entries(control).filter(([, c]) => c === court).map(([z]) => String(ZONES[z]?.name ?? z).replace(/^The /, "the "));
  if (!held.length) return `<div class="imeta cheldline">Your court holds no wild zone this sitting.</div>`;
  return `<div class="cheldline">Your court holds ${esc(held.join(", "))}. There its explorers pay half at the crystal and the merchant, `
    + `find more on the monsters, and sometimes gather one more.</div>`;
}

/** map.ts drawWorld: the controlling court's banner at each held region it shows. */
export function drawCourtWorldBanners(ctx: CanvasRenderingContext2D, regions: { key: string; x: number; y: number }[],
                                      T: (x: number, y: number) => [number, number], seen: (key: string) => boolean): void {
  const names: Record<string, string> = {};
  for (const r of regions) names[r.key] = ZONES[r.key]?.name ?? "";
  drawWorldBanners(ctx, regions, courtModel.control, COURTS, T, seen, names);
}

/** map.ts drawZone: the banner and the court's name in the frame's corner. */
export function drawCourtZoneBanner(ctx: CanvasRenderingContext2D, key: string, boxTop: number): void {
  drawZoneBanner(ctx, key, boxTop, courtModel.control, COURTS);
}

/** hud.ts drawMinimap: a pennant at the ring's top-left in a held zone. */
export function drawCourtMinimapBanner(ctx: CanvasRenderingContext2D, zone: string, size: number): void {
  drawMinimapBanner(ctx, zone, size, courtModel.control, COURTS);
}

/** hud.ts renderVendor: the price the merchant charges this explorer -- half,
 *  struck through from the full, where their court holds the zone. The server
 *  charges the same (Courts::Benefits.vendor_price). */
export function courtVendorPriceHtml(zone: string, price: number): string {
  if (!price || !contested(ZONES, zone) || !courtModel.holds(zone)) return `${price}g`;
  const off = COURTS.tuning?.benefits?.vendor_discount ?? 0.5;
  const name = courtName(COURTS, courtModel.state?.court);
  return `<s class="cfull">${price}</s> <span class="chalf" title="${esc(name)} holds this land: its explorers pay less">${memberPrice(price, off)}g</span>`;
}

// ---------- relics: the registry desk, the book, the bags (S5) ----------
// COURTS.md "Relics": a relic is registered only at the explorer's own court's
// hall. The desk lists the bags' relics with what each fetches now (the full
// price while the sitting's budget lasts, then the reduced rate), the named
// relics with their countdown and reward, and the explorer's cap. The book of
// names lists every named relic delivered to this court, by zone, by page.

const kindName = (k: string) => COURTS.relics?.kinds?.[k]?.name ?? k;

function renderRegistry(body: HTMLElement, msg: any): void {
  const p = msg as RegistryPanel & { court: string; court_name: string; sworn_name: string; wants: string };
  const prices = ["documents", "goods", "surveys"].map((k) =>
    `<span class="cprice${k === p.wants ? " wanted" : ""}" title="${k === p.wants ? "What this court wants most" : ""}">${esc(kindName(k))} <b class="lp-num">${p.prices?.[k] ?? "?"} g</b></span>`).join("");
  const left = Math.max(0, p.budget - p.spent);
  body.innerHTML = `<div class="chall">${swatch(msg.court)}<span>${esc(msg.court_name)}'s registry</span></div>`
    + `<div class="cprices">${prices}</div>`
    + `<div class="imeta">A named relic fetches ${p.named_mult} times its kind's price. `
    + (p.reduced_now
      ? `<span class="creduced">The registry's budget for this sitting is spent:</span> it enters relics at a quarter of the price until the court sits again.`
      : `The budget for this sitting has <span class="lp-num">${left}</span> of <span class="lp-num">${p.budget}</span> gold left at the full price.`) + `</div>`;
  if (!p.own) {
    body.insertAdjacentHTML("beforeend", `<div class="imeta">Only your own court's registry may enter your relics. You are sworn to ${esc(p.sworn_name)}; its desk is in its own hall. Relics sell at the auction too, to an explorer sworn to the court that wants them.</div>`);
    return;
  }
  const room = registryLeft(p);
  body.insertAdjacentHTML("beforeend", `<div class="imeta">You may enter <span class="lp-num">${room}</span> more common relic${room === 1 ? "" : "s"} this sitting (${p.cap} a sitting). Named relics have no limit.</div>`);
  if (p.named?.length) {
    body.insertAdjacentHTML("beforeend", `<div class="wsection">Named relics</div>`);
    for (const r of p.named) {
      const row = relicRow(`<div class="crname named">${esc(r.name)}</div>`
        + `<div class="crmeta">${esc(kindName(r.kind))} · ${esc(r.zone_name)} · <span class="ccrumble">${esc(crumbleLabel(courtModel.crumblesIn(r)))}</span></div>`,
        r.reward, r.reduced);
      row.appendChild(registerButton("Register", { named_relic_id: r.id }));
      body.appendChild(row);
    }
  }
  body.insertAdjacentHTML("beforeend", `<div class="wsection">Relics in your bags</div>`);
  if (!p.relics?.length) {
    body.insertAdjacentHTML("beforeend", `<div class="imeta">You carry none. Relics turn up on the monsters and at the gathering nodes of the wild zones and their dungeons.</div>`);
    return;
  }
  const reducedShare = COURTS.tuning?.relics?.reduced ?? 0.25;
  for (const r of p.relics) {
    const all = registryQuote(p, r.kind, r.qty, reducedShare);
    const row = relicRow(`<div class="crname">${esc(r.name)}${r.qty > 1 ? ` <span class="lp-num">×${r.qty}</span>` : ""}</div>`
      + `<div class="crmeta">${esc(kindName(r.kind))} · ${esc(r.zone_name)}</div>`,
      r.price, r.reduced, " each");
    const one = registerButton("Register 1", { inv_id: r.inv_id, qty: 1 });
    one.disabled = room < 1;
    row.appendChild(one);
    if (r.qty > 1 && all.qty > 1) {
      const b = registerButton(`All ${all.qty}`, { inv_id: r.inv_id, qty: all.qty });
      b.title = `About ${all.total} gold`;
      row.appendChild(b);
    }
    body.appendChild(row);
  }
}

// the price column stays narrow: the gold, and under it the reduced rate's mark
function relicRow(main: string, gold: number, reduced: boolean, each = ""): HTMLElement {
  const row = document.createElement("div");
  row.className = "crelic";
  row.innerHTML = `<div class="crmain">${main}</div><span class="crprice lp-num">${gold} g${each}`
    + (reduced ? `<i class="creduced">reduced</i>` : "") + `</span>`;
  return row;
}

function registerButton(label: string, data: Record<string, number>): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn sm gold";
  b.textContent = label;
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", () => {
    // one registration at a time: the desk answers with a fresh panel (or a refusal)
    $("win-courthall").querySelectorAll<HTMLButtonElement>(".crelic .btn").forEach((x) => { x.disabled = true; });
    send("court_register", data);
  });
  return b;
}

let bookFilter = "";

function renderBook(body: HTMLElement, court: string, page: any): void {
  const zones: { key: string; name: string }[] = page.zones || [];
  body.innerHTML = `<div class="chall">${swatch(court)}<span>The book of names</span></div>`
    + `<div class="imeta">Every explorer who delivered a named relic to ${esc(mid(nameOf(court)))}, with the relic and the date.</div>`
    + `<div class="cbookbar"><select class="hud-field cbookzone" aria-label="Filter by zone"><option value="">Every zone</option>`
    + zones.map((z) => `<option value="${esc(z.key)}"${z.key === (page.zone ?? "") ? " selected" : ""}>${esc(z.name)}</option>`).join("")
    + `</select><span class="lp-num cbookcount">${page.total} entr${page.total === 1 ? "y" : "ies"}</span></div>`;
  if (!page.entries?.length) {
    body.insertAdjacentHTML("beforeend", `<div class="imeta">${page.zone ? "No name is entered from there yet." : "No name is entered yet."}</div>`);
  }
  for (const e of page.entries || []) {
    const row = document.createElement("div");
    row.className = "cbook";
    const when = e.registered_at ? new Date(e.registered_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    row.innerHTML = `<div class="crname named">${esc(e.relic)}</div>`
      + `<div class="crmeta">${esc(kindName(e.kind))} from ${esc(mid(e.zone_name))}, delivered by <span class="cbookname">${esc(e.finder_name)}</span></div>`
      + `<div class="crmeta lp-num">${esc(when)}${e.cycle ? ` · sitting ${e.cycle}` : ""}</div>`;
    body.appendChild(row);
  }
  const go = async (zone: string, n: number) => {
    const r = await api(`/courts/book?court=${encodeURIComponent(court)}&zone=${encodeURIComponent(zone)}&page=${n}`);
    if (!r.error && hall?.station === "book") renderBook(body, court, r);
  };
  const sel = body.querySelector<HTMLSelectElement>(".cbookzone")!;
  sel.addEventListener("change", () => { bookFilter = sel.value; go(bookFilter, 1); });
  // keep keys out of the game while the select has focus
  sel.addEventListener("keydown", (e) => e.stopPropagation());
  if ((page.pages ?? 1) > 1) {
    const nav = document.createElement("div");
    nav.className = "cbooknav";
    const newer = document.createElement("button");
    newer.className = "btn sm";
    newer.textContent = "Newer";
    newer.disabled = page.page <= 1;
    newer.addEventListener("click", () => go(page.zone ?? "", page.page - 1));
    const older = document.createElement("button");
    older.className = "btn sm";
    older.textContent = "Older";
    older.disabled = page.page >= page.pages;
    older.addEventListener("click", () => go(page.zone ?? "", page.page + 1));
    nav.append(newer, Object.assign(document.createElement("span"), { className: "lp-num", textContent: `page ${page.page} of ${page.pages}` }), older);
    body.appendChild(nav);
  }
}

/** hud.ts invRow: a named relic's own name in the bags (null for any other row). */
export function courtRelicName(row: any): string | null {
  return row?.named_relic?.name ?? null;
}

/** hud.ts invRow: the bag row's meta line, short (it shares the row with the
 *  name) -- a named relic's binding and countdown, a common relic's kind and
 *  zone (null for anything else). */
export function courtRelicMeta(row: any): string | null {
  const r = row?.named_relic;
  if (r) return `Bound · ${crumbleLabel(courtModel.crumblesIn(r)).replace("Crumbles in ", "")}`;
  const rel = ITEMS[row?.item_key]?.relic;
  if (!rel) return null;
  return `${rel.kind[0].toUpperCase()}${rel.kind.slice(1)} · ${String(ZONES[rel.zone]?.name ?? rel.zone).replace(/^The /, "")}`;
}

/** hud.ts itemTipHtml: which court wants a common relic, and where it is from. */
export function courtRelicTip(item: any): string {
  const rel = item?.relic;
  if (!rel) return item?.bound ? `<div class="tstat">${esc(item.desc ?? "")}</div>` : "";
  const court = COURTS.relics?.kinds?.[rel.kind]?.wanted_by;
  return `<div class="tstat">${esc(kindName(rel.kind))} from ${esc(mid(ZONES[rel.zone]?.name ?? rel.zone))}</div>`
    + (court ? `<div class="tmeta">${esc(nameOf(court))} pays for these at its registry</div>` : "");
}

/** hud.ts renderAuction: the buyer's total at this house -- the listed price
 *  plus the house's tax, rounded up to whole gold exactly as the server's
 *  Courts.quote does, so the total sent back with the purchase matches. */
export function courtAuctionTotal(tax: any, price: number): number {
  const bp = tax?.rate_bp ?? 0;
  return price + Math.ceil((price * bp) / 10_000);
}

/** hud.ts renderAuction: this house's rate and who it pays, then every
 *  house's rate beside it (COURTS.md "UI": the tax at every broker, compared). */
export function courtAuctionTaxHtml(tax: any): string {
  if (!tax) return "";
  const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
  const payee = (court: string | null) => (court ? `to ${esc(nameOf(court))}` : "to no court");
  const here = tax.rate_bp == null ? "Away from a house: browse only." :
    `Buyers here pay ${pct(tax.rate_bp)} on top of the price, ${payee(tax.court)}. Sellers keep the full price.`;
  const houses = (tax.houses || []).map((h: any) =>
    `<span class="${h.zone === tax.zone ? "chere" : ""}">${esc(h.name)} ${pct(h.rate_bp)}</span>`).join(" · ");
  return `<div class="imeta" style="margin-bottom:2px">${here}</div><div class="imeta cauction-rates" style="margin-bottom:6px">${houses}</div>`;
}
