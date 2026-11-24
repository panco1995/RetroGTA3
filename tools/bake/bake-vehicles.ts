/**
 * 车辆精灵图烘焙驱动（Node + Playwright）
 *
 *   node tools/bake/bake-vehicles.ts
 *
 * 流程和角色烘焙共用同一个页面（tools/bake/index.html），只是走「物体模式」：
 *   1. 加载 Kenney Car Kit 的低模车（CC0，glTF）
 *   2. 固定一台正交相机（俯角/光照与角色完全一致）
 *   3. 绕车自己的中心转 32 个角度，逐个渲染
 *   4. 拼成 8×4 的图集，逐帧校验没被裁切
 *
 * 为什么烘 32 个角度而不是 8 个：
 *   车转弯很快，45° 一档会一顿一顿。11.25° 一档（GTA1/2 的做法）就顺滑多了。
 *
 * 为什么相机是「固定」而不是像角色那样实测：
 *   车的外接框随角度变化很大（45° 时投影高度是 0° 时的两倍多），
 *   实测出来的视野会被 45° 撑大，导致 0° 时车变得很小。
 *   车的尺寸是可控的（长度归一化 + 固定像素密度），直接给相机参数更准。
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEV_URL, startVite } from '../lib/devserver.ts';
import { CAR_ANGLES, CAR_CELL } from '../../src/assets/baked.ts';

const args = process.argv.slice(2);
const val = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

/** Kenney Car Kit（CC0 1.0） */
const KIT = 'assets-src/vehicles/kenney-car-kit/Models/GLB';
const OUT_DIR = val('--out', 'assets-src/baked/vehicles');

const ANGLES = Number(val('--angles', '32'));
const CELL = Number(val('--cell', '144'));
/** 每世界单位对应多少像素 —— 决定车在游戏里的实际尺寸 */
const PX_PER_UNIT = Number(val('--px-per-unit', '32'));
/** 相机俯角，必须和角色烘焙一致（60°），否则车和人的透视会对不上 */
const PITCH = Number(val('--pitch', '60'));
/**
 * 车长归一化到多少世界单位（取模型最长水平边）。
 * 逐车型可覆盖，见 CARS 表里的 len 字段。
 */
const OBJ_LENGTH = Number(val('--obj-length', '4'));
/** 视野安全边距（实测范围 × 这个系数 = 单元尺寸） */
const MARGIN = Number(val('--margin', '1.08'));
/**
 * 模型原生朝向修正（弧度）。
 *
 * Kenney 车模的**车头朝原生 +Z**（GLB 里 `wheel-front-*` 节点就在 z=+0.66，
 * 且正俯视图能看到：风挡（大梯形）+ 后视镜 + 长引擎盖那一端在 +Z）。
 *
 * 推导（勿改）：
 *   绕 Y 转 yaw 后，原生前方 (+Z) 的世界方向 = (sin yaw, cos yaw)
 *   屏幕右 = +X，屏幕下 = +Z → 屏幕前方 = (sin yaw, cos yaw)
 *   游戏世界角 θ = atan2(down, right) = atan2(cos yaw, sin yaw) = π/2 - yaw
 *   所以 yaw = π/2 - θ。取 yaw(k) = π/2 - k*2π/ANGLES ⇒ θ = k*2π/ANGLES，
 *   即 k=0 车头朝正右（东），k=8 朝下（南），k=16 朝左（西），k=24 朝上（北）。
 *
 * 这与角色烘焙是同一套约定（角色模型原生前方也是 +Z）。
 */
const YAW_OFFSET = Number(val('--yaw-offset', '0'));

/** 图集网格：8 列 × N 行 */
const COLS = 8;

/**
 * 车型表 —— Kenney Car Kit 3.1 里全部 25 款完整车辆。
 *
 * id   引擎侧用的名字（对应 src/assets/baked.ts 的 CAR_IDS）
 * file 模型文件名
 * len  这款车在游戏里的长度（世界单位）。1 单位 = 32 世界像素。
 *
 * 关于 len：
 *   Kenney 这套车模是**同一比例尺**做的（所有轿车宽度都精确 1.50，
 *   长度从掀背 2.55 到垃圾车 3.45 递进），所以长度差异是有意义的。
 *   但原尺寸直接换算下来消防车会比轿车长 35%，在 135px 宽的车道里太夸张，
 *   所以这里把差异**压缩**到 2.45 ~ 4.55 之间：
 *   - 轿车 4.00 = 128px（玩家车，保持现状）
 *   - 卡车/消防车 4.4~4.55 = 141~146px（略微出车道，可接受）
 *   - 卡丁车 2.45 = 78px、拖拉机 3.35~3.75 = 107~120px（明显小一号）
 */
const CARS = [
  { id: 'sedan', file: 'sedan.glb', len: 4.0 },
  { id: 'taxi', file: 'taxi.glb', len: 4.1 },
  { id: 'police', file: 'police.glb', len: 4.25 },
  { id: 'ambulance', file: 'ambulance.glb', len: 4.4 },
  { id: 'van', file: 'van.glb', len: 4.2 },
  { id: 'truck', file: 'truck.glb', len: 4.4 },
  { id: 'sports', file: 'sedan-sports.glb', len: 3.95 },
  { id: 'suv', file: 'suv.glb', len: 4.1 },
  { id: 'delivery', file: 'delivery.glb', len: 4.35 },
  { id: 'deliveryflat', file: 'delivery-flat.glb', len: 4.35 },
  { id: 'truckflat', file: 'truck-flat.glb', len: 4.3 },
  { id: 'firetruck', file: 'firetruck.glb', len: 4.55 },
  { id: 'garbage', file: 'garbage-truck.glb', len: 4.55 },
  { id: 'hatchsports', file: 'hatchback-sports.glb', len: 4.05 },
  { id: 'race', file: 'race.glb', len: 4.05 },
  { id: 'racefuture', file: 'race-future.glb', len: 4.1 },
  { id: 'suvluxury', file: 'suv-luxury.glb', len: 4.2 },
  { id: 'tractor', file: 'tractor.glb', len: 3.35 },
  { id: 'tractorpolice', file: 'tractor-police.glb', len: 3.5 },
  { id: 'tractorshovel', file: 'tractor-shovel.glb', len: 3.75 },
];

/** 量一张 PNG 的 alpha 包围盒 */
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

/**
 * 统计一帧里「琥珀色大灯」像素在上下左右四个半区的分布。
 *
 * 这是朝向自检的依据：Kenney 的前大灯是琥珀色（≈ 255,180,60），
 * 车尾没有这个颜色的灯。所以：
 *   k=0（车头朝东）→ 大灯全在右半边
 *   k=8（车头朝南）→ 大灯全在下半边
 *   k=16（车头朝西）→ 大灯全在左半边
 *   k=24（车头朝北）→ 下半边没有大灯（看到的是车尾）
 *
 * 车身本身就是黄色的车（taxi）不能用这个判据，会跳过。
 */
function lampQuarters(img: { width: number; height: number }) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img as never, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const hx = img.width / 2;
  const hy = img.height / 2;
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (let y = 0; y < img.height; y++) {
    const row = y * img.width * 4;
    for (let x = 0; x < img.width; x++) {
      const o = row + x * 4;
      if (data[o + 3] < 20) continue;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      if (r > 190 && g > 110 && g < 215 && b < 90) {
        if (x < hx) left++;
        else right++;
        if (y < hy) top++;
        else bottom++;
      }
    }
  }
  return { left, right, top, bottom, total: left + right };
}

/**
 * 取一帧的 alpha 轮廓（0/1 掩膜）。
 *
 * 用来做「左右对称」判据：车头朝东（k=0）的轮廓，
 * 应该正好是车头朝西（k=16）轮廓的左右镜像。
 * 模型本身左右对称，所以这个判据和车的颜色无关、对所有车型都成立，
 * 而方向错 180° 时轮廓会差 50%+ —— 判别度极高。
 */
function alphaMask(img: { width: number; height: number }) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img as never, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 8 ? 1 : 0;
  return { mask, w: img.width, h: img.height };
}

/** a 和「b 的左右镜像」之间的轮廓不匹配率（0~1） */
function maskMismatch(a: ReturnType<typeof alphaMask>, b: ReturnType<typeof alphaMask>) {
  let mism = 0;
  let union = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const av = a.mask[y * a.w + x];
      const bv = b.mask[y * b.w + (b.w - 1 - x)];
      if (av || bv) union++;
      if (av !== bv) mism++;
    }
  }
  return union ? mism / union : 0;
}

/**
 * 朝向自检：拿 4 个正交方向的帧，验证大灯分布和「车头朝向」一致。
 * 返回 null 表示这台车没法用大灯判据（车身本身是黄的 / 没有琥珀色灯），跳过。
 */
function checkOrientation(
  id: string,
  quarters: Record<number, ReturnType<typeof lampQuarters>>,
): string | null {
  const e = quarters[0];
  const s = quarters[8];
  const w = quarters[16];
  const n = quarters[24];
  /**
   * 判据失效的情况，跳过：
   *  1) 车身本身就是琥珀色（taxi / race）→ k=0 的琥珀像素左右都很多，
   *     说明量到的是车漆不是大灯。判据①（左右轮廓对称）不受影响，照样会跑。
   *  2) 这款车完全没有琥珀色灯（suv 这类配色）→ 没有可判的信号。
   */
  const bodyIsAmber = e.left > 0 && e.right > 0;
  if (bodyIsAmber) return null;
  if (e.total === 0 && s.total === 0 && w.total === 0 && n.total === 0) return null;

  const bad: string[] = [];
  // 逐方向断言：只有该方向**看得见**琥珀色灯时才有意义
  if (e.total > 0 && !(e.right > 0 && e.left === 0)) {
    bad.push(`k=0 车头应朝右（大灯全在右半边），实际 左${e.left}/右${e.right}`);
  }
  if (s.total > 0 && !(s.bottom > s.top)) {
    bad.push(`k=8 车头应朝下（大灯全在下半边），实际 上${s.top}/下${s.bottom}`);
  }
  if (w.total > 0 && !(w.left > 0 && w.right === 0)) {
    bad.push(`k=16 车头应朝左（大灯全在左半边），实际 左${w.left}/右${w.right}`);
  }
  if (n.total > 0 && n.bottom !== 0) {
    bad.push(`k=24 车头应朝上（下半边不该有大灯），实际 下${n.bottom}`);
  }
  return bad.length ? `${id}：${bad.join('；')}` : null;
}

async function main() {
  const rows = Math.ceil(ANGLES / COLS);
  const cosP = Math.cos((PITCH * Math.PI) / 180);
  /** 角度 k 对应的 yaw（k=0 车头朝正右，顺时针递增） */
  const yawOf = (k: number) => Math.PI / 2 - (k * Math.PI * 2) / ANGLES + YAW_OFFSET;
  const yaws = Array.from({ length: ANGLES }, (_, k) => yawOf(k));

  console.log(`  车型：${CARS.length} 款 · 每款 ${ANGLES} 角度`);
  console.log(`  俯角 ${PITCH}° · ${PX_PER_UNIT}px/单位 · yaw 偏移 ${YAW_OFFSET}`);

  const server = await startVite();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await mkdir(OUT_DIR, { recursive: true });

  try {
    await page.goto(`${DEV_URL}/tools/bake/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as never as { __BAKE_READY__?: boolean }).__BAKE_READY__ === true, {
      timeout: 20000,
    });

    let clipped = 0;
    let worst = 0;
    /** 朝向自检失败的车型 */
    const orientationErrors: string[] = [];
    const cars: { id: string; angles: number }[] = [];

    // ── 第 1 遍：实测所有车型的内容范围 ──
    // 车的外接框随角度剧烈变化（45° 时比 0° 高一倍多），
    // 所以必须实测，不能按静止包围盒估。
    console.log('  实测内容范围…');
    let uMin = Infinity;
    let uMax = -Infinity;
    let relMin = Infinity;
    let relMax = -Infinity;
    for (const car of CARS) {
      const url = `/${KIT}/${car.file}`.replace(/ /g, '%20');
      await page.evaluate(
        ([u, opts]) =>
          (
            window as never as {
              __BAKE__: { load: (u: string, o: unknown) => Promise<unknown> };
            }
          ).__BAKE__.load(u as string, opts),
        [
          url,
          {
            mode: 'object',
            pitch: PITCH,
            cellW: CELL,
            cellH: CELL,
            objLength: car.len ?? OBJ_LENGTH,
          },
        ] as const,
      );
      const m = (await page.evaluate(
        ([ys]) =>
          (
            window as never as {
              __BAKE__: { measureObject: (y: number[], v: number) => unknown };
            }
          ).__BAKE__.measureObject(ys as number[], 12),
        [yaws] as const,
      )) as { uMin: number; uMax: number; relMin: number; relMax: number };
      if (m.uMin < uMin) uMin = m.uMin;
      if (m.uMax > uMax) uMax = m.uMax;
      if (m.relMin < relMin) relMin = m.relMin;
      if (m.relMax > relMax) relMax = m.relMax;
      console.log(
        `    ${car.id.padEnd(10)} u[${m.uMin.toFixed(2)}, ${m.uMax.toFixed(2)}] ` +
          `rel[${m.relMin.toFixed(2)}, ${m.relMax.toFixed(2)}]`,
      );
    }

    // 反算统一相机：所有车型共用同一台（缩放一致），单元由最大范围决定
    const contentW = uMax - uMin;
    const contentH = relMax - relMin;
    const needUnits = Math.max(contentW, contentH) * MARGIN;
    const cell = Math.ceil(needUnits * PX_PER_UNIT);
    const visW = cell / PX_PER_UNIT;
    const visH = cell / PX_PER_UNIT;
    // 相机垂直目标：让内容在单元里上下居中
    const targetY = (relMin + relMax) / 2 / cosP;
    // 地面中心（rel=0）在单元里的纵向位置（从顶部算）
    // 单元第 f 行对应相机 v = visH/2 - f*visH，所以 f = (visH/2 - v)/visH
    const anchorY = 0.5 + (relMin + relMax) / 2 / visH;
    console.log(
      `    → 内容 ${contentW.toFixed(2)}×${contentH.toFixed(2)} 单位 · ` +
        `单元 ${cell}px · 视野 ${visW.toFixed(2)} · 锚点 ${(anchorY * 100).toFixed(0)}%`,
    );

    // ── 第 2 遍：正式烘焙 ──
    for (const car of CARS) {
      const url = `/${KIT}/${car.file}`.replace(/ /g, '%20');
      process.stdout.write(`  烘焙「${car.id}」… `);

      await page.evaluate(
        ([u, opts]) =>
          (
            window as never as {
              __BAKE__: { load: (u: string, o: unknown) => Promise<unknown> };
            }
          ).__BAKE__.load(u as string, opts),
        [
          url,
          {
            mode: 'object',
            pitch: PITCH,
            cellW: cell,
            cellH: cell,
            objLength: car.len ?? OBJ_LENGTH,
          },
        ] as const,
      );

      await page.evaluate(
        (cam) =>
          (
            window as never as {
              __BAKE__: { setObjectCamera: (c: unknown) => unknown };
            }
          ).__BAKE__.setObjectCamera(cam),
        { visW, visH, targetY } as const,
      );

      const sheet = createCanvas(COLS * cell, rows * cell);
      const sctx = sheet.getContext('2d');
      sctx.clearRect(0, 0, sheet.width, sheet.height);

      /** 正交 4 个方向的大灯分布，用于朝向自检 */
      const quarters: Record<number, ReturnType<typeof lampQuarters>> = {};
      /** k=0 / k=16 的 alpha 轮廓，用于左右对称（颜色无关）判据 */
      const masks: Record<number, ReturnType<typeof alphaMask>> = {};

      for (let k = 0; k < ANGLES; k++) {
        // 角度 k 表示车头指向游戏世界角 θ = k*2π/ANGLES（0 = 正右，atan2 约定）
        const yaw = yawOf(k);
        const dataUrl = await page.evaluate(
          ([o]) =>
            (
              window as never as {
                __BAKE__: { renderObjectFrame: (o: unknown) => string };
              }
            ).__BAKE__.renderObjectFrame(o),
          [{ yaw }] as const,
        );
        const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
        const img = await loadImage(buf);
        const col = k % COLS;
        const row = Math.floor(k / COLS);
        sctx.drawImage(img, col * cell, row * cell, cell, cell);

        // 朝向自检：只采 4 个正交方向
        if (k % (ANGLES / 4) === 0) {
          quarters[k] = lampQuarters(img);
          masks[k] = alphaMask(img);
        }

        // 裁切校验
        const b = alphaBounds(img);
        if (b) {
          const touch = b.x0 <= 0 || b.y0 <= 0 || b.x1 >= cell - 1 || b.y1 >= cell - 1;
          if (touch) {
            clipped++;
            worst = Math.max(
              worst,
              Math.min(b.x0, b.y0, cell - 1 - b.x1, cell - 1 - b.y1),
            );
          }
        }
      }

      // 朝向自检 ①：左右对称（颜色无关，对所有车型都成立）
      //   车头朝东的轮廓 == 车头朝西的轮廓的左右镜像。
      //   方向错 180° 时这一项会差 50%+，正确时只有 0.1~0.5%。
      const sym = maskMismatch(masks[0], masks[16]);
      // 朝向自检 ②：大灯落在车头那一侧（颜色有关，车身本身是黄的车会跳过）
      const orientBad = checkOrientation(car.id, quarters);
      const problems: string[] = [];
      if (sym > 0.03) {
        problems.push(`${car.id}：左右轮廓不匹配 ${(sym * 100).toFixed(1)}%（车头朝向反了？）`);
      }
      if (orientBad) problems.push(orientBad);
      if (problems.length) {
        orientationErrors.push(...problems);
        console.log('✗');
      } else {
        console.log('✓');
      }

      const file = `${OUT_DIR}/${car.id}.png`;
      await writeFile(file, sheet.toBuffer('image/png'));
      cars.push({ id: car.id, angles: ANGLES });
    }

    const manifest = {
      cell,
      angles: ANGLES,
      cols: COLS,
      rows,
      pxPerUnit: PX_PER_UNIT,
      objLength: OBJ_LENGTH,
      pitch: PITCH,
      anchor: { x: 0.5, y: anchorY },
      camera: { visW, visH, targetY },
      /** 每款车在游戏里的长度（世界单位），引擎侧用来算车体大小 */
      lengths: Object.fromEntries(CARS.map((c) => [c.id, c.len ?? OBJ_LENGTH])),
      /** 帧号 k 对应的游戏世界角 = k * 2π / angles */
      angleStep: (Math.PI * 2) / ANGLES,
      /** 模型原生车头朝向（Kenney 车模 = +Z）与额外补偿角 */
      nativeFront: '+Z',
      yawOffset: YAW_OFFSET,
      cars,
      source: KIT,
      layout: 'col = 角度(k, 0=正右, 顺时针), row = 角度续',
    };
    await writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`\n  → ${OUT_DIR}/manifest.json`);

    if (clipped) {
      console.log(`  ✗ 有 ${clipped} 帧贴边（还差 ${worst}px 才不裁切）`);
      process.exitCode = 1;
    } else {
      console.log('  ✓ 全部帧都有安全边距，无裁切');
    }

    if (orientationErrors.length) {
      console.log('  ✗ 朝向自检失败：');
      for (const e of orientationErrors) console.log(`    ${e}`);
      process.exitCode = 1;
    } else {
      console.log('  ✓ 朝向自检通过（k=0 东 / k=8 南 / k=16 西 / k=24 北）');
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
