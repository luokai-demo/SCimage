import { computed } from "vue";
import type { useGenealogyStore } from "../../stores/genealogy";
import type { JobSummary } from "../../stores/jobs";
import {
  buildGenealogyLayout,
  filterGenealogyFamilies,
  genealogyImageUrl,
} from "../../utils/genealogyGraph";
import { projectPendingGenealogyJobs } from "../../utils/genealogyPending";

type GenealogyStore = ReturnType<typeof useGenealogyStore>;

export function useGenealogyGraphView(options: {
  genealogyStore: GenealogyStore;
  jobs: { value: JobSummary[] };
}) {
  const filteredFamilies = computed(() => filterGenealogyFamilies(
    options.genealogyStore.families,
    options.genealogyStore.query,
  ));
  const activeFamily = computed(() => options.genealogyStore.activeFamily);
  const baseLayout = computed(() => buildGenealogyLayout(
    options.genealogyStore.activeRootId,
    options.genealogyStore.nodes,
    options.genealogyStore.edges,
    options.genealogyStore.activePositions,
  ));
  const pendingProjection = computed(() => projectPendingGenealogyJobs(
    options.jobs.value,
    options.genealogyStore.nodes,
    options.genealogyStore.edges,
    baseLayout.value,
  ));
  const graphNodesWithPending = computed(() => [
    ...options.genealogyStore.nodes,
    ...pendingProjection.value.nodes,
  ]);
  const graphNodeById = computed(() => new Map(graphNodesWithPending.value.map((node) => [node.id, node])));
  const selectedNode = computed(() => graphNodeById.value.get(options.genealogyStore.selectedNodeId) || null);
  const graphEdgesWithPending = computed(() => [
    ...options.genealogyStore.edges,
    ...pendingProjection.value.edges,
  ]);
  const graphPositionsWithPending = computed(() => ({
    ...options.genealogyStore.activePositions,
    ...pendingProjection.value.positions,
  }));
  const layout = computed(() => buildGenealogyLayout(
    options.genealogyStore.activeRootId,
    graphNodesWithPending.value,
    graphEdgesWithPending.value,
    graphPositionsWithPending.value,
  ));
  const selectedLayoutNode = computed(() => layout.value.nodes.find((node) => node.id === options.genealogyStore.selectedNodeId) || null);
  const selectedImageUrl = computed(() => genealogyImageUrl(selectedNode.value));
  const generatedImageCountByJobId = computed(() => {
    const counts = new Map<string, number>();
    graphNodesWithPending.value.forEach((node) => {
      if (node.type !== "generated" || !node.job_id) return;
      counts.set(node.job_id, (counts.get(node.job_id) || 0) + 1);
    });
    return counts;
  });
  const summaryText = computed(() => {
    if (options.genealogyStore.loading) return "正在同步族谱";
    if (!options.genealogyStore.families.length) return "还没有图生图族谱";
    const imageCount = options.genealogyStore.families.reduce((sum, family) => sum + family.image_count, 0);
    return `${options.genealogyStore.families.length} 棵族谱 · ${imageCount} 张图片`;
  });

  return {
    activeFamily,
    filteredFamilies,
    generatedImageCountByJobId,
    graphNodesWithPending,
    layout,
    selectedImageUrl,
    selectedLayoutNode,
    selectedNode,
    summaryText,
  };
}
