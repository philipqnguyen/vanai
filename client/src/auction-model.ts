// The auction house window's rules, Babylon-free so the node tests read them
// (auction-hud.ts draws them): the category tree, which mirrors the server's
// Vanai::Market (server/lib/vanai/market.rb) shelf for shelf; the browse
// query; time left on a listing; what of your bags can be sold; the Sell
// tab's suggested price.

export interface CategoryNode { key: string; label: string; subs: { key: string; label: string }[] }

/** The sidebar, top to bottom. Keys are the server's `cat`/`sub` params. */
export const CATEGORIES: CategoryNode[] = [
  { key: "all", label: "All", subs: [] },
  {
    key: "weapons", label: "Weapons", subs: [
      { key: "sword", label: "Swords" }, { key: "katana", label: "Katana" }, { key: "greatsword", label: "Greatswords" },
      { key: "staff", label: "Staves" }, { key: "cudgel", label: "Cudgels" }, { key: "handwraps", label: "Handwraps" },
    ],
  },
  {
    key: "armour", label: "Armour", subs: [
      { key: "head", label: "Head" }, { key: "body", label: "Body" }, { key: "legs", label: "Legs" }, { key: "feet", label: "Feet" },
    ],
  },
  { key: "accessories", label: "Accessories", subs: [{ key: "ring", label: "Rings" }] },
  { key: "consumables", label: "Consumables", subs: [] },
  { key: "materials", label: "Materials", subs: [] },
];

export const SORTS: { key: string; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "ending", label: "Ending soon" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "lvl_asc", label: "Level: low to high" },
  { key: "lvl_desc", label: "Level: high to low" },
  { key: "name", label: "Name" },
];

export const RARITIES = ["common", "uncommon", "rare"] as const;

/** Rows a page; the server's default too. */
export const PER_PAGE = 20;

/** [cat, sub] for an item definition, null for what never sells (a relic). */
export function categoryOf(item: any): [string, string | null] | null {
  if (!item) return null;
  switch (item.slot) {
    case "weapon": return ["weapons", item.wtype ?? null];
    case "head": case "body": case "legs": case "feet": return ["armour", item.slot];
    case "ring": return ["accessories", "ring"];
    case "consumable": return ["consumables", null];
    case "material": return ["materials", null];
    default: return null;
  }
}

export interface Browse {
  cat: string; sub: string | null; q: string; lvlMin: string; lvlMax: string; rarity: string; sort: string; page: number;
}

export function freshBrowse(): Browse {
  return { cat: "all", sub: null, q: "", lvlMin: "", lvlMax: "", rarity: "", sort: "newest", page: 1 };
}

/** The GET /api/auction query for a browse; empty filters are left out. */
export function browseQuery(b: Browse, per = PER_PAGE): string {
  const p = new URLSearchParams();
  if (b.cat && b.cat !== "all") p.set("cat", b.cat);
  if (b.sub) p.set("sub", b.sub);
  const q = b.q.trim();
  if (q) p.set("q", q.slice(0, 40));
  const lo = parseInt(b.lvlMin, 10), hi = parseInt(b.lvlMax, 10);
  if (lo > 0) p.set("lvl_min", String(lo));
  if (hi > 0) p.set("lvl_max", String(hi));
  if (b.rarity) p.set("rarity", b.rarity);
  if (b.sort && b.sort !== "newest") p.set("sort", b.sort);
  if (b.page > 1) p.set("page", String(b.page));
  if (per !== PER_PAGE) p.set("per", String(per));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Picking a shelf starts its first page; picking the one you are on is a no-op. */
export function pickCategory(b: Browse, cat: string, sub: string | null): Browse {
  if (b.cat === cat && b.sub === sub) return b;
  return { ...b, cat, sub, page: 1 };
}

/** "4d 3h", "5h 20m", "12m", "closing": a listing's time left, coarse on
 *  purpose (the sweep runs a minute at a time). */
export function timeLeft(expiresAt: string, nowMs: number): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!(ms > 60_000)) return "closing";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/** Under a day left: the row says so in the low colour. */
export function endingSoon(expiresAt: string, nowMs: number): boolean {
  return Date.parse(expiresAt) - nowMs < 86_400_000;
}

/** Bags rows that may go up: carried (not worn), not a bound named relic, an
 *  item the catalogue has a shelf for. */
export function sellableRows(inventory: any[], items: Record<string, any>): any[] {
  return inventory.filter((r) => {
    const it = items[r.item_key];
    return !r.equipped_slot && !r.named_relic && !it?.bound && categoryOf(it) !== null;
  });
}

/** Unit price for a stack's total, for "each" labels: whole gold, rounded up
 *  like the server's lowest_each. */
export function each(total: number, qty: number): number {
  return qty > 0 ? Math.ceil(total / qty) : total;
}

/** The Sell tab's starting price for qty pieces: a gold under the cheapest
 *  live listing each, else the merchants' price, else four times what a
 *  merchant pays for it, else 1. */
export function suggestPrice(check: { lowest_each?: number | null; merchant?: number | null; merchant_sell?: number | null } | null,
                             qty: number): number {
  const n = Math.max(1, qty);
  const lowest = check?.lowest_each;
  if (lowest && lowest > 0) return Math.max(1, (lowest > 1 ? lowest - 1 : 1) * n);
  if (check?.merchant && check.merchant > 0) return check.merchant * n;
  if (check?.merchant_sell && check.merchant_sell > 0) return check.merchant_sell * 4 * n;
  return n;
}

/** The rarity's CSS class for a name (hud.ts rarityCls: common has none). */
export function rarityClass(rarity: string | undefined): string {
  return rarity === "rare" || rarity === "uncommon" ? rarity : "";
}

/** "Lv 12", or nothing for an item with no level. */
export function lvlLabel(lvl: number | undefined): string {
  return lvl && lvl > 0 ? String(lvl) : "—";
}
