/**
 * 小地图
 *
 * 底图在场景创建时画一次（CanvasTexture），之后每帧只更新几个点。
 * 底图和标记都放在 UI 相机上，不参与世界的缩放/后处理。
 */
import Phaser from 'phaser';
import type { District } from '../city/CityGenerator';

const WIDTH = 210;
const MARGIN = 16;

export interface MinimapState {
  player: { x: number; y: number };
  car: { x: number; y: number };
  inCar: boolean;
  traffic: { x: number; y: number }[];
}

export class Minimap {
  readonly container: Phaser.GameObjects.Container;

  private readonly s: number;
  private readonly bx: number;
  private readonly by: number;
  private readonly dots: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, district: District) {
    const b = district.bounds;
    this.bx = b.x;
    this.by = b.y;
    this.s = WIDTH / b.w;
    const h = Math.round(b.h * this.s);

    const key = `minimap-${b.w}x${b.h}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, WIDTH, h);
    if (!tex) throw new Error('无法创建小地图底图');
    const ctx = tex.getContext();

    // 底色（街区地面）
    ctx.fillStyle = '#1b1f24';
    ctx.fillRect(0, 0, WIDTH, h);

    // 马路
    for (const s of district.streets) {
      if (s.edge) continue;
      ctx.fillStyle = s.major ? '#6a7380' : '#59616b';
      if (s.axis === 'v') {
        ctx.fillRect((s.pos - s.half - b.x) * this.s, 0, s.half * 2 * this.s, h);
      } else {
        ctx.fillRect(0, (s.pos - s.half - b.y) * this.s, WIDTH, s.half * 2 * this.s);
      }
    }

    // 建筑
    ctx.fillStyle = '#343a42';
    for (const lot of district.lots) {
      for (const bd of lot.buildings) {
        ctx.fillRect(
          (bd.x - b.x) * this.s,
          (bd.y - b.y) * this.s,
          Math.max(1, bd.w * this.s),
          Math.max(1, bd.d * this.s),
        );
      }
    }
    tex.refresh();

    const image = scene.add.image(WIDTH / 2, h / 2, key);
    const border = scene.add.graphics();
    border.lineStyle(2, 0x8d95a1, 0.65).strokeRect(0, 0, WIDTH, h);
    this.dots = scene.add.graphics();

    this.container = scene.add
      .container(scene.scale.width - WIDTH - MARGIN, MARGIN, [image, border, this.dots])
      .setDepth(1002)
      .setScrollFactor(0);
  }

  update(state: MinimapState): void {
    const g = this.dots;
    g.clear();

    // 车流（灰点）
    g.fillStyle(0xaeb6c2, 0.9);
    for (const t of state.traffic) g.fillCircle(this.mx(t.x), this.my(t.y), 1.5);

    // 玩家车（黄点；开车时玩家绿点会盖在它上面）
    if (!state.inCar) {
      g.fillStyle(0xe9c24a, 1);
      g.fillCircle(this.mx(state.car.x), this.my(state.car.y), 3);
    }

    // 玩家（绿点；开车时跟着车走）
    const p = state.inCar ? state.car : state.player;
    g.fillStyle(0x7edc85, 1);
    g.fillCircle(this.mx(p.x), this.my(p.y), 3.2);
  }

  private mx(x: number): number {
    return (x - this.bx) * this.s;
  }

  private my(y: number): number {
    return (y - this.by) * this.s;
  }
}
