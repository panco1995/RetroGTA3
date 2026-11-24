/** 俯视载具生成器 —— 车头朝 +X（引擎里用 rotation 转 8 方向，不出 8 张图） */
import { PAL, mulberry32, rr, ellipse, dropShadow, grain, newCanvas, shade } from './core.ts';

const GLASS = '#5d8aa6';

export type CarType = 'sedan' | 'taxi' | 'police' | 'van' | 'truck' | 'sports';

interface Spec {
  w: number;
  h: number;
  bodyW: number;
  bodyH: number;
  noseTaper: number;
  /** 车厢分区（相对车身中心的比例，+ 为车头方向） */
  trunkEnd: number;
  roofBack: number;
  roofFront: number;
  wsFront: number;
}

const SPECS: Record<CarType, Spec> = {
  sedan: { w: 128, h: 64, bodyW: 116, bodyH: 46, noseTaper: 0.78, trunkEnd: -0.26, roofBack: -0.14, roofFront: 0.08, wsFront: 0.20 },
  taxi: { w: 128, h: 64, bodyW: 116, bodyH: 46, noseTaper: 0.78, trunkEnd: -0.26, roofBack: -0.14, roofFront: 0.08, wsFront: 0.20 },
  police: { w: 128, h: 64, bodyW: 116, bodyH: 46, noseTaper: 0.80, trunkEnd: -0.26, roofBack: -0.14, roofFront: 0.08, wsFront: 0.20 },
  van: { w: 134, h: 62, bodyW: 124, bodyH: 52, noseTaper: 0.90, trunkEnd: -0.50, roofBack: -0.44, roofFront: 0.02, wsFront: 0.16 },
  truck: { w: 176, h: 86, bodyW: 164, bodyH: 70, noseTaper: 0.88, trunkEnd: -0.44, roofBack: -0.38, roofFront: 0.10, wsFront: 0.30 },
  sports: { w: 124, h: 56, bodyW: 114, bodyH: 40, noseTaper: 0.62, trunkEnd: -0.30, roofBack: -0.18, roofFront: 0.02, wsFront: 0.12 },
};

/** 车头收窄的圆角车身轮廓（注意所有 y 都要相对 cy） */
function bodyPath(ctx: any, cx: number, cy: number, len: number, wid: number, taper: number, r: number) {
  const hw = wid / 2;
  const noseW = hw * taper;
  const tail = cx - len / 2;
  const nose = cx + len / 2;
  ctx.beginPath();
  ctx.moveTo(tail + r, cy - hw);
  ctx.lineTo(nose - noseW * 0.35, cy - noseW);
  ctx.quadraticCurveTo(nose, cy - noseW, nose, cy - noseW + r);
  ctx.lineTo(nose, cy + noseW - r);
  ctx.quadraticCurveTo(nose, cy + noseW, nose - noseW * 0.35, cy + noseW);
  ctx.lineTo(tail + r, cy + hw);
  ctx.quadraticCurveTo(tail, cy + hw, tail, cy + hw - r);
  ctx.lineTo(tail, cy - hw + r);
  ctx.quadraticCurveTo(tail, cy - hw, tail + r, cy - hw);
  ctx.closePath();
}

/** 四轮：画在车身之下，靠两侧露出 5px，俯视才看得出是车 */
function wheels(ctx: any, s: Spec, cx: number, cy: number) {
  const ww = s.bodyW * 0.15;
  const wh = 12;
  const halfW = s.bodyH / 2;
  const xs = [cx + s.bodyW * 0.27, cx - s.bodyW * 0.27];
  const ys = [cy - halfW - 5, cy + halfW - 7];
  for (const x of xs) {
    for (const y of ys) {
      ctx.beginPath();
      rr(ctx, x - ww / 2, y, ww, wh, 5);
      ctx.fillStyle = '#1b1d21';
      ctx.fill();
      ctx.strokeStyle = '#0d0f12';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

export function drawCar(type: CarType, bodyColor: string, seed: number) {
  const s = SPECS[type];
  const { canvas, ctx } = newCanvas(s.w, s.h);
  const rng = mulberry32(seed);
  const cx = s.w / 2;
  const cy = s.h / 2;
  const L = s.bodyW;
  const W = s.bodyH;
  const hw = W / 2;

  const xTrunkEnd = cx + s.trunkEnd * L;
  const xRoofBack = cx + s.roofBack * L;
  const xRoofFront = cx + s.roofFront * L;
  const xWsFront = cx + s.wsFront * L;
  const noseX = cx + L / 2;
  const tailX = cx - L / 2;

  dropShadow(ctx, cx + 3, cy + 6, L * 0.45, W * 0.46, 0.3);
  wheels(ctx, s, cx, cy);

  /* ---- 车身 ---- */
  bodyPath(ctx, cx, cy, L, W, s.noseTaper, 10);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  bodyPath(ctx, cx, cy, L, W, s.noseTaper, 10);
  ctx.clip();
  // 后备箱 / 引擎盖：比车身略暗，形成分区
  ctx.fillStyle = shade(bodyColor, -0.07);
  ctx.fillRect(xWsFront, cy - hw, L / 2, W);
  ctx.fillStyle = shade(bodyColor, -0.05);
  ctx.fillRect(tailX, cy - hw, xTrunkEnd - tailX, W);
  // 统一光源（左上）：左上高光、右下暗部
  const hg = ctx.createLinearGradient(cx - L / 2, cy - hw, cx + L * 0.3, cy + hw);
  hg.addColorStop(0, 'rgba(255,255,255,0.20)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(cx - L / 2, cy - hw, L, W);
  const sg = ctx.createLinearGradient(0, cy, 0, cy + hw);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.26)');
  ctx.fillStyle = sg;
  ctx.fillRect(cx - L / 2, cy, L, hw);
  ctx.restore();

  /* ---- 风挡 / 车顶 / 后窗 ---- */
  const roofH = hw * 0.58;

  // 风挡：后窄前宽的梯形
  ctx.beginPath();
  ctx.moveTo(xRoofFront, cy - roofH);
  ctx.lineTo(xWsFront, cy - hw * 0.70);
  ctx.lineTo(xWsFront, cy + hw * 0.70);
  ctx.lineTo(xRoofFront, cy + roofH);
  ctx.closePath();
  ctx.fillStyle = GLASS;
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // 玻璃反光
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(xRoofFront, cy - roofH);
  ctx.lineTo(xWsFront, cy - hw * 0.70);
  ctx.lineTo(xWsFront, cy - hw * 0.30);
  ctx.lineTo(xRoofFront, cy - roofH * 0.25);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.restore();

  // 车顶
  ctx.beginPath();
  rr(ctx, xRoofBack, cy - roofH, xRoofFront - xRoofBack, roofH * 2, 5);
  ctx.fillStyle = shade(bodyColor, 0.12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 后窗
  ctx.beginPath();
  ctx.moveTo(xRoofBack, cy - roofH);
  ctx.lineTo(xTrunkEnd, cy - hw * 0.66);
  ctx.lineTo(xTrunkEnd, cy + hw * 0.66);
  ctx.lineTo(xRoofBack, cy + roofH);
  ctx.closePath();
  ctx.fillStyle = shade(GLASS, -0.22);
  ctx.fill();
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* ---- 灯具 / 保险杠 / 后视镜 ---- */
  const lamp = (x: number, y: number, fill: string) => {
    ctx.beginPath();
    rr(ctx, x, y, 10, 9, 3);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  lamp(noseX - 13, cy - hw * 0.64, '#f0e2b4');
  lamp(noseX - 13, cy + hw * 0.64 - 9, '#f0e2b4');
  lamp(tailX + 3, cy - hw * 0.64, PAL.hudRed);
  lamp(tailX + 3, cy + hw * 0.64 - 9, PAL.hudRed);

  ctx.fillStyle = shade(bodyColor, -0.42);
  ctx.fillRect(noseX - 6, cy - hw * 0.72, 6, W * 0.72);
  ctx.fillRect(tailX, cy - hw * 0.72, 6, W * 0.72);

  // 后视镜
  ctx.fillStyle = shade(bodyColor, -0.3);
  ctx.fillRect(xWsFront - 3, cy - hw - 2, 8, 5);
  ctx.fillRect(xWsFront - 3, cy + hw - 3, 8, 5);

  /* ---- 车型特征 ---- */
  if (type === 'taxi') {
    ctx.beginPath();
    rr(ctx, xRoofBack + 6, cy - 9, 24, 18, 4);
    ctx.fillStyle = PAL.hudYellow;
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PAL.outline;
    for (let i = 0; i < 4; i++) ctx.fillRect(tailX + 24 + i * 20, cy - hw + 1, 10, 5);
    for (let i = 0; i < 4; i++) ctx.fillRect(tailX + 24 + i * 20, cy + hw - 6, 10, 5);
  }
  if (type === 'police') {
    ctx.beginPath();
    rr(ctx, xRoofBack + 5, cy - 8, 30, 16, 4);
    ctx.fillStyle = '#1f3a6e';
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PAL.hudRed;
    ctx.fillRect(xRoofBack + 8, cy - 6, 10, 12);
    ctx.fillStyle = '#5aa0ff';
    ctx.fillRect(xRoofBack + 20, cy - 6, 10, 12);
    ctx.fillStyle = '#2d5894';
    ctx.fillRect(tailX + 14, cy - hw, L - 32, 6);
    ctx.fillRect(tailX + 14, cy + hw - 6, L - 32, 6);
  }
  if (type === 'sports') {
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(tailX + 6, cy - hw - 2, 18, 5);
    ctx.fillRect(tailX + 6, cy + hw - 3, 18, 5);
    ellipse(ctx, tailX + 9, cy + hw * 0.3, 4, 4, '#6b6f75', PAL.outline, 2);
    ellipse(ctx, tailX + 9, cy - hw * 0.3, 4, 4, '#6b6f75', PAL.outline, 2);
  }
  if (type === 'truck') {
    // 货箱压在车身后半
    const boxX = tailX + 4;
    const boxW = xTrunkEnd - boxX;
    ctx.beginPath();
    rr(ctx, boxX, cy - hw + 5, boxW, W - 10, 5);
    ctx.fillStyle = shade(bodyColor, -0.18);
    ctx.fill();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const x = boxX + (i * boxW) / 6;
      ctx.beginPath();
      ctx.moveTo(x, cy - hw + 8);
      ctx.lineTo(x, cy + hw - 8);
      ctx.stroke();
    }
  }
  if (type === 'van') {
    // 侧窗
    ctx.fillStyle = shade(PAL.glass, -0.12);
    ctx.fillRect(xRoofBack + 10, cy - roofH - 2, 14, 5);
    ctx.fillRect(xRoofBack + 10, cy + roofH - 3, 14, 5);
    ctx.fillStyle = shade(bodyColor, -0.12);
    ctx.fillRect(xRoofBack + 28, cy - roofH - 2, 14, 5);
    ctx.fillRect(xRoofBack + 28, cy + roofH - 3, 14, 5);
  }

  grain(ctx, s.w, s.h, rng, {
    count: 300,
    colors: [shade(bodyColor, 0.4), shade(bodyColor, -0.4)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.16,
  });

  return canvas;
}

export const CAR_TYPES: CarType[] = ['sedan', 'taxi', 'police', 'van', 'truck', 'sports'];
