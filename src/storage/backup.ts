import {
  BOOK_COLOR_IDS,
  RITUAL_NOTE_MAX_LENGTH,
  RITUAL_PROMPT_TYPES,
  SPINE_MOTIFS,
} from '../modules/bookshelf/data/bookPalette';
import { DESK_THEMES } from '../shared/theme/deskThemes';
import type {
  BackupPayloadV1,
  BookColorId,
  BookHeightTier,
  BookModel,
  BookThicknessTier,
  DeskThemeId,
  RitualNote,
  RitualPromptType,
  ShelfGridPreset,
  ShelfSlotPlacement,
  ShelfVolume,
  SpineMotif,
  UserPreferences,
} from '../types/contracts';

export interface BackupSummary {
  readonly volumeCount: number;
  readonly totalBookCount: number;
  readonly writtenCount: number;
  readonly exportedAt: string;
}

export type BackupValidationResult =
  | {
      readonly ok: true;
      readonly payload: BackupPayloadV1;
      readonly summary: BackupSummary;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

const VALID_COLORS = new Set<string>(BOOK_COLOR_IDS);
const VALID_MOTIFS = new Set<string>(SPINE_MOTIFS);
const VALID_PROMPTS = new Set<string>(RITUAL_PROMPT_TYPES);
const VALID_THEMES = new Set<string>(Object.keys(DESK_THEMES));

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePlacement(
  raw: unknown,
  compartmentCount: number
): ShelfSlotPlacement | null | undefined {
  if (raw === null) return null;
  if (!isPlainRecord(raw)) return undefined;

  const { compartmentIndex, orderInCompartment, normX, fallenDir } = raw;
  if (
    typeof compartmentIndex !== 'number' ||
    !Number.isInteger(compartmentIndex) ||
    compartmentIndex < 0 ||
    compartmentIndex >= compartmentCount
  ) {
    return undefined;
  }
  if (
    typeof orderInCompartment !== 'number' ||
    !Number.isInteger(orderInCompartment) ||
    orderInCompartment < 0
  ) {
    return undefined;
  }
  if (normX !== undefined && !isFiniteNumber(normX)) {
    return undefined;
  }
  if (fallenDir !== undefined && fallenDir !== -1 && fallenDir !== 1) {
    return undefined;
  }

  return {
    compartmentIndex,
    orderInCompartment,
    ...(normX !== undefined ? { normX } : {}),
    ...(fallenDir !== undefined ? { fallenDir } : {}),
  };
}

function validateNote(raw: unknown): RitualNote | null | undefined {
  if (raw === null) return null;
  if (!isPlainRecord(raw)) return undefined;

  const { promptType, promptText, content, createdAt, updatedAt } = raw;
  if (typeof promptType !== 'string' || !VALID_PROMPTS.has(promptType)) {
    return undefined;
  }
  if (typeof promptText !== 'string' || promptText.trim().length === 0) {
    return undefined;
  }
  if (typeof content !== 'string' || content.length > RITUAL_NOTE_MAX_LENGTH) {
    return undefined;
  }
  if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
    return undefined;
  }

  return {
    promptType: promptType as RitualPromptType,
    promptText,
    content,
    createdAt,
    updatedAt,
  };
}

function validateBook(raw: unknown, compartmentCount: number): BookModel | null {
  if (!isPlainRecord(raw)) return null;

  const {
    id,
    seed,
    colorId,
    colorOrderIndex,
    heightTier,
    thicknessTier,
    motif,
    defaultPromptType,
    placement,
    note,
  } = raw;

  if (typeof id !== 'string' || id.trim().length === 0) return null;
  if (!isFiniteNumber(seed)) return null;
  if (typeof colorId !== 'string' || !VALID_COLORS.has(colorId)) return null;
  if (
    typeof colorOrderIndex !== 'number' ||
    !Number.isInteger(colorOrderIndex) ||
    colorOrderIndex < 0 ||
    colorOrderIndex > 8
  ) {
    return null;
  }
  if (
    typeof heightTier !== 'number' ||
    !Number.isInteger(heightTier) ||
    heightTier < 0 ||
    heightTier > 3
  ) {
    return null;
  }
  if (
    typeof thicknessTier !== 'number' ||
    !Number.isInteger(thicknessTier) ||
    thicknessTier < 0 ||
    thicknessTier > 2
  ) {
    return null;
  }
  if (typeof motif !== 'string' || !VALID_MOTIFS.has(motif)) return null;
  if (typeof defaultPromptType !== 'string' || !VALID_PROMPTS.has(defaultPromptType)) {
    return null;
  }

  const parsedPlacement = validatePlacement(placement, compartmentCount);
  if (parsedPlacement === undefined) return null;

  const parsedNote = validateNote(note);
  if (parsedNote === undefined) return null;

  return {
    id,
    seed,
    colorId: colorId as BookColorId,
    colorOrderIndex,
    heightTier: heightTier as BookHeightTier,
    thicknessTier: thicknessTier as BookThicknessTier,
    motif: motif as SpineMotif,
    defaultPromptType: defaultPromptType as RitualPromptType,
    placement: parsedPlacement,
    note: parsedNote,
  };
}

function validateVolume(raw: unknown): { volume: ShelfVolume } | { error: string } {
  if (!isPlainRecord(raw)) {
    return { error: '서가 항목 형식이 올바르지 않아요.' };
  }

  const { id, volumeNumber, gridPreset, gridCols, gridRows, title, createdAt, updatedAt, books } =
    raw;

  if (typeof id !== 'string' || id.trim().length === 0) {
    return { error: '서가 ID가 비어 있어요.' };
  }
  if (typeof volumeNumber !== 'number' || !Number.isInteger(volumeNumber) || volumeNumber < 1) {
    return { error: `서가(${id}) 번호가 올바르지 않아요.` };
  }
  if (gridPreset !== '3x3' && gridPreset !== '5x3') {
    return { error: `지원하지 않는 책장 크기(${String(gridPreset)})예요.` };
  }
  const expectedCols = gridPreset === '5x3' ? 5 : 3;
  const expectedRows = 3;
  if (gridCols !== expectedCols || gridRows !== expectedRows) {
    return { error: `서가(${id})의 칸 크기가 ${gridPreset} 규칙과 맞지 않아요.` };
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { error: `서가(${id}) 이름이 비어 있어요.` };
  }
  if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
    return { error: `서가(${id})의 날짜 형식이 올바르지 않아요.` };
  }

  const expectedBooks = expectedCols * expectedRows * 4;
  if (!Array.isArray(books) || books.length !== expectedBooks) {
    return {
      error: `서가(${id})의 책 권수가 ${expectedBooks}권이 아니에요.`,
    };
  }

  const seenBookIds = new Set<string>();
  const parsedBooks: BookModel[] = [];
  const compCount = expectedCols * expectedRows;
  for (const rawBook of books) {
    const parsed = validateBook(rawBook, compCount);
    if (!parsed) {
      return { error: `서가(${id}) 안의 책 데이터 형식이 맞지 않아요.` };
    }
    if (seenBookIds.has(parsed.id)) {
      return { error: `서가(${id}) 안에 중복된 책 ID(${parsed.id})가 있어요.` };
    }
    seenBookIds.add(parsed.id);
    parsedBooks.push(parsed);
  }

  return {
    volume: {
      id,
      volumeNumber,
      gridPreset: gridPreset as ShelfGridPreset,
      gridCols: expectedCols,
      gridRows: expectedRows,
      title,
      createdAt,
      updatedAt,
      books: parsedBooks,
    },
  };
}

function validatePreferences(raw: unknown): UserPreferences | null {
  if (!isPlainRecord(raw)) return null;
  const {
    id,
    theme,
    activeVolumeId,
    lastActiveModuleId,
    openRandomOnVisit,
    audioEnabled,
    motionShakeEnabled,
    hintsSeen,
    tuning,
  } = raw;

  if (id !== 'singleton') return null;
  if (typeof theme !== 'string' || !VALID_THEMES.has(theme)) return null;
  if (typeof activeVolumeId !== 'string' || activeVolumeId.trim().length === 0) return null;
  if (typeof lastActiveModuleId !== 'string' || lastActiveModuleId.trim().length === 0) {
    return null;
  }
  if (
    typeof openRandomOnVisit !== 'boolean' ||
    typeof audioEnabled !== 'boolean' ||
    typeof motionShakeEnabled !== 'boolean'
  ) {
    return null;
  }
  if (!isPlainRecord(hintsSeen)) return null;
  if (
    typeof hintsSeen.shakeOrUnlatch !== 'boolean' ||
    typeof hintsSeen.dragOrTapBook !== 'boolean' ||
    typeof hintsSeen.closeLatch !== 'boolean'
  ) {
    return null;
  }
  if (!isPlainRecord(tuning)) return null;
  if (
    !isFiniteNumber(tuning.grainStrength) ||
    !isFiniteNumber(tuning.edgeJitterPx) ||
    !isFiniteNumber(tuning.shadowOffsetPx)
  ) {
    return null;
  }

  return {
    id: 'singleton',
    theme: theme as DeskThemeId,
    activeVolumeId,
    lastActiveModuleId,
    openRandomOnVisit,
    audioEnabled,
    motionShakeEnabled,
    hintsSeen: {
      shakeOrUnlatch: hintsSeen.shakeOrUnlatch,
      dragOrTapBook: hintsSeen.dragOrTapBook,
      closeLatch: hintsSeen.closeLatch,
    },
    tuning: {
      grainStrength: tuning.grainStrength,
      edgeJitterPx: tuning.edgeJitterPx,
      shadowOffsetPx: tuning.shadowOffsetPx,
    },
  };
}

export function createBackupPayload(
  preferences: UserPreferences,
  volumes: readonly ShelfVolume[],
  exportedAtIso = new Date().toISOString()
): BackupPayloadV1 {
  return {
    app: 'biueo',
    schemaVersion: 1,
    exportedAt: exportedAtIso,
    preferences: {
      ...preferences,
      hintsSeen: { ...preferences.hintsSeen },
      tuning: { ...preferences.tuning },
    },
    volumes: volumes.map((vol) => ({
      ...vol,
      books: vol.books.map((b) => ({
        ...b,
        placement: b.placement ? { ...b.placement } : null,
        note: b.note ? { ...b.note } : null,
      })),
    })),
  };
}

export function serializeBackup(payload: BackupPayloadV1): string {
  return JSON.stringify(payload, null, 2);
}

export function triggerBackupDownload(payload: BackupPayloadV1): string {
  const datePart = payload.exportedAt.slice(0, 10);
  const filename = `biueo-backup-${datePart}.json`;
  const json = serializeBackup(payload);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}

export function validateBackupPayload(raw: unknown): BackupValidationResult {
  if (!isPlainRecord(raw)) {
    return { ok: false, error: '올바른 JSON 백업 객체가 아니에요.' };
  }
  if (raw.app !== 'biueo') {
    return { ok: false, error: '비우어 백업 파일(app: "biueo")이 아니에요.' };
  }
  if (raw.schemaVersion !== 1) {
    return { ok: false, error: `지원하지 않는 백업 버전(${String(raw.schemaVersion)})이에요.` };
  }
  if (!isValidIsoTimestamp(raw.exportedAt)) {
    return { ok: false, error: '백업 생성 날짜 형식이 올바르지 않아요.' };
  }

  const preferences = validatePreferences(raw.preferences);
  if (!preferences) {
    return { ok: false, error: '백업의 화면 설정 정보가 손상되었어요.' };
  }

  if (!Array.isArray(raw.volumes) || raw.volumes.length === 0) {
    return { ok: false, error: '백업 파일 안에 서가 데이터가 비어 있어요.' };
  }

  const volumes: ShelfVolume[] = [];
  const seenVolumeIds = new Set<string>();
  let totalBookCount = 0;
  let writtenCount = 0;

  for (const rawVol of raw.volumes) {
    const res = validateVolume(rawVol);
    if ('error' in res) {
      return { ok: false, error: res.error };
    }
    if (seenVolumeIds.has(res.volume.id)) {
      return { ok: false, error: `중복된 서가 ID(${res.volume.id})가 들어 있어요.` };
    }
    seenVolumeIds.add(res.volume.id);
    volumes.push(res.volume);
    totalBookCount += res.volume.books.length;
    writtenCount += res.volume.books.filter((b) => b.note !== null).length;
  }

  if (!seenVolumeIds.has(preferences.activeVolumeId)) {
    return {
      ok: false,
      error: '선택된 기본 서가 ID가 백업 목록에 존재하지 않아요.',
    };
  }

  return {
    ok: true,
    payload: {
      app: 'biueo',
      schemaVersion: 1,
      exportedAt: raw.exportedAt,
      preferences,
      volumes,
    },
    summary: {
      volumeCount: volumes.length,
      totalBookCount,
      writtenCount,
      exportedAt: raw.exportedAt,
    },
  };
}
