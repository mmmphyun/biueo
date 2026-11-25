import { describe, expect, it } from 'vitest';
import { createDefaultVolume } from '../../data/defaultBooks';
import type { BookModel } from '../../types/contracts';
import {
  computeBookSlotRects,
  computeCompartmentBookPoses,
  computeShelfLayout,
} from '../layout/shelfLayout';
import {
  buildNeatPoses,
  canCompartmentFit,
  commitBookPlacement,
  computeInsertionPreview,
  enterOpenFromChaos,
  getEffectiveDragCenter,
  isShortTap,
  pickBookAtPoint,
  TOUCH_LIFT_OFFSET_Y_PX,
} from './slotSystem';

function makeBookWithThickness(id: string, thicknessTier: 0 | 1 | 2): BookModel {
  return {
    id,
    seed: 100,
    colorId: 'coral',
    colorOrderIndex: 0,
    heightTier: 1,
    thicknessTier,
    motif: 'plain',
    defaultPromptType: 'strength_recall',
    placement: null,
    note: null,
  };
}

describe('SlotSystem kinematics, capacity, and touch ergonomics', () => {
  it('accepts up to 4 thick books per compartment and rejects a 5th thick book', () => {
    const fourThick = [
      makeBookWithThickness('b1', 2),
      makeBookWithThickness('b2', 2),
      makeBookWithThickness('b3', 2),
    ];
    expect(canCompartmentFit(fourThick, makeBookWithThickness('b4', 2))).toBe(true);

    fourThick.push(makeBookWithThickness('b4', 2));
    expect(canCompartmentFit(fourThick, makeBookWithThickness('b5', 2))).toBe(false);
  });

  it('applies 28px nearest-neighbor magnet for touch only and ignores 20px miss for mouse', () => {
    const volume = createDefaultVolume(1, '3x3');
    const layout = computeShelfLayout(390, 844, 3, 3);
    const poses = buildNeatPoses(volume.books, layout);
    const drawOrder = volume.books.map((b) => b.id);

    const firstBookId = drawOrder[0];
    const pose = poses.get(firstBookId)!;

    // 책 위쪽 끝에서 16px 위 (터치 자석 28px 반경 안, 직접 히트 밖)
    const testX = pose.x;
    const testY = pose.y - pose.heightPx * 0.5 - 16;

    expect(pickBookAtPoint(testX, testY, 'mouse', poses, drawOrder)).toBeNull();
    expect(pickBookAtPoint(testX, testY, 'touch', poses, drawOrder)).toBe(firstBookId);
  });

  it('applies -48px finger-lift offset during touch drag and 0px for mouse', () => {
    const touchCenter = getEffectiveDragCenter(200, 400, 0, 0, 'touch');
    expect(touchCenter.x).toBe(200);
    expect(touchCenter.y).toBe(400 + TOUCH_LIFT_OFFSET_Y_PX);

    const mouseCenter = getEffectiveDragCenter(200, 400, 0, 0, 'mouse');
    expect(mouseCenter.x).toBe(200);
    expect(mouseCenter.y).toBe(400);
  });

  it('enforces <6px and <220ms boundary for short tap vs drag', () => {
    expect(isShortTap(100, 100, 103, 102, 180)).toBe(true);
    expect(isShortTap(100, 100, 106, 100, 150)).toBe(false);
    expect(isShortTap(100, 100, 101, 101, 220)).toBe(false);
  });

  it('separates door-open transitions: chaos clears placements to desk, neat keeps placements', () => {
    const volume = createDefaultVolume(1, '3x3');
    const layout = computeShelfLayout(1440, 900, 3, 3);

    const neatPoses = buildNeatPoses(volume.books, layout);
    expect(neatPoses.size).toBe(36);
    expect(volume.books.every((b) => b.placement !== null)).toBe(true);

    const chaosMap = new Map(
      volume.books.map((b) => [
        b.id,
        { x: layout.innerRect.x + 200, y: layout.innerRect.y + 400, angle: 0.4 },
      ])
    );
    const openFromChaos = enterOpenFromChaos(volume.books, chaosMap, layout);
    expect(openFromChaos.size).toBe(36);
    expect(volume.books.every((b) => b.placement === null)).toBe(true);

    commitBookPlacement(volume.books, volume.books[0].id, 4, 0);
    expect(volume.books[0].placement).toEqual({ compartmentIndex: 4, orderInCompartment: 0 });
  });

  it('preserves left or right free drop edge in an empty compartment without snapping to center', () => {
    const volume = createDefaultVolume(1, '3x3');
    for (const b of volume.books) b.placement = null;
    const layout = computeShelfLayout(1440, 900, 3, 3);
    const comp = layout.compartments[4];

    const leftBook = volume.books[0];
    const leftPreview = computeInsertionPreview(
      leftBook,
      comp.x + comp.w * 0.14,
      comp.y + comp.h * 0.5,
      volume.books,
      layout
    )!;
    expect(leftPreview).not.toBeNull();
    commitBookPlacement(volume.books, leftBook.id, 4, leftPreview.insertIndex, leftPreview.slotNormX);
    expect(leftBook.placement?.normX).toBeLessThan(0.2);

    const rightBook = volume.books[1];
    const rightPreview = computeInsertionPreview(
      rightBook,
      comp.x + comp.w * 0.86,
      comp.y + comp.h * 0.5,
      volume.books,
      layout
    )!;
    expect(rightPreview).not.toBeNull();
    commitBookPlacement(volume.books, rightBook.id, 4, rightPreview.insertIndex, rightPreview.slotNormX);

    expect(leftBook.placement?.normX).toBeLessThan(0.2);
    expect(rightBook.placement?.normX).toBeGreaterThan(0.65);
  });

  it('keeps remaining books stationary when pulling a middle or edge book out of a compartment', () => {
    const volume = createDefaultVolume(1, '3x3');
    const layout = computeShelfLayout(1440, 900, 3, 3);
    const comp = layout.compartments[1];

    const inComp = volume.books
      .filter((b) => b.placement?.compartmentIndex === 1)
      .sort((a, b) => (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0));
    expect(inComp).toHaveLength(4);

    const beforeRects = computeBookSlotRects(inComp, comp);
    const removed = inComp[1];
    commitBookPlacement(volume.books, removed.id, null);

    const remaining = volume.books.filter((b) => b.placement?.compartmentIndex === 1);
    expect(remaining).toHaveLength(3);
    const afterRects = computeBookSlotRects(remaining, comp);

    for (const book of remaining) {
      expect(afterRects.get(book.id)!.x).toBeCloseTo(beforeRects.get(book.id)!.x, 4);
    }
  });

  it('nudges neighbors minimally only on overlap while leaving distant compartment books untouched', () => {
    const volume = createDefaultVolume(1, '3x3');
    for (const b of volume.books) b.placement = null;
    const layout = computeShelfLayout(1440, 900, 3, 3);
    const comp = layout.compartments[4];

    const anchor = volume.books[0];
    anchor.placement = { compartmentIndex: 4, orderInCompartment: 0, normX: 0.72 };

    // 먼 왼쪽 빈 공간 삽입: 기존 오른쪽 책 고정
    const farLeft = volume.books[1];
    const farPreview = computeInsertionPreview(
      farLeft,
      comp.x + comp.w * 0.16,
      comp.y + comp.h * 0.5,
      volume.books,
      layout
    )!;
    expect(farPreview.slotNormX.get(anchor.id)).toBeCloseTo(0.72, 4);
    expect(farPreview.slotNormX.get(farLeft.id)!).toBeLessThan(0.2);

    // 겹치는 바로 옆 삽입: 기존 책이 우측으로만 최소 밀려나며 칸 경계 내부 유지
    const nearOverlap = volume.books[2];
    const nearPreview = computeInsertionPreview(
      nearOverlap,
      comp.x + comp.w * 0.74,
      comp.y + comp.h * 0.5,
      volume.books,
      layout
    )!;
    const anchorRect = nearPreview.slotRects.get(anchor.id)!;
    const nearRect = nearPreview.slotRects.get(nearOverlap.id)!;
    expect(anchorRect.x).toBeGreaterThanOrEqual(comp.x);
    expect(anchorRect.x + anchorRect.w).toBeLessThanOrEqual(comp.x + comp.w);
    expect(nearRect.x + nearRect.w).toBeLessThanOrEqual(comp.x + comp.w);
    const leftEdge = Math.min(anchorRect.x, nearRect.x);
    const rightStart = Math.max(anchorRect.x, nearRect.x);
    const leftWidth = anchorRect.x < nearRect.x ? anchorRect.w : nearRect.w;
    expect(rightStart).toBeGreaterThan(leftEdge + leftWidth);
  });

  it('clamps fallen book angles cleanly inside compartment walls on both 3x3 and 5x3 layouts', () => {
    for (const preset of ['3x3', '5x3'] as const) {
      const volume = createDefaultVolume(1, preset);
      for (const b of volume.books) b.placement = null;
      const layout = computeShelfLayout(1440, 900, volume.gridCols, volume.gridRows);
      const comp = layout.compartments[0];

      const book = { ...volume.books[0], heightTier: 3 as const, thicknessTier: 0 as const };
      book.placement = {
        compartmentIndex: 0,
        orderInCompartment: 0,
        normX: 0.35,
        fallenDir: 1,
      };

      const compPoses = computeCompartmentBookPoses([book], comp);
      const bp = compPoses.get(book.id)!;
      expect(bp.angleRad).toBeGreaterThan(0.2);

      const cos = Math.cos(bp.angleRad);
      const sin = Math.sin(bp.angleRad);
      const hw = bp.widthPx * 0.5;
      const hh = bp.heightPx * 0.5;
      const corners = [
        { x: bp.centerX + (-hw * cos - -hh * sin), y: bp.centerY + (-hw * sin + -hh * cos) },
        { x: bp.centerX + (hw * cos - -hh * sin), y: bp.centerY + (hw * sin + -hh * cos) },
        { x: bp.centerX + (hw * cos - hh * sin), y: bp.centerY + (hw * sin + hh * cos) },
        { x: bp.centerX + (-hw * cos - hh * sin), y: bp.centerY + (-hw * sin + hh * cos) },
      ];

      for (const pt of corners) {
        expect(pt.x).toBeGreaterThanOrEqual(comp.x - 0.5);
        expect(pt.x).toBeLessThanOrEqual(comp.x + comp.w + 0.5);
        expect(pt.y).toBeGreaterThanOrEqual(comp.y - 0.5);
        expect(pt.y).toBeLessThanOrEqual(comp.y + comp.h + 0.5);
      }
    }
  });

  it('blocks new insertions into a compartment containing a fallen book until that book is stood upright', () => {
    const volume = createDefaultVolume(1, '3x3');
    for (const b of volume.books) b.placement = null;
    const layout = computeShelfLayout(1440, 900, 3, 3);
    const comp = layout.compartments[4];

    const fallenBook = volume.books[0];
    fallenBook.placement = {
      compartmentIndex: 4,
      orderInCompartment: 0,
      normX: 0.14,
      fallenDir: 1,
    };

    const incoming = volume.books[1];
    expect(canCompartmentFit([fallenBook], incoming)).toBe(false);
    expect(
      computeInsertionPreview(
        incoming,
        comp.x + comp.w * 0.78,
        comp.y + comp.h * 0.5,
        volume.books,
        layout
      )
    ).toBeNull();

    // 쓰러진 책 본인을 집어 같은 칸에 다시 꽂으면 허용되고 fallenDir가 제거되어 직립한다.
    const reStandPreview = computeInsertionPreview(
      fallenBook,
      comp.x + comp.w * 0.25,
      comp.y + comp.h * 0.5,
      volume.books,
      layout
    );
    expect(reStandPreview).not.toBeNull();
    commitBookPlacement(
      volume.books,
      fallenBook.id,
      4,
      reStandPreview!.insertIndex,
      reStandPreview!.slotNormX
    );
    expect(fallenBook.placement?.fallenDir).toBeUndefined();

    // 기립 복원 후에는 새 책 삽입도 다시 가능해진다.
    expect(canCompartmentFit([fallenBook], incoming)).toBe(true);
    expect(
      computeInsertionPreview(
        incoming,
        comp.x + comp.w * 0.78,
        comp.y + comp.h * 0.5,
        volume.books,
        layout
      )
    ).not.toBeNull();
  });

  it('resolves two same-direction fallen books with domino angle separation inside bounds', () => {
    const volume = createDefaultVolume(1, '3x3');
    for (const b of volume.books) b.placement = null;
    const layout = computeShelfLayout(1440, 900, 3, 3);
    const comp = layout.compartments[2];

    const leftFallen = volume.books[0];
    const rightFallen = volume.books[1];
    leftFallen.placement = {
      compartmentIndex: 2,
      orderInCompartment: 0,
      normX: 0.1,
      fallenDir: 1,
    };
    rightFallen.placement = {
      compartmentIndex: 2,
      orderInCompartment: 1,
      normX: 0.34,
      fallenDir: 1,
    };

    const compPoses = computeCompartmentBookPoses([leftFallen, rightFallen], comp);
    const leftPose = compPoses.get(leftFallen.id)!;
    const rightPose = compPoses.get(rightFallen.id)!;

    expect(rightPose.angleRad).toBeGreaterThan(0.35);
    expect(leftPose.angleRad).toBeGreaterThan(0.2);
    expect(leftPose.angleRad).toBeLessThanOrEqual(rightPose.angleRad);
  });
});
