// Heartwood at night (tmp/heartwood-night/PLAN.md, 2026-10-09; Philip: "heartwood
// is really dark at night, we need more lights").
//
// The city was lit at night only by the moon and a 0.25 hemi: everything under
// a crown, every trunk foot on its moon-shadow side and every deck underside
// was black, and for the hour after sunset (the moon at its weakest) so was
// the rest. Its own warm light stopped at its walls: the amber windows burned
// the same by day and night, and each hearth lights only its own home.
//
// Each switch is one step of the plan and can be turned off on its own:
// - profile (L1): the night profile below, the windows and the living moss
//   following the night, and the hearths burning stronger at night. No light,
//   mesh or asset added.
// - lamps (L2): the resin lamps, heartwood-lamps.ts. Original generated
//   fixtures, thin-instanced: no light added; the resin glows and its halo
//   shows only at night.
// - pools (L3): the lamps' light, heartwood-pools.ts. A baked pool map read by
//   a material plugin on the walk and wall materials: no light, no draw, and
//   exactly nothing by day.
// - fills (L4): the hand-kept lamps (heartwood-lamps-plan.ts LAMP_ADD and
//   LAMP_SKIP) where the rules left a walk dark: the West Gate, the gate road
//   under the West Elder, the west quarter, the West tally post, the
//   Chanters' Hall approach and the long lanes to the North Canopy and the
//   North and South posts. More of the same lamps: no draw, no light.
import { Color3, type PointLight, type StandardMaterial } from '@babylonjs/core';
import { registerNightProfile, registerNightRamp, registerNightBoost, type NightProfile } from './scene';

export const HW_NIGHT = { profile: true, lamps: true, pools: true, fills: true };

// From the ambient prototype (tmp/heartwood-night/designs/ambient), the fog
// left out, and retuned at the end of L3 (hemiAdd 0.27 -> 0.21, shadow 0.35 ->
// 0.25) so the lamps' pools read against the lift. The hemi's ground colour
// turns to a warm bounce, as if from the lamplit ground, so the undersides of
// the rings, bridges and boughs read warm brown instead of black; moon shadows
// keep a quarter of the moon; the moon reaches its 0.70 three times sooner, so
// the hour after sunset is dark but readable instead of black (top-down walk
// luma 3.2 at daytime 0.52 before).
export const HW_NIGHT_PROFILE: NightProfile = {
  hemiAdd: 0.21, hemiSky: '#a3b4e6', hemiGround: '#9a7440', shadow: 0.25,
  moonRamp: 3, moonPeak: 0.70, moonTint: '#b3c0ea',
};
// The windows brighten as night falls ("every window lit" on the Night):
// emissive x (1 + WINDOW_GAIN N), the glow from today's 0.12 to WINDOW_GLOW.
const WINDOW_GAIN = 0.6, WINDOW_GLOW = 0.42;
// The living roofs' moss gives a faint light of its own at night.
const MOSS_NIGHT = '#c9b25a', MOSS_GAIN = 0.15;
// A hearth x (1 + HEARTH_GAIN N). Its range is unchanged, so heartwood-groups'
// rule (no hearth reaches a group-mate) still holds.
const HEARTH_GAIN = 0.45;

/** Called from buildHeartwoodCity once the homes stand. Every value it
 * leans away from is the material's or the light's own, so by day (N = 0)
 * nothing changes. */
export function heartwoodNight(o: { glass: StandardMaterial; moss: StandardMaterial; hearths: readonly PointLight[] }): void {
  if (!HW_NIGHT.profile) return;
  registerNightProfile('heartwood', HW_NIGHT_PROFILE);
  registerNightRamp(o.glass, { emissiveNight: o.glass.emissiveColor.scale(1 + WINDOW_GAIN), glowNight: WINDOW_GLOW });
  registerNightRamp(o.moss, { emissiveNight: Color3.FromHexString(MOSS_NIGHT).scale(MOSS_GAIN) });
  for (const l of o.hearths) registerNightBoost(l, l.intensity, HEARTH_GAIN);
}
