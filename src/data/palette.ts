import type {
  BookColorId,
  BookHeightTier,
  BookThicknessTier,
  DeskThemeId,
  RitualPromptType,
  SpineMotif,
} from '../types/contracts';

export interface DeskThemeTokens {
  readonly id: DeskThemeId;
  readonly labelKo: string;
  readonly bg: string;
  readonly shadow: string;
  /** 배경 데스크 위에 바로 얹는 UI 텍스트용 고대비 잉크 */
  readonly ink: string;
  readonly dockSurface: string;
  readonly dockInk: string;
  readonly dockMuted: string;
  readonly dockBorder: string;
  readonly isDarkDesk: boolean;
}

export const DESK_THEMES: Record<DeskThemeId, DeskThemeTokens> = {
  sage: {
    id: 'sage',
    labelKo: '세이지',
    bg: '#C7E1B6',
    shadow: '#A6C395',
    ink: '#243025',
    dockSurface: '#F7F4EC',
    dockInk: '#253126',
    dockMuted: '#4A594B',
    dockBorder: '#849A7A',
    isDarkDesk: false,
  },
  slate: {
    id: 'slate',
    labelKo: '슬레이트',
    bg: '#8F9FA9',
    shadow: '#71828D',
    ink: '#1A2328',
    dockSurface: '#F6F5F1',
    dockInk: '#1F2930',
    dockMuted: '#46545D',
    dockBorder: '#697B86',
    isDarkDesk: false,
  },
  lavender: {
    id: 'lavender',
    labelKo: '라벤더',
    bg: '#7E7E9A',
    shadow: '#63637E',
    ink: '#171726',
    dockSurface: '#F6F4F7',
    dockInk: '#202033',
    dockMuted: '#484863',
    dockBorder: '#676784',
    isDarkDesk: false,
  },
  charcoal: {
    id: 'charcoal',
    labelKo: '차콜',
    bg: '#323C42',
    shadow: '#21282D',
    ink: '#EEF0EC',
    dockSurface: '#262E33',
    dockInk: '#F0F2EE',
    dockMuted: '#C4CBC7',
    dockBorder: '#6D7A82',
    isDarkDesk: true,
  },
};

export const DESK_THEME_ORDER: readonly DeskThemeId[] = [
  'sage',
  'slate',
  'lavender',
  'charcoal',
];

export const SHELF_WOOD_COLORS = {
  frame: '#E5D2B5',
  frameHighlight: '#EFE1CC',
  frameShadow: '#C8B08E',
  innerWall: '#DDD0BC',
  cellFloor: '#F3ECE0',
  shelfLip: '#EFE3D1',
  brass: '#E2BE68',
  brassShadow: '#B6913F',
  brassHighlight: '#F4DCA0',
} as const;

export interface BookColorSpec {
  readonly id: BookColorId;
  readonly orderIndex: number;
  readonly hex: string;
  readonly highlight: string;
  readonly shade: string;
  readonly accent: string;
  readonly ribbon: string;
  readonly isLight: boolean;
}

export const BOOK_COLORS: Record<BookColorId, BookColorSpec> = {
  coral: {
    id: 'coral',
    orderIndex: 0,
    hex: '#D84B6B',
    highlight: '#E66F89',
    shade: '#B83B58',
    accent: '#F7EFE2',
    ribbon: '#F4DC82',
    isLight: false,
  },
  salmon: {
    id: 'salmon',
    orderIndex: 1,
    hex: '#DF7D6E',
    highlight: '#EB9A8E',
    shade: '#BD6355',
    accent: '#F9F2E7',
    ribbon: '#7FA89B',
    isLight: false,
  },
  butter: {
    id: 'butter',
    orderIndex: 2,
    hex: '#F4DC82',
    highlight: '#F9E8A6',
    shade: '#D7BC5E',
    accent: '#424852',
    ribbon: '#D84B6B',
    isLight: true,
  },
  olive: {
    id: 'olive',
    orderIndex: 3,
    hex: '#9EAD75',
    highlight: '#B5C290',
    shade: '#7F8E58',
    accent: '#F6F1E6',
    ribbon: '#DF7D6E',
    isLight: false,
  },
  sage: {
    id: 'sage',
    orderIndex: 4,
    hex: '#7FA89B',
    highlight: '#9ABEB2',
    shade: '#628A7D',
    accent: '#F6F1E6',
    ribbon: '#F4DC82',
    isLight: false,
  },
  slate: {
    id: 'slate',
    orderIndex: 5,
    hex: '#768EA3',
    highlight: '#91A7BA',
    shade: '#5B7287',
    accent: '#F6F1E6',
    ribbon: '#DF7D6E',
    isLight: false,
  },
  oat: {
    id: 'oat',
    orderIndex: 6,
    hex: '#D4B494',
    highlight: '#E3C9AE',
    shade: '#B49373',
    accent: '#3E424B',
    ribbon: '#768EA3',
    isLight: true,
  },
  cream: {
    id: 'cream',
    orderIndex: 7,
    hex: '#F5EFE4',
    highlight: '#FCF9F3',
    shade: '#DDD3C2',
    accent: '#C95B67',
    ribbon: '#9EAD75',
    isLight: true,
  },
  charcoal: {
    id: 'charcoal',
    orderIndex: 8,
    hex: '#353B45',
    highlight: '#4B525E',
    shade: '#232830',
    accent: '#F4DC82',
    ribbon: '#DF7D6E',
    isLight: false,
  },
};

export const BOOK_COLOR_IDS: readonly BookColorId[] = [
  'coral',
  'salmon',
  'butter',
  'olive',
  'sage',
  'slate',
  'oat',
  'cream',
  'charcoal',
];

export const SPINE_MOTIFS: readonly SpineMotif[] = [
  'diamond',
  'bands',
  'stitch',
  'wave',
  'dots',
  'plain',
];

export const RITUAL_PROMPT_TYPES: readonly RitualPromptType[] = [
  'strength_recall',
  'future_action',
  'self_compassion',
  'gratitude',
];

export const RITUAL_PROMPTS: Record<
  RitualPromptType,
  { readonly promptText: string; readonly placeholder: string }
> = {
  strength_recall: {
    promptText: '최근 내 강점이 잘 드러났던 순간이 있다면?',
    placeholder: '사소한 일이어도 괜찮아요. 한 줄만 남겨둘까요.',
  },
  future_action: {
    promptText: '오늘 살려보고 싶은 내 강점과 작은 행동은?',
    placeholder: '거창하지 않아도 돼요. 오늘 해볼 딱 한 가지만 적어보세요.',
  },
  self_compassion: {
    promptText: '오늘 하루를 보낸 나에게 건네고 싶은 말은?',
    placeholder: '고생한 나에게 짧게 한 마디 남겨두세요.',
  },
  gratitude: {
    promptText: '요즘 작게라도 고마웠던 일이나 사람이 있나요?',
    placeholder: '떠오르는 순간을 가볍게 기록해 보세요.',
  },
};

/** 정규화 칸 좌표 비율 (docs/CONTRACTS.md 4.1절) */
export const COMPARTMENT_SIDE_MARGIN = 0.03;
export const COMPARTMENT_USABLE_WIDTH = 0.94;
export const BOOK_GAP_RATIO = 0.012;

export const BOOK_HEIGHT_RATIOS: Record<BookHeightTier, number> = {
  0: 0.70,
  1: 0.78,
  2: 0.86,
  3: 0.93,
};

export const BOOK_THICKNESS_RATIOS: Record<BookThicknessTier, number> = {
  0: 0.165,
  1: 0.195,
  2: 0.225,
};
