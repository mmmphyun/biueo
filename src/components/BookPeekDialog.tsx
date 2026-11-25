import { useRef } from 'react';
import {
  BOOK_COLORS,
  DESK_THEMES,
  getBookRitualPrompt,
  RITUAL_AXIS_LABELS,
} from '../data/palette';
import { useDialogControl } from '../hooks/useDialogControl';
import type { BookModel, DeskThemeId } from '../types/contracts';

interface BookPeekDialogProps {
  readonly book: BookModel | null;
  readonly themeId: DeskThemeId;
  readonly onClose: () => void;
}

export function BookPeekDialog({ book, themeId, onClose }: BookPeekDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogControl(dialogRef, book !== null, onClose);

  const theme = DESK_THEMES[themeId];
  const colorHex = book ? BOOK_COLORS[book.colorId].hex : theme.bg;
  const promptEntry = book ? getBookRitualPrompt(book) : null;
  const promptText = book?.note?.promptText ?? promptEntry?.promptText ?? '';
  const axisLabel = book ? RITUAL_AXIS_LABELS[book.note?.promptType ?? book.defaultPromptType] : '';

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="book-peek-title"
      style={
        {
          backgroundColor: theme.dockSurface,
          color: theme.dockInk,
          '--sheet-shadow': theme.shadow,
        } as React.CSSProperties
      }
      className="paper-sheet-dialog w-[calc(100vw-32px)] max-w-md"
    >
      <div className="flex min-h-[210px]">
        <div
          aria-hidden="true"
          className="w-2.5 shrink-0"
          style={{ backgroundColor: colorHex }}
        />

        <div className="flex flex-1 flex-col justify-between px-6 py-6 sm:px-7 sm:py-7">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium" style={{ color: theme.dockMuted }}>
                {axisLabel}
              </span>
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                className="desk-ink-action text-xs font-medium opacity-60 hover:opacity-100"
              >
                닫기
              </button>
            </div>

            <h2
              id="book-peek-title"
              className="mt-4 text-base font-semibold leading-relaxed tracking-[-0.02em] sm:text-[17px]"
            >
              {promptText}
            </h2>
          </div>

          <div className="mt-7 text-sm leading-relaxed">
            {book?.note ? (
              <p>{book.note.content}</p>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: theme.dockMuted }}>
                {promptEntry?.placeholder ?? '아직 남겨둔 한 줄이 없습니다.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
