// The loading screen: entering the world after sign-in or creation, and every
// zone crossing after (hud.ts showLoading). DOM only, no Babylon.
//
// The zone build is one long synchronous task (world.ts enterZone), so no
// script runs while it does. Everything that must keep moving through it --
// the turning rune, the sheen on the bar -- is a CSS transform animation,
// which the browser runs off the main thread; the bar's fill is set at each
// stage boundary and eases there, and between boundaries it creeps toward the
// next one so a long wait never looks stalled.
//
// begin() raises it at a fraction and a stage label, step() moves it on,
// finish() fills it and fades it out. A begin() while it is up only changes
// the title, so the boot sequence (main.ts) and the zone entry (world.ts) can
// both speak to it without one resetting the other.

const TIPS = [
  "Touch a teleport crystal to attune to it. Type /return to go back to your home crystal.",
  "One character learns every job. Change jobs with a trainer in any city.",
  "Press R to run on without holding a key.",
  "Tab cycles targets; Shift+Tab cycles only enemies.",
  "Type /rest in chat to kneel and recover between fights.",
  "Most fights go better in a party. Invite the people you meet.",
  "The courts are watching. Bounties and claims are posted in each city's hall.",
  "Open the map with M; the fog lifts from every place you have walked.",
];

const RUNE = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" class="ls-ring"/>
  <circle cx="60" cy="60" r="46" class="ls-ring thin"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2, x = 60 + Math.cos(a) * 50, y = 60 + Math.sin(a) * 50;
    return `<path d="M${x.toFixed(1)} ${(y - 3).toFixed(1)}l2.6 3-2.6 3-2.6-3z" class="ls-glyph"/>`;
  }).join("")}
</svg>`;
const ARC = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="38" class="ls-arc"/></svg>`;

export interface LoadingScreen {
  begin(title: string, label?: string, at?: number): void;
  step(fraction: number, label?: string): void;
  finish(): Promise<void>;
  hideNow(): void;
  readonly active: boolean;
}

function create(): LoadingScreen {
  const root = document.createElement("div");
  root.id = "loading-screen";
  root.setAttribute("role", "progressbar");
  root.setAttribute("aria-valuemin", "0");
  root.setAttribute("aria-valuemax", "100");
  root.innerHTML = `
    <div class="ls-centre">
      <div class="ls-rune"><div class="ls-spin">${RUNE}</div><div class="ls-spin rev">${ARC}</div><div class="ls-core"></div></div>
      <div class="ls-kicker">Vanai</div>
      <h2 class="ls-title"></h2>
      <div class="ls-bar"><div class="ls-fill"></div><div class="ls-sheen"></div></div>
      <div class="ls-row"><span class="ls-label"></span><span class="ls-pct"></span></div>
    </div>
    <p class="ls-tip"><span>Tip</span><em></em></p>`;
  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  let on = false, shown = 0, goal = 0, ceiling = 0, raf = 0, tipTimer = 0, tipIndex = Math.floor(Math.random() * TIPS.length);

  const paint = () => {
    $(".ls-fill").style.transform = `scaleX(${shown})`;
    const pct = Math.round(shown * 100);
    $(".ls-pct").textContent = `${pct}%`;
    root.setAttribute("aria-valuenow", String(pct));
  };
  // ease to the goal; past it, creep toward the ceiling (never reaching it)
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (shown < goal) shown += Math.max(0.002, (goal - shown) * 0.12);
    else if (shown < ceiling) shown += (ceiling - shown) * 0.004;
    shown = Math.min(shown, Math.max(goal, ceiling));
    paint();
  };
  const tip = () => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    const em = $(".ls-tip em");
    em.classList.remove("in"); void em.offsetWidth;
    em.textContent = TIPS[tipIndex]; em.classList.add("in");
  };

  return {
    get active() { return on; },
    begin(title, label = "", at = 0) {
      $(".ls-title").textContent = title;
      if (on) { if (label) $(".ls-label").textContent = label; if (at > goal) this.step(at, label); return; }
      on = true;
      if (!root.isConnected) document.body.appendChild(root);
      root.classList.remove("out");
      root.classList.add("on");
      shown = goal = at; ceiling = Math.min(0.97, at + 0.1);
      $(".ls-label").textContent = label;
      paint();
      tip();
      clearInterval(tipTimer);
      tipTimer = window.setInterval(tip, 6000);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    step(fraction, label) {
      if (!on) return;
      goal = Math.max(goal, Math.min(1, fraction));
      ceiling = Math.min(0.97, Math.max(ceiling, goal + 0.12));
      if (label !== undefined) $(".ls-label").textContent = label;
    },
    finish() {
      if (!on) return Promise.resolve();
      on = false;
      goal = ceiling = 1;
      $(".ls-label").textContent = "Ready";
      return new Promise<void>((done) => {
        setTimeout(() => {
          root.classList.add("out");
          setTimeout(() => {
            if (!on) { root.classList.remove("on", "out"); cancelAnimationFrame(raf); clearInterval(tipTimer); }
            done();
          }, 420);
        }, 220);
      });
    },
    hideNow() {
      on = false;
      root.classList.remove("on", "out");
      cancelAnimationFrame(raf); clearInterval(tipTimer);
    },
  };
}

let instance: LoadingScreen | null = null;
export function loadingScreen(): LoadingScreen { return instance ??= create(); }
