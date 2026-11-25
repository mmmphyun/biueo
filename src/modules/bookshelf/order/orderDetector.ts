import type {
  BookModel,
  DetectedOrder,
  OrderKind,
  OrderScope,
} from '../../../types/contracts';

export type OrderRewardTier = 0 | 1 | 2 | 3;

function isMonotonic(values: readonly number[]): boolean {
  if (values.length < 2) return false;
  let nonDecreasing = true;
  let nonIncreasing = true;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) nonDecreasing = false;
    if (values[i] > values[i - 1]) nonIncreasing = false;
    if (!nonDecreasing && !nonIncreasing) return false;
  }
  return true;
}

/**
 * 좌우 대칭 아치(상승 후 하강 또는 하강 후 상승) 여부를 판별한다.
 * 최소 1회 이상의 높이 변화가 포함되어야 평탄 시퀀스와 구분된다.
 */
function isSymmetricArch(values: readonly number[]): boolean {
  const n = values.length;
  if (n < 3) return false;

  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i += 1) {
    if (values[i] !== values[n - 1 - i]) return false;
  }

  const mid = Math.floor((n - 1) / 2);
  let mountain = values[mid] > values[0];
  let valley = values[mid] < values[0];
  if (!mountain && !valley) return false;

  for (let i = 1; i <= mid; i += 1) {
    if (values[i] < values[i - 1]) mountain = false;
    if (values[i] > values[i - 1]) valley = false;
    if (!mountain && !valley) return false;
  }
  return true;
}

function isHeightOrdered(values: readonly number[]): boolean {
  return isMonotonic(values) || isSymmetricArch(values);
}

function hasFallenBook(books: readonly BookModel[]): boolean {
  return books.some((b) => b.placement?.fallenDir !== undefined);
}

function isAllEqual(values: readonly number[]): boolean {
  return values.length >= 3 && values.every((v) => v === values[0]);
}

function isStrictStepMonotonic(values: readonly number[]): boolean {
  if (values.length < 4) return false;
  let inc = true;
  let dec = true;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] <= values[i - 1]) inc = false;
    if (values[i] >= values[i - 1]) dec = false;
    if (!inc && !dec) return false;
  }
  return true;
}

function evaluateSequenceOrders(
  books: readonly BookModel[],
  scope: OrderScope,
  canEvaluateWritten: boolean
): readonly OrderKind[] {
  const kinds: OrderKind[] = [];
  if (books.length < 3) return kinds;

  const hues = books.map((b) => b.colorOrderIndex);
  if (isMonotonic(hues)) {
    kinds.push('hue');
  }

  const heights = books.map((b) => b.heightTier);
  if (isHeightOrdered(heights)) {
    kinds.push('height');
  }

  const thicknesses = books.map((b) => b.thicknessTier);
  if (isMonotonic(thicknesses)) {
    kinds.push('thickness');
  }

  if (scope === 'compartment') {
    const firstMotif = books[0].motif;
    if (books.every((b) => b.motif === firstMotif)) {
      kinds.push('motif');
    }
    if (canEvaluateWritten && books.every((b) => b.note !== null)) {
      kinds.push('written');
    }
  }

  return kinds;
}

/**
 * 책장 칸·행·전체 범위에서 5종 질서(hue, height, thickness, motif, written)를 감지한다.
 * 전권이 기록된 볼륨에서는 매 잠금마다 written이 자동 발동하지 않도록 비활성화한다.
 */
export function detectShelfOrders(
  books: readonly BookModel[],
  gridCols = 3,
  gridRows = 3
): DetectedOrder[] {
  const totalCompartments = gridCols * gridRows;
  const byComp: BookModel[][] = Array.from({ length: totalCompartments }, () => []);

  for (const book of books) {
    const placement = book.placement;
    if (!placement) continue;
    const idx = placement.compartmentIndex;
    if (idx < 0 || idx >= totalCompartments) continue;
    byComp[idx].push(book);
  }

  for (const comp of byComp) {
    comp.sort((a, b) => {
      const orderDiff =
        (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.placement?.normX ?? 0) - (b.placement?.normX ?? 0);
    });
  }

  const totalWrittenCount = books.reduce((count, b) => (b.note !== null ? count + 1 : count), 0);
  const canEvaluateWritten = totalWrittenCount >= 3 && totalWrittenCount < books.length;

  const compMatches: Record<OrderKind, number[]> = {
    hue: [],
    height: [],
    thickness: [],
    motif: [],
    written: [],
  };

  for (let c = 0; c < totalCompartments; c += 1) {
    const comp = byComp[c];
    if (comp.length < 3 || hasFallenBook(comp)) continue;
    const matched = evaluateSequenceOrders(comp, 'compartment', canEvaluateWritten);
    for (const kind of matched) {
      compMatches[kind].push(c);
    }
  }

  const rowMatches: Record<'hue' | 'height' | 'thickness', number[]> = {
    hue: [],
    height: [],
    thickness: [],
  };
  const minRowBooks = gridCols * 2;

  for (let r = 0; r < gridRows; r += 1) {
    const rowBooks: BookModel[] = [];
    let allFilled = true;
    for (let col = 0; col < gridCols; col += 1) {
      const comp = byComp[r * gridCols + col];
      if (comp.length === 0 || hasFallenBook(comp)) {
        allFilled = false;
        break;
      }
      rowBooks.push(...comp);
    }
    if (!allFilled || rowBooks.length < minRowBooks) continue;

    const matched = evaluateSequenceOrders(rowBooks, 'row', false);
    for (const kind of matched) {
      if (kind === 'hue' || kind === 'height' || kind === 'thickness') {
        rowMatches[kind].push(r);
      }
    }
  }

  const shelfMatches: Record<'hue' | 'height' | 'thickness', number[]> = {
    hue: [],
    height: [],
    thickness: [],
  };
  const shelfBooks = byComp.flat();
  if (shelfBooks.length === books.length && shelfBooks.length >= 3 && !hasFallenBook(shelfBooks)) {
    const matched = evaluateSequenceOrders(shelfBooks, 'shelf', false);
    for (const kind of matched) {
      if (kind === 'hue' || kind === 'height' || kind === 'thickness') {
        shelfMatches[kind].push(0);
      }
    }
  }

  const results: DetectedOrder[] = [];
  const allKinds: readonly OrderKind[] = ['hue', 'height', 'thickness', 'motif', 'written'];
  const rowShelfKinds: readonly ('hue' | 'height' | 'thickness')[] = [
    'hue',
    'height',
    'thickness',
  ];

  for (const kind of allKinds) {
    if (compMatches[kind].length > 0) {
      results.push({
        kind,
        scope: 'compartment',
        targetIndices: compMatches[kind],
      });
    }
  }

  for (const kind of rowShelfKinds) {
    if (rowMatches[kind].length > 0) {
      results.push({
        kind,
        scope: 'row',
        targetIndices: rowMatches[kind],
      });
    }
  }

  for (const kind of rowShelfKinds) {
    if (shelfMatches[kind].length > 0) {
      results.push({
        kind,
        scope: 'shelf',
        targetIndices: shelfMatches[kind],
      });
    }
  }

  return results;
}

export function getOrderRewardTier(orders: readonly DetectedOrder[]): OrderRewardTier {
  let highest: OrderRewardTier = 0;
  for (const order of orders) {
    if (order.scope === 'shelf') return 3;
    if (order.scope === 'row' && highest < 2) highest = 2;
    if (order.scope === 'compartment' && highest < 1) highest = 1;
  }
  return highest;
}

/**
 * 정리 중(OPEN_TIDYING) 실시간 오탐을 막기 위해 4권 이상이면서 직관적인 시각 질서(색·높이·무늬)만 판정한다.
 * 동일 속성(4권+), 엄격 계단(색·높이), 대칭 아치(높이)만 인정하며 두께와 기록 모으기는 문 잠금 시 판정한다.
 */
export function detectLiveCompartmentOrders(
  books: readonly BookModel[],
  compartmentIndex: number
): OrderKind[] {
  const comp = books
    .filter((b) => b.placement?.compartmentIndex === compartmentIndex)
    .sort((a, b) => {
      const orderDiff =
        (a.placement?.orderInCompartment ?? 0) - (b.placement?.orderInCompartment ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.placement?.normX ?? 0) - (b.placement?.normX ?? 0);
    });

  if (comp.length < 4 || hasFallenBook(comp)) return [];

  const kinds: OrderKind[] = [];
  const hues = comp.map((b) => b.colorOrderIndex);
  if (isAllEqual(hues) || isStrictStepMonotonic(hues)) {
    kinds.push('hue');
  }

  const heights = comp.map((b) => b.heightTier);
  if (isAllEqual(heights) || isStrictStepMonotonic(heights) || isSymmetricArch(heights)) {
    kinds.push('height');
  }

  const firstMotif = comp[0].motif;
  if (comp.every((b) => b.motif === firstMotif)) {
    kinds.push('motif');
  }

  return kinds;
}
