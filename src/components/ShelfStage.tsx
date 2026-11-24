import { useEffect, useRef } from 'react';
import { createShelfEngine } from '../engine/shelfEngine';
import type {
  BookModel,
  DeskThemeId,
  DetectedOrder,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfVolume,
  UserPreferences,
} from '../types/contracts';

interface ShelfStageProps {
  readonly volume: ShelfVolume;
  readonly initialPreferences: UserPreferences;
  readonly themeId: DeskThemeId;
  readonly motionShakeEnabled: boolean;
  readonly controllerRef: React.RefObject<ShelfEngineController | null>;
  readonly onStateChange: (snapshot: ShelfEngineSnapshot) => void;
  readonly onBookTap: (bookId: string) => void;
  readonly onShelfCommit: (books: BookModel[]) => void;
  readonly onTidyComplete: (orders: DetectedOrder[]) => void;
}

export function ShelfStage({
  volume,
  initialPreferences,
  themeId,
  motionShakeEnabled,
  controllerRef,
  onStateChange,
  onBookTap,
  onShelfCommit,
  onTidyComplete,
}: ShelfStageProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedVolumeIdRef = useRef<string>(volume.id);

  const callbacksRef = useRef({
    onStateChange,
    onBookTap,
    onShelfCommit,
    onTidyComplete,
  });
  callbacksRef.current = {
    onStateChange,
    onBookTap,
    onShelfCommit,
    onTidyComplete,
  };

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) return;

    const engine = createShelfEngine({
      onStateChange: (snap) => callbacksRef.current.onStateChange(snap),
      onBookTap: (id) => callbacksRef.current.onBookTap(id),
      onShelfCommit: (books) => callbacksRef.current.onShelfCommit(books),
      onTidyComplete: (orders) => callbacksRef.current.onTidyComplete(orders),
    });

    controllerRef.current = engine;
    mountedVolumeIdRef.current = volume.id;
    engine.mount(canvas, volume, initialPreferences);

    // Modern Web Guidance (efficient-background-processing):
    // contentvisibilityautostatechange는 버블링하지 않으므로 .shelf-stage-shell에 직접 연결한다.
    const syncPause = (shouldPause: boolean) => {
      if (shouldPause) engine.pause();
      else engine.resume();
    };

    const handleContentVisibility = (event: Event) => {
      const skipped = Boolean((event as Event & { skipped?: boolean }).skipped);
      syncPause(skipped || document.hidden);
    };
    shell.addEventListener('contentvisibilityautostatechange', handleContentVisibility);

    let intersectionObserver: IntersectionObserver | null = null;
    if (!('contentVisibility' in document.documentElement.style)) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            syncPause(!entry.isIntersecting || document.hidden);
          }
        },
        { rootMargin: '200px' }
      );
      intersectionObserver.observe(shell);
    }

    const handleVisibility = () => {
      syncPause(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      shell.removeEventListener('contentvisibilityautostatechange', handleContentVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
      intersectionObserver?.disconnect();
      engine.unmount();
      controllerRef.current = null;
    };
    // 최초 마운트 시 1회만 엔진을 바인딩한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = controllerRef.current;
    if (!engine) return;
    if (mountedVolumeIdRef.current !== volume.id) {
      mountedVolumeIdRef.current = volume.id;
      engine.loadVolume(volume);
    }
  }, [controllerRef, volume]);

  useEffect(() => {
    controllerRef.current?.setTheme(themeId);
  }, [controllerRef, themeId]);

  useEffect(() => {
    controllerRef.current?.setMotionShakeEnabled(motionShakeEnabled);
  }, [controllerRef, motionShakeEnabled]);

  return (
    <div ref={shellRef} className="shelf-stage-shell">
      <canvas
        ref={canvasRef}
        aria-label="생각을 비우는 원목 책장 인터랙티브 캔버스"
        className="block h-full w-full select-none"
      />
    </div>
  );
}
