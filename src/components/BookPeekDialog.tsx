import { useRef } from 'react';
import { BOOK_COLORS, DESK_THEMES, RITUAL_PROMPTS } from '../data/palette';
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
  const promptText = book
    ? book.note?.promptText ?? RITUAL_PROMPTS[book.defaultPromptType].promptText
    : '';

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="book-peek-title"
      style={{
        backgroundColor: theme.dockSurface,
        color: theme.dockInk,
        borderColor: theme.dockBorder,
      }}
      className="w-[calc(100vw-32px)] max-w-md rounded-2xl border p-5 shadow-xl sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-2.5 rounded-sm"
            style={{ backgroundColor: colorHex }}
          />
          <span className="text-xs font-medium" style={{ color: theme.dockMuted }}>
            {book?.id}
          </span>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          style={{ borderColor: theme.dockBorder }}
          className="cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-80"
        >
          닫기
        </button>
      </div>

      <h2 id="book-peek-title" className="font-book-serif mt-4 text-base font-bold leading-snug sm:text-lg">
        {promptText}
      </h2>

      <div
        className="mt-3 rounded-xl border p-3.5 text-sm leading-relaxed"
        style={{ borderColor: theme.dockBorder }}
      >
        {book?.note ? (
          <p>{book.note.content}</p>
        ) : (
          <p className="text-xs" style={{ color: theme.dockMuted }}>
            아직 남겨둔 한 줄이 없습니다.
          </p>
        )}
      </div>
    </dialog>
  );
}
