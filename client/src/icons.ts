// Procedural SVG icon system — no icon assets, everything drawn from paths.
// Abilities pick a glyph from their kind/effect/element; items from slot/wtype.

type Glyph = { fill?: string[]; stroke?: string[] };

const GLYPHS: Record<string, Glyph> = {
  sword: {
    fill: ["M3 6 V3 H6 L17.5 14.5 L14.5 17.5 Z"],
    stroke: ["M13 19 L19 13", "M16 16 L20 20", "M19 21 L21 19"],
  },
  greatsword: {
    fill: ["M2.5 5.5 V2.5 H5.5 L19 16 L16 19 Z"],
    stroke: ["M12.5 19.5 L19.5 12.5", "M15.5 15.5 L21 21", "M18.5 21.5 L21.5 18.5", "M5 2.8 L21 18.8"],
  },
  katana: {
    fill: [],
    stroke: ["M4 20 Q5 10 19 4", "M6.5 16.5 L9.5 19.5", "M3.5 18.5 L5.5 21.5"],
  },
  staff: {
    fill: [],
    stroke: ["M7 21 L16 6", "M16 6 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0"],
  },
  cudgel: {
    fill: ["M13 4 a4.5 4.5 0 0 1 4.5 7.5 L15 14 L10 9 Z"],
    stroke: ["M12 11 L5 20"],
  },
  fist: {
    fill: [],
    stroke: ["M7 13 V8.5 a1.8 1.8 0 0 1 3.6 0", "M10.6 10 V7.5 a1.8 1.8 0 0 1 3.6 0", "M14.2 10 V8 a1.8 1.8 0 0 1 3.6 0 V13.5 a5.8 5.8 0 0 1 -11.6 0 V13", "M7 13 H5.5 a1.5 1.5 0 0 1 0 -3 H7"],
  },
  slashes: {
    fill: [],
    stroke: ["M4.5 4 Q15 6 20 16", "M3.5 10 Q13 12 17.5 20.5"],
  },
  shield: {
    fill: [],
    stroke: ["M12 3 L19 6 V11 C19 16 16 19.5 12 21 C8 19.5 5 16 5 11 V6 Z", "M12 7.5 V16"],
  },
  burst: {
    fill: ["M12 1.5 L13.9 8.1 L20 5 L15.9 10.7 L22.5 12 L15.9 13.3 L20 19 L13.9 15.9 L12 22.5 L10.1 15.9 L4 19 L8.1 13.3 L1.5 12 L8.1 10.7 L4 5 L10.1 8.1 Z"],
  },
  orb: {
    fill: ["M12 9.5 a2.5 2.5 0 1 0 0 5 a2.5 2.5 0 1 0 0 -5"],
    stroke: ["M12 5 a7 7 0 1 0 0 14 a7 7 0 1 0 0 -14", "M12 2 V4", "M12 20 V22", "M2 12 H4", "M20 12 H22"],
  },
  crescent: {
    fill: ["M14.5 2.8 A9.2 9.2 0 1 0 21.2 15.2 A7.4 7.4 0 1 1 14.5 2.8 Z"],
  },
  sun: {
    fill: ["M12 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8"],
    stroke: ["M12 2 V5", "M12 19 V22", "M2 12 H5", "M19 12 H22", "M4.9 4.9 L7 7", "M17 17 L19.1 19.1", "M19.1 4.9 L17 7", "M7 17 L4.9 19.1"],
  },
  heal: {
    fill: ["M9.8 3 H14.2 V9.8 H21 V14.2 H14.2 V21 H9.8 V14.2 H3 V9.8 H9.8 Z"],
  },
  chevrons: {
    fill: [],
    stroke: ["M5 13 L12 6 L19 13", "M5 20 L12 13 L19 20"],
  },
  note: {
    fill: ["M8 15.2 a2.6 2.6 0 1 0 0 5.2 a2.6 2.6 0 1 0 0 -5.2", "M17.4 12.2 a2.6 2.6 0 1 0 0 5.2 a2.6 2.6 0 1 0 0 -5.2"],
    stroke: ["M10.6 17.8 V6.5 L20 4.5 V14.8"],
  },
  shout: {
    fill: ["M11 14.5 L10.2 3.5 H13.8 L13 14.5 Z", "M12 17.2 a1.9 1.9 0 1 0 0 3.8 a1.9 1.9 0 1 0 0 -3.8"],
  },
  helm: {
    fill: [],
    stroke: ["M5 14 A7 7 0 0 1 19 14 V18 H14.5 V14.5 H9.5 V18 H5 Z", "M9.5 18 H14.5 V21"],
  },
  tunic: {
    fill: [],
    stroke: ["M8.5 3.5 L3.5 6.5 L5.5 10.5 L8 9 V20.5 H16 V9 L18.5 10.5 L20.5 6.5 L15.5 3.5 A3.5 2.6 0 0 1 8.5 3.5 Z"],
  },
  legs: {
    fill: [],
    stroke: ["M7.5 3.5 H16.5 V8 L15 20.5 H12.7 L12 10.5 L11.3 20.5 H9 L7.5 8 Z"],
  },
  boot: {
    fill: [],
    stroke: ["M7.5 3 H12.5 V12 L18 14.8 A2.4 2.4 0 0 1 19.5 17 V20.5 H7.5 Z", "M7.5 16.5 H12"],
  },
  ring: {
    fill: ["M12 2 L15 5.5 L12 9 L9 5.5 Z"],
    stroke: ["M12 8.5 a5.8 5.8 0 1 0 0 11.6 a5.8 5.8 0 1 0 0 -11.6"],
  },
  flask: {
    fill: [],
    stroke: ["M10 2.5 H14", "M11 2.5 V8 L5.8 17.8 A2.4 2.4 0 0 0 8 21.5 H16 A2.4 2.4 0 0 0 18.2 17.8 L13 8 V2.5", "M7.8 14.5 H16.2"],
  },
  pouch: {
    fill: [],
    stroke: ["M8 8.5 C8 5 16 5 16 8.5 L18.6 16.5 A3 3 0 0 1 15.7 20.5 H8.3 A3 3 0 0 1 5.4 16.5 Z", "M9 8.5 H15", "M12 12 V16"],
  },
};

function svg(glyph: string, color: string): string {
  const g = GLYPHS[glyph] || GLYPHS.burst;
  const fills = (g.fill || []).map((d) => `<path d="${d}" fill="${color}"/>`).join("");
  const strokes = (g.stroke || []).map((d) =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg class="gicon" viewBox="0 0 24 24" aria-hidden="true">${fills}${strokes}</svg>`;
}

const RARITY_COLOR: Record<string, string> = {
  common: "#b8c2d4",
  uncommon: "#8fd8a8",
  rare: "#7fb2e0",
};

// Icon for an item definition from items.json.
export function itemIcon(def: any): string {
  const c = RARITY_COLOR[def?.rarity] || "#b8c2d4";
  if (!def) return svg("pouch", c);
  if (def.slot === "weapon") {
    const g = { sword: "sword", greatsword: "greatsword", katana: "katana", staff: "staff", cudgel: "cudgel", handwraps: "fist" }[def.wtype as string] || "sword";
    return svg(g, c);
  }
  if (def.slot === "head") return svg("helm", c);
  if (def.slot === "body") return svg("tunic", c);
  if (def.slot === "legs") return svg("legs", c);
  if (def.slot === "feet") return svg("boot", c);
  if (def.slot === "ring") return svg("ring", c);
  if (def.slot === "consumable") return svg("flask", "#8fd8a8");
  return svg("pouch", "#c9a15a");
}

// ---------- Lamplight stroke icons ----------
// The HUD redesign draws its dock, job emblems, hotbar and window chrome as
// single-colour line icons that inherit currentColor, so a state (ready, on
// cooldown, out of range) recolours an icon through CSS alone. All share a
// 24-unit box. Hotbar, dock, chevrons, close, shield and the BLM/MNK/SAM
// emblems are verbatim from the approved artboards; coin is the artboard's
// circle-plus-path folded into one d, and moon, droplet, eyeOff and job_DRK
// are not drawn there at all (they come from the build plan). The filled
// GLYPHS above stay for item icons, whose colour carries rarity.
export const LP_PATHS: Record<string, string> = {
  // hotbar (Main artboard)
  sword: "M19 4 9 14M19 4h-4M19 4v4M6.5 13.5l4 4M5 19l2.5-2.5",
  provoke: "M4 10v4h3l7 5V5L7 10zM18 9a4 4 0 0 1 0 6",
  cure: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM12 9v6M9 12h6",
  bash: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM13 8l-3 5h4l-3 4",
  flash: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  rampart: "M5 21V8h3V5h2v3h4V5h2v3h3v13zM10 21v-5h4v5",
  sentinel: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  radiant: "M16 5 7 14M16 5h-4M16 5v4M4.5 12.5l4 4M3 18l2.5-2.5M19 13v6M16 16h6",
  potion: "M10 3h4M10.5 3v5l-4 7a3.5 3.5 0 0 0 3 5.5h5a3.5 3.5 0 0 0 3-5.5l-4-7V3M7.5 14h9",
  // dock
  bags: "M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2",
  character: "M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8M4 21c1-4 4.5-6 8-6s7 2 8 6",
  journal: "M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  craft: "M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8",
  social: "M9 5a3 3 0 1 0 0 6 3 3 0 1 0 0-6M3 20c.5-3 3-5 6-5s5.5 2 6 5M16 6a3 3 0 0 1 0 6M18 15c2 .7 3 2.5 3.4 5",
  crystal: "M12 2l6 8-6 12-6-12zM6 10h12",
  court: "M6 3h12v15l-6-3.5L6 18zM4 3h16M9 7.5h6M9 10.5h6",
  // a cog: eight teeth tapering to the rim, and the axle hole
  settings: "M10.17 4.62L10.59 2.1L13.41 2.1L13.83 4.62L15.92 5.49L18 4L20 6L18.51 8.08L19.38 10.17L21.9 10.59L21.9 13.41L19.38 13.83L18.51 15.92L20 18L18 20L15.92 18.51L13.83 19.38L13.41 21.9L10.59 21.9L10.17 19.38L8.08 18.51L6 20L4 18L5.49 15.92L4.62 13.83L2.1 13.41L2.1 10.59L4.62 10.17L5.49 8.08L4 6L6 4L8.08 5.49zM15 12a3 3 0 1 0-6 0 3 3 0 1 0 6 0",
  // chrome and status
  coin: "M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 8v8",
  close: "M6 6l12 12M18 6 6 18",
  chevUp: "M6 15l6-6 6 6",
  chevDown: "M6 9l6 6 6-6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  // a clapperboard: someone is watching a cutscene (over their head and on
  // the party bar, Philip's ruling 2026-10-11)
  film: "M4 10h16v10H4zM3.2 6.4l15.6-3.4.8 3.6L4 10zM8.2 5.4l1.7 3.3M13.2 4.3l1.7 3.3M4 13.5h16",
  droplet: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z",
  eyeOff: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM4 4l16 16",
  // consumables on the hotbar, not drawn in the design either: a steaming
  // bowl for food and a stoppered vial for the status cures
  bowl: "M3 11h18a9 9 0 0 1-18 0zM9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3",
  vial: "M9 3h6M10 3v13a2 2 0 0 0 4 0V3M10 10h4",
  // job emblems (the design joins each emblem's sub-paths into one d)
  job_PLD: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM12 7v10M8.5 11h7",
  job_WHM: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 8v8M8 12h8",
  job_BLM: "M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-5 1-9z",
  job_MNK: "M7 11V7.5a1.5 1.5 0 0 1 3 0V11M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7.5a1.5 1.5 0 0 1 3 0V12M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a5 5 0 0 1-5-5v-3a1.5 1.5 0 0 1 3 0",
  job_SAM: "M4 20 19 5M17 4l3 3M7 14l3 3",
  // not drawn in the design: a greatsword in the same hand as job_SAM. The
  // blade is an outline, broad and pointed, over a wide guard and a round
  // pommel, because a single-line blade with a square end read as a pencil
  // (a fuller was tried; at 26px it fills the blade in).
  job_DRK: "M7.7 13.7 15.7 5.7 20.5 3.5 18.3 8.3 10.3 16.3zM5.6 11.6l6.8 6.8M9 15l-3.4 3.4M4.6 18a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 1 0 0-2.8",
  // ---- ability glyphs (2026-10-20): one picture per ability, so no two
  // abilities on one job's bar ever share a face. A ranked spell (Stone II,
  // Cure IV) draws its family's picture with the rank as Roman ticks in the
  // lower-right corner, so those families keep x>16,y>17 clear. A weapon
  // skill family (the samurai's tachi, the dark knight's scythe, the monk's
  // fist, the paladin's blade) keeps the weapon lower-left and its own
  // mark upper-right. Sized for 24 px; checked on the contact sheet
  // (tools/qa/ability_icon_sheet.mjs) before any of them was kept.
  // black mage
  stone: "M4 15l3-7 6-3 5 4-2 7H6zM11 5l3 6-3 5",
  blizzard: "M11 3v14M4.9 6.5l12.2 7M17.1 6.5 4.9 13.5M9 5l2 1.5 2-1.5M9 15l2-1.5 2 1.5",
  fire: "M11 3c3 3.5 5 6 5 9.5a5 5 0 0 1-10 0c0-2.5 1.5-3.5 1.5-6 1.5.8 2.5 2.5 2.5 4.5 1-2 1-5 1-8z",
  thunder: "M12 2 4 12h6l-1.5 7L17 9h-6z",
  sleep: "M14 12.5A6 6 0 1 1 6.5 5a4.5 4.5 0 0 0 7.5 7.5zM15 4h4l-4 4h4M20 9.5h2l-2 2h2",
  aero: "M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 18h8a2 2 0 1 1-2 2",
  aspir: "M12 12a1 1 0 0 1 1 1a2 2 0 0 1-2 2a3 3 0 0 1-3-3a4 4 0 0 1 4-4a5 5 0 0 1 5 5a6 6 0 0 1-6 6a7 7 0 0 1-7-7a8 8 0 0 1 8-8",
  flare: "M12 2l1.5 6 4.5-3-3 4.5 6 1.5-6 1.5 3 4.5-4.5-3-1.5 6-1.5-6-4.5 3 3-4.5-6-1.5 6-1.5-3-4.5 4.5 3z",
  freeze: "M12 2l8.7 5v10L12 22l-8.7-5V7zM12 7v10M7.7 9.5l8.6 5M16.3 9.5l-8.6 5",
  // dark knight: the scythe is a pole lower-left and a hooked blade at its head
  hard_slash: "M5 21 13 6M13 6c2-3 7-3 9 1-4-1-7 0-9 2",
  shadow_cleave: "M5 21 13 6M13 6c2-3 7-3 9 1-4-1-7 0-9 2M19 12v9M17 17l2 2 2-2",
  nightfall: "M5 21 13 6M13 6c2-3 7-3 9 1-4-1-7 0-9 2M21 15.5a3.5 3.5 0 1 1-4.3-4.3 2.8 2.8 0 0 0 4.3 4.3z",
  gloom_scythe: "M5 21 13 6M13 6c2-3 7-3 9 1-4-1-7 0-9 2M15 14c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0M15 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0",
  torment: "M5 21 13 6M13 6c2-3 7-3 9 1-4-1-7 0-9 2M16 13l1.5 3M19.5 12l.5 3.5M22 14l-1 3",
  guillotine: "M5 3v18M19 3v18M5 7h14l-14 6M5 21h14",
  soul_eater: "M12 2c2 2.5 3.5 4 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 6 10 4.5 12 2zM4 14c2 3 5 5 8 5s6-2 8-5M7.5 15.5 9 18M12 16.5V19M16.5 15.5 15 18",
  last_resort: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9M10.5 19h3",
  blood_weapon: "M19 4 9 14M19 4h-4M19 4v4M6.5 13.5l4 4M5 19l2.5-2.5M16 14c1 1.3 1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 .5-1.7 1.5-3z",
  weapon_bash: "M12 2v12M8 14h8M9 14v4h6v-4M5 21l2-2M19 21l-2-2M12 20v2",
  drain: "M10 15s-6-3.7-6-8.5a3.4 3.4 0 0 1 6-2.2 3.4 3.4 0 0 1 6 2.2c0 4.8-6 8.5-6 8.5zM10 15v5M8 18l2 2.5 2-2.5",
  bio: "M10 3a6 6 0 0 0-6 6c0 2.3 1.2 4.1 3 5.2V17h6v-2.8c1.8-1.1 3-2.9 3-5.2a6 6 0 0 0-6-6zM7 9.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0M11.8 9.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0M8.5 17v2.5M11.5 17v2.5",
  // monk: a side-on fist, knuckles right, and the mark that names the skill
  burning_fists: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M8 7c0-2.5 1.2-3 1.8-5 .6 2 1.8 2.5 1.8 5M13 7c0-2.5 1.2-3 1.8-5 .6 2 1.8 2.5 1.8 5",
  raging_fists: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M3 5l2-2.5 2 2.5 2-2.5 2 2.5 2-2.5 2 2.5 2-2.5 2 2.5",
  lamplit_fist: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M7 6.5a4 4 0 0 1 8 0M11 1v2M5.5 3l1.2 1.2M16.5 3l-1.2 1.2",
  howling_fist: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M18.5 10a4 4 0 0 1 0 6M21 7.5a7.5 7.5 0 0 1 0 11",
  final_heaven: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M11 1v4M5 3l2 2M17 3l-2 2M2 8l2 1M20 8l-2 1",
  hundred_fists: "M5 12v-2a1.2 1.2 0 0 1 2.4 0v2M8 11.5V9a1.2 1.2 0 0 1 2.4 0v2.5M11 11.5V9.5a1.2 1.2 0 0 1 2.4 0v2M14 12v-1.5a1.2 1.2 0 0 1 2.4 0V15a5.5 5.5 0 0 1-5.5 5.5H10A5 5 0 0 1 5 15.5V12M18 6l3.5-2.5M19 11.5h4M18 17l3.5 2.5M4 6 1 3.5",
  mending_chant: "M8 17a2.5 2.5 0 1 1-.01 0M8 17V4c3 0 5 1.5 6 4M16 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11",
  stillness: "M12 12a1 1 0 1 0 .01 0M12 12m-4.5 0a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M12 12m-8.5 0a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0",
  breath_of_dawn: "M3 16h18M6 16a6 6 0 0 1 12 0M12 5v2M4.5 9 6 10.5M19.5 9 18 10.5M8 20h8",
  breath_of_the_lamp: "M12 21v-5M5 16h14l-4.5-5h2.5L12 3 7 11h2.5z",
  counterstance: "M5 8h10a4 4 0 0 1 0 8H8M11 13l-3 3 3 3M5 8l2-2M5 8l2 2",
  // paladin (the other eight are the artboard's, above)
  royal_blade: "M17 7 7 17M17 7h-4M17 7v4M4.5 15.5l4 4M3 21l2.5-2.5M14 6V2l2 1.5L18 1l2 2.5L22 2v4z",
  vorpal_blade: "M19 4 9 14M19 4h-4M19 4v4M6.5 13.5l4 4M5 19l2.5-2.5M3 8a9 9 0 0 1 6-5M21 16a9 9 0 0 1-6 5",
  saints_edge: "M17 7 7 17M17 7h-4M17 7v4M4.5 15.5l4 4M3 21l2.5-2.5M18 3a3 3 0 1 0 .01 0",
  palisade: "M4 21V9l2-3 2 3v12M10 21V7l2-3 2 3v14M16 21V9l2-3 2 3v12M3 14h18",
  bulwark: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM4 10h16M4.6 14.5h14.8",
  hold_until_relieved: "M6 21V3M6 3h12l-3 4 3 4H6M3 21h6",
  // samurai: the katana lower-left, the skill's mark upper-right
  tachi_enpi: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M12 9c2-2.5 4-2.5 5 0 1-2.5 3-2.5 5 0",
  tachi_gekko: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M21.5 11.5A4.5 4.5 0 1 1 15.5 6a3.5 3.5 0 0 0 6 5.5z",
  tachi_jinpu: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M12 7h6a1.5 1.5 0 1 0-1.5-1.5M14 11h8a1.5 1.5 0 1 1-1.5 1.5",
  tachi_yukikaze: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M17 6v8M13.5 8l7 4M20.5 8l-7 4",
  tachi_koki: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M17 10m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M17 5v1.5M17 13.5V15M12 10h1.5M20.5 10H22",
  tachi_kagero: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M12 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0M13 12c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0",
  tachi_rana: "M3 19 19 3M19 3h-4M19 3v4M5 15l4 4M13 7l3 3M17 5l3 3M14.5 12l3 3",
  challenge: "M4 4l16 16M20 4 4 20M4 4h3M4 4v3M20 4h-3M20 4v3M4 20h3M4 20v-3M20 20h-3M20 20v-3",
  third_eye: "M2 14s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 14 2 14zM12 11.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M12 1.5l2 2.5-2 2.5-2-2.5z",
  meditate: "M12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M7 13c1.5-2 3-3 5-3s3.5 1 5 3M3 19c2-3 5-4 9-4s7 1 9 4M3 19h18",
  hasso: "M12 2v13M12 2l-2.5 3M12 2l2.5 3M8 15h8M12 15v6M10.5 21h3M4 10l2 2M20 10l-2 2",
  warding_circle: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 3v2M12 19v2M3 12h2M19 12h2",
  seigan: "M2 15h13l5-2v4l-5-2M7 12v6M4 13v4M7 6s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3zM12 4.5a1.5 1.5 0 1 0 .01 0",
  second_wind: "M3 15h10a2 2 0 1 0-2-2M3 19h6a2 2 0 1 1-2 2M17 11V3M14 6l3-3 3 3",
  meikyo_shisui: "M12 12m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0M5 14c2-1.5 4-1.5 6 0s4 1.5 6 0M8 9l-2 2M11.5 7.5l-4 4",
  // white mage
  banish: "M10 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  radiant_smite: "M8 4h8v6H8zM12 10v11M9 21h6M12 1v1.5M5 6h2M17 6h2",
  protect: "M10 3 3 5.5V11c0 4.5 3 7.2 7 8 4-.8 7-3.5 7-8V5.5zM7 9.5l2 2 4-4",
  regen: "M10 20V9M10 13c0-3-2.5-5-6-5 0 3.5 2.5 5.5 6 5zM10 10c0-3 2.5-5 6-5 0 3.5-2.5 5.5-6 5z",
  raise: "M12 21V7M8 11l4-4 4 4M9 3.5a3 3 0 0 1 6 0",
  esuna: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11zM9 13.5l2 2 4-4",
  benediction: "M6 3h12v4a6 6 0 0 1-12 0zM12 13v5M8 21h8M12 1v1M3.5 5l1-.5M20.5 5l-1-.5",
  holy: "M12 3v18M3 12h18M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0",
};

// One stroke path as an inline svg. `class="gicon lp"` keeps the existing
// .gicon sizing hooks working while svg.lp opts out of inline baseline gaps.
export function strokeIcon(d: string, size = 24, sw = 1.6): string {
  return `<svg class="gicon lp" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

// A named Lamplight icon; an unknown name draws the generic flash rather than
// throwing, so a missing entry shows up on screen instead of blanking a panel.
export function lpIcon(name: string, size?: number, sw?: number): string {
  return strokeIcon(LP_PATHS[name] ?? LP_PATHS.flash, size, sw);
}

// A job's emblem; a job the design never drew falls back to the plain shield.
export function jobIcon(job: string, size = 24, sw = 1.6): string {
  return strokeIcon(LP_PATHS[`job_${job}`] ?? LP_PATHS.shield, size, sw);
}

// Every ability draws its own picture (2026-10-20: two spells on one bar
// shared the flash). Keyed by abilities.json key with any rank suffix
// stripped, so Stone II finds "stone"; the eight the Main artboard drew keep
// the artboard's names. A family shared across jobs (Cure and Cure Light,
// Protect and Warding Chant, Regen and Verse of Vigor, Aspir and Absorb) is
// the same picture on purpose: it is the same spell, and no job holds both.
const ABILITY_GLYPH: Record<string, string> = {
  fast_blade: "sword",
  provoke: "provoke",
  cure_light: "cure",
  cure: "cure",
  shield_bash: "bash",
  flash: "flash",
  rampart: "rampart",
  sentinel: "sentinel",
  radiant_blade: "radiant",
  absorb: "aspir",
  warding_chant: "protect",
  verse_of_vigor: "regen",
};
// A name whose slug is not its key (the ability was renamed and kept its key).
const ABILITY_BY_NAME: Record<string, string> = {
  "Shadow Scythe": "gloom_scythe",
  "Dawn Fist": "lamplit_fist",
  "Breath of the Grove": "breath_of_the_lamp",
};
const RANK: Record<string, number> = { ii: 2, iii: 3, iv: 4 };
// Roman ticks in the lower-right corner: the rank of a spell whose family
// picture it shares. Rank I draws nothing, as the spell lists read.
const RANK_MARK: Record<number, string> = {
  2: "M18.5 18v4M21.5 18v4",
  3: "M17 18v4M20 18v4M23 18v4",
  4: "M16 18v4M18.5 18l2 4 2-4",
};

// "Tachi: Enpi" -> tachi_enpi, "Saint's Edge" -> saints_edge, "Cure II" -> cure_ii
const slug = (name: string) => name.toLowerCase().replace(/[':]/g, "").trim().replace(/\s+/g, "_");

// An ability's picture and rank: {glyph, rank} for the key or name given.
export function abilityGlyph(ab: any): { glyph: string; rank: number } {
  const a = ab || {};
  const key: string = a.id ?? a.key ?? (a.name ? ABILITY_BY_NAME[a.name] ?? slug(a.name) : "");
  const m = /^(.*?)_(ii|iii|iv)$/.exec(key);
  const base = m ? m[1] : key;
  const rank = m ? RANK[m[2]] : 1;
  const glyph = ABILITY_GLYPH[base] ?? (LP_PATHS[base] ? base : "");
  if (glyph) return { glyph, rank };
  // an ability the table does not know: read what it does, as before
  let name = "flash";
  if (a.effect === "enmity") name = "provoke";
  else if (a.effect === "heal" || a.effect === "hot" || a.effect === "cure") name = "cure";
  else if (a.effect === "stun") name = "bash";
  // abilities.json spells the evade buff "evade_charges"
  else if (a.effect === "buff_def" || a.effect === "evade" || a.effect === "evade_charges") name = "rampart";
  else if (a.effect === "buff_dmg") name = "radiant";
  else if (a.effect === "revive" || a.effect === "raise") name = "crystal";
  else if (a.effect === "mp_regen") name = "droplet";
  else if (a.effect === "sleep") name = "moon";
  else if (a.effect === "dot" || a.effect === "poison") name = "droplet";
  else if (a.kind === "ws") name = "sword";
  return { glyph: name, rank: 1 };
}

// The stroke glyph for an ability payload {id|key, name, kind, element,
// effect, power}: its own picture, with its rank's ticks appended to the
// same path so the icon stays one currentColor stroke.
export function abilityStrokeIcon(ab: any, size = 24): string {
  const { glyph, rank } = abilityGlyph(ab);
  const d = (LP_PATHS[glyph] ?? LP_PATHS.flash) + (RANK_MARK[rank] ?? "");
  return strokeIcon(d, size);
}

// A consumable's hotbar glyph, by what it does, so a Potion and an Ether on
// the bar read apart at a glance. items.json has no food flag: every heal
// that is not a potion is a dish (Hot Stew, Fresh Bread, the broths).
export function itemStrokeIcon(key: string, def: any, size = 24): string {
  const effect = def?.effect;
  let name = "potion";
  if (effect === "mp") name = "droplet";
  else if (typeof effect === "string" && effect.startsWith("cure_")) name = "vial";
  else if (effect === "heal" && !key.includes("potion")) name = "bowl";
  return lpIcon(name, size);
}
