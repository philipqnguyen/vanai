// Draggable HUD windows. Every `.window` moves by its header, the NPC dialogue
// by its name strip; where each was left is remembered per browser, and a
// double-click on the header puts it back where the stylesheet places it.
//
// The stylesheet anchors windows by right/top (and the dialogue by bottom with a
// translateX(-50%)), so a drag converts the window to plain left/top on first
// movement and leaves the CSS default untouched until then — a window nobody
// has moved still follows the stylesheet, including its narrow-screen cascade.

const STORE = "vanai_window_pos";
// a press that wanders less than this is a click, not a drag
const DRAG_SLOP = 3;
// windows sit at z 20 (dialogue 25); the one last touched rises just above its
// own layer and no further, so it never covers toasts (24), prompts, the death
// veil or menus
const FRONT_Z = "23";

export interface Rect { left: number; top: number; width: number; height: number }

/** Keep a window reachable: wholly on screen when it fits, and never with its
 *  header above the top edge or below the bottom one. Pure, so it can be tested. */
export function clampWindow(
  left: number, top: number, width: number, height: number,
  viewW: number, viewH: number, headerH: number,
): { left: number; top: number } {
  // floor the limits so a fractional height can never round a pixel past the edge
  const maxLeft = Math.max(0, Math.floor(viewW - width));
  // a window taller than the screen may hang off the bottom, but its header stays up
  const maxTop = Math.max(0, Math.floor(Math.min(viewH - height, viewH - headerH)));
  return {
    left: Math.min(Math.max(Math.round(left), 0), maxLeft),
    top: Math.min(Math.max(Math.round(top), 0), maxTop),
  };
}

type Saved = Record<string, { left: number; top: number }>;

function load(): Saved {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}") as Saved; } catch { return {}; }
}
function save(all: Saved): void {
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* private window: positions just won't stick */ }
}

let front: HTMLElement | null = null;
function bringToFront(win: HTMLElement): void {
  if (front === win) return;
  if (front) front.style.zIndex = "";
  // the dialogue already sits above every window; lifting it would only lower it
  if (win.id !== "dialog-panel") win.style.zIndex = FRONT_Z;
  front = win;
}

function place(win: HTMLElement, left: number, top: number): void {
  win.style.left = `${left}px`;
  win.style.top = `${top}px`;
  win.style.right = "auto";
  win.style.bottom = "auto";
  win.style.transform = "none";
}

function reset(win: HTMLElement): void {
  for (const p of ["left", "top", "right", "bottom", "transform"] as const) win.style[p] = "";
}

/** Re-fit a moved window to the current viewport (after a resize, or on opening
 *  one whose saved spot came from a bigger screen). Unmoved windows are left alone. */
function refit(win: HTMLElement, handle: HTMLElement): void {
  // a closed window is display:none and measures 0×0; it is re-fitted on opening
  if (!win.style.left || !win.classList.contains("on")) return;
  const r = win.getBoundingClientRect();
  const c = clampWindow(r.left, r.top, r.width, r.height, innerWidth, innerHeight, handle.offsetHeight || 40);
  if (c.left !== Math.round(r.left) || c.top !== Math.round(r.top)) place(win, c.left, c.top);
}

function makeDraggable(win: HTMLElement, handle: HTMLElement, saved: Saved): void {
  const key = win.id;
  const pos = saved[key];
  if (pos) place(win, pos.left, pos.top);
  // the drag in progress, if any; a release the handle never hears (capture
  // lost, button let go off the page) must not leave it following the cursor
  let finish: ((ev: PointerEvent) => void) | null = null;

  handle.classList.add("drag-handle");
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // the close button and anything typed into stay ordinary controls
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    finish?.(e);
    const r = win.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const sx = e.clientX, sy = e.clientY;
    let moving = false;
    handle.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) { end(ev); return; }
      if (!moving) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_SLOP) return;
        moving = true;
        win.classList.add("dragging");
      }
      const c = clampWindow(ev.clientX - dx, ev.clientY - dy, r.width, r.height, innerWidth, innerHeight, handle.offsetHeight);
      place(win, c.left, c.top);
    };
    const end = (ev: PointerEvent) => {
      if (finish !== end) return;
      finish = null;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      handle.removeEventListener("lostpointercapture", end);
      if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      if (!moving) return;
      win.classList.remove("dragging");
      const all = load();
      all[key] = { left: parseInt(win.style.left, 10), top: parseInt(win.style.top, 10) };
      save(all);
    };
    finish = end;
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
  });

  handle.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    reset(win);
    const all = load();
    delete all[key];
    save(all);
  });

  // a press anywhere in the window lifts it over the others
  win.addEventListener("pointerdown", () => bringToFront(win), true);
  // and so does opening it, from whichever code path adds `.on`
  new MutationObserver(() => {
    if (!win.classList.contains("on")) return;
    bringToFront(win);
    requestAnimationFrame(() => refit(win, handle));
  }).observe(win, { attributes: true, attributeFilter: ["class"] });
}

/** Wire every HUD window and the NPC dialogue. Call once, after the HUD markup exists. */
export function initWindowDrag(root: ParentNode = document): void {
  const saved = load();
  const pairs: [HTMLElement, HTMLElement][] = [];
  root.querySelectorAll<HTMLElement>(".window").forEach((win) => {
    const head = win.querySelector<HTMLElement>(".whead");
    if (head && win.id) pairs.push([win, head]);
  });
  const dialog = root.querySelector<HTMLElement>("#dialog-panel");
  const dhead = dialog?.querySelector<HTMLElement>(".dhead");
  if (dialog && dhead) pairs.push([dialog, dhead]);

  for (const [win, head] of pairs) makeDraggable(win, head, saved);
  addEventListener("resize", () => { for (const [win, head] of pairs) refit(win, head); });
}
