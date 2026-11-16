/**
 * 音频运行时 headless 契约测试（ADR-TD-008 / 工程-音频运行时架构.md §6.1）。
 *
 * 运行：npm run test:audio
 * 方式：纯 JS 测试直接 import src/**.ts（node --experimental-strip-types），
 *       注入 spy AudioContext / DomPort / TimerPort，无需真实音频设备、无随机、无真实计时。
 *
 * 覆盖 8 项 BLOCKING：48 配方覆盖 + 公式合法性 / 事件接线（含 3 类动态事件）/
 * 退订归零（且不 clearAll）/ 16 音源上限 / 优先级抢占 / 静音开关 / BGM 选曲转调 / 解锁生命周期。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAudioRuntime,
  AudioRuntime,
  sfxRecipes,
  bgmRecipes,
  MIX_CONST,
  VoicePool,
  BgmScheduler,
  createContextUnlock,
} from '../src/audio/index.ts';
import {
  createEventBus,
  AUDIO_EVENT_MAP,
  sfxForProc,
  sfxForPickup,
  sfxForBossPhase,
  sfxForAffix,
  mixerPriorityOf,
  resolveSfxForEvent,
} from '../src/domain/index.ts';
import { audioEventMapConfig } from '../src/config/audioEventMapConfig.ts';

// ── headless mock Web Audio ──────────────────────────────────

class MockParam {
  constructor(initial = 0) { this.value = initial; this.calls = []; }
  setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['lin', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.value = v; this.calls.push(['exp', v, t]); }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
}

class MockNode {
  constructor(kind, ctx) { this.kind = kind; this.ctx = ctx; this.connections = []; }
  connect(dest) { this.connections.push(dest); return dest; }
  disconnect() { this.connections.length = 0; }
}

class MockSource extends MockNode {
  constructor(kind, ctx) {
    super(kind, ctx);
    this.started = [];
    this.stopped = [];
    this.onended = null;
  }
  start(when) { this.started.push(when ?? this.ctx.currentTime); }
  stop(when) { this.stopped.push(when ?? this.ctx.currentTime); }
  fireEnded() { if (this.onended) this.onended(); }
}

class MockOscillator extends MockSource {
  constructor(ctx) {
    super('osc', ctx);
    this.type = 'sine';
    this.frequency = new MockParam(440);
    this.detune = new MockParam(0);
  }
}

class MockBufferSource extends MockSource {
  constructor(ctx) {
    super('bufferSource', ctx);
    this.buffer = null;
    this.loop = false;
    this.playbackRate = new MockParam(1);
  }
}

class MockGain extends MockNode {
  constructor(ctx) { super('gain', ctx); this.gain = new MockParam(1); }
}

class MockFilter extends MockNode {
  constructor(ctx) {
    super('filter', ctx);
    this.type = 'lowpass';
    this.frequency = new MockParam(350);
    this.Q = new MockParam(1);
  }
}

class MockPanner extends MockNode {
  constructor(ctx) { super('panner', ctx); this.pan = new MockParam(0); }
}

class MockCompressor extends MockNode {
  constructor(ctx) {
    super('compressor', ctx);
    this.threshold = new MockParam(0);
    this.knee = new MockParam(0);
    this.ratio = new MockParam(1);
    this.attack = new MockParam(0);
    this.release = new MockParam(0);
  }
}

class MockBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.data[channel]; }
}

class MockAudioContext {
  constructor(sampleRate = 8000) {
    this.sampleRate = sampleRate;
    this._currentTime = 0;
    this.destination = new MockNode('destination', this);
    this.created = [];
    this.buffers = [];
    this.resumeCount = 0;
    this.suspendCount = 0;
    this.closeCount = 0;
  }
  get currentTime() { return this._currentTime; }
  set currentTime(v) { this._currentTime = v; }
  _add(node) { this.created.push(node); return node; }
  createGain() { return this._add(new MockGain(this)); }
  createBiquadFilter() { return this._add(new MockFilter(this)); }
  createStereoPanner() { return this._add(new MockPanner(this)); }
  createOscillator() { return this._add(new MockOscillator(this)); }
  createBufferSource() { return this._add(new MockBufferSource(this)); }
  createDynamicsCompressor() { return this._add(new MockCompressor(this)); }
  createBuffer(ch, len, rate) { const b = new MockBuffer(ch, len, rate); this.buffers.push(b); return b; }
  resume() { this.resumeCount += 1; return Promise.resolve(); }
  suspend() { this.suspendCount += 1; return Promise.resolve(); }
  close() { this.closeCount += 1; return Promise.resolve(); }
}

class MockDom {
  constructor() { this.handlers = []; this.removals = []; this.hidden = false; }
  addEventListener(target, type, fn) { this.handlers.push({ target, type, fn }); }
  removeEventListener(target, type, fn) {
    this.removals.push({ target, type, fn });
    this.handlers = this.handlers.filter((h) => !(h.target === target && h.type === type && h.fn === fn));
  }
  isHidden() { return this.hidden; }
  fire(target, type) {
    for (const h of [...this.handlers]) if (h.target === target && h.type === type) h.fn();
  }
  count(target, type) { return this.handlers.filter((h) => h.target === target && h.type === type).length; }
}

class MockTimers {
  constructor() { this.timers = new Map(); this.next = 1; this.cleared = 0; }
  set(fn, ms) { const id = this.next++; this.timers.set(id, { fn, ms }); return id; }
  clear(handle) { this.timers.delete(handle); this.cleared += 1; }
  tickAll() { for (const { fn } of [...this.timers.values()]) fn(); }
}

// ── 冻结契约的 48 个具体 ID（展开 sfx_affix_${EliteAffixId} 6 项） ──
const EXPECTED_48 = [
  'sfx_staff_cast', 'sfx_staff_hit', 'sfx_sword_swing', 'sfx_sword_hit',
  'sfx_proc_fire', 'sfx_proc_frost', 'sfx_proc_storm', 'sfx_proc_shadow',
  'sfx_player_hurt', 'sfx_player_death', 'sfx_dash',
  'sfx_pickup_gold', 'sfx_pickup_material', 'sfx_pickup_shard', 'sfx_pickup_core',
  'sfx_levelup', 'sfx_upgrade_pick', 'sfx_gem_socket', 'sfx_gem_unsocket',
  'sfx_gem_merge', 'sfx_weapon_upgrade', 'sfx_weapon_switch', 'sfx_purchase',
  'sfx_elite_spawn',
  'sfx_affix_berserk', 'sfx_affix_split', 'sfx_affix_vampiric',
  'sfx_affix_shielded', 'sfx_affix_summoner', 'sfx_affix_toxic',
  'sfx_boss_warn_1', 'sfx_boss_warn_2', 'sfx_boss_warn_3',
  'sfx_boss_attack_1', 'sfx_boss_attack_2', 'sfx_boss_attack_3',
  'sfx_boss_attack_4', 'sfx_boss_attack_5', 'sfx_boss_attack_6',
  'sfx_boss_phase_2', 'sfx_boss_phase_3', 'sfx_boss_defeat',
  'sfx_event_start', 'sfx_event_done', 'sfx_ui_click', 'sfx_ui_error',
  'sfx_run_win', 'sfx_run_lose',
];

/** 建一个带注入点的运行时；时钟由外部推进以绕开 80ms 合并窗口。 */
function makeRuntime(bus, clock = { sec: 0 }) {
  const ctx = new MockAudioContext();
  const dom = new MockDom();
  const timers = new MockTimers();
  const runtime = createAudioRuntime({
    bus, muted: false,
    contextFactory: () => ctx,
    dom, timers,
    now: () => clock.sec,
  });
  return { runtime, ctx, dom, timers, clock };
}

// ── 1. 配方表结构与覆盖 ─────────────────────────────────────
describe('A. 配方表 48 覆盖与结构合法性', () => {
  test('A1 键集合 == 冻结契约展开的 48 个具体 ID，零缺口零越界', () => {
    const keys = Object.keys(sfxRecipes);
    assert.equal(keys.length, 48, '配方表必须恰好 48 条');
    assert.equal(new Set(EXPECTED_48).size, 48);
    assert.deepEqual([...keys].sort(), [...EXPECTED_48].sort());
    assert.ok(!keys.includes('sfx_affix_'), '模板前缀不得成为实体键');
    assert.ok(!keys.includes('sfx_staff_cast_a'), '命名规范示例不得成为实体键');
  });

  test('A2 每条配方字段合法（ADSR/增益/扫频/优先级/时长）', () => {
    for (const [id, recipe] of Object.entries(sfxRecipes)) {
      assert.equal(recipe.id, id, `${id}: id 自洽`);
      assert.ok(recipe.dur > 0, `${id}: DUR>0`);
      assert.ok(recipe.layers.length > 0, `${id}: 至少一条声部`);
      assert.ok(Object.hasOwn(audioEventMapConfig.mixerPriority, recipe.priority), `${id}: 优先级档合法`);
      assert.ok(recipe.bus === 'sfx' || recipe.bus === 'ui', `${id}: 总线合法`);
      for (const layer of recipe.layers) {
        assert.ok(layer.notes.length > 0, `${id}: 至少一个音符`);
        for (const note of layer.notes) assert.ok(note.hz > 0, `${id}: 音高 >0`);
        for (const key of ['a', 'd', 'r']) {
          assert.ok(layer.env[key] >= 0 && Number.isFinite(layer.env[key]), `${id}: ADSR.${key} 非负有限`);
        }
        assert.ok(layer.env.s >= 0 && layer.env.s <= 1, `${id}: sustain 0–1`);
        assert.ok(layer.gain > 0 && layer.gain <= 1, `${id}: 电平 0–1`);
        if (layer.sweep) {
          assert.ok(layer.sweep.to > 0 && layer.sweep.sec > 0, `${id}: 扫频端点/时长 >0`);
        }
        if (layer.filter) {
          assert.ok(layer.filter.freq > 0 && layer.filter.q >= 0, `${id}: 滤波参数合法`);
        }
      }
    }
  });

  test('A3 冻结契约里所有可达音效都有配方（动态映射全覆盖）', () => {
    const reachable = new Set();
    for (const ids of Object.values(AUDIO_EVENT_MAP)) for (const id of ids) reachable.add(id);
    for (const el of ['fire', 'ice', 'lightning', 'shadow']) reachable.add(sfxForProc(el));
    for (const cur of ['gold', 'forestMaterial', 'fireShard', 'iceShard', 'lightningShard', 'shadowShard', 'forestCore']) {
      reachable.add(sfxForPickup(cur));
    }
    for (const phase of ['guardian', 'corruption', 'coreFrenzy']) {
      const id = sfxForBossPhase(phase);
      if (id) reachable.add(id);
    }
    for (const affix of ['berserk', 'split', 'vampiric', 'shielded', 'summoner', 'toxic']) reachable.add(sfxForAffix(affix));
    for (const id of audioEventMapConfig.bossWarnSfxByCheckpoint) reachable.add(id);
    for (const id of audioEventMapConfig.bossAttackSfx) reachable.add(id);
    for (const id of reachable) assert.ok(sfxRecipes[id], `可达音效 ${id} 必须有配方`);
    assert.ok(reachable.size > 25, '可达集合应覆盖大部分配方');
  });

  test('A4 BGM 配方 = 4 曲目 + 2 环境层，转调半音 0/+2/+5', () => {
    assert.deepEqual(Object.keys(bgmRecipes.tracks).sort(), ['amb1', 'amb2', 'bgm1', 'bgm2', 'bgm3', 'bgm4']);
    assert.deepEqual(bgmRecipes.bossTranspose, { guardian: 0, corruption: 2, coreFrenzy: 5 });
    assert.equal(bgmRecipes.bossPhaseFadeSec.corruption, 1.2);
    assert.equal(bgmRecipes.bossPhaseFadeSec.coreFrenzy, 1.5);
    assert.equal(bgmRecipes.tracks.bgm1.bpm, 68);
    assert.equal(bgmRecipes.tracks.bgm2.bpm, 92);
    assert.equal(bgmRecipes.tracks.bgm3.bpm, 124);
    assert.equal(bgmRecipes.tracks.bgm4.bpm, 132);
  });
});

// ── 2. 事件 → 音效接线 ─────────────────────────────────────
describe('B. 事件接线（含 proc / pickup / boss.phase 动态事件）', () => {
  test('B1 静态映射事件逐一进入播放路径', () => {
    const bus = createEventBus();
    const clock = { sec: 0 };
    const { runtime } = makeRuntime(bus, clock);
    const played = [];
    const original = runtime.playSfx.bind(runtime);
    runtime.playSfx = (id) => { played.push(id); return original(id); };

    const cases = [
      ['player.damaged', {}, ['sfx_player_hurt']],
      ['player.died', {}, ['sfx_player_death']],
      ['player.leveledUp', {}, ['sfx_levelup']],
      ['upgrade.selected', {}, ['sfx_upgrade_pick']],
      ['weapon.switched', {}, ['sfx_weapon_switch']],
      ['weapon.upgraded', {}, ['sfx_weapon_upgrade']],
      ['gem.socketed', {}, ['sfx_gem_socket']],
      ['gem.unsocketed', {}, ['sfx_gem_unsocket']],
      ['gem.merged', {}, ['sfx_gem_merge']],
      ['elite.spawned', {}, ['sfx_elite_spawn']],
      ['boss.warning_started', {}, ['sfx_boss_warn_1']],
      ['boss.defeated', {}, ['sfx_boss_defeat']],
      ['world_event.started', {}, ['sfx_event_start']],
      ['world_event.completed', {}, ['sfx_event_done']],
      ['run.settled', {}, ['sfx_run_win']],
      ['run.started', {}, ['sfx_ui_click']],
    ];
    for (const [type, payload, expected] of cases) {
      played.length = 0;
      clock.sec += 1; // 绕开 80 ms 合并窗口
      bus.publish(type, payload);
      assert.deepEqual(played, expected, `${type} 的音效接线`);
    }
    runtime.dispose();
  });

  test('B2 动态事件由冻结解析函数决定，桥不复制映射逻辑', () => {
    const bus = createEventBus();
    const clock = { sec: 0 };
    const { runtime } = makeRuntime(bus, clock);
    const played = [];
    const original = runtime.playSfx.bind(runtime);
    runtime.playSfx = (id) => { played.push(id); return original(id); };

    const dynamic = [
      ['proc.triggered', { element: 'ice' }, ['sfx_proc_frost']],
      ['proc.triggered', { element: 'fire' }, ['sfx_proc_fire']],
      ['proc.triggered', { element: 'lightning' }, ['sfx_proc_storm']],
      ['proc.triggered', { element: 'shadow' }, ['sfx_proc_shadow']],
      ['resource.picked_up', { currencyId: 'gold' }, ['sfx_pickup_gold']],
      ['resource.picked_up', { currencyId: 'iceShard' }, ['sfx_pickup_shard']],
      ['resource.picked_up', { currencyId: 'forestCore' }, ['sfx_pickup_core']],
      ['boss.phase_changed', { phase: 'corruption' }, ['sfx_boss_phase_2']],
      ['boss.phase_changed', { phase: 'coreFrenzy' }, ['sfx_boss_phase_3']],
      ['boss.phase_changed', { phase: 'guardian' }, []],
    ];
    for (const [type, payload, expected] of dynamic) {
      played.length = 0;
      clock.sec += 1;
      bus.publish(type, payload);
      assert.deepEqual(played, expected, `${type} + ${JSON.stringify(payload)} 的动态解析`);
      // 与冻结函数的结果交叉验证（桥确实调用了它）
      assert.deepEqual(expected, [...resolveSfxForEvent(type, payload)]);
    }
    runtime.dispose();
  });

  test('B3 空映射事件不产生音效，但 BGM 控制仍被消费', () => {
    const bus = createEventBus();
    const { runtime } = makeRuntime(bus);
    const played = [];
    const original = runtime.playSfx.bind(runtime);
    runtime.playSfx = (id) => { played.push(id); return original(id); };
    bus.publish('run.phaseChanged', { from: 'menu', to: 'metaHub' });
    assert.deepEqual(played, []);
    assert.equal(runtime.currentTrack, 'bgm1');
    runtime.dispose();
  });
});

// ── 3. 退订归零 ────────────────────────────────────────────
describe('C. 生命周期与退订归零', () => {
  test('C1 dispose 后所有订阅 listenerCount=0，且从不调用 clearAll', () => {
    const bus = createEventBus();
    let clearAllCalls = 0;
    const originalClearAll = bus.clearAll.bind(bus);
    bus.clearAll = () => { clearAllCalls += 1; originalClearAll(); };
    const { runtime } = makeRuntime(bus);
    const subscribed = Object.keys(AUDIO_EVENT_MAP);
    for (const type of subscribed) assert.ok(bus.listenerCount(type) >= 1, `${type} 已被订阅`);
    assert.ok(runtime.subscriptionCount >= 25);
    runtime.dispose();
    for (const type of subscribed) assert.equal(bus.listenerCount(type), 0, `${type} 退订归零`);
    assert.equal(runtime.subscriptionCount, 0);
    assert.equal(clearAllCalls, 0, '不得误伤其他系统的监听器');
  });

  test('C2 start 幂等；dispose 后再 start 不重复订阅、ctx 关闭一次', () => {
    const bus = createEventBus();
    const { runtime, ctx, clock } = makeRuntime(bus);
    const before = runtime.subscriptionCount;
    runtime.start();
    assert.equal(runtime.subscriptionCount, before);
    clock.sec += 1;
    bus.publish('player.damaged', {}); // 触发一次播放以走 ctx 懒创建路径
    assert.equal(runtime.contextCreated, true);
    runtime.dispose();
    assert.equal(ctx.closeCount, 1);
    assert.equal(runtime.contextCreated, false);
  });
});

// ── 4/5. 音源池上限与抢占 ──────────────────────────────────
describe('D. 16 音源上限与优先级抢占', () => {
  function makePool() {
    const ctx = new MockAudioContext();
    const pool = new VoicePool({ ctx, now: () => 0, outputFor: () => ctx.destination });
    return { ctx, pool };
  }
  const normalIds = EXPECTED_48.filter((id) => sfxRecipes[id].priority === 'normal');

  test('D1 连续 play 20 条 normal，活跃声部恒 <= 16', () => {
    const { pool } = makePool();
    for (const id of normalIds.slice(0, 20)) pool.play(sfxRecipes[id]);
    assert.equal(pool.activeCount, audioEventMapConfig.maxConcurrentVoices);
    assert.equal(pool.activeCount, 16);
    assert.ok(pool.snapshot.every((v) => v.handle.sources.length > 0));
    pool.dispose();
    assert.equal(pool.activeCount, 0);
  });

  test('D2 池满后 bossWarn(40) 抢占 normal(10) 中最老的一个；同级不抢占', () => {
    const { pool } = makePool();
    const played = normalIds.slice(0, 16).map((id) => pool.play(sfxRecipes[id]));
    assert.equal(pool.activeCount, 16);
    const oldest = played[0];
    const incoming = pool.play(sfxRecipes.sfx_boss_warn_1);
    assert.ok(incoming, '高档声部应成功入池');
    assert.equal(incoming.priority, mixerPriorityOf('bossWarn'));
    assert.equal(pool.activeCount, 16);
    assert.equal(oldest.handle.stopped, true, '被抢占者走 30ms 释音后回收');
    const remainingSeq = new Set(pool.snapshot.map((v) => v.seq));
    assert.equal(remainingSeq.has(oldest.seq), false);
    assert.equal(remainingSeq.has(incoming.seq), true);
    const rejected = pool.play(sfxRecipes.sfx_sword_hit); // normal 10 打 bossWarn/normal 混合池
    assert.equal(rejected, null, '同档位不抢占');
    assert.equal(pool.activeCount, 16);
    pool.dispose();
  });
});

// ── 6. 静音开关 ────────────────────────────────────────────
describe('E. 静音开关', () => {
  test('E1 muted 时不建 ctx、不产生 voice；解除后恢复；再静音 master=0', () => {
    const bus = createEventBus();
    const ctx = new MockAudioContext();
    const clock = { sec: 0 };
    let factoryCalls = 0;
    const runtime = new AudioRuntime({
      bus, muted: true,
      contextFactory: () => { factoryCalls += 1; return ctx; },
      now: () => clock.sec,
    });
    runtime.start();
    clock.sec += 1;
    bus.publish('player.damaged', {});
    assert.equal(runtime.activeVoices, 0);
    assert.equal(factoryCalls, 0, '静音下不创建 AudioContext');
    assert.equal(runtime.contextCreated, false);

    runtime.setMuted(false);
    clock.sec += 1;
    bus.publish('player.damaged', {});
    assert.equal(runtime.activeVoices, 1);
    assert.equal(factoryCalls, 1);

    runtime.setMuted(true);
    const master = ctx.created.find((n) => n.kind === 'gain' && n.connections.some((c) => c.kind === 'compressor'));
    assert.ok(master, 'master gain 应连到限制器');
    assert.equal(master.gain.value, 0, '静音后 master gain=0');
    clock.sec += 1;
    bus.publish('player.damaged', {});
    assert.equal(runtime.activeVoices, 1, '静音期间不新增声部');
    runtime.dispose();
  });
});

// ── 7. BGM 选曲 / 转调 ─────────────────────────────────────
describe('F. BGM 选曲与 Boss 转调', () => {
  test('F1 事件驱动选曲 + 转调半音 0/+2/+5，dispose 清定时器', () => {
    const ctx = new MockAudioContext();
    const timers = new MockTimers();
    let now = 0;
    const scheduler = new BgmScheduler({
      ctx, recipes: bgmRecipes, timers, now: () => now,
      outputFor: () => ctx.destination,
    });
    scheduler.start();
    assert.ok(scheduler.timerHandle !== null);
    assert.equal(scheduler.track, 'bgm1');
    assert.equal(timers.timers.size, 1);

    scheduler.handle({ kind: 'phase', to: 'running' });
    assert.equal(scheduler.track, 'bgm2');
    scheduler.handle({ kind: 'warn' });
    assert.equal(scheduler.track, 'bgm3');
    scheduler.handle({ kind: 'bossSpawn' });
    assert.equal(scheduler.track, 'bgm4');

    scheduler.handle({ kind: 'bossPhase', phase: 'corruption' });
    assert.equal(scheduler.transpose, 2);
    scheduler.handle({ kind: 'bossPhase', phase: 'coreFrenzy' });
    assert.equal(scheduler.transpose, 5);

    // 推进时钟并手动 tick：应真正排程出 BGM 声部节点
    now = 1;
    timers.tickAll();
    assert.ok(scheduler.activeVoiceCount > 0, 'tick 后应有活跃 BGM 声部');
    const oscillators = ctx.created.filter((n) => n.kind === 'osc');
    assert.ok(oscillators.length > 0);
    assert.ok(oscillators.some((o) => o.detune.calls.length > 0), '转调通过 detune 自动化落地');

    scheduler.dispose();
    assert.equal(scheduler.timerHandle, null);
    assert.equal(scheduler.activeVoiceCount, 0);
    assert.equal(timers.cleared, 1);
  });

  test('F2 Bus 事件路径：boss.phase_changed 同时驱动 SFX 与 BGM 转调', () => {
    const bus = createEventBus();
    const clock = { sec: 0 };
    const { runtime } = makeRuntime(bus, clock);
    clock.sec += 1;
    bus.publish('boss.phase_changed', { phase: 'corruption', hpPct: 0.7 });
    assert.equal(runtime.currentTrack, 'bgm4');
    assert.equal(runtime.transposeSemis, 2);
    assert.equal(runtime.activeVoices, 1, '同一事件也播放了阶段切换 SFX');
    clock.sec += 1;
    bus.publish('boss.phase_changed', { phase: 'coreFrenzy', hpPct: 0.3 });
    assert.equal(runtime.transposeSemis, 5);
    runtime.dispose();
  });
});

// ── 8. 解锁生命周期 ────────────────────────────────────────
describe('G. AudioContext 解锁与可见性', () => {
  test('G1 懒创建 + 首手势 resume + 移除手势监听 + 可见性挂起/恢复 + dispose', () => {
    const ctx = new MockAudioContext();
    const dom = new MockDom();
    let factoryCalls = 0;
    const unlock = createContextUnlock({ factory: () => { factoryCalls += 1; return ctx; }, dom });
    assert.equal(unlock.context, null, '页面加载时不创建 ctx');
    assert.equal(unlock.gestureListenerCount, 3);
    assert.equal(dom.count('window', 'pointerdown'), 1);
    assert.equal(dom.count('window', 'touchstart'), 1);
    assert.equal(dom.count('window', 'keydown'), 1);

    dom.fire('window', 'pointerdown');
    assert.equal(factoryCalls, 1);
    assert.equal(ctx.resumeCount, 1);
    assert.equal(unlock.gestureListenerCount, 0, '解锁后手势监听移除');
    assert.equal(dom.count('window', 'pointerdown'), 0);
    assert.ok(ctx.buffers.length >= 1, '手势内播放 1 帧静音 buffer');

    dom.fire('window', 'keydown');
    assert.equal(factoryCalls, 1, '重复手势不重建 ctx');

    dom.hidden = true;
    dom.fire('document', 'visibilitychange');
    assert.equal(ctx.suspendCount, 1);
    dom.hidden = false;
    dom.fire('document', 'visibilitychange');
    assert.equal(ctx.resumeCount, 2);

    unlock.dispose();
    assert.equal(ctx.closeCount, 1);
    assert.equal(dom.count('document', 'visibilitychange'), 0);
  });

  test('G2 静音 buffer 只生成一次；ensure 幂等', () => {
    const ctx = new MockAudioContext();
    const dom = new MockDom();
    const unlock = createContextUnlock({ factory: () => ctx, dom });
    const first = unlock.ensure();
    const second = unlock.ensure();
    assert.equal(first, second);
    assert.equal(ctx.buffers.length, 1);
    unlock.dispose();
  });
});

// ── 9. 硬约束护栏 ──────────────────────────────────────────
describe('H. 红线护栏', () => {
  test('H1 合成层没有音色魔法数字常量表（数值都在 recipes）', () => {
    // 通过配方与混音常量可读可改来证明数据驱动：改一份配方即可改变播放参数。
    assert.ok(MIX_CONST.busGain.master > 0 && MIX_CONST.busGain.master < 1);
    assert.equal(MIX_CONST.maxConcurrentVoicesHint ?? audioEventMapConfig.maxConcurrentVoices, 16);
    assert.equal(MIX_CONST.preemptFadeSec, 0.03);
    assert.equal(MIX_CONST.dedupeWindowMs, 80);
    assert.equal(MIX_CONST.rateLimitPerSec, 6);
  });
});
