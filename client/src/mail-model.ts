// The mail window's rules, Babylon-free so the node tests read them
// (mail-hud.ts draws them; server/lib/vanai/mail.rb is the authority): a
// letter's age, the reply's prefill, a draft's enclosures and postage, and
// what the client refuses before the post office does.

export interface MailLimits { stacks: number; gold: number; postage: number; subject: number; body: number }

/** The server's numbers (Vanai::Mail), used until the first inbox reply says otherwise. */
export const DEFAULT_LIMITS: MailLimits = { stacks: 4, gold: 999_999, postage: 10, subject: 60, body: 1000 };

export interface Enclosure { inventory_item_id: number; item_key: string; qty: number }
export interface Draft { to: string; subject: string; body: string; gold: number; items: Enclosure[] }

export function emptyDraft(): Draft {
  return { to: "", subject: "", body: "", gold: 0, items: [] };
}

/** "just now", "12m", "5h", "3d", then the date: how old a letter is. */
export function ageLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.floor((nowMs - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(t).toISOString().slice(0, 10);
}

/** A reply goes to the sender under "Re: subject" -- once, however long the thread. */
export function replyDraft(letter: { from: string; subject: string }, limits: MailLimits = DEFAULT_LIMITS): Draft {
  const base = letter.subject.replace(/^(re:\s*)+/i, "");
  return { ...emptyDraft(), to: letter.from, subject: `Re: ${base}`.slice(0, limits.subject) };
}

/** Gold, items or both: a parcel, which pays postage. */
export function isParcel(d: Draft): boolean {
  return d.gold > 0 || d.items.length > 0;
}

export function postageFor(d: Draft, limits: MailLimits = DEFAULT_LIMITS): number {
  return isParcel(d) ? limits.postage : 0;
}

/** What sending costs the purse: the gold enclosed plus postage. */
export function draftCost(d: Draft, limits: MailLimits = DEFAULT_LIMITS): number {
  return Math.max(0, d.gold) + postageFor(d, limits);
}

/** Add qty of a bags row to the draft: the same row adds up (to what the row
 *  holds); a new row needs a free place. -> the new enclosures, or an error. */
export function enclose(items: Enclosure[], row: { id: number; item_key: string; qty: number }, qty: number,
                        limits: MailLimits = DEFAULT_LIMITS): Enclosure[] | string {
  const n = Math.floor(qty);
  if (!(n >= 1)) return "Enclose at least one.";
  const had = items.find((e) => e.inventory_item_id === row.id);
  if (had) {
    if (had.qty + n > row.qty) return "You don't have that many.";
    return items.map((e) => (e === had ? { ...e, qty: e.qty + n } : e));
  }
  if (n > row.qty) return "You don't have that many.";
  if (items.length >= limits.stacks) return `A parcel holds at most ${limits.stacks} items.`;
  return [...items, { inventory_item_id: row.id, item_key: row.item_key, qty: n }];
}

/** The client's own refusals, in the server's words, before a round trip. */
export function draftProblem(d: Draft, purse: number, myName: string, limits: MailLimits = DEFAULT_LIMITS): string | null {
  const to = d.to.trim();
  if (!to) return "Who is it for?";
  if (to.toLowerCase() === myName.toLowerCase()) return "You cannot write to yourself.";
  if (!d.subject.trim()) return "Give the letter a subject.";
  if (d.subject.length > limits.subject) return `Keep the subject under ${limits.subject} characters.`;
  if (d.body.length > limits.body) return `Keep the letter under ${limits.body} characters.`;
  if (!Number.isInteger(d.gold) || d.gold < 0 || d.gold > limits.gold) return `Enclose between 0 and ${limits.gold} gold.`;
  if (d.items.length > limits.stacks) return `A parcel holds at most ${limits.stacks} items.`;
  const cost = draftCost(d, limits);
  if (cost > purse) return postageFor(d, limits) ? `Not enough gold (${cost}g with ${limits.postage}g postage).` : "Not enough gold.";
  return null;
}

/** The dock badge's text: blank at none, "99+" past 99. */
export function badgeText(unread: number): string {
  if (!(unread > 0)) return "";
  return unread > 99 ? "99+" : String(unread);
}

/** What a letter still holds for you: "parcel" (uncollected), "taken" (collected), or "" (just words). */
export function enclosureState(l: { parcel: boolean; collected: boolean }): "parcel" | "taken" | "" {
  if (!l.parcel) return "";
  return l.collected ? "taken" : "parcel";
}
