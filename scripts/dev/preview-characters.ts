/**
 * 角色素材预览图（人工核对 / 存档用）
 *
 *   node scripts/dev/preview-characters.ts [输出路径]
 *
 * 把烘焙出来的 8 方向精灵图和 NPC 换色变体拼成一张大图：
 *   上半部分 = 主角色 walk 的 8 方向 × 8 帧（带方向标注）
 *   下半部分 = 6 个 NPC 变体的正面 / 侧面（带名字标注）
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BAKED = 'assets-src/baked';
const CELL = 96;
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const NPCS = ['worker', 'punk', 'lady', 'jogger', 'oldman', 'cop'];

const out = process.argv[2] ?? 'docs/preview-characters.png';
const Z = 1; // 单元放大倍数
const PAD = 14;
const LABEL_H = 22;

const walk = await loadImage(`${BAKED}/walk.png`);

/* ---- 上半：8 方向 × 8 帧 ---- */
const gridW = CELL * 8 * Z + PAD;
const gridH = CELL * 8 * Z + PAD + LABEL_H;

const npcImg = await Promise.all(NPCS.map((id) => loadImage(`${BAKED}/npc/${id}/walk.png`)));

const width = gridW + PAD;
const height = LABEL_H * 2 + gridH + LABEL_H + CELL * Z + PAD * 2 + LABEL_H + 40;

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

/* 标题 */
label('烘焙角色 · 8 方向 × 8 帧（行 = 方向 N→NW 顺时针，列 = 帧）', PAD, 22, 17, '#dfe4ea');

const gx = PAD;
const gy = LABEL_H + 16;
for (let d = 0; d < 8; d++) {
  for (let f = 0; f < 8; f++) {
    ctx.drawImage(
      walk,
      f * CELL,
      d * CELL,
      CELL,
      CELL,
      gx + f * CELL * Z,
      gy + d * CELL * Z,
      CELL * Z,
      CELL * Z,
    );
  }
  label(DIRS[d], gx + 4, gy + d * CELL * Z + 14, 13, '#e9c24a');
}

/* NPC 行 */
const ny = gy + CELL * 8 * Z + LABEL_H + 24;
label('NPC 变体（同个 3D 模型，贴图换色 → 不同的人）', PAD, ny - 8, 17, '#dfe4ea');
NPCS.forEach((id, i) => {
  const x = PAD + i * (CELL * Z + PAD / 2);
  ctx.drawImage(npcImg[i], 0, 4 * CELL, CELL, CELL, x, ny, CELL * Z, CELL * Z);
  ctx.drawImage(npcImg[i], 0, 2 * CELL, CELL, CELL, x, ny + CELL * Z + 4, CELL * Z, CELL * Z);
  label(id, x + 2, ny + CELL * Z * 2 + 20, 13, '#7edc85');
});

await mkdir(dirname(out), { recursive: true });
await writeFile(out, canvas.toBuffer('image/png'));
console.log(`✓ 角色预览图 → ${out} (${width}x${height})`);
