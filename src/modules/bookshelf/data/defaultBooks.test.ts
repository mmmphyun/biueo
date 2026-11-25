import { describe, expect, it } from 'vitest';
import { createDefaultVolume } from './defaultBooks';
import {
  BOOK_COLOR_IDS,
  BOOK_GAP_RATIO,
  BOOK_THICKNESS_RATIOS,
  COMPARTMENT_USABLE_WIDTH,
  getBookRitualPrompt,
  RITUAL_PROMPT_POOL,
  RITUAL_PROMPT_TYPES,
  SPINE_MOTIFS,
} from './bookPalette';
import { samplePeriodicFbm } from '../../../shared/canvas/paperNoise';

describe('createDefaultVolume combinatorial invariants', () => {
  it('constructs 36 books (3x3) with balanced colors, heights, thicknesses, motifs, and prompts', () => {
    const volume = createDefaultVolume(1, '3x3');
    expect(volume.gridCols).toBe(3);
    expect(volume.gridRows).toBe(3);
    expect(volume.books).toHaveLength(36);

    const uniqueIds = new Set(volume.books.map((b) => b.id));
    expect(uniqueIds.size).toBe(36);

    const colorCounts = new Map<string, number>();
    const heightCounts = new Map<number, number>();
    const thicknessCounts = new Map<number, number>();
    const motifCounts = new Map<string, number>();
    const promptCounts = new Map<string, number>();
    const compCounts = new Map<number, number>();

    let noteCount = 0;
    for (const book of volume.books) {
      colorCounts.set(book.colorId, (colorCounts.get(book.colorId) ?? 0) + 1);
      heightCounts.set(book.heightTier, (heightCounts.get(book.heightTier) ?? 0) + 1);
      thicknessCounts.set(book.thicknessTier, (thicknessCounts.get(book.thicknessTier) ?? 0) + 1);
      motifCounts.set(book.motif, (motifCounts.get(book.motif) ?? 0) + 1);
      promptCounts.set(book.defaultPromptType, (promptCounts.get(book.defaultPromptType) ?? 0) + 1);

      expect(book.placement).not.toBeNull();
      if (book.placement) {
        compCounts.set(
          book.placement.compartmentIndex,
          (compCounts.get(book.placement.compartmentIndex) ?? 0) + 1
        );
      }
      if (book.note !== null) noteCount += 1;
    }

    for (const colorId of BOOK_COLOR_IDS) expect(colorCounts.get(colorId)).toBe(4);
    for (const tier of [0, 1, 2, 3]) expect(heightCounts.get(tier)).toBe(9);
    for (const tier of [0, 1, 2]) expect(thicknessCounts.get(tier)).toBe(12);
    for (const motif of SPINE_MOTIFS) expect(motifCounts.get(motif)).toBe(6);
    for (const prompt of RITUAL_PROMPT_TYPES) expect(promptCounts.get(prompt)).toBe(9);
    for (let c = 0; c < 9; c += 1) expect(compCounts.get(c)).toBe(4);
    expect(noteCount).toBe(0);
  });

  it('constructs 60 books (5x3) with balanced 15 compartments, heights, thicknesses, motifs, and prompts', () => {
    const volume = createDefaultVolume(1, '5x3');
    expect(volume.gridCols).toBe(5);
    expect(volume.gridRows).toBe(3);
    expect(volume.books).toHaveLength(60);

    const uniqueIds = new Set(volume.books.map((b) => b.id));
    expect(uniqueIds.size).toBe(60);

    const colorCounts = new Map<string, number>();
    const heightCounts = new Map<number, number>();
    const thicknessCounts = new Map<number, number>();
    const motifCounts = new Map<string, number>();
    const promptCounts = new Map<string, number>();
    const compCounts = new Map<number, number>();

    let noteCount = 0;
    for (const book of volume.books) {
      colorCounts.set(book.colorId, (colorCounts.get(book.colorId) ?? 0) + 1);
      heightCounts.set(book.heightTier, (heightCounts.get(book.heightTier) ?? 0) + 1);
      thicknessCounts.set(book.thicknessTier, (thicknessCounts.get(book.thicknessTier) ?? 0) + 1);
      motifCounts.set(book.motif, (motifCounts.get(book.motif) ?? 0) + 1);
      promptCounts.set(book.defaultPromptType, (promptCounts.get(book.defaultPromptType) ?? 0) + 1);
      if (book.placement) {
        compCounts.set(
          book.placement.compartmentIndex,
          (compCounts.get(book.placement.compartmentIndex) ?? 0) + 1
        );
      }
      if (book.note !== null) noteCount += 1;
    }

    for (const c of ['coral', 'salmon', 'butter', 'olive', 'sage', 'slate']) {
      expect(colorCounts.get(c)).toBe(8);
    }
    for (const c of ['oat', 'cream', 'charcoal']) {
      expect(colorCounts.get(c)).toBe(4);
    }
    for (const tier of [0, 1, 2, 3]) expect(heightCounts.get(tier)).toBe(15);
    for (const tier of [0, 1, 2]) expect(thicknessCounts.get(tier)).toBe(20);
    for (const motif of SPINE_MOTIFS) expect(motifCounts.get(motif)).toBe(10);
    for (const prompt of RITUAL_PROMPT_TYPES) expect(promptCounts.get(prompt)).toBe(15);
    for (let c = 0; c < 15; c += 1) expect(compCounts.get(c)).toBe(4);
    expect(noteCount).toBe(0);
  });

  it('guarantees zero compartment overflow and >10% global width slack for both 3x3 and 5x3', () => {
    const worstCaseFourThick = 4 * BOOK_THICKNESS_RATIOS[2] + 3 * BOOK_GAP_RATIO;
    expect(worstCaseFourThick).toBeLessThanOrEqual(COMPARTMENT_USABLE_WIDTH);

    for (const preset of ['3x3', '5x3'] as const) {
      const volume = createDefaultVolume(1, preset);
      const totalBookWidth = volume.books.reduce(
        (sum, b) => sum + BOOK_THICKNESS_RATIOS[b.thicknessTier],
        0
      );
      const compCount = volume.gridCols * volume.gridRows;
      const totalUsableMinusMinGaps = compCount * (COMPARTMENT_USABLE_WIDTH - 3 * BOOK_GAP_RATIO);
      const slackRatio = (totalUsableMinusMinGaps - totalBookWidth) / totalUsableMinusMinGaps;
      expect(slackRatio).toBeGreaterThan(0.1);
    }
  });

  it('provides 16 distinct seeded ritual prompts across 4 axes with deterministic book assignment', () => {
    const allTexts = new Set<string>();
    for (const axis of RITUAL_PROMPT_TYPES) {
      const entries = RITUAL_PROMPT_POOL[axis];
      expect(entries).toHaveLength(4);
      for (const entry of entries) {
        allTexts.add(entry.promptText);
      }
    }
    expect(allTexts.size).toBe(16);

    const vol3x3 = createDefaultVolume(1, '3x3');
    const used3x3 = new Set(vol3x3.books.map((b) => getBookRitualPrompt(b).promptText));
    expect(used3x3.size).toBeGreaterThanOrEqual(14);
    for (const book of vol3x3.books) {
      expect(getBookRitualPrompt(book).promptText).toBe(getBookRitualPrompt(book).promptText);
      if (book.note) {
        expect(book.note.promptText).toBe(getBookRitualPrompt(book).promptText);
      }
    }

    const vol5x3 = createDefaultVolume(1, '5x3');
    const used5x3 = new Set(vol5x3.books.map((b) => getBookRitualPrompt(b).promptText));
    expect(used5x3.size).toBe(16);
  });
});

describe('samplePeriodicFbm noise generator', () => {
  it('returns finite values in [0, 1] and wraps seamlessly at tile boundaries', () => {
    for (const ny of [0, 0.25, 0.5, 0.75]) {
      const left = samplePeriodicFbm(0, ny, 16, 1337);
      const right = samplePeriodicFbm(1, ny, 16, 1337);
      expect(Number.isFinite(left)).toBe(true);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(1);
      expect(left).toBeCloseTo(right, 8);
    }

    for (const nx of [0, 0.33, 0.66]) {
      const top = samplePeriodicFbm(nx, 0, 16, 1337);
      const bottom = samplePeriodicFbm(nx, 1, 16, 1337);
      expect(top).toBeCloseTo(bottom, 8);
    }
  });
});
