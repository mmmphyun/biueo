import { useCallback, useMemo, useRef, useState } from 'react';
import { BookPeekDialog } from './components/BookPeekDialog';
import { GhostHint } from './components/GhostHint';
import { HelpDialog } from './components/HelpDialog';
import { MinimalHud } from './components/MinimalHud';
import { ShelfStage } from './components/ShelfStage';
import { createDefaultPreferences, createDefaultVolume } from './data/defaultBooks';
import { DESK_THEMES } from './data/palette';
import type {
  BookModel,
  DeskThemeId,
  DetectedOrder,
  OnboardingHintsSeen,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfGridPreset,
  ShelfVolume,
} from './types/contracts';

export default function App() {
  const controllerRef = useRef<ShelfEngineController | null>(null);

  const [volumesByPreset, setVolumesByPreset] = useState<Record<ShelfGridPreset, ShelfVolume>>(() => ({
    '3x3': createDefaultVolume(1, '3x3'),
    '5x3': createDefaultVolume(1, '5x3'),
  }));
  const [gridPreset, setGridPreset] = useState<ShelfGridPreset>('3x3');
  const [themeId, setThemeId] = useState<DeskThemeId>('sage');
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
    () => createDefaultPreferences(activeVolume.id),
    // 최초 마운트 스냅샷만 전달한다.
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

      <header
        className="pointer-events-none fixed top-3.5 left-4 z-10 sm:top-5 sm:left-6"
        style={{ color: theme.ink }}
      >
        <h1 className="text-[17px] font-semibold tracking-[-0.03em] opacity-90 sm:text-[19px]">
          비우어
        </h1>
      </header>

      <GhostHint themeId={themeId} snapshot={snapshot} hintsSeen={hintsSeen} />

      <MinimalHud
        themeId={themeId}
        gridPreset={gridPreset}
        snapshot={snapshot}
        motionSupported={motionSupported}
        motionShakeEnabled={motionShakeEnabled}
        onShake={() => controllerRef.current?.triggerShake(0.85)}
        onToggleDoor={() => controllerRef.current?.toggleDoor()}
        onChangePreset={setGridPreset}
        onChangeTheme={setThemeId}
        onToggleMotionShake={handleToggleMotionShake}
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
