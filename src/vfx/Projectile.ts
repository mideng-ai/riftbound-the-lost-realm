/**
 * Projectile — minimal VFX lifecycle (launch → flight → hit → release).
 * Migrated from spikes/ST2-003-C-VFX (lightweight path). Demonstration only —
 * this is NOT skill/gameplay implementation (no damage/cooldowns).
 * S2-C conclusions applied: dispose-on-hit; pooling optional (<50 concurrent).
 */
import {
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Color3,
  Vector3,
  ParticleSystem,
  DynamicTexture,
  TransformNode,
} from '@babylonjs/core';
import { gameConfig } from '../config/gameConfig';

export interface ProjectileOptions {
  target: Vector3;
  speed?: number;
  onHit?: (pos: Vector3) => void;
}

function sparkTexture(scene: Scene): DynamicTexture {
  const dt = new DynamicTexture('sparkTex', { width: 64, height: 64 }, scene, false);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(140,190,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dt.update();
  dt.hasAlpha = true;
  return dt;
}

export class ProjectileSystem {
  private projectiles: Array<{ mesh: Mesh; vel: Vector3; target: Vector3; trail: ParticleSystem; onHit?: (pos: Vector3) => void }> = [];
  private mat: StandardMaterial;
  private spark: DynamicTexture;
  private tweens: Array<{ t: number; dur: number; tick: (k: number) => void; done?: () => void }> = [];

  constructor(private scene: Scene) {
    this.mat = new StandardMaterial('projMat', scene);
    this.mat.emissiveColor = new Color3(0.3, 0.85, 1);
    this.mat.diffuseColor = Color3.Black();
    this.mat.disableLighting = true;
    this.spark = sparkTexture(scene);
    scene.onBeforeRenderObservable.add(() => this.update());
    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime();
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        tw.tick(k);
        if (k >= 1) {
          this.tweens.splice(i, 1);
          tw.done?.();
        }
      }
    });
  }

  launch(from: Vector3, opts: ProjectileOptions): void {
    const mesh = MeshBuilder.CreateSphere('proj', { diameter: 0.22, segments: 10 }, this.scene);
    mesh.position.copyFrom(from);
    mesh.material = this.mat;
    const trail = new ParticleSystem('trail', 120, this.scene);
    trail.particleTexture = this.spark;
    trail.emitter = mesh;
    trail.color1 = new Color3(0.5, 0.9, 1).toColor4(0.9);
    trail.color2 = new Color3(0.3, 0.6, 0.9).toColor4(0.6);
    trail.minSize = 0.05;
    trail.maxSize = 0.14;
    trail.minLifeTime = 0.25;
    trail.maxLifeTime = 0.5;
    trail.emitRate = 70;
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    trail.start();
    this.projectiles.push({
      mesh,
      vel: opts.target.subtract(from).normalize().scale(opts.speed ?? gameConfig.vfx.projectileSpeed),
      target: opts.target,
      trail,
      onHit: opts.onHit,
    });
  }

  private update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.addInPlace(p.vel.scale(dt));
      if (Vector3.Distance(p.mesh.position, p.target) < 0.35) {
        const pos = p.mesh.position.clone();
        this.flash(pos);
        p.onHit?.(pos);
        p.trail.stop();
        p.mesh.dispose();
        this.projectiles.splice(i, 1);
        setTimeout(() => p.trail.dispose(), 600);
      }
    }
  }

  /** lightweight hit feedback: one billboard flash (S2-C lightweight path) */
  private flash(pos: Vector3): void {
    const plane = MeshBuilder.CreatePlane('hitFlash', { size: 0.9 }, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.position = pos;
    const mat = new StandardMaterial('hitFlashMat', this.scene);
    mat.emissiveTexture = this.spark;
    mat.opacityTexture = this.spark;
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(0.6, 0.9, 1);
    plane.material = mat;
    plane.isPickable = false;
    this.tweens.push({
      t: 0,
      dur: 380,
      tick: (k) => {
        plane.scaling.setAll(0.4 + 0.6 * k);
        mat.alpha = 1 - k;
      },
      done: () => plane.dispose(false, true),
    });
  }

  get liveCount(): number {
    return this.projectiles.length;
  }
}

export type Emitter = TransformNode;
