# 비우어 (biueo) — Progress Log & Session Handover

> 새 세션 시작 시 반드시 `AGENTS.md` -> `docs/PLAN.md` -> `docs/CONTRACTS.md` -> 본 파일 순으로 읽고, 이미 확정된 설계를 재질문(재그릴링)하지 마십시오.

## Current Status
- **Active Phase**: Phase 2 완료 (Phase 3 착수 대기)
- **Repository State**: Phase 2(Web Audio 어쿠스틱 우드·펠트 폴리, Android 점진적 햅틱, 5종 계층 질서 감지기, Tier 0-3 파스텔 웨이브·별빛 연출, 상단 직인쇄 스피커 음소거 토글) 구현 및 단위 테스트·빌드·라이브 브라우저 검증 완료.

## Completed Milestones
- [x] 핵심 컨셉 및 5편 검증 논문 근거 조사 (Holmes 2009/2010, Brooks 2016, Cascio 2016, Seligman 2005, Bolier 2013)
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

## Latest Verification Evidence (Phase 2 완료 기준)
- `npx tsc --noEmit`: 0 errors
- `npm run build` (Vite 8.3.8): built in `243ms` (`dist/assets/index-BG5sK_A1.js` `401.46 kB`, `dist/assets/index-Dc837I-c.css` `15.70 kB`)
- `npx vitest run`: **8 files, 51 tests passed** (`deskThemes.test.ts` 3, `defaultBooks.test.ts` 5, `shelfLayout.test.ts` 3, `slotSystem.test.ts` 12, `chaosWorld.test.ts` 10, `orderDetector.test.ts` 9, `orderCelebration.test.ts` 4, `foleySynth.test.ts` 5)
- Live Browser Check (`http://localhost:5173/`, console errors 0, page errors 0, 선행 Phase 2 커밋 기준): 데스크톱 `1440×900` 및 모바일 `390×844`에서 스피커 음소거 토글(`aria-pressed` 및 새로고침 유지), `Space` 흔들기·`Enter` 문 열림(쏟아짐)·`Enter` 문 닫힘, 390px 상단 크롬 1줄 무겹침 확인 (실시간 칸별 피드백 추가 및 4권·3종 정제 후 브라우저 재실행은 미수행)

## Phase 0 Visual Gate Verdict
- **Status**: PASS (Phase 2 반영 완료)

## Phase Checklist
- [x] **Phase 0**: 프로젝트 스캐폴딩 + 1화면 과슈·리소그래프 시각 더미 Spike (**PASS**)
- [x] **Phase 1 (+ 고도화·모듈화)**: 2.5D 전도-미끄러짐 물리 + 쓰러진 책 옆 자유 삽입 + 부분 배치 문 닫기 + `3×3`/`5×3` 프리셋 + 모바일 터치 보정 + 8종 라이트/다크 랜덤 테마 + 무외곽선 직인쇄 UI + `src/shared`·`src/modules/bookshelf` 모듈화 (**PASS**)
- [x] **Phase 2**: Web Audio 프로시저럴 폴리(`src/modules/bookshelf/audio/foleySynth.ts`) + 안드로이드 점진적 햅틱(`navigator.vibrate`, iOS Safari 미지원 한계 반영) + 5종 질서 감지기(`src/modules/bookshelf/order/orderDetector.ts`) + Tier 0-3 파스텔 웨이브·화음(**PASS**)
- [ ] **Phase 3**: `<dialog>` 1페이지 로컬 리츄얼 편집(`src/modules/bookshelf/components/BookNoteDialog.tsx`) + 책갈피 리본 + `IndexedDB`(`src/storage/`) + Vol. 2 동등 확장 + JSON 백업 + 선별 DOM 감사
- [ ] **Phase 4**: 5편 논문 근거 탭 완성 + 키보드 책 이동 접근성 + PWA 오프라인 + 정적 배포 검증
- [ ] **Next Research Track (별도 세션)**: 인지신경과학 논문 서치 기반 2차 피젯 콘텐츠 기획
