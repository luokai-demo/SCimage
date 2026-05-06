import { computed, type Ref } from "vue";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import { createGenealogyNodeViewModel } from "./genealogyNodeViewModel";

export function useGenealogyNodeCardView(
  node: Ref<GenealogyLayoutNode>,
  parentCount: Ref<number>,
) {
  const viewModel = computed(() => createGenealogyNodeViewModel(node.value, parentCount.value));

  return {
    badgeText: computed(() => viewModel.value.badgeText),
    sourceCountText: computed(() => viewModel.value.sourceCountText),
    statusLabel: computed(() => viewModel.value.statusLabel),
    subtitle: computed(() => viewModel.value.subtitle),
    title: computed(() => viewModel.value.title),
    viewModel,
    workflowLabel: computed(() => viewModel.value.workflowLabel),
  };
}
