import {appearanceChoice,hairOptions,hairColourOptions,type HairColour,type HairStyle} from "./appearance";
import "./style.css";
import "./pregame.css";
import { rest } from "./net";
import { state, inventoryTicket, applyInventory } from "./state";
import { initEngine } from "./scene";
import "./zones";
import { initHud } from "./hud";
import { unlockAudio } from "./audio";
import { setHud, enterZone, initInput, startRenderLoop } from "./world";
import { RACES, JOBS, PLAYABLE_RACES, JOB_LIST, CINEMAS, ZONES } from "./data";
import { playCinema } from "./cutscene-cinema";
import { jobIcon, lpIcon, LP_PATHS, strokeIcon } from "./icons";
import { titleBackdrop } from "./title-backdrop";
import { loadingScreen } from "./loading-screen";
import { previewStage } from "./preview-stage";
import { isChrome } from "./browser_gate";
import { enterFullscreen } from "./fullscreen";

const app = document.getElementById("app")!;
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// two frames, so what was just put on screen is painted before a long task
const nextPaint = () => new Promise<void>((done) => { requestAnimationFrame(() => requestAnimationFrame(() => done())); setTimeout(done, 120); });
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

let disposeScreen=()=>{};
function screen(html: string, dim = false): HTMLElement {
  disposeScreen();disposeScreen=()=>{};
  document.querySelectorAll(".screen").forEach((s) => s.remove());
  previewStage.detach();
  titleBackdrop().mount(app);
  titleBackdrop().dim(dim);
  const div = document.createElement("div");
  div.className = "screen";
  div.innerHTML = html;
  app.appendChild(div);
  return div;
}

function clearScreens(): void {
  disposeScreen();disposeScreen=()=>{};
  document.querySelectorAll(".screen").forEach((s) => s.remove());
  previewStage.detach();
  titleBackdrop().unmount();
}

const EYE = LP_PATHS.sentinel, EYE_OFF = LP_PATHS.eyeOff;
const MAIL = "M3 6h18v12H3zM3 7l9 6 9-6";
const LOCK = "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3";
const ROLE_COLOR: Record<string, string> = { tank: "#8fb3e0", damage: "#e79a83", healer: "#9fd49a" };

// ---------- auth ----------
// Vanai plays in Google Chrome (browser_gate.ts): any other browser is told so
// and gets no further than this.
function showChromeOnly(): void {
  screen(`
    <header class="pg-top"><div class="pg-wordmark">VANAI</div></header>
    <div class="pg-center"><div class="pg-panel pg-empty">
      <div class="pg-rule">${lpIcon("crystal", 14, 1.6)}</div>
      <h2>Vanai plays in Google Chrome</h2>
      <p>The world is built for Chrome's graphics engine, and other browsers cannot draw it properly. Open this page in Chrome on a computer to play.</p>
      <a class="pg-btn pg-primary" href="https://www.google.com/chrome/" target="_blank" rel="noopener">Get Google Chrome</a>
    </div></div>`);
}

function showLogin(registerMode = false): void {
  const s = screen(`
    <div class="pg-auth">
      <section class="pg-hero">
        <h1 class="pg-wordmark">VANAI</h1>
        <div class="pg-rule">${lpIcon("crystal", 14, 1.6)}</div>
        <div class="pg-eyebrow">The Empty Throne</div>
        <!-- the Empty Throne's tagline, as design/the-empty-throne.html has it -->
        <p class="pg-tagline">Three hundred years ago, the Empire of Vanai vanished in a single night &mdash; dinner on the tables, gates barred from the inside. Now the doors are opening, and three cities want what's behind them.</p>
        <p class="pg-blurb">Learn every job on one character, swear to one of three courts, and be first through the doors.</p>
        <div class="pg-pillars"><span>${jobIcon("PLD", 15)} Six jobs, one hero</span><span>${lpIcon("court", 15)} Three living courts</span><span>${lpIcon("social", 15)} Built for company</span></div>
      </section>
      <form class="pg-panel pg-authform" id="f-form" novalidate>
        <div class="pg-tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" data-mode="login">Sign in</button>
          <button type="button" role="tab" data-mode="register">Create account</button>
        </div>
        <div>
          <h2 id="f-title"></h2>
          <p class="pg-sub" id="f-sub"></p>
        </div>
        <label class="pg-field"><span>Email</span>
          <div class="pg-input">${strokeIcon(MAIL, 18)}<input type="email" id="f-email" autocomplete="username" placeholder="you@example.com" required /></div>
        </label>
        <label class="pg-field"><span>Password</span>
          <div class="pg-input">${strokeIcon(LOCK, 18)}<input type="password" id="f-pass" autocomplete="current-password" placeholder="Your password" required />
          <button type="button" class="pg-eye" id="f-eye" aria-label="Show password" aria-pressed="false">${strokeIcon(EYE, 18)}</button></div>
          <small class="pg-hint" id="f-pass-hint" data-only="register">At least 8 characters.</small>
        </label>
        <label class="pg-field" data-only="register"><span>Confirm password</span>
          <div class="pg-input">${strokeIcon(LOCK, 18)}<input type="password" id="f-pass2" autocomplete="new-password" placeholder="Type it again" /></div>
        </label>
        <div class="pg-error" id="f-err" role="alert"></div>
        <button class="pg-btn pg-primary" id="f-go" type="submit"></button>
        <p class="pg-swapline"><span id="f-swaptext"></span> <button type="button" class="pg-link" id="f-swap"></button></p>
      </form>
    </div>
    <div class="pg-foot">An original world · Every sound and sky is made in the browser</div>`);
  const form = s.querySelector<HTMLFormElement>("#f-form")!;
  const email = s.querySelector<HTMLInputElement>("#f-email")!;
  const pass = s.querySelector<HTMLInputElement>("#f-pass")!;
  const pass2 = s.querySelector<HTMLInputElement>("#f-pass2")!;
  const err = s.querySelector<HTMLElement>("#f-err")!;
  const go = s.querySelector<HTMLButtonElement>("#f-go")!;
  const tabs = s.querySelector<HTMLElement>(".pg-tabs")!;
  const eye = s.querySelector<HTMLButtonElement>("#f-eye")!;
  const fail = (msg: string, field?: HTMLInputElement) => {
    err.textContent = msg; err.classList.remove("on"); void err.offsetWidth; err.classList.add("on");
    field?.closest(".pg-input")?.classList.add("bad"); field?.focus();
  };
  const clear = () => { err.classList.remove("on"); s.querySelectorAll(".pg-input.bad").forEach((e) => e.classList.remove("bad")); };
  const mode = (register: boolean) => {
    registerMode = register;
    clear();
    form.classList.toggle("register", register);
    tabs.dataset.mode = register ? "register" : "login";
    tabs.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String((b.dataset.mode === "register") === register)));
    s.querySelector("#f-title")!.textContent = register ? "Begin your story" : "Welcome back";
    s.querySelector("#f-sub")!.textContent = register ? "One account holds all your characters." : "Sign in to return to your characters.";
    go.textContent = register ? "Create account" : "Sign in";
    pass.autocomplete = register ? "new-password" : "current-password";
    pass.placeholder = register ? "Choose a password" : "Your password";
    s.querySelector("#f-swaptext")!.textContent = register ? "Already have an account?" : "New to Vanai?";
    s.querySelector("#f-swap")!.textContent = register ? "Sign in" : "Create an account";
    (email.value ? pass : email).focus();
  };
  tabs.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => mode(b.dataset.mode === "register")));
  s.querySelector("#f-swap")!.addEventListener("click", () => mode(!registerMode));
  eye.addEventListener("click", () => {
    const show = pass.type === "password";
    pass.type = pass2.type = show ? "text" : "password";
    eye.setAttribute("aria-pressed", String(show));
    eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
    eye.innerHTML = strokeIcon(show ? EYE_OFF : EYE, 18);
  });
  [email, pass, pass2].forEach((i) => i.addEventListener("input", () => i.closest(".pg-input")?.classList.remove("bad")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (go.disabled) return;
    clear();
    const address = email.value.trim();
    if (!/^[^@\s]+@[^@\s]+$/.test(address)) return fail("Enter the email address for your account.", email);
    if (!pass.value) return fail("Enter your password.", pass);
    if (registerMode && pass.value.length < 8) return fail("Choose a password of at least 8 characters.", pass);
    if (registerMode && pass.value !== pass2.value) return fail("The two passwords do not match.", pass2);
    go.disabled = true; go.classList.add("busy");
    const res = await (registerMode ? rest.register(address, pass.value) : rest.login(address, pass.value)).catch(() => ({ error: "The server could not be reached. Try again in a moment." }));
    go.disabled = false; go.classList.remove("busy");
    if (res.error) return fail(res.error, registerMode ? undefined : pass);
    showCharacterSelect();
  });
  mode(registerMode);
}

// ---------- character select ----------
const zoneName = (key: string) => ZONES[key]?.name || key;
const levelOf = (c: any) => c.jobs?.find((j: any) => j.job === c.job)?.level || 1;

async function showCharacterSelect(): Promise<void> {
  const res = await rest.characters().catch(() => ({ error: "offline" }));
  if (res.error) { showLogin(); return; }
  const chars: any[] = res.characters || [];
  if (!chars.length) { showEmptyRoster(); return; }
  let selected = chars.find((c) => String(c.id) === store.get("vanai.lastCharacter")) ?? chars[0];
  const rows = chars.map((c) => {
    const role = JOBS[c.job]?.role || "tank";
    return `<button type="button" class="charrow" role="option" data-id="${c.id}" aria-selected="false">
      <span class="pg-crest" style="--c:${ROLE_COLOR[role]}">${jobIcon(c.job, 24)}</span>
      <span class="cinfo"><span class="cname">${esc(c.name)}</span><span class="cmeta">${esc(RACES[c.race]?.name || c.race)} ${esc(JOBS[c.job]?.name || c.job)} · ${esc(zoneName(c.zone))}</span></span>
      <span class="clevel">Lv ${levelOf(c)}</span>
    </button>`;
  }).join("");
  const s = screen(`
    <header class="pg-top">
      <div class="pg-wordmark">VANAI</div>
      <nav><button type="button" class="pg-ghost" id="c-intro">${lpIcon("film", 16)}<span class="lbl">Watch the intro</span></button>
      <button type="button" class="pg-ghost" id="c-out">${lpIcon("close", 16)}<span class="lbl">Sign out</span></button></nav>
    </header>
    <div class="pg-select">
      <aside class="pg-panel pg-roster">
        <header><h2>Characters</h2><span class="pg-count">${chars.length}</span></header>
        <div class="charlist" role="listbox" aria-label="Your characters">${rows}</div>
        <button type="button" class="pg-newchar" id="c-new">${strokeIcon("M12 5v14M5 12h14", 18, 2)} Create a new character</button>
      </aside>
      <section class="pg-stage">
        <div class="pg-slot"></div>
        <div class="pg-plate">
          <h2 class="pname" id="c-name"></h2>
          <div class="ptitle" id="c-title"></div>
          <div class="pmeta" id="c-meta"></div>
          <button type="button" class="pg-btn pg-primary" id="c-enter">Enter the world</button>
          <div class="pg-keyhint">Double-click a character or press <kbd>Enter</kbd></div>
        </div>
      </section>
    </div>`, true);
  previewStage.attach(s.querySelector<HTMLElement>(".pg-slot")!);
  const list = s.querySelector<HTMLElement>(".charlist")!;
  const choose = (c: any, focus = false) => {
    selected = c;
    store.set("vanai.lastCharacter", String(c.id));
    list.querySelectorAll<HTMLElement>(".charrow").forEach((row) => {
      const on = row.dataset.id === String(c.id);
      row.classList.toggle("sel", on); row.setAttribute("aria-selected", String(on)); row.tabIndex = on ? 0 : -1;
      if (on && focus) { row.focus(); row.scrollIntoView({ block: "nearest" }); }
    });
    s.querySelector("#c-name")!.textContent = c.name;
    s.querySelector("#c-title")!.textContent = c.title || "";
    s.querySelector("#c-meta")!.innerHTML = `<span>${jobIcon(c.job, 14)} Level ${levelOf(c)} ${esc(JOBS[c.job]?.name || c.job)}</span><span>${esc(RACES[c.race]?.name || c.race)}</span><span>${lpIcon("map", 14)} ${esc(zoneName(c.zone))}</span>`;
    previewStage.show({ race: c.race, job: c.job, appearance: c.appearance });
  };
  const enter = () => enterWorld(selected.id);
  list.querySelectorAll<HTMLElement>(".charrow").forEach((row) => {
    const c = chars.find((x) => String(x.id) === row.dataset.id);
    row.addEventListener("click", () => choose(c));
    row.addEventListener("dblclick", enter);
  });
  const keys = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const i = chars.indexOf(selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); choose(chars[(i + (e.key === "ArrowDown" ? 1 : chars.length - 1)) % chars.length], true); }
    // Enter on the roster enters the world; on another button it presses that button
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement && !e.target.classList.contains("charrow"))) { e.preventDefault(); enter(); }
  };
  addEventListener("keydown", keys);
  disposeScreen = () => removeEventListener("keydown", keys);
  s.querySelector("#c-enter")!.addEventListener("click", enter);
  s.querySelector("#c-new")!.addEventListener("click", showCharacterCreate);
  wireRosterNav(s);
  choose(selected);
}

function showEmptyRoster(): void {
  const s = screen(`
    <header class="pg-top">
      <div class="pg-wordmark">VANAI</div>
      <nav><button type="button" class="pg-ghost" id="c-intro">${lpIcon("film", 16)}<span class="lbl">Watch the intro</span></button>
      <button type="button" class="pg-ghost" id="c-out">${lpIcon("close", 16)}<span class="lbl">Sign out</span></button></nav>
    </header>
    <div class="pg-center"><div class="pg-panel pg-empty">
      <div class="pg-rule">${lpIcon("crystal", 14, 1.6)}</div>
      <h2>No one has set out yet</h2>
      <p>Your account is ready. Make a character: choose a people, a first job and the city where you begin. You can learn all six jobs later.</p>
      <button type="button" class="pg-btn pg-primary" id="c-new">Create your first character</button>
    </div></div>`);
  s.querySelector("#c-new")!.addEventListener("click", showCharacterCreate);
  wireRosterNav(s);
}

function wireRosterNav(s: HTMLElement): void {
  // anyone may watch the intro again from here; it changes nothing
  s.querySelector("#c-intro")!.addEventListener("click", async () => {
    unlockAudio();
    clearScreens();
    ensureEngine();
    await playCinema("intro", CINEMAS.intro);
    showCharacterSelect();
  });
  s.querySelector("#c-out")!.addEventListener("click", async () => { await rest.logout(); showLogin(); });
}

/** From the roster, or straight after creation: the loading screen goes up at once. */
async function enterWorld(id: number, onError?: (msg: string) => void): Promise<void> {
  // a click is the gesture the browser wants before it will play sound:
  // take it here, so a scene that starts before the first keypress in the
  // world (a new character's opening) is heard
  unlockAudio();
  // ...and the gesture fullscreen wants: the game takes the whole screen
  // from here on, like a desktop game (fullscreen.ts)
  enterFullscreen();
  const ls = loadingScreen();
  if (ls.active) return; // a double-click or a held Enter: already on the way
  ls.begin("Entering Vanai", "Opening your charter", 0.04);
  const sel = await rest.selectCharacter(id).catch(() => ({ error: "The server could not be reached." }));
  if (sel.error) { ls.hideNow(); onError?.(sel.error); return; }
  startGame();
}

// ---------- character creation ----------
const START_CITIES: Record<string, { name: string; short: string; desc: string; color: string }> = {
  caerdun: { name: "Caerdun", short: "The Sea Gate", color: "var(--caerdun)", desc: "The garrison city on the fjord: granite terraces, a cold harbour, and three centuries of unpaid wages with the ledgers to prove it. Its guilds: the shield line (Paladin) and the duelling code (Samurai)." },
  heartwood: { name: "Heartwood", short: "The Tree Ring", color: "var(--heartwood)", desc: "The unconquered city inside its ring of living trees, on the bay. It holds a writ reading Restitution upon Return. Its guilds: the battle-chanters (Monk) and the grudge-keepers (Dark Knight)." },
  moonmere: { name: "Moonmere", short: "The Island Academy", color: "var(--moonmere)", desc: "The imperial academy in exile, on its island in the Southern Sea at the end of a long causeway. The only people who can read the interior's records. Its guilds: the mending college (White Mage) and the burned shelf (Black Mage)." },
};
const RACE_LINE: Record<string, string> = { aedri: "Humankind", valdren: "Tall elves", karrog: "Stone-patient", nym: "Deerfolk", rasha: "Foxfolk" };
const STATS: [string, string][] = [["str", "STR"], ["vit", "VIT"], ["int", "INT"], ["mnd", "MND"], ["agi", "AGI"]];
const NAME_RULE = /^[A-Za-z][A-Za-z']*$/;

function nameProblem(name: string): string {
  if (!name) return "Your character needs a name.";
  if (!NAME_RULE.test(name)) return "Letters only, with an apostrophe allowed after the first letter.";
  if (name.length < 2) return "A name needs at least 2 letters.";
  return "";
}

function statBars(race: string): string {
  const r = RACES[race];
  const cells = [...STATS.map(([k, label]) => [label, r.mods?.[k] ?? 1] as [string, number]), ["HP", r.hp_mod ?? 1], ["MP", r.mp_mod ?? 1]] as [string, number][];
  return cells.map(([label, v]) => {
    const d = Math.round((v - 1) * 100);
    const col = d > 0 ? "#9fd49a" : d < 0 ? "#e79a83" : "var(--lp-faint)";
    const width = Math.min(50, Math.abs(d) * 2.6);
    return `<div class="pg-stat" title="${label} ${d > 0 ? "+" : ""}${d}%"><i style="--w:${width}%;--x:${d < 0 ? "-100%" : "0"};--col:${col}"></i>${label}<em style="--col:${col}">${d > 0 ? "+" : ""}${d}%</em></div>`;
  }).join("");
}

function showCharacterCreate(): void {
  let race = "aedri";
  let job = "PLD";
  let city = "caerdun";
  let face: "male" | "female" = "male";
  let hair = "";
  let hairColour: HairColour = "natural";
  let beard = true;
  const s = screen(`
    <div class="pg-create">
      <section class="pg-stage">
        <div class="pg-slot"></div>
        <div class="pg-plate">
          <h2 class="pname placeholder" id="n-plate-name">Unnamed</h2>
          <div class="pmeta" id="n-plate-meta"></div>
        </div>
      </section>
      <div class="pg-panel pg-builder character-create">
        <header><button type="button" class="pg-ghost" id="n-back" aria-label="Back to your characters">${strokeIcon("M15 6l-6 6 6 6", 16, 2)} Back</button><h2>New character</h2></header>
        <nav class="pg-steps" aria-label="Steps">
          <a data-step="race"><b>1</b>People</a><a data-step="look"><b>2</b>Look</a><a data-step="job"><b>3</b>Job</a><a data-step="city"><b>4</b>City</a><a data-step="name"><b>5</b>Name</a>
        </nav>
        <div class="pg-builder-body">
          <section class="pg-section" id="step-race">
            <h3><b>1</b>Choose a people</h3>
            <div class="pg-choices races" role="radiogroup" aria-label="People" id="n-races"></div>
            <div class="pg-detail" id="n-racedesc"></div>
            <div class="pg-stats" id="n-racestats" aria-label="How this people's attributes differ from the average"></div>
          </section>
          <section class="pg-section" id="step-look">
            <h3><b>2</b>Appearance<small>Never changes your stats</small></h3>
            <div class="pg-look">
              <div class="pg-look-row"><span>Body</span><div class="pg-seg" role="radiogroup" aria-label="Body" id="n-face"></div></div>
              <div class="pg-look-row"><span>Hair</span><div class="pg-seg" role="radiogroup" aria-label="Hair" id="n-hair"></div></div>
              <div class="pg-look-row"><span>Colour</span><div class="pg-seg" role="radiogroup" aria-label="Hair colour" id="n-hair-colour"></div></div>
              <div class="pg-look-row" id="n-beard-pick" hidden><span>Beard</span><div class="pg-seg" role="radiogroup" aria-label="Facial hair" id="n-beard"></div></div>
            </div>
            <p class="pg-note" id="n-look-note"></p>
          </section>
          <section class="pg-section" id="step-job">
            <h3><b>3</b>First job<small>You can learn all six later</small></h3>
            <div class="pg-choices jobs" role="radiogroup" aria-label="First job" id="n-jobs"></div>
            <div class="pg-detail" id="n-jobdesc"></div>
          </section>
          <section class="pg-section" id="step-city">
            <h3><b>4</b>Starting city</h3>
            <div class="pg-choices cities" role="radiogroup" aria-label="Starting city" id="n-cities"></div>
            <div class="pg-detail" id="n-citydesc"></div>
          </section>
          <section class="pg-section" id="step-name">
            <h3><b>5</b>Name<span class="pg-counter" id="n-count">0 / 16</span></h3>
            <label class="pg-field"><span class="sr" hidden>Name</span>
              <div class="pg-input">${lpIcon("character", 18)}<input type="text" id="n-name" maxlength="16" placeholder="What are you called?" autocomplete="off" spellcheck="false" aria-describedby="n-name-hint" /></div>
              <small class="pg-hint" id="n-name-hint">2 to 16 letters. An apostrophe is allowed after the first letter.</small>
            </label>
          </section>
        </div>
        <footer>
          <div class="pg-error" id="n-err" role="alert"></div>
          <button type="button" class="pg-btn pg-primary" id="n-go">Begin in Caerdun</button>
        </footer>
      </div>
    </div>`, true);
  previewStage.attach(s.querySelector<HTMLElement>(".pg-slot")!);
  const $ = <T extends HTMLElement = HTMLElement>(q: string) => s.querySelector<T>(q)!;
  const nameInput = $<HTMLInputElement>("#n-name");
  const goBtn = $<HTMLButtonElement>("#n-go");
  const err = $("#n-err");
  const body = $(".pg-builder-body");

  const appearance = () => appearanceChoice(race, { face, hair: hair as any, beard, hair_colour: hairColour })!;
  // an option's third field is a colour swatch drawn before its label
  const seg = (el: HTMLElement, options: [string, string, string?][], current: string, locked = false) => {
    el.innerHTML = options.map(([v, label, swatch]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === current}" ${locked && v !== current ? "disabled" : ""}>${swatch ? `<i class="pg-swatch" style="--c:${swatch}"></i>` : ""}${esc(label)}</button>`).join("");
    el.setAttribute("aria-disabled", String(locked));
  };
  const radios = (el: HTMLElement, attr: string, current: string) => el.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((b) => b.setAttribute("aria-checked", String(b.getAttribute(attr) === current)));

  $("#n-races").innerHTML = PLAYABLE_RACES.map((r) => `<button type="button" class="pg-choice" role="radio" data-r="${r}"><span class="t">${esc(RACES[r].name)}</span><span class="s">${esc(RACE_LINE[r] || "")}</span></button>`).join("");
  $("#n-jobs").innerHTML = JOB_LIST.map((j) => `<button type="button" class="pg-choice" role="radio" data-j="${j}">${jobIcon(j, 26)}<span class="t">${esc(JOBS[j].name)}</span><span class="pg-role ${JOBS[j].role}">${esc(JOBS[j].role)}</span></button>`).join("");
  $("#n-cities").innerHTML = Object.entries(START_CITIES).map(([k, c]) => `<button type="button" class="pg-choice" role="radio" data-c="${k}" style="--c:${c.color}"><span class="t">${c.name}</span><span class="s">${c.short}</span></button>`).join("");

  const steps = s.querySelectorAll<HTMLAnchorElement>(".pg-steps a");
  const nameOk = () => !nameProblem(nameInput.value.trim());
  const render = () => {
    // a people with one body shows only that body; every hair offered is
    // real hair (Philip, 2026-10-15: no player character is bald)
    if (race === "karrog") face = "male";
    if (race === "rasha") face = "female";
    const hairs = hairOptions(race, face);
    if (!hairs.some(([v]) => v === hair)) hair = hairs[0][0];
    radios($("#n-races"), "data-r", race);
    radios($("#n-jobs"), "data-j", job);
    radios($("#n-cities"), "data-c", city);
    $("#n-racedesc").textContent = RACES[race].desc + (race === "nym" ? " Higher magic and agility, with lower strength and vitality." : "");
    $("#n-racestats").innerHTML = statBars(race);
    const single = race === "karrog" || race === "rasha";
    seg($("#n-face"), [["male", "Masculine"], ["female", "Feminine"]], face, single);
    seg($("#n-hair"), hairs, hair);
    seg($("#n-hair-colour"), hairColourOptions(race, face, hair as HairStyle), hairColour);
    $("#n-beard-pick").hidden = race !== "karrog";
    seg($("#n-beard"), [["beard", "Beard and moustache"], ["none", "Clean shaven"]], beard ? "beard" : "none");
    $("#n-look-note").textContent = single ? `The ${RACES[race].name} have one body in Vanai for now.` : "";
    $("#n-jobdesc").innerHTML = `<b style="font-style:normal;color:${ROLE_COLOR[JOBS[job].role]}">${esc(JOBS[job].name)}</b> — ${esc(JOBS[job].desc)}`;
    $("#n-citydesc").textContent = START_CITIES[city].desc;
    goBtn.textContent = `Begin in ${START_CITIES[city].name}`;
    $("#n-plate-meta").innerHTML = `<span>${esc(RACES[race].name)}</span><span>${jobIcon(job, 14)} ${esc(JOBS[job].name)}</span><span>${lpIcon("map", 14)} ${START_CITIES[city].name}</span>`;
    steps.forEach((a) => a.classList.toggle("done", a.dataset.step !== "name" || nameOk()));
    previewStage.show({ race, job, appearance: appearance() });
  };
  const onPick = (sel: string, fn: (v: string) => void) => $(sel).addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    fn(b.dataset.r ?? b.dataset.j ?? b.dataset.c ?? b.dataset.v ?? "");
    render();
  });
  onPick("#n-races", (v) => { race = v; });
  onPick("#n-jobs", (v) => { job = v; });
  onPick("#n-cities", (v) => { city = v; });
  onPick("#n-face", (v) => { face = v as "male" | "female"; });
  onPick("#n-hair", (v) => { hair = v; });
  onPick("#n-hair-colour", (v) => { hairColour = v as HairColour; });
  onPick("#n-beard", (v) => { beard = v === "beard"; });
  // arrow keys move within a radio group, as a native radio group would
  s.querySelectorAll<HTMLElement>("[role=radiogroup]").forEach((g) => g.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const opts = [...g.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = opts[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length];
    next.click(); g.querySelector<HTMLButtonElement>(`[aria-checked="true"]`)?.focus();
  }));
  steps.forEach((a) => a.addEventListener("click", () => {
    const target = $(`#step-${a.dataset.step}`);
    body.scrollTo({ top: target.offsetTop - body.offsetTop - 4 });
    if (a.dataset.step === "name") nameInput.focus({ preventScroll: true });
  }));
  // the step strip follows the scroll
  const spy = () => {
    let here = "race";
    for (const sec of s.querySelectorAll<HTMLElement>(".pg-section")) if (sec.offsetTop - body.offsetTop - body.scrollTop < body.clientHeight * 0.4) here = sec.id.slice(5);
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) here = "name";
    steps.forEach((a) => a.classList.toggle("here", a.dataset.step === here));
  };
  body.addEventListener("scroll", spy, { passive: true });
  nameInput.addEventListener("input", () => {
    const v = nameInput.value.trim();
    $("#n-count").textContent = `${v.length} / 16`;
    const plate = $("#n-plate-name");
    plate.textContent = v ? v.charAt(0).toUpperCase() + v.slice(1) : "Unnamed";
    plate.classList.toggle("placeholder", !v);
    const problem = v && !NAME_RULE.test(v) ? nameProblem(v) : "";
    const hint = $("#n-name-hint");
    hint.textContent = problem || "2 to 16 letters. An apostrophe is allowed after the first letter.";
    hint.classList.toggle("bad", !!problem);
    nameInput.closest(".pg-input")!.classList.toggle("bad", !!problem);
    err.classList.remove("on");
    steps.forEach((a) => a.dataset.step === "name" && a.classList.toggle("done", nameOk()));
  });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") goBtn.click(); });
  $("#n-back").addEventListener("click", showCharacterSelect);
  const fail = (msg: string) => { err.textContent = msg; err.classList.remove("on"); void err.offsetWidth; err.classList.add("on"); };
  goBtn.addEventListener("click", async () => {
    if (goBtn.disabled) return;
    const name = nameInput.value.trim();
    const problem = nameProblem(name);
    if (problem) { fail(problem); nameInput.closest(".pg-input")!.classList.add("bad"); $("#step-name").scrollIntoView({ block: "nearest", behavior: "smooth" }); nameInput.focus({ preventScroll: true }); return; }
    unlockAudio(); // as on the roster: the opening plays before any keypress
    goBtn.disabled = true; goBtn.classList.add("busy");
    const res = await rest.createCharacter(name, race, job, city, appearance()).catch(() => ({ error: "The server could not be reached. Try again in a moment." }));
    if (res.error) { goBtn.disabled = false; goBtn.classList.remove("busy"); fail(res.error); return; }
    store.set("vanai.lastCharacter", String(res.character.id));
    await enterWorld(res.character.id, (msg) => { goBtn.disabled = false; goBtn.classList.remove("busy"); fail(msg); });
  });
  render();
  spy();
}

// ---------- game boot ----------
// One engine for the page: the intro can play on it before the world does.
let engineReady = false;
function ensureEngine(): void {
  if (engineReady) return;
  engineReady = true;
  initEngine(canvas);
}

async function refreshInventory(): Promise<void> {
  // an equip, a sale or a craft sent after this one may land first: its
  // newer bags (and gold) are not to be overwritten by this older read
  const issued = inventoryTicket();
  const gs = await rest.gameState();
  if (gs.error) return;
  if (!applyInventory(issued, gs.inventory)) return;
  if (state.self) state.self.gold = gs.character.gold;
}

// The loading screen (loading-screen.ts) is up from the moment a character is
// chosen until their own avatar stands dressed in the zone: the zone build's
// own stages move it on from world.ts, and hud.showLoading(false) -- the veil
// lifting -- fills it and fades it out.
async function startGame(): Promise<void> {
  const ls = loadingScreen();
  ls.begin("Entering Vanai", "Opening your charter", 0.04);
  const gs = await rest.gameState().catch(() => ({ error: "offline" }));
  if (gs.error) { ls.hideNow(); showCharacterSelect(); return; }
  const c = gs.character;
  state.self = {
    charId: c.id, name: c.name, race: c.race, appearance:c.appearance, job: c.job, level: c.level,
    xp: c.xp, tnl: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1, tp: 0,
    gold: c.gold, title: c.title, dead: false, buffs: [],
  };
  state.inventory = gs.inventory;
  state.abilities = gs.abilities;
  state.jobs = c.jobs;
  state.quests.clear();
  gs.quests.forEach((q: any) => state.quests.set(q.id, { status: q.status, progress: q.progress, credited: q.credited }));
  state.discoveries = new Set(gs.discoveries);

  const where = zoneName(c.zone);
  ls.begin(`Entering ${where}`, "Waking the world", 0.12);
  ls.step(0.14, "Waking the world");
  await nextPaint();
  clearScreens();
  previewStage.dispose(); // its engine and GPU memory go before the world's arrive
  ensureEngine();
  // A new character sees the intro first (Philip's ruling 2026-10-11), before
  // they are in the world at all; then their city, where its opening plays.
  // Watched or skipped, it is seen.
  if (CINEMAS.intro && state.discoveries.has("scene_due_intro")) {
    ls.hideNow();
    await playCinema("intro", CINEMAS.intro);
    await rest.sceneSeen("intro");
    state.discoveries.delete("scene_due_intro");
    state.discoveries.add("scene_seen_intro");
    ls.begin(`Entering ${where}`, "Waking the world", 0.14);
  }
  ls.step(0.2, `Raising ${where}`);
  const hud = initHud({ refreshInventory });
  setHud(hud);
  initInput();
  await enterZone(c.zone, c.x, c.z);
  startRenderLoop();
  hud.updateSelf();
  hud.renderHotbar();
  hud.refreshQuests();
  hud.addChat("system", "", `Welcome to Vanai, ${c.name}. WASD to move · R to autorun · Tab cycles targets (Shift+Tab enemies, \` players) · click to target, double-click to use · F to attack · E to use your target · Enter to chat (/rest to kneel).`);
}

// dev debug handle (world.ts replaces it with its own once a zone is built)
import { getMyPos } from "./world";
import * as sceneMod from "./scene";
import { probeFloors } from "./town";
if (import.meta.env.DEV) (window as any).__vanai = { state, getMyPos, sceneMod, probeFloors };

// The views below run ahead of the auth check with no account and no world.
// Most are free cameras over any zone, scene or creature -- the whole map and
// story for anyone who types the URL -- so a production build runs only the
// public ones unless it was built with VITE_DEV_VIEWS=1. The character preview
// is the pre-game screens' own iframe (preview-stage.ts) and must always run.
const PUBLIC_VIEWS = new Set(["character-preview"]);
const DEV_VIEWS = import.meta.env.DEV || import.meta.env.VITE_DEV_VIEWS === "1";
const view = (name: string): boolean =>
  (DEV_VIEWS || PUBLIC_VIEWS.has(name)) && new URLSearchParams(location.search).has(name);

// ---------- entry ----------
(async () => {
  if(view('character-preview')){
    const {runCharacterPreview}=await import('./character-preview');
    runCharacterPreview(canvas);return;
  }
  if (view("npc-preview")) {
    const {runNpcPreview}=await import("./npc-preview");
    runNpcPreview(canvas);return;
  }
  if (view("heartwood-city")) {
    const { runHeartwoodCity } = await import("./heartwood-city");
    await runHeartwoodCity(canvas); return;
  }
  if (view("caerdun-city")) {
    const { runCaerdunCity } = await import("./caerdun-city");
    await runCaerdunCity(canvas); return;
  }
  // The score jukebox, on the same terms: no account, no world, only the music
  // engine and the score (src/jukebox.ts; also at /audition.html without Babylon).
  if (view("music")) {
    const { runJukebox } = await import("./jukebox");
    runJukebox();
    return;
  }
  // Any cutscene over its zone, with a stand-in watcher (cutscene-view.ts)
  if (view("cutscene")) {
    const { runCutsceneView } = await import("./cutscene-view");
    runCutsceneView(canvas);
    return;
  }
  // Every skill and spell's effect on a caster, an ally and a monster (spell-fx-view.ts)
  if (view("vfx")) {
    const { runSpellFxView } = await import("./spell-fx-view");
    runSpellFxView(canvas);
    return;
  }
  // Dev-only bestiary: every generated creature on its own stand, its clips and
  // wearers, and the crowd perf gate (bestiary.ts). No account, no world.
  if (view("bestiary")) {
    const { runBestiary } = await import("./bestiary");
    runBestiary(canvas);
    return;
  }
  // Dev-only race lineup, ahead of the auth check: it needs no account and no
  // world, only the client's own model code. Loaded on demand so nothing of it
  // ships in the normal boot path.
  if (view("lineup")) {
    const { runLineup } = await import("./lineup");
    runLineup(canvas);
    return;
  }
  // Dev-only map audit, on the same terms: any zone's map, minimap and the
  // world map, every landmark and NPC shown, and the map beside a top-down
  // render of the built zone (zonemapview.ts; ZONE-NOTES.md "QA harness").
  if (view("zonemap")) {
    const { runZoneMapView } = await import("./zonemapview");
    await runZoneMapView(canvas);
    return;
  }
  // Dev-only zone preview, on the same terms: any zone with no account and no
  // world thread, so zone art can be looked at instead of described.
  if (view("zone")) {
    const { runZoneView } = await import("./zoneview");
    runZoneView(canvas);
    return;
  }
  if (!isChrome(navigator as any)) { showChromeOnly(); return; }
  const me = await rest.me().catch(() => ({ user: null }));
  if (!me.user) { showLogin(); return; }
  showCharacterSelect();
})();
