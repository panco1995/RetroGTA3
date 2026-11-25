import { describe, expect, it } from 'vitest';
import { generateDistrict } from '../city/CityGenerator';
import { buildRoadGraph, chooseNext, dirBetween, laneOffset, lanePoint } from './roadGraph';

const district = generateDistrict();
const graph = buildRoadGraph(district);
const nodes = graph.nodes;

describe('路网图', () => {
  it('节点数 = 纵街数 × 横街数', () => {
    expect(nodes.length).toBe(graph.vs.length * graph.hs.length);
  });

  it('相邻节点只差一个路口', () => {
    for (const n of nodes) {
      for (const i of n.neighbors) {
        const o = nodes[i];
        const d = Math.abs(o.vi - n.vi) + Math.abs(o.hi - n.hi);
        expect(d).toBe(1);
      }
    }
  });

  it('每个节点都在对应的街道交点上', () => {
    for (const n of nodes) {
      expect(n.x).toBe(graph.vs[n.vi].pos);
      expect(n.y).toBe(graph.hs[n.hi].pos);
    }
  });

  it('靠右行驶：东行在南侧、西行在北侧、南行在西侧、北行在东侧', () => {
    const n = nodes.find(
      (x) =>
        x.neighbors.some((i) => nodes[i].vi > x.vi) &&
        x.neighbors.some((i) => nodes[i].vi < x.vi),
    )!;
    const east = nodes[n.neighbors.find((i) => nodes[i].vi > n.vi)!];
    const west = nodes[n.neighbors.find((i) => nodes[i].vi < n.vi)!];
    expect(lanePoint(east, { x: 1, y: 0 }, graph).y).toBeGreaterThan(east.y);
    expect(lanePoint(west, { x: -1, y: 0 }, graph).y).toBeLessThan(west.y);

    const m = nodes.find(
      (x) =>
        x.neighbors.some((i) => nodes[i].hi > x.hi) &&
        x.neighbors.some((i) => nodes[i].hi < x.hi),
    )!;
    const south = nodes[m.neighbors.find((i) => nodes[i].hi > m.hi)!];
    const north = nodes[m.neighbors.find((i) => nodes[i].hi < m.hi)!];
    expect(lanePoint(south, { x: 0, y: 1 }, graph).x).toBeLessThan(south.x);
    expect(lanePoint(north, { x: 0, y: -1 }, graph).x).toBeGreaterThan(north.x);
  });

  it('车道偏移有上下限', () => {
    expect(laneOffset(60)).toBe(30);
    expect(laneOffset(92)).toBeCloseTo(41.4);
    expect(laneOffset(200)).toBe(46);
  });

  it('有别的路可走时不会掉头', () => {
    let rngState = 1;
    const rng = () => {
      rngState = (rngState * 16807) % 2147483647;
      return rngState / 2147483647;
    };
    for (const n of nodes) {
      for (const prev of n.neighbors) {
        if (n.neighbors.length < 2) continue;
        const next = chooseNext(rng, graph, prev, nodes.indexOf(n));
        expect(next).not.toBe(prev);
      }
    }
  });

  it('方向向量只在一条轴上', () => {
    const a = nodes[0];
    const b = nodes[a.neighbors[0]];
    const d = dirBetween(a, b);
    expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1);
  });
});
