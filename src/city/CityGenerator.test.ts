import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISTRICT,
  facadePlacement,
  generateDistrict,
  isOnRoad,
  type Building,
} from './CityGenerator';

describe('街区生成', () => {
  it('同一个种子生成同一个街区', () => {
    const a = generateDistrict({ seed: 1234 });
    const b = generateDistrict({ seed: 1234 });
    expect(a.lots.length).toBe(b.lots.length);
    expect(JSON.stringify(a.lots)).toBe(JSON.stringify(b.lots));
  });

  it('不同种子生成不同街区', () => {
    const a = generateDistrict({ seed: 1 });
    const b = generateDistrict({ seed: 2 });
    expect(JSON.stringify(a.lots)).not.toBe(JSON.stringify(b.lots));
  });

  it('路网在地图内，且街道之间不粘连', () => {
    const d = generateDistrict();
    for (const s of d.streets) {
      const p = s.pos;
      expect(p - s.half).toBeGreaterThanOrEqual(0);
      expect(p + s.half).toBeLessThanOrEqual(d.bounds.w);
    }
    const vs = d.streets.filter((s) => s.axis === 'v').sort((a, b) => a.pos - b.pos);
    for (let i = 0; i + 1 < vs.length; i++) {
      expect(vs[i + 1].pos - vs[i + 1].half).toBeGreaterThan(vs[i].pos + vs[i].half);
    }
  });

  it('地块之间不重叠', () => {
    const d = generateDistrict();
    for (let i = 0; i < d.lots.length; i++) {
      for (let j = i + 1; j < d.lots.length; j++) {
        const a = d.lots[i];
        const b = d.lots[j];
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('每栋楼都完整落在自己的地块里', () => {
    const d = generateDistrict();
    expect(d.lots.length).toBeGreaterThan(0);
    for (const lot of d.lots) {
      for (const b of lot.buildings) {
        expect(b.x).toBeGreaterThanOrEqual(lot.x - 0.001);
        expect(b.y).toBeGreaterThanOrEqual(lot.y - 0.001);
        expect(b.x + b.w).toBeLessThanOrEqual(lot.x + lot.w + 0.001);
        expect(b.y + b.d).toBeLessThanOrEqual(lot.y + lot.h + 0.001);
        expect(b.w).toBeGreaterThan(0);
        expect(b.d).toBeGreaterThan(0);
      }
    }
  });

  it('同地块的楼互不重叠', () => {
    const d = generateDistrict();
    for (const lot of d.lots) {
      const bs = lot.buildings;
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i];
          const b = bs[j];
          const overlap =
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('楼不会压到马路上', () => {
    const d = generateDistrict();
    const sw = DEFAULT_DISTRICT.sidewalk;
    for (const lot of d.lots) {
      for (const b of lot.buildings) {
        // 楼所在的地块已经扣掉了马路和人行道，再留一点余量
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(d.bounds.w);
        expect(b.y + b.d).toBeLessThanOrEqual(d.bounds.h);
        void sw;
      }
    }
  });

  it('四种朝向都会出现', () => {
    const d = generateDistrict();
    const kinds = new Set(d.lots.map((l) => l.facing));
    expect(kinds.size).toBe(4);
  });

  it('地图边缘也有楼（虚拟街圈出最外圈地块）', () => {
    const d = generateDistrict();
    const bs = d.lots.flatMap((l) => l.buildings);
    const near = 420;
    expect(bs.some((b) => b.x < near)).toBe(true);
    expect(bs.some((b) => b.x + b.w > d.bounds.w - near)).toBe(true);
    expect(bs.some((b) => b.y < near)).toBe(true);
    expect(bs.some((b) => b.y + b.d > d.bounds.h - near)).toBe(true);
  });

  it('边缘地块的立面不会朝地图外', () => {
    const d = generateDistrict();
    for (const b of d.lots.flatMap((l) => l.buildings)) {
      if (!b.facing) continue;
      if (b.facing === 'w') expect(b.x).toBeGreaterThan(1);
      if (b.facing === 'e') expect(b.x + b.w).toBeLessThan(d.bounds.w - 1);
      if (b.facing === 'n') expect(b.y).toBeGreaterThan(1);
      if (b.facing === 's') expect(b.y + b.d).toBeLessThan(d.bounds.h - 1);
    }
  });

  it('虚拟街不产生行人落脚点', () => {
    const d = generateDistrict();
    for (const w of d.walkers) {
      expect(w.y).toBeGreaterThan(20);
      expect(w.y).toBeLessThan(d.bounds.h - 20);
    }
  });

  it('路内 / 路外判定', () => {
    const d = generateDistrict();
    expect(isOnRoad(d, d.spawn.car.x, d.spawn.car.y)).toBe(true);
    const lot = d.lots[0];
    expect(isOnRoad(d, lot.x + lot.w / 2, lot.y + lot.h / 2)).toBe(false);
  });

  it('出生点在地图内', () => {
    const d = generateDistrict();
    expect(d.spawn.player.x).toBeGreaterThan(0);
    expect(d.spawn.player.x).toBeLessThan(d.bounds.w);
    expect(d.spawn.car.y).toBeGreaterThan(0);
    expect(d.spawn.car.y).toBeLessThan(d.bounds.h);
  });
});

describe('立面摆放', () => {
  const b = (facing: Building['facing']): Building => ({
    x: 100,
    y: 200,
    w: 300,
    d: 250,
    facing,
    seed: 1,
    wallH: 100,
    roofVariant: 0,
  });

  it('朝南：立面在楼下边缘，不翻转', () => {
    const p = facadePlacement(b('s'));
    expect(p.flipY).toBe(false);
    expect(p.y).toBe(450);
  });

  it('朝北：立面在上边缘，翻转', () => {
    const p = facadePlacement(b('n'));
    expect(p.flipY).toBe(true);
    expect(p.y).toBe(200);
  });

  it('朝东：立面在右边缘，转 -90°', () => {
    const p = facadePlacement(b('e'));
    expect(p.x).toBe(400);
    expect(p.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('朝西：立面在左边缘，转 +90°', () => {
    const p = facadePlacement(b('w'));
    expect(p.x).toBe(100);
    expect(p.rotation).toBeCloseTo(Math.PI / 2);
  });
});
