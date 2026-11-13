/**
 * PerfMonitor — debug/performance observation HUD (fps, frame-time percentiles).
 * D-210 gate: displayed numbers are observations, NOT budget assertions.
 * Methodology reference: spikes/ST2-003-F-PERF/
 */
import { Scene, Engine } from '@babylonjs/core';

export class PerfMonitor {
  private frameDts: number[] = [];
  private el: HTMLDivElement | null = null;
  private enabled: boolean;

  constructor(private engine: Engine, scene: Scene, enabled = true) {
    this.enabled = enabled;
    scene.onBeforeRenderObservable.add(() => this.frameDts.push(engine.getDeltaTime()));
    if (enabled) {
      this.el = document.createElement('div');
      this.el.style.cssText =
        'position:fixed;bottom:8px;right:8px;z-index:10;font:11px/1.5 monospace;color:#9fd8b4;background:rgba(5,8,16,0.75);padding:6px 9px;border-radius:6px;white-space:pre;pointer-events:none;';
      document.body.appendChild(this.el);
      setInterval(() => this.refresh(), 400);
    }
  }

  private percentile(p: number): number {
    if (this.frameDts.length === 0) return 0;
    const s = [...this.frameDts].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  }

  private refresh(): void {
    if (!this.el) return;
    const recent = this.frameDts.slice(-120);
    const fps = 1000 / (recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length));
    this.el.textContent =
      `fps=${fps.toFixed(1)} p50=${this.percentile(0.5).toFixed(1)}ms p95=${this.percentile(0.95).toFixed(1)}ms\n` +
      `activeMeshes=${this.engine.scenes[0]?.getActiveMeshes().length ?? '-'} (observations, not budget)`;
  }

  get stats(): { fps: number; p50: number; p95: number } {
    const recent = this.frameDts.slice(-120);
    return {
      fps: 1000 / (recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length)),
      p50: this.percentile(0.5),
      p95: this.percentile(0.95),
    };
  }

  get enabledState(): boolean {
    return this.enabled;
  }
}
