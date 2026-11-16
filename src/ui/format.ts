/**
 * TASK-07 UI 纯格式化函数（零依赖，可单测）。
 * 只做展示格式转换，不含任何游戏数值、不参与规则计算。
 */
export function formatTime(sec: number): string {
  const t = Number.isFinite(sec) && sec >= 0 ? Math.floor(sec) : 0;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  return Math.floor(n).toLocaleString('en-US');
}

/** 0..1 → 整数百分比字符串。 */
export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
}

/** 数值夹取（纯展示防御，不是游戏规则）。 */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** HP 展示档位（只决定 UI 颜色 token，不参与战斗结算）。 */
export function hpDisplayTier(hpPct: number): 'low' | 'mid' | 'high' {
  if (hpPct <= 0.25) return 'low';
  if (hpPct <= 0.55) return 'mid';
  return 'high';
}
