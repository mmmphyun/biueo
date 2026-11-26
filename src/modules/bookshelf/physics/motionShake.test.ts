import { describe, expect, it } from 'vitest';
import { createMotionShakeDetector } from './motionShake';

describe('createMotionShakeDetector', () => {
  it('triggers on linear acceleration >= 9.5 m/s² and enforces 150ms cooldown', () => {
    const detector = createMotionShakeDetector();

    expect(detector.sample({ x: 3, y: 2, z: 1 }, null, 100)).toBeNull();

    const first = detector.sample({ x: 11, y: 2, z: 0 }, null, 200);
    expect(first).not.toBeNull();
    expect(first?.dirSign).toBe(1);
    expect(first?.intensity).toBeGreaterThanOrEqual(0.4);

    // 150ms 쿨다운 내 재트리거 차단
    expect(detector.sample({ x: -12, y: 0, z: 0 }, null, 300)).toBeNull();

    const second = detector.sample({ x: -14, y: 0, z: 0 }, null, 360);
    expect(second).not.toBeNull();
    expect(second?.dirSign).toBe(-1);
  });

  it('falls back to accelerationIncludingGravity delta when acceleration has null axes', () => {
    const detector = createMotionShakeDetector();
    const nullLinear = { x: null, y: null, z: null };

    // 정지 또는 완만한 기울기(중력 ~9.81)에서는 오작동하지 않는다.
    expect(detector.sample(nullLinear, { x: 0, y: 9.81, z: 0 }, 100)).toBeNull();
    expect(detector.sample(nullLinear, { x: 2.1, y: 9.58, z: 0 }, 150)).toBeNull();

    // 급격한 좌우 가속 차분에는 즉시 반응한다.
    const hit = detector.sample(nullLinear, { x: -13.5, y: 9.8, z: 1.5 }, 260);
    expect(hit).not.toBeNull();
    expect(hit?.dirSign).toBe(-1);
  });
});
