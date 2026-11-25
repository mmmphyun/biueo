import { describe, expect, it } from 'vitest';
import {
  DARK_THEME_IDS,
  DESK_THEMES,
  getThemePoolForMode,
  LIGHT_THEME_IDS,
  pickRandomThemeForMode,
} from './deskThemes';

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('deskThemes curated light/dark pools, random selection & WCAG AA contrast', () => {
  it('separates 4 light and 4 dark themes cleanly with matching metadata flags', () => {
    expect(LIGHT_THEME_IDS).toHaveLength(4);
    expect(DARK_THEME_IDS).toHaveLength(4);
    expect(getThemePoolForMode('light')).toEqual(LIGHT_THEME_IDS);
    expect(getThemePoolForMode('dark')).toEqual(DARK_THEME_IDS);

    for (const id of LIGHT_THEME_IDS) {
      expect(DESK_THEMES[id].mode).toBe('light');
      expect(DESK_THEMES[id].isDarkDesk).toBe(false);
    }
    for (const id of DARK_THEME_IDS) {
      expect(DESK_THEMES[id].mode).toBe('dark');
      expect(DESK_THEMES[id].isDarkDesk).toBe(true);
    }
  });

  it('picks randomly within the active mode pool while excluding the previous theme', () => {
    const samples = [0, 0.25, 0.5, 0.75, 0.99];
    for (const excludeId of LIGHT_THEME_IDS) {
      for (const s of samples) {
        const picked = pickRandomThemeForMode('light', excludeId, () => s);
        expect(LIGHT_THEME_IDS).toContain(picked);
        expect(picked).not.toBe(excludeId);
      }
    }
    for (const excludeId of DARK_THEME_IDS) {
      for (const s of samples) {
        const picked = pickRandomThemeForMode('dark', excludeId, () => s);
        expect(DARK_THEME_IDS).toContain(picked);
        expect(picked).not.toBe(excludeId);
      }
    }
  });

  it('meets WCAG AA (>= 4.5:1) contrast for ink, dockInk, and dockMuted across all 8 themes', () => {
    for (const theme of Object.values(DESK_THEMES)) {
      expect(contrastRatio(theme.ink, theme.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.dockInk, theme.dockSurface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.dockMuted, theme.dockSurface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
