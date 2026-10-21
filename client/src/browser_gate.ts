// Vanai plays in Google Chrome (Philip, 2026-10-15). Babylon-free;
// client/test/browser_gate.test.mjs.
//
// Chrome is told by its User-Agent Client Hints brand. Every browser built
// on Chromium carries the "Chromium" brand and its own beside it (Microsoft
// Edge, Opera, Brave), so "Google Chrome" is the test. Plain Chromium, with no
// brand of its own, is Playwright and the headless tools the QA harness and
// the render scripts drive, and is let through, as is any automated browser.
//
// The hints exist only in a secure context (https, localhost); on plain http
// (the dev server reached over the LAN) the User-Agent string stands in.

interface NavLike {
  userAgent?: string;
  webdriver?: boolean;
  userAgentData?: { brands?: { brand: string }[] } | null;
}

const NOT_A_BRAND = /not.?a.?brand/i;

export function isChrome(nav: NavLike): boolean {
  if (nav.webdriver) return true;
  const brands = nav.userAgentData?.brands?.map((b) => b.brand);
  if (brands && brands.length) {
    if (brands.includes("Google Chrome")) return true;
    return brands.includes("Chromium") && brands.every((b) => b === "Chromium" || NOT_A_BRAND.test(b));
  }
  // No hints: Chrome on iOS (CriOS) is WebKit underneath, and the rest name themselves
  const ua = nav.userAgent ?? "";
  return /\bChrome\/\d+/.test(ua) && !/\b(Edg|EdgA|OPR|Opera|Brave|SamsungBrowser|YaBrowser|Vivaldi|UCBrowser)\//.test(ua);
}
