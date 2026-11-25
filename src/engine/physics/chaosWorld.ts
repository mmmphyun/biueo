import Matter from 'matter-js';
import type { Rect } from '../layout/shelfLayout';
import { mulberry32 } from '../textures/gouachePath';

export interface ChaosBodySpawnPose {
  readonly bookId: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly angleRad: number;
}

export interface ChaosBodyPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export type ChaosWorldMode = 'closed_shelf' | 'desk_spill' | 'desk_drop';

interface SeatedShelfBook {
  pose: ChaosBodySpawnPose;
  readonly gripThreshold: number;
  fatigue: number;
  rattleAngleOffset: number;
}

const WALL_THICKNESS = 140;
const FIXED_STEP_MS = 1000 / 120;
const MAX_SUBSTEPS_PER_FRAME = 4;
const MAX_BODY_SPEED = 28;
const MAX_ANGULAR_SPEED = 0.35;
const MAX_RELEASE_PER_FRAME = 4;
const DESK_MARGIN_X = 18;
const DESK_TOP_Y = 24;
const DESK_BOTTOM_SAFE_PAD = 86;
const CASCADE_STAGE_MS = 380;
const CLEAR_FORCE_END_MS = 620;
const SETTLE_RAMP_END_MS = 1600;
const MAX_SPILL_MS = 2400;
const MAX_DROP_MS = 2400;

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
      entry.pose = {
        ...entry.pose,
        centerX: nextInnerRect.x + (entry.pose.centerX - prev.x) * scaleX,
        centerY: nextInnerRect.y + (entry.pose.centerY - prev.y) * scaleY,
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

  spawnFromPoses(poses: readonly ChaosBodySpawnPose[]): void {
    this.clearBodies();
    this.mode = 'closed_shelf';
    this.spillElapsedMs = 0;
    this.dropElapsedMs = 0;
    this.shelfClearRect = null;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 1.35;
    const created: Matter.Body[] = [];

    for (const pose of poses) {
      created.push(this.createClosedBody(pose));
    }

    if (created.length > 0) {
      Matter.Composite.add(this.engine.world, created);
    }
  }

  /**
   * 직접 잡기 흔들기 시작 시 전권을 고정 슬롯 후보로 등록해 흔들림 세기에 맞춰 순차 이탈시킨다.
   */
  spawnSeatedPoses(poses: readonly ChaosBodySpawnPose[]): void {
    this.clearBodies();
    this.mode = 'closed_shelf';
    this.spillElapsedMs = 0;
    this.dropElapsedMs = 0;
    this.shelfClearRect = null;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 1.35;
    this.rattlePhase = 0;

    const boundsTop = this.bounds.y;
    const boundsH = Math.max(1, this.bounds.h);
    const rand = mulberry32(3191 + poses.length * 41);

    for (const pose of poses) {
      const relY = Math.max(0, Math.min(1, (pose.centerY - boundsTop) / boundsH));
      const gripThreshold = 0.28 + rand() * 0.64 + relY * 0.14;
      this.seatedById.set(pose.bookId, {
        pose: { ...pose },
        gripThreshold,
        fatigue: 0,
        rattleAngleOffset: 0,
      });
    }
  }

  releaseAllSeatedBodies(): void {
    if (this.seatedById.size === 0) return;
    for (const entry of this.seatedById.values()) {
      this.spawnActiveClosedBody(entry.pose);
    }
    this.seatedById.clear();
  }

  /**
   * 책장 프레임 가속도 반대 관성력(-a)과 기울기 중력을 반영하고 고정 책들을 순차적으로 풀어낸다.
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

    const clampedAx = Math.max(-18000, Math.min(18000, accelX));
    const clampedAy = Math.max(-18000, Math.min(18000, accelY));
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

    const boundsCx = this.bounds.x + this.bounds.w * 0.5;
    const halfW = Math.max(1, this.bounds.w * 0.5);
    const inertialDirX = clampedAx !== 0 ? -Math.sign(clampedAx) : 0;
    const candidates: { bookId: string; excess: number; entry: SeatedShelfBook }[] = [];

    for (const [bookId, entry] of this.seatedById) {
      const relX = (entry.pose.centerX - boundsCx) / halfW;
      let dirBonus = 0;
      if (inertialDirX !== 0 && Math.sign(relX) === inertialDirX) {
        dirBonus += Math.abs(relX) * 0.9;
      }
      if (clampedAy < -1100) {
        dirBonus += 0.65;
      }

      entry.fatigue += shakeEnergy * dt * (2.8 + dirBonus);
      const progress = Math.min(1, entry.fatigue / entry.gripThreshold);
      entry.rattleAngleOffset =
        Math.sin(this.rattlePhase + entry.pose.centerX * 0.07) * progress * 0.085;

      if (entry.fatigue >= entry.gripThreshold) {
        candidates.push({
          bookId,
          excess: entry.fatigue - entry.gripThreshold,
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
      this.seatedById.delete(bookId);
      const releaseVx = Math.max(
        -10,
        Math.min(10, -clampedAx * 0.00045 - velX * 0.0022 + (rand() - 0.5) * 2.2)
      );
      const releaseVy = Math.max(
        -5,
        Math.min(10, -clampedAy * 0.00035 + 1.5 + rand() * 2.0)
      );
      const spinSign = inertialDirX !== 0 ? inertialDirX : rand() < 0.5 ? -1 : 1;
      const releaseAng = Math.max(
        -0.25,
        Math.min(0.25, spinSign * (0.04 + rand() * 0.08))
      );
      this.spawnActiveClosedBody(entry.pose, releaseVx, releaseVy, releaseAng);
    }

    return releaseCount;
  }

  getSeatedCount(): number {
    return this.seatedById.size;
  }

  getDislodgedCount(): number {
    return this.bodiesById.size;
  }

  getSeatedPoses(): Map<string, ChaosBodyPose> {
    const out = new Map<string, ChaosBodyPose>();
    for (const [bookId, entry] of this.seatedById) {
      out.set(bookId, {
        x: entry.pose.centerX,
        y: entry.pose.centerY,
        angle: entry.pose.angleRad + entry.rattleAngleOffset,
      });
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
    this.accumulatorMs += Math.min(Math.max(0, dtMs), 50);
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
