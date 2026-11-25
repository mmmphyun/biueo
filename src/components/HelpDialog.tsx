import { DESK_THEMES } from '../shared/theme/deskThemes';
import { PaperDialog } from '../shared/ui/PaperDialog';
import type { DeskThemeId } from '../types/contracts';

interface HelpDialogProps {
  readonly open: boolean;
  readonly themeId: DeskThemeId;
  readonly onClose: () => void;
}

export function HelpDialog({ open, themeId, onClose }: HelpDialogProps) {
  const theme = DESK_THEMES[themeId];

  return (
    <PaperDialog
      open={open}
      themeId={themeId}
      titleId="help-dialog-title"
      title="비우어 안내"
      subtitle="로그인 없이 브라우저 로컬에서만 동작하는 디지털 책장입니다."
      maxWidthClass="max-w-lg"
      onClose={onClose}
    >
      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xs font-semibold" style={{ color: theme.dockMuted }}>
            사용 방법
          </h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed sm:text-sm">
            <li>
              <strong>흔들어 비우기</strong>: 닫힌 책장 프레임을 잡거나 스페이스바를 누르면 유리문 안에서 책들이 무너집니다.
            </li>
            <li>
              <strong>문 열고 자유롭게 정리하기</strong>: 오른쪽 황동 걸쇠(또는 Enter 키)로 문을 열고 원하는 만큼만 꽂아도 다시 닫을 수 있습니다. 정답이나 감점은 없습니다.
            </li>
            <li>
              <strong>짧게 눌러 책 펼치기</strong>: 문이 열린 상태에서 책을 짧게 누르면 1페이지 질문을 확인할 수 있습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xs font-semibold" style={{ color: theme.dockMuted }}>
            참고 연구와 적용 범위
          </h2>
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
    </PaperDialog>
  );
}
