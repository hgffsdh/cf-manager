/**
 * Mộc Café OS - tìm đường trên các đoạn lối đi được quản lý vẽ.
 * Các tọa độ là phần trăm trên sơ đồ, KHÔNG PHẢI GPS.
 * Mỗi chòi có thể có tối đa 5 điểm đi qua được quản lý lựa chọn theo thứ tự.
 * Không vẽ đường nếu các điểm chưa nối thông bằng cạnh hợp lệ.
 */
export type Point = { x: number; y: number };
export type WayNode = Point & { id: string; isEntrance: boolean };
export type WayEdge = { from: string; to: string };
export type WayAccess = { tableId: string; nodeId: string };
export type WayWaypoint = { tableId: string; nodeIds: string[] };
export type WayLayout = {
  nodes: WayNode[];
  edges: WayEdge[];
  accesses: WayAccess[];
  waypoints?: WayWaypoint[];
};
export type PublicHut = {
  id: string; code: string; name: string; area: string; capacity: number;
  mapX: number | null; mapY: number | null;
};
export type PublicHutMap = { branchName: string; tables: PublicHut[]; layout: WayLayout };
export type HutRoute = {
  nodes: WayNode[];
  approach: WayNode;
  hut: Point;
  distanceInPlanUnits: number;
  waypoints: WayNode[];
  hasCustomWaypoints: boolean;
};

type Neighbor = { id: string; weight: number };

/** Tìm đường ngắn nhất giữa HAI điểm thuộc mạng lưới. */
function shortestSegment(
  graph: Map<string, Neighbor[]>,
  fromId: string,
  toId: string,
): { ids: string[]; distance: number } | null {
  if (!graph.has(fromId) || !graph.has(toId)) return null;
  if (fromId === toId) return { ids: [fromId], distance: 0 };
  const distance = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  while (true) {
    let current: string | undefined;
    let best = Infinity;
    for (const [id, dist] of distance) {
      if (!visited.has(id) && dist < best) {
        best = dist;
        current = id;
      }
    }
    if (current === undefined) break;
    if (current === toId) break;
    visited.add(current);
    for (const neighbor of graph.get(current) ?? []) {
      const next = best + neighbor.weight;
      if (next < (distance.get(neighbor.id) ?? Infinity)) {
        distance.set(neighbor.id, next);
        previous.set(neighbor.id, current);
      }
    }
  }

  if (!distance.has(toId)) return null;
  const ids = [toId];
  while (ids[0] !== fromId) {
    const parent = previous.get(ids[0]);
    if (!parent) return null;
    ids.unshift(parent);
  }
  return { ids, distance: distance.get(toId)! };
}

/**
 * Cổng -> điểm 1 -> ... -> điểm 5 -> điểm tiếp cận chòi.
 * Từng chặng bắt buộc đi theo các cạnh đã được lưu trong SQL Server.
 * Nếu không đặt điểm trung gian thì dùng đường ngắn nhất như cũ.
 */
export function shortestHutRoute(layout: WayLayout, hut: PublicHut): HutRoute | null {
  if (!layout?.nodes?.length || !layout.edges || !layout.accesses || hut.mapX == null || hut.mapY == null) return null;
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const entrance = layout.nodes.find(n => n.isEntrance);
  const access = layout.accesses.find(a => a.tableId === hut.id);
  if (!entrance || !access || !byId.has(access.nodeId)) return null;

  const waypointIds = layout.waypoints?.find(w => w.tableId === hut.id)?.nodeIds ?? [];
  if (waypointIds.length > 5 || new Set(waypointIds).size !== waypointIds.length ||
      waypointIds.some(id => !byId.has(id))) return null;

  const graph = new Map<string, Neighbor[]>();
  for (const node of layout.nodes) graph.set(node.id, []);
  for (const edge of layout.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b || a.id === b.id) continue;
    const weight = Math.hypot(a.x - b.x, a.y - b.y);
    graph.get(a.id)!.push({ id: b.id, weight });
    graph.get(b.id)!.push({ id: a.id, weight });
  }

  const stops = [entrance.id, ...waypointIds, access.nodeId];
  const pathIds: string[] = [];
  let totalDistance = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const segment = shortestSegment(graph, stops[i], stops[i + 1]);
    if (!segment) return null;
    // Gộp các chặng, bỏ nút đầu trùng nút cuối chặng trước.
    pathIds.push(...(i === 0 ? segment.ids : segment.ids.slice(1)));
    totalDistance += segment.distance;
  }
  return {
    nodes: pathIds.length ? pathIds.map(id => byId.get(id)!) : [entrance],
    approach: byId.get(access.nodeId)!,
    hut: { x: hut.mapX, y: hut.mapY },
    distanceInPlanUnits: totalDistance,
    waypoints: waypointIds.map(id => byId.get(id)!),
    hasCustomWaypoints: waypointIds.length > 0,
  };
}

export function routeSvgPoints(nodes: Point[]): string {
  return nodes.map(n => `${n.x},${n.y}`).join(' ');
}
