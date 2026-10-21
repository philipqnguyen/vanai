// The Empty Throne score, as the game reads it. Every file in this folder
// except this one and kit.ts is a piece (see kit.ts for the format); Vite's glob
// finds them, so pieces can be written in parallel without touching a shared
// list. The old Lantern-lore score (songs.ts) it replaced was retired on
// 2026-10-11, once every zone and battle group had a piece here.

import { ZONES } from "../data";
import { buildScore, makeCues, type Piece } from "./kit";

export type { Cue } from "./kit";

const files = import.meta.glob<Piece>(["./*.ts", "!./index.ts", "!./kit.ts"], { eager: true, import: "default" });

export const SCORE = buildScore(Object.entries(files).map(([file, piece]) => ({ file: file.replace("./", "score/"), piece })));

export const { fieldCue, battleCue, zoneGroup, zoneMusic, sceneCue } = makeCues(SCORE, ZONES);
