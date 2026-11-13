# ST2-001 — Babylon.js 基础渲染与构建兼容性 Spike（证据存档）

> **任务编号：** ST2-001（状态与审批见 `docs/AGENT_COLLABORATION.md` Section 5 / 11.2）
> **性质：** 一次性隔离 Spike（disposable），**不是正式游戏工程**；本目录仅作证据存档与可复现记录，验收后可整体删除。
> **执行环境：** WorkBuddy Linux 沙箱（Ubuntu 24.04.3 LTS；Node.js **v22.13.1** / npm **11.9.0**）。负责人 Mac 本机未执行本 Spike。
> **修订：** v2（2026-11-13）——按 ChatGPT 复审 `CHANGES_REQUESTED` 完成整改：固定精确版本 + 提交 lockfile + `npm ci` 干净复现 + `npm audit` 完整输出 + WebGPU 探测口径修正。

## 一、目录内容

| 文件 | 说明 |
|---|---|
| `package.json` | 依赖已**固定精确版本**（无 `^` / `~` 浮动范围） |
| `package-lock.json` | **已提交**，保证确定性安装（lockfileVersion 3，锁定 49 个包） |
| `tsconfig.json` / `index.html` / `src/main.ts` | Spike 源码（最小 Vite + TS + Babylon.js 工程） |
| `README.md` | 本文件 |
| `evidence/npmci.log` | **干净目录 `npm ci` 完整日志**（全新目录、无 node_modules，仅凭 lockfile 安装） |
| `evidence/npm-audit.log` | **`npm audit` 完整输出**（默认报告 + `--json` + `--audit-level=moderate` 三种模式及退出码） |
| `evidence/build-after-ci.log` | `npm ci` 之后重新执行的 `npm run build` 完整日志 |
| `evidence/dev-after-ci.log` / `preview-after-ci.log` | 复现运行的开发服务器 / preview 日志 |
| `evidence/shot-dev-firefox.png` | **开发服务器**渲染截图（WebGL2，HUD 含分级探测结果与渲染器信息） |
| `evidence/shot-preview-firefox.png` | **生产构建（vite preview）**渲染截图 |
| `evidence/browser-harness.mjs` | 沙箱侧浏览器取证脚本（Playwright；非 Spike 应用代码） |
| `evidence/dev.log` / `build.log` / `preview.log` | 第一轮（整改前）日志，保留作历史记录 |

## 二、精确版本

| 项 | 版本 | 来源 |
|---|---|---|
| @babylonjs/core | **9.36.0**（npm `latest`，2026-11-12 发布；package.json 固定 `9.36.0`） | `npm ls` + lockfile |
| vite | **8.3.8**（固定） | `npm ls` + lockfile |
| typescript | **5.9.3**（固定） | `npm ls` + lockfile |
| 依赖树 | lockfileVersion 3，锁定 **49 个包**（`npm ci` 安装 19 个直接+传递包） | package-lock.json |
| Node.js / npm | v22.13.1 / 11.9.0 | 沙箱实测 |
| 浏览器（沙箱实测） | **Firefox 146.0**（Playwright 构建，headful + Xvfb + `LIBGL_ALWAYS_SOFTWARE=1` 软件渲染；渲染器实测为 **llvmpipe**） | 截图 HUD + WEBGL_debug_renderer_info |
| 沙箱其他浏览器 | Chrome 144.0.7559.132 / Chromium（均实测无法创建 WebGL 上下文，见第四节） | 本机 |

**官方支持/兼容信息（调研记录）：**
- Babylon.js 为 Apache-2.0 开源引擎，官方推荐 `@babylonjs/*` ES module 包（tree-shakable）。
- 官方文档（doc.babylonjs.com/setup/support/webGPU）：WebGPU 支持自 Babylon.js 5.0（2022-05）起可用，与 WebGL 实现**向后兼容、并行维护**（"Support for WebGL and WebGPU is maintained side by side for the foreseeable future"）。
- 官方规格页（babylonjs.com/specifications）：透明支持 WebGL 1.0 / WebGL 2.0 / WebGPU。
- 官方 GPU 粒子文档：GPU 粒子需要 WebGL2（阶段0 自检报告已核实）。
- 另存在独立引擎 Babylon Lite（仅 WebGPU、无 WebGL 回退）——**本项目不采用**，仍按 D-007 使用 @babylonjs/core。

## 三、执行命令与结果（整改后）

```bash
npm ci             # ✅ 干净目录（仅 5 个源文件+lockfile）确定性安装：added 19 packages, audited 20 packages；found 0 vulnerabilities
npm audit          # ✅ 默认报告：found 0 vulnerabilities，exit 0；--json：total=0；--audit-level=moderate：exit 0（完整输出见 evidence/npm-audit.log）
npm run build      # ✅ npm ci 后重新构建：tsc 无报错；✓ built in 245ms；dist 产物与首轮构建逐字节同 hash（index-C7U3W4VK.js）——证明依赖图确定性复现
npx vite (5173)    # ✅ dev server ready 96ms；GET / -> 200
npx vite preview   # ✅ GET / -> 200（4173）
```

**审计口径说明（按复审要求区分）：** `npm install` 输出末尾的 `found 0 vulnerabilities` 仅为安装摘要；**正式审计结论以 `npm audit` 完整输出为准**——三种模式均 0 漏洞、退出码 0，审计依赖树 total=49 包（见 `evidence/npm-audit.log`）。

**浏览器实测（Playwright + Firefox 146 软件渲染，截图 HUD 可见）：**
- 控制台：`Babylon.js v9.36.0 - WebGL2`；`WEBGL_debug_renderer_info` → 渲染器 **`llvmpipe, or similar`**（软件渲染，如实记录）
- HUD：`WebGL2 context: YES`；fps ≈ 58.5–58.9（软件渲染）；frames rendered ≈ 415；meshes: 3；viewport 1280×800
- 场景：绿色地面 + 中央方块 + 蓝色球体 + 俯视相机（ArcRotateCamera 低俯角）+ 半球光，截图可见全部元素正常渲染

## 四、WebGPU 探测口径（按复审要求精确表述）

代码与 HUD 现按**分级探测**呈现，逐级独立记录、不混淆：

1. **API 存在**（`navigator.gpu` 是否定义）——沙箱 Firefox 中为 **absent**；
2. **adapter**（`requestAdapter()` 是否返回适配器）——代码已实现异步探测，但沙箱 API 不存在，故未执行到该级；
3. **device**（`requestDevice()`）——同上未执行到该级；
4. **Babylon `WebGPUEngine` 运行**——**未运行，未验证**。

HUD 明确标注 `NOTE: WebGPU engine NOT run — probe only, not validated`。**任何环境下 WebGPU 支持均未获验证**；按任务要求 WebGPU 不是运行前置条件。负责人 Mac（Chrome/Safari 15+）的 WebGPU 能力待本机验证。

## 五、如实记录的限制与未测项

1. **沙箱 GPU 限制**：容器无 `/dev/dri`，Chrome/Chromium（headless 与 Xvfb headful）GPU 进程 EGL 初始化失败，**无法创建 WebGL 上下文**；WebGL2 结果来自 **Firefox 软件渲染（llvmpipe）**。软件渲染的 fps 数据**不代表真实 GPU 性能**，不可用于性能结论。
2. **WebGPU 未验证**（见第四节分级说明）。
3. **负责人 Mac 本机未运行本 Spike**：WebGL2 在真实 GPU 上的结果（含 Chrome/Edge/Safari）待负责人执行（步骤见第六节）。
4. **手机浏览器**：未测试（无真机），符合阶段计划。
5. **构建体积提示**：Vite 提示主 chunk >500 kB（1,074 kB / gzip 259 kB）——**按复审要求保留现状，不做优化、不扩大 Spike**，留待 S2-G 正式工程骨架处理。
6. **一处代码修正（首轮）**：`Engine.renderingBackend` 属性在 9.36.0 类型定义中不存在（TS2339），已改为静态文案显示。
7. **依赖树说明**：首轮无 lockfile 的临时 `npm install` 摘要为 17 包；提交 lockfile 后 `npm ci` 确定性安装为 19 包（依赖树以 lockfile 为准）——这正是复审指出的可复现性问题，现已通过 lockfile + 精确版本解决。
8. 本 Spike 验证的是「引擎可运行性」，**未做**：卡通渲染、特效、输入、存档、性能预算、正式工程结构（均超出 ST2-001 范围）。

## 六、负责人 Mac 本机复现步骤（可选，供验收参考）

```bash
mkdir -p /tmp/spike-st2-001/src && cd /tmp/spike-st2-001
# 从仓库 spikes/ST2-001/ 复制 package.json、package-lock.json、tsconfig.json、index.html、src/main.ts
npm ci && npm run dev   # 浏览器打开 http://localhost:5173/，确认 3D 场景与 HUD（真实 GPU 下 WebGL2 应为 YES）
npm run build && npm run preview  # http://localhost:4173/
```

## 七、初步结论（供 ChatGPT 复审与负责人验收）

- 干净安装（`npm ci`，确定性）✅ / 安全审计（`npm audit` 三模式 0 漏洞）✅ / 开发服务器 ✅ / WebGL2 3D 场景渲染 ✅（沙箱软件渲染，llvmpipe）/ 生产构建与 preview ✅（产物 hash 与首轮一致）。
- 在**沙箱软件渲染**层面，Babylon.js 9.36.0 + Vite 8.3.8 + TS 5.9.3 集成无阻断问题，未触发任务停止条件。
- 正式确认「基础引擎门槛」仍需负责人 Mac 本机真实 GPU 环境运行同一 Spike 后由负责人判定；该确认不由 WorkBuddy 代为声明。
