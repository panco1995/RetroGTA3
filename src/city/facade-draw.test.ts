import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  FACADE_SHORT,
  FACADE_TALL,
  composeFacade,
  facadeSpec,
  paintFacade,
  pickWallHeight,
  type FacadePlan,
  type Rect,
} from './facade-draw';

function inside(rect: Rect, w: number, h: number): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w && rect.y + rect.h <= h;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function holes(plan: FacadePlan): Rect[] {
  return plan.openings.flatMap((op) => (op.hole ? [op.hole] : []));
}

function assertPlan(plan: FacadePlan): void {
  expect(plan.groundTop + (plan.height - plan.groundTop)).toBe(plan.height);
  expect(plan.beltTop).toBe(plan.floorTop + plan.floorH * plan.floors);
  expect(plan.groundTop).toBe(plan.beltTop + plan.beltH);
  expect(plan.groundTop).toBeLessThan(plan.height);
  expect(plan.pier).toBeGreaterThanOrEqual(4);
  expect(plan.pier + plan.bayCount * plan.bayW).toBeLessThanOrEqual(plan.width);

  if (plan.signRect && plan.sign !== 'blade') {
    expect((plan.signRect.x - plan.pier) % plan.bayW).toBe(0);
    expect(plan.signRect.w % plan.bayW).toBe(0);
  }
  if (plan.signRect) expect(inside(plan.signRect, plan.width, plan.height)).toBe(true);

  const rects: Rect[] = [];
  for (const op of plan.openings) {
    const bayX = plan.pier + op.bay * plan.bayW;
    const cellY = plan.floorTop + op.floor * plan.floorH;
    const cell: Rect = { x: bayX, y: cellY, w: plan.bayW, h: plan.floorH };
    if (op.hole) {
      expect(inside(op.hole, plan.width, plan.height)).toBe(true);
      expect(op.hole.x).toBeGreaterThanOrEqual(cell.x);
      expect(op.hole.x + op.hole.w).toBeLessThanOrEqual(cell.x + cell.w);
      expect(op.hole.y).toBeGreaterThanOrEqual(cell.y);
      expect(op.hole.y + op.hole.h).toBeLessThanOrEqual(cell.y + cell.h);
      rects.push(op.hole);
    }
    if (op.ac) {
      expect(inside(op.ac, plan.width, plan.height)).toBe(true);
      expect(op.ac.y + op.ac.h).toBeLessThanOrEqual(plan.beltTop);
      expect(op.ac.x).toBeGreaterThanOrEqual(cell.x);
      expect(op.ac.x + op.ac.w).toBeLessThanOrEqual(cell.x + cell.w);
      if (op.hole && plan.acMode === 'sill') expect(op.ac.y).toBeGreaterThanOrEqual(op.hole.y + op.hole.h);
      if (op.hole && plan.acMode === 'side') expect(overlaps(op.ac, op.hole)).toBe(false);
      rects.push(op.ac);
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i], rects[j])).toBe(false);
    }
  }

  for (let floor = 0; floor < plan.floors; floor++) {
    const row = plan.openings.filter((op) => op.floor === floor && op.hole);
    const ys = new Set(row.map((op) => op.hole!.y));
    const hs = new Set(row.map((op) => op.hole!.h));
    expect(ys.size).toBeLessThanOrEqual(1);
    expect(hs.size).toBeLessThanOrEqual(1);
  }
}

describe('立面开间组合', () => {
  it('同一套种子拼出同一张方案', () => {
    const spec = facadeSpec(320, FACADE_TALL, 42);
    expect(composeFacade(spec)).toEqual(composeFacade(spec));
  });

  it('加宽只增加开间，不更换窗框、砌法、招牌和空调机位', () => {
    const narrow = composeFacade(facadeSpec(220, FACADE_TALL, 7));
    const wide = composeFacade(facadeSpec(460, FACADE_TALL, 7));
    expect(wide.bayCount).toBeGreaterThan(narrow.bayCount);
    expect(wide.bayW).toBe(narrow.bayW);
    expect(wide.frame).toBe(narrow.frame);
    expect(wide.sign).toBe(narrow.sign);
    expect(wide.acMode).toBe(narrow.acMode);
    expect(wide.bond).toBe(narrow.bond);
    expect(wide.wallColor).toBe(narrow.wallColor);
    expect(wide.floors).toBe(narrow.floors);
    const kind = (plan: FacadePlan, bay: number) =>
      plan.openings.find((op) => op.bay === bay && op.floor === 0)?.kind;
    expect(kind(wide, 0)).toBe(kind(narrow, 0));
    expect(kind(wide, 1)).toBe(kind(narrow, 1));
  });

  it('矮楼一层、高楼两层', () => {
    expect(composeFacade(facadeSpec(300, FACADE_SHORT, 3)).floors).toBe(1);
    expect(composeFacade(facadeSpec(300, FACADE_TALL, 3)).floors).toBe(2);
    expect(pickWallHeight(1)).toBeGreaterThanOrEqual(FACADE_SHORT);
    expect([FACADE_SHORT, FACADE_TALL]).toContain(pickWallHeight(9));
  });

  it('窗洞、外机、招牌都落在墙内，外机不压进店面', () => {
    for (let seed = 0; seed < 24; seed++) {
      for (const width of [48, 96, 240, 380]) {
        for (const height of [64, FACADE_SHORT, FACADE_TALL, 200]) {
          assertPlan(composeFacade(facadeSpec(width, height, seed)));
        }
      }
    }
  });

  it('不同种子会换零件，不是同一张墙拉伸', () => {
    const plans = Array.from({ length: 36 }, (_, seed) => composeFacade(facadeSpec(340, FACADE_TALL, seed)));
    const frames = new Set(plans.map((p) => p.frame));
    const signs = new Set(plans.map((p) => p.sign));
    const ac = new Set(plans.map((p) => p.acMode));
    const bonds = new Set(plans.map((p) => p.bond));
    expect(frames.size).toBeGreaterThan(1);
    expect(signs.size).toBeGreaterThan(1);
    expect(ac.size).toBeGreaterThan(1);
    expect(bonds.size).toBeGreaterThan(1);
    expect(plans.some((p) => p.openings.some((op) => op.ac))).toBe(true);
    expect(plans.some((p) => p.acMode === 'none')).toBe(true);
    const counts = plans.map((p) => holes(p).length);
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
  });

  it('画出来的像素由种子决定，换种子就换一面墙', () => {
    const render = (seed: number) => {
      const spec = facadeSpec(180, FACADE_SHORT, seed);
      const canvas = createCanvas(spec.width, spec.height);
      const ctx = canvas.getContext('2d');
      paintFacade(ctx as unknown as CanvasRenderingContext2D, spec);
      const data = ctx.getImageData(0, 0, spec.width, spec.height).data;
      return Buffer.from(data);
    };
    const a = render(4);
    expect(Buffer.compare(a, render(4))).toBe(0);
    expect(Buffer.compare(a, render(5))).not.toBe(0);
    expect(a.some((v) => v !== 0)).toBe(true);
  });
});
