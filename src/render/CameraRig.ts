/**
 * CameraRig — top-down camera adapter.
 * Encapsulates camera framing so gameplay code never touches camera internals.
 */
import { ArcRotateCamera, Scene, Vector3 } from '@babylonjs/core';

export class CameraRig {
  readonly camera: ArcRotateCamera;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera('mainCam', -Math.PI / 2, 0.9, 14, new Vector3(0, 0, 0), scene);
    // gameplay uses the input abstraction; camera control is not player-facing
    this.camera.attachControl(canvas, true);
    this.camera.lowerBetaLimit = 0.2;
    this.camera.upperBetaLimit = 1.35;
    this.camera.lowerRadiusLimit = 8;
    this.camera.upperRadiusLimit = 22;
  }

  /** follow a target smoothly (used by the bootstrap scene demo) */
  follow(pos: Vector3): void {
    this.camera.target.x += (pos.x - this.camera.target.x) * 0.06;
    this.camera.target.z += (pos.z - this.camera.target.z) * 0.06;
  }
}
