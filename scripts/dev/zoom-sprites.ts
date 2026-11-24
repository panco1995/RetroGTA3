/**
 * 素材放大检查工具（开发期用）
 *
 *   node scripts/dev/zoom-sprites.ts [目录] [缩放倍数]
 *
 * 把某个目录下的 PNG 拼成一张放大对比图，方便肉眼核对精灵图细节。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdir, writeFile, mkdir } from 'node:fs/promises';

const dir = process.argv[2] ?? 'public/assets/proc/tiles';
const S = Number(process.argv[3] ?? 3);
const out = process.argv[4] ?? '/tmp/sprites_zoom.png';

const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
if (!files.length) {
  console.log(`目录里没有 PNG: ${dir}`);
  process.exit(1);
}

const imgs = await Promise.all(files.map((f) => loadImage(`${dir}/${f}`)));
const cols = Math.min(3, files.length);
const rows = Math.ceil(files.length / cols);
const cellW = Math.max(...imgs.map((i) => i.width)) * S + 24;
const cellH = Math.max(...imgs.map((i) => i.height)) * S + 24;

const c = createCanvas(cellW * cols, cellH * rows);
const ctx = c.getContext('2d');
ctx.fillStyle = '#2a2f36';
ctx.fillRect(0, 0, c.width, c.height);

for (let i = 0; i < imgs.length; i++) {
  const img = imgs[i];
  const x = (i % cols) * cellW + 12;
  const y = Math.floor(i / cols) * cellH + 12;
  ctx.drawImage(img, x, y, img.width * S, img.height * S);
}

await mkdir('/tmp', { recursive: true });
await writeFile(out, c.toBuffer('image/png'));
console.log(`✓ ${files.length} 张 → ${out} (${c.width}x${c.height})`);
console.log(`  ${files.join(', ')}`);
