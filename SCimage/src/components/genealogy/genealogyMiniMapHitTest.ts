import {
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";

export function findGenealogyMiniMapNodeAtPoint(
  nodes: GenealogyLayoutNode[],
  point: { x: number; y: number },
) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (
      point.x >= node.x &&
      point.x <= node.x + GENEALOGY_CARD_WIDTH &&
      point.y >= node.y &&
      point.y <= node.y + GENEALOGY_CARD_HEIGHT
    ) {
      return node;
    }
  }
  return null;
}
