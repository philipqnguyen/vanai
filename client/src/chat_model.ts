// The chat composer's rules, kept free of the DOM so they can be tested: which
// channel a half-typed line is headed for (the pill beside the input), how an
// unprefixed line is routed by the sticky channel, and which log rows each tab
// shows.

export type Ch = "say" | "party" | "company" | "tell" | "command";
/** The channels the pill cycles through; a tell or a command is never sticky. */
export type Sticky = "say" | "party" | "company";

export interface Pill { ch: Ch; label: string }

const LABEL: Record<Ch, string> = {
  say: "Say", party: "Party", company: "Company", tell: "Tell", command: "Command",
};

export const STICKY_ORDER: readonly Sticky[] = ["say", "party", "company"];

/** Click the pill: say → party → company → say. */
export function nextSticky(s: Sticky): Sticky {
  return STICKY_ORDER[(STICKY_ORDER.indexOf(s) + 1) % STICKY_ORDER.length];
}

export function isSticky(s: unknown): s is Sticky {
  return typeof s === "string" && (STICKY_ORDER as readonly string[]).includes(s);
}

export const PLACEHOLDER: Record<Sticky, string> = {
  say: "Say something…",
  party: "Speak to your party…",
  company: "Speak to your company…",
};

/** Where the line in the composer will go. A prefix wins over the sticky
 *  channel; any other slash line is a command (so "/r", which is /rest here,
 *  reads as a command rather than a reply). */
export function pillFor(text: string, sticky: Sticky, lastTell = ""): Pill {
  const t = text.trimStart();
  const tellTo = (rest: string): Pill => {
    const name = rest.trim().split(/\s+/)[0] || lastTell;
    return { ch: "tell", label: name ? `Tell · ${name}` : LABEL.tell };
  };
  if (t.startsWith(">>")) return tellTo(t.slice(2));
  if (t.startsWith("/tell ")) return tellTo(t.slice(6));
  if (t.startsWith("/p ")) return { ch: "party", label: LABEL.party };
  if (t.startsWith("/c ") || t.startsWith("/company ")) return { ch: "company", label: LABEL.company };
  if (t.startsWith("/say ")) return { ch: "say", label: LABEL.say };
  if (t.startsWith("/")) return { ch: "command", label: LABEL.command };
  return { ch: sticky, label: LABEL[sticky] };
}

/** An unprefixed line takes the sticky channel's prefix, so the composer's
 *  existing prefix routing (and the server's /c) sends it on unchanged. */
export function routeOutgoing(text: string, sticky: Sticky): string {
  if (text.startsWith("/") || text.startsWith(">>")) return text;
  if (sticky === "party") return `/p ${text}`;
  if (sticky === "company") return `/c ${text}`;
  return text;
}

export type Tab = "all" | "party" | "company" | "tells" | "combat";

/** The row classes each tab keeps; null keeps everything. The CSS filter in
 *  style.css spells out the same groups. */
export const TAB_GROUPS: Record<Tab, readonly string[] | null> = {
  all: null,
  party: ["party"],
  company: ["company"],
  tells: ["tell"],
  combat: ["combatline", "xp", "loot"],
};

export function isTab(s: unknown): s is Tab {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(TAB_GROUPS, s);
}

/** Whether a log row with this class shows under the tab. */
export function rowVisible(tab: Tab, cls: string): boolean {
  const g = TAB_GROUPS[tab];
  return !g || g.includes(cls);
}

/** The chat's resizable bounds. The width keeps the chat's right edge clear of
 *  the centred hotbar (style.css #chat: 50vw - 307 at most, 300 at least); the
 *  log may grow until the party frame above it keeps 120px of room (#party-frame
 *  starts at 204, and the chat's tabs, composer and margins take 78 + 20 + 12),
 *  and never shrinks below a few lines. */
export const CHAT_MIN_W = 300;
export const CHAT_MIN_LOG_H = 80;
export function chatBounds(viewW: number, viewH: number): { maxW: number; maxLogH: number } {
  return {
    maxW: Math.max(CHAT_MIN_W, Math.floor(viewW / 2 - 307)),
    maxLogH: Math.max(CHAT_MIN_LOG_H, Math.floor(viewH - 434)),
  };
}

/** A dragged size held inside chatBounds. */
export function clampChatSize(w: number, logH: number, viewW: number, viewH: number): { w: number; logH: number } {
  const { maxW, maxLogH } = chatBounds(viewW, viewH);
  return {
    w: Math.min(Math.max(Math.round(w), CHAT_MIN_W), maxW),
    logH: Math.min(Math.max(Math.round(logH), CHAT_MIN_LOG_H), maxLogH),
  };
}
