# 비우어 (biueo) — Progress Log & Session Handover

> 새 세션 시작 시 반드시 `AGENTS.md` -> `docs/PLAN.md` -> `docs/CONTRACTS.md` -> 본 파일 순으로 읽고, 이미 확정된 설계를 재질문(재그릴링)하지 마십시오.

## Current Status
- **Active Phase**: Phase 3 완료 · Firebase Hosting 실서버 배포(`https://biueo.web.app`) 및 WIF 키리스 2단 CI/CD 구성 완료
- **Repository State**: Phase 3(1페이지 리츄얼 편집 `BookNoteDialog`, `IndexedDB` `biueo-db` v1 영속화, `Vol. 2` 다중 서가 동등 확장, JSON 백업/복원 검증, `?` 모달 4탭 개편 및 6편 논문·DOI 링크·Kyeong et al. 2017 반영, 전 UI `>= 14px`·8종 테마 고대비 토큰 정립) 및 Firebase Hosting(`biueo-mind` / `https://biueo.web.app`)·GCP Workload Identity Federation(OIDC 키리스)·`.github/workflows/ci-deploy.yml`·GitHub `production` 환경 수동 승인 게이트 구축 완료.

## Completed Milestones
- [x] 핵심 컨셉 및 6편 검증 논문 근거 조사 (Holmes 2009/2010, Hobson 2018, Kyeong·김주환·김재진 2017, Cascio 2016, Seligman 2005, Bolier 2013 — 철회 논문 Brooks 2016 제거 및 적용 한계 명시)
- [x] *A Little to the Left* 4장 시각 레퍼런스 분석 및 무외곽선 과슈·리소그래프 스택 확정 (`Rough.js`·`PixiJS`·`ThreeRT`·외부 PNG 에셋 제외)
- [x] 제품 그릴링 완료 (`3×3` 기본 + `5×3` 대형 프리셋 병행, 책당 1페이지 + Vol. 2 완전 동등 확장, 완결 Soft Fork, 무텍스트 순수 감각 보상, `?` 버튼 전용 도움말, 추후 랜덤 옵트인 설정, 모바일 28px 터치 보정, 문 열림 연속 쏟아짐·허공 낙하 물리)
- [x] **Phase 0 구현 및 게이트 통과**: 스캐폴딩, 조합론적 덱, fBm 종이·초크 입자 베이커, 3×3 책장·유리문·걸쇠·리본 렌더러
- [x] **Phase 1 구현 및 검증 완료**: `Matter.js` 밀폐 흔들기·연속 데스크 쏟아짐(`openDoorAndSpill`)·허공 중력 낙하(`desk_drop`), 키네마틱 자석 스냅(`SlotSystem`), `ShelfEngineController`, 책등 ±1.1° 기울기 및 칸 모서리 점묘 음영 보강, 모바일 28px 근접 자석 및 `-48px` 들림 오프셋, `HelpDialog`·`BookPeekDialog`
- [x] **후속 고도화 (Phase 1+)** — 2.5D 스칼라 깊이(`depthZ`) + 쿨롱 마찰 기반 전도/미끄러짐 경쟁 물리 및 쓰러진 책(`fallenDir`) 옆 자유 구간 삽입(`computeCompartmentFreeZones`)
- [x] **후속 고도화 (Phase 1+)** — 16종 리츄얼 프롬프트 풀(`4축 × 4변형`, Murmur3 결정론 배정) 및 무외곽선 직인쇄 UI(`IBM Plex Sans KR` 단일 서체, `.paper-sheet-dialog`)
- [x] **후속 고도화 (Phase 1+)** — 8종 라이트(4)·다크(4) 큐레이션 랜덤 테마(`src/shared/theme/deskThemes.ts`, WCAG AA `>= 4.5:1`, OS `prefers-color-scheme` 동기화, 직전 테마 배제 랜덤)
- [x] **후속 고도화 (Phase 1+)** — 다중 콘텐츠 확장 대비 모듈화(`src/shared/` + `src/modules/bookshelf/`) 및 데드코드 정리
- [x] **후속 고도화 (Phase 1+)** — 하단 버튼(`흔들기`·`문 열기`·`걸쇠 잠그기`) 및 1회성 유령 힌트(`GhostHint.tsx`) 제거, 통합 손 커서(`grab`/`grabbing`), 부분 배치 문 닫기 자유화, 초기 `2.5s` 유휴 글린트 + `36/36` 완결 걸쇠 흔들림, `Enter` 키 문 토글
- [x] **Phase 2 구현 및 검증 완료** — Web Audio 프로시저럴 우드·펠트 폴리(`foleySynth.ts`) 및 Android 점진적 햅틱(음소거 연동, iOS Safari 안전 폴백), 상단 우측 32×32px 직인쇄 스피커 토글(`AppChrome.tsx`), 5종 계층 질서 감지기(`orderDetector.ts`: 엄격 대칭 아치·쓰러진 책 제외·`3 <= written < total` 가드), Tier 0-3 최상위 중심 파스텔 웨이브·별빛 렌더러(`orderCelebration.ts`), 정리 중(`OPEN_TIDYING`) 칸별 실시간 시각 질서 펄스·단음 피드백(`detectLiveCompartmentOrders`: 4권 이상, 색·높이·무늬 3종 한정)
- [x] **Phase 3 구현 및 검증 완료** — `BookNoteDialog.tsx` 1페이지 리츄얼 편집(고정 질문·`16px` 자동 확장 `<textarea>`·배경/Esc 자동 저장·`[저장]`·`[비우기]`·책갈피 리본 재베이킹), `src/storage/db.ts`(`biueo-db` v1·메모리 폴백·첫 기록 시 `persist()` 1회 호출), `src/storage/backup.ts`(JSON v1 내보내기/엄격 검증/인라인 확인 복원), Vol. 2 다중 서가 동등 전환(`NewVolumeDialog.tsx`·`shelfEngine.ts` `loadVolume` 캐시 초기화), `HelpDialog.tsx` 4탭(`소개`/`사용법`/`연구 근거`/`데이터`), 전 UI `>= 14px` 및 8종 테마 WCAG AA 고대비 시맨틱 토큰, `/humanize` 기반 담백한 해요체 윤문

## Latest Verification Evidence (Phase 3 완료 기준)
- `npx tsc --noEmit`: 0 errors
- `npm run build` (Vite 8.3.8): built in `242ms` (`dist/assets/index-OFyNsUNk.js` `433.80 kB`, `dist/assets/index-DZqkHKfz.css` `18.61 kB`)
- `npx vitest run`: **10 files, 57 tests passed** (`deskThemes.test.ts` 3, `defaultBooks.test.ts` 5, `shelfLayout.test.ts` 3, `slotSystem.test.ts` 12, `chaosWorld.test.ts` 10, `orderDetector.test.ts` 9, `orderCelebration.test.ts` 4, `foleySynth.test.ts` 5, `backup.test.ts` 3, `db.test.ts` 3)
- Live Browser Check (`http://localhost:5174/`, console errors 0, page errors 0, 6편 논문 반영 및 문구 재작성 직전 기준): 데스크톱 `1440×900` 및 모바일 `390×844`에서 0권 `3×3|5×3` 전환 및 첫 기록 후 잠금, `BookNoteDialog` 포커스(`16px`)·외부 클릭 자동 저장·`F5` IndexedDB 복원·`[비우기]`·`[저장]`, `HelpDialog` 4탭 클릭/키보드 전환·DOI 링크·JSON 백업 다운로드·오류 파일 거부·`Vol. 2 (5×3)` 생성 및 미배치 책 유지 중도 전환, `390×844` 상단 1줄 무겹침 및 전체 버튼 `>= 30.77×36px` 확인 (문구 수정·Kyeong 2017 추가 후 브라우저는 재실행하지 않음)

## Phase 0 Visual Gate Verdict
- **Status**: PASS (Phase 3 반영 완료)

## Phase Checklist
- [x] **Phase 0**: 프로젝트 스캐폴딩 + 1화면 과슈·리소그래프 시각 더미 Spike (**PASS**)
- [x] **Phase 1 (+ 고도화·모듈화)**: 2.5D 전도-미끄러짐 물리 + 쓰러진 책 옆 자유 삽입 + 부분 배치 문 닫기 + `3×3`/`5×3` 프리셋 + 모바일 터치 보정 + 8종 라이트/다크 랜덤 테마 + 무외곽선 직인쇄 UI + `src/shared`·`src/modules/bookshelf` 모듈화 (**PASS**)
- [x] **Phase 2**: Web Audio 프로시저럴 폴리(`src/modules/bookshelf/audio/foleySynth.ts`) + 안드로이드 점진적 햅틱(`navigator.vibrate`, iOS Safari 미지원 한계 반영) + 5종 질서 감지기(`src/modules/bookshelf/order/orderDetector.ts`) + Tier 0-3 파스텔 웨이브·화음(**PASS**)
- [x] **Phase 3**: `<dialog>` 1페이지 로컬 리츄얼 편집(`src/modules/bookshelf/components/BookNoteDialog.tsx`) + 책갈피 리본 + `IndexedDB`(`src/storage/`) + Vol. 2 동등 확장 + JSON 백업 + 4탭 `HelpDialog` + `>= 14px` 가독성·고대비 토큰 (**PASS**)
- [ ] **Phase 4**: 키보드 책 선택·이동 접근성 + PWA 오프라인 + 정적 배포 검증
- [ ] **Next Research Track (별도 세션)**: 인지신경과학 논문 서치 기반 2차 피젯 콘텐츠 기획
