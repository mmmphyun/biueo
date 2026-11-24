import { mulberry32 } from './gouachePath';

function hashGrid2D(ix: number, iy: number, period: number, seed: number): number {
  const wx = ((ix % period) + period) % period;
  const wy = ((iy % period) + period) % period;
  let h = Math.imul(wx + 374761393, 668265263) ^ Math.imul(wy + 1274126177, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function periodicValueNoise(nx: number, ny: number, period: number, seed: number): number {
  const fx = nx * period;
  const fy = ny * period;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = quintic(fx - ix);
  const ty = quintic(fy - iy);

  const v00 = hashGrid2D(ix, iy, period, seed);
  const v10 = hashGrid2D(ix + 1, iy, period, seed);
  const v01 = hashGrid2D(ix, iy + 1, period, seed);
  const v11 = hashGrid2D(ix + 1, iy + 1, period, seed);

  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * 주기 경계(0 <-> 1)에서 이음새 없이 연결되는 다중 옥타브 fBm 값을 [0, 1] 범위로 반환한다.
 */
export function samplePeriodicFbm(
  nx: number,
  ny: number,
  basePeriod = 16,
  seed = 1337
): number {
  const n1 = periodicValueNoise(nx, ny, basePeriod, seed);
  const n2 = periodicValueNoise(nx, ny, basePeriod * 2, seed + 101);
  const n3 = periodicValueNoise(nx, ny, basePeriod * 4, seed + 211);
  return Math.min(1, Math.max(0, n1 * 0.55 + n2 * 0.3 + n3 * 0.15));
}

export interface PaperNoiseTiles {
  readonly deskPaperTile: HTMLCanvasElement;
  readonly chalkGrainTile: HTMLCanvasElement;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return [canvas, ctx];
}

export function createPaperNoiseTiles(seed = 1337): PaperNoiseTiles {
  const deskSize = 256;
  const [deskPaperTile, deskCtx] = createCanvas(deskSize);
  const deskImg = deskCtx.createImageData(deskSize, deskSize);
  const deskData = deskImg.data;
  const randDesk = mulberry32(seed + 17);

  for (let y = 0; y < deskSize; y += 1) {
    const ny = y / deskSize;
    for (let x = 0; x < deskSize; x += 1) {
      const nx = x / deskSize;
      const fbm = samplePeriodicFbm(nx, ny, 14, seed);
      const tooth = (randDesk() - 0.5) * 0.08;
      // 과도하게 어두워지지 않도록 밝은 콜드프레스 종이 질감 대역(236-255)으로 매핑한다.
      const lum = Math.round(Math.min(255, Math.max(230, 236 + (fbm + tooth) * 20)));
      const idx = (y * deskSize + x) * 4;
      deskData[idx] = lum;
      deskData[idx + 1] = Math.max(0, lum - 1);
      deskData[idx + 2] = Math.max(0, lum - 3);
      deskData[idx + 3] = 255;
    }
  }
  deskCtx.putImageData(deskImg, 0, 0);

  // 미묘한 종이 섬유선 보강 (심리스 래핑 포함)
  deskCtx.save();
  deskCtx.strokeStyle = 'rgba(130, 122, 108, 0.08)';
  deskCtx.lineWidth = 0.8;
  for (let i = 0; i < 48; i += 1) {
    const x = randDesk() * deskSize;
    const y = randDesk() * deskSize;
    const angle = (randDesk() - 0.5) * 0.9;
    const len = 8 + randDesk() * 14;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    for (const ox of [-deskSize, 0, deskSize]) {
      for (const oy of [-deskSize, 0, deskSize]) {
        deskCtx.beginPath();
        deskCtx.moveTo(x + ox, y + oy);
        deskCtx.lineTo(x + ox + dx, y + oy + dy);
        deskCtx.stroke();
      }
    }
  }
  deskCtx.restore();

  const chalkSize = 128;
  const [chalkGrainTile, chalkCtx] = createCanvas(chalkSize);
  const chalkImg = chalkCtx.createImageData(chalkSize, chalkSize);
  const chalkData = chalkImg.data;
  const randChalk = mulberry32(seed + 7919);

  for (let y = 0; y < chalkSize; y += 1) {
    const ny = y / chalkSize;
    for (let x = 0; x < chalkSize; x += 1) {
      const nx = x / chalkSize;
      const fbm = samplePeriodicFbm(nx, ny, 24, seed + 503);
      const stipple = randChalk() < 0.24 ? -0.22 : (randChalk() - 0.5) * 0.14;
      const lum = Math.round(Math.min(255, Math.max(185, 212 + (fbm + stipple) * 46)));
      const idx = (y * chalkSize + x) * 4;
      chalkData[idx] = lum;
      chalkData[idx + 1] = lum;
      chalkData[idx + 2] = Math.max(0, lum - 2);
      chalkData[idx + 3] = 255;
    }
  }
  chalkCtx.putImageData(chalkImg, 0, 0);

  return { deskPaperTile, chalkGrainTile };
}
