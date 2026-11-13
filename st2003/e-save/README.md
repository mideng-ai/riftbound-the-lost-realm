# ST2-003-E — D-207 本地存档技术比较（localStorage vs IndexedDB）

> ST2-003 子工作包 S2-E｜2026-11-13｜状态：比较与最小验证完成
> **D-207 决策门：本报告仅为建议，localStorage / IndexedDB 均未定案；负责人确认前不更新 DECISIONS_LOG.md，不落地正式 adapter。**

## 1. 最小验证结果（实际浏览器测试，非桌面推断）

测试套件 `src/main.ts`（版本化读写、旧版迁移、损坏恢复、原子性、失败/配额、写入成本、中断写恢复），原始执行记录：

| 测试环境 | 套件版本 | 结果 | UA |
|---|---|---|---|
| Firefox 146（Xvfb headful） | 初版（8 项断言） | 8/8 PASS | Linux x86_64 rv:146.0 |
| Firefox 146 **隐私模式**（-private） | 初版（8 项断言） | 8/8 PASS | 同上 |
| Chromium 145（SwiftShader） | 初版（8 项断言） | 8/8 PASS | Chrome/145.0.0.0 |
| **Chrome 157（macOS，真机 GPU）** | **修正轮 R4（11 项断言）** | **11/11 PASS** | `evidence/results-chrome-macos.txt` |

> 修正轮 R4 新增 L6（配额写失败后旧档完好）、L6b/L6c（中断写恢复协议）三项断言。
> 前三次运行使用的是不含这三项的初版套件，历史证据保持原样未改动。
> **L6 在 Firefox / Firefox 隐私模式下未重跑 → NOT VERIFIED**（本机无 Firefox；不推断、不计为 PASS）。
> 负责人可在 Mac 上用 Firefox 打开 `st2003/e-save` 预览页复核 L6。

逐项明细见 `evidence/results-*.txt` 与截图。

| # | 测试 | localStorage | IndexedDB |
|---|---|---|---|
| L1/I1 | 版本化读写 | PASS（JSON 序列化往返） | PASS（structured clone 往返） |
| L2/I2 | v1→v2 迁移 | PASS（读取时探测 schemaVersion + 迁移函数） | PASS（`onupgradeneeded` 升级事务内读旧数据写新 store） |
| L3 | 损坏恢复 | PASS（非法 JSON → try/catch → 隔离到 `_corrupt_backup` + 返回默认档） | —（IDB 结构化存储无"半截 JSON"问题，见 I3b） |
| L4/I4 | 配额行为 | INFO：**Firefox 实测约 4–5MB 即同步抛 QuotaExceededError**；已有键不受影响 | INFO：`storage.estimate()` Firefox quota≈10240MB / Chromium≈6.8–8GB；浏览器可在低盘时淘汰 |
| L5/I5 | 写入成本 | 300×10KB=5.0ms（0.017ms/op，主线程同步） | 1000×10KB 批量事务=22–162ms（0.02–0.16ms/op，异步提交） |
| L6 | 配额写失败路径 | PASS（Chrome 157/macOS）：填充至 5.0MB 触发 QuotaExceededError，临时键写入被拒、`save_next` 不存在、`save_main` 回读 gold=777 完好 | —（IDB 事务本身原子，见 I3） |
| L6b/L6c | 中断写恢复协议 | PASS：`save_next` 有效时优先恢复（gold=888）；`save_next` 损坏时回退 `save_main`（gold=777） | —（IDB 无需临时键协议） |
| I3 | 事务原子性 | —（无事务，多键写入可中断） | PASS：同步 abort 含 3 条 put 的事务 → 0 行落库，全有或全无 |
| I3b | 非法数据 | —（JSON.stringify 宽松） | PASS：不可克隆值（函数）→ `DataCloneError` 前置拒绝，无部分写入 |

## 2. 逐维度比较

| 维度 | localStorage | IndexedDB |
|---|---|---|
| API 模型 | 同步、阻塞主线程 | 异步、事务式 |
| 数据结构 | 字符串（JSON 手工序列化） | 结构化克隆（对象/Blob/Map 直接存） |
| 数据量适配 | ~5MB，够首版存档（装备/进度 JSON 预计 <100KB） | 数百 MB 级，远超需求 |
| 原子性/中断 | 无：多键写入若页面关闭可留半态；需自建"写临时键→校验→改主键"协议 | 内置事务，中断自动回滚（I3 实证） |
| schema 迁移 | 自建：读时探测版本 + 迁移链（L2 实证可行） | 内置版本号升级事务（I2 实证可行），结构变更与数据迁移在同事务 |
| 损坏/部分写入 | JSON 半截风险，需隔离+默认档（L3 实证方案） | 引擎级原子性；浏览器管理淘汰是主要风险 |
| 配额/清理 | 5MB 硬限、同步抛错；"浏览器清理"：localStorage 一般不被自动清除 | 配额大但**在磁盘压力下可被整库淘汰**（eviction），需关注 |
| 隐私模式 | 可用（实测）；会话结束清除 | 可用（实测 -private 8/8） |
| PC/手机浏览器支持 | 全支持 | 全支持（现代移动浏览器，含 iOS Safari） |
| 导出/重置 | 极易（一个字符串） | 需遍历 store 导出 |
| 实现复杂度 | 极低（~50 行含迁移/恢复） | 中（回调/Promise 包装、升级回调） |
| 测试成本 | 低 | 中（异步时序、版本升级用例） |

## 3. 建议（供负责人决策，非定案）

**建议：localStorage + 单键 JSON + 版本字段 + 损坏隔离 + 写前临时键协议**，理由：

1. 首版存档数据量小（15 项 Must-have 的存档 ≈ 几十 KB JSON），5MB 配额余量 >50 倍。
2. 同步模型让"读档→进局"路径无异步竞态，代码量与测试成本显著低。
3. 唯一实质短板（无原子性）可用薄协议补齐：写 `save_next` → 校验可解析 → 覆盖 `save_main` → 删 `save_next`；启动时若发现 `save_next` 存在即视为上次写入中断，优先 `save_next`（若有效）或回退 `save_main`。**该协议已由 L6b/L6c 实测验证（有效临时键优先恢复、损坏临时键回退主档）**；配额耗尽时的失败行为由 L6 在 Chrome 157/macOS 实测（写临时键抛 QuotaExceededError，主档完好）。
4. IndexedDB 的优势（大数据量、事务、结构化存储）对首版存档均非必需；其淘汰风险与实现复杂度反而是净增成本。

**何时应改选 IndexedDB（明确触发条件）**：若后续出现录像/大图集缓存/ >4MB 单档数据，或负责人要求强中断一致性而不愿引入临时键协议。

### 建议存档 schema（草案，待 D-207 定案后正式化）

```jsonc
{
  "schemaVersion": 2,           // 每次结构变更 +1
  "savedAt": "2026-11-13T12:00:00Z",
  "profile": { "gold": 0, "unlocks": [] },
  "inventory": [ /* 装备实例 */ ],
  "stash": [ /* 仓库 */ ],
  "settings": { "sfx": true, "music": true }
}
```

迁移策略：启动读取 → `schemaVersion < CURRENT` 时按链式 migrator（v1→v2→…）升级 → 写回；迁移失败 → 保留原档于 `save_corrupt_backup` + 用空档启动（不覆盖原档）。

## 4. 决策门状态

- [x] 比较表 + 最小验证（3 环境 × 8 测试）
- [x] 建议 schema 与迁移策略（草案）
- [x] 明确推荐 + 触发改选条件
- [ ] **负责人确认 D-207** ← 等待中（未更新 DECISIONS_LOG.md；未实现正式 adapter；S2-G 中仅提供存储接口 + mock adapter）

## 5. 复现

```bash
npm ci && npm run build && npm run preview   # http://localhost:4175
node evidence/harness.mjs firefox  http://localhost:4175/ evidence/results-firefox.txt evidence/shot-firefox.png
node evidence/harness.mjs chromium http://localhost:4175/ evidence/results-chromium.txt evidence/shot-chromium.png
node evidence/harness.mjs firefox  http://localhost:4175/ evidence/results-firefox-private.txt evidence/shot-firefox-private.png private
```

## 6. 限制与未测项

- 沙箱仅覆盖桌面 Firefox/Chromium；手机浏览器矩阵（iOS Safari、Android Chrome）未实测——手机端 API 均为标准 Web API，风险低，但如实标注为未测。
- QuotaExceeded 已在本机 Chrome/macOS 实测（L6）；Firefox 与手机浏览器上的 L6 未重跑，标记 NOT VERIFIED；极端低存储设备的具体行为仍未测。
- Firefox `-private` 结果与普通模式一致，但未验证"关闭浏览器后数据清除"的生命周期细节（未自动化）。
