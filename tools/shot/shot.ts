/**
 * 截图自检 —— AI 开发闭环
 *
 *   node tools/shot/shot.ts
 *
 * 流程：起 dev server → 无头 Chromium 打开游戏 → 模拟按键 → 截图到 .shots/
 * 每次改完玩法代码，跑一次这个，我自己看图判断"画面对不对"，
 * 不用麻烦你当人肉调试器。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { chromium, type Page } from 'playwright';

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

  try {
    console.log(`  打开 ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as never as { __GAME_READY__?: boolean }).__GAME_READY__ === true, {
      timeout: 30000,
    });
    await page.waitForTimeout(900);

    // 1. 初始画面
    await shot(page, '01-boot');

    // 2. 走到街上（用调试接口定位，再真按方向键走一段）
    await page.evaluate(() => {
      (window as never as { __SHOT__: { teleport: (x: number, y: number) => void } }).__SHOT__.teleport(-260, -170);
    });
    await hold(page, 'd', 900);
    await page.waitForTimeout(250);
    await shot(page, '02-walk');

    // 3. 上车
    await page.evaluate(() => {
      (window as never as { __SHOT__: { enterCar: () => void } }).__SHOT__.enterCar();
    });
    await page.waitForTimeout(350);
    await shot(page, '03-enter-car');

    // 4. 开车
    await hold(page, 'w', 1200);
    await hold(page, 'd', 700);
    await hold(page, 'w', 700);
    await page.waitForTimeout(250);
    await shot(page, '04-drive');

    // 5. 读一下运行时状态，确认逻辑真的跑起来了
    const state = await page.evaluate(() =>
      (window as never as { __SHOT__: { state: () => unknown } }).__SHOT__.state(),
    );
    console.log(`  运行时状态: ${JSON.stringify(state)}`);

    if (errors.length) {
      console.log('\n  ⚠ 页面报错:');
      for (const e of errors.slice(0, 10)) console.log(`    ${e}`);
      process.exitCode = 1;
    } else {
      console.log('\n  ✓ 无页面报错');
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
