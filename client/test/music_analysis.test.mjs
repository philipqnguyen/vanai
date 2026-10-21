// The meter the render tool reports with (src/music_analysis.ts), checked on
// signals whose answers are known, so a "-14 LUFS" from it means -14 LUFS.
//   node --test test/music_analysis.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { barProfile, kWeighting, loudness, peak, rmsDb, seam, SAFE_KNEE } from "../src/music_analysis.ts";

const RATE = 48000;
function sine(freq, amp, seconds, rate = RATE) {
  const x = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return x;
}
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b}`);

test("K-weighting at 48kHz is the BS.1770 table", () => {
  const [shelf, hp] = kWeighting(48000);
  near(shelf.b0, 1.53512485958697, 1e-9); near(shelf.b1, -2.69169618940638, 1e-9); near(shelf.b2, 1.19839281085285, 1e-9);
  near(shelf.a1, -1.69065929318241, 1e-9); near(shelf.a2, 0.73248077421585, 1e-9);
  near(hp.a1, -1.99004745483398, 1e-9); near(hp.a2, 0.99007225036621, 1e-9);
});

test("a 1kHz sine at -20dBFS in both channels reads -20 LUFS", () => {
  const amp = Math.pow(10, -20 / 20);
  const x = sine(1000, amp, 10);
  // BS.1770's calibration: 0dBFS 1kHz in one channel is -3.01 LUFS, so -20dBFS in two is -20
  near(loudness([x, x], RATE).integrated, -20, 0.1, "stereo");
  near(loudness([x, new Float32Array(x.length)], RATE).integrated, -23.01, 0.1, "one channel");
  near(loudness([x, x], RATE).shortTermMax, -20, 0.1, "short-term");
  near(loudness([x, x], RATE).range, 0, 0.1, "a steady tone has no range");
});

test("the gate ignores silence", () => {
  const amp = Math.pow(10, -18 / 20);
  const tone = sine(1000, amp, 5);
  const x = new Float32Array(tone.length * 3);
  x.set(tone, tone.length);   // silence, tone, silence
  // the blocks straddling the tone's edges are half tone, well above both gates,
  // so they pull the reading a quarter of a dB under the tone itself
  near(loudness([x, x], RATE).integrated, -18, 0.3);
  // whereas a third of silence ungated would read 4.8dB low
  assert.ok(loudness([x, x], RATE).integrated > -19);
});

test("peak, clips and the soft-clip region", () => {
  const x = sine(440, 0.5, 1);
  x[100] = 1.2; x[200] = -1.0; x[300] = 0.9;
  const p = peak([x, x], RATE);
  near(p.peakDb, 20 * Math.log10(1.2), 1e-6);
  assert.equal(p.clips, 4, "two samples at or past full scale, in two channels");
  assert.equal(p.hot, 6, "plus the one between the knee and full scale");
  assert.ok(SAFE_KNEE > 0.8 && SAFE_KNEE < 0.9);
  near(rmsDb([sine(440, 1, 1)], RATE, 0, 1), -3.01, 0.01, "a full-scale sine is -3dB RMS");
});

test("bar profile", () => {
  const x = new Float32Array(RATE * 4);
  x.set(sine(220, 0.1, 2), RATE * 2);
  const bars = barProfile([x], RATE, 1);
  assert.equal(bars.length, 4);
  assert.equal(bars[0], -Infinity);
  near(bars[3], 20 * Math.log10(0.1) - 3.01, 0.05);
});

test("seam: a steady loop passes, a click and a level cliff fail", () => {
  const bar = 0.5, seconds = 12, at = 8;
  // a tone with an attack on every bar line, so bar lines are not silent
  const make = () => {
    const x = new Float32Array(seconds * RATE);
    for (let i = 0; i < x.length; i++) {
      const t = i / RATE, inBar = t % bar;
      x[i] = 0.3 * Math.sin(2 * Math.PI * 330 * t) * Math.exp(-inBar * 4);
    }
    return x;
  };
  const clean = make();
  const ok = seam([clean, clean], RATE, at, 2, bar);
  assert.ok(ok.ok, JSON.stringify(ok));
  near(ok.entryDiffDb, 0, 0.2);

  const click = make();
  click[at * RATE] = 0.95; click[at * RATE + 1] = -0.95;
  const bad = seam([click, click], RATE, at, 2, bar);
  assert.ok(!bad.ok && bad.stepRatio > 1.5, `click: ${bad.stepRatio}`);

  const cliff = make();
  for (let i = at * RATE; i < cliff.length; i++) cliff[i] *= 4;
  const loud = seam([cliff, cliff], RATE, at, 2, bar);
  assert.ok(!loud.ok && loud.entryDiffDb > 3, `cliff: ${loud.entryDiffDb}`);
});
