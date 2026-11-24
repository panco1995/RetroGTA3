/**
 * RetroGTA3 程序化素材生成器 — 核心工具
 *
 * 全部资源由代码在本地算出，零外部额度依赖（不需要 AI 生图 / 3D 服务 / 素材站）。
 * 输出 PNG 精灵图 + atlas.json，Phaser 可直接加载。
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type Ctx = any;

/**
 * 固定调色板（32 色）—— 全项目唯一事实源。
 * 改这里 = 全场换肤。所有生成器只允许从这里取色。
 */
export const PAL = {
  asphaltDark: '#262a2f',
  asphalt: '#363b42',
  asphaltLight: '#474d55',
  concrete: '#6f6a5e',
  sidewalk: '#827c6e',
  curb: '#9a9384',
  grassDark: '#37522b',
  grass: '#4a6c3a',
  grassLight: '#5c8048',
  waterDark: '#1f4763',
  water: '#2b5f80',
  sandDark: '#9c8759',
  sand: '#bfa675',
  roofDark: '#403c35',
  roof: '#565045',
  brick: '#7b4a3c',
  glass: '#7fa6bb',
  outline: '#15171a',
  skin: '#c08a60',
  hair: '#33241b',
  cloth: '#5f7183',
  carRed: '#ab3a33',
  carBlue: '#2d5894',
  carYellow: '#d6a32e',
  carGreen: '#3b7844',
  carWhite: '#d3d0c7',
  carBlack: '#26262a',
  carSilver: '#959aa0',
  white: '#f2f0ea',
  hudGreen: '#7edc85',
  hudRed: '#d8493e',
  hudYellow: '#e9c24a',
} as const;

export const CAR_COLORS: string[] = [
  PAL.carRed,
  PAL.carBlue,
  PAL.carYellow,
  PAL.carGreen,
  PAL.carWhite,
  PAL.carBlack,
  PAL.carSilver,
];

/* ------------------------------------------------------------------ */
/* 随机数 / 噪声                                                       */
/* ------------------------------------------------------------------ */

/** 确定性 PRNG：同一个 seed 永远生成同一张图（可复现 = 可批量调参） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 无缝包裹绘制：图案在 9 个偏移处重复绘制，跨边界处自然接续 */
export function wrapDraw(ctx: Ctx, w: number, h: number, fn: (dx: number, dy: number) => void) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) fn(dx, dy);
  }
}

/* ------------------------------------------------------------------ */
/* 颜色 / 形状工具                                                     */
/* ------------------------------------------------------------------ */

/** 明暗调整：amt > 0 变亮，amt < 0 变暗 */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 圆角矩形路径（不填充、不描边） */
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function fillRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** 带描边的圆角矩形：游戏里的小尺寸物件靠这圈暗边保证可读性 */
export function outlineRR(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke = PAL.outline,
  lw = 3,
) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export function ellipse(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  stroke?: string,
  lw = 3,
) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** 软投影：椭圆 + 透明度递减，代替 filter blur（更可控、无依赖） */
export function dropShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.28) {
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + i * 2, ry + i * 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(10,12,15,${(alpha / i) * 0.45})`;
    ctx.fill();
  }
}

/** 颗粒噪点：给大片色块加质感，避免"塑料感" */
export function grain(
  ctx: Ctx,
  w: number,
  h: number,
  rng: () => number,
  opts: { count: number; colors: string[]; sizeMin?: number; sizeMax?: number; alpha?: number },
) {
  const sizeMin = opts.sizeMin ?? 1;
  const sizeMax = opts.sizeMax ?? 3;
  const alpha = opts.alpha ?? 0.5;
  for (let i = 0; i < opts.count; i++) {
    const s = sizeMin + rng() * (sizeMax - sizeMin);
    ctx.fillStyle = opts.colors[Math.floor(rng() * opts.colors.length)];
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 细裂纹/划痕 */
export function cracks(
  ctx: Ctx,
  w: number,
  h: number,
  rng: () => number,
  count: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    let x = rng() * w;
    let y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < segs; s++) {
      x += (rng() - 0.5) * 26;
      y += (rng() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.35 + rng() * 0.3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

export interface Frame {
  frame: string;
  file: string;
  w: number;
  h: number;
  ox?: number;
  oy?: number;
}

export class AssetWriter {
  frames: Frame[] = [];
  root: string;

  constructor(root: string) {
    this.root = root;
  }

  async save(name: string, canvas: any, ox?: number, oy?: number): Promise<void> {
    const file = `${name}.png`;
    const path = `${this.root}/${file}`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, canvas.toBuffer('image/png'));
    this.frames.push({
      frame: name,
      file,
      w: canvas.width,
      h: canvas.height,
      ox: ox ?? Math.floor(canvas.width / 2),
      oy: oy ?? Math.floor(canvas.height / 2),
    });
  }
}

export function newCanvas(w: number, h: number) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}
