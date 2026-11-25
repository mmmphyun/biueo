import {
  createDefaultPreferences,
  createDefaultVolume,
} from '../modules/bookshelf/data/defaultBooks';
import type { DeskThemeId, ShelfVolume, UserPreferences } from '../types/contracts';

const DB_NAME = 'biueo-db';
const DB_VERSION = 1;
const STORE_VOLUMES = 'volumes';
const STORE_PREFERENCES = 'preferences';

export type StorageBackendKind = 'indexeddb' | 'memory-fallback';

export interface StorageStatus {
  readonly backend: StorageBackendKind;
  readonly persisted: boolean | null;
}

export interface LoadedAppState {
  readonly volumes: ShelfVolume[];
  readonly preferences: UserPreferences;
  readonly status: StorageStatus;
}

let memoryVolumes: ShelfVolume[] = [];
let memoryPreferences: UserPreferences | null = null;
let persistRequestedInSession = false;
let forceMemoryFallback = false;

function cloneVolume(vol: ShelfVolume): ShelfVolume {
  return {
    ...vol,
    books: vol.books.map((b) => ({
      ...b,
      placement: b.placement ? { ...b.placement } : null,
      note: b.note ? { ...b.note } : null,
    })),
  };
}

function clonePreferences(prefs: UserPreferences): UserPreferences {
  return {
    ...prefs,
    hintsSeen: { ...prefs.hintsSeen },
    tuning: { ...prefs.tuning },
  };
}

function sortVolumes(volumes: readonly ShelfVolume[]): ShelfVolume[] {
  return [...volumes].sort((a, b) => a.volumeNumber - b.volumeNumber);
}

function hasIndexedDb(): boolean {
  return (
    !forceMemoryFallback &&
    typeof window !== 'undefined' &&
    typeof window.indexedDB !== 'undefined' &&
    window.indexedDB !== null
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_VOLUMES)) {
        db.createObjectStore(STORE_VOLUMES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFERENCES)) {
        db.createObjectStore(STORE_PREFERENCES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function runRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function queryPersistedFlag(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return null;
  }
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const backend: StorageBackendKind = hasIndexedDb() ? 'indexeddb' : 'memory-fallback';
  const persisted = backend === 'indexeddb' ? await queryPersistedFlag() : null;
  return { backend, persisted };
}

/**
 * 첫 번째 리츄얼 노트 저장 시 브라우저 영구 저장 보호를 세션당 1회 요청한다.
 */
export async function requestPersistentStorageOnce(): Promise<boolean | null> {
  if (persistRequestedInSession) {
    return queryPersistedFlag();
  }
  persistRequestedInSession = true;

  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return null;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function loadAppState(
  fallbackTheme: DeskThemeId,
  fallbackAudioEnabled: boolean
): Promise<LoadedAppState> {
  if (!hasIndexedDb()) {
    if (memoryVolumes.length === 0) {
      const initialVol = createDefaultVolume(1, '3x3');
      memoryVolumes = [initialVol];
      memoryPreferences = {
        ...createDefaultPreferences(initialVol.id, fallbackTheme),
        audioEnabled: fallbackAudioEnabled,
      };
    }
    const prefs = memoryPreferences
      ? clonePreferences(memoryPreferences)
      : {
          ...createDefaultPreferences(memoryVolumes[0].id, fallbackTheme),
          audioEnabled: fallbackAudioEnabled,
        };
    return {
      volumes: sortVolumes(memoryVolumes.map(cloneVolume)),
      preferences: prefs,
      status: { backend: 'memory-fallback', persisted: null },
    };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_VOLUMES, STORE_PREFERENCES], 'readonly');
    const rawVolumes = (await runRequest(
      tx.objectStore(STORE_VOLUMES).getAll()
    )) as ShelfVolume[];
    const rawPrefs = (await runRequest(
      tx.objectStore(STORE_PREFERENCES).get('singleton')
    )) as UserPreferences | undefined;
    await awaitTransaction(tx);

    let volumes = sortVolumes(rawVolumes.map(cloneVolume));
    let preferences = rawPrefs ? clonePreferences(rawPrefs) : null;

    if (volumes.length === 0) {
      const initialVol = createDefaultVolume(1, '3x3');
      volumes = [initialVol];
      preferences = preferences ?? {
        ...createDefaultPreferences(initialVol.id, fallbackTheme),
        audioEnabled: fallbackAudioEnabled,
      };
      preferences = { ...preferences, activeVolumeId: initialVol.id };

      const seedTx = db.transaction([STORE_VOLUMES, STORE_PREFERENCES], 'readwrite');
      seedTx.objectStore(STORE_VOLUMES).put(initialVol);
      seedTx.objectStore(STORE_PREFERENCES).put(preferences);
      await awaitTransaction(seedTx);
    } else if (!preferences) {
      preferences = {
        ...createDefaultPreferences(volumes[0].id, fallbackTheme),
        audioEnabled: fallbackAudioEnabled,
      };
      const prefTx = db.transaction([STORE_PREFERENCES], 'readwrite');
      prefTx.objectStore(STORE_PREFERENCES).put(preferences);
      await awaitTransaction(prefTx);
    } else if (!volumes.some((v) => v.id === preferences?.activeVolumeId)) {
      preferences = { ...preferences, activeVolumeId: volumes[0].id };
      const prefTx = db.transaction([STORE_PREFERENCES], 'readwrite');
      prefTx.objectStore(STORE_PREFERENCES).put(preferences);
      await awaitTransaction(prefTx);
    }

    memoryVolumes = volumes.map(cloneVolume);
    memoryPreferences = clonePreferences(preferences);

    return {
      volumes,
      preferences,
      status: {
        backend: 'indexeddb',
        persisted: await queryPersistedFlag(),
      },
    };
  } catch {
    forceMemoryFallback = true;
    if (memoryVolumes.length === 0) {
      const initialVol = createDefaultVolume(1, '3x3');
      memoryVolumes = [initialVol];
      memoryPreferences = {
        ...createDefaultPreferences(initialVol.id, fallbackTheme),
        audioEnabled: fallbackAudioEnabled,
      };
    }
    return {
      volumes: sortVolumes(memoryVolumes.map(cloneVolume)),
      preferences: clonePreferences(
        memoryPreferences ?? {
          ...createDefaultPreferences(memoryVolumes[0].id, fallbackTheme),
          audioEnabled: fallbackAudioEnabled,
        }
      ),
      status: { backend: 'memory-fallback', persisted: null },
    };
  } finally {
    db?.close();
  }
}

export async function saveVolume(volume: ShelfVolume): Promise<void> {
  const cloned = cloneVolume(volume);
  const idx = memoryVolumes.findIndex((v) => v.id === cloned.id);
  if (idx >= 0) {
    memoryVolumes[idx] = cloned;
  } else {
    memoryVolumes.push(cloned);
  }

  if (!hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_VOLUMES], 'readwrite');
    tx.objectStore(STORE_VOLUMES).put(cloned);
    await awaitTransaction(tx);
  } catch {
    forceMemoryFallback = true;
  } finally {
    db?.close();
  }
}

export async function deleteVolume(volumeId: string): Promise<void> {
  memoryVolumes = memoryVolumes.filter((v) => v.id !== volumeId);

  if (!hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_VOLUMES], 'readwrite');
    tx.objectStore(STORE_VOLUMES).delete(volumeId);
    await awaitTransaction(tx);
  } catch {
    forceMemoryFallback = true;
  } finally {
    db?.close();
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  const cloned = clonePreferences(prefs);
  memoryPreferences = cloned;

  if (!hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_PREFERENCES], 'readwrite');
    tx.objectStore(STORE_PREFERENCES).put(cloned);
    await awaitTransaction(tx);
  } catch {
    forceMemoryFallback = true;
  } finally {
    db?.close();
  }
}

/**
 * JSON 복원 시 기존 스토어를 단일 readwrite 트랜잭션에서 원자적으로 교체한다.
 */
export async function replaceAllData(
  volumes: readonly ShelfVolume[],
  prefs: UserPreferences
): Promise<void> {
  const clonedVolumes = sortVolumes(volumes.map(cloneVolume));
  const clonedPrefs = clonePreferences(prefs);

  memoryVolumes = clonedVolumes;
  memoryPreferences = clonedPrefs;

  if (!hasIndexedDb()) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_VOLUMES, STORE_PREFERENCES], 'readwrite');
    const volStore = tx.objectStore(STORE_VOLUMES);
    const prefStore = tx.objectStore(STORE_PREFERENCES);
    volStore.clear();
    prefStore.clear();
    for (const vol of clonedVolumes) {
      volStore.put(vol);
    }
    prefStore.put(clonedPrefs);
    await awaitTransaction(tx);
  } catch {
    forceMemoryFallback = true;
  } finally {
    db?.close();
  }
}

export function resetStorageTestState(): void {
  memoryVolumes = [];
  memoryPreferences = null;
  persistRequestedInSession = false;
  forceMemoryFallback = false;
}
