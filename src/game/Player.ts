import Phaser from 'phaser';
import { Actor, playerTextures } from './Actor';

/**
 * 玩家角色
 *
 * 用烘焙出来的 8 方向精灵（Actor）。素材缺失时由 BootScene 拦住并给出提示，
 * 不再退回程序化纸片人 —— 那套方案观感太差且已经废弃。
 */
export class Player {
  root: Phaser.GameObjects.Container;

  private actor: Actor;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.actor = new Actor(scene, x, y, playerTextures());
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
