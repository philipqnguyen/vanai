// The game takes the whole screen (Philip, 2026-10-15): entering the world
// goes fullscreen, so it plays like a desktop game rather than a page in a tab.
//
// A browser grants fullscreen only inside a user gesture, so enterFullscreen()
// is called at the click or keypress that enters the world, before anything
// awaits. Once fullscreen, Chrome's Keyboard Lock takes Escape: a tap closes
// the game's windows and clears the target as it always has, and only holding
// it leaves fullscreen (Chrome says so on screen). Alt+Enter and Settings put
// it back.

const nav = navigator as Navigator & { keyboard?: { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void } };

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export function enterFullscreen(): void {
  if (isFullscreen() || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: "hide" })
    .then(() => nav.keyboard?.lock?.(["Escape"]))
    // refused (no gesture left, an iframe without permission): play windowed
    .catch(() => {});
}

export function exitFullscreen(): void {
  nav.keyboard?.unlock?.();
  if (isFullscreen()) document.exitFullscreen().catch(() => {});
}

export function toggleFullscreen(): void {
  if (isFullscreen()) exitFullscreen(); else enterFullscreen();
}
