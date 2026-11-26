import type { BookThicknessTier } from '../../../types/contracts';
import type { OrderRewardTier } from '../order/orderDetector';

export const AUDIO_ENABLED_STORAGE_KEY = 'biueo:audio-enabled';

const MASTER_GAIN_LEVEL = 0.85;
const COLLISION_AUDIO_COOLDOWN_MS = 32;
const COLLISION_HAPTIC_COOLDOWN_MS = 85;
const SHAKE_RATTLE_COOLDOWN_MS = 105;

export function readAudioEnabledPreference(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveAudioEnabledPreference(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(AUDIO_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // 프라이빗 모드 등 저장소 차단 환경에서는 무음 폴백한다.
  }
}

/**
 * Android 등 지원 기기에서만 점진적 진동을 실행한다.
 * iOS Safari 등 미지원 환경에서는 예외 없이 false를 반환한다.
 */
export function triggerHaptic(
  pattern: number | readonly number[],
  enabled: boolean
): boolean {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return Boolean(navigator.vibrate(pattern as number | number[]));
  } catch {
    return false;
  }
}

export interface FoleySynth {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  pause(): void;
  resume(): void;
  playCollision(impactSpeed: number): void;
  playShakeRattle(intensity?: number): void;
  playBookPickup(): void;
  playBookSnap(thicknessTier?: BookThicknessTier): void;
  playCompartmentOrderChime(): void;
  playDoorLatch(isOpening: boolean): void;
  playPageFlip(): void;
  playOrderReward(tier: OrderRewardTier): void;
  dispose(): void;
}

export interface FoleySynthOptions {
  readonly createContext?: () => AudioContext | null;
  readonly nowMs?: () => number;
}

function defaultCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function defaultNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * 외부 오디오 파일 없이 Web Audio API로 어쿠스틱 우드·종이·황동 폴리 및 펠트 화음을 합성한다.
 */
export function createFoleySynth(options: FoleySynthOptions = {}): FoleySynth {
  const createCtx = options.createContext ?? defaultCreateAudioContext;
  const nowMs = options.nowMs ?? defaultNowMs;

  let enabled = true;
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let lastCollisionAudioMs = -1000;
  let lastCollisionHapticMs = -1000;
  let lastShakeRattleMs = -1000;
  let voiceSeq = 0;

  const buildNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    const length = Math.max(1, Math.floor(audioCtx.sampleRate));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // 결정론적 노이즈 버퍼를 컨텍스트당 1회 생성해 충돌 다발 시 할당 부하를 차단한다.
    let state = 0x51a7f319;
    for (let i = 0; i < length; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = (state / 4294967296) * 2 - 1;
    }
    return buffer;
  };

  const ensureContext = (): AudioContext | null => {
    if (!enabled) return null;
    if (!ctx) {
      const created = createCtx();
      if (!created) return null;
      ctx = created;
      const compressor = created.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, created.currentTime);
      compressor.ratio.setValueAtTime(4, created.currentTime);

      const gain = created.createGain();
      gain.gain.setValueAtTime(enabled ? MASTER_GAIN_LEVEL : 0, created.currentTime);
      gain.connect(compressor);
      compressor.connect(created.destination);

      masterGain = gain;
      noiseBuffer = buildNoiseBuffer(created);
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  };

  const nextUnitRandom = (): number => {
    voiceSeq = (voiceSeq + 1) % 997;
    return ((Math.imul(voiceSeq + 17, 2654435761) >>> 0) % 1000) / 1000;
  };

  const playNoiseBurst = (
    audioCtx: AudioContext,
    startTime: number,
    durationSec: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    peakGain: number
  ): void => {
    if (!masterGain || !noiseBuffer) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const maxOffset = Math.max(0, noiseBuffer.duration - durationSec - 0.02);
    const offset = nextUnitRandom() * maxOffset;

    const filter = audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, startTime);
    filter.frequency.setValueAtTime(Math.max(40, freqStart), startTime);
    if (freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        startTime + durationSec
      );
    }

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.008, durationSec * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0005, startTime + durationSec);

    src.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    src.start(startTime, offset, durationSec + 0.01);
    src.stop(startTime + durationSec + 0.015);
  };

  const playWarmTone = (
    audioCtx: AudioContext,
    startTime: number,
    freqHz: number,
    peakGain: number,
    decaySec: number
  ): void => {
    if (!masterGain) return;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, startTime);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + decaySec);

    const oscFund = audioCtx.createOscillator();
    oscFund.type = 'sine';
    oscFund.frequency.setValueAtTime(freqHz, startTime);

    const oscHarm = audioCtx.createOscillator();
    oscHarm.type = 'triangle';
    oscHarm.frequency.setValueAtTime(freqHz * 2, startTime);

    const harmGain = audioCtx.createGain();
    harmGain.gain.setValueAtTime(0.16, startTime);

    oscFund.connect(filter);
    oscHarm.connect(harmGain);
    harmGain.connect(filter);
    filter.connect(env);
    env.connect(masterGain);

    const stopAt = startTime + decaySec + 0.03;
    oscFund.start(startTime);
    oscFund.stop(stopAt);
    oscHarm.start(startTime);
    oscHarm.stop(stopAt);
  };

  const unlock = (): void => {
    ensureContext();
  };

  const setEnabled = (nextEnabled: boolean): void => {
    enabled = nextEnabled;
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(
        nextEnabled ? MASTER_GAIN_LEVEL : 0,
        ctx.currentTime,
        0.015
      );
    }
  };

  const isEnabled = (): boolean => enabled;

  const pause = (): void => {
    if (ctx && ctx.state === 'running') {
      void ctx.suspend().catch(() => {});
    }
  };

  const resume = (): void => {
    if (ctx && enabled && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  };

  const playCollision = (impactSpeed: number): void => {
    if (!enabled || impactSpeed <= 1.2) return;
    const now = nowMs();

    if (impactSpeed >= 2.6 && now - lastCollisionHapticMs >= COLLISION_HAPTIC_COOLDOWN_MS) {
      lastCollisionHapticMs = now;
      const pulseMs = Math.min(28, Math.max(16, Math.round(12 + impactSpeed * 1.6)));
      triggerHaptic(pulseMs, true);
    }

    if (now - lastCollisionAudioMs < COLLISION_AUDIO_COOLDOWN_MS) return;
    lastCollisionAudioMs = now;

    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain) return;

    const t0 = audioCtx.currentTime;
    const norm = Math.min(1, (impactSpeed - 1.2) / 14);
    const pitchBase = 180 + nextUnitRandom() * 150;

    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchBase, t0);
    osc.frequency.exponentialRampToValueAtTime(pitchBase * 0.55, t0 + 0.05);

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t0);

    const env = audioCtx.createGain();
    const woodPeak = 0.04 + norm * 0.14;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(woodPeak, t0 + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.065);

    osc.connect(lp);
    lp.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.075);

    const frictionFreq = 1600 + nextUnitRandom() * 1400;
    playNoiseBurst(
      audioCtx,
      t0,
      0.045,
      'bandpass',
      frictionFreq,
      frictionFreq * 0.85,
      1.6,
      0.03 + norm * 0.08
    );
  };

  const playShakeRattle = (intensity = 0.7): void => {
    if (!enabled) return;
    const now = nowMs();
    if (now - lastShakeRattleMs < SHAKE_RATTLE_COOLDOWN_MS) return;
    lastShakeRattleMs = now;

    const clamped = Math.max(0.2, Math.min(1, intensity));
    if (clamped >= 0.35) {
      triggerHaptic(clamped >= 0.75 ? [20, 25, 16] : 22, true);
    }

    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain) return;

    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    const startHz = 105 + nextUnitRandom() * 25;
    osc.frequency.setValueAtTime(startHz, t0);
    osc.frequency.exponentialRampToValueAtTime(62, t0 + 0.085);

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(480, t0);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.05 + clamped * 0.09, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.085);

    osc.connect(lp);
    lp.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.095);

    playNoiseBurst(audioCtx, t0, 0.075, 'bandpass', 900, 680, 1.3, 0.03 + clamped * 0.05);
  };

  const playBookPickup = (): void => {
    if (!enabled) return;
    triggerHaptic(16, true);
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain) return;

    const t0 = audioCtx.currentTime;
    playNoiseBurst(audioCtx, t0, 0.045, 'bandpass', 2200, 2600, 1.4, 0.08);

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(410, t0);
    osc.frequency.exponentialRampToValueAtTime(540, t0 + 0.028);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.025, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.032);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.04);
  };

  const playBookSnap = (thicknessTier: BookThicknessTier = 1): void => {
    if (!enabled) return;
    const snapMs = thicknessTier === 0 ? 18 : thicknessTier === 2 ? 30 : 24;
    triggerHaptic(snapMs, true);

    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain) return;

    const t0 = audioCtx.currentTime;
    const baseHz = thicknessTier === 0 ? 196 : thicknessTier === 2 ? 138 : 164;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(850, t0);

    const oscMain = audioCtx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(baseHz, t0);
    oscMain.frequency.exponentialRampToValueAtTime(baseHz * 0.55, t0 + 0.055);

    const oscSub = audioCtx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(baseHz * 0.5, t0);

    const subGain = audioCtx.createGain();
    subGain.gain.setValueAtTime(0.55, t0);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.22, t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.085);

    oscMain.connect(lp);
    oscSub.connect(subGain);
    subGain.connect(lp);
    lp.connect(env);
    env.connect(masterGain);

    oscMain.start(t0);
    oscMain.stop(t0 + 0.095);
    oscSub.start(t0);
    oscSub.stop(t0 + 0.095);

    playNoiseBurst(audioCtx, t0, 0.022, 'bandpass', 1150, 920, 1.8, 0.08);
  };

  const playCompartmentOrderChime = (): void => {
    if (!enabled) return;
    triggerHaptic([18, 40, 22], true);

    const audioCtx = ensureContext();
    if (!audioCtx) return;

    // 자석 탭 소리 직후 겹치지 않도록 45ms 뒤 단일 펠트 음(C5)을 울린다.
    playWarmTone(audioCtx, audioCtx.currentTime + 0.045, 523.25, 0.085, 0.58);
  };

  const playDoorLatch = (isOpening: boolean): void => {
    if (!enabled) return;
    triggerHaptic(isOpening ? [18, 30, 22] : 28, true);

    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain) return;

    const t0 = audioCtx.currentTime;

    playNoiseBurst(audioCtx, t0, 0.015, 'bandpass', 3100, 2600, 2.4, 0.11);

    const brassPartials: readonly [number, number][] = [
      [1480, 0.06],
      [2210, 0.03],
    ];
    for (const [freq, peak] of brassPartials) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);

      const env = audioCtx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.034);

      osc.connect(env);
      env.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.042);
    }

    const tSwing = t0 + 0.045;
    if (isOpening) {
      playNoiseBurst(audioCtx, tSwing, 0.09, 'bandpass', 340, 520, 1.4, 0.085);
    } else {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(145, tSwing);
      osc.frequency.exponentialRampToValueAtTime(82, tSwing + 0.068);

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(620, tSwing);

      const env = audioCtx.createGain();
      env.gain.setValueAtTime(0.0001, tSwing);
      env.gain.linearRampToValueAtTime(0.18, tSwing + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0006, tSwing + 0.072);

      osc.connect(lp);
      lp.connect(env);
      env.connect(masterGain);
      osc.start(tSwing);
      osc.stop(tSwing + 0.085);
    }
  };

  const playPageFlip = (): void => {
    if (!enabled) return;
    triggerHaptic(14, true);
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || !noiseBuffer) return;

    const t0 = audioCtx.currentTime;
    const duration = 0.115;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(1.4, t0);
    filter.frequency.setValueAtTime(1500, t0);
    filter.frequency.exponentialRampToValueAtTime(3200, t0 + duration * 0.45);
    filter.frequency.exponentialRampToValueAtTime(1700, t0 + duration);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.11, t0 + duration * 0.42);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    src.start(t0, nextUnitRandom() * 0.5, duration + 0.01);
    src.stop(t0 + duration + 0.015);
  };

  const playOrderReward = (tier: OrderRewardTier): void => {
    if (!enabled || tier === 0) return;

    if (tier === 1) {
      triggerHaptic([20, 45, 26], true);
    } else if (tier === 2) {
      triggerHaptic([18, 40, 24, 40, 30], true);
    } else {
      triggerHaptic([20, 35, 26, 35, 32, 45, 42], true);
    }

    const audioCtx = ensureContext();
    if (!audioCtx) return;

    const t0 = audioCtx.currentTime + 0.06;
    if (tier === 1) {
      const notes = [349.23, 523.25];
      notes.forEach((freq, idx) => {
        playWarmTone(audioCtx, t0 + idx * 0.095, freq, 0.11, 1.1);
      });
    } else if (tier === 2) {
      const notes = [349.23, 440.0, 523.25];
      notes.forEach((freq, idx) => {
        playWarmTone(audioCtx, t0 + idx * 0.105, freq, 0.105, 1.45);
      });
    } else {
      const notes = [174.61, 261.63, 329.63, 392.0, 440.0, 523.25];
      notes.forEach((freq, idx) => {
        playWarmTone(audioCtx, t0 + idx * 0.065, freq, 0.085, 2.1);
      });
    }
  };

  const dispose = (): void => {
    if (ctx) {
      void ctx.close().catch(() => {});
    }
    ctx = null;
    masterGain = null;
    noiseBuffer = null;
  };

  return {
    unlock,
    setEnabled,
    isEnabled,
    pause,
    resume,
    playCollision,
    playShakeRattle,
    playBookPickup,
    playBookSnap,
    playCompartmentOrderChime,
    playDoorLatch,
    playPageFlip,
    playOrderReward,
    dispose,
  };
}
