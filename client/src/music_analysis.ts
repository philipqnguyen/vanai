// Objective checks on rendered score audio: nobody building the score can hear
// it except Philip, so before a piece reaches his ears it is measured. Pure and
// DOM-free (plain Float32Arrays in, numbers out) so the node tests can check the
// meter itself against known signals, and the jukebox page can run it on an
// OfflineAudioContext render for tools/music/render.mjs.
//
// Loudness is ITU-R BS.1770 / EBU R128: K-weighted, 400ms blocks on a 100ms hop,
// absolute gate at -70 LUFS, relative gate 10 LU under the ungated mean. That is
// what "LUFS" means in every DAW, so the numbers compare with anything else.

export interface BiquadCoefs { b0: number; b1: number; b2: number; a1: number; a2: number }

/** The two K-weighting stages for any sample rate (the libebur128 derivation;
 *  at 48kHz it reproduces the coefficient table printed in BS.1770). */
export function kWeighting(rate: number): [BiquadCoefs, BiquadCoefs] {
  // stage 1: the head's high shelf, +4dB above ~1.7kHz
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf: BiquadCoefs = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // stage 2: the RLB highpass at ~38Hz
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / rate);
  const d = 1 + K1 / Q1 + K1 * K1;
  const hp: BiquadCoefs = { b0: 1, b1: -2, b2: 1, a1: (2 * (K1 * K1 - 1)) / d, a2: (1 - K1 / Q1 + K1 * K1) / d };
  return [shelf, hp];
}

function biquad(x: Float32Array, c: BiquadCoefs): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

const db = (v: number) => (v > 0 ? 10 * Math.log10(v) : -Infinity);
const dbAmp = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

/** Momentary/short-term block loudnesses: mean square of the K-weighted channels
 *  summed (L and R both weight 1), on windows of `win` seconds every 100ms. */
function blocks(kw: Float32Array[], rate: number, win: number): number[] {
  const n = Math.floor(win * rate), hop = Math.floor(0.1 * rate);
  const len = kw[0].length;
  const out: number[] = [];
  if (len < n) return out;
  // prefix sums of squares make every window O(1)
  const pre = kw.map((ch) => {
    const p = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) p[i + 1] = p[i] + ch[i] * ch[i];
    return p;
  });
  for (let s = 0; s + n <= len; s += hop) {
    let z = 0;
    for (const p of pre) z += (p[s + n] - p[s]) / n;
    out.push(z);
  }
  return out;
}

export interface Loudness {
  integrated: number;     // LUFS, gated
  shortTermMax: number;   // LUFS, loudest 3s window
  momentaryMax: number;   // LUFS, loudest 400ms window
  range: number;          // LU, EBU loudness range (10th..95th percentile of short-term)
}

export function loudness(ch: Float32Array[], rate: number): Loudness {
  const [shelf, hp] = kWeighting(rate);
  const kw = ch.map((x) => biquad(biquad(x, shelf), hp));
  const lufs = (z: number) => -0.691 + db(z);
  const mom = blocks(kw, rate, 0.4);
  const abs = mom.filter((z) => lufs(z) > -70);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((z) => lufs(z) > rel);
  const st = blocks(kw, rate, 3);
  const stL = st.map(lufs).filter((v) => v > -70);
  const stRel = lufs(mean(st.filter((z) => lufs(z) > -70))) - 20;
  const lra = stL.filter((v) => v > stRel).sort((a, b) => a - b);
  const pct = (p: number) => lra.length ? lra[Math.min(lra.length - 1, Math.floor(p * (lra.length - 1)))] : -Infinity;
  return {
    integrated: gated.length ? lufs(mean(gated)) : -Infinity,
    shortTermMax: st.length ? Math.max(...st.map(lufs)) : -Infinity,
    momentaryMax: mom.length ? Math.max(...mom.map(lufs)) : -Infinity,
    range: lra.length ? pct(0.95) - pct(0.1) : 0,
  };
}

/** RMS in dBFS over [a, b) seconds, both channels together. */
export function rmsDb(ch: Float32Array[], rate: number, a: number, b: number): number {
  const i0 = Math.max(0, Math.floor(a * rate)), i1 = Math.min(ch[0].length, Math.floor(b * rate));
  if (i1 <= i0) return -Infinity;
  let s = 0;
  for (const x of ch) for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return db(s / ((i1 - i0) * ch.length));
}

export interface Peak {
  peakDb: number; clips: number; peakAt: number;
  /** samples past -1.5dBFS: where music.ts's safety curve starts bending, so
   *  anything here was soft-clipped on the way out. A piece should have none. */
  hot: number;
}
/** The engine's safety-curve knee (music.ts safetyCurve), as a sample value. */
export const SAFE_KNEE = 0.84;

/** Sample peak and the number of samples at or past full scale. The offline
 *  render is float, so a "clip" here is a sample that would clip on the way out. */
export function peak(ch: Float32Array[], rate: number): Peak {
  let p = 0, at = 0, clips = 0, hot = 0;
  for (const x of ch) for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a >= 1) clips++;
    if (a > SAFE_KNEE) hot++;
    if (a > p) { p = a; at = i; }
  }
  return { peakDb: dbAmp(p), clips, peakAt: at / rate, hot };
}

export interface Seam {
  at: number;             // render-time seconds of the loop point
  beforeDb: number;       // RMS of the second before the seam
  afterDb: number;        // RMS of the second after it
  jumpDb: number;         // after - before
  entryDb: number | null; // RMS of the loop's first second on its first entry, if rendered
  entryDiffDb: number;    // after - entry: does the restart sound like the first time through?
  stepRatio: number;      // largest sample step within 10ms of the seam / the largest at any other bar line
  frameJumpDb: number;    // largest 50ms-RMS change within 150ms of the seam
  frameJumpBarDb: number; // the same, the largest at any other bar line
  ok: boolean;
}

/**
 * The loop seam, judged against the piece's own bar lines, since a seam is a
 * bar line: every section starts with an attack, so "louder than average" is
 * not a fault, but "a bigger step than any bar line in the piece" is.
 *
 *   level: does the restart sound like the loop's first entry (within 3dB)? It
 *          carries the last bar's tails and reverb, so a little louder is normal.
 *   click: is the largest sample step at the seam more than 1.5x the largest
 *          at any other bar line?
 *   jolt:  is the 50ms energy change at the seam 3dB more than any bar line's?
 */
export function seam(ch: Float32Array[], rate: number, at: number, entry: number | null, bar: number): Seam {
  const total = ch[0].length / rate;
  const before = rmsDb(ch, rate, at - 1, at), after = rmsDb(ch, rate, at, at + 1);
  const entryDb = entry !== null && entry >= 0 && entry + 1 <= total ? rmsDb(ch, rate, entry, entry + 1) : null;

  const stepNear = (t: number) => {
    const i0 = Math.max(1, Math.floor((t - 0.01) * rate)), i1 = Math.min(ch[0].length - 1, Math.floor((t + 0.01) * rate));
    let m = 0;
    for (const x of ch) for (let i = i0; i <= i1; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
    return m;
  };
  const fr = 0.05;
  const frames: number[] = [];
  for (let t = 0; t + fr <= total; t += fr) frames.push(Math.max(rmsDb(ch, rate, t, t + fr), -90));
  const jumpNear = (t: number) => {
    let m = 0;
    for (let i = 1; i < frames.length; i++) {
      if (Math.abs(i * fr - t) <= 0.15) m = Math.max(m, Math.abs(frames[i] - frames[i - 1]));
    }
    return m;
  };

  let refStep = 0, refJump = 0;
  for (let t = bar; t < total - 0.2; t += bar) {
    if (Math.abs(t - at) < bar / 2) continue;
    refStep = Math.max(refStep, stepNear(t));
    refJump = Math.max(refJump, jumpNear(t));
  }
  const seamStep = stepNear(at), frameJumpDb = jumpNear(at);
  const stepRatio = refStep > 0 ? seamStep / refStep : 0;
  const entryDiffDb = entryDb === null ? 0 : after - entryDb;
  return {
    at, beforeDb: before, afterDb: after, jumpDb: after - before, entryDb, entryDiffDb,
    stepRatio, frameJumpDb, frameJumpBarDb: refJump,
    ok: Math.abs(entryDiffDb) <= 3 && stepRatio <= 1.5 && frameJumpDb <= refJump + 3,
  };
}

/** RMS per bar in dBFS, bar k covering [k*bar, (k+1)*bar) of render time. */
export function barProfile(ch: Float32Array[], rate: number, bar: number): number[] {
  const out: number[] = [];
  const total = ch[0].length / rate;
  for (let k = 0; (k + 1) * bar <= total + 1e-6; k++) out.push(rmsDb(ch, rate, k * bar, (k + 1) * bar));
  return out;
}
