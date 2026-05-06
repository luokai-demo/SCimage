import { computed, type Ref } from "vue";
import type { GenealogyLayout } from "../../utils/genealogyGraph";
import { buildGenealogyMiniMapModel } from "../../utils/genealogyMiniMap";

interface UseGenealogyMiniMapViewOptions {
  layout: Readonly<Ref<GenealogyLayout>>;
  selectedNodeId: Readonly<Ref<string>>;
  bloodlineNodeIds: Readonly<Ref<Set<string>>>;
}

export function useGenealogyMiniMapView(options: UseGenealogyMiniMapViewOptions) {
  const miniMapModel = computed(() => buildGenealogyMiniMapModel(
    options.layout.value,
    options.selectedNodeId.value,
    options.bloodlineNodeIds.value,
  ));
  const viewBox = computed(() => `0 0 ${Math.max(options.layout.value.width, 1)} ${Math.max(options.layout.value.height, 1)}`);
  const statusText = computed(() => (
    miniMapModel.value.isSampled
      ? `${miniMapModel.value.visibleNodeCount}/${miniMapModel.value.totalNodeCount} 节点`
      : `${miniMapModel.value.totalNodeCount} 节点`
  ));

  return {
    miniMapModel,
    statusText,
    viewBox,
  };
}
