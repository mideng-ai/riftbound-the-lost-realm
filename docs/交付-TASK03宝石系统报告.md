# TASK-03 交付报告 — Gem Systems（七宝石 / 五品质 / 三槽位 / 合成）

分支：`feat/task-03-gems`（自 main 切出，未触碰 main）

## 验收标准对照（任务书逐条）

| 验收标准 | 结果 | 证据 |
|---|---|---|
| 合成只接受三颗同种同品质；传说不可继续合成 | ✅ | `merge.ts` + 测试「合成」套件（颗数/混品质/混种类/传说/镶嵌中材料 全部拒绝，拒绝零副作用） |
| 镶嵌宝石在局内不被意外替换 | ✅ | 占用槽返回 `GEM_SLOT_OCCUPIED`，禁止隐式顶替；同实例禁双槽（含跨武器） |
| 元素效果从正确武器命中事件触发，不是换色 | ✅ | `resolveGemHit` 只认 `hit.weaponId` 与查询侧一致的命中；错配 100 连击零触发（测试断言） |
| 重复镶嵌 1.0/1.5/2.0 倍率生效，触发概率总上限 50% 不被突破 | ✅ | 概率走 domain `elementProcChance`（Q4-B 公式，夹 `procChanceAbs=0.5`）；属性效果乘 `repeatMultByCount`，测试与 config 常量逐项比对 |
| 重新加载后库存与槽位一致（`validateSaveV3` 拦截悬空 itemInstanceId） | ✅ | 槽存 itemInstanceId（Q6）；镶嵌中宝石禁移除/禁作合成材料；悬空引用由 `validateSaveV3` 拦截（测试构造坏存档断言） |
| 品质倍率 / 重复倍率 / 控制上限全部来自 config，无硬编码 | ✅ | 全部只读引用 `gemConfig` / `common.ts` / domain `effectiveControlCaps`；测试期望值从 config 常量推导 |
| 新增测试覆盖上述规则 | ✅ | `tests/gems.test.mjs` 24 断言（5 套件） |

## 交付物

- `src/gems/`（新增，唯一改动面）：
  - `inventory.ts` — 库存增删查、itemInstanceId 生成（从库存推导序列，不改冻结的 SaveDataV3 schema）
  - `socket.ts` — 镶嵌/拆卸（写时复制，纯函数）+ `gem.socketed`/`gem.unsocketed` payload 构造
  - `merge.ts` — 三合一合成（确定性）+ `gem.merged` payload
  - `effects.ts` — 属性加成（power 进武器伤害、haste 攻速、vitality 全局生命）+ 元素触发状态（复用 domain `elementProcChance`）
  - `proc.ts` — 命中结算（注入 domain Rng，逐元素独立掷骰）+ `proc.triggered` payload
- `tests/gems.test.mjs`：24 断言，按仓库既有编译管线（tsc → .testbuild → node:test）
- 构建接线（最小增量）：`tsconfig.test.json` include 加 `src/gems`；`package.json` 新增 `test:gems` 并入 `test` 链
- 冻结契约 `src/domain/`、`src/config/` 零改动（`git diff` 验证）

## 红线遵守

- 只提供效果接口：`resolveGemHit` 返回数值与事件 payload，由战斗侧施加 debuff/回血；未修改武器攻击内部算法
- 无 UI、无 Babylon/DOM import（grep 验证）
- `enemy.killed` / `craft`（碎片制作宝石，总纲 §6.3）留待 TASK-04 经济侧消费，本任务未实现（不在范围）

## 本模块明确的两处口径（未在契约中写死，已写进代码注释）

1. 同种多颗不同品质：品质取最高那颗（触发概率步进与属性倍率同用），重复颗数全计入
2. 元素效果强度（燃烧 8%/s 等）不随品质/重复放大（Q4-B 裁定概率维），控制上限按敌档衰减（`effectiveControlCaps`）

## 验证输出（原文见提交信息与 CI 口径）

- `npx tsc --noEmit` → EXIT 0
- `npm run test` → domain 53/53 全绿 + input 18/18 全绿 + gems 24/24 全绿
