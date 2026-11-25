/**
 * 街区生成器 —— 路网 → 地块 → 建筑
 *
 * 纯数据，不碰 Phaser：所以能单测，也能喂给离线渲染做核对图。
 *
 * 为什么必须运行时生成：建筑的 footprint（位置/宽/深/朝向）是街区的输出，
 * 离线烘焙要求提前枚举所有组合，做不到。立面由 facade-draw 按 footprint 现拼。
 */
import { mulberry32 } from '../core/rng';
import { pickWallHeight } from './facade-draw';

/** 'v' = 南北向街道（沿 y 延伸），'h' = 东西向街道（沿 x 延伸） */
export type Axis = 'v' | 'h';
/** 建筑临街方向：楼在哪一侧、街在哪一边 */
export type Facing = 'n' | 's' | 'e' | 'w';

export interface Street {
  axis: Axis;
  /** 中心线坐标（'v' 看 x，'h' 看 y） */
  pos: number;
  /** 半幅宽（含车道） */
  half: number;
  major: boolean;
  /** 地图边界上的虚拟街：不是真马路，只用来把边缘地块圈出来 */
  edge?: boolean;
}

export interface Building {
  /** footprint 左上角（世界坐标） */
  x: number;
  y: number;
  /** 沿街方向的宽度 */
  w: number;
  /** 垂直临街边的进深 */
  d: number;
  /**
   * 临街方向。null = 街区内侧的楼 —— 俯视只看得见屋顶，没有立面。
   * 街区内侧也得有楼，否则街区看着空荡荡的。
   */
  facing: Facing | null;
  seed: number;
  /** 立面高度（决定叠几层开间） */
  wallH: number;
  roofVariant: number;
}

export interface Lot {
  /** 可建范围（已扣掉马路和人行道） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 这块地朝哪条街建房 */
  facing: Facing;
  buildings: Building[];
}

export interface District {
  bounds: { x: number; y: number; w: number; h: number };
  streets: Street[];
  lots: Lot[];
  spawn: { player: { x: number; y: number }; car: { x: number; y: number } };
  /** 人行道上的落脚点（行人 AI 用） */
  walkers: WalkPoint[];
}

export interface WalkPoint {
  x: number;
  y: number;
  /** 沿人行道走的方向 */
  dir: 1 | -1;
  speed: number;
  /** 这一截人行道的范围（路口之间），行人不会走下马路 */
  minX: number;
  maxX: number;
}

export interface DistrictOptions {
  seed: number;
  /** 地图宽高 */
  width: number;
  height: number;
  /** 纵向街道条数 */
  cols: number;
  /** 横向街道条数 */
  rows: number;
  /** 人行道宽度 */
  sidewalk: number;
  /** 建筑进深上限 */
  depth: number;
  /** 主干道出现概率 */
  majorChance: number;
}

export const DEFAULT_DISTRICT: DistrictOptions = {
  seed: 20241124,
  width: 4200,
  height: 3200,
  cols: 5,
  rows: 4,
  sidewalk: 62,
  depth: 340,
  majorChance: 0.3,
};

/**
 * 街区尺度的下限。
 *
 * 街距必须容得下一栋楼：楼深 340 + 两侧路宽 + 两侧人行道，
 * 所以街距小于这个数，扣完马路和人行道就没地方盖楼了。
 */
const MIN_LOT = 220;
const MIN_DEPTH = 150;

const FACINGS: Facing[] = ['n', 's', 'e', 'w'];

/**
 * 在 [0, span] 里排 count 条街，位置带抖动，避免完美网格。
 *
 * 抖动幅度刻意压得小（±7% 街距）：街距一变，可建范围就跟着变，
 * 抖太狠会出现"某个街区突然塞不下一栋楼"的空洞。
 */
function layoutStreets(
  rng: () => number,
  count: number,
  span: number,
  opts: DistrictOptions,
  axis: Axis,
): Street[] {
  const out: Street[] = [];
  const seg = span / count;
  for (let i = 0; i < count; i++) {
    const jitter = (rng() - 0.5) * seg * 0.14;
    const major = rng() < opts.majorChance;
    out.push({
      axis,
      pos: (i + 0.5) * seg + jitter,
      half: major ? 135 : 92,
      major,
    });
  }
  out.sort((a, b) => a.pos - b.pos);
  return out;
}

/**
 * 把一段沿街长度切成 n 栋楼的宽度。
 * 随机切分而不是等分，宽度自然不整齐。
 */
function splitWidths(total: number, n: number, rng: () => number): number[] {
  const gap = 14;
  const usable = total - gap * (n + 1);
  if (usable < n * 60) return [];
  const raw: number[] = [];
  for (let i = 0; i < n; i++) raw.push(0.6 + rng() * 0.8);
  const sum = raw.reduce((a, b) => a + b, 0);
  const widths = raw.map((r) => (r / sum) * usable);
  // 取整后补齐误差，保证总和不变
  const out = widths.map((w) => Math.round(w));
  const diff = Math.round(usable) - out.reduce((a, b) => a + b, 0);
  out[0] += diff;
  return out;
}

/**
 * 在一块地里建房。
 *
 * 临街那面：一排带立面的楼（facing 非空）。
 * 街区内侧：再补一排只有屋顶的楼 —— 俯视只看得见顶，但从街上看过去
 * 街区是"两层楼深"的，而不是一圈楼中间一个大空院子。
 */
function placeBuildings(lot: Lot, rng: () => number, opts: DistrictOptions, seedBase: number): void {
  const along = lot.facing === 'n' || lot.facing === 's' ? lot.w : lot.h;
  const n = 2 + Math.floor(rng() * 3);
  const widths = splitWidths(along, n, rng);
  if (!widths.length) return;

  const across = lot.facing === 'n' || lot.facing === 's' ? lot.h : lot.w;
  const depth = Math.min(opts.depth, across - 24);
  if (depth < MIN_DEPTH) return;

  let cursor = lot.facing === 'n' || lot.facing === 's' ? lot.x : lot.y;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const seed = (seedBase + i * 2654435761) >>> 0;
    lot.buildings.push(makeBuilding(lot, lot.facing, true, cursor, w, depth, seed, rng));
    cursor += w + 14;
  }

  // 街区内侧那排：只有屋顶，贴在临街那排的对面
  const innerDepth = Math.min(depth * 0.65, across - depth - 20);
  if (innerDepth < 110) return;
  const backWidths = splitWidths(along, Math.max(1, n - 1), rng);
  if (!backWidths.length) return;
  const back = opposite(lot.facing);
  let backCursor = lot.facing === 'n' || lot.facing === 's' ? lot.x : lot.y;
  for (let i = 0; i < backWidths.length; i++) {
    const w = backWidths[i];
    const seed = (seedBase + 0x5f356495 + i * 2654435761) >>> 0;
    lot.buildings.push(makeBuilding(lot, back, false, backCursor, w, innerDepth, seed, rng));
    backCursor += w + 14;
  }
}

/** 街区内侧的楼贴在临街那排的对面 */
function opposite(f: Facing): Facing {
  switch (f) {
    case 'n':
      return 's';
    case 's':
      return 'n';
    case 'e':
      return 'w';
    case 'w':
      return 'e';
  }
}

/**
 * 摆一栋楼。
 * @param side      贴在哪条边（决定位置）
 * @param showFacade 是否画立面（临街的楼画，街区内侧的楼不画）
 */
function makeBuilding(
  lot: Lot,
  side: Facing,
  showFacade: boolean,
  cursor: number,
  w: number,
  depth: number,
  seed: number,
  rng: () => number,
): Building {
  const horizontal = side === 'n' || side === 's';
  const bx = horizontal ? cursor : side === 'e' ? lot.x + lot.w - depth : lot.x;
  const by = horizontal ? (side === 's' ? lot.y + lot.h - depth : lot.y) : cursor;
  return {
    x: bx,
    y: by,
    w: horizontal ? w : depth,
    d: horizontal ? depth : w,
    facing: showFacade ? side : null,
    seed,
    wallH: pickWallHeight(seed),
    roofVariant: Math.floor(rng() * 3),
  };
}

/**
 * 生成一个街区。
 *
 * 路网是"不完美网格"：街道位置带抖动，部分是主干道（更宽）。
 * 相邻街道之间形成地块，每块地沿随机一条边建一排楼 —— 两块地背靠背时
 * 中间自然夹出一条小巷，这正是 GTA3 街区的样子。
 */
export function generateDistrict(opts: Partial<DistrictOptions> = {}): District {
  const o = { ...DEFAULT_DISTRICT, ...opts };
  const rng = mulberry32(o.seed);

  const realVs = layoutStreets(rng, o.cols, o.width, o, 'v');
  const realHs = layoutStreets(rng, o.rows, o.height, o, 'h');

  // 地图边界补两条虚拟街（half=0、不画马路），否则最外圈那一条
  // 「街到地图边界」的地块因为少夹一条街，整片是空地。
  const vs: Street[] = [
    { axis: 'v', pos: 0, half: 0, major: false, edge: true },
    ...realVs,
    { axis: 'v', pos: o.width, half: 0, major: false, edge: true },
  ];
  const hs: Street[] = [
    { axis: 'h', pos: 0, half: 0, major: false, edge: true },
    ...realHs,
    { axis: 'h', pos: o.height, half: 0, major: false, edge: true },
  ];

  const streets: Street[] = [...vs, ...hs];

  const lots: Lot[] = [];
  for (let i = 0; i < vs.length - 1; i++) {
    for (let j = 0; j < hs.length - 1; j++) {
      const left = vs[i];
      const right = vs[i + 1];
      const top = hs[j];
      const bottom = hs[j + 1];
      // 虚拟街没有马路和人行道，地块直接顶到地图边界
      const x0 = left.edge ? left.pos : left.pos + left.half + o.sidewalk;
      const x1 = right.edge ? right.pos : right.pos - right.half - o.sidewalk;
      const y0 = top.edge ? top.pos : top.pos + top.half + o.sidewalk;
      const y1 = bottom.edge ? bottom.pos : bottom.pos - bottom.half - o.sidewalk;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 200 || h < 200) continue;

      // 朝向：地图边界那一侧没有街，不能朝那边开立面
      const allowed = FACINGS.filter(
        (f) =>
          !(left.edge && f === 'w') &&
          !(right.edge && f === 'e') &&
          !(top.edge && f === 'n') &&
          !(bottom.edge && f === 's'),
      );
      const facing = allowed[Math.floor(rng() * allowed.length)];
      const lot: Lot = { x: x0, y: y0, w, h, facing, buildings: [] };
      placeBuildings(lot, rng, o, (o.seed + i * 7919 + j * 104729) >>> 0);
      if (lot.buildings.length) lots.push(lot);
    }
  }

  // 出生点：挑一条横向街道，靠中间的街段。
  // 玩家站在人行道上，车停在同一条街的车道上 —— 两者都在路网里算出来，
  // 不然换个地图大小就出生在马路中间或者地图外面了。
  const midH = realHs[Math.floor(realHs.length / 2)];
  const midV = realVs[Math.floor(realVs.length / 2)];
  const walkY = midH.pos - midH.half - o.sidewalk / 2;
  const roadY = midH.pos - midH.half * 0.72;
  const spawn = {
    player: { x: midV.pos - 40, y: walkY },
    car: { x: midV.pos + 10, y: roadY },
  };

  // 行人落脚点：横向街道两侧的人行道。
  // 人行道被纵向街道切断，所以按「路口之间的每一截」放人 ——
  // 行人只在自己那一截来回走，不会横穿马路。
  const walkers: WalkPoint[] = [];
  const walkRng = mulberry32(o.seed ^ 0x27d4eb2f);
  const cuts = realVs.map((v) => [v.pos - v.half, v.pos + v.half] as [number, number]);
  const segs: [number, number][] = [];
  {
    let cursor = 0;
    for (const [c0, c1] of cuts) {
      if (c0 > cursor) segs.push([cursor, c0]);
      cursor = Math.max(cursor, c1);
    }
    if (cursor < o.width) segs.push([cursor, o.width]);
  }

  for (const s of realHs) {
    for (const side of [-1, 1]) {
      const y = s.pos + side * (s.half + o.sidewalk / 2);
      for (const [a, b] of segs) {
        if (b - a < 160) continue;
        if (walkRng() > 0.62) continue;
        const minX = a + 26;
        const maxX = b - 26;
        walkers.push({
          x: minX + walkRng() * (maxX - minX),
          y,
          dir: walkRng() > 0.5 ? 1 : -1,
          speed: 24 + walkRng() * 24,
          minX,
          maxX,
        });
      }
    }
  }

  const bounds = {
    x: 0,
    y: 0,
    w: o.width,
    h: o.height,
  };

  return { bounds, streets, lots, spawn, walkers };
}

/**
 * 某点是否在马路上（含路口）。人行道 / 后院 / 地块都算「路外」。
 * 用于路缘石减速：开上路肩会被地面拖慢。
 */
export function isOnRoad(d: District, x: number, y: number, margin = 0): boolean {
  for (const s of d.streets) {
    if (s.edge) continue;
    if (s.axis === 'v') {
      if (Math.abs(x - s.pos) <= s.half + margin) return true;
    } else if (Math.abs(y - s.pos) <= s.half + margin) {
      return true;
    }
  }
  return false;
}

/** 某栋楼在临街边上的立面贴图该放哪、怎么转 */
export interface FacadePlacement {
  /** 贴图中心（世界坐标） */
  x: number;
  y: number;
  /** 顺时针弧度 */
  rotation: number;
  /** 是否上下翻转 */
  flipY: boolean;
}

/**
 * 立面贴图贴在楼的临街边上。
 *
 * 贴图约定：上=檐口（靠楼顶），下=店面（贴人行道）。
 *   's' 街在楼下 → 原样
 *   'n' 街在楼上 → 上下翻转
 *   'e' 街在右 → 顺时针 -90°，店面朝右、檐口朝楼内
 *   'w' 街在左 → 顺时针 +90°，店面朝左、檐口朝楼内
 */
export function facadePlacement(b: Building): FacadePlacement {
  const f = b.facing;
  if (!f) throw new Error('这栋楼没有立面（街区内侧），不需要 facadePlacement');
  switch (f) {
    case 's':
      return { x: b.x + b.w / 2, y: b.y + b.d, rotation: 0, flipY: false };
    case 'n':
      return { x: b.x + b.w / 2, y: b.y, rotation: 0, flipY: true };
    case 'e':
      return { x: b.x + b.w, y: b.y + b.d / 2, rotation: -Math.PI / 2, flipY: false };
    case 'w':
      return { x: b.x, y: b.y + b.d / 2, rotation: Math.PI / 2, flipY: false };
  }
}
