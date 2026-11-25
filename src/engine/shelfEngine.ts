import { DESK_THEMES, SHELF_WOOD_COLORS } from '../data/palette';
import type {
  BookModel,
  DeskThemeId,
  RitualNote,
  ShelfEngineCallbacks,
  ShelfEngineController,
  ShelfEngineSnapshot,
  ShelfState,
  ShelfVolume,
  UserPreferences,
  VisualTuningParams,
} from '../types/contracts';
import {
  computeBookDimensions,
  computeBookSlotNormX,
  computeBookSlotRects,
  computeShelfLayout,
  getBookOrganicLeanRad,
  type Rect,
  type ShelfLayoutGeometry,
} from './layout/shelfLayout';
import { ChaosWorld, computeDeskSafeBounds } from './physics/chaosWorld';
import {
  buildNeatPoses,
  commitBookPlacement,
  computeInsertionPreview,
  getEffectiveDragCenter,
  isShortTap,
  pickBookAtPoint,
  stepKinematics,
  syncTargetsFromPlacements,
  type InsertionPreview,
  type KinematicBookPose,
} from './physics/slotSystem';
import {
  bakeBookSprite,
  getTintedShadowCanvas,
  type BakedBookSprite,
} from './textures/bookBaker';
import { traceOrganicRect } from './textures/gouachePath';
import { createPaperNoiseTiles, type PaperNoiseTiles } from './textures/paperNoise';
import {
  bakeShelfSprites,
  drawBrassLatch,
  drawOpenGlassDoorEdge,
  type BakedShelfSprites,
} from './textures/shelfBaker';

function pointInRect(px: number, py: number, rect: Rect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}

function softClamp(val: number, max: number): number {
  return max <= 0 ? 0 : max * Math.tanh(val / max);
}

interface ActivePointerDrag {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly downX: number;
  readonly downY: number;
  readonly downTimeMs: number;
  readonly mode: 'frame_shake' | 'book_candidate';
  readonly bookId: string | null;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  isDraggingBook: boolean;
  lastMoveX: number;
  lastMoveY: number;
  lastMoveTimeMs: number;
  velX: number;
  velY: number;
}

export function createShelfEngine(callbacks: ShelfEngineCallbacks): ShelfEngineController {
  let canvas: HTMLCanvasElement | null = null;
  let volume: ShelfVolume | null = null;
  let themeId: DeskThemeId = 'sage';
  let tuning: VisualTuningParams = { grainStrength: 0.32, edgeJitterPx: 0.7, shadowOffsetPx: 6 };
  let motionShakeEnabled = false;
  let shelfState: ShelfState = 'LOCKED_NEAT';

  let tiles: PaperNoiseTiles | null = null;
  let layout: ShelfLayoutGeometry | null = null;
  let dpr = 1;
  let shelfSprites: BakedShelfSprites | null = null;
  let bookSprites = new Map<string, BakedBookSprite>();
  let bakeKey = '';

  let chaosWorld: ChaosWorld | null = null;
  let isSpillingToDesk = false;
  let poses = new Map<string, KinematicBookPose>();
  let drawOrderIds: string[] = [];
  let hoveredBookId: string | null = null;
  let latchHovered = false;
  let activeDrag: ActivePointerDrag | null = null;
  let insertionPreview: InsertionPreview | null = null;

  // 시각 흔들림, 걸쇠 흔들림, 정돈 완료 크림빛 글로우
  let frameShakeX = 0;
  let frameShakeY = 0;
  let frameShakeVx = 0;
  let frameShakeVy = 0;
  let frameTargetX = 0;
  let frameTargetY = 0;
  let frameShakeAngle = 0;
  let shakeDirSign = 1;
  let shakeSessionCounter = 0;
  let latchWiggleTimer = 0;
  let completionGlowTimer = 0;

  let spaceHeld = false;
  let spacePulseTimerMs = 0;
  let lastMotionShakeMs = 0;
  let paused = false;
  let rafId: number | null = null;
  let lastFrameTimeMs = 0;
  let resizeObserver: ResizeObserver | null = null;

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cloneBooksForCommit = (): BookModel[] => {
    if (!volume) return [];
    return volume.books.map((b) => ({
      ...b,
      placement: b.placement ? { ...b.placement } : null,
      note: b.note ? { ...b.note } : null,
    }));
  };

  const emitSnapshot = () => {
    if (!volume) return;
    let shelvedCount = 0;
    let writtenCount = 0;
    for (const book of volume.books) {
      if (book.placement !== null) shelvedCount += 1;
      if (book.note !== null) writtenCount += 1;
    }
    const snap: ShelfEngineSnapshot = {
      state: shelfState,
      shelvedCount,
      totalCount: volume.books.length,
      writtenCount,
      isDoorOpen: shelfState === 'OPEN_TIDYING' || shelfState === 'BOOK_OPEN_MODAL',
    };
    callbacks.onStateChange(snap);
  };

  const ensureBakedSprites = () => {
    if (!layout || !volume || !tiles) return;
    const key = `${layout.viewportW}x${layout.viewportH}@${dpr}|${volume.id}|${layout.renderCols}x${layout.renderRows}|g=${tuning.grainStrength.toFixed(2)}|j=${tuning.edgeJitterPx.toFixed(2)}`;
    if (bakeKey === key) return;

    shelfSprites = bakeShelfSprites(layout, dpr, tuning, tiles.chalkGrainTile);
    const refComp = layout.compartments[0];
    const nextSprites = new Map<string, BakedBookSprite>();
    for (const book of volume.books) {
      const dims = computeBookDimensions(book, refComp);
      nextSprites.set(
        book.id,
        bakeBookSprite(book, dims.widthPx, dims.heightPx, dpr, tuning, tiles.chalkGrainTile)
      );
    }
    bookSprites = nextSprites;
    bakeKey = key;
  };

  const rebuildSceneForLayout = (width: number, height: number) => {
    if (!volume || !canvas) return;
    const prevLayout = layout;
    const nextLayout = computeShelfLayout(width, height, volume.gridCols, volume.gridRows);
    layout = nextLayout;
    ensureBakedSprites();

    if (chaosWorld) {
      if (shelfState === 'OPEN_TIDYING' && isSpillingToDesk) {
        chaosWorld.updateBounds(computeDeskSafeBounds(width, height), nextLayout.frameRect);
        const bodyPoses = chaosWorld.getBodyPoses();
        for (const [bookId, bp] of bodyPoses) {
          const pose = poses.get(bookId);
          if (!pose) continue;
          pose.x = bp.x;
          pose.y = bp.y;
          pose.angle = bp.angle;
          pose.targetX = bp.x;
          pose.targetY = bp.y;
          pose.targetAngle = bp.angle;
        }
      } else {
        chaosWorld.updateBounds(nextLayout.innerRect);
      }
    }
    if (shelfState === 'LOCKED_NEAT') {
      poses = buildNeatPoses(volume.books, nextLayout);
    } else if (shelfState === 'OPEN_TIDYING') {
      if (poses.size === 0) {
        poses = buildNeatPoses(volume.books, nextLayout);
      } else if (!isSpillingToDesk) {
        if (prevLayout && prevLayout.viewportW > 0 && prevLayout.viewportH > 0) {
          const sx = nextLayout.viewportW / prevLayout.viewportW;
          const sy = nextLayout.viewportH / prevLayout.viewportH;
          if (sx !== 1 || sy !== 1) {
            const draggedId = activeDrag?.isDraggingBook ? activeDrag.bookId : null;
            for (const book of volume.books) {
              if (book.placement !== null || book.id === draggedId) continue;
              const pose = poses.get(book.id);
              if (!pose) continue;
              pose.targetX *= sx;
              pose.targetY *= sy;
            }
          }
        }
        syncTargetsFromPlacements(
          volume.books,
          poses,
          nextLayout,
          activeDrag?.isDraggingBook ? activeDrag.bookId : null,
          insertionPreview
        );
      }
    }
  };

  const drawBookPose = (
    ctx: CanvasRenderingContext2D,
    pose: KinematicBookPose,
    inShelf: boolean,
    isHovered: boolean,
    isDragged: boolean,
    deskShadowHex: string
  ) => {
    const sprite = bookSprites.get(pose.bookId);
    if (!sprite) return;

    const lift = isDragged ? 1 : isHovered ? 0.55 : 0;
    const scale = pose.scale * (1 + lift * 0.05);
    const liftY = isDragged ? 0 : -lift * 4;

    const shadowHex = inShelf && !isDragged
      ? lift > 0.05
        ? SHELF_WOOD_COLORS.frameShadow
        : 'rgba(130, 108, 82, 0.24)'
      : deskShadowHex;

    const sdx = inShelf && !isDragged
      ? 1.8 + lift * (tuning.shadowOffsetPx * 0.75)
      : tuning.shadowOffsetPx * (0.95 + lift * 0.75);
    const sdy = inShelf && !isDragged
      ? 1.4 + lift * (tuning.shadowOffsetPx * 0.85)
      : tuning.shadowOffsetPx * (1.12 + lift * 0.85);

    const shadowMask = getTintedShadowCanvas(sprite, shadowHex);

    ctx.save();
    ctx.translate(pose.x + sdx, pose.y + liftY + sdy);
    ctx.rotate(pose.angle);
    ctx.scale(scale, scale);
    if (inShelf && !isDragged) {
      ctx.globalAlpha = lift > 0.05 ? 0.55 : 0.72;
    }
    ctx.drawImage(
      shadowMask,
      -sprite.bodyW * 0.5 - sprite.bodyOffsetX,
      -sprite.bodyH * 0.5 - sprite.bodyOffsetY,
      sprite.logicalW,
      sprite.logicalH
    );
    ctx.restore();

    ctx.save();
    ctx.translate(pose.x, pose.y + liftY);
    ctx.rotate(pose.angle);
    ctx.scale(scale, scale);
    ctx.drawImage(
      sprite.canvas,
      -sprite.bodyW * 0.5 - sprite.bodyOffsetX,
      -sprite.bodyH * 0.5 - sprite.bodyOffsetY,
      sprite.logicalW,
      sprite.logicalH
    );
    ctx.restore();
  };

  const drawFrame = () => {
    if (!canvas || !layout || !shelfSprites || !tiles || !volume) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = DESK_THEMES[themeId];
    const { viewportW, viewportH, frameRect } = layout;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. 데스크 바탕 및 종이 질감
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, viewportW, viewportH);

    const deskPattern = ctx.createPattern(tiles.deskPaperTile, 'repeat');
    if (deskPattern) {
      ctx.save();
      ctx.globalCompositeOperation = theme.isDarkDesk ? 'soft-light' : 'multiply';
      ctx.globalAlpha = theme.isDarkDesk
        ? 0.28
        : Math.min(0.85, 0.35 + tuning.grainStrength * 0.8);
      ctx.fillStyle = deskPattern;
      ctx.fillRect(0, 0, viewportW, viewportH);
      ctx.restore();
    }

    // 2. 책장 본체 오프셋 그림자 (중심 회전·잡기 흔들림 오프셋 반영)
    const shelfCx = frameRect.x + frameRect.w * 0.5;
    const shelfCy = frameRect.y + frameRect.h * 0.5;
    ctx.save();
    ctx.translate(shelfCx + frameShakeX, shelfCy + frameShakeY);
    if (Math.abs(frameShakeAngle) > 0.0005) {
      ctx.rotate(frameShakeAngle);
    }
    ctx.translate(-shelfCx, -shelfCy);

    ctx.save();
    ctx.fillStyle = theme.shadow;
    traceOrganicRect(
      ctx,
      frameRect.x + tuning.shadowOffsetPx * 1.45,
      frameRect.y + tuning.shadowOffsetPx * 1.75,
      frameRect.w,
      frameRect.h,
      9,
      tuning.edgeJitterPx * 1.05,
      404
    );
    ctx.fill();
    ctx.restore();

    // 3. 자작나무 원목 책장
    ctx.drawImage(
      shelfSprites.shelfBodyCanvas,
      frameRect.x - shelfSprites.padPx,
      frameRect.y - shelfSprites.padPx,
      shelfSprites.logicalW,
      shelfSprites.logicalH
    );

    // 드래그 중 유효 슬롯 하이라이트
    if (insertionPreview && activeDrag?.isDraggingBook) {
      const hr = insertionPreview.highlightRect;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 250, 238, 0.56)';
      ctx.strokeStyle = 'rgba(182, 145, 63, 0.65)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.roundRect(hr.x, hr.y, hr.w, hr.h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. 책 렌더링 순서 분리 (칸 내부 책 -> 유리문 -> 데스크 책 -> 드래그 중인 책)
    if (shelfState === 'SHAKING_CHAOS' && chaosWorld) {
      const refComp = layout.compartments[0];
      const activeBooks = volume.books;
      const drawChaosMap = (
        poseMap: Map<
          string,
          { readonly x: number; readonly y: number; readonly angle: number; readonly depthZ?: number }
        >
      ) => {
        for (const book of activeBooks) {
          const bp = poseMap.get(book.id);
          if (!bp) continue;
          const dims = computeBookDimensions(book, refComp);
          const creepScale = 1 + (bp.depthZ ?? 0) * 0.045;
          drawBookPose(
            ctx,
            {
              bookId: book.id,
              x: bp.x,
              y: bp.y,
              angle: bp.angle,
              scale: creepScale,
              widthPx: dims.widthPx,
              heightPx: dims.heightPx,
              targetX: bp.x,
              targetY: bp.y,
              targetAngle: bp.angle,
              targetScale: creepScale,
            },
            true,
            false,
            false,
            theme.shadow
          );
        }
      };
      drawChaosMap(chaosWorld.getSeatedPoses());
      drawChaosMap(chaosWorld.getBodyPoses());
    } else {
      const shelvedIds: string[] = [];
      const deskIds: string[] = [];
      const draggedId = activeDrag?.isDraggingBook ? activeDrag.bookId : null;

      for (const book of volume.books) {
        if (book.id === draggedId) continue;
        if (book.placement !== null) {
          shelvedIds.push(book.id);
        } else {
          deskIds.push(book.id);
        }
      }

      for (const id of shelvedIds) {
        const pose = poses.get(id);
        if (!pose) continue;
        drawBookPose(
          ctx,
          pose,
          true,
          shelfState === 'OPEN_TIDYING' && hoveredBookId === id,
          false,
          theme.shadow
        );
      }

      const isDoorOpen = shelfState === 'OPEN_TIDYING' || shelfState === 'BOOK_OPEN_MODAL';
      if (!isDoorOpen) {
        ctx.drawImage(
          shelfSprites.glassDoorClosedCanvas,
          frameRect.x - shelfSprites.padPx,
          frameRect.y - shelfSprites.padPx,
          shelfSprites.logicalW,
          shelfSprites.logicalH
        );
      } else {
        drawOpenGlassDoorEdge(ctx, layout);
      }

      const wiggleAngle =
        latchWiggleTimer > 0 ? Math.sin(latchWiggleTimer * 42) * 0.22 * (latchWiggleTimer / 0.35) : 0;
      drawBrassLatch(ctx, layout, isDoorOpen, latchHovered, wiggleAngle);

      // 정돈 완료 크림빛 숨결 글로우 (Tier 0, 0.45s)
      if (completionGlowTimer > 0) {
        const p = completionGlowTimer / 0.45;
        const alpha = Math.sin(p * Math.PI) * 0.36;
        ctx.save();
        ctx.fillStyle = `rgba(255, 250, 236, ${alpha.toFixed(3)})`;
        traceOrganicRect(ctx, frameRect.x, frameRect.y, frameRect.w, frameRect.h, 9, 0.4, 404);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // frameShake 해제 후 데스크 위 책들은 고정 좌표에 그린다.

      for (const id of deskIds) {
        const pose = poses.get(id);
        if (!pose) continue;
        drawBookPose(
          ctx,
          pose,
          false,
          shelfState === 'OPEN_TIDYING' && hoveredBookId === id,
          false,
          theme.shadow
        );
      }

      if (draggedId) {
        const pose = poses.get(draggedId);
        if (pose) {
          drawBookPose(ctx, pose, false, false, true, theme.shadow);
        }
      }

      ctx.restore();
      return;
    }

    // SHAKING_CHAOS 상태의 닫힌 유리문과 걸쇠
    ctx.drawImage(
      shelfSprites.glassDoorClosedCanvas,
      frameRect.x - shelfSprites.padPx,
      frameRect.y - shelfSprites.padPx,
      shelfSprites.logicalW,
      shelfSprites.logicalH
    );
    drawBrassLatch(ctx, layout, false, latchHovered, 0);
    ctx.restore();
    ctx.restore();
  };

  const stepLoop = (nowMs: number) => {
    rafId = null;
    if (paused) return;

    const dtMs = lastFrameTimeMs > 0 ? Math.max(0, Math.min(50, nowMs - lastFrameTimeMs)) : 16.6;
    const dtSec = dtMs * 0.001;
    lastFrameTimeMs = nowMs;

    const reduced = prefersReducedMotion();
    let keepAnimating = false;

    // 스페이스바 홀드 140ms 교차 흔들기
    if (spaceHeld && (shelfState === 'LOCKED_NEAT' || shelfState === 'SHAKING_CHAOS')) {
      spacePulseTimerMs += dtMs;
      if (spacePulseTimerMs >= 140) {
        spacePulseTimerMs = 0;
        triggerShake(0.72);
      }
      keepAnimating = true;
    }

    // 프레임 직접 잡기 추적 및 복원 스프링
    const isHoldingFrame =
      activeDrag?.mode === 'frame_shake' &&
      (shelfState === 'LOCKED_NEAT' || shelfState === 'SHAKING_CHAOS');
    const prevVx = frameShakeVx;
    const prevVy = frameShakeVy;

    if (isHoldingFrame) {
      const k = 340;
      const damp = 32;
      frameShakeVx += (k * (frameTargetX - frameShakeX) - damp * frameShakeVx) * dtSec;
      frameShakeVy += (k * (frameTargetY - frameShakeY) - damp * frameShakeVy) * dtSec;
      frameShakeX += frameShakeVx * dtSec;
      frameShakeY += frameShakeVy * dtSec;
      keepAnimating = true;
    } else if (
      Math.abs(frameShakeX) > 0.1 ||
      Math.abs(frameShakeY) > 0.1 ||
      Math.abs(frameShakeVx) > 0.5 ||
      Math.abs(frameShakeVy) > 0.5 ||
      Math.abs(frameShakeAngle) > 0.001
    ) {
      const k = 190;
      const damp = 14;
      frameShakeVx += (-k * frameShakeX - damp * frameShakeVx) * dtSec;
      frameShakeVy += (-k * frameShakeY - damp * frameShakeVy) * dtSec;
      frameShakeX += frameShakeVx * dtSec;
      frameShakeY += frameShakeVy * dtSec;
      keepAnimating = true;
    } else {
      frameShakeX = 0;
      frameShakeY = 0;
      frameShakeVx = 0;
      frameShakeVy = 0;
      frameShakeAngle = 0;
    }

    const amp = reduced ? 0.3 : 1;
    const targetAngle =
      Math.max(-0.14, Math.min(0.14, frameShakeVx * 0.00014 + frameShakeX * 0.00045)) * amp;
    frameShakeAngle += (targetAngle - frameShakeAngle) * Math.min(1, dtSec * 18);
    if (!isHoldingFrame && Math.abs(frameShakeAngle) < 0.0008 && Math.abs(frameShakeVx) < 0.5) {
      frameShakeAngle = 0;
    }

    const frameAx = (frameShakeVx - prevVx) / Math.max(0.008, dtSec);
    const frameAy = (frameShakeVy - prevVy) / Math.max(0.008, dtSec);
    const accelMag = Math.hypot(frameAx, frameAy);
    const velMag = Math.hypot(frameShakeVx, frameShakeVy);

    if (
      shelfState === 'LOCKED_NEAT' &&
      isHoldingFrame &&
      (accelMag > 900 || velMag > 260) &&
      volume &&
      layout
    ) {
      shakeSessionCounter += 1;
      chaosWorld?.dispose();
      chaosWorld = new ChaosWorld(layout.innerRect);
      chaosWorld.spawnSeatedPoses(buildClosedShelfSpawnList(), shakeSessionCounter);
      shelfState = 'SHAKING_CHAOS';
      emitSnapshot();
    }

    if (latchWiggleTimer > 0) {
      latchWiggleTimer = Math.max(0, latchWiggleTimer - dtSec);
      keepAnimating = true;
    }

    if (completionGlowTimer > 0) {
      completionGlowTimer = Math.max(0, completionGlowTimer - dtSec);
      keepAnimating = true;
    }

    if (shelfState === 'SHAKING_CHAOS' && chaosWorld) {
      chaosWorld.applyFrameShakeMotion(
        frameAx,
        frameAy,
        frameShakeVx,
        frameShakeVy,
        frameShakeAngle,
        dtSec
      );
      chaosWorld.step(dtMs);
      if (isHoldingFrame || !chaosWorld.isAllSleeping()) {
        keepAnimating = true;
      }
    } else if (shelfState === 'OPEN_TIDYING' && isSpillingToDesk && chaosWorld) {
      chaosWorld.step(dtMs);
      const bodyPoses = chaosWorld.getBodyPoses();
      let anyScaling = false;
      for (const [bookId, bp] of bodyPoses) {
        const pose = poses.get(bookId);
        if (!pose) continue;
        pose.x = bp.x;
        pose.y = bp.y;
        pose.angle = bp.angle;
        pose.targetX = bp.x;
        pose.targetY = bp.y;
        pose.targetAngle = bp.angle;
        if (pose.scale !== 1) {
          pose.scale = reduced ? 1 : pose.scale + (1 - pose.scale) * Math.min(1, dtSec * 14);
          if (Math.abs(1 - pose.scale) < 0.003) {
            pose.scale = 1;
          } else {
            anyScaling = true;
          }
        }
        pose.targetScale = 1;
      }

      const draggedId = activeDrag?.isDraggingBook ? activeDrag.bookId : null;
      const freeKinematicPoses = new Map<string, KinematicBookPose>();
      for (const [bookId, pose] of poses) {
        if (!chaosWorld.hasBody(bookId)) {
          freeKinematicPoses.set(bookId, pose);
        }
      }
      if (freeKinematicPoses.size > 0) {
        const moving = stepKinematics(freeKinematicPoses, dtSec, reduced, draggedId);
        if (moving) keepAnimating = true;
      }

      if (anyScaling) {
        keepAnimating = true;
      }

      if ((chaosWorld.isSpillSettled() || chaosWorld.getRemainingCount() === 0) && !anyScaling) {
        isSpillingToDesk = false;
        chaosWorld.dispose();
        chaosWorld = null;
      } else if (!chaosWorld.isSpillSettled()) {
        keepAnimating = true;
      }
    } else if (shelfState === 'OPEN_TIDYING' || shelfState === 'LOCKED_NEAT') {
      const moving = stepKinematics(
        poses,
        dtSec,
        reduced,
        activeDrag?.isDraggingBook ? activeDrag.bookId : null
      );
      if (moving) keepAnimating = true;
    }

    drawFrame();

    if (keepAnimating) {
      rafId = window.requestAnimationFrame(stepLoop);
    }
  };

  const requestRedraw = () => {
    if (paused || rafId !== null) return;
    lastFrameTimeMs = performance.now();
    rafId = window.requestAnimationFrame(stepLoop);
  };

  const buildClosedShelfSpawnList = () => {
    if (!volume || !layout) return [];
    const refComp = layout.compartments[0];
    const uprightRectById = new Map<string, Rect>();

    for (const comp of layout.compartments) {
      const list = volume.books.filter((b) => b.placement?.compartmentIndex === comp.index);
      if (list.length === 0) continue;
      const rects = computeBookSlotRects(list, comp);
      for (const [id, r] of rects) {
        uprightRectById.set(id, r);
      }
    }

    return volume.books.map((book) => {
      const pose = poses.get(book.id);
      const dims = computeBookDimensions(book, refComp);
      const compIdx = book.placement?.compartmentIndex;
      const compRect = compIdx !== undefined ? layout!.compartments[compIdx] : undefined;
      const uprightRect = uprightRectById.get(book.id);

      return {
        bookId: book.id,
        centerX:
          uprightRect
            ? uprightRect.x + uprightRect.w * 0.5
            : (pose?.x ?? layout!.innerRect.x + layout!.innerRect.w * 0.5),
        centerY:
          uprightRect
            ? uprightRect.y + uprightRect.h * 0.5
            : (pose?.y ?? layout!.innerRect.y + layout!.innerRect.h * 0.5),
        widthPx: uprightRect?.w ?? pose?.widthPx ?? dims.widthPx,
        heightPx: uprightRect?.h ?? pose?.heightPx ?? dims.heightPx,
        angleRad: pose?.angle ?? getBookOrganicLeanRad(book.seed),
        ...(compIdx !== undefined && compRect
          ? { compartmentIndex: compIdx, compartmentRect: compRect }
          : {}),
        ...(book.placement?.fallenDir !== undefined
          ? { fallenDir: book.placement.fallenDir }
          : {}),
      };
    });
  };

  const enterChaosAndShake = (vx: number, vy: number) => {
    if (!volume || !layout) return;
    if (shelfState !== 'LOCKED_NEAT' && shelfState !== 'SHAKING_CHAOS') return;

    if (shelfState === 'LOCKED_NEAT') {
      shakeSessionCounter += 1;
      chaosWorld?.dispose();
      chaosWorld = new ChaosWorld(layout.innerRect);
      chaosWorld.spawnSeatedPoses(buildClosedShelfSpawnList(), shakeSessionCounter);
      shelfState = 'SHAKING_CHAOS';
      emitSnapshot();
    }

    chaosWorld?.applyButtonShakeBurst(vx, vy);

    const amp = prefersReducedMotion() ? 0.3 : 1;
    frameShakeVx += Math.max(-180, Math.min(180, vx * 16)) * amp;
    frameShakeVy += Math.max(-120, Math.min(120, vy * 12)) * amp;
    requestRedraw();
  };

  const triggerShake = (intensity = 0.8) => {
    shakeDirSign = -shakeDirSign;
    const clamped = Math.max(0.3, Math.min(1.0, intensity));
    enterChaosAndShake(shakeDirSign * 11 * clamped, -6 * clamped);
  };

  const toggleDoor = () => {
    if (!volume || !layout) return;

    if (shelfState === 'LOCKED_NEAT') {
      // 정돈 상태에서 열면 책들은 제자리에 머문다.
      shelfState = 'OPEN_TIDYING';
      poses = buildNeatPoses(volume.books, layout);
      drawOrderIds = volume.books.map((b) => b.id);
      emitSnapshot();
      requestRedraw();
      return;
    }

    if (shelfState === 'SHAKING_CHAOS') {
      frameTargetX = 0;
      frameTargetY = 0;
      const tippedDirs = chaosWorld?.getTippedDirections() ?? new Map<string, -1 | 1>();

      // 이탈한 책은 먼저 배치를 비우고, 칸에 남은 책 중 쓰러진 책은 fallenDir를 기록한다.
      for (const book of volume.books) {
        if (chaosWorld?.hasBody(book.id)) {
          book.placement = null;
          continue;
        }
        const tipDir = tippedDirs.get(book.id);
        if (tipDir && book.placement) {
          book.placement = { ...book.placement, fallenDir: tipDir };
        }
      }

      // 살짝만 흔들어 실제 이탈한 책이 0권이면 칸 내부 상태(쓰러짐 포함)를 유지한 채 문을 연다.
      if (!chaosWorld || chaosWorld.getDislodgedCount() === 0) {
        chaosWorld?.dispose();
        chaosWorld = null;
        isSpillingToDesk = false;
        shelfState = 'OPEN_TIDYING';
        poses = buildNeatPoses(volume.books, layout);
        drawOrderIds = volume.books.map((b) => b.id);
        if (tippedDirs.size > 0) {
          callbacks.onShelfCommit(cloneBooksForCommit());
        }
        emitSnapshot();
        requestRedraw();
        return;
      }

      // 흔들려 풀린 책만 데스크 여백으로 쏟아지고 칸에 남은 책(기립/쓰러짐)은 자기 자리에 머문다.
      const refComp = layout.compartments[0];
      const nextPoses = buildNeatPoses(volume.books, layout);
      const preSpillPoses = chaosWorld.getBodyPoses();
      for (const book of volume.books) {
        if (!chaosWorld.hasBody(book.id)) continue;
        const dims = computeBookDimensions(book, refComp);
        const bp = preSpillPoses.get(book.id);
        const x = bp?.x ?? layout.innerRect.x + layout.innerRect.w * 0.5;
        const y = bp?.y ?? layout.innerRect.y + layout.innerRect.h * 0.5;
        const angle = bp?.angle ?? getBookOrganicLeanRad(book.seed);
        nextPoses.set(book.id, {
          bookId: book.id,
          x,
          y,
          angle,
          scale: 1,
          widthPx: dims.widthPx,
          heightPx: dims.heightPx,
          targetX: x,
          targetY: y,
          targetAngle: angle,
          targetScale: 1,
        });
      }
      poses = nextPoses;

      chaosWorld.openDoorAndSpill(
        layout.viewportW,
        layout.viewportH,
        layout.frameRect,
        layout.isDesktop
      );

      if (prefersReducedMotion()) {
        chaosWorld.fastForwardSpill(120);
        const settledPoses = chaosWorld.getBodyPoses();
        for (const [bookId, bp] of settledPoses) {
          const pose = poses.get(bookId);
          if (!pose) continue;
          pose.x = bp.x;
          pose.y = bp.y;
          pose.angle = bp.angle;
          pose.targetX = bp.x;
          pose.targetY = bp.y;
          pose.targetAngle = bp.angle;
        }
        chaosWorld.dispose();
        chaosWorld = null;
        isSpillingToDesk = false;
      } else {
        isSpillingToDesk = true;
      }

      refreshDrawOrder();
      shelfState = 'OPEN_TIDYING';
      callbacks.onShelfCommit(cloneBooksForCommit());
      emitSnapshot();
      requestRedraw();
      return;
    }

    if (shelfState === 'OPEN_TIDYING') {
      const hasUnplaced = volume.books.some((b) => b.placement === null);
      if (hasUnplaced) {
        // 아직 책상 위에 책이 남아 있으면 부드러운 걸쇠 흔들림만 표시한다 (오답 버저 없음).
        latchWiggleTimer = 0.35;
        requestRedraw();
        return;
      }

      isSpillingToDesk = false;
      chaosWorld?.dispose();
      chaosWorld = null;
      shelfState = 'LOCKED_NEAT';
      activeDrag = null;
      insertionPreview = null;
      hoveredBookId = null;
      syncTargetsFromPlacements(volume.books, poses, layout, null, null);
      completionGlowTimer = 0.45;
      callbacks.onShelfCommit(cloneBooksForCommit());
      emitSnapshot();
      callbacks.onTidyComplete([]);
      requestRedraw();
    }
  };

  const refreshDrawOrder = (frontBookId?: string) => {
    if (!volume) return;
    const shelved: string[] = [];
    const desk: string[] = [];
    for (const book of volume.books) {
      if (book.id === frontBookId) continue;
      if (book.placement !== null) shelved.push(book.id);
      else desk.push(book.id);
    }
    drawOrderIds = frontBookId ? [...shelved, ...desk, frontBookId] : [...shelved, ...desk];
  };

  const dropBookToDesk = (
    book: BookModel,
    pose: KinematicBookPose,
    releaseVxPxPerSec: number,
    releaseVyPxPerSec: number
  ) => {
    if (!volume || !layout) return;
    const deskBounds = computeDeskSafeBounds(layout.viewportW, layout.viewportH);
    const startX = Math.max(
      deskBounds.x + pose.widthPx * 0.5,
      Math.min(deskBounds.x + deskBounds.w - pose.widthPx * 0.5, pose.x)
    );
    const startY = Math.max(
      deskBounds.y + pose.heightPx * 0.5,
      Math.min(deskBounds.y + deskBounds.h - pose.heightPx * 0.5, pose.y)
    );

    pose.x = startX;
    pose.y = startY;
    pose.targetX = startX;
    pose.targetY = startY;
    pose.targetScale = 1;

    if (!chaosWorld) {
      const restingPoses = volume.books
        .filter((b) => b.placement === null && b.id !== book.id)
        .flatMap((b) => {
          const rp = poses.get(b.id);
          if (!rp) return [];
          return [
            {
              bookId: b.id,
              centerX: rp.x,
              centerY: rp.y,
              widthPx: rp.widthPx,
              heightPx: rp.heightPx,
              angleRad: rp.angle,
            },
          ];
        });
      chaosWorld = new ChaosWorld(deskBounds);
      chaosWorld.enterDeskDropMode(layout.viewportW, layout.viewportH, restingPoses);
    }

    const vx = (releaseVxPxPerSec / 120) * 0.55;
    const vy = (releaseVyPxPerSec / 120) * 0.45;
    chaosWorld.addDroppedBody(
      {
        bookId: book.id,
        centerX: startX,
        centerY: startY,
        widthPx: pose.widthPx,
        heightPx: pose.heightPx,
        angleRad: pose.angle,
      },
      vx,
      vy
    );

    if (prefersReducedMotion()) {
      chaosWorld.fastForwardSpill(120);
      const settledPoses = chaosWorld.getBodyPoses();
      for (const [bookId, bp] of settledPoses) {
        const settledPose = poses.get(bookId);
        if (!settledPose) continue;
        settledPose.x = bp.x;
        settledPose.y = bp.y;
        settledPose.angle = bp.angle;
        settledPose.targetX = bp.x;
        settledPose.targetY = bp.y;
        settledPose.targetAngle = bp.angle;
        settledPose.scale = 1;
        settledPose.targetScale = 1;
      }
      chaosWorld.dispose();
      chaosWorld = null;
      isSpillingToDesk = false;
    } else {
      isSpillingToDesk = true;
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!canvas || !layout || !volume) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // 1. 황동 걸쇠 클릭 우선 처리
    if (pointInRect(px, py, layout.latchHitRect)) {
      toggleDoor();
      return;
    }

    // 2. 잠김/혼돈 상태에서는 책장 프레임 직접 잡기·흔들기 시작
    if (shelfState === 'LOCKED_NEAT' || shelfState === 'SHAKING_CHAOS') {
      if (pointInRect(px, py, layout.frameRect)) {
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        frameTargetX = frameShakeX;
        frameTargetY = frameShakeY;
        activeDrag = {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          downX: px - frameShakeX,
          downY: py - frameShakeY,
          downTimeMs: performance.now(),
          mode: 'frame_shake',
          bookId: null,
          grabOffsetX: 0,
          grabOffsetY: 0,
          isDraggingBook: false,
          lastMoveX: px,
          lastMoveY: py,
          lastMoveTimeMs: performance.now(),
          velX: 0,
          velY: 0,
        };
        requestRedraw();
      }
      return;
    }

    // 3. OPEN_TIDYING: 책 선택 (모바일 28px 근접 자석 포함)
    if (shelfState === 'OPEN_TIDYING') {
      refreshDrawOrder();
      const hitBookId = pickBookAtPoint(px, py, e.pointerType, poses, drawOrderIds);
      if (!hitBookId) return;
      const pose = poses.get(hitBookId);
      if (!pose) return;

      canvas.setPointerCapture(e.pointerId);
      activeDrag = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        downX: px,
        downY: py,
        downTimeMs: performance.now(),
        mode: 'book_candidate',
        bookId: hitBookId,
        grabOffsetX: pose.x - px,
        grabOffsetY: pose.y - py,
        isDraggingBook: false,
        lastMoveX: px,
        lastMoveY: py,
        lastMoveTimeMs: performance.now(),
        velX: 0,
        velY: 0,
      };
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!canvas || !layout || !volume) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (!activeDrag || activeDrag.pointerId !== e.pointerId) {
      const nextLatch = pointInRect(px, py, layout.latchHitRect);
      let nextBook: string | null = null;
      if (!nextLatch && shelfState === 'OPEN_TIDYING') {
        refreshDrawOrder();
        nextBook = pickBookAtPoint(px, py, e.pointerType, poses, drawOrderIds);
      }
      if (nextLatch !== latchHovered || nextBook !== hoveredBookId) {
        latchHovered = nextLatch;
        hoveredBookId = nextBook;
        canvas.style.cursor = nextLatch
          ? 'pointer'
          : nextBook
            ? 'grab'
            : shelfState === 'LOCKED_NEAT' || shelfState === 'SHAKING_CHAOS'
              ? 'grab'
              : 'default';
        requestRedraw();
      }
      return;
    }

    const drag = activeDrag;
    const nowMs = performance.now();
    if (drag.mode === 'frame_shake') {
      const motionScale = prefersReducedMotion() ? 0.35 : 1;
      const maxX = (layout.isDesktop ? 130 : 54) * motionScale;
      const maxY = (layout.isDesktop ? 82 : 48) * motionScale;
      frameTargetX = softClamp(px - drag.downX, maxX);
      frameTargetY = softClamp(py - drag.downY, maxY);
      drag.lastMoveX = px;
      drag.lastMoveY = py;
      drag.lastMoveTimeMs = nowMs;
      requestRedraw();
      return;
    }

    if (drag.mode === 'book_candidate' && drag.bookId) {
      const targetBookId = drag.bookId;
      const dist = Math.hypot(px - drag.downX, py - drag.downY);
      if (!drag.isDraggingBook && dist >= 6) {
        drag.isDraggingBook = true;
        chaosWorld?.removeBody(targetBookId);
        const grabbedBook = volume.books.find((b) => b.id === targetBookId);
        if (grabbedBook?.placement) {
          const compIdx = grabbedBook.placement.compartmentIndex;
          const compBooks = volume.books.filter(
            (b) => b.placement?.compartmentIndex === compIdx
          );
          if (compBooks.some((b) => typeof b.placement?.normX !== 'number')) {
            const resolved = computeBookSlotNormX(compBooks);
            for (const b of compBooks) {
              const nx = resolved.get(b.id);
              if (b.placement && nx !== undefined && typeof b.placement.normX !== 'number') {
                b.placement.normX = nx;
              }
            }
          }
        }
        canvas.style.cursor = 'grabbing';
        refreshDrawOrder(targetBookId);
      }

      if (drag.isDraggingBook) {
        const pose = poses.get(targetBookId);
        const draggedBook = volume.books.find((b) => b.id === targetBookId);
        if (!pose || !draggedBook) return;

        const dtSec = Math.max(0.008, (nowMs - drag.lastMoveTimeMs) * 0.001);
        const instVx = (px - drag.lastMoveX) / dtSec;
        const instVy = (py - drag.lastMoveY) / dtSec;
        drag.velX = instVx * 0.45 + drag.velX * 0.55;
        drag.velY = instVy * 0.45 + drag.velY * 0.55;
        drag.lastMoveX = px;
        drag.lastMoveY = py;
        drag.lastMoveTimeMs = nowMs;

        const center = getEffectiveDragCenter(
          px,
          py,
          drag.grabOffsetX,
          drag.grabOffsetY,
          drag.pointerType
        );
        pose.targetX = center.x;
        pose.targetY = center.y;
        pose.targetAngle = 0;
        pose.targetScale = 1.05;

        insertionPreview = computeInsertionPreview(
          draggedBook,
          center.x,
          center.y,
          volume.books,
          layout
        );
        syncTargetsFromPlacements(
          volume.books,
          poses,
          layout,
          targetBookId,
          insertionPreview
        );
        requestRedraw();
      }
    }
  };

  const handlePointerUpOrCancel = (e: PointerEvent) => {
    if (!canvas || !layout || !volume || !activeDrag || activeDrag.pointerId !== e.pointerId) {
      return;
    }
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const drag = activeDrag;
    activeDrag = null;

    if (drag.mode === 'frame_shake') {
      frameTargetX = 0;
      frameTargetY = 0;
      canvas.style.cursor = 'grab';
      requestRedraw();
      return;
    }

    if (drag.mode === 'book_candidate' && drag.bookId) {
      if (!drag.isDraggingBook) {
        const duration = performance.now() - drag.downTimeMs;
        if (isShortTap(drag.downX, drag.downY, px, py, duration)) {
          callbacks.onBookTap(drag.bookId);
        }
        return;
      }

      const pose = poses.get(drag.bookId);
      const book = volume.books.find((b) => b.id === drag.bookId);
      if (pose && book) {
        if (insertionPreview) {
          commitBookPlacement(
            volume.books,
            drag.bookId,
            insertionPreview.compartmentIndex,
            insertionPreview.insertIndex,
            insertionPreview.slotNormX
          );
          pose.targetScale = 1;
          insertionPreview = null;
          syncTargetsFromPlacements(volume.books, poses, layout, null, null);
        } else {
          // 칸 밖이나 꽉 찬 칸 위에서 놓으면 현재 위치에서 중력을 받아 데스크로 떨어진다.
          commitBookPlacement(volume.books, drag.bookId, null);
          insertionPreview = null;
          syncTargetsFromPlacements(volume.books, poses, layout, drag.bookId, null);
          const isFreshThrow = performance.now() - drag.lastMoveTimeMs <= 90;
          dropBookToDesk(
            book,
            pose,
            isFreshThrow ? drag.velX : 0,
            isFreshThrow ? drag.velY : 0
          );
        }
      } else {
        insertionPreview = null;
      }

      refreshDrawOrder();
      canvas.style.cursor = 'grab';
      callbacks.onShelfCommit(cloneBooksForCommit());
      emitSnapshot();
      requestRedraw();
    }
  };

  const handlePointerLeave = () => {
    if (!activeDrag && (latchHovered || hoveredBookId !== null)) {
      latchHovered = false;
      hoveredBookId = null;
      if (canvas) canvas.style.cursor = 'default';
      requestRedraw();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;
    if (document.querySelector('dialog[open]')) return;
    if (shelfState !== 'LOCKED_NEAT' && shelfState !== 'SHAKING_CHAOS') return;

    e.preventDefault();
    if (!spaceHeld) {
      spaceHeld = true;
      spacePulseTimerMs = 0;
      triggerShake(0.75);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      spacePulseTimerMs = 0;
    }
  };

  const handleDeviceMotion = (e: DeviceMotionEvent) => {
    if (!motionShakeEnabled) return;
    if (shelfState !== 'LOCKED_NEAT' && shelfState !== 'SHAKING_CHAOS') return;
    const acc = e.acceleration ?? e.accelerationIncludingGravity;
    if (!acc) return;

    const ax = acc.x ?? 0;
    const ay = acc.y ?? 0;
    const az = acc.z ?? 0;
    const rawMag = Math.hypot(ax, ay, az);
    const linearMag = e.acceleration ? rawMag : Math.abs(rawMag - 9.81);
    const now = performance.now();

    if (linearMag > 15 && now - lastMotionShakeMs >= 180) {
      lastMotionShakeMs = now;
      triggerShake(Math.min(1, linearMag / 26));
    }
  };

  const handleResize = () => {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(480, Math.round(rect.height));
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    rebuildSceneForLayout(w, h);
    requestRedraw();
  };

  const mount = (
    targetCanvas: HTMLCanvasElement,
    initialVolume: ShelfVolume,
    prefs: UserPreferences
  ) => {
    canvas = targetCanvas;
    volume = {
      ...initialVolume,
      books: initialVolume.books.map((b) => ({
        ...b,
        placement: b.placement ? { ...b.placement } : null,
        note: b.note ? { ...b.note } : null,
      })),
    };
    themeId = prefs.theme;
    tuning = { ...prefs.tuning };
    motionShakeEnabled = prefs.motionShakeEnabled;
    if (!tiles) tiles = createPaperNoiseTiles(1337);

    const hasUnplaced = volume.books.some((b) => b.placement === null);
    shelfState = hasUnplaced ? 'OPEN_TIDYING' : 'LOCKED_NEAT';

    targetCanvas.addEventListener('pointerdown', handlePointerDown);
    targetCanvas.addEventListener('pointermove', handlePointerMove);
    targetCanvas.addEventListener('pointerup', handlePointerUpOrCancel);
    targetCanvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    targetCanvas.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('devicemotion', handleDeviceMotion);

    const host = targetCanvas.parentElement ?? targetCanvas;
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(host);

    handleResize();
    refreshDrawOrder();
    emitSnapshot();
  };

  const unmount = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (canvas) {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUpOrCancel);
      canvas.removeEventListener('pointercancel', handlePointerUpOrCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    }
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('devicemotion', handleDeviceMotion);
    isSpillingToDesk = false;
    frameTargetX = 0;
    frameTargetY = 0;
    frameShakeAngle = 0;
    chaosWorld?.dispose();
    chaosWorld = null;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    canvas = null;
  };

  const pause = () => {
    paused = true;
    spaceHeld = false;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const resume = () => {
    if (!paused) return;
    paused = false;
    requestRedraw();
  };

  const loadVolume = (nextVolume: ShelfVolume) => {
    isSpillingToDesk = false;
    frameTargetX = 0;
    frameTargetY = 0;
    frameShakeAngle = 0;
    chaosWorld?.dispose();
    chaosWorld = null;
    activeDrag = null;
    insertionPreview = null;
    hoveredBookId = null;

    volume = {
      ...nextVolume,
      books: nextVolume.books.map((b) => ({
        ...b,
        placement: b.placement ? { ...b.placement } : null,
        note: b.note ? { ...b.note } : null,
      })),
    };
    const hasUnplaced = volume.books.some((b) => b.placement === null);
    shelfState = hasUnplaced ? 'OPEN_TIDYING' : 'LOCKED_NEAT';

    if (layout) {
      rebuildSceneForLayout(layout.viewportW, layout.viewportH);
    }
    refreshDrawOrder();
    emitSnapshot();
    requestRedraw();
  };

  const updateBookNote = (bookId: string, note: RitualNote | null) => {
    if (!volume || !layout || !tiles) return;
    const book = volume.books.find((b) => b.id === bookId);
    if (!book) return;
    book.note = note ? { ...note } : null;

    const refComp = layout.compartments[0];
    const dims = computeBookDimensions(book, refComp);
    bookSprites.set(
      book.id,
      bakeBookSprite(book, dims.widthPx, dims.heightPx, dpr, tuning, tiles.chalkGrainTile)
    );
    emitSnapshot();
    requestRedraw();
  };

  const setTheme = (nextTheme: DeskThemeId) => {
    themeId = nextTheme;
    requestRedraw();
  };

  const setTuning = (nextTuning: VisualTuningParams) => {
    tuning = { ...nextTuning };
    ensureBakedSprites();
    requestRedraw();
  };

  const setAudioEnabled = (_enabled: boolean) => {
    // Phase 2 Web Audio 폴리 엔진 연결 예정
  };

  const setMotionShakeEnabled = (enabled: boolean) => {
    motionShakeEnabled = enabled;
  };

  return {
    mount,
    unmount,
    pause,
    resume,
    loadVolume,
    updateBookNote,
    setTheme,
    setTuning,
    setAudioEnabled,
    setMotionShakeEnabled,
    triggerShake,
    toggleDoor,
  };
}
