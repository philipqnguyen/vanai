// The Great Granary's daylight: shafts of dusty sun from the clerestory and
// the crossing lantern down onto the loading lane. Light without lights (the
// dungeon keeps to the kit's four lamp slots): every shaft is two crossed
// additive planes along the sun's direction, fading from the window to the
// floor and from the shaft's middle to its edges by vertex colour, all of them
// ONE mesh and one draw, out of the glow pass, not pickable (rays and the
// camera pass through light). The pools where they land are the scene's light
// pools (registerZone `lighting.pools`), also one draw.
import { Color3, Constants, Mesh, StandardMaterial, VertexData, type GlowLayer, type Scene } from '@babylonjs/core';

export type V3 = [number, number, number];
export interface Shaft { from: V3; w: number; h: number; strength?: number }

const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Where a shaft from `from` along `sun` meets the floor at y = `floor`. */
export function landing(from: V3, sun: V3, floor = 0): V3 {
  const t = (from[1] - floor) / -sun[1];
  return [from[0] + sun[0] * t, floor, from[2] + sun[2] * t];
}

export function lightShafts(scene: Scene, glow: GlowLayer | null | undefined, name: string, sunDir: V3, shafts: Shaft[], color = '#ffe0a8', alpha = 0.16): Mesh {
  const sun = nrm(sunDir), side = nrm(crs(sun, [0, 1, 0])), up2 = nrm(crs(side, sun));
  const P: number[] = [], C: number[] = [], I: number[] = [], N: number[] = [];
  for (const s of shafts) {
    const end = landing(s.from, sun, 0), k = s.strength ?? 1;
    for (const [axis, half] of [[side, s.w / 2], [up2, s.h * 0.45]] as [V3, number][]) {
      // 3 columns (edge, middle, edge) x 4 rows (window .. floor)
      const base = P.length / 3;
      for (let r = 0; r < 4; r++) {
        const t = r / 3, fade = k * (r === 0 ? 0.55 : r === 1 ? 1 : r === 2 ? 0.75 : 0.32);
        const cx = s.from[0] + (end[0] - s.from[0]) * t, cy = s.from[1] + (end[1] - s.from[1]) * t, cz = s.from[2] + (end[2] - s.from[2]) * t;
        // the shaft spreads a little as it falls
        const spread = half * (1 + 0.35 * t);
        for (const c of [-1, 0, 1]) {
          P.push(cx + axis[0] * spread * c, cy + axis[1] * spread * c, cz + axis[2] * spread * c);
          const v = c === 0 ? fade : 0;
          C.push(v, v, v, 1);
          N.push(0, 1, 0);
        }
      }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        const a = base + r * 3 + c, b = a + 1, d = a + 3, e = d + 1;
        I.push(a, d, b, b, d, e);
      }
    }
  }
  const mesh = new Mesh(name, scene), vd = new VertexData();
  vd.positions = P; vd.colors = C; vd.indices = I; vd.normals = N;
  vd.applyToMesh(mesh);
  const m = new StandardMaterial(`${name}_mat`, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString(color);
  m.alpha = alpha; m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false; m.disableDepthWrite = true;
  // fog would add its own colour to an additive sheet; the vertex fade is the falloff
  m.fogEnabled = false;
  mesh.material = m; mesh.isPickable = false; mesh.hasVertexAlpha = false;
  mesh.alphaIndex = 10;
  mesh.freezeWorldMatrix();
  glow?.addExcludedMesh(mesh);
  return mesh;
}
