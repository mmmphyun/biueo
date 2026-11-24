import { BOOK_COLORS } from '../../data/palette';
import type { BookModel, SpineMotif, VisualTuningParams } from '../../types/contracts';
import { fillGouacheShape, mulberry32, traceOrganicRect } from './gouachePath';

export interface BakedBookSprite {
  readonly bookId: string;
  readonly canvas: HTMLCanvasElement;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly bodyOffsetX: number;
  readonly bodyOffsetY: number;
  readonly bodyW: number;
  readonly bodyH: number;
  readonly shadowCache: Map<string, HTMLCanvasElement>;
}

function drawSpineMotif(
  ctx: CanvasRenderingContext2D,
  motif: SpineMotif,
  x: number,
  y: number,
  w: number,
  h: number,
  accentColor: string,
  seed: number
): void {
  const rand = mulberry32(seed + 41);
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = accentColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = x + w * 0.5;
  const bandH = Math.max(2, h * 0.032);

  switch (motif) {
    case 'diamond': {
      ctx.globalAlpha = 0.88;
      ctx.fillRect(x, y + h * 0.14, w, bandH);
      ctx.fillRect(x, y + h * 0.83, w, bandH);

      const dSize = Math.min(w * 0.34, h * 0.085);
      for (const cy of [y + h * 0.39, y + h * 0.59]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - dSize);
        ctx.lineTo(cx + dSize * 0.85, cy);
        ctx.lineTo(cx, cy + dSize);
        ctx.lineTo(cx - dSize * 0.85, cy);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'bands': {
      ctx.globalAlpha = 0.88;
      const wide = Math.max(4, h * 0.065);
      ctx.fillRect(x, y + h * 0.12, w, wide);
      ctx.fillRect(x, y + h * 0.12 + wide + 3, w, Math.max(1.5, wide * 0.32));
      ctx.fillRect(x, y + h * 0.79, w, wide);
      ctx.fillRect(x, y + h * 0.79 - Math.max(2, wide * 0.32) - 3, w, Math.max(1.5, wide * 0.32));
      break;
    }
    case 'stitch': {
      ctx.globalAlpha = 0.86;
      const plateW = w * 0.64;
      const plateH = h * 0.18;
      ctx.beginPath();
      ctx.roundRect(cx - plateW * 0.5, y + h * 0.14, plateW, plateH, 2);
      ctx.fill();

      ctx.lineWidth = Math.max(1.4, w * 0.085);
      const startY = y + h * 0.41;
      const endY = y + h * 0.86;
      const step = Math.max(7, h * 0.075);
      for (let sy = startY; sy < endY; sy += step) {
        const jx = (rand() - 0.5) * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + jx, sy);
        ctx.lineTo(cx + jx, Math.min(endY, sy + step * 0.52));
        ctx.stroke();
      }
      break;
    }
    case 'wave': {
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = Math.max(2, w * 0.12);
      const amp = Math.max(2, w * 0.19);
      const topY = y + h * 0.19;
      const botY = y + h * 0.81;
      ctx.beginPath();
      const steps = 18;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const py = topY + (botY - topY) * t;
        const px = cx + Math.sin(t * Math.PI * 3.5) * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, y + h * 0.11, Math.max(2, w * 0.11), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dots': {
      ctx.globalAlpha = 0.88;
      ctx.fillRect(x + w * 0.16, y + h * 0.14, w * 0.68, bandH);
      ctx.fillRect(x + w * 0.16, y + h * 0.83, w * 0.68, bandH);
      const dotR = Math.max(2, Math.min(w * 0.18, h * 0.042));
      for (const cy of [y + h * 0.35, y + h * 0.5, y + h * 0.65]) {
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'plain': {
      // 무지 책등: 상·하단 얇은 천 제본 띠와 중앙 소형 오벌 라벨만 은은하게 배치
      ctx.globalAlpha = 0.32;
      ctx.fillRect(x, y + h * 0.04, w, Math.max(2, h * 0.03));
      ctx.fillRect(x, y + h * 0.93, w, Math.max(2, h * 0.03));
      ctx.globalAlpha = 0.68;
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.34, w * 0.24, h * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawBookmarkRibbon(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  bodyW: number,
  ribbonH: number,
  ribbonColor: string
): void {
  const rw = Math.min(11, Math.max(5.5, bodyW * 0.3));
  const rx = x + bodyW * 0.56 - rw * 0.5;
  const notch = Math.max(2.5, rw * 0.35);

  ctx.save();
  ctx.fillStyle = ribbonColor;
  ctx.beginPath();
  ctx.moveTo(rx, topY);
  ctx.lineTo(rx + rw * 0.5, topY + notch);
  ctx.lineTo(rx + rw, topY);
  ctx.lineTo(rx + rw, topY + ribbonH);
  ctx.lineTo(rx, topY + ribbonH);
  ctx.closePath();
  ctx.fill();

  // 리본 중앙 접힘 음영
  ctx.fillStyle = 'rgba(30, 32, 38, 0.14)';
  ctx.fillRect(rx + rw * 0.5, topY + notch, rw * 0.5, ribbonH - notch);
  ctx.restore();
}

export function bakeBookSprite(
  book: BookModel,
  widthPx: number,
  heightPx: number,
  dpr: number,
  tuning: VisualTuningParams,
  chalkTile: HTMLCanvasElement
): BakedBookSprite {
  const bodyW = Math.max(12, widthPx);
  const bodyH = Math.max(40, heightPx);
  const pad = 3;
  const topPad = Math.max(12, Math.ceil(bodyH * 0.11));
  const logicalW = Math.ceil(bodyW + pad * 2);
  const logicalH = Math.ceil(bodyH + topPad + pad);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(logicalW * dpr));
  canvas.height = Math.max(1, Math.ceil(logicalH * dpr));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable for bookBaker');
  }
  ctx.scale(dpr, dpr);

  const colorSpec = BOOK_COLORS[book.colorId];
  const bx = pad;
  const by = topPad;

  // 1. 기록된 책에는 상단에 파스텔 책갈피 리본을 돌출시킨다.
  if (book.note !== null) {
    const ribbonProtrude = Math.max(8, Math.round(bodyH * 0.08));
    drawBookmarkRibbon(
      ctx,
      bx,
      by - ribbonProtrude,
      bodyW,
      ribbonProtrude + 6,
      colorSpec.ribbon
    );
  }

  // 2. 상단 크림색 페이지 단면 얇게 노출
  ctx.save();
  ctx.fillStyle = '#F5EFE1';
  ctx.beginPath();
  ctx.roundRect(bx + 1.5, by - 2.2, Math.max(4, bodyW - 3), 5, 2);
  ctx.fill();
  ctx.restore();

  // 3. 무외곽선 손재단 과슈 책등 본체
  const radius = Math.min(3.5, bodyW * 0.16);
  const traceBody = () =>
    traceOrganicRect(ctx, bx, by, bodyW, bodyH, radius, tuning.edgeJitterPx, book.seed);
  fillGouacheShape(ctx, traceBody, colorSpec.hex, 0.16);

  // 4. 책등 내부 클리핑: 2톤 입체 띠 + 기하학 무늬 + 리소그래프 초크 질감
  ctx.save();
  traceBody();
  ctx.clip();

  // 좌측 18% 하이라이트 띠
  ctx.fillStyle = colorSpec.highlight;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(bx, by, bodyW * 0.18, bodyH);

  // 우측 13% 음영 띠
  ctx.fillStyle = colorSpec.shade;
  ctx.globalAlpha = 0.62;
  ctx.fillRect(bx + bodyW * 0.87, by, bodyW * 0.15, bodyH);

  // 기하학 무늬
  ctx.globalAlpha = 1;
  drawSpineMotif(ctx, book.motif, bx, by, bodyW, bodyH, colorSpec.accent, book.seed);

  // 초크/종이 입자 합성 (multiply로 과슈 질감 착색)
  if (tuning.grainStrength > 0.01) {
    const pattern = ctx.createPattern(chalkTile, 'repeat');
    if (pattern) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(0.7, tuning.grainStrength * 0.58);
      ctx.fillStyle = pattern;
      ctx.fillRect(bx - 2, by - 2, bodyW + 4, bodyH + 4);
    }
  }
  ctx.restore();

  return {
    bookId: book.id,
    canvas,
    logicalW,
    logicalH,
    bodyOffsetX: bx,
    bodyOffsetY: by,
    bodyW,
    bodyH,
    shadowCache: new Map(),
  };
}

export function getTintedShadowCanvas(
  sprite: BakedBookSprite,
  shadowHex: string
): HTMLCanvasElement {
  const cached = sprite.shadowCache.get(shadowHex);
  if (cached) return cached;

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = sprite.canvas.width;
  shadowCanvas.height = sprite.canvas.height;
  const sctx = shadowCanvas.getContext('2d');
  if (!sctx) {
    return sprite.canvas;
  }

  sctx.drawImage(sprite.canvas, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = shadowHex;
  sctx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

  sprite.shadowCache.set(shadowHex, shadowCanvas);
  return shadowCanvas;
}
