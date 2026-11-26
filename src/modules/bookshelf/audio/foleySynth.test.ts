import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFoleySynth, triggerHaptic } from './foleySynth';

function createMockAudioParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function createMockAudioContext() {
  const oscillators: { stop: ReturnType<typeof vi.fn> }[] = [];
  const bufferSources: { stop: ReturnType<typeof vi.fn> }[] = [];
  const masterGainCalls: { setTargetAtTime: ReturnType<typeof vi.fn> }[] = [];

  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: createMockAudioParam(-14),
      ratio: createMockAudioParam(4),
      connect: vi.fn(),
    })),
    createGain: vi.fn(() => {
      const gainParam = createMockAudioParam(1);
      masterGainCalls.push(gainParam);
      return {
        gain: gainParam,
        connect: vi.fn(),
      };
    }),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: createMockAudioParam(1000),
      Q: createMockAudioParam(1),
      connect: vi.fn(),
    })),
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: createMockAudioParam(440),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createBufferSource: vi.fn(() => {
      const src = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(src);
      return src;
    }),
  };

  return { ctx: ctx as unknown as AudioContext, raw: ctx, oscillators, bufferSources, masterGainCalls };
}

describe('foleySynth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('safely no-ops in headless Node environments without AudioContext or navigator.vibrate', () => {
    const synth = createFoleySynth();
    expect(() => {
      synth.unlock();
      synth.playCollision(6);
      synth.playShakeRattle(0.8);
      synth.playBookPickup();
      synth.playBookSnap(2);
      synth.playCompartmentOrderChime();
      synth.playDoorLatch(true);
      synth.playDoorLatch(false);
      synth.playPageFlip();
      synth.playOrderReward(0);
      synth.playOrderReward(1);
      synth.playOrderReward(2);
      synth.playOrderReward(3);
      synth.pause();
      synth.resume();
      synth.dispose();
    }).not.toThrow();

    expect(triggerHaptic(12, true)).toBe(false);
  });

  it('lazily creates AudioContext and suppresses voices and haptics when muted', () => {
    const mock = createMockAudioContext();
    const createContext = vi.fn(() => mock.ctx);
    const vibrateMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    const synth = createFoleySynth({ createContext, nowMs: () => 100 });
    expect(createContext).not.toHaveBeenCalled();

    synth.setEnabled(false);
    synth.unlock();
    synth.playBookSnap(1);
    synth.playOrderReward(3);
    expect(createContext).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();

    synth.setEnabled(true);
    synth.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);

    synth.setEnabled(false);
    const oscBeforeMute = mock.oscillators.length;
    synth.playBookSnap(0);
    synth.playDoorLatch(false);
    expect(mock.oscillators.length).toBe(oscBeforeMute);
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('throttles rapid collision bursts and allows subsequent impacts after cooldown', () => {
    const mock = createMockAudioContext();
    let clockMs = 100;
    const synth = createFoleySynth({
      createContext: () => mock.ctx,
      nowMs: () => clockMs,
    });

    for (let i = 0; i < 10; i += 1) {
      clockMs += 1;
      synth.playCollision(5.5);
    }
    expect(mock.oscillators.length).toBe(1);
    expect(mock.bufferSources.length).toBe(1);

    clockMs += 40;
    synth.playCollision(5.5);
    expect(mock.oscillators.length).toBe(2);
    expect(mock.bufferSources.length).toBe(2);
  });

  it('scales oscillators and progressive Android haptics across Tier 0-3 and handles missing vibrate (iOS Safari)', () => {
    const mock = createMockAudioContext();
    const vibrateMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    const synth = createFoleySynth({
      createContext: () => mock.ctx,
      nowMs: () => 200,
    });

    synth.playOrderReward(0);
    expect(mock.oscillators.length).toBe(0);
    expect(vibrateMock).not.toHaveBeenCalled();

    synth.playOrderReward(1);
    expect(mock.oscillators.length).toBe(4);
    expect(vibrateMock).toHaveBeenLastCalledWith([20, 45, 26]);

    synth.playOrderReward(2);
    expect(mock.oscillators.length).toBe(10);
    expect(vibrateMock).toHaveBeenLastCalledWith([18, 40, 24, 40, 30]);

    synth.playOrderReward(3);
    expect(mock.oscillators.length).toBe(22);
    expect(vibrateMock).toHaveBeenLastCalledWith([20, 35, 26, 35, 32, 45, 42]);

    synth.playBookPickup();
    expect(vibrateMock).toHaveBeenLastCalledWith(16);
    synth.playBookSnap(2);
    expect(vibrateMock).toHaveBeenLastCalledWith(30);

    vi.stubGlobal('navigator', {});
    expect(() => synth.playOrderReward(2)).not.toThrow();
    expect(triggerHaptic([10, 20], true)).toBe(false);
  });

  it('plays single warm felt chime with light haptic for live compartment orders and blocks when muted', () => {
    const mock = createMockAudioContext();
    const vibrateMock = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    const synth = createFoleySynth({
      createContext: () => mock.ctx,
      nowMs: () => 300,
    });

    synth.playCompartmentOrderChime();
    expect(mock.oscillators.length).toBe(2);
    expect(vibrateMock).toHaveBeenLastCalledWith([18, 40, 22]);

    synth.setEnabled(false);
    vibrateMock.mockClear();
    synth.playCompartmentOrderChime();
    expect(mock.oscillators.length).toBe(2);
    expect(vibrateMock).not.toHaveBeenCalled();
  });
});
