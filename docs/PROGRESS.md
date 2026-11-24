# 비우어 (biueo) — Session Handover & Progress Log

> 새 세션 시작 시 반드시 `AGENTS.md` -> `docs/PLAN.md` -> `docs/CONTRACTS.md` -> 본 파일 순으로 읽고, 이미 확정된 설계를 재질문(재그릴링)하지 마십시오.

## Current Status
- **Active Phase**: Phase 1 완료 및 검증 통과 (Phase 2 착수 대기)
- **Repository State**: `3×3`(36권) 및 `5×3`(60권, 모바일 `3×5` 자동 전치) 이중 물리(흔들기·연속 쏟아짐·허공 낙하)·터치 보정·최소 HUD·네이티브 `<dialog>` 구현 및 `biueo` 리네이밍 완료

## Completed Milestones
- [x] 핵심 컨셉 및 5편 검증 논문 근거 조사 (Holmes 2009/2010, Brooks 2016, Cascio 2016, Seligman 2005, Bolier 2013)
- [x] *A Little to the Left* 4장 시각 레퍼런스 분석 및 무외곽선 과슈·리소그래프 스택 확정 (`Rough.js`·`PixiJS`·`ThreeRT`·외부 PNG 에셋 제외)
- [x] 제품 그릴링 완료 (`3×3` 기본 + `5×3` 대형 프리셋 병행, 책당 1페이지 + Vol. 2 완전 동등 확장, 완결 Soft Fork, 무텍스트 순수 감각 보상, `?` 버튼 전용 도움말 + 1회성 유령 힌트, 추후 랜덤 옵트인 설정, 모바일 28px 터치 보정, 문 열림 연속 쏟아짐·허공 낙하 물리)
- [x] **Phase 0 구현 및 게이트 통과**: 스캐폴딩, 조합론적 덱, fBm 종이·초크 입자 베이커, 3×3 책장·유리문·걸쇠·리본 렌더러
- [x] **Phase 1 구현 및 검증 완료**: `Matter.js` 밀폐 흔들기·연속 데스크 쏟아짐(`openDoorAndSpill`)·허공 중력 낙하(`desk_drop`), 키네마틱 자석 스냅(`SlotSystem`), `ShelfEngineController`, 책등 ±1.1° 기울기 및 칸 모서리 점묘 음영 보강, 모바일 28px 근접 자석 및 `-48px` 들림 오프셋, `MinimalHud`·`GhostHint`·`HelpDialog`·`BookPeekDialog`

## Phase 1 Verification Evidence
- `npx tsc --noEmit`: 0 errors
- `npm run build` (Vite 8.3.8): built in 196ms (`dist/assets/index-FiANJM42.js` 365.45 kB / gzip 116.55 kB)
- `npx vitest run` (Vitest 5.1.1): 4 files, 17 tests passed (`defaultBooks.test.ts` 4, `shelfLayout.test.ts` 3, `slotSystem.test.ts` 5, `chaosWorld.test.ts` 5 — `openDoorAndSpill`·`desk_drop` 포함)
- Live Browser Check (`http://localhost:5173`, console errors 0):
  - Desktop `1440×900`: 첫 접속 자동 모달 없음 확인, `흔들기` -> `문 열기` 연속 물리 쏟아짐·마찰 정지(`final_step_69.png`), 칸 외 허공 드롭 시 바닥/더미 위 중력 낙하·휴면 책 보존(`final_step_91.png`, `final_step_101.png`), 드래그 자석 꽂기, 짧은 탭 `BookPeekDialog` 및 `?` `HelpDialog` 열기/닫기, `5×3`(60권) 흔들기·쏟기 확인
  - Mobile `390×844` (`5×3` 프리셋): `3×5` 세로 전치 및 단일 행 하단 HUD(`334.13×44.66px`) 겹침 없음 확인 (`final_step_38.png`, 연속 쏟아짐 확장 전 베이스라인)

## Phase 0 Visual Gate Verdict
- **Status**: PASS (Phase 1 내 미세 보강 반영 완료)

## Phase Checklist
- [x] **Phase 0**: 프로젝트 스캐폴딩 + 1화면 과슈·리소그래프 시각 더미 Spike (**PASS**)
- [x] **Phase 1**: Matter.js 밀폐 흔들기 + 키네마틱 자석 스냅 + `3×3`/`5×3` 프리셋 + 모바일 터치 보정 + 문 열림 분기 + 최소 HUD·`?` 도움말 `<dialog>`·1회성 유령 힌트 (**PASS**)
- [ ] **Phase 2**: Web Audio 폴리 합성 + 계층적 5종 질서 감지기 + 순수 감각 보상(Tier 0-3)
- [ ] **Phase 3**: `<dialog>` 1페이지 로컬 리츄얼 + 책갈피 리본 + IndexedDB + Vol. 2 동등 확장 + JSON 백업 + 선별 DOM 감사
- [ ] **Phase 4**: 5편 논문 근거 탭 완성 + 키보드 접근성 + PWA + 정적 배포 검증
