/**
 * TASK-07 DOM 工具（轻量、无框架依赖）。
 * 形状徽标是色盲双通道的渲染实现：颜色 + 几何形状始终同时出现。
 */
import { shapeNeedsEvenOdd, shapePath } from './theme.ts';

type AttrKey =
  | 'class'
  | 'id'
  | 'role'
  | 'aria-label'
  | 'aria-live'
  | 'aria-hidden'
  | 'title'
  | 'data-shape'
  | 'data-state';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Partial<Record<AttrKey, string>>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 形状徽标（fill + evenodd 支持镂空环/新月）。 */
export function shapeBadge(shape: string, color: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'rb-shape');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', shapePath(shape));
  path.setAttribute('fill', color);
  if (shapeNeedsEvenOdd(shape)) path.setAttribute('fill-rule', 'evenodd');
  svg.appendChild(path);
  return svg;
}

/** 文本单元格：仅在值变化时写 DOM（每帧轮询时避免 layout 抖动）。 */
export interface TextCell {
  readonly node: HTMLElement;
  last: string;
}

export function textCell(node: HTMLElement): TextCell {
  return { node, last: '' };
}

export function setIfChanged(cell: TextCell, value: string): void {
  if (cell.last !== value) {
    cell.node.textContent = value;
    cell.last = value;
  }
}
