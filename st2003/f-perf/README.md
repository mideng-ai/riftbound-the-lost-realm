# ST2-003-F — D-210 性能测量与预算建议

> ST2-003 子工作包 S2-F｜2026-11-13｜状态：沙箱实测完成；真机分栏待负责人执行
> **D-210 决策门：以下所有预算数字均为 provisional 建议，不是已确定指标；负责人确认前不更新 DECISIONS_LOG.md。**

## 1. 基准场景定义（可复现）

- 场景：40×40 地面、俯视 ArcRotate 相机（radius 18）、玩家占位球 + 法术粒子系统（S2-C 轻量路径样式，emitRate 随负载 60→460）、N 个 box 实体占位物（InstancedMesh，逐帧慢速旋转）按同心环分布。
- 负载阶梯：N = 0 / 25 / 50 / 100 / 200，每级采样 8s（约 120–470 帧），全流程约 55s 自动运行：`?run=ladder`；单级模式 `?run=fixed&n=100`。
- 采集：`engine.getDeltaTime()` 帧时间数组 → p50/p95、平均 FPS、activeMeshes、三角形数、`performance.memory`（仅 Chromium）。
- 复现命令见 §5。

## 2. 实测数据（分栏，不混算）

### 栏 A：WorkBuddy Linux 沙箱（本轮实测，**CPU 软件渲染，不代表真 GPU**）

环境：Ubuntu 22.04 容器（无 GPU）、Node 22.13.1、1280×800、DPR 1。

**Chromium 145 + SwiftShader（ANGLE swiftshader）：**

| N 实体 | FPS | 帧时间 p50 | p95 | activeMeshes | tris | JS heap |
|---|---|---|---|---|---|---|
| 0 | 24.0 | 18.2ms | 81.8ms | 2 | 786 | 23MB |
| 25 | 21.9 | 20.8ms | 83.0ms | 27 | 1086 | 24MB |
| 50 | 20.0 | 31.5ms | 89.0ms | 52 | 1386 | 22MB |
| 100 | 17.1 | 82.6ms | 90.9ms | 102 | 1986 | 22MB |
| 200 | 14.7 | 87.6ms | 93.5ms | 156 | 2634 | 22MB |

- 压力点出现于 **N=50→100**：p50 从 31ms 跳到 82ms（CPU 光栅化过载 + SwiftShader 着色器路径），非平滑退化。
- JS heap 20–24MB 稳定，40s+ 连续运行无增长（阶梯重复 40 次 n=200 采样亦稳定），**未观察到内存泄漏式增长**。

**Firefox 146 + llvmpipe（同沙箱）：**

| N 实体 | FPS | p50 | p95 | 备注 |
|---|---|---|---|---|
| 0 | 58.5 | 17.0ms | 18.0ms | 受 vsync(~60) 封顶 |
| 25 | 58.8 | 17.0ms | 18.0ms | |
| 50 | 59.0 | 17.0ms | 18.0ms | |
| 100 | 58.5 | 17.0ms | 18.0ms | |
| 200 | 57.3 | 17.0ms | 27.0ms | p95 首次抬升 |

- Firefox 软件路径在 N≤200 全部贴 vsync 上限；与 Chromium 差异说明**不同 CPU 光栅化实现差距可达 4 倍**，进一步强调软件渲染数字不能外推。
- `performance.memory` 在 Firefox 不可用（heap 栏 n/a）。

### 栏 B：负责人 Mac mini（Apple M1 真 GPU）—— **OWNER_DEVICE_TEST_REQUIRED**

未测。执行包见 `docs/STAGE2_DEVICE_TEST_CHECKLIST.md`：`npm run preview` 后访问 `http://localhost:4176/?run=ladder`，等待约 60s，复制控制台 `[result]` 行回传即可。

### 栏 C：真实手机 —— **OWNER_DEVICE_TEST_REQUIRED**

未测。同检查清单：手机浏览器访问 `?run=ladder` 页面，回传结果；需同时记录设备型号/系统/浏览器/分辨率/电源状态。

## 3. 加载与启动观察（沙箱）

- 首帧时间（scene script 开始→第一帧渲染完成）：Chromium 3ms / Firefox 11ms（仅测量渲染管线启动；不含网络/JS 下载，生产构建 bundle 约 6.3MB / gzip 1.39MB——Babylon 全量导入所致，S2-G 将按需模块导入瘦身，属构建产物观察项）。

## 4. 预算建议（**provisional，全部待负责人确认**）

> 以下为基于栏 A 实测 + 常识余量给出的**候选**预算，误差与未测设备风险如实标注。没有任何一条被写为已确定。

| 类别 | 候选目标（待确认） | 依据与误差 | 未测风险 |
|---|---|---|---|
| 桌面 PC（真 GPU） | 稳定 60 FPS（vsync），p95 帧时间 <20ms @ N=200 实体+VFX | 沙箱 CPU 渲染已能 57–59 FPS，真 GPU 余量大；**误差：完全未测** | M1 集显应远超；老独显未知 |
| 手机中高端 | 稳定 ≥30 FPS @ N≤100 实体+VFX；首屏加载（gzip 1.4MB）≤5s | 候选值，无实测依据；移动 GPU 填充率/热节流未知 | **高**：llvmpipe/SwiftShader 数据不能外推 |
| 手机低端 | ≥30 FPS @ N≤50 + 简化 VFX（emitRate 减半、关 GlowLayer） | 候选值 | **高** |
| 内存 | JS heap <200MB 运行中 | 沙箱 22–24MB 基线 × 8 倍余量；仅 Chromium 可测 | 移动浏览器 heap 限制更严 |
| 加载 | gzip 传输 <2MB（按需导入后目标 <1MB） | 当前 1.39MB 全量导入基线 | 首字节时间依赖网络 |

**推荐后续动作（待批准）**：负责人真机跑同一 `?run=ladder` 场景回填栏 B/C，再按实测收紧候选预算；D-210 确认前，S2-G 预算配置一律标 provisional。

## 5. 复现

```bash
npm ci && npm run build && npm run preview   # http://localhost:4176
# 浏览器访问:
#   /?run=ladder          5 级阶梯（~55s），控制台输出 [result] 行
#   /?run=fixed&n=100     单级保持（真机手动测量用）
node evidence/harness.mjs chromium "http://localhost:4176/?run=ladder" 62000 evidence/perf-ladder-chromium.txt evidence/shot-ladder-chromium.png
node evidence/harness.mjs firefox  "http://localhost:4176/?run=ladder" 62000 evidence/perf-ladder-firefox.txt  evidence/shot-ladder-firefox.png
```

## 6. 证据清单

| 文件 | 内容 |
|---|---|
| `evidence/perf-ladder-chromium.txt` / `shot-ladder-chromium.png` | Chromium 阶梯完整控制台输出 + n=200 场景截图 |
| `evidence/perf-ladder-firefox.txt` / `shot-ladder-firefox.png` | Firefox 阶梯完整输出 + n=200 场景截图（实体环阵+粒子可见） |
| `evidence/perf-fixed50-chromium.txt` / `shot-fixed50-chromium.png` | 固定档单级模式验证 |
| `evidence/npmci.log` / `npm-audit.log` / `build.log` / `run.log` | 0 漏洞、构建与运行日志 |

## 7. 限制与未测项

- **全部数字来自 CPU 软件渲染**（SwiftShader/llvmpipe），仅可用于回归对比与负载趋势（N 与帧时间的曲线形状），**不得**解读为真机 GPU 性能。
- 真实 GPU（Mac M1）与真实手机未测：OWNER_DEVICE_TEST_REQUIRED。
- 未测：场景切换（多 Scene 加载）、WebGPU 路径、后台/前台切换功耗、电池/高温节流。
- 帧时间采样在浏览器主线程，受 harness 进程自身调度影响；真机测量建议连续运行 ≥2 分钟并记录电源状态。
