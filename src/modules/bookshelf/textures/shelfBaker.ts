import { SHELF_WOOD_COLORS } from '../data/bookPalette';
import type { VisualTuningParams } from '../../../types/contracts';
import type { ShelfLayoutGeometry } from '../layout/shelfLayout';
import { fillGouacheShape, mulberry32, traceOrganicRect } from '../../../shared/canvas/gouachePath';

export interface BakedShelfSprites {
  readonly shelfBodyCanvas: HTMLCanvasElement;
  readonly glassDoorClosedCanvas: HTMLCanvasElement;
  readonly padPx: number;
  readonly logicalW: number;
  readonly logicalH: number;
}

function drawWoodGrainStrokes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number
): void {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 42; i += 1) {
    const sy = y + rand() * h;
    const sx = x + rand() * w;
    const len = 18 + rand() * 54;
    const horizontal = rand() > 0.35;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(176, 146, 108, 0.14)' : 'rgba(252, 244, 232, 0.18)';
    ctx.lineWidth = 1 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    if (horizontal) {
      ctx.quadraticCurveTo(sx + len * 0.5, sy + (rand() - 0.5) * 3, sx + len, sy);
    } else {
      ctx.quadraticCurveTo(sx + (rand() - 0.5) * 3, sy + len * 0.5, sx, sy + len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawCompartmentCornerStipple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  depthTop: number,
  depthLeft: number,
  seed: number
): void {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = 'rgba(155, 134, 106, 0.24)';

  // 좌상단·우상단 오목 모서리에 드라이 초크 점묘 음영을 흩뿌려 입체감을 살린다.
  const dotCount = 26;
  for (let i = 0; i < dotCount; i += 1) {
    const t = rand();
    const isLeftCluster = i < 16;
    const px = isLeftCluster
      ? cx + 2 + rand() * (depthLeft * 1.6)
      : cx + cw - 2 - rand() * (cw * 0.24);
    const py = isLeftCluster
      ? cy + 2 + t * (ch * 0.32)
      : cy + 2 + rand() * (depthTop * 1.45);
    const r = 0.7 + rand() * 1.1;
    ctx.globalAlpha = 0.18 + (1 - t) * 0.35;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrassHinge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(122, 95, 42, 0.25)';
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w, h, 3);
  ctx.fill();

  ctx.fillStyle = SHELF_WOOD_COLORS.brass;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();

  ctx.fillStyle = SHELF_WOOD_COLORS.brassShadow;
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1, Math.max(4, w * 0.42), h + 2, 2.5);
  ctx.fill();

  ctx.fillStyle = '#F7F0E2';
  for (const py of [y + h * 0.25, y + h * 0.75]) {
    ctx.beginPath();
    ctx.arc(x + w * 0.68, py, Math.max(1.2, w * 0.11), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function bakeShelfSprites(
  layout: ShelfLayoutGeometry,
  dpr: number,
  tuning: VisualTuningParams,
  chalkTile: HTMLCanvasElement
): BakedShelfSprites {
  const padPx = 8;
  const {
    frameRect,
    compartments,
    baseApronHeightPx,
    innerRect,
    frameBorderPx,
    dividerPx,
    renderCols,
  } = layout;
  const logicalW = Math.ceil(frameRect.w + padPx * 2);
  const logicalH = Math.ceil(frameRect.h + padPx * 2);

  // 1. 자작나무 원목 책장 본체 (3x3 또는 5x3 / 모바일 3x5 가변 격자)
  const shelfBodyCanvas = document.createElement('canvas');
  shelfBodyCanvas.width = Math.max(1, Math.ceil(logicalW * dpr));
  shelfBodyCanvas.height = Math.max(1, Math.ceil(logicalH * dpr));
  const ctx = shelfBodyCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable for shelfBaker');
  }
  ctx.scale(dpr, dpr);

  const fx = padPx;
  const fy = padPx;
  const fw = frameRect.w;
  const fh = frameRect.h;

  const traceOuter = () =>
    traceOrganicRect(ctx, fx, fy, fw, fh, 9, tuning.edgeJitterPx * 1.05, 404);

  fillGouacheShape(ctx, traceOuter, SHELF_WOOD_COLORS.frame, 0.14);

  ctx.save();
  traceOuter();
  ctx.clip();

  ctx.fillStyle = SHELF_WOOD_COLORS.frameHighlight;
  ctx.fillRect(fx, fy, fw, Math.max(4, frameBorderPx * 0.22));
  ctx.fillRect(fx, fy, Math.max(4, frameBorderPx * 0.22), fh);

  ctx.fillStyle = SHELF_WOOD_COLORS.frameShadow;
  ctx.fillRect(fx, fy + fh - Math.max(4, frameBorderPx * 0.24), fw, frameBorderPx * 0.26);
  ctx.fillRect(fx + fw - Math.max(4, frameBorderPx * 0.24), fy, frameBorderPx * 0.26, fh);

  drawWoodGrainStrokes(ctx, fx, fy, fw, fh, 8821);

  // 하단 장식 베이스 에이프런 (렌더 열 수에 맞춰 3개 또는 5개 패널)
  const apronY = fy + (innerRect.y - frameRect.y) + innerRect.h + dividerPx * 0.6;
  const apronX = fx + frameBorderPx;
  const apronW = innerRect.w;
  const panelGap = Math.max(5, dividerPx * 0.7);
  const panelW = (apronW - panelGap * (renderCols - 1)) / renderCols;
  for (let col = 0; col < renderCols; col += 1) {
    const px = apronX + col * (panelW + panelGap);
    ctx.fillStyle = 'rgba(186, 158, 122, 0.28)';
    ctx.beginPath();
    ctx.roundRect(px, apronY + 1, panelW, Math.max(8, baseApronHeightPx - 3), 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(250, 243, 232, 0.42)';
    ctx.fillRect(px + 2, apronY + Math.max(8, baseApronHeightPx - 3), panelW - 4, 1.5);
  }

  // 각 칸 내부 오목 음영 + 점묘 디테일
  for (const comp of compartments) {
    const cx = comp.x - frameRect.x + fx;
    const cy = comp.y - frameRect.y + fy;
    const cw = comp.w;
    const ch = comp.h;

    const traceCell = () =>
      traceOrganicRect(ctx, cx, cy, cw, ch, 3.5, tuning.edgeJitterPx * 0.55, 700 + comp.index * 19);
    ctx.fillStyle = SHELF_WOOD_COLORS.cellFloor;
    traceCell();
    ctx.fill();

    ctx.save();
    traceCell();
    ctx.clip();

    const depthTop = Math.max(6, ch * 0.095);
    const depthLeft = Math.max(5, cw * 0.075);
    ctx.fillStyle = SHELF_WOOD_COLORS.innerWall;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + cw, cy);
    ctx.lineTo(cx + cw, cy + depthTop);
    ctx.lineTo(cx + depthLeft, cy + depthTop);
    ctx.lineTo(cx + depthLeft, cy + ch);
    ctx.lineTo(cx, cy + ch);
    ctx.closePath();
    ctx.fill();

    drawCompartmentCornerStipple(
      ctx,
      cx,
      cy,
      cw,
      ch,
      depthTop,
      depthLeft,
      1400 + comp.index * 31
    );

    ctx.fillStyle = SHELF_WOOD_COLORS.shelfLip;
    ctx.fillRect(cx, cy + ch - 2, cw, 2.5);
    ctx.restore();
  }

  if (tuning.grainStrength > 0.01) {
    const pattern = ctx.createPattern(chalkTile, 'repeat');
    if (pattern) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(0.55, tuning.grainStrength * 0.44);
      ctx.fillStyle = pattern;
      ctx.fillRect(fx, fy, fw, fh);
    }
  }
  ctx.restore();

  const hingeW = Math.max(7, frameBorderPx * 0.46);
  const hingeH = Math.max(18, fh * 0.068);
  const hingeX = fx - hingeW * 0.2;
  drawBrassHinge(ctx, hingeX, fy + fh * 0.21, hingeW, hingeH);
  drawBrassHinge(ctx, hingeX, fy + fh * 0.72, hingeW, hingeH);

  // 2. 전면 유리문
  const glassDoorClosedCanvas = document.createElement('canvas');
  glassDoorClosedCanvas.width = shelfBodyCanvas.width;
  glassDoorClosedCanvas.height = shelfBodyCanvas.height;
  const gctx = glassDoorClosedCanvas.getContext('2d');
  if (!gctx) {
    throw new Error('2D canvas context unavailable for glass door');
  }
  gctx.scale(dpr, dpr);

  const glassInset = frameBorderPx * 0.68;
  const gx = fx + glassInset;
  const gy = fy + glassInset;
  const gw = fw - glassInset * 2;
  const gh = fh - glassInset * 2;

  const traceGlass = () =>
    traceOrganicRect(gctx, gx, gy, gw, gh, 6, tuning.edgeJitterPx * 0.45, 919);

  gctx.save();
  traceGlass();
  gctx.clip();

  gctx.fillStyle = 'rgba(228, 241, 248, 0.17)';
  gctx.fillRect(gx, gy, gw, gh);

  gctx.save();
  gctx.translate(gx + gw * 0.5, gy + gh * 0.5);
  gctx.rotate(-0.56);
  const diagLen = Math.hypot(gw, gh) * 1.4;
  gctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  gctx.fillRect(-gw * 0.22, -diagLen * 0.5, Math.max(14, gw * 0.085), diagLen);
  gctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  gctx.fillRect(-gw * 0.22 + gw * 0.12, -diagLen * 0.5, Math.max(6, gw * 0.032), diagLen);
  gctx.fillStyle = 'rgba(255, 255, 255, 0.17)';
  gctx.fillRect(gw * 0.14, -diagLen * 0.5, Math.max(18, gw * 0.11), diagLen);
  gctx.restore();
  gctx.restore();

  gctx.save();
  gctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
  gctx.lineWidth = 1.8;
  traceGlass();
  gctx.stroke();
  gctx.restore();

  return {
    shelfBodyCanvas,
    glassDoorClosedCanvas,
    padPx,
    logicalW,
    logicalH,
  };
}

export function drawOpenGlassDoorEdge(
  ctx: CanvasRenderingContext2D,
  layout: ShelfLayoutGeometry
): void {
  const { frameRect, frameBorderPx } = layout;
  const edgeW = Math.max(10, Math.min(18, frameRect.w * 0.028));
  const topY = frameRect.y + frameBorderPx * 0.68;
  const edgeH = frameRect.h - frameBorderPx * 1.36;
  const edgeX = frameRect.x - edgeW * 0.72;

  ctx.save();
  ctx.fillStyle = 'rgba(222, 238, 246, 0.34)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(edgeX, topY, edgeW, edgeH, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.fillRect(edgeX + edgeW * 0.26, topY + 6, Math.max(2, edgeW * 0.22), edgeH - 12);
  ctx.restore();
}

export function drawBrassLatch(
  ctx: CanvasRenderingContext2D,
  layout: ShelfLayoutGeometry,
  isDoorOpen: boolean,
  isHovered: boolean,
  wiggleAngleRad = 0,
  glintStrength = 0
): void {
  const { frameRect, frameBorderPx, latchHitRect } = layout;
  const cx = frameRect.x + frameRect.w - frameBorderPx * 0.42;
  const cy = latchHitRect.y + latchHitRect.h * 0.5;
  const barW = Math.max(14, frameBorderPx * 0.78);
  const barH = Math.max(8, frameBorderPx * 0.38);

  ctx.save();
  ctx.translate(cx, cy);
  if (glintStrength > 0.01) {
    const glowR = barW * (1.15 + glintStrength * 0.45);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, glowR);
    grad.addColorStop(0, `rgba(255, 246, 210, ${(glintStrength * 0.62).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255, 246, 210, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isHovered) {
    ctx.scale(1.08, 1.08);
  }

  ctx.fillStyle = SHELF_WOOD_COLORS.brassShadow;
  ctx.beginPath();
  ctx.roundRect(-barW * 0.25, -barH * 1.35, barW * 0.72, barH * 2.7, 3);
  ctx.fill();

  ctx.save();
  ctx.translate(barW * 0.1, 0);
  ctx.rotate((isDoorOpen ? -0.78 : 0) + wiggleAngleRad);

  ctx.fillStyle = 'rgba(92, 68, 26, 0.28)';
  ctx.beginPath();
  ctx.roundRect(-barW * 0.85 + 2, -barH * 0.5 + 2.5, barW * 1.1, barH, barH * 0.45);
  ctx.fill();

  ctx.fillStyle = isHovered ? SHELF_WOOD_COLORS.brassHighlight : SHELF_WOOD_COLORS.brass;
  ctx.beginPath();
  ctx.roundRect(-barW * 0.85, -barH * 0.5, barW * 1.1, barH, barH * 0.45);
  ctx.fill();

  ctx.fillStyle = SHELF_WOOD_COLORS.brassHighlight;
  ctx.beginPath();
  ctx.arc(-barW * 0.76, 0, barH * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#F7F0E2';
  ctx.beginPath();
  ctx.arc(barW * 0.1, 0, Math.max(2, barH * 0.22), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
