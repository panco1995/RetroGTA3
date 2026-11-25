import Phaser from 'phaser';
import { mulberry32 } from '../core/rng';
import { Rect } from '../game/physics';
import { makeCarSprite } from '../game/Vehicle';
import { registerFacadeCleanup } from './facade';
import {
  DEFAULT_DISTRICT,
  generateDistrict,
  type District,
  type WalkPoint,
} from './CityGenerator';
import { renderDistrict } from './CityRenderer';
import type { CarId } from '../assets/baked';

export interface RepairPad {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface City {
  colliders: Rect[];
  bounds: { x: number; y: number; w: number; h: number };
  spawn: { player: { x: number; y: number }; car: { x: number; y: number } };
  /** 人行道上的落脚点（行人 AI 用） */
  walkers: WalkPoint[];
  district: District;
  /** Pay 'n' Spray：停上去缓慢修车 */
  repairPad: RepairPad;
}

/**
 * 搭这座城：程序化街区 → 渲染。
 *
 * 路网、地块、建筑布局全部来自 generateDistrict（同 seed 必得同结果），
 * 这里只负责把数据画出来。
 */
export function buildStreet(scene: Phaser.Scene, seed = DEFAULT_DISTRICT.seed): City {
  // 运行时生成的立面贴图在 scene 关闭时销毁，避免 TextureManager 泄漏
  registerFacadeCleanup(scene);

  const district: District = generateDistrict({ seed });
  const { colliders } = renderDistrict(scene, district, {
    sidewalk: DEFAULT_DISTRICT.sidewalk,
    props: true,
  });

  // 修车点：中间那条横街、路口之间的一侧路缘停车位。
  // 位置从路网算出来，地图参数一变它跟着走。
  const realVs = district.streets
    .filter((s) => s.axis === 'v' && !s.edge)
    .sort((a, b) => a.pos - b.pos);
  const realHs = district.streets
    .filter((s) => s.axis === 'h' && !s.edge)
    .sort((a, b) => a.pos - b.pos);
  const hStreet = realHs[Math.floor(realHs.length / 2)];
  const vi = Math.min(realVs.length - 2, Math.floor(realVs.length / 2));
  const segL = realVs[vi].pos + realVs[vi].half + 90;
  const segR = realVs[vi + 1].pos - realVs[vi + 1].half - 90;
  const repairPad: RepairPad = {
    x: (segL + segR) / 2,
    y: hStreet.pos - (hStreet.half - 26),
    w: 170,
    h: 54,
  };
  drawRepairPad(scene, repairPad);

  // 停靠的车（装饰）—— 用烘焙出来的多角度精灵，按朝向取帧。
  // 停在路缘车位上，不和行车道/修车点打架。
  const parkedRng = mulberry32(0x5bf03635);
  const types: CarId[] = [
    'delivery',
    'taxi',
    'police',
    'suvluxury',
    'firetruck',
    'race',
    'truckflat',
    'truck',
  ];
  let ti = 0;
  for (const s of realHs) {
    for (const lane of [-1, 1]) {
      const x = 240 + parkedRng() * (district.bounds.w - 480);
      const y = s.pos + lane * (s.half - 18);
      if (Math.hypot(x - repairPad.x, y - repairPad.y) < 130) continue;
      makeCarSprite(scene, types[ti % types.length], x, y, lane < 0 ? 0 : Math.PI).setDepth(-30);
      ti++;
    }
  }

  // 地图边界：看不见的墙，防止把车开出世界（摄像机有 bounds，但物理没有）
  const b = district.bounds;
  const W = 200;
  colliders.push(
    { x: b.x - W, y: b.y - W, w: W, h: b.h + W * 2 },
    { x: b.x + b.w, y: b.y - W, w: W, h: b.h + W * 2 },
    { x: b.x - W, y: b.y - W, w: b.w + W * 2, h: W },
    { x: b.x - W, y: b.y + b.h, w: b.w + W * 2, h: W },
  );

  return {
    colliders,
    bounds: district.bounds,
    spawn: district.spawn,
    walkers: district.walkers,
    district,
    repairPad,
  };
}

function drawRepairPad(scene: Phaser.Scene, p: RepairPad): void {
  const g = scene.add.graphics().setDepth(-35);
  g.fillStyle(0x153349, 0.92);
  g.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
  g.lineStyle(3, 0x6fc3ff, 0.9);
  g.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
  // 斜纹
  g.lineStyle(4, 0x2f6f9c, 0.8);
  for (let i = -p.h; i < p.w; i += 22) {
    g.lineBetween(
      p.x - p.w / 2 + i,
      p.y + p.h / 2,
      p.x - p.w / 2 + i + p.h,
      p.y - p.h / 2,
    );
  }

  scene.add
    .text(p.x, p.y - p.h / 2 - 34, "PAY 'N' SPRAY", {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#6fc3ff',
      stroke: '#0b0d10',
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setDepth(-34);
}
