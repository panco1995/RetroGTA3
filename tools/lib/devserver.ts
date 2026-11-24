/**
 * 开发服务器辅助 —— 截图自检和素材烘焙共用
 */
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

export const DEV_PORT = 5199;
// 注意：Vite 8 默认绑 localhost（可能是 IPv6 的 ::1），不要写死 127.0.0.1
export const DEV_URL = `http://localhost:${DEV_PORT}`;

export async function waitPort(port: number, timeout = 40000): Promise<boolean> {
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

/** 起一个 Vite dev server；已有服务在跑就复用 */
export async function startVite(port = DEV_PORT): Promise<ChildProcess | null> {
  if (await waitPort(port, 800)) return null;
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    env: process.env,
  });
  if (!(await waitPort(port))) {
    server.kill();
    throw new Error(`dev server 启动超时 (:${port})`);
  }
  return server;
}
