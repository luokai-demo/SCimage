import { GENEALOGY_CARD_HEIGHT, GENEALOGY_CARD_WIDTH, type GenealogyLayoutEdge, type GenealogyLayoutNode } from "./genealogyGraph";

export interface GenealogyViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isGenealogyNodeInsideBounds(
  node: Pick<GenealogyLayoutNode, "x" | "y">,
  bounds: GenealogyViewportBounds,
) {
  return (
    node.x + GENEALOGY_CARD_WIDTH >= bounds.left &&
    node.x <= bounds.right &&
    node.y + GENEALOGY_CARD_HEIGHT >= bounds.top &&
    node.y <= bounds.bottom
  );
}

export function genealogyEdgeIntersectsBounds(
  edge: Pick<GenealogyLayoutEdge, "fromX" | "fromY" | "toX" | "toY">,
  bounds: GenealogyViewportBounds,
) {
  const edgeLeft = Math.min(edge.fromX, edge.toX);
  const edgeRight = Math.max(edge.fromX, edge.toX);
  const edgeTop = Math.min(edge.fromY, edge.toY);
  const edgeBottom = Math.max(edge.fromY, edge.toY);
  return (
    edgeRight >= bounds.left &&
    edgeLeft <= bounds.right &&
    edgeBottom >= bounds.top &&
    edgeTop <= bounds.bottom
  );
}
