import {
  BOOK_GAP_RATIO,
  BOOK_HEIGHT_RATIOS,
  BOOK_THICKNESS_RATIOS,
  COMPARTMENT_SIDE_MARGIN,
  COMPARTMENT_USABLE_WIDTH,
} from '../../data/palette';
import type { BookModel } from '../../types/contracts';
import { mulberry32 } from '../textures/gouachePath';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CompartmentRect extends Rect {
  readonly index: number;
  readonly row: number;
  readonly col: number;
}

export interface ShelfLayoutGeometry {
  readonly viewportW: number;
  readonly viewportH: number;
  readonly isDesktop: boolean;
  readonly logicalCols: number;
  readonly logicalRows: number;
  readonly renderCols: number;
  readonly renderRows: number;
  readonly frameRect: Rect;
  readonly innerRect: Rect;
  readonly frameBorderPx: number;
  readonly dividerPx: number;
  readonly baseApronHeightPx: number;
  readonly latchHitRect: Rect;
  readonly compartments: readonly CompartmentRect[];
  readonly minBookWidthPx: number;
}

export interface DeskSpillTarget {
  readonly bookId: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly angleRad: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function getBookOrganicLeanRad(seed: number): number {
  const rand = mulberry32(seed + 71);
  // 꽂힌 책마다 ±1.1°(±0.019 rad) 범위의 미세한 손맛 기울기를 부여한다.
  return (rand() - 0.5) * 0.038;
}

export function computeShelfLayout(
  viewportW: number,
  viewportH: number,
  logicalCols = 3,
  logicalRows = 3
): ShelfLayoutGeometry {
  const safeW = Math.max(320, viewportW);
  const safeH = Math.max(480, viewportH);
  const isDesktop = safeW / safeH >= 1.1;

  // 모바일 세로 화면에서 5x3 서가는 가로 붕괴를 막기 위해 3x5로 자동 전치한다.
  const shouldTranspose = !isDesktop && logicalCols > logicalRows;
  const renderCols = shouldTranspose ? logicalRows : logicalCols;
  const renderRows = shouldTranspose ? logicalCols : logicalRows;

  let frameW: number;
  let frameH: number;
  let frameX: number;
  let frameY: number;

  if (isDesktop) {
    if (renderCols === 5 && renderRows === 3) {
      const maxFrameW = clamp(safeW * 0.62, 520, 910);
      frameH = Math.min(maxFrameW / 1.56, safeH * 0.63);
      frameW = frameH * 1.56;
    } else {
      const targetH = clamp(safeH * 0.72, 340, 660);
      const maxW = safeW * 0.48;
      frameH = Math.min(targetH, maxW / 1.02);
      frameW = frameH * 1.02;
    }
    frameX = (safeW - frameW) * 0.5;
    frameY = Math.max(48, (safeH - frameH) * 0.34);
  } else {
    frameW = clamp(safeW - 26, 286, Math.min(safeW * 0.93, safeH * 0.52));
    if (renderRows > renderCols) {
      frameH = Math.min(safeH * 0.61, frameW * 1.42);
    } else {
      frameH = frameW * 0.97;
    }
    frameX = (safeW - frameW) * 0.5;
    frameY = Math.max(54, safeH * 0.075);
  }

  const frameBorderPx = isDesktop
    ? clamp(frameW * (renderCols === 5 ? 0.036 : 0.056), 18, 36)
    : clamp(frameW * 0.04, 12, 22);
  const dividerPx = isDesktop
    ? clamp(frameW * (renderCols === 5 ? 0.013 : 0.02), 6, 14)
    : clamp(frameW * 0.015, 5, 9);

  const innerX = frameX + frameBorderPx;
  const innerY = frameY + frameBorderPx;
  const innerW = frameW - frameBorderPx * 2;
  const innerRawH = frameH - frameBorderPx * 2;
  const baseApronHeightPx = Math.round(
    clamp(innerRawH * (renderRows > 3 ? 0.048 : 0.072), 18, 38)
  );
  const gridH = innerRawH - baseApronHeightPx - dividerPx * 0.6;

  const cellW = (innerW - dividerPx * (renderCols - 1)) / renderCols;
  const cellH = (gridH - dividerPx * (renderRows - 1)) / renderRows;

  // logical compartment index (0 .. logicalCols*logicalRows - 1)는 그대로 유지한다.
  const compartments: CompartmentRect[] = [];
  for (let r = 0; r < renderRows; r += 1) {
    for (let c = 0; c < renderCols; c += 1) {
      const index = r * renderCols + c;
      compartments.push({
        index,
        row: r,
        col: c,
        x: innerX + c * (cellW + dividerPx),
        y: innerY + r * (cellH + dividerPx),
        w: cellW,
        h: cellH,
      });
    }
  }

  const minBookWidthPx = cellW * BOOK_THICKNESS_RATIOS[0];
  const latchW = clamp(frameBorderPx * 0.95, 18, 34);
  const latchH = clamp(frameH * 0.11, 38, 66);
  const latchHitRect: Rect = {
    x: frameX + frameW - frameBorderPx * 0.72 - latchW * 0.35,
    y: frameY + frameH * 0.48 - latchH * 0.5,
    w: latchW + 16,
    h: latchH + 18,
  };

  return {
    viewportW: safeW,
    viewportH: safeH,
    isDesktop,
    logicalCols,
    logicalRows,
    renderCols,
    renderRows,
    frameRect: { x: frameX, y: frameY, w: frameW, h: frameH },
    innerRect: { x: innerX, y: innerY, w: innerW, h: gridH },
    frameBorderPx,
    dividerPx,
    baseApronHeightPx,
    latchHitRect,
    compartments,
    minBookWidthPx,
  };
}

export function computeBookDimensions(
  book: BookModel,
  compartment: CompartmentRect
): { widthPx: number; heightPx: number } {
  return {
    widthPx: compartment.w * BOOK_THICKNESS_RATIOS[book.thicknessTier],
    heightPx: compartment.h * BOOK_HEIGHT_RATIOS[book.heightTier],
  };
}

export function computeBookSlotRects(
  booksInCompartment: readonly BookModel[],
  compartment: CompartmentRect
): Map<string, Rect> {
  const ordered = [...booksInCompartment].sort(
    (a, b) =>
      (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
  );
  const totalNormWidth =
    ordered.reduce((sum, b) => sum + BOOK_THICKNESS_RATIOS[b.thicknessTier], 0) +
    Math.max(0, ordered.length - 1) * BOOK_GAP_RATIO;

  const startNormX =
    COMPARTMENT_SIDE_MARGIN + Math.max(0, (COMPARTMENT_USABLE_WIDTH - totalNormWidth) * 0.5);

  const result = new Map<string, Rect>();
  let cursorX = compartment.x + startNormX * compartment.w;
  const gapPx = BOOK_GAP_RATIO * compartment.w;

  for (const book of ordered) {
    const { widthPx, heightPx } = computeBookDimensions(book, compartment);
    result.set(book.id, {
      x: cursorX,
      y: compartment.y + compartment.h - heightPx - 1,
      w: widthPx,
      h: heightPx,
    });
    cursorX += widthPx + gapPx;
  }

  return result;
}

/**
 * 흔들기 후 문을 열 때 책장 주변 데스크 여백에 펼쳐질 목표 좌표를 계산한다.
 * 좌상단 타이틀(x < 240, y < 86)과 하단 HUD 바(y > viewportH - 86)를 침범하지 않는다.
 */
export function computeDeskSpillTargets(
  books: readonly BookModel[],
  layout: ShelfLayoutGeometry
): Map<string, DeskSpillTarget> {
  const refComp = layout.compartments[0];
  const { frameRect, viewportW, viewportH, isDesktop } = layout;
  const rand = mulberry32(44921 + books.length * 17);

  interface SlotPoint {
    x: number;
    y: number;
    angle: number;
  }

  const points: SlotPoint[] = [];

  if (isDesktop) {
    const leftAvailable = Math.max(70, frameRect.x - 32);
    const rightStart = frameRect.x + frameRect.w + 26;
    const rightAvailable = Math.max(70, viewportW - rightStart - 26);
    const bottomStart = frameRect.y + frameRect.h + 26;
    const bottomMaxY = viewportH - 92;

    const total = books.length;
    const sideTarget = Math.round(total * 0.72);
    const leftTarget = Math.ceil(sideTarget * 0.5);
    const rightTarget = sideTarget - leftTarget;
    const bottomTarget = total - sideTarget;

    // 좌측 여백 (상단 헤더 회피)
    const leftCols = total > 40 ? 3 : 2;
    const leftRows = Math.ceil(leftTarget / leftCols);
    const leftTop = Math.max(92, frameRect.y - 6);
    const leftH = Math.max(220, viewportH - 96 - leftTop);
    for (let idx = 0; idx < leftTarget; idx += 1) {
      const r = Math.floor(idx / leftCols);
      const c = idx % leftCols;
      points.push({
        x: 34 + ((c + 0.5) / leftCols) * (leftAvailable - 20),
        y: leftTop + ((r + 0.5) / Math.max(1, leftRows)) * leftH,
        angle: (rand() - 0.5) * 0.9,
      });
    }

    // 우측 여백
    const rightCols = total > 40 ? 3 : 2;
    const rightRows = Math.ceil(rightTarget / rightCols);
    const rightTop = Math.max(76, frameRect.y - 6);
    const rightH = Math.max(220, viewportH - 96 - rightTop);
    for (let idx = 0; idx < rightTarget; idx += 1) {
      const r = Math.floor(idx / rightCols);
      const c = idx % rightCols;
      points.push({
        x: rightStart + ((c + 0.5) / rightCols) * (rightAvailable - 16),
        y: rightTop + ((r + 0.5) / Math.max(1, rightRows)) * rightH,
        angle: (rand() - 0.5) * 0.9,
      });
    }

    // 하단 여백 (HUD 상단까지)
    const bottomRows = bottomTarget > 12 ? 2 : 1;
    const bottomCols = Math.ceil(bottomTarget / bottomRows);
    const safeBottomH = Math.max(46, bottomMaxY - bottomStart);
    for (let idx = 0; idx < bottomTarget; idx += 1) {
      const r = Math.floor(idx / bottomCols);
      const c = idx % bottomCols;
      points.push({
        x: frameRect.x + 18 + ((c + 0.5) / Math.max(1, bottomCols)) * (frameRect.w - 36),
        y: bottomStart + ((r + 0.5) / bottomRows) * safeBottomH,
        angle: (rand() > 0.5 ? 1 : -1) * (1.28 + (rand() - 0.5) * 0.42),
      });
    }
  } else {
    // 모바일: 책장 하단 ~ HUD 상단 사이 트레이 영역에 분산 배치
    const trayTop = frameRect.y + frameRect.h + 20;
    const trayBottom = Math.max(trayTop + 96, viewportH - 102);
    const trayH = trayBottom - trayTop;
    const rows = books.length > 40 ? 4 : 3;
    const cols = Math.ceil(books.length / rows);
    const trayLeft = 22;
    const trayW = viewportW - 44;

    for (let idx = 0; idx < books.length; idx += 1) {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      points.push({
        x: trayLeft + ((c + 0.5) / cols) * trayW,
        y: trayTop + ((r + 0.5) / rows) * trayH,
        angle: (rand() - 0.5) * 1.4,
      });
    }
  }

  const map = new Map<string, DeskSpillTarget>();
  books.forEach((book, idx) => {
    const slot = points[idx % points.length];
    const dims = computeBookDimensions(book, refComp);
    const jitterX = (rand() - 0.5) * (isDesktop ? 16 : 8);
    const jitterY = (rand() - 0.5) * (isDesktop ? 14 : 8);
    map.set(book.id, {
      bookId: book.id,
      centerX: clamp(slot.x + jitterX, 24, viewportW - 24),
      centerY: clamp(slot.y + jitterY, 44, viewportH - 84),
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
      angleRad: slot.angle,
    });
  });
  return map;
}
