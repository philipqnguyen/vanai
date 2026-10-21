// Vanai music: a small score engine. Still 100% synthesized — no files, no licensing.
//
// The old generator random-walked a scale over one unchanging triad, which is why
// every zone sounded like the same patient drone. This plays actual written music:
// each zone is a Song (one file each in score/) with chord changes, a melody, a
// bass line and a form, compiled to a flat event list and fed to the graph by a
// lookahead clock.
//
//   notation  -> parse()   -> Note[]        (beats, midi, duration)
//   Song      -> compile() -> Ev[]          (absolute seconds, instrument, freq)
//   Ev[]      -> transport -> WebAudio      (scheduled 200ms ahead of the clock)
//
// Everything above the transport line is pure and DOM-free so the tests can import
// it under plain Node.
//
// The 2026-10-11 palette (for the Empty Throne score, which wants battle music
// that is actually fast and towns that are actually busy) added, on top of the
// original eleven voices:
//
//   melodic   brass horn stab spiccato pizz reed lute synbass
//   pitched   timpani taiko            (write them as parts; the note is the drum)
//   kit       kick snare hat openhat tom crash   (write them in `drums` lanes)
//
// and to the notation: chords in one token (`c4+e4+g4`), accents (`c5!` `c5?`),
// repeats (`e4:.5*8`), any number of extra written `parts`, chord `hits` on a
// rhythm grid, and a step-grid drum kit with fills. See parse() and DRUMS below;
// score/kit.ts has ready grooves.

// ---------- types ----------

export type Inst =
  | "piano" | "strings" | "choir" | "harp" | "flute"
  | "bell" | "glass" | "bass" | "pad" | "drum" | "shaker"
  | "brass" | "horn" | "stab" | "spiccato" | "pizz" | "reed" | "lute" | "synbass"
  | "timpani" | "taiko"
  | "kick" | "snare" | "hat" | "openhat" | "tom" | "crash";

export type BassPat =
  | "root" | "oct" | "walk" | "pedal" | "arp" | "swell" | "drive"
  | "gallop" | "sixteen" | "pump";
export type PercPat = "none" | "frame" | "pulse" | "heart" | "drive";

export interface Part {
  inst: Inst;
  /** note tokens: `a4 c5 . d5:2 | e5 ~ c4+e4+g4!:2 a3:.5*4` — see parse() */
  n: string;
  /** beats per bare token (default 1 = quarter note) */
  unit?: number;
  vel?: number;
  /** transpose in octaves */
  oct?: number;
}

/** The kit's lanes. Each is a step grid, one bar per `|` group — see DRUMS. */
export type DrumLane = "kick" | "snare" | "hat" | "open" | "crash" | "tom" | "taiko" | "shaker";
export type DrumGrid = Partial<Record<DrumLane, string>>;
export interface Drums extends DrumGrid {
  /** scales every hit (default 1) */
  vel?: number;
  /**
   * Lanes that replace the groove's in the last bar of every `every` bars
   * (default: the section's length, i.e. its last bar). Lanes the fill does
   * not name keep playing the groove — write `"................"` to silence one.
   */
  fill?: DrumGrid & { every?: number };
}

export interface Section {
  /** what the composer calls it ("A', the Muster"), shown by the jukebox so a
   *  listening note can name the passage; the engine ignores it */
  name?: string;
  /** one bar per `|` group; several chords in a group split the bar evenly */
  chords: string;
  lead?: Part;
  counter?: Part;
  /** any further written lines: an ostinato, a timpani part, a horn answer */
  parts?: Part[];
  /** sustained chord bed; null for none */
  pad?: { inst: Inst; vel?: number; oct?: number } | null;
  bass?: { inst?: Inst; pat: BassPat; vel?: number; oct?: number } | null;
  /** chord-tone indices per unit: `0 1 2 3 2 1` */
  arp?: { inst: Inst; pat: string; unit?: number; vel?: number; oct?: number };
  /**
   * The whole chord struck on a rhythm grid, following the changes — brass
   * stabs, string chops. `pat` is one char per `unit` beats (default 0.5):
   * `x` hit, `X` accent, `o` soft, `-` holds the previous hit, `.` rest. The
   * grid restarts on every chord and repeats to fill it.
   */
  hits?: { inst: Inst; pat: string; unit?: number; vel?: number; oct?: number; voicing?: "close" | "power" };
  perc?: PercPat;
  drums?: Drums;
}

export interface Song {
  bpm: number;
  /** default 4 */
  beats?: number;
  /** 0..0.35 — delays every off-unit note */
  swing?: number;
  /** reverb size in seconds (default 2.6) */
  space?: number;
  sections: Section[];
  /** section indices in playing order */
  form: number[];
  /** index into `form` to loop back to (default 0) */
  loopFrom?: number;
}

export interface Ev {
  t: number;        // seconds from song start
  inst: Inst;
  midi: number;
  dur: number;      // seconds
  vel: number;
}

// ---------- pitch ----------

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** `cs4` `bf3` `a4` — c4 is middle C (60). Notes use s/f, never #/b. */
export function noteToMidi(name: string): number {
  const m = /^([a-g])([sf]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note: ${name}`);
  return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + (m[2] === "s" ? 1 : m[2] === "f" ? -1 : 0);
}

const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  "5": [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  "7sus4": [0, 5, 7, 10],
  "maj7s11": [0, 4, 7, 11, 18],
  "m11": [0, 3, 7, 10, 17],
};

export interface Chord {
  pc: number;       // root pitch class
  bassPc: number;   // slash bass, or root
  tones: number[];  // semitones above root
}

/** `Am` `Fmaj7` `Bm7b5` `Csus2` `Am/G` — chords use #/b, never s/f. */
export function parseChord(str: string): Chord {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(str);
  if (!m) throw new Error(`bad chord: ${str}`);
  const pc = (PC[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  const tones = QUALITY[m[3]];
  if (!tones) throw new Error(`bad chord quality: ${str} (${m[3]})`);
  const bassPc = m[4]
    ? (PC[m[4].toLowerCase()] + (m[5] === "#" ? 1 : m[5] === "b" ? -1 : 0) + 12) % 12
    : pc;
  return { pc, bassPc, tones };
}

/** Lowest midi >= floor with the given pitch class. */
function place(pc: number, floor: number): number {
  let m = 12 * Math.floor(floor / 12) + pc;
  while (m < floor) m += 12;
  return m;
}

// ---------- notation ----------

export interface Note {
  beat: number;
  midi: number;   // -1 = rest
  beats: number;
  /** velocity multiplier from an accent mark (1 when unmarked) */
  vel?: number;
}

//            pitch(+pitch)*                       rest    tie   accent    :len           *repeat
const TOKEN = /^(?:([a-g][sf]?-?\d(?:\+[a-g][sf]?-?\d)*)|([.r])|(~))([!?]?)(?::([0-9.]+))?(?:\*(\d+))?$/;
/** `!` leans on a note, `?` ghosts it. Multipliers on the part's own vel. */
const ACCENT: Record<string, number> = { "": 1, "!": 1.3, "?": 0.55 };

function token(tok: string): RegExpExecArray {
  const m = TOKEN.exec(tok);
  if (!m) throw new Error(`bad token: ${tok}`);
  return m;
}

/**
 * Parse a part into notes. Bare token = one `unit`; `:n` scales it; `.`/`r` rests;
 * `~` extends the previous note (or chord). `c4+e4+g4` sounds together; `!`/`?`
 * after the pitches accents or ghosts it; `*n` at the very end repeats the token
 * n times, so a spiccato ostinato is `e4:.5*8` rather than eight tokens.
 * `|` marks a bar and *resyncs* the cursor to that bar line, so a miscounted bar
 * dents one bar instead of shearing the whole part. `strict` (tests only) turns
 * that forgiveness into an error.
 */
export function parse(src: string, unit = 1, beatsPerBar = 4, strict = false): Note[] {
  const out: Note[] = [];
  let last: Note[] = [];
  let beat = 0;
  let bar = 0;
  for (const tok of src.replace(/\|/g, " | ").trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === "|") {
      bar++;
      const want = bar * beatsPerBar;
      if (strict && Math.abs(beat - want) > 1e-6) {
        throw new Error(`bar ${bar} is ${beat - (bar - 1) * beatsPerBar} beats, want ${beatsPerBar}`);
      }
      beat = want;
      continue;
    }
    const m = token(tok);
    const len = (m[5] ? parseFloat(m[5]) : 1) * unit;
    const reps = m[6] ? parseInt(m[6], 10) : 1;
    for (let r = 0; r < reps; r++) {
      if (m[3]) {
        // tie: stretch the last sounding note (every note of a chord) over this span
        for (const n of last) n.beats += len;
      } else if (m[1]) {
        const acc = ACCENT[m[4]];
        last = m[1].split("+").map((p) => {
          const n: Note = { beat, midi: noteToMidi(p), beats: len };
          if (acc !== 1) n.vel = acc;
          return n;
        });
        out.push(...last);
      }
      beat += len;
    }
  }
  return out;
}

/** Total beats a part occupies. The tests use it to check that every written
 *  line is exactly as long as the chords underneath it. */
export function measure(src: string, unit = 1): number {
  let beat = 0;
  for (const tok of src.replace(/\|/g, " | ").trim().split(/\s+/)) {
    if (!tok || tok === "|") continue;
    const m = token(tok);
    beat += (m[5] ? parseFloat(m[5]) : 1) * unit * (m[6] ? parseInt(m[6], 10) : 1);
  }
  return beat;
}

// ---------- drums ----------

/**
 * The kit, written as step grids — the notation every drum machine taught us,
 * because it is the one you can read a groove off at a glance:
 *
 *   drums: {
 *     kick:  "x.......x.x..... | x.......x.....x.",
 *     snare: "....X.......X..o",
 *     hat:   "x.x.x.x.x.x.x.x.",
 *     fill:  { snare: "....X...rrrrXXXX", tom: "........1.2.3..." },
 *   }
 *
 * One char per step; the steps in a bar are however many chars it has (16 is
 * sixteenths in 4/4, 12 is sixteenths in 6/8 or eighth triplets in 4/4). A lane
 * shorter than the section repeats, so a one-bar groove covers eight bars.
 *
 *   x hit   X accent   o ghost   f flam   r two-stroke roll   R three-stroke roll
 *   1 2 3   tom/taiko size, high to low (x is the middle one)   . or - rest
 */
export const DRUM_INST: Record<DrumLane, Inst> = {
  kick: "kick", snare: "snare", hat: "hat", open: "openhat",
  crash: "crash", tom: "tom", taiko: "taiko", shaker: "shaker",
};
/** The midi each lane writes. Toms and taiko pick a drum by digit; the voice
 *  reads the pitch as the size of the head. */
const DRUM_MIDI: Record<DrumLane, number> = {
  kick: 36, snare: 38, hat: 42, open: 46, crash: 49, tom: 50, taiko: 38, shaker: 70,
};
const SIZE_MIDI: Partial<Record<DrumLane, [number, number, number]>> = {
  tom: [55, 50, 45],      // high, mid, floor
  taiko: [45, 38, 31],    // shime, nagado, o-daiko
};
const DRUM_CHARS = /^[.\-xXofrR123]*$/;

/** A lane's bars, whitespace dropped. Throws on a character the kit does not read. */
export function laneBars(src: string): string[] {
  const bars = src.split("|").map((s) => s.replace(/\s+/g, "")).filter((s) => s.length > 0);
  for (const b of bars) if (!DRUM_CHARS.test(b)) throw new Error(`bad drum lane: ${b}`);
  return bars;
}

export interface DrumHit { beat: number; inst: Inst; midi: number; vel: number }

/** Deterministic jitter in [0,1): hats that are all exactly the same level are
 *  what make a programmed groove sound like a metronome. */
function jitter(a: number, b: number, c: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Every hit a Drums block makes over `barCount` bars of `beats` each. Pure. */
export function drumHits(d: Drums, barCount: number, beats: number): DrumHit[] {
  const out: DrumHit[] = [];
  const lanes = (Object.keys(DRUM_INST) as DrumLane[]);
  const scale = d.vel ?? 1;
  const every = Math.max(1, d.fill?.every ?? barCount);
  lanes.forEach((lane, li) => {
    const groove = d[lane] ? laneBars(d[lane]!) : [];
    const fill = d.fill?.[lane] ? laneBars(d.fill[lane]!) : null;
    for (let b = 0; b < barCount; b++) {
      const isFill = fill && d.fill && (b + 1) % every === 0;
      const src = isFill ? fill : groove;
      if (!src.length) continue;
      const k = isFill ? Math.floor((b + 1) / every) - 1 : b;
      const cells = src[k % src.length];
      const step = beats / cells.length;
      for (let s = 0; s < cells.length; s++) {
        const ch = cells[s];
        if (ch === "." || ch === "-") continue;
        const at = b * beats + s * step;
        const size = SIZE_MIDI[lane];
        const midi = size && ch >= "1" && ch <= "3" ? size[+ch - 1] : DRUM_MIDI[lane];
        // hats and shaker breathe a little; the rest hit where they are told
        const human = lane === "hat" || lane === "shaker" || lane === "open" ? 0.9 + 0.2 * jitter(b, s, li) : 1;
        const v = (lv: number) => lv * scale * human;
        const inst = DRUM_INST[lane];
        if (ch === "r" || ch === "R") {
          const n = ch === "r" ? 2 : 3;
          for (let i = 0; i < n; i++) out.push({ beat: at + (i * step) / n, inst, midi, vel: v(0.5 + 0.12 * i) });
        } else if (ch === "f") {
          // the grace note sits a hair ahead of the step; never before beat 0
          out.push({ beat: Math.max(0, at - Math.min(step * 0.25, 0.06)), inst, midi, vel: v(0.32) });
          out.push({ beat: at, inst, midi, vel: v(0.85) });
        } else {
          out.push({ beat: at, inst, midi, vel: v(ch === "X" ? 1 : ch === "o" ? 0.38 : 0.8) });
        }
      }
    }
  });
  return out;
}

/** A hits grid as (offset, length, vel) triples, one chord long. */
export function hitSteps(pat: string, unit: number, slice: number): { off: number; len: number; vel: number }[] {
  const cells = pat.replace(/[\s|]+/g, "");
  if (!/^[.\-xXo]*$/.test(cells)) throw new Error(`bad hits pattern: ${pat}`);
  if (!cells.length) return [];
  const out: { off: number; len: number; vel: number }[] = [];
  const n = Math.round(slice / unit);
  let holding = false;   // a `-` only lengthens a hit it directly follows
  for (let i = 0; i < n; i++) {
    const ch = cells[i % cells.length];
    if (ch === "-") { if (holding) out[out.length - 1].len += unit; continue; }
    holding = ch !== ".";
    if (holding) out.push({ off: i * unit, len: unit, vel: ch === "X" ? 1 : ch === "o" ? 0.5 : 0.8 });
  }
  return out;
}

/** Bars implied by a chord string. */
export function chordBars(chords: string): string[][] {
  return chords.trim().split("|").map((g) => g.trim().split(/\s+/).filter(Boolean))
    .filter((g) => g.length > 0);
}

// ---------- compile ----------

const BASS_STEP: Record<BassPat, number[]> = {
  // beat offsets within a bar (scaled to the bar length)
  root: [0],
  swell: [0],
  oct: [0, 0.5],
  pedal: [0, 0.25, 0.5, 0.75],
  walk: [0, 0.25, 0.5, 0.75],
  arp: [0, 0.25, 0.5, 0.75],
  drive: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
  // eighth + two sixteenths on every beat: the cavalry rhythm
  gallop: [0, 0.125, 0.1875, 0.25, 0.375, 0.4375, 0.5, 0.625, 0.6875, 0.75, 0.875, 0.9375],
  sixteen: Array.from({ length: 16 }, (_, i) => i / 16),
  // root on the beat, octave on the off-beat
  pump: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
};

/**
 * The bass steps for one chord slice `beats` long. BASS_STEP divides a slice
 * into even fractions, which is right in 4/4 and for `oct` in 6/8 but lands
 * between the beats of an uneven bar: `oct` put its octave on beat 1.5 of a
 * 3/4 bar and 2.5 of a 5/4 one, ahead of the grouping every drum and lute in
 * those pieces keeps. So a whole odd-meter slice steps on the score's own
 * groupings instead — 3/4 as 1+1+1 (the octave on beat 3), 5/4 as 3+2, 7/8 in
 * eighths as 2+2+3 and 7/8 in quarters (beats 3.5) as 3+2+2, the groupings
 * every odd-meter piece in score/ uses. A piece grouped otherwise writes its
 * bass out as a part. Half a 6/8 bar (a chord change on the second dotted
 * beat) is one 3-eighth group: root a quarter, octave an eighth, not a dotted
 * eighth and a sixteenth. Whole 4/4 and 6/8 bars keep the even split.
 */
const ODD_STEP: Record<string, { oct: number[]; beat: number[] }> = {
  "3": { oct: [0, 2 / 3], beat: [0, 1 / 3, 2 / 3] },
  "5": { oct: [0, 3 / 5], beat: [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5] },
  "7": { oct: [0, 4 / 7], beat: [0, 2 / 7, 4 / 7] },
  "3.5": { oct: [0, 3 / 7], beat: [0, 3 / 7, 5 / 7] },
};
export function bassSteps(pat: BassPat, slice: number, bar = slice): number[] {
  const whole = Math.abs(slice - bar) < 1e-9, half68 = bar === 6 && Math.abs(slice - 3) < 1e-9;
  const odd = whole || half68 ? ODD_STEP[String(slice)] : undefined;
  if (odd && pat === "oct") return odd.oct;
  if (odd && (pat === "pedal" || pat === "walk" || pat === "arp")) return odd.beat;
  return BASS_STEP[pat];
}

function bassMidi(pat: BassPat, i: number, ch: Chord, floor: number): number {
  const root = place(ch.bassPc, floor);
  switch (pat) {
    case "oct": return i === 0 ? root : root + 12;
    case "arp": return root + [0, 12, 7, 12][i % 4];
    case "walk": return root + [0, 7, 12, 7][i % 4];
    case "drive": return i % 4 === 3 ? root + 12 : root;
    case "pump": return i % 2 ? root + 12 : root;
    default: return root;
  }
}

/** Where each form entry starts: the jukebox's section readout and the render
 *  tool's section table both read it. */
export interface Mark { t: number; fi: number; si: number; bars: number }

export interface Compiled {
  events: Ev[];
  loopAt: number;  // seconds — where the loop returns to
  end: number;     // seconds — total length
  marks: Mark[];
  /** seconds per bar */
  bar: number;
}

/**
 * Where the next pass picks up when the event list runs out. Pure, because the
 * loop seam is the one thing in the transport you cannot hear go wrong until
 * three minutes in: the first event of the new pass has to land at exactly
 * `origin + end`, or every loop drifts.
 */
export function loopAdvance(c: Compiled, origin: number): { origin: number; cursor: number } | null {
  const span = c.end - c.loopAt;
  if (span <= 0) return null;
  const cursor = c.events.findIndex((e) => e.t >= c.loopAt);
  if (cursor < 0) return null;
  return { origin: origin + span, cursor };
}

export function compile(song: Song): Compiled {
  const beats = song.beats ?? 4;
  const spb = 60 / song.bpm;
  const swing = song.swing ?? 0;
  const events: Ev[] = [];
  const marks: Mark[] = [];
  let t = 0;
  let loopAt = 0;

  const push = (beat: number, inst: Inst, midi: number, lenBeats: number, vel: number) => {
    // swing pushes anything landing off the beat a little late
    const frac = beat % 1;
    const late = swing > 0 && Math.abs(frac - 0.5) < 1e-6 ? swing * spb * 0.5 : 0;
    events.push({ t: t + beat * spb + late, inst, midi, dur: lenBeats * spb, vel });
  };

  song.form.forEach((si, fi) => {
    if (fi === (song.loopFrom ?? 0)) loopAt = t;
    const sec = song.sections[si];
    if (!sec) throw new Error(`form references missing section ${si}`);
    const bars = chordBars(sec.chords);
    marks.push({ t, fi, si, bars: bars.length });

    // ---- chord-derived voices ----
    bars.forEach((group, bi) => {
      const barBeat = bi * beats;
      const slice = beats / group.length;
      group.forEach((name, gi) => {
        const ch = parseChord(name);
        const at = barBeat + gi * slice;

        if (sec.pad !== null) {
          const p = sec.pad ?? { inst: "strings" as Inst };
          const floor = 12 * ((p.oct ?? 3) + 1);
          // rootless-ish: upper tones low, root lifted an octave — keeps the
          // bass register clear for the actual bass line
          const voiced = [...ch.tones.slice(1).map((s) => place(ch.pc + s, floor)), place(ch.pc, floor + 12)];
          for (const m of voiced) push(at, p.inst, m, slice, (p.vel ?? 1) * 0.55);
        }

        if (sec.bass !== null) {
          const b = sec.bass ?? { pat: "root" as BassPat };
          const floor = 12 * ((b.oct ?? 2) + 1);
          const steps = bassSteps(b.pat, slice, beats);
          steps.forEach((f, i) => {
            // to the next step, so an uneven pattern (gallop) gets uneven notes
            const len = ((steps[i + 1] ?? 1) - f) * slice;
            push(at + f * slice, b.inst ?? "bass", bassMidi(b.pat, i, ch, floor), len, (b.vel ?? 1) * 0.9);
          });
        }

        if (sec.hits) {
          const h = sec.hits;
          const floor = 12 * ((h.oct ?? 4) + 1);
          // close: the chord's own tones stacked upward from the root; power:
          // root, fifth, octave, which is what a brass section punches
          const tones = h.voicing === "power" ? [0, 7, 12] : ch.tones.slice(0, 4);
          const root = place(ch.pc, floor);
          for (const s of hitSteps(h.pat, h.unit ?? 0.5, slice)) {
            for (const tone of tones) push(at + s.off, h.inst, root + tone, s.len, (h.vel ?? 1) * s.vel * 0.6);
          }
        }

        if (sec.arp) {
          const a = sec.arp;
          const floor = 12 * ((a.oct ?? 4) + 1);
          const idx = a.pat.trim().split(/\s+/).filter(Boolean);
          const u = a.unit ?? 0.5;
          idx.forEach((s, i) => {
            const off = i * u;
            if (off >= slice) return;
            if (s === "." || s === "r") return;
            const k = parseInt(s, 10);
            if (Number.isNaN(k)) return;
            const n = ch.tones.length;
            const m = place(ch.pc + ch.tones[k % n], floor) + 12 * Math.floor(k / n);
            push(at + off, a.inst, m, u * 1.6, (a.vel ?? 1) * 0.5);
          });
        }
      });
    });

    // ---- written parts ----
    for (const part of [sec.lead, sec.counter, ...(sec.parts ?? [])]) {
      if (!part) continue;
      for (const nt of parse(part.n, part.unit ?? 1, beats)) {
        push(nt.beat, part.inst, nt.midi + 12 * (part.oct ?? 0), nt.beats, (part.vel ?? 1) * (nt.vel ?? 1));
      }
    }

    // ---- percussion ----
    // Placed as fractions of the bar rather than on integer beats, so the 6/8
    // town themes and the Thornwild's 5/4 get the same feel as the 4/4 pieces
    // instead of a hit on every eighth.
    const barCount = bars.length;
    const perc = sec.perc ?? "none";
    for (let b = 0; b < barCount; b++) {
      const at = b * beats;
      const q = beats / 4;
      if (perc === "frame") { push(at, "drum", 45, q, 0.85); push(at + beats / 2, "drum", 41, q, 0.55); }
      if (perc === "heart") { push(at, "drum", 45, q, 0.8); push(at + beats * 0.14, "drum", 41, q, 0.4); }
      if (perc === "pulse") [0, 0.25, 0.5, 0.75].forEach((fr, i) => push(at + fr * beats, "shaker", 70, q, i % 2 ? 0.35 : 0.65));
      if (perc === "drive") {
        // kick on 1 and 3, backbeat on 2 and 4, hats on the eighths
        [0, 0.5].forEach((fr) => push(at + fr * beats, "drum", 38, q * 0.6, 0.95));
        [0.25, 0.75].forEach((fr) => push(at + fr * beats, "drum", 58, q * 0.5, 0.8));
        push(at + 0.375 * beats, "drum", 38, q * 0.4, 0.45);   // pickup into the backbeat
        for (let k = 0; k < 8; k++) push(at + (k / 8) * beats, "shaker", 70, q * 0.4, k % 2 ? 0.3 : 0.55);
      }
    }
    if (sec.drums) {
      // a kit hit's length is only a hint to the voice (an open hat rings to
      // the next closed one); give each a sixteenth
      for (const h of drumHits(sec.drums, barCount, beats)) push(h.beat, h.inst, h.midi, 0.25, h.vel);
    }

    t += barCount * beats * spb;
  });

  // stable: two events at one instant keep their written order (kick before
  // snare before hat), which keeps renders reproducible
  events.sort((a, b) => a.t - b.t);
  return { events, loopAt, end: t, marks, bar: beats * spb };
}

/**
 * The events of `c` as heard from song time `from` until `until`, with the loop
 * unrolled: `at` is the time on that continuous timeline, so after the first
 * pass it keeps counting past `end`. The offline renderer schedules from this;
 * it is the transport's walk without a clock.
 */
export function unroll(c: Compiled, from: number, until: number): { ev: Ev; at: number }[] {
  const out: { ev: Ev; at: number }[] = [];
  let origin = 0;
  let cursor = 0;
  let guard = 0;
  while (guard++ < 1e6) {
    if (cursor >= c.events.length) {
      const next = loopAdvance(c, origin);
      if (!next) break;
      origin = next.origin;
      cursor = next.cursor;
      continue;
    }
    const ev = c.events[cursor++];
    const at = origin + ev.t;
    if (at >= until) break;
    if (at >= from) out.push({ ev, at });
  }
  return out;
}

/** What each voice costs the audio thread: the nodes it builds and how long it
 *  sounds for a written length (seconds). Mirrors the voice functions below;
 *  read by voiceLoad() for the render tool's CPU line, never at runtime. */
const VOICE_COST: Record<Inst, [nodes: number, life: (d: number) => number]> = {
  piano: [13, (d) => Math.min(3.4, Math.max(d, 0.35) + 1.3)],
  strings: [10, (d) => d + 0.55], choir: [16, (d) => d + 0.8],
  harp: [2, (d) => Math.min(3.1, Math.max(d, 0.4) + 1.4)], flute: [10, (d) => d + 0.22],
  bell: [4, () => 4.2], glass: [4, () => 3.2], bass: [8, (d) => d * 0.9 + 0.16],
  pad: [10, (d) => d + 1.5], drum: [7, () => 0.34], shaker: [3, () => 0.1],
  brass: [6, (d) => d + 0.14], horn: [6, (d) => d + 0.3], stab: [5, (d) => Math.min(Math.max(d * 0.85, 0.07), 0.45) + 0.07],
  spiccato: [7, (d) => Math.min(Math.max(d * 0.9, 0.08), 0.22) + 0.06], pizz: [3, () => 0.6],
  reed: [6, (d) => d + 0.12], lute: [2, (d) => Math.min(2.4, Math.max(d, 0.3) + 1)], synbass: [5, (d) => Math.max(d * 0.85, 0.06) + 0.05],
  timpani: [5, (d) => (d < 0.3 ? 0.7 : 2.2)], taiko: [5, () => 1.2], tom: [5, () => 0.5],
  kick: [5, () => 0.42], snare: [5, () => 0.2], hat: [3, () => 0.05], openhat: [4, () => 0.42], crash: [3, () => 2.2],
};

export interface Load { peakNotes: number; peakNodes: number; peakAt: number; notesPerSec: number; nodesPerSec: number }

/** Concurrent voices and nodes over one pass, by sweep line. A proxy for CPU
 *  that can be compared between pieces without a profiler. */
export function voiceLoad(c: Compiled): Load {
  const edges: [number, number, number][] = [];
  let nodes = 0;
  for (const e of c.events) {
    const [n, life] = VOICE_COST[e.inst];
    edges.push([e.t, 1, n], [e.t + life(e.dur), -1, -n]);
    nodes += n;
  }
  // ends before starts at one instant, so a note handing over to the next is not double-counted
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let notes = 0, live = 0, peakNotes = 0, peakNodes = 0, peakAt = 0;
  for (const [t, dn, dk] of edges) {
    notes += dn; live += dk;
    if (live > peakNodes) { peakNodes = live; peakAt = t; }
    peakNotes = Math.max(peakNotes, notes);
  }
  const span = Math.max(c.end, 1e-6);
  return { peakNotes, peakNodes, peakAt, notesPerSec: c.events.length / span, nodesPerSec: nodes / span };
}

// ---------- audio graph ----------

// BaseAudioContext rather than AudioContext so the same voices can be pointed
// at an OfflineAudioContext — renderSong() below, which is how the score gets
// measured by something other than ears.
let ctx: BaseAudioContext | null = null;
let musicGain: GainNode;        // our own fader, independent of the user's volume
let chWet: GainNode, chMid: GainNode, chDry: GainNode;
let convRef: ConvolverNode | null = null;
const irCache = new Map<string, AudioBuffer>();   // by `${sampleRate}:${seconds}`
let instOut = new Map<Inst, GainNode>();
/** The current piece's own per-instrument gains, between its voices and instOut.
 *  A piece that is switched away from is faded on its take and cut loose, so
 *  its still-sounding notes (a two-bar pad, a held horn) cannot come back up
 *  under the next piece when musicGain rises again. */
let take = new Map<Inst, GainNode>();
/** A ringing open hat, so the next closed one can choke it the way a foot does. */
let openHat: GainNode | null = null;

interface InstCfg { gain: number; pan: number; ch: "wet" | "mid" | "dry" }
/** Levels for the 2026-10-11 voices were set by offline render (integrated
 *  LUFS, each voice alone on the same line at the same velocity): brass and reed
 *  sit with piano and flute as leads, horn a little behind, a single stab note
 *  4 LU under a lead so a chord of them lands level with it, spiccato eighths
 *  6 LU under piano eighths (an ostinato is a bed), synbass 2 LU under bass,
 *  and the kit's drive groove ~9 LU over the old `perc: "drive"`, because the
 *  old one was never loud enough to drive anything. `--palette all` on
 *  tools/music/render.mjs re-measures them in context. */
export const INST: Record<Inst, InstCfg> = {
  piano:   { gain: 0.34, pan: -0.10, ch: "mid" },
  strings: { gain: 0.15, pan:  0.10, ch: "wet" },
  choir:   { gain: 0.13, pan:  0.00, ch: "wet" },
  harp:    { gain: 0.30, pan:  0.22, ch: "mid" },
  flute:   { gain: 0.22, pan: -0.18, ch: "wet" },
  bell:    { gain: 0.20, pan:  0.26, ch: "wet" },
  glass:   { gain: 0.20, pan: -0.24, ch: "wet" },
  bass:    { gain: 0.34, pan:  0.00, ch: "dry" },
  pad:     { gain: 0.13, pan:  0.00, ch: "wet" },
  drum:    { gain: 0.30, pan:  0.00, ch: "dry" },
  shaker:  { gain: 0.13, pan:  0.30, ch: "mid" },
  brass:    { gain: 0.33, pan: -0.14, ch: "mid" },
  horn:     { gain: 0.17, pan:  0.20, ch: "wet" },
  stab:     { gain: 0.23, pan:  0.04, ch: "mid" },
  spiccato: { gain: 0.50, pan:  0.24, ch: "mid" },
  pizz:     { gain: 1.50, pan:  0.16, ch: "mid" },
  reed:     { gain: 0.26, pan: -0.20, ch: "wet" },
  lute:     { gain: 0.40, pan: -0.22, ch: "mid" },
  synbass:  { gain: 0.52, pan:  0.00, ch: "dry" },
  timpani:  { gain: 0.66, pan: -0.16, ch: "mid" },
  taiko:    { gain: 0.48, pan:  0.00, ch: "mid" },
  kick:     { gain: 0.50, pan:  0.00, ch: "dry" },
  snare:    { gain: 0.52, pan:  0.04, ch: "dry" },
  hat:      { gain: 0.33, pan:  0.24, ch: "dry" },
  openhat:  { gain: 0.20, pan:  0.24, ch: "dry" },
  tom:      { gain: 0.30, pan: -0.06, ch: "dry" },
  crash:    { gain: 0.14, pan: -0.28, ch: "mid" },
};

/** A seeded generator for the noise in the reverb tail, the plucked strings and
 *  the noise buffer. Each buffer seeds its own, so the same piece renders to the
 *  same samples every time and in any order — which is what lets a render be
 *  compared with the last one (tools/music/render.mjs). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Noise burst under an exponential decay, one-pole lowpassed so the tail is
 *  warm rather than the hissy white smear a raw random buffer gives you. */
function makeIR(c: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = c.sampleRate;
  const pre = Math.floor(rate * 0.018);
  const len = Math.floor(rate * seconds) + pre;
  const buf = c.createBuffer(2, len, rate);
  const rnd = seeded(Math.round(seconds * 1000));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const u = (i - pre) / (len - pre);
      lp += 0.34 * ((rnd() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - u, 2.4);
    }
    // a few early reflections give the tail somewhere to have come from
    [0.011, 0.019, 0.031, 0.047, 0.061].forEach((s, k) => {
      const i = pre + Math.floor(s * rate) + (ch ? 37 : 0);
      if (i < len) d[i] += (k % 2 ? -0.6 : 0.6) / (k + 1);
    });
  }
  return buf;
}

function channel(c: BaseAudioContext, wet: number, conv: ConvolverNode, out: AudioNode): GainNode {
  const g = c.createGain();
  const dry = c.createGain(); dry.gain.value = 1 - wet * 0.5;
  const send = c.createGain(); send.gain.value = wet;
  g.connect(dry); dry.connect(out);
  g.connect(send); send.connect(conv);
  return g;
}

export function initMusic(c: BaseAudioContext, out: AudioNode): void {
  ctx = c;
  openHat = null;
  musicGain = c.createGain();
  musicGain.gain.value = 1;

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 3;
  comp.attack.value = 0.02; comp.release.value = 0.28;
  // A safety net after the glue compressor, for the battle pieces, where a
  // crash, a taiko and a brass stab on one downbeat can sum past full scale.
  // A static soft-clip curve rather than a second DynamicsCompressor: the
  // compressor adds automatic makeup gain even below its threshold (measured:
  // +1.8dB on every old piece), and this is exactly linear below -1.5dBFS,
  // where every one of the 27 old pieces peaks (loudest: -1.7dBFS), so they
  // come out bit-identical. The x0.5 / x2 around it give the curve headroom
  // to bend inputs up to +6dBFS instead of hard-clipping them at the table's edge.
  const pre = c.createGain(); pre.gain.value = 0.5;
  const safe = c.createWaveShaper(); safe.curve = safetyCurve(); safe.oversample = "none";
  const post = c.createGain(); post.gain.value = 2;
  comp.connect(pre); pre.connect(safe); safe.connect(post); post.connect(musicGain); musicGain.connect(out);

  const conv = c.createConvolver();
  convRef = conv;
  setSpace(2.6);
  const wetLvl = c.createGain(); wetLvl.gain.value = 0.9;
  conv.connect(wetLvl); wetLvl.connect(comp);

  chWet = channel(c, 0.85, conv, comp);
  chMid = channel(c, 0.45, conv, comp);
  chDry = channel(c, 0.16, conv, comp);

  // a fresh map rather than clear(): renderSong() swaps the live graph out and
  // back, and the live one must survive with its routing intact
  instOut = new Map();
  take = new Map();
  (Object.keys(INST) as Inst[]).forEach((inst) => {
    const cfg = INST[inst];
    const g = c.createGain(); g.gain.value = cfg.gain;
    const p = c.createStereoPanner(); p.pan.value = cfg.pan;
    g.connect(p);
    p.connect(cfg.ch === "wet" ? chWet : cfg.ch === "mid" ? chMid : chDry);
    instOut.set(inst, g);
  });
}

let safeCurve: Float32Array<ArrayBuffer> | null = null;
/** Identity below K, tanh into a ceiling just under full scale above
 *  it; indexed over [-1, 1] standing for inputs of [-2, 2]. K is mirrored by
 *  music_analysis.ts SAFE_KNEE, which counts the samples that reach it. */
function safetyCurve(): Float32Array<ArrayBuffer> {
  if (safeCurve) return safeCurve;
  const K = 0.84;   // -1.5 dBFS
  const n = 8193;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = 2 * ((2 * i) / (n - 1) - 1);
    const a = Math.abs(x);
    const y = a <= K ? a : K + (1 - K) * Math.tanh((a - K) / (1 - K));
    out[i] = (Math.sign(x) * y) / 2;
  }
  safeCurve = out;
  return out;
}

/** Resize the room. Zones that want a cathedral get one; the Hush gets a canyon. */
function setSpace(seconds: number): void {
  if (!ctx || !convRef) return;
  const len = Math.round(seconds * 10) / 10;
  const key = `${ctx.sampleRate}:${len}`;
  let ir = irCache.get(key);
  if (!ir) { ir = makeIR(ctx, len); irCache.set(key, ir); }
  convRef.buffer = ir;
}

// ---------- voices ----------

// A stopped node is only collectable once disconnected — same rule the SFX side
// follows. Music is denser than SFX (a pad chord is a dozen nodes a bar), so the
// last source to finish tears the whole voice down.
function sweep(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    try { src.disconnect(); } catch { /* already gone */ }
    for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
  };
}

function adsr(g: GainNode, t: number, peak: number, a: number, d: number, s: number, hold: number, r: number): number {
  const end = t + Math.max(a + d, hold);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.linearRampToValueAtTime(peak * s, t + a + d);
  g.gain.setValueAtTime(peak * s, end);
  g.gain.linearRampToValueAtTime(0.0001, end + r);
  return end + r;
}

function vPiano(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = "lowpass"; f.Q.value = 0.7;
  const bright = 1400 + 3600 * vel;
  f.frequency.setValueAtTime(bright, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 1.8);
  const amp = c.createGain();
  const life = Math.min(3.4, Math.max(dur, 0.35) + 1.3);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(vel * 0.22, t + 0.45);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
  f.connect(amp); amp.connect(out);

  const nodes: AudioNode[] = [f, amp];
  const oscs: OscillatorNode[] = [];
  ([[1, 1], [2, 0.3], [3, 0.11], [4.02, 0.05]] as const).forEach(([m, a]) => {
    const o = c.createOscillator();
    o.type = m === 1 ? "triangle" : "sine";
    o.frequency.value = freq * m;
    o.detune.value = (m - 1) * 3;
    const g = c.createGain(); g.gain.value = a;
    o.connect(g); g.connect(f);
    nodes.push(o, g);
    o.start(t); o.stop(t + life + 0.05);
    oscs.push(o);
  });
  // hammer
  const nb = c.createBufferSource();
  nb.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = freq * 3; nf.Q.value = 1.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(vel * 0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  nb.connect(nf); nf.connect(ng); ng.connect(out);
  nodes.push(nb, nf, ng);
  nb.start(t); nb.stop(t + 0.08);
  sweep(oscs[oscs.length - 1], nodes);
}

function vStrings(freq: number, t: number, dur: number, vel: number, out: AudioNode, choir = false): void {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = "lowpass"; f.Q.value = 0.9;
  f.frequency.setValueAtTime(420, t);
  f.frequency.linearRampToValueAtTime(1500 + 1600 * vel, t + Math.min(1.0, dur * 0.7));
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.5, choir ? 0.42 : 0.26, 0.3, 0.85, dur, choir ? 0.8 : 0.55);
  f.connect(amp);

  const nodes: AudioNode[] = [f, amp];
  if (choir) {
    // three parallel formants turn a saw stack into a vowel; the direct path
    // stays quiet or it just sounds like a saw stack with a hat on
    const dir = c.createGain(); dir.gain.value = 0.18;
    amp.connect(dir); dir.connect(out);
    nodes.push(dir);
    ([[620, 3.4, 1.6], [1180, 5, 1.0], [2600, 7, 0.45]] as const).forEach(([fr, q, a]) => {
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fr; bp.Q.value = q;
      const g = c.createGain(); g.gain.value = a;
      amp.connect(bp); bp.connect(g); g.connect(out);
      nodes.push(bp, g);
    });
  } else {
    amp.connect(out);
  }
  const vib = c.createOscillator(); vib.frequency.value = choir ? 4.4 : 5.2;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(freq * 0.007, t + 0.85);
  vib.connect(vg);
  nodes.push(vib, vg);
  vib.start(t); vib.stop(off + 0.05);

  let last: OscillatorNode = vib;
  [-8, 0, 8].forEach((det) => {
    const o = c.createOscillator();
    o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
    vg.connect(o.frequency);
    const g = c.createGain(); g.gain.value = 0.34;
    o.connect(g); g.connect(f);
    nodes.push(o, g);
    o.start(t); o.stop(off + 0.05);
    last = o;
  });
  sweep(last, nodes);
}

function vFlute(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.6, 0.09, 0.12, 0.9, dur, 0.22);
  amp.connect(out);
  const nodes: AudioNode[] = [amp];

  const vib = c.createOscillator(); vib.frequency.value = 5.6;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.setValueAtTime(0, t + 0.22);
  vg.gain.linearRampToValueAtTime(freq * 0.009, t + 0.75);
  vib.connect(vg);
  nodes.push(vib, vg);
  vib.start(t); vib.stop(off + 0.05);

  const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq * 2; o2.detune.value = 4;
  const g2 = c.createGain(); g2.gain.value = 0.12;
  vg.connect(o.frequency);
  o.connect(amp); o2.connect(g2); g2.connect(amp);
  nodes.push(o, o2, g2);
  o.start(t); o.stop(off + 0.05); o2.start(t); o2.stop(off + 0.05);

  // breath
  const nb = c.createBufferSource(); nb.buffer = noiseBuf(c); nb.loop = true;
  const hp = c.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = freq * 2.2; hp.Q.value = 0.8;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.linearRampToValueAtTime(vel * 0.05, t + 0.07);
  ng.gain.linearRampToValueAtTime(0.0001, off);
  nb.connect(hp); hp.connect(ng); ng.connect(out);
  nodes.push(nb, hp, ng);
  nb.start(t); nb.stop(off + 0.05);
  sweep(o, nodes);
}

function vBell(freq: number, t: number, dur: number, vel: number, out: AudioNode, glassy: boolean): void {
  const c = ctx!;
  const amp = c.createGain();
  const life = glassy ? 3.2 : 4.2;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel * 0.5, t + (glassy ? 0.28 : 0.008));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
  amp.connect(out);

  // FM: an inharmonic modulator with a decaying index is what makes metal
  const car = c.createOscillator(); car.type = "sine"; car.frequency.value = freq;
  const mod = c.createOscillator(); mod.type = "sine"; mod.frequency.value = freq * (glassy ? 2.01 : 3.51);
  const mg = c.createGain();
  mg.gain.setValueAtTime(freq * (glassy ? 1.2 : 3.4), t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + (glassy ? 1.4 : 0.7));
  mod.connect(mg); mg.connect(car.frequency);
  car.connect(amp);
  car.start(t); car.stop(t + life + 0.05);
  mod.start(t); mod.stop(t + life + 0.05);
  sweep(car, [amp, mod, mg]);
}

const ksCache = new Map<number, AudioBuffer>();
/** Karplus-Strong rendered into a buffer. WebAudio's own delay loops clamp to a
 *  128-sample minimum, which detunes anything above ~340Hz; doing the ring
 *  buffer in JS keeps the pitch honest and lets us cache per note. */
function ksBuffer(c: BaseAudioContext, midi: number, lute = false): AudioBuffer {
  // the lute's strings live beside the harp's under their own keys
  const key = lute ? -1 - midi : midi;
  const hit = ksCache.get(key);
  if (hit) return hit;
  const rate = c.sampleRate;
  const n = Math.max(2, Math.round(rate / midiToFreq(midi)));
  const len = Math.floor(rate * (lute ? 2.6 : 3.2));
  const buf = c.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(n);
  let lp = 0;
  const rnd = seeded(key + 1000);
  for (let i = 0; i < n; i++) {
    // a softer pick than white noise; the lute's plectrum is brighter
    lp += (lute ? 0.85 : 0.5) * ((rnd() * 2 - 1) - lp);
    ring[i] = lp;
  }
  if (lute) {
    // plucked a fifth of the way along: subtracting the excitation from a
    // shifted copy of itself is the comb a pluck position makes
    const shift = Math.max(1, Math.round(n / 5));
    const src = ring.slice();
    for (let i = 0; i < n; i++) ring[i] = src[i] - src[(i + shift) % n];
  }
  const damp = lute ? 0.993 : 0.9965;
  let p = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[p];
    d[i] = cur;
    ring[p] = (cur + ring[(p + 1) % n]) * 0.5 * damp;
    p = (p + 1) % n;
  }
  ksCache.set(key, buf);
  return buf;
}

function vHarp(midi: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = ksBuffer(c, Math.round(midi));
  src.playbackRate.value = Math.pow(2, (midi - Math.round(midi)) / 12);
  const g = c.createGain();
  const life = Math.min(3.1, Math.max(dur, 0.4) + 1.4);
  g.gain.setValueAtTime(vel * 0.8, t);
  g.gain.setValueAtTime(vel * 0.8, t + life - 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + life);
  src.connect(g); g.connect(out);
  src.start(t); src.stop(t + life);
  sweep(src, [g]);
}

function vBass(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 340; f.Q.value = 1.1;
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.7, 0.012, 0.14, 0.7, dur * 0.9, 0.16);
  f.connect(amp); amp.connect(out);
  const nodes: AudioNode[] = [f, amp];
  const oscs: OscillatorNode[] = [];
  ([["triangle", 1, 1], ["sine", 1, 0.6], ["sawtooth", 1, 0.16]] as const).forEach(([ty, m, a]) => {
    const o = c.createOscillator(); o.type = ty; o.frequency.value = freq * m;
    const g = c.createGain(); g.gain.value = a;
    o.connect(g); g.connect(f);
    nodes.push(o, g);
    o.start(t); o.stop(off + 0.05);
    oscs.push(o);
  });
  sweep(oscs[oscs.length - 1], nodes);
}

function vPad(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.7;
  f.frequency.setValueAtTime(300, t);
  f.frequency.linearRampToValueAtTime(900, t + 1.6);
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.42, 1.1, 0.4, 0.85, dur, 1.5);
  f.connect(amp); amp.connect(out);
  const nodes: AudioNode[] = [f, amp];
  const oscs: OscillatorNode[] = [];
  [-11, -4, 4, 11].forEach((det) => {
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
    const g = c.createGain(); g.gain.value = 0.26;
    o.connect(g); g.connect(f);
    nodes.push(o, g);
    o.start(t); o.stop(off + 0.05);
    oscs.push(o);
  });
  sweep(oscs[oscs.length - 1], nodes);
}

let noiseCache: AudioBuffer | null = null;
function noiseBuf(c: BaseAudioContext): AudioBuffer {
  if (noiseCache) return noiseCache;
  const len = c.sampleRate * 2;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  const rnd = seeded(7);
  for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  noiseCache = b;
  return b;
}

/** One membrane, two characters: low notes read as a drum, anything from midi 50
 *  up flips to a noise-led crack so a battle track can have a backbeat. */
function vDrum(freq: number, t: number, vel: number, out: AudioNode, midi: number): void {
  const c = ctx!;
  const crack = midi >= 50;
  const bodyDecay = crack ? 0.13 : 0.34;
  const o = c.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(freq * 1.9, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + (crack ? 0.04 : 0.09));
  const g = c.createGain();
  g.gain.setValueAtTime(vel * (crack ? 0.4 : 0.8), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + bodyDecay);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + bodyDecay + 0.06);

  const nb = c.createBufferSource(); nb.buffer = noiseBuf(c);
  const nf = c.createBiquadFilter();
  nf.type = crack ? "bandpass" : "lowpass";
  nf.frequency.value = crack ? 2100 : 900;
  nf.Q.value = crack ? 0.9 : 1;
  const ng = c.createGain();
  ng.gain.setValueAtTime(vel * (crack ? 0.75 : 0.3), t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + (crack ? 0.17 : 0.1));
  nb.connect(nf); nf.connect(ng); ng.connect(out);
  nb.start(t); nb.stop(t + 0.22);
  sweep(o, [g, nf, ng]);
}

function vShaker(t: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const nb = c.createBufferSource(); nb.buffer = noiseBuf(c);
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  nb.connect(hp); hp.connect(g); g.connect(out);
  nb.start(t); nb.stop(t + 0.1);
  sweep(nb, [hp, g]);
}

// ---------- the 2026-10-11 voices ----------
//
// Node budget, because a battle theme at 170 bpm starts several hundred of these
// a second: every voice here is at most eight nodes, the drums three to five,
// partials ride one PeriodicWave oscillator instead of a sine-and-gain each, and
// every noise burst reads the one shared buffer at a moving offset (so a run of
// hats is not the same 40ms of noise forty times).

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function wave(c: BaseAudioContext, key: string, partials: number[]): PeriodicWave {
  let m = waveCache.get(c);
  if (!m) { m = new Map(); waveCache.set(c, m); }
  let w = m.get(key);
  if (!w) {
    // sine terms, not cosine: every partial starts at zero, so no click
    w = c.createPeriodicWave(new Float32Array(partials.length), new Float32Array(partials));
    m.set(key, w);
  }
  return w;
}
// index n is the nth harmonic of the oscillator's frequency
const W_TIMPANI = [0, 0, 1, 0.45, 0.32, 0.16, 0.07];  // played at f/2: modes 1, 1.5, 2, 2.5, 3
const W_MEMBRANE = [0, 1, 0.22, 0.07];
const W_REED = [0, 1, 0.5, 0.72, 0.28, 0.42, 0.16, 0.22, 0.08, 0.1];

let noisePos = 0;
/** Where the next burst starts reading the shared noise buffer. Deterministic,
 *  so two renders of the same piece are the same file. */
function noiseAt(): number { noisePos = (noisePos + 0.3719) % 1.4; return noisePos; }

function noiseBurst(c: BaseAudioContext, t: number, type: BiquadFilterType, fr: number, q: number,
  level: number, decay: number, out: AudioNode): AudioScheduledSourceNode {
  const nb = c.createBufferSource(); nb.buffer = noiseBuf(c);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  nb.connect(f); f.connect(g); g.connect(out);
  nb.start(t, noiseAt()); nb.stop(t + decay + 0.02);
  sweep(nb, [f, g]);
  return nb;
}

/** Delayed vibrato onto `targets`' frequency: a held brass or reed note that is
 *  dead straight for its whole length reads as a synth, not a player. */
function vibrato(c: BaseAudioContext, t: number, off: number, rate: number, depth: number, delay: number,
  targets: OscillatorNode[], nodes: AudioNode[]): void {
  const vib = c.createOscillator(); vib.frequency.value = rate;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.setValueAtTime(0, t + delay);
  vg.gain.linearRampToValueAtTime(depth, t + delay + 0.45);
  vib.connect(vg);
  for (const o of targets) vg.connect(o.frequency);
  vib.start(t); vib.stop(off + 0.05);
  nodes.push(vib, vg);
}

/**
 * Brass: detuned saws through a lowpass whose cutoff jumps open on the attack
 * and settles back — the "bite" is the filter, not the level. A short scoop up
 * into pitch is the lip. `stab` is the ensemble hit: three saws, a faster
 * bite, and a decay instead of a sustain, so a chord of them punches and gets
 * out of the way.
 */
function vBrass(freq: number, t: number, dur: number, vel: number, out: AudioNode, stab: boolean): void {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = stab ? 2.0 : 1.3;
  const open = Math.min(freq * (3 + 5 * vel), 7500);
  const settle = Math.max(Math.min(freq * (1.6 + 1.8 * vel), 4200), freq * 1.2);
  const bite = stab ? 0.012 : 0.035;
  f.frequency.setValueAtTime(freq * 0.9, t);
  f.frequency.linearRampToValueAtTime(open, t + bite);
  f.frequency.exponentialRampToValueAtTime(settle, t + bite + (stab ? 0.12 : 0.3));
  const amp = c.createGain();
  let off: number;
  if (stab) {
    const len = Math.min(Math.max(dur * 0.85, 0.07), 0.45);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vel * 0.5, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(vel * 0.2, t + len);
    amp.gain.linearRampToValueAtTime(0.0001, t + len + 0.07);
    off = t + len + 0.07;
  } else {
    off = adsr(amp, t, vel * 0.5, 0.03, 0.2, 0.78, dur, 0.14);
    // a long note swells: the bell opens again across the hold
    if (dur > 0.8) f.frequency.linearRampToValueAtTime(Math.min(settle * 1.5, 6000), t + dur);
  }
  f.connect(amp); amp.connect(out);
  const nodes: AudioNode[] = [f, amp];
  const oscs: OscillatorNode[] = [];
  for (const det of stab ? [-9, 0, 9] : [-5, 5]) {
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq;
    o.detune.setValueAtTime(det - (stab ? 18 : 35), t);
    o.detune.linearRampToValueAtTime(det, t + (stab ? 0.02 : 0.05));
    o.connect(f);
    o.start(t); o.stop(off + 0.05);
    nodes.push(o); oscs.push(o);
  }
  if (!stab && dur > 0.9) vibrato(c, t, off, 5.0, freq * 0.004, 0.35, oscs, nodes);
  sweep(oscs[oscs.length - 1], nodes);
}

/** French horn: the brass recipe with the bite taken out — a saw and a triangle
 *  under a low, slow filter. The warm answer to a trumpet line. */
function vHorn(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.6;
  f.frequency.setValueAtTime(freq * 1.2, t);
  f.frequency.linearRampToValueAtTime(Math.min(freq * (2 + 2.2 * vel), 2600), t + 0.14);
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.55, 0.07, 0.2, 0.85, dur, 0.3);
  f.connect(amp); amp.connect(out);
  const nodes: AudioNode[] = [f, amp];
  const oscs: OscillatorNode[] = [];
  ([["sawtooth", -4], ["triangle", 4]] as const).forEach(([ty, det]) => {
    const o = c.createOscillator(); o.type = ty; o.frequency.value = freq; o.detune.value = det;
    o.connect(f);
    o.start(t); o.stop(off + 0.05);
    nodes.push(o); oscs.push(o);
  });
  if (dur > 0.7) vibrato(c, t, off, 4.6, freq * 0.003, 0.3, oscs, nodes);
  sweep(oscs[1], nodes);
}

/** Spiccato: the bow bounced off the string. Short whatever the written length,
 *  so a run of eighths is an ostinato and not a smear. */
function vSpiccato(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const life = Math.min(Math.max(dur * 0.9, 0.08), 0.22);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 1;
  f.frequency.setValueAtTime(Math.min(freq * (4 + 3 * vel), 7000), t);
  f.frequency.exponentialRampToValueAtTime(freq * 2, t + life);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel * 0.6, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + life + 0.06);
  f.connect(amp); amp.connect(out);
  const nodes: AudioNode[] = [f, amp];
  let last: OscillatorNode | null = null;
  for (const det of [-7, 7]) {
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
    o.connect(f);
    o.start(t); o.stop(t + life + 0.1);
    nodes.push(o); last = o;
  }
  // the bow's scratch on the attack
  noiseBurst(c, t, "bandpass", Math.min(freq * 4, 9000), 1.5, vel * 0.1, 0.03, out);
  sweep(last!, nodes);
}

/** Pizzicato: the harp's plucked string, damped hard and darkened — gut, not wire. */
function vPizz(midi: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const freq = midiToFreq(midi);
  const src = c.createBufferSource();
  src.buffer = ksBuffer(c, Math.round(midi));
  src.playbackRate.value = Math.pow(2, (midi - Math.round(midi)) / 12);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(freq * 5, 5000); lp.Q.value = 0.7;
  const g = c.createGain();
  const life = Math.min(0.7, 0.2 + 60 / freq);
  g.gain.setValueAtTime(vel * 0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + life);
  src.connect(lp); lp.connect(g); g.connect(out);
  src.start(t); src.stop(t + life + 0.02);
  sweep(src, [lp, g]);
}

/** Lute: Karplus-Strong with a brighter pick, plucked a fifth of the way along
 *  (which notches out every fifth harmonic, the way a real pluck position does). */
function vLute(midi: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = ksBuffer(c, Math.round(midi), true);
  src.playbackRate.value = Math.pow(2, (midi - Math.round(midi)) / 12);
  const g = c.createGain();
  const life = Math.min(2.4, Math.max(dur, 0.3) + 1.0);
  g.gain.setValueAtTime(vel * 0.75, t);
  g.gain.setValueAtTime(vel * 0.75, t + life - 0.25);
  g.gain.linearRampToValueAtTime(0.0001, t + life);
  src.connect(g); g.connect(out);
  src.start(t); src.stop(t + life);
  sweep(src, [g]);
}

/** Reed: an odd-heavy wave with a nasal formant near 1.3kHz — somewhere between
 *  an oboe and a shawm, the market-square double reed. */
function vReed(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.5, 0.05, 0.1, 0.9, dur, 0.12);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(freq * 5, 5500); lp.Q.value = 0.5;
  const pk = c.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1300; pk.Q.value = 1.4; pk.gain.value = 7;
  const o = c.createOscillator(); o.setPeriodicWave(wave(c, "reed", W_REED)); o.frequency.value = freq;
  o.connect(lp); lp.connect(pk); pk.connect(amp); amp.connect(out);
  o.start(t); o.stop(off + 0.05);
  const nodes: AudioNode[] = [amp, lp, pk];
  if (dur > 0.5) vibrato(c, t, off, 5.2, freq * 0.005, 0.25, [o], nodes);
  sweep(o, nodes);
}

/** Synth bass: a saw over a square an octave down, through a resonant filter
 *  that snaps shut. The soft `bass` cannot drive a fight; this can. */
function vSynbass(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 5;
  f.frequency.setValueAtTime(Math.min(freq * (6 + 8 * vel), 4000), t);
  f.frequency.exponentialRampToValueAtTime(freq * 2.2, t + 0.16);
  const amp = c.createGain();
  const off = adsr(amp, t, vel * 0.6, 0.004, 0.16, 0.6, Math.max(dur * 0.85, 0.06), 0.05);
  f.connect(amp); amp.connect(out);
  const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = "square"; o2.frequency.value = freq / 2;
  const g2 = c.createGain(); g2.gain.value = 0.5;
  o1.connect(f); o2.connect(g2); g2.connect(f);
  o1.start(t); o1.stop(off + 0.05); o2.start(t); o2.stop(off + 0.05);
  sweep(o2, [f, amp, o1, g2]);
}

/** Timpani: a tuned head. The partials sit at the drum's own inharmonic modes
 *  (1, 1.5, 2, 2.5 of the note) and the pitch sags a few cents as the head
 *  relaxes. A roll is written as fast repeated notes; short strokes ring short
 *  because the next stroke re-strikes the same head. */
function vTimpani(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const life = dur < 0.3 ? 0.7 : 2.2;
  const o = c.createOscillator(); o.setPeriodicWave(wave(c, "timpani", W_TIMPANI)); o.frequency.value = freq / 2;
  o.detune.setValueAtTime(25, t);
  o.detune.linearRampToValueAtTime(0, t + 0.18);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel * 0.8, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.25);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
  o.connect(amp); amp.connect(out);
  o.start(t); o.stop(t + life + 0.02);
  noiseBurst(c, t, "lowpass", 500, 0.7, vel * 0.5, 0.07, out);   // the felt mallet
  sweep(o, [amp]);
}

/** A struck membrane with a pitch drop: taiko, toms and the kick are all this
 *  with different sizes, so they share it. */
function vMembrane(freq: number, t: number, vel: number, out: AudioNode,
  drop: number, dropTime: number, life: number, slapFreq: number, slap: number): void {
  const c = ctx!;
  const o = c.createOscillator(); o.setPeriodicWave(wave(c, "membrane", W_MEMBRANE));
  o.frequency.setValueAtTime(freq * drop, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + dropTime);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.002);
  amp.gain.exponentialRampToValueAtTime(vel * 0.3, t + Math.min(0.12, life * 0.3));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
  o.connect(amp); amp.connect(out);
  o.start(t); o.stop(t + life + 0.02);
  if (slap > 0) noiseBurst(c, t, "lowpass", slapFreq, 0.7, vel * slap, 0.05, out);
  sweep(o, [amp]);
}

function vKick(t: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const o = c.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(amp); amp.connect(out);
  o.start(t); o.stop(t + 0.45);
  noiseBurst(c, t, "highpass", 2500, 0.7, vel * 0.35, 0.012, out);   // the beater
  sweep(o, [amp]);
}

/** Snare: a short tuned body under a highpassed noise burst — the wires. Ghost
 *  notes get a shorter tail as well as a lower level, as a real one does. */
function vSnare(t: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const o = c.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(165, t + 0.04);
  const og = c.createGain();
  og.gain.setValueAtTime(vel * 0.55, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  o.connect(og); og.connect(out);
  o.start(t); o.stop(t + 0.13);
  noiseBurst(c, t, "highpass", 1200, 0.6, vel * 0.8, 0.09 + 0.1 * vel, out);
  sweep(o, [og]);
}

/** Hats. The open one runs through a choke gain that the next closed hat pulls
 *  down — automating a separate node, because cancelling the open hat's own
 *  envelope would freeze it at its peak until the choke (and Safari has no
 *  cancelAndHoldAtTime to do it properly). */
function vHat(t: number, vel: number, out: AudioNode, open: boolean): void {
  const c = ctx!;
  if (openHat) { openHat.gain.setTargetAtTime(0, t, 0.012); openHat = null; }
  if (!open) { noiseBurst(c, t, "highpass", 7200, 0.7, vel * 0.5, 0.05, out); return; }
  const choke = c.createGain();
  choke.connect(out);
  const src = noiseBurst(c, t, "highpass", 6500, 0.6, vel * 0.45, 0.42, choke);
  const prev = src.onended;
  src.onended = (e) => { if (prev) (prev as (ev: Event) => void)(e); try { choke.disconnect(); } catch { /* gone */ } };
  openHat = choke;
}

function vCrash(t: number, vel: number, out: AudioNode): void {
  const c = ctx!;
  const nb = c.createBufferSource(); nb.buffer = noiseBuf(c); nb.loop = true;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4800; hp.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  nb.connect(hp); hp.connect(g); g.connect(out);
  nb.start(t, noiseAt()); nb.stop(t + 2.25);
  sweep(nb, [hp, g]);
}

/** The take's gain for `inst`, made the first time the piece uses it. */
function takeOut(inst: Inst): GainNode | undefined {
  let g = take.get(inst);
  if (!g) {
    const dest = instOut.get(inst);
    if (!dest || !ctx) return undefined;
    g = ctx.createGain();
    g.connect(dest);
    take.set(inst, g);
  }
  return g;
}

/** Fade the current take out over `fade` seconds, disconnect it once silent,
 *  and start a fresh one for whatever plays next. */
function retireTake(fade: number): void {
  if (!ctx || !take.size) { take = new Map(); return; }
  const t = ctx.currentTime;
  const old = [...take.values()];
  for (const g of old) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
  }
  window.setTimeout(() => { for (const g of old) { try { g.disconnect(); } catch { /* gone */ } } }, fade * 1000 + 100);
  take = new Map();
}

function voice(ev: Ev, t: number, vel: number): void {
  const out = takeOut(ev.inst);
  if (!out) return;
  const freq = midiToFreq(ev.midi);
  switch (ev.inst) {
    case "piano": vPiano(freq, t, ev.dur, vel, out); break;
    case "strings": vStrings(freq, t, ev.dur, vel, out, false); break;
    case "choir": vStrings(freq, t, ev.dur, vel, out, true); break;
    case "flute": vFlute(freq, t, ev.dur, vel, out); break;
    case "bell": vBell(freq, t, ev.dur, vel, out, false); break;
    case "glass": vBell(freq, t, ev.dur, vel, out, true); break;
    case "harp": vHarp(ev.midi, t, ev.dur, vel, out); break;
    case "bass": vBass(freq, t, ev.dur, vel, out); break;
    case "pad": vPad(freq, t, ev.dur, vel, out); break;
    case "drum": vDrum(freq, t, vel, out, ev.midi); break;
    case "shaker": vShaker(t, vel, out); break;
    case "brass": vBrass(freq, t, ev.dur, vel, out, false); break;
    case "stab": vBrass(freq, t, ev.dur, vel, out, true); break;
    case "horn": vHorn(freq, t, ev.dur, vel, out); break;
    case "spiccato": vSpiccato(freq, t, ev.dur, vel, out); break;
    case "pizz": vPizz(ev.midi, t, ev.dur, vel, out); break;
    case "lute": vLute(ev.midi, t, ev.dur, vel, out); break;
    case "reed": vReed(freq, t, ev.dur, vel, out); break;
    case "synbass": vSynbass(freq, t, ev.dur, vel, out); break;
    case "timpani": vTimpani(freq, t, ev.dur, vel, out); break;
    // the bigger the drum, the longer it speaks: an o-daiko rings ~1.3s
    case "taiko": vMembrane(freq, t, vel, out, 1.7, 0.07, 0.5 + 40 / freq, 1400, 0.6); break;
    case "tom": vMembrane(freq, t, vel, out, 1.5, 0.1, 0.5, 2500, 0.35); break;
    case "kick": vKick(t, vel, out); break;
    case "snare": vSnare(t, vel, out); break;
    case "hat": vHat(t, vel, out, false); break;
    case "openhat": vHat(t, vel, out, true); break;
    case "crash": vCrash(t, vel, out); break;
  }
}

// ---------- transport ----------

const LOOKAHEAD = 0.22;   // seconds of the future we hand to the audio clock
const TICK = 45;          // ms between scheduler wakeups
/** How long combat has to stay over before the field theme comes back. Without
 *  it, a single add pulling and dying flips the track twice in three seconds. */
const LEAVE_DELAY = 3500;

const compiled = new WeakMap<Song, Compiled>();
function compiledFor(song: Song): Compiled {
  let c = compiled.get(song);
  if (!c) { c = compile(song); compiled.set(song, c); }
  return c;
}

let cur: Compiled | null = null;
let curSong: Song | null = null;
let cursor = 0;
let origin = 0;           // ctx time of the current pass's beat 0
let timer: number | null = null;
let swapTimer: number | null = null;

export type Mode = "field" | "battle" | "boss";
let fieldSong: Song | null = null;
let battleSong: Song | null = null;
let bossSong: Song | null = null;
let mode: Mode = "field";
let engaged = false;
let bossFlag = false;
let leaveTimer: number | null = null;
/** Where the field theme was when combat interrupted it, so it resumes instead
 *  of restarting its intro after every fight. */
let fieldPos = 0;

function tick(ahead = LOOKAHEAD): void {
  if (!ctx || !cur) return;
  const horizon = ctx.currentTime + ahead;
  let guard = 0;
  while (guard++ < 2000) {
    if (cursor >= cur.events.length) {
      const next = loopAdvance(cur, origin);
      if (!next) { stopSong(); return; }
      origin = next.origin;
      cursor = next.cursor;
      continue;
    }
    const ev = cur.events[cursor];
    const when = origin + ev.t;
    if (when > horizon) break;
    if (when > ctx.currentTime - 0.05) voice(ev, Math.max(when, ctx.currentTime), ev.vel);
    cursor++;
  }
}

/**
 * Hand the audio clock the next `seconds` of the piece now, for a caller about
 * to hold the page for that long: the intro builds one zone per chapter, a
 * synchronous build of up to ~3.5 s, and with only LOOKAHEAD scheduled the
 * score would stop dead for the whole build. Scheduled voices play on the
 * audio thread whatever the page is doing. Later ticks carry on from where
 * this stopped.
 */
export function musicPrefill(seconds: number): void {
  tick(Math.max(LOOKAHEAD, seconds));
}

/** Let the piece die away over `seconds` and stop: the end of a scene's score. */
export function fadeOutSong(seconds: number): void {
  if (!ctx || !cur) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.linearRampToValueAtTime(0.0001, t + seconds);
  stopSong();
  retireTake(seconds);
}

/** Seconds into the current piece, clamped into its own length. */
function position(): number {
  if (!ctx || !cur) return 0;
  const p = ctx.currentTime - origin;
  return Math.min(Math.max(p, 0), Math.max(cur.end - 0.01, 0));
}

export function playSong(song: Song | null, fade = 0.6, from = 0): void {
  if (!ctx) return;
  stopSong();
  // switchTo has usually faded it already; this is for a seek or a direct play
  retireTake(0.03);
  if (!song) return;
  if (convRef) setSpace(song.space ?? 2.6);
  cur = compiledFor(song);
  curSong = song;
  const start = Math.min(Math.max(from, 0), Math.max(cur.end - 0.01, 0));
  cursor = cur.events.findIndex((e) => e.t >= start);
  if (cursor < 0) cursor = 0;
  origin = ctx.currentTime + 0.15 - start;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(0.0001, t);
  musicGain.gain.linearRampToValueAtTime(1, t + fade);
  timer = window.setInterval(tick, TICK);
  tick();
}

export function stopSong(): void {
  if (timer !== null) { clearInterval(timer); timer = null; }
  cur = null;
  curSong = null;
  cursor = 0;
}

/** Duck out, then bring the next piece up. A true overlap would smear two keys
 *  into each other; a fast duck reads as a cut, which is what a fight wants. */
function switchTo(song: Song | null, fade: number, from: number, fadeIn = fade): void {
  if (!ctx) return;
  if (swapTimer !== null) { clearTimeout(swapTimer); swapTimer = null; }
  if (!cur) { playSong(song, fadeIn, from); return; }
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.linearRampToValueAtTime(0.0001, t + fade);
  stopSong();
  retireTake(fade);
  swapTimer = window.setTimeout(() => {
    swapTimer = null;
    playSong(song, fadeIn, from);
  }, fade * 1000 + 30);
}

function songFor(m: Mode): Song | null {
  if (m === "boss") return bossSong ?? battleSong ?? fieldSong;
  if (m === "battle") return battleSong ?? fieldSong;
  return fieldSong;
}

/** What should be playing, given who is currently trying to kill you. */
function wantMode(): Mode {
  if (!engaged) return "field";
  if (bossFlag && bossSong) return "boss";
  return battleSong ? "battle" : "field";
}

function reconcile(): void {
  const target = wantMode();
  if (target === mode) return;
  // back to the top of the bar the fight interrupted: the chord bed and bass
  // only sound on chord changes, so resuming mid-bar came back thin until the
  // next one, and a phrase picked up on its downbeat sounds meant
  if (mode === "field") fieldPos = cur ? Math.floor(position() / cur.bar + 1e-6) * cur.bar : 0;
  mode = target;
  if (target === "field") switchTo(fieldSong, 0.7, fieldPos);
  // in at full by the first downbeat (playSong starts 0.15s out): a 0.3s
  // fade-in had the battle's opening hit land at half gain, -6dB
  else switchTo(songFor(target), 0.3, 0, 0.1);
}

/** Called on every zone change: sets the pair of pieces this zone plays and
 *  drops straight back to the field theme. */
export function setZoneMusic(field: Song | null, battle: Song | null, boss: Song | null): void {
  fieldSong = field; battleSong = battle; bossSong = boss;
  if (leaveTimer !== null) { clearTimeout(leaveTimer); leaveTimer = null; }
  engaged = false; bossFlag = false; mode = "field"; fieldPos = 0;
  switchTo(field, 0.5, 0);
}

/**
 * Engaged or not, and whether anything in the fight is a boss. The boss flag is
 * sticky for the duration of a fight — once the boss theme starts, killing the
 * adds should not demote it mid-encounter.
 */
export function setMusicCombat(on: boolean, boss = false): void {
  if (on) {
    if (leaveTimer !== null) { clearTimeout(leaveTimer); leaveTimer = null; }
    const changed = !engaged || (boss && !bossFlag);
    engaged = true;
    if (boss) bossFlag = true;
    if (changed) reconcile();
  } else if (engaged && leaveTimer === null) {
    leaveTimer = window.setTimeout(() => {
      leaveTimer = null;
      engaged = false;
      bossFlag = false;
      reconcile();
    }, LEAVE_DELAY);
  }
}

/** For the audition page and tests: what the transport thinks it is playing,
 *  and how far into the piece it is. */
export function musicMode(): Mode { return mode; }
export function musicPosition(): number { return position(); }

export interface MusicState {
  song: Song | null;
  compiled: Compiled | null;
  /** seconds into the piece; after a loop it restarts from the loop point */
  position: number;
  mode: Mode;
  engaged: boolean;
  boss: boolean;
  /** combat has ended and the field theme is waiting out LEAVE_DELAY */
  leaving: boolean;
}

/** Everything the jukebox shows, in one read. */
export function musicState(): MusicState {
  return {
    song: curSong, compiled: cur, position: position(), mode,
    engaged, boss: bossFlag, leaving: leaveTimer !== null,
  };
}

/** Jump the current piece to `seconds` (the jukebox's seek and "hear the seam"). */
export function seekMusic(seconds: number): void {
  if (!curSong) return;
  playSong(curSong, 0.04, seconds);
}

interface GraphState {
  ctx: BaseAudioContext | null; musicGain: GainNode; chWet: GainNode; chMid: GainNode; chDry: GainNode;
  convRef: ConvolverNode | null; instOut: Map<Inst, GainNode>; take: Map<Inst, GainNode>; openHat: GainNode | null; noisePos: number;
}
const grab = (): GraphState => ({ ctx, musicGain, chWet, chMid, chDry, convRef, instOut, take, openHat, noisePos });
function put(g: GraphState): void {
  ({ ctx, musicGain, chWet, chMid, chDry, convRef, instOut, take, openHat, noisePos } = g);
}

/**
 * Render `seconds` of `song` from song time `from` through the real voices into
 * an OfflineAudioContext — the score measured by something that is not an ear
 * (tools/music/render.mjs drives it). The voices read the module's graph, so
 * the offline graph is swapped in only while events are being scheduled and the
 * live one put straight back; a page can render while it plays.
 *
 * Events are fed a second at a time from suspend() callbacks, the transport's
 * lookahead done offline. Scheduling the whole piece up front works but every
 * not-yet-started node sits in the render graph from the first quantum, and a
 * 90-second piece rendered three times slower for it.
 *
 * Notes that began before `from` are not heard; render from earlier and
 * discard the head if their tails matter.
 */
export async function renderSong(song: Song, opts: { from?: number; seconds: number; sampleRate?: number }): Promise<AudioBuffer> {
  const rate = opts.sampleRate ?? 48000;
  const from = opts.from ?? 0;
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(opts.seconds * rate)), rate);
  const live = grab();
  let mine: GraphState;
  try {
    initMusic(off, off.destination);
    setSpace(song.space ?? 2.6);
    noisePos = 0;
    mine = grab();
  } finally {
    put(live);
  }
  const evs = unroll(compiledFor(song), from, from + opts.seconds);
  let i = 0;
  const feed = (until: number) => {
    const back = grab();
    put(mine);
    try {
      for (; i < evs.length && evs[i].at - from < until; i++) voice(evs[i].ev, evs[i].at - from, evs[i].ev.vel);
    } finally {
      mine = grab();
      put(back);
    }
  };
  const STEP = 1;
  feed(STEP * 1.5);
  for (let t = STEP; t < opts.seconds; t += STEP) {
    const at = t;
    void off.suspend(at).then(() => { feed(at + STEP * 1.5); void off.resume(); });
  }
  return off.startRendering();
}
