// A hair worn in a colour it was not made in (appearance.ts HAIR_DYES).
//
// The maker's hair is approved as it is, so nothing here touches its files:
// the colour is painted in the shader, on a clone of the hair's material. A
// tint cannot do it -- an albedo multiply only darkens, and auburn over
// near-black waves is five times brighter than the texture -- so the plugin
// throws the texture's hue away and keeps only how light each strand is
// against the hair's middle lightness, measured per file
// (tools/assets/measure_hair.py into hair-colours.json). Every hair then takes
// a colour at the same strength and with the same streaks, dark or pale.
//
// One clone per scene, source material and colour, shared by everyone who
// wears it: the container cache already shares the source material between
// every instance of a file, and disposeAvatar never frees model materials
// (entities.ts disposeProceduralMaterials), so the clones go with the scene.
// The clone wears the source's own textures (as gear/source-domain.ts's do):
// Material.clone copies every texture slot, and a copy of a glTF image whose
// bytes ownContainerBytes dropped has nothing to load from.
import {Color3, MaterialPluginBase, Texture, type Material, type UniformBuffer} from '@babylonjs/core';
import type {ModelInstance} from './models';
import {HAIR_DYES, type HairColour} from './appearance';
import MEASURED from './hair-colours.json' with {type:'json'};

/** How far a strand at the hair's 10th or 90th lightness percentile moves
 * from the colour picked, either way. */
const STREAK = .28;
/** A hair whose strands barely vary (the Valdren cascade's spread is .019)
 * would have its compression noise stretched into stripes: below this it is
 * read as this flat. */
const MIN_SPREAD = .05;

// Colour, middle lightness and gain are uniforms, so every dyed hair shares one program.
class HairDyePlugin extends MaterialPluginBase {
  constructor(material: Material, private dye: Color3, private mid: number, private gain: number) {
    super(material, 'HairDye', 200, {HAIRDYE: false});
    this._enable(true);
  }
  getClassName(): string { return 'HairDyePlugin'; }
  prepareDefines(defines: Record<string, unknown>): void { defines.HAIRDYE = true; }
  getUniforms() {
    return {
      ubo: [{name: 'hairDye', size: 3, type: 'vec3'}, {name: 'hairDyeLight', size: 2, type: 'vec2'}],
      fragment: '#ifdef HAIRDYE\nuniform vec3 hairDye;\nuniform vec2 hairDyeLight;\n#endif\n',
    };
  }
  bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat3('hairDye', this.dye.r, this.dye.g, this.dye.b);
    ubo.updateFloat2('hairDyeLight', this.mid, this.gain);
  }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    // surfaceAlbedo is linear here (pbrBlockAlbedoOpacity, after the texture);
    // the lightness is read and the colour applied in display terms, as the
    // measuring script reads them.
    return {
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef HAIRDYE
float hairL=pow(max(dot(surfaceAlbedo,vec3(.2126,.7152,.0722)),1e-6),1./2.2);
surfaceAlbedo=toLinearSpace(min(hairDye*clamp(1.+hairDyeLight.y*(hairL-hairDyeLight.x),.45,1.6),vec3(1.)));
#endif
`,
    };
  }
}

const dyed = new WeakMap<Material, Map<HairColour, Material>>();
function shareTextures(clone: any, source: any): Material {
  for (const key of Object.keys(clone)) {
    const t = clone[key];
    if (t instanceof Texture && source[key] !== t) { t.dispose(); clone[key] = source[key]; }
  }
  return clone;
}

/** Paint one loaded hair file (`characters/<file>.glb`) in `colour`; natural
 * leaves the approved material as it is. */
export function colourHair(model: ModelInstance, file: string, colour: HairColour | undefined): void {
  if (!colour || colour === 'natural') return;
  const dye = HAIR_DYES[colour];
  const measured = (MEASURED as Record<string, {mid: number; spread: number}>)[`models/characters/${file}.glb`];
  if (!dye || !measured) throw new Error(`No hair colour ${colour} for ${file}`);
  for (const mesh of model.root.getChildMeshes()) {
    const source = mesh.material;
    if (!source) continue;
    let byColour = dyed.get(source);
    if (!byColour) dyed.set(source, byColour = new Map());
    let material = byColour.get(colour);
    if (!material) {
      material = shareTextures(source.clone(`${source.name} ${colour}`), source);
      new HairDyePlugin(material, Color3.FromHexString(dye.hex), measured.mid, STREAK / Math.max(measured.spread, MIN_SPREAD));
      byColour.set(colour, material);
    }
    mesh.material = material;
  }
}
