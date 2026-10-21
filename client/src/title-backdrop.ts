// The night behind every screen before the world: sign in, the roster,
// character creation. Drawn, not loaded, like the rest of the game's look
// (icons.ts, the score): a dusk sky over layered ridges, and on the middle
// ridge a far city whose lamps go out one at a time and only sometimes come
// back -- the night the empire emptied (LORE.md, "the night everyone left"),
// still going on behind the border. Embers rise
// past the camera and mist drifts between the ridges.
//
// One canvas, mounted once and kept across the pre-game screens so moving
// between them never flickers; unmounted when the world starts. The sky and
// ridges are painted once per size into three layers; a frame only composites
// them with the stars, lamps, mist and embers, at 30 fps, and not at all
// while the tab is hidden. prefers-reduced-motion gets one still frame.

const TAU = Math.PI * 2;

// A small seeded generator, so the ridges and the city are the same every
// visit rather than reshuffled on every resize.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A ridge line as a sum of a few sines at fixed phases: smooth, irregular,
// and cheap to evaluate per pixel column.
function ridge(seed: number, base: number, amp: number, rough: number): (u: number) => number {
  const r = rng(seed);
  const waves = Array.from({ length: 5 }, (_, i) => ({ f: (1.4 + i * i * 1.7 + r() * 1.3), p: r() * TAU, a: Math.pow(rough, i) }));
  const norm = waves.reduce((sum, w) => sum + w.a, 0);
  return (u) => base - amp * waves.reduce((sum, w) => sum + w.a * Math.sin(u * w.f * TAU / 2 + w.p), 0) / norm;
}

interface Lamp { x: number; y: number; r: number; lit: number; target: number; hue: number }
interface Ember { x: number; y: number; vy: number; sway: number; phase: number; life: number; size: number }
interface Star { x: number; y: number; r: number; tw: number; phase: number }

export interface TitleBackdrop { mount(parent: HTMLElement): void; unmount(): void; dim(on: boolean): void }

function createBackdrop(): TitleBackdrop {
  const canvas = document.createElement("canvas");
  canvas.className = "pg-backdrop";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, dpr = 1;
  let sky: HTMLCanvasElement, far: HTMLCanvasElement, near: HTMLCanvasElement;
  let stars: Star[] = [], lamps: Lamp[] = [], embers: Ember[] = [];
  let raf = 0, last = 0, mounted = false, nextOut = 0;

  const layer = () => { const c = document.createElement("canvas"); c.width = w * dpr; c.height = h * dpr; const g = c.getContext("2d")!; g.scale(dpr, dpr); return [c, g] as const; };

  function paint(): void {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const horizon = h * 0.64;

    // the sky: night overhead, a bruised violet, then the last ember-glow of
    // a sunset low over the city
    const [skyC, s] = layer(); sky = skyC;
    const grad = s.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, "#05070e"); grad.addColorStop(0.45, "#0d1224"); grad.addColorStop(0.78, "#231b30"); grad.addColorStop(1, "#4a2a26");
    s.fillStyle = grad; s.fillRect(0, 0, w, h);
    const glow = s.createRadialGradient(w * 0.62, horizon, 0, w * 0.62, horizon, Math.max(w, h) * 0.55);
    glow.addColorStop(0, "rgba(232,146,84,0.32)"); glow.addColorStop(0.35, "rgba(160,84,72,0.12)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = glow; s.fillRect(0, 0, w, h);
    // a thin moon, high and to the left of the glow
    const mx = w * 0.18, my = h * 0.17, mr = Math.max(14, Math.min(w, h) * 0.028);
    const halo = s.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    halo.addColorStop(0, "rgba(220,226,255,0.16)"); halo.addColorStop(1, "rgba(220,226,255,0)");
    s.fillStyle = halo; s.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    // the crescent is cut on its own small canvas, so the cut takes only the
    // moon's disc and never the sky behind it
    const moon = document.createElement("canvas"); moon.width = moon.height = Math.ceil(mr * 2 + 4);
    const m = moon.getContext("2d")!, c = moon.width / 2;
    m.fillStyle = "#ebe7dc"; m.beginPath(); m.arc(c, c, mr, 0, TAU); m.fill();
    m.globalCompositeOperation = "destination-out";
    m.beginPath(); m.arc(c + mr * 0.45, c - mr * 0.2, mr * 0.9, 0, TAU); m.fill();
    s.drawImage(moon, mx - c, my - c);

    const r = rng(7);
    stars = Array.from({ length: Math.round(w * h / 5200) }, () => ({ x: r() * w, y: Math.pow(r(), 1.6) * horizon * 0.95, r: 0.35 + r() * r() * 1.3, tw: 0.6 + r() * 2.2, phase: r() * TAU }));

    // ridges, far to near; the city stands on the third
    const ridges = [
      { line: ridge(11, horizon - h * 0.06, h * 0.12, 0.55), fill: "#1a1a2c", haze: 0.55 },
      { line: ridge(23, horizon + h * 0.01, h * 0.09, 0.5), fill: "#141526", haze: 0.35 },
      { line: ridge(37, horizon + h * 0.08, h * 0.06, 0.45), fill: "#0e0f1b", haze: 0.18 },
    ];
    const [farC, f] = layer(); far = farC;
    for (const rd of ridges) {
      f.fillStyle = rd.fill; f.beginPath(); f.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) f.lineTo(x, rd.line(x / w));
      f.lineTo(w, h); f.closePath(); f.fill();
      // haze laid along each crest, thicker on the far ones
      const hz = f.createLinearGradient(0, rd.line(0.5) - h * 0.05, 0, rd.line(0.5) + h * 0.1);
      hz.addColorStop(0, "rgba(120,96,128,0)"); hz.addColorStop(0.5, `rgba(120,96,128,${rd.haze * 0.18})`); hz.addColorStop(1, "rgba(120,96,128,0)");
      f.fillStyle = hz; f.fillRect(0, rd.line(0.5) - h * 0.05, w, h * 0.15);
    }
    // the city: lamps scattered on the third ridge's shoulder, densest in the
    // middle of the glow, with a few taller spires drawn as dark marks
    const city = ridges[2].line;
    const cr = rng(41);
    const cx = 0.62, spread = Math.min(0.2, 260 / w);
    f.fillStyle = "#0b0c16";
    for (let i = 0; i < 9; i++) {
      const u = cx + (cr() - 0.5) * spread * 1.4, x = u * w, top = city(u) - (8 + cr() * 26) * (h / 900);
      const half = 1.5 + cr() * 3;
      f.beginPath(); f.moveTo(x - half, city(u) + 4); f.lineTo(x - half, top + half * 2); f.lineTo(x, top); f.lineTo(x + half, top + half * 2); f.lineTo(x + half, city(u) + 4); f.fill();
    }
    lamps = Array.from({ length: Math.round(46 * Math.min(1.4, w / 1200)) }, () => {
      const g = (cr() + cr() + cr()) / 3 - 0.5;
      const u = cx + g * spread * 2.2;
      const lit = cr() < 0.82 ? 1 : 0;
      return { x: u * w, y: city(u) + 2 + cr() * h * 0.035, r: 0.8 + cr() * 1.3, lit, target: lit, hue: cr() };
    });

    // the near ridges, in front of the city and the mist
    const [nearC, n] = layer(); near = nearC;
    const fore = [
      { line: ridge(53, horizon + h * 0.2, h * 0.08, 0.5), fill: "#090a12" },
      { line: ridge(67, horizon + h * 0.32, h * 0.07, 0.6), fill: "#05060b" },
    ];
    for (const rd of fore) {
      n.fillStyle = rd.fill; n.beginPath(); n.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) n.lineTo(x, rd.line(x / w));
      n.lineTo(w, h); n.closePath(); n.fill();
    }
    embers = [];
    draw(performance.now());
  }

  function spawnEmber(t: number, anywhere = false): Ember {
    const r = Math.random;
    return { x: r() * w, y: anywhere ? r() * h : h + 10, vy: 12 + r() * 26, sway: 6 + r() * 18, phase: r() * TAU, life: t, size: 0.6 + r() * 1.6 };
  }

  function draw(t: number): void {
    const s = t / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sky, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const st of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s * st.tw + st.phase));
      ctx.globalAlpha = a; ctx.fillStyle = "#dfe6ff";
      ctx.fillRect(st.x, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(far, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // lamps ease toward their state; one goes out every few seconds, and
    // a dark one is relit less often, so the city never empties but always
    // seems to be losing
    if (!reduced && t > nextOut) {
      nextOut = t + 1600 + Math.random() * 2600;
      const litNow = lamps.filter((l) => l.target === 1);
      if (litNow.length > lamps.length * 0.45) litNow[Math.floor(Math.random() * litNow.length)].target = 0;
      if (Math.random() < 0.55) { const dark = lamps.filter((l) => l.target === 0); if (dark.length) dark[Math.floor(Math.random() * dark.length)].target = 1; }
    }
    ctx.globalCompositeOperation = "lighter";
    for (const l of lamps) {
      l.lit += (l.target - l.lit) * (l.target ? 0.02 : 0.012);
      if (l.lit < 0.02) continue;
      const flick = 0.85 + 0.15 * Math.sin(s * (3 + l.hue * 4) + l.hue * 20);
      const a = l.lit * flick;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 6);
      g.addColorStop(0, `rgba(255,${190 + l.hue * 40 | 0},120,${0.5 * a})`); g.addColorStop(1, "rgba(255,160,80,0)");
      ctx.fillStyle = g; ctx.fillRect(l.x - l.r * 6, l.y - l.r * 6, l.r * 12, l.r * 12);
      ctx.fillStyle = `rgba(255,232,180,${a})`; ctx.fillRect(l.x - l.r / 2, l.y - l.r / 2, l.r, l.r);
    }
    ctx.globalCompositeOperation = "source-over";

    // two slow bands of mist between the city and the near ridges
    for (let i = 0; i < 2; i++) {
      const y = h * (0.74 + i * 0.07), drift = Math.sin(s * 0.05 + i * 2) * w * 0.08;
      const g = ctx.createRadialGradient(w * (0.5 + i * 0.12) + drift, y, 0, w * (0.5 + i * 0.12) + drift, y, w * 0.6);
      g.addColorStop(0, `rgba(150,130,170,${0.09 - i * 0.03})`); g.addColorStop(1, "rgba(150,130,170,0)");
      ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.18); ctx.translate(0, -y);
      ctx.fillStyle = g; ctx.fillRect(0, y - w * 0.6, w, w * 1.2); ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(near, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!reduced) {
      const want = Math.round(w / 32);
      while (embers.length < want) embers.push(spawnEmber(t, embers.length < want / 2 && last === 0));
      ctx.globalCompositeOperation = "lighter";
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        const age = (t - e.life) / 1000;
        const y = e.y - age * e.vy, x = e.x + Math.sin(age * 0.7 + e.phase) * e.sway;
        if (y < h * 0.25) { embers[i] = spawnEmber(t); continue; }
        const fade = Math.min(1, (y - h * 0.25) / (h * 0.3)) * Math.min(1, age / 2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, e.size * 4);
        g.addColorStop(0, `rgba(255,190,110,${0.75 * fade})`); g.addColorStop(1, "rgba(255,120,60,0)");
        ctx.fillStyle = g; ctx.fillRect(x - e.size * 4, y - e.size * 4, e.size * 8, e.size * 8);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t;
    draw(t);
  };
  const onResize = () => { if (mounted) paint(); };
  const onVisible = () => { if (!mounted || reduced) return; cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };

  return {
    mount(parent) {
      if (canvas.parentElement !== parent) parent.prepend(canvas);
      if (mounted) return;
      mounted = true;
      paint();
      addEventListener("resize", onResize);
      document.addEventListener("visibilitychange", onVisible);
      if (!reduced) raf = requestAnimationFrame(frame);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      canvas.remove();
    },
    dim(on) { canvas.classList.toggle("dim", on); },
  };
}

let instance: TitleBackdrop | null = null;
export function titleBackdrop(): TitleBackdrop { return instance ??= createBackdrop(); }
