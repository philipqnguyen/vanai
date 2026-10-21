import type {CharacterAppearance} from "./appearance";
import { createConsumer, type Consumer, type Subscription } from "@rails/actioncable";

// In development the Rails server runs separately on :3000; in production the
// built client is served by (or alongside) Rails, so same-origin is used.
const DEV = import.meta.env.DEV;
const devOrigin = import.meta.env.VITE_API_ORIGIN || `http://${location.hostname}:3000`;
const API = DEV ? `${devOrigin}/api` : "/api";
const CABLE = DEV
  ? `${devOrigin.replace(/^http/, "ws")}/cable`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/cable`;

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.error) body.error = `Request failed (${res.status})`;
  return body;
}

export const rest = {
  me: () => api("/me"),
  register: (email: string, password: string) =>
    api("/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => api("/logout", { method: "DELETE" }),
  characters: () => api("/characters"),
  createCharacter: (name: string, race: string, job: string, city: string, appearance: CharacterAppearance = {}) =>
    api("/characters", { method: "POST", body: JSON.stringify({ name, race, job, city, appearance }) }),
  selectCharacter: (id: number) => api(`/characters/${id}/select`, { method: "POST" }),
  gameState: () => api("/game/state"),
  sceneSeen: (id: string) => api("/game/scene_seen", { method: "POST", body: JSON.stringify({ id }) }),
  equip: (inventory_item_id: number) =>
    api("/game/equip", { method: "POST", body: JSON.stringify({ inventory_item_id }) }),
  unequip: (slot: string) => api("/game/unequip", { method: "POST", body: JSON.stringify({ slot }) }),
  vendor: (npc_id: string, op: "buy" | "sell", extra: any) =>
    api("/game/vendor", { method: "POST", body: JSON.stringify({ npc_id, op, ...extra }) }),
  auction: () => api("/auction"),
  auctionList: (inventory_item_id: number, qty: number, price: number) =>
    api("/auction/list", { method: "POST", body: JSON.stringify({ inventory_item_id, qty, price }) }),
  auctionBuy: (listing_id: number, expected_total: number) =>
    api("/auction/buy", { method: "POST", body: JSON.stringify({ listing_id, expected_total }) }),
  craft: (recipe_id: string) =>
    api("/craft", { method: "POST", body: JSON.stringify({ recipe_id }) }),
  friends: () => api("/friends"),
  // op "add" / "remove" says which is meant; none (/friend Name) toggles
  friendToggle: (name: string, op?: "add" | "remove") =>
    api("/friends", { method: "POST", body: JSON.stringify({ name, op }) }),
  auctionCancel: (listing_id: number) =>
    api("/auction/cancel", { method: "POST", body: JSON.stringify({ listing_id }) }),
};

let consumer: Consumer | null = null;
let sub: Subscription | null = null;

export function connectZone(onMessage: (msg: any) => void, onReady: () => void): void {
  consumer ||= createConsumer(CABLE);
  disconnectZone();
  sub = consumer.subscriptions.create(
    { channel: "ZoneChannel" },
    {
      connected() { onReady(); },
      received(msg: any) { onMessage(msg); },
    }
  );
}

export function disconnectZone(): void {
  if (sub) {
    sub.unsubscribe();
    sub = null;
  }
}

export function send(action: string, data: any = {}): void {
  sub?.perform(action, data);
}
