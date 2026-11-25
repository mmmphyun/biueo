import { useRef, type ReactNode } from 'react';
import type { DeskThemeId } from '../../types/contracts';
import { DESK_THEMES } from '../theme/deskThemes';
import { useDialogControl } from './useDialogControl';

interface PaperDialogProps {
  readonly open: boolean;
  readonly themeId: DeskThemeId;
  readonly titleId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly headerLabel?: string;
  readonly accentBarHex?: string;
  readonly maxWidthClass?: string;
  readonly minHeightClass?: string;
  readonly titleClassName?: string;
  readonly autoFocusClose?: boolean;
  readonly bodyClassName?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function PaperDialog({
  open,
  themeId,
  titleId,
  title,
  subtitle,
  headerLabel,
  accentBarHex,
  maxWidthClass = 'max-w-md',
  minHeightClass = '',
  titleClassName = 'mt-3 text-[17px] font-semibold leading-relaxed tracking-[-0.02em] sm:text-lg',
  autoFocusClose = true,
  bodyClassName = '',
  onClose,
  children,
}: PaperDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogControl(dialogRef, open, onClose);

  const theme = DESK_THEMES[themeId];

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby={titleId}
      style={
        {
          backgroundColor: theme.dockSurface,
          color: theme.dockInk,
          '--sheet-shadow': theme.shadow,
        } as React.CSSProperties
      }
      className={`paper-sheet-dialog max-h-[86dvh] w-[calc(100vw-32px)] ${maxWidthClass}`}
    >
      <div className={`flex max-h-[86dvh] ${minHeightClass}`}>
        {accentBarHex && (
          <div
            aria-hidden="true"
            className="w-2.5 shrink-0"
            style={{ backgroundColor: accentBarHex }}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col justify-between px-5 py-5 sm:px-7 sm:py-6">
          <div className="shrink-0">
            <div className="flex items-start justify-between gap-4">
              {headerLabel ? (
                <span className="text-sm font-medium" style={{ color: theme.dockMuted }}>
                  {headerLabel}
                </span>
              ) : (
                <div>
                  <h1
                    id={titleId}
                    className="text-[17px] font-semibold tracking-[-0.02em] sm:text-lg"
                  >
                    {title}
                  </h1>
                  {subtitle && (
                    <p
                      className="mt-1 text-sm leading-relaxed"
                      style={{ color: theme.dockMuted }}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                autoFocus={autoFocusClose}
                onClick={() => dialogRef.current?.close()}
                style={{ color: theme.dockMuted }}
                className="desk-ink-action min-h-9 shrink-0 px-2 text-sm font-medium hover:underline"
              >
                닫기
              </button>
            </div>

            {headerLabel && (
              <h1 id={titleId} className={titleClassName}>
                {title}
              </h1>
            )}
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        </div>
      </div>
    </dialog>
  );
}
