import type {
  BookColorId,
  BookHeightTier,
  BookThicknessTier,
  RitualPromptType,
  SpineMotif,
} from '../../../types/contracts';

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

export interface RitualPromptEntry {
  readonly promptText: string;
  readonly placeholder: string;
}

export const RITUAL_NOTE_MAX_LENGTH = 280;

export const RITUAL_AXIS_LABELS: Record<RitualPromptType, string> = {
  strength_recall: '강점 회고',
  future_action: '오늘의 행동',
  self_compassion: '자기격려',
  gratitude: '작은 감사',
};

export const RITUAL_PROMPT_POOL: Record<RitualPromptType, readonly RitualPromptEntry[]> = {
  strength_recall: [
    {
      promptText: '최근에 내 장점이 잘 살아났던 순간이 있나요?',
      placeholder: '사소한 일이어도 괜찮아요. 한 줄만 적어보세요.',
    },
    {
      promptText: '요즘 내가 꽤 잘 넘겼다 싶은 일이 있나요?',
      placeholder: '작게 마무리한 일 하나만 떠올려 보세요.',
    },
    {
      promptText: '최근 누군가에게 도움이 됐던 내 행동이 있나요?',
      placeholder: '크지 않아도 괜찮아요. 생각나는 대로 적어보세요.',
    },
    {
      promptText: '힘든 와중에도 나답게 버틴 순간이 있다면요?',
      placeholder: '그때 나를 버티게 해준 한 가지를 적어보세요.',
    },
  ],
  future_action: [
    {
      promptText: '오늘 써먹어 보고 싶은 내 강점과 작은 행동은요?',
      placeholder: '오늘 해볼 만한 딱 한 가지만 적어보세요.',
    },
    {
      promptText: '오늘 나한테 꼭 필요한 가장 작은 한 걸음은요?',
      placeholder: '5분 안에 끝낼 수 있는 일이어도 좋아요.',
    },
    {
      promptText: '지금 기분을 조금 덜어줄 다음 행동이 있을까요?',
      placeholder: '물 한 잔이나 짧은 산책 같은 가벼운 일부터 적어보세요.',
    },
    {
      promptText: '오늘 끝날 때 기분 좋을 작은 약속 하나만 고른다면요?',
      placeholder: '무리되지 않는 선에서 하나만 정해보세요.',
    },
  ],
  self_compassion: [
    {
      promptText: '오늘 하루를 보낸 나한테 해주고 싶은 말이 있나요?',
      placeholder: '수고한 나한테 짧게 한 마디 남겨보세요.',
    },
    {
      promptText: '지금 내 옆에 친한 친구가 있다면 뭐라고 해줄까요?',
      placeholder: '그 말 한 줄을 그대로 옮겨 적어보세요.',
    },
    {
      promptText: '요즘 애쓰는 나한테 잠깐 내려놓아도 된다고 말한다면요?',
      placeholder: '오늘만큼은 덜어두고 싶은 부담을 적어보세요.',
    },
    {
      promptText: '완벽하진 않았어도 괜찮았던 오늘의 순간이 있나요?',
      placeholder: '충분히 잘 지나온 장면을 짧게 적어보세요.',
    },
  ],
  gratitude: [
    {
      promptText: '요즘 작게라도 고마웠던 일이나 사람이 있나요?',
      placeholder: '떠오르는 순간을 가볍게 적어보세요.',
    },
    {
      promptText: '오늘 잠깐이라도 기분이 나아졌던 순간이 있나요?',
      placeholder: '날씨, 커피, 짧은 대화처럼 사소한 것도 좋아요.',
    },
    {
      promptText: '평소엔 그냥 넘겼지만 고마운 일상이 있나요?',
      placeholder: '당연하게 지나쳤던 것 하나를 떠올려 적어보세요.',
    },
    {
      promptText: '최근 누군가의 작은 배려가 기억에 남았던 때가 있나요?',
      placeholder: '짧은 인사나 도움 하나만 떠올려 보세요.',
    },
  ],
};

export function getBookRitualPrompt(book: {
  readonly seed: number;
  readonly defaultPromptType: RitualPromptType;
}): RitualPromptEntry {
  let h = (book.seed ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const pool = RITUAL_PROMPT_POOL[book.defaultPromptType];
  return pool[h % pool.length];
}

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
