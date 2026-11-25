import { DESK_THEMES } from '../data/palette';
import type {
  DeskThemeId,
  OnboardingHintsSeen,
  ShelfEngineSnapshot,
} from '../types/contracts';

interface GhostHintProps {
  readonly themeId: DeskThemeId;
  readonly snapshot: ShelfEngineSnapshot;
  readonly hintsSeen: OnboardingHintsSeen;
}

function selectActiveHint(
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

export function GhostHint({ themeId, snapshot, hintsSeen }: GhostHintProps) {
  const message = selectActiveHint(snapshot, hintsSeen);
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
