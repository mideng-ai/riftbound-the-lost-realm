// ST2-001 Spike — Babylon.js 基础渲染与构建兼容性验证
// 范围：最小 3D 场景 + 俯视相机 + WebGL2 运行记录 + WebGPU 可用性探测（探测不作为前置条件）
// 本文件为一次性 Spike 代码，不是正式游戏工程的一部分。
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;

// —— 环境探测（在引擎创建前）——
const probe = document.createElement("canvas");
const webgl2OK = !!probe.getContext("webgl2");
const webgl1Only = !webgl2OK && !!probe.getContext("webgl");
const webgpuAvailable = typeof navigator !== "undefined" && !!(navigator as any).gpu;

// —— 引擎与场景 ——
const engine = new Engine(canvas, true, { stencil: true }); // 默认走 WebGL2（不可用则回退 WebGL1）
const scene = new Scene(engine);
scene.clearColor = new Color4(0.06, 0.08, 0.16, 1);

// 俯视相机：ArcRotateCamera 低俯角近似顶视，注视场景中心
const camera = new ArcRotateCamera("topdown", -Math.PI / 2, 0.15, 18, Vector3.Zero(), scene);
camera.attachControl(canvas, true);

const light = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
light.intensity = 0.9;

// 最小 3D 场景：地面 + 中央立方体 + 环绕小球（不写任何玩法逻辑）
const ground = MeshBuilder.CreateGround("ground", { width: 14, height: 14 }, scene);
const groundMat = new StandardMaterial("gm", scene);
groundMat.diffuseColor = new Color3(0.16, 0.4, 0.22);
ground.material = groundMat;

const box = MeshBuilder.CreateBox("box", { size: 2 }, scene);
const boxMat = new StandardMaterial("bm", scene);
boxMat.diffuseColor = new Color3(0.95, 0.7, 0.2);
box.position.y = 1;
box.material = boxMat;

const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 1.2, segments: 16 }, scene);
const sphereMat = new StandardMaterial("sm", scene);
sphereMat.diffuseColor = new Color3(0.3, 0.55, 0.95);
sphere.position.set(3.5, 0.6, 2.5);
sphere.material = sphereMat;

let frame = 0;
scene.onAfterRenderObservable.add(() => { frame++; });

engine.runRenderLoop(() => { scene.render(); });

// —— HUD：把实测信息渲染进 DOM，供无头浏览器截图取证 ——
const update = () => {
  hud.textContent =
    `ST2-001 spike | Babylon.js ${Engine.Version}\n` +
    `engine: WebGL (Engine 默认后端，实际版本见下行探测)\n` +
    `WebGL2 context: ${webgl2OK ? "YES" : "NO"}${webgl1Only ? " (WebGL1 only)" : ""}\n` +
    `WebGPU (navigator.gpu): ${webgpuAvailable ? "available (NOT used as requirement)" : "not available"}\n` +
    `fps: ${engine.getFps().toFixed(1)} | frames rendered: ${frame}\n` +
    `meshes: ${scene.meshes.length} | viewport: ${engine.getRenderWidth()}x${engine.getRenderHeight()}`;
};
scene.onAfterRenderObservable.add(update);
window.addEventListener("resize", () => engine.resize());
