/**
 * ST2-002 — Cartoon rendering direction comparison Spike
 *
 * One controlled scene, three identical object groups (box + sphere + torus knot),
 * identical camera / lighting / base colors, three rendering treatments:
 *
 *   A (left)   — NodeMaterial posterized toon (programmatic NME graph, 3 steps)
 *   B (center) — custom GLSL ShaderMaterial cel shading (3 stepped bands + hard rim)
 *   C (right)  — same base shading as B + outline overlays evaluated separately:
 *                inverted-hull silhouette outline (sphere, torus knot)
 *                geometric edge rendering (box)
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
import { MaxBlock } from "@babylonjs/core/Materials/Node/Blocks/maxBlock";
import { PosterizeBlock } from "@babylonjs/core/Materials/Node/Blocks/posterizeBlock";
import { ScaleBlock } from "@babylonjs/core/Materials/Node/Blocks/scaleBlock";
import { AddBlock } from "@babylonjs/core/Materials/Node/Blocks/addBlock";
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
// focus=<A|B|C> (query param) moves the camera closer to one column for
// per-approach screenshots; default frame shows all three side by side.
const focusParam = new URLSearchParams(window.location.search).get("focus");
const COLUMN_X = { A: -6, B: 0, C: 6 } as const;
const camera = new ArcRotateCamera(
  "camera",
  -Math.PI / 2,
  1.08,
  focusParam && focusParam in COLUMN_X ? 9.5 : 17.5,
  focusParam && focusParam in COLUMN_X
    ? new Vector3(COLUMN_X[focusParam as "A" | "B" | "C"], 1.35, 0)
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
const BASE_COLOR = Color3.FromHexString("#d94f43"); // identical base color for all approaches
const AMBIENT_COLOR = Color3.FromHexString("#453e56");
const LIGHT_COLOR = Color3.FromHexString("#ffffff");
const POSTERIZE_STEPS = 3;

// ------------------------------------------------------------------- ground
const ground = MeshBuilder.CreateGround("ground", { width: 26, height: 14 }, scene);
const groundMat = new StandardMaterial("groundMat", scene);
groundMat.diffuseColor = Color3.FromHexString("#3a3f52");
groundMat.specularColor = Color3.Black();
ground.material = groundMat;

// ------------------------------------------------- Approach A: NodeMaterial
// Programmatic NME graph: quantized N·L lighting (PosterizeBlock), identical
// dirToLight/base/ambient constants as approach B.
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

  // fragment chain: world normal → N·L → posterize → scaled diffuse + ambient
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

  const dirIn = new InputBlock("dirToLight");
  dirIn.isConstant = true;
  dirIn.value = dirToLight.clone();
  const dot = new DotBlock("dotNL");
  nrm.output.connectTo(dot.left);
  dirIn.output.connectTo(dot.right);

  const zeroIn = new InputBlock("zero");
  zeroIn.isConstant = true;
  zeroIn.value = 0;
  const clampB = new MaxBlock("clampNL");
  dot.output.connectTo(clampB.left);
  zeroIn.output.connectTo(clampB.right);

  const stepsIn = new InputBlock("steps");
  stepsIn.isConstant = true;
  stepsIn.value = POSTERIZE_STEPS;
  const poster = new PosterizeBlock("posterize");
  clampB.output.connectTo(poster.value);
  stepsIn.output.connectTo(poster.steps);

  const diffIn = new InputBlock("baseColor");
  diffIn.isConstant = true;
  diffIn.value = BASE_COLOR.clone();
  const lit = new ScaleBlock("scaledDiffuse");
  diffIn.output.connectTo(lit.input);
  poster.output.connectTo(lit.factor);

  const ambIn = new InputBlock("ambientColor");
  ambIn.isConstant = true;
  ambIn.value = AMBIENT_COLOR.clone();
  const add = new AddBlock("litColor");
  lit.output.connectTo(add.left);
  ambIn.output.connectTo(add.right);

  const fOut = new FragmentOutputBlock("fragmentOutput");
  add.output.connectTo(fOut.rgb);
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

// 3 stepped diffuse bands (hard boundaries) + 1 hard rim band. Kept as plain
// ternaries/step so it compiles on WebGL1- and WebGL2-class GLSL ES 1.00.
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
  float band = ndl > 0.78 ? 1.00 : (ndl > 0.44 ? 0.62 : (ndl > 0.08 ? 0.30 : 0.0));
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = step(0.72, 1.0 - max(dot(N, V), 0.0)) * 0.30;
  vec3 color = baseColor * (ambientColor + lightColor * band) + rim * lightColor * baseColor;
  gl_FragColor = vec4(color, 1.0);
}`;

function buildCelShaderMaterial(name: string): ShaderMaterial {
  const mat = new ShaderMaterial(
    name,
    scene,
    { vertexSource: celVertex, fragmentSource: celFragment },
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
//    its back faces only, in flat black. Classic real-time silhouette outline.
//    (cullBackFaces=false → front faces are culled, far-side faces drawn; the
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
  { letter: "A", x: -6, meshes: [] },
  { letter: "B", x: 0, meshes: [] },
  { letter: "C", x: 6, meshes: [] },
];

const nmeMat = buildNmeToonMaterial("nmeToonMat");
const celMat = buildCelShaderMaterial("celShaderMat");
const celOutlineMat = buildCelShaderMaterial("celShaderOutlineMat"); // same shader for column C base

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
const cMeshes = buildColumn(columns[2], celOutlineMat);

// Outline overlays on column C (evaluated as a separate technique on top of the
// B base shading):
//  - sphere + torus knot: inverted-hull silhouette outlines
addHullOutline(columns[2].meshes[1], 1.05);
addHullOutline(columns[2].meshes[2], 1.04);
//  - box: geometric edge rendering
const cBox = cMeshes[0];
cBox.enableEdgesRendering(0.99);
cBox.edgesWidth = 6.0;
cBox.edgesColor = EDGE_COLOR;

// ------------------------------------------------------------------- labels
function makeLabel(text: string, x: number): Mesh {
  const plane = MeshBuilder.CreatePlane(`label_${x}`, { width: 5.2, height: 1.0 }, scene);
  plane.position.set(x, 3.7, 0);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const dt = new DynamicTexture(`dt_${x}`, { width: 720, height: 140 }, scene, true);
  dt.hasAlpha = true;
  dt.drawText(text, null, 92, "bold 46px monospace", "#e6e6f0", "transparent", true);
  const mat = new StandardMaterial(`labelMat_${x}`, scene);
  mat.disableLighting = true;
  mat.emissiveTexture = dt;
  mat.opacityTexture = dt;
  mat.backFaceCulling = false;
  plane.material = mat;
  return plane;
}
makeLabel("A — NME toon (posterize)", columns[0].x);
makeLabel("B — GLSL cel + rim", columns[1].x);
makeLabel("C — B + outlines", columns[2].x);

// ------------------------------------------------------------------- HUD
let frames = 0;
const glInfo = engine.getGlInfo();
scene.onBeforeRenderObservable.add(() => {
  frames++;
  if (frames % 30 === 0) {
    const webgl2 = engine.webGLVersion >= 2 ? "YES" : "NO";
    hud.textContent =
      `ST2-002 Cartoon rendering comparison\n` +
      `WebGL2 context: ${webgl2} | renderer: ${glInfo.renderer || "unknown"}\n` +
      `WebGPU probe: api=${webgpuApiPresent ? "present" : "absent"} adapter=${webgpuAdapter} device=${webgpuDevice}\n` +
      `NOTE: WebGPU engine NOT run — probe only, not validated\n` +
      `fps: ${engine.getFps().toFixed(1)} | meshes: ${scene.meshes.length} | active: ${scene.getActiveMeshes().length}\n` +
      `A(left): NME posterized toon (steps=${POSTERIZE_STEPS}) | B(center): GLSL cel+rim | C(right): B + outlines (hull+edges)\n` +
      `${focusParam ? `FOCUS=${focusParam.toUpperCase()} (per-approach screenshot mode)` : "full comparison view"}`;
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
