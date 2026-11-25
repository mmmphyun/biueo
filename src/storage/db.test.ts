import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultPreferences,
  createDefaultVolume,
} from '../modules/bookshelf/data/defaultBooks';
import {
  loadAppState,
  replaceAllData,
  requestPersistentStorageOnce,
  resetStorageTestState,
  savePreferences,
  saveVolume,
} from './db';

describe('db.ts graceful memory fallback & persistence invariants', () => {
  beforeEach(() => {
    resetStorageTestState();
    vi.restoreAllMocks();
  });

  it('falls back to in-memory storage without crashing when IndexedDB is unavailable', async () => {
    const loaded = await loadAppState('sage', true);
    expect(loaded.status.backend).toBe('memory-fallback');
    expect(loaded.status.persisted).toBeNull();
    expect(loaded.volumes).toHaveLength(1);
    expect(loaded.volumes[0].books).toHaveLength(36);
    expect(loaded.volumes[0].books.every((b) => b.note === null)).toBe(true);
  });

  it('saves volume updates and replaces all data atomically in fallback mode', async () => {
    const initial = await loadAppState('slate', false);
    const vol1 = initial.volumes[0];
    vol1.books[1] = {
      ...vol1.books[1],
      note: {
        promptType: vol1.books[1].defaultPromptType,
        promptText: '질문',
        content: '메모 저장 테스트',
        createdAt: '2026-11-26T00:00:00.000Z',
        updatedAt: '2026-11-26T00:00:00.000Z',
      },
    };
    await saveVolume(vol1);
    await savePreferences({ ...initial.preferences, theme: 'dusk' });

    const reloaded = await loadAppState('sage', true);
    expect(reloaded.volumes[0].books[1].note?.content).toBe('메모 저장 테스트');
    expect(reloaded.preferences.theme).toBe('dusk');

    const vol2 = createDefaultVolume(2, '5x3', '2026-11-26T01:00:00.000Z');
    await replaceAllData([vol2], createDefaultPreferences(vol2.id, 'umber'));

    const replaced = await loadAppState('sage', true);
    expect(replaced.volumes).toHaveLength(1);
    expect(replaced.volumes[0].id).toBe(vol2.id);
    expect(replaced.preferences.theme).toBe('umber');
  });

  it('invokes navigator.storage.persist at most once per session', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    const persistedMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      storage: {
        persist: persistMock,
        persisted: persistedMock,
      },
    });

    const first = await requestPersistentStorageOnce();
    const second = await requestPersistentStorageOnce();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistedMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
