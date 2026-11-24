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

/** 方向数：0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW（顺时针） */
export const BAKED_DIRS = 8;

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

/** 角色在世界里的实际身高（像素） */
export const BAKED_HEIGHT = 58 * BAKED_SCALE;

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

