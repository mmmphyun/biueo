# 비우어 (biueo) — Progress Log & Session Handover

> 새 세션 시작 시 반드시 `AGENTS.md` -> `docs/PLAN.md` -> `docs/CONTRACTS.md` -> 본 파일 순으로 읽고, 이미 확정된 설계를 재질문(재그릴링)하지 마십시오.

## Current Status
- **Active Phase**: Phase 1 및 후속 물리·UI·모듈화 고도화 완료 (Phase 2 또는 Phase 3 새 세션 착수 대기)
- **Repository State**: `HEAD` 최신 `main` 동기화 완료. `3×3`(36권) 및 `5×3`(60권, 모바일 `3×5` 자동 전치) 2.5D 전도-미끄러짐 물리·쓰러진 책 옆 자유 삽입·부분 배치 문 닫기·무외곽선 직인쇄 UI·8종 라이트/다크 랜덤 테마·`src/shared` + `src/modules/bookshelf` 모듈화 완료.

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

## Latest Verification Evidence (as of `4f5dab5`, executed prior to docs-only sync)
- `npx tsc --noEmit`: 0 errors
- `npm run build` (Vite 8.3.8): built in `266ms` (`dist/assets/index-De-WqgIb.js` `382.85 kB`)
- `npx vitest run`: **5 files, 33 tests passed** (`deskThemes.test.ts` 3, `defaultBooks.test.ts` 5, `shelfLayout.test.ts` 3, `slotSystem.test.ts` 12, `chaosWorld.test.ts` 10)
- Live Browser Check (`http://localhost:5173/`, console errors 0): 데스크톱 `1440×900` 및 모바일 `390×844`에서 하단 버튼·힌트 부재, 걸쇠/프레임 통합 `grab` 커서, `Space` 흔들기, 부분 배치 문 닫기(데스크 책 유지), `Enter` 토글, 라이트/다크 랜덤 테마 전환, `PaperDialog` 모달 확인(`final_step_165.png`)

## Phase 0 Visual Gate Verdict
- **Status**: PASS (Phase 1 및 후속 고도화 반영 완료)

## Phase Checklist
- [x] **Phase 0**: 프로젝트 스캐폴딩 + 1화면 과슈·리소그래프 시각 더미 Spike (**PASS**)
- [x] **Phase 1 (+ 고도화·모듈화)**: 2.5D 전도-미끄러짐 물리 + 쓰러진 책 옆 자유 삽입 + 부분 배치 문 닫기 + `3×3`/`5×3` 프리셋 + 모바일 터치 보정 + 8종 라이트/다크 랜덤 테마 + 무외곽선 직인쇄 UI + `src/shared`·`src/modules/bookshelf` 모듈화 (**PASS**)
- [ ] **Phase 2**: Web Audio 프로시저럴 폴리(`src/modules/bookshelf/audio/foleySynth.ts`) + 안드로이드 점진적 햅틱(`navigator.vibrate`, iOS Safari 미지원 한계 반영) + 5종 질서 감지기(`src/modules/bookshelf/order/orderDetector.ts`) + Tier 0-3 파스텔 웨이브·화음
- [ ] **Phase 3**: `<dialog>` 1페이지 로컬 리츄얼 편집(`src/modules/bookshelf/components/BookNoteDialog.tsx`) + 책갈피 리본 + `IndexedDB`(`src/storage/`) + Vol. 2 동등 확장 + JSON 백업 + 선별 DOM 감사
- [ ] **Phase 4**: 5편 논문 근거 탭 완성 + 키보드 책 이동 접근성 + PWA 오프라인 + 정적 배포 검증
- [ ] **Next Research Track (별도 세션)**: 인지신경과학 논문 서치 기반 2차 피젯 콘텐츠 기획
