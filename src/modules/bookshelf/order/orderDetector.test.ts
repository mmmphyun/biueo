import { describe, expect, it } from 'vitest';
import type {
  BookColorId,
  BookHeightTier,
  BookModel,
  BookThicknessTier,
  RitualNote,
  SpineMotif,
} from '../../../types/contracts';
import { BOOK_COLORS } from '../data/bookPalette';
import { createDefaultVolume } from '../data/defaultBooks';
import {
  detectLiveCompartmentOrders,
  detectShelfOrders,
  getOrderRewardTier,
} from './orderDetector';

function makeNote(content = '짧은 기록'): RitualNote {
  return {
    promptType: 'strength_recall',
    promptText: '질문',
    content,
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
  };
}

function makeBook(
  id: string,
  opts: {
    colorId?: BookColorId;
    heightTier?: BookHeightTier;
    thicknessTier?: BookThicknessTier;
    motif?: SpineMotif;
    compartmentIndex?: number;
    orderInCompartment?: number;
    fallenDir?: -1 | 1;
    note?: RitualNote | null;
  } = {}
): BookModel {
  const colorId = opts.colorId ?? 'coral';
  return {
    id,
    seed: 100,
    colorId,
    colorOrderIndex: BOOK_COLORS[colorId].orderIndex,
    heightTier: opts.heightTier ?? 0,
    thicknessTier: opts.thicknessTier ?? 0,
    motif: opts.motif ?? 'plain',
    defaultPromptType: 'strength_recall',
    placement:
      opts.compartmentIndex === undefined
        ? null
        : {
            compartmentIndex: opts.compartmentIndex,
            orderInCompartment: opts.orderInCompartment ?? 0,
            ...(opts.fallenDir !== undefined ? { fallenDir: opts.fallenDir } : {}),
          },
    note: opts.note ?? null,
  };
}

function fillChaosBooks(total: number, startCompartment = 1): BookModel[] {
  const colors: BookColorId[] = ['coral', 'charcoal', 'butter', 'slate'];
  const heights: BookHeightTier[] = [0, 3, 1, 2];
  const thicknesses: BookThicknessTier[] = [0, 2, 1, 0];
  const motifs: SpineMotif[] = ['diamond', 'wave', 'stitch', 'dots'];

  return Array.from({ length: total }, (_, idx) => {
    const comp = startCompartment + Math.floor(idx / 4);
    const slot = idx % 4;
    return makeBook(`filler-${idx}`, {
      colorId: colors[(idx + comp) % colors.length],
      heightTier: heights[(idx + comp) % heights.length],
      thicknessTier: thicknesses[(idx + comp) % thicknesses.length],
      motif: motifs[(idx + comp) % motifs.length],
      compartmentIndex: comp,
      orderInCompartment: slot,
    });
  });
}

describe('detectShelfOrders', () => {
  it('detects hue orders for identical, ascending, and descending compartments and rejects broken or <3 books', () => {
    const identical = [
      makeBook('a0', { colorId: 'sage', heightTier: 1, thicknessTier: 0, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('a1', { colorId: 'sage', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('a2', { colorId: 'sage', heightTier: 0, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2 }),
      makeBook('a3', { colorId: 'sage', heightTier: 2, thicknessTier: 0, motif: 'stitch', compartmentIndex: 0, orderInCompartment: 3 }),
    ];
    const asc = [
      makeBook('b0', { colorId: 'coral', heightTier: 2, thicknessTier: 1, motif: 'plain', compartmentIndex: 1, orderInCompartment: 0 }),
      makeBook('b1', { colorId: 'salmon', heightTier: 0, thicknessTier: 0, motif: 'dots', compartmentIndex: 1, orderInCompartment: 1 }),
      makeBook('b2', { colorId: 'butter', heightTier: 3, thicknessTier: 2, motif: 'wave', compartmentIndex: 1, orderInCompartment: 2 }),
      makeBook('b3', { colorId: 'olive', heightTier: 1, thicknessTier: 0, motif: 'stitch', compartmentIndex: 1, orderInCompartment: 3 }),
    ];
    const desc = [
      makeBook('c0', { colorId: 'charcoal', heightTier: 1, thicknessTier: 0, motif: 'plain', compartmentIndex: 2, orderInCompartment: 0 }),
      makeBook('c1', { colorId: 'cream', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 2, orderInCompartment: 1 }),
      makeBook('c2', { colorId: 'oat', heightTier: 0, thicknessTier: 1, motif: 'wave', compartmentIndex: 2, orderInCompartment: 2 }),
      makeBook('c3', { colorId: 'slate', heightTier: 2, thicknessTier: 0, motif: 'stitch', compartmentIndex: 2, orderInCompartment: 3 }),
    ];
    const broken = [
      makeBook('d0', { colorId: 'coral', compartmentIndex: 3, orderInCompartment: 0 }),
      makeBook('d1', { colorId: 'slate', compartmentIndex: 3, orderInCompartment: 1 }),
      makeBook('d2', { colorId: 'butter', compartmentIndex: 3, orderInCompartment: 2 }),
    ];
    const tooFew = [
      makeBook('e0', { colorId: 'coral', compartmentIndex: 4, orderInCompartment: 0 }),
      makeBook('e1', { colorId: 'coral', compartmentIndex: 4, orderInCompartment: 1 }),
    ];

    const orders = detectShelfOrders([...identical, ...asc, ...desc, ...broken, ...tooFew], 3, 3);
    const hueComp = orders.find((o) => o.kind === 'hue' && o.scope === 'compartment');
    expect(hueComp?.targetIndices).toEqual([0, 1, 2]);
  });

  it('detects height monotonic, mountain arch, and valley arch while rejecting oscillating heights', () => {
    const mountain4 = [
      makeBook('m0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('m1', { colorId: 'charcoal', heightTier: 2, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('m2', { colorId: 'butter', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2 }),
      makeBook('m3', { colorId: 'slate', heightTier: 0, thicknessTier: 0, motif: 'stitch', compartmentIndex: 0, orderInCompartment: 3 }),
    ];
    const mountain5 = [
      makeBook('p0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 1, orderInCompartment: 0 }),
      makeBook('p1', { colorId: 'charcoal', heightTier: 1, thicknessTier: 2, motif: 'dots', compartmentIndex: 1, orderInCompartment: 1 }),
      makeBook('p2', { colorId: 'butter', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 1, orderInCompartment: 2 }),
      makeBook('p3', { colorId: 'slate', heightTier: 1, thicknessTier: 0, motif: 'stitch', compartmentIndex: 1, orderInCompartment: 3 }),
      makeBook('p4', { colorId: 'olive', heightTier: 0, thicknessTier: 2, motif: 'bands', compartmentIndex: 1, orderInCompartment: 4 }),
    ];
    const valley = [
      makeBook('v0', { colorId: 'coral', heightTier: 3, thicknessTier: 0, motif: 'plain', compartmentIndex: 2, orderInCompartment: 0 }),
      makeBook('v1', { colorId: 'charcoal', heightTier: 1, thicknessTier: 2, motif: 'dots', compartmentIndex: 2, orderInCompartment: 1 }),
      makeBook('v2', { colorId: 'butter', heightTier: 1, thicknessTier: 1, motif: 'wave', compartmentIndex: 2, orderInCompartment: 2 }),
      makeBook('v3', { colorId: 'slate', heightTier: 3, thicknessTier: 0, motif: 'stitch', compartmentIndex: 2, orderInCompartment: 3 }),
    ];
    const osc = [
      makeBook('o0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 3, orderInCompartment: 0 }),
      makeBook('o1', { colorId: 'charcoal', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 3, orderInCompartment: 1 }),
      makeBook('o2', { colorId: 'butter', heightTier: 0, thicknessTier: 1, motif: 'wave', compartmentIndex: 3, orderInCompartment: 2 }),
      makeBook('o3', { colorId: 'slate', heightTier: 3, thicknessTier: 0, motif: 'stitch', compartmentIndex: 3, orderInCompartment: 3 }),
      makeBook('o4', { colorId: 'olive', heightTier: 0, thicknessTier: 2, motif: 'bands', compartmentIndex: 3, orderInCompartment: 4 }),
    ];
    const asym = [
      makeBook('x0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 4, orderInCompartment: 0 }),
      makeBook('x1', { colorId: 'charcoal', heightTier: 2, thicknessTier: 2, motif: 'dots', compartmentIndex: 4, orderInCompartment: 1 }),
      makeBook('x2', { colorId: 'butter', heightTier: 3, thicknessTier: 1, motif: 'wave', compartmentIndex: 4, orderInCompartment: 2 }),
      makeBook('x3', { colorId: 'slate', heightTier: 1, thicknessTier: 0, motif: 'stitch', compartmentIndex: 4, orderInCompartment: 3 }),
    ];

    const orders = detectShelfOrders([...mountain4, ...mountain5, ...valley, ...osc, ...asym], 3, 3);
    const heightComp = orders.find((o) => o.kind === 'height' && o.scope === 'compartment');
    expect(heightComp?.targetIndices).toEqual([0, 1, 2]);
  });

  it('detects thickness and compartment-only motif orders', () => {
    const books = [
      makeBook('t0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'diamond', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('t1', { colorId: 'charcoal', heightTier: 3, thicknessTier: 1, motif: 'diamond', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('t2', { colorId: 'butter', heightTier: 1, thicknessTier: 2, motif: 'diamond', compartmentIndex: 0, orderInCompartment: 2 }),
      makeBook('t3', { colorId: 'slate', heightTier: 2, thicknessTier: 2, motif: 'diamond', compartmentIndex: 0, orderInCompartment: 3 }),
    ];
    const orders = detectShelfOrders([...books, ...fillChaosBooks(32, 1)], 3, 3);
    expect(orders.some((o) => o.kind === 'thickness' && o.scope === 'compartment' && o.targetIndices.includes(0))).toBe(true);
    expect(orders.some((o) => o.kind === 'motif' && o.scope === 'compartment' && o.targetIndices.includes(0))).toBe(true);
    expect(orders.some((o) => o.kind === 'motif' && o.scope !== 'compartment')).toBe(false);
  });

  it('rejects jumping hue gaps while recognizing adjacent hue steps and compartment-level grouping across rows and shelf', () => {
    // 1) 건너뛰는 색 순열(0-2-4-5)은 칸 hue 질서로 인정하지 않음
    const jumpedComp = [
      makeBook('j0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('j1', { colorId: 'butter', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('j2', { colorId: 'sage', heightTier: 1, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2 }),
      makeBook('j3', { colorId: 'slate', heightTier: 2, thicknessTier: 0, motif: 'stitch', compartmentIndex: 0, orderInCompartment: 3 }),
      ...fillChaosBooks(32, 1),
    ];
    expect(
      detectShelfOrders(jumpedComp, 3, 3).some((o) => o.kind === 'hue' && o.targetIndices.includes(0))
    ).toBe(false);

    // 2) olive-sage-oat처럼 각 2권(총 6권, uniform 미충족)이고 4->6 간격이 있는 행은 row hue 질서 미인정
    const gappedRowBooks = [
      makeBook('g0', { colorId: 'olive', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('g1', { colorId: 'olive', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('g2', { colorId: 'sage', heightTier: 1, thicknessTier: 1, motif: 'wave', compartmentIndex: 1, orderInCompartment: 0 }),
      makeBook('g3', { colorId: 'sage', heightTier: 2, thicknessTier: 0, motif: 'stitch', compartmentIndex: 1, orderInCompartment: 1 }),
      makeBook('g4', { colorId: 'oat', heightTier: 0, thicknessTier: 2, motif: 'bands', compartmentIndex: 2, orderInCompartment: 0 }),
      makeBook('g5', { colorId: 'oat', heightTier: 3, thicknessTier: 1, motif: 'diamond', compartmentIndex: 2, orderInCompartment: 1 }),
      ...fillChaosBooks(24, 3),
    ];
    expect(
      detectShelfOrders(gappedRowBooks, 3, 3).some((o) => o.kind === 'hue' && o.scope === 'row')
    ).toBe(false);

    // 3) 9칸 모두 1색씩(비단조 색상 배치 포함) 분류된 서가는 row [0,1,2] + shelf Tier 3 hue로 인정
    const palettePerComp: BookColorId[] = [
      'olive', 'sage', 'oat',
      'slate', 'charcoal', 'coral',
      'salmon', 'cream', 'butter',
    ];
    const heightsCycle: BookHeightTier[] = [0, 3, 1, 2];
    const thickCycle: BookThicknessTier[] = [0, 2, 1, 0];
    const motifCycle: SpineMotif[] = ['plain', 'dots', 'wave', 'stitch'];
    const groupedShelfBooks: BookModel[] = [];
    for (let c = 0; c < 9; c += 1) {
      for (let i = 0; i < 4; i += 1) {
        groupedShelfBooks.push(
          makeBook(`gs_${c}_${i}`, {
            colorId: palettePerComp[c],
            heightTier: heightsCycle[(c + i) % heightsCycle.length],
            thicknessTier: thickCycle[(c + i) % thickCycle.length],
            motif: motifCycle[(c + i) % motifCycle.length],
            compartmentIndex: c,
            orderInCompartment: i,
          })
        );
      }
    }
    const shelfOrders = detectShelfOrders(groupedShelfBooks, 3, 3);
    expect(shelfOrders.find((o) => o.kind === 'hue' && o.scope === 'row')?.targetIndices).toEqual([0, 1, 2]);
    expect(shelfOrders.some((o) => o.kind === 'hue' && o.scope === 'shelf')).toBe(true);
    expect(getOrderRewardTier(shelfOrders)).toBe(3);

    // 4) 단일 행(1행: slate, charcoal, coral)만 각 칸 3권 이상 단일 색 분류 시 해당 row Tier 2 인정
    const singleRowGrouped: BookModel[] = [];
    const chaosBase = fillChaosBooks(24, 0);
    for (const b of chaosBase) {
      if (b.placement && b.placement.compartmentIndex >= 3) {
        singleRowGrouped.push({
          ...b,
          placement: {
            ...b.placement,
            compartmentIndex: b.placement.compartmentIndex + 3,
          },
        });
      } else {
        singleRowGrouped.push(b);
      }
    }
    const row1Colors: BookColorId[] = ['slate', 'charcoal', 'coral'];
    for (let col = 0; col < 3; col += 1) {
      for (let i = 0; i < 4; i += 1) {
        singleRowGrouped.push(
          makeBook(`sr_${col}_${i}`, {
            colorId: row1Colors[col],
            heightTier: heightsCycle[(col + i) % heightsCycle.length],
            thicknessTier: thickCycle[(col + i) % thickCycle.length],
            motif: motifCycle[(col + i) % motifCycle.length],
            compartmentIndex: 3 + col,
            orderInCompartment: i,
          })
        );
      }
    }
    const rowOrders = detectShelfOrders(singleRowGrouped, 3, 3);
    expect(rowOrders.find((o) => o.kind === 'hue' && o.scope === 'row')?.targetIndices).toEqual([1]);
    expect(rowOrders.some((o) => o.kind === 'hue' && o.scope === 'shelf')).toBe(false);
    expect(getOrderRewardTier(rowOrders)).toBe(2);
  });

  it('enforces the 3 <= totalWritten < totalBooks guard on written order detection', () => {
    // 2권 기록 -> written 미발동
    const twoWritten = [
      makeBook('w0', { compartmentIndex: 0, orderInCompartment: 0, note: makeNote() }),
      makeBook('w1', { compartmentIndex: 0, orderInCompartment: 1, note: makeNote() }),
      makeBook('w2', { compartmentIndex: 0, orderInCompartment: 2, note: null }),
      ...fillChaosBooks(33, 1),
    ];
    expect(detectShelfOrders(twoWritten, 3, 3).some((o) => o.kind === 'written')).toBe(false);

    // 4권 기록(36권 중) -> 칸 0 written 발동
    const fourWritten = [
      makeBook('w0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0, note: makeNote() }),
      makeBook('w1', { colorId: 'charcoal', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1, note: makeNote() }),
      makeBook('w2', { colorId: 'butter', heightTier: 1, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2, note: makeNote() }),
      makeBook('w3', { colorId: 'slate', heightTier: 2, thicknessTier: 0, motif: 'stitch', compartmentIndex: 0, orderInCompartment: 3, note: makeNote() }),
      ...fillChaosBooks(32, 1),
    ];
    const fourOrders = detectShelfOrders(fourWritten, 3, 3);
    expect(fourOrders.find((o) => o.kind === 'written')).toEqual({
      kind: 'written',
      scope: 'compartment',
      targetIndices: [0],
    });

    // 36/36 전권 기록 -> written 비활성화, 다른 4종은 정상 판정
    const allWritten = fourWritten.map((b, idx) => ({
      ...b,
      note: makeNote(`기록 ${idx}`),
    }));
    expect(detectShelfOrders(allWritten, 3, 3).some((o) => o.kind === 'written')).toBe(false);

    // 60/60(5x3) 전권 기록 -> written 비활성화
    const vol5x3 = createDefaultVolume(1, '5x3');
    vol5x3.books.forEach((b, idx) => {
      b.note = makeNote(`5x3 기록 ${idx}`);
    });
    expect(detectShelfOrders(vol5x3.books, 5, 3).some((o) => o.kind === 'written')).toBe(false);
  });

  it('detects row and shelf orders across 3x3 and transposed 3x5 layouts and respects unplaced guards', () => {
    const row0Colors: BookColorId[] = [
      'coral', 'coral', 'coral', 'coral',
      'salmon', 'salmon', 'salmon', 'salmon',
      'butter', 'butter', 'butter', 'butter',
    ];
    const row0 = row0Colors.map((colorId, idx) =>
      makeBook(`r0-${idx}`, {
        colorId,
        heightTier: (idx % 4) as BookHeightTier,
        thicknessTier: (idx % 3) as BookThicknessTier,
        motif: idx % 2 === 0 ? 'plain' : 'dots',
        compartmentIndex: Math.floor(idx / 4),
        orderInCompartment: idx % 4,
      })
    );
    const rest = fillChaosBooks(24, 3);
    const rowOrders = detectShelfOrders([...row0, ...rest], 3, 3);
    expect(rowOrders.some((o) => o.kind === 'hue' && o.scope === 'row' && o.targetIndices.includes(0))).toBe(true);
    expect(getOrderRewardTier(rowOrders)).toBe(2);

    // 모바일 전치 3x5 (renderCols = 3, renderRows = 5)에서도 행(0..4) 질서 감지
    const row4 = row0Colors.map((colorId, idx) =>
      makeBook(`t4-${idx}`, {
        colorId,
        heightTier: 2,
        thicknessTier: 1,
        motif: 'plain',
        compartmentIndex: 12 + Math.floor(idx / 4),
        orderInCompartment: idx % 4,
      })
    );
    const mobileBooks = [...fillChaosBooks(48, 0), ...row4];
    const mobileOrders = detectShelfOrders(mobileBooks, 3, 5);
    expect(mobileOrders.some((o) => o.kind === 'hue' && o.scope === 'row' && o.targetIndices.includes(4))).toBe(true);

    // 전체 36권 높이 단조 증가 -> Tier 3 (shelf)
    const fullShelf = Array.from({ length: 36 }, (_, idx) =>
      makeBook(`s-${idx}`, {
        colorId: idx % 2 === 0 ? 'coral' : 'slate',
        heightTier: Math.min(3, Math.floor(idx / 9)) as BookHeightTier,
        thicknessTier: (idx % 3) as BookThicknessTier,
        motif: idx % 2 === 0 ? 'plain' : 'wave',
        compartmentIndex: Math.floor(idx / 4),
        orderInCompartment: idx % 4,
      })
    );
    const shelfOrders = detectShelfOrders(fullShelf, 3, 3);
    expect(shelfOrders.some((o) => o.kind === 'height' && o.scope === 'shelf')).toBe(true);
    expect(getOrderRewardTier(shelfOrders)).toBe(3);

    // 미배치 책이 있으면 shelf 질서는 발동하지 않는다
    const partialShelf = fullShelf.map((b, idx) => (idx === 35 ? { ...b, placement: null } : b));
    expect(detectShelfOrders(partialShelf, 3, 3).some((o) => o.scope === 'shelf')).toBe(false);
  });

  it('computes Tier 0 for empty orders and Tier 1 for compartment-only orders', () => {
    expect(getOrderRewardTier([])).toBe(0);
    expect(
      getOrderRewardTier([{ kind: 'motif', scope: 'compartment', targetIndices: [2] }])
    ).toBe(1);
  });

  it('excludes compartments, rows, and shelf containing any fallen book while evaluating clean siblings', () => {
    const fallenRow0 = Array.from({ length: 12 }, (_, idx) =>
      makeBook(`f-${idx}`, {
        colorId: 'coral',
        heightTier: 1,
        thicknessTier: 1,
        motif: 'plain',
        compartmentIndex: Math.floor(idx / 4),
        orderInCompartment: idx % 4,
        // 0번 칸 마지막 책만 우측으로 쓰러짐 -> 0번 칸·0번 행·전체 서가 모두 제외, 1·2번 칸만 인정
        fallenDir: idx === 3 ? 1 : undefined,
      })
    );
    const cleanRest = Array.from({ length: 24 }, (_, idx) =>
      makeBook(`rest-${idx}`, {
        colorId: 'coral',
        heightTier: 1,
        thicknessTier: 1,
        motif: 'plain',
        compartmentIndex: 3 + Math.floor(idx / 4),
        orderInCompartment: idx % 4,
      })
    );
    const orders = detectShelfOrders([...fallenRow0, ...cleanRest], 3, 3);
    const hueComp = orders.find((o) => o.kind === 'hue' && o.scope === 'compartment');
    expect(hueComp?.targetIndices).not.toContain(0);
    expect(hueComp?.targetIndices).toContain(1);
    expect(hueComp?.targetIndices).toContain(2);

    const rowOrder = orders.find((o) => o.kind === 'hue' && o.scope === 'row');
    expect(rowOrder?.targetIndices).toEqual([1, 2]);
    expect(orders.some((o) => o.scope === 'shelf')).toBe(false);
    expect(getOrderRewardTier(orders)).toBe(2);

    // 좌측 쓰러짐(-1)도 동일하게 제외된다
    const leftFallen = fallenRow0.map((b, idx) =>
      idx === 3 ? { ...b, placement: { ...b.placement!, fallenDir: -1 as const } } : b
    );
    const leftOrders = detectShelfOrders([...leftFallen, ...cleanRest], 3, 3);
    expect(leftOrders.find((o) => o.kind === 'hue' && o.scope === 'compartment')?.targetIndices).not.toContain(0);
    expect(leftOrders.some((o) => o.scope === 'shelf')).toBe(false);
  });
});

describe('detectLiveCompartmentOrders', () => {
  it('requires >= 4 books and detects only hue, height, and motif in live mode', () => {
    // 3권 동일 색·높이·무늬(예: 검은색 3권)는 실시간 미발동
    const uniform3 = [
      makeBook('u0', { colorId: 'charcoal', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('u1', { colorId: 'charcoal', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 1 }),
      makeBook('u2', { colorId: 'charcoal', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2 }),
    ];
    expect(detectLiveCompartmentOrders(uniform3, 0)).toEqual([]);

    // 4권 동일 색 + 동일 높이 + 동일 무늬 -> hue, height, motif만 인정 (thickness 제외)
    const uniform4 = [
      ...uniform3,
      makeBook('u3', { colorId: 'charcoal', heightTier: 2, thicknessTier: 1, motif: 'wave', compartmentIndex: 0, orderInCompartment: 3 }),
    ];
    expect(detectLiveCompartmentOrders(uniform4, 0)).toEqual(['hue', 'height', 'motif']);

    // 4권 엄격 계단 색상/높이 및 대칭 아치 인정
    const stair4 = [
      makeBook('s0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 1, orderInCompartment: 0 }),
      makeBook('s1', { colorId: 'salmon', heightTier: 1, thicknessTier: 1, motif: 'dots', compartmentIndex: 1, orderInCompartment: 1 }),
      makeBook('s2', { colorId: 'butter', heightTier: 2, thicknessTier: 2, motif: 'wave', compartmentIndex: 1, orderInCompartment: 2 }),
      makeBook('s3', { colorId: 'olive', heightTier: 3, thicknessTier: 0, motif: 'stitch', compartmentIndex: 1, orderInCompartment: 3 }),
    ];
    expect(detectLiveCompartmentOrders(stair4, 1)).toEqual(['hue', 'height']);

    const arch4 = [
      makeBook('a0', { colorId: 'coral', heightTier: 0, thicknessTier: 0, motif: 'plain', compartmentIndex: 2, orderInCompartment: 0 }),
      makeBook('a1', { colorId: 'charcoal', heightTier: 2, thicknessTier: 1, motif: 'dots', compartmentIndex: 2, orderInCompartment: 1 }),
      makeBook('a2', { colorId: 'butter', heightTier: 2, thicknessTier: 2, motif: 'wave', compartmentIndex: 2, orderInCompartment: 2 }),
      makeBook('a3', { colorId: 'slate', heightTier: 0, thicknessTier: 0, motif: 'stitch', compartmentIndex: 2, orderInCompartment: 3 }),
    ];
    expect(detectLiveCompartmentOrders(arch4, 2)).toEqual(['height']);
  });

  it('ignores thickness-only and written-only in live mode while preserving door-close detection and fallen-book exclusion', () => {
    const thickAndWritten4 = [
      makeBook('w0', { colorId: 'coral', heightTier: 0, thicknessTier: 2, motif: 'plain', compartmentIndex: 0, orderInCompartment: 0, note: makeNote() }),
      makeBook('w1', { colorId: 'charcoal', heightTier: 3, thicknessTier: 2, motif: 'dots', compartmentIndex: 0, orderInCompartment: 1, note: makeNote() }),
      makeBook('w2', { colorId: 'butter', heightTier: 1, thicknessTier: 2, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2, note: makeNote() }),
      makeBook('w3', { colorId: 'slate', heightTier: 2, thicknessTier: 2, motif: 'stitch', compartmentIndex: 0, orderInCompartment: 3, note: makeNote() }),
      ...fillChaosBooks(12, 1),
    ];
    expect(detectLiveCompartmentOrders(thickAndWritten4, 0)).toEqual([]);

    const doorCloseOrders = detectShelfOrders(thickAndWritten4, 3, 3);
    expect(doorCloseOrders.some((o) => o.kind === 'thickness' && o.targetIndices.includes(0))).toBe(true);
    expect(doorCloseOrders.some((o) => o.kind === 'written' && o.targetIndices.includes(0))).toBe(true);

    const uniformWithFallen = [
      makeBook('f0', { colorId: 'charcoal', heightTier: 2, motif: 'wave', compartmentIndex: 0, orderInCompartment: 0 }),
      makeBook('f1', { colorId: 'charcoal', heightTier: 2, motif: 'wave', compartmentIndex: 0, orderInCompartment: 1, fallenDir: 1 }),
      makeBook('f2', { colorId: 'charcoal', heightTier: 2, motif: 'wave', compartmentIndex: 0, orderInCompartment: 2 }),
      makeBook('f3', { colorId: 'charcoal', heightTier: 2, motif: 'wave', compartmentIndex: 0, orderInCompartment: 3 }),
    ];
    expect(detectLiveCompartmentOrders(uniformWithFallen, 0)).toEqual([]);
  });
});
