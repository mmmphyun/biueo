export interface AccelerationSample {
  readonly x: number | null;
  readonly y: number | null;
  readonly z: number | null;
}

export interface MotionShakeHit {
  readonly intensity: number;
  readonly dirSign: -1 | 1;
}

export interface MotionShakeDetector {
  sample(
    acceleration: AccelerationSample | null | undefined,
    accelerationIncludingGravity: AccelerationSample | null | undefined,
    nowMs: number
  ): MotionShakeHit | null;
  reset(): void;
}

const SHAKE_THRESHOLD_MPS2 = 9.5;
const SHAKE_COOLDOWN_MS = 150;
const GRAVITY_MPS2 = 9.81;

function hasNumericAxes(acc: AccelerationSample | null | undefined): acc is AccelerationSample {
  return (
    acc !== null &&
    acc !== undefined &&
    (typeof acc.x === 'number' || typeof acc.y === 'number' || typeof acc.z === 'number')
  );
}

/**
 * 스마트폰 DeviceMotionEvent의 null-필드 함정({ x: null })과 중력가속도를 보정해
 * 손목 흔들기 임펄스만 안정적으로 추출한다.
 */
export function createMotionShakeDetector(): MotionShakeDetector {
  let prevGravitySample: { x: number; y: number; z: number } | null = null;
  let lastTriggerMs = -1000;

  const reset = () => {
    prevGravitySample = null;
    lastTriggerMs = -1000;
  };

  const sample = (
    acceleration: AccelerationSample | null | undefined,
    accelerationIncludingGravity: AccelerationSample | null | undefined,
    nowMs: number
  ): MotionShakeHit | null => {
    let mag = 0;
    let axisX = 0;

    if (hasNumericAxes(acceleration)) {
      const ax = acceleration.x ?? 0;
      const ay = acceleration.y ?? 0;
      const az = acceleration.z ?? 0;
      mag = Math.hypot(ax, ay, az);
      axisX = ax;
      prevGravitySample = null;
    } else if (hasNumericAxes(accelerationIncludingGravity)) {
      const gx = accelerationIncludingGravity.x ?? 0;
      const gy = accelerationIncludingGravity.y ?? 0;
      const gz = accelerationIncludingGravity.z ?? 0;
      const rawMag = Math.hypot(gx, gy, gz);
      const gravityDiff = Math.abs(rawMag - GRAVITY_MPS2);

      if (prevGravitySample) {
        const dx = gx - prevGravitySample.x;
        const dy = gy - prevGravitySample.y;
        const dz = gz - prevGravitySample.z;
        const deltaMag = Math.hypot(dx, dy, dz);
        mag = Math.max(deltaMag * 0.72, gravityDiff);
        axisX = dx;
      } else {
        mag = gravityDiff;
        axisX = gx;
      }

      prevGravitySample = { x: gx, y: gy, z: gz };
    } else {
      return null;
    }

    if (mag < SHAKE_THRESHOLD_MPS2) return null;
    if (nowMs - lastTriggerMs < SHAKE_COOLDOWN_MS) return null;

    lastTriggerMs = nowMs;
    const intensity = Math.min(1, Math.max(0.4, (mag - 6) / 14));
    const dirSign: -1 | 1 = axisX >= 0 ? 1 : -1;
    return { intensity, dirSign };
  };

  return { sample, reset };
}
