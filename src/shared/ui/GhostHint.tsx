import { DESK_THEMES } from '../theme/deskThemes';
import type { DeskThemeId } from '../../types/contracts';

interface GhostHintProps {
  readonly themeId: DeskThemeId;
  readonly message: string | null;
}

export function GhostHint({ themeId, message }: GhostHintProps) {
  if (!message) return null;

  const theme = DESK_THEMES[themeId];

  return (
    <p
      role="status"
      aria-live="polite"
      style={{ color: theme.ink }}
      className="pointer-events-none fixed bottom-13 left-1/2 z-10 w-max max-w-[88vw] -translate-x-1/2 text-center text-xs font-normal tracking-[-0.01em] opacity-65 sm:bottom-15 sm:text-[13px]"
    >
      {message}
    </p>
  );
}
