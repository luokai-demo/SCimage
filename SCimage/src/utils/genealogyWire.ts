export interface GenealogyWireNode {
  x: number;
  y: number;
}

export interface GenealogyWireEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const GENEALOGY_NODE_PORT_SIZE = 10;
export const GENEALOGY_NODE_PORT_TOP = 42;
export const GENEALOGY_NODE_PORT_OFFSET = -GENEALOGY_NODE_PORT_SIZE / 2;
const GENEALOGY_NODE_BORDER_WIDTH = 1;
export const GENEALOGY_NODE_PORT_CENTER_Y = GENEALOGY_NODE_BORDER_WIDTH + GENEALOGY_NODE_PORT_TOP + GENEALOGY_NODE_PORT_SIZE / 2;
const WIRE_TENSION_MIN = 76;
const WIRE_TENSION_MAX = 168;

export function genealogyEdgeAnchors(
  from: GenealogyWireNode,
  to: GenealogyWireNode,
  nodeWidth: number,
) {
  return {
    fromX: from.x + nodeWidth,
    fromY: from.y + GENEALOGY_NODE_PORT_CENTER_Y,
    toX: to.x,
    toY: to.y + GENEALOGY_NODE_PORT_CENTER_Y,
  };
}

export function genealogyEdgePath(edge: GenealogyWireEdge) {
  const deltaX = edge.toX - edge.fromX;
  const horizontalTension = Math.max(
    WIRE_TENSION_MIN,
    Math.min(WIRE_TENSION_MAX, Math.abs(deltaX) * 0.55),
  );
  const fromControlX = edge.fromX + horizontalTension;
  const toControlX = edge.toX - horizontalTension;
  return `M ${edge.fromX} ${edge.fromY} C ${fromControlX} ${edge.fromY}, ${toControlX} ${edge.toY}, ${edge.toX} ${edge.toY}`;
}
