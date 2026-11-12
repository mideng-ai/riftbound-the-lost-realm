# ST2-001 — Babylon.js 基础渲染与构建兼容性 Spike（证据存档）

> **任务编号：** ST2-001（状态与审批见 `docs/AGENT_COLLABORATION.md` Section 5 / 11.2）
> **性质：** 一次性隔离 Spike（disposable），**不是正式游戏工程**；本目录仅作证据存档与可复现记录，验收后可整体删除。
> **执行环境：** WorkBuddy Linux 沙箱（Ubuntu 24.04.3；Node.js v22.13.1 / npm 11.9.0）。负责人 Mac 本机未执行本 Spike。

## 一、目录内容

| 文件 | 说明 |
|---|---|
| `package.json` / `tsconfig.json` / `index.html` / `src/main.ts` | Spike 源码（最小 Vite + TS + Babylon.js 工程） |
| `evidence/shot-dev-firefox.png` | **开发服务器**渲染截图（WebGL2，含 HUD 实测信息） |
| `evidence/shot-preview-firefox.png` | **生产构建（vite preview）**渲染截图 |
| `evidence/dev.log` / `build.log` / `preview.log` | 开发服务器 / 构建 / preview 原始日志 |
| `evidence/browser-harness.mjs` | 沙箱侧浏览器驱动脚本（Playwright；仅用于取证，非 Spike 代码） |

## 二、精确版本

| 项 | 版本 | 来源 |
|---|---|---|
| @babylonjs/core | **9.36.0**（npm `latest`，2026-11-12 发布） | `npm view @babylonjs/core version` |
| vite | 8.3.8 | `npm ls` |
| typescript | 5.9.3 | `npm ls` |
| 浏览器（沙箱实测） | Firefox 146.0.1（Playwright 构建，headful + Xvfb + `LIBGL_ALWAYS_SOFTWARE=1` 软件渲染） | `playwright install firefox` |
| 沙箱其他浏览器 | Chrome 144.0.7559.132 / Chromium（headless 与 Xvfb headful 均实测） | 本机 |

**官方支持/兼容信息（调研记录）：**
- Babylon.js 为 Apache-2.0 开源引擎，官方推荐 `@babylonjs/*` ES module 包（tree-shakable）。
- 官方文档（doc.babylonjs.com/setup/support/webGPU）：WebGPU 支持自 Babylon.js 5.0（2022-05）起可用，与 WebGL 实现**向后兼容、并行维护**（"Support for WebGL and WebGPU is maintained side by side for the foreseeable future"）。
- 官方规格页（babylonjs.com/specifications）：透明支持 WebGL 1.0 / WebGL 2.0 / WebGPU。
- 官方 GPU 粒子文档：GPU 粒子需要 WebGL2（阶段0 自检报告已核实）。
- 另存在独立引擎 Babylon Lite（仅 WebGPU、无 WebGL 回退）——**本项目不采用**，仍按 D-007 使用 @babylonjs/core。

## 三、执行命令与结果

```bash
npm install          # ✅ added 17 packages, found 0 vulnerabilities（12s）
npm run dev          # ✅ VITE v8.3.8 ready in 129 ms；GET / -> 200
npm run build        # ✅ tsc 无报错；✓ built in 231ms；dist/ 产物完整（主 chunk 1,074 kB / gzip 259 kB）
npm run preview      # ✅ GET / -> 200；生产构建页面渲染正常
```

**浏览器实测（Playwright + Firefox 软件渲染）：**
- 控制台输出：`Babylon.js v9.36.0 - WebGL2`
- HUD 实测：WebGL2 context: **YES**；fps ≈ **57.7–59.1**（软件渲染）；frames rendered ≈ 352；meshes: 3；viewport 1280×800
- 场景：绿色地面 + 中央方块 + 蓝色球体 + 俯视相机（ArcRotateCamera 低俯角）+ 半球光——截图可见全部元素正常渲染。

## 四、如实记录的限制与未测项

1. **沙箱 GPU 限制**：容器无 `/dev/dri`，Chrome/Chromium（headless 与 Xvfb headful）的 GPU 进程 EGL 初始化失败，**无法创建 WebGL 上下文**；WebGL2 结果来自 **Firefox 软件渲染（llvmpipe/SWGL 路径）**。软件渲染的 fps 数据**不代表真实 GPU 性能**，不可用于性能结论。
2. **WebGPU 未实测**：沙箱浏览器中 `navigator.gpu` 不可用（Chrome 直连 headless 下 API 存在但 `requestAdapter()` 返回 null）。Babylon `WebGPUEngine` **未运行**。WebGPU 仅作为探测项记录，按任务要求不作为运行前置条件。负责人 Mac（Chrome/Safari 15+）预期支持 WebGPU，待本机验证。
3. **负责人 Mac 本机未运行本 Spike**：WebGL2 在真实 GPU 上的结果（含 Chrome/Edge/Safari）待负责人执行（步骤见第五节）。
4. **手机浏览器**：未测试（无真机），符合阶段计划（后续任务处理）。
5. **构建体积提示**：Vite 提示主 chunk >500 kB（1,074 kB / gzip 259 kB）。Spike 未做代码分割优化，仅作记录；正式工程骨架（S2-G）阶段再处理。
6. **一处代码修正**：`Engine.renderingBackend` 属性在 9.36.0 类型定义中不存在（TS2339），已改为静态文案显示；属 Spike 内部修正，无碍结论。
7. 本 Spike 验证的是「引擎可运行性」，**未做**：卡通渲染、特效、输入、存档、性能预算、正式工程结构（均超出 ST2-001 范围）。

## 五、负责人 Mac 本机复现步骤（可选，供验收参考）

```bash
mkdir -p /tmp/spike-st2-001/src && cd /tmp/spike-st2-001
# 从仓库 spikes/ST2-001/ 复制 package.json、tsconfig.json、index.html、src/main.ts
npm install && npm run dev   # 浏览器打开 http://localhost:5173/，确认 3D 场景与 HUD
npm run build && npm run preview  # http://localhost:4173/
```

## 六、初步结论（供 ChatGPT 复审与负责人验收）

- 干净安装 ✅ / 开发服务器 ✅ / WebGL2 3D 场景渲染 ✅（沙箱软件渲染）/ 生产构建与 preview ✅。
- 在**沙箱软件渲染**层面，Babylon.js 9.36.0 + Vite 8 + TS 5.9 集成无阻断问题，未触发任务停止条件。
- 正式确认「基础引擎门槛」仍需负责人 Mac 本机真实 GPU 环境运行同一 Spike 后由负责人判定。
