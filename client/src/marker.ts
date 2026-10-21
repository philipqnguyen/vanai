// The in-world target marker: an emissive ring that hugs the ground under
// whatever you have targeted, plus a chevron hanging above it. Red for a
// monster, cyan for a fellow explorer, lamplight gold for an NPC or a thing you
// can touch.
//
// A target you cannot see is the one you most need to find, so the marker is
// drawn twice: solid where there is a clear line to it, and as a dimmer
// silhouette through whatever stands in the way — a wall, a tree, the shoulder
// of a hill. The second pass keeps the depth test but inverts it, so each pass
// covers exactly the pixels the other does not.
//
// buildZone() disposes the whole scene on every crossing, so the meshes are
// keyed to the scene that owns them and rebuilt lazily on the first frame
// after a zone change.
import { Color3, Constants, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import { scene, groundHeight } from "./scene";

export type MarkerTint = "enemy" | "friendly" | "neutral";
const TINTS: Record<MarkerTint, string> = {
  enemy: "#e0604a",
  friendly: "#7fd8e0",
  neutral: "#e2b063",
};

// how strongly the hidden half of the marker burns through what covers it
const XRAY_ALPHA = 0.55;

let builtFor: Scene | null = null;
let root: TransformNode | null = null;
let ring: Mesh | null = null;
let chevron: Mesh | null = null;
let mats: StandardMaterial[] = [];
let tint = "";

function flatMaterial(name: string, s: Scene): StandardMaterial {
  const m = new StandardMaterial(name, s);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  return m;
}

// The see-through half of a marker piece: the same geometry riding along with
// the original, drawn only where the depth buffer says something is already in
// front of it. It writes no depth of its own, so it never hides anything.
function xrayTwin(src: Mesh, s: Scene): StandardMaterial {
  const twin = src.clone(`${src.name}-xray`)!;
  twin.parent = src;
  twin.position.setAll(0);
  twin.rotation.setAll(0);
  twin.scaling.setAll(1);
  const m = flatMaterial(`${src.name}-xray-mat`, s);
  m.alpha = XRAY_ALPHA;
  m.depthFunction = Constants.GREATER;
  m.disableDepthWrite = true;
  twin.material = m;
  twin.isPickable = false;
  twin.alwaysSelectAsActiveMesh = true;
  return m;
}

function build(): void {
  const s = scene;
  root = new TransformNode("target-marker", s);
  const ringMat = flatMaterial("target-marker-ring-mat", s);
  const chevMat = flatMaterial("target-marker-chev-mat", s);
  tint = "";

  ring = MeshBuilder.CreateTorus("target-marker-ring", { diameter: 2.8, thickness: 0.16, tessellation: 40 }, s);
  ring.material = ringMat;
  ring.parent = root;
  ring.scaling.y = 0.3; // a flat band rather than a doughnut
  ring.isPickable = false;
  ring.alwaysSelectAsActiveMesh = true;

  chevron = MeshBuilder.CreateCylinder("target-marker-chevron",
    { diameterTop: 0, diameterBottom: 0.62, height: 0.8, tessellation: 4 }, s);
  chevron.material = chevMat;
  chevron.parent = root;
  chevron.rotation.x = Math.PI; // apex down, pointing at the target
  chevron.position.y = 2.6;
  chevron.isPickable = false;
  chevron.alwaysSelectAsActiveMesh = true;

  // every material the tint has to reach: the two solid pieces and their twins
  mats = [ringMat, chevMat, xrayTwin(ring, s), xrayTwin(chevron, s)];
  builtFor = s;
  s.onDisposeObservable.addOnce(() => {
    if (builtFor !== s) return;
    builtFor = null; root = ring = chevron = null; mats = []; tint = "";
  });
}

function setTint(hex: string): void {
  if (tint === hex) return;
  tint = hex;
  const c = Color3.FromHexString(hex);
  mats.forEach((m) => { m.emissiveColor = c; });
}

// Place the marker at a world x/z, in the colour that says what it is under.
export function showTargetMarker(x: number, z: number, kind: MarkerTint, now: number, y?: number): void {
  if (!scene) return;
  if (builtFor !== scene) build();
  setTint(TINTS[kind]);
  root!.position.set(x, (y??groundHeight(x, z)) + 0.06, z);
  root!.setEnabled(true);
  ring!.rotation.y = now * 0.5;
  chevron!.rotation.y = now * 1.6;
  chevron!.position.y = 2.6 + Math.sin(now * 2.4) * 0.13;
}

export function hideTargetMarker(): void {
  if (!scene || builtFor !== scene) return;
  root?.setEnabled(false);
}

// ---------- objective markers ----------
// The same ring-and-chevron, in a quest's colour, standing on the thing an
// active quest of yours names in this zone: a node to gather, a notice to
// read, a landmark to reach. This is the "come here" half of finding things
// in the world -- the object itself only ever says what it is (scene.ts
// buildNodes) -- and it exists only while the quest does, per character,
// which is why it is drawn from the journal each frame rather than built into
// the zone. Smaller and slower than the target marker so the two never read
// as the same thing when they stack.
const OBJ_POOL = 6;
interface ObjMarker { root: TransformNode; ring: Mesh; chevron: Mesh; mats: StandardMaterial[]; tint: string; }
let objBuiltFor: Scene | null = null;
let objPool: ObjMarker[] = [];

function buildObjMarker(i: number): ObjMarker {
  const s = scene;
  const root = new TransformNode(`objective-marker-${i}`, s);
  const ringMat = flatMaterial(`objective-ring-mat-${i}`, s);
  const chevMat = flatMaterial(`objective-chev-mat-${i}`, s);
  const ring = MeshBuilder.CreateTorus(`objective-ring-${i}`, { diameter: 2.0, thickness: 0.12, tessellation: 32 }, s);
  ring.material = ringMat;
  ring.parent = root;
  ring.scaling.y = 0.3;
  ring.isPickable = false;
  ring.alwaysSelectAsActiveMesh = true;
  const chevron = MeshBuilder.CreateCylinder(`objective-chevron-${i}`,
    { diameterTop: 0, diameterBottom: 0.5, height: 0.66, tessellation: 4 }, s);
  chevron.material = chevMat;
  chevron.parent = root;
  chevron.rotation.x = Math.PI;
  chevron.position.y = 2.2;
  chevron.isPickable = false;
  chevron.alwaysSelectAsActiveMesh = true;
  const mats = [ringMat, chevMat, xrayTwin(ring, s), xrayTwin(chevron, s)];
  root.setEnabled(false);
  return { root, ring, chevron, mats, tint: "" };
}

export interface ObjectiveSpot { x: number; z: number; y?: number; color: string; }

// Stand a marker on each spot (at most OBJ_POOL; the caller sorts by distance
// and trims). Pass an empty list to clear them.
export function showObjectiveMarkers(spots: ObjectiveSpot[], now: number): void {
  if (!scene) return;
  if (objBuiltFor !== scene) {
    objPool = [];
    for (let i = 0; i < OBJ_POOL; i++) objPool.push(buildObjMarker(i));
    const owner = scene;
    objBuiltFor = owner;
    owner.onDisposeObservable.addOnce(() => {
      if (objBuiltFor === owner) { objBuiltFor = null; objPool = []; }
    });
  }
  objPool.forEach((m, i) => {
    const sp = spots[i];
    if (!sp) { m.root.setEnabled(false); return; }
    if (m.tint !== sp.color) {
      m.tint = sp.color;
      const c = Color3.FromHexString(sp.color);
      m.mats.forEach((mm) => { mm.emissiveColor = c; });
    }
    m.root.position.set(sp.x, (sp.y??groundHeight(sp.x, sp.z)) + 0.06, sp.z);
    m.root.setEnabled(true);
    m.ring.rotation.y = -now * 0.35 + i;
    m.chevron.rotation.y = now * 1.2 + i;
    m.chevron.position.y = 2.2 + Math.sin(now * 2.0 + i) * 0.1;
  });
}

export function hideObjectiveMarkers(): void {
  if (!scene || objBuiltFor !== scene) return;
  objPool.forEach((m) => m.root.setEnabled(false));
}
