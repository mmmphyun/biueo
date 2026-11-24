import { describe, expect, it } from 'vitest';
import { createDefaultVolume } from '../../data/defaultBooks';
import type { BookModel } from '../../types/contracts';
import { computeShelfLayout } from '../layout/shelfLayout';
import {
  buildNeatPoses,
  canCompartmentFit,
  commitBookPlacement,
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
});
