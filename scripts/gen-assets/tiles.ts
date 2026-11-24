/** 地面瓦片生成器 — 无缝平铺，4 变体随机铺 */
import { PAL, mulberry32, wrapDraw, fillRR, grain, cracks, newCanvas, shade } from './core.ts';

const TILE = 128; // 2x 高清（逻辑 64）

function asphalt(seed: number) {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  ctx.fillStyle = PAL.asphalt;
  ctx.fillRect(0, 0, TILE, TILE);
  // 大块色斑（补丁路面）
  for (let i = 0; i < 6; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    const r = 12 + rng() * 34;
    const c = rng() > 0.5 ? PAL.asphaltDark : PAL.asphaltLight;
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.35;
    wrapDraw(ctx, TILE, TILE, (dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(x + dx * TILE, y + dy * TILE, r, r * 0.7, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  grain(ctx, TILE, TILE, rng, {
    count: 1400,
    colors: [shade(PAL.asphalt, 0.25), shade(PAL.asphalt, -0.35), PAL.asphaltDark],
    sizeMin: 1,
    sizeMax: 3,
    alpha: 0.5,
  });
  cracks(ctx, TILE, TILE, rng, 3, shade(PAL.asphaltDark, -0.4));
  // 车道中线（部分变体带）
  if (seed % 4 === 0) {
    ctx.fillStyle = shade(PAL.hudYellow, -0.35);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 4; i++) ctx.fillRect(TILE / 2 - 4, i * 32 + 6, 8, 20);
    ctx.globalAlpha = 1;
  }
  return canvas;
}

function sidewalk(seed: number) {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  ctx.fillStyle = PAL.sidewalk;
  ctx.fillRect(0, 0, TILE, TILE);
  // 4 块水泥板（无缝）
  const cell = TILE / 4;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const v = (rng() - 0.5) * 0.12;
      ctx.fillStyle = shade(PAL.sidewalk, v);
      ctx.fillRect(gx * cell + 1.5, gy * cell + 1.5, cell - 3, cell - 3);
    }
  }
  // 板缝
  ctx.strokeStyle = shade(PAL.sidewalk, -0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, TILE);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(TILE, i * cell);
    ctx.stroke();
  }
  grain(ctx, TILE, TILE, rng, {
    count: 700,
    colors: [shade(PAL.sidewalk, 0.3), shade(PAL.sidewalk, -0.3)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.4,
  });
  return canvas;
}

function grass(seed: number) {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  ctx.fillStyle = PAL.grass;
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 14; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    const r = 10 + rng() * 26;
    const c = rng() > 0.45 ? PAL.grassDark : PAL.grassLight;
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.4;
    wrapDraw(ctx, TILE, TILE, (dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(x + dx * TILE, y + dy * TILE, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  // 草叶短线
  for (let i = 0; i < 260; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    ctx.strokeStyle = rng() > 0.5 ? PAL.grassLight : PAL.grassDark;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y - 3 - rng() * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function water(seed: number) {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  const g = ctx.createLinearGradient(0, 0, TILE, TILE);
  g.addColorStop(0, PAL.waterDark);
  g.addColorStop(0.5, PAL.water);
  g.addColorStop(1, PAL.waterDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE, TILE);
  // 波纹（水平线，无缝：每条线周期 = TILE）
  for (let i = 0; i < 9; i++) {
    const y = (i * TILE) / 9 + (rng() - 0.5) * 3;
    ctx.strokeStyle = rng() > 0.5 ? shade(PAL.water, 0.28) : shade(PAL.water, -0.3);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2 + rng() * 2;
    ctx.beginPath();
    for (let x = 0; x <= TILE; x += 8) {
      const yy = y + Math.sin((x / TILE) * Math.PI * 2 + i) * 3;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  grain(ctx, TILE, TILE, rng, {
    count: 300,
    colors: [shade(PAL.water, 0.35)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.25,
  });
  return canvas;
}

function sand(seed: number) {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  ctx.fillStyle = PAL.sand;
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 10; i++) {
    const x = rng() * TILE;
    const y = rng() * TILE;
    const r = 12 + rng() * 28;
    ctx.fillStyle = PAL.sandDark;
    ctx.globalAlpha = 0.3;
    wrapDraw(ctx, TILE, TILE, (dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(x + dx * TILE, y + dy * TILE, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  grain(ctx, TILE, TILE, rng, {
    count: 1600,
    colors: [shade(PAL.sand, 0.25), shade(PAL.sand, -0.28)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.45,
  });
  return canvas;
}

/** 斑马线：透明底覆盖层 */
function crosswalk() {
  const { canvas, ctx } = newCanvas(TILE, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 4; i++) {
    fillRR(ctx, i * 32 + 6, 0, 20, TILE, 2, 'rgba(242,240,234,0.86)');
  }
  return canvas;
}

/** 路缘石（横向） */
function curb() {
  const { canvas, ctx } = newCanvas(TILE, 32);
  const rng = mulberry32(77);
  ctx.fillStyle = PAL.curb;
  ctx.fillRect(0, 0, TILE, 32);
  ctx.fillStyle = shade(PAL.curb, -0.3);
  ctx.fillRect(0, 26, TILE, 6);
  ctx.fillStyle = shade(PAL.curb, 0.2);
  ctx.fillRect(0, 0, TILE, 4);
  grain(ctx, TILE, 32, rng, {
    count: 200,
    colors: [shade(PAL.curb, -0.25), shade(PAL.curb, 0.2)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.35,
  });
  return canvas;
}

export const TILE_BUILDERS: Record<string, (seed: number) => any> = {
  asphalt,
  sidewalk,
  grass,
  water,
  sand,
};

export const TILE_OVERLAYS: Record<string, () => any> = { crosswalk, curb };
