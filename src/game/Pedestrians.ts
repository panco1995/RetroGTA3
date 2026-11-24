import Phaser from 'phaser';
import { Actor } from './Actor';
import { BakedAnim, NpcId, bakedTextureKey } from '../assets/baked';

/**
 * 街道上的行人（Phase 1 的雏形）
 *
 * 现在只是「沿人行道来回走」的直线运动 —— 真正的行人 AI
 *（避开障碍、路口等待、逃跑）留在 Phase 1。
 * 但素材管线（一个 3D 模型 + 换色表 → 一堆不同的 NPC）在这里已经跑通了。
 */

export interface PedestrianSpawn {
  id: NpcId;
  x: number;
  y: number;
  /** 沿 X 的行走方向：1 = 向右，-1 = 向左 */
  dir: 1 | -1;
  /** 每秒移动的世界像素 */
  speed: number;
}

export class Pedestrians {
  private list: { actor: Actor; dir: 1 | -1; speed: number; min: number; max: number }[] = [];

  constructor(scene: Phaser.Scene, spawns: PedestrianSpawn[]) {
    for (const sp of spawns) {
      const actor = new Actor(scene, sp.x, sp.y, {
        idle: bakedTextureKey('idle', sp.id),
        walk: bakedTextureKey('walk', sp.id),
        run: bakedTextureKey('walk', sp.id),
      });
      actor.setFacing(sp.dir === 1 ? 0 : Math.PI);
      this.list.push({
        actor,
        dir: sp.dir,
        speed: sp.speed,
        min: sp.x - 320,
        max: sp.x + 320,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.actor.setPosition(p.actor.x + p.dir * p.speed * dt, p.actor.y);
      if (p.actor.x > p.max) {
        p.dir = -1;
        p.actor.setFacing(Math.PI);
      } else if (p.actor.x < p.min) {
        p.dir = 1;
        p.actor.setFacing(0);
      }
      p.actor.update(dt, true, 1);
    }
  }

  /** 死亡动画（Phase 1 的交通/行人 AI 会用到） */
  playDeathAll(): void {
    for (const p of this.list) p.actor.playDeath();
  }
}

/** 行人动画类型（导出给外部判断用） */
export type PedAnim = BakedAnim;
