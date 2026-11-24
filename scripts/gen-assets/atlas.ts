/**
 * 精灵图打包 —— 全部 PNG 合成一张 atlas.png + Phaser 格式 atlas.json
 *
 * 为什么打包而不是逐个加载：
 *   1 个 texture bind 而不是 62 个，WebGL 切换开销小得多
 *   Phaser 里写法统一：this.add.image(x, y, 'proc', 'actors/head')
 */
import { createCanvas } from '@napi-rs/canvas';

export interface AtlasEntry {
  name: string;
  canvas: any;
}

export interface PackedFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

function pow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** 货架式装箱（shelf packing）：按高度排序，逐行摆放 */
export function packAtlas(entries: AtlasEntry[], padding = 2, maxSize = 2048) {
  const sorted = [...entries].sort((a, b) => b.canvas.height - a.canvas.height);
  let x = padding;
  let y = padding;
  let rowH = 0;
  const placed: { e: AtlasEntry; x: number; y: number }[] = [];

  for (const e of sorted) {
    const w = e.canvas.width;
    const h = e.canvas.height;
    if (x + w + padding > maxSize) {
      x = padding;
      y += rowH + padding;
      rowH = 0;
    }
    if (y + h + padding > maxSize) {
      throw new Error(`图集超过 ${maxSize}x${maxSize}，需要拆分或调小素材`);
    }
    placed.push({ e, x, y });
    x += w + padding;
    rowH = Math.max(rowH, h);
  }

  const usedW = Math.max(...placed.map((p) => p.e.canvas.width + p.x)) + padding;
  const usedH = y + rowH + padding;
  const W = pow2(usedW);
  const H = pow2(usedH);

  const atlas = createCanvas(W, H);
  const ctx = atlas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const frames: PackedFrame[] = [];
  for (const p of placed) {
    const { canvas } = p.e;
    ctx.drawImage(canvas, p.x, p.y);
    frames.push({
      filename: p.e.name,
      frame: { x: p.x, y: p.y, w: canvas.width, h: canvas.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: canvas.width, h: canvas.height },
      sourceSize: { w: canvas.width, h: canvas.height },
    });
  }

  // 帧名排序，输出稳定（同样的输入 → 同样的文件）
  frames.sort((a, b) => a.filename.localeCompare(b.filename));

  const json = {
    frames,
    meta: {
      app: 'RetroGTA3 gen-assets',
      version: '1.0',
      image: 'atlas.png',
      format: 'RGBA8888',
      size: { w: W, h: H },
      scale: '1',
    },
  };

  return { atlas, json };
}
