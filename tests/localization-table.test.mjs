/**
 * 文案表固化断言（把叙事总监的临时脚本 /tmp/rb_check_keys.mjs 变成测试防线）。
 *
 * 覆盖叙事规格 §6 的三条自测：
 *  1) UI_TEXT_KEYS 全部 46 个 key 被 enTexts 覆盖
 *  2) 字符串值零中文、零 TODO/PLACEHOLDER、零 key 残留
 *  3) resolver 命中真英文 + 未知 key 兜底（动态拼 key 安全网）
 * 另加 S3 决策守卫：ui.settle.afterword 入表但 UI 不引用（待所有者拍板）。
 *
 * 单独运行：node --experimental-strip-types --no-warnings --test tests/localization-table.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { enTexts } from '../src/text/en.ts';
import { enResolver } from '../src/text/resolver.ts';
import { UI_TEXT_KEYS } from '../src/ui/uiText.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const PLACEHOLDER = /\b(TODO|FIXME|PLACEHOLDER|TBD|XXX)\b/i;
const KEYISH = /^(ui|gem|boss|enemy|affix|event|upgrade)\./;

test('L10N-01 enTexts 覆盖全部 46 个 UI_TEXT_KEYS 且规模符合交付', () => {
  const uiKeys = Object.values(UI_TEXT_KEYS);
  assert.equal(uiKeys.length, 46, 'UI_TEXT_KEYS 应为 46 个');
  assert.equal(new Set(uiKeys).size, 46, 'UI_TEXT_KEYS 不得重复');
  const missing = uiKeys.filter((k) => !(k in enTexts));
  assert.deepEqual(missing, [], `enTexts 缺 key: ${missing.join(', ')}`);
  assert.equal(Object.keys(enTexts).length, 143, '叙事交付为 143 条');
});

test('L10N-02 全部字符串值：非空英文、无中文、无占位符、无 key 残留', () => {
  const entries = Object.entries(enTexts);
  assert.equal(entries.length, 143);
  for (const [key, value] of entries) {
    assert.equal(typeof value, 'string', `${key} 必须是字符串`);
    assert.ok(value.length > 0, `${key} 不得为空`);
    assert.equal(value, value.trim(), `${key} 不得有首尾空白`);
    assert.equal(CJK.test(value), false, `${key} 的字符串值含中文：${value}`);
    assert.equal(PLACEHOLDER.test(value), false, `${key} 含占位符：${value}`);
    assert.equal(KEYISH.test(value), false, `${key} 值疑似 key 未翻译：${value}`);
  }
});

test('L10N-03 enResolver 命中真英文且未知 key 原样兜底', () => {
  assert.equal(enResolver('ui.settle.victory'), 'Victory');
  assert.equal(enResolver('ui.currency.gold'), 'Gold');
  assert.equal(enResolver('ui.boss.phase.guardian'), "The Warden's Wake");
  assert.equal(enResolver('enemy.riftHound.name'), 'Rift Hound'); // 动态拼 key 已覆盖
  assert.equal(enResolver('ui.not.a.real.key'), 'ui.not.a.real.key'); // ?? key 安全网
  assert.equal(enResolver('enemy.<defId>.name'), 'enemy.<defId>.name');
});

test('L10N-04 S3：结语句入表但 UI 不引用（等所有者拍板）', () => {
  assert.equal(enTexts['ui.settle.afterword'], 'The Rift endures. Another must keep watch.');
  const uiDir = path.resolve(here, '../src/ui');
  const hits = readdirSync(uiDir)
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) =>
      readFileSync(path.join(uiDir, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ f, line: i + 1, text: line }))
        .filter(({ text }) => text.includes('ui.settle.afterword')),
    );
  assert.deepEqual(hits, [], '结算结语句当前不得挂到 UI');
});
