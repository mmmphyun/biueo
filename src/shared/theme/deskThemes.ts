import type { DeskColorMode, DeskThemeId } from '../../types/contracts';

export interface DeskThemeTokens {
  readonly id: DeskThemeId;
  readonly labelKo: string;
  readonly mode: DeskColorMode;
  readonly bg: string;
  readonly shadow: string;
  /** 배경 데스크 위에 바로 얹는 UI 텍스트용 고대비 잉크 */
  readonly ink: string;
  readonly dockSurface: string;
  readonly dockInk: string;
  readonly dockMuted: string;
  readonly isDarkDesk: boolean;
}

export const DESK_THEMES: Record<DeskThemeId, DeskThemeTokens> = {
  sage: {
    id: 'sage',
    labelKo: '세이지',
    mode: 'light',
    bg: '#C7E1B6',
    shadow: '#A6C395',
    ink: '#243025',
    dockSurface: '#F7F4EC',
    dockInk: '#253126',
    dockMuted: '#4A594B',
    isDarkDesk: false,
  },
  slate: {
    id: 'slate',
    labelKo: '슬레이트',
    mode: 'light',
    bg: '#8F9FA9',
    shadow: '#71828D',
    ink: '#1A2328',
    dockSurface: '#F6F5F1',
    dockInk: '#1F2930',
    dockMuted: '#46545D',
    isDarkDesk: false,
  },
  lavender: {
    id: 'lavender',
    labelKo: '라벤더',
    mode: 'light',
    bg: '#9393AE',
    shadow: '#757590',
    ink: '#171726',
    dockSurface: '#F6F4F7',
    dockInk: '#202033',
    dockMuted: '#484863',
    isDarkDesk: false,
  },
  mist: {
    id: 'mist',
    labelKo: '미스트',
    mode: 'light',
    bg: '#B5C8C3',
    shadow: '#94AAA4',
    ink: '#1C2927',
    dockSurface: '#F4F7F5',
    dockInk: '#1E2C2A',
    dockMuted: '#455956',
    isDarkDesk: false,
  },
  charcoal: {
    id: 'charcoal',
    labelKo: '차콜',
    mode: 'dark',
    bg: '#323C42',
    shadow: '#21282D',
    ink: '#EEF0EC',
    dockSurface: '#262E33',
    dockInk: '#F0F2EE',
    dockMuted: '#C4CBC7',
    isDarkDesk: true,
  },
  pine: {
    id: 'pine',
    labelKo: '파인',
    mode: 'dark',
    bg: '#263631',
    shadow: '#192521',
    ink: '#ECF2EE',
    dockSurface: '#1E2B27',
    dockInk: '#EEF3F0',
    dockMuted: '#B8C9C1',
    isDarkDesk: true,
  },
  dusk: {
    id: 'dusk',
    labelKo: '더스크',
    mode: 'dark',
    bg: '#2B2F42',
    shadow: '#1D2030',
    ink: '#ECEEF5',
    dockSurface: '#222536',
    dockInk: '#EEF0F7',
    dockMuted: '#BEC3D6',
    isDarkDesk: true,
  },
  umber: {
    id: 'umber',
    labelKo: '엄버',
    mode: 'dark',
    bg: '#36302E',
    shadow: '#241F1E',
    ink: '#F2EFEA',
    dockSurface: '#2A2523',
    dockInk: '#F3F0EB',
    dockMuted: '#CFC7BE',
    isDarkDesk: true,
  },
};

export const LIGHT_THEME_IDS: readonly DeskThemeId[] = [
  'sage',
  'slate',
  'lavender',
  'mist',
];

export const DARK_THEME_IDS: readonly DeskThemeId[] = [
  'charcoal',
  'pine',
  'dusk',
  'umber',
];

const COLOR_MODE_STORAGE_KEY = 'biueo:color-mode';
const LAST_THEME_STORAGE_KEY = 'biueo:last-theme';

export function getThemePoolForMode(mode: DeskColorMode): readonly DeskThemeId[] {
  return mode === 'dark' ? DARK_THEME_IDS : LIGHT_THEME_IDS;
}

export function pickRandomThemeForMode(
  mode: DeskColorMode,
  excludeId?: DeskThemeId | null,
  rand: () => number = Math.random
): DeskThemeId {
  const pool = getThemePoolForMode(mode);
  const candidates =
    excludeId && pool.length > 1 ? pool.filter((id) => id !== excludeId) : pool;
  const normalized = Math.min(0.999999, Math.max(0, rand()));
  return candidates[Math.floor(normalized * candidates.length)];
}

export function readManualColorMode(): DeskColorMode | null {
  try {
    const val = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

export function saveManualColorMode(mode: DeskColorMode): void {
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // 프라이빗 모드 등 저장소 차단 환경에서는 무음 폴백한다.
  }
}

export function readLastThemeId(): DeskThemeId | null {
  try {
    const val = window.localStorage.getItem(LAST_THEME_STORAGE_KEY);
    if (val && Object.prototype.hasOwnProperty.call(DESK_THEMES, val)) {
      return val as DeskThemeId;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastThemeId(id: DeskThemeId): void {
  try {
    window.localStorage.setItem(LAST_THEME_STORAGE_KEY, id);
  } catch {
    // 저장소 불가 환경 무음 폴백
  }
}

export function getSystemColorMode(): DeskColorMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveInitialColorMode(): {
  readonly mode: DeskColorMode;
  readonly isManualOverride: boolean;
} {
  const manual = typeof window !== 'undefined' ? readManualColorMode() : null;
  if (manual) {
    return { mode: manual, isManualOverride: true };
  }
  return { mode: getSystemColorMode(), isManualOverride: false };
}

export function syncDocumentColorScheme(mode: DeskColorMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.colorScheme = mode;
  }
}
