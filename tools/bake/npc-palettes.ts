/**
 * NPC 配色表
 *
 * 原理：Quaternius 的角色贴图是 32×32 的「纯色区图集」，
 * 整张图只有 5 种颜色，每个区域都是平涂：
 *
 *   皮肤 / 五官(深色) / 头发 / 上衣 / 裤子
 *
 * 所以换色就是「按精确 RGB 替换」——不需要重新建模、
 * 不需要 AI 生图、也不消耗任何外部额度。
 * 一个 3D 模型 + 一张配色表 = 无限个 NPC。
 */

export type RGB = [number, number, number];

export interface NpcPalette {
  /** 目录名 / 纹理名 */
  id: string;
  /** 上衣 */
  shirt: RGB;
  /** 裤子 */
  pants: RGB;
  /** 头发（也用来做帽子） */
  hair: RGB;
  /** 皮肤 */
  skin: RGB;
  /** 五官深色，默认沿用原色 */
  dark?: RGB;
}

/** 原贴图里 5 个色区的基准色（用于精确匹配） */
export const BASE_COLORS = {
  skin: [255, 209, 159] as RGB,
  dark: [41, 41, 41] as RGB,
  hair: [124, 88, 35] as RGB,
  shirt: [115, 167, 196] as RGB,
  pants: [21, 96, 189] as RGB,
};

const key = (c: RGB) => `${c[0]},${c[1]},${c[2]}`;

/** 玩家角色（保留原模型配色） */
export const PLAYER_PALETTE: NpcPalette = {
  id: 'player',
  shirt: BASE_COLORS.shirt,
  pants: BASE_COLORS.pants,
  hair: BASE_COLORS.hair,
  skin: BASE_COLORS.skin,
  dark: BASE_COLORS.dark,
};

/** 街道上的 NPC —— 覆盖不同肤色/发色/衣着，方便一眼看出是不同人 */
export const NPC_PALETTES: NpcPalette[] = [
  {
    id: 'worker',
    shirt: [214, 176, 74],
    pants: [62, 84, 122],
    hair: [58, 42, 30],
    skin: [246, 196, 148],
  },
  {
    id: 'punk',
    shirt: [186, 62, 74],
    pants: [36, 38, 46],
    hair: [196, 72, 142],
    skin: [232, 184, 142],
  },
  {
    id: 'lady',
    shirt: [226, 118, 168],
    pants: [226, 222, 214],
    hair: [214, 168, 74],
    skin: [252, 210, 176],
  },
  {
    id: 'jogger',
    shirt: [92, 176, 118],
    pants: [44, 52, 62],
    hair: [30, 26, 24],
    skin: [116, 78, 54],
  },
  {
    id: 'oldman',
    shirt: [198, 194, 182],
    pants: [96, 96, 100],
    hair: [178, 178, 180],
    skin: [238, 202, 172],
  },
  {
    id: 'cop',
    shirt: [56, 72, 116],
    pants: [40, 48, 78],
    hair: [64, 46, 32],
    skin: [250, 202, 156],
  },
];

/** 把一张调色板编译成「原色 → 新色」的替换表 */
export function buildRemap(pal: NpcPalette): Map<string, RGB> {
  const m = new Map<string, RGB>();
  m.set(key(BASE_COLORS.shirt), pal.shirt);
  m.set(key(BASE_COLORS.pants), pal.pants);
  m.set(key(BASE_COLORS.hair), pal.hair);
  m.set(key(BASE_COLORS.skin), pal.skin);
  m.set(key(BASE_COLORS.dark), pal.dark ?? BASE_COLORS.dark);
  return m;
}
