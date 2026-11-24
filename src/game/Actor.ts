import Phaser from 'phaser';
import {
  BAKED_ANCHOR,
  BAKED_FRAMES,
  BAKED_SCALE,
  BakedAnim,
  bakedTextureKey,
} from '../assets/baked';

/**
 * 烘焙精灵角色
 *
 * 素材来自「3D 低模 → 离线烘焙 → 8 方向精灵图」管线（tools/bake/），
 * 所以这里只是一张张贴图而已 —— 引擎侧不需要任何 3D 知识。
 *
 * 图集约定：8 行 = 8 个方向（0=N 顺时针），8 列 = 帧。
 * Phaser 的 spritesheet 按行优先编号，所以帧号 = 方向 × 8 + 帧序。
 */
export interface ActorTextures {
  idle: string;
  walk: string;
  run: string;
  death?: string;
}

export class Actor {
  root: Phaser.GameObjects.Container;

  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private tex: ActorTextures;

  /** 当前朝向：0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW */
  private dir = 4;
  private anim: BakedAnim = 'idle';
  private t = 0;
  private dying = false;

  constructor(scene: Phaser.Scene, x: number, y: number, tex: ActorTextures) {
    this.tex = tex;
    this.root = scene.add.container(x, y);

    // 影子先加 → 渲染在精灵下面（尺寸跟着角色缩放走）
    this.shadow = scene.add.ellipse(0, 0, 24 * BAKED_SCALE, 10 * BAKED_SCALE, 0x000000, 0.3);
    this.sprite = scene.add
      .sprite(0, 0, tex.idle, this.dir * BAKED_FRAMES)
      .setOrigin(BAKED_ANCHOR.x, BAKED_ANCHOR.y)
      .setScale(BAKED_SCALE);

    this.root.add([this.shadow, this.sprite]);
  }

  /**
   * 朝向：传入屏幕弧度（0 = 右，π/2 = 下，-π/2 = 上）
   * 屏幕 +y 朝下，所以东=0、南=π/2、西=π、北=-π/2。
   */
  setFacing(angle: number): void {
    const step = Math.round(angle / (Math.PI / 4));
    this.dir = (((step + 2) % 8) + 8) % 8;
  }

  get x(): number {
    return this.root.x;
  }

  get y(): number {
    return this.root.y;
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  /** 播放死亡动画（只播一次） */
  playDeath(): void {
    if (this.dying || !this.tex.death) return;
    this.dying = true;
    this.anim = 'death';
    this.t = 0;
    this.sprite.setTexture(this.tex.death);
  }

  get isDead(): boolean {
    return this.dying;
  }

  /**
   * @param moving       是否在移动
   * @param speedRatio   速度倍率（>1.3 切换到跑步）
   */
  update(dt: number, moving: boolean, speedRatio = 1): void {
    if (this.dying) {
      if (!this.tex.death) return;
      this.t += dt * 8;
      const f = Math.min(BAKED_FRAMES - 1, Math.floor(this.t));
      this.sprite.setFrame(this.dir * BAKED_FRAMES + f);
      return;
    }

    const running = moving && speedRatio > 1.3;
    const next: BakedAnim = moving ? (running ? 'run' : 'walk') : 'idle';
    if (next !== this.anim) {
      this.anim = next;
      this.t = 0;
      this.sprite.setTexture(this.tex[next]);
    }

    const fps = next === 'run' ? 13 : next === 'walk' ? 8 : 4;
    this.t = (this.t + dt * fps) % BAKED_FRAMES;
    this.sprite.setFrame(this.dir * BAKED_FRAMES + Math.floor(this.t));
  }
}

/** 玩家用的纹理组合 */
export function playerTextures(): ActorTextures {
  return {
    idle: bakedTextureKey('idle'),
    walk: bakedTextureKey('walk'),
    run: bakedTextureKey('run'),
    death: bakedTextureKey('death'),
  };
}
