# ST2-003-C — Spell VFX Spike（法术特效隔离验证）

> ST2-003 子工作包 S2-C｜2026-11-13｜状态：READY_FOR_REVIEW（随 ST2-003 总提交）
> 隔离 Spike，非正式玩法。不含伤害/冷却/技能 UI/音频。

## 1. 目标与范围

按 `docs/STAGE2_MASTER_EXECUTION_PLAN.md` §3：在隔离场景中验证阶段3可复用的最小法术特效技术路径——投射物生命周期（发射→飞行→消失/命中）、命中反馈、轻量 vs 较丰富方案对比、资源释放/池化证据。

## 2. 环境（如实记录）

| 项 | 值 |
|---|---|
| 执行环境 | WorkBuddy Linux 沙箱（无 GPU，/dev/dri 不存在） |
| OS / Node / npm | Ubuntu 22.04 容器 / v22.13.1 / 11.9.0 |
| 渲染 | Firefox 146（Playwright）headful + Xvfb :99 + LIBGL_ALWAYS_SOFTWARE=1 → **llvmpipe 软件 WebGL2** |
| Babylon.js / TS / Vite | 9.36.0 / 5.9.3 / 8.3.8（精确 pin，lockfile 70/70 HTTPS URL，0 http） |
| 验证 | npm ci（0 漏洞）、tsc + vite build 通过、preview 冒烟通过 |

**限制：软件渲染 FPS 不代表真机性能**；真机数据归 S2-F/负责人设备包。

## 3. 两条技术路径（受控对比，同一场景）

### L — 轻量路径
- 投射物：1 sphere（`disableLighting` + emissive），无拖尾。
- 命中：1 flash billboard（DynamicTexture 径向渐变，380ms 缩放+淡出）+ 一次性 12 粒子系统（`manualEmitCount`，900ms 后 dispose）。
- 每次命中峰值对象：~3 个对象 / 13 粒子；无新增光源，无 GlowLayer。

### R — 较丰富路径
- 投射物：同 sphere + **GlowLayer**（全局，intensity 0.7）+ 持续拖尾粒子（emitRate 90，附加混合透明层）。
- 命中：flash billboard（1.3 尺度/500ms）+ 60 粒子爆发 + 冲击波环（torus 500ms 扩散淡出）+ 命中点光源脉冲（450ms）。
- 每次命中峰值对象：~5 个对象 / 70+ 粒子；**两个透明层叠加**（粒子附加混合 + billboard 淡出）→ overdraw 风险高于 L，且 GlowLayer 为全屏后期通道，额外一次场景渲染。

### 已规避的风险（实现决策记录）
- **每命中新建 PointLight 会导致 StandardMaterial 着色器重编译**（光源数变化触发 uniform 重排，软件渲染下明显卡顿）。实现使用单个共享 `hitLight` 做强度脉冲，不新增光源。阶段3若需多命中光，应预先分配固定光源池而非动态增删。

## 4. 资源释放 / 池化证据

### 释放实验（`?stress=40`，40 个高速投射物 + 自动循环持续运行）

| 组 | 配置 | totalMeshes 基线 → 实验后 | delta | 结论 |
|---|---|---|---|---|
| dispose（正常） | `?mode=both&stress=40` | 5 → 21 | +16（= 飞行中活动投射物，命中即回收） | dispose 有效，稳态不增长 |
| leak（故意泄漏） | `…&leak=1`（命中仅隐藏不 dispose） | 5 → 53 | +48（39 个被保留的 mesh 线性累积） | 不释放则对象线性增长 |

原始日志见两张截图 HUD 及 harness 输出（`evidence/shot-stress-*.png`）。

### 池化微基准（`?bench=1`，各 200 次，软件渲染 CPU）

```
create+dispose 200x total=68.0ms (0.340ms/op)
pool re-use   200x total=0.00ms (<0.005ms/op)  ratio >60x
```

### 结论（推荐技术路径）
1. **推荐路径：L 轻量路径为阶段3默认起点**（命中反馈 3 对象/13 粒子已达到"可感知命中"最低要求），R 的组件（GlowLayer、拖尾、冲击环）作为可选增强按技能逐个启用，不默认叠加。
2. **dispose 必须做**（leak 实验证明线性增长）；**池化在小规模（<50 同时投射物）为可选优化**：创建+释放 0.34ms/op 在每秒几次发射下不构成瓶颈；池化收益 >60x 但仅在大量同帧对象（百级以上）时需要。不引入无证据的复杂池化框架，阶段3先 dispose + 按需局部池。
3. 命中光用共享单灯脉冲；动态增删光源（着色器重编译）列为反模式。
4. 透明层/overdraw：R 路径粒子+billboard 叠加层在软件渲染下 FPS 24–25 vs L 24–25（差异被 CPU 光栅化瓶颈掩盖，真机 GPU 上预期差距更明显）——如实标注为未测项。

## 5. 复现步骤

```bash
npm ci            # 0 vulnerabilities
npm run build     # tsc && vite build
npm run preview   # http://localhost:4173
# 查询参数: ?mode=L|R|both（默认 both 交替）；&stress=40[&leak=1] 释放实验；&bench=1 池化基准
```

截图取证：`evidence/harness.mjs`（Playwright + Firefox + llvmpipe，非应用代码）。

## 6. 证据清单

| 文件 | 内容 |
|---|---|
| `evidence/npmci.log` | npm ci 干净安装输出（0 vulnerabilities） |
| `evidence/npm-audit.log` | npm audit：0 vulnerabilities |
| `evidence/build.log` | tsc + vite build 成功（chunk 6.3MB / gzip 1.39MB，Babylon 全量导入所致，S2-G 将按模块导入瘦身） |
| `evidence/run.log` | vite preview 启动日志 |
| `evidence/shot-both-full.png` | L/R 交替全景（命中冲击环可见，fired=10 hits=9） |
| `evidence/shot-L-focus.png` / `shot-R-focus.png` | 两路径特写（R 含 GlowLayer 发光投射物） |
| `evidence/shot-stress-dispose.png` / `shot-stress-leak.png` | 释放实验两组 HUD + 原始日志行 |
| `evidence/shot-bench.png` | 池化微基准 HUD + 日志行 |

## 7. 未测项与限制

- 真机 GPU（Mac M1 / 手机）性能未测——归 S2-F 分栏与 `STAGE2_DEVICE_TEST_CHECKLIST.md`。
- 本 Spike 用 emissive StandardMaterial 占位，**未绑定 ST2-002 卡通渲染管线**（最终渲染方向未由负责人选定）；阶段3集成时按最终管线替换材质。
- 未涉及正式技能机制、伤害数值、音频（音频引入前须完成许可证核查，见计划 §3 排除项）。
