/**
 * AssetLoader — resource loading seam.
 * Stage-2 bootstrap uses only procedural assets; the interface exists so the
 * Stage-3 GLTF/texture pipeline can be introduced without touching scenes.
 */
import { Scene } from '@babylonjs/core';

export interface AssetDescriptor {
  key: string;
  /** URL or procedural marker; empty string = procedural placeholder */
  url?: string;
}

export class AssetLoader {
  private loaded = new Map<string, unknown>();

  constructor(private scene: Scene) {}

  /** placeholder: procedural assets need no async load; tracks completion. */
  async loadAll(descriptors: AssetDescriptor[]): Promise<Map<string, unknown>> {
    for (const d of descriptors) {
      if (d.url) {
        // Stage 3: route through AssetsManager / ImportMesh here.
        this.loaded.set(d.key, null);
      } else {
        this.loaded.set(d.key, { procedural: true });
      }
    }
    return this.loaded;
  }

  get sceneRef(): Scene {
    return this.scene;
  }
}
