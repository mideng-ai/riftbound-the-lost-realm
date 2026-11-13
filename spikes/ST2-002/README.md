# ST2-002 — Cartoon rendering direction comparison Spike

一次性、可丢弃的隔离 Spike（`spikes/ST2-002/`），用于在受控场景下对比 Babylon.js 的卡通渲染方案，为负责人的后续美术方向决策提供可复现证据。**本 Spike 不做最终渲染决定**；建议仅供参考（advisory）。

- 任务来源：`docs/STAGE2_TECH_SPIKE_PLAN.md` §9 / `docs/AGENT_COLLABORATION.md` §5、§11.3（`APPROVED_TO_START`，2026-11-13）
- 基线复用：ST2-001（已 `OWNER_ACCEPTED`）确立的依赖/版本/证据规范

## 1. 对比方案

一个受控场景（统一相机、几何、光照、颜色），三列完全相同的物体组（box + sphere + torus knot），三种渲染处理：

| 列 | 方案 | 实现技术 | 说明 |
|---|---|---|---|
| A（左） | **NME posterized toon** | `NodeMaterial` 程序化节点图：`DotBlock`(N·L) → `MaxBlock` 钳制 → `PosterizeBlock`(steps=3) 量化 → `ScaleBlock`×基色 → `AddBlock`+环境色 | 官方视觉节点系统，无手写 shader |
| B（中） | **GLSL cel + rim** | 手写 `ShaderMaterial`（GLSL ES 1.00）：3 段硬边明暗 + 1 段硬边 rim 边缘光 | 全手写 shader，逐参数可控 |
| C（右） | **B + 描边**（描边作为独立技术叠加在 B 基础着色上） | ① inverted-hull 轮廓描边（球体、结状体：放大约 4–5% 的克隆、只渲染背面、纯黑）；② `EdgeRenderer` 几何边线（方块） | 基础着色与描边严格分离 |

控制条件：同一 `DirectionalLight`（方向归一化后以同一向量传给 A 与 B）、同一基色 `#d94f43`、同一环境色 `#453e56`、同一相机与地面。A 与 B 的区别仅在着色技术本身。

## 2. 结论与建议（advisory — 最终决定归负责人）

### 视觉可行性（软件渲染 llvmpipe 下确认）

- **A（NME）**：可正确产生分段卡通着色（4 级亮度：0、⅓、⅔、1 + 环境项）。节点图直观、可维护性好；但 `PosterizeBlock` 的均匀分箱使最暗可见区偏多（N·L∈(0,⅓] 全部落 0），暗部占比高于 B，画面整体偏"闷"。明暗带位置不可直接调（需要加 remap/step 节点才能自定义阈值）。
- **B（手写 GLSL）**：3 段硬边明暗 + 硬边 rim，带位置（0.78/0.44/0.08）、rim 宽度与强度均为显式常量，调参最直接。饱和度/对比表现最好，最接近常见 cel-shading 目标风格。
- **C（描边）**：两种描边技术均可行——inverted-hull 轮廓干净（对球/结等光滑体表现好，不依赖拓扑，成本约一次额外 draw call + 顶点放大克隆）；`EdgeRenderer` 几何边线适合棱角分明的低面几何（方块效果好），对高曲率网格会产生密集内边线（开发期在 torus knot 上验证过，效果差，已不采用）。
- **A 与 B 的色彩观感差异**：两者使用完全相同的基色/环境色/光向量，但 A 的观感偏粉灰、B 偏饱和。原因是 A 的均匀量化带（⅓/⅔）与 B 的手工阈值（0.30/0.62）分布不同，属参数差异而非管线差异；两管线输出均为未经后处理的原始 fragment 颜色。

### 建议（供负责人决策参考，非最终结论）

- **倾向 B（手写/可组合的 cel shader）作为卡通渲染基础方向**：视觉可控性最高、实现复杂度可控（约 40 行 GLSL），且后续扩展（色阶纹理 ramp、描边、光照分级）空间最大。
- **描边建议采用 inverted-hull**（按物体可选叠加），`EdgeRenderer` 仅适合硬表面道具。
- **NME 路线保留为备选**：若后续需要策划/美术在编辑器里实时调参（NME 可视化图），可把 B 的逻辑迁移为 NME 图；技术等价，两种宿主均可表达同一 shader 逻辑。
- **性能证据不在本 Spike 范围**：以下数据来自 llvmpipe 软件渲染，不代表任何真实 GPU 性能。不可据此做性能预算结论（D-210 未授权）。

## 3. 实测观察（受控环境，仅软件渲染）

| 指标 | 值 |
|---|---|
| 渲染器 | `llvmpipe, or similar`（Firefox 146 + Xvfb + `LIBGL_ALWAYS_SOFTWARE=1`） |
| WebGL2 | YES（Babylon.js v9.36.0 - WebGL2） |
| fps（全场景 15 mesh，1080p 窗口） | 全景 ~38–40；单列特写 ~34–47 |
| 主 chunk | `index-fYMmSF9j.js` 1,222.78 kB / gzip 291.82 kB（Build A/B sha256 一致：`8b737e9b…df1c0a`） |
| 构建告警 | vite chunk >500 kB 告警，按任务要求保留原状、未做优化 |

实现复杂度评估（同为一次性 Spike 内的观察）：A ≈ 14 个节点块、需熟悉 NME block API；B ≈ 40 行 GLSL、需自管 uniforms；C ≈ 每物体一次克隆 + 1 个材质（hull）或 1 次 API 调用（edges）。

## 4. 精确版本

| 依赖 | 版本 | 来源 |
|---|---|---|
| `@babylonjs/core` | **9.36.0**（精确固定，无 `^`/`~`） | https://registry.npmjs.org/ |
| `typescript`（dev） | **5.9.3** | 同上 |
| `vite`（dev） | **8.3.8** | 同上 |

- `package-lock.json`：lockfileVersion 3，49 个 locked 包，**49/49 个 `resolved` 均为 `https://registry.npmjs.org/…`，明文 `http://` = 0，`integrity` 49/49**（提交前后各做过一次程序化校验，见 `evidence/npmci.log`）
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

页面查询参数：`?focus=A|B|C` 将相机推近对应列（用于逐方案截图；HUD 显示 `FOCUS=x`）。完整日志与截图见 `evidence/`：`npmci.log`、`npm-audit.log`、`build.log`（含 Build A/B 双构建一致性）、`run.log`、`shot-dev-full.png`、`shot-dev-focus-{a,b,c}.png`、`shot-preview-full.png`、`browser-harness.mjs`（取证脚本）。

## 6. 已知限制（如实记录，未优化）

1. **软件渲染**：所有浏览器证据来自 llvmpipe（沙箱无 GPU）；**真实 GPU（负责人 Mac）与移动端均未测试、未声称**。
2. **WebGPU**：沙箱 `navigator.gpu` 不存在（`api=absent`）；分级探测仅到 API 存在性，adapter/device/`WebGPUEngine` **未运行、未验证**（HUD 有明确 NOTE 标注）。
3. **性能结论不可用**：fps 数据仅为软件渲染下的运行观察，不构成任何性能证据；性能预算（D-210）在范围外。
4. **A 的量化带为均匀分箱**（NME `PosterizeBlock` 固有行为），若需自定义阈值需额外 remap 节点——已在报告中记录为 NME 路线的约束。
5. **ShaderMaterial 顶点法线变换使用 `world` 矩阵整体变换**（`mat3` 等价），非均匀缩放会导致法线偏差；本场景全部为均匀缩放，不构成问题，但迁移到正式工程时需改用法线矩阵。
6. vite chunk 体积告警按任务要求保留原状；正式工程化的代码分割/优化属范围外。
7. 移动端模拟未做（无要求且无真实设备对照价值）；如需 `?focus=` 之外的移动端仿真，须明确标注 emulation only。

## 7. 范围声明

- 新文件仅在 `spikes/ST2-002/` 下；未修改正式游戏源码、决策记录（D-003/D-007 原样保留）、ST2-001、阶段3/M1 相关内容。
- 未做最终美术/渲染方向决定；未做性能预算；未引入 `@babylonjs/core` 以外的新依赖。
