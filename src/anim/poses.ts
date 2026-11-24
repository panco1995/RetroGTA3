/**
 * 角色动画关键帧数据
 *
 * 所有角度单位是弧度：
 *   arm / leg  0 = 自然下垂（沿 +Y），正值 = 向前摆
 *   bob        躯干上下浮动（像素）
 *   lean       躯干前倾（弧度）
 *
 * 这里只有数字，没有一张图片 —— AI 写起来可靠，
 * 而且改一个数全场角色都跟着变。
 */
export interface Pose {
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  bob: number;
  lean: number;
}

function pose(armL: number, armR: number, legL: number, legR: number, bob: number, lean: number): Pose {
  return { armL, armR, legL, legR, bob, lean };
}

/** 站立：只有轻微呼吸 */
export const POSE_IDLE: Pose[] = [
  pose(0, 0, 0, 0, 0, 0),
  pose(0.06, -0.06, 0, 0, -1, 0),
  pose(0, 0, 0, 0, 0, 0),
  pose(-0.06, 0.06, 0, 0, -1, 0),
];

/** 走路：8 帧一个完整周期 */
export const POSE_WALK: Pose[] = [
  pose(0, 0, 0, 0, 0, 0),
  pose(0.35, -0.35, -0.28, 0.28, -1, 0.02),
  pose(0.5, -0.45, -0.42, 0.38, -2, 0.04),
  pose(0.35, -0.35, -0.28, 0.28, -1, 0.02),
  pose(0, 0, 0, 0, 0, 0),
  pose(-0.35, 0.35, 0.28, -0.28, -1, 0.02),
  pose(-0.5, 0.45, 0.42, -0.38, -2, 0.04),
  pose(-0.35, 0.35, 0.28, -0.28, -1, 0.02),
];

/** 跑步：幅度更大、前倾更明显 */
export const POSE_RUN: Pose[] = [
  pose(0, 0, 0, 0, 0, 0.06),
  pose(0.7, -0.7, -0.6, 0.6, -2, 0.12),
  pose(1.0, -0.9, -0.9, 0.8, -4, 0.16),
  pose(0.7, -0.7, -0.6, 0.6, -2, 0.12),
  pose(0, 0, 0, 0, 0, 0.06),
  pose(-0.7, 0.7, 0.6, -0.6, -2, 0.12),
  pose(-1.0, 0.9, 0.9, -0.8, -4, 0.16),
  pose(-0.7, 0.7, 0.6, -0.6, -2, 0.12),
];

/** 开车坐姿：手臂向前扶方向盘 */
export const POSE_DRIVE: Pose[] = [pose(Math.PI, Math.PI, 0.7, 0.7, -4, 0.12)];
