/**
 * 立面零件预览（人工核对）
 *
 *   node scripts/dev/preview-facades.ts [输出路径]
 *
 * 每一行是同一个种子、四种宽度：开间变多，窗框 / 砖缝 / 招牌 / 空调机位不变。
 * 换行就是换一套零件。
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer } from 'vite';
import type { FacadePlan, FacadeSpec } from '../../src/city/facade-draw.ts';

// src 里的 import 不带扩展名，给 Vite 用。这里走 SSR 加载，node 才能直接跑。
const vite = await createServer({
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});
const draw = await vite.ssrLoadModule('/src/city/facade-draw.ts');
await vite.close();

const composeFacade = draw.composeFacade as (spec: FacadeSpec) => FacadePlan;
const facadeSpec = draw.facadeSpec as (width: number, height: number, seed: number) => FacadeSpec;
const paintFacade = draw.paintFacade as (ctx: CanvasRenderingContext2D, spec: FacadeSpec) => void;
const pickWallHeight = draw.pickWallHeight as (seed: number) => number;

const out = process.argv[2] ?? 'tmp/facade-preview.png';
const widths = [240, 300, 380, 460];
const seeds = [1, 2, 3, 4, 5, 6];
const scale = 2;
const pad = 16;
const labelH = 22;

const rowH = Math.max(...seeds.map((seed) => pickWallHeight(seed))) * scale + labelH + pad;
const rowW = widths.reduce((sum, w) => sum + w * scale + pad, pad);
const canvas = createCanvas(rowW, seeds.length * rowH + pad);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a1d22';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.imageSmoothingEnabled = false;
ctx.font = '14px sans-serif';
ctx.fillStyle = '#d9d3c5';

for (let row = 0; row < seeds.length; row++) {
  const seed = seeds[row];
  const height = pickWallHeight(seed);
  let x = pad;
  const y = pad + row * rowH;
  for (const width of widths) {
    const spec = facadeSpec(width, height, seed);
    const plan = composeFacade(spec);
    const tile = createCanvas(spec.width, spec.height);
    paintFacade(tile.getContext('2d') as unknown as CanvasRenderingContext2D, spec);
    ctx.drawImage(tile, x, y + labelH, spec.width * scale, spec.height * scale);
    ctx.fillStyle = '#d9d3c5';
    ctx.fillText(
      `${plan.style} ${plan.frame} ${plan.sign} ${plan.acMode} ${plan.bond} ×${plan.bayCount}`,
      x,
      y + 14,
    );
    x += spec.width * scale + pad;
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, canvas.toBuffer('image/png'));
console.log(out);
