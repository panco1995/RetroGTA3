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
import { mkdir, writeFile } from 'node:fs/promises';
import { AssetWriter, newCanvas, PAL } from './core.ts';
import { TILE_BUILDERS, TILE_OVERLAYS } from './tiles.ts';
import { drawCar, CAR_TYPES } from './vehicles.ts';
import {
  ACTOR_PRESETS,
  actorReference,
  arm,
  head,
  leg,
  torso,
} from './actors.ts';
import {
  bench,
  buildingSide,
  cone,
  hydrant,
  mailbox,
  newsstand,
  roof,
  streetlight,
  trashcan,
  tree,
} from './props.ts';

const OUT = 'public/assets/proc';
const writer = new AssetWriter(OUT);

/* 收集到总览图用的条目 */
const sheetItems: { group: string; label: string; canvas: any; scale: number }[] = [];

async function emit(name: string, canvas: any, group: string, label: string, scale = 1) {
  await writer.save(name, canvas);
  sheetItems.push({ group, label, canvas, scale });
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

/* ---------------- 2. 载具 ---------------- */
const typeColors: Record<string, string> = {
  sedan: PAL.carRed,
  taxi: PAL.carYellow,
  police: PAL.carWhite,
  van: PAL.carSilver,
  truck: PAL.carBlue,
  sports: PAL.carGreen,
};
for (const t of CAR_TYPES) {
  await emit(`vehicles/${t}`, drawCar(t as any, typeColors[t], seed++), '载具', t);
}
// 多色系 sedan
const extraColors = [PAL.carRed, PAL.carBlue, PAL.carYellow, PAL.carGreen, PAL.carWhite, PAL.carBlack];
extraColors.forEach((c, i) => {
  emit(`vehicles/sedan_c${i}`, drawCar('sedan', c, seed++), '载具', 'sedan 多色');
});

/* ---------------- 3. 角色纸片部件 ---------------- */
const actorP = ACTOR_PRESETS.player;
await emit('actors/head', head(actorP), '角色部件', 'head');
await emit('actors/torso', torso(actorP), '角色部件', 'torso');
await emit('actors/arm', arm(actorP), '角色部件', 'arm');
await emit('actors/leg', leg(actorP), '角色部件', 'leg');
await emit('actors/reference', actorReference(actorP), '角色部件', 'reference', 1.4);
for (const [key, preset] of Object.entries(ACTOR_PRESETS)) {
  if (key === 'player') continue;
  await emit(`actors/${key}_reference`, actorReference(preset), '角色部件', key, 1.4);
}

/* ---------------- 4. 道具 ---------------- */
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

/* ---------------- 输出 ---------------- */
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/atlas.json`, JSON.stringify({ frames: writer.frames }, null, 2));

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
