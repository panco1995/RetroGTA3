import Phaser from 'phaser';
import { Actor, playerTextures } from './Actor';
import { CutoutActor } from './CutoutActor';

/**
 * 玩家角色
 *
 * 优先用烘焙精灵（Actor）；如果烘焙素材没生成（没跑过 `npm run bake`），
 * 就退回程序化纸片人（CutoutActor），保证游戏永远能跑起来。
 */
export class Player {
  root: Phaser.GameObjects.Container;

  private actor: Actor | CutoutActor;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const useBaked = scene.textures.exists('baked_walk');
    this.actor = useBaked
      ? new Actor(scene, x, y, playerTextures())
      : new CutoutActor(scene, x, y);
    if (!useBaked) {
      console.warn('[RetroGTA3] 没找到烘焙角色素材，先跑 `npm run bake`；暂用纸片人。');
    }
    this.root = this.actor.root;
  }

  get x(): number {
    return this.actor.x;
  }

  get y(): number {
    return this.actor.y;
  }

  setPosition(x: number, y: number): void {
    this.actor.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.actor.setVisible(v);
  }

  setFacing(angle: number): void {
    this.actor.setFacing(angle);
  }

  playDeath(): void {
    this.actor.playDeath();
  }

  get isDead(): boolean {
    return this.actor.isDead;
  }

  update(dt: number, moving: boolean, speedRatio = 1): void {
    this.actor.update(dt, moving, speedRatio);
  }
}
