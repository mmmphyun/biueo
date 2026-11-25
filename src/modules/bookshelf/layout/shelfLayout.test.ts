import { describe, expect, it } from 'vitest';
import { createDefaultVolume } from '../data/defaultBooks';
import { computeDeskSpillTargets, computeShelfLayout } from './shelfLayout';

describe('computeShelfLayout responsive geometry & 5x3 transpose', () => {
  it('keeps 3x3 and 5x3 compartments inside frameRect on desktop (1440x900) with >=24px minBookWidthPx', () => {
    for (const [cols, rows] of [
      [3, 3],
      [5, 3],
    ]) {
      const layout = computeShelfLayout(1440, 900, cols, rows);
      expect(layout.isDesktop).toBe(true);
      expect(layout.renderCols).toBe(cols);
      expect(layout.renderRows).toBe(rows);
      expect(layout.compartments).toHaveLength(cols * rows);
      expect(layout.minBookWidthPx).toBeGreaterThanOrEqual(24);

      for (const c of layout.compartments) {
        expect(c.x).toBeGreaterThan(layout.frameRect.x);
        expect(c.y).toBeGreaterThan(layout.frameRect.y);
        expect(c.x + c.w).toBeLessThan(layout.frameRect.x + layout.frameRect.w);
        expect(c.y + c.h).toBeLessThan(layout.frameRect.y + layout.frameRect.h);
      }
    }
  });

  it('transposes 5x3 into 3x5 on mobile portrait (390x844) preserving >=16px minBookWidthPx', () => {
    const layout3x3 = computeShelfLayout(390, 844, 3, 3);
    expect(layout3x3.isDesktop).toBe(false);
    expect(layout3x3.renderCols).toBe(3);
    expect(layout3x3.renderRows).toBe(3);
    expect(layout3x3.minBookWidthPx).toBeGreaterThan(16);

    const layout5x3 = computeShelfLayout(390, 844, 5, 3);
    expect(layout5x3.isDesktop).toBe(false);
    expect(layout5x3.renderCols).toBe(3);
    expect(layout5x3.renderRows).toBe(5);
    expect(layout5x3.compartments).toHaveLength(15);
    expect(layout5x3.minBookWidthPx).toBeGreaterThan(16);
    expect(layout5x3.frameRect.y + layout5x3.frameRect.h).toBeLessThan(844 * 0.74);

    for (const c of layout5x3.compartments) {
      expect(c.x).toBeGreaterThan(layout5x3.frameRect.x);
      expect(c.y).toBeGreaterThan(layout5x3.frameRect.y);
      expect(c.x + c.w).toBeLessThan(layout5x3.frameRect.x + layout5x3.frameRect.w);
      expect(c.y + c.h).toBeLessThan(layout5x3.frameRect.y + layout5x3.frameRect.h);
    }
  });

  it('computes bounded desk spill targets for both 36-book and 60-book presets', () => {
    for (const preset of ['3x3', '5x3'] as const) {
      const volume = createDefaultVolume(1, preset);
      for (const [vw, vh] of [
        [1440, 900],
        [390, 844],
      ]) {
        const layout = computeShelfLayout(vw, vh, volume.gridCols, volume.gridRows);
        const spill = computeDeskSpillTargets(volume.books, layout);
        expect(spill.size).toBe(volume.books.length);
        for (const tr of spill.values()) {
          expect(tr.centerX).toBeGreaterThan(0);
          expect(tr.centerX).toBeLessThan(vw);
          expect(tr.centerY).toBeGreaterThan(0);
          expect(tr.centerY).toBeLessThan(vh);
        }
      }
    }
  });
});
