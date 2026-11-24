/**
 * 角色"纸片人"部件生成器（cutout rig）—— 纯俯视
 *
 * 关键设计：不做多帧序列图。角色拆成独立部件，
 * 动画 = 运行时按关键帧数字变换部件角度/位置。
 * → 风格绝对一致，换服装/体型/肤色只是一个参数。
 *
 * 朝向约定：默认朝 -Y（画面上方）。引擎里旋转整个容器实现 8 方向。
 */
import { PAL, mulberry32, ellipse, outlineRR, grain, newCanvas, shade } from './core.ts';

export interface ActorPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
}

export const ACTOR_PRESETS: Record<string, ActorPalette> = {
  player: { skin: PAL.skin, hair: PAL.hair, shirt: PAL.cloth, pants: '#3b4250', shoes: '#22242a' },
  ped_a: { skin: '#a9714a', hair: '#241a14', shirt: '#6f7f4e', pants: '#3a3f48', shoes: '#22242a' },
  ped_b: { skin: '#e0b48c', hair: '#6b4526', shirt: '#8a4f46', pants: '#2f3540', shoes: '#22242a' },
  ped_c: { skin: '#7d5236', hair: '#141414', shirt: '#43566b', pants: '#4a4438', shoes: '#22242a' },
};

/** 头（俯视 44×44）：后脑是头发，前额露皮肤，正前方一个小鼻子指示朝向 */
export function head(p: ActorPalette) {
  const { canvas, ctx } = newCanvas(44, 44);
  const c = 22;
  const r = 20;
  ellipse(ctx, c, c, r, r, p.skin, PAL.outline, 3);
  // 头发盖住后脑（+Y 半侧）
  ctx.beginPath();
  ctx.arc(c, c, r - 1, 0, Math.PI, false);
  ctx.fillStyle = p.hair;
  ctx.fill();
  // 前额发际线
  ctx.beginPath();
  ctx.arc(c, c, r - 1, Math.PI * 1.12, Math.PI * 1.88, false);
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 5;
  ctx.stroke();
  // 鼻子（朝向指示）
  ellipse(ctx, c, c - r + 4, 4, 4, shade(p.skin, 0.12), PAL.outline, 1.5);
  // 高光
  ellipse(ctx, c - 6, c - 6, 6, 5, 'rgba(255,255,255,0.20)');
  return canvas;
}

/** 躯干（俯视 64×56）：肩部椭圆 + 领口 */
export function torso(p: ActorPalette) {
  const { canvas, ctx } = newCanvas(64, 56);
  const c = 32;
  ellipse(ctx, c, c, 28, 23, p.shirt, PAL.outline, 3);
  // 前胸略亮
  ellipse(ctx, c, c - 6, 22, 17, shade(p.shirt, 0.12));
  // 背侧略暗
  ellipse(ctx, c, c + 8, 21, 13, shade(p.shirt, -0.2));
  // 领口
  ellipse(ctx, c, c - 1, 9, 7, shade(p.shirt, -0.34), PAL.outline, 2);
  return canvas;
}

/** 手臂（俯视 18×36）：肩膀在上端，手在下端。动画时绕肩旋转 */
export function arm(p: ActorPalette) {
  const { canvas, ctx } = newCanvas(18, 36);
  outlineRR(ctx, 4, 2, 10, 26, 5, p.shirt, PAL.outline, 2.5);
  ellipse(ctx, 9, 30, 6, 6, p.skin, PAL.outline, 2.5);
  return canvas;
}

/** 腿（俯视 20×36）：大腿 + 鞋。俯视时只在躯干下方露出一点 */
export function leg(p: ActorPalette) {
  const { canvas, ctx } = newCanvas(20, 36);
  outlineRR(ctx, 5, 2, 10, 26, 5, p.pants, PAL.outline, 2.5);
  outlineRR(ctx, 4, 24, 12, 10, 4, p.shoes, PAL.outline, 2.5);
  return canvas;
}

/**
 * 参考图：把部件拼成完整角色俯视图（仅供人工核对比例，不进游戏）
 */
export function actorReference(p: ActorPalette) {
  const { canvas, ctx } = newCanvas(120, 140);
  const rng = mulberry32(5);
  const cx = 60;

  // 投影
  ellipse(ctx, cx, 84, 28, 12, 'rgba(10,12,15,0.26)');

  // 腿（从躯干下方伸出，指向"后"）
  ctx.drawImage(leg(p), cx - 20, 52);
  ctx.drawImage(leg(p), cx + 2, 52);

  // 躯干
  ctx.drawImage(torso(p), cx - 32, 26);

  // 手臂（两侧，肩部在躯干上缘）
  ctx.drawImage(arm(p), cx - 34, 30);
  ctx.drawImage(arm(p), cx + 16, 30);

  // 头（压在躯干正中，偏前）
  ctx.drawImage(head(p), cx - 22, 8);

  grain(ctx, 120, 140, rng, {
    count: 160,
    colors: [shade(p.shirt, 0.4), shade(p.shirt, -0.3)],
    sizeMin: 1,
    sizeMax: 2,
    alpha: 0.18,
  });
  return canvas;
}
