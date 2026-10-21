// The character on the pre-game screens: one /?character-preview iframe
// (character-preview.ts) kept alive across the roster and creation, so moving
// between them never boots a second Babylon engine. It floats over whichever
// slot the current screen offers and follows that slot's box; the iframe is
// dropped, and its WebGL context with it, when the world starts.

import { appearanceChoice, type CharacterAppearance } from "./appearance";

export interface PreviewSelection { race: string; job: string; appearance: CharacterAppearance }

let root: HTMLDivElement | null = null;
let frame: HTMLIFrameElement | null = null;
let slot: HTMLElement | null = null;
let ready = false;
let wanted: PreviewSelection | null = null;
let observer: ResizeObserver | null = null;

const normal = (s: PreviewSelection) => ({ race: s.race, job: s.job, appearance: appearanceChoice(s.race, s.appearance) });

function place(): void {
  if (!root || !slot || !slot.isConnected) return;
  const r = slot.getBoundingClientRect();
  Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

function onMessage(event: MessageEvent): void {
  if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data?.type === "character-preview-ready") { ready = true; send(); }
  if (event.data?.type === "character-preview-rendered" && wanted && JSON.stringify(event.data.selection) === JSON.stringify(normal(wanted))) {
    root!.querySelector<HTMLElement>(".pg-stage-status")!.hidden = true;
    root!.classList.add("ready");
  }
}

function send(): void {
  if (!ready || !wanted || !frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: "character-appearance", ...normal(wanted) }, location.origin);
}

function ensure(): void {
  if (root) return;
  root = document.createElement("div");
  root.id = "pg-stage";
  root.innerHTML = `<iframe id="n-preview" title="Character preview" src="/?character-preview" allowtransparency="true"></iframe>
    <div class="pg-stage-status" id="n-preview-status" role="status">Summoning…</div>
    <div class="pg-drag">Drag to turn · scroll to zoom</div>`;
  frame = root.querySelector("iframe");
  document.getElementById("app")!.appendChild(root);
  addEventListener("message", onMessage);
  addEventListener("resize", place);
}

export const previewStage = {
  /** Lay the preview over `el` and keep it there as the layout changes. */
  attach(el: HTMLElement): void {
    ensure();
    slot = el;
    observer?.disconnect();
    observer = new ResizeObserver(place);
    observer.observe(el);
    root!.classList.add("on");
    place();
    requestAnimationFrame(place);
  },
  detach(): void {
    observer?.disconnect(); observer = null; slot = null;
    root?.classList.remove("on");
  },
  /** Show this character; the status spinner stays until it is dressed. */
  show(selection: PreviewSelection): void {
    ensure();
    if (wanted && JSON.stringify(normal(wanted)) === JSON.stringify(normal(selection))) return;
    wanted = selection;
    root!.querySelector<HTMLElement>(".pg-stage-status")!.hidden = false;
    send();
  },
  dispose(): void {
    this.detach();
    removeEventListener("message", onMessage);
    removeEventListener("resize", place);
    root?.remove();
    root = null; frame = null; ready = false; wanted = null;
  },
};
