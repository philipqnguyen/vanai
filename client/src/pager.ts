// The one page control every long list in the HUD uses (auction house, mail,
// friends, player search): prev / "page x of y" / next. Pages are 1-based to
// match what the server returns. A single page still renders the label so the
// row height never jumps as a list grows past one page.

/** Clamp a requested page into 1..pages (pages is at least 1). */
export function clampPage(page: number, pages: number): number {
  const p = Math.max(1, Math.floor(pages) || 1);
  return Math.min(p, Math.max(1, Math.floor(page) || 1));
}

/** The pager row; onGo gets the page to load and never fires outside 1..pages. */
export function pager(page: number, pages: number, onGo: (page: number) => void): HTMLElement {
  const total = Math.max(1, Math.floor(pages) || 1);
  const cur = clampPage(page, total);
  const row = document.createElement("div");
  row.className = "pager";
  const step = (label: string, aria: string, to: number) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn pager-step";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    // tabindex=-1 like every HUD button: Space and Enter belong to the world.
    b.tabIndex = -1;
    b.disabled = to < 1 || to > total || to === cur;
    b.onclick = () => { if (!b.disabled) onGo(to); };
    return b;
  };
  const label = document.createElement("span");
  label.className = "pager-label lp-num";
  label.textContent = `Page ${cur} of ${total}`;
  row.append(step("‹", "Previous page", cur - 1), label, step("›", "Next page", cur + 1));
  return row;
}
