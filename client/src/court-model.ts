// The court window's state, Babylon- and DOM-free so the node tests can read
// its rules (court-hud.ts draws it). COURTS.md "The court window and its news":
//
//   - the dock key's badge counts what the window would show that arrived since
//     it was last opened (news) plus unread letters (S6: a letter is read once
//     the Letters tab has shown it);
//   - a sitting pops a notice card only when it wrote you a letter (Philip,
//     2026-10-12): one card for every letter waiting, held while you are in
//     combat and shown when it ends; a letter that arrives while the card is
//     up joins it; closing loses nothing (the badge stays until the window
//     opens). The digest goes to News and the badge, never to a card.

export interface CourtStateMsg {
  court: string; court_name: string; switch_used: boolean; cycle: number;
  cycle_ends_in: number | null; dormant: boolean; tax: Record<string, number>;
  unread?: { news: number; letters: number };
  digest?: NewsItem | null;
  /** zone => the court in control of it (S4), every controlled wild zone */
  control?: Record<string, string>;
}

export interface NewsItem {
  id: number; cycle: number; court: string | null; kind: string; text: string;
  payload?: any; at?: string;
}

/** The one notice card: the letters waiting, oldest first. */
export type Card = { kind: "letters"; letters: Letter[] };

/** A court's letter (S6), as court_letter and GET /api/courts/letters send it.
 *  `terms` is the server's line from the verb's amount, never the prose. */
export interface Letter {
  id: number; court: string; court_name?: string; kind: "purse" | "defection"; text: string; amount: number;
  terms: string; cycle: number; expires_cycle?: number; status: "unread" | "read" | "accepted" | "declined" | "lapsed";
  answered_cycle?: number; at?: string;
}

export class CourtModel {
  state: CourtStateMsg | null = null;
  newsUnread = 0;
  /** unread letters: the server's count (court_state) and the unread letters
   *  this session was handed (court_letter cards) overlap -- the login cards
   *  are the very letters the count counts -- so the badge takes the larger */
  private lettersCounted = 0;
  private unreadLetterIds = new Set<number>();
  get lettersUnread(): number { return Math.max(this.lettersCounted, this.unreadLetterIds.size); }
  latestNewsId = 0;
  inCombat = false;
  windowOpen = false;
  /** the card on screen, if any */
  showing: Card | null = null;
  /** the card waiting for combat to end or the window to close (at most one) */
  queue: Card[] = [];
  private lettersCarded = new Set<number>();
  /** the bounties in hand (S3), by id: court_bounty adds, updates and drops them */
  bounties = new Map<number, Bounty>();
  /** zone => the court in control of it (S4): court_state at login and after a
   *  boundary, court_control when it changes. The maps' banners and the
   *  member prices read it. */
  control: Record<string, string> = {};
  /** the named relics in hand (S5), by id, each with the moment it crumbles
   *  (from the server's countdown at receipt, so a skewed clock cannot move it) */
  relics = new Map<number, Relic & { deadline: number | null }>();

  /** court_relic: found or held puts it in hand; crumbled or registered takes it out. */
  onRelic(r: Relic, event: string, now = Date.now()): void {
    if (event === "crumbled" || event === "registered" || (r.status && r.status !== "held")) { this.relics.delete(r.id); return; }
    this.relics.set(r.id, { ...r, deadline: r.crumbles_in == null ? null : now + r.crumbles_in * 1000 });
  }

  /** Seconds before a named relic crumbles: the live countdown when this
   *  session was told of it, else the countdown the bags were fetched with. */
  crumblesIn(r: Pick<Relic, "id" | "crumbles_in">, now = Date.now()): number | null {
    const held = this.relics.get(r.id);
    if (held?.deadline != null) return Math.max(0, Math.round((held.deadline - now) / 1000));
    return r.crumbles_in ?? null;
  }

  /** court_control: the new snapshot, whole. */
  onControl(control: Record<string, string> | null | undefined): void {
    this.control = { ...(control ?? {}) };
  }

  /** Does the character's own court control `zone`? (Then its members get
   *  the zone's benefits there: the server decides, the client only shows.) */
  holds(zone: string | null | undefined): boolean {
    const court = this.state?.court;
    return !!zone && !!court && this.control[zone] === court;
  }

  /** court_bounty: an active one is in hand (new, or its count moved); paid,
   *  unpaid (filled or expired before you finished) drops it. */
  onBounty(b: Bounty): void {
    if (b.status === "active") this.bounties.set(b.id, b);
    else this.bounties.delete(b.id);
  }

  /** court_state: the server's counts are the truth at login and after a
   *  boundary. (Its digest is News's to show, never a card's.) */
  applyState(msg: CourtStateMsg): void {
    this.state = { ...msg };
    if (msg.control) this.control = { ...msg.control };
    if (msg.unread) {
      this.newsUnread = this.windowOpen ? 0 : msg.unread.news;
      this.lettersCounted = msg.unread.letters;
    }
  }

  /** court_news for this character: counts unless the window is open. A
   *  sitting's digest pops nothing: News and the badge carry it. */
  onNews(item: NewsItem, _card?: string | null): void {
    if (item.id > this.latestNewsId) {
      this.latestNewsId = item.id;
      if (!this.windowOpen) this.newsUnread++;
    }
  }

  /** A new letter joins the one card: the card on screen if there is one
   *  (-> true: redraw it), else the waiting one, else a new waiting card.
   *  Each letter once. */
  offerLetter(letter: any): boolean {
    if (this.lettersCarded.has(letter.id)) return false;
    this.lettersCarded.add(letter.id);
    if (this.showing) { this.showing.letters.push(letter); return true; }
    if (this.queue.length) this.queue[0].letters.push(letter);
    else this.queue.push({ kind: "letters", letters: [letter] });
    return false;
  }

  /** the letters this session knows of, by id (court_letter and the tab's fetch) */
  letters = new Map<number, Letter>();
  /** is the window open on the Letters tab (then a new letter is read at once) */
  lettersOpen = false;

  /** court_letter: a new letter (card: true) counts as unread and gets its
   *  card; a status change (accepted, declined, lapsed) only updates it. A
   *  letter the server already had as read never counts again. -> true when
   *  the card on screen gained it (redraw). */
  onLetter(letter: Letter, card?: boolean): boolean {
    const known = this.letters.has(letter.id);
    this.letters.set(letter.id, { ...this.letters.get(letter.id), ...letter });
    if (letter.status !== "unread") this.unreadLetterIds.delete(letter.id);
    if (!card || known || this.lettersCarded.has(letter.id)) return false;
    if (letter.status === "unread" && !(this.windowOpen && this.lettersOpen)) this.unreadLetterIds.add(letter.id);
    return this.offerLetter(letter);
  }

  /** The Letters tab opened: what it lists is read; -> whether to tell the server. */
  readLetters(list: Letter[]): boolean {
    for (const l of list) this.letters.set(l.id, l);
    const had = this.lettersUnread > 0 || list.some((l) => l.status === "unread");
    this.lettersCounted = 0;
    this.unreadLetterIds.clear();
    // the tab has shown them: the waiting card would only repeat it
    const shown = new Set(list.map((l) => l.id));
    for (const c of this.queue) c.letters = c.letters.filter((l) => !shown.has(l.id));
    this.queue = this.queue.filter((c) => c.letters.length);
    for (const l of list) if (l.status === "unread") this.letters.set(l.id, { ...l, status: "read" });
    return had;
  }

  /** Combat starts or ends. A card already on screen when a fight starts goes
   *  back to the front of the queue (COURTS.md: held during combat, shown
   *  when it ends); -> whether one was taken off the screen. */
  setCombat(on: boolean): boolean {
    this.inCombat = on;
    if (!on || !this.showing) return false;
    // back to wait, ahead of any letters that queued behind it
    const back = this.showing;
    if (this.queue.length) back.letters.push(...this.queue[0].letters);
    this.queue = [back];
    this.showing = null;
    return true;
  }

  /** The card to put on screen now, or null: nothing while in combat, nothing
   *  while the court window is open (a card would sit on its tabs, and the
   *  window already shows what it says), nothing while another card is up.
   *  Marks it showing. */
  nextCard(): Card | null {
    if (this.inCombat || this.windowOpen || this.showing || !this.queue.length) return null;
    const card = this.queue.shift()!;
    this.showing = card;
    return card;
  }

  /** The card closed (by its button or the X): nothing is lost. */
  closeCard(): void { this.showing = null; }

  /** The window opened: the badge clears, and a card on screen goes (the
   *  window holds what it says; closing loses nothing); -> the news id to mark
   *  seen. */
  openWindow(): number {
    this.windowOpen = true;
    this.newsUnread = 0;
    this.showing = null;
    return this.latestNewsId;
  }
  closeWindow(): void { this.windowOpen = false; }

  /** News fetched for the window moves the seen mark to its newest item. */
  sawNews(items: NewsItem[]): void {
    for (const i of items) if (i.id > this.latestNewsId) this.latestNewsId = i.id;
  }

  badge(): number { return this.newsUnread + this.lettersUnread; }

  /** A defection letter can be accepted only while this cycle's switch is unused (S6). */
  canAcceptLetter(): boolean { return !!this.state && !this.state.switch_used; }

  /** What a letter offers this explorer now (the server rules the same way). */
  letterAction(l: Letter): LetterAction {
    return letterAction(l, { switchUsed: !this.canAcceptLetter(), sworn: this.state?.court, cycle: this.state?.cycle });
  }
}

// ---------- letters (S6) ----------

export type LetterAction =
  | { kind: "answer"; accept: boolean; why?: string }
  | { kind: "status"; text: string };

/** An open offer can be accepted (unless this sitting's switch is spent, or it
 *  is from the court the explorer is already sworn to) or declined; anything
 *  else reads as what became of it. */
export function letterAction(l: Pick<Letter, "kind" | "status" | "court" | "cycle" | "expires_cycle" | "answered_cycle">,
                             o: { switchUsed: boolean; sworn: string | null | undefined; cycle?: number }): LetterAction {
  if (l.kind === "purse") return { kind: "status", text: "Paid into your purse on delivery." };
  const at = l.answered_cycle ?? l.cycle;
  if (l.status === "accepted") return { kind: "status", text: `Accepted at sitting ${at}: you went over.` };
  if (l.status === "declined") return { kind: "status", text: `Declined at sitting ${at}. The court has its gold back.` };
  if (l.status === "lapsed") return { kind: "status", text: `Lapsed unanswered when sitting ${at} closed.` };
  if (o.cycle != null && l.expires_cycle != null && l.expires_cycle < o.cycle) return { kind: "status", text: "Lapsed." };
  if (o.sworn === l.court) return { kind: "answer", accept: false, why: "You are already sworn to this court." };
  if (o.switchUsed) return { kind: "answer", accept: false, why: "You have already changed courts this sitting." };
  return { kind: "answer", accept: true };
}

/** "Offer of allegiance" / "Purse": the letter's kind as the tab labels it. */
export function letterLabel(l: Pick<Letter, "kind">): string {
  return l.kind === "purse" ? "Purse" : "Offer of allegiance";
}

/** "3h 12m", "41m", "under a minute" -- how long until the court sits again. */
export function fmtCycleEnds(seconds: number | null | undefined): string {
  if (seconds == null) return "not yet scheduled";
  if (seconds < 60) return "under a minute";
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

const VIA: Record<string, string> = {
  creation: "sworn on arrival", migration: "sworn by the old rolls", hall: "sworn at the hall", letter: "went over by letter",
};

const sittings = (n: number) => (n === 0 ? "under a sitting" : n === 1 ? "1 sitting" : `${n} sittings`);

/** The courts sworn to, as lines for the Allegiance tab: newest first. Takes
 *  the record (Allegiance.loyalty_record) or, as S1 sent it, its rows. */
export function loyaltyLines(record: any, nameOf: (court: string) => string): string[] {
  const rows: any[] = Array.isArray(record) ? record : record?.sworn ?? [];
  return [...rows].reverse().map((r) => {
    const paid = r.amount ? `, paid ${r.amount} gold` : "";
    const left = r.via === "letter" && r.left_after != null ? ` (left again ${sittings(r.left_after)} later)` : "";
    return `${nameOf(r.court)}: ${VIA[r.via] ?? r.via} at sitting ${r.cycle}${paid}; ${sittings(r.cycles)}${left}.`;
  });
}

/** The record's totals, over the whole history (the lists below them hold
 *  only the newest entries): the sittings spent with each court, then the
 *  offers by what became of them and the purses. */
export function recordTotals(record: any, nameOf: (court: string) => string): string[] {
  const out: string[] = [];
  const cin = Object.entries<number>(record?.cycles_in ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (cin.length) out.push(`Sittings sworn: ${cin.map(([k, n]) => `${sittings(n)} with ${nameOf(k)}`).join(", ")}.`);
  const t = record?.totals;
  if (!t) return out;
  const o = t.offers ?? {};
  const parts = (["accepted", "declined", "lapsed", "open"] as const).filter((k) => o[k])
    .map((k) => `${o[k]} ${({ accepted: "taken", declined: "declined", lapsed: "left to lapse", open: "still open" } as const)[k]}`);
  if (parts.length) out.push(`Offers: ${parts.join(", ")}.`);
  if (t.purses) out.push(`Purses: ${t.purses}, ${t.purse_gold} gold in all.`);
  return out;
}

const OFFER: Record<string, string> = { open: "still open", accepted: "taken", declined: "declined", lapsed: "left to lapse" };

/** The record's offers and purses, newest first (S6): every defection offer
 *  taken, declined or left to lapse, and the purses received. */
export function offerLines(record: any, nameOf: (court: string) => string): string[] {
  const offers: any[] = record?.offers ?? [];
  const purses: any[] = record?.purses ?? [];
  const lines = offers.map((o) => ({
    cycle: o.cycle,
    text: `An offer from ${nameOf(o.court)} at sitting ${o.cycle}${o.amount ? `, ${o.amount} gold` : ""}: ${OFFER[o.status] ?? o.status}.`,
  })).concat(purses.map((p) => ({ cycle: p.cycle, text: `A purse from ${nameOf(p.court)} at sitting ${p.cycle}: ${p.amount} gold.` })));
  return lines.sort((a, b) => b.cycle - a.cycle).map((l) => l.text);
}

/** The one-line summary of the board item for a list row. */
export function boardLabel(item: any): string {
  if (item.type === "proclamation") return "Proclamation";
  if (item.type === "bounty") return "Bounty";
  return ({ budget_spent: "Registry", bounty_filled: "Bounty filled" } as Record<string, string>)[item.kind] ?? "Notice";
}

/** News kinds as the window labels them. */
export function newsLabel(item: NewsItem): string {
  return ({
    digest: "The sitting", proclamation: "Proclamation", adjourned: "The courts", resumed: "The courts",
    defection: "Defection", bounty_filled: "Bounty filled",
  } as Record<string, string>)[item.kind] ?? "Notice";
}

// ---------- bounties (S3) ----------
// A bounty in hand, as court_bounty and GET /api/courts/bounties send it.
// `progress` is the server's count for a kill bounty; a collect bounty is read
// from the bags, as the delivery will be.
export interface Bounty {
  id: number; court: string; kind: "kill" | "collect"; zone: string; zone_name: string;
  target: string; target_name: string; count: number; places: number; places_paid: number;
  reward_each: number; cycle: number; expires_cycle: number; bounty_status: string;
  text?: string | null; status?: string; progress?: number;
}

/** "Hunt Wold Pup ×12", "Deliver Mere Reed ×5": the journal row's name. */
export function bountyLabel(b: Pick<Bounty, "kind" | "target_name" | "count">): string {
  return `${b.kind === "kill" ? "Hunt" : "Deliver"} ${b.target_name} ×${b.count}`;
}

/** How far along: kills from the server, a collect bounty from the bags. */
export function bountyProgress(b: Bounty, inventory: { item_key: string; qty: number; equipped_slot?: string | null }[]): number {
  if (b.kind === "collect") {
    const have = inventory.filter((r) => r.item_key === b.target && !r.equipped_slot).reduce((n, r) => n + r.qty, 0);
    return Math.min(have, b.count);
  }
  return Math.min(b.progress ?? 0, b.count);
}

/** The journal's court group: every bounty in hand, the ones ready to hand in
 *  first, then by the sitting they run out. */
export function bountyRows(bounties: Iterable<Bounty>, inventory: any[]): { b: Bounty; label: string; progress: number; met: boolean }[] {
  return [...bounties]
    .map((b) => { const progress = bountyProgress(b, inventory); return { b, label: bountyLabel(b), progress, met: progress >= b.count }; })
    .sort((x, y) => Number(y.met) - Number(x.met) || x.b.expires_cycle - y.b.expires_cycle || x.b.id - y.b.id);
}

/** "Runs out when the court sits again" / "after sitting 7". */
export function bountyExpiry(b: Pick<Bounty, "expires_cycle">, cycle: number | undefined): string {
  if (cycle == null || b.expires_cycle > cycle + 1) return `Runs until sitting ${b.expires_cycle} closes`;
  return b.expires_cycle <= cycle ? "Runs out when the courts next sit" : "Runs out at the end of the next sitting";
}

/** What a bounty on the board offers this explorer: take it, deliver it, or why not. */
export type BoardAction =
  | { kind: "accept" } | { kind: "deliver" } | { kind: "note"; text: string };

export function boardBountyAction(item: Bounty, opts: {
  sworn: string | null | undefined; held: Bounty | undefined; atBoard: boolean; inventory: any[]; heldCount: number; cap: number;
  /** this explorer's standing on it from the server (active, paid, unpaid), if ever taken */
  taken?: string;
}): BoardAction {
  // a bounty once taken is never offered again, finished or not
  if (!opts.held && opts.taken === "paid") return { kind: "note", text: "Done: the court has paid you for this one." };
  if (!opts.held && opts.taken) return { kind: "note", text: "Closed to you: it was taken." };
  if (opts.held) {
    // "In hand" next to a kill count read like items carried: say what it counts
    if (item.kind === "kill") return { kind: "note", text: `Taken: ${bountyProgress(opts.held, opts.inventory)} of ${item.count} slain.` };
    if (bountyProgress(opts.held, opts.inventory) < item.count)
      return { kind: "note", text: `Taken: you carry ${bountyProgress(opts.held, opts.inventory)} of ${item.count}.` };
    return opts.atBoard ? { kind: "deliver" } : { kind: "note", text: "Ready: deliver it at this board." };
  }
  if (opts.sworn !== item.court) return { kind: "note", text: "Only the court's own explorers may take it." };
  if (opts.heldCount >= opts.cap) return { kind: "note", text: `You already hold ${opts.cap} bounties.` };
  return opts.atBoard ? { kind: "accept" } : { kind: "note", text: "Take it at the board in the court's hall." };
}

// ---------- control and the member benefits (S4) ----------

/** A member's price at the controlling court's discount, the odd half gold
 *  rounded up -- the server's Courts::Benefits rule, for what the client shows. */
export function memberPrice(price: number, discount = 0.5): number {
  return Math.ceil(Math.round(price * (1 - discount) * 1e6) / 1e6);
}

/** How many zones each court holds, for the Allegiance tab. */
export function controlCounts(control: Record<string, string>, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const c of Object.values(control)) if (c in out) out[c]++;
  return out;
}

// ---------- relics (S5) ----------
// A named relic as court_relic, the bags (inv_payload) and the registry send it.
export interface Relic {
  id: number; name: string; kind: string; kind_name?: string; zone: string; zone_name: string;
  found_at?: string; crumbles_in: number | null; status?: string;
}

/** "Crumbles in 23h 10m", "Crumbles within the hour", "Crumbling": a named
 *  relic's countdown, coarse on purpose (it is a day long). */
export function crumbleLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  if (seconds <= 0) return "Crumbling";
  if (seconds < 3600) return `Crumbles in ${Math.max(1, Math.floor(seconds / 60))}m`;
  return `Crumbles in ${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** The registry panel as the server sends it (Courts::Relics.registry_panel). */
export interface RegistryPanel {
  own: boolean; prices: Record<string, number>; budget: number; spent: number; reduced_now: boolean;
  cap: number; registered: number; named_mult: number;
  relics: { inv_id: number; item_key: string; name: string; qty: number; kind: string; zone: string; zone_name: string; price: number; reduced: boolean }[];
  named: (Relic & { reward: number; reduced: boolean })[];
}

/** Common relics this explorer may still enter this sitting. */
export function registryLeft(p: Pick<RegistryPanel, "cap" | "registered">): number {
  return Math.max(0, p.cap - p.registered);
}

/** What entering `qty` of a common relic of `kind` pays now, the server's rule
 *  (Courts::Relics.unit_price): the full price while the sitting's budget has
 *  room for it, then `reduced` of it (at least 1 gold). Capped by what the
 *  explorer may still enter. The treasury may pay less if it runs dry. */
export function registryQuote(p: Pick<RegistryPanel, "prices" | "budget" | "spent" | "cap" | "registered">, kind: string, qty: number,
                              reduced = 0.25): { qty: number; total: number; reducedQty: number } {
  const n = Math.min(Math.max(0, Math.floor(qty)), registryLeft(p));
  const full = p.prices[kind] ?? 0;
  let owed = 0, reducedQty = 0;
  for (let i = 0; i < n; i++) {
    if (p.spent + owed + full <= p.budget) owed += full;
    else { owed += Math.max(1, Math.ceil(full * reduced)); reducedQty++; }
  }
  return { qty: n, total: owed, reducedQty };
}
