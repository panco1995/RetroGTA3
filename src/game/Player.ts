import Phaser from 'phaser';
import { POSE_IDLE, POSE_RUN, POSE_WALK, Pose } from '../anim/poses';

/**
 * 纸片人角色（cutout rig）
 *
 * 角色不是一张图，而是几个部件拼成的骨架：
 *   腿(后) → 躯干 → 手臂 → 头
 * 动画 = 按关键帧数字旋转/平移各部件。
 *
 * 8 方向 = 整个骨架绕 Y 轴转（因为素材是俯视画的，旋转不会露馅）。
 */
export class Player {
  root: Phaser.GameObjects.Container;

  private torsoPivot: Phaser.GameObjects.Container;
  private armL: Phaser.GameObjects.Container;
  private armR: Phaser.GameObjects.Container;
  private legL: Phaser.GameObjects.Container;
  private legR: Phaser.GameObjects.Container;

  private poses: Pose[] = POSE_IDLE;
  private framePos = 0;
  private frameDur = 1 / 4;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.root = scene.add.container(x, y);

    // 腿：挂在髋部（躯干中心稍下方），从上方看只露出鞋
    this.legL = scene.add.container(-7, 12);
    this.legL.add(scene.add.image(0, 0, 'proc', 'actors/leg').setOrigin(0.5, 0.12));
    this.legR = scene.add.container(7, 12);
    this.legR.add(scene.add.image(0, 0, 'proc', 'actors/leg').setOrigin(0.5, 0.12));

    // 躯干：手臂和头挂在它下面，前倾时一起动
    this.torsoPivot = scene.add.container(0, 0);
    this.torsoPivot.add(scene.add.image(0, 0, 'proc', 'actors/torso').setOrigin(0.5, 0.5));

    this.armL = scene.add.container(-21, -5);
    this.armL.add(scene.add.image(0, 0, 'proc', 'actors/arm').setOrigin(0.5, 0.12));
    this.armR = scene.add.container(21, -5);
    this.armR.add(scene.add.image(0, 0, 'proc', 'actors/arm').setOrigin(0.5, 0.12));
    this.torsoPivot.add([this.armL, this.armR]);

    this.torsoPivot.add(scene.add.image(0, -3, 'proc', 'actors/head').setOrigin(0.5, 0.5));

    this.root.add([this.legL, this.legR, this.torsoPivot]);
  }

  /** 朝向：传入标准弧度（0 = 右，-π/2 = 上） */
  setFacing(angle: number): void {
    // 素材默认朝 -Y（画面上方），所以要转 angle + 90°
    this.root.rotation = angle + Math.PI / 2;
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

  /**
   * @param moving  是否在移动
   * @param speedRatio 速度倍率（>1.3 切换到跑步姿势）
   */
  update(dt: number, moving: boolean, speedRatio = 1): void {
    const running = moving && speedRatio > 1.3;
    const next = moving ? (running ? POSE_RUN : POSE_WALK) : POSE_IDLE;
    if (next !== this.poses) {
      this.poses = next;
      this.framePos = 0;
    }

    const fps = moving ? (running ? 13 : 8) : 4;
    this.frameDur = 1 / fps;
    this.framePos = (this.framePos + dt / this.frameDur) % this.poses.length;

    const i = Math.floor(this.framePos);
    const f = this.framePos - i;
    const a = this.poses[i];
    const b = this.poses[(i + 1) % this.poses.length];

    const lerp = (u: number, v: number) => u + (v - u) * f;
    this.armL.rotation = lerp(a.armL, b.armL);
    this.armR.rotation = lerp(a.armR, b.armR);
    this.legL.rotation = lerp(a.legL, b.legL);
    this.legR.rotation = lerp(a.legR, b.legR);
    this.torsoPivot.y = lerp(a.bob, b.bob);
    this.torsoPivot.rotation = lerp(a.lean, b.lean);
  }
}
