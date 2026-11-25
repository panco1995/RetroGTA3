/**
 * 街区渲染 —— 把 generateDistrict 的数据画进 Phaser
 *
 * 深度约定（从下到上）：
 *   -100 草地底
 *    -96 街区地面（沥青 / 后院）
 *    -90 马路
 *    -88 人行道
 *    -85 路面标线
 *    -60 楼体投影
 *    -56 临街立面
 *    -55 屋顶
 *    -52 女儿墙
 *    -50 屋顶设备
 *    -40 街具
 *    -30 停靠的车
 */
import Phaser from 'phaser';
import { mulberry32 } from '../core/rng';
import { createFacadeImage, facadeSpec } from './facade';
import {
  facadePlacement,
  type Building,
  type District,
  type Street,
} from './CityGenerator';

export interface RenderOptions {
  sidewalk: number;
  /** 是否画街具与停靠车 */
  props: boolean;
}

/** 楼的屋顶部分（扣掉临街那一条立面）。街区内侧的楼没有立面，整个都是屋顶。 */
function roofRect(b: Building): { x: number; y: number; w: number; h: number } {
  if (!b.facing) return { x: b.x, y: b.y, w: b.w, h: b.d };
  switch (b.facing) {
    case 's':
      return { x: b.x, y: b.y, w: b.w, h: b.d - b.wallH };
    case 'n':
      return { x: b.x, y: b.y + b.wallH, w: b.w, h: b.d - b.wallH };
    case 'e':
      return { x: b.x, y: b.y, w: b.w - b.wallH, h: b.d };
    case 'w':
      return { x: b.x + b.wallH, y: b.y, w: b.w - b.wallH, h: b.d };
  }
}

/** 临街边的长度 = 立面贴图的宽度 */
function facadeWidth(b: Building): number {
  return b.facing === 'n' || b.facing === 's' ? b.w : b.d;
}

/**
 * 沿一条轴画人行道，按另一轴上的街道路幅断开 —— 路口不能横穿马路。
 */
function drawSidewalkStrips(
  scene: Phaser.Scene,
  street: Street,
  crossings: Street[],
  bounds: { w: number; h: number },
  sw: number,
  depth: number,
): void {
  const cuts = crossings
    .map((c) => [c.pos - c.half, c.pos + c.half] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const segs: [number, number][] = [];
  let cursor = 0;
  for (const [c0, c1] of cuts) {
    if (c0 > cursor) segs.push([cursor, Math.min(c0, bounds.h)]);
    cursor = Math.max(cursor, c1);
  }
  if (cursor < bounds.h) segs.push([cursor, bounds.h]);

  const half = street.half;

  for (const [a, b] of segs) {
    if (b - a <= 1) continue;
    const len = b - a;
    const mid = (a + b) / 2;
    // 马路两侧各一条人行道
    for (const side of [-1, 1]) {
      const c = street.pos + side * (half + sw / 2);
      const x = street.axis === 'v' ? c : mid - len / 2;
      const y = street.axis === 'v' ? mid - len / 2 : c;
      const w = street.axis === 'v' ? sw : len;
      const h = street.axis === 'v' ? len : sw;
      scene.add.tileSprite(x + w / 2, y + h / 2, w, h, 'proc', 'tiles/sidewalk_0').setDepth(depth);
    }
  }
}

/** 路面中线：主干道才有黄色虚线 */
function drawRoadMarks(
  scene: Phaser.Scene,
  street: Street,
  crossings: Street[],
  bounds: { w: number; h: number },
  depth: number,
): void {
  if (!street.major) return;
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(0xd9c24a, 0.85);

  const along = street.axis === 'v' ? bounds.h : bounds.w;
  const step = 160;
  const dash = 80;
  for (let t = 0; t < along; t += step) {
    // 路口范围内不画
    const inCrossing = crossings.some(
      (c) => t + dash / 2 > c.pos - c.half && t + dash / 2 < c.pos + c.half,
    );
    if (inCrossing) continue;
    if (street.axis === 'v') g.fillRect(street.pos - 4, t, 8, dash);
    else g.fillRect(t, street.pos - 4, dash, 8);
  }
}

export function renderDistrict(
  scene: Phaser.Scene,
  district: District,
  opts: RenderOptions,
): { colliders: { x: number; y: number; w: number; h: number }[] } {
  const { bounds } = district;
  // 虚拟街只参与地块划分，不画马路 / 人行道 / 街具
  const streets = district.streets.filter((s) => !s.edge);
  const vs = streets.filter((s) => s.axis === 'v');
  const hs = streets.filter((s) => s.axis === 'h');

  // 草地底
  scene.add
    .tileSprite(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w, bounds.h, 'proc', 'tiles/grass_1')
    .setDepth(-100);

  // 街区地面（马路以外的地方都是沥青地/后院）
  scene.add
    .tileSprite(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w, bounds.h, 'proc', 'tiles/asphalt_2')
    .setDepth(-96);

  // 马路
  for (const s of streets) {
    const w = s.axis === 'v' ? s.half * 2 : bounds.w;
    const h = s.axis === 'v' ? bounds.h : s.half * 2;
    scene.add
      .tileSprite(
        s.axis === 'v' ? s.pos : bounds.x + bounds.w / 2,
        s.axis === 'v' ? bounds.y + bounds.h / 2 : s.pos,
        w,
        h,
        'proc',
        'tiles/asphalt_1',
      )
      .setDepth(-90);
  }

  // 人行道
  for (const s of vs) drawSidewalkStrips(scene, s, hs, bounds, opts.sidewalk, -88);
  for (const s of hs) drawSidewalkStrips(scene, s, vs, bounds, opts.sidewalk, -88);

  // 路缘石
  const kerb = scene.add.graphics().setDepth(-86);
  kerb.fillStyle(0x9a9384, 1);
  for (const s of vs) {
    kerb.fillRect(s.pos - s.half, bounds.y, 8, bounds.h);
    kerb.fillRect(s.pos + s.half - 8, bounds.y, 8, bounds.h);
  }
  for (const s of hs) {
    kerb.fillRect(bounds.x, s.pos - s.half, bounds.w, 8);
    kerb.fillRect(bounds.x, s.pos + s.half - 8, bounds.w, 8);
  }

  // 路面标线
  for (const s of vs) drawRoadMarks(scene, s, hs, bounds, -85);
  for (const s of hs) drawRoadMarks(scene, s, vs, bounds, -85);

  // 建筑
  const colliders: { x: number; y: number; w: number; h: number }[] = [];
  const roofRng = mulberry32(0x27d4eb2f);

  for (const lot of district.lots) {
    for (const b of lot.buildings) {
      // 楼体投影
      scene.add
        .rectangle(b.x + b.w / 2, b.y + b.d / 2 + 14, b.w, b.d, 0x101318, 0.45)
        .setDepth(-60);

      // 临街立面：按这栋楼的实际临街边长度现拼。
      // 街区内侧的楼没有立面，俯视只看得见顶。
      if (b.facing) {
        const spec = facadeSpec(facadeWidth(b), b.wallH, b.seed);
        const p = facadePlacement(b);
        const face = createFacadeImage(scene, spec, p.x, p.y).setDepth(-56);
        face.setRotation(p.rotation);
        if (p.flipY) face.setFlipY(true);
      }

      // 屋顶
      const roof = roofRect(b);
      scene.add
        .tileSprite(
          roof.x + roof.w / 2,
          roof.y + roof.h / 2,
          roof.w,
          roof.h,
          'proc',
          `buildings/roof_surface_${b.roofVariant}`,
        )
        .setDepth(-55);

      // 女儿墙
      const og = scene.add.graphics().setDepth(-52);
      og.lineStyle(5, 0x2f333a, 1);
      og.strokeRect(roof.x + 3, roof.y + 3, roof.w - 6, roof.h - 6);
      og.lineStyle(2, 0x6d7069, 1);
      og.strokeRect(roof.x + 8, roof.y + 8, roof.w - 16, roof.h - 16);

      // 屋顶设备：空调外机 / 水塔
      if (roof.w > 70 && roof.h > 70) {
        const n = 1 + Math.floor(roofRng() * 3);
        for (let i = 0; i < n; i++) {
          const frame = roofRng() > 0.55 ? 'props/water_tower' : 'props/ac_unit';
          const x = roof.x + 26 + roofRng() * Math.max(1, roof.w - 52);
          const y = roof.y + 26 + roofRng() * Math.max(1, roof.h - 52);
          scene.add.image(x, y, 'proc', frame).setScale(0.5).setDepth(-50);
        }
      }

      colliders.push({ x: b.x + 6, y: b.y + 6, w: b.w - 12, h: b.d - 12 });
    }
  }

  // 街具
  if (opts.props) {
    const propRng = mulberry32(0x9d2c5680);
    const frames = ['props/streetlight', 'props/tree', 'props/trashcan', 'props/hydrant'];
    for (const s of streets) {
      const along = s.axis === 'v' ? bounds.h : bounds.w;
      const n = Math.floor(along / 420);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * (along / n) + (propRng() - 0.5) * 60;
        const side = propRng() > 0.5 ? 1 : -1;
        const c = s.pos + side * (s.half + opts.sidewalk / 2);
        const frame = frames[Math.floor(propRng() * frames.length)];
        const x = s.axis === 'v' ? c : t;
        const y = s.axis === 'v' ? t : c;
        scene.add.image(x, y, 'proc', frame).setScale(1).setDepth(-40);
      }
    }
  }

  return { colliders };
}
