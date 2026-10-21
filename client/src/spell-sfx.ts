// The sound of every skill and spell (Philip, 2026-10-12: "add sound effects to
// all these magic and skills too"). Synthesized like the rest of the game's
// audio (audio.ts: no files, no licences), built from audio.ts `synth`, and
// played by spell-fx.ts at the moment its picture happens -- a rock's thud when
// that rock lands, Flare's boom when the sun goes off -- so the two never drift.
//
// Every call takes `vol`: spell-fx.ts sets it from how far away the sound is and
// whose it is (yours at full, others' softer), so a party of six casting is a
// fight and not a wall of noise.
//
// Each job's cast has its own voice, as each has its own rune: Black Mage a
// low arcane minor, White Mage a bright open chord, Dark Knight a growl, Monk a
// chant drone, Paladin a bell-like fifth; a monster's cast is a dissonant
// grind. The pitch climbs as the cast builds.
import { synth, type Hum } from "./audio";
import { ENEMY_RUNE, JOB_RUNES, type ResolvedFx, type Projectile } from "./spell-fx-plan";

const { voice, glide, whoosh, crackle, hum, tone, noise, bell } = synth;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- casting

const CAST_VOICE: Record<number, { freqs: number[]; type: OscillatorType; peak: number; rise: number }> = {
  [JOB_RUNES.BLM.style]: { freqs: [110, 130.8, 165], type: "sawtooth", peak: 0.07, rise: 1.5 },
  [JOB_RUNES.WHM.style]: { freqs: [523, 659, 784], type: "sine", peak: 0.09, rise: 1.25 },
  [JOB_RUNES.DRK.style]: { freqs: [55, 73.4, 77.8], type: "sawtooth", peak: 0.08, rise: 1.35 },
  [JOB_RUNES.MNK.style]: { freqs: [147, 220, 294], type: "triangle", peak: 0.1, rise: 1.2 },
  [JOB_RUNES.PLD.style]: { freqs: [196, 294, 392], type: "triangle", peak: 0.09, rise: 1.3 },
  [JOB_RUNES.SAM.style]: { freqs: [174, 261], type: "triangle", peak: 0.08, rise: 1.3 },
  [ENEMY_RUNE]: { freqs: [98, 104, 147], type: "sawtooth", peak: 0.08, rise: 1.15 },
};

/** a cast: the swell as the circle opens, then the job's chord held and
 *  climbing for the cast bar; returns the hum so a fizzle can cut it */
export function castBegin(style: number, grand: boolean, dur: number, vol: number): Hum {
  const v = voice(vol, dur + 1);
  if (!v) return { stop() {} };
  const cv = CAST_VOICE[style] ?? CAST_VOICE[0];
  glide(cv.freqs[0], cv.freqs[0] * 2, "sine", 0.12, 0.05, 0.5, v);
  whoosh(300, 2400, 0.12, 0.25, 0.4, 1.2, "bandpass", v);
  if (grand) glide(cv.freqs[0] / 2, cv.freqs[0], "sine", 0.18, 0.4, dur, v);
  return hum(cv.freqs, cv.type, cv.peak * (grand ? 1.3 : 1), dur, cv.rise, v);
}

/** the circle flashing out at the end of the bar */
export function castRelease(style: number, grand: boolean, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  const f = (CAST_VOICE[style] ?? CAST_VOICE[0]).freqs[0] * 4;
  bell(f, 0.16, 1.1, v);
  bell(f * 1.5, 0.1, 0.9, v, 0.03);
  whoosh(4000, 900, 0.18, 0.005, 0.35, 0.8, "bandpass", v);
  tone(f / 8, "sine", grand ? 0.3 : 0.18, 0.01, 0.4, v);
}

/** a job ability's circle: a quick ring in the job's voice */
export function jaFlash(style: number, vol: number): void {
  const v = voice(vol, 1.5);
  if (!v) return;
  const f = (CAST_VOICE[style] ?? CAST_VOICE[0]).freqs[0];
  glide(f, f * 2, "triangle", 0.12, 0.01, 0.3, v);
  whoosh(600, 3000, 0.1, 0.02, 0.25, 1, "bandpass", v);
}

// ---------------------------------------------------------------- projectiles

/** the bolt leaving the hands, for as long as it flies */
export function launch(kind: Projectile, flight: number, vol: number): void {
  const v = voice(vol, flight + 1);
  if (!v || !kind) return;
  const d = Math.max(0.15, flight);
  switch (kind) {
    case "fireball":
      whoosh(250, 900, 0.3, 0.03, d, 0.9, "lowpass", v);
      crackle(0.25, d, 60, 1800, v);
      break;
    case "rock":
      whoosh(180, 500, 0.32, 0.03, d, 1.2, "lowpass", v);
      tone(70, "sine", 0.2, 0.01, 0.2, v);
      break;
    case "ice":
      glide(2400, 4200, "sine", 0.07, 0.02, d, v);
      whoosh(2500, 6000, 0.16, 0.02, d, 1.5, "bandpass", v);
      break;
    case "wind":
      whoosh(600, 2600, 0.28, 0.04, d, 2.2, "bandpass", v);
      break;
    case "lance":
      glide(900, 2400, "sawtooth", 0.06, 0.01, d * 0.9, v);
      whoosh(3000, 8000, 0.14, 0.01, d, 1, "highpass", v);
      break;
    case "orb":
      glide(420, 300, "sine", 0.12, 0.02, d, v);
      whoosh(800, 1600, 0.12, 0.03, d, 2, "bandpass", v);
      break;
    case "miasma":
      whoosh(300, 160, 0.26, 0.05, d, 1.4, "lowpass", v);
      glide(160, 110, "sawtooth", 0.05, 0.05, d, v);
      break;
  }
}

// ---------------------------------------------------------------- the black magic

export function stoneGather(tier: number, vol: number): void {
  const v = voice(vol, 1.2);
  if (!v) return;
  whoosh(90, 260, 0.35 + tier * 0.05, 0.2, 0.3, 1.5, "lowpass", v);
  tone(48, "sine", 0.25, 0.15, 0.4, v);
  crackle(0.12, 0.4, 40, 600, v);
}
export function rockThud(vol: number): void {
  const v = voice(vol, 0.6);
  if (!v) return;
  tone(rnd(55, 85), "sine", 0.4, 0.004, 0.18, v);
  noise(0.3, 0.004, 0.12, rnd(350, 600), 1, "lowpass", v);
  crackle(0.18, 0.15, 120, 1200, v);
}
export function stoneCrash(tier: number, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  tone(42, "sine", 0.5, 0.005, 0.6 + tier * 0.1, v);
  noise(0.45, 0.005, 0.5 + tier * 0.1, 500, 0.7, "lowpass", v);
  crackle(0.3, 0.8, 70, 900, v, 0.05);
}
export function earthSpikes(vol: number): void {
  const v = voice(vol, 1.6);
  if (!v) return;
  whoosh(120, 700, 0.4, 0.06, 0.35, 1, "lowpass", v);
  for (let i = 0; i < 4; i++) noise(0.22, 0.004, 0.1, rnd(500, 900), 1.4, "bandpass", v, i * 0.03);
  tone(38, "sine", 0.4, 0.02, 0.8, v);
}

export function fireBurst(tier: number, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  tone(60, "sine", 0.45, 0.005, 0.4, v);
  whoosh(180, 1600, 0.45 + tier * 0.05, 0.02, 0.6, 0.8, "lowpass", v);
  crackle(0.35, 1.1, 50, 1500, v, 0.05);
}
export function flareDraw(vol: number): void {
  const v = voice(vol, 1);
  if (!v) return;
  // a breath drawn in: noise and a pitch both rising into the boom
  whoosh(400, 5000, 0.3, 0.3, 0.05, 1, "bandpass", v);
  glide(200, 800, "sawtooth", 0.06, 0.3, 0.05, v);
}
export function flareBoom(vol: number): void {
  // levelled by vfx_sound.mjs: at full it peaked at -1 dB alone
  const v = voice(vol * 0.65, 3);
  if (!v) return;
  tone(36, "sine", 0.7, 0.008, 1.6, v);
  glide(120, 40, "sine", 0.4, 0.005, 0.9, v);
  whoosh(2500, 120, 0.6, 0.005, 1.6, 0.6, "lowpass", v);
  crackle(0.4, 1.6, 60, 1400, v, 0.1);
  bell(196, 0.12, 2, v, 0.02);
}

export function iceGrow(freeze: boolean, vol: number): void {
  const v = voice(vol, 1.5);
  if (!v) return;
  glide(1800, 4800, "sine", 0.06, 0.04, freeze ? 0.5 : 0.25, v);
  for (let i = 0; i < (freeze ? 7 : 4); i++) bell(rnd(2400, 5200), 0.035, 0.5, v, i * 0.03);
  noise(0.15, 0.01, 0.2, 4000, 3, "bandpass", v);
  if (freeze) tone(70, "sine", 0.25, 0.05, 0.9, v);
}
export function iceShatter(freeze: boolean, vol: number): void {
  const v = voice(vol * (freeze ? 0.75 : 1), 2);
  if (!v) return;
  noise(freeze ? 0.55 : 0.4, 0.002, freeze ? 0.6 : 0.35, 5000, 0.7, "highpass", v);
  for (let i = 0; i < (freeze ? 14 : 8); i++) bell(rnd(2800, 7500), 0.05, rnd(0.2, 0.7), v, rnd(0, 0.18));
  crackle(0.3, 0.5, 160, 3000, v);
  if (freeze) tone(55, "sine", 0.35, 0.005, 0.5, v);
}

export function thunderStrike(tier: number, vol: number): void {
  const v = voice(vol * 0.75, 3);
  if (!v) return;
  noise(0.7, 0.001, 0.12, 3500, 0.5, "highpass", v);
  crackle(0.5, 0.35, 260, 2000, v);
  if (tier >= 2) { noise(0.5, 0.001, 0.1, 3000, 0.5, "highpass", v, 0.09); noise(0.4, 0.001, 0.1, 3000, 0.5, "highpass", v, 0.18); }
  // the roll after the crack
  whoosh(260, 70, 0.55, 0.04, 1.9, 0.7, "lowpass", v, 0.05);
  tone(40, "sine", 0.4, 0.02, 1.2, v, 0.04);
}

export function aeroGust(vol: number): void {
  const v = voice(vol, 1.5);
  if (!v) return;
  whoosh(500, 2800, 0.35, 0.15, 0.45, 3, "bandpass", v);
  whoosh(2400, 700, 0.25, 0.1, 0.5, 2.5, "bandpass", v, 0.3);
  glide(300, 900, "sine", 0.05, 0.2, 0.5, v);
}

// ---------------------------------------------------------------- the dark

export function bioRot(tier: number, vol: number): void {
  const v = voice(vol, 1.8);
  if (!v) return;
  whoosh(400, 150, 0.3, 0.05, 0.9, 1, "lowpass", v);
  // bubbling: short pitches sliding down
  for (let i = 0; i < 8 + tier * 3; i++) glide(rnd(260, 520), rnd(120, 200), "sine", 0.09, 0.005, rnd(0.05, 0.12), v, rnd(0, 1));
}
/** the hit and the motes carried home */
export function siphon(mp: boolean, vol: number): void {
  const v = voice(vol, 1.6);
  if (!v) return;
  tone(mp ? 330 : 165, "sawtooth", 0.08, 0.01, 0.2, v);
  noise(0.25, 0.005, 0.2, mp ? 2200 : 900, 1.2, "bandpass", v);
  // drawn back: a falling glide and a reverse swell toward the caster
  glide(mp ? 1600 : 800, mp ? 400 : 200, "sine", 0.1, 0.05, 0.6, v, 0.05);
  whoosh(3000, 500, 0.18, 0.4, 0.2, 1.4, "bandpass", v, 0.1);
  bell(mp ? 1046 : 523, 0.08, 0.6, v, 0.7);
}
export function lullaby(vol: number): void {
  const v = voice(vol, 2.5);
  if (!v) return;
  [784, 659, 523, 392].forEach((f, i) => tone(f, "sine", 0.1, 0.05, 0.5, v, i * 0.22, 6));
  whoosh(1200, 600, 0.08, 0.4, 0.8, 2, "bandpass", v);
}

// ---------------------------------------------------------------- white magic

export function banishLance(tier: number, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  [784, 988, 1175].forEach((f, i) => tone(f, "sine", 0.1, 0.01, 0.6, v, i * 0.02));
  bell(1568, 0.12, 0.9, v);
  noise(0.2, 0.004, 0.25, 5000, 0.7, "highpass", v);
  if (tier >= 3) tone(98, "sine", 0.3, 0.01, 0.6, v);
}
export function holyFall(vol: number): void {
  const v = voice(vol * 0.75, 3);
  if (!v) return;
  // a choir's swell, then the light landing
  [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, "sine", 0.08, 0.12, 1.4, v, i * 0.04, (i % 2 ? 5 : -5)));
  glide(2000, 6000, "sine", 0.04, 0.1, 0.4, v);
  tone(49, "sine", 0.5, 0.01, 1.2, v, 0.15);
  whoosh(6000, 800, 0.35, 0.01, 1, 0.7, "highpass", v, 0.15);
  bell(523, 0.18, 2, v, 0.15);
}

export function cureChime(tier: number, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  const notes = [523, 659, 784, 1046, 1318].slice(0, 2 + tier);
  notes.forEach((f, i) => tone(f, "sine", 0.11, 0.01, 0.6, v, i * 0.07));
  for (let i = 0; i < 4 + tier * 2; i++) bell(rnd(2000, 4200), 0.025, 0.4, v, rnd(0, 0.6));
  whoosh(800, 3000, 0.08, 0.2, 0.5, 1.5, "bandpass", v);
}
export function benediction(vol: number): void {
  const v = voice(vol, 3);
  if (!v) return;
  [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => tone(f, "sine", 0.09, 0.06, 1.6, v, i * 0.06));
  bell(1046, 0.16, 2.2, v, 0.3);
  whoosh(600, 5000, 0.18, 0.6, 0.8, 1, "bandpass", v);
}
export function esuna(vol: number): void {
  const v = voice(vol, 1.8);
  if (!v) return;
  for (let i = 0; i < 9; i++) bell(1200 + i * 260, 0.035, 0.4, v, i * 0.05);
  whoosh(1500, 6000, 0.12, 0.35, 0.3, 1, "bandpass", v);
}
export function raise(vol: number): void {
  const v = voice(vol, 4);
  if (!v) return;
  [262, 392, 523, 659, 784].forEach((f, i) => tone(f, "sine", 0.1, 0.4, 2.2, v, i * 0.12, (i % 2 ? 6 : -6)));
  bell(784, 0.16, 2.6, v, 0.6);
  bell(1175, 0.1, 2.2, v, 0.75);
  whoosh(300, 4000, 0.15, 1.2, 0.8, 1, "bandpass", v);
}

// ---------------------------------------------------------------- buffs and stances

export function buffOn(family: string, vol: number): void {
  const v = voice(vol * (family === "evade" || family === "circle" ? 2 : 1), 2);
  if (!v) return;
  switch (family) {
    case "protect": case "guard": {
      // a ward closing: a swell inward and a struck shield
      whoosh(3000, 400, 0.22, 0.25, 0.3, 1.2, "bandpass", v);
      bell(family === "guard" ? 220 : 330, 0.2, 1.2, v, 0.25);
      bell(family === "guard" ? 341 : 512, 0.1, 1, v, 0.26);
      tone(family === "guard" ? 55 : 82, "sine", 0.3, 0.01, 0.4, v, 0.25);
      break;
    }
    case "regen": case "lamp": {
      const base = family === "lamp" ? 659 : 523;
      [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, "sine", 0.08, 0.04, 0.6, v, i * 0.09));
      whoosh(1000, 3200, 0.08, 0.3, 0.5, 1, "bandpass", v);
      break;
    }
    case "blood": case "dread": {
      // the dark taken up: a low surge and a heartbeat
      whoosh(120, 900, 0.32, 0.15, 0.5, 1, "lowpass", v);
      glide(110, 55, "sawtooth", 0.1, 0.05, 0.6, v);
      tone(50, "sine", 0.45, 0.005, 0.18, v, 0.35);
      tone(50, "sine", 0.35, 0.005, 0.18, v, 0.6);
      break;
    }
    case "ki": {
      tone(73, "sine", 0.5, 0.004, 0.4, v);
      noise(0.3, 0.004, 0.2, 300, 1, "lowpass", v);
      glide(220, 660, "triangle", 0.12, 0.05, 0.5, v, 0.05);
      whoosh(400, 3000, 0.2, 0.2, 0.4, 1, "bandpass", v);
      break;
    }
    case "stance": {
      whoosh(2000, 600, 0.22, 0.02, 0.3, 2, "bandpass", v);
      bell(1396, 0.12, 1.2, v, 0.05);
      tone(82, "sine", 0.3, 0.005, 0.3, v);
      break;
    }
    case "evade": {
      whoosh(1500, 5000, 0.2, 0.02, 0.12, 2, "highpass", v);
      whoosh(1500, 5000, 0.16, 0.02, 0.12, 2, "highpass", v, 0.12);
      bell(2093, 0.06, 0.6, v, 0.05);
      break;
    }
    case "circle": {
      whoosh(400, 1400, 0.2, 0.2, 0.5, 1.5, "bandpass", v);
      bell(587, 0.12, 1.4, v, 0.1);
      break;
    }
    default:
      tone(440, "triangle", 0.1, 0.03, 0.4, v);
      tone(554, "triangle", 0.09, 0.03, 0.45, v, 0.1);
  }
}

export function jaOn(family: string, name: string, vol: number): void {
  const v = voice(vol, 2);
  if (!v) return;
  switch (family) {
    case "enmity": {
      // a war cry: a growl falling, a drum; Palisade the whole line's
      const big = name === "Palisade";
      glide(180, 110, "sawtooth", big ? 0.16 : 0.12, 0.02, 0.35, v);
      tone(55, "sine", big ? 0.6 : 0.45, 0.005, 0.35, v);
      noise(0.35, 0.004, 0.2, 260, 1, "lowpass", v);
      if (big) { tone(55, "sine", 0.45, 0.005, 0.35, v, 0.18); noise(0.3, 0.004, 0.2, 260, 1, "lowpass", v, 0.18); }
      break;
    }
    case "flash": {
      glide(1200, 4800, "sine", 0.12, 0.004, 0.18, v);
      noise(0.35, 0.002, 0.25, 6000, 0.7, "highpass", v);
      bell(2637, 0.1, 0.6, v);
      break;
    }
    case "stun": {
      // a clang and the stars ringing round the head
      bell(620, 0.28, 0.6, v);
      noise(0.35, 0.002, 0.12, 1800, 1.2, "bandpass", v);
      tone(90, "sine", 0.35, 0.004, 0.15, v);
      for (let i = 0; i < 5; i++) bell(rnd(2200, 3600), 0.04, 0.3, v, 0.15 + i * 0.08);
      break;
    }
    case "focus": {
      // a breath drawn in, then the gong
      whoosh(300, 2400, 0.25, 0.36, 0.05, 1, "bandpass", v);
      bell(196, 0.22, 1.8, v, 0.38);
      tone(98, "sine", 0.25, 0.01, 1, v, 0.38);
      break;
    }
  }
}

// ---------------------------------------------------------------- weapon skills

const ELEMENT_RING: Record<string, number> = { steel: 1760, shadow: 880, radiance: 1318 };

/** one cut, blow or smite landing; `swing` first, the impact under it */
export function wsHit(family: string, element: string | undefined, tier: number, vol: number): void {
  // the quick forms measured 6-9 dB under the spells (vfx_sound.mjs): lifted to meet them
  const v = voice(vol * (family === "iai" ? 1.4 : family === "blade" || family === "fists" ? 1.9 : 1), 1.5);
  if (!v) return;
  const ring = ELEMENT_RING[element ?? "steel"] ?? 1760;
  switch (family) {
    case "blade":
      whoosh(700, 3200, 0.3, 0.01, 0.12, 1.5, "bandpass", v);
      tone(85, "sine", 0.35, 0.004, 0.12, v, 0.06);
      noise(0.3, 0.004, 0.09, 900, 1.2, "bandpass", v, 0.06);
      bell(ring, 0.07, 0.5, v, 0.06);
      break;
    case "iai":
      // the draw: a thin rising zing, then the cut
      glide(2200, 7000, "sine", 0.09, 0.005, 0.12, v);
      whoosh(4000, 9000, 0.3, 0.004, 0.1, 1, "highpass", v);
      noise(0.35, 0.002, 0.08, 1400, 1.4, "bandpass", v, 0.06);
      bell(ring * 1.5, 0.08, 0.7, v, 0.06);
      break;
    case "reap":
      whoosh(250, 1200, 0.4, 0.04, 0.22, 1.2, "bandpass", v);
      tone(55, "sine", 0.45, 0.005, 0.25, v, 0.1);
      glide(220, 110, "sawtooth", 0.06, 0.01, 0.3, v, 0.1);
      break;
    case "fists":
      tone(rnd(70, 95), "sine", 0.4, 0.003, 0.09, v);
      noise(0.3, 0.002, 0.06, rnd(500, 800), 1.2, "bandpass", v);
      bell(ring, 0.04, 0.25, v);
      break;
    case "smite":
      whoosh(300, 1500, 0.3, 0.05, 0.1, 1.2, "bandpass", v);
      tone(60, "sine", 0.5, 0.004, 0.3, v, 0.12);
      noise(0.35, 0.004, 0.2, 400, 1, "lowpass", v, 0.12);
      bell(ring, 0.1, 0.9, v, 0.12);
      break;
  }
  void tier;
}
/** a finisher's shockwave and pillar */
export function wsFinisher(element: string | undefined, vol: number): void {
  const v = voice(vol * 0.75, 2.5);
  if (!v) return;
  const ring = ELEMENT_RING[element ?? "steel"] ?? 1760;
  tone(40, "sine", 0.55, 0.005, 0.9, v);
  whoosh(3000, 200, 0.4, 0.005, 0.9, 0.6, "lowpass", v);
  bell(ring / 2, 0.14, 1.6, v);
}

// ---------------------------------------------------------------- dispatch for a spell's landing

/** the one-moment spells: the sound of `fx` landing on its target */
export function spellLands(fx: ResolvedFx, vol: number): void {
  switch (fx.family) {
    case "fire": return fireBurst(fx.tier, vol);
    case "thunder": return thunderStrike(fx.tier, vol);
    case "aero": return aeroGust(vol);
    case "banish": return banishLance(fx.tier, vol);
    case "holy": return holyFall(vol);
    case "bio": return bioRot(fx.tier, vol);
    case "drain": return siphon(false, vol);
    case "aspir": return siphon(true, vol);
    case "sleep": return lullaby(vol);
  }
}
