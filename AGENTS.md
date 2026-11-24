# 비우어 (biueo) — Agent Session Handover Guide

이 리포지토리에서 새 세션을 시작하는 모든 에이전트는 코드를 수정하거나 사용자에게 질문하기 전에 아래 3개 문서를 순서대로 읽어야 합니다.

1. `docs/PROGRESS.md` — 현재 진행 단계, 완료 항목, Phase 0 게이트 판정 확인.
2. `docs/PLAN.md` — 제품 철학, 8대 확정 결정, **Explicit Non-Goals**, Phase 0-4 로드맵 확인.
3. `docs/CONTRACTS.md` — 동결된 TypeScript 타입, IndexedDB·JSON v1 스키마, Engine↔UI API, 정규화 좌표, 질서 감지 규칙, 고정 한국어 문구 확인.

## Session Rules
- `docs/PLAN.md`와 `docs/CONTRACTS.md`에 이미 확정된 제품·데이터 결정은 사용자에게 재그릴링하지 마십시오.
- `docs/PLAN.md`의 **Explicit Non-Goals**에 명시된 기능(로그인, 점수, 타이머, 텍스트 축하 배지, 과장된 의학 문구 등)을 임의로 추가하지 마십시오.
- 각 Phase 완료 및 검증 후 `docs/PROGRESS.md`를 최신 상태로 갱신하십시오.