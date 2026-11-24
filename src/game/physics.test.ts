import { describe, expect, it } from 'vitest';
import {
  VEHICLE,
  createVehicleState,
  forwardSpeed,
  resolveCircle,
  resolveCollisions,
  stepVehicle,
} from './physics';

const NO_INPUT = { throttle: 0, steer: 0, handbrake: false };

describe('车辆物理', () => {
  it('油门让车向前加速', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 60; i++) stepVehicle(st, { throttle: 1, steer: 0, handbrake: false }, 1 / 60);
    expect(forwardSpeed(st)).toBeGreaterThan(100);
    expect(st.x).toBeGreaterThan(0);
  });

  it('速度不超过上限', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 3000; i++) stepVehicle(st, { throttle: 1, steer: 0, handbrake: false }, 1 / 60);
    expect(forwardSpeed(st)).toBeLessThanOrEqual(VEHICLE.maxSpeed + 1);
  });

  it('松开油门会自然减速', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 60; i++) stepVehicle(st, { throttle: 1, steer: 0, handbrake: false }, 1 / 60);
    const fast = forwardSpeed(st);
    for (let i = 0; i < 60; i++) stepVehicle(st, NO_INPUT, 1 / 60);
    expect(forwardSpeed(st)).toBeLessThan(fast);
  });

  it('静止时打方向车不会转', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 60; i++) stepVehicle(st, { throttle: 0, steer: 1, handbrake: false }, 1 / 60);
    expect(st.angle).toBeCloseTo(0, 5);
  });

  it('行驶中打方向车会转', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 60; i++) stepVehicle(st, { throttle: 1, steer: 0, handbrake: false }, 1 / 60);
    const before = st.angle;
    for (let i = 0; i < 30; i++) stepVehicle(st, { throttle: 1, steer: 1, handbrake: false }, 1 / 60);
    expect(st.angle).toBeGreaterThan(before);
  });

  it('倒车时转向方向相反（和真车一样）', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 240; i++) stepVehicle(st, { throttle: -1, steer: 0, handbrake: false }, 1 / 60);
    expect(forwardSpeed(st)).toBeLessThan(0);
    const before = st.angle;
    for (let i = 0; i < 30; i++) stepVehicle(st, { throttle: -1, steer: 1, handbrake: false }, 1 / 60);
    expect(st.angle).toBeLessThan(before);
  });

  it('手刹会让车产生侧向滑移', () => {
    const st = createVehicleState(0, 0, 0);
    for (let i = 0; i < 90; i++) stepVehicle(st, { throttle: 1, steer: 0, handbrake: false }, 1 / 60);
    for (let i = 0; i < 30; i++) stepVehicle(st, { throttle: 1, steer: 1, handbrake: true }, 1 / 60);
    // 侧向速度 = 总速度在垂直于车头方向上的分量
    const lateral = Math.abs(st.vx * -Math.sin(st.angle) + st.vy * Math.cos(st.angle));
    expect(lateral).toBeGreaterThan(20);
  });

  it('撞到建筑会被推出且速度衰减', () => {
    // 车心已经压在墙里（墙 x: 100~140）
    const st = createVehicleState(120, 0, 0);
    st.vx = 300;
    const wall = [{ x: 100, y: -200, w: 40, h: 400 }];
    const hit = resolveCollisions(st, wall);
    expect(hit).toBe(true);
    expect(st.x).toBeLessThan(100);
    expect(Math.abs(st.vx)).toBeLessThan(300);
  });

  it('撞墙前会被推开而不是嵌进去', () => {
    const st = createVehicleState(80, 0, 0);
    st.vx = 300;
    const wall = [{ x: 100, y: -200, w: 40, h: 400 }];
    resolveCollisions(st, wall);
    // 半径 26，球心最远能到 100 - 26 = 74
    expect(st.x).toBeLessThanOrEqual(100 - VEHICLE.radius + 0.001);
  });
});

describe('圆-矩形碰撞', () => {
  it('不重叠时不改变位置', () => {
    const r = resolveCircle(0, 0, 10, [{ x: 100, y: 100, w: 50, h: 50 }]);
    expect(r.hit).toBe(false);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('重叠时被推到矩形外', () => {
    const r = resolveCircle(105, 105, 10, [{ x: 100, y: 100, w: 50, h: 50 }]);
    expect(r.hit).toBe(true);
    const inside = r.x > 100 && r.x < 150 && r.y > 100 && r.y < 150;
    expect(inside).toBe(false);
  });
});
