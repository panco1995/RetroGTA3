import Phaser from 'phaser';
import {
  Rect,
  VehicleInput,
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

/**
 * 载具
 *
 * 外观是烘焙出来的多角度精灵（32 方向 = 11.25° 一档）：
 * 车头指向游戏世界角 θ，就取 θ 附近那一帧，精灵本身**不再旋转**。
 * 这样每个角度的光影都是按世界光照烘死的，符合「俯视 2D」的观感
 * （GTA1/2 就是这么做的）。
 *
 * 物理部分没变，还是 src/game/physics.ts 里那套 arcade 车物理。
 */
export class Vehicle {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  state: VehicleState;

  constructor(scene: Phaser.Scene, x: number, y: number, type: CarId = 'sedan') {
    this.container = scene.add.container(x, y);
    // 烘焙车辆（32 方向多角度精灵）
    this.sprite = scene.add.sprite(0, 0, carTextureKey(type), 0);
    // 锚点是车的地面中心，所以车会绕自己的中心转
    this.sprite.setOrigin(CAR_RUNTIME.anchor.x, CAR_RUNTIME.anchor.y);

    this.container.add(this.sprite);
    this.state = createVehicleState(x, y, 0);
    this.applyAngle();
  }

  update(dt: number, input: VehicleInput, colliders: Rect[]): void {
    stepVehicle(this.state, input, dt);
    resolveCollisions(this.state, colliders);
    this.container.setPosition(this.state.x, this.state.y);
    this.applyAngle();
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
