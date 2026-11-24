import Phaser from 'phaser';
import { mulberry32 } from '../core/rng';
import { Rect } from '../game/physics';
import { makeCarSprite } from '../game/Vehicle';
import type { CarId } from '../assets/baked';

export interface City {
  colliders: Rect[];
  bounds: { x: number; y: number; w: number; h: number };
  spawn: { player: { x: number; y: number }; car: { x: number; y: number } };
}

const WORLD = { left: -1700, right: 1700, top: -1000, bottom: 1000 };
const ROAD_TOP = -135;
const ROAD_BOTTOM = 135;
const WALK_TOP = -200;
const WALK_BOTTOM = 200;
const BUILDING_DEPTH = 340;
const WALL_H = 96;

/** 建筑地块：[x, 宽, 屋顶变体] */
const BLOCKS_TOP: [number, number, number][] = [
  [-1450, 380, 0],
  [-980, 300, 1],
  [-600, 340, 2],
  [-180, 260, 0],
  [160, 320, 1],
  [560, 300, 2],
  [940, 420, 0],
  [1440, 240, 1],
];
const BLOCKS_BOTTOM: [number, number, number][] = [
  [-1500, 300, 1],
  [-1120, 260, 2],
  [-780, 360, 0],
  [-340, 300, 1],
  [40, 280, 2],
  [400, 340, 0],
  [820, 280, 1],
  [1180, 400, 2],
];

/**
 * 搭一条演示用的街：路面 + 人行道 + 建筑 + 街具 + 停靠的车
 *
 * 布局是写死的（不是随机生成），这样截图自检每次都是同一个画面，
 * 改坏了能一眼看出来。
 */
export function buildStreet(scene: Phaser.Scene): City {
  const midX = (WORLD.left + WORLD.right) / 2;
  const midY = (WORLD.top + WORLD.bottom) / 2;
  const worldW = WORLD.right - WORLD.left;
  const worldH = WORLD.bottom - WORLD.top;

  // 草地底
  scene.add
    .tileSprite(midX, midY, worldW, worldH, 'proc', 'tiles/grass_1')
    .setDepth(-100);

  // 建筑带底色（后院/后巷），避免楼与楼之间露出草地
  const backDepth = BUILDING_DEPTH + 380;
  scene.add
    .tileSprite(midX, WALK_TOP - backDepth / 2 - 15, worldW, backDepth + 30, 'proc', 'tiles/asphalt_2')
    .setDepth(-96);
  scene.add
    .tileSprite(midX, WALK_BOTTOM + backDepth / 2 + 15, worldW, backDepth + 30, 'proc', 'tiles/asphalt_2')
    .setDepth(-96);

  // 路面
  scene.add
    .tileSprite(midX, 0, worldW, ROAD_BOTTOM - ROAD_TOP, 'proc', 'tiles/asphalt_1')
    .setDepth(-90);

  // 人行道
  scene.add
    .tileSprite(midX, (WALK_TOP + ROAD_TOP) / 2, worldW, ROAD_TOP - WALK_TOP, 'proc', 'tiles/sidewalk_0')
    .setDepth(-88);
  scene.add
    .tileSprite(midX, (WALK_BOTTOM + ROAD_BOTTOM) / 2, worldW, WALK_BOTTOM - ROAD_BOTTOM, 'proc', 'tiles/sidewalk_0')
    .setDepth(-88);

  // 路缘石 + 路面标线
  const g = scene.add.graphics().setDepth(-85);
  g.fillStyle(0x9a9384, 1);
  g.fillRect(WORLD.left, ROAD_TOP - 10, worldW, 10);
  g.fillRect(WORLD.left, ROAD_BOTTOM, worldW, 10);
  g.fillStyle(0xd9c24a, 0.85);
  for (let x = WORLD.left; x < WORLD.right; x += 160) g.fillRect(x, -4, 80, 8);
  g.fillStyle(0xe6e2d8, 0.55);
  for (const side of [1, -1]) {
    for (let x = WORLD.left + 40; x < WORLD.right; x += 320) {
      g.fillRect(x, side * (ROAD_BOTTOM - 18) - 4, 140, 8);
    }
  }

  const colliders: Rect[] = [];
  const rng = mulberry32(20241124);

  /**
   * 一栋楼：屋顶（平铺底纹）+ 朝街面的外墙（平铺）+ 屋顶设备贴花
   * top=true 表示在街道北侧，外墙朝下（面向街道）
   */
  const addBlock = (x: number, w: number, variant: number, top: boolean) => {
    const depth = BUILDING_DEPTH;
    const y0 = top ? WALK_TOP - depth : WALK_BOTTOM;
    const roofY0 = top ? y0 : y0 + WALL_H;
    const roofH = depth - WALL_H;
    const wallY0 = top ? y0 + roofH : y0;

    // 楼体投影
    scene.add
      .rectangle(x + w / 2, roofY0 + roofH / 2 + 16, w, roofH, 0x101318, 0.45)
      .setDepth(-60);

    // 外墙（平铺，不拉伸）
    scene.add
      .tileSprite(x + w / 2, wallY0 + WALL_H / 2, w, WALL_H, 'proc', `buildings/side_${variant}`)
      .setDepth(-56);

    // 屋顶（平铺底纹，不带边框，避免露出网格）
    scene.add
      .tileSprite(x + w / 2, roofY0 + roofH / 2, w, roofH, 'proc', `buildings/roof_surface_${variant % 3}`)
      .setDepth(-55);

    // 屋顶轮廓 + 女儿墙
    const og = scene.add.graphics().setDepth(-52);
    og.lineStyle(5, 0x2f333a, 1);
    og.strokeRect(x + 3, roofY0 + 3, w - 6, roofH - 6);
    og.lineStyle(2, 0x6d7069, 1);
    og.strokeRect(x + 8, roofY0 + 8, w - 16, roofH - 16);

    // 屋顶设备贴花
    const decals = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < decals; i++) {
      const useTower = rng() > 0.55;
      const dx = x + 30 + rng() * (w - 60);
      const dy = roofY0 + 30 + rng() * (roofH - 60);
      const frame = useTower ? 'props/water_tower' : 'props/ac_unit';
      const scale = useTower ? 0.9 : 0.85;
      scene.add.image(dx, dy, 'proc', frame).setScale(scale).setDepth(-50);
    }

    colliders.push({ x: x + 8, y: roofY0 + 8, w: w - 16, h: depth - 16 });
  };
  for (const [x, w, v] of BLOCKS_TOP) addBlock(x, w, v, true);
  for (const [x, w, v] of BLOCKS_BOTTOM) addBlock(x, w, v, false);

  // 后排建筑：只画屋顶，压暗一档，让城市看起来有纵深而不是一排纸片
  const BACK_ROW: [number, number][] = [
    [-1650, 460],
    [-1120, 400],
    [-660, 440],
    [-160, 400],
    [300, 420],
    [790, 400],
    [1250, 440],
  ];
  const backRng = mulberry32(90210);
  for (const top of [true, false]) {
    const y0 = top ? WALK_TOP - BUILDING_DEPTH - 340 : WALK_BOTTOM + BUILDING_DEPTH;
    for (const [x, w] of BACK_ROW) {
      const h = 300 + Math.floor(backRng() * 120);
      scene.add
        .tileSprite(x + w / 2, y0 + h / 2, w, h, 'proc', 'buildings/roof_surface_1')
        .setTint(0x9a9a9a)
        .setDepth(-58);
      const og = scene.add.graphics().setDepth(-57);
      og.lineStyle(4, 0x23262b, 1);
      og.strokeRect(x + 4, y0 + 4, w - 8, h - 8);
    }
  }

  // 街具
  const props: [string, number, number, number][] = [
    ['props/streetlight', -1200, ROAD_TOP - 26, 1],
    ['props/streetlight', -560, ROAD_TOP - 26, 1],
    ['props/streetlight', 80, ROAD_TOP - 26, 1],
    ['props/streetlight', 720, ROAD_TOP - 26, 1],
    ['props/streetlight', -900, ROAD_BOTTOM + 26, 1],
    ['props/streetlight', -240, ROAD_BOTTOM + 26, 1],
    ['props/streetlight', 460, ROAD_BOTTOM + 26, 1],
    ['props/streetlight', 1180, ROAD_BOTTOM + 26, 1],
    ['props/tree', -1300, ROAD_TOP - 42, 1],
    ['props/tree', -760, ROAD_TOP - 42, 1],
    ['props/tree', -80, ROAD_TOP - 42, 1],
    ['props/tree', 380, ROAD_TOP - 42, 1],
    ['props/tree', 1020, ROAD_TOP - 42, 1],
    ['props/tree', -1080, ROAD_BOTTOM + 42, 1],
    ['props/tree', -420, ROAD_BOTTOM + 42, 1],
    ['props/tree', 240, ROAD_BOTTOM + 42, 1],
    ['props/tree', 900, ROAD_BOTTOM + 42, 1],
    ['props/bench', -880, ROAD_TOP - 30, 1],
    ['props/bench', -320, ROAD_BOTTOM + 30, 1],
    ['props/bench', 620, ROAD_TOP - 30, 1],
    ['props/trashcan', -1040, ROAD_TOP - 24, 1],
    ['props/trashcan', -160, ROAD_TOP - 24, 1],
    ['props/trashcan', 540, ROAD_BOTTOM + 24, 1],
    ['props/hydrant', -700, ROAD_TOP - 22, 1],
    ['props/hydrant', 940, ROAD_BOTTOM + 22, 1],
    ['props/mailbox', -460, ROAD_TOP - 26, 1],
    ['props/mailbox', 1120, ROAD_TOP - 26, 1],
    ['props/newsstand', -1240, ROAD_BOTTOM + 34, 1],
    ['props/newsstand', 180, ROAD_BOTTOM + 34, 1],
    ['props/cone', 300, ROAD_TOP + 40, 1],
    ['props/cone', 332, ROAD_TOP + 44, 1],
  ];
  for (const [frame, x, y, sc] of props) {
    scene.add.image(x, y, 'proc', frame).setScale(sc).setDepth(-40);
  }

  // 停靠的车（装饰）—— 用烘焙出来的多角度精灵，按朝向取帧
  // 上排朝东（0）、下排朝西（π），符合这条街的车流方向
  const parked: [CarId, number, number, number][] = [
    ['delivery', -420, ROAD_TOP + 52, 0],
    ['taxi', 260, ROAD_BOTTOM - 52, Math.PI],
    ['police', 1120, ROAD_TOP + 52, 0],
    ['suvluxury', -980, ROAD_BOTTOM - 52, Math.PI],
    ['firetruck', -1240, ROAD_BOTTOM - 56, Math.PI],
    ['race', 640, ROAD_TOP + 50, 0],
    ['truckflat', 1560, ROAD_TOP + 52, 0],
    ['truck', -160, ROAD_BOTTOM - 56, Math.PI],
  ];
  for (const [type, x, y, rot] of parked) {
    makeCarSprite(scene, type, x, y, rot).setDepth(-30);
  }

  return {
    colliders,
    bounds: { x: WORLD.left, y: WORLD.top, w: worldW, h: worldH },
    spawn: {
      player: { x: -40, y: ROAD_TOP - 34 },
      car: { x: 60, y: ROAD_TOP + 58 },
    },
  };
}
