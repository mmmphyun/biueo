import Matter from 'matter-js';
import {
  computeMaxTipAngleRad,
  computeTippedBookTransform,
  type Rect,
} from '../layout/shelfLayout';
import { mulberry32 } from '../../../shared/canvas/gouachePath';

export interface ChaosBodySpawnPose {
  readonly bookId: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly angleRad: number;
  readonly compartmentIndex?: number;
  readonly compartmentRect?: Rect;
  readonly fallenDir?: -1 | 1;
}

export interface ChaosBodyPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly depthZ?: number;
}

export type ChaosWorldMode = 'closed_shelf' | 'desk_spill' | 'desk_drop';

interface SeatedShelfBook {
  pose: ChaosBodySpawnPose;
  readonly aspectRatio: number;
  readonly mu: number;
  depthZ: number;
  tipProgress: number;
  rattleAngleOffset: number;
  state: 'upright' | 'tipped';
  tipDir: -1 | 1;
  tipAngleAbs: number;
  targetTipAngleAbs: number;
}

const WALL_THICKNESS = 140;
const FIXED_STEP_MS = 1000 / 120;
const MAX_SUBSTEPS_PER_FRAME = 4;
const MAX_BODY_SPEED = 28;
const MAX_ANGULAR_SPEED = 0.35;
const MAX_RELEASE_PER_FRAME = 4;
const G_REF = 14000;
const MAX_TIPPED_PER_COMPARTMENT = 2;
const TIPPED_EJECT_DEPTH_Z = 1.32;
const DESK_MARGIN_X = 18;
const DESK_TOP_Y = 24;
const DESK_BOTTOM_SAFE_PAD = 86;
const CASCADE_STAGE_MS = 380;
const CLEAR_FORCE_END_MS = 620;
const SETTLE_RAMP_END_MS = 1600;
const MAX_SPILL_MS = 2400;
const MAX_DROP_MS = 2400;

function clampValue(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function computeDeskSafeBounds(viewportW: number, viewportH: number): Rect {
  return {
    x: DESK_MARGIN_X,
    y: DESK_TOP_Y,
    w: Math.max(200, viewportW - DESK_MARGIN_X * 2),
    h: Math.max(240, viewportH - DESK_TOP_Y - DESK_BOTTOM_SAFE_PAD),
  };
}

export class ChaosWorld {
  private readonly engine: Matter.Engine;
  private bounds: Rect;
  private mode: ChaosWorldMode = 'closed_shelf';
  private spillElapsedMs = 0;
  private dropElapsedMs = 0;
  private spillIsDesktop = true;
  private shelfClearRect: Rect | null = null;
  private readonly bodiesById = new Map<string, Matter.Body>();
  private readonly seatedById = new Map<string, SeatedShelfBook>();
  private readonly bookMetaByBodyId = new Map<
    number,
    { readonly bookId: string; readonly minHalfExtent: number }
  >();
  private walls: Matter.Body[] = [];
  private accumulatorMs = 0;
  private impulseCounter = 0;
  private rattlePhase = 0;
  private onCollision?: (impactSpeed: number) => void;
  private readonly handleCollisionStart = (
    event: Matter.IEventCollision<Matter.Engine>
  ) => {
    if (!this.onCollision) return;
    for (const pair of event.pairs) {
      const dvx = pair.bodyA.velocity.x - pair.bodyB.velocity.x;
      const dvy = pair.bodyA.velocity.y - pair.bodyB.velocity.y;
      const impact = Math.hypot(dvx, dvy);
      if (impact > 1.2) {
        this.onCollision(impact);
      }
    }
  };

  constructor(initialInnerRect: Rect, onCollision?: (impactSpeed: number) => void) {
    this.bounds = initialInnerRect;
    this.onCollision = onCollision;
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.35, scale: 0.001 },
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
    });

    this.rebuildWalls(initialInnerRect);

    Matter.Events.on(this.engine, 'collisionStart', this.handleCollisionStart);
  }

  private rebuildWalls(rect: Rect): void {
    if (this.walls.length > 0) {
      Matter.Composite.remove(this.engine.world, this.walls);
    }
    const wallOpts: Matter.IChamferableBodyDefinition = {
      isStatic: true,
      restitution: 0.25,
      friction: 0.6,
      label: 'shelf-wall',
    };
    const halfW = WALL_THICKNESS * 0.5;
    const spanW = rect.w + WALL_THICKNESS * 2;
    const spanH = rect.h + WALL_THICKNESS * 2;

    this.walls = [
      Matter.Bodies.rectangle(rect.x + rect.w * 0.5, rect.y - halfW, spanW, WALL_THICKNESS, wallOpts),
      Matter.Bodies.rectangle(
        rect.x + rect.w * 0.5,
        rect.y + rect.h + halfW,
        spanW,
        WALL_THICKNESS,
        wallOpts
      ),
      Matter.Bodies.rectangle(rect.x - halfW, rect.y + rect.h * 0.5, WALL_THICKNESS, spanH, wallOpts),
      Matter.Bodies.rectangle(
        rect.x + rect.w + halfW,
        rect.y + rect.h * 0.5,
        WALL_THICKNESS,
        spanH,
        wallOpts
      ),
    ];
    Matter.Composite.add(this.engine.world, this.walls);
  }

  updateBounds(nextInnerRect: Rect, nextClearRect?: Rect): void {
    const prev = this.bounds;
    this.bounds = nextInnerRect;
    if (nextClearRect) {
      this.shelfClearRect = nextClearRect;
    }
    this.rebuildWalls(nextInnerRect);

    if (prev.w <= 0 || prev.h <= 0) return;
    const scaleX = nextInnerRect.w / prev.w;
    const scaleY = nextInnerRect.h / prev.h;
    for (const body of this.bodiesById.values()) {
      const nx = nextInnerRect.x + (body.position.x - prev.x) * scaleX;
      const ny = nextInnerRect.y + (body.position.y - prev.y) * scaleY;
      Matter.Body.setPosition(body, { x: nx, y: ny });
      this.clampBodyInsideBounds(body);
    }
    for (const entry of this.seatedById.values()) {
      const scaledComp = entry.pose.compartmentRect
        ? {
            x: nextInnerRect.x + (entry.pose.compartmentRect.x - prev.x) * scaleX,
            y: nextInnerRect.y + (entry.pose.compartmentRect.y - prev.y) * scaleY,
            w: entry.pose.compartmentRect.w * scaleX,
            h: entry.pose.compartmentRect.h * scaleY,
          }
        : undefined;
      entry.pose = {
        ...entry.pose,
        centerX: nextInnerRect.x + (entry.pose.centerX - prev.x) * scaleX,
        centerY: nextInnerRect.y + (entry.pose.centerY - prev.y) * scaleY,
        widthPx: entry.pose.widthPx * scaleX,
        heightPx: entry.pose.heightPx * scaleY,
        compartmentRect: scaledComp,
      };
    }
  }

  private createClosedBody(pose: ChaosBodySpawnPose): Matter.Body {
    const body = Matter.Bodies.rectangle(
      pose.centerX,
      pose.centerY,
      Math.max(8, pose.widthPx),
      Math.max(16, pose.heightPx),
      {
        restitution: 0.24,
        friction: 0.36,
        frictionStatic: 0.45,
        frictionAir: 0.016,
        density: 0.0022,
        chamfer: { radius: 2 },
      }
    );
    Matter.Body.setAngle(body, pose.angleRad);
    this.bodiesById.set(pose.bookId, body);
    this.bookMetaByBodyId.set(body.id, {
      bookId: pose.bookId,
      minHalfExtent: Math.min(pose.widthPx, pose.heightPx) * 0.45,
    });
    this.clampBodyInsideBounds(body);
    return body;
  }

  private spawnActiveClosedBody(
    pose: ChaosBodySpawnPose,
    vx = 0,
    vy = 0,
    angularVelocity = 0
  ): Matter.Body {
    const body = this.createClosedBody(pose);
    Matter.Composite.add(this.engine.world, body);
    Matter.Sleeping.set(body, false);

    const speed = Math.hypot(vx, vy);
    const scale = speed > MAX_BODY_SPEED ? MAX_BODY_SPEED / speed : 1;
    Matter.Body.setVelocity(body, {
      x: vx * scale,
      y: vy * scale,
    });
    Matter.Body.setAngularVelocity(
      body,
      Math.max(-MAX_ANGULAR_SPEED, Math.min(MAX_ANGULAR_SPEED, angularVelocity))
    );
    return body;
  }

  /**
   * 2.5D 깊이 변수(depthZ)와 종횡비 기반 전도-미끄러짐 경쟁 후보로 책들을 등록한다.
   */
  spawnSeatedPoses(poses: readonly ChaosBodySpawnPose[], sessionSeed = 1): void {
    this.clearBodies();
    this.mode = 'closed_shelf';
    this.spillElapsedMs = 0;
    this.dropElapsedMs = 0;
    this.shelfClearRect = null;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 1.35;
    this.rattlePhase = 0;

    const rand = mulberry32(3191 + poses.length * 41 + Math.floor(sessionSeed) * 137);

    for (const pose of poses) {
      const aspectRatio = pose.widthPx / Math.max(1, pose.heightPx);
      const gripRand = rand();
      const mu = 0.16 + gripRand * 0.28;
      const depthZ = 0.05 + (1 - gripRand) * 0.36 + rand() * 0.15;
      const isAlreadyTipped = pose.fallenDir === -1 || pose.fallenDir === 1;
      const initialAngleAbs = isAlreadyTipped ? Math.abs(pose.angleRad) : 0;

      this.seatedById.set(pose.bookId, {
        pose: { ...pose },
        aspectRatio,
        mu,
        depthZ,
        tipProgress: isAlreadyTipped ? 1 : 0,
        rattleAngleOffset: 0,
        state: isAlreadyTipped ? 'tipped' : 'upright',
        tipDir: isAlreadyTipped ? pose.fallenDir! : 1,
        tipAngleAbs: initialAngleAbs,
        targetTipAngleAbs: initialAngleAbs,
      });
    }
  }

  private getUprightRectForEntry(entry: SeatedShelfBook): Rect {
    return {
      x: entry.pose.centerX - entry.pose.widthPx * 0.5,
      y: entry.pose.centerY - entry.pose.heightPx * 0.5,
      w: entry.pose.widthPx,
      h: entry.pose.heightPx,
    };
  }

  private resolveSpawnPoseForEntry(_bookId: string, entry: SeatedShelfBook): ChaosBodySpawnPose {
    if (entry.state !== 'tipped') {
      return entry.pose;
    }
    const tf = computeTippedBookTransform(
      this.getUprightRectForEntry(entry),
      entry.tipDir,
      entry.tipAngleAbs
    );
    return {
      ...entry.pose,
      centerX: tf.centerX,
      centerY: tf.centerY,
      angleRad: tf.angleRad,
    };
  }

  private resolveTipOption(
    bookId: string,
    entry: SeatedShelfBook,
    preferredDir: -1 | 1
  ): { readonly dir: -1 | 1; readonly targetAngleAbs: number } | null {
    const compRect = entry.pose.compartmentRect;
    const compIdx = entry.pose.compartmentIndex;
    if (!compRect || compIdx === undefined) return null;

    let tippedCountInComp = 0;
    const siblings: { id: string; entry: SeatedShelfBook; rect: Rect }[] = [];
    for (const [sibId, sibEntry] of this.seatedById) {
      if (sibEntry.pose.compartmentIndex !== compIdx) continue;
      if (sibEntry.state === 'tipped') tippedCountInComp += 1;
      siblings.push({
        id: sibId,
        entry: sibEntry,
        rect: this.getUprightRectForEntry(sibEntry),
      });
    }
    if (tippedCountInComp >= MAX_TIPPED_PER_COMPARTMENT) return null;

    const myRect = this.getUprightRectForEntry(entry);
    const dirs: readonly (-1 | 1)[] = [preferredDir, (preferredDir === 1 ? -1 : 1) as -1 | 1];

    for (const dir of dirs) {
      let stopWallX = dir === 1 ? compRect.x + compRect.w : compRect.x;
      let nearestSameDirTipped: { dist: number; targetAngleAbs: number; edgeX: number } | null =
        null;

      for (const sib of siblings) {
        if (sib.id === bookId) continue;
        if (dir === 1) {
          if (sib.rect.x < myRect.x + myRect.w - 1) continue;
          const dist = sib.rect.x - (myRect.x + myRect.w);
          if (sib.entry.state === 'upright') {
            stopWallX = Math.min(stopWallX, sib.rect.x);
          } else if (sib.entry.tipDir === -1) {
            stopWallX = Math.min(stopWallX, (myRect.x + myRect.w + sib.rect.x) * 0.5);
          } else if (!nearestSameDirTipped || dist < nearestSameDirTipped.dist) {
            nearestSameDirTipped = {
              dist,
              targetAngleAbs: sib.entry.targetTipAngleAbs,
              edgeX: sib.rect.x,
            };
          }
        } else {
          const sibRight = sib.rect.x + sib.rect.w;
          if (sibRight > myRect.x + 1) continue;
          const dist = myRect.x - sibRight;
          if (sib.entry.state === 'upright') {
            stopWallX = Math.max(stopWallX, sibRight);
          } else if (sib.entry.tipDir === 1) {
            stopWallX = Math.max(stopWallX, (sibRight + myRect.x) * 0.5);
          } else if (!nearestSameDirTipped || dist < nearestSameDirTipped.dist) {
            nearestSameDirTipped = {
              dist,
              targetAngleAbs: sib.entry.targetTipAngleAbs,
              edgeX: sibRight,
            };
          }
        }
      }

      let dominoCap = Number.POSITIVE_INFINITY;
      if (nearestSameDirTipped) {
        if (nearestSameDirTipped.targetAngleAbs < 0.28) {
          stopWallX =
            dir === 1
              ? Math.min(stopWallX, nearestSameDirTipped.edgeX)
              : Math.max(stopWallX, nearestSameDirTipped.edgeX);
        } else {
          dominoCap = Math.max(0.18, nearestSameDirTipped.targetAngleAbs - 0.12);
        }
      }

      const wallAngle = computeMaxTipAngleRad(myRect, dir, stopWallX);
      const finalAngle = Math.min(wallAngle, dominoCap);
      if (finalAngle >= 0.18) {
        return { dir, targetAngleAbs: finalAngle };
      }
    }

    return null;
  }

  /**
   * 책장 프레임 관성력(-a)·기울기 중력을 주입하고 2.5D 전도-미끄러짐 경쟁으로 쓰러짐과 이탈을 가른다.
   */
  applyFrameShakeMotion(
    accelX: number,
    accelY: number,
    velX: number,
    velY: number,
    tiltRad: number,
    dtSec: number
  ): number {
    if (this.mode !== 'closed_shelf') return 0;
    const dt = Math.min(0.05, Math.max(0.001, dtSec));

    this.engine.gravity.x = 1.35 * Math.sin(tiltRad) * 1.45;
    this.engine.gravity.y = 1.35 * Math.cos(tiltRad);

    const clampedAx = clampValue(accelX, -18000, 18000);
    const clampedAy = clampValue(accelY, -18000, 18000);
    const accelMag = Math.hypot(clampedAx, clampedAy);
    const shouldWake = accelMag > 650 || Math.abs(tiltRad) > 0.03;

    for (const body of this.bodiesById.values()) {
      if (shouldWake) {
        Matter.Sleeping.set(body, false);
      }
      if (accelMag > 300) {
        Matter.Body.applyForce(body, body.position, {
          x: -clampedAx * 0.0000011 * body.mass,
          y: -clampedAy * 0.00000095 * body.mass,
        });
      }
    }

    if (this.seatedById.size === 0) return 0;

    const velMag = Math.hypot(velX, velY);
    const shakeEnergy =
      Math.max(0, accelMag - 900) / 13500 +
      Math.max(0, velMag - 260) / 2100 +
      Math.max(0, Math.abs(tiltRad) - 0.04) * 1.5;

    this.rattlePhase += dt * 42;
    if (shakeEnergy <= 0) {
      const decay = Math.max(0, 1 - dt * 12);
      for (const entry of this.seatedById.values()) {
        entry.rattleAngleOffset *= decay;
      }
      return 0;
    }

    const boundsTop = this.bounds.y;
    const boundsH = Math.max(1, this.bounds.h);
    const boundsCx = this.bounds.x + this.bounds.w * 0.5;
    const halfW = Math.max(1, this.bounds.w * 0.5);
    const inertialDirX = clampedAx !== 0 ? -Math.sign(clampedAx) : 0;
    const tiltDirX = Math.abs(tiltRad) > 0.02 ? Math.sign(tiltRad) : 0;
    const normalRatio = clampValue(1 + clampedAy / G_REF, 0.25, 1.55);
    const vibG =
      Math.hypot(clampedAx * 0.72, clampedAy * 1.15) / G_REF +
      Math.max(0, velMag - 260) / 3400 +
      Math.max(0, Math.abs(tiltRad) - 0.04) * 1.15;
    const tipDrive =
      Math.abs(clampedAx) / G_REF +
      Math.abs(tiltRad) * 1.85 +
      Math.max(0, Math.abs(velX) - 260) / 3600;

    const candidates: { bookId: string; excess: number; entry: SeatedShelfBook }[] = [];

    for (const [bookId, entry] of this.seatedById) {
      const relX = (entry.pose.centerX - boundsCx) / halfW;
      const relY = clampValue((entry.pose.centerY - boundsTop) / boundsH, 0, 1);
      let dirBonus = 0;
      if (inertialDirX !== 0 && Math.sign(relX) === inertialDirX) {
        dirBonus += Math.abs(relX) * 0.9;
      }
      if (clampedAy < -1100) {
        dirBonus += 0.65;
      }

      const relYBonus = 1 + (1 - relY) * 0.25;
      const slipThreshold = entry.mu * normalRatio * (entry.state === 'tipped' ? 1.55 : 1.0);
      if (vibG > slipThreshold) {
        entry.depthZ += (vibG - slipThreshold) * dt * 4.9 * relYBonus * (1 + dirBonus * 0.4);
      }

      if (entry.state === 'upright' && entry.pose.compartmentRect) {
        const tipThreshold = entry.aspectRatio * 1.45;
        if (tipDrive > tipThreshold) {
          const preferredTipDir: -1 | 1 =
            inertialDirX !== 0
              ? (inertialDirX as -1 | 1)
              : tiltDirX !== 0
                ? (tiltDirX as -1 | 1)
                : entry.pose.centerX > boundsCx
                  ? -1
                  : 1;
          const option = this.resolveTipOption(bookId, entry, preferredTipDir);
          if (option) {
            entry.tipProgress += (tipDrive - tipThreshold) * dt * 13.5;
            if (entry.tipProgress >= 1.0 && entry.depthZ < 1.0) {
              entry.state = 'tipped';
              entry.tipDir = option.dir;
              entry.targetTipAngleAbs = option.targetAngleAbs;
              entry.tipAngleAbs = Math.abs(entry.rattleAngleOffset);
            }
          } else {
            entry.tipProgress = Math.min(
              0.85,
              entry.tipProgress + (tipDrive - tipThreshold) * dt * 5.0
            );
          }
        }
      }

      if (entry.state === 'upright') {
        const visualLoad = Math.min(1, Math.max(entry.depthZ, entry.tipProgress));
        entry.rattleAngleOffset =
          Math.sin(this.rattlePhase + entry.pose.centerX * 0.07) * visualLoad * 0.085;
      }

      const ejectLimit = entry.state === 'tipped' ? TIPPED_EJECT_DEPTH_Z : 1.0;
      if (entry.depthZ >= ejectLimit) {
        candidates.push({
          bookId,
          excess: entry.depthZ - ejectLimit,
          entry,
        });
      }
    }

    if (candidates.length === 0) return 0;

    candidates.sort((a, b) => b.excess - a.excess);
    const releaseCount = Math.min(MAX_RELEASE_PER_FRAME, candidates.length);
    this.impulseCounter += 1;
    const rand = mulberry32(5521 + this.impulseCounter * 83);

    for (let i = 0; i < releaseCount; i += 1) {
      const { bookId, entry } = candidates[i];
      const spawnPose = this.resolveSpawnPoseForEntry(bookId, entry);
      this.seatedById.delete(bookId);
      const releaseVx = clampValue(
        -clampedAx * 0.00045 - velX * 0.0022 + (rand() - 0.5) * 2.2,
        -10,
        10
      );
      const releaseVy = clampValue(
        -clampedAy * 0.00035 + 1.5 + rand() * 2.0,
        -5,
        10
      );
      const spinSign = inertialDirX !== 0 ? inertialDirX : rand() < 0.5 ? -1 : 1;
      const releaseAng = clampValue(spinSign * (0.04 + rand() * 0.08), -0.25, 0.25);
      this.spawnActiveClosedBody(spawnPose, releaseVx, releaseVy, releaseAng);
    }

    return releaseCount;
  }

  /**
   * 버튼 또는 스페이스바 흔들기 시 2.5D 전도-미끄러짐 경쟁 버스트를 여러 마이크로 스텝으로 주입한다.
   */
  applyButtonShakeBurst(vx: number, vy: number): void {
    const stepDt = 1 / 60;
    const baseAx = -vx * 1150;
    const baseAy = vy * 380;
    const frameVx = vx * 85;
    const frameVy = vy * 40;
    const baseTilt = (vx === 0 ? 1 : Math.sign(vx)) * 0.09;

    for (let i = 0; i < 16; i += 1) {
      const microSign = i >= 8 ? -0.92 : 1;
      this.applyFrameShakeMotion(
        baseAx * microSign,
        baseAy,
        frameVx * microSign,
        frameVy,
        baseTilt * microSign,
        stepDt
      );
    }

    this.applyShakeImpulse(vx, vy);
  }

  getSeatedCount(): number {
    return this.seatedById.size;
  }

  getTippedCount(): number {
    let count = 0;
    for (const entry of this.seatedById.values()) {
      if (entry.state === 'tipped') count += 1;
    }
    return count;
  }

  getTippedDirections(): Map<string, -1 | 1> {
    const out = new Map<string, -1 | 1>();
    for (const [bookId, entry] of this.seatedById) {
      if (entry.state === 'tipped') {
        out.set(bookId, entry.tipDir);
      }
    }
    return out;
  }

  getDislodgedCount(): number {
    return this.bodiesById.size;
  }

  getSeatedPoses(): Map<string, ChaosBodyPose> {
    const out = new Map<string, ChaosBodyPose>();
    for (const [bookId, entry] of this.seatedById) {
      if (entry.state === 'tipped') {
        const tf = computeTippedBookTransform(
          this.getUprightRectForEntry(entry),
          entry.tipDir,
          entry.tipAngleAbs
        );
        out.set(bookId, {
          x: tf.centerX,
          y: tf.centerY,
          angle: tf.angleRad,
          depthZ: clampValue(entry.depthZ * 0.5, 0, 0.5),
        });
      } else {
        out.set(bookId, {
          x: entry.pose.centerX,
          y: entry.pose.centerY,
          angle: entry.pose.angleRad + entry.rattleAngleOffset,
          depthZ: clampValue(entry.depthZ, 0, 1),
        });
      }
    }
    return out;
  }

  private clearBodies(): void {
    if (this.bodiesById.size > 0) {
      Matter.Composite.remove(this.engine.world, Array.from(this.bodiesById.values()));
    }
    this.bodiesById.clear();
    this.seatedById.clear();
    this.bookMetaByBodyId.clear();
  }

  private clampBodyInsideBounds(body: Matter.Body): void {
    const meta = this.bookMetaByBodyId.get(body.id);
    const pad = meta ? meta.minHalfExtent : 6;
    const minX = this.bounds.x + pad;
    const maxX = Math.max(minX, this.bounds.x + this.bounds.w - pad);
    const minY = this.bounds.y + pad;
    const maxY = Math.max(minY, this.bounds.y + this.bounds.h - pad);

    const cx = Math.min(maxX, Math.max(minX, body.position.x));
    const cy = Math.min(maxY, Math.max(minY, body.position.y));
    if (cx !== body.position.x || cy !== body.position.y) {
      Matter.Body.setPosition(body, { x: cx, y: cy });
    }
  }

  applyShakeImpulse(vx: number, vy: number): void {
    this.impulseCounter += 1;
    const rand = mulberry32(7109 + this.impulseCounter * 131);
    const clampedVx = Math.max(-18, Math.min(18, vx));
    const clampedVy = Math.max(-18, Math.min(18, vy));

    for (const body of this.bodiesById.values()) {
      Matter.Sleeping.set(body, false);
      const jitterVx = (rand() - 0.5) * 6.5;
      const jitterVy = (rand() - 0.5) * 5.2 - 2.4;
      const nextVx = body.velocity.x * 0.45 + clampedVx + jitterVx;
      const nextVy = body.velocity.y * 0.45 + clampedVy + jitterVy;
      const speed = Math.hypot(nextVx, nextVy);
      const scale = speed > MAX_BODY_SPEED ? MAX_BODY_SPEED / speed : 1;

      Matter.Body.setVelocity(body, {
        x: nextVx * scale,
        y: nextVy * scale,
      });
      Matter.Body.setAngularVelocity(
        body,
        Math.max(
          -MAX_ANGULAR_SPEED,
          Math.min(MAX_ANGULAR_SPEED, body.angularVelocity * 0.4 + (rand() - 0.5) * 0.24)
        )
      );
    }
  }

  /**
   * 유리문이 열리는 순간 경계를 주변 데스크 여백 전체로 넓히고 2단계 쏟아짐 파동을 시작한다.
   */
  openDoorAndSpill(
    viewportW: number,
    viewportH: number,
    frameRect: Rect,
    isDesktop: boolean
  ): void {
    this.mode = 'desk_spill';
    this.seatedById.clear();
    this.spillElapsedMs = 0;
    this.spillIsDesktop = isDesktop;
    this.shelfClearRect = frameRect;
    this.accumulatorMs = 0;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 1.42;

    const deskBounds = computeDeskSafeBounds(viewportW, viewportH);
    // openDoorAndSpill 전환 직후에는 좌표 스케일링 없이 현재 위치에서 그대로 쏟아지도록 벽만 재구축한다.
    this.bounds = deskBounds;
    this.rebuildWalls(deskBounds);

    this.impulseCounter += 1;
    const rand = mulberry32(4219 + this.impulseCounter * 97);
    const frameCx = frameRect.x + frameRect.w * 0.5;
    const halfW = Math.max(1, frameRect.w * 0.5);
    const shelfH = Math.max(1, frameRect.h);

    for (const body of this.bodiesById.values()) {
      Matter.Sleeping.set(body, false);
      body.frictionAir = 0.014;
      body.friction = 0.3;
      body.restitution = 0.22;

      const relX = (body.position.x - frameCx) / halfW;
      const relY = Math.max(0, Math.min(1, (body.position.y - frameRect.y) / shelfH));

      let burstVx: number;
      let burstVy: number;
      if (isDesktop) {
        const sideDir = Math.abs(relX) < 0.16 ? (rand() < 0.5 ? -1 : 1) : Math.sign(relX);
        const outwardMag = (4.6 + Math.abs(relX) * 5.6 + (1 - relY) * 2.8) * (0.8 + rand() * 0.5);
        burstVx = sideDir * outwardMag + (rand() - 0.5) * 2.2;
        burstVy = 2.1 + (1 - relY) * 2.0 + rand() * 3.0;
      } else {
        burstVx = (rand() - 0.5) * 3.6 - relX * 1.4;
        burstVy = 4.6 + (1 - relY) * 3.8 + rand() * 3.2;
      }

      const nextVx = body.velocity.x * 0.55 + burstVx;
      const nextVy = body.velocity.y * 0.55 + burstVy;
      const speed = Math.hypot(nextVx, nextVy);
      const scale = speed > MAX_BODY_SPEED ? MAX_BODY_SPEED / speed : 1;

      Matter.Body.setVelocity(body, {
        x: nextVx * scale,
        y: nextVy * scale,
      });
      Matter.Body.setAngularVelocity(
        body,
        Math.max(
          -MAX_ANGULAR_SPEED,
          Math.min(MAX_ANGULAR_SPEED, body.angularVelocity * 0.5 + (rand() - 0.5) * 0.24)
        )
      );
      this.clampBodyInsideBounds(body);
    }
  }

  removeBody(bookId: string): boolean {
    const body = this.bodiesById.get(bookId);
    if (!body) return false;
    Matter.Composite.remove(this.engine.world, body);
    this.bodiesById.delete(bookId);
    this.bookMetaByBodyId.delete(body.id);
    return true;
  }

  hasBody(bookId: string): boolean {
    return this.bodiesById.has(bookId);
  }

  getRemainingCount(): number {
    return this.bodiesById.size;
  }

  private updateSpillPhysicsParams(): void {
    const t = this.spillElapsedMs;
    let airDrag = 0.014;
    let contactFriction = 0.3;

    if (t <= CASCADE_STAGE_MS) {
      this.engine.gravity.y = 1.42;
    } else {
      const u = Math.min(1, (t - CASCADE_STAGE_MS) / (SETTLE_RAMP_END_MS - CASCADE_STAGE_MS));
      const ease = u * u * (3 - 2 * u);
      this.engine.gravity.y = 1.42 + (0.04 - 1.42) * ease;
      airDrag = 0.014 + (0.115 - 0.014) * ease;
      contactFriction = 0.3 + (0.58 - 0.3) * ease;
    }

    const r = this.shelfClearRect;
    const clearActive = t < CLEAR_FORCE_END_MS && r !== null;
    const clearFade = clearActive ? 1 - t / CLEAR_FORCE_END_MS : 0;
    const hasWideBottomSpace =
      r !== null && this.bounds.y + this.bounds.h - (r.y + r.h) > 120;

    for (const body of this.bodiesById.values()) {
      body.frictionAir = airDrag;
      body.friction = contactFriction;

      if (clearActive && r) {
        const insideShelfFace =
          body.position.x >= r.x - 8 &&
          body.position.x <= r.x + r.w + 8 &&
          body.position.y >= r.y - 8 &&
          body.position.y <= r.y + r.h + 8;

        if (insideShelfFace) {
          Matter.Sleeping.set(body, false);
          let dirX: number;
          let dirY: number;
          if (this.spillIsDesktop) {
            const relY = (body.position.y - r.y) / Math.max(1, r.h);
            const dxCenter = body.position.x - (r.x + r.w * 0.5);
            if (relY > 0.72 && hasWideBottomSpace) {
              dirX = (dxCenter >= 0 ? 1 : -1) * 0.45;
              dirY = 1.0;
            } else {
              dirX = dxCenter >= 0 ? 1.0 : -1.0;
              dirY = 0.28;
            }
          } else {
            const dxCenter = body.position.x - (r.x + r.w * 0.5);
            dirX = dxCenter >= 0 ? 0.15 : -0.15;
            dirY = 1.2;
          }

          const strength = 0.0022 * clearFade * body.mass;
          Matter.Body.applyForce(body, body.position, {
            x: dirX * strength,
            y: dirY * strength,
          });
        }
      }
    }
  }

  /**
   * 이미 놓여 있는 책 더미를 수면 강체로 등록해 드롭된 책과의 자연스러운 충돌 받침대로 사용한다.
   */
  enterDeskDropMode(
    viewportW: number,
    viewportH: number,
    restingPoses: readonly ChaosBodySpawnPose[]
  ): void {
    this.clearBodies();
    this.mode = 'desk_drop';
    this.dropElapsedMs = 0;
    this.shelfClearRect = null;
    this.accumulatorMs = 0;
    this.engine.gravity.y = 1.35;

    const deskBounds = computeDeskSafeBounds(viewportW, viewportH);
    this.bounds = deskBounds;
    this.rebuildWalls(deskBounds);

    const created: Matter.Body[] = [];
    for (const pose of restingPoses) {
      const widthPx = Math.max(8, pose.widthPx);
      const heightPx = Math.max(16, pose.heightPx);
      const body = Matter.Bodies.rectangle(pose.centerX, pose.centerY, widthPx, heightPx, {
        restitution: 0.2,
        friction: 0.48,
        frictionStatic: 0.6,
        frictionAir: 0.022,
        density: 0.0022,
        chamfer: { radius: 2 },
      });
      Matter.Body.setAngle(body, pose.angleRad);
      this.bodiesById.set(pose.bookId, body);
      this.bookMetaByBodyId.set(body.id, {
        bookId: pose.bookId,
        minHalfExtent: Math.min(widthPx, heightPx) * 0.45,
      });
      this.clampBodyInsideBounds(body);
      created.push(body);
    }

    if (created.length > 0) {
      Matter.Composite.add(this.engine.world, created);
      for (const body of created) {
        Matter.Sleeping.set(body, true);
      }
    }
  }

  /**
   * 드래그 중 허공에서 놓은 책 1권을 중력 낙하 강체로 투입한다.
   */
  addDroppedBody(
    pose: ChaosBodySpawnPose,
    vx = 0,
    vy = 0,
    angularVelocity?: number
  ): void {
    this.removeBody(pose.bookId);

    if (this.mode === 'desk_spill' && this.spillElapsedMs > CASCADE_STAGE_MS) {
      this.mode = 'desk_drop';
      this.dropElapsedMs = 0;
      this.shelfClearRect = null;
      this.engine.gravity.y = 1.35;
    } else if (this.mode === 'desk_drop') {
      this.dropElapsedMs = 0;
    }

    const widthPx = Math.max(8, pose.widthPx);
    const heightPx = Math.max(16, pose.heightPx);
    const body = Matter.Bodies.rectangle(pose.centerX, pose.centerY, widthPx, heightPx, {
      restitution: 0.22,
      friction: 0.44,
      frictionStatic: 0.55,
      frictionAir: 0.018,
      density: 0.0022,
      chamfer: { radius: 2 },
    });
    Matter.Body.setAngle(body, pose.angleRad);
    this.bodiesById.set(pose.bookId, body);
    this.bookMetaByBodyId.set(body.id, {
      bookId: pose.bookId,
      minHalfExtent: Math.min(widthPx, heightPx) * 0.45,
    });
    this.clampBodyInsideBounds(body);
    Matter.Composite.add(this.engine.world, body);
    Matter.Sleeping.set(body, false);

    const clampedVx = Math.max(-11, Math.min(11, vx));
    const clampedVy = Math.max(-7, Math.min(14, vy));
    const speed = Math.hypot(clampedVx, clampedVy);
    const scale = speed > MAX_BODY_SPEED ? MAX_BODY_SPEED / speed : 1;

    Matter.Body.setVelocity(body, {
      x: clampedVx * scale,
      y: clampedVy * scale,
    });

    let targetAngular = angularVelocity;
    if (targetAngular === undefined) {
      this.impulseCounter += 1;
      const rand = mulberry32(9137 + this.impulseCounter * 67);
      const sign = Math.abs(clampedVx) > 0.4 ? Math.sign(clampedVx) : rand() < 0.5 ? -1 : 1;
      targetAngular = clampedVx * 0.012 + sign * (0.035 + rand() * 0.05);
    }

    Matter.Body.setAngularVelocity(
      body,
      Math.max(-MAX_ANGULAR_SPEED, Math.min(MAX_ANGULAR_SPEED, targetAngular))
    );
  }

  private updateDropPhysicsParams(): void {
    this.engine.gravity.y = 1.35;
    let airDrag = 0.018;
    let contactFriction = 0.44;
    if (this.dropElapsedMs > 900) {
      const u = Math.min(1, (this.dropElapsedMs - 900) / 1000);
      const ease = u * u * (3 - 2 * u);
      airDrag = 0.018 + (0.095 - 0.018) * ease;
      contactFriction = 0.44 + (0.62 - 0.44) * ease;
    }

    for (const body of this.bodiesById.values()) {
      body.frictionAir = airDrag;
      body.friction = contactFriction;
    }
  }

  step(dtMs: number): void {
    const clampedDtMs = Math.min(Math.max(0, dtMs), 50);
    if (this.mode === 'closed_shelf' && this.seatedById.size > 0) {
      const tipLerp = Math.min(1, clampedDtMs * 0.001 * 11);
      for (const entry of this.seatedById.values()) {
        if (entry.state !== 'tipped') continue;
        const diff = entry.targetTipAngleAbs - entry.tipAngleAbs;
        if (Math.abs(diff) < 0.004) {
          entry.tipAngleAbs = entry.targetTipAngleAbs;
        } else {
          entry.tipAngleAbs += diff * tipLerp;
        }
      }
    }

    this.accumulatorMs += clampedDtMs;
    let substeps = 0;

    while (this.accumulatorMs >= FIXED_STEP_MS && substeps < MAX_SUBSTEPS_PER_FRAME) {
      if (this.mode === 'desk_spill') {
        this.spillElapsedMs += FIXED_STEP_MS;
        this.updateSpillPhysicsParams();
      } else if (this.mode === 'desk_drop') {
        this.dropElapsedMs += FIXED_STEP_MS;
        this.updateDropPhysicsParams();
      }
      Matter.Engine.update(this.engine, FIXED_STEP_MS);
      for (const body of this.bodiesById.values()) {
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed > MAX_BODY_SPEED) {
          const factor = MAX_BODY_SPEED / speed;
          Matter.Body.setVelocity(body, {
            x: body.velocity.x * factor,
            y: body.velocity.y * factor,
          });
        }
        if (Math.abs(body.angularVelocity) > MAX_ANGULAR_SPEED) {
          Matter.Body.setAngularVelocity(
            body,
            Math.sign(body.angularVelocity) * MAX_ANGULAR_SPEED
          );
        }
        this.clampBodyInsideBounds(body);
      }
      this.accumulatorMs -= FIXED_STEP_MS;
      substeps += 1;
    }
  }

  getBodyPoses(): Map<string, ChaosBodyPose> {
    const out = new Map<string, ChaosBodyPose>();
    for (const [bookId, body] of this.bodiesById) {
      out.set(bookId, {
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
      });
    }
    return out;
  }

  isAllSleeping(): boolean {
    if (this.mode === 'closed_shelf') {
      for (const entry of this.seatedById.values()) {
        if (
          entry.state === 'tipped' &&
          Math.abs(entry.targetTipAngleAbs - entry.tipAngleAbs) > 0.005
        ) {
          return false;
        }
      }
    }
    for (const body of this.bodiesById.values()) {
      if (body.isSleeping) continue;
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 0.16 || Math.abs(body.angularVelocity) > 0.015) {
        return false;
      }
    }
    return true;
  }

  isSpillSettled(): boolean {
    if (this.bodiesById.size === 0) return true;
    if (this.mode === 'desk_spill') {
      if (this.spillElapsedMs < 650) return false;
      if (this.spillElapsedMs >= MAX_SPILL_MS) {
        for (const body of this.bodiesById.values()) {
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(body, 0);
          Matter.Sleeping.set(body, true);
        }
        return true;
      }
    } else if (this.mode === 'desk_drop') {
      if (this.dropElapsedMs < 240) return false;
      if (this.dropElapsedMs >= MAX_DROP_MS) {
        for (const body of this.bodiesById.values()) {
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(body, 0);
          Matter.Sleeping.set(body, true);
        }
        return true;
      }
    } else {
      return false;
    }

    for (const body of this.bodiesById.values()) {
      if (body.isSleeping) continue;
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 0.14 || Math.abs(body.angularVelocity) > 0.015) {
        return false;
      }
    }
    return true;
  }

  fastForwardSpill(steps = 120): void {
    const totalIterations = Math.max(1, steps);
    const frameDtMs = FIXED_STEP_MS * 3;
    for (let i = 0; i < totalIterations; i += 1) {
      this.step(frameDtMs);
      if (this.isSpillSettled()) break;
    }
  }

  dispose(): void {
    this.clearBodies();
    Matter.Events.off(this.engine, 'collisionStart', this.handleCollisionStart);
    Matter.World.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
  }
}
