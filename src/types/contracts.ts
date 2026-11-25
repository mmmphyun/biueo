export type DeskThemeId = 'sage' | 'slate' | 'lavender' | 'charcoal';

export type ShelfGridPreset = '3x3' | '5x3';

export type ShelfState =
  | 'LOCKED_NEAT'
  | 'SHAKING_CHAOS'
  | 'OPEN_TIDYING'
  | 'BOOK_OPEN_MODAL';

/** 9색 팔레트. colorOrderIndex(0-8)는 색상환 및 톤 그라데이션 순서를 정의함. */
export type BookColorId =
  | 'coral'
  | 'salmon'
  | 'butter'
  | 'olive'
  | 'sage'
  | 'slate'
  | 'oat'
  | 'cream'
  | 'charcoal';

export type BookHeightTier = 0 | 1 | 2 | 3;
export type BookThicknessTier = 0 | 1 | 2;

export type SpineMotif =
  | 'diamond'
  | 'bands'
  | 'stitch'
  | 'wave'
  | 'dots'
  | 'plain';

export type RitualPromptType =
  | 'strength_recall'
  | 'future_action'
  | 'self_compassion'
  | 'gratitude';

export interface RitualNote {
  readonly promptType: RitualPromptType;
  readonly promptText: string;
  content: string;
  readonly createdAt: string;
  updatedAt: string;
}

export interface ShelfSlotPlacement {
  /** 0-8 (3x3) 또는 0-14 (5x3) */
  compartmentIndex: number;
  /** 칸 내부 좌->우 정렬 순서 (0-based) */
  orderInCompartment: number;
  /** 칸 내부 정규화 좌측 x 좌표 ([COMPARTMENT_SIDE_MARGIN .. 1 - COMPARTMENT_SIDE_MARGIN - widthNorm]) */
  normX?: number;
}

export interface BookModel {
  readonly id: string;
  readonly seed: number;
  readonly colorId: BookColorId;
  readonly colorOrderIndex: number;
  readonly heightTier: BookHeightTier;
  readonly thicknessTier: BookThicknessTier;
  readonly motif: SpineMotif;
  readonly defaultPromptType: RitualPromptType;
  placement: ShelfSlotPlacement | null;
  note: RitualNote | null;
}

export interface ShelfVolume {
  readonly id: string;
  readonly volumeNumber: number;
  readonly gridPreset: ShelfGridPreset;
  readonly gridCols: number;
  readonly gridRows: number;
  title: string;
  readonly createdAt: string;
  updatedAt: string;
  books: BookModel[];
}

export interface OnboardingHintsSeen {
  shakeOrUnlatch: boolean;
  dragOrTapBook: boolean;
  closeLatch: boolean;
}

export interface VisualTuningParams {
  grainStrength: number;
  edgeJitterPx: number;
  shadowOffsetPx: number;
}

export interface UserPreferences {
  readonly id: 'singleton';
  theme: DeskThemeId;
  activeVolumeId: string;
  lastActiveModuleId: string;
  openRandomOnVisit: boolean;
  audioEnabled: boolean;
  motionShakeEnabled: boolean;
  hintsSeen: OnboardingHintsSeen;
  tuning: VisualTuningParams;
}

export interface BackupPayloadV1 {
  readonly app: 'biueo';
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly preferences: UserPreferences;
  readonly volumes: ShelfVolume[];
}

export type OrderKind = 'hue' | 'height' | 'thickness' | 'motif' | 'written';
export type OrderScope = 'compartment' | 'row' | 'shelf';

export interface DetectedOrder {
  readonly kind: OrderKind;
  readonly scope: OrderScope;
  readonly targetIndices: number[];
}

export interface ShelfEngineSnapshot {
  readonly state: ShelfState;
  readonly shelvedCount: number;
  readonly totalCount: number;
  readonly writtenCount: number;
  readonly isDoorOpen: boolean;
}

export interface ShelfEngineCallbacks {
  onStateChange: (snapshot: ShelfEngineSnapshot) => void;
  onBookTap: (bookId: string) => void;
  onShelfCommit: (books: BookModel[]) => void;
  onTidyComplete: (orders: DetectedOrder[]) => void;
}

export interface ShelfEngineController {
  mount(canvas: HTMLCanvasElement, volume: ShelfVolume, prefs: UserPreferences): void;
  unmount(): void;
  pause(): void;
  resume(): void;
  loadVolume(volume: ShelfVolume): void;
  updateBookNote(bookId: string, note: RitualNote | null): void;
  setTheme(theme: DeskThemeId): void;
  setTuning(tuning: VisualTuningParams): void;
  setAudioEnabled(enabled: boolean): void;
  setMotionShakeEnabled(enabled: boolean): void;
  triggerShake(intensity?: number): void;
  toggleDoor(): void;
}
