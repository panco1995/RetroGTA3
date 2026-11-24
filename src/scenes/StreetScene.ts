import Phaser from 'phaser';
import { buildStreet } from '../city/StreetBuilder';
import { Player } from '../game/Player';
import { Pedestrians } from '../game/Pedestrians';
import type { NpcId } from '../assets/baked';
import { Rect, resolveCircle } from '../game/physics';
import { Vehicle } from '../game/Vehicle';

const WALK_SPEED = 175;

/** 人行道上的行人（Phase 1 的行人 AI 还没做，先直线来回走） */
const PEDESTRIAN_SPAWNS = [
  { id: 'worker' as NpcId, x: -320, y: -170, dir: 1 as const, speed: 34 },
  { id: 'punk' as NpcId, x: 180, y: -172, dir: -1 as const, speed: 42 },
  { id: 'lady' as NpcId, x: 620, y: -168, dir: 1 as const, speed: 30 },
  { id: 'jogger' as NpcId, x: -560, y: 172, dir: -1 as const, speed: 46 },
  { id: 'oldman' as NpcId, x: 260, y: 168, dir: 1 as const, speed: 26 },
  { id: 'cop' as NpcId, x: 900, y: 170, dir: -1 as const, speed: 36 },
];

export class StreetScene extends Phaser.Scene {
  player!: Player;
  car!: Vehicle;
  pedestrians!: Pedestrians;

  private inCar = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private colliders: Rect[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private hintTimer = 0;

  constructor() {
    super('street');
  }

  create(): void {
    const city = buildStreet(this);
    this.colliders = city.colliders;

    this.player = new Player(this, city.spawn.player.x, city.spawn.player.y);
    this.car = new Vehicle(this, city.spawn.car.x, city.spawn.car.y);

    // 街上的行人：同一个 3D 模型换不同配色，就是不同的人
    this.pedestrians = new Pedestrians(this, PEDESTRIAN_SPAWNS);

    this.cameras.main.setZoom(0.75);
    this.cameras.main.setBounds(city.bounds.x, city.bounds.y, city.bounds.w, city.bounds.h);
    this.cameras.main.startFollow(this.player.root, true, 0.12, 0.12);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SPACE,F') as unknown as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    kb.on('keydown-F', () => this.toggleVehicle());

    // HUD（相机有 0.5 缩放，字号翻倍才正常）
    this.statusText = this.add
      .text(16, 12, '步行', { fontFamily: 'monospace', fontSize: '26px', color: '#7edc85' })
      .setScrollFactor(0)
      .setDepth(1000);
    this.hintText = this.add
      .text(16, 660, 'WASD 移动 · F 上/下车 · 空格 手刹', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#dfe4ea',
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.exposeDebugApi();
    (window as unknown as { __GAME_READY__: boolean }).__GAME_READY__ = true;
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    if (this.inCar) this.updateDriving(dt);
    else this.updateWalking(dt);
    this.pedestrians.update(dt);

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.hintText.setText('WASD 移动 · F 上/下车 · 空格 手刹').setColor('#dfe4ea');
      }
    }
  }

  private updateWalking(dt: number): void {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.W.isDown) vy -= 1;
    if (k.S.isDown) vy += 1;
    if (k.A.isDown) vx -= 1;
    if (k.D.isDown) vx += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
      let nx = this.player.x + vx * WALK_SPEED * dt;
      let ny = this.player.y + vy * WALK_SPEED * dt;
      // 撞建筑
      const r = resolveCircle(nx, ny, 16, this.colliders);
      nx = r.x;
      ny = r.y;
      this.player.setPosition(nx, ny);
      this.player.setFacing(Math.atan2(vy, vx));
      this.player.update(dt, true, 1);
    } else {
      this.player.update(dt, false, 1);
    }
  }

  private updateDriving(dt: number): void {
    const k = this.keys;
    this.car.update(
      dt,
      {
        throttle: (k.W.isDown ? 1 : 0) + (k.S.isDown ? -1 : 0),
        steer: (k.D.isDown ? 1 : 0) + (k.A.isDown ? -1 : 0),
        handbrake: k.SPACE.isDown,
      },
      this.colliders,
    );
    const spd = Math.abs(this.car.speed);
    this.statusText.setText(`驾驶  ${Math.round(spd * 0.42)} km/h`);
  }

  private toggleVehicle(): void {
    if (this.inCar) {
      const a = this.car.state.angle;
      this.player.setPosition(this.car.x - Math.cos(a) * 52, this.car.y - Math.sin(a) * 52);
      this.player.setVisible(true);
      this.inCar = false;
      this.cameras.main.startFollow(this.player.root, true, 0.12, 0.12);
      this.statusText.setText('步行').setColor('#7edc85');
      return;
    }

    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.car.x, this.car.y);
    if (d > 90) {
      this.hintText.setText('离车太远，走近一点再按 F').setColor('#e9c24a');
      this.hintTimer = 2;
      return;
    }
    this.player.setVisible(false);
    this.inCar = true;
    this.cameras.main.startFollow(this.car.container, true, 0.12, 0.12);
    this.statusText.setText('驾驶').setColor('#e9c24a');
  }

  /** 给截图自检脚本用的调试接口 */
  private exposeDebugApi(): void {
    (window as unknown as Record<string, unknown>).__SHOT__ = {
      teleport: (x: number, y: number) => {
        this.player.setPosition(x, y);
        this.cameras.main.centerOn(x, y);
      },
      enterCar: () => {
        if (!this.inCar) {
          this.player.setPosition(this.car.x, this.car.y);
          this.toggleVehicle();
        }
      },
      placeCar: (x: number, y: number, a: number) => {
        this.car.state.x = x;
        this.car.state.y = y;
        this.car.state.angle = a;
        this.car.state.vx = 0;
        this.car.state.vy = 0;
        this.car.container.setPosition(x, y);
        this.car.container.setRotation(a);
      },
      state: () => ({
        inCar: this.inCar,
        px: this.player.x,
        py: this.player.y,
        cx: this.car.x,
        cy: this.car.y,
        speed: this.car.speed,
      }),
    };
  }
}
