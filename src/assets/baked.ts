/**
 * 烘焙角色资产的共享常量（单一事实源）
 *
 * 烘焙脚本（tools/bake/bake.ts）和游戏引擎（src/）都从这里取，
 * 避免「烘焙改了尺寸、游戏还按老尺寸加载」这种坑。
 *
 * 流水线：
 *   CC0 低模 3D 模型（assets-src/characters/animated-human/）
 *     → tools/bake/bake.ts 离线渲染 8 方向 × N 帧
 *     → assets-src/baked/*.png
 *     → npm run gen 拷进 public/assets/proc/baked/
 *     → Phaser 当 spritesheet 加载
 */

/** 单帧单元尺寸（像素） */
export const BAKED_CELL = 96;

/** 每个动画的帧数 */
export const BAKED_FRAMES = 8;

/**
 * 脚底锚点在单元里的位置（0=顶部，1=底部）。
 * 烘焙时相机就是按这个点对齐的，所以游戏里把精灵的原点设成它，
 * 角色的脚就会稳稳落在世界坐标上。
 */
export const BAKED_ANCHOR = { x: 0.5, y: 0.66 } as const;

/** 烘焙出来的动画列表 */
export const BAKED_ANIMS = ['idle', 'walk', 'run', 'death'] as const;
export type BakedAnim = (typeof BAKED_ANIMS)[number];

/**
 * 单元尺寸到世界尺寸的缩放。
 *
 * 参照物：车是 128×64 世界像素，路面宽 270（两个车道）。
 * 烘焙出来的角色在单元里高 58px（占 66%），乘 1.2 后 ≈ 70 世界像素，
 * 比车身略高 —— 跟 GTA3 里「行人略高于车身」的比例一致。
 */
export const BAKED_SCALE = 1.2;

/** NPC 变体 id（换色得到，见 tools/bake/npc-palettes.ts） */
export const NPC_IDS = ['worker', 'punk', 'lady', 'jogger', 'oldman', 'cop'] as const;
export type NpcId = (typeof NPC_IDS)[number];

/**
 * Phaser 纹理 key
 *   玩家：baked_walk / baked_idle / baked_run / baked_death
 *   NPC： baked_npc_worker_walk / …
 */
export function bakedTextureKey(anim: BakedAnim, npcId?: NpcId): string {
  return npcId ? `baked_npc_${npcId}_${anim}` : `baked_${anim}`;
}


/* ============================================================
   车辆（Kenney Car Kit → 32 方向精灵）
   ============================================================ */

/**
 * 车辆单元尺寸（像素）—— **兜底默认值**。
 *
 * 真正的值由烘焙脚本根据「全部车型的实际投影范围」算出来，
 * 会随车型组合变化（8 款车时是 157px，25 款车时是 175px）。
 * 所以 BootScene 载入 manifest 后会把真实值写进下面的 `CAR_RUNTIME`，
 * 引擎一律从 `CAR_RUNTIME` 读，不要直接用这里的常量。
 */
export const CAR_CELL = 175;

/** 每辆车的方向数（32 = 11.25° 一档，车转弯才不会一顿一顿） */
export const CAR_ANGLES = 32;

/** 每格角度步长（弧度） */
export const CAR_ANGLE_STEP = (Math.PI * 2) / CAR_ANGLES;

/** 车地面中心在单元里的位置（游戏里放精灵要按这个对位）—— 兜底默认值 */
export const CAR_ANCHOR = { x: 0.5, y: 0.6157 } as const;

/**
 * 运行时的车辆图集参数。
 *
 * 为什么要运行时才知道：烘焙脚本要按**所有车型**的外接范围定一台共用相机，
 * 单元尺寸和锚点都是算出来的，不是常量。车型表一变，单元就变，
 * 硬编码在代码里的常量会静默失配（车会浮在地面上方或陷进地里）。
 * 所以：manifest → BootScene → 这里 → Vehicle。
 */
export const CAR_RUNTIME: { cell: number; anchor: { x: number; y: number } } = {
  cell: CAR_CELL,
  anchor: { x: CAR_ANCHOR.x, y: CAR_ANCHOR.y },
};

/** 引擎侧车型 id（对应 assets-src/baked/vehicles/<id>.png） */
export const CAR_IDS = [
  'sedan',
  'taxi',
  'police',
  'ambulance',
  'van',
  'truck',
  'sports',
  'suv',
  'delivery',
  'deliveryflat',
  'truckflat',
  'firetruck',
  'garbage',
  'hatchsports',
  'race',
  'racefuture',
  'suvluxury',
  'tractor',
  'tractorpolice',
  'tractorshovel',
] as const;
export type CarId = (typeof CAR_IDS)[number];

/** Phaser 纹理 key */
export function carTextureKey(id: CarId): string {
  return `baked_car_${id}`;
}
