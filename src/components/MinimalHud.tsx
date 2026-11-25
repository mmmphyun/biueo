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
  const isAllShelved = snapshot.shelvedCount === snapshot.totalCount;

  return (
    <>
      {/* 우상단 데스크 직인쇄 유틸리티 (크기 · 바탕 물감 점 · 도움말) */}
      <div
        role="region"
        aria-label="서가 설정 및 안내"
        style={{ color: theme.ink }}
        className="fixed top-2.5 right-3 z-20 flex items-center gap-2 sm:top-4 sm:right-6 sm:gap-4"
      >
        {motionSupported && (
          <button
            type="button"
            aria-pressed={motionShakeEnabled}
            onClick={onToggleMotionShake}
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

        {/* 3x3 / 5x3 크기 선택 */}
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
                onClick={() => onChangePreset(preset)}
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

        {/* 데스크 바탕 4색 무외곽선 물감 점 */}
        <div
          role="group"
          aria-label="데스크 바탕 색상"
          className="flex items-center gap-0.5 sm:gap-1"
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
                className="desk-ink-action relative flex h-7 w-7 items-center justify-center sm:h-8 sm:w-8"
              >
                <span
                  aria-hidden="true"
                  className="block h-3.5 w-3.5 rounded-full transition-transform sm:h-4 sm:w-4"
                  style={{
                    backgroundColor: t.bg,
                    transform: active ? 'scale(1.08)' : undefined,
                    boxShadow: active
                      ? `inset 0 0 0 1.5px ${t.ink}55, 1.5px 2px 0 ${theme.shadow}`
                      : `1.5px 2px 0 ${theme.shadow}`,
                  }}
                />
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                    style={{ backgroundColor: theme.ink }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="도움말 및 뇌과학 원리"
          className="desk-ink-action flex h-8 w-8 items-center justify-center text-sm font-semibold opacity-65 hover:opacity-100"
        >
          ?
        </button>
      </div>

      {/* 하단 중앙 주 행동 단독 배치 */}
      <nav
        aria-label="책장 주 조작"
        style={{ color: theme.ink }}
        className="fixed bottom-3.5 left-1/2 z-20 flex w-max -translate-x-1/2 items-center gap-7 sm:bottom-5 sm:gap-8"
      >
        {!snapshot.isDoorOpen ? (
          <>
            <button
              type="button"
              onClick={onShake}
              style={{ borderColor: theme.ink }}
              className="desk-ink-action min-h-9 border-b-[1.5px] px-0.5 pb-0.5 text-[13px] font-semibold tracking-[-0.01em] hover:opacity-75 sm:text-sm"
            >
              흔들기
            </button>
            <button
              type="button"
              onClick={onToggleDoor}
              className="desk-ink-action min-h-9 px-0.5 pb-0.5 text-[13px] font-medium tracking-[-0.01em] opacity-70 hover:opacity-100 sm:text-sm"
            >
              문 열기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onToggleDoor}
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
        )}
      </nav>
    </>
  );
}
