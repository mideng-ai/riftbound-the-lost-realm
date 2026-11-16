/**
 * 音频层桶导出：外部（main.ts / QA 测试）只从本文件导入，不深链内部模块。
 * 依据 ADR-TD-008：裸 Web Audio 运行时，零外部音频资产、零 domain/config 改动。
 */
export { createAudioRuntime, AudioRuntime } from './AudioRuntime.ts';
export { sfxRecipes, MIX_CONST } from './recipes/sfxRecipes.ts';
export { bgmRecipes, CENTS_PER_SEMITONE } from './recipes/bgmRecipes.ts';
export { synthesize, synthesizeLayers, getNoiseBuffers } from './synth.ts';
export { VoicePool } from './voicePool.ts';
export { BgmScheduler } from './bgmScheduler.ts';
export { AudioBridge } from './AudioBridge.ts';
export { createContextUnlock } from './contextUnlock.ts';
export type {
  AudioRuntimeOptions,
  SynthRecipe,
  OscLayer,
  Envelope,
  Filter,
  Sweep,
  Note,
  Echo,
  Wave,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  ContextFactory,
  TimerPort,
  DomPort,
  BgmTrackId,
  BgmRecipeSet,
  BgmLayer,
  BgmNote,
  BgmControlEvent,
  AudioEventId,
  EventBusApi,
} from './types.ts';
export type { PlaybackHandle, SynthOptions, NoiseBuffers } from './synth.ts';
export type { Voice, VoicePoolOptions } from './voicePool.ts';
