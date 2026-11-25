import {
  BOOK_GAP_RATIO,
  BOOK_THICKNESS_RATIOS,
  COMPARTMENT_SIDE_MARGIN,
  COMPARTMENT_USABLE_WIDTH,
} from '../../data/palette';
import type { BookModel } from '../../types/contracts';
import {
  computeBookDimensions,
  computeBookSlotNormX,
  computeBookSlotRects,
  computeCompartmentBookPoses,
  computeDeskSpillTargets,
  getBookOrganicLeanRad,
  resolveCompartmentNormX,
  type CompartmentRect,
  type HorizontalSlotRequest,
  type Rect,
  type ShelfLayoutGeometry,
} from '../layout/shelfLayout';
import type { ChaosBodyPose } from './chaosWorld';

export const TOUCH_MAGNET_RADIUS_PX = 28;
export const TOUCH_LIFT_OFFSET_Y_PX = -48;
export const SHORT_TAP_MAX_DIST_PX = 6;
export const SHORT_TAP_MAX_DURATION_MS = 220;

export interface KinematicBookPose {
  readonly bookId: string;
  x: number;
  y: number;
  angle: number;
  scale: number;
  widthPx: number;
  heightPx: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  targetScale: number;
}

export interface InsertionPreview {
  readonly compartmentIndex: number;
  readonly insertIndex: number;
  readonly slotRects: Map<string, Rect>;
  readonly slotNormX: Map<string, number>;
  readonly highlightRect: Rect;
}

export function canCompartmentFit(
  booksInCompartment: readonly BookModel[],
  candidateBook: BookModel
): boolean {
  if (booksInCompartment.some((b) => b.placement?.fallenDir !== undefined)) {
    return false;
  }
  const existingSum = booksInCompartment.reduce(
    (sum, b) => sum + BOOK_THICKNESS_RATIOS[b.thicknessTier],
    0
  );
  const totalWidth =
    existingSum +
    BOOK_THICKNESS_RATIOS[candidateBook.thicknessTier] +
    booksInCompartment.length * BOOK_GAP_RATIO;
  return totalWidth <= COMPARTMENT_USABLE_WIDTH + 1e-6;
}

function computeSlotRectsWithPhantom(
  booksInCompartment: readonly BookModel[],
  candidateBook: BookModel,
  insertIndex: number,
  desiredCandidateNormX: number,
  compartment: CompartmentRect
): { slotRects: Map<string, Rect>; slotNormX: Map<string, number> } {
  const ordered = [...booksInCompartment].sort(
    (a, b) =>
      (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
  );
  const existingNormX = computeBookSlotNormX(ordered);
  const requests: HorizontalSlotRequest[] = ordered.map((book) => ({
    bookId: book.id,
    widthNorm: BOOK_THICKNESS_RATIOS[book.thicknessTier],
    desiredNormX: existingNormX.get(book.id) ?? COMPARTMENT_SIDE_MARGIN,
  }));

  const clampedIdx = Math.max(0, Math.min(requests.length, insertIndex));
  requests.splice(clampedIdx, 0, {
    bookId: candidateBook.id,
    widthNorm: BOOK_THICKNESS_RATIOS[candidateBook.thicknessTier],
    desiredNormX: desiredCandidateNormX,
  });

  const slotNormX = resolveCompartmentNormX(requests);
  const slotRects = new Map<string, Rect>();
  const orderedWithCandidate = [...ordered];
  orderedWithCandidate.splice(clampedIdx, 0, candidateBook);

  for (const book of orderedWithCandidate) {
    const normX = slotNormX.get(book.id) ?? COMPARTMENT_SIDE_MARGIN;
    const { widthPx, heightPx } = computeBookDimensions(book, compartment);
    slotRects.set(book.id, {
      x: compartment.x + normX * compartment.w,
      y: compartment.y + compartment.h - heightPx - 1,
      w: widthPx,
      h: heightPx,
    });
  }

  return { slotRects, slotNormX };
}

export function computeInsertionPreview(
  draggedBook: BookModel,
  centerX: number,
  centerY: number,
  books: readonly BookModel[],
  layout: ShelfLayoutGeometry
): InsertionPreview | null {
  const verticalPad = 10;
  const targetComp = layout.compartments.find(
    (c) =>
      centerX >= c.x &&
      centerX <= c.x + c.w &&
      centerY >= c.y - verticalPad &&
      centerY <= c.y + c.h + verticalPad
  );
  if (!targetComp) return null;

  const existing = books
    .filter(
      (b) =>
        b.id !== draggedBook.id && b.placement?.compartmentIndex === targetComp.index
    )
    .sort(
      (a, b) =>
        (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
    );

  if (!canCompartmentFit(existing, draggedBook)) {
    return null;
  }

  const candidateWidthNorm = BOOK_THICKNESS_RATIOS[draggedBook.thicknessTier];
  const desiredNormX = (centerX - targetComp.x) / targetComp.w - candidateWidthNorm * 0.5;
  const baseRects = computeBookSlotRects(existing, targetComp);
  let insertIndex = 0;
  for (const book of existing) {
    const r = baseRects.get(book.id);
    if (r && centerX > r.x + r.w * 0.5) {
      insertIndex += 1;
    }
  }

  const { slotRects, slotNormX } = computeSlotRectsWithPhantom(
    existing,
    draggedBook,
    insertIndex,
    desiredNormX,
    targetComp
  );
  const highlightRect = slotRects.get(draggedBook.id);
  if (!highlightRect) return null;

  return {
    compartmentIndex: targetComp.index,
    insertIndex,
    slotRects,
    slotNormX,
    highlightRect,
  };
}

export function commitBookPlacement(
  books: BookModel[],
  bookId: string,
  targetCompartmentIndex: number | null,
  insertIndex = 0,
  resolvedNormX?: ReadonlyMap<string, number>
): void {
  const dragged = books.find((b) => b.id === bookId);
  if (!dragged) return;

  const prevCompIdx = dragged.placement?.compartmentIndex ?? null;
  let prevCompNormX: Map<string, number> | null = null;
  if (prevCompIdx !== null && prevCompIdx !== targetCompartmentIndex) {
    const beforeRemoval = books.filter((b) => b.placement?.compartmentIndex === prevCompIdx);
    prevCompNormX = computeBookSlotNormX(beforeRemoval);
  }
  dragged.placement = null;

  if (prevCompIdx !== null && prevCompIdx !== targetCompartmentIndex) {
    const oldSiblings = books
      .filter((b) => b.placement?.compartmentIndex === prevCompIdx)
      .sort(
        (a, b) =>
          (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
      );
    oldSiblings.forEach((b, idx) => {
      const preservedNormX = b.placement?.normX ?? prevCompNormX?.get(b.id);
      const preservedFallenDir = b.placement?.fallenDir;
      b.placement = {
        compartmentIndex: prevCompIdx,
        orderInCompartment: idx,
        ...(preservedNormX !== undefined ? { normX: preservedNormX } : {}),
        ...(preservedFallenDir !== undefined ? { fallenDir: preservedFallenDir } : {}),
      };
    });
  }

  if (targetCompartmentIndex === null) {
    return;
  }

  const targetSiblings = books
    .filter((b) => b.placement?.compartmentIndex === targetCompartmentIndex)
    .sort(
      (a, b) =>
        (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
    );
  const clampedIdx = Math.max(0, Math.min(targetSiblings.length, insertIndex));
  targetSiblings.splice(clampedIdx, 0, dragged);
  targetSiblings.forEach((b, idx) => {
    const nextNormX = resolvedNormX?.get(b.id) ?? b.placement?.normX;
    const preservedFallenDir = b.id !== dragged.id ? b.placement?.fallenDir : undefined;
    b.placement = {
      compartmentIndex: targetCompartmentIndex,
      orderInCompartment: idx,
      ...(nextNormX !== undefined ? { normX: nextNormX } : {}),
      ...(preservedFallenDir !== undefined ? { fallenDir: preservedFallenDir } : {}),
    };
  });
}

function distanceToRotatedRect(
  px: number,
  py: number,
  pose: KinematicBookPose
): number {
  const dx = px - pose.x;
  const dy = py - pose.y;
  const cos = Math.cos(-pose.angle);
  const sin = Math.sin(-pose.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const halfW = pose.widthPx * pose.scale * 0.5;
  const halfH = pose.heightPx * pose.scale * 0.5;
  const clampedX = Math.max(-halfW, Math.min(halfW, lx));
  const clampedY = Math.max(-halfH, Math.min(halfH, ly));
  return Math.hypot(lx - clampedX, ly - clampedY);
}

export function pickBookAtPoint(
  px: number,
  py: number,
  pointerType: string,
  poses: ReadonlyMap<string, KinematicBookPose>,
  drawOrderIds: readonly string[]
): string | null {
  // 1. 정확한 사각형 히트 판정 (상단 z-order 우선)
  for (let i = drawOrderIds.length - 1; i >= 0; i -= 1) {
    const id = drawOrderIds[i];
    const pose = poses.get(id);
    if (!pose) continue;
    if (distanceToRotatedRect(px, py, pose) === 0) {
      return id;
    }
  }

  // 2. 터치 입력 전용 28px 근접 자석 선택 (모바일 390px 17.8px 폭 보완)
  if (pointerType === 'touch') {
    let bestId: string | null = null;
    let bestDist = TOUCH_MAGNET_RADIUS_PX;
    for (let i = drawOrderIds.length - 1; i >= 0; i -= 1) {
      const id = drawOrderIds[i];
      const pose = poses.get(id);
      if (!pose) continue;
      const dist = distanceToRotatedRect(px, py, pose);
      if (dist <= bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  return null;
}

export function getEffectiveDragCenter(
  pointerX: number,
  pointerY: number,
  grabOffsetX: number,
  grabOffsetY: number,
  pointerType: string
): { readonly x: number; readonly y: number } {
  const touchLiftY = pointerType === 'touch' ? TOUCH_LIFT_OFFSET_Y_PX : 0;
  return {
    x: pointerX + grabOffsetX,
    y: pointerY + grabOffsetY + touchLiftY,
  };
}

export function isShortTap(
  downX: number,
  downY: number,
  upX: number,
  upY: number,
  durationMs: number
): boolean {
  return (
    Math.hypot(upX - downX, upY - downY) < SHORT_TAP_MAX_DIST_PX &&
    durationMs < SHORT_TAP_MAX_DURATION_MS
  );
}

export function buildNeatPoses(
  books: readonly BookModel[],
  layout: ShelfLayoutGeometry
): Map<string, KinematicBookPose> {
  const poses = new Map<string, KinematicBookPose>();
  const refComp = layout.compartments[0];
  const byComp = new Map<number, BookModel[]>();
  const unplaced: BookModel[] = [];

  for (const book of books) {
    if (book.placement) {
      const arr = byComp.get(book.placement.compartmentIndex) ?? [];
      arr.push(book);
      byComp.set(book.placement.compartmentIndex, arr);
    } else {
      unplaced.push(book);
    }
  }

  for (const comp of layout.compartments) {
    const list = byComp.get(comp.index);
    if (!list || list.length === 0) continue;
    const compPoses = computeCompartmentBookPoses(list, comp);
    for (const book of list) {
      const bp = compPoses.get(book.id);
      if (!bp) continue;
      poses.set(book.id, {
        bookId: book.id,
        x: bp.centerX,
        y: bp.centerY,
        angle: bp.angleRad,
        scale: 1,
        widthPx: bp.widthPx,
        heightPx: bp.heightPx,
        targetX: bp.centerX,
        targetY: bp.centerY,
        targetAngle: bp.angleRad,
        targetScale: 1,
      });
    }
  }

  if (unplaced.length > 0) {
    const spillMap = computeDeskSpillTargets(unplaced, layout);
    for (const book of unplaced) {
      const target = spillMap.get(book.id);
      const dims = computeBookDimensions(book, refComp);
      const cx = target?.centerX ?? layout.viewportW * 0.5;
      const cy = target?.centerY ?? layout.viewportH * 0.85;
      const ang = target?.angleRad ?? 0;
      poses.set(book.id, {
        bookId: book.id,
        x: cx,
        y: cy,
        angle: ang,
        scale: 1,
        widthPx: dims.widthPx,
        heightPx: dims.heightPx,
        targetX: cx,
        targetY: cy,
        targetAngle: ang,
        targetScale: 1,
      });
    }
  }

  return poses;
}

export function enterOpenFromChaos(
  books: BookModel[],
  chaosPoses: ReadonlyMap<string, ChaosBodyPose>,
  layout: ShelfLayoutGeometry
): Map<string, KinematicBookPose> {
  for (const book of books) {
    book.placement = null;
  }
  const spillTargets = computeDeskSpillTargets(books, layout);
  const refComp = layout.compartments[0];
  const poses = new Map<string, KinematicBookPose>();

  for (const book of books) {
    const dims = computeBookDimensions(book, refComp);
    const start = chaosPoses.get(book.id);
    const target = spillTargets.get(book.id);

    const sx = start?.x ?? layout.innerRect.x + layout.innerRect.w * 0.5;
    const sy = start?.y ?? layout.innerRect.y + layout.innerRect.h * 0.7;
    const sa = start?.angle ?? 0;
    const tx = target?.centerX ?? sx;
    const ty = target?.centerY ?? sy;
    const ta = target?.angleRad ?? 0;

    poses.set(book.id, {
      bookId: book.id,
      x: sx,
      y: sy,
      angle: sa,
      scale: 1,
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
      targetX: tx,
      targetY: ty,
      targetAngle: ta,
      targetScale: 1,
    });
  }

  return poses;
}

export function syncTargetsFromPlacements(
  books: readonly BookModel[],
  poses: Map<string, KinematicBookPose>,
  layout: ShelfLayoutGeometry,
  draggedBookId: string | null,
  preview: InsertionPreview | null
): void {
  const byComp = new Map<number, BookModel[]>();
  const unplaced: BookModel[] = [];

  for (const book of books) {
    if (book.id === draggedBookId) continue;
    if (book.placement) {
      const arr = byComp.get(book.placement.compartmentIndex) ?? [];
      arr.push(book);
      byComp.set(book.placement.compartmentIndex, arr);
    } else {
      unplaced.push(book);
    }
  }

  for (const comp of layout.compartments) {
    if (preview && preview.compartmentIndex === comp.index) {
      for (const [id, r] of preview.slotRects) {
        if (id === draggedBookId) continue;
        const pose = poses.get(id);
        const book = books.find((b) => b.id === id);
        if (!pose || !book) continue;
        pose.widthPx = r.w;
        pose.heightPx = r.h;
        pose.targetX = r.x + r.w * 0.5;
        pose.targetY = r.y + r.h * 0.5;
        pose.targetAngle = getBookOrganicLeanRad(book.seed);
        pose.targetScale = 1;
      }
      continue;
    }

    const list = byComp.get(comp.index);
    if (!list || list.length === 0) continue;
    const compPoses = computeCompartmentBookPoses(list, comp);
    for (const book of list) {
      const bp = compPoses.get(book.id);
      const pose = poses.get(book.id);
      if (!bp || !pose) continue;
      pose.widthPx = bp.widthPx;
      pose.heightPx = bp.heightPx;
      pose.targetX = bp.centerX;
      pose.targetY = bp.centerY;
      pose.targetAngle = bp.angleRad;
      pose.targetScale = 1;
    }
  }

  if (unplaced.length > 0) {
    const refComp = layout.compartments[0];
    const minX = 24;
    const maxX = Math.max(minX, layout.viewportW - 24);
    const minY = 24;
    const maxY = Math.max(minY, layout.viewportH - 76);
    const shelfCx = layout.innerRect.x + layout.innerRect.w * 0.5;

    for (const book of unplaced) {
      const pose = poses.get(book.id);
      if (!pose) continue;
      const dims = computeBookDimensions(book, refComp);
      pose.widthPx = dims.widthPx;
      pose.heightPx = dims.heightPx;
      pose.targetScale = 1;

      // 자연스럽게 쏟아진 배치를 유지하기 위해 리사이즈 시에도 격자 재정렬 없이 뷰포트 경계만 안전 보정한다.
      let nextX = Math.min(maxX, Math.max(minX, pose.targetX));
      let nextY = Math.min(maxY, Math.max(minY, pose.targetY));

      const insideInner =
        nextX > layout.innerRect.x + 2 &&
        nextX < layout.innerRect.x + layout.innerRect.w - 2 &&
        nextY > layout.innerRect.y + 2 &&
        nextY < layout.innerRect.y + layout.innerRect.h - 2;

      if (insideInner) {
        if (layout.isDesktop) {
          nextX =
            nextX < shelfCx
              ? Math.max(minX, layout.frameRect.x - dims.widthPx * 0.8)
              : Math.min(maxX, layout.frameRect.x + layout.frameRect.w + dims.widthPx * 0.8);
        } else {
          nextY = Math.min(maxY, layout.frameRect.y + layout.frameRect.h + dims.heightPx * 0.65);
        }
      }

      pose.targetX = nextX;
      pose.targetY = nextY;
    }
  }
}

export function stepKinematics(
  poses: Map<string, KinematicBookPose>,
  dtSec: number,
  reducedMotion: boolean,
  draggedBookId: string | null
): boolean {
  const alpha = reducedMotion ? 1 : 1 - Math.exp(-16 * Math.min(0.05, dtSec));
  let stillMoving = false;

  for (const pose of poses.values()) {
    if (pose.bookId === draggedBookId) {
      pose.x += (pose.targetX - pose.x) * Math.min(1, alpha * 1.45);
      pose.y += (pose.targetY - pose.y) * Math.min(1, alpha * 1.45);
      pose.angle += (pose.targetAngle - pose.angle) * alpha;
      pose.scale += (pose.targetScale - pose.scale) * alpha;
      if (
        Math.abs(pose.targetX - pose.x) > 0.35 ||
        Math.abs(pose.targetY - pose.y) > 0.35 ||
        Math.abs(pose.targetScale - pose.scale) > 0.004
      ) {
        stillMoving = true;
      }
      continue;
    }

    const dx = pose.targetX - pose.x;
    const dy = pose.targetY - pose.y;
    const da = pose.targetAngle - pose.angle;
    const ds = pose.targetScale - pose.scale;

    if (
      Math.abs(dx) < 0.25 &&
      Math.abs(dy) < 0.25 &&
      Math.abs(da) < 0.003 &&
      Math.abs(ds) < 0.003
    ) {
      pose.x = pose.targetX;
      pose.y = pose.targetY;
      pose.angle = pose.targetAngle;
      pose.scale = pose.targetScale;
    } else {
      pose.x += dx * alpha;
      pose.y += dy * alpha;
      pose.angle += da * alpha;
      pose.scale += ds * alpha;
      stillMoving = true;
    }
  }

  return stillMoving;
}
