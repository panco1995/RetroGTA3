/**
 * 车辆素材预览图（人工核对 / 存档用）
 *
 *   node scripts/dev/preview-vehicles.ts [输出路径]
 *
 * 把烘焙出来的 8 款车拼成一张大图，每款车展示 4 个正交方向：
 *   k=0 东 / k=8 南 / k=16 西 / k=24 北
 *
 * 用途是肉眼复核「车头朝向对不对」——
 * 车头朝东时车头应该在右边，朝南时（正对镜头）应该能看到黄色前大灯。
 * 烘焙脚本 tools/bake/bake-vehicles.ts 里已经把这个做成了自动断言，
 * 这张图是给人看的第二道保险。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';

const BAKED = 'assets-src/baked/vehicles';
const out = process.argv[2] ?? 'docs/preview-cars.png';

/**
 * 单元尺寸 / 方向数 / 网格列数全部从 manifest 读。
 * 这些值是烘焙脚本按「所有车型的投影范围」算出来的，不是常量 ——
 * 车型表一变就变，写死会静默错位。
 */
const manifest = JSON.parse(await readFile(`${BAKED}/manifest.json`, 'utf8')) as {
  cell: number;
  angles: number;
  cols: number;
  cars: { id: string }[];
};
const CELL = manifest.cell;
const ANGLES = manifest.angles;
const COLS = manifest.cols;
const CAR_LIST = manifest.cars.map((c) => c.id);

/** 要展示的方向帧（顺时针：东 南 西 北） */
const PICKS = [0, ANGLES / 4, ANGLES / 2, (ANGLES * 3) / 4];
const DIR_LABELS = ['东 E', '南 S', '西 W', '北 N'];

const Z = 1; // 单元放大倍数
const PAD = 14;
const LABEL_H = 22;
const ROW_GAP = 10;

const width = CELL * PICKS.length * Z + PAD * 2 + 70;
const rowH = CELL * Z + LABEL_H + ROW_GAP;
const height = LABEL_H + 16 + CAR_LIST.length * rowH + PAD;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1b1f25';
ctx.fillRect(0, 0, width, height);

let textOK = true;
try {
  ctx.font = '16px sans-serif';
  textOK = ctx.measureText('A').width > 0;
} catch {
  textOK = false;
}
function label(text: string, x: number, y: number, size = 15, color = '#8d95a1') {
  if (!textOK) return;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

label(
  `烘焙车辆 · ${CAR_LIST.length} 款 × ${ANGLES} 方向（每行展示 4 个正交方向：东 南 西 北）`,
  PAD,
  22,
  17,
  '#dfe4ea',
);

const gx = PAD + 70;
const gy = LABEL_H + 16;

for (let i = 0; i < CAR_LIST.length; i++) {
  const id = CAR_LIST[i];
  const img = await loadImage(`${BAKED}/${id}.png`);
  const ry = gy + i * rowH;

  for (let p = 0; p < PICKS.length; p++) {
    const k = PICKS[p];
    const col = k % COLS;
    const row = Math.floor(k / COLS);
    const dx = gx + p * CELL * Z;
    ctx.drawImage(
      img,
      col * CELL,
      row * CELL,
      CELL,
      CELL,
      dx,
      ry,
      CELL * Z,
      CELL * Z,
    );
    label(DIR_LABELS[p], dx + 4, ry + CELL * Z + 14, 12, '#e9c24a');
  }
  label(id, PAD, ry + CELL * Z / 2 + 4, 14, '#7edc85');
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, canvas.toBuffer('image/png'));
console.log(`✓ 车辆预览图 → ${out} (${width}x${height})`);
