import { DESK_THEMES } from '../../../shared/theme/deskThemes';
import { PaperDialog } from '../../../shared/ui/PaperDialog';
import type { BookModel, DeskThemeId } from '../../../types/contracts';
import {
  BOOK_COLORS,
  getBookRitualPrompt,
  RITUAL_AXIS_LABELS,
} from '../data/bookPalette';

interface BookPeekDialogProps {
  readonly book: BookModel | null;
  readonly themeId: DeskThemeId;
  readonly onClose: () => void;
}

export function BookPeekDialog({ book, themeId, onClose }: BookPeekDialogProps) {
  const theme = DESK_THEMES[themeId];
  const colorHex = book ? BOOK_COLORS[book.colorId].hex : theme.bg;
  const promptEntry = book ? getBookRitualPrompt(book) : null;
  const promptText = book?.note?.promptText ?? promptEntry?.promptText ?? '';
  const axisLabel = book
    ? RITUAL_AXIS_LABELS[book.note?.promptType ?? book.defaultPromptType]
    : '';

  return (
    <PaperDialog
      open={book !== null}
      themeId={themeId}
      titleId="book-peek-title"
      title={promptText}
      headerLabel={axisLabel}
      accentBarHex={colorHex}
      minHeightClass="min-h-[210px]"
      onClose={onClose}
    >
      <div className="mt-7 text-sm leading-relaxed">
        {book?.note ? (
          <p>{book.note.content}</p>
        ) : (
          <p className="text-xs leading-relaxed" style={{ color: theme.dockMuted }}>
            {promptEntry?.placeholder ?? '아직 남겨둔 한 줄이 없습니다.'}
          </p>
        )}
      </div>
    </PaperDialog>
  );
}
