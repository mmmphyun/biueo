import type { ReactNode } from 'react';
import type { DeskColorMode, DeskThemeId } from '../../types/contracts';
import { DESK_THEMES } from '../theme/deskThemes';
import { GhostHint } from './GhostHint';

interface AppChromeProps {
  readonly themeId: DeskThemeId;
  readonly colorMode: DeskColorMode;
  readonly hintMessage: string | null;
  readonly headerSlot?: ReactNode;
  readonly actionSlot?: ReactNode;
  readonly onToggleColorMode: () => void;
  readonly onShuffleTheme: () => void;
  readonly onOpenHelp: () => void;
}

export function AppChrome({
  themeId,
  colorMode,
  hintMessage,
  headerSlot,
  actionSlot,
  onToggleColorMode,
  onShuffleTheme,
  onOpenHelp,
}: AppChromeProps) {
  const theme = DESK_THEMES[themeId];
  const nextModeLabel = colorMode === 'light' ? '다크' : '라이트';

  return (
    <>
      <header
        className="pointer-events-none fixed top-3.5 left-4 z-10 sm:top-5 sm:left-6"
        style={{ color: theme.ink }}
      >
        <h1 className="text-[17px] font-semibold tracking-[-0.03em] opacity-90 sm:text-[19px]">
          비우어
        </h1>
      </header>

      <div
        role="region"
        aria-label="화면 설정 및 안내"
        style={{ color: theme.ink }}
        className="fixed top-2.5 right-3 z-20 flex items-center gap-2.5 sm:top-4 sm:right-6 sm:gap-4"
      >
        {headerSlot}

        <button
          type="button"
          onClick={onToggleColorMode}
          aria-label={colorMode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
          className="desk-ink-action min-h-8 px-1 text-xs font-medium opacity-68 hover:opacity-100 sm:text-[13px]"
        >
          {nextModeLabel}
        </button>

        <button
          type="button"
          onClick={onShuffleTheme}
          aria-label="바탕 색 바꾸기"
          title={`${theme.labelKo} · 눌러서 색 바꾸기`}
          className="desk-ink-action flex h-8 w-8 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className="desk-paint-dab block h-4 w-4 rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: theme.bg,
              boxShadow: `inset 0 0 0 1.5px ${theme.ink}66, 1.5px 2px 0 ${theme.shadow}`,
            }}
          />
        </button>

        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="도움말 및 뇌과학 원리"
          className="desk-ink-action flex h-8 w-8 items-center justify-center text-sm font-semibold opacity-65 hover:opacity-100"
        >
          ?
        </button>
      </div>

      <GhostHint themeId={themeId} message={hintMessage} />

      {actionSlot && (
        <nav
          aria-label="주 조작"
          style={{ color: theme.ink }}
          className="fixed bottom-3.5 left-1/2 z-20 flex w-max -translate-x-1/2 items-center gap-7 sm:bottom-5 sm:gap-8"
        >
          {actionSlot}
        </nav>
      )}
    </>
  );
}
