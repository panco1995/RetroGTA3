/**
 * 街区布局核对图（人工审查用）
 *
 *   node scripts/dev/preview-district.ts [输出路径]
 *
 * 画出完整俯视布局：马路、人行道、地块、建筑（按朝向着色）、
 * 出生点和行人落脚点。改生成器参数时先看这张图，比进游戏里快得多。
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer } from 'vite';

// src 里的 import 不带扩展名，给 Vite 用。这里走 SSR 加载，node 才能直接跑。
const vite = await createServer({
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});
const mod = await vite.ssrLoadModule('/src/city/CityGenerator.ts');
await vite.close();

const generateDistrict = mod.generateDistrict as (opts?: Record<string, unknown>) => {
  bounds: { x: number; y: number; w: number; h: number };
  streets: { axis: 'v' | 'h'; pos: number; half: number; major: boolean; edge?: boolean }[];
  lots: { x: number; y: number; w: number; h: number; facing: string; buildings: unknown[] }[];
  spawn: { player: { x: number; y: number }; car: { x: number; y: number } };
  walkers: { x: number; y: number }[];
};

const out = process.argv[2] ?? 'tmp/district-preview.png';
const district = generateDistrict();
const streets = district.streets.filter((s) => !s.edge);

const { bounds } = district;
const scale = 0.28;
const W = Math.round(bounds.w * scale);
const H = Math.round(bounds.h * scale);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

/** 世界坐标 → 画布坐标 */
const px = (x: number) => Math.round((x - bounds.x) * scale);
const py = (y: number) => Math.round((y - bounds.y) * scale);

ctx.fillStyle = '#1a1d22';
ctx.fillRect(0, 0, W, H);

// 街区地面
ctx.fillStyle = '#2a2e34';
ctx.fillRect(0, 0, W, H);

// 马路
for (const s of streets) {
  ctx.fillStyle = s.major ? '#3c4249' : '#363b42';
  if (s.axis === 'v') {
    ctx.fillRect(px(s.pos - s.half), 0, Math.max(1, s.half * 2 * scale), H);
  } else {
    ctx.fillRect(0, py(s.pos - s.half), W, Math.max(1, s.half * 2 * scale));
  }
}

// 人行道（街两侧各一条）
const sw = 62 * scale;
for (const s of streets) {
  ctx.fillStyle = '#6f6a5e';
  if (s.axis === 'v') {
    ctx.fillRect(px(s.pos - s.half - 62), 0, sw, H);
    ctx.fillRect(px(s.pos + s.half), 0, sw, H);
  } else {
    ctx.fillRect(0, py(s.pos - s.half - 62), W, sw);
    ctx.fillRect(0, py(s.pos + s.half), W, sw);
  }
}

// 地块轮廓
ctx.strokeStyle = 'rgba(126,220,133,0.35)';
ctx.lineWidth = 1;
for (const lot of district.lots) {
  ctx.strokeRect(px(lot.x), py(lot.y), lot.w * scale, lot.h * scale);
}

// 建筑：按朝向着色，临街的实心、街区内侧的半透明
const FACE_COLOR: Record<string, string> = {
  n: '#7fa6bb',
  s: '#e9c24a',
  e: '#d8493e',
  w: '#7edc85',
};
for (const lot of district.lots) {
  for (const b of lot.buildings as { x: number; y: number; w: number; d: number; facing: string | null }[]) {
    if (b.facing) {
      ctx.fillStyle = FACE_COLOR[b.facing] ?? '#ffffff';
      ctx.fillRect(px(b.x), py(b.y), b.w * scale, b.d * scale);
    } else {
      ctx.fillStyle = 'rgba(140,140,150,0.5)';
      ctx.fillRect(px(b.x), py(b.y), b.w * scale, b.d * scale);
    }
  }
}

// 出生点
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(px(district.spawn.player.x), py(district.spawn.player.y), 4, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#d8493e';
ctx.beginPath();
ctx.arc(px(district.spawn.car.x), py(district.spawn.car.y), 4, 0, Math.PI * 2);
ctx.fill();

// 行人落脚点
ctx.fillStyle = '#7edc85';
for (const w of district.walkers) {
  ctx.fillRect(px(w.x) - 2, py(w.y) - 2, 4, 4);
}

// 图例
const legend: [string, string][] = [
  ['#e9c24a', '临街朝南'],
  ['#7fa6bb', '临街朝北'],
  ['#d8493e', '临街朝东'],
  ['#7edc85', '临街朝西'],
  ['rgba(140,140,150,0.5)', '街区内侧（无立面）'],
  ['#ffffff', '玩家出生点'],
  ['#d8493e', '车辆出生点'],
];
ctx.font = '11px sans-serif';
let ly = 14;
for (const [color, label] of legend) {
  ctx.fillStyle = color;
  ctx.fillRect(8, ly - 8, 9, 9);
  ctx.fillStyle = '#dfe4ea';
  ctx.fillText(label, 22, ly);
  ly += 14;
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, canvas.toBuffer('image/png'));
console.log(
  `${out}  ${W}x${H}  街 ${streets.length} 条 / 地块 ${district.lots.length} 块 / ` +
    `楼 ${district.lots.reduce((n, l) => n + l.buildings.length, 0)} 栋 / 行人 ${district.walkers.length}`,
);
