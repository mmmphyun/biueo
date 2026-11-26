import { useCallback, useEffect, useRef, useState } from 'react';
import { DESK_THEMES } from '../shared/theme/deskThemes';
import { PaperDialog } from '../shared/ui/PaperDialog';
import {
  validateBackupPayload,
  type BackupSummary,
} from '../storage/backup';
import type { StorageStatus } from '../storage/db';
import type {
  BackupPayloadV1,
  DeskThemeId,
  ShelfGridPreset,
  ShelfVolume,
} from '../types/contracts';

type HelpTabId = 'intro' | 'guide' | 'research' | 'data';

const HELP_TABS: readonly { readonly id: HelpTabId; readonly label: string }[] = [
  { id: 'intro', label: '소개' },
  { id: 'guide', label: '사용법' },
  { id: 'research', label: '연구 근거' },
  { id: 'data', label: '데이터' },
];

interface ResearchCitation {
  readonly id: string;
  readonly topic: string;
  readonly authors: string;
  readonly summary: string;
  readonly citation: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}

const RESEARCH_CITATIONS: readonly ResearchCitation[] = [
  {
    id: 'holmes',
    topic: '눈과 손을 쓰는 정리와 잡념',
    authors: 'Holmes et al. (2009, 2010)',
    summary:
      '힘든 장면을 떠올린 뒤 테트리스처럼 눈과 손을 쓰는 과제를 하면, 불쑥 떠오르는 시각적 잔상이 줄었어요. 반대로 말로 푸는 퀴즈를 하면 잔상이 더 늘었고요. 일상적인 고민까지 똑같이 사라진다고 보긴 어렵지만, 손으로 정리하는 시간과 글쓰기를 따로 나눈 이유예요.',
    citation:
      'Holmes, E. A. et al. (2009, 2010). PLoS ONE, 4(1), e4153 / 5(11), e13706.',
    links: [
      { label: '2009 원문 (DOI)', href: 'https://doi.org/10.1371/journal.pone.0004153' },
      { label: '2010 원문 (DOI)', href: 'https://doi.org/10.1371/journal.pone.0013706' },
    ],
  },
  {
    id: 'hobson',
    topic: '정해진 순서의 동작과 마음 가라앉히기',
    authors: 'Hobson et al. (2018)',
    summary:
      '순서가 정해진 동작을 반복하면 시선이 당장 손끝의 움직임에 모여서 불안한 생각에서 잠깐 벗어날 수 있어요. 임상 실험보다는 여러 연구를 묶어 정리한 이론이고, 스스로 잠깐 쉬어가는 의식으로 여길 때 효과가 잘 나타나요.',
    citation:
      'Hobson, N. M., Schroeder, J., Risen, J. L., Xygalatas, D., & Inzlicht, M. (2018). Personality and Social Psychology Review, 22(3), 260-284.',
    links: [{ label: '원문 보기 (DOI)', href: 'https://doi.org/10.1177/1088868317734944' }],
  },
  {
    id: 'kyeong',
    topic: '감사와 심박수·뇌 연결 변화 (마음근력)',
    authors: '경성현·김주환·김재진 외 (2017)',
    summary:
      '국내 연구진이 fMRI와 심박수를 함께 잰 실험에서, 감사 명상을 할 때는 원망을 떠올릴 때보다 평균 심박수가 뚜렷하게 낮아졌어요. 감정을 조절하는 뇌 영역(편도체·전전두피질)과 심장 반응 사이의 연결 변화도 함께 확인됐고요. 짧은 명상 실험 결과라 메모 한 줄과 같을 순 없지만, 감사 질문을 넣은 바탕이 됐어요.',
    citation:
      'Kyeong, S., Kim, J., Kim, D. J., Kim, H. E., & Kim, J.-J. (2017). Effects of gratitude meditation on neural network functional connectivity and brain-heart coupling. Scientific Reports, 7, 5058.',
    links: [{ label: '원문 보기 (DOI)', href: 'https://doi.org/10.1038/s41598-017-05520-9' }],
  },
  {
    id: 'cascio',
    topic: '자기확언과 앞으로 할 일 떠올리기',
    authors: 'Cascio, Falk et al. (2016)',
    summary:
      '자신이 소중하게 여기는 가치를 돌아보고 앞으로 할 일을 떠올릴 때, 뇌에서 자기 인식과 보상을 맡는 부위(mPFC·vmPFC·선조체)가 더 활발해졌어요. 실험실 뇌영상 과제를 기준으로 한 연구라 짧은 메모와 강도는 다르지만, 오늘 해볼 작은 행동을 묻는 질문에 참고했어요.',
    citation:
      "Cascio, C. N., O'Donnell, M. B., Tinney, F. J., Lieberman, M. D., Taylor, S. E., Strecher, V. J., & Falk, E. B. (2016). Social Cognitive and Affective Neuroscience, 11(4), 621-629.",
    links: [{ label: '원문 보기 (DOI)', href: 'https://doi.org/10.1093/scan/nsv136' }],
  },
  {
    id: 'seligman',
    topic: '강점 떠올리기와 감사 기록',
    authors: 'Seligman et al. (2005)',
    summary:
      '자신의 강점을 새로 써보거나 하루에 좋았던 일 세 가지를 적는 활동이, 온라인 무작위 대조 실험에서 기분을 나아지게 하고 우울감을 낮췄어요. 원래는 일주일 동안 매일 정해진 형식으로 쓰는 실험이었지만, 부담 없이 한 줄씩만 남길 수 있게 줄였어요.',
    citation:
      'Seligman, M. E. P., Steen, T. A., Park, N., & Peterson, C. (2005). American Psychologist, 60(5), 410-421.',
    links: [{ label: '원문 보기 (DOI)', href: 'https://doi.org/10.1037/0003-066X.60.5.410' }],
  },
  {
    id: 'bolier',
    topic: '기대할 수 있는 효과의 크기',
    authors: 'Bolier et al. (2013)',
    summary:
      '긍정 심리 실험 39편을 모아 분석해 보니 평균 효과는 크지 않고 서서히 나타나는 편이었어요(안녕감 g = 0.20-0.34, 우울 증상 g = 0.23). 안내 없이 혼자 쓰는 웹 도구는 효과가 더 작을 수 있고, 이 공간은 의학적 치료를 대신하지 않아요.',
    citation:
      'Bolier, L., Haverman, M., Westerhof, G. J., Riper, H., Smit, F., & Bohlmeijer, E. (2013). BMC Public Health, 13, 119.',
    links: [{ label: '원문 보기 (DOI)', href: 'https://doi.org/10.1186/1471-2458-13-119' }],
  },
];

interface HelpDialogProps {
  readonly open: boolean;
  readonly themeId: DeskThemeId;
  readonly volumes: readonly ShelfVolume[];
  readonly activeVolumeId: string;
  readonly storageStatus: StorageStatus;
  readonly onSelectVolume: (volumeId: string) => void;
  readonly onCreateVolume: (preset: ShelfGridPreset) => void;
  readonly onResetActivePlacements: () => void;
  readonly onExportBackup: () => string;
  readonly onImportBackup: (payload: BackupPayloadV1) => Promise<void>;
  readonly onClose: () => void;
}

interface PendingImportState {
  readonly payload: BackupPayloadV1;
  readonly summary: BackupSummary;
  readonly fileName: string;
}

function formatKoreanDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export function HelpDialog({
  open,
  themeId,
  volumes,
  activeVolumeId,
  storageStatus,
  onSelectVolume,
  onCreateVolume,
  onResetActivePlacements,
  onExportBackup,
  onImportBackup,
  onClose,
}: HelpDialogProps) {
  const theme = DESK_THEMES[themeId];
  const [activeTab, setActiveTab] = useState<HelpTabId>('intro');
  const tabRefs = useRef<Partial<Record<HelpTabId, HTMLButtonElement | null>>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [newPreset, setNewPreset] = useState<ShelfGridPreset>('3x3');
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setDataNotice(null);
      setDataError(null);
      setPendingImport(null);
      setImporting(false);
    }
  }, [open]);

  const selectTab = useCallback((nextId: HelpTabId, focusTab = false) => {
    setActiveTab(nextId);
    if (focusTab) {
      const btn = tabRefs.current[nextId];
      if (btn) {
        btn.focus();
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }, []);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIdx = (index + 1) % HELP_TABS.length;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = (index - 1 + HELP_TABS.length) % HELP_TABS.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = HELP_TABS.length - 1;
      }
      if (nextIdx !== null) {
        e.preventDefault();
        selectTab(HELP_TABS[nextIdx].id, true);
      }
    },
    [selectTab]
  );

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setDataNotice(null);
    setDataError(null);
    setPendingImport(null);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setDataError('JSON 형식을 읽을 수 없어요. 비우어 백업 파일이 맞는지 확인해 주세요.');
        return;
      }

      const validation = validateBackupPayload(parsed);
      if (!validation.ok) {
        setDataError(validation.error);
        return;
      }

      setPendingImport({
        payload: validation.payload,
        summary: validation.summary,
        fileName: file.name,
      });
    } catch {
      setDataError('파일을 읽는 중에 문제가 생겼어요.');
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingImport || importing) return;
    setImporting(true);
    setDataError(null);
    try {
      await onImportBackup(pendingImport.payload);
      setDataNotice(
        `${pendingImport.summary.volumeCount}개 서가와 기록 ${pendingImport.summary.writtenCount}건을 불러왔어요.`
      );
      setPendingImport(null);
    } catch {
      setDataError('백업을 적용하는 중에 문제가 생겼어요.');
    } finally {
      setImporting(false);
    }
  }, [importing, onImportBackup, pendingImport]);

  const totalNotesCount = volumes.reduce(
    (sum, vol) => sum + vol.books.filter((b) => b.note !== null).length,
    0
  );
  const nextVolumeNumber =
    volumes.reduce((max, vol) => Math.max(max, vol.volumeNumber), 0) + 1;

  return (
    <PaperDialog
      open={open}
      themeId={themeId}
      titleId="help-dialog-title"
      title="비우어 안내"
      subtitle="기록은 서버가 아니라 이 브라우저에만 남아요."
      maxWidthClass="max-w-xl"
      bodyClassName="pr-1"
      onClose={onClose}
    >
      <div
        role="tablist"
        aria-label="비우어 안내 분류"
        style={{ borderColor: theme.dockBorder }}
        className="biueo-tabs-scroll mt-5 gap-5 border-b"
      >
        {HELP_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`help-tab-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id, false)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              style={{ color: selected ? theme.dockInk : theme.dockMuted }}
              className="biueo-tab font-medium"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 소개 탭 */}
      <div
        role="tabpanel"
        id="help-panel-intro"
        aria-labelledby="help-tab-intro"
        hidden={activeTab !== 'intro'}
        tabIndex={activeTab === 'intro' ? 0 : undefined}
      >
        <div className="space-y-4 pt-5 text-[15px] leading-[1.7]">
          <p>
            생각이 복잡할 때 책장을 한 번 흔들어 어질러 보세요. 흩어진 책을 색이나 크기대로 천천히
            다시 꽂고, 마지막에 유리문을 닫아두는 공간이에요.
          </p>
          <p>
            점수나 시간 제한, 정답은 없어요. 손 가는 대로 정리하다가 남기고 싶은 말이 생기면, 책을
            짧게 눌러 한 줄만 적어두면 돼요.
          </p>
          <p style={{ color: theme.dockMuted }}>
            회원가입 없이 바로 쓸 수 있고, 적은 내용은 이 브라우저 안에만 저장돼요.
          </p>
        </div>
      </div>

      {/* 사용법 탭 */}
      <div
        role="tabpanel"
        id="help-panel-guide"
        aria-labelledby="help-tab-guide"
        hidden={activeTab !== 'guide'}
        tabIndex={activeTab === 'guide' ? 0 : undefined}
      >
        <div className="space-y-5 pt-5 text-[15px] leading-[1.7]">
          <ul className="space-y-3.5">
            <li>
              <strong className="font-semibold">책장 흔들기</strong>: 문이 닫힌 상태에서 책장을 잡고
              흔들거나 Space 키를 누르면 책들이 안쪽에서 무너져요. 휴대폰에서는 기기를 직접 흔들어도
              반응해요(아이폰은 상단 &lsquo;흔들기 허용&rsquo;을 한 번 눌러주세요).
            </li>
            <li>
              <strong className="font-semibold">문 열고 정리하기</strong>: 오른쪽 걸쇠를 누르거나
              Enter 키를 누르면 문이 열려요. 흔든 뒤에 열면 책들이 책상 밖으로 쏟아지고, 그대로
              열면 꽂힌 상태를 유지해요. 다 꽂지 않고 문을 닫아도 되고, 전부 채우고 닫으면 짧은 빛과
              소리가 나요.
            </li>
            <li>
              <strong className="font-semibold">책에 메모 남기기</strong>: 문이 열린 상태에서 책을
              짧게 누르면 짧은 질문과 메모 칸이 나와요. 글을 남기면 책 위에 책갈피 리본이 생기고,
              내용을 지우면 리본도 사라져요.
            </li>
          </ul>

          <div
            style={{
              backgroundColor: theme.dockInputBg,
              borderColor: theme.dockBorder,
            }}
            className="rounded-lg border p-4 text-sm leading-relaxed"
          >
            <h2 className="font-semibold" style={{ color: theme.dockInk }}>
              키보드 단축키
            </h2>
            <dl className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2">
                <dt style={{ color: theme.dockMuted }}>책장 흔들기</dt>
                <dd className="font-medium">Space 길게 누르기</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt style={{ color: theme.dockMuted }}>유리문 열기·닫기</dt>
                <dd className="font-medium">Enter</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt style={{ color: theme.dockMuted }}>메모 즉시 저장</dt>
                <dd className="font-medium">Ctrl / Cmd + Enter</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt style={{ color: theme.dockMuted }}>창 닫기</dt>
                <dd className="font-medium">Esc</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* 연구 근거 탭 */}
      <div
        role="tabpanel"
        id="help-panel-research"
        aria-labelledby="help-tab-research"
        hidden={activeTab !== 'research'}
        tabIndex={activeTab === 'research' ? 0 : undefined}
      >
        <div className="space-y-4 pt-5 text-sm leading-relaxed">
          <p className="text-[15px] leading-[1.65]" style={{ color: theme.dockMuted }}>
            책장 정리와 한 줄 메모를 만들 때 참고한 연구들이에요.
          </p>

          <ul className="space-y-3">
            {RESEARCH_CITATIONS.map((item) => (
              <li
                key={item.id}
                style={{
                  backgroundColor: theme.dockInputBg,
                  borderColor: theme.dockBorder,
                }}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-[15px] font-semibold" style={{ color: theme.dockInk }}>
                    {item.topic}
                  </strong>
                  <span className="text-sm font-medium" style={{ color: theme.dockMuted }}>
                    {item.authors}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-[1.65]" style={{ color: theme.dockInk }}>
                  {item.summary}
                </p>
                <p className="mt-2 text-sm" style={{ color: theme.dockMuted }}>
                  {item.citation}
                </p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {item.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: theme.dockInk }}
                      className="biueo-link inline-flex min-h-9 items-center text-sm font-medium underline underline-offset-4"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 데이터 탭 */}
      <div
        role="tabpanel"
        id="help-panel-data"
        aria-labelledby="help-tab-data"
        hidden={activeTab !== 'data'}
        tabIndex={activeTab === 'data' ? 0 : undefined}
      >
        <div className="space-y-5 pt-5 text-sm leading-relaxed">
          <p className="text-[15px] leading-[1.65]">
            책 배치와 메모는 지금 쓰는 브라우저 안에만 저장돼요. 브라우저 데이터를 지우면 기록도 같이
            없어지니, 남겨두고 싶은 글이 쌓이면 가끔 JSON 파일로 백업해 두세요.
          </p>

          {/* 저장소 상태 카드 */}
          <div
            style={{
              backgroundColor: theme.dockInputBg,
              borderColor: theme.dockBorder,
            }}
            className="space-y-2 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">저장 상태</span>
              <span
                style={{
                  color:
                    storageStatus.backend === 'indexeddb'
                      ? theme.dockSuccess
                      : theme.dockDanger,
                }}
                className="font-medium"
              >
                {storageStatus.backend === 'indexeddb'
                  ? '브라우저 로컬 저장소 연결됨'
                  : '임시 메모리 모드 (종료 시 초기화됨)'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span style={{ color: theme.dockMuted }}>보관 중인 기록</span>
              <span className="font-medium tabular-nums">
                서가 {volumes.length}개 · 메모 {totalNotesCount}권
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span style={{ color: theme.dockMuted }}>브라우저 자동 삭제 보호</span>
              <span className="font-medium">
                {storageStatus.persisted === true
                  ? '보호됨'
                  : storageStatus.persisted === false
                    ? '첫 기록 저장 시 요청'
                    : '브라우저 확인 불가'}
              </span>
            </div>
          </div>

          {/* 서가 관리 및 Vol. N+1 생성 */}
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold">서가 관리</h2>
            <p className="text-sm leading-relaxed" style={{ color: theme.dockMuted }}>
              새 서가를 만들어도 이전 서가를 언제든 다시 열어 흔들고 정리하거나 메모를 고칠 수
              있어요.
            </p>

            <ul className="space-y-2">
              {volumes.map((vol) => {
                const isActive = vol.id === activeVolumeId;
                const written = vol.books.filter((b) => b.note !== null).length;
                const presetLabel = vol.gridPreset === '5x3' ? '5×3' : '3×3';
                return (
                  <li key={vol.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVolume(vol.id);
                        onClose();
                      }}
                      style={{
                        backgroundColor: isActive ? theme.dockInputBg : 'transparent',
                        borderColor: isActive ? theme.dockInk : theme.dockBorderStrong,
                        color: theme.dockInk,
                      }}
                      className="biueo-btn flex w-full items-center justify-between border px-3.5 py-2.5 text-left"
                    >
                      <span className="font-medium">
                        {vol.title} · {presetLabel}
                      </span>
                      <span className="text-sm tabular-nums" style={{ color: theme.dockMuted }}>
                        {written} / {vol.books.length}권 {isActive ? '· 열림' : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div
              style={{ borderColor: theme.dockBorder }}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border p-3.5"
            >
              <div className="flex items-center gap-2" role="group" aria-label="새 서가 크기 고르기">
                {(['3x3', '5x3'] as const).map((preset) => {
                  const selected = newPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setNewPreset(preset)}
                      style={{
                        backgroundColor: selected ? theme.dockAccent : 'transparent',
                        color: selected ? theme.dockAccentInk : theme.dockInk,
                        borderColor: theme.dockBorderStrong,
                      }}
                      className="biueo-btn border px-3 text-sm font-medium"
                    >
                      {preset === '3x3' ? '3×3 (36권)' : '5×3 (60권)'}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  onCreateVolume(newPreset);
                  setDataNotice(`Vol. ${nextVolumeNumber} 서가를 새로 열었어요.`);
                }}
                style={{
                  backgroundColor: theme.dockAccent,
                  color: theme.dockAccentInk,
                }}
                className="biueo-btn px-4 text-sm font-medium"
              >
                Vol. {nextVolumeNumber} 새로 시작
              </button>
            </div>

            <div
              style={{ borderColor: theme.dockBorder }}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border p-3.5"
            >
              <p className="text-sm leading-relaxed" style={{ color: theme.dockMuted }}>
                메모는 그대로 두고, 흩어진 책만 처음처럼 책장에 꽂아둬요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDataError(null);
                  onResetActivePlacements();
                  setDataNotice('현재 서가의 책을 제자리로 돌려놨어요.');
                }}
                style={{
                  borderColor: theme.dockBorderStrong,
                  color: theme.dockInk,
                }}
                className="biueo-btn border px-3.5 text-sm font-medium"
              >
                현재 서가 책 제자리로 돌려놓기
              </button>
            </div>
          </section>

          {/* JSON 백업 및 복원 */}
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold">JSON 백업과 복원</h2>
            <p className="text-sm leading-relaxed" style={{ color: theme.dockMuted }}>
              백업 파일을 고르면 서가 수와 메모 수를 먼저 보여준 뒤, 확인을 누를 때 현재 브라우저
              기록을 바꿔요.
            </p>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDataError(null);
                  setPendingImport(null);
                  const filename = onExportBackup();
                  setDataNotice(`백업 파일(${filename})을 내려받았어요.`);
                }}
                style={{
                  backgroundColor: theme.dockAccent,
                  color: theme.dockAccentInk,
                }}
                className="biueo-btn px-4 text-sm font-medium"
              >
                JSON 파일로 백업하기
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  borderColor: theme.dockBorderStrong,
                  color: theme.dockInk,
                }}
                className="biueo-btn border px-4 text-sm font-medium"
              >
                JSON 파일에서 불러오기
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="백업 JSON 파일 고르기"
                onChange={handleFileChange}
              />
            </div>

            {dataError && (
              <p
                role="alert"
                style={{ color: theme.dockDanger }}
                className="text-sm font-medium"
              >
                {dataError}
              </p>
            )}

            {dataNotice && (
              <p
                role="status"
                style={{ color: theme.dockSuccess }}
                className="text-sm font-medium"
              >
                {dataNotice}
              </p>
            )}

            {pendingImport && (
              <div
                style={{
                  backgroundColor: theme.dockInputBg,
                  borderColor: theme.dockBorderStrong,
                }}
                className="space-y-3 rounded-lg border p-4"
              >
                <p className="font-semibold">이 백업으로 바꿀까요?</p>
                <p className="text-sm leading-relaxed" style={{ color: theme.dockMuted }}>
                  {pendingImport.fileName} · 서가 {pendingImport.summary.volumeCount}개 · 메모{' '}
                  {pendingImport.summary.writtenCount}건 ·{' '}
                  {formatKoreanDateTime(pendingImport.summary.exportedAt)}
                </p>
                <p className="text-sm" style={{ color: theme.dockDanger }}>
                  지금 브라우저에 저장된 내용은 선택한 백업으로 교체돼요.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleConfirmImport}
                    style={{
                      backgroundColor: theme.dockAccent,
                      color: theme.dockAccentInk,
                    }}
                    className="biueo-btn px-4 text-sm font-medium"
                  >
                    {importing ? '불러오는 중...' : '이 백업으로 바꾸기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    style={{
                      borderColor: theme.dockBorderStrong,
                      color: theme.dockInk,
                    }}
                    className="biueo-btn border px-3.5 text-sm font-medium"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </PaperDialog>
  );
}
