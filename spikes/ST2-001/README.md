# ST2-001 — Babylon.js 基础渲染与构建兼容性 Spike（证据存档）

> **任务编号：** ST2-001（状态与审批见 `docs/AGENT_COLLABORATION.md` Section 5 / 11.2）
> **性质：** 一次性隔离 Spike（disposable），**不是正式游戏工程**；本目录仅作证据存档与可复现记录，验收后可整体删除。
> **执行环境：** WorkBuddy Linux 沙箱（Ubuntu 24.04.3 LTS；Node.js **v22.13.1** / npm **11.9.0**）。负责人 Mac 本机未执行本 Spike。
> **修订：** v3（2026-11-13）——按 ChatGPT 复审 round 2 `CHANGES_REQUESTED` 整改 lockfile registry 问题：全部 resolved URL 由 `http://mirrors.tencent.com`（明文 HTTP 镜像）改为 **`https://registry.npmjs.org/`**（49/49，0 个明文 http），并新增目录级 `.npmrc` 固定官方 registry；在干净目录重跑 `npm ci` / `npm audit` 三模式 / `npm run build`（两次构建逐字节一致）；重拍浏览器截图。v2.1 及之前的历史修订见 git 记录。

## 一、目录内容

| 文件 | 说明 |
|---|---|
| `package.json` | 依赖已**固定精确版本**（无 `^` / `~` 浮动范围） |
| `.npmrc` | **（v3 新增）** 固定 `registry=https://registry.npmjs.org/`，并设置 `audit=true`、`fund=false`；安装与审计均使用官方 HTTPS registry |
| `package-lock.json` | **（v3 重新生成）** lockfileVersion 3，锁定 49 个包；**49/49 个 `resolved` 均为 `https://registry.npmjs.org/…`，明文 `http://` 条目为 0**；49 个 `integrity` 哈希齐全 |
| `tsconfig.json` / `index.html` / `src/main.ts` | Spike 源码（最小 Vite + TS + Babylon.js 工程） |
| `README.md` | 本文件 |
| `evidence/npmci-https.log` | **（v3）干净目录 `npm ci` 完整日志**：环境信息、执行前 lockfile URL 统计、安装结果与逐包版本核验 |
| `evidence/npm-audit-https.log` | **（v3）`npm audit` 完整输出**：默认报告 + `--json` + `--audit-level=moderate` 三模式及退出码 |
| `evidence/build-https.log` | **（v3）`npm ci` 后的 `npm run build`**：Build A 与 Build B 两次独立构建，主 chunk 文件名与 sha256 完全一致；附 dist 全量 sha256 |
| `evidence/hash-attribution.log` | **（v3 辅助证据）**产物 hash 归因实验：同一依赖树下分别用旧/新 `src/main.ts` 构建，证明 `C7U3W4VK → WVpvXHVT` 的差异 100% 来自 round 1 整改中的源码改写，而非依赖或随机因素 |
| `evidence/run-https.log` | **（v3）**dev / preview 运行日志 + HTTP 检查 + 浏览器实测（HUD、渲染器、控制台） |
| `evidence/shot-dev-firefox.png` / `shot-preview-firefox.png` | **（v3 重拍）**基于 HTTPS lockfile 干净树的渲染截图（WebGL2，HUD 含分级探测与渲染器信息） |
| `evidence/npmci.log` / `npm-audit.log` / `build-after-ci.log` / `dev-after-ci.log` / `preview-after-ci.log` | round 1（HTTP 镜像 lockfile）日志，**保留作历史记录**；其结论已被 v3 取代（见 §五 第 9 条） |
| `evidence/browser-harness.mjs` | 沙箱侧浏览器取证脚本（Playwright；非 Spike 应用代码） |
| `evidence/dev.log` / `build.log` / `preview.log` | 第一轮（整改前）日志，保留作历史记录 |

## 二、精确版本与 registry

| 项 | 值 | 来源 |
|---|---|---|
| @babylonjs/core | **9.36.0**（npm `latest`，2026-11-12 发布；package.json 固定 `9.36.0`） | `npm ls` + lockfile |
| vite | **8.3.8**（固定） | `npm ls` + lockfile |
| typescript | **5.9.3**（固定） | `npm ls` + lockfile |
| 依赖树 | lockfileVersion 3，锁定 **49 个包**（`npm ci` 安装 19 个直接+传递包） | package-lock.json |
| registry | **`https://registry.npmjs.org/`**（官方；由 `.npmrc` 固定；lockfile 内 49/49 个 resolved 均为该地址，0 明文 http） | `.npmrc` + lockfile URL 统计（npmci-https.log） |
| Node.js / npm | v22.13.1 / 11.9.0 | 沙箱实测 |
| 浏览器（沙箱实测） | **Firefox 146.0**（Playwright 构建，headful + Xvfb + `LIBGL_ALWAYS_SOFTWARE=1` 软件渲染；渲染器实测为 **llvmpipe**） | 截图 HUD + WEBGL_debug_renderer_info |
| 沙箱其他浏览器 | Chrome 144.0.7559.132 / Chromium（均实测无法创建 WebGL 上下文，见第五节） | 本机 |

**官方支持/兼容信息（调研记录）：**
- Babylon.js 为 Apache-2.0 开源引擎，官方推荐 `@babylonjs/*` ES module 包（tree-shakable）。
- 官方文档（doc.babylonjs.com/setup/support/webGPU）：WebGPU 支持自 Babylon.js 5.0（2022-05）起可用，与 WebGL 实现**向后兼容、并行维护**（"Support for WebGL and WebGPU is maintained side by side for the foreseeable future"）。
- 官方规格页（babylonjs.com/specifications）：透明支持 WebGL 1.0 / WebGL 2.0 / WebGPU。
- 官方 GPU 粒子文档：GPU 粒子需要 WebGL2（阶段0 自检报告已核实）。
- 另存在独立引擎 Babylon Lite（仅 WebGPU、无 WebGL 回退）——**本项目不采用**，仍按 D-007 使用 @babylonjs/core。

## 三、执行命令与结果（v3，全部针对 HTTPS lockfile 干净树）

```bash
npm ci             # ✅ 干净目录（无 node_modules）从官方 registry 确定性安装：added 19 packages, audited 20 packages, exit 0；found 0 vulnerabilities
npm audit          # ✅ 默认报告：found 0 vulnerabilities，exit 0；--json：total=0（49 包审计树）；--audit-level=moderate：exit 0（见 evidence/npm-audit-https.log）
npm run build      # ✅ Build A：tsc 无报错，✓ built in 227ms，exit 0，主 chunk index-WVpvXHVT.js（1,074.48 kB / gzip 259.56 kB）
                   # ✅ Build B：清空 dist 后重跑，✓ built in 236ms，exit 0 —— 与 Build A **逐字节一致**（sha256 ac776b0b…5eec1），确定性直接验证
npx vite (5173)    # ✅ dev server ready 98ms；GET / -> 200
npx vite preview   # ✅ GET / -> 200（4173）；页面实际引用的主 chunk 即 index-WVpvXHVT.js（Build A/B 产物）
```

**审计口径说明（按复审要求区分）：** `npm ci` 输出末尾的 `found 0 vulnerabilities` 仅为安装摘要；**正式审计结论以 `npm audit` 完整输出为准**——三种模式均 0 漏洞、退出码 0，审计依赖树 total=49 包（见 `evidence/npm-audit-https.log`）。

**浏览器实测（Playwright + Firefox 146 软件渲染，截图 HUD 可见）：**
- 控制台：`Babylon.js v9.36.0 - WebGL2`；`WEBGL_debug_renderer_info` → 渲染器 **`llvmpipe, or similar`**（软件渲染，如实记录）
- HUD：`WebGL2 context: YES`；`WebGPU probe: api=absent (navigator.gpu undefined)`；`NOTE: WebGPU engine NOT run — probe only, not validated`；fps ≈ 56.5–58.9；meshes: 3；viewport 1280×800
- 场景：绿色地面 + 中央方块 + 蓝色球体 + 俯视相机（ArcRotateCamera 低俯角）+ 半球光，截图可见全部元素正常渲染

## 四、WebGPU 探测口径（按复审要求精确表述）

代码与 HUD 现按**分级探测**呈现，逐级独立记录、不混淆：

1. **API 存在**（`navigator.gpu` 是否定义）——沙箱 Firefox 中为 **absent**；
2. **adapter**（`requestAdapter()` 是否返回适配器）——代码已实现异步探测，但沙箱 API 不存在，故未执行到该级；
3. **device**（`requestDevice()`）——同上未执行到该级；
4. **Babylon `WebGPUEngine` 运行**——**未运行，未验证**。

HUD 明确标注 `NOTE: WebGPU engine NOT run — probe only, not validated`。**任何环境下 WebGPU 支持均未获验证**；按任务要求 WebGPU 不是运行前置条件。负责人 Mac（Chrome/Safari 15+）的 WebGPU 能力待本机验证。

## 五、如实记录的限制、历史证据问题与未测项

1. **沙箱 GPU 限制**：容器无 `/dev/dri`，Chrome/Chromium（headless 与 Xvfb headful）GPU 进程 EGL 初始化失败，**无法创建 WebGL 上下文**；WebGL2 结果来自 **Firefox 软件渲染（llvmpipe）**。软件渲染的 fps 数据**不代表真实 GPU 性能**，不可用于性能结论。
2. **WebGPU 未验证**（见第四节分级说明）。
3. **负责人 Mac 本机未运行本 Spike**：WebGL2 在真实 GPU 上的结果（含 Chrome/Edge/Safari）待负责人执行（步骤见第六节）。
4. **手机浏览器**：未测试（无真机），符合阶段计划。
5. **构建体积提示**：Vite 提示主 chunk >500 kB（1,074 kB / gzip 259 kB）——**按复审要求保留现状，不做优化、不扩大 Spike**，留待 S2-G 正式工程骨架处理。
6. **一处代码修正（首轮）**：`Engine.renderingBackend` 属性在 9.36.0 类型定义中不存在（TS2339），已改为静态文案显示。
7. **依赖树说明**：首轮无 lockfile 的临时 `npm install` 摘要为 17 包；提交 lockfile 后 `npm ci` 确定性安装为 19 包（依赖树以 lockfile 为准）。
8. 本 Spike 验证的是「引擎可运行性」，**未做**：卡通渲染、特效、输入、存档、性能预算、正式工程结构（均超出 ST2-001 范围）。
9. **round 1 构建证据的历史问题（v3 自查并更正）**：round 1 的 `evidence/build-after-ci.log` 记录的构建发生在 `src/main.ts` 整改改写**之前**，因此其「产物 hash 与首轮一致（C7U3W4VK）」不能代表最终提交源码；且当时 lockfile 的 49 个 resolved URL 为明文 `http://mirrors.tencent.com`（本次复审指出的问题）。v3 已全部更换：新 lockfile（HTTPS 官方 registry）+ 干净树 `npm ci` + Build A/B 逐字节一致的构建证据 + 归因实验（`evidence/hash-attribution.log`）。两棵依赖树（首轮 install 树 / lockfile 树）的包版本经逐个比对**完全相同**。

## 六、负责人 Mac 本机复现步骤（可选，供验收参考）

```bash
mkdir -p /tmp/spike-st2-001/src && cd /tmp/spike-st2-001
# 从仓库 spikes/ST2-001/ 复制 package.json、package-lock.json、.npmrc、tsconfig.json、index.html、src/main.ts
npm ci && npm run dev   # 浏览器打开 http://localhost:5173/，确认 3D 场景与 HUD（真实 GPU 下 WebGL2 应为 YES）
npm run build && npm run preview  # http://localhost:4173/
```

`.npmrc` 保证使用官方 registry；如需镜像可自行调整，但 lockfile 的 resolved URL 已固定为 `https://registry.npmjs.org/`。

## 七、初步结论（供 ChatGPT 复审与负责人验收）

- 干净安装（`npm ci`，官方 HTTPS registry，确定性）✅ / 安全审计（`npm audit` 三模式 0 漏洞）✅ / 开发服务器 ✅ / WebGL2 3D 场景渲染 ✅（沙箱软件渲染，llvmpipe）/ 生产构建与 preview ✅（Build A/B 逐字节一致，确定性直接验证）。
- 在**沙箱软件渲染**层面，Babylon.js 9.36.0 + Vite 8.3.8 + TS 5.9.3 集成无阻断问题，未触发任务停止条件。
- 正式确认「基础引擎门槛」仍需负责人 Mac 本机真实 GPU 环境运行同一 Spike 后由负责人判定；该确认不由 WorkBuddy 代为声明。
