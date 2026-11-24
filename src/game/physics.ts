/**
 * 车辆 arcade 物理 —— 纯函数，不依赖 Phaser，可直接单测
 *
 * 模型：速度矢量分解为「前向 vf」+「侧向 vr」
 *   - 油门/刹车只作用在 vf 上
 *   - 侧向速度按抓地力衰减（grip 高 = 不滑，grip 低 = 漂移）
 *   - 转向权重随速度上升（静止时打方向没意义）
 *   - 手刹把 grip 拉低 → 甩尾
 */
export interface VehicleInput {
  /** -1 刹车/倒车，+1 油门 */
  throttle: number;
  /** -1 左，+1 右 */
  steer: number;
  handbrake: boolean;
}

export interface VehicleState {
  x: number;
  y: number;
  /** 弧度，0 = +X（屏幕右），正方向 = 顺时针 */
  angle: number;
  vx: number;
  vy: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const VEHICLE = {
  maxSpeed: 430,
  maxReverse: 150,
  engine: 390,
  brake: 640,
  reverseFactor: 0.55,
  drag: 0.85,
  /** 侧向抓地衰减系数，越大越不滑 */
  grip: 6.5,
  handbrakeGrip: 0.85,
  /** 转向角速度 rad/s（满舵） */
  steerRate: 2.5,
  /** 达到满转向权重所需的前向速度 */
  steerAuthoritySpeed: 150,
  /** 碰撞半径 */
  radius: 26,
  /** 撞击后速度保留系数 */
  bounceKeep: 0.35,
} as const;

export function createVehicleState(x: number, y: number, angle = 0): VehicleState {
  return { x, y, angle, vx: 0, vy: 0 };
}

/** 推进一帧，就地修改 state */
export function stepVehicle(st: VehicleState, input: VehicleInput, dt: number): void {
  const fx = Math.cos(st.angle);
  const fy = Math.sin(st.angle);
  const rx = -Math.sin(st.angle);
  const ry = Math.cos(st.angle);

  let vf = st.vx * fx + st.vy * fy;
  let vr = st.vx * rx + st.vy * ry;

  if (input.throttle > 0) {
    vf += VEHICLE.engine * input.throttle * dt;
  } else if (input.throttle < 0) {
    // 还在往前 → 刹车；已经停住/在倒 → 倒车
    vf -= (vf > 5 ? VEHICLE.brake : VEHICLE.engine * VEHICLE.reverseFactor) * dt;
  }

  vf -= vf * VEHICLE.drag * dt;
  vf = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, vf));

  const grip = input.handbrake ? VEHICLE.handbrakeGrip : VEHICLE.grip;
  vr -= vr * Math.min(1, grip * dt);

  const authority = Math.min(1, Math.abs(vf) / VEHICLE.steerAuthoritySpeed);
  const dir = vf >= 0 ? 1 : -1;
  st.angle += input.steer * VEHICLE.steerRate * authority * dir * dt;

  st.vx = fx * vf + rx * vr;
  st.vy = fy * vf + ry * vr;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
}

/** 圆 vs 轴对齐矩形：把圆推出矩形，返回是否撞到 */
export function resolveCircle(
  px: number,
  py: number,
  radius: number,
  rects: Rect[],
): { x: number; y: number; hit: boolean } {
  let x = px;
  let y = py;
  let hit = false;
  for (const b of rects) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      const d = Math.sqrt(d2);
      if (d < 0.001) {
        // 圆心已经在矩形内部：沿最小穿透轴弹出去
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) x = b.x - radius;
        else if (min === right) x = b.x + b.w + radius;
        else if (min === top) y = b.y - radius;
        else y = b.y + b.h + radius;
      } else {
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      }
    }
  }
  return { x, y, hit };
}

/** 车辆撞建筑：推出 + 速度衰减 */
export function resolveCollisions(st: VehicleState, rects: Rect[]): boolean {
  const r = resolveCircle(st.x, st.y, VEHICLE.radius, rects);
  if (!r.hit) return false;
  st.x = r.x;
  st.y = r.y;
  st.vx *= VEHICLE.bounceKeep;
  st.vy *= VEHICLE.bounceKeep;
  return true;
}

/** 当前前向速度（供 UI / 音效用） */
export function forwardSpeed(st: VehicleState): number {
  return st.vx * Math.cos(st.angle) + st.vy * Math.sin(st.angle);
}
