# 비우어 (biueo) — Technical Contracts & Specifications (v1)

> 본 문서는 세션 간 컨텍스트 유실 없이 Phase 0-4를 일관되게 구현하기 위한 **동결된 인터페이스·데이터·수학 계약서**입니다.
> Phase 0 시각 검증 게이트 통과 전까지 내부 구현 세부 사항은 열려 있으나, 아래 외부 경계와 스키마는 모든 Phase가 준수합니다.

---

## 1. Domain & Storage TypeScript Contracts (`src/types/contracts.ts`)

```ts
export type DeskThemeId = 'sage' | 'slate' | 'lavender' | 'charcoal';

export type ShelfState =
  | 'LOCKED_NEAT'
  | 'SHAKING_CHAOS'
  | 'OPEN_TIDYING'
  | 'BOOK_OPEN_MODAL';

/** 9색 × 4권 = 36권. colorOrderIndex(0-8)는 색상환 및 톤 그라데이션 순서를 정의함. */
export type BookColorId =
  | 'coral'     // 0: #D84B6B
  | 'salmon'    // 1: #DF7D6E
  | 'butter'    // 2: #F4DC82
  | 'olive'     // 3: #9EAD75
  | 'sage'      // 4: #7FA89B
  | 'slate'     // 5: #768EA3
  | 'oat'       // 6: #D4B494
  | 'cream'     // 7: #F5EFE4
  | 'charcoal'; // 8: #353B45

export type BookHeightTier = 0 | 1 | 2 | 3; // short(0.70), medium(0.78), tall(0.86), grand(0.93)
export type BookThicknessTier = 0 | 1 | 2;  // thin(0.165), medium(0.195), thick(0.225)

export type SpineMotif =
  | 'diamond'
  | 'bands'
  | 'stitch'
  | 'wave'
  | 'dots'
  | 'plain';

export type RitualPromptType =
  | 'strength_recall'  // Seligman et al. (2005)
  | 'future_action'    // Cascio, Falk et al. (2016)
  | 'self_compassion'  // Three Good Things / 자기격려
  | 'gratitude';       // Seligman et al. (2005)

export interface RitualNote {
  readonly promptType: RitualPromptType;
  readonly promptText: string;
  content: string;           // max 280 chars, trim 후 빈 문자열이면 삭제(null)로 처리
  readonly createdAt: string; // ISO 8601
  updatedAt: string;          // ISO 8601
}

export type ShelfGridPreset = '3x3' | '5x3';

export interface ShelfSlotPlacement {
  /** 0-8 (3x3) 또는 0-14 (5x3) */
  compartmentIndex: number;
  /** 칸 내부 좌->우 정렬 순서 (0-based) */
  orderInCompartment: number;
  /** 칸 내부 정규화 좌측 x 좌표 */
  normX?: number;
  /** 칸 내부 쓰러짐 방향 (-1: 좌측, 1: 우측, undefined: 기립 상태) */
  fallenDir?: -1 | 1;
}

export interface BookModel {
  readonly id: string;            // 예: "vol1-book-00" .. "vol1-book-35" (5x3은 59)
  readonly seed: number;          // 결정론적 손재단 굴곡·질감 시드
  readonly colorId: BookColorId;
  readonly colorOrderIndex: number; // 0-8
  readonly heightTier: BookHeightTier;
  readonly thicknessTier: BookThicknessTier;
  readonly motif: SpineMotif;
  readonly defaultPromptType: RitualPromptType;
  placement: ShelfSlotPlacement | null; // null이면 데스크 여백/혼돈 상태에 위치
  note: RitualNote | null;              // 책당 1페이지 고정
}

export interface ShelfVolume {
  readonly id: string;           // 예: "vol-1", "vol-2"
  readonly volumeNumber: number; // 1부터 시작
  readonly gridPreset: ShelfGridPreset; // 볼륨 생성 시 불변 고정 ('3x3' | '5x3')
  readonly gridCols: number;     // 3 또는 5
  readonly gridRows: number;     // 3
  title: string;                 // 기본값: "Vol. 1"
  readonly createdAt: string;    // ISO 8601
  updatedAt: string;             // ISO 8601
  books: BookModel[];            // gridCols * gridRows * 4권 (36권 또는 60권)
}

export interface OnboardingHintsSeen {
  shakeOrUnlatch: boolean; // 첫 흔들기 또는 걸쇠 열기 완료 시 true
  dragOrTapBook: boolean;  // 첫 드래그 꽂기 또는 책 탭 완료 시 true
  closeLatch: boolean;     // 첫 정돈 완료 잠금 시 true
}

export interface VisualTuningParams {
  grainStrength: number; // 0.0 - 1.0 (기본 0.32)
  edgeJitterPx: number;  // 0.0 - 1.5 (기본 0.7)
  shadowOffsetPx: number; // 2 - 12 (기본 6)
}

export interface UserPreferences {
  readonly id: 'singleton';
  theme: DeskThemeId;
  activeVolumeId: string;
  lastActiveModuleId: string; // v1 기본값: 'bookshelf' (2차 콘텐츠 추가 시 재방문 복원용)
  openRandomOnVisit: boolean; // v1 기본값: false (2차 콘텐츠 추가 시 접속 시 랜덤 진입 옵트인)
  audioEnabled: boolean;
  motionShakeEnabled: boolean; // 모바일 DeviceMotion 허용 상태
  hintsSeen: OnboardingHintsSeen;
  tuning: VisualTuningParams;
}

export interface BackupPayloadV1 {
  readonly app: 'biueo';
  readonly schemaVersion: 1;
  readonly exportedAt: string; // ISO 8601
  readonly preferences: UserPreferences;
  readonly volumes: ShelfVolume[];
}
```

---

## 2. IndexedDB & JSON Backup Contract (`src/storage/`)

- **Database Name**: `biueo-db`, **Version**: `1`
- **Object Stores**:
  1. `volumes` (`keyPath: 'id'`): `ShelfVolume` 저장.
  2. `preferences` (`keyPath: 'id'`): `UserPreferences` (`id: 'singleton'`) 저장.
- **Persistence Hardening**:
  - 사용자가 첫 번째 `RitualNote`를 저장하는 순간 `navigator.storage?.persist?.()`를 1회 호출합니다.
  - IndexedDB 불가 환경(일부 프라이빗 모드)에서는 메모리 상태 + JSON 수동 백업 안내로 폴백하며 앱을 크래시시키지 않습니다.
- **Volume Expansion & Multi-Volume Parity Rule (Vol. 1 ↔ Vol. N 완전 동등 상호작용)**:
  - 현재 활성 `ShelfVolume`의 모든 책(`books.length`, 36권 또는 60권)에 `note !== null`이 되면, 최소 볼륨 선택기에 `"새 서가(Vol. N+1) 시작"`(`'3x3'` 또는 `'5x3'` 프리셋 선택) 액션을 활성화합니다.
  - **이전 서가 완전 동등성 (읽기 전용 아카이브 금지)**: 확장 후 이전 서가(예: Vol. 1)로 전환해도 읽기 전용 목록이 아닌 해당 볼륨의 `gridCols × gridRows` 물리 책장을 로드합니다. 사용자는 이전 서가에서도 흔들기, 유리문 열기, 드래그 정렬, 다중 질서 감각 보상, 개별 책 탭 열람·수정을 똑같이 수행합니다.
  - **볼륨별 배치 독립 보존 & 안전한 중도 전환**: 각 `ShelfVolume`은 자신의 `books` 배열 내 `placement`를 독립 저장합니다. 볼륨 전환 직전 현재 볼륨의 배치를 커밋하며, 새 볼륨 로드 시 전 책 모두 `placement !== null`이면 `LOCKED_NEAT`로, `placement === null`인 책이 1권 이상이면 `OPEN_TIDYING`(미배치 책은 데스크 여백에 복원)으로 진입해 유실 책이 발생하지 않게 보장합니다.
  - **최소 크롬 노출 규칙**: 볼륨 선택기 UI는 `volumes.length === 1 && writtenCount < activeVolume.books.length`일 때 숨기며, 전권 도달 또는 볼륨 2개 이상일 때만 모서리에 조용히 노출합니다.
  - **향후 다중 콘텐츠 확장 예약 (Soft Fork & 진입 규칙, v1 UI 미구현)**: 2차 이완 콘텐츠 추가 시 모듈별 고유 경로(`/shelf` 등)와 기본 개방을 보장합니다. 재방문 시 기본값은 `lastActiveModuleId`로 직전 공간을 복원하며, 수동 랜덤 전환 버튼과 설정의 `openRandomOnVisit`(접속 시 랜덤 진입 옵트인)을 함께 제공합니다. 서가 전권 완결 시에는 '새 책장'과 '다른 공간 이동'의 Soft Fork 분기를 제공하며, v1에는 빈 버튼이나 Coming Soon을 두지 않고 `BackupPayloadV1` 상위 버전의 `modules` 키만 예약합니다.
- **JSON Import Validation**:
  - `app === 'biueo'`, `schemaVersion === 1`, `Array.isArray(volumes)`, 허용된 `gridPreset` (`'3x3' | '5x3'`), 각 `volume.books.length === volume.gridCols * volume.gridRows * 4`, 허용된 `colorId`/`heightTier`/`thicknessTier`/`motif` 범위를 검증합니다.
  - 검증 실패 시 기존 로컬 데이터를 덮어쓰지 않고 오류 사유를 명시합니다.

---

## 3. Engine ↔ React UI Boundary API (`src/engine/controller.ts`)

> **단일 진실 원천 원칙**: 60fps 물리 좌표, 캔버스 호버/드래그 상태, 스프라이트 캐시는 **Engine만 소유**합니다. React는 `<dialog>` 모달, 최소 플로팅 버튼, IndexedDB 영속화만 담당하며 프레임마다 리렌더링되지 않습니다.

```ts
export type OrderKind = 'hue' | 'height' | 'thickness' | 'motif' | 'written';
export type OrderScope = 'compartment' | 'row' | 'shelf';

export interface DetectedOrder {
  readonly kind: OrderKind;
  readonly scope: OrderScope;
  /** compartment: [0-8], row: [0-2], shelf: [0] */
  readonly targetIndices: number[];
}

export interface ShelfEngineSnapshot {
  readonly state: ShelfState;
  readonly shelvedCount: number; // 0-36
  readonly writtenCount: number; // 0-36
  readonly isDoorOpen: boolean;
}

export interface ShelfEngineCallbacks {
  onStateChange: (snapshot: ShelfEngineSnapshot) => void;
  onBookTap: (bookId: string) => void; // OPEN_TIDYING에서 짧은 탭 감지 시 호출
  onShelfCommit: (books: BookModel[]) => void; // 배치 변경 시 IndexedDB 저장 트리거
  onTidyComplete: (orders: DetectedOrder[]) => void; // 모든 책 꽂힘 + 걸쇠 잠금 시 호출
}

export interface ShelfEngineController {
  mount(canvas: HTMLCanvasElement, volume: ShelfVolume, prefs: UserPreferences): void;
  unmount(): void;
  pause(): void;   // contentvisibilityautostatechange / visibilitychange 연동
  resume(): void;
  loadVolume(volume: ShelfVolume): void;
  updateBookNote(bookId: string, note: RitualNote | null): void; // 책갈피 리본 재베이킹
  setTheme(theme: DeskThemeId): void;
  setTuning(tuning: VisualTuningParams): void;
  setAudioEnabled(enabled: boolean): void;
  triggerShake(intensity?: number): void; // 0.3 - 1.0
  toggleDoor(): void;
  setPreviewMode?(mode: 'neat_locked' | 'neat_open' | 'scattered_dummy'): void; // Phase 0 전용
}
```

---

## 4. Normalized Coordinate System & Combinatorial Deck Spec

### 4.1 Normalized Compartment & Book Ratios (Guarantees Zero Overflow)
- 책장 격자 프리셋:
  - `'3x3'` (기본 소형): **3열 × 3행 (총 9칸, 인덱스 0-8, 36권)**.
  - `'5x3'` (대형 서가): **5열 × 3행 (총 15칸, 인덱스 0-14, 60권)**.
- 각 칸의 내부 너비를 `1.0`, 내부 높이를 `1.0`으로 정규화합니다.
  - 좌우 여백: 각 `0.03` (합 `0.06`), 사용 가능 폭: `0.94`.
  - 인접 책 간격: `0.012`.
  - **두께 3단계 (`BookThicknessTier`)**:
    - `0 (thin)`: `0.165`
    - `1 (medium)`: `0.195`
    - `2 (thick)`: `0.225`
  - **최악 케이스 검증**: `thick` 책 4권을 한 칸에 꽂아도 `4 × 0.225 + 3 × 0.012 + 0.06 = 0.996 <= 1.000`으로 넘치지 않습니다.
  - **동적 칸 수용 규칙**: 한 칸은 책 권수 4권 고정이 아니라 `sum(bookWidths) + (n - 1) × 0.012 <= 0.94`를 만족하는 한 자유롭게 3-5권을 수용합니다.
  - **전체 여유율**: 두 프리셋 모두 권당 평균 폭이 동일하므로(`36권 = 7.02 / 8.136`, `60권 = 11.70 / 13.560`) 약 **13.7%**의 동일한 물리적 여유 공간을 유지합니다.
  - **높이 4단계 (`BookHeightTier`)**:
    - `0 (short)`: `0.70`
    - `1 (medium)`: `0.78`
    - `2 (tall)`: `0.86`
    - `3 (grand)`: `0.93` (상단 여유 `0.07`에 책갈피 리본 `+0.045` 돌출 허용).

### 4.2 Combinatorial Deck Distribution (4-Axis Solvable)
- **`'3x3'` (36권)**: 9색×4권, 4높이×9권, 3두께×12권, 6무늬×6권, 4프롬프트×9권.
- **`'5x3'` (60권)**: 15개 4권 그룹(유채색 6색 `coral`·`salmon`·`butter`·`olive`·`sage`·`slate` 각 8권=48권 + 중성·뉴트럴 3색 `oat`·`cream`·`charcoal` 각 4권=12권), 4높이×15권, 3두께×20권, 6무늬×10권, 4프롬프트×15권.

### 4.3 Responsive Layout, Mobile 3×5 Transpose & Spill Margin Zones
- **데스크톱 (`viewportWidth / viewportHeight >= 1.1`)**:
  - `3×3`은 정사각 중앙 배치(높이 약 70-74%), `5×3`은 와이드 중앙 배치(가로:세로 `≈ 1.56:1`, 최소 책 폭 `>= 24px` 확보).
  - 문이 열리면(`OPEN_TIDYING`) 쏟아진 책들은 책장 좌·우·하단 여백 데스크 영역에 흩어집니다(*A Little to the Left* 1번·4번 레퍼런스 구도).
- **모바일 (`viewportWidth / viewportHeight < 1.1`)**:
  - `'5x3'` 서가는 세로 화면 폭 붕괴(`10.6px`)를 막기 위해 논리적 `compartmentIndex (0..14)`를 유지한 채 시각적 격자만 **`3열 × 5행`으로 자동 전치(Transpose)**합니다.
  - 책장을 상단-중앙에 배치하고, 문이 열리면 쏟아진 책들은 책장 하단 데스크 트레이 영역에 흩어집니다.

---

## 5. Gesture & Physics Invariants

1. **드래그 vs 짧은 탭 분기 (`OPEN_TIDYING`)**:
   - 포인터 다운 후 업까지의 유클리드 이동 거리가 `6px 미만`이고 경과 시간이 `220ms 미만`이면 `onBookTap(bookId)`를 발생시킵니다.
   - `6px 이상` 이동 시 즉시 드래그 상태로 전환해 책을 집어 올립니다(리프트 스케일 `1.04`, 그림자 오프셋 `(+10px, +13px)`).
   - 칸 내부 배치 시 중앙 강제 재정렬 없이 드롭한 가로 위치(`normX`)를 그대로 유지하며, 겹칠 때만 인접 책을 최소 폭만큼 밀어냅니다. 책을 빼낼 때도 남은 책의 가로 위치는 고정됩니다.
   - 칸 내부에 쓰러진 책(`fallenDir !== undefined`)이 있을 경우, 쓰러진 책이 실제로 점유한 가로 구간만 차단해 비스듬히 기댄 책 옆의 남은 빈 공간에는 여유를 두고 새 책을 꽂을 수 있습니다. 바닥을 완전히 덮은 경우에는 해당 책을 집어 다시 세운 뒤에야 추가 삽입이 열립니다.
2. **흔들기 트리거**:
   - **2.5D 전도-미끄러짐 경쟁**: 닫힌 유리문 흔들기 중 각 책은 스칼라 깊이(`depthZ`)와 종횡비(`w/h`) 기반 전도 임계치를 경쟁합니다. 수평 가속도·기울기로 먼저 쓰러진 책은 칸 내부 벽·이웃 한계 각도에 멈추며, 수직·지속 흔들림으로 `depthZ`가 한계를 넘으면 밖으로 이탈합니다.
   - **프레임 직접 잡기 흔들기**: 닫힌 유리문 상태(`LOCKED_NEAT` / `SHAKING_CHAOS`)에서만 책장 프레임 클릭·드래그를 허용(`OPEN_TIDYING`에서는 개별 책 조작 보호를 위해 비활성화)합니다. 책장은 포인터를 스프링으로 추적하며 이동 속도에 비례해 기울고, 가속도 반대 관성력(`-a`)·기울기 중력을 주입해 흔들림 세기에 맞춰 책들을 점진적으로 쓰러뜨리거나 풀어 떨어뜨립니다.
   - **키보드 / 버튼**: `흔들기` 버튼 및 `Space` 홀드(`140ms` 간격)도 동일한 2.5D 전도-미끄러짐 버스트를 순차 주입해 쓰러짐과 이탈이 함께 발생하며, 반복 흔들기로 쓰러진 책까지 추가 배출할 수 있습니다(`prefers-reduced-motion: reduce` 시 시각 흔들림 진폭 30% 축소).
   - **모바일 가속도계**: 명시적 버튼 클릭으로 `DeviceMotionEvent.requestPermission()` 획득 후, 선형 가속도 크기 `sqrt(ax² + ay² + az²) > 15 m/s²` 감지 시 180ms 디바운스로 임펄스 주입.
3. **Matter.js 터널링 방어 (Chaos Mode)**:
   - 책장 외곽 불가시 벽 두께 `>= 120px`.
   - 고정 물리 서브스텝 `1 / 120s` (프레임당 최대 4서브스텝 클램프).
   - 강체 최대 속도 `28`, `positionIterations: 10`, `velocityIterations: 8`, `enableSleeping: true`.
4. **모바일 390px 터치 보정 (`pointerType === 'touch'`)**:
   - 3×3 36권 규격을 유지하되(390px 기준 `minBookWidthPx ≈ 17.8px`), 터치 입력 시 포인터 반경 `28px` 내 가장 가까운 책 중심점을 선택하는 **근접 자석 선택(Nearest-Neighbor Magnet)**을 적용합니다.
   - 터치 드래그 중에는 책을 손가락 위쪽 `-48px` 오프셋으로 띄워 엄지에 가리지 않게 유지하며, 드롭 슬롯 판정은 떠 있는 책의 중심 좌표를 기준으로 계산합니다.
5. **유리문 열림 물리 전환 분기 (`OPEN_TIDYING` 진입 규칙)**:
   - `SHAKING_CHAOS -> OPEN_TIDYING`: `ChaosWorld`에서 실제 이탈한 책(`dislodged > 0`)만 배치를 해제하고 외곽 물리 벽을 안전 데스크 영역(`x: 18..viewportW-18`, `y: 24..viewportH-86`)으로 확장해 연속 쏟아짐을 실행합니다. 아직 칸에 남아 있는 책은 제자리에 유지되며, 이탈한 책이 0권이면 일반 정돈 상태 열림으로 전환합니다.
   - `OPEN_TIDYING` 중 유효한 칸 밖에서 드래그를 놓으면 허공 고정 없이 `desk_drop` 모드의 중력 낙하·휴면 책 충돌을 거쳐 자연스럽게 떨어져 정지합니다.
   - `LOCKED_NEAT -> OPEN_TIDYING`: 흔들지 않고 정돈된 상태에서 걸쇠를 열면 전권이 제자리에 조용히 머물러 사용자가 특정 책만 탭해 읽거나 일부만 재배치할 수 있습니다.

---

## 6. Deterministic Multi-Order Detection Spec (Pure Sensory Feedback)

> **무실패·무텍스트 원칙**: 모든 책(`volume.books.length`권)이 책장에 꽂히고 걸쇠가 잠기면(어떤 순서든) 기본 정돈 완료 연출이 재생됩니다. 감지된 질서는 **절대 텍스트·배지·점수로 표시하지 않고**, 정렬된 영역(칸/행/전체)을 따라 흐르는 **파스텔 반짝임 웨이브와 화음 배음(Harmonic Enrichment)**으로만 암시합니다.

### 판정 규칙 (책 3권 이상이 꽂힌 칸 기준)
1. **`hue` (색상 질서)**:
   - `compartment`: 칸 내 모든 책의 `colorId`가 동일하거나 `colorOrderIndex`가 단조 증가/감소.
   - `row` / `shelf`: 인접 책 간 `colorOrderIndex`가 비감소(`<=`) 또는 비증가(`>=`) 단조열을 형성.
2. **`height` (높이 질서)**:
   - `compartment` / `row` / `shelf`: `heightTier`가 전부 동일, 단조 증가(`<=`), 단조 감소(`>=`), 또는 대칭 아치(증가 후 감소 / 감소 후 증가, 최소 1회 변화 포함).
3. **`thickness` (두께 질서)**:
   - `compartment` / `row` / `shelf`: `thicknessTier`가 전부 동일, 단조 증가(`<=`), 또는 단조 감소(`>=`).
4. **`motif` (무늬 질서)**:
   - `compartment`: 칸 내 모든 책(3권 이상)의 `motif`가 동일.
5. **`written` (기록 책 모으기)**:
   - `compartment`: 기록된 책이 `3 <= totalWrittenCount < volume.books.length`일 때, 한 칸의 모든 책(3권 이상)이 `note !== null`로만 채워짐. (전권이 기록된 이전 서가에서는 매 배치마다 자동 발동하지 않도록 `written` 판정을 비활성화하고 나머지 4종 질서만 평가함.)

### 감각 보상 강도 매핑 (Pure Sensory Tiers)
- **Tier 0 (자유 완결 — 질서 0개)**: 황동 걸쇠 클릭음 + 책장 전체에 0.45초간 따뜻한 크림빛 1회 숨결 글로우.
- **Tier 1 (`compartment` 질서 1개 이상)**: 해당 칸 테두리에 작은 파스텔 별빛 파티클(4-6개) + 부드러운 2음(5도) 펜타토닉 차임.
- **Tier 2 (`row` 질서 1개 이상)**: 해당 행을 좌->우로 훑는 0.6초 파스텔 웨이브 글로우 + 3화음 아르페지오.
- **Tier 3 (`shelf` 전체 질서 1개 이상)**: 서가 전체 대각선 파스텔 쉬머 + 따뜻한 Major 9th 확장 화음.

---

## 7. Frozen Korean Copy & Citations (v1 Korean-Only)

### 7.1 4종 리츄얼 프롬프트 풀 (4축 × 4변형 = 16문항, 시드 고정 배정)
각 축의 4개 구어체 질문 중 `book.seed` 해시로 책당 1문항을 결정론적으로 배정하며, 기본 대표 질문은 아래와 같습니다.
1. **`strength_recall` (강점 회고)**: `"최근 내 강점이 잘 드러났던 순간이 있다면?"` 외 3종
2. **`future_action` (오늘의 행동)**: `"오늘 살려보고 싶은 내 강점과 작은 행동은?"` 외 3종
3. **`self_compassion` (자기격려)**: `"오늘 하루를 보낸 나에게 건네고 싶은 말은?"` 외 3종
4. **`gratitude` (작은 감사)**: `"요즘 작게라도 고마웠던 일이나 사람이 있나요?"` 외 3종

### 7.2 1회성 상황별 유령 힌트 (조작 즉시 영구 소멸)
- `shakeOrUnlatch`: `"책장을 흔들어 비우거나, 오른쪽 걸쇠를 열어보세요"`
- `dragOrTapBook`: `"책을 끌어다 꽂거나, 짧게 눌러 페이지를 펼쳐보세요"`
- `closeLatch`: `"정리가 끝나면 오른쪽 걸쇠를 눌러 문을 닫아보세요"`

### 7.3 논문 근거 모달 고정 출처 (5편)
1. Holmes, E. A., James, E. L., Coode-Bate, T., & Deeprose, C. (2009). *Can Playing the Computer Game "Tetris" Reduce the Build-Up of Flashbacks for Trauma?* PLoS ONE, 4(1), e4153. (후속: Holmes et al., 2010, PLoS ONE — 시공간 과제 vs 언어 과제 비교)
2. Brooks, A. W., Schroeder, J., Risen, J. L., Gino, F., Galinsky, A. D., Norton, M. I., & Schweitzer, M. E. (2016). *Don't stop believing: Rituals improve performance by decreasing anxiety.* Organizational Behavior and Human Decision Processes, 137, 71-85.
3. Cascio, C. N., O'Donnell, M. B., Tinney, F. J., Lieberman, M. D., Taylor, S. E., Strecher, V. J., & Falk, E. B. (2016). *Self-affirmation activates brain systems associated with self-related processing and reward and is reinforced by future orientation.* Social Cognitive and Affective Neuroscience, 11(4), 621-629.
4. Seligman, M. E. P., Steen, T. A., Park, N., & Peterson, C. (2005). *Positive psychology progress: Empirical validation of interventions.* American Psychologist, 60(5), 410-421.
5. Bolier, L., Haverman, M., Westerhof, G. J., Riper, H., Smit, F., & Bohlmeijer, E. (2013). *Positive psychology interventions: a meta-analysis of randomized controlled studies.* BMC Public Health, 13, 119. (주관적 안녕감 g = 0.34, 심리적 안녕감 g = 0.20, 우울 증상 g = 0.23)