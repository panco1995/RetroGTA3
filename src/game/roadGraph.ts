/**
 * 路网图 —— 纯数据，不依赖 Phaser。
 *
 * 街区生成器给的是「一组横街 + 一组纵街」，这里把它们变成
 * 交叉点图：节点 = 路口，边 = 两个路口之间的街段。
 * 交通 AI 只在这张图上走，所以永远不会开进楼里。
 *
 * 车道靠右行驶：东行贴南侧、西行贴北侧、南行贴西侧、北行贴东侧。
 */
import type { District, Street } from '../city/CityGenerator';

export interface GraphNode {
  /** 纵街下标 */
  vi: number;
  /** 横街下标 */
  hi: number;
  x: number;
  y: number;
  /** 相邻路口在 nodes 里的下标 */
  neighbors: number[];
}

export interface RoadGraph {
  vs: Street[];
  hs: Street[];
  nodes: GraphNode[];
}

export interface Dir {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/** 车道中心离路中线的距离。路越宽，车道越靠外，但有上下限。 */
export function laneOffset(half: number): number {
  return Math.max(30, Math.min(46, half * 0.45));
}

export function buildRoadGraph(district: District): RoadGraph {
  const vs = district.streets
    .filter((s) => s.axis === 'v' && !s.edge)
    .sort((a, b) => a.pos - b.pos);
  const hs = district.streets
    .filter((s) => s.axis === 'h' && !s.edge)
    .sort((a, b) => a.pos - b.pos);

  const nodes: GraphNode[] = [];
  const idx = (vi: number, hi: number) => vi * hs.length + hi;

  for (let vi = 0; vi < vs.length; vi++) {
    for (let hi = 0; hi < hs.length; hi++) {
      nodes.push({ vi, hi, x: vs[vi].pos, y: hs[hi].pos, neighbors: [] });
    }
  }

  for (let vi = 0; vi < vs.length; vi++) {
    for (let hi = 0; hi < hs.length; hi++) {
      const n = nodes[idx(vi, hi)];
      if (vi > 0) n.neighbors.push(idx(vi - 1, hi));
      if (vi < vs.length - 1) n.neighbors.push(idx(vi + 1, hi));
      if (hi > 0) n.neighbors.push(idx(vi, hi - 1));
      if (hi < hs.length - 1) n.neighbors.push(idx(vi, hi + 1));
    }
  }

  return { vs, hs, nodes };
}

/** 从 a 到 b 的行驶方向（两节点必须相邻） */
export function dirBetween(a: GraphNode, b: GraphNode): Dir {
  if (b.vi > a.vi) return { x: 1, y: 0 };
  if (b.vi < a.vi) return { x: -1, y: 0 };
  if (b.hi > a.hi) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

/**
 * 路口节点在某个行驶方向上的车道点。
 * 例：东行到节点 → 停在路口南侧（右手边）的车道上。
 */
export function lanePoint(
  node: GraphNode,
  dir: Dir,
  graph: RoadGraph,
): { x: number; y: number } {
  if (dir.y === 0) {
    const lane = laneOffset(graph.hs[node.hi].half);
    return { x: node.x, y: node.y + (dir.x > 0 ? lane : -lane) };
  }
  const lane = laneOffset(graph.vs[node.vi].half);
  return { x: node.x + (dir.y > 0 ? -lane : lane), y: node.y };
}

/**
 * 到路口后选下一条边。
 *
 * 直行权重最高，右转次之，左转最少 —— 这样车流看起来有目的性，
 * 不会在每个路口都乱拐。没有别的路可走时才掉头。
 */
export function chooseNext(
  rng: () => number,
  graph: RoadGraph,
  prev: number,
  node: number,
): number {
  const n = graph.nodes[node];
  const options = n.neighbors.filter((i) => i !== prev);
  if (!options.length) return prev;

  const incoming = dirBetween(graph.nodes[prev], n);
  const weighted = options.map((i) => {
    const d = dirBetween(n, graph.nodes[i]);
    const straight = d.x === incoming.x && d.y === incoming.y;
    // 屏幕坐标 y 向下：叉积 > 0 = 顺时针 = 右转
    const cross = incoming.x * d.y - incoming.y * d.x;
    const weight = straight ? 0.6 : cross > 0 ? 0.25 : 0.15;
    return { i, weight };
  });

  const total = weighted.reduce((s, o) => s + o.weight, 0);
  let r = rng() * total;
  for (const o of weighted) {
    r -= o.weight;
    if (r <= 0) return o.i;
  }
  return weighted[weighted.length - 1].i;
}
