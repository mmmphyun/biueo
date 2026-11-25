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
  titleClassName = 'mt-4 text-base font-semibold leading-relaxed tracking-[-0.02em] sm:text-[17px]',
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
      className={`paper-sheet-dialog w-[calc(100vw-32px)] ${maxWidthClass}`}
    >
      <div className={`flex ${minHeightClass}`}>
        {accentBarHex && (
          <div
            aria-hidden="true"
            className="w-2.5 shrink-0"
            style={{ backgroundColor: accentBarHex }}
          />
        )}

        <div className="flex flex-1 flex-col justify-between px-6 py-6 sm:px-7 sm:py-7">
          <div>
            <div className="flex items-start justify-between gap-4">
              {headerLabel ? (
                <span className="text-xs font-medium" style={{ color: theme.dockMuted }}>
                  {headerLabel}
                </span>
              ) : (
                <div>
                  <h1
                    id={titleId}
                    className="text-base font-semibold tracking-[-0.02em] sm:text-lg"
                  >
                    {title}
                  </h1>
                  {subtitle && (
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: theme.dockMuted }}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                className="desk-ink-action shrink-0 text-xs font-medium opacity-60 hover:opacity-100"
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

          {children}
        </div>
      </div>
    </dialog>
  );
}
