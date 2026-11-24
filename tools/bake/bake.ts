/**
 * 精灵图烘焙驱动（Node + Playwright）
 *
 *   node tools/bake/bake.ts                 烘焙全部动画
 *   node tools/bake/bake.ts --diagnose      只看模型里有什么
 *
 * 流程：
 *   1. 起 Vite dev server（和截图自检共用）
 *   2. 无头 Chromium 打开烘焙页，加载 CC0 低模骨骼角色
 *   3. 按「动画组」处理：同组共享一台相机（保证各动画比例完全一致）
 *      每组先用探针相机量出真实像素范围，反算出无裁切的正交相机
 *   4. 对每个动画的每一帧、8 个方位角渲染成 2D 精灵
 *   5. 在 Node 里拼成图集 PNG + JSON，写进 assets-src/baked/
 *   6. 逐帧回读 alpha 边界，确认没有任何一帧被裁切
 *
 * 产出是普通 2D 精灵图 —— 游戏引擎侧完全不用改。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEV_URL, startVite } from '../lib/devserver.ts';
import { NPC_PALETTES, buildRemap } from './npc-palettes.ts';
import type { NpcPalette } from './npc-palettes.ts';
import { BAKED_CELL, BAKED_FRAMES } from '../../src/assets/baked.ts';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const MODEL_URL = val(
  '--model',
  '/assets-src/characters/animated-human/Animated%20Human.fbx',
);
const OUT_DIR = val('--out', 'assets-src/baked');
const PITCH = Number(val('--pitch', '70'));
const CELL = Number(val('--cell', String(BAKED_CELL)));
const FRAMES = Number(val('--frames', String(BAKED_FRAMES)));
const ANCHOR_Y = Number(val('--anchor', '0.66'));
const ONLY = val('--anims', '');
const TEXTURE_URL = val(
  '--texture',
  '/assets-src/characters/animated-human/Textures/ClothedLightSkin.png',
);
/** 换色时要用到的磁盘原图 */
const TEXTURE_FILE = val(
  '--texture-file',
  'assets-src/characters/animated-human/Textures/ClothedLightSkin.png',
);
/** 裁切统计（bakeSheet 是模块级函数，用全局对象回传） */
const clipStats = { count: 0, worst: 0 };

interface RenderOpts {
  azimuth: number;
  clipName: string;
  frame: number;
  frameCount: number;
  range: number;
}

interface BakeInfo {
  clips: { name: string; duration: number; tracks: number }[];
  textures: { mesh: string; map: string; imageLoaded: boolean; width: number }[];
  materials: {
    mesh: string;
    name: string;
    type: string;
    color: string;
    hasMap: boolean;
    imageLoaded: boolean;
  }[];
  hasVertexColor: boolean;
  hasUv: boolean;
  textureApplied: boolean;
  meshes: string[];
  bounds: { size: { x: number; y: number; z: number } };
}

/** 游戏里的 8 方向序号：0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW */
const GAME_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** 烘焙页的方位角：0 = 屏幕正下方，顺时针递增 */
const dirToAzimuth = (d: number) => (4 - d + 8) % 8;

/**
 * 动画组：一组里的动画共用一台相机。
 * 玩法相关的走/跑/站必须同组，否则角色在不同动作间切换会忽大忽小。
 * range < 1 表示只采样动画前一段（有些 clip 后半段姿态是坏的）。
 */
const GROUPS = [
  {
    key: 'main',
    clips: [
      { key: 'walk', kw: ['walk'], range: 1 },
      { key: 'idle', kw: ['idle'], range: 1 },
      { key: 'run', kw: ['run'], range: 1 },
    ],
  },
  {
    key: 'death',
    clips: [{ key: 'death', kw: ['death', 'die'], range: 0.5 }],
  },
];

/** 量一张 PNG 的 alpha 包围盒（返回 null 表示全透明） */
function alphaBounds(img: { width: number; height: number }) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img as never, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width;
  let x1 = -1;
  let y0 = img.height;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    const row = y * img.width * 4;
    for (let x = 0; x < img.width; x++) {
      if (data[row + x * 4 + 3] > 4) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** clip 名 → 小写短名 */
const slugOf = (clipName: string) =>
  (clipName.split('|').pop() ?? clipName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');


/**
 * 烘焙一个动画：8 方向 × N 帧，拼成一张图集。
 * 返回 canvas；同时把裁切情况记到全局统计里。
 */
async function bakeSheet(page: any, entry: { name: string; range: number }) {
  const sheet = createCanvas(FRAMES * CELL, 8 * CELL);
  const sctx = sheet.getContext('2d');
  sctx.clearRect(0, 0, sheet.width, sheet.height);

  for (let d = 0; d < 8; d++) {
    const az = dirToAzimuth(d);
    for (let f = 0; f < FRAMES; f++) {
      const dataUrl = await page.evaluate(
        ([o]: [RenderOpts]) =>
          (
            window as never as {
              __BAKE__: { renderFrame: (o: unknown) => string };
            }
          ).__BAKE__.renderFrame(o),
        [
          {
            azimuth: az,
            clipName: entry.name,
            frame: f,
            frameCount: FRAMES,
            range: entry.range,
          },
        ] as const,
      );
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const img = await loadImage(buf);
      sctx.drawImage(img, f * CELL, d * CELL, CELL, CELL);

      // 裁切校验：内容贴到单元边缘就说明还是被切了
      const b = alphaBounds(img);
      if (b) {
        const touch = b.x0 <= 0 || b.y0 <= 0 || b.x1 >= CELL - 1 || b.y1 >= CELL - 1;
        if (touch) {
          clipStats.count++;
          clipStats.worst = Math.max(
            clipStats.worst,
            Math.min(b.x0, b.y0, CELL - 1 - b.x1, CELL - 1 - b.y1),
          );
        }
      }
    }
    process.stdout.write(`\r      方向 ${GAME_DIRS[d]} ✓`);
  }
  process.stdout.write('\n');
  return sheet;
}

/**
 * 生成 NPC 换色贴图。
 * 原贴图是 32×32 纯色区图集（只有 5 种颜色），
 * 所以按精确 RGB 替换即可，边缘不会有锯齿问题。
 */
async function writeVariantTexture(outFile: string, pal: NpcPalette) {
  await mkdir(outFile.slice(0, outFile.lastIndexOf('/')), { recursive: true });
  const src = await loadImage(TEXTURE_FILE);
  const c = createCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, src.width, src.height);
  const remap = buildRemap(pal);
  const hit = new Set<string>();
  for (let i = 0; i < data.data.length; i += 4) {
    const k = `${data.data[i]},${data.data[i + 1]},${data.data[i + 2]}`;
    const to = remap.get(k);
    if (to) {
      data.data[i] = to[0];
      data.data[i + 1] = to[1];
      data.data[i + 2] = to[2];
      hit.add(k);
    }
  }
  // 5 个色区必须全部命中，否则说明贴图变了、换色规则要更新
  if (hit.size !== remap.size) {
    const missing = [...remap.keys()].filter((k) => !hit.has(k));
    throw new Error(`换色失败：贴图里找不到色区 ${missing.join(' / ')}`);
  }
  ctx.putImageData(data, 0, 0);
  await writeFile(outFile, c.toBuffer('image/png'));
}

async function main() {
  console.log(`  模型：${MODEL_URL}`);
  console.log(`  俯角 ${PITCH}° · 单元 ${CELL}px · 每动画 ${FRAMES} 帧`);
  if (CELL !== BAKED_CELL || FRAMES !== BAKED_FRAMES) {
    console.log(
      `  ⚠ 与共享常量不一致（烘焙 ${CELL}/${FRAMES}，游戏按 ${BAKED_CELL}/${BAKED_FRAMES} 加载）` +
        `—— 改 src/assets/baked.ts 或别用 --cell/--frames`,
    );
  }
  console.log(`  贴图：${TEXTURE_URL}`);

  const server = await startVite();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  try {
    await page.goto(`${DEV_URL}/tools/bake/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as never as { __BAKE_READY__?: boolean }).__BAKE_READY__ === true, {
      timeout: 20000,
    });

    console.log('  加载模型…');
    const info = (await page.evaluate(
      ([url, opts]) =>
        (window as never as { __BAKE__: { load: (u: string, o: unknown) => Promise<unknown> } }).__BAKE__.load(
          url as string,
          opts,
        ),
      [MODEL_URL, { pitch: PITCH, cellW: CELL, cellH: CELL, texture: TEXTURE_URL }] as const,
    )) as BakeInfo;

    console.log('\n  ── 模型内容 ──');
    console.log(`  骨骼节点：${info.clips.length} 个动画 clip`);
    for (const c of info.clips) {
      console.log(`    · ${c.name}  (${c.duration.toFixed(2)}s, ${c.tracks} 轨道)`);
    }
    console.log(`  包围盒：${JSON.stringify(info.bounds.size)}`);
    console.log(`  顶点色：${info.hasVertexColor ? '有 ✓' : '无'} · UV：${info.hasUv ? '有 ✓' : '无'} · 贴图已挂：${info.textureApplied ? '✓' : '✗'}`);
    console.log(`  材质：`);
    for (const m of info.materials) {
      console.log(
        `    · ${m.name || '(无名)'} [${m.type}] 颜色=${m.color} map=${m.hasMap ? (m.imageLoaded ? '✓' : '✗') : '无'}`,
      );
    }
    console.log(`  贴图：`);
    for (const t of info.textures) {
      console.log(
        `    · ${t.mesh} → ${t.map} ${t.imageLoaded ? `✓ ${t.width}px` : '✗ 没加载上'}`,
      );
    }
    console.log('');

    if (has('--diagnose')) {
      if (errors.length) console.log('  页面报错：', errors.slice(0, 5));
      return;
    }

    const clips = info.clips;
    const findClip = (keywords: string[]): string | null => {
      for (const kw of keywords) {
        const hit = clips.find((c) => c.name.toLowerCase().includes(kw.toLowerCase()));
        if (hit) return hit.name;
      }
      return null;
    };

    // 把动画组解析成真实的 clip 名
    const groups = GROUPS.map((g) => ({
      key: g.key,
      entries: g.clips
        .map((c) => {
          const name = ONLY
            ? clips.find((x) => x.name.toLowerCase().includes(c.key))?.name
            : findClip(c.kw);
          return name ? { name, key: c.key, range: c.range ?? 1 } : null;
        })
        .filter((x): x is { name: string; key: string; range: number } => !!x),
    })).filter((g) => g.entries.length);

    if (!groups.length) {
      console.log('  ✗ 没找到可烘焙的动画');
      process.exitCode = 1;
      return;
    }

    await mkdir(OUT_DIR, { recursive: true });

    clipStats.count = 0;
    clipStats.worst = 0;
    const manifestGroups: Record<string, unknown>[] = [];
    const npcManifest: { id: string; animations: string[] }[] = [];

    for (const group of groups) {
      console.log(`  ── 动画组「${group.key}」 ──`);

      // 量范围 → 反算无裁切相机
      const measured = await page.evaluate(
        ([entries, count]) =>
          (
            window as never as {
              __BAKE__: { measureAndFrame: (e: unknown[], c: number) => unknown };
            }
          ).__BAKE__.measureAndFrame(entries as unknown[], count as number),
        [
          group.entries.map((e) => ({ name: e.name, range: e.range })),
          FRAMES,
        ] as const,
      );
      const m = measured as {
        content: { uMin: number; uMax: number; relMin: number; relMax: number; empty: number };
        final: { visW: number; visH: number; targetY: number };
      };
      console.log(
        `    范围 u[${m.content.uMin.toFixed(2)}, ${m.content.uMax.toFixed(2)}] ` +
          `rel[${m.content.relMin.toFixed(2)}, ${m.content.relMax.toFixed(2)}]`,
      );
      console.log(
        `    相机 视野 ${m.final.visW.toFixed(2)}×${m.final.visH.toFixed(2)} · 目标 y=${m.final.targetY.toFixed(2)} · 锚点 ${(ANCHOR_Y * 100).toFixed(0)}%`,
      );
      if (m.content.empty) console.log(`    ⚠ 有 ${m.content.empty} 帧是空的`);

      for (const entry of group.entries) {
        console.log(`    烘焙「${entry.key}」…`);
        const sheet = await bakeSheet(page, entry);
        const file = `${OUT_DIR}/${entry.key}.png`;
        await writeFile(file, sheet.toBuffer('image/png'));
        console.log(`      → ${file}`);
      }

      manifestGroups.push({
        key: group.key,
        clips: group.entries.map((e) => ({ key: e.key, clip: e.name, range: e.range })),
        camera: m.final,
      });

      // ── NPC 换色变体 ──
      // 换贴图不改变剪影，所以直接复用本组的相机（比例完全一致）。
      if (group.key === 'main' && !has('--no-npc')) {
        console.log(`    ── NPC 变体（${NPC_PALETTES.length} 个）──`);
        for (const pal of NPC_PALETTES) {
          const texFile = `${OUT_DIR}/textures/${pal.id}.png`;
          await writeVariantTexture(texFile, pal);
          // 页面里换贴图（同一套模型，不重新加载）
          await page.evaluate(
            (url) =>
              (
                window as never as { __BAKE__: { setTexture: (u: string) => Promise<unknown> } }
              ).__BAKE__.setTexture(url),
            `/${OUT_DIR.replace(/^\.\//, '')}/textures/${pal.id}.png`,
          );
          const dir = `${OUT_DIR}/npc/${pal.id}`;
          await mkdir(dir, { recursive: true });
          const anims: string[] = [];
          for (const entry of group.entries) {
            if (entry.key === 'death') continue;
            const sheet = await bakeSheet(page, entry);
            await writeFile(`${dir}/${entry.key}.png`, sheet.toBuffer('image/png'));
            anims.push(entry.key);
          }
          npcManifest.push({ id: pal.id, animations: anims });
          console.log(`      · ${pal.id} ✓`);
        }
        // 换回原贴图
        await page.evaluate(
          (url) =>
            (
              window as never as { __BAKE__: { setTexture: (u: string) => Promise<unknown> } }
            ).__BAKE__.setTexture(url),
          TEXTURE_URL,
        );
      }
    }

    // 元数据
    const manifest = {
      cell: CELL,
      cellW: CELL,
      cellH: CELL,
      directions: GAME_DIRS,
      frameCount: FRAMES,
      pitch: PITCH,
      animations: manifestGroups.flatMap((g) =>
        (g as { clips: { key: string }[] }).clips.map((c) => c.key),
      ),
      source: MODEL_URL,
      layout: 'row = 方向(0=N 顺时针), col = 帧',
      /** 角色脚底锚点在单元里的位置（游戏里放精灵要按这个对位） */
      anchor: { x: 0.5, y: ANCHOR_Y },
      groups: manifestGroups,
      npcs: npcManifest,
    };
    await writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`\n  → ${OUT_DIR}/manifest.json`);

    if (clipStats.count) {
      console.log(`\n  ✗ 有 ${clipStats.count} 帧贴边（还差 ${clipStats.worst}px 才不裁切）`);
      process.exitCode = 1;
    } else {
      console.log('  ✓ 全部帧都有安全边距，无裁切');
    }

    if (errors.length) {
      console.log('\n  ⚠ 页面报错：');
      for (const e of errors.slice(0, 8)) console.log(`    ${e}`);
      process.exitCode = 1;
    } else {
      console.log('  ✓ 烘焙完成，无页面报错');
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
