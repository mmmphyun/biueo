import { DESK_THEMES } from '../../../shared/theme/deskThemes';
import { PaperDialog } from '../../../shared/ui/PaperDialog';
import type { DeskThemeId, ShelfGridPreset } from '../../../types/contracts';

interface NewVolumeDialogProps {
  readonly open: boolean;
  readonly themeId: DeskThemeId;
  readonly nextVolumeNumber: number;
  readonly onCreate: (preset: ShelfGridPreset) => void;
  readonly onClose: () => void;
}

export function NewVolumeDialog({
  open,
  themeId,
  nextVolumeNumber,
  onCreate,
  onClose,
}: NewVolumeDialogProps) {
  const theme = DESK_THEMES[themeId];

  return (
    <PaperDialog
      open={open}
      themeId={themeId}
      titleId="new-volume-dialog-title"
      title={`새 서가 (Vol. ${nextVolumeNumber}) 시작`}
      subtitle="원하는 책장 크기를 골라 바로 열어볼 수 있어요."
      maxWidthClass="max-w-md"
      onClose={onClose}
    >
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            {
              preset: '3x3' as const,
              title: '3×3 기본 책장',
              desc: '9칸 · 36권 구성으로 가볍게 정리하기 좋아요.',
            },
            {
              preset: '5x3' as const,
              title: '5×3 넓은 책장',
              desc: '15칸 · 60권 구성으로 넉넉하게 채울 수 있어요.',
            },
          ] as const
        ).map((item) => (
          <button
            key={item.preset}
            type="button"
            onClick={() => {
              onCreate(item.preset);
              onClose();
            }}
            style={{
              backgroundColor: theme.dockInputBg,
              borderColor: theme.dockBorderStrong,
              color: theme.dockInk,
            }}
            className="biueo-btn flex flex-col items-start justify-center border px-4 py-3.5 text-left hover:opacity-95"
          >
            <span className="text-[15px] font-semibold">{item.title}</span>
            <span
              className="mt-1 text-sm leading-relaxed"
              style={{ color: theme.dockMuted }}
            >
              {item.desc}
            </span>
          </button>
        ))}
      </div>
    </PaperDialog>
  );
}
