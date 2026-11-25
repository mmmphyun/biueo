import {
  BOOK_GAP_RATIO,
  BOOK_HEIGHT_RATIOS,
  BOOK_THICKNESS_RATIOS,
  COMPARTMENT_SIDE_MARGIN,
  COMPARTMENT_USABLE_WIDTH,
} from '../data/bookPalette';
import type { BookModel } from '../../../types/contracts';
import { mulberry32 } from '../../../shared/canvas/gouachePath';

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

export interface HorizontalSlotRequest {
  readonly bookId: string;
  readonly widthNorm: number;
  readonly desiredNormX: number;
}

/**
 * 좌->우 순서로 정렬된 책들의 희망 가로 좌표를 허용 구간 [minX, maxRight] 및 최소 간격을 지키며 최소 이동으로 해소한다.
 */
export function resolveCompartmentNormX(
  orderedRequests: readonly HorizontalSlotRequest[],
  minX = COMPARTMENT_SIDE_MARGIN,
  maxRight = COMPARTMENT_SIDE_MARGIN + COMPARTMENT_USABLE_WIDTH
): Map<string, number> {
  const result = new Map<string, number>();
  const n = orderedRequests.length;
  if (n === 0) return result;

  const gap = BOOK_GAP_RATIO;

  const xs = orderedRequests.map((req) =>
    Math.min(Math.max(minX, maxRight - req.widthNorm), Math.max(minX, req.desiredNormX))
  );

  for (let i = 1; i < n; i += 1) {
    xs[i] = Math.max(xs[i], xs[i - 1] + orderedRequests[i - 1].widthNorm + gap);
  }

  xs[n - 1] = Math.min(xs[n - 1], Math.max(minX, maxRight - orderedRequests[n - 1].widthNorm));
  for (let i = n - 2; i >= 0; i -= 1) {
    xs[i] = Math.min(xs[i], xs[i + 1] - orderedRequests[i].widthNorm - gap);
  }

  for (let i = 0; i < n; i += 1) {
    result.set(orderedRequests[i].bookId, xs[i]);
  }
  return result;
}

export function computeBookSlotNormX(
  booksInCompartment: readonly BookModel[]
): Map<string, number> {
  const ordered = [...booksInCompartment].sort(
    (a, b) =>
      (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
  );
  if (ordered.length === 0) return new Map();

  const totalNormWidth =
    ordered.reduce((sum, b) => sum + BOOK_THICKNESS_RATIOS[b.thicknessTier], 0) +
    Math.max(0, ordered.length - 1) * BOOK_GAP_RATIO;
  let fallbackCursor =
    COMPARTMENT_SIDE_MARGIN + Math.max(0, (COMPARTMENT_USABLE_WIDTH - totalNormWidth) * 0.5);

  const requests: HorizontalSlotRequest[] = ordered.map((book) => {
    const widthNorm = BOOK_THICKNESS_RATIOS[book.thicknessTier];
    const stored = book.placement?.normX;
    const desiredNormX =
      typeof stored === 'number' && Number.isFinite(stored) ? stored : fallbackCursor;
    fallbackCursor += widthNorm + BOOK_GAP_RATIO;
    return { bookId: book.id, widthNorm, desiredNormX };
  });

  return resolveCompartmentNormX(requests);
}

export const MAX_BOOK_FALL_ANGLE_RAD = (86 * Math.PI) / 180;

export interface CompartmentBookPose {
  readonly bookId: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly angleRad: number;
  readonly fallenDir?: -1 | 1;
}

export function computeMaxTipAngleRad(
  uprightRect: Rect,
  dir: -1 | 1,
  stopWallX: number
): number {
  const wallPadPx = 2;
  const available =
    dir === 1
      ? Math.max(0, stopWallX - wallPadPx - (uprightRect.x + uprightRect.w))
      : Math.max(0, uprightRect.x - (stopWallX + wallPadPx));
  const sinMax = clamp(available / Math.max(1, uprightRect.h), 0, 1);
  return Math.min(MAX_BOOK_FALL_ANGLE_RAD, Math.asin(sinMax));
}

export function computeTippedBookTransform(
  uprightRect: Rect,
  dir: -1 | 1,
  angleAbsRad: number
): { readonly centerX: number; readonly centerY: number; readonly angleRad: number } {
  const w = uprightRect.w;
  const h = uprightRect.h;
  const floorY = uprightRect.y + h;
  const theta = clamp(angleAbsRad, 0, MAX_BOOK_FALL_ANGLE_RAD);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  if (dir === 1) {
    const px = uprightRect.x + w;
    return {
      centerX: px - w * 0.5 * cos + h * 0.5 * sin,
      centerY: floorY - w * 0.5 * sin - h * 0.5 * cos,
      angleRad: theta,
    };
  }

  const px = uprightRect.x;
  return {
    centerX: px + w * 0.5 * cos - h * 0.5 * sin,
    centerY: floorY - w * 0.5 * sin - h * 0.5 * cos,
    angleRad: -theta,
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
  const normXMap = computeBookSlotNormX(ordered);
  const result = new Map<string, Rect>();

  for (const book of ordered) {
    const normX = normXMap.get(book.id) ?? COMPARTMENT_SIDE_MARGIN;
    const { widthPx, heightPx } = computeBookDimensions(book, compartment);
    result.set(book.id, {
      x: compartment.x + normX * compartment.w,
      y: compartment.y + compartment.h - heightPx - 1,
      w: widthPx,
      h: heightPx,
    });
  }

  return result;
}

/**
 * 칸 내부 책들의 최종 렌더 포즈(기립 또는 벽·이웃·도미노 한계에 닿은 쓰러짐)를 계산한다.
 */
export function computeCompartmentBookPoses(
  booksInCompartment: readonly BookModel[],
  compartment: CompartmentRect
): Map<string, CompartmentBookPose> {
  const ordered = [...booksInCompartment].sort(
    (a, b) =>
      (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
  );
  const rects = computeBookSlotRects(ordered, compartment);
  const resolvedAngleAbs = new Map<string, number>();

  // 우측 쓰러짐(dir = 1)은 우측 벽·이웃 책 기준으로 우->좌 순서로 각도를 확정한다.
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const book = ordered[i];
    if (book.placement?.fallenDir !== 1) continue;
    const rect = rects.get(book.id);
    if (!rect) continue;

    const wallRight = compartment.x + compartment.w;
    let stopWallX = wallRight;
    let dominoCap = MAX_BOOK_FALL_ANGLE_RAD;

    if (i + 1 < ordered.length) {
      const nextBook = ordered[i + 1];
      const nextRect = rects.get(nextBook.id);
      const nextDir = nextBook.placement?.fallenDir;
      if (nextRect) {
        if (nextDir === undefined) {
          stopWallX = nextRect.x;
        } else if (nextDir === -1) {
          stopWallX = (rect.x + rect.w + nextRect.x) * 0.5;
        } else {
          const nextAngle = resolvedAngleAbs.get(nextBook.id) ?? 0;
          if (nextAngle < 0.38) {
            stopWallX = nextRect.x;
          } else {
            stopWallX = wallRight;
            dominoCap = Math.max(0.28, nextAngle - 0.16);
          }
        }
      }
    }

    const wallAngle = computeMaxTipAngleRad(rect, 1, stopWallX);
    resolvedAngleAbs.set(book.id, Math.min(wallAngle, dominoCap));
  }

  // 좌측 쓰러짐(dir = -1)은 좌측 벽·이웃 책 기준으로 좌->우 순서로 각도를 확정한다.
  for (let i = 0; i < ordered.length; i += 1) {
    const book = ordered[i];
    if (book.placement?.fallenDir !== -1) continue;
    const rect = rects.get(book.id);
    if (!rect) continue;

    const wallLeft = compartment.x;
    let stopWallX = wallLeft;
    let dominoCap = MAX_BOOK_FALL_ANGLE_RAD;

    if (i - 1 >= 0) {
      const prevBook = ordered[i - 1];
      const prevRect = rects.get(prevBook.id);
      const prevDir = prevBook.placement?.fallenDir;
      if (prevRect) {
        if (prevDir === undefined) {
          stopWallX = prevRect.x + prevRect.w;
        } else if (prevDir === 1) {
          stopWallX = (prevRect.x + prevRect.w + rect.x) * 0.5;
        } else {
          const prevAngle = resolvedAngleAbs.get(prevBook.id) ?? 0;
          if (prevAngle < 0.38) {
            stopWallX = prevRect.x + prevRect.w;
          } else {
            stopWallX = wallLeft;
            dominoCap = Math.max(0.28, prevAngle - 0.16);
          }
        }
      }
    }

    const wallAngle = computeMaxTipAngleRad(rect, -1, stopWallX);
    resolvedAngleAbs.set(book.id, Math.min(wallAngle, dominoCap));
  }

  const poses = new Map<string, CompartmentBookPose>();
  for (const book of ordered) {
    const rect = rects.get(book.id);
    if (!rect) continue;
    const dir = book.placement?.fallenDir;
    if (dir === -1 || dir === 1) {
      const angleAbs = resolvedAngleAbs.get(book.id) ?? 0;
      if (angleAbs > 0.02) {
        const tf = computeTippedBookTransform(rect, dir, angleAbs);
        poses.set(book.id, {
          bookId: book.id,
          centerX: tf.centerX,
          centerY: tf.centerY,
          widthPx: rect.w,
          heightPx: rect.h,
          angleRad: tf.angleRad,
          fallenDir: dir,
        });
        continue;
      }
    }

    poses.set(book.id, {
      bookId: book.id,
      centerX: rect.x + rect.w * 0.5,
      centerY: rect.y + rect.h * 0.5,
      widthPx: rect.w,
      heightPx: rect.h,
      angleRad: getBookOrganicLeanRad(book.seed),
    });
  }

  return poses;
}

export interface FreeSlotZone {
  readonly minX: number;
  readonly maxX: number;
}

const SHALLOW_LEAN_THRESHOLD_RAD = (68 * Math.PI) / 180;

/**
 * 쓰러진 책들이 물리적으로 점유한 가로 구간을 제외한 삽입 가능 자유 구간 목록을 반환한다.
 */
export function computeCompartmentFreeZones(
  booksInCompartment: readonly BookModel[],
  compartment: CompartmentRect
): FreeSlotZone[] {
  const usableMin = COMPARTMENT_SIDE_MARGIN;
  const usableMax = COMPARTMENT_SIDE_MARGIN + COMPARTMENT_USABLE_WIDTH;
  const fallenBooks = booksInCompartment.filter((b) => b.placement?.fallenDir !== undefined);
  if (fallenBooks.length === 0) {
    return [{ minX: usableMin, maxX: usableMax }];
  }

  const normXMap = computeBookSlotNormX(booksInCompartment);
  const compPoses = computeCompartmentBookPoses(booksInCompartment, compartment);
  const compW = Math.max(1, compartment.w);

  const obstacles: { start: number; end: number }[] = [];
  for (const book of fallenBooks) {
    const bp = compPoses.get(book.id);
    const widthNorm = BOOK_THICKNESS_RATIOS[book.thicknessTier];
    const baseNormX = normXMap.get(book.id) ?? COMPARTMENT_SIDE_MARGIN;
    let obsMin = baseNormX;
    let obsMax = baseNormX + widthNorm;

    if (bp) {
      const theta = Math.abs(bp.angleRad);
      const halfSpanPx =
        bp.widthPx * 0.5 * Math.cos(theta) + bp.heightPx * 0.5 * Math.sin(theta);
      const rawMin = (bp.centerX - halfSpanPx - compartment.x) / compW;
      const rawMax = (bp.centerX + halfSpanPx - compartment.x) / compW;
      // 완전히 바닥에 눕지 않은(68도 미만) 책은 상단 끝부분에 약간의 여유를 허용한다.
      const tipTrim = theta < SHALLOW_LEAN_THRESHOLD_RAD ? 0.025 : 0;
      obsMin = Math.min(baseNormX, rawMin + tipTrim);
      obsMax = Math.max(baseNormX + widthNorm, rawMax - tipTrim);
    }

    obstacles.push({
      start: clamp(obsMin - BOOK_GAP_RATIO, usableMin, usableMax),
      end: clamp(obsMax + BOOK_GAP_RATIO, usableMin, usableMax),
    });
  }

  obstacles.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const obs of obstacles) {
    const prev = merged[merged.length - 1];
    if (prev && obs.start <= prev.end + 1e-6) {
      prev.end = Math.max(prev.end, obs.end);
    } else {
      merged.push({ ...obs });
    }
  }

  const zones: FreeSlotZone[] = [];
  let cursor = usableMin;
  for (const obs of merged) {
    if (obs.start - cursor > 1e-4) {
      zones.push({ minX: cursor, maxX: obs.start });
    }
    cursor = Math.max(cursor, obs.end);
  }
  if (usableMax - cursor > 1e-4) {
    zones.push({ minX: cursor, maxX: usableMax });
  }

  return zones;
}

/**
 * 볼륨 재로드 시 미배치 책의 데스크 여백 폴백 좌표를 계산한다.
 */
export function computeDeskSpillTargets(
  books: readonly BookModel[],
  layout: ShelfLayoutGeometry
): Map<string, DeskSpillTarget> {
  const refComp = layout.compartments[0];
  const { frameRect, viewportW, viewportH, isDesktop } = layout;
  const rand = mulberry32(44921 + books.length * 17);
  const map = new Map<string, DeskSpillTarget>();

  books.forEach((book, idx) => {
    const dims = computeBookDimensions(book, refComp);
    const t = books.length > 1 ? idx / (books.length - 1) : 0.5;
    let cx: number;
    let cy: number;
    let angleRad = (rand() - 0.5) * 1.1;

    if (isDesktop) {
      const side = idx % 2 === 0 ? -1 : 1;
      const lane =
        side < 0
          ? 28 + rand() * Math.max(40, frameRect.x - 56)
          : frameRect.x + frameRect.w + 28 + rand() * Math.max(40, viewportW - frameRect.x - frameRect.w - 56);
      cx = clamp(lane, 28, viewportW - 28);
      cy = clamp(88 + t * Math.max(120, viewportH - 180), 44, viewportH - 88);
    } else {
      const trayTop = frameRect.y + frameRect.h + 24;
      const traySpan = Math.max(60, viewportH - 92 - trayTop);
      cx = clamp(28 + rand() * Math.max(80, viewportW - 56), 28, viewportW - 28);
      cy = clamp(trayTop + t * traySpan, 44, viewportH - 84);
      angleRad = (rand() - 0.5) * 1.4;
    }

    map.set(book.id, {
      bookId: book.id,
      centerX: cx,
      centerY: cy,
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
      angleRad,
    });
  });
  return map;
}
