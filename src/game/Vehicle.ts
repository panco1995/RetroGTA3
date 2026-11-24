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

export class Vehicle {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  /** 驾驶员（俯视时从车窗露出的头和肩） */
  driver: Phaser.GameObjects.Container;
  state: VehicleState;

  constructor(scene: Phaser.Scene, x: number, y: number, frame = 'vehicles/sedan') {
    this.container = scene.add.container(x, y);
    this.sprite = scene.add.image(0, 0, 'proc', frame);

    // 驾驶座在车的左前方（车头朝 +X，左侧是 -Y）
    this.driver = scene.add.container(10, -9);
    this.driver.add(scene.add.image(0, 0, 'proc', 'actors/torso').setScale(0.72).setOrigin(0.5, 0.55));
    this.driver.add(scene.add.image(0, -5, 'proc', 'actors/head').setScale(0.8).setOrigin(0.5, 0.5));

    this.container.add([this.sprite, this.driver]);
    this.state = createVehicleState(x, y, 0);
  }

  setDriverVisible(v: boolean): void {
    this.driver.setVisible(v);
  }

  update(dt: number, input: VehicleInput, colliders: Rect[]): void {
    stepVehicle(this.state, input, dt);
    resolveCollisions(this.state, colliders);
    this.container.setPosition(this.state.x, this.state.y);
    this.container.setRotation(this.state.angle);
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
