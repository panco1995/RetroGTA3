/**
 * RetroGTA3 素材生成入口
 *
 *   node scripts/gen-assets/index.ts
 *
 * 产出：
 *   public/assets/proc/ 下所有 PNG   精灵图（2x 高清）
 *   public/assets/proc/atlas.json    图集元数据
 *   public/assets/proc/preview.png   素材总览图（人工核对用）
 */
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AssetWriter, newCanvas, PAL } from './core.ts';
import { packAtlas } from './atlas.ts';
import { TILE_BUILDERS, TILE_OVERLAYS } from './tiles.ts';
import {
  acUnit,
  bench,
  buildingSide,
  cone,
  hydrant,
  mailbox,
  newsstand,
  roof,
  roofSurface,
  streetlight,
  trashcan,
  tree,
  waterTower,
} from './props.ts';

const OUT = 'public/assets/proc';
const writer = new AssetWriter(OUT);

// 生成前先清空整个输出目录。
// 之前只清了 baked/ 子目录，结果删掉的生成器（比如程序化角色/车辆）留下的旧 PNG
// 会一直躺在 public 里 —— 没人引用、占体积、还容易让人以为还在用。
// 整个目录都是可重建的产物，清空最省心。
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

/* 收集到总览图用的条目 */
const sheetItems: { group: string; label: string; canvas: any; scale: number }[] = [];
/* 收集到图集打包用的条目 */
const atlasEntries: { name: string; canvas: any }[] = [];

async function emit(name: string, canvas: any, group: string, label: string, scale = 1) {
  await writer.save(name, canvas);
  sheetItems.push({ group, label, canvas, scale });
  atlasEntries.push({ name, canvas });
}

/* ---------------- 1. 地面瓦片 ---------------- */
let seed = 1000;
for (const [type, builder] of Object.entries(TILE_BUILDERS)) {
  for (let v = 0; v < 4; v++) {
    await emit(`tiles/${type}_${v}`, builder(seed++), '地面瓦片', type, 0.55);
  }
}
for (const [name, builder] of Object.entries(TILE_OVERLAYS)) {
  await emit(`tiles/${name}`, builder(), '地面瓦片', name, 0.55);
}

/* ---------------- 2. 道具 ---------------- */
const propList: [string, () => any][] = [
  ['streetlight', streetlight],
  ['trashcan', trashcan],
  ['tree', tree],
  ['cone', cone],
  ['hydrant', hydrant],
  ['bench', bench],
  ['mailbox', mailbox],
  ['newsstand', newsstand],
];
for (const [name, fn] of propList) {
  await emit(`props/${name}`, fn(), '道具', name);
}

/* ---------------- 5. 建筑 ---------------- */
for (let i = 0; i < 6; i++) {
  await emit(`buildings/roof_${i}`, roof(i), '建筑', `roof_${i}`, 0.8);
  await emit(`buildings/side_${i}`, buildingSide(i), '建筑', `side_${i}`, 0.8);
}
for (let i = 0; i < 3; i++) {
  await emit(`buildings/roof_surface_${i}`, roofSurface(i), '建筑', `roof_surface_${i}`, 0.8);
}
await emit('props/ac_unit', acUnit(), '道具', 'ac_unit');
await emit('props/water_tower', waterTower(), '道具', 'water_tower');

/* ---------------- 6. 烘焙产物（3D → 2D 烘焙） ---------------- */
/**
 * 烘焙管线（tools/bake/）的产物：8 方向角色精灵图 + 32 方向载具精灵图。
 * 这些是「源资产」，不像地面瓦片那样能靠种子重建，所以要拷进输出目录。
 * 没烘焙过也不报错 —— 引擎会显示缺素材提示屏，而不是默默画出更差的替代品。
 */
const BAKED_SRC = 'assets-src/baked';
const BAKED_DST = `${OUT}/baked`;

async function copyBaked(src: string, dst: string): Promise<number> {
  const entries = await readdir(src, { withFileTypes: true }).catch(() => []);
  await mkdir(dst, { recursive: true });
  let n = 0;
  for (const e of entries) {
    // textures/ 是换色用的中间贴图，只有烘焙时需要
    if (e.name === 'textures') continue;
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) {
      n += await copyBaked(s, d);
    } else if (/\.(png|json)$/i.test(e.name)) {
      await copyFile(s, d);
      n++;
    }
  }
  return n;
}

let bakedCount = 0;
try {
  bakedCount = await copyBaked(BAKED_SRC, BAKED_DST);
} catch {
  bakedCount = 0;
}
// 保证 manifest 一定存在（引擎要读它来决定加载哪些 spritesheet）
await mkdir(BAKED_DST, { recursive: true });
const bakedManifest = `${BAKED_DST}/manifest.json`;
const bakedFiles = await readdir(BAKED_DST).catch(() => [] as string[]);
if (!bakedFiles.includes('manifest.json')) {
  await writeFile(bakedManifest, JSON.stringify({ animations: [], cell: 0 }, null, 2));
  console.log('  ⚠ 没找到烘焙素材（跑 `npm run bake` 和 `npm run bake:vehicles` 生成），引擎会显示缺素材提示屏');
} else {
  // 注意：这里拷的是 assets-src/baked/ 下的**全部**烘焙产物（角色 + 载具），
  // 不只是角色。日志要写清楚，免得以为载具没生成。
  const carFiles = await readdir(`${BAKED_DST}/vehicles`).catch(() => [] as string[]);
  console.log(
    `✓ 烘焙素材：${bakedCount} 个文件 → ${BAKED_DST}/` +
      `（其中载具 ${carFiles.filter((f) => f.endsWith('.png')).length} 款）`,
  );
}

/* ---------------- 输出 ---------------- */
await mkdir(OUT, { recursive: true });
// 自定义元数据（锚点 ox/oy 等，给引擎用）
await writeFile(`${OUT}/manifest.json`, JSON.stringify({ frames: writer.frames }, null, 2));

// 打包成 Phaser 图集：1 张 atlas.png + 1 份 atlas.json
const { atlas, json } = packAtlas(atlasEntries);
await writeFile(`${OUT}/atlas.png`, atlas.toBuffer('image/png'));
await writeFile(`${OUT}/atlas.json`, JSON.stringify(json));
console.log(`✓ 图集打包：${json.frames.length} 帧 → atlas.png (${json.meta.size.w}x${json.meta.size.h})`);

/* 总览图 —— 两遍布局：先算位置，再绘制，避免分组标题压住内容 */
const SW = 1760;
const PAD = 24;
const ROW_GAP = 34;
const HEADER_H = 50;

interface Group {
  name: string;
  items: typeof sheetItems;
}
interface Cell {
  item: (typeof sheetItems)[number];
  x: number;
  w: number;
  h: number;
}
interface Row {
  group: string;
  headerY: number;
  y: number;
  cells: Cell[];
}

const groups: Group[] = [];
for (const it of sheetItems) {
  const last = groups[groups.length - 1];
  if (!last || last.name !== it.group) {
    groups.push({ name: it.group, items: [it] });
  } else {
    last.items.push(it);
  }
}

const rows: Row[] = [];
let cursorY = 56;
for (const g of groups) {
  const headerY = cursorY;
  cursorY += HEADER_H;
  let row: Row = { group: g.name, headerY, y: cursorY, cells: [] };
  let x = PAD;
  let rowH = 0;
  for (const it of g.items) {
    const w = it.canvas.width * it.scale;
    const h = it.canvas.height * it.scale;
    if (x + w + PAD > SW && row.cells.length > 0) {
      rows.push(row);
      cursorY += rowH + ROW_GAP;
      row = { group: g.name, headerY, y: cursorY, cells: [] };
      x = PAD;
      rowH = 0;
    }
    row.cells.push({ item: it, x, w, h });
    x += w + 26;
    // 行高要算上底部标签，否则标签会压到下一组标题
    rowH = Math.max(rowH, h + 26);
  }
  rows.push(row);
  cursorY += rowH + ROW_GAP;
}
const SH = cursorY + 30;

const { canvas: sheet, ctx: sctx } = newCanvas(SW, SH);
sctx.fillStyle = '#131519';
sctx.fillRect(0, 0, SW, SH);

let textOK = true;
try {
  sctx.font = 'bold 22px sans-serif';
  textOK = sctx.measureText('A').width > 0;
} catch {
  textOK = false;
}
function label(text: string, x: number, y: number, size = 18, color = '#8d95a1') {
  if (!textOK) return;
  sctx.font = `bold ${size}px sans-serif`;
  sctx.fillStyle = color;
  sctx.fillText(text, x, y);
}

const drawnHeaders = new Set<string>();
for (const row of rows) {
  if (!drawnHeaders.has(row.group)) {
    drawnHeaders.add(row.group);
    sctx.fillStyle = '#1e2228';
    sctx.fillRect(0, row.headerY - 20, SW, 32);
    sctx.fillStyle = PAL.hudGreen;
    sctx.fillRect(0, row.headerY - 20, 6, 32);
    label(row.group, 16, row.headerY + 2, 20, '#dfe4ea');
  }
  for (const cell of row.cells) {
    const { item, x, w, h } = cell;
    sctx.fillStyle = '#1a1d22';
    sctx.fillRect(x - 8, row.y - 8, w + 16, h + 16);
    sctx.strokeStyle = '#2a2f37';
    sctx.lineWidth = 1;
    sctx.strokeRect(x - 8, row.y - 8, w + 16, h + 16);
    sctx.save();
    sctx.translate(x, row.y);
    sctx.scale(item.scale, item.scale);
    sctx.drawImage(item.canvas, 0, 0);
    sctx.restore();
    label(item.label, x, row.y + h + 18, 13, '#6f7782');
  }
}

label('RetroGTA3 · 100% 程序化生成 · 零外部额度', PAD, 30, 20, '#dfe4ea');

await writeFile(`${OUT}/preview.png`, sheet.toBuffer('image/png'));

console.log(`✓ 生成完成：${writer.frames.length} 个精灵图`);
console.log(`  → ${OUT}/`);
console.log(`  → ${OUT}/atlas.json`);
console.log(`  → ${OUT}/preview.png`);
