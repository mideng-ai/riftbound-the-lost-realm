/**
 * Game configuration. Numbers marked PROVISIONAL are pending owner decisions
 * (D-207 save adapter, D-210 performance budget, final rendering direction)
 * and MUST NOT be treated as confirmed targets.
 */
export const gameConfig = {
  /** D-210: PROVISIONAL load ladder target — owner decision pending */
  perfBudget: {
    /** candidate only: mobile mid-tier frame budget (ms) */
    frameTimeP95Ms: 33.3, // = 30 FPS
    /** candidate only: desktop target */
    desktopTargetFps: 60,
  } as const,

  /** D-207: save backend NOT decided. 'mock' is the only wired adapter. */
  saveAdapter: 'mock' as 'mock', // future: 'localstorage' | 'indexeddb' after D-207

  /** Rendering: PROVISIONAL toon pipeline (ST2-002 path B GLSL cel). Owner has
   *  not made the final rendering-direction decision; swap via ToonMaterial. */
  render: {
    toonBands: [0.08, 0.44, 0.78] as const,
    bandWeights: [0.3, 0.32, 0.38] as const,
  },

  /** VFX (S2-C conclusion): lightweight path default, pooling optional */
  vfx: {
    projectileSpeed: 6,
    autoFireIntervalMs: 2000,
    poolingEnabled: false, // S2-C evidence: dispose is sufficient at <50 concurrent
  },

  debug: {
    showPerfHud: true,
  },
} as const;
