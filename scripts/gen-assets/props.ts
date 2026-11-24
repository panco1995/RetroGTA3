/** 街景道具 + 建筑屋顶生成器 */
import { PAL, mulberry32, ellipse, outlineRR, dropShadow, grain, newCanvas, shade } from './core.ts';

/* ---------------- 道具 ---------------- */

export function streetlight() {
  const { canvas, ctx } = newCanvas(48, 48);
  dropShadow(ctx, 24, 26, 13, 7, 0.26);
  ellipse(ctx, 24, 24, 11, 11, '#4a4e54', PAL.outline, 3);
  ellipse(ctx, 21, 21, 6, 6, '#5e636a');
  ellipse(ctx, 24, 24, 4, 4, PAL.hudYellow, PAL.outline, 2);
  return canvas;
}

export function trashcan() {
  const { canvas, ctx } = newCanvas(40, 40);
  dropShadow(ctx, 20, 22, 11, 7, 0.26);
  ellipse(ctx, 20, 20, 12, 12, '#4d5259', PAL.outline, 3);
  ellipse(ctx, 20, 20, 9, 9, '#5b6169');
  ellipse(ctx, 20, 20, 4, 4, '#33373c');
  return canvas;
}

export function tree() {
  const { canvas, ctx } = newCanvas(72, 72);
  const rng = mulberry32(21);
  dropShadow(ctx, 36, 38, 20, 11, 0.3);
  // 冠层：多层不规则圆
  const blobs = [
    [36, 32, 24],
    [24, 38, 17],
    [48, 38, 17],
    [30, 24, 16],
    [44, 24, 16],
  ];
  for (const [x, y, r] of blobs) {
    ellipse(ctx, x, y, r, r * 0.92, PAL.grassDark, PAL.outline, 2.5);
  }
  for (const [x, y, r] of blobs) {
    ellipse(ctx, x - 2, y - 3, r * 0.72, r * 0.66, PAL.grass, 'rgba(0,0,0,0)');
  }
  ellipse(ctx, 30, 22, 13, 10, PAL.grassLight);
  grain(ctx, 72, 72, rng, {
    count: 300,
    colors: [PAL.grassLight, PAL.grassDark],
    sizeMin: 1,
    sizeMax: 3,
    alpha: 0.35,
  });
  return canvas;
}

export function cone() {
  const { canvas, ctx } = newCanvas(36, 36);
  dropShadow(ctx, 18, 20, 9, 5, 0.24);
  ellipse(ctx, 18, 18, 8, 8, '#c85a1e', PAL.outline, 2.5);
  ellipse(ctx, 18, 18, 5, 5, '#e87f3a');
  ellipse(ctx, 18, 18, 2.5, 2.5, PAL.white);
  return canvas;
}

export function hydrant() {
  const { canvas, ctx } = newCanvas(36, 36);
  dropShadow(ctx, 18, 20, 8, 5, 0.24);
  ellipse(ctx, 18, 18, 8, 9, PAL.hudRed, PAL.outline, 2.5);
  ellipse(ctx, 13, 18, 4, 3, shade(PAL.hudRed, -0.2), PAL.outline, 2);
  ellipse(ctx, 23, 18, 4, 3, shade(PAL.hudRed, -0.2), PAL.outline, 2);
  ellipse(ctx, 18, 14, 4, 4, shade(PAL.hudRed, 0.25));
  return canvas;
}

export function bench() {
  const { canvas, ctx } = newCanvas(64, 36);
  dropShadow(ctx, 32, 20, 24, 8, 0.26);
  outlineRR(ctx, 6, 10, 52, 10, 3, '#7a5a3c', PAL.outline, 2.5);
  outlineRR(ctx, 6, 22, 52, 8, 3, '#6a4e35', PAL.outline, 2.5);
  outlineRR(ctx, 10, 6, 5, 26, 2, '#4d5259', PAL.outline, 2.5);
  outlineRR(ctx, 49, 6, 5, 26, 2, '#4d5259', PAL.outline, 2.5);
  return canvas;
}

export function mailbox() {
  const { canvas, ctx } = newCanvas(44, 44);
  dropShadow(ctx, 22, 23, 10, 6, 0.26);
  outlineRR(ctx, 10, 8, 24, 28, 4, '#3d6ea8', PAL.outline, 3);
  outlineRR(ctx, 14, 12, 16, 9, 2, '#5b8cc4');
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(20, 26, 5, 7);
  return canvas;
}

export function newsstand() {
  const { canvas, ctx } = newCanvas(72, 56);
  dropShadow(ctx, 36, 30, 28, 12, 0.28);
  outlineRR(ctx, 8, 8, 56, 42, 4, '#5a5346', PAL.outline, 3);
  outlineRR(ctx, 12, 12, 48, 16, 3, '#c9a24a', PAL.outline, 2.5);
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(16, 17, 40, 3);
  ctx.fillRect(16, 22, 26, 3);
  outlineRR(ctx, 12, 32, 48, 14, 3, '#3e3a32', PAL.outline, 2);
  return canvas;
}

/* ---------------- 建筑屋顶 ---------------- */

/**
 * 无边框的屋顶底纹 —— 给大片建筑平铺用。
 * 单独画边框会在平铺时露出网格，所以边框交给城市构建器画。
 */
export function roofSurface(variant: number) {
  const { canvas, ctx } = newCanvas(128, 128);
  const rng = mulberry32(400 + variant);
  const base = variant === 1 ? shade(PAL.roof, 0.06) : PAL.roof;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  // 轻微色块（不同屋面材质），alpha 低一点避免平铺时看出重复
  for (let i = 0; i < 4; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const r = 24 + rng() * 36;
    ctx.fillStyle = rng() > 0.5 ? shade(base, 0.08) : shade(base, -0.1);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  grain(ctx, 128, 128, rng, {
    count: 800,
    colors: [shade(base, 0.16), shade(base, -0.18)],
    sizeMin: 1,
    sizeMax: 3,
    alpha: 0.34,
  });
  // 屋面板缝
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * 128) / 4, 0);
    ctx.lineTo((i * 128) / 4, 128);
    ctx.moveTo(0, (i * 128) / 4);
    ctx.lineTo(128, (i * 128) / 4);
    ctx.stroke();
  }
  return canvas;
}

/** 屋顶空调外机（贴花，放到建筑屋顶上） */
export function acUnit() {
  const { canvas, ctx } = newCanvas(36, 30);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(4, 22, 30, 6);
  outlineRR(ctx, 2, 2, 32, 22, 3, '#5b6169', PAL.outline, 2.5);
  ellipse(ctx, 18, 13, 9, 9, '#41464c', PAL.outline, 2);
  ellipse(ctx, 18, 13, 4, 4, '#2b2f34');
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(5, 5, 26, 4);
  return canvas;
}

/** 屋顶水塔（贴花） */
export function waterTower() {
  const { canvas, ctx } = newCanvas(52, 52);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(8, 42, 38, 7);
  ellipse(ctx, 26, 24, 21, 21, shade(PAL.brick, -0.08), PAL.outline, 3);
  ellipse(ctx, 20, 18, 11, 10, shade(PAL.brick, 0.16));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    ellipse(ctx, 26 + Math.cos(a) * 15, 24 + Math.sin(a) * 15, 4, 4, PAL.roofDark, PAL.outline, 2);
  }
  return canvas;
}

export function roof(variant: number) {
  const { canvas, ctx } = newCanvas(128, 128);
  const rng = mulberry32(300 + variant);
  ctx.fillStyle = PAL.roof;
  ctx.fillRect(0, 0, 128, 128);
  // 屋顶面纹理
  grain(ctx, 128, 128, rng, {
    count: 900,
    colors: [shade(PAL.roof, 0.18), shade(PAL.roof, -0.22)],
    sizeMin: 1,
    sizeMax: 3,
    alpha: 0.4,
  });
  // 分块接缝
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * 128) / 4, 0);
    ctx.lineTo((i * 128) / 4, 128);
    ctx.moveTo(0, (i * 128) / 4);
    ctx.lineTo(128, (i * 128) / 4);
    ctx.stroke();
  }
  // 边缘：四周内收的暗边（屋顶女儿墙投影）
  ctx.strokeStyle = shade(PAL.roofDark, -0.2);
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.strokeStyle = shade(PAL.roof, 0.2);
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 104, 104);

  if (variant % 3 === 0) {
    // 空调外机
    for (const [x, y] of [
      [26, 30],
      [72, 44],
      [40, 82],
    ]) {
      outlineRR(ctx, x, y, 30, 22, 3, '#5b6169', PAL.outline, 2.5);
      ellipse(ctx, x + 15, y + 11, 8, 8, '#41464c', PAL.outline, 2);
      ellipse(ctx, x + 15, y + 11, 4, 4, '#2b2f34');
    }
  }
  if (variant % 3 === 1) {
    // 水塔
    ellipse(ctx, 64, 60, 30, 30, shade(PAL.brick, -0.1), PAL.outline, 3);
    ellipse(ctx, 58, 54, 14, 12, shade(PAL.brick, 0.15));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      ellipse(ctx, 64 + Math.cos(a) * 22, 60 + Math.sin(a) * 22, 5, 5, PAL.roofDark, PAL.outline, 2);
    }
  }
  if (variant % 3 === 2) {
    // 通风管 + 天线
    for (const [x, y] of [
      [24, 26],
      [50, 40],
      [84, 28],
    ]) {
      ellipse(ctx, x, y, 10, 10, '#6a6f76', PAL.outline, 2.5);
      ellipse(ctx, x, y, 5, 5, '#3b3f45');
    }
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(96, 90);
    ctx.lineTo(96, 52);
    ctx.moveTo(88, 62);
    ctx.lineTo(104, 62);
    ctx.stroke();
  }
  return canvas;
}

/** 建筑外墙（挤出侧面） */
export function buildingSide(variant: number) {
  const { canvas, ctx } = newCanvas(128, 96);
  const rng = mulberry32(700 + variant);
  const base = variant % 2 === 0 ? PAL.concrete : PAL.brick;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 96);
  if (variant % 2 === 0) {
    for (let y = 0; y < 96; y += 24) {
      ctx.fillStyle = shade(base, (y / 96) * 0.3 - 0.1);
      ctx.fillRect(0, y, 128, 24);
    }
  } else {
    for (let y = 0; y < 96; y += 12) {
      for (let x = 0; x < 128; x += 24) {
        ctx.fillStyle = shade(base, ((x / 24 + y / 12) % 2 === 0 ? 0.08 : -0.08));
        ctx.fillRect(x + 1, y + 1, 22, 10);
      }
    }
  }
  // 窗户
  for (let y = 10; y < 88; y += 24) {
    for (let x = 10; x < 118; x += 26) {
      const lit = rng() > 0.55;
      outlineRR(ctx, x, y, 16, 13, 2, lit ? '#d8c274' : PAL.glass, PAL.outline, 2);
      if (lit) {
        ctx.fillStyle = 'rgba(255,235,170,0.5)';
        ctx.fillRect(x, y, 16, 13);
      }
    }
  }
  grain(ctx, 128, 96, rng, {
    count: 500,
    colors: [shade(base, 0.2), shade(base, -0.25)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.28,
  });
  return canvas;
}
