# ST2-002 — Cartoon rendering direction comparison Spike

一次性、可丢弃的隔离 Spike（`spikes/ST2-002/`），用于在受控场景下对比 Babylon.js 的卡通渲染方案，为负责人的后续美术方向决策提供可复现证据。**本 Spike 不做最终渲染决定**；建议仅供参考（advisory）。

- 任务来源：`docs/STAGE2_TECH_SPIKE_PLAN.md` §9 / `docs/AGENT_COLLABORATION.md` §5、§11.3（`APPROVED_TO_START`，2026-11-13）
- 基线复用：ST2-001（已 `OWNER_ACCEPTED`）确立的依赖/版本/证据规范

> **修订：** v2（2026-11-13）——按 ChatGPT 初审 `CHANGES_REQUESTED` 完成整改：A/B 基础着色方程统一为 `baseColor * (ambientColor + lightColor * band)`（同一组阈值 0.08/0.44/0.78 → 0.0/0.30/0.62/1.00）；rim 光从 B 基线中移除、作为独立可选效果单列（C 列）；描边保持独立单列（D 列）；布局由 3 列改为 4 列；全部截图/构建/运行证据重拍。依赖文件未变，lockfile 与审计证据沿用（并顺带在干净目录重新执行了一遍，结果一致）。

## 1. 对比方案

一个受控场景（统一相机、几何、光照、颜色），**四列**完全相同的物体组（box + sphere + torus knot），四种渲染处理：

| 列 | 方案 | 实现技术 | 说明 |
|---|---|---|---|
| A | **NME toon（阈值图）** | `NodeMaterial` 程序化节点图，输出与 B **完全相同**的方程：`DotBlock`(N·L) → 3×`StepBlock`(T1/T2/T3) → `ScaleBlock`×{0.30,0.32,0.38} → 求和得 band → `ScaleBlock`×lightColor → `AddBlock`+ambientColor → `MultiplyBlock`×baseColor | 官方视觉节点系统，无手写 shader；与 B 仅实现管线不同 |
| B | **GLSL cel 基线** | 手写 `ShaderMaterial`（GLSL ES 1.00）：`band = 0.30*step(0.08,ndl)+0.32*step(0.44,ndl)+0.38*step(0.78,ndl)`；`color = baseColor*(ambientColor+lightColor*band)` | 与 A 同一方程、同一常量（代码里逐字对应）；**无 rim** |
| C | **B + rim**（rim 作为独立标识的可选效果） | B 基线 + `rim = step(0.72, 1-max(N·V,0))*0.30` 硬边边缘光项 | rim 不参与 A/B 基础对比 |
| D | **B + 描边**（描边作为独立技术叠加在 B 基础着色上） | ① inverted-hull 轮廓描边（球体、结状体：放大约 4–5% 的克隆、剔除正面、纯黑）；② `EdgeRenderer` 几何边线（方块） | 基础着色与描边严格分离 |

**受控声明（针对初审整改项 1）**：A 与 B 的颜色方程、基色、环境色、光色、量化阈值与分级亮度**逐一相同**，两者差异仅在实现管线（NME 节点图 vs 手写 GLSL 源码）。NME 的 `PosterizeBlock` 无法表达显式阈值（其按步数对 [0,1] 均匀分箱），故 A 采用 `StepBlock` 阈值图实现等价量化——此为如实记录的技术约束，非管线差异。初审指出的"ambient 项位置不同 / B 多 rim 项"两个混淆因素已消除。

控制条件：同一 `DirectionalLight`（方向归一化后以同一向量传给 A 与 B）、同一基色 `#d94f43`、同一环境色 `#453e56`、同一光色 `#ffffff`、同一相机与地面。

## 2. 结论与建议（advisory — 最终决定归负责人）

### 视觉可行性（软件渲染 llvmpipe 下确认）

- **A 与 B 视觉等价**：方程统一后，两列的分段明暗位置、亮度、色彩完全一致（对照 `shot-dev-focus-a.png` 与 `shot-dev-focus-b.png` 可核）。这恰好证明：**同一 shading 方程既可用 NME 节点图表达，也可用手写 GLSL 表达，两者的差别是创作/调参方式，而非渲染结果**。初审中"两者色彩观感不同"的说法已被修正后的实现推翻——原差异来自方程不等价（ambient 位置 + rim 项），而非管线。
- **C（rim）**：rim 光作为独立可选效果可行，边缘亮环清晰、不影响基础着色；是否采用属美术决策。
- **D（描边）**：两种描边技术均可行——inverted-hull 轮廓干净（对球/结等光滑体表现好，不依赖拓扑，成本约一次额外 draw call + 顶点放大克隆）；`EdgeRenderer` 几何边线适合棱角分明的低面几何（方块效果好），对高曲率网格会产生密集内边线（开发期在 torus knot 上验证过，效果差，已不采用）。
- **NME 的 `PosterizeBlock` 局限（如实记录）**：其按步数均匀分箱，无法表达显式阈值；等价效果需用 `StepBlock` 阈值图组装（本 Spike 已实现，A 列即用此图）。若将来需要"均匀分箱"效果本身，`PosterizeBlock` 仍可用。

### 建议（供负责人决策参考，非最终结论）

- **管线选择本质是创作方式选择**：A/B 渲染结果等价（方程一致时），决策依据应转向工作流——NME 适合编辑器可视化调参、无需 shader 编写能力；GLSL 适合版本化 diff、逐行评审与复杂扩展。本 Spike 不替负责人做此选择。
- **描边建议采用 inverted-hull**（按物体可选叠加），`EdgeRenderer` 仅适合硬表面道具。
- **rim 光作为可选效果单独评估**：可行且廉价（一行 step + 一次乘加），采纳与否不影响基础管线选择。
- **性能证据不在本 Spike 范围**：以下数据来自 llvmpipe 软件渲染，不代表任何真实 GPU 性能。不可据此做性能预算结论（D-210 未授权）。

## 3. 实测观察（受控环境，仅软件渲染）

| 指标 | 值 |
|---|---|
| 渲染器 | `llvmpipe, or similar`（Firefox 146 + Xvfb + `LIBGL_ALWAYS_SOFTWARE=1`） |
| WebGL2 | YES（Babylon.js v9.36.0 - WebGL2） |
| fps（全场景 19 mesh，1080p 窗口） | 全景 ~40–50；单列特写 ~39–50（软件渲染观察值，不作性能结论） |
| 主 chunk | `index-CsD54Yy_.js` 1,223.10 kB / gzip 291.93 kB（Build A/B sha256 一致：`1b1df576…cccd28b`） |
| 构建告警 | vite chunk >500 kB 告警，按任务要求保留原状、未做优化 |

实现复杂度评估（同为一次性 Spike 内的观察）：A（阈值图版）≈ 20 个节点块；B ≈ 25 行 GLSL（基线，无 rim）；C ≈ B + 2 行 rim 代码；D ≈ 每物体一次克隆 + 1 个材质（hull）或 1 次 API 调用（edges）。

## 4. 精确版本

| 依赖 | 版本 | 来源 |
|---|---|---|
| `@babylonjs/core` | **9.36.0**（精确固定，无 `^`/`~`） | https://registry.npmjs.org/ |
| `typescript`（dev） | **5.9.3** | 同上 |
| `vite`（dev） | **8.3.8** | 同上 |

- `package-lock.json`：lockfileVersion 3，49 个 locked 包，**49/49 个 `resolved` 均为 `https://registry.npmjs.org/…`，明文 `http://` = 0，`integrity` 49/49**（程序化校验记录在 `evidence/npmci.log`；整改后依赖文件未变，并在干净目录重新执行 `npm ci` 复核，结果一致）
- `.npmrc`：`registry=https://registry.npmjs.org/`（另含 `audit=true`、`fund=false`），保证任何机器上 `npm ci` 都指向官方 HTTPS registry
- `npm audit`：默认 / `--json` / `--audit-level=moderate` 三模式均 **0 漏洞、exit 0**（审计树 49 包），完整输出见 `evidence/npm-audit.log`

## 5. 复现步骤

```bash
cd spikes/ST2-002
npm ci                 # 依据 lockfile 精确安装（19 包，0 漏洞）
npm run build          # tsc + vite build（两次构建主 chunk sha256 逐字节一致）
npm run preview        # 服务 dist/，浏览器打开 http://localhost:4173/
npm run dev            # 或开发模式 http://localhost:5173/
```

页面查询参数：`?focus=A|B|C|D` 将相机推近对应列（用于逐方案截图；HUD 显示 `FOCUS=x`）。完整日志与截图见 `evidence/`：`npmci.log`、`npm-audit.log`、`build.log`（含 Build A/B 双构建一致性）、`run.log`、`shot-dev-full.png`、`shot-dev-focus-{a,b,c,d}.png`、`shot-preview-full.png`、`browser-harness.mjs`（取证脚本）。v1 版截图/日志已被 v2 取代（git 历史可查）。

## 6. 已知限制（如实记录，未优化）

1. **软件渲染**：所有浏览器证据来自 llvmpipe（沙箱无 GPU）；**真实 GPU（负责人 Mac）与移动端均未测试、未声称**。
2. **WebGPU**：沙箱 `navigator.gpu` 不存在（`api=absent`）；分级探测仅到 API 存在性，adapter/device/`WebGPUEngine` **未运行、未验证**（HUD 有明确 NOTE 标注）。
3. **性能结论不可用**：fps 数据仅为软件渲染下的运行观察，不构成任何性能证据；性能预算（D-210）在范围外。
4. **NME `PosterizeBlock` 无法表达显式阈值**（均匀分箱固有行为）；A 列改用 `StepBlock` 阈值图实现等价量化，节点数略多——已记录为 NME 路线的约束。
5. **ShaderMaterial 顶点法线变换使用 `world` 矩阵整体变换**（`mat3` 等价），非均匀缩放会导致法线偏差；本场景全部为均匀缩放，不构成问题，但迁移到正式工程时需改用法线矩阵。
6. **dev 模式首次加载时 EdgeRenderer 的 `line` effect 可能出现一次 Vite 动态导入时序错误**（日志可见），最终帧渲染正常；本轮全部截图会话 `[error]=0`；生产构建（preview）无此问题。
7. vite chunk 体积告警按任务要求保留原状；正式工程化的代码分割/优化属范围外。
8. 移动端模拟未做（无要求且无真实设备对照价值）。

## 7. 范围声明

- 新文件仅在 `spikes/ST2-002/` 下；未修改正式游戏源码、决策记录（D-003/D-007 原样保留）、ST2-001、阶段3/M1 相关内容。
- 未做最终美术/渲染方向决定；未做性能预算；未引入 `@babylonjs/core` 以外的新依赖。
- 整改均在原批准范围内（协作文档 §7 初审已确认无需新的负责人批准）。
