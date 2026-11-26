import { useCallback, useEffect, useRef, useState } from 'react';
import { DESK_THEMES } from '../../../shared/theme/deskThemes';
import { PaperDialog } from '../../../shared/ui/PaperDialog';
import type { BookModel, DeskThemeId, RitualNote } from '../../../types/contracts';
import {
  BOOK_COLORS,
  getBookRitualPrompt,
  RITUAL_AXIS_LABELS,
  RITUAL_NOTE_MAX_LENGTH,
} from '../data/bookPalette';

interface BookNoteDialogProps {
  readonly book: BookModel | null;
  readonly themeId: DeskThemeId;
  readonly onSaveNote: (bookId: string, note: RitualNote | null) => void;
  readonly onClose: () => void;
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export function BookNoteDialog({
  book,
  themeId,
  onSaveNote,
  onClose,
}: BookNoteDialogProps) {
  const theme = DESK_THEMES[themeId];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submittedRef = useRef(false);

  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!book) return;
    submittedRef.current = false;
    setDraft(book.note?.content ?? '');
    const frameId = window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [book]);

  const colorHex = book ? BOOK_COLORS[book.colorId].hex : theme.bg;
  const promptEntry = book ? getBookRitualPrompt(book) : null;
  const promptType = book?.note?.promptType ?? book?.defaultPromptType ?? 'strength_recall';
  const promptText = book?.note?.promptText ?? promptEntry?.promptText ?? '';
  const axisLabel = book ? RITUAL_AXIS_LABELS[promptType] : '';
  const existingContent = book?.note?.content ?? '';
  const updatedDateLabel = book?.note?.updatedAt ? formatKoreanDate(book.note.updatedAt) : '';

  const buildNextNote = useCallback(
    (rawText: string): RitualNote | null => {
      if (!book) return null;
      const trimmed = rawText.trim();
      if (trimmed.length === 0) return null;
      const nowIso = new Date().toISOString();
      return {
        promptType,
        promptText,
        content: trimmed,
        createdAt: book.note?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
    },
    [book, promptText, promptType]
  );

  const handleExplicitSave = useCallback(() => {
    if (!book) return;
    submittedRef.current = true;
    const trimmed = draft.trim();
    if (trimmed !== existingContent.trim()) {
      onSaveNote(book.id, buildNextNote(draft));
    }
    onClose();
  }, [book, buildNextNote, draft, existingContent, onClose, onSaveNote]);

  const handleClear = useCallback(() => {
    if (!book) return;
    submittedRef.current = true;
    onSaveNote(book.id, null);
    onClose();
  }, [book, onClose, onSaveNote]);

  const handleDialogClose = useCallback(() => {
    // 닫기 버튼·Esc·배경 클릭 시 변경된 내용만 자동 저장한다.
    if (book && !submittedRef.current) {
      const trimmed = draft.trim();
      if (trimmed !== existingContent.trim()) {
        onSaveNote(book.id, buildNextNote(draft));
      }
    }
    onClose();
  }, [book, buildNextNote, draft, existingContent, onClose, onSaveNote]);

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        handleExplicitSave();
      }
    },
    [handleExplicitSave]
  );

  return (
    <PaperDialog
      open={book !== null}
      themeId={themeId}
      titleId="book-note-title"
      title={promptText}
      headerLabel={axisLabel}
      accentBarHex={colorHex}
      minHeightClass="min-h-[260px]"
      autoFocusClose={false}
      onClose={handleDialogClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExplicitSave();
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <div>
          <label htmlFor="book-note-textarea" className="sr-only">
            {promptText}
          </label>
          <textarea
            ref={textareaRef}
            id="book-note-textarea"
            rows={4}
            maxLength={RITUAL_NOTE_MAX_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={promptEntry?.placeholder ?? '떠오른 생각을 짧게 적어보세요.'}
            style={
              {
                backgroundColor: theme.dockInputBg,
                color: theme.dockInk,
                '--note-border': theme.dockBorderStrong,
                '--note-focus-border': theme.dockAccent,
              } as React.CSSProperties
            }
            className="biueo-note-textarea rounded-md border px-3.5 py-3 text-base leading-[1.65]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm" style={{ color: theme.dockMuted }}>
            <span className="tabular-nums">
              {draft.length} / {RITUAL_NOTE_MAX_LENGTH}
            </span>
            {updatedDateLabel && <span>{updatedDateLabel}</span>}
          </div>

          <div className="flex items-center gap-2.5">
            {book?.note && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  color: theme.dockDanger,
                  borderColor: theme.dockBorderStrong,
                }}
                className="biueo-btn border px-3.5 text-sm font-medium"
              >
                비우기
              </button>
            )}
            <button
              type="submit"
              style={{
                backgroundColor: theme.dockAccent,
                color: theme.dockAccentInk,
              }}
              className="biueo-btn px-4 text-sm font-medium"
            >
              저장
            </button>
          </div>
        </div>
      </form>
    </PaperDialog>
  );
}
