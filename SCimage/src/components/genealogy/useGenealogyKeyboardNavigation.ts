import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";

interface UseGenealogyKeyboardNavigationOptions {
  addNodeAsReference: (node: GenealogyLayoutNode) => void | Promise<void>;
  focusNode: (nodeId: string) => void;
  getNode: (nodeId: string) => GenealogyLayoutNode | null | undefined;
  keyboardTargetNodeId: (key: string, nodeId: string) => string;
  previewNode: (node: GenealogyLayoutNode) => void;
  selectNode: (nodeId: string) => void;
}

export function useGenealogyKeyboardNavigation(options: UseGenealogyKeyboardNavigationOptions) {
  function handleNodeKeydown(event: KeyboardEvent, nodeId: string) {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      options.selectNode(nodeId);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const node = options.getNode(nodeId);
      if (node) options.previewNode(node);
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      const node = options.getNode(nodeId);
      if (node) void options.addNodeAsReference(node);
      return;
    }
    const targetNodeId = options.keyboardTargetNodeId(event.key, nodeId);
    if (!targetNodeId) return;
    event.preventDefault();
    options.focusNode(targetNodeId);
  }

  return {
    handleNodeKeydown,
  };
}
