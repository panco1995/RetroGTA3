import Phaser from 'phaser';
import {
  Rect,
  VEHICLE_SPECS,
  VehicleInput,
  VehicleSpec,
  VehicleState,
  createVehicleState,
  forwardSpeed,
  resolveCollisions,
  stepVehicle,
} from './physics';
import { CAR_ANGLE_STEP, CAR_ANGLES, CAR_RUNTIME, CarId, carTextureKey } from '../assets/baked';

/**
 * 造一个「按角度取帧」的车精灵。
 * 停靠的装饰车也用这个（它们不转，但要知道朝哪个角度）。
 */
export function makeCarSprite(
  scene: Phaser.Scene,
  type: CarId,
  x: number,
  y: number,
  angle: number,
): Phaser.GameObjects.Image {
  const key = carTextureKey(type);
  const sp = scene.add.sprite(x, y, key, 0);
  sp.setOrigin(CAR_RUNTIME.anchor.x, CAR_RUNTIME.anchor.y);
  const k = Math.round(angle / CAR_ANGLE_STEP);
  sp.setFrame(((k % CAR_ANGLES) + CAR_ANGLES) % CAR_ANGLES);
  return sp;
}

const SPORTS_CARS: CarId[] = ['sports', 'race', 'racefuture', 'hatchsports'];
const POLICE_CARS: CarId[] = ['police', 'tractorpolice'];
const HEAVY_CARS: CarId[] = [
  'truck',
  'truckflat',
  'van',
  'delivery',
  'deliveryflat',
  'firetruck',
  'garbage',
  'ambulance',
  'tractor',
  'tractorshovel',
];

/** 车型 → 性能档位。数据在 physics.ts，这里只做归类。 */
export function specForCar(type: CarId): VehicleSpec {
  if (SPORTS_CARS.includes(type)) return VEHICLE_SPECS.sports;
  if (POLICE_CARS.includes(type)) return VEHICLE_SPECS.police;
  if (HEAVY_CARS.includes(type)) return VEHICLE_SPECS.heavy;
  return VEHICLE_SPECS.normal;
}

/**
 * 载具
 *
 * 外观是烘焙出来的多角度精灵（32 方向 = 11.25° 一档）：
 * 车头指向游戏世界角 θ，就取 θ 附近那一帧，精灵本身**不再旋转**。
 * 这样每个角度的光影都是按世界光照烘死的，符合「俯视 2D」的观感
 * （GTA1/2 就是这么做的）。
 *
 * 物理部分没变，还是 src/game/physics.ts 里那套 arcade 车物理；
 * 性能档位按车型取（普通 / 跑车 / 警车 / 重车）。
 */
export class Vehicle {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  state: VehicleState;
  readonly type: CarId;
  readonly spec: VehicleSpec;

  /** 0 = 报废，100 = 完好 */
  health = 100;

  /** 冒烟次数（截图自检用） */
  smokePuffs = 0;

  private scene: Phaser.Scene;
  /** 世界特效层（烟等）。放在场景创建时建好的容器里，UI 相机才会忽略它 */
  private fxLayer?: Phaser.GameObjects.Container;
  private smokeT = 0;
  private lastHealth = 100;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: CarId = 'sedan',
    fxLayer?: Phaser.GameObjects.Container,
  ) {
    this.scene = scene;
    this.fxLayer = fxLayer;
    this.type = type;
    this.spec = specForCar(type);

    this.container = scene.add.container(x, y);
    // 烘焙车辆（32 方向多角度精灵）
    this.sprite = scene.add.sprite(0, 0, carTextureKey(type), 0);
    // 锚点是车的地面中心，所以车会绕自己的中心转
    this.sprite.setOrigin(CAR_RUNTIME.anchor.x, CAR_RUNTIME.anchor.y);

    this.container.add(this.sprite);
    this.state = createVehicleState(x, y, 0);
    this.applyAngle();
  }

  update(dt: number, input: VehicleInput, colliders: Rect[], surfaceDrag = 0): void {
    const before = Math.hypot(this.state.vx, this.state.vy);
    // 报废的车还能滑行，但踩油门没反应
    const actual: VehicleInput = this.health <= 0 ? { ...input, throttle: 0 } : input;

    stepVehicle(this.state, actual, dt, this.spec);
    // 路肩/草地：额外的地面阻力
    if (surfaceDrag > 0) {
      const k = Math.max(0, 1 - surfaceDrag * dt);
      this.state.vx *= k;
      this.state.vy *= k;
    }
    const hit = resolveCollisions(this.state, colliders, this.spec);
    if (hit) this.takeImpact(before);

    this.container.setPosition(this.state.x, this.state.y);
    this.applyAngle();
    this.updateDamageFx(dt);
  }

  /** 撞击伤害：速度越快扣得越多，低速剐蹭不扣 */
  takeImpact(impactSpeed: number): void {
    if (impactSpeed < 70) return;
    this.health = Math.max(0, this.health - (impactSpeed - 70) * 0.055);
    this.applyDamageTint();
  }

  /** 调试/截图用：直接设置车况并同步外观 */
  setHealth(h: number): void {
    this.health = Math.max(0, Math.min(100, h));
    this.lastHealth = -1;
    this.applyDamageTint();
  }

  /** 在维修点缓慢回血 */
  repair(dt: number): void {
    this.health = Math.min(100, this.health + 65 * dt);
    this.applyDamageTint();
  }

  get isWrecked(): boolean {
    return this.health <= 0;
  }

  private applyDamageTint(): void {
    if (this.health === this.lastHealth) return;
    this.lastHealth = this.health;
    if (this.health <= 0) this.sprite.setTint(0x6d6d6d);
    else if (this.health < 40) this.sprite.setTint(0xffb0a0);
    else this.sprite.clearTint();
  }

  /** 冒烟：快报废时淡烟，报废后浓烟 */
  private updateDamageFx(dt: number): void {
    if (this.health >= 40) {
      this.smokeT = 0;
      return;
    }
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    this.smokeT = this.health <= 0 ? 0.12 : 0.26;
    this.smokePuffs++;

    // 从车头附近冒出来（精灵原点在车底中心，车体画在上方）
    const fx = Math.cos(this.state.angle) * 22;
    const fy = Math.sin(this.state.angle) * 22;
    const x = this.state.x + fx + (Math.random() - 0.5) * 18;
    const y = this.state.y + fy - 8 + (Math.random() - 0.5) * 10;
    const puff = this.scene.add.circle(
      x,
      y,
      this.health <= 0 ? 12 : 9,
      0xc8ccd2,
      this.health <= 0 ? 0.62 : 0.5,
    );
    if (this.fxLayer) this.fxLayer.add(puff);
    else puff.setDepth(2);
    this.scene.tweens.add({
      targets: puff,
      y: y - 44,
      scale: 2.6,
      alpha: 0,
      duration: this.health <= 0 ? 1100 : 900,
      onComplete: () => puff.destroy(),
    });
  }

  /** 按车头方向取对应角度的帧 */
  private applyAngle(): void {
    const k = Math.round(this.state.angle / CAR_ANGLE_STEP);
    const frame = ((k % CAR_ANGLES) + CAR_ANGLES) % CAR_ANGLES;
    this.sprite.setFrame(frame);
  }

  get speed(): number {
    return forwardSpeed(this.state);
  }

  get x(): number {
    return this.state.x;
  }

  get y(): number {
    return this.state.y;
  }
}
