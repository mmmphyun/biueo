import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpDialog } from './components/HelpDialog';
import {
  readAudioEnabledPreference,
  saveAudioEnabledPreference,
} from './modules/bookshelf/audio/foleySynth';
import { BookPeekDialog } from './modules/bookshelf/components/BookPeekDialog';
import { ShelfStage } from './modules/bookshelf/components/ShelfStage';
import {
  createDefaultPreferences,
  createDefaultVolume,
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
import type {
  BookModel,
  DeskColorMode,
  DeskThemeId,
  DetectedOrder,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfGridPreset,
  ShelfVolume,
} from './types/contracts';

export default function App() {
  const controllerRef = useRef<ShelfEngineController | null>(null);
  const initialModeInfo = useMemo(() => resolveInitialColorMode(), []);
  const isManualModeRef = useRef(initialModeInfo.isManualOverride);

  const [volumesByPreset, setVolumesByPreset] = useState<Record<ShelfGridPreset, ShelfVolume>>(() => ({
    '3x3': createDefaultVolume(1, '3x3'),
    '5x3': createDefaultVolume(1, '5x3'),
  }));
  const [gridPreset, setGridPreset] = useState<ShelfGridPreset>('3x3');
  const [colorMode, setColorMode] = useState<DeskColorMode>(initialModeInfo.mode);
  const [themeId, setThemeId] = useState<DeskThemeId>(() =>
    pickRandomThemeForMode(initialModeInfo.mode, readLastThemeId())
  );
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => readAudioEnabledPreference());
  const [motionShakeEnabled, setMotionShakeEnabled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tappedBookId, setTappedBookId] = useState<string | null>(null);

  const activeVolume = volumesByPreset[gridPreset];
  const initialPreferences = useMemo(
    () => ({
      ...createDefaultPreferences(activeVolume.id, themeId),
      audioEnabled,
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

  const motionSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches
    );
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
      setVolumesByPreset((prev) => ({
        ...prev,
        [gridPreset]: {
          ...prev[gridPreset],
          updatedAt: new Date().toISOString(),
          books,
        },
      }));
    },
    [gridPreset]
  );

  const handleTidyComplete = useCallback((_orders: DetectedOrder[]) => {
    // Phase 2 순수 감각 보상(차임/파스텔 반짝임) 연결 지점
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
  const hasUnplacedBooks = snapshot.shelvedCount < snapshot.totalCount;

  const headerSlot = (
    <>
      {motionSupported && (
        <button
          type="button"
          aria-pressed={motionShakeEnabled}
          onClick={handleToggleMotionShake}
          className="desk-ink-action flex min-h-8 items-center gap-1.5 px-1 text-[11px] font-medium opacity-75 hover:opacity-100 sm:text-xs"
        >
          {motionShakeEnabled && (
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: theme.ink }}
            />
          )}
          <span>폰 흔들기</span>
        </button>
      )}

      <div
        role="group"
        aria-label="책장 크기 선택"
        className="flex items-center gap-1.5 sm:gap-2.5"
      >
        {(['3x3', '5x3'] as const).map((preset) => {
          const active = gridPreset === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => setGridPreset(preset)}
              style={{ borderColor: active ? theme.ink : 'transparent' }}
              className={`desk-ink-action min-h-8 border-b-[1.5px] px-0.5 text-xs tracking-tight sm:text-[13px] ${
                active ? 'font-semibold opacity-100' : 'font-normal opacity-50 hover:opacity-85'
              }`}
            >
              {preset === '3x3' ? '3×3' : '5×3'}
            </button>
          );
        })}
      </div>
    </>
  );

  const footerStatus = hasUnplacedBooks ? (
    <span className="text-[15px] font-medium tabular-nums tracking-[0.03em] opacity-85 sm:text-base">
      {snapshot.shelvedCount} / {snapshot.totalCount}
    </span>
  ) : null;

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <ShelfStage
        volume={activeVolume}
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

      <HelpDialog open={helpOpen} themeId={themeId} onClose={() => setHelpOpen(false)} />

      <BookPeekDialog
        book={tappedBook}
        themeId={themeId}
        onClose={() => setTappedBookId(null)}
      />
    </main>
  );
}
