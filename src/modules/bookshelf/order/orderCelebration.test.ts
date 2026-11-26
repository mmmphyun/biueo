import { describe, expect, it } from 'vitest';
import type { DetectedOrder } from '../../../types/contracts';
import {
  createCompartmentSparklePulse,
  createOrderCelebration,
} from './orderCelebration';

describe('createOrderCelebration', () => {
  it('builds Tier 0 cream breath with zero sparkles and 0.45s duration', () => {
    const celebration = createOrderCelebration([], false);
    expect(celebration.tier).toBe(0);
    expect(celebration.sparkles).toHaveLength(0);
    expect(celebration.totalDurationSec).toBe(0.45);
  });

  it('builds Tier 1 with deduplicated compartment indices and 4-5 sparkles per compartment', () => {
    const orders: DetectedOrder[] = [
      { kind: 'hue', scope: 'compartment', targetIndices: [4, 1] },
      { kind: 'motif', scope: 'compartment', targetIndices: [1] },
    ];
    const celebration = createOrderCelebration(orders, false);
    expect(celebration.tier).toBe(1);
    expect(celebration.compartmentIndices).toEqual([1, 4]);
    expect(celebration.sparkles).toHaveLength(10);
    expect(celebration.totalDurationSec).toBe(1.05);
  });

  it('builds refined top-tier Tier 2 row and Tier 3 shelf celebrations without redundant lower sparkles', () => {
    const rowOrders: DetectedOrder[] = [
      { kind: 'hue', scope: 'compartment', targetIndices: [0, 1, 2] },
      { kind: 'hue', scope: 'row', targetIndices: [2, 0] },
    ];
    const rowCel = createOrderCelebration(rowOrders, false);
    expect(rowCel.tier).toBe(2);
    expect(rowCel.rowIndices).toEqual([0, 2]);
    expect(rowCel.sparkles).toHaveLength(8);
    expect(rowCel.sparkles.every((s) => s.scope === 'row')).toBe(true);

    const rowReduced = createOrderCelebration(rowOrders, true);
    expect(rowReduced.totalDurationSec).toBe(0.6);
    expect(rowReduced.sparkles.every((s) => s.driftPx === 0)).toBe(true);

    const mixedRowOrders: DetectedOrder[] = [
      { kind: 'hue', scope: 'compartment', targetIndices: [0, 1, 2, 4, 7] },
      { kind: 'hue', scope: 'row', targetIndices: [0] },
    ];
    const mixedRowCel = createOrderCelebration(mixedRowOrders, false, 3);
    expect(mixedRowCel.tier).toBe(2);
    expect(mixedRowCel.extraCompartmentIndices).toEqual([4, 7]);
    expect(mixedRowCel.sparkles.filter((s) => s.scope === 'row')).toHaveLength(4);
    expect(mixedRowCel.sparkles.filter((s) => s.scope === 'compartment')).toHaveLength(6);
    expect(
      mixedRowCel.sparkles
        .filter((s) => s.scope === 'compartment')
        .map((s) => s.compartmentIndex)
    ).toEqual([4, 4, 4, 7, 7, 7]);

    const shelfOrders: DetectedOrder[] = [
      { kind: 'hue', scope: 'compartment', targetIndices: [0, 1, 2] },
      { kind: 'hue', scope: 'row', targetIndices: [0] },
      { kind: 'height', scope: 'shelf', targetIndices: [0] },
    ];
    const shelfCel = createOrderCelebration(shelfOrders, false);
    expect(shelfCel.tier).toBe(3);
    expect(shelfCel.sparkles).toHaveLength(16);
    expect(shelfCel.sparkles.every((s) => s.scope === 'shelf')).toBe(true);
    expect(shelfCel.totalDurationSec).toBe(1.45);

    const shelfReduced = createOrderCelebration(shelfOrders, true);
    expect(shelfReduced.totalDurationSec).toBe(0.65);
    expect(shelfReduced.sparkles.every((s) => s.driftPx === 0)).toBe(true);
  });

  it('creates lightweight live compartment sparkle pulse respecting reducedMotion', () => {
    const pulse = createCompartmentSparklePulse(4, false);
    expect(pulse.compartmentIndex).toBe(4);
    expect(pulse.sparkles).toHaveLength(4);
    expect(pulse.totalDurationSec).toBe(0.68);
    expect(pulse.sparkles.every((s) => s.scope === 'compartment' && s.compartmentIndex === 4)).toBe(true);

    const reducedPulse = createCompartmentSparklePulse(4, true);
    expect(reducedPulse.totalDurationSec).toBe(0.42);
    expect(reducedPulse.sparkles.every((s) => s.driftPx === 0)).toBe(true);
  });
});
