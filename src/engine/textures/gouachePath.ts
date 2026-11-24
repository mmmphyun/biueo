export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Point2D {
  x: number;
  y: number;
}

function buildEdgePoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  nx: number,
  ny: number,
  jitterPx: number,
  rand: () => number
): Point2D[] {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const segments = Math.max(2, Math.round(dist / 12));
  const pts: Point2D[] = [];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    // 모서리 접합부의 뾰족한 왜곡을 줄이기 위해 끝점 근처 진폭을 완만히 감쇠한다.
    const edgeEnvelope = Math.sin(Math.PI * t);
    const offset = (rand() - 0.5) * 2 * jitterPx * (0.35 + 0.65 * edgeEnvelope);
    pts.push({
      x: x1 + (x2 - x1) * t + nx * offset,
      y: y1 + (y2 - y1) * t + ny * offset,
    });
  }
  return pts;
}

/**
 * 검은 외곽선 없이 손으로 재단한 과슈/종이 다각형 경로를 캔버스 컨텍스트에 그린다.
 */
export function traceOrganicRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  jitterPx: number,
  seed: number
): void {
  const r = Math.min(radius, w * 0.35, h * 0.35);
  const rand = mulberry32(seed);

  if (jitterPx <= 0.02) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  const corners: Point2D[] = [
    { x: x + r, y },
    { x: x + w - r, y },
    { x: x + w, y: y + r },
    { x: x + w, y: y + h - r },
    { x: x + w - r, y: y + h },
    { x: x + r, y: y + h },
    { x, y: y + h - r },
    { x, y: y + r },
  ];

  const allPts: Point2D[] = [
    corners[0],
    ...buildEdgePoints(corners[0].x, corners[0].y, corners[1].x, corners[1].y, 0, -1, jitterPx, rand),
    corners[1],
    corners[2],
    ...buildEdgePoints(corners[2].x, corners[2].y, corners[3].x, corners[3].y, 1, 0, jitterPx, rand),
    corners[3],
    corners[4],
    ...buildEdgePoints(corners[4].x, corners[4].y, corners[5].x, corners[5].y, 0, 1, jitterPx, rand),
    corners[5],
    corners[6],
    ...buildEdgePoints(corners[6].x, corners[6].y, corners[7].x, corners[7].y, -1, 0, jitterPx, rand),
    corners[7],
  ];

  ctx.beginPath();
  const firstMidX = (allPts[allPts.length - 1].x + allPts[0].x) * 0.5;
  const firstMidY = (allPts[allPts.length - 1].y + allPts[0].y) * 0.5;
  ctx.moveTo(firstMidX, firstMidY);

  for (let i = 0; i < allPts.length; i += 1) {
    const curr = allPts[i];
    const next = allPts[(i + 1) % allPts.length];
    const midX = (curr.x + next.x) * 0.5;
    const midY = (curr.y + next.y) * 0.5;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }
  ctx.closePath();
}

export function fillGouacheShape(
  ctx: CanvasRenderingContext2D,
  tracePath: () => void,
  fillStyle: string | CanvasGradient | CanvasPattern,
  dryEdgeAlpha = 0.18
): void {
  ctx.save();
  ctx.fillStyle = fillStyle;
  tracePath();
  ctx.fill();

  if (dryEdgeAlpha > 0) {
    ctx.globalAlpha *= dryEdgeAlpha;
    ctx.translate(0.45, 0.45);
    tracePath();
    ctx.fill();
  }
  ctx.restore();
}
