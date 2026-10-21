// GENERATED NATURE: everything growing or lying on the ground that is not a
// tree (trees.ts) or the meadow (grass.ts) -- rocks, pebbles and stepping
// stones, bushes, flowers, grass tufts, ferns, plants, mushrooms and logs --
// standing in for the CC0 kit's under the kit's own file paths (Philip,
// 2026-09-28: "move onto bushes, rocks, flowers, other nature items ... just
// do them all"). Each is built to the kit model's MEASURED bounds
// (env_manifest_cc0.json, tabled below), so every zone's placement, burial
// and scale still gives what it was tuned to give. The kit's files are gone
// (2026-10-18); its paths stay as the keys, and the manifest keeps their rows
// (tools/assets/gen_cc0_manifest.py keep_retired).
//
// Two families, because of how the scene recolours things:
//
// - STONE AND WOOD (rocks, pebbles, stepping stones, mushrooms, logs) are
//   plain PBR, no material plugin: their detail is in textures, a bump map
//   and vertex colours. The scene tints them (rockTint, placeExact tints) and
//   snows them (SnowCapPlugin) by CLONING the material, and a Babylon clone
//   rebuilds plugins only from registered, serialised classes -- so anything
//   that must survive a tint lives in the data, not in a plugin.
// - PLANTS (bushes, flowers, grass, ferns, plants) are foliage cards on the
//   trees' own shader (trees.ts foliageMaterial: a painted greyscale sheet
//   coloured by a ramp, wind, flutter, tint and snow) and register with
//   trees.ts, whose variant path builds tinted and snowy copies itself
//   instead of cloning.
//
// Colours come from the kit's own swatches (the table carries them), so a
// zone that chose the purple flower or the red bush for its colour keeps it.
import {
  Color3, DynamicTexture, Material, MaterialPluginBase, Mesh, MultiMaterial, PBRMaterial, Scene, SubMesh,
  Texture, Vector3, VertexData,
} from "@babylonjs/core";
import {
  registerGeneratedFoliage, foliageMaterial, woodMaterial, canvasSheet, drawLeaves, grey,
  leafSheetFor, sheet, mulberry, curve, norm, cross, rotateAbout, tube, type V3, type Limb,
} from "./trees";

// GENERATED from client/src/env_manifest_cc0.json (the kit models these stand in for):
// [kind, min x/y/z, max x/y/z, the kit's material swatches] -- sizes MEASURED, not chosen.
type Row = [string, number, number, number, number, number, number, string[]];
const NATURE_KIT: Record<string, Row> = {
  "nature/Grass_Common_Short.gltf": ["grass", -0.307, -0.027, -0.368, 0.330, 1.301, 0.372, ["Grass=#5e9f09"]],
  "nature/Grass_Wispy_Short.gltf": ["grass", -0.662, -0.034, -0.599, 0.662, 1.039, 0.608, ["Grass=#ad9200"]],
  "nature/Rock_Big_1.gltf": ["rock", -2.384, -0.118, -2.000, 2.814, 4.458, 2.447, ["Rocks=#535b4b"]],
  "nature/Grass_Wide_Short.gltf": ["grass", -0.484, -0.023, -0.544, 0.555, 1.281, 0.528, ["Grass=#2e9000"]],
  "WoodLog.glb": ["log", -0.300, -0.000, -1.500, 0.330, 0.750, 1.170, ["Wood=#1f0e0c", "Mushroom_Top=#1f1614", "Mushroom_Bottom=#4d3730"]],
  "nature/Rock_Big_2.gltf": ["rock", -2.765, -0.107, -2.877, 3.004, 3.705, 2.946, ["Rocks=#4e5648"]],
  "nature/Grass_Wispy_Tall.gltf": ["grass", -0.807, -0.037, -0.768, 0.737, 1.629, 0.822, ["Grass=#ac9100"]],
  "nature/Flower_4_Group.gltf": ["flower", -0.930, -0.063, -0.641, 0.847, 2.426, 0.732, ["Leaves=#569f39", "Flowers=#f1cd1f"]],
  "nature/Flower_1_Group.gltf": ["flower", -0.943, -0.063, -0.884, 0.890, 1.439, 0.839, ["Leaves=#7ba916", "Flowers=#eac296"]],
  "nature/Rock_Medium_4.gltf": ["rock", -1.941, -0.073, -1.740, 1.843, 2.410, 1.871, ["Rocks=#49553a"]],
  "nature/Rock_Medium_1.gltf": ["rock", -1.579, -0.091, -1.577, 1.651, 2.169, 1.414, ["Rocks=#505945"]],
  "nature/Grass_Wheat.gltf": ["grass", -0.542, -0.045, -0.522, 0.570, 1.738, 0.491, ["Grass=#bb5700"]],
  "nature/Bush_Long_1.gltf": ["bush", -0.817, -0.059, -0.782, 0.865, 2.311, 0.861, ["Leaves_NormalTree=#587a00"]],
  "nature/Bush_Large.gltf": ["bush", -1.720, -0.421, -1.824, 1.878, 2.829, 1.844, ["Leaves_GiantPine=#3d6d00"]],
  "nature/Rock_Medium_3.gltf": ["rock", -1.686, -0.071, -1.740, 1.738, 2.253, 1.742, ["Rocks=#4c5741"]],
  "nature/Fern_2.gltf": ["fern", -2.695, -0.160, -2.846, 2.694, 2.333, 2.878, ["Leaves=#819304"]],
  "nature/Clover_2.gltf": ["grass", -0.418, -0.002, -0.409, 0.431, 1.261, 0.431, ["Leaves=#73ae27"]],
  "nature/Rock_Medium_2.gltf": ["rock", -1.714, -0.049, -1.158, 1.335, 1.853, 1.321, ["Rocks=#4d5644"]],
  "nature/Fern_1.gltf": ["fern", -4.422, -0.252, -4.094, 4.628, 2.437, 4.395, ["Leaves=#538c21"]],
  "nature/Plant_5.gltf": ["plant", -0.712, -0.050, -0.787, 0.699, 1.342, 0.733, ["Leaves=#59a13c"]],
  "nature/Pebble_Round_2.gltf": ["pebble", -0.214, -0.000, -0.221, 0.234, 0.090, 0.191, ["PathRocks=#656b5f"]],
  "nature/Mushroom_Common.gltf": ["mushroom", -0.249, -0.019, -0.314, 0.309, 0.440, 0.465, ["Mushrooms=#99887a"]],
  "nature/Grass_Wide_Tall.gltf": ["grass", -0.574, -0.043, -0.559, 0.577, 1.569, 0.550, ["Grass=#379600"]],
  "nature/Flower_2_Group.gltf": ["flower", -0.728, -0.069, -0.586, 0.787, 1.500, 0.557, ["Leaves=#59a23b", "Flowers=#a984c4"]],
  "nature/Clover_1.gltf": ["grass", -0.408, -0.006, -0.388, 0.391, 1.135, 0.376, ["Leaves=#73ad27"]],
  "nature/Plant_1_Big.gltf": ["plant", -1.472, -0.052, -1.554, 1.417, 3.705, 1.573, ["Leaves=#8a9f17"]],
  "nature/Mushroom_Oyster.gltf": ["mushroom", -1.066, -0.171, -0.152, 1.319, 1.610, 1.251, ["Mushrooms=#968675"]],
  "nature/Grass_Common_Tall.gltf": ["grass", -0.452, -0.041, -0.487, 0.443, 1.829, 0.504, ["Grass=#67a312"]],
  "nature/Bush_Long_2.gltf": ["bush", -0.777, -0.061, -0.753, 0.829, 2.698, 0.807, ["Leaves_NormalTree=#577a00"]],
  "nature/Plant_1.gltf": ["plant", -0.631, -0.024, -0.719, 0.639, 0.986, 0.671, ["Leaves=#8a9f17"]],
  "nature/Petal_2.gltf": ["petals", -0.320, 0.003, -0.332, 0.347, 0.243, 0.302, ["Flowers=#eac296"]],
  "nature/Flower_7_Group.gltf": ["flower", -0.954, -0.075, -0.895, 0.887, 1.639, 0.932, ["Leaves=#76af27", "Flowers=#e75030"]],
  "nature/Flower_2_Single.gltf": ["flower", -0.256, -0.072, -0.346, 0.296, 1.614, 0.374, ["Leaves=#59a23c", "Flowers=#a984c4"]],
  "nature/Bush_Large_Flowers.gltf": ["bush", -1.867, -0.424, -1.824, 1.935, 2.834, 1.844, ["Flowers=#de7778", "Leaves_GiantPine=#3d6d00"]],
  "nature/Bush_Common_Flowers.gltf": ["bush", -0.974, -0.047, -1.002, 0.939, 1.537, 0.960, ["Leaves_NormalTree=#587a00", "Flowers=#a984c4"]],
  "nature/RockPath_Square_Thin.gltf": ["pathstone", -0.769, -0.015, -0.986, 0.787, 0.165, 1.002, ["PathRocks=#585f55"]],
  "nature/RockPath_Round_Wide.gltf": ["pathstone", -1.051, -0.012, -1.129, 1.063, 0.101, 1.003, ["PathRocks=#60675a"]],
  "nature/Plant_7.gltf": ["plant", -0.453, 0.080, -0.463, 0.599, 0.327, 0.500, ["Leaves=#6939a1"]],
  "nature/Plant_6.gltf": ["plant", -0.391, -0.031, -0.503, 0.505, 0.901, 0.477, ["Leaves=#bb4320"]],
  "nature/Plant_3.gltf": ["plant", -0.891, -0.017, -0.889, 0.946, 0.690, 0.855, ["Leaves=#dd6d16"]],
  "nature/Petal_5.gltf": ["petals", -0.427, 0.003, -0.418, 0.401, 0.293, 0.378, ["Flowers=#de7778"]],
  "nature/Petal_3.gltf": ["petals", -0.305, 0.004, -0.312, 0.314, 0.192, 0.296, ["Flowers=#e5412d"]],
  "nature/Petal_1.gltf": ["petals", -0.209, 0.004, -0.214, 0.253, 0.244, 0.244, ["Flowers=#a984c4"]],
  "nature/Mushroom_RedCap.gltf": ["mushroom", -0.894, -0.020, -0.740, 0.787, 0.896, 0.969, ["Mushrooms=#bd9163"]],
  "nature/Flower_4_Single.gltf": ["flower", -0.599, -0.066, -0.380, 0.475, 2.357, 0.393, ["Leaves=#569f39", "Flowers=#f1cd1f"]],
  "nature/Flower_3_Single.gltf": ["flower", -0.411, -0.068, -0.406, 0.500, 2.001, 0.472, ["Leaves=#78a615", "Flowers=#de7678"]],
  "nature/Flower_3_Group.gltf": ["flower", -0.705, -0.068, -0.767, 0.787, 1.989, 0.820, ["Leaves=#79a415", "Flowers=#de7778"]],
  "BushBerries_1.glb": ["bush", -0.694, -0.058, -0.856, 0.694, 1.221, 0.863, ["Green=#121f0c", "Berry=#5f0608"]],
  "Rock_Moss_3.glb": ["rock", -0.381, -0.217, -0.400, 0.363, 0.340, 0.400, ["Rock=#32353e", "Green=#121f0c"]],
  "Rock_Moss_2.glb": ["rock", -0.302, -0.207, -0.323, 0.305, 0.487, 0.323, ["Rock=#32353e", "Green=#121f0c"]],
  "Rock_Moss_1.glb": ["rock", -0.176, -0.172, -0.229, 0.299, 0.778, 0.236, ["Rock=#32353e", "Green=#121f0c"]],
  "Rock_7.glb": ["rock", -0.436, -0.198, -0.548, 0.440, 0.656, 0.548, ["Rock=#32353e"]],
  "Rock_5.glb": ["rock", -0.332, -0.188, -0.461, 0.332, 0.459, 0.461, ["Rock=#32353e"]],
  "Rock_3.glb": ["rock", -0.381, -0.217, -0.400, 0.363, 0.459, 0.400, ["Rock=#32353e"]],
  "Rock_2.glb": ["rock", -0.281, -0.214, -0.279, 0.281, 0.437, 0.279, ["Rock=#32353e"]],
  "Rock_1.glb": ["rock", -0.176, -0.172, -0.229, 0.299, 0.708, 0.236, ["Rock=#32353e"]],
  "Plant_3.glb": ["plant", -0.556, -0.001, -0.444, 0.538, 0.942, 0.524, ["DarkGreen=#0b1308"]],
  "Plant_1.glb": ["plant", -0.596, -0.001, -0.477, 0.604, 0.506, 0.466, ["Green=#121f0c"]],
  "nature/RockPath_Square_Wide.gltf": ["pathstone", -1.010, -0.018, -0.987, 1.037, 0.165, 1.003, ["PathRocks=#595f55"]],
  "nature/RockPath_Square_Small_3.gltf": ["pathstone", -0.439, -0.014, -0.548, 0.405, 0.157, 0.528, ["PathRocks=#585f54"]],
  "nature/RockPath_Square_Small_2.gltf": ["pathstone", -0.503, -0.012, -0.459, 0.490, 0.140, 0.510, ["PathRocks=#585f55"]],
  "nature/RockPath_Square_Small_1.gltf": ["pathstone", -0.509, -0.013, -0.476, 0.510, 0.138, 0.492, ["PathRocks=#595f55"]],
  "nature/RockPath_Round_Thin.gltf": ["pathstone", -0.747, -0.011, -1.047, 0.714, 0.101, 1.047, ["PathRocks=#62695c"]],
  "nature/RockPath_Round_Small_3.gltf": ["pathstone", -0.609, -0.011, -0.644, 0.575, 0.101, 0.644, ["PathRocks=#62695c"]],
  "nature/RockPath_Round_Small_2.gltf": ["pathstone", -0.571, -0.011, -0.683, 0.571, 0.101, 0.666, ["PathRocks=#61685b"]],
  "nature/RockPath_Round_Small_1.gltf": ["pathstone", -0.544, -0.011, -0.748, 0.517, 0.101, 0.733, ["PathRocks=#5f6658"]],
  "nature/Plant_7_Big.gltf": ["plant", -0.670, 0.080, -0.698, 0.643, 0.327, 0.667, ["Leaves=#6939a1"]],
  "nature/Plant_4.gltf": ["plant", -0.923, -0.050, -0.815, 0.916, 1.518, 0.922, ["Leaves=#bc3d83"]],
  "nature/Plant_2.gltf": ["plant", -0.679, -0.045, -0.695, 0.691, 1.515, 0.681, ["Leaves=#1b5a9c"]],
  "nature/Plant_2_Big.gltf": ["plant", -0.690, -0.045, -0.695, 0.691, 2.725, 0.681, ["Leaves=#1b5b9d"]],
  "nature/Petal_6.gltf": ["petals", -0.299, 0.004, -0.318, 0.330, 0.537, 0.341, ["Flowers=#e75030"]],
  "nature/Petal_4.gltf": ["petals", -0.165, 0.003, -0.105, 0.168, 0.248, 0.132, ["Flowers=#f1cd1f"]],
  "nature/Pebble_Square_6.gltf": ["pebble", -0.231, -0.000, -0.131, 0.231, 0.141, 0.131, ["PathRocks=#616663"]],
  "nature/Pebble_Square_5.gltf": ["pebble", -0.175, -0.000, -0.225, 0.175, 0.150, 0.225, ["PathRocks=#5a6159"]],
  "nature/Pebble_Square_4.gltf": ["pebble", -0.168, -0.000, -0.145, 0.168, 0.166, 0.145, ["PathRocks=#5c625b"]],
  "nature/Pebble_Square_3.gltf": ["pebble", -0.186, -0.000, -0.162, 0.186, 0.160, 0.162, ["PathRocks=#5a6157"]],
  "nature/Pebble_Square_2.gltf": ["pebble", -0.194, -0.000, -0.139, 0.194, 0.143, 0.139, ["PathRocks=#575e53"]],
  "nature/Pebble_Square_1.gltf": ["pebble", -0.214, -0.000, -0.220, 0.214, 0.131, 0.220, ["PathRocks=#585e54"]],
  "nature/Pebble_Round_5.gltf": ["pebble", -0.198, -0.000, -0.175, 0.222, 0.098, 0.175, ["PathRocks=#545d4b"]],
  "nature/Pebble_Round_4.gltf": ["pebble", -0.203, -0.000, -0.226, 0.203, 0.098, 0.226, ["PathRocks=#6a7065"]],
  "nature/Pebble_Round_3.gltf": ["pebble", -0.227, -0.000, -0.240, 0.227, 0.098, 0.240, ["PathRocks=#6c7266"]],
  "nature/Pebble_Round_1.gltf": ["pebble", -0.247, -0.000, -0.184, 0.247, 0.098, 0.184, ["PathRocks=#62695e"]],
  "nature/Mushroom_Laetiporus.gltf": ["mushroom", -0.686, -0.025, -0.528, 0.683, 0.748, 0.568, ["Mushrooms=#c29858"]],
  "nature/Flower_7_Single.gltf": ["flower", -0.588, -0.074, -0.427, 0.453, 1.506, 0.486, ["Leaves=#76b027", "Flowers=#e75030"]],
  "nature/Flower_6.gltf": ["flower", -0.487, -0.004, -0.443, 0.476, 0.157, 0.451, ["Leaves=#6aa724", "Flowers=#e5422e"]],
  "nature/Flower_6_2.gltf": ["flower", -0.484, -0.004, -0.431, 0.469, 0.149, 0.434, ["Leaves=#6aa724", "Flowers=#e4412d"]],
  "nature/Flower_1_Single.gltf": ["flower", -0.243, -0.068, -0.268, 0.244, 1.470, 0.279, ["Leaves=#7caa16", "Flowers=#eac296"]],
  "nature/Bush_Common.gltf": ["bush", -0.974, -0.047, -1.002, 0.939, 1.537, 0.960, ["Leaves_TwistedTree=#a71717"]],
  "Grass.glb": ["grass", -0.197, -0.016, -0.163, 0.177, 0.997, 0.163, ["Green=#121f0c"]],
  "Grass_Short.glb": ["grass", -0.191, -0.005, -0.255, 0.125, 0.399, 0.185, ["Green=#121f0c"]],
  "Flowers.glb": ["flower", -0.249, -0.011, -0.326, 0.244, 0.817, 0.285, ["Green=#121f0c", "Cyan=#003234", "Yellow=#5b4817"]],
  "Bush_2.glb": ["bush", -0.679, -0.021, -0.698, 0.674, 1.093, 0.628, ["Green=#121f0c"]],
  "Bush_1.glb": ["bush", -0.664, -0.036, -0.845, 0.664, 1.205, 0.845, ["Green=#121f0c"]],
  // referenced by zones but absent from the kit (they drew nothing): sized
  // from their siblings -- the log from WoodLog.glb, the big plants at the
  // Plant_1 / Plant_1_Big ratio (x2.2 wide, x2.7 tall)
  "nature/WoodLog.gltf": ["log", -0.300, -0.000, -1.500, 0.330, 0.750, 1.170, ["Wood=#1f0e0c"]],
  "nature/Plant_3_Big.gltf": ["plant", -1.960, -0.030, -1.960, 2.080, 1.860, 1.880, ["Leaves=#dd6d16"]],
  "nature/Plant_4_Big.gltf": ["plant", -2.030, -0.050, -1.790, 2.020, 4.100, 2.030, ["Leaves=#bc3d83"]],
};

const swatch = (row: Row, name: RegExp): string | null => {
  for (const s of row[7]) { const [n, c] = s.split("="); if (name.test(n)) return c; }
  return null;
};
// the old kit's near-black "Green" swatch is a mask colour, not a green
const usable = (hex: string | null): string | null => {
  if (!hex) return null;
  const c = Color3.FromHexString(hex);
  return Math.max(c.r, c.g, c.b) < 0.2 ? null : hex;
};
// A shade-mid-lit ramp around a swatch: the swatch is the mid, the shade a
// deep version of it, the lit a sunnier, slightly warmer one.
export function rampOf(hex: string): [string, string, string] {
  const c = Color3.FromHexString(hex);
  const shade = c.scale(0.38);
  const lit = new Color3(Math.min(1, c.r * 1.55 + 0.1), Math.min(1, c.g * 1.45 + 0.08), Math.min(1, c.b * 1.3 + 0.04));
  return [shade.toHexString(), c.toHexString(), lit.toHexString()];
}
const LEAF_RAMP: [string, string, string] = ["#1d3517", "#4c7a2a", "#b3cf5e"];   // the broadleaf's

// ---------- the painted sheets ----------
export type Blades = "common" | "wide" | "wispy" | "wheat";
export function drawBlades(ctx: CanvasRenderingContext2D, S: number, rand: () => number, style: Blades): void {
  const n = style === "wispy" ? 70 : style === "wide" ? 26 : 44;
  const blades = Array.from({ length: n }, () => ({
    x: S * (0.12 + rand() * 0.76), h: S * (0.45 + Math.pow(rand(), 0.6) * 0.5),
    w: style === "wide" ? 16 + rand() * 12 : style === "wispy" ? 3 + rand() * 3 : 7 + rand() * 6,
    lean: (rand() - 0.5) * (style === "wispy" ? 300 : 160), l: 0.72 + rand() * 0.28,
  })).sort((a, b) => b.h - a.h);
  for (const b of blades) {
    const y0 = S, y1 = S - b.h, tipX = b.x + b.lean;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, grey(b.l * 0.55)); g.addColorStop(0.5, grey(b.l * 0.85)); g.addColorStop(1, grey(b.l));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x - b.w / 2, y0);
    ctx.quadraticCurveTo(b.x + b.lean * 0.3 - b.w * 0.3, y0 - b.h * 0.6, tipX, y1);
    ctx.quadraticCurveTo(b.x + b.lean * 0.3 + b.w * 0.3, y0 - b.h * 0.6, b.x + b.w / 2, y0);
    ctx.fill();
    if (style === "wheat" && rand() < 0.7) {
      // the ear: a string of grains up the last fifth, pale and bright
      for (let k = 0; k < 9; k++) {
        const t = 0.8 + k * 0.022, x = b.x + (tipX - b.x) * t * t, y = y0 - b.h * t;
        ctx.fillStyle = grey(0.95);
        ctx.beginPath();
        ctx.ellipse(x - 4, y, 4, 7, -0.4, 0, Math.PI * 2);
        ctx.ellipse(x + 4, y, 4, 7, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
// A pinnate frond laid along U: a rachis out from the left edge, leaflets
// down both sides, shortening to the tip, each leaflet lobed.
export function drawFern(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  const y0 = S * 0.5;
  for (let i = 0; i < 26; i++) {
    const t = 0.04 + i * 0.036, x = S * t;
    const len = S * 0.42 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (0.85 + rand() * 0.2) + 6;
    for (const side of [-1, 1]) {
      const a = side * (1.15 + t * 0.35);
      const lit = side < 0 ? 0.95 : 0.7;
      for (let k = 0; k < 7; k++) {
        const f = (k + 0.5) / 7, px = x + Math.cos(a) * len * f * 0.9, py = y0 + Math.sin(a) * len * f;
        ctx.fillStyle = grey(lit * (0.75 + f * 0.25));
        ctx.beginPath();
        ctx.ellipse(px, py, len * 0.09 * (1.2 - f * 0.6), len * 0.05, a + side * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.strokeStyle = grey(0.35); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(S * 0.98, y0); ctx.stroke();
}
// One broad leaf laid along U from its stalk at the left edge: a pointed
// oval, a pale midrib and paired veins, lighter toward the tip.
export function drawBigLeaf(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  const y0 = S * 0.5, x0 = S * 0.06, x1 = S * 0.97, w = S * 0.36;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, grey(0.5)); g.addColorStop(1, grey(0.95));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(S * 0.3, y0 - w * 1.2, S * 0.75, y0 - w * 0.8, x1, y0);
  ctx.bezierCurveTo(S * 0.75, y0 + w * 0.8, S * 0.3, y0 + w * 1.2, x0, y0);
  ctx.fill();
  ctx.strokeStyle = grey(0.4); ctx.lineWidth = 3;
  for (let i = 1; i < 9; i++) {
    const x = x0 + (x1 - x0) * i / 9.5, h = w * Math.sin((i / 9.5) * Math.PI) * 0.8;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + S * 0.05, y0 + side * h * 0.5, x + S * 0.09, y0 + side * h); ctx.stroke(); }
  }
  ctx.strokeStyle = grey(1); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(x1 - 8, y0); ctx.stroke();
  ctx.lineWidth = 1; void rand;
}
function drawClover(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  for (let i = 0; i < 26; i++) {
    const cx = S * (0.1 + rand() * 0.8), cy = S * (0.15 + rand() * 0.75), r = S * (0.035 + rand() * 0.025), a0 = rand() * 6.28;
    const l = 0.55 + (1 - cy / S) * 0.35 + rand() * 0.1;
    for (let k = 0; k < 3; k++) {
      const a = a0 + k * 2.094;
      ctx.fillStyle = grey(l);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.9 + Math.cos(a + 0.5) * r * 0.35, cy + Math.sin(a) * r * 0.9 + Math.sin(a + 0.5) * r * 0.35, r * 0.6, 0, Math.PI * 2);
      ctx.arc(cx + Math.cos(a) * r * 0.9 + Math.cos(a - 0.5) * r * 0.35, cy + Math.sin(a) * r * 0.9 + Math.sin(a - 0.5) * r * 0.35, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
// A flower head, face-on, centred: petals in the mid-to-lit end of the ramp,
// the heart dark (the ramp's shade end, which each flower sets to its heart
// colour).
export type Head = "daisy" | "five" | "star" | "poppy";
export function drawHead(ctx: CanvasRenderingContext2D, S: number, rand: () => number, style: Head): void {
  const c = S / 2, R = S * 0.46;
  const petals = style === "daisy" ? 16 : style === "five" ? 5 : style === "star" ? 6 : 4;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + rand() * 0.1;
    const len = style === "poppy" ? R * 0.95 : style === "star" ? R : style === "daisy" ? R * 0.95 : R * 0.9;
    const wid = style === "daisy" ? R * 0.13 : style === "star" ? R * 0.22 : style === "poppy" ? R * 0.62 : R * 0.42;
    const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, len);
    g.addColorStop(0, grey(0.6)); g.addColorStop(1, grey(1));
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(c, c); ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (style === "star") { ctx.lineTo(len * 0.5, -wid); ctx.lineTo(len, 0); ctx.lineTo(len * 0.5, wid); }
    else { ctx.quadraticCurveTo(len * 0.5, -wid * 1.3, len, 0); ctx.quadraticCurveTo(len * 0.5, wid * 1.3, 0, 0); }
    ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = grey(0.12);
  ctx.beginPath(); ctx.arc(c, c, R * (style === "daisy" ? 0.26 : 0.16), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = grey(0.28);
  for (let k = 0; k < 14; k++) { const a = rand() * 6.28, r = rand() * R * 0.13; ctx.beginPath(); ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3, 0, Math.PI * 2); ctx.fill(); }
}
export function drawPetals(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  for (let i = 0; i < 60; i++) {
    const r = Math.sqrt(rand()) * S * 0.44, a = rand() * 6.28;
    ctx.fillStyle = grey(0.65 + rand() * 0.35);
    ctx.beginPath();
    ctx.ellipse(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * (0.02 + rand() * 0.015), S * (0.012 + rand() * 0.01), rand() * 6.28, 0, Math.PI * 2);
    ctx.fill();
  }
}
export function drawBerries(ctx: CanvasRenderingContext2D, S: number, rand: () => number): void {
  for (let i = 0; i < 40; i++) {
    const r = Math.sqrt(rand()) * S * 0.42, a = rand() * 6.28, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, br = S * (0.025 + rand() * 0.012);
    const g = ctx.createRadialGradient(x - br * 0.35, y - br * 0.35, br * 0.1, x, y, br);
    g.addColorStop(0, grey(1)); g.addColorStop(0.35, grey(0.75)); g.addColorStop(1, grey(0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.fill();
  }
}
export const sheetOf = (scene: Scene, key: string, draw: (ctx: CanvasRenderingContext2D, S: number, rand: () => number) => void) =>
  sheet(scene, `nature_${key}`, () => canvasSheet(scene, `gtNature_${key}`, draw, 31));

// STONE, painted: a 512 sheet of weathered rock -- warped multi-octave noise
// for the mottling and the veins, a fine crack network (cellular edges),
// grain -- and the normal map of the same height field. Neutral in colour:
// the hue is the material's albedoColor (a zone's rock tint replaces it) and
// the moss is added in the shader. FFXIV's rocks are mostly THIS: a dense,
// crinkled, mottled surface over a soft shape (Philip's references).
// Value noise that TILES: `px` cells across the sheet and `py` down it, both
// whole numbers, so the sheet wraps without a seam. Stretch the grain by
// choosing different whole periods, NEVER by scaling the coordinates --
// MEASURED: ridged(x * 0.8, y * 1.25) put a seam every repeat of the sheet
// (every 2.4m on a rock; Philip saw them).
function tileNoise(W: number, px: number, seed: number, py = px): (x: number, y: number) => number {
  const r = mulberry(seed), g = new Float32Array(px * py).map(() => r());
  const at = (i: number, j: number) => g[((j % py + py) % py) * px + ((i % px + px) % px)];
  return (x, y) => {
    const fx = x / W * px, fy = y / W * py, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
  };
}
function stoneSheets(scene: Scene): { diffuse: Texture; normal: Texture } {
  const t = sheet(scene, "nature_stone3", () => {
    const W = 512;
    const oct = [3, 6, 12, 24, 48, 96, 192].map((p, i) => tileNoise(W, p, 900 + i));
    // the bedding grain: the same octaves, longer across than down
    const bed = [5, 10, 19, 38, 77, 154].map((p, i) => tileNoise(W, Math.round(p * 0.8), 920 + i, Math.round(p * 1.25)));
    const drifter = tileNoise(W, 2, 940);
    const warp = tileNoise(W, 5, 950), warp2 = tileNoise(W, 5, 951), warp3 = tileNoise(W, 17, 952), warp4 = tileNoise(W, 17, 953);
    // ridged fbm: 1-|2n-1| turns each octave's smooth hills into sharp
    // crests, which in stone reads as crinkled, layered weathering
    const ridged = (x: number, y: number) => {
      let v = 0, a = 0.5, n = 0;
      for (const o of bed) { const r = 1 - Math.abs(o(x, y) * 2 - 1); v += r * r * a; n += a; a *= 0.58; }
      return v / n;
    };
    const smoothF = (x: number, y: number) => (oct[0](x, y) * 0.6 + oct[1](x, y) * 0.4);
    const h = new Float32Array(W * W), col = new Float32Array(W * W * 3), rn = mulberry(980);
    // lichen: small scattered spots, pale and dark
    const spots = new Float32Array(W * W);
    for (let k = 0; k < 900; k++) {
      const cx = rn() * W, cy = rn() * W, r = 1 + rn() * 3.5, v = rn() < 0.6 ? 0.22 : -0.28;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
        spots[((y + W) % W) * W + ((x + W) % W)] = v * (1 - d / r * 0.5);
      }
    }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      // two levels of domain warp: broad folds, then a finer ripple, and a
      // stretch along one axis so the crinkle has a grain like bedding planes
      const wx = x + (warp(x, y) - 0.5) * 90 + (warp3(x, y) - 0.5) * 18;
      const wy = y + (warp2(x, y) - 0.5) * 90 + (warp4(x, y) - 0.5) * 18;
      const r = ridged(wx, wy);
      const big = smoothF(wx, wy);
      const grain = rn() - 0.5;
      // a few long dark fissures: where the broad field crosses a level, thinly
      const fis = Math.max(0, 1 - Math.abs(oct[2](wx, wy) - 0.5) * 40) * (big > 0.45 ? 1 : 0.3);
      const i = y * W + x;
      h[i] = r * 0.75 + big * 0.35 - fis * 0.12 + grain * 0.04;
      let v = 0.22 + r * 0.62 + (big - 0.5) * 0.35 - fis * 0.35 + spots[i] + grain * 0.08;
      v = Math.max(0.04, Math.min(1.0, v));
      const drift = drifter(x, y) - 0.5;
      col[i * 3] = v * (1 + drift * 0.18); col[i * 3 + 1] = v * (1 + drift * 0.04); col[i * 3 + 2] = v * (1 - drift * 0.16);
    }
    const diffuse = new DynamicTexture("gtStone3", { width: W, height: W }, scene, true);
    const normal = new DynamicTexture("gtStone3Normal", { width: W, height: W }, scene, true);
    const dc = diffuse.getContext() as unknown as CanvasRenderingContext2D, nc = normal.getContext() as unknown as CanvasRenderingContext2D;
    const di = dc.createImageData(W, W), ni = nc.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      di.data[i * 4] = Math.min(255, col[i * 3] * 255); di.data[i * 4 + 1] = Math.min(255, col[i * 3 + 1] * 255); di.data[i * 4 + 2] = Math.min(255, col[i * 3 + 2] * 255); di.data[i * 4 + 3] = 255;
      const hx = h[y * W + ((x + 1) % W)] - h[y * W + ((x - 1 + W) % W)], hy = h[((y + 1) % W) * W + x] - h[((y - 1 + W) % W) * W + x];
      const n = new Vector3(-hx * 7, -hy * 7, 1).normalize();
      ni.data[i * 4] = (n.x * 0.5 + 0.5) * 255; ni.data[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; ni.data[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255; ni.data[i * 4 + 3] = 255;
    }
    dc.putImageData(di, 0, 0); diffuse.update(true);
    nc.putImageData(ni, 0, 0); normal.update(true);
    for (const tx of [diffuse, normal]) { tx.wrapU = tx.wrapV = Texture.WRAP_ADDRESSMODE; tx.anisotropicFilteringLevel = 8; }
    normal.gammaSpace = false;
    (diffuse as any).__normal = normal;
    return diffuse;
  });
  return { diffuse: t, normal: (t as any).__normal };
}

// ---------- assembling a mesh from parts ----------
export class Parts {
  parts: { mat: Material; pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[]; computeNormals: boolean }[] = [];
  part(mat: Material, computeNormals = false) {
    const p = { mat, pos: [] as number[], nrm: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[], computeNormals };
    this.parts.push(p);
    return p;
  }
  build(name: string, scene: Scene, fit: Row | null, heightTop: number): Mesh {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const ranges: [number, number][] = [];
    for (const p of this.parts) {
      const base = pos.length / 3, start = idx.length;
      const n = p.computeNormals ? (() => { const out: number[] = []; VertexData.ComputeNormals(p.pos, p.idx, out); return out; })() : p.nrm;
      pos.push(...p.pos); nrm.push(...n); uv.push(...p.uv); col.push(...p.col);
      for (const i of p.idx) idx.push(i + base);
      ranges.push([start, idx.length - start]);
    }
    // fit to the kit model's measured box, axis by axis
    if (fit) {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i + a]); mx[a] = Math.max(mx[a], pos[i + a]); }
      const kmn = [fit[1], fit[2], fit[3]], kmx = [fit[4], fit[5], fit[6]];
      const s = [0, 1, 2].map((a) => (kmx[a] - kmn[a]) / Math.max(1e-4, mx[a] - mn[a]));
      for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) pos[i + a] = kmn[a] + (pos[i + a] - mn[a]) * s[a];
      // a non-uniform fit bends the normals: take them through the inverse scale
      for (let i = 0; i < nrm.length; i += 3) {
        const v = norm([nrm[i] / s[0], nrm[i + 1] / s[1], nrm[i + 2] / s[2]]);
        nrm[i] = v[0]; nrm[i + 1] = v[1]; nrm[i + 2] = v[2];
      }
      // the sway's height fraction (colour alpha) is re-read off the fitted heights
      const top = Math.max(1e-3, kmx[1]);
      for (let i = 0; i < col.length / 4; i++) col[i * 4 + 3] = Math.max(0, Math.min(1, pos[i * 3 + 1] / top));
    } else if (heightTop > 0) {
      for (let i = 0; i < col.length / 4; i++) col[i * 4 + 3] = Math.max(0, Math.min(1, pos[i * 3 + 1] / heightTop));
    }
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.colors = col; vd.indices = idx;
    vd.applyToMesh(mesh);
    mesh.hasVertexAlpha = false;
    const total = pos.length / 3;
    if (this.parts.length > 1) {
      mesh.subMeshes = [];
      ranges.forEach(([s0, n], i) => new SubMesh(i, 0, total, s0, n, mesh));
      const multi = new MultiMaterial(`${name}_multi`, scene);
      multi.subMaterials = this.parts.map((p) => p.mat);
      mesh.material = multi;
    } else mesh.material = this.parts[0].mat;
    mesh.isPickable = false;
    return mesh;
  }
}
export type Part = ReturnType<Parts["part"]>;

// A foliage card: `o` is its base (anchor "base") or centre, U/V its axes,
// N the lighting normal, `u0..u1` the slice of the sheet along U.
export function card(p: Part, o: V3, U: V3, V: V3, w: number, h: number, anchor: "base" | "center", N: V3, ao: number, u0 = 0, u1 = 1): void {
  const base = p.pos.length / 3;
  const corners: [number, number, number, number][] = anchor === "base"
    ? [[0, -0.5, u0, 0], [1, -0.5, u1, 0], [1, 0.5, u1, 1], [0, 0.5, u0, 1]]
    : [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
  for (const [a, b, uu, vv] of corners) {
    p.pos.push(o[0] + U[0] * a * w + V[0] * b * h, o[1] + U[1] * a * w + V[1] * b * h, o[2] + U[2] * a * w + V[2] * b * h);
    p.nrm.push(N[0], N[1], N[2]);
    p.uv.push(uu, vv);
    p.col.push(ao, ao, ao, 0);
  }
  p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// an upright card, U up (for blades anchored at the ground: the sheet's
// bottom edge is its root)
export function uprightCard(p: Part, o: V3, yaw: number, w: number, h: number, lean: number, N: V3, ao: number): void {
  const side: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const out: V3 = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const up = norm([out[0] * lean, 1, out[2] * lean]);
  const base = p.pos.length / 3;
  for (const [a, b] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as [number, number][]) {
    p.pos.push(o[0] + side[0] * a * w + up[0] * b * h, o[1] + up[1] * b * h, o[2] + side[2] * a * w + up[2] * b * h);
    p.nrm.push(N[0], N[1], N[2]);
    p.uv.push(a + 0.5, b);
    p.col.push(ao + (1 - ao) * b, ao + (1 - ao) * b, ao + (1 - ao) * b, 0);
  }
  p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const UP: V3 = [0, 1, 0];
const softUp = (d: V3, k = 0.55): V3 => norm([d[0], d[1] + k, d[2]]);

// ---------- PLANTS ----------
export function seedOf(file: string): number { let h = 2166136261; for (let i = 0; i < file.length; i++) h = Math.imul(h ^ file.charCodeAt(i), 16777619); return h >>> 0; }

function buildBush(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const leafHex = usable(swatch(row, /^Leaves|^Green/));
  const ramp = leafHex ? rampOf(leafHex) : LEAF_RAMP;
  const small = /Long|Common|Bush_\d/.test(file);
  const parts = new Parts();
  const wood = parts.part(woodMaterial(scene, "broadleaf", tint, snow), true);
  const leaves = parts.part(foliageMaterial(scene, `bushleaf_${small ? "s" : "l"}_${ramp[1]}`, leafSheetFor(scene, small ? "smallleaf" : "leaf"), ramp, tint, snow));
  // a unit bush: a rounded mass about (0, 0.55, 0), radius ~0.5; fitted to the kit box at the end
  const C: V3 = [0, 0.55, 0], R: V3 = [0.5, 0.45, 0.5];
  for (let i = 0; i < 4; i++) {
    const a = rr(0, 6.28), end: V3 = [Math.sin(a) * 0.25, rr(0.45, 0.7), Math.cos(a) * 0.25];
    tube({ pts: curve([Math.sin(a) * 0.04, 0, Math.cos(a) * 0.04], [end[0] * 0.3, end[1] * 0.5, end[2] * 0.3], end, 2), r0: 0.03, r1: 0.008, sides: 4 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 0, 1);
  }
  const clumps = Math.round(rr(5, 7));
  for (let c = 0; c < clumps; c++) {
    const d = norm([rr(-1, 1), rr(-0.2, 1), rr(-1, 1)]);
    const cc: V3 = [C[0] + d[0] * R[0] * 0.5, C[1] + d[1] * R[1] * 0.5, C[2] + d[2] * R[2] * 0.5], cr = rr(0.24, 0.32);
    const cards = Math.round(rr(5, 7));
    for (let i = 0; i < cards; i++) {
      const e = norm([rr(-1, 1), rr(-0.3, 1), rr(-1, 1)]);
      const p: V3 = [cc[0] + e[0] * cr * rr(0.3, 0.9), cc[1] + e[1] * cr * rr(0.3, 0.9), cc[2] + e[2] * cr * rr(0.3, 0.9)];
      const face = norm([e[0] + rr(-0.6, 0.6), e[1] * 0.6 + rr(-0.2, 0.6), e[2] + rr(-0.6, 0.6)]);
      let U = norm(cross(face, UP)); if (!isFinite(U[0])) U = [1, 0, 0];
      const V = cross(U, face), spin = rr(0, 6.28);
      const U2 = rotateAbout(U, face, spin), V2 = rotateAbout(V, face, spin);
      const oc: V3 = [(p[0] - C[0]) / R[0], (p[1] - C[1]) / R[1], (p[2] - C[2]) / R[2]];
      const yRel = Math.max(0, Math.min(1, p[1] / (C[1] + R[1])));
      card(leaves, p, U2, V2, rr(0.42, 0.55), rr(0.42, 0.55), "center", softUp(oc), Math.max(0.45, 0.4 + yRel * 0.45 + Math.min(1, Math.hypot(...oc)) * 0.25));
    }
  }
  // flowers or berries on the outside of the mass
  const flowerHex = swatch(row, /^Flowers/), berryHex = swatch(row, /^Berry/);
  if (flowerHex || berryHex) {
    const hex = flowerHex ?? "#b81c22";
    const heads = parts.part(berryHex
      ? foliageMaterial(scene, "bushberry", sheetOf(scene, "berries", drawBerries), ["#3a0406", "#a0141c", "#f06a6a"], tint, snow)
      : foliageMaterial(scene, `bushflower_${hex}`, sheetOf(scene, "head_five", (c, S, r) => drawHead(c, S, r, "five")), ["#e8c040", ...rampOf(hex).slice(1)] as [string, string, string], tint, snow));
    const n = Math.round(rr(14, 22));
    for (let i = 0; i < n; i++) {
      const d = norm([rr(-1, 1), rr(0, 1), rr(-1, 1)]);
      const p: V3 = [C[0] + d[0] * R[0] * 0.95, C[1] + d[1] * R[1] * 0.95, C[2] + d[2] * R[2] * 0.95];
      let U = norm(cross(d, UP)); if (!isFinite(U[0]) || Math.hypot(...U) < 0.5) U = [1, 0, 0];
      card(heads, p, U, cross(U, d), berryHex ? 0.3 : 0.16, berryHex ? 0.3 : 0.16, "center", softUp(d, 0.3), 1);
    }
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

type FlowerStyle = { head: Head; heart: string };
function flowerStyle(file: string): FlowerStyle {
  if (/Flower_4|Flowers\.glb/.test(file)) return { head: "daisy", heart: "#8a5a10" };
  if (/Flower_2/.test(file)) return { head: "star", heart: "#f0d040" };
  if (/Flower_3/.test(file)) return { head: "five", heart: "#f4d24a" };
  if (/Flower_7|Flower_6/.test(file)) return { head: "poppy", heart: "#2a1410" };
  return { head: "five", heart: "#d8a030" };   // Flower_1
}
function buildFlower(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const leafHex = usable(swatch(row, /^Leaves|^Green/)) ?? "#5fa032";
  const flowerHex = usable(swatch(row, /^Flowers|^Cyan/)) ?? "#3aa8b0";
  const st = flowerStyle(file);
  const low = row[5] - row[2] < 0.3;             // Flower_6: a ground-hugging mat
  const group = /Group|Flowers\.glb/.test(file);
  const parts = new Parts();
  const stems = parts.part(woodMaterial(scene, "stem", tint, snow), true);
  const leaves = parts.part(foliageMaterial(scene, `flowerleaf_${leafHex}`, sheetOf(scene, "bigleaf", drawBigLeaf), rampOf(leafHex), tint, snow));
  const heads = parts.part(foliageMaterial(scene, `flowerhead_${st.head}_${flowerHex}`, sheetOf(scene, `head_${st.head}`, (c, S, r) => drawHead(c, S, r, st.head)), [st.heart, ...rampOf(flowerHex).slice(1)] as [string, string, string], tint, snow));
  // a unit flower 1 tall (fitted to the kit box after)
  const nLeaves = Math.round(rr(5, 8));
  for (let i = 0; i < nLeaves; i++) {
    const a = (i / nLeaves) * 6.28 + rr(-0.3, 0.3), dir: V3 = [Math.sin(a), 0, Math.cos(a)];
    const pitch = low ? rr(0.05, 0.2) : rr(0.5, 1.0);
    const U = norm([dir[0] * Math.cos(pitch), Math.sin(pitch), dir[2] * Math.cos(pitch)]);
    const V = norm(cross(U, UP));
    card(leaves, [0, 0.01, 0], U, V, low ? 0.45 : rr(0.35, 0.5), low ? 0.22 : rr(0.14, 0.2), "base", softUp(dir, 0.8), 0.7);
  }
  const n = low ? Math.round(rr(4, 7)) : group ? Math.round(rr(5, 8)) : Math.round(rr(1, 2.99));
  for (let i = 0; i < n; i++) {
    const a = rr(0, 6.28), r = group || low ? rr(0.05, 0.3) : rr(0, 0.05);
    const top: V3 = low ? [Math.sin(a) * r, rr(0.06, 0.12), Math.cos(a) * r] : [Math.sin(a) * r * 1.6, rr(0.7, 1.0), Math.cos(a) * r * 1.6];
    if (!low) tube({ pts: curve([Math.sin(a) * r * 0.3, 0, Math.cos(a) * r * 0.3], [top[0] * 0.5, top[1] * 0.55, top[2] * 0.5], top, 3), r0: 0.018, r1: 0.01, sides: 3 } as Limb, stems.pos, stems.uv, stems.col, stems.idx, () => 0, 1);
    // the head: two crossed upright cards and one facing up, so it reads from anywhere
    const hs = low ? 0.16 : group ? rr(0.18, 0.26) : rr(0.26, 0.34);
    const yaw = rr(0, 3.14);
    const f1: V3 = [Math.sin(yaw), 0.35, Math.cos(yaw)], f2: V3 = [Math.sin(yaw + 1.57), 0.35, Math.cos(yaw + 1.57)];
    for (const f of low ? [] : [f1, f2]) { const fn = norm(f); const U = norm(cross(fn, UP)); card(heads, top, U, cross(U, fn), hs, hs, "center", softUp(fn, 0.6), 1); }
    card(heads, [top[0], top[1] + 0.01, top[2]], [1, 0, 0], [0, 0, 1], hs, hs, "center", UP, 1);
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

function buildGrassTuft(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const hex = usable(swatch(row, /^Grass|^Leaves|^Green/)) ?? "#5e9f09";
  const style: Blades | "clover" = /Clover/.test(file) ? "clover" : /Wispy/.test(file) ? "wispy" : /Wide/.test(file) ? "wide" : /Wheat/.test(file) ? "wheat" : "common";
  const parts = new Parts();
  const tex = style === "clover" ? sheetOf(scene, "clover", drawClover) : sheetOf(scene, `blades_${style}`, (c, S, r) => drawBlades(c, S, r, style));
  const mat = parts.part(foliageMaterial(scene, `tuft_${style}_${hex}`, tex, rampOf(hex), tint, snow));
  if (style === "clover") {
    // a low, domed rosette: cards tipped nearly flat round a raised middle
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rr(-0.2, 0.2), dir: V3 = [Math.sin(a), 0, Math.cos(a)];
      const U = norm([dir[0], rr(0.25, 0.5), dir[2]]), V = norm(cross(U, UP));
      card(mat, [0, 0.02, 0], U, V, 0.5, 0.6, "base", softUp(dir, 1.2), 0.75);
    }
    card(mat, [0, 0.25, 0], [1, 0, 0], [0, 0, 1], 0.6, 0.6, "center", UP, 1);
  } else {
    for (let i = 0; i < 3; i++) uprightCard(mat, [0, 0, 0], (i / 3) * Math.PI + rr(-0.2, 0.2), 1, 1, rr(-0.15, 0.15), UP, 0.6);
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

// Arching fronds (ferns) or big leaves (plants): each is two cards along its
// length, the first rising, the second falling away, the sheet split between
// them so the frond is continuous.
function buildRosette(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean, fern: boolean): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const hex = usable(swatch(row, /^Leaves|^Green|^DarkGreen/)) ?? "#4f8a2a";
  const flat = row[5] - row[2] < 0.4;              // Plant_7: a flat rosette
  const parts = new Parts();
  const tex = fern ? sheetOf(scene, "fern", drawFern) : sheetOf(scene, "bigleaf", drawBigLeaf);
  const mat = parts.part(foliageMaterial(scene, `${fern ? "fern" : "plant"}_${hex}`, tex, rampOf(hex), tint, snow));
  const n = fern ? Math.round(rr(9, 12)) : Math.round(rr(6, 9));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rr(-0.25, 0.25), dir: V3 = [Math.sin(a), 0, Math.cos(a)];
    const len = rr(0.8, 1.0), w = len * (fern ? 0.42 : 0.55);
    const rise = flat ? rr(0.05, 0.15) : rr(0.7, 1.1), fall = flat ? 0 : rr(-0.35, 0.1);
    const U1 = norm([dir[0] * Math.cos(rise), Math.sin(rise), dir[2] * Math.cos(rise)]);
    const U2 = norm([dir[0] * Math.cos(fall), Math.sin(fall), dir[2] * Math.cos(fall)]);
    const V = norm(cross(U1, UP));
    const mid: V3 = [U1[0] * len * 0.5, 0.02 + U1[1] * len * 0.5, U1[2] * len * 0.5];
    card(mat, [0, 0.02, 0], U1, V, len * 0.5, w, "base", softUp(dir, 0.9), 0.6, 0, 0.5);
    card(mat, mid, U2, V, len * 0.5, w, "base", softUp(dir, 0.9), 0.9, 0.5, 1);
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

function buildPetals(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean): Mesh {
  const rand = mulberry(seedOf(file));
  const hex = swatch(row, /^Flowers/) ?? "#eac296";
  const parts = new Parts();
  const mat = parts.part(foliageMaterial(scene, `petals_${hex}`, sheetOf(scene, "petals", drawPetals), rampOf(hex), tint, snow));
  for (let i = 0; i < 2; i++) {
    const a = rand() * 6.28;
    card(mat, [0, 0.01 + i * 0.01, 0], [Math.cos(a), 0.04, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 1, 1, "center", UP, 1);
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

// ---------- STONE AND WOOD ----------
// THE ROCK SHADER: triplanar -- the stone sheet projected along x, y and z
// in world space and blended by the normal, so nothing pinches at the top of
// a boulder (where a sphere's UVs meet) and no seam runs down its side; the
// normal map is blended the same way (Ben Golus's whiteout blend). Then moss
// in blotches on what faces up, and snow when asked. Rocks go through
// trees.ts's variant path (own tint, own snow) because a plugin does not
// survive the scene's tint-by-cloning.
class RockPlugin extends MaterialPluginBase {
  moss: number; snow: boolean; scale = 0.42;
  constructor(material: Material, moss: number, snow: boolean) {
    super(material, "GenRock", 205, { GTROCK: false, GTROCK_SNOW: false });
    this.moss = moss; this.snow = snow;
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getClassName(): string { return "RockPlugin"; }
  prepareDefines(defines: any): void { defines.GTROCK = true; defines.GTROCK_SNOW = this.snow; }
  getSamplers(samplers: string[]): void { samplers.push("gtStoneAlb", "gtStoneNrm"); }
  getUniforms() {
    return { ubo: [{ name: "gtRock", size: 4, type: "vec4" }], fragment: `uniform vec4 gtRock;` };
  }
  hardBindForSubMesh(ubo: any): void {
    const { diffuse, normal } = stoneSheets(this._material.getScene());
    ubo.updateFloat4("gtRock", this.moss, this.scale, 0, 0);   // moss amount, texture scale (1/m)
    ubo.setTexture("gtStoneAlb", diffuse);
    ubo.setTexture("gtStoneNrm", normal);
  }
  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef GTROCK
uniform sampler2D gtStoneAlb;
uniform sampler2D gtStoneNrm;
#endif`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef GTROCK
{
  vec3 gN = normalize(vNormalW);
  vec3 gW = pow(abs(gN), vec3(4.0)); gW /= (gW.x + gW.y + gW.z);
  vec3 gP = vPositionW * gtRock.y;
  vec3 gA = texture2D(gtStoneAlb, gP.zy).rgb * gW.x + texture2D(gtStoneAlb, gP.xz).rgb * gW.y + texture2D(gtStoneAlb, gP.xy).rgb * gW.z;
  // whiteout-blended triplanar normal
  vec3 tX = texture2D(gtStoneNrm, gP.zy).xyz * 2.0 - 1.0;
  vec3 tY = texture2D(gtStoneNrm, gP.xz).xyz * 2.0 - 1.0;
  vec3 tZ = texture2D(gtStoneNrm, gP.xy).xyz * 2.0 - 1.0;
  tX = vec3(tX.xy + gN.zy, abs(tX.z) * gN.x);
  tY = vec3(tY.xy + gN.xz, abs(tY.z) * gN.y);
  tZ = vec3(tZ.xy + gN.xy, abs(tZ.z) * gN.z);
  normalW = normalize(tX.zyx * gW.x + tY.xzy * gW.y + tZ.xyz * gW.z);
  surfaceAlbedo *= gA * 1.1;
  // moss: blotches on the upper faces, broken by a slow sample of the sheet
  float gBlot = texture2D(gtStoneAlb, vPositionW.xz * 0.07 + vec2(0.31, 0.77)).g;
  float gBlot2 = texture2D(gtStoneAlb, vPositionW.xz * 0.23 + vec2(0.61, 0.13)).r;
  float gMoss = smoothstep(0.5, 0.85, gN.y + (gBlot - 0.5) * 1.6 + (gBlot2 - 0.5) * 0.6) * gtRock.x;
  vec3 gMossCol = mix(vec3(0.12, 0.17, 0.05), vec3(0.3, 0.38, 0.1), gA.g);
  surfaceAlbedo = mix(surfaceAlbedo, gMossCol, gMoss * 0.75);
#ifdef GTROCK_SNOW
  float gSnow = smoothstep(0.28, 0.72, gN.y + (gBlot - 0.5) * 0.5);
  surfaceAlbedo = mix(surfaceAlbedo, vec3(0.9, 0.93, 0.97) * (0.85 + 0.2 * gA.g), gSnow * 0.95);
#endif
}
#endif
`,
    };
  }
}

// Base stone colours: pale, warm, weathered -- the references are cream to
// grey. A zone's rock tint replaces the colour outright, as a kit tint did.
const ROCK = "#9c9484", PATH = "#948e82";
// the wild kit's (wild-nature.ts): worked stone, paler and warmer than the
// field rock so a ruin reads as built from it and not grown from it; and moss,
// which is this same shader on a green ground -- mossed on top as all stone
// is, so a moss pad on a log is mottled like the moss on a boulder
const ASHLAR = "#b4aa95", MOSS = "#5a7430";
const stoneMats = new WeakMap<Scene, Map<string, PBRMaterial>>();
/** The triplanar stone. `kind` "rock" (field stone, mossed), "path", "ashlar"
 * (the wild kit's ruins) or "moss"; `scale` overrides the sheet's 1/m (a
 * cliff wants a coarser grain than a pebble). Cached per scene and key. */
export function stoneMaterial(scene: Scene, kind: string, tint: string | null, snow: boolean, mountain = false, scale?: number): PBRMaterial {
  let m = stoneMats.get(scene);
  if (!m) { m = new Map(); stoneMats.set(scene, m); }
  const key = `${kind}|${tint ?? ""}|${snow}|${mountain}${scale ? `|${scale}` : ""}`;
  const found = m.get(key);
  if (found) return found;
  const mat = new PBRMaterial(`gtStone_${key}`, scene);
  mat.albedoColor = Color3.FromHexString(tint ?? (kind === "rock" ? ROCK : kind === "ashlar" ? ASHLAR : kind === "moss" ? MOSS : PATH));
  mat.metallic = 0;
  mat.roughness = 0.9;
  // a tinted kit piece had its sky fill cut to 0.3 so the tint could read
  // against the blue HDRI (placeExact); do the same
  if (tint) mat.environmentIntensity = 0.3;
  // moss on untinted rock, and on green-tinted rock; a zone tinting its stone
  // for snow, sand or ash wants none
  const tc = tint ? Color3.FromHexString(tint) : null;
  const greenish = !tc || (tc.g > tc.r && tc.g > tc.b);
  const moss = kind === "moss" ? 1 : kind === "ashlar" ? (greenish ? 0.7 : 0) : kind !== "rock" ? 0.25 : !tc ? 1 : greenish ? 0.8 : 0;
  const rp = new RockPlugin(mat, moss, snow);
  // a mountain is a rock at 10-18x: the sheet at mountain scale, and the
  // moss thinned to patches
  if (mountain) { rp.scale = 0.028; rp.moss = moss * 0.6; }
  if (scale) rp.scale = scale;
  m.set(key, mat);
  return mat;
}

// A boulder: a welded icosphere flattened toward the ground, pushed about by
// a few big lobes and two octaves of 3D noise into a soft irregular mass;
// some get ledges (softly terraced heights), and at most one split face. The
// references are low, wide, rounded stones -- not crystals.
function buildStone(file: string, row: Row, scene: Scene, tint: string | null, snow: boolean, mountain = false): Mesh {
  const rand = mulberry(seedOf(file) + (mountain ? 7 : 0)), rr = (a: number, b: number) => a + rand() * (b - a);
  const kind = row[0];
  // Babylon's icosphere `subdivisions` grows linearly, not by recursion:
  // MEASURED, welded, 4 is 162 vertices, 5 is 252, 8 is 642
  const sub = kind === "pebble" ? 3 : kind === "pathstone" ? 5 : row[5] - row[2] > 3 ? 9 : 7;
  const ico = VertexData.CreateIcoSphere({ radius: 1, subdivisions: sub, flat: false });
  // weld the UV-seam duplicates: the shader needs no UVs, and a seam would
  // split the smooth normals down the side of every rock
  const map = new Map<string, number>(), pos: number[] = [], remap: number[] = [];
  const src = ico.positions!;
  for (let i = 0; i < src.length / 3; i++) {
    const key = `${src[i * 3].toFixed(4)},${src[i * 3 + 1].toFixed(4)},${src[i * 3 + 2].toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]); }
    remap.push(j);
  }
  const idx = Array.from(ico.indices!).map((i) => remap[i]);
  const noise3 = (x: number, y: number, z: number, f: number) =>
    Math.sin(x * f * 1.7 + y * f * 0.6 + 1.3) * Math.sin(y * f * 1.3 - z * f * 0.8 + 0.4) * Math.sin(z * f * 1.1 + x * f * 0.9 + 2.1);
  const lobes = Array.from({ length: 7 }, () => ({ d: norm([rr(-1, 1), rr(-0.3, 0.8), rr(-1, 1)]), k: rr(-0.22, 0.3), w: rr(2, 6) }));
  const ph = [rr(0, 6), rr(0, 6), rr(0, 6)];
  const ledges = kind === "rock" && rand() < 0.45, step = rr(0.22, 0.32);
  const split = kind === "rock" && rand() < 0.6 ? { n: norm([rr(-1, 1), rr(0, 0.6), rr(-1, 1)]), d: rr(0.5, 0.7) } : null;
  // A MOUNTAIN (the zone rim, 10-18x): a soft boulder blown up to 50m is a
  // dome. Mountains get cliffs -- several steep planar cuts round the sides
  // and a broken crown -- the way the kit's faceted rocks read on the rim.
  const cliffs = mountain ? Array.from({ length: Math.round(rr(5, 8)) }, () => ({ n: norm([rr(-1, 1), rr(-0.1, 0.45), rr(-1, 1)]), d: rr(0.55, 0.8) })) : [];
  const flat = mountain ? 0.85 : kind === "pathstone" ? 0.28 : kind === "pebble" ? 0.45 : rr(0.42, 0.62);
  for (let i = 0; i < pos.length; i += 3) {
    let p: V3 = [pos[i], pos[i + 1], pos[i + 2]];
    let r = 1;
    for (const l of lobes) r += l.k * Math.pow(Math.max(0, p[0] * l.d[0] + p[1] * l.d[1] + p[2] * l.d[2]), l.w);
    r += 0.16 * noise3(p[0] + ph[0], p[1] + ph[1], p[2] + ph[2], 1.6) + 0.07 * noise3(p[0] + ph[1], p[1], p[2] + ph[2], 3.7) + 0.025 * noise3(p[0], p[1] + ph[0], p[2], 8.3);
    // wider at the foot than the crown: a boulder settles and slopes to
    // the ground, it does not stand on end
    const taper = 1 - (mountain ? 0.35 : 0.28) * Math.max(0, p[1]);
    p = [p[0] * r * taper, p[1] * r * flat, p[2] * r * taper];
    if (ledges && p[1] > 0) {
      // soft terraces: pull heights toward steps, keeping a slope between
      const q = p[1] / step, f = q - Math.floor(q), s = f * f * (3 - 2 * f);
      p[1] = (Math.floor(q) + (f * 0.45 + s * 0.55)) * step;
    }
    if (split) { const e = p[0] * split.n[0] + p[1] * split.n[1] + p[2] * split.n[2] - split.d; if (e > 0) p = [p[0] - split.n[0] * e * 0.85, p[1] - split.n[1] * e * 0.85, p[2] - split.n[2] * e * 0.85]; }
    for (const c of cliffs) { const e = p[0] * c.n[0] + p[1] * c.n[1] * 2 + p[2] * c.n[2] - c.d; if (e > 0) p = [p[0] - c.n[0] * e * 0.92, p[1] - c.n[1] * e * 0.46, p[2] - c.n[2] * e * 0.92]; }
    if (kind === "pathstone" && p[1] > 0.12) p[1] = 0.12 + (p[1] - 0.12) * 0.25;   // the walked top
    p[1] = Math.max(p[1], -0.25 * flat);                                               // the buried foot
    pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
  }
  const parts = new Parts();
  const part = parts.part(stoneMaterial(scene, kind === "rock" ? "rock" : "path", tint, snow, mountain), true);
  part.pos = pos; part.idx = idx; part.uv = new Array((pos.length / 3) * 2).fill(0);
  // vertex colour: the foot darker, a little tonal drift between the lobes
  const minY = Math.min(...pos.filter((_, i) => i % 3 === 1)), maxY = Math.max(...pos.filter((_, i) => i % 3 === 1));
  for (let i = 0; i < pos.length / 3; i++) {
    const hgt = (pos[i * 3 + 1] - minY) / Math.max(1e-3, maxY - minY);
    const drift = 0.06 * noise3(pos[i * 3] * 0.7, pos[i * 3 + 1] * 0.7, pos[i * 3 + 2] * 0.7, 1);
    const ao = (0.62 + 0.38 * Math.min(1, hgt * 1.8)) * (1 + drift);
    part.col.push(ao, ao, ao * 0.98, 1);
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}

const barkLike = new WeakMap<Scene, PBRMaterial>();
export function logMaterial(scene: Scene): PBRMaterial {
  let m = barkLike.get(scene);
  if (m) return m;
  // plain PBR (no plugin) over the broadleaf's painted bark: a log is tinted
  // and snowed by the scene's cloning path, which a plugin would not survive
  const src = woodMaterial(scene, "broadleaf", null, false);
  m = new PBRMaterial("gtLogBark", scene);
  m.albedoTexture = src.albedoTexture; m.bumpTexture = src.bumpTexture;
  m.metallic = 0; m.roughness = 1;
  barkLike.set(scene, m);
  return m;
}
const capMats = new WeakMap<Scene, Map<string, PBRMaterial>>();
export function capMaterial(scene: Scene, key: string, color: string): PBRMaterial {
  let m = capMats.get(scene);
  if (!m) { m = new Map(); capMats.set(scene, m); }
  let mat = m.get(key);
  if (!mat) { mat = new PBRMaterial(`gtCap_${key}`, scene); mat.albedoColor = Color3.FromHexString(color); mat.metallic = 0; mat.roughness = 0.75; m.set(key, mat); }
  return mat;
}
// a cap: a lathe from the rim in to the crown (and the gills under it),
// vertex-coloured top to underside
export function cap(p: Part, c: V3, r: number, h: number, top: Color3, under: Color3, spots: boolean, arc = Math.PI * 2, rand?: () => number): void {
  const S = 12, rings = 4, base = p.pos.length / 3;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, rr = r * Math.cos(t * Math.PI / 2), y = c[1] + h * Math.sin(t * Math.PI / 2);
    for (let i = 0; i <= S; i++) {
      const a = (i / S) * arc - arc / 2 + Math.PI / 2;
      p.pos.push(c[0] + Math.cos(a) * rr, y, c[2] + Math.sin(a) * rr);
      p.uv.push(i / S, t);
      const spot = spots && rand && t > 0.25 && rand() < 0.18 ? 1 : 0;
      // the cap's colour takes over a third of the way up: seen from above or
      // the side a mushroom is its cap, the pale gills only at the rim
      const col = spot ? new Color3(0.95, 0.93, 0.88) : Color3.Lerp(under, top, Math.min(1, t * 3));
      p.col.push(col.r, col.g, col.b, 1);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < S; i++) {
    const a = base + j * (S + 1) + i, b = a + S + 1;
    p.idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // the underside: a disc of gills
  const ub = p.pos.length / 3;
  p.pos.push(c[0], c[1] + h * 0.15, c[2]); p.uv.push(0.5, 0); p.col.push(under.r * 0.8, under.g * 0.8, under.b * 0.8, 1);
  for (let i = 0; i <= S; i++) {
    const a = (i / S) * arc - arc / 2 + Math.PI / 2;
    p.pos.push(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r); p.uv.push(i / S, 0); p.col.push(under.r, under.g, under.b, 1);
  }
  for (let i = 0; i < S; i++) p.idx.push(ub, ub + 2 + i, ub + 1 + i);
}
function buildMushroom(file: string, row: Row, scene: Scene): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const parts = new Parts();
  const flesh = parts.part(capMaterial(scene, "flesh", "#ffffff"), true);
  const stem = new Color3(0.9, 0.86, 0.76);
  if (/Oyster|Laetiporus/.test(file)) {
    // shelf fungi: fans stacked up a short stub, the colour of the kit's
    // warm tan over cream gills: MEASURED, the first greige read as flat
    // grey blades under the scene's blue sky fill
    const top = /Laetiporus/.test(file) ? Color3.FromHexString("#e8a23a") : Color3.FromHexString("#a8784a");
    const under = /Laetiporus/.test(file) ? Color3.FromHexString("#f2d25a") : Color3.FromHexString("#e2c9a0");
    const n = Math.round(rr(4, 6));
    for (let i = 0; i < n; i++) cap(flesh, [rr(-0.1, 0.1), i * 0.22 + rr(0, 0.06), 0], rr(0.35, 0.55) * (1 - i * 0.08), rr(0.06, 0.1), top, under, false, Math.PI * rr(0.9, 1.2), rand);
  } else {
    const red = /RedCap/.test(file);
    const top = red ? Color3.FromHexString("#c2322a") : Color3.FromHexString("#a57b54");
    const under = red ? Color3.FromHexString("#efe2c8") : Color3.FromHexString("#e2d3b4");
    const n = red ? 3 : Math.round(rr(2, 3.99));
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.28), d = i === 0 ? 0 : rr(0.2, 0.4), h = rr(0.35, 0.6) * (i === 0 ? 1 : 0.7), r = rr(0.18, 0.26) * (i === 0 ? 1 : 0.75);
      const at: V3 = [Math.sin(a) * d, 0, Math.cos(a) * d];
      const s0 = flesh.pos.length / 3;
      tube({ pts: curve(at, [at[0], h * 0.5, at[2]], [at[0] + rr(-0.03, 0.03), h, at[2]], 2), r0: r * 0.28, r1: r * 0.22, sides: 7 } as Limb, flesh.pos, flesh.uv, flesh.col, flesh.idx, () => 0, 1);
      for (let k = s0; k < flesh.pos.length / 3; k++) { flesh.col[k * 4] = stem.r; flesh.col[k * 4 + 1] = stem.g; flesh.col[k * 4 + 2] = stem.b; flesh.col[k * 4 + 3] = 1; }
      cap(flesh, [at[0], h, at[2]], r, r * (red ? 0.75 : 0.65), top, under, red, Math.PI * 2, rand);
    }
  }
  return parts.build(`gtn_${file}`, scene, row, 0);
}
function buildLog(file: string, row: Row, scene: Scene): Mesh {
  const rand = mulberry(seedOf(file)), rr = (a: number, b: number) => a + rand() * (b - a);
  const parts = new Parts();
  const wood = parts.part(logMaterial(scene), true);
  // a fallen trunk along z, a little bent, broken off at both ends
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([Math.sin(t * 3) * 0.06, 0.32 + Math.sin(t * 2.2) * 0.03, -1.4 + t * 2.6]); }
  tube({ pts, r0: 0.32, r1: 0.28, sides: 9 } as Limb, wood.pos, wood.uv, wood.col, wood.idx, () => 0, 1);
  // end grain: a disc at each end, pale
  for (const [end, dirz] of [[pts[0], -1], [pts[5], 1]] as [V3, number][]) {
    const b = wood.pos.length / 3, r = dirz < 0 ? 0.32 : 0.28;
    wood.pos.push(end[0], end[1], end[2]); wood.uv.push(0.5, 0.5); wood.col.push(1.4, 1.25, 1.0, 1);
    for (let i = 0; i <= 9; i++) { const a = (i / 9) * 6.28; wood.pos.push(end[0] + Math.cos(a) * r, end[1] + Math.sin(a) * r, end[2]); wood.uv.push(0.5 + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1); wood.col.push(1.2, 1.08, 0.88, 1); }
    for (let i = 0; i < 9; i++) dirz < 0 ? wood.idx.push(b, b + 1 + i, b + 2 + i) : wood.idx.push(b, b + 2 + i, b + 1 + i);
  }
  // a few shelf fungi along the top
  const flesh = parts.part(capMaterial(scene, "flesh", "#ffffff"), true);
  for (let i = 0; i < 3; i++) cap(flesh, [rr(0.18, 0.28) * (i % 2 ? 1 : -1), rr(0.35, 0.5), rr(-0.9, 0.9)], rr(0.1, 0.16), 0.04, Color3.FromHexString("#b58a5a"), Color3.FromHexString("#e8d8b8"), false, Math.PI, rand);
  return parts.build(`gtn_${file}`, scene, row, 0);
}

// ---------- registration ----------
// Plants go through trees.ts (its tint/snow variant path); stone and wood are
// built here for models.ts and take the scene's ordinary tint and snow.
for (const [file, row] of Object.entries(NATURE_KIT)) {
  const k = row[0];
  if (k === "bush") registerGeneratedFoliage(file, (sc, t, s) => buildBush(file, row, sc, t, s));
  else if (k === "flower") registerGeneratedFoliage(file, (sc, t, s) => buildFlower(file, row, sc, t, s));
  else if (k === "grass") registerGeneratedFoliage(file, (sc, t, s) => buildGrassTuft(file, row, sc, t, s));
  else if (k === "fern") registerGeneratedFoliage(file, (sc, t, s) => buildRosette(file, row, sc, t, s, true));
  else if (k === "plant") registerGeneratedFoliage(file, (sc, t, s) => buildRosette(file, row, sc, t, s, false));
  else if (k === "petals") registerGeneratedFoliage(file, (sc, t, s) => buildPetals(file, row, sc, t, s));
  // stone takes the plants' route too: its triplanar shader is a plugin, and
  // a plugin would not survive the scene's tint-by-cloning
  else if (k === "rock" || k === "pebble" || k === "pathstone") registerGeneratedFoliage(file, (sc, t, s) => buildStone(file, row, sc, t, s));
}
// Mountain-scale rocks register under their own key, so a zone can use the
// same kit rock as a boulder in a field and as a mountain on its rim.
const MOUNTAIN = "mountain:";
for (const [file, row] of Object.entries(NATURE_KIT)) {
  if (row[0] === "rock") registerGeneratedFoliage(MOUNTAIN + file, (sc, t, s) => buildStone(file, row, sc, t, s, true));
}
/** The file to place for a rock used at mountain scale (the rim, crags). */
export function mountainRock(file: string): string {
  return NATURE_KIT[file]?.[0] === "rock" ? MOUNTAIN + file : file;
}

export function isGeneratedProp(file: string): boolean {
  const k = NATURE_KIT[file]?.[0];
  return k === "mushroom" || k === "log";
}
export function buildGeneratedProp(file: string, scene: Scene): Mesh | null {
  const row = NATURE_KIT[file];
  if (!row) return null;
  const k = row[0];
  if (k === "mushroom") return buildMushroom(file, row, scene);
  if (k === "log") return buildLog(file, row, scene);
  return null;
}
