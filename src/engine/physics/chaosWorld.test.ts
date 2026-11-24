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
