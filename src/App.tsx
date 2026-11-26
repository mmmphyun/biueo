import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpDialog } from './components/HelpDialog';
import {
  readAudioEnabledPreference,
  saveAudioEnabledPreference,
} from './modules/bookshelf/audio/foleySynth';
import { BookNoteDialog } from './modules/bookshelf/components/BookNoteDialog';
import { NewVolumeDialog } from './modules/bookshelf/components/NewVolumeDialog';
import { ShelfStage } from './modules/bookshelf/components/ShelfStage';
import {
  createDefaultPreferences,
  createDefaultVolume,
  resetVolumePlacements,
} from './modules/bookshelf/data/defaultBooks';
import {
  DESK_THEMES,
  pickRandomThemeForMode,
  readLastThemeId,
  resolveInitialColorMode,
  saveLastThemeId,
  saveManualColorMode,
  syncDocumentColorScheme,
} from './shared/theme/deskThemes';
import { AppChrome } from './shared/ui/AppChrome';
import { createBackupPayload, triggerBackupDownload } from './storage/backup';
import {
  loadAppState,
  replaceAllData,
  requestPersistentStorageOnce,
  savePreferences,
  saveVolume,
  type StorageStatus,
} from './storage/db';
import type {
  BackupPayloadV1,
  BookModel,
  DeskColorMode,
  DeskThemeId,
  DetectedOrder,
  RitualNote,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfGridPreset,
  ShelfVolume,
  UserPreferences,
} from './types/contracts';

export default function App() {
  const controllerRef = useRef<ShelfEngineController | null>(null);
  const initialModeInfo = useMemo(() => resolveInitialColorMode(), []);
  const isManualModeRef = useRef(initialModeInfo.isManualOverride);

  const [volumes, setVolumes] = useState<ShelfVolume[]>(() => [
    createDefaultVolume(1, '3x3'),
  ]);
  const [activeVolumeId, setActiveVolumeId] = useState<string>('vol-1-3x3');
  const [volumeRevision, setVolumeRevision] = useState(0);
  const [colorMode, setColorMode] = useState<DeskColorMode>(initialModeInfo.mode);
  const [themeId, setThemeId] = useState<DeskThemeId>(() =>
    pickRandomThemeForMode(initialModeInfo.mode, readLastThemeId())
  );
  const motionSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches
    );
  }, []);

  const needsMotionPermission = useMemo(() => {
    if (!motionSupported || typeof DeviceMotionEvent === 'undefined') return false;
    const motionEvent = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    return typeof motionEvent.requestPermission === 'function';
  }, [motionSupported]);

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() =>
    readAudioEnabledPreference()
  );
  // 안드로이드 등 별도 OS 권한 팝업이 없는 모바일 기기에서는 즉시 가속도 흔들기를 켠다.
  const [motionShakeEnabled, setMotionShakeEnabled] = useState<boolean>(
    () => motionSupported && !needsMotionPermission
  );
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...createDefaultPreferences('vol-1-3x3', themeId),
    audioEnabled,
    motionShakeEnabled,
  }));
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    backend: 'indexeddb',
    persisted: null,
  });
  const [hydrated, setHydrated] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [newVolumeOpen, setNewVolumeOpen] = useState(false);
  const [tappedBookId, setTappedBookId] = useState<string | null>(null);

  const activeVolume = useMemo(
    () => volumes.find((v) => v.id === activeVolumeId) ?? volumes[0],
    [activeVolumeId, volumes]
  );

  const initialPreferences = useMemo(
    () => ({
      ...createDefaultPreferences(activeVolume.id, themeId),
      audioEnabled,
      motionShakeEnabled,
    }),
    // 최초 마운트 스냅샷만 엔진에 전달한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [snapshot, setSnapshot] = useState<ShelfEngineSnapshot>(() => ({
    state: 'LOCKED_NEAT',
    shelvedCount: activeVolume.books.length,
    totalCount: activeVolume.books.length,
    writtenCount: activeVolume.books.filter((b) => b.note !== null).length,
    isDoorOpen: false,
  }));

  // 앱 시작 시 IndexedDB(biueo-db)에서 서가 및 설정을 비동기로 복원한다.
  useEffect(() => {
    let cancelled = false;
    void loadAppState(themeId, audioEnabled).then((loaded) => {
      if (cancelled) return;
      const loadedTheme = DESK_THEMES[loaded.preferences.theme];
      setVolumes(loaded.volumes);
      setActiveVolumeId(loaded.preferences.activeVolumeId);
      setPreferences(loaded.preferences);
      setStorageStatus(loaded.status);
      setThemeId(loaded.preferences.theme);
      if (loadedTheme) {
        setColorMode(loadedTheme.mode);
      }
      setAudioEnabled(loaded.preferences.audioEnabled);
      setVolumeRevision((r) => r + 1);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // 마운트 시 1회만 복원한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncDocumentColorScheme(colorMode);
  }, [colorMode]);

  useEffect(() => {
    saveLastThemeId(themeId);
  }, [themeId]);

  useEffect(() => {
    saveAudioEnabledPreference(audioEnabled);
  }, [audioEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    const nextPrefs: UserPreferences = {
      ...preferences,
      theme: themeId,
      activeVolumeId,
      audioEnabled,
      motionShakeEnabled,
    };
    setPreferences(nextPrefs);
    void savePreferences(nextPrefs);
    // 환경 설정 변경 시에만 preferences 스토어를 갱신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, themeId, activeVolumeId, audioEnabled, motionShakeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (isManualModeRef.current) return;
      const nextMode: DeskColorMode = event.matches ? 'dark' : 'light';
      setColorMode(nextMode);
      setThemeId((prev) => pickRandomThemeForMode(nextMode, prev));
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, []);

  const handleToggleColorMode = useCallback(() => {
    setColorMode((prevMode) => {
      const nextMode: DeskColorMode = prevMode === 'light' ? 'dark' : 'light';
      isManualModeRef.current = true;
      saveManualColorMode(nextMode);
      setThemeId((prevTheme) => pickRandomThemeForMode(nextMode, prevTheme));
      return nextMode;
    });
  }, []);

  const handleShuffleTheme = useCallback(() => {
    setThemeId((prevTheme) => pickRandomThemeForMode(colorMode, prevTheme));
  }, [colorMode]);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  const handleStateChange = useCallback((next: ShelfEngineSnapshot) => {
    setSnapshot(next);
  }, []);

  const handleBookTap = useCallback((bookId: string) => {
    setTappedBookId(bookId);
  }, []);

  const handleShelfCommit = useCallback(
    (books: BookModel[]) => {
      const nowIso = new Date().toISOString();
      setVolumes((prev) => {
        const nextList = prev.map((vol) => {
          if (vol.id !== activeVolume.id) return vol;
          const updated: ShelfVolume = {
            ...vol,
            updatedAt: nowIso,
            books,
          };
          void saveVolume(updated);
          return updated;
        });
        return nextList;
      });
    },
    [activeVolume.id]
  );

  const handleSaveBookNote = useCallback(
    (bookId: string, note: RitualNote | null) => {
      controllerRef.current?.updateBookNote(bookId, note);
      const nowIso = new Date().toISOString();
      setVolumes((prev) =>
        prev.map((vol) => {
          if (vol.id !== activeVolume.id) return vol;
          const updated: ShelfVolume = {
            ...vol,
            updatedAt: nowIso,
            books: vol.books.map((b) => (b.id === bookId ? { ...b, note } : b)),
          };
          void saveVolume(updated);
          return updated;
        })
      );

      if (note !== null) {
        void requestPersistentStorageOnce().then((persisted) => {
          if (persisted !== null) {
            setStorageStatus((prev) => ({ ...prev, persisted }));
          }
        });
      }
    },
    [activeVolume.id]
  );

  const handleSwitchEmptyPreset = useCallback(
    (preset: ShelfGridPreset) => {
      if (volumes.length !== 1) return;
      const hasNotes = activeVolume.books.some((b) => b.note !== null);
      if (hasNotes || activeVolume.gridPreset === preset) return;

      const freshVol = createDefaultVolume(1, preset);
      setVolumes([freshVol]);
      setActiveVolumeId(freshVol.id);
      setVolumeRevision((r) => r + 1);
      void replaceAllData([freshVol], {
        ...preferences,
        theme: themeId,
        activeVolumeId: freshVol.id,
        audioEnabled,
        motionShakeEnabled,
      });
    },
    [
      activeVolume.books,
      activeVolume.gridPreset,
      audioEnabled,
      motionShakeEnabled,
      preferences,
      themeId,
      volumes.length,
    ]
  );

  const handleSelectVolume = useCallback((volumeId: string) => {
    setTappedBookId(null);
    setActiveVolumeId(volumeId);
  }, []);

  const handleCreateVolume = useCallback(
    (preset: ShelfGridPreset) => {
      const nextNum =
        volumes.reduce((max, vol) => Math.max(max, vol.volumeNumber), 0) + 1;
      const newVol = createDefaultVolume(nextNum, preset);
      setTappedBookId(null);
      setVolumes((prev) => [...prev, newVol]);
      setActiveVolumeId(newVol.id);
      setVolumeRevision((r) => r + 1);
      void saveVolume(newVol);
    },
    [volumes]
  );

  const handleResetActivePlacements = useCallback(() => {
    const resetVol = resetVolumePlacements(activeVolume);
    setTappedBookId(null);
    setVolumes((prev) => prev.map((v) => (v.id === resetVol.id ? resetVol : v)));
    setVolumeRevision((r) => r + 1);
    void saveVolume(resetVol);
  }, [activeVolume]);

  const handleExportBackup = useCallback(() => {
    const currentPrefs: UserPreferences = {
      ...preferences,
      theme: themeId,
      activeVolumeId: activeVolume.id,
      audioEnabled,
      motionShakeEnabled,
    };
    const payload = createBackupPayload(currentPrefs, volumes);
    return triggerBackupDownload(payload);
  }, [activeVolume.id, audioEnabled, motionShakeEnabled, preferences, themeId, volumes]);

  const handleImportBackup = useCallback(async (payload: BackupPayloadV1) => {
    await replaceAllData(payload.volumes, payload.preferences);
    const nextTheme = DESK_THEMES[payload.preferences.theme];
    setTappedBookId(null);
    setVolumes(payload.volumes);
    setActiveVolumeId(payload.preferences.activeVolumeId);
    setPreferences(payload.preferences);
    setThemeId(payload.preferences.theme);
    if (nextTheme) {
      setColorMode(nextTheme.mode);
    }
    setAudioEnabled(payload.preferences.audioEnabled);
    setMotionShakeEnabled(payload.preferences.motionShakeEnabled);
    setVolumeRevision((r) => r + 1);
  }, []);

  const handleTidyComplete = useCallback((_orders: DetectedOrder[]) => {
    // Phase 2 순수 감각 보상(차임/파스텔 반짝임)은 엔진 내부에서 처리된다.
  }, []);

  const handleToggleMotionShake = useCallback(async () => {
    if (motionShakeEnabled) {
      setMotionShakeEnabled(false);
      return;
    }
    const motionEvent = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof motionEvent.requestPermission === 'function') {
      try {
        const res = await motionEvent.requestPermission();
        if (res === 'granted') {
          setMotionShakeEnabled(true);
        }
      } catch {
        setMotionShakeEnabled(false);
      }
    } else {
      setMotionShakeEnabled(true);
    }
  }, [motionShakeEnabled]);

  const theme = DESK_THEMES[themeId];
  const tappedBook = useMemo(
    () => activeVolume.books.find((b) => b.id === tappedBookId) ?? null,
    [activeVolume.books, tappedBookId]
  );
  const activeWrittenCount = useMemo(
    () => activeVolume.books.filter((b) => b.note !== null).length,
    [activeVolume.books]
  );
  const isVolumeComplete = activeWrittenCount === activeVolume.books.length;
  const canSwitchEmptyPreset = volumes.length === 1 && activeWrittenCount === 0;
  const showVolumeChrome = volumes.length >= 2 || isVolumeComplete;
  const hasUnplacedBooks = snapshot.shelvedCount < snapshot.totalCount;
  const nextVolumeNumber =
    volumes.reduce((max, vol) => Math.max(max, vol.volumeNumber), 0) + 1;

  const headerSlot = (
    <>
      {motionSupported && (
        <button
          type="button"
          aria-pressed={motionShakeEnabled}
          onClick={handleToggleMotionShake}
          style={{ color: motionShakeEnabled ? theme.ink : theme.inkMuted }}
          className="desk-ink-action flex min-h-9 items-center gap-1.5 px-1 text-sm font-medium"
        >
          {motionShakeEnabled && (
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: theme.ink }}
            />
          )}
          <span>{needsMotionPermission && !motionShakeEnabled ? '흔들기 허용' : '흔들기'}</span>
        </button>
      )}

      {canSwitchEmptyPreset && (
        <div
          role="group"
          aria-label="책장 크기 선택"
          className="flex items-center gap-1.5 sm:gap-2"
        >
          {(['3x3', '5x3'] as const).map((preset) => {
            const active = activeVolume.gridPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => handleSwitchEmptyPreset(preset)}
                style={{
                  borderColor: active ? theme.ink : 'transparent',
                  color: active ? theme.ink : theme.inkMuted,
                }}
                className={`desk-ink-action min-h-9 border-b-[1.5px] px-1 text-sm tracking-tight ${
                  active ? 'font-semibold' : 'font-normal'
                }`}
              >
                {preset === '3x3' ? '3×3' : '5×3'}
              </button>
            );
          })}
        </div>
      )}

      {showVolumeChrome && (
        <div className="flex items-center gap-1.5 sm:gap-2">
          {volumes.length >= 2 && (
            volumes.length <= 2 ? (
              <div role="group" aria-label="서가 고르기" className="flex items-center gap-1">
                {volumes.map((vol) => {
                  const active = vol.id === activeVolume.id;
                  return (
                    <button
                      key={vol.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectVolume(vol.id)}
                      style={{
                        borderColor: active ? theme.ink : 'transparent',
                        color: active ? theme.ink : theme.inkMuted,
                      }}
                      className={`desk-ink-action min-h-9 border-b-[1.5px] px-1 text-sm tracking-tight ${
                        active ? 'font-semibold' : 'font-normal'
                      }`}
                    >
                      {vol.title}
                    </button>
                  );
                })}
              </div>
            ) : (
              <select
                aria-label="서가 고르기"
                value={activeVolume.id}
                onChange={(e) => handleSelectVolume(e.target.value)}
                style={{
                  color: theme.ink,
                  borderColor: theme.inkMuted,
                }}
                className="desk-ink-action min-h-9 border-b-[1.5px] bg-transparent px-1 text-sm font-semibold"
              >
                {volumes.map((vol) => (
                  <option
                    key={vol.id}
                    value={vol.id}
                    style={{
                      backgroundColor: theme.dockSurface,
                      color: theme.dockInk,
                    }}
                  >
                    {vol.title}
                  </option>
                ))}
              </select>
            )
          )}

          {isVolumeComplete && (
            <button
              type="button"
              onClick={() => setNewVolumeOpen(true)}
              style={{ color: theme.ink }}
              className="desk-ink-action min-h-9 px-1.5 text-sm font-medium"
            >
              + 새 서가
            </button>
          )}
        </div>
      )}
    </>
  );

  const footerStatus = hasUnplacedBooks ? (
    <span className="text-[15px] font-medium tabular-nums tracking-[0.03em] sm:text-base">
      {snapshot.shelvedCount} / {snapshot.totalCount}
    </span>
  ) : null;

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <ShelfStage
        volume={activeVolume}
        volumeRevision={volumeRevision}
        initialPreferences={initialPreferences}
        themeId={themeId}
        audioEnabled={audioEnabled}
        motionShakeEnabled={motionShakeEnabled}
        controllerRef={controllerRef}
        onStateChange={handleStateChange}
        onBookTap={handleBookTap}
        onShelfCommit={handleShelfCommit}
        onTidyComplete={handleTidyComplete}
      />

      <AppChrome
        themeId={themeId}
        colorMode={colorMode}
        audioEnabled={audioEnabled}
        headerSlot={headerSlot}
        footerStatus={footerStatus}
        onToggleAudio={handleToggleAudio}
        onToggleColorMode={handleToggleColorMode}
        onShuffleTheme={handleShuffleTheme}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <HelpDialog
        open={helpOpen}
        themeId={themeId}
        volumes={volumes}
        activeVolumeId={activeVolume.id}
        storageStatus={storageStatus}
        onSelectVolume={handleSelectVolume}
        onCreateVolume={handleCreateVolume}
        onResetActivePlacements={handleResetActivePlacements}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onClose={() => setHelpOpen(false)}
      />

      <NewVolumeDialog
        open={newVolumeOpen}
        themeId={themeId}
        nextVolumeNumber={nextVolumeNumber}
        onCreate={handleCreateVolume}
        onClose={() => setNewVolumeOpen(false)}
      />

      <BookNoteDialog
        book={tappedBook}
        themeId={themeId}
        onSaveNote={handleSaveBookNote}
        onClose={() => setTappedBookId(null)}
      />
    </main>
  );
}
