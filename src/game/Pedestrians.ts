import Phaser from 'phaser';
import { Actor } from './Actor';
import { BakedAnim, NpcId, bakedTextureKey } from '../assets/baked';

/**
 * 街道上的行人
 *
 * 每个行人在自己那一截人行道（路口之间）来回走；车冲过来时会
 * 朝远离车的方向跑一小段。真正的寻路 / 过马路留在后续阶段，
 * 但「路人看到车会跑」已经足够让街面看起来是活的。
 */

export interface PedestrianSpawn {
  id: NpcId;
  x: number;
  y: number;
  /** 沿 X 的行走方向：1 = 向右，-1 = 向左 */
  dir: 1 | -1;
  /** 每秒移动的世界像素 */
  speed: number;
  /** 这一截人行道的范围 */
  minX: number;
  maxX: number;
}

interface Ped {
  actor: Actor;
  dir: 1 | -1;
  baseSpeed: number;
  minX: number;
  maxX: number;
  panic: number;
  /** 走到这一截尽头后停一下，像在等路口 */
  pause: number;
}

export class Pedestrians {
  private list: Ped[] = [];

  constructor(scene: Phaser.Scene, spawns: PedestrianSpawn[]) {
    for (const sp of spawns) {
      const actor = new Actor(scene, sp.x, sp.y, {
        idle: bakedTextureKey('idle', sp.id),
        walk: bakedTextureKey('walk', sp.id),
        run: bakedTextureKey('run', sp.id),
      });
      actor.setFacing(sp.dir === 1 ? 0 : Math.PI);
      this.list.push({
        actor,
        dir: sp.dir,
        baseSpeed: sp.speed,
        minX: sp.minX,
        maxX: sp.maxX,
        panic: 0,
        pause: 0,
      });
    }
  }

  /**
   * @param threat 玩家车的状态；只有车在动的时候行人才会逃
   */
  update(dt: number, threat?: { x: number; y: number; speed: number }): void {
    const danger = threat && Math.abs(threat.speed) > 40 ? threat : undefined;

    for (const p of this.list) {
      if (danger) {
        const dx = p.actor.x - danger.x;
        const dy = p.actor.y - danger.y;
        if (Math.hypot(dx, dy) < 150) {
          p.panic = Math.max(p.panic, 1.3);
          if (Math.abs(dx) > 2) p.dir = dx > 0 ? 1 : -1;
        }
      }

      const running = p.panic > 0;
      if (running) p.panic -= dt;
      if (p.panic > 0) p.pause = 0;

      if (p.pause > 0) {
        p.pause -= dt;
        p.actor.setFacing(p.dir === 1 ? 0 : Math.PI);
        p.actor.update(dt, false, 1);
        continue;
      }

      const speed = p.baseSpeed * (running ? 2.5 : 1);
      p.actor.setPosition(p.actor.x + p.dir * speed * dt, p.actor.y);

      if (p.actor.x > p.maxX) {
        p.actor.setPosition(p.maxX, p.actor.y);
        p.dir = -1;
        p.panic = 0;
        p.pause = 0.6 + Math.random() * 1.4;
      } else if (p.actor.x < p.minX) {
        p.actor.setPosition(p.minX, p.actor.y);
        p.dir = 1;
        p.panic = 0;
        p.pause = 0.6 + Math.random() * 1.4;
      }

      p.actor.setFacing(p.dir === 1 ? 0 : Math.PI);
      p.actor.update(dt, true, speed / p.baseSpeed);
    }
  }

  /** 死亡动画（交通/战斗系统会用到） */
  playDeathAll(): void {
    for (const p of this.list) p.actor.playDeath();
  }

  get count(): number {
    return this.list.length;
  }
}

/** 行人动画类型（导出给外部判断用） */
export type PedAnim = BakedAnim;
