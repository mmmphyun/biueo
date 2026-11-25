import { mulberry32, traceOrganicRect } from '../../../shared/canvas/gouachePath';
import type { DetectedOrder } from '../../../types/contracts';
import type { Rect, ShelfLayoutGeometry } from '../layout/shelfLayout';
import { getOrderRewardTier, type OrderRewardTier } from './orderDetector';

const PASTEL_SPARKLE_COLORS = [
  '#FFF9EB',
  '#F7E5A1',
  '#F2B5BE',
  '#BFE0D2',
  '#C8D6E6',
] as const;

export interface CelebrationSparkle {
  readonly scope: 'compartment' | 'row' | 'shelf';
  /** compartment 스코프면 칸 인덱스, row 스코프면 행 인덱스, shelf 스코프면 -1 */
  readonly compartmentIndex: number;
  readonly u: number;
  readonly v: number;
  readonly radiusPx: number;
  readonly color: string;
  readonly delaySec: number;
  readonly durationSec: number;
  readonly driftPx: number;
  readonly rotationRad: number;
}

export interface OrderCelebration {
  readonly tier: OrderRewardTier;
  readonly compartmentIndices: readonly number[];
  readonly rowIndices: readonly number[];
  readonly sparkles: readonly CelebrationSparkle[];
  elapsedSec: number;
  readonly totalDurationSec: number;
}

export interface CompartmentSparklePulse {
  readonly compartmentIndex: number;
  readonly sparkles: readonly CelebrationSparkle[];
  elapsedSec: number;
  readonly totalDurationSec: number;
}

function uniqueSorted(indices: readonly number[]): number[] {
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

function pickPerimeterPoint(rand: () => number): { readonly u: number; readonly v: number } {
  const edge = Math.floor(rand() * 4);
  const t = 0.06 + rand() * 0.88;
  const inset = 0.04 + rand() * 0.06;
  if (edge === 0) return { u: t, v: inset };
  if (edge === 1) return { u: 1 - inset, v: t };
  if (edge === 2) return { u: t, v: 1 - inset };
  return { u: inset, v: t };
}

function computeRowRect(layout: ShelfLayoutGeometry, rowIdx: number): Rect | null {
  const rowComps = layout.compartments.filter((c) => c.row === rowIdx);
  if (rowComps.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of rowComps) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + c.w > maxX) maxX = c.x + c.w;
    if (c.y + c.h > maxY) maxY = c.y + c.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotationRad: number,
  color: string,
  alpha: number
): void {
  if (alpha <= 0.005 || radius <= 0.4) return;
  const inner = radius * 0.34;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotationRad);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const outerAngle = (i * Math.PI) / 2;
    const innerAngle = outerAngle + Math.PI / 4;
    const ox = Math.cos(outerAngle) * radius;
    const oy = Math.sin(outerAngle) * radius;
    const ix = Math.cos(innerAngle) * inner;
    const iy = Math.sin(innerAngle) * inner;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.quadraticCurveTo(ix * 0.72, iy * 0.72, ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 감지된 질서 목록(Tier 0-3)에 맞춰 최상위 Tier 중심으로 정제된 파스텔 웨이브·별빛 상태를 생성한다.
 */
export function createOrderCelebration(
  orders: readonly DetectedOrder[],
  reducedMotion: boolean
): OrderCelebration {
  const tier = getOrderRewardTier(orders);
  const compList: number[] = [];
  const rowList: number[] = [];

  for (const order of orders) {
    if (order.scope === 'compartment') {
      compList.push(...order.targetIndices);
    } else if (order.scope === 'row') {
      rowList.push(...order.targetIndices);
    }
  }

  const compartmentIndices = uniqueSorted(compList);
  const rowIndices = uniqueSorted(rowList);

  let totalDurationSec = 0.45;
  if (tier === 1) totalDurationSec = reducedMotion ? 0.55 : 1.05;
  else if (tier === 2) totalDurationSec = reducedMotion ? 0.60 : 1.15;
  else if (tier === 3) totalDurationSec = reducedMotion ? 0.65 : 1.45;

  const seedBase =
    7919 +
    tier * 313 +
    compartmentIndices.reduce((acc, idx) => acc + (idx + 1) * 47, 0) +
    rowIndices.reduce((acc, idx) => acc + (idx + 1) * 89, 0);
  const rand = mulberry32(seedBase);
  const sparkles: CelebrationSparkle[] = [];

  if (tier === 1) {
    const perComp = compartmentIndices.length > 6 ? 4 : 5;
    for (const compIdx of compartmentIndices) {
      for (let i = 0; i < perComp; i += 1) {
        if (sparkles.length >= 36) break;
        const pt = pickPerimeterPoint(rand);
        sparkles.push({
          scope: 'compartment',
          compartmentIndex: compIdx,
          u: pt.u,
          v: pt.v,
          radiusPx: 4.5 + rand() * 3.5,
          color: PASTEL_SPARKLE_COLORS[Math.floor(rand() * PASTEL_SPARKLE_COLORS.length)],
          delaySec: reducedMotion ? 0.04 : 0.06 + rand() * 0.24,
          durationSec: reducedMotion ? 0.45 : 0.58 + rand() * 0.18,
          driftPx: reducedMotion ? 0 : 4 + rand() * 5,
          rotationRad: rand() * Math.PI * 0.5,
        });
      }
    }
  } else if (tier === 2) {
    for (let rOrder = 0; rOrder < rowIndices.length; rOrder += 1) {
      const rowIdx = rowIndices[rOrder];
      const stagger = reducedMotion ? 0 : rOrder * 0.1;
      for (let i = 0; i < 4; i += 1) {
        if (sparkles.length >= 24) break;
        const u = 0.1 + (i / 3) * 0.8 + (rand() - 0.5) * 0.06;
        sparkles.push({
          scope: 'row',
          compartmentIndex: rowIdx,
          u: Math.min(0.95, Math.max(0.05, u)),
          v: 0.16 + rand() * 0.68,
          radiusPx: 4.5 + rand() * 3.5,
          color: PASTEL_SPARKLE_COLORS[Math.floor(rand() * PASTEL_SPARKLE_COLORS.length)],
          delaySec: reducedMotion ? 0.05 : stagger + u * 0.46,
          durationSec: reducedMotion ? 0.5 : 0.56,
          driftPx: reducedMotion ? 0 : 5 + rand() * 5,
          rotationRad: rand() * Math.PI * 0.5,
        });
      }
    }
  } else if (tier === 3) {
    for (let i = 0; i < 16; i += 1) {
      const u = 0.08 + rand() * 0.84;
      const v = 0.08 + rand() * 0.84;
      const diag = (u + v) * 0.5;
      sparkles.push({
        scope: 'shelf',
        compartmentIndex: -1,
        u,
        v,
        radiusPx: 5 + rand() * 4.5,
        color: PASTEL_SPARKLE_COLORS[i % PASTEL_SPARKLE_COLORS.length],
        delaySec: reducedMotion ? 0.05 : 0.12 + diag * 0.62,
        durationSec: reducedMotion ? 0.52 : 0.68,
        driftPx: reducedMotion ? 0 : 6 + rand() * 5,
        rotationRad: rand() * Math.PI * 0.5,
      });
    }
  }

  return {
    tier,
    compartmentIndices,
    rowIndices,
    sparkles,
    elapsedSec: 0,
    totalDurationSec,
  };
}

/**
 * 정리 중(OPEN_TIDYING) 개별 칸 질서 완성 시 해당 칸에만 재생하는 경량 파스텔 별빛 펄스를 생성한다.
 */
export function createCompartmentSparklePulse(
  compartmentIndex: number,
  reducedMotion: boolean
): CompartmentSparklePulse {
  const rand = mulberry32(9203 + compartmentIndex * 193);
  const sparkles: CelebrationSparkle[] = [];
  for (let i = 0; i < 4; i += 1) {
    const pt = pickPerimeterPoint(rand);
    sparkles.push({
      scope: 'compartment',
      compartmentIndex,
      u: pt.u,
      v: pt.v,
      radiusPx: 3.6 + rand() * 2.4,
      color: PASTEL_SPARKLE_COLORS[Math.floor(rand() * PASTEL_SPARKLE_COLORS.length)],
      delaySec: reducedMotion ? 0.02 : 0.03 + rand() * 0.14,
      durationSec: reducedMotion ? 0.36 : 0.48,
      driftPx: reducedMotion ? 0 : 3 + rand() * 3.5,
      rotationRad: rand() * Math.PI * 0.5,
    });
  }

  return {
    compartmentIndex,
    sparkles,
    elapsedSec: 0,
    totalDurationSec: reducedMotion ? 0.42 : 0.68,
  };
}

function drawSparkleList(
  ctx: CanvasRenderingContext2D,
  sparkles: readonly CelebrationSparkle[],
  elapsedSec: number,
  layout: ShelfLayoutGeometry,
  reducedMotion: boolean
): void {
  const { frameRect } = layout;
  for (const s of sparkles) {
    const localT = elapsedSec - s.delaySec;
    if (localT <= 0 || localT >= s.durationSec) continue;
    const p = localT / s.durationSec;
    const alpha = Math.sin(p * Math.PI) * 0.92;

    let rect: Rect | null = null;
    if (s.scope === 'compartment') {
      rect = layout.compartments[s.compartmentIndex] ?? null;
    } else if (s.scope === 'row') {
      rect = computeRowRect(layout, s.compartmentIndex);
    } else {
      rect = frameRect;
    }
    if (!rect) continue;

    const sx = rect.x + s.u * rect.w;
    const sy = rect.y + s.v * rect.h - p * s.driftPx;
    const scale = 0.6 + Math.sin(p * Math.PI) * 0.55;
    drawFourPointStar(
      ctx,
      sx,
      sy,
      s.radiusPx * scale,
      s.rotationRad + p * (reducedMotion ? 0 : 0.35),
      s.color,
      alpha
    );
  }
}

export function drawCompartmentSparklePulse(
  ctx: CanvasRenderingContext2D,
  pulse: CompartmentSparklePulse,
  layout: ShelfLayoutGeometry,
  reducedMotion: boolean
): void {
  if (pulse.elapsedSec < 0 || pulse.elapsedSec >= pulse.totalDurationSec) return;
  const comp = layout.compartments[pulse.compartmentIndex];
  if (comp) {
    const p = pulse.elapsedSec / pulse.totalDurationSec;
    const edgeAlpha = Math.sin(p * Math.PI) * 0.2;
    if (edgeAlpha > 0.005) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 248, 228, ${edgeAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(comp.x + 2, comp.y + 2, Math.max(4, comp.w - 4), Math.max(4, comp.h - 4), 5);
      ctx.fill();
      ctx.restore();
    }
  }
  drawSparkleList(ctx, pulse.sparkles, pulse.elapsedSec, layout, reducedMotion);
}

function drawCreamBreath(
  ctx: CanvasRenderingContext2D,
  frameRect: Rect,
  elapsedSec: number,
  peakAlpha: number
): void {
  if (elapsedSec > 0.45) return;
  const p = Math.max(0, Math.min(1, elapsedSec / 0.45));
  const alpha = Math.sin(p * Math.PI) * peakAlpha;
  if (alpha <= 0.004) return;
  ctx.save();
  ctx.fillStyle = `rgba(255, 250, 236, ${alpha.toFixed(3)})`;
  traceOrganicRect(ctx, frameRect.x, frameRect.y, frameRect.w, frameRect.h, 9, 0.4, 404);
  ctx.fill();
  ctx.restore();
}

export function drawOrderCelebration(
  ctx: CanvasRenderingContext2D,
  celebration: OrderCelebration,
  layout: ShelfLayoutGeometry,
  reducedMotion: boolean
): void {
  const { tier, elapsedSec, totalDurationSec } = celebration;
  if (elapsedSec < 0 || elapsedSec >= totalDurationSec) return;

  const { frameRect } = layout;

  if (tier === 0) {
    drawCreamBreath(ctx, frameRect, elapsedSec, 0.36);
    return;
  }

  const baseBreathPeak = tier === 1 ? 0.18 : 0.16;
  drawCreamBreath(ctx, frameRect, elapsedSec, baseBreathPeak);

  if (tier === 1) {
    const pulse = Math.sin((elapsedSec / totalDurationSec) * Math.PI);
    const edgeAlpha = pulse * 0.24;
    if (edgeAlpha > 0.005) {
      for (const compIdx of celebration.compartmentIndices) {
        const comp = layout.compartments[compIdx];
        if (!comp) continue;
        ctx.save();
        ctx.fillStyle = `rgba(255, 248, 228, ${edgeAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.roundRect(comp.x + 2, comp.y + 2, Math.max(4, comp.w - 4), Math.max(4, comp.h - 4), 5);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  if (tier === 2) {
    for (let rOrder = 0; rOrder < celebration.rowIndices.length; rOrder += 1) {
      const rowIdx = celebration.rowIndices[rOrder];
      const rowRect = computeRowRect(layout, rowIdx);
      if (!rowRect) continue;

      const stagger = reducedMotion ? 0 : rOrder * 0.1;
      const localT = elapsedSec - stagger;
      if (localT <= 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h, 6);
      ctx.clip();

      if (reducedMotion) {
        const fade = Math.sin(Math.min(1, localT / totalDurationSec) * Math.PI) * 0.24;
        ctx.fillStyle = `rgba(250, 232, 188, ${fade.toFixed(3)})`;
        ctx.fillRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h);
      } else {
        const waveProgress = Math.min(1, localT / 0.6);
        const lingerAlpha =
          localT <= 0.6
            ? Math.sin(waveProgress * Math.PI) * 0.28
            : Math.max(0, 1 - (localT - 0.6) / 0.45) * 0.12;
        if (lingerAlpha > 0.004) {
          ctx.fillStyle = `rgba(255, 248, 230, ${(lingerAlpha * 0.45).toFixed(3)})`;
          ctx.fillRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h);
        }

        if (waveProgress < 1) {
          const bandHalf = rowRect.w * 0.28;
          const sweepCenter = rowRect.x - bandHalf + (rowRect.w + bandHalf * 2) * waveProgress;
          const grad = ctx.createLinearGradient(
            sweepCenter - bandHalf,
            rowRect.y,
            sweepCenter + bandHalf,
            rowRect.y + rowRect.h * 0.25
          );
          const alpha = Math.sin(waveProgress * Math.PI) * 0.42;
          grad.addColorStop(0, 'rgba(255, 250, 236, 0)');
          grad.addColorStop(0.28, `rgba(247, 229, 161, ${(alpha * 0.85).toFixed(3)})`);
          grad.addColorStop(0.52, `rgba(242, 181, 190, ${alpha.toFixed(3)})`);
          grad.addColorStop(0.76, `rgba(191, 224, 210, ${(alpha * 0.85).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(255, 250, 236, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h);
        }
      }

      ctx.restore();
    }
  }

  if (tier === 3) {
    ctx.save();
    traceOrganicRect(ctx, frameRect.x, frameRect.y, frameRect.w, frameRect.h, 9, 0.4, 404);
    ctx.clip();

    if (reducedMotion) {
      const fade = Math.sin((elapsedSec / totalDurationSec) * Math.PI) * 0.28;
      const grad = ctx.createLinearGradient(
        frameRect.x,
        frameRect.y,
        frameRect.x + frameRect.w,
        frameRect.y + frameRect.h
      );
      grad.addColorStop(0, `rgba(247, 229, 161, ${fade.toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(242, 181, 190, ${fade.toFixed(3)})`);
      grad.addColorStop(1, `rgba(191, 224, 210, ${fade.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
    } else {
      const shimmerP = Math.min(1, elapsedSec / 1.05);
      const afterglow =
        elapsedSec <= 1.05
          ? Math.sin(shimmerP * Math.PI) * 0.14
          : Math.max(0, 1 - (elapsedSec - 1.05) / 0.4) * 0.14;
      if (afterglow > 0.004) {
        ctx.fillStyle = `rgba(255, 250, 236, ${afterglow.toFixed(3)})`;
        ctx.fillRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
      }

      if (shimmerP < 1) {
        const span = frameRect.w + frameRect.h;
        const bandHalf = span * 0.22;
        const center = -bandHalf + (span + bandHalf * 2) * shimmerP;
        const x0 = frameRect.x + center - bandHalf;
        const y0 = frameRect.y;
        const x1 = frameRect.x + center + bandHalf;
        const y1 = frameRect.y + frameRect.h;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        const peak = Math.sin(shimmerP * Math.PI) * 0.42;
        grad.addColorStop(0, 'rgba(255, 249, 235, 0)');
        grad.addColorStop(0.22, `rgba(255, 249, 235, ${(peak * 0.8).toFixed(3)})`);
        grad.addColorStop(0.4, `rgba(247, 229, 161, ${peak.toFixed(3)})`);
        grad.addColorStop(0.58, `rgba(242, 181, 190, ${peak.toFixed(3)})`);
        grad.addColorStop(0.76, `rgba(191, 224, 210, ${(peak * 0.9).toFixed(3)})`);
        grad.addColorStop(0.9, `rgba(200, 214, 230, ${(peak * 0.7).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(200, 214, 230, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
      }
    }

    ctx.restore();
  }

  drawSparkleList(ctx, celebration.sparkles, elapsedSec, layout, reducedMotion);
}
