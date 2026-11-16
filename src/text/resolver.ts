/**
 * 文案表接线（叙事规格 §5 的宿主侧注入，原文落地）。
 *
 * 叙事总监交付的 enTexts 是零依赖数据叶子；本文件只做一层薄的 TextResolver 适配：
 *  - 命中 key → 玩家可见英文
 *  - 未命中（动态拼 key 漏配等）→ 原样返回 key，绝不返回 undefined / 空白
 *
 * 调试解析器 debugTextResolver / identityTextResolver 仍保留在 uiText.ts，
 * 但不再是默认 resolver：默认运行路径必须走这里，否则玩家会看到 'Settle victory'。
 */
import { enTexts } from './en.ts';
import type { TextResolver } from '../ui/uiText.ts';

export const enResolver: TextResolver = (key) => enTexts[key] ?? key;
