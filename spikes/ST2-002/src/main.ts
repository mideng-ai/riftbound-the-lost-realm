/**
 * ST2-002 — Cartoon rendering direction comparison Spike
 * (correction round 1 — controlled comparison, per ChatGPT initial review)
 *
 * One controlled scene, four identical object groups (box + sphere + torus knot),
 * identical camera / lighting / base colors, four rendering treatments:
 *
 *   A (leftmost) — NodeMaterial threshold-graph toon: EXACTLY the same shading
 *                  equation as B, built programmatically in NME:
 *                    final = baseColor * (ambientColor + lightColor * band)
 *                    band  = 0.30*step(0.08,N·L) + 0.32*step(0.44,N·L) + 0.38*step(0.78,N·L)
 *                  NOTE: NME's PosterizeBlock cannot express explicit thresholds
 *                  (it bins [0,1] uniformly by step count), so a threshold graph
 *                  of StepBlocks is used instead. Documented technical limitation.
 *   B            — hand-written GLSL ShaderMaterial cel shading with the same
 *                  equation and thresholds as A. NO rim term (isolated to C).
 *   C            — B + rim light, evaluated as a separately identified OPTIONAL
 *                  effect (not part of the A/B base-shading comparison).
 *   D            — B + outline overlays evaluated separately:
 *                  inverted-hull silhouette outline (sphere, torus knot),
 *                  geometric edge rendering (box).
 *
 * A and B differ ONLY in the rendering pipeline (NME graph vs GLSL source) —
 * the color equation, thresholds, ambient contribution, light color and base
 * color are identical by construction.
 *
 * Scope: docs/STAGE2_TECH_SPIKE_PLAN.md Section 9 / AGENT_COLLABORATION.md Section 11.3.
 * No final art-direction decision is made here; recommendation is advisory only.
 */

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import { NodeMaterialSystemValues } from "@babylonjs/core/Materials/Node/Enums/nodeMaterialSystemValues";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import { TransformBlock } from "@babylonjs/core/Materials/Node/Blocks/transformBlock";
import { NormalizeBlock } from "@babylonjs/core/Materials/Node/Blocks/normalizeBlock";
import { DotBlock } from "@babylonjs/core/Materials/Node/Blocks/dotBlock";
import { StepBlock } from "@babylonjs/core/Materials/Node/Blocks/stepBlock";
import { ScaleBlock } from "@babylonjs/core/Materials/Node/Blocks/scaleBlock";
import { AddBlock } from "@babylonjs/core/Materials/Node/Blocks/addBlock";
import { MultiplyBlock } from "@babylonjs/core/Materials/Node/Blocks/multiplyBlock";
import { VertexOutputBlock } from "@babylonjs/core/Materials/Node/Blocks/Vertex/vertexOutputBlock";
import { FragmentOutputBlock } from "@babylonjs/core/Materials/Node/Blocks/Fragment/fragmentOutputBlock";
import "@babylonjs/core/Rendering/edgesRenderer";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;

// ---------------------------------------------------------------- engine boot
const engine = new Engine(canvas, true, { stencil: false }, false);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.14, 0.15, 0.22, 1);

// Graded WebGPU probe — identical wording/discipline to ST2-001:
// presence of the API only; adapter/device/Engine NOT exercised.
const webgpuApiPresent = typeof navigator !== "undefined" && !!(navigator as unknown as { gpu?: unknown }).gpu;
let webgpuAdapter: "yes" | "no" | "n/a" | "pending" = webgpuApiPresent ? "pending" : "n/a";
let webgpuDevice: "yes" | "no" | "n/a" | "pending" = webgpuApiPresent ? "pending" : "n/a";
if (webgpuApiPresent) {
  (async () => {
    try {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ requestDevice: () => Promise<unknown> } | null> } }).gpu;
      if (!gpu) return;
      const adapter = await gpu.requestAdapter();
      webgpuAdapter = adapter ? "yes" : "no";
      if (adapter) {
        const device = await adapter.requestDevice();
        webgpuDevice = device ? "yes" : "no";
      }
    } catch {
      webgpuAdapter = "no";
      webgpuDevice = "n/a";
    }
  })();
}
// NOTE: the WebGPU engine is intentionally NOT run — probe only, not validated.

// ------------------------------------------------------------------- camera
// focus=<A|B|C|D> (query param) moves the camera closer to one column for
// per-approach screenshots; default frame shows all four side by side.
const focusParam = new URLSearchParams(window.location.search).get("focus");
const COLUMN_X = { A: -9, B: -3, C: 3, D: 9 } as const;
const camera = new ArcRotateCamera(
  "camera",
  -Math.PI / 2,
  1.08,
  focusParam && focusParam in COLUMN_X ? 9.5 : 23,
  focusParam && focusParam in COLUMN_X
    ? new Vector3(COLUMN_X[focusParam as "A" | "B" | "C" | "D"], 1.35, 0)
    : new Vector3(0, 1.35, 0),
  scene
);
scene.activeCamera = camera;

// ------------------------------------------------------------------- lights
// One directional light shared by every approach; its direction is passed to
// A and B as the exact same normalized vector so the comparison is controlled.
const sun = new DirectionalLight("sun", new Vector3(-0.55, -1.0, -0.35).normalize(), scene);
sun.intensity = 1.0;
const dirToLight = sun.direction.scale(-1).normalize(); // surface → light, used by both A and B
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.35; // only affects StandardMaterial objects (ground, outlines, labels)

// ------------------------------------------------------------ shared palette
// ONE shading equation shared by A and B (identical constants by construction):
//   final = baseColor * (ambientColor + lightColor * band)
//   band  = 0.30*step(T1,N·L) + 0.32*step(T2,N·L) + 0.38*step(T3,N·L)
//         = 0.0 (N·L≤T1) / 0.30 (≤T2) / 0.62 (≤T3) / 1.00
const BASE_COLOR = Color3.FromHexString("#d94f43");
const AMBIENT_COLOR = Color3.FromHexString("#453e56");
const LIGHT_COLOR = Color3.FromHexString("#ffffff");
const BAND_T1 = 0.08;
const BAND_T2 = 0.44;
const BAND_T3 = 0.78;

// ------------------------------------------------------------------- ground
const ground = MeshBuilder.CreateGround("ground", { width: 36, height: 14 }, scene);
const groundMat = new StandardMaterial("groundMat", scene);
groundMat.diffuseColor = Color3.FromHexString("#3a3f52");
groundMat.specularColor = Color3.Black();
ground.material = groundMat;

// ------------------------------------------------- Approach A: NodeMaterial
// Programmatic NME threshold graph producing EXACTLY the B equation.
// PosterizeBlock was rejected here: it bins [0,1] uniformly by step count and
// cannot express explicit thresholds — documented technical limitation.
function constVec(name: string, v: Color3): InputBlock {
  const b = new InputBlock(name);
  b.isConstant = true;
  b.value = v.clone();
  return b;
}
function constNum(name: string, v: number): InputBlock {
  const b = new InputBlock(name);
  b.isConstant = true;
  b.value = v;
  return b;
}

function buildNmeToonMaterial(name: string): NodeMaterial {
  const mat = new NodeMaterial(name, scene);

  // vertex chain: position → worldViewProjection → clip
  const pIn = new InputBlock("position");
  pIn.setAsAttribute();
  const wvpIn = new InputBlock("worldViewProjection");
  wvpIn.setAsSystemValue(NodeMaterialSystemValues.WorldViewProjection);
  const clip = new TransformBlock("clip");
  pIn.output.connectTo(clip.vector);
  wvpIn.output.connectTo(clip.transform);
  const vOut = new VertexOutputBlock("vertexOutput");
  clip.output.connectTo(vOut.vector);
  mat.addOutputNode(vOut);

  // fragment chain: world normal → N·L → threshold band → lit color
  const nIn = new InputBlock("normal");
  nIn.setAsAttribute("normal");
  const wIn = new InputBlock("world");
  wIn.setAsSystemValue(NodeMaterialSystemValues.World);
  const nT = new TransformBlock("worldNormal");
  nT.transformAsDirection = true;
  nIn.output.connectTo(nT.vector);
  wIn.output.connectTo(nT.transform);
  const nrm = new NormalizeBlock("normalizeNormal");
  nT.xyz.connectTo(nrm.input);

  const dirIn = constVec("dirToLight", dirToLight as unknown as Color3);
  const dot = new DotBlock("dotNL");
  nrm.output.connectTo(dot.left);
  dirIn.output.connectTo(dot.right);

  // band = 0.30*step(T1,d) + 0.32*step(T2,d) + 0.38*step(T3,d)
  const s1 = new StepBlock("stepT1");
  constNum("T1", BAND_T1).output.connectTo(s1.edge);
  dot.output.connectTo(s1.value);
  const s2 = new StepBlock("stepT2");
  constNum("T2", BAND_T2).output.connectTo(s2.edge);
  dot.output.connectTo(s2.value);
  const s3 = new StepBlock("stepT3");
  constNum("T3", BAND_T3).output.connectTo(s3.edge);
  dot.output.connectTo(s3.value);

  const w1 = new ScaleBlock("bandW1");
  constNum("W1", 0.30).output.connectTo(w1.factor);
  s1.output.connectTo(w1.input);
  const w2 = new ScaleBlock("bandW2");
  constNum("W2", 0.32).output.connectTo(w2.factor);
  s2.output.connectTo(w2.input);
  const w3 = new ScaleBlock("bandW3");
  constNum("W3", 0.38).output.connectTo(w3.factor);
  s3.output.connectTo(w3.input);
  const sum12 = new AddBlock("bandSum12");
  w1.output.connectTo(sum12.left);
  w2.output.connectTo(sum12.right);
  const band = new AddBlock("bandSum");
  sum12.output.connectTo(band.left);
  w3.output.connectTo(band.right);

  // lightTerm = lightColor * band
  const lightTerm = new ScaleBlock("lightTerm");
  constVec("lightColor", LIGHT_COLOR).output.connectTo(lightTerm.input);
  band.output.connectTo(lightTerm.factor);

  // lit = ambientColor + lightTerm ; final = baseColor * lit
  const lit = new AddBlock("litColor");
  constVec("ambientColor", AMBIENT_COLOR).output.connectTo(lit.left);
  lightTerm.output.connectTo(lit.right);
  const final = new MultiplyBlock("finalColor");
  constVec("baseColor", BASE_COLOR).output.connectTo(final.left);
  lit.output.connectTo(final.right);

  const fOut = new FragmentOutputBlock("fragmentOutput");
  final.output.connectTo(fOut.rgb);
  mat.addOutputNode(fOut);

  mat.build();
  return mat;
}

// -------------------------------------------- Approach B: GLSL ShaderMaterial
const celVertex = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Base-shading fragment shader — EXACTLY the same equation and thresholds as
// the NME graph in Approach A. step(edge,x) semantics match StepBlock.
//  band  = 0.30*step(T1,N·L) + 0.32*step(T2,N·L) + 0.38*step(T3,N·L)
//  final = baseColor * (ambientColor + lightColor * band)
// NO rim term here: rim is isolated as a separate optional effect (column C).
const celFragment = `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
uniform vec3 cameraPosition;
uniform vec3 dirToLight;
uniform vec3 baseColor;
uniform vec3 lightColor;
uniform vec3 ambientColor;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(dirToLight);
  float ndl = dot(N, L);
  float band = 0.30 * step(0.08, ndl) + 0.32 * step(0.44, ndl) + 0.38 * step(0.78, ndl);
  vec3 color = baseColor * (ambientColor + lightColor * band);
  gl_FragColor = vec4(color, 1.0);
}`;

// Column C variant: base shading + rim light as a SEPARATELY IDENTIFIED
// optional effect. rim = step(0.72, 1-max(N·V,0)) * 0.30 (hard rim band).
const celRimFragment = `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
uniform vec3 cameraPosition;
uniform vec3 dirToLight;
uniform vec3 baseColor;
uniform vec3 lightColor;
uniform vec3 ambientColor;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(dirToLight);
  float ndl = dot(N, L);
  float band = 0.30 * step(0.08, ndl) + 0.32 * step(0.44, ndl) + 0.38 * step(0.78, ndl);
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = step(0.72, 1.0 - max(dot(N, V), 0.0)) * 0.30;
  vec3 color = baseColor * (ambientColor + lightColor * band) + rim * lightColor * baseColor;
  gl_FragColor = vec4(color, 1.0);
}`;

function buildCelShaderMaterial(name: string, fragmentSource: string): ShaderMaterial {
  const mat = new ShaderMaterial(
    name,
    scene,
    { vertexSource: celVertex, fragmentSource },
    {
      attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPosition", "dirToLight", "baseColor", "lightColor", "ambientColor"],
    }
  );
  mat.setVector3("dirToLight", dirToLight);
  mat.setVector3("baseColor", new Vector3(BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b));
  mat.setVector3("lightColor", new Vector3(LIGHT_COLOR.r, LIGHT_COLOR.g, LIGHT_COLOR.b));
  mat.setVector3("ambientColor", new Vector3(AMBIENT_COLOR.r, AMBIENT_COLOR.g, AMBIENT_COLOR.b));
  return mat;
}

// ---------------------------------------------------------- outline helpers
// 1) Inverted-hull silhouette outline: a slightly enlarged clone rendered from
//    its far-side faces only, in flat black. Classic real-time silhouette.
//    (cullBackFaces=false → front faces culled, far-side faces drawn; the
//    enlarged hull is depth-occluded by the real mesh except at the rim.)
const hullOutlineMat = new StandardMaterial("hullOutlineMat", scene);
hullOutlineMat.diffuseColor = Color3.Black();
hullOutlineMat.emissiveColor = Color3.Black();
hullOutlineMat.specularColor = Color3.Black();
hullOutlineMat.cullBackFaces = false;

function addHullOutline(src: Mesh, scale: number): Mesh {
  const hull = src.clone(`${src.name}_hull`);
  hull.scaling = new Vector3(scale, scale, scale);
  hull.material = hullOutlineMat;
  return hull;
}

// 2) Geometric edge rendering: Babylon's EdgeRenderer draws face-angle edges.
const EDGE_COLOR = new Color4(0.02, 0.02, 0.02, 1.0);

// ------------------------------------------------------------- column layout
// Each column gets the same three shapes with identical transforms and colors.
type Column = { letter: string; x: number; meshes: Mesh[] };
const columns: Column[] = [
  { letter: "A", x: -9, meshes: [] },
  { letter: "B", x: -3, meshes: [] },
  { letter: "C", x: 3, meshes: [] },
  { letter: "D", x: 9, meshes: [] },
];

const nmeMat = buildNmeToonMaterial("nmeToonMat");
const celMat = buildCelShaderMaterial("celShaderMat", celFragment); // B baseline — no rim
const celRimMat = buildCelShaderMaterial("celShaderRimMat", celRimFragment); // C — optional rim
const celOutlineMat = buildCelShaderMaterial("celShaderOutlineMat", celFragment); // D base — no rim

function buildColumn(col: Column, material: Material): Mesh[] {
  const x = col.x;
  // Camera looks from -z toward +z (ArcRotateCamera alpha=-PI/2), so the box
  // sits in front and the sphere/knot pair behind — all three visible.
  const box = MeshBuilder.CreateBox(`${col.letter}_box`, { size: 1.7 }, scene);
  box.position.set(x, 0.85, -1.7);
  const sphere = MeshBuilder.CreateSphere(`${col.letter}_sphere`, { diameter: 2.5, segments: 32 }, scene);
  sphere.position.set(x - 1.15, 1.45, 0.4);
  const knot = MeshBuilder.CreateTorusKnot(`${col.letter}_knot`, { radius: 0.78, tube: 0.3, radialSegments: 64, tubularSegments: 96 }, scene);
  knot.position.set(x + 1.15, 1.55, 0.4);
  const meshes = [box, sphere, knot];
  for (const m of meshes) {
    m.material = material;
    col.meshes.push(m);
  }
  return meshes;
}

buildColumn(columns[0], nmeMat);
buildColumn(columns[1], celMat);
buildColumn(columns[2], celRimMat);
const dMeshes = buildColumn(columns[3], celOutlineMat);

// Outline overlays on column D (evaluated as a separate technique on top of the
// B base shading):
//  - sphere + torus knot: inverted-hull silhouette outlines
addHullOutline(columns[3].meshes[1], 1.05);
addHullOutline(columns[3].meshes[2], 1.04);
//  - box: geometric edge rendering
const dBox = dMeshes[0];
dBox.enableEdgesRendering(0.99);
dBox.edgesWidth = 6.0;
dBox.edgesColor = EDGE_COLOR;

// ------------------------------------------------------------------- labels
function makeLabel(text: string, x: number): Mesh {
  const plane = MeshBuilder.CreatePlane(`label_${x}`, { width: 5.6, height: 0.9 }, scene);
  plane.position.set(x, 3.7, 0);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const dt = new DynamicTexture(`dt_${x}`, { width: 960, height: 126 }, scene, true);
  dt.hasAlpha = true;
  dt.drawText(text, null, 82, "bold 40px monospace", "#e6e6f0", "transparent", true);
  const mat = new StandardMaterial(`labelMat_${x}`, scene);
  mat.disableLighting = true;
  mat.emissiveTexture = dt;
  mat.opacityTexture = dt;
  mat.backFaceCulling = false;
  plane.material = mat;
  return plane;
}
makeLabel("A — NME toon (threshold graph)", columns[0].x);
makeLabel("B — GLSL cel (same equation)", columns[1].x);
makeLabel("C — B + rim (optional)", columns[2].x);
makeLabel("D — B + outlines", columns[3].x);

// ------------------------------------------------------------------- HUD
let frames = 0;
const glInfo = engine.getGlInfo();
scene.onBeforeRenderObservable.add(() => {
  frames++;
  if (frames % 30 === 0) {
    const webgl2 = engine.webGLVersion >= 2 ? "YES" : "NO";
    hud.textContent =
      `ST2-002 Cartoon rendering comparison (controlled)\n` +
      `WebGL2 context: ${webgl2} | renderer: ${glInfo.renderer || "unknown"}\n` +
      `WebGPU probe: api=${webgpuApiPresent ? "present" : "absent"} adapter=${webgpuAdapter} device=${webgpuDevice}\n` +
      `NOTE: WebGPU engine NOT run — probe only, not validated\n` +
      `fps: ${engine.getFps().toFixed(1)} | meshes: ${scene.meshes.length} | active: ${scene.getActiveMeshes().length}\n` +
      `A: NME threshold graph | B: GLSL cel — SAME equation: base*(ambient+light*band), T=0.08/0.44/0.78\n` +
      `C: B + rim (optional effect) | D: B + outlines (hull + edges)\n` +
      `${focusParam ? `FOCUS=${focusParam.toUpperCase()} (per-approach screenshot mode)` : "full comparison view"}`;
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
