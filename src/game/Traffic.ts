/**
 * 交通 AI —— 车流沿路网行驶
 *
 * 每辆车是路网图上的一条边：从 prev 路口开往 node 路口，到路口后
 * 按「直行优先、右转其次」选下一条边。车道靠右，所以迎面车流在
 * 另一条车道上，不会互相穿模。
 *
 * 车辆外观复用烘焙的 32 方向精灵；这里只维护位置 / 朝向 / 速度，
 * 不跑玩家那套完整物理（车流要的是稳定，不是手感）。
 */
import Phaser from 'phaser';
import { CAR_ANGLE_STEP, CAR_ANGLES, type CarId } from '../assets/baked';
import type { District } from '../city/CityGenerator';
import { mulberry32 } from '../core/rng';
import { makeCarSprite, specForCar } from './Vehicle';
import type { VehicleState } from './physics';
import {
  buildRoadGraph,
  chooseNext,
  dirBetween,
  lanePoint,
  type RoadGraph,
} from './roadGraph';

/** 车流里出现的车型（重复 = 权重） */
const TRAFFIC_POOL: CarId[] = [
  'sedan',
  'sedan',
  'sedan',
  'taxi',
  'taxi',
  'van',
  'delivery',
  'sports',
  'suv',
  'truck',
  'police',
];

interface TrafficCar {
  prev: number;
  node: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  cruise: number;
  accel: number;
  type: CarId;
  sprite: Phaser.GameObjects.Image;
}

export interface TrafficBlocker {
  x: number;
  y: number;
  speed: number;
}

const CAR_DEPTH = -20;
const REACH = 30;

export class Traffic {
  private graph: RoadGraph;
  private cars: TrafficCar[] = [];
  private rng: () => number;

  constructor(
    scene: Phaser.Scene,
    district: District,
    count = 14,
    avoid: { x: number; y: number }[] = [],
  ) {
    this.graph = buildRoadGraph(district);
    this.rng = mulberry32(district.spawn.car.x * 31 + district.spawn.car.y * 17 + 0x51ed270b);

    for (let i = 0; i < count; i++) {
      const car = this.spawnCar(scene, avoid);
      if (car) this.cars.push(car);
    }
  }

  private spawnCar(scene: Phaser.Scene, avoid: { x: number; y: number }[]): TrafficCar | null {
    const nodes = this.graph.nodes;
    for (let attempt = 0; attempt < 60; attempt++) {
      const prev = Math.floor(this.rng() * nodes.length);
      const n = nodes[prev];
      if (!n.neighbors.length) continue;
      const node = n.neighbors[Math.floor(this.rng() * n.neighbors.length)];
      const dir = dirBetween(n, nodes[node]);

      // 沿这条边随机取一点，避免所有车都挤在路口
      const t = 0.15 + this.rng() * 0.7;
      const a = lanePoint(n, dir, this.graph);
      const b = lanePoint(nodes[node], dir, this.graph);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;

      if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 320)) continue;

      const type = TRAFFIC_POOL[Math.floor(this.rng() * TRAFFIC_POOL.length)];
      const spec = specForCar(type);
      const cruise = spec.maxSpeed * (0.34 + this.rng() * 0.08);

      const sprite = makeCarSprite(scene, type, x, y, Math.atan2(dir.y, dir.x)).setDepth(CAR_DEPTH);
      return {
        prev,
        node,
        x,
        y,
        angle: Math.atan2(dir.y, dir.x),
        speed: cruise * 0.7,
        cruise,
        accel: spec.engine * 0.32,
        type,
        sprite,
      };
    }
    return null;
  }

  update(dt: number, blockers: TrafficBlocker[] = []): void {
    const nodes = this.graph.nodes;

    for (const c of this.cars) {
      // 1. 目标：下一个路口的车道点
      let dir = dirBetween(nodes[c.prev], nodes[c.node]);
      let target = lanePoint(nodes[c.node], dir, this.graph);
      let dx = target.x - c.x;
      let dy = target.y - c.y;

      if (Math.hypot(dx, dy) < REACH) {
        const next = chooseNext(this.rng, this.graph, c.prev, c.node);
        if (next === c.prev) {
          // 死路：掉头
          const tmp = c.prev;
          c.prev = c.node;
          c.node = tmp;
        } else {
          c.prev = c.node;
          c.node = next;
        }
        dir = dirBetween(nodes[c.prev], nodes[c.node]);
        target = lanePoint(nodes[c.node], dir, this.graph);
        dx = target.x - c.x;
        dy = target.y - c.y;
      }

      // 2. 转向：朝目标点打方向，转弯半径由角速度限制
      const desired = Math.atan2(dy, dx);
      const diff = wrapAngle(desired - c.angle);
      const turnRate = 2.1 + Math.min(1, c.speed / 220) * 0.7;
      c.angle += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));

      // 3. 速度：转弯减速 + 跟车 / 避让行人玩家
      let want = c.cruise;
      if (Math.abs(diff) > 0.4) want = Math.min(want, 95);

      const fx = Math.cos(c.angle);
      const fy = Math.sin(c.angle);
      for (const b of this.obstaclesFor(c, blockers)) {
        const ox = b.x - c.x;
        const oy = b.y - c.y;
        const ahead = ox * fx + oy * fy;
        const side = Math.abs(-ox * fy + oy * fx);
        if (ahead > 8 && ahead < 105 && side < 42) {
          const follow = b.speed * 0.9;
          if (ahead < 48) want = Math.min(want, 0);
          else want = Math.min(want, Math.max(follow, (ahead - 48) * 1.2));
        }
      }

      const accel = want > c.speed ? c.accel : c.accel * 2.4;
      c.speed += Math.max(-accel * dt, Math.min(accel * dt, want - c.speed));

      // 4. 推进 + 取帧
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      c.sprite.setPosition(c.x, c.y);
      const k = Math.round(c.angle / CAR_ANGLE_STEP);
      c.sprite.setFrame(((k % CAR_ANGLES) + CAR_ANGLES) % CAR_ANGLES);
    }
  }

  /** 别的车 + 外部障碍（玩家、玩家车） */
  private obstaclesFor(c: TrafficCar, blockers: TrafficBlocker[]): TrafficBlocker[] {
    const out: TrafficBlocker[] = blockers.slice();
    for (const o of this.cars) {
      if (o !== c) out.push({ x: o.x, y: o.y, speed: o.speed });
    }
    return out;
  }

  /**
   * 玩家车 vs 车流：把玩家推出去并回弹。
   * 返回撞击时的法向速度（给 Vehicle.takeImpact 用）。
   */
  collidePlayer(st: VehicleState): number {
    for (const c of this.cars) {
      const dx = st.x - c.x;
      const dy = st.y - c.y;
      const d = Math.hypot(dx, dy);
      const min = 54;
      if (d >= min || d < 0.01) continue;

      const nx = dx / d;
      const ny = dy / d;
      st.x = c.x + nx * min;
      st.y = c.y + ny * min;

      const vn = st.vx * nx + st.vy * ny;
      if (vn < 0) {
        st.vx -= 1.5 * vn * nx;
        st.vy -= 1.5 * vn * ny;
      }
      st.vx *= 0.55;
      st.vy *= 0.55;
      c.speed *= 0.3;
      return Math.abs(vn);
    }
    return 0;
  }

  get count(): number {
    return this.cars.length;
  }

  positions(): { x: number; y: number }[] {
    return this.cars.map((c) => ({ x: c.x, y: c.y }));
  }
}

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}
