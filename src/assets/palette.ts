/**
 * 全项目统一调色板（单一事实源）
 *
 * 离线的程序化素材生成器（scripts/gen-assets/）和运行时的程序化绘制
 * （src/city/facade.ts）都从这里取色，保证同一套质感。
 *
 * 风格取向：GTA3 那种脏兮兮的 90 年代配色。
 * 改这里 = 全场换肤。
 */
export const PAL = {
  asphaltDark: '#262a2f',
  asphalt: '#363b42',
  asphaltLight: '#474d55',
  concrete: '#6f6a5e',
  sidewalk: '#827c6e',
  curb: '#9a9384',
  grassDark: '#37522b',
  grass: '#4a6c3a',
  grassLight: '#5c8048',
  waterDark: '#1f4763',
  water: '#2b5f80',
  sandDark: '#9c8759',
  sand: '#bfa675',
  roofDark: '#403c35',
  roof: '#565045',
  brick: '#7b4a3c',
  glass: '#7fa6bb',
  outline: '#15171a',
  white: '#f2f0ea',
  hudGreen: '#7edc85',
  hudRed: '#d8493e',
  hudYellow: '#e9c24a',
  /* 金属构件（空调外机、通风管、栏杆） */
  metal: '#5b6169',
  metalDark: '#41464c',
  metalDeep: '#2b2f34',
  /* 招牌底板 */
  signBoard: '#2b2721',
} as const;

/** 明暗调整：amt > 0 变亮，amt < 0 变暗 */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt > 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
