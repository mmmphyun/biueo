import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpDialog } from './components/HelpDialog';
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
  OnboardingHintsSeen,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfGridPreset,
  ShelfVolume,
} from './types/contracts';

function selectActiveShelfHint(
  snapshot: ShelfEngineSnapshot,
  hintsSeen: OnboardingHintsSeen
): string | null {
  if (!snapshot.isDoorOpen && snapshot.state !== 'SHAKING_CHAOS' && !hintsSeen.shakeOrUnlatch) {
    return '책장을 흔들어 비우거나, 오른쪽 걸쇠를 열어보세요';
  }
  if (snapshot.isDoorOpen && !hintsSeen.dragOrTapBook) {
    return '책을 끌어다 꽂거나, 짧게 눌러 페이지를 펼쳐보세요';
  }
  if (
    snapshot.isDoorOpen &&
    snapshot.shelvedCount === snapshot.totalCount &&
    hintsSeen.dragOrTapBook &&
    !hintsSeen.closeLatch
  ) {
    return '정리가 끝나면 오른쪽 걸쇠를 눌러 문을 닫아보세요';
  }
  return null;
}

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
  const [motionShakeEnabled, setMotionShakeEnabled] = useState(false);
  const [hintsSeen, setHintsSeen] = useState<OnboardingHintsSeen>({
    shakeOrUnlatch: false,
    dragOrTapBook: false,
    closeLatch: false,
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [tappedBookId, setTappedBookId] = useState<string | null>(null);

  const activeVolume = volumesByPreset[gridPreset];
  const initialPreferences = useMemo(
    () => createDefaultPreferences(activeVolume.id, themeId),
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

  const prevDoorOpenRef = useRef(false);

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

  const handleStateChange = useCallback((next: ShelfEngineSnapshot) => {
    setSnapshot(next);
    setHintsSeen((prev) => {
      let updated = prev;
      if (!prev.shakeOrUnlatch && (next.state === 'SHAKING_CHAOS' || next.isDoorOpen)) {
        updated = { ...updated, shakeOrUnlatch: true };
      }
      if (!prev.closeLatch && prevDoorOpenRef.current && !next.isDoorOpen) {
        updated = { ...updated, closeLatch: true };
      }
      return updated;
    });
    prevDoorOpenRef.current = next.isDoorOpen;
  }, []);

  const handleBookTap = useCallback((bookId: string) => {
    setHintsSeen((prev) => (prev.dragOrTapBook ? prev : { ...prev, dragOrTapBook: true }));
    setTappedBookId(bookId);
  }, []);

  const handleShelfCommit = useCallback(
    (books: BookModel[]) => {
      if (prevDoorOpenRef.current) {
        setHintsSeen((prev) => (prev.dragOrTapBook ? prev : { ...prev, dragOrTapBook: true }));
      }
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
    setHintsSeen((prev) => (prev.closeLatch ? prev : { ...prev, closeLatch: true }));
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
  const isAllShelved = snapshot.shelvedCount === snapshot.totalCount;
  const activeHintMessage = selectActiveShelfHint(snapshot, hintsSeen);

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

  const actionSlot = !snapshot.isDoorOpen ? (
    <>
      <button
        type="button"
        onClick={() => controllerRef.current?.triggerShake(0.85)}
        style={{ borderColor: theme.ink }}
        className="desk-ink-action min-h-9 border-b-[1.5px] px-0.5 pb-0.5 text-[13px] font-semibold tracking-[-0.01em] hover:opacity-75 sm:text-sm"
      >
        흔들기
      </button>
      <button
        type="button"
        onClick={() => controllerRef.current?.toggleDoor()}
        className="desk-ink-action min-h-9 px-0.5 pb-0.5 text-[13px] font-medium tracking-[-0.01em] opacity-70 hover:opacity-100 sm:text-sm"
      >
        문 열기
      </button>
    </>
  ) : (
    <button
      type="button"
      onClick={() => controllerRef.current?.toggleDoor()}
      style={{ borderColor: isAllShelved ? theme.ink : 'transparent' }}
      className={`desk-ink-action flex min-h-9 items-baseline gap-2 border-b-[1.5px] px-0.5 pb-0.5 text-[13px] tracking-[-0.01em] sm:text-sm ${
        isAllShelved ? 'font-semibold opacity-100' : 'font-medium opacity-78 hover:opacity-100'
      }`}
    >
      <span>걸쇠 잠그기</span>
      {!isAllShelved && (
        <span className="text-xs font-normal tabular-nums opacity-65">
          {snapshot.shelvedCount}/{snapshot.totalCount}
        </span>
      )}
    </button>
  );

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <ShelfStage
        volume={activeVolume}
        initialPreferences={initialPreferences}
        themeId={themeId}
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
        hintMessage={activeHintMessage}
        headerSlot={headerSlot}
        actionSlot={actionSlot}
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
