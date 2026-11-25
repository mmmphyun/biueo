import { describe, expect, it } from 'vitest';
import {
  createDefaultPreferences,
  createDefaultVolume,
} from '../modules/bookshelf/data/defaultBooks';
import {
  createBackupPayload,
  serializeBackup,
  validateBackupPayload,
} from './backup';

describe('JSON Backup v1 validation & roundtrip', () => {
  it('validates and summarizes a multi-volume (3x3 + 5x3) roundtrip payload', () => {
    const vol1 = createDefaultVolume(1, '3x3', '2026-11-26T00:00:00.000Z');
    const vol2 = createDefaultVolume(2, '5x3', '2026-11-26T00:05:00.000Z');

    vol1.books[0] = {
      ...vol1.books[0],
      note: {
        promptType: vol1.books[0].defaultPromptType,
        promptText: '테스트 질문',
        content: '차분하게 한 줄을 적었어요.',
        createdAt: '2026-11-26T00:01:00.000Z',
        updatedAt: '2026-11-26T00:01:00.000Z',
      },
    };
    vol2.books[4] = {
      ...vol2.books[4],
      placement: null,
      note: {
        promptType: vol2.books[4].defaultPromptType,
        promptText: '두 번째 질문',
        content: '창밖을 잠시 바라보았어요.',
        createdAt: '2026-11-26T00:06:00.000Z',
        updatedAt: '2026-11-26T00:06:00.000Z',
      },
    };

    const prefs = createDefaultPreferences(vol2.id, 'pine');
    const payload = createBackupPayload(prefs, [vol1, vol2], '2026-11-26T01:00:00.000Z');
    const parsed = JSON.parse(serializeBackup(payload)) as unknown;

    const result = validateBackupPayload(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.volumeCount).toBe(2);
      expect(result.summary.totalBookCount).toBe(96);
      expect(result.summary.writtenCount).toBe(2);
      expect(result.payload.preferences.activeVolumeId).toBe(vol2.id);
      expect(result.payload.volumes[1].books[4].placement).toBeNull();
    }
  });

  it('rejects wrong app identifier or unsupported schemaVersion', () => {
    const vol = createDefaultVolume(1, '3x3', '2026-11-26T00:00:00.000Z');
    const payload = createBackupPayload(createDefaultPreferences(vol.id, 'sage'), [vol]);

    const wrongApp = validateBackupPayload({ ...payload, app: 'other' });
    expect(wrongApp.ok).toBe(false);

    const wrongVersion = validateBackupPayload({ ...payload, schemaVersion: 2 });
    expect(wrongVersion.ok).toBe(false);
  });

  it('rejects empty volumes, mismatched book count, invalid color/motif, >280 char note, and missing activeVolumeId', () => {
    const vol = createDefaultVolume(1, '3x3', '2026-11-26T00:00:00.000Z');
    const prefs = createDefaultPreferences(vol.id, 'sage');
    const base = createBackupPayload(prefs, [vol]);

    expect(validateBackupPayload({ ...base, volumes: [] }).ok).toBe(false);

    const missingBook = structuredClone(base);
    missingBook.volumes[0].books.pop();
    expect(validateBackupPayload(missingBook).ok).toBe(false);

    const badColor = structuredClone(base);
    (badColor.volumes[0].books[0] as unknown as { colorId: string }).colorId = 'neon';
    expect(validateBackupPayload(badColor).ok).toBe(false);

    const badMotif = structuredClone(base);
    (badMotif.volumes[0].books[0] as unknown as { motif: string }).motif = 'stars';
    expect(validateBackupPayload(badMotif).ok).toBe(false);

    const overLengthNote = structuredClone(base);
    overLengthNote.volumes[0].books[0].note = {
      promptType: 'gratitude',
      promptText: '질문',
      content: '가'.repeat(281),
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    };
    expect(validateBackupPayload(overLengthNote).ok).toBe(false);

    const badActiveId = structuredClone(base);
    badActiveId.preferences.activeVolumeId = 'vol-99-3x3';
    expect(validateBackupPayload(badActiveId).ok).toBe(false);
  });
});
