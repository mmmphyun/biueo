import { useRef } from 'react';
import { DESK_THEMES } from '../data/palette';
import { useDialogControl } from '../hooks/useDialogControl';
import type { DeskThemeId } from '../types/contracts';

interface HelpDialogProps {
  readonly open: boolean;
  readonly themeId: DeskThemeId;
  readonly onClose: () => void;
}

export function HelpDialog({ open, themeId, onClose }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogControl(dialogRef, open, onClose);

  const theme = DESK_THEMES[themeId];

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="help-dialog-title"
      style={
        {
          backgroundColor: theme.dockSurface,
          color: theme.dockInk,
          '--sheet-shadow': theme.shadow,
        } as React.CSSProperties
      }
      className="paper-sheet-dialog w-[calc(100vw-32px)] max-w-lg"
    >
      <div className="px-6 py-6 sm:px-7 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="help-dialog-title"
              className="text-base font-semibold tracking-[-0.02em] sm:text-lg"
            >
              비우어 안내
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.dockMuted }}>
              로그인 없이 브라우저 로컬에서만 동작하는 디지털 책장입니다.
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="desk-ink-action text-xs font-medium opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>

        <div className="mt-6 space-y-6 text-sm leading-relaxed">
          <section>
            <h3 className="text-xs font-semibold" style={{ color: theme.dockMuted }}>
              사용 방법
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed sm:text-sm">
              <li>
                <strong>흔들어 비우기</strong>: 책장 프레임을 끌거나 스페이스바, 흔들기 버튼을 누르면 닫힌 유리문 안에서 책들이 무너집니다.
              </li>
              <li>
                <strong>자유롭게 다시 꽂기</strong>: 오른쪽 황동 걸쇠를 열어 원하는 칸에 책을 꽂으세요. 정답이나 감점은 없습니다.
              </li>
              <li>
                <strong>짧게 눌러 책 펼치기</strong>: 문이 열린 상태에서 책을 짧게 누르면 1페이지 질문과 기록을 확인할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold" style={{ color: theme.dockMuted }}>
              참고 연구와 적용 범위
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed" style={{ color: theme.dockMuted }}>
              <li>
                <strong>시공간 작업기억 간섭</strong>: Holmes et al. (2009, 2010, PLoS ONE) — 비언어적 시각 정렬이 침투적 잔상을 줄이는 데 도움을 줍니다.
              </li>
              <li>
                <strong>의례와 불안 완화</strong>: Brooks et al. (2016, OBHDP) — 반복된 시작·마감 절차가 상태 불안을 낮춥니다.
              </li>
              <li>
                <strong>자기확언과 긍정 회고</strong>: Cascio et al. (2016, SCAN), Seligman et al. (2005) — 짧은 강점·감사 회고가 보상 회로를 돕습니다.
              </li>
              <li>
                <strong>효과 크기 한계</strong>: Bolier et al. (2013, BMC Public Health) 메타분석상 효과는 작고 점진적이며(g = 0.20-0.34), 본 웹앱은 의학적 치료 도구가 아닙니다.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </dialog>
  );
}
