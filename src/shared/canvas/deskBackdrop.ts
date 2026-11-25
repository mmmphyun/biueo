import type { DeskThemeTokens } from '../theme/deskThemes';

export function drawDeskPaperBackground(
  ctx: CanvasRenderingContext2D,
  theme: DeskThemeTokens,
  deskPaperTile: HTMLCanvasElement,
  viewportW: number,
  viewportH: number,
  grainStrength: number
): void {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, viewportW, viewportH);

  const deskPattern = ctx.createPattern(deskPaperTile, 'repeat');
  if (!deskPattern) return;

  ctx.save();
  ctx.globalCompositeOperation = theme.isDarkDesk ? 'soft-light' : 'multiply';
  ctx.globalAlpha = theme.isDarkDesk
    ? 0.28
    : Math.min(0.85, 0.35 + grainStrength * 0.8);
  ctx.fillStyle = deskPattern;
  ctx.fillRect(0, 0, viewportW, viewportH);
  ctx.restore();
}
