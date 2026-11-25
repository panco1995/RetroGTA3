/**
 * 截图自检 —— AI 开发闭环
 *
 *   node tools/shot/shot.ts
 *
 * 流程：起 dev server → 无头 Chromium 打开游戏 → 模拟按键 → 截图到 .shots/
 * 每次改完玩法代码，跑一次这个，我自己看图判断"画面对不对"，
 * 不用麻烦你当人肉调试器。
 *
 * 除了截图，还会回读运行时状态做断言：
 *   车流在动 / 维修点能回血 / 页面无报错。任一失败退出码 1。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { chromium, type Page } from 'playwright';

interface ShotState {
  inCar: boolean;
  px: number;
  py: number;
  cx: number;
  cy: number;
  speed: number;
  health: number;
  puffs: number;
  traffic: number;
  peds: number;
  onPad: boolean;
}

interface ShotApi {
  state(): ShotState;
  teleport(x: number, y: number): void;
  enterCar(): void;
  placeCar(x: number, y: number, angle: number): void;
  setHealth(h: number): void;
  trafficPositions(): { x: number; y: number }[];
  repairPad(): { x: number; y: number; w: number; h: number };
}

declare global {
  interface Window {
    __GAME_READY__?: boolean;
    __SHOT__: ShotApi;
  }
}

const PORT = 5199;
const OUT = '.shots';
// 注意：Vite 8 默认绑 localhost（可能是 IPv6 的 ::1），不要写死 127.0.0.1
const BASE_URL = process.env.SHOT_URL ?? `http://localhost:${PORT}`;

async function waitPort(port: number, timeout = 40000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await Promise.race([
      new Promise<boolean>((resolve) => {
        const s = net.connect({ port, host: 'localhost' });
        s.once('connect', () => {
          s.destroy();
          resolve(true);
        });
        s.once('error', () => resolve(false));
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${OUT}/${name}.png`);
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null;

  if (!process.env.SHOT_URL) {
    console.log(`  启动 dev server :${PORT} …`);
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      stdio: 'ignore',
      env: process.env,
    });
    if (!(await waitPort(PORT))) {
      server.kill();
      throw new Error('dev server 启动超时');
    }
  }

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  let failed = false;

  try {
    console.log(`  打开 ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__GAME_READY__ === true, { timeout: 30000 });
    await page.waitForTimeout(900);

    // 1. 初始画面
    await shot(page, '01-boot');

    // 2. 走到街上（位置从运行时状态读，街区是程序化生成的）
    const here = await page.evaluate(() => window.__SHOT__.state());
    await page.evaluate(([x, y]) => window.__SHOT__.teleport(x, y), [here.px, here.py] as const);
    await hold(page, 'd', 900);
    await page.waitForTimeout(250);
    await shot(page, '02-walk');

    // 3. 上车
    await page.evaluate(() => window.__SHOT__.enterCar());
    await page.waitForTimeout(350);
    await shot(page, '03-enter-car');

    // 4. 开车：沿出生所在的那条横向街直行。
    //    不要在这里转向 —— 程序化街区转 90° 会直接把车开进楼里。
    await hold(page, 'w', 1800);
    await hold(page, 's', 600);
    await page.waitForTimeout(250);
    await shot(page, '04-drive');

    const state = await page.evaluate(() => window.__SHOT__.state());
    console.log(`  运行时状态: ${JSON.stringify(state)}`);

    // 5. 车流真的在动（不是一堆静止贴图）
    const t0 = await page.evaluate(() => window.__SHOT__.trafficPositions());
    await page.waitForTimeout(1200);
    const t1 = await page.evaluate(() => window.__SHOT__.trafficPositions());
    let moved = 0;
    for (let i = 0; i < Math.min(t0.length, t1.length); i++) {
      moved = Math.max(moved, Math.hypot(t1[i].x - t0[i].x, t1[i].y - t0[i].y));
    }
    console.log(`  车流最大位移: ${moved.toFixed(1)}px / ${state.traffic} 辆`);
    if (state.traffic < 8 || moved < 20) {
      console.log('  ⚠ 车流没有正常行驶');
      failed = true;
    }

    // 6. 维修点：把车放到 Pay 'n' Spray 上，车况应该回升
    const pad = await page.evaluate(() => window.__SHOT__.repairPad());
    await page.evaluate(
      ([x, y]) => {
        window.__SHOT__.setHealth(35);
        window.__SHOT__.placeCar(x, y, 0);
      },
      [pad.x, pad.y] as const,
    );
    await page.waitForTimeout(1800);
    const repaired = await page.evaluate(() => window.__SHOT__.state());
    console.log(`  维修后车况: ${repaired.health.toFixed(0)}% (onPad=${repaired.onPad})`);
    if (repaired.health < 60 || !repaired.onPad) {
      console.log('  ⚠ 维修点没有生效');
      failed = true;
    }
    await shot(page, '05-repair');

    // 7. 车损冒烟（先开离维修点，否则会被立刻修好）
    await page.evaluate(
      ([x, y]) => {
        window.__SHOT__.placeCar(x, y, 0);
        window.__SHOT__.setHealth(8);
      },
      [pad.x - 300, pad.y] as const,
    );
    await page.waitForTimeout(700);
    const damaged = await page.evaluate(() => window.__SHOT__.state());
    console.log(`  车损状态: ${damaged.health.toFixed(0)}% / 冒烟 ${damaged.puffs} 次`);
    if (damaged.health > 20 || damaged.puffs === 0) {
      console.log('  ⚠ 车损/冒烟没有生效');
      failed = true;
    }
    await shot(page, '06-damage');

    if (errors.length) {
      console.log('\n  ⚠ 页面报错:');
      for (const e of errors.slice(0, 10)) console.log(`    ${e}`);
      failed = true;
    } else {
      console.log('\n  ✓ 无页面报错');
    }

    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
