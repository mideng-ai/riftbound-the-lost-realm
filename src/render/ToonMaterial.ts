/**
 * ToonMaterial — PROVISIONAL cartoon shading adapter.
 *
 * Source: migrated from spikes/ST2-002 (path B, GLSL cel shader, correction
 * round 1 unified equation). The final rendering direction has NOT been
 * decided by the owner; this adapter exists so the pipeline can be swapped
 * (e.g. NME variant) without touching scene code.
 *
 * Unified equation (validated in ST2-002): final = baseColor * (ambient + light * band)
 * band = 0.30*step(0.08,N·L) + 0.32*step(0.44,N·L) + 0.38*step(0.78,N·L)
 */
import { ShaderMaterial, Scene, Color3, Vector3 } from '@babylonjs/core';
import { gameConfig } from '../config/gameConfig';

export class ToonMaterial {
  readonly material: ShaderMaterial;

  constructor(name: string, scene: Scene, baseColor: Color3) {
    const [t1, t2, t3] = gameConfig.render.toonBands;
    const [w1, w2, w3] = gameConfig.render.bandWeights;

    const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec4 p = vec4(position, 1.0);
  gl_Position = worldViewProjection * p;
  vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
  vPosW = (world * p).xyz;
}`;

    const fragmentSource = `
precision highp float;
uniform vec3 baseColor;
uniform vec3 lightDir;
uniform vec3 lightColor;
uniform vec3 ambientColor;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, normalize(lightDir));
  float band = ${w1} * step(${t1}, ndl) + ${w2} * step(${t2}, ndl) + ${w3} * step(${t3}, ndl);
  vec3 final = baseColor * (ambientColor + lightColor * band);
  gl_FragColor = vec4(final, 1.0);
}`;

    this.material = new ShaderMaterial(
      name,
      scene,
      { vertexSource, fragmentSource },
      {
        attributes: ['position', 'normal'],
        uniforms: ['worldViewProjection', 'world', 'baseColor', 'lightDir', 'lightColor', 'ambientColor'],
        needAlphaBlending: false,
      },
    );
    this.material.setColor3('baseColor', baseColor);
    this.material.setColor3('lightColor', new Color3(0.85, 0.82, 0.78));
    this.material.setColor3('ambientColor', new Color3(0.22, 0.24, 0.3));
    this.setLightDirection(new Vector3(-0.4, -0.85, 0.3));
    this.material.backFaceCulling = true;
  }

  setLightDirection(dir: Vector3): void {
    this.material.setVector3('lightDir', dir.normalize());
  }

  /** Bind a world light direction to drive the toon bands. */
  bindLight(dirWorld: Vector3): void {
    this.material.setVector3('lightDir', dirWorld.normalize());
  }
}
