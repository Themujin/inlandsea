import RBush from "rbush";
import { closestOnSegmentToOrigin, haversineM, makeProjection } from "./projection";
import type { LonLat } from "./types";

/**
 * Compact road network (public/geo/roads.json, built by scripts/geo/build-roads.ts).
 * Edges inside the shore warning band are already removed, so any road route is legal.
 */
export interface RoadData {
  osmBase: string;
  /** Vertex coordinates, flat [lon, lat, lon, lat, …]. */
  v: number[];
  /** Per edge, flat [a, b, oneway(0|1), …]: oneway means a → b only. */
  e: number[];
  /** Per edge length, metres. */
  len: number[];
  /** Per edge cost factor (lower = preferred). */
  cost: number[];
  /** Per edge interior geometry, flat [lon, lat, …] (endpoints excluded). */
  g: number[][];
}

interface SegBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  edge: number;
  seg: number;
}

export interface RoadGraph {
  data: RoadData;
  nodes: number;
  /** CSR adjacency: neighbours of u are adjEdge[adjStart[u] .. adjStart[u+1]). */
  adjStart: Int32Array;
  adjEdge: Int32Array;
  index: RBush<SegBox>;
  minCost: number;
}

export interface RoadRoute {
  /** Full path: you → nearest track → … → track nearest the pin → pin. */
  coords: LonLat[];
  /** Off-road legs at either end, metres. */
  accessM: number;
  egressM: number;
  /** Length on roads and tracks, metres. */
  roadM: number;
  totalM: number;
  /** Where the route joins and leaves the road network. */
  join: LonLat;
  leave: LonLat;
}

const vert = (d: RoadData, i: number): LonLat => [d.v[2 * i], d.v[2 * i + 1]];

/** Full polyline of an edge, a → b. */
function edgeCoords(d: RoadData, edge: number): LonLat[] {
  const g = d.g[edge];
  const mid: LonLat[] = [];
  for (let i = 0; i < g.length; i += 2) mid.push([g[i], g[i + 1]]);
  return [vert(d, d.e[3 * edge]), ...mid, vert(d, d.e[3 * edge + 1])];
}

const pathLength = (c: LonLat[]) => c.slice(1).reduce((s, p, i) => s + haversineM(c[i], p), 0);

export function buildRoadGraph(data: RoadData): RoadGraph {
  const nodes = data.v.length / 2;
  const edges = data.len.length;
  const degree = new Int32Array(nodes + 1);
  for (let k = 0; k < edges; k++) {
    degree[data.e[3 * k]]++;
    degree[data.e[3 * k + 1]]++;
  }
  const adjStart = new Int32Array(nodes + 1);
  for (let u = 0; u < nodes; u++) adjStart[u + 1] = adjStart[u] + degree[u];
  const fill = adjStart.slice(0, nodes);
  const adjEdge = new Int32Array(adjStart[nodes]);
  for (let k = 0; k < edges; k++) {
    adjEdge[fill[data.e[3 * k]]++] = k;
    adjEdge[fill[data.e[3 * k + 1]]++] = k;
  }

  const boxes: SegBox[] = [];
  for (let k = 0; k < edges; k++) {
    const c = edgeCoords(data, k);
    for (let s = 0; s < c.length - 1; s++) {
      const [a, b] = [c[s], c[s + 1]];
      boxes.push({
        minX: Math.min(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxX: Math.max(a[0], b[0]),
        maxY: Math.max(a[1], b[1]),
        edge: k,
        seg: s,
      });
    }
  }
  const index = new RBush<SegBox>();
  index.load(boxes);
  return { data, nodes, adjStart, adjEdge, index, minCost: Math.min(...data.cost) };
}

interface Snap {
  edge: number;
  seg: number;
  point: LonLat;
  distanceM: number;
  /** Distance along the edge from vertex a to the snapped point, metres. */
  alongM: number;
}

/** Nearest point on any road within maxM, or null. */
export function snapToRoad(graph: RoadGraph, p: LonLat, maxM: number): Snap | null {
  const proj = makeProjection(p[0], p[1]);
  const maxDeg = maxM / 111_000 / Math.cos((p[1] * Math.PI) / 180);
  let best: Snap | null = null;
  // Grow the search box until something is found or the snap limit is covered.
  for (let d = Math.min(0.005, maxDeg); ; d = Math.min(d * 4, maxDeg)) {
    for (const box of graph.index.search({ minX: p[0] - d, minY: p[1] - d, maxX: p[0] + d, maxY: p[1] + d })) {
      const c = edgeCoords(graph.data, box.edge);
      const [ax, ay] = proj.toXY(c[box.seg]);
      const [bx, by] = proj.toXY(c[box.seg + 1]);
      const [cx, cy] = closestOnSegmentToOrigin(ax, ay, bx, by);
      const dist = Math.hypot(cx, cy);
      if (dist <= maxM && (!best || dist < best.distanceM)) {
        const point = proj.toLonLat(cx, cy);
        best = {
          edge: box.edge,
          seg: box.seg,
          point,
          distanceM: dist,
          alongM: pathLength(c.slice(0, box.seg + 1)) + haversineM(c[box.seg], point),
        };
      }
    }
    if (best || d >= maxDeg) break;
  }
  return best;
}

/** Binary min-heap of node ids keyed by priority. */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= ids.length) break;
        const c = l + 1 < ids.length && keys[l + 1] < keys[l] ? l + 1 : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

/** A virtual link touching a snapped point: geometry and cost, used instead of a whole edge. */
interface Link {
  to: number;
  cost: number;
  coords: LonLat[];
}

/**
 * Route from `from` to `to` over the road network (A*). Both ends snap to the nearest road
 * within maxSnapM; returns null when either end is too far from any road or no route exists.
 */
export function routeOnRoads(graph: RoadGraph, from: LonLat, to: LonLat, maxSnapM = 5000): RoadRoute | null {
  const { data } = graph;
  const s = snapToRoad(graph, from, maxSnapM);
  const t = snapToRoad(graph, to, maxSnapM);
  if (!s || !t) return null;

  const S = graph.nodes; // virtual start
  const T = graph.nodes + 1; // virtual target
  const extra = new Map<number, Link[]>();
  const addLink = (u: number, link: Link) => {
    const list = extra.get(u) ?? [];
    list.push(link);
    extra.set(u, list);
  };

  const split = (snap: Snap) => {
    const c = edgeCoords(data, snap.edge);
    const toA = [snap.point, ...c.slice(0, snap.seg + 1).reverse()];
    const toB = [snap.point, ...c.slice(snap.seg + 1)];
    return { c, toA, toB, a: data.e[3 * snap.edge], b: data.e[3 * snap.edge + 1], oneway: data.e[3 * snap.edge + 2] === 1 };
  };

  // Start: leave the snapped point towards b (always) and towards a (unless oneway a → b).
  const ss = split(s);
  const sf = data.cost[s.edge];
  addLink(S, { to: ss.b, cost: (data.len[s.edge] - s.alongM) * sf, coords: ss.toB });
  if (!ss.oneway) addLink(S, { to: ss.a, cost: s.alongM * sf, coords: ss.toA });

  // Target: arrive from a (always) and from b (unless oneway).
  const ts = split(t);
  const tf = data.cost[t.edge];
  addLink(ts.a, { to: T, cost: t.alongM * tf, coords: [...ts.toA].reverse() });
  if (!ts.oneway) addLink(ts.b, { to: T, cost: (data.len[t.edge] - t.alongM) * tf, coords: [...ts.toB].reverse() });

  // Both on the same edge: go straight along it if direction allows.
  if (s.edge === t.edge && (!ss.oneway || t.alongM >= s.alongM)) {
    const c = ss.c;
    const [lo, hi] = s.alongM <= t.alongM ? [s, t] : [t, s];
    const mid = c.slice(lo.seg + 1, hi.seg + 1);
    const forward = [lo.point, ...mid, hi.point];
    addLink(S, {
      to: T,
      cost: Math.abs(t.alongM - s.alongM) * sf,
      coords: s.alongM <= t.alongM ? forward : forward.reverse(),
    });
  }

  const n = graph.nodes + 2;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  /** How we reached a node: edge id ≥ 0, or -(1 + link index) for virtual links. */
  const via = new Int32Array(n);
  const links: Link[] = [];
  // Admissible heuristic: straight-line distance at the cheapest cost factor.
  const h = (u: number) => (u === T ? 0 : haversineM(u === S ? from : vert(data, u), to) * graph.minCost);

  const heap = new Heap();
  dist[S] = 0;
  heap.push(S, h(S));
  const done = new Uint8Array(n);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === T) break;
    const relax = (w: number, cost: number, how: number) => {
      const nd = dist[u] + cost;
      if (nd < dist[w]) {
        dist[w] = nd;
        prev[w] = u;
        via[w] = how;
        heap.push(w, nd + h(w));
      }
    };
    for (const link of extra.get(u) ?? []) {
      links.push(link);
      relax(link.to, link.cost, -links.length);
    }
    if (u < graph.nodes) {
      for (let i = graph.adjStart[u]; i < graph.adjStart[u + 1]; i++) {
        const k = graph.adjEdge[i];
        const a = data.e[3 * k];
        const b = data.e[3 * k + 1];
        if (u === b && data.e[3 * k + 2] === 1) continue; // oneway a → b
        relax(u === a ? b : a, data.len[k] * data.cost[k], k);
      }
    }
  }
  if (dist[T] === Infinity) return null;

  // Walk back from T, stitching geometry.
  const parts: LonLat[][] = [];
  for (let w = T; w !== S; w = prev[w]) {
    const how = via[w];
    if (how < 0) parts.push(links[-how - 1].coords);
    else {
      const c = edgeCoords(data, how);
      parts.push(data.e[3 * how] === prev[w] ? c : [...c].reverse());
    }
  }
  const road: LonLat[] = [];
  for (const part of parts.reverse()) road.push(...(road.length ? part.slice(1) : part));

  const roadM = pathLength(road);
  return {
    coords: [from, ...road, to],
    accessM: s.distanceM,
    egressM: t.distanceM,
    roadM,
    totalM: s.distanceM + roadM + t.distanceM,
    join: s.point,
    leave: t.point,
  };
}
