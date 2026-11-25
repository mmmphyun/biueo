import { useCallback, useEffect, useRef } from 'react';
import { CanvasStageShell } from '../../../shared/ui/CanvasStageShell';
import type {
  BookModel,
  DeskThemeId,
  DetectedOrder,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfVolume,
  UserPreferences,
} from '../../../types/contracts';
import { createShelfEngine } from '../shelfEngine';

interface ShelfStageProps {
  readonly volume: ShelfVolume;
  readonly volumeRevision: number;
  readonly initialPreferences: UserPreferences;
  readonly themeId: DeskThemeId;
  readonly audioEnabled: boolean;
  readonly motionShakeEnabled: boolean;
  readonly controllerRef: React.RefObject<ShelfEngineController | null>;
  readonly onStateChange: (snapshot: ShelfEngineSnapshot) => void;
  readonly onBookTap: (bookId: string) => void;
  readonly onShelfCommit: (books: BookModel[]) => void;
  readonly onTidyComplete: (orders: DetectedOrder[]) => void;
}

export function ShelfStage({
  volume,
  volumeRevision,
  initialPreferences,
  themeId,
  audioEnabled,
  motionShakeEnabled,
  controllerRef,
  onStateChange,
  onBookTap,
  onShelfCommit,
  onTidyComplete,
}: ShelfStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedVolumeKeyRef = useRef<string>(`${volume.id}:${volumeRevision}`);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createShelfEngine({
      onStateChange: (snap) => callbacksRef.current.onStateChange(snap),
      onBookTap: (id) => callbacksRef.current.onBookTap(id),
      onShelfCommit: (books) => callbacksRef.current.onShelfCommit(books),
      onTidyComplete: (orders) => callbacksRef.current.onTidyComplete(orders),
    });

    controllerRef.current = engine;
    mountedVolumeKeyRef.current = `${volume.id}:${volumeRevision}`;
    engine.mount(canvas, volume, initialPreferences);

    return () => {
      engine.unmount();
      controllerRef.current = null;
    };
    // 최초 마운트 시 1회만 엔진을 바인딩한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = controllerRef.current;
    if (!engine) return;
    const nextKey = `${volume.id}:${volumeRevision}`;
    if (mountedVolumeKeyRef.current !== nextKey) {
      mountedVolumeKeyRef.current = nextKey;
      engine.loadVolume(volume);
    }
  }, [controllerRef, volume, volumeRevision]);

  useEffect(() => {
    controllerRef.current?.setTheme(themeId);
  }, [controllerRef, themeId]);

  useEffect(() => {
    controllerRef.current?.setAudioEnabled(audioEnabled);
  }, [controllerRef, audioEnabled]);

  useEffect(() => {
    controllerRef.current?.setMotionShakeEnabled(motionShakeEnabled);
  }, [controllerRef, motionShakeEnabled]);

  const handlePauseChange = useCallback(
    (paused: boolean) => {
      const engine = controllerRef.current;
      if (!engine) return;
      if (paused) engine.pause();
      else engine.resume();
    },
    [controllerRef]
  );

  return (
    <CanvasStageShell onPauseChange={handlePauseChange}>
      <canvas
        ref={canvasRef}
        aria-label="생각을 비우는 원목 책장 인터랙티브 캔버스"
        className="block h-full w-full select-none"
      />
    </CanvasStageShell>
  );
}
