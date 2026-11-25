import { describe, expect, it } from 'vitest';
import { createDefaultVolume } from '../../data/defaultBooks';
import { computeBookDimensions, computeShelfLayout } from '../layout/shelfLayout';
import { ChaosWorld } from './chaosWorld';
import { buildNeatPoses } from './slotSystem';

describe('ChaosWorld boundary containment & speed clamping', () => {
  it('never allows 36 or 60 books to escape innerRect under strong shaking impulses', () => {
    for (const preset of ['3x3', '5x3'] as const) {
      const volume = createDefaultVolume(1, preset);
      const layout = computeShelfLayout(1440, 900, volume.gridCols, volume.gridRows);
      const neatPoses = buildNeatPoses(volume.books, layout);
      const refComp = layout.compartments[0];

      const world = new ChaosWorld(layout.innerRect);
      world.spawnFromPoses(
        volume.books.map((book) => {
          const pose = neatPoses.get(book.id)!;
          const dims = computeBookDimensions(book, refComp);
          return {
            bookId: book.id,
            centerX: pose.x,
            centerY: pose.y,
            widthPx: dims.widthPx,
            heightPx: dims.heightPx,
            angleRad: pose.angle,
          };
        })
      );

      for (let pulse = 0; pulse < 10; pulse += 1) {
        const dir = pulse % 2 === 0 ? 1 : -1;
        world.applyShakeImpulse(dir * 16, -12);
        for (let f = 0; f < 24; f += 1) {
          world.step(16.67);
        }
      }

      const finalPoses = world.getBodyPoses();
      expect(finalPoses.size).toBe(volume.books.length);

      for (const pose of finalPoses.values()) {
        expect(pose.x).toBeGreaterThanOrEqual(layout.innerRect.x);
        expect(pose.x).toBeLessThanOrEqual(layout.innerRect.x + layout.innerRect.w);
        expect(pose.y).toBeGreaterThanOrEqual(layout.innerRect.y);
        expect(pose.y).toBeLessThanOrEqual(layout.innerRect.y + layout.innerRect.h);
      }

      world.dispose();
    }
  });
});

function createSpawnList(viewportW: number, viewportH: number, preset: '3x3' | '5x3') {
  const volume = createDefaultVolume(1, preset);
  const layout = computeShelfLayout(viewportW, viewportH, volume.gridCols, volume.gridRows);
  const neatPoses = buildNeatPoses(volume.books, layout);
  const refComp = layout.compartments[0];
  const spawns = volume.books.map((book) => {
    const pose = neatPoses.get(book.id)!;
    const dims = computeBookDimensions(book, refComp);
    return {
      bookId: book.id,
      centerX: pose.x,
      centerY: pose.y,
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
      angleRad: pose.angle,
    };
  });
  return { volume, layout, spawns };
}

describe('ChaosWorld door-open desk spill cascade', () => {
  it('spills 3x3 and 5x3 tumbled books inside safe desk bounds on desktop and mobile and settles organically', () => {
    const scenarios = [
      { preset: '3x3' as const, w: 1440, h: 900 },
      { preset: '5x3' as const, w: 1440, h: 900 },
      { preset: '3x3' as const, w: 390, h: 844 },
      { preset: '5x3' as const, w: 390, h: 844 },
    ];

    for (const sc of scenarios) {
      const { volume, layout, spawns } = createSpawnList(sc.w, sc.h, sc.preset);
      const world = new ChaosWorld(layout.innerRect);
      world.spawnFromPoses(spawns);

      for (let i = 0; i < 3; i += 1) {
        world.applyShakeImpulse((i % 2 === 0 ? 1 : -1) * 12, -8);
        for (let f = 0; f < 10; f += 1) {
          world.step(16.67);
        }
      }

      const preOpenPoses = world.getBodyPoses();
      let preMeanY = 0;
      for (const p of preOpenPoses.values()) preMeanY += p.y;
      preMeanY /= preOpenPoses.size;

      world.openDoorAndSpill(sc.w, sc.h, layout.frameRect, layout.isDesktop);

      // 쏟아짐 초반(~250ms) 검증
      for (let f = 0; f < 15; f += 1) {
        world.step(16.67);
      }
      const midPoses = world.getBodyPoses();
      expect(midPoses.size).toBe(volume.books.length);
      let midMeanY = 0;
      for (const p of midPoses.values()) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(sc.w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(sc.h - 72);
        midMeanY += p.y;
      }
      midMeanY /= midPoses.size;
      expect(midMeanY).toBeGreaterThan(preMeanY);

      // 정지까지 시뮬레이션
      for (let f = 0; f < 220 && !world.isSpillSettled(); f += 1) {
        world.step(16.67);
      }
      expect(world.isSpillSettled()).toBe(true);

      const settled = world.getBodyPoses();
      expect(settled.size).toBe(volume.books.length);

      let settledMeanY = 0;
      let exitedUpperShelfCount = 0;
      const upperCutoffY = layout.frameRect.y + layout.frameRect.h * 0.75;
      for (const p of settled.values()) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(sc.w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(sc.h - 72);
        settledMeanY += p.y;

        const insideUpperFrame =
          p.x >= layout.frameRect.x &&
          p.x <= layout.frameRect.x + layout.frameRect.w &&
          p.y < upperCutoffY;
        if (!insideUpperFrame) {
          exitedUpperShelfCount += 1;
        }
      }

      settledMeanY /= settled.size;
      expect(settledMeanY).toBeGreaterThan(preMeanY);
      expect(exitedUpperShelfCount / settled.size).toBeGreaterThanOrEqual(0.75);

      world.dispose();
    }
  });

  it('detaches a grabbed book via removeBody mid-spill and supports synchronous fastForwardSpill', () => {
    const { volume, layout, spawns } = createSpawnList(1440, 900, '3x3');
    const world = new ChaosWorld(layout.innerRect);
    world.spawnFromPoses(spawns);
    world.applyShakeImpulse(11, -6);
    world.step(16.67);

    world.openDoorAndSpill(1440, 900, layout.frameRect, layout.isDesktop);
    for (let f = 0; f < 10; f += 1) {
      world.step(16.67);
    }

    const pickedId = volume.books[0].id;
    expect(world.hasBody(pickedId)).toBe(true);
    expect(world.removeBody(pickedId)).toBe(true);
    expect(world.hasBody(pickedId)).toBe(false);
    expect(world.getRemainingCount()).toBe(volume.books.length - 1);
    expect(world.getBodyPoses().has(pickedId)).toBe(false);

    world.fastForwardSpill(120);
    expect(world.isSpillSettled()).toBe(true);
    world.dispose();
  });

  it('drops a released book from mid-air onto resting desk piles under gravity while leaving distant sleeping books undisturbed', () => {
    const { layout, spawns } = createSpawnList(1440, 900, '3x3');
    const restingTarget = {
      ...spawns[1],
      centerX: 1220,
      centerY: 760,
      angleRad: 0.25,
    };
    const leftFloorBook = {
      ...spawns[2],
      centerX: 210,
      centerY: 760,
      angleRad: -1.4,
    };
    const droppedBook = {
      ...spawns[0],
      centerX: 210,
      centerY: 140,
      angleRad: 0,
    };

    const world = new ChaosWorld(layout.innerRect);
    world.enterDeskDropMode(1440, 900, [restingTarget, leftFloorBook]);
    world.addDroppedBody(droppedBook, 0, 0);

    for (let f = 0; f < 220 && !world.isSpillSettled(); f += 1) {
      world.step(16.67);
    }

    expect(world.isSpillSettled()).toBe(true);
    const finalPoses = world.getBodyPoses();
    const droppedPose = finalPoses.get(droppedBook.bookId)!;
    const distantPose = finalPoses.get(restingTarget.bookId)!;

    expect(droppedPose.y).toBeGreaterThan(550);
    expect(droppedPose.x).toBeGreaterThanOrEqual(0);
    expect(droppedPose.x).toBeLessThanOrEqual(1440);
    expect(droppedPose.y).toBeLessThanOrEqual(900 - 72);
    expect(distantPose.x).toBeCloseTo(1220, 4);
    expect(distantPose.y).toBeCloseTo(760, 4);

    world.dispose();
  });

  it('transitions a late mid-spill drop cleanly into full-gravity desk_drop', () => {
    const { layout, spawns } = createSpawnList(1440, 900, '3x3');
    const world = new ChaosWorld(layout.innerRect);
    world.spawnFromPoses(spawns);
    world.applyShakeImpulse(11, -6);
    world.step(16.67);

    world.openDoorAndSpill(1440, 900, layout.frameRect, layout.isDesktop);
    for (let f = 0; f < 66; f += 1) {
      world.step(16.67);
    }

    const picked = spawns[0];
    world.removeBody(picked.bookId);
    world.addDroppedBody(
      {
        ...picked,
        centerX: 210,
        centerY: 140,
        angleRad: 0,
      },
      0,
      0
    );

    for (let f = 0; f < 220 && !world.isSpillSettled(); f += 1) {
      world.step(16.67);
    }

    expect(world.isSpillSettled()).toBe(true);
    const droppedPose = world.getBodyPoses().get(picked.bookId)!;
    expect(droppedPose.y).toBeGreaterThan(500);
    expect(droppedPose.x).toBeGreaterThanOrEqual(0);
    expect(droppedPose.x).toBeLessThanOrEqual(1440);
    expect(droppedPose.y).toBeLessThanOrEqual(900 - 72);

    world.dispose();
  });
});

describe('ChaosWorld direct grab non-inertial shaking & progressive dislodge', () => {
  it('keeps books seated below threshold, dislodges progressively on shake, and contains bodies in innerRect', () => {
    const { volume, layout, spawns } = createSpawnList(1440, 900, '3x3');
    const world = new ChaosWorld(layout.innerRect);
    world.spawnSeatedPoses(spawns);

    expect(world.getSeatedCount()).toBe(volume.books.length);
    expect(world.getDislodgedCount()).toBe(0);

    // 1. 임계치 이하 약한 이동: 전원 고정 유지
    for (let f = 0; f < 10; f += 1) {
      world.applyFrameShakeMotion(300, 100, 120, 40, 0.015, 1 / 60);
      world.step(16.67);
    }
    expect(world.getSeatedCount()).toBe(volume.books.length);
    expect(world.getDislodgedCount()).toBe(0);

    // 2. 중간 흔들기: 일부 책만 점진 이탈
    for (let f = 0; f < 10; f += 1) {
      const sign = f % 2 === 0 ? 1 : -1;
      world.applyFrameShakeMotion(sign * 9500, -1200, sign * 900, -100, sign * 0.06, 1 / 60);
      world.step(16.67);
    }
    const midDislodged = world.getDislodgedCount();
    expect(midDislodged).toBeGreaterThan(0);
    expect(midDislodged).toBeLessThan(volume.books.length);
    expect(world.getSeatedCount() + midDislodged).toBe(volume.books.length);

    // 3. 지속 강한 흔들기: 모든 활성 강체가 innerRect 내부에 유지
    for (let f = 0; f < 50; f += 1) {
      const sign = f % 4 < 2 ? 1 : -1;
      world.applyFrameShakeMotion(sign * 13000, -1800, sign * 1100, -150, sign * 0.09, 1 / 60);
      world.step(16.67);
    }
    expect(world.getDislodgedCount()).toBeGreaterThan(midDislodged);
    for (const p of world.getBodyPoses().values()) {
      expect(p.x).toBeGreaterThanOrEqual(layout.innerRect.x);
      expect(p.x).toBeLessThanOrEqual(layout.innerRect.x + layout.innerRect.w);
      expect(p.y).toBeGreaterThanOrEqual(layout.innerRect.y);
      expect(p.y).toBeLessThanOrEqual(layout.innerRect.y + layout.innerRect.h);
    }

    world.dispose();
  });

  it('applies opposite inertial force (-a) and tilt gravity projection to active bodies', () => {
    const { layout, spawns } = createSpawnList(1440, 900, '3x3');
    const centerBook = {
      ...spawns[16],
      centerX: layout.innerRect.x + layout.innerRect.w * 0.5,
      centerY: layout.innerRect.y + layout.innerRect.h * 0.45,
      angleRad: 0,
    };

    // 1. +x 가속 시 -x 관성력 확인
    const worldInertial = new ChaosWorld(layout.innerRect);
    worldInertial.spawnFromPoses([centerBook]);
    const startX = worldInertial.getBodyPoses().get(centerBook.bookId)!.x;
    for (let f = 0; f < 10; f += 1) {
      worldInertial.applyFrameShakeMotion(15000, 0, 0, 0, 0, 1 / 60);
      worldInertial.step(16.67);
    }
    const endXInertial = worldInertial.getBodyPoses().get(centerBook.bookId)!.x;
    expect(endXInertial).toBeLessThan(startX);
    worldInertial.dispose();

    // 2. +기울기 적용 시 +x 중력 성분 확인
    const worldTilt = new ChaosWorld(layout.innerRect);
    worldTilt.spawnFromPoses([centerBook]);
    for (let f = 0; f < 15; f += 1) {
      worldTilt.applyFrameShakeMotion(0, 0, 0, 0, 0.12, 1 / 60);
      worldTilt.step(16.67);
    }
    const endXTilt = worldTilt.getBodyPoses().get(centerBook.bookId)!.x;
    expect(endXTilt).toBeGreaterThan(startX);
    worldTilt.dispose();
  });

  it('spills only dislodged subset on partial openDoorAndSpill and releases all on releaseAllSeatedBodies', () => {
    const { volume, layout, spawns } = createSpawnList(1440, 900, '3x3');

    // 부분 이탈 후 문 열기
    const partialWorld = new ChaosWorld(layout.innerRect);
    partialWorld.spawnSeatedPoses(spawns);
    for (let f = 0; f < 8; f += 1) {
      partialWorld.applyFrameShakeMotion(10500, -1400, 900, -100, 0.07, 1 / 60);
      partialWorld.step(16.67);
    }
    const dislodgedCount = partialWorld.getDislodgedCount();
    expect(dislodgedCount).toBeGreaterThan(0);
    expect(dislodgedCount).toBeLessThan(volume.books.length);

    partialWorld.openDoorAndSpill(1440, 900, layout.frameRect, layout.isDesktop);
    expect(partialWorld.getSeatedCount()).toBe(0);
    expect(partialWorld.getRemainingCount()).toBe(dislodgedCount);

    for (let f = 0; f < 220 && !partialWorld.isSpillSettled(); f += 1) {
      partialWorld.step(16.67);
    }
    expect(partialWorld.isSpillSettled()).toBe(true);
    for (const p of partialWorld.getBodyPoses().values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1440);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(900 - 72);
    }
    partialWorld.dispose();

    // 일괄 해제 검증
    const fullWorld = new ChaosWorld(layout.innerRect);
    fullWorld.spawnSeatedPoses(spawns);
    expect(fullWorld.getSeatedCount()).toBe(volume.books.length);
    expect(fullWorld.getDislodgedCount()).toBe(0);
    fullWorld.releaseAllSeatedBodies();
    expect(fullWorld.getSeatedCount()).toBe(0);
    expect(fullWorld.getDislodgedCount()).toBe(volume.books.length);
    fullWorld.dispose();
  });
});
