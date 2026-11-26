import type {
  BookColorId,
  BookHeightTier,
  BookModel,
  BookThicknessTier,
  DeskThemeId,
  ShelfGridPreset,
  ShelfVolume,
  UserPreferences,
  VisualTuningParams,
} from '../../../types/contracts';
import {
  BOOK_COLOR_IDS,
  BOOK_COLORS,
  BOOK_GAP_RATIO,
  BOOK_THICKNESS_RATIOS,
  COMPARTMENT_SIDE_MARGIN,
  COMPARTMENT_USABLE_WIDTH,
  RITUAL_PROMPT_TYPES,
  SPINE_MOTIFS,
} from './bookPalette';

export const DEFAULT_TUNING: VisualTuningParams = {
  grainStrength: 0.32,
  edgeJitterPx: 0.7,
  shadowOffsetPx: 6,
};

const FIVE_BY_THREE_COLOR_GROUPS: readonly BookColorId[] = [
  'coral',
  'salmon',
  'butter',
  'olive',
  'sage',
  'slate',
  'oat',
  'cream',
  'charcoal',
  'coral',
  'salmon',
  'butter',
  'olive',
  'sage',
  'slate',
];

function seededShuffleIndices(count: number, seed: number): number[] {
  const arr = Array.from({ length: count }, (_, idx) => idx);
  let state = seed >>> 0;
  for (let i = count - 1; i > 0; i -= 1) {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(rand * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function createDefaultVolume(
  volumeNumber = 1,
  gridPreset: ShelfGridPreset = '3x3',
  createdAtIso = new Date().toISOString()
): ShelfVolume {
  const now = createdAtIso;
  const gridCols = gridPreset === '5x3' ? 5 : 3;
  const gridRows = 3;
  const compartmentsCount = gridCols * gridRows;
  const totalBooks = compartmentsCount * 4;
  const colorGroups = gridPreset === '5x3' ? FIVE_BY_THREE_COLOR_GROUPS : BOOK_COLOR_IDS;

  const slotPermutation = seededShuffleIndices(
    totalBooks,
    20261124 + volumeNumber * 97 + gridCols * 13
  );

  const placementByBookIndex = new Array<{ compartmentIndex: number; orderInCompartment: number }>(
    totalBooks
  );
  for (let slot = 0; slot < totalBooks; slot += 1) {
    const bookIdx = slotPermutation[slot];
    placementByBookIndex[bookIdx] = {
      compartmentIndex: Math.floor(slot / 4),
      orderInCompartment: slot % 4,
    };
  }

  const books: BookModel[] = Array.from({ length: totalBooks }, (_, i) => {
    const colorGroup = Math.floor(i / 4);
    const heightInGroup = i % 4;
    const colorId = colorGroups[colorGroup];
    const colorSpec = BOOK_COLORS[colorId];
    const heightTier = heightInGroup as BookHeightTier;
    const thicknessTier = ((i + colorGroup) % 3) as BookThicknessTier;
    const motif = SPINE_MOTIFS[i % SPINE_MOTIFS.length];
    const defaultPromptType =
      RITUAL_PROMPT_TYPES[(colorGroup + heightInGroup) % RITUAL_PROMPT_TYPES.length];
    const seed = 1000 + volumeNumber * 100 + gridCols * 19 + i * 37;

    const paddedIdx = String(i).padStart(2, '0');
    return {
      id: `vol${volumeNumber}-${gridPreset}-book-${paddedIdx}`,
      seed,
      colorId,
      colorOrderIndex: colorSpec.orderIndex,
      heightTier,
      thicknessTier,
      motif,
      defaultPromptType,
      placement: placementByBookIndex[i],
      note: null,
    };
  });

  // 초기 책들이 4권 중 일부가 빠지더라도 남은 책이 가운데로 몰리지 않도록 초기 normX를 부여한다.
  const totalComp = gridCols * gridRows;
  for (let compIdx = 0; compIdx < totalComp; compIdx += 1) {
    const inComp = books
      .filter((b) => b.placement?.compartmentIndex === compIdx)
      .sort(
        (a, b) =>
          (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0)
      );
    const totalNormWidth =
      inComp.reduce((sum, b) => sum + BOOK_THICKNESS_RATIOS[b.thicknessTier], 0) +
      Math.max(0, inComp.length - 1) * BOOK_GAP_RATIO;
    let cursor =
      COMPARTMENT_SIDE_MARGIN + Math.max(0, (COMPARTMENT_USABLE_WIDTH - totalNormWidth) * 0.5);
    for (const book of inComp) {
      if (book.placement) {
        book.placement.normX = cursor;
      }
      cursor += BOOK_THICKNESS_RATIOS[book.thicknessTier] + BOOK_GAP_RATIO;
    }
  }

  return {
    id: `vol-${volumeNumber}-${gridPreset}`,
    volumeNumber,
    gridPreset,
    gridCols,
    gridRows,
    title: `Vol. ${volumeNumber}`,
    createdAt: now,
    updatedAt: now,
    books,
  };
}

/**
 * 메모와 책 메타데이터는 그대로 둔 채, 현재 서가의 책 배치만 초기 기립 상태로 되돌린다.
 */
export function resetVolumePlacements(
  volume: ShelfVolume,
  updatedAtIso = new Date().toISOString()
): ShelfVolume {
  const baseline = createDefaultVolume(volume.volumeNumber, volume.gridPreset, volume.createdAt);
  const placementById = new Map(baseline.books.map((b) => [b.id, b.placement]));

  return {
    ...volume,
    updatedAt: updatedAtIso,
    books: volume.books.map((book, index) => {
      const basePlacement =
        placementById.get(book.id) ?? baseline.books[index]?.placement ?? null;
      return {
        ...book,
        placement: basePlacement ? { ...basePlacement } : null,
        note: book.note ? { ...book.note } : null,
      };
    }),
  };
}

export function createDefaultPreferences(
  activeVolumeId = 'vol-1-3x3',
  theme: DeskThemeId = 'sage'
): UserPreferences {
  return {
    id: 'singleton',
    theme,
    activeVolumeId,
    lastActiveModuleId: 'bookshelf',
    openRandomOnVisit: false,
    audioEnabled: true,
    motionShakeEnabled: false,
    hintsSeen: {
      shakeOrUnlatch: false,
      dragOrTapBook: false,
      closeLatch: false,
    },
    tuning: DEFAULT_TUNING,
  };
}
