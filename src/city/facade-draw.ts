/**
 * 建筑立面 —— 按开间拼出来，不整块烘焙
 *
 * 一栋楼的临街面 = 同一套零件按种子拼起来：
 *   开间网格 × 层数 × 窗框样式 × 砖缝砌法 × 招牌 × 空调机位 × 底层
 * 宽度变了只是开间数变了，零件样式由种子决定，所以同一栋楼的词汇
 * 可以复用到另一栋不同宽度的楼上。画布尺寸运行时才知道，不进图集。
 *
 * 视角：俯视看到的是「屋顶 + 临街立面一条」。
 * 贴图像素上方靠楼顶（檐口、招牌），下方贴人行道（店面）。
 */
import { PAL, shade } from '../assets/palette';
import { mulberry32 } from '../core/rng';

export type FacadeStyle = 'brick' | 'concrete' | 'glass' | 'stucco';
export type GroundKind = 'shop' | 'door' | 'garage' | 'blank';
export type FrameStyle = 'cross' | 'double' | 'single';
export type SignKind = 'board' | 'marquee' | 'blade' | 'painted' | 'none';
export type AcMode = 'sill' | 'side' | 'none';
export type Bond = 'running' | 'stack';
export type OpeningKind = 'window' | 'boarded' | 'vent' | 'blank';

export interface FacadeSpec {
  width: number;
  height: number;
  seed: number;
  style: FacadeStyle;
  ground: GroundKind;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Opening {
  bay: number;
  floor: number;
  kind: OpeningKind;
  lit: boolean;
  blind: boolean;
  /** 窗洞。blank 没有洞 */
  hole: Rect | null;
  /** 空调外机。没有则是 null */
  ac: Rect | null;
}

export interface FacadePlan {
  width: number;
  height: number;
  style: FacadeStyle;
  ground: GroundKind;
  frame: FrameStyle;
  sign: SignKind;
  acMode: AcMode;
  bond: Bond;
  wallColor: string;
  accent: string;
  pier: number;
  bayW: number;
  bayCount: number;
  floors: number;
  eaveH: number;
  signH: number;
  floorTop: number;
  floorH: number;
  beltTop: number;
  beltH: number;
  groundTop: number;
  signRect: Rect | null;
  doorBay: number;
  garageStart: number;
  garageSpan: number;
  openings: Opening[];
}

/** 街景里用的两种立面高度：一层窗 / 两层窗 */
export const FACADE_SHORT = 100;
export const FACADE_TALL = 140;

const STYLES: FacadeStyle[] = ['brick', 'concrete', 'glass', 'stucco'];
const GROUNDS: GroundKind[] = ['shop', 'door', 'garage', 'blank'];
const FRAMES: FrameStyle[] = ['cross', 'double', 'single'];
const SIGNS: SignKind[] = ['board', 'marquee', 'blade', 'painted', 'none'];
const ACS: AcMode[] = ['sill', 'side', 'none'];
const BONDS: Bond[] = ['running', 'stack'];
const BAYS = [36, 42, 48] as const;
const ACCENTS = [PAL.brick, PAL.hudRed, PAL.hudYellow, PAL.glass, PAL.metalDark] as const;

type Ctx = CanvasRenderingContext2D;

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function hash01(seed: number, a: number, b: number): number {
  const n = (Math.imul(a + 1, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35) ^ (seed >>> 0)) >>> 0;
  return mulberry32(n)();
}

/** 一个开间、一层的独立随机数，不吃掉整栋楼的种子流，宽楼窄楼的同一开间才能对上 */
function cellRand(seed: number, bay: number, floor: number): () => number {
  return mulberry32((seed ^ Math.imul(bay + 1, 0x85ebca6b) ^ Math.imul(floor + 1, 0xc2b2ae35)) >>> 0);
}

export function pickWallHeight(seed: number): number {
  const rng = mulberry32(seed ^ 0x6a09e667);
  return rng() > 0.5 ? FACADE_TALL : FACADE_SHORT;
}

export function facadeSpec(width: number, height: number, seed: number): FacadeSpec {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  return {
    width: Math.max(32, Math.round(width)),
    height: Math.max(64, Math.round(height)),
    seed: seed >>> 0,
    style: pick(rng, STYLES),
    ground: pick(rng, GROUNDS),
  };
}

function floorCountFor(height: number): number {
  if (height >= 188) return 3;
  if (height >= 124) return 2;
  return 1;
}

function wallColorFor(style: FacadeStyle, jitter: number): string {
  if (style === 'brick') return shade(PAL.brick, jitter);
  if (style === 'stucco') return shade(PAL.concrete, 0.14 + jitter);
  if (style === 'glass') return shade(PAL.glass, -0.64);
  return shade(PAL.concrete, jitter * 0.5);
}

interface Bands {
  eaveH: number;
  signH: number;
  floors: number;
  floorTop: number;
  floorH: number;
  beltTop: number;
  beltH: number;
  groundTop: number;
}

function layoutBands(height: number, sign: SignKind): Bands {
  const eaveH = 6;
  const beltH = 4;
  let signH = sign === 'none' ? 8 : 20;
  let floors = floorCountFor(height);
  let floorH = 34;
  const chrome = () => eaveH + signH + beltH;

  while (chrome() + 22 + 16 * floors > height && signH > 8) signH -= 2;
  while (floors > 1 && chrome() + 24 + floorH * floors > height) floors -= 1;

  let room = height - chrome() - 24;
  if (room < floorH * floors) floorH = Math.max(22, Math.floor(room / floors));

  let groundH = height - (chrome() + floorH * floors);
  const maxGround = floors === 1 ? 36 : 42;
  if (groundH > maxGround) {
    const extra = groundH - maxGround;
    floorH += Math.floor(extra / floors);
    groundH = height - (chrome() + floorH * floors);
  }
  if (groundH < 22) {
    const need = 22 - groundH;
    floorH = Math.max(20, floorH - Math.ceil(need / floors));
    groundH = height - (chrome() + floorH * floors);
  }

  const floorTop = eaveH + signH;
  const beltTop = floorTop + floorH * floors;
  return {
    eaveH,
    signH,
    floors,
    floorTop,
    floorH,
    beltTop,
    beltH,
    groundTop: beltTop + beltH,
  };
}

function layoutBays(width: number, bayW0: number): { bayCount: number; bayW: number; pier: number } {
  const minPier = 4;
  let bayW = bayW0;
  let bayCount = Math.floor((width - minPier * 2) / bayW);
  if (bayCount < 1) {
    bayCount = 1;
    bayW = Math.max(18, width - minPier * 2);
  }
  const used = bayCount * bayW;
  const pier = Math.floor((width - used) / 2);
  return { bayCount, bayW, pier };
}

interface WindowFit {
  winH: number;
  sillH: number;
  /** 窗台下留给外机的高度。格子太矮时为 0 */
  sillAcH: number;
  head: number;
}

function fitWindow(cellH: number, wantSill: boolean): WindowFit {
  const sillH = 3;
  let sillAcH = wantSill ? 9 : 0;
  let winH = Math.min(18, cellH - 2 - sillH - sillAcH);
  if (winH < 12) {
    sillAcH = 0;
    winH = Math.min(18, cellH - 2 - sillH);
  }
  winH = Math.max(8, winH);
  const group = winH + sillH + sillAcH;
  const head = Math.max(2, Math.floor((cellH - group) / 2));
  return { winH, sillH, sillAcH, head };
}

function box(x: number, y: number, w: number, h: number): Rect {
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  };
}

/**
 * 把种子展开成开间方案。纯函数：同 spec 得到同一张方案。
 * 零件种类在量尺寸之前就定下来，所以只改宽度不会换一套窗框 / 招牌 / 砌法。
 */
export function composeFacade(spec: FacadeSpec): FacadePlan {
  const width = spec.width;
  const height = spec.height;
  const rng = mulberry32(spec.seed ^ 0x51ed0fac);
  const frame = pick(rng, FRAMES);
  const sign = pick(rng, SIGNS);
  let acMode = pick(rng, ACS);
  if (spec.style === 'glass') acMode = 'none';
  const bond = pick(rng, BONDS);
  const accent = pick(rng, ACCENTS);
  const jitter = (rng() - 0.5) * 0.16;
  const bayPick = pick(rng, BAYS);
  const doorT = rng();
  const signShift = rng();
  const bladeLeft = rng() < 0.5;

  const bands = layoutBands(height, sign);
  const { bayCount, bayW, pier } = layoutBays(width, bayPick);
  const fit = fitWindow(bands.floorH, acMode === 'sill');
  const sideSlot = acMode === 'side' ? 16 : 0;

  const openings: Opening[] = [];
  for (let floor = 0; floor < bands.floors; floor++) {
    const cellY = bands.floorTop + floor * bands.floorH;
    for (let bay = 0; bay < bayCount; bay++) {
      const cr = cellRand(spec.seed, bay, floor);
      const roll = cr();
      let kind: OpeningKind = 'window';
      if (spec.style !== 'glass') {
        if (roll < 0.1) kind = 'blank';
        else if (roll < 0.18) kind = 'vent';
        else if (roll < 0.32) kind = 'boarded';
      }
      if (bay === 0 && kind === 'blank') kind = 'window';
      if (bay === 0 && floor === bands.floors - 1 && kind === 'vent') kind = 'window';

      const lit = cr() > 0.8;
      const blind = !lit && cr() > 0.72;
      const bayX = pier + bay * bayW;

      if (kind === 'blank') {
        openings.push({ bay, floor, kind, lit: false, blind: false, hole: null, ac: null });
        continue;
      }

      let hole: Rect;
      if (spec.style === 'glass') {
        hole = box(bayX + 3, cellY + 3, bayW - 6, bands.floorH - 6);
      } else {
        const holeW = Math.max(8, bayW - 8 - sideSlot);
        const holeX = bayX + 4;
        const holeY = cellY + fit.head;
        hole = box(holeX, holeY, holeW, fit.winH);
      }

      let ac: Rect | null = null;
      const onBottom = floor === bands.floors - 1;
      const takeAc = onBottom && (bay === 0 || cr() < 0.38);
      if (acMode === 'sill' && fit.sillAcH > 0 && takeAc && kind !== 'vent') {
        const aw = Math.min(16, hole.w - 2);
        const ax = hole.x + Math.floor((hole.w - aw) / 2);
        ac = box(ax, hole.y + hole.h + fit.sillH, aw, fit.sillAcH);
      } else if (acMode === 'side' && takeAc && kind !== 'vent') {
        const acH = Math.min(14, hole.h);
        ac = box(hole.x + hole.w + 4, hole.y + hole.h - acH, 12, acH);
      }

      openings.push({ bay, floor, kind, lit, blind, hole, ac });
    }
  }

  let signRect: Rect | null = null;
  if (sign === 'blade') {
    const bw = 12;
    const bx = bladeLeft ? pier : pier + bayCount * bayW - bw;
    signRect = box(bx, bands.eaveH + 2, bw, bands.signH - 4);
  } else if (sign !== 'none') {
    const span = Math.max(1, Math.min(bayCount, Math.round(bayCount * 0.62) || 1));
    const startMax = bayCount - span;
    const start = Math.min(startMax, Math.floor(signShift * (startMax + 1)));
    signRect = box(pier + start * bayW, bands.eaveH + 3, span * bayW, bands.signH - 6);
  }

  let doorBay = bayCount <= 2 ? bayCount - 1 : 1 + Math.floor(doorT * (bayCount - 2));
  let garageStart = 0;
  let garageSpan = 0;
  if (spec.ground === 'garage') {
    garageSpan = Math.min(bayCount, bayCount >= 5 ? 3 : Math.max(1, bayCount - 1));
    garageStart = Math.floor((bayCount - garageSpan) / 2);
    if (garageStart > 0) doorBay = 0;
    else if (garageStart + garageSpan < bayCount) doorBay = bayCount - 1;
    else doorBay = -1;
  }
  if (spec.ground === 'blank') doorBay = -1;

  return {
    width,
    height,
    style: spec.style,
    ground: spec.ground,
    frame,
    sign,
    acMode,
    bond,
    wallColor: wallColorFor(spec.style, jitter),
    accent,
    pier,
    bayW,
    bayCount,
    floors: bands.floors,
    eaveH: bands.eaveH,
    signH: bands.signH,
    floorTop: bands.floorTop,
    floorH: bands.floorH,
    beltTop: bands.beltTop,
    beltH: bands.beltH,
    groundTop: bands.groundTop,
    signRect,
    doorBay,
    garageStart,
    garageSpan,
    openings,
  };
}

/* ============================================================
   绘制
   ============================================================ */

function ink(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const y = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
  return y > 150 ? 'rgba(28,24,20,0.82)' : 'rgba(244,240,230,0.88)';
}

function paintBrick(ctx: Ctx, plan: FacadePlan, seed: number): void {
  const mortar = shade(plan.wallColor, -0.42);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, plan.width, plan.height);
  const bh = 7;
  const bw = 13;
  for (let y = 0; y < plan.height; y += bh) {
    const row = Math.floor(y / bh);
    const off = plan.bond === 'running' && row % 2 === 1 ? 6 : 0;
    const faceH = Math.min(bh - 2, plan.height - y - 1);
    if (faceH <= 0) continue;
    for (let x = -bw + off; x < plan.width; x += bw) {
      const stain = hash01(seed, x + 17, y + 3);
      ctx.fillStyle = stain > 0.86 ? shade(plan.wallColor, 0.22) : stain < 0.08 ? shade(plan.wallColor, -0.28) : plan.wallColor;
      ctx.fillRect(x + 1, y + 1, bw - 3, faceH);
    }
  }
}

function paintConcrete(ctx: Ctx, plan: FacadePlan, seed: number): void {
  ctx.fillStyle = plan.wallColor;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.fillStyle = shade(plan.wallColor, -0.22);
  for (let y = plan.floorTop; y < plan.beltTop; y += plan.floorH) {
    ctx.fillRect(0, y, plan.width, 2);
  }
  for (let i = 0; i < 5; i++) {
    const t = hash01(seed, i, 9);
    const x = Math.floor(t * plan.width);
    ctx.fillStyle = 'rgba(28,26,22,0.22)';
    ctx.fillRect(x, plan.eaveH, 3 + Math.floor(hash01(seed, i, 4) * 8), plan.height - plan.eaveH);
  }
}

function paintStucco(ctx: Ctx, plan: FacadePlan, seed: number): void {
  ctx.fillStyle = plan.wallColor;
  ctx.fillRect(0, 0, plan.width, plan.height);
  const marks = [PAL.hudRed, PAL.hudGreen, PAL.hudYellow, PAL.brick, PAL.glass];
  const n = 3 + Math.floor(hash01(seed, 1, 1) * 3);
  for (let i = 0; i < n; i++) {
    const gx = Math.floor(hash01(seed, i, 2) * (plan.width - 20));
    const gy = plan.floorTop + Math.floor(hash01(seed, i, 3) * Math.max(1, plan.beltTop - plan.floorTop - 12));
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = marks[Math.floor(hash01(seed, i, 8) * marks.length)];
    ctx.fillRect(gx, gy, 14 + Math.floor(hash01(seed, i, 5) * 22), 5 + Math.floor(hash01(seed, i, 6) * 6));
    ctx.restore();
  }
}

function paintGlassWall(ctx: Ctx, plan: FacadePlan): void {
  ctx.fillStyle = plan.wallColor;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.fillStyle = shade(PAL.metalDeep, 0.2);
  ctx.fillRect(0, plan.floorTop, plan.width, 3);
}

function paintWall(ctx: Ctx, plan: FacadePlan, seed: number): void {
  if (plan.style === 'brick') paintBrick(ctx, plan, seed);
  else if (plan.style === 'concrete') paintConcrete(ctx, plan, seed);
  else if (plan.style === 'stucco') paintStucco(ctx, plan, seed);
  else paintGlassWall(ctx, plan);

  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  const count = Math.round((plan.width * plan.height) / 48);
  ctx.save();
  ctx.globalAlpha = plan.style === 'glass' ? 0.12 : 0.22;
  const a = shade(plan.wallColor, 0.3);
  const b = shade(plan.wallColor, -0.35);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng() > 0.5 ? a : b;
    ctx.fillRect(rng() * plan.width, rng() * plan.height, 1 + rng() * 2, 1 + rng());
  }
  ctx.restore();
}

function paintEave(ctx: Ctx, plan: FacadePlan): void {
  const g = ctx.createLinearGradient(0, 0, 0, plan.eaveH + 4);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, plan.width, plan.eaveH + 4);
  ctx.fillStyle = shade(plan.wallColor, -0.3);
  ctx.fillRect(0, plan.floorTop - 2, plan.width, 2);
}

function paintLetters(ctx: Ctx, rect: Rect, color: string, seed: number): void {
  ctx.fillStyle = color;
  const n = Math.max(3, Math.floor((rect.w - 8) / 14));
  let x = rect.x + 4;
  const top = rect.y + 3;
  const h = Math.max(4, rect.h - 6);
  for (let i = 0; i < n && x < rect.x + rect.w - 6; i++) {
    const lw = 4 + Math.floor(hash01(seed, i, rect.y) * 6);
    const lh = Math.max(4, h - Math.floor(hash01(seed, i, 3) * 3));
    ctx.fillRect(x, top + (h - lh), lw, lh);
    x += lw + 3;
  }
}

function paintSign(ctx: Ctx, plan: FacadePlan): void {
  const rect = plan.signRect;
  if (!rect || plan.sign === 'none') return;
  const accent = plan.accent;

  if (plan.sign === 'painted') {
    ctx.fillStyle = 'rgba(12,10,8,0.4)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    paintLetters(ctx, rect, accent, rect.x + rect.w);
    return;
  }

  if (plan.sign === 'blade') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
    ctx.fillStyle = accent;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = ink(accent);
    ctx.fillRect(rect.x + 2, rect.y + 3, rect.w - 4, 2);
    ctx.fillRect(rect.x + 2, rect.y + 7, rect.w - 5, 2);
    return;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(rect.x + 2, rect.y + 3, rect.w, rect.h);
  if (plan.sign === 'marquee') {
    ctx.fillStyle = shade(PAL.signBoard, 0.05);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = accent;
    ctx.fillRect(rect.x, rect.y, rect.w, 3);
    const bulbs = Math.max(2, Math.floor((rect.w - 6) / 6));
    for (let i = 0; i < bulbs; i++) {
      const on = hash01(plan.width, i, rect.x) > 0.25;
      ctx.fillStyle = on ? PAL.hudYellow : shade(PAL.metalDeep, 0.15);
      ctx.fillRect(rect.x + 4 + i * 6, rect.y + rect.h - 6, 3, 3);
    }
    return;
  }

  ctx.fillStyle = shade(accent, -0.15);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, 1);
  paintLetters(ctx, rect, ink(accent), rect.w);
}

function paintAc(ctx: Ctx, ac: Rect | null): void {
  if (!ac) return;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(ac.x + 1, ac.y + 2, ac.w, ac.h);
  ctx.fillStyle = PAL.metalDark;
  ctx.fillRect(ac.x, ac.y, ac.w, ac.h);
  ctx.fillStyle = PAL.metal;
  ctx.fillRect(ac.x + 1, ac.y + 1, ac.w - 2, ac.h - 2);
  ctx.fillStyle = PAL.metalDeep;
  const slats = Math.max(2, Math.floor((ac.h - 4) / 3));
  for (let i = 0; i < slats; i++) {
    ctx.fillRect(ac.x + 2, ac.y + 2 + i * 3, ac.w - 4, 1);
  }
}

function paintOpening(ctx: Ctx, plan: FacadePlan, op: Opening): void {
  const hole = op.hole;
  if (!hole) return;

  if (plan.style === 'glass') {
    ctx.fillStyle = op.lit ? shade(PAL.hudYellow, -0.2) : shade(PAL.glass, -0.42);
    ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
    ctx.fillStyle = 'rgba(210,225,235,0.14)';
    ctx.fillRect(hole.x + 1, hole.y + 1, Math.floor(hole.w * 0.35), hole.h - 2);
    return;
  }

  if (op.kind === 'vent') {
    ctx.fillStyle = shade(PAL.metalDeep, 0.12);
    ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let y = hole.y + 2; y < hole.y + hole.h - 1; y += 4) ctx.fillRect(hole.x + 1, y, hole.w - 2, 2);
    return;
  }

  if (op.kind === 'boarded') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(hole.x - 2, hole.y - 2, hole.w + 4, hole.h + 4);
    ctx.fillStyle = shade(PAL.roof, 0.02);
    ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
    ctx.fillStyle = shade(PAL.roofDark, 0.05);
    for (let y = hole.y + 2; y < hole.y + hole.h - 1; y += 5) ctx.fillRect(hole.x, y, hole.w, 2);
    ctx.fillStyle = shade(PAL.concrete, -0.08);
    ctx.fillRect(hole.x - 2, hole.y + hole.h + 1, hole.w + 4, 2);
    paintAc(ctx, op.ac);
    return;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(hole.x - 2, hole.y - 2, hole.w + 4, hole.h + 4);
  ctx.fillStyle = shade(PAL.metal, 0.12);
  ctx.fillRect(hole.x - 1, hole.y - 1, hole.w + 2, hole.h + 2);
  const glass = op.lit ? shade(PAL.hudYellow, -0.05) : shade(PAL.glass, -0.25);
  ctx.fillStyle = glass;
  ctx.fillRect(hole.x + 2, hole.y + 2, hole.w - 4, hole.h - 4);
  if (op.blind) {
    ctx.fillStyle = 'rgba(236,232,220,0.62)';
    ctx.fillRect(hole.x + 2, hole.y + 2, hole.w - 4, Math.floor((hole.h - 4) * 0.42));
  } else if (!op.lit) {
    ctx.fillStyle = 'rgba(220,235,245,0.2)';
    ctx.fillRect(hole.x + 3, hole.y + 3, Math.max(2, Math.floor((hole.w - 6) * 0.4)), hole.h - 6);
  }
  ctx.fillStyle = shade(PAL.metal, 0.28);
  if (plan.frame === 'cross' || plan.frame === 'double') {
    const mx = hole.x + Math.floor(hole.w / 2);
    ctx.fillRect(mx, hole.y + 2, 2, hole.h - 4);
  }
  if (plan.frame === 'cross') {
    const my = hole.y + Math.floor(hole.h / 2);
    ctx.fillRect(hole.x + 2, my, hole.w - 4, 2);
  }
  ctx.fillStyle = shade(PAL.concrete, -0.05);
  ctx.fillRect(hole.x - 2, hole.y + hole.h + 1, hole.w + 4, 2);
  paintAc(ctx, op.ac);
}

function paintBelt(ctx: Ctx, plan: FacadePlan): void {
  ctx.fillStyle = shade(PAL.concrete, 0.08);
  ctx.fillRect(0, plan.beltTop, plan.width, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, plan.beltTop + 2, plan.width, plan.beltH - 2);
}

function paintGround(ctx: Ctx, plan: FacadePlan): void {
  const top = plan.groundTop;
  const gh = plan.height - top;
  const { pier, bayW, bayCount } = plan;

  if (plan.ground !== 'blank') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, top, plan.width, gh);
  }

  const bayBox = (bay: number, inset: number) => {
    const x = pier + bay * bayW + inset;
    return { x, w: bayW - inset * 2 };
  };

  if (plan.ground === 'shop') {
    const awningH = Math.min(10, Math.floor(gh * 0.3));
    const x0 = pier;
    const aw = bayCount * bayW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, aw, awningH);
    ctx.clip();
    for (let x = x0; x < x0 + aw; x += 8) {
      ctx.fillStyle = (x - x0) % 16 === 0 ? plan.accent : PAL.white;
      ctx.fillRect(x, top, 8, awningH);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x0, top + awningH, aw, 3);

    for (let bay = 0; bay < bayCount; bay++) {
      const { x, w } = bayBox(bay, 3);
      const y = top + awningH + 4;
      const h = plan.height - y - 3;
      if (h < 6) continue;
      if (bay === plan.doorBay) {
        ctx.fillStyle = shade(plan.accent, -0.45);
        ctx.fillRect(x + 2, y, w - 4, h);
        ctx.fillStyle = shade(PAL.glass, -0.35);
        ctx.fillRect(x + 5, y + 2, w - 10, Math.floor(h * 0.36));
        ctx.fillStyle = PAL.hudYellow;
        ctx.fillRect(x + w - 8, y + Math.floor(h * 0.55), 2, 4);
      } else {
        ctx.fillStyle = shade(PAL.metal, 0.05);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = shade(PAL.glass, -0.3);
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.fillStyle = 'rgba(220,235,245,0.16)';
        ctx.fillRect(x + 3, y + 3, Math.floor((w - 6) * 0.4), h - 6);
      }
    }
    return;
  }

  if (plan.ground === 'garage') {
    const x = pier + plan.garageStart * bayW + 2;
    const w = plan.garageSpan * bayW - 4;
    const y = top + 4;
    const h = gh - 7;
    ctx.fillStyle = shade(PAL.metal, -0.18);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let yy = y + 3; yy < y + h - 2; yy += 5) ctx.fillRect(x + 2, yy, w - 4, 2);
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (plan.doorBay >= 0) {
      const door = bayBox(plan.doorBay, 8);
      ctx.fillStyle = shade(PAL.metalDeep, 0.15);
      ctx.fillRect(door.x, y, door.w, h);
      ctx.fillStyle = PAL.hudYellow;
      ctx.fillRect(door.x + door.w - 4, y + Math.floor(h * 0.55), 2, 3);
    }
    return;
  }

  if (plan.ground === 'door') {
    for (let bay = 0; bay < bayCount; bay++) {
      const { x, w } = bayBox(bay, 4);
      if (bay === plan.doorBay) {
        const y = top + 4;
        const h = gh - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 2, y - 2, w + 4, h + 3);
        ctx.fillStyle = shade(PAL.metalDeep, 0.18);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = shade(PAL.glass, -0.32);
        ctx.fillRect(x + 3, y + 3, w - 6, Math.floor(h * 0.4));
        ctx.fillStyle = PAL.hudYellow;
        ctx.fillRect(x + w - 6, y + Math.floor(h * 0.6), 2, 4);
        ctx.fillStyle = shade(PAL.sidewalk, -0.1);
        ctx.fillRect(x - 3, plan.height - 4, w + 6, 4);
      } else {
        const wh = Math.min(14, gh - 12);
        const y = top + 6;
        ctx.fillStyle = shade(PAL.metalDeep, 0.1);
        ctx.fillRect(x, y, w, wh);
        ctx.fillStyle = shade(PAL.glass, -0.2);
        ctx.fillRect(x + 2, y + 2, w - 4, wh - 4);
      }
    }
    return;
  }

  for (let i = 0; i < 3; i++) {
    const t = hash01(plan.width + 3, i, 11);
    const pw = 8 + Math.floor(hash01(i, plan.bayW, 2) * 10);
    const ph = 6 + Math.floor(hash01(i, plan.floors, 3) * 7);
    const px = pier + Math.floor(t * Math.max(1, bayCount * bayW - pw));
    const py = top + 4 + Math.floor(hash01(i, 6, plan.pier) * Math.max(1, gh - ph - 8));
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = [PAL.white, PAL.hudYellow, PAL.hudRed][i % 3];
    ctx.fillRect(px, py, pw, ph);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, plan.height - 5, plan.width, 5);
}

function paintEdges(ctx: Ctx, plan: FacadePlan): void {
  const g = ctx.createLinearGradient(0, plan.height - 6, 0, plan.height);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, plan.height - 6, plan.width, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 2, plan.height);
  ctx.fillRect(plan.width - 2, 0, 2, plan.height);
}

/** 把一段立面画到 ctx 上（原点 = 立面左上角） */
export function paintFacade(ctx: Ctx, spec: FacadeSpec): void {
  const plan = composeFacade(spec);
  ctx.clearRect(0, 0, plan.width, plan.height);
  paintWall(ctx, plan, spec.seed);
  paintEave(ctx, plan);
  paintSign(ctx, plan);
  for (let floor = 1; floor < plan.floors; floor++) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, plan.floorTop + floor * plan.floorH, plan.width, 2);
  }
  for (const op of plan.openings) paintOpening(ctx, plan, op);
  paintBelt(ctx, plan);
  paintGround(ctx, plan);
  paintEdges(ctx, plan);
}
