import { DESK_THEMES, DESK_THEME_ORDER } from '../data/palette';
import type {
  DeskThemeId,
  ShelfEngineSnapshot,
  ShelfGridPreset,
} from '../types/contracts';

interface MinimalHudProps {
  readonly themeId: DeskThemeId;
  readonly gridPreset: ShelfGridPreset;
  readonly snapshot: ShelfEngineSnapshot;
  readonly motionSupported: boolean;
  readonly motionShakeEnabled: boolean;
  readonly onShake: () => void;
  readonly onToggleDoor: () => void;
  readonly onChangePreset: (preset: ShelfGridPreset) => void;
  readonly onChangeTheme: (theme: DeskThemeId) => void;
  readonly onToggleMotionShake: () => void;
  readonly onOpenHelp: () => void;
}

export function MinimalHud({
  themeId,
  gridPreset,
  snapshot,
  motionSupported,
  motionShakeEnabled,
  onShake,
  onToggleDoor,
  onChangePreset,
  onChangeTheme,
  onToggleMotionShake,
  onOpenHelp,
}: MinimalHudProps) {
  const theme = DESK_THEMES[themeId];
  const surfaceStyle = {
    '--dock-surface': theme.dockSurface,
    '--dock-ink': theme.dockInk,
    color: theme.dockInk,
    borderColor: theme.dockBorder,
  } as React.CSSProperties;

  const isAllShelved = snapshot.shelvedCount === snapshot.totalCount;

  return (
    <>
      {/* 우상단 상시 도움말 ? 버튼 */}
      <button
        type="button"
        onClick={onOpenHelp}
        aria-label="도움말 및 뇌과학 원리"
        style={surfaceStyle}
        className="hud-surface fixed top-3 right-3 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-sm font-bold shadow-sm hover:opacity-90 sm:top-5 sm:right-6"
      >
        ?
      </button>

      {/* 하단 중앙 최소 물리·테마 컨트롤 바 */}
      <nav
        aria-label="책장 조작 도구"
        style={surfaceStyle}
        className="hud-surface fixed bottom-3 left-1/2 z-20 flex w-max max-w-[calc(100vw-20px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-1.5 shadow-sm sm:bottom-5 sm:gap-2 sm:px-3 sm:py-2"
      >
        {!snapshot.isDoorOpen ? (
          <>
            <button
              type="button"
              onClick={onShake}
              style={{
                borderColor: theme.dockBorder,
                backgroundColor: theme.bg,
                color: theme.ink,
              }}
              className="cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold hover:opacity-90"
            >
              흔들기
            </button>
            <button
              type="button"
              onClick={onToggleDoor}
              style={{ borderColor: theme.dockBorder }}
              className="cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium hover:opacity-80"
            >
              문 열기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onToggleDoor}
            style={{
              borderColor: isAllShelved ? theme.dockInk : theme.dockBorder,
              backgroundColor: isAllShelved ? theme.bg : 'transparent',
              color: isAllShelved ? theme.ink : theme.dockInk,
            }}
            className="cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            걸쇠 잠그기
            {!isAllShelved && (
              <span className="ml-1.5 text-[11px] font-normal opacity-75">
                {snapshot.shelvedCount}/{snapshot.totalCount}
              </span>
            )}
          </button>
        )}

        <span
          aria-hidden="true"
          className="mx-0.5 hidden h-4 w-px opacity-30 sm:inline-block"
          style={{ backgroundColor: theme.dockInk }}
        />

        {/* 3x3 / 5x3 프리셋 전환 */}
        <div
          role="group"
          aria-label="책장 크기 선택"
          className="flex items-center gap-1"
        >
          {(['3x3', '5x3'] as const).map((preset) => {
            const active = gridPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => onChangePreset(preset)}
                style={{
                  borderColor: active ? theme.dockInk : theme.dockBorder,
                  backgroundColor: active ? theme.bg : 'transparent',
                  color: active ? theme.ink : theme.dockInk,
                }}
                className="cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-semibold"
              >
                {preset === '3x3' ? '3×3' : '5×3'}
              </button>
            );
          })}
        </div>

        {/* 바탕 테마 4종 스와치 */}
        <div
          role="group"
          aria-label="데스크 바탕 색상"
          className="flex items-center gap-1"
        >
          {DESK_THEME_ORDER.map((id) => {
            const t = DESK_THEMES[id];
            const active = themeId === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={`${t.labelKo} 바탕`}
                aria-pressed={active}
                onClick={() => onChangeTheme(id)}
                style={{
                  backgroundColor: t.bg,
                  borderColor: active ? theme.dockInk : theme.dockBorder,
                }}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border text-[10px] font-bold"
              >
                {active ? (
                  <span aria-hidden="true" style={{ color: t.ink }}>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 모바일 전용 가속도계 흔들기 권한 토글 */}
        {motionSupported && (
          <button
            type="button"
            aria-pressed={motionShakeEnabled}
            onClick={onToggleMotionShake}
            style={{
              borderColor: motionShakeEnabled ? theme.dockInk : theme.dockBorder,
              backgroundColor: motionShakeEnabled ? theme.bg : 'transparent',
              color: motionShakeEnabled ? theme.ink : theme.dockInk,
            }}
            className="cursor-pointer rounded-xl border px-2.5 py-1 text-[11px] font-medium"
          >
            {motionShakeEnabled ? '✓ 폰 흔들기' : '폰 흔들기'}
          </button>
        )}
      </nav>
    </>
  );
}
