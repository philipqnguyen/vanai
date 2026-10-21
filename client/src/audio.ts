// Vanai audio: everything synthesized with WebAudio — no files, no licensing.
// Master → { music, sfx, ambient } buses with persisted volume settings.
//
// This file owns the SFX and the per-zone ambience bed. The music itself is a
// written score — see music.ts for the engine and score/ for the Empty Throne
// pieces, one file each. Each zone hands the engine two pieces, a field theme and its group's battle theme, plus the boss
// theme every named encounter shares (score/index.ts zoneMusic).

import { initMusic, setMusicCombat, setZoneMusic, seekMusic } from "./music";
import { zoneMusic, battleCue } from "./score";

let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, ambientBus: GainNode;
let unlocked = false;
let currentZone = "";
let ambientNodes: AudioNode[] = [];
let bellTimer: number | null = null;

const volumes = {
  master: parseFloat(localStorage.getItem("vol_master") ?? "0.8"),
  music: parseFloat(localStorage.getItem("vol_music") ?? "0.6"),
  sfx: parseFloat(localStorage.getItem("vol_sfx") ?? "0.9"),
  ambient: parseFloat(localStorage.getItem("vol_ambient") ?? "0.05"),
};

export function getVolumes() { return { ...volumes }; }
export function setVolume(bus: keyof typeof volumes, v: number): void {
  volumes[bus] = v;
  localStorage.setItem(`vol_${bus}`, String(v));
  if (!ctx) return;
  if (bus === "master") master.gain.value = v;
  if (bus === "music") musicBus.gain.value = v;
  if (bus === "sfx") sfxBus.gain.value = v;
  if (bus === "ambient") ambientBus.gain.value = v;
}

export function unlockAudio(): void {
  if (unlocked) { ctx?.resume(); return; }
  unlocked = true;
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = volumes.master; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = volumes.music; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = volumes.sfx; sfxBus.connect(master);
  ambientBus = ctx.createGain(); ambientBus.gain.value = volumes.ambient; ambientBus.connect(master);
  initMusic(ctx, musicBus);
  if (currentZone) startZoneAudio(currentZone);
}

// The approved mill keeps its machinery inside the house. Its counting-song
// cue is heard only nearby, on the same ambient bus as the rest of the world.
let millBeat = 0;
export function updatePlaceAudio(x: number, z: number, dt: number): void {
  if (!ctx || currentZone !== "heartwoodfields") { millBeat = 0; return; }
  const weight = Math.max(0, 1 - Math.hypot(x + 40, z - 60) / 65) ** 2;
  if (!weight) { millBeat = 0; return; }
  millBeat += dt;
  if (millBeat < 1.2) return;
  millBeat %= 1.2;
  tone(110, "triangle", .28 * weight, .025, .35, ambientBus);
  noise(.13 * weight, .015, .4, 280, 1, "lowpass", ambientBus);
  tone(210, "sine", .035 * weight, .18, .6, ambientBus);
}

// ---------- small synthesis helpers ----------
function now(): number { return ctx!.currentTime; }

// A stopped WebAudio node is only collectable once it is disconnected: while it
// is still wired into a live bus it stays part of the rendering graph, and
// WebKit in particular keeps processing it. Nothing here is long-lived — a
// footstep, a swing, a piano note — but footsteps alone are three nodes a
// second, so a session's worth piles up in the audio thread and never leaves.
// Every transient source tears its own chain down when it ends. The looping
// ambience deliberately does not use this; stopAmbience owns those.
function endsWith(src: AudioScheduledSourceNode, ...chain: AudioNode[]): void {
  src.onended = () => {
    src.disconnect();
    for (const n of chain) n.disconnect();
  };
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, type: OscillatorType, peak: number, attack: number, decay: number,
              bus: GainNode = sfxBus, detune = 0, when = 0): void {
  if (!ctx) return;
  const t = now() + when;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  o.connect(g); g.connect(bus);
  endsWith(o, g);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

function noise(peak: number, attack: number, decay: number, filterFreq: number, q = 1,
               type: BiquadFilterType = "bandpass", bus: GainNode = sfxBus, when = 0): void {
  if (!ctx) return;
  const t = now() + when;
  const dur = attack + decay + 0.05;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  src.connect(f); f.connect(g); g.connect(bus);
  endsWith(src, f, g);
  src.start(t); src.stop(t + dur);
}

function bell(freq: number, peak: number, decay: number, bus: GainNode = sfxBus, when = 0): void {
  // simple additive bell: fundamental + inharmonic partials
  [[1, 1], [2.02, 0.5], [2.98, 0.3], [4.4, 0.18]].forEach(([m, a]) => {
    tone(freq * m, "sine", peak * a, 0.005, decay * (1 - m * 0.1), bus, 0, when);
  });
}

// ---------- the spell kit (spell-sfx.ts) ----------
// A skill or spell's sound is built from these, on its own voice: a gain set
// by how near it is and whose it is, feeding a bus with a short synthesized
// hall behind it so magic rings rather than clicks. One noise buffer serves
// every noise here, read from a random offset, instead of a new buffer a call.

let sharedNoise: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  if (sharedNoise && sharedNoise.sampleRate === ctx!.sampleRate) return sharedNoise;
  const len = ctx!.sampleRate * 3;
  sharedNoise = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = sharedNoise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return sharedNoise;
}

// the hall: two seconds of decaying noise, a little brighter early
let hallBus: GainNode | null = null;
function hall(): GainNode {
  if (hallBus) return hallBus;
  const c = ctx!;
  hallBus = c.createGain();
  hallBus.connect(sfxBus);
  const len = Math.round(c.sampleRate * 2.2);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.32;
  hallBus.connect(conv); conv.connect(wet); wet.connect(sfxBus);
  return hallBus;
}

/** a voice for one sound: `vol` (0..1, distance and ownership) into the hall
 *  bus, let go after `life` seconds */
function voice(vol: number, life: number): GainNode | null {
  if (!ctx || vol <= 0.01) return null;
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(hall());
  setTimeout(() => g.disconnect(), (life + 2.5) * 1000);
  return g;
}

/** a tone whose pitch slides from f0 to f1 over its length */
function glide(f0: number, f1: number, type: OscillatorType, peak: number, attack: number, decay: number,
               bus: GainNode, when = 0, detune = 0): void {
  if (!ctx) return;
  const t = now() + when, end = t + attack + decay;
  const o = ctx.createOscillator();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), end);
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  o.connect(g); g.connect(bus);
  endsWith(o, g);
  o.start(t); o.stop(end + 0.05);
}

/** noise through a filter whose centre slides from f0 to f1: a whoosh, a roar, a hiss */
function whoosh(f0: number, f1: number, peak: number, attack: number, decay: number, q: number,
                type: BiquadFilterType, bus: GainNode, when = 0): void {
  if (!ctx) return;
  const t = now() + when, dur = attack + decay + 0.05;
  const src = ctx.createBufferSource();
  const buf = noiseBuffer();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  src.connect(f); f.connect(g); g.connect(bus);
  endsWith(src, f, g);
  src.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.1)); src.stop(t + dur);
}

/** sparse clicks through a high-pass: fire's crackle, a spark, ice settling */
function crackle(peak: number, dur: number, perSecond: number, cutoff: number, bus: GainNode, when = 0): void {
  if (!ctx) return;
  const t = now() + when;
  const len = Math.round(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const n = Math.round(perSecond * dur);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * (len - 200)), amp = 0.4 + Math.random() * 0.6, w = 30 + Math.random() * 120;
    for (let i = 0; i < w; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / w);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  endsWith(src, f, g);
  src.start(t); src.stop(t + dur + 0.02);
}

export interface Hum { stop(fade?: number): void }
/** a held chord for a cast: `freqs` on `type`, a tremolo, the pitch climbing
 *  `rise` (a ratio) over `dur` as the cast builds, a filtered air over it;
 *  it fades by itself at the end, or when stopped */
function hum(freqs: number[], type: OscillatorType, peak: number, dur: number, rise: number, bus: GainNode): Hum {
  if (!ctx) return { stop() {} };
  const c = ctx, t = now();
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(peak, t + Math.min(0.3, dur * 0.3));
  out.gain.setValueAtTime(peak, t + dur);
  out.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
  const trem = c.createOscillator(), tremG = c.createGain();
  trem.frequency.value = 5.5; tremG.gain.value = peak * 0.25;
  trem.connect(tremG); tremG.connect(out.gain);
  const filt = c.createBiquadFilter();
  filt.type = "lowpass"; filt.frequency.setValueAtTime(700, t); filt.frequency.exponentialRampToValueAtTime(3200, t + dur);
  const nodes: AudioScheduledSourceNode[] = [trem];
  for (const [i, f] of freqs.entries()) {
    const o = c.createOscillator();
    o.type = type; o.detune.value = (i % 2 ? 7 : -7);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * rise, t + dur);
    o.connect(filt);
    nodes.push(o);
  }
  // air: noise through a band that climbs with the cast
  const air = c.createBufferSource();
  air.buffer = noiseBuffer(); air.loop = true;
  const af = c.createBiquadFilter();
  af.type = "bandpass"; af.Q.value = 2.5; af.frequency.setValueAtTime(900, t); af.frequency.exponentialRampToValueAtTime(5200, t + dur);
  const ag = c.createGain(); ag.gain.value = 0.35;
  air.connect(af); af.connect(ag); ag.connect(filt);
  nodes.push(air);
  filt.connect(out); out.connect(bus);
  const end = t + dur + 0.4;
  for (const n of nodes) { n.start(t); n.stop(end); }
  nodes[nodes.length - 1].onended = () => { for (const n of nodes) n.disconnect(); filt.disconnect(); out.disconnect(); af.disconnect(); ag.disconnect(); tremG.disconnect(); };
  let stopped = false;
  return {
    stop(fade = 0.2) {
      if (stopped) return;
      stopped = true;
      const s = now();
      out.gain.cancelScheduledValues(s);
      out.gain.setValueAtTime(out.gain.value, s);
      out.gain.linearRampToValueAtTime(0.0001, s + fade);
      for (const n of nodes) { try { n.stop(s + fade + 0.05); } catch { /* already stopped */ } }
    },
  };
}

/** the kit spell-sfx.ts plays from: every call is a no-op until audio is unlocked */
export const synth = {
  voice, glide, whoosh, crackle, hum,
  tone: (f: number, type: OscillatorType, peak: number, attack: number, decay: number, bus: GainNode, when = 0, detune = 0) => tone(f, type, peak, attack, decay, bus, detune, when),
  noise: (peak: number, attack: number, decay: number, filterFreq: number, q: number, type: BiquadFilterType, bus: GainNode, when = 0) => noise(peak, attack, decay, filterFreq, q, type, bus, when),
  bell: (f: number, peak: number, decay: number, bus: GainNode, when = 0) => bell(f, peak, decay, bus, when),
};

// ---------- SFX ----------
const ELEM_FREQ: Record<string, number> = { steel: 220, shadow: 174, radiance: 392 };

export const sfx = {
  uiClick() { tone(880, "square", 0.06, 0.002, 0.03); },
  meleeHit(crit = false) {
    noise(crit ? 0.5 : 0.32, 0.004, 0.09, 500 + Math.random() * 300, 1.2);
    tone(85, "sine", crit ? 0.5 : 0.35, 0.004, 0.12);
    if (crit) tone(1320, "triangle", 0.15, 0.002, 0.15);
  },
  hitTaken() { noise(0.4, 0.004, 0.1, 300, 1); tone(65, "sine", 0.45, 0.005, 0.16); },
  miss() { noise(0.18, 0.03, 0.12, 1400, 0.6, "highpass"); },
  skillchain(element?: string) {
    const f = ELEM_FREQ[element || "radiance"] || 392;
    bell(f, 0.4, 1.6);
    bell(f * 1.5, 0.25, 1.3, sfxBus, 0.08);
    tone(f / 4, "sine", 0.4, 0.01, 0.6);
    noise(0.2, 0.01, 0.5, 2400, 0.8, "highpass");
  },
  magicBurst() {
    [0, 0.06, 0.12, 0.18].forEach((w, i) => tone(392 * Math.pow(1.26, i), "triangle", 0.25, 0.01, 0.4, sfxBus, 0, w));
    noise(0.25, 0.02, 0.6, 3000, 0.7, "highpass");
  },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, "triangle", 0.2, 0.01, 0.5, sfxBus, 0, i * 0.11));
    bell(1047, 0.2, 1.2, sfxBus, 0.44);
  },
  death() { bell(98, 0.5, 2.5); bell(98, 0.4, 2.5, sfxBus, 1.1); },
  xpTick() { tone(1175, "sine", 0.07, 0.004, 0.09); },
  questAccept() { tone(587, "triangle", 0.12, 0.01, 0.25); tone(880, "triangle", 0.1, 0.01, 0.3, sfxBus, 0, 0.1); },
  questComplete() {
    [587, 784, 1175].forEach((f, i) => tone(f, "triangle", 0.16, 0.01, 0.45, sfxBus, 0, i * 0.13));
  },
  discovery() {
    [659, 831, 988].forEach((f, i) => tone(f, "sine", 0.13, 0.02, 0.6, sfxBus, 4, i * 0.15));
  },
  milestone() {
    noise(0.3, 0.06, 0.5, 900, 0.8, "lowpass");
    tone(330, "sine", 0.2, 0.1, 0.8);
    [0.2, 0.32, 0.5].forEach(w => noise(0.1, 0.005, 0.05, 3000, 2, "bandpass", sfxBus, w));
  },
  aggro() { tone(70, "sawtooth", 0.25, 0.02, 0.4); noise(0.22, 0.02, 0.35, 260, 1.6); },
  loot() { tone(784, "square", 0.06, 0.004, 0.12); tone(988, "square", 0.05, 0.004, 0.14, sfxBus, 0, 0.06); },
  footstep(zone: string) {
    const stone = zone === "caerdun";
    noise(0.07, 0.004, stone ? 0.045 : 0.07, stone ? 1100 : 420, stone ? 2.5 : 0.9);
  },
};

// ---------- ambience ----------
function makeLoopNoise(filterFreq: number, gainVal: number, type: BiquadFilterType = "lowpass"): GainNode {
  const dur = 3;
  const buf = ctx!.createBuffer(1, ctx!.sampleRate * dur, ctx!.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // brownish noise
    last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985;
    data[i] = last * 6;
  }
  const src = ctx!.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = ctx!.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq;
  const g = ctx!.createGain(); g.gain.value = gainVal;
  src.connect(f); f.connect(g); g.connect(ambientBus);
  src.start();
  ambientNodes.push(src, f, g);
  return g;
}

function makeDrone(freqs: number[], gainVal: number): void {
  freqs.forEach((fr) => {
    const o = ctx!.createOscillator();
    o.type = "sine"; o.frequency.value = fr;
    const g = ctx!.createGain(); g.gain.value = gainVal;
    const lfo = ctx!.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.08;
    const lg = ctx!.createGain(); lg.gain.value = gainVal * 0.4;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(ambientBus);
    o.start(); lfo.start();
    ambientNodes.push(o, g, lfo, lg);
  });
}

function stopAmbience(): void {
  ambientNodes.forEach((n) => { try { (n as any).stop?.(); } catch {} try { n.disconnect(); } catch {} });
  ambientNodes = [];
  if (bellTimer) { clearInterval(bellTimer); bellTimer = null; }
}

// ---------- zone lifecycle ----------
// The ambiences below were written for the old world's zones and are kept
// by mood; the Empty Throne's zones borrow the one that fits by its old name.
const AMBIENCE: Record<string, string> = {
  caerdunfields: "greywold", heartwoodfields: "thornwild", moonmereshores: "lochveil",
  northroad: "vigilspine", shoreroad: "drownedreach",
  huntingwood: "palegarden", timberestates: "lanterwick", summerlakes: "lochveil",
  reservoir: "lochveil", kingsgardens: "palegarden", glassworks: "amberwastes",
  canalworks: "mirefen", granaryplains: "greywold", borderwall: "vigilspine",
  burnedland: "amberwastes", capital: "hush", capitalreturned: "caerdun",
  mausoleum: "barrow", overseerslodge: "hollowroot", sunkenballroom: "drownedbell",
  belltower: "drownedbell", glasshouse: "sunkenshrine", furnacehall: "emberdeep",
  greatsluice: "merehollow", greatgranary: "ambervault", greatwatchtower: "hushfast",
  beaconfort: "emberdeep", keep: "hush",
};

export function startZoneAudio(zone: string): void {
  currentZone = zone;
  millBeat = 0;
  if (!ctx) return;
  stopAmbience();

  switch (AMBIENCE[zone] ?? zone) {
    case "greywold": {
      const wind = makeLoopNoise(320, 0.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 0.25;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      break;
    }
    case "caerdun": {
      makeLoopNoise(220, 0.18);
      bellTimer = window.setInterval(() => { if (Math.random() < 0.6) bell(130.8, 0.12, 3.5, ambientBus); }, 52000);
      break;
    }
    case "lochveil": {
      const water = makeLoopNoise(480, 0.4);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.22;
      const lg = ctx.createGain(); lg.gain.value = 0.2;
      lfo.connect(lg); lg.connect(water.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => { if (Math.random() < 0.5) bell(82.4, 0.1, 4.5, ambientBus); }, 65000); // the drowned bell — E, with the score
      break;
    }
    case "thornwild": {
      const wind = makeLoopNoise(280, 0.45);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lg = ctx.createGain(); lg.gain.value = 0.24;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.5) tone(900 + Math.random() * 700, "sine", 0.04, 0.05, 0.5, ambientBus); // creaks
      }, 9000);
      break;
    }
    case "heartwood": {
      makeLoopNoise(360, 0.3); // leaves
      bellTimer = window.setInterval(() => { if (Math.random() < 0.55) bell(349, 0.06, 2.2, ambientBus); }, 31000); // grove chimes
      break;
    }
    case "mirefen": {
      const water = makeLoopNoise(200, 0.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
      const lg = ctx.createGain(); lg.gain.value = 0.28;
      lfo.connect(lg); lg.connect(water.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.6) tone(180 + Math.random() * 120, "sine", 0.06, 0.15, 1.2, ambientBus); // bog burps + frogs
      }, 6000);
      break;
    }
    case "moonmere": {
      const water = makeLoopNoise(520, 0.34);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18;
      const lg = ctx.createGain(); lg.gain.value = 0.18;
      lfo.connect(lg); lg.connect(water.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => { if (Math.random() < 0.5) bell(622.3, 0.05, 3.0, ambientBus); }, 27000); // glass bells — D#, in the lydian
      break;
    }
    case "vigilspine": {
      const wind = makeLoopNoise(560, 0.5); // high thin summit wind
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.16;
      const lg = ctx.createGain(); lg.gain.value = 0.28;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      break;
    }
    case "hush": {
      makeDrone([49, 49.3], 0.045); // barely-there pressure
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.3) tone(1864.7, "sine", 0.02, 0.8, 3.0, ambientBus); // one distant note, rarely
      }, 21000);
      break;
    }
    case "hushfast": {
      makeDrone([41.2, 41.6, 61.7], 0.075);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.5) bell(65, 0.06, 6.0, ambientBus); // a bell that no one rings
      }, 45000);
      break;
    }
    case "hollowroot": {
      makeDrone([46.2, 46.6, 69.3], 0.07);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.6) tone(120 + Math.random() * 60, "sine", 0.07, 0.3, 2.0, ambientBus); // deep root groans
      }, 11000);
      break;
    }
    case "barrow": {
      makeDrone([55, 55.7, 82.4], 0.06);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.7) tone(2400 + Math.random() * 1200, "sine", 0.05, 0.004, 0.6, ambientBus); // drips
      }, 7000);
      break;
    }
    case "lanterwick": {
      const wind = makeLoopNoise(420, 0.42); // thin summit wind
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lg = ctx.createGain(); lg.gain.value = 0.22;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => { if (Math.random() < 0.5) bell(392, 0.07, 1.8, ambientBus); }, 23000); // market chimes
      break;
    }
    case "drownedbell": {
      makeDrone([49, 49.4, 73.4], 0.07);
      makeLoopNoise(180, 0.3); // deep water pressure
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.75) bell(65.4, 0.16, 6.0, ambientBus); // the bell itself, directly above you
      }, 34000);
      break;
    }
    case "sunkenshrine":
    case "merehollow": {
      makeDrone([49, 49.4, 73.4], 0.065);
      makeLoopNoise(190, 0.28); // deep water pressure
      break;
    }
    case "ambervault":
    case "emberdeep": {
      makeDrone([46.2, 46.6, 69.3], 0.07);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.6) tone(140 + Math.random() * 80, "sine", 0.06, 0.3, 2.0, ambientBus); // deep vault groans
      }, 12000);
      break;
    }
    case "amberwastes": {
      const wind = makeLoopNoise(300, 0.48); // dry open-country wind
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
      const lg = ctx.createGain(); lg.gain.value = 0.26;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      break;
    }
    case "drownedreach": {
      const wind = makeLoopNoise(240, 0.42);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lg = ctx.createGain(); lg.gain.value = 0.24;
      lfo.connect(lg); lg.connect(wind.gain); lfo.start();
      ambientNodes.push(lfo, lg);
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.4) bell(98, 0.06, 5.0, ambientBus); // Lorn's chapel bells, far off
      }, 47000);
      break;
    }
    case "palegarden": {
      makeLoopNoise(420, 0.3); // silver leaves
      bellTimer = window.setInterval(() => {
        if (Math.random() < 0.4) bell(587, 0.04, 3.5, ambientBus); // glass blooms chiming
      }, 33000);
      break;
    }
  }
  const m = zoneMusic(zone);
  setZoneMusic(m.field, m.battle, m.boss);
}

// ---------- cutscenes ----------
// A scene is scored with a zone's field theme from its first bar (cutscene.ts,
// as the picture comes up). A city's opening names its own city, so the piece
// is the one the zone was already playing and simply carries on into play at
// the hand-back; a scene scored with another zone's piece hands the zone's own
// back (endCutsceneScore). `from` is for a sound unlocked mid-scene: the piece
// joins at the scene's own time rather than at its top.
// "hushed" between the warm-up's fade and the first bar: a scene skipped then,
// or torn down, must still hand the zone its music back.
let scoredWith: string | null = null;
export function scoreCutscene(zone: string, from = 0): void {
  scoredWith = zone;
  if (!ctx) return; // no sound yet: the scene calls again once a gesture unlocks it
  // "boss": a boss reveal is scored with the boss theme the fight will play
  const here = zoneMusic(currentZone), field = zone === "boss" ? battleCue("boss")?.song ?? null : zoneMusic(zone).field;
  setZoneMusic(field, here.battle, here.boss);
  if (from > 0) seekMusic(from);
}
/** While a scene warms up under black: the zone's piece fades out, so the
 *  scene's own first bar comes in on silence rather than cutting into it. */
export function hushForCutscene(): void {
  scoredWith = "hushed";
  if (!ctx) return;
  const m = zoneMusic(currentZone);
  setZoneMusic(null, m.battle, m.boss);
}
/** At the hand-back: the zone's own piece plays on, or comes back if the scene
 *  was scored with another or never reached its first bar. */
export function endCutsceneScore(): void {
  const was = scoredWith;
  scoredWith = null;
  if (!ctx || !was || was === currentZone) return;
  const m = zoneMusic(currentZone);
  setZoneMusic(m.field, m.battle, m.boss);
}
export function audioUnlocked(): boolean { return !!ctx; }

/** `boss` switches to the boss theme; it is sticky until the fight is over. */
export function setEngaged(on: boolean, boss = false): void { setMusicCombat(on, boss); }
