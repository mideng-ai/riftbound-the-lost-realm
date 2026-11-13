/**
 * EngineHost — engine & scene lifecycle ownership.
 * Creates the Babylon engine, owns the active scene, and forwards
 * resize / visibility / blur events to engine & scene policies.
 */
import { Engine, Scene } from '@babylonjs/core';

export interface EngineHostOptions {
  canvas: HTMLCanvasElement;
}

export class EngineHost {
  readonly engine: Engine;
  private currentScene: Scene | null = null;
  private disposed = false;

  constructor(opts: EngineHostOptions) {
    this.engine = new Engine(opts.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** register the (single) active scene and start the render loop */
  useScene(scene: Scene): void {
    this.currentScene = scene;
    this.engine.runRenderLoop(() => {
      if (this.currentScene && !this.disposed) this.currentScene.render();
    });
  }

  get scene(): Scene | null {
    return this.currentScene;
  }

  private onResize = () => this.engine.resize();

  /** page hidden: pause rendering to save battery (mobile-first requirement) */
  private onVisibility = () => {
    if (this.disposed || !this.currentScene) return;
    if (document.hidden) {
      this.engine.stopRenderLoop();
    } else {
      this.engine.resize();
      this.engine.runRenderLoop(() => {
        if (this.currentScene && !this.disposed) this.currentScene.render();
      });
    }
  };

  dispose(): void {
    this.disposed = true;
    this.engine.stopRenderLoop();
    this.currentScene?.dispose();
    this.engine.dispose();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
