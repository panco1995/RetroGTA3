import Phaser from 'phaser';
import { buildStreet } from '../city/StreetBuilder';
import { isOnRoad, type District } from '../city/CityGenerator';
import { Player } from '../game/Player';
import { Pedestrians } from '../game/Pedestrians';
import type { NpcId } from '../assets/baked';
import { Rect, resolveCircle } from '../game/physics';
import { Vehicle } from '../game/Vehicle';
import { Traffic } from '../game/Traffic';
import { Minimap } from '../ui/Minimap';
import { mountGrade } from '../render/GradePipeline';

const WALK_SPEED = 175;

/** 街上的行人配色（同一个 3D 模型换不同配色，就是不同的人） */
const NPC_IDS: NpcId[] = ['worker', 'punk', 'lady', 'jogger', 'oldman', 'cop'];

export class StreetScene extends Phaser.Scene {
  player!: Player;
  car!: Vehicle;
  pedestrians!: Pedestrians;
  traffic!: Traffic;
  minimap!: Minimap;

  private inCar = false;
  private repairing = false;
  private hintKey = '';
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private colliders: Rect[] = [];
  private district!: District;
  private repairPad = { x: 0, y: 0, w: 0, h: 0 };
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private hintTimer = 0;

  constructor() {
    super('street');
  }

  create(): void {
    const city = buildStreet(this);
    this.colliders = city.colliders;
    this.district = city.district;
    this.repairPad = city.repairPad;

    // 世界特效层：烟等运行时生成的对象放进来，UI 相机创建时会整体忽略它
    const fxLayer = this.add.container(0, 0).setDepth(2);

    this.player = new Player(this, city.spawn.player.x, city.spawn.player.y);
    this.car = new Vehicle(this, city.spawn.car.x, city.spawn.car.y, 'sedan', fxLayer);

    // 街上的行人：落脚点由街区生成器给在人行道上，配色随机分配
    this.pedestrians = new Pedestrians(
      this,
      city.walkers.map((w, i) => ({ id: NPC_IDS[i % NPC_IDS.length], ...w })),
    );

    // 车流：从路网图上的边随机生成，避开玩家出生点
    this.traffic = new Traffic(this, city.district, 14, [city.spawn.player, city.spawn.car]);

    this.cameras.main.setZoom(0.75);
    this.cameras.main.setBounds(city.bounds.x, city.bounds.y, city.bounds.w, city.bounds.h);
    this.cameras.main.startFollow(this.player.root, true, 0.12, 0.12);
    // 色阶 / 描边 / 暗角只处理世界。文字和小地图留在另一台相机上，避免被描边。
    mountGrade(this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SPACE,F') as unknown as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    kb.on('keydown-F', () => this.toggleVehicle());

    // HUD（相机有 0.75 缩放，文字在小地图用的 UI 相机上不缩放）
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

    this.minimap = new Minimap(this, city.district);

    const hud: Phaser.GameObjects.GameObject[] = [
      this.statusText,
      this.hintText,
      this.minimap.container,
    ];
    const world = this.children.list.filter((obj) => !hud.includes(obj));
    this.cameras.main.ignore(hud);
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    ui.transparent = true;
    ui.setScroll(0, 0);
    ui.ignore(world);

    this.exposeDebugApi();
    (window as unknown as { __GAME_READY__: boolean }).__GAME_READY__ = true;
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    if (this.inCar) this.updateDriving(dt);
    else this.updateWalking(dt);

    // 行人看到车会跑；车流沿路网走，并给玩家/玩家车让路
    this.pedestrians.update(
      dt,
      this.inCar ? { x: this.car.x, y: this.car.y, speed: this.car.speed } : undefined,
    );

    const blockers = [{ x: this.car.x, y: this.car.y, speed: Math.abs(this.car.speed) }];
    if (!this.inCar) blockers.push({ x: this.player.x, y: this.player.y, speed: 0 });
    this.traffic.update(dt, blockers);

    // 玩家车 vs 车流：推出去 + 回弹 + 掉血
    if (this.inCar) {
      const impact = this.traffic.collidePlayer(this.car.state);
      if (impact > 0) this.car.takeImpact(impact);
    }

    this.updateRepair(dt);
    this.minimap.update({
      player: { x: this.player.x, y: this.player.y },
      car: { x: this.car.x, y: this.car.y },
      inCar: this.inCar,
      traffic: this.traffic.positions(),
    });

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.updateHint();
    } else {
      this.updateHint();
    }
  }

  /** 靠近车时提示 F；开车时换成驾驶键位 */
  private updateHint(): void {
    let key: string;
    let text: string;
    let color: string;
    if (this.inCar) {
      key = 'drive';
      text = 'W 油门 · S 刹车/倒车 · A/D 转向 · 空格 手刹';
      color = '#dfe4ea';
    } else {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.car.x, this.car.y);
      if (d <= 90) {
        key = 'near';
        text = 'F 上车';
        color = '#e9c24a';
      } else {
        key = 'walk';
        text = 'WASD 移动 · F 上/下车 · 空格 手刹';
        color = '#dfe4ea';
      }
    }
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintText.setText(text).setColor(color);
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
      isOnRoad(this.district, this.car.x, this.car.y, 2) ? 0 : 2.6,
    );
    const spd = Math.abs(this.car.speed);
    const hp = Math.round(this.car.health);
    this.statusText
      .setText(`驾驶  ${Math.round(spd * 0.42)} km/h · 车况 ${hp}%`)
      .setColor(this.car.isWrecked || hp < 35 ? '#d8493e' : '#e9c24a');
  }

  /** 停在 Pay 'n' Spray 上缓慢修车 */
  private updateRepair(dt: number): void {
    const p = this.repairPad;
    const on =
      this.inCar &&
      Math.abs(this.car.x - p.x) < p.w / 2 &&
      Math.abs(this.car.y - p.y) < p.h / 2 &&
      Math.abs(this.car.speed) < 35;

    if (on && this.car.health < 100) {
      this.car.repair(dt);
      this.repairing = true;
      this.statusText.setText(`维修中 ${Math.round(this.car.health)}%`).setColor('#6fc3ff');
    } else if (this.repairing) {
      this.repairing = false;
      this.statusText.setText('驾驶').setColor('#e9c24a');
    }
  }

  private toggleVehicle(): void {
    if (this.inCar) {
      // 从驾驶座一侧下车；如果那边是墙，碰撞解算会把玩家推到墙外
      const a = this.car.state.angle;
      const side = a + Math.PI / 2;
      const r = resolveCircle(
        this.car.x + Math.cos(side) * 50,
        this.car.y + Math.sin(side) * 50,
        16,
        this.colliders,
      );
      this.player.setPosition(r.x, r.y);
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
        health: this.car.health,
        puffs: this.car.smokePuffs,
        traffic: this.traffic.count,
        peds: this.pedestrians.count,
        onPad:
          Math.abs(this.car.x - this.repairPad.x) < this.repairPad.w / 2 &&
          Math.abs(this.car.y - this.repairPad.y) < this.repairPad.h / 2,
      }),
      setHealth: (h: number) => {
        this.car.setHealth(h);
      },
      trafficPositions: () => this.traffic.positions(),
      repairPad: () => ({ ...this.repairPad }),
    };
  }
}
