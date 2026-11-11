/**
 * Mộc Café OS - wayfinding on the cafe's 2D floor plan.
 * Units are percentages of the manager's plan, NOT GPS coordinates/metres.
 * A path is shown ONLY when the manager has mapped the entrance, connected
 * the walkable nodes, and explicitly mapped the selected hut's access point.
 */
export type Point = { x: number; y: number };
export type WayNode = Point & { id: string; isEntrance: boolean };
export type WayEdge = { from: string; to: string };
export type WayAccess = { tableId: string; nodeId: string };
export type WayLayout = { nodes: WayNode[]; edges: WayEdge[]; accesses: WayAccess[] };
export type PublicHut = {
  id: string; code: string; name: string; area: string; capacity: number;
  mapX: number | null; mapY: number | null;
};
export type PublicHutMap = { branchName: string; tables: PublicHut[]; layout: WayLayout };
export type HutRoute = { nodes: WayNode[]; approach: WayNode; hut: Point; distanceInPlanUnits: number };

export function shortestHutRoute(layout: WayLayout, hut: PublicHut): HutRoute | null {
  if (!layout?.nodes?.length || !layout.edges || !layout.accesses || hut.mapX == null || hut.mapY == null) return null;
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const entry = layout.nodes.find(n => n.isEntrance);
  const access = layout.accesses.find(a => a.tableId === hut.id);
  if (!entry || !access || !byId.has(access.nodeId)) return null;
  const graph = new Map<string, Array<{ id: string; weight: number }>>();
  for (const n of layout.nodes) graph.set(n.id, []);
  for (const edge of layout.edges) {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    if (!a || !b || a.id === b.id) continue;
    const weight = Math.hypot(a.x - b.x, a.y - b.y);
    graph.get(a.id)!.push({ id: b.id, weight });
    graph.get(b.id)!.push({ id: a.id, weight });
  }
  const dist = new Map<string, number>([[entry.id, 0]]);
  const previous = new Map<string, string>();
  const seen = new Set<string>();
  while (seen.size < layout.nodes.length) {
    let current: string | undefined;
    let minimum = Infinity;
    for (const [id, value] of dist) if (!seen.has(id) && value < minimum) { minimum = value; current = id; }
    if (!current) break;
    if (current === access.nodeId) break;
    seen.add(current);
    for (const next of graph.get(current) ?? []) {
      const candidate = minimum + next.weight;
      if (candidate < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, candidate);
        previous.set(next.id, current);
      }
    }
  }
  if (!dist.has(access.nodeId)) return null;
  const chain: string[] = [access.nodeId];
  while (chain[0] !== entry.id) {
    const predecessor = previous.get(chain[0]);
    if (!predecessor) return null;
    chain.unshift(predecessor);
  }
  const nodes = chain.map(id => byId.get(id)!);
  return { nodes, approach: byId.get(access.nodeId)!, hut: { x: hut.mapX, y: hut.mapY }, distanceInPlanUnits: dist.get(access.nodeId)! };
}

export function routeSvgPoints(nodes: Point[]): string {
  return nodes.map(n => `${n.x},${n.y}`).join(' ');
}
